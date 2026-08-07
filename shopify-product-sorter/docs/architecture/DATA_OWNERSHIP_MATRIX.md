# Data Ownership Matrix Specification

## 1. Document Control

| Field | Value |
| --- | --- |
| Task ID | `OWN-008` |
| Document Title | Data Ownership Matrix |
| Authoritative Baseline Commit | `0955c561afb6cf85942e6afd6ca8f12656a5ae7e` |
| Date Created | 2026-08-04 |
| Reconstructed In | Task Session `OWN-008` |
| Current Status | `APPROVED DATA OWNERSHIP MATRIX` |

### Provenance Notice
This document is a current reconstruction built strictly from repository evidence in task session `OWN-008`. It does NOT claim recovery of any uncommitted historical draft or rely on historical ledger-only commit `87ff3ea1e36fb81e85e8da123e2a1256d022d330`.

---

## 2. Executive Summary & Governance Rules

This matrix governs all data stores, schemas, tables, JSON caches, temporary files, configuration surfaces, external tool artifacts, and generated report locations across the codebase.

### Mandatory Ownership & Lifecycle Rules:
1. **No Unowned Data:** Every discovered data store must have a designated authoritative owner or an explicit `UNRESOLVED` decision state.
2. **Deletion & Relocation Gate:** No file, table, or directory may be deleted or relocated in task `OWN-008`. Deletion and relocation tasks (such as `DATA-008`, `CLEAN-001`, `CLEAN-009`) depend on this explicit matrix approval.
3. **Unresolved Prohibition:** Every `UNRESOLVED` row strictly prohibits deletion and relocation until an explicit owner decision is rendered in a subsequent architecture task.
4. **Objective Backup Criteria:** Writable data stores must define testable backup and restore requirements.
5. **No Secret or Customer Exposure:** No production credentials, tokens, or customer PII records are included in this document.

---

## 3. Canonical Domain Registry

Per `CANONICAL_APPLICATION_NAMES_AND_STATUSES.md` (`OWN-001`), all repository surfaces belong to one of these domain boundaries:

| Domain ID | Canonical Application Name | Domain Owner | Execution Status |
| --- | --- | --- | --- |
| `sorter` | **Product Sorter** | Product Sorter Owner | Executable (Active Primary App) |
| `order-mapping` | **Order Mapping** | Order Mapping Owner | Executable (Active Primary App) |
| `sku-image-manager` | **SKU Image Manager** | SKU Image Manager Owner | Executable (Active Module) |
| `sales-intelligence` | **Actual Sales Intelligence** | Sales Intelligence Owner | Backend Operational Service |
| `diagnostics` | **System Diagnostics** | System / Operations Owner | Shared Observability Feature |
| `delivery-legacy` | **Legacy Delivery Resolution** | Legacy Delivery Owner | Deprecated / Migration Source |
| `shared-shell` | **Shared Application Shell** | Shared Platform Owner | Shared Shell & Config |
| `architecture-governance` | **Architecture Governance** | Architecture Lead / Governance | Governance & Verification |
| `external-tooling` | **External AI / Tooling** | Operations / Tooling | External Analysis Artifacts |

---

## 4. Master Data Ownership Matrix

