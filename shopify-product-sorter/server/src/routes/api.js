import db from "../db/database.js";
import { redactSecrets } from "../utils/sanitize.js";
import salesIntelligenceRouter from "./salesIntelligence.js";
import skuMediaRouter from "./skuMedia.js";
import sorterRouter from "./sorter.js";
import metaRouter from "./metaAds.js";
import express from "express";
import { getCachedTokenStatus } from "../services/shopifyAuth.js";
import { env, getShopifyCapability, getMetaCapability } from "../config/env.js";
import { isOrderMappingAvailable } from "../services/orderMappingDb.js";
import { fetchShopCounts } from "../services/shopifyService.js";
import { getMetaDiagnosticsSnapshot } from "../services/metaAdsService.js";
import { logError } from "../utils/logger.js";
import { shopifyCapabilityGuard } from "../middleware/shopifyCapability.js";

const router = express.Router();
const MAX_DIAGNOSTIC_DETAIL_LENGTH = 500;
router.use(sorterRouter);
router.use(skuMediaRouter);
router.use(salesIntelligenceRouter);
router.use(metaRouter);

function diagnosticDetail(value) {
  return value ? redactSecrets(value).slice(0, MAX_DIAGNOSTIC_DETAIL_LENGTH) : null;
}

router.get("/health", (req, res) => {
  res.json({ ok: true, status: "ok", timestamp: new Date().toISOString() });
});

router.get("/health/liveness", (req, res) => {
  res.json({ ok: true, status: "ok", timestamp: new Date().toISOString() });
});

router.get("/health/readiness", (req, res) => {
  try {
    db.prepare("SELECT 1").get();
    const requiredTables = ["collection_settings", "product_preferences", "collection_snapshots", "order_backups", "delivery_orders"];
    const checkTableStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?");
    const missingTables = requiredTables.filter((tbl) => !checkTableStmt.get(tbl));
    const isReady = missingTables.length === 0;

    const shopifyCap = getShopifyCapability();
    const metaCap = getMetaCapability();

    res.status(isReady ? 200 : 503).json({
      ok: isReady,
      status: isReady ? "ready" : "degraded",
      db: "connected",
      missingTables: missingTables.length > 0 ? missingTables : undefined,
      config: {
        shopifyConfigured: shopifyCap.available,
        shiprocketConfigured: Boolean(env.shiprocketEmail && env.shiprocketPassword),
        sqlitePathConfigured: Boolean(env.sqlitePath),
        orderMappingConfigured: Boolean(env.databaseUrl),
        metaAdsConfigured: metaCap.available,
      },
      shopify: {
        available: shopifyCap.available,
        status: shopifyCap.status,
        reasonCategory: shopifyCap.reasonCategory,
        authMode: shopifyCap.authMode,
        missingVariables: shopifyCap.missingVariables,
      },
      orderMapping: {
        available: isOrderMappingAvailable(),
        status: isOrderMappingAvailable() ? "ready" : "unavailable",
        reasonCategory: isOrderMappingAvailable() ? undefined : "configuration_missing",
      },
      metaAds: {
        available: metaCap.available,
        status: metaCap.status,
        reasonCategory: metaCap.reasonCategory,
        missingVariables: metaCap.missingVariables,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError("Readiness health check failed", error);
    res.status(503).json({
      ok: false,
      status: "unhealthy",
      db: "disconnected",
      error: redactSecrets(error.message),
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/debug/shopify", shopifyCapabilityGuard, async (req, res) => {
  try {
    const tokenStatus = getCachedTokenStatus();
    const configured = Boolean(env.shopifyStoreDomain && (env.shopifyAdminAccessToken || (env.shopifyClientId && env.shopifyClientSecret)));
    let collectionsCount = 0;
    let productsCount = 0;
    let lastError = diagnosticDetail(tokenStatus.lastAuthError);

    if (configured) {
      try {
        const counts = await fetchShopCounts();
        collectionsCount = counts.collectionsCount;
        productsCount = counts.productsCount;
      } catch (err) {
        lastError = diagnosticDetail(err.message);
      }
    }

    res.json({
      ok: configured && !lastError,
      status: !configured ? "not_configured" : lastError ? "provider_error" : "ok",
      authStatus: tokenStatus.isFresh ? "authenticated" : "not_authenticated",
      tokenAcquired: tokenStatus.hasToken,
      shopDomain: env.shopifyStoreDomain || null,
      apiVersion: env.shopifyApiVersion || null,
      collectionsCount,
      productsCount,
      lastShopifyError: lastError,
    });
  } catch (error) {
    logError("Shopify debug check failed", error);
    res.status(500).json({ error: "Shopify debug check failed", detail: redactSecrets(error.message) });
  }
});

router.get("/debug/shiprocket", (req, res) => {
  try {
    const configured = Boolean(env.shiprocketEmail && env.shiprocketPassword);
    res.json({
      ok: configured,
      status: configured ? "configured" : "not_configured",
      configured,
      emailPresent: Boolean(env.shiprocketEmail),
      tokenPresent: Boolean(env.shiprocketToken),
      baseUrl: env.shiprocketBaseUrl || null,
    });
  } catch (error) {
    logError("Shiprocket debug check failed", error);
    res.status(500).json({ error: "Shiprocket debug check failed", detail: redactSecrets(error.message) });
  }
});

router.get("/health/diagnostics", async (req, res) => {
  try {
    const shopifyTokenStatus = getCachedTokenStatus();
    const shopifyConfigured = Boolean(env.shopifyStoreDomain && (env.shopifyAdminAccessToken || (env.shopifyClientId && env.shopifyClientSecret)));
    const shiprocketConfigured = Boolean(env.shiprocketEmail && env.shiprocketPassword);
    const metaCap = getMetaCapability();
    let shopifyCounts = { collectionsCount: 0, productsCount: 0 };
    let shopifyError = diagnosticDetail(shopifyTokenStatus.lastAuthError);

    if (shopifyConfigured) {
      try {
        shopifyCounts = await fetchShopCounts();
      } catch (err) {
        shopifyError = diagnosticDetail(err.message);
      }
    }

    res.json({
      ok: !shopifyError,
      status: shopifyError ? "degraded" : "ok",
      application: { status: "ok", liveness: "ok" },
      shopify: {
        status: !shopifyConfigured ? "not_configured" : shopifyError ? "provider_error" : "ok",
        configured: shopifyConfigured,
        authStatus: shopifyTokenStatus.isFresh ? "authenticated" : "not_authenticated",
        tokenAcquired: shopifyTokenStatus.hasToken,
        shopDomain: env.shopifyStoreDomain || null,
        apiVersion: env.shopifyApiVersion || null,
        collectionsCount: shopifyCounts.collectionsCount,
        productsCount: shopifyCounts.productsCount,
        error: shopifyError,
      },
      shiprocket: {
        status: shiprocketConfigured ? "configured" : "not_configured",
        configured: shiprocketConfigured,
        tokenPresent: Boolean(env.shiprocketToken),
      },
      metaAds: {
        ...getMetaDiagnosticsSnapshot(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError("Health diagnostics check failed", error);
    res.status(500).json({ error: "Health diagnostics check failed", detail: redactSecrets(error.message) });
  }
});

export default router;
