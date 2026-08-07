import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { ApiError, request } from "./api.js";

const sorterSource = readFileSync(new URL("./Sorter.jsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Typed API error contract (synthetic fixtures, zero live network)
// ─────────────────────────────────────────────────────────────────────────────

test("api.request: 503 capability errors surface as typed ApiError metadata", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        success: false,
        code: "SHOPIFY_UNAVAILABLE",
        message: "Shopify is not configured for this environment.",
        category: "configuration_missing",
        missingVariables: ["SHOPIFY_STORE_DOMAIN"],
        correlationId: "corr-abc",
      }),
      { status: 503 },
    );
  try {
    await assert.rejects(() => request("/collections"), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 503);
      assert.equal(err.code, "SHOPIFY_UNAVAILABLE");
      assert.equal(err.category, "configuration_missing");
      assert.deepEqual(err.missingVariables, ["SHOPIFY_STORE_DOMAIN"]);
      assert.equal(err.correlationId, "corr-abc");
      assert.match(err.message, /Shopify is not configured/);
      return true;
    });
  } finally {
    global.fetch = original;
  }
});

test("api.request: ordinary validation errors keep status and message", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify({ code: "VALIDATION_ERROR", message: "Validation failed", details: [{ path: "body.collectionId" }] }), {
      status: 400,
    });
  try {
    await assert.rejects(() => request("/collections/sync", { method: "POST", body: "{}" }), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 400);
      assert.equal(err.code, "VALIDATION_ERROR");
      assert.ok(Array.isArray(err.details));
      assert.equal(err.message, "Validation failed");
      return true;
    });
  } finally {
    global.fetch = original;
  }
});

test("api.request: malformed JSON bodies fall back to statusText without stacks", async () => {
  const original = global.fetch;
  global.fetch = async () => new Response("<html>not json</html>", { status: 502, statusText: "Bad Gateway" });
  try {
    await assert.rejects(() => request("/collections"), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 502);
      assert.equal(err.code, "REQUEST_FAILED");
      assert.match(err.message, /Bad Gateway|Request failed/);
      assert.deepEqual(err.missingVariables, []);
      return true;
    });
  } finally {
    global.fetch = original;
  }
});

test("api.request: empty 200 responses return an empty payload without crashing", async () => {
  const original = global.fetch;
  global.fetch = async () => new Response("", { status: 200 });
  try {
    const payload = await request("/health/readiness");
    assert.deepEqual(payload, {});
  } finally {
    global.fetch = original;
  }
});

