import assert from "node:assert/strict";
import test from "node:test";
import { findShipment, normalizeIdentifier } from "./orderMatcher.js";
import { mapLegacyStatus, mapShiprocketStatus } from "./statusMapper.js";
import { parseLegacyCsv } from "./legacyCsv.js";

test("matches strictly by normalized order references, then AWB", () => {
  assert.equal(normalizeIdentifier(" # ab 1 "), "AB 1");
  assert.equal(findShipment({ name: "#1001", awb: "AWB-1" }, [{ channelOrderId: "1001" }]).match.channelOrderId, "1001");
  assert.equal(findShipment({ name: "#1001", awb: "AWB-1" }, [{ awb: "AWB-1" }]).match.awb, "AWB-1");
  assert.equal(findShipment({ name: "#1001" }, [{ channelOrderId: "10010" }]).reason, "no_match");
  assert.equal(findShipment({ name: "#1001" }, [{ channelOrderId: "1001" }, { channelOrderId: "#1001" }]).reason, "ambiguous");
});

test("maps only known logistics statuses", () => {
  assert.equal(mapShiprocketStatus("Delivered"), "DELIVERED");
  assert.equal(mapShiprocketStatus("RTO Delivered"), "NOT_DELIVERED");
  assert.equal(mapShiprocketStatus("Cancelled"), "NOT_DELIVERED");
  assert.equal(mapShiprocketStatus("In Transit"), "NOT_DELIVERED");
  assert.equal(mapShiprocketStatus("Maybe delivered"), "UNRESOLVED");
  assert.equal(mapLegacyStatus("Successfully Delivered"), "DELIVERED");
});

test("parses common CSV aliases and rejects missing reconciliation fields", () => {
  const parsed = parseLegacyCsv("Order Number,AWB,Courier Status,Delivered Date\n#1001,A1,Delivered,2026-01-01\n#1001,A1,Delivered,2026-01-01\n");
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].orderNumber, "#1001");
  assert.throws(() => parseLegacyCsv("Customer,Name\nA,B\n"), /required reconciliation columns/i);
});
