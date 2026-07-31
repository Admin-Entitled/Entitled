# Product Sorter Application Boundary Specification

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `OWN-002` |
| Application Name | Shopify Product Sorter / Collection Placement Manager |
| Canonical Name | `Product Sorter` |
| Primary Owner | Product Sorter Lead |
| Target Frontend Location | `client/src/apps/sorter` |
| Target Backend Location | `server/src/apps/sorter` |
| Creation Date | 2026-07-30 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document establishes the authoritative ownership boundary for the **Product Sorter** (Collection Placement Manager) application. It identifies all frontend components, backend routes, services, database tables, file assets, external integrations, environment configurations, and test suites owned by the Product Sorter application.

---

## 3. Frontend Boundary (`client/src/apps/sorter`)

Currently embedded within `client/src/App.jsx`, the Product Sorter frontend comprises the following functional components and UI capabilities:

### 3.1 UI Views & Subcomponents
- **Collection Selector**: Dropdown and search interface for selecting target Shopify collections.
- **Strategy Controls Slider**: Interactive sliders for configuring strategy weights:
  - Revenue / Sales Weight (`salesWeight`)
  - Profit Margin Weight (`marginWeight`)
  - Inventory / Stock Level Weight (`inventoryWeight`)
  - Recency / New Arrival Weight (`recencyWeight`)
- **Product Grid / Table**: Detailed product list displaying:
  - Product thumbnail, title, SKU, price, stock
  - Total calculated score and individual metric scores
  - `primaryReason` score explanation tag
  - Position control inputs
- **Pinning & Hiding Controls**:
  - Pin product to fixed position (1-based index)
  - Hide product from sorted collection view
- **Sorting Actions Bar**:
  - Sync collection products from Shopify (`POST /api/collections/sync`)
  - Generate sorted order (`POST /api/collections/generate`)
  - Apply generated order to Shopify (`POST /api/collections/apply`)
  - Rollback to previous snapshot (`POST /api/collections/rollback`)
- **Batch Reorder Control**:
  - Reorder all eligible custom collections (`POST /api/collections/reorder-all-v2`)
  - Job status polling & progress bar
- **Sorter Logs Viewer**:
  - Action logs viewer (`GET /api/collections/logs/actions`)
  - Network logs viewer (`GET /api/collections/logs/network`)

---

## 4. Backend Boundary (`server/src/apps/sorter`)

### 4.1 Route Ownership (13 Endpoints)

| Method | Endpoint Route | Handler Location | Function / Capability |
| --- | --- | --- | --- |
| `GET` | `/api/collections` | `server/src/routes/api.js:424` | List all collections with local sync/state summary |
| `GET` | `/api/collection-products` | `server/src/routes/api.js:438` | Fetch products for a collection |
| `POST` | `/api/collections/sync` | `server/src/routes/api.js:465` | Sync collection products from Shopify & store snapshot |
| `GET` | `/api/collections/state` | `server/src/routes/api.js:486` | Retrieve current sorter state (rules, preferences, strategy) |
| `PUT` | `/api/collections/settings` | `server/src/routes/api.js:504` | Update strategy weights & settings |
| `PUT` | `/api/collections/products/preference` | `server/src/routes/api.js:522` | Update product pin/hide preferences |
| `POST` | `/api/collections/generate` | `server/src/routes/api.js:539` | Calculate & generate new product order |
| `POST` | `/api/collections/apply` | `server/src/routes/api.js:574` | Apply new order to Shopify & record state |
| `POST` | `/api/collections/reorder-all-v2` | `server/src/routes/api.js:608` | Async batch reorder all custom collections |
| `POST` | `/api/collections/reorder-all` | `server/src/routes/api.js:1021,1025` | Legacy duplicate batch reorder endpoint |
| `POST` | `/api/collections/rollback` | `server/src/routes/api.js:1067` | Restore collection order from historical snapshot |
| `GET` | `/api/collections/logs/actions` | `server/src/routes/api.js:212` | Retrieve sorter action logs |
| `GET` | `/api/collections/logs/network` | `server/src/routes/api.js:229` | Retrieve sorter network logs |

### 4.2 Services & Modules

| Module Name | File Location | Responsibilities |
| --- | --- | --- |
| **Sorter Engine** | `server/src/services/sorter.js` | Score calculation algorithm, strategy weighting, pinning/hiding placement logic, tie-breaking, score explanations (`primaryReason`) |
| **Collection State Service** | `server/src/services/collectionStateService.js` | Snapshot creation & retrieval, collection state persistence, preference updates, strategy settings IO |
| **Sorter Runtime Service** | `server/src/services/sorterRuntimeService.js` | SQLite table initialization, DB queries for collections/snapshots/logs, action and network logging |

