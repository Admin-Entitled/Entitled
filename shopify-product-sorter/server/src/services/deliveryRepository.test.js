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

test("default Shopify sync window backfills full order history", async () => {
  const window = await repository.getLatestShopifySyncWindow();

  assert.equal(window.start, "2000-01-01");
  assert.match(window.end, /^\d{4}-\d{2}-\d{2}$/);
});

test("preserves order amount through Shiprocket updates and aggregates delivered totals by date", async () => {
  await repository.upsertShopifyOrders([
    {
      shopifyOrderId: "gid://shopify/Order/paid-1",
      shopifyOrderName: "#2001",
      shopifyOrderNumber: "2001",
      orderDate: "2026-07-20T10:00:00Z",
      customerName: "Paid Order",
      customerPhone: "",
      shopifyFulfillmentStatus: "UNFULFILLED",
      cancellationStatus: null,
      shopifyUpdatedAt: "2026-07-20T10:00:00Z",
      latestFulfillment: {},
      shipments: [
        {
          shopifyFulfillmentId: null,
          awb: "",
          shopifyTrackingNumber: "",
          courier: "",
          latestProviderPayload: { total: "250.00", order_total: "250.00" },
        },
      ],
    },
  ]);

  const listed = await repository.listOrderMappings({ search: "#2001", queue: "ALL", pageSize: 10 });
  const details = await repository.getOrderMappingDetails(listed.orders[0].id);

  await repository.applyShipmentUpdate(details.shipments[0].id, {
    normalizedStatus: "DELIVERED_TO_CUSTOMER",
    rawStatus: "Delivered",
    source: "SHIPROCKET_API",
    statusTimestamp: "2026-07-20T12:00:00Z",
    latestProviderPayload: { courier_name: "Delhivery" },
  });

  const refreshed = await repository.listOrderMappings({
    search: "#2001",
    queue: "ALL",
    pageSize: 10,
    startDate: "2026-07-20T00:00:00Z",
    endDate: "2026-07-20T23:59:59Z",
  });

  assert.equal(refreshed.orders[0].order_amount, "250.00");
  assert.equal(refreshed.deliveredAmountTotal, "250.00");
});

test("falls back to Shopify order total when Shiprocket amount is missing", async () => {
  await repository.upsertShopifyOrders([
    {
      shopifyOrderId: "gid://shopify/Order/shopify-total-1",
      shopifyOrderName: "#2002",
      shopifyOrderNumber: "2002",
      orderDate: "2026-07-21T10:00:00Z",
      customerName: "Shopify Total",
      customerPhone: "",
      shopifyFulfillmentStatus: "FULFILLED",
      cancellationStatus: null,
      shopifyUpdatedAt: "2026-07-21T10:00:00Z",
      latestFulfillment: { order_total: "999.00" },
      shipments: [
        {
          shopifyFulfillmentId: "fulfillment-2002",
          awb: "AWB-2002",
          shopifyTrackingNumber: "AWB-2002",
          courier: "BlueDart",
          latestProviderPayload: { trackingUrl: "https://example.com/2002" },
        },
      ],
    },
  ]);

  const listed = await repository.listOrderMappings({ search: "#2002", queue: "ALL", pageSize: 10 });

  assert.equal(listed.orders[0].order_amount, "999.00");
});

