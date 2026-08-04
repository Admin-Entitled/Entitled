# 12-Hour Delivery Resolution to Order Mapping Migration Runbook

## 1. Executive Summary & Scope

- **Activity Owner**: Agentic Migration Strike Team
- **Planned Start Timestamp**: 2026-08-04T00:00:00Z
- **Target Completion Window**: 12 Hours
- **Primary Objective**: Migrate legacy Delivery Resolution data (SQLite) into the canonical Order Mapping PostgreSQL store with zero data loss, deterministic idempotency, automated verification, and full rollback capability.

### Included Scope
1. **STORE-DELIVERY-SQLITE-DB**: SQLite store at `server/data/app.db`
2. **TBL-DELIVERY-ORDERS**: SQLite table `delivery_orders` -> PG tables `order_mapping.orders` and `order_mapping.shipments`
3. **TBL-LEGACY-IMPORTS**: SQLite table `legacy_imports` -> PG table `order_mapping.import_batches`
4. **TBL-DELIVERY-LOGS**: SQLite table `delivery_logs` -> PG table `order_mapping.migration_exceptions` / diagnostic logs

### Excluded Scope
- `collection_settings`, `product_preferences`, `collection_snapshots` (Product Sorter domain data)
- Decommissioning legacy SQLite tables (retained read-only for audit compliance)
- Destructive cleanup or schema drops on target PostgreSQL
- Unrelated non-migration feature development

---

## 2. Source and Target Specifications

### Source Database & Tables
- **Database**: SQLite (`server/data/app.db`)
- **Tables**:
  - `delivery_orders` (id, shopify_order_id, shopify_order_name, shopify_order_number, order_created_at, customer_name, awb, shopify_fulfillment_status, cancellation_status, shopify_updated_at, logistics_raw_status, resolution, resolution_source, courier, delivered_at, shiprocket_order_reference, shiprocket_channel_reference, shiprocket_response_id, logistics_updated_at, manual_note, manual_resolved_at, legacy_import_name, last_synced_at, created_at, updated_at)
  - `legacy_imports` (id, content_hash, filename, result_json, created_at)
  - `delivery_logs` (id, level, message, created_at)

### Target Database & Tables
- **Database**: PostgreSQL (`ORDER_MAPPING_SCHEMA` default `order_mapping`)
- **Tables**:
  - `order_mapping.orders`
  - `order_mapping.shipments`
  - `order_mapping.status_history`
  - `order_mapping.import_batches`
  - `order_mapping.migration_exceptions`
  - `order_mapping.sync_runs`

---

## 3. Field Mapping & Transformation Rules

### `delivery_orders` -> `orders` & `shipments`
| Source Field | Target Table | Target Field | Transformation / Default Rule |
| :--- | :--- | :--- | :--- |
| `shopify_order_id` | `orders` | `shopify_order_id` | String trim, mandatory unique key |
| `shopify_order_name` | `orders` | `shopify_order_name` | String trim |
| `shopify_order_number` | `orders` | `shopify_order_number` | Fallback to `shopify_order_name` if empty |
| `order_created_at` | `orders` | `order_date` | Parse ISO/TIMESTAMPTZ, default NOW() |
| `customer_name` | `orders` | `customer_name` | String trim |
| `shopify_fulfillment_status` | `orders` | `shopify_fulfillment_status` | String trim |
| `cancellation_status` | `orders` | `cancellation_status` | String trim / NULL |
| `shopify_updated_at` | `orders` | `shopify_updated_at` | Parse TIMESTAMPTZ, fallback to `updated_at` |
| `awb` | `shipments` | `awb` / `shopify_tracking_number` | Trim, set NULL if empty string |
| `courier` | `shipments` | `courier` | Trim |
| `logistics_raw_status` | `shipments` | `raw_status` | Raw string retained |
| `resolution` | `shipments` | `normalized_status` | Map using `normalizeOrderMappingStatus` |
| `resolution_source` | `shipments` | `status_source` | If "MANUAL" -> set `manual_override` and `manual_override_lock` true |
| `delivered_at` | `shipments` | `delivered_at` | Parse TIMESTAMPTZ |
| `shiprocket_order_reference` | `shipments` | `shiprocket_order_reference` | String trim |
| `shiprocket_channel_reference` | `shipments` | `shiprocket_channel_reference` | String trim |
| `shiprocket_response_id` | `shipments` | `shiprocket_response_id` | Trim, set NULL if empty string |
| `manual_note` | `status_history` | `remarks` | Saved in status_history event |

---

## 4. Conflict & Duplicate Policies

- **Conflict Policy**: `FAIL_AND_REPORT` by default. Existing PostgreSQL target rows matching `shopify_order_id` or `shiprocket_response_id` are preserved without overwriting unless explicitly forced with journaled audit logging.
- **Duplicate Policy**: Duplicate source rows in SQLite are grouped by `shopify_order_id` and `updated_at` (latest wins), with dropped duplicates logged to `order_mapping.migration_exceptions`.
- **Null / Default Policy**: Empty strings on UNIQUE constrained fields (`awb`, `shiprocket_response_id`) are transformed to SQL `NULL` to prevent unique key violations.

---

## 5. Operations & CLI Commands

- **Backup Command**:
  `npm run delivery-migrator -- --backup --source server/data/app.db`
- **Restore-Test Command**:
  `npm run delivery-migrator -- --restore-test --source server/data/app.db`
- **Plan Command**:
  `npm run delivery-migrator -- --plan --source server/data/app.db`
- **Dry-Run Command**:
  `npm run delivery-migrator -- --dry-run --source server/data/app.db`
- **Execute Command**:
  `npm run delivery-migrator -- --execute --source server/data/app.db --confirm`
- **Resume Command**:
  `npm run delivery-migrator -- --resume --source server/data/app.db --confirm`
- **Verify Command**:
  `npm run delivery-migrator -- --verify --source server/data/app.db`
- **Rollback Command**:
  `npm run delivery-migrator -- --rollback --migration-id <MIGRATION_ID> --confirm`

---

## 6. Cutover & Write-Freeze Procedures

1. **Write-Freeze Instructions**:
   - Pause incoming legacy SQLite write sync jobs.
   - Set legacy SQLite database file permissions to read-only (`chmod 444`).
2. **Final-Sync Instructions**:
   - Compute SHA-256 fingerprint of `server/data/app.db`.
   - Run `delivery-migrator --plan` to verify target gap.
   - Run `delivery-migrator --execute --confirm` to perform batch copy under PG transaction.
   - Run `delivery-migrator --verify` for row count & SHA validation.
3. **Success Criteria**:
   - 100% of valid SQLite `delivery_orders` converted to `orders` and `shipments`.
   - SQLite source file checksum remains identical pre- and post-migration.
   - PostgreSQL verification check passes.
   - Idempotency test (re-running execute) results in 0 additional insertions.
   - Smoke tests pass for Order Mapping API endpoints.
4. **Rollback Triggers**:
   - Unhandled exception during batch transaction.
   - Record count or key sum mismatch during `--verify`.
   - Application smoke test failure after migration execution.

---

## 7. Application Smoke-Test Commands

```bash
npm run test -- server/src/routes/orderMapping.test.js
npm run test -- server/src/services/orderMapping.test.js
npm run test:regression-gate
```

---

## 8. Known Limitations & Deferred Tasks

- **Known Limitations**: SQLite source file must be readable on local disk.
- **Deferred Post-Cutover Tasks**:
  - Archiving legacy SQLite app.db to cold backup storage.
  - Final removal of legacy Delivery Resolution fallback handlers in future major release.
