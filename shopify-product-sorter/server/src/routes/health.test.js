import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import app from "../app.js";
import { env } from "../config/env.js";
import { redactSecrets } from "../utils/sanitize.js";

function startServer(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

function request(server, pathOptions, options = {}) {
  const address = server.address();
  const url = new URL(typeof pathOptions === "string" ? pathOptions : pathOptions.path, "http://127.0.0.1:" + address.port);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: options.method || "GET", headers: options.headers || {} }, (res) => {
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

test("redactSecrets utility masks tokens and sensitive strings", () => {
  const sampleError = "Failed to connect shpat_mock_access_token_12345 with Bearer secret-token-xyz";
  const sanitized = redactSecrets(sampleError);
  assert.ok(!sanitized.includes("shpat_mock_access_token_12345"));
  assert.ok(sanitized.includes("[REDACTED_SHOPIFY_TOKEN]"));
});

test("GET /api/health and GET /api/health/liveness return ok without requiring Shopify credentials", async () => {
  const origToken = env.shopifyAdminAccessToken;
  env.shopifyAdminAccessToken = "";

  const server = await startServer(app);
  try {
    const res1 = await request(server, "/api/health");
    assert.equal(res1.status, 200);
    const data1 = JSON.parse(res1.body);
    assert.equal(data1.ok, true);
    assert.equal(data1.status, "ok");
    assert.ok(data1.timestamp);

    const res2 = await request(server, "/api/health/liveness");
    assert.equal(res2.status, 200);
    const data2 = JSON.parse(res2.body);
    assert.equal(data2.ok, true);
    assert.equal(data2.status, "ok");
  } finally {
    env.shopifyAdminAccessToken = origToken;
    server.close();
  }
});

test("GET /api/health/readiness reports DB and configuration state safely", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/health/readiness");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.ok, true);
    assert.equal(data.status, "ready");
    assert.equal(data.db, "connected");
    assert.ok(data.config);
    assert.equal(typeof data.config.shopifyConfigured, "boolean");
    assert.equal(typeof data.config.shiprocketConfigured, "boolean");
    assert.equal(typeof data.config.sqlitePathConfigured, "boolean");
  } finally {
    server.close();
  }
});

test("GET /api/debug/shopify, GET /api/debug/shiprocket, and GET /api/health/diagnostics do not leak secrets", async () => {
  const server = await startServer(app);
  try {
    const resShopify = await request(server, "/api/debug/shopify");
    assert.equal(resShopify.status, 200);
    const dataShopify = JSON.parse(resShopify.body);
    assert.match(dataShopify.status, /^(ok|not_configured|provider_error)$/);
    assert.ok(dataShopify.authStatus);
    assert.equal(typeof dataShopify.tokenAcquired, "boolean");
    if (dataShopify.lastShopifyError) {
      assert.ok(!dataShopify.lastShopifyError.includes("shpat_"));
    }

    const resShiprocket = await request(server, "/api/debug/shiprocket");
    assert.equal(resShiprocket.status, 200);
    const dataShiprocket = JSON.parse(resShiprocket.body);
    assert.match(dataShiprocket.status, /^(configured|not_configured)$/);
    assert.equal(typeof dataShiprocket.configured, "boolean");
    assert.equal(typeof dataShiprocket.tokenPresent, "boolean");
    assert.ok(!JSON.stringify(dataShiprocket).includes("password"));

    const resDiag = await request(server, "/api/health/diagnostics");
    assert.equal(resDiag.status, 200);
    const dataDiag = JSON.parse(resDiag.body);
    assert.match(dataDiag.status, /^(ok|degraded)$/);
    assert.deepEqual(dataDiag.application, { status: "ok", liveness: "ok" });
    assert.match(dataDiag.shopify.status, /^(ok|not_configured|provider_error)$/);
    assert.match(dataDiag.shiprocket.status, /^(configured|not_configured)$/);
    assert.ok(dataDiag.shopify);
    assert.ok(dataDiag.shiprocket);
    assert.ok(Buffer.byteLength(resDiag.body) < 8192);
  } finally {
    server.close();
  }
});
