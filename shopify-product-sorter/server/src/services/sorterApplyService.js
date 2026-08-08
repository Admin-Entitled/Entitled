import crypto from "node:crypto";
import { AppError } from "../middleware/errorBoundary.js";
import {
  createBackup,
  saveCollectionSnapshot,
  upsertCollectionSettings,
} from "./collectionStateService.js";
import { syncCollectionOrder } from "./shopifyService.js";

const STALE_MESSAGE =
  "The collection changed after this preview was generated. Sync and generate a new preview before applying.";

/**
 * Rebuild a snapshot so products follow `orderIds` (1-based positions).
 */
export function reorderSnapshot(snapshot, orderIds) {
  const mapped = new Map(snapshot.products.map((product) => [product.id, product]));
  return {
    ...snapshot,
    syncedAt: new Date().toISOString(),
    products: orderIds.map((productId, index) => ({
      ...mapped.get(productId),
      collectionPosition: index + 1,
    })),
  };
}

/**
 * Deterministic, server-owned preview version derived only from safe snapshot
 * metadata: collection ID, snapshot syncedAt, sorted current product IDs and
 * product count. Never exposes product IDs to the browser by itself; it is a
 * concurrency/staleness guard only, not an authentication mechanism.
 */
export function computePreviewVersion(collectionId, snapshot, strategy = {}) {
  const orderedIds = snapshot.products
    .slice()
    .sort((left, right) => left.collectionPosition - right.collectionPosition)
    .map((product) => product.id);
  const material = [
    collectionId,
    snapshot.syncedAt || "",
    snapshot.products.length,
    strategy.version || "",
    strategy.hash || "",
    ...orderedIds,
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 16);
}

/**
 * Element-level validation of the orderIds array.
 *
 * Rejects non-arrays, empty arrays, non-string entries, blank entries and
 * duplicate entries before any Shopify interaction.
 */
export function validateOrderIds(orderIds) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new AppError(
      "INVALID_ORDER_IDS",
      "The generated order contains invalid product identifiers.",
      { statusCode: 400 },
    );
  }

  for (const id of orderIds) {
    if (typeof id !== "string" || id.trim() === "") {
      throw new AppError(
        "INVALID_ORDER_IDS",
        "The generated order contains invalid product identifiers.",
        { statusCode: 400 },
      );
    }
  }

  if (new Set(orderIds).size !== orderIds.length) {
    throw new AppError(
      "DUPLICATE_ORDER_IDS",
      "The generated order contains duplicate product identifiers.",
      { statusCode: 400 },
    );
  }
}

/**
 * Counts-only description of how the received order differs from the current
 * snapshot product set. Never includes the product ID lists themselves.
 */
function setMismatchDetails(snapshot, orderIds) {
  const currentIds = snapshot.products
    .slice()
    .sort((left, right) => left.collectionPosition - right.collectionPosition)
    .map((product) => product.id);
  const currentSet = new Set(currentIds);
  const receivedSet = new Set(orderIds);

  return {
    expectedCount: currentIds.length,
    receivedCount: orderIds.length,
    missingCount: currentIds.filter((id) => !receivedSet.has(id)).length,
    unexpectedCount: orderIds.filter((id) => !currentSet.has(id)).length,
  };
}

/**
 * Enforce the preview-to-apply staleness contract before any Shopify write:
 *
 * 1. When a previewVersion is supplied (generated preview), it must match the
 *    version recomputed from the current snapshot. Generated applies always
 *    carry a version; rollback-style applies (backup restore) omit it.
 * 2. The received order must be the exact unique product set of the current
 *    snapshot — Set-based comparison, no O(n²) includes.
 *
 * Returns the counts-only details when the apply is valid.
 */
export function assertApplyOrderValid(collectionId, snapshot, orderIds, previewVersion, strategy) {
  if (previewVersion !== undefined && previewVersion !== null) {
    const currentVersion = computePreviewVersion(collectionId, snapshot, strategy);
    if (currentVersion !== previewVersion) {
      throw new AppError("GENERATED_ORDER_STALE", STALE_MESSAGE, {
        statusCode: 409,
        details: setMismatchDetails(snapshot, orderIds),
      });
    }
  }

  const details = setMismatchDetails(snapshot, orderIds);
  if (
    details.expectedCount !== details.receivedCount ||
    details.missingCount > 0 ||
    details.unexpectedCount > 0
  ) {
    throw new AppError("GENERATED_ORDER_STALE", STALE_MESSAGE, {
      statusCode: 409,
      details,
    });
  }
}

/**
 * Apply a generated (or rollback) order to Shopify.
 *
 * Order of operations (all validation precedes every mutation):
 *   1. validateOrderIds        -> 400 INVALID_ORDER_IDS / DUPLICATE_ORDER_IDS
 *   2. assertApplyOrderValid   -> 409 GENERATED_ORDER_STALE
 *   3. createBackup
 *   4. syncCollectionOrder (the only Shopify write, injected for tests)
 *   5. persist the reordered snapshot + lastAppliedOrder settings
 *
 * `syncCollectionOrderFn` is injectable so tests can prove call counts without
 * ever issuing a live Shopify mutation.
 */
export async function applyGeneratedOrder(
  collectionId,
  snapshot,
  newOrderIds,
  { previewVersion, strategy, syncCollectionOrderFn = syncCollectionOrder } = {},
) {
  validateOrderIds(newOrderIds);
  assertApplyOrderValid(collectionId, snapshot, newOrderIds, previewVersion, strategy);

  createBackup(
    collectionId,
    "apply",
    snapshot.products.map((product) => ({
      id: product.id,
      title: product.title,
      position: product.collectionPosition,
    })),
  );

  const result = await syncCollectionOrderFn(collectionId, newOrderIds);
  saveCollectionSnapshot(
    collectionId,
    reorderSnapshot(snapshot, result.collection.products.map((product) => product.id)),
  );
  upsertCollectionSettings(collectionId, snapshot.collection.title, {
    lastAppliedOrder: newOrderIds,
  });

  return { ...result, manualSort: result.collection.collection.sortOrder };
}
