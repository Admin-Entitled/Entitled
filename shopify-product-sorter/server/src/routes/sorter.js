import express from "express";
import {
  createBackup,
  getCollectionSettings,
  getCollectionSnapshot,
  getLatestBackup,
  getProductPreferences,
  saveCollectionSnapshot,
  upsertCollectionSettings,
} from "../services/collectionStateService.js";
import {
  fetchCollectionProducts,
  fetchCollections,
  fetchSalesMetrics,
  syncCollectionOrder,
} from "../services/shopifyService.js";
import { generateOrder } from "../services/sorter.js";
import { getStrategySettings, saveStrategySettings } from "../services/strategySettings.js";
import {
  addActionLog,
  addNetworkLog,
  createRun,
  finishRun,
  getActiveRun,
  isRunActive,
  recoverStaleRuns,
  updateRun,
} from "../services/sorterRuntimeService.js";
import { logError, logInfo } from "../utils/logger.js";

const router = express.Router();

function mergeSnapshotWithPreferences(collectionId, snapshot) {
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

function reorderSnapshot(snapshot, orderIds) {
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

function saveSnapshot(payload, salesMetrics) {
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

async function settingsFor(collectionId) {
  return { ...getCollectionSettings(collectionId), ...(await getStrategySettings(collectionId)) };
}

async function applyGeneratedOrder(collectionId, snapshot, newOrderIds) {
  const oldOrderIds = snapshot.products
    .slice()
    .sort((left, right) => left.collectionPosition - right.collectionPosition)
    .map((product) => product.id);
  const sameProducts = oldOrderIds.length === newOrderIds.length && oldOrderIds.every((productId) => newOrderIds.includes(productId));
  if (!sameProducts) throw new Error("Generated order does not match the current collection product set.");
  createBackup(collectionId, "apply", snapshot.products.map((product) => ({ id: product.id, title: product.title, position: product.collectionPosition })));
  const result = await syncCollectionOrder(collectionId, newOrderIds);
  saveCollectionSnapshot(collectionId, reorderSnapshot(snapshot, result.collection.products.map((product) => product.id)));
  upsertCollectionSettings(collectionId, snapshot.collection.title, { lastAppliedOrder: newOrderIds });
  return { ...result, manualSort: result.collection.collection.sortOrder };
}

function buildCollectionResult({
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
  };
}

router.post("/collections/generate", async (req, res) => {
  try {
    const { collectionId, settings: inputSettings } = req.body;
    if (!collectionId) {
      return res.status(400).json({ error: "Missing collectionId in request body" });
    }
    const snapshot = mergeSnapshotWithPreferences(collectionId, getCollectionSnapshot(collectionId));
    if (!snapshot) {
      return res.status(404).json({ error: "Collection snapshot not found. Sync first." });
    }

    if (inputSettings) await saveStrategySettings(collectionId, inputSettings);
    const settings = await settingsFor(collectionId);

    const order = generateOrder(snapshot.products, settings);
    const oldOrder = snapshot.products
      .slice()
      .sort((left, right) => left.collectionPosition - right.collectionPosition);

    upsertCollectionSettings(collectionId, snapshot.collection.title, { lastGeneratedOrder: order.map((product) => product.id) });

    res.json({
      oldOrder,
      newOrder: order,
      affectedCount: order.filter(
        (product) => product.collectionPosition !== product.finalPosition,
      ).length,
      settings: await settingsFor(collectionId),
    });
  } catch (error) {
    logError("Failed to generate order", error, { collectionId: req.body.collectionId });
    res.status(500).json({ error: "Failed to generate order", detail: error.message });
  }
});

router.post("/collections/apply", async (req, res) => {
  try {
    const { collectionId, orderIds: newOrderIds } = req.body;
    if (!collectionId) {
      return res.status(400).json({ error: "Missing collectionId in request body" });
    }
    const snapshot = mergeSnapshotWithPreferences(collectionId, getCollectionSnapshot(collectionId));
    if (!snapshot) {
      return res.status(404).json({ error: "Collection snapshot not found. Sync first." });
    }

    if (!Array.isArray(newOrderIds) || !newOrderIds.length) {
      return res.status(400).json({ error: "No generated order supplied." });
    }

    const result = await applyGeneratedOrder(collectionId, snapshot, newOrderIds);

    logInfo("Apply order completed", {
      collectionId,
      affectedCount: result.changed,
    });

    res.json({
      ok: true,
      manualSort: result.manualSort,
      affectedCount: result.changed,
      backup: getLatestBackup(collectionId),
    });
  } catch (error) {
    logError("Failed to apply Shopify order", error, { collectionId: req.body.collectionId });
    res.status(500).json({ error: "Failed to apply Shopify order", detail: error.message });
  }
});

router.post("/collections/reorder-all-v2", async (req, res) => {
  recoverStaleRuns("reorder-all");
  const activeRun = getActiveRun("reorder-all");

  if (isRunActive(activeRun)) {
    return res.status(409).json({
      success: false,
      code: "SORTER_RUN_ALREADY_ACTIVE",
      message: "An Update All Collections run is already active.",
      runId: activeRun.id,
    });
  }

  const run = createRun("reorder-all");
  const summary = {
    success: true,
    runId: run.id,
    status: "running",
    totalCollections: 0,
    eligibleCollections: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    unchanged: 0,
    productsMoved: 0,
    results: [],
  };

  addActionLog({
    runId: run.id,
    actionType: "update_all_started",
    actionLabel: "Update All Collections started",
    status: "running",
  });

  try {
    const collectionsFetchStarted = Date.now();
    const collections = await fetchCollections();
    addNetworkLog({
      runId: run.id,
      provider: "shopify",
      operationName: "FetchCollections",
      method: "POST",
      endpoint: "graphql",
      status: "success",
      durationMs: Date.now() - collectionsFetchStarted,
      metadata: { collectionCount: collections.length },
    });

    summary.totalCollections = collections.length;
    summary.eligibleCollections = collections.filter((collection) => collection.type === "custom").length;

    updateRun(run.id, {
      status: "processing",
      totalCollections: summary.totalCollections,
      eligibleCollections: summary.eligibleCollections,
    });

    const customCollections = collections.filter((collection) => collection.type === "custom");
    const payloadById = new Map();

    for (const collection of customCollections) {
      const startedAt = Date.now();

      addActionLog({
        runId: run.id,
        actionType: "collection_fetch_started",
        actionLabel: "Collection data fetch started",
        status: "running",
        collectionId: collection.id,
        collectionTitle: collection.title,
      });

      try {
        const payload = await fetchCollectionProducts(collection.id);
        payloadById.set(collection.id, payload);
        addNetworkLog({
          runId: run.id,
          collectionId: collection.id,
          collectionTitle: collection.title,
          provider: "shopify",
          operationName: "FetchCollectionProducts",
          method: "POST",
          endpoint: "graphql",
          status: "success",
          durationMs: Date.now() - startedAt,
          metadata: { productsFetched: payload.products.length },
        });
      } catch (error) {
        summary.failed += 1;
        summary.success = false;
        summary.results.push(
          buildCollectionResult({
            collection,
            status: "failed",
            durationMs: Date.now() - startedAt,
            error: error.message,
            reason: "collection_fetch_failed",
          }),
        );
        addActionLog({
          runId: run.id,
          actionType: "collection_fetch_failed",
          actionLabel: "Collection data fetch failed",
          status: "failed",
          collectionId: collection.id,
          collectionTitle: collection.title,
          durationMs: Date.now() - startedAt,
          errorMessage: error.message,
        });
      }
    }

    const metricsStarted = Date.now();
    const allProductIds = [...new Set([...payloadById.values()].flatMap((payload) => payload.products.map((product) => product.id)))];
    const allSales = allProductIds.length ? await fetchSalesMetrics(allProductIds) : {};
    addNetworkLog({
      runId: run.id,
      provider: "shopify",
      operationName: "FetchSalesMetrics",
      method: "POST",
      endpoint: "graphql",
      status: "success",
      durationMs: Date.now() - metricsStarted,
      metadata: { productsMeasured: allProductIds.length },
    });

    for (const collection of collections) {
      const collectionStarted = Date.now();
      updateRun(run.id, {
        status: "processing",
        totalCollections: summary.totalCollections,
        eligibleCollections: summary.eligibleCollections,
        succeeded: summary.succeeded,
        failed: summary.failed,
        skipped: summary.skipped,
        unchanged: summary.unchanged,
        movedProducts: summary.productsMoved,
        currentCollectionId: collection.id,
        currentCollectionTitle: collection.title,
      });

      if (collection.type !== "custom") {
        summary.skipped += 1;
        summary.results.push(
          buildCollectionResult({
            collection,
            status: "skipped",
            durationMs: Date.now() - collectionStarted,
            reason: "unsupported_collection_type",
            error: "Shopify smart collections cannot be manually reordered through this flow.",
          }),
        );
        addActionLog({
          runId: run.id,
          actionType: "collection_skipped",
          actionLabel: "Collection skipped",
          status: "skipped",
          collectionId: collection.id,
          collectionTitle: collection.title,
          durationMs: Date.now() - collectionStarted,
          errorMessage: "Unsupported collection type",
        });
        continue;
      }

      const payload = payloadById.get(collection.id);
      if (!payload) {
        continue;
      }

      try {
        const snapshot = saveSnapshot(payload, allSales);
        if (!snapshot.products.length) {
          summary.skipped += 1;
          summary.results.push(
            buildCollectionResult({
              collection,
              status: "skipped",
              durationMs: Date.now() - collectionStarted,
              reason: "empty_collection",
            }),
          );
          addActionLog({
            runId: run.id,
            actionType: "collection_skipped",
            actionLabel: "Collection skipped",
            status: "skipped",
            collectionId: collection.id,
            collectionTitle: collection.title,
            durationMs: Date.now() - collectionStarted,
            errorMessage: "Collection has no products",
          });
          continue;
        }

        const settings = await settingsFor(collection.id);
        const nextSnapshot = mergeSnapshotWithPreferences(collection.id, snapshot);
        const newOrder = generateOrder(nextSnapshot.products, settings);
        const orderIds = newOrder.map((product) => product.id);
        const currentOrderIds = snapshot.products.slice().sort((left, right) => left.collectionPosition - right.collectionPosition).map((product) => product.id);

        if (currentOrderIds.every((productId, index) => productId === orderIds[index])) {
          summary.unchanged += 1;
          summary.results.push(
            buildCollectionResult({
              collection,
              status: "unchanged",
              productsProcessed: snapshot.products.length,
              durationMs: Date.now() - collectionStarted,
              currentOrderIds,
              orderIds,
            }),
          );
          addActionLog({
            runId: run.id,
            actionType: "collection_unchanged",
            actionLabel: "Collection order unchanged",
            status: "unchanged",
            collectionId: collection.id,
            collectionTitle: collection.title,
            durationMs: Date.now() - collectionStarted,
          });
          continue;
        }

        createBackup(
          collection.id,
          "reorder-all-v2",
          snapshot.products.map((product) => ({ id: product.id, title: product.title, position: product.collectionPosition })),
        );

        const writeStarted = Date.now();
        const writeResult = await syncCollectionOrder(collection.id, orderIds);
        addNetworkLog({
          runId: run.id,
          collectionId: collection.id,
          collectionTitle: collection.title,
          provider: "shopify",
          operationName: "SyncCollectionOrder",
          method: "POST",
          endpoint: "graphql",
          status: "success",
          durationMs: Date.now() - writeStarted,
          metadata: { productsMoved: writeResult.changed },
        });

        const updatedSnapshot = reorderSnapshot(snapshot, writeResult.collection.products.map((product) => product.id));
        saveCollectionSnapshot(collection.id, updatedSnapshot);
        upsertCollectionSettings(collection.id, collection.title, {
          lastAppliedOrder: orderIds,
          lastGeneratedOrder: orderIds,
        });

        const verifiedOrderIds = updatedSnapshot.products.map((product) => product.id);
        const verificationMatched = verifiedOrderIds.every((productId, index) => productId === orderIds[index]);

        summary.succeeded += 1;
        summary.productsMoved += writeResult.changed;
        summary.results.push(
          buildCollectionResult({
            collection,
            status: "succeeded",
            productsProcessed: snapshot.products.length,
            productsMoved: writeResult.changed,
            verificationMatched,
            durationMs: Date.now() - collectionStarted,
            currentOrderIds,
            orderIds,
          }),
        );

        addActionLog({
          runId: run.id,
          actionType: "collection_reordered",
          actionLabel: "Collection reordered successfully",
          status: "succeeded",
          collectionId: collection.id,
          collectionTitle: collection.title,
          durationMs: Date.now() - collectionStarted,
          movedCount: writeResult.changed,
        });
      } catch (error) {
        summary.failed += 1;
        summary.success = false;
        summary.results.push(
          buildCollectionResult({
            collection,
            status: "failed",
            durationMs: Date.now() - collectionStarted,
            error: error.message,
            reason: "reorder_failed",
          }),
        );
        addActionLog({
          runId: run.id,
          actionType: "collection_reorder_failed",
          actionLabel: "Collection reorder failed",
          status: "failed",
          collectionId: collection.id,
          collectionTitle: collection.title,
          durationMs: Date.now() - collectionStarted,
          errorMessage: error.message,
        });
        logError("Failed reorder collection", error, { collectionId: collection.id, runId: run.id });
      }
    }

    finishRun(run.id, {
      status: summary.success ? "completed" : "failed",
      totalCollections: summary.totalCollections,
      eligibleCollections: summary.eligibleCollections,
      succeeded: summary.succeeded,
      failed: summary.failed,
      skipped: summary.skipped,
      unchanged: summary.unchanged,
      movedProducts: summary.productsMoved,
      resultsSummary: {
        totalResults: summary.results.length,
        succeededCount: summary.succeeded,
        failedCount: summary.failed,
        skippedCount: summary.skipped,
        unchangedCount: summary.unchanged,
      },
    });

    addActionLog({
      runId: run.id,
      actionType: "update_all_finished",
      actionLabel: "Update All Collections finished",
      status: summary.status,
      successCount: summary.succeeded,
      failedCount: summary.failed,
      skippedCount: summary.skipped,
      unchangedCount: summary.unchanged,
      movedCount: summary.productsMoved,
      completedAt: new Date().toISOString(),
    });

    return res.json(summary);
  } catch (error) {
    finishRun(run.id, {
      status: "failed",
      errorMessage: error.message,
      totalCollections: summary.totalCollections,
      eligibleCollections: summary.eligibleCollections,
      succeeded: summary.succeeded,
      failed: Math.max(summary.failed, 1),
      skipped: summary.skipped,
      unchanged: summary.unchanged,
      movedProducts: summary.productsMoved,
    });

    addActionLog({
      runId: run.id,
      actionType: "update_all_failed",
      actionLabel: "Update All Collections failed",
      status: "failed",
      errorMessage: error.message,
      failedCount: Math.max(summary.failed, 1),
      completedAt: new Date().toISOString(),
    });

    logError("Failed start collection reorder", error, { runId: run.id });
    return res.status(500).json({
      success: false,
      code: "SORTER_UPDATE_ALL_FAILED",
      message: "Failed to update collections.",
      detail: error.message,
      runId: run.id,
    });
  }
});

router.post("/collections/reorder-all", async (req, res) => {
  return res.redirect(307, "/api/collections/reorder-all-v2");
});

router.post("/collections/rollback", async (req, res) => {
  try {
    const { collectionId } = req.body;
    if (!collectionId) {
      return res.status(400).json({ error: "Missing collectionId in request body" });
    }
    const backup = getLatestBackup(collectionId);
    if (!backup) {
      return res.status(404).json({ error: "No backup available for rollback." });
    }

    const snapshot = mergeSnapshotWithPreferences(collectionId, getCollectionSnapshot(collectionId));
    if (!snapshot) {
      return res.status(404).json({ error: "Collection snapshot not found. Sync first." });
    }

    const rollbackOrderIds = backup.order
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((product) => product.id);

    const result = await syncCollectionOrder(collectionId, rollbackOrderIds);
    const nextSnapshot = reorderSnapshot(snapshot, result.collection.products.map((product) => product.id));
    saveCollectionSnapshot(collectionId, nextSnapshot);

    res.json({
      ok: true,
      rollback: "success",
      affectedCount: result.changed,
    });
  } catch (error) {
    logError("Rollback failed", error, { collectionId: req.body.collectionId });
    res.status(500).json({ error: "Rollback failed", detail: error.message });
  }
});

export default router;
