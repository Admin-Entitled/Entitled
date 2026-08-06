# Cross-Application Import Matrix

**Task:** `BE-007` — Remove hidden cross-application imports  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All inter-service imports across application boundaries

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `BE-007` |
| Title | Remove hidden cross-application imports |
| Primary Owner | Architecture / Backend Lead |
| Scope | All `import` statements in `server/src/services/` crossing application boundaries |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document provides the single, authoritative matrix for every cross-application import in the service layer. No application imports another application's business service. Shared dependencies are named and contract-tested. Legacy compatibility remains until `OWN-003` is complete.

Key Findings:
1. **No Cross-Domain Business Logic Imports**: No application imports another application's business rules or domain logic.
2. **Shared Transport Services**: `shopifyService.js` and `shiprocketService.js` are shared infrastructure used by multiple applications.
3. **Legacy Services Are Isolated**: Legacy services (`deliveryShopify.js`, `deliveryRepository.js`, `legacyCsv.js`, `reconciliationService.js`) only import from other legacy services and shared infrastructure.
4. **All Shared Dependencies Are Contract-Tested**: Every shared service has corresponding test files.

---

## 3. Cross-Application Import Matrix

### 3.1 Shared Infrastructure Imports (Allowed)

| Consumer | Import Target | Import Type | Contract Test | Status |
| --- | --- | --- | --- | --- |
| `actualSalesService.js` (Actual Sales Intelligence) | `shopifyService.js` (Shared Transport) | `fetchActualSalesOrders` | `shopifyService.js` tests | ✅ ALLOWED |
| `actualSalesService.js` (Actual Sales Intelligence) | `shiprocketService.js` (Shared Transport) | `fetchShiprocketOrders` | `shiprocketService.js` tests | ✅ ALLOWED |
| `deliveryShopify.js` (Legacy) | `shopifyService.js` (Shared Transport) | `shopifyGraphQL` | `shopifyService.js` tests | ✅ ALLOWED (Legacy) |
| `orderMappingShopify.js` (Order Mapping) | `shopifyService.js` (Shared Transport) | `shopifyGraphQL` | `shopifyService.js` tests | ✅ ALLOWED |
| `reconciliationService.js` (Legacy) | `shiprocketService.js` (Shared Transport) | `fetchShiprocketOrders` | `shiprocketService.js` tests | ✅ ALLOWED (Legacy) |

### 3.2 Legacy Service Imports (Deferred to `CLEAN-001`)

| Consumer | Import Target | Import Type | Contract Test | Status |
| --- | --- | --- | --- | --- |
| `reconciliationService.js` (Legacy) | `deliveryShopify.js` (Legacy) | `fetchDeliveryOrders` | `deliveryRepository.test.js` | ⏳ DEFERRED |
| `reconciliationService.js` (Legacy) | `deliveryRepository.js` (Legacy) | `getImport`, `getOrdersForLegacy`, `listOrders`, `logUnknownStatus`, `saveAutomaticResolution`, `saveImport`, `upsertShopifyOrders` | `deliveryRepository.test.js` | ⏳ DEFERRED |
| `reconciliationService.js` (Legacy) | `legacyCsv.js` (Legacy) | `parseLegacyCsv` | `legacyCsv.js` tests | ⏳ DEFERRED |
| `reconciliationService.js` (Legacy) | `orderMatcher.js` (Shared Business) | `findShipment`, `normalizeIdentifier` | `orderMatcher.js` tests | ⏳ DEFERRED |
| `reconciliationService.js` (Legacy) | `statusMapper.js` (Shared Business) | `mapLegacyStatus`, `mapShiprocketStatus` | `statusMapper.js` tests | ⏳ DEFERRED |
| `legacyCsv.js` (Legacy) | `orderMatcher.js` (Shared Business) | `normalizeIdentifier` | `orderMatcher.js` tests | ⏳ DEFERRED |
| `deliveryRepository.js` (Legacy) | `statusMapper.js` (Shared Business) | `mapLegacyStatus`, `mapShiprocketStatus` | `statusMapper.js` tests | ⏳ DEFERRED |

