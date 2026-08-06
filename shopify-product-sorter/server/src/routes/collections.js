import express from "express";
import {
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
} from "../services/shopifyService.js";
import { getStrategySettings, saveStrategySettings } from "../services/strategySettings.js";
import { logError } from "../utils/logger.js";

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

export default router;
