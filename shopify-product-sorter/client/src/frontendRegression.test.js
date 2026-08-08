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
  assert.equal(activeModules.length, 5);
  const activeIds = activeModules.map((m) => m.id);
  assert.deepEqual(activeIds, ["sorter", "order-mapping", "sku-image-manager", "network", "diagnostics"]);

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

// ===== Product Sorter preview-to-apply contract (source-level) =====
test("Frontend Regression: Apply serializes string IDs only, never preview objects", () => {
  const sorterContent = readFileSync(new URL("./Sorter.jsx", import.meta.url), "utf8");
  const applySection = sorterContent.slice(
    sorterContent.indexOf("const handleApply"),
    sorterContent.indexOf("const handleRollback"),
  );
  assert.ok(applySection.length > 0, "handleApply body must exist");
  assert.doesNotMatch(
    applySection,
    /api\.applyOrder\([^)]*preview\.newOrder\s*\)/,
    "Apply must never send the preview objects directly",
  );
  assert.match(
    applySection,
    /preview\.newOrder\.map\(\(product\) => product\.id\)/,
    "Apply must serialize preview.newOrder to product IDs",
  );
  assert.match(
    applySection,
    /api\.applyOrder\(selectedCollectionId, orderIds/,
    "Apply must send the serialized orderIds array",
  );
});

test("Frontend Regression: double-click cannot send concurrent apply requests", () => {
  const sorterContent = readFileSync(new URL("./Sorter.jsx", import.meta.url), "utf8");
  const applySection = sorterContent.slice(
    sorterContent.indexOf("const handleApply"),
    sorterContent.indexOf("const handleRollback"),
  );
  assert.match(
    applySection,
    /applyInProgressRef/,
    "handleApply must guard against concurrent apply requests",
  );
});

test("Frontend Regression: Apply stays disabled without a fresh preview", () => {
  const sorterContent = readFileSync(new URL("./Sorter.jsx", import.meta.url), "utf8");
  const buttonSection = sorterContent.slice(sorterContent.indexOf("onClick={handleApply}"));
  assert.ok(buttonSection.length > 0, "Apply button must exist");
  assert.match(buttonSection, /!preview\.newOrder\.length/, "disabled when no preview exists");
  assert.match(buttonSection, /!preview\.previewVersion/, "disabled when previewVersion is absent");
  assert.match(buttonSection, /previewStale/, "disabled when the preview is stale");
  assert.match(buttonSection, /loading/, "disabled while an apply is running");
});

test("Frontend Regression: generated preview stores the server previewVersion", () => {
  const sorterContent = readFileSync(new URL("./Sorter.jsx", import.meta.url), "utf8");
  const generateSection = sorterContent.slice(
    sorterContent.indexOf("const handleGenerate"),
    sorterContent.indexOf("const handleApply"),
  );
  assert.match(
    generateSection,
    /previewVersion:\s*response\.previewVersion/,
    "generate must store the server-owned preview version",
  );
});

test("Frontend Regression: preview is invalidated when inputs change", () => {
  const sorterContent = readFileSync(new URL("./Sorter.jsx", import.meta.url), "utf8");

  const syncSection = sorterContent.slice(
    sorterContent.indexOf("const handleSync"),
    sorterContent.indexOf("const handleSaveStrategy"),
  );
  assert.match(syncSection, /setPreview\(emptyPreview\)/, "sync must clear the stale preview");

  assert.ok(
    sorterContent.includes("setPreviewStale(true)"),
    "strategy / preference / allocation changes must mark the preview stale",
  );
  assert.match(
    sorterContent,
    /Preview is outdated\. Generate a new order before applying\./,
    "a stale preview must surface the operator guidance message",
  );
});

// ===== Currency correctness regression =====
// The canonical INR formatter now lives in utils/format.js (single source of
// truth); Sorter.jsx and OrderMapping.jsx import it. These tests assert the
// canonical location and that the product table renders through it.

test("CURRENCY-I: canonical formatMoney uses INR currency code, not USD", () => {
  const src = readFileSync(new URL("./utils/format.js", import.meta.url), "utf8");
  assert.match(src, /currency: "INR"/, "formatMoney must use INR currency code");
  assert.ok(!src.includes('currency: "USD"'), "formatMoney must not use USD currency code");
});

test("CURRENCY-J: canonical formatMoney uses en-IN locale, not en-US", () => {
  const src = readFileSync(new URL("./utils/format.js", import.meta.url), "utf8");
  assert.match(src, /"en-IN"/, "formatMoney must use the en-IN locale for Indian number grouping");
  assert.ok(!src.includes('"en-US"'), "canonical formatter must not use en-US locale for money formatting");
});

