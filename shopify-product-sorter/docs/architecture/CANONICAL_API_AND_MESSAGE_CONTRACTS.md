# Canonical API and Message Contracts

> **Canonical Document**: `DOC-003`  
> **Status**: APPROVED / ACTIVE  
> **Last Updated**: 2026-08-07  

## 1. API Architecture & Routing Overview

All API endpoints reside under the `/api` prefix and enforce JSON request/response formats.

| Prefix | Domain | Classification | Router File |
| --- | --- | --- | --- |
| `/api/health` | System Health | READ-ONLY | `server/src/routes/health.js` |
| `/api/sorter/*` | Product Sorter | READ / WRITE | `server/src/routes/sorter.js` |
| `/api/sku-media/*` | SKU Image Manager | READ / WRITE | `server/src/routes/skuMedia.js` |
| `/api/sales-intelligence/*` | Sales Intelligence | READ / WRITE | `server/src/routes/salesIntelligence.js` |
| `/api/order-mapping/*` | Order Mapping | READ / WRITE | `server/src/routes/orderMapping.js` |

---

## 2. Stable Application Error Codes

All API errors return standard JSON responses with HTTP status codes and structured error objects:
```json
{
  "error": {
    "code": "STABLE_ERROR_CODE",
    "message": "Human readable description",
    "details": {}
  }
}
```

### 2.1 Core Error Codes
- **`SHOPIFY_UNAVAILABLE`** (503): Returned when Shopify credentials/APIs are unconfigured, throttled, or unreachable.
- **`ORDER_MAPPING_UNAVAILABLE`** (503): Returned when Order Mapping PostgreSQL database is unconfigured or unreachable.
- **`GENERATED_ORDER_STALE`** (409): Returned when trying to apply an order calculation whose underlying collection snapshot has changed.
- **`INVALID_ORDER_IDS`** (400): Returned when supplied product order IDs do not match the target collection's product set.
- **`DUPLICATE_ORDER_IDS`** (400): Returned when placement payload contains duplicate product IDs.
- **`COLLECTION_SNAPSHOT_NOT_FOUND`** (404): Returned when attempting to generate or apply placements without syncing collection state first.
- **`BACKUP_NOT_FOUND`** (404): Returned when attempting to rollback a collection without an existing backup.
- **`VALIDATION_ERROR`** (400): Request payload validation failed against required schema.
- **`MISSING_FILE`** (400): Required file upload missing from request.

---

## 3. Endpoints Matrix

### 3.1 Health Routes (`/api/health`)
- `GET /api/health` -> System status summary
- `GET /api/health/shopify` -> Shopify transport status check
- `GET /api/health/order-mapping` -> Order Mapping DB status check

### 3.2 Product Sorter Routes (`/api/sorter`)
- `GET /api/sorter/collections` -> List available Shopify collections
- `POST /api/sorter/collections/:id/sync` -> Sync collection state from Shopify
- `POST /api/sorter/collections/:id/generate-order` -> Generate placement recommendation
- `POST /api/sorter/collections/:id/apply-order` -> Apply generated placement to Shopify
- `POST /api/sorter/collections/:id/rollback` -> Rollback collection to previous backup
- `GET /api/sorter/collections/:id/preview` -> Calculate placement diff preview

### 3.3 SKU Media Routes (`/api/sku-media`)
- `GET /api/sku-media/products` -> Fetch product image lists
- `POST /api/sku-media/upload` -> Upload new image for SKU
- `POST /api/sku-media/reorder` -> Update image order for product
- `POST /api/sku-media/bulk-add` -> Add images across multiple SKUs

### 3.4 Sales Intelligence Routes (`/api/sales-intelligence`)
- `GET /api/sales-intelligence/metrics` -> Fetch sales performance data
- `POST /api/sales-intelligence/import-csv` -> Import sales performance CSV
- `POST /api/sales-intelligence/override` -> Manually override SKU sales metrics

### 3.5 Order Mapping Routes (`/api/order-mapping`)
- `GET /api/order-mapping/orders` -> Query order mappings
- `POST /api/order-mapping/sync` -> Trigger Shiprocket sync
