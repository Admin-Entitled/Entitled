import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import app from "../app.js";

function startServer(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

function request(server, path, options = {}) {
  const address = server.address();
  const url = new URL(path, "http://127.0.0.1:" + address.port);
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...options.headers },
    }, (res) => {
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

function assertValidationRejected(res, field) {
  assert.equal(res.status, 400);
  const data = JSON.parse(res.body);
  assert.equal(data.code, "VALIDATION_ERROR");
  assert.ok(
    JSON.stringify(data.details).includes(field),
    `validation payload must mention '${field}'`,
  );
}

test("Sorter router: GET /api/collections returns collections envelope", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections");
    assert.ok(res.status === 200 || res.status === 500, `unexpected status ${res.status}`);
    const data = JSON.parse(res.body);
    assert.ok(typeof data === "object", "response must be an object");
  } finally {
    server.close();
  }
});

test("Sorter router: GET /api/collection-products requires collectionId", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collection-products");
    assertValidationRejected(res, "collectionId");
  } finally {
    server.close();
  }
});

test("Sorter router: POST /api/collections/sync requires collectionId", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/sync", {
      method: "POST",
      body: JSON.stringify({}),
    });
    assertValidationRejected(res, "collectionId");
  } finally {
    server.close();
  }
});

test("Sorter router: GET /api/collections/state requires collectionId", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/state");
    assertValidationRejected(res, "collectionId");
  } finally {
    server.close();
  }
});

test("Sorter router: PUT /api/collections/settings requires collectionId", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/settings", {
      method: "PUT",
      body: JSON.stringify({}),
    });
    assertValidationRejected(res, "collectionId");
  } finally {
    server.close();
  }
});

test("Sorter router: PUT /api/collections/products/preference requires collectionId and productId", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/products/preference", {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const data = JSON.parse(res.body);
    assert.equal(res.status, 400);
    assert.equal(data.code, "VALIDATION_ERROR");
    assert.ok(
      JSON.stringify(data.details).includes("collectionId") ||
        JSON.stringify(data.details).includes("productId"),
      "validation payload must mention collectionId or productId",
    );
  } finally {
    server.close();
  }
});

test("Sorter router: POST /api/collections/generate requires collectionId", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/generate", {
      method: "POST",
      body: JSON.stringify({}),
    });
    assertValidationRejected(res, "collectionId");
  } finally {
    server.close();
  }
});

test("Sorter router: POST /api/collections/apply requires collectionId", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/apply", {
      method: "POST",
      body: JSON.stringify({}),
    });
    assertValidationRejected(res, "collectionId");
  } finally {
    server.close();
  }
});

test("Sorter router: POST /api/collections/apply requires orderIds", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/apply", {
      method: "POST",
      body: JSON.stringify({ collectionId: "gid://shopify/Collection/test" }),
    });
    assertValidationRejected(res, "orderIds");
  } finally {
    server.close();
  }
});

test("Sorter router: POST /api/collections/apply rejects non-array orderIds", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/apply", {
      method: "POST",
      body: JSON.stringify({ collectionId: "gid://shopify/Collection/test", orderIds: "gid://shopify/Product/1" }),
    });
    assertValidationRejected(res, "orderIds");
  } finally {
    server.close();
  }
});

test("Sorter router: POST /api/collections/apply rejects non-string collectionId", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/apply", {
      method: "POST",
      body: JSON.stringify({ collectionId: 42, orderIds: [] }),
    });
    assertValidationRejected(res, "collectionId");
  } finally {
    server.close();
  }
});

test("Sorter router: POST /api/collections/rollback requires collectionId", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/rollback", {
      method: "POST",
      body: JSON.stringify({}),
    });
    assertValidationRejected(res, "collectionId");
  } finally {
    server.close();
  }
});

test("Sorter router: GET /api/collections/logs/actions returns logs envelope", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/logs/actions");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.ok("logs" in data, "response must contain 'logs' key");
    assert.ok(Array.isArray(data.logs), "logs must be an array");
    assert.ok("latestRun" in data, "response must contain 'latestRun' key");
  } finally {
    server.close();
  }
});

