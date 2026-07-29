# Architecture Remediation Master Plan

## 1. Document control

| Field | Value |
| --- | --- |
| Repository path | `/home/shivam/Desktop/Shivam/arkn/Resources/Entitled/shopify-product-sorter` |
| Git worktree root | `/home/shivam/Desktop/Shivam/arkn/Resources/Entitled` |
| Document purpose | Authoritative execution ledger for evidence-backed architecture remediation and restructuring. |
| Created date | 2026-07-29 |
| Last updated date | 2026-07-29 |
| Current branch | `main` |
| Baseline commit | `4956310183cf53043b0c3a27b04869833cf53654` |
| Current architecture phase | Phase 0 — Safety and recoverability |
| Overall status | `NOT STARTED` |
| Backup location | Temporary audit manifest: `/tmp/shopify-product-sorter-architecture-before.d5tNpx.manifest`; durable backup not confirmed. |
| PostgreSQL backup status | Not confirmed. |
| Secret archive status | Not confirmed; no secret values are recorded here. |
| Meta Ads status | Documentation-only historical migration specification; no executable Meta Ads code is present in this repository. |
| Git remotes | `origin github-admin-entitled:Admin-Entitled/Entitled.git` (no credentials present in the remote string). |

> **This file is the single authoritative execution ledger for repository architecture work. No architecture task may be considered complete until this file is updated with validation evidence.**

> **A checked box alone is not proof of completion. Every completed task must contain implementation evidence, validation results, files changed, commit reference when available, and any remaining risks.**

Rules for editing this document: future work must read this file first, work only on explicitly listed task IDs, preserve task IDs and history, update the task record and progress totals after implementation, and never maintain a competing architecture checklist. The current audit created no implementation changes. The audit manifest is outside the repository and is not an execution ledger.

## 2. Status definitions

| Status | Use only when |
| --- | --- |
| `NOT STARTED` | The task is approved for the ledger but implementation has not begun. |
| `READY` | Dependencies and scope are clear enough to begin safely. |
| `BLOCKED` | A named prerequisite, evidence gap, or user decision prevents safe progress. |
| `IN PROGRESS` | Work has begun and acceptance is not yet proven. |
| `IMPLEMENTED — VALIDATION PENDING` | Code or configuration changed, but required validation is incomplete. |
| `COMPLETED` | Implementation, acceptance criteria, tests, regression checks, documentation, and evidence all pass. |
| `DEFERRED` | Deliberately postponed by architecture sequencing or product scope. |
| `CANCELLED` | Explicitly removed after a recorded decision; the history remains. |

Only `COMPLETED` contributes to completion percentage. `COMPLETED` requires implementation finished, acceptance criteria passed, required tests passed, existing-app regressions checked, documentation updated, and evidence recorded in this file.

## 3. Severity definitions

| Severity | Meaning |
| --- | --- |
| `CRITICAL` | Data-loss, secret/authentication, unsafe migration/startup, active duplicate route, or unprotected high-impact write risk. |
| `HIGH` | Cross-application coupling, oversized ownership boundary, duplicate integration, missing core regression protection, or runtime/source confusion likely to cause operational failure. |
| `MEDIUM` | Broken or misleading tooling, weak environment/operational handling, incomplete ownership records, or substantial maintainability risk. |
| `LOW` | Cosmetic naming, low-risk documentation, non-blocking generated noise, or minor consistency cleanup after ownership is proven. |

## 4. Repository baseline

### Verified baseline

- Project path resolves exactly to `/home/shivam/Desktop/Shivam/arkn/Resources/Entitled/shopify-product-sorter`.
- Git worktree root is the enclosing `Entitled` directory; the project is not the Git top-level. This plan scopes generated work to the project path only.
- Branch is `main`; baseline commit is `4956310183cf53043b0c3a27b04869833cf53654`; no staged changes were present.
- Pre-existing Git status includes modified sibling theme/Shiprocket files, modified `.tokensave/tokensave.db`, modified `graphify-out/cache/last_query_stamp`, and untracked `.tokensave` WAL/SHM files. No such change was reverted.
- Executable user-facing surfaces are the Shopify collection placement/sorter, Order Mapping, and SKU Image Manager. Actual Sales Intelligence is an operational backend service/API surface. System Diagnostics is a shared shell/observability surface, not a separate routed application. Legacy Delivery Resolution is executable legacy code behind the Order Mapping redirect/API overlap. Meta Ads is documentation-only here.
- Root `package.json` defines npm workspaces `server` and `client`; the two-process model is Express plus Vite. The root package has no test or lint script. Server tests use Node's built-in test runner and one test suite requires a live `DATABASE_URL`.
- Frontend entry is `client/src/main.jsx`; shared shell and feature switching are in `client/src/App.jsx` (2,086 lines). Order Mapping is also selected directly by pathname in `main.jsx`; SKU Image Manager is rendered conditionally by App state.
- Backend entry is `server/src/index.js` -> `server/src/app.js`; `/api` mounts `server/src/routes/api.js` (1,275 lines) and `/api/order-mapping` mounts `server/src/routes/orderMapping.js`. `api.js` contains health, sorter, Sales Intelligence, SKU media, diagnostics, and a duplicate `/collections/reorder-all` definition.
- SQLite default is `server/data/app.db`; another physical `server/server/data/app.db` exists. `server/src/db/database.js` creates sorter, auth-cache, and legacy delivery tables and performs startup `ALTER TABLE` attempts. Order Mapping has PostgreSQL/Neon migrations under `server/migrations/order-mapping` and also legacy SQLite migration code.
- Runtime files include strategy settings, SKU audit JSONL, three Sales Intelligence caches, Shiprocket token cache, SQLite WAL/SHM files, temporary uploads, test output, Playwright output, Graphify output, and Tokensave files. Several generated/runtime artifacts are tracked or insufficiently ignored.
- Shopify transport exists in `shopifyService.js` and a second private GraphQL transport exists in `shopifyMediaService.js`. Shiprocket transport exists in both `shiprocketService.js` and `orderMappingShiprocket.js`.
- Existing tests are `client/src/api.test.js`, `server/src/services/sorter.test.js`, `server/src/services/orderMapping.test.js`, and `server/src/services/deliveryRepository.test.js`. No broad route, frontend, startup, integration, or migration contract suite was found.
- No durable background-job framework is present; sorter reorder-all and Sales Intelligence reconciliation run through awaited request/service flows. Vite development proxying is explicit at `client/vite.config.js:16-23` (`/api` → `localhost:4000`).
- README is sorter-centric and documents a `.env.example` that does not exist. `docs/meta-ads/META_ADS_APP_MIGRATION.md` is a historical source snapshot/specification and is not executable destination code.

### Git baseline categories

| Category | Baseline evidence |
| --- | --- |
| Staged changes | None. |
| Modified tracked files | `../entitled-shopify/assets/collection-filters.js`, `../entitled-shopify/snippets/collection-sorting.liquid`, `../shiprocket/shiprocket-dimensions-automation/input/shiprocket-channel-products.csv`, `.tokensave/tokensave.db`, `graphify-out/cache/last_query_stamp`. All were pre-existing and outside the permitted project write target except the tooling artifacts, which were preserved. |
| Deleted tracked files | None reported by baseline status. |
| Untracked files | Sibling theme tests, sibling Shiprocket backup CSVs, `.tokensave/tokensave.db-shm`, `.tokensave/tokensave.db-wal`. The plan file is task-generated and appears only after this baseline. |
| Existing workspaces | Root npm workspaces: `server`, `client`. |
| Existing documentation | `README.md`, `AGENTS.md`, `docs/meta-ads/META_ADS_APP_MIGRATION.md`, `reorder_report.md`, tracked `codex-staged-work.diff`/`codex-uncommitted-work.diff`, project instructions/skills. |
| Existing runtime/tool directories | `server/data`, `server/.cache`, `server/server/data`, `client/dist`, `test-results`, `.playwright-cli`, `.tmp-playwright`, `.tokensave`, `graphify-out`. |
| Existing databases | `server/data/app.db`, `server/server/data/app.db`, Order Mapping PostgreSQL/Neon schema, `.tokensave/tokensave.db`; WAL/SHM companions exist for SQLite/tooling. |

### Current application and system inventory

| Surface | Current evidence | Status and ownership confidence |
| --- | --- | --- |
| Shopify Product Sorter / Collection Placement Manager | `client/src/App.jsx`; `/api/collections*`; `sorter.js`, `collectionStateService.js`, `sorterRuntimeService.js` | Executable; high confidence as sorter owner, but mixed shell/router ownership. |
| Order Mapping | `client/src/OrderMapping.jsx`; `/api/order-mapping/*`; PostgreSQL repositories and migration services | Executable; high confidence for current route, medium confidence because legacy SQLite code overlaps. |
| Delivery Resolution legacy | `deliveryRepository.js`, `deliveryShopify.js`, `legacyCsv.js`, `reconciliationService.js`, `statusMapper.js`; `/delivery-resolution` redirect | Executable legacy subsystem; ownership unresolved and overlapping Order Mapping. |
| SKU Image Manager | `client/src/SkuImageManager.jsx`; `/api/sku-images/*`; `shopifyMediaService.js`, `skuImageAuditService.js` | Executable; high confidence as SKU feature, low boundary isolation. |
| Actual Sales Intelligence | `actualSalesService.js`; `/api/sales-intelligence/*`, `/api/actual-sales-intelligence`; JSON caches | Operational backend service/API; no separate frontend route proven. |
| System Diagnostics | shared App sidebar, sorter logs, Order Mapping network/action logs, Shopify debug endpoint | Shared observability feature; not an independent application. |
| Meta Ads | disabled `meta-ads` sidebar item and `docs/meta-ads/META_ADS_APP_MIGRATION.md` only | Documentation-only and deferred. |

## 5. Architecture principles

These principles bind every task in this ledger:

1. No big-bang rewrite; migrate one ownership boundary at a time.
2. Preserve public routes during migration.
3. Preserve API contracts until compatibility tests exist.
4. One application owner per route and one application owner per data contract.
5. Shared transport clients may contain provider transport concerns only, never application business logic.
6. Runtime data is not source code and must not be silently treated as tracked source.
7. No file deletion without proven ownership, backup, and a rollback path.
8. No database relocation without a verified backup and restore test.
9. No write-capable Meta Ads functionality before read-only tests and explicit safeguards.
10. Every structural change requires rollback instructions and existing-app regression checks.
11. Every phase must preserve the working sorter, Order Mapping, SKU Image Manager, and Sales Intelligence contracts.
12. Secrets, customer records, tokens, and live database values never enter this document.

### Recommended incremental target architecture

Keep the current Express/Vite two-process model initially. Introduce ownership boundaries inside those workspaces, then decide whether separate workspaces/services are justified by evidence.

```text
client/
  src/
    app-shell/                 # route composition, navigation, shared diagnostics
    apps/
      sorter/                  # collection placement UI/state/client
      order-mapping/           # Order Mapping UI/state/client
      sku-image-manager/       # SKU media UI/state/client
      meta-ads/                # future, feature-flagged and isolated
    shared/
      components/
      hooks/
      styles/
      api/                     # transport/error primitive only

server/
  src/
    apps/
      sorter/                  # routes, use cases, repositories/runtime adapters
      order-mapping/           # routes, services, PostgreSQL repository/migrations
      sku-image-manager/       # routes, media use cases, audit adapter
      sales-intelligence/      # routes, reconciliation, cache adapter
      diagnostics/             # health/log read contracts
      meta-ads/                # future, read-only first
    integrations/
      shopify/                 # authenticated transport only
      shiprocket/              # authenticated transport only
      meta/                    # future, backend-only transport
    shared/
      config/ database/ errors/ logging/ validation/ types/

runtime/
  sorter/ order-mapping/ sku-image-manager/ sales-intelligence/
scripts/                         # explicit safe operations and migrations
docs/                            # maps, runbooks, ADRs, this ledger
tests/                           # cross-app contracts and fixtures
```

Migration strategy: baseline contracts first; approve ownership; extract routers behind current mounts; extract frontend shell/features behind current URLs; consolidate provider transport behind old exports; migrate runtime data only after verified backup/restore; clean generated files last; rebuild Meta only after `FINAL-007`. Every step must have a reversible adapter or restore procedure. The exact directory tree remains subject to DEC-001 through DEC-007; this recommendation is not permission to implement it during the audit.

## 6. Application ownership matrix

| Application | Frontend owner | Backend owner | Routes | Data owner | Integrations | Current status | Target boundary |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Product Sorter | `App.jsx` sorter branch | collection routes/services | `/`, `/api/collections*` | SQLite collection/settings/runtime tables and strategy JSON | Shopify | Executable | `client/src/apps/sorter`, `server/src/apps/sorter`. |
| Order Mapping | `OrderMapping.jsx` plus pathname entry | `orderMapping.js`, `orderMappingService.js`, PostgreSQL repository | `/order-mapping`, `/api/order-mapping/*` | Order Mapping PostgreSQL schema; legacy SQLite source to classify | Shopify, Shiprocket | Executable | Isolated app route/service/data boundary with compatibility adapters. |
| SKU Image Manager | `SkuImageManager.jsx` branch | `/api/sku-images/*`, `shopifyMediaService.js` | Shell module, `/api/sku-images/*` | SKU audit JSONL and Shopify media state | Shopify | Executable | Isolated feature and media service. |
| Actual Sales Intelligence | No separate executable frontend proven | `actualSalesService.js`, sales routes | `/api/sales-intelligence/*`, `/api/actual-sales-intelligence` | Sales cache files | Shopify, Shiprocket | Backend operational service | Isolated service/API; user-facing status decided later. |
| System Diagnostics | Shared App sidebar | sorter/Order Mapping log routes and Shopify debug | `/api/health`, diagnostics endpoints | SQLite logs and PostgreSQL network/action logs | Shopify | Shared feature | Shared observability package with app-owned event producers. |
| Meta Ads | None; disabled label only | None in destination | None | None | Future Meta API | Documentation-only | Deferred isolated app after core stabilization. |
| Legacy Delivery Resolution | None as current route; redirect compatibility only | `reconciliationService.js`, delivery repository | `/delivery-resolution` redirect and legacy services | SQLite `delivery_*` tables | Shopify, Shiprocket, CSV | Legacy overlap | Classified, migrated, or retired only after ownership proof. |

## 7. Data ownership matrix

| Data store | Current location | Owner | Readers | Writers | Backup status | Target location | Migration requirement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sorter/legacy SQLite | `server/data/app.db` | Mixed sorter, auth, delivery | collection services, runtime, legacy delivery, auth | same services; startup DDL | Not confirmed | Configurable app-owned SQLite runtime | Inventory tables, backup, migration test, then relocate if needed. |
| Ambiguous SQLite copy | `server/server/data/app.db` | Unknown | No proven source reader | Unknown | Not confirmed | Retain read-only until ownership proven | Compare schema/records without exposing records; backup before disposition. |
| Strategy settings | `server/data/strategy-settings.json` | Sorter | strategy service/routes | strategy service | Not confirmed | Sorter runtime directory | Path configuration and atomic migration. |
| SKU audit | `server/data/sku-image-actions.jsonl` | SKU Image Manager | audit service/diagnostics | media service | Not confirmed | SKU runtime/audit directory | Retention and path configuration. |
| Sales caches | `server/data/sales-*-cache.json` | Actual Sales Intelligence | sales service/routes | sales service | Not confirmed | Sales Intelligence runtime/cache directory | Versioned cache migration or rebuild. |
| Shiprocket token cache | `server/.cache/shiprocket-token.json` | Integration runtime | Shiprocket service | auth service/tooling | Not confirmed | Secret/runtime store outside tracked source | Secret handling and rotation review. |
| Order Mapping PostgreSQL schema | Neon/PostgreSQL schema from `server/migrations/order-mapping/*.sql` | Order Mapping | repository/service/routes/tests | repository/migrations | Not confirmed | Dedicated schema/database owner | Backup, restore, contract verification. |
| Legacy SQLite delivery tables | `delivery_orders`, `legacy_imports`, `delivery_logs` in `database.js` | Legacy Delivery Resolution | delivery repository/reconciliation | legacy services | Not confirmed | Migrate or archive under confirmed owner | Data mapping and read-only migration rehearsal. |
| Uploads | OS temp directories configured in route files | SKU and Order Mapping request handlers | current request only | multer | Ephemeral; no retention contract | Configurable temp runtime paths | Document cleanup and limits; no persistent migration assumed. |
| Exports | Sales Intelligence CSV response; no durable export directory proven | Sales Intelligence | API consumers | route/service response | Not applicable | Explicit export policy | Define retention only if persistence is introduced. |
| Runtime logs | SQLite sorter logs, PostgreSQL network/action logs, console logs | Shared diagnostics with app producers | diagnostics UI/routes | app services | Not confirmed | Centralized bounded logging contract | Retention/sanitization migration. |
| Browser storage | No `localStorage`/`sessionStorage` evidence in current destination app | None proven | None proven | None proven | Not applicable | App-owned storage only if later required | New feature decision; do not introduce during restructuring. |
| Tokensave database | `.tokensave/tokensave.db` | Tooling, not application | Tokensave | Tokensave | External tool state | Tool-managed location outside source | Review and exclude from app ownership. |

## 8. Route ownership matrix

Frontend compatibility routes are `/` (sorter shell), `/order-mapping` (direct `OrderMapping` root), and `/delivery-resolution` (client and server redirect to `/order-mapping`). Sidebar IDs `meta-ads`, `analytics`, `inventory`, `reports`, and `settings` are disabled labels, not executable routes. Backend routes below are mounted under `/api` unless the target begins `/api/order-mapping`.

| Method | Current route | Current handler | Application owner | Target router | Compatibility requirement |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | `server/src/routes/api.js:208` | Diagnostics | health router | Same JSON health contract. |
| GET | `/api/debug/shopify` | `api.js:246` | Diagnostics/Shopify integration | diagnostics router | Preserve fields and sanitize errors. |
| GET | `/api/collections/logs/actions` | `api.js:212` | Sorter diagnostics | sorter router | Preserve query/response. |
| GET | `/api/collections/logs/network` | `api.js:229` | Sorter diagnostics | sorter router | Preserve query/response. |
| POST | `/api/sales-intelligence/refresh-shopify` | `api.js:278` | Sales Intelligence | sales router | Preserve days and refresh contract. |
| POST | `/api/sales-intelligence/refresh-shiprocket` | `api.js:291` | Sales Intelligence | sales router | Preserve days and refresh contract. |
| POST | `/api/sales-intelligence/reconcile` | `api.js:304` | Sales Intelligence | sales router | Preserve refresh behavior. |
| GET | `/api/sales-intelligence/summary` | `api.js:320` | Sales Intelligence | sales router | Preserve summary payload. |
| GET | `/api/sales-intelligence/reconciled-orders` | `api.js:336` | Sales Intelligence | sales router | Preserve payload keys. |
| GET | `/api/sales-intelligence/{brand,type,color,sku,courier,pincode,state,city}-performance` | `api.js:356-387` | Sales Intelligence | sales router | Preserve all slice paths. |
| GET | `/api/sales-intelligence/{payment-method-performance,rto-analysis,restock-suggestions,reconciliation-issues,recommendations,pending-risk}` | `api.js:356-387` | Sales Intelligence | sales router | Preserve all slice paths. |
| GET | `/api/sales-intelligence/export` | `api.js:389` | Sales Intelligence | sales router | Preserve CSV disposition and query contract. |
| GET | `/api/actual-sales-intelligence` | `api.js:408` | Sales Intelligence | sales router | Preserve legacy alias. |
| GET | `/api/collections` | `api.js:424` | Sorter | sorter router | Preserve collection list. |
| GET | `/api/collection-products` | `api.js:438` | Sorter | sorter router | Preserve collectionId query. |
| POST | `/api/collections/sync` | `api.js:465` | Sorter | sorter router | Preserve sync and snapshot behavior. |
| GET | `/api/collections/state` | `api.js:486` | Sorter | sorter router | Preserve state payload. |
| PUT | `/api/collections/settings` | `api.js:504` | Sorter | sorter router | Preserve strategy/settings compatibility. |
| PUT | `/api/collections/products/preference` | `api.js:522` | Sorter | sorter router | Preserve preference update. |
| POST | `/api/collections/generate` | `api.js:539` | Sorter | sorter router | Preserve generated order contract. |
| POST | `/api/collections/apply` | `api.js:574` | Sorter | sorter router | Preserve Shopify write and backup semantics. |
| POST | `/api/collections/reorder-all-v2` | `api.js:608` | Sorter | sorter router | Preserve job/status contract. |
| POST | `/api/collections/reorder-all` | `api.js:1021,1025` | Sorter | compatibility adapter | Resolve duplicate definition without changing public URL. |
| POST | `/api/collections/rollback` | `api.js:1067` | Sorter | sorter router | Preserve rollback contract. |
| GET | `/api/sku-images/search` | `api.js:1103` | SKU Image Manager | SKU router | Preserve SKU query behavior. |
| POST | `/api/sku-images/load-all` | `api.js:1114` | SKU Image Manager | SKU router | Preserve load contract. |
| POST | `/api/sku-images/add`, `/add-upload`, `/add-url` | `api.js:1124-1170` | SKU Image Manager | SKU router | Preserve upload/url payloads and temp cleanup. |
| POST | `/api/sku-images/delete`, `/reorder` | `api.js:1174-1195` | SKU Image Manager | SKU router | Preserve media write behavior. |
| POST | `/api/sku-images/bulk-add`, `/bulk-add-upload` | `api.js:1198-1240` | SKU Image Manager | SKU router | Preserve bulk write behavior. |
| POST | `/api/sku-images/bulk-delete-preview`, `/bulk-delete-confirm` | `api.js:1243-1275` | SKU Image Manager | SKU router | Preserve preview/confirm separation. |
| GET | `/api/order-mapping/orders`, `/orders/:id` | `orderMapping.js:37-73` | Order Mapping | Order Mapping router | Preserve response/error envelope. |
| GET | `/api/order-mapping/logs/network`, `/logs/actions` | `orderMapping.js:75-89` | Order Mapping diagnostics | Order Mapping router | Preserve limits and log fields. |
| POST | `/api/order-mapping/sync/shopify`, `/sync/shiprocket` | `orderMapping.js:91-105` | Order Mapping | Order Mapping router | Preserve sync contracts and force behavior. |
| POST | `/api/order-mapping/shipments/:id/refresh`, `/manual`, `/clear-manual` | `orderMapping.js:107-150` | Order Mapping | Order Mapping router | Preserve status/manual semantics. |
| POST | `/api/order-mapping/imports/preview`, `/imports/:id/commit` | `orderMapping.js:153-187` | Order Mapping | Order Mapping router | Preserve multipart and commit contracts. |
| POST | `/api/order-mapping/admin/migrate-sqlite` | `orderMapping.js:189-195` | Migration tooling | explicit admin/migration boundary | Remove accidental public exposure only after replacement contract exists. |
| GET | `/delivery-resolution` | `app.js:22`; `main.jsx:7-9` | Legacy compatibility | route adapter | Redirect remains until legacy classification completes. |

## 9. Integration ownership matrix

| Integration | Current implementations | Applications using it | Duplication | Target client | Migration risk |
| --- | --- | --- | --- | --- | --- |
| Shopify Admin GraphQL | `shopifyService.js`, private transport in `shopifyMediaService.js`, shared auth in `shopifyAuth.js` | Sorter, SKU, Order Mapping, Sales, legacy delivery | High | Shared authenticated transport plus app-owned query/use-case modules | Shopify writes and API-version behavior can regress. |
| Shiprocket HTTP API | `shiprocketService.js`, `orderMappingShiprocket.js` | Sales, Order Mapping, legacy delivery | High | Shared authenticated request transport plus app-owned mapping/sync logic | Status, retry, terminal, and network-log semantics can diverge. |
| Neon/PostgreSQL | `orderMappingDb.js`, `pg`, `@neondatabase/serverless` dependency | Order Mapping and tests | Moderate | Order Mapping-owned database adapter | Backup/schema/migration failure. |
| SQLite | `better-sqlite3` in `database.js`, legacy migration in `orderMappingService.js` | Sorter, legacy Delivery Resolution, auth cache/runtime | Mixed ownership | Per-app data adapter or proven shared runtime | Duplicate paths and destructive cleanup risk. |
| Meta API | No destination implementation; historical source snapshot only | None currently | N/A | Future isolated Meta transport | Credential exposure and write-operation risk. |

## 10. Master task index

