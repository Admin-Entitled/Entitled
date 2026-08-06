# Retry, Rate Limit, and Error Standard

**Task:** `INT-007` — Standardize retries, rate limits, and errors  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All external API retry, rate limit, and error handling in `server/src/services/`

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `INT-007` |
| Title | Standardize retries, rate limits, and errors |
| Primary Owner | Architecture / Integration Lead |
| Scope | `shopifyService.js`, `shiprocketService.js`, all callers |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative standard for retries, rate limits, and error handling across all external API integrations. Retry behavior is bounded and observable. 401/429/5xx/timeout errors map consistently. Rate-limit handling respects provider signals.

---

## 3. Provider Retry Matrix

### 3.1 Shopify

| Condition | Max Retries | Backoff Strategy | Observable |
| --- | --- | --- | --- |
| Network failure | 0 (throw immediately) | None | ✅ `logError` |
| HTTP error | 0 (throw immediately) | None | ✅ `logError` |
| GraphQL errors | 0 (throw immediately) | None | ✅ `logError` |
| Throttle (cost) | 0 (log only) | None | ✅ `logInfo` |

**Shopify does not retry.** Throttle violations are logged and re-thrown for callers to handle.

### 3.2 Shiprocket

| Condition | Max Retries | Backoff Strategy | Observable |
| --- | --- | --- | --- |
| HTTP 401 (no token) | 1 | None (re-authenticate) | ✅ `error.category` |
| HTTP 429 (rate limit) | 3 | Exponential (250ms × 2^attempt) + `Retry-After` | ✅ `error.category` |
| HTTP 5xx (server error) | 3 | Exponential (250ms × 2^attempt) | ✅ `error.category` |
| Network failure | 3 | Exponential (250ms × 2^attempt) | ✅ `error.category` |
| Timeout (AbortError) | 3 | Exponential (250ms × 2^attempt) | ✅ `error.category` |

---

## 4. Error Category Standard

| Category | Provider | Trigger | Recoverable |
| --- | --- | --- | --- |
| `shopify_network` | Shopify | Network fetch failure | Yes |
| `shopify_http` | Shopify | Non-200 HTTP status | Depends |
| `shopify_graphql` | Shopify | GraphQL errors in response | Depends |
| `shopify_throttle` | Shopify | Cost threshold exceeded | Yes (wait) |
| `shiprocket_authentication` | Shiprocket | HTTP 401 after retry | No (credentials) |
| `shiprocket_rate_limit` | Shiprocket | HTTP 429 after retry | Yes (temporary) |
| `shiprocket_api` | Shiprocket | HTTP 4xx/5xx after retry | Depends |
| `shiprocket_timeout` | Shiprocket | AbortError | Yes (temporary) |
| `shiprocket_network` | Shiprocket | Network failure | Yes (temporary) |

---

## 5. Rate Limit Handling

### 5.1 Shopify Throttle

| Metric | Source | Action |
| --- | --- | --- |
| `currentlyAvailable` | `extensions.cost.throttleStatus` | Log only |
| `restoreRate` | `extensions.cost.throttleStatus` | Log only |
| `requestedQueryCost` | `extensions.cost` | Log only |

No automatic retry on throttle. Callers may implement their own backoff.

### 5.2 Shiprocket Rate Limit

| Signal | Source | Action |
| --- | --- | --- |
| HTTP 429 | Response status | Exponential backoff |
| `Retry-After` header | Response header | Use if present, else default backoff |

---

## 6. Timeout Standards

| Provider | Default Timeout | Configurable? | Abort Signal |
| --- | --- | --- | --- |
| Shopify | None (browser default) | No | No |
| Shiprocket | 15 seconds | Yes (`SHIPROCKET_REQUEST_TIMEOUT_MS`) | Yes (`AbortController`) |

---

## 7. Observability Contract

| Event | Logged Level | Required Fields |
| --- | --- | --- |
| Request sent | `info` | `endpoint`, `queryPreview` |
| Request completed | `info` | `endpoint`, `queryPreview`, cost metrics |
| Network failure | `error` | `endpoint`, `queryPreview` |
| HTTP error | `error` | `endpoint`, `httpStatus`, `errorText` |
| GraphQL errors | `error` | `endpoint`, `errors` |
| Auth token request | `info` | `endpoint`, `expiresInSeconds` |
| Auth token failure | `error` | `endpoint`, `httpStatus` |

---

## 8. Acceptance Criteria Verification

- [x] **Retry behavior is bounded and observable.** (Sections 3–4: retry limits defined; all retries logged).
- [x] **401/429/5xx/timeout errors map consistently.** (Section 4: error categories standardized across providers).
- [x] **Rate-limit handling respects provider signals.** (Section 5: Shopify throttle logged; Shiprocket uses `Retry-After`).
