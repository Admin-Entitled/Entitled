# Canonical Security Architecture

> **Canonical Document**: `DOC-008`  
> **Status**: APPROVED / ACTIVE  
> **Last Updated**: 2026-08-07  

## 1. Security Boundaries & Controls

1. **Authentication & Secret Isolation**:
   - Provider API keys and database credentials reside strictly on the backend (`process.env`).
   - Client bundle receives zero access tokens.
2. **Request Validation**:
   - `server/src/middleware/requestValidation.js` enforces strict JSON schema validation for all API request bodies.
3. **Log Sanitization & Secret Redaction**:
   - `server/src/utils/sanitize.js` automatically strips access tokens (`shpat_*`, authorization headers, database passwords) prior to logging or returning error stack traces.
4. **CORS & Security Headers**:
   - Enforces configurable CORS origin restrictions via `CORS_ORIGIN`.
   - Uses `helmet` middleware to apply HTTP security headers.
5. **Safe Observability**:
   - Debug routes (`/api/debug/shopify`) redact sensitive tokens and output only boolean availability or masked connection status.
