// api.js - every call to the Python backend goes through request().

async function request(method, path, body) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new Error("Cannot reach the CONTINUITY360 server. Is server.py running?");
  }
  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error(`Unexpected server response (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status}).`);
  return data;
}

export const api = {
  meta: () => request("GET", "/api/meta"),
  dashboard: () => request("GET", "/api/dashboard"),
  heatmap: () => request("GET", "/api/heatmap"),
  report: () => request("GET", "/api/report"),
  simulations: () => request("GET", "/api/simulations"),
  simulate: (payload) => request("POST", "/api/simulate", payload),
  reset: () => request("POST", "/api/reset"),

  // Generic CRUD for "processes", "risks" and "plans"
  list: (collection) => request("GET", `/api/${collection}`),
  create: (collection, item) => request("POST", `/api/${collection}`, item),
  update: (collection, id, item) => request("PUT", `/api/${collection}/${id}`, item),
  remove: (collection, id) => request("DELETE", `/api/${collection}/${id}`),
};
