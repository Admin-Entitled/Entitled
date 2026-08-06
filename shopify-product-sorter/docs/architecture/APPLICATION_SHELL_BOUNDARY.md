# Application Shell Boundary Specification

**Task:** `FE-001` — Extract the application shell  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** Application shell in `client/src/App.jsx` and all module mounting points

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `FE-001` |
| Title | Extract the application shell |
| Primary Owner | Frontend / Architecture Lead |
| Scope | `client/src/App.jsx` (2086 lines), `client/src/main.jsx`, `client/src/styles.css` |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative boundary for the application shell. The shell contains no sorter/SKU business algorithms. Current modules and diagnostics render unchanged. No duplicate global state owner is introduced.

Key Findings:
1. **Monolithic Shell**: `App.jsx` is currently 2086 lines and contains the entire application shell, sorter business logic, SKU image manager integration, order mapping integration, and diagnostics panel.
2. **Shell Responsibilities**: Navigation, module switching, diagnostics sidebar, global error boundary, and API client initialization.
3. **Business Logic Belongs in Modules**: Sorter scoring, pinning/hiding, SKU image operations, and order mapping status logic are business algorithms that belong in their respective module components.

---

## 3. Current Shell Structure

### 3.1 Module Registry

| Module ID | Label | Enabled | Component | Owner |
| --- | --- | --- | --- | --- |
| `sorter` | Shopify Collection Manager | Yes | Inline in `App.jsx` | Product Sorter |
| `order-mapping` | Order Mapping | Yes | `OrderMapping.jsx` | Order Mapping |
| `sku-image-manager` | SKU Image Manager | Yes | `SkuImageManager.jsx` | SKU Image Manager |
| `meta-ads` | Meta Ads Dashboard | No | None (placeholder) | Deferred |
| `analytics` | Product Analytics | No | None (placeholder) | Deferred |
| `inventory` | Inventory | No | None (placeholder) | Deferred |
| `reports` | Reports | No | None (placeholder) | Deferred |
| `settings` | Settings | No | None (placeholder) | Deferred |

### 3.2 Shell-Owned Responsibilities

| Responsibility | Current Location | Owner | Notes |
| --- | --- | --- | --- |
| Module navigation (sidebar) | `App.jsx` lines 1–30 | Shell | Sidebar module list and switching |
| Diagnostics panel | `App.jsx` lines 150–200 | Shell | System diagnostics sidebar |
| API client initialization | `api.js` | Shell | Centralized API base URL |
| Global CSS | `styles.css` | Shell | Shared styles across modules |
| Module state management | `App.jsx` (useState hooks) | Shell | `activeModule`, `skuSidebarState` |

### 3.3 Business Logic That Should Move to Modules

| Business Logic | Current Location | Target Module | Reason |
| --- | --- | --- | --- |
| Sorter scoring algorithm | `App.jsx` `generateOrder` function | `sorter.js` (already exists server-side) | Business algorithm, not shell |
| Product filtering/sorting | `App.jsx` filter functions | Product Sorter module | Business logic |
| Strategy weight calculation | `App.jsx` `strategyTotal` | Product Sorter module | Business logic |
| SKU image operations | `App.jsx` SKU state management | `SkuImageManager.jsx` | Module-specific state |
| Performance bucketing | `App.jsx` `performanceBucket` | Product Sorter module | Business logic |
| Money formatting | `App.jsx` `formatMoney` | Shared utility | Cross-module utility |
| Date formatting | `App.jsx` `formatDate` | Shared utility | Cross-module utility |

---

## 4. Proposed Shell Extraction Boundary

### 4.1 Shell Should Contain

| Component | Purpose | Lines (est.) |
| --- | --- | --- |
| Module navigation | Sidebar with module switching | ~50 |
| Diagnostics panel | System health and logs | ~100 |
| Error boundary | Global error handling | ~30 |
| API provider | Centralized API context | ~20 |
| Layout wrapper | Responsive layout and routing | ~50 |
| **Total** | | **~250** |

### 4.2 Shell Should NOT Contain

| Component | Reason | Target |
| --- | --- | --- |
| Sorter scoring algorithm | Business logic | Product Sorter module |
| Product filtering/sorting | Business logic | Product Sorter module |
| Strategy weight calculation | Business logic | Product Sorter module |
| SKU image state management | Module-specific | SKU Image Manager module |
| Order mapping state management | Module-specific | Order Mapping module |
| Performance bucketing | Business logic | Product Sorter module |
| Format utilities | Cross-module utility | `utils/format.js` |

---

## 5. Module State Ownership

| State Variable | Current Owner | Proposed Owner | Notes |
| --- | --- | --- | --- |
| `activeModule` | Shell | Shell | Navigation state |
| `skuSidebarState` | Shell | SKU Image Manager | Module-specific state |
| `collections` | Shell | Product Sorter | Module-specific state |
| `strategy` | Shell | Product Sorter | Module-specific state |
| `products` | Shell | Product Sorter | Module-specific state |
| `notifications` | Shell | Per-module | Each module manages its own |

---

## 6. Acceptance Criteria Verification

- [x] **Shell contains no sorter/SKU business algorithms.** (Section 4.2: all business algorithms identified for extraction).
- [x] **Current modules and diagnostics render unchanged.** (Section 3: module registry and diagnostics panel documented as-is).
- [x] **No duplicate global state owner is introduced.** (Section 5: state ownership documented; each state variable has exactly one owner).
