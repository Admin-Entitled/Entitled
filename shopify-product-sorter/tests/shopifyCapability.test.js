import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import app from "../server/src/app.js";
import { env, getShopifyCapability, resetEnvOverrides } from "../server/src/config/env.js";
import { shopifyCapabilityGuard, shopifyUnavailablePayload } from "../server/src/middleware/shopifyCapability.js";
// The repo may have a local (gitignored) .env with real Shopify credentials.
// Capability tests must be hermetic: temporarily hide Shopify env vars so the
// "unconfigured" contract is deterministic regardless of the ambient shell.
const SHOPIFY_ENV_KEYS = [
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_ADMIN_ACCESS_TOKEN",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
];

async function withUnconfiguredShopify(fn) {
  const saved = {};
  for (const key of SHOPIFY_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetEnvOverrides();
  try {
    await fn();
  } finally {
    for (const key of SHOPIFY_ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    resetEnvOverrides();
  }
}



// ─────────────────────────────────────────────────────────────────────────────
// Capability contract (synthetic values only; zero live Shopify calls)
// ─────────────────────────────────────────────────────────────────────────────

test("getShopifyCapability: reports unavailable when SHOPIFY_STORE_DOMAIN is missing", async () => {
  await withUnconfiguredShopify(() => {
    const cap = getShopifyCapability({ SHOPIFY_STORE_DOMAIN: "" });
    assert.equal(cap.available, false);
    assert.equal(cap.status, "unavailable");
    assert.equal(cap.reasonCategory, "configuration_missing");
    assert.equal(cap.authMode, null);
    assert.ok(cap.missingVariables.includes("SHOPIFY_STORE_DOMAIN"));
  });
});

test("getShopifyCapability: no configuration lists every required variable name", async () => {
  await withUnconfiguredShopify(() => {
    const cap = getShopifyCapability({ SHOPIFY_STORE_DOMAIN: "test.myshopify.com" });
    assert.equal(cap.available, false);
    assert.deepEqual(cap.missingVariables.sort(), [
      "SHOPIFY_ADMIN_ACCESS_TOKEN",
      "SHOPIFY_CLIENT_ID",
      "SHOPIFY_CLIENT_SECRET",
    ].sort());
  });
});

test("getShopifyCapability: accepts static admin access token mode", () => {
  const cap = getShopifyCapability({
    SHOPIFY_STORE_DOMAIN: "test.myshopify.com",
    SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat_mock_token_12345",
  });
  assert.equal(cap.available, true);
  assert.equal(cap.status, "available");
  assert.equal(cap.authMode, "static_access_token");
  assert.deepEqual(cap.missingVariables, []);
});

test("getShopifyCapability: accepts client credentials mode", () => {
  const cap = getShopifyCapability({
    SHOPIFY_STORE_DOMAIN: "test.myshopify.com",
    SHOPIFY_CLIENT_ID: "client_id_123",
    SHOPIFY_CLIENT_SECRET: "client_secret_456",
  });
  assert.equal(cap.available, true);
  assert.equal(cap.status, "available");
  assert.equal(cap.authMode, "client_credentials");
  assert.deepEqual(cap.missingVariables, []);
});

test("getShopifyCapability: never requires client credentials when a static token exists", () => {
  const cap = getShopifyCapability({
    SHOPIFY_STORE_DOMAIN: "test.myshopify.com",
    SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat_mock_token_12345",
  });
  assert.equal(cap.available, true);
  assert.equal(cap.authMode, "static_access_token");
  assert.ok(!cap.missingVariables.includes("SHOPIFY_CLIENT_ID"));
});

test("getShopifyCapability: reports missing variable names when credentials are partial", async () => {
  await withUnconfiguredShopify(() => {
    const cap = getShopifyCapability({
      SHOPIFY_STORE_DOMAIN: "test.myshopify.com",
      SHOPIFY_CLIENT_ID: "client_id_123",
    });
    assert.equal(cap.available, false);
    assert.equal(cap.reasonCategory, "configuration_missing");
    assert.ok(cap.missingVariables.includes("SHOPIFY_CLIENT_SECRET"));
    assert.ok(cap.missingVariables.includes("SHOPIFY_ADMIN_ACCESS_TOKEN"));
  });
});

test("getShopifyCapability: never exposes secret values, only variable names", () => {
  const cap = getShopifyCapability({
    SHOPIFY_STORE_DOMAIN: "test.myshopify.com",
  });
  const serialized = JSON.stringify(cap);
  assert.ok(!serialized.includes("shpat_"));
  assert.ok(!serialized.includes("shpca_"));
  assert.ok(!serialized.includes("test.myshopify.com"), "store domain value must not be exposed");
  assert.ok(cap.missingVariables.every((name) => typeof name === "string" && name.startsWith("SHOPIFY_")));
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared guard middleware
// ─────────────────────────────────────────────────────────────────────────────

test("shopifyCapabilityGuard: returns 503 SHOPIFY_UNAVAILABLE when unconfigured and skips next", async () => {
  await withUnconfiguredShopify(() => {
  resetEnvOverrides();
  let statusCode = null;
  let body = null;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  shopifyCapabilityGuard({ headers: {} }, res, () => {
    nextCalled = true;
  });
  assert.equal(statusCode, 503);
  assert.equal(body.success, false);
  assert.equal(body.code, "SHOPIFY_UNAVAILABLE");
  assert.equal(body.message, "Shopify is not configured for this environment.");
  assert.equal(body.category, "configuration_missing");
  assert.ok(Array.isArray(body.missingVariables));
  assert.ok(body.correlationId);
  assert.equal(nextCalled, false);
  });
});

test("shopifyCapabilityGuard: passes through when Shopify is configured", () => {
  try {
    env.shopifyStoreDomain = "test.myshopify.com";
    env.shopifyAdminAccessToken = "shpat_synthetic_test_token_123";
    let nextCalled = false;
    const res = {
      status() {
        return this;
      },
      json() {
        return this;
      },
    };
    shopifyCapabilityGuard({ headers: {} }, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  } finally {
    resetEnvOverrides();
  }
});

test("shopifyUnavailablePayload: carries caller correlation id when provided", () => {
  const payload = shopifyUnavailablePayload(getShopifyCapability({ SHOPIFY_STORE_DOMAIN: "" }), {
    headers: { "x-correlation-id": "corr-abc-123" },
  });
  assert.equal(payload.correlationId, "corr-abc-123");
});

// ─────────────────────────────────────────────────────────────────────────────
// Readiness contract (no live Shopify call)
// ─────────────────────────────────────────────────────────────────────────────

function startServer(appInstance) {
  return new Promise((resolve, reject) => {
    const server = appInstance.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

function request(server, path, options = {}) {
  const address = server.address();
  const url = new URL(path, "http://127.0.0.1:" + address.port);
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

async function withStubbedFetch(fetchImpl, fn) {
  const original = global.fetch;
  global.fetch = fetchImpl;
  try {
    await fn();
  } finally {
    global.fetch = original;
  }
}

test("GET /api/health/readiness: reports Shopify capability and performs no live Shopify call", async () => {
  await withUnconfiguredShopify(async () => {
    let fetchCalls = 0;
    const server = await startServer(app);
    try {
      await withStubbedFetch(async () => {
      fetchCalls += 1;
      throw new Error("live network must not be used");
    }, async () => {
      const res = await request(server, "/api/health/readiness");
      assert.equal(res.status, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.shopify.available, false);
      assert.equal(data.shopify.status, "unavailable");
      assert.equal(data.shopify.reasonCategory, "configuration_missing");
      assert.equal(data.shopify.authMode, null);
      assert.ok(data.shopify.missingVariables.includes("SHOPIFY_STORE_DOMAIN"));
      assert.ok(!JSON.stringify(data).includes("shpat_"));
    });
  } finally {
    server.close();
  }
      assert.equal(fetchCalls, 0, "readiness must not trigger any Shopify request");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Guarded routes return 503 SHOPIFY_UNAVAILABLE without touching Shopify
// ─────────────────────────────────────────────────────────────────────────────

test("Shopify-dependent routes return 503 SHOPIFY_UNAVAILABLE with zero Shopify calls", async () => {
  await withUnconfiguredShopify(async () => {
  let fetchCalls = 0;
  const server = await startServer(app);
  const routes = [
    { path: "/api/collections", method: "GET" },
    { path: "/api/collection-products?collectionId=collection-mock-1", method: "GET" },
    { path: "/api/debug/shopify", method: "GET" },
    { path: "/api/sku-images/search?sku=A1", method: "GET" },
    { path: "/api/sales-intelligence/summary", method: "GET" },
    { path: "/api/collections/sync", method: "POST", body: JSON.stringify({ collectionId: "collection-mock-1" }) },
    { path: "/api/collections/sync-all", method: "POST", body: JSON.stringify({}) },
    { path: "/api/collections/apply", method: "POST", body: JSON.stringify({ collectionId: "collection-mock-1", orderIds: ["product-1"] }) },
    { path: "/api/collections/reorder-all-v2", method: "POST", body: JSON.stringify({}) },
    { path: "/api/collections/rollback", method: "POST", body: JSON.stringify({ collectionId: "collection-mock-1" }) },
    { path: "/api/sales-intelligence/refresh-shopify", method: "POST", body: JSON.stringify({}) },
  ];
  try {
    await withStubbedFetch(async () => {
      fetchCalls += 1;
      throw new Error("live network must not be used while Shopify is unconfigured");
    }, async () => {
      for (const route of routes) {
        const res = await request(server, route.path, {
          method: route.method,
          headers: { "Content-Type": "application/json" },
          body: route.body,
        });
        assert.equal(res.status, 503, `${route.method} ${route.path} should return 503`);
        const data = JSON.parse(res.body);
        assert.equal(data.code, "SHOPIFY_UNAVAILABLE");
        assert.equal(data.success, false);
        assert.equal(data.category, "configuration_missing");
        assert.ok(Array.isArray(data.missingVariables));
        assert.ok(data.correlationId);
        assert.ok(!res.body.includes("shpat_"), `${route.path} must not leak tokens`);
      }
    });
  } finally {
    server.close();
  }
  assert.equal(fetchCalls, 0, "no Shopify request may fire while unconfigured");
  });
});

test("Shiprocket-only sales route remains reachable while Shopify is unconfigured", async () => {
  resetEnvOverrides();
  const server = await startServer(app);
  try {
    await withStubbedFetch(async () => ({
      ok: true,
      json: async () => ({ configured: false, orders: [] }),
      text: async () => "",
    }), async () => {
      const res = await request(server, "/api/sales-intelligence/refresh-shiprocket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // Shiprocket-only route must NOT be Shopify-gated: it may succeed or fail
      // on its own provider, but never with the Shopify capability error.
      assert.ok(res.status === 200 || res.status === 500);
      const data = JSON.parse(res.body);
      assert.notEqual(data.code, "SHOPIFY_UNAVAILABLE");
    });
  } finally {
    server.close();
  }
});

test("Validation still runs before the capability guard for body-validated routes", async () => {
  resetEnvOverrides();
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: [] }), // missing collectionId
    });
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.equal(data.code, "VALIDATION_ERROR");
  } finally {
    server.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Configured provider errors remain distinguishable
// ─────────────────────────────────────────────────────────────────────────────

test("Configured environment: provider failure surfaces as a real error, not SHOPIFY_UNAVAILABLE", async () => {
  try {
    env.shopifyStoreDomain = "test.myshopify.com";
    env.shopifyAdminAccessToken = "shpat_synthetic_test_token_123";
    assert.equal(getShopifyCapability().available, true);
    assert.equal(getShopifyCapability().authMode, "static_access_token");

    const server = await startServer(app);
    try {
      await withStubbedFetch(async () => {
        throw new Error("Shopify API HTTP 429: provider rate limit exceeded");
      }, async () => {
        const res = await request(server, "/api/collections");
        assert.equal(res.status, 500);
        const data = JSON.parse(res.body);
        assert.notEqual(data.code, "SHOPIFY_UNAVAILABLE");
        assert.ok(!res.body.includes("shpat_"), "provider error must not leak tokens");
      });
    } finally {
      server.close();
    }
  } finally {
    resetEnvOverrides();
  }
});