---

## 5. Data & Storage Boundary

### 5.1 SQLite Database Tables (`server/data/app.db`)

Product Sorter has 100% exclusive ownership of the following 6 SQLite tables:

1. `collections`: Stores collection metadata, sync timestamp, product count, and current status.
2. `collection_products`: Stores products within collections, titles, prices, stock levels, sales data, margin data, current position, and updated position.
3. `sorter_snapshots`: Stores snapshot headers (collection ID, product count, created timestamp, snapshot reason).
4. `sorter_snapshot_items`: Stores individual product position mappings within historical snapshots.
5. `sorter_logs`: Stores detailed sorter execution logs (log level, component, action, message, metadata).
6. `strategy_settings`: Stores saved strategy weight configurations per collection or globally.

### 5.2 File Storage

- `server/data/strategy-settings.json`: Strategy settings persistence fallback file.
- Runtime log files (if configured under `server/data/logs/sorter*.log`).

---

## 6. Integration & External System Boundary

### 6.1 External Systems

- **Shopify Admin API**: Product Sorter relies on Shopify Admin GraphQL & REST API for collection and product data:
  - Reading custom and smart collections (`GET /admin/api/2024-01/custom_collections.json`, `smart_collections.json`)
  - Reading collection products (`GET /admin/api/2024-01/collections/{id}/products.json`)
  - Reordering collection products via GraphQL (`mutation collectionReorderProducts`) or REST (`PUT /admin/api/2024-01/custom_collections/{id}.json`)

### 6.2 Transport Module

- `server/src/services/shopifyService.js`: Shared Shopify transport adapter currently used by Sorter.

---

## 7. Environment Variables & Configuration

The following environment variables govern Product Sorter operations:

| Variable | Required | Purpose | Default |
| --- | --- | --- | --- |
| `SHOPIFY_SHOP_DOMAIN` | Yes | Target Shopify store domain | - |
| `SHOPIFY_ACCESS_TOKEN` | Yes | Shopify Admin API Token | - |
| `SHOPIFY_API_VERSION` | No | API version string | `2024-01` |
| `DATABASE_PATH` | No | SQLite database file location | `./data/app.db` |
| `STRATEGY_SETTINGS_PATH` | No | Strategy JSON file location | `./data/strategy-settings.json` |

---

## 8. Test Suite Boundary

Product Sorter owns the following test files:

- `server/src/services/sorter.test.js` (11 test cases covering sorting algorithm, strategy weighting, pinned/hidden products, empty inputs, tie-breaking, primaryReason explanations).
- Target additional tests:
  - `server/src/services/collectionStateService.test.js` (Covering sync, snapshot creation, and rollback)
  - `server/src/routes/sorter.test.js` (Covering sorter API endpoints)

---

## 9. Cross-Application Dependencies & Shared Surfaces

- **App Shell Navigation**: `App.jsx` provides the top-level tab switcher to toggle between Product Sorter, Order Mapping, and SKU Image Manager.
- **Shared Diagnostics**: `/api/health` and `/api/debug/shopify` endpoints read general system health and Shopify connectivity used by Sorter.
- **Shared Transport**: `shopifyService.js` handles HTTP request signing and retries for Shopify Admin API.

---

## 10. Target Directory Structure (Extraction Plan)

```
client/src/apps/sorter/
  ├── components/
  │   ├── CollectionSelector.jsx
  │   ├── StrategyControls.jsx
  │   ├── ProductTable.jsx
  │   ├── PinHideModal.jsx
  │   ├── BatchReorderProgress.jsx
  │   └── SorterLogViewer.jsx
  ├── hooks/
  │   └── useSorterState.js
  ├── api/
  │   └── sorterClient.js
  └── SorterApp.jsx

server/src/apps/sorter/
  ├── routes/
  │   └── sorterRoutes.js
  ├── services/
  │   ├── sorterEngine.js
  │   └── collectionStateService.js
  ├── db/
  │   └── sorterRepository.js
  └── index.js
```

---

## 11. Rollback & Safety Plan

- **Zero Route Breaking**: During future extraction phases (`BE-002`, `FE-004`), the existing route mounts (`/api/collections/*`) and URL paths (`/`) will be preserved verbatim using router delegation.
- **Data Safety**: No database tables are moved or altered during this boundary definition task (`OWN-002`). SQLite table structures and locations remain unchanged.
- **Isolated Testing**: All changes can be validated independently by running `node --test server/src/services/sorter.test.js`.
