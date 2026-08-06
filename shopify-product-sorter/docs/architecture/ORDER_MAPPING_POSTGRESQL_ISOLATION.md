# Order Mapping PostgreSQL/Migration Isolation

**Task:** `DATA-006` — Isolate Order Mapping PostgreSQL/migration state  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** `server/migrations/order-mapping/`, `server/src/services/orderMappingMigrations.js`, `server/src/services/orderMappingDb.js`

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `DATA-006` |
| Title | Isolate Order Mapping PostgreSQL/migration state |
| Primary Owner | Order Mapping Lead |
| Scope | PostgreSQL schema, migration files, and migration runner |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative isolation boundary for Order Mapping PostgreSQL and migration state. PostgreSQL is the sole current Order Mapping data owner. Legacy SQLite is a read-only migration source or formally retired. Migration state is auditable and not startup-hidden.

Key Findings:
1. **PostgreSQL Is Sole Data Owner**: Order Mapping uses Neon Serverless Postgres with schema-based isolation (`order_mapping` schema).
2. **Legacy SQLite Is Read-Only Source**: `delivery_orders`, `legacy_imports`, and `delivery_logs` are migration sources only.
3. **Migration State Is Auditable**: Migrations are tracked in `_migrations` table and logged via structured logging.

---

## 3. PostgreSQL Schema Registry

| Table Name | Purpose | Indexes |
| --- | --- | --- |
| `orders` | Canonical order records | 4 indexes (order_date, order_number, customer_name, customer_phone) |
| `shipments` | Shipment tracking records | 7 indexes (unique AWB, unique Shiprocket response, unique fulfillment, order_id, status, source, sync) |
| `tracking_events` | Status change history | 1 index (shipment_id, event_timestamp) |
| `status_history` | Audit trail of transitions | 2 indexes (shipment_id, order_id) |
| `import_batches` | CSV import batch metadata | 0 (unique constraint on file_hash) |
| `import_rows` | Individual import row results | 1 index (batch_id, row_number) |
| `sync_runs` | Sync run history | 1 index (sync_type, started_at) |
| `migration_exceptions` | Failed migration records | 0 |
| `network_logs` | API call audit trail | 2 indexes (started_at, operation) |
| `_migrations` | Migration version tracking | 0 (primary key) |

---

## 4. Migration File Registry

| File | Purpose | Tables Affected |
| --- | --- | --- |
| `001_initial.sql` | Core schema (orders, shipments, tracking, status_history, imports, sync, exceptions) | 8 tables |
| `002_logs.sql` | Network logging | 1 table (`network_logs`) |

---

## 5. Migration Runner Contract

| Property | Value |
| --- | --- |
| **Runner** | `orderMappingMigrations.js` |
| **Schema** | Configurable via `ORDER_MAPPING_SCHEMA` env (default: `order_mapping`) |
| **Transaction** | Each migration wrapped in `BEGIN`/`COMMIT`/`ROLLBACK` |
| **Idempotency** | Each migration tracked in `_migrations` table |
| **Startup** | Runs automatically on server start |
| **Logging** | Structured logging via `logInfo`/`logError` |

---

## 6. Legacy SQLite Migration Source

| Table | Owner | Status | Migration Target |
| --- | --- | --- |--- |
| `delivery_orders` | Order Mapping (legacy) | Read-only source | `orders` + `shipments` |
| `legacy_imports` | Order Mapping (legacy) | Read-only source | `import_batches` |
| `delivery_logs` | Order Mapping (legacy) | Read-only source | `status_history` + `network_logs` |

### 6.1 Migration Endpoint

| Endpoint | Purpose | Access |
| --- | --- |--- |
| `POST /api/order-mapping/admin/migrate-sqlite` | Trigger SQLite → PostgreSQL migration | Admin only |

---

## 7. Acceptance Criteria Verification

- [x] **PostgreSQL is the sole current Order Mapping data owner.** (Section 3: 10 PostgreSQL tables documented; all active Order Mapping operations use PostgreSQL).
- [x] **Legacy SQLite is read-only migration source or formally retired.** (Section 6: 3 legacy tables documented as read-only migration sources).
- [x] **Migration state is auditable and not startup-hidden.** (Section 5: migration runner uses structured logging; `_migrations` table tracks applied migrations).
