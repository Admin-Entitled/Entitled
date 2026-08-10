import crypto from "node:crypto";
import { env } from "../config/env.js";
import { matchOrderMappingShipment } from "./orderMappingMatcher.js";
import {
  ACTIVE_ORDER_MAPPING_STATUSES,
  ATTENTION_ORDER_MAPPING_STATUSES,
  canApplyStatusUpdate,
  displayStatusSource,
  isTerminalOrderMappingStatus,
  normalizeOrderMappingStatus,
} from "./orderMappingStatus.js";
import { orderMappingQuery, orderMappingTable, withOrderMappingClient } from "./orderMappingDb.js";
import { orderMappingError } from "./orderMappingError.js";

const ordersTable = orderMappingTable("orders");
const shipmentsTable = orderMappingTable("shipments");
const statusHistoryTable = orderMappingTable("status_history");
const trackingEventsTable = orderMappingTable("tracking_events");
const importBatchesTable = orderMappingTable("import_batches");
const importRowsTable = orderMappingTable("import_rows");
const syncRunsTable = orderMappingTable("sync_runs");
const networkLogsTable = orderMappingTable("network_logs");
const migrationExceptionsTable = orderMappingTable("migration_exceptions");
const orderExpenseTransactionsTable = orderMappingTable("order_expense_transactions");

function nowIso() {
  return new Date().toISOString();
}

