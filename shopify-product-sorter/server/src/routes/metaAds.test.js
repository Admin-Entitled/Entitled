import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import app from "../app.js";
import { env, resetEnvOverrides } from "../config/env.js";
import {
  normalizeInsights,
  clearMetaCache,
} from "../services/metaAdsService.js";
import { listNetworkLogs } from "../services/sorterRuntimeService.js";

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

test("Meta Ads Unit: normalizeInsights parses spend, impressions, clicks, purchases, ROAS correctly", () => {
  const raw = {
    spend: "100.00",
    impressions: "1000",
    reach: "800",
    clicks: "50",
    date_start: "2026-08-01",
    date_stop: "2026-08-07",
    actions: [
      { action_type: "link_click", value: "50" },
      { action_type: "purchase", value: "2" }
    ],
    action_values: [
      { action_type: "purchase", value: "500.00" }
    ]
  };

  const insights = normalizeInsights(raw);
  assert.equal(insights.spend, 100);
  assert.equal(insights.impressions, 1000);
  assert.equal(insights.reach, 800);
  assert.equal(insights.clicks, 50);
  assert.equal(insights.ctr, 5.0); // 50 / 1000 * 100
  assert.equal(insights.cpc, 2.0); // 100 / 50
  assert.equal(insights.cpm, 100.0); // 100 / 1000 * 1000
  assert.equal(insights.purchases, 2);
  assert.equal(insights.purchaseValue, 500);
  assert.equal(insights.purchaseRoas, 5.0); // 500 / 100
  assert.equal(insights.dateStart, "2026-08-01");
  assert.equal(insights.dateStop, "2026-08-07");
});

test("Meta Ads Unit: normalizeInsights handles missing actions and values gracefully", () => {
  const raw = {
    spend: "0.00",
    impressions: "0",
    reach: "0",
    clicks: "0"
  };

  const insights = normalizeInsights(raw);
  assert.equal(insights.spend, 0);
  assert.equal(insights.impressions, 0);
  assert.equal(insights.reach, 0);
  assert.equal(insights.clicks, 0);
  assert.equal(insights.ctr, 0);
  assert.equal(insights.cpc, 0);
  assert.equal(insights.cpm, 0);
  assert.equal(insights.purchases, 0);
  assert.equal(insights.purchaseValue, 0);
  assert.equal(insights.purchaseRoas, 0);
});

test("Meta Ads Routes: GET /api/meta-ads/health returns NOT_CONFIGURED when env is empty", async () => {
  env.metaAccessToken = "";
  env.metaAdAccountId = "";

  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/health");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.status, "NOT_CONFIGURED");
    assert.equal(data.ok, false);
  } finally {
    server.close();
    resetEnvOverrides();
  }
});

test("Meta Ads Routes: GET /api/meta-ads/health returns CONNECTED under test mocks", async () => {
  // In test mode, checkMetaConnectivity returns mock success if not configured,
  // or we can test mock credentials
  env.metaAccessToken = "mock_token";
  env.metaAdAccountId = "mock_account_id";

  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/health");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.status, "CONNECTED");
    assert.equal(data.ok, true);
  } finally {
    server.close();
    resetEnvOverrides();
  }
});

test("Meta Ads Routes: Campaigns fetch works with date ranges and does not expose access token", async () => {
  env.metaAccessToken = "super_secret_access_token_123";
  env.metaAdAccountId = "mock_account_id";

  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/campaigns?since=2026-08-01&until=2026-08-07");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.campaigns));

    // Ensure access token is never in the HTTP response body
    assert.ok(!res.body.includes("super_secret_access_token_123"));

    // Ensure it's not leaked to Network Activity / logs
    const netLogs = listNetworkLogs({ limit: 10 });
    const logStr = JSON.stringify(netLogs);
    assert.ok(!logStr.includes("super_secret_access_token_123"), "Token leaked to network logs");
  } finally {
    server.close();
    resetEnvOverrides();
  }
});

test("Meta Ads Routes: AdSets and Ads fetch supports filtering", async () => {
  env.metaAccessToken = "some_token";
  env.metaAdAccountId = "mock_account_id";

  const server = await startServer(app);
  try {
    const resAdsets = await request(server, "/api/meta-ads/adsets?campaignId=mock_c_2");
    assert.equal(resAdsets.status, 200);
    const dataAdsets = JSON.parse(resAdsets.body);
    assert.ok(dataAdsets.adsets.every(a => a.campaignId === "mock_c_2"));

    const resAds = await request(server, "/api/meta-ads/ads?adsetId=mock_as_2");
    assert.equal(resAds.status, 200);
    const dataAds = JSON.parse(resAds.body);
    assert.ok(dataAds.ads.every(a => a.adsetId === "mock_as_2"));
  } finally {
    server.close();
    resetEnvOverrides();
  }
});

test("Meta Ads Routes: cache refresh POST route works", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/meta-ads/refresh", { method: "POST" });
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.success, true);
  } finally {
    server.close();
  }
});
