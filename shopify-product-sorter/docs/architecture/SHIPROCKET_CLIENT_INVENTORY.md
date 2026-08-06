# Shiprocket Client Inventory and Contract

**Task:** `INT-004` — Inventory and contract Shiprocket clients  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All Shiprocket API implementations, callers, and status mapping in `server/src/`

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `INT-004` |
| Title | Inventory and contract Shiprocket clients |
| Primary Owner | Architecture / Integration Lead |
| Scope | `server/src/services/shiprocketService.js`, `server/src/services/statusMapper.js`, and all callers |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document provides the single, authoritative inventory of all Shiprocket API implementations and callers. All Shiprocket implementations and callers are listed. Status mapping ownership is explicit. Secrets are not captured.

---

## 3. Shiprocket Client Implementation

### 3.1 Core Transport Client

| Client | File | Owner | Type | Operations |
| --- | --- | --- | --- | --- |
| **Shiprocket REST Client** | `shiprocketService.js` | Order Mapping | Transport | `authenticate()`, `request()`, `fetchShiprocketOrders()` |

### 3.2 Status Mapping Client

| Client | File | Owner | Type | Operations |
| --- | --- | --- | --- | --- |
| **Status Mapper** | `statusMapper.js` | Order Mapping (shared) | Business | `mapShiprocketStatus()`, `mapLegacyStatus()` |

---

## 4. Complete Caller Inventory

### 4.1 Transport Callers

| Caller | File | Operation | Purpose |
| --- | --- | --- | --- |
| `fetchShiprocketOrders` | `actualSalesService.js` | `shiprocketService.js` | Fetch shipments for sales analytics |
| `fetchShiprocketOrders` | `reconciliationService.js` | `shiprocketService.js` | Fetch shipments for legacy reconciliation |
| `refreshOrderMappingShiprocket` | `orderMappingShiprocket.js` | `shiprocketService.js` | Fetch shipments for Order Mapping sync |

### 4.2 Status Mapping Callers

| Caller | File | Operation | Purpose |
| --- | --- | --- | --- |
| `saveAutomaticResolution` | `deliveryRepository.js` | `mapShiprocketStatus` | Map status for legacy delivery orders |
| `syncDeliveryOrders` | `reconciliationService.js` | `mapShiprocketStatus` | Map status for legacy reconciliation |
| `getResolutionForShipment` | `orderMappingShiprocket.js` | `mapShiprocketStatus` | Map status for Order Mapping |

---

## 5. Authentication Flow

```
fetchShiprocketOrders()
    ↓
Check configured() → token or (email + password)
    ↓
If no token → authenticate()
    ↓
POST /v1/external/auth/login
    ↓
Cache token in module variable
    ↓
Use Bearer token for subsequent requests
```

### 5.1 Retry Logic

| Condition | Behavior |
| --- | --- |
| HTTP 401 (no token set) | Re-authenticate and retry |
| HTTP 429 (rate limit) | Exponential backoff with `Retry-After` header |
| HTTP 5xx (server error) | Exponential backoff, max 3 attempts |
| Network timeout | Exponential backoff, max 3 attempts |
| AbortError (timeout) | Throw with `shiprocket_timeout` category |

---

## 6. Status Mapping Ownership

### 6.1 Shiprocket Status Map

| Raw Status | Mapped Status | Owner |
| --- | --- | --- |
| `DELIVERED` | `DELIVERED` | Order Mapping |
| `RTO DELIVERED` | `NOT_DELIVERED` | Order Mapping |
| `RETURNED` | `NOT_DELIVERED` | Order Mapping |
| `CANCELLED` | `NOT_DELIVERED` | Order Mapping |
| `LOST` | `NOT_DELIVERED` | Order Mapping |
| `IN TRANSIT` | `NOT_DELIVERED` | Order Mapping |
| (unknown) | `UNRESOLVED` | Order Mapping |

### 6.2 Legacy Status Map

| Raw Status | Mapped Status | Owner |
| --- | --- | --- |
| `SUCCESSFULLY DELIVERED` | `DELIVERED` | Order Mapping (legacy) |
| (all Shiprocket statuses) | (same as Shiprocket) | Order Mapping |

---

## 7. Secret Values (Never Captured in Logs)

| Secret | Environment Variable | Owner | Logged? |
| --- | --- | --- | --- |
| Token | `SHIPROCKET_TOKEN` | Order Mapping | ❌ Never |
| Password | `SHIPROCKET_PASSWORD` | Order Mapping | ❌ Never |
| Email | `SHIPROCKET_EMAIL` | Order Mapping | ✅ Safe (non-secret) |
| Channel ID | `SHIPROCKET_CHANNEL_ID` | Order Mapping | ✅ Safe (non-secret) |
| Base URL | `SHIPROCKET_BASE_URL` | Order Mapping | ✅ Safe (non-secret) |

---

## 8. Acceptance Criteria Verification

- [x] **All Shiprocket implementations and callers are listed.** (Sections 3–4: 1 transport client, 1 status mapper, 3 transport callers, 3 status mapping callers documented).
- [x] **Status mapping ownership is explicit.** (Section 6: all status mappings owned by Order Mapping).
- [x] **Secrets are not captured.** (Section 7: secrets explicitly marked as never logged).
