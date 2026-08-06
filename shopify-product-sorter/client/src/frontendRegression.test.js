import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { sidebarModules, getActiveModules, getDisabledModules } from "./sidebarModules.js";
import { getOrderStatusDisplay, getStatusFilterLabel } from "./orderMappingView.js";
import ErrorBoundary from "./ErrorBoundary.js";
import { legacyRedirectFor, resolveRootPath } from "./routeConfig.js";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

test("Frontend Regression: Module Classification & Placeholder Ownership", () => {
  const disabledModules = getDisabledModules();
  assert.equal(disabledModules.length, 5);

  const disabledIds = disabledModules.map((m) => m.id);
  assert.deepEqual(disabledIds, ["meta-ads", "analytics", "inventory", "reports", "settings"]);

  for (const module of disabledModules) {
    assert.equal(module.enabled, false, `Disabled module ${module.id} must have enabled=false`);
    assert.equal(module.ownerClaim, null, `Disabled module ${module.id} must have ownerClaim=null`);
  }

  const activeModules = getActiveModules();
  assert.equal(activeModules.length, 3);
  const activeIds = activeModules.map((m) => m.id);
  assert.deepEqual(activeIds, ["sorter", "order-mapping", "sku-image-manager"]);

  for (const module of activeModules) {
    assert.equal(module.enabled, true);
    assert.ok(module.ownerClaim, `Active module ${module.id} must have explicit ownerClaim`);
  }
});

test("Frontend Regression: Order Mapping View Status Tones & Labels", () => {
  const notFoundDisplay = getOrderStatusDisplay({
    cancellation_status: null,
    shiprocket_response_id: null,
    shiprocket_channel_reference: "",
    normalized_status: "UNKNOWN",
    raw_status: "",
  });
  assert.equal(notFoundDisplay.tone, "not-found");
  assert.equal(notFoundDisplay.label, "Not found on Shiprocket");

  const cancelledDisplay = getOrderStatusDisplay({
    cancellation_status: "2026-07-23T10:00:00Z",
    shiprocket_response_id: "101",
    shiprocket_channel_reference: "REF-101",
    normalized_status: "DELIVERED",
    raw_status: "Delivered",
  });
  assert.equal(cancelledDisplay.tone, "cancelled");
  assert.equal(cancelledDisplay.label, "Cancelled");

  const deliveredDisplay = getOrderStatusDisplay({
    cancellation_status: null,
    shiprocket_response_id: "101",
    shiprocket_channel_reference: "REF-101",
    normalized_status: "DELIVERED_TO_CUSTOMER",
    raw_status: "Delivered",
  });
  assert.equal(deliveredDisplay.tone, "status");
  assert.equal(deliveredDisplay.label, "Delivered To Customer");
  assert.equal(deliveredDisplay.detail, "Delivered");

  assert.equal(getStatusFilterLabel("ALL"), "All Statuses");
  assert.equal(getStatusFilterLabel("UNDELIVERED"), "Undelivered");
  assert.equal(getStatusFilterLabel("NEEDS_ATTENTION"), "Needs Attention");
});

test("Frontend Regression: ErrorBoundary Contract & State Lifecycle", () => {
  const boundary = new ErrorBoundary({ children: null });
  assert.equal(boundary.state.hasError, false);
  assert.equal(boundary.state.error, null);

  const testError = new Error("Simulated component render failure");
  const derivedState = ErrorBoundary.getDerivedStateFromError(testError);
  assert.equal(derivedState.hasError, true);
  assert.equal(derivedState.error, testError);
});

