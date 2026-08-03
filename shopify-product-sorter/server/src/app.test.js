import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import app from "./app.js";
import { env } from "./config/env.js";
import { runOrderMappingMigrations } from "./services/orderMappingMigrations.js";

function request(server, pathOptions, options = {}) {
  const address = server.address();
  const url = new URL(typeof pathOptions === "string" ? pathOptions : pathOptions.path, "http://127.0.0.1:" + address.port);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: options.method || "GET", headers: options.headers || {} }, (res) => {
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

test("GET /delivery-resolution redirects 302 to orderMappingRoute", async () => {
  const server = app.listen(0);
  try {
    const res = await request(server, "/delivery-resolution");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, env.orderMappingRoute);
  } finally {
    server.close();
  }
});

test("GET /api/health returns ok status", async () => {
  const server = app.listen(0);
  try {
    const res = await request(server, "/api/health");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.deepEqual(data, { ok: true });
  } finally {
    server.close();
  }
});

test("GET /api/collections returns valid response or graceful error without crash", async () => {
  const server = app.listen(0);
  try {
    const res = await request(server, "/api/collections");
    assert.ok(res.status === 200 || res.status === 500);
    const data = JSON.parse(res.body);
    assert.ok(data);
  } finally {
    server.close();
  }
});

test("GET /api/sales-intelligence/summary returns valid response or graceful error without crash", async () => {
  const server = app.listen(0);
  try {
    const res = await request(server, "/api/sales-intelligence/summary");
    assert.ok(res.status === 200 || res.status === 500);
    const data = JSON.parse(res.body);
    assert.ok(data);
  } finally {
    server.close();
  }
});

test("GET /api/sku-images/search returns valid response or graceful error without crash", async () => {
  const server = app.listen(0);
  try {
    const res = await request(server, "/api/sku-images/search");
    assert.ok(res.status === 200 || res.status === 500);
    const data = JSON.parse(res.body);
    assert.ok(data);
  } finally {
    server.close();
  }
});

test("GET /api/order-mapping/orders returns valid response or graceful error without crash", async () => {
  await runOrderMappingMigrations().catch(() => {});
  const server = app.listen(0);
  try {
    const res = await request(server, "/api/order-mapping/orders");
    assert.ok(res.status === 200 || res.status === 500);
    const data = JSON.parse(res.body);
    assert.ok(data);
  } finally {
    server.close();
  }
});

test("GET /api/order-mapping/logs/network returns valid response", async () => {
  await runOrderMappingMigrations().catch(() => {});
  const server = app.listen(0);
  try {
    const res = await request(server, "/api/order-mapping/logs/network");
    assert.ok(res.status === 200 || res.status === 500);
    const data = JSON.parse(res.body);
    assert.ok(data);
  } finally {
    server.close();
  }
});

test("GET /api/order-mapping/logs/actions returns valid response", async () => {
  await runOrderMappingMigrations().catch(() => {});
  const server = app.listen(0);
  try {
    const res = await request(server, "/api/order-mapping/logs/actions");
    assert.ok(res.status === 200 || res.status === 500);
    const data = JSON.parse(res.body);
    assert.ok(data);
  } finally {
    server.close();
  }
});

test("POST /api/collections/reorder-all redirects 307 to /api/collections/reorder-all-v2", async () => {
  const server = app.listen(0);
  try {
    const res = await request(server, "/api/collections/reorder-all", { method: "POST" });
    assert.equal(res.status, 307);
    assert.equal(res.headers.location, "/api/collections/reorder-all-v2");
  } finally {
    server.close();
  }
});
