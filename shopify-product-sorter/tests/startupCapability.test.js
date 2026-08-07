import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import app from "../server/src/app.js";
import { env } from "../server/src/config/env.js";
import { runOrderMappingMigrations } from "../server/src/services/orderMappingMigrations.js";
import { isOrderMappingAvailable } from "../server/src/services/orderMappingDb.js";

function startServer(appInstance) {
  return new Promise((resolve, reject) => {
    const server = appInstance.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

function request(server, path, options = {}) {
  const address = server.address();
  const url = new URL(path, "http://127.0.0.1:" + address.port);
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

test("Missing DATABASE_URL: migrations skip and backend routes respond safely", async () => {
  const origDbUrl = env.databaseUrl;
  env.databaseUrl = "";

  try {
    const migrationResult = await runOrderMappingMigrations();
    assert.equal(migrationResult, false, "runOrderMappingMigrations should return false when DATABASE_URL is absent");
    assert.equal(isOrderMappingAvailable(), false);

    const server = await startServer(app);
    try {
      // Product Sorter / general API route remains available
      const healthRes = await request(server, "/api/health");
      assert.equal(healthRes.status, 200);

      // Order Mapping route returns 503 ORDER_MAPPING_UNAVAILABLE
      const omRes = await request(server, "/api/order-mapping/orders");
      assert.equal(omRes.status, 503);
      const omBody = JSON.parse(omRes.body);
      assert.equal(omBody.code, "ORDER_MAPPING_UNAVAILABLE");
      assert.equal(omBody.success, false);
      assert.ok(!JSON.stringify(omBody).includes("postgres"));
      assert.ok(!JSON.stringify(omBody).includes("localhost"));

      // Readiness reports degraded state safely
      const readyRes = await request(server, "/api/health/readiness");
      assert.equal(readyRes.status, 200);
      const readyBody = JSON.parse(readyRes.body);
      assert.equal(readyBody.orderMapping.available, false);
      assert.equal(readyBody.orderMapping.status, "unavailable");
      assert.equal(readyBody.orderMapping.reasonCategory, "configuration_missing");
    } finally {
      server.close();
    }
  } finally {
    env.databaseUrl = origDbUrl;
  }
});

test("DATABASE_URL present but connection fails: migration error is fatal", async () => {
  const origDbUrl = env.databaseUrl;
  // Point to a non-existent port to force connection failure
  env.databaseUrl = "postgres://postgres:postgres@127.0.0.1:59999/order_mapping";

  try {
    await assert.rejects(
      async () => {
        await runOrderMappingMigrations();
      },
      (err) => {
        assert.ok(err);
        assert.notEqual(err.message, "Missing DATABASE_URL for Order Mapping");
        return true;
      }
    );
  } finally {
    env.databaseUrl = origDbUrl;
  }
});
