# Shopify Client Inventory

**Task:** INT-001  
**Status:** Completed  
**Last updated:** 2026-08-06  
**Validation:** Static search · Synthetic fixtures · `tests/providerInventory.test.js`

---

## Scope

This document inventories every Shopify API client, service, and caller in the
`shopify-product-sorter` application.  No secret values, tokens, or customer payloads
are recorded here.  Authentication sources are referenced by environment-variable name only.

---

## Client Modules

### 1. `server/src/services/shopifyAuth.js`

| Field | Value |
|---|---|
| **Domain** | server |
| **API Family** | REST (OAuth client-credentials) |
| **Disposition** | `CURRENT_OWNER` |

#### Exported symbols

| Symbol | Operation | HTTP | Classification | Notes |
|---|---|---|---|---|
| `getShopifyGraphQLEndpoint()` | Build endpoint URL | — | READ | Pure helper; no HTTP call |
| `getAccessToken()` | Acquire OAuth token | POST `/admin/oauth/access_token` | READ | Caches token in memory; coalesces concurrent requests |
| `getShopifyAuthHeaders()` | Build auth header map | — | READ | Returns `{headers:{…}}` with token; header value is not logged |
| `primeShopifyAuthCache()` | Warm token cache at startup | POST `/admin/oauth/access_token` | READ | No-op when credentials absent |
| `getCachedTokenStatus()` | Report cache state | — | READ | Returns expiry metadata; never returns token value |
| `resetShopifyAuthCache()` | Clear cached token | — | WRITE (state) | Test helper; flushes in-memory cache |

#### Authentication

| Source | Variable name |
|---|---|
| Store domain | `SHOPIFY_STORE_DOMAIN` |
| OAuth client ID | `SHOPIFY_CLIENT_ID` |
| OAuth client secret | `SHOPIFY_CLIENT_SECRET` |
| Static admin token (optional override) | `SHOPIFY_ADMIN_ACCESS_TOKEN` |
| API version | `SHOPIFY_API_VERSION` |

#### Ownership

| Concern | Owner |
|---|---|
| Retry / back-off | None (single attempt; callers retry) |
| Throttle | None |
| Error normalization | Inline — throws `Error` with message |
| Logging / redaction | `logInfo` / `logError` from `server/src/utils/logger.js`; `SHOPIFY_CLIENT_SECRET` not logged |

#### Callers

- `server/src/services/shopifyService.js` — imports `getShopifyGraphQLEndpoint`, `getShopifyAuthHeaders`
- `server/src/services/shopifyMediaService.js` — imports `getShopifyGraphQLEndpoint`, `getShopifyAuthHeaders`
- `server/src/index.js` — imports `primeShopifyAuthCache`
- `server/src/routes/api.js` — imports `getCachedTokenStatus`

#### Test coverage

- `server/src/services/providerIntegration.test.js` — OAuth token acquisition, static token, 401 failure
- `tests/providerInventory.test.js` — inventory contract

---

### 2. `server/src/services/shopifyService.js`

| Field | Value |
|---|---|
| **Domain** | server |
| **API Family** | GraphQL (Admin API) |
| **Disposition** | `CURRENT_OWNER` |

#### Exported symbols

| Symbol | Operation | GraphQL type | Classification | Notes |
|---|---|---|---|---|
| `shopifyGraphQL(query, vars)` | Raw GraphQL transport | query or mutation | READ/WRITE | Shared internal transport; logs cost/throttle; no variable redaction by default |
| `fetchCollections()` | List collections | query `FetchCollections` | READ | Paginated |
| `fetchCollectionProducts(id)` | List products in collection | query `FetchCollectionProducts` | READ | Paginated |
| `fetchSalesMetrics(productIds)` | Fetch variant sales data | query (inline) | READ | |
| `fetchActualSalesOrders(days)` | Fetch orders for sales analysis | query (inline) | READ | Paginated; date-windowed |
| `ensureManualSort(collectionId)` | Set collection sort to MANUAL | mutation `EnsureManualSort` | **WRITE** | Modifies collection sort order |
| `buildCollectionMoves(cur, des)` | Compute reorder moves | — | READ | Pure helper; no HTTP |
| `syncCollectionOrder(id, ids)` | Reorder collection products | mutation `ReorderCollection` + poll | **WRITE** | Batch up to 250 moves; polls job completion |
| `fetchShopCounts()` | Fetch collection and product counts | query `FetchShopCounts` | READ | |

#### Authentication

Delegates to `shopifyAuth.js` — see above.

#### Ownership

| Concern | Owner |
|---|---|
| Retry / back-off | None in transport layer; callers retry |
| Throttle | Reads `extensions.cost.throttleStatus` but does not self-throttle |
| Error normalization | Throws descriptive `Error` on HTTP error or GraphQL errors array |
| Logging / redaction | `logInfo` / `logError` from `server/src/utils/logger.js`; query preview (first 100 chars) only |

#### Callers

