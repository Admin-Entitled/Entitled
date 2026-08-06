# Order Mapping vs. Legacy Delivery Resolution Classification Report

**Task:** `OWN-003` — Classify Order Mapping versus legacy Delivery Resolution  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** `server/src/services/`, `server/src/routes/`, `client/src/`, and SQLite data storage (`server/data/app.db`)

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `OWN-003` |
| Title | Classify Order Mapping versus legacy Delivery Resolution |
| Severity | `CRITICAL` |
| Authoritative Target | Order Mapping (`/api/order-mapping/*`, `client/src/apps/order-mapping`, `server/src/apps/order-mapping`) |
| Deprecated Target | Legacy Delivery Resolution (`/delivery-resolution`, `deliveryShopify.js`, `legacyCsv.js`, `deliveryRepository.js`, `reconciliationService.js`) |
| Primary Owner | Order Mapping Lead |
| Validation Suite | `server/src/services/orderMapping.test.js`, `server/src/services/orderMappingMigrations.test.js` |

---

## 2. Executive Summary

This specification establishes the authoritative disposition register for Order Mapping versus Legacy Delivery Resolution. 

Key Architectural Findings:
1. **Order Mapping is the Authoritative System**: All active order status tracking, Shiprocket integration, Shopify order synchronization, CSV import workflows, and manual status overrides belong to **Order Mapping**.
2. **Legacy Delivery Resolution is Deprecated**: The legacy delivery resolution module (`deliveryShopify.js`, `legacyCsv.js`, `deliveryRepository.js`, `reconciliationService.js`) is obsolete and serves only as a legacy compatibility layer and migration data source.
3. **No Deletion from Uncertainty**: In accordance with task acceptance criteria, no legacy files or database tables will be deleted during this classification phase (`OWN-003`). Any file deletion or code removal is explicitly deferred to remediation task `CLEAN-001` upon owner sign-off.
4. **Data Integrity Guarantee**: Historical records residing in SQLite `delivery_orders` are safely mapped and migrated into Order Mapping schemas via `migrateOrderMappingSqliteData()`.

---

## 3. Symbol-by-Symbol Disposition Register

Every legacy symbol across the codebase is explicitly classified below with its target replacement, disposition status, and evidence requirement prior to eventual removal in `CLEAN-001`.

### 3.1 Legacy Delivery Services (`server/src/services/`)

| File Location | Symbol Name | Legacy Role | Disposition | Target Replacement | Evidence Requirement for Deletion |
| --- | --- | --- | --- | --- | --- |
| `deliveryShopify.js` | `fetchDeliveryOrders` | Fetches Shopify orders for delivery resolution | **DEPRECATED** | `orderMappingShopify.js` -> `fetchShopifyOrders` | Zero active callers; `orderMappingShopify.test.js` passing |
| `legacyCsv.js` | `csvColumns` | Reads raw CSV headers | **DEPRECATED** | `orderMappingCsv.js` -> `parseOrderMappingCsv` | `orderMapping.test.js` CSV parser tests passing |
| `legacyCsv.js` | `parseLegacyCsv` | Parses legacy delivery CSV rows | **DEPRECATED** | `orderMappingCsv.js` -> `parseOrderMappingCsv` | All CSV import tests passing; no external callers |
| `deliveryRepository.js` | `upsertShopifyOrders` | Inserts/updates `delivery_orders` in SQLite | **MIGRATION SINK ONLY** | `orderMappingRepository.js` -> `upsertShopifyOrders` | `migrateOrderMappingSqliteData()` executed & verified |
| `deliveryRepository.js` | `saveAutomaticResolution` | Writes automatic resolution to `delivery_orders` | **DEPRECATED** | `orderMappingRepository.js` -> `applyShipmentUpdate` | Shipment status history logging verified in DB |
| `deliveryRepository.js` | `listOrders` | Queries `delivery_orders` table | **DEPRECATED** | `orderMappingService.js` -> `listOrderMappings` | Order Mapping UI & API endpoints verified |
| `deliveryRepository.js` | `setManualResolution` | Sets manual resolution in `delivery_orders` | **DEPRECATED** | `orderMappingService.js` -> `setManualOrderMappingShipmentStatus` | Manual override lock and audit logging verified |
| `deliveryRepository.js` | `resetManualResolution` | Clears manual resolution in `delivery_orders` | **DEPRECATED** | `orderMappingService.js` -> `clearManualOrderMappingShipmentStatus` | `orderMapping.test.js` manual clear tests passing |
| `deliveryRepository.js` | `getOrdersForLegacy` | Fetches un-resolved legacy `delivery_orders` | **DEPRECATED** | `orderMappingRepository.js` queue filters | Queue filter tests passing in Order Mapping |
| `deliveryRepository.js` | `getImport` | Queries `legacy_imports` by hash | **DEPRECATED** | `orderMappingService.js` -> `createSyncRun` | Batch import deduplication verified |
| `deliveryRepository.js` | `saveImport` | Inserts into `legacy_imports` | **DEPRECATED** | `orderMappingService.js` -> `createSyncRun` | Sync run tracking verified |
| `deliveryRepository.js` | `logUnknownStatus` | Logs to `delivery_logs` | **DEPRECATED** | `orderMappingService.js` -> `createActionLog` | Network and action logs operational |
| `reconciliationService.js` | `syncDeliveryOrders` | Orchestrates legacy Shopify/Shiprocket sync | **DEPRECATED** | `orderMappingService.js` -> `syncOrderMappingShopify` | `syncOrderMappingShopify` verified |
| `reconciliationService.js` | `importLegacyCsv` | Orchestrates legacy CSV import | **DEPRECATED** | `orderMappingService.js` -> `commitOrderMappingCsvImport` | Two-phase CSV import pipeline verified |

