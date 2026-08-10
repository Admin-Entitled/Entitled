import { 
  upsertExpenseBill, 
  upsertProviderExpense, 
  listExpenseBills, 
  getProviderExpensesSum,
  getDistinctBillingMonths,
  getMonthlyHistory
} from "../repositories/expenseRepository.js";
import { fetchMetaDailyInsights } from "./metaAdsService.js";
import { addNetworkLog } from "./sorterRuntimeService.js";
import { env, getMetaCapability, getShopifyCapability } from "../config/env.js";
import { logInfo, logError } from "../utils/logger.js";
import { createHash } from "node:crypto";
import {
  authenticateShiprocket,
  getCachedShiprocketToken,
  getShiprocketBaseUrl,
  isShiprocketConfigured,
  setCachedShiprocketToken,
  shiprocketRequest,
} from "./shiprocketTransport.js";
import { fetchOrderMappingShiprocketShipments } from "./orderMappingShiprocket.js";
import { shopifyGraphQL } from "./shopifyService.js";

const SHIPROCKET_STATEMENT_PAGE_SIZE = 100;
const SHOPIFY_ORDER_PAGE_SIZE = 50;
const SHOPIFY_PAYMENTS_PAGE_SIZE = 100;
const PROVIDER_ACTIVITY_STATES = {
  AVAILABLE: "AVAILABLE",
  ZERO_VERIFIED: "ZERO_VERIFIED",
  PARTIAL: "PARTIAL",
  UNAVAILABLE: "UNAVAILABLE",
  ERROR: "ERROR",
};

/**
 * Derive a deterministic Shiprocket transaction identity.
 * Primary: use the real provider transaction_id.
 * Fallback: SHA-256 fingerprint of all stable distinguishing fields so that
 * two distinct charges on the same AWB/timestamp are never collapsed.
 */
export function shiprocketTxId(row) {
  const transactionId = normalizeIdentityPart(row?.transaction_id);
  if (transactionId) return transactionId;
  const fingerprint = [
    normalizeIdentityPart(row?.created_at),
    normalizeIdentityPart(row?.awb_code),
    normalizeIdentityPart(row?.order_id),
    normalizeIdentityPart(row?.channel_order_id),
    normalizeIdentityPart(row?.description),
    normalizeAmountIdentityPart(row?.debit_amount),
    normalizeAmountIdentityPart(row?.credit_amount),
  ].join("|");
  return "sr-fp-" + createHash("sha256").update(fingerprint).digest("hex").slice(0, 32);
}

