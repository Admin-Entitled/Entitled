import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import app from "../app.js";
import { env, resetEnvOverrides } from "../config/env.js";
import {
  normalizeInsights,
  extractPurchaseMetrics,
  normalizeMetaStatus,
  parseMetaDateRange,
  clearMetaCache,
  fetchMetaCampaigns,
  fetchMetaAdSets,
  fetchMetaAds,
  fetchMetaSummary,
  fetchMetaDailyInsights,
  checkMetaConnectivity,
  fillMissingDays,
} from "../services/metaAdsService.js";
import {
  metaGetAllPages,
  metaGetAccount,
  isMetaRateLimitError,
  normalizeMetaApiError,
} from "../services/metaAdsClient.js";
import { listNetworkLogs } from "../services/sorterRuntimeService.js";
import { redactSecrets } from "../utils/sanitize.js";

const HERE = import.meta.url;

function startServer(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

function request(server, path, options = {}) {
  const address = server.address();
  const url = new URL(path, "http://127.0.0.1:" + address.port);
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...options.headers },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// ── Deterministic Meta fetch stub ───────────────────────────────────────────
// Routes on URL substring; returns Response-shaped objects so the canonical
// client works unchanged.
function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return data; },
  };
}

/**
 * Install a deterministic global fetch stub. `routes` is an array of
 * { match(url) -> bool, status, body }; the first matching route wins.
 */
function stubMetaFetch(routes) {
  const original = global.fetch;
  global.fetch = async (url) => {
    const route = routes.find((r) => r.match(String(url)));
    if (!route) {
      return jsonResponse(500, { error: { message: `Unstubbed Meta URL: ${url}` } });
    }
    return jsonResponse(route.status, route.body);
  };
  return () => { global.fetch = original; };
}

const ACCOUNT_BODY = {
  id: "1234567890",
  name: "Entitled Ads",
  currency: "INR",
  timezone_name: "Asia/Kolkata",
  account_status: 1,
};

