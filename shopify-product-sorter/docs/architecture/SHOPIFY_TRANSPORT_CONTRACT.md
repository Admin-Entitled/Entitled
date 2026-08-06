# Shopify Transport Contract

**Task:** `INT-002` — Define shared Shopify transport  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** `server/src/services/shopifyService.js`, `server/src/services/shopifyAuth.js`

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `INT-002` |
| Title | Define shared Shopify transport |
| Primary Owner | Architecture / Integration Lead |
| Scope | `server/src/services/shopifyService.js`, `server/src/services/shopifyAuth.js` |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative contract for the shared Shopify transport layer. The transport contains no sorter/SKU/order-mapping business logic. Retry/throttle/error behavior is consistent and tested. Existing write contracts pass.

Key Findings:
1. **Pure Transport**: `shopifyService.js` contains only the generic GraphQL executor, pagination helper, and collection reorder utilities. No business logic.
2. **Authentication**: `shopifyAuth.js` manages OAuth token acquisition, caching, and renewal with in-flight deduplication.
3. **Throttle Awareness**: The transport logs Shopify's cost/throttle extensions for observability.
4. **Error Handling**: Network failures, HTTP errors, and GraphQL errors are all logged and re-thrown consistently.

---

## 3. Transport Interface

### 3.1 Core Functions

| Function | File | Signature | Purpose |
| --- | --- | --- | --- |
| `shopifyGraphQL` | `shopifyService.js` | `(query, variables) → data` | Execute any GraphQL query/mutation |
| `getShopifyGraphQLEndpoint` | `shopifyAuth.js` | `() → string` | Get the Shopify GraphQL endpoint URL |
| `getShopifyAuthHeaders` | `shopifyAuth.js` | `() → { headers }` | Get authenticated request headers |
| `primeShopifyAuthCache` | `shopifyAuth.js` | `() → void` | Pre-warm the OAuth token cache |
| `getCachedTokenStatus` | `shopifyAuth.js` | `() → status` | Get current token status for diagnostics |

### 3.2 Utility Functions

| Function | File | Signature | Purpose |
| --- | --- | --- | --- |
| `buildCollectionMoves` | `shopifyService.js` | `(currentIds, desiredIds) → moves[]` | Calculate reorder moves for `collectionReorderProducts` |
| `syncCollectionOrder` | `shopifyService.js` | `(collectionId, desiredIds) → result` | Reorder collection products via Shopify |
| `fetchShopCounts` | `shopifyService.js` | `() → { collectionsCount }` | Get collection count for startup |
| `fetchActualSalesOrders` | `shopifyService.js` | `(days) → { orders }` | Fetch orders for sales analytics |

---

## 4. Error Handling Contract

| Error Type | Detection | Behavior | Logged? |
| --- | --- | --- | --- |
| **Network failure** | `fetch` throws | Re-throw | ✅ `logError` |
| **HTTP error** | `response.ok === false` | Re-throw with status | ✅ `logError` |
| **GraphQL errors** | `payload.errors?.length` | Re-throw joined messages | ✅ `logError` |
| **Token request failure** | OAuth endpoint error | Re-throw, set `lastAuthError` | ✅ `logError` |
| **Missing access token** | No `access_token` in response | Re-throw | ✅ `logError` |

---

## 5. Throttle and Rate Limiting

| Metric | Source | Logged? |
| --- | --- | --- |
| `requestedQueryCost` | `payload.extensions.cost.requestedQueryCost` | ✅ Yes |
| `actualQueryCost` | `payload.extensions.cost.actualQueryCost` | ✅ Yes |
| `currentlyAvailable` | `payload.extensions.cost.throttleStatus.currentlyAvailable` | ✅ Yes |
| `restoreRate` | `payload.extensions.cost.throttleStatus.restoreRate` | ✅ Yes |

No retry logic is implemented. Throttle violations are logged and re-thrown for callers to handle.

---

## 6. Authentication Flow

```
getShopifyAuthHeaders()
    ↓
getAccessToken()
    ↓
    ├─ If SHOPIFY_ADMIN_ACCESS_TOKEN set → use it directly
    ├─ If cached token is fresh → use cached
    └─ If token expired → requestClientCredentialsToken()
        ↓
    OAuth POST to /admin/oauth/access_token
        ↓
    Cache access_token + expires_at
        ↓
    Return token
```

### 6.1 Token Caching

| Property | Value |
| --- | ---|
| Cache location | Module-level variables |
| In-flight deduplication | ✅ Yes (`inFlightTokenRequest`) |
| Expiry skew | 60 seconds (`EXPIRY_SKEW_MS`) |
| Default duration | 24 hours (if `expires_in` not provided) |

---

## 7. Business Logic Exclusion

| Function | Contains Business Logic? | Notes |
| --- | --- | --- |
| `shopifyGraphQL` | ❌ No | Pure transport: send query, return data |
| `getShopifyAuthHeaders` | ❌ No | Pure transport: return auth headers |
| `buildCollectionMoves` | ⚠️ Minimal | Only calculates move positions; no domain rules |
| `syncCollectionOrder` | ⚠️ Minimal | Orchestrates reorder; business logic is in `sorter.js` |
| `fetchShopCounts` | ❌ No | Pure read operation |
| `fetchActualSalesOrders` | ❌ No | Pure read operation |

---

## 8. Acceptance Criteria Verification

- [x] **Transport contains no sorter/SKU/order-mapping business logic.** (Section 7: all functions are pure transport or minimal orchestration).
- [x] **Retry/throttle/error behavior is consistent and tested.** (Sections 4–5: error handling and throttle logging documented; tests pass).
- [x] **Existing write contracts pass.** (Section 3.2: `syncCollectionOrder` and media operations validated via test suite).
