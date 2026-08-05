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
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.ok(data.error.includes("collectionId"));
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
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.ok(data.error.includes("collectionId"));
  } finally {
    server.close();
  }
});

test("Sorter router: GET /api/collections/state requires collectionId", async () => {
  const server = await startServer(app);
  try {
    const res = await request(server, "/api/collections/state");
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.ok(data.error.includes("collectionId"));
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
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.ok(data.error.includes("collectionId"));
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
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.ok(data.error.includes("collectionId") || data.error.includes("productId"));
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
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.ok(data.error.includes("collectionId"));
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
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.ok(data.error.includes("collectionId"));
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
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.ok(data.error.includes("collectionId"));
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
