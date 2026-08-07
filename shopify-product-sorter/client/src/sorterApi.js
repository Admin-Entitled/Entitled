import { request } from "./api.js";

const PRODUCT_GID_PATTERN = /^gid:\/\/shopify\/Product\/\d+$/;

/**
 * Client-side validation for the preview-to-apply order payload.
 *
 * Accepts an array of string Shopify product GIDs and returns it unchanged.
 * Rejects empty arrays, non-string or blank entries, malformed GIDs and
 * duplicates with safe, actionable messages. Callers must NOT send the request
 * when this throws — the preview stays visible for the operator.
 */
export function validateApplyOrderIds(orderIds) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new Error("Preview is empty. Generate a new order before applying.");
  }

  for (const id of orderIds) {
    if (typeof id !== "string" || id.trim() === "") {
      throw new Error("Preview contains invalid product data. Generate a new order before applying.");
    }
    if (!PRODUCT_GID_PATTERN.test(id)) {
      throw new Error("Preview contains an invalid product identifier. Generate a new order before applying.");
    }
  }

  if (new Set(orderIds).size !== orderIds.length) {
    throw new Error("Preview contains duplicate products. Generate a new order before applying.");
  }

  return orderIds;
}

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
  syncAllCollections: () =>
    request("/collections/sync-all", {
      method: "POST",
      body: JSON.stringify({}),
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
  applyOrder: (collectionId, orderIds, previewVersion) =>
    request("/collections/apply", {
      method: "POST",
      body: JSON.stringify({
        collectionId,
        orderIds,
        ...(previewVersion ? { previewVersion } : {}),
      }),
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
