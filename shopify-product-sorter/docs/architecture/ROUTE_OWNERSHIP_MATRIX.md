# Route Ownership Matrix

**Task:** `OWN-007` — Approve route ownership matrix  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** Every HTTP route endpoint in the application

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `OWN-007` |
| Title | Approve route ownership matrix |
| Primary Owner | Architecture / Integration Lead |
| Scope | All `GET`, `POST`, `PUT`, `DELETE` routes in `server/src/routes/api.js`, `server/src/routes/orderMapping.js`, and `server/src/app.js` |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document provides the single, authoritative ownership matrix for every HTTP route in the application. Every route has exactly one provisional owner. Aliases, redirects, and disabled labels are explicitly distinguished. No route is marked removable without a deprecation test path.

Key Rules:
1. **Single Owner**: Every route has exactly one owning application surface.
2. **Aliases Distinct**: Redirect routes and legacy aliases are flagged with `ALIAS` designation.
3. **No Removal Without Path**: Routes flagged for eventual removal have an assigned deprecation task and test coverage requirement.

---

## 3. Complete Route Ownership Matrix

### 3.1 Application Shell & Health

| Method | Route | Handler Location | Owner | Designation | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/health` | `api.js:208` | **System Diagnostics** | Active | Basic health check |
| `GET` | `/delivery-resolution` | `app.js` | **Legacy Delivery Resolution** | ALIAS | 302 redirect to `/order-mapping`; deferred to `CLEAN-001` |

### 3.2 Product Sorter (`/api/collections/*`)

| Method | Route | Handler Location | Owner | Designation | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/collections` | `api.js:424` | **Product Sorter** | Active | List collections |
| `GET` | `/api/collection-products` | `api.js:438` | **Product Sorter** | Active | Fetch collection products |
| `POST` | `/api/collections/sync` | `api.js:465` | **Product Sorter** | Active | Sync collection from Shopify |
| `GET` | `/api/collections/state` | `api.js:486` | **Product Sorter** | Active | Get sorter state |
| `PUT` | `/api/collections/settings` | `api.js:504` | **Product Sorter** | Active | Update strategy weights |
| `PUT` | `/api/collections/products/preference` | `api.js:522` | **Product Sorter** | Active | Update pin/hide preferences |
| `POST` | `/api/collections/generate` | `api.js:539` | **Product Sorter** | Active | Generate sorted order |
| `POST` | `/api/collections/apply` | `api.js:574` | **Product Sorter** | Active | Apply order to Shopify |
| `POST` | `/api/collections/reorder-all-v2` | `api.js:608` | **Product Sorter** | Active | Batch reorder all custom collections |
| `POST` | `/api/collections/reorder-all` | `api.js:1021` | **Product Sorter** | LEGACY | Duplicate batch reorder; deferred to `CLEAN-002` |
| `POST` | `/api/collections/rollback` | `api.js:1067` | **Product Sorter** | Active | Restore from snapshot |
| `GET` | `/api/collections/logs/actions` | `api.js:212` | **Product Sorter** | Active | Sorter action logs |
| `GET` | `/api/collections/logs/network` | `api.js:229` | **Product Sorter** | Active | Sorter network logs |

### 3.3 Order Mapping (`/api/order-mapping/*`)

| Method | Route | Handler Location | Owner | Designation | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/order-mapping/orders` | `orderMapping.js` | **Order Mapping** | Active | List order mappings |
| `GET` | `/api/order-mapping/orders/:id` | `orderMapping.js` | **Order Mapping** | Active | Get order mapping details |
| `GET` | `/api/order-mapping/logs/network` | `orderMapping.js` | **Order Mapping** | Active | Order mapping network logs |
| `GET` | `/api/order-mapping/logs/actions` | `orderMapping.js` | **Order Mapping** | Active | Order mapping action logs |
| `POST` | `/api/order-mapping/sync/shopify` | `orderMapping.js` | **Order Mapping** | Active | Sync Shopify orders |
| `POST` | `/api/order-mapping/sync/shiprocket` | `orderMapping.js` | **Order Mapping** | Active | Refresh Shiprocket data |
| `POST` | `/api/order-mapping/shipments/:id/refresh` | `orderMapping.js` | **Order Mapping** | Active | Refresh single shipment |
| `POST` | `/api/order-mapping/shipments/:id/manual` | `orderMapping.js` | **Order Mapping** | Active | Manual status override |
| `POST` | `/api/order-mapping/shipments/:id/clear-manual` | `orderMapping.js` | **Order Mapping** | Active | Clear manual override |
| `POST` | `/api/order-mapping/imports/preview` | `orderMapping.js` | **Order Mapping** | Active | CSV import preview |
| `POST` | `/api/order-mapping/imports/:id/commit` | `orderMapping.js` | **Order Mapping** | Active | CSV import commit |
| `POST` | `/api/order-mapping/admin/migrate-sqlite` | `orderMapping.js` | **Order Mapping** | Admin | Migration endpoint |

### 3.4 SKU Image Manager (`/api/sku-images/*`)

| Method | Route | Handler Location | Owner | Designation | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/sku-images/search` | `api.js:1103` | **SKU Image Manager** | Active | Search SKU products |
| `POST` | `/api/sku-images/load-all` | `api.js:1114` | **SKU Image Manager** | Active | Load all SKU products |
| `POST` | `/api/sku-images/add` | `api.js:1124` | **SKU Image Manager** | Active | Add image payload |
| `POST` | `/api/sku-images/add-upload` | `api.js:1134` | **SKU Image Manager** | Active | Upload image file |
| `POST` | `/api/sku-images/add-url` | `api.js:1152` | **SKU Image Manager** | Active | Add image via URL |
| `POST` | `/api/sku-images/delete` | `api.js:1171` | **SKU Image Manager** | Active | Delete media |
| `POST` | `/api/sku-images/reorder` | `api.js:1181` | **SKU Image Manager** | Active | Reorder media |
| `POST` | `/api/sku-images/bulk-add` | `api.js:1191` | **SKU Image Manager** | Active | Bulk add via URL |
| `POST` | `/api/sku-images/bulk-add-upload` | `api.js:1201` | **SKU Image Manager** | Active | Bulk add via upload |
| `POST` | `/api/sku-images/bulk-delete-preview` | `api.js:1239` | **SKU Image Manager** | Active | Bulk delete preview |
| `POST` | `/api/sku-images/bulk-delete-confirm` | `api.js:1249` | **SKU Image Manager** | Active | Bulk delete confirm |

### 3.5 Actual Sales Intelligence (`/api/sales-intelligence/*`)

| Method | Route | Handler Location | Owner | Designation | Notes |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/sales-intelligence/refresh-shopify` | `api.js:1280` | **Actual Sales Intelligence** | Active | Refresh Shopify data |
| `POST` | `/api/sales-intelligence/refresh-shiprocket` | `api.js:1290` | **Actual Sales Intelligence** | Active | Refresh Shiprocket data |
| `POST` | `/api/sales-intelligence/reconcile` | `api.js:1300` | **Actual Sales Intelligence** | Active | Reconcile data |
| `GET` | `/api/sales-intelligence/summary` | `api.js:1310` | **Actual Sales Intelligence** | Active | Summary metrics |
| `GET` | `/api/sales-intelligence/reconciled-orders` | `api.js:1330` | **Actual Sales Intelligence** | Active | Reconciled orders |
| `GET` | `/api/sales-intelligence/analytics` | `api.js:1350` | **Actual Sales Intelligence** | Active | SKU performance analytics |
| `GET` | `/api/sales-intelligence/export` | `api.js:1370` | **Actual Sales Intelligence** | Active | Export analytics data |
| `GET` | `/api/actual-sales-intelligence` | `api.js:1380` | **Actual Sales Intelligence** | ALIAS | Legacy redirect; deferred to `CLEAN-002` |

### 3.6 Debug

| Method | Route | Handler Location | Owner | Designation | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/debug/shopify` | `api.js` | **System Diagnostics** | Debug | Debug Shopify connection; restrict in production |

---

## 4. Designation Definitions

| Designation | Meaning |
| --- | --- |
| **Active** | Route is in production use and owned by the designated application surface |
| **ALIAS** | Route exists for backward compatibility; redirects to the canonical route; deferred for removal |
| **LEGACY** | Route is superseded by a newer version; deferred for removal with test coverage |
| **Admin** | Administrative/migration route; restricted access; not part of public API |
| **Debug** | Diagnostic route; restrict in production; not part of public API |

---

## 5. Deprecation & Removal Path

No route is marked removable without a test/deprecation path:

| Route | Deprecation Task | Test Requirement |
| --- | --- | --- |
| `/delivery-resolution` (ALIAS) | `CLEAN-001` | Verify redirect still works after canonical route migration |
| `/api/collections/reorder-all` (LEGACY) | `CLEAN-002` | Verify `reorder-all-v2` covers all use cases |
| `/api/actual-sales-intelligence` (ALIAS) | `CLEAN-002` | Verify frontend uses `/api/sales-intelligence/summary` |

---

## 6. Acceptance Criteria Verification

- [x] **Every current route has exactly one provisional owner.** (See Sections 3.1–3.6; every route has exactly one owning application surface).
- [x] **Aliases and disabled labels are distinguished.** (ALIAS, LEGACY, Admin, and Debug designations explicitly documented in Section 4).
- [x] **No route is marked removable without a test/deprecation path.** (Section 5 documents deprecation tasks and test requirements for every removable route).
