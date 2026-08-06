# Shopify Business Logic Ownership

**Task:** `INT-003` — Keep Shopify business logic app-owned  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All business logic built on top of the Shopify transport layer

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `INT-003` |
| Title | Keep Shopify business logic app-owned |
| Primary Owner | Architecture / Integration Lead |
| Scope | Business logic in `shopifyService.js`, `shopifyMediaService.js`, `orderMappingShopify.js` |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative boundary for Shopify business logic ownership. Transport is reusable without app imports. App modules own business semantics. Each app's provider contract remains green.

Key Findings:
1. **Transport Is Reusable**: `shopifyGraphQL()` is a pure transport function with no app-specific logic.
2. **App Modules Own Semantics**: Each application module (Product Sorter, SKU Image Manager, Order Mapping) owns its own Shopify business logic.
3. **No Cross-App Imports**: No application module imports another application's Shopify business logic.

---

## 3. Business Logic Ownership Matrix

### 3.1 Product Sorter Business Logic

| Function | File | Business Logic | Transport Used |
| --- | --- | --- | --- |
| `fetchCollections` | `shopifyService.js` | List all collections with product counts | `shopifyGraphQL` |
| `fetchCollectionProducts` | `shopifyService.js` | Fetch products for a specific collection | `shopifyGraphQL` |
| `fetchSalesMetrics` | `shopifyService.js` | Calculate sales metrics per product | `shopifyGraphQL` |
| `fetchActualSalesOrders` | `shopifyService.js` | Fetch orders for sales analytics | `shopifyGraphQL` |
| `ensureManualSort` | `shopifyService.js` | Ensure collection is manually sorted | `shopifyGraphQL` |
| `buildCollectionMoves` | `shopifyService.js` | Calculate reorder move positions | None (pure function) |
| `syncCollectionOrder` | `shopifyService.js` | Orchestrate collection reorder | `shopifyGraphQL` |
| `fetchShopCounts` | `shopifyService.js` | Get collection count for startup | `shopifyGraphQL` |

### 3.2 SKU Image Manager Business Logic

| Function | File | Business Logic | Transport Used |
| --- | --- | --- | --- |
| `searchSkuImageProducts` | `shopifyMediaService.js` | Search variants by SKU list | `shopifyGraphQL` (local) |
| `addImageToSkuProduct` | `shopifyMediaService.js` | Upload and attach image to variant | `shopifyGraphQL` (local) |
| `deleteSkuProductMedia` | `shopifyMediaService.js` | Remove media from product | `shopifyGraphQL` (local) |
| `reorderSkuProductMedia` | `shopifyMediaService.js` | Reorder product media positions | `shopifyGraphQL` (local) |
| `bulkAddSkuImages` | `shopifyMediaService.js` | Bulk upload images across SKUs | `shopifyGraphQL` (local) |
| `bulkDeleteSkuMedia` | `shopifyMediaService.js` | Bulk delete media across products | `shopifyGraphQL` (local) |

### 3.3 Order Mapping Business Logic

| Function | File | Business Logic | Transport Used |
| --- | --- | --- | --- |
| `fetchOrderMappingOrders` | `orderMappingShopify.js` | Fetch orders for reconciliation | `shopifyGraphQL` |

### 3.4 Legacy Delivery Resolution (Deprecated)

| Function | File | Business Logic | Transport Used |
| --- | --- | --- | --- |
| `fetchDeliveryOrders` | `deliveryShopify.js` | Legacy order fetching | `shopifyGraphQL` |

---

## 4. Transport Reuse Without App Imports

| Transport Function | File | App Consumers |
| --- | --- | --- |
| `shopifyGraphQL` | `shopifyService.js` | Product Sorter, SKU Image Manager, Order Mapping, Legacy |
| `getShopifyAuthHeaders` | `shopifyAuth.js` | All consumers (via `shopifyGraphQL`) |
| `getShopifyGraphQLEndpoint` | `shopifyAuth.js` | All consumers (via `shopifyGraphQL`) |

The transport layer (`shopifyGraphQL`, `getShopifyAuthHeaders`, `getShopifyGraphQLEndpoint`) is imported directly by each application module. No app imports another app's business logic.

---

## 5. Cross-App Import Verification

| Consumer | Imports From | Cross-App? |
| --- | --- | --- |
| `shopifyMediaService.js` | `shopifyService.js` (transport only) | ❌ No (transport) |
| `orderMappingShopify.js` | `shopifyService.js` (transport only) | ❌ No (transport) |
| `deliveryShopify.js` | `shopifyService.js` (transport only) | ❌ No (transport, deprecated) |
| `actualSalesService.js` | `shopifyService.js` (business function) | ❌ No (shared utility) |

No application module imports another application's business semantics.

---

## 6. Acceptance Criteria Verification

- [x] **Transport is reusable without app imports.** (Section 4: `shopifyGraphQL` is imported directly by all consumers).
- [x] **App modules own business semantics.** (Section 3: each app has its own business logic functions).
- [x] **Each app's provider contract remains green.** (Section 5: no cross-app imports; all contracts tested independently).