test("Frontend Regression: Style Isolation & Scoped CSS Rules", () => {
  assert.doesNotMatch(styles, /(?:^|\n)label(?:\s*,[^}]+)?\s*\{/s);
  assert.doesNotMatch(styles, /(?:^|\n)(?:input|select|textarea)\s*\{[^}]*background:/s);
  assert.doesNotMatch(styles, /(?:^|\n)table\s*\{[^}]*border-collapse:/s);
  assert.doesNotMatch(styles, /(?:^|\n)(?:th|td)(?:\s*,[^}]+)?\s*\{[^}]*border-bottom:/s);

  assert.match(styles, /\.dashboard label\s*\{/);
  assert.match(styles, /\.dashboard table\s*\{/);
  assert.match(styles, /\.dashboard th,\s*\n\.dashboard td\s*\{/);
});

test("Frontend Regression: Sorter, SKU Image Manager, and Order Mapping boundaries", () => {
  const sorterContent = readFileSync(new URL("./Sorter.jsx", import.meta.url), "utf8");
  const skuContent = readFileSync(new URL("./SkuImageManager.jsx", import.meta.url), "utf8");
  const orderMappingContent = readFileSync(new URL("./OrderMapping.jsx", import.meta.url), "utf8");

  // Verify that Sorter does not import SkuImageManager or OrderMapping
  assert.ok(!sorterContent.includes("SkuImageManager"));
  assert.ok(!sorterContent.includes("OrderMapping"));

  // Verify that SkuImageManager does not import Sorter or OrderMapping
  assert.ok(!skuContent.includes("Sorter"));
  assert.ok(!skuContent.includes("OrderMapping"));

  // Verify that OrderMapping does not import Sorter or SkuImageManager
  assert.ok(!orderMappingContent.includes("Sorter"));
  assert.ok(!orderMappingContent.includes("SkuImageManager"));
});

test("Frontend Regression: App.jsx delegates rendering to extracted components (FE-007)", () => {
  const appContent = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

  // App.jsx must not contain inline Sorter dashboard handlers
  assert.ok(!appContent.includes("handleSync"), "App.jsx must not contain handleSync — Sorter logic should be in Sorter.jsx");
  assert.ok(!appContent.includes("handleGenerate"), "App.jsx must not contain handleGenerate");
  assert.ok(!appContent.includes("handleApply"), "App.jsx must not contain handleApply");
  assert.ok(!appContent.includes("handleRollback"), "App.jsx must not contain handleRollback");

  // App.jsx must render the extracted Sorter component
  assert.ok(appContent.includes("<Sorter"), "App.jsx must render <Sorter />");
  assert.ok(appContent.includes("<OrderMapping"), "App.jsx must render <OrderMapping />");
  assert.ok(appContent.includes("<SkuImageManager"), "App.jsx must render <SkuImageManager />");
});

test("Frontend Regression: ErrorBoundary wraps feature modules in App.jsx (FE-010)", () => {
  const appContent = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

  // ErrorBoundary must be imported and used
  assert.ok(appContent.includes("import ErrorBoundary"), "App.jsx must import ErrorBoundary");
  assert.ok(appContent.includes("<ErrorBoundary"), "App.jsx must use <ErrorBoundary>");

  // All three feature keys should be wrapped
  assert.ok(appContent.includes('key="sorter"'), "Sorter must have an ErrorBoundary key");
  assert.ok(appContent.includes('key="order-mapping"'), "OrderMapping must have an ErrorBoundary key");
  assert.ok(appContent.includes('key="sku-image-manager"'), "SkuImageManager must have an ErrorBoundary key");
});

test("Frontend Regression: direct frontend URLs resolve to the correct root (FE-011)", () => {
  assert.equal(resolveRootPath("/order-mapping"), "order-mapping");
  assert.equal(resolveRootPath("/delivery-resolution"), "order-mapping");
  assert.equal(resolveRootPath("/"), "app");
  assert.equal(resolveRootPath("/sorter"), "app");
});

test("Frontend Regression: browser-refresh resolution is deterministic (FE-011)", () => {
  // Pathname-based resolution must be stable across refreshes.
  assert.equal(resolveRootPath("/order-mapping"), resolveRootPath("/order-mapping"));
  assert.equal(resolveRootPath("/"), resolveRootPath("/"));
});

test("Frontend Regression: unknown routes fail safely to the app shell (FE-011)", () => {
  assert.equal(resolveRootPath("/some/unknown/route"), "app");
  assert.equal(resolveRootPath("/api/collections"), "app");
  assert.equal(legacyRedirectFor("/delivery-resolution"), "/order-mapping");
  assert.equal(legacyRedirectFor("/"), null);
});

test("Frontend Regression: placeholder modules carry explicit classifications (FE-011)", () => {
  const validClassifications = [
    "ACTIVE_FEATURE",
    "INTENTIONAL_DISABLED",
    "DEFERRED_META",
    "COMPATIBILITY_ENTRY",
    "REMOVE_AFTER_PROOF",
    "UNRESOLVED",
  ];
  for (const mod of sidebarModules) {
    assert.ok(validClassifications.includes(mod.classification), `${mod.id} must carry a valid classification`);
  }
  const active = sidebarModules.filter((m) => m.enabled);
  for (const mod of active) {
    assert.equal(mod.classification, "ACTIVE_FEATURE", `enabled module ${mod.id} must be ACTIVE_FEATURE`);
  }
  const metaAds = sidebarModules.find((m) => m.id === "meta-ads");
  assert.equal(metaAds.classification, "DEFERRED_META", "meta-ads must remain visibly deferred");
});

test("Frontend Regression: disabled navigation cannot invoke missing code (FE-011)", () => {
  const appContent = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.ok(appContent.includes("disabled={!item.enabled}"), "disabled nav items must be non-interactive");
  assert.ok(appContent.includes("item.enabled && setActiveModule"), "nav clicks must be gated by enabled");
});

test("Frontend Regression: each feature imports only its own API client (FE-008)", () => {
  const sorterContent = readFileSync(new URL("./Sorter.jsx", import.meta.url), "utf8");
  const skuContent = readFileSync(new URL("./SkuImageManager.jsx", import.meta.url), "utf8");
  const orderMappingContent = readFileSync(new URL("./OrderMapping.jsx", import.meta.url), "utf8");

  assert.match(sorterContent, /from "\.\/sorterApi"/);
  assert.ok(!/from "\.\/(skuImageApi|salesIntelligenceApi|orderMappingApi)"/.test(sorterContent), "Sorter must not import another feature's client");

  assert.match(skuContent, /from "\.\/skuImageApi"/);
  assert.ok(!/from "\.\/(sorterApi|salesIntelligenceApi|orderMappingApi)"/.test(skuContent), "SKU Image Manager must not import another feature's client");

  assert.match(orderMappingContent, /from "\.\/orderMappingApi"/);
  assert.ok(!/from "\.\/(sorterApi|skuImageApi|salesIntelligenceApi)"/.test(orderMappingContent), "Order Mapping must not import another feature's client");
});

test("Frontend Regression: frontend suites are wired into the regression gate (FE-011)", async () => {
  const { testSuites } = await import("../../scripts/regression-gate.mjs");
  const files = testSuites.map((s) => s.file);
  assert.ok(files.includes("client/src/frontendRegression.test.js"), "frontend regression suite must be in the gate");
  assert.ok(files.includes("client/src/api.test.js"), "api isolation suite must be in the gate");
  assert.ok(files.includes("client/src/styles.test.js"), "style isolation suite must be in the gate");
});
