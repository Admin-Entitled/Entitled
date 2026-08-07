# Canonical Testing and Validation Strategy

> **Canonical Document**: `DOC-007`  
> **Status**: APPROVED / ACTIVE  
> **Last Updated**: 2026-08-07  

## 1. Testing Pyramid Overview

```
                      / \
                     /   \
                    / Audit \          -> npm run arch:audit-completed
                   /---------\
                  / Regression\        -> npm run test:regression-gate
                 /-------------\
                /  Integration  \      -> node --test tests/integrationContracts.test.js
               /-----------------\
              /    Unit Tests     \    -> node --test server/src/**/*.test.js
             /---------------------\
```

---

## 2. Test Suites Directory

1. **Integrated Regression Gate (`scripts/regression-gate.mjs`)**:
   - Executes all 14 unit, route, provider mock, and UI test suites.
   - Command: `npm run test:regression-gate`.
2. **Provider Mocks (`server/src/mocks/integrationMocks.js` & `providerIntegration.test.js`)**:
   - Provides network-free deterministic GraphQL/REST synthetic fixtures for Shopify and Shiprocket.
   - Asserts zero live credentials or real customer PII are required for test runs.
3. **Architecture Ledger Suite (`tests/architecture-ledger.test.js`)**:
   - Validates task state machine transitions, dependency DAG eligibility, history hash chain integrity, and completion provenance.
   - Command: `npm run test:architecture-ledger`.
4. **Completed Task Audit (`node scripts/architecture-ledger.mjs audit-completed`)**:
   - Performs automated strict commit SHA and evidence provenance verification for all completed tasks.
   - Command: `npm run arch:audit-completed`.
5. **Documentation Validation (`tests/architectureDocumentation.test.js`)**:
   - Verifies existence and validity of canonical architecture documents, links, npm scripts, and route contracts.
