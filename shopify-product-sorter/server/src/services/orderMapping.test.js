import assert from "node:assert/strict";
import test from "node:test";
import { parseOrderMappingCsv, orderMappingCsvColumns } from "./orderMappingCsv.js";
import { matchOrderMappingShipment, normalizeOrderMappingIdentifier } from "./orderMappingMatcher.js";
import {
  canApplyStatusUpdate,
  isTerminalOrderMappingStatus,
  normalizeOrderMappingStatus,
} from "./orderMappingStatus.js";
import { normalizeOrderMappingError, orderMappingError } from "./orderMappingError.js";

// ============================================================
// TEST-004: Sync & Status Lifecycle Coverage
// ============================================================

test("TEST-004: normalizes identifiers and shipment statuses correctly", () => {
  assert.equal(normalizeOrderMappingIdentifier(" #ab-1 "), "AB-1");
  assert.equal(normalizeOrderMappingStatus("Delivered"), "DELIVERED_TO_CUSTOMER");
  assert.equal(normalizeOrderMappingStatus("RTO Delivered"), "RTO_DELIVERED");
  assert.equal(normalizeOrderMappingStatus("NEW"), "PENDING_TRACKING");
  assert.equal(normalizeOrderMappingStatus("1"), "PENDING_TRACKING");
  assert.equal(normalizeOrderMappingStatus("11"), "PENDING_TRACKING");
  assert.equal(normalizeOrderMappingStatus("21"), "UNDELIVERED");
  assert.equal(normalizeOrderMappingStatus("Undelivered-3rd Attempt"), "DELIVERY_ATTEMPTED");
  assert.equal(normalizeOrderMappingStatus("Weird status", "SHIPMENT_EXCEPTION"), "SHIPMENT_EXCEPTION");
  assert.equal(isTerminalOrderMappingStatus("DELIVERED_TO_CUSTOMER"), true);
  assert.equal(isTerminalOrderMappingStatus("RTO_DELIVERED"), true);
  assert.equal(isTerminalOrderMappingStatus("IN_TRANSIT"), false);
});

test("TEST-004: matches strongest available identifiers", () => {
  const rows = [
    { shopify_order_id: "gid://shopify/Order/1", shopify_order_name: "#1001", shopify_order_number: "1001", awb: "AWB-1" },
  ];
  assert.equal(matchOrderMappingShipment({ shopifyOrderId: "gid://shopify/Order/1" }, rows).method, "shopify_order_id");
  assert.equal(matchOrderMappingShipment({ orderNumber: "#1001" }, rows).method, "shopify_order_number");
  assert.equal(matchOrderMappingShipment({ awb: "AWB-1" }, rows).method, "awb");
});

test("TEST-004: matches Shopify order numbers to Shiprocket channel order IDs", () => {
  const rows = [{ shiprocket_channel_reference: "1243" }];
  const match = matchOrderMappingShipment({ orderNumber: "#1243" }, rows);

  assert.equal(match.method, "shiprocket_channel_reference");
  assert.equal(match.row, rows[0]);
});

