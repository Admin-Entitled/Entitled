# Product Sorter Application Boundary Specification

## 1. Document Control

| Field | Value |
| --- | --- |
| Task ID | `OWN-002` |
| Canonical application | `Product Sorter` |
| Current frontend location | `client/src/App.jsx` with shared client `client/src/api.js` |
| Current backend locations | `server/src/routes/api.js` and `server/src/routes/sorter.js` |
| Target frontend boundary | `client/src/apps/sorter` |
| Target backend boundary | `server/src/apps/sorter` |
| Evidence baseline | Commit `a3b204aa0bf9259e60b69891d86dc11cf15dcbc4` |
| Last validated | 2026-08-03 |
| Status | `VALIDATED OWNERSHIP SPECIFICATION` |

This task defines ownership only. The target directories are future extraction boundaries, not current implementation paths. No route, table, file, or public contract is moved by `OWN-002`.

## 2. Current Frontend Ownership

The Product Sorter owner owns the Sorter behavior embedded in `client/src/App.jsx`: collection selection and sync, strategy controls, product scoring and placement, pin/hide preferences, generate/apply/rollback actions, batch reorder progress, and Sorter action/network log views. `client/src/sidebarModules.js` declares the enabled Sorter module.

`client/src/App.jsx`, `client/src/api.js`, `client/src/styles.css`, and `client/src/sidebarModules.js` are shared application-shell files. Product Sorter owns only its feature-specific behavior inside them until frontend extraction is completed. The target extraction must preserve `/` and all existing `/api/collections*` and `/api/collection-products*` contracts.

## 3. Current Route Ownership

All listed public contracts are owned by Product Sorter. The shared `/api` router in `server/src/routes/api.js` remains a composition boundary rather than exclusive Sorter ownership.

| Method | Public contract | Current definition | Ownership note |
| --- | --- | --- | --- |
| `GET` | `/api/collections/logs/actions` | `server/src/routes/api.js` | Product Sorter action-log contract. |
| `GET` | `/api/collections/logs/network` | `server/src/routes/api.js` | Product Sorter network-log contract. |
| `GET` | `/api/collections` | `server/src/routes/api.js` | Lists Shopify collections with Sorter settings/state. |
| `GET` | `/api/collection-products` | `server/src/routes/api.js` | Reads a selected collection and its products. |
| `POST` | `/api/collections/sync` | `server/src/routes/api.js` | Syncs Shopify collection data into the Sorter snapshot. |
| `GET` | `/api/collections/state` | `server/src/routes/api.js` | Reads settings, preferences, snapshot, and strategy. |
| `PUT` | `/api/collections/settings` | `server/src/routes/api.js` | Updates collection-level settings. |
| `PUT` | `/api/collections/products/preference` | `server/src/routes/api.js` | Updates pin/hide placement preferences. |
| `POST` | `/api/collections/generate` | `server/src/routes/sorter.js` | Generates a deterministic proposed order. |
| `POST` | `/api/collections/apply` | `server/src/routes/sorter.js` | Applies a generated order and records backup/state. |
| `POST` | `/api/collections/reorder-all-v2` | `server/src/routes/sorter.js` | Starts the guarded batch reorder workflow. |
| `POST` | `/api/collections/reorder-all` | `server/src/routes/sorter.js` | Compatibility contract; the first registered handler redirects `307` to `reorder-all-v2`. |
| `POST` | `/api/collections/rollback` | `server/src/routes/sorter.js` | Restores the latest recorded collection order. |

There are 13 distinct public contracts. `server/src/routes/sorter.js` declares `POST /collections/reorder-all` twice; Express reaches the redirecting declaration first, so the later declaration is unreachable. This is an existing implementation defect, not an additional owned contract and not approved for cleanup by `OWN-002`.

## 4. Service and Repository Ownership

