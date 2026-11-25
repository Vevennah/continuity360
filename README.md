# CONTINUITY360 – Business Continuity and Disaster Recovery Planner

CONTINUITY360 is a college cybersecurity project for planning business continuity (BC) and
disaster recovery (DR). It lets an organisation list its important business processes and
assess risks such as cyberattacks, server failures, power outages and natural disasters.
It shows those risks on a heatmap and lets you define recovery plans with RTO and RPO.
You can simulate incidents and generate a readiness report.

It opens with sample data for a fictional company, **NimbusMart Retail**, so the dashboard
has data in it straight away.

| Part     | Technology |
|----------|-----------|
| Frontend | React 19 + JavaScript (JSX) + CSS, bundled with esbuild. No chart or UI libraries are used; the charts are drawn with SVG and CSS. |
| Backend  | Python 3 standard library only (`http.server`, `json`, `datetime`, `unittest`). No Flask, Django or FastAPI. |
| Storage  | A local JSON file (`backend/data/data.json`). No database. |
| AI       | None. All scoring and analysis are simple, explainable rules. |

---

## Features

| # | Module | What it does |
|---|--------|--------------|
| 1 | **Dashboard** | Shows totals for business processes, identified risks, critical risks and recovery plans. Also shows the readiness score gauge, a donut chart of risks by level, a bar chart of risks by threat type, the top risks, processes without a plan and recent simulations. |
| 2 | **Business Processes** | Add, edit, search, filter and delete business operations. Each process has a department, owner, criticality, supporting systems, maximum tolerable downtime, loss per hour and the processes it depends on. |
| 3 | **Risk Assessment** | A risk register with likelihood and impact sliders (1–5 each). The **score** is likelihood × impact and is shown live as you move the sliders. Threat types are Cyberattack, Server Failure, Power Outage, Natural Disaster, Network Outage, Human Error and Supply Chain. |
| 4 | **Risk Heatmap** | A 5×5 likelihood × impact matrix coloured **Low / Medium / High / Critical**, with the number of risks in each cell. Click a cell to see its risks. |
| 5 | **Recovery Planning** | One plan per process, with **RTO**, **RPO**, a strategy, ordered recovery steps, the responsible team, a contact, a status (Draft/Approved/Tested) and the last tested date. It warns when the RTO is longer than the process's tolerable downtime. |
| 6 | **Incident Simulation** | Choose a threat type or a specific risk and an outage duration. It shows the operations affected directly and through dependencies, a **recovery priority (P1, P2…)**, expected downtime and estimated loss for each, and whether recovery happens within tolerance. Each result includes that process's recovery steps. Runs are saved to the history. |
| 7 | **Reports** | A Business Continuity Readiness Report with a score out of 100, a summary, the gaps found, an RTO/RPO coverage table, the high and critical risks, and recommendations. You can **download it as .txt** or **print / save it as PDF**. |

### Rules used

**Risk level** (score = likelihood × impact):

| Score | 1–4 | 5–9 | 10–14 | 15–25 |
|-------|-----|-----|-------|-------|
| Level | Low | Medium | High | Critical |

**Readiness score** is the average of four percentages:
1. **Plan coverage:** the percentage of processes that have a recovery plan.
2. **Plan testing:** the percentage of plans tested in the last 12 months.
3. **Risk mitigation:** the percentage of High and Critical risks that have a mitigation written down.
4. **RTO alignment:** the percentage of plans whose RTO is no longer than the process's maximum tolerable downtime.

A score of 80 or above is rated *Strong*, 60–79 is *Moderate*, and below 60 is *Needs improvement*.

**Simulation:**
- **Expected downtime** is the shorter of the RTO and the outage duration. If the process has no plan, it is the full outage duration.
- **Estimated loss** is the expected downtime multiplied by the loss per hour.
- **Recovery priority** puts the most critical processes first. Ties are broken by the shortest tolerable downtime, then by processes that other affected processes depend on, then by direct impacts before indirect ones.

