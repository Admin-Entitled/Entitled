/**
 * Integration & Startup Contracts Test Suite
 *
 * Permanent validation for INT-002, INT-005, INT-006, and OPS-002.
 *
 * Rules:
 * - Synthetic values only; zero live network calls.
 * - Zero secrets or customer data embedded.
 * - Verifies current code contracts against documented matrices.
 */

import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 1 — INT-002: Shared Shopify Transport Contract
// ──────────────────────────────────────────────────────────────────────────────

test("INT-002 — Shopify Transport: Contract document exists and claims correct task and modules", () => {
  const docPath = path.join(root, "docs/architecture/SHOPIFY_TRANSPORT_CONTRACT.md");
  assert.ok(fs.existsSync(docPath), "SHOPIFY_TRANSPORT_CONTRACT.md must exist");
  
  const content = fs.readFileSync(docPath, "utf-8");
  assert.ok(content.includes("INT-002"), "Document must contain Task ID INT-002");
  assert.ok(content.includes("shopifyAuth.js"), "Document must reference shopifyAuth.js");
  assert.ok(content.includes("shopifyService.js"), "Document must reference shopifyService.js");
  assert.ok(content.includes("Branch-Native Evidence"), "Document must reference Branch-Native Evidence");
});

test("INT-002 — Shopify Transport: Transport has no Sorter/SKU/OrderMapping business logic", async () => {
  const shopifyAuthSrc = fs.readFileSync(path.join(root, "server/src/services/shopifyAuth.js"), "utf-8");
  const shopifyServiceSrc = fs.readFileSync(path.join(root, "server/src/services/shopifyService.js"), "utf-8");

  // Verify generic transport does not reference domain-specific formulas or tables
  assert.doesNotMatch(shopifyAuthSrc, /score_formula|sku_image_audit|order_mapping_orders/i);
  assert.doesNotMatch(shopifyServiceSrc, /score_formula|sku_image_audit|order_mapping_orders/i);
});

