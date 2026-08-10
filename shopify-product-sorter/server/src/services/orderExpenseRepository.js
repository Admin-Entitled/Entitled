import { normalizeOrderMappingIdentifier } from "./orderMappingMatcher.js";
import { orderMappingQuery, orderMappingTable, withOrderMappingClient } from "./orderMappingDb.js";

const ordersTable = orderMappingTable("orders");
const shipmentsTable = orderMappingTable("shipments");
const importsTable = orderMappingTable("order_expense_imports");
const transactionsTable = orderMappingTable("order_expense_transactions");

function uniqueNormalized(values = []) {
  return [...new Set(values.map((value) => normalizeOrderMappingIdentifier(value)).filter(Boolean))];
}

function uniqueText(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function buildShipmentLookupMaps(rows) {
  const maps = {
    awb: new Map(),
    shiprocketShipmentId: new Map(),
    shiprocketOrderId: new Map(),
    channelOrderId: new Map(),
  };

  for (const row of rows) {
    const candidate = {
      orderId: row.order_id,
      shipmentId: row.shipment_id,
      shopifyOrderId: row.shopify_order_id,
      shopifyOrderNumber: row.shopify_order_number || row.shopify_order_name,
      awb: row.awb,
      shiprocketShipmentId: row.shiprocket_shipment_id,
      shiprocketOrderId: row.shiprocket_order_id,
      channelOrderId: row.channel_order_id,
      courier: row.courier,
    };

    for (const [key, value] of [
      ["awb", row.awb],
      ["shiprocketShipmentId", row.shiprocket_shipment_id],
      ["shiprocketOrderId", row.shiprocket_order_id],
      ["channelOrderId", row.channel_order_id],
    ]) {
      const normalized = normalizeOrderMappingIdentifier(value);
      if (!normalized) {
        continue;
      }
      if (!maps[key].has(normalized)) {
        maps[key].set(normalized, []);
      }
      maps[key].get(normalized).push(candidate);
    }
  }

  return maps;
}

function buildOrderNumberMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const candidate = {
      orderId: row.order_id,
      shipmentId: null,
      shopifyOrderId: row.shopify_order_id,
      shopifyOrderNumber: row.shopify_order_number || row.shopify_order_name,
      awb: null,
      shiprocketShipmentId: null,
      shiprocketOrderId: null,
      channelOrderId: null,
      courier: null,
    };

    for (const value of [row.shopify_order_number, row.shopify_order_name]) {
      const normalized = normalizeOrderMappingIdentifier(value);
      if (!normalized) {
        continue;
      }
      if (!map.has(normalized)) {
        map.set(normalized, []);
      }
      map.get(normalized).push(candidate);
    }
  }
  return map;
}

export async function getShiprocketPassbookLookupMaps({
  awbs = [],
  shiprocketShipmentIds = [],
  shiprocketOrderIds = [],
  channelOrderIds = [],
  shopifyOrderNumbers = [],
} = {}) {
  const normalizedAwbs = uniqueNormalized(awbs);
  const normalizedShipmentIds = uniqueNormalized(shiprocketShipmentIds);
  const normalizedOrderIds = uniqueNormalized(shiprocketOrderIds);
  const normalizedChannelOrderIds = uniqueNormalized(channelOrderIds);
  const normalizedShopifyOrderNumbers = uniqueNormalized(shopifyOrderNumbers);

  const shipmentRows = (
    await orderMappingQuery(
      `
        SELECT
          s.id AS shipment_id,
          s.order_id,
          s.awb,
          s.shiprocket_response_id AS shiprocket_shipment_id,
          s.shiprocket_order_reference AS shiprocket_order_id,
          s.shiprocket_channel_reference AS channel_order_id,
          s.courier,
          o.shopify_order_id,
          o.shopify_order_name,
          o.shopify_order_number
        FROM ${shipmentsTable} s
        JOIN ${ordersTable} o ON o.id = s.order_id
        WHERE
          upper(coalesce(s.awb, '')) = ANY($1::text[])
          OR upper(coalesce(s.shiprocket_response_id, '')) = ANY($2::text[])
          OR upper(coalesce(s.shiprocket_order_reference, '')) = ANY($3::text[])
          OR upper(coalesce(s.shiprocket_channel_reference, '')) = ANY($4::text[])
      `,
      [normalizedAwbs, normalizedShipmentIds, normalizedOrderIds, normalizedChannelOrderIds],
    )
  ).rows;

  const orderRows = normalizedShopifyOrderNumbers.length
    ? (
        await orderMappingQuery(
          `
            SELECT
              id AS order_id,
              shopify_order_id,
              shopify_order_name,
              shopify_order_number
            FROM ${ordersTable}
            WHERE
              upper(ltrim(coalesce(shopify_order_number, ''), '#')) = ANY($1::text[])
              OR upper(ltrim(coalesce(shopify_order_name, ''), '#')) = ANY($1::text[])
          `,
          [normalizedShopifyOrderNumbers],
        )
      ).rows
    : [];

  return {
    shipments: buildShipmentLookupMaps(shipmentRows),
    shopifyOrders: buildOrderNumberMap(orderRows),
  };
}