| File | Owner | Responsibility |
| --- | --- | --- |
| `server/src/services/sorter.js` | Product Sorter | Scoring, strategy weighting, placement, membership preservation, and deterministic ordering. |
| `server/src/services/collectionStateService.js` | Product Sorter | Collection settings, preferences, snapshots, and order backups in SQLite. |
| `server/src/services/sorterRuntimeService.js` | Product Sorter | Sorter run state plus action and network telemetry in SQLite. |
| `server/src/services/strategySettings.js` | Product Sorter | Validates and persists strategy weights in a JSON file. |
| `server/src/routes/sorter.js` | Product Sorter | Dedicated Sorter workflow handlers; currently mounted by the shared API router. |
| `server/src/routes/api.js` | Shared composition | Contains Product Sorter contracts alongside Sales Intelligence, SKU Image Manager, diagnostics, and health contracts. |
| `server/src/db/database.js` | Shared SQLite bootstrap | Creates Sorter, Shopify-auth, and legacy Delivery tables; no application owns the module exclusively. |
| `server/src/services/shopifyService.js` | Shared integration | Shopify Admin GraphQL transport used by Product Sorter and other applications. |
| `server/src/services/shopifyAuth.js` | Shared integration | Shopify credential and token-cache boundary used across Shopify features. |
| `server/src/utils/logger.js` and diagnostics routes | Shared diagnostics | Shared operational logging and health visibility. |

No separate Sorter repository file exists. `collectionStateService.js` and `sorterRuntimeService.js` currently contain the Sorter-owned persistence operations over the shared SQLite connection.

## 5. Data and Runtime File Ownership

The default SQLite file is `server/data/app.db`, resolved from repository root and overridden by `SQLITE_PATH`. The database file and WAL/SHM sidecars are runtime data and are ignored by Git.

### 5.1 Proven Sorter-owned SQLite tables

| Table | Owner | Current writer/reader |
| --- | --- | --- |
| `collection_settings` | Product Sorter | `collectionStateService.js` |
| `product_preferences` | Product Sorter | `collectionStateService.js` |
| `collection_snapshots` | Product Sorter | `collectionStateService.js` |
| `order_backups` | Product Sorter | `collectionStateService.js` |
| `sorter_runs` | Product Sorter | `sorterRuntimeService.js` |
| `sorter_action_logs` | Product Sorter | `sorterRuntimeService.js` |
| `sorter_network_logs` | Product Sorter | `sorterRuntimeService.js` |

### 5.2 Shared or excluded SQLite tables

| Table | Classification | Reason |
| --- | --- | --- |
| `shopify_auth_cache` | `UNRESOLVED / SHARED` | Created in the shared database and tied to shared Shopify authentication. Product Sorter may consume authenticated transport but cannot claim exclusive ownership. |
| `delivery_orders` | Legacy Delivery / Order Mapping migration source | Not Product Sorter data. |
| `legacy_imports` | Legacy Delivery retained data | Not Product Sorter data. |
| `delivery_logs` | Legacy Delivery retained data | Not Product Sorter data. |

### 5.3 JSON and generated/runtime files

- `server/data/strategy-settings.json` is Product Sorter strategy persistence. `STRATEGY_SETTINGS_FILE` may replace the path directly.
- `server/data/app.db`, `server/data/app.db-wal`, and `server/data/app.db-shm` are generated runtime files. Product Sorter owns only the seven tables listed above, not the complete shared database file.
- No committed Sorter log-file writer was found. Sorter logs are stored in SQLite, so no `server/data/logs/sorter*.log` ownership is claimed.

## 6. Shopify and Transport Dependencies

Product Sorter uses Shopify Admin GraphQL through `shopifyService.js` and `shopifyAuth.js` to list collections, read collection products and sales metrics, ensure manual sorting, and run `collectionReorderProducts` through `syncCollectionOrder()`. The configured API version defaults to `2026-04`.

The Shopify transport, credentials, OAuth/token cache, retry/error handling, and store connection are shared integration surfaces. Product Sorter owns its collection operations and required scopes, but it does not exclusively own either transport module or `shopify_auth_cache`.

## 7. Environment-variable Ownership

