# Tool & Artifact Isolation Specification

## Executive Summary
This specification defines the operational isolation boundaries, ownership classifications, retention rules, and cleanliness guidelines for developer tooling, test runners, and external indexing services.

It satisfies remediation tasks **OPS-005** (Graphify artifacts), **OPS-006** (TokenSave artifacts), **OPS-007** (Playwright artifacts), and **OPS-008** (Test outputs and caches).

---

## 1. Ownership & Architectural Boundaries

### 1.1 TokenSave (`.tokensave/`) — Task OPS-006
- **Classification**: Auxiliary developer tooling runtime state created by the TokenSave MCP indexing service.
- **Application Boundary**: Neither server (`server/`), client (`client/`), nor migration tooling reads or writes `.tokensave/`.
- **Retention**: Transient; safe to delete or re-index at any time without impacting production or tests.

### 1.2 Graphify (`graphify-out/`) — Task OPS-005
- **Classification**: Automated codebase graph visualization and architectural analysis output.
- **Application Boundary**: Created by `graphify update` and stored in `graphify-out/`. Isolated from application code.
- **Canonical vs Transient**:
  - `graphify-out/GRAPH_REPORT.md` may be retained as a reference architecture report.
  - Subdirectories and graph JSON cache files are recreatable tooling outputs.
- **Retention**: Recreatable on demand. Excluded from runtime applications.

### 1.3 Playwright Test Artifacts (`test-results/playwright/`) — Task OPS-007
- **Classification**: E2E test execution artifacts including failure screenshots, trace archives, video recordings, and HTML reports.
- **Application Boundary**: Produced during Playwright test runs. Reusable tests in `client/e2e/` or `tests/e2e/` remain tracked, but execution artifacts are untracked output.
- **Retention**: Bounded to 7 days locally; automatically purged on clean checkout or test suite reset.
- **Sensitivity**: Screenshot and trace output MUST NOT contain real credentials or production PII. Synthetic test data only.

### 1.4 Test Outputs & Caches (`test-results/`, `coverage/`, `.cache/`) — Task OPS-008
- **Classification**: Unit/integration test results, architecture audit reports, coverage summaries, and transient compilation caches.
- **Application Boundary**: Test runners output results to `test-results/`. Source test fixtures (`tests/fixtures/`) remain tracked in Git; generated execution results are git-ignored.
- **Retention**: Recreatable on demand by running test suites (`npm run verify`, `npm run test:regression-gate`).

---

## 2. Retention & Git Isolation Policy

1. **Version Control Exclusion**:
   - `.tokensave/`, `graphify-out/`, `test-results/`, `coverage/`, and `.cache/` are ignored in `.gitignore`.
   - Tool cache files and transient test execution outputs are never committed.
2. **Preservation of Local Tool State**:
   - Local tool state is preserved during routine application testing and development.
   - Cleanliness utilities (`scripts/clean.mjs`) provide targeted cleanup modes with dry-run protection.
3. **Zero Secret Content**:
   - Tool outputs and test artifacts must not record passwords, tokens, API keys, or customer PII.

---
*Specification Version: 2.0.0 — Updated for Remediation Tasks OPS-005, OPS-006, OPS-007, OPS-008*
