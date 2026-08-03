# Order Mapping and Legacy Delivery Resolution Classification Report

## 1. Document Control

| Field | Value |
| --- | --- |
| Task ID | `OWN-003` |
| Canonical application | `Order Mapping` |
| Legacy name | `Delivery Resolution` |
| Evidence baseline | Commit `a3b204aa0bf9259e60b69891d86dc11cf15dcbc4` |
| Reconstructed | 2026-08-03 |
| Historical provenance | Commit `77e237a2fc9b042546976255b522af9bce8381af` records ledger transitions only and does not contain this report. |

This is a new reconstruction from current committed repository evidence. It is not a recovered historical document. No application file, route, table, migration, or compatibility alias is approved for deletion by `OWN-003`.

## 2. Disposition Rules

- `CURRENT_ORDER_MAPPING_OWNER`: current executable Order Mapping contract or implementation.
- `COMPATIBILITY_ADAPTER_REQUIRED`: legacy public contract that must continue delegating to Order Mapping until explicit compatibility approval.
- `MIGRATION_SOURCE`: retained source or tool used to move legacy data into the current store.
- `RETAIN_UNTIL_USAGE_PROOF`: apparently disconnected or legacy-named surface whose safe removal is not proven.
- `DELETE_ONLY_AFTER_PROOF`: duplicate/generated/stale candidate that may be removed only by an approved downstream task after complete proof.
- `UNRESOLVED`: ownership or production-use evidence is insufficient; an explicit owner decision is required.

Every classification below currently prohibits deletion unless the row's prerequisite tests, downstream task, and owner approval are later satisfied.

## 3. Current Order Mapping Owner

