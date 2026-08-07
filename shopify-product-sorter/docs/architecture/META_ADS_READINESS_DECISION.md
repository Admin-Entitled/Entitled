# Meta Ads Readiness Decision

> **Governance Decision Document**: `FINAL-007`  
> **Status**: APPROVED / ACTIVE  
> **Decision**: `META_REMAINS_DEFERRED`  
> **Date**: 2026-08-07  
> **Owner**: System Architecture Owner  

---

## 1. Executive Decision Summary

The architecture governance decision for Meta Ads integration (`META-001` through `META-008`) is **`META_REMAINS_DEFERRED`**.

All 8 Meta Ads tasks (`META-001` through `META-008`) remain strictly in `deferred` status in the architecture task ledger (`docs/architecture/ledger/tasks.json`). No Meta Ads code, API routes, database tables, provider credentials, or write capabilities are enabled in this repository.

---

## 2. Evidence & Review Findings

1. **Product Sorter Core Operational Scope**:
   - The core Product Sorter placement engine, SKU Image Manager, Sales Intelligence module, and Order Mapping capability are 100% operational, tested, and documented.
   - Meta Ads functionality is not required for daily Shopify collection reordering, snapshot generation, position scoring, or placement verification.

2. **Historical Reference Boundary**:
   - Documentation residing in `docs/meta-ads/META_ADS_APP_MIGRATION.md` is strictly historical/reference specification context.
   - Frontend UI navigation entries for Meta Ads remain disabled placeholders carrying explicit `DEFERRED_FEATURE` classifications.

3. **Security & Data Ownership Prerequisites**:
   - No Meta App Client IDs, App Secrets, or System User Access Tokens are configured or permitted in `.env`.
   - Write capability for Meta Ads remains separately gated and disabled.

---

## 3. Governance Rules & Task State Policy

- **No False Promotion**: No Meta Ads task (`META-001`..`META-008`) may be promoted to `ready` or `completed` without explicit separate product sign-off, security audit, and formal execution protocol.
- **Ledger Alignment**: Preserving `META-001`..`META-008` in `deferred` status satisfies the acceptance criteria for `FINAL-007` and does not represent an architecture remediation failure.
