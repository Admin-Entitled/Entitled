# Canonical Provider Integration Contracts

> **Canonical Document**: `DOC-006`  
> **Status**: APPROVED / ACTIVE  
> **Last Updated**: 2026-08-07  

## 1. Shopify Transport Integration Contract

- **Primary Module**: `server/src/services/shopifyService.js` / `shopifyAuth.js`
- **Supported API Version**: `2026-04` (GraphQL Admin API).
- **Authentication**: `X-Shopify-Access-Token` header. Credentials managed backend-only.
- **Retry & Throttling Strategy**:
  - Respects Shopify `extensions.cost` throttle status metadata.
  - Implements exponential backoff for HTTP 429 and HTTP 5xx errors (up to 3 retries).
- **Collection Reorder Contract**:
  - Reorders target collections with `sortOrder: MANUAL`.
  - Submits `collectionReorderProducts` GraphQL mutation.
  - Polls async job completion via job ID until state is `SUCCESS` or returns structured user errors.
- **Error Normalization**: Maps raw GraphQL user errors to standard `AppError` payloads while sanitizing token secrets.

---

## 2. Shiprocket Integration Contract

- **Primary Module**: `server/src/services/shiprocketService.js`
- **Authentication**: Email/password payload exchanged for JWT bearer token cached in memory.
- **Status Mapping**: `server/src/services/orderMappingStatus.js` maps raw Shiprocket statuses (`NEW`, `PICKUP SCHEDULED`, `DELIVERED`, `CANCELED`) to normalized internal statuses.
- **Terminal Protection**: Once an order reaches a terminal state (`DELIVERED` or `CANCELED`), status transitions are locked to preserve audit history.
