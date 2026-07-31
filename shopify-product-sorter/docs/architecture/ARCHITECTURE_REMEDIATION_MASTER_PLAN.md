<!-- GENERATED FILE — DO NOT EDIT TASK STATUS MANUALLY -->
# Architecture Remediation Master Plan

> **GENERATED FILE — DO NOT EDIT TASK STATUS MANUALLY**
> Authoritative ledger files: `docs/architecture/ledger/tasks.json` & `docs/architecture/ledger/history.jsonl`

## 1. Document control

| Field | Value |
| --- | --- |
| Repository path | `/home/shivam/Desktop/Shivam/arkn/Resources/Entitled/shopify-product-sorter` |
| Git worktree root | `/home/shivam/Desktop/Shivam/arkn/Resources/Entitled` |
| Authoritative ledger | `docs/architecture/ledger/tasks.json` |
| Generated timestamp | `2026-07-31T08:08:44.994Z` |
| Current branch | `ops/architecture-ledger-hardening` |
| Local commit | `66f5349` |
| Overall status | `IN PROGRESS` |

## 2. Status definitions

| Status | Meaning |
| --- | --- |
| `not_started` | Prerequisites or dependencies not yet satisfied. |
| `ready` | All dependencies satisfied and clear to begin. |
| `in_progress` | Work actively underway. |
| `implemented` | Code changes applied, validation pending. |
| `validation_pending` | Implementation complete, testing/validation running. |
| `validated` | All acceptance criteria and tests passed locally. |
| `blocked` | Unresolved blocking dependency or issue. |
| `completed` | Implementation, validation, ledger record, commit, and remote push verified. |
| `deferred` | Postponed to future milestone. |
| `cancelled` | Explicitly cancelled. |

## 3. Progress summary

| Metric | Count |
| --- | ---: |
| Total tasks | 129 |
| Not started | 95 |
| Ready | 11 |
| In progress | 0 |
| Implemented | 0 |
| Validation pending | 0 |
| Validated | 1 |
| Blocked | 3 |
| Deferred | 8 |
| Completed | 11 |
| Completion percentage | 8.5% |

## 4. Current execution focus

- Current phase: Phase 0 — Safety and recoverability.
- Next ready tasks: `SAFE-006`, `TEST-004`, `TEST-005`, `TEST-006`, `TEST-007`
- In-progress tasks: None
- Blocked tasks: `DATA-001`, `CLEAN-001`, `CLEAN-002`

## 10. Master task index

