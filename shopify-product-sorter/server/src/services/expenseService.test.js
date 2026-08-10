import test from "node:test";
import assert from "node:assert/strict";

import { env, resetEnvOverrides } from "../config/env.js";
import { closeOrderMappingPool, orderMappingQuery, orderMappingTable } from "./orderMappingDb.js";
import { runOrderMappingMigrations } from "./orderMappingMigrations.js";
import { upsertProviderExpense } from "../repositories/expenseRepository.js";
import {
  chooseShopifyCanonicalSource,
  getMonthlyConsolidatedSummary,
  getShiprocketStatementPageInfo,
  normalizeShiprocketStatementRow,
  normalizeShopifyBalanceTransaction,
  normalizeShopifyOrderTransactionFee,
  shiprocketTxId,
  shopifyOrderFeeId,
  syncShopifyExpenses,
} from "./expenseService.js";

const providerExpensesTable = orderMappingTable("provider_expenses");
const expenseBillsTable = orderMappingTable("expense_bills");

test.before(async () => {
  await runOrderMappingMigrations();
});

test.afterEach(() => {
  resetEnvOverrides();
});

test.after(async () => {
  await closeOrderMappingPool();
});

const SHOPIFY_ENV_KEYS = [
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_ADMIN_ACCESS_TOKEN",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
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
  await deleteProviderExpenseRefs("SHOPIFY", [providerRef]);
  await deleteBillsForMonth(month);
});

test("Unavailable provider API is reported honestly as UNKNOWN rather than zero-expense certainty", async () => {
  const month = "2099-04";
  await deleteBillsForMonth(month);

  await withUnconfiguredShopify(async () => {
    const summary = await getMonthlyConsolidatedSummary(month);
    const shopify = summary.providerTotals.find((entry) => entry.provider === "SHOPIFY");
    assert.equal(shopify.apiExpense, 0);
    assert.equal(shopify.completeness, "UNKNOWN");
  });
});
