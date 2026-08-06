# Integration Environment Variable Ownership Matrix

**Task ID**: INT-006  
**Owner Module**: `server/src/config/env.js`  
**Current Branch Ancestry**: `ops/architecture-ledger-hardening`  
**Evidence Model**: Branch-Native Evidence  

---

## 1. Overview & Single Ownership Rule

This document defines the authoritative environment variable ownership matrix for all Shopify, Shiprocket, Postgres, and application runtime variables.

### Key Rules:
1. **Single Owner Principle**: Every environment variable must have exactly one declared code owner module (`server/src/config/env.js`).
2. **Frontend Isolation**: No secret provider variable (`SHOPIFY_CLIENT_SECRET`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_TOKEN`, `DATABASE_URL`) may be exported to client/frontend code.
3. **Graceful Capability Degradation**: Absence of optional provider credentials (e.g. missing Shiprocket credentials) disables only that specific capability (e.g. `shiprocketEnabled = false`) without crashing unrelated application startup.

---

## 2. Environment Variable Register

| Variable Name | Owner Module | Classification | Required / Optional | Capability Impact |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | `server/src/config/env.js` | Non-Secret | Optional (default `development`) | Sets runtime mode (`development`, `production`, `test`) |
| `PORT` | `server/src/config/env.js` | Non-Secret | Optional (default `4000`) | Server HTTP listening port |
| `CLIENT_ORIGIN` | `server/src/config/env.js` | Non-Secret | Required in Prod | CORS allowed origin for frontend |
| `DATABASE_URL` | `server/src/config/env.js` | **Secret** | Optional (Req for Postgres) | Neon Postgres connection string |
| `DIRECT_DATABASE_URL` | `server/src/config/env.js` | **Secret** | Optional | Unpooled Neon Postgres connection string |
| `ORDER_MAPPING_SCHEMA` | `server/src/config/env.js` | Non-Secret | Optional (default `order_mapping`) | Postgres schema name for Order Mapping |
| `SHOPIFY_STORE_DOMAIN` | `server/src/config/env.js` | Non-Secret | Required in Prod for Shopify | Shopify store domain |
| `SHOPIFY_CLIENT_ID` | `server/src/config/env.js` | Non-Secret | Required for Shopify OAuth | Shopify OAuth Client ID |
| `SHOPIFY_CLIENT_SECRET` | `server/src/config/env.js` | **Secret** | Required for Shopify OAuth | Shopify OAuth Client Secret |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | `server/src/config/env.js` | **Secret** | Optional | Static Shopify custom app access token |
| `SHOPIFY_API_VERSION` | `server/src/config/env.js` | Non-Secret | Optional (default `2026-04`) | Shopify Admin API version |
| `SHOPIFY_ANALYTICS_DAYS` | `server/src/config/env.js` | Non-Secret | Optional (default `365`) | Lookback window in days for sales analytics |
| `SHIPROCKET_EMAIL` | `server/src/config/env.js` | Non-Secret | Required for Shiprocket auth | Shiprocket account login email |
| `SHIPROCKET_PASSWORD` | `server/src/config/env.js` | **Secret** | Required for Shiprocket auth | Shiprocket account login password |
| `SHIPROCKET_TOKEN` | `server/src/config/env.js` | **Secret** | Optional | Pre-generated Shiprocket bearer token |
| `SHIPROCKET_BASE_URL` | `server/src/config/env.js` | Non-Secret | Optional | Shiprocket API base URL |
| `SHIPROCKET_CHANNEL_ID` | `server/src/config/env.js` | Non-Secret | Optional | Shiprocket sales channel ID |
| `ADMIN_SECRET` | `server/src/config/env.js` | **Secret** | Optional | Administrative API authorization header secret |
| `API_SECRET` | `server/src/config/env.js` | **Secret** | Optional | Public API authorization secret |

---

## 3. Failure Behavior & Graceful Degradation

- **Missing `SHOPIFY_ADMIN_ACCESS_TOKEN`**: Fall back to OAuth flow using `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`.
- **Missing `SHIPROCKET_EMAIL`/`SHIPROCKET_PASSWORD` and `SHIPROCKET_TOKEN`**: `env.shiprocketEnabled` evaluates to `false`. Order Mapping and Sales API return `{ configured: false, shipments: [] }` without throwing unhandled exceptions or preventing server startup.
- **Missing `DATABASE_URL`**: Postgres Order Mapping features disabled; fallback SQLite store used where configured.

---

## 4. Permanent Validation & Verification Commands

Validation is provided by synthetic unit and contract tests running offline without live network access:

```bash
# Focused integration contract test
node --test tests/integrationContracts.test.js

# Provider environment validation tests
node --test server/src/services/providerIntegration.test.js
```

---

## 5. Branch-Native Implementation Evidence

This contract document and its associated test suite (`tests/integrationContracts.test.js`) establish durable current-branch implementation provenance on `ops/architecture-ledger-hardening`.
