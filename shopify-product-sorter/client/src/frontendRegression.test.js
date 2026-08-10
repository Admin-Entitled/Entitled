import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { sidebarModules, getActiveModules, getDisabledModules } from "./sidebarModules.js";
import {
  buildExpenseMonthOptions,
  EXPENSE_MONTH_ROLLING_COUNT,
  formatExpenseMonthLabel,
  formatMonthValue,
  getApiActivityDisplay,
  getCurrentMonthValue,
  getExpenseStatusLabel,
  getHistoryEmptyStateCopy,
  getReconciliationDisplay,
  parseMonthValue,
  shiftMonthValue,
} from "./expensesView.js";
import { getOrderStatusDisplay, getStatusFilterLabel } from "./orderMappingView.js";
import ErrorBoundary from "./ErrorBoundary.js";
import { legacyRedirectFor, resolveRootPath } from "./routeConfig.js";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

test("Frontend Regression: Module Classification & Placeholder Ownership", () => {
  const disabledModules = getDisabledModules();
  assert.equal(disabledModules.length, 4);

  const disabledIds = disabledModules.map((m) => m.id);
  assert.deepEqual(disabledIds, ["analytics", "inventory", "reports", "settings"]);

  for (const module of disabledModules) {
    assert.equal(module.enabled, false, `Disabled module ${module.id} must have enabled=false`);
    assert.equal(module.ownerClaim, null, `Disabled module ${module.id} must have ownerClaim=null`);
  }

  const activeModules = getActiveModules();
  assert.equal(activeModules.length, 7);
  const activeIds = activeModules.map((m) => m.id);
  assert.deepEqual(activeIds, ["sorter", "order-mapping", "sku-image-manager", "network", "diagnostics", "meta-ads", "expenses"]);

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
  assert.equal(metaAds.enabled, true, "meta-ads must be enabled");
  assert.equal(metaAds.classification, "ACTIVE_FEATURE", "meta-ads must be an active feature once functional");
  assert.ok(metaAds.ownerClaim, "meta-ads must have an explicit owner claim");
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
  assert.ok(files.includes("server/src/routes/metaAds.test.js"), "Meta Ads suite must be wired into the regression gate");
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

test("META-ADS-FRONTEND: App.jsx renders MetaAdsDashboard behind the meta-ads module", () => {
  const appContent = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.match(appContent, /import MetaAdsDashboard from "\.\/MetaAdsDashboard"/);
  assert.match(appContent, /activeModule === "meta-ads"/);
  assert.match(appContent, /<MetaAdsDashboard \/>/);
  assert.match(appContent, /key="meta-ads"/, "Meta Ads must be wrapped in an ErrorBoundary");
});

test("META-ADS-FRONTEND: sidebar no longer shows 'Later' for Meta Ads once enabled", () => {
  const metaAds = sidebarModules.find((m) => m.id === "meta-ads");
  assert.equal(metaAds.enabled, true, "Meta Ads must be enabled");
  assert.equal(metaAds.classification, "ACTIVE_FEATURE");
  assert.ok(metaAds.ownerClaim, "Meta Ads must have an owner claim");
});

test("META-ADS-FRONTEND: dashboard imports only its own metaAdsApi domain client", () => {
  const src = readFileSync(new URL("./MetaAdsDashboard.jsx", import.meta.url), "utf8");
  assert.match(src, /from "\.\/metaAdsApi(\.js)?"/);
  assert.ok(!/from "\.\/(sorterApi|skuImageApi|orderMappingApi|salesIntelligenceApi)"/.test(src));
});

test("META-ADS-FRONTEND: metaAdsApi delegates to the shared api.js transport and is read-only", () => {
  const src = readFileSync(new URL("./metaAdsApi.js", import.meta.url), "utf8");
  assert.match(src, /import \{ request \} from "\.\/api\.js"/, "metaAdsApi must reuse the shared transport");
  assert.ok(!src.includes("access_token"), "metaAdsApi must never carry or send the Meta access token");
  assert.ok(!src.includes("META_ACCESS_TOKEN"), "token env names must not appear in the client");
  // Read-only: only GET helpers plus the local cache refresh POST.
  const posts = [...src.matchAll(/method: "POST"/g)];
  assert.equal(posts.length, 1, "only the local cache refresh may be a POST");
});

test("META-ADS-FRONTEND: dashboard renders KPI cards, campaign table, drilldown, refresh, and states", () => {
  const src = readFileSync(new URL("./MetaAdsDashboard.jsx", import.meta.url), "utf8");
  assert.match(src, /SPEND/, "KPI card for Spend");
  assert.match(src, /META PURCHASE VALUE/, "KPI card for Meta Purchase Value (attribution-qualified)");
  assert.match(src, /META ROAS/, "KPI card for Meta ROAS");
  assert.match(src, /PURCHASES/);
  assert.match(src, /IMPRESSIONS/);
  assert.match(src, /Refresh Meta Data/, "Refresh action must exist");
  assert.match(src, /REFRESHING/, "Refresh must surface a REFRESHING state");
  assert.match(src, /handleSelectCampaign/, "campaign drilldown handler");
  assert.match(src, /handleSelectAdSet/, "ad set drilldown handler");
  assert.match(src, /META ADS NOT CONFIGURED/, "NOT_CONFIGURED state must be explicit");
  assert.match(src, /RATE_LIMITED|RATE LIMITED/, "rate-limited state must be surfaced");
  assert.match(src, /INSUFFICIENT_PERMISSIONS|PERMISSION REQUIRED/, "permission-required state must be surfaced");
  assert.match(src, /Daily Spend \+ Purchases/, "one trend chart (daily spend + purchases)");
});

test("META-ADS-FRONTEND: metaAdsView provides canonical date presets and timezone-aware ranges", () => {
  const src = readFileSync(new URL("./metaAdsView.js", import.meta.url), "utf8");
  for (const preset of ["today", "yesterday", "last7", "last14", "last30", "custom"]) {
    assert.match(src, new RegExp(preset), `date preset ${preset} must exist`);
  }
  assert.match(src, /timeZone: timezone/, "ranges must use the account timezone, not the browser timezone");
});

test("META-ADS-FRONTEND: Meta money renders through account-currency formatter (INR grouping, no USD assumption)", () => {
  const utilsSrc = readFileSync(new URL("./utils/format.js", import.meta.url), "utf8");
  assert.match(utilsSrc, /function formatMoneyForCurrency/, "account-currency formatter must exist");
  assert.match(utilsSrc, /currency === "INR" \? "en-IN"/, "INR must use en-IN grouping");
  const dashboardSrc = readFileSync(new URL("./MetaAdsDashboard.jsx", import.meta.url), "utf8");
  assert.match(dashboardSrc, /formatMoneyForCurrency\(value, currency/, "dashboard must format via the account currency");
  assert.ok(!dashboardSrc.includes('currency: "USD"'), "Meta dashboard must not hardcode USD");
});

test("META-ADS-FRONTEND: NetworkActivity surfaces a Meta provider filter", () => {
  const src = readFileSync(new URL("./NetworkActivity.jsx", import.meta.url), "utf8");
  assert.match(src, /"Meta"/, "Network Activity must have a Meta filter tab");
  assert.match(src, /log\.provider === "meta"/, "Network Activity must filter Meta provider logs");
});

test("META-ADS-FRONTEND: SystemDiagnostics renders a Meta Ads status card", () => {
  const src = readFileSync(new URL("./SystemDiagnostics.jsx", import.meta.url), "utf8");
  assert.match(src, /META ADS/, "System Diagnostics must show a Meta Ads section");
  assert.match(src, /metaAdsStatus/, "Meta status must derive from the diagnostics payload");
  assert.match(src, /connectionStatus/, "Meta connection status must be surfaced");
});

test("META-ADS-FRONTEND: DailyTrendChart component contains dual-axis SVG, axes, lines, tooltips, and handles empty/loading states", () => {
  const src = readFileSync(new URL("./MetaAdsDashboard.jsx", import.meta.url), "utf8");
  
  // Verify dual-scale SVG components exist
  assert.match(src, /function DailyTrendChart/, "DailyTrendChart component exists");
  assert.match(src, /viewBox=\{\`0 0 \$\{VW\} \$\{SVG_H\}\`\}/, "Uses percentage-width SVG");
  assert.match(src, /className="meta-chart-grid"/, "Renders grid lines");
  assert.match(src, /className="meta-chart-axis-label meta-chart-axis-label--left"/, "Renders left axis labels (Spend)");
  assert.match(src, /className="meta-chart-axis-label meta-chart-axis-label--right"/, "Renders right axis labels (Purchases)");
  assert.match(src, /className=\{\`meta-chart-bar-svg/, "Renders Spend bars");
  assert.match(src, /className="meta-chart-line"/, "Renders Purchases line");
  assert.match(src, /className=\{\`meta-chart-dot/, "Renders Purchases points/dots");
  
  // Verify empty, error and loading states
  assert.match(src, /No Meta activity for this date range\./, "Renders empty state when all elements are zero");
  assert.match(src, /Daily performance data could not be loaded\./, "Renders error state from props");
  assert.match(src, /Loading daily data…/, "Renders loading indicator");
  assert.match(src, /className="meta-chart-tooltip"/, "Includes tooltips for hover interaction");
});

test("META-ADS-FRONTEND: Cost Per Purchase KPI, columns, formats, sorting, and daily tooltip are integrated", () => {
  const dashSrc = readFileSync(new URL("./MetaAdsDashboard.jsx", import.meta.url), "utf8");
  const viewSrc = readFileSync(new URL("./metaAdsView.js", import.meta.url), "utf8");
  const compsSrc = readFileSync(new URL("./MetaAdsComponents.jsx", import.meta.url), "utf8");

  // Cost Per Purchase KPI card renders in the correct logical order (Spend, Purchases, CPP, MVP, ROAS...)
  assert.match(dashSrc, /label="COST PER PURCHASE"/, "Cost Per Purchase KPI card exists");
  
  // Cost / Purchase table cell renders
  assert.match(dashSrc, /costPerPurchase \?\? "—"|costPerPurchase != null \? renderMoney\(i\.costPerPurchase\) : "—"/, "Cost / Purchase table body cells render values or placeholder");

  // Daily chart tooltip includes Cost / Purchase
  assert.match(dashSrc, /span className="meta-chart-tooltip-key">Cost \/ Purchase<\/span>/, "Cost / Purchase appears in the daily chart tooltip");

  // MetaMoneyKpiCard handles null values gracefully (rendering placeholder/—)
  assert.match(compsSrc, /placeholder = "—"/, "MetaMoneyKpiCard supports custom placeholder");
  assert.match(compsSrc, /value != null && Number\.isFinite/, "MetaMoneyKpiCard checks if value is finite before formatting");

  // Cost Per Purchase is a sortable key
  assert.match(viewSrc, /\{ key: "costPerPurchase", label: "Cost \/ Purchase" \}/, "costPerPurchase is added to sort keys");

  // Sorting ascending/descending works, sorting places nulls at the end
  assert.match(viewSrc, /va === null/, "valueOf handles nulls in sorting");
  assert.match(viewSrc, /vb === null/, "valueOf handles nulls in sorting");
  assert.match(viewSrc, /return 1; \/\/ puts a at the end/, "null elements placed at end");
});

test("META-ADS-FRONTEND: Expenses module is registered in App routing, API, and has month selectors, ZIP triggers, tables, and modal", () => {
  const appSrc = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const expSrc = readFileSync(new URL("./Expenses.jsx", import.meta.url), "utf8");
  const expApiSrc = readFileSync(new URL("./expensesApi.js", import.meta.url), "utf8");
  const monthSelectorSrc = readFileSync(new URL("./ExpenseMonthSelector.jsx", import.meta.url), "utf8");
  const viewSrc = readFileSync(new URL("./expensesView.js", import.meta.url), "utf8");
  const sideSrc = readFileSync(new URL("./sidebarModules.js", import.meta.url), "utf8");

  // Router / Nav registration
  assert.match(sideSrc, /\{ id: "expenses", label: "Expenses"/, "expenses module exists in sidebar list");
  assert.match(appSrc, /activeModule === "expenses"/, "App routing matches expenses activeModule");
  assert.match(appSrc, /<Expenses \/>/, "App renders Expenses component");

  // API mappings
  assert.match(expApiSrc, /getMonths\(\)/, "expensesApi lists months");
  assert.match(expApiSrc, /getSummary\(month/, "expensesApi retrieves monthly summary");
  assert.match(expApiSrc, /getBills\(month/, "expensesApi lists detailed bills");
  assert.match(expApiSrc, /syncExpenses\(month/, "expensesApi triggers sync");
  assert.match(expApiSrc, /addBill\(formData/, "expensesApi posts manual upload multipart");

  // UI layout elements
  assert.match(expSrc, /className="feature-title">Expenses<\/h2>/, "Renders feature header title");
  assert.match(expSrc, /<ExpenseMonthSelector/, "Renders custom month selector");
  assert.match(expSrc, /Sync Expenses/, "Renders Sync Expenses button");
  assert.match(expSrc, /Add Bill/, "Renders Add Bill flow button");
  assert.match(expSrc, /Download All Bills/, "Renders bulk Download All Bills trigger");
  assert.match(expSrc, /Download Bills \(ZIP\)/, "Renders provider-wise bulk ZIP trigger");
  assert.match(expSrc, /Monthly Expense History/, "Renders history list header");
  assert.match(expSrc, /Add Merchant Bill/, "Renders manual upload form modal header");
  assert.match(viewSrc, /API Activity/, "Uses API Activity wording");
  assert.match(viewSrc, /Unbilled Activity/, "Uses contextual reconciliation language");
  assert.match(viewSrc, /No billed expense history yet\./, "Uses user-facing history empty state copy");
  assert.match(monthSelectorSrc, /role="listbox"/, "Month selector renders a DOM listbox");
  assert.doesNotMatch(monthSelectorSrc, /<select/i, "Month selector must not be native select UI");
});

test("EXPENSES-UX: current month plus previous 23 months are generated newest-first", () => {
  const months = buildExpenseMonthOptions({
    currentMonth: "2026-08",
    dataMonths: [],
    historyMonths: [],
  });
  assert.equal(months.length, EXPENSE_MONTH_ROLLING_COUNT);
  assert.equal(months[0], "2026-08");
  assert.equal(months[1], "2026-07");
  assert.equal(months[23], "2024-09");
});

test("EXPENSES-UX: historical months older than the rolling window are included without duplication", () => {
  const months = buildExpenseMonthOptions({
    currentMonth: "2026-08",
    dataMonths: ["2026-08", "2023-12"],
    historyMonths: ["2024-09", "2023-12"],
  });
  assert.equal(months.filter((month) => month === "2023-12").length, 1);
  assert.ok(months.includes("2023-12"));
});

test("EXPENSES-UX: month parsing, formatting, and shifting stay safe across year boundaries", () => {
  assert.deepEqual(parseMonthValue("2026-01"), { year: 2026, month: 1 });
  assert.equal(formatMonthValue(2026, 2), "2026-02");
  assert.equal(shiftMonthValue("2026-01", -1), "2025-12");
  assert.equal(shiftMonthValue("2026-12", 1), "2027-01");
  assert.equal(shiftMonthValue("2024-03", -1), "2024-02");
});

test("EXPENSES-UX: month labels are formatted from canonical YYYY-MM values", () => {
  assert.equal(formatExpenseMonthLabel("2026-08"), "August 2026");
  assert.equal(formatExpenseMonthLabel("2024-02"), "February 2024");
});

test("EXPENSES-UX: current month value uses local year/month getters, not UTC slicing", () => {
  const sample = new Date(2026, 0, 31, 23, 59, 59);
  assert.equal(getCurrentMonthValue(sample), "2026-01");
});

test("EXPENSES-UX: unbilled API activity is presented when billed is zero", () => {
  const display = getReconciliationDisplay({
    billed: 0,
    apiActivity: 10979.46,
    apiActivityState: "AVAILABLE",
    currency: "INR",
  });
  assert.equal(display.label, "Unbilled Activity");
  assert.match(display.value, /10,979\.46/);
});

test("EXPENSES-UX: difference is presented only when both billed and API activity exist", () => {
  const display = getReconciliationDisplay({
    billed: 11200,
    apiActivity: 10979,
    apiActivityState: "PARTIAL",
    currency: "INR",
  });
  assert.equal(display.label, "Difference");
  assert.match(display.value, /221/);
});

test("EXPENSES-UX: unavailable API activity is not shown as zero", () => {
  const apiDisplay = getApiActivityDisplay({
    apiActivityState: "UNAVAILABLE",
    currency: "INR",
  });
  assert.equal(apiDisplay.label, "API Activity");
  assert.equal(apiDisplay.value, "Unavailable");
});

test("EXPENSES-UX: genuine verified zero remains zero", () => {
  const apiDisplay = getApiActivityDisplay({
    apiActivityState: "ZERO_VERIFIED",
    apiActivity: 0,
    currency: "INR",
  });
  assert.equal(apiDisplay.label, "API Activity");
  assert.equal(apiDisplay.value, "₹0.00");
});

test("EXPENSES-UX: partial provider coverage can carry a real amount without pretending to be full coverage", () => {
  const apiDisplay = getApiActivityDisplay({
    apiActivityState: "PARTIAL",
    apiActivity: 87.5,
    currency: "INR",
  });
  assert.equal(apiDisplay.value, "₹87.50");
  assert.equal(apiDisplay.note, "Partial coverage");
});

test("EXPENSES-UX: provider API errors are not flattened to zero", () => {
  const apiDisplay = getApiActivityDisplay({
    apiActivityState: "ERROR",
    currency: "INR",
  });
  assert.equal(apiDisplay.value, "Could not load");
});

test("EXPENSES-UX: history empty state stays user-facing", () => {
  const emptyState = getHistoryEmptyStateCopy();
  assert.equal(emptyState.title, "No billed expense history yet.");
  assert.match(emptyState.body, /Uploaded bills will appear here by month/);
});

test("EXPENSES-UX: source uses the custom month selector and disabled empty download states", () => {
  const expensesSource = readFileSync(new URL("./Expenses.jsx", import.meta.url), "utf8");
  const selectorSource = readFileSync(new URL("./ExpenseMonthSelector.jsx", import.meta.url), "utf8");
  assert.match(selectorSource, /role="listbox"/);
  assert.match(selectorSource, /aria-haspopup="listbox"/);
  assert.doesNotMatch(selectorSource, /<select/i);
  assert.match(expensesSource, /ExpenseMonthSelector/);
  assert.doesNotMatch(expensesSource, /<select\s+value=\{selectedMonth\}/);
  assert.match(expensesSource, /className="expenses-history-link"/);
  assert.match(expensesSource, /disabled=\{bills\.length === 0 \|\| !selectedMonth\}/);
});

test("EXPENSES-UX: status labels stay human-friendly", () => {
  assert.equal(getExpenseStatusLabel("COMPLETE"), "Complete");
  assert.equal(getExpenseStatusLabel("INCOMPLETE"), "Bill Missing");
  assert.equal(getExpenseStatusLabel("NO_BILLS"), "No Bills");
  assert.equal(getExpenseStatusLabel("UNKNOWN"), "Unknown");
});
