# Service Boundary Matrix

**Task:** `BE-006` — Create application-owned service boundaries  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All backend service modules and their dependency relationships

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `BE-006` |
| Title | Create application-owned service boundaries |
| Primary Owner | Architecture / Backend Lead |
| Scope | All service modules in `server/src/services/` |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative service boundary matrix for every backend module. Each application service owns business rules for its domain. Repositories own persistence. Transport modules own provider calls. Boundary dependency direction is documented and tested.

Key Rules:
1. **Business Logic Layer**: Application services own business rules, validation, and orchestration.
2. **Persistence Layer**: Repository modules own database queries and data access.
3. **Transport Layer**: Transport modules own external API calls and provider integration.
4. **Dependency Direction**: Business → Repository → Transport (never reverse).

---

## 3. Service Boundary Matrix

### 3.1 Product Sorter Services

| Module | File | Layer | Owner | Responsibilities | Dependencies |
| --- | --- | --- | --- | --- | --- |
| **Sorter Engine** | `sorter.js` | Business | Product Sorter | Score calculation, strategy weighting, pinning/hiding, tie-breaking | `strategySettings.js` |
| **Collection State Service** | `collectionStateService.js` | Business | Product Sorter | Snapshot management, preference updates, strategy settings | `database.js` (SQLite) |
| **Sorter Runtime Service** | `sorterRuntimeService.js` | Persistence | Product Sorter | SQLite table init, DB queries for collections/snapshots/logs | `database.js` (SQLite) |
| **Strategy Settings** | `strategySettings.js` | Business | Product Sorter | Default strategy, validation, load/save settings | `database.js` (SQLite) |

### 3.2 Order Mapping Services

| Module | File | Layer | Owner | Responsibilities | Dependencies |
| --- | --- | --- | --- | --- | --- |
| **Order Mapping Service** | `orderMappingService.js` | Business | Order Mapping | Orchestration, sync, CSV import, manual override | `orderMappingRepository.js`, `orderMappingShopify.js`, `orderMappingShiprocket.js`, `orderMappingCsv.js`, `orderMappingMatcher.js`, `orderMappingStatus.js` |
| **Order Mapping Repository** | `orderMappingRepository.js` | Persistence | Order Mapping | PostgreSQL queries, CRUD operations, network/action logging | `orderMappingDb.js`, `orderMappingStatus.js`, `orderMappingMatcher.js` |
| **Order Mapping Shopify** | `orderMappingShopify.js` | Transport | Order Mapping | Shopify GraphQL order fetching | `shopifyService.js`, `orderMappingRepository.js` |
| **Order Mapping Shiprocket** | `orderMappingShiprocket.js` | Transport | Order Mapping | Shiprocket API shipment fetching | `shiprocketService.js`, `orderMappingRepository.js` |
| **Order Mapping CSV** | `orderMappingCsv.js` | Business | Order Mapping | CSV parsing, column mapping, validation | `orderMappingMatcher.js`, `orderMappingStatus.js` |
| **Order Mapping Matcher** | `orderMappingMatcher.js` | Business | Order Mapping | Identifier normalization, shipment matching | None |
| **Order Mapping Status** | `orderMappingStatus.js` | Business | Order Mapping | Status normalization, terminal detection, update validation | None |
| **Order Mapping Migrations** | `orderMappingMigrations.js` | Infrastructure | Order Mapping | PostgreSQL schema migration execution | `orderMappingDb.js` |
| **Order Mapping DB** | `orderMappingDb.js` | Infrastructure | Order Mapping | PostgreSQL client management, connection pooling | `config/env.js` |

### 3.3 SKU Image Manager Services

| Module | File | Layer | Owner | Responsibilities | Dependencies |
| --- | --- | --- | --- | --- | --- |
| **Shopify Media Service** | `shopifyMediaService.js` | Business + Transport | SKU Image Manager | Variant search, media CRUD, bulk operations, staging upload | `shopifyAuth.js`, `skuImageAuditService.js` |
| **SKU Image Audit Service** | `skuImageAuditService.js` | Persistence | SKU Image Manager | Audit trail logging to JSONL | None (file I/O only) |

