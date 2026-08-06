# Actual Sales Intelligence Boundary Specification

**Task:** `OWN-005` — Define Actual Sales Intelligence boundary  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All backend service, route handler, cache, and data artifact surfaces for Actual Sales Intelligence

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `OWN-005` |
| Application Name | Actual Sales Intelligence |
| Canonical Name | `Actual Sales Intelligence` (`sales-intelligence`) |
| Primary Owner | Sales Intelligence Owner |
| Target Backend Location | `server/src/apps/sales-intelligence` (currently `server/src/services/actualSalesService.js`, `server/src/routes/api.js:1280-1400`) |
| Storage Location | `server/data/sales-*.json` (cache files) |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document establishes the single, authoritative ownership boundary for the **Actual Sales Intelligence** backend service. It identifies all route endpoints, internal service modules, cache artifacts, data processing logic, and external provider dependencies.

Key Architectural Findings:
1. **Backend Service Only**: Actual Sales Intelligence is a pure data aggregation service with no independent frontend UI surface.
2. **Data Source Aggregation**: It orchestrates data from both Shopify (`fetchActualSalesOrders`) and Shiprocket (`fetchShiprocketOrders`) and reconciles them into unified performance metrics.
3. **JSON-Based Caching**: It uses local JSON files for cache persistence rather than SQLite database tables.

---

## 3. Route Surface (7 API Endpoints)

All Actual Sales Intelligence routes are mounted under `/api/sales-intelligence/*` and `/api/actual-sales-intelligence` in `server/src/routes/api.js`:

| Method | Endpoint Route | Handler Location | Function / Capability |
| --- | --- | --- | --- |
| `POST` | `/api/sales-intelligence/refresh-shopify` | `server/src/routes/api.js:1280` | Refreshes Shopify order data cache |
| `POST` | `/api/sales-intelligence/refresh-shiprocket` | `server/src/routes/api.js:1290` | Refreshes Shiprocket shipment data cache |
| `POST` | `/api/sales-intelligence/reconcile` | `server/src/routes/api.js:1300` | Runs reconciliation between Shopify and Shiprocket datasets |
| `GET` | `/api/sales-intelligence/summary` | `server/src/routes/api.js:1310` | Builds aggregated summary metrics (revenue, units, success rates) |
| `GET` | `/api/sales-intelligence/reconciled-orders` | `server/src/routes/api.js:1330` | Loads full list of reconciled order records |
| `GET` | `/api/sales-intelligence/analytics` | `server/src/routes/api.js:1350` | Returns SKU performance analytics and restock recommendations |
| `GET` | `/api/actual-sales-intelligence` | `server/src/routes/api.js:1380` | Legacy redirect/compatibility endpoint |

---

## 4. Backend Service Module Ownership

| Module Name | File Location | Single Owner Responsibilities |
| --- | --- | --- |
| **Actual Sales Service** | `server/src/services/actualSalesService.js` | Core orchestration: Shopify/Shiprocket order fetching, status bucketing (`STATUS_BUCKETS`), order matching, SKU performance aggregation, sales metrics calculation (`units7`, `units30`, `units90`, `rtoUnits`, `rtoSales`), cache management, and restock recommendation logic (`Buy More`, `Buy Less`, `Hold`). |

---

## 5. Storage Artifacts & Cache Files

Actual Sales Intelligence owns the following local storage artifacts in `server/data/`:

| Artifact Name | File Path | Purpose |
| --- | --- | --- |
| **Shopify Sales Cache** | `server/data/sales-shopify-cache.json` | Local persistence of Shopify order data used for metrics calculation. |
| **Shiprocket Sales Cache** | `server/data/sales-shiprocket-cache.json` | Local persistence of Shiprocket shipment data used for status bucketing. |
| **Reconciled Sales Cache** | `server/data/sales-reconciled-cache.json` | Unified dataset of matched Shopify orders + Shiprocket shipment statuses. |

---

## 6. Provider & Data Dependencies

### 6.1 External Provider Integrations
1. **Shopify Admin API**: `fetchActualSalesOrders` via `shopifyService.js` — fetches order data with line items, quantities, and pricing.
2. **Shiprocket API**: `fetchShiprocketOrders` via `shiprocketService.js` — fetches shipment status, tracking, and AWB data.

### 6.2 Internal Service Dependencies
1. **Shiprocket Service**: `server/src/services/shiprocketService.js` (API authentication and Shiprocket GraphQL/REST queries).
2. **Shopify Service**: `server/src/services/shopifyService.js` (Shopify Admin GraphQL API and OAuth token management).
3. **File System**: Direct JSON read/write for cache persistence via `fs.readFileSync` / `fs.writeFileSync`.

---

## 7. User-Facing Status Decision

| Question | Decision |
| --- | --- |
| **Should Actual Sales Intelligence have its own frontend UI?** | **DEFERRED** (`DEFERRED` for future remediation task `FE-012` if business needs dictate). Currently serves as an API-only backend service consumed by the Product Sorter dashboard widgets. |

---

## 8. Acceptance Criteria Verification

- [x] **Every sales route and cache has one owner.** (All routes under `/api/sales-intelligence/*` and cache files in `server/data/sales-*.json` are owned by Actual Sales Intelligence Owner).
- [x] **User-facing status is explicitly decided or deferred.** (Deferment explicitly recorded in Section 7 above).
- [x] **Provider and data dependencies are listed.** (Documented in Section 6: Shopify API, Shiprocket API, and internal service dependencies).
