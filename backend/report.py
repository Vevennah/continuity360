"""
report.py - Dashboard numbers and the Business Continuity Readiness Report.

Readiness score (0-100) is the average of four simple checks:
  1. Plan coverage       - % of business processes that have a recovery plan
  2. Plan testing        - % of plans tested in the last 12 months
  3. Risk mitigation     - % of High/Critical risks with a documented mitigation
  4. RTO alignment       - % of plans whose RTO is within the process's
                           maximum tolerable downtime
"""

from collections import Counter
from datetime import date, datetime, timedelta

from risk_engine import LEVEL_ORDER, enrich_risks
from validation import CRITICALITY_LEVELS, THREAT_TYPES

TEST_VALID_DAYS = 365


def _percent(part, whole):
    return round(100 * part / whole) if whole else 100


def plan_tested_recently(plan, today=None):
    today = today or date.today()
    if not plan.get("last_tested"):
        return False
    try:
        tested = date.fromisoformat(plan["last_tested"])
    except ValueError:
        return False
    return today - tested <= timedelta(days=TEST_VALID_DAYS)


def readiness(data, today=None):
    processes, plans = data["processes"], data["plans"]
    risks = enrich_risks(data["risks"], processes)
    plan_by_process = {p["process_id"]: p for p in plans}
    process_by_id = {p["id"]: p for p in processes}

    covered = [p for p in processes if p["id"] in plan_by_process]
    tested = [p for p in plans if plan_tested_recently(p, today)]
    serious = [r for r in risks if r["level"] in ("High", "Critical")]
    mitigated = [r for r in serious if r.get("mitigation", "").strip()]
    aligned = [p for p in plans if p["process_id"] in process_by_id
               and p["rto_hours"] <= process_by_id[p["process_id"]]["max_downtime_hours"]]

    components = [
        {"name": "Plan coverage", "score": _percent(len(covered), len(processes)),
         "detail": f"{len(covered)} of {len(processes)} processes have a recovery plan"},
        {"name": "Plan testing", "score": _percent(len(tested), len(plans)),
         "detail": f"{len(tested)} of {len(plans)} plans tested in the last 12 months"},
        {"name": "Risk mitigation", "score": _percent(len(mitigated), len(serious)),
         "detail": f"{len(mitigated)} of {len(serious)} High/Critical risks have a mitigation"},
        {"name": "RTO alignment", "score": _percent(len(aligned), len(plans)),
         "detail": f"{len(aligned)} of {len(plans)} plans recover within tolerable downtime"},
    ]
    score = round(sum(c["score"] for c in components) / len(components))
    if score >= 80:
        rating = "Strong"
    elif score >= 60:
        rating = "Moderate"
    else:
        rating = "Needs improvement"
    return {"score": score, "rating": rating, "components": components}


def dashboard(data):
    processes, plans = data["processes"], data["plans"]
    risks = enrich_risks(data["risks"], processes)
    planned_ids = {p["process_id"] for p in plans}
    level_counts = Counter(r["level"] for r in risks)
    threat_counts = Counter(r["threat_type"] for r in risks)
    criticality_counts = Counter(p["criticality"] for p in processes)

    return {
        "company": data.get("company", ""),
        "totals": {
            "processes": len(processes),
            "risks": len(risks),
            "critical_risks": level_counts.get("Critical", 0),
            "plans": len(plans),
        },
        "readiness": readiness(data),
        "risks_by_level": {lvl: level_counts.get(lvl, 0) for lvl in ["Critical", "High", "Medium", "Low"]},
        "risks_by_threat": [{"threat_type": t, "count": threat_counts.get(t, 0)} for t in THREAT_TYPES],
        "processes_by_criticality": {c: criticality_counts.get(c, 0) for c in CRITICALITY_LEVELS},
        "top_risks": risks[:5],
        "unplanned_processes": [
            {"id": p["id"], "name": p["name"], "criticality": p["criticality"]}
            for p in sorted(processes, key=lambda p: -LEVEL_ORDER[p["criticality"]])
            if p["id"] not in planned_ids
        ],
        "recent_simulations": data.get("simulations", [])[:3],
    }