| Task ID | Title | Severity | Phase | Status | Dependencies | Risk | Owner | Last updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SAFE-001 | Confirm recoverable Git backup | CRITICAL | 0 | READY | None | High | Architecture owner | 2026-07-29 |
| SAFE-002 | Capture working-tree and baseline manifest | CRITICAL | 0 | READY | None | High | Architecture owner | 2026-07-29 |
| SAFE-003 | Confirm SQLite backups | CRITICAL | 0 | NOT STARTED | SAFE-002 | High | Data owner | 2026-07-29 |
| SAFE-004 | Complete PostgreSQL/Neon backup | CRITICAL | 0 | NOT STARTED | SAFE-002 | Critical | Order Mapping owner | 2026-07-29 |
| SAFE-005 | Encrypt secret archive | CRITICAL | 0 | NOT STARTED | SAFE-002 | Critical | Security owner | 2026-07-29 |
| SAFE-006 | Create off-device backup copy | CRITICAL | 0 | NOT STARTED | SAFE-003, SAFE-004, SAFE-005 | Critical | Operations owner | 2026-07-29 |
| SAFE-007 | Validate restoration instructions | CRITICAL | 0 | BLOCKED | SAFE-003, SAFE-004, SAFE-006 | Critical | Operations owner | 2026-07-29 |
| SAFE-008 | Record database ownership uncertainties | HIGH | 0 | NOT STARTED | SAFE-002 | High | Architecture owner | 2026-07-29 |
| TEST-001 | Protect sorter scoring and core logic | HIGH | 1 | NOT STARTED | SAFE-002 | High | Sorter owner | 2026-07-29 |
| TEST-002 | Protect collection sync/apply/rollback | CRITICAL | 1 | NOT STARTED | SAFE-003, SAFE-008 | Critical | Sorter owner | 2026-07-29 |
| TEST-003 | Protect collection reorder contracts | CRITICAL | 1 | NOT STARTED | SAFE-002 | Critical | Sorter owner | 2026-07-29 |
| TEST-004 | Protect Order Mapping sync/status lifecycle | HIGH | 1 | NOT STARTED | SAFE-004 | High | Order Mapping owner | 2026-07-29 |
| TEST-005 | Protect CSV import and manual overrides | HIGH | 1 | NOT STARTED | SAFE-004 | High | Order Mapping owner | 2026-07-29 |
| TEST-006 | Protect SKU media operations | HIGH | 1 | NOT STARTED | SAFE-002 | High | SKU owner | 2026-07-29 |
| TEST-007 | Protect Sales Intelligence API contracts | HIGH | 1 | NOT STARTED | SAFE-002 | High | Sales owner | 2026-07-29 |
| TEST-008 | Protect public route compatibility | CRITICAL | 1 | NOT STARTED | SAFE-002 | Critical | Architecture owner | 2026-07-29 |
| TEST-009 | Protect database migration safety | CRITICAL | 1 | NOT STARTED | SAFE-003, SAFE-004 | Critical | Data owner | 2026-07-29 |
| TEST-010 | Protect startup and environment isolation | HIGH | 1 | NOT STARTED | SAFE-002 | High | Operations owner | 2026-07-29 |
| TEST-011 | Protect frontend navigation | HIGH | 1 | NOT STARTED | SAFE-002 | High | Frontend owner | 2026-07-29 |
| TEST-012 | Add integrated existing-app regression gate | HIGH | 1 | NOT STARTED | TEST-001 through TEST-011 | High | Architecture owner | 2026-07-29 |
| OWN-001 | Establish canonical application names and statuses | MEDIUM | 2 | NOT STARTED | SAFE-008 | Medium | Architecture owner | 2026-07-29 |
| OWN-002 | Define Product Sorter boundary | HIGH | 2 | NOT STARTED | OWN-001, TEST-001 | High | Sorter owner | 2026-07-29 |
| OWN-003 | Classify Order Mapping versus legacy Delivery Resolution | CRITICAL | 2 | NOT STARTED | SAFE-008, TEST-004, TEST-005 | Critical | Architecture owner | 2026-07-29 |
| OWN-004 | Define SKU Image Manager boundary | HIGH | 2 | NOT STARTED | OWN-001, TEST-006 | High | SKU owner | 2026-07-29 |
| OWN-005 | Define Actual Sales Intelligence boundary | HIGH | 2 | NOT STARTED | OWN-001, TEST-007 | High | Sales owner | 2026-07-29 |
| OWN-006 | Define System Diagnostics ownership | MEDIUM | 2 | NOT STARTED | OWN-001, TEST-010 | Medium | Operations owner | 2026-07-29 |
| OWN-007 | Approve route ownership matrix | CRITICAL | 2 | NOT STARTED | OWN-002 through OWN-006, TEST-008 | Critical | Architecture owner | 2026-07-29 |
| OWN-008 | Approve data ownership matrix | CRITICAL | 2 | NOT STARTED | SAFE-003, SAFE-004, SAFE-008 | Critical | Data owner | 2026-07-29 |
| OWN-009 | Approve runtime file ownership | HIGH | 2 | NOT STARTED | OWN-002 through OWN-006 | High | Operations owner | 2026-07-29 |
| OWN-010 | Approve integration and environment ownership | HIGH | 2 | NOT STARTED | OWN-002 through OWN-006 | High | Architecture owner | 2026-07-29 |
| BE-001 | Split the generic API router | HIGH | 3 | NOT STARTED | TEST-012, OWN-007 | High | Backend owner | 2026-07-29 |
| BE-002 | Create a Sorter router | HIGH | 3 | NOT STARTED | BE-001, OWN-002 | High | Sorter owner | 2026-07-29 |
| BE-003 | Create a SKU Image Manager router | HIGH | 3 | NOT STARTED | BE-001, OWN-004 | High | SKU owner | 2026-07-29 |
| BE-004 | Create a Sales Intelligence router | HIGH | 3 | NOT STARTED | BE-001, OWN-005 | High | Sales owner | 2026-07-29 |
| BE-005 | Preserve existing backend URLs with adapters | CRITICAL | 3 | NOT STARTED | BE-001, TEST-008 | Critical | Backend owner | 2026-07-29 |
| BE-006 | Create application-owned service boundaries | HIGH | 3 | NOT STARTED | OWN-002 through OWN-006 | High | Backend owner | 2026-07-29 |
| BE-007 | Remove hidden cross-application imports | HIGH | 3 | NOT STARTED | BE-006 | High | Backend owner | 2026-07-29 |
| BE-008 | Standardize validation and error normalization | HIGH | 3 | NOT STARTED | BE-001, SEC-008 | High | Backend owner | 2026-07-29 |
| BE-009 | Standardize structured logging | MEDIUM | 3 | NOT STARTED | OWN-006, BE-006 | Medium | Operations owner | 2026-07-29 |
| BE-010 | Isolate startup migrations and side effects | CRITICAL | 3 | NOT STARTED | TEST-009, SAFE-004 | Critical | Backend/data owners | 2026-07-29 |
| BE-011 | Resolve duplicate collection reorder handlers | CRITICAL | 3 | NOT STARTED | TEST-003, BE-002, BE-005 | Critical | Sorter owner | 2026-07-29 |
| FE-001 | Extract the application shell | HIGH | 4 | NOT STARTED | TEST-011, OWN-001 | High | Frontend owner | 2026-07-29 |
| FE-002 | Extract navigation ownership | HIGH | 4 | NOT STARTED | FE-001, OWN-007 | High | Frontend owner | 2026-07-29 |
| FE-003 | Introduce explicit routing while preserving URLs | HIGH | 4 | NOT STARTED | TEST-008, FE-001 | High | Frontend owner | 2026-07-29 |
| FE-004 | Extract the Sorter feature | HIGH | 4 | NOT STARTED | FE-001, OWN-002 | High | Sorter owner | 2026-07-29 |
| FE-005 | Extract the SKU Image Manager feature | HIGH | 4 | NOT STARTED | FE-001, OWN-004 | High | SKU owner | 2026-07-29 |
| FE-006 | Retain Order Mapping compatibility boundary | HIGH | 4 | NOT STARTED | FE-003, OWN-003 | High | Order Mapping owner | 2026-07-29 |
| FE-007 | Separate application state | HIGH | 4 | NOT STARTED | FE-004 through FE-006 | High | Frontend owner | 2026-07-29 |
| FE-008 | Separate frontend API clients | HIGH | 4 | NOT STARTED | FE-004 through FE-006, BE-005 | High | Frontend owner | 2026-07-29 |
| FE-009 | Isolate styles and remove global leakage | MEDIUM | 4 | NOT STARTED | FE-001, FE-004, FE-005, FE-006 | Medium | Frontend owner | 2026-07-29 |
| FE-010 | Add feature error and loading boundaries | HIGH | 4 | NOT STARTED | FE-003, FE-007 | High | Frontend owner | 2026-07-29 |
| FE-011 | Add frontend regression tests and classify placeholders | HIGH | 4 | NOT STARTED | FE-002 through FE-010 | High | Frontend owner | 2026-07-29 |
| INT-001 | Inventory and contract Shopify clients | HIGH | 5 | NOT STARTED | OWN-010 | High | Integration owner | 2026-07-29 |
| INT-002 | Define shared Shopify transport | HIGH | 5 | NOT STARTED | INT-001, TEST-003 | High | Integration owner | 2026-07-29 |
| INT-003 | Keep Shopify business logic app-owned | HIGH | 5 | NOT STARTED | INT-002, OWN-002 through OWN-005 | High | App owners | 2026-07-29 |
| INT-004 | Inventory and contract Shiprocket clients | HIGH | 5 | NOT STARTED | OWN-010, TEST-004 | High | Integration owner | 2026-07-29 |
| INT-005 | Define shared Shiprocket transport | HIGH | 5 | NOT STARTED | INT-004 | High | Integration owner | 2026-07-29 |
| INT-006 | Standardize integration authentication and env ownership | CRITICAL | 5 | NOT STARTED | SEC-003, SEC-004, INT-001, INT-004 | Critical | Security/integration owners | 2026-07-29 |
| INT-007 | Standardize retries, rate limits, and errors | HIGH | 5 | NOT STARTED | INT-002, INT-005 | High | Integration owner | 2026-07-29 |
| INT-008 | Add deterministic integration mocks | HIGH | 5 | NOT STARTED | INT-002, INT-005, TEST-012 | High | Test owner | 2026-07-29 |
| INT-009 | Remove duplicate clients after usage proof | HIGH | 5 | NOT STARTED | INT-003, INT-007, INT-008 | High | Integration owner | 2026-07-29 |
| INT-010 | Verify provider contracts and API-version compatibility | HIGH | 5 | NOT STARTED | INT-008, BE-005 | High | Integration owner | 2026-07-29 |
| DATA-001 | Resolve ambiguous SQLite database paths | CRITICAL | 6 | BLOCKED | SAFE-003, OWN-008 | Critical | Data owner | 2026-07-29 |
| DATA-002 | Document SQLite table ownership | CRITICAL | 6 | NOT STARTED | OWN-003, OWN-008 | Critical | Data owner | 2026-07-29 |
| DATA-003 | Separate Sorter runtime data | HIGH | 6 | NOT STARTED | DATA-001, OWN-002, SAFE-003 | High | Sorter/data owners | 2026-07-29 |
| DATA-004 | Separate SKU audit data | HIGH | 6 | NOT STARTED | OWN-004, OWN-009 | High | SKU/data owners | 2026-07-29 |
| DATA-005 | Separate Sales Intelligence caches | HIGH | 6 | NOT STARTED | OWN-005, OWN-009 | High | Sales/data owners | 2026-07-29 |
| DATA-006 | Isolate Order Mapping PostgreSQL/migration state | CRITICAL | 6 | NOT STARTED | SAFE-004, OWN-003, BE-010 | Critical | Order Mapping/data owners | 2026-07-29 |
| DATA-007 | Make runtime paths configurable | HIGH | 6 | NOT STARTED | OWN-009, SEC-004 | High | Operations owner | 2026-07-29 |
| DATA-008 | Add safe data migration tools | CRITICAL | 6 | NOT STARTED | DATA-001 through DATA-007, SAFE-004 | Critical | Data owner | 2026-07-29 |
| DATA-009 | Add data rollback support | CRITICAL | 6 | NOT STARTED | DATA-008, SAFE-007 | Critical | Data owner | 2026-07-29 |
| DATA-010 | Correct ignore rules and generated-file tracking | HIGH | 6 | NOT STARTED | DATA-001 through DATA-007, OPS-005 through OPS-008 | High | Operations owner | 2026-07-29 |
| DATA-011 | Define retention for caches, audits, logs, uploads, exports | MEDIUM | 6 | NOT STARTED | DATA-003 through DATA-007 | Medium | Operations owner | 2026-07-29 |
| DATA-012 | Validate PostgreSQL backup and restore process | CRITICAL | 6 | NOT STARTED | SAFE-004, SAFE-007, DATA-006 | Critical | Order Mapping/data owners | 2026-07-29 |
| OPS-001 | Fix or retire obsolete `scripts/dev.mjs` | MEDIUM | 7 | NOT STARTED | TEST-010, OWN-001 | Medium | Operations owner | 2026-07-29 |
| OPS-002 | Standardize startup commands | MEDIUM | 7 | NOT STARTED | OPS-001, BE-010 | Medium | Operations owner | 2026-07-29 |
| OPS-003 | Standardize health checks | HIGH | 7 | NOT STARTED | BE-005, OWN-006 | High | Operations owner | 2026-07-29 |
| OPS-004 | Standardize diagnostics and safe observability | MEDIUM | 7 | NOT STARTED | OWN-006, BE-009, SEC-006 | Medium | Operations owner | 2026-07-29 |
| OPS-005 | Review and isolate Graphify artifacts | MEDIUM | 7 | NOT STARTED | OWN-009 | Medium | Tooling owner | 2026-07-29 |
| OPS-006 | Review and isolate Tokensave runtime files | HIGH | 7 | NOT STARTED | OWN-009, SEC-003 | High | Tooling/security owners | 2026-07-29 |
| OPS-007 | Review Playwright artifacts | LOW | 7 | NOT STARTED | OWN-009 | Low | Test owner | 2026-07-29 |
| OPS-008 | Review test outputs and cache artifacts | LOW | 7 | NOT STARTED | OWN-009 | Low | Test owner | 2026-07-29 |
| OPS-009 | Add safe backup, architecture-validation, and cleanliness commands | MEDIUM | 7 | NOT STARTED | SAFE-007, DATA-010 | Medium | Operations owner | 2026-07-29 |
| OPS-ARCH-001 | Enforce architecture ledger updates automatically | HIGH | 7 | NOT STARTED | SAFE-002, TEST-012, OPS-009 | High | Repository governance | 2026-07-29 |
| SEC-001 | Assess authentication boundary | CRITICAL | 8 | NOT STARTED | OWN-007, OWN-010 | Critical | Security owner | 2026-07-29 |
| SEC-002 | Add route authorization boundaries | CRITICAL | 8 | NOT STARTED | SEC-001, TEST-008 | Critical | Security/backend owners | 2026-07-29 |
| SEC-003 | Correct secret handling and tracked token risk | CRITICAL | 8 | NOT STARTED | SAFE-005, OWN-010 | Critical | Security owner | 2026-07-29 |
| SEC-004 | Validate environment schema at boundaries | HIGH | 8 | NOT STARTED | OWN-010 | High | Security/operations owners | 2026-07-29 |
| SEC-005 | Isolate application-specific environment requirements | HIGH | 8 | NOT STARTED | SEC-004, OWN-010 | High | Operations owner | 2026-07-29 |
| SEC-006 | Sanitize sensitive logs and diagnostics | CRITICAL | 8 | NOT STARTED | SEC-003, OWN-006 | Critical | Security/operations owners | 2026-07-29 |
| SEC-007 | Review CORS and CSRF protections | HIGH | 8 | NOT STARTED | SEC-001, BE-005 | High | Security/backend owners | 2026-07-29 |
| SEC-008 | Sanitize API errors and validate input | HIGH | 8 | NOT STARTED | BE-008, SEC-006 | High | Backend/security owners | 2026-07-29 |
| SEC-009 | Audit dependencies, rotation, and future Meta bundle exposure | HIGH | 8 | NOT STARTED | SEC-003, SEC-004 | High | Security owner | 2026-07-29 |
| DOC-001 | Update README to current architecture | MEDIUM | 9 | NOT STARTED | OWN-001, BE-005, FE-003 | Medium | Documentation owner | 2026-07-29 |
| DOC-002 | Create a real `.env.example` | HIGH | 9 | NOT STARTED | SEC-004, SEC-005 | High | Documentation/operations owners | 2026-07-29 |
| DOC-003 | Create application map | MEDIUM | 9 | NOT STARTED | OWN-001 through OWN-006 | Medium | Documentation owner | 2026-07-29 |
| DOC-004 | Create route map | HIGH | 9 | NOT STARTED | OWN-007, BE-005, FE-003 | High | Documentation owner | 2026-07-29 |
| DOC-005 | Create data ownership documentation | HIGH | 9 | NOT STARTED | OWN-008, DATA-002 | High | Documentation/data owners | 2026-07-29 |
| DOC-006 | Create integration documentation | HIGH | 9 | NOT STARTED | INT-001 through INT-007 | High | Documentation/integration owners | 2026-07-29 |
| DOC-007 | Create local development guide | MEDIUM | 9 | NOT STARTED | OPS-002, SEC-005 | Medium | Documentation/operations owners | 2026-07-29 |
| DOC-008 | Create production startup guide | HIGH | 9 | NOT STARTED | OPS-002, OPS-003, SEC-001 | High | Documentation/operations owners | 2026-07-29 |
| DOC-009 | Create backup and restore guide | CRITICAL | 9 | NOT STARTED | SAFE-007, DATA-012 | Critical | Documentation/data owners | 2026-07-29 |
| DOC-010 | Create migration and deprecation policy | HIGH | 9 | NOT STARTED | BE-010, DATA-008, CLEAN-001 | High | Architecture/documentation owners | 2026-07-29 |
| DOC-011 | Create ADRs and separate Shopify theme context | MEDIUM | 9 | NOT STARTED | OWN-001, deferred user decisions | Medium | Architecture/documentation owners | 2026-07-29 |
| CLEAN-001 | Classify and resolve legacy Delivery Resolution files | HIGH | 10 | BLOCKED | OWN-003, TEST-004, TEST-005, SAFE-003 | Critical | Architecture/data owners | 2026-07-29 |
| CLEAN-002 | Resolve duplicate database artifacts | CRITICAL | 10 | BLOCKED | DATA-001, DATA-002, SAFE-007 | Critical | Data owner | 2026-07-29 |
| CLEAN-003 | Resolve duplicate route handlers | CRITICAL | 10 | NOT STARTED | BE-011, TEST-003 | Critical | Backend owner | 2026-07-29 |
| CLEAN-004 | Classify dead components and disabled placeholders | LOW | 10 | NOT STARTED | FE-011, OWN-001 | Low | Frontend owner | 2026-07-29 |
| CLEAN-005 | Remove or isolate Graphify generated clutter | LOW | 10 | NOT STARTED | OPS-005, DATA-010 | Low | Tooling owner | 2026-07-29 |
| CLEAN-006 | Remove or isolate Playwright and Tokensave artifacts | LOW | 10 | NOT STARTED | OPS-006, OPS-007, DATA-010 | Medium | Tooling owner | 2026-07-29 |
| CLEAN-007 | Remove or isolate test outputs | LOW | 10 | NOT STARTED | OPS-008, DATA-010 | Low | Test owner | 2026-07-29 |
| CLEAN-008 | Resolve stale scripts and documentation | MEDIUM | 10 | NOT STARTED | OPS-001, DOC-001 | Medium | Operations/documentation owners | 2026-07-29 |
| CLEAN-009 | Review unused dependencies, orphan uploads/exports, and old migration helpers | MEDIUM | 10 | NOT STARTED | OWN-008, DATA-011, DOC-010 | Medium | Architecture owners | 2026-07-29 |
| META-001 | Define isolated Meta Ads boundary and feature flags | HIGH | 11 | DEFERRED | FINAL-007, DOC-003 | High | Future Meta owner | 2026-07-29 |
| META-002 | Define Meta frontend route and navigation | HIGH | 11 | DEFERRED | META-001, FE-003 | High | Future Meta owner | 2026-07-29 |
| META-003 | Define Meta backend router and transport | HIGH | 11 | DEFERRED | META-001, INT-010, SEC-009 | Critical | Future Meta owner | 2026-07-29 |
| META-004 | Rebuild read-only account, campaigns, ad sets, and ads | HIGH | 11 | DEFERRED | META-001 through META-003 | High | Future Meta owner | 2026-07-29 |
| META-005 | Rebuild insights, audiences, and creatives read paths | HIGH | 11 | DEFERRED | META-004 | High | Future Meta owner | 2026-07-29 |
| META-006 | Define Meta persistence and authentication | CRITICAL | 11 | DEFERRED | META-003, SEC-001 through SEC-005 | Critical | Future Meta owner | 2026-07-29 |
| META-007 | Add Meta tests, write safeguards, and observability | CRITICAL | 11 | DEFERRED | META-004 through META-006 | Critical | Future Meta owner | 2026-07-29 |
| META-008 | Roll out Meta safely to production | HIGH | 11 | DEFERRED | META-007, FINAL-007 | High | Future Meta owner | 2026-07-29 |
| FINAL-001 | Run full test and coverage gate | CRITICAL | 12 | NOT STARTED | TEST-012, all implementation phases | Critical | Architecture owner | 2026-07-29 |
| FINAL-002 | Verify all routes and startup behavior | CRITICAL | 12 | NOT STARTED | BE-005, FE-003, OPS-002, TEST-008 | Critical | Architecture owner | 2026-07-29 |
| FINAL-003 | Verify data integrity and restore evidence | CRITICAL | 12 | NOT STARTED | DATA-009, DATA-012, SAFE-007 | Critical | Data owner | 2026-07-29 |
| FINAL-004 | Audit dependencies, environment, and security | CRITICAL | 12 | NOT STARTED | SEC-001 through SEC-009, INT-010 | Critical | Security owner | 2026-07-29 |
| FINAL-005 | Verify repository cleanliness and documentation accuracy | HIGH | 12 | NOT STARTED | CLEAN-001 through CLEAN-009, DOC-001 through DOC-011 | High | Architecture owner | 2026-07-29 |
| FINAL-006 | Refresh Graphify and Obsidian project context | MEDIUM | 12 | NOT STARTED | FINAL-005, explicit tooling approval | Medium | Documentation/tooling owners | 2026-07-29 |
| FINAL-007 | Make the Meta Ads readiness decision | HIGH | 12 | NOT STARTED | FINAL-001 through FINAL-006 | High | Architecture/product owners | 2026-07-29 |
| FINAL-008 | Sign off architecture completion | CRITICAL | 12 | NOT STARTED | FINAL-001 through FINAL-007 | Critical | Architecture owner | 2026-07-29 |

## 11. Detailed task records

The records below are the executable ledger. The compact wording is intentional; evidence and acceptance are objective, and each record must be expanded with actual implementation evidence when executed.

### `SAFE-001` Confirm recoverable Git backup

**Severity:** CRITICAL  
**Phase:** 0 — Safety and recoverability  
**Status:** READY  
**Dependencies:** None  
**Blocks:** SAFE-006, SAFE-007, all destructive cleanup  
**Application owner:** Repository operations  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Git is the first rollback layer, but the project is inside a larger worktree and the current branch has unrelated dirty files.

#### Evidence

`git rev-parse --show-toplevel` returns the enclosing `Entitled` directory; branch is `main`; baseline is `4956310183cf53043b0c3a27b04869833cf53654`; status contains sibling and tooling changes.

#### Required change

Confirm an accessible remote or local Git backup of the baseline and record the exact ref without changing branch or dirty files.

#### Explicitly out of scope

No commit, push, branch change, stash, reset, restore, or sibling-file cleanup.

#### Files likely affected

External backup records only; no repository file should be changed by this task.

#### Data impact

No data impact.

#### Backup prerequisite

None; this task establishes the prerequisite.

#### Implementation sequence

1. Confirm baseline ref and remote reachability read-only.
2. Record backup location, ref, timestamp, and dirty-worktree handling.
3. Attach command output to completion evidence.

#### Acceptance criteria

- Baseline commit is recoverable from a documented local or remote ref.
- Unrelated dirty files are listed and preserved.
- No repository file changes occur.

#### Required validation

Static: `git rev-parse`, `git show --stat`. Unit/integration: not applicable. Route/data/build/manual: verify status and ref remain unchanged.

#### Rollback plan

Delete only the external backup record if it is invalid; do not alter repository state.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | READY | Baseline identified; backup not yet proven. | Audit commands recorded in document control. |

### `SAFE-002` Capture working-tree and baseline manifest

**Severity:** CRITICAL  
**Phase:** 0 — Safety and recoverability  
**Status:** READY  
**Dependencies:** None  
**Blocks:** SAFE-003, SAFE-008, all later implementation  
**Application owner:** Repository operations  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

The project is not the Git top-level, so an unscoped status or restore operation can affect sibling applications.

#### Evidence

The audit captured `/tmp/shopify-product-sorter-architecture-before.d5tNpx.manifest`; Git status shows sibling Entitled theme and Shiprocket changes plus `.tokensave` and Graphify changes.

#### Required change

Keep a durable, scoped before-state manifest listing root, branch, commit, status, staged/modified/deleted/untracked files, applications, workspaces, docs, runtime directories, and databases.

#### Explicitly out of scope

No source, runtime, Graphify, Obsidian, or sibling changes.

#### Files likely affected

External manifest and future task evidence only.

#### Data impact

No data impact.

#### Backup prerequisite

None.

#### Implementation sequence

1. Run scoped inventory excluding `.git`, dependencies, and reproducible build output.
2. Store a timestamped external manifest.
3. Compare future status against the manifest before every destructive task.

#### Acceptance criteria

- Manifest is readable outside the repository.
- It distinguishes pre-existing changes from task-generated changes.
- It records all required baseline categories without secrets or customer records.

#### Required validation

Static: compare `git status`, `git ls-files`, and inventory counts. Data: verify no runtime files were read into the plan. Manual: review exclusions.

#### Rollback plan

Discard only the external manifest if it is superseded; retain the newest valid baseline.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | READY | Temporary before-state manifest captured. | `/tmp/shopify-product-sorter-architecture-before.d5tNpx.manifest`. |

### `SAFE-003` Confirm SQLite backups

**Severity:** CRITICAL  
**Phase:** 0 — Safety and recoverability  
**Status:** NOT STARTED  
**Dependencies:** SAFE-002  
**Blocks:** DATA-001, DATA-008, CLEAN-001  
**Application owner:** Data owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Two physical SQLite databases and WAL/SHM files exist, and the active owner/path is not proven.

#### Evidence

`server/data/app.db` is the configured default; `server/server/data/app.db` also exists; `database.js` opens the configured path with WAL mode; SQLite runtime artifacts are present.

#### Required change

Create consistent, integrity-checked backups of both database candidates and their WAL state before any relocation or cleanup.

#### Explicitly out of scope

No migration, deletion, path change, compaction, or record inspection in the ledger.

#### Files likely affected

External backup artifacts and evidence; no repository source changes.

#### Data impact

Potential data impact; backup only.

#### Backup prerequisite

SAFE-002 manifest.

#### Implementation sequence

1. Quiesce writes through an approved operational window.
2. Copy each database with its WAL/SHM state using a SQLite-safe method.
3. Run integrity checks on copies and record hashes.

#### Acceptance criteria

- Both paths are backed up and labeled.
- Integrity checks pass.
- Backup contents never enter Git or this document.

#### Required validation

Data integrity check, hash comparison, restore-open test on copies, and status check.

#### Rollback plan

Retain original files; restore a labeled copy only under a later approved recovery task.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Duplicate SQLite paths require recoverable backups. | `server/src/config/env.js:32-41`; physical inventory. |

### `SAFE-004` Complete PostgreSQL/Neon backup

**Severity:** CRITICAL  
**Phase:** 0 — Safety and recoverability  
**Status:** NOT STARTED  
**Dependencies:** SAFE-002  
**Blocks:** SAFE-006, DATA-006, DATA-012, BE-010  
**Application owner:** Order Mapping/data owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Order Mapping writes to a schema managed by runtime migrations, but no direct backup or restore evidence is recorded.

#### Evidence

`orderMappingDb.js` uses `DATABASE_URL`; `orderMappingMigrations.js` creates the schema and `_migrations`; `server/migrations/order-mapping/001_initial.sql` and `002_logs.sql` define orders, shipments, imports, sync, and log tables.

#### Required change

Produce a redacted backup record and verified restorable PostgreSQL/Neon backup for the active Order Mapping schema.

#### Explicitly out of scope

No migration, schema alteration, credential rotation, or secret value capture.

#### Files likely affected

External backup and restore records only.

#### Data impact

Potential data impact; database backup required.

#### Backup prerequisite

SAFE-002 and provider-approved backup access.

#### Implementation sequence

1. Identify schema without recording connection strings.
2. Create a provider-native or logical backup.
3. Restore into an isolated test target and compare schema/object counts without exposing records.

#### Acceptance criteria

- Correct schema is backed up.
- Restore completes in an isolated target.
- Backup location, timestamp, and retention owner are documented without secrets.

#### Required validation

Migration/schema inventory, restore test, read-only smoke queries, and no production writes.

#### Rollback plan

Delete only the isolated restore target after evidence capture; retain the source backup.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | PostgreSQL/Neon backup status is unconfirmed. | `server/src/services/orderMappingDb.js:1-61`; migration files. |

### `SAFE-005` Encrypt secret archive

**Severity:** CRITICAL  
**Phase:** 0 — Safety and recoverability  
**Status:** NOT STARTED  
**Dependencies:** SAFE-002  
**Blocks:** SAFE-006, SEC-003  
**Application owner:** Security owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

The runtime uses Shopify, Shiprocket, PostgreSQL, and cached-token credentials, while `server/.cache/shiprocket-token.json` is tracked and no safe secret archive status exists.

#### Evidence

Environment names are centralized in `server/src/config/env.js:44-63`; `shopifyAuth.js` persists auth state; `server/.cache/shiprocket-token.json` is tracked. Values were not inspected or copied.

#### Required change

Create an encrypted, access-controlled archive procedure for required secret material and document rotation ownership.

#### Explicitly out of scope

No secret values in this plan, no credentials printed, no rotation performed without approval, no application edits in this task.

#### Files likely affected

External encrypted archive and security runbook.

#### Data impact

Potential security impact; no application data migration.

#### Backup prerequisite

SAFE-002; approved secret-management location.

#### Implementation sequence

1. Inventory names and owners only.
2. Encrypt archive using approved tooling and separate key custody.
3. Test access with redacted metadata and record rotation date.

#### Acceptance criteria

- Archive is encrypted and access-controlled.
- No plaintext secret is added to Git or this plan.
- Rotation and revocation owners are recorded.

#### Required validation

Security review, archive decrypt test by authorized operator, repository secret scan, and status check.

#### Rollback plan

Revoke/delete the invalid archive and recreate it under approved custody; do not edit application files.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Secret archive and tracked-token risk remain unresolved. | `server/.cache/shiprocket-token.json`; `env.js:44-63`. |

### `SAFE-006` Create off-device backup copy

**Severity:** CRITICAL  
**Phase:** 0 — Safety and recoverability  
**Status:** NOT STARTED  
**Dependencies:** SAFE-003, SAFE-004, SAFE-005  
**Blocks:** SAFE-007 and destructive cleanup  
**Application owner:** Operations owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Local Git and database copies do not prove recovery after disk or workspace loss.

#### Evidence

No off-device backup location or restoration proof is recorded in the current repository documentation.

#### Required change

Place encrypted Git, SQLite, PostgreSQL, and approved runtime backup artifacts on an approved separate device/location.

#### Explicitly out of scope

No public upload, paid storage creation, credential modification, or source cleanup.

#### Files likely affected

External backup location and runbook.

#### Data impact

Potential data impact; backup only.

#### Backup prerequisite

SAFE-003, SAFE-004, SAFE-005.

#### Implementation sequence

1. Select approved off-device destination.
2. Copy encrypted artifacts and verify hashes.
3. Record retention and access owner without contents.

#### Acceptance criteria

- Off-device copy exists for every required backup class.
- Hash verification passes.
- No secrets or records are exposed in this ledger.

#### Required validation

Hash verification, authorized access test, restore-read test, and status review.

#### Rollback plan

Remove only an invalid off-device copy after confirming the local backup remains valid.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Off-device recovery copy not confirmed. | No current backup record. |

### `SAFE-007` Validate restoration instructions

**Severity:** CRITICAL  
**Phase:** 0 — Safety and recoverability  
**Status:** BLOCKED  
**Dependencies:** SAFE-003, SAFE-004, SAFE-006  
**Blocks:** DATA-001, DATA-008, DATA-009, DATA-012, cleanup  
**Application owner:** Operations owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Backups without a tested restore procedure do not establish recoverability.

#### Evidence

No backup/restore guide or restore evidence exists in `docs`; only Meta migration documentation is present.

#### Required change

Perform isolated restore rehearsals for Git, SQLite, PostgreSQL, and runtime artifacts and record the exact operator sequence.

#### Explicitly out of scope

No production restore, migration, deletion, or application restructuring.

#### Files likely affected

External restore target and future `DOC-009` documentation.

#### Data impact

Potential data impact; isolated restore only.

#### Backup prerequisite

SAFE-003, SAFE-004, SAFE-006.

#### Implementation sequence

1. Restore each artifact in isolation.
2. Run integrity and startup smoke checks against the restored copy.
3. Record failures, recovery time, and follow-up tasks.

#### Acceptance criteria

- Every backup class restores successfully.
- No production target is modified.
- Instructions are sufficient for an independent operator.

#### Required validation

Git status/ref, SQLite integrity, PostgreSQL schema smoke test, runtime path check, and manual sign-off.

#### Rollback plan

Destroy only isolated restore targets after evidence capture.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | BLOCKED | Restore validation awaits durable backups. | SAFE-003, SAFE-004, SAFE-006. |

### `SAFE-008` Record database ownership uncertainties

**Severity:** HIGH  
**Phase:** 0 — Safety and recoverability  
**Status:** NOT STARTED  
**Dependencies:** SAFE-002  
**Blocks:** OWN-003, OWN-008, DATA-001, CLEAN-001  
**Application owner:** Architecture/data owners  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

SQLite tables combine sorter, auth, and legacy delivery concerns while Order Mapping has both PostgreSQL and legacy SQLite paths.

#### Evidence

`server/src/db/database.js:12-76` creates mixed tables; `orderMappingService.js` imports `better-sqlite3`; `orderMappingMigrations.js` uses PostgreSQL.

#### Required change

Create a table-by-table ownership register with reader/writer evidence, lifecycle, and confidence.

#### Explicitly out of scope

No data moves, schema changes, cleanup, or record values.

#### Files likely affected

This plan’s matrix and an eventual data ownership document.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002; SAFE-003 and SAFE-004 before destructive decisions.

#### Implementation sequence

1. Map symbols to tables.
2. Mark confirmed, inferred, and unknown owners.
3. Assign evidence required for each uncertainty.

#### Acceptance criteria

- Every known SQLite/PostgreSQL object has one provisional owner or an explicit unknown state.
- Unknowns block deletion.

#### Required validation

Static import/reference search and owner review; no runtime writes.

#### Rollback plan

