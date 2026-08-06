# Shared Shopify Transport Contract

**Task ID**: INT-002  
**Owners**: `server/src/services/shopifyAuth.js`, `server/src/services/shopifyService.js`  
**Current Branch Ancestry**: `ops/architecture-ledger-hardening`  
**Evidence Model**: Branch-Native Evidence  

---

## 1. Overview & Architecture Scope

This document specifies the shared Shopify transport contract for the application server. The Shopify transport is responsible for communicating with Shopify's GraphQL Admin API and OAuth access token endpoint while maintaining zero coupling to business domains.

### Explicit Architectural Boundaries:
- **Transport Scope**: Pure HTTP/GraphQL communication, access token lifecycle, header construction, HTTP rate-limiting (429 / retry-after parsing), and status code normalization.
- **Prohibited Responsibilities**:
  - No Sorter business logic (collection ranking, score calculation, strategy evaluation).
  - No SKU Image Manager logic (media array manipulation, variant matching).
  - No Order Mapping business logic (shipment status mapping, customer address resolution).
  - No direct mutation of application database tables.

---

## 2. Component Modules & Caller Register

| Module | Role | Key Exported Functions | Writes |
| --- | --- | --- | --- |
| `server/src/services/shopifyAuth.js` | Auth & Token Lifecycle Owner | `getAccessToken`, `getShopifyAuthHeaders`, `resetShopifyAuthCache`, `getCachedTokenStatus` | No |
| `server/src/services/shopifyService.js` | GraphQL Transport & Collection Service | `shopifyGraphQL`, `fetchCollections`, `fetchCollectionProducts`, `fetchShopCounts`, `syncCollectionOrder`, `buildCollectionMoves` | Yes (`syncCollectionOrder`) |
| `server/src/services/shopifyMediaService.js` | SKU Media Service Caller | `searchSkuImageProducts`, `addImageToSkuProduct`, `deleteImageFromSkuProduct`, `reorderSkuProductImages` | Yes |
| `server/src/services/orderMappingShopify.js` | Order Mapping Shopify Reader | `fetchOrderMappingOrders` | No |

---

## 3. Supported Transport Contract

### Auth & Token Lifecycle:
1. **Static Admin Access Token**: If `SHOPIFY_ADMIN_ACCESS_TOKEN` is configured, it is used immediately without performing OAuth token exchanges.
2. **OAuth Access Token Exchange**: If `SHOPIFY_ADMIN_ACCESS_TOKEN` is unconfigured, `shopifyAuth.js` exchanges `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` at `/admin/oauth/access_token`. Tokens are cached until expiry with a 60-second safety buffer.
3. **Header Construction**: All GraphQL requests attach header `X-Shopify-Access-Token` and `Content-Type: application/json`.

### Redaction & Secret Safety:
- Access tokens, client secrets, and authorization headers are never printed to console logs or written to disk.
- Errors thrown by `shopifyGraphQL` or `getAccessToken` sanitize request options and headers before raising exceptions.

### Rate Limiting & Retry Behavior:
- Bounded retry loop (maximum 3 attempts) for network timeouts and HTTP 429 Rate Limit responses.
- Respects `Retry-After` HTTP header or cost extensions in GraphQL responses (`extensions.cost.throttleStatus`).

### Error Normalization:
- HTTP non-2xx responses throw normalized `Shopify API HTTP <status>` errors.
- GraphQL `errors` arrays trigger thrown errors containing error messages.

---

## 4. Prohibited Ownership & Anti-Patterns

1. **No Hardcoded Tokens**: Never embed `shpat_` tokens or client secrets in source files or tests. Synthetic fixtures must use mock strings (`mock-token`, `shpat_static_admin_token_test`).
2. **No Business Domain Leakage**: Transport functions must accept generic GraphQL queries and variables rather than hardcoding product sorting formulas.
3. **No Dynamic Scopes**: Required OAuth scopes (`read_products`, `write_products`, `read_orders`) are declared explicitly in code and checked before executing write operations (`syncCollectionOrder`).

---

## 5. Environment Configuration

| Variable | Classification | Requirement | Description |
| --- | --- | --- | --- |
| `SHOPIFY_STORE_DOMAIN` | Non-Secret | Required in Prod | Myshopify domain (e.g. `mock-store.myshopify.com`) |
| `SHOPIFY_CLIENT_ID` | Non-Secret | Required for OAuth | Client ID for OAuth access token request |
| `SHOPIFY_CLIENT_SECRET` | **Secret** | Required for OAuth | Client Secret for OAuth token exchange |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | **Secret** | Optional | Static custom app admin access token |
| `SHOPIFY_API_VERSION` | Non-Secret | Optional | API version string (default `2026-04`) |

---

## 6. Permanent Validation & Verification Commands

Validation is provided by synthetic unit and contract tests running offline without live network access:

```bash
# Focused integration transport test
node --test tests/integrationContracts.test.js

# Comprehensive provider test suite
node --test server/src/services/providerIntegration.test.js tests/providerInventory.test.js
```

---

## 7. Legacy & Candidate Path Disposition

- `server/src/services/shopifyAuth.js`: `CURRENT_OWNER` (Auth & token handling)
- `server/src/services/shopifyService.js`: `CURRENT_OWNER` (GraphQL client & collection service)
- `server/src/services/shopifyMediaService.js`: `CURRENT_OWNER` (SKU image GraphQL mutations)
- `server/src/services/orderMappingShopify.js`: `CURRENT_OWNER` (Order mapping GraphQL reader)

---

## 8. Branch-Native Implementation Evidence

This contract document and its associated test suite (`tests/integrationContracts.test.js`) establish durable current-branch implementation provenance on `ops/architecture-ledger-hardening`.
