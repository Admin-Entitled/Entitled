import { env } from "../config/env.js";
import { orderMappingError } from "./orderMappingError.js";
import { createNetworkLog } from "./orderMappingRepository.js";

let token = env.shiprocketToken;
const timeoutMs = Number(process.env.SHIPROCKET_REQUEST_TIMEOUT_MS || 15_000);

function configured() {
  return Boolean(token || (env.shiprocketEmail && env.shiprocketPassword));
}

function baseUrl() {
  return env.shiprocketBaseUrl.replace(/\/$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sortLatestFirst(rows, getTimestamp) {
  return [...rows].sort((left, right) => {
    const leftTime = Date.parse(getTimestamp(left) || "") || 0;
    const rightTime = Date.parse(getTimestamp(right) || "") || 0;
    return rightTime - leftTime;
  });
}

async function shiprocketRequest(url, options, allowRefresh = true, operation = "shiprocket_api") {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = new Date();

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 401 && allowRefresh && !env.shiprocketToken) {
        token = "";
        await authenticateShiprocket();
        return shiprocketRequest(url, options, false, operation);
      }

      if (response.ok) {
        await createNetworkLog({
          operation,
          provider: "SHIPROCKET",
          method: options?.method || "GET",
          endpoint: typeof url === "string" ? new URL(url).pathname : url.pathname,
          status: "success",
          statusCode: response.status,
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
        });
        return payload;
      }

      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await sleep(250 * (2 ** attempt));
        continue;
      }

      const error = orderMappingError(
        response.status === 401
          ? "ORDER_MAPPING_PROVIDER_AUTH_FAILED"
          : "ORDER_MAPPING_PROVIDER_REQUEST_FAILED",
        response.status === 401
          ? "Shiprocket authentication failed"
          : "Shiprocket request failed",
        { statusCode: response.status === 401 ? 502 : 503 },
      );
      error.category = response.status === 401 ? "shiprocket_authentication" : "shiprocket_api";
      await createNetworkLog({
        operation,
        provider: "SHIPROCKET",
        method: options?.method || "GET",
        endpoint: typeof url === "string" ? new URL(url).pathname : url.pathname,
        status: "failed",
        statusCode: response.status,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        errorSummary: error.message,
      });
      throw error;
    } catch (error) {
      if (attempt === 2 || error.category) {
        error.category ||= error.name === "AbortError" ? "shiprocket_timeout" : "shiprocket_network";
        await createNetworkLog({
          operation,
          provider: "SHIPROCKET",
          method: options?.method || "GET",
          endpoint: typeof url === "string" ? new URL(url).pathname : url.pathname,
          status: "failed",
          statusCode: error.statusCode || null,
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          errorSummary: error.message,
        }).catch(() => {});
        throw error;
      }

      await sleep(250 * (2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  return {};
}

async function authenticateShiprocket() {
  const payload = await shiprocketRequest(
    `${baseUrl()}/v1/external/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: env.shiprocketEmail, password: env.shiprocketPassword }),
    },
    false,
    "shiprocket_auth",
  );

  if (!payload.token) {
    const error = orderMappingError(
      "ORDER_MAPPING_PROVIDER_AUTH_FAILED",
      "Shiprocket authentication failed",
      { statusCode: 502 },
    );
    error.category = "shiprocket_authentication";
    throw error;
  }

  token = payload.token;
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
  if (!configured()) {
    return { configured: false, pages: 0, shipments: [] };
  }

  if (!token) {
    await authenticateShiprocket();
  }

  let page = 1;
  let totalPages = 1;
  const shipments = [];

  while (page <= totalPages) {
    const url = new URL(`${baseUrl()}/v1/external/orders`);
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
      { headers: { Authorization: `Bearer ${token}` } },
      true,
      "shiprocket_orders",
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
  if (!configured()) {
    return { configured: false };
  }

  if (!token) {
    await authenticateShiprocket();
  }

  const safeAwb = String(awb || "").trim();
  if (!safeAwb) {
    return { configured: true, tracking: null };
  }

  const payload = await shiprocketRequest(
    `${baseUrl()}/v1/external/courier/track/awb/${encodeURIComponent(safeAwb)}`,
    { headers: { Authorization: `Bearer ${token}` } },
    true,
    "shiprocket_tracking",
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
