import { request } from "./api.js";

/**
 * Diagnostics domain API client (Network Activity + System Diagnostics).
 *
 * Delegates all HTTP to the shared transport in api.js; owns only the
 * diagnostics endpoints so components never scatter raw fetch/request calls.
 */
export const api = {
  getNetworkLogs: (limit = 100) => request(`/collections/logs/network?limit=${limit}`),
  clearNetworkLogs: () => request("/collections/logs/network", { method: "DELETE" }),
  getActionLogs: (limit = 20) => request(`/collections/logs/actions?limit=${limit}`),
  getDiagnostics: () => request("/health/diagnostics"),
  getReadiness: () => request("/health/readiness"),
};
