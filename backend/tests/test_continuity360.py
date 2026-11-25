"""
Automated tests for the CONTINUITY360 backend (unittest - built into Python).

Run from the backend folder:
    python -m unittest discover -s tests -v

The tests use a temporary copy of the data file, so your real data.json is untouched.
"""

import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import date
from http.server import ThreadingHTTPServer

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

import report  # noqa: E402
import risk_engine  # noqa: E402
import server  # noqa: E402
import simulation  # noqa: E402
import storage  # noqa: E402
import validation  # noqa: E402

server.Handler.log_message = lambda *args: None  # keep test output clean
TEMP_DIR = tempfile.mkdtemp()
storage.set_data_file(os.path.join(TEMP_DIR, "data.json"))


def fresh_data():
    storage.reset_to_sample()
    return storage.load()


# ---------------------------------------------------------------------------
class RiskEngineTests(unittest.TestCase):
    def test_levels(self):
        cases = {(1, 1): "Low", (2, 2): "Low", (1, 5): "Medium", (3, 3): "Medium",
                 (2, 5): "High", (3, 4): "High", (3, 5): "Critical", (5, 5): "Critical"}
        for (l, i), level in cases.items():
            self.assertEqual(risk_engine.risk_level(risk_engine.risk_score(l, i)), level, (l, i))

    def test_heatmap_shape_and_counts(self):
        data = fresh_data()
        heat = risk_engine.build_heatmap(data["risks"])
        self.assertEqual(len(heat["rows"]), 5)
        self.assertTrue(all(len(r["cells"]) == 5 for r in heat["rows"]))
        self.assertEqual(heat["rows"][0]["likelihood"], 5)  # top row is "almost certain"
        total = sum(len(c["risks"]) for r in heat["rows"] for c in r["cells"])
        self.assertEqual(total, len(data["risks"]))
        self.assertEqual(sum(heat["counts"].values()), len(data["risks"]))
        ransomware_cell = heat["rows"][1]["cells"][4]  # likelihood 4, impact 5
        self.assertIn("R-001", [r["id"] for r in ransomware_cell["risks"]])
        self.assertEqual(ransomware_cell["level"], "Critical")


# ---------------------------------------------------------------------------
class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.ids = ["P-001", "P-002"]

    def good_process(self, **extra):
        base = {"name": "Billing", "department": "Finance", "owner": "Asha", "criticality": "High",
                "max_downtime_hours": 8, "hourly_loss": 1000, "systems": "ERP, Bank API", "dependencies": ["P-001"]}
        base.update(extra)
        return base

    def test_valid_process(self):
        cleaned = validation.clean_process(self.good_process(), self.ids)
        self.assertEqual(cleaned["systems"], ["ERP", "Bank API"])

    def test_process_errors(self):
        bad = [
            ({"name": ""}, "required"),
            ({"criticality": "Huge"}, "Criticality"),
            ({"max_downtime_hours": "abc"}, "number"),
            ({"max_downtime_hours": 0}, "between"),
            ({"dependencies": ["P-999"]}, "unknown"),
        ]
        for extra, message in bad:
            with self.assertRaises(validation.ValidationError) as ctx:
                validation.clean_process(self.good_process(**extra), self.ids)
            self.assertIn(message, str(ctx.exception))

    def test_process_cannot_depend_on_itself(self):
        with self.assertRaises(validation.ValidationError):
            validation.clean_process(self.good_process(dependencies=["P-001"]), self.ids, own_id="P-001")

    def test_risk_rules(self):
        risk = {"name": "Fire", "threat_type": "Natural Disaster", "likelihood": 2, "impact": 5, "process_ids": ["P-001"]}
        self.assertEqual(validation.clean_risk(risk, self.ids)["impact"], 5)
        for extra in ({"likelihood": 6}, {"likelihood": 2.5}, {"threat_type": "Aliens"}, {"process_ids": []}):
            with self.assertRaises(validation.ValidationError):
                validation.clean_risk({**risk, **extra}, self.ids)

    def test_plan_rules(self):
        plan = {"process_id": "P-001", "rto_hours": 2, "rpo_hours": 1, "strategy": "Failover", "steps": ["a", " "],
                "team": "IT", "status": "Approved", "last_tested": ""}
        self.assertEqual(validation.clean_plan(plan, self.ids)["steps"], ["a"])
        for extra in ({"steps": []}, {"status": "Tested"}, {"last_tested": "21-11-2026"},
                      {"last_tested": "2999-01-01"}, {"rto_hours": -1}):
            with self.assertRaises(validation.ValidationError):
                validation.clean_plan({**plan, **extra}, self.ids)