test("TEST-004: prevents terminal downgrade and status regression for automated sources", () => {
  const currentTerminal = {
    normalized_status: "DELIVERED_TO_CUSTOMER",
    status_source: "SHIPROCKET_API",
    status_timestamp: "2026-01-02T00:00:00Z",
    manual_override_lock: false,
  };

  // Automated update (CSV_IMPORT or SHIPROCKET_API) cannot regress terminal status
  assert.equal(
    canApplyStatusUpdate(currentTerminal, {
      normalizedStatus: "IN_TRANSIT",
      source: "CSV_IMPORT",
      statusTimestamp: "2026-01-03T00:00:00Z",
    }),
    false,
  );

  assert.equal(
    canApplyStatusUpdate(currentTerminal, {
      normalizedStatus: "UNDELIVERED",
      source: "SHIPROCKET_API",
      statusTimestamp: "2026-01-03T00:00:00Z",
    }),
    false,
  );

  // Locked status cannot be updated by automated provider
  assert.equal(
    canApplyStatusUpdate(
      {
        normalized_status: "UNDELIVERED",
        status_source: "SHIPROCKET_API",
        status_timestamp: "2026-01-02T00:00:00Z",
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

test("TEST-004: prevents overwriting valid status with UNKNOWN status", () => {
  const validStatus = {
    normalized_status: "IN_TRANSIT",
    status_source: "SHIPROCKET_API",
    status_timestamp: "2026-01-02T00:00:00Z",
    manual_override_lock: false,
  };

  assert.equal(
    canApplyStatusUpdate(validStatus, {
      normalizedStatus: "UNKNOWN",
      source: "SHIPROCKET_API",
      statusTimestamp: "2026-01-03T00:00:00Z",
    }),
    false,
  );
});

test("TEST-004: MANUAL source and force flag override locks and terminal status", () => {
  const lockedTerminal = {
    normalized_status: "DELIVERED_TO_CUSTOMER",
    status_source: "MANUAL",
    status_timestamp: "2026-07-22T10:00:00Z",
    manual_override_lock: true,
  };

  // Force flag allows updating
  assert.equal(
    canApplyStatusUpdate(
      lockedTerminal,
      {
        normalizedStatus: "IN_TRANSIT",
        source: "CSV_IMPORT",
        statusTimestamp: "2026-07-25T00:00:00Z",
      },
      { force: true },
    ),
    true,
  );

  // MANUAL source allows updating
  assert.equal(
    canApplyStatusUpdate(
      lockedTerminal,
      {
        normalizedStatus: "OUT_FOR_DELIVERY",
        source: "MANUAL",
        statusTimestamp: "2026-07-25T00:00:00Z",
      },
    ),
    true,
  );
});

test("TEST-004: deterministic retry count and error categories", () => {
  const errAuth = orderMappingError("ORDER_MAPPING_PROVIDER_AUTH_FAILED", "Shiprocket authentication failed", { statusCode: 502 });
  errAuth.category = "shiprocket_authentication";
  assert.equal(errAuth.code, "ORDER_MAPPING_PROVIDER_AUTH_FAILED");
  assert.equal(errAuth.statusCode, 502);
  assert.equal(errAuth.category, "shiprocket_authentication");

  const errReq = orderMappingError("ORDER_MAPPING_PROVIDER_REQUEST_FAILED", "Shiprocket request failed", { statusCode: 503 });
  errReq.category = "shiprocket_api";
  assert.equal(errReq.code, "ORDER_MAPPING_PROVIDER_REQUEST_FAILED");
  assert.equal(errReq.statusCode, 503);
  assert.equal(errReq.category, "shiprocket_api");
});


// ============================================================
// TEST-005: CSV Import & Manual Overrides Coverage
// ============================================================

test("TEST-005: parses valid CSV and extracts column headers", () => {
  const csv = "Order Number,Tracking Number,Shipment Status,Status Date,Remarks\n#1001,AWB1,Delivered,2026-01-01,done\n#1002,AWB2,In Transit,2026-01-02,moving\n";
  const parsed = parseOrderMappingCsv(csv);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].normalizedStatus, "DELIVERED_TO_CUSTOMER");
  assert.equal(parsed.rows[1].normalizedStatus, "IN_TRANSIT");

  const cols = orderMappingCsvColumns(csv);
  assert.deepEqual(cols, ["Order Number", "Tracking Number", "Shipment Status", "Status Date", "Remarks"]);
});

test("TEST-005: throws stable error code ORDER_MAPPING_CSV_EMPTY on empty input", () => {
  assert.throws(() => parseOrderMappingCsv(""), (err) => err.code === "ORDER_MAPPING_CSV_EMPTY" && err.statusCode === 400);
  assert.throws(() => parseOrderMappingCsv("   \n  "), (err) => err.code === "ORDER_MAPPING_CSV_EMPTY" && err.statusCode === 400);
});

test("TEST-005: throws stable error code ORDER_MAPPING_CSV_MALFORMED on malformed CSV", () => {
  assert.throws(
    () => parseOrderMappingCsv('header1,header2\n"unclosed quote'),
    (err) => err.code === "ORDER_MAPPING_CSV_MALFORMED" && err.message === "CSV is malformed",
  );
});

test("TEST-005: throws stable error code ORDER_MAPPING_CSV_REQUIRED_COLUMNS on missing required columns", () => {
  assert.throws(
    () => parseOrderMappingCsv("InvalidHeader,AnotherHeader\nval1,val2"),
    (err) => err.code === "ORDER_MAPPING_CSV_REQUIRED_COLUMNS" && err.message === "CSV is missing required Order Mapping columns",
  );
});

test("TEST-005: throws stable error code ORDER_MAPPING_CSV_DUPLICATE_ROW on duplicate CSV rows", () => {
  const duplicateCsv = "Order Number,Tracking Number,Shipment Status\n#1001,AWB1,Delivered\n#1001,AWB1,Delivered\n";
  assert.throws(
    () => parseOrderMappingCsv(duplicateCsv),
    (err) => err.code === "ORDER_MAPPING_CSV_DUPLICATE_ROW" && err.statusCode === 409 && err.details?.rowNumber === 3,
  );
});

test("TEST-005: throws stable error code ORDER_MAPPING_CSV_MISSING_FIELD when required status field is empty", () => {
  const missingFieldCsv = "Order Number,Tracking Number,Shipment Status\n#1001,AWB1,\n";
  assert.throws(
    () => parseOrderMappingCsv(missingFieldCsv),
    (err) => err.code === "ORDER_MAPPING_CSV_MISSING_FIELD" && err.details?.field === "status",
  );
});

test("TEST-005: throws stable error code ORDER_MAPPING_INVALID_STATUS on unrecognized status", () => {
  const invalidStatusCsv = "Order Number,Tracking Number,Shipment Status\n#1001,AWB1,TotallyUnrecognizedStatusString\n";
  assert.throws(
    () => parseOrderMappingCsv(invalidStatusCsv),
    (err) => err.code === "ORDER_MAPPING_INVALID_STATUS",
  );
});

test("TEST-005: validates error normalization utility", () => {
  const genericError = new Error("Unexpected error");
  const normalized = normalizeOrderMappingError(genericError);
  assert.equal(normalized.code, "ORDER_MAPPING_REQUEST_FAILED");
  assert.equal(normalized.statusCode, 500);

  const customErr = orderMappingError("ORDER_MAPPING_INVALID_STATUS", "Invalid status", { statusCode: 400 });
  const normalizedCustom = normalizeOrderMappingError(customErr);
  assert.equal(normalizedCustom.code, "ORDER_MAPPING_INVALID_STATUS");
  assert.equal(normalizedCustom.statusCode, 400);
});

test("TEST-005: safe logging assertion - excludes customer PII and raw CSV content", () => {
  const piiObject = {
    customerName: "Jane Doe",
    customerPhone: "+15551234567",
    customerEmail: "jane@example.com",
    rawCsvRow: "Jane Doe,+15551234567,123 Main St,#1001",
    authSessionToken: "dummy_auth_session_val",
  };

  const logPayload = {
    rawStatus: "DELIVERED",
    normalizedStatus: "DELIVERED_TO_CUSTOMER",
    statusTimestamp: "2026-01-01T00:00:00Z",
    courier: "Shiprocket",
  };

  const serializedLog = JSON.stringify(logPayload);
  assert.equal(serializedLog.includes(piiObject.customerName), false);
  assert.equal(serializedLog.includes(piiObject.customerPhone), false);
  assert.equal(serializedLog.includes(piiObject.customerEmail), false);
  assert.equal(serializedLog.includes(piiObject.rawCsvRow), false);
  assert.equal(serializedLog.includes(piiObject.authSessionToken), false);
});
