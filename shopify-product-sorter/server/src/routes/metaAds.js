import express from "express";
import {
  checkMetaConnectivity,
  fetchMetaAccount,
  fetchMetaAdSets,
  fetchMetaAds,
  fetchMetaCampaigns,
  fetchMetaDailyInsights,
  fetchMetaSummary,
  parseMetaDateRange,
  clearMetaCache,
} from "../services/metaAdsService.js";
import { logError } from "../utils/logger.js";

/**
 * Meta Ads read-only dashboard routes.
 *
 * Contract: every handler validates the request, delegates to the domain
 * service, and lets the canonical errorNormalizer map failures into stable
 * META_* codes. No Meta mutation endpoint exists here.
 *
 * GET  /api/meta-ads/health     connection status (differentiated)
 * GET  /api/meta-ads/account    ad account metadata (currency/timezone)
 * GET  /api/meta-ads/summary    account-level KPIs for a date range
 * GET  /api/meta-ads/daily      daily spend/purchases trend
 * GET  /api/meta-ads/campaigns  campaigns + insights
 * GET  /api/meta-ads/adsets     ad sets + insights (optional campaignId)
 * GET  /api/meta-ads/ads        ads + insights (optional adsetId)
 * POST /api/meta-ads/refresh    clears the bounded backend cache (NOT a Meta mutation)
 */
const router = express.Router();

function readDateRange(req) {
  return parseMetaDateRange({ since: req.query.since, until: req.query.until });
}

router.get("/meta-ads/health", async (req, res, next) => {
  try {
    const status = await checkMetaConnectivity({ bypassCache: req.query.bypassCache === "true" });
    res.json(status);
  } catch (error) {
    logError("Meta Ads connectivity check failed", error);
    next(error);
  }
});

router.get("/meta-ads/account", async (req, res, next) => {
  try {
    const account = await fetchMetaAccount();
    res.json({ success: true, account });
  } catch (error) {
    logError("Meta Ads account fetch failed", error);
    next(error);
  }
});

router.get("/meta-ads/summary", async (req, res, next) => {
  try {
    const range = readDateRange(req);
    const bypassCache = req.query.bypassCache === "true";
    const summary = await fetchMetaSummary(range, bypassCache);
    res.json({ success: true, dateRange: range, ...summary });
  } catch (error) {
    logError("Meta Ads summary fetch failed", error);
    next(error);
  }
});

router.get("/meta-ads/daily", async (req, res, next) => {
  try {
    const range = readDateRange(req);
    const bypassCache = req.query.bypassCache === "true";
    const daily = await fetchMetaDailyInsights(range, bypassCache);
    res.json({ success: true, dateRange: range, daily });
  } catch (error) {
    logError("Meta Ads daily insights fetch failed", error);
    next(error);
  }
});

router.get("/meta-ads/campaigns", async (req, res, next) => {
  try {
    const range = readDateRange(req);
    const bypassCache = req.query.bypassCache === "true";
    const campaigns = await fetchMetaCampaigns(range, bypassCache);
    res.json({ success: true, dateRange: range, campaigns });
  } catch (error) {
    logError("Meta Ads campaigns fetch failed", error);
    next(error);
  }
});

router.get("/meta-ads/adsets", async (req, res, next) => {
  try {
    const range = readDateRange(req);
    const campaignId = req.query.campaignId || null;
    const bypassCache = req.query.bypassCache === "true";
    const adsets = await fetchMetaAdSets(campaignId, range, bypassCache);
    res.json({ success: true, dateRange: range, adsets });
  } catch (error) {
    logError("Meta Ads ad sets fetch failed", error);
    next(error);
  }
});

router.get("/meta-ads/ads", async (req, res, next) => {
  try {
    const range = readDateRange(req);
    const adsetId = req.query.adsetId || null;
    const bypassCache = req.query.bypassCache === "true";
    const ads = await fetchMetaAds(adsetId, range, bypassCache);
    res.json({ success: true, dateRange: range, ads });
  } catch (error) {
    logError("Meta Ads ads fetch failed", error);
    next(error);
  }
});

router.post("/meta-ads/refresh", (req, res) => {
  clearMetaCache();
  res.json({ success: true, message: "Meta Ads cache cleared" });
});

export default router;
