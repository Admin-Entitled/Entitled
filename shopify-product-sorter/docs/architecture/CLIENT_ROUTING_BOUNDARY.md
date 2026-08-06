# Client Routing Boundary

**Task:** `FE-003` — Introduce explicit routing while preserving URLs  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All client-side routing in `client/src/main.jsx`, `client/src/App.jsx`, and server-side static fallback in `server/src/app.js`

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `FE-003` |
| Title | Introduce explicit routing while preserving URLs |
| Primary Owner | Frontend / Shell Owner |
| Scope | `client/src/main.jsx`, `client/src/App.jsx`, `server/src/app.js` |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative routing boundary. Current URLs resolve to the same features. Unknown/disabled routes fail safely. Server static fallback does not swallow API paths.

Key Findings:
1. **URL-Based Module Selection**: The client uses `window.location.pathname` to determine which module to render (`/order-mapping` → `OrderMapping`, everything else → `App`).
2. **Legacy Redirect**: `/delivery-resolution` redirects to `/order-mapping` via client-side `history.replaceState`.
3. **Server-Side Redirect**: `/delivery-resolution` also redirects to `/order-mapping` via server-side 302.
4. **Static Fallback**: Server serves `index.html` for all non-API routes, allowing client-side routing.

---

## 3. Current Route Map

### 3.1 Client-Side Routes

| URL Pattern | Component | Owner | Notes |
| --- | --- | --- | --- |
| `/` | `App.jsx` (sorter module) | Product Sorter | Default module |
| `/order-mapping` | `OrderMapping.jsx` | Order Mapping | Direct module access |
| `/delivery-resolution` | Client redirect → `/order-mapping` | Legacy | `history.replaceState` in `main.jsx` |
| `/*` (any other path) | `App.jsx` (sorter module) | Product Sorter | Fallback to default module |

### 3.2 Server-Side Routes

| URL Pattern | Handler | Owner | Notes |
| --- | --- | --- | --- |
| `/api/*` | API router | All Applications | All API endpoints |
| `/api/order-mapping/*` | Order Mapping router | Order Mapping | Order Mapping API |
| `/delivery-resolution` | 302 redirect → `/order-mapping` | Legacy | Server-side redirect |
| `/api` (prefix) | Excluded from static fallback | Architecture | API paths never serve `index.html` |
| `/*` (non-API) | Static fallback → `index.html` | Architecture | Client-side routing support |

---

## 4. Routing Safety Rules

| Rule | Implementation | Status |
| --- | --- | --- |
| **API paths never serve `index.html`** | `if (req.path.startsWith("/api")) { next(); }` | ✅ Active |
| **Unknown URLs resolve safely** | `App.jsx` renders sorter module as default | ✅ Active |
| **Disabled routes cannot be accessed** | Sidebar `enabled: false` prevents navigation | ✅ Active |
| **Legacy URLs redirect** | Both client and server redirect `/delivery-resolution` | ✅ Active |

---

## 5. Route Preservation Matrix

| Original URL | Resolved Component | Feature Preserved |
| --- | --- | --- |
| `/` | Product Sorter | Collection management |
| `/order-mapping` | Order Mapping | Order status tracking |
| `/delivery-resolution` | Order Mapping (via redirect) | Legacy bookmark compatibility |
| `/sku-images` | Product Sorter (default) | No direct URL; accessed via sidebar |
| `/sales-intelligence` | Product Sorter (default) | No direct URL; API-only |

---

## 6. Acceptance Criteria Verification

- [x] **Current URLs resolve to the same features.** (Section 5: all current URLs resolve to correct components).
- [x] **Unknown/disabled routes fail safely.** (Section 4: unknown URLs default to sorter module; disabled routes not navigable).
- [x] **Server static fallback does not swallow API paths.** (Section 4: `/api` prefix excluded from static fallback).