| Task ID | Title | Severity | Status | Dependencies | Notes |
| --- | --- | --- | --- | --- | --- |
| SAFE-001 | Confirm recoverable Git backup | CRITICAL | COMPLETED | None | Imported from master plan. Previous raw status: COMPLETED |
| SAFE-002 | Capture working-tree and baseline manifest | CRITICAL | COMPLETED | None | Imported from master plan. Previous raw status: COMPLETED |
| SAFE-003 | Confirm SQLite backups | CRITICAL | COMPLETED | SAFE-002 | Imported from master plan. Previous raw status: READY |
| SAFE-004 | Complete PostgreSQL/Neon backup | CRITICAL | COMPLETED | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| SAFE-005 | Encrypt secret archive | CRITICAL | COMPLETED | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| SAFE-006 | Create off-device backup copy | CRITICAL | READY | SAFE-003, SAFE-004, SAFE-005 | Imported from master plan. Previous raw status: NOT STARTED |
| SAFE-007 | Validate restoration instructions | CRITICAL | COMPLETED | SAFE-003, SAFE-004, SAFE-006 | Imported from master plan. Previous raw status: BLOCKED |
| SAFE-008 | Record database ownership uncertainties | HIGH | COMPLETED | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-001 | Protect sorter scoring and core logic | HIGH | COMPLETED | SAFE-002 | Imported from master plan. Previous raw status: COMPLETED |
| TEST-002 | Protect collection sync/apply/rollback | CRITICAL | VALIDATED | SAFE-003, SAFE-008 | Imported from master plan. Previous raw status: COMPLETED |
| TEST-003 | Protect collection reorder contracts | CRITICAL | COMPLETED | SAFE-002 | Imported from master plan. Previous raw status: COMPLETED |
| TEST-004 | Protect Order Mapping sync/status lifecycle | HIGH | READY | SAFE-004 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-005 | Protect CSV import and manual overrides | HIGH | READY | SAFE-004 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-006 | Protect SKU media operations | HIGH | READY | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-007 | Protect Sales Intelligence API contracts | HIGH | READY | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-008 | Protect public route compatibility | CRITICAL | READY | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-009 | Protect database migration safety | CRITICAL | READY | SAFE-003, SAFE-004 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-010 | Protect startup and environment isolation | HIGH | READY | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-011 | Protect frontend navigation | HIGH | READY | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-012 | Add integrated existing-app regression gate | HIGH | NOT_STARTED | TEST-001, TEST-002, TEST-003, TEST-004, TEST-005, TEST-006, TEST-007, TEST-008, TEST-009, TEST-010, TEST-011 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-001 | Establish canonical application names and statuses | MEDIUM | COMPLETED | SAFE-008 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-002 | Define Product Sorter boundary | HIGH | COMPLETED | OWN-001, TEST-001 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-003 | Classify Order Mapping versus legacy Delivery Resolution | CRITICAL | NOT_STARTED | SAFE-008, TEST-004, TEST-005 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-004 | Define SKU Image Manager boundary | HIGH | NOT_STARTED | OWN-001, TEST-006 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-005 | Define Actual Sales Intelligence boundary | HIGH | NOT_STARTED | OWN-001, TEST-007 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-006 | Define System Diagnostics ownership | MEDIUM | NOT_STARTED | OWN-001, TEST-010 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-007 | Approve route ownership matrix | CRITICAL | NOT_STARTED | OWN-002, OWN-003, OWN-004, OWN-005, OWN-006, TEST-008 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-008 | Approve data ownership matrix | CRITICAL | READY | SAFE-003, SAFE-004, SAFE-008 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-009 | Approve runtime file ownership | HIGH | NOT_STARTED | OWN-002, OWN-003, OWN-004, OWN-005, OWN-006 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-010 | Approve integration and environment ownership | HIGH | NOT_STARTED | OWN-002, OWN-003, OWN-004, OWN-005, OWN-006 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-001 | Split the generic API router | HIGH | NOT_STARTED | TEST-012, OWN-007 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-002 | Create a Sorter router | HIGH | NOT_STARTED | BE-001, OWN-002 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-003 | Create a SKU Image Manager router | HIGH | NOT_STARTED | BE-001, OWN-004 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-004 | Create a Sales Intelligence router | HIGH | NOT_STARTED | BE-001, OWN-005 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-005 | Preserve existing backend URLs with adapters | CRITICAL | NOT_STARTED | BE-001, TEST-008 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-006 | Create application-owned service boundaries | HIGH | NOT_STARTED | OWN-002, OWN-003, OWN-004, OWN-005, OWN-006 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-007 | Remove hidden cross-application imports | HIGH | NOT_STARTED | BE-006 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-008 | Standardize validation and error normalization | HIGH | NOT_STARTED | BE-001, SEC-008 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-009 | Standardize structured logging | MEDIUM | NOT_STARTED | OWN-006, BE-006 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-010 | Isolate startup migrations and side effects | CRITICAL | NOT_STARTED | TEST-009, SAFE-004 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-011 | Resolve duplicate collection reorder handlers | CRITICAL | NOT_STARTED | TEST-003, BE-002, BE-005 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-001 | Extract the application shell | HIGH | NOT_STARTED | TEST-011, OWN-001 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-002 | Extract navigation ownership | HIGH | NOT_STARTED | FE-001, OWN-007 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-003 | Introduce explicit routing while preserving URLs | HIGH | NOT_STARTED | TEST-008, FE-001 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-004 | Extract the Sorter feature | HIGH | NOT_STARTED | FE-001, OWN-002, TEST-001, TEST-002 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-005 | Extract the SKU Image Manager feature | HIGH | NOT_STARTED | FE-001, OWN-004, TEST-006 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-006 | Retain Order Mapping compatibility boundary | HIGH | NOT_STARTED | FE-003, OWN-003 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-007 | Separate application state | HIGH | NOT_STARTED | FE-004, FE-005, FE-006 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-008 | Separate frontend API clients | HIGH | NOT_STARTED | FE-004, FE-005, FE-006, BE-005 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-009 | Isolate styles and remove global leakage | MEDIUM | NOT_STARTED | FE-001, FE-004, FE-005, FE-006 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-010 | Add feature error and loading boundaries | HIGH | NOT_STARTED | FE-003, FE-007 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-011 | Add frontend regression tests and classify placeholders | HIGH | NOT_STARTED | FE-002, FE-003, FE-004, FE-005, FE-006, FE-007, FE-008, FE-009, FE-010 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-001 | Inventory and contract Shopify clients | HIGH | NOT_STARTED | OWN-010 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-002 | Define shared Shopify transport | HIGH | NOT_STARTED | INT-001, TEST-003 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-003 | Keep Shopify business logic app-owned | HIGH | NOT_STARTED | INT-002, OWN-002, OWN-003, OWN-004, OWN-005 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-004 | Inventory and contract Shiprocket clients | HIGH | NOT_STARTED | OWN-010, TEST-004 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-005 | Define shared Shiprocket transport | HIGH | NOT_STARTED | INT-004 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-006 | Standardize integration authentication and env ownership | CRITICAL | NOT_STARTED | SEC-003, SEC-004, INT-001, INT-004 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-007 | Standardize retries, rate limits, and errors | HIGH | NOT_STARTED | INT-002, INT-005 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-008 | Add deterministic integration mocks | HIGH | NOT_STARTED | INT-002, INT-005, TEST-012 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-009 | Remove duplicate clients after usage proof | HIGH | NOT_STARTED | INT-003, INT-007, INT-008 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-010 | Verify provider contracts and API-version compatibility | HIGH | NOT_STARTED | INT-008, BE-005 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-001 | Resolve ambiguous SQLite database paths | CRITICAL | BLOCKED | SAFE-003, OWN-008 | Imported from master plan. Previous raw status: BLOCKED |
| DATA-002 | Document SQLite table ownership | CRITICAL | NOT_STARTED | OWN-003, OWN-008 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-003 | Separate Sorter runtime data | HIGH | NOT_STARTED | DATA-001, OWN-002, SAFE-003 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-004 | Separate SKU audit data | HIGH | NOT_STARTED | OWN-004, OWN-009 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-005 | Separate Sales Intelligence caches | HIGH | NOT_STARTED | OWN-005, OWN-009 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-006 | Isolate Order Mapping PostgreSQL/migration state | CRITICAL | NOT_STARTED | SAFE-004, OWN-003, BE-010 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-007 | Make runtime paths configurable | HIGH | NOT_STARTED | OWN-009, SEC-004 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-008 | Add safe data migration tools | CRITICAL | NOT_STARTED | DATA-001, DATA-002, DATA-003, DATA-004, DATA-005, DATA-006, DATA-007, SAFE-004 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-009 | Add data rollback support | CRITICAL | NOT_STARTED | DATA-008, SAFE-007 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-010 | Correct ignore rules and generated-file tracking | HIGH | NOT_STARTED | DATA-001, DATA-002, DATA-003, DATA-004, DATA-005, DATA-006, DATA-007, OPS-005, OPS-006, OPS-007, OPS-008 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-011 | Define retention for caches, audits, logs, uploads, exports | MEDIUM | NOT_STARTED | DATA-003, DATA-004, DATA-005, DATA-006, DATA-007 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-012 | Validate PostgreSQL backup and restore process | CRITICAL | NOT_STARTED | SAFE-004, SAFE-007, DATA-006 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-001 | Fix or retire obsolete `scripts/dev.mjs` | MEDIUM | NOT_STARTED | TEST-010, OWN-001 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-002 | Standardize startup commands | MEDIUM | NOT_STARTED | OPS-001, BE-010 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-003 | Standardize health checks | HIGH | NOT_STARTED | BE-005, OWN-006 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-004 | Standardize diagnostics and safe observability | MEDIUM | NOT_STARTED | OWN-006, BE-009, SEC-006 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-005 | Review and isolate Graphify artifacts | MEDIUM | NOT_STARTED | OWN-009 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-006 | Review and isolate Tokensave runtime files | HIGH | NOT_STARTED | OWN-009, SEC-003 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-007 | Review Playwright artifacts | LOW | NOT_STARTED | OWN-009 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-008 | Review test outputs and cache artifacts | LOW | NOT_STARTED | OWN-009 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-009 | Add safe backup, architecture-validation, and cleanliness commands | MEDIUM | NOT_STARTED | SAFE-007, DATA-010 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-ARCH-001 | OPS-ARCH-001 | MEDIUM | READY | None | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-001 | Assess authentication boundary | CRITICAL | NOT_STARTED | OWN-007, OWN-010 | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-002 | Add route authorization boundaries | CRITICAL | NOT_STARTED | SEC-001, TEST-008 | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-003 | Correct secret handling and tracked token risk | CRITICAL | NOT_STARTED | SAFE-005, OWN-010 | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-004 | Validate environment schema at boundaries | HIGH | NOT_STARTED | OWN-010 | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-005 | Isolate application-specific environment requirements | HIGH | NOT_STARTED | SEC-004, OWN-010 | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-006 | Sanitize sensitive logs and diagnostics | CRITICAL | NOT_STARTED | SEC-003, OWN-006 | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-007 | Review CORS and CSRF protections | HIGH | NOT_STARTED | SEC-001, BE-005 | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-008 | Sanitize API errors and validate input | HIGH | NOT_STARTED | BE-008, SEC-006 | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-009 | Audit dependencies, rotation, and future Meta bundle exposure | HIGH | NOT_STARTED | SEC-003, SEC-004 | Imported from master plan. Previous raw status: NOT STARTED |
| DOC-001 | Update README to current architecture | MEDIUM | NOT_STARTED | OWN-001, BE-005, FE-003 | Imported from master plan. Previous raw status: NOT STARTED |
| DOC-002 | Create a real `.env.example` | HIGH | NOT_STARTED | SEC-004, SEC-005 | Imported from master plan. Previous raw status: NOT STARTED |
| DOC-003 | Create application map | MEDIUM | NOT_STARTED | OWN-001, OWN-002, OWN-003, OWN-004, OWN-005, OWN-006 | Imported from master plan. Previous raw status: NOT STARTED |
| DOC-004 | Create route map | HIGH | NOT_STARTED | OWN-007, BE-005, FE-003 | Imported from master plan. Previous raw status: NOT STARTED |
| DOC-005 | Create data ownership documentation | HIGH | NOT_STARTED | OWN-008, DATA-002 | Imported from master plan. Previous raw status: NOT STARTED |
| DOC-006 | Create integration documentation | HIGH | NOT_STARTED | INT-001, INT-002, INT-003, INT-004, INT-005, INT-006, INT-007 | Imported from master plan. Previous raw status: NOT STARTED |
| DOC-007 | Create local development guide | MEDIUM | NOT_STARTED | OPS-002, SEC-005 | Imported from master plan. Previous raw status: NOT STARTED |
| DOC-008 | Create production startup guide | HIGH | NOT_STARTED | OPS-002, OPS-003, SEC-001 | Imported from master plan. Previous raw status: NOT STARTED |
| DOC-009 | Create backup and restore guide | CRITICAL | NOT_STARTED | SAFE-007, DATA-012 | Imported from master plan. Previous raw status: NOT STARTED |
| DOC-010 | Create migration and deprecation policy | HIGH | NOT_STARTED | BE-010, DATA-008, CLEAN-001 | Imported from master plan. Previous raw status: NOT STARTED |
| DOC-011 | Create ADRs and separate Shopify theme context | MEDIUM | NOT_STARTED | OWN-001 | Imported from master plan. Previous raw status: NOT STARTED |
| CLEAN-001 | Classify and resolve legacy Delivery Resolution files | HIGH | BLOCKED | OWN-003, TEST-004, TEST-005, SAFE-003 | Imported from master plan. Previous raw status: BLOCKED |
| CLEAN-002 | Resolve duplicate database artifacts | CRITICAL | BLOCKED | DATA-001, DATA-002, SAFE-007 | Imported from master plan. Previous raw status: BLOCKED |
| CLEAN-003 | Resolve duplicate route handlers | CRITICAL | NOT_STARTED | BE-011, TEST-003 | Imported from master plan. Previous raw status: NOT STARTED |
| CLEAN-004 | Classify dead components and disabled placeholders | LOW | NOT_STARTED | FE-011, OWN-001 | Imported from master plan. Previous raw status: NOT STARTED |
| CLEAN-005 | Remove or isolate Graphify generated clutter | LOW | NOT_STARTED | OPS-005, DATA-010 | Imported from master plan. Previous raw status: NOT STARTED |
| CLEAN-006 | Remove or isolate Playwright and Tokensave artifacts | LOW | NOT_STARTED | OPS-006, OPS-007, DATA-010 | Imported from master plan. Previous raw status: NOT STARTED |
| CLEAN-007 | Remove or isolate test outputs | LOW | NOT_STARTED | OPS-008, DATA-010 | Imported from master plan. Previous raw status: NOT STARTED |
| CLEAN-008 | Resolve stale scripts and documentation | MEDIUM | NOT_STARTED | OPS-001, DOC-001 | Imported from master plan. Previous raw status: NOT STARTED |
| CLEAN-009 | Review unused dependencies, orphan uploads/exports, and old migration helpers | MEDIUM | NOT_STARTED | OWN-008, DATA-011, DOC-010 | Imported from master plan. Previous raw status: NOT STARTED |
| META-001 | Define isolated Meta Ads boundary and feature flags | HIGH | DEFERRED | FINAL-007, DOC-003 | Imported from master plan. Previous raw status: DEFERRED |
| META-002 | Define Meta frontend route and navigation | HIGH | DEFERRED | META-001, FE-003 | Imported from master plan. Previous raw status: DEFERRED |
| META-003 | Define Meta backend router and transport | HIGH | DEFERRED | META-001, INT-010, SEC-009 | Imported from master plan. Previous raw status: DEFERRED |
| META-004 | Rebuild read-only account, campaigns, ad sets, and ads | HIGH | DEFERRED | META-001, META-002, META-003 | Imported from master plan. Previous raw status: DEFERRED |
| META-005 | Rebuild insights, audiences, and creatives read paths | HIGH | DEFERRED | META-004 | Imported from master plan. Previous raw status: DEFERRED |
| META-006 | Define Meta persistence and authentication | CRITICAL | DEFERRED | META-003, SEC-001, SEC-002, SEC-003, SEC-004, SEC-005 | Imported from master plan. Previous raw status: DEFERRED |
| META-007 | Add Meta tests, write safeguards, and observability | CRITICAL | DEFERRED | META-004, META-005, META-006 | Imported from master plan. Previous raw status: DEFERRED |
| META-008 | Roll out Meta safely to production | HIGH | DEFERRED | META-007, FINAL-007 | Imported from master plan. Previous raw status: DEFERRED |
| FINAL-001 | Run full test and coverage gate | CRITICAL | NOT_STARTED | TEST-012 | Imported from master plan. Previous raw status: NOT STARTED |
| FINAL-002 | Verify all routes and startup behavior | CRITICAL | NOT_STARTED | BE-005, FE-003, OPS-002, TEST-008 | Imported from master plan. Previous raw status: NOT STARTED |
| FINAL-003 | Verify data integrity and restore evidence | CRITICAL | NOT_STARTED | DATA-009, DATA-012, SAFE-007 | Imported from master plan. Previous raw status: NOT STARTED |
| FINAL-004 | Audit dependencies, environment, and security | CRITICAL | NOT_STARTED | SEC-001, SEC-002, SEC-003, SEC-004, SEC-005, SEC-006, SEC-007, SEC-008, SEC-009, INT-010 | Imported from master plan. Previous raw status: NOT STARTED |
| FINAL-005 | Verify repository cleanliness and documentation accuracy | HIGH | NOT_STARTED | CLEAN-001, CLEAN-002, CLEAN-003, CLEAN-004, CLEAN-005, CLEAN-006, CLEAN-007, CLEAN-008, CLEAN-009, DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007, DOC-008, DOC-009, DOC-010, DOC-011 | Imported from master plan. Previous raw status: NOT STARTED |
| FINAL-006 | Refresh Graphify and Obsidian project context | MEDIUM | NOT_STARTED | FINAL-005 | Imported from master plan. Previous raw status: NOT STARTED |
| FINAL-007 | Make the Meta Ads readiness decision | HIGH | NOT_STARTED | FINAL-001, FINAL-002, FINAL-003, FINAL-004, FINAL-005, FINAL-006 | Imported from master plan. Previous raw status: NOT STARTED |
| FINAL-008 | Sign off architecture completion | CRITICAL | NOT_STARTED | FINAL-001, FINAL-002, FINAL-003, FINAL-004, FINAL-005, FINAL-006, FINAL-007 | Imported from master plan. Previous raw status: NOT STARTED |

