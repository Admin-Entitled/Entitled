const request = async (path, options = {}) => {
  const response = await fetch(`/api/delivery-resolution${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(payload.error || "Request failed"); Object.assign(error, payload); throw error; }
  return payload;
};
export const api = {
  orders: (params = {}) => request(`/orders?${new URLSearchParams(params)}`),
  sync: (range) => request("/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(range) }),
  upload: (file, mapping) => { const body = new FormData(); body.append("file", file); if (mapping) body.append("mapping", JSON.stringify(mapping)); return request("/legacy-csv", { method: "POST", body }); },
  manual: (id, resolution, note) => request(`/orders/${id}/manual`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolution, note }) }),
  reset: (id) => request(`/orders/${id}/reset-manual`, { method: "POST" }),
};
