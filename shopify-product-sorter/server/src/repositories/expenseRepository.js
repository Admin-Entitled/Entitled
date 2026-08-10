import { orderMappingQuery, orderMappingTable } from "../services/orderMappingDb.js";

const billsTable = orderMappingTable("expense_bills");
const expensesTable = orderMappingTable("provider_expenses");

function nowIso() {
  return new Date().toISOString();
}

/**
 * Persist/upsert an expense bill idempotently.
 * Uniqueness constraint is provider + invoice_number.
 */
export async function upsertExpenseBill(bill) {
  const now = nowIso();
  
  const queryText = `
    INSERT INTO ${billsTable} (
      provider, invoice_number, invoice_date, billing_month,
      subtotal, tax, total, currency, document_source,
      document_url, document_storage_key, source_reference, status,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
    ON CONFLICT (provider, invoice_number) DO UPDATE
    SET invoice_date = EXCLUDED.invoice_date,
        billing_month = EXCLUDED.billing_month,
        subtotal = EXCLUDED.subtotal,
        tax = EXCLUDED.tax,
        total = EXCLUDED.total,
        currency = EXCLUDED.currency,
        document_source = EXCLUDED.document_source,
        document_url = COALESCE(EXCLUDED.document_url, ${billsTable}.document_url),
        document_storage_key = COALESCE(EXCLUDED.document_storage_key, ${billsTable}.document_storage_key),
        source_reference = COALESCE(EXCLUDED.source_reference, ${billsTable}.source_reference),
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
    RETURNING *;
  `;

  const values = [
    bill.provider,
    bill.invoiceNumber,
    bill.invoiceDate,
    bill.billingMonth,
    bill.subtotal,
    bill.tax,
    bill.total,
    bill.currency || "INR",
    bill.documentSource || "API",
    bill.documentUrl || null,
    bill.documentStorageKey || null,
    bill.sourceReference || null,
    bill.status || "AVAILABLE",
    now
  ];

  const res = await orderMappingQuery(queryText, values);
  return mapBill(res.rows[0]);
}

export async function getExpenseBill(id) {
  const queryText = `SELECT * FROM ${billsTable} WHERE id = $1`;
  const res = await orderMappingQuery(queryText, [id]);
  return mapBill(res.rows[0]);
}

export async function getExpenseBillByInvoice(provider, invoiceNumber) {
  const queryText = `SELECT * FROM ${billsTable} WHERE provider = $1 AND invoice_number = $2`;
  const res = await orderMappingQuery(queryText, [provider, invoiceNumber]);
  return mapBill(res.rows[0]);
}

export async function listExpenseBills(month) {
  const queryText = `SELECT * FROM ${billsTable} WHERE billing_month = $1 ORDER BY invoice_date DESC, id DESC`;
  const res = await orderMappingQuery(queryText, [month]);
  return res.rows.map(mapBill);
}

export async function deleteExpenseBill(id) {
  const queryText = `DELETE FROM ${billsTable} WHERE id = $1`;
  return orderMappingQuery(queryText, [id]);
}

/**
 * Persist/upsert expected provider expenses activity.
 */
export async function upsertProviderExpense(exp) {
  const now = nowIso();
  
  const queryText = `
    INSERT INTO ${expensesTable} (
      provider, expense_date, amount, currency,
      reference, expense_type, raw_source_reference, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
    ON CONFLICT (provider, raw_source_reference) DO UPDATE
    SET expense_date = EXCLUDED.expense_date,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        reference = EXCLUDED.reference,
        expense_type = EXCLUDED.expense_type,
        updated_at = EXCLUDED.updated_at
    RETURNING id;
  `;

  const values = [
    exp.provider,
    exp.expenseDate,
    exp.amount,
    exp.currency || "INR",
    exp.reference || null,
    exp.expenseType || null,
    exp.rawSourceReference || null,
    now
  ];

  const res = await orderMappingQuery(queryText, values);
  return res.rows[0]?.id;
}

export async function getProviderExpensesSum(provider, month) {
  const startDate = `${month}-01`;
  const queryText = `
    SELECT SUM(amount) as total, currency 
    FROM ${expensesTable} 
    WHERE provider = $1 
      AND expense_date >= $2::date 
      AND expense_date < ($2::date + interval '1 month')
    GROUP BY currency
  `;
  const res = await orderMappingQuery(queryText, [provider, startDate]);
  const row = res.rows[0];
  
  return row ? { total: parseFloat(row.total || 0), currency: row.currency } : { total: 0, currency: "INR" };
}

export async function getDistinctBillingMonths() {
  const queryText = `
    SELECT DISTINCT billing_month FROM ${billsTable}
    UNION
    SELECT DISTINCT SUBSTRING(expense_date::text, 1, 7) as billing_month FROM ${expensesTable}
    ORDER BY billing_month DESC
  `;
  const res = await orderMappingQuery(queryText);
  return res.rows.map((r) => r.billing_month).filter(Boolean);
}

export async function getMonthlyHistory() {
  const queryText = `
    SELECT billing_month, SUM(total) as total, currency
    FROM ${billsTable}
    GROUP BY billing_month, currency
    ORDER BY billing_month DESC
  `;
  const res = await orderMappingQuery(queryText);
  return res.rows.map((r) => ({
    month: r.billing_month,
    totalExpense: parseFloat(r.total || 0),
    currency: r.currency || "INR",
  }));
}

function mapBill(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date instanceof Date ? row.invoice_date.toISOString().slice(0, 10) : String(row.invoice_date).slice(0, 10),
    billingMonth: row.billing_month,
    subtotal: parseFloat(row.subtotal),
    tax: parseFloat(row.tax),
    total: parseFloat(row.total),
    currency: row.currency,
    documentSource: row.document_source,
    documentUrl: row.document_url,
    documentStorageKey: row.document_storage_key,
    sourceReference: row.source_reference,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
