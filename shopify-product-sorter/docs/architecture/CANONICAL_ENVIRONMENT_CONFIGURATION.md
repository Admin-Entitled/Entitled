# Canonical Environment Configuration and Secret Handling

> **Canonical Document**: `DOC-004`  
> **Status**: APPROVED / ACTIVE  
> **Last Updated**: 2026-08-07  

## 1. Environment Matrix

Environment variables are validated at backend startup via `server/src/config/env.js`.

| Variable Name | Owner Domain | Classification | Required? | Default / Validation Rule | Degradation Behaviour |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | System Core | Non-Secret | Required | `development` \| `test` \| `production` | Rejects startup if invalid |
| `PORT` | System Core | Non-Secret | Optional | Port number (default `4000`) | Uses `4000` |
| `SHOPIFY_SHOP_DOMAIN` | Shopify Transport | Non-Secret | Optional | Valid myshopify.com domain | `SHOPIFY_UNAVAILABLE` on Shopify calls |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Shopify Transport | **SECRET** | Optional | Redacted token string | `SHOPIFY_UNAVAILABLE` on Shopify calls |
| `SHOPIFY_API_VERSION` | Shopify Transport | Non-Secret | Optional | Default `2026-04` | Uses `2026-04` |
| `SHIPROCKET_API_KEY` | Shiprocket Transport | **SECRET** | Optional | Redacted key string | Disables Shiprocket sync |
| `SHIPROCKET_API_SECRET` | Shiprocket Transport | **SECRET** | Optional | Redacted secret string | Disables Shiprocket sync |
| `ORDER_MAPPING_DATABASE_URL` | Order Mapping | **SECRET** | Optional | Valid PostgreSQL URL | `ORDER_MAPPING_UNAVAILABLE` on Order Mapping calls |
| `CORS_ORIGIN` | Security Core | Non-Secret | Optional | URL or comma-separated list | Default local client URL |

---

## 2. Capability Isolation and Graceful Degradation

- **Shopify Unconfigured**: The Product Sorter interface remains accessible locally for offline preview calculation and mock dataset operations. Calls requesting live Shopify data gracefully fail with HTTP 503 `SHOPIFY_UNAVAILABLE`.
- **Order Mapping Unconfigured**: The core Product Sorter, SKU Image Manager, and Sales Intelligence modules operate completely unaffected. Order Mapping endpoints return HTTP 503 `ORDER_MAPPING_UNAVAILABLE`.

---

## 3. Secret Isolation & Redaction Rules

1. **Backend-Only Credentials**: Access tokens and database connection strings must never be exposed to the client bundle or returned in API responses.
2. **Log Sanitization**: `server/src/utils/sanitize.js` automatically redacts token values (e.g. matching `shpat_*`, passwords, or authorization headers) from all server console and error logs.
3. **No `.env` Printing**: Automated scripts and tests are strictly prohibited from printing unredacted `.env` contents.
