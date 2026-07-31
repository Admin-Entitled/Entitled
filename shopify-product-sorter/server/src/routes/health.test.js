import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import app from "../app.js";

function request(server, path) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${address.port}${path}`, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body }));
    }).on("error", reject);
  });
}

test("health and liveness report application status", async () => {
  const server = app.listen(0);
  try {
    for (const path of ["/api/health", "/api/health/liveness"]) {
      const response = await request(server, path);
      const data = JSON.parse(response.body);
      assert.equal(response.status, 200);
      assert.equal(data.ok, true);
      assert.equal(data.status, "ok");
      assert.ok(data.timestamp);
    }
  } finally {
    server.close();
  }
});

test("readiness reports database and configuration state", async () => {
  const server = app.listen(0);
  try {
    const response = await request(server, "/api/health/readiness");
    const data = JSON.parse(response.body);
    assert.equal(response.status, 200);
    assert.equal(data.status, "ready");
    assert.equal(data.db, "connected");
    assert.equal(typeof data.config.shopifyConfigured, "boolean");
    assert.equal(typeof data.config.shiprocketConfigured, "boolean");
    assert.equal(typeof data.config.sqlitePathConfigured, "boolean");
  } finally {
    server.close();
  }
});
