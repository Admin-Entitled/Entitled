import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  DEFAULT_ORDER_MAPPING_SCHEMA,
  assertSafeExpensesTestTarget,
  configureIsolatedOrderMappingTestSchema,
  countRowsInSchemaTable,
  dropIsolatedOrderMappingSchema,
} from "../test/orderMappingTestIsolation.js";

const testSchema = configureIsolatedOrderMappingTestSchema("routes-expenses");
const execFileAsync = promisify(execFile);
const { default: app } = await import("../app.js");

const { resetEnvOverrides } = await import("../config/env.js");
const {
  upsertExpenseBill,
  upsertProviderExpense,
  listExpenseBills,
  deleteExpenseBill,
} = await import("../repositories/expenseRepository.js");
const {
  syncAllExpenses,
  getMonthlyConsolidatedSummary,
  syncShiprocketExpenses,
  syncShopifyExpenses,
} = await import("../services/expenseService.js");
const { runOrderMappingMigrations } = await import("../services/orderMappingMigrations.js");
const { closeOrderMappingPool, orderMappingQuery } = await import("../services/orderMappingDb.js");

test.before(async () => {
  assertSafeExpensesTestTarget();
  await runOrderMappingMigrations();
});

test.afterEach(() => {
  resetEnvOverrides();
});

test.after(async () => {
  await closeOrderMappingPool();
  await dropIsolatedOrderMappingSchema(testSchema);
});

function startServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

function getServerUrl(server, pathname) {
  return new URL(pathname, `http://127.0.0.1:${server.address().port}`);
}

