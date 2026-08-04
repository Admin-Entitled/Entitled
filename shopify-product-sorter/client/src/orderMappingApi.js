const API_BASE = "/api/order-mapping";

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.message || payload.error || "Order Mapping request failed");
    Object.assign(error, payload);
    throw error;
  }

  return payload;
}

export const api = {
  orders: (params = {}, options = {}) =>
    request(`/orders?${new URLSearchParams({ queue: "ALL", ...params })}`, options),
  order: (id) => request(`/orders/${id}`),
  networkLogs: (limit = 30) => request(`/logs/network?limit=${limit}`),
  actionLogs: (limit = 30) => request(`/logs/actions?limit=${limit}`),
  syncShopify: (range = {}) =>
    request("/sync/shopify", {
      method: "POST",
      body: JSON.stringify(range),
    }),
  refreshShiprocket: (force = false) =>
    request("/sync/shiprocket", {
      method: "POST",
      body: JSON.stringify({ force }),
    }),
  refreshShipment: (shipmentId, force = true) =>
    request(`/shipments/${shipmentId}/refresh`, {
      method: "POST",
      body: JSON.stringify({ force }),
    }),
  manual: (shipmentId, payload) =>
    request(`/shipments/${shipmentId}/manual`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  clearManual: (shipmentId) =>
    request(`/shipments/${shipmentId}/clear-manual`, {
      method: "POST",
    }),
  previewImport: (file, mapping) => {
    const body = new FormData();
    body.append("file", file);
    if (mapping) {
      body.append("mapping", JSON.stringify(mapping));
    }
    return request("/imports/preview", { method: "POST", body });
  },
  commitImport: (commitToken) => request(`/imports/${commitToken.batchId || commitToken.fileHash}/commit`, { method: "POST" }),
};
