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

const testSchema = configureIsolatedOrderMappingTestSchema("services-expenses");

const { env, resetEnvOverrides } = await import("../config/env.js");
const { closeOrderMappingPool, orderMappingQuery, orderMappingTable } = await import("./orderMappingDb.js");
const { runOrderMappingMigrations } = await import("./orderMappingMigrations.js");
const { upsertProviderExpense, upsertExpenseBill } = await import("../repositories/expenseRepository.js");
const {
  chooseShopifyCanonicalSource,
  getMonthlyConsolidatedSummary,
  getShiprocketStatementPageInfo,
  normalizeShiprocketStatementRow,
  normalizeShopifyBalanceTransaction,
  normalizeShopifyOrderTransactionFee,
  shiprocketTxId,
  shopifyOrderFeeId,
  syncShopifyExpenses,
} = await import("./expenseService.js");
const { parseExpenseDocument } = await import("./expenseDocumentParser.js");

const providerExpensesTable = orderMappingTable("provider_expenses");
const expenseBillsTable = orderMappingTable("expense_bills");
const execFileAsync = promisify(execFile);

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

const SHOPIFY_ENV_KEYS = [
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_ADMIN_ACCESS_TOKEN",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
];
const SHIPROCKET_ENV_KEYS = [
  "SHIPROCKET_EMAIL",
  "SHIPROCKET_PASSWORD",
  "SHIPROCKET_TOKEN",
  "SHIPROCKET_ENABLED",
];

