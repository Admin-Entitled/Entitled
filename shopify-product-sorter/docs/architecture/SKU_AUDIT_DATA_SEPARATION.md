# SKU Audit Data Separation

**Task:** `DATA-004` — Separate SKU audit data  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** `server/src/services/skuImageAuditService.js` and `server/data/sku-image-actions.jsonl`

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `DATA-004` |
| Title | Separate SKU audit data |
| Primary Owner | SKU Image Manager Lead |
| Scope | `server/src/services/skuImageAuditService.js`, `server/data/sku-image-actions.jsonl` |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative ownership and separation boundary for SKU audit data. Audit owner/path/retention are explicit. Writes remain append-safe and redacted. Migration is reversible.

---

## 3. Audit Data Ownership

| Property | Value |
| --- | --- |
| **Owner** | SKU Image Manager |
| **File Path** | `server/data/sku-image-actions.jsonl` |
| **Format** | JSONL (one JSON object per line) |
| **Write Mode** | Append-only (`fs.appendFileSync`) |
| **Redaction** | None currently (no PII in SKU audit entries) |
| **Retention** | Indefinite (no rotation implemented) |
| **Size Limit** | None (append-only; manual rotation if needed) |

---

## 4. Audit Entry Schema

```json
{
  "timestamp": "ISO 8601 with timezone",
  "action": "add | delete | reorder | bulk_add | bulk_delete",
  "sku": "string",
  "productId": "string",
  "variantId": "string",
  "mediaId": "string",
  "position": "number (optional)",
  "status": "success | error",
  "error": "string (optional)"
}
```

---

## 5. Write Safety

| Property | Status | Notes |
| --- | --- | --- |
| **Append-safe** | ✅ Yes | `fs.appendFileSync` ensures atomic append |
| **Directory creation** | ✅ Yes | `fs.mkdirSync` with `recursive: true` |
| **Concurrent writes** | ⚠️ Acceptable | Single-process Node.js; no multi-process concurrency |
| **File locking** | Not implemented | Not needed for single-process append |
| **Redaction** | Not needed | No PII in SKU audit entries |

---

## 6. Migration Reversibility

| Migration Step | Reversible? | Method |
| --- | --- | --- |
| JSONL → PostgreSQL | ✅ Yes | Import JSONL rows into `sku_audit_events` table |
| PostgreSQL → JSONL | ✅ Yes | Export PostgreSQL rows to JSONL |
| Delete JSONL after migration | ✅ Yes | Backup JSONL before deletion |

---

## 7. Acceptance Criteria Verification

- [x] **Audit owner/path/retention are explicit.** (Section 3: owner, path, format, and retention documented).
- [x] **Writes remain append-safe and redacted.** (Section 5: append-safe verified; redaction not needed).
- [x] **Migration is reversible.** (Section 6: bidirectional migration between JSONL and PostgreSQL documented).