---

## Folder structure

```
continuity360/
├── README.md
├── backend/
│   ├── server.py            # HTTP server: REST API + serves the React build
│   ├── storage.py           # Load/save the JSON file (safe writes, auto-recovery)
│   ├── validation.py        # Checks all form data before saving
│   ├── risk_engine.py       # Risk score, level and heatmap
│   ├── simulation.py        # Incident simulation and recovery priorities
│   ├── report.py            # Dashboard numbers, readiness score and report
│   ├── data/
│   │   ├── sample_data.json # Sample company data (never modified)
│   │   └── data.json        # Your working data (created on first run)
│   └── tests/
│       └── test_continuity360.py   # 21 automated tests
└── frontend/
    ├── package.json
    ├── build.js             # esbuild bundling script
    ├── public/index.html
    ├── dist/                # Built app (included, served by the backend)
    └── src/
        ├── App.jsx, main.jsx, api.js, utils.js, styles.css
        ├── components/      # Sidebar, cards, badges, modal, charts
        └── pages/           # Dashboard, Processes, Risks, Heatmap, Plans, Simulation, Reports
```

---

## How to run

### Requirements
- **Python 3.9+** to run the app. No pip packages are needed.
- **Node.js 18+**, but only if you change the frontend code.

### Start the application
The React app is already built into `frontend/dist`, so Python alone is enough:

```bash
cd continuity360/backend
python server.py          # on macOS/Linux you may need: python3 server.py
```

Then open **http://localhost:8000** in your browser.

To stop the server, press **Ctrl + C**. Your data stays in `backend/data/data.json`.

To use a different port:
- Windows PowerShell: `$env:PORT=8080; python server.py`
- macOS/Linux: `PORT=8080 python3 server.py`

### Reset to the sample data
Click **⟳ Reset sample data** in the top bar, or delete `backend/data/data.json` and restart the server.

### Rebuild the frontend (only after editing `frontend/src`)
```bash
cd continuity360/frontend
npm install
npm run build        # or: npm run watch  (rebuilds on every save)
```

### Run the tests
```bash
cd continuity360/backend
python -m unittest discover -s tests -v
```
The 21 tests cover risk scoring, the heatmap, validation, the simulation's dependency handling and
priorities, the readiness score and report, every API endpoint, cascade deletes and recovery from a
damaged data file. The tests use a temporary copy of the data, so your `data.json` is never touched.

---

## API reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/meta` | Dropdown options (criticality levels, threat types, plan statuses) |
| GET | `/api/dashboard` | Dashboard totals and charts |
| GET / POST | `/api/processes` | List / add processes |
| PUT / DELETE | `/api/processes/<id>` | Update / delete a process. Deleting also removes its plan and its links from risks and dependencies. |
| GET / POST | `/api/risks` | List (with score and level) / add risks |
| PUT / DELETE | `/api/risks/<id>` | Update / delete a risk |
| GET / POST | `/api/plans` | List / add recovery plans (one per process) |
| PUT / DELETE | `/api/plans/<id>` | Update / delete a plan |
| GET | `/api/heatmap` | 5×5 heatmap grid |
| POST | `/api/simulate` | `{"threat_type": "Cyberattack", "duration_hours": 8}` or `{"risk_id": "R-001", ...}` |
| GET | `/api/simulations` | The 10 most recent simulations |
| GET | `/api/report` | Readiness report (JSON plus a plain-text version) |
| POST | `/api/reset` | Restore the sample data |

Errors return `{"error": "message"}` with status 400, 404 or 500.

---

## Notes
- All sample company data is **fictional**, including names, email addresses and figures.
- The server listens on `127.0.0.1` only and has no login, so use it on your own computer.
- Data is saved after every change. Each save writes to a temporary file first, so a crash can't leave
  `data.json` half-written. If the file does get damaged, a copy is kept as `data.json.broken` and the
  sample data is restored.
