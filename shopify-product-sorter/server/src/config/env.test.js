import assert from "node:assert/strict";
import test from "node:test";
import { env, ensureShopifyEnv, envLoadReport } from "./env.js";

test("env loads defaults for unconfigured optional parameters", () => {
  assert.ok(typeof env.port === "number");
  assert.ok(typeof env.clientOrigin === "string");
  assert.equal(env.orderMappingSchema, process.env.ORDER_MAPPING_SCHEMA || "order_mapping");
  assert.equal(env.orderMappingRoute, "/order-mapping");
  assert.equal(env.shopifyApiVersion, process.env.SHOPIFY_API_VERSION || "2026-04");
});

test("envLoadReport exposes boolean flags for env file existence", () => {
  assert.equal(typeof envLoadReport.rootEnvExists, "boolean");
  assert.equal(typeof envLoadReport.serverEnvExists, "boolean");
});

test("ensureShopifyEnv validates required Shopify credentials when invoked", () => {
  const originalDomain = process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_STORE_DOMAIN;

  assert.throws(
    () => ensureShopifyEnv(),
    { message: /Missing required environment variable: SHOPIFY_STORE_DOMAIN/ },
  );

  if (originalDomain) {
    process.env.SHOPIFY_STORE_DOMAIN = originalDomain;
  }
});