Revert only the ownership record to its prior history entry.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Mixed SQLite/PostgreSQL ownership is unconfirmed. | Database and service evidence above. |

### `TEST-001` Protect sorter scoring and core logic

**Severity:** HIGH  
**Phase:** 1 — Regression protection  
**Status:** NOT STARTED  
**Dependencies:** SAFE-002  
**Blocks:** OWN-002, FE-004  
**Application owner:** Product Sorter  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Scoring and order generation are business-critical, but current coverage is concentrated in one Node test file.

#### Evidence

`server/src/services/sorter.js:176` exports `generateOrder`; `sorter.test.js` covers sorter helpers but no coverage threshold or broad fixture matrix exists.

#### Required change

Add deterministic tests for strategy weights, pinned/hidden products, empty inputs, tie behavior, and score explanations.

#### Explicitly out of scope

No algorithm change, dependency, UI change, or live Shopify call.

#### Files likely affected

`server/src/services/sorter.test.js`, test fixtures, and test command documentation.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Freeze representative fixtures.
2. Add failing edge-case tests.
3. Verify current behavior, then use the suite as the migration gate.

#### Acceptance criteria

- Core score/order cases pass deterministically.
- Edge cases and stable ordering are asserted.
- No live credentials or records are required.

#### Required validation

Unit tests, coverage report, static import check, and sorter regression review.

#### Rollback plan

Revert only the added test/fixture files; retain the baseline test suite.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Existing sorter tests are partial. | `sorter.js`, `sorter.test.js`. |

### `TEST-002` Protect collection sync/apply/rollback

**Severity:** CRITICAL  
**Phase:** 1 — Regression protection  
**Status:** NOT STARTED  
**Dependencies:** SAFE-003, SAFE-008  
**Blocks:** BE-002, DATA-003  
**Application owner:** Product Sorter  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Shopify writes, local backups, snapshots, and rollback are coupled in routes and services without a complete contract suite.

#### Evidence

`api.js:131-142` applies generated orders and creates backups; `collectionStateService.js` owns snapshots; `api.js:574-602` and `1067-1097` expose apply/rollback.

#### Required change

Test snapshot freshness, product-set validation, backup creation, apply success/failure, rollback, and no-partial-write behavior with mocked Shopify.

#### Explicitly out of scope

No live Shopify write, schema move, or route rename.

#### Files likely affected

Sorter route/service tests and mock adapters.

#### Data impact

Potential data impact in test fixtures only; no production data.

#### Backup prerequisite

SAFE-003 and a disposable test database.

#### Implementation sequence

1. Define request/response fixtures.
2. Add failure-path tests before extraction.
3. Use them before every sorter boundary move.

#### Acceptance criteria

- Apply refuses mismatched product sets.
- Backup precedes Shopify write.
- Rollback restores the recorded order and failure paths preserve state.

#### Required validation

Unit, route contract, mocked integration, SQLite test-db integrity, and manual review of no-live-call behavior.

#### Rollback plan

Remove only test additions and disposable databases.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Write path lacks broad regression protection. | `api.js:131-142,574-602,1067-1097`. |

### `TEST-003` Protect collection reorder contracts

**Severity:** CRITICAL  
**Phase:** 1 — Regression protection  
**Status:** NOT STARTED  
**Dependencies:** SAFE-002  
**Blocks:** BE-011, INT-010  
**Application owner:** Product Sorter  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

There are two active `/collections/reorder-all` definitions, creating ambiguous handler ownership and write behavior.

#### Evidence

`server/src/routes/api.js:1021-1023` redirects the route, while `1025-1065` defines a second handler; the client calls `/collections/reorder-all-v2` from `client/src/api.js:81-85`.

#### Required change

Freeze exact contracts for v2, legacy alias, job status, partial failures, idempotency, and final Shopify order verification.

#### Explicitly out of scope

No route cleanup before tests, no live bulk reorder, no API contract redesign.

#### Files likely affected

Sorter route tests, Shopify mock transport, route inventory.

#### Data impact

Potential external Shopify write risk in production; tests use mocks.

#### Backup prerequisite

SAFE-002 and TEST-002.

#### Implementation sequence

1. Capture both current definitions and intended alias behavior.
2. Add contract tests for exact response/status transitions.
3. Require these tests before removing the duplicate.

#### Acceptance criteria

- Every public reorder URL has one asserted behavior.
- Partial failure and verification states are covered.
- No test sends a live write.

#### Required validation

Route contract tests, mocked Shopify job polling, static duplicate-route scan, and compatibility review.

#### Rollback plan

Revert tests only; keep both baseline handlers until BE-011.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Duplicate route definitions are confirmed. | `api.js:1021-1065`. |

### `TEST-004` Protect Order Mapping sync/status lifecycle

**Severity:** HIGH  
**Phase:** 1 — Regression protection  
**Status:** NOT STARTED  
**Dependencies:** SAFE-004  
**Blocks:** OWN-003, CLEAN-001  
**Application owner:** Order Mapping  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Order Mapping combines Shopify sync, Shiprocket refresh, terminal status rules, locks, and PostgreSQL writes with limited test coverage.

#### Evidence

`orderMappingService.js:204-264` owns sync/refresh; `orderMappingStatus.js:120-203` owns status precedence; `orderMappingRepository.js:602-930` owns locks and updates.

#### Required change

Test sync idempotency, forced refresh, terminal protection, status source precedence, failures, and concurrent-lock behavior against an isolated database.

#### Explicitly out of scope

No provider refresh, schema migration, status semantic change, or live data repair.

#### Files likely affected

Order Mapping tests, isolated PostgreSQL test schema, provider mocks.

#### Data impact

Potential data impact in isolated test schema only.

#### Backup prerequisite

SAFE-004.

#### Implementation sequence

1. Build provider payload fixtures.
2. Add red/green tests for status and sync transitions.
3. Gate ownership and service extraction on the suite.

#### Acceptance criteria

- Terminal and manual-lock rules are proven.
- Forced refresh updates representative fixtures.
- Failed provider calls preserve retry/error state.

#### Required validation

Unit, integration, isolated PostgreSQL integrity, network-log assertions, and no production writes.

#### Rollback plan

Drop only the isolated test schema and revert test files.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Existing tests cover matcher/status helpers but not full lifecycle. | `orderMapping.test.js`, service files. |

### `TEST-005` Protect CSV import and manual overrides

**Severity:** HIGH  
**Phase:** 1 — Regression protection  
**Status:** NOT STARTED  
**Dependencies:** SAFE-004  
**Blocks:** OWN-003, CLEAN-001  
**Application owner:** Order Mapping  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

CSV preview/commit, legacy import, manual status, and clear-manual flows are separate paths with overlapping legacy logic.

#### Evidence

`orderMapping.js:120-187` exposes manual/import routes; `orderMappingCsv.js`, `legacyCsv.js`, and `orderMappingRepository.js:930-1208` implement related behavior.

#### Required change

Add tests for malformed headers, mapping, duplicate hashes, unmatched rows, preview/commit separation, manual lock, and clear behavior.

#### Explicitly out of scope

No import of live customer records, schema move, or legacy deletion.

#### Files likely affected

CSV/import tests and isolated database fixtures.

#### Data impact

Potential data impact in disposable fixtures only.

#### Backup prerequisite

SAFE-004.

#### Implementation sequence

1. Use synthetic rows only.
2. Assert preview does not commit.
3. Assert commit is idempotent and manual overrides survive refresh.

#### Acceptance criteria

- Invalid files fail with stable error codes.
- Preview/commit and manual lock semantics are proven.
- No real record is logged.

#### Required validation

Unit, integration, database integrity, route contract, and synthetic CSV manual check.

#### Rollback plan

Drop disposable test data and remove only new tests.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Import and override paths lack complete contract coverage. | `orderMapping.js:120-187`; CSV services. |

### `TEST-006` Protect SKU media operations

**Severity:** HIGH  
**Phase:** 1 — Regression protection  
**Status:** NOT STARTED  
**Dependencies:** SAFE-002  
**Blocks:** OWN-004, FE-005, INT-003  
**Application owner:** SKU Image Manager  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

SKU search, upload, delete, reorder, bulk preview, bulk confirmation, and scope diagnostics live in a 907-line media service and a 1,362-line component without broad tests.

#### Evidence

`shopifyMediaService.js:556-907`; `api.js:1103-1275`; `SkuImageManager.jsx:396-819`.

#### Required change

Test validation, media ordering, retries, scope failures, upload cleanup, preview/confirm safety, and audit entries with mocked Shopify.

#### Explicitly out of scope

No live media mutation or component extraction in this task.

#### Files likely affected

SKU service/route/component tests and provider mocks.

#### Data impact

Potential external media impact; tests are mocked.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Freeze synthetic product/media fixtures.
2. Add service and route tests.
3. Add minimal browser tests only for critical user flows.

#### Acceptance criteria

- All write actions validate and return stable errors.
- Bulk preview cannot delete without confirmation.
- Temporary files are cleaned and audit writes are asserted.

#### Required validation

Unit, mocked integration, route, browser regression, and audit-file fixture checks.

#### Rollback plan

Remove test artifacts and any disposable temp files.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | SKU media behavior is largely untested. | `shopifyMediaService.js`, `SkuImageManager.jsx`. |

### `TEST-007` Protect Sales Intelligence API contracts

**Severity:** HIGH  
**Phase:** 1 — Regression protection  
**Status:** NOT STARTED  
**Dependencies:** SAFE-002  
**Blocks:** OWN-005, BE-004, DATA-005  
**Application owner:** Actual Sales Intelligence  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Sales routes expose summaries, reconciliation slices, exports, refreshes, and caches through the shared router with no route contract suite.

#### Evidence

`api.js:278-422` and `actualSalesService.js:950-1208` define refresh, reconcile, slice, and export behavior; existing tests do not target these routes.

#### Required change

Add deterministic service/route tests for cache versioning, refresh flags, date bounds, all slice keys, CSV headers, and failure normalization.

#### Explicitly out of scope

No live Shopify/Shiprocket refresh, cache deletion, or dashboard build.

#### Files likely affected

Sales service/route tests and synthetic cache fixtures.

#### Data impact

No production data impact; disposable cache fixtures only.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Define synthetic Shopify/Shiprocket payloads.
2. Test cache-hit/miss and force-refresh branches.
3. Freeze response contracts before router extraction.

#### Acceptance criteria

- Every current API family has a stable response test.
- Cache schema/version mismatch triggers safe refresh behavior.
- CSV exports remain parseable and sanitized.

#### Required validation

Unit, route contract, mocked integration, CSV parse, and no-network checks.

#### Rollback plan

Delete only synthetic cache/test fixtures.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Sales API has no dedicated regression suite. | `api.js:278-422`; `actualSalesService.js`. |

### `TEST-008` Protect public route compatibility

**Severity:** CRITICAL  
**Phase:** 1 — Regression protection  
**Status:** NOT STARTED  
**Dependencies:** SAFE-002  
**Blocks:** BE-005, FE-003, FINAL-002  
**Application owner:** All executable applications  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Manual pathname selection, redirect aliases, and shared API mounting make route regressions likely during extraction.

#### Evidence

`client/src/main.jsx:7-11` handles `/delivery-resolution` and `/order-mapping`; `server/src/app.js:20-22` mounts both API routers and redirect.

#### Required change

Create an executable route inventory and compatibility tests for all frontend and backend paths in Section 8.

#### Explicitly out of scope

No router implementation or URL change.

#### Files likely affected

Route contract tests and test documentation.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Assert status, method, body shape, and redirects.
2. Add negative unknown-route checks.
3. Run before and after every boundary migration.

#### Acceptance criteria

- All listed routes have a compatibility assertion.
- `/delivery-resolution` redirects exactly as documented.
- No route test requires real provider credentials.

#### Required validation

Route integration tests, frontend navigation checks, static route inventory diff, and regression run.

#### Rollback plan

Remove only the route test harness; preserve application routes.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | No comprehensive route contract suite exists. | `main.jsx`, `app.js`, Section 8. |

### `TEST-009` Protect database migration safety

**Severity:** CRITICAL  
**Phase:** 1 — Regression protection  
**Status:** NOT STARTED  
**Dependencies:** SAFE-003, SAFE-004  
**Blocks:** BE-010, DATA-008  
**Application owner:** Data owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

SQLite performs schema creation/ALTER operations during module import and server startup; PostgreSQL migrations run during startup too.

#### Evidence

`database.js:12-97` executes DDL on import; `index.js:17` calls `runOrderMappingMigrations`; `orderMappingMigrations.js:8-37` applies migrations.

#### Required change

Test idempotency, failure rollback, applied-migration tracking, interrupted migration recovery, and startup behavior against isolated databases.

#### Explicitly out of scope

No production migration or schema change in this task.

#### Files likely affected

Migration tests, isolated SQLite/PostgreSQL fixtures, migration runner documentation.

#### Data impact

Potential data impact in isolated databases only.

#### Backup prerequisite

SAFE-003 and SAFE-004.

#### Implementation sequence

1. Create empty and partially migrated fixtures.
2. Test repeat, fail, rollback, and restart scenarios.
3. Require green results before isolating startup side effects.

#### Acceptance criteria

- Repeated migration is idempotent.
- Failed migration leaves no partial transaction.
- Startup behavior is explicit and testable.

#### Required validation

Migration integration tests, SQLite integrity, PostgreSQL schema checks, and startup unit checks.

#### Rollback plan

Destroy only isolated databases and revert test harness changes.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Startup DDL and migrations need a safety gate. | `database.js:12-97`; migration service. |

### `TEST-010` Protect startup and environment isolation

**Severity:** HIGH  
**Phase:** 1 — Regression protection  
**Status:** NOT STARTED  
**Dependencies:** SAFE-002  
**Blocks:** OPS-001, SEC-004, FINAL-002  
**Application owner:** Operations  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Startup loads root and server `.env`, primes Shopify auth, fetches live counts, warns on scopes, and listens, coupling all applications to provider availability.

#### Evidence

`server/src/index.js:9-44` performs migrations, auth priming, Shopify fetches, and listen; `env.js:7-22` loads two environment files.

#### Required change

Add startup tests for missing optional/required env, disabled providers, migration failure, auth failure, port selection, and clean shutdown behavior.

#### Explicitly out of scope

No server start against live credentials and no env-file edits.

#### Files likely affected

Startup/config tests and safe test harness.

#### Data impact

No production data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Inject environment and provider stubs.
2. Assert startup dependency policy.
3. Make failures observable without network calls.

#### Acceptance criteria

- Missing required configuration fails clearly.
- Optional integrations do not unexpectedly block unrelated apps.
- No test reads live secret values.

#### Required validation

Unit, startup integration, environment matrix, static secret scan, and no-live-network check.

#### Rollback plan

Remove test harness and restore process environment after each test.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Startup has cross-application side effects. | `index.js:9-44`; `env.js:7-22`. |

### `TEST-011` Protect frontend navigation

**Severity:** HIGH  
**Phase:** 1 — Regression protection  
**Status:** NOT STARTED  
**Dependencies:** SAFE-002  
**Blocks:** FE-001, FE-003, FE-011  
**Application owner:** Frontend  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Navigation is conditional state in `App.jsx` plus pathname selection in `main.jsx`, and disabled labels are mixed with executable modules.

#### Evidence

`App.jsx:6-14,1218-1228,1455-2083`; `main.jsx:7-15`.

#### Required change

Add browser-level checks for `/`, `/order-mapping`, redirect compatibility, sorter/SKU module switching, disabled labels, loading, and error states.

#### Explicitly out of scope

No router library or component extraction yet.

#### Files likely affected

Frontend test specs and test configuration only.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Define stable navigation assertions.
2. Run with mocked API responses.
3. Require green checks before shell extraction.

#### Acceptance criteria

- All current executable modules remain reachable.
- Disabled Meta and future labels cannot activate code.
- Redirect and browser refresh behavior are asserted.

#### Required validation

Browser E2E, mocked API, accessibility smoke, and route regression.

#### Rollback plan

Remove only test specs/configuration.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | No frontend navigation regression suite exists. | `main.jsx`, `App.jsx`. |

### `TEST-012` Add integrated existing-app regression gate

**Severity:** HIGH  
**Phase:** 1 — Regression protection  
**Status:** NOT STARTED  
**Dependencies:** TEST-001 through TEST-011  
**Blocks:** BE-001, FE-001, INT-001, DATA-001  
**Application owner:** All current applications  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

No single safe command proves that all current applications survive a structural change.

#### Evidence

Root scripts contain build/health only; server package has one partial test script; only four test files are present.

#### Required change

Define a read-only regression gate combining unit, route, mocked integration, browser, startup, and database-safety suites.

#### Explicitly out of scope

No live server, live Shopify/Shiprocket call, migration, or dependency install.

#### Files likely affected

Test scripts/configuration and documentation.

#### Data impact

No production data impact.

#### Backup prerequisite

SAFE-002; database tests require SAFE-003/004.

#### Implementation sequence

1. Enumerate test layers and unsafe commands.
2. Add isolated fixtures/mocks.
3. Make the gate fail closed when prerequisites are missing.

#### Acceptance criteria

- One documented gate covers every current app and route family.
- It cannot silently use production credentials/data.
- Results are machine-readable and retained outside source runtime data.

#### Required validation

Unit, integration, E2E, startup, migration, route, and test-isolation checks.

#### Rollback plan

Revert gate wiring and remove disposable test artifacts.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Current validation is fragmented and incomplete. | Root/server package scripts; test inventory. |

### `OWN-001` Establish canonical application names and statuses

**Severity:** MEDIUM  
**Phase:** 2 — Ownership and boundary definition  
**Status:** NOT STARTED  
**Dependencies:** SAFE-008  
**Blocks:** OWN-002 through OWN-006, DOC-003  
**Application owner:** Architecture owner  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

Product Sorter, Collection Placement Manager, Actual Sales Intelligence, Delivery Resolution, and disabled labels are not consistently distinguished.

#### Evidence

Root package is `entitled-collection-placement-manager`; UI label is Collection Placement Manager; API names include `actual-sales-intelligence`; Meta is only a disabled sidebar item and document.

#### Required change

Approve canonical names, legacy aliases, executable status, owner, and target boundary for every surface in Section 6.

#### Explicitly out of scope

No rename, route change, or code movement.

#### Files likely affected

This plan and future application map.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Review evidence matrix.
2. Record owner confidence and unresolved decisions.
3. Use names consistently in later tasks.

#### Acceptance criteria

- Every current surface has one canonical name and status.
- Disabled labels are not treated as applications.
- Legacy aliases remain documented.

#### Required validation

Static path/symbol review and owner sign-off; no runtime change.

#### Rollback plan

Append a corrected decision/history entry without deleting prior evidence.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Naming/status decisions are not yet approved. | Section 6 and package/UI evidence. |

### `OWN-002` Define Product Sorter boundary

**Severity:** HIGH  
**Phase:** 2 — Ownership and boundary definition  
**Status:** NOT STARTED  
**Dependencies:** OWN-001, TEST-001  
**Blocks:** BE-002, FE-004, DATA-003  
**Application owner:** Product Sorter  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Sorter state, diagnostics, Shopify access, runtime tables, and strategy files are distributed through a shared shell/router.

#### Evidence

`App.jsx:345-1101` owns sorter state/actions; `api.js` imports sorter and Sales/SKU services; `sorterRuntimeService.js` creates sorter tables on import.

#### Required change

Define the sorter-owned UI, routes, services, tables, files, Shopify use cases, environment names, and tests.

#### Explicitly out of scope

No extraction or route change.

#### Files likely affected

Ownership matrix and future `client/src/apps/sorter`, `server/src/apps/sorter` paths.

#### Data impact

Potential runtime relocation later; no current data change.

#### Backup prerequisite

SAFE-003 and TEST-002.

#### Implementation sequence

1. Trace all imports and route calls.
2. Mark shared transport versus business logic.
3. Approve target boundary and rollback seams.

#### Acceptance criteria

- Sorter has one owner for each current route/data contract.
- Cross-app dependencies are enumerated.
- No unproven shared table is assigned.

#### Required validation

Static dependency graph, route matrix review, test inventory, and owner sign-off.

#### Rollback plan

Retain the prior matrix entry and append corrected ownership evidence.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Sorter code is mixed into shell and generic router. | `App.jsx`, `api.js`, `sorterRuntimeService.js`. |

### `OWN-003` Classify Order Mapping versus legacy Delivery Resolution

**Severity:** CRITICAL  
**Phase:** 2 — Ownership and boundary definition  
**Status:** NOT STARTED  
**Dependencies:** SAFE-008, TEST-004, TEST-005  
**Blocks:** BE-006, DATA-002, CLEAN-001  
**Application owner:** Architecture and Order Mapping owners  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Current Order Mapping uses PostgreSQL while legacy Delivery Resolution uses SQLite `delivery_*` tables and overlapping Shopify/Shiprocket/status logic.

#### Evidence

`deliveryRepository.js`, `reconciliationService.js`, `legacyCsv.js`, and `deliveryShopify.js` import SQLite/status services; current Order Mapping uses `orderMappingRepository.js`, PostgreSQL migrations, and `orderMappingShiprocket.js`.

#### Required change

Decide whether legacy code is an adapter, migration source, supported subsystem, or retired code; map every table/route/service and preserve the `/delivery-resolution` redirect during transition.

#### Explicitly out of scope

No deletion, data migration, status remapping, or route removal.

#### Files likely affected

Ownership matrix, migration/deprecation docs, and later adapter paths.

#### Data impact

Potential data impact; migration may be required after decision.

#### Backup prerequisite

SAFE-003, SAFE-004, TEST-004, TEST-005.

#### Implementation sequence

1. Compare contracts and table semantics.
2. Identify readers/writers and historical dependencies.
3. Approve one owner and transition strategy.

#### Acceptance criteria

- Every legacy symbol has a disposition and evidence requirement.
- No deletion is approved from uncertainty.
- Current Order Mapping behavior remains protected.

#### Required validation

Static call graph, synthetic migration mapping, route regression, and owner decision.

#### Rollback plan

Keep legacy paths intact and append a superseding classification decision.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Legacy and current delivery implementations overlap. | Service and migration evidence above. |

### `OWN-004` Define SKU Image Manager boundary

**Severity:** HIGH  
**Phase:** 2 — Ownership and boundary definition  
**Status:** NOT STARTED  
**Dependencies:** OWN-001, TEST-006  
**Blocks:** BE-003, FE-005, DATA-004  
**Application owner:** SKU Image Manager  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

SKU UI and media transport/business operations share the generic shell/router and Shopify service area.

#### Evidence

`SkuImageManager.jsx` is rendered from `App.jsx`; `/api/sku-images/*` is in `api.js`; `shopifyMediaService.js` includes transport, scope policy, media use cases, retries, and audit calls.

#### Required change

Define feature UI/state, media use cases, audit ownership, upload lifecycle, Shopify scopes, routes, environment needs, and tests.

#### Explicitly out of scope

No media operation or route change.

#### Files likely affected

Ownership matrix and future SKU feature/service directories.

#### Data impact

Potential audit/runtime relocation later.

#### Backup prerequisite

SAFE-002 and TEST-006.

#### Implementation sequence

1. Separate provider transport from media policy.
2. Record audit and temp-file lifecycle.
3. Approve extraction boundary.

#### Acceptance criteria

- SKU routes and audit files have one owner.
- Shopify transport dependencies are explicit.
- Scope failures and uploads have documented owners.

#### Required validation

Static imports, route matrix, mocked media contract tests, and owner sign-off.

#### Rollback plan

Leave current component/router intact and correct only the ownership record.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | SKU feature is not isolated from shared shell/router. | `SkuImageManager.jsx`, `api.js`, `shopifyMediaService.js`. |

### `OWN-005` Define Actual Sales Intelligence boundary

**Severity:** HIGH  
**Phase:** 2 — Ownership and boundary definition  
**Status:** NOT STARTED  
**Dependencies:** OWN-001, TEST-007  
**Blocks:** BE-004, DATA-005, DOC-003  
**Application owner:** Actual Sales Intelligence  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Sales reconciliation is a backend service/API surface, but its status as a user-facing app and ownership of cache files are not explicit.

#### Evidence

`actualSalesService.js` owns three JSON caches and analytics slices; `client/src/api.js` exposes calls, but no dedicated Sales Intelligence view is present in current `App.jsx`.

#### Required change

Define service/API ownership, cache lifecycle, Shopify/Shiprocket dependencies, consumer status, and future UI decision.

#### Explicitly out of scope

No dashboard rebuild, cache refresh, or route removal.

#### Files likely affected

Ownership matrix, service docs, future sales router boundary.

#### Data impact

Potential cache relocation later; no current data change.

#### Backup prerequisite

SAFE-002 and TEST-007.

#### Implementation sequence

1. Trace consumers and exports.
2. Assign cache ownership and retention.
3. Record whether user-facing status is deferred.

#### Acceptance criteria

- Every sales route and cache has one owner.
- User-facing status is explicitly decided or deferred.
- Provider and data dependencies are listed.

#### Required validation

Static import/route review, synthetic API tests, and owner sign-off.

#### Rollback plan

Retain current service and append a corrected ownership decision.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Backend sales ownership is clear enough to map but not formally approved. | `actualSalesService.js`, `api.js:278-422`. |

### `OWN-006` Define System Diagnostics ownership

**Severity:** MEDIUM  
**Phase:** 2 — Ownership and boundary definition  
**Status:** NOT STARTED  
**Dependencies:** OWN-001, TEST-010  
**Blocks:** BE-009, OPS-004  
**Application owner:** Shared diagnostics  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

Diagnostics UI, sorter logs, Order Mapping logs, and Shopify debug data are coupled into the shell and separate storage systems.

#### Evidence

`App.jsx:1210-1452` renders module-specific diagnostics; `api.js:212-276` exposes sorter/debug endpoints; `orderMapping.js:75-89` exposes Order Mapping logs.

#### Required change

Define shared observability contracts and keep event production app-owned.

#### Explicitly out of scope

No logging format change, retention change, or UI extraction yet.

#### Files likely affected

Ownership matrix, logging contract, future shared diagnostics package.

#### Data impact

Potential log migration later.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Inventory event producers and stores.
2. Separate shared display contract from app event types.
3. Approve retention/sanitization owners.

#### Acceptance criteria

- Diagnostics has one display/contract owner.
- Sorter and Order Mapping data ownership remains distinct.
- Sensitive fields are marked.

#### Required validation

Static route/log review, synthetic payload checks, and security owner review.

#### Rollback plan

Retain current diagnostics and append corrected ownership.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Diagnostics are shared presentation over mixed stores. | `App.jsx`, `api.js`, `orderMapping.js`. |

### `OWN-007` Approve route ownership matrix

**Severity:** CRITICAL  
**Phase:** 2 — Ownership and boundary definition  
**Status:** NOT STARTED  
**Dependencies:** OWN-002 through OWN-006, TEST-008  
**Blocks:** BE-001, BE-005, FE-003, DOC-004  
**Application owner:** Architecture owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Generic `/api` mounting currently mixes application route families and hides ownership in one router.

#### Evidence

`app.js:20-22` mounts generic and Order Mapping routers; `api.js` contains health, Sales, sorter, and SKU routes; duplicate reorder definitions are confirmed.

#### Required change

Approve the Section 8 route-to-owner table, including aliases and future removal conditions.

#### Explicitly out of scope

No route movement or public contract change.

#### Files likely affected

This plan, route docs, and later router files.

#### Data impact

No direct data impact.

#### Backup prerequisite

SAFE-002 and TEST-008.

#### Implementation sequence

1. Review every route declaration.
2. Resolve ambiguous and duplicate handlers.
3. Sign off owner and compatibility requirements.

#### Acceptance criteria

- Every current route has exactly one provisional owner.
- Aliases and disabled labels are distinguished.
- No route is marked removable without a test/deprecation path.

#### Required validation

Static route scan, route matrix review, and contract test inventory.

#### Rollback plan

Keep the old matrix version in history and append a correction.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Route ownership is mixed in `api.js`. | Section 8; `app.js:20-22`. |

### `OWN-008` Approve data ownership matrix

**Severity:** CRITICAL  
**Phase:** 2 — Ownership and boundary definition  
**Status:** NOT STARTED  
**Dependencies:** SAFE-003, SAFE-004, SAFE-008  
**Blocks:** DATA-001, DATA-002, DATA-006, CLEAN-002  
**Application owner:** Architecture/data owners  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Runtime stores and databases have mixed or uncertain readers/writers.

#### Evidence

Section 7 documents the two SQLite paths, mixed tables, JSON/JSONL caches, PostgreSQL schema, temp uploads, and tracked tool artifacts.

#### Required change

Approve one owner, lifecycle, backup class, target location, and migration requirement for every store.

#### Explicitly out of scope

No relocation, deletion, schema change, or record dump.

#### Files likely affected

This plan and future data ownership documentation.

#### Data impact

Potential data impact in later tasks.

#### Backup prerequisite

SAFE-003 and SAFE-004.

#### Implementation sequence

1. Verify readers/writers.
2. Resolve unknowns with read-only evidence.
3. Sign off target and rollback requirements.

#### Acceptance criteria

- Every listed store has an owner or explicit unresolved decision.
- Deletion/relocation tasks depend on this approval.
- Backup requirements are objective.

#### Required validation

Static references, file inventory, schema inventory, and owner review.

#### Rollback plan

Retain old matrix and append a corrected ownership decision.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Store ownership requires backup-backed verification. | Section 7; data path evidence. |

### `OWN-009` Approve runtime file ownership

**Severity:** HIGH  
**Phase:** 2 — Ownership and boundary definition  
**Status:** NOT STARTED  
**Dependencies:** OWN-002 through OWN-006  
**Blocks:** DATA-003 through DATA-007, OPS-005 through OPS-008  
**Application owner:** Operations owner  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Runtime, generated, test, Graphify, Playwright, and Tokensave files are stored near source and some are tracked.

#### Evidence

