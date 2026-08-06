# Shiprocket Client Inventory

**Task:** INT-004  
**Status:** Completed  
**Last updated:** 2026-08-06  
**Validation:** Static search · Synthetic fixtures · `tests/providerInventory.test.js`

---

## Scope

This document inventories every Shiprocket API client, service, and caller in the
`shopify-product-sorter` application.  No secret values, bearer tokens, email credentials,
AWB codes, or customer payloads are recorded here.  Authentication sources are referenced
by environment-variable name only.

---

## Client Modules

### 1. `server/src/services/shiprocketService.js`

| Field | Value |
|---|---|
| **Domain** | server / Sales Reconciliation |
| **Disposition** | `RETAIN_UNTIL_PROOF` |

> Used exclusively by the sales/actual-sales reconciliation path.
> Duplicates transport and token logic from `orderMappingShiprocket.js`.
> Retained until migration proof is available (see INT-005 / INT-006).

#### Exported symbols

| Symbol | Endpoint category | Classification | Notes |
|---|---|---|---|
| `fetchShiprocketOrders({start,end})` | Orders — paginated list | READ | Flattens shipment rows; does not write |

#### Authentication

| Source | Variable name |
|---|---|
| Email | `SHIPROCKET_EMAIL` |
| Password | `SHIPROCKET_PASSWORD` |
| Static bearer token (optional override) | `SHIPROCKET_TOKEN` |
| Base URL | `SHIPROCKET_BASE_URL` |
| Channel filter | `SHIPROCKET_CHANNEL_ID` |

#### Ownership

| Concern | Owner |
|---|---|
| Authentication / token acquisition | `shiprocketService.js` — inline `authenticate()` |
| Bearer-token lifecycle | `shiprocketService.js` — module-level `token` variable |
| Retry / back-off | `shiprocketService.js` — 3-attempt loop with exponential back-off |
| Timeout | `shiprocketService.js` — `AbortController` + `SHIPROCKET_REQUEST_TIMEOUT_MS` |
| Rate-limit handling | `shiprocketService.js` — HTTP 429 back-off in retry loop |
| Raw-status capture | `shiprocketService.js` — `rawStatus` field from API response |
| Normalized-status mapping | **Not performed** — sales path does not normalize |
| Logging / redaction | `server/src/utils/sanitize.js` (`redactSecrets` / `redactNestedSecrets`) |

#### Callers

- `server/src/services/actualSalesService.js` — imports `fetchShiprocketOrders`

#### Test coverage

- `server/src/services/providerIntegration.test.js` — auth, paginated fetch, 401 re-auth, 429 rate-limit
- `tests/providerInventory.test.js` — inventory contract

---

### 2. `server/src/services/orderMappingShiprocket.js`

| Field | Value |
|---|---|
| **Domain** | server / Order Mapping |
| **Disposition** | `CURRENT_OWNER` |

#### Exported symbols

| Symbol | Endpoint category | Classification | Notes |
|---|---|---|---|
| `fetchOrderMappingShiprocketShipments({start,end})` | Orders — paginated list | READ | Normalizes raw rows via `normalizeShiprocketRow()` |
| `fetchOrderMappingShiprocketTracking(awb)` | Tracking — AWB lookup | READ | Returns structured tracking events |

#### Authentication

| Source | Variable name |
|---|---|
| Email | `SHIPROCKET_EMAIL` |
| Password | `SHIPROCKET_PASSWORD` |
| Static bearer token (optional override) | `SHIPROCKET_TOKEN` |
| Base URL | `SHIPROCKET_BASE_URL` |
| Channel filter | `SHIPROCKET_CHANNEL_ID` |

#### Ownership

| Concern | Owner |
|---|---|
| Authentication / token acquisition | `orderMappingShiprocket.js` — `authenticateShiprocket()` |
| Bearer-token lifecycle | `orderMappingShiprocket.js` — module-level `token` variable |
| Retry / back-off | `orderMappingShiprocket.js` — 3-attempt `shiprocketRequest()` with exponential back-off |
| Timeout | `orderMappingShiprocket.js` — `AbortController` per request |
| Rate-limit handling | `orderMappingShiprocket.js` — HTTP 429 back-off in `shiprocketRequest()` |
| Raw-status capture | `orderMappingShiprocket.js` — `normalizeShiprocketRow()` builds `rawStatus` / `rawStatusCode` |
| Normalized-status mapping | `server/src/services/orderMappingStatus.js` — `normalizeOrderMappingStatus()` |
| Terminal-status protection | `server/src/services/orderMappingStatus.js` — `isTerminalOrderMappingStatus()` / `canApplyStatusUpdate()` |
| Logging / redaction | `server/src/utils/sanitize.js` (`SENSITIVE_KEY_PATTERN` + `redactSecrets`) |

#### Callers

- `server/src/services/orderMappingService.js` — imports `fetchOrderMappingShiprocketShipments`, `fetchOrderMappingShiprocketTracking`

#### Test coverage

