import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import app from "../app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, "../../../client/dist");
const distAvailable = fs.existsSync(path.join(clientDistPath, "index.html"));

function request(server, requestPath, options = {}) {
  const address = server.address();
  const url = new URL(requestPath, "http://127.0.0.1:" + address.port);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: options.method || "GET" }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

function listen(appInstance) {
  return new Promise((resolve) => {
    const server = appInstance.listen(0, () => resolve(server));
  });
}

test("unknown /api paths are not swallowed by the frontend fallback (FE-011)", async () => {
  const server = await listen(app);
  try {
    const res = await request(server, "/api/definitely-not-a-real-route");
    assert.notEqual(res.status, 200, "unknown API paths must not serve the SPA shell");
    assert.ok(!res.body.includes('id="root"'), "SPA shell must not be served for unknown API paths");
  } finally {
    server.close();
  }
});

test("legacy /delivery-resolution compatibility entry redirects to /order-mapping (FE-011)", async () => {
  const server = await listen(app);
  try {
    const res = await request(server, "/delivery-resolution");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/order-mapping");
  } finally {
    server.close();
  }
});

test("direct frontend URL /order-mapping is served by the SPA fallback (FE-011)", async (t) => {
  if (!distAvailable) {
    t.skip("client/dist not built; SPA fallback not registered");
    return;
  }
  const server = await listen(app);
  try {
    const res = await request(server, "/order-mapping");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"] || "", /text\/html/);
  } finally {
    server.close();
  }
});

test("unknown frontend routes fail safely to the SPA shell (FE-011)", async (t) => {
  if (!distAvailable) {
    t.skip("client/dist not built; SPA fallback not registered");
    return;
  }
  const server = await listen(app);
  try {
    const res = await request(server, "/some/unknown/frontend/route");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"] || "", /text\/html/);
  } finally {
    server.close();
  }
});