Physical inventory includes `server/data`, `server/.cache`, `server/server/data`, `.playwright-cli`, `.tmp-playwright`, `.tokensave`, `graphify-out`, and `test-results`; tracked-file inventory confirms generated artifacts.

#### Required change

Assign each runtime/generated class to an application or tool owner and define source/runtime/temporary classification.

#### Explicitly out of scope

No cleanup, ignore-rule edit, relocation, or deletion.

#### Files likely affected

Ownership matrix and future runtime policy.

#### Data impact

Potential runtime relocation later.

#### Backup prerequisite

SAFE-002 and store-specific backups.

#### Implementation sequence

1. Classify all listed paths.
2. Record retention and recovery requirements.
3. Approve target locations and tool boundaries.

#### Acceptance criteria

- Every runtime/generated path has one owner and classification.
- Tracked artifacts are explicitly flagged.
- Unknown ownership blocks deletion.

#### Required validation

Filesystem/Git inventory and owner review.

#### Rollback plan

Append corrected classifications; do not move files in this task.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Runtime and generated files are mixed with source. | Inventory and tracked-file audit. |

### `OWN-010` Approve integration and environment ownership

**Severity:** HIGH  
**Phase:** 2 — Ownership and boundary definition  
**Status:** NOT STARTED  
**Dependencies:** OWN-002 through OWN-006  
**Blocks:** INT-001, INT-004, INT-006, SEC-004, DOC-006  
**Application owner:** Architecture/integration owners  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Shopify/Shiprocket credentials and provider logic are shared across apps, while Sales and legacy delivery use overlapping clients.

#### Evidence

`env.js:44-63` centralizes all provider variables; `shopifyService.js`, `shopifyMediaService.js`, `shiprocketService.js`, `orderMappingShiprocket.js`, and legacy services use them.

#### Required change

Approve provider client ownership, transport/business split, environment-variable owner, and compatibility obligations.

#### Explicitly out of scope

No client consolidation, credential change, or provider request.

#### Files likely affected

Ownership/integration matrices and future env docs.

#### Data impact

No direct data impact.

#### Backup prerequisite

SAFE-005 and SAFE-002.

#### Implementation sequence

1. Inventory implementations and callers.
2. Mark genuinely shared transport versus app policy.
3. Approve migration order and rollback seam.

#### Acceptance criteria

- Each integration has a target owner.
- Each environment variable has one owner and side.
- Duplicate client removal is explicitly gated by tests.

#### Required validation

Static dependency search, secret-name inventory, and integration-owner review.

#### Rollback plan

Retain current clients and append a corrected ownership decision.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Provider implementations and env requirements overlap. | `env.js`, Shopify/Shiprocket services. |

### `BE-001` Split the generic API router

**Severity:** HIGH  
**Phase:** 3 — Backend restructuring  
**Status:** NOT STARTED  
**Dependencies:** TEST-012, OWN-007  
**Blocks:** BE-002 through BE-005  
**Application owner:** Backend architecture  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

`api.js` owns diagnostics, Sales Intelligence, sorter, and SKU routes in a 1,275-line module.

#### Evidence

`server/src/routes/api.js:1-1275` imports services for all four domains and declares every route family.

#### Required change

Introduce application routers with a thin compatibility mount while preserving `/api` paths.

#### Explicitly out of scope

No public route rename, response redesign, business-rule change, or opportunistic cleanup.

#### Files likely affected

`server/src/app.js`, new app router files, compatibility tests.

#### Data impact

No direct data impact; route handlers retain existing stores.

#### Backup prerequisite

SAFE-007 and TEST-012.

#### Implementation sequence

1. Copy route ownership into tested modules.
2. Mount adapters at existing prefixes.
3. Remove old code only after contract comparison.

#### Acceptance criteria

- Each route family has one router owner.
- Existing URLs and payloads pass TEST-008.
- `app.js` remains a small mount/composition root.

#### Required validation

Static import graph, route contracts, startup test, existing-app regression, and build/parser checks.

#### Rollback plan

Restore the prior router mount from the task commit; retain data and public URLs.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Shared router mixes four app domains. | `api.js:1-1275`. |

### `BE-002` Create a Sorter router

**Severity:** HIGH  
**Phase:** 3 — Backend restructuring  
**Status:** NOT STARTED  
**Dependencies:** BE-001, OWN-002  
**Blocks:** FE-004, BE-011  
**Application owner:** Product Sorter  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Sorter route handlers currently share a module with SKU and Sales code and embed orchestration helpers.

#### Evidence

`api.js:424-1097` contains collection routes, snapshot logic, generated apply, reorder, rollback, and diagnostics.

#### Required change

Move sorter route composition and use-case calls into an owner-specific router while retaining aliases.

#### Explicitly out of scope

No scoring change, Shopify contract change, or data relocation.

#### Files likely affected

New sorter route/service modules, `app.js`, and tests.

#### Data impact

Potential runtime access change; no migration allowed in this task.

#### Backup prerequisite

SAFE-003, TEST-002, TEST-003.

#### Implementation sequence

1. Extract route calls without changing business code.
2. Add compatibility mount.
3. Compare responses and logs.

#### Acceptance criteria

- All sorter routes in Section 8 are owned by one router.
- Existing writes and rollback behavior pass tests.
- No SKU/Sales import remains in sorter router.

#### Required validation

Route, unit, mocked Shopify, SQLite fixture, and existing-app regression tests.

#### Rollback plan

Repoint `app.js` to the original router and leave extracted files unused until corrected.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Collection ownership is buried in `api.js`. | `api.js:424-1097`. |

### `BE-003` Create a SKU Image Manager router

**Severity:** HIGH  
**Phase:** 3 — Backend restructuring  
**Status:** NOT STARTED  
**Dependencies:** BE-001, OWN-004  
**Blocks:** FE-005, INT-003  
**Application owner:** SKU Image Manager  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

SKU media routes, multer configuration, validation, and error handling are embedded in the generic router.

#### Evidence

`api.js:63-75,1103-1275` defines a SKU-specific upload destination and all media operations.

#### Required change

Extract a SKU router with explicit upload limits, temp cleanup, media use-case calls, and stable errors.

#### Explicitly out of scope

No Shopify media semantics or upload policy changes.

#### Files likely affected

New SKU route module, app mount, tests.

#### Data impact

Potential temporary-file behavior only; no persistent data move.

#### Backup prerequisite

SAFE-002 and TEST-006.

#### Implementation sequence

1. Extract unchanged handlers.
2. Preserve multipart contracts.
3. Compare cleanup and audit outcomes.

#### Acceptance criteria

- All SKU routes pass existing contracts.
- Non-image and oversized uploads fail safely.
- Temp files are cleaned on success and failure.

#### Required validation

Route, mocked Shopify, upload cleanup, audit, and frontend regression tests.

#### Rollback plan

Restore generic mount and keep extracted module for correction.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | SKU upload routes are mixed in generic API. | `api.js:63-75,1103-1275`. |

### `BE-004` Create a Sales Intelligence router

**Severity:** HIGH  
**Phase:** 3 — Backend restructuring  
**Status:** NOT STARTED  
**Dependencies:** BE-001, OWN-005  
**Blocks:** DATA-005, DOC-004  
**Application owner:** Actual Sales Intelligence  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Refresh, reconciliation, analytics slices, exports, and a legacy alias share the generic API router.

#### Evidence

`api.js:278-422` declares all Sales Intelligence routes and imports `actualSalesService.js`.

#### Required change

Extract a sales router and preserve all current route/query/CSV contracts.

#### Explicitly out of scope

No cache format, provider behavior, or user-facing dashboard change.

#### Files likely affected

New sales router, app mount, route tests.

#### Data impact

No direct data change; cache path remains until DATA-005.

#### Backup prerequisite

SAFE-002 and TEST-007.

#### Implementation sequence

1. Extract route declarations.
2. Preserve slice registry and alias.
3. Compare payloads and headers.

#### Acceptance criteria

- All sales paths remain reachable.
- Dynamic slice list is complete.
- Errors do not expose provider secrets.

#### Required validation

Route contracts, synthetic cache tests, CSV tests, startup, and regression gate.

#### Rollback plan

Restore generic route mount and preserve cache files.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Sales API is embedded in generic router. | `api.js:278-422`. |

### `BE-005` Preserve existing backend URLs with adapters

**Severity:** CRITICAL  
**Phase:** 3 — Backend restructuring  
**Status:** NOT STARTED  
**Dependencies:** BE-001, TEST-008  
**Blocks:** FE-003, FINAL-002  
**Application owner:** Backend architecture  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Structural extraction can break the existing two-process client contract even if internal ownership improves.

#### Evidence

`client/src/api.js` and `orderMappingApi.js` hard-code `/api` and `/api/order-mapping`; `app.js` mounts those prefixes.

#### Required change

Keep compatibility adapters and exact status/body/header behavior until consumers migrate under tested contracts.

#### Explicitly out of scope

No route rename, versioning redesign, or frontend client rewrite.

#### Files likely affected

`server/src/app.js`, compatibility adapters, route tests.

#### Data impact

No direct data impact.

#### Backup prerequisite

SAFE-007, TEST-008.

#### Implementation sequence

1. Snapshot current route behavior.
2. Mount new routers behind existing prefixes.
3. Retain aliases until deprecation evidence exists.

#### Acceptance criteria

- All Section 8 routes pass before/after comparison.
- Existing frontend clients require no contract changes.
- Unknown routes and error envelopes remain intentional.

#### Required validation

Route contract, integration, startup, frontend, and regression-gate checks.

#### Rollback plan

Switch mounts back to the baseline router without altering data.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Compatibility is a hard migration constraint. | `app.js`, client API modules. |

### `BE-006` Create application-owned service boundaries

**Severity:** HIGH  
**Phase:** 3 — Backend restructuring  
**Status:** NOT STARTED  
**Dependencies:** OWN-002 through OWN-006  
**Blocks:** BE-007, INT-003, DATA-003 through DATA-006  
**Application owner:** Backend architecture  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Business logic, persistence, provider access, and route orchestration are interleaved across shared services.

#### Evidence

`actualSalesService.js` imports shared provider services; `reconciliationService.js` combines legacy persistence and providers; `orderMappingService.js` imports SQLite, PostgreSQL, Shopify, Shiprocket, and CSV modules.

#### Required change

Separate route/controller, application service, repository/data adapter, and provider transport responsibilities per owner.

#### Explicitly out of scope

No behavior change or new abstraction without a current caller.

#### Files likely affected

Backend app/service directories and tests.

#### Data impact

Potential data access change; no relocation in this task.

#### Backup prerequisite

SAFE-007 and regression gate.

#### Implementation sequence

1. Extract seams around existing functions.
2. Keep adapters thin and behavior-preserving.
3. Remove only proven cross-owner calls.

#### Acceptance criteria

- Each app service owns business rules for its domain.
- Repositories own persistence; transport owns provider calls.
- Boundary dependency direction is documented and tested.

#### Required validation

Static dependency graph, unit/integration contracts, route regression, and startup checks.

#### Rollback plan

Keep old service exports as compatibility adapters until all callers pass.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Services cross persistence/provider/application concerns. | Service import inventory. |

### `BE-007` Remove hidden cross-application imports

**Severity:** HIGH  
**Phase:** 3 — Backend restructuring  
**Status:** NOT STARTED  
**Dependencies:** BE-006  
**Blocks:** CLEAN-001, INT-009  
**Application owner:** Backend architecture  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Order Mapping and legacy delivery import shared Shopify/Shiprocket/status code, while generic routes import all application services.

#### Evidence

`deliveryShopify.js` imports `shopifyGraphQL` from `shopifyService.js`; `reconciliationService.js` imports `shiprocketService.js`; `orderMappingShopify.js` also imports shared Shopify service.

#### Required change

Replace hidden app-to-app dependencies with explicit shared transport or tested compatibility adapters.

#### Explicitly out of scope

No client deletion before INT-008 and no business-rule merge.

#### Files likely affected

Service imports, boundary adapters, dependency tests.

#### Data impact

No direct data impact.

#### Backup prerequisite

SAFE-007 and INT-008.

#### Implementation sequence

1. Enumerate imports and call sites.
2. Move transport-only calls behind integration boundary.
3. Keep app-specific mapping local.

#### Acceptance criteria

- No app imports another app’s business service.
- Shared dependencies are named and contract-tested.
- Legacy compatibility remains until OWN-003 is complete.

#### Required validation

Static import scan, unit contracts, mocked integrations, and regression gate.

#### Rollback plan

Restore adapter imports without deleting the old service.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Cross-owner imports are present. | Service import evidence above. |

### `BE-008` Standardize validation and error normalization

**Severity:** HIGH  
**Phase:** 3 — Backend restructuring  
**Status:** NOT STARTED  
**Dependencies:** BE-001, SEC-008  
**Blocks:** SEC-008, FINAL-004  
**Application owner:** Backend/security owners  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Routes mix ad hoc checks and often return `detail: error.message`, risking inconsistent contracts and leakage.

#### Evidence

`api.js` repeatedly returns raw `detail`; `orderMapping.js:29-34` has a separate `errorResponse`; client APIs parse different error fields.

#### Required change

Introduce a small shared error/validation contract with app-specific codes and sanitized external error mapping.

#### Explicitly out of scope

No payload redesign beyond compatibility fields and no new dependency unless proven necessary.

#### Files likely affected

Shared backend error/validation modules, route handlers, tests.

#### Data impact

No direct data impact.

#### Backup prerequisite

SAFE-002 and TEST-008.

#### Implementation sequence

1. Inventory current error payloads.
2. Define compatibility envelope and validation rules.
3. Migrate one router at a time.

#### Acceptance criteria

- Invalid input returns stable 4xx codes.
- Provider and database errors are sanitized.
- Client compatibility tests pass.

#### Required validation

Unit, route negative tests, security review, and regression gate.

#### Rollback plan

Retain old response adapter while reverting internal error mapping.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Error handling is inconsistent and potentially too verbose. | `api.js`, `orderMapping.js`, client API modules. |

### `BE-009` Standardize structured logging

**Severity:** MEDIUM  
**Phase:** 3 — Backend restructuring  
**Status:** NOT STARTED  
**Dependencies:** OWN-006, BE-006  
**Blocks:** OPS-004, SEC-006  
**Application owner:** Operations/diagnostics  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

Console logging, SQLite sorter logs, and PostgreSQL network logs use different shapes and may include provider details.

#### Evidence

`utils/logger.js` is used alongside direct `console.log`; `sorterRuntimeService.js` and `orderMappingRepository.js` persist separate log schemas.

#### Required change

Define a structured, redacted event contract while keeping app-specific event meanings and existing diagnostics compatibility.

#### Explicitly out of scope

No centralized external logging service or unbounded log migration.

#### Files likely affected

Logger, event adapters, diagnostics routes/tests.

#### Data impact

Potential log format impact; retention handled by DATA-011.

#### Backup prerequisite

SAFE-002 and OWN-006.

#### Implementation sequence

1. Inventory fields and sensitive values.
2. Define common envelope.
3. Adapt producers and consumers incrementally.

#### Acceptance criteria

- Events have timestamp, app, operation, status, and redacted context.
- Existing diagnostics can still render required fields.
- Sensitive tokens/records never log.

#### Required validation

Unit log-shape tests, redaction tests, route checks, and manual diagnostics review.

#### Rollback plan

Keep old logger adapters and revert producer migration only.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Logging is split across console and two persistence systems. | `logger.js`, runtime/repository services. |

### `BE-010` Isolate startup migrations and side effects

**Severity:** CRITICAL  
**Phase:** 3 — Backend restructuring  
**Status:** NOT STARTED  
**Dependencies:** TEST-009, SAFE-004  
**Blocks:** DATA-006, OPS-002, FINAL-002  
**Application owner:** Backend/data owners  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Importing the database module creates/alter tables, and server startup runs Order Mapping migrations, primes auth, fetches Shopify counts, and checks scopes.

#### Evidence

`database.js:6-97`; `index.js:17-30`; `orderMappingMigrations.js:8-37`.

#### Required change

Make migration execution explicit and isolate optional provider diagnostics from process startup, with compatibility-preserving operational commands.

#### Explicitly out of scope

No migration execution in this task, no schema change, and no live server start.

#### Files likely affected

Startup, migration runner, database initialization, scripts, tests.

#### Data impact

Potential database impact; backup and restore mandatory.

#### Backup prerequisite

SAFE-003, SAFE-004, SAFE-007, TEST-009.

#### Implementation sequence

1. Separate pure connection/init from migration command.
2. Add explicit startup policy.
3. Preserve current production procedure through documented command.

#### Acceptance criteria

- Server startup has no hidden schema mutation.
- Migration failures are explicit and recoverable.
- Optional Shopify checks do not hide failures.

#### Required validation

Migration tests, startup tests, route health, database integrity, and regression gate.

#### Rollback plan

Restore prior startup sequence from task commit while preserving backups.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Startup side effects are confirmed. | `index.js`, `database.js`, migration service. |

### `BE-011` Resolve duplicate collection reorder handlers

**Severity:** CRITICAL  
**Phase:** 3 — Backend restructuring  
**Status:** NOT STARTED  
**Dependencies:** TEST-003, BE-002, BE-005  
**Blocks:** CLEAN-003  
**Application owner:** Product Sorter  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Two handlers are registered for the same method/path; the first redirects while the second contains legacy bulk logic.

#### Evidence

`server/src/routes/api.js:1021-1065`.

#### Required change

Choose one canonical implementation, retain a tested compatibility adapter if needed, and remove ambiguity only after route/write tests pass.

#### Explicitly out of scope

No change to Shopify reorder semantics without TEST-003 evidence.

#### Files likely affected

Sorter router/compatibility handler and tests.

#### Data impact

Potential Shopify write impact; no data move.

#### Backup prerequisite

SAFE-007, TEST-002, TEST-003.

#### Implementation sequence

1. Compare both implementations.
2. Select canonical v2 behavior.
3. Keep `/reorder-all` adapter and delete duplicate only after validation.

#### Acceptance criteria

- One handler owns each method/path.
- Alias behavior is explicit and tested.
- No duplicate side effects remain.

#### Required validation

Static duplicate scan, route contracts, mocked Shopify jobs, and existing-app regression.

#### Rollback plan

Restore the prior handler file from the task commit; do not restore data automatically.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Active duplicate route definitions are a critical ambiguity. | `api.js:1021-1065`. |

### `FE-001` Extract the application shell

**Severity:** HIGH  
**Phase:** 4 — Frontend restructuring  
**Status:** NOT STARTED  
**Dependencies:** TEST-011, OWN-001  
**Blocks:** FE-002 through FE-004  
**Application owner:** Frontend architecture  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

`App.jsx` combines shell layout, navigation, sorter state, SKU state bridge, Order Mapping diagnostics, and feature rendering in 2,086 lines.

#### Evidence

`client/src/App.jsx:1-2086`; component size is the largest frontend source file.

#### Required change

Extract a thin shell that composes route, navigation, diagnostics, and feature boundaries without moving business rules opportunistically.

#### Explicitly out of scope

No visual redesign, route change, or feature behavior change.

#### Files likely affected

`client/src/App.jsx`, new shell/feature files, tests.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002 and TEST-011.

#### Implementation sequence

1. Freeze navigation behavior.
2. Extract composition-only code.
3. Move one feature at a time behind existing props/contracts.

#### Acceptance criteria

- Shell contains no sorter/SKU business algorithms.
- Current modules and diagnostics render unchanged.
- No duplicate global state owner is introduced.

#### Required validation

Frontend unit/E2E, route, accessibility, build, and existing-app regression checks.

#### Rollback plan

Restore `App.jsx` composition and keep extracted components unused.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Shared shell is oversized and multi-owned. | `App.jsx`, 2,086 lines. |

### `FE-002` Extract navigation ownership

**Severity:** HIGH  
**Phase:** 4 — Frontend restructuring  
**Status:** NOT STARTED  
**Dependencies:** FE-001, OWN-007  
**Blocks:** FE-003, FE-011  
**Application owner:** Frontend shell  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Sidebar labels, enabled flags, active state, and diagnostics selection live inside the shared shell.

#### Evidence

`App.jsx:6-14,346,1218-1228`.

#### Required change

Create navigation configuration and rendering owned by the shell, distinguishing executable routes from disabled placeholders.

#### Explicitly out of scope

No new application or placeholder activation.

#### Files likely affected

Shell/navigation files and frontend tests.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002, TEST-011.

#### Implementation sequence

1. Extract current configuration unchanged.
2. Link items to route IDs.
3. Add disabled/unavailable behavior tests.

#### Acceptance criteria

- Navigation has one owner.
- Disabled labels cannot render nonexistent code.
- Active state is derived from explicit route/module state.

#### Required validation

Browser navigation, accessibility, route, and regression tests.

#### Rollback plan

Restore inline navigation rendering.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Navigation is hard-coded in App. | `App.jsx:6-14,1218-1228`. |

### `FE-003` Introduce explicit routing while preserving URLs

**Severity:** HIGH  
**Phase:** 4 — Frontend restructuring  
**Status:** NOT STARTED  
**Dependencies:** TEST-008, FE-001  
**Blocks:** FE-006, FINAL-002  
**Application owner:** Frontend shell  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

`main.jsx` manually selects the root component by pathname and rewrites `/delivery-resolution` with history APIs.

#### Evidence

`client/src/main.jsx:7-15`; no routing dependency or route configuration exists.

#### Required change

Introduce the smallest explicit route table compatible with the current two-process Vite/Express setup, preserving `/`, `/order-mapping`, and redirect behavior.

#### Explicitly out of scope

No URL redesign, new dependency unless necessary, or Meta route.

#### Files likely affected

`main.jsx`, shell/router files, server static fallback tests.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002, TEST-008, TEST-011.

#### Implementation sequence

1. Write route compatibility tests.
2. Add explicit route mapping.
3. Verify browser refresh and server fallback.

#### Acceptance criteria

- Current URLs resolve to the same features.
- Unknown/disabled routes fail safely.
- Server static fallback does not swallow API paths.

#### Required validation

Browser, route, static fallback, build, and regression checks.

#### Rollback plan

Restore pathname selector and server fallback behavior.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Frontend routing is manual. | `main.jsx:7-15`; `app.js:24-32`. |

### `FE-004` Extract the Sorter feature

**Severity:** HIGH  
**Phase:** 4 — Frontend restructuring  
**Status:** NOT STARTED  
**Dependencies:** FE-001, OWN-002, TEST-001, TEST-002  
**Blocks:** FE-007, FE-009  
**Application owner:** Product Sorter  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Sorter scoring helpers, state, API actions, tables, diagnostics, and view markup are all in `App.jsx`.

#### Evidence

`App.jsx:47-345` contains scoring helpers; `346-1101` contains state/actions; `1455-2071` renders the sorter.

#### Required change

Move sorter feature code into an app-owned module while keeping API calls, state transitions, and visual behavior compatible.

#### Explicitly out of scope

No scoring algorithm, CSS redesign, or backend contract change.

#### Files likely affected

New sorter feature files, `App.jsx`, API client imports, tests.

#### Data impact

No direct data impact.

#### Backup prerequisite

TEST-001, TEST-002, TEST-011.

#### Implementation sequence

1. Extract pure helpers.
2. Extract state/actions.
3. Extract view and retain shell bridge.

#### Acceptance criteria

- Sorter feature is independently importable.
- Existing actions and diagnostics pass regression tests.
- Shared shell has no sorter-specific mutation logic.

#### Required validation

Unit, browser, API mock, route, build, and full regression checks.

#### Rollback plan

Restore sorter branch in `App.jsx` and remove only unused extracted files.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Sorter dominates App state and markup. | `App.jsx:47-345,346-1101,1455-2071`. |

### `FE-005` Extract the SKU Image Manager feature

**Severity:** HIGH  
**Phase:** 4 — Frontend restructuring  
**Status:** NOT STARTED  
**Dependencies:** FE-001, OWN-004, TEST-006  
**Blocks:** FE-007, FE-009  
**Application owner:** SKU Image Manager  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

The 1,362-line SKU component owns search, selection, media editor, bulk actions, diagnostics, and notifications while receiving a shell bridge.

#### Evidence

`client/src/SkuImageManager.jsx:98-849`.

#### Required change

Extract an app-owned feature with a narrow diagnostics/event interface and dedicated API client.

#### Explicitly out of scope

No media behavior, route, or styling redesign.

#### Files likely affected

SKU feature components/hooks/API client and `App.jsx`.

#### Data impact

No direct data impact.

#### Backup prerequisite

TEST-006 and SAFE-002.

#### Implementation sequence

1. Freeze action contracts.
2. Extract state and action orchestration.
3. Extract view and shell bridge.

#### Acceptance criteria

- SKU feature does not import sorter or Order Mapping state.
- All actions retain loading/error/audit behavior.
- Shell bridge is minimal and documented.

#### Required validation

Component/unit, browser media flows with mocks, accessibility, and regression checks.

#### Rollback plan

Restore the current `SkuImageManager` import/render path.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | SKU feature is large and shell-coupled. | `SkuImageManager.jsx:98-849`. |

### `FE-006` Retain Order Mapping compatibility boundary

**Severity:** HIGH  
**Phase:** 4 — Frontend restructuring  
**Status:** NOT STARTED  
**Dependencies:** FE-003, OWN-003  
**Blocks:** FINAL-002  
**Application owner:** Order Mapping  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Order Mapping is a separate root component but shares global styles and direct pathname behavior with the shell.

#### Evidence

`main.jsx:4,11`; `OrderMapping.jsx` imports `orderMappingApi.js` and `orderMapping.css`; `app.js` mounts a separate API router.

#### Required change

Preserve `/order-mapping` as an independently owned feature/route while introducing explicit shell composition.

#### Explicitly out of scope

No Order Mapping UX or API change.

#### Files likely affected

Route composition, Order Mapping entry, styles, browser tests.

#### Data impact

No data impact.

#### Backup prerequisite

TEST-004, TEST-005, TEST-008, TEST-011.

#### Implementation sequence

1. Keep direct route adapter.
2. Mount feature through explicit route boundary.
3. Verify sync, pagination, errors, and CSS isolation.

#### Acceptance criteria

- `/order-mapping` remains reachable directly and through refresh.
- Its API client/state do not depend on sorter state.
- Redirect compatibility remains.

#### Required validation

Browser, route, API contract, accessibility, and existing-app regression tests.

#### Rollback plan

Use the original direct root selection.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Order Mapping has partial isolation but shared entry/styles. | `main.jsx`, `OrderMapping.jsx`. |

### `FE-007` Separate application state

**Severity:** HIGH  
**Phase:** 4 — Frontend restructuring  
**Status:** NOT STARTED  
**Dependencies:** FE-004 through FE-006  
**Blocks:** FE-010, FE-011  
**Application owner:** Frontend architecture  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

`App.jsx` owns sorter state plus SKU and Order Mapping diagnostic bridges and conditional log selection.

#### Evidence

`App.jsx:346-444,1111-1174,1201-1429`.

#### Required change

Give each app local state and expose only typed/narrow shell events for shared diagnostics.

#### Explicitly out of scope

No state library or global store addition.

#### Files likely affected

Feature hooks/state modules and shell bridge types/contracts.

#### Data impact

No data impact.

#### Backup prerequisite

TEST-011 and FE-004 through FE-006.

#### Implementation sequence

1. List state variables by owner.
2. Move local state with tests.
3. Keep shell state limited to route/diagnostic composition.

#### Acceptance criteria

- Switching modules does not mutate unrelated app state.
- Diagnostics events have explicit producer/consumer contracts.
- No shared mutable singleton is introduced.

#### Required validation

Component tests, navigation tests, stale-state checks, and regression gate.

#### Rollback plan

Restore previous state bridge and feature props.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Shared shell owns multiple app state surfaces. | `App.jsx` state/bridge ranges. |

### `FE-008` Separate frontend API clients

**Severity:** HIGH  
**Phase:** 4 — Frontend restructuring  
**Status:** NOT STARTED  
**Dependencies:** FE-004 through FE-006, BE-005  
**Blocks:** FE-011  
**Application owner:** Frontend architecture  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

`client/src/api.js` mixes sorter, SKU, Sales Intelligence, diagnostics, and legacy aliases; Order Mapping has a separate client.

#### Evidence

`client/src/api.js:22-143`; `orderMappingApi.js:24-63`.

#### Required change

Split app-owned clients over a shared request/error primitive, preserving paths and response parsing.

#### Explicitly out of scope

No API contract redesign or query/cache library.

#### Files likely affected

Frontend API modules and tests.

#### Data impact

No data impact.

#### Backup prerequisite

TEST-007, TEST-008, BE-005.

#### Implementation sequence

1. Inventory methods by owner.
2. Extract shared request behavior.
3. Add client contract tests and switch imports.

#### Acceptance criteria

- No app imports another app’s client methods.
- Error parsing remains compatible.
- FormData and CSV/download behavior remain intact.

#### Required validation

Unit/API mock, route, browser, and regression tests.

#### Rollback plan

Restore imports from the original clients.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Shared frontend API client mixes domains. | `api.js`, `orderMappingApi.js`. |

### `FE-009` Isolate styles and remove global leakage

**Severity:** MEDIUM  
**Phase:** 4 — Frontend restructuring  
**Status:** NOT STARTED  
**Dependencies:** FE-001, FE-004 through FE-006  
**Blocks:** FE-011  
**Application owner:** Frontend architecture  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

`styles.css` is 1,503 lines and Order Mapping adds a separate stylesheet, so global selectors can affect unrelated applications.

#### Evidence

`client/src/styles.css`, `client/src/orderMapping.css`, `main.jsx:5`.

#### Required change

Define shell/shared tokens and app-scoped styles, preserving current visual behavior.

#### Explicitly out of scope

No visual redesign or wholesale formatting rewrite.

#### Files likely affected

CSS modules/files and feature class names/tests.

#### Data impact

No data impact.

#### Backup prerequisite

TEST-011.

#### Implementation sequence

1. Inventory global selectors.
2. Scope app-specific selectors.
3. Verify mobile and desktop layouts.

#### Acceptance criteria