function escapePdfText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdfBuffer(lines) {
  const content = [
    "BT",
    "/F1 12 Tf",
    "72 760 Td",
    ...lines.flatMap((line, index) => (index === 0
      ? [`(${escapePdfText(line)}) Tj`]
      : ["0 -18 Td", `(${escapePdfText(line)}) Tj`])),
    "ET",
  ].join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj",
    `4 0 obj\n<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream\nendobj`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

async function buildPngBuffer(label) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "expenses-route-png-"));
  const pngPath = path.join(tempDir, "invoice.png");
  try {
    await execFileAsync("convert", [
      "-size", "1200x900",
      "xc:black",
      "-fill", "white",
      "-pointsize", "34",
      "-font", "DejaVu-Sans",
      "-gravity", "northwest",
      "-annotate", "+50+50", label,
      pngPath,
    ]);
    return await fs.readFile(pngPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function deleteBillByInvoice(provider, invoiceNumber) {
  await orderMappingQuery(
    `DELETE FROM "${testSchema}"."expense_bills" WHERE provider = $1 AND invoice_number = $2`,
    [provider, invoiceNumber],
  );
}

test("Expenses fixture safety guard rejects the normal schema", async () => {
  const previousSchema = process.env.ORDER_MAPPING_SCHEMA;
  try {
    process.env.NODE_ENV = "test";
    process.env.ORDER_MAPPING_SCHEMA = DEFAULT_ORDER_MAPPING_SCHEMA;
    assert.throws(() => assertSafeExpensesTestTarget(), /Refusing to run Expenses DB fixtures against non-test schema/);
  } finally {
    process.env.ORDER_MAPPING_SCHEMA = previousSchema;
  }
});

test("Expenses fixture inserts stay isolated from the normal schema", async () => {
  const before = await countRowsInSchemaTable(DEFAULT_ORDER_MAPPING_SCHEMA, "expense_bills");
  await upsertExpenseBill({
    provider: "META",
    invoiceNumber: "META-ISOLATED-001",
    invoiceDate: "2099-08-01",
    billingMonth: "2099-08",
    subtotal: 500,
    tax: 0,
    total: 500,
    currency: "INR",
    documentSource: "MANUAL",
  });
  const after = await countRowsInSchemaTable(DEFAULT_ORDER_MAPPING_SCHEMA, "expense_bills");
  assert.equal(after, before);
});

test("Expenses Backend: upsertExpenseBill is idempotent and prevents duplicates", async () => {
  const bills = await listExpenseBills("2026-08");
  for (const b of bills) {
    await deleteExpenseBill(b.id);
  }

  await upsertExpenseBill({
    provider: "META",
    invoiceNumber: "META-100",
    invoiceDate: "2026-08-01",
    billingMonth: "2026-08",
    subtotal: 90,
    tax: 10,
    total: 100,
    currency: "INR",
    documentSource: "MANUAL",
  });

  const currentBills = await listExpenseBills("2026-08");
  assert.equal(currentBills.length, 1);

  await upsertExpenseBill({
    provider: "META",
    invoiceNumber: "META-100",
    invoiceDate: "2026-08-01",
    billingMonth: "2026-08",
    subtotal: 90,
    tax: 10,
    total: 110,
    currency: "INR",
    documentSource: "MANUAL",
  });

  const list = await listExpenseBills("2026-08");
  assert.equal(list.length, 1);
  assert.equal(list[0].total, 110);
});

test("Expenses Backend: calculates monthly expense totals correctly (Req 51)", async () => {
  const bills = await listExpenseBills("2026-08");
  for (const b of bills) {
    await deleteExpenseBill(b.id);
  }

  await upsertExpenseBill({ provider: "META", invoiceNumber: "META-001", invoiceDate: "2026-08-01", billingMonth: "2026-08", total: 82450, currency: "INR", subtotal: 82450, tax: 0 });
  await upsertExpenseBill({ provider: "SHIPROCKET", invoiceNumber: "SR-001", invoiceDate: "2026-08-02", billingMonth: "2026-08", total: 47100, currency: "INR", subtotal: 47100, tax: 0 });
  await upsertExpenseBill({ provider: "SHOPIFY", invoiceNumber: "SHOP-001", invoiceDate: "2026-08-03", billingMonth: "2026-08", total: 13300, currency: "INR", subtotal: 13300, tax: 0 });

  const summary = await getMonthlyConsolidatedSummary("2026-08");
  assert.equal(summary.totalExpense, 142850);
});

test("Expenses Backend: isolates totals month-by-month (Req 52)", async () => {
  const julBills = await listExpenseBills("2026-07");
  const sepBills = await listExpenseBills("2026-09");
  for (const b of [...julBills, ...sepBills]) {
    await deleteExpenseBill(b.id);
  }

  await upsertExpenseBill({ provider: "META", invoiceNumber: "META-JULY", invoiceDate: "2026-07-15", billingMonth: "2026-07", total: 10000, currency: "INR", subtotal: 10000, tax: 0 });
  await upsertExpenseBill({ provider: "META", invoiceNumber: "META-SEPT", invoiceDate: "2026-09-15", billingMonth: "2026-09", total: 30000, currency: "INR", subtotal: 30000, tax: 0 });

  const summaryJul = await getMonthlyConsolidatedSummary("2026-07");
  const summarySep = await getMonthlyConsolidatedSummary("2026-09");

  assert.equal(summaryJul.totalExpense, 10000);
  assert.equal(summarySep.totalExpense, 30000);
});

test("Expenses Backend: handles multiple bills for a single provider (Req 53)", async () => {
  const bills = await listExpenseBills("2026-10");
  for (const b of bills) {
    await deleteExpenseBill(b.id);
  }

  await upsertExpenseBill({ provider: "META", invoiceNumber: "META-A", invoiceDate: "2026-10-01", billingMonth: "2026-10", total: 30000, currency: "INR", subtotal: 30000, tax: 0 });
  await upsertExpenseBill({ provider: "META", invoiceNumber: "META-B", invoiceDate: "2026-10-02", billingMonth: "2026-10", total: 25000, currency: "INR", subtotal: 25000, tax: 0 });
  await upsertExpenseBill({ provider: "META", invoiceNumber: "META-C", invoiceDate: "2026-10-03", billingMonth: "2026-10", total: 27450, currency: "INR", subtotal: 27450, tax: 0 });

  const summary = await getMonthlyConsolidatedSummary("2026-10");
  const metaTotals = summary.providerTotals.find((p) => p.provider === "META");

  assert.equal(metaTotals.total, 82450);
  assert.equal(metaTotals.billCount, 3);
});

test("Expenses Backend: marks provider INCOMPLETE if expected API activity has no bills (Req 54)", async () => {
  const bills = await listExpenseBills("2026-11");
  for (const b of bills) {
    await deleteExpenseBill(b.id);
  }

  await upsertProviderExpense({
    provider: "SHOPIFY",
    expenseDate: "2026-11-01",
    amount: 2499,
    currency: "INR",
    rawSourceReference: "shopify-incomplete-test",
  });

  const summary = await getMonthlyConsolidatedSummary("2026-11");
  const shopTotals = summary.providerTotals.find((p) => p.provider === "SHOPIFY");

  assert.equal(shopTotals.completeness, "INCOMPLETE");
});

test("Expenses Backend: does not mistake absent automatic provider data for verified zero (Req 55)", async () => {
  const bills = await listExpenseBills("2026-12");
  for (const b of bills) {
    await deleteExpenseBill(b.id);
  }

  const summary = await getMonthlyConsolidatedSummary("2026-12");
  const shopTotals = summary.providerTotals.find((p) => p.provider === "SHOPIFY");

  assert.equal(shopTotals.completeness, "UNKNOWN");
});

test("Expenses Integration: live / mock sync execution and mapping logic", async () => {
  const srRes = await syncShiprocketExpenses("2026-08");
  assert.ok(["SUCCESS", "UNAVAILABLE"].includes(srRes.status));

  const shopRes = await syncShopifyExpenses("2026-08");
  assert.ok(["SUCCESS", "UNAVAILABLE"].includes(shopRes.status));

  const allRes = await syncAllExpenses("2026-08");
  assert.equal(typeof allRes.success, "boolean");
  assert.ok(Array.isArray(allRes.results));
});

test("Expenses import preview does not create bill rows and confirm creates a recognized bill", async () => {
  const month = "2099-10";
  await orderMappingQuery(`DELETE FROM "${testSchema}"."expense_bills" WHERE billing_month = $1`, [month]);
  await deleteBillByInvoice("META", "META-IMPORT-2099-10");
  const before = await countRowsInSchemaTable(testSchema, "expense_bills");
  const server = await startServer();
  try {
    const form = new FormData();
    const pdf = buildSimplePdfBuffer([
      "Meta Platforms India",
      "Invoice Number: META-IMPORT-2099-10",
      "Invoice Date: 10 Oct 2099",
      "Billing Period: September 2099",
      "Subtotal: INR 9304.63",
      "IGST: INR 1674.83",
      "Invoice Total: INR 10979.46",
    ]);
    form.append("selectedMonth", month);
    form.append("files", new Blob([pdf], { type: "application/pdf" }), "meta-import.pdf");
    const previewResponse = await fetch(getServerUrl(server, "/api/expenses/import/preview"), {
      method: "POST",
      body: form,
    });
    assert.equal(previewResponse.status, 201);
    const previewPayload = await previewResponse.json();
    assert.equal(previewPayload.previews.length, 1);
    const preview = previewPayload.previews[0];
    assert.equal(preview.provider, "META");
    assert.equal(preview.billingMonth, "2099-09");

    const afterPreview = await countRowsInSchemaTable(testSchema, "expense_bills");
    assert.equal(afterPreview, before);

    const confirmResponse = await fetch(getServerUrl(server, "/api/expenses/import/confirm"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{
          importId: preview.importId,
          provider: preview.provider,
          invoiceNumber: preview.invoiceNumber,
          invoiceDate: preview.invoiceDate,
          billingMonth: preview.billingMonth,
          subtotal: preview.subtotal,
          tax: preview.tax,
          total: preview.total,
          currency: preview.currency,
        }],
      }),
    });
    assert.equal(confirmResponse.status, 201);
    const confirmPayload = await confirmResponse.json();
    assert.equal(confirmPayload.saved.length, 1);
    const savedBill = confirmPayload.saved[0].bill;
    assert.equal(savedBill.provider, "META");
    assert.equal(savedBill.invoiceNumber, "META-IMPORT-2099-10");
    assert.equal(savedBill.billingMonth, "2099-09");
    assert.equal(savedBill.total, 10979.46);
    assert.equal(savedBill.status, "AVAILABLE");
    assert.ok(savedBill.documentStorageKey);
    assert.ok(savedBill.documentHash);
  } finally {
    server.close();
  }
});

