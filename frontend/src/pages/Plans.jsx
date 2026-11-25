// Module 5 - Recovery Planning (RTO, RPO, steps, responsible teams)
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { EmptyState, ErrorBox, Field, LevelBadge, Loading, Modal, Panel, StatusBadge } from "../components/ui.jsx";
import { hours } from "../utils.js";

const EMPTY = { process_id: "", rto_hours: 4, rpo_hours: 1, strategy: "", steps: [""], team: "", contact: "", status: "Draft", last_tested: "" };

export default function Plans({ meta, notify }) {
  const [plans, setPlans] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);

  const load = () =>
    Promise.all([api.list("plans"), api.list("processes")])
      .then(([pl, pr]) => {
        setPlans(pl.plans);
        setProcesses(pr.processes);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function remove(plan) {
    if (!window.confirm(`Delete the recovery plan for "${plan.process_name}"?`)) return;
    try {
      await api.remove("plans", plan.id);
      notify("Recovery plan deleted.");
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!plans) return <Loading />;

  const planned = new Set(plans.map((p) => p.process_id));
  const unplanned = processes.filter((p) => !planned.has(p.id));

  return (
    <div className="page">
      {unplanned.length > 0 && (
        <div className="alert alert-warn">
          <span>
            ⚠ {unplanned.length} process{unplanned.length > 1 ? "es have" : " has"} no recovery plan:{" "}
            <b>{unplanned.map((p) => p.name).join(", ")}</b>
          </span>
          <button className="btn btn-sm btn-primary"
            onClick={() => setEditing({ ...EMPTY, process_id: unplanned[0].id })}>
            Create plan
          </button>
        </div>
      )}

      <Panel
        title="Recovery plans"
        tag={`${plans.length} plans · RTO / RPO objectives`}
        actions={
          <button className="btn btn-primary" disabled={unplanned.length === 0}
            onClick={() => setEditing({ ...EMPTY, process_id: unplanned[0]?.id || "" })}>
            + New recovery plan
          </button>
        }
      >
        {plans.length === 0 ? (
          <EmptyState title="No recovery plans yet" text="Create a plan for each critical business process." />
        ) : (
          <div className="plan-grid">
            {plans.map((plan) => {
              const aligned = plan.rto_hours <= plan.max_downtime_hours;
              return (
                <article className="plan-card" key={plan.id}>
                  <div className="plan-head">
                    <div>
                      <div className="mono muted tiny">{plan.id}</div>
                      <h3>{plan.process_name}</h3>
                    </div>
                    <div className="plan-badges">
                      <LevelBadge level={plan.criticality} />
                      <StatusBadge status={plan.status} />
                    </div>
                  </div>
                  <div className="objectives">
                    <div className={`objective ${aligned ? "" : "objective-bad"}`}>
                      <span>RTO</span>
                      <b>{hours(plan.rto_hours)}</b>
                      <small>tolerance {hours(plan.max_downtime_hours)}</small>
                    </div>
                    <div className="objective">
                      <span>RPO</span>
                      <b>{hours(plan.rpo_hours)}</b>
                      <small>max data loss</small>
                    </div>
                  </div>
                  {!aligned && <div className="text-bad tiny">⚠ RTO is longer than the maximum tolerable downtime.</div>}
                  <p className="muted small">{plan.strategy}</p>
                  <ol className="steps">
                    {plan.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                  <div className="plan-foot">
                    <div className="tiny">
                      <div>👥 <b>{plan.team}</b></div>
                      <div className="muted">{plan.contact}</div>
                      <div className={plan.tested_recently ? "text-ok" : "text-bad"}>
                        {plan.last_tested ? `Last tested ${plan.last_tested}` : "Never tested"}
                        {plan.last_tested && !plan.tested_recently && " (over 12 months)"}
                      </div>
                    </div>
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(plan)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(plan)}>Delete</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      {editing && (
        <PlanForm
          initial={editing}
          processes={processes}
          plans={plans}
          meta={meta}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notify("Recovery plan saved.");
            load();
          }}
        />
      )}
    </div>
  );
}

function PlanForm({ initial, processes, plans, meta, onClose, onSaved }) {
  const [form, setForm] = useState({ ...initial, steps: initial.steps.length ? initial.steps : [""] });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const takenBy = new Set(plans.filter((p) => p.id !== form.id).map((p) => p.process_id));
  const process = processes.find((p) => p.id === form.process_id);

  const setStep = (i, value) => setForm({ ...form, steps: form.steps.map((s, j) => (j === i ? value : s)) });
  const addStep = () => setForm({ ...form, steps: [...form.steps, ""] });
  const removeStep = (i) => setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) });
  const moveStep = (i, dir) => {
    const steps = [...form.steps];
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    setForm({ ...form, steps });
  };

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const payload = { ...form, steps: form.steps.map((s) => s.trim()).filter(Boolean) };
    try {
      if (form.id) await api.update("plans", form.id, payload);
      else await api.create("plans", payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={form.id ? `Edit plan ${form.id}` : "New recovery plan"} onClose={onClose} wide>
      <form onSubmit={submit} className="form">
        <div className="form-grid">
          <Field label="Business process *">
            <select className="input" value={form.process_id} onChange={set("process_id")} required>
              <option value="">Select a process…</option>
              {processes.map((p) => (
                <option key={p.id} value={p.id} disabled={takenBy.has(p.id)}>
                  {p.name} ({p.criticality}){takenBy.has(p.id) ? " – has plan" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status *">
            <select className="input" value={form.status} onChange={set("status")}>
              {meta.plan_statuses.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="RTO – Recovery Time Objective (hours) *"
            hint={process ? `Must be ≤ ${process.max_downtime_hours} h (tolerable downtime)` : "Target time to restore the process"}>
            <input className="input" type="number" min="0" step="0.5" value={form.rto_hours} onChange={set("rto_hours")} required />
          </Field>
          <Field label="RPO – Recovery Point Objective (hours) *" hint="Maximum acceptable data loss">
            <input className="input" type="number" min="0" step="0.5" value={form.rpo_hours} onChange={set("rpo_hours")} required />
          </Field>
          <Field label="Responsible team *">
            <input className="input" value={form.team} onChange={set("team")} required />
          </Field>
          <Field label="Team contact">
            <input className="input" value={form.contact} onChange={set("contact")} />
          </Field>
          <Field label="Last tested">
            <input className="input" type="date" value={form.last_tested} onChange={set("last_tested")} />
          </Field>
        </div>
        <Field label="Recovery strategy *">
          <input className="input" value={form.strategy} onChange={set("strategy")} required placeholder="e.g. Fail over to standby server" />
        </Field>
        <div className="field">
          <span className="field-label">Recovery steps * (in order)</span>
          {form.steps.map((step, i) => (
            <div className="step-row" key={i}>
              <span className="step-num">{i + 1}</span>
              <input className="input" value={step} onChange={(e) => setStep(i, e.target.value)} placeholder="Describe this step" />
              <button type="button" className="icon-btn" onClick={() => moveStep(i, -1)} aria-label="Move up">↑</button>
              <button type="button" className="icon-btn" onClick={() => moveStep(i, 1)} aria-label="Move down">↓</button>
              <button type="button" className="icon-btn" onClick={() => removeStep(i)} disabled={form.steps.length === 1} aria-label="Remove step">✕</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={addStep}>+ Add step</button>
        </div>
        <ErrorBox message={error} />
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save plan"}</button>
        </div>
      </form>
    </Modal>
  );
}
