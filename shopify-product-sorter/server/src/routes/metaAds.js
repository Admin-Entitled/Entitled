import express from "express";
import {
  checkMetaConnectivity,
  fetchMetaCampaigns,
  fetchMetaAdSets,
  fetchMetaAds,
  clearMetaCache,
} from "../services/metaAdsService.js";
import { logError } from "../utils/logger.js";

const router = express.Router();

function getQueryDateRange(req) {
  const since = req.query.since;
  const until = req.query.until;

  if (!since || !until) {
    // Default to last 30 days
    const untilDate = new Date();
    const sinceDate = new Date();
    sinceDate.setDate(untilDate.getDate() - 30);
    return {
      since: sinceDate.toISOString().split("T")[0],
      until: untilDate.toISOString().split("T")[0],
    };
  }

  // Basic format validation YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(since) || !dateRegex.test(until)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD");
  }

  return { since, until };
}

router.get("/meta-ads/health", async (req, res, next) => {
  try {
    const status = await checkMetaConnectivity();
    res.json(status);
  } catch (error) {
    logError("Meta Ads connectivity check failed", error);
    res.status(500).json({ error: "Meta connectivity check failed", detail: error.message });
  }
});

router.get("/meta-ads/campaigns", async (req, res, next) => {
  try {
    const range = getQueryDateRange(req);
    const bypassCache = req.query.bypassCache === "true";
    const campaigns = await fetchMetaCampaigns(range, bypassCache);
    res.json({ success: true, dateRange: range, campaigns });
  } catch (error) {
    logError("Meta Ads campaigns fetch failed", error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: "Campaigns fetch failed",
      detail: error.response?.data?.error?.message || error.message,
    });
  }
});

router.get("/meta-ads/adsets", async (req, res, next) => {
  try {
    const range = getQueryDateRange(req);
    const campaignId = req.query.campaignId;
    const bypassCache = req.query.bypassCache === "true";
    const adsets = await fetchMetaAdSets(campaignId, range, bypassCache);
    res.json({ success: true, dateRange: range, adsets });
  } catch (error) {
    logError("Meta Ads adsets fetch failed", error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: "AdSets fetch failed",
      detail: error.response?.data?.error?.message || error.message,
    });
  }
});

router.get("/meta-ads/ads", async (req, res, next) => {
  try {
    const range = getQueryDateRange(req);
    const adsetId = req.query.adsetId;
    const bypassCache = req.query.bypassCache === "true";
    const ads = await fetchMetaAds(adsetId, range, bypassCache);
    res.json({ success: true, dateRange: range, ads });
  } catch (error) {
    logError("Meta Ads ads fetch failed", error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: "Ads fetch failed",
      detail: error.response?.data?.error?.message || error.message,
    });
  }
});

router.post("/meta-ads/refresh", (req, res) => {
  clearMetaCache();
  res.json({ success: true, message: "Meta Ads cache cleared" });
});

export default router;
