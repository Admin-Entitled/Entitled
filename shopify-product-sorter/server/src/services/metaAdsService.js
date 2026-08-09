import { env } from "../config/env.js";
import { addNetworkLog } from "./sorterRuntimeService.js";
import { AppError } from "../middleware/errorBoundary.js";
import {
  metaGet,
  metaGetAllPages,
  metaGetAccount,
  isMetaRateLimitError,
  META_ERROR_CODES,
} from "./metaAdsClient.js";

/**
 * Meta Ads domain service (read-only).
 *
 * Responsibilities:
 *  - connectivity / health with differentiated statuses
 *  - account metadata (currency + timezone become canonical reporting context)
 *  - campaigns / ad sets / ads with COMPLETE cursor pagination
 *  - canonical insights normalization (spend, ctr, cpc, cpm, purchases, ROAS)
 *  - canonical purchase-event normalization (action_type inspected explicitly)
 *  - daily trend for the dashboard chart
 *  - account+range-aware bounded cache, refreshable via bypassCache / clear
 *
 * No Meta mutation capability exists in this module or the client.
 */

// ────────────────────────────────────────────────────────────────────────────
// Purchase event normalization (canonical rule)
//
// Meta reports conversions through several event types depending on the
// installation (Pixel, Conversions API, app events). The same purchase can
// surface under more than one type, so we MUST NOT sum every purchase-looking
// action. Rule: use a priority list and take the FIRST present type, and use
// the SAME type for both purchases count and purchase value so the two never
// mix incompatible action types.
//
//   1. "purchase"                         — standard web purchase event
//   2. "offsite_conversion.fb_pixel_purchase" — Pixel-sourced purchase
//   3. "omni_purchase"                    — omnichannel purchase attribution
// ────────────────────────────────────────────────────────────────────────────
export const PURCHASE_EVENT_TYPES = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
];

function findPurchaseAction(entries, field) {
  if (!Array.isArray(entries)) return null;
  for (const type of PURCHASE_EVENT_TYPES) {
    const match = entries.find((entry) => entry && entry.action_type === type && entry[field] !== undefined);
    if (match) return match;
  }
  return null;
}

/**
 * Canonical purchase + purchase-value extraction.
 * Returns { purchases, purchaseValue } using a single consistent event type.
 */
