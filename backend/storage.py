"""
storage.py - Simple local JSON storage (no database).

All data lives in backend/data/data.json. The first time the server runs,
that file is created as a copy of backend/data/sample_data.json so the
dashboard is populated immediately. "Reset sample data" copies it again.
"""

import json
import os
import shutil
import threading

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
SAMPLE_FILE = os.path.join(DATA_DIR, "sample_data.json")

# Tests point this at a temporary file through an environment variable
DATA_FILE = os.environ.get("C360_DATA_FILE", os.path.join(DATA_DIR, "data.json"))

COLLECTIONS = ("processes", "risks", "plans", "simulations")
ID_PREFIX = {"processes": "P", "risks": "R", "plans": "RP"}

_lock = threading.RLock()  # the web server handles requests in threads


def set_data_file(path):
    global DATA_FILE
    DATA_FILE = path


def reset_to_sample():
    with _lock:
        shutil.copyfile(SAMPLE_FILE, DATA_FILE)


def load():
    with _lock:
        if not os.path.exists(DATA_FILE):
            reset_to_sample()
        try:
            with open(DATA_FILE, encoding="utf-8") as handle:
                data = json.load(handle)
        except (ValueError, OSError):
            # A damaged file should not crash the app: keep a copy and start again
            if os.path.exists(DATA_FILE):
                shutil.copyfile(DATA_FILE, DATA_FILE + ".broken")
            reset_to_sample()
            with open(DATA_FILE, encoding="utf-8") as handle:
                data = json.load(handle)
        for name in COLLECTIONS:
            data.setdefault(name, [])
        return data


def save(data):
    """Write to a temporary file first, then replace, so a crash never leaves half a file."""
    with _lock:
        temp = DATA_FILE + ".tmp"
        with open(temp, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2, ensure_ascii=False)
        os.replace(temp, DATA_FILE)


def next_id(items, collection):
    prefix = ID_PREFIX[collection]
    numbers = [int(item["id"].split("-")[-1]) for item in items
               if item.get("id", "").startswith(prefix + "-") and item["id"].split("-")[-1].isdigit()]
    return f"{prefix}-{(max(numbers) + 1) if numbers else 1:03d}"


def find(items, item_id):
    for item in items:
        if item["id"] == item_id:
            return item
    return None