- `server/src/routes/sorter.js` — imports `fetchCollections`, `fetchCollectionProducts`, `ensureManualSort`, `syncCollectionOrder`
- `server/src/routes/api.js` — imports `fetchShopCounts`
- `server/src/services/actualSalesService.js` — imports `fetchActualSalesOrders`
- `server/src/services/orderMappingShopify.js` — imports `shopifyGraphQL` (own query wrapper)
- `server/src/services/deliveryMigratorService.js` — imports `fetchSalesMetrics`

#### Test coverage

- `server/src/services/providerIntegration.test.js` — fetchCollections, fetchShopCounts, HTTP 500 error, GraphQL error
- `server/src/services/sorter.test.js` — reorder integration
- `server/src/services/collectionSyncApplyRollback.test.js` — sync and rollback
- `tests/providerInventory.test.js` — inventory contract

---

### 3. `server/src/services/shopifyMediaService.js`

| Field | Value |
|---|---|
| **Domain** | server / SKU Image Manager |
| **API Family** | GraphQL (Admin API) + staged upload (REST) |
| **Disposition** | `CURRENT_OWNER` |

#### Exported symbols

| Symbol | Operation | Classification | Notes |
|---|---|---|---|
| `getShopifyScopeDiagnostics()` | Query required scopes | READ | Returns scope status for diagnostics |
| `warnIfMissingSkuImageScopes()` | Warn on missing scopes | READ | Logs warning; no mutation |
| `searchSkuImageProducts({skuInput})` | Search products by SKU | READ | |
| `addImageToSkuProduct({…})` | Upload and attach image | **WRITE** | Staged upload + productCreateMedia mutation |
| `deleteImageFromSkuProduct({…})` | Remove product image | **WRITE** | `productDeleteMedia` mutation (deprecated, noted in TODO) |
| `reorderSkuProductImages({…})` | Reorder product images | **WRITE** | `productUpdateMedia` / reorder mutation |
| `previewBulkDelete({…})` | Preview bulk delete | READ | No mutations |
| `confirmBulkDelete({…})` | Execute bulk image delete | **WRITE** | Calls `deleteImageFromSkuProduct` in loop |
| `bulkAddImageToSkuProducts({…})` | Execute bulk image add | **WRITE** | Calls `addImageToSkuProduct` in loop |
| `REQUIRED_SCOPES` | Scope list constant | READ | String array |

#### Authentication

Delegates to `shopifyAuth.js` — see above.

#### Ownership

| Concern | Owner |
|---|---|
| Retry / back-off | None at service level |
| Throttle | Not implemented |
| Error normalization | Throws `Error` with contextual message |
| Logging / redaction | Audit log via `appendSkuImageAuditLog` (SKU, productId logged; no customer PII) |

#### Callers

- `server/src/routes/skuMedia.js` — all exports

#### Test coverage

- `server/src/services/shopifyMediaService.test.js`
- `tests/providerInventory.test.js` — inventory contract

---

### 4. `server/src/services/orderMappingShopify.js`

| Field | Value |
|---|---|
| **Domain** | server / Order Mapping |
| **API Family** | GraphQL (Admin API) |
| **Disposition** | `CURRENT_OWNER` |

#### Exported symbols

| Symbol | Operation | GraphQL type | Classification | Notes |
|---|---|---|---|---|
| `fetchOrderMappingOrders({start,end})` | Fetch orders in date window | query `OrderMappingOrders` | READ | Paginated; logs network events to DB |

#### Authentication

Delegates to `shopifyService.js` → `shopifyAuth.js`.

#### Ownership

| Concern | Owner |
|---|---|
| Retry | None; callers handle retry |
| Throttle | None |
| Error normalization | Throws on GraphQL/HTTP error; logs to network-log table |
| Logging / redaction | Network log written to DB via `createNetworkLog`; `redactVariables: true` passed to `shopifyGraphQL` |

#### Callers

- `server/src/services/orderMappingService.js` — imports `fetchOrderMappingOrders`

#### Test coverage

- `server/src/services/orderMapping.test.js`
- `tests/providerInventory.test.js` — inventory contract

---

## Read / Write Summary

| Module | READ ops | WRITE ops |
|---|---|---|
| shopifyAuth.js | 5 | 0 (resetShopifyAuthCache is state, not API) |
| shopifyService.js | 7 | 2 (`ensureManualSort`, `syncCollectionOrder`) |
| shopifyMediaService.js | 4 | 5 (`add`, `delete`, `reorder`, `confirmBulk`, `bulkAdd`) |
| orderMappingShopify.js | 1 | 0 |
| **Total** | **17** | **7** |

---

## Environment Variables (by name only)

| Variable | Purpose |
|---|---|
| `SHOPIFY_STORE_DOMAIN` | Store myshopify domain |
| `SHOPIFY_CLIENT_ID` | OAuth app client ID |
| `SHOPIFY_CLIENT_SECRET` | OAuth app client secret |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Optional static admin token (bypasses OAuth) |
| `SHOPIFY_API_VERSION` | API version (default `2026-04`) |
| `SHOPIFY_ANALYTICS_DAYS` | Look-back window for sales analytics |

---

## Unresolved Items

None. All discovered Shopify sources have been inventoried.

---

## Validation

```
node --test tests/providerInventory.test.js
```

All tests in section A (INT-001) must pass.
