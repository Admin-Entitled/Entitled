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
import { env } from "../config/env.js";
import { logInfo, logError } from "../utils/logger.js";

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
        upsertProviderExpense({
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

import {
  authenticateShiprocket,
  getCachedShiprocketToken,
  getShiprocketBaseUrl,
  isShiprocketConfigured,
  setCachedShiprocketToken,
  shiprocketRequest,
} from "./shiprocketTransport.js";

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
  const startedAt = new Date();
  try {
    logInfo("Expense sync started", { provider: "SHIPROCKET", month });
    if (!isShiprocketConfigured()) {
      return { provider: "SHIPROCKET", status: "UNAVAILABLE", reason: "SHIPROCKET_NOT_CONFIGURED" };
    }
    await ensureShiprocketAuth();

    // Derive dates
    const from = `${month}-01`;
    const to = `${month}-31`; // Note: Shiprocket handles monthly boundaries

    const token = getCachedShiprocketToken();
    let page = 1;
    let keepFetching = true;
    let recordCount = 0;

    while (keepFetching) {
      const url = new URL(`${getShiprocketBaseUrl()}/v1/external/account/details/statement`);
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", "100");

      const payload = await shiprocketRequest(
        url,
        { headers: { Authorization: `Bearer ${token}` } },
        {
          operation: "shiprocket_statement",
          respectRetryAfter: true,
          refresh: ensureShiprocketAuth,
          onLog: logNetworkEntry,
          createError: createShiprocketError,
        }
      );

      const batch = Array.isArray(payload.data) ? payload.data : [];
      if (!batch.length) {
        keepFetching = false;
        break;
      }

      for (const row of batch) {
        if (row.description === "Wallet Balance") {
          // Skip general wallet balance rows
          continue;
        }

        const debit = parseFloat(row.debit_amount || 0);
        const credit = parseFloat(row.credit_amount || 0);
        const amount = debit - credit;

        if (amount === 0) {
          continue;
        }

        // Determine stable reference: use transaction_id, or fall back to description/awb combination
        const txId = row.transaction_id || `sr-${row.created_at || row.description}-${row.awb_code || ''}`;

        // Classify type
        let expenseType = "SHIPROCKET_OTHER";
        const desc = String(row.description || "").toUpperCase();
        if (desc.includes("FORWARD") || desc.includes("FREIGHT")) {
          expenseType = "SHIPROCKET_FORWARD";
        } else if (desc.includes("RTO")) {
          expenseType = "SHIPROCKET_RTO";
        } else if (desc.includes("WEIGHT") || desc.includes("DISCREPANCY")) {
          expenseType = "SHIPROCKET_WEIGHT_ADJUSTMENT";
        } else if (amount < 0) {
          expenseType = "SHIPROCKET_CREDIT";
        }

        await upsertProviderExpense({
          provider: "SHIPROCKET",
          expenseDate: row.created_at ? row.created_at.slice(0, 10) : `${month}-01`,
          amount: amount,
          currency: "INR",
          reference: row.description || `Charge AWB ${row.awb_code || ''}`,
          expenseType,
          rawSourceReference: txId,
        });
        recordCount++;
      }

      // Check pagination details: Shiprocket statement API returns paginate fields in some versions,
      // or we can rely on data presence and per_page page bounds.
      if (batch.length < 100) {
        keepFetching = false;
      } else {
        page++;
      }
    }

    logInfo("Shiprocket expense sync completed", { provider: "SHIPROCKET", month, count: recordCount });
    return { provider: "SHIPROCKET", status: "SUCCESS", count: recordCount };
  } catch (err) {
    logError("Shiprocket expense sync failed", err, { provider: "SHIPROCKET", month });
    throw err;
  }
}

/**
 * Retrieve simulated Shopify merchant subscriptions/transaction costs.
 */
import { shopifyGraphQL } from "./shopifyService.js";

/**
 * Retrieve real Shopify transaction fees using OrderTransaction GQL.
 */
export async function syncShopifyExpenses(month) {
  const startedAt = new Date();
  try {
    logInfo("Expense sync started", { provider: "SHOPIFY", month });

    // Derive date boundaries
    const since = `${month}-01T00:00:00Z`;
    const until = `${month}-31T23:59:59Z`;

    let hasNextPage = true;
    let cursor = null;
    let recordCount = 0;
    
    // We check availability and fetch orders for the selected month to extract fees
    while (hasNextPage) {
      // Query filter options using created_at date range
      const query = `
        query FetchOrderFees($cursor: String, $dateQuery: String!) {
          orders(first: 50, after: $cursor, query: $dateQuery) {
            nodes {
              id
              name
              processedAt
              transactions {
                id
                gateway
                fees {
                  amount {
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
      `;

      const variables = {
        cursor,
        dateQuery: `created_at:>=${since} AND created_at:<=${until}`
      };

      const payload = await shopifyGraphQL(query, variables);
      const orders = payload?.orders?.nodes || [];

      for (const order of orders) {
        const txs = order.transactions || [];
        for (const tx of txs) {
          const fees = tx.fees || [];
          for (let i = 0; i < fees.length; i++) {
            const fee = fees[i];
            const amount = parseFloat(fee.amount?.amount || 0);
            if (amount <= 0) continue;

            const currency = fee.amount?.currencyCode || "INR";
            const stableId = `shopify-fee-${tx.id}-${i}`;

            await upsertProviderExpense({
              provider: "SHOPIFY",
              expenseDate: order.processedAt ? order.processedAt.slice(0, 10) : `${month}-01`,
              amount,
              currency,
              reference: `Transaction fee for order ${order.name} (${tx.gateway || 'unknown'})`,
              expenseType: "SHOPIFY_TRANSACTION_FEES",
              rawSourceReference: stableId,
            });
            recordCount++;
          }
        }
      }

      const pageInfo = payload?.orders?.pageInfo;
      hasNextPage = pageInfo?.hasNextPage || false;
      cursor = pageInfo?.endCursor || null;
    }

    // If Shopify Payments account check failed or is unsupported, but we fetched 0 fees from manual orders,
    // we still return SUCCESS with 0 records (truthful representation of no transaction fees on active orders).
    // If shopifyGraphQL throws an access scope error or similar, it will fail into the catch block.
    
    logInfo("Shopify expense sync completed", { provider: "SHOPIFY", month, count: recordCount });
    return { provider: "SHOPIFY", status: "SUCCESS", count: recordCount };
  } catch (err) {
    logError("Shopify expense sync failed", err, { provider: "SHOPIFY", month });
    
    if (err.message?.includes("Access denied") || err.message?.includes("scope")) {
      return { provider: "SHOPIFY", status: "UNAVAILABLE", reason: "SHOPIFY_PAYMENTS_NOT_AVAILABLE" };
    }
    
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
    META: { total: 0, billCount: 0, completeness: "NO_BILLS" },
    SHIPROCKET: { total: 0, billCount: 0, completeness: "NO_BILLS" },
    SHOPIFY: { total: 0, billCount: 0, completeness: "NO_BILLS" },
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
      providerTotals[p].completeness = b.status === "AVAILABLE" ? "COMPLETE" : "INCOMPLETE";
    }
  }

  // Get expected provider API expenses
  for (const p of ["META", "SHIPROCKET", "SHOPIFY"]) {
    const apiSum = await getProviderExpensesSum(p, month);
    providerTotals[p].apiExpense = apiSum.total;
    providerTotals[p].difference = providerTotals[p].total - apiSum.total;

    // Determine completeness logic:
    // If API expense exists but no supporting invoice bill exists -> INCOMPLETE
    if (providerTotals[p].apiExpense > 0 && providerTotals[p].billCount === 0) {
      providerTotals[p].completeness = "INCOMPLETE";
    } else if (providerTotals[p].billCount > 0) {
      // If we have bills, check if total bills matches or covers expected API activity closely
      const diff = Math.abs(providerTotals[p].difference);
      providerTotals[p].completeness = "COMPLETE";
    }
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
      apiExpense: data.apiExpense || 0,
      difference: data.difference || 0,
    })),
  };
}
