# Authentication Boundary & Route Trust Classification Assessment

## Executive Summary
This assessment satisfies remediation task **SEC-001** ("Assess authentication boundary"). It establishes the trust classification for every endpoint in the application, details the explicit security risks associated with current backend endpoints, documents upstream credential boundaries, and specifies local loopback compatibility requirements vs. production session authentication policies.

---

## 1. Route Trust Classification Matrix

| Route / Endpoint Pattern | Http Method(s) | Surface Area | Trust Level | Description / Access Control |
|---|---|---|---|---|
| `/api/health` | `GET` | Health Check | **Public / Unauthenticated** | System status diagnostic; reports database, shopify, and environment availability. |
| `/api/debug/shopify` | `GET` | Debug Diagnostic | **Public / Unauthenticated** | Returns shopify connection status and store domain metadata. |
| `/delivery-resolution` | `GET` | Navigation Redirect | **Public / Unauthenticated** | HTTP 302 redirect to client order-mapping route (`/order-mapping`). |
| `/api/collections` | `GET`, `POST` | Sorter API | **Internal Application / Local Trust** | Reads collections & updates collection sorting rules. |
| `/api/collections/:id/*` | `GET`, `POST` | Sorter API | **Internal Application / Local Trust** | Collection rules, manual overrides, pin/bury operations, and sync triggers. |
| `/api/sku-media/*` | `GET`, `POST` | SKU Media API | **Internal Application / Local Trust** | Previews & executes bulk SKU image deletions on Shopify CDN. |
| `/api/sales-intelligence/*` | `GET` | Analytics API | **Internal Application / Local Trust** | Fetches sales intelligence analytics slices and CSV exports. |
| `/api/order-mapping/*` | `GET`, `POST` | Order Mapping API | **Internal Application / Local Trust** | Synchronizes Shopify orders & Shiprocket shipments, status overrides, and locks. |
| Static Assets (`/assets/*`, `index.html`) | `GET` | Single-Page Application | **Public** | Bundled Vite React frontend assets served via `express.static`. |

---

## 2. Upstream Credential & Security Boundaries

1. **Shopify Admin API Boundary**:
   - The client application never holds Shopify Admin tokens directly.
   - The Express backend holds server-side credentials (`env.shopifyAccessToken` or OAuth offline access token) to authenticate calls to `https://{store_domain}/admin/api/2024-01/graphql.json`.
   - Access is restricted by Shopify OAuth scopes (`read_products`, `write_products`, `read_orders`, etc.).

2. **Shiprocket API Boundary**:
   - The backend authenticates with Shiprocket using server-side credentials (`env.shiprocketEmail` and `env.shiprocketPassword`).
   - Short-lived JWT bearer tokens are cached in-memory on the backend and never exposed to the client.

3. **CORS Boundary**:
   - Browser cross-origin requests are gated via Express `cors({ origin: env.clientOrigin })` (default `http://localhost:5173`).

---

## 3. Explicit Security Risks & Gaps

1. **Unauthenticated API Layer Risk**:
   - **Risk**: Express API routes (`/api/*` and `/api/order-mapping/*`) do not currently enforce session tokens or authorization headers. Any client capable of reaching the backend HTTP port can trigger collection reordering, order syncs, or SKU media deletions.
   - **Severity**: High / Critical in multi-tenant or public network deployments.
   - **Mitigation Requirement**: Production deployments must enforce an authenticated reverse-proxy or App Bridge JWT validation middleware on `/api/*`.

2. **Local Loopback Compatibility Requirement**:
   - **Requirement**: Local development and standalone single-user operation must remain zero-friction without requiring complex OAuth handshakes when running on `localhost`.
   - **Policy**: Unauthenticated loopback requests are permitted exclusively when `NODE_ENV !== 'production'` and connection originates from local loopback interfaces.

---

## 4. Production Authentication Roadmap

For embedded Shopify App deployment (Task `SEC-002` / `SEC-004`):
1. **App Bridge JWT Middleware**: Verify incoming `Authorization: Bearer <session_token>` header on all `/api/*` routes using Shopify App Secret.
2. **Session Context Validation**: Extract `dest` (shop domain) from validated JWT and verify alignment with `env.shopifyStoreDomain`.
3. **Local Dev Override**: Allow unauthenticated requests only under explicit local development configuration (`NODE_ENV=development` or `NODE_ENV=test`).

---
*Assessment Document Version: 1.0.0 — Created for Remediation Task SEC-001*