| # | File/path | Symbol, route, table, or integration | Current callers/importers | Current owner | Legacy purpose / replacement | Compatibility requirement | Evidence | Disposition | Prerequisite tests | Downstream task | Deletion prohibited |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `server/src/app.js` | `/api/order-mapping` router mount | Express application startup | Order Mapping | Canonical replacement for Delivery Resolution APIs | Preserve mount and response contracts | Direct `app.use` inventory | `CURRENT_ORDER_MAPPING_OWNER` | `server/src/app.test.js` | `OWN-007`, `FE-006` | Yes |
| 2 | `server/src/routes/orderMapping.js` | 12 API operations: orders list/detail, action/network logs, Shopify/Shiprocket sync, shipment refresh/manual/clear, CSV preview/commit, SQLite migration | Mounted by `server/src/app.js` | Order Mapping | Current REST boundary | Preserve all public paths and authorization behavior | Direct router inventory | `CURRENT_ORDER_MAPPING_OWNER` | `orderMapping.test.js`, `app.test.js`, `client/src/api.test.js` | `OWN-007`, `BE-003`, `FE-006` | Yes |
| 3 | `server/src/routes/orderMapping.js` | `POST /admin/migrate-sqlite` | `/api/order-mapping` router; `requireAdminAuth` import | Order Mapping migration boundary | Replaces ad hoc legacy data copying | Must remain admin-protected and explicit | Route definition and service call | `MIGRATION_SOURCE` | `orderMappingMigrations.test.js`, route-auth regression | `TEST-009`, `BE-010`, `DATA-006` | Yes |
| 4 | `server/src/middleware/authBoundary.js` | `requireAdminAuth` dependency | Imported by `orderMapping.js` | `UNRESOLVED` security boundary | Protects migration route | Required before clean route validation | File is absent from evidence commit while import exists | `UNRESOLVED` | `app.test.js`, authorization tests | `SEC-002`, `TEST-009` | Yes |
| 5 | `server/src/services/orderMappingService.js` | Current orchestration and `migrateOrderMappingSqliteData()` | `orderMapping.js`, legacy migration script | Order Mapping | Current sync/import/manual orchestration plus legacy seed | Preserve public behavior and migration guardrails | Import/export and call inventory | `CURRENT_ORDER_MAPPING_OWNER` | `orderMapping.test.js`, `deliveryRepository.test.js` | `BE-003`, `DATA-006` | Yes |
| 6 | `server/src/services/orderMappingRepository.js` | PostgreSQL repository, sync locks, imports, logs, status history | Current Order Mapping services and tests | Order Mapping | Current source-of-truth persistence | Preserve transactions, terminal/manual status protection, logs | Direct import and SQL inventory | `CURRENT_ORDER_MAPPING_OWNER` | `deliveryRepository.test.js`, `orderMapping.test.js` | `BE-003`, `DATA-006` | Yes |
| 7 | `server/src/services/orderMappingDb.js` | PostgreSQL pool, schema qualification, migration loader | Repository and migration runner | Order Mapping | Current database boundary | Preserve configured schema and migration ordering | Direct import inventory | `CURRENT_ORDER_MAPPING_OWNER` | `orderMappingMigrations.test.js` | `DATA-006`, `BE-010` | Yes |
| 8 | `server/src/services/orderMappingMigrations.js` | Schema creation, `_migrations`, transactional SQL runner | Startup and migration scripts/tests | Order Mapping | Current PostgreSQL migration runner | Preserve idempotency and startup behavior | Direct importer inventory | `CURRENT_ORDER_MAPPING_OWNER` | `orderMappingMigrations.test.js`, startup tests | `TEST-009`, `BE-010`, `DATA-006` | Yes |
| 9 | `server/migrations/order-mapping/001_initial.sql` | `orders`, `shipments`, `tracking_events`, `status_history`, `import_batches`, `import_rows`, `sync_runs`, `migration_exceptions` | Loaded by `orderMappingDb.js` | Order Mapping | Current PostgreSQL schema | Schema/data migration policy required before changes | SQL DDL inventory | `CURRENT_ORDER_MAPPING_OWNER` | `orderMappingMigrations.test.js`, repository tests | `DATA-006`, `TEST-009` | Yes |
| 10 | `server/migrations/order-mapping/002_logs.sql` | `network_logs` | Loaded by `orderMappingDb.js` | Order Mapping | Current provider-network diagnostics | Preserve log API compatibility | SQL DDL and repository inventory | `CURRENT_ORDER_MAPPING_OWNER` | `orderMappingMigrations.test.js`, `app.test.js` | `DATA-006` | Yes |
| 11 | runtime PostgreSQL schema | `_migrations` | `orderMappingMigrations.js` | Order Mapping | Applied-migration metadata | Required for idempotent migrations | Runtime DDL inventory | `CURRENT_ORDER_MAPPING_OWNER` | `orderMappingMigrations.test.js` | `BE-010`, `DATA-006` | Yes |
| 12 | `server/src/services/orderMappingShopify.js` | Shopify order reader | `orderMappingService.js` | Order Mapping over shared Shopify transport | Replaces `deliveryShopify.js` for current Order Mapping sync | Shared `shopifyService.js` contract must remain stable | Direct imports | `CURRENT_ORDER_MAPPING_OWNER` | `orderMapping.test.js`, provider tests | `INT-001`, `OWN-010` | Yes |
| 13 | `server/src/services/orderMappingShiprocket.js` | Shiprocket auth/query/detail adapter and Order Mapping network logs | `orderMappingService.js` | Order Mapping | Current provider adapter | Preserve retry/auth/status contract | Direct imports and env inventory | `CURRENT_ORDER_MAPPING_OWNER` | `orderMapping.test.js`, provider tests | `INT-004`, `OWN-010` | Yes |
| 14 | `server/src/services/orderMappingStatus.js` | Current status aliases, sources, terminal and precedence rules | Route, repository, service, CSV, tests | Order Mapping | Replaces legacy `DELIVERED`/`NOT_DELIVERED`/`UNRESOLVED` mapper vocabulary | Public status values must not regress | Import and constant inventory | `CURRENT_ORDER_MAPPING_OWNER` | `orderMapping.test.js`, provider tests, frontend regression | `TEST-004`, `TEST-005` | Yes |
| 15 | `server/src/services/orderMappingMatcher.js` | Current Shopify/Shiprocket matching | `orderMappingService.js` | Order Mapping | Replaces legacy `orderMatcher.js` | Preserve identity precedence and fallback behavior | Direct imports | `CURRENT_ORDER_MAPPING_OWNER` | `orderMapping.test.js`, repository tests | `BE-003` | Yes |
| 16 | `server/src/services/orderMappingCsv.js` | Current CSV parsing and column mapping | `orderMappingService.js`, tests | Order Mapping | Replaces legacy `legacyCsv.js` | Preserve preview/commit validation contract | Direct imports | `CURRENT_ORDER_MAPPING_OWNER` | `orderMapping.test.js` | `TEST-005`, `BE-003` | Yes |
| 17 | `server/src/services/orderMappingError.js` | Provider/domain error normalization | `orderMappingShiprocket.js` | Order Mapping | Current stable error boundary | Preserve machine-readable error behavior | Direct import | `CURRENT_ORDER_MAPPING_OWNER` | `orderMapping.test.js`, provider tests | `TEST-005` | Yes |
| 18 | `server/src/index.js` | startup `runOrderMappingMigrations()` | Server startup | Shared startup / Order Mapping migration | Current automatic migration entry | Preserve startup safety until isolated | Import and invocation inventory | `CURRENT_ORDER_MAPPING_OWNER` | startup and migration tests | `BE-010`, `TEST-009` | Yes |
| 19 | `client/src/OrderMapping.jsx` | Canonical Order Mapping viewer and sync UI | `main.jsx`, shared `App.jsx` | Order Mapping | Current replacement UI | Preserve `/order-mapping` behavior | Import/render inventory | `CURRENT_ORDER_MAPPING_OWNER` | `client/src/api.test.js`, `frontendRegression.test.js` | `FE-003`, `FE-006` | Yes |
| 20 | `client/src/orderMappingApi.js` | `/api/order-mapping` client for orders, logs, sync, shipment, manual, and CSV operations | `OrderMapping.jsx`, client tests | Order Mapping | Current API client | Preserve all current method paths even when UI exposure differs | Direct method/path inventory | `CURRENT_ORDER_MAPPING_OWNER` | `client/src/api.test.js` | `FE-003`, `FE-006` | Yes |
| 21 | `client/src/orderMappingView.js` | Status labels and presentation mapping | `OrderMapping.jsx`, client tests | Order Mapping | Current status presentation | Must match backend normalized statuses | Direct imports | `CURRENT_ORDER_MAPPING_OWNER` | `client/src/api.test.js`, `frontendRegression.test.js` | `FE-006` | Yes |
| 22 | `client/src/orderMapping.css` | Order Mapping scoped styles | `OrderMapping.jsx` | Order Mapping | Current visual boundary | Preserve style isolation | Direct import | `CURRENT_ORDER_MAPPING_OWNER` | `frontendRegression.test.js`, `styles.test.js` | `FE-003`, `FE-006` | Yes |
| 23 | `client/src/App.jsx`, `client/src/sidebarModules.js` | enabled `Order Mapping` navigation and shared-shell embedding | Shared frontend shell | Shared shell / Order Mapping feature | Current canonical navigation label | Must continue identifying Order Mapping, not Delivery Resolution | Module and render inventory | `CURRENT_ORDER_MAPPING_OWNER` | `frontendRegression.test.js` | `FE-002`, `FE-006` | Yes |
| 24 | `server/src/services/deliveryRepository.test.js` | Misnamed test of current PostgreSQL Order Mapping repository | Dynamically imports current migrations/repository | Order Mapping tests | Name is legacy; behavior is current | Rename only with test-discovery proof | Test imports and package script | `RETAIN_UNTIL_USAGE_PROOF` | The file itself, regression gate | `CLEAN-001` | Yes |
| 25 | `server/src/services/orderMapping.test.js`, `orderMappingMigrations.test.js`, `providerIntegration.test.js`, `server/src/app.test.js`, `client/src/api.test.js`, `client/src/frontendRegression.test.js` | Current behavior/compatibility test surfaces | Test runners and regression gate | Shared tests / Order Mapping | Protect current routes, statuses, providers, migrations, and UI | Required before ownership or cleanup transitions | Test inventory | `CURRENT_ORDER_MAPPING_OWNER` | Existing files | `TEST-008`, `TEST-009`, `CLEAN-001` | Yes |