---

## 4. Active Order Mapping Symbol & Endpoint Map

The following active Order Mapping modules provide 100% functional coverage over all capabilities previously handled by Legacy Delivery Resolution:

### 4.1 Route Endpoints (`server/src/routes/orderMapping.js`)

| Method | Route Endpoint | Handling Service Function | Functional Coverage |
| --- | --- | --- | --- |
| `GET` | `/api/order-mapping/orders` | `listOrderMappings` | Replaces `listOrders` with queue, status, courier, and search filters |
| `GET` | `/api/order-mapping/orders/:id` | `getOrderMappingDetails` | Retrieves comprehensive order & shipment detail |
| `GET` | `/api/order-mapping/logs/network` | `listNetworkLogs` | Replaces `delivery_logs` network tracking |
| `GET` | `/api/order-mapping/logs/actions` | `listActionLogs` | Replaces `delivery_logs` audit trail |
| `POST` | `/api/order-mapping/sync/shopify` | `syncOrderMappingShopify` | Replaces `fetchDeliveryOrders` sync |
| `POST` | `/api/order-mapping/sync/shiprocket` | `refreshOrderMappingShiprocket` | Refreshes Shiprocket tracking status |
| `POST` | `/api/order-mapping/shipments/:id/refresh` | `refreshOrderMappingShiprocket` | Refreshes single shipment status |
| `POST` | `/api/order-mapping/shipments/:id/manual` | `setManualOrderMappingShipmentStatus` | Replaces `setManualResolution` |
| `POST` | `/api/order-mapping/shipments/:id/clear-manual` | `clearManualOrderMappingShipmentStatus` | Replaces `resetManualResolution` |
| `POST` | `/api/order-mapping/imports/preview` | `previewOrderMappingCsvImport` | Replaces legacy single-pass CSV upload with two-phase preview |
| `POST` | `/api/order-mapping/imports/:id/commit` | `commitOrderMappingCsvImport` | Replaces legacy single-pass CSV upload with transactional commit |

---

## 5. Data Migration & Compatibility Safeguards

1. **SQLite to Order Mapping Migration**:
   - `migrateOrderMappingSqliteData()` in `server/src/services/orderMappingService.js` migrates legacy records from `delivery_orders` into Order Mapping repository tables without data loss.
2. **Compatibility Redirect**:
   - `server/src/app.js` preserves HTTP 302 redirect from `/delivery-resolution` to `/order-mapping`.
   - `client/src/main.jsx` preserves client-side redirection for legacy bookmark URLs.
3. **Database Preservation**:
   - SQLite tables `delivery_orders`, `legacy_imports`, and `delivery_logs` remain intact in `server/src/db/database.js` until cleanup task `CLEAN-001`.

---

## 6. Acceptance Criteria Verification

- [x] **Every legacy symbol has a disposition and evidence requirement.** (See Section 3 Disposition Register)
- [x] **No deletion is approved from uncertainty.** (All legacy files preserved; cleanup deferred to `CLEAN-001`)
- [x] **Current Order Mapping behavior remains protected.** (Validated via `server/src/services/orderMapping.test.js` and `server/src/services/orderMappingMigrations.test.js`)