- App styles do not unintentionally target another feature.
- Shared tokens remain centralized.
- Existing visual regression checks pass.

#### Required validation

Static CSS scan, browser screenshots, accessibility, and regression checks.

#### Rollback plan

Restore prior stylesheet import/class mapping.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Large global stylesheet surface is not ownership-scoped. | `styles.css`, `orderMapping.css`. |

### `FE-010` Add feature error and loading boundaries

**Severity:** HIGH  
**Phase:** 4 — Frontend restructuring  
**Status:** NOT STARTED  
**Dependencies:** FE-003, FE-007  
**Blocks:** FINAL-001  
**Application owner:** Frontend architecture  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Loading/error handling is mostly component-local and can allow one feature’s failure to affect the shared shell.

#### Evidence

`App.jsx` owns shared diagnostics/error state; `OrderMapping.jsx` and `SkuImageManager.jsx` maintain independent error/loading states but no route-level boundary is present.

#### Required change

Add route/feature-level error and loading boundaries with accessible fallback states.

#### Explicitly out of scope

No error message redesign beyond safe/specific user-facing behavior.

#### Files likely affected

Shell boundary components, feature routes, tests.

#### Data impact

No data impact.

#### Backup prerequisite

TEST-011.

#### Implementation sequence

1. Define failure ownership.
2. Add boundaries around each feature.
3. Test recovery/navigation after failure.

#### Acceptance criteria

- A feature failure does not blank unrelated navigation.
- Loading states are route-local and accessible.
- Retry/reload behavior is explicit.

#### Required validation

Browser failure injection, accessibility, route, and regression tests.

#### Rollback plan

Remove boundaries and restore existing local fallbacks.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | No explicit route-level failure boundary exists. | Frontend entry/components. |

### `FE-011` Add frontend regression tests and classify placeholders

**Severity:** HIGH  
**Phase:** 4 — Frontend restructuring  
**Status:** NOT STARTED  
**Dependencies:** FE-002 through FE-010  
**Blocks:** CLEAN-004, FINAL-001  
**Application owner:** Frontend architecture  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

There are no frontend component/browser tests for the shell, navigation, sorter, SKU, or disabled labels.

#### Evidence

Only `client/src/api.test.js` exists; `App.jsx` contains disabled `meta-ads`, analytics, inventory, reports, and settings labels.

#### Required change

Add critical navigation/feature tests and explicitly classify disabled placeholders as future documentation or remove them in a later ownership-approved cleanup.

#### Explicitly out of scope

No Meta rebuild and no placeholder activation.

#### Files likely affected

Frontend tests, test configuration, and navigation documentation.

#### Data impact

No data impact.

#### Backup prerequisite

TEST-011.

#### Implementation sequence

1. Test current behavior.
2. Add tests after each feature extraction.
3. Record placeholder disposition for CLEAN-004.

#### Acceptance criteria

- Critical flows have repeatable frontend tests.
- Disabled items have no executable owner claim.
- Test failures block completion of FE work.

#### Required validation

Unit, browser, accessibility, route, build, and regression checks.

#### Rollback plan

Remove only test additions and retain placeholder classification history.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Frontend regression coverage is insufficient. | Test inventory and `App.jsx:6-14`. |

### `INT-001` Inventory and contract Shopify clients

**Severity:** HIGH  
**Phase:** 5 — Integration consolidation  
**Status:** NOT STARTED  
**Dependencies:** OWN-010  
**Blocks:** INT-002, INT-003  
**Application owner:** Shopify integration  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Shopify transport is duplicated and behavior differs between general, media, legacy delivery, and Order Mapping callers.

#### Evidence

`shopifyService.js:4-67` and `shopifyMediaService.js:27-76` each implement GraphQL request logic; `deliveryShopify.js` and `orderMappingShopify.js` import the general client.

#### Required change

Inventory query/mutation callers, auth, API version, retries, throttle handling, error mapping, logging, and write semantics.

#### Explicitly out of scope

No client consolidation or live request.

#### Files likely affected

Integration matrix, call-site inventory, future contract tests.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-005 and TEST-003/006.

#### Implementation sequence

1. List all callers and provider operations.
2. Compare behavior.
3. Mark shared transport candidates and app-owned policies.

#### Acceptance criteria

- All Shopify implementations/callers are listed.
- Writes are separately identified from reads.
- No secret values are captured.

#### Required validation

Static search, contract review, mocked request fixtures, and owner sign-off.

#### Rollback plan

Retain both clients and append corrected inventory.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Duplicate Shopify request implementations confirmed. | `shopifyService.js`, `shopifyMediaService.js`. |

### `INT-002` Define shared Shopify transport

**Severity:** HIGH  
**Phase:** 5 — Integration consolidation  
**Status:** NOT STARTED  
**Dependencies:** INT-001, TEST-003  
**Blocks:** INT-003, INT-007, INT-009  
**Application owner:** Shopify integration  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Provider authentication, GraphQL HTTP/error handling, retry/throttle behavior, and logging are not centralized.

#### Evidence

General client logs variables and throttle; media client retries and handles throttle separately; both use `shopifyAuth.js`.

#### Required change

Create a transport-only client for auth, request, retry/throttle, error normalization, and redacted logging.

#### Explicitly out of scope

No app-specific queries, business rules, or API version upgrade.

#### Files likely affected

Shopify integration module, existing clients as adapters, tests.

#### Data impact

No direct data impact; write risk is external.

#### Backup prerequisite

SAFE-007 and INT-001.

#### Implementation sequence

1. Freeze current provider fixtures.
2. Implement transport behind old exports.
3. Migrate read then write callers.

#### Acceptance criteria

- Transport contains no sorter/SKU/order-mapping business logic.
- Retry/throttle/error behavior is consistent and tested.
- Existing write contracts pass.

#### Required validation

Mocked integration, route, Shopify contract, redaction, and existing-app regression tests.

#### Rollback plan

Switch adapters back to their baseline clients.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Shared Shopify transport is a target, not current fact. | Client inventory. |

### `INT-003` Keep Shopify business logic app-owned

**Severity:** HIGH  
**Phase:** 5 — Integration consolidation  
**Status:** NOT STARTED  
**Dependencies:** INT-002, OWN-002 through OWN-005  
**Blocks:** INT-009, CLEAN-009  
**Application owner:** Sorter, SKU, Order Mapping, Sales  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

The same Shopify service area serves collection placement, media management, order retrieval, sales, and legacy delivery.

#### Evidence

`shopifyService.js` exports collections, metrics, orders, reorder, and counts; `shopifyMediaService.js` owns media use cases.

#### Required change

Keep query/use-case mapping in app modules and call only the shared transport.

#### Explicitly out of scope

No query optimization or business-rule change.

#### Files likely affected

App service modules, Shopify transport adapters, tests.

#### Data impact

Potential external Shopify read/write risk; no local data move.

#### Backup prerequisite

INT-002, TEST-002, TEST-006, TEST-007.

#### Implementation sequence

1. Separate operation names by owner.
2. Move mapping/pagination into app services.
3. Verify response normalization per app.

#### Acceptance criteria

- Transport is reusable without app imports.
- App modules own business semantics.
- Each app’s provider contract remains green.

#### Required validation

Mocked integration, service unit, route, and regression tests.

#### Rollback plan

Restore old service exports as adapters.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Shopify business logic spans multiple consumers. | Service export/import inventory. |

### `INT-004` Inventory and contract Shiprocket clients

**Severity:** HIGH  
**Phase:** 5 — Integration consolidation  
**Status:** NOT STARTED  
**Dependencies:** OWN-010, TEST-004  
**Blocks:** INT-005, INT-006  
**Application owner:** Shiprocket integration  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Sales/legacy and Order Mapping use separate Shiprocket clients with different logging/retry behavior.

#### Evidence

`shiprocketService.js:1-54` and `orderMappingShiprocket.js:1-225` each implement auth, retry, pagination/request mapping, and network handling.

#### Required change

Inventory endpoints, auth modes, status fields, retry/rate-limit behavior, logs, and app-specific mapping.

#### Explicitly out of scope

No provider call, token rotation, or status semantic change.

#### Files likely affected

Integration matrix, client contract fixtures, future transport module.

#### Data impact

No direct data impact.

#### Backup prerequisite

SAFE-005 and TEST-004.

#### Implementation sequence

1. Compare request/response and retry semantics.
2. Identify transport-only common behavior.
3. Record app-owned status/mapping rules.

#### Acceptance criteria

- All Shiprocket implementations and callers are listed.
- Status mapping ownership is explicit.
- Secrets are not captured.

#### Required validation

Static search, synthetic provider fixtures, status tests, and owner review.

#### Rollback plan

Retain both clients and append corrected inventory.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Duplicate Shiprocket clients confirmed. | `shiprocketService.js`, `orderMappingShiprocket.js`. |

### `INT-005` Define shared Shiprocket transport

**Severity:** HIGH  
**Phase:** 5 — Integration consolidation  
**Status:** NOT STARTED  
**Dependencies:** INT-004  
**Blocks:** INT-006 through INT-009  
**Application owner:** Shiprocket integration  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Auth refresh, timeout, retries, 429 handling, errors, and network logs differ between clients.

#### Evidence

The two implementations use separate request functions and one writes Order Mapping network logs directly.

#### Required change

Create transport-only auth/request/retry/error primitives; retain app-specific shipment mapping and status logic.

#### Explicitly out of scope

No change to terminal status classification or refresh policy until INT-010.

#### Files likely affected

Shiprocket integration module, adapters, tests.

#### Data impact

Potential network-log schema impact; no customer data move.

#### Backup prerequisite

SAFE-007 and TEST-004.

#### Implementation sequence

1. Freeze synthetic responses.
2. Add shared request layer behind old exports.
3. Migrate one consumer at a time.

#### Acceptance criteria

- Auth/retry/error rules are consistent.
- App-specific network metadata remains available.
- No raw credentials/log payloads leak.

#### Required validation

Mocked provider tests, timeout/429/401 cases, logs, and regression gate.

#### Rollback plan

Switch consumers to baseline clients.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Shiprocket transport behavior is duplicated. | Client source inventory. |

### `INT-006` Standardize integration authentication and env ownership

**Severity:** CRITICAL  
**Phase:** 5 — Integration consolidation  
**Status:** NOT STARTED  
**Dependencies:** SEC-003, SEC-004, INT-001, INT-004  
**Blocks:** INT-009, SEC-005  
**Application owner:** Security/integration owners  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Root/server env loading and provider fallbacks make credential ownership and runtime requirements ambiguous.

#### Evidence

`env.js:7-22` loads two dotenv files; `env.js:44-63` includes token, password, access-token, and database fields; auth caches exist.

#### Required change

Define one server-side credential loading contract, application ownership, validation, fallback policy, and redaction policy.

#### Explicitly out of scope

No credential rotation or secret value capture.

#### Files likely affected

Config/integration modules, env schema, tests/docs.

#### Data impact

Potential auth/runtime behavior impact.

#### Backup prerequisite

SAFE-005 and TEST-010.

#### Implementation sequence

1. Inventory names only.
2. Define required/optional per app.
3. Add compatibility loaders and tests.

#### Acceptance criteria

- Credentials remain backend-only.
- Each variable has an owner and validation rule.
- Missing credentials fail only the owning capability as intended.

#### Required validation

Environment matrix, secret scan, startup, auth mock, and route regression tests.

#### Rollback plan

Restore prior env loader while preserving secret archive.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Auth ownership and dotenv layering need formalization. | `env.js`, auth services. |

### `INT-007` Standardize retries, rate limits, and errors

**Severity:** HIGH  
**Phase:** 5 — Integration consolidation  
**Status:** NOT STARTED  
**Dependencies:** INT-002, INT-005  
**Blocks:** INT-009, INT-010  
**Application owner:** Integration owner  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Provider clients implement different retry counts, backoff, timeout, throttle handling, and error categories.

#### Evidence

Shopify media retries 4 times; general Shopify client has no equivalent retry loop; Shiprocket clients differ in retry-after/logging behavior.

#### Required change

Define bounded retry, timeout, rate-limit, idempotency, and normalized error policies per operation class.

#### Explicitly out of scope

No unbounded queue, global retry worker, or provider write policy change.

#### Files likely affected

Integration transport modules and tests.

#### Data impact

Potential external write duplication risk; idempotency must be tested.

#### Backup prerequisite

SAFE-007 and INT-008.

#### Implementation sequence

1. Classify read/write operations.
2. Implement bounded policy.
3. Assert no retry of unsafe non-idempotent calls without a key/guard.

#### Acceptance criteria

- Retry behavior is bounded and observable.
- 401/429/5xx/timeout errors map consistently.
- Rate-limit handling respects provider signals.

#### Required validation

Mocked failure matrix, idempotency tests, logs, and integration regression.

#### Rollback plan

Use baseline client adapters.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Retry/rate-limit behavior differs across clients. | Shopify/Shiprocket source inventory. |

### `INT-008` Add deterministic integration mocks

**Severity:** HIGH  
**Phase:** 5 — Integration consolidation  
**Status:** NOT STARTED  
**Dependencies:** INT-002, INT-005, TEST-012  
**Blocks:** INT-009, INT-010  
**Application owner:** Test/integration owners  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Existing tests either use pure helpers or a live PostgreSQL connection; provider boundary mocks are not a standard fixture.

#### Evidence

`deliveryRepository.test.js` creates a live schema from `DATABASE_URL`; no Shopify/Shiprocket mock package or route harness is present.

#### Required change

Add deterministic provider doubles for auth, pagination, throttling, failures, writes, and response payloads.

#### Explicitly out of scope

No dependency install unless current tooling is insufficient; no live calls.

#### Files likely affected

Test fixtures/harness and integration tests.

#### Data impact

No production data impact.

#### Backup prerequisite

SAFE-002 and disposable database prerequisites.

#### Implementation sequence

1. Define provider fixture contract.
2. Use it in service/route tests.
3. Fail tests if real endpoints are attempted.

#### Acceptance criteria

- Provider tests are deterministic and network-free.
- Success/failure/throttle/auth cases are covered.
- Fixtures contain no secrets or customer data.

#### Required validation

Unit/integration tests, network denial, and regression gate.

#### Rollback plan

Remove fixture harness and restore prior test imports.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Provider mocks are missing. | Test inventory and live DB test evidence. |

### `INT-009` Remove duplicate clients after usage proof

**Severity:** HIGH  
**Phase:** 5 — Integration consolidation  
**Status:** NOT STARTED  
**Dependencies:** INT-003, INT-007, INT-008  
**Blocks:** CLEAN-009  
**Application owner:** Integration owner  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Duplicate clients are maintenance drift, but premature deletion could break legacy or app-specific behavior.

#### Evidence

Separate Shopify and Shiprocket implementations have distinct retry/logging/mapping behaviors.

#### Required change

Remove obsolete clients only after static caller proof, contract tests, and owner approval.

#### Explicitly out of scope

No deletion before all dependencies and validation pass.

#### Files likely affected

Integration modules and import sites.

#### Data impact

No direct data impact; provider regression risk.

#### Backup prerequisite

SAFE-007 and INT-008.

#### Implementation sequence

1. Prove zero callers or replace them.
2. Run full integration/regression gate.
3. Delete only the proven duplicate and update docs.

#### Acceptance criteria

- No live caller depends on removed implementation.
- Provider contracts and app behavior are unchanged.
- Rollback commit is identified.

#### Required validation

Static import scan, unit/integration, route, provider mocks, and regression gate.

#### Rollback plan

Restore the removed module from the task commit if any contract fails.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Duplicate deletion must wait for usage proof. | INT-001 through INT-008. |

### `INT-010` Verify provider contracts and API-version compatibility

**Severity:** HIGH  
**Phase:** 5 — Integration consolidation  
**Status:** NOT STARTED  
**Dependencies:** INT-008, BE-005  
**Blocks:** FINAL-004, META-003  
**Application owner:** Integration owner  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Provider contract drift can break Shopify writes, Order Mapping matching, or Shiprocket status interpretation during consolidation.

#### Evidence

Shopify API version defaults in `env.js:56`; reorder job polling is in `shopifyService.js:505-554`; status aliases are in `orderMappingStatus.js:69-203`.

#### Required change

Pin and test provider operation contracts, API versions, status mappings, and compatibility adapters.

#### Explicitly out of scope

No provider version upgrade or production call.

#### Files likely affected

Integration contract fixtures/docs/tests.

#### Data impact

Potential external write/status impact.

#### Backup prerequisite

SAFE-007 and provider mocks.

#### Implementation sequence

1. Inventory current versions/fields.
2. Add contract fixtures and expected mappings.
3. Gate consolidation and future Meta transport on results.

#### Acceptance criteria

- Required fields and errors are asserted.
- Shopify reorder job completion is verified in tests.
- Shiprocket statuses map exactly, including terminal states.

#### Required validation

Mocked integration, route, status, and regression checks.

#### Rollback plan

Keep baseline transports and mappings until contract issues are resolved.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Provider behavior needs explicit compatibility evidence. | Shopify/Shiprocket service and status files. |

### `DATA-001` Resolve ambiguous SQLite database paths

**Severity:** CRITICAL  
**Phase:** 6 — Data and runtime architecture  
**Status:** BLOCKED  
**Dependencies:** SAFE-003, OWN-008  
**Blocks:** DATA-003, DATA-008, CLEAN-002  
**Application owner:** Data owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

`server/data/app.db` is the default while `server/server/data/app.db` also exists, and their ownership/relationship is unknown.

#### Evidence

`env.js:32-41` resolves the default; physical inventory found both files; only `server/data` is ignored by `.gitignore`, while the nested database is tracked.

#### Required change

Compare schema/metadata safely, identify active readers/writers, choose one canonical path, and retain the other until backed up and dispositioned.

#### Explicitly out of scope

No deletion, merge, record exposure, or runtime path change before SAFE-007 and OWN-008.

#### Files likely affected

Config, ignore rules, data migration tooling, and external backup records.

#### Data impact

Database migration required.

#### Backup prerequisite

SAFE-003 and SAFE-007.

#### Implementation sequence

1. Inventory schema/size/hash without exposing records.
2. Prove active path from code/runtime evidence.
3. Migrate or archive only after restore proof.

#### Acceptance criteria

- One canonical owner/path is documented.
- Both databases remain recoverable until disposition.
- Application startup opens only the approved path after migration.

#### Required validation

SQLite integrity, schema comparison, isolated migration, startup, and regression tests.

#### Rollback plan

Restore prior `SQLITE_PATH` behavior and original files from backup.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | BLOCKED | Ownership and recoverability are not yet sufficient for safe resolution. | `env.js:32-41`; two physical databases. |

### `DATA-002` Document SQLite table ownership

**Severity:** CRITICAL  
**Phase:** 6 — Data and runtime architecture  
**Status:** NOT STARTED  
**Dependencies:** OWN-003, OWN-008  
**Blocks:** DATA-003, CLEAN-001, CLEAN-002  
**Application owner:** Data owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

`database.js` creates sorter, auth, and legacy delivery tables together, obscuring ownership and deletion safety.

#### Evidence

`server/src/db/database.js:12-76` creates `collection_*`, `product_preferences`, `order_backups`, `shopify_auth_cache`, `delivery_*`; `sorterRuntimeService.js:8-78` adds sorter logs.

#### Required change

Record table readers/writers, lifecycle, schema source, backup class, and target owner.

#### Explicitly out of scope

No table move, schema split, or migration.

#### Files likely affected

Data ownership docs and future migration scripts.

#### Data impact

Potential database migration required later.

#### Backup prerequisite

SAFE-003, SAFE-004, SAFE-007.

#### Implementation sequence

1. Map each table to symbols.
2. Mark shared/legacy/unknown.
3. Approve target ownership and migration order.

#### Acceptance criteria

- Every table has one owner or explicit unknown.
- No cleanup task bypasses this map.
- Schema source is identified.

#### Required validation

Static references, schema inventory, owner review, and backup status.

#### Rollback plan

Append corrected table ownership; do not alter databases.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | SQLite schema combines multiple domains. | `database.js`, `sorterRuntimeService.js`. |

### `DATA-003` Separate Sorter runtime data

**Severity:** HIGH  
**Phase:** 6 — Data and runtime architecture  
**Status:** NOT STARTED  
**Dependencies:** DATA-001, OWN-002, SAFE-003  
**Blocks:** DATA-007, DATA-010  
**Application owner:** Product Sorter  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Sorter tables and strategy JSON live under generic `server/data`, mixed with legacy delivery, auth, and Sales caches.

#### Evidence

`sorterRuntimeService.js` imports the shared DB; `strategySettings.js:14-15` writes `server/data/strategy-settings.json`.

#### Required change

Give Sorter runtime state a configurable owner/path without changing schema or deleting legacy data before migration proof.

#### Explicitly out of scope

No runtime move until DATA-008/009.

#### Files likely affected

Sorter config/services, migration tool, ignore rules, docs.

#### Data impact

Runtime relocation required.

#### Backup prerequisite

SAFE-003, SAFE-007.

#### Implementation sequence

1. Define target path.
2. Add copy/verify migration.
3. Switch by explicit config and test rollback.

#### Acceptance criteria

- Sorter runtime reads/writes one configured location.
- Strategy and logs survive migration.
- Rollback to old path is documented and tested.

#### Required validation

SQLite/JSON integrity, startup, sorter flows, and regression checks.

#### Rollback plan

Restore prior path configuration and backup copy.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Sorter runtime is mixed in generic data directory. | `sorterRuntimeService.js`, `strategySettings.js`. |

### `DATA-004` Separate SKU audit data

**Severity:** HIGH  
**Phase:** 6 — Data and runtime architecture  
**Status:** NOT STARTED  
**Dependencies:** OWN-004, OWN-009  
**Blocks:** DATA-007, DATA-011  
**Application owner:** SKU Image Manager  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

SKU audit JSONL is written into the generic server data directory without retention or ownership policy.

#### Evidence

`skuImageAuditService.js:6-17` resolves and appends `server/data/sku-image-actions.jsonl`.

#### Required change

Assign an app-owned configurable audit path, append/rotation policy, and redaction contract.

#### Explicitly out of scope

No audit deletion or historical rewrite before retention approval.

#### Files likely affected

SKU audit service/config/docs/tests.

#### Data impact

Runtime relocation required.

#### Backup prerequisite

SAFE-003 and SAFE-007.

#### Implementation sequence

1. Inventory fields and retention.
2. Add configurable path behind old default.
3. Migrate/copy and verify line counts/hashes.

#### Acceptance criteria

- Audit owner/path/retention are explicit.
- Writes remain append-safe and redacted.
- Migration is reversible.

#### Required validation

JSONL parse, redaction, write/rotation, SKU flow, and regression tests.

#### Rollback plan

Restore old audit path from verified copy.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | SKU audit lifecycle is implicit. | `skuImageAuditService.js`. |

### `DATA-005` Separate Sales Intelligence caches

**Severity:** HIGH  
**Phase:** 6 — Data and runtime architecture  
**Status:** NOT STARTED  
**Dependencies:** OWN-005, OWN-009  
**Blocks:** DATA-007, DATA-011  
**Application owner:** Actual Sales Intelligence  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Three sizeable JSON caches share `server/data` with application runtime files and have only service-local version checks.

#### Evidence

`actualSalesService.js:8-11,75-88,1155-1208`.

#### Required change

Give Sales caches an app-owned configurable directory, schema/version/expiry policy, safe refresh, and rebuild procedure.

#### Explicitly out of scope

No live refresh or cache deletion.

#### Files likely affected

Sales service/config/tests/docs.

#### Data impact

Runtime relocation required.

#### Backup prerequisite

SAFE-003 and SAFE-007.

#### Implementation sequence

1. Define cache ownership/version/retention.
2. Add path configuration.
3. Copy and verify; retain rebuild fallback.

#### Acceptance criteria

- Cache files are not treated as source.
- Version mismatch and corruption fail safely.
- Rebuild/rollback paths are documented.

#### Required validation

JSON parse/schema, cache hit/miss, refresh mock, disk-failure, and API regression tests.

#### Rollback plan

Restore old cache path and verified files.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Sales caches are runtime files beside source-owned data. | `actualSalesService.js`. |

### `DATA-006` Isolate Order Mapping PostgreSQL/migration state

**Severity:** CRITICAL  
**Phase:** 6 — Data and runtime architecture  
**Status:** NOT STARTED  
**Dependencies:** SAFE-004, OWN-003, BE-010  
**Blocks:** DATA-008, DATA-012  
**Application owner:** Order Mapping  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Order Mapping has a dedicated PostgreSQL schema but legacy SQLite migration code and a public admin migration route.

#### Evidence

`orderMappingMigrations.js`, `orderMappingService.js:354-420`, `orderMapping.js:189-195`, and SQL migrations.

#### Required change

Make PostgreSQL schema/migration state the explicit owner, isolate legacy import as a one-time adapter, and restrict migration operations.

#### Explicitly out of scope

No production migration, schema change, or legacy deletion.

#### Files likely affected

Order Mapping database/service/routes, migration docs/tests.

#### Data impact

Database migration required.

#### Backup prerequisite

SAFE-004, SAFE-007, TEST-009.

#### Implementation sequence

1. Prove current schema/data owner.
2. Test migration/adapter in isolation.
3. Gate admin operation and document rollback.

#### Acceptance criteria

- PostgreSQL is the sole current Order Mapping data owner.
- Legacy SQLite is read-only migration source or formally retired.
- Migration state is auditable and not startup-hidden.

#### Required validation

Schema, migration, restore, route authorization, and Order Mapping regression tests.

#### Rollback plan

Restore pre-task migration code and database from backup; retain PostgreSQL schema.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | PostgreSQL current state and SQLite legacy path overlap. | Order Mapping services/routes/migrations. |

### `DATA-007` Make runtime paths configurable

**Severity:** HIGH  
**Phase:** 6 — Data and runtime architecture  
**Status:** NOT STARTED  
**Dependencies:** OWN-009, SEC-004  
**Blocks:** DATA-003 through DATA-006, OPS-002  
**Application owner:** Operations  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Most runtime paths are derived from source locations; only SQLite and strategy settings have limited environment overrides.

#### Evidence

`env.js:32-41`; `strategySettings.js:14`; `actualSalesService.js:8`; `skuImageAuditService.js:6`; route temp paths use `os.tmpdir()`.

#### Required change

Define validated per-app runtime roots for SQLite, JSON/JSONL, caches, temp files, and future exports.

#### Explicitly out of scope

No path switch until DATA-008/009.

#### Files likely affected

Config modules, runtime services, tests/docs.

#### Data impact

Runtime relocation required.

#### Backup prerequisite

SAFE-003, SAFE-004, SAFE-007.

#### Implementation sequence

1. Define path schema and defaults.
2. Validate permissions/absolute resolution.
3. Add migration and rollback hooks.

#### Acceptance criteria

- Every writable runtime path is explicit and validated.
- Source directories are not silently used in production.
- Defaults preserve current behavior until migration.

#### Required validation

Config unit tests, permission/path tests, startup, runtime write fixtures, and regression.

#### Rollback plan

Restore old defaults and retain verified copied data.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Runtime paths are mostly source-relative. | Path reference inventory. |

### `DATA-008` Add safe data migration tools

**Severity:** CRITICAL  
**Phase:** 6 — Data and runtime architecture  
**Status:** NOT STARTED  
**Dependencies:** DATA-001 through DATA-007, SAFE-004  
**Blocks:** DATA-009, CLEAN-002  
**Application owner:** Data owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

There is no single verified tool for copying, validating, recording, and resuming runtime/database migrations.

#### Evidence

Only Order Mapping migration scripts exist; no general backup/path migration command is documented.

#### Required change

Provide narrow, dry-run-first migration commands with checksums, manifests, idempotency, and explicit source/target paths.

#### Explicitly out of scope

No execution against production data during implementation.

#### Files likely affected

Migration scripts, config, tests, docs.

#### Data impact

Database migration required.

#### Backup prerequisite

SAFE-003, SAFE-004, SAFE-007.

#### Implementation sequence

1. Define manifest/checksum format.
2. Implement dry-run/copy/verify.
3. Add resume and failure handling.

#### Acceptance criteria

- Dry-run identifies all sources/targets.
- Copy is idempotent and verifiable.
- Failure cannot silently delete or overwrite source data.

#### Required validation

Unit, isolated filesystem/database migration, checksum, interruption, and rollback tests.

#### Rollback plan

Use manifest to restore target from source/backup; never auto-delete source.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | No general safe runtime migration tool exists. | Scripts inventory. |

### `DATA-009` Add data rollback support

**Severity:** CRITICAL  
**Phase:** 6 — Data and runtime architecture  
**Status:** NOT STARTED  
**Dependencies:** DATA-008, SAFE-007  
**Blocks:** FINAL-003  
**Application owner:** Data owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Runtime relocation and schema changes need an explicit reverse operation and restore point.

#### Evidence

Sorter has application-level order rollback, but no general runtime/database rollback procedure is documented.

#### Required change

Define pre/post manifests, restore commands, compatibility window, and abort criteria for every data migration.

#### Explicitly out of scope

No production rollback execution.

#### Files likely affected

Migration tool/docs/tests.

#### Data impact

Database migration required.

#### Backup prerequisite

SAFE-007 and DATA-008.

#### Implementation sequence

1. Capture immutable pre-migration manifest.
2. Test reverse path in isolation.
3. Require sign-off before real migration.

#### Acceptance criteria

- Every migration task has a tested reverse path.
- Restore does not depend on deleted source.
- Abort conditions are explicit.

#### Required validation

Interruption/restore tests, integrity checks, startup, and manual runbook review.

#### Rollback plan

Execute the tested restore procedure against isolated target only.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | General data rollback is absent. | No migration runbook found. |

### `DATA-010` Correct ignore rules and generated-file tracking

**Severity:** HIGH  
**Phase:** 6 — Data and runtime architecture  
**Status:** NOT STARTED  
**Dependencies:** DATA-001 through DATA-007, OPS-005 through OPS-008  
**Blocks:** CLEAN-005 through CLEAN-007, FINAL-005  
**Application owner:** Operations  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

