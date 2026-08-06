import { request } from "./api.js";

export const api = {
  getReadiness: () => request("/health/readiness"),
  getShopifyDebug: () => request("/debug/shopify"),
  getCollections: () => request("/collections"),
  getProducts: (collectionId) =>
    request(`/collection-products?collectionId=${encodeURIComponent(collectionId)}`),
  getState: (collectionId) =>
    request(`/collections/state?collectionId=${encodeURIComponent(collectionId)}`),
  getCollectionSnapshot: (collectionId) =>
    request(`/collections/state?collectionId=${encodeURIComponent(collectionId)}`),
  getActionLogs: ({ afterId = 0, limit = 30 } = {}) =>
    request(`/collections/logs/actions?afterId=${afterId}&limit=${limit}`),
  getNetworkLogs: ({ afterId = 0, limit = 30 } = {}) =>
    request(`/collections/logs/network?afterId=${afterId}&limit=${limit}`),
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
  reorderAllCollections: () =>
    request("/collections/reorder-all-v2", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  rollback: (collectionId) =>
    request("/collections/rollback", {
      method: "POST",
      body: JSON.stringify({ collectionId }),
    }),
};
