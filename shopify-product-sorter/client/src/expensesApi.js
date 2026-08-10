import { request } from "./api.js";

/**
 * Client domain wrapper for consolidated monthly expenses.
 */
export const expensesApi = {
  getMonths() {
    return request("/expenses/months");
  },

  getSummary(month, bypassCache = false) {
    return request(`/expenses/summary?month=${month}&bypassCache=${bypassCache}`);
  },

  getBills(month) {
    return request(`/expenses/bills?month=${month}`);
  },

  getHistory() {
    return request("/expenses/history");
  },

  syncExpenses(month, bypassCache = false) {
    return request("/expenses/sync", {
      method: "POST",
      body: JSON.stringify({ month, bypassCache }),
    });
  },

  addBill(formData) {
    return request("/expenses/bills", {
      method: "POST",
      body: formData,
    });
  },

  getBillDownloadUrl(billId) {
    return `/api/expenses/bills/${billId}/download`;
  },

  getBulkDownloadUrl(month, provider = null) {
    let url = `/api/expenses/download?month=${month}`;
    if (provider) {
      url += `&provider=${provider}`;
    }
    return url;
  }
};

