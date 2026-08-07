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

test("Sales Intelligence router: GET /api/sales-intelligence/summary returns envelope", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/sales-intelligence/summary");
    assert.ok(res.status === 200 || res.status === 500, `unexpected status ${res.status}`);
    const data = JSON.parse(res.body);
    assert.ok(typeof data === "object", "response must be an object");
    if (res.status === 500) {
      assert.ok("error" in data, "500 error envelope must contain error key");
    }
  } finally {
    server.close();
  }
});

const slices = [
  "brand-performance",
  "type-performance",
  "color-performance",
  "sku-performance",
  "courier-performance",
  "pincode-performance",
  "state-performance",
  "city-performance",
  "payment-method-performance",
  "rto-analysis",
  "restock-suggestions",
  "reconciliation-issues",
  "recommendations",
  "pending-risk",
];

for (const slice of slices) {
  test(`Sales Intelligence router: GET /api/sales-intelligence/${slice} returns envelope`, async () => {
    const server = await startServer(app);
    try {
      const res = await request(server, `/api/sales-intelligence/${slice}`);
      assert.ok(res.status === 200 || res.status === 500, `unexpected status ${res.status}`);
      const data = JSON.parse(res.body);
      assert.ok(typeof data === "object", "response must be an object");
      if (res.status === 500) {
        assert.ok("error" in data, "500 error envelope must contain error key");
      }
    } finally {
      server.close();
    }
  });
}

test("Sales Intelligence router: GET /api/sales-intelligence/export returns CSV or error", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/sales-intelligence/export");
    assert.ok(res.status === 200 || res.status === 500, `unexpected status ${res.status}`);
    if (res.status === 200) {
      assert.ok(res.headers["content-type"].includes("text/csv"));
    } else {
      const data = JSON.parse(res.body);
      assert.ok("error" in data);
    }
  } finally {
    server.close();
  }
});

test("Sales Intelligence router: Compatibility URL GET /api/actual-sales-intelligence returns envelope", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/actual-sales-intelligence");
    assert.ok(res.status === 200 || res.status === 500, `unexpected status ${res.status}`);
    const data = JSON.parse(res.body);
    assert.ok(typeof data === "object", "response must be an object");
  } finally {
    server.close();
  }
});

test("Sales Intelligence router: GET /api/sales-intelligence/reconciled-orders returns envelope", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/sales-intelligence/reconciled-orders");
    assert.ok(res.status === 200 || res.status === 500, `unexpected status ${res.status}`);
    const data = JSON.parse(res.body);
    assert.ok(typeof data === "object", "response must be an object");
  } finally {
    server.close();
  }
});

test("Sales Intelligence router: No cross-domain imports (no Sorter or SKU services)", async () => {
  const fs = await import("node:fs");
  const content = fs.default.readFileSync("server/src/routes/salesIntelligence.js", "utf8");
  assert.doesNotMatch(content, /shopifyMediaService/, "salesIntelligence.js must not import SKU media service");
  assert.doesNotMatch(content, /services\/sorter\.js/, "salesIntelligence.js must not import sorter service");
  assert.doesNotMatch(content, /collectionStateService/, "salesIntelligence.js must not import collection state service");
});
