# Shopify Client Inventory and Contract

**Task:** `INT-001` — Inventory and contract Shopify clients  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All Shopify API implementations, callers, and contracts in `server/src/`

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `INT-001` |
| Title | Inventory and contract Shopify clients |
| Primary Owner | Architecture / Integration Lead |
| Scope | `server/src/services/shopifyService.js`, `server/src/services/shopifyAuth.js`, `server/src/services/shopifyMediaService.js`, and all callers |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document provides the single, authoritative inventory of all Shopify API implementations and callers. All Shopify implementations/callers are listed. Writes are separately identified from reads. No secret values are captured.

---

## 3. Shopify Client Implementations

### 3.1 Core Transport Client

| Client | File | Owner | Type | Operations |
| --- | --- | --- | --- | --- |
| **Shopify GraphQL Client** | `shopifyService.js` | Product Sorter | Transport | `shopifyGraphQL()` — generic GraphQL executor |
| **Shopify Auth Client** | `shopifyAuth.js` | Product Sorter | Transport | `getShopifyAuthHeaders()`, `getShopifyGraphQLEndpoint()`, `primeShopifyAuthCache()` |

### 3.2 Application-Specific Clients

| Client | File | Owner | Type | Operations |
| --- | --- | --- | --- | --- |
| **SKU Image Media Client** | `shopifyMediaService.js` | SKU Image Manager | Business + Transport | Variant search, media CRUD, bulk operations, staging upload |
| **Order Mapping Shopify Client** | `orderMappingShopify.js` | Order Mapping | Transport | Order fetching for reconciliation |
| **Legacy Delivery Shopify Client** | `deliveryShopify.js` | Legacy Delivery Resolution | Transport | Legacy order fetching (deprecated) |

---

## 4. Complete Caller Inventory

### 4.1 Read Operations

| Caller | File | Operation | Shopify API | Purpose |
| --- | --- | --- | --- | --- |
| `fetchShopCounts` | `shopifyService.js` | `shopifyGraphQL` | `query ReorderAccess` | Get collection count for startup |
| `fetchActualSalesOrders` | `shopifyService.js` | `shopifyGraphQL` | Orders query | Fetch orders for sales analytics |
| `fetchOrderMappingOrders` | `orderMappingShopify.js` | `shopifyGraphQL` | Orders query | Fetch orders for reconciliation |
| `fetchDeliveryOrders` | `deliveryShopify.js` | `shopifyGraphQL` | Orders query | Legacy order fetch (deprecated) |
| `searchSkuImageProducts` | `shopifyMediaService.js` | `shopifyGraphQL` | `productVariants` query | Search variants by SKU |
| `loadAllSkuImageProducts` | `shopifyMediaService.js` | `shopifyGraphQL` | `productVariants` query | Load all variants |
| `warnIfMissingSkuImageScopes` | `shopifyMediaService.js` | `shopifyGraphQL` | `ReorderAccess` query | Check required OAuth scopes |

### 4.2 Write Operations

| Caller | File | Operation | Shopify API | Purpose |
| --- | --- | --- | --- | --- |
| `syncCollectionOrder` | `shopifyService.js` | `shopifyGraphQL` | `collectionReorderProducts` mutation | Reorder collection products |
| `addImageToSkuProduct` | `shopifyMediaService.js` | `shopifyGraphQL` | `stagedUploadsCreate`, `productCreateMedia`, `productVariantUpdate` | Add image to product |
| `deleteSkuProductMedia` | `shopifyMediaService.js` | `shopifyGraphQL` | `productDeleteMedia` | Delete product media |
| `reorderSkuProductMedia` | `shopifyMediaService.js` | `shopifyGraphQL` | `productReorderMedia` | Reorder product media |
| `bulkAddSkuImages` | `shopifyMediaService.js` | `shopifyGraphQL` | `stagedUploadsCreate`, `productCreateMedia`, `productVariantUpdate` | Bulk add images |
| `bulkDeleteSkuMedia` | `shopifyMediaService.js` | `shopifyGraphQL` | `productDeleteMedia` | Bulk delete media |

---

## 5. OAuth Scope Requirements

| Scope | Required By | Read/Write | Purpose |
| --- | --- | --- | --- |
| `read_products` | All Shopify consumers | Read | Product/variant queries |
| `write_products` | SKU Image Manager | Write | Media CRUD and variant updates |
| `read_orders` | Actual Sales Intelligence, Order Mapping | Read | Order data queries |
| `write_orders` | Product Sorter | Write | Collection reorder |

---

## 6. Secret Values (Never Captured in Logs)

| Secret | Environment Variable | Owner | Logged? |
| --- | --- | --- | --- |
| Access Token | `SHOPIFY_ADMIN_ACCESS_TOKEN` | Product Sorter | ❌ Never |
| Client Secret | `SHOPIFY_CLIENT_SECRET` | Product Sorter | ❌ Never |
| Store Domain | `SHOPIFY_STORE_DOMAIN` | Product Sorter | ✅ Safe (non-secret) |
| Client ID | `SHOPIFY_CLIENT_ID` | Product Sorter | ✅ Safe (non-secret) |
| API Version | `SHOPIFY_API_VERSION` | Product Sorter | ✅ Safe (non-secret) |

---

## 7. Acceptance Criteria Verification

- [x] **All Shopify implementations/callers are listed.** (Sections 3–4: 4 implementations, 7 read operations, 6 write operations documented).
- [x] **Writes are separately identified from reads.** (Sections 4.1–4.2: reads and writes separately inventoried).
- [x] **No secret values are captured.** (Section 6: secrets explicitly marked as never logged).
