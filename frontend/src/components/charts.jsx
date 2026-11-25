// Simple charts drawn with SVG and CSS (no chart library needed).

// Circular gauge for the readiness score (0-100)
export function Gauge({ value, label, size = 170 }) {
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg viewBox="0 0 160 160" width={size} height={size}>
        <defs>
          <linearGradient id="gaugeGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r={radius} className="gauge-track" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          className="gauge-value"
          stroke="url(#gaugeGradient)"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 80 80)"
        />
      </svg>
      <div className="gauge-center">
        <div className="gauge-number">{value}</div>
        <div className="gauge-label">{label}</div>
      </div>
    </div>
  );
}

// Donut chart: data = [{label, value, color}]
export function Donut({ data, centerLabel }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 140 140" width="150" height="150">
          <circle cx="70" cy="70" r={radius} className="gauge-track" strokeWidth="18" />
          {total > 0 &&
            data.map((d) => {
              const length = (d.value / total) * circumference;
              const segment = (
                <circle
                  key={d.label}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke={d.color}
                  strokeWidth="18"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 70 70)"
                >
                  <title>{`${d.label}: ${d.value}`}</title>
                </circle>
              );
              offset += length;
              return segment;
            })}
        </svg>
        <div className="donut-center">
          <div className="donut-number">{total}</div>
          <div className="donut-label">{centerLabel}</div>
        </div>
      </div>
      <ul className="legend">
        {data.map((d) => (
          <li key={d.label}>
            <span className="legend-dot" style={{ background: d.color, boxShadow: `0 0 8px ${d.color}` }} />
            <span>{d.label}</span>
            <b>{d.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Horizontal bar chart: data = [{label, value}]
export function BarList({ data, color = "violet" }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="barlist">
      {data.map((d) => (
        <div className="barlist-row" key={d.label}>
          <span className="barlist-label">{d.label}</span>
          <div className="barlist-track">
            <div className={`barlist-fill fill-${color}`} style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="barlist-value">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

// Thin progress bar for percentages
export function Progress({ value }) {
  const tone = value >= 80 ? "good" : value >= 60 ? "mid" : "low";
  return (
    <div className="progress">
      <div className={`progress-fill progress-${tone}`} style={{ width: `${value}%` }} />
    </div>
  );
}
