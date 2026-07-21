import { env } from "../config/env.js";

let token = env.shiprocketToken;
const timeoutMs = Number(process.env.SHIPROCKET_REQUEST_TIMEOUT_MS || 15_000);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function configured() { return Boolean(token || (env.shiprocketEmail && env.shiprocketPassword)); }
function base() { return env.shiprocketBaseUrl.replace(/\/$/, ""); }

async function request(url, options, allowRefresh = true) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 && allowRefresh && !env.shiprocketToken) { token = ""; await authenticate(); return request(url, options, false); }
      if (response.ok) return body;
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * (2 ** attempt)); continue;
      }
      const error = new Error(response.status === 401 ? "Shiprocket authentication failed" : response.status === 429 ? "Shiprocket rate limit reached" : `Shiprocket API request failed (${response.status})`);
      error.category = response.status === 401 ? "shiprocket_authentication" : response.status === 429 ? "shiprocket_rate_limit" : "shiprocket_api"; throw error;
    } catch (error) {
      if (error.category || attempt === 2) { error.category ||= error.name === "AbortError" ? "shiprocket_timeout" : "shiprocket_network"; throw error; }
      await delay(250 * (2 ** attempt));
    } finally { clearTimeout(timer); }
  }
}

async function authenticate() {
  const payload = await request(`${base()}/v1/external/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: env.shiprocketEmail, password: env.shiprocketPassword }) }, false);
  if (!payload.token) { const error = new Error("Shiprocket authentication failed"); error.category = "shiprocket_authentication"; throw error; }
  token = payload.token;
}

export async function fetchShiprocketOrders({ start, end }) {
  if (!configured()) return { configured: false, shipments: [], pages: 0 };
  if (!token) await authenticate();
  const shipments = []; let page = 1; let totalPages = 1;
  while (page <= totalPages) {
    const url = new URL(`${base()}/v1/external/orders`);
    Object.entries({ page, per_page: 100, sort: "DESC", sort_by: "id", from: start, to: end, channel_id: env.shiprocketChannelId || undefined }).forEach(([key, value]) => value && url.searchParams.set(key, value));
    const payload = await request(url, { headers: { Authorization: `Bearer ${token}` } });
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
