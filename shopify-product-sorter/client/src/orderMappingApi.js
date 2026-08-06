import { request } from "./api.js";

export const api = {
  orders: (params = {}, options = {}) =>
    request(`/order-mapping/orders?${new URLSearchParams({ queue: "ALL", ...params })}`, options),
  order: (id) => request(`/order-mapping/orders/${id}`),
  networkLogs: (limit = 30) => request(`/order-mapping/logs/network?limit=${limit}`),
  actionLogs: (limit = 30) => request(`/order-mapping/logs/actions?limit=${limit}`),
  syncShopify: (range = {}) =>
    request("/order-mapping/sync/shopify", {
      method: "POST",
      body: JSON.stringify(range),
    }),
  refreshShiprocket: (force = false) =>
    request("/order-mapping/sync/shiprocket", {
      method: "POST",
      body: JSON.stringify({ force }),
    }),
  refreshShipment: (shipmentId, force = true) =>
    request(`/order-mapping/shipments/${shipmentId}/refresh`, {
      method: "POST",
      body: JSON.stringify({ force }),
    }),
  manual: (shipmentId, payload) =>
    request(`/order-mapping/shipments/${shipmentId}/manual`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  clearManual: (shipmentId) =>
    request(`/order-mapping/shipments/${shipmentId}/clear-manual`, {
      method: "POST",
    }),
  previewImport: (file, mapping) => {
    const body = new FormData();
    body.append("file", file);
    if (mapping) {
      body.append("mapping", JSON.stringify(mapping));
    }
    return request("/order-mapping/imports/preview", { method: "POST", body });
  },
  commitImport: (commitToken) =>
    request(`/order-mapping/imports/${commitToken.batchId || commitToken.fileHash}/commit`, {
      method: "POST",
    }),
};