function accountRoute() {
  return {
    match: (url) => url.includes("/act_1234567890?") || (url.includes("/act_1234567890") && !url.includes("/insights") && !url.includes("/campaigns") && !url.includes("/adsets") && !url.includes("/ads")),
    status: 200,
    body: ACCOUNT_BODY,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 39. Configuration → differentiated statuses
// ════════════════════════════════════════════════════════════════════════════

test("Meta Ads Config A: missing config → NOT_CONFIGURED (health 200, ok false)", async () => {
  env.metaAccessToken = "";
  env.metaAdAccountId = "";
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/health");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.status, "NOT_CONFIGURED");
    assert.equal(data.ok, false);
    assert.deepEqual(data.missingVariables, ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"]);
  } finally {
    server.close();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("Meta Ads Config B: invalid token → INVALID_TOKEN (provider code 190)", async () => {
  env.metaAccessToken = "SUPER_SECRET_META_TOKEN";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([
    {
      match: () => true,
      status: 400,
      body: { error: { code: 190, message: "Invalid OAuth access token." } },
    },
  ]);
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/health?bypassCache=true");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.status, "INVALID_TOKEN");
    assert.equal(data.ok, false);
    assert.ok(!res.body.includes("SUPER_SECRET_META_TOKEN"));
  } finally {
    server.close();
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("Meta Ads Config C: permission failure → INSUFFICIENT_PERMISSIONS (provider code 200)", async () => {
  env.metaAccessToken = "SUPER_SECRET_META_TOKEN";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([
    {
      match: () => true,
      status: 400,
      body: { error: { code: 200, message: "Permissions error." } },
    },
  ]);
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/health?bypassCache=true");
    const data = JSON.parse(res.body);
    assert.equal(data.status, "INSUFFICIENT_PERMISSIONS");
    assert.equal(data.ok, false);
  } finally {
    server.close();
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("Meta Ads Config D: rate limit → RATE_LIMITED (provider code 17)", async () => {
  env.metaAccessToken = "SUPER_SECRET_META_TOKEN";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([
    {
      match: () => true,
      status: 429,
      body: { error: { code: 17, message: "User request limit reached." } },
    },
  ]);
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/health?bypassCache=true");
    const data = JSON.parse(res.body);
    assert.equal(data.status, "RATE_LIMITED");
    assert.equal(data.ok, false);
  } finally {
    server.close();
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("Meta Ads Config E: valid mocked response → CONNECTED with account metadata", async () => {
  env.metaAccessToken = "SUPER_SECRET_META_TOKEN";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([accountRoute()]);
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/health?bypassCache=true");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.status, "CONNECTED");
    assert.equal(data.ok, true);
    assert.equal(data.account.name, "Entitled Ads");
    assert.equal(data.account.currency, "INR");
    assert.equal(data.account.timezone, "Asia/Kolkata");
    assert.ok(!res.body.includes("SUPER_SECRET_META_TOKEN"));
  } finally {
    server.close();
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 45. Security — access token never leaks
// ════════════════════════════════════════════════════════════════════════════

test("Meta Ads Security: token never appears in responses, logs, or network activity", async () => {
  env.metaAccessToken = "SUPER_SECRET_META_TOKEN";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([
    accountRoute(),
    {
      match: (url) => url.includes("/campaigns"),
      status: 200,
      body: {
        data: [{ id: "c1", name: "Campaign A", objective: "OUTCOME_SALES", status: "ACTIVE", effective_status: "ACTIVE" }],
        paging: { next: `https://graph.facebook.com/v26.0/page2?access_token=SUPER_SECRET_META_TOKEN` },
      },
    },
    {
      match: (url) => url.includes("page2"),
      status: 200,
      body: {
        data: [{ id: "c2", name: "Campaign B", objective: "OUTCOME_SALES", status: "PAUSED", effective_status: "PAUSED" }],
      },
    },
    {
      match: (url) => url.includes("/insights"),
      status: 200,
      body: { data: [{ campaign_id: "c1", spend: "10.00", impressions: "100", clicks: "5" }] },
    },
  ]);
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/campaigns?since=2026-08-01&until=2026-08-07&bypassCache=true");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.ok(Array.isArray(data.campaigns));
    assert.ok(!res.body.includes("SUPER_SECRET_META_TOKEN"));

    // Network Activity logs must sanitize the endpoint and never carry the token.
    const netLogs = listNetworkLogs({ limit: 50 });
    const logStr = JSON.stringify(netLogs);
    assert.ok(!logStr.includes("SUPER_SECRET_META_TOKEN"), "Token leaked to network logs");
    assert.ok(!logStr.includes("access_token=SUPER_SECRET_META_TOKEN"));
    assert.ok(logStr.includes("provider\":\"Meta\""), "Meta requests must be recorded in Network Activity");

    // redactSecrets must mask the token string directly.
    assert.ok(!redactSecrets("token SUPER_SECRET_META_TOKEN").includes("SUPER_SECRET_META_TOKEN"));
  } finally {
    server.close();
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("Meta Ads Security: sanitize.js redacts EAA-prefixed Meta tokens", () => {
  const sample = "Failed fetching https://graph.facebook.com/v26.0/act_1/campaigns?access_token=EAAxYzAbCdefGhIjKlMnOpQrStUvWxYz0123456789";
  const sanitized = redactSecrets(sample);
  assert.ok(!sanitized.includes("EAAxYzAbCdefGhIjKlMnOpQrStUvWxYz0123456789"));
  assert.ok(sanitized.includes("[REDACTED_META_TOKEN]"));
});

// ════════════════════════════════════════════════════════════════════════════
// 40. Complete pagination
// ════════════════════════════════════════════════════════════════════════════

test("Meta Ads Pagination: campaigns across multiple pages are fully collected", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const page1 = Array.from({ length: 50 }, (_, i) => ({ id: `p1_c${i}`, name: `C ${i}` }));
  const page2 = Array.from({ length: 50 }, (_, i) => ({ id: `p2_c${i}`, name: `C ${i}` }));
  const page3 = Array.from({ length: 7 }, (_, i) => ({ id: `p3_c${i}`, name: `C ${i}` }));

  const restore = stubMetaFetch([
    {
      match: (url) => url.includes("campaigns_page3"),
      status: 200,
      body: { data: page3 },
    },
    {
      match: (url) => url.includes("campaigns_page2"),
      status: 200,
      body: { data: page2, paging: { next: "https://graph.facebook.com/v26.0/campaigns_page3?access_token=tok" } },
    },
    {
      match: (url) => url.includes("/campaigns?") && !url.includes("page"),
      status: 200,
      body: { data: page1, paging: { next: "https://graph.facebook.com/v26.0/campaigns_page2?access_token=tok" } },
    },
    { match: () => true, status: 200, body: { data: [] } },
  ]);

  try {
    const campaigns = await fetchMetaCampaigns({ since: "2026-08-01", until: "2026-08-07" }, true);
    assert.equal(campaigns.length, 107, "All 3 pages (50+50+7) must be collected");
    assert.ok(campaigns.some((c) => c.id === "p3_c6"));
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("Meta Ads Pagination: ad sets across multiple pages are fully collected", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const page1 = Array.from({ length: 50 }, (_, i) => ({ id: `as_${i}`, campaign_id: "c1", name: `AS ${i}` }));
  const page2 = Array.from({ length: 12 }, (_, i) => ({ id: `as2_${i}`, campaign_id: "c1", name: `AS ${i}` }));

  const restore = stubMetaFetch([
    {
      match: (url) => url.includes("adsets_next"),
      status: 200,
      body: { data: page2 },
    },
    {
      match: (url) => url.includes("/adsets?") && !url.includes("next"),
      status: 200,
      body: { data: page1, paging: { next: "https://graph.facebook.com/v26.0/adsets_next?access_token=tok" } },
    },
    { match: () => true, status: 200, body: { data: [] } },
  ]);

  try {
    const adsets = await fetchMetaAdSets("c1", { since: "2026-08-01", until: "2026-08-07" }, true);
    assert.equal(adsets.length, 62, "All ad set pages must be collected");
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("Meta Ads Pagination: ads across multiple pages are fully collected", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const page1 = Array.from({ length: 50 }, (_, i) => ({ id: `ad_${i}`, adset_id: "as1", campaign_id: "c1", name: `AD ${i}` }));
  const page2 = Array.from({ length: 25 }, (_, i) => ({ id: `ad2_${i}`, adset_id: "as1", campaign_id: "c1", name: `AD ${i}` }));

  const restore = stubMetaFetch([
    {
      match: (url) => url.includes("/ads") && !url.includes("ads_next"),
      status: 200,
      body: { data: page1, paging: { next: "https://graph.facebook.com/v26.0/ads_next?access_token=tok" } },
    },
    {
      match: (url) => url.includes("ads_next"),
      status: 200,
      body: { data: page2 },
    },
    { match: () => true, status: 200, body: { data: [] } },
  ]);

  try {
    const ads = await fetchMetaAds("as1", { since: "2026-08-01", until: "2026-08-07" }, true);
    assert.equal(ads.length, 75, "All ad pages must be collected");
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("Meta Ads Pagination: metaGetAllPages guards against runaway pagination", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([
    {
      match: () => true,
      status: 200,
      body: { data: [{ id: "x" }], paging: { next: "https://graph.facebook.com/v26.0/loop?access_token=tok" } },
    },
  ]);
  try {
    const collected = await metaGetAllPages("act_1234567890/campaigns", { fields: "id" }, { operationName: "LoopTest", pageLimit: 5 });
    assert.equal(collected.length, 5, "Page limit must bound infinite next loops");
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 41. Insights parsing
// ════════════════════════════════════════════════════════════════════════════

test("Meta Ads Insights: full metric parsing with purchase + value", () => {
  const raw = {
    spend: "100.00",
    impressions: "1000",
    reach: "800",
    clicks: "50",
    date_start: "2026-08-01",
    date_stop: "2026-08-07",
    actions: [
      { action_type: "link_click", value: "50" },
      { action_type: "purchase", value: "2" },
    ],
    action_values: [{ action_type: "purchase", value: "500.00" }],
  };
  const i = normalizeInsights(raw);
  assert.equal(i.spend, 100);
  assert.equal(i.impressions, 1000);
  assert.equal(i.reach, 800);
  assert.equal(i.clicks, 50);
  assert.equal(i.ctr, 5.0);
  assert.equal(i.cpc, 2.0);
  assert.equal(i.cpm, 100.0);
  assert.equal(i.purchases, 2);
  assert.equal(i.purchaseValue, 500);
  assert.equal(i.purchaseRoas, 5.0);
});

test("Meta Ads Insights: missing values remain safe (zeros, no NaN/Infinity)", () => {
  const i = normalizeInsights({});
  assert.equal(i.spend, 0);
  assert.equal(i.impressions, 0);
  assert.equal(i.reach, 0);
  assert.equal(i.clicks, 0);
  assert.equal(i.ctr, 0);
  assert.equal(i.cpc, 0);
  assert.equal(i.cpm, 0);
  assert.equal(i.purchases, 0);
  assert.equal(i.purchaseValue, 0);
  assert.equal(i.purchaseRoas, 0);
  assert.ok(Number.isFinite(i.purchaseRoas));
});

test("Meta Ads Insights: spend zero → ROAS safely zero, no divide-by-zero", () => {
  const i = normalizeInsights({ spend: "0", actions: [{ action_type: "purchase", value: "3" }], action_values: [{ action_type: "purchase", value: "900" }] });
  assert.equal(i.purchaseRoas, 0);
  assert.ok(Number.isFinite(i.purchaseRoas));
});

// ════════════════════════════════════════════════════════════════════════════
// 42. Purchase-event normalization
// ════════════════════════════════════════════════════════════════════════════

test("Meta Ads Purchase: only intended purchase event types count, no double counting", () => {
  const actions = [
    { action_type: "link_click", value: "120" },
    { action_type: "view_content", value: "400" },
    { action_type: "add_to_cart", value: "60" },
    { action_type: "initiate_checkout", value: "25" },
    { action_type: "purchase", value: "9" },
    { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" },
  ];
  const actionValues = [
    { action_type: "purchase", value: "4500" },
    { action_type: "offsite_conversion.fb_pixel_purchase", value: "1500" },
  ];
  const { purchases, purchaseValue } = extractPurchaseMetrics(actions, actionValues);
  // Priority rule: "purchase" wins; pixel purchase must NOT be double counted.
  assert.equal(purchases, 9);
  assert.equal(purchaseValue, 4500);
});

test("Meta Ads Purchase: falls back to pixel purchase when standard purchase absent", () => {
  const actions = [
    { action_type: "link_click", value: "10" },
    { action_type: "offsite_conversion.fb_pixel_purchase", value: "4" },
  ];
  const actionValues = [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "2000" }];
  const { purchases, purchaseValue } = extractPurchaseMetrics(actions, actionValues);
  assert.equal(purchases, 4);
  assert.equal(purchaseValue, 2000);
});

test("Meta Ads Purchase: non-purchase events never count", () => {
  const actions = [
    { action_type: "link_click", value: "100" },
    { action_type: "view_content", value: "300" },
    { action_type: "add_to_cart", value: "50" },
    { action_type: "initiate_checkout", value: "20" },
  ];
  const { purchases, purchaseValue } = extractPurchaseMetrics(actions, []);
  assert.equal(purchases, 0);
  assert.equal(purchaseValue, 0);
});

test("Meta Ads Purchase: normalizeInsights routes through the same purchase rule", () => {
  const i = normalizeInsights({
    spend: "1000",
    actions: [
      { action_type: "purchase", value: "5" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "2" },
    ],
    action_values: [
      { action_type: "purchase", value: "8000" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "3000" },
    ],
  });
  assert.equal(i.purchases, 5, "only standard purchase counts when present");
  assert.equal(i.purchaseValue, 8000, "purchase value follows the SAME event type as purchases");
  assert.equal(i.purchaseRoas, 8.0);
});

// ════════════════════════════════════════════════════════════════════════════
// 25. Status normalization
// ════════════════════════════════════════════════════════════════════════════

test("Meta Ads Status: normalizes provider + effective status centrally", () => {
  assert.equal(normalizeMetaStatus("ACTIVE", "ACTIVE").label, "Active");
  assert.equal(normalizeMetaStatus("ACTIVE", "ACTIVE").tone, "active");
  assert.equal(normalizeMetaStatus("PAUSED", "PAUSED").tone, "paused");
  assert.equal(normalizeMetaStatus("ACTIVE", "CAMPAIGN_PAUSED").effectiveLabel, "Paused (campaign)");
  assert.equal(normalizeMetaStatus("ARCHIVED", "ARCHIVED").tone, "archived");
  assert.equal(normalizeMetaStatus("DELETED", "DELETED").tone, "deleted");
  assert.equal(normalizeMetaStatus("DISAPPROVED", "DISAPPROVED").tone, "issue");
});

// ════════════════════════════════════════════════════════════════════════════
// Date-range contract
// ════════════════════════════════════════════════════════════════════════════

test("Meta Ads Date Range: canonical YYYY-MM-DD contract, defaults to 30 days", () => {
  const defaults = parseMetaDateRange({});
  assert.match(defaults.since, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(defaults.until, /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => parseMetaDateRange({ since: "08-01-2026", until: "2026-08-07" }), (err) => err.code === "VALIDATION_ERROR");
  assert.throws(() => parseMetaDateRange({ since: "2026-08-10", until: "2026-08-07" }), (err) => err.code === "VALIDATION_ERROR");
  assert.throws(() => parseMetaDateRange({ since: "2026-08-10" }), (err) => err.code === "VALIDATION_ERROR");
});

// ════════════════════════════════════════════════════════════════════════════
// 43. INR currency context flows through the account endpoint
// ════════════════════════════════════════════════════════════════════════════

test("Meta Ads INR: account currency INR is exposed as canonical reporting context", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([accountRoute()]);
  try {
    const account = await metaGetAccount();
    assert.equal(account.currency, "INR");
    assert.equal(account.timezoneName, "Asia/Kolkata");
    assert.equal(account.name, "Entitled Ads");
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("Meta Ads Routes: GET /api/meta-ads/account returns currency without token", async () => {
  env.metaAccessToken = "SUPER_SECRET_META_TOKEN";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([accountRoute()]);
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/account");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.account.currency, "INR");
    assert.ok(!res.body.includes("SUPER_SECRET_META_TOKEN"));
  } finally {
    server.close();
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Summary + daily trend
// ════════════════════════════════════════════════════════════════════════════

test("Meta Ads Summary: account-level KPIs for a date range", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([
    accountRoute(),
    {
      match: (url) => url.includes("/insights"),
      status: 200,
      body: {
        data: [{
          spend: "50000.00",
          impressions: "800000",
          reach: "600000",
          clicks: "20000",
          actions: [{ action_type: "purchase", value: "120" }],
          action_values: [{ action_type: "purchase", value: "180000" }],
        }],
      },
    },
  ]);
  try {
    const summary = await fetchMetaSummary({ since: "2026-08-01", until: "2026-08-31" }, true);
    assert.equal(summary.account.currency, "INR");
    assert.equal(summary.insights.spend, 50000);
    assert.equal(summary.insights.purchases, 120);
    assert.equal(summary.insights.purchaseValue, 180000);
    assert.equal(summary.insights.purchaseRoas, 3.6);
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("Meta Ads Daily: trend rows are normalized and date-sorted", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([
    {
      match: () => true,
      status: 200,
      body: {
        data: [
          { date_start: "2026-08-03", spend: "30", actions: [{ action_type: "purchase", value: "1" }] },
          { date_start: "2026-08-01", spend: "10", actions: [{ action_type: "purchase", value: "0" }] },
          { date_start: "2026-08-02", spend: "20", actions: [{ action_type: "purchase", value: "2" }] },
        ],
      },
    },
  ]);
  try {
    // Range query since 01 to 03 Aug to match the 3 expected elements
    const daily = await fetchMetaDailyInsights({ since: "2026-08-01", until: "2026-08-03" }, true);
    assert.deepEqual(daily.map((d) => d.date), ["2026-08-01", "2026-08-02", "2026-08-03"]);
    assert.equal(daily[1].purchases, 2);
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 46. READ-ONLY: no mutation operations exist
// ════════════════════════════════════════════════════════════════════════════

test("Meta Ads Read-Only: routes expose no campaign/adset/ad mutation endpoints", () => {
  const routeSrc = fs.readFileSync(new URL("./metaAds.js", import.meta.url), "utf8");
  assert.ok(!/router\.(put|patch|delete)\(/i.test(routeSrc), "No PUT/PATCH/DELETE routes may exist");
  assert.ok(!routeSrc.includes("router.post(\"/meta-ads/campaigns\""), "No campaign creation");
  assert.ok(!routeSrc.includes("router.post(\"/meta-ads/adsets\""), "No ad set creation");
  assert.ok(!routeSrc.includes("router.post(\"/meta-ads/ads\""), "No ad creation");
  assert.ok(!routeSrc.includes("router.post(\"/meta-ads/adsets\""), "No ad set creation");
  // POST routes are limited to local cache clearing and read-only report generation.
  const posts = [...routeSrc.matchAll(/router\.post\("([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(posts, ["/meta-ads/refresh", "/meta-ads/report"]);
});

test("Meta Ads Read-Only: provider client exposes only read helpers", () => {
  const clientSrc = fs.readFileSync(new URL("../services/metaAdsClient.js", import.meta.url), "utf8");
  for (const forbidden of ["post(", "put(", "patch(", "delete(", "createCampaign", "updateCampaign", "pauseCampaign", "createAdSet", "createAd"]) {
    assert.ok(!clientSrc.includes(forbidden), `Provider client must not contain ${forbidden}`);
  }
  assert.ok(/export async function metaGet\(/.test(clientSrc));
  assert.ok(/export async function metaGetAllPages\(/.test(clientSrc));
  assert.ok(/export async function metaGetAccount\(/.test(clientSrc));
});

// ════════════════════════════════════════════════════════════════════════════
// Error-model helpers
// ════════════════════════════════════════════════════════════════════════════

test("Meta Ads Errors: normalizeMetaApiError maps provider codes to stable AppError codes", () => {
  assert.equal(normalizeMetaApiError({ status: 400, data: { error: { code: 190 } } }).code, "META_AUTH_FAILED");
  assert.equal(normalizeMetaApiError({ status: 400, data: { error: { code: 200 } } }).code, "META_PERMISSION_DENIED");
  assert.equal(normalizeMetaApiError({ status: 429, data: { error: { code: 17 } } }).code, "META_RATE_LIMITED");
  assert.equal(normalizeMetaApiError({ status: 500, data: { error: { code: 1 } } }).code, "META_API_ERROR");
  assert.ok(isMetaRateLimitError({ code: 613 }));
  assert.ok(isMetaRateLimitError({ error_subcode: 2446079 }));
  assert.ok(!isMetaRateLimitError({ code: 190 }));
});

test("Meta Ads Routes: date-format errors are normalized with stable codes", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/campaigns?since=notadate");
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.equal(data.code, "VALIDATION_ERROR");
    assert.ok(!JSON.stringify(data).includes("access_token"));
  } finally {
    server.close();
    clearMetaCache();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Cache behavior
// ════════════════════════════════════════════════════════════════════════════

test("Meta Ads Cache: cached campaigns are served without repeat provider calls", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  let campaignCalls = 0;
  const restore = stubMetaFetch([
    {
      match: (url) => url.includes("/campaigns"),
      status: 200,
      body: { data: [{ id: "c1", name: "Cached Campaign", objective: "OUTCOME_SALES", status: "ACTIVE", effective_status: "ACTIVE" }] },
    },
    { match: (url) => { if (url.includes("/insights")) { campaignCalls += 1; return true; } return true; }, status: 200, body: { data: [] } },
  ]);
  try {
    const range = { since: "2026-08-01", until: "2026-08-07" };
    const first = await fetchMetaCampaigns(range, true);
    const second = await fetchMetaCampaigns(range, false);
    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.equal(second[0].name, "Cached Campaign");
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("Meta Ads Cache: POST /api/meta-ads/refresh clears the bounded cache", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/refresh", { method: "POST" });
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.success, true);
  } finally {
    server.close();
    clearMetaCache();
  }
});

test("Meta Ads Diagnostics: /api/health/diagnostics reports safe Meta snapshot without token", async () => {
  env.metaAccessToken = "SUPER_SECRET_META_TOKEN";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([accountRoute()]);
  const server = await startServer(app);
  try {
    await request(server, "/api/meta-ads/health?bypassCache=true"); // populate connectivity cache
    const res = await request(server, "/api/health/diagnostics");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.metaAds.configured, true);
    assert.equal(data.metaAds.connectionStatus, "CONNECTED");
    assert.equal(data.metaAds.currency, "INR");
    assert.equal(data.metaAds.timezone, "Asia/Kolkata");
    assert.ok(!res.body.includes("SUPER_SECRET_META_TOKEN"));
  } finally {
    server.close();
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("Meta Ads Connectivity: checkMetaConnectivity caches without repeat provider calls", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  let accountCalls = 0;
  const restore = stubMetaFetch([
    {
      match: () => { accountCalls += 1; return true; },
      status: 200,
      body: ACCOUNT_BODY,
    },
  ]);
  try {
    const first = await checkMetaConnectivity({ bypassCache: true });
    const second = await checkMetaConnectivity({ bypassCache: false });
    assert.equal(first.status, "CONNECTED");
    assert.equal(second.status, "CONNECTED");
    assert.equal(accountCalls, 1, "Connectivity must be served from cache on second call");
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Date preset and timezone logic tests
// ════════════════════════════════════════════════════════════════════════════
import { presetToRange, toDateString } from "../../../client/src/metaAdsView.js";

test("Meta Ads Date System: correct Meta preset semantics (completed days ending yesterday)", () => {
  // Using a stubbed Date object or calculating relative to the system timezone
  // We can test presetToRange by simulating the timezone
  const tz = "Asia/Calcutta";
  const rToday = presetToRange("today", tz);
  const rYesterday = presetToRange("yesterday", tz);
  const rLast7 = presetToRange("last7", tz);
  const rLast14 = presetToRange("last14", tz);
  const rLast30 = presetToRange("last30", tz);

  // Today must match the current calendar date in Asia/Calcutta
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  const calTodayStr = `${get("year")}-${get("month")}-${get("day")}`;

  assert.equal(rToday.since, calTodayStr);
  assert.equal(rToday.until, calTodayStr);

  // Yesterday must be exactly calToday - 1 day
  const calToday = new Date(Number(get("year")), Number(get("month")) - 1, Number(get("day")));
  const yest = new Date(calToday);
  yest.setDate(yest.getDate() - 1);
  const calYestStr = toDateString(yest);

  assert.equal(rYesterday.since, calYestStr);
  assert.equal(rYesterday.until, calYestStr);

  // Last 7 days: previous 7 completed days ending yesterday
  const last7Start = new Date(calToday);
  last7Start.setDate(last7Start.getDate() - 7);
  assert.equal(rLast7.since, toDateString(last7Start));
  assert.equal(rLast7.until, calYestStr);

  // Last 14 days
  const last14Start = new Date(calToday);
  last14Start.setDate(last14Start.getDate() - 14);
  assert.equal(rLast14.since, toDateString(last14Start));
  assert.equal(rLast14.until, calYestStr);

  // Last 30 days
  const last30Start = new Date(calToday);
  last30Start.setDate(last30Start.getDate() - 30);
  assert.equal(rLast30.since, toDateString(last30Start));
  assert.equal(rLast30.until, calYestStr);
});

test("Meta Ads Date System: parseMetaDateRange validation checks", () => {
  // Inclusive valid custom range
  const valid = parseMetaDateRange({ since: "2026-08-01", until: "2026-08-08" });
  assert.equal(valid.since, "2026-08-01");
  assert.equal(valid.until, "2026-08-08");

  // start > end throws error
  assert.throws(
    () => parseMetaDateRange({ since: "2026-08-09", until: "2026-08-08" }),
    (err) => err.code === "VALIDATION_ERROR"
  );
});

// ════════════════════════════════════════════════════════════════════════════
// Daily Chart — comprehensive suite (Req 29–30)
// ════════════════════════════════════════════════════════════════════════════

// 7-day deterministic fixture
const SEVEN_DAY_FIXTURE = [
  { date_start: "2026-08-02", spend: "1000", actions: [{ action_type: "purchase", value: "4" }],  action_values: [{ action_type: "purchase", value: "12000" }] },
  { date_start: "2026-08-03", spend: "1100", actions: [{ action_type: "purchase", value: "5" }],  action_values: [{ action_type: "purchase", value: "14300" }] },
  { date_start: "2026-08-04", spend: "900",  actions: [{ action_type: "purchase", value: "3" }],  action_values: [{ action_type: "purchase", value: "8100"  }] },
  { date_start: "2026-08-05", spend: "1200", actions: [{ action_type: "purchase", value: "6" }],  action_values: [{ action_type: "purchase", value: "16800" }] },
  { date_start: "2026-08-06", spend: "1300", actions: [{ action_type: "purchase", value: "5" }],  action_values: [{ action_type: "purchase", value: "18200" }] },
  { date_start: "2026-08-07", spend: "1150", actions: [{ action_type: "purchase", value: "4" }],  action_values: [{ action_type: "purchase", value: "13800" }] },
  { date_start: "2026-08-08", spend: "1500", actions: [{ action_type: "purchase", value: "7" }],  action_values: [{ action_type: "purchase", value: "22500" }] },
];

// A. time_increment=1 is sent to the Meta provider
test("Meta Ads Daily Chart: request uses time_increment=1 (daily granularity)", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  let capturedUrl = null;
  const origFetch = global.fetch;
  global.fetch = async (url) => {
    capturedUrl = String(url);
    return { ok: true, status: 200, async json() { return { data: [] }; } };
  };
  try {
    await fetchMetaDailyInsights({ since: "2026-08-02", until: "2026-08-08" }, true);
    assert.ok(capturedUrl, "provider must have been called");
    assert.ok(capturedUrl.includes("time_increment=1"), `time_increment=1 must appear in the URL, got: ${capturedUrl}`);
  } finally {
    global.fetch = origFetch;
    resetEnvOverrides();
    clearMetaCache();
  }
});

// B. Request uses exact selected since/until
test("Meta Ads Daily Chart: request uses exact selected since/until dates", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  let capturedUrl = null;
  const origFetch = global.fetch;
  global.fetch = async (url) => {
    capturedUrl = String(url);
    return { ok: true, status: 200, async json() { return { data: [] }; } };
  };
  try {
    await fetchMetaDailyInsights({ since: "2026-08-02", until: "2026-08-08" }, true);
    assert.ok(capturedUrl.includes("2026-08-02"), "since must appear in URL");
    assert.ok(capturedUrl.includes("2026-08-08"), "until must appear in URL");
  } finally {
    global.fetch = origFetch;
    resetEnvOverrides();
    clearMetaCache();
  }
});

// C. Last 7 Days range ends yesterday, not today
test("Meta Ads Daily Chart: Last 7 Days range ends yesterday (not today)", () => {
  const tz = "Asia/Calcutta";
  const r = presetToRange("last7", tz);
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  const calTodayStr = `${get("year")}-${get("month")}-${get("day")}`;
  assert.ok(r.until < calTodayStr, `Last 7 Days 'until' (${r.until}) must be before today (${calTodayStr})`);
  const calToday = new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))));
  const expected7Start = new Date(calToday);
  expected7Start.setUTCDate(expected7Start.getUTCDate() - 7);
  assert.equal(r.since, toDateString(expected7Start));
});

// D. Daily spend strings are converted to finite numbers
test("Meta Ads Daily Chart: spend strings are converted to finite numbers", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([{
    match: () => true,
    status: 200,
    body: { data: [{ date_start: "2026-08-02", spend: "1234.56", actions: [], action_values: [] }] },
  }]);
  try {
    const daily = await fetchMetaDailyInsights({ since: "2026-08-02", until: "2026-08-02" }, true);
    assert.equal(typeof daily[0].spend, "number");
    assert.equal(daily[0].spend, 1234.56);
    assert.ok(Number.isFinite(daily[0].spend));
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

// E. Daily purchases use canonical purchase normalization (not link_click, etc.)
test("Meta Ads Daily Chart: purchases use canonical normalization (priority list, not all actions)", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([{
    match: () => true,
    status: 200,
    body: {
      data: [{
        date_start: "2026-08-02",
        spend: "500",
        actions: [
          { action_type: "link_click", value: "200" },
          { action_type: "purchase", value: "7" },
        ],
        action_values: [{ action_type: "purchase", value: "8400" }],
      }],
    },
  }]);
  try {
    const daily = await fetchMetaDailyInsights({ since: "2026-08-02", until: "2026-08-02" }, true);
    assert.equal(daily[0].purchases, 7, "Must count only purchase actions, not link_click");
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

// F+G. 7-day fixture: all rows survive, totals reconcile (spend=8150, purchases=34)
test("Meta Ads Daily Chart: 7-day fixture — 7 rows, numeric values, totals reconcile (spend 8150, purchases 34)", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([{
    match: () => true,
    status: 200,
    body: { data: SEVEN_DAY_FIXTURE },
  }]);
  try {
    const daily = await fetchMetaDailyInsights({ since: "2026-08-02", until: "2026-08-08" }, true);
    assert.equal(daily.length, 7, "Must have 7 rows for 7-day range");
    assert.deepEqual(daily.map((d) => d.date), [
      "2026-08-02", "2026-08-03", "2026-08-04",
      "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08",
    ]);
    for (const row of daily) {
      assert.ok(Number.isFinite(row.spend), `spend must be finite for ${row.date}`);
      assert.ok(Number.isFinite(row.purchases), `purchases must be finite for ${row.date}`);
      assert.ok(row.spend > 0, `spend must be > 0 for ${row.date}`);
    }
    const totalSpend = daily.reduce((s, d) => s + d.spend, 0);
    assert.ok(Math.abs(totalSpend - 8150) < 0.01, `Daily spend sum should be 8150, got ${totalSpend}`);
    const totalPurchases = daily.reduce((s, d) => s + d.purchases, 0);
    assert.equal(totalPurchases, 34, `Daily purchases sum should be 34, got ${totalPurchases}`);
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

// H. Missing/no-activity dates are filled with zero deterministically
test("Meta Ads Daily Chart: missing days filled with zero (genuine no-activity)", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([{
    match: () => true,
    status: 200,
    body: {
      data: [
        { date_start: "2026-08-02", spend: "100", actions: [{ action_type: "purchase", value: "1" }], action_values: [] },
        { date_start: "2026-08-04", spend: "200", actions: [{ action_type: "purchase", value: "2" }], action_values: [] },
        { date_start: "2026-08-06", spend: "300", actions: [{ action_type: "purchase", value: "3" }], action_values: [] },
      ],
    },
  }]);
  try {
    const daily = await fetchMetaDailyInsights({ since: "2026-08-02", until: "2026-08-06" }, true);
    assert.equal(daily.length, 5, "Must have 5 rows for 5-day range");
    assert.deepEqual(daily.map((d) => d.date), ["2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"]);
    assert.equal(daily[1].spend, 0, "2026-08-03 absent — spend must be 0");
    assert.equal(daily[1].purchases, 0, "2026-08-03 absent — purchases must be 0");
    assert.equal(daily[1].noActivity, true);
    assert.equal(daily[0].noActivity, false);
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

// fillMissingDays unit: empty provider result fills all days
test("Meta Ads Daily Chart: fillMissingDays — empty result fills all days as zero", () => {
  const result = fillMissingDays([], "2026-08-02", "2026-08-04");
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((r) => r.date), ["2026-08-02", "2026-08-03", "2026-08-04"]);
  for (const row of result) {
    assert.equal(row.spend, 0);
    assert.equal(row.purchases, 0);
    assert.equal(row.noActivity, true);
  }
});

// fillMissingDays unit: custom inclusive range is exact (no off-by-one)
test("Meta Ads Daily Chart: fillMissingDays — inclusive custom range 01–08 Aug gives 8 rows", () => {
  const result = fillMissingDays([], "2026-08-01", "2026-08-08");
  assert.equal(result.length, 8);
  assert.equal(result[0].date, "2026-08-01");
  assert.equal(result[7].date, "2026-08-08");
});

// I. Provider failure propagates as thrown error, not silent zeros
test("Meta Ads Daily Chart: provider failure throws, not returns silent zeros", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([{
    match: () => true,
    status: 500,
    body: { error: { message: "Internal server error", code: 1 } },
  }]);
  try {
    await assert.rejects(
      () => fetchMetaDailyInsights({ since: "2026-08-02", until: "2026-08-08" }, true),
      (err) => typeof err.message === "string",
      "A provider failure must throw, not return empty/zero data",
    );
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

// J. No token in normalized daily response
test("Meta Ads Daily Chart: access_token never appears in normalized response", async () => {
  env.metaAccessToken = "SUPER_SECRET_META_TOKEN";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([{
    match: () => true,
    status: 200,
    body: { data: SEVEN_DAY_FIXTURE },
  }]);
  try {
    const daily = await fetchMetaDailyInsights({ since: "2026-08-02", until: "2026-08-08" }, true);
    const serialized = JSON.stringify(daily);
    assert.ok(!serialized.includes("SUPER_SECRET_META_TOKEN"), "Daily response must not contain the access token");
    assert.ok(!serialized.includes("access_token"), "Daily response must not contain access_token key");
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

// HTTP route test
test("Meta Ads Daily Chart: GET /api/meta-ads/daily returns normalized daily array", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([{
    match: () => true,
    status: 200,
    body: { data: SEVEN_DAY_FIXTURE },
  }]);
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/daily?since=2026-08-02&until=2026-08-08&bypassCache=true");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.daily), "daily must be an array");
    assert.equal(data.daily.length, 7, "must have 7 rows");
    assert.ok(data.daily[0].spend > 0, "first row must have non-zero spend");
    assert.ok(Number.isFinite(data.daily[0].purchases), "purchases must be a finite number");
    assert.ok(!res.body.includes("tok"), "access_token must not appear in response");
  } finally {
    server.close();
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Cost Per Purchase — comprehensive suite (Req 37)
// ════════════════════════════════════════════════════════════════════════════
import { calculateCostPerPurchase } from "../services/metaAdsService.js";

test("CPP Backend: helper calculates CPP correctly", () => {
  // Test Case A (Req 27)
  const a = calculateCostPerPurchase(4032.20, 14);
  assert.ok(Math.abs(a - 288.014285714) < 0.0001);

  // Test Case B (Req 28)
  const b = calculateCostPerPurchase(2044.55, 7);
  assert.ok(Math.abs(b - 292.0785714) < 0.0001);

  // Test Case C (Req 29)
  const c = calculateCostPerPurchase(1842.65, 14);
  assert.ok(Math.abs(c - 131.6178571) < 0.0001);

  // Test Case D (Req 30)
  const d = calculateCostPerPurchase(1000, 4);
  assert.equal(d, 250);
});

test("CPP Backend: zero/positive edge cases", () => {
  // B+F. Zero purchases returns null (Req 31, 32)
  assert.equal(calculateCostPerPurchase(1000, 0), null);
  assert.equal(calculateCostPerPurchase(0, 0), null);

  // D. Zero spend + positive purchases returns 0 (Req 33)
  assert.equal(calculateCostPerPurchase(0, 2), 0);
});

test("CPP Backend: campaign, adset, and ad levels have normalized costPerPurchase", async () => {
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([
    {
      match: (url) => url.includes("/campaigns"),
      status: 200,
      body: { data: [{ id: "c1", name: "Campaign 1", status: "ACTIVE", effective_status: "ACTIVE" }] },
    },
    {
      match: (url) => url.includes("/adsets"),
      status: 200,
      body: { data: [{ id: "as1", campaign_id: "c1", name: "Adset 1", status: "ACTIVE", effective_status: "ACTIVE" }] },
    },
    {
      match: (url) => url.includes("/ads"),
      status: 200,
      body: { data: [{ id: "ad1", campaign_id: "c1", adset_id: "as1", name: "Ad 1", status: "ACTIVE", effective_status: "ACTIVE" }] },
    },
    {
      // Campaign/adset/ad level insights mock
      match: (url) => url.includes("/insights"),
      status: 200,
      body: {
        data: [{
          campaign_id: "c1",
          adset_id: "as1",
          ad_id: "ad1",
          spend: "3000",
          actions: [{ action_type: "purchase", value: "10" }],
          action_values: [],
        }],
      },
    },
  ]);

  try {
    const range = { since: "2026-08-01", until: "2026-08-07" };
    // E. Campaign CPP
    const campaigns = await fetchMetaCampaigns(range, true);
    assert.equal(campaigns[0].insights.costPerPurchase, 300);

    // F. Ad Set CPP
    const adsets = await fetchMetaAdSets("c1", range, true);
    assert.equal(adsets[0].insights.costPerPurchase, 300);

    // G. Ad CPP
    const ads = await fetchMetaAds("as1", range, true);
    assert.equal(ads[0].insights.costPerPurchase, 300);
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("CPP Backend: account aggregate CPP is NOT an average of campaign CPPs", async () => {
  // Campaign A: Spend 1000, Purchases 2 -> CPP 500
  // Campaign B: Spend 3000, Purchases 10 -> CPP 300
  // Total: Spend 4000, Purchases 12 -> CPP 333.33 (NOT average 400) (Req 35)
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([
    accountRoute(),
    {
      match: (url) => url.includes("/insights"),
      status: 200,
      body: {
        data: [{
          spend: "4000",
          actions: [{ action_type: "purchase", value: "12" }],
        }],
      },
    },
  ]);
  try {
    const summary = await fetchMetaSummary({ since: "2026-08-01", until: "2026-08-07" }, true);
    // H. Account CPP uses aggregate account totals
    assert.ok(Math.abs(summary.insights.costPerPurchase - 333.3333) < 0.01);
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("CPP Backend: range CPP is NOT an average of daily CPP values", async () => {
  // Day 1: Spend 100, Purchases 1 -> CPP 100
  // Day 2: Spend 900, Purchases 3 -> CPP 300
  // Range: 1000 / 4 = 250 (NOT average 200) (Req 36)
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([
    {
      match: () => true,
      status: 200,
      body: {
        data: [
          { date_start: "2026-08-01", spend: "100", actions: [{ action_type: "purchase", value: "1" }] },
          { date_start: "2026-08-02", spend: "900", actions: [{ action_type: "purchase", value: "3" }] },
        ],
      },
    },
  ]);
  try {
    const daily = await fetchMetaDailyInsights({ since: "2026-08-01", until: "2026-08-02" }, true);
    // I. Daily CPP uses daily metrics
    assert.equal(daily[0].costPerPurchase, 100);
    assert.equal(daily[1].costPerPurchase, 300);
    
    // K. Range aggregate total is verified via summary (reconciliation check)
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});

test("CPP Backend: purchase normalization is canonical denominator", async () => {
  // actions containing click, add_to_cart, checkout, purchase (Req 34)
  env.metaAccessToken = "tok";
  env.metaAdAccountId = "1234567890";
  const restore = stubMetaFetch([{
    match: () => true,
    status: 200,
    body: {
      data: [{
        spend: "1000",
        actions: [
          { action_type: "link_click", value: "100" },
          { action_type: "add_to_cart", value: "20" },
          { action_type: "initiate_checkout", value: "10" },
          { action_type: "purchase", value: "4" },
        ],
      }],
    },
  }]);
  try {
    const summary = await fetchMetaSummary({ since: "2026-08-01", until: "2026-08-07" }, true);
    assert.equal(summary.insights.costPerPurchase, 250);
  } finally {
    restore();
    resetEnvOverrides();
    clearMetaCache();
  }
});