# ---------------------------------------------------------------------------
class SimulationTests(unittest.TestCase):
    def setUp(self):
        self.data = fresh_data()

    def test_dependencies_are_followed(self):
        # Flooding hits Warehouse Dispatch + Inventory; Online Orders depend on Inventory
        result = simulation.run_simulation(self.data, risk_id="R-008", duration_hours=10)
        impact = {r["process_id"]: r["impact_type"] for r in result["results"]}
        self.assertEqual(impact["P-007"], "Direct")
        self.assertEqual(impact["P-004"], "Direct")
        self.assertTrue(impact["P-001"].startswith("Indirect"))

    def test_priority_order_and_status(self):
        result = simulation.run_simulation(self.data, risk_id="R-008", duration_hours=100)
        names = [r["name"] for r in result["results"]]
        self.assertEqual(result["results"][0]["criticality"], "Critical")
        self.assertEqual(result["results"][0]["priority"], "P1")
        dispatch = next(r for r in result["results"] if r["name"] == "Warehouse Dispatch")
        self.assertEqual(dispatch["status"], "No plan – tolerance exceeded")
        self.assertEqual(dispatch["estimated_loss"], 80000 * 100)
        self.assertEqual(result["summary"]["affected"], len(names))

    def test_plan_limits_downtime(self):
        result = simulation.run_simulation(self.data, risk_id="R-005", duration_hours=10)
        payment = next(r for r in result["results"] if r["process_id"] == "P-002")
        self.assertEqual(payment["expected_downtime_hours"], 1)  # RTO is 1 hour
        self.assertTrue(payment["ok"])

    def test_threat_type_scenario(self):
        result = simulation.run_simulation(self.data, threat_type="Cyberattack", duration_hours=6)
        self.assertEqual(len(result["risks"]), 3)
        self.assertGreater(result["summary"]["indirect"], 0)

    def test_errors(self):
        with self.assertRaises(simulation.SimulationError):
            simulation.run_simulation(self.data, duration_hours=5)
        with self.assertRaises(simulation.SimulationError):
            simulation.run_simulation(self.data, risk_id="R-404", duration_hours=5)
        with self.assertRaises(simulation.SimulationError):
            simulation.run_simulation(self.data, threat_type="Cyberattack", duration_hours=0)


# ---------------------------------------------------------------------------
class ReportTests(unittest.TestCase):
    def test_readiness_numbers(self):
        data = fresh_data()
        ready = report.readiness(data, today=date(2026, 11, 21))
        names = {c["name"]: c["score"] for c in ready["components"]}
        self.assertEqual(names["Plan coverage"], 70)   # 7 of 10
        self.assertEqual(names["RTO alignment"], 86)   # payroll RTO 96h > 72h
        self.assertEqual(ready["score"], round(sum(names.values()) / 4))

    def test_report_contents(self):
        data = fresh_data()
        rep = report.build_report(data, today=date(2026, 11, 21))
        gap_text = " ".join(g["text"] for g in rep["gaps"])
        self.assertIn("Warehouse Dispatch", gap_text)
        self.assertIn("Flooding at main warehouse", gap_text)
        self.assertIn("OVERALL READINESS", rep["text"])
        self.assertEqual(rep["gaps"][0]["severity"], "High")


