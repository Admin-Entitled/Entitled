import db from "../db/database.js";
import { mapLegacyStatus, mapShiprocketStatus } from "./statusMapper.js";

const now = () => new Date().toISOString();
const automatic = (order) => order.resolution_source !== "MANUAL";

export function upsertShopifyOrders(orders) {
  const write = db.prepare(`INSERT INTO delivery_orders (
    shopify_order_id, shopify_order_name, shopify_order_number, order_created_at, customer_name, awb, shopify_fulfillment_status,
    cancellation_status, shopify_updated_at, last_synced_at, created_at, updated_at
  ) VALUES (@id,@name,@number,@createdAt,@customerName,@awb,@fulfillmentStatus,@cancelledAt,@updatedAt,@now,@now,@now)
  ON CONFLICT(shopify_order_id) DO UPDATE SET shopify_order_name=excluded.shopify_order_name,order_created_at=excluded.order_created_at,
  shopify_order_number=excluded.shopify_order_number,customer_name=excluded.customer_name,awb=excluded.awb,shopify_fulfillment_status=excluded.shopify_fulfillment_status,
  cancellation_status=excluded.cancellation_status,shopify_updated_at=excluded.shopify_updated_at,last_synced_at=excluded.last_synced_at,updated_at=excluded.updated_at`);
  const transaction = db.transaction(() => orders.forEach((order) => write.run({ ...order, now: now() })));
  transaction();
}

export function saveAutomaticResolution(id, payload) {
  const existing = db.prepare("SELECT resolution_source FROM delivery_orders WHERE id=?").get(id);
  if (!existing || !automatic(existing)) return;
  db.prepare(`UPDATE delivery_orders SET logistics_raw_status=@rawStatus,resolution=@resolution,resolution_source=@source,courier=@courier,
    delivered_at=@deliveredAt,shiprocket_order_reference=@orderReference,shiprocket_channel_reference=@channelReference,
    shiprocket_response_id=@responseId,logistics_updated_at=@logisticsUpdatedAt,legacy_import_name=@legacyImportName,last_synced_at=@now,updated_at=@now WHERE id=@id`).run({
    ...payload, id, now: now(), courier: payload.courier || null, deliveredAt: payload.deliveredAt || null,
    orderReference: payload.orderReference || null, channelReference: payload.channelReference || null,
    responseId: payload.responseId || null, logisticsUpdatedAt: payload.logisticsUpdatedAt || null, legacyImportName: payload.legacyImportName || null,
  });
}

export function listOrders({ filter = "ALL", search = "", page = 1, pageSize = 50 } = {}) {
  const clauses = []; const values = [];
  if (filter !== "ALL") { clauses.push("resolution=?"); values.push(filter.replace("_", " ").toUpperCase().replace(" ", "_")); }
  if (search.trim()) { clauses.push("(shopify_order_name LIKE ? OR awb LIKE ?)"); values.push(`%${search.trim()}%`, `%${search.trim()}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = db.prepare(`SELECT count(*) AS count FROM delivery_orders ${where}`).get(...values).count;
  const rows = db.prepare(`SELECT * FROM delivery_orders ${where} ORDER BY order_created_at DESC LIMIT ? OFFSET ?`).all(...values, pageSize, (page - 1) * pageSize);
  const summary = db.prepare("SELECT resolution, count(*) AS count FROM delivery_orders GROUP BY resolution").all();
  return { orders: rows, total, page, pageSize, summary: Object.fromEntries(summary.map((x) => [x.resolution, x.count])) };
}

export function setManualResolution(id, resolution, note) {
  db.prepare("UPDATE delivery_orders SET resolution=?,resolution_source='MANUAL',manual_note=?,manual_resolved_at=?,updated_at=? WHERE id=?").run(resolution, note || null, now(), now(), id);
}

export function resetManualResolution(id) {
  const order = db.prepare("SELECT * FROM delivery_orders WHERE id=?").get(id);
  if (!order) return;
  const isShiprocket = Boolean(order.shiprocket_response_id);
  const source = isShiprocket ? "SHIPROCKET" : order.legacy_import_name ? "LEGACY_CSV" : "NONE";
  const resolution = isShiprocket ? mapShiprocketStatus(order.logistics_raw_status) : order.legacy_import_name ? mapLegacyStatus(order.logistics_raw_status) : "UNRESOLVED";
  db.prepare("UPDATE delivery_orders SET resolution=?,resolution_source=?,manual_note=NULL,manual_resolved_at=NULL,updated_at=? WHERE id=?").run(resolution, source, now(), id);
}

export function getOrdersForLegacy() { return db.prepare("SELECT * FROM delivery_orders WHERE resolution_source NOT IN ('MANUAL','SHIPROCKET')").all(); }
export function getImport(hash) { return db.prepare("SELECT result_json FROM legacy_imports WHERE content_hash=?").get(hash); }
export function saveImport(hash, filename, result) { db.prepare("INSERT INTO legacy_imports(content_hash,filename,result_json,created_at) VALUES(?,?,?,?)").run(hash, filename, JSON.stringify(result), now()); }
export function logUnknownStatus(message) { db.prepare("INSERT INTO delivery_logs(level,message,created_at) VALUES('warn',?,?)").run(message, now()); }
