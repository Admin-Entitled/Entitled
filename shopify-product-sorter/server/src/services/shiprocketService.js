import { env } from "../config/env.js";
import { addNetworkLog } from "./sorterRuntimeService.js";
import {
  authenticateShiprocket,
  getCachedShiprocketToken,
  getShiprocketBaseUrl,
  isShiprocketConfigured,
  setCachedShiprocketToken,
  shiprocketRequest,
} from "./shiprocketTransport.js";

/**
 * Sales-intelligence Shiprocket client.
 *
 * Consumes the canonical shiprocketTransport (auth, token refresh, timeout,
 * retry) while keeping this domain's error categorization and sorter-log sink.
 */

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
      // The 401-refresh attempt is recorded as a success (legacy behavior).
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

async function authenticate() {
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

export async function fetchShiprocketOrders({ start, end }) {
  if (!isShiprocketConfigured()) return { configured: false, shipments: [], pages: 0 };
  if (!getCachedShiprocketToken()) await authenticate();
  const shipments = []; let page = 1; let totalPages = 1;
  while (page <= totalPages) {
    const url = new URL(`${getShiprocketBaseUrl()}/v1/external/orders`);
    Object.entries({ page, per_page: 100, sort: "DESC", sort_by: "id", from: start, to: end, channel_id: env.shiprocketChannelId || undefined }).forEach(([key, value]) => value && url.searchParams.set(key, value));
    const payload = await shiprocketRequest(
      url,
      { headers: { Authorization: `Bearer ${getCachedShiprocketToken()}` } },
      {
        operation: "shiprocket_orders",
        respectRetryAfter: true,
        refresh: authenticate,
        onLog: logNetworkEntry,
        createError: createShiprocketError,
      },
    );
    const batch = Array.isArray(payload.data) ? payload.data : [];
    shipments.push(...batch.flatMap((item) => (Array.isArray(item.shipments) && item.shipments.length ? item.shipments : [item]).map((shipment) => ({
      responseId: String(shipment.id || shipment.shipment_id || item.id || ""), orderReference: item.order_id || item.order_reference || shipment.order_id || "", channelOrderId: item.channel_order_id || item.channel_order_reference || shipment.channel_order_id || "",
      awb: shipment.awb_code || shipment.awb || item.awb_code || item.awb || "", courier: shipment.courier_name || item.courier_name || "", rawStatus: shipment.status || shipment.current_status || item.status || item.current_status || "",
      deliveredAt: shipment.delivered_date || shipment.delivered_at || item.delivered_date || item.delivered_at || "", logisticsUpdatedAt: shipment.updated_at || shipment.updated_on || item.updated_at || item.updated_on || "",
    }))));
    totalPages = Number(payload.meta?.pagination?.total_pages || 1); page += 1;
  }
  return { configured: true, shipments, pages: totalPages };
}
