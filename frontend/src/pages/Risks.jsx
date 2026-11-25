// Module 3 - Risk Assessment (likelihood x impact scoring)
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { EmptyState, ErrorBox, Field, LevelBadge, Loading, Modal, Panel, StatCard } from "../components/ui.jsx";
import { LEVELS, riskLevel } from "../utils.js";

const EMPTY = {
  name: "", threat_type: "Cyberattack", description: "", likelihood: 3, impact: 3,
  process_ids: [], mitigation: "", owner: "",
};

export default function Risks({ meta, notify }) {
  const [risks, setRisks] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [error, setError] = useState("");
  const [threat, setThreat] = useState("All");
  const [level, setLevel] = useState("All");
  const [editing, setEditing] = useState(null);

  const load = () =>
    Promise.all([api.list("risks"), api.list("processes")])
      .then(([r, p]) => {
        setRisks(r.risks);
        setProcesses(p.processes);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function remove(risk) {
    if (!window.confirm(`Delete risk "${risk.name}"?`)) return;
    try {
      await api.remove("risks", risk.id);
      notify("Risk deleted.");
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!risks) return <Loading />;

  const rows = risks.filter((r) => (threat === "All" || r.threat_type === threat) && (level === "All" || r.level === level));
  const count = (l) => risks.filter((r) => r.level === l).length;

  return (
    <div className="page">
      <div className="stat-grid">
        <StatCard label="Critical" value={count("Critical")} tone="pink" icon="⬢" sub="Score 15–25" />
        <StatCard label="High" value={count("High")} tone="violet" icon="▲" sub="Score 10–14" />
        <StatCard label="Medium" value={count("Medium")} tone="blue" icon="◆" sub="Score 5–9" />
        <StatCard label="Low" value={count("Low")} tone="cyan" icon="●" sub="Score 1–4" />
      </div>

      <Panel
        title="Risk register"
        tag="likelihood × impact"
        actions={<button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>+ Assess new risk</button>}
      >
        <div className="toolbar">
          <select className="input" value={threat} onChange={(e) => setThreat(e.target.value)}>
            <option value="All">All threat types</option>
            {meta.threat_types.map((t) => <option key={t}>{t}</option>)}
          </select>
          <div className="segmented">
            {["All", ...LEVELS].map((l) => (
              <button key={l} className={level === l ? "active" : ""} onClick={() => setLevel(l)}>{l}</button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No risks match" text="Change the filters or assess a new risk." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Risk / disruption</th>
                  <th>Threat type</th>
                  <th>L</th>
                  <th>I</th>
                  <th>Score</th>
                  <th>Level</th>
                  <th>Affected processes</th>
                  <th>Mitigation</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono muted">{r.id}</td>
                    <td>
                      <div className="strong">{r.name}</div>
                      <div className="muted tiny">{r.owner}</div>
                    </td>
                    <td>{r.threat_type}</td>
                    <td className="mono">{r.likelihood}</td>
                    <td className="mono">{r.impact}</td>
                    <td><span className={`score score-${r.level.toLowerCase()}`}>{r.score}</span></td>
                    <td><LevelBadge level={r.level} /></td>
                    <td className="tiny">{r.process_names.join(", ") || <span className="text-bad">None linked</span>}</td>
                    <td className="tiny">{r.mitigation || <span className="text-bad">Not documented</span>}</td>
                    <td className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(r)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(r)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing && (
        <RiskForm
          initial={editing}
          processes={processes}
          meta={meta}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notify("Risk assessment saved.");
            load();
          }}
        />
      )}
    </div>
  );
}

function ScoreSlider({ label, value, labels, onChange }) {
  return (
    <div className="field">
      <span className="field-label">
        {label}: <b className="accent">{value} – {labels[value]}</b>
      </span>
      <input type="range" min="1" max="5" value={value} className="range" onChange={(e) => onChange(Number(e.target.value))} />
      <div className="range-scale">
        {[1, 2, 3, 4, 5].map((n) => <span key={n}>{labels[n]}</span>)}
      </div>
    </div>
  );
}

function RiskForm({ initial, processes, meta, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const score = form.likelihood * form.impact;
  const level = riskLevel(score);

  function toggle(id) {
    const ids = form.process_ids.includes(id) ? form.process_ids.filter((p) => p !== id) : [...form.process_ids, id];
    setForm({ ...form, process_ids: ids });
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (form.id) await api.update("risks", form.id, form);
      else await api.create("risks", form);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={form.id ? `Edit risk ${form.id}` : "Assess a new risk"} onClose={onClose} wide>
      <form onSubmit={submit} className="form">
        <div className="form-grid">
          <Field label="Risk name *">
            <input className="input" value={form.name} onChange={set("name")} required placeholder="e.g. Ransomware attack" />
          </Field>
          <Field label="Threat type *">
            <select className="input" value={form.threat_type} onChange={set("threat_type")}>
              {meta.threat_types.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea className="input" rows="2" value={form.description} onChange={set("description")} />
        </Field>

        <div className="score-box">
          <div className="score-sliders">
            <ScoreSlider label="Likelihood" value={form.likelihood} labels={meta.likelihood_labels}
              onChange={(v) => setForm({ ...form, likelihood: v })} />
            <ScoreSlider label="Impact" value={form.impact} labels={meta.impact_labels}
              onChange={(v) => setForm({ ...form, impact: v })} />
          </div>
          <div className={`score-result result-${level.toLowerCase()}`}>
            <div className="muted tiny">RISK SCORE</div>
            <div className="score-big">{score}</div>
            <LevelBadge level={level} />
            <div className="muted tiny">{form.likelihood} × {form.impact}</div>
          </div>
        </div>

        <div className="field">
          <span className="field-label">Affected business processes *</span>
          <div className="chip-select">
            {processes.map((p) => (
              <button type="button" key={p.id} className={`chip-option ${form.process_ids.includes(p.id) ? "selected" : ""}`}
                onClick={() => toggle(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <Field label="Mitigation / controls">
            <textarea className="input" rows="2" value={form.mitigation} onChange={set("mitigation")} />
          </Field>
          <Field label="Risk owner">
            <input className="input" value={form.owner} onChange={set("owner")} />
          </Field>
        </div>
        <ErrorBox message={error} />
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save risk"}</button>
        </div>
      </form>
    </Modal>
  );
}
