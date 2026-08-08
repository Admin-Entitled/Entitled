import assert from "node:assert/strict";
import test from "node:test";
import {
  getCollectionSnapshot,
  upsertProductPreference,
} from "./collectionStateService.js";
import {
  buildCollectionResult,
  mergeSnapshotWithPreferences,
  saveSnapshot,
} from "./sorterCollectionService.js";

const COLLECTION_ID = "gid://shopify/Collection/collection-service-test";

test("sorterCollectionService: mergeSnapshotWithPreferences layers default preferences", () => {
  const snapshot = {
    collection: { id: COLLECTION_ID, title: "Test" },
    syncedAt: "2026-08-01T00:00:00Z",
    products: [{ id: "gid://shopify/Product/1", title: "A" }],
  };

  const merged = mergeSnapshotWithPreferences(COLLECTION_ID, snapshot);
  assert.equal(merged.products[0].allottedPosition, null);
  assert.equal(merged.products[0].includeInRotation, true);
  // The original snapshot object is never mutated.
  assert.equal(snapshot.products[0].includeInRotation, undefined);
});

test("sorterCollectionService: mergeSnapshotWithPreferences applies stored preferences", () => {
  upsertProductPreference(COLLECTION_ID, "gid://shopify/Product/1", {
    allottedPosition: 3,
    includeInRotation: false,
  });

  const snapshot = {
    collection: { id: COLLECTION_ID, title: "Test" },
    syncedAt: "2026-08-01T00:00:00Z",
    products: [{ id: "gid://shopify/Product/1", title: "A" }],
  };

  const merged = mergeSnapshotWithPreferences(COLLECTION_ID, snapshot);
  assert.equal(merged.products[0].allottedPosition, 3);
  assert.equal(merged.products[0].includeInRotation, false);
});

test("sorterCollectionService: saveSnapshot persists and enriches sales metrics", () => {
  const payload = {
    collection: { id: COLLECTION_ID, title: "Test" },
    products: [{ id: "gid://shopify/Product/2", title: "B", status: "ACTIVE" }],
  };
  const salesMetrics = {
    "gid://shopify/Product/2": {
      soldQuantity: 12,
      salesRevenue: 5000,
      sales: { units7: 2, units30: 8, units90: 12, previous23: 6 },
      variants: { "gid://shopify/Variant/9": 12 },
    },
  };

  const snapshot = saveSnapshot(payload, salesMetrics);
  assert.equal(snapshot.collection.id, COLLECTION_ID);
  assert.equal(snapshot.products[0].soldQuantity, 12);
  assert.equal(snapshot.products[0].salesRevenue, 5000);
  assert.deepEqual(snapshot.products[0].sales, { units7: 2, units30: 8, units90: 12, previous23: 6 });
  assert.deepEqual(snapshot.products[0].skuSales, { "gid://shopify/Variant/9": 12 });

  // Persisted round-trip must preserve the same shape.
  const stored = getCollectionSnapshot(COLLECTION_ID);
  assert.equal(stored.products[0].id, "gid://shopify/Product/2");
  assert.equal(stored.products[0].salesRevenue, 5000);
});

test("sorterCollectionService: buildCollectionResult normalizes bulk-operation records", () => {
  const collection = { id: COLLECTION_ID, title: "Test", type: "custom" };
  const result = buildCollectionResult({
    collection,
    status: "succeeded",
    productsProcessed: 10,
    productsMoved: 3,
    verificationMatched: true,
    durationMs: 42,
    currentOrderIds: ["gid://shopify/Product/1", "gid://shopify/Product/2"],
    orderIds: ["gid://shopify/Product/2", "gid://shopify/Product/1"],
    fetchedProducts: 10,
    expectedProducts: 10,
  });

  assert.equal(result.collectionId, COLLECTION_ID);
  assert.equal(result.status, "succeeded");
  assert.equal(result.productsMoved, 3);
  assert.equal(result.beforeFirstProduct, "gid://shopify/Product/1");
  assert.equal(result.afterFirstProduct, "gid://shopify/Product/2");
  assert.equal(result.complete, true);

  const incomplete = buildCollectionResult({
    collection,
    status: "failed",
    fetchedProducts: 5,
    expectedProducts: 10,
  });
  assert.equal(incomplete.complete, false);
});