# ---------------------------------------------------------------------------
class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def setUp(self):
        storage.reset_to_sample()

    def call(self, method, path, payload=None, raw=None):
        data = raw if raw is not None else (json.dumps(payload).encode() if payload is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read())

    def test_read_endpoints(self):
        for path in ["/api/meta", "/api/dashboard", "/api/processes", "/api/risks", "/api/plans",
                     "/api/heatmap", "/api/report", "/api/simulations"]:
            status, body = self.call("GET", path)
            self.assertEqual(status, 200, path)
        status, dash = self.call("GET", "/api/dashboard")
        self.assertEqual(dash["totals"], {"processes": 10, "risks": 13, "critical_risks": 2, "plans": 7})

    def test_process_crud_and_cascade(self):
        status, created = self.call("POST", "/api/processes", {
            "name": "Billing", "department": "Finance", "owner": "Asha", "criticality": "High",
            "max_downtime_hours": 8, "hourly_loss": 1000, "systems": ["ERP"], "dependencies": []})
        self.assertEqual((status, created["id"]), (201, "P-011"))
        status, updated = self.call("PUT", "/api/processes/P-011", {**created, "criticality": "Critical"})
        self.assertEqual(updated["criticality"], "Critical")

        # Deleting a process removes its plan, risk links and dependencies
        status, _ = self.call("DELETE", "/api/processes/P-010")
        self.assertEqual(status, 200)
        data = storage.load()
        self.assertFalse(any(p["process_id"] == "P-010" for p in data["plans"]))
        self.assertFalse(any("P-010" in r["process_ids"] for r in data["risks"]))
        self.assertFalse(any("P-010" in p["dependencies"] for p in data["processes"]))

    def test_risk_create_is_scored(self):
        status, risk = self.call("POST", "/api/risks", {
            "name": "Lift failure", "threat_type": "Server Failure", "likelihood": 5, "impact": 4,
            "process_ids": ["P-001"]})
        self.assertEqual(status, 201)
        _, risks = self.call("GET", "/api/risks")
        saved = next(r for r in risks["risks"] if r["id"] == risk["id"])
        self.assertEqual((saved["score"], saved["level"]), (20, "Critical"))

    def test_plan_duplicate_rejected(self):
        status, body = self.call("POST", "/api/plans", {
            "process_id": "P-001", "rto_hours": 1, "rpo_hours": 1, "strategy": "x", "steps": ["y"],
            "team": "IT", "status": "Draft"})
        self.assertEqual(status, 400)
        self.assertIn("already has a recovery plan", body["error"])
        status, _ = self.call("POST", "/api/plans", {
            "process_id": "P-007", "rto_hours": 6, "rpo_hours": 2, "strategy": "Use backup warehouse",
            "steps": ["Move stock"], "team": "Logistics", "status": "Draft"})
        self.assertEqual(status, 201)

    def test_simulation_saved_in_history(self):
        status, sim = self.call("POST", "/api/simulate", {"threat_type": "Power Outage", "duration_hours": 12})
        self.assertEqual(status, 200)
        _, hist = self.call("GET", "/api/simulations")
        self.assertEqual(hist["simulations"][0]["id"], sim["id"])

    def test_errors(self):
        cases = [
            ("POST", "/api/processes", {"name": ""}, 400),
            ("PUT", "/api/processes/P-999", {}, 404),
            ("DELETE", "/api/risks/R-999", None, 404),
            ("POST", "/api/simulate", {"duration_hours": 5}, 400),
            ("GET", "/api/nothing", None, 404),
        ]
        for method, path, payload, expected in cases:
            status, body = self.call(method, path, payload)
            self.assertEqual(status, expected, (method, path))
            self.assertIn("error", body)
        status, _ = self.call("POST", "/api/risks", raw=b"{not json")
        self.assertEqual(status, 400)

    def test_reset_and_corrupt_file_recovery(self):
        self.call("DELETE", "/api/processes/P-001")
        self.call("POST", "/api/reset")
        _, procs = self.call("GET", "/api/processes")
        self.assertEqual(len(procs["processes"]), 10)
        with open(storage.DATA_FILE, "w") as f:
            f.write("{broken")
        status, dash = self.call("GET", "/api/dashboard")
        self.assertEqual(status, 200)  # server restores sample data instead of crashing


if __name__ == "__main__":
    unittest.main()
