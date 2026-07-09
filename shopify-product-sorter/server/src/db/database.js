import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../config/env.js";

const resolvedPath = path.resolve(env.sqlitePath);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const db = new Database(resolvedPath);
db.pragma("journal_mode = WAL");

db.exec(`
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
`);

try {
  db.exec(`
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
    db.exec(statement);
  } catch (e) {
    // column already exists
  }
}

export default db;
