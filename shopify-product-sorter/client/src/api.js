const API_BASE = "/api";

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const baseHeaders = isFormData ? {} : { "Content-Type": "application/json" };
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...baseHeaders,
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || payload.error || "Request failed");
  }

  return payload;
}

export const api = {
  getActualSalesIntelligence: (days = 30) =>
    request(`/actual-sales-intelligence?days=${encodeURIComponent(days)}`),
  getSalesIntelligenceSummary: (days = 30, refresh = false) =>
    request(`/sales-intelligence/summary?days=${encodeURIComponent(days)}${refresh ? "&refresh=1" : ""}`),
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
  getShopifyDebug: () => request("/debug/shopify"),
  getCollections: () => request("/collections"),
  getProducts: (collectionId) =>
    request(`/collection-products?collectionId=${encodeURIComponent(collectionId)}`),
  getState: (collectionId) =>
    request(`/collections/state?collectionId=${encodeURIComponent(collectionId)}`),
  syncCollection: (collectionId) =>
    request("/collections/sync", {
      method: "POST",
      body: JSON.stringify({ collectionId }),
    }),
  updateSettings: (collectionId, body) =>
    request("/collections/settings", {
      method: "PUT",
      body: JSON.stringify({ collectionId, ...body }),
    }),
  updateProduct: (collectionId, productId, body) =>
    request("/collections/products/preference", {
      method: "PUT",
      body: JSON.stringify({ collectionId, productId, ...body }),
    }),
  generateOrder: (collectionId, settings) =>
    request("/collections/generate", {
      method: "POST",
      body: JSON.stringify({ collectionId, settings }),
    }),
  applyOrder: (collectionId, orderIds) =>
    request("/collections/apply", {
      method: "POST",
      body: JSON.stringify({ collectionId, orderIds }),
    }),
  rollback: (collectionId) =>
    request("/collections/rollback", {
      method: "POST",
      body: JSON.stringify({ collectionId }),
    }),
  searchSkuImages: (sku) =>
    request(`/sku-images/search?sku=${encodeURIComponent(sku)}`),
  loadAllSkuImages: () =>
    request("/sku-images/load-all", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  addSkuImageUpload: (formData) =>
    request("/sku-images/add-upload", {
      method: "POST",
      body: formData,
    }),
  addSkuImageUrl: (body) =>
    request("/sku-images/add-url", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  addSkuImage: (body) =>
    request("/sku-images/add", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteSkuImage: (body) =>
    request("/sku-images/delete", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reorderSkuImages: (body) =>
    request("/sku-images/reorder", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  bulkAddSkuImages: (body) =>
    request("/sku-images/bulk-add", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  bulkAddSkuImagesUpload: (formData) =>
    request("/sku-images/bulk-add-upload", {
      method: "POST",
      body: formData,
    }),
  bulkDeletePreview: (body) =>
    request("/sku-images/bulk-delete-preview", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  bulkDeleteConfirm: (body) =>
    request("/sku-images/bulk-delete-confirm", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