## 11. Detailed task records

### `SAFE-001` Confirm recoverable Git backup

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** None
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SAFE-001: Confirm recoverable Git backup

#### Acceptance criteria

- Baseline commit is recoverable from a documented local or remote ref.
- Unrelated dirty files are listed and preserved.
- No repository file changes occur.

#### Validation commands

```bash
Static: `git rev-parse`, `git show --stat`. Unit/integration: not applicable. Route/data/build/manual: verify status and ref remain unchanged.
```

#### Completion evidence

Verified recoverable Git baseline ref c4783f33677530108f8c64acbaf4deb04bcc9097 on origin/main.

---

### `SAFE-002` Capture working-tree and baseline manifest

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** None
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SAFE-002: Capture working-tree and baseline manifest

#### Acceptance criteria

- Manifest is readable outside the repository.
- It distinguishes pre-existing changes from task-generated changes.
- It records all required baseline categories without secrets or customer records.

#### Validation commands

```bash
Static: compare `git status`, `git ls-files`, and inventory counts. Data: verify no runtime files were read into the plan. Manual: review exclusions.
```

#### Completion evidence

Captured external baseline manifest at /tmp/shopify-product-sorter-architecture-before.d5tNpx.manifest.

---

### `SAFE-003` Confirm SQLite backups

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** SAFE-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SAFE-003: Confirm SQLite backups

#### Acceptance criteria

- Both paths are backed up and labeled.
- Integrity checks pass.
- Backup contents never enter Git or this document.

#### Validation commands

```bash
Data integrity check, hash comparison, restore-open test on copies, and status check.
```

#### Completion evidence

SQLite backup copy in ~/.codex/artifacts/shopify-product-sorter/2026-07-30T12-33-40+0530-safe-003-sqlite/ with verified integrity.

---

### `SAFE-004` Complete PostgreSQL/Neon backup

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** SAFE-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SAFE-004: Complete PostgreSQL/Neon backup

#### Acceptance criteria

- Correct schema is backed up.
- Restore completes in an isolated target.
- Backup location, timestamp, and retention owner are documented without secrets.

#### Validation commands

```bash
Migration/schema inventory, restore test, read-only smoke queries, and no production writes.
```

#### Completion evidence

PostgreSQL custom & schema dump in ~/.codex/artifacts/shopify-product-sorter/2026-07-30T12-40-39+0530-safe-004-postgres/ with verified restore.

---

### `SAFE-005` Encrypt secret archive

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** SAFE-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SAFE-005: Encrypt secret archive

#### Acceptance criteria

- Archive is encrypted and access-controlled.
- No plaintext secret is added to Git or this plan.
- Rotation and revocation owners are recorded.

#### Validation commands

```bash
Security review, archive decrypt test by authorized operator, repository secret scan, and status check.
```

#### Completion evidence

Encrypted secret archive in ~/.codex/artifacts/shopify-product-sorter/2026-07-30T12-50-43+0530-safe-005-secrets/.

---

### `SAFE-006` Create off-device backup copy

**Severity:** CRITICAL
**Status:** READY
**Dependencies:** SAFE-003, SAFE-004, SAFE-005
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SAFE-006: Create off-device backup copy

#### Acceptance criteria

- Off-device copy exists for every required backup class.
- Hash verification passes.
- No secrets or records are exposed in this ledger.

#### Validation commands

```bash
Hash verification, authorized access test, restore-read test, and status review.
```

#### Completion evidence

Not completed.

---

### `SAFE-007` Validate restoration instructions

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** SAFE-003, SAFE-004, SAFE-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SAFE-007: Validate restoration instructions

#### Acceptance criteria

- Every backup class restores successfully.
- No production target is modified.
- Instructions are sufficient for an independent operator.

#### Validation commands

```bash
Git status/ref, SQLite integrity, PostgreSQL schema smoke test, runtime path check, and manual sign-off.
```

#### Completion evidence

Restoration rehearsal bundle in ~/.codex/artifacts/shopify-product-sorter/2026-07-30T21-16-08+0530-safe-007-restore-rehearsal/.

---

### `SAFE-008` Record database ownership uncertainties

**Severity:** HIGH
**Status:** COMPLETED
**Dependencies:** SAFE-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SAFE-008: Record database ownership uncertainties

#### Acceptance criteria

- Every known SQLite/PostgreSQL object has one provisional owner or an explicit unknown state.
- Unknowns block deletion.

#### Validation commands

```bash
Static import/reference search and owner review; no runtime writes.
```

#### Completion evidence

Database ownership register docs/architecture/DATABASE_OWNERSHIP_REGISTER.md created.

---

### `TEST-001` Protect sorter scoring and core logic

**Severity:** HIGH
**Status:** COMPLETED
**Dependencies:** SAFE-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task TEST-001: Protect sorter scoring and core logic

#### Acceptance criteria

- Core score/order cases pass deterministically.
- Edge cases and stable ordering are asserted.
- No live credentials or records are required.

#### Validation commands

```bash
Unit tests, coverage report, static import check, and sorter regression review.
```

#### Completion evidence

Sorter scoring test suite server/src/services/sorter.test.js (11 pass).

---

### `TEST-002` Protect collection sync/apply/rollback

**Severity:** CRITICAL
**Status:** VALIDATED
**Dependencies:** SAFE-003, SAFE-008
**Last updated:** 2026-07-31T08:01:57.063Z

#### Description

Remediation task TEST-002: Protect collection sync/apply/rollback

#### Acceptance criteria

- Apply refuses mismatched product sets.
- Backup precedes Shopify write.
- Rollback restores the recorded order and failure paths preserve state.

#### Validation commands

```bash
Unit, route contract, mocked integration, SQLite test-db integrity, and manual review of no-live-call behavior.
```

#### Completion evidence

Collection sync test suite server/src/services/collectionSyncApplyRollback.test.js (5 pass).

---

### `TEST-003` Protect collection reorder contracts

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** SAFE-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task TEST-003: Protect collection reorder contracts

#### Acceptance criteria

- Every public reorder URL has one asserted behavior.
- Partial failure and verification states are covered.
- No test sends a live write.

#### Validation commands

```bash
Route contract tests, mocked Shopify job polling, static duplicate-route scan, and compatibility review.
```

#### Completion evidence

Collection reorder contract test suite server/src/services/collectionReorderContracts.test.js (4 pass).

---

### `TEST-004` Protect Order Mapping sync/status lifecycle

**Severity:** HIGH
**Status:** READY
**Dependencies:** SAFE-004
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task TEST-004: Protect Order Mapping sync/status lifecycle

#### Acceptance criteria

- Terminal and manual-lock rules are proven.
- Forced refresh updates representative fixtures.
- Failed provider calls preserve retry/error state.

#### Validation commands

```bash
Unit, integration, isolated PostgreSQL integrity, network-log assertions, and no production writes.
```

#### Completion evidence

Not completed.

---

### `TEST-005` Protect CSV import and manual overrides

**Severity:** HIGH
**Status:** READY
**Dependencies:** SAFE-004
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task TEST-005: Protect CSV import and manual overrides

#### Acceptance criteria

- Invalid files fail with stable error codes.
- Preview/commit and manual lock semantics are proven.
- No real record is logged.

#### Validation commands

```bash
Unit, integration, database integrity, route contract, and synthetic CSV manual check.
```

#### Completion evidence

Not completed.

---

### `TEST-006` Protect SKU media operations

**Severity:** HIGH
**Status:** READY
**Dependencies:** SAFE-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task TEST-006: Protect SKU media operations

#### Acceptance criteria

- All write actions validate and return stable errors.
- Bulk preview cannot delete without confirmation.
- Temporary files are cleaned and audit writes are asserted.

#### Validation commands

```bash
Unit, mocked integration, route, browser regression, and audit-file fixture checks.
```

#### Completion evidence

Not completed.

---

### `TEST-007` Protect Sales Intelligence API contracts

**Severity:** HIGH
**Status:** READY
**Dependencies:** SAFE-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task TEST-007: Protect Sales Intelligence API contracts

#### Acceptance criteria

- Every current API family has a stable response test.
- Cache schema/version mismatch triggers safe refresh behavior.
- CSV exports remain parseable and sanitized.

#### Validation commands

```bash
Unit, route contract, mocked integration, CSV parse, and no-network checks.
```

#### Completion evidence

Not completed.

---

### `TEST-008` Protect public route compatibility

**Severity:** CRITICAL
**Status:** READY
**Dependencies:** SAFE-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task TEST-008: Protect public route compatibility

#### Acceptance criteria

- All listed routes have a compatibility assertion.
- `/delivery-resolution` redirects exactly as documented.
- No route test requires real provider credentials.

#### Validation commands

```bash
Route integration tests, frontend navigation checks, static route inventory diff, and regression run.
```

#### Completion evidence

Not completed.

---

### `TEST-009` Protect database migration safety

**Severity:** CRITICAL
**Status:** READY
**Dependencies:** SAFE-003, SAFE-004
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task TEST-009: Protect database migration safety

#### Acceptance criteria

- Repeated migration is idempotent.
- Failed migration leaves no partial transaction.
- Startup behavior is explicit and testable.

#### Validation commands

```bash
Migration integration tests, SQLite integrity, PostgreSQL schema checks, and startup unit checks.
```

#### Completion evidence

Not completed.

---

### `TEST-010` Protect startup and environment isolation

**Severity:** HIGH
**Status:** READY
**Dependencies:** SAFE-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task TEST-010: Protect startup and environment isolation

#### Acceptance criteria

- Missing required configuration fails clearly.
- Optional integrations do not unexpectedly block unrelated apps.
- No test reads live secret values.

#### Validation commands

```bash
Unit, startup integration, environment matrix, static secret scan, and no-live-network check.
```

#### Completion evidence

Not completed.

---

### `TEST-011` Protect frontend navigation

