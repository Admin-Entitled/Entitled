# Secret Handling & Token Security Guide

## Executive Summary
This document fulfills remediation task **SEC-003** ("Correct secret handling and tracked token risk"). It defines the canonical rules for runtime secret management, details secret scanning and tracked file audit results, specifies log redaction policies, and outlines standard procedures for credential rotation without leaking sensitive values.

---

## 1. Approved Runtime Secret Storage

All production credentials, tokens, and private keys must adhere to the following storage policies:

1. **Environment Variables Only**:
   - Production secrets (`SHOPIFY_CLIENT_SECRET`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_TOKEN`, `ADMIN_SECRET`, `API_SECRET`, `DATABASE_URL`) must be passed into the runtime via environment variables or an enterprise secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault).
   - `.env` files are local-only development artifacts and strictly excluded from version control via `.gitignore`.

2. **No Secret Storage in Source Code or Client Bundles**:
   - Frontend client bundles (`client/dist`) MUST NOT contain any secret keys, access tokens, or private credentials.
   - All external API calls requiring secrets (Shopify GraphQL, Shiprocket REST) are proxied server-side.

3. **In-Memory Token Caching**:
   - Short-lived authentication tokens (such as Shiprocket JWT tokens or Shopify OAuth tokens) are cached in-memory inside the Node.js process and never written to disk or database tables in plaintext.

---

## 2. Tracked Token Risk Audit & Scanning Results

1. **Git Repository Scan**:
   - Verified that no live production secrets, private API keys, or active credentials are tracked in Git history or workspace files.
   - Test files (`server/src/mocks/integrationMocks.js`, `server/src/services/providerIntegration.test.js`) exclusively use synthetic mock strings (e.g., `shpat_mock_access_token_12345`).

2. **Gitignore Protection**:
   - `.env`, `server/data`, `client/dist`, `coverage/`, `.tokensave/`, and `docs/architecture/ledger/snapshots/` are registered in `.gitignore` to prevent accidental credential commits.

---

## 3. Log & Diagnostic Redaction Mechanisms

1. **Automatic Redaction via `server/src/utils/sanitize.js`**:
   - All diagnostic logs, health checks, and error responses pass through `redactSecrets()`.
   - Pattern-matched redactions automatically sanitize:
     - Shopify Admin Tokens (`shpat_*`, `shptka_*`, `shpca_*`, `shpua_*`) -> `[REDACTED_SHOPIFY_TOKEN]`
     - Bearer authorization headers (`Bearer *`) -> `Bearer [REDACTED_TOKEN]`
     - Exact configured environment secrets (`SHOPIFY_CLIENT_SECRET`, `SHIPROCKET_PASSWORD`, `ADMIN_SECRET`, etc.) -> `[REDACTED]`

---

## 4. Secret Rotation Procedures (Without Value Exposure)

When rotating environment credentials:

1. **Shopify Access Token Rotation**:
   - Generate a new Admin Access Token or re-authenticate OAuth in Shopify Partner Dashboard.
   - Update `SHOPIFY_ADMIN_ACCESS_TOKEN` in the production container environment / secrets manager.
   - Restart the server process (`npm run start`). The server automatically primes the new token cache (`primeShopifyAuthCache()`) on startup.
   - Verify health via `GET /api/debug/shopify` (returns status `authenticated` without exposing token value).

2. **Shiprocket Credential Rotation**:
   - Update password in Shiprocket portal.
   - Update `SHIPROCKET_PASSWORD` in production environment.
   - Restart backend to force re-authentication and token acquisition.

3. **Audit Log Recording Policy**:
   - Rotation events recorded in system logs must state timestamp, operator/task ID, and key type rotated (e.g., `SHOPIFY_ADMIN_ACCESS_TOKEN rotated at 2026-08-01T00:00:00Z`).
   - Secret values or token signatures MUST NEVER be recorded in logs, tickets, or ledger entries.

---
*Guide Version: 1.0.0 — Created for Remediation Task SEC-003*
