// Module 1 - Dashboard
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { BarList, Donut, Gauge, Progress } from "../components/charts.jsx";
import { ErrorBox, LevelBadge, Loading, Panel, StatCard } from "../components/ui.jsx";
import { LEVEL_COLORS, LEVELS, formatDateTime, hours, money } from "../utils.js";

export default function Dashboard({ goTo }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.dashboard().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;

  const { totals, readiness } = data;
  const levelData = LEVELS.map((l) => ({ label: l, value: data.risks_by_level[l], color: LEVEL_COLORS[l] }));

  return (
    <div className="page">
      <div className="hero panel">
        <div>
          <div className="panel-tag">organisation</div>
          <h2 className="hero-title">
            Business continuity <span className="gradient-text">command centre</span>
          </h2>
          <p className="muted">{data.company}</p>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => goTo("simulation")}>
              ⚡ Run incident simulation
            </button>
            <button className="btn btn-ghost" onClick={() => goTo("reports")}>
              View readiness report
            </button>
          </div>
        </div>
        <div className="hero-gauge">
          <Gauge value={readiness.score} label="Readiness" />
          <span className={`pill ${readiness.score >= 80 ? "pill-ok" : readiness.score >= 60 ? "pill-warn" : "pill-bad"}`}>
            {readiness.rating}
          </span>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Business processes" value={totals.processes} icon="▤" tone="blue"
          sub={`${data.processes_by_criticality.Critical} critical operations`} />
        <StatCard label="Identified risks" value={totals.risks} icon="⚠" tone="violet"
          sub={`${data.risks_by_level.High} high · ${data.risks_by_level.Medium} medium`} />
        <StatCard label="Critical risks" value={totals.critical_risks} icon="⬢" tone="pink"
          sub="Score 15 or above" />
        <StatCard label="Recovery plans" value={totals.plans} icon="⟲" tone="cyan"
          sub={`${data.unplanned_processes.length} processes without a plan`} />
      </div>

      <div className="grid-3">
        <Panel title="Risks by level" tag="risk profile">
          <Donut data={levelData} centerLabel="risks" />
        </Panel>
        <Panel title="Risks by threat type" tag="threat landscape">
          <BarList data={data.risks_by_threat.map((t) => ({ label: t.threat_type, value: t.count }))} />
        </Panel>
        <Panel title="Readiness breakdown" tag="bcp health">
          <div className="readiness-list">
            {readiness.components.map((c) => (
              <div key={c.name}>
                <div className="readiness-row">
                  <span>{c.name}</span>
                  <b>{c.score}%</b>
                </div>
                <Progress value={c.score} />
                <div className="muted tiny">{c.detail}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel
          title="Top risks"
          tag="highest scores"
          actions={<button className="btn btn-ghost btn-sm" onClick={() => goTo("risks")}>All risks →</button>}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Risk</th>
                  <th>Threat</th>
                  <th>Score</th>
                  <th>Level</th>
                </tr>
              </thead>
              <tbody>
                {data.top_risks.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="strong">{r.name}</div>
                      <div className="muted tiny">{r.process_names.join(", ")}</div>
                    </td>
                    <td>{r.threat_type}</td>
                    <td className="mono">{r.score}</td>
                    <td>
                      <LevelBadge level={r.level} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="stack">
          <Panel title="Processes without a recovery plan" tag="coverage gaps">
            {data.unplanned_processes.length === 0 ? (
              <p className="muted">Every business process has a recovery plan. ✓</p>
            ) : (
              <ul className="simple-list">
                {data.unplanned_processes.map((p) => (
                  <li key={p.id}>
                    <span>{p.name}</span>
                    <LevelBadge level={p.criticality} />
                  </li>
                ))}
              </ul>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => goTo("plans")}>
              Create recovery plan →
            </button>
          </Panel>
          <Panel title="Recent simulations" tag="exercises">
            {data.recent_simulations.length === 0 ? (
              <p className="muted">No simulations yet. Run one to test your plans.</p>
            ) : (
              <ul className="simple-list">
                {data.recent_simulations.map((s) => (
                  <li key={s.id}>
                    <span>
                      <span className="strong">{s.scenario}</span>
                      <span className="muted tiny block">
                        {formatDateTime(s.run_at)} · {hours(s.duration_hours)} · {s.summary.affected} processes ·{" "}
                        {money(s.summary.total_estimated_loss)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