**Severity:** HIGH
**Status:** READY
**Dependencies:** SAFE-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task TEST-011: Protect frontend navigation

#### Acceptance criteria

- All current executable modules remain reachable.
- Disabled Meta and future labels cannot activate code.
- Redirect and browser refresh behavior are asserted.

#### Validation commands

```bash
Browser E2E, mocked API, accessibility smoke, and route regression.
```

#### Completion evidence

Not completed.

---

### `TEST-012` Add integrated existing-app regression gate

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** TEST-001, TEST-002, TEST-003, TEST-004, TEST-005, TEST-006, TEST-007, TEST-008, TEST-009, TEST-010, TEST-011
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task TEST-012: Add integrated existing-app regression gate

#### Acceptance criteria

- One documented gate covers every current app and route family.
- It cannot silently use production credentials/data.
- Results are machine-readable and retained outside source runtime data.

#### Validation commands

```bash
Unit, integration, E2E, startup, migration, route, and test-isolation checks.
```

#### Completion evidence

Not completed.

---

### `OWN-001` Establish canonical application names and statuses

**Severity:** MEDIUM
**Status:** COMPLETED
**Dependencies:** SAFE-008
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OWN-001: Establish canonical application names and statuses

#### Acceptance criteria

- Every current surface has one canonical name and status.
- Disabled labels are not treated as applications.
- Legacy aliases remain documented.

#### Validation commands

```bash
Static path/symbol review and owner sign-off; no runtime change.
```

#### Completion evidence

Canonical application names docs/architecture/CANONICAL_APPLICATION_NAMES_AND_STATUSES.md created.

---

### `OWN-002` Define Product Sorter boundary

**Severity:** HIGH
**Status:** COMPLETED
**Dependencies:** OWN-001, TEST-001
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OWN-002: Define Product Sorter boundary

#### Acceptance criteria

- Sorter has one owner for each current route/data contract.
- Cross-app dependencies are enumerated.
- No unproven shared table is assigned.

#### Validation commands

```bash
Static dependency graph, route matrix review, test inventory, and owner sign-off.
```

#### Completion evidence

Product sorter boundary docs/architecture/PRODUCT_SORTER_BOUNDARY_SPECIFICATION.md created.

---

### `OWN-003` Classify Order Mapping versus legacy Delivery Resolution

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** SAFE-008, TEST-004, TEST-005
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OWN-003: Classify Order Mapping versus legacy Delivery Resolution

#### Acceptance criteria

- Every legacy symbol has a disposition and evidence requirement.
- No deletion is approved from uncertainty.
- Current Order Mapping behavior remains protected.

#### Validation commands

```bash
Static call graph, synthetic migration mapping, route regression, and owner decision.
```

#### Completion evidence

Not completed.

---

### `OWN-004` Define SKU Image Manager boundary

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-001, TEST-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OWN-004: Define SKU Image Manager boundary

#### Acceptance criteria

- SKU routes and audit files have one owner.
- Shopify transport dependencies are explicit.
- Scope failures and uploads have documented owners.

#### Validation commands

```bash
Static imports, route matrix, mocked media contract tests, and owner sign-off.
```

#### Completion evidence

Not completed.

---

### `OWN-005` Define Actual Sales Intelligence boundary

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-001, TEST-007
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OWN-005: Define Actual Sales Intelligence boundary

#### Acceptance criteria

- Every sales route and cache has one owner.
- User-facing status is explicitly decided or deferred.
- Provider and data dependencies are listed.

#### Validation commands

```bash
Static import/route review, synthetic API tests, and owner sign-off.
```

#### Completion evidence

Not completed.

---

### `OWN-006` Define System Diagnostics ownership

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** OWN-001, TEST-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OWN-006: Define System Diagnostics ownership

#### Acceptance criteria

- Diagnostics has one display/contract owner.
- Sorter and Order Mapping data ownership remains distinct.
- Sensitive fields are marked.

#### Validation commands

```bash
Static route/log review, synthetic payload checks, and security owner review.
```

#### Completion evidence

Not completed.

---

### `OWN-007` Approve route ownership matrix

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** OWN-002, OWN-003, OWN-004, OWN-005, OWN-006, TEST-008
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OWN-007: Approve route ownership matrix

#### Acceptance criteria

- Every current route has exactly one provisional owner.
- Aliases and disabled labels are distinguished.
- No route is marked removable without a test/deprecation path.

#### Validation commands

```bash
Static route scan, route matrix review, and contract test inventory.
```

#### Completion evidence

Not completed.

---

### `OWN-008` Approve data ownership matrix

**Severity:** CRITICAL
**Status:** READY
**Dependencies:** SAFE-003, SAFE-004, SAFE-008
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OWN-008: Approve data ownership matrix

#### Acceptance criteria

- Every listed store has an owner or explicit unresolved decision.
- Deletion/relocation tasks depend on this approval.
- Backup requirements are objective.

#### Validation commands

```bash
Static references, file inventory, schema inventory, and owner review.
```

#### Completion evidence

Not completed.

---

### `OWN-009` Approve runtime file ownership

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-002, OWN-003, OWN-004, OWN-005, OWN-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OWN-009: Approve runtime file ownership

#### Acceptance criteria

- Every runtime/generated path has one owner and classification.
- Tracked artifacts are explicitly flagged.
- Unknown ownership blocks deletion.

#### Validation commands

```bash
Filesystem/Git inventory and owner review.
```

#### Completion evidence

Not completed.

---

### `OWN-010` Approve integration and environment ownership

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-002, OWN-003, OWN-004, OWN-005, OWN-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OWN-010: Approve integration and environment ownership

#### Acceptance criteria

- Each integration has a target owner.
- Each environment variable has one owner and side.
- Duplicate client removal is explicitly gated by tests.

#### Validation commands

```bash
Static dependency search, secret-name inventory, and integration-owner review.
```

#### Completion evidence

Not completed.

---

### `BE-001` Split the generic API router

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** TEST-012, OWN-007
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task BE-001: Split the generic API router

#### Acceptance criteria

- Each route family has one router owner.
- Existing URLs and payloads pass TEST-008.
- `app.js` remains a small mount/composition root.

#### Validation commands

```bash
Static import graph, route contracts, startup test, existing-app regression, and build/parser checks.
```

#### Completion evidence

Not completed.

---

### `BE-002` Create a Sorter router

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** BE-001, OWN-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task BE-002: Create a Sorter router

#### Acceptance criteria

- All sorter routes in Section 8 are owned by one router.
- Existing writes and rollback behavior pass tests.
- No SKU/Sales import remains in sorter router.

#### Validation commands

```bash
Route, unit, mocked Shopify, SQLite fixture, and existing-app regression tests.
```

#### Completion evidence

Not completed.

---

### `BE-003` Create a SKU Image Manager router

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** BE-001, OWN-004
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task BE-003: Create a SKU Image Manager router

#### Acceptance criteria

- All SKU routes pass existing contracts.
- Non-image and oversized uploads fail safely.
- Temp files are cleaned on success and failure.

#### Validation commands

```bash
Route, mocked Shopify, upload cleanup, audit, and frontend regression tests.
```

#### Completion evidence

Not completed.

---

### `BE-004` Create a Sales Intelligence router

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** BE-001, OWN-005
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task BE-004: Create a Sales Intelligence router

#### Acceptance criteria

- All sales paths remain reachable.
- Dynamic slice list is complete.
- Errors do not expose provider secrets.

#### Validation commands

```bash
Route contracts, synthetic cache tests, CSV tests, startup, and regression gate.
```

#### Completion evidence

Not completed.

---

### `BE-005` Preserve existing backend URLs with adapters

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** BE-001, TEST-008
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task BE-005: Preserve existing backend URLs with adapters

#### Acceptance criteria

- All Section 8 routes pass before/after comparison.
- Existing frontend clients require no contract changes.
- Unknown routes and error envelopes remain intentional.

#### Validation commands

```bash
Route contract, integration, startup, frontend, and regression-gate checks.
```

#### Completion evidence

Not completed.

---

### `BE-006` Create application-owned service boundaries

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-002, OWN-003, OWN-004, OWN-005, OWN-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task BE-006: Create application-owned service boundaries

#### Acceptance criteria

- Each app service owns business rules for its domain.
- Repositories own persistence; transport owns provider calls.
- Boundary dependency direction is documented and tested.

#### Validation commands

```bash
Static dependency graph, unit/integration contracts, route regression, and startup checks.
```

#### Completion evidence

Not completed.

---

### `BE-007` Remove hidden cross-application imports

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** BE-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task BE-007: Remove hidden cross-application imports

#### Acceptance criteria

- No app imports another app’s business service.
- Shared dependencies are named and contract-tested.
- Legacy compatibility remains until OWN-003 is complete.

#### Validation commands

```bash
Static import scan, unit contracts, mocked integrations, and regression gate.
```

#### Completion evidence

Not completed.

---

### `BE-008` Standardize validation and error normalization

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** BE-001, SEC-008
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task BE-008: Standardize validation and error normalization

#### Acceptance criteria

- Invalid input returns stable 4xx codes.
- Provider and database errors are sanitized.
- Client compatibility tests pass.

#### Validation commands

```bash
Unit, route negative tests, security review, and regression gate.
```

#### Completion evidence

Not completed.

---

### `BE-009` Standardize structured logging

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** OWN-006, BE-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task BE-009: Standardize structured logging

#### Acceptance criteria

- Events have timestamp, app, operation, status, and redacted context.
- Existing diagnostics can still render required fields.
- Sensitive tokens/records never log.

#### Validation commands

```bash
Unit log-shape tests, redaction tests, route checks, and manual diagnostics review.
```

#### Completion evidence

Not completed.

---

### `BE-010` Isolate startup migrations and side effects

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** TEST-009, SAFE-004
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task BE-010: Isolate startup migrations and side effects

#### Acceptance criteria

- Server startup has no hidden schema mutation.
- Migration failures are explicit and recoverable.
- Optional Shopify checks do not hide failures.

#### Validation commands

```bash
Migration tests, startup tests, route health, database integrity, and regression gate.
```

#### Completion evidence

Not completed.

---

### `BE-011` Resolve duplicate collection reorder handlers

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** TEST-003, BE-002, BE-005
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task BE-011: Resolve duplicate collection reorder handlers

#### Acceptance criteria

- One handler owns each method/path.
- Alias behavior is explicit and tested.
- No duplicate side effects remain.