## 4. Compatibility Adapters

| # | File/path | Symbol, route, table, or integration | Current callers/importers | Current owner | Legacy purpose / replacement | Compatibility requirement | Evidence | Disposition | Prerequisite tests | Downstream task | Deletion prohibited |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 26 | `server/src/app.js` | `GET /delivery-resolution` → `302 /order-mapping` | External bookmarks and direct requests; tested by `app.test.js` | Shared web compatibility / Order Mapping | Legacy application URL adapter | Retain until public usage and redirect deprecation are approved | Direct route and test | `COMPATIBILITY_ADAPTER_REQUIRED` | `server/src/app.test.js` | `TEST-008`, `FE-006`, `CLEAN-001` | Yes |
| 27 | `client/src/main.jsx` | history replacement `/delivery-resolution` → `/order-mapping` | SPA entrypoint | Shared web compatibility / Order Mapping | Client fallback for legacy URL | Retain with server redirect until compatibility proof | Direct path check | `COMPATIBILITY_ADAPTER_REQUIRED` | frontend route regression | `TEST-008`, `FE-006`, `CLEAN-001` | Yes |
| 28 | `server/src/config/env.js` | `env.orderMappingRoute = "/order-mapping"` | Server redirect | Shared route configuration / Order Mapping | Canonical redirect target | Keep synchronized with public route | Direct reference | `COMPATIBILITY_ADAPTER_REQUIRED` | `server/src/app.test.js` | `TEST-008`, `OWN-007` | Yes |
| 29 | `docs/architecture/CANONICAL_APPLICATION_NAMES_AND_STATUSES.md` | canonical name and legacy alias | Architecture ownership consumers | Architecture documentation | Names Delivery Resolution as compatibility only | Keep aligned with executable routes | Document/code comparison | `COMPATIBILITY_ADAPTER_REQUIRED` | Documentation path validation | `DOC-003`, `OWN-007` | Yes |

