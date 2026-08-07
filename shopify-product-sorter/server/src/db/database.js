import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../config/env.js";

let _db = null;

export function initDatabase(customPath) {
  if (_db) return _db;
  const targetPath = customPath || env.sqlitePath;
  const resolvedPath = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const instance = new Database(resolvedPath);
  instance.pragma("journal_mode = WAL");

  instance.exec(`
    CREATE TABLE IF NOT EXISTS collection_settings (
      collection_id TEXT PRIMARY KEY,
      collection_title TEXT NOT NULL,
      first_page_limit INTEGER NOT NULL DEFAULT 40,
      brand_priority_weight REAL NOT NULL DEFAULT 0.15,
      sales_weight REAL NOT NULL DEFAULT 0.25,
      inventory_weight REAL NOT NULL DEFAULT 0.1,
      new_product_boost REAL NOT NULL DEFAULT 0.35,
      low_seller_penalty REAL NOT NULL DEFAULT 0.2,
      randomness_weight REAL NOT NULL DEFAULT 0.15,
      brand_trend_weight REAL NOT NULL DEFAULT 0.12,
      product_type_trend_weight REAL NOT NULL DEFAULT 0.08,
      color_trend_weight REAL NOT NULL DEFAULT 0.05,
      selected INTEGER NOT NULL DEFAULT 0,
      last_generated_order TEXT,
      last_applied_order TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_preferences (
      collection_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      allotted_position INTEGER,
      include_in_rotation INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (collection_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS collection_snapshots (
      collection_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id TEXT NOT NULL,
      type TEXT NOT NULL,
      order_payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shopify_auth_cache (
      shop_domain TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      expires_at TEXT,
      token_type TEXT,
      scope TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS delivery_orders (
      id INTEGER PRIMARY KEY, shopify_order_id TEXT NOT NULL UNIQUE, shopify_order_name TEXT NOT NULL, shopify_order_number TEXT,
      order_created_at TEXT NOT NULL, customer_name TEXT, awb TEXT, shopify_fulfillment_status TEXT, cancellation_status TEXT,
      shopify_updated_at TEXT, logistics_raw_status TEXT, resolution TEXT NOT NULL DEFAULT 'UNRESOLVED', resolution_source TEXT NOT NULL DEFAULT 'NONE',
      courier TEXT, delivered_at TEXT, shiprocket_order_reference TEXT, shiprocket_channel_reference TEXT, shiprocket_response_id TEXT,
      logistics_updated_at TEXT, manual_note TEXT, manual_resolved_at TEXT, legacy_import_name TEXT, last_synced_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS delivery_orders_order_name ON delivery_orders(shopify_order_name);
    CREATE INDEX IF NOT EXISTS delivery_orders_awb ON delivery_orders(awb);
    CREATE TABLE IF NOT EXISTS legacy_imports (id INTEGER PRIMARY KEY, content_hash TEXT NOT NULL UNIQUE, filename TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS delivery_logs (id INTEGER PRIMARY KEY, level TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL);
  `);

  try {
    instance.exec(`
      ALTER TABLE collection_settings ADD COLUMN brand_priorities TEXT NOT NULL DEFAULT '{}';
    `);
  } catch (e) {
    // column already exists
  }

  for (const statement of [
    `ALTER TABLE collection_settings ADD COLUMN brand_priority_weight REAL NOT NULL DEFAULT 0.15;`,
    `ALTER TABLE collection_settings ADD COLUMN brand_trend_weight REAL NOT NULL DEFAULT 0.12;`,
    `ALTER TABLE collection_settings ADD COLUMN product_type_trend_weight REAL NOT NULL DEFAULT 0.08;`,
    `ALTER TABLE collection_settings ADD COLUMN color_trend_weight REAL NOT NULL DEFAULT 0.05;`,
  ]) {
    try {
      instance.exec(statement);
    } catch (e) {
      // column already exists
    }
  }

  _db = instance;
  return _db;
}

export function getDb() {
  if (!_db) {
    initDatabase();
  }
  return _db;
}

export function closeDatabase() {
  if (_db) {
    try {
      _db.close();
    } catch {}
    _db = null;
  }
}

const db = new Proxy({}, {
  get(target, prop) {
    const instance = getDb();
    const value = instance[prop];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  }
});

export default db;
