// Module 4 - Risk Heatmap (5 x 5 likelihood / impact matrix)
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ErrorBox, LevelBadge, Loading, Panel } from "../components/ui.jsx";
import { LEVELS } from "../utils.js";

export default function Heatmap() {
  const [heatmap, setHeatmap] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.heatmap().then(setHeatmap).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!heatmap) return <Loading />;

  return (
    <div className="page">
      <div className="grid-heat">
        <Panel title="Likelihood × Impact matrix" tag="risk heatmap">
          <div className="heatmap">
            <div className="heat-ylabel">LIKELIHOOD →</div>
            <div className="heat-grid">
              {heatmap.rows.map((row) => (
                <div className="heat-row" key={row.likelihood}>
                  <div className="heat-axis">
                    <b>{row.likelihood}</b>
                    <span>{row.label}</span>
                  </div>
                  {row.cells.map((cell) => {
                    const isSelected = selected && selected.likelihood === cell.likelihood && selected.impact === cell.impact;
                    return (
                      <button
                        key={cell.impact}
                        className={`heat-cell heat-${cell.level.toLowerCase()} ${cell.risks.length ? "has-risks" : ""} ${isSelected ? "selected" : ""}`}
                        onClick={() => setSelected(cell)}
                        title={`Likelihood ${cell.likelihood} × Impact ${cell.impact} = ${cell.score} (${cell.level})`}
                      >
                        <span className="heat-score">{cell.score}</span>
                        {cell.risks.length > 0 && <span className="heat-count">{cell.risks.length}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="heat-row heat-xaxis">
                <div className="heat-axis" />
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="heat-axis-x">
                    <b>{i}</b>
                    <span>{heatmap.impact_labels[i]}</span>
                  </div>
                ))}
              </div>
              <div className="heat-xlabel">IMPACT →</div>
            </div>
          </div>
          <div className="heat-legend">
            {LEVELS.map((l) => (
              <span key={l} className="heat-legend-item">
                <span className={`heat-swatch heat-${l.toLowerCase()}`} /> {l}
                <b>{heatmap.counts[l]}</b>
              </span>
            ))}
          </div>
        </Panel>

        <div className="stack">
          <Panel title={selected ? `Cell L${selected.likelihood} × I${selected.impact}` : "Select a cell"} tag="details">
            {!selected ? (
              <p className="muted">Click any cell in the matrix to see the risks it contains. The number in the corner shows how many risks fall in that cell.</p>
            ) : (
              <>
                <div className="cell-info">
                  <span>Score <b className="mono">{selected.score}</b></span>
                  <LevelBadge level={selected.level} />
                </div>
                {selected.risks.length === 0 ? (
                  <p className="muted">No risks in this cell.</p>
                ) : (
                  <ul className="simple-list">
                    {selected.risks.map((r) => (
                      <li key={r.id}>
                        <span>
                          <span className="strong">{r.name}</span>
                          <span className="muted tiny block">{r.id} · {r.threat_type}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Panel>
          <Panel title="How levels are assigned" tag="scoring">
            <table className="compact">
              <tbody>
                <tr><td><LevelBadge level="Critical" /></td><td>Score 15–25</td><td className="muted tiny">Act immediately</td></tr>
                <tr><td><LevelBadge level="High" /></td><td>Score 10–14</td><td className="muted tiny">Plan mitigation soon</td></tr>
                <tr><td><LevelBadge level="Medium" /></td><td>Score 5–9</td><td className="muted tiny">Monitor and review</td></tr>
                <tr><td><LevelBadge level="Low" /></td><td>Score 1–4</td><td className="muted tiny">Accept / routine</td></tr>
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </div>
  );
}