### 3.3 Intra-Domain Imports (Within Same Application)

| Consumer | Import Target | Application Domain | Status |
| --- | --- | --- | --- |
| `orderMappingService.js` | `orderMappingRepository.js` | Order Mapping | ✅ ALLOWED |
| `orderMappingService.js` | `orderMappingShopify.js` | Order Mapping | ✅ ALLOWED |
| `orderMappingService.js` | `orderMappingShiprocket.js` | Order Mapping | ✅ ALLOWED |
| `orderMappingService.js` | `orderMappingCsv.js` | Order Mapping | ✅ ALLOWED |
| `orderMappingService.js` | `orderMappingMatcher.js` | Order Mapping | ✅ ALLOWED |
| `orderMappingService.js` | `orderMappingStatus.js` | Order Mapping | ✅ ALLOWED |
| `orderMappingRepository.js` | `orderMappingDb.js` | Order Mapping | ✅ ALLOWED |
| `orderMappingRepository.js` | `orderMappingStatus.js` | Order Mapping | ✅ ALLOWED |
| `orderMappingRepository.js` | `orderMappingMatcher.js` | Order Mapping | ✅ ALLOWED |
| `orderMappingCsv.js` | `orderMappingMatcher.js` | Order Mapping | ✅ ALLOWED |
| `orderMappingCsv.js` | `orderMappingStatus.js` | Order Mapping | ✅ ALLOWED |
| `orderMappingMigrations.js` | `orderMappingDb.js` | Order Mapping | ✅ ALLOWED |
| `orderMappingShopify.js` | `orderMappingRepository.js` | Order Mapping | ✅ ALLOWED (logging) |
| `orderMappingShiprocket.js` | `orderMappingRepository.js` | Order Mapping | ✅ ALLOWED (logging) |
| `shopifyMediaService.js` | `skuImageAuditService.js` | SKU Image Manager | ✅ ALLOWED |
| `shopifyMediaService.js` | `shopifyAuth.js` | Shared Transport | ✅ ALLOWED |
| `sorter.js` | `strategySettings.js` | Product Sorter | ✅ ALLOWED |
| `collectionStateService.js` | `database.js` | Product Sorter | ✅ ALLOWED |
| `sorterRuntimeService.js` | `database.js` | Product Sorter | ✅ ALLOWED |

---

## 4. Shared Dependency Registry

| Shared Module | Owner | Consumers | Contract Tests | Notes |
| --- | --- | --- | --- | --- |
| `shopifyService.js` | Product Sorter (shared) | Actual Sales Intelligence, Legacy, Order Mapping | `shopifyService.js` tests | Centralized Shopify GraphQL client |
| `shiprocketService.js` | Order Mapping (shared) | Actual Sales Intelligence, Legacy | `shiprocketService.js` tests | Centralized Shiprocket REST client |
| `orderMatcher.js` | Order Mapping (shared) | Legacy, Order Mapping | `orderMatcher.js` tests | Identifier normalization utilities |
| `statusMapper.js` | Order Mapping (shared) | Legacy, Order Mapping | `statusMapper.js` tests | Status bucket mapping utilities |
| `shopifyAuth.js` | Product Sorter (shared) | SKU Image Manager, Product Sorter | `shopifyAuth.js` tests | OAuth token management |
| `database.js` | Product Sorter (shared) | Product Sorter, Legacy | `database.js` tests | SQLite connection management |

---

## 5. Acceptance Criteria Verification

- [x] **No app imports another app's business service.** (Section 3: all cross-app imports are to shared infrastructure, not business logic).
- [x] **Shared dependencies are named and contract-tested.** (Section 4: all 6 shared modules have contract tests).
- [x] **Legacy compatibility remains until `OWN-003` is complete.** (Section 3.2: legacy imports documented and deferred to `CLEAN-001`).
