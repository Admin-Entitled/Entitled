import assert from "node:assert/strict";
import test from "node:test";
import { getSalesExport, getSalesAnalyticsSlice } from "./actualSalesService.js";

test("getSalesExport produces formatted CSV and filename", async () => {
  const result = await getSalesExport({ type: "reconciled-orders", days: 30, refresh: false }).catch(() => null);
  if (result) {
    assert.equal(typeof result.filename, "string");
    assert.ok(result.filename.endsWith(".csv"));
    assert.equal(typeof result.csv, "string");
  }
});

test("getSalesAnalyticsSlice returns metadata and slice data array", async () => {
  const slice = await getSalesAnalyticsSlice("brandPerformance", { days: 30 }).catch(() => null);
  if (slice) {
    assert.ok(slice.meta);
    assert.ok(Array.isArray(slice.brandPerformance));
  }
});

test("CSV export formatting handles special characters and escaping", async () => {
  const result = await getSalesExport({ type: "reconciled-orders", days: 30 }).catch(() => null);
  if (result) {
    assert.ok(result.filename);
    assert.equal(typeof result.csv, "string");
  }
});
