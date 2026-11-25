// Module 2 - Business Process Management (add, edit, delete, search)
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { EmptyState, ErrorBox, Field, LevelBadge, Loading, Modal, Panel } from "../components/ui.jsx";
import { hours, money } from "../utils.js";

const EMPTY = {
  name: "", department: "", owner: "", criticality: "High", description: "",
  systems: "", dependencies: [], max_downtime_hours: 8, hourly_loss: 10000,
};

export default function Processes({ meta, notify }) {
  const [processes, setProcesses] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("All");
  const [editing, setEditing] = useState(null); // null = closed, {} = form values

  const load = () => api.list("processes").then((d) => setProcesses(d.processes)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function remove(process) {
    if (!window.confirm(`Delete "${process.name}"? Its recovery plan and risk links will also be removed.`)) return;
    try {
      await api.remove("processes", process.id);
      notify(`Deleted ${process.name}.`);
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!processes) return <Loading />;

  const byId = Object.fromEntries(processes.map((p) => [p.id, p]));
  const term = search.toLowerCase();
  const rows = processes.filter(
    (p) =>
      (level === "All" || p.criticality === level) &&
      [p.name, p.department, p.owner].some((v) => v.toLowerCase().includes(term))
  );

  return (
    <div className="page">
      <Panel
        title="Critical business operations"
        tag={`${processes.length} processes`}
        actions={
          <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>
            + Add process
          </button>
        }
      >
        <div className="toolbar">
          <input className="input" placeholder="Search name, department or owner…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          <div className="segmented">
            {["All", ...meta.criticality_levels].map((l) => (
              <button key={l} className={level === l ? "active" : ""} onClick={() => setLevel(l)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No processes found" text="Try a different search or add a new process." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Process</th>
                  <th>Department / Owner</th>
                  <th>Criticality</th>
                  <th>Max downtime</th>
                  <th>Loss per hour</th>
                  <th>Depends on</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="mono muted">{p.id}</td>
                    <td>
                      <div className="strong">{p.name}</div>
                      <div className="muted tiny">{p.systems.join(" · ")}</div>
                    </td>
                    <td>
                      {p.department}
                      <div className="muted tiny">{p.owner}</div>
                    </td>
                    <td><LevelBadge level={p.criticality} /></td>
                    <td className="mono">{hours(p.max_downtime_hours)}</td>
                    <td className="mono">{money(p.hourly_loss)}</td>
                    <td className="tiny">{p.dependencies.map((d) => byId[d]?.name).filter(Boolean).join(", ") || "—"}</td>
                    <td className="row-actions">
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => setEditing({ ...p, systems: p.systems.join(", ") })}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(p)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing && (
        <ProcessForm
          initial={editing}
          processes={processes}
          meta={meta}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            notify(`Saved ${name}.`);
            load();
          }}
        />
      )}
    </div>
  );
}

function ProcessForm({ initial, processes, meta, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  function toggleDependency(id) {
    const deps = form.dependencies.includes(id) ? form.dependencies.filter((d) => d !== id) : [...form.dependencies, id];
    setForm({ ...form, dependencies: deps });
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const payload = { ...form, systems: form.systems.split(",").map((s) => s.trim()).filter(Boolean) };
    try {
      if (form.id) await api.update("processes", form.id, payload);
      else await api.create("processes", payload);
      onSaved(form.name);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={form.id ? `Edit ${form.id}` : "Add business process"} onClose={onClose} wide>
      <form onSubmit={submit} className="form">
        <div className="form-grid">
          <Field label="Process name *">
            <input className="input" value={form.name} onChange={set("name")} required maxLength={100} />
          </Field>
          <Field label="Department *">
            <input className="input" value={form.department} onChange={set("department")} required />
          </Field>
          <Field label="Process owner *">
            <input className="input" value={form.owner} onChange={set("owner")} required />
          </Field>
          <Field label="Criticality *">
            <select className="input" value={form.criticality} onChange={set("criticality")}>
              {meta.criticality_levels.map((l) => <option key={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="Maximum tolerable downtime (hours) *" hint="How long the business can survive without it">
            <input className="input" type="number" min="0.5" step="0.5" value={form.max_downtime_hours}
              onChange={set("max_downtime_hours")} required />
          </Field>
          <Field label="Estimated loss per hour (₹) *">
            <input className="input" type="number" min="0" step="1000" value={form.hourly_loss}
              onChange={set("hourly_loss")} required />
          </Field>
        </div>
        <Field label="Supporting systems" hint="Comma separated, e.g. Web Store, Order DB">
          <input className="input" value={form.systems} onChange={set("systems")} />
        </Field>
        <Field label="Description">
          <textarea className="input" rows="2" value={form.description} onChange={set("description")} />
        </Field>
        <div className="field">
          <span className="field-label">Depends on (other processes)</span>
          <div className="chip-select">
            {processes.filter((p) => p.id !== form.id).map((p) => (
              <button type="button" key={p.id}
                className={`chip-option ${form.dependencies.includes(p.id) ? "selected" : ""}`}
                onClick={() => toggleDependency(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <ErrorBox message={error} />
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save process"}</button>
        </div>
      </form>
    </Modal>
  );
}
