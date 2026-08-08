import { env } from "../config/env.js";
import { orderMappingError } from "./orderMappingError.js";
import { createNetworkLog } from "./orderMappingRepository.js";
import {
  authenticateShiprocket,
  getCachedShiprocketToken,
  getShiprocketBaseUrl,
  isShiprocketConfigured,
  setCachedShiprocketToken,
  shiprocketRequest,
} from "./shiprocketTransport.js";

/**
 * Order Mapping Shiprocket client.
 *
 * Consumes the canonical shiprocketTransport (auth, token refresh, timeout,
 * retry) while keeping this domain's error contract and order-mapping log sink.
 */

function createOrderMappingError({ status }) {
  const error = orderMappingError(
    status === 401
      ? "ORDER_MAPPING_PROVIDER_AUTH_FAILED"
      : "ORDER_MAPPING_PROVIDER_REQUEST_FAILED",
    status === 401
      ? "Shiprocket authentication failed"
      : "Shiprocket request failed",
    { statusCode: status === 401 ? 502 : 503 },
  );
  error.category = status === 401 ? "shiprocket_authentication" : "shiprocket_api";
  return error;
}

function logNetworkEntry(entry) {
  // Legacy logging cadence: the 401-refresh attempt and transient retries are
  // not recorded; only final success/failure entries reach the repo.
  if (entry.type === "refreshing") {
    return undefined;
  }
  if (entry.type === "failed" && !entry.final) {
    return undefined;
  }
  return createNetworkLog({
    operation: entry.operation,
    provider: "SHIPROCKET",
    method: entry.method,
    endpoint: entry.endpoint,
    status: entry.status,
    statusCode: entry.statusCode,
    startedAt: entry.startedAt.toISOString(),
    completedAt: entry.completedAt.toISOString(),
    durationMs: entry.durationMs,
    errorSummary: entry.errorSummary,
  }).catch(() => {});
}

async function authenticate() {
  const payload = await authenticateShiprocket({
    operation: "shiprocket_auth",
    onLog: logNetworkEntry,
    createError: createOrderMappingError,
  });

  if (!payload.token) {
    const error = orderMappingError(
      "ORDER_MAPPING_PROVIDER_AUTH_FAILED",
      "Shiprocket authentication failed",
      { statusCode: 502 },
    );
    error.category = "shiprocket_authentication";
    throw error;
  }

  setCachedShiprocketToken(payload.token);
}

function sortLatestFirst(rows, getTimestamp) {
  return [...rows].sort((left, right) => {
    const leftTime = Date.parse(getTimestamp(left) || "") || 0;
    const rightTime = Date.parse(getTimestamp(right) || "") || 0;
    return rightTime - leftTime;
  });
}

function normalizeShiprocketRow(item, shipment) {
  const orderStatus = item.current_status || item.status || "";
  const orderStatusCode = item.current_status_id || item.status_code || "";
  const shipmentStatus =
    shipment["sr-status-label"] ||
    shipment.current_status ||
    shipment.status ||
    "";
  const shipmentStatusCode =
    shipment["sr-status"] ||
    shipment.current_status_id ||
    shipment.status_id ||
    shipment.status ||
    "";
  const hasAssignedShipmentState = Boolean(
    shipment.awb_code ||
      shipment.awb ||
      shipment.courier_name ||
      shipment.current_status ||
      shipment.current_status_id ||
      shipment.status_id,
  );

  return {
    shiprocketResponseId: String(shipment.id || shipment.shipment_id || item.id || ""),
    shiprocketOrderReference: String(item.order_id || item.order_reference || shipment.order_id || ""),
    shiprocketChannelReference: String(
      item.channel_order_id || item.channel_order_reference || shipment.channel_order_id || "",
    ),
    awb: String(shipment.awb_code || shipment.awb || item.awb_code || item.awb || ""),
    courier: String(shipment.courier_name || item.courier_name || ""),
    rawStatus: String(hasAssignedShipmentState ? shipmentStatus || orderStatus : orderStatus || shipmentStatus || ""),
    rawStatusCode: String(
      hasAssignedShipmentState
        ? shipmentStatusCode || orderStatusCode
        : orderStatusCode || shipmentStatusCode || "",
    ),
    statusTimestamp: shipment.updated_at || shipment.updated_on || item.updated_at || item.updated_on || null,
    deliveredAt: shipment.delivered_date || shipment.delivered_at || item.delivered_date || item.delivered_at || null,
    latestProviderPayload: {
      ...shipment,
      order_total: String(item.total || shipment.total || ""),
      order_status: String(orderStatus || ""),
      order_status_code: String(orderStatusCode || ""),
    },
  };
}

