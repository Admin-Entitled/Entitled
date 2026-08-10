import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertSafeExpensesTestTarget,
  configureIsolatedOrderMappingTestSchema,
  countRowsInSchemaTable,
  dropIsolatedOrderMappingSchema,
} from "../test/orderMappingTestIsolation.js";

const testSchema = configureIsolatedOrderMappingTestSchema("order-expense-import");

const { runOrderMappingMigrations } = await import("./orderMappingMigrations.js");
const { closeOrderMappingPool, orderMappingQuery } = await import("./orderMappingDb.js");
const { upsertShopifyOrders, listOrderMappings, getOrderMappingDetails } = await import("./orderMappingRepository.js");
const {
  confirmShiprocketPassbookImport,
  getShiprocketPassbookImportDetails,
  listShiprocketPassbookImports,
  previewShiprocketPassbookImport,
} = await import("./orderExpenseImportService.js");

test.before(async () => {
  assertSafeExpensesTestTarget();
  await runOrderMappingMigrations();
});

test.after(async () => {
  await closeOrderMappingPool();
  await dropIsolatedOrderMappingSchema(testSchema);
});

async function createUploadFile(name, contents) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shiprocket-passbook-test-"));
  const filePath = path.join(tempDir, name);
  await fs.writeFile(filePath, contents);
  const stat = await fs.stat(filePath);
  return {
    originalname: name,
    mimetype: "text/csv",
    path: filePath,
    size: stat.size,
  };
}

async function seedOrders() {
  await upsertShopifyOrders([
    {
      shopifyOrderId: "gid://shopify/Order/1001",
      shopifyOrderName: "#1001",
      shopifyOrderNumber: "1001",
      orderDate: "2026-07-01T00:00:00Z",
      customerName: "Alpha",
      shopifyUpdatedAt: "2026-07-01T00:00:00Z",
      shipments: [{ awb: "AWB-1", shopifyTrackingNumber: "AWB-1", courier: "Delhivery", latestProviderPayload: {} }],
      latestFulfillment: {},
    },
    {
      shopifyOrderId: "gid://shopify/Order/2002",
      shopifyOrderName: "#2002",
      shopifyOrderNumber: "2002",
      orderDate: "2026-07-02T00:00:00Z",
      customerName: "Beta",
      shopifyUpdatedAt: "2026-07-02T00:00:00Z",
      shipments: [{ awb: "AWB-2", shopifyTrackingNumber: "AWB-2", courier: "Ecom", latestProviderPayload: {} }],
      latestFulfillment: {},
    },
  ]);

  await orderMappingQuery(
    `
      UPDATE "${testSchema}"."shipments"
      SET shiprocket_response_id = CASE awb
        WHEN 'AWB-1' THEN 'SHIP-1'
        WHEN 'AWB-2' THEN 'SHIP-2'
        ELSE shiprocket_response_id
      END,
      shiprocket_order_reference = CASE awb
        WHEN 'AWB-1' THEN 'SRO-1'
        WHEN 'AWB-2' THEN 'SRO-2'
        ELSE shiprocket_order_reference
      END,
      shiprocket_channel_reference = CASE awb
        WHEN 'AWB-1' THEN '1001'
        WHEN 'AWB-2' THEN '2002'
        ELSE shiprocket_channel_reference
      END
    `,
  );
}

test("Shiprocket passbook preview and confirm preserve strict matching, skipped rows, and idempotency", async () => {
  await orderMappingQuery(`DELETE FROM "${testSchema}"."order_expense_transactions"`);
  await orderMappingQuery(`DELETE FROM "${testSchema}"."order_expense_imports"`);
  await orderMappingQuery(`DELETE FROM "${testSchema}"."shipments"`);
  await orderMappingQuery(`DELETE FROM "${testSchema}"."orders"`);

  await seedOrders();

  const csv = [
    "Transaction ID,Transaction Date,AWB,Shipment ID,Order ID,Channel Order ID,Description,Debit,Credit",
    "TXN-1,2026-07-01,AWB-1,SHIP-1,SRO-1,1001,Forward Freight,84,0",
    "TXN-2,2026-07-01,AWB-1,SHIP-1,SRO-1,1001,COD Charge,29,0",
    "TXN-3,2026-07-01,,,,9999,Weight Adjustment,16,0",
    "TXN-4,2026-07-01,,,,,Wallet Balance,5000,0",
    "TXN-5,2026-07-01,AWB-1,,,2002,Forward Freight,10,0",
    "TXN-6,2026-07-01,AWB-1,,,1001,Credit Adjustment,0,10",
  ].join("\n");

  const preview = await previewShiprocketPassbookImport(await createUploadFile("shiprocket-passbook.csv", csv));

  assert.equal(preview.financialRows, 5);
  assert.equal(preview.matched, 3);
  assert.equal(preview.unmatched, 1);
  assert.equal(preview.conflicts, 1);
  assert.equal(preview.duplicates, 0);
  assert.equal(preview.grossDebits, 139);
  assert.equal(preview.grossCredits, 10);
  assert.equal(preview.netCharges, 129);

  const skipped = preview.rows.find((row) => row.skippedType === "BALANCE_SNAPSHOT");
  assert.ok(skipped);
  assert.equal(skipped.matchStatus, "SKIPPED");

  const conflict = preview.rows.find((row) => row.transactionId === "TXN-5");
  assert.equal(conflict.matchStatus, "CONFLICT");

  const unmatched = preview.rows.find((row) => row.transactionId === "TXN-3");
  assert.equal(unmatched.matchStatus, "UNMATCHED");

  const firstConfirm = await confirmShiprocketPassbookImport(preview.importId);
  assert.equal(firstConfirm.insertedTransactions, 5);
  assert.equal(firstConfirm.duplicateTransactions, 0);

  const rowCount = await countRowsInSchemaTable(testSchema, "order_expense_transactions");
  assert.equal(rowCount, 5);

  const orders = await listOrderMappings({ page: 1, pageSize: 20 });
  const order1001 = orders.orders.find((row) => row.shopify_order_number === "1001");
  assert.equal(order1001.shiprocket_cost, "103.00");

  const detail = await getOrderMappingDetails(order1001.id);
  assert.equal(detail.expenseBreakdown.forward_freight, "84.00");
  assert.equal(detail.expenseBreakdown.cod_charge, "29.00");
  assert.equal(detail.expenseBreakdown.credits, "-10.00");
  assert.equal(detail.expenseBreakdown.net_shiprocket_cost, "103.00");
  assert.equal(detail.expenseTransactions.length, 3);

  const imports = await listShiprocketPassbookImports(10);
  assert.equal(imports.length, 1);
  const importDetail = await getShiprocketPassbookImportDetails(firstConfirm.importId);
  assert.equal(importDetail.rows.length, 5);

  const secondPreview = await previewShiprocketPassbookImport(await createUploadFile("renamed-passbook.csv", csv));
  assert.equal(secondPreview.duplicates, 5);
  const secondConfirm = await confirmShiprocketPassbookImport(secondPreview.importId);
  assert.equal(secondConfirm.insertedTransactions, 0);
  assert.equal(secondConfirm.duplicateTransactions, 5);

  const finalRowCount = await countRowsInSchemaTable(testSchema, "order_expense_transactions");
  assert.equal(finalRowCount, 5);
});