function parseTimestamp(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function primaryShipmentOrderBy() {
  return "s.order_id, s.manual_override_lock DESC, (s.shiprocket_response_id IS NOT NULL) DESC, COALESCE(s.status_timestamp, s.updated_at) DESC NULLS LAST, s.updated_at DESC";
}

function buildFilters(filters, values) {
  const clauses = [];
  if (filters.queue && filters.queue !== "ALL") {
    if (filters.queue === "ACTIVE") {
      values.push(ACTIVE_ORDER_MAPPING_STATUSES);
      clauses.push(
        `COALESCE(s.normalized_status, 'PENDING_TRACKING') = ANY($${values.length}::text[])`,
      );
    } else if (filters.queue === "COMPLETED") {
      values.push(["DELIVERED_TO_CUSTOMER", "RTO_DELIVERED"]);
      clauses.push(
        `COALESCE(s.normalized_status, 'PENDING_TRACKING') = ANY($${values.length}::text[])`,
      );
    } else if (filters.queue === "NEEDS_ATTENTION") {
      values.push(ATTENTION_ORDER_MAPPING_STATUSES);
      clauses.push(`(
        COALESCE(s.normalized_status, 'PENDING_TRACKING') = ANY($${values.length}::text[])
        OR COALESCE(s.status_source, 'SHOPIFY') = 'LEGACY_DATA'
        OR COALESCE(s.sync_error, '') <> ''
        OR COALESCE(s.awb, '') = ''
      )`);
    }
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    values.push(`%${filters.search}%`);
    values.push(`%${filters.search}%`);
    values.push(`%${filters.search}%`);
    clauses.push("(o.shopify_order_name ILIKE $" + (values.length - 3) + " OR COALESCE(o.customer_name, '') ILIKE $" + (values.length - 2) + " OR COALESCE(o.customer_phone, '') ILIKE $" + (values.length - 1) + " OR COALESCE(s.awb, '') ILIKE $" + values.length + ")");
  }
  if (filters.status && filters.status !== "ALL") {
    values.push(filters.status);
    clauses.push("COALESCE(s.normalized_status, 'PENDING_TRACKING') = $" + values.length);
  }
  if (filters.courier && filters.courier !== "ALL") {
    values.push(filters.courier);
    clauses.push("COALESCE(s.courier, '') = $" + values.length);
  }
  if (filters.source && filters.source !== "ALL") {
    if (filters.source === "DATABASE_CACHE") {
      clauses.push("COALESCE(s.terminal_status, false) = true");
    } else {
      values.push(filters.source);
      clauses.push("COALESCE(s.status_source, 'SHOPIFY') = $" + values.length);
    }
  }
  if (filters.startDate) {
    values.push(filters.startDate);
    clauses.push("o.order_date >= $" + values.length);
  }
  if (filters.endDate) {
    values.push(filters.endDate);
    clauses.push("o.order_date <= $" + values.length);
  }
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function buildDateWhere(filters, values) {
  const clauses = [];
  if (filters.startDate) {
    values.push(filters.startDate);
    clauses.push("o.order_date >= $" + values.length);
  }
  if (filters.endDate) {
    values.push(filters.endDate);
    clauses.push("o.order_date <= $" + values.length);
  }
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function sortClause(sortBy = "orderDate", direction = "desc") {
  const safeDirection = direction === "asc" ? "ASC" : "DESC";
  const mapping = {
    orderDate: `o.order_date ${safeDirection}`,
    orderNumber: `o.shopify_order_name ${safeDirection}`,
    customerName: `o.customer_name ${safeDirection} NULLS LAST`,
    status: `COALESCE(s.normalized_status, 'PENDING_TRACKING') ${safeDirection}`,
    courier: `s.courier ${safeDirection} NULLS LAST`,
    statusTimestamp: `COALESCE(s.status_timestamp, s.updated_at) ${safeDirection} NULLS LAST`,
    lastShiprocketSyncAt: `s.last_shiprocket_sync_at ${safeDirection} NULLS LAST`,
  };
  return mapping[sortBy] || mapping.orderDate;
}

function dedupeKey(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function insertStatusHistory(client, payload) {
  await client.query(
    `INSERT INTO ${statusHistoryTable} (
      order_id, shipment_id, previous_status, next_status, raw_status, source,
      effective_at, remarks, import_batch_id, actor, manual_override_lock
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      payload.orderId,
      payload.shipmentId,
      payload.previousStatus,
      payload.nextStatus,
      payload.rawStatus,
      payload.source,
      payload.effectiveAt,
      payload.remarks || null,
      payload.importBatchId || null,
      payload.actor || null,
      payload.manualOverrideLock || false,
    ],
  );
}

async function insertTrackingEvent(client, shipmentId, payload) {
  const eventKey = dedupeKey([
    shipmentId,
    payload.source,
    payload.normalizedStatus,
    payload.rawStatus,
    payload.statusTimestamp,
    payload.eventLocation || "",
  ]);

  await client.query(
    `INSERT INTO ${trackingEventsTable} (
      shipment_id, normalized_status, raw_status, event_location,
      event_timestamp, source, dedupe_key, payload
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (shipment_id, dedupe_key) DO NOTHING`,
    [
      shipmentId,
      payload.normalizedStatus,
      payload.rawStatus || null,
      payload.eventLocation || null,
      payload.statusTimestamp || null,
      payload.source,
      eventKey,
      payload.latestProviderPayload || {},
    ],
  );
}

async function findOrderById(client, id) {
  return (await client.query(`SELECT * FROM ${ordersTable} WHERE id = $1`, [id])).rows[0] || null;
}

async function findShipmentById(client, id) {
  return (await client.query(`SELECT s.*, o.shopify_order_id FROM ${shipmentsTable} s JOIN ${ordersTable} o ON o.id = s.order_id WHERE s.id = $1`, [id])).rows[0] || null;
}

async function findMatchingShipment(client, orderId, shipment) {
  const trackingNumber = shipment.shopifyTrackingNumber || null;
  const awb = shipment.awb || null;
  const fulfillmentId = shipment.shopifyFulfillmentId || null;

  return (
    await client.query(
      `SELECT id, shopify_fulfillment_id
       FROM ${shipmentsTable}
       WHERE order_id = $1
         AND (
           ($2::text IS NOT NULL AND shopify_fulfillment_id = $2)
           OR ($3::text IS NOT NULL AND awb = $3)
           OR ($4::text IS NOT NULL AND shopify_tracking_number = $4)
           OR (
             COALESCE(awb, '') = ''
             AND COALESCE(shopify_tracking_number, '') = ''
             AND COALESCE(shopify_fulfillment_id, '') = ''
             AND COALESCE($2, '') = ''
             AND COALESCE($3, '') = ''
             AND COALESCE($4, '') = ''
           )
         )
       ORDER BY
         CASE WHEN $2::text IS NOT NULL AND shopify_fulfillment_id = $2 THEN 0 ELSE 1 END,
         CASE WHEN $3::text IS NOT NULL AND awb = $3 THEN 0 ELSE 1 END,
         CASE WHEN $4::text IS NOT NULL AND shopify_tracking_number = $4 THEN 0 ELSE 1 END,
         updated_at DESC
       LIMIT 1`,
      [orderId, fulfillmentId, awb, trackingNumber],
    )
  ).rows[0] || null;
}

export async function getLatestShopifySyncWindow() {
  const end = new Date();
  return {
    start: "2000-01-01",
    end: end.toISOString().slice(0, 10),
  };
}

export async function listOrderMappings(filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(filters.pageSize) || 25));
  const values = [];
  const where = buildFilters(filters, values);
  const base = `
    WITH primary_shipments AS (
      SELECT DISTINCT ON (s.order_id) s.*
      FROM ${shipmentsTable} s
      ORDER BY ${primaryShipmentOrderBy()}
    ),
    shiprocket_costs AS (
      SELECT
        matched_order_id AS order_id,
        SUM(net_amount)::text AS shiprocket_cost,
        COUNT(*)::int AS shiprocket_transaction_count
      FROM ${orderExpenseTransactionsTable}
      WHERE provider = 'SHIPROCKET'
        AND match_status = 'MATCHED'
        AND matched_order_id IS NOT NULL
      GROUP BY matched_order_id
    )
  `;

  const total = Number(
    (
      await orderMappingQuery(
        `${base}
         SELECT COUNT(*)::int AS count
         FROM ${ordersTable} o
         LEFT JOIN primary_shipments s ON s.order_id = o.id
         ${where}`,
        values,
      )
    ).rows[0].count,
  );

  const rows = (
    await orderMappingQuery(
      `${base}
       SELECT
         o.id,
         o.shopify_order_id,
         o.shopify_order_name,
         o.shopify_order_number,
         o.order_date,
         o.customer_name,
         o.customer_phone,
         o.shopify_fulfillment_status,
         o.cancellation_status,
         s.id AS primary_shipment_id,
         s.awb,
         s.courier,
         s.shiprocket_response_id,
         s.shiprocket_order_reference,
         s.shiprocket_channel_reference,
         COALESCE(
           NULLIF(s.latest_provider_payload->>'order_total', ''),
           NULLIF(s.latest_provider_payload->>'total', ''),
           NULLIF(o.latest_fulfillment->>'order_total', '')
         ) AS order_amount,
         CASE
           WHEN o.cancellation_status IS NOT NULL THEN 'CANCELLED'
           ELSE COALESCE(s.normalized_status, 'PENDING_TRACKING')
         END AS normalized_status,
         CASE WHEN o.cancellation_status IS NOT NULL THEN 'Cancelled' ELSE s.raw_status END AS raw_status,
         CASE
           WHEN o.cancellation_status IS NOT NULL THEN 'SHOPIFY'
           ELSE COALESCE(s.status_source, 'SHOPIFY')
         END AS status_source,
         s.status_timestamp,
         s.last_shiprocket_sync_at,
         COALESCE(s.manual_override_lock, false) AS manual_override_lock,
         COALESCE(s.manual_override, false) AS manual_override,
         c.shiprocket_cost,
         c.shiprocket_transaction_count,
         CASE
           WHEN o.cancellation_status IS NOT NULL THEN true
           ELSE COALESCE(s.terminal_status, false)
         END AS terminal_status,
         CASE WHEN o.cancellation_status IS NOT NULL THEN NULL ELSE s.sync_error END AS sync_error,
         o.updated_at
       FROM ${ordersTable} o
       LEFT JOIN primary_shipments s ON s.order_id = o.id
       LEFT JOIN shiprocket_costs c ON c.order_id = o.id
       ${where}
       ORDER BY ${sortClause(filters.sortBy, filters.sortDirection)}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    )
  ).rows;

  const summary = (
    await orderMappingQuery(
      `${base}
       SELECT COALESCE(s.normalized_status, 'PENDING_TRACKING') AS status, COUNT(*)::int AS count
       FROM ${ordersTable} o
       LEFT JOIN primary_shipments s ON s.order_id = o.id
       ${where}
       GROUP BY 1`,
      values,
    )
  ).rows;

const sourceSummary = (
await orderMappingQuery(
`${base}
SELECT
CASE WHEN COALESCE(s.terminal_status, false) THEN 'DATABASE_CACHE' ELSE COALESCE(s.status_source, 'SHOPIFY') END AS source,
COUNT(*)::int AS count
FROM ${ordersTable} o
LEFT JOIN primary_shipments s ON s.order_id = o.id
${where}
GROUP BY 1`,
values,
)
).rows;

const globalSummary = (
await orderMappingQuery(
`WITH primary_shipments AS (
SELECT DISTINCT ON (s.order_id) s.*
FROM ${shipmentsTable} s
ORDER BY ${primaryShipmentOrderBy()}
)
SELECT COALESCE(s.normalized_status, 'PENDING_TRACKING') AS status, COUNT(*)::int AS count
FROM ${ordersTable} o
LEFT JOIN primary_shipments s ON s.order_id = o.id
GROUP BY 1`,
[],
)
).rows;

const globalSourceSummary = (
await orderMappingQuery(
`WITH primary_shipments AS (
SELECT DISTINCT ON (s.order_id) s.*
FROM ${shipmentsTable} s
ORDER BY ${primaryShipmentOrderBy()}
)
SELECT
CASE WHEN COALESCE(s.terminal_status, false) THEN 'DATABASE_CACHE' ELSE COALESCE(s.status_source, 'SHOPIFY') END AS source,
COUNT(*)::int AS count
FROM ${ordersTable} o
LEFT JOIN primary_shipments s ON s.order_id = o.id
GROUP BY 1`,
[],
)
).rows;

const globalAwbSummary = (
await orderMappingQuery(
`WITH primary_shipments AS (
SELECT DISTINCT ON (s.order_id) s.*
FROM ${shipmentsTable} s
ORDER BY ${primaryShipmentOrderBy()}
)
SELECT
COUNT(*) FILTER (WHERE COALESCE(s.awb, '') <> '')::int AS with_awb,
COUNT(*) FILTER (WHERE COALESCE(s.awb, '') = '')::int AS missing_awb,
COUNT(*)::int AS total
FROM ${ordersTable} o
LEFT JOIN primary_shipments s ON s.order_id = o.id`,
[],
)
).rows[0];

const deliveredAmountValues = [];
const deliveredAmountWhere = buildDateWhere(filters, deliveredAmountValues);
const deliveredAmountRow = (
await orderMappingQuery(
`${base}
SELECT COALESCE(
  SUM(
    CASE
      WHEN COALESCE(s.normalized_status, 'PENDING_TRACKING') = 'DELIVERED_TO_CUSTOMER'
      THEN COALESCE(
        NULLIF(
          COALESCE(
            s.latest_provider_payload->>'order_total',
            s.latest_provider_payload->>'total',
            o.latest_fulfillment->>'order_total'
          ),
          ''
        )::numeric,
        0
      )
      ELSE 0
    END
  ),
  0
)::text AS delivered_amount_total
FROM ${ordersTable} o
LEFT JOIN primary_shipments s ON s.order_id = o.id
${deliveredAmountWhere}`,
deliveredAmountValues,
)
).rows[0];

return {
orders: rows.map((row) => ({
...row,
display_source: displayStatusSource(row),
})),
total,
page,
pageSize,
summary: Object.fromEntries(summary.map((row) => [row.status, row.count])),
sourceSummary: Object.fromEntries(sourceSummary.map((row) => [row.source, row.count])),
globalSummary: Object.fromEntries(globalSummary.map((row) => [row.status, row.count])),
globalSourceSummary: Object.fromEntries(globalSourceSummary.map((row) => [row.source, row.count])),
globalAwbSummary: {
withAwb: Number(globalAwbSummary.with_awb || 0),
missingAwb: Number(globalAwbSummary.missing_awb || 0),
total: Number(globalAwbSummary.total || 0),
},
deliveredAmountTotal: deliveredAmountRow.delivered_amount_total || "0",
};
}

export async function getOrderMappingDetails(orderId) {
  const order = (
    await orderMappingQuery(
      `SELECT * FROM ${ordersTable} WHERE id = $1`,
      [orderId],
    )
  ).rows[0];

  if (!order) {
    return null;
  }

  const shipments = (
    await orderMappingQuery(
      `SELECT * FROM ${shipmentsTable} WHERE order_id = $1 ORDER BY COALESCE(status_timestamp, updated_at) DESC NULLS LAST, updated_at DESC`,
      [orderId],
    )
  ).rows;

  const history = (
    await orderMappingQuery(
      `SELECT * FROM ${statusHistoryTable} WHERE order_id = $1 ORDER BY recorded_at DESC`,
      [orderId],
    )
  ).rows;

  const trackingEvents = (
    await orderMappingQuery(
      `SELECT * FROM ${trackingEventsTable} WHERE shipment_id = ANY($1::uuid[]) ORDER BY event_timestamp DESC NULLS LAST, created_at DESC`,
      [shipments.map((shipment) => shipment.id)],
    )
  ).rows;

  const expenseTransactions = (
    await orderMappingQuery(
      `
        SELECT
          id,
          transaction_date,
          transaction_id,
          charge_type,
          description,
          transaction_type,
          awb,
          debit_amount,
          credit_amount,
          net_amount,
          currency,
          match_status,
          match_method,
          matched_value,
          shiprocket_order_id,
          shiprocket_shipment_id,
          channel_order_id
        FROM ${orderExpenseTransactionsTable}
        WHERE provider = 'SHIPROCKET'
          AND matched_order_id = $1
        ORDER BY transaction_date DESC NULLS LAST, source_row_number DESC
      `,
      [orderId],
    )
  ).rows;

  const expenseBreakdown = (
    await orderMappingQuery(
      `
        SELECT
          COALESCE(SUM(CASE WHEN charge_type = 'FORWARD_FREIGHT' THEN net_amount ELSE 0 END), 0)::text AS forward_freight,
          COALESCE(SUM(CASE WHEN charge_type = 'RTO_FREIGHT' THEN net_amount ELSE 0 END), 0)::text AS rto_freight,
          COALESCE(SUM(CASE WHEN charge_type = 'COD_CHARGE' THEN net_amount ELSE 0 END), 0)::text AS cod_charge,
          COALESCE(SUM(CASE WHEN charge_type = 'WEIGHT_ADJUSTMENT' THEN net_amount ELSE 0 END), 0)::text AS weight_adjustment,
          COALESCE(SUM(CASE WHEN charge_type = 'SURCHARGE' THEN net_amount ELSE 0 END), 0)::text AS surcharge,
          COALESCE(SUM(CASE WHEN charge_type IN ('CREDIT', 'REVERSAL', 'REFUND') THEN net_amount ELSE 0 END), 0)::text AS credits,
          COALESCE(SUM(CASE WHEN charge_type = 'OTHER' THEN net_amount ELSE 0 END), 0)::text AS other,
          COALESCE(SUM(net_amount), 0)::text AS net_shiprocket_cost
        FROM ${orderExpenseTransactionsTable}
        WHERE provider = 'SHIPROCKET'
          AND matched_order_id = $1
          AND match_status = 'MATCHED'
      `,
      [orderId],
    )
  ).rows[0];

  return { order, shipments, history, trackingEvents, expenseTransactions, expenseBreakdown };
}

export async function createSyncRun(syncType) {
  const result = await orderMappingQuery(
    `INSERT INTO ${syncRunsTable} (sync_type) VALUES ($1) RETURNING *`,
    [syncType],
  );
  return result.rows[0];
}

export async function completeSyncRun(id, payload) {
  await orderMappingQuery(
    `UPDATE ${syncRunsTable}
     SET completed_at = NOW(),
         status = $2,
         processed_count = $3,
         updated_count = $4,
         skipped_terminal_count = $5,
         failed_count = $6,
         error_summary = $7
     WHERE id = $1`,
    [
      id,
      payload.status,
      payload.processedCount || 0,
      payload.updatedCount || 0,
      payload.skippedTerminalCount || 0,
      payload.failedCount || 0,
      payload.errorSummary || null,
    ],
  );
}

export async function listActionLogs(limit = 50) {
  const rows = (
    await orderMappingQuery(
      `SELECT
         id,
         sync_type,
         started_at,
         completed_at,
         status,
         processed_count,
         updated_count,
         skipped_terminal_count,
         failed_count,
         error_summary
       FROM ${syncRunsTable}
       ORDER BY started_at DESC
       LIMIT $1`,
      [Math.min(200, Math.max(1, Number(limit) || 50))],
    )
  ).rows;

  return {
    logs: rows,
  };
}

export async function createNetworkLog({
  operation,
  provider,
  method,
  endpoint,
  status,
  statusCode = null,
  startedAt,
  completedAt,
  durationMs,
  errorSummary = null,
  metadata = {},
}) {
  const result = await orderMappingQuery(
    `INSERT INTO ${networkLogsTable} (
       operation, provider, method, endpoint, status, status_code,
       started_at, completed_at, duration_ms, error_summary, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      operation,
      provider,
      method,
      endpoint,
      status,
      statusCode,
      startedAt,
      completedAt,
      durationMs,
      errorSummary,
      metadata,
    ],
  );

  return result.rows[0];
}

export async function setShipmentSyncError(shipmentId, message) {
  await orderMappingQuery(
    `UPDATE ${shipmentsTable}
     SET sync_error = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [shipmentId, message || null],
  );
}

export async function listNetworkLogs(limit = 50) {
  const rows = (
    await orderMappingQuery(
      `SELECT
         id,
         operation,
         provider,
         method,
         endpoint,
         status,
         status_code,
         started_at,
         completed_at,
         duration_ms,
         error_summary
       FROM ${networkLogsTable}
       ORDER BY started_at DESC
       LIMIT $1`,
      [Math.min(200, Math.max(1, Number(limit) || 50))],
    )
  ).rows;

  return {
    logs: rows,
  };
}

export async function withSyncLock(lockKey, work) {
  return withOrderMappingClient(async (client) => {
    const gotLock = (await client.query("SELECT pg_try_advisory_lock($1) AS locked", [lockKey])).rows[0].locked;
    if (!gotLock) {
      const error = new Error("Another Order Mapping sync is already running");
      error.statusCode = 409;
      throw error;
    }

    try {
      return await work(client);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [lockKey]).catch(() => {});
    }
  });
}

export async function upsertShopifyOrders(orders) {
  return withOrderMappingClient(async (client) => {
    await client.query("BEGIN");
    try {
      let orderCount = 0;
      let shipmentCount = 0;
      for (const order of orders) {
        const orderResult = await client.query(
          `INSERT INTO ${ordersTable} (
             shopify_order_id, shopify_order_name, shopify_order_number, order_date,
             customer_name, customer_phone, shopify_fulfillment_status, cancellation_status,
             shopify_updated_at, last_shopify_sync_at, latest_fulfillment, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,NOW())
           ON CONFLICT (shopify_order_id) DO UPDATE SET
             shopify_order_name = EXCLUDED.shopify_order_name,
             shopify_order_number = EXCLUDED.shopify_order_number,
             order_date = EXCLUDED.order_date,
             customer_name = EXCLUDED.customer_name,
             customer_phone = EXCLUDED.customer_phone,
             shopify_fulfillment_status = EXCLUDED.shopify_fulfillment_status,
             cancellation_status = EXCLUDED.cancellation_status,
             shopify_updated_at = EXCLUDED.shopify_updated_at,
             last_shopify_sync_at = NOW(),
             latest_fulfillment = EXCLUDED.latest_fulfillment,
             updated_at = NOW()
           RETURNING id`,
          [
            order.shopifyOrderId,
            order.shopifyOrderName,
            order.shopifyOrderNumber || null,
            parseTimestamp(order.orderDate),
            order.customerName || null,
            order.customerPhone || null,
            order.shopifyFulfillmentStatus || null,
            order.cancellationStatus || null,
            parseTimestamp(order.shopifyUpdatedAt),
            order.latestFulfillment || {},
          ],
        );
        const orderId = orderResult.rows[0].id;
        orderCount += 1;

        for (const shipment of order.shipments) {
          const existing = await findMatchingShipment(client, orderId, shipment);
          const shipmentValues = [
            orderId,
            shipment.shopifyFulfillmentId || null,
            shipment.shopifyTrackingNumber || null,
            shipment.awb || null,
            shipment.courier || null,
            parseTimestamp(order.shopifyUpdatedAt || order.orderDate),
            shipment.latestProviderPayload || {},
          ];

          if (existing) {
            await client.query(
              `UPDATE ${shipmentsTable}
               SET shopify_fulfillment_id = CASE
                     WHEN shopify_fulfillment_id IS NULL AND $2::text IS NOT NULL THEN $2::text
                     ELSE shopify_fulfillment_id
                   END,
                   shopify_tracking_number = $3,
                   awb = $4,
                   courier = $5,
                   latest_provider_payload = CASE
                     WHEN $7::jsonb = '{}'::jsonb THEN latest_provider_payload
                     ELSE COALESCE(latest_provider_payload, '{}'::jsonb) || $7::jsonb
                   END,
                   status_source = CASE WHEN status_source = 'SHOPIFY' THEN 'SHOPIFY' ELSE status_source END,
                   status_timestamp = COALESCE(status_timestamp, $6),
                   updated_at = NOW()
               WHERE id = $1`,
              [existing.id, ...shipmentValues.slice(1)],
            );
          } else {
            await client.query(
              `INSERT INTO ${shipmentsTable} (
                 order_id, shopify_fulfillment_id, shopify_tracking_number, awb, courier,
                 normalized_status, raw_status, status_source, status_timestamp,
                 terminal_status, latest_provider_payload, updated_at
               ) VALUES ($1,$2,$3,$4,$5,'PENDING_TRACKING',NULL,'SHOPIFY',$6,false,$7,NOW())`,
              shipmentValues,
            );
          }
          shipmentCount += 1;
        }
      }
      await client.query("COMMIT");
      return { orders: orderCount, shipments: shipmentCount };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function listEligibleShipmentsForRefresh({ shipmentId = null, force = false } = {}) {
  const values = [];
  const clauses = ["o.cancellation_status IS NULL"];
  if (!force) {
    clauses.push("s.terminal_status = false");
    clauses.push("s.manual_override_lock = false");
  }
  if (shipmentId) {
    values.push(shipmentId);
    clauses.push(`s.id = $${values.length}`);
  }

  const rows = (
    await orderMappingQuery(
      `SELECT s.*, o.shopify_order_id, o.shopify_order_name, o.shopify_order_number, o.order_date
       FROM ${shipmentsTable} s
       JOIN ${ordersTable} o ON o.id = s.order_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY
         o.order_date DESC,
         (COALESCE(s.awb, '') <> '') DESC,
         (COALESCE(s.shiprocket_response_id, '') <> '') DESC,
         s.updated_at DESC`,
      values,
    )
  ).rows;

  return rows;
}

async function applyShipmentUpdateWithClient(
  client,
  shipmentId,
  {
    awb,
    normalizedStatus,
    rawStatus,
    source,
    statusTimestamp,
    courier,
    deliveredAt,
    shiprocketResponseId,
    shiprocketOrderReference,
    shiprocketChannelReference,
    latestProviderPayload,
    trackingEvents = [],
    remarks,
    manualOverride = false,
    manualOverrideLock = false,
    importBatchId = null,
    actor = null,
    force = false,
    preserveStatus = false,
  },
) {
  const current = await findShipmentById(client, shipmentId);
  if (!current) {
    throw orderMappingError("ORDER_MAPPING_SHIPMENT_NOT_FOUND", "Shipment not found", {
      statusCode: 404,
    });
  }

  const incoming = {
    normalizedStatus,
    rawStatus,
    source,
    statusTimestamp: parseTimestamp(statusTimestamp) || nowIso(),
  };

  if (preserveStatus) {
    await client.query(
      `UPDATE ${shipmentsTable}
       SET shiprocket_response_id = COALESCE($2, shiprocket_response_id),
           shiprocket_order_reference = COALESCE($3, shiprocket_order_reference),
           shiprocket_channel_reference = COALESCE($4, shiprocket_channel_reference),
           last_shiprocket_sync_at = CASE WHEN $5 = 'SHIPROCKET_API' THEN NOW() ELSE last_shiprocket_sync_at END,
           sync_error = $6,
           updated_at = NOW()
       WHERE id = $1`,
      [
        shipmentId,
        shiprocketResponseId || null,
        shiprocketOrderReference || null,
        shiprocketChannelReference || null,
        source,
        "Provider response did not include a recognized status",
      ],
    );
    return { applied: false, reason: "ignored_unknown" };
  }

  if (!canApplyStatusUpdate(current, incoming, { force })) {
    if (source === "SHIPROCKET_API") {
      if (shiprocketResponseId) {
        await client.query(
          `UPDATE ${shipmentsTable}
           SET shiprocket_response_id = NULL,
               shiprocket_order_reference = NULL,
               shiprocket_channel_reference = NULL,
               updated_at = NOW()
           WHERE id <> $1
             AND shiprocket_response_id = $2`,
          [shipmentId, shiprocketResponseId],
        );
      }
      await client.query(
        `UPDATE ${shipmentsTable}
         SET shiprocket_response_id = COALESCE($2, shiprocket_response_id),
             shiprocket_order_reference = COALESCE($3, shiprocket_order_reference),
             shiprocket_channel_reference = COALESCE($4, shiprocket_channel_reference),
             last_shiprocket_sync_at = NOW(),
             sync_error = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [
          shipmentId,
          shiprocketResponseId || null,
          shiprocketOrderReference || null,
          shiprocketChannelReference || null,
        ],
      );
    }
    return { applied: false, reason: current.manual_override_lock ? "manual_lock" : "precedence" };
  }

  if (source === "SHIPROCKET_API" && shiprocketResponseId) {
    await client.query(
      `UPDATE ${shipmentsTable}
       SET shiprocket_response_id = NULL,
           shiprocket_order_reference = NULL,
           shiprocket_channel_reference = NULL,
           updated_at = NOW()
       WHERE id <> $1
         AND shiprocket_response_id = $2`,
      [shipmentId, shiprocketResponseId],
    );
  }

  await client.query(
        `UPDATE ${shipmentsTable}
         SET normalized_status = $2,
             raw_status = $3,
             status_source = $4,
             status_timestamp = $5,
             courier = COALESCE($6, courier),
             awb = COALESCE(NULLIF($16, ''), awb),
             delivered_at = COALESCE($7, delivered_at),
             shiprocket_response_id = COALESCE($8, shiprocket_response_id),
             shiprocket_order_reference = COALESCE($9, shiprocket_order_reference),
             shiprocket_channel_reference = COALESCE($10, shiprocket_channel_reference),
             last_shiprocket_sync_at = CASE WHEN $4 = 'SHIPROCKET_API' THEN NOW() ELSE last_shiprocket_sync_at END,
             terminal_status = $11,
             manual_override = $12,
             manual_override_lock = $13,
             manual_override_reason = $14,
             latest_provider_payload = CASE
               WHEN $15::jsonb = '{}'::jsonb THEN latest_provider_payload
               ELSE COALESCE(latest_provider_payload, '{}'::jsonb) || $15::jsonb
             END,
             sync_error = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [
          shipmentId,
          normalizedStatus,
          rawStatus || null,
          source,
          parseTimestamp(statusTimestamp) || nowIso(),
          courier || null,
          parseTimestamp(deliveredAt),
          shiprocketResponseId || null,
          shiprocketOrderReference || null,
          shiprocketChannelReference || null,
          isTerminalOrderMappingStatus(normalizedStatus),
          manualOverride,
          manualOverrideLock,
            remarks || null,
            latestProviderPayload || {},
            awb || null,
        ],
      );

  await insertStatusHistory(client, {
        orderId: current.order_id,
        shipmentId,
        previousStatus: current.normalized_status,
        nextStatus: normalizedStatus,
        rawStatus,
        source,
        effectiveAt: parseTimestamp(statusTimestamp) || nowIso(),
        remarks,
        importBatchId,
        actor,
        manualOverrideLock,
      });

  const events = trackingEvents.length
        ? trackingEvents.map((event) => ({
            normalizedStatus: normalizeOrderMappingStatus(
              event.normalizedHint || event.rawStatus || normalizedStatus,
              normalizedStatus,
            ),
            rawStatus: event.rawStatus,
            statusTimestamp: parseTimestamp(event.statusTimestamp) || nowIso(),
            source,
            latestProviderPayload,
            eventLocation: event.eventLocation,
          }))
        : [
            {
              normalizedStatus,
              rawStatus,
              statusTimestamp: parseTimestamp(statusTimestamp) || nowIso(),
              source,
              latestProviderPayload,
            },
          ];

  for (const event of events) {
    await insertTrackingEvent(client, shipmentId, event);
  }

  return {
    applied: true,
    reason: current.normalized_status === normalizedStatus ? "no_change" : "advanced",
  };
}

export async function applyShipmentUpdate(shipmentId, payload) {
  return withOrderMappingClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await applyShipmentUpdateWithClient(client, shipmentId, payload);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function setManualShipmentStatus(shipmentId, payload) {
  if (!payload?.normalizedStatus) {
    throw orderMappingError("ORDER_MAPPING_INVALID_STATUS", "Invalid status");
  }

  return applyShipmentUpdate(shipmentId, {
    normalizedStatus: payload.normalizedStatus,
    rawStatus: payload.rawStatus || payload.normalizedStatus,
    source: "MANUAL",
    statusTimestamp: payload.effectiveAt || nowIso(),
    remarks: payload.remarks,
    manualOverride: true,
    manualOverrideLock: Boolean(payload.locked),
    actor: payload.actor || "local-user",
    force: true,
  });
}

export async function clearManualShipmentStatus(shipmentId) {
  return withOrderMappingClient(async (client) => {
    const shipment = await findShipmentById(client, shipmentId);
    if (!shipment) {
      throw new Error("Shipment not found");
    }

    const fallback =
      (
        await client.query(
          `SELECT * FROM ${statusHistoryTable}
           WHERE shipment_id = $1 AND source <> 'MANUAL'
           ORDER BY recorded_at DESC
           LIMIT 1`,
          [shipmentId],
        )
      ).rows[0] || null;

    const normalizedStatus = fallback?.next_status || "PENDING_TRACKING";
    const source = fallback?.source || "SHOPIFY";
    const rawStatus = fallback?.raw_status || null;
    const effectiveAt = fallback?.effective_at || nowIso();

    await client.query("BEGIN");
    try {
      await client.query(
        `UPDATE ${shipmentsTable}
         SET normalized_status = $2,
             raw_status = $3,
             status_source = $4,
             status_timestamp = $5,
             terminal_status = $6,
             manual_override = false,
             manual_override_lock = false,
             manual_override_reason = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [shipmentId, normalizedStatus, rawStatus, source, effectiveAt, isTerminalOrderMappingStatus(normalizedStatus)],
      );

      await insertStatusHistory(client, {
        orderId: shipment.order_id,
        shipmentId,
        previousStatus: shipment.normalized_status,
        nextStatus: normalizedStatus,
        rawStatus,
        source: "MANUAL",
        effectiveAt: nowIso(),
        remarks: "Manual override cleared",
        actor: "local-user",
        manualOverrideLock: false,
      });
      await client.query("COMMIT");
      return { ok: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function previewCsvImport({ fileName, fileHash, mapping, parsedRows }) {
  return withOrderMappingClient(async (client) => {
    const candidates = (
      await client.query(
        `SELECT
           o.id AS order_id,
           o.shopify_order_id,
           o.shopify_order_name,
           o.shopify_order_number,
           s.id AS shipment_id,
           s.awb,
           s.shopify_tracking_number,
           s.normalized_status,
           s.status_timestamp
         FROM ${ordersTable} o
         LEFT JOIN ${shipmentsTable} s ON s.order_id = o.id`,
      )
    ).rows;

    const preparedRows = parsedRows.map((row) => {
      const match = matchOrderMappingShipment(
        {
          shopifyOrderId: row.shopifyOrderId,
          orderNumber: row.orderNumber,
          awb: row.awb,
        },
        candidates,
      );
      const validationErrors = [];
      if (!row.rawStatus) {
        validationErrors.push("Missing shipment status");
      }
      if (!match.row) {
        validationErrors.push(match.ambiguous ? "Ambiguous match" : "No matching order or shipment");
      }

      return {
        ...row,
        matchedOrderId: match.row?.order_id || null,
        matchedShipmentId: match.row?.shipment_id || null,
        matchingMethod: match.method,
        validationStatus: validationErrors.length ? "invalid" : "valid",
        validationErrors,
        wouldUpdate: Boolean(match.row && match.row.normalized_status !== row.normalizedStatus),
      };
    });

    const counts = {
      totalRows: preparedRows.length,
      matchedRows: preparedRows.filter((row) => row.matchedOrderId).length,
      unmatchedRows: preparedRows.filter((row) => !row.matchedOrderId).length,
      invalidRows: preparedRows.filter((row) => row.validationStatus !== "valid").length,
      updatedRows: preparedRows.filter((row) => row.wouldUpdate).length,
    };

    return {
      batchId: fileHash,
      commitToken: {
        fileName,
        fileHash,
        mapping,
        rows: preparedRows.map((row) => ({
          rowNumber: row.rowNumber,
          rowHash: row.rowHash,
          rawStatus: row.rawStatus,
          normalizedStatus: row.normalizedStatus,
          statusTimestamp: row.statusTimestamp,
          deliveredAt: row.deliveredAt,
          courier: row.courier,
          remarks: row.remarks,
          matchedOrderId: row.matchedOrderId,
          matchedShipmentId: row.matchedShipmentId,
          matchingMethod: row.matchingMethod,
          validationStatus: row.validationStatus,
          validationErrors: row.validationErrors,
          wouldUpdate: row.wouldUpdate,
        })),
      },
      duplicate: false,
      counts,
      mapping,
      sample: preparedRows.slice(0, 5),
    };
  });
}

export async function commitCsvImport(commitToken) {
  return withOrderMappingClient(async (client) => {
    if (!commitToken?.fileHash || !Array.isArray(commitToken.rows)) {
      throw orderMappingError("ORDER_MAPPING_IMPORT_NOT_FOUND", "Import preview not found", {
        statusCode: 404,
      });
    }

    await client.query("BEGIN");
    try {
      const existing = (
        await client.query(`SELECT * FROM ${importBatchesTable} WHERE file_hash = $1`, [commitToken.fileHash])
      ).rows[0];
      if (existing?.status === "committed") {
        await client.query("COMMIT");
        return { duplicate: true, batchId: existing.id };
      }

      const counts = {
        totalRows: commitToken.rows.length,
        matchedRows: commitToken.rows.filter((row) => row.matchedOrderId).length,
        unmatchedRows: commitToken.rows.filter((row) => !row.matchedOrderId).length,
        invalidRows: commitToken.rows.filter((row) => row.validationStatus !== "valid").length,
        updatedRows: commitToken.rows.filter((row) => row.wouldUpdate).length,
      };
      if (counts.invalidRows) {
        throw orderMappingError(
          "ORDER_MAPPING_CSV_PREVIEW_INVALID",
          "CSV preview contains invalid rows",
          { details: { invalidRows: counts.invalidRows } },
        );
      }

      const batch =
        (
          await client.query(
            `INSERT INTO ${importBatchesTable} (
               file_name, file_hash, total_rows, matched_rows, unmatched_rows, invalid_rows, updated_rows, status, mapping
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,'committing',$8)
             ON CONFLICT (file_hash) DO UPDATE SET
               file_name = EXCLUDED.file_name,
               total_rows = EXCLUDED.total_rows,
               matched_rows = EXCLUDED.matched_rows,
               unmatched_rows = EXCLUDED.unmatched_rows,
               invalid_rows = EXCLUDED.invalid_rows,
               updated_rows = EXCLUDED.updated_rows,
               status = 'committing',
               error_summary = NULL,
               mapping = EXCLUDED.mapping
             RETURNING *`,
            [
              commitToken.fileName,
              commitToken.fileHash,
              counts.totalRows,
              counts.matchedRows,
              counts.unmatchedRows,
              counts.invalidRows,
              counts.updatedRows,
              commitToken.mapping,
            ],
          )
        ).rows[0];

      let updated = 0;
      const failures = [];
      for (const row of commitToken.rows) {
        let shipmentId = row.matchedShipmentId;
        if (!shipmentId && row.matchedOrderId) {
          const existingShipment = (
            await client.query(
              `SELECT id FROM ${shipmentsTable} WHERE order_id = $1 ORDER BY COALESCE(status_timestamp, updated_at) DESC NULLS LAST LIMIT 1`,
              [row.matchedOrderId],
            )
          ).rows[0];

          if (existingShipment) {
            shipmentId = existingShipment.id;
          }
        }

        if (!shipmentId) {
          throw orderMappingError(
            "ORDER_MAPPING_CSV_CONFLICT",
            "CSV row no longer matches a shipment",
            { statusCode: 409, details: { rowNumber: row.rowNumber } },
          );
        }

        const result = await applyShipmentUpdateWithClient(client, shipmentId, {
          normalizedStatus: row.normalizedStatus,
          rawStatus: row.rawStatus,
          source: "CSV_IMPORT",
          statusTimestamp: row.statusTimestamp || row.deliveredAt || nowIso(),
          courier: row.courier,
          deliveredAt: row.deliveredAt,
          latestProviderPayload: { importBatchId: batch.id },
          remarks: row.remarks || `Imported from ${batch.file_name}`,
          importBatchId: batch.id,
        });

        if (result.applied) {
          updated += 1;
        }

        await client.query(
          `INSERT INTO ${importRowsTable} (
             import_batch_id, row_number, row_hash, raw_row, matched_order_id, matched_shipment_id,
             matching_method, normalized_status, validation_status, validation_errors, processing_result, status_timestamp
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'valid','[]'::jsonb,$9,$10)`,
          [
            batch.id,
            row.rowNumber,
            row.rowHash,
            {
              rawStatus: row.rawStatus,
              normalizedStatus: row.normalizedStatus,
              statusTimestamp: row.statusTimestamp,
              deliveredAt: row.deliveredAt,
              courier: row.courier,
            },
            row.matchedOrderId,
            shipmentId,
            row.matchingMethod,
            row.normalizedStatus,
            result.applied ? result.reason : `skipped_${result.reason}`,
            parseTimestamp(row.statusTimestamp || row.deliveredAt),
          ],
        );
      }

      await client.query(
        `UPDATE ${importBatchesTable}
         SET status = 'committed', updated_rows = $2, error_summary = $3
         WHERE id = $1`,
        [batch.id, updated, failures.length ? `Rows skipped: ${failures.join(", ")}` : null],
      );
      await client.query("COMMIT");
      return {
        duplicate: false,
        batchId: batch.id,
        totalRows: counts.totalRows,
        invalidRows: counts.invalidRows,
        updatedRows: updated,
        failedRows: failures,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function logMigrationException(sourceKey, reason, payload) {
  await orderMappingQuery(
    `INSERT INTO ${migrationExceptionsTable} (source_key, reason, payload) VALUES ($1,$2,$3)`,
    [sourceKey, reason, payload],
  );
}
