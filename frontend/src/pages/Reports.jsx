// Module 7 - Business Continuity Readiness Report
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Gauge, Progress } from "../components/charts.jsx";
import { ErrorBox, LevelBadge, Loading, Panel, StatusBadge } from "../components/ui.jsx";
import { formatDateTime, hours } from "../utils.js";

export default function Reports({ notify }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  const generate = () => {
    setReport(null);
    api.report().then(setReport).catch((e) => setError(e.message));
  };
  useEffect(generate, []);

  function download() {
    const blob = new Blob([report.text], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `continuity360-readiness-report-${report.generated_at.slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
    notify("Report downloaded.");
  }

  if (error) return <ErrorBox message={error} />;
  if (!report) return <Loading text="Generating report…" />;

  const s = report.summary;
  return (
    <div className="page report">
      <div className="report-actions no-print">
        <button className="btn btn-ghost" onClick={generate}>⟳ Regenerate</button>
        <button className="btn btn-ghost" onClick={download}>⇩ Download (.txt)</button>
        <button className="btn btn-primary" onClick={() => window.print()}>🖶 Print / Save as PDF</button>
      </div>

      <Panel className="report-header">
        <div className="report-title">
          <div>
            <div className="panel-tag">continuity360 report</div>
            <h2 className="hero-title">{report.title}</h2>
            <div className="muted">{report.company}</div>
            <div className="muted tiny">Generated {formatDateTime(report.generated_at)}</div>
          </div>
          <div className="hero-gauge">
            <Gauge value={report.readiness.score} label="Readiness" size={150} />
            <span className={`pill ${report.readiness.score >= 80 ? "pill-ok" : report.readiness.score >= 60 ? "pill-warn" : "pill-bad"}`}>
              {report.readiness.rating}
            </span>
          </div>
        </div>
        <div className="summary-strip">
          <div><b>{s.processes}</b><span>Processes ({s.critical_processes} critical)</span></div>
          <div><b>{s.risks}</b><span>Risks identified</span></div>
          <div><b className="text-critical">{s.risks_by_level.Critical}</b><span>Critical risks</span></div>
          <div><b>{s.plans}</b><span>Recovery plans</span></div>
          <div><b>{s.simulations_run}</b><span>Simulations run</span></div>
        </div>
      </Panel>

      <div className="grid-2">
        <Panel title="1. Readiness assessment" tag="score breakdown">
          <div className="readiness-list">
            {report.readiness.components.map((c) => (
              <div key={c.name}>
                <div className="readiness-row"><span>{c.name}</span><b>{c.score}%</b></div>
                <Progress value={c.score} />
                <div className="muted tiny">{c.detail}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="2. Gaps identified" tag={`${report.gaps.length} findings`}>
          {report.gaps.length === 0 ? (
            <p className="text-ok">No gaps found. ✓</p>
          ) : (
            <ul className="gap-list">
              {report.gaps.map((g, i) => (
                <li key={i}><LevelBadge level={g.severity} /> <span>{g.text}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="3. Process recovery status" tag="rto / rpo coverage">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Process</th><th>Criticality</th><th>Tolerance</th><th>RTO</th><th>RPO</th><th>RTO OK</th><th>Plan</th><th>Last tested</th><th>Team</th></tr>
            </thead>
            <tbody>
              {report.processes.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{p.name}</td>
                  <td><LevelBadge level={p.criticality} /></td>
                  <td className="mono">{hours(p.max_downtime_hours)}</td>
                  <td className="mono">{hours(p.rto_hours)}</td>
                  <td className="mono">{hours(p.rpo_hours)}</td>
                  <td>{p.has_plan ? (p.rto_aligned ? <span className="text-ok">✓</span> : <span className="text-bad">✗</span>) : "—"}</td>
                  <td><StatusBadge status={p.plan_status} /></td>
                  <td className={p.tested_recently ? "text-ok tiny" : "text-bad tiny"}>{p.last_tested || (p.has_plan ? "Never" : "—")}</td>
                  <td className="tiny">{p.team || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid-2">
        <Panel title="4. High and critical risks" tag="priority risks">
          <ul className="simple-list">
            {report.top_risks.map((r) => (
              <li key={r.id}>
                <span>
                  <span className="strong">{r.name}</span>
                  <span className="muted tiny block">{r.threat_type} · score {r.score} · {r.mitigation ? "mitigation documented" : "no mitigation"}</span>
                </span>
                <LevelBadge level={r.level} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="5. Recommendations" tag="next actions">
          <ol className="steps">
            {report.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