def build_report(data, today=None):
    today = today or date.today()
    processes, plans = data["processes"], data["plans"]
    risks = enrich_risks(data["risks"], processes)
    plan_by_process = {p["process_id"]: p for p in plans}
    ready = readiness(data, today)

    process_rows = []
    for p in sorted(processes, key=lambda p: (-LEVEL_ORDER[p["criticality"]], p["name"])):
        plan = plan_by_process.get(p["id"])
        process_rows.append({
            "id": p["id"], "name": p["name"], "criticality": p["criticality"],
            "max_downtime_hours": p["max_downtime_hours"],
            "has_plan": bool(plan),
            "rto_hours": plan["rto_hours"] if plan else None,
            "rpo_hours": plan["rpo_hours"] if plan else None,
            "rto_aligned": bool(plan) and plan["rto_hours"] <= p["max_downtime_hours"],
            "plan_status": plan["status"] if plan else "Missing",
            "last_tested": (plan or {}).get("last_tested") or None,
            "tested_recently": bool(plan) and plan_tested_recently(plan, today),
            "team": plan["team"] if plan else None,
        })

    # ---- gaps found (most serious first) ----
    gaps = []
    for row in process_rows:
        if not row["has_plan"]:
            sev = "High" if row["criticality"] in ("Critical", "High") else "Medium"
            gaps.append({"severity": sev, "text": f"{row['criticality']} process '{row['name']}' has no recovery plan."})
        else:
            if not row["rto_aligned"]:
                gaps.append({"severity": "High", "text": f"'{row['name']}' RTO ({row['rto_hours']} h) is longer than its "
                                                       f"maximum tolerable downtime ({row['max_downtime_hours']} h)."})
            if not row["tested_recently"]:
                when = f"last tested {row['last_tested']}" if row["last_tested"] else "never tested"
                gaps.append({"severity": "Medium", "text": f"Recovery plan for '{row['name']}' is {when}."})
    for r in risks:
        if r["level"] in ("High", "Critical") and not r.get("mitigation", "").strip():
            gaps.append({"severity": "High", "text": f"{r['level']} risk '{r['name']}' has no mitigation documented."})
    gaps.sort(key=lambda g: -LEVEL_ORDER[g["severity"]])

    # ---- recommendations ----
    recs = []
    if any(not r["has_plan"] for r in process_rows):
        recs.append("Create recovery plans for every process without one, starting with Critical and High processes.")
    if any(r["has_plan"] and not r["tested_recently"] for r in process_rows):
        recs.append("Schedule a tabletop or failover test for every plan not tested in the last 12 months.")
    if any(r["has_plan"] and not r["rto_aligned"] for r in process_rows):
        recs.append("Reduce the RTO of misaligned plans (faster recovery strategy) or review the tolerable downtime.")
    if any(r["level"] in ("High", "Critical") and not r.get("mitigation", "").strip() for r in risks):
        recs.append("Document and implement mitigation controls for all High and Critical risks.")
    if any(r["level"] == "Critical" for r in risks):
        recs.append("Review Critical risks monthly with management and track mitigation progress.")
    recs.append("Keep offline backups, an updated contact list and run at least one incident simulation per quarter.")

    level_counts = Counter(r["level"] for r in risks)
    report = {
        "title": "Business Continuity Readiness Report",
        "company": data.get("company", ""),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "readiness": ready,
        "summary": {
            "processes": len(processes),
            "critical_processes": sum(1 for p in processes if p["criticality"] == "Critical"),
            "risks": len(risks),
            "risks_by_level": {lvl: level_counts.get(lvl, 0) for lvl in ["Critical", "High", "Medium", "Low"]},
            "plans": len(plans),
            "simulations_run": len(data.get("simulations", [])),
        },
        "processes": process_rows,
        "top_risks": [r for r in risks if r["level"] in ("Critical", "High")],
        "gaps": gaps,
        "recommendations": recs,
    }
    report["text"] = report_as_text(report)
    return report


def report_as_text(r):
    """Plain-text version used for the 'Download report' button."""
    s = r["summary"]
    lines = [
        "CONTINUITY360 - " + r["title"].upper(),
        f"Organisation : {r['company']}",
        f"Generated    : {r['generated_at'].replace('T', ' ')}",
        "",
        f"OVERALL READINESS: {r['readiness']['score']}/100 ({r['readiness']['rating']})",
    ]
    lines += [f"  - {c['name']}: {c['score']}% ({c['detail']})" for c in r["readiness"]["components"]]
    lines += [
        "",
        "SUMMARY",
        f"  Business processes : {s['processes']} ({s['critical_processes']} critical)",
        f"  Identified risks   : {s['risks']} (Critical {s['risks_by_level']['Critical']}, High "
        f"{s['risks_by_level']['High']}, Medium {s['risks_by_level']['Medium']}, Low {s['risks_by_level']['Low']})",
        f"  Recovery plans     : {s['plans']}",
        f"  Simulations run    : {s['simulations_run']}",
        "",
        "PROCESS RECOVERY STATUS",
    ]
    for p in r["processes"]:
        rto = f"RTO {p['rto_hours']}h / RPO {p['rpo_hours']}h" if p["has_plan"] else "NO PLAN"
        lines.append(f"  [{p['criticality']:<8}] {p['name']:<32} {rto:<22} tolerance {p['max_downtime_hours']}h  "
                     f"status {p['plan_status']}")
    lines += ["", "HIGH AND CRITICAL RISKS"]
    for risk in r["top_risks"]:
        lines.append(f"  [{risk['level']:<8}] {risk['name']} (score {risk['score']}, {risk['threat_type']})")
    lines += ["", "GAPS IDENTIFIED"]
    lines += [f"  ({g['severity']}) {g['text']}" for g in r["gaps"]] or ["  None"]
    lines += ["", "RECOMMENDATIONS"]
    lines += [f"  {i}. {rec}" for i, rec in enumerate(r["recommendations"], start=1)]
    return "\n".join(lines)
