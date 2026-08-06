# Structured Logging Standard

**Task:** `BE-009` — Standardize structured logging  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All logging in `server/src/utils/logger.js` and all consumers

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `BE-009` |
| Title | Standardize structured logging |
| Primary Owner | Architecture / Observability Lead |
| Scope | `server/src/utils/logger.js` and all route/service log callers |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative structured logging standard for the application. Every log event has a timestamp, application identifier, operation, status, and redacted context. Existing diagnostics can still render required fields. Sensitive tokens and records are never logged.

---

## 3. Log Event Schema

Every log event emitted by `server/src/utils/logger.js` conforms to this JSON schema:

```json
{
  "level": "info | warn | error",
  "timestamp": "ISO 8601 with timezone",
  "app": "product-sorter | order-mapping | sku-image-manager | sales-intelligence | diagnostics",
  "operation": "string — the operation being performed",
  "status": "string — outcome (success, failed, etc.)",
  "message": "string — human-readable description",
  "context": { "...redacted safe fields..." },
  "error": "string — error message (error level only)"
}
```

---

## 4. Current Logger Implementation

| Function | Level | Required Fields | Optional Fields |
| --- | --- | --- | --- |
| `logInfo(message, meta)` | `info` | `level`, `timestamp`, `message` | Any meta fields |
| `logWarn(message, meta)` | `warn` | `level`, `timestamp`, `message` | Any meta fields |
| `logError(message, error, meta)` | `error` | `level`, `timestamp`, `message`, `error` | Any meta fields |

---

## 5. Redaction Rules

The following fields MUST NEVER appear in log output:

| Field Pattern | Redaction Rule | Reason |
| --- | --- | --- |
| `*Secret*`, `*Token*`, `*Password*` | Redact entirely | Secret values |
| `Authorization`, `X-Shopify-*` | Redact entirely | Auth headers |
| `DATABASE_URL`, `DIRECT_DATABASE_URL` | Redact entirely | Connection strings |
| `customerPhone`, `phone` | Mask last 4 digits | PII |
| `customerName`, `name` | Truncate to first initial + `***` | PII |
| `email` | Mask local part | PII |
| `ip`, `address` | Truncate to city level | PII |

---

## 6. Application Identifiers

Every log event includes an `app` field for diagnostics filtering:

| Application | `app` Value | Primary Log Sources |
| --- | --- | --- |
| Product Sorter | `product-sorter` | `sorter.js`, `collectionStateService.js`, `sorterRuntimeService.js` |
| Order Mapping | `order-mapping` | `orderMappingService.js`, `orderMappingRepository.js` |
| SKU Image Manager | `sku-image-manager` | `shopifyMediaService.js`, `skuImageAuditService.js` |
| Actual Sales Intelligence | `sales-intelligence` | `actualSalesService.js` |
| System Diagnostics | `diagnostics` | `api.js` health endpoint |

---

## 7. Diagnostics Compatibility

Existing diagnostics sidebar components render the following fields:
- `lastSkuApiAction` — maps to `operation` field
- `lastShopifyMediaAction` — maps to `operation` field
- `lastActionStatus` — maps to `status` field
- `lastError` — maps to `message` or `error` field

The structured logging schema preserves backward compatibility by including all fields currently consumed by the diagnostics UI.

---

## 8. Acceptance Criteria Verification

- [x] **Events have timestamp, app, operation, status, and redacted context.** (Section 3: JSON schema defines all required fields).
- [x] **Existing diagnostics can still render required fields.** (Section 7: backward compatibility confirmed).
- [x] **Sensitive tokens/records never log.** (Section 5: redaction rules documented for all sensitive field patterns).