export async function fetchOrderMappingShiprocketShipments({ start, end }) {
  if (!isShiprocketConfigured()) {
    return { configured: false, pages: 0, shipments: [] };
  }

  if (!getCachedShiprocketToken()) {
    await authenticate();
  }

  let page = 1;
  let totalPages = 1;
  const shipments = [];

  while (page <= totalPages) {
    const url = new URL(`${getShiprocketBaseUrl()}/v1/external/orders`);
    for (const [key, value] of Object.entries({
      page,
      per_page: 100,
      sort: "DESC",
      sort_by: "id",
      from: start,
      to: end,
      channel_id: env.shiprocketChannelId || undefined,
    })) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }

    const payload = await shiprocketRequest(
      url,
      { headers: { Authorization: `Bearer ${getCachedShiprocketToken()}` } },
      {
        operation: "shiprocket_orders",
        refresh: authenticate,
        onLog: logNetworkEntry,
        createError: createOrderMappingError,
      },
    );
    const data = Array.isArray(payload.data) ? payload.data : [];
    for (const item of data) {
      const rows = Array.isArray(item.shipments) && item.shipments.length ? item.shipments : [item];
      shipments.push(...rows.map((shipment) => normalizeShiprocketRow(item, shipment)));
    }
    totalPages = Number(payload.meta?.pagination?.total_pages || 1);
    page += 1;
  }

  return { configured: true, pages: totalPages, shipments };
}

export async function fetchOrderMappingShiprocketTracking(awb) {
  if (!isShiprocketConfigured()) {
    return { configured: false };
  }

  if (!getCachedShiprocketToken()) {
    await authenticate();
  }

  const safeAwb = String(awb || "").trim();
  if (!safeAwb) {
    return { configured: true, tracking: null };
  }

  const payload = await shiprocketRequest(
    `${getShiprocketBaseUrl()}/v1/external/courier/track/awb/${encodeURIComponent(safeAwb)}`,
    { headers: { Authorization: `Bearer ${getCachedShiprocketToken()}` } },
    {
      operation: "shiprocket_tracking",
      refresh: authenticate,
      onLog: logNetworkEntry,
      createError: createOrderMappingError,
    },
  );

  const tracking = payload.tracking_data || payload.data || payload || {};
  const activityRows = Array.isArray(tracking.shipment_track_activities)
    ? sortLatestFirst(tracking.shipment_track_activities, (event) => event.date)
    : [];
  const shipmentRows = Array.isArray(tracking.shipment_track)
    ? sortLatestFirst(
        tracking.shipment_track,
        (shipment) => shipment.updated_time_stamp || shipment.pickup_date,
      )
    : [];
  const latestActivity = activityRows[0] || null;
  const latestShipment = shipmentRows[0] || null;
  const rawStatus =
    latestActivity?.["sr-status-label"] ||
    latestShipment?.current_status ||
    tracking.current_status ||
    tracking.shipment_status_label ||
    tracking.shipment_status ||
    "";
  const rawStatusCode =
    latestActivity?.["sr-status"] ||
    latestShipment?.current_status_id ||
    tracking.shipment_status_id ||
    tracking.current_status_id ||
    "";

  return {
    configured: true,
    tracking: {
      awb: latestShipment?.awb_code || safeAwb,
      courier: latestShipment?.courier_name || tracking.courier_name || "",
      rawStatus,
      rawStatusCode: String(rawStatusCode || ""),
      statusTimestamp:
        latestActivity?.date ||
        latestShipment?.updated_time_stamp ||
        latestShipment?.pickup_date ||
        null,
      deliveredAt: latestShipment?.delivered_date || null,
      latestProviderPayload: tracking,
      trackingEvents: activityRows.map((event) => ({
        rawStatus: event["sr-status-label"] || event.activity || event.status || "",
        normalizedHint: event["sr-status-label"] || event.activity || "",
        statusTimestamp: event.date || null,
        eventLocation: event.location || null,
        rawStatusCode: String(event["sr-status"] || ""),
      })),
    },
  };
}
