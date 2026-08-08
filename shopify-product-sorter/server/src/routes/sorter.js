import express from "express";
import {
  getCollectionSnapshot,
  getLatestBackup,
  saveCollectionSnapshot,
  upsertCollectionSettings,
  upsertProductPreference,
} from "../services/collectionStateService.js";
import {
  fetchCollectionProducts,
  fetchCollections,
  fetchSalesMetrics,
  syncCollectionOrder,
} from "../services/shopifyService.js";
import { generateOrder } from "../services/sorter.js";
import {
  applyGeneratedOrder,
  computePreviewVersion,
  reorderSnapshot,
  validateOrderIds,
} from "../services/sorterApplyService.js";
import { getStrategySettings, saveStrategySettings, resolveEffectiveStrategy } from "../services/strategySettings.js";
import { runReorderAllCollections } from "../services/sorterBulkReorderService.js";
import {
  clearNetworkLogs,
  listActionLogs,
  listNetworkLogs,
  listRuns,
} from "../services/sorterRuntimeService.js";
import {
  mergeSnapshotWithPreferences,
  saveSnapshot,
  settingsFor,
  syncCollectionSnapshot,
} from "../services/sorterCollectionService.js";
import { logError, logInfo } from "../utils/logger.js";
import { AppError } from "../middleware/errorBoundary.js";
import { shopifyCapabilityGuard } from "../middleware/shopifyCapability.js";
import { validateRequest } from "../middleware/requestValidation.js";
import { redactNestedSecrets } from "../utils/sanitize.js";

const generateCollectionSchema = {
  body: {
    collectionId: { type: "string", required: true },
  },
};

const applyCollectionSchema = {
  body: {
    collectionId: { type: "string", required: true },
    orderIds: { type: "array", required: true },
    previewVersion: { type: "string" },
  },
};

const rollbackCollectionSchema = {
  body: {
    collectionId: { type: "string", required: true },
  },
};

const collectionProductsSchema = {
  query: {
    collectionId: { type: "string", required: true },
  },
};

const syncCollectionSchema = {
  body: {
    collectionId: { type: "string", required: true },
  },
};

// Global sync (sync-all) has no required body fields.
const collectionStateSchema = {
  query: {
    collectionId: { type: "string", required: true },
  },
};

const updateSettingsSchema = {
  body: {
    collectionId: { type: "string", required: true },
  },
};

const updatePreferenceSchema = {
  body: {
    collectionId: { type: "string", required: true },
    productId: { type: "string", required: true },
  },
};

const router = express.Router();

router.post("/collections/generate", validateRequest(generateCollectionSchema), async (req, res, next) => {
  try {
    const { collectionId } = req.body;
    const snapshot = mergeSnapshotWithPreferences(collectionId, getCollectionSnapshot(collectionId));
    if (!snapshot) {
      throw new AppError("COLLECTION_SNAPSHOT_NOT_FOUND", "Collection snapshot not found. Sync first.", { statusCode: 404 });
    }

    const strategy = await resolveEffectiveStrategy(collectionId);
    const order = generateOrder(snapshot.products, { ...strategy.weights, collectionId, currentDate: new Date().toISOString() });
    const oldOrder = snapshot.products
      .slice()
      .sort((left, right) => left.collectionPosition - right.collectionPosition);

    upsertCollectionSettings(collectionId, snapshot.collection.title, { lastGeneratedOrder: order.map((product) => product.id) });

    // Detect preset name for UI display
    const { detectPreset } = await import("../services/sorter.js");
    const presetName = detectPreset(strategy.weights);

    res.json({
      oldOrder,
      newOrder: order,
      previewVersion: computePreviewVersion(collectionId, snapshot, strategy),
      affectedCount: order.filter(
        (product) => product.collectionPosition !== product.finalPosition,
      ).length,
      settings: await settingsFor(collectionId),
      strategyUsed: {
        source: strategy.source,
        preset: presetName,
        version: strategy.version,
        hash: strategy.hash,
        updatedAt: strategy.updatedAt,
        weights: strategy.weights,
      },
    });
  } catch (error) {
    logError("Failed to generate order", error, { collectionId: req.body.collectionId });
    next(error);
  }
});

router.post("/collections/apply", validateRequest(applyCollectionSchema), shopifyCapabilityGuard, async (req, res, next) => {
  try {
    const { collectionId, orderIds: newOrderIds, previewVersion } = req.body;
    validateOrderIds(newOrderIds);
    const snapshot = mergeSnapshotWithPreferences(collectionId, getCollectionSnapshot(collectionId));
    if (!snapshot) {
      throw new AppError("COLLECTION_SNAPSHOT_NOT_FOUND", "Collection snapshot not found. Sync first.", { statusCode: 404 });
    }

    const strategy = await resolveEffectiveStrategy(collectionId);
    const result = await applyGeneratedOrder(collectionId, snapshot, newOrderIds, { previewVersion, strategy });

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
    next(error);
  }
});

