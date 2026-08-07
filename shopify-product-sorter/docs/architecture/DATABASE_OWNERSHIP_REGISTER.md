# Database Ownership Register

**Task:** CLEAN-002 & SAFE-008 — Database Ownership Reconciliation  
**Updated:** 2026-08-05  
**Status:** Resolved & Confirmed  
**Canonical Active SQLite Store:** `server/data/app.db`  
**PostgreSQL Owner & Schema:** Order Mapping (`order_mapping` schema)

---

## 1. Canonical Active Database Inventory

| Database Identifier | File / Schema Path | Domain Owner | Active Status | Backup Procedure | Git Status |
|---|---|---|---|---|---|
| `STORE-SQLITE-DB-MAIN` | `server/data/app.db` | Product Sorter | Active Canonical | `sqlite3 .backup` / filesystem snapshot | Git Ignored (`server/data/`) |
| `STORE-PG-SCHEMA-OM` | PostgreSQL `order_mapping` schema | Order Mapping | Active Canonical | `pg_dump -n order_mapping` | External Managed DB |

---

## 2. Duplicate & Retired Database Reconciliation (Task CLEAN-002)

| Legacy / Candidate Path | Classification | Current State | Resolution Action |
|---|---|---|---|
| `server/server/data/app.db` | Duplicate Nested Artifact | Stale copy (Jul 31 2026) | Untracked from Git index (`git rm --cached`) and ignored in `.gitignore` |
| `server/src/db/delivery_resolution.sqlite` | Absent Historical Path | Non-existent path | Documented as retired legacy path; no file on disk |
| `order_mapping.sqlite` | Absent Historical Path | Non-existent path | Documented as retired legacy path; no file on disk |
| `server/data/backups/app_backup_*.db` | Database Backup | Active Backup Copies | Retained in `server/data/backups/` under retention policy |

---

## 3. SQLite Table Ownership

| Table | Domain Owner | Writers | Readers | Lifecycle | Confidence |
|---|---|---|---|---|---|
| `collection_settings` | Product Sorter | `collectionStateService.js` | `collectionStateService.js` | Active — Sorter runtime | Confirmed |
| `product_preferences` | Product Sorter | `collectionStateService.js` | `collectionStateService.js` | Active — Sorter runtime | Confirmed |
| `collection_snapshots` | Product Sorter | `collectionStateService.js` | `collectionStateService.js` | Active — Sorter runtime | Confirmed |
| `order_backups` | Product Sorter | `collectionStateService.js` | `collectionStateService.js` | Active — Sorter runtime | Confirmed |
| `delivery_orders` | Legacy Delivery / Seed Source | `deliveryRepository.js` | `orderMappingService.js` (legacy seed) | Retained for backward read | Confirmed |
| `legacy_imports` | Legacy Delivery | `deliveryRepository.js` | `deliveryRepository.js` | Retained for CSV dedup | Confirmed |
| `delivery_logs` | Legacy Delivery | `deliveryRepository.js` | `deliveryRepository.js` | Retained for audit | Confirmed |
| `shopify_auth_cache` | Shared Platform | `database.js` (init) | In-memory fallback | Retained schema | Confirmed |

---

## 4. Reconciliation Principles & Guarantees

1. **Single Canonical Active Path:** `server/data/app.db` is the sole active SQLite database path used by the application server.
2. **Zero Data Loss:** Canonical `server/data/app.db` and backup archives in `server/data/backups/` are preserved intact.
3. **No Confidentiality Exposure:** Credentials and customer data are never written to source repositories.