export function extractPurchaseMetrics(actions, actionValues) {
  const countEntry = findPurchaseAction(actions, "value");
  const valueEntry = findPurchaseAction(actionValues, "value");
  const purchases = countEntry ? parseInt(countEntry.value || "0", 10) : 0;
  const purchaseValue = valueEntry ? parseFloat(valueEntry.value || "0") : 0;
  return {
    purchases: Number.isFinite(purchases) ? purchases : 0,
    purchaseValue: Number.isFinite(purchaseValue) ? purchaseValue : 0,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Insights normalization
// ────────────────────────────────────────────────────────────────────────────

export function normalizeInsights(rawInsight) {
  const spend = parseFloat(rawInsight.spend || 0);
  const impressions = parseInt(rawInsight.impressions || 0, 10);
  const reach = parseInt(rawInsight.reach || 0, 10);
  const clicks = parseInt(rawInsight.clicks || 0, 10);

  const safeSpend = Number.isFinite(spend) ? spend : 0;
  const safeImpressions = Number.isFinite(impressions) ? impressions : 0;
  const safeReach = Number.isFinite(reach) ? reach : 0;
  const safeClicks = Number.isFinite(clicks) ? clicks : 0;

  const ctr = safeImpressions > 0 ? (safeClicks / safeImpressions) * 100 : 0;
  const cpc = safeClicks > 0 ? safeSpend / safeClicks : 0;
  const cpm = safeImpressions > 0 ? (safeSpend / safeImpressions) * 1000 : 0;

  const { purchases, purchaseValue } = extractPurchaseMetrics(rawInsight.actions, rawInsight.action_values);
  const purchaseRoas = safeSpend > 0 ? purchaseValue / safeSpend : 0;

  return {
    spend: safeSpend,
    impressions: safeImpressions,
    reach: safeReach,
    clicks: safeClicks,
    ctr,
    cpc,
    cpm,
    purchases,
    purchaseValue,
    purchaseRoas,
    dateStart: rawInsight.date_start || null,
    dateStop: rawInsight.date_stop || null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Status normalization
// ────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
  DELETED: "Deleted",
  CAMPAIGN_PAUSED: "Paused (campaign)",
  ADSET_PAUSED: "Paused (ad set)",
  WITH_ISSUES: "Active with issues",
  PENDING_REVIEW: "Pending review",
  DISAPPROVED: "Disapproved",
  PREAPPROVED: "Preapproved",
  PENDING_BILLING_INFO: "Pending billing",
  REJECTED: "Rejected",
  IN_PROCESS: "In process",
  PENDING: "Pending",
};

/**
 * Normalize provider status + effective status into a stable display object.
 * Frontend renders these labels; it never maps raw provider strings.
 */
export function normalizeMetaStatus(status, effectiveStatus) {
  const effective = effectiveStatus || status || "UNKNOWN";
  const primary = status || effective;

  let tone = "neutral";
  if (primary === "ACTIVE" || primary === "IN_PROCESS" || primary === "PENDING") {
    tone = "active";
  } else if (primary === "PAUSED" || primary === "CAMPAIGN_PAUSED" || primary === "ADSET_PAUSED") {
    tone = "paused";
  } else if (primary === "ARCHIVED") {
    tone = "archived";
  } else if (primary === "DELETED") {
    tone = "deleted";
  } else if (primary === "DISAPPROVED" || primary === "REJECTED" || primary === "WITH_ISSUES") {
    tone = "issue";
  }

  return {
    status: primary,
    effectiveStatus: effective,
    label: STATUS_LABELS[primary] || primary,
    effectiveLabel: STATUS_LABELS[effective] || effective,
    tone,
    isActive: effective === "ACTIVE",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Date range parsing (canonical YYYY-MM-DD contract)
// ────────────────────────────────────────────────────────────────────────────

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseMetaDateRange({ since, until } = {}) {
  if (Boolean(since) !== Boolean(until)) {
    throw new AppError("VALIDATION_ERROR", "Meta date range requires both 'since' and 'until' (YYYY-MM-DD).", {
      statusCode: 400,
      details: [{ path: "query.since/until", code: "PARTIAL_RANGE" }],
    });
  }
  if (!since || !until) {
    const untilDate = new Date();
    const sinceDate = new Date();
    sinceDate.setDate(untilDate.getDate() - 30);
    return {
      since: sinceDate.toISOString().split("T")[0],
      until: untilDate.toISOString().split("T")[0],
    };
  }
  if (!DATE_REGEX.test(since) || !DATE_REGEX.test(until)) {
    throw new AppError("VALIDATION_ERROR", "Invalid Meta date range. Use YYYY-MM-DD.", {
      statusCode: 400,
      details: [{ path: "query.since/until", code: "INVALID_DATE_FORMAT" }],
    });
  }
  if (since > until) {
    throw new AppError("VALIDATION_ERROR", "Meta date range 'since' must not be after 'until'.", {
      statusCode: 400,
      details: [{ path: "query.since/until", code: "REVERSED_RANGE" }],
    });
  }
  return { since, until };
}

// ────────────────────────────────────────────────────────────────────────────
// Connectivity & account (cached, so System Diagnostics polling never hammers
// the provider)
// ────────────────────────────────────────────────────────────────────────────

const CONNECTIVITY_CACHE_TTL_MS = 60 * 1000;
let connectivityCache = { timestamp: 0, result: null };

export function clearConnectivityCache() {
  connectivityCache = { timestamp: 0, result: null };
}

function isCacheFresh(entry, ttlMs = CONNECTIVITY_CACHE_TTL_MS) {
  return Boolean(entry?.result && Date.now() - entry.timestamp < ttlMs);
}

/**
 * Live (or freshly-cached) connectivity check with differentiated statuses:
 * NOT_CONFIGURED | CONNECTED | INVALID_TOKEN | INSUFFICIENT_PERMISSIONS |
 * RATE_LIMITED | UNAVAILABLE
 */
export async function checkMetaConnectivity({ bypassCache = false } = {}) {
  if (!bypassCache && isCacheFresh(connectivityCache)) {
    return connectivityCache.result;
  }

  const capability = getMetaCapability();
  if (!capability.available) {
    const result = { status: "NOT_CONFIGURED", ok: false, missingVariables: capability.missingVariables };
    connectivityCache = { timestamp: Date.now(), result };
    return result;
  }

  try {
    const account = await metaGetAccount();
    const result = {
      status: "CONNECTED",
      ok: true,
      account: {
        id: account.id,
        name: account.name,
        currency: account.currency,
        timezone: account.timezoneName,
        accountStatus: account.accountStatus,
      },
      currency: account.currency,
      timezone: account.timezoneName,
      checkedAt: new Date().toISOString(),
    };
    connectivityCache = { timestamp: Date.now(), result };
    return result;
  } catch (error) {
    const code = error?.code || META_ERROR_CODES.API_ERROR;
    let status = "UNAVAILABLE";
    if (code === META_ERROR_CODES.AUTH_FAILED) status = "INVALID_TOKEN";
    else if (code === META_ERROR_CODES.PERMISSION_DENIED) status = "INSUFFICIENT_PERMISSIONS";
    else if (code === META_ERROR_CODES.RATE_LIMITED) status = "RATE_LIMITED";
    const result = { status, ok: false, error: error.message };
    connectivityCache = { timestamp: Date.now(), result };
    return result;
  }
}

/**
 * Diagnostics snapshot WITHOUT a live provider call. Used by /health/diagnostics
 * which the frontend polls. Reports the cached connectivity plus config state.
 */
export function getMetaDiagnosticsSnapshot() {
  const capability = getMetaCapability();
  if (!capability.available) {
    return {
      configured: false,
      status: "NOT_CONFIGURED",
      connectionStatus: "NOT_CONFIGURED",
      missingVariables: capability.missingVariables,
      lastSuccessAt: null,
    };
  }
  const cached = connectivityCache.result;
  return {
    configured: true,
    status: capability.status,
    connectionStatus: cached?.status || "UNKNOWN",
    accountName: cached?.ok ? cached.account?.name : null,
    currency: cached?.ok ? cached.currency : null,
    timezone: cached?.ok ? cached.timezone : null,
    lastSuccessAt: cached?.ok ? cached.checkedAt : null,
  };
}

function getMetaCapability() {
  const missingVariables = [];
  if (!env.metaAccessToken) missingVariables.push("META_ACCESS_TOKEN");
  if (!env.metaAdAccountId) missingVariables.push("META_AD_ACCOUNT_ID");
  return {
    available: missingVariables.length === 0,
    missingVariables,
  };
}

function ensureConfigured() {
  const capability = getMetaCapability();
  if (!capability.available) {
    throw new AppError(META_ERROR_CODES.NOT_CONFIGURED, "Meta Ads is not configured.", {
      statusCode: 503,
      details: { missingVariables: capability.missingVariables },
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Cache (account-aware + date-range-aware, bounded, refreshable)
// ────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX_ENTRIES = 100;
const cache = new Map();

export function clearMetaCache() {
  cache.clear();
  clearConnectivityCache();
}

function getCacheKey(prefix, dateRange, qualifier = "") {
  return `${env.metaAdAccountId}:${prefix}:${dateRange.since}:${dateRange.until}:${qualifier}`;
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { timestamp: Date.now(), data });
}

// ────────────────────────────────────────────────────────────────────────────
// Entities + insights (complete pagination)
// ────────────────────────────────────────────────────────────────────────────

const INSIGHTS_FIELDS = "spend,impressions,reach,clicks,actions,action_values,date_start,date_stop";

async function fetchInsightsForLevel(level, idField, dateRange) {
  const rows = await metaGetAllPages(`act_${env.metaAdAccountId}/insights`, {
    level,
    time_range: JSON.stringify({ since: dateRange.since, until: dateRange.until }),
    fields: `${idField},${INSIGHTS_FIELDS}`,
    limit: 100,
  }, { operationName: `Fetch${level}Insights` });
  const map = new Map();
  for (const row of rows) {
    const key = row[idField];
    if (key) map.set(String(key), row);
  }
  return map;
}

function mergeInsights(entity, insightsMap, dateRange) {
  const raw = insightsMap.get(String(entity.id)) || { date_start: dateRange.since, date_stop: dateRange.until };
  return normalizeInsights(raw);
}

export async function fetchMetaAccount() {
  ensureConfigured();
  const account = await metaGetAccount();
  return account;
}

export async function fetchMetaCampaigns(dateRange, bypassCache = false) {
  ensureConfigured();
  const range = parseMetaDateRange(dateRange);
  const key = getCacheKey("campaigns", range);
  if (!bypassCache) {
    const cached = cacheGet(key);
    if (cached) return cached;
  }

  const campaignsRaw = await metaGetAllPages(`act_${env.metaAdAccountId}/campaigns`, {
    fields: "id,name,objective,status,effective_status,created_time,updated_time",
    limit: 100,
  }, { operationName: "FetchCampaigns" });

  const insightsMap = await fetchInsightsForLevel("campaign", "campaign_id", range);

  const normalised = campaignsRaw.map((c) => {
    const status = c.status || "UNKNOWN";
    const effectiveStatus = c.effective_status || c.status || "UNKNOWN";
    return {
      id: String(c.id),
      name: c.name || "Untitled campaign",
      objective: c.objective || null,
      status,
      effectiveStatus,
      statusDisplay: normalizeMetaStatus(status, effectiveStatus),
      createdTime: c.created_time || null,
      updatedTime: c.updated_time || null,
      insights: mergeInsights(c, insightsMap, range),
    };
  });

  cacheSet(key, normalised);
  return normalised;
}

export async function fetchMetaAdSets(campaignId, dateRange, bypassCache = false) {
  ensureConfigured();
  const range = parseMetaDateRange(dateRange);
  const key = getCacheKey("adsets", range, campaignId || "all");
  if (!bypassCache) {
    const cached = cacheGet(key);
    if (cached) return cached;
  }

  const endpoint = campaignId ? `${campaignId}/adsets` : `act_${env.metaAdAccountId}/adsets`;
  const adsetsRaw = await metaGetAllPages(endpoint, {
    fields: "id,campaign_id,name,status,effective_status,optimization_goal",
    limit: 100,
  }, { operationName: "FetchAdSets" });

  const insightsMap = await fetchInsightsForLevel("adset", "adset_id", range);

  const normalised = adsetsRaw.map((a) => {
    const status = a.status || "UNKNOWN";
    const effectiveStatus = a.effective_status || a.status || "UNKNOWN";
    return {
      id: String(a.id),
      campaignId: a.campaign_id != null ? String(a.campaign_id) : null,
      name: a.name || "Untitled ad set",
      status,
      effectiveStatus,
      statusDisplay: normalizeMetaStatus(status, effectiveStatus),
      optimizationGoal: a.optimization_goal || null,
      insights: mergeInsights(a, insightsMap, range),
    };
  });

  cacheSet(key, normalised);
  return normalised;
}

export async function fetchMetaAds(adsetId, dateRange, bypassCache = false) {
  ensureConfigured();
  const range = parseMetaDateRange(dateRange);
  const key = getCacheKey("ads", range, adsetId || "all");
  if (!bypassCache) {
    const cached = cacheGet(key);
    if (cached) return cached;
  }

  const endpoint = adsetId ? `${adsetId}/ads` : `act_${env.metaAdAccountId}/ads`;
  const adsRaw = await metaGetAllPages(endpoint, {
    fields: "id,adset_id,campaign_id,name,status,effective_status",
    limit: 100,
  }, { operationName: "FetchAds" });

  const insightsMap = await fetchInsightsForLevel("ad", "ad_id", range);

  const normalised = adsRaw.map((ad) => {
    const status = ad.status || "UNKNOWN";
    const effectiveStatus = ad.effective_status || ad.status || "UNKNOWN";
    return {
      id: String(ad.id),
      adsetId: ad.adset_id != null ? String(ad.adset_id) : null,
      campaignId: ad.campaign_id != null ? String(ad.campaign_id) : null,
      name: ad.name || "Untitled ad",
      status,
      effectiveStatus,
      statusDisplay: normalizeMetaStatus(status, effectiveStatus),
      insights: mergeInsights(ad, insightsMap, range),
    };
  });

  cacheSet(key, normalised);
  return normalised;
}

// ────────────────────────────────────────────────────────────────────────────
// Account summary (dashboard KPIs)
// ────────────────────────────────────────────────────────────────────────────

export async function fetchMetaSummary(dateRange, bypassCache = false) {
  ensureConfigured();
  const range = parseMetaDateRange(dateRange);
  const key = getCacheKey("summary", range);
  if (!bypassCache) {
    const cached = cacheGet(key);
    if (cached) return cached;
  }

  const [account, insightsRows] = await Promise.all([
    metaGetAccount(),
    metaGetAllPages(`act_${env.metaAdAccountId}/insights`, {
      level: "account",
      time_range: JSON.stringify({ since: range.since, until: range.until }),
      fields: INSIGHTS_FIELDS,
      limit: 100,
    }, { operationName: "FetchAccountInsights" }),
  ]);

  const rawInsight = insightsRows[0] || { date_start: range.since, date_stop: range.until };
  const insights = normalizeInsights(rawInsight);
  const summary = { account, dateRange: range, insights };
  cacheSet(key, summary);
  return summary;
}

// ────────────────────────────────────────────────────────────────────────────
// Daily trend (single chart: spend + purchases)
// ────────────────────────────────────────────────────────────────────────────

export async function fetchMetaDailyInsights(dateRange, bypassCache = false) {
  ensureConfigured();
  const range = parseMetaDateRange(dateRange);
  const key = getCacheKey("daily", range);
  if (!bypassCache) {
    const cached = cacheGet(key);
    if (cached) return cached;
  }

  const rows = await metaGetAllPages(`act_${env.metaAdAccountId}/insights`, {
    level: "account",
    time_increment: 1,
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    fields: `${INSIGHTS_FIELDS}`,
    limit: 100,
  }, { operationName: "FetchDailyInsights" });

  const daily = rows
    .map((row) => {
      const insights = normalizeInsights(row);
      return {
        date: row.date_start,
        spend: insights.spend,
        purchases: insights.purchases,
        purchaseValue: insights.purchaseValue,
        purchaseRoas: insights.purchaseRoas,
      };
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  cacheSet(key, daily);
  return daily;
}

export { isMetaRateLimitError };
