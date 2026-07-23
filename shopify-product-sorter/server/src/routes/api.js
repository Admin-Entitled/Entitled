import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import multer from "multer";
import {
  createBackup,
  getCollectionSettings,
  getCollectionSnapshot,
  getLatestBackup,
  getProductPreferences,
  saveCollectionSnapshot,
  upsertCollectionSettings,
  upsertProductPreference,
} from "../services/collectionStateService.js";
import {
  fetchCollectionProducts,
  fetchCollections,
  fetchSalesMetrics,
  fetchShopCounts,
  syncCollectionOrder,
} from "../services/shopifyService.js";
import {
  addImageToSkuProduct,
  bulkAddImageToSkuProducts,
  confirmBulkDelete,
  deleteImageFromSkuProduct,
  previewBulkDelete,
  reorderSkuProductImages,
  searchSkuImageProducts,
} from "../services/shopifyMediaService.js";
import { getCachedTokenStatus } from "../services/shopifyAuth.js";
import { env } from "../config/env.js";
import { generateOrder } from "../services/sorter.js";
import { getStrategySettings, saveStrategySettings } from "../services/strategySettings.js";
import {
  getActualSalesSummary,
  getSalesAnalyticsSlice,
  getSalesExport,
  reconcileSalesData,
  refreshShopifySalesData,
  refreshShiprocketSalesData,
} from "../services/actualSalesService.js";
import {
  addActionLog,
  addNetworkLog,
  clearCurrentSorterRunContext,
  createRun,
  finishRun,
  getActiveRun,
  getRun,
  isRunActive,
  listActionLogs,
  listNetworkLogs,
  listRuns,
  recoverStaleRuns,
  setCurrentSorterRunContext,
  updateRun,
} from "../services/sorterRuntimeService.js";
import { logError, logInfo } from "../utils/logger.js";

const router = express.Router();
const upload = multer({
  dest: path.join(os.tmpdir(), "sku-image-manager-uploads"),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, callback) => {
    if (file.mimetype?.startsWith("image/")) {
      callback(null, true);
      return;
    }
    callback(new Error("Only image uploads are allowed"));
  },
});

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

