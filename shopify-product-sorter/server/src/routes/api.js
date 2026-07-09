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
  applyCollectionOrder,
  ensureManualSort,
  fetchCollectionProducts,
  fetchCollections,
  fetchSalesMetrics,
  fetchShopCounts,
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
import {
  getActualSalesSummary,
  getSalesAnalyticsSlice,
  getSalesExport,
  reconcileSalesData,
  refreshShopifySalesData,
  refreshShiprocketSalesData,
} from "../services/actualSalesService.js";
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
    const enriched = collections.map((collection) => ({
      ...collection,
      settings: getCollectionSettings(collection.id),
    }));
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
    const payload = await fetchCollectionProducts(collectionId);
    const salesMetrics = await fetchSalesMetrics(payload.products.map((product) => product.id));
    const products = payload.products.map((product) => ({
      ...product,
      soldQuantity: salesMetrics[product.id]?.soldQuantity ?? 0,
      salesRevenue: salesMetrics[product.id]?.salesRevenue ?? 0,
    }));

    const snapshot = {
      collection: payload.collection,
      syncedAt: new Date().toISOString(),
      products,
    };

    saveCollectionSnapshot(collectionId, snapshot);
    upsertCollectionSettings(collectionId, payload.collection.title, {
      selected: true,
    });

    res.json({
      snapshot: mergeSnapshotWithPreferences(collectionId, snapshot),
      settings: getCollectionSettings(collectionId),
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
      settings: getCollectionSettings(collectionId),
      backup: getLatestBackup(collectionId),
    });
  } catch (error) {
    logError("Failed to load collection state", error, { collectionId: req.query.collectionId });
    res.status(500).json({ error: "Failed to load collection state", detail: error.message });
  }
});

router.put("/collections/settings", (req, res) => {
  try {
    const { collectionId, ...settingsData } = req.body;
    if (!collectionId) {
      return res.status(400).json({ error: "Missing collectionId in request body" });
    }
    const snapshot = getCollectionSnapshot(collectionId);
    const collectionTitle = snapshot?.collection?.title || settingsData.collectionTitle || "Untitled Collection";
    const settings = upsertCollectionSettings(collectionId, collectionTitle, settingsData);
    res.json({ settings });
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

router.post("/collections/generate", (req, res) => {
  try {
    const { collectionId, settings: inputSettings } = req.body;
    if (!collectionId) {
      return res.status(400).json({ error: "Missing collectionId in request body" });
    }
    const snapshot = mergeSnapshotWithPreferences(collectionId, getCollectionSnapshot(collectionId));
    if (!snapshot) {
      return res.status(404).json({ error: "Collection snapshot not found. Sync first." });
    }

    const settings = upsertCollectionSettings(
      collectionId,
      snapshot.collection.title,
      inputSettings || {},
    );

    const order = generateOrder(snapshot.products, settings);
    const oldOrder = snapshot.products
      .slice()
      .sort((left, right) => left.collectionPosition - right.collectionPosition);

    upsertCollectionSettings(collectionId, snapshot.collection.title, {
      ...settings,
      lastGeneratedOrder: order.map((product) => product.id),
    });

    res.json({
      oldOrder,
      newOrder: order,
      affectedCount: order.filter(
        (product) => product.collectionPosition !== product.finalPosition,
      ).length,
      settings: getCollectionSettings(collectionId),
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

    const oldOrderIds = snapshot.products
      .slice()
      .sort((left, right) => left.collectionPosition - right.collectionPosition)
      .map((product) => product.id);

    const sameLength = oldOrderIds.length === newOrderIds.length;
    const sameProducts =
      sameLength &&
      oldOrderIds.every((productId) => newOrderIds.includes(productId));

    if (!sameProducts) {
      return res.status(400).json({
        error: "Generated order does not match the current collection product set.",
      });
    }

    createBackup(
      collectionId,
      "apply",
      snapshot.products.map((product) => ({
        id: product.id,
        title: product.title,
        position: product.collectionPosition,
      })),
    );

    const manualSort = await ensureManualSort(collectionId);
    const result = await applyCollectionOrder(collectionId, oldOrderIds, newOrderIds);
    const nextSnapshot = reorderSnapshot(snapshot, newOrderIds);
    saveCollectionSnapshot(collectionId, nextSnapshot);

    upsertCollectionSettings(collectionId, snapshot.collection.title, {
      lastAppliedOrder: newOrderIds,
    });

    logInfo("Apply order completed", {
      collectionId,
      sortOrder: manualSort.sortOrder,
      affectedCount: result.changed,
    });

    res.json({
      ok: true,
      manualSort: manualSort.sortOrder,
      affectedCount: result.changed,
      backup: getLatestBackup(collectionId),
    });
  } catch (error) {
    logError("Failed to apply Shopify order", error, { collectionId: req.body.collectionId });
    res.status(500).json({ error: "Failed to apply Shopify order", detail: error.message });
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

    const currentOrderIds = snapshot.products
      .slice()
      .sort((left, right) => left.collectionPosition - right.collectionPosition)
      .map((product) => product.id);

    const rollbackOrderIds = backup.order
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((product) => product.id);

    await ensureManualSort(collectionId);
    const result = await applyCollectionOrder(collectionId, currentOrderIds, rollbackOrderIds);
    const nextSnapshot = reorderSnapshot(snapshot, rollbackOrderIds);
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