`.gitignore` ignores only `server/data`, while tracked runtime/generated artifacts include a nested DB, token cache, Graphify, Playwright, Tokensave, and test output.

#### Evidence

`.gitignore:1-6`; `git ls-files` lists `server/server/data/app.db`, `server/.cache/shiprocket-token.json`, `.tokensave/tokensave.db`, Graphify artifacts, Playwright logs, and `test-results/.last-run.json`.

#### Required change

Define source/runtime/generated rules and untrack artifacts only after backups, ownership, and cleanup acceptance pass.

#### Explicitly out of scope

No untracking/deletion before CLEAN tasks.

#### Files likely affected

`.gitignore`, tracked artifact decisions, docs.

#### Data impact

Potential runtime/source classification impact.

#### Backup prerequisite

SAFE-003, SAFE-005, SAFE-006, SAFE-007.

#### Implementation sequence

1. Inventory tracked/untracked/ignored artifacts.
2. Approve patterns by owner.
3. Untrack only recoverable non-source artifacts.

#### Acceptance criteria

- Future runtime files are ignored by class.
- Required source fixtures remain tracked.
- No data loss occurs during cleanup.

#### Required validation

Git status, ignore checks, backup hashes, clean checkout simulation, and regression.

#### Rollback plan

Restore tracked artifacts from backup/commit if classification is wrong.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Runtime/generated tracking is inconsistent. | `.gitignore`, tracked inventory. |

### `DATA-011` Define retention for caches, audits, logs, uploads, exports

**Severity:** MEDIUM  
**Phase:** 6 — Data and runtime architecture  
**Status:** NOT STARTED  
**Dependencies:** DATA-003 through DATA-007  
**Blocks:** CLEAN-009, DOC-005, DOC-009  
**Application owner:** Operations/data owners  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

Runtime artifacts have no documented retention, rotation, size cap, or audit policy.

#### Evidence

JSON caches, JSONL audit, SQLite logs, OS temp upload directories, and CSV exports are present; no retention docs exist.

#### Required change

Define retention, archival, deletion authorization, size limits, and privacy rules by store.

#### Explicitly out of scope

No deletion or retention enforcement before approval.

#### Files likely affected

Runtime policy docs, config, optional maintenance commands.

#### Data impact

Potential data retention impact.

#### Backup prerequisite

SAFE-007.

#### Implementation sequence

1. Classify data sensitivity.
2. Set retention owners and schedules.
3. Add bounded maintenance only after tests.

#### Acceptance criteria

- Every runtime store has retention and recovery policy.
- Deletion is auditable and reversible where required.
- Temp files cannot accumulate without bounds.

#### Required validation

Policy review, synthetic aging tests, size-limit tests, and security review.

#### Rollback plan

Disable maintenance schedule and restore from retention backup.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Retention policy is absent. | Runtime inventory. |

### `DATA-012` Validate PostgreSQL backup and restore process

**Severity:** CRITICAL  
**Phase:** 6 — Data and runtime architecture  
**Status:** NOT STARTED  
**Dependencies:** SAFE-004, SAFE-007, DATA-006  
**Blocks:** DOC-009, FINAL-003  
**Application owner:** Order Mapping/data owners  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Order Mapping data cannot be considered safe until a repeatable restore is verified independently of the live database.

#### Evidence

PostgreSQL schema includes orders, shipments, tracking, history, imports, sync runs, exceptions, and network logs; no restore evidence is documented.

#### Required change

Validate backup/restore, migration-state consistency, application connectivity, and representative synthetic queries in an isolated target.

#### Explicitly out of scope

No production restore or schema modification.

#### Files likely affected

External restore evidence and DOC-009.

#### Data impact

Database migration required only for isolated restore validation.

#### Backup prerequisite

SAFE-004 and SAFE-007.

#### Implementation sequence

1. Restore backup.
2. Verify schema/migration metadata.
3. Run read-only application smoke checks.

#### Acceptance criteria

- Restore is repeatable.
- Schema and migration state match expected source.
- No production connection is used for destructive checks.

#### Required validation

Database integrity, migration, repository read, route smoke, and manual runbook checks.

#### Rollback plan

Drop isolated target only after evidence capture; retain source backup.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | PostgreSQL restore is not proven. | Migration inventory. |

### `OPS-001` Fix or retire obsolete `scripts/dev.mjs`

**Severity:** MEDIUM  
**Phase:** 7 — Operational tooling  
**Status:** NOT STARTED  
**Dependencies:** TEST-010, OWN-001  
**Blocks:** OPS-002, CLEAN-008  
**Application owner:** Operations  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

`scripts/dev.mjs` invokes nonexistent `dev:server` and `dev:client` targets, while root uses workspace scripts.

#### Evidence

`scripts/dev.mjs:3-9`; root `package.json:11-15`; workspace packages define `dev`, not `dev:server`/`dev:client`.

#### Required change

Either make the script a tested compatibility wrapper or retire it after proving no caller.

#### Explicitly out of scope

No server start during this audit; no command behavior change before tests.

#### Files likely affected

`scripts/dev.mjs`, package scripts, README.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Search callers.
2. Select wrapper or retirement.
3. Test process cleanup and failure propagation.

#### Acceptance criteria

- No documented command invokes a broken target.
- Child processes terminate safely.
- Startup behavior is covered.

#### Required validation

Static script check, dry-run/process tests, documentation review, and no server start in audit.

#### Rollback plan

Restore prior script or remove only after caller proof.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Script targets do not match workspace scripts. | `scripts/dev.mjs`, package manifests. |

### `OPS-002` Standardize startup commands

**Severity:** MEDIUM  
**Phase:** 7 — Operational tooling  
**Status:** NOT STARTED  
**Dependencies:** OPS-001, BE-010  
**Blocks:** DOC-007, DOC-008, FINAL-002  
**Application owner:** Operations  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

Root `dev`, `server`, `client`, `start`, `health`, and `verify` commands have different assumptions, and README is stale.

#### Evidence

Root scripts `package.json:11-17`; server scripts `server/package.json:7-11`; README documents only a subset.

#### Required change

Define safe development, test, build, start, health, migration, backup, and shutdown commands with environment prerequisites.

#### Explicitly out of scope

No server startup or migration execution in this task.

#### Files likely affected

Package scripts, README, operational docs.

#### Data impact

No direct data impact.

#### Backup prerequisite

SAFE-007 for any migration command documentation.

#### Implementation sequence

1. Inventory actual commands.
2. Mark read-only/destructive commands.
3. Add tested wrappers/docs.

#### Acceptance criteria

- Every documented command exists and has a clear safety class.
- `verify` does not require an unannounced live integration.
- Migration commands require explicit operator intent.

#### Required validation

Static script checks, dry-run help, test gate, and documentation review.

#### Rollback plan

Restore previous scripts/docs while retaining evidence of the mismatch.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Operational commands are inconsistent. | Root/server package scripts. |

### `OPS-003` Standardize health checks

**Severity:** HIGH  
**Phase:** 7 — Operational tooling  
**Status:** NOT STARTED  
**Dependencies:** BE-005, OWN-006  
**Blocks:** DOC-008, FINAL-002  
**Application owner:** Operations/diagnostics  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Root `health` calls `/api/debug/shopify`, coupling health verification to provider state rather than process readiness.

#### Evidence

`package.json:16-17`; `api.js:208-276` separates `/health` and `/debug/shopify`.

#### Required change

Define liveness/readiness/provider diagnostics separately with safe status semantics.

#### Explicitly out of scope

No health endpoint removal or live call during audit.

#### Files likely affected

Health routes, scripts, docs, tests.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Define endpoint contract.
2. Add process-only health.
3. Keep provider diagnostics explicit.

#### Acceptance criteria

- Liveness does not require Shopify credentials.
- Readiness reports migration/config state safely.
- Provider diagnostics do not leak secrets.

#### Required validation

Route tests, startup matrix, script dry-run, and security review.

#### Rollback plan

Keep existing endpoints behind compatibility adapters.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Root health command is provider-coupled. | `package.json`, `api.js:208-276`. |

### `OPS-004` Standardize diagnostics and safe observability

**Severity:** MEDIUM  
**Phase:** 7 — Operational tooling  
**Status:** NOT STARTED  
**Dependencies:** OWN-006, BE-009, SEC-006  
**Blocks:** DOC-008, FINAL-005  
**Application owner:** Operations  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

Diagnostics mix module state, network/action logs, Shopify debug data, and direct logs without a common operational contract.

#### Evidence

`App.jsx:1232-1429`; sorter log routes; Order Mapping log routes; `logger.js`.

#### Required change

Define diagnostic fields, bounded limits, redaction, retention, and operator interpretation.

#### Explicitly out of scope

No external observability platform.

#### Files likely affected

Diagnostics contracts, routes, UI, docs, tests.

#### Data impact

Potential log migration/retention impact.

#### Backup prerequisite

SAFE-007.

#### Implementation sequence

1. Inventory current fields.
2. Define common envelope and limits.
3. Update producers/consumers incrementally.

#### Acceptance criteria

- Diagnostics are bounded and redacted.
- Operators can distinguish liveness, provider, and app failures.
- Existing app views retain required information.

#### Required validation

Route/UI, redaction, size-limit, and regression checks.

#### Rollback plan

Restore old event adapters and display mapping.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Diagnostics are shared but not standardized. | App and route evidence. |

### `OPS-005` Review and isolate Graphify artifacts

**Severity:** MEDIUM  
**Phase:** 7 — Operational tooling  
**Status:** NOT STARTED  
**Dependencies:** OWN-009  
**Blocks:** DATA-010, CLEAN-005  
**Application owner:** Graphify tooling  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

Graphify reports, graphs, caches, and manifests are mixed into the project and tracked, creating generated-file noise and large diffs.

#### Evidence

`graphify-out/` contains multiple dated graphs, caches, HTML, reports, and manifests; `git ls-files` confirms tracked artifacts. Existing `graphify-out/cache/last_query_stamp` was pre-existing dirty state.

#### Required change

Define whether Graphify artifacts are reproducible local outputs, retained reports, or source documentation; isolate/ignore accordingly after backup.

#### Explicitly out of scope

No Graphify rebuild, refresh, deletion, or modification during this audit.

#### Files likely affected

Graphify tracking rules/docs in a later task.

#### Data impact

No application data impact.

#### Backup prerequisite

SAFE-002 and artifact backup if retained.

#### Implementation sequence

1. Classify dated/current artifacts.
2. Identify consumers.
3. Approve retention and cleanup task.

#### Acceptance criteria

- Graphify output has one tool owner and lifecycle.
- No required source documentation is deleted.
- Cleanup depends on recoverable copy.

#### Required validation

Git inventory, reproducibility check, ignore check, and owner review.

#### Rollback plan

Restore retained artifact set from backup/commit.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Graphify output is large and tracked. | `graphify-out/` inventory. |

### `OPS-006` Review and isolate Tokensave runtime files

**Severity:** HIGH  
**Phase:** 7 — Operational tooling  
**Status:** NOT STARTED  
**Dependencies:** OWN-009, SEC-003  
**Blocks:** DATA-010, CLEAN-006  
**Application owner:** Tokensave tooling  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

`.tokensave/tokensave.db` is tracked and currently modified, with untracked WAL/SHM files, but is tool state rather than application data.

#### Evidence

Git status shows modified `.tokensave/tokensave.db` and untracked WAL/SHM; tracked inventory includes database/config files.

#### Required change

Classify Tokensave as external tooling state, protect it from app cleanup, and decide future tracking/retention without exposing contents.

#### Explicitly out of scope

No Tokensave DB read/write, deletion, or reset.

#### Files likely affected

Ignore/tracking policy and tooling docs later.

#### Data impact

Tool runtime impact only; preserve existing state.

#### Backup prerequisite

SAFE-002 and approved Tokensave backup.

#### Implementation sequence

1. Confirm tool ownership.
2. Record tracked/runtime classification.
3. Approve separate cleanup task.

#### Acceptance criteria

- App architecture does not claim Tokensave ownership.
- Existing tool state is preserved.
- No secret or token content enters docs.

#### Required validation

Git status, ignore checks, tool smoke test if approved, and security review.

#### Rollback plan

Restore tool files from backup; never reset the DB automatically.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Tracked tooling DB is dirty and not app-owned. | `.tokensave` status/inventory. |

### `OPS-007` Review Playwright artifacts

**Severity:** LOW  
**Phase:** 7 — Operational tooling  
**Status:** NOT STARTED  
**Dependencies:** OWN-009  
**Blocks:** DATA-010, CLEAN-006  
**Application owner:** E2E tooling  
**Risk level:** Low  
**Last updated:** 2026-07-29

#### Problem

`.playwright-cli` contains tracked logs/page snapshots and `.tmp-playwright` contains test material near source.

#### Evidence

Tracked-file inventory lists many `.playwright-cli/*.log` and `.yml` files plus `.tmp-playwright/filter-size.spec.js`.

#### Required change

Classify reusable specs versus generated output and define retention/ignore policy.

#### Explicitly out of scope

No E2E run, deletion, or spec rewrite.

#### Files likely affected

Tooling ignore/docs and later cleanup.

#### Data impact

No application data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Identify consumers.
2. Retain reusable specs.
3. Isolate generated output.

#### Acceptance criteria

- Reusable tests remain discoverable.
- Generated logs/snapshots have bounded retention.
- Cleanup is reversible.

#### Required validation

File classification, test discovery, ignore checks, and owner review.

#### Rollback plan

Restore retained artifacts from backup/commit.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Playwright output is tracked near source. | `.playwright-cli`, `.tmp-playwright`. |

### `OPS-008` Review test outputs and cache artifacts

**Severity:** LOW  
**Phase:** 7 — Operational tooling  
**Status:** NOT STARTED  
**Dependencies:** OWN-009  
**Blocks:** DATA-010, CLEAN-007  
**Application owner:** Test tooling  
**Risk level:** Low  
**Last updated:** 2026-07-29

#### Problem

`test-results/.last-run.json` and client/server caches are present without clear source/runtime classification.

#### Evidence

Physical inventory includes `test-results/.last-run.json` and `server/.cache`; tracked inventory includes test output and token cache.

#### Required change

Classify, retain only needed reproducible fixtures, and isolate test outputs from source.

#### Explicitly out of scope

No test execution or deletion.

#### Files likely affected

Ignore rules and test docs later.

#### Data impact

No application data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Identify consumers.
2. Mark generated output.
3. Approve cleanup and retention.

#### Acceptance criteria

- Test outputs are reproducible or explicitly retained.
- Runtime caches are not source fixtures.
- No required test asset is lost.

#### Required validation

Test discovery, Git/ignore checks, and clean checkout simulation.

#### Rollback plan

Restore retained output from backup.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Test/cache outputs are mixed into project state. | Inventory evidence. |

### `OPS-009` Add safe backup, architecture-validation, and cleanliness commands

**Severity:** MEDIUM  
**Phase:** 7 — Operational tooling  
**Status:** NOT STARTED  
**Dependencies:** SAFE-007, DATA-010  
**Blocks:** DOC-009, FINAL-005  
**Application owner:** Operations  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

There is no documented safe command for backups, plan/task validation, or project-scoped cleanliness checks.

#### Evidence

Root scripts provide only build/health/verify; `scripts/dev.mjs` is stale; no architecture validation script exists.

#### Required change

Add read-only validation and explicit backup commands with dry-run, project-path scoping, and refusal on dirty/unapproved state.

#### Explicitly out of scope

No destructive cleanup command and no automatic Graphify/Obsidian mutation.

#### Files likely affected

Scripts, package commands, operational docs, tests.

#### Data impact

Backup/runtime impact only.

#### Backup prerequisite

SAFE-007.

#### Implementation sequence

1. Define command safety classes.
2. Add dry-run/read-only checks.
3. Add backup command only after approved paths are explicit.

#### Acceptance criteria

- Commands refuse broad worktree scope by default.
- Plan/task IDs and status totals can be validated.
- Backup command reports hashes and never deletes source.

#### Required validation

Shell/script tests, dry-run, project-scoped Git checks, and manual safety review.

#### Rollback plan

Remove command wiring and retain documented manual procedure.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Operational validation surface is missing. | Root scripts inventory. |

### `OPS-ARCH-001` Enforce architecture ledger updates automatically

**Severity:** HIGH  
**Phase:** 7 — Operational tooling  
**Status:** NOT STARTED  
**Dependencies:** SAFE-002, TEST-012, OPS-009  
**Blocks:** FINAL-005, FINAL-008  
**Application owner:** Repository governance  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

The repository-level session protocol requires architecture work to update the master plan, but no automated guard currently detects architecture-related implementation changes that omit a corresponding change to the ledger.

#### Evidence

`AGENTS.md` defines the required ledger protocol; `docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md` is the sole ledger. Existing operational tooling is tracked by `OPS-001` through `OPS-009`, and no dedicated enforcement task or guard was previously present.

#### Required change

Investigate and later implement a safe repository validation guard, pre-commit rule, or CI check that detects architecture-related changes without a corresponding master-plan update at `docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`.

#### Explicitly out of scope

Do not implement the guard, change hooks, add scripts, alter CI, stage files, or modify application code during this governance setup task.

#### Files likely affected

`AGENTS.md`, operational validation scripts, repository hooks or CI configuration, tests, and this master plan.

#### Data impact

No data impact.

#### Backup prerequisite

Verified Git and working-tree baseline; no automation may be introduced until `SAFE-002` and applicable operational prerequisites pass.

#### Implementation sequence

1. Define which paths and task categories qualify as architecture-related changes.
2. Define positive, negative, emergency-bypass, and ECC-hook compatibility cases.
3. Implement a read-only guard that reports violations without staging or modifying files.
4. Add automated tests for accepted and rejected change sets.
5. Document the explicit, auditable emergency bypass and update this task record with evidence.

#### Acceptance criteria

- Architecture changes without a ledger update are rejected.
- Unrelated ordinary changes are not incorrectly blocked.
- Emergency bypasses are explicit and auditable.
- Existing ECC hooks remain functional.
- Tests cover positive and negative cases.
- The guard does not stage or modify files automatically.

#### Required validation

Static guard checks; positive and negative unit/integration tests; ECC hook compatibility checks; staged and unstaged repository scenarios; bypass audit review; and manual confirmation that no files are staged or modified by the guard.

#### Rollback plan

Disable or remove only the guard wiring and its tests, restore the pre-task hook/CI configuration, and retain the ledger protocol and task evidence. Do not revert unrelated pre-existing changes.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Added as the future automated enforcement task; implementation intentionally deferred. | Governance protocol and plan index review. |

### `SEC-001` Assess authentication boundary

**Severity:** CRITICAL  
**Phase:** 8 — Security and configuration  
**Status:** NOT STARTED  
**Dependencies:** OWN-007, OWN-010  
**Blocks:** SEC-002, SEC-003, META-006  
**Application owner:** Security  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

The current server exposes operational and write-capable routes with provider credentials but no end-user authentication layer.

#### Evidence

`app.js:14-22` configures CORS/routes only; `env.js` loads provider credentials; Order Mapping and SKU routes include writes/admin migration.

#### Required change

Document trust boundaries, deployment assumptions, identities, session/API-key strategy, and local-only versus production behavior.

#### Explicitly out of scope

No auth provider installation or credential change in the assessment.

#### Files likely affected

Security assessment, route matrix, future auth middleware/tests.

#### Data impact

Potential security/access impact.

#### Backup prerequisite

SAFE-005.

#### Implementation sequence

1. Inventory exposed routes and deployment assumptions.
2. Classify public/internal/admin/write surfaces.
3. Approve auth boundary and migration order.

#### Acceptance criteria

- Every route has a trust classification.
- Missing auth is an explicit risk, not an assumption.
- Local compatibility requirements are recorded.

#### Required validation

Static route/security review, threat model, and owner sign-off.

#### Rollback plan

Append corrected assessment; do not add auth ad hoc.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | No end-user auth boundary is present. | `app.js`, `env.js`, route inventory. |

### `SEC-002` Add route authorization boundaries

**Severity:** CRITICAL  
**Phase:** 8 — Security and configuration  
**Status:** NOT STARTED  
**Dependencies:** SEC-001, TEST-008  
**Blocks:** FINAL-004  
**Application owner:** Security/backend owners  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Operational writes, admin migration, media mutations, and provider diagnostics are mounted without explicit authorization middleware.

#### Evidence

`orderMapping.js:189-195` exposes `/admin/migrate-sqlite`; `api.js` exposes collection/media writes; `app.js` has no auth middleware.

#### Required change

Implement the approved auth/authorization boundary per route class while preserving local development via explicit safe configuration.

#### Explicitly out of scope

No route removal or secret exposure.

#### Files likely affected

Auth middleware, route mounts, tests/docs.

#### Data impact

Potential access impact; no data migration.

#### Backup prerequisite

SAFE-005, SAFE-007, SEC-001.

#### Implementation sequence

1. Add deny-by-default tests.
2. Protect admin/write routes.
3. Add local/test identity fixtures.

#### Acceptance criteria

- Unauthorized reads/writes receive stable safe responses.
- Admin migration is not publicly callable.
- Local/test bypass is explicit and unavailable in production.

#### Required validation

Auth unit/integration, route matrix, negative tests, security audit, and regression.

#### Rollback plan

Disable only behind a controlled local compatibility flag; never remove audit evidence.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Authorization is not implemented. | `app.js`, route write/admin evidence. |

### `SEC-003` Correct secret handling and tracked token risk

**Severity:** CRITICAL  
**Phase:** 8 — Security and configuration  
**Status:** NOT STARTED  
**Dependencies:** SAFE-005, OWN-010  
**Blocks:** INT-006, SEC-006, DATA-010  
**Application owner:** Security  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Provider credentials are environment-backed, auth caches exist on disk, and `server/.cache/shiprocket-token.json` is tracked.

#### Evidence

`env.js:44-63`; `shopifyAuth.js` caches token state; tracked-file audit lists the Shiprocket token cache. Values were not inspected.

#### Required change

Remove secret material from tracked/runtime source paths through approved backup/rotation process and enforce backend-only secret handling.

#### Explicitly out of scope

No credential values or rotation execution in this task.

#### Files likely affected

Secret config/docs, ignore/tracking policy, auth services.

#### Data impact

Potential security impact.

#### Backup prerequisite

SAFE-005, SAFE-006.

#### Implementation sequence

1. Scan names/content safely.
2. Rotate/revoke if exposure is confirmed.
3. Remove tracking only after backup and owner approval.

#### Acceptance criteria

- No token/password/secret is tracked or bundled.
- Runtime auth state uses approved secret storage.
- Rotation evidence is recorded without values.

#### Required validation

Secret scan, bundle scan, auth tests, Git status, and security review.

#### Rollback plan

Restore only non-secret config; revoked credentials cannot be restored.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Tracked token-cache risk requires handling. | `server/.cache/shiprocket-token.json`. |

### `SEC-004` Validate environment schema at boundaries

**Severity:** HIGH  
**Phase:** 8 — Security and configuration  
**Status:** NOT STARTED  
**Dependencies:** OWN-010  
**Blocks:** SEC-005, DOC-002, TEST-010  
**Application owner:** Security/operations  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

`env.js` coerces values and loads two dotenv files but has no schema-level validation for all fields.

#### Evidence

`env.js:7-71`; `PORT`, database, Shopify, Shiprocket, analytics, and path values are read with ad hoc defaults.

#### Required change

Define validated required/optional fields, numeric ranges, URLs, paths, and redacted diagnostics.

#### Explicitly out of scope

No dependency addition unless current standard library/config pattern cannot satisfy requirements.

#### Files likely affected

Config, tests, `.env.example`, docs.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002 and SAFE-005.

#### Implementation sequence

1. Inventory variable names.
2. Add pure validation.
3. Apply at process boundary and test matrices.

#### Acceptance criteria

- Invalid values fail clearly before writes.
- Optional integrations are explicit.
- Diagnostics reveal presence/status only, not values.

#### Required validation

Config unit/startup tests, secret scan, and regression.

#### Rollback plan

Restore prior loader behind a controlled compatibility flag.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Environment validation is ad hoc. | `env.js:24-71`. |

### `SEC-005` Isolate application-specific environment requirements

**Severity:** HIGH  
**Phase:** 8 — Security and configuration  
**Status:** NOT STARTED  
**Dependencies:** SEC-004, OWN-010  
**Blocks:** DOC-002, OPS-002  
**Application owner:** Operations  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

A single server env object loads requirements for sorter, Order Mapping, Shopify, Shiprocket, and Sales Intelligence together.

#### Evidence

`env.js:44-63` combines SQLite, PostgreSQL, Shopify, Shiprocket, and analytics fields; startup conditionally invokes provider calls.

#### Required change

Define per-app env slices and startup requirements while preserving compatibility names during migration.

#### Explicitly out of scope

No deployment secret changes.

#### Files likely affected

Config modules, startup, tests/docs.

#### Data impact

No direct data impact.

#### Backup prerequisite

SAFE-005, TEST-010.

#### Implementation sequence

1. Map variable to owner.
2. Validate only required slices per capability.
3. Document compatibility defaults.

#### Acceptance criteria

- App startup requirements are isolated and testable.
- Missing Sales/Shiprocket config does not break unrelated local flows unless policy says so.
- No frontend bundle receives secrets.

#### Required validation

Environment matrix, startup, bundle, route, and regression tests.

#### Rollback plan

Restore combined env adapter while preserving validation evidence.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Env requirements are coupled. | `env.js`, `index.js`. |

### `SEC-006` Sanitize sensitive logs and diagnostics

**Severity:** CRITICAL  
**Phase:** 8 — Security and configuration  
**Status:** NOT STARTED  
**Dependencies:** SEC-003, OWN-006  
**Blocks:** BE-009, OPS-004, FINAL-004  
**Application owner:** Security/operations  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

General Shopify logging includes endpoint/query/variables, and routes return raw error details; provider diagnostics may expose operational data.

#### Evidence

`shopifyService.js:4-67`; `api.js` error responses; `App.jsx` displays diagnostic payloads.

#### Required change

Redact tokens, credentials, customer/order payloads, sensitive headers, raw provider bodies, and unsafe error details.

#### Explicitly out of scope

No historical log rewrite without retention/backup approval.

#### Files likely affected

Logger, provider clients, routes, diagnostics UI/tests.

#### Data impact

Potential log data impact.

#### Backup prerequisite

SAFE-005, SAFE-007.

#### Implementation sequence

1. Define sensitive-field list.
2. Add redaction tests.
3. Migrate logs and API errors incrementally.

#### Acceptance criteria

- Secret and customer fields cannot appear in logs/errors.
- Diagnostics retain actionable status only.
- Redaction is tested against nested payloads.

#### Required validation

Redaction unit tests, route tests, secret scan, manual log review, and regression.

#### Rollback plan

Restore logger adapter only; never restore exposed secrets.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Sensitive logging risk requires explicit controls. | Provider/logger/routes evidence. |

### `SEC-007` Review CORS and CSRF protections

**Severity:** HIGH  
**Phase:** 8 — Security and configuration  
**Status:** NOT STARTED  
**Dependencies:** SEC-001, BE-005  
**Blocks:** FINAL-004  
**Application owner:** Security/backend owners  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Express configures CORS origin but no explicit authorization/CSRF policy is documented for browser write requests.

#### Evidence

`app.js:14-18`; write routes accept JSON/multipart requests; no CSRF/auth middleware is present.

#### Required change

Assess deployment mode and implement appropriate origin, credential, CSRF, and preflight protections.

#### Explicitly out of scope

No production deployment change in assessment.

#### Files likely affected

App middleware, auth, tests/docs.

#### Data impact

Potential access/write impact.

#### Backup prerequisite

SAFE-005.

#### Implementation sequence

1. Threat-model local and deployed modes.
2. Define cookie/token policy.
3. Add negative tests before enabling protection.

#### Acceptance criteria

- Allowed origins are explicit.
- Cross-site writes are rejected under the chosen auth model.
- Local development remains deliberate and bounded.

#### Required validation

Middleware integration, browser security, preflight, negative write, and regression tests.

#### Rollback plan

Use documented local-only compatibility configuration; never broaden production origin silently.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | CORS exists without a complete browser-write security policy. | `app.js:14-18`. |

### `SEC-008` Sanitize API errors and validate input

**Severity:** HIGH  
**Phase:** 8 — Security and configuration  
**Status:** NOT STARTED  
**Dependencies:** BE-008, SEC-006  
**Blocks:** FINAL-004  
**Application owner:** Backend/security owners  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Many routes trust query/body values after minimal presence checks and return `error.message` directly.

#### Evidence

`api.js:504-536`, Sales query handlers, SKU inputs, and `orderMapping.js:120-170` show route-local validation/error patterns.

#### Required change

Validate identifiers, dates, counts, enums, upload metadata, and pagination at boundaries; normalize safe errors.

#### Explicitly out of scope

No business-rule changes.

#### Files likely affected

Shared validation/errors, all routers, tests.

#### Data impact

No direct data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Inventory input fields.
2. Add pure validators and compatibility messages.
3. Apply route by route.

#### Acceptance criteria

- Invalid boundary input returns deterministic 4xx.
- Errors contain no provider/db internals.
- Upload and CSV constraints are enforced.

#### Required validation

Negative route tests, fuzz/boundary cases, security review, and regression.

#### Rollback plan

Keep old adapter response shape while reverting internal validators.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Validation/error handling is inconsistent. | Route source evidence. |

### `SEC-009` Audit dependencies, rotation, and future Meta bundle exposure

**Severity:** HIGH  
**Phase:** 8 — Security and configuration  
**Status:** NOT STARTED  
**Dependencies:** SEC-003, SEC-004  
**Blocks:** META-003, META-006, FINAL-004  
**Application owner:** Security  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

There is no documented dependency/security audit gate, credential rotation runbook, or proof that future Meta secrets cannot enter the client bundle.

#### Evidence