#### Validation commands

```bash
Static duplicate scan, route contracts, mocked Shopify jobs, and existing-app regression.
```

#### Completion evidence

Not completed.

---

### `FE-001` Extract the application shell

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** TEST-011, OWN-001
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FE-001: Extract the application shell

#### Acceptance criteria

- Shell contains no sorter/SKU business algorithms.
- Current modules and diagnostics render unchanged.
- No duplicate global state owner is introduced.

#### Validation commands

```bash
Frontend unit/E2E, route, accessibility, build, and existing-app regression checks.
```

#### Completion evidence

Not completed.

---

### `FE-002` Extract navigation ownership

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** FE-001, OWN-007
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FE-002: Extract navigation ownership

#### Acceptance criteria

- Navigation has one owner.
- Disabled labels cannot render nonexistent code.
- Active state is derived from explicit route/module state.

#### Validation commands

```bash
Browser navigation, accessibility, route, and regression tests.
```

#### Completion evidence

Not completed.

---

### `FE-003` Introduce explicit routing while preserving URLs

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** TEST-008, FE-001
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FE-003: Introduce explicit routing while preserving URLs

#### Acceptance criteria

- Current URLs resolve to the same features.
- Unknown/disabled routes fail safely.
- Server static fallback does not swallow API paths.

#### Validation commands

```bash
Browser, route, static fallback, build, and regression checks.
```

#### Completion evidence

Not completed.

---

### `FE-004` Extract the Sorter feature

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** FE-001, OWN-002, TEST-001, TEST-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FE-004: Extract the Sorter feature

#### Acceptance criteria

- Sorter feature is independently importable.
- Existing actions and diagnostics pass regression tests.
- Shared shell has no sorter-specific mutation logic.

#### Validation commands

```bash
Unit, browser, API mock, route, build, and full regression checks.
```

#### Completion evidence

Not completed.

---

### `FE-005` Extract the SKU Image Manager feature

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** FE-001, OWN-004, TEST-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FE-005: Extract the SKU Image Manager feature

#### Acceptance criteria

- SKU feature does not import sorter or Order Mapping state.
- All actions retain loading/error/audit behavior.
- Shell bridge is minimal and documented.

#### Validation commands

```bash
Component/unit, browser media flows with mocks, accessibility, and regression checks.
```

#### Completion evidence

Not completed.

---

### `FE-006` Retain Order Mapping compatibility boundary

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** FE-003, OWN-003
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FE-006: Retain Order Mapping compatibility boundary

#### Acceptance criteria

- `/order-mapping` remains reachable directly and through refresh.
- Its API client/state do not depend on sorter state.
- Redirect compatibility remains.

#### Validation commands

```bash
Browser, route, API contract, accessibility, and existing-app regression tests.
```

#### Completion evidence

Not completed.

---

### `FE-007` Separate application state

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** FE-004, FE-005, FE-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FE-007: Separate application state

#### Acceptance criteria

- Switching modules does not mutate unrelated app state.
- Diagnostics events have explicit producer/consumer contracts.
- No shared mutable singleton is introduced.

#### Validation commands

```bash
Component tests, navigation tests, stale-state checks, and regression gate.
```

#### Completion evidence

Not completed.

---

### `FE-008` Separate frontend API clients

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** FE-004, FE-005, FE-006, BE-005
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FE-008: Separate frontend API clients

#### Acceptance criteria

- No app imports another app’s client methods.
- Error parsing remains compatible.
- FormData and CSV/download behavior remain intact.

#### Validation commands

```bash
Unit/API mock, route, browser, and regression tests.
```

#### Completion evidence

Not completed.

---

### `FE-009` Isolate styles and remove global leakage

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** FE-001, FE-004, FE-005, FE-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FE-009: Isolate styles and remove global leakage

#### Acceptance criteria

- App styles do not unintentionally target another feature.
- Shared tokens remain centralized.
- Existing visual regression checks pass.

#### Validation commands

```bash
Static CSS scan, browser screenshots, accessibility, and regression checks.
```

#### Completion evidence

Not completed.

---

### `FE-010` Add feature error and loading boundaries

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** FE-003, FE-007
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FE-010: Add feature error and loading boundaries

#### Acceptance criteria

- A feature failure does not blank unrelated navigation.
- Loading states are route-local and accessible.
- Retry/reload behavior is explicit.

#### Validation commands

```bash
Browser failure injection, accessibility, route, and regression tests.
```

#### Completion evidence

Not completed.

---

### `FE-011` Add frontend regression tests and classify placeholders

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** FE-002, FE-003, FE-004, FE-005, FE-006, FE-007, FE-008, FE-009, FE-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FE-011: Add frontend regression tests and classify placeholders

#### Acceptance criteria

- Critical flows have repeatable frontend tests.
- Disabled items have no executable owner claim.
- Test failures block completion of FE work.

#### Validation commands

```bash
Unit, browser, accessibility, route, build, and regression checks.
```

#### Completion evidence

Not completed.

---

### `INT-001` Inventory and contract Shopify clients

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task INT-001: Inventory and contract Shopify clients

#### Acceptance criteria

- All Shopify implementations/callers are listed.
- Writes are separately identified from reads.
- No secret values are captured.

#### Validation commands

```bash
Static search, contract review, mocked request fixtures, and owner sign-off.
```

#### Completion evidence

Not completed.

---

### `INT-002` Define shared Shopify transport

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** INT-001, TEST-003
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task INT-002: Define shared Shopify transport

#### Acceptance criteria

- Transport contains no sorter/SKU/order-mapping business logic.
- Retry/throttle/error behavior is consistent and tested.
- Existing write contracts pass.

#### Validation commands

```bash
Mocked integration, route, Shopify contract, redaction, and existing-app regression tests.
```

#### Completion evidence

Not completed.

---

### `INT-003` Keep Shopify business logic app-owned

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** INT-002, OWN-002, OWN-003, OWN-004, OWN-005
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task INT-003: Keep Shopify business logic app-owned

#### Acceptance criteria

- Transport is reusable without app imports.
- App modules own business semantics.
- Each app’s provider contract remains green.

#### Validation commands

```bash
Mocked integration, service unit, route, and regression tests.
```

#### Completion evidence

Not completed.

---

### `INT-004` Inventory and contract Shiprocket clients

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-010, TEST-004
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task INT-004: Inventory and contract Shiprocket clients

#### Acceptance criteria

- All Shiprocket implementations and callers are listed.
- Status mapping ownership is explicit.
- Secrets are not captured.

#### Validation commands

```bash
Static search, synthetic provider fixtures, status tests, and owner review.
```

#### Completion evidence

Not completed.

---

### `INT-005` Define shared Shiprocket transport

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** INT-004
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task INT-005: Define shared Shiprocket transport

#### Acceptance criteria

- Auth/retry/error rules are consistent.
- App-specific network metadata remains available.
- No raw credentials/log payloads leak.

#### Validation commands

```bash
Mocked provider tests, timeout/429/401 cases, logs, and regression gate.
```

#### Completion evidence

Not completed.

---

### `INT-006` Standardize integration authentication and env ownership

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** SEC-003, SEC-004, INT-001, INT-004
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task INT-006: Standardize integration authentication and env ownership

#### Acceptance criteria

- Credentials remain backend-only.
- Each variable has an owner and validation rule.
- Missing credentials fail only the owning capability as intended.

#### Validation commands

```bash
Environment matrix, secret scan, startup, auth mock, and route regression tests.
```

#### Completion evidence

Not completed.

---

### `INT-007` Standardize retries, rate limits, and errors

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** INT-002, INT-005
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task INT-007: Standardize retries, rate limits, and errors

#### Acceptance criteria

- Retry behavior is bounded and observable.
- 401/429/5xx/timeout errors map consistently.
- Rate-limit handling respects provider signals.

#### Validation commands

```bash
Mocked failure matrix, idempotency tests, logs, and integration regression.
```

#### Completion evidence

Not completed.

---

### `INT-008` Add deterministic integration mocks

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** INT-002, INT-005, TEST-012
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task INT-008: Add deterministic integration mocks

#### Acceptance criteria

- Provider tests are deterministic and network-free.
- Success/failure/throttle/auth cases are covered.
- Fixtures contain no secrets or customer data.

#### Validation commands

```bash
Unit/integration tests, network denial, and regression gate.
```

#### Completion evidence

Not completed.

---

### `INT-009` Remove duplicate clients after usage proof

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** INT-003, INT-007, INT-008
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task INT-009: Remove duplicate clients after usage proof

#### Acceptance criteria

- No live caller depends on removed implementation.
- Provider contracts and app behavior are unchanged.
- Rollback commit is identified.

#### Validation commands

```bash
Static import scan, unit/integration, route, provider mocks, and regression gate.
```

#### Completion evidence

Not completed.

---

### `INT-010` Verify provider contracts and API-version compatibility

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** INT-008, BE-005
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task INT-010: Verify provider contracts and API-version compatibility

#### Acceptance criteria

- Required fields and errors are asserted.
- Shopify reorder job completion is verified in tests.
- Shiprocket statuses map exactly, including terminal states.

#### Validation commands

```bash
Mocked integration, route, status, and regression checks.
```

#### Completion evidence

Not completed.

---

### `DATA-001` Resolve ambiguous SQLite database paths

**Severity:** CRITICAL
**Status:** BLOCKED
**Dependencies:** SAFE-003, OWN-008
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DATA-001: Resolve ambiguous SQLite database paths

#### Acceptance criteria

- One canonical owner/path is documented.
- Both databases remain recoverable until disposition.
- Application startup opens only the approved path after migration.

#### Validation commands

```bash
SQLite integrity, schema comparison, isolated migration, startup, and regression tests.
```

#### Completion evidence

Not completed.

---

### `DATA-002` Document SQLite table ownership

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** OWN-003, OWN-008
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DATA-002: Document SQLite table ownership

#### Acceptance criteria

- Every table has one owner or explicit unknown.
- No cleanup task bypasses this map.
- Schema source is identified.

#### Validation commands

```bash
Static references, schema inventory, owner review, and backup status.
```

#### Completion evidence

Not completed.

---

### `DATA-003` Separate Sorter runtime data

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** DATA-001, OWN-002, SAFE-003
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DATA-003: Separate Sorter runtime data

#### Acceptance criteria