export async function getExistingOrderExpenseTransactionIdentities(provider, identities = []) {
  const normalized = uniqueText(identities);
  if (!normalized.length) {
    return new Set();
  }
  const rows = (
    await orderMappingQuery(
      `SELECT transaction_identity FROM ${transactionsTable} WHERE provider = $1 AND transaction_identity = ANY($2::text[])`,
      [provider, normalized],
    )
  ).rows;
  return new Set(rows.map((row) => row.transaction_identity));
}

export async function createOrderExpenseImportRecord(summary) {
  const result = await orderMappingQuery(
    `
      INSERT INTO ${importsTable} (
        provider,
        source_file_name,
        source_file_hash,
        row_count,
        financial_row_count,
        matched_count,
        unmatched_count,
        conflict_count,
        duplicate_count,
        gross_debits,
        gross_credits,
        net_amount,
        status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `,
    [
      summary.provider,
      summary.sourceFileName,
      summary.sourceFileHash,
      summary.rowCount,
      summary.financialRowCount,
      summary.matchedCount,
      summary.unmatchedCount,
      summary.conflictCount,
      summary.duplicateCount,
      summary.grossDebits,
      summary.grossCredits,
      summary.netAmount,
      summary.status,
    ],
  );
  return result.rows[0];
}

export async function insertOrderExpenseTransactions(importId, rows = []) {
  if (!rows.length) {
    return 0;
  }

  return withOrderMappingClient(async (client) => {
    await client.query("BEGIN");
    try {
      for (const row of rows) {
        await client.query(
          `
            INSERT INTO ${transactionsTable} (
              provider,
              matched_order_id,
              matched_shipment_id,
              shopify_order_id,
              shopify_order_number,
              shiprocket_order_id,
              shiprocket_shipment_id,
              channel_order_id,
              awb,
              transaction_id,
              transaction_identity,
              transaction_date,
              charge_type,
              description,
              transaction_type,
              debit_amount,
              credit_amount,
              net_amount,
              currency,
              courier,
              source_file_hash,
              source_file_name,
              source_row_number,
              source_reference,
              match_status,
              match_method,
              matched_value,
              import_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
            )
            ON CONFLICT (provider, transaction_identity) DO NOTHING
          `,
          [
            row.provider,
            row.matchedOrderId,
            row.matchedShipmentId,
            row.shopifyOrderId,
            row.shopifyOrderNumber,
            row.shiprocketOrderId,
            row.shiprocketShipmentId,
            row.channelOrderId,
            row.awb,
            row.transactionId,
            row.transactionIdentity,
            row.transactionDate,
            row.chargeType,
            row.description,
            row.transactionType,
            row.debitAmount,
            row.creditAmount,
            row.netAmount,
            row.currency,
            row.courier,
            row.sourceFileHash,
            row.sourceFileName,
            row.sourceRowNumber,
            row.sourceReference,
            row.matchStatus,
            row.matchMethod,
            row.matchedValue,
            importId,
          ],
        );
      }
      await client.query("COMMIT");
      return rows.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function listRecentOrderExpenseImports(limit = 10) {
  const rows = (
    await orderMappingQuery(
      `
        SELECT *
        FROM ${importsTable}
        WHERE provider = 'SHIPROCKET'
        ORDER BY uploaded_at DESC
        LIMIT $1
      `,
      [Math.min(50, Math.max(1, Number(limit) || 10))],
    )
  ).rows;
  return rows;
}

export async function getOrderExpenseImportDetails(importId) {
  const importRow = (
    await orderMappingQuery(`SELECT * FROM ${importsTable} WHERE id = $1`, [importId])
  ).rows[0];
  if (!importRow) {
    return null;
  }

  const rows = (
    await orderMappingQuery(
      `
        SELECT
          id,
          transaction_date,
          awb,
          description,
          charge_type,
          debit_amount,
          credit_amount,
          net_amount,
          currency,
          match_status,
          match_method,
          matched_value,
          shopify_order_number,
          transaction_id,
          source_row_number
        FROM ${transactionsTable}
        WHERE import_id = $1
        ORDER BY source_row_number ASC
      `,
      [importId],
    )
  ).rows;

  return {
    import: importRow,
    rows,
  };
}
