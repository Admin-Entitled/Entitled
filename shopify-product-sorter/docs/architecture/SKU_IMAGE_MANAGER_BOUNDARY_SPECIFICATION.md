# SKU Image Manager Boundary Specification

**Task:** `OWN-004` — Define SKU Image Manager boundary  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All frontend, backend, service, audit, and Shopify integration surfaces for SKU Image Manager

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `OWN-004` |
| Application Name | SKU Image Manager |
| Canonical Name | `SKU Image Manager` (`sku-image-manager`) |
| Primary Owner | SKU Image Manager Lead |
| Target Frontend Location | `client/src/apps/sku-image-manager` (currently `client/src/SkuImageManager.jsx`) |
| Target Backend Location | `server/src/apps/sku-image-manager` (currently `server/src/services/shopifyMediaService.js`, `server/src/services/skuImageAuditService.js`, `server/src/routes/api.js:1103-1260`) |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document establishes the single, authoritative ownership boundary for the **SKU Image Manager** application module. It defines the exact frontend UI components, backend route handlers, service modules, audit stores, Shopify GraphQL transport dependencies, and scope/upload error handling ownership.

---

## 3. Frontend Boundary (`client/src/SkuImageManager.jsx`)

The SKU Image Manager frontend is mounted in `client/src/App.jsx` as sidebar module `sku-image-manager` (`enabled: true`) and comprises the following UI capabilities:

### 3.1 UI Views & Subcomponents
- **SKU Search & Filter Controls**:
  - Single/multiple SKU text input search (`GET /api/sku-images/search`)
  - Load all SKU products button (`POST /api/sku-images/load-all`)
- **Variant Image Gallery**:
  - Displays product thumbnail, title, SKU, variant ID, and existing image list
  - Primary image indicator and position index badges
- **Image Addition Modal / Form**:
  - Add via image URL (`POST /api/sku-images/add-url`)
  - Add via direct file upload (`POST /api/sku-images/add-upload`)
  - Position selection (`first`, `last`, or explicit position number)
- **Image Deletion & Reordering Controls**:
  - Single image deletion (`POST /api/sku-images/delete`)
  - Image position reordering (`POST /api/sku-images/reorder`)
- **Bulk Operations Panel**:
  - Bulk image addition via URL or file upload (`POST /api/sku-images/bulk-add`, `POST /api/sku-images/bulk-add-upload`)
  - Bulk deletion preview (`POST /api/sku-images/bulk-delete-preview`)
  - Bulk deletion confirmation (`POST /api/sku-images/bulk-delete-confirm`)
- **Diagnostics & Status Bar**:
  - Tracks active SKU, loaded rows, selected products, current image count, last API action, last Shopify media action, action running indicator, and required OAuth scope status (`write_products`, `read_products`).

---

## 4. Backend Route Surface (11 API Endpoints)

All SKU Image Manager backend routes are mounted under `/api/sku-images/*` in `server/src/routes/api.js`:

| Method | Endpoint Route | Handler Location | Function / Capability |
| --- | --- | --- | --- |
| `GET` | `/api/sku-images/search` | `server/src/routes/api.js:1103` | Search variants & media by SKU list |
| `POST` | `/api/sku-images/load-all` | `server/src/routes/api.js:1114` | Load all variants & media catalog |
| `POST` | `/api/sku-images/add` | `server/src/routes/api.js:1124` | Add image payload to product variant |
| `POST` | `/api/sku-images/add-upload` | `server/src/routes/api.js:1134` | Handle multipart file upload & add image |
| `POST` | `/api/sku-images/add-url` | `server/src/routes/api.js:1152` | Add image to variant via image URL |
| `POST` | `/api/sku-images/delete` | `server/src/routes/api.js:1171` | Delete media from product & variant |
| `POST` | `/api/sku-images/reorder` | `server/src/routes/api.js:1181` | Reorder media position on product |
| `POST` | `/api/sku-images/bulk-add` | `server/src/routes/api.js:1191` | Bulk add images across multiple SKUs |
| `POST` | `/api/sku-images/bulk-add-upload` | `server/src/routes/api.js:1201` | Bulk add file upload across SKUs |
| `POST` | `/api/sku-images/bulk-delete-preview` | `server/src/routes/api.js:1239` | Preview bulk deletion impact |
| `POST` | `/api/sku-images/bulk-delete-confirm` | `server/src/routes/api.js:1249` | Execute bulk deletion confirm |

---

## 5. Backend Service & Data Ownership

### 5.1 Service Modules

| Service Name | File Location | Single Owner Responsibilities |
| --- | --- | --- |
| **Shopify Media Service** | `server/src/services/shopifyMediaService.js` | SKU variant GraphQL querying, Shopify staging upload creation (`stagedUploadsCreate`), product media creation (`productCreateMedia`), variant media assignment (`productVariantUpdate`), media deletion (`productDeleteMedia`), media reordering (`productReorderMedia`), bulk image operations, and error handling. |
| **SKU Image Audit Service** | `server/src/services/skuImageAuditService.js` | Audit trail logging (`appendSkuImageAuditLog`) to JSONL storage, ensuring non-repudiation of image additions, deletions, and reorders. |

### 5.2 Storage Artifacts
1. **Action Audit Log**: `server/data/sku-image-actions.jsonl` (Exclusive ownership by `skuImageAuditService.js`).
2. **Temporary File Uploads**: `os.tmpdir()` (`/tmp/` directory managed via Multer in `server/src/routes/api.js`).

---

## 6. Shopify Transport Dependencies & Failure Ownership

### 6.1 Transport Layer & OAuth Scopes
- **Transport Dependency**: `server/src/services/shopifyService.js` (`shopifyGraphQL`, `getShopifyCredentials`).
- **Required OAuth Scopes**:
  - `read_products`: Variant search & media listing.
  - `write_products`: Media creation, staging upload, deletion, reordering, and variant updates.

### 6.2 Error & Failure Handling Ownership

| Failure Mode | Responsible Module | Handling Strategy |
| --- | --- | --- |
| **Missing OAuth Scope** | `shopifyMediaService.js` | Detects `ACCESS_DENIED` or scope error from Shopify GraphQL, logs audit warning via `appendSkuImageAuditLog`, returns structured error to UI diagnostics. |
| **Upload Staging Failure** | `shopifyMediaService.js` | Handles `stagedUploadsCreate` failures, validates MIME types & file size limits, cleans up temporary local files. |
| **Variant Match Failure** | `shopifyMediaService.js` | Returns clean empty search results or `SKU_NOT_FOUND` message without throwing unhandled exceptions. |
| **Audit Log Write Failure** | `skuImageAuditService.js` | Logs exception to console while preserving primary operation result when non-critical. |

---

## 7. Acceptance Criteria Verification

- [x] **SKU routes and audit files have one owner.** (Single ownership assigned to SKU Image Manager Lead; routes in `/api/sku-images/*`, audit file at `server/data/sku-image-actions.jsonl`).
- [x] **Shopify transport dependencies are explicit.** (`shopifyService.js` GraphQL client via `read_products` & `write_products`).
- [x] **Scope failures and uploads have documented owners.** (`shopifyMediaService.js` owns staging upload & scope failure handling; `skuImageAuditService.js` owns action audit logging).