## 5. Legacy Implementation and Data

| # | File/path | Symbol, route, table, or integration | Current callers/importers | Current owner | Legacy purpose / replacement | Compatibility requirement | Evidence | Disposition | Prerequisite tests | Downstream task | Deletion prohibited |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 30 | `server/src/services/reconciliationService.js` | `syncDeliveryOrders()`, `importLegacyCsv()` | No committed importer found; imports the full legacy cluster | `UNRESOLVED` legacy owner | Old orchestration; current replacement is `orderMappingService.js` | Dynamic/runtime/script usage and data retention remain unproven | Static importer scan only | `RETAIN_UNTIL_USAGE_PROOF` | Clean call graph, startup/script scan, current Order Mapping regression | `CLEAN-001` | Yes |
| 31 | `server/src/services/deliveryRepository.js` | SQLite CRUD/manual resolution/import-dedup/logging functions | `reconciliationService.js`; legacy test name does not import it | `UNRESOLVED` legacy owner | Old live repository; current replacement is PostgreSQL `orderMappingRepository.js` | SQLite rows and runtime usage must be proven migrated/unused | Import scan and SQL inventory | `RETAIN_UNTIL_USAGE_PROOF` | Data reconciliation, clean runtime call graph | `CLEAN-001`, `DATA-002` | Yes |
| 32 | `server/src/services/deliveryShopify.js` | `fetchDeliveryOrders()` | `reconciliationService.js` | `UNRESOLVED` legacy owner over shared Shopify transport | Old Shopify reader; current replacement is `orderMappingShopify.js` | Shared transport and any script use must be checked | Import scan | `RETAIN_UNTIL_USAGE_PROOF` | Provider regression and call graph | `CLEAN-001` | Yes |
| 33 | `server/src/services/legacyCsv.js` | `csvColumns()`, `parseLegacyCsv()` | `reconciliationService.js` | `UNRESOLVED` legacy owner | Old CSV parser; current replacement is `orderMappingCsv.js` | Historical input compatibility must be compared | Import and parser scan | `RETAIN_UNTIL_USAGE_PROOF` | Synthetic old/new CSV comparison | `CLEAN-001`, `TEST-005` | Yes |
| 34 | `server/src/services/orderMatcher.js` | `normalizeIdentifier()`, `findShipment()` | `reconciliationService.js` | `UNRESOLVED` legacy owner | Old matcher; current replacement is `orderMappingMatcher.js` | Matching equivalence and old-data cases are unproven | Import scan | `RETAIN_UNTIL_USAGE_PROOF` | Synthetic matching comparison | `CLEAN-001`, `TEST-004` | Yes |
| 35 | `server/src/services/statusMapper.js` | legacy Shiprocket/CSV status maps | `deliveryRepository.js`, `reconciliationService.js` | `UNRESOLVED` legacy owner | Old `DELIVERED`/`NOT_DELIVERED`/`UNRESOLVED` vocabulary; current replacement is `orderMappingStatus.js` | Historical value conversion must remain understood | Import and map comparison | `MIGRATION_SOURCE` | Status migration fixtures and current status tests | `CLEAN-001`, `DATA-002` | Yes |
| 36 | `server/src/services/shiprocketService.js` | shared `fetchShiprocketOrders()` | Legacy reconciliation, Actual Sales Intelligence, provider tests | Shared Shiprocket integration | Not replaced globally by `orderMappingShiprocket.js` | Actual Sales Intelligence and provider behavior must remain protected | Direct import scan | `UNRESOLVED` | Provider and Actual Sales regression | `OWN-010`, `INT-004`, `CLEAN-001` | Yes |
| 37 | `server/src/db/database.js` | SQLite `delivery_orders` | Legacy repository; read by `migrateOrderMappingSqliteData()` | Legacy data / Order Mapping migration | Source rows for PostgreSQL seed | Retain until migration completion and reconciliation proof | Table creation and read inventory | `MIGRATION_SOURCE` | Migration test against representative backup | `DATA-002`, `DATA-006`, `CLEAN-001` | Yes |
| 38 | `server/src/db/database.js` | SQLite `legacy_imports` | Only legacy repository found | `UNRESOLVED` retained data | Old CSV import dedup/results | Retention, audit, and production use are unproven | Table and importer scan | `UNRESOLVED` | Data inventory and owner decision | `OWN-008`, `DATA-002`, `CLEAN-001` | Yes |
| 39 | `server/src/db/database.js` | SQLite `delivery_logs` | Only legacy repository found | `UNRESOLVED` retained data | Old unknown-status diagnostics | Retention and operational use are unproven | Table and importer scan | `UNRESOLVED` | Data inventory and owner decision | `OWN-006`, `OWN-008`, `DATA-002`, `CLEAN-001` | Yes |
| 40 | `server/src/services/orderMappingService.js` | `migrateOrderMappingSqliteData()` | Admin route and legacy migration script | Order Mapping migration owner | Reads `delivery_orders` and upserts current PostgreSQL records | Keep read-only source behavior and exception logging | Function/caller scan | `MIGRATION_SOURCE` | `orderMappingMigrations.test.js`, migration rehearsal | `TEST-009`, `DATA-006`, `BE-010` | Yes |
| 41 | `server/src/scripts/migrateOrderMappingLegacy.js` | explicit legacy SQLite migration command | `server/package.json` | Order Mapping migration owner | Operator path for current schema plus legacy seed | Require `--confirm`, `CONFIRM_MIGRATION=true`, or `FORCE_MIGRATE=true` | Script and package inventory | `MIGRATION_SOURCE` | startup-command safety and migration tests | `TEST-009`, `BE-010`, `DATA-006` | Yes |
| 42 | `server/package.json` | `migrate:order-mapping-legacy` | Operator/NPM command | Order Mapping migration owner | Public operator alias for legacy migration | Preserve until migration/deprecation policy proves retirement | Script inventory | `MIGRATION_SOURCE` | startup-command safety tests | `DOC-010`, `BE-010` | Yes |
| 43 | `server/src/scripts/migrateOrderMapping.js` and `server/package.json` | current schema-only migration command | Operator/NPM command | Order Mapping | Current migration runner, not legacy deletion target | Keep separate from data import semantics | Script inventory | `CURRENT_ORDER_MAPPING_OWNER` | migration safety tests | `BE-010`, `DATA-006` | Yes |
| 44 | `SQLITE_PATH` | legacy source database location | Shared SQLite bootstrap and migration service | Shared runtime / migration | Locates Sorter plus legacy Delivery data | Cannot be reassigned exclusively while database is shared | Env and database inventory | `UNRESOLVED` | Data ownership decision | `OWN-008`, `OWN-009`, `OWN-010` | Yes |
| 45 | `DATABASE_URL`, `DIRECT_DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `ORDER_MAPPING_SCHEMA` | PostgreSQL connection/schema configuration | `env.js`, Order Mapping database boundary | Order Mapping / shared deployment | Current PostgreSQL owner configuration | Credential ownership and deployment boundary must remain centralized | Env/import inventory | `CURRENT_ORDER_MAPPING_OWNER` | migration and repository tests | `OWN-010`, `DATA-006` | Yes |
| 46 | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_API_VERSION` | Shopify credentials/version shared by current and legacy readers | Shared Shopify auth/transport | Shared Shopify integration | Used by Order Mapping and former Delivery reader | Never duplicate or assign exclusively to legacy code | Env/import inventory | `UNRESOLVED` | Provider and ownership validation | `OWN-010`, `INT-001` | Yes |
| 47 | `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_TOKEN`, `SHIPROCKET_BASE_URL`, `SHIPROCKET_CHANNEL_ID`, `SHIPROCKET_REQUEST_TIMEOUT_MS` | Shiprocket provider configuration | Current and shared Shiprocket adapters | Shared Shiprocket integration | Used by Order Mapping and other applications | Central owner decision required before consolidation | Env/import inventory | `UNRESOLVED` | Provider and ownership validation | `OWN-010`, `INT-004` | Yes |
| 48 | `CONFIRM_MIGRATION`, `FORCE_MIGRATE` | explicit migration intent | Both migration scripts | Shared operations / Order Mapping migration | Safety interlock | Must remain explicit; deprecation requires replacement control | Script inventory | `MIGRATION_SOURCE` | startup-command safety tests | `BE-010`, `TEST-009` | Yes |