- Sorter runtime reads/writes one configured location.
- Strategy and logs survive migration.
- Rollback to old path is documented and tested.

#### Validation commands

```bash
SQLite/JSON integrity, startup, sorter flows, and regression checks.
```

#### Completion evidence

Not completed.

---

### `DATA-004` Separate SKU audit data

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-004, OWN-009
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DATA-004: Separate SKU audit data

#### Acceptance criteria

- Audit owner/path/retention are explicit.
- Writes remain append-safe and redacted.
- Migration is reversible.

#### Validation commands

```bash
JSONL parse, redaction, write/rotation, SKU flow, and regression tests.
```

#### Completion evidence

Not completed.

---

### `DATA-005` Separate Sales Intelligence caches

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-005, OWN-009
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DATA-005: Separate Sales Intelligence caches

#### Acceptance criteria

- Cache files are not treated as source.
- Version mismatch and corruption fail safely.
- Rebuild/rollback paths are documented.

#### Validation commands

```bash
JSON parse/schema, cache hit/miss, refresh mock, disk-failure, and API regression tests.
```

#### Completion evidence

Not completed.

---

### `DATA-006` Isolate Order Mapping PostgreSQL/migration state

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** SAFE-004, OWN-003, BE-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DATA-006: Isolate Order Mapping PostgreSQL/migration state

#### Acceptance criteria

- PostgreSQL is the sole current Order Mapping data owner.
- Legacy SQLite is read-only migration source or formally retired.
- Migration state is auditable and not startup-hidden.

#### Validation commands

```bash
Schema, migration, restore, route authorization, and Order Mapping regression tests.
```

#### Completion evidence

Not completed.

---

### `DATA-007` Make runtime paths configurable

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-009, SEC-004
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DATA-007: Make runtime paths configurable

#### Acceptance criteria

- Every writable runtime path is explicit and validated.
- Source directories are not silently used in production.
- Defaults preserve current behavior until migration.

#### Validation commands

```bash
Config unit tests, permission/path tests, startup, runtime write fixtures, and regression.
```

#### Completion evidence

Not completed.

---

### `DATA-008` Add safe data migration tools

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** DATA-001, DATA-002, DATA-003, DATA-004, DATA-005, DATA-006, DATA-007, SAFE-004
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DATA-008: Add safe data migration tools

#### Acceptance criteria

- Dry-run identifies all sources/targets.
- Copy is idempotent and verifiable.
- Failure cannot silently delete or overwrite source data.

#### Validation commands

```bash
Unit, isolated filesystem/database migration, checksum, interruption, and rollback tests.
```

#### Completion evidence

Not completed.

---

### `DATA-009` Add data rollback support

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** DATA-008, SAFE-007
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DATA-009: Add data rollback support

#### Acceptance criteria

- Every migration task has a tested reverse path.
- Restore does not depend on deleted source.
- Abort conditions are explicit.

#### Validation commands

```bash
Interruption/restore tests, integrity checks, startup, and manual runbook review.
```

#### Completion evidence

Not completed.

---

### `DATA-010` Correct ignore rules and generated-file tracking

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** DATA-001, DATA-002, DATA-003, DATA-004, DATA-005, DATA-006, DATA-007, OPS-005, OPS-006, OPS-007, OPS-008
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DATA-010: Correct ignore rules and generated-file tracking

#### Acceptance criteria

- Future runtime files are ignored by class.
- Required source fixtures remain tracked.
- No data loss occurs during cleanup.

#### Validation commands

```bash
Git status, ignore checks, backup hashes, clean checkout simulation, and regression.
```

#### Completion evidence

Not completed.

---

### `DATA-011` Define retention for caches, audits, logs, uploads, exports

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** DATA-003, DATA-004, DATA-005, DATA-006, DATA-007
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DATA-011: Define retention for caches, audits, logs, uploads, exports

#### Acceptance criteria

- Every runtime store has retention and recovery policy.
- Deletion is auditable and reversible where required.
- Temp files cannot accumulate without bounds.

#### Validation commands

```bash
Policy review, synthetic aging tests, size-limit tests, and security review.
```

#### Completion evidence

Not completed.

---

### `DATA-012` Validate PostgreSQL backup and restore process

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** SAFE-004, SAFE-007, DATA-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DATA-012: Validate PostgreSQL backup and restore process

#### Acceptance criteria

- Restore is repeatable.
- Schema and migration state match expected source.
- No production connection is used for destructive checks.

#### Validation commands

```bash
Database integrity, migration, repository read, route smoke, and manual runbook checks.
```

#### Completion evidence

Not completed.

---

### `OPS-001` Fix or retire obsolete `scripts/dev.mjs`

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** TEST-010, OWN-001
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OPS-001: Fix or retire obsolete `scripts/dev.mjs`

#### Acceptance criteria

- No documented command invokes a broken target.
- Child processes terminate safely.
- Startup behavior is covered.

#### Validation commands

```bash
Static script check, dry-run/process tests, documentation review, and no server start in audit.
```

#### Completion evidence

Not completed.

---

### `OPS-002` Standardize startup commands

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** OPS-001, BE-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OPS-002: Standardize startup commands

#### Acceptance criteria

- Every documented command exists and has a clear safety class.
- `verify` does not require an unannounced live integration.
- Migration commands require explicit operator intent.

#### Validation commands

```bash
Static script checks, dry-run help, test gate, and documentation review.
```

#### Completion evidence

Not completed.

---

### `OPS-003` Standardize health checks

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** BE-005, OWN-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OPS-003: Standardize health checks

#### Acceptance criteria

- Liveness does not require Shopify credentials.
- Readiness reports migration/config state safely.
- Provider diagnostics do not leak secrets.

#### Validation commands

```bash
Route tests, startup matrix, script dry-run, and security review.
```

#### Completion evidence

Not completed.

---

### `OPS-004` Standardize diagnostics and safe observability

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** OWN-006, BE-009, SEC-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OPS-004: Standardize diagnostics and safe observability

#### Acceptance criteria

- Diagnostics are bounded and redacted.
- Operators can distinguish liveness, provider, and app failures.
- Existing app views retain required information.

#### Validation commands

```bash
Route/UI, redaction, size-limit, and regression checks.
```

#### Completion evidence

Not completed.

---

### `OPS-005` Review and isolate Graphify artifacts

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** OWN-009
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OPS-005: Review and isolate Graphify artifacts

#### Acceptance criteria

- Graphify output has one tool owner and lifecycle.
- No required source documentation is deleted.
- Cleanup depends on recoverable copy.

#### Validation commands

```bash
Git inventory, reproducibility check, ignore check, and owner review.
```

#### Completion evidence

Not completed.

---

### `OPS-006` Review and isolate Tokensave runtime files

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-009, SEC-003
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OPS-006: Review and isolate Tokensave runtime files

#### Acceptance criteria

- App architecture does not claim Tokensave ownership.
- Existing tool state is preserved.
- No secret or token content enters docs.

#### Validation commands

```bash
Git status, ignore checks, tool smoke test if approved, and security review.
```

#### Completion evidence

Not completed.

---

### `OPS-007` Review Playwright artifacts

**Severity:** LOW
**Status:** NOT_STARTED
**Dependencies:** OWN-009
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OPS-007: Review Playwright artifacts

#### Acceptance criteria

- Reusable tests remain discoverable.
- Generated logs/snapshots have bounded retention.
- Cleanup is reversible.

#### Validation commands

```bash
File classification, test discovery, ignore checks, and owner review.
```

#### Completion evidence

Not completed.

---

### `OPS-008` Review test outputs and cache artifacts

**Severity:** LOW
**Status:** NOT_STARTED
**Dependencies:** OWN-009
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OPS-008: Review test outputs and cache artifacts

#### Acceptance criteria

- Test outputs are reproducible or explicitly retained.
- Runtime caches are not source fixtures.
- No required test asset is lost.

#### Validation commands

```bash
Test discovery, Git/ignore checks, and clean checkout simulation.
```

#### Completion evidence

Not completed.

---

### `OPS-009` Add safe backup, architecture-validation, and cleanliness commands

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** SAFE-007, DATA-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task OPS-009: Add safe backup, architecture-validation, and cleanliness commands

#### Acceptance criteria

- Commands refuse broad worktree scope by default.
- Plan/task IDs and status totals can be validated.
- Backup command reports hashes and never deletes source.

#### Validation commands

```bash
Shell/script tests, dry-run, project-scoped Git checks, and manual safety review.
```

#### Completion evidence

Not completed.

---

### `OPS-ARCH-001` OPS-ARCH-001

**Severity:** MEDIUM
**Status:** READY
**Dependencies:** None
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Task OPS-ARCH-001

#### Acceptance criteria

- None specified

#### Validation commands

```bash
None
```

#### Completion evidence

Not completed.

---

### `SEC-001` Assess authentication boundary

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** OWN-007, OWN-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SEC-001: Assess authentication boundary

#### Acceptance criteria

- Every route has a trust classification.
- Missing auth is an explicit risk, not an assumption.
- Local compatibility requirements are recorded.

#### Validation commands

```bash
Static route/security review, threat model, and owner sign-off.
```

#### Completion evidence

Not completed.

---

### `SEC-002` Add route authorization boundaries

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** SEC-001, TEST-008
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SEC-002: Add route authorization boundaries

#### Acceptance criteria

- Unauthorized reads/writes receive stable safe responses.
- Admin migration is not publicly callable.
- Local/test bypass is explicit and unavailable in production.

#### Validation commands

```bash
Auth unit/integration, route matrix, negative tests, security audit, and regression.
```

#### Completion evidence

Not completed.

---

### `SEC-003` Correct secret handling and tracked token risk

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** SAFE-005, OWN-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SEC-003: Correct secret handling and tracked token risk

#### Acceptance criteria

- No token/password/secret is tracked or bundled.
- Runtime auth state uses approved secret storage.
- Rotation evidence is recorded without values.

#### Validation commands

```bash
Secret scan, bundle scan, auth tests, Git status, and security review.
```

#### Completion evidence

Not completed.

---

### `SEC-004` Validate environment schema at boundaries

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SEC-004: Validate environment schema at boundaries

#### Acceptance criteria

- Invalid values fail clearly before writes.
- Optional integrations are explicit.
- Diagnostics reveal presence/status only, not values.

#### Validation commands

```bash
Config unit/startup tests, secret scan, and regression.
```

#### Completion evidence