- `server/src/services/orderMapping.test.js`
- `server/src/services/providerIntegration.test.js`
- `tests/providerInventory.test.js` — inventory contract

---

### 3. `server/src/services/orderMappingStatus.js`

| Field | Value |
|---|---|
| **Domain** | server / Order Mapping |
| **Disposition** | `CURRENT_OWNER` |

This module is the canonical status mapper.  It owns all status normalization,
terminal-status protection, and status lifecycle transitions.

#### Exported symbols

| Symbol | Purpose | Notes |
|---|---|---|
| `ORDER_MAPPING_STATUSES` | All valid status strings | Constant array |
| `ACTIVE_ORDER_MAPPING_STATUSES` | Statuses representing active shipments | Constant array |
| `ATTENTION_ORDER_MAPPING_STATUSES` | Statuses requiring attention | Constant array |
| `STATUS_SOURCES` | Valid source identifiers | Constant array |
| `TERMINAL_STATUSES` | Terminal status set | `Set<string>`; `DELIVERED_TO_CUSTOMER`, `RTO_DELIVERED` |
| `normalizeOrderMappingStatus(raw)` | Map raw Shiprocket string → canonical status | Uses alias table + code lookup |
| `isTerminalOrderMappingStatus(s)` | Guard — is a status terminal? | Returns boolean |
| `displayStatusSource(shipment)` | Format display source label | Pure helper |
| `canApplyStatusUpdate(cur,inc)` | Guard — can an update override current status? | Prevents terminal-status regression |
| `statusLabel(value)` | Human-readable label for UI | Pure helper |

#### Ownership

| Concern | Owner |
|---|---|
| Authentication | N/A |
| Bearer-token lifecycle | N/A |
| Retry | N/A |
| Rate-limit | N/A |
| Raw-status capture | N/A (input from callers) |
| Normalized-status mapping | **`orderMappingStatus.js`** (canonical owner) |
| Terminal-status protection | **`orderMappingStatus.js`** (`TERMINAL_STATUSES`, `canApplyStatusUpdate`) |
| Logging / redaction | N/A |

#### Callers

- `server/src/services/orderMappingShiprocket.js`
- `server/src/services/orderMappingService.js`
- `server/src/routes/orderMapping.js`

#### Test coverage

- `server/src/services/orderMapping.test.js` — status lifecycle, terminal protection
- `tests/providerInventory.test.js` — normalizeOrderMappingStatus cases + inventory contract

---

## Read / Write Summary

| Module | READ ops | WRITE ops |
|---|---|---|
| shiprocketService.js | 1 | 0 |
| orderMappingShiprocket.js | 2 | 0 |
| orderMappingStatus.js | 8 | 0 |
| **Total** | **11** | **0** |

All Shiprocket interactions are READ.  Shiprocket is a data-source provider;
no writes are made to the Shiprocket API from this application.

---

## Ownership Summary

| Domain | Owner module |
|---|---|
| Authentication / token acquisition (sales path) | `shiprocketService.js` |
| Authentication / token acquisition (order-mapping path) | `orderMappingShiprocket.js` |
| Order lookup (sales path) | `shiprocketService.js` |
| Order lookup (order-mapping path) | `orderMappingShiprocket.js` |
| Shipment lookup | `orderMappingShiprocket.js` |
| Tracking | `orderMappingShiprocket.js` (`fetchOrderMappingShiprocketTracking`) |
| Reconciliation | `server/src/services/orderMappingService.js` |
| Status normalization | `server/src/services/orderMappingStatus.js` (`normalizeOrderMappingStatus`) |
| Terminal-status protection | `server/src/services/orderMappingStatus.js` (`TERMINAL_STATUSES`, `canApplyStatusUpdate`) |
| Retry and provider failure | Both `shiprocketService.js` and `orderMappingShiprocket.js` (parallel implementations) |
| Provider payload redaction | `server/src/utils/sanitize.js` |

---

## Environment Variables (by name only)

| Variable | Purpose |
|---|---|
| `SHIPROCKET_EMAIL` | API login email |
| `SHIPROCKET_PASSWORD` | API login password |
| `SHIPROCKET_TOKEN` | Static bearer token (bypasses email/password) |
| `SHIPROCKET_BASE_URL` | API base URL (default `https://apiv2.shiprocket.in`) |
| `SHIPROCKET_CHANNEL_ID` | Optional channel filter for order queries |
| `SHIPROCKET_ENABLED` | Optional boolean override to force-enable integration |
| `SHIPROCKET_REQUEST_TIMEOUT_MS` | Per-request timeout in ms (sales path) |

---

## Unresolved Items

| Item | Status |
|---|---|
| `shiprocketService.js` and `orderMappingShiprocket.js` both implement independent token caches and retry loops | Flagged as `RETAIN_UNTIL_PROOF` for `shiprocketService.js`; INT-005 / INT-006 cover consolidation |

---

## Validation

```
node --test tests/providerInventory.test.js
```

All tests in section B (INT-004) must pass.