## 6. Diagnostics, Documentation, and Generated References

| # | File/path | Symbol, route, table, or integration | Current callers/importers | Current owner | Legacy purpose / replacement | Compatibility requirement | Evidence | Disposition | Prerequisite tests | Downstream task | Deletion prohibited |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 49 | `/api/order-mapping/logs/actions` backed by `sync_runs` | Current action-log compatibility API; no `action_logs` table | Order Mapping UI/client and `app.test.js` | Order Mapping | Current operational history projection | Preserve API while documenting actual store | Route/repository inventory | `CURRENT_ORDER_MAPPING_OWNER` | `app.test.js`, repository tests | `OWN-006`, `DATA-006` | Yes |
| 50 | `/api/order-mapping/logs/network` and PostgreSQL `network_logs` | Current provider diagnostics | Order Mapping UI/client and tests | Order Mapping | Current network diagnostics | Preserve redaction and response contracts | Route/repository/migration inventory | `CURRENT_ORDER_MAPPING_OWNER` | `app.test.js`, provider tests | `OWN-006`, `DATA-006` | Yes |
| 51 | SQLite `delivery_logs` and `logUnknownStatus()` | Legacy diagnostics | Legacy repository/reconciliation cluster only | `UNRESOLVED` legacy diagnostics | Old unknown-status logging | Retention and incident-history value unproven | Static importer/table scan | `UNRESOLVED` | Data/diagnostic owner decision | `OWN-006`, `OWN-008`, `CLEAN-001` | Yes |
| 52 | `docs/architecture/DATABASE_OWNERSHIP_REGISTER.md` | legacy/current store claims | Architecture tasks | Architecture documentation | Ownership register | Must be reconciled with this current classification before data decisions | Document/code comparison | `RETAIN_UNTIL_USAGE_PROOF` | Documentation review | `OWN-008`, `DATA-002` | Yes |
| 53 | `docs/architecture/LEGACY_COMPLETION_RECOVERY_PLAN.md` | historical OWN-003 recovery claim | Architecture recovery process | Architecture documentation | Cited missing report and ledger-only commit | Corrected by this batch; retain as historical recovery record | Git tree and document comparison | `RETAIN_UNTIL_USAGE_PROOF` | Architecture validation | `OWN-003` | Yes |
| 54 | `docs/architecture/ledger/tasks.json`, `history.jsonl`, generated master plan | OWN-003 historical evidence and status | Ledger CLI | Architecture ledger | Historical transition provenance | Must identify the new report commit as implementation evidence | Ledger/Git comparison | `RETAIN_UNTIL_USAGE_PROOF` | Architecture audit/checkpoint | `OWN-003` | Yes |
| 55 | `graphify-out/GRAPH_REPORT.md`, `manifest.json`, dated graph snapshots | Generated references to legacy files/symbols | Graphify tooling | Generated tooling state | Historical/static graph evidence | Never use generated references alone as deletion proof | Generated-file search | `DELETE_ONLY_AFTER_PROOF` | Fresh graph update in an approved graph task | `CLEAN-001` or tooling maintenance | Yes |
| 56 | historical commit `77e237a2fc9b042546976255b522af9bce8381af` | ledger transitions without classification report | Git history | Historical ledger provenance | Prior unsupported implementation claim | May be cited only as provenance, never as report implementation | `git show --name-status` and missing-file check | `RETAIN_UNTIL_USAGE_PROOF` | Commit-content verification | `OWN-003` | Yes |