router.post("/collections/reorder-all-v2", shopifyCapabilityGuard, async (req, res) => {
  try {
    const summary = await runReorderAllCollections();
    return res.json(summary);
  } catch (error) {
    if (error.code === "SORTER_RUN_ALREADY_ACTIVE") {
      return res.status(409).json({
        success: false,
        code: "SORTER_RUN_ALREADY_ACTIVE",
        message: "An Update All Collections run is already active.",
        runId: error.runId,
      });
    }
    return res.status(500).json({
      success: false,
      code: "SORTER_UPDATE_ALL_FAILED",
      message: "Failed to update collections.",
      detail: error.message,
      runId: error.runId,
    });
  }
});

router.post("/collections/reorder-all", async (req, res) => {
  return res.redirect(307, "/api/collections/reorder-all-v2");
});

router.post("/collections/rollback", shopifyCapabilityGuard, validateRequest(rollbackCollectionSchema), async (req, res, next) => {
  try {
    const { collectionId } = req.body;
    const backup = getLatestBackup(collectionId);
    if (!backup) {
      throw new AppError("BACKUP_NOT_FOUND", "No backup available for rollback.", { statusCode: 404 });
    }

    const snapshot = mergeSnapshotWithPreferences(collectionId, getCollectionSnapshot(collectionId));
    if (!snapshot) {
      throw new AppError("COLLECTION_SNAPSHOT_NOT_FOUND", "Collection snapshot not found. Sync first.", { statusCode: 404 });
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
    next(error);
  }
});

router.get("/collections/logs/actions", (req, res, next) => {
  try {
    const afterId = Number(req.query.afterId || 0);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    res.json(redactNestedSecrets({
      logs: listActionLogs({ afterId, limit }),
      latestRun: listRuns("reorder-all", 1)[0] ?? null,
    }));
  } catch (error) {
    logError("Failed load sorter action logs", error);
    next(error);
  }
});

router.get("/collections/logs/network", (req, res, next) => {
  try {
    const afterId = Number(req.query.afterId || 0);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    res.json(redactNestedSecrets({
      logs: listNetworkLogs({ afterId, limit }),
      latestRun: listRuns("reorder-all", 1)[0] ?? null,
    }));
  } catch (error) {
    logError("Failed load sorter network logs", error);
    next(error);
  }
});

router.delete("/collections/logs/network", (req, res, next) => {
  try {
    clearNetworkLogs();
    res.json({ success: true, message: "Network logs cleared successfully" });
  } catch (error) {
    logError("Failed to clear network logs", error);
    next(error);
  }
});

router.get("/collections", shopifyCapabilityGuard, async (req, res, next) => {
  try {
    const collections = await fetchCollections();
    const enriched = await Promise.all(collections.map(async (collection) => ({
      ...collection,
      settings: await settingsFor(collection.id),
    })));
    res.json({ collections: enriched });
  } catch (error) {
    logError("Failed to fetch collections", error);
    next(error);
  }
});

router.get("/collection-products", shopifyCapabilityGuard, validateRequest(collectionProductsSchema), async (req, res, next) => {
  try {
    const collectionId = req.query.collectionId;
    const payload = await fetchCollectionProducts(collectionId);
    const salesMetrics = await fetchSalesMetrics(payload.products.map((product) => product.id));
    const products = payload.products.map((product) => ({
      ...product,
      soldQuantity: salesMetrics[product.id]?.soldQuantity ?? 0,
      salesRevenue: salesMetrics[product.id]?.salesRevenue ?? 0,
      sales: salesMetrics[product.id]?.sales ?? { units7: 0, units30: 0, units90: 0, previous23: 0 },
      skuSales: salesMetrics[product.id]?.variants ?? {},
    }));

    res.json({
      collection: payload.collection,
      products,
    });
  } catch (error) {
    const collectionId = req.query.collectionId;
    logError("Failed to fetch collection products", error, { collectionId });
    next(error);
  }
});

router.post("/collections/sync", shopifyCapabilityGuard, validateRequest(syncCollectionSchema), async (req, res, next) => {
  try {
    const { collectionId } = req.body;
    const snapshot = await syncCollectionSnapshot(collectionId);
    upsertCollectionSettings(collectionId, snapshot.collection.title, {
      selected: true,
    });

    res.json({
      snapshot: mergeSnapshotWithPreferences(collectionId, snapshot),
      settings: await settingsFor(collectionId),
    });
  } catch (error) {
    logError("Failed to sync collection", error, { collectionId: req.body.collectionId });
    next(error);
  }
});

/**
 * POST /collections/sync-all
 *
 * Global synchronization: fetches ALL Shopify collections and synchronizes
 * the product data required by Product Sorter for each one.
 *
 * Does NOT reorder, apply, or write anything to Shopify.
 * selectedCollection is irrelevant to this operation.
 *
 * Returns:
 *   { ok, totalCollections, synced, failed, results: [{ collectionId, collectionTitle, status, error? }] }
 */
router.post("/collections/sync-all", shopifyCapabilityGuard, async (req, res, next) => {
  try {
    const collections = await fetchCollections();
    const totalCollections = collections.length;

    // Collect all product IDs across all collections for a single sales-metrics fetch
    const payloadById = new Map();
    const fetchErrors = [];

    for (const collection of collections) {
      try {
        const payload = await fetchCollectionProducts(collection.id);
        payloadById.set(collection.id, payload);
      } catch (err) {
        fetchErrors.push({
          collectionId: collection.id,
          collectionTitle: collection.title,
          status: "failed",
          error: err.message,
        });
        logError("sync-all: failed to fetch collection products", err, { collectionId: collection.id });
      }
    }

    // One bulk sales-metrics call for all successfully fetched product IDs
    const allProductIds = [
      ...new Set(
        [...payloadById.values()].flatMap((payload) => payload.products.map((p) => p.id)),
      ),
    ];
    const allSales = allProductIds.length ? await fetchSalesMetrics(allProductIds) : {};

    const successResults = [];
    const snapshotErrors = [];

    for (const [collectionId, payload] of payloadById) {
      try {
        const snapshot = saveSnapshot(payload, allSales);
        upsertCollectionSettings(collectionId, snapshot.collection.title, {});
        successResults.push({
          collectionId,
          collectionTitle: snapshot.collection.title,
          status: "synced",
          productCount: snapshot.products.length,
        });
      } catch (err) {
        snapshotErrors.push({
          collectionId,
          collectionTitle: payload.collection?.title ?? collectionId,
          status: "failed",
          error: err.message,
        });
        logError("sync-all: failed to save snapshot", err, { collectionId });
      }
    }

    const allFailures = [...fetchErrors, ...snapshotErrors];
    const synced = successResults.length;
    const failed = allFailures.length;
    const ok = failed === 0;

    logInfo("sync-all completed", { totalCollections, synced, failed });

    return res.json({
      ok,
      totalCollections,
      synced,
      failed,
      results: [
        ...successResults,
        ...allFailures,
      ],
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    logError("sync-all: top-level failure", error);
    next(error);
  }
});

router.get("/collections/state", validateRequest(collectionStateSchema), async (req, res, next) => {
  try {
    const collectionId = req.query.collectionId;
    const snapshot = mergeSnapshotWithPreferences(collectionId, getCollectionSnapshot(collectionId));
    res.json({
      snapshot,
      settings: await settingsFor(collectionId),
      backup: getLatestBackup(collectionId),
    });
  } catch (error) {
    logError("Failed to load collection state", error, { collectionId: req.query.collectionId });
    next(error);
  }
});

router.put("/collections/settings", validateRequest(updateSettingsSchema), async (req, res, next) => {
  try {
    const { collectionId, ...settingsData } = req.body;
    const snapshot = getCollectionSnapshot(collectionId);
    const collectionTitle = snapshot?.collection?.title || settingsData.collectionTitle || "Untitled Collection";
    const hasStrategy = ["salesWeight", "revenueWeight", "inventoryWeight", "newnessWeight", "momentumWeight", "rotationWeight"].some((key) => Object.hasOwn(settingsData, key));
    const strategy = hasStrategy ? await saveStrategySettings(collectionId, settingsData) : await getStrategySettings(collectionId);
    const settings = upsertCollectionSettings(collectionId, collectionTitle, { selected: settingsData.selected, firstPageLimit: settingsData.firstPageLimit });
    // Return canonical server-side strategy so frontend can update savedSettings from truth
    res.json({ settings: { ...settings, ...strategy } });
  } catch (error) {
    logError("Failed to update settings", error, { collectionId: req.body.collectionId });
    next(error);
  }
});

router.put("/collections/products/preference", validateRequest(updatePreferenceSchema), (req, res, next) => {
  try {
    const { collectionId, productId, allottedPosition, includeInRotation } = req.body;
    upsertProductPreference(collectionId, productId, {
      allottedPosition: allottedPosition ? Number(allottedPosition) : null,
      includeInRotation: Boolean(includeInRotation),
    });
    res.json({ ok: true });
  } catch (error) {
    logError("Failed to update product preference", error, req.body);
    next(error);
  }
});

export default router;
