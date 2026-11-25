// Reusable UI building blocks.
import { useEffect } from "react";

export function LevelBadge({ level }) {
  if (!level) return null;
  return <span className={`badge badge-${level.toLowerCase()}`}>{level}</span>;
}

export function StatusBadge({ status }) {
  const tone = { Tested: "ok", Approved: "info", Draft: "warn", Missing: "bad" }[status] || "info";
  return <span className={`pill pill-${tone}`}>{status}</span>;
}

export function StatCard({ label, value, sub, tone = "violet", icon }) {
  return (
    <div className={`stat-card glow-${tone}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Panel({ title, tag, actions, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          <div>
            {tag && <div className="panel-tag">{tag}</div>}
            {title && <h2>{title}</h2>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div className="alert alert-error" role="alert">
      ⚠ {message}
    </div>
  );
}

export function Loading({ text = "Loading…" }) {
  return (
    <div className="loading">
      <span className="spinner" /> {text}
    </div>
  );
}

export function EmptyState({ title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">◎</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast toast-${toast.type}`}>{toast.message}</div>;
}
