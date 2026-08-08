import { env, getMetaCapability } from "../config/env.js";
import { addNetworkLog } from "./sorterRuntimeService.js";
import { logInfo, logError } from "../utils/logger.js";

// Bounded in-memory cache
// Key structure: `account:range_start:range_end:endpoint_name`
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

export function clearMetaCache() {
  cache.clear();
}

function getCacheEntry(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCacheEntry(key, data) {
  // Keep cache bounded to 100 entries to prevent memory leak
  if (cache.size >= 100) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, { timestamp: Date.now(), data });
}

// Fetch helper with network logs integration
async function callMetaGraphApi(url, params = {}, options = {}) {
  const capability = getMetaCapability();
  const token = params.access_token || capability.available ? env.metaAccessToken : null;
  
  const finalParams = {
    ...params,
    access_token: token,
  };

  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  
  const sanitizedUrl = url.replace(/access_token=[^&]+/, "access_token=REDACTED");
  
  try {
    const urlObj = new URL(url);
    for (const [key, value] of Object.entries(finalParams)) {
      if (value !== undefined && value !== null) {
        urlObj.searchParams.append(key, value);
      }
    }

    const response = await fetch(urlObj.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(15000),
    });
    
    const data = await response.json();
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const error = new Error(`Request failed with status ${response.status}`);
      error.response = { status: response.status, data };
      throw error;
    }
    
    // Record to NetworkActivity
    addNetworkLog({
      provider: "Meta",
      operationName: options.operationName || "FetchMeta",
      method: "GET",
      endpoint: sanitizedUrl,
      statusCode: response.status,
      status: "success",
      durationMs,
      startedAt,
      completedAt: new Date().toISOString(),
    });

    return data;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const statusCode = error.response?.status || 500;
    const errorData = error.response?.data?.error || {};
    
    const errorMessage = errorData.message || error.message;
    const rateLimitType = isMetaRateLimitError(errorData) ? "rate_limited" : null;

    addNetworkLog({
      provider: "Meta",
      operationName: options.operationName || "FetchMeta",
      method: "GET",
      endpoint: sanitizedUrl,
      statusCode,
      status: rateLimitType ? "rate_limited" : "failure",
      durationMs,
      errorMessage,
      startedAt,
      completedAt: new Date().toISOString(),
      metadata: { error: errorData },
    });

    throw error;
  }
}

function isMetaRateLimitError(fbError) {
  const code = fbError.code;
  const subcode = fbError.error_subcode;
  // Common Facebook Rate Limit Codes
  // 17: User request limit reached
  // 32: Page request limit reached
  // 613: Custom level rate limit
  return code === 17 || code === 32 || code === 613 || subcode === 2446079;
}

export async function checkMetaConnectivity() {
  const capability = getMetaCapability();
  if (!capability.available) {
    return { status: "NOT_CONFIGURED", ok: false };
  }

  // Use test mock if NODE_ENV is test or if specifically mocked
  if (process.env.NODE_ENV === "test" && !env.metaAccessToken) {
    return {
      status: "CONNECTED",
      ok: true,
      adAccount: "Mock Ad Account (12345)",
      currency: "INR",
      timezone: "Asia/Kolkata",
    };
  }

  try {
    const accountId = env.metaAdAccountId;
    const url = `https://graph.facebook.com/v19.0/act_${accountId}`;
    const data = await callMetaGraphApi(url, {
      fields: "name,currency,timezone_name",
    }, { operationName: "CheckConnectivity" });

    return {
      status: "CONNECTED",
      ok: true,
      adAccount: data.name,
      currency: data.currency,
      timezone: data.timezone_name,
    };
  } catch (error) {
    const fbError = error.response?.data?.error || {};
    if (isMetaRateLimitError(fbError)) {
      return { status: "RATE_LIMITED", ok: false, error: fbError.message };
    }
    
    // Check permission vs authentication issues
    // Code 190 = invalid OAuth access token
    // Code 200-299 = permissions issues
    if (fbError.code === 190) {
      return { status: "TOKEN_INVALID", ok: false, error: fbError.message };
    }
    
    if (fbError.code >= 200 && fbError.code <= 299) {
      return { status: "PERMISSION_INSUFFICIENT", ok: false, error: fbError.message };
    }

    return { status: "UNAVAILABLE", ok: false, error: fbError.message || error.message };
  }
}

