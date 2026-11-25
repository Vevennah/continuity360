// Module 6 - Incident Simulation
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ErrorBox, Field, LevelBadge, Loading, Panel, StatCard } from "../components/ui.jsx";
import { formatDateTime, hours, money } from "../utils.js";

const DURATIONS = [1, 4, 8, 24, 72];

export default function Simulation({ meta }) {
  const [risks, setRisks] = useState(null);
  const [mode, setMode] = useState("threat");
  const [threat, setThreat] = useState("Cyberattack");
  const [riskId, setRiskId] = useState("");
  const [duration, setDuration] = useState(8);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.list("risks").then((d) => {
      setRisks(d.risks);
      setRiskId(d.risks[0]?.id || "");
    }).catch((e) => setError(e.message));
    api.simulations().then((d) => setHistory(d.simulations)).catch(() => {});
  }, []);

  async function run(e) {
    e.preventDefault();
    setError("");
    setRunning(true);
    try {
      const payload = mode === "risk" ? { risk_id: riskId } : { threat_type: threat };
      const sim = await api.simulate({ ...payload, duration_hours: Number(duration) });
      setResult(sim);
      setExpanded(sim.results[0]?.process_id || null);
      api.simulations().then((d) => setHistory(d.simulations));
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  if (!risks && !error) return <Loading />;

  return (
    <div className="page">
      <Panel title="Simulate a disruption" tag="scenario setup" className="sim-setup">
        <form onSubmit={run} className="sim-form">
          <div className="field">
            <span className="field-label">Scenario based on</span>
            <div className="segmented">
              <button type="button" className={mode === "threat" ? "active" : ""} onClick={() => setMode("threat")}>Threat type</button>
              <button type="button" className={mode === "risk" ? "active" : ""} onClick={() => setMode("risk")}>Specific risk</button>
            </div>
          </div>
          {mode === "threat" ? (
            <Field label="Threat type">
              <select className="input" value={threat} onChange={(e) => setThreat(e.target.value)}>
                {meta.threat_types.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Risk from the register">
              <select className="input" value={riskId} onChange={(e) => setRiskId(e.target.value)}>
                {(risks || []).map((r) => <option key={r.id} value={r.id}>{r.id} · {r.name} ({r.level})</option>)}
              </select>
            </Field>
          )}
          <Field label={`Outage duration: ${hours(duration)}`}>
            <div className="duration-row">
              <input className="input" type="number" min="0.5" max="720" step="0.5" value={duration}
                onChange={(e) => setDuration(e.target.value)} />
              {DURATIONS.map((d) => (
                <button type="button" key={d} className={`chip-option ${Number(duration) === d ? "selected" : ""}`}
                  onClick={() => setDuration(d)}>{hours(d)}</button>
              ))}
            </div>
          </Field>
          <button className="btn btn-primary btn-lg" disabled={running}>{running ? "Simulating…" : "⚡ Run simulation"}</button>
        </form>
        <ErrorBox message={error} />
      </Panel>

      {result && <SimulationResult result={result} expanded={expanded} setExpanded={setExpanded} />}

      {history.length > 0 && (
        <Panel title="Simulation history" tag="saved in data.json">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Run at</th><th>Scenario</th><th>Duration</th><th>Affected</th><th>At risk</th><th>Est. loss</th></tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="mono tiny">{formatDateTime(h.run_at)}</td>
                    <td>{h.scenario}</td>
                    <td>{hours(h.duration_hours)}</td>
                    <td>{h.summary.affected}</td>
                    <td className={h.summary.at_risk ? "text-bad" : "text-ok"}>{h.summary.at_risk}</td>
                    <td className="mono">{money(h.summary.total_estimated_loss)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

function SimulationResult({ result, expanded, setExpanded }) {
  const s = result.summary;
  return (
    <>
      <div className="sim-banner">
        <div className="pulse" />
        <div>
          <div className="panel-tag">simulated incident</div>
          <h2>{result.scenario}</h2>
          <div className="muted small">
            Outage of {hours(result.duration_hours)} · triggered risks:{" "}
            {result.risks.map((r) => `${r.name} (${r.level})`).join(", ")}
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Affected operations" value={s.affected} tone="violet" icon="▤" sub={`${s.direct} direct · ${s.indirect} via dependencies`} />
        <StatCard label="Critical operations hit" value={s.critical_processes} tone="pink" icon="⬢" />
        <StatCard label="Beyond tolerance" value={s.at_risk} tone={s.at_risk ? "pink" : "cyan"} icon="⏱" sub={`${s.without_plan} without a recovery plan`} />
        <StatCard label="Estimated loss" value={money(s.total_estimated_loss)} tone="blue" icon="₹" sub="Using expected downtime" />
      </div>

      <Panel title="Recovery priority order" tag="affected business operations">
        <p className="muted small">
          Ordered by criticality, then by shortest tolerable downtime, then by how many other affected processes depend on it.
          Click a row to see its recovery steps.
        </p>
        <div className="priority-list">
          {result.results.map((r) => (
            <div key={r.process_id} className={`priority-item ${r.ok ? "" : "priority-bad"}`}>
              <button className="priority-row" onClick={() => setExpanded(expanded === r.process_id ? null : r.process_id)}>
                <span className="priority-tag">{r.priority}</span>
                <span className="priority-name">
                  <b>{r.name}</b>
                  <span className="muted tiny block">{r.impact_type}</span>
                </span>
                <LevelBadge level={r.criticality} />
                <span className="priority-metric"><small>Downtime</small>{hours(r.expected_downtime_hours)}</span>
                <span className="priority-metric"><small>Tolerance</small>{hours(r.max_downtime_hours)}</span>
                <span className="priority-metric"><small>Est. loss</small>{money(r.estimated_loss)}</span>
                <span className={`pill ${r.ok ? (r.plan ? "pill-ok" : "pill-warn") : "pill-bad"}`}>{r.status}</span>
              </button>
              {expanded === r.process_id && (
                <div className="priority-detail">
                  {r.plan ? (
                    <>
                      <div className="detail-meta">
                        <span>RTO <b>{hours(r.plan.rto_hours)}</b></span>
                        <span>RPO <b>{hours(r.plan.rpo_hours)}</b></span>
                        <span>Team <b>{r.plan.team}</b></span>
                      </div>
                      <p className="small">{r.plan.strategy}</p>
                      <ol className="steps">{r.plan.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
                    </>
                  ) : (
                    <p className="text-bad small">No recovery plan exists for this process. Create one in Recovery Planning.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