test("Expenses import supports OCR image review and duplicate invoice/hash blocking with partial success", async () => {
  const month = "2099-11";
  await orderMappingQuery(`DELETE FROM "${testSchema}"."expense_bills" WHERE billing_month = $1`, [month]);
  await deleteBillByInvoice("SHIPROCKET", "SR-IMPORT-2099-11");
  const server = await startServer();
  try {
    const png = await buildPngBuffer([
      "Shiprocket",
      "Invoice Number SR-IMPORT-2099-11",
      "Invoice Date 11/11/2099",
      "Billing Period October 2099",
      "Subtotal INR 1000.00",
      "CGST INR 90.00",
      "SGST INR 90.00",
      "Invoice Total INR 1180.00",
    ].join("\n"));

    const form = new FormData();
    form.append("selectedMonth", month);
    form.append("preferredProvider", "SHIPROCKET");
    form.append("files", new Blob([png], { type: "image/png" }), "shiprocket-import.png");
    form.append("files", new Blob([png], { type: "image/png" }), "shiprocket-duplicate.png");
    const previewResponse = await fetch(getServerUrl(server, "/api/expenses/import/preview"), {
      method: "POST",
      body: form,
    });
    assert.equal(previewResponse.status, 201);
    const previewPayload = await previewResponse.json();
    assert.equal(previewPayload.previews.length, 2);

    const first = previewPayload.previews[0];
    const second = previewPayload.previews[1];
    assert.equal(first.provider, "SHIPROCKET");
    assert.equal(second.provider, "SHIPROCKET");

    const confirmResponse = await fetch(getServerUrl(server, "/api/expenses/import/confirm"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [first, second].map((item) => ({
          importId: item.importId,
          provider: "SHIPROCKET",
          invoiceNumber: "SR-IMPORT-2099-11",
          invoiceDate: "2099-11-11",
          billingMonth: "2099-10",
          subtotal: "1000.00",
          tax: "180.00",
          total: "1180.00",
          currency: "INR",
        })),
      }),
    });
    assert.equal(confirmResponse.status, 201);
    const confirmPayload = await confirmResponse.json();
    assert.equal(confirmPayload.saved.length, 1);
    assert.equal(confirmPayload.failed.length, 1);
    assert.match(confirmPayload.failed[0].code, /DUPLICATE_(INVOICE|DOCUMENT)/);
  } finally {
    server.close();
  }
});