// Normalise Insights
export function normalizeInsights(rawInsight) {
  const spend = parseFloat(rawInsight.spend || 0);
  const impressions = parseInt(rawInsight.impressions || 0, 10);
  const reach = parseInt(rawInsight.reach || 0, 10);
  const clicks = parseInt(rawInsight.clicks || 0, 10);
  
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  
  // Normalise Purchases & Purchase Values safely
  let purchases = 0;
  let purchaseValue = 0;
  let purchaseRoas = 0;

  if (rawInsight.actions) {
    const purchaseAction = rawInsight.actions.find(a => a.action_type === "purchase");
    if (purchaseAction) {
      purchases = parseInt(purchaseAction.value || 0, 10);
    }
  }

  if (rawInsight.action_values) {
    const purchaseValueAction = rawInsight.action_values.find(a => a.action_type === "purchase");
    if (purchaseValueAction) {
      purchaseValue = parseFloat(purchaseValueAction.value || 0);
    }
  }

  // Calculate ROAS: purchaseValue / spend (avoid divide by zero)
  purchaseRoas = spend > 0 ? purchaseValue / spend : 0;

  return {
    spend,
    impressions,
    reach,
    clicks,
    ctr,
    cpc,
    cpm,
    purchases,
    purchaseValue,
    purchaseRoas,
    dateStart: rawInsight.date_start,
    dateStop: rawInsight.date_stop,
  };
}

// Fetch entities with pagination
async function fetchMetaEntityPaginated(endpoint, queryParams = {}, operationName = "FetchEntity") {
  let allData = [];
  let nextUrl = `https://graph.facebook.com/v19.0/${endpoint}`;
  let params = { ...queryParams };

  // Safety ceiling to prevent infinite loop/extreme memory usage in pagination
  const PAGE_LIMIT = 20;
  let pageCount = 0;

  while (nextUrl && pageCount < PAGE_LIMIT) {
    pageCount++;
    let data;
    if (pageCount === 1) {
      data = await callMetaGraphApi(nextUrl, params, { operationName });
    } else {
      // url already has access_token and params embedded
      data = await callMetaGraphApi(nextUrl, {}, { operationName });
    }

    if (data && Array.isArray(data.data)) {
      allData.push(...data.data);
    }

    nextUrl = data?.paging?.next || null;
    params = {}; // clear params after first request
  }

  return allData;
}

export async function fetchMetaCampaigns(dateRange, bypassCache = false) {
  const capability = getMetaCapability();
  if (!capability.available) {
    throw new Error("Meta Ads integration is not configured");
  }

  const accountId = env.metaAdAccountId;
  const cacheKey = `${accountId}:${dateRange.since}:${dateRange.until}:campaigns`;
  
  if (!bypassCache) {
    const cached = getCacheEntry(cacheKey);
    if (cached) return cached;
  }

  // Mock payload for test environment when credentials are not configured
  if (process.env.NODE_ENV === "test" && !env.metaAccessToken) {
    return getMockCampaigns(dateRange);
  }

  // Fetch campaigns
  const campaignsRaw = await fetchMetaEntityPaginated(
    `act_${accountId}/campaigns`,
    {
      fields: "id,name,objective,status,effective_status,created_time,updated_time",
      limit: 100,
    },
    "FetchCampaigns"
  );

  // Fetch insights for the campaigns
  const insightsRaw = await fetchMetaEntityPaginated(
    `act_${accountId}/insights`,
    {
      level: "campaign",
      time_range: JSON.stringify({ since: dateRange.since, until: dateRange.until }),
      fields: "campaign_id,spend,impressions,reach,clicks,actions,action_values,date_start,date_stop",
      limit: 100,
    },
    "FetchCampaignInsights"
  );

  const insightsMap = new Map(insightsRaw.map(ins => [ins.campaign_id, ins]));

  const normalised = campaignsRaw.map(c => {
    const rawIns = insightsMap.get(c.id) || { date_start: dateRange.since, date_stop: dateRange.until };
    return {
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      effectiveStatus: c.effective_status,
      createdTime: c.created_time,
      updatedTime: c.updated_time,
      insights: normalizeInsights(rawIns),
    };
  });

  setCacheEntry(cacheKey, normalised);
  return normalised;
}

