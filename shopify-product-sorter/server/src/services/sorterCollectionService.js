import {
  getCollectionSettings,
  getProductPreferences,
  saveCollectionSnapshot,
} from "./collectionStateService.js";
import { fetchCollectionProducts, fetchSalesMetrics } from "./shopifyService.js";
import { getStrategySettings } from "./strategySettings.js";

/**
 * Sorter collection helpers: snapshot construction, preference merging,
 * settings resolution, and result shaping.
 *
 * Extracted from routes/sorter.js so route handlers stay thin and the snapshot
 * contract lives in one place.
 */

/**
 * Layer product preferences (allotment / rotation eligibility) onto a stored
 * snapshot before it is served or scored.
 */
export function mergeSnapshotWithPreferences(collectionId, snapshot) {
  if (!snapshot) {
    return null;
  }

  const preferences = getProductPreferences(collectionId);
  return {
    ...snapshot,
    products: snapshot.products.map((product) => ({
      ...product,
      allottedPosition: preferences[product.id]?.allottedPosition ?? null,
      includeInRotation: preferences[product.id]?.includeInRotation ?? true,
    })),
  };
}

/**
 * Build and persist a canonical snapshot from a fetched collection payload and
 * its sales metrics.
 */
export function saveSnapshot(payload, salesMetrics) {
  const snapshot = {
    collection: payload.collection,
    syncedAt: new Date().toISOString(),
    products: payload.products.map((product) => ({
      ...product,
      soldQuantity: salesMetrics[product.id]?.soldQuantity ?? 0,
      salesRevenue: salesMetrics[product.id]?.salesRevenue ?? 0,
      sales: salesMetrics[product.id]?.sales ?? { units7: 0, units30: 0, units90: 0, previous23: 0 },
      skuSales: salesMetrics[product.id]?.variants ?? {},
    })),
  };
  saveCollectionSnapshot(payload.collection.id, snapshot);
  return snapshot;
}

/**
 * Effective settings for a collection: persisted collection settings merged
 * with the resolved (global or overridden) strategy weights.
 */
export async function settingsFor(collectionId) {
  return { ...getCollectionSettings(collectionId), ...(await getStrategySettings(collectionId)) };
}

/**
 * Normalized per-collection result record used by bulk operations and
 * diagnostics.
 */
export function buildCollectionResult({
  collection,
  status,
  productsProcessed = 0,
  productsMoved = 0,
  verificationMatched = false,
  durationMs = 0,
  error = null,
  reason = null,
  currentOrderIds = [],
  orderIds = [],
  fetchedProducts = 0,
  expectedProducts = 0,
}) {
  return {
    collectionId: collection.id,
    collectionTitle: collection.title,
    collectionType: collection.type,
    status,
    productsProcessed,
    productsMoved,
    verificationMatched,
    durationMs,
    error,
    reason,
    beforeFirstProduct: currentOrderIds[0] ?? null,
    afterFirstProduct: orderIds[0] ?? currentOrderIds[0] ?? null,
    fetchedProducts,
    expectedProducts,
    complete: fetchedProducts >= expectedProducts,
  };
}

/**
 * Fetch a single collection's products plus sales metrics and persist the
 * resulting snapshot.
 */
export async function syncCollectionSnapshot(collectionId) {
  const payload = await fetchCollectionProducts(collectionId);
  const salesMetrics = await fetchSalesMetrics(payload.products.map((product) => product.id));
  return saveSnapshot(payload, salesMetrics);
}