function normalizeIdentityPart(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function normalizeAmountIdentityPart(value) {
  const amount = parseAmount(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "";
}

function parseAmount(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  const normalized = String(value).replace(/,/g, "").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthDateRange(month) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return {
    fromDate: start,
    toDateExclusive: end,
    fromDateOnly: start.toISOString().slice(0, 10),
    toDateOnly: new Date(end.getTime() - 1).toISOString().slice(0, 10),
    fromDateTime: start.toISOString(),
    toDateTime: new Date(end.getTime() - 1).toISOString(),
  };
}

function isIsoDateInMonth(value, month) {
  if (!value) {
    return false;
  }
  return String(value).slice(0, 7) === month;
}

function classifyShiprocketExpenseType(description, amount) {
  const desc = String(description || "").toUpperCase();
  if (amount < 0) {
    return "SHIPROCKET_CREDIT";
  }
  if (desc.includes("RTO")) {
    return "SHIPROCKET_RTO";
  }
  if (desc.includes("WEIGHT") || desc.includes("DISCREPANCY")) {
    return "SHIPROCKET_WEIGHT_ADJUSTMENT";
  }
  if (desc.includes("FORWARD") || desc.includes("FREIGHT")) {
    return "SHIPROCKET_FORWARD";
  }
  return "SHIPROCKET_OTHER";
}

export function normalizeShiprocketStatementRow(row, month) {
  const description = String(row?.description || "").trim();
  if (description.toUpperCase() === "WALLET BALANCE") {
    return null;
  }

  const debit = parseAmount(row?.debit_amount);
  const credit = parseAmount(row?.credit_amount);
  const amount = Number((debit - credit).toFixed(2));

  if (amount === 0) {
    return null;
  }

  return {
    provider: "SHIPROCKET",
    expenseDate: row?.created_at ? String(row.created_at).slice(0, 10) : `${month}-01`,
    amount,
    currency: normalizeIdentityPart(row?.currency) || normalizeIdentityPart(row?.currency_code) || "INR",
    reference: description || `Charge AWB ${normalizeIdentityPart(row?.awb_code) || normalizeIdentityPart(row?.order_id) || "UNKNOWN"}`,
    expenseType: classifyShiprocketExpenseType(description, amount),
    rawSourceReference: shiprocketTxId(row),
    hasRealTransactionId: Boolean(normalizeIdentityPart(row?.transaction_id)),
    debit,
    credit,
  };
}

export function getShiprocketStatementPageInfo(payload, page, pageSize, batchLength) {
  const totalPages = Number(
    payload?.meta?.pagination?.total_pages
    || payload?.meta?.total_pages
    || payload?.pagination?.total_pages
    || payload?.paginate?.total_pages
    || payload?.total_pages
    || 0,
  );
  if (Number.isFinite(totalPages) && totalPages > 0) {
    return { hasNextPage: page < totalPages, totalPages };
  }
  return { hasNextPage: batchLength === pageSize, totalPages: page + (batchLength === pageSize ? 1 : 0) };
}

async function fetchShiprocketStatementDiagnostics(month) {
  if (!isShiprocketConfigured()) {
    return {
      configured: false,
      month,
      rows: [],
      normalizedRows: [],
      metrics: {
        pagesFetched: 0,
        rowsReturned: 0,
        debitRows: 0,
        creditRows: 0,
        skippedRows: 0,
        rowsWithRealTransactionId: 0,
        rowsRequiringFallbackId: 0,
        grossDebitTotal: 0,
        grossCreditTotal: 0,
        netExpense: 0,
        currency: "INR",
      },
    };
  }

  await ensureShiprocketAuth();
  const { fromDateOnly: from, toDateOnly: to } = monthDateRange(month);
  const token = getCachedShiprocketToken();
  const rows = [];
  const normalizedRows = [];
  const metrics = {
    pagesFetched: 0,
    rowsReturned: 0,
    debitRows: 0,
    creditRows: 0,
    skippedRows: 0,
    rowsWithRealTransactionId: 0,
    rowsRequiringFallbackId: 0,
    grossDebitTotal: 0,
    grossCreditTotal: 0,
    netExpense: 0,
    currency: "INR",
  };

  let page = 1;
  let keepFetching = true;
  while (keepFetching) {
    const url = new URL(`${getShiprocketBaseUrl()}/v1/external/account/details/statement`);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(SHIPROCKET_STATEMENT_PAGE_SIZE));

    const payload = await shiprocketRequest(
      url,
      { headers: { Authorization: `Bearer ${token}` } },
      {
        operation: "shiprocket_statement",
        respectRetryAfter: true,
        refresh: ensureShiprocketAuth,
        onLog: logNetworkEntry,
        createError: createShiprocketError,
      },
    );

    const batch = Array.isArray(payload?.data) ? payload.data : [];
    if (!batch.length) {
      break;
    }

    metrics.pagesFetched += 1;
    metrics.rowsReturned += batch.length;
    rows.push(...batch);

    for (const row of batch) {
      const normalized = normalizeShiprocketStatementRow(row, month);
      if (!normalized) {
        metrics.skippedRows += 1;
        continue;
      }

      normalizedRows.push(normalized);
      metrics.currency = normalized.currency || metrics.currency;
      metrics.grossDebitTotal += normalized.debit;
      metrics.grossCreditTotal += normalized.credit;
      metrics.netExpense += normalized.amount;
      if (normalized.amount < 0) {
        metrics.creditRows += 1;
      } else {
        metrics.debitRows += 1;
      }
      if (normalized.hasRealTransactionId) {
        metrics.rowsWithRealTransactionId += 1;
      } else {
        metrics.rowsRequiringFallbackId += 1;
      }
    }

    const pageInfo = getShiprocketStatementPageInfo(payload, page, SHIPROCKET_STATEMENT_PAGE_SIZE, batch.length);
    keepFetching = pageInfo.hasNextPage;
    page += 1;
  }

  metrics.grossDebitTotal = Number(metrics.grossDebitTotal.toFixed(2));
  metrics.grossCreditTotal = Number(metrics.grossCreditTotal.toFixed(2));
  metrics.netExpense = Number(metrics.netExpense.toFixed(2));

  return { configured: true, month, rows, normalizedRows, metrics };
}

export async function inspectShiprocketExpenseSource(month) {
  const { fromDateOnly: start, toDateOnly: end } = monthDateRange(month);
  try {
    const [statement, shipments] = await Promise.all([
      fetchShiprocketStatementDiagnostics(month),
      fetchOrderMappingShiprocketShipments({ start, end }),
    ]);

    const knownAwbs = new Set(
      (shipments.shipments || [])
        .map((shipment) => normalizeIdentityPart(shipment.awb))
        .filter(Boolean),
    );
    const statementAwbs = new Set(
      statement.rows
        .map((row) => normalizeIdentityPart(row?.awb_code))
        .filter(Boolean),
    );
    const matchedKnownAwbs = [...knownAwbs].filter((awb) => statementAwbs.has(awb)).length;

    if (!statement.configured) {
      return {
        apiActivity: null,
        apiActivityState: PROVIDER_ACTIVITY_STATES.UNAVAILABLE,
        apiActivitySource: "ACCOUNT_STATEMENT",
        apiActivityCoverage: "MERCHANT_SHIPPING_CHARGES",
        apiActivityReason: "SHIPROCKET_NOT_CONFIGURED",
        diagnostics: {
          knownShipments: shipments.shipments?.length || 0,
          knownAwbs: knownAwbs.size,
          statementRows: 0,
          matchedKnownAwbs,
        },
      };
    }

    if (statement.normalizedRows.length > 0) {
      return {
        apiActivity: statement.metrics.netExpense,
        apiActivityState: PROVIDER_ACTIVITY_STATES.AVAILABLE,
        apiActivitySource: "ACCOUNT_STATEMENT",
        apiActivityCoverage: "MERCHANT_SHIPPING_CHARGES",
        apiActivityReason: null,
        diagnostics: {
          ...statement.metrics,
          knownShipments: shipments.shipments?.length || 0,
          knownAwbs: knownAwbs.size,
          matchedKnownAwbs,
        },
      };
    }

    return {
      apiActivity: null,
      apiActivityState: PROVIDER_ACTIVITY_STATES.UNAVAILABLE,
      apiActivitySource: "ACCOUNT_STATEMENT",
      apiActivityCoverage: "MERCHANT_SHIPPING_CHARGES",
      apiActivityReason:
        (shipments.shipments?.length || 0) > 0
          ? "STATEMENT_API_DID_NOT_EXPOSE_MERCHANT_SHIPPING_DEBITS"
          : "STATEMENT_API_DID_NOT_EXPOSE_AUTHORITATIVE_EXPENSE_ROWS",
      diagnostics: {
        ...statement.metrics,
        knownShipments: shipments.shipments?.length || 0,
        knownAwbs: knownAwbs.size,
        matchedKnownAwbs,
      },
    };
  } catch (error) {
    return {
      apiActivity: null,
      apiActivityState: PROVIDER_ACTIVITY_STATES.ERROR,
      apiActivitySource: "ACCOUNT_STATEMENT",
      apiActivityCoverage: "MERCHANT_SHIPPING_CHARGES",
      apiActivityReason: error.message || "SHIPROCKET_ACTIVITY_CHECK_FAILED",
      diagnostics: null,
    };
  }
}

export function shopifyOrderFeeId(transactionId, feeIndex) {
  return `shopify-fee-${transactionId}-${feeIndex}`;
}

export function normalizeShopifyOrderTransactionFee({ order, transaction, fee, feeIndex, month }) {
  const amount = parseAmount(fee?.amount?.amount);
  if (amount <= 0) {
    return null;
  }

  return {
    provider: "SHOPIFY",
    expenseDate: order?.processedAt ? String(order.processedAt).slice(0, 10) : `${month}-01`,
    amount,
    currency: normalizeIdentityPart(fee?.amount?.currencyCode) || "INR",
    feeTaxAmount: parseAmount(fee?.taxAmount?.amount),
    reference: `Transaction fee for order ${order?.name || order?.id || "UNKNOWN"} (${transaction?.gateway || "unknown"})`,
    expenseType: "SHOPIFY_TRANSACTION_FEES",
    rawSourceReference: shopifyOrderFeeId(transaction?.id, feeIndex),
  };
}

export function normalizeShopifyBalanceTransaction(balanceTransaction) {
  const feeAmount = parseAmount(balanceTransaction?.fee?.amount);
  if (feeAmount <= 0) {
    return null;
  }

  return {
    provider: "SHOPIFY",
    expenseDate: balanceTransaction?.transactionDate ? String(balanceTransaction.transactionDate).slice(0, 10) : null,
    amount: feeAmount,
    currency: normalizeIdentityPart(balanceTransaction?.fee?.currencyCode)
      || normalizeIdentityPart(balanceTransaction?.amount?.currencyCode)
      || "INR",
    feeTaxAmount: 0,
    reference: `Shopify Payments ${normalizeIdentityPart(balanceTransaction?.type) || "transaction"}${balanceTransaction?.sourceOrderTransactionId ? ` (${balanceTransaction.sourceOrderTransactionId})` : ""}`,
    expenseType: "SHOPIFY_PAYMENTS_BALANCE_TRANSACTION_FEE",
    rawSourceReference: normalizeIdentityPart(balanceTransaction?.id),
  };
}

function isShopifyPaymentsGatewayLabel(value) {
  return /shopify payments/i.test(String(value || ""));
}

function completeStateForBillCountAndStatus(total, billCount, statuses) {
  if (billCount === 0) {
    return total > 0 ? "INCOMPLETE" : "NO_BILLS";
  }
  return statuses.has("MISSING_DOCUMENT") || statuses.has("FAILED") ? "INCOMPLETE" : "COMPLETE";
}

function finalizeProviderCompleteness({ completeness, billCount, apiActivityState, apiActivityAmount }) {
  if (
    apiActivityState === PROVIDER_ACTIVITY_STATES.UNAVAILABLE
    || apiActivityState === PROVIDER_ACTIVITY_STATES.ERROR
  ) {
    return "UNKNOWN";
  }
  if (
    (apiActivityState === PROVIDER_ACTIVITY_STATES.AVAILABLE || apiActivityState === PROVIDER_ACTIVITY_STATES.PARTIAL)
    && Number(apiActivityAmount || 0) > 0
    && billCount === 0
  ) {
    return "INCOMPLETE";
  }
  return completeness;
}

function buildMetaActivitySummary(apiSum, configured) {
  if (!configured) {
    return {
      apiActivity: null,
      apiActivityState: PROVIDER_ACTIVITY_STATES.UNAVAILABLE,
      apiActivitySource: "META_DAILY_INSIGHTS",
      apiActivityCoverage: "FULL",
      apiActivityReason: "META_NOT_CONFIGURED",
    };
  }
  if (apiSum.total > 0) {
    return {
      apiActivity: apiSum.total,
      apiActivityState: PROVIDER_ACTIVITY_STATES.AVAILABLE,
      apiActivitySource: "META_DAILY_INSIGHTS",
      apiActivityCoverage: "FULL",
      apiActivityReason: null,
    };
  }
  return {
    apiActivity: 0,
    apiActivityState: PROVIDER_ACTIVITY_STATES.ZERO_VERIFIED,
    apiActivitySource: "META_DAILY_INSIGHTS",
    apiActivityCoverage: "FULL",
    apiActivityReason: null,
  };
}

/**
 * Perform a month-wise synchronization of Meta Ads accrued spend activity
 * into our local expected provider expenses.
 *
 * @param {string} month - YYYY-MM
 * @param {boolean} bypassCache
 * @returns {Promise<{ provider: string, status: string, count: number }>}
 */
export async function syncMetaExpenses(month, bypassCache = false) {
  const startedAt = new Date();
  let count = 0;
  try {
    logInfo("Expense sync started", { provider: "META", month });

    // Boundary range for target month
    const since = `${month}-01`;
    const until = `${month}-31`; // parseMetaDateRange handles end-date boundary clipping

    // Reuses canonical Daily Insights which handles time_increment: 1
    const dailyData = await fetchMetaDailyInsights({ since, until }, bypassCache);

    for (const day of dailyData) {
      if (day.spend > 0) {
        await upsertProviderExpense({
          provider: "META",
          expenseDate: day.date,
          amount: day.spend,
          currency: "INR",
          reference: `Spend on ${day.date}`,
          expenseType: "AD_SPEND",
          rawSourceReference: `meta-spend-${day.date}`,
        });
        count++;
      }
    }

    addNetworkLog({
      provider: "meta",
      operationName: "Meta Expense Sync",
      method: "GET",
      endpoint: `/insights/daily?month=${month}`,
      statusCode: 200,
      status: "success",
      durationMs: Date.now() - startedAt.getTime(),
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    });

    logInfo("Meta expense sync completed", { provider: "META", month, count });
    return { provider: "META", status: "SUCCESS", count };
  } catch (err) {
    logError("Meta expense sync failed", err, { provider: "META", month });
    addNetworkLog({
      provider: "meta",
      operationName: "Meta Expense Sync",
      method: "GET",
      endpoint: `/insights/daily?month=${month}`,
      statusCode: 500,
      status: "failed",
      errorMessage: err.message,
      durationMs: Date.now() - startedAt.getTime(),
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    });
    throw err;
  }
}

function createShiprocketError({ status }) {
  const message =
    status === 401
      ? "Shiprocket authentication failed"
      : status === 429
        ? "Shiprocket rate limit reached"
        : `Shiprocket API request failed (${status})`;
  const error = new Error(message);
  error.category =
    status === 401
      ? "shiprocket_authentication"
      : status === 429
        ? "shiprocket_rate_limit"
        : "shiprocket_api";
  return error;
}

function logNetworkEntry(entry) {
  try {
    addNetworkLog({
      provider: "shiprocket",
      operationName: `${entry.method} ${entry.endpoint}`,
      method: entry.method,
      endpoint: entry.endpoint,
      statusCode: entry.statusCode,
      status: entry.status === "failed" ? "failed" : "success",
      durationMs: entry.durationMs,
      errorMessage: entry.errorSummary,
      startedAt: entry.startedAt.toISOString(),
      completedAt: entry.completedAt.toISOString(),
    });
  } catch (e) {
    // Diagnostics must never break provider calls.
  }
}

async function ensureShiprocketAuth() {
  if (!getCachedShiprocketToken()) {
    const payload = await authenticateShiprocket({
      operation: "shiprocket_auth",
      onLog: logNetworkEntry,
      createError: createShiprocketError,
    });
    if (!payload.token) {
      const error = new Error("Shiprocket authentication failed");
      error.category = "shiprocket_authentication";
      throw error;
    }
    setCachedShiprocketToken(payload.token);
  }
}

/**
 * Retrieve Shiprocket statement logistics charges.
 */
export async function syncShiprocketExpenses(month) {
  try {
    logInfo("Expense sync started", { provider: "SHIPROCKET", month });
    const activity = await inspectShiprocketExpenseSource(month);
    if (activity.apiActivityState !== PROVIDER_ACTIVITY_STATES.AVAILABLE) {
      return {
        provider: "SHIPROCKET",
        status: activity.apiActivityState === PROVIDER_ACTIVITY_STATES.ERROR ? "ERROR" : "UNAVAILABLE",
        reason: activity.apiActivityReason,
        capability: activity,
      };
    }

    const diagnostics = await fetchShiprocketStatementDiagnostics(month);
    for (const row of diagnostics.normalizedRows) {
      await upsertProviderExpense(row);
    }

    logInfo("Shiprocket expense sync completed", {
      provider: "SHIPROCKET",
      month,
      count: diagnostics.normalizedRows.length,
      metrics: diagnostics.metrics,
    });
    return {
      provider: "SHIPROCKET",
      status: "SUCCESS",
      count: diagnostics.normalizedRows.length,
      metrics: diagnostics.metrics,
      capability: activity,
    };
  } catch (err) {
    logError("Shiprocket expense sync failed", err, { provider: "SHIPROCKET", month });
    throw err;
  }
}

/**
 * Inspect current Shopify expense capabilities using the canonical GraphQL client.
 */
export async function inspectShopifyExpenseCapability() {
  const capability = getShopifyCapability();
  if (!capability.available) {
    return {
      installedScopes: [],
      orderTransactionFees: "MISSING_SCOPE",
      shopifyPaymentsConfigured: "UNKNOWN",
      shopifyPaymentsBalanceTransactions: "MISSING_SCOPE",
      canonicalSource: "UNAVAILABLE",
      reason: "SHOPIFY_NOT_CONFIGURED",
    };
  }

  const scopeData = await shopifyGraphQL(`
    query ExpenseScopeProbe {
      currentAppInstallation {
        accessScopes {
          handle
        }
      }
    }
  `);
  const installedScopes = (scopeData?.currentAppInstallation?.accessScopes || []).map((scope) => scope.handle);
  const hasOrderScope = installedScopes.includes("read_orders") || installedScopes.includes("read_all_orders");

  let orderTransactionFees = hasOrderScope ? "AVAILABLE" : "MISSING_SCOPE";
  if (hasOrderScope) {
    try {
      await shopifyGraphQL(`
        query ExpenseOrderFeesProbe {
          orders(first: 1, sortKey: PROCESSED_AT, reverse: true) {
            nodes {
              id
              transactions {
                id
                fees {
                  amount {
                    amount
                    currencyCode
                  }
                  type
                }
              }
            }
          }
        }
      `);
    } catch (error) {
      orderTransactionFees = classifyShopifyCapabilityError(error);
    }
  }

  let shopifyPaymentsConfigured = "UNKNOWN";
  let shopifyPaymentsBalanceTransactions = "UNSUPPORTED";
  try {
    const paymentsData = await shopifyGraphQL(`
      query ExpensePaymentsProbe {
        shopifyPaymentsAccount {
          id
          balanceTransactions(first: 1) {
            nodes {
              id
            }
          }
        }
      }
    `);
    if (paymentsData?.shopifyPaymentsAccount?.id) {
      shopifyPaymentsConfigured = "YES";
      shopifyPaymentsBalanceTransactions = "AVAILABLE";
    } else {
      shopifyPaymentsConfigured = "NO";
      shopifyPaymentsBalanceTransactions = "NOT_CONFIGURED";
    }
  } catch (error) {
    const state = classifyShopifyCapabilityError(error);
    if (state === "MISSING_SCOPE") {
      shopifyPaymentsConfigured = "UNKNOWN";
      shopifyPaymentsBalanceTransactions = "MISSING_SCOPE";
    } else {
      shopifyPaymentsConfigured = "UNKNOWN";
      shopifyPaymentsBalanceTransactions = state;
    }
  }

  const canonicalSource = chooseShopifyCanonicalSource({
    orderTransactionFees,
    shopifyPaymentsBalanceTransactions,
  });

  return {
    installedScopes,
    orderTransactionFees,
    shopifyPaymentsConfigured,
    shopifyPaymentsBalanceTransactions,
    canonicalSource,
  };
}

export function chooseShopifyCanonicalSource({ orderTransactionFees, shopifyPaymentsBalanceTransactions }) {
  if (shopifyPaymentsBalanceTransactions === "AVAILABLE") {
    return "SHOPIFY_PAYMENTS_BALANCE_TRANSACTIONS";
  }
  if (orderTransactionFees === "AVAILABLE") {
    return "ORDER_TRANSACTION_FEES";
  }
  return "UNAVAILABLE";
}

function classifyShopifyCapabilityError(error) {
  const message = String(error?.message || "");
  if (/access denied|scope|permission/i.test(message)) {
    return "MISSING_SCOPE";
  }
  if (/shopifypaymentsaccount|field .* doesn't exist|cannot query field/i.test(message)) {
    return "UNSUPPORTED";
  }
  return "UNSUPPORTED";
}

async function fetchShopifyPaymentsBalanceTransactions(month) {
  const rows = [];
  let hasNextPage = true;
  let cursor = null;
  let pagesFetched = 0;

  while (hasNextPage) {
    const payload = await shopifyGraphQL(
      `
        query FetchPaymentsBalanceTransactions($cursor: String) {
          shopifyPaymentsAccount {
            balanceTransactions(first: ${SHOPIFY_PAYMENTS_PAGE_SIZE}, after: $cursor) {
              nodes {
                id
                transactionDate
                type
                sourceOrderTransactionId
                amount {
                  amount
                  currencyCode
                }
                fee {
                  amount
                  currencyCode
                }
                net {
                  amount
                  currencyCode
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
      { cursor },
    );

    const connection = payload?.shopifyPaymentsAccount?.balanceTransactions;
    const batch = connection?.nodes || [];
    pagesFetched += 1;
    rows.push(...batch.filter((node) => isIsoDateInMonth(node?.transactionDate, month)));
    hasNextPage = connection?.pageInfo?.hasNextPage || false;
    cursor = connection?.pageInfo?.endCursor || null;
  }

  return { rows, pagesFetched };
}

async function fetchShopifyOrderFeeRows(month) {
  const { fromDateTime: since, toDateTime: until } = monthDateRange(month);
  let hasNextPage = true;
  let cursor = null;
  let pagesFetched = 0;
  let ordersInspected = 0;
  let transactionsInspected = 0;
  const rows = [];
  const currencies = new Set();
  const gateways = new Map();
  let shopifyPaymentsTransactions = 0;

  while (hasNextPage) {
    const payload = await shopifyGraphQL(
      `
        query FetchOrderFees($cursor: String, $dateQuery: String!) {
          orders(first: ${SHOPIFY_ORDER_PAGE_SIZE}, after: $cursor, query: $dateQuery) {
            nodes {
              id
              name
              processedAt
              transactions {
                id
                gateway
                formattedGateway
                kind
                status
                fees {
                  amount {
                    amount
                    currencyCode
                  }
                  taxAmount {
                    amount
                    currencyCode
                  }
                  type
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      {
        cursor,
        dateQuery: `created_at:>=${since} AND created_at:<=${until}`,
      },
    );

    const orders = payload?.orders?.nodes || [];
    pagesFetched += 1;
    ordersInspected += orders.length;

    for (const order of orders) {
      const transactions = order?.transactions || [];
      transactionsInspected += transactions.length;
      for (const transaction of transactions) {
        const gatewayKey = [
          normalizeIdentityPart(transaction?.gateway) || "null",
          normalizeIdentityPart(transaction?.formattedGateway) || "null",
          normalizeIdentityPart(transaction?.kind) || "null",
          normalizeIdentityPart(transaction?.status) || "null",
        ].join(" | ");
        const existingGateway = gateways.get(gatewayKey) || { transactions: 0, feeRows: 0 };
        existingGateway.transactions += 1;
        existingGateway.feeRows += (transaction?.fees || []).length;
        gateways.set(gatewayKey, existingGateway);
        if (
          isShopifyPaymentsGatewayLabel(transaction?.gateway)
          || isShopifyPaymentsGatewayLabel(transaction?.formattedGateway)
        ) {
          shopifyPaymentsTransactions += 1;
        }
        const fees = transaction?.fees || [];
        for (let feeIndex = 0; feeIndex < fees.length; feeIndex += 1) {
          const normalized = normalizeShopifyOrderTransactionFee({
            order,
            transaction,
            fee: fees[feeIndex],
            feeIndex,
            month,
          });
          if (!normalized) {
            continue;
          }
          currencies.add(normalized.currency);
          rows.push(normalized);
        }
      }
    }

    hasNextPage = payload?.orders?.pageInfo?.hasNextPage || false;
    cursor = payload?.orders?.pageInfo?.endCursor || null;
  }

  return {
    rows,
    pagesFetched,
    ordersInspected,
    transactionsInspected,
    currencies: [...currencies],
    gateways: [...gateways.entries()].map(([key, value]) => ({ key, ...value })),
    shopifyPaymentsTransactions,
  };
}

export async function inspectShopifyExpenseSource(month) {
  try {
    const capability = await inspectShopifyExpenseCapability();
    const source = capability.canonicalSource === "UNAVAILABLE"
      ? "ORDER_TRANSACTION_FEES"
      : capability.canonicalSource;

    if (capability.orderTransactionFees === "MISSING_SCOPE") {
      return {
        apiActivity: null,
        apiActivityState: PROVIDER_ACTIVITY_STATES.UNAVAILABLE,
        apiActivitySource: source,
        apiActivityCoverage: "PAYMENT_FEES_ONLY",
        apiActivityReason: "SHOPIFY_ORDER_SCOPE_MISSING",
        capability,
        diagnostics: null,
      };
    }

    const orderFeeProbe = capability.orderTransactionFees === "AVAILABLE"
      ? await fetchShopifyOrderFeeRows(month)
      : {
          rows: [],
          pagesFetched: 0,
          ordersInspected: 0,
          transactionsInspected: 0,
          currencies: [],
          gateways: [],
          shopifyPaymentsTransactions: 0,
        };

    if (capability.shopifyPaymentsBalanceTransactions === "AVAILABLE") {
      const balanceResult = await fetchShopifyPaymentsBalanceTransactions(month);
      const balanceRows = balanceResult.rows
        .map((row) => normalizeShopifyBalanceTransaction(row))
        .filter(Boolean);
      if (balanceRows.length > 0) {
        return {
          apiActivity: Number(balanceRows.reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
          apiActivityState: PROVIDER_ACTIVITY_STATES.PARTIAL,
          apiActivitySource: "SHOPIFY_PAYMENTS_BALANCE_TRANSACTIONS",
          apiActivityCoverage: "PAYMENT_FEES_ONLY",
          apiActivityReason: "SHOPIFY_PLAN_AND_APP_BILLS_REQUIRE_MANUAL_UPLOAD",
          capability,
          diagnostics: {
            pagesFetched: balanceResult.pagesFetched,
            ordersInspected: orderFeeProbe.ordersInspected,
            transactionsInspected: orderFeeProbe.transactionsInspected,
            feeRecordsFound: balanceRows.length,
            currencies: [...new Set(balanceRows.map((row) => row.currency).filter(Boolean))],
            gateways: orderFeeProbe.gateways,
            shopifyPaymentsTransactions: orderFeeProbe.shopifyPaymentsTransactions,
          },
        };
      }

      return {
        apiActivity: 0,
        apiActivityState: PROVIDER_ACTIVITY_STATES.ZERO_VERIFIED,
        apiActivitySource: "SHOPIFY_PAYMENTS_BALANCE_TRANSACTIONS",
        apiActivityCoverage: "PAYMENT_FEES_ONLY",
        apiActivityReason: "SHOPIFY_PLAN_AND_APP_BILLS_REQUIRE_MANUAL_UPLOAD",
        capability,
        diagnostics: {
          pagesFetched: balanceResult.pagesFetched,
          ordersInspected: orderFeeProbe.ordersInspected,
          transactionsInspected: orderFeeProbe.transactionsInspected,
          feeRecordsFound: 0,
          currencies: [],
          gateways: orderFeeProbe.gateways,
          shopifyPaymentsTransactions: orderFeeProbe.shopifyPaymentsTransactions,
        },
      };
    }

    if (orderFeeProbe.rows.length > 0) {
      return {
        apiActivity: Number(orderFeeProbe.rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
        apiActivityState: PROVIDER_ACTIVITY_STATES.PARTIAL,
        apiActivitySource: "ORDER_TRANSACTION_FEES",
        apiActivityCoverage: "PAYMENT_FEES_ONLY",
        apiActivityReason: "SHOPIFY_PLAN_AND_APP_BILLS_REQUIRE_MANUAL_UPLOAD",
        capability,
        diagnostics: {
          pagesFetched: orderFeeProbe.pagesFetched,
          ordersInspected: orderFeeProbe.ordersInspected,
          transactionsInspected: orderFeeProbe.transactionsInspected,
          feeRecordsFound: orderFeeProbe.rows.length,
          currencies: orderFeeProbe.currencies,
          gateways: orderFeeProbe.gateways,
          shopifyPaymentsTransactions: orderFeeProbe.shopifyPaymentsTransactions,
        },
      };
    }

    const missingScope = capability.shopifyPaymentsBalanceTransactions === "MISSING_SCOPE";
    const hasShopifyPaymentsTransactions = orderFeeProbe.shopifyPaymentsTransactions > 0;
    return {
      apiActivity: null,
      apiActivityState: PROVIDER_ACTIVITY_STATES.UNAVAILABLE,
      apiActivitySource: source,
      apiActivityCoverage: "PAYMENT_FEES_ONLY",
      apiActivityReason: missingScope
        ? hasShopifyPaymentsTransactions
          ? "SHOPIFY_PAYMENTS_SCOPES_MISSING"
          : "NO_SHOPIFY_PAYMENTS_FEE_SOURCE_FOR_CURRENT_TRANSACTIONS"
        : "ORDER_TRANSACTION_FEES_DID_NOT_EXPOSE_FEE_ROWS",
      capability,
      diagnostics: {
        pagesFetched: orderFeeProbe.pagesFetched,
        ordersInspected: orderFeeProbe.ordersInspected,
        transactionsInspected: orderFeeProbe.transactionsInspected,
        feeRecordsFound: 0,
        currencies: orderFeeProbe.currencies,
        gateways: orderFeeProbe.gateways,
        shopifyPaymentsTransactions: orderFeeProbe.shopifyPaymentsTransactions,
      },
    };
  } catch (error) {
    return {
      apiActivity: null,
      apiActivityState: PROVIDER_ACTIVITY_STATES.ERROR,
      apiActivitySource: "ORDER_TRANSACTION_FEES",
      apiActivityCoverage: "PAYMENT_FEES_ONLY",
      apiActivityReason: error.message || "SHOPIFY_ACTIVITY_CHECK_FAILED",
      capability: null,
      diagnostics: null,
    };
  }
}

/**
 * Retrieve real Shopify transaction fees using OrderTransaction GQL.
 */
export async function syncShopifyExpenses(month) {
  try {
    logInfo("Expense sync started", { provider: "SHOPIFY", month });
    const activity = await inspectShopifyExpenseSource(month);
    if (
      activity.apiActivityState !== PROVIDER_ACTIVITY_STATES.PARTIAL
      && activity.apiActivityState !== PROVIDER_ACTIVITY_STATES.AVAILABLE
      && activity.apiActivityState !== PROVIDER_ACTIVITY_STATES.ZERO_VERIFIED
    ) {
      return {
        provider: "SHOPIFY",
        status: activity.apiActivityState === PROVIDER_ACTIVITY_STATES.ERROR ? "ERROR" : "UNAVAILABLE",
        reason: activity.apiActivityReason || "SHOPIFY_EXPENSE_SOURCE_UNAVAILABLE",
        capability: activity.capability,
        diagnostics: activity.diagnostics,
      };
    }

    let rows = [];
    let pagesFetched = 0;
    let ordersInspected = 0;
    let transactionsInspected = 0;
    let currencies = [];

    if (activity.apiActivitySource === "SHOPIFY_PAYMENTS_BALANCE_TRANSACTIONS") {
      const balanceResult = await fetchShopifyPaymentsBalanceTransactions(month);
      rows = balanceResult.rows
        .map((row) => normalizeShopifyBalanceTransaction(row))
        .filter(Boolean);
      pagesFetched = balanceResult.pagesFetched;
      currencies = [...new Set(rows.map((row) => row.currency).filter(Boolean))];
    } else if (activity.apiActivitySource === "ORDER_TRANSACTION_FEES") {
      const feeResult = await fetchShopifyOrderFeeRows(month);
      rows = feeResult.rows;
      pagesFetched = feeResult.pagesFetched;
      ordersInspected = feeResult.ordersInspected;
      transactionsInspected = feeResult.transactionsInspected;
      currencies = feeResult.currencies;
    }

    for (const row of rows) {
      await upsertProviderExpense(row);
    }

    logInfo("Shopify expense sync completed", {
      provider: "SHOPIFY",
      month,
      count: rows.length,
      canonicalSource: activity.apiActivitySource,
      pagesFetched,
    });
    return {
      provider: "SHOPIFY",
      status: "SUCCESS",
      count: rows.length,
      canonicalSource: activity.apiActivitySource,
      capability: activity.capability,
      metrics: {
        pagesFetched,
        ordersInspected,
        transactionsInspected,
        feeRecordsFound: rows.length,
        totalFeeAmount: Number(rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
        totalFeeTaxAmount: Number(rows.reduce((sum, row) => sum + (row.feeTaxAmount || 0), 0).toFixed(2)),
        currencies,
      },
    };
  } catch (err) {
    logError("Shopify expense sync failed", err, { provider: "SHOPIFY", month });
    throw err;
  }
}

/**
 * Orchestrate expense synchronization across all providers.
 *
 * @param {string} month - YYYY-MM
 * @param {boolean} bypassCache
 * @returns {Promise<{ success: boolean, results: Array<any>, errors: Array<string> }>}
 */
export async function syncAllExpenses(month, bypassCache = false) {
  const results = [];
  const errors = [];

  // Meta Sync
  try {
    const metaRes = await syncMetaExpenses(month, bypassCache);
    results.push(metaRes);
  } catch (err) {
    errors.push(`Meta Ads: ${err.message}`);
  }

  // Shiprocket Sync
  try {
    const srRes = await syncShiprocketExpenses(month);
    results.push(srRes);
  } catch (err) {
    errors.push(`Shiprocket: ${err.message}`);
  }

  // Shopify Sync
  try {
    const shopRes = await syncShopifyExpenses(month);
    results.push(shopRes);
  } catch (err) {
    errors.push(`Shopify: ${err.message}`);
  }

  logInfo("Expense sync completed", { month, succeededCount: results.length, failedCount: errors.length });

  return {
    success: errors.length === 0,
    results,
    errors,
  };
}

/**
 * Retrieve consolidated monthly expense summary.
 *
 * @param {string} month - YYYY-MM
 * @returns {object}
 */
export async function getMonthlyConsolidatedSummary(month) {
  const bills = await listExpenseBills(month);

  // Aggregate totals by provider
  const providerTotals = {
    META: { total: 0, billCount: 0, statuses: new Set(), completeness: "NO_BILLS" },
    SHIPROCKET: { total: 0, billCount: 0, statuses: new Set(), completeness: "NO_BILLS" },
    SHOPIFY: { total: 0, billCount: 0, statuses: new Set(), completeness: "NO_BILLS" },
  };

  let firstCurrency = null;
  let currencyMismatch = false;

  for (const b of bills) {
    if (!firstCurrency) {
      firstCurrency = b.currency;
    } else if (firstCurrency !== b.currency) {
      currencyMismatch = true;
    }

    const p = b.provider;
    if (providerTotals[p]) {
      providerTotals[p].total += b.total;
      providerTotals[p].billCount += 1;
      providerTotals[p].statuses.add(b.status || "UNKNOWN");
    }
  }

  const [metaApiSum, shiprocketApiSum, shopifyApiSum] = await Promise.all([
    getProviderExpensesSum("META", month),
    getProviderExpensesSum("SHIPROCKET", month),
    getProviderExpensesSum("SHOPIFY", month),
  ]);

  const [shiprocketActivity, shopifyActivity] = await Promise.all([
    shiprocketApiSum.total > 0
      ? Promise.resolve({
          apiActivity: shiprocketApiSum.total,
          apiActivityState: PROVIDER_ACTIVITY_STATES.AVAILABLE,
          apiActivitySource: "ACCOUNT_STATEMENT",
          apiActivityCoverage: "MERCHANT_SHIPPING_CHARGES",
          apiActivityReason: null,
        })
      : inspectShiprocketExpenseSource(month),
    shopifyApiSum.total > 0
      ? inspectShopifyExpenseSource(month).then((inspection) => ({
          ...inspection,
          apiActivity: shopifyApiSum.total,
          apiActivityState: PROVIDER_ACTIVITY_STATES.PARTIAL,
        }))
      : inspectShopifyExpenseSource(month),
  ]);

  const activityByProvider = {
    META: buildMetaActivitySummary(metaApiSum, getMetaCapability().available),
    SHIPROCKET: shiprocketActivity,
    SHOPIFY: shopifyActivity,
  };

  // Get expected provider API expenses / source state
  for (const p of ["META", "SHIPROCKET", "SHOPIFY"]) {
    const activity = activityByProvider[p];
    providerTotals[p].apiActivity = activity.apiActivity;
    providerTotals[p].apiExpense = activity.apiActivity;
    providerTotals[p].apiActivityState = activity.apiActivityState;
    providerTotals[p].apiActivitySource = activity.apiActivitySource;
    providerTotals[p].apiActivityCoverage = activity.apiActivityCoverage;
    providerTotals[p].apiActivityReason = activity.apiActivityReason;
    providerTotals[p].apiAvailable = ![
      PROVIDER_ACTIVITY_STATES.UNAVAILABLE,
      PROVIDER_ACTIVITY_STATES.ERROR,
    ].includes(activity.apiActivityState);
    providerTotals[p].difference = Number.isFinite(activity.apiActivity)
      ? providerTotals[p].total - activity.apiActivity
      : null;
    providerTotals[p].completeness = completeStateForBillCountAndStatus(
      providerTotals[p].total,
      providerTotals[p].billCount,
      providerTotals[p].statuses,
    );
    providerTotals[p].completeness = finalizeProviderCompleteness({
      completeness: providerTotals[p].completeness,
      billCount: providerTotals[p].billCount,
      apiActivityState: providerTotals[p].apiActivityState,
      apiActivityAmount: providerTotals[p].apiActivity,
    });
  }

  const totalExpense = Object.values(providerTotals).reduce((sum, item) => sum + item.total, 0);

  return {
    month,
    currency: currencyMismatch ? "CURRENCY_MISMATCH" : (firstCurrency || "INR"),
    totalExpense,
    providerTotals: Object.entries(providerTotals).map(([p, data]) => ({
      provider: p,
      total: data.total,
      billCount: data.billCount,
      completeness: data.completeness,
      apiActivity: Number.isFinite(data.apiActivity) ? data.apiActivity : null,
      apiExpense: Number.isFinite(data.apiExpense) ? data.apiExpense : null,
      apiActivityState: data.apiActivityState,
      apiActivitySource: data.apiActivitySource,
      apiActivityCoverage: data.apiActivityCoverage,
      apiActivityReason: data.apiActivityReason,
      difference: Number.isFinite(data.difference) ? data.difference : null,
      apiAvailable: data.apiAvailable,
    })),
  };
}