Root lockfile/dependencies are present; destination has no Meta code, while the historical Meta document describes backend env credentials and old frontend/backend source.

#### Required change

Run dependency risk review, document rotation, and add a bundle/static guard for backend-only provider secrets before Meta work.

#### Explicitly out of scope

No dependency install/removal or Meta rebuild.

#### Files likely affected

Security/docs/tests and future CI checks.

#### Data impact

Potential security impact.

#### Backup prerequisite

SAFE-005.

#### Implementation sequence

1. Audit manifest and lockfile.
2. Define rotation ownership.
3. Add bundle secret guard.

#### Acceptance criteria

- High-risk dependencies have disposition.
- Rotation steps are documented.
- Client bundle contains no backend secret names/values.

#### Required validation

Dependency audit, secret/bundle scan, security review, and regression.

#### Rollback plan

Revert only guard/docs changes; rotate/revoke any confirmed exposure separately.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Security/dependency operations are undocumented. | Lockfile, env, Meta historical document. |

### `DOC-001` Update README to current architecture

**Severity:** MEDIUM  
**Phase:** 9 — Documentation  
**Status:** NOT STARTED  
**Dependencies:** OWN-001, BE-005, FE-003  
**Blocks:** CLEAN-008, FINAL-005  
**Application owner:** Documentation  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

README describes an older sorter-only tree, claims `.env.example`, and omits Order Mapping, SKU, Sales, runtime, safety, and Meta status.

#### Evidence

`README.md:1-77` versus current source/workspace/runtime inventory.

#### Required change

Document current apps, commands, routes, data ownership, safety constraints, and architecture ledger link.

#### Explicitly out of scope

No code or command behavior change.

#### Files likely affected

`README.md`.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Reconcile README with approved matrices.
2. Add safe command classes.
3. Link this master plan.

#### Acceptance criteria

- No nonexistent `.env.example` or stale tree is claimed.
- All executable apps and Meta documentation-only state are accurate.
- Commands identify destructive prerequisites.

#### Required validation

Link/path checks, command inventory, documentation review, and clean checkout read.

#### Rollback plan

Restore prior README from Git.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | README is stale and sorter-centric. | `README.md:1-77`. |

### `DOC-002` Create a real `.env.example`

**Severity:** HIGH  
**Phase:** 9 — Documentation  
**Status:** NOT STARTED  
**Dependencies:** SEC-004, SEC-005  
**Blocks:** DOC-007, DOC-008  
**Application owner:** Documentation/operations  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

README references `.env.example`, but no file exists; environment requirements are hidden in code and historical docs.

#### Evidence

`test -e .env.example` was negative; `env.js:44-63` defines current names.

#### Required change

Create a redacted, app-grouped example with safe placeholders, required/optional notes, and no live identifiers.

#### Explicitly out of scope

No `.env` edits, secret values, or configuration change.

#### Files likely affected

`.env.example`, README/docs.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-005.

#### Implementation sequence

1. Approve env ownership.
2. Add placeholders and comments.
3. Validate names against config/tests.

#### Acceptance criteria

- Every required current variable is represented.
- No secret/customer value appears.
- App-specific optionality is clear.

#### Required validation

Env-name diff, secret scan, startup matrix, and documentation review.

#### Rollback plan

Delete only the example file if inaccurate; never alter `.env`.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | README references a missing example file. | `.env.example` absent; `env.js`. |

### `DOC-003` Create application map

**Severity:** MEDIUM  
**Phase:** 9 — Documentation  
**Status:** NOT STARTED  
**Dependencies:** OWN-001 through OWN-006  
**Blocks:** META-001, FINAL-005  
**Application owner:** Documentation  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

Current app names, legacy aliases, entry points, and executable status are spread across code and historical docs.

#### Evidence

Section 6 and current source inventory show three frontend apps, one backend service, legacy delivery, diagnostics, and disabled Meta label.

#### Required change

Create a concise app map linking owners, entry points, routes, services, data, integrations, env, and tests.

#### Explicitly out of scope

No naming or code change.

#### Files likely affected

New architecture documentation file approved by project docs policy.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Use approved ownership matrix.
2. Link exact paths.
3. Mark confidence and unknowns.

#### Acceptance criteria

- Every current application/system appears once.
- Meta is clearly documentation-only.
- Legacy Delivery Resolution is not silently treated as a current app.

#### Required validation

Path/link checks, source search, and owner review.

#### Rollback plan

Restore documentation file from Git.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | No application map exists. | Section 6/current inventory. |

### `DOC-004` Create route map

**Severity:** HIGH  
**Phase:** 9 — Documentation  
**Status:** NOT STARTED  
**Dependencies:** OWN-007, BE-005, FE-003  
**Blocks:** CLEAN-003, FINAL-002  
**Application owner:** Documentation/backend owners  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Route declarations are split between two routers and manual frontend pathname handling, with an active duplicate.

#### Evidence

Section 8; `api.js`, `orderMapping.js`, `app.js`, `main.jsx`.

#### Required change

Create a generated-or-reviewed route map with method/path/owner/handler/contract/deprecation status.

#### Explicitly out of scope

No route changes.

#### Files likely affected

Route documentation and future validation command.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Extract route declarations.
2. Compare to frontend clients.
3. Mark aliases and duplicates.

#### Acceptance criteria

- Every current route is listed.
- Method/path/owner match source.
- Future route validation can detect drift.

#### Required validation

Static route scan, API client diff, route tests, and documentation review.

#### Rollback plan

Restore prior route doc only.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Route ownership is not documented outside source. | Section 8. |

### `DOC-005` Create data ownership documentation

**Severity:** HIGH  
**Phase:** 9 — Documentation  
**Status:** NOT STARTED  
**Dependencies:** OWN-008, DATA-002  
**Blocks:** CLEAN-001, CLEAN-002, FINAL-005  
**Application owner:** Documentation/data owners  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Runtime stores, databases, uploads, caches, logs, and browser/tooling state have no durable ownership guide.

#### Evidence

Section 7 and runtime inventory.

#### Required change

Document owner, readers, writers, schema/lifecycle, backup, retention, target, migration, and deletion gates.

#### Explicitly out of scope

No data move/delete.

#### Files likely affected

Data architecture documentation.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-007.

#### Implementation sequence

1. Use approved matrix.
2. Link schema/path evidence.
3. Mark unknowns and blocked cleanup.

#### Acceptance criteria

- All Section 7 stores are documented without records.
- No owner is inferred without evidence.
- Backup/retention rules are actionable.

#### Required validation

Path/schema review, link checks, and data-owner sign-off.

#### Rollback plan

Restore documentation file.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Data ownership is currently only in code/this audit. | Section 7. |

### `DOC-006` Create integration documentation

**Severity:** HIGH  
**Phase:** 9 — Documentation  
**Status:** NOT STARTED  
**Dependencies:** INT-001 through INT-007  
**Blocks:** META-003, FINAL-004  
**Application owner:** Documentation/integration owners  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Provider auth, API versions, retries, rate limits, errors, owners, and write safeguards are undocumented.

#### Evidence

Section 9 and provider source inventory.

#### Required change

Document Shopify, Shiprocket, Neon/PostgreSQL, SQLite, and future Meta boundaries without secrets.

#### Explicitly out of scope

No live integration or credential change.

#### Files likely affected

Integration runbook/docs.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-005, SAFE-007.

#### Implementation sequence

1. Use approved integration matrix.
2. Document contracts and failure handling.
3. Add operational owner/rotation links.

#### Acceptance criteria

- Every current integration has one documented owner.
- No secret values appear.
- Write operations list safety/rollback requirements.

#### Required validation

Source/docs diff, mock contract references, secret scan, and owner review.

#### Rollback plan

Restore docs only.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Integration behavior is code-only and duplicated. | Section 9. |

### `DOC-007` Create local development guide

**Severity:** MEDIUM  
**Phase:** 9 — Documentation  
**Status:** NOT STARTED  
**Dependencies:** OPS-002, SEC-005  
**Blocks:** FINAL-005  
**Application owner:** Documentation/operations  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

README does not explain workspace startup, env boundaries, tests, safe migrations, or app-specific flows.

#### Evidence

`README.md:42-60` documents only `npm install`, `npm run dev`, and a provider-coupled verify command.

#### Required change

Document prerequisites, safe commands, app URLs, mock/test modes, runtime paths, and prohibited live-data actions.

#### Explicitly out of scope

No command implementation in this documentation task.

#### Files likely affected

Development guide/README.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-007.

#### Implementation sequence

1. Use OPS-002/SEC-005 outputs.
2. Add per-app flow and safety notes.
3. Validate every path/command.

#### Acceptance criteria

- A new operator can run tests without live credentials.
- Destructive commands are clearly marked.
- Meta is not described as runnable.

#### Required validation

Command/path checks, clean checkout read, and owner review.

#### Rollback plan

Restore prior docs.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Local workflow documentation is incomplete. | README and package scripts. |

### `DOC-008` Create production startup guide

**Severity:** HIGH  
**Phase:** 9 — Documentation  
**Status:** NOT STARTED  
**Dependencies:** OPS-002, OPS-003, SEC-001  
**Blocks:** FINAL-002, FINAL-004  
**Application owner:** Documentation/operations  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

No production runbook defines startup, readiness, migration sequencing, runtime paths, or rollback.

#### Evidence

README is local-only; `index.js` performs startup side effects; no production guide exists under `docs`.

#### Required change

Document preflight, backups, migration, start/health, log review, shutdown, rollback, and secret handling.

#### Explicitly out of scope

No production execution.

#### Files likely affected

Production runbook.

#### Data impact

Potential operational/data impact if misused.

#### Backup prerequisite

SAFE-007, DATA-012.

#### Implementation sequence

1. Use validated OPS/SEC/DATA outputs.
2. Mark read-only/destructive steps.
3. Review with operator.

#### Acceptance criteria

- Runbook has abort/rollback gates.
- Startup does not hide migrations/provider failures.
- No secret values are present.

#### Required validation

Dry-run/read-only checklist, path/link checks, and operator sign-off.

#### Rollback plan

Restore prior runbook; no runtime change.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Production operations are undocumented. | `index.js`, docs inventory. |

### `DOC-009` Create backup and restore guide

**Severity:** CRITICAL  
**Phase:** 9 — Documentation  
**Status:** NOT STARTED  
**Dependencies:** SAFE-007, DATA-012  
**Blocks:** FINAL-003  
**Application owner:** Documentation/data owners  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

No durable guide explains backup/restore for Git, SQLite, PostgreSQL, runtime files, or secrets.

#### Evidence

`docs` contains only Meta migration documentation; no backup guide found.

#### Required change

Document exact safe procedures, verification, retention, access, and rollback for every store.

#### Explicitly out of scope

No backup or restore execution in documentation task.

#### Files likely affected

Backup/restore guide.

#### Data impact

Potential data impact if incorrectly executed.

#### Backup prerequisite

SAFE-007 and DATA-012.

#### Implementation sequence

1. Use tested procedures.
2. Add redacted examples.
3. Link task evidence and abort conditions.

#### Acceptance criteria

- Independent operator can restore each backup class.
- Secrets remain excluded from examples.
- Guide names the single ledger.

#### Required validation

Restore rehearsal reference, command review, and owner sign-off.

#### Rollback plan

Restore previous doc; do not alter backups.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Recovery procedure is not documented. | Docs inventory. |

### `DOC-010` Create migration and deprecation policy

**Severity:** HIGH  
**Phase:** 9 — Documentation  
**Status:** NOT STARTED  
**Dependencies:** BE-010, DATA-008, CLEAN-001  
**Blocks:** CLEAN-008, FINAL-005  
**Application owner:** Architecture/documentation  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Legacy Delivery Resolution, duplicate routes, database paths, and runtime artifacts have no formal deprecation gates.

#### Evidence

`delivery*` services, duplicate reorder route, migration scripts, and duplicate DB are all present without a policy.

#### Required change

Define owner proof, compatibility period, telemetry/evidence, backup prerequisite, deprecation notice, removal approval, and rollback.

#### Explicitly out of scope

No deprecation or deletion execution.

#### Files likely affected

Migration/deprecation policy and task records.

#### Data impact

Potential data/route impact later.

#### Backup prerequisite

SAFE-007.

#### Implementation sequence

1. Define policy gates.
2. Apply to current cleanup candidates.
3. Link each task’s evidence.

#### Acceptance criteria

- No deletion task can become READY without ownership/tests/backup.
- Compatibility and rollback requirements are explicit.

#### Required validation

Policy review, task dependency audit, and owner sign-off.

#### Rollback plan

Restore policy document only.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Deprecation gates are absent. | Legacy/duplicate inventory. |

### `DOC-011` Create ADRs and separate Shopify theme context

**Severity:** MEDIUM  
**Phase:** 9 — Documentation  
**Status:** NOT STARTED  
**Dependencies:** OWN-001, deferred user decisions  
**Blocks:** FINAL-006  
**Application owner:** Architecture/documentation  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

Architecture decisions and cross-project Shopify theme context can be confused with this repository’s application architecture.

#### Evidence

The project is adjacent to the Shopify theme in the same Git worktree; global memory distinguishes `entitled-shopify` from this project; no ADR directory exists.

#### Required change

Record approved architecture decisions in repository docs and explicitly state that theme/Obsidian context is separate, without modifying Obsidian in this project task.

#### Explicitly out of scope

No Obsidian modification during this task; no fabricated decisions.

#### Files likely affected

ADR/docs structure approved later.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. List decisions needing evidence.
2. Create ADR template.
3. Link project/theme boundary.

#### Acceptance criteria

- No final decision is fabricated.
- Theme changes are not listed as this repo architecture work.
- ADRs link task IDs and evidence.

#### Required validation

Path/link checks, decision review, and documentation audit.

#### Rollback plan

Restore docs only; retain history.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Architecture decision/context boundary is not documented. | Worktree and docs inventory. |

### `CLEAN-001` Classify and resolve legacy Delivery Resolution files

**Severity:** HIGH  
**Phase:** 10 — Cleanup  
**Status:** BLOCKED  
**Dependencies:** OWN-003, TEST-004, TEST-005, SAFE-003  
**Blocks:** DOC-010, FINAL-005  
**Application owner:** Architecture/data owners  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Legacy Delivery Resolution services overlap current Order Mapping and may own historical SQLite data.

#### Evidence

`deliveryRepository.js`, `deliveryShopify.js`, `legacyCsv.js`, `reconciliationService.js`, `statusMapper.js`, and `/delivery-resolution` redirect.

#### Required change

Classify each file as adapter, migration source, supported feature, or removable dead code; migrate/retire only after proof.

#### Explicitly out of scope

No deletion, rename, route removal, or data migration while blocked.

#### Files likely affected

Legacy delivery services, tests, migration/deprecation docs.

#### Data impact

Potential data migration required.

#### Backup prerequisite

SAFE-003, SAFE-004, SAFE-007.

#### Implementation sequence

1. Complete OWN-003.
2. Prove readers/writers and test replacement.
3. Migrate or deprecate one file at a time.

#### Acceptance criteria

- Every file has an approved disposition.
- Current Order Mapping behavior remains green.
- No legacy data is orphaned.

#### Required validation

Static callers, synthetic data mapping, route regression, database integrity, and owner sign-off.

#### Rollback plan

Restore the prior file/route from Git and data backup.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | BLOCKED | Ownership and regression proof are missing. | OWN-003, TEST-004, TEST-005. |

### `CLEAN-002` Resolve duplicate database artifacts

**Severity:** CRITICAL  
**Phase:** 10 — Cleanup  
**Status:** BLOCKED  
**Dependencies:** DATA-001, DATA-002, SAFE-007  
**Blocks:** FINAL-003, FINAL-005  
**Application owner:** Data owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

The nested SQLite database is tracked and may be an active or historical data source.

#### Evidence

`server/server/data/app.db` exists and is tracked; `server/data/app.db` is the configured default and ignored.

#### Required change

Retain, migrate, archive, or remove the duplicate only after owner, backup, schema, and restore evidence.

#### Explicitly out of scope

No database deletion or content exposure while blocked.

#### Files likely affected

Database artifact, config/ignore rules, migration docs.

#### Data impact

Database migration required.

#### Backup prerequisite

SAFE-003 and SAFE-007.

#### Implementation sequence

1. Complete DATA-001/002.
2. Back up and compare.
3. Execute approved disposition with rollback manifest.

#### Acceptance criteria

- Exactly one canonical active path is documented.
- Any archive is recoverable and excluded from runtime.
- No records are lost.

#### Required validation

SQLite integrity, startup, migration, restore, Git status, and regression checks.

#### Rollback plan

Restore the archived database and prior path configuration.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | BLOCKED | Duplicate DB ownership is unresolved. | Physical/tracked inventory. |

### `CLEAN-003` Resolve duplicate route handlers

**Severity:** CRITICAL  
**Phase:** 10 — Cleanup  
**Status:** NOT STARTED  
**Dependencies:** BE-011, TEST-003  
**Blocks:** FINAL-002, FINAL-005  
**Application owner:** Product Sorter/backend  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Duplicate `/collections/reorder-all` definitions remain a structural correctness risk.

#### Evidence

`api.js:1021-1065`.

#### Required change

Remove the duplicate only after BE-011 selects and tests the canonical adapter.

#### Explicitly out of scope

No cleanup before route/write acceptance.

#### Files likely affected

Sorter route module/tests.

#### Data impact

Potential Shopify write impact.

#### Backup prerequisite

SAFE-007, TEST-003.

#### Implementation sequence

1. Compare handlers.
2. Select canonical.
3. Delete duplicate and scan all route declarations.

#### Acceptance criteria

- One method/path handler remains.
- Alias and v2 tests pass.
- No behavior is silently lost.

#### Required validation

Static duplicate scan, route/mock Shopify tests, regression gate.

#### Rollback plan

Restore prior route file from commit.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Duplicate route cleanup is identified but not executed. | `api.js:1021-1065`. |

### `CLEAN-004` Classify dead components and disabled placeholders

**Severity:** LOW  
**Phase:** 10 — Cleanup  
**Status:** NOT STARTED  
**Dependencies:** FE-011, OWN-001  
**Blocks:** FINAL-005  
**Application owner:** Frontend  
**Risk level:** Low  
**Last updated:** 2026-07-29

#### Problem

Disabled labels and potentially unreachable branches are mixed with current navigation.

#### Evidence

`App.jsx:6-14,1218-1228` includes disabled Meta Ads, analytics, inventory, reports, and settings items; no Meta executable files exist.

#### Required change

Prove reachability and classify/remove only after tests and ownership review.

#### Explicitly out of scope

No Meta activation.

#### Files likely affected

Frontend components/navigation/docs.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Build reachability inventory.
2. Preserve any compatibility component.
3. Remove only proven dead code.

#### Acceptance criteria

- No executable feature is removed by label assumption.
- Disabled placeholders are accurately documented.

#### Required validation

Static reachability, browser navigation, build, accessibility, and regression.

#### Rollback plan

Restore removed component/navigation from commit.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Placeholder/dead-code disposition needs proof. | `App.jsx:6-14`. |

### `CLEAN-005` Remove or isolate Graphify generated clutter

**Severity:** LOW  
**Phase:** 10 — Cleanup  
**Status:** NOT STARTED  
**Dependencies:** OPS-005, DATA-010  
**Blocks:** FINAL-005, FINAL-006  
**Application owner:** Graphify tooling  
**Risk level:** Low  
**Last updated:** 2026-07-29

#### Problem

Multiple dated reports/caches and current Graphify files are tracked beside source.

#### Evidence

`graphify-out/` inventory and tracked-file size audit.

#### Required change

Keep only approved reproducible/report artifacts and isolate the rest after backup.

#### Explicitly out of scope

No Graphify refresh or deletion before OPS-005.

#### Files likely affected

Graphify output/ignore/docs.

#### Data impact

No application data impact.

#### Backup prerequisite

SAFE-006 and OPS-005.

#### Implementation sequence

1. Approve retention.
2. Verify reproducibility.
3. Clean/untrack only approved outputs.

#### Acceptance criteria

- Graphify can regenerate required artifacts.
- No architecture evidence is lost.
- Git cleanliness improves without changing app source.

#### Required validation

Graphify/read-only report comparison, Git status, clean checkout, and docs checks.

#### Rollback plan

Restore retained outputs from backup.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Generated Graphify output is tracked. | `graphify-out/`. |

### `CLEAN-006` Remove or isolate Playwright and Tokensave artifacts

**Severity:** LOW  
**Phase:** 10 — Cleanup  
**Status:** NOT STARTED  
**Dependencies:** OPS-006, OPS-007, DATA-010  
**Blocks:** FINAL-005  
**Application owner:** Tooling owners  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

Tool logs/database state are tracked or dirty in the application worktree.

#### Evidence

`.playwright-cli/*`, `.tokensave/tokensave.db`, and untracked WAL/SHM are in status/tracked inventory.

#### Required change

Separate reusable test assets from generated/tool runtime state and apply approved retention/tracking policy.

#### Explicitly out of scope

No tool DB reset, deletion, or E2E run.

#### Files likely affected

Tooling artifacts/ignore/docs.

#### Data impact

Tool runtime impact only.

#### Backup prerequisite

SAFE-006, OPS-006, OPS-007.

#### Implementation sequence

1. Prove consumers.
2. Back up retained state.
3. Isolate/untrack generated state.

#### Acceptance criteria

- Reusable tests remain available.
- Tool state is not mistaken for app data.
- Pre-existing dirty state is preserved or explicitly archived.

#### Required validation

Git/ignore checks, test discovery, tool owner review, and clean checkout simulation.

#### Rollback plan

Restore retained tool artifacts from backup.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Tool runtime artifacts are mixed with project state. | Tooling inventory/status. |

### `CLEAN-007` Remove or isolate test outputs

**Severity:** LOW  
**Phase:** 10 — Cleanup  
**Status:** NOT STARTED  
**Dependencies:** OPS-008, DATA-010  
**Blocks:** FINAL-005  
**Application owner:** Test tooling  
**Risk level:** Low  
**Last updated:** 2026-07-29

#### Problem

Test result state is tracked or stored near source without a retention rule.

#### Evidence

`test-results/.last-run.json` is present and tracked.

#### Required change

Retain only intentional fixtures/reports and isolate generated test output.

#### Explicitly out of scope

No test run or deletion before OPS-008.

#### Files likely affected

Test output/ignore/docs.

#### Data impact

No application data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Identify consumers.
2. Approve retention.
3. Clean/untrack generated output.

#### Acceptance criteria

- Test suite remains discoverable and reproducible.
- Generated output does not create source diffs.

#### Required validation

Test discovery, clean checkout, Git/ignore, and regression checks.

#### Rollback plan

Restore retained output from backup.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Test output is present in repository state. | `test-results/.last-run.json`. |

### `CLEAN-008` Resolve stale scripts and documentation

**Severity:** MEDIUM  
**Phase:** 10 — Cleanup  
**Status:** NOT STARTED  
**Dependencies:** OPS-001, DOC-001  
**Blocks:** FINAL-005  
**Application owner:** Operations/documentation  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

Broken `dev.mjs`, sorter-only README, missing `.env.example`, and historical references can mislead operators.

#### Evidence

`scripts/dev.mjs`, `README.md`, absent `.env.example`, Meta historical doc, and tracked `codex-staged-work.diff`/`codex-uncommitted-work.diff` artifacts.

#### Required change

Update or retire stale items only after usage and ownership proof.

#### Explicitly out of scope

No unrelated documentation cleanup or Meta source copy.

#### Files likely affected

Scripts/docs.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-002.

#### Implementation sequence

1. Search callers/links.
2. Update approved docs/scripts.
3. Verify clean command inventory.

#### Acceptance criteria

- No documented command is broken.
- Historical Meta doc remains historical, not executable.
- Stale claims are removed or labeled.

#### Required validation

Static link/script checks, docs review, and regression gate.

#### Rollback plan

Restore prior docs/script files.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Script/documentation drift is confirmed. | Script/README evidence. |

### `CLEAN-009` Review unused dependencies, orphan uploads/exports, and old migration helpers

**Severity:** MEDIUM  
**Phase:** 10 — Cleanup  
**Status:** NOT STARTED  
**Dependencies:** OWN-008, DATA-011, DOC-010  
**Blocks:** FINAL-005  
**Application owner:** Architecture owners  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

Dependencies, old migration helpers, temp uploads, and exports may be unused or orphaned, but ownership is not proven.

#### Evidence

Package manifests, `migrateOrderMappingLegacy.js`, OS temp upload destinations, and runtime/export inventory.

#### Required change

Audit actual callers/retention and remove only proven unused dependencies/files after tests and backup.

#### Explicitly out of scope

No dependency or file deletion during audit.

#### Files likely affected

Package manifests/lockfile, migration helpers, runtime cleanup policy.

#### Data impact

Potential runtime/data impact.

#### Backup prerequisite

SAFE-006, DATA-011.

#### Implementation sequence

1. Search import/script callers.
2. Identify retained historical data.
3. Remove only approved dead items and verify lockfile intentionally.

#### Acceptance criteria

- Every removal has zero-caller and ownership evidence.
- Upload/export retention is explicit.
- Existing tests/build remain green.

#### Required validation

Dependency audit, static caller scan, tests, build, and repository cleanliness.

#### Rollback plan

Restore files/dependencies from commit and backup; never reconstruct records manually.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Cleanup candidates require ownership proof. | Manifests, scripts, runtime inventory. |

### `META-001` Define isolated Meta Ads boundary and feature flags

**Severity:** HIGH  
**Phase:** 11 — Meta Ads rebuild  
**Status:** DEFERRED  
**Dependencies:** FINAL-007, DOC-003  
**Blocks:** META-002 through META-008  
**Application owner:** Future Meta Ads  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Meta Ads is not executable in this repository; rebuilding before core stabilization would reintroduce the documented legacy coupling.

#### Evidence

Only disabled `meta-ads` label exists in `App.jsx`; historical context is `docs/meta-ads/META_ADS_APP_MIGRATION.md`, whose recommended destination is an isolated app path.

#### Required change

After FINAL-007 approval, define an isolated Meta app/workspace boundary and feature flags.

#### Explicitly out of scope

No Meta code, route, dependency, credential, or Graphify change now.

#### Files likely affected

Future `client/src/apps/meta-ads`/isolated app, server router, docs.

#### Data impact

Potential new persistence; none now.

#### Backup prerequisite

FINAL-003 through FINAL-007.

#### Implementation sequence

1. Re-read historical migration document.
2. Approve boundary/flags.
3. Create only after core sign-off.

#### Acceptance criteria

- Meta remains non-executable until approved.
- Boundary does not import app business logic from current apps.
- Feature flag defaults off.

#### Required validation

Architecture review, dependency scan, bundle/security checks, and plan update.

#### Rollback plan

Disable flag and remove isolated code only through a later approved task.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | DEFERRED | Explicitly waits for core architecture stabilization. | Meta document and disabled label. |

### `META-002` Define Meta frontend route and navigation

**Severity:** HIGH  
**Phase:** 11 — Meta Ads rebuild  
**Status:** DEFERRED  
**Dependencies:** META-001, FE-003  
**Blocks:** META-004, META-005  
**Application owner:** Future Meta Ads  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

No Meta frontend route exists and the current label is disabled.

#### Evidence

`App.jsx:10` marks Meta disabled; no Meta source exists outside migration documentation.

#### Required change

Define a route/navigation boundary only after META-001, defaulting unavailable until read-only tests pass.

#### Explicitly out of scope

No route or navigation implementation now.

#### Files likely affected

Future Meta frontend route/navigation and docs.

#### Data impact

No current data impact.

#### Backup prerequisite

FINAL-007.

#### Implementation sequence

1. Define route contract.
2. Add feature flag.
3. Add read-only navigation tests.

#### Acceptance criteria

- Disabled/default-off behavior is safe.
- No current app route changes.
- Direct URL behavior is explicit.

#### Required validation

Browser route, feature-flag, bundle, and regression tests.

#### Rollback plan

Disable flag and restore navigation state.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | DEFERRED | No executable Meta frontend exists. | `App.jsx:10`. |

### `META-003` Define Meta backend router and transport

**Severity:** HIGH  
**Phase:** 11 — Meta Ads rebuild  
**Status:** DEFERRED  
**Dependencies:** META-001, INT-010, SEC-009  
**Blocks:** META-004 through META-008  
**Application owner:** Future Meta Ads  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Historical Meta implementation had large route/service coupling; copying it before current router/integration stabilization is unsafe.

#### Evidence

`META_ADS_APP_MIGRATION.md` documents old `/api/meta*` routes, large builder modules, no end-user auth, and backend-only credentials.

#### Required change

Create a read-only-first Meta transport/router boundary with version, auth, retry, pagination, errors, and observability contracts.

#### Explicitly out of scope

No Meta client, route, dependency, or credential now.

#### Files likely affected

Future Meta router/transport/tests/docs.

#### Data impact

Potential new runtime/persistence.

#### Backup prerequisite

FINAL-004 and META-001.

#### Implementation sequence

1. Reuse no source snapshot blindly.
2. Define transport contract and secret boundary.
3. Implement read-only path first.

#### Acceptance criteria

- Meta code is isolated.
- Secrets remain backend-only.
- Write routes are unavailable by default.

#### Required validation

Mocked Meta contract, auth/security, route, bundle, and regression tests.

#### Rollback plan

Disable/remove isolated Meta boundary without touching current apps.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | DEFERRED | Historical app explicitly requires isolated rebuild. | Meta migration doc §§2,7-9,19-20. |

### `META-004` Rebuild read-only account, campaigns, ad sets, and ads

**Severity:** HIGH  
**Phase:** 11 — Meta Ads rebuild  
**Status:** DEFERRED  
**Dependencies:** META-001 through META-003  
**Blocks:** META-005, META-007  
**Application owner:** Future Meta Ads  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

The requested Meta domains are not current application functionality and historical builder writes were coupled.

#### Evidence

Historical document API reference covers account/campaign/ad set/ad paths; destination has none.

#### Required change