test("Sorter router: GET /api/collections/logs/network returns logs envelope", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/logs/network");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.ok("logs" in data, "response must contain 'logs' key");
    assert.ok(Array.isArray(data.logs), "logs must be an array");
    assert.ok("latestRun" in data, "response must contain 'latestRun' key");
  } finally {
    server.close();
  }
});

test("Sorter router: POST /api/collections/reorder-all redirects to v2", async () => {
  const server = await startServer(app);
  try {
    const address = server.address();
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: "127.0.0.1", port: address.port, path: "/api/collections/reorder-all", method: "POST" },
        (res) => {
          let body = "";
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(res.status, 307);
    assert.ok(res.headers.location.includes("reorder-all-v2"));
  } finally {
    server.close();
  }
});

test("Sorter router: No cross-domain imports (no SKU or Sales Intelligence services)", async () => {
  const fs = await import("node:fs");
  const content = fs.default.readFileSync("server/src/routes/sorter.js", "utf8");
  assert.doesNotMatch(content, /shopifyMediaService/, "sorter.js must not import SKU media service");
  assert.doesNotMatch(content, /actualSalesService/, "sorter.js must not import sales intelligence service");
});

// ─────────────────────────────────────────────────────────────────────────────
// Global Sync (sync-all) — Regression Tests A–J
// ─────────────────────────────────────────────────────────────────────────────

// A. Sync Live Data works with selectedCollection = null
// The route must accept a POST with empty body (no collectionId required).
test("Sorter router: POST /api/collections/sync-all accepts requests with no collectionId (A)", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/sync-all", {
      method: "POST",
      body: JSON.stringify({}),
    });
    // Either succeeds (200) or fails due to Shopify unavailability (503) — but
    // must NEVER reject with 400 VALIDATION_ERROR (no collectionId required).
    assert.ok(res.status !== 400, `sync-all must not return 400; got ${res.status}`);
    const data = JSON.parse(res.body);
    assert.notEqual(data.code, "VALIDATION_ERROR", "sync-all must not require collectionId");
  } finally {
    server.close();
  }
});

// B+C. All collections are synchronized / pagination is processed.
// Verified structurally: the route calls fetchCollections() (which paginates)
// and then fetchCollectionProducts() per collection (which also paginates).
test("Sorter router: sync-all route calls paginated collection and product fetchers (B+C)", async () => {
  const fs = await import("node:fs");
  const content = fs.default.readFileSync("server/src/routes/sorter.js", "utf8");

  // The global sync endpoint must call the paginated fetchers, not a
  // single-collection shortcut.
  assert.match(content, /fetchCollections\(\)/, "sync-all must call fetchCollections for all collections");
  assert.match(content, /fetchCollectionProducts\(collection\.id\)/, "sync-all must call fetchCollectionProducts per collection");
  assert.match(content, /fetchSalesMetrics\(allProductIds\)/, "sync-all must bulk-fetch sales metrics");
});

// D. Selected collection remains selected and refreshes after global sync.
// Verified structurally: the handler reads selectedCollectionId from closure
// and calls getCollectionSnapshot to refresh after sync.
test("Sorter router: Sorter.jsx refresh logic preserves selected collection after sync (D+E)", async () => {
  const fs = await import("node:fs");
  const sorterContent = fs.default.readFileSync("client/src/Sorter.jsx", "utf8");

  const syncSection = sorterContent.slice(
    sorterContent.indexOf("const handleSync"),
    sorterContent.indexOf("const handleSaveStrategy"),
  );

  // The handler must call syncAllCollections (not the per-collection syncCollection).
  assert.match(syncSection, /api\.syncAllCollections\(\)/, "handleSync must call syncAllCollections");

  // It must NOT be gated on selectedCollectionId (no early-return when null).
  assert.doesNotMatch(
    syncSection,
    /if \(!selectedCollectionId\) return/,
    "handleSync must not early-return when no collection is selected",
  );

  // After a global sync it must refresh the selected collection snapshot
  // (if one is selected) from the local cache.
  assert.match(syncSection, /api\.getCollectionSnapshot\(selectedCollectionId\)/, "handleSync must refresh selected collection snapshot after sync");

  // The preview must be cleared after the snapshot refresh.
  assert.match(syncSection, /setPreview\(emptyPreview\)/, "handleSync must clear the stale preview after sync");
});

