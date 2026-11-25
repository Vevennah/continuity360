"""
server.py - CONTINUITY360 backend (Python standard library only).

Run:  python server.py     then open http://localhost:8000

API (JSON):
  GET    /api/meta                       dropdown options (levels, threat types ...)
  GET    /api/dashboard                  dashboard numbers
  GET    /api/processes                  list processes
  POST   /api/processes                  add a process
  PUT    /api/processes/<id>             update a process
  DELETE /api/processes/<id>             delete a process (and its plan / links)
  GET|POST /api/risks,  PUT|DELETE /api/risks/<id>
  GET|POST /api/plans,  PUT|DELETE /api/plans/<id>
  GET    /api/heatmap                    5x5 likelihood/impact grid
  POST   /api/simulate                   {"risk_id"} or {"threat_type"}, "duration_hours"
  GET    /api/simulations                recent simulations
  GET    /api/report                     readiness report (JSON + text)
  POST   /api/reset                      restore the sample data

Every other path serves the built React app from frontend/dist.
"""

import json
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import report
import storage
from risk_engine import IMPACT_LABELS, LIKELIHOOD_LABELS, build_heatmap, enrich_risks
from simulation import SimulationError, run_simulation, save_simulation
from validation import (CRITICALITY_LEVELS, PLAN_STATUSES, THREAT_TYPES, ValidationError,
                        clean_plan, clean_process, clean_risk)

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.join(os.path.dirname(BACKEND_DIR), "frontend", "dist")
MAX_BODY = 100 * 1024


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


# ---------------------------------------------------------------------------
# Business logic for each collection
# ---------------------------------------------------------------------------
def list_items(data, collection):
    if collection == "risks":
        return enrich_risks(data["risks"], data["processes"])
    if collection == "plans":
        names = {p["id"]: p for p in data["processes"]}
        result = []
        for plan in data["plans"]:
            process = names.get(plan["process_id"], {})
            result.append({**plan, "process_name": process.get("name", "Unknown"),
                           "criticality": process.get("criticality"),
                           "max_downtime_hours": process.get("max_downtime_hours"),
                           "tested_recently": report.plan_tested_recently(plan)})
        return result
    return data[collection]


def clean(data, collection, body, item_id=None):
    process_ids = [p["id"] for p in data["processes"]]
    if collection == "processes":
        return clean_process(body, process_ids, own_id=item_id)
    if collection == "risks":
        return clean_risk(body, process_ids)
    cleaned = clean_plan(body, process_ids)
    duplicate = [p for p in data["plans"] if p["process_id"] == cleaned["process_id"] and p["id"] != item_id]
    if duplicate:
        raise ValidationError("This process already has a recovery plan. Edit the existing plan instead.")
    return cleaned


def delete_item(data, collection, item_id):
    items = data[collection]
    item = storage.find(items, item_id)
    if not item:
        raise ApiError(404, "Item not found.")
    items.remove(item)
    if collection == "processes":
        # Keep the data consistent: remove links to the deleted process
        data["plans"] = [p for p in data["plans"] if p["process_id"] != item_id]
        for risk in data["risks"]:
            risk["process_ids"] = [pid for pid in risk["process_ids"] if pid != item_id]
        for process in data["processes"]:
            process["dependencies"] = [d for d in process.get("dependencies", []) if d != item_id]


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "CONTINUITY360/1.0"

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            raise ApiError(400, "Invalid Content-Length.")
        if length > MAX_BODY:
            raise ApiError(413, "Request is too large.")
        if length == 0:
            return {}
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise ApiError(400, "Request body is not valid JSON.")
        if not isinstance(body, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        return body

    def log_message(self, fmt, *args):
        sys.stdout.write("[C360] %s\n" % (fmt % args))

    def do_GET(self):
        self.dispatch("GET")

    def do_POST(self):
        self.dispatch("POST")

    def do_PUT(self):
        self.dispatch("PUT")

    def do_DELETE(self):
        self.dispatch("DELETE")

    def dispatch(self, method):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if not path.startswith("/api/"):
            if method == "GET":
                return self.serve_static(path)
            return self.send_json({"error": "Not found."}, 404)
        try:
            status, payload = self.route(method, path)
            self.send_json(payload, status)
        except ApiError as error:
            self.send_json({"error": error.message}, error.status)
        except (ValidationError, SimulationError) as error:
            self.send_json({"error": str(error)}, 400)
        except Exception as error:  # never crash the server
            print(f"[C360] Unexpected error: {error!r}")
            self.send_json({"error": "Unexpected server error. See the backend console."}, 500)

    def route(self, method, path):
        parts = path.strip("/").split("/")  # e.g. ["api", "processes", "P-001"]
        resource = parts[1] if len(parts) > 1 else ""
        item_id = parts[2] if len(parts) > 2 else None

        if method == "GET" and resource == "meta":
            return 200, {"criticality_levels": CRITICALITY_LEVELS, "threat_types": THREAT_TYPES,
                         "plan_statuses": PLAN_STATUSES, "likelihood_labels": LIKELIHOOD_LABELS,
                         "impact_labels": IMPACT_LABELS}

        data = storage.load()

        if method == "GET" and resource == "dashboard":
            return 200, report.dashboard(data)
        if method == "GET" and resource == "heatmap":
            return 200, build_heatmap(data["risks"])
        if method == "GET" and resource == "report":
            return 200, report.build_report(data)
        if method == "GET" and resource == "simulations":
            return 200, {"simulations": data["simulations"]}

        if method == "POST" and resource == "simulate":
            body = self.read_json()
            result = run_simulation(data, body.get("risk_id"), body.get("threat_type"), body.get("duration_hours"))
            save_simulation(data, result)
            storage.save(data)
            return 200, result

        if method == "POST" and resource == "reset":
            storage.reset_to_sample()
            return 200, {"message": "Sample data restored."}

        if resource in ("processes", "risks", "plans"):
            return self.crud(method, data, resource, item_id)

        raise ApiError(404, "Unknown API endpoint.")

    def crud(self, method, data, collection, item_id):
        if method == "GET" and not item_id:
            return 200, {collection: list_items(data, collection)}
        if method == "GET":
            item = storage.find(data[collection], item_id)
            if not item:
                raise ApiError(404, "Item not found.")
            return 200, item
        if method == "POST" and not item_id:
            cleaned = clean(data, collection, self.read_json())
            item = {"id": storage.next_id(data[collection], collection), **cleaned}
            data[collection].append(item)
            storage.save(data)
            return 201, item
        if method == "PUT" and item_id:
            item = storage.find(data[collection], item_id)
            if not item:
                raise ApiError(404, "Item not found.")
            item.update(clean(data, collection, self.read_json(), item_id))
            storage.save(data)
            return 200, item
        if method == "DELETE" and item_id:
            delete_item(data, collection, item_id)
            storage.save(data)
            return 200, {"deleted": item_id}
        raise ApiError(405, "Method not allowed.")

    def serve_static(self, path):
        if not os.path.isdir(FRONTEND_DIST):
            body = b"Frontend not built yet. Run: cd frontend && npm install && npm run build"
            self.send_response(503)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        root = os.path.realpath(FRONTEND_DIST)
        target = os.path.realpath(os.path.join(root, path.lstrip("/") or "index.html"))
        if not target.startswith(root) or not os.path.isfile(target):
            target = os.path.join(root, "index.html")
        with open(target, "rb") as handle:
            body = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(target)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(os.environ.get("PORT", "8000"))
    storage.load()  # creates data.json from the sample data on first run
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"CONTINUITY360 running at http://localhost:{port}")
    print(f"Data file: {storage.DATA_FILE}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
