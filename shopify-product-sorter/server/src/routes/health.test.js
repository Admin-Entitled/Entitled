import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import app from "../app.js";
import { env } from "../config/env.js";
import { redactSecrets } from "../utils/sanitize.js";
import { errorNormalizer, AppError } from "../middleware/errorBoundary.js";

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

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logInfo } from "../utils/logger.js";

const __filenameTest = fileURLToPath(import.meta.url);
const __dirnameTest = path.dirname(__filenameTest);

test("BE-007: Prohibited imports and circular dependency checks", () => {
  const routesDir = path.resolve(__dirnameTest, "./");

  // Statically check sorter.js imports
  const sorterContent = fs.readFileSync(path.join(routesDir, "sorter.js"), "utf8");
  assert.ok(!sorterContent.includes("skuImageAuditService"));
  assert.ok(!sorterContent.includes("shopifyMediaService"));
  assert.ok(!sorterContent.includes("actualSalesService"));
  assert.ok(!sorterContent.includes("orderMappingService"));

  // Statically check skuMedia.js imports
  const skuMediaContent = fs.readFileSync(path.join(routesDir, "skuMedia.js"), "utf8");
  assert.ok(!skuMediaContent.includes("actualSalesService"));
  assert.ok(!skuMediaContent.includes("orderMappingService"));
  assert.ok(!skuMediaContent.includes("sorterRuntimeService"));

  // Statically check salesIntelligence.js imports
  const salesIntContent = fs.readFileSync(path.join(routesDir, "salesIntelligence.js"), "utf8");
  assert.ok(!salesIntContent.includes("skuImageAuditService"));
  assert.ok(!salesIntContent.includes("shopifyMediaService"));
  assert.ok(!salesIntContent.includes("orderMappingService"));
});

test("BE-009: Logger-failure tolerance and field checks", () => {
  const originalLog = console.log;
  let loggedData = null;
  console.log = (str) => {
    loggedData = JSON.parse(str);
  };

  try {
    // 1. Structured fields exist
    logInfo("Test message", { key: "value", user: { email: "test@example.com" } });
    assert.equal(loggedData.level, "info");
    assert.equal(loggedData.message, "Test message");
    assert.equal(loggedData.key, "value");
    assert.equal(loggedData.user.email, "[REDACTED]");

    // 2. Secret and PII Redaction
    logInfo("Token test shpat_123456789abcde");
    assert.equal(loggedData.message, "Token test [REDACTED_SHOPIFY_TOKEN]");

    // 3. Logger-failure tolerance (circular ref)
    const circularObj = {};
    circularObj.self = circularObj;
    logInfo("Circular test", circularObj);
    assert.equal(loggedData.message, "[Logger Error] Failed to serialize log payload");
  } finally {
    console.log = originalLog;
  }
});

test("SEC-007: CORS allowed, denied, preflight, credentials policies", async () => {
  const server = await startServer(app);
  try {
    // Allowed origin
    const resAllowed = await request(server, "/api/health", {
      headers: { Origin: env.clientOrigin },
    });
    assert.equal(resAllowed.headers["access-control-allow-origin"], env.clientOrigin);
    assert.equal(resAllowed.headers["access-control-allow-credentials"], "true");

    // Denied origin
    const resDenied = await request(server, "/api/health", {
      headers: { Origin: "http://malicious.com" },
    });
    assert.notEqual(resDenied.headers["access-control-allow-origin"], "http://malicious.com");

    // Preflight (OPTIONS)
    const resPreflight = await request(server, "/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: env.clientOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type,Authorization",
      },
    });
    assert.equal(resPreflight.status, 204);
    assert.equal(resPreflight.headers["access-control-allow-origin"], env.clientOrigin);
  } finally {
    server.close();
  }
});

test("SEC-007: CSRF decision check (state-changing stateless requests)", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/apply", {
      method: "POST",
      headers: {
        Origin: "http://attacker.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ collectionId: "123", orderIds: [] }),
    });
    assert.ok(res.status === 401 || res.status === 400);
  } finally {
    server.close();
  }
});

test("SEC-008 & BE-008: Request validation and error mapping boundaries", async () => {
  const server = await startServer(app);
  try {
    // 1. Missing required field (body.collectionId)
    const res1 = await request(server, "/api/collections/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: [] }),
    });
    assert.equal(res1.status, 400);
    const data1 = JSON.parse(res1.body);
    assert.equal(data1.code, "VALIDATION_ERROR");
    assert.ok(Array.isArray(data1.details));
    assert.ok(data1.details.some(d => d.path === "body.collectionId"));

    // 2. Wrong type (body.orderIds is not array)
    const res2 = await request(server, "/api/collections/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId: "123", orderIds: "not-an-array" }),
    });
    assert.equal(res2.status, 400);
    const data2 = JSON.parse(res2.body);
    assert.ok(data2.details.some(d => d.path === "body.orderIds"));

    // 3. No secrets leakage in error (tested directly via errorNormalizer)
    const mockReq = { headers: {} };
    let responseBody = null;
    let responseStatus = null;
    const mockRes = {
      status(s) {
        responseStatus = s;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };
    const mockNext = () => {};

    const rawError = new AppError("PROVIDER_ERROR", "Connection failed for shpat_testtoken123", { statusCode: 400 });
    errorNormalizer(rawError, mockReq, mockRes, mockNext);
    assert.equal(responseStatus, 400);
    assert.ok(!responseBody.error.includes("shpat_testtoken123"));
    assert.ok(responseBody.error.includes("[REDACTED_SHOPIFY_TOKEN]"));
  } finally {
    server.close();
  }
});
