import skuMediaRouter from "./skuMedia.js";
import sorterRouter from "./sorter.js";
import express from "express";
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
router.use(sorterRouter);
router.use(skuMediaRouter);

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

