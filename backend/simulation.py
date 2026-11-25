"""
simulation.py - Incident simulation.

The user picks a disruption (one risk from the register, or a whole threat type)
and an outage duration. We then work out:

  * Directly affected processes  - linked to the chosen risk(s)
  * Indirectly affected processes - processes that depend on an affected process
  * For each process: expected downtime, estimated loss, whether recovery is
    within the maximum tolerable downtime, and a recovery priority (P1, P2 ...)
"""

from datetime import datetime

from risk_engine import LEVEL_ORDER, enrich_risk

MAX_SAVED_SIMULATIONS = 10


class SimulationError(ValueError):
    pass


def _affected_processes(direct_ids, processes):
    """Return {process_id: "Direct" or "Indirect (via X)"} following dependencies."""
    by_id = {p["id"]: p for p in processes}
    affected = {pid: "Direct" for pid in direct_ids if pid in by_id}
    changed = True
    while changed:  # keep going until no new process is added (handles chains)
        changed = False
        for process in processes:
            if process["id"] in affected:
                continue
            failed = [d for d in process.get("dependencies", []) if d in affected]
            if failed:
                names = ", ".join(by_id[d]["name"] for d in failed)
                affected[process["id"]] = f"Indirect (depends on {names})"
                changed = True
    return affected


def run_simulation(data, risk_id=None, threat_type=None, duration_hours=None):
    try:
        duration = float(duration_hours)
    except (TypeError, ValueError):
        raise SimulationError("Outage duration must be a number of hours.")
    if not 0.5 <= duration <= 720:
        raise SimulationError("Outage duration must be between 0.5 and 720 hours.")

    if risk_id:
        risks = [r for r in data["risks"] if r["id"] == risk_id]
        if not risks:
            raise SimulationError("The selected risk was not found.")
        scenario = risks[0]["name"]
    elif threat_type:
        risks = [r for r in data["risks"] if r["threat_type"] == threat_type]
        if not risks:
            raise SimulationError(f"No risks of type '{threat_type}' are in the risk register.")
        scenario = f"{threat_type} (all {len(risks)} related risks)"
    else:
        raise SimulationError("Choose a risk or a threat type to simulate.")

    direct_ids = []
    for risk in risks:
        direct_ids.extend(risk["process_ids"])
    affected = _affected_processes(dict.fromkeys(direct_ids), data["processes"])
    plans_by_process = {plan["process_id"]: plan for plan in data["plans"]}

    results = []
    for process in data["processes"]:
        if process["id"] not in affected:
            continue
        plan = plans_by_process.get(process["id"])
        tolerance = process["max_downtime_hours"]
        downtime = min(duration, plan["rto_hours"]) if plan else duration
        ok = downtime <= tolerance
        if plan:
            status = "Recoverable within tolerance" if ok else "Tolerance exceeded – RTO too long"
        else:
            status = "No plan – within tolerance" if ok else "No plan – tolerance exceeded"
        results.append({
            "process_id": process["id"],
            "name": process["name"],
            "department": process["department"],
            "criticality": process["criticality"],
            "impact_type": affected[process["id"]],
            "max_downtime_hours": tolerance,
            "expected_downtime_hours": round(downtime, 2),
            "estimated_loss": round(process["hourly_loss"] * downtime),
            "dependents": sum(1 for p in data["processes"]
                              if p["id"] in affected and process["id"] in p.get("dependencies", [])),
            "status": status,
            "ok": ok,
            "plan": None if not plan else {
                "id": plan["id"], "rto_hours": plan["rto_hours"], "rpo_hours": plan["rpo_hours"],
                "team": plan["team"], "strategy": plan["strategy"], "steps": plan["steps"],
            },
        })

    # Recovery priority: most critical first, then shortest tolerable downtime,
    # then processes that other affected processes depend on, then direct before indirect.
    results.sort(key=lambda r: (-LEVEL_ORDER[r["criticality"]], r["max_downtime_hours"], -r["dependents"],
                                0 if r["impact_type"] == "Direct" else 1, r["name"]))
    for number, item in enumerate(results, start=1):
        item["priority"] = f"P{number}"

    summary = {
        "affected": len(results),
        "direct": sum(1 for r in results if r["impact_type"] == "Direct"),
        "indirect": sum(1 for r in results if r["impact_type"] != "Direct"),
        "critical_processes": sum(1 for r in results if r["criticality"] == "Critical"),
        "without_plan": sum(1 for r in results if r["plan"] is None),
        "at_risk": sum(1 for r in results if not r["ok"]),
        "total_estimated_loss": sum(r["estimated_loss"] for r in results),
    }
    simulation = {
        "id": datetime.now().strftime("SIM-%Y%m%d%H%M%S%f")[:-3],
        "run_at": datetime.now().isoformat(timespec="seconds"),
        "scenario": scenario,
        "duration_hours": duration,
        "risks": [enrich_risk(r) for r in risks],
        "summary": summary,
        "results": results,
    }
    return simulation


def save_simulation(data, simulation):
    """Keep a short history (without the bulky details) in the JSON file."""
    history_item = {k: simulation[k] for k in ("id", "run_at", "scenario", "duration_hours", "summary")}
    data["simulations"].insert(0, history_item)
    del data["simulations"][MAX_SAVED_SIMULATIONS:]