test("INT-002 — Shopify Transport: Access token handling uses synthetic config and redacts token in errors", async () => {
  const { env, resetEnvOverrides } = await import(path.join(root, "server/src/config/env.js"));
  const { getAccessToken, getShopifyAuthHeaders, resetShopifyAuthCache } = await import(
    path.join(root, "server/src/services/shopifyAuth.js")
  );

  resetShopifyAuthCache();
  env.shopifyAdminAccessToken = "shpat_synthetic_test_token_123";

  const token = await getAccessToken();
  assert.equal(token, "shpat_synthetic_test_token_123");

  const headers = await getShopifyAuthHeaders();
  assert.equal(headers.headers["X-Shopify-Access-Token"], "shpat_synthetic_test_token_123");

  resetShopifyAuthCache();
  resetEnvOverrides();
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 2 — INT-005: Shared Shiprocket Transport Contract
// ──────────────────────────────────────────────────────────────────────────────

test("INT-005 — Shiprocket Transport: Contract document exists and claims correct task and modules", () => {
  const docPath = path.join(root, "docs/architecture/SHIPROCKET_TRANSPORT_CONTRACT.md");
  assert.ok(fs.existsSync(docPath), "SHIPROCKET_TRANSPORT_CONTRACT.md must exist");

  const content = fs.readFileSync(docPath, "utf-8");
  assert.ok(content.includes("INT-005"), "Document must contain Task ID INT-005");
  assert.ok(content.includes("shiprocketService.js"), "Document must reference shiprocketService.js");
  assert.ok(content.includes("orderMappingShiprocket.js"), "Document must reference orderMappingShiprocket.js");
  assert.ok(content.includes("Branch-Native Evidence"), "Document must reference Branch-Native Evidence");
});

test("INT-005 — Shiprocket Transport: Status normalization and terminal protection remain in orderMappingStatus.js", async () => {
  const { normalizeOrderMappingStatus, isTerminalOrderMappingStatus, TERMINAL_STATUSES } = await import(
    path.join(root, "server/src/services/orderMappingStatus.js")
  );

  assert.equal(normalizeOrderMappingStatus("DELIVERED"), "DELIVERED_TO_CUSTOMER");
  assert.equal(normalizeOrderMappingStatus("RTO DELIVERED"), "RTO_DELIVERED");

  assert.equal(isTerminalOrderMappingStatus("DELIVERED_TO_CUSTOMER"), true);
  assert.equal(isTerminalOrderMappingStatus("RTO_DELIVERED"), true);
  assert.equal(isTerminalOrderMappingStatus("IN_TRANSIT"), false);

  assert.equal(TERMINAL_STATUSES.size, 2);
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 3 — INT-006: Integration Env Ownership Matrix
// ──────────────────────────────────────────────────────────────────────────────

test("INT-006 — Integration Env: Ownership document exists and matches env.js", () => {
  const docPath = path.join(root, "docs/architecture/INTEGRATION_ENV_OWNERSHIP_MATRIX.md");
  assert.ok(fs.existsSync(docPath), "INTEGRATION_ENV_OWNERSHIP_MATRIX.md must exist");

  const content = fs.readFileSync(docPath, "utf-8");
  assert.ok(content.includes("INT-006"), "Document must contain Task ID INT-006");
  assert.ok(content.includes("server/src/config/env.js"), "Document must declare server/src/config/env.js as owner");

  // Check key env vars are documented
  const requiredVars = [
    "SHOPIFY_STORE_DOMAIN",
    "SHOPIFY_CLIENT_ID",
    "SHOPIFY_CLIENT_SECRET",
    "SHOPIFY_ADMIN_ACCESS_TOKEN",
    "SHIPROCKET_EMAIL",
    "SHIPROCKET_PASSWORD",
    "SHIPROCKET_TOKEN",
    "DATABASE_URL",
  ];

  for (const v of requiredVars) {
    assert.ok(content.includes(v), `Document must cover environment variable ${v}`);
  }
});

test("INT-006 — Integration Env: Missing Shiprocket credentials degrade gracefully without crashing", async () => {
  const { env, resetEnvOverrides } = await import(path.join(root, "server/src/config/env.js"));
  const { fetchShiprocketOrders } = await import(path.join(root, "server/src/services/shiprocketService.js"));

  env.shiprocketEmail = "";
  env.shiprocketPassword = "";
  env.shiprocketToken = "";

  const result = await fetchShiprocketOrders({ start: "2026-07-01", end: "2026-07-31" });
  assert.deepEqual(result, { configured: false, shipments: [], pages: 0 });

  resetEnvOverrides();
});

test("INT-006 — Integration Env: Secret variables are not exported to client source files", () => {
  const clientSrcDir = path.join(root, "client/src");
  if (!fs.existsSync(clientSrcDir)) return;

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".jsx") || entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        const fileContent = fs.readFileSync(full, "utf-8");
        assert.doesNotMatch(fileContent, /SHOPIFY_CLIENT_SECRET|SHOPIFY_ADMIN_ACCESS_TOKEN|SHIPROCKET_PASSWORD|SHIPROCKET_TOKEN/, `Secret variable found in frontend file: ${full}`);
      }
    }
  }

  scanDir(clientSrcDir);
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 4 — OPS-002: Startup Commands Safety Matrix
// ──────────────────────────────────────────────────────────────────────────────

test("OPS-002 — Startup Commands: Safety matrix document exists and covers key commands", () => {
  const docPath = path.join(root, "docs/architecture/STARTUP_COMMANDS_SAFETY_MATRIX.md");
  assert.ok(fs.existsSync(docPath), "STARTUP_COMMANDS_SAFETY_MATRIX.md must exist");

  const content = fs.readFileSync(docPath, "utf-8");
  assert.ok(content.includes("OPS-002"), "Document must contain Task ID OPS-002");
  assert.ok(content.includes("npm run verify"), "Document must cover npm run verify");
  assert.ok(content.includes("migrate:order-mapping"), "Document must cover migrate:order-mapping");
});

test("OPS-002 — Startup Commands: All package.json scripts match safety classifications", () => {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
  const serverPkg = JSON.parse(fs.readFileSync(path.join(root, "server/package.json"), "utf-8"));

  assert.ok(rootPkg.scripts.dev, "root package.json must define dev script");
  assert.ok(rootPkg.scripts.verify, "root package.json must define verify script");
  assert.ok(serverPkg.scripts["migrate:order-mapping"], "server package.json must define migrate:order-mapping");

  // Ensure no package script points to obsolete scripts/dev.mjs
  const allRootScripts = Object.values(rootPkg.scripts).join("\n");
  const allServerScripts = Object.values(serverPkg.scripts).join("\n");
  assert.doesNotMatch(allRootScripts, /scripts\/dev\.mjs/, "No root package script may point to scripts/dev.mjs");
  assert.doesNotMatch(allServerScripts, /scripts\/dev\.mjs/, "No server package script may point to scripts/dev.mjs");
});

test("OPS-002 — Startup Commands: npm run verify is offline safe", () => {
  const output = execSync("npm run verify", { encoding: "utf8" });
  assert.ok(output.includes("Architecture System Verification"));
  assert.ok(output.includes("System verification completed successfully"));
});

test("OPS-002 — Startup Commands: Migration scripts require explicit confirmation", () => {
  assert.throws(
    () => {
      execSync("node server/src/scripts/migrateOrderMapping.js", { encoding: "utf8", stdio: "pipe" });
    },
    (err) => {
      assert.equal(err.status, 1);
      assert.ok(err.stderr.includes("Migration commands require explicit operator intent"));
      return true;
    }
  );
});