Rebuild read-only account/campaign/ad-set/ad views with explicit response contracts before any write capability.

#### Explicitly out of scope

No write operation, live account, or Meta credential now.

#### Files likely affected

Future Meta feature/router/tests.

#### Data impact

Potential read cache only after approval.

#### Backup prerequisite

META-003 and FINAL-004.

#### Implementation sequence

1. Define read contracts.
2. Add mocks/tests.
3. Implement behind flag.

#### Acceptance criteria

- Read-only flows pass with mocked provider.
- Write controls are absent/denied.
- Current apps regress zero.

#### Required validation

Unit, route, browser, provider mock, bundle/security, and regression tests.

#### Rollback plan

Disable Meta flag; no current app change.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | DEFERRED | Read-only Meta rebuild awaits core sign-off. | Meta status in document control. |

### `META-005` Rebuild insights, audiences, and creatives read paths

**Severity:** HIGH  
**Phase:** 11 — Meta Ads rebuild  
**Status:** DEFERRED  
**Dependencies:** META-004  
**Blocks:** META-007  
**Application owner:** Future Meta Ads  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Insights, audiences, and creatives have no destination implementation and require provider-specific pagination/field handling.

#### Evidence

Historical document sections/API list; no current source path.

#### Required change

Add read-only contracts and isolated modules for these domains after initial account reads are stable.

#### Explicitly out of scope

No audience mutation, creative publish, or campaign writes.

#### Files likely affected

Future Meta features/transport/tests.

#### Data impact

Potential read cache only.

#### Backup prerequisite

META-004 and FINAL-004.

#### Implementation sequence

1. Define field/pagination contracts.
2. Add provider mocks.
3. Implement read-only features behind flag.

#### Acceptance criteria

- All read paths are tested and bounded.
- Sensitive payloads are sanitized.
- No write endpoint is reachable.

#### Required validation

Mocked integration, route/browser, security, and regression tests.

#### Rollback plan

Disable the feature flag and remove only isolated code via approved task.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | DEFERRED | Future read domains are intentionally postponed. | Historical Meta document. |

### `META-006` Define Meta persistence and authentication

**Severity:** CRITICAL  
**Phase:** 11 — Meta Ads rebuild  
**Status:** DEFERRED  
**Dependencies:** META-003, SEC-001 through SEC-005  
**Blocks:** META-007, META-008  
**Application owner:** Future Meta Ads  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Historical Meta app used backend env credentials without user auth and local files/in-memory jobs; neither is acceptable as an unreviewed destination pattern.

#### Evidence

Historical document §§8-10,15 describe backend-only token, no user auth, local uploads/exports/audit, and in-memory export jobs.

#### Required change

Choose persistence, tenant/account ownership, auth, authorization, token storage, and job durability before writes.

#### Explicitly out of scope

No Meta persistence/auth implementation now.

#### Files likely affected

Future Meta config/auth/data/docs/tests.

#### Data impact

Potential new database/runtime data.

#### Backup prerequisite

FINAL-003/004 and approved Meta data design.

#### Implementation sequence

1. Threat-model account/token ownership.
2. Decide persistence/job model.
3. Implement only after review.

#### Acceptance criteria

- Auth and data ownership are explicit.
- Tokens never enter frontend bundles/logs.
- Durable jobs have retry/cleanup/rollback policy.

#### Required validation

Security, persistence, migration, route, and recovery tests.

#### Rollback plan

Disable Meta feature and restore isolated data store from backup.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | DEFERRED | Auth/persistence requires future decision. | Historical Meta document §§10,15. |

### `META-007` Add Meta tests, write safeguards, and observability

**Severity:** CRITICAL  
**Phase:** 11 — Meta Ads rebuild  
**Status:** DEFERRED  
**Dependencies:** META-004 through META-006  
**Blocks:** META-008, FINAL-007  
**Application owner:** Future Meta Ads  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Historical builder/control flows include partial creation and writes; a rebuild needs stronger gates than source copying.

#### Evidence

Historical document §§2,7,14,16-18 describes builder writes, partial state, in-memory jobs, and missing user auth.

#### Required change

Add unit/integration/E2E tests, dry-run/preflight, paused/default-safe writes, idempotency, audit, rate-limit/error handling, and alerts.

#### Explicitly out of scope

No Meta write implementation now.

#### Files likely affected

Future Meta tests/guards/observability.

#### Data impact

Potential external Meta write impact.

#### Backup prerequisite

META-006 and FINAL-003.

#### Implementation sequence

1. Build read-only test gate.
2. Add write safeguards only with explicit approval.
3. Rehearse partial-failure recovery.

#### Acceptance criteria

- No write path is enabled by default.
- Partial operations are recoverable/audited.
- Existing apps pass full regression.

#### Required validation

Full Meta unit/integration/E2E, security, mock provider, audit, and rollback tests.

#### Rollback plan

Disable all flags and restore isolated Meta state.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | DEFERRED | Meta writes wait for explicit safety gate. | Historical Meta document and principles. |

### `META-008` Roll out Meta safely to production

**Severity:** HIGH  
**Phase:** 11 — Meta Ads rebuild  
**Status:** DEFERRED  
**Dependencies:** META-007, FINAL-007  
**Blocks:** FINAL-007  
**Application owner:** Future Meta Ads  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Meta is not ready for rollout and must not be smuggled into core architecture work.

#### Evidence

Destination contains no Meta executable code; current label is disabled; historical document recommends isolated rebuild and write switches off.

#### Required change

Define staged read-only rollout, feature flags, monitoring, rollback, and later write approval.

#### Explicitly out of scope

No rollout or external Meta action now.

#### Files likely affected

Future rollout/docs/observability.

#### Data impact

Potential external account impact.

#### Backup prerequisite

FINAL-003 through FINAL-007.

#### Implementation sequence

1. Stage internal read-only.
2. Validate telemetry and rollback.
3. Make separate decision for writes.

#### Acceptance criteria

- Core architecture sign-off precedes Meta work.
- Rollback is tested.
- Write operations require a separate approval.

#### Required validation

Release, security, route, data, observability, and regression checks.

#### Rollback plan

Disable Meta flags and revert isolated deployment.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | DEFERRED | Meta rollout is downstream of core stabilization. | Document control and Meta migration doc. |

### `FINAL-001` Run full test and coverage gate

**Severity:** CRITICAL  
**Phase:** 12 — Final validation  
**Status:** NOT STARTED  
**Dependencies:** TEST-012 and all implementation phases  
**Blocks:** FINAL-002 through FINAL-008  
**Application owner:** Architecture owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Current tests are fragmented and no 80% coverage/regression gate exists.

#### Evidence

Only four test files exist; root has no test script; one server suite expects a live `DATABASE_URL`.

#### Required change

Run the approved full unit/integration/E2E suite with isolated providers and enforce the project coverage target.

#### Explicitly out of scope

No implementation change during validation.

#### Files likely affected

Test output outside source and this ledger evidence.

#### Data impact

No production data impact.

#### Backup prerequisite

SAFE-007 and disposable test DBs.

#### Implementation sequence

1. Run static/unit tests.
2. Run isolated integration/E2E.
3. Record coverage and failures.

#### Acceptance criteria

- All required suites pass.
- Coverage target is met or an explicit approved exception exists.
- No live production provider/database is used.

#### Required validation

Unit, integration, E2E, route, migration, startup, security, and coverage checks.

#### Rollback plan

No code rollback; fix failing task before sign-off.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Final suite is not yet available. | Test inventory. |

### `FINAL-002` Verify all routes and startup behavior

**Severity:** CRITICAL  
**Phase:** 12 — Final validation  
**Status:** NOT STARTED  
**Dependencies:** BE-005, FE-003, OPS-002, TEST-008  
**Blocks:** FINAL-008  
**Application owner:** Architecture owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Route ownership and startup side effects are high-risk migration surfaces.

#### Evidence

Section 8; `app.js`, `main.jsx`, `index.js`; duplicate reorder route in baseline.

#### Required change

Verify every frontend/backend route, redirect, status/body contract, static fallback, startup prerequisite, and health endpoint.

#### Explicitly out of scope

No route change while validating.

#### Files likely affected

Validation outputs and this ledger.

#### Data impact

No production data impact.

#### Backup prerequisite

SAFE-007.

#### Implementation sequence

1. Run route inventory/contract suite.
2. Run startup matrix without live writes.
3. Verify browser refresh/redirects.

#### Acceptance criteria

- All routes pass compatibility checks.
- Startup and health behavior match docs.
- No duplicate/unknown handler remains.

#### Required validation

Route, startup, browser, static fallback, and regression tests.

#### Rollback plan

Fail sign-off and return to the last completed task; do not patch during final validation.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Final route/startup evidence does not exist. | Section 8 and entry-point evidence. |

### `FINAL-003` Verify data integrity and restore evidence

**Severity:** CRITICAL  
**Phase:** 12 — Final validation  
**Status:** NOT STARTED  
**Dependencies:** DATA-009, DATA-012, SAFE-007  
**Blocks:** FINAL-008  
**Application owner:** Data owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Architecture cannot be signed off without proving runtime/database integrity and recovery.

#### Evidence

Two SQLite paths, mixed tables, JSON/JSONL caches, and PostgreSQL schema are present; backup/restore is unconfirmed.

#### Required change

Run final read-only integrity, migration-state, backup-hash, restore, and representative application checks.

#### Explicitly out of scope

No production data correction or deletion.

#### Files likely affected

External validation output and ledger evidence.

#### Data impact

Potential database migration validation only.

#### Backup prerequisite

SAFE-007, DATA-012.

#### Implementation sequence

1. Verify backups/hashes.
2. Restore isolated targets.
3. Run read-only app checks and record risks.

#### Acceptance criteria

- All owned stores pass integrity checks.
- Restore procedures pass.
- No unowned/unknown store is silently discarded.

#### Required validation

SQLite/PostgreSQL integrity, migration, restore, runtime path, and data ownership checks.

#### Rollback plan

Use tested restore procedure; block sign-off on any failure.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Recovery is not proven. | SAFE/DATA task status. |

### `FINAL-004` Audit dependencies, environment, and security

**Severity:** CRITICAL  
**Phase:** 12 — Final validation  
**Status:** NOT STARTED  
**Dependencies:** SEC-001 through SEC-009, INT-010  
**Blocks:** FINAL-007, FINAL-008  
**Application owner:** Security owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Security boundaries, env validation, provider contracts, dependency risk, and secret handling are not yet complete.

#### Evidence

Section 8; no auth middleware; tracked token cache; coupled env; duplicated clients.

#### Required change

Complete security/dependency/env/integration audit with no critical unresolved finding.

#### Explicitly out of scope

No new Meta functionality.

#### Files likely affected

Audit outputs/docs and ledger evidence.

#### Data impact

Potential security impact.

#### Backup prerequisite

SAFE-005, SAFE-007.

#### Implementation sequence

1. Run secret/dependency/bundle scans.
2. Run auth/env/provider tests.
3. Resolve or explicitly accept residual risks.

#### Acceptance criteria

- No critical security issue remains open.
- Secret/bundle scans pass.
- Env/provider contracts are documented and tested.

#### Required validation

Security, dependency, environment, bundle, auth, route, and regression checks.

#### Rollback plan

Block sign-off; return to the responsible task rather than waiving silently.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Final security gate has not run. | SEC/INT task status. |

### `FINAL-005` Verify repository cleanliness and documentation accuracy

**Severity:** HIGH  
**Phase:** 12 — Final validation  
**Status:** NOT STARTED  
**Dependencies:** CLEAN-001 through CLEAN-009, DOC-001 through DOC-011  
**Blocks:** FINAL-006, FINAL-008  
**Application owner:** Architecture owner  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

The enclosing Git worktree contains unrelated dirty sibling changes and project-generated artifacts; documentation may drift during restructuring.

#### Evidence

Baseline status in document control and generated/tracked inventory.

#### Required change

Verify project-scoped cleanliness, expected generated files, source/runtime separation, links, commands, and docs against code.

#### Explicitly out of scope

No automatic revert of unrelated sibling changes.

#### Files likely affected

Validation output and ledger.

#### Data impact

No data impact.

#### Backup prerequisite

SAFE-007.

#### Implementation sequence

1. Compare against scoped baseline manifest.
2. Review project diff/status.
3. Validate docs and generated-file policy.

#### Acceptance criteria

- Only approved project changes are present.
- Sibling dirty state is unchanged and reported separately.
- Documentation links/current commands are accurate.

#### Required validation

Git status/diff, link/script checks, clean checkout, and documentation review.

#### Rollback plan

Do not revert unexpected changes; stop and report for owner direction.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Final project-scoped cleanliness check is pending. | Baseline manifest/status. |

### `FINAL-006` Refresh Graphify and Obsidian project context

**Severity:** MEDIUM  
**Phase:** 12 — Final validation  
**Status:** NOT STARTED  
**Dependencies:** FINAL-005, explicit tooling approval  
**Blocks:** FINAL-008  
**Application owner:** Documentation/tooling owners  
**Risk level:** Medium  
**Last updated:** 2026-07-29

#### Problem

Architecture knowledge can drift from source, but Graphify and Obsidian are separate write surfaces and are prohibited during this audit.

#### Evidence

Graphify artifacts exist; global Obsidian memory is external; this task made no Obsidian change and did not run `graphify update`.

#### Required change

After implementation and explicit approval, refresh Graphify and relevant project memory, recording outputs without secrets.

#### Explicitly out of scope

No Graphify/Obsidian modification in the current audit.

#### Files likely affected

External Graphify/Obsidian artifacts and evidence.

#### Data impact

No application data impact.

#### Backup prerequisite

SAFE-007 and FINAL-005.

#### Implementation sequence

1. Confirm source is final.
2. Run approved read/write refresh.
3. Compare architecture references and record stale items.

#### Acceptance criteria

- Graph and project notes match final code.
- Theme context remains separate.
- No secret/customer data is written.

#### Required validation

Graph/notes comparison, project status, and documentation review.

#### Rollback plan

Restore external artifacts through their approved mechanism; do not alter source.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Refresh is intentionally deferred and prohibited in this audit. | User safety rules; current artifacts. |

### `FINAL-007` Make the Meta Ads readiness decision

**Severity:** HIGH  
**Phase:** 12 — Final validation  
**Status:** NOT STARTED  
**Dependencies:** FINAL-001 through FINAL-006  
**Blocks:** META-001, META-008, FINAL-008  
**Application owner:** Architecture/product owners  
**Risk level:** High  
**Last updated:** 2026-07-29

#### Problem

Meta rebuild timing must be evidence-based, not inferred from a disabled label or historical source snapshot.

#### Evidence

Meta is documentation-only; core architecture has not yet passed final validation.

#### Required change

Record a go/no-go decision for isolated Meta planning based on test, security, data, route, backup, and operational evidence.

#### Explicitly out of scope

No Meta implementation.

#### Files likely affected

This ledger and future decision log.

#### Data impact

No current data impact.

#### Backup prerequisite

FINAL-001 through FINAL-006.

#### Implementation sequence

1. Review all final evidence.
2. Record decision and residual risks.
3. Unlock or retain DEFERRED Meta tasks.

#### Acceptance criteria

- Decision names exact evidence and owner.
- No Meta task becomes READY without the decision.
- Write capability remains separately gated.

#### Required validation

Architecture/security/product review and plan count update.

#### Rollback plan

Keep Meta tasks DEFERRED and append a changed decision.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Meta readiness is intentionally undecided. | Document control and final gates. |

### `FINAL-008` Sign off architecture completion

**Severity:** CRITICAL  
**Phase:** 12 — Final validation  
**Status:** NOT STARTED  
**Dependencies:** FINAL-001 through FINAL-007  
**Blocks:** None  
**Application owner:** Architecture owner  
**Risk level:** Critical  
**Last updated:** 2026-07-29

#### Problem

Without a final evidence-backed sign-off, restructuring can be declared complete while tests, backups, docs, or risks remain unresolved.

#### Evidence

This master plan requires task-level evidence and completion counts; current architecture is at Phase 0.

#### Required change

Sign off only after all required tasks are completed/deferred with approved decisions and progress totals match records.

#### Explicitly out of scope

No new implementation or task bypass.

#### Files likely affected

This plan’s progress/sign-off sections.

#### Data impact

No data impact.

#### Backup prerequisite

All safety and restore tasks.

#### Implementation sequence

1. Recalculate task/status/severity/phase counts.
2. Review risks and deferred decisions.
3. Record sign-off and remaining risks.

#### Acceptance criteria

- Every completed task has evidence/files/tests/risks/history.
- No critical open risk is hidden.
- Existing apps and routes are verified.

#### Required validation

Full final suite, route/data/security/docs/cleanliness audits, and owner sign-off.

#### Rollback plan

No sign-off; reopen the failing task and preserve all history.

#### Completion evidence

Not completed.

#### Change history

| Date | Status change | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-07-29 | NOT STARTED | Architecture sign-off is not available. | Final validation requirements. |

## 12. Phase 0 — Safety and recoverability

Execution order is `SAFE-001` → `SAFE-002` → `SAFE-003`/`SAFE-004`/`SAFE-005` → `SAFE-006` → `SAFE-007`, with `SAFE-008` recording unresolved database ownership. This phase covers Git backup, working-tree backup, SQLite backup, PostgreSQL/Neon backup, encrypted secret archive, off-device copy, restoration instructions, and database ownership uncertainty. No data relocation or deletion is permitted before the relevant evidence exists.

## 13. Phase 1 — Regression protection

`TEST-001` through `TEST-012` cover sorter core/scoring, collection sync, apply/rollback, reorder contracts, Order Mapping sync/status, CSV import, manual overrides, SKU media, Sales Intelligence APIs, route preservation, migration safety, server startup, environment isolation, frontend navigation, and the integrated existing-app gate. These tasks are prerequisites for restructuring, not optional post-work.

## 14. Phase 2 — Ownership and boundary definition

`OWN-001` through `OWN-010` establish canonical names, Sorter, Order Mapping, SKU Image Manager, Sales Intelligence, diagnostics, legacy Delivery Resolution classification, route ownership, data ownership, runtime ownership, integration ownership, and environment-variable ownership. Unknown ownership remains an explicit blocker.

## 15. Phase 3 — Backend restructuring

`BE-001` through `BE-011` split the generic router into Sorter/SKU/Sales boundaries, preserve URLs with adapters, create application-owned services, remove hidden cross-app imports, standardize validation/errors/logging, isolate startup migrations, add backend route contract coverage through `TEST-008`/`BE-005`, and resolve duplicate collection reorder handlers. Business logic remains app-owned while transport becomes genuinely shared.

## 16. Phase 4 — Frontend restructuring

`FE-001` through `FE-011` extract the shell and navigation, introduce explicit routing while preserving URLs, extract Sorter/SKU features, retain Order Mapping compatibility, separate state/API clients/styles, add feature error/loading boundaries, add frontend regression coverage, and classify disabled placeholders. Meta remains disabled.

## 17. Phase 5 — Integration consolidation

`INT-001` through `INT-010` inventory Shopify and Shiprocket clients, define shared transport, keep business logic app-owned, standardize authentication/retries/rate limits/error mapping, add integration mocks, remove duplicate clients only after usage proof, and verify provider/API-version contracts. Neon/PostgreSQL and SQLite ownership remain separate data decisions.

## 18. Phase 6 — Data and runtime architecture

`DATA-001` through `DATA-012` resolve the duplicate SQLite path, document table ownership, separate Sorter/SKU/Sales/Order Mapping runtime data, make paths configurable, add migration and rollback tools, correct ignore/tracking policy, define retention, and validate PostgreSQL backup/restore. No deletion task can bypass backup and ownership evidence.

## 19. Phase 7 — Operational tooling

`OPS-001` through `OPS-009` fix or retire obsolete `scripts/dev.mjs`, standardize startup and health commands, define diagnostics, classify Graphify/Tokensave/Playwright/test outputs, and add safe backup, architecture-validation, and repository-cleanliness commands. `OPS-ARCH-001` defines the future automated guard for required ledger updates. Graphify/Obsidian remain unchanged during the audit.

## 20. Phase 8 — Security and configuration

`SEC-001` through `SEC-009` assess authentication, add route authorization, handle tracked/runtime secrets, validate environment schemas, isolate app-specific env requirements, sanitize logs/errors, review CORS/CSRF, audit dependencies, document credential rotation, and guard future Meta secrets from frontend bundles.

## 21. Phase 9 — Documentation

`DOC-001` through `DOC-011` update README, create `.env.example`, application/route/data/integration maps, local and production guides, backup/restore guide, migration/deprecation policy, ADRs, and a clear separation between this repository and Shopify theme/Obsidian context. Documentation must reflect verified code, not historical assumptions.

## 22. Phase 10 — Cleanup

`CLEAN-001` through `CLEAN-009` cover legacy Delivery Resolution, duplicate databases/routes, dead components/placeholders, Graphify, Playwright, Tokensave, test outputs, stale scripts/docs, unused dependencies, orphan uploads/exports, and old migration helpers. Every deletion/cleanup task is dependent on ownership, tests, backup, and rollback evidence.

## 23. Phase 11 — Meta Ads rebuild

`META-001` through `META-008` are all `DEFERRED`. They cover the isolated boundary/feature flags, frontend route/navigation, backend router/transport, read-only account/campaign/ad-set/ad views, insights/audiences/creatives, persistence/authentication, tests/write safeguards/observability, and staged production rollout. Reference `docs/meta-ads/META_ADS_APP_MIGRATION.md` for history only; do not duplicate its source snapshot or rebuild it before `FINAL-007`.

## 24. Phase 12 — Final validation

`FINAL-001` through `FINAL-008` cover the full test/coverage gate, route/startup verification, data integrity and restore proof, dependency/environment/security audit, repository cleanliness and documentation accuracy, approved Graphify/Obsidian refresh, Meta readiness decision, and architecture sign-off. A final sign-off requires all acceptance/evidence conditions and matching counts.

## 25. Deferred decisions

| Decision ID | Options | Evidence required | Deadline or prerequisite | Current recommendation | Final decision |
| --- | --- | --- | --- | --- | --- |
| DEC-001 | Single frontend; separate frontend workspaces; hybrid shell/features | FE boundary tests, build/deploy constraints, route compatibility | FE-001 through FE-011 | Keep one frontend workspace with explicit feature boundaries initially. | Not decided. |
| DEC-002 | Single API process; separate services; hybrid routers | Operational load, deployment constraints, route contracts | BE-001 through BE-011 | Keep one Express process with app-owned routers initially. | Not decided. |
| DEC-003 | SQLite per app; shared SQLite; PostgreSQL ownership | Backup/restore, data volume, transaction requirements | SAFE-003/004, OWN-008, DATA-001/012 | Preserve data first; separate ownership before provider migration. | Not decided. |
| DEC-004 | Sales Intelligence backend-only; user-facing app; reporting workspace | Consumer inventory, security, performance, product decision | OWN-005, TEST-007 | Keep backend service until a user-facing owner is approved. | Not decided. |
| DEC-005 | Diagnostics shared feature; independent app; operational-only service | Auth, data sensitivity, operator workflow | OWN-006, SEC-001 | Shared diagnostics contract with app-owned producers. | Not decided. |
| DEC-006 | Runtime inside repo; configurable external root; managed storage | Backup/restore, deployment, retention | DATA-003 through DATA-011 | Introduce configurable roots first; move outside repo only with proof. | Not decided. |
| DEC-007 | Meta workspace; feature module; separate service | Core completion, auth/persistence, provider contract | FINAL-007, META-001 | Isolated feature/workspace boundary after core sign-off. | Not decided. |

## 26. Risk register

| Risk ID | Description | Severity | Likelihood | Impact | Mitigation | Trigger | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RISK-001 | Data loss during SQLite/PostgreSQL/runtime relocation | CRITICAL | Medium | Critical | SAFE-003/004/007, DATA-008/009 | Unverified backup/restore | Open |
| RISK-002 | Route regression from shell/router extraction | CRITICAL | High | High | TEST-008, BE-005, FE-003 | Contract mismatch | Open |
| RISK-003 | Shopify write/reorder regression | CRITICAL | Medium | Critical | TEST-002/003, INT-010 | Job/status mismatch | Open |
| RISK-004 | Order Mapping sync/status regression | HIGH | Medium | High | TEST-004/005, provider mocks | Terminal/manual rule failure | Open |
| RISK-005 | Migration failure or hidden startup side effect | CRITICAL | Medium | Critical | TEST-009, BE-010, DATA-012 | Startup/migration error | Open |
| RISK-006 | Environment/secret leakage | CRITICAL | Medium | Critical | SAFE-005, SEC-003/006/009 | Secret scan or log finding | Open |
| RISK-007 | Runtime path breakage | HIGH | Medium | High | DATA-007/008/009 | Missing/unwritable path | Open |
| RISK-008 | Duplicate database confusion | CRITICAL | High | Critical | OWN-008, DATA-001, CLEAN-002 | Divergent DB state | Open |
| RISK-009 | Legacy code deleted before ownership proof | HIGH | Medium | High | OWN-003, DOC-010, CLEAN-001 | Unknown caller/data | Open |
| RISK-010 | Integration client drift | HIGH | High | High | INT-001 through INT-010 | Divergent retry/status behavior | Open |
| RISK-011 | Meta credential exposure | CRITICAL | Medium | Critical | META-003/006/007, SEC-009 | Token in client/log | Open |
| RISK-012 | Incomplete backup | CRITICAL | Medium | Critical | SAFE-003 through SAFE-007 | Restore failure | Open |
| RISK-013 | Big-bang refactor | HIGH | High | High | Incremental dependencies, rollback per task | Multiple app failures | Open |
| RISK-014 | Architecture changes bypass the master ledger | HIGH | Medium | High | OPS-ARCH-001, mandatory session protocol, and explicit bypass audit | Architecture-related change without a plan diff | Open |

## 27. Decision log

| Decision ID | Date | Decision | Rationale | Alternatives rejected | Consequences |
| --- | --- | --- | --- | --- | --- |
| DECLOG-001 | 2026-07-29 | Meta Ads remains documentation-only and deferred. | Destination has no executable Meta code; core architecture is not stabilized. | Rebuild now; copy historical source snapshot. | META tasks remain `DEFERRED`. |
| DECLOG-002 | 2026-07-29 | This file is the sole architecture execution ledger. | Prevents competing checklists and unverifiable completion. | Separate task lists; code comments as checklist. | Future work must update this document. |
| DECLOG-003 | 2026-07-29 | No implementation occurred during the audit. | User explicitly prohibited architecture changes. | Opportunistic fixes; cleanup while inspecting. | All task records remain pending/deferred/blocked. |
| DECLOG-004 | 2026-07-29 | Project scope is narrower than Git worktree scope. | Git top-level is the enclosing Entitled directory with unrelated dirty siblings. | Broad worktree cleanup. | All future commands must use project-scoped paths. |

## 28. Progress summary

Counts below are derived from the 129 task records in Section 10 and must be recalculated after every task update.

| Metric | Count |
| --- | ---: |
| Total tasks | 129 |
| Not started | 115 |
| Ready | 2 |
| Blocked | 4 |
| In progress | 0 |
| Validation pending | 0 |
| Completed | 0 |
| Deferred | 8 |
| Cancelled | 0 |
| Completion percentage | 0% |

Severity counts: `CRITICAL` 38, `HIGH` 68, `MEDIUM` 17, `LOW` 6. Phase counts: Phase 0 — 8; Phase 1 — 12; Phase 2 — 10; Phase 3 — 11; Phase 4 — 11; Phase 5 — 10; Phase 6 — 12; Phase 7 — 10; Phase 8 — 9; Phase 9 — 11; Phase 10 — 9; Phase 11 — 8; Phase 12 — 8. These totals must match the task index and detailed records; a mismatch blocks sign-off.

## 29. Current execution focus

- Current phase: Phase 0 — Safety and recoverability.
- Current approved task IDs: `SAFE-001`, `SAFE-002` only.
- Blocked tasks: `SAFE-007`, `DATA-001`, `CLEAN-001`, `CLEAN-002` pending backups/ownership/regression evidence.
- Immediate execution order: `SAFE-001`, then `SAFE-002`; these are validation and evidence-recording tasks. Verify and reuse existing backups and manifests rather than recreating them unnecessarily. After those, recommend `SAFE-003`, `SAFE-004`, `SAFE-005`, `SAFE-006`, and `SAFE-007` in order, subject to their prerequisites.
- Architecture implementation and cleanup remain blocked until the applicable safety tasks pass.
- Required backup before next architecture implementation: Git/worktree baseline plus verified SQLite and PostgreSQL/Neon backups; no source restructuring is approved before `SAFE-007`.
- Required validation before proceeding: baseline status/manifest comparison, backup hash/integrity checks, and restoration rehearsal.

## 30. Rules for future Codex sessions

1. Read this master plan.
2. Read the specific task record.
3. Verify dependencies.
4. Capture Git baseline.
5. Work only within task scope.
6. Do not opportunistically clean unrelated code.
7. Run task-specific validation.
8. Run existing-app regression checks.
9. Update the master plan.
10. Add completion evidence.
11. Update progress totals.
12. Commit only when explicitly requested.
13. Stop when acceptance criteria fail.
14. Never mark a task complete based solely on code changes.
15. Never remove a task history entry.

## Audit validation record

- Master plan created at the permitted path only.
- No application source, configuration, route, database, runtime, lockfile, dependency, Graphify, or Obsidian file was intentionally modified.
- Static Node syntax checks passed for inspected `.js` entry/config/route files; Node cannot parse `.jsx` by extension without the frontend toolchain, and no build was run because build output is a prohibited write during this audit.
- `git diff --check` returned no whitespace errors for the scoped project diff.
- Existing application tests were not run because the user prohibited migrations/live services and `deliveryRepository.test.js` requires a live `DATABASE_URL` and drops a test schema; the plan records these as TEST/FINAL work.
- Meta migration documentation was read for historical context only; its source snapshot was not copied into this plan.
- Graphify query evidence was used for scoping; no Graphify update/refresh was run.
