# Dependency Security, Credential Rotation & Meta Bundle Exposure Audit

## Executive Summary
This assessment satisfies remediation task **SEC-009** ("Audit dependencies, rotation, and future Meta bundle exposure"). It documents current npm dependency security findings, establishes formal credential rotation ownership procedures, specifies strict isolation boundaries for future Meta integration secrets, and maps all unresolved security risks to follow-up tasks.

---

## 1. Dependency Security & Audit Disposition

A comprehensive audit of the workspace package dependency tree (`144` production dependencies, `128` dev dependencies) yielded the following security findings:

| Package | Severity | Category / Risk | Context / Exposure | Disposition / Remediation |
|---|---|---|---|---|
| `body-parser` (<1.20.6) | Low | CWE-770 (Limit Enforcement) | Transitive via Express backend | Low risk. Body parser size limits explicitly configured in `server/src/app.js` (`express.json({ limit: "30mb" })`). Scheduled for patch update in dependency maintenance cycle (`CLEAN-004`). |
| `postcss` (<=8.5.22) | High | CWE-22 (Source Map Path Disclosure) | Dev dependency (`client/`) | Zero production runtime exposure. Used exclusively during Vite build phase (`npm run build`). |
| `shell-quote` (<=1.8.4) / `concurrently` | High | CWE-407 (Regex DoS) | Dev dependency (root workspace) | Zero production runtime exposure. Used exclusively for local developer startup (`npm run dev`). |

---

## 2. Credential Rotation Ownership Matrix

All credential rotation operations must follow the non-exposing procedures defined in `SECRET_HANDLING_AND_ROTATION_GUIDE.md`:

| Credential / Secret | Environment Variable(s) | Operational Owner | Rotation Procedure Summary |
|---|---|---|---|
| Shopify Admin API Access Token | `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_CLIENT_SECRET` | Integration Architect / Security Engineer | Generate token in Shopify Partner Dashboard -> Update environment manager -> Restart server. Verification via `GET /api/debug/shopify`. |
| Shiprocket API Credentials | `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_TOKEN` | Logistics / Operations Operator | Update password in Shiprocket portal -> Update container environment -> Restart backend to flush token cache. |
| PostgreSQL Database Connection | `DATABASE_URL`, `DIRECT_DATABASE_URL` | Database Reliability Engineer | Rotate password in database -> Update connection URI in secrets manager -> Restart service. |
| Express Administrative Secret | `ADMIN_SECRET` | System Administrator | Generate random 32-byte secret -> Update server environment -> Restart backend. |
| Internal Route API Secret | `API_SECRET` | Security Engineer | Generate random 32-byte secret -> Update server & reverse-proxy configuration -> Restart backend. |

---

## 3. Future Meta Bundle Exposure Isolation Policy

Task planning for future Meta integration (`META-*`) requires strict credential boundary controls:

1. **Zero Frontend Exposure**:
   - Meta App Credentials (`META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`) MUST NOT be referenced in `client/` or prefixed with `VITE_`.
   - The Vite client bundle MUST NOT contain any Meta tokens or backend client secrets.

2. **Server-Side API Proxying**:
   - All interactions with the Meta Graph API must be routed exclusively through server-side Express controllers under `/api/meta/*`.
   - Short-lived and long-lived Meta access tokens must be stored in server environment variables or encrypted server database storage.

3. **Schema & Environment Validation**:
   - Future Meta environment variables will be validated using isolated helpers (`ensureMetaEnv()`) in `server/src/config/env.js` without blocking unrelated local applications.

---

## 4. Unresolved Security Risks & Owning Tasks

| Risk Description | Current Status | Owning Remediation Task | Prerequisite / Blocker |
|---|---|---|---|
| Embedded Shopify OAuth session store & token refresh | Not Started | `SEC-008` | Blocked by `BE-008` (OAuth state persistence) |
| Multi-tenant role-based route authorization (RBAC) | Not Started | `SEC-007` | Blocked by `BE-005` (Tenant context middleware) |
| DevDependency security patch updates (`postcss`, `shell-quote`) | Pending | Maintenance (`CLEAN-004`) | Non-blocking dev tool updates |

---
*Assessment Document Version: 1.0.0 — Created for Remediation Task SEC-009*