## 7. Unresolved Owner Decisions

1. **Legacy runtime reachability:** Are `reconciliationService.js` and its six-file legacy cluster invoked by any production entrypoint, external script, dynamic import, or operational procedure outside committed source?
   - Evidence reviewed: committed static imports, route mounts, scripts, tests, package commands, documentation, and generated graph references.
   - Blocked tasks: `CLEAN-001`, `DATA-002`, `OWN-008`.
   - Required decision/evidence: production process inventory plus clean committed runtime/call-graph proof.
2. **Legacy retained data:** Must `legacy_imports` and `delivery_logs` be retained for audit, support, or historical reconciliation?
   - Evidence reviewed: SQLite schema and legacy repository readers/writers; no current caller beyond the disconnected cluster was established.
   - Blocked tasks: `OWN-008`, `DATA-002`, `CLEAN-001`.
   - Required decision/evidence: table row counts and retention policy from a separately approved data task; no database inspection was performed for `OWN-003`.
3. **Shared Shiprocket owner:** `shiprocketService.js` remains used by Actual Sales Intelligence and provider tests, while Order Mapping owns a separate adapter.
   - Evidence reviewed: direct importer inventory and environment usage.
   - Blocked tasks: `OWN-010`, `INT-004`, `CLEAN-001`.
   - Required decision: assign one shared provider owner and approve any consolidation without breaking Actual Sales Intelligence.
