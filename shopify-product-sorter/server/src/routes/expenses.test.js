import test from "node:test";
import assert from "node:assert/strict";
import { 
  upsertExpenseBill, 
  upsertProviderExpense, 
  listExpenseBills, 
  getProviderExpensesSum,
  getDistinctBillingMonths,
  getMonthlyHistory,
  deleteExpenseBill
} from "../repositories/expenseRepository.js";
import { 
  syncAllExpenses, 
  getMonthlyConsolidatedSummary,
  syncShiprocketExpenses,
  syncShopifyExpenses
} from "../services/expenseService.js";
import { runOrderMappingMigrations } from "../services/orderMappingMigrations.js";

test.before(async () => {
  // Runs migrations on the test database
  await runOrderMappingMigrations();
});

test("Expenses Backend: upsertExpenseBill is idempotent and prevents duplicates", async () => {
  // Clear previous table state
  const bills = await listExpenseBills("2026-08");
  for (const b of bills) {
    await deleteExpenseBill(b.id);
  }

  // Insert initial
  const bill1 = await upsertExpenseBill({
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

  // Insert duplicate (should update instead of creating new row)
  const bill2 = await upsertExpenseBill({
    provider: "META",
    invoiceNumber: "META-100",
    invoiceDate: "2026-08-01",
    billingMonth: "2026-08",
    subtotal: 90,
    tax: 10,
    total: 110, // Updated total
    currency: "INR",
    documentSource: "MANUAL",
  });

  const list = await listExpenseBills("2026-08");
  assert.equal(list.length, 1, "Idempotency test failed: duplicate rows created");
  assert.equal(list[0].total, 110, "Update on duplicate conflict failed");
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
  assert.equal(summary.totalExpense, 142850, "Monthly total aggregation mismatch");
});

test("Expenses Backend: isolates totals month-by-month (Req 52)", async () => {
  // Clean up
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

  assert.equal(metaTotals.total, 82450, "Multiple bills provider sum mismatch");
  assert.equal(metaTotals.billCount, 3, "Multiple bills count mismatch");
});

test("Expenses Backend: marks provider INCOMPLETE if expected API activity has no bills (Req 54)", async () => {
  const bills = await listExpenseBills("2026-11");
  for (const b of bills) {
    await deleteExpenseBill(b.id);
  }

  // Register expected Shopify API charges
  await upsertProviderExpense({
    provider: "SHOPIFY",
    expenseDate: "2026-11-01",
    amount: 2499,
    currency: "INR",
    rawSourceReference: "shopify-incomplete-test",
  });

  const summary = await getMonthlyConsolidatedSummary("2026-11");
  const shopTotals = summary.providerTotals.find((p) => p.provider === "SHOPIFY");

  assert.equal(shopTotals.completeness, "INCOMPLETE", "Incomplete status check failed");
});

test("Expenses Backend: marks provider NO BILLS if no API activity and no bills (Req 55)", async () => {
  const bills = await listExpenseBills("2026-12");
  for (const b of bills) {
    await deleteExpenseBill(b.id);
  }

  const summary = await getMonthlyConsolidatedSummary("2026-12");
  const shopTotals = summary.providerTotals.find((p) => p.provider === "SHOPIFY");

  assert.equal(shopTotals.completeness, "NO_BILLS", "Empty provider state check failed");
});

test("Expenses Integration: live / mock sync execution and mapping logic", async () => {
  // Test Shiprocket sync return status when not configured (or configured correctly)
  const srRes = await syncShiprocketExpenses("2026-08");
  assert.ok(["SUCCESS", "UNAVAILABLE"].includes(srRes.status));

  // Test Shopify sync return status
  const shopRes = await syncShopifyExpenses("2026-08");
  assert.ok(["SUCCESS", "UNAVAILABLE"].includes(shopRes.status));

  // Test syncAllExpenses orchestrator returns consolidated results
  const allRes = await syncAllExpenses("2026-08");
  assert.equal(typeof allRes.success, "boolean");
  assert.ok(Array.isArray(allRes.results));
});
