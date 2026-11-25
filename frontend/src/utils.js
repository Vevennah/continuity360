// Small helpers shared by the pages.

export const LEVELS = ["Critical", "High", "Medium", "Low"];

export const LEVEL_COLORS = {
  Critical: "#f43f5e",
  High: "#fb923c",
  Medium: "#facc15",
  Low: "#34d399",
};

export function riskLevel(score) {
  if (score >= 15) return "Critical";
  if (score >= 10) return "High";
  if (score >= 5) return "Medium";
  return "Low";
}

export function money(value) {
  return "₹" + Math.round(value || 0).toLocaleString("en-IN");
}

export function hours(value) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (n >= 48 && n % 24 === 0) return `${n / 24} days`;
  return `${Number.isInteger(n) ? n : n.toFixed(1)} h`;
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16);
}
