import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.SQLITE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "delivery-test-")), "app.db");
const repository = await import("./deliveryRepository.js");

const shopifyOrder = { id: "gid://shopify/Order/1", name: "#1001", number: "1001", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", customerName: "Asha", awb: "AWB1", fulfillmentStatus: "FULFILLED", cancelledAt: null };

test("sync upserts and never overwrites a manual decision", () => {
  repository.upsertShopifyOrders([shopifyOrder, shopifyOrder]);
  let order = repository.listOrders({ pageSize: 10 }).orders[0];
  repository.saveAutomaticResolution(order.id, { resolution: "DELIVERED", source: "SHIPROCKET", rawStatus: "Delivered", responseId: "shipment-1" });
  repository.setManualResolution(order.id, "NOT_DELIVERED", "proof missing");
  repository.saveAutomaticResolution(order.id, { resolution: "DELIVERED", source: "SHIPROCKET", rawStatus: "Delivered", responseId: "shipment-1" });
  order = repository.listOrders({ pageSize: 10 }).orders[0];
  assert.equal(order.resolution_source, "MANUAL");
  assert.equal(order.resolution, "NOT_DELIVERED");
  repository.resetManualResolution(order.id);
  order = repository.listOrders({ pageSize: 10 }).orders[0];
  assert.equal(order.resolution_source, "SHIPROCKET");
  assert.equal(order.resolution, "DELIVERED");
});