Not completed.

---

### `SEC-005` Isolate application-specific environment requirements

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** SEC-004, OWN-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SEC-005: Isolate application-specific environment requirements

#### Acceptance criteria

- App startup requirements are isolated and testable.
- Missing Sales/Shiprocket config does not break unrelated local flows unless policy says so.
- No frontend bundle receives secrets.

#### Validation commands

```bash
Environment matrix, startup, bundle, route, and regression tests.
```

#### Completion evidence

Not completed.

---

### `SEC-006` Sanitize sensitive logs and diagnostics

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** SEC-003, OWN-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SEC-006: Sanitize sensitive logs and diagnostics

#### Acceptance criteria

- Secret and customer fields cannot appear in logs/errors.
- Diagnostics retain actionable status only.
- Redaction is tested against nested payloads.

#### Validation commands

```bash
Redaction unit tests, route tests, secret scan, manual log review, and regression.
```

#### Completion evidence

Not completed.

---

### `SEC-007` Review CORS and CSRF protections

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** SEC-001, BE-005
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SEC-007: Review CORS and CSRF protections

#### Acceptance criteria

- Allowed origins are explicit.
- Cross-site writes are rejected under the chosen auth model.
- Local development remains deliberate and bounded.

#### Validation commands

```bash
Middleware integration, browser security, preflight, negative write, and regression tests.
```

#### Completion evidence

Not completed.

---

### `SEC-008` Sanitize API errors and validate input

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** BE-008, SEC-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SEC-008: Sanitize API errors and validate input

#### Acceptance criteria

- Invalid boundary input returns deterministic 4xx.
- Errors contain no provider/db internals.
- Upload and CSV constraints are enforced.

#### Validation commands

```bash
Negative route tests, fuzz/boundary cases, security review, and regression.
```

#### Completion evidence

Not completed.

---

### `SEC-009` Audit dependencies, rotation, and future Meta bundle exposure

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** SEC-003, SEC-004
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task SEC-009: Audit dependencies, rotation, and future Meta bundle exposure

#### Acceptance criteria

- High-risk dependencies have disposition.
- Rotation steps are documented.
- Client bundle contains no backend secret names/values.

#### Validation commands

```bash
Dependency audit, secret/bundle scan, security review, and regression.
```

#### Completion evidence

Not completed.

---

### `DOC-001` Update README to current architecture

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** OWN-001, BE-005, FE-003
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DOC-001: Update README to current architecture

#### Acceptance criteria

- No nonexistent `.env.example` or stale tree is claimed.
- All executable apps and Meta documentation-only state are accurate.
- Commands identify destructive prerequisites.

#### Validation commands

```bash
Link/path checks, command inventory, documentation review, and clean checkout read.
```

#### Completion evidence

Not completed.

---

### `DOC-002` Create a real `.env.example`

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** SEC-004, SEC-005
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DOC-002: Create a real `.env.example`

#### Acceptance criteria

- Every required current variable is represented.
- No secret/customer value appears.
- App-specific optionality is clear.

#### Validation commands

```bash
Env-name diff, secret scan, startup matrix, and documentation review.
```

#### Completion evidence

Not completed.

---

### `DOC-003` Create application map

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** OWN-001, OWN-002, OWN-003, OWN-004, OWN-005, OWN-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DOC-003: Create application map

#### Acceptance criteria

- Every current application/system appears once.
- Meta is clearly documentation-only.
- Legacy Delivery Resolution is not silently treated as a current app.

#### Validation commands

```bash
Path/link checks, source search, and owner review.
```

#### Completion evidence

Not completed.

---

### `DOC-004` Create route map

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-007, BE-005, FE-003
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DOC-004: Create route map

#### Acceptance criteria

- Every current route is listed.
- Method/path/owner match source.
- Future route validation can detect drift.

#### Validation commands

```bash
Static route scan, API client diff, route tests, and documentation review.
```

#### Completion evidence

Not completed.

---

### `DOC-005` Create data ownership documentation

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-008, DATA-002
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DOC-005: Create data ownership documentation

#### Acceptance criteria

- All Section 7 stores are documented without records.
- No owner is inferred without evidence.
- Backup/retention rules are actionable.

#### Validation commands

```bash
Path/schema review, link checks, and data-owner sign-off.
```

#### Completion evidence

Not completed.

---

### `DOC-006` Create integration documentation

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** INT-001, INT-002, INT-003, INT-004, INT-005, INT-006, INT-007
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DOC-006: Create integration documentation

#### Acceptance criteria

- Every current integration has one documented owner.
- No secret values appear.
- Write operations list safety/rollback requirements.

#### Validation commands

```bash
Source/docs diff, mock contract references, secret scan, and owner review.
```

#### Completion evidence

Not completed.

---

### `DOC-007` Create local development guide

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** OPS-002, SEC-005
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DOC-007: Create local development guide

#### Acceptance criteria

- A new operator can run tests without live credentials.
- Destructive commands are clearly marked.
- Meta is not described as runnable.

#### Validation commands

```bash
Command/path checks, clean checkout read, and owner review.
```

#### Completion evidence

Not completed.

---

### `DOC-008` Create production startup guide

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OPS-002, OPS-003, SEC-001
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DOC-008: Create production startup guide

#### Acceptance criteria

- Runbook has abort/rollback gates.
- Startup does not hide migrations/provider failures.
- No secret values are present.

#### Validation commands

```bash
Dry-run/read-only checklist, path/link checks, and operator sign-off.
```

#### Completion evidence

Not completed.

---

### `DOC-009` Create backup and restore guide

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** SAFE-007, DATA-012
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DOC-009: Create backup and restore guide

#### Acceptance criteria

- Independent operator can restore each backup class.
- Secrets remain excluded from examples.
- Guide names the single ledger.

#### Validation commands

```bash
Restore rehearsal reference, command review, and owner sign-off.
```

#### Completion evidence

Not completed.

---

### `DOC-010` Create migration and deprecation policy

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** BE-010, DATA-008, CLEAN-001
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DOC-010: Create migration and deprecation policy

#### Acceptance criteria

- No deletion task can become READY without ownership/tests/backup.
- Compatibility and rollback requirements are explicit.

#### Validation commands

```bash
Policy review, task dependency audit, and owner sign-off.
```

#### Completion evidence

Not completed.

---

### `DOC-011` Create ADRs and separate Shopify theme context

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** OWN-001
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task DOC-011: Create ADRs and separate Shopify theme context

#### Acceptance criteria

- No final decision is fabricated.
- Theme changes are not listed as this repo architecture work.
- ADRs link task IDs and evidence.

#### Validation commands

```bash
Path/link checks, decision review, and documentation audit.
```

#### Completion evidence

Not completed.

---

### `CLEAN-001` Classify and resolve legacy Delivery Resolution files

**Severity:** HIGH
**Status:** BLOCKED
**Dependencies:** OWN-003, TEST-004, TEST-005, SAFE-003
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task CLEAN-001: Classify and resolve legacy Delivery Resolution files

#### Acceptance criteria

- Every file has an approved disposition.
- Current Order Mapping behavior remains green.
- No legacy data is orphaned.

#### Validation commands

```bash
Static callers, synthetic data mapping, route regression, database integrity, and owner sign-off.
```

#### Completion evidence

Not completed.

---

### `CLEAN-002` Resolve duplicate database artifacts

**Severity:** CRITICAL
**Status:** BLOCKED
**Dependencies:** DATA-001, DATA-002, SAFE-007
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task CLEAN-002: Resolve duplicate database artifacts

#### Acceptance criteria

- Exactly one canonical active path is documented.
- Any archive is recoverable and excluded from runtime.
- No records are lost.

#### Validation commands

```bash
SQLite integrity, startup, migration, restore, Git status, and regression checks.
```

#### Completion evidence

Not completed.

---

### `CLEAN-003` Resolve duplicate route handlers

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** BE-011, TEST-003
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task CLEAN-003: Resolve duplicate route handlers

#### Acceptance criteria

- One method/path handler remains.
- Alias and v2 tests pass.
- No behavior is silently lost.

#### Validation commands

```bash
Static duplicate scan, route/mock Shopify tests, regression gate.
```

#### Completion evidence

Not completed.

---

### `CLEAN-004` Classify dead components and disabled placeholders

**Severity:** LOW
**Status:** NOT_STARTED
**Dependencies:** FE-011, OWN-001
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task CLEAN-004: Classify dead components and disabled placeholders

#### Acceptance criteria

- No executable feature is removed by label assumption.
- Disabled placeholders are accurately documented.

#### Validation commands

```bash
Static reachability, browser navigation, build, accessibility, and regression.
```

#### Completion evidence

Not completed.

---

### `CLEAN-005` Remove or isolate Graphify generated clutter

**Severity:** LOW
**Status:** NOT_STARTED
**Dependencies:** OPS-005, DATA-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task CLEAN-005: Remove or isolate Graphify generated clutter

#### Acceptance criteria

- Graphify can regenerate required artifacts.
- No architecture evidence is lost.
- Git cleanliness improves without changing app source.

#### Validation commands

```bash
Graphify/read-only report comparison, Git status, clean checkout, and docs checks.
```

#### Completion evidence

Not completed.

---

### `CLEAN-006` Remove or isolate Playwright and Tokensave artifacts

**Severity:** LOW
**Status:** NOT_STARTED
**Dependencies:** OPS-006, OPS-007, DATA-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task CLEAN-006: Remove or isolate Playwright and Tokensave artifacts

#### Acceptance criteria

- Reusable tests remain available.
- Tool state is not mistaken for app data.
- Pre-existing dirty state is preserved or explicitly archived.

#### Validation commands

```bash
Git/ignore checks, test discovery, tool owner review, and clean checkout simulation.
```

#### Completion evidence

Not completed.

---

### `CLEAN-007` Remove or isolate test outputs

**Severity:** LOW
**Status:** NOT_STARTED
**Dependencies:** OPS-008, DATA-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task CLEAN-007: Remove or isolate test outputs

#### Acceptance criteria

- Test suite remains discoverable and reproducible.
- Generated output does not create source diffs.

#### Validation commands

```bash
Test discovery, clean checkout, Git/ignore, and regression checks.
```

#### Completion evidence

Not completed.

---

### `CLEAN-008` Resolve stale scripts and documentation

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** OPS-001, DOC-001
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task CLEAN-008: Resolve stale scripts and documentation