test("manual lock blocks later automatic updates", async () => {
  const listed = await repository.listOrderMappings({ search: "#1001", queue: "ALL", pageSize: 20 });
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

test("includes orders without an AWB in Shiprocket channel-order lookup", async () => {
  await repository.upsertShopifyOrders([
    {
      shopifyOrderId: "gid://shopify/Order/1243",
      shopifyOrderName: "#1243",
      shopifyOrderNumber: "1243",
      orderDate: "2026-07-23T13:57:00Z",
      customerName: "Hasmeet Singh",
      customerPhone: "",
      shopifyFulfillmentStatus: "UNFULFILLED",
      cancellationStatus: null,
      shopifyUpdatedAt: "2026-07-23T13:57:00Z",
      latestFulfillment: {},
      shipments: [
        {
          shopifyFulfillmentId: null,
          awb: "",
          shopifyTrackingNumber: "",
          courier: "",
          latestProviderPayload: {},
        },
      ],
    },
  ]);

  const eligible = await repository.listEligibleShipmentsForRefresh();
  const shipment = eligible.find((candidate) => candidate.shopify_order_number === "1243");

  assert.ok(shipment);

  await repository.setManualShipmentStatus(shipment.id, {
    normalizedStatus: "UNDELIVERED",
    rawStatus: "Customer unavailable",
    effectiveAt: "2026-07-23T14:00:00Z",
    remarks: "Manual call",
    locked: true,
  });
  const blocked = await repository.applyShipmentUpdate(shipment.id, {
    normalizedStatus: "MANIFESTED",
    rawStatus: "NEW",
    source: "SHIPROCKET_API",
    statusTimestamp: "2026-07-23T14:01:00Z",
    shiprocketResponseId: "1467080080",
    shiprocketOrderReference: "1470851718",
    shiprocketChannelReference: "1243",
  });
  const details = await repository.getOrderMappingDetails(shipment.order_id);
  const listed = await repository.listOrderMappings({ pageSize: 500 });

  assert.equal(blocked.applied, false);
  assert.equal(details.shipments[0].shiprocket_channel_reference, "1243");
  assert.equal(listed.pageSize, 500);
});

test("moves a Shiprocket match from a placeholder to its tracked shipment", async () => {
  const order = {
    shopifyOrderId: "gid://shopify/Order/1236",
    shopifyOrderName: "#1236",
    shopifyOrderNumber: "1236",
    orderDate: "2026-07-22T19:37:00Z",
    customerName: "Arnav",
    customerPhone: "",
    shopifyFulfillmentStatus: "UNFULFILLED",
    cancellationStatus: null,
    shopifyUpdatedAt: "2026-07-22T19:37:00Z",
    latestFulfillment: {},
    shipments: [
      {
        shopifyFulfillmentId: null,
        awb: "",
        shopifyTrackingNumber: "",
        courier: "",
        latestProviderPayload: {},
      },
    ],
  };

  await repository.upsertShopifyOrders([order]);
  const listed = await repository.listOrderMappings({ search: "#1236" });
  const initial = await repository.getOrderMappingDetails(listed.orders[0].id);
  await repository.applyShipmentUpdate(initial.shipments[0].id, {
    normalizedStatus: "MANIFESTED",
    rawStatus: "NEW",
    source: "SHIPROCKET_API",
    statusTimestamp: "2026-07-22T19:38:00Z",
    shiprocketResponseId: "1463827916",
    shiprocketOrderReference: "1467597998",
    shiprocketChannelReference: "1236",
  });

  await repository.upsertShopifyOrders([
    {
      ...order,
      shopifyFulfillmentStatus: "FULFILLED",
      shopifyUpdatedAt: "2026-07-23T00:00:00Z",
      shipments: [
        {
          shopifyFulfillmentId: "gid://shopify/Fulfillment/1236",
          awb: "77888000164",
          shopifyTrackingNumber: "77888000164",
          courier: "Blue Dart Surface",
          latestProviderPayload: {},
        },
      ],
    },
  ]);
  const updated = await repository.getOrderMappingDetails(listed.orders[0].id);
  const tracked = updated.shipments.find((shipment) => shipment.awb === "77888000164");
  await repository.setManualShipmentStatus(tracked.id, {
    normalizedStatus: "UNDELIVERED",
    rawStatus: "Customer unavailable",
    effectiveAt: "2026-07-23T00:00:30Z",
    remarks: "Manual call",
    locked: true,
  });
  const applied = await repository.applyShipmentUpdate(tracked.id, {
    awb: "77888000164",
    normalizedStatus: "IN_TRANSIT",
    rawStatus: "IN TRANSIT",
    source: "SHIPROCKET_API",
    statusTimestamp: "2026-07-23T00:01:00Z",
    shiprocketResponseId: "1463827916",
    shiprocketOrderReference: "1467597998",
    shiprocketChannelReference: "1236",
  });
  const finalDetails = await repository.getOrderMappingDetails(listed.orders[0].id);

  assert.equal(applied.applied, false);
  assert.equal(
    finalDetails.shipments.filter((shipment) => shipment.shiprocket_response_id === "1463827916").length,
    1,
  );
  assert.equal(
    finalDetails.shipments.find((shipment) => shipment.shiprocket_response_id === "1463827916").awb,
    "77888000164",
  );
});

test("does not send cancelled Shopify orders to Shiprocket", async () => {
  await repository.upsertShopifyOrders([
    {
      shopifyOrderId: "gid://shopify/Order/1244",
      shopifyOrderName: "#1244",
      shopifyOrderNumber: "1244",
      orderDate: "2026-07-23T15:00:00Z",
      customerName: "Cancelled Customer",
      customerPhone: "",
      shopifyFulfillmentStatus: "UNFULFILLED",
      cancellationStatus: "2026-07-23T15:05:00Z",
      shopifyUpdatedAt: "2026-07-23T15:05:00Z",
      latestFulfillment: {},
      shipments: [
        {
          shopifyFulfillmentId: null,
          awb: "",
          shopifyTrackingNumber: "",
          courier: "",
          latestProviderPayload: {},
        },
      ],
    },
  ]);

  const eligible = await repository.listEligibleShipmentsForRefresh({ force: true });
  const listed = await repository.listOrderMappings({ search: "#1244" });

  assert.equal(eligible.some((shipment) => shipment.shopify_order_number === "1244"), false);
  assert.equal(listed.orders[0].cancellation_status, "2026-07-23T15:05:00Z");
  assert.equal(listed.orders[0].normalized_status, "CANCELLED");
  assert.equal(listed.orders[0].status_source, "SHOPIFY");
});