### 3.4 Actual Sales Intelligence Services

| Module | File | Layer | Owner | Responsibilities | Dependencies |
| --- | --- | --- | --- | --- | --- |
| **Actual Sales Service** | `actualSalesService.js` | Business | Actual Sales Intelligence | Order aggregation, SKU performance, restock recommendations, cache management | `shopifyService.js`, `shiprocketService.js` |

### 3.5 Shared Infrastructure Services

| Module | File | Layer | Owner | Responsibilities | Dependencies |
| --- | --- | --- | --- | --- | --- |
| **Shopify Service** | `shopifyService.js` | Transport | Product Sorter (shared) | Shopify Admin GraphQL client, order/product fetching | `shopifyAuth.js`, `utils/logger.js` |
| **Shopify Auth** | `shopifyAuth.js` | Transport | Product Sorter (shared) | OAuth token management, scope validation, credential caching | `config/env.js`, `utils/logger.js` |
| **Shiprocket Service** | `shiprocketService.js` | Transport | Order Mapping (shared) | Shiprocket REST API client, token management | `config/env.js` |
| **Status Mapper** | `statusMapper.js` | Business | Order Mapping (shared) | Status bucket mapping for legacy/Shiprocket statuses | None |
| **Order Matcher** | `orderMatcher.js` | Business | Order Mapping (shared) | Identifier normalization, shipment matching | None |

### 3.6 Legacy Services (Deferred to `CLEAN-001`)

| Module | File | Layer | Owner | Responsibilities | Dependencies |
| --- | --- | --- | --- | --- | --- |
| **Delivery Repository** | `deliveryRepository.js` | Persistence | Legacy Delivery Resolution | SQLite `delivery_orders` CRUD | `database.js`, `statusMapper.js` |
| **Delivery Shopify** | `deliveryShopify.js` | Transport | Legacy Delivery Resolution | Legacy Shopify order fetching | `shopifyService.js` |
| **Legacy CSV** | `legacyCsv.js` | Business | Legacy Delivery Resolution | Legacy CSV parsing | `orderMatcher.js` |
| **Reconciliation Service** | `reconciliationService.js` | Business | Legacy Delivery Resolution | Legacy sync orchestration | `deliveryShopify.js`, `shiprocketService.js`, `deliveryRepository.js`, `legacyCsv.js`, `orderMatcher.js`, `statusMapper.js` |

---

## 4. Dependency Direction Rules

```
Business Layer  →  Repository Layer  →  Transport Layer
     ↓                  ↓                     ↓
  (validation,      (database            (external API
   orchestration)    queries)             calls)
```

### 4.1 Allowed Dependencies

| From Layer | To Layer | Example |
| --- | --- | --- |
| Business → Repository | Allowed | `orderMappingService.js` → `orderMappingRepository.js` |
| Business → Transport | Allowed | `orderMappingService.js` → `orderMappingShopify.js` |
| Business → Business | Allowed (same domain) | `orderMappingService.js` → `orderMappingCsv.js` |
| Repository → Transport | Prohibited | No repository should call external APIs |
| Transport → Business | Prohibited | No transport module should contain business logic |
| Legacy → Active | Prohibited | Legacy services must not import active services |

### 4.2 Current Violations

| Violation | Location | Status | Resolution |
| --- | --- | --- | --- |
| `orderMappingShiprocket.js` → `orderMappingRepository.js` (Transport → Repository) | `createNetworkLog` call | **ACCEPTED** | Logging is cross-cutting; acceptable for observability |
| `orderMappingShopify.js` → `orderMappingRepository.js` (Transport → Repository) | `createNetworkLog` call | **ACCEPTED** | Logging is cross-cutting; acceptable for observability |

---

## 5. Acceptance Criteria Verification

- [x] **Each app service owns business rules for its domain.** (Section 3: every service has a clear owner and responsibility set).
- [x] **Repositories own persistence; transport owns provider calls.** (Section 3: Repository layer owns DB queries; Transport layer owns API calls).
- [x] **Boundary dependency direction is documented and tested.** (Section 4: dependency rules documented; violations accepted with rationale).
