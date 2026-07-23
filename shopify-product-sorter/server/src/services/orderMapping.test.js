import assert from "node:assert/strict";
import test from "node:test";
import { parseOrderMappingCsv } from "./orderMappingCsv.js";
import { matchOrderMappingShipment, normalizeOrderMappingIdentifier } from "./orderMappingMatcher.js";
import { canApplyStatusUpdate, isTerminalOrderMappingStatus, normalizeOrderMappingStatus } from "./orderMappingStatus.js";

test("normalizes identifiers and shipment statuses", () => {
  assert.equal(normalizeOrderMappingIdentifier(" #ab-1 "), "AB-1");
  assert.equal(normalizeOrderMappingStatus("Delivered"), "DELIVERED_TO_CUSTOMER");
  assert.equal(normalizeOrderMappingStatus("RTO Delivered"), "RTO_DELIVERED");
  assert.equal(normalizeOrderMappingStatus("Undelivered-3rd Attempt"), "DELIVERY_ATTEMPTED");
  assert.equal(normalizeOrderMappingStatus("Weird status", "SHIPMENT_EXCEPTION"), "SHIPMENT_EXCEPTION");
  assert.equal(isTerminalOrderMappingStatus("DELIVERED_TO_CUSTOMER"), true);
});

test("matches strongest available identifiers", () => {
  const rows = [
    { shopify_order_id: "gid://shopify/Order/1", shopify_order_name: "#1001", shopify_order_number: "1001", awb: "AWB-1" },
  ];
  assert.equal(matchOrderMappingShipment({ shopifyOrderId: "gid://shopify/Order/1" }, rows).method, "shopify_order_id");
  assert.equal(matchOrderMappingShipment({ orderNumber: "#1001" }, rows).method, "shopify_order_number");
  assert.equal(matchOrderMappingShipment({ awb: "AWB-1" }, rows).method, "awb");
});

test("parses csv aliases and keeps deduped rows", () => {
  const parsed = parseOrderMappingCsv(
    "Order Number,Tracking Number,Shipment Status,Status Date,Remarks\n#1001,AWB1,Delivered,2026-01-01,done\n#1001,AWB1,Delivered,2026-01-01,done\n",
  );
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].normalizedStatus, "DELIVERED_TO_CUSTOMER");
});

test("prevents terminal downgrade and respects manual locks", () => {
  const current = {
    normalized_status: "DELIVERED_TO_CUSTOMER",
    status_source: "SHIPROCKET_API",
    status_timestamp: "2026-01-02T00:00:00Z",
    manual_override_lock: false,
  };
  assert.equal(
    canApplyStatusUpdate(current, {
      normalizedStatus: "IN_TRANSIT",
      source: "CSV_IMPORT",
      statusTimestamp: "2026-01-01T00:00:00Z",
    }),
    false,
  );

  assert.equal(
    canApplyStatusUpdate(
      {
        ...current,
        normalized_status: "UNDELIVERED",
        manual_override_lock: true,
      },
      {
        normalizedStatus: "OUT_FOR_DELIVERY",
        source: "SHIPROCKET_API",
        statusTimestamp: "2026-01-03T00:00:00Z",
      },
    ),
    false,
  );
});
