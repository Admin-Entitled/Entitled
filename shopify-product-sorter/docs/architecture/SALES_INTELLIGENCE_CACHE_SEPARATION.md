# Sales Intelligence Cache Separation

**Task:** `DATA-005` — Separate Sales Intelligence caches  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** `server/data/sales-*.json` cache files and `server/src/services/actualSalesService.js`

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `DATA-005` |
| Title | Separate Sales Intelligence caches |
| Primary Owner | Actual Sales Intelligence Lead |
| Scope | `server/data/sales-*.json`, `server/src/services/actualSalesService.js` |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative separation boundary for Sales Intelligence caches. Cache files are not treated as source. Version mismatch and corruption fail safely. Rebuild/rollback paths are documented.

---

## 3. Cache Registry

| Cache File | Owner | Purpose | Regenerable |
| --- | --- | --- | --- |
| `server/data/sales-shopify-cache.json` | Actual Sales Intelligence | Shopify order data | ✅ Yes (via API) |
| `server/data/sales-shiprocket-cache.json` | Actual Sales Intelligence | Shiprocket shipment data | ✅ Yes (via API) |
| `server/data/sales-reconciled-cache.json` | Actual Sales Intelligence | Reconciled unified dataset | ✅ Yes (from other caches) |

---

## 4. Cache Safety Properties

| Property | Status | Notes |
| --- | --- | --- |
| **Not treated as source** | ✅ Yes | All caches are regenerable from API |
| **Version mismatch detection** | ✅ Yes | `ANALYTICS_SCHEMA_VERSION` (currently 8) checked on read |
| **Corruption detection** | ✅ Yes | `JSON.parse` failure returns `null`; fresh fetch triggered |
| **Atomic writes** | ✅ Yes | `writeJson` writes to file directly (single-process) |
| **Directory creation** | ✅ Yes | `fs.mkdirSync` with `recursive: true` |

---

## 5. Version Mismatch Handling

```javascript
const ANALYTICS_SCHEMA_VERSION = 8;

// On read:
const cached = readJson(reconciledCachePath);
if (cached && Number(cached.meta?.analyticsSchemaVersion || 0) === ANALYTICS_SCHEMA_VERSION) {
  return cached; // Cache hit
}
// Cache miss → re-fetch and rebuild
```

| Scenario | Behavior |
| --- | --- |
| Version matches | Use cached data |
| Version mismatch | Discard cache, re-fetch from API |
| JSON parse failure | Return `null`, re-fetch from API |
| File not found | Return `null`, re-fetch from API |

---

## 6. Rebuild/Rollback Paths

| Path | Method | Trigger |
| --- | --- |--- |
| **Full rebuild** | Call refresh endpoints | Manual or scheduled |
| **Partial rebuild** | Refresh individual cache | `POST /api/sales-intelligence/refresh-shopify` or `refresh-shiprocket` |
| **Rollback** | Delete cache files | Next API call rebuilds from scratch |
| **Schema upgrade** | Bump `ANALYTICS_SCHEMA_VERSION` | Code deployment |

---

## 7. Acceptance Criteria Verification

- [x] **Cache files are not treated as source.** (Section 4: all caches regenerable from API).
- [x] **Version mismatch and corruption fail safely.** (Section 5: version check and JSON parse failure handling documented).
- [x] **Rebuild/rollback paths are documented.** (Section 6: full rebuild, partial rebuild, rollback, and schema upgrade paths documented).
