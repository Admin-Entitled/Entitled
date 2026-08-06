import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { sidebarModules, getActiveModules, getDisabledModules } from "./sidebarModules.js";
import { getOrderStatusDisplay, getStatusFilterLabel } from "./orderMappingView.js";
import ErrorBoundary from "./ErrorBoundary.js";

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
