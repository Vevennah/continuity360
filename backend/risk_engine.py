"""
risk_engine.py - Risk scoring and the heatmap.

Risk score = Likelihood (1-5) x Impact (1-5), giving 1 to 25.
    1 - 4   Low
    5 - 9   Medium
   10 - 14  High
   15 - 25  Critical
"""

LIKELIHOOD_LABELS = {1: "Rare", 2: "Unlikely", 3: "Possible", 4: "Likely", 5: "Almost certain"}
IMPACT_LABELS = {1: "Minimal", 2: "Minor", 3: "Moderate", 4: "Major", 5: "Severe"}
LEVEL_ORDER = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}


def risk_score(likelihood, impact):
    return int(likelihood) * int(impact)


def risk_level(score):
    if score >= 15:
        return "Critical"
    if score >= 10:
        return "High"
    if score >= 5:
        return "Medium"
    return "Low"


def enrich_risk(risk, processes_by_id=None):
    """Return a copy of the risk with its score, level and process names added."""
    score = risk_score(risk["likelihood"], risk["impact"])
    result = dict(risk)
    result["score"] = score
    result["level"] = risk_level(score)
    if processes_by_id is not None:
        result["process_names"] = [processes_by_id[pid]["name"] for pid in risk["process_ids"]
                                   if pid in processes_by_id]
    return result


def enrich_risks(risks, processes):
    by_id = {p["id"]: p for p in processes}
    enriched = [enrich_risk(r, by_id) for r in risks]
    enriched.sort(key=lambda r: (-r["score"], r["id"]))
    return enriched


def build_heatmap(risks):
    """5x5 grid. rows = likelihood 5..1 (top to bottom), columns = impact 1..5."""
    rows = []
    for likelihood in range(5, 0, -1):
        cells = []
        for impact in range(1, 6):
            score = risk_score(likelihood, impact)
            in_cell = [r for r in risks if r["likelihood"] == likelihood and r["impact"] == impact]
            cells.append({
                "likelihood": likelihood,
                "impact": impact,
                "score": score,
                "level": risk_level(score),
                "risks": [{"id": r["id"], "name": r["name"], "threat_type": r["threat_type"]} for r in in_cell],
            })
        rows.append({"likelihood": likelihood, "label": LIKELIHOOD_LABELS[likelihood], "cells": cells})

    counts = {level: 0 for level in LEVEL_ORDER}
    for r in risks:
        counts[risk_level(risk_score(r["likelihood"], r["impact"]))] += 1
    return {"rows": rows, "impact_labels": IMPACT_LABELS, "counts": counts}
