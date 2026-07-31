# Database Ownership Register

**Task:** SAFE-008 — Record database ownership uncertainties  
**Created:** 2026-07-30  
**Status:** Provisional — unknowns block deletion  
**Scope:** All SQLite tables (defined in `server/src/db/database.js`) and all PostgreSQL tables (defined in `server/migrations/order-mapping/`)

---

## SQLite Tables

| Table | Provisional Owner | Writers | Readers | Lifecycle | Confidence | Unknowns / Evidence Required |
|---|---|---|---|---|---|---|
| `collection_settings` | Sorter | `collectionStateService.js` | `collectionStateService.js` | Active — sorter runtime | **Confirmed** | — |
| `product_preferences` | Sorter | `collectionStateService.js` | `collectionStateService.js` | Active — sorter runtime | **Confirmed** | — |
| `collection_snapshots` | Sorter | `collectionStateService.js` | `collectionStateService.js` | Active — sorter runtime | **Confirmed** | — |
| `order_backups` | Sorter | `collectionStateService.js` | `collectionStateService.js` | Active — sorter runtime | **Confirmed** | — |
| `delivery_orders` | Delivery (primary) / Order Mapping (secondary) | `deliveryRepository.js` (write); `orderMappingService.js` (read-only, one-time migration seed) | `deliveryRepository.js`; `orderMappingService.js` | Active — delivery UI and Order Mapping migration seed | **Inferred** | Confirm whether `orderMappingService.js` still reads this table in production, or whether the seed migration has already run and this read path is dead code. Evidence: grep `delivery_orders` in `orderMappingService.js:357` (readonly import). |
| `legacy_imports` | Delivery | `deliveryRepository.js` | `deliveryRepository.js` | Active — legacy CSV import dedup | **Confirmed** | — |
| `delivery_logs` | Delivery | `deliveryRepository.js` | `deliveryRepository.js` | Active — delivery UI warn logging | **Confirmed** | — |
| `shopify_auth_cache` | **UNKNOWN** | None (defined, never referenced) | None | Unknown — possibly deprecated | **Unknown** | Table is created in `database.js:55` but no service file reads or writes to it. Determine whether auth tokens are cached elsewhere (e.g., in-memory, Shopify session, or env vars). If confirmed unused, mark for removal. Evidence: `rg "shopify_auth_cache" server/src` returns only `database.js:55`. |

### SQLite Alter Statements

`database.js:81-99` runs incremental `ALTER TABLE collection_settings ADD COLUMN` for `brand_priorities`, `brand_priority_weight`, `brand_trend_weight`, `product_type_trend_weight`, `color_trend_weight`. These are migrations on the Sorter's `collection_settings` table and are owned by Sorter.

---

## PostgreSQL Tables (Schema: `orderMappingSchema` from env)

| Table | Provisional Owner | Writers | Readers | Lifecycle | Confidence | Unknowns / Evidence Required |
|---|---|---|---|---|---|---|
| `orders` | Order Mapping | `orderMappingRepository.js` | `orderMappingRepository.js` | Active — primary order entity | **Confirmed** | — |
| `shipments` | Order Mapping | `orderMappingRepository.js` | `orderMappingRepository.js` | Active — shipment tracking | **Confirmed** | — |
| `status_history` | Order Mapping | `orderMappingRepository.js` | `orderMappingRepository.js` | Active — shipment status audit | **Confirmed** | — |
| `tracking_events` | Order Mapping | `orderMappingRepository.js` | `orderMappingRepository.js` | Active — carrier event log | **Confirmed** | — |
| `import_batches` | Order Mapping | `orderMappingRepository.js` | `orderMappingRepository.js` | Active — CSV import tracking | **Confirmed** | — |
| `import_rows` | Order Mapping | `orderMappingRepository.js` | `orderMappingRepository.js` | Active — CSV row tracking | **Confirmed** | — |
| `sync_runs` | Order Mapping | `orderMappingRepository.js` | `orderMappingRepository.js` | Active — sync job tracking | **Confirmed** | — |
| `network_logs` | Order Mapping | `orderMappingRepository.js` | `orderMappingRepository.js` | Active — Shiprocket API call log | **Confirmed** | — |
| `migration_exceptions` | Order Mapping | `orderMappingRepository.js` | `orderMappingRepository.js` | Active — migration error tracking | **Confirmed** | — |

---

## Dual-Path Summary

| Path | From | To | Direction | Status | Notes |
|---|---|---|---|---|---|
| SQLite → PostgreSQL | `delivery_orders` (SQLite) | `orders` (PostgreSQL) | Read-only seed | One-time migration path | `orderMappingService.js:355-416` opens SQLite readonly, dumps `delivery_orders`, and upserts into PG `orders`. Confirmed as a legacy seeding path. |
| PostgreSQL (live) | — | `orders` + related tables | Full CRUD | Active | All new order-mapping writes go exclusively through PG. |

---

## Unknowns That Block Deletion

1. **`shopify_auth_cache`** — No writer or reader found. Must confirm whether auth is handled elsewhere before deleting.
2. **`delivery_orders` SQLite read in `orderMappingService.js`** — Must confirm whether this one-time seed path is still invoked in production, or is dead code. If dead, the SQLite table may eventually be marked for removal (blocked by SAFE-003).
3. **SQLite `delivery_orders` vs PostgreSQL `orders` overlap** — Both store order-level data. Confirm whether SQLite `delivery_orders` is still the live source of truth for the Delivery UI (`deliveryRepository.js`), or whether Delivery UI has migrated to PG. Evidence suggests SQLite is still live for Delivery UI.