| Variable | Product Sorter relationship | Ownership |
| --- | --- | --- |
| `SQLITE_PATH` | Selects the shared SQLite file containing Sorter tables. | Shared runtime configuration. |
| `STRATEGY_SETTINGS_FILE` | Selects Product Sorter strategy JSON storage. | Product Sorter. |
| `SHOPIFY_STORE_DOMAIN` | Identifies the Shopify store. | Shared Shopify integration. |
| `SHOPIFY_CLIENT_ID` | Required by the shared Shopify auth boundary. | Shared Shopify integration. |
| `SHOPIFY_CLIENT_SECRET` | Required by the shared Shopify auth boundary. | Shared Shopify integration. |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Optional static Shopify Admin token. | Shared Shopify integration. |
| `SHOPIFY_API_VERSION` | Shopify Admin API version; default `2026-04`. | Shared Shopify integration. |

`SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_ACCESS_TOKEN`, `DATABASE_PATH`, and `STRATEGY_SETTINGS_PATH` are not current committed configuration names.

## 8. Test Ownership

| Test file | Ownership evidence |
| --- | --- |
| `server/src/services/sorter.test.js` | Sorter strategy, deterministic ranking, stock behavior, move construction, and membership safety. |
| `server/src/services/collectionSyncApplyRollback.test.js` | Sync/apply/backup/rollback and failure-ordering contracts. |
| `server/src/app.test.js` | Product Sorter route smoke coverage and `reorder-all` compatibility redirect. Shared with other applications. |
| `client/src/api.test.js` | Sorter API paths and log endpoints. Shared client test file. |
| `client/src/frontendRegression.test.js` | Enabled-module and frontend isolation contracts. Shared frontend test file. |
| `client/src/styles.test.js` | Shared dashboard style-boundary regression. |

No committed `collectionReorderContracts.test.js`, `collectionStateService.test.js`, or `routes/sorter.test.js` exists at the evidence baseline; they are not claimed as current evidence.

## 9. Cross-application Dependencies and Ownership Questions

| Surface | Classification | Boundary rule |
| --- | --- | --- |
| `client/src/App.jsx`, `client/src/api.js`, `client/src/styles.css`, `client/src/sidebarModules.js` | Shared frontend shell | Extract only Product Sorter behavior; preserve other applications and public routes. |
| `server/src/routes/api.js` | Shared backend router | Delegate Sorter contracts without changing URLs or response contracts. |
| `server/src/db/database.js` and `server/data/app.db` | Shared runtime/store | Extract only proven Sorter tables; do not move or delete shared/legacy tables. |
| `shopifyService.js`, `shopifyAuth.js`, `shopify_auth_cache` | Shared Shopify integration | Inject or import the shared boundary; do not duplicate credentials or transport. |
| Shared health, Shopify debug, logger, and diagnostics surfaces | Shared diagnostics | Product Sorter consumes them but does not own their application-wide contract. |
| Sales metrics from `shopifyService.js` | Shared Shopify data | Product Sorter owns the scoring use, not the shared provider transport. |

### Unresolved owner decision

- **Question:** Which future application boundary owns `shopify_auth_cache` and the shared SQLite bootstrap after extraction?
- **Evidence reviewed:** `server/src/db/database.js`, `server/src/services/shopifyAuth.js`, shared Shopify importers, and `docs/architecture/DATABASE_OWNERSHIP_REGISTER.md`.
- **Blocked downstream tasks:** `OWN-008`, `OWN-010`, `DATA-003`, and any extraction that would split the shared SQLite/auth boundary.
- **Required decision:** Assign the cache and connection bootstrap to a named shared platform/integration owner before moving tables or duplicating storage. Until then they remain `UNRESOLVED / SHARED`.

## 10. Approved Target Extraction Boundary

Future `FE-004` and `BE-002` work may extract the Product Sorter frontend, API client, dedicated router, owned services, and repository access for only the seven proven Sorter tables into `client/src/apps/sorter` and `server/src/apps/sorter`. The extraction must preserve current URLs, response contracts, Shopify behavior, runtime data, and shared diagnostics. It must not move shared Shopify credentials/transport, `shopify_auth_cache`, or legacy Delivery data by assumption.

## 11. Safety and Rollback

- `OWN-002` changes documentation only; application code, data, and routes remain unchanged.
- A future extraction rolls back by restoring router delegation and frontend composition without changing public URLs or table contents.
- Minimum current validation is the committed route/table/environment inventory plus `node --test server/src/services/sorter.test.js` and the existing architecture-ledger validation commands.