test("CURRENCY-K: no bare dollar symbol hard-coded as currency label in canonical formatter", () => {
  const src = readFileSync(new URL("./utils/format.js", import.meta.url), "utf8");
  // Check that the canonical formatMoney does NOT default to a dollar literal output.
  // Specifically: there must be no string like "$" or '$ ' used as a currency prefix.
  // The correct output is via Intl.NumberFormat with INR which produces ₹.
  assert.ok(!src.includes('style: "currency",\n    currency: "USD"'), "No USD currency formatting must remain");
  assert.ok(!src.includes('"$"'), 'No bare "$" string literal must appear as a currency symbol');
  assert.ok(!src.includes("'$'"), "No bare '$' string literal must appear as a currency symbol");
  // Verify INR is used instead
  assert.match(src, /currency: "INR"/, "INR must be the currency used in formatMoney");
  assert.match(src, /function formatMoney/, "canonical formatMoney function must exist");
});

test("CURRENCY-L: product table revenue renders through the canonical INR formatter", () => {
  const utilsSrc = readFileSync(new URL("./utils/format.js", import.meta.url), "utf8");
  assert.match(utilsSrc, /function formatMoney/, "canonical formatMoney must exist");
  assert.match(utilsSrc, /currency: "INR"/, "formatMoney must use INR");
  // Verify the product table in Sorter.jsx renders revenue via formatMoney
  const sorterSrc = readFileSync(new URL("./Sorter.jsx", import.meta.url), "utf8");
  assert.match(sorterSrc, /formatMoney\(product\.salesRevenue/, "product table must use formatMoney for revenue");
});

// ===== Dead frontend scoring code removal =====

test("STRATEGY-CLEANUP: dead frontend scoring functions have been removed", () => {
  const src = readFileSync(new URL("./Sorter.jsx", import.meta.url), "utf8");
  // These were frontend-only scoring functions with wrong field names — they must be gone.
  assert.ok(!src.includes("function recencyScore"), "Dead recencyScore function must be removed");
  assert.ok(!src.includes("function resolveStrategy"), "Dead resolveStrategy function must be removed");
  assert.ok(!src.includes("function buildScoringContext"), "Dead buildScoringContext function must be removed");
  assert.ok(!src.includes("function scoreProduct"), "Dead scoreProduct function must be removed");
  assert.ok(!src.includes("function calculateScore"), "Dead calculateScore function must be removed");
  assert.ok(!src.includes("brandPriorityWeight"), "Dead brandPriorityWeight (wrong schema) must be removed");
  assert.ok(!src.includes("newProductBoost"), "Dead newProductBoost (wrong schema) must be removed");
  assert.ok(!src.includes("lowSellerPenalty"), "Dead lowSellerPenalty (wrong schema) must be removed");
});

test("STRATEGY-CLEANUP: weightFields match the canonical backend strategy schema", () => {
  const src = readFileSync(new URL("./Sorter.jsx", import.meta.url), "utf8");
  // The five canonical keys must all appear in weightFields
  assert.match(src, /salesWeight/, "weightFields must include salesWeight");
  assert.match(src, /inventoryWeight/, "weightFields must include inventoryWeight");
  assert.match(src, /newnessWeight/, "weightFields must include newnessWeight");
  assert.match(src, /momentumWeight/, "weightFields must include momentumWeight");
  assert.match(src, /rotationWeight/, "weightFields must include rotationWeight");
});

// ===== Strategy UI Integration Regression =====

test("STRATEGY-UI-REGRESSION: Sorter.jsx renders weight fields, percentage displays, dirty state badge, and reset compact button", () => {
  const src = readFileSync(new URL("./Sorter.jsx", import.meta.url), "utf8");
  assert.match(src, /UNSAVED CHANGES/, "strategy UI must check and display UNSAVED CHANGES state");
  assert.match(src, /SAVED/, "strategy UI must check and display SAVED state");
  assert.match(src, /strategyTotalPercent\(\) === 100/, "isStrategyValid must assert sum is 100");
  assert.match(src, /Reset to Defaults/, "strategy UI must render Reset to Defaults button");
  assert.match(src, /disabled=\{loading || !isStrategyValid\}/, "Save Strategy must be disabled if invalid");
  assert.match(src, /disabled=\{loading || !snapshot || !isStrategyValid || hasUnsavedChanges\}/, "Generate must be disabled when strategy is invalid or unsaved");
});

test("NAVIGATION-TEST: routeConfig resolves legacy and unknown routes safely", () => {
  // unknown diagnostic route fails safely by resolving to ROOT_NAMES.APP
  const resolvedUnknown = resolveRootPath("/unknown-diagnostic-route-path");
  assert.equal(resolvedUnknown, "app");

  // legacy route redirects correctly
  const redirect = legacyRedirectFor("/delivery-resolution");
  assert.equal(redirect, "/order-mapping");

  // canonical route resolves correctly
  const resolvedCanonical = resolveRootPath("/order-mapping");
  assert.equal(resolvedCanonical, "order-mapping");
});

test("DIAGNOSTICS-COMPONENTS-WIRING: App.jsx imports NetworkActivity and SystemDiagnostics", () => {
  const src = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.match(src, /import NetworkActivity from "\.\/NetworkActivity"/);
  assert.match(src, /import SystemDiagnostics from "\.\/SystemDiagnostics"/);
  assert.match(src, /activeModule === "network"/);
  assert.match(src, /activeModule === "diagnostics"/);
});