#### Acceptance criteria

- No documented command is broken.
- Historical Meta doc remains historical, not executable.
- Stale claims are removed or labeled.

#### Validation commands

```bash
Static link/script checks, docs review, and regression gate.
```

#### Completion evidence

Not completed.

---

### `CLEAN-009` Review unused dependencies, orphan uploads/exports, and old migration helpers

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** OWN-008, DATA-011, DOC-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task CLEAN-009: Review unused dependencies, orphan uploads/exports, and old migration helpers

#### Acceptance criteria

- Every removal has zero-caller and ownership evidence.
- Upload/export retention is explicit.
- Existing tests/build remain green.

#### Validation commands

```bash
Dependency audit, static caller scan, tests, build, and repository cleanliness.
```

#### Completion evidence

Not completed.

---

### `META-001` Define isolated Meta Ads boundary and feature flags

**Severity:** HIGH
**Status:** DEFERRED
**Dependencies:** FINAL-007, DOC-003
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task META-001: Define isolated Meta Ads boundary and feature flags

#### Acceptance criteria

- Meta remains non-executable until approved.
- Boundary does not import app business logic from current apps.
- Feature flag defaults off.

#### Validation commands

```bash
Architecture review, dependency scan, bundle/security checks, and plan update.
```

#### Completion evidence

Not completed.

---

### `META-002` Define Meta frontend route and navigation

**Severity:** HIGH
**Status:** DEFERRED
**Dependencies:** META-001, FE-003
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task META-002: Define Meta frontend route and navigation

#### Acceptance criteria

- Disabled/default-off behavior is safe.
- No current app route changes.
- Direct URL behavior is explicit.

#### Validation commands

```bash
Browser route, feature-flag, bundle, and regression tests.
```

#### Completion evidence

Not completed.

---

### `META-003` Define Meta backend router and transport

**Severity:** HIGH
**Status:** DEFERRED
**Dependencies:** META-001, INT-010, SEC-009
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task META-003: Define Meta backend router and transport

#### Acceptance criteria

- Meta code is isolated.
- Secrets remain backend-only.
- Write routes are unavailable by default.

#### Validation commands

```bash
Mocked Meta contract, auth/security, route, bundle, and regression tests.
```

#### Completion evidence

Not completed.

---

### `META-004` Rebuild read-only account, campaigns, ad sets, and ads

**Severity:** HIGH
**Status:** DEFERRED
**Dependencies:** META-001, META-002, META-003
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task META-004: Rebuild read-only account, campaigns, ad sets, and ads

#### Acceptance criteria

- Read-only flows pass with mocked provider.
- Write controls are absent/denied.
- Current apps regress zero.

#### Validation commands

```bash
Unit, route, browser, provider mock, bundle/security, and regression tests.
```

#### Completion evidence

Not completed.

---

### `META-005` Rebuild insights, audiences, and creatives read paths

**Severity:** HIGH
**Status:** DEFERRED
**Dependencies:** META-004
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task META-005: Rebuild insights, audiences, and creatives read paths

#### Acceptance criteria

- All read paths are tested and bounded.
- Sensitive payloads are sanitized.
- No write endpoint is reachable.

#### Validation commands

```bash
Mocked integration, route/browser, security, and regression tests.
```

#### Completion evidence

Not completed.

---

### `META-006` Define Meta persistence and authentication

**Severity:** CRITICAL
**Status:** DEFERRED
**Dependencies:** META-003, SEC-001, SEC-002, SEC-003, SEC-004, SEC-005
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task META-006: Define Meta persistence and authentication

#### Acceptance criteria

- Auth and data ownership are explicit.
- Tokens never enter frontend bundles/logs.
- Durable jobs have retry/cleanup/rollback policy.

#### Validation commands

```bash
Security, persistence, migration, route, and recovery tests.
```

#### Completion evidence

Not completed.

---

### `META-007` Add Meta tests, write safeguards, and observability

**Severity:** CRITICAL
**Status:** DEFERRED
**Dependencies:** META-004, META-005, META-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task META-007: Add Meta tests, write safeguards, and observability

#### Acceptance criteria

- No write path is enabled by default.
- Partial operations are recoverable/audited.
- Existing apps pass full regression.

#### Validation commands

```bash
Full Meta unit/integration/E2E, security, mock provider, audit, and rollback tests.
```

#### Completion evidence

Not completed.

---

### `META-008` Roll out Meta safely to production

**Severity:** HIGH
**Status:** DEFERRED
**Dependencies:** META-007, FINAL-007
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task META-008: Roll out Meta safely to production

#### Acceptance criteria

- Core architecture sign-off precedes Meta work.
- Rollback is tested.
- Write operations require a separate approval.

#### Validation commands

```bash
Release, security, route, data, observability, and regression checks.
```

#### Completion evidence

Not completed.

---

### `FINAL-001` Run full test and coverage gate

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** TEST-012
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FINAL-001: Run full test and coverage gate

#### Acceptance criteria

- All required suites pass.
- Coverage target is met or an explicit approved exception exists.
- No live production provider/database is used.

#### Validation commands

```bash
Unit, integration, E2E, route, migration, startup, security, and coverage checks.
```

#### Completion evidence

Not completed.

---

### `FINAL-002` Verify all routes and startup behavior

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** BE-005, FE-003, OPS-002, TEST-008
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FINAL-002: Verify all routes and startup behavior

#### Acceptance criteria

- All routes pass compatibility checks.
- Startup and health behavior match docs.
- No duplicate/unknown handler remains.

#### Validation commands

```bash
Route, startup, browser, static fallback, and regression tests.
```

#### Completion evidence

Not completed.

---

### `FINAL-003` Verify data integrity and restore evidence

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** DATA-009, DATA-012, SAFE-007
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FINAL-003: Verify data integrity and restore evidence

#### Acceptance criteria

- All owned stores pass integrity checks.
- Restore procedures pass.
- No unowned/unknown store is silently discarded.

#### Validation commands

```bash
SQLite/PostgreSQL integrity, migration, restore, runtime path, and data ownership checks.
```

#### Completion evidence

Not completed.

---

### `FINAL-004` Audit dependencies, environment, and security

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** SEC-001, SEC-002, SEC-003, SEC-004, SEC-005, SEC-006, SEC-007, SEC-008, SEC-009, INT-010
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FINAL-004: Audit dependencies, environment, and security

#### Acceptance criteria

- No critical security issue remains open.
- Secret/bundle scans pass.
- Env/provider contracts are documented and tested.

#### Validation commands

```bash
Security, dependency, environment, bundle, auth, route, and regression checks.
```

#### Completion evidence

Not completed.

---

### `FINAL-005` Verify repository cleanliness and documentation accuracy

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** CLEAN-001, CLEAN-002, CLEAN-003, CLEAN-004, CLEAN-005, CLEAN-006, CLEAN-007, CLEAN-008, CLEAN-009, DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007, DOC-008, DOC-009, DOC-010, DOC-011
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FINAL-005: Verify repository cleanliness and documentation accuracy

#### Acceptance criteria

- Only approved project changes are present.
- Sibling dirty state is unchanged and reported separately.
- Documentation links/current commands are accurate.

#### Validation commands

```bash
Git status/diff, link/script checks, clean checkout, and documentation review.
```

#### Completion evidence

Not completed.

---

### `FINAL-006` Refresh Graphify and Obsidian project context

**Severity:** MEDIUM
**Status:** NOT_STARTED
**Dependencies:** FINAL-005
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FINAL-006: Refresh Graphify and Obsidian project context

#### Acceptance criteria

- Graph and project notes match final code.
- Theme context remains separate.
- No secret/customer data is written.

#### Validation commands

```bash
Graph/notes comparison, project status, and documentation review.
```

#### Completion evidence

Not completed.

---

### `FINAL-007` Make the Meta Ads readiness decision

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** FINAL-001, FINAL-002, FINAL-003, FINAL-004, FINAL-005, FINAL-006
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FINAL-007: Make the Meta Ads readiness decision

#### Acceptance criteria

- Decision names exact evidence and owner.
- No Meta task becomes READY without the decision.
- Write capability remains separately gated.

#### Validation commands

```bash
Architecture/security/product review and plan count update.
```

#### Completion evidence

Not completed.

---

### `FINAL-008` Sign off architecture completion

**Severity:** CRITICAL
**Status:** NOT_STARTED
**Dependencies:** FINAL-001, FINAL-002, FINAL-003, FINAL-004, FINAL-005, FINAL-006, FINAL-007
**Last updated:** 2026-07-31T07:59:41.018462+00:00

#### Description

Remediation task FINAL-008: Sign off architecture completion

#### Acceptance criteria

- Every completed task has evidence/files/tests/risks/history.
- No critical open risk is hidden.
- Existing apps and routes are verified.

#### Validation commands

```bash
Full final suite, route/data/security/docs/cleanliness audits, and owner sign-off.
```

#### Completion evidence

Not completed.

---

## 12. Recent ledger history

| Timestamp | Task ID | Prev Status | New Status | Actor | Reason | Hash |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-31T08:01:57.073Z | TEST-002 | implemented | validated | shivam | Transition to validated | `6462928e` |
| 2026-07-31T08:01:56.981Z | TEST-002 | in_progress | implemented | shivam | Transition to implemented | `51a73eaf` |
| 2026-07-31T08:01:56.903Z | TEST-002 | completed | in_progress | shivam | Transition to in_progress | `f1487c6d` |
| 2026-07-31T08:01:56.720Z | TEST-002 | validated | completed | shivam | Self-contained test run | `26f53e82` |
| 2026-07-31T08:01:56.639Z | TEST-002 | implemented | validated | shivam | Transition to validated | `0b1254c4` |
| 2026-07-31T08:01:56.556Z | TEST-002 | in_progress | implemented | shivam | Transition to implemented | `778e749b` |
| 2026-07-31T08:01:56.473Z | TEST-002 | blocked | in_progress | shivam | Transition to in_progress | `b11b8f40` |
| 2026-07-31T08:01:56.244Z | TEST-002 | completed | blocked | shivam | Waiting for API credentials | `4b63facf` |
| 2026-07-31T08:01:56.093Z | TEST-002 | validated | completed | shivam | Verified implementation and tests pass | `48d73217` |
| 2026-07-31T08:01:56.015Z | TEST-002 | implemented | validated | shivam | Transition to validated | `b1378147` |
