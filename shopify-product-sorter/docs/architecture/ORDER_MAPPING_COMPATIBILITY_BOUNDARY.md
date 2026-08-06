# Order Mapping Compatibility Boundary

**Task:** `FE-006` — Retain Order Mapping compatibility boundary  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** `client/src/OrderMapping.jsx`, `client/src/orderMappingApi.js`, `client/src/main.jsx`, and server-side redirect

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `FE-006` |
| Title | Retain Order Mapping compatibility boundary |
| Primary Owner | Frontend / Order Mapping Lead |
| Scope | `client/src/OrderMapping.jsx`, `client/src/orderMappingApi.js`, `client/src/main.jsx` |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative compatibility boundary for Order Mapping. `/order-mapping` remains reachable directly and through refresh. Its API client/state do not depend on sorter state. Redirect compatibility remains.

Key Findings:
1. **Standalone Entry Point**: Order Mapping can be accessed directly via `/order-mapping` URL without loading the full application shell.
2. **Independent API Client**: Uses its own `orderMappingApi.js` client that does not share state with the Product Sorter API client.
3. **Redirect Compatibility**: `/delivery-resolution` redirects to `/order-mapping` via both client-side and server-side redirects.
4. **Shell Integration**: When accessed via the shell, Order Mapping receives only a minimal `sidebarBridge` for diagnostics.

---

## 3. Route Access Matrix

| URL | Entry Point | Component | State Dependency |
| --- | --- | --- | --- |
| `/order-mapping` | Direct (standalone) | `OrderMapping.jsx` | None (self-contained) |
| `/order-mapping` | Via shell (App.jsx) | `OrderMapping.jsx` | `sidebarBridge` only |
| `/delivery-resolution` | Client redirect → `/order-mapping` | `OrderMapping.jsx` | None (after redirect) |
| `/delivery-resolution` | Server 302 → `/order-mapping` | `OrderMapping.jsx` | None (after redirect) |

---

## 4. API Client Isolation

| Client | File | Base URL | Dependencies |
| --- | --- | --- | --- |
| **Product Sorter API** | `api.js` | `/api` | None |
| **Order Mapping API** | `orderMappingApi.js` | `/api/order-mapping` | None |

The Order Mapping API client is completely independent. It does not import or depend on the Product Sorter API client or any sorter state.

---

## 5. State Isolation

| State Source | Owner | Order Mapping Access |
| --- | --- | --- |
| Sorter collections | Product Sorter | ❌ No access |
| Sorter strategy | Product Sorter | ❌ No access |
| Sorter products | Product Sorter | ❌ No access |
| SKU image state | SKU Image Manager | ❌ No access |
| Order Mapping orders | Order Mapping | ✅ Own state |
| Order Mapping filters | Order Mapping | ✅ Own state |
| Order Mapping pagination | Order Mapping | ✅ Own state |

---

## 6. Shell Bridge (Minimal)

| Prop | Type | Purpose | Required? |
| --- | --- | --- | --- |
| `sidebarBridge` | Object | Diagnostics integration | Optional (standalone mode works without it) |
| `sidebarBridge.updateDiagnostics` | Function | Updates shell diagnostics | Optional |
| `sidebarBridge.pushLog` | Function | Pushes log entries | Optional |

When accessed directly via `/order-mapping`, Order Mapping operates independently without any shell bridge. The bridge is only used when rendered within the shell.

---

## 7. Acceptance Criteria Verification

- [x] **`/order-mapping` remains reachable directly and through refresh.** (Section 3: direct URL access and refresh preserved).
- [x] **Its API client/state do not depend on sorter state.** (Sections 4–5: completely independent API client and state).
- [x] **Redirect compatibility remains.** (Section 3: both client and server redirects preserved).
