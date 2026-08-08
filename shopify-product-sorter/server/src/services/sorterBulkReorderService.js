import {
  createBackup,
  saveCollectionSnapshot,
  upsertCollectionSettings,
} from "./collectionStateService.js";
import {
  fetchCollectionProducts,
  fetchCollections,
  fetchSalesMetrics,
  syncCollectionOrder,
} from "./shopifyService.js";
import { generateOrder } from "./sorter.js";
import { resolveEffectiveStrategy } from "./strategySettings.js";
import { reorderSnapshot } from "./sorterApplyService.js";
import {
  addActionLog,
  addNetworkLog,
  createRun,
  finishRun,
  getActiveRun,
  isRunActive,
  recoverStaleRuns,
  updateRun,
} from "./sorterRuntimeService.js";
import {
  buildCollectionResult,
  mergeSnapshotWithPreferences,
  saveSnapshot,
} from "./sorterCollectionService.js";
import { logError } from "../utils/logger.js";

/**
 * Update All Collections — the reorder-all-v2 run orchestration.
 *
 * Owns the full lifecycle: stale-run recovery, concurrency guard, run record,
 * per-collection fetch/score/write loop, diagnostics logs, and the summary
 * contract consumed by the UI. Throws with `code`/`runId` attached on failure
 * so the route can map to the exact HTTP response shapes.
 */
export async function runReorderAllCollections() {
  recoverStaleRuns("reorder-all");
  const activeRun = getActiveRun("reorder-all");

  if (isRunActive(activeRun)) {
    const conflict = new Error("An Update All Collections run is already active.");
    conflict.code = "SORTER_RUN_ALREADY_ACTIVE";
    conflict.statusCode = 409;
    conflict.runId = activeRun.id;
    throw conflict;
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

    const payloadById = new Map();

    for (const collection of collections) {
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

      const payload = payloadById.get(collection.id);
      if (!payload) {
        continue;
      }

      let snapshot;
      try {
        snapshot = saveSnapshot(payload, allSales);
      } catch (error) {
        summary.failed += 1;
        summary.results.push(
          buildCollectionResult({
            collection,
            status: "failed",
            durationMs: Date.now() - collectionStarted,
            error: error.message,
            reason: "snapshot_save_failed",
            fetchedProducts: payload.fetchedCount,
            expectedProducts: payload.expectedCount,
          })
        );
        continue;
      }

      if (collection.type !== "custom") {
        summary.skipped += 1;
        summary.results.push(
          buildCollectionResult({
            collection,
            status: "skipped",
            durationMs: Date.now() - collectionStarted,
            reason: "unsupported_collection_type",
            error: "Shopify smart collections cannot be manually reordered through this flow.",
            fetchedProducts: payload.fetchedCount,
            expectedProducts: payload.expectedCount,
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

      if (!snapshot.products.length) {
        summary.skipped += 1;
        summary.results.push(
          buildCollectionResult({
            collection,
            status: "skipped",
            durationMs: Date.now() - collectionStarted,
            reason: "empty_collection",
            fetchedProducts: payload.fetchedCount,
            expectedProducts: payload.expectedCount,
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

      try {
        const strategy = await resolveEffectiveStrategy(collection.id);
        const nextSnapshot = mergeSnapshotWithPreferences(collection.id, snapshot);
        const newOrder = generateOrder(nextSnapshot.products, { ...strategy.weights, collectionId: collection.id, currentDate: new Date().toISOString() });
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
              fetchedProducts: payload.fetchedCount,
              expectedProducts: payload.expectedCount,
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
            fetchedProducts: payload.fetchedCount,
            expectedProducts: payload.expectedCount,
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
            fetchedProducts: payload.fetchedCount,
            expectedProducts: payload.expectedCount,
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

    return summary;
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
    error.runId = run.id;
    throw error;
  }
}

