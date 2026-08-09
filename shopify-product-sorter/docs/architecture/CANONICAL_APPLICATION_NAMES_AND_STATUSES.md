# Canonical Application Names and Statuses Register

**Task:** OWN-001 — Establish canonical application names and statuses  
**Created:** 2026-07-30  
**Status:** Approved Specification  
**Scope:** All frontend, backend, service, and placeholder surfaces in the repository

---

## Executive Summary

This document establishes the canonical naming, legacy aliases, execution status, assigned owner, and target boundary for every application surface in the codebase.

Key rules:
1. **Disabled UI labels** (`analytics`, `inventory`, `reports`, `settings`) are UI placeholders, NOT application surfaces. **Meta Ads** was promoted from placeholder to an active READ-ONLY module (2026-08-09, sign-off in `META_ADS_READINESS_DECISION.md`).
2. **Product Sorter** is the canonical name for the collection sorting engine (previously referred to as "Shopify Collection Manager" in the UI nav or "Collection Placement Manager" in `package.json` and App header).
3. **Order Mapping** is the canonical name for order status reconciliation and mapping (previously "Delivery Resolution").
4. **Legacy Delivery Resolution** (`/delivery-resolution`) is a compatibility redirect layer, NOT an active application.

---

## Canonical Surface Registry

| Surface ID | Canonical Name | Legacy / Secondary Aliases | Executable Status | Assigned Owner | Primary Routes / Entrypoints | Target Boundary |
|---|---|---|---|---|---|---|
| `sorter` | **Product Sorter** | Collection Placement Manager (`package.json`, App header), Shopify Collection Manager (Nav item) | **Executable** (Active Primary App) | Sorter Owner | `/`, `/api/collections*` | `client/src/apps/sorter`, `server/src/apps/sorter` |
| `order-mapping` | **Order Mapping** | Order Mapping & Resolution, Delivery Resolution (legacy) | **Executable** (Active Primary App) | Order Mapping Owner | `/order-mapping`, `/api/order-mapping/*` | `client/src/apps/order-mapping`, `server/src/apps/order-mapping` |
| `sku-image-manager` | **SKU Image Manager** | SkuImageManager, SKU Images, Media Manager | **Executable** (Active Module) | SKU Image Manager Owner | Shell module (`App.jsx`), `/api/sku-images/*` | `client/src/apps/sku-image-manager`, `server/src/apps/sku-image-manager` |
| `sales-intelligence` | **Actual Sales Intelligence** | Sales Intelligence, Actual Sales | **Backend Service** (Operational Service; no separate UI) | Sales Intelligence Owner | `/api/sales-intelligence/*`, `/api/actual-sales-intelligence` | `server/src/apps/sales-intelligence` |
| `diagnostics` | **System Diagnostics** | Health Checks, System Logs, Debugging | **Shared Feature** (Observability Package) | System / Operations Owner | Shared sidebar, `/api/health`, `/api/order-mapping/logs/*` | `server/src/packages/diagnostics` |
| `delivery-legacy` | **Legacy Delivery Resolution** | Delivery Resolution, `/delivery-resolution` | **Legacy Compatibility** (Redirect Layer) | Legacy Delivery Owner | `/delivery-resolution` (redirects to `/order-mapping`) | `server/src/adapters/legacy-delivery` |
| `meta-ads` | **Meta Ads** | Meta Ads Dashboard | **Executable** (Active Read-Only Module; READ-ONLY) | Meta Ads Owner | Shell module (`App.jsx`), `/api/meta-ads/*` | `server/src/services/metaAdsService.js` + `metaAdsClient.js` |

---

## Disabled UI Placeholders (Non-Applications)

The following items exist in `client/src/App.jsx` (`sidebarModules`) with `enabled: false`. They do NOT represent executable applications or backend services and must NOT be treated as such in architectural tasks or documentation:

1. **Product Analytics** (`id: "analytics"`, `enabled: false`) — Disabled navigation item.
2. **Inventory** (`id: "inventory"`, `enabled: false`) — Disabled navigation item.
3. **Reports** (`id: "reports"`, `enabled: false`) — Disabled navigation item.
4. **Settings** (`id: "settings"`, `enabled: false`) — Disabled navigation item.

---

## Naming Standards for Code & Documentation

1. **In Master Plan & Architecture Docs**: Use **Product Sorter**, **Order Mapping**, **SKU Image Manager**, **Actual Sales Intelligence**, **System Diagnostics**, and **Meta Ads** (read-only).
2. **Package Name Alignment**: `package.json` currently uses `name: "entitled-collection-placement-manager"`. When package renaming is safe (in refactoring phases), align to canonical names or preserve as a top-level workspace package.
3. **UI Nav Alignment**: In future UI cleanup, update sidebar labels to match Canonical Names:
   - `Shopify Collection Manager` → `Product Sorter`
   - `Collection Placement Manager` → `Product Sorter Shell`