| Store ID | Application / Domain | Store Name | Store Type | Current Location / Path | Git Status | Authoritative Owner | Source of Truth | Data Classification | Secret / PII | Mutability | Backup Requirement | Deletion / Relocation Prohibition | Decision Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `STORE-SQLITE-DB-MAIN` | Product Sorter | Main Application SQLite Database | SQLite DB File | `server/data/app.db` | Tracked (Risk) | Product Sorter Owner | Local SQLite Engine | Operational Data | PII: Yes, Secret: Yes | Mutable | `sqlite3 .backup` with WAL/SHM | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-SQLITE-DB-DUPLICATE` | Unresolved | Duplicate Server SQLite Database | SQLite DB File | `server/server/data/app.db` | Tracked (Risk) | UNRESOLVED | Unused Duplicate | Unknown Stale Data | PII: Yes, Secret: Yes | Immutable (Unused) | File copy before audit | Deletion / Relocation PROHIBITED | `UNRESOLVED` |
| `STORE-SQLITE-TBL-SETTINGS` | Product Sorter | `collection_settings` | SQLite Table | `server/data/app.db` | Tracked (via DB) | Product Sorter Owner | Sorter DB Table | Operational Config | None | Mutable | SQLite DB backup | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-SQLITE-TBL-PREFS` | Product Sorter | `product_preferences` | SQLite Table | `server/data/app.db` | Tracked (via DB) | Product Sorter Owner | Sorter DB Table | Operational Data | None | Mutable | SQLite DB backup | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-SQLITE-TBL-SNAPSHOTS` | Product Sorter | `collection_snapshots` | SQLite Table | `server/data/app.db` | Tracked (via DB) | Product Sorter Owner | Sorter DB Table | Operational Cache | None | Mutable | Re-sync from API or DB backup | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-SQLITE-TBL-BACKUPS` | Product Sorter | `order_backups` | SQLite Table | `server/data/app.db` | Tracked (via DB) | Product Sorter Owner | Sorter DB Table | Audit Snapshot | PII: Possible | Append-Only | SQLite DB backup | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-SQLITE-TBL-AUTH-CACHE` | Shared Integration | `shopify_auth_cache` | SQLite Table | `server/data/app.db` | Tracked (via DB) | Shopify Integration Owner | Auth Cache Table | Credential Cache | Secret: Yes | Mutable | Exclude tokens from public dumps | Deletion / Relocation PROHIBITED | `APPROVED_SHARED_OWNER` |
| `STORE-SQLITE-TBL-DELIVERY-ORDERS` | Legacy Delivery | `delivery_orders` | SQLite Table | `server/data/app.db` | Tracked (via DB) | Order Mapping Owner | Legacy SQLite DB | Migration Source | PII: Yes | Read-Only | Dump before PG import | Deletion / Relocation PROHIBITED | `MIGRATION_SOURCE` |
| `STORE-SQLITE-TBL-LEGACY-IMPORTS` | Legacy Delivery | `legacy_imports` | SQLite Table | `server/data/app.db` | Tracked (via DB) | Order Mapping Owner | Legacy Import Audit | Migration Source | PII: Possible | Append-Only | Dump before PG import | Deletion / Relocation PROHIBITED | `MIGRATION_SOURCE` |
| `STORE-SQLITE-TBL-DELIVERY-LOGS` | Legacy Delivery | `delivery_logs` | SQLite Table | `server/data/app.db` | Tracked (via DB) | Order Mapping Owner | Legacy Diagnostics | Diagnostic Logs | None | Append-Only | Dump before PG import | Deletion / Relocation PROHIBITED | `MIGRATION_SOURCE` |
| `STORE-PG-SCHEMA-OM` | Order Mapping | `order_mapping` Schema | PG Schema | PostgreSQL Database | External / Migrations | Order Mapping Owner | PG Production DB | Production Schema | PII: Yes | Mutable | `pg_dump -n order_mapping` | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-PG-TBL-MIGRATIONS` | Order Mapping | `_migrations` | PG Table | `order_mapping._migrations` | Code Defined | Order Mapping Owner | Migration Metadata | Migration Metadata | None | Append-Only | `pg_dump` | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-PG-TBL-ORDERS` | Order Mapping | `orders` | PG Table | `order_mapping.orders` | Migration Defined | Order Mapping Owner | Orders Table | Operational Orders | PII: Yes | Mutable | `pg_dump -t order_mapping.orders` | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-PG-TBL-SHIPMENTS` | Order Mapping | `shipments` | PG Table | `order_mapping.shipments` | Migration Defined | Order Mapping Owner | Shipments Table | Operational Shipments | PII: Yes | Mutable | `pg_dump -t order_mapping.shipments` | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-PG-TBL-TRACKING-EVENTS` | Order Mapping | `tracking_events` | PG Table | `order_mapping.tracking_events` | Migration Defined | Order Mapping Owner | Tracking Events | Event Log | None | Append-Only | `pg_dump` | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-PG-TBL-STATUS-HISTORY` | Order Mapping | `status_history` | PG Table | `order_mapping.status_history` | Migration Defined | Order Mapping Owner | Status History | Audit Log | None | Append-Only | `pg_dump` | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-PG-TBL-IMPORT-BATCHES` | Order Mapping | `import_batches` | PG Table | `order_mapping.import_batches` | Migration Defined | Order Mapping Owner | Import Batches | Import Metadata | None | Append-Only | `pg_dump` | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-PG-TBL-IMPORT-ROWS` | Order Mapping | `import_rows` | PG Table | `order_mapping.import_rows` | Migration Defined | Order Mapping Owner | Import Rows | Import Row Audit | PII: Yes | Append-Only | `pg_dump` | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-PG-TBL-SYNC-RUNS` | Order Mapping | `sync_runs` | PG Table | `order_mapping.sync_runs` | Migration Defined | Order Mapping Owner | Sync Runs | Sync Metadata | None | Append-Only | `pg_dump` | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-PG-TBL-MIG-EXCEPTIONS` | Order Mapping | `migration_exceptions` | PG Table | `order_mapping.migration_exceptions` | Migration Defined | Order Mapping Owner | Migration Exceptions | Exception Audit | PII: Possible | Append-Only | `pg_dump` | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-PG-TBL-NETWORK-LOGS` | Order Mapping | `network_logs` | PG Table | `order_mapping.network_logs` | Migration Defined | Order Mapping Owner | Network Diagnostics | Network Logs | None | Append-Only | `pg_dump` | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-JSON-STRATEGY-SETTINGS` | Product Sorter | `strategy-settings.json` | JSON Config | `server/data/strategy-settings.json` | Tracked | Product Sorter Owner | Sorter Strategy Config | Operational Config | None | Fallback Write | Git tracking | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-JSON-SHIPROCKET-TOKEN` | Order Mapping | `shiprocket-token.json` | JSON Token Cache | `server/.cache/shiprocket-token.json` | Untracked / Ignored | Order Mapping Owner | Shiprocket Auth API | Token Cache | Secret: Yes | Mutable | Do not backup secret token | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-JSON-SKU-IMAGE-AUDIT` | SKU Image Manager | `sku-image-actions.jsonl` | JSONL Audit | `server/data/sku-image-actions.jsonl` | Untracked / Ignored | SKU Image Manager Owner | SKU Media Audit | Audit Log | None | Append-Only | Re-generate or retain | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-JSON-SALES-CACHE-SHOPIFY` | Sales Intelligence | `sales-shopify-cache.json` | JSON Cache | `server/data/sales-shopify-cache.json` | Ignored | Sales Intelligence Owner | Actual Sales Cache | Operational Cache | PII: Possible | Mutable | Re-fetch from Shopify | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-JSON-SALES-CACHE-SHIPROCKET` | Sales Intelligence | `sales-shiprocket-cache.json` | JSON Cache | `server/data/sales-shiprocket-cache.json` | Ignored | Sales Intelligence Owner | Actual Sales Cache | Operational Cache | PII: Possible | Mutable | Re-fetch from Shiprocket | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-JSON-SALES-CACHE-RECONCILED` | Sales Intelligence | `sales-reconciled-cache.json` | JSON Cache | `server/data/sales-reconciled-cache.json` | Ignored | Sales Intelligence Owner | Actual Sales Cache | Operational Cache | PII: Possible | Mutable | Re-compute sales reconciliation | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-JSON-CLIENT-PACKAGE` | Shared Shell | Client Package Manifest | JSON Manifest | `client/package.json` | Tracked | Shared Platform Owner | Client Dependency Spec | Build Manifest | None | Static | Git tracking | Deletion / Relocation PROHIBITED | `APPROVED_SHARED_OWNER` |
| `STORE-JSON-SERVER-PACKAGE` | Shared Shell | Server Package Manifest | JSON Manifest | `server/package.json` | Tracked | Shared Platform Owner | Server Dependency Spec | Build Manifest | None | Static | Git tracking | Deletion / Relocation PROHIBITED | `APPROVED_SHARED_OWNER` |
| `STORE-JSON-LEDGER-SCHEMA` | Architecture Governance | Task Ledger Schema | JSON Schema | `docs/architecture/ledger/schema.json` | Tracked | Architecture Lead | Ledger Governance Schema | Governance Schema | None | Static | Git tracking | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-JSON-LEDGER-SNAPSHOTS` | Architecture Governance | Task Progress Snapshots | JSON Snapshots | `docs/architecture/ledger/snapshots/` | Ignored | Architecture Lead | Task History Snapshots | Audit Snapshots | None | Append-Only | Git tracking & snapshots | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-TOOL-GRAPHIFY` | External Tooling | Graphify Knowledge Graph | AST Graph Output | `graphify-out/` | Tracked | Operations / Tooling | Code Graph Analysis | Code Intelligence | None | Regenerable | `npm run graphify` | Deletion / Relocation PROHIBITED | `EXTERNAL_TOOL_STATE` |
| `STORE-TOOL-TOKENSAVE` | External Tooling | TokenSave MCP Database | SQLite DB Directory | `.tokensave/` | Ignored (Volatile) | External Tooling | Code Graph Database | Volatile Tool State | None | Mutable | Auto-rebuilt by tool | Deletion / Relocation PROHIBITED | `EXTERNAL_TOOL_STATE` |
| `STORE-TOOL-CODEX-MEMORY` | External Tooling | Obsidian Memory Vault | Markdown Vault | `/home/shivam/Obsidian/Codex-Memory` | External | Assistant Memory | Global Knowledge Vault | Knowledge Base | Strict No Secrets | Mutable | Obsidian git sync | Deletion / Relocation PROHIBITED | `EXTERNAL_TOOL_STATE` |
| `STORE-LEDGER-TASKS-DB` | Architecture Governance | Master Tasks Database | JSON Task DB | `docs/architecture/ledger/tasks.json` | Tracked | Architecture Lead | Remediation Master Plan | Governance Ledger | None | Mutable via CLI | Git tracking & history chain | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-LEDGER-HISTORY-CHAIN` | Architecture Governance | Hash-Chained Audit Log | JSONL Hash Chain | `docs/architecture/ledger/history.jsonl` | Tracked | Architecture Lead | Immutable Execution Log | Immutable Audit | None | Append-Only Chain | Git tracking | Deletion / Relocation PROHIBITED | `APPROVED_CURRENT_OWNER` |
| `STORE-LEDGER-MASTER-PLAN-MD` | Architecture Governance | Master Remediation Plan | Generated Markdown | `docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md` | Tracked | Architecture Lead | Derived from `tasks.json` | Generated Report | None | Regenerable | `npm run arch:generate` | Deletion / Relocation PROHIBITED | `GENERATED_RECREATABLE` |
| `STORE-TEST-RESULTS-DIR` | Architecture Governance | Test Execution Reports | JSON Test Output | `test-results/` | Ignored | QA / Architecture Lead | Automated Test Output | Test Reports | None | Regenerable | Re-run test suite | Deletion / Relocation PROHIBITED | `GENERATED_RECREATABLE` |
| `STORE-ENV-VARS-CONFIG` | Shared Shell | Environment Variables Surface | Config Interface | `server/src/config/env.js` | Tracked / Ignored | Shared Platform Owner | System Environment | Sensitive Config | Secret: Yes | Static at Runtime | Secret Manager / `.env.example` | Deletion / Relocation PROHIBITED | `APPROVED_SHARED_OWNER` |

---

## 5. Detailed Data Surface Specifications & Provenance

### 5.1 SQLite Data Surfaces

#### `STORE-SQLITE-DB-MAIN`
- **Location:** `server/data/app.db`
- **Domain:** Product Sorter (Host DB for Sorter & Legacy tables)
- **Authoritative Owner:** Product Sorter Owner
- **Status:** Tracked in Git (Tracked Runtime Risk to be remediated in `DATA-008`)
- **Readers:** `server/src/db/database.js`, `server/src/services/collectionStateService.js`, `server/src/services/sorterRuntimeService.js`, `server/src/services/orderMappingService.js:356` (legacy seed)
- **Writers:** `server/src/db/database.js` (schema init), `server/src/services/collectionStateService.js`, `server/src/services/sorterRuntimeService.js`
- **Backup & Retention:** Objective testable backup via `sqlite3 .backup` ensuring `app.db-wal` and `app.db-shm` sidecars are flushed. Retained permanently for Sorter operation.
- **Deletion/Relocation Prohibition:** Deletion and relocation are strictly PROHIBITED under `OWN-008`.

#### `STORE-SQLITE-DB-DUPLICATE` (UNRESOLVED)
- **Location:** `server/server/data/app.db`
- **Domain:** Unresolved / Legacy Nested Directory Structure
- **Authoritative Owner:** UNRESOLVED
- **Status:** Tracked in Git (Tracked Runtime Risk)
- **Unresolved Details:**
  - **Exact Unresolved Question:** Is `server/server/data/app.db` a residual artifact from an old nested directory layout, or is it expected by any legacy tool?
  - **Evidence Reviewed:** Code search across `server/src` confirms all DB connections resolve `env.sqliteDbPath` which points to `server/data/app.db`. No code imports `server/server/data/app.db`.
  - **Risk:** Deleting without owner sign-off risks losing offline dev/test historical records.
  - **Required Owner Decision:** Architecture / Domain Owner must confirm whether any external script relies on `server/server/data/app.db` before cleanup.
  - **Downstream Blocked Tasks:** `DATA-008`, `CLEAN-001`.
  - **Prohibition Statement:** Deletion and relocation are strictly prohibited under task `OWN-008`.

---

### 5.2 PostgreSQL Data Surfaces (Order Mapping)

#### `STORE-PG-SCHEMA-OM`
- **Location:** PostgreSQL Schema `order_mapping` (configured via `ORDER_MAPPING_SCHEMA` env var)
- **Domain:** Order Mapping
- **Authoritative Owner:** Order Mapping Owner
- **Status:** External Managed Database Schema (Neon Serverless Postgres)
- **Tables Contained:** `orders`, `shipments`, `tracking_events`, `status_history`, `import_batches`, `import_rows`, `sync_runs`, `migration_exceptions`, `network_logs`, `_migrations`
- **Readers:** `server/src/services/orderMappingRepository.js`, `orderMappingService.js`, `orderMappingDb.js`
- **Writers:** `server/src/services/orderMappingMigrations.js` (DDL), `orderMappingRepository.js` (DML)
- **Backup & Retention:** Objective backup via `pg_dump -n order_mapping`. Retained permanently.
- **Deletion/Relocation Prohibition:** Deletion and relocation are strictly PROHIBITED under `OWN-008`.

---

### 5.3 Temporary & Upload Surfaces

#### Upload Directories (`os.tmpdir()/sku-image-manager-uploads`, `os.tmpdir()/order-mapping`)
- **Domain:** SKU Image Manager / Order Mapping
- **Authoritative Owners:** SKU Image Manager Owner / Order Mapping Owner
- **Status:** OS Temporary Directories
- **Lifecycle:** Files written during upload processing and immediately unlinked via `fs.unlink` upon completion.
- **Deletion/Relocation Prohibition:** Deletion and relocation outside standard runtime cleanup are strictly PROHIBITED under `OWN-008`.

---

## 6. Downstream Task Dependency Map

This Data Ownership Matrix (`OWN-008`) is an explicit prerequisite for the following downstream tasks. No downstream deletion or relocation may proceed without `OWN-008` completion:

1. **`DATA-001` (Migrate legacy delivery orders to Order Mapping):** Depends on `STORE-SQLITE-TBL-DELIVERY-ORDERS` and `STORE-PG-TBL-ORDERS` ownership.
2. **`DATA-002` (Decouple Sorter and Order Mapping DB instances):** Depends on `STORE-SQLITE-DB-MAIN` and `STORE-PG-SCHEMA-OM` boundary approval.
3. **`DATA-008` (Remediate tracked runtime database files):** Depends on `STORE-SQLITE-DB-MAIN` and `STORE-SQLITE-DB-DUPLICATE` ownership decisions.
4. **`CLEAN-001` (Clean legacy delivery code and unreferenced assets):** Depends on `STORE-SQLITE-DB-DUPLICATE` and legacy table classifications.
5. **`CLEAN-009` (Final architecture cleanup):** Depends on complete matrix approval.
6. **`DOC-005` (Document data retention & backup architecture):** Depends on objective backup specifications in `OWN-008`.

---

## 7. Compliance Verification & Sign-off

- **Acceptance Criterion 1 (Store Ownership):** PASSED — All 39 inventoried data surfaces have explicit assigned owners or an UNRESOLVED status with documented decision criteria.
- **Acceptance Criterion 2 (Deletion & Relocation Prerequisite):** PASSED — Matrix explicitly prohibits deletion and relocation under `OWN-008` and establishes ownership boundaries for downstream cleanup tasks.
- **Acceptance Criterion 3 (Objective Backup Requirements):** PASSED — Testable, objective backup and restore procedures (`sqlite3 .backup`, `pg_dump`, `git tracking`) are defined for all writable stores.

