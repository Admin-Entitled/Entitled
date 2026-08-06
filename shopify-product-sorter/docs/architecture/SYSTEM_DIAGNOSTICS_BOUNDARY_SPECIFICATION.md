# System Diagnostics Boundary Specification

**Task:** `OWN-006` — Define System Diagnostics ownership  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All frontend, backend, log viewer, and sensitive-data surfaces for System Diagnostics

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `OWN-006` |
| Application Name | System Diagnostics |
| Canonical Name | `System Diagnostics` (`diagnostics`) |
| Primary Owner | System / Operations Owner |
| Target Frontend Location | `client/src/App.jsx` (diagnostic sidebar panel, `diagnostic-log` / `diagnostic-badge` CSS) |
| Target Backend Location | `server/src/routes/api.js:208-229` (`/api/health`, `/api/collections/logs/*`) |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

System Diagnostics is a **shared observability feature** embedded within the application shell, not a standalone application. It aggregates health checks, action logs, and network logs from the Product Sorter and Order Mapping surfaces and presents them in a unified sidebar panel.

Key Findings:
1. **Shared Feature**: System Diagnostics does not own unique data; it reads logs owned by Product Sorter and Order Mapping.
2. **Display/Contract Owner**: The System / Operations Owner controls the diagnostic sidebar layout and health endpoint contract.
3. **Sensitive Fields**: Environment configuration values (Shopify/Shiprocket secrets) are explicitly marked as **MUST NOT** appear in diagnostic outputs.

---

## 3. Frontend Boundary (`client/src/App.jsx`)

The System Diagnostics panel is embedded within the main application shell sidebar as a **shared observability panel**:

### 3.1 UI Capabilities
- **System Health Badge**: Shows overall system health status (`diagnostic-badge`).
- **Action Logs Viewer**: Displays Product Sorter action logs (`GET /api/collections/logs/actions`).
- **Network Logs Viewer**: Displays Product Sorter network logs (`GET /api/collections/logs/network`).
- **Active Module Diagnostics**: Shows which module is active, loaded rows, selected products, current editing product/SKU, image count, and last API/Shopify actions.
- **Error Display**: Last error message and required scope status for SKU Image Manager.

---

## 4. Backend Route Surface (3 API Endpoints)

| Method | Endpoint Route | Handler Location | Function / Capability |
| --- | --- | --- | --- |
| `GET` | `/api/health` | `server/src/routes/api.js:208` | Returns basic health check `{ ok: true }` |
| `GET` | `/api/collections/logs/actions` | `server/src/routes/api.js:212` | Returns Product Sorter action logs |
| `GET` | `/api/collections/logs/network` | `server/src/routes/api.js:229` | Returns Product Sorter network logs |

Note: Order Mapping also exposes `/api/order-mapping/logs/actions` and `/api/order-mapping/logs/network`, but these are owned by Order Mapping, not System Diagnostics.

---

## 5. Data Ownership Boundaries

### 5.1 Log Data Ownership

| Log Type | Owner | Route |
| --- | --- | --- |
| Product Sorter Action Logs | **Product Sorter** | `/api/collections/logs/actions` |
| Product Sorter Network Logs | **Product Sorter** | `/api/collections/logs/network` |
| Order Mapping Action Logs | **Order Mapping** | `/api/order-mapping/logs/actions` |
| Order Mapping Network Logs | **Order Mapping** | `/api/order-mapping/logs/network` |
| SKU Image Audit Logs | **SKU Image Manager** | `server/data/sku-image-actions.jsonl` |

System Diagnostics **reads** these logs for display but does **not own** or mutate them.

### 5.2 Data Ownership Distinction

| Component | Data Owner | System Diagnostics Role |
| --- | --- | --- |
| Product Sorter logs | Product Sorter Owner | Read-only display |
| Order Mapping logs | Order Mapping Owner | Read-only display |
| Health endpoint | System / Operations Owner | Exclusive ownership |

---

## 6. Sensitive Fields Registry

The following fields are **MUST NOT** appear in diagnostic outputs, logs, or health checks:

| Field Name | Environment Variable | Sensitivity Level | Reason |
| --- | --- | --- | --- |
| `shopifyClientSecret` | `SHOPIFY_CLIENT_SECRET` | **SECRET** | OAuth client secret |
| `shopifyAdminAccessToken` | `SHOPIFY_ADMIN_ACCESS_TOKEN` | **SECRET** | Admin API access token |
| `shiprocketPassword` | `SHIPROCKET_PASSWORD` | **SECRET** | Shiprocket account password |
| `shiprocketToken` | `SHIPROCKET_TOKEN` | **SECRET** | Shiprocket API token |
| `databaseUrl` | `DATABASE_URL` | **SECRET** | Database connection string |
| `directDatabaseUrl` | `DIRECT_DATABASE_URL` | **SECRET** | Direct database connection string |

All diagnostic outputs must redact or exclude these fields.

---

## 7. Acceptance Criteria Verification

- [x] **Diagnostics has one display/contract owner.** (System / Operations Owner owns the diagnostic sidebar layout and health endpoint contract).
- [x] **Sorter and Order Mapping data ownership remains distinct.** (Sorter logs owned by Product Sorter, Order Mapping logs owned by Order Mapping; System Diagnostics reads but does not own).
- [x] **Sensitive fields are marked.** (Documented in Section 6: secrets and credentials must never appear in diagnostic outputs).