export async function fetchMetaAdSets(campaignId, dateRange, bypassCache = false) {
  const capability = getMetaCapability();
  if (!capability.available) {
    throw new Error("Meta Ads integration is not configured");
  }

  const accountId = env.metaAdAccountId;
  const cacheKey = `${accountId}:${campaignId || "all"}:${dateRange.since}:${dateRange.until}:adsets`;

  if (!bypassCache) {
    const cached = getCacheEntry(cacheKey);
    if (cached) return cached;
  }

  if (process.env.NODE_ENV === "test" && !env.metaAccessToken) {
    return getMockAdSets(campaignId, dateRange);
  }

  const endpoint = campaignId ? `${campaignId}/adsets` : `act_${accountId}/adsets`;
  const adsetsRaw = await fetchMetaEntityPaginated(
    endpoint,
    {
      fields: "id,campaign_id,name,status,effective_status,optimization_goal",
      limit: 100,
    },
    "FetchAdSets"
  );

  const insightsRaw = await fetchMetaEntityPaginated(
    `act_${accountId}/insights`,
    {
      level: "adset",
      time_range: JSON.stringify({ since: dateRange.since, until: dateRange.until }),
      fields: "adset_id,spend,impressions,reach,clicks,actions,action_values,date_start,date_stop",
      limit: 100,
    },
    "FetchAdSetInsights"
  );

  const insightsMap = new Map(insightsRaw.map(ins => [ins.adset_id, ins]));

  const normalised = adsetsRaw.map(a => {
    const rawIns = insightsMap.get(a.id) || { date_start: dateRange.since, date_stop: dateRange.until };
    return {
      id: a.id,
      campaignId: a.campaign_id,
      name: a.name,
      status: a.status,
      effectiveStatus: a.effective_status,
      optimizationGoal: a.optimization_goal,
      insights: normalizeInsights(rawIns),
    };
  });

  setCacheEntry(cacheKey, normalised);
  return normalised;
}

export async function fetchMetaAds(adsetId, dateRange, bypassCache = false) {
  const capability = getMetaCapability();
  if (!capability.available) {
    throw new Error("Meta Ads integration is not configured");
  }

  const accountId = env.metaAdAccountId;
  const cacheKey = `${accountId}:${adsetId || "all"}:${dateRange.since}:${dateRange.until}:ads`;

  if (!bypassCache) {
    const cached = getCacheEntry(cacheKey);
    if (cached) return cached;
  }

  if (process.env.NODE_ENV === "test" && !env.metaAccessToken) {
    return getMockAds(adsetId, dateRange);
  }

  const endpoint = adsetId ? `${adsetId}/ads` : `act_${accountId}/ads`;
  const adsRaw = await fetchMetaEntityPaginated(
    endpoint,
    {
      fields: "id,adset_id,campaign_id,name,status,effective_status",
      limit: 100,
    },
    "FetchAds"
  );

  const insightsRaw = await fetchMetaEntityPaginated(
    `act_${accountId}/insights`,
    {
      level: "ad",
      time_range: JSON.stringify({ since: dateRange.since, until: dateRange.until }),
      fields: "ad_id,spend,impressions,reach,clicks,actions,action_values,date_start,date_stop",
      limit: 100,
    },
    "FetchAdInsights"
  );

  const insightsMap = new Map(insightsRaw.map(ins => [ins.ad_id, ins]));

  const normalised = adsRaw.map(ad => {
    const rawIns = insightsMap.get(ad.id) || { date_start: dateRange.since, date_stop: dateRange.until };
    return {
      id: ad.id,
      adsetId: ad.adset_id,
      campaignId: ad.campaign_id,
      name: ad.name,
      status: ad.status,
      effectiveStatus: ad.effective_status,
      insights: normalizeInsights(rawIns),
    };
  });

  setCacheEntry(cacheKey, normalised);
  return normalised;
}

// Mock Builders for testing and offline fallback
function getMockCampaigns(dateRange) {
  return [
    {
      id: "mock_c_1",
      name: "Brand Awareness Campaign",
      objective: "OUTCOME_AWARENESS",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      createdTime: "2026-08-01T00:00:00+0000",
      updatedTime: "2026-08-05T00:00:00+0000",
      insights: {
        spend: 5000,
        impressions: 120000,
        reach: 95000,
        clicks: 3400,
        ctr: 2.83,
        cpc: 1.47,
        cpm: 41.67,
        purchases: 0,
        purchaseValue: 0,
        purchaseRoas: 0,
        dateStart: dateRange.since,
        dateStop: dateRange.until,
      }
    },
    {
      id: "mock_c_2",
      name: "Shopify Purchase Conversions",
      objective: "OUTCOME_SALES",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      createdTime: "2026-08-02T00:00:00+0000",
      updatedTime: "2026-08-07T00:00:00+0000",
      insights: {
        spend: 15000,
        impressions: 250000,
        reach: 180000,
        clicks: 8900,
        ctr: 3.56,
        cpc: 1.69,
        cpm: 60.00,
        purchases: 45,
        purchaseValue: 54000,
        purchaseRoas: 3.6,
        dateStart: dateRange.since,
        dateStop: dateRange.until,
      }
    }
  ];
}

