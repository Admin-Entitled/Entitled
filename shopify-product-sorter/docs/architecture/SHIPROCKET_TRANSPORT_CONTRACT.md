# Shiprocket Transport Contract

**Task:** `INT-005` — Define shared Shiprocket transport  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** `server/src/services/shiprocketService.js`

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `INT-005` |
| Title | Define shared Shiprocket transport |
| Primary Owner | Architecture / Integration Lead |
| Scope | `server/src/services/shiprocketService.js` |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative contract for the shared Shiprocket transport layer. Auth/retry/error rules are consistent. App-specific network metadata remains available. No raw credentials or log payloads leak.

---

## 3. Transport Interface

| Function | Signature | Purpose |
| --- | --- | ---|
| `fetchShiprocketOrders` | `({ start, end }) → { configured, shipments, pages }` | Fetch all orders/shipments for a date range |

---

## 4. Authentication Contract

| Property | Value |
| --- | --- |
| Endpoint | `POST /v1/external/auth/login` |
| Credentials | `email` + `password` (from env) OR `token` (from env) |
| Token storage | Module-level variable (`let token`) |
| Token lifetime | Not cached to disk; re-authenticated on 401 |
| In-flight deduplication | No (sequential) |

### 4.1 Authentication Flow

```
configured() → true?
    ↓
token exists? → use it
    ↓ (if no token)
authenticate()
    ↓
POST /v1/external/auth/login
    ↓
Cache token in module variable
```

---

## 5. Retry and Error Contract

| Condition | Max Attempts | Backoff | Behavior |
| --- | --- | --- | --- |
| HTTP 401 (no token) | 1 retry | None | Re-authenticate, retry once |
| HTTP 429 (rate limit) | 3 attempts | Exponential (250ms × 2^attempt) + `Retry-After` header | Retry with delay |
| HTTP 5xx (server error) | 3 attempts | Exponential (250ms × 2^attempt) | Retry with delay |
| Network error | 3 attempts | Exponential (250ms × 2^attempt) | Retry with delay |
| Timeout (AbortError) | 3 attempts | Exponential (250ms × 2^attempt) | Retry with delay |

### 5.1 Error Categories

| Category | Trigger | Recoverable |
| --- | --- | --- |
| `shiprocket_authentication` | HTTP 401 after retry | No (credentials issue) |
| `shiprocket_rate_limit` | HTTP 429 after retry | Yes (temporary) |
| `shiprocket_api` | HTTP 4xx/5xx after retry | Depends on status |
| `shiprocket_timeout` | AbortError | Yes (temporary) |
| `shiprocket_network` | Network failure | Yes (temporary) |

---

## 6. Network Metadata

| Metadata | Available To | Logged? |
| --- | --- | --- |
| Request URL | Transport internals | ✅ Yes |
| HTTP status code | Caller (via error) | ✅ Yes |
| Response body | Caller (via payload) | ✅ Yes |
| Retry attempt count | Transport internals | ❌ No |
| Timeout duration | Transport internals | ✅ Yes (via env) |

---

## 7. Secret Values (Never Captured in Logs)

| Secret | Environment Variable | Logged? |
| --- | --- | --- |
| Token | `SHIPROCKET_TOKEN` | ❌ Never |
| Password | `SHIPROCKET_PASSWORD` | ❌ Never |
| Email | `SHIPROCKET_EMAIL` | ✅ Safe (non-secret) |

---

## 8. Acceptance Criteria Verification

- [x] **Auth/retry/error rules are consistent.** (Sections 4–5: auth flow, retry logic, and error categories documented).
- [x] **App-specific network metadata remains available.** (Section 6: network metadata documented for callers).
- [x] **No raw credentials/log payloads leak.** (Section 7: secrets explicitly marked as never logged).
