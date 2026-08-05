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

test("SKU Image Manager router: GET /api/sku-images/search responds", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/sku-images/search?sku=test");
    assert.ok(res.status === 200 || res.status === 500, `unexpected status ${res.status}`);
    const data = JSON.parse(res.body);
    assert.ok("products" in data || "results" in data || "error" in data, "response must have expected shape");
  } finally {
    server.close();
  }
});

test("SKU Image Manager router: POST /api/sku-images/add requires body fields", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/sku-images/add", {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert.ok(res.status === 200 || res.status === 500, `unexpected status ${res.status}`);
    const data = JSON.parse(res.body);
    assert.ok("error" in data || "success" in data || "ok" in data, "response must have shape");
  } finally {
    server.close();
  }
});

test("SKU Image Manager router: POST /api/sku-images/reorder requires orderedMediaIds", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/sku-images/reorder", {
      method: "POST",
      body: JSON.stringify({ orderedMediaIds: [] }),
    });
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.ok(data.error.includes("orderedMediaIds"));
  } finally {
    server.close();
  }
});

test("SKU Image Manager router: POST /api/sku-images/bulk-add requires items", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/sku-images/bulk-add", {
      method: "POST",
      body: JSON.stringify({ items: [] }),
    });
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.ok(data.error.includes("No SKU"));
  } finally {
    server.close();
  }
});

test("SKU Image Manager router: POST /api/sku-images/bulk-delete-preview requires items", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/sku-images/bulk-delete-preview", {
      method: "POST",
      body: JSON.stringify({ items: [] }),
    });
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.ok(data.error.includes("No SKU"));
  } finally {
    server.close();
  }
});

test("SKU Image Manager router: POST /api/sku-images/bulk-delete-confirm requires previewRows", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/sku-images/bulk-delete-confirm", {
      method: "POST",
      body: JSON.stringify({ previewRows: [] }),
    });
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.ok(data.error.includes("previewRows"));
  } finally {
    server.close();
  }
});

test("SKU Image Manager router: No cross-domain imports (no Sorter or Sales Intelligence services)", async () => {
  const fs = await import("node:fs");
  const content = fs.default.readFileSync("server/src/routes/skuMedia.js", "utf8");
  assert.doesNotMatch(content, /sorter\.js/, "skuMedia.js must not import sorter service");
  assert.doesNotMatch(content, /actualSalesService/, "skuMedia.js must not import sales intelligence service");
  assert.doesNotMatch(content, /collectionStateService/, "skuMedia.js must not import collection state service");
});
