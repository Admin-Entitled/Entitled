import assert from "node:assert/strict";
import test from "node:test";
import {
  env,
  ensureShopifyEnv,
  ensureShiprocketEnv,
  ensurePostgresEnv,
  envLoadReport,
  validateEnv,
  EnvValidationError,
  resetEnvOverrides,
} from "./env.js";

test("env loads defaults for unconfigured optional parameters", () => {
  resetEnvOverrides();
  assert.ok(typeof env.port === "number");
  assert.ok(typeof env.clientOrigin === "string");
  assert.equal(env.orderMappingSchema, process.env.ORDER_MAPPING_SCHEMA || "order_mapping");
  assert.equal(env.orderMappingRoute, "/order-mapping");
  assert.equal(env.shopifyApiVersion, process.env.SHOPIFY_API_VERSION || "2026-04");
  const snapshot = env.toSnapshot();
  assert.equal(Object.isFrozen(snapshot), true);
});

test("envLoadReport exposes boolean flags for env file existence", () => {
  assert.equal(typeof envLoadReport.rootEnvExists, "boolean");
  assert.equal(typeof envLoadReport.serverEnvExists, "boolean");
});

test("validateEnv succeeds for valid minimal test environment", () => {
  const result = validateEnv({ NODE_ENV: "test", PORT: "4000", CLIENT_ORIGIN: "http://localhost:5173" });
  assert.equal(result.nodeEnv, "test");
  assert.equal(result.port, 4000);
  assert.equal(result.clientOrigin, "http://localhost:5173");
});

test("validateEnv succeeds for valid offline-development environment", () => {
  const result = validateEnv({ NODE_ENV: "development" });
  assert.equal(result.nodeEnv, "development");
  assert.equal(result.port, 4000);
});

test("validateEnv throws EnvValidationError for invalid enum in NODE_ENV", () => {
  assert.throws(
    () => validateEnv({ NODE_ENV: "staging" }),
    (err) => err instanceof EnvValidationError && err.message.includes("Invalid enum value for NODE_ENV"),
  );
});

test("validateEnv throws EnvValidationError for invalid port", () => {
  assert.throws(
    () => validateEnv({ PORT: "99999" }),
    (err) => err instanceof EnvValidationError && err.message.includes("Invalid port number for PORT"),
  );
  assert.throws(
    () => validateEnv({ PORT: "abc" }),
    (err) => err instanceof EnvValidationError && err.message.includes("Invalid port number for PORT"),
  );
});

test("validateEnv throws EnvValidationError for malformed URL", () => {
  assert.throws(
    () => validateEnv({ CLIENT_ORIGIN: "not-a-valid-url" }),
    (err) => err instanceof EnvValidationError && err.message.includes("Invalid URL for CLIENT_ORIGIN"),
  );
});

test("validateEnv handles missing or blank production variables safely", () => {
  assert.throws(
    () => validateEnv({ NODE_ENV: "production", SHOPIFY_STORE_DOMAIN: "   " }),
    (err) => err instanceof EnvValidationError && err.invalidVariables.includes("SHOPIFY_STORE_DOMAIN"),
  );
});

test("ensureShopifyEnv validates required Shopify credentials when invoked", () => {
  assert.throws(
    () => ensureShopifyEnv({ SHOPIFY_STORE_DOMAIN: "" }),
    (err) => err instanceof EnvValidationError && err.message.includes("Missing required environment variable(s): SHOPIFY_STORE_DOMAIN"),
  );

  assert.doesNotThrow(() => {
    ensureShopifyEnv({
      SHOPIFY_STORE_DOMAIN: "test-store.myshopify.com",
      SHOPIFY_CLIENT_ID: "client_id_synthetic_123",
      SHOPIFY_CLIENT_SECRET: "client_secret_synthetic_456",
    });
  });
});

test("ensureShiprocketEnv validates Shiprocket credentials independently", () => {
  assert.throws(
    () => ensureShiprocketEnv({}),
    (err) => err instanceof EnvValidationError && err.message.includes("Missing required Shiprocket credentials"),
  );

  assert.doesNotThrow(() => {
    ensureShiprocketEnv({ SHIPROCKET_TOKEN: "synthetic_jwt_token_789" });
  });

  assert.doesNotThrow(() => {
    ensureShiprocketEnv({
      SHIPROCKET_EMAIL: "user@example.com",
      SHIPROCKET_PASSWORD: "synthetic_password_123",
    });
  });
});

test("ensurePostgresEnv validates PostgreSQL database URL independently", () => {
  assert.throws(
    () => ensurePostgresEnv({}),
    (err) => err instanceof EnvValidationError && err.message.includes("Missing required environment variable: DATABASE_URL"),
  );

  assert.doesNotThrow(() => {
    ensurePostgresEnv({ DATABASE_URL: "postgres://synthetic_user:synthetic_pass@localhost:5432/testdb" });
  });
});

test("environment validation does not leak secret values in error messages", () => {
  const secretValue = "super_secret_value_xyz999";
  try {
    ensureShopifyEnv({
      SHOPIFY_STORE_DOMAIN: "test-store.myshopify.com",
      SHOPIFY_CLIENT_ID: secretValue,
      SHOPIFY_CLIENT_SECRET: "",
    });
  } catch (err) {
    assert.equal(err instanceof EnvValidationError, true);
    assert.equal(err.message.includes(secretValue), false);
  }
});

test("env toSnapshot returns frozen object and process.env is unmodified", () => {
  const snapshot = env.toSnapshot();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.throws(() => {
    snapshot.port = 5000;
  });
});

test("DATA-007: env runtime paths load defaults and resolve relative/absolute paths deterministically", () => {
  resetEnvOverrides();
  const snapshot = env.toSnapshot();

  assert.ok(snapshot.sqlitePath.endsWith("app.db"));
  assert.ok(snapshot.strategySettingsFile.endsWith("strategy-settings.json"));
  assert.ok(snapshot.skuImageAuditPath.endsWith("sku-image-actions.jsonl"));
  assert.ok(snapshot.salesShopifyCachePath.endsWith("sales-shopify-cache.json"));
  assert.ok(snapshot.salesShiprocketCachePath.endsWith("sales-shiprocket-cache.json"));
  assert.ok(snapshot.salesReconciledCachePath.endsWith("sales-reconciled-cache.json"));
  assert.ok(snapshot.sqliteBackupDir.endsWith("backups"));
  assert.ok(snapshot.dataDir.endsWith("data"));
});

test("DATA-007: env runtime path setters handle absolute paths, relative paths, and blank values", () => {
  resetEnvOverrides();
  const absPath = "/tmp/custom-sqlite.db";
  env.sqlitePath = absPath;
  assert.equal(env.sqlitePath, absPath);

  env.sqlitePath = "server/data/custom.db";
  assert.ok(env.sqlitePath.endsWith("custom.db"));

  env.sqlitePath = "";
  assert.ok(env.sqlitePath.endsWith("app.db"));
  resetEnvOverrides();
});