function getMockAdSets(campaignId, dateRange) {
  const adsets = [
    {
      id: "mock_as_1",
      campaignId: "mock_c_1",
      name: "Interest - Fashion & Lifestyle",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      optimizationGoal: "REACH",
      insights: {
        spend: 5000,
        impressions: 120000,
        reach: 95000,
        clicks: 3400,
        ctr: 2.83,
        cpc: 1.47,
        cpm: 41.67,
        purchases: 0,
        purchaseValue: 0,
        purchaseRoas: 0,
        dateStart: dateRange.since,
        dateStop: dateRange.until,
      }
    },
    {
      id: "mock_as_2",
      campaignId: "mock_c_2",
      name: "Lookalike 1% Purchase Sorter",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      insights: {
        spend: 10000,
        impressions: 160000,
        reach: 120000,
        clicks: 6000,
        ctr: 3.75,
        cpc: 1.67,
        cpm: 62.50,
        purchases: 32,
        purchaseValue: 38400,
        purchaseRoas: 3.84,
        dateStart: dateRange.since,
        dateStop: dateRange.until,
      }
    },
    {
      id: "mock_as_3",
      campaignId: "mock_c_2",
      name: "Retargeting Cart Abandoners",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      insights: {
        spend: 5000,
        impressions: 90000,
        reach: 60000,
        clicks: 2900,
        ctr: 3.22,
        cpc: 1.72,
        cpm: 55.56,
        purchases: 13,
        purchaseValue: 15600,
        purchaseRoas: 3.12,
        dateStart: dateRange.since,
        dateStop: dateRange.until,
      }
    }
  ];
  return campaignId ? adsets.filter(a => a.campaignId === campaignId) : adsets;
}

function getMockAds(adsetId, dateRange) {
  const ads = [
    {
      id: "mock_ad_1",
      adsetId: "mock_as_1",
      campaignId: "mock_c_1",
      name: "Video Ad - Product Intro",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      insights: {
        spend: 5000,
        impressions: 120000,
        reach: 95000,
        clicks: 3400,
        ctr: 2.83,
        cpc: 1.47,
        cpm: 41.67,
        purchases: 0,
        purchaseValue: 0,
        purchaseRoas: 0,
        dateStart: dateRange.since,
        dateStop: dateRange.until,
      }
    },
    {
      id: "mock_ad_2",
      adsetId: "mock_as_2",
      campaignId: "mock_c_2",
      name: "Carousel Image - Best Sellers",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      insights: {
        spend: 7000,
        impressions: 110000,
        reach: 85000,
        clicks: 4300,
        ctr: 3.91,
        cpc: 1.63,
        cpm: 63.64,
        purchases: 25,
        purchaseValue: 30000,
        purchaseRoas: 4.29,
        dateStart: dateRange.since,
        dateStop: dateRange.until,
      }
    },
    {
      id: "mock_ad_3",
      adsetId: "mock_as_2",
      campaignId: "mock_c_2",
      name: "Single Image - Sorter Discount",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      insights: {
        spend: 3000,
        impressions: 50000,
        reach: 35000,
        clicks: 1700,
        ctr: 3.40,
        cpc: 1.76,
        cpm: 60.00,
        purchases: 7,
        purchaseValue: 8400,
        purchaseRoas: 2.8,
        dateStart: dateRange.since,
        dateStop: dateRange.until,
      }
    },
    {
      id: "mock_ad_4",
      adsetId: "mock_as_3",
      campaignId: "mock_c_2",
      name: "Dynamic Creative retargeting",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      insights: {
        spend: 5000,
        impressions: 90000,
        reach: 60000,
        clicks: 2900,
        ctr: 3.22,
        cpc: 1.72,
        cpm: 55.56,
        purchases: 13,
        purchaseValue: 15600,
        purchaseRoas: 3.12,
        dateStart: dateRange.since,
        dateStop: dateRange.until,
      }
    }
  ];
  return adsetId ? ads.filter(a => a.adsetId === adsetId) : ads;
}
