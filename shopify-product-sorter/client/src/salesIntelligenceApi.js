import { request } from "./api.js";

export const api = {
  getActualSalesIntelligence: (days = 30) =>
    request(`/actual-sales-intelligence?days=${encodeURIComponent(days)}`),
  getSalesIntelligenceSummary: (days = 30, refresh = false) =>
    request(
      `/sales-intelligence/summary?days=${encodeURIComponent(days)}${refresh ? "&refresh=1" : ""}`,
    ),
  refreshSalesIntelligenceShopify: (days = 30) =>
    request(`/sales-intelligence/refresh-shopify?days=${encodeURIComponent(days)}`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  refreshSalesIntelligenceShiprocket: (days = 30) =>
    request(`/sales-intelligence/refresh-shiprocket?days=${encodeURIComponent(days)}`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  reconcileSalesIntelligence: (days = 30, refresh = false) =>
    request(`/sales-intelligence/reconcile?days=${encodeURIComponent(days)}`, {
      method: "POST",
      body: JSON.stringify({ refresh }),
    }),
  salesIntelligenceExportUrl: (type, days = 30) =>
    `/api/sales-intelligence/export?type=${encodeURIComponent(type)}&days=${encodeURIComponent(days)}`,
};
