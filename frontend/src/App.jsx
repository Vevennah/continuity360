// App.jsx - layout, navigation and shared state (dropdown options + toasts).
import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import Sidebar, { PAGES } from "./components/Sidebar.jsx";
import { ErrorBox, Toast } from "./components/ui.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Processes from "./pages/Processes.jsx";
import Risks from "./pages/Risks.jsx";
import Heatmap from "./pages/Heatmap.jsx";
import Plans from "./pages/Plans.jsx";
import Simulation from "./pages/Simulation.jsx";
import Reports from "./pages/Reports.jsx";

const PAGE_COMPONENTS = {
  dashboard: Dashboard,
  processes: Processes,
  risks: Risks,
  heatmap: Heatmap,
  plans: Plans,
  simulation: Simulation,
  reports: Reports,
};

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    api.meta().then(setMeta).catch((err) => setError(err.message));
  }, []);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    clearTimeout(window.__c360toast);
    window.__c360toast = setTimeout(() => setToast(null), 3000);
  }, []);

  async function resetData() {
    if (!window.confirm("Restore the sample data? All your changes will be replaced.")) return;
    try {
      await api.reset();
      setResetKey((k) => k + 1); // re-mount the page so it reloads its data
      notify("Sample data restored.");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const current = PAGES.find((p) => p.id === page);
  const PageComponent = PAGE_COMPONENTS[page];
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="layout">
      <Sidebar current={page} onNavigate={setPage} open={menuOpen} onClose={() => setMenuOpen(false)} />
      {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div>
            <div className="crumb">continuity360 / {current.id}</div>
            <h1>{current.label}</h1>
          </div>
          <div className="topbar-right">
            <span className="chip">{today}</span>
            <button className="btn btn-ghost btn-sm" onClick={resetData} title="Restore sample data">
              ⟳ Reset sample data
            </button>
          </div>
        </header>

        <div className="content">
          <ErrorBox message={error} />
          {meta && <PageComponent key={`${page}-${resetKey}`} meta={meta} notify={notify} goTo={setPage} />}
        </div>
      </main>
      <Toast toast={toast} />
    </div>
  );
}
