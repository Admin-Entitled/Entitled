# Canonical Data Contracts and Database Schemas

> **Canonical Document**: `DOC-002`  
> **Status**: APPROVED / ACTIVE  
> **Last Updated**: 2026-08-07  

## 1. Storage Architecture Overview

The system uses a hybrid storage model:
1. **SQLite Database (`sorter.db`)**: Primary storage for Product Sorter snapshots, generated placements, backups, and Sales Intelligence analytics cache.
2. **PostgreSQL Database (`order_mapping`)**: Optional external storage for Order Mapping sync, delivery statuses, and Shiprocket integration data.

---

## 2. SQLite Database Schema (`server/src/db/sorter.db`)

### 2.1 Table: `collection_snapshots`
Stores synced Shopify collection product ordering state prior to reordering.
```sql
CREATE TABLE IF NOT EXISTS collection_snapshots (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  title TEXT,
  products_json TEXT NOT NULL,
  total_products INTEGER DEFAULT 0,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 Table: `generated_orders`
Stores placement recommendations calculated by the Product Sorter algorithm.
```sql
CREATE TABLE IF NOT EXISTS generated_orders (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  rule_preset TEXT NOT NULL,
  placements_json TEXT NOT NULL,
  moved_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'draft'
);
```

### 2.3 Table: `collection_backups`
Stores safety backups created prior to applying new placement orders to Shopify.
```sql
CREATE TABLE IF NOT EXISTS collection_backups (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  products_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (snapshot_id) REFERENCES collection_snapshots(id)
);
```

### 2.4 Table: `sales_intelligence_cache`
Stores imported or manual sales metrics used by the placement scoring algorithm.
```sql
CREATE TABLE IF NOT EXISTS sales_intelligence_cache (
  sku TEXT PRIMARY KEY,
  sales_count INTEGER DEFAULT 0,
  revenue REAL DEFAULT 0.0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. PostgreSQL Database Schema (`order_mapping`)

When `ORDER_MAPPING_DATABASE_URL` is configured, PostgreSQL persists external order mapping data via Knex migrations (`server/src/db/migrations/`).

### 3.1 Key Tables
- `orders`: External order records with Shiprocket tracking IDs.
- `order_items`: Line items with SKU and quantity details.
- `status_history`: Audit trail of order status transitions.

---

## 4. Backup, Retention, and Disposal Ownership

1. **Product Sorter Backups**: Automatically created in SQLite before every Shopify apply operation. Managed by `sorterService.js`.
2. **Retention Policy**:
   - `collection_snapshots`: Retained for audit; oldest pruned after 30 days.
   - `collection_backups`: Last 5 backups per collection preserved for rollback safety.
3. **Disposal Ownership**: `server/src/scripts/cleanupRetention.js` handles automated pruning without touching production order records.
