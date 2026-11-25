"""
validation.py - Checks the data sent from the browser before it is saved.
Each function returns a clean dictionary or raises ValidationError with a
message that can be shown directly to the user.
"""

from datetime import date

CRITICALITY_LEVELS = ["Critical", "High", "Medium", "Low"]
THREAT_TYPES = ["Cyberattack", "Server Failure", "Power Outage", "Natural Disaster",
                "Network Outage", "Human Error", "Supply Chain"]
PLAN_STATUSES = ["Draft", "Approved", "Tested"]


class ValidationError(ValueError):
    pass


def _text(data, field, label, required=True, max_len=300):
    value = data.get(field, "")
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValidationError(f"{label} must be text.")
    value = value.strip()
    if required and not value:
        raise ValidationError(f"{label} is required.")
    if len(value) > max_len:
        raise ValidationError(f"{label} must be at most {max_len} characters.")
    return value


def _number(data, field, label, minimum, maximum, integer=False):
    value = data.get(field)
    if value in (None, ""):
        raise ValidationError(f"{label} is required.")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{label} must be a number.")
    if integer:
        if number != int(number):
            raise ValidationError(f"{label} must be a whole number.")
        number = int(number)
    if not minimum <= number <= maximum:
        raise ValidationError(f"{label} must be between {minimum} and {maximum}.")
    return number


def _choice(data, field, label, options):
    value = data.get(field)
    if value not in options:
        raise ValidationError(f"{label} must be one of: {', '.join(options)}.")
    return value


def _id_list(data, field, label, valid_ids):
    value = data.get(field) or []
    if not isinstance(value, list):
        raise ValidationError(f"{label} must be a list.")
    unknown = [v for v in value if v not in valid_ids]
    if unknown:
        raise ValidationError(f"{label} contains unknown items: {', '.join(map(str, unknown))}.")
    return list(dict.fromkeys(value))  # remove duplicates, keep order


def _string_list(data, field, label, max_items=20):
    value = data.get(field) or []
    if isinstance(value, str):
        value = [v for v in value.split(",")]
    if not isinstance(value, list):
        raise ValidationError(f"{label} must be a list.")
    cleaned = [str(v).strip() for v in value if str(v).strip()]
    if len(cleaned) > max_items:
        raise ValidationError(f"{label} can have at most {max_items} items.")
    return cleaned


def clean_process(data, all_process_ids, own_id=None):
    cleaned = {
        "name": _text(data, "name", "Process name", max_len=100),
        "department": _text(data, "department", "Department", max_len=60),
        "owner": _text(data, "owner", "Process owner", max_len=60),
        "criticality": _choice(data, "criticality", "Criticality", CRITICALITY_LEVELS),
        "description": _text(data, "description", "Description", required=False, max_len=500),
        "systems": _string_list(data, "systems", "Supporting systems"),
        "max_downtime_hours": _number(data, "max_downtime_hours", "Maximum tolerable downtime (hours)", 0.5, 8760),
        "hourly_loss": _number(data, "hourly_loss", "Estimated loss per hour", 0, 10**10),
    }
    deps = _id_list(data, "dependencies", "Dependencies", set(all_process_ids))
    if own_id and own_id in deps:
        raise ValidationError("A process cannot depend on itself.")
    cleaned["dependencies"] = deps
    return cleaned


def clean_risk(data, all_process_ids):
    cleaned = {
        "name": _text(data, "name", "Risk name", max_len=100),
        "threat_type": _choice(data, "threat_type", "Threat type", THREAT_TYPES),
        "description": _text(data, "description", "Description", required=False, max_len=500),
        "likelihood": _number(data, "likelihood", "Likelihood", 1, 5, integer=True),
        "impact": _number(data, "impact", "Impact", 1, 5, integer=True),
        "mitigation": _text(data, "mitigation", "Mitigation", required=False, max_len=500),
        "owner": _text(data, "owner", "Risk owner", required=False, max_len=60),
        "process_ids": _id_list(data, "process_ids", "Affected processes", set(all_process_ids)),
    }
    if not cleaned["process_ids"]:
        raise ValidationError("Select at least one affected business process.")
    return cleaned


def clean_plan(data, all_process_ids):
    cleaned = {
        "process_id": _choice(data, "process_id", "Business process", list(all_process_ids)),
        "rto_hours": _number(data, "rto_hours", "RTO (hours)", 0, 8760),
        "rpo_hours": _number(data, "rpo_hours", "RPO (hours)", 0, 8760),
        "strategy": _text(data, "strategy", "Recovery strategy", max_len=300),
        "steps": _string_list(data, "steps", "Recovery steps", max_items=15),
        "team": _text(data, "team", "Responsible team", max_len=80),
        "contact": _text(data, "contact", "Contact", required=False, max_len=100),
        "status": _choice(data, "status", "Status", PLAN_STATUSES),
        "last_tested": _text(data, "last_tested", "Last tested date", required=False, max_len=10),
    }
    if not cleaned["steps"]:
        raise ValidationError("Add at least one recovery step.")
    if cleaned["last_tested"]:
        try:
            tested = date.fromisoformat(cleaned["last_tested"])
        except ValueError:
            raise ValidationError("Last tested date must be in YYYY-MM-DD format.")
        if tested > date.today():
            raise ValidationError("Last tested date cannot be in the future.")
    if cleaned["status"] == "Tested" and not cleaned["last_tested"]:
        raise ValidationError("A plan marked 'Tested' needs a last tested date.")
    return cleaned
