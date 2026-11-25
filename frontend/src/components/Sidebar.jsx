// Sidebar navigation for the seven modules.

export const PAGES = [
  { id: "dashboard", label: "Dashboard", icon: "◈", group: "Overview" },
  { id: "processes", label: "Business Processes", icon: "▤", group: "Plan" },
  { id: "risks", label: "Risk Assessment", icon: "⚠", group: "Plan" },
  { id: "heatmap", label: "Risk Heatmap", icon: "▦", group: "Plan" },
  { id: "plans", label: "Recovery Planning", icon: "⟲", group: "Plan" },
  { id: "simulation", label: "Incident Simulation", icon: "⚡", group: "Test" },
  { id: "reports", label: "Reports", icon: "▣", group: "Test" },
];

export default function Sidebar({ current, onNavigate, open, onClose }) {
  const groups = [...new Set(PAGES.map((p) => p.group))];
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand">
        <div className="brand-mark">
          <span>360</span>
        </div>
        <div>
          <div className="brand-name">CONTINUITY360</div>
          <div className="brand-sub">BC & DR Planner</div>
        </div>
      </div>

      <nav>
        {groups.map((group) => (
          <div key={group} className="nav-group">
            <div className="nav-group-title">{group}</div>
            {PAGES.filter((p) => p.group === group).map((page) => (
              <button
                key={page.id}
                className={`nav-item ${current === page.id ? "active" : ""}`}
                onClick={() => {
                  onNavigate(page.id);
                  onClose();
                }}
              >
                <span className="nav-icon">{page.icon}</span>
                {page.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="status-dot" /> System online
        <div className="muted tiny">Local JSON storage · v1.0</div>
      </div>
    </aside>
  );
}
