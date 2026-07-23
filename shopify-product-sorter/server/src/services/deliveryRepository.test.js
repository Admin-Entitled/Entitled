import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
process.env.ORDER_MAPPING_SCHEMA = `order_mapping_test_${Date.now()}`;

const { Pool } = await import("pg");
const { closeOrderMappingPool } = await import("./orderMappingDb.js");
const { runOrderMappingMigrations } = await import("./orderMappingMigrations.js");
const repository = await import("./orderMappingRepository.js");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

test.before(async () => {
  await runOrderMappingMigrations();
});

test.after(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS "${process.env.ORDER_MAPPING_SCHEMA}" CASCADE`);
  await pool.end();
  await closeOrderMappingPool();
});

test("Postgres upserts one order and blocks terminal downgrade", async () => {
  const order = {
    shopifyOrderId: "gid://shopify/Order/1",
    shopifyOrderName: "#1001",
    shopifyOrderNumber: "1001",
    orderDate: "2026-01-01T00:00:00Z",
    customerName: "Asha",
    customerPhone: "9999999999",
    shopifyFulfillmentStatus: "FULFILLED",
    cancellationStatus: null,
    shopifyUpdatedAt: "2026-01-01T00:00:00Z",
    latestFulfillment: {},
    shipments: [
      { shopifyFulfillmentId: "fulfillment-1", awb: "AWB1", shopifyTrackingNumber: "AWB1", courier: "BlueDart", latestProviderPayload: {} },
      { shopifyFulfillmentId: "fulfillment-2", awb: "AWB2", shopifyTrackingNumber: "AWB2", courier: "BlueDart", latestProviderPayload: {} },
    ],
  };

  await repository.upsertShopifyOrders([order, order]);
  const listed = await repository.listOrderMappings({ pageSize: 20 });
  assert.equal(listed.total, 1);
  const details = await repository.getOrderMappingDetails(listed.orders[0].id);
  assert.equal(details.shipments.length, 2);

  const firstShipment = details.shipments[0];
  const delivered = await repository.applyShipmentUpdate(firstShipment.id, {
    normalizedStatus: "DELIVERED_TO_CUSTOMER",
    rawStatus: "Delivered",
    source: "SHIPROCKET_API",
    statusTimestamp: "2026-01-02T00:00:00Z",
  });
  assert.equal(delivered.applied, true);

  const blocked = await repository.applyShipmentUpdate(firstShipment.id, {
    normalizedStatus: "IN_TRANSIT",
    rawStatus: "In Transit",
    source: "CSV_IMPORT",
    statusTimestamp: "2026-01-01T12:00:00Z",
  });
  assert.equal(blocked.applied, false);
});

test("manual lock blocks later automatic updates", async () => {
  const listed = await repository.listOrderMappings({ pageSize: 20 });
  const details = await repository.getOrderMappingDetails(listed.orders[0].id);
  const shipment = details.shipments[1];

  await repository.applyShipmentUpdate(shipment.id, {
    normalizedStatus: "IN_TRANSIT",
    rawStatus: "In Transit",
    source: "SHIPROCKET_API",
    statusTimestamp: "2026-01-03T00:00:00Z",
  });

  await repository.setManualShipmentStatus(shipment.id, {
    normalizedStatus: "UNDELIVERED",
    rawStatus: "Customer unavailable",
    effectiveAt: "2026-01-03T12:00:00Z",
    remarks: "Manual call",
    locked: true,
  });

  const blocked = await repository.applyShipmentUpdate(shipment.id, {
    normalizedStatus: "OUT_FOR_DELIVERY",
    rawStatus: "Out for Delivery",
    source: "SHIPROCKET_API",
    statusTimestamp: "2026-01-04T00:00:00Z",
  });
  assert.equal(blocked.applied, false);

  await repository.clearManualShipmentStatus(shipment.id);
  const allowed = await repository.applyShipmentUpdate(shipment.id, {
    normalizedStatus: "OUT_FOR_DELIVERY",
    rawStatus: "Out for Delivery",
    source: "SHIPROCKET_API",
    statusTimestamp: "2026-01-04T00:00:00Z",
  });
  assert.equal(allowed.applied, true);
});
