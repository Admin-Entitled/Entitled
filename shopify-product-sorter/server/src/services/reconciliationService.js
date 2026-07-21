import crypto from "node:crypto";
import { parseLegacyCsv } from "./legacyCsv.js";
import { findShipment, normalizeIdentifier } from "./orderMatcher.js";
import { mapLegacyStatus, mapShiprocketStatus } from "./statusMapper.js";
import { fetchDeliveryOrders } from "./deliveryShopify.js";
import { fetchShiprocketOrders } from "./shiprocketService.js";
import { getImport, getOrdersForLegacy, listOrders, logUnknownStatus, saveAutomaticResolution, saveImport, upsertShopifyOrders } from "./deliveryRepository.js";

export async function syncDeliveryOrders(range) {
  const shopify = await fetchDeliveryOrders(range); upsertShopifyOrders(shopify.orders);
  let shiprocket; let warning = "";
  try { shiprocket = await fetchShiprocketOrders(range); } catch (error) { shiprocket = { configured: true, shipments: [], pages: 0 }; warning = error.message; }
  const stored = listOrders({ pageSize: 100000 }).orders;
  let matched = 0; let ambiguous = 0;
  for (const order of stored) {
    const result = findShipment({ name: order.shopify_order_name, number: order.shopify_order_number, awb: order.awb }, shiprocket.shipments);
    if (!result.match) { if (result.reason === "ambiguous") ambiguous += 1; continue; }
    const shipment = result.match; const resolution = mapShiprocketStatus(shipment.rawStatus);
    if (resolution === "UNRESOLVED" && shipment.rawStatus) logUnknownStatus(`Unknown Shiprocket status: ${shipment.rawStatus}`);
    saveAutomaticResolution(order.id, { ...shipment, resolution, source: "SHIPROCKET", rawStatus: shipment.rawStatus, channelReference: shipment.channelOrderId }); matched += 1;
  }
  return { shopifyOrders: shopify.orders.length, shopifyPages: shopify.pages, shiprocketShipments: shiprocket.shipments.length, shiprocketPages: shiprocket.pages, matched, ambiguous, warning };
}

export function importLegacyCsv({ text, filename, mapping }) {
  const hash = crypto.createHash("sha256").update(text).digest("hex"); const previous = getImport(hash);
  if (previous) return { ...JSON.parse(previous.result_json), duplicate: true };
  const parsed = parseLegacyCsv(text, mapping); const orders = getOrdersForLegacy();
  let matched = 0; let delivered = 0; let notDelivered = 0; let ambiguous = 0;
  for (const row of parsed.rows) {
    const candidates = orders.filter((order) => normalizeIdentifier(order.shopify_order_number) === normalizeIdentifier(row.orderNumber) || (normalizeIdentifier(row.awb) && normalizeIdentifier(order.awb) === normalizeIdentifier(row.awb)));
    if (candidates.length !== 1) { if (candidates.length > 1) ambiguous += 1; continue; }
    const resolution = mapLegacyStatus(row.status);
    if (resolution === "UNRESOLVED") logUnknownStatus(`Unknown legacy status: ${row.status}`);
    saveAutomaticResolution(candidates[0].id, { resolution, source: "LEGACY_CSV", rawStatus: row.status, deliveredAt: row.deliveredAt, legacyImportName: filename });
    matched += 1; delivered += resolution === "DELIVERED"; notDelivered += resolution === "NOT_DELIVERED";
  }
  const result = { rowsProcessed: parsed.rows.length, ordersMatched: matched, delivered, notDelivered, unmatchedRows: parsed.rows.length - matched - ambiguous, ambiguousRows: ambiguous, duplicate: false };
  saveImport(hash, filename, result); return result;
}