4. **Missing committed auth boundary:** `orderMapping.js` imports `server/src/middleware/authBoundary.js`, but the file is absent from the evidence commit.
   - Evidence reviewed: committed route import and Git tree.
   - Blocked tasks: clean public-route validation, `SEC-002`, `TEST-009`, and any completion evidence requiring the full server route suite.
   - Required decision/evidence: separately approved application/security task must establish a committed implementation; this documentation batch must not supply it.
5. **Shared credentials and source database:** Shopify/Shiprocket credentials and `SQLITE_PATH` serve multiple applications or legacy migration sources.
   - Evidence reviewed: current and legacy import/env inventory.
   - Blocked tasks: `OWN-008`, `OWN-009`, `OWN-010`, `DATA-006`.
   - Required decision: approve shared integration/runtime owners before extraction or data movement.

## 8. Disposition Summary

This report classifies 56 current, compatibility, migration, legacy, test, environment, documentation, and generated-reference items. Counts below are the dispositions in the 56 numbered rows; prose references to disposition names are excluded.

| Disposition | Count |
| --- | ---: |
| `CURRENT_ORDER_MAPPING_OWNER` | 26 |
| `COMPATIBILITY_ADAPTER_REQUIRED` | 4 |
| `MIGRATION_SOURCE` | 7 |
| `RETAIN_UNTIL_USAGE_PROOF` | 10 |
| `DELETE_ONLY_AFTER_PROOF` | 1 |
| `UNRESOLVED` | 8 |
| **Total** | **56** |

No row authorizes deletion. The next deletion-capable task is `CLEAN-001`, and it remains constrained by `SAFE-003`, current compatibility tests, data-retention proof, and explicit per-file approval.

## 9. Validation and Safety

- Protect current Order Mapping public behavior with `server/src/services/orderMapping.test.js`, `server/src/services/orderMappingMigrations.test.js`, current repository/provider tests, `server/src/app.test.js`, and client API/frontend regression tests where the clean committed tree supports them.
- Re-run route/import/table/environment/path scans against the exact documentation implementation commit.
- Do not delete, rename, move, or modify any application file in `OWN-003`.
- The real implementation commit for this report is the documentation commit that first contains this file, not historical commit `77e237a2fc9b042546976255b522af9bce8381af`.
