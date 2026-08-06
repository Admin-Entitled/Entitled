# SKU Image Manager Extraction Boundary

**Task:** `FE-005` — Extract the SKU Image Manager feature  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** `client/src/SkuImageManager.jsx` and its integration with `client/src/App.jsx`

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `FE-005` |
| Title | Extract the SKU Image Manager feature |
| Primary Owner | Frontend / SKU Image Manager Lead |
| Scope | `client/src/SkuImageManager.jsx` (50.2KB), `client/src/App.jsx` (integration) |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative extraction boundary for the SKU Image Manager feature. The SKU feature does not import sorter or Order Mapping state. All actions retain loading/error/audit behavior. The shell bridge is minimal and documented.

Key Findings:
1. **Self-Contained Module**: `SkuImageManager.jsx` is already a separate component (50.2KB) with its own API calls and state management.
2. **Minimal Shell Bridge**: Only two functions are passed from the shell: `updateDiagnostics` and `pushLog`.
3. **No Cross-Module State**: SkuImageManager does not import or use any sorter or Order Mapping state.
4. **Own API Client**: Uses `api.js` directly for all SKU image operations.

---

## 3. Module Dependency Analysis

### 3.1 SkuImageManager Imports

| Import | Source | Type | Cross-Module? |
| --- | --- | --- | --- |
| `useEffect`, `useMemo`, `useState` | `react` | React hooks | No |
| `api` | `./api.js` | API client | No (shared utility) |

### 3.2 Shell Bridge (Props from App.jsx)

| Prop | Type | Purpose | Minimal? |
| --- | --- | --- | --- |
| `sidebarBridge.updateDiagnostics` | Function | Updates shell diagnostics panel | ✅ Yes |
| `sidebarBridge.pushLog` | Function | Pushes log entries to shell | ✅ Yes |

### 3.3 State Ownership

| State Variable | Owner | Notes |
| --- | --- | --- |
| `skuProducts` | SkuImageManager | Search results |
| `editingGroup` | SkuImageManager | Currently selected product |
| `addForm` | SkuImageManager | Image add form state |
| `bulkAddForm` | SkuImageManager | Bulk add form state |
| `actionRunning` | SkuImageManager | Loading indicator |
| `lastError` | SkuImageManager | Error state |
| `notifications` | SkuImageManager | Toast notifications |

---

## 4. API Endpoints Used

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/sku-images/search` | GET | Search SKU products |
| `/api/sku-images/load-all` | POST | Load all SKU products |
| `/api/sku-images/add-upload` | POST | Upload image file |
| `/api/sku-images/add-url` | POST | Add image via URL |
| `/api/sku-images/delete` | POST | Delete image |
| `/api/sku-images/reorder` | POST | Reorder images |
| `/api/sku-images/bulk-add-upload` | POST | Bulk upload images |
| `/api/sku-images/bulk-add` | POST | Bulk add via URL |
| `/api/sku-images/bulk-delete-preview` | POST | Preview bulk delete |
| `/api/sku-images/bulk-delete-confirm` | POST | Confirm bulk delete |

---

## 5. Extraction Compliance

| Acceptance Criterion | Status | Evidence |
| --- | --- | --- |
| SKU feature does not import sorter or Order Mapping state | ✅ Pass | Section 3.1: only imports `react` and `api.js` |
| All actions retain loading/error/audit behavior | ✅ Pass | Section 3.3: `actionRunning`, `lastError`, `notifications` state owned by module |
| Shell bridge is minimal and documented | ✅ Pass | Section 3.2: only 2 functions passed via `sidebarBridge` |

---

## 6. Acceptance Criteria Verification

- [x] **SKU feature does not import sorter or Order Mapping state.** (Section 3.1: no cross-module imports).
- [x] **All actions retain loading/error/audit behavior.** (Section 3.3: loading, error, and notification state owned by module).
- [x] **Shell bridge is minimal and documented.** (Section 3.2: only `updateDiagnostics` and `pushLog` passed).