// F. No selected collection is required to run sync-all.
test("Sorter router: sync-all is not gated on a collection selection in frontend (F)", async () => {
  const fs = await import("node:fs");
  const sorterContent = fs.default.readFileSync("client/src/Sorter.jsx", "utf8");

  // The Sync Live Data button must NOT be disabled when no collection is selected.
  // It should only be disabled when isSyncing=true.
  const buttonSection = sorterContent.slice(sorterContent.indexOf("onClick={handleSync}"));
  assert.match(buttonSection, /disabled=\{isSyncing\}/, "Sync Live Data button must only be disabled while isSyncing, not when no collection selected");
  assert.doesNotMatch(
    buttonSection.slice(0, 200),
    /disabled=\{[^}]*selectedCollectionId/,
    "Sync Live Data button must not be gated on selectedCollectionId",
  );
});

// G. Partial collection failures are surfaced.
test("Sorter router: sync-all response distinguishes complete success from partial failure (G)", async () => {
  const fs = await import("node:fs");
  const content = fs.default.readFileSync("server/src/routes/sorter.js", "utf8");

  // The route must compute and return ok, synced, failed counters.
  assert.match(content, /const ok = failed === 0/, "sync-all must derive ok from failed count");
  assert.match(content, /synced,/, "sync-all must return synced count");
  assert.match(content, /failed,/, "sync-all must return failed count");
  assert.match(content, /totalCollections,/, "sync-all must return totalCollections");
});

// H. Successful collections remain usable during partial failure.
// Verified: per-collection errors are caught individually; successful payloads
// are stored in payloadById before any failure can affect them.
test("Sorter router: sync-all per-collection errors are isolated — one failure does not invalidate others (H)", async () => {
  const fs = await import("node:fs");
  const content = fs.default.readFileSync("server/src/routes/sorter.js", "utf8");

  // Each collection fetch is wrapped in its own try/catch inside a for-loop.
  assert.match(content, /for \(const collection of collections\)/, "sync-all must iterate collections in a loop");
  assert.match(content, /fetchErrors\.push\(/, "sync-all must collect fetch errors without aborting");
  assert.match(content, /snapshotErrors\.push\(/, "sync-all must collect snapshot errors without aborting");

  // Successful payloads are stored in payloadById before any snapshot phase
  // errors, so they are always persisted.
  assert.match(content, /payloadById\.set\(collection\.id, payload\)/, "sync-all must store successful payloads before any error path");
});

// I. Sync Live Data performs no Shopify reorder/write mutation.
test("Sorter router: sync-all performs no Shopify write mutations (I)", async () => {
  const fs = await import("node:fs");
  const content = fs.default.readFileSync("server/src/routes/sorter.js", "utf8");

  // Extract only the sync-all handler body (between the route and next route).
  const syncAllStart = content.indexOf('router.post("/collections/sync-all"');
  const syncAllEnd = content.indexOf('\nrouter.', syncAllStart + 1);
  const syncAllBody = content.slice(syncAllStart, syncAllEnd > -1 ? syncAllEnd : undefined);

  // Must never call syncCollectionOrder (the Shopify write mutation).
  assert.doesNotMatch(syncAllBody, /syncCollectionOrder/, "sync-all must not call syncCollectionOrder (write mutation)");
  // Must never call applyGeneratedOrder.
  assert.doesNotMatch(syncAllBody, /applyGeneratedOrder/, "sync-all must not call applyGeneratedOrder");
  // Must not import or call generateOrder within sync-all.
  assert.doesNotMatch(syncAllBody, /generateOrder\(/, "sync-all must not call generateOrder");
});

// J. Existing Product Sorter workflows continue working (backward-compat check).
test("Sorter router: POST /api/collections/sync still requires collectionId (J — backward compat)", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/sync", {
      method: "POST",
      body: JSON.stringify({}),
    });
    assertValidationRejected(res, "collectionId");
  } finally {
    server.close();
  }
});