async function syncCollectionSnapshot(collectionId) {
  const payload = await fetchCollectionProducts(collectionId);
  const salesMetrics = await fetchSalesMetrics(payload.products.map((product) => product.id));
  return saveSnapshot(payload, salesMetrics);
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

function normalizeProductIds(snapshot) {
  return snapshot.products
    .slice()
    .sort((left, right) => left.collectionPosition - right.collectionPosition)
    .map((product) => product.id);
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

function normalizeSkuItems(items) {
  return Array.isArray(items)
    ? items
      .filter((item) => item && item.productId && item.variantId && item.sku)
      .map((item) => ({
        sku: item.sku,
        productTitle: item.productTitle || item.title || "Untitled product",
        productId: item.productId,
        variantId: item.variantId,
      }))
    : [];
}

async function buildUploadPayload(file) {
  if (!file?.path) {
    throw new Error("Image file is required");
  }

  const buffer = await fs.readFile(file.path);
  await fs.unlink(file.path).catch(() => {});

  return {
    fileName: file.originalname,
    mimeType: file.mimetype || "image/jpeg",
    contentBase64: buffer.toString("base64"),
  };
}

router.get("/health", (req, res) => {
  res.json({ ok: true });
});

router.get("/collections/logs/actions", (req, res) => {
  try {
    const afterId = Number(req.query.afterId || 0);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    res.json({
      logs: listActionLogs({ afterId, limit }),
      latestRun: listRuns("reorder-all", 1)[0] ?? null,
    });
  } catch (error) {
    logError("Failed load sorter action logs", error);
    res.status(500).json({
      error: "Failed to load action logs",
      detail: error.message,
    });
  }
});

router.get("/collections/logs/network", (req, res) => {
  try {
    const afterId = Number(req.query.afterId || 0);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    res.json({
      logs: listNetworkLogs({ afterId, limit }),
      latestRun: listRuns("reorder-all", 1)[0] ?? null,
    });
  } catch (error) {
    logError("Failed load sorter network logs", error);
    res.status(500).json({
      error: "Failed to load network logs",
      detail: error.message,
    });
  }
});

router.get("/debug/shopify", async (req, res) => {
  try {
    const tokenStatus = getCachedTokenStatus();
    let collectionsCount = 0;
    let productsCount = 0;
    let lastError = tokenStatus.lastAuthError;

    if (env.shopifyStoreDomain && env.shopifyClientId && env.shopifyClientSecret) {
      try {
        const counts = await fetchShopCounts();
        collectionsCount = counts.collectionsCount;
        productsCount = counts.productsCount;
      } catch (err) {
        lastError = err.message;
      }
    }

    res.json({
      authStatus: tokenStatus.isFresh ? "authenticated" : "not_authenticated",
      tokenAcquired: tokenStatus.hasToken,
      shopDomain: env.shopifyStoreDomain,
      apiVersion: env.shopifyApiVersion,
      collectionsCount,
      productsCount,
      lastShopifyError: lastError,
    });
  } catch (error) {
    logError("Shopify debug check failed", error);
    res.status(500).json({ error: "Shopify debug check failed", detail: error.message });
  }
});

router.post("/sales-intelligence/refresh-shopify", async (req, res) => {
  try {
    const payload = await refreshShopifySalesData({ days: req.query.days || req.body?.days });
    res.json(payload);
  } catch (error) {
    logError("Failed to refresh Shopify sales intelligence data", error, { days: req.query.days || req.body?.days });
    res.status(500).json({
      error: "Failed to refresh Shopify sales intelligence data",
      detail: error.message,
    });
  }
});

router.post("/sales-intelligence/refresh-shiprocket", async (req, res) => {
  try {
    const payload = await refreshShiprocketSalesData({ days: req.query.days || req.body?.days });
    res.json(payload);
  } catch (error) {
    logError("Failed to refresh Shiprocket sales intelligence data", error, { days: req.query.days || req.body?.days });
    res.status(500).json({
      error: "Failed to refresh Shiprocket sales intelligence data",
      detail: error.message,
    });
  }
});

router.post("/sales-intelligence/reconcile", async (req, res) => {
  try {
    const payload = await reconcileSalesData({
      days: req.query.days || req.body?.days,
      forceRefresh: Boolean(req.body?.refresh),
    });
    res.json(payload);
  } catch (error) {
    logError("Failed to reconcile sales intelligence data", error, { days: req.query.days || req.body?.days });
    res.status(500).json({
      error: "Failed to reconcile sales intelligence data",
      detail: error.message,
    });
  }
});

router.get("/sales-intelligence/summary", async (req, res) => {
  try {
    const payload = await getActualSalesSummary({
      days: req.query.days,
      refresh: String(req.query.refresh || "") === "1",
    });
    res.json(payload);
  } catch (error) {
    logError("Failed to build sales intelligence summary", error, { days: req.query.days });
    res.status(500).json({
      error: "Failed to build sales intelligence summary",
      detail: error.message,
    });
  }
});

router.get("/sales-intelligence/reconciled-orders", async (req, res) => {
  try {
    const payload = await getActualSalesSummary({
      days: req.query.days,
      refresh: String(req.query.refresh || "") === "1",
    });
    res.json({
      meta: payload.meta,
      reconciledOrders: payload.reconciledOrders,
      unmatchedShiprocketOrders: payload.unmatchedShiprocketOrders,
    });
  } catch (error) {
    logError("Failed to load reconciled sales intelligence orders", error, { days: req.query.days });
    res.status(500).json({
      error: "Failed to load reconciled sales intelligence orders",
      detail: error.message,
    });
  }
});

for (const [pathSuffix, sliceKey] of [
  ["brand-performance", "brandPerformance"],
  ["type-performance", "typePerformance"],
  ["color-performance", "colorPerformance"],
  ["sku-performance", "skuPerformance"],
  ["courier-performance", "courierPerformance"],
  ["pincode-performance", "pincodePerformance"],
  ["state-performance", "statePerformance"],
  ["city-performance", "cityPerformance"],
  ["payment-method-performance", "paymentMethodPerformance"],
  ["rto-analysis", "rtoAnalysis"],
  ["restock-suggestions", "restockSuggestions"],
  ["reconciliation-issues", "reconciliationIssues"],
  ["recommendations", "recommendations"],
  ["pending-risk", "pendingRisk"],
]) {
  router.get(`/sales-intelligence/${pathSuffix}`, async (req, res) => {
    try {
      const payload = await getSalesAnalyticsSlice(sliceKey, {
        days: req.query.days,
        refresh: String(req.query.refresh || "") === "1",
      });
      res.json(payload);
    } catch (error) {
      logError(`Failed to load sales intelligence ${sliceKey}`, error, { days: req.query.days });
      res.status(500).json({
        error: `Failed to load sales intelligence ${sliceKey}`,
        detail: error.message,
      });
    }
  });
}

router.get("/sales-intelligence/export", async (req, res) => {
  try {
    const { filename, csv } = await getSalesExport({
      type: req.query.type,
      days: req.query.days,
      refresh: String(req.query.refresh || "") === "1",
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    logError("Failed to export sales intelligence data", error, { type: req.query.type, days: req.query.days });
    res.status(500).json({
      error: "Failed to export sales intelligence data",
      detail: error.message,
    });
  }
});

router.get("/actual-sales-intelligence", async (req, res) => {
  try {
    const payload = await getActualSalesSummary({
      days: req.query.days,
      refresh: String(req.query.refresh || "") === "1",
    });
    res.json(payload);
  } catch (error) {
    logError("Failed to build actual sales intelligence", error, { days: req.query.days });
    res.status(500).json({
      error: "Failed to build actual sales intelligence",
      detail: error.message,
    });
  }
});

router.get("/collections", async (req, res) => {
  try {
    const collections = await fetchCollections();
    const enriched = await Promise.all(collections.map(async (collection) => ({
      ...collection,
      settings: await settingsFor(collection.id),
    })));
    res.json({ collections: enriched });
  } catch (error) {
    logError("Failed to fetch collections", error);
    res.status(500).json({ error: "Failed to fetch collections", detail: error.message });
  }
});

router.get("/collection-products", async (req, res) => {
  try {
    const collectionId = req.query.collectionId;
    if (!collectionId) {
      return res.status(400).json({ error: "Missing collectionId query parameter" });
    }
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
    res.status(500).json({ error: "Failed to fetch collection products", detail: error.message });
  }
});

router.post("/collections/sync", async (req, res) => {
  try {
    const { collectionId } = req.body;
    if (!collectionId) {
      return res.status(400).json({ error: "Missing collectionId in request body" });
    }
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
    res.status(500).json({ error: "Failed to sync collection", detail: error.message });
  }
});

router.get("/collections/state", async (req, res) => {
  try {
    const collectionId = req.query.collectionId;
    if (!collectionId) {
      return res.status(400).json({ error: "Missing collectionId query parameter" });
    }
    const snapshot = mergeSnapshotWithPreferences(collectionId, getCollectionSnapshot(collectionId));
    res.json({
      snapshot,
      settings: await settingsFor(collectionId),
      backup: getLatestBackup(collectionId),
    });
  } catch (error) {
    logError("Failed to load collection state", error, { collectionId: req.query.collectionId });
    res.status(500).json({ error: "Failed to load collection state", detail: error.message });
  }
});

router.put("/collections/settings", async (req, res) => {
  try {
    const { collectionId, ...settingsData } = req.body;
    if (!collectionId) {
      return res.status(400).json({ error: "Missing collectionId in request body" });
    }
    const snapshot = getCollectionSnapshot(collectionId);
    const collectionTitle = snapshot?.collection?.title || settingsData.collectionTitle || "Untitled Collection";
    const hasStrategy = ["salesWeight", "inventoryWeight", "newnessWeight", "momentumWeight", "rotationWeight"].some((key) => Object.hasOwn(settingsData, key));
    const strategy = hasStrategy ? await saveStrategySettings(collectionId, settingsData) : await getStrategySettings(collectionId);
    const settings = upsertCollectionSettings(collectionId, collectionTitle, { selected: settingsData.selected, firstPageLimit: settingsData.firstPageLimit });
    res.json({ settings: { ...settings, ...strategy } });
  } catch (error) {
    logError("Failed to update settings", error, { collectionId: req.body.collectionId });
    res.status(500).json({ error: "Failed to update settings", detail: error.message });
  }
});

router.put("/collections/products/preference", (req, res) => {
  try {
    const { collectionId, productId, allottedPosition, includeInRotation } = req.body;
    if (!collectionId || !productId) {
      return res.status(400).json({ error: "Missing collectionId or productId in request body" });
    }
    upsertProductPreference(collectionId, productId, {
      allottedPosition: allottedPosition ? Number(allottedPosition) : null,
      includeInRotation: Boolean(includeInRotation),
    });
    res.json({ ok: true });
  } catch (error) {
    logError("Failed to update product preference", error, req.body);
    res.status(500).json({ error: "Failed to update product preference", detail: error.message });
  }
});

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
        setCurrentSorterRunContext({
          runId: run.id,
          collectionId: collection.id,
          collectionTitle: collection.title,
        });

        const snapshot = saveSnapshot(payload, allSales);
        const currentOrderIds = normalizeProductIds(snapshot);

        if (!snapshot.products.length) {
          summary.skipped += 1;
          summary.results.push(
            buildCollectionResult({
              collection,
              status: "skipped",
              productsProcessed: 0,
              durationMs: Date.now() - collectionStarted,
              reason: "empty_collection",
              currentOrderIds,
            }),
          );
          continue;
        }

        const settings = await settingsFor(collection.id);
        const generated = generateOrder(mergeSnapshotWithPreferences(collection.id, snapshot).products, {
          ...settings,
          collectionId: collection.id,
        });
        const orderIds = generated.map((product) => product.id);

        addActionLog({
          runId: run.id,
          actionType: "strategy_generated",
          actionLabel: "Collection strategy generated",
          status: "success",
          collectionId: collection.id,
          collectionTitle: collection.title,
          processedCount: generated.length,
          durationMs: Date.now() - collectionStarted,
        });

        if (currentOrderIds.length === orderIds.length && currentOrderIds.every((productId, index) => productId === orderIds[index])) {
          summary.unchanged += 1;
          summary.results.push(
            buildCollectionResult({
              collection,
              status: "unchanged",
              productsProcessed: generated.length,
              verificationMatched: true,
              durationMs: Date.now() - collectionStarted,
              currentOrderIds,
              orderIds,
            }),
          );
          addActionLog({
            runId: run.id,
            actionType: "collection_unchanged",
            actionLabel: "Collection already matched generated order",
            status: "completed",
            collectionId: collection.id,
            collectionTitle: collection.title,
            processedCount: generated.length,
            unchangedCount: generated.length,
            durationMs: Date.now() - collectionStarted,
          });
          continue;
        }

        addActionLog({
          runId: run.id,
          actionType: "reorder_submitted",
          actionLabel: "Shopify reorder submitted",
          status: "running",
          collectionId: collection.id,
          collectionTitle: collection.title,
          processedCount: generated.length,
        });

        const applyStarted = Date.now();
        const result = await applyGeneratedOrder(collection.id, snapshot, orderIds);
        const verifiedOrderIds = result.collection.products.map((product) => product.id);
        const verificationMatched =
          verifiedOrderIds.length === orderIds.length &&
          verifiedOrderIds.every((productId, index) => productId === orderIds[index]);

        if (!verificationMatched) {
          throw new Error("Shopify verification did not match the intended collection order.");
        }

        summary.succeeded += 1;
        summary.productsMoved += result.changed;
        summary.results.push(
          buildCollectionResult({
            collection,
            status: "verified",
            productsProcessed: generated.length,
            productsMoved: result.changed,
            verificationMatched: true,
            durationMs: Date.now() - collectionStarted,
            currentOrderIds,
            orderIds: verifiedOrderIds,
          }),
        );

        addNetworkLog({
          runId: run.id,
          collectionId: collection.id,
          collectionTitle: collection.title,
          provider: "shopify",
          operationName: "CollectionReorderVerified",
          method: "POST",
          endpoint: "graphql",
          status: "success",
          durationMs: Date.now() - applyStarted,
          metadata: {
            movedProducts: result.changed,
            verified: true,
          },
        });

        addActionLog({
          runId: run.id,
          actionType: "collection_verified",
          actionLabel: "Shopify reorder verified",
          status: "completed",
          collectionId: collection.id,
          collectionTitle: collection.title,
          processedCount: generated.length,
          movedCount: result.changed,
          successCount: 1,
          durationMs: Date.now() - collectionStarted,
        });
      } catch (error) {
        summary.failed += 1;
        summary.success = false;
        summary.results.push(
          buildCollectionResult({
            collection,
            status: "failed",
            productsProcessed: payload.products.length,
            durationMs: Date.now() - collectionStarted,
            error: error.message,
          }),
        );
        addActionLog({
          runId: run.id,
          actionType: "collection_failed",
          actionLabel: "Collection update failed",
          status: "failed",
          collectionId: collection.id,
          collectionTitle: collection.title,
          processedCount: payload.products.length,
          failedCount: 1,
          durationMs: Date.now() - collectionStarted,
          errorMessage: error.message,
        });
        addNetworkLog({
          runId: run.id,
          collectionId: collection.id,
          collectionTitle: collection.title,
          provider: "shopify",
          operationName: "CollectionReorderVerified",
          method: "POST",
          endpoint: "graphql",
          status: "failed",
          durationMs: Date.now() - collectionStarted,
          errorMessage: error.message,
        });
        logError("Failed reorder collection", error, { collectionId: collection.id, runId: run.id });
      } finally {
        clearCurrentSorterRunContext();
      }
    }

    summary.status = summary.failed ? (summary.succeeded || summary.unchanged ? "partial" : "failed") : "completed";

    finishRun(run.id, {
      status: summary.status,
      totalCollections: summary.totalCollections,
      eligibleCollections: summary.eligibleCollections,
      succeeded: summary.succeeded,
      failed: summary.failed,
      skipped: summary.skipped,
      unchanged: summary.unchanged,
      movedProducts: summary.productsMoved,
      currentCollectionId: null,
      currentCollectionTitle: null,
      metadata: {
        results: summary.results,
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

router.post("/collections/reorder-all", async (req, res) => {
  const summary = { checked: 0, updated: 0, skipped: 0, failed: 0, productsRepositioned: 0, failures: [] };
  try {
    const collections = await fetchCollections();
    const payloads = await Promise.all(collections.filter((collection) => collection.type === "custom").map((collection) => fetchCollectionProducts(collection.id)));
    const allSales = await fetchSalesMetrics([...new Set(payloads.flatMap((payload) => payload.products.map((product) => product.id)))]);
    const payloadById = new Map(payloads.map((payload) => [payload.collection.id, payload]));
    for (const collection of collections) {
      summary.checked += 1;
      if (collection.type !== "custom") {
        summary.skipped += 1;
        continue;
      }
      try {
        const snapshot = saveSnapshot(payloadById.get(collection.id), allSales);
        if (!snapshot.products.length) {
          summary.skipped += 1;
          continue;
        }
        const settings = await settingsFor(collection.id);
        const orderIds = generateOrder(mergeSnapshotWithPreferences(collection.id, snapshot).products, settings).map((product) => product.id);
        const currentOrderIds = snapshot.products.slice().sort((left, right) => left.collectionPosition - right.collectionPosition).map((product) => product.id);
        if (currentOrderIds.every((productId, index) => productId === orderIds[index])) {
          summary.skipped += 1;
          continue;
        }
        const result = await applyGeneratedOrder(collection.id, snapshot, orderIds);
        summary.updated += 1;
        summary.productsRepositioned += result.changed;
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({ collection: collection.title, error: error.message });
        logError("Failed to reorder collection", error, { collectionId: collection.id });
      }
    }
    res.json(summary);
  } catch (error) {
    logError("Failed to start collection reorder", error);
    res.status(500).json({ error: "Failed to load collections", detail: error.message });
  }
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

router.get("/sku-images/search", async (req, res) => {
  try {
    const skuInput = req.query.sku || "";
    const result = await searchSkuImageProducts({ skuInput, loadAll: false });
    res.json(result);
  } catch (error) {
    logError("Failed to search SKU image products", error, { sku: req.query.sku });
    res.status(500).json({ error: "Failed to search SKU image products", detail: error.message });
  }
});

router.post("/sku-images/load-all", async (req, res) => {
  try {
    const result = await searchSkuImageProducts({ loadAll: true });
    res.json(result);
  } catch (error) {
    logError("Failed to load all SKU image products", error);
    res.status(500).json({ error: "Failed to load all SKU image products", detail: error.message });
  }
});

router.post("/sku-images/add", async (req, res) => {
  try {
    const result = await addImageToSkuProduct(req.body);
    res.json(result);
  } catch (error) {
    logError("Failed to add SKU image", error, req.body);
    res.status(500).json({ error: "Failed to add SKU image", detail: error.message });
  }
});

router.post("/sku-images/add-upload", upload.single("image"), async (req, res) => {
  try {
    const uploadPayload = await buildUploadPayload(req.file);
    const result = await addImageToSkuProduct({
      sku: req.body.sku,
      variantId: req.body.variantId,
      productId: req.body.productId,
      altText: req.body.altText,
      positionMode: req.body.positionMode || "last",
      imageNumber: req.body.imageNumber,
      upload: uploadPayload,
    });
    res.json(result);
  } catch (error) {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    logError("Failed to add uploaded SKU image", error, { body: req.body, file: req.file?.originalname });
    res.status(500).json({ error: "Failed to add uploaded SKU image", detail: error.message });
  }
});

router.post("/sku-images/add-url", async (req, res) => {
  try {
    const result = await addImageToSkuProduct({
      sku: req.body.sku,
      variantId: req.body.variantId,
      productId: req.body.productId,
      imageUrl: req.body.imageUrl,
      altText: req.body.altText,
      positionMode: req.body.positionMode || "last",
      imageNumber: req.body.imageNumber,
    });
    res.json(result);
  } catch (error) {
    logError("Failed to add URL SKU image", error, req.body);
    res.status(500).json({ error: "Failed to add URL SKU image", detail: error.message });
  }
});

router.post("/sku-images/delete", async (req, res) => {
  try {
    const result = await deleteImageFromSkuProduct(req.body);
    res.json(result);
  } catch (error) {
    logError("Failed to delete SKU image", error, req.body);
    res.status(500).json({ error: "Failed to delete SKU image", detail: error.message });
  }
});

router.post("/sku-images/reorder", async (req, res) => {
  try {
    const { orderedMediaIds } = req.body;
    if (!Array.isArray(orderedMediaIds) || !orderedMediaIds.length) {
      return res.status(400).json({ error: "orderedMediaIds must be a non-empty array" });
    }
    const result = await reorderSkuProductImages(req.body);
    res.json(result);
  } catch (error) {
    logError("Failed to reorder SKU images", error, req.body);
    res.status(500).json({ error: "Failed to reorder SKU images", detail: error.message });
  }
});

router.post("/sku-images/bulk-add", async (req, res) => {
  try {
    const items = normalizeSkuItems(req.body.items);
    if (!items.length) {
      return res.status(400).json({ error: "No SKU/product items supplied for bulk add" });
    }
    const result = await bulkAddImageToSkuProducts({
      items,
      imageUrl: req.body.imageUrl,
      altText: req.body.altText,
      positionMode: req.body.positionMode,
      imageNumber: req.body.imageNumber,
      upload: req.body.upload,
    });
    res.json(result);
  } catch (error) {
    logError("Failed to bulk add SKU image", error);
    res.status(500).json({ error: "Failed to bulk add SKU image", detail: error.message });
  }
});

router.post("/sku-images/bulk-add-upload", upload.single("image"), async (req, res) => {
  try {
    const items = normalizeSkuItems(JSON.parse(req.body.items || "[]"));
    if (!items.length) {
      return res.status(400).json({ error: "No SKU/product items supplied for bulk add upload" });
    }
    const uploadPayload = await buildUploadPayload(req.file);
    const result = await bulkAddImageToSkuProducts({
      items,
      altText: req.body.altText,
      positionMode: req.body.positionMode || "last",
      imageNumber: req.body.imageNumber,
      upload: uploadPayload,
    });
    res.json(result);
  } catch (error) {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    logError("Failed to bulk add uploaded SKU image", error);
    res.status(500).json({ error: "Failed to bulk add uploaded SKU image", detail: error.message });
  }
});

router.post("/sku-images/bulk-delete-preview", async (req, res) => {
  try {
    const items = normalizeSkuItems(req.body.items);
    if (!items.length) {
      return res.status(400).json({ error: "No SKU/product items supplied for bulk delete preview" });
    }
    const result = await previewBulkDelete({
      items,
      positionMode: req.body.positionMode,
      imageNumber: req.body.imageNumber,
    });
    res.json(result);
  } catch (error) {
    logError("Failed to preview bulk delete", error);
    res.status(500).json({ error: "Failed to preview bulk delete", detail: error.message });
  }
});

router.post("/sku-images/bulk-delete-confirm", async (req, res) => {
  try {
    const previewRows = Array.isArray(req.body.previewRows) ? req.body.previewRows : [];
    if (!previewRows.length) {
      return res.status(400).json({ error: "previewRows must be a non-empty array" });
    }
    const result = await confirmBulkDelete({ previewRows });
    res.json(result);
  } catch (error) {
    logError("Failed to confirm bulk delete", error);
    res.status(500).json({ error: "Failed to confirm bulk delete", detail: error.message });
  }
});

export default router;
