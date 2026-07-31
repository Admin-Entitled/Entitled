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

test("diagnostics are bounded, redacted, and distinguish application and provider state", async () => {
  const server = app.listen(0);
  try {
    const shopify = await request(server, "/api/debug/shopify");
    const shiprocket = await request(server, "/api/debug/shiprocket");
    const diagnostics = await request(server, "/api/health/diagnostics");
    const shopifyData = JSON.parse(shopify.body);
    const shiprocketData = JSON.parse(shiprocket.body);
    const diagnosticsData = JSON.parse(diagnostics.body);

    assert.equal(shopify.status, 200);
    assert.match(shopifyData.status, /^(ok|not_configured|provider_error)$/);
    assert.equal(shiprocket.status, 200);
    assert.match(shiprocketData.status, /^(configured|not_configured)$/);
    assert.equal(diagnostics.status, 200);
    assert.match(diagnosticsData.status, /^(ok|degraded)$/);
    assert.deepEqual(diagnosticsData.application, { status: "ok", liveness: "ok" });
    assert.match(diagnosticsData.shopify.status, /^(ok|not_configured|provider_error)$/);
    assert.match(diagnosticsData.shiprocket.status, /^(configured|not_configured)$/);
    assert.ok(Buffer.byteLength(diagnostics.body) < 8192);
    assert.doesNotMatch(diagnostics.body, /shp(?:at|tka|ca|ua)_|Bearer\s+(?!\[REDACTED_TOKEN\])/i);
  } finally {
    server.close();
  }
});
