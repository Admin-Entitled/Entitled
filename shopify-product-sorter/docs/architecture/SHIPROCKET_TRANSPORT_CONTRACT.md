# Shared Shiprocket Transport Contract

**Task ID**: INT-005  
**Owners**: `server/src/services/shiprocketService.js`, `server/src/services/orderMappingShiprocket.js`  
**Current Branch Ancestry**: `ops/architecture-ledger-hardening`  
**Evidence Model**: Branch-Native Evidence  

---

## 1. Overview & Architecture Scope

This document specifies the shared Shiprocket transport contract for the application server. Shiprocket transport handles authentication, token lifecycle, order/shipment fetching, HTTP rate limiting, and raw status retrieval across both Sales and Order Mapping capabilities.

### Explicit Architectural Boundaries:
- **Transport Scope**: Authenticating to `/v1/external/auth/login`, caching and refreshing JWT bearer tokens, paginated order requests (`/v1/external/orders`), HTTP rate-limit handling (429), HTTP 401 re-authentication retry, and payload sanitization/redaction.
- **Prohibited Responsibilities**:
  - Transport must **not** perform status normalization (owned exclusively by `server/src/services/orderMappingStatus.js`).
  - Transport must **not** enforce terminal-status protection (owned exclusively by `orderMappingStatus.js` / database state handlers).
  - No direct writing to application Postgres database tables.

---

## 2. Component Modules & Ownership Register

| Module | Role | Exports | Primary Responsibilities |
| --- | --- | --- | --- |
| `server/src/services/shiprocketService.js` | Sales Shiprocket Reader | `fetchShiprocketOrders` | Sales reconciliation order fetch, inline auth login, 3-attempt backoff retry |
| `server/src/services/orderMappingShiprocket.js` | Order Mapping Shiprocket Client | `fetchOrderMappingShiprocketShipments`, `fetchOrderMappingShiprocketTracking` | Order Mapping shipment & tracking fetch, auth login, 401 re-auth retry |
| `server/src/services/orderMappingStatus.js` | Status Mapper Owner | `normalizeOrderMappingStatus`, `isTerminalOrderMappingStatus`, `TERMINAL_STATUSES` | Single source of truth for Shiprocket raw status -> normalized status |

---

## 3. Supported Transport Contract

### Authentication & Token Lifecycle:
1. **Direct Token Usage**: If `SHIPROCKET_TOKEN` is set, transport uses it directly as `Authorization: Bearer <SHIPROCKET_TOKEN>`.
2. **Login Credentials**: If `SHIPROCKET_TOKEN` is unconfigured, transport posts `email` (`SHIPROCKET_EMAIL`) and `password` (`SHIPROCKET_PASSWORD`) to `/v1/external/auth/login` to acquire a JWT token.
3. **Automatic Re-Authentication**: On receiving an HTTP 401 response during order fetching, transport invalidates its cached bearer token, re-authenticates via login, and retries the request once.

### Redaction & Data Protection:
- All credentials (`SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_TOKEN`) and HTTP headers (`Authorization: Bearer ...`) are redacted from logs and exception messages using `server/src/utils/sanitize.js`.
- Raw payloads containing customer details (phone numbers, full addresses) are stripped or redacted before logging.

### Rate Limiting & Retry Loop:
- Bounded retry loop (maximum 3 attempts) for network timeouts and HTTP 429 Rate Limit responses.
- HTTP 429 errors throw normalized errors with category `shiprocket_rate_limit`.

---

## 4. Prohibited Ownership & Anti-Patterns

1. **No Duplicate Status Maps**: `shiprocketService.js` and `orderMappingShiprocket.js` must never define custom status string mappers or hardcode status IDs. All status translation passes through `orderMappingStatus.js`.
2. **No Terminal Override**: Transport code must never bypass terminal-status protection (`DELIVERED_TO_CUSTOMER`, `RTO_DELIVERED`).
3. **No Unredacted Logging**: Never print raw response bodies containing authorization tokens or customer PII.

---

## 5. Environment Configuration

| Variable | Classification | Requirement | Description |
| --- | --- | --- | --- |
| `SHIPROCKET_EMAIL` | Non-Secret | Required w/o Token | Account login email |
| `SHIPROCKET_PASSWORD` | **Secret** | Required w/o Token | Account login password |
| `SHIPROCKET_TOKEN` | **Secret** | Optional | Pre-generated API bearer token |
| `SHIPROCKET_BASE_URL` | Non-Secret | Optional | Base URL (default `https://apiv2.shiprocket.in`) |
| `SHIPROCKET_CHANNEL_ID` | Non-Secret | Optional | Shiprocket sales channel ID |

---

## 6. Permanent Validation & Verification Commands

Validation is provided by synthetic unit and contract tests running offline without live network access:

```bash
# Focused integration transport test
node --test tests/integrationContracts.test.js

# Comprehensive provider test suite
node --test server/src/services/providerIntegration.test.js tests/providerInventory.test.js
```

---

## 7. Legacy & Duplicate Path Disposition

- `server/src/services/orderMappingShiprocket.js`: `CURRENT_OWNER` (Order Mapping Shiprocket client)
- `server/src/services/shiprocketService.js`: `RETAIN_UNTIL_PROOF` (Sales Shiprocket order client, retained for sales reconciliation capability)
- `server/src/services/orderMappingStatus.js`: `CURRENT_OWNER` (Order Mapping status normalization & terminal protection)

---

## 8. Branch-Native Implementation Evidence

This contract document and its associated test suite (`tests/integrationContracts.test.js`) establish durable current-branch implementation provenance on `ops/architecture-ledger-hardening`.
