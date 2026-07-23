import { env } from "../config/env.js";
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

async function shiprocketRequest(url, options, allowRefresh = true) {
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
        return shiprocketRequest(url, options, false);
      }
      if (response.ok) {
        await createNetworkLog({
          operation: "shiprocket_refresh",
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
      const error = new Error(response.status === 401 ? "Shiprocket authentication failed" : `Shiprocket API request failed (${response.status})`);
      error.category = response.status === 401 ? "shiprocket_authentication" : "shiprocket_api";
      await createNetworkLog({
        operation: "shiprocket_refresh",
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
          operation: "shiprocket_refresh",
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
  );

  if (!payload.token) {
    const error = new Error("Shiprocket authentication failed");
    error.category = "shiprocket_authentication";
    throw error;
  }

  token = payload.token;
}

function normalizeShiprocketRow(item, shipment) {
  return {
    shiprocketResponseId: String(shipment.id || shipment.shipment_id || item.id || ""),
    shiprocketOrderReference: String(item.order_id || item.order_reference || shipment.order_id || ""),
    shiprocketChannelReference: String(item.channel_order_id || item.channel_order_reference || shipment.channel_order_id || ""),
    awb: String(shipment.awb_code || shipment.awb || item.awb_code || item.awb || ""),
    courier: String(shipment.courier_name || item.courier_name || ""),
    rawStatus: String(shipment.status || shipment.current_status || item.status || item.current_status || ""),
    statusTimestamp: shipment.updated_at || shipment.updated_on || item.updated_at || item.updated_on || null,
    deliveredAt: shipment.delivered_date || shipment.delivered_at || item.delivered_date || item.delivered_at || null,
    latestProviderPayload: shipment,
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

    const payload = await shiprocketRequest(url, { headers: { Authorization: `Bearer ${token}` } });
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