test("api.request: FormData uploads keep the Content-Type browser-owned", async () => {
  const original = global.fetch;
  const formData = new FormData();
  formData.append("file", new Blob(["sku image"]), "sku.png");
  let call = {};
  global.fetch = async (url, options = {}) => {
    call = { url, options };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    await request("/sku-images/add-upload", { method: "POST", body: formData });
  } finally {
    global.fetch = original;
  }
  assert.equal(call.options.headers["Content-Type"], undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Sorter startup contract: readiness first, no request loop
// ─────────────────────────────────────────────────────────────────────────────

test("Sorter: renders the Shopify-not-configured setup state with required content", () => {
  assert.ok(sorterSource.includes("Connect Shopify to use Product Sorter"));
  assert.ok(sorterSource.includes("Product Sorter is running. Shopify access is required to load collections."));
  assert.ok(sorterSource.includes("Missing Environment Variables"));
  assert.ok(sorterSource.includes("missingVars.map"));
  assert.ok(sorterSource.includes("Supported Authentication Methods"));
  assert.ok(sorterSource.includes("SHOPIFY_ADMIN_ACCESS_TOKEN"));
  assert.ok(sorterSource.includes("SHOPIFY_CLIENT_ID"));
  assert.ok(sorterSource.includes("SHOPIFY_CLIENT_SECRET"));
});

test("Sorter: setup state exposes accessible heading and explicit actions only", () => {
  const setupSection = sorterSource.split("Connect Shopify to use Product Sorter")[1].split("return (")[0];
  const setupRender = sorterSource.split("Connect Shopify to use Product Sorter")[1];
  const connectedRenderStart = sorterSource.indexOf("Manual collection control with daily smart rotation");
  assert.ok(connectedRenderStart > -1);
  const setupOnly = sorterSource.slice(0, connectedRenderStart);
  // Setup branch contains the actions, never the operational dashboard controls.
  assert.ok(setupOnly.includes("Retry connection"));
  assert.ok(setupOnly.includes("Copy variable-name template"));
  assert.ok(!setupOnly.includes("Sync Live Data"));
  assert.ok(!setupOnly.includes("Apply Order to Shopify"));
  assert.ok(!setupOnly.includes("Update All Collections"));
  // No secret input fields anywhere.
  assert.ok(!sorterSource.includes('type="password"'));
  assert.ok(!setupSection.includes("localStorage"));
});

test("Sorter: collections are requested exactly once and only when Shopify is available", () => {
  // Exactly one fetch call exists in the component.
  assert.equal((sorterSource.match(/api\.getCollections\(\)/g) || []).length, 1);
  // The single invocation is gated on capability availability and a one-shot ref.
  const invocation = sorterSource.indexOf("loadCollections();");
  assert.ok(invocation > -1);
  const before = sorterSource.slice(0, invocation);
  assert.ok(/capability\?\.available/.test(before), "getCollections must be gated on capability availability");
  assert.ok(before.includes("collectionsFetchedRef.current"), "collection fetch must be one-shot ref-guarded");
  // No auto-retry timer exists in Sorter.
  assert.ok(!sorterSource.includes("setInterval"));
  // Retry is explicit and single-action.
  assert.ok(sorterSource.includes("onClick={onRetryConnection}"));
});

test("Sorter: write actions are guarded", () => {
  // Apply disabled conditions — multi-line attribute, check each guard individually
  assert.ok(sorterSource.includes("!preview.newOrder.length"), "Apply must be disabled without a generated order");
  assert.ok(sorterSource.includes("!preview.previewVersion"), "Apply must check previewVersion");
  assert.ok(sorterSource.includes("previewStale"), "Apply must check for stale preview");
  assert.ok(sorterSource.includes("disabled={isSyncingAll || !collections.length}"), "Update All must be disabled without collections");
  assert.ok(sorterSource.includes("Preview only — no changes are written to Shopify until you Apply."));
  assert.ok(sorterSource.includes("button danger"));
});

test("App: readiness is the first capability request and is fetched once", () => {
  assert.ok(appSource.includes("api.getReadiness()"));
  assert.ok(appSource.includes("readinessFetchedRef.current"), "readiness fetch must be one-shot ref-guarded (StrictMode-safe)");
  assert.ok(appSource.includes("capability={shopifyCapability}"), "App must pass capability down to Sorter");
  assert.ok(appSource.includes("onRetryConnection={fetchReadiness}"), "App must wire a single bounded retry");
  // No component in App polls Shopify collections.
  assert.ok(!appSource.includes("getCollections()"));
});

test("App: diagnostics are a collapsible drawer, collapsed by default and out of the permanent sidebar", () => {
  assert.ok(appSource.includes("useState(false)"), "diagnostics must default to collapsed");
  assert.ok(appSource.includes("diagnosticsOpen ? ("), "diagnostics must render conditionally");
  assert.ok(appSource.includes("setDiagnosticsOpen"), "diagnostics must have an explicit toggle");
});

// ─────────────────────────────────────────────────────────────────────────────
// Style contract: sharp, restrained operational tool
// ─────────────────────────────────────────────────────────────────────────────

function parseCssBlock(css, selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}");
  const m = css.match(re);
  return m ? m[1] : null;
}

test("Styles: normal buttons are not pill-shaped", () => {
  const buttonBlock = parseCssBlock(styles, ".button");
  assert.ok(buttonBlock, ".button must be defined");
  assert.match(buttonBlock, /border-radius:\s*6px/);
  assert.ok(!/border-radius:\s*999px/.test(buttonBlock));
});

test("Styles: panels use a restrained radius (4-8px), never giant rounding", () => {
  const panelBlock = parseCssBlock(styles, ".panel");
  assert.ok(panelBlock);
  assert.match(panelBlock, /border-radius:\s*(?:4|5|6|7|8)px/);
  assert.ok(!/border-radius:\s*999px/.test(panelBlock));
});

test("Styles: sidebar navigation is a single column with no two-column grid", () => {
  const navBlock = parseCssBlock(styles, ".sidebar-nav");
  assert.ok(navBlock);
  assert.match(navBlock, /flex-direction:\s*column/);
  assert.ok(!/grid-template-columns/.test(navBlock), "desktop sidebar nav must not use a column grid");
});

test("Styles: page cannot overflow horizontally", () => {
  const htmlBody = styles.match(/html,\nbody\s*\{([^}]*)\}/);
  assert.ok(htmlBody, "html,body rule must exist");
  assert.match(htmlBody[1], /overflow-x:\s*hidden/);
  assert.match(styles, /\.app-shell[^}]*overflow-x:\s*hidden/s);
  assert.match(styles, /\.app-body[^}]*grid-template-columns:\s*240px minmax\(0, 1fr\)/s);
});

test("Styles: setup state heading and action styles exist", () => {
  assert.match(styles, /\.setup-card h2\s*\{/);
  assert.match(styles, /\.setup-actions\s*\{/);
  assert.match(styles, /\.state-chip\s*\{/);
  assert.match(styles, /\.setup-status-grid\s*\{/);
  assert.match(styles, /\.setup-instructions\s*\{/);
});