async function withUnconfiguredShopify(fn) {
  const saved = {};
  for (const key of SHOPIFY_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetEnvOverrides();
  try {
    await fn();
  } finally {
    for (const key of SHOPIFY_ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    resetEnvOverrides();
  }
}

async function withUnconfiguredShiprocket(fn) {
  const saved = {};
  for (const key of SHIPROCKET_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetEnvOverrides();
  env.shiprocketEmail = "";
  env.shiprocketPassword = "";
  env.shiprocketToken = "";
  try {
    await fn();
  } finally {
    resetEnvOverrides();
    for (const key of SHIPROCKET_ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    resetEnvOverrides();
  }
}

async function deleteProviderExpenseRefs(provider, refs) {
  if (!refs.length) {
    return;
  }
  const placeholders = refs.map((_, index) => `$${index + 2}`).join(", ");
  await orderMappingQuery(
    `DELETE FROM ${providerExpensesTable} WHERE provider = $1 AND raw_source_reference IN (${placeholders})`,
    [provider, ...refs],
  );
}

async function getProviderExpenseStats(provider, refs) {
  const placeholders = refs.map((_, index) => `$${index + 2}`).join(", ");
  const result = await orderMappingQuery(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total
     FROM ${providerExpensesTable}
     WHERE provider = $1 AND raw_source_reference IN (${placeholders})`,
    [provider, ...refs],
  );
  return {
    count: result.rows[0]?.count || 0,
    total: Number(result.rows[0]?.total || 0),
  };
}

async function deleteBillsForMonth(month) {
  await orderMappingQuery(`DELETE FROM ${expenseBillsTable} WHERE billing_month = $1`, [month]);
}

async function getBillCountForMonth(month) {
  const result = await orderMappingQuery(`SELECT COUNT(*)::int AS count FROM ${expenseBillsTable} WHERE billing_month = $1`, [month]);
  return result.rows[0]?.count || 0;
}

function escapePdfText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdfBuffer(lines) {
  const content = [
    "BT",
    "/F1 12 Tf",
    "72 760 Td",
    ...lines.flatMap((line, index) => (index === 0 ? [`(${escapePdfText(line)}) Tj`] : ["0 -18 Td", `(${escapePdfText(line)}) Tj`])),
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

async function withTempFile(buffer, suffix, work) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "expense-parser-test-"));
  const filePath = path.join(tempDir, `fixture${suffix}`);
  await fs.writeFile(filePath, buffer);
  try {
    return await work(filePath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function buildPngBuffer(label) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "expense-parser-png-"));
  const pngPath = path.join(tempDir, "fixture.png");
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

test("Expenses service fixtures use an isolated test schema", async () => {
  const normalCount = await countRowsInSchemaTable(DEFAULT_ORDER_MAPPING_SCHEMA, "provider_expenses");
  await upsertProviderExpense({
    provider: "SHOPIFY",
    expenseDate: "2099-01-01",
    amount: 9,
    currency: "INR",
    rawSourceReference: "isolated-schema-proof",
  });
  const normalAfter = await countRowsInSchemaTable(DEFAULT_ORDER_MAPPING_SCHEMA, "provider_expenses");
  assert.equal(normalAfter, normalCount);
  await deleteProviderExpenseRefs("SHOPIFY", ["isolated-schema-proof"]);
});

test("Shiprocket fallback identity is deterministic for the same row", () => {
  const row = {
    created_at: "2026-08-10 14:30:00",
    order_id: "99999",
    channel_order_id: "CH-99999",
    awb_code: "AWB-777",
    description: "RTO charge",
    debit_amount: "72.00",
    credit_amount: "0.00",
  };
  assert.equal(shiprocketTxId(row), shiprocketTxId(row));
});

test("Shiprocket fallback identity separates rows that only differ in distinguishing fields", () => {
  const base = {
    created_at: "2026-08-05 10:00:00",
    awb_code: "AWB-999",
    description: "Forward Freight",
  };
  const rowA = { ...base, order_id: "12345", channel_order_id: "CH-12345", debit_amount: "85.00", credit_amount: "0.00" };
  const rowB = { ...base, order_id: "12346", channel_order_id: "CH-12346", debit_amount: "0.00", credit_amount: "85.00" };
  assert.notEqual(shiprocketTxId(rowA), shiprocketTxId(rowB));
});

test("Shiprocket real transaction_id is preferred over the fallback hash", () => {
  const row = {
    transaction_id: "SR_REAL_TX_001",
    created_at: "2026-08-05 10:00:00",
    awb_code: "AWB-999",
    description: "Forward Freight",
    debit_amount: "85.00",
    credit_amount: "0.00",
  };
  assert.equal(shiprocketTxId(row), "SR_REAL_TX_001");
});

test("Shiprocket statement pagination honors provider total_pages metadata", () => {
  const page1 = getShiprocketStatementPageInfo({ meta: { pagination: { total_pages: 3 } } }, 1, 100, 100);
  const page3 = getShiprocketStatementPageInfo({ meta: { pagination: { total_pages: 3 } } }, 3, 100, 25);
  assert.equal(page1.hasNextPage, true);
  assert.equal(page3.hasNextPage, false);
});

test("Shiprocket statement pagination falls back to page-size detection when metadata is absent", () => {
  assert.equal(getShiprocketStatementPageInfo({}, 1, 100, 100).hasNextPage, true);
  assert.equal(getShiprocketStatementPageInfo({}, 2, 100, 12).hasNextPage, false);
});

test("Shiprocket normalization handles debit and credit rows correctly", () => {
  const debitRow = normalizeShiprocketStatementRow({
    created_at: "2026-08-02 08:00:00",
    description: "Forward Freight",
    awb_code: "AWB-1",
    debit_amount: "120.50",
    credit_amount: "0.00",
  }, "2026-08");
  const creditRow = normalizeShiprocketStatementRow({
    created_at: "2026-08-03 08:00:00",
    description: "RTO Reversal",
    awb_code: "AWB-1",
    debit_amount: "0.00",
    credit_amount: "20.25",
  }, "2026-08");

  assert.equal(debitRow.amount, 120.5);
  assert.equal(debitRow.expenseType, "SHIPROCKET_FORWARD");
  assert.equal(creditRow.amount, -20.25);
  assert.equal(creditRow.expenseType, "SHIPROCKET_CREDIT");
});

test("Shiprocket normalization skips wallet balance and zero-net rows", () => {
  assert.equal(
    normalizeShiprocketStatementRow({ description: "Wallet Balance", debit_amount: "100.00", credit_amount: "0.00" }, "2026-08"),
    null,
  );
  assert.equal(
    normalizeShiprocketStatementRow({ description: "Adjustment", debit_amount: "50.00", credit_amount: "50.00" }, "2026-08"),
    null,
  );
});

test("Shiprocket provider expenses remain idempotent for the same normalized row", async () => {
  const normalized = normalizeShiprocketStatementRow({
    created_at: "2099-01-02 08:00:00",
    order_id: "TEST-100",
    channel_order_id: "TEST-CH-100",
    awb_code: "TEST-AWB-100",
    description: "Forward Freight",
    debit_amount: "99.00",
    credit_amount: "0.00",
  }, "2099-01");

  await deleteProviderExpenseRefs("SHIPROCKET", [normalized.rawSourceReference]);
  await upsertProviderExpense(normalized);
  await upsertProviderExpense(normalized);
  const stats = await getProviderExpenseStats("SHIPROCKET", [normalized.rawSourceReference]);
  assert.equal(stats.count, 1);
  assert.equal(stats.total, 99);
  await deleteProviderExpenseRefs("SHIPROCKET", [normalized.rawSourceReference]);
});

test("Shopify transaction fee normalization keeps real fee data and stable identity", () => {
  const normalized = normalizeShopifyOrderTransactionFee({
    order: { name: "#1001", processedAt: "2026-08-04T09:00:00Z" },
    transaction: { id: "gid://shopify/OrderTransaction/1", gateway: "shopify_payments" },
    fee: {
      amount: { amount: "12.34", currencyCode: "INR" },
      taxAmount: { amount: "2.22", currencyCode: "INR" },
      type: "TRANSACTION_FEE",
    },
    feeIndex: 0,
    month: "2026-08",
  });

  assert.equal(normalized.amount, 12.34);
  assert.equal(normalized.feeTaxAmount, 2.22);
  assert.equal(normalized.currency, "INR");
  assert.equal(normalized.rawSourceReference, shopifyOrderFeeId("gid://shopify/OrderTransaction/1", 0));
});

test("Shopify transaction fee normalization skips null and empty fee amounts", () => {
  assert.equal(
    normalizeShopifyOrderTransactionFee({
      order: { name: "#1001", processedAt: "2026-08-04T09:00:00Z" },
      transaction: { id: "gid://shopify/OrderTransaction/1", gateway: "shopify_payments" },
      fee: { amount: { amount: "0.00", currencyCode: "INR" } },
      feeIndex: 0,
      month: "2026-08",
    }),
    null,
  );
  assert.equal(
    normalizeShopifyOrderTransactionFee({
      order: { name: "#1001", processedAt: "2026-08-04T09:00:00Z" },
      transaction: { id: "gid://shopify/OrderTransaction/1", gateway: "shopify_payments" },
      fee: {},
      feeIndex: 0,
      month: "2026-08",
    }),
    null,
  );
});

test("Shopify balance transaction normalization uses the provider balance transaction ID", () => {
  const normalized = normalizeShopifyBalanceTransaction({
    id: "gid://shopify/ShopifyPaymentsBalanceTransaction/9",
    transactionDate: "2026-08-04T09:00:00Z",
    type: "CHARGE",
    sourceOrderTransactionId: "98765",
    amount: { amount: "100.00", currencyCode: "INR" },
    fee: { amount: "3.50", currencyCode: "INR" },
  });
  assert.equal(normalized.rawSourceReference, "gid://shopify/ShopifyPaymentsBalanceTransaction/9");
  assert.equal(normalized.amount, 3.5);
  assert.equal(normalized.currency, "INR");
});

test("Shopify chooses balance transactions over order transaction fees to avoid double-counting", () => {
  assert.equal(
    chooseShopifyCanonicalSource({
      orderTransactionFees: "AVAILABLE",
      shopifyPaymentsBalanceTransactions: "AVAILABLE",
    }),
    "SHOPIFY_PAYMENTS_BALANCE_TRANSACTIONS",
  );
  assert.equal(
    chooseShopifyCanonicalSource({
      orderTransactionFees: "AVAILABLE",
      shopifyPaymentsBalanceTransactions: "MISSING_SCOPE",
    }),
    "ORDER_TRANSACTION_FEES",
  );
});

test("Shopify provider expenses remain idempotent for the same stable fee identity", async () => {
  const reference = shopifyOrderFeeId("gid://shopify/OrderTransaction/test-idempotent", 0);
  await deleteProviderExpenseRefs("SHOPIFY", [reference]);
  await upsertProviderExpense({
    provider: "SHOPIFY",
    expenseDate: "2099-02-01",
    amount: 18.75,
    currency: "INR",
    reference: "Shopify fee test",
    expenseType: "SHOPIFY_TRANSACTION_FEES",
    rawSourceReference: reference,
  });
  await upsertProviderExpense({
    provider: "SHOPIFY",
    expenseDate: "2099-02-01",
    amount: 18.75,
    currency: "INR",
    reference: "Shopify fee test",
    expenseType: "SHOPIFY_TRANSACTION_FEES",
    rawSourceReference: reference,
  });
  const stats = await getProviderExpenseStats("SHOPIFY", [reference]);
  assert.equal(stats.count, 1);
  assert.equal(stats.total, 18.75);
  await deleteProviderExpenseRefs("SHOPIFY", [reference]);
});

test("Shopify sync returns UNAVAILABLE when capability is missing instead of fabricating rows", async () => {
  await withUnconfiguredShopify(async () => {
    const result = await syncShopifyExpenses("2026-08");
    assert.equal(result.status, "UNAVAILABLE");
  });
});

test("Live verification paths do not insert bill fixtures", async () => {
  const month = "2099-05";
  await deleteBillsForMonth(month);
  const before = await getBillCountForMonth(month);
  await withUnconfiguredShopify(async () => {
    const result = await syncShopifyExpenses(month);
    assert.equal(result.status, "UNAVAILABLE");
  });
  const after = await getBillCountForMonth(month);
  assert.equal(after, before);
});

test("Monthly summary remains invoice-based even when provider API activity exists", async () => {
  const month = "2099-03";
  const providerRef = "summary-invoice-basis-test";
  await deleteBillsForMonth(month);
  await deleteProviderExpenseRefs("SHOPIFY", [providerRef]);

  await orderMappingQuery(
    `INSERT INTO ${expenseBillsTable}
      (provider, invoice_number, invoice_date, billing_month, subtotal, tax, total, currency, document_source, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    ["SHOPIFY", "SHOPIFY-2099-03", "2099-03-05", month, 100, 0, 100, "INR", "MANUAL", "AVAILABLE"],
  );
  await upsertProviderExpense({
    provider: "SHOPIFY",
    expenseDate: "2099-03-04",
    amount: 40,
    currency: "INR",
    reference: "API fee",
    expenseType: "SHOPIFY_TRANSACTION_FEES",
    rawSourceReference: providerRef,
  });

  const summary = await getMonthlyConsolidatedSummary(month);
  const shopify = summary.providerTotals.find((entry) => entry.provider === "SHOPIFY");
  assert.equal(summary.totalExpense, 100);
  assert.equal(shopify.total, 100);
  assert.equal(shopify.apiExpense, 40);
  assert.equal(shopify.apiActivityState, "PARTIAL");
  await deleteProviderExpenseRefs("SHOPIFY", [providerRef]);
  await deleteBillsForMonth(month);
});

test("Meta API activity without a recognized bill keeps the official monthly total at zero and marks INCOMPLETE", async () => {
  const month = "2099-06";
  const providerRef = "meta-api-without-bill";
  await deleteBillsForMonth(month);
  await deleteProviderExpenseRefs("META", [providerRef]);
  await upsertProviderExpense({
    provider: "META",
    expenseDate: "2099-06-02",
    amount: 10882.05,
    currency: "INR",
    reference: "Meta test activity",
    expenseType: "AD_SPEND",
    rawSourceReference: providerRef,
  });

  const summary = await getMonthlyConsolidatedSummary(month);
  const meta = summary.providerTotals.find((entry) => entry.provider === "META");
  assert.equal(summary.totalExpense, 0);
  assert.equal(meta.total, 0);
  assert.equal(meta.apiExpense, 10882.05);
  assert.equal(meta.completeness, "INCOMPLETE");
  await deleteProviderExpenseRefs("META", [providerRef]);
});

test("Manual genuine bill upload semantics change the official monthly expense immediately", async () => {
  const month = "2099-07";
  await deleteBillsForMonth(month);
  await upsertExpenseBill({
    provider: "SHIPROCKET",
    invoiceNumber: "SHIPROCKET-2099-07",
    invoiceDate: "2099-07-05",
    billingMonth: month,
    subtotal: 2500,
    tax: 0,
    total: 2500,
    currency: "INR",
    documentSource: "MANUAL",
    status: "AVAILABLE",
  });

  const summary = await getMonthlyConsolidatedSummary(month);
  const shiprocket = summary.providerTotals.find((entry) => entry.provider === "SHIPROCKET");
  assert.equal(summary.totalExpense, 2500);
  assert.equal(shiprocket.total, 2500);
  assert.equal(shiprocket.billCount, 1);
  await deleteBillsForMonth(month);
});

test("Unavailable provider API is reported honestly as UNKNOWN rather than zero-expense certainty", async () => {
  const month = "2099-04";
  await deleteBillsForMonth(month);

  await withUnconfiguredShopify(async () => {
    const summary = await getMonthlyConsolidatedSummary(month);
    const shopify = summary.providerTotals.find((entry) => entry.provider === "SHOPIFY");
    assert.equal(shopify.apiExpense, null);
    assert.equal(shopify.apiActivityState, "UNAVAILABLE");
    assert.equal(shopify.completeness, "UNKNOWN");
  });
});

test("Shiprocket summary does not flatten non-authoritative empty statement data into zero", async () => {
  const month = "2099-08";
  await withUnconfiguredShiprocket(async () => {
    const summary = await getMonthlyConsolidatedSummary(month);
    const shiprocket = summary.providerTotals.find((entry) => entry.provider === "SHIPROCKET");
    assert.equal(shiprocket.apiExpense, null);
    assert.equal(shiprocket.apiActivityState, "UNAVAILABLE");
    assert.equal(shiprocket.completeness, "UNKNOWN");
  });
});

test("Shopify zero provider rows with missing scope stay unavailable rather than numeric zero", async () => {
  const month = "2099-09";
  await deleteBillsForMonth(month);
  await withUnconfiguredShopify(async () => {
    const result = await syncShopifyExpenses(month);
    assert.equal(result.status, "UNAVAILABLE");
    const summary = await getMonthlyConsolidatedSummary(month);
    const shopify = summary.providerTotals.find((entry) => entry.provider === "SHOPIFY");
    assert.equal(shopify.apiExpense, null);
    assert.equal(shopify.apiActivityState, "UNAVAILABLE");
  });
});

test("Expense document parser extracts required fields from machine-readable PDF content", async () => {
  const pdf = buildSimplePdfBuffer([
    "Meta Platforms India",
    "Invoice Number: META-2099-08",
    "Invoice Date: 01 Aug 2099",
    "Billing Period: July 2099",
    "Subtotal: INR 9304.63",
    "IGST: INR 1674.83",
    "Invoice Total: INR 10979.46",
  ]);
  const parsed = await withTempFile(pdf, ".pdf", (filePath) => parseExpenseDocument({
    filePath,
    mimeType: "application/pdf",
    selectedMonth: "2099-08",
  }));
  assert.equal(parsed.fields.provider.value, "META");
  assert.equal(parsed.fields.invoiceNumber.value, "META-2099-08");
  assert.equal(parsed.fields.invoiceDate.value, "2099-08-01");
  assert.equal(parsed.fields.billingMonth.value, "2099-07");
  assert.equal(parsed.fields.subtotal.value, 9304.63);
  assert.equal(parsed.fields.tax.value, 1674.83);
  assert.equal(parsed.fields.total.value, 10979.46);
  assert.equal(parsed.fields.currency.value, "INR");
});

test("Expense document parser uses OCR for image invoices and aggregates CGST plus SGST", async () => {
  const png = await buildPngBuffer([
    "Shiprocket",
    "Invoice Number SR-2099-09",
    "Invoice Date 15/09/2099",
    "Billing Period August 2099",
    "Subtotal INR 1000.00",
    "CGST INR 90.00",
    "SGST INR 90.00",
    "Invoice Total INR 1180.00",
  ].join("\n"));
  const parsed = await withTempFile(png, ".png", (filePath) => parseExpenseDocument({
    filePath,
    mimeType: "image/png",
    selectedMonth: "2099-09",
    preferredProvider: "SHIPROCKET",
  }));
  assert.equal(parsed.extractionSource, "OCR");
  assert.equal(parsed.fields.provider.value, "SHIPROCKET");
  assert.equal(parsed.fields.tax.value, 180);
  assert.equal(parsed.fields.total.value, 1180);
  assert.equal(parsed.fields.billingMonth.value, "2099-08");
});

test("Expense document parser falls back to selected month with review warning when billing period is absent", async () => {
  const pdf = buildSimplePdfBuffer([
    "Shopify",
    "Invoice Number: SHOP-2099-10",
    "Invoice Date: 03 Oct 2099",
    "Invoice Total: INR 2500.00",
  ]);
  const parsed = await withTempFile(pdf, ".pdf", (filePath) => parseExpenseDocument({
    filePath,
    mimeType: "application/pdf",
    selectedMonth: "2099-07",
  }));
  assert.equal(parsed.fields.billingMonth.value, "2099-10");
  assert.equal(parsed.fields.billingMonth.confidence, "MEDIUM");
});

test("Expense document parser marks missing invoice number and uncertain provider for review", async () => {
  const pdf = buildSimplePdfBuffer([
    "Monthly merchant invoice",
    "Invoice Date: 05 Aug 2099",
    "Invoice Total: INR 500.00",
  ]);
  const parsed = await withTempFile(pdf, ".pdf", (filePath) => parseExpenseDocument({
    filePath,
    mimeType: "application/pdf",
    selectedMonth: "2099-08",
  }));
  assert.equal(parsed.fields.provider.value, "NEEDS_REVIEW");
  assert.equal(parsed.fields.invoiceNumber.confidence, "MISSING");
  assert.equal(parsed.fields.total.value, 500);
});
