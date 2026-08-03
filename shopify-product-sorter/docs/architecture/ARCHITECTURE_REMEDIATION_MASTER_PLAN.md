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
| Generated timestamp | `2026-08-03T12:33:53.118Z` |
| Current branch | `ops/architecture-ledger-hardening` |
| Local commit | `028ea82` |
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
| Not started | 39 |
| Ready | 1 |
| In progress | 0 |
| Implemented | 0 |
| Validation pending | 66 |
| Validated | 0 |
| Blocked | 3 |
| Deferred | 8 |
| Completed | 12 |
| Completion percentage | 9.3% |

## 4. Current execution focus

- Current phase: Phase 0 — Safety and recoverability.
- Next dependency-actionable ready tasks: `DOC-011`
- Dependency-safe validation-pending tasks: `TEST-003`, `TEST-004`, `TEST-005`, `TEST-006`, `TEST-007`
- Tasks awaiting prerequisites: `TEST-012`, `OWN-003`, `OWN-004`, `OWN-005`, `OWN-006`
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
| SAFE-006 | Create off-device backup copy | CRITICAL | COMPLETED | SAFE-003, SAFE-004, SAFE-005 | Imported from master plan. Previous raw status: NOT STARTED |
| SAFE-007 | Validate restoration instructions | CRITICAL | COMPLETED | SAFE-003, SAFE-004, SAFE-006 | Imported from master plan. Previous raw status: BLOCKED |
| SAFE-008 | Record database ownership uncertainties | HIGH | COMPLETED | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-001 | Protect sorter scoring and core logic | HIGH | COMPLETED | SAFE-002 | Imported from master plan. Previous raw status: COMPLETED |
| TEST-002 | Protect collection sync/apply/rollback | CRITICAL | COMPLETED | SAFE-003, SAFE-008 | Imported from master plan. Previous raw status: COMPLETED |
| TEST-003 | Protect collection reorder contracts | CRITICAL | VALIDATION_PENDING | SAFE-002 | Imported from master plan. Previous raw status: COMPLETED |
| TEST-004 | Protect Order Mapping sync/status lifecycle | HIGH | VALIDATION_PENDING | SAFE-004 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-005 | Protect CSV import and manual overrides | HIGH | VALIDATION_PENDING | SAFE-004 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-006 | Protect SKU media operations | HIGH | VALIDATION_PENDING | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-007 | Protect Sales Intelligence API contracts | HIGH | VALIDATION_PENDING | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-008 | Protect public route compatibility | CRITICAL | VALIDATION_PENDING | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-009 | Protect database migration safety | CRITICAL | VALIDATION_PENDING | SAFE-003, SAFE-004 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-010 | Protect startup and environment isolation | HIGH | VALIDATION_PENDING | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-011 | Protect frontend navigation | HIGH | VALIDATION_PENDING | SAFE-002 | Imported from master plan. Previous raw status: NOT STARTED |
| TEST-012 | Add integrated existing-app regression gate | HIGH | VALIDATION_PENDING | TEST-001, TEST-002, TEST-003, TEST-004, TEST-005, TEST-006, TEST-007, TEST-008, TEST-009, TEST-010, TEST-011 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-001 | Establish canonical application names and statuses | MEDIUM | COMPLETED | SAFE-008 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-002 | Define Product Sorter boundary | HIGH | VALIDATION_PENDING | OWN-001, TEST-001 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-003 | Classify Order Mapping versus legacy Delivery Resolution | CRITICAL | VALIDATION_PENDING | SAFE-008, TEST-004, TEST-005 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-004 | Define SKU Image Manager boundary | HIGH | VALIDATION_PENDING | OWN-001, TEST-006 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-005 | Define Actual Sales Intelligence boundary | HIGH | VALIDATION_PENDING | OWN-001, TEST-007 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-006 | Define System Diagnostics ownership | MEDIUM | VALIDATION_PENDING | OWN-001, TEST-010 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-007 | Approve route ownership matrix | CRITICAL | VALIDATION_PENDING | OWN-002, OWN-003, OWN-004, OWN-005, OWN-006, TEST-008 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-008 | Approve data ownership matrix | CRITICAL | VALIDATION_PENDING | SAFE-003, SAFE-004, SAFE-008 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-009 | Approve runtime file ownership | HIGH | VALIDATION_PENDING | OWN-002, OWN-003, OWN-004, OWN-005, OWN-006 | Imported from master plan. Previous raw status: NOT STARTED |
| OWN-010 | Approve integration and environment ownership | HIGH | VALIDATION_PENDING | OWN-002, OWN-003, OWN-004, OWN-005, OWN-006 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-001 | Split the generic API router | HIGH | VALIDATION_PENDING | TEST-012, OWN-007 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-002 | Create a Sorter router | HIGH | VALIDATION_PENDING | BE-001, OWN-002 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-003 | Create a SKU Image Manager router | HIGH | VALIDATION_PENDING | BE-001, OWN-004 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-004 | Create a Sales Intelligence router | HIGH | VALIDATION_PENDING | BE-001, OWN-005 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-005 | Preserve existing backend URLs with adapters | CRITICAL | VALIDATION_PENDING | BE-001, TEST-008 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-006 | Create application-owned service boundaries | HIGH | VALIDATION_PENDING | OWN-002, OWN-003, OWN-004, OWN-005, OWN-006 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-007 | Remove hidden cross-application imports | HIGH | VALIDATION_PENDING | BE-006 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-008 | Standardize validation and error normalization | HIGH | NOT_STARTED | BE-001, SEC-008 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-009 | Standardize structured logging | MEDIUM | VALIDATION_PENDING | OWN-006, BE-006 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-010 | Isolate startup migrations and side effects | CRITICAL | VALIDATION_PENDING | TEST-009, SAFE-004 | Imported from master plan. Previous raw status: NOT STARTED |
| BE-011 | Resolve duplicate collection reorder handlers | CRITICAL | VALIDATION_PENDING | TEST-003, BE-002, BE-005 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-001 | Extract the application shell | HIGH | VALIDATION_PENDING | TEST-011, OWN-001 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-002 | Extract navigation ownership | HIGH | VALIDATION_PENDING | FE-001, OWN-007 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-003 | Introduce explicit routing while preserving URLs | HIGH | VALIDATION_PENDING | TEST-008, FE-001 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-004 | Extract the Sorter feature | HIGH | VALIDATION_PENDING | FE-001, OWN-002, TEST-001, TEST-002 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-005 | Extract the SKU Image Manager feature | HIGH | VALIDATION_PENDING | FE-001, OWN-004, TEST-006 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-006 | Retain Order Mapping compatibility boundary | HIGH | VALIDATION_PENDING | FE-003, OWN-003 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-007 | Separate application state | HIGH | VALIDATION_PENDING | FE-004, FE-005, FE-006 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-008 | Separate frontend API clients | HIGH | VALIDATION_PENDING | FE-004, FE-005, FE-006, BE-005 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-009 | Isolate styles and remove global leakage | MEDIUM | VALIDATION_PENDING | FE-001, FE-004, FE-005, FE-006 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-010 | Add feature error and loading boundaries | HIGH | VALIDATION_PENDING | FE-003, FE-007 | Imported from master plan. Previous raw status: NOT STARTED |
| FE-011 | Add frontend regression tests and classify placeholders | HIGH | VALIDATION_PENDING | FE-002, FE-003, FE-004, FE-005, FE-006, FE-007, FE-008, FE-009, FE-010 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-001 | Inventory and contract Shopify clients | HIGH | VALIDATION_PENDING | OWN-010 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-002 | Define shared Shopify transport | HIGH | VALIDATION_PENDING | INT-001, TEST-003 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-003 | Keep Shopify business logic app-owned | HIGH | VALIDATION_PENDING | INT-002, OWN-002, OWN-003, OWN-004, OWN-005 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-004 | Inventory and contract Shiprocket clients | HIGH | VALIDATION_PENDING | OWN-010, TEST-004 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-005 | Define shared Shiprocket transport | HIGH | VALIDATION_PENDING | INT-004 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-006 | Standardize integration authentication and env ownership | CRITICAL | NOT_STARTED | SEC-003, SEC-004, INT-001, INT-004 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-007 | Standardize retries, rate limits, and errors | HIGH | VALIDATION_PENDING | INT-002, INT-005 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-008 | Add deterministic integration mocks | HIGH | VALIDATION_PENDING | INT-002, INT-005, TEST-012 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-009 | Remove duplicate clients after usage proof | HIGH | VALIDATION_PENDING | INT-003, INT-007, INT-008 | Imported from master plan. Previous raw status: NOT STARTED |
| INT-010 | Verify provider contracts and API-version compatibility | HIGH | VALIDATION_PENDING | INT-008, BE-005 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-001 | Resolve ambiguous SQLite database paths | CRITICAL | BLOCKED | SAFE-003, OWN-008 | Imported from master plan. Previous raw status: BLOCKED |
| DATA-002 | Document SQLite table ownership | CRITICAL | VALIDATION_PENDING | OWN-003, OWN-008 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-003 | Separate Sorter runtime data | HIGH | NOT_STARTED | DATA-001, OWN-002, SAFE-003 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-004 | Separate SKU audit data | HIGH | VALIDATION_PENDING | OWN-004, OWN-009 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-005 | Separate Sales Intelligence caches | HIGH | VALIDATION_PENDING | OWN-005, OWN-009 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-006 | Isolate Order Mapping PostgreSQL/migration state | CRITICAL | VALIDATION_PENDING | SAFE-004, OWN-003, BE-010 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-007 | Make runtime paths configurable | HIGH | NOT_STARTED | OWN-009, SEC-004 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-008 | Add safe data migration tools | CRITICAL | NOT_STARTED | DATA-001, DATA-002, DATA-003, DATA-004, DATA-005, DATA-006, DATA-007, SAFE-004 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-009 | Add data rollback support | CRITICAL | NOT_STARTED | DATA-008, SAFE-007 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-010 | Correct ignore rules and generated-file tracking | HIGH | NOT_STARTED | DATA-001, DATA-002, DATA-003, DATA-004, DATA-005, DATA-006, DATA-007, OPS-005, OPS-006, OPS-007, OPS-008 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-011 | Define retention for caches, audits, logs, uploads, exports | MEDIUM | NOT_STARTED | DATA-003, DATA-004, DATA-005, DATA-006, DATA-007 | Imported from master plan. Previous raw status: NOT STARTED |
| DATA-012 | Validate PostgreSQL backup and restore process | CRITICAL | VALIDATION_PENDING | SAFE-004, SAFE-007, DATA-006 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-001 | Fix or retire obsolete `scripts/dev.mjs` | MEDIUM | VALIDATION_PENDING | TEST-010, OWN-001 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-002 | Standardize startup commands | MEDIUM | VALIDATION_PENDING | OPS-001, BE-010 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-003 | Standardize health checks | HIGH | VALIDATION_PENDING | BE-005, OWN-006 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-004 | Standardize diagnostics and safe observability | MEDIUM | VALIDATION_PENDING | OWN-006, BE-009, SEC-006 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-005 | Review and isolate Graphify artifacts | MEDIUM | VALIDATION_PENDING | OWN-009 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-006 | Review and isolate Tokensave runtime files | HIGH | VALIDATION_PENDING | OWN-009, SEC-003 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-007 | Review Playwright artifacts | LOW | VALIDATION_PENDING | OWN-009 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-008 | Review test outputs and cache artifacts | LOW | VALIDATION_PENDING | OWN-009 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-009 | Add safe backup, architecture-validation, and cleanliness commands | MEDIUM | NOT_STARTED | SAFE-007, DATA-010 | Imported from master plan. Previous raw status: NOT STARTED |
| OPS-ARCH-001 | OPS-ARCH-001 | MEDIUM | COMPLETED | None | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-001 | Assess authentication boundary | CRITICAL | VALIDATION_PENDING | OWN-007, OWN-010 | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-002 | Add route authorization boundaries | CRITICAL | VALIDATION_PENDING | SEC-001, TEST-008 | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-003 | Correct secret handling and tracked token risk | CRITICAL | VALIDATION_PENDING | SAFE-005, OWN-010 | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-004 | Validate environment schema at boundaries | HIGH | NOT_STARTED | OWN-010 | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-005 | Isolate application-specific environment requirements | HIGH | NOT_STARTED | SEC-004, OWN-010 | Imported from master plan. Previous raw status: NOT STARTED |
| SEC-006 | Sanitize sensitive logs and diagnostics | CRITICAL | VALIDATION_PENDING | SEC-003, OWN-006 | Imported from master plan. Previous raw status: NOT STARTED |
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
| DOC-011 | Create ADRs and separate Shopify theme context | MEDIUM | READY | OWN-001 | Imported from master plan. Previous raw status: NOT STARTED |
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
**Last updated:** 2026-08-02T00:06:27.196Z

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

Verified recoverable Git baseline ref c4783f33677530108f8c64acbaf4deb04bcc9097 on origin/main., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for SAFE-001., Fresh SAFE-001 validation: baseline 4956310183cf53043b0c3a27b04869833cf53654 is readable and a direct ancestor of remote origin/main at c4783f33677530108f8c64acbaf4deb04bcc9097; git object, ancestry, connectivity, remote-ref, and isolated restore evidence passed; all 34 protected dirty-path hashes matched and seven deleted-path sentinels remained absent. No secrets or encryption material required., SAFE-001 completed after clean committed-state validation at 8fe7ea1208b774ab3272a990e396b3264927018f: baseline 4956310183cf53043b0c3a27b04869833cf53654 is recoverable through remote origin/main at c4783f33677530108f8c64acbaf4deb04bcc9097; isolated restore evidence, 77/77 architecture tests, 13/13 regression gate, offline verify, and dirty-path preservation passed.

---

### `SAFE-002` Capture working-tree and baseline manifest

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** None
**Last updated:** 2026-08-03T07:58:29.272Z

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

Captured external baseline manifest at /tmp/shopify-product-sorter-architecture-before.d5tNpx.manifest., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for SAFE-002., R1-A verification: the preserved SAFE-002 baseline manifest at /home/shivam/.codex/artifacts/shopify-product-sorter/2026-07-30T21-16-08+0530-safe-007-restore-rehearsal/git/2026-07-30T12-28-53+0530-safe-002-baseline.manifest explicitly supersedes /tmp/shopify-product-sorter-architecture-before.d5tNpx.manifest and satisfies the plan acceptance checks recorded in the manifest validation block., R1-A restore: Group A evidence verified from the preserved baseline manifest copy referenced above; no application files changed., R1-A finalization evidence metadata: implementation and remote-containment checks recorded; clean validation was performed from reconciliation baseline 24757badcbd9e75a7372bcd698be43810fd44782; artifact-specific safe checks recorded without exposing secrets or records., R1-A completion-record finalization: Commit 1 00a91ff6553050f9a4f2a0cfdc3ec36005a9a074 is the remotely contained completion-record baseline; no task status changed.

---

### `SAFE-003` Confirm SQLite backups

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** SAFE-002
**Last updated:** 2026-08-03T07:58:29.272Z

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

SQLite backup copy in ~/.codex/artifacts/shopify-product-sorter/2026-07-30T12-33-40+0530-safe-003-sqlite/ with verified integrity., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for SAFE-003., R1-A verification: the SQLite backup artifact at /home/shivam/.codex/artifacts/shopify-product-sorter/2026-07-30T12-33-40+0530-safe-003-sqlite contains labeled manifests plus integrity and restore-open logs for both captured SQLite paths, matching the plan evidence., R1-A restore: SAFE-003 external backup evidence verified on disk; dependencies satisfied by restored SAFE-002., R1-A finalization evidence metadata: implementation and remote-containment checks recorded; clean validation was performed from reconciliation baseline 24757badcbd9e75a7372bcd698be43810fd44782; artifact-specific safe checks recorded without exposing secrets or records., R1-A completion-record finalization: Commit 1 00a91ff6553050f9a4f2a0cfdc3ec36005a9a074 is the remotely contained completion-record baseline; no task status changed.

---

### `SAFE-004` Complete PostgreSQL/Neon backup

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** SAFE-002
**Last updated:** 2026-08-03T07:58:29.272Z

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

PostgreSQL custom & schema dump in ~/.codex/artifacts/shopify-product-sorter/2026-07-30T12-40-39+0530-safe-004-postgres/ with verified restore., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for SAFE-004., R1-A verification: the PostgreSQL backup artifact at /home/shivam/.codex/artifacts/shopify-product-sorter/2026-07-30T12-40-39+0530-safe-004-postgres contains the custom dump, schema dump, restore logs, and manifest metadata cited by the plan evidence., R1-A restore: SAFE-004 backup and isolated restore evidence verified on disk; dependencies satisfied by restored SAFE-002., R1-A finalization evidence metadata: implementation and remote-containment checks recorded; clean validation was performed from reconciliation baseline 24757badcbd9e75a7372bcd698be43810fd44782; artifact-specific safe checks recorded without exposing secrets or records., R1-A completion-record finalization: Commit 1 00a91ff6553050f9a4f2a0cfdc3ec36005a9a074 is the remotely contained completion-record baseline; no task status changed.

---

### `SAFE-005` Encrypt secret archive

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** SAFE-002
**Last updated:** 2026-08-03T07:58:29.272Z

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

Encrypted secret archive in ~/.codex/artifacts/shopify-product-sorter/2026-07-30T12-50-43+0530-safe-005-secrets/., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for SAFE-005., R1-A verification: the encrypted secret archive artifact at /home/shivam/.codex/artifacts/shopify-product-sorter/2026-07-30T12-50-43+0530-safe-005-secrets contains the encrypted archive, decrypt verification log, permissions log, and rotation runbook cited by the plan evidence., R1-A restore: SAFE-005 encrypted archive and rotation evidence verified on disk; dependencies satisfied by restored SAFE-002., R1-A finalization evidence metadata: implementation and remote-containment checks recorded; clean validation was performed from reconciliation baseline 24757badcbd9e75a7372bcd698be43810fd44782; artifact-specific safe checks recorded without exposing secrets or records., R1-A completion-record finalization: Commit 1 00a91ff6553050f9a4f2a0cfdc3ec36005a9a074 is the remotely contained completion-record baseline; no task status changed.

---

### `SAFE-006` Create off-device backup copy

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** SAFE-003, SAFE-004, SAFE-005
**Last updated:** 2026-08-03T07:58:29.272Z

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

Created off-device backup bundle and manifest at ~/.codex/artifacts/shopify-product-sorter/2026-07-31T10-30-00+0530-safe-006-offdevice/ (SHA-256: 97086db331f19a3b53ea6e250e7a382ea72d3c0740827487d905cce25f3de81d), Verified off-device bundle SHA-256 hash (97086db331f19a3b53ea6e250e7a382ea72d3c0740827487d905cce25f3de81d) and confirmed zero secret leaks., Commit SHA: e2bb549c2ec7e7b2291a09750932c80b0ab547e3, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-003, SAFE-004, SAFE-005., R1-A verification: the off-device bundle at /home/shivam/.codex/artifacts/shopify-product-sorter/2026-07-31T10-30-00+0530-safe-006-offdevice is present, its verification JSON records all three backup classes as verified, hash_verified=true, and the cited implementation commit e2bb549c2ec7e7b2291a09750932c80b0ab547e3 is contained on origin/ops/architecture-ledger-hardening., R1-A restore: SAFE-006 off-device bundle, hash evidence, and remote-contained commit verification passed after restoring SAFE-003, SAFE-004, and SAFE-005., R1-A finalization evidence metadata: implementation and remote-containment checks recorded; clean validation was performed from reconciliation baseline 24757badcbd9e75a7372bcd698be43810fd44782; artifact-specific safe checks recorded without exposing secrets or records., R1-A completion-record finalization: Commit 1 00a91ff6553050f9a4f2a0cfdc3ec36005a9a074 is the remotely contained completion-record baseline; no task status changed.

---

### `SAFE-007` Validate restoration instructions

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** SAFE-003, SAFE-004, SAFE-006
**Last updated:** 2026-08-03T07:58:29.272Z

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

Restoration rehearsal bundle in ~/.codex/artifacts/shopify-product-sorter/2026-07-30T21-16-08+0530-safe-007-restore-rehearsal/., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for SAFE-007., R1-A verification: the rehearsal bundle at /home/shivam/.codex/artifacts/shopify-product-sorter/2026-07-30T21-16-08+0530-safe-007-restore-rehearsal contains SQLite, PostgreSQL, runtime, git-restore, and off-device checksum logs plus restore-operator-sequence.txt, matching the plan evidence and showing an independent restore rehearsal without production writes., R1-A restore: SAFE-007 rehearsal bundle verified on disk after restoring SAFE-003, SAFE-004, and SAFE-006., R1-A finalization evidence metadata: implementation and remote-containment checks recorded; clean validation was performed from reconciliation baseline 24757badcbd9e75a7372bcd698be43810fd44782; artifact-specific safe checks recorded without exposing secrets or records., R1-A completion-record finalization: Commit 1 00a91ff6553050f9a4f2a0cfdc3ec36005a9a074 is the remotely contained completion-record baseline; no task status changed.

---

### `SAFE-008` Record database ownership uncertainties

**Severity:** HIGH
**Status:** COMPLETED
**Dependencies:** SAFE-002
**Last updated:** 2026-08-03T07:58:29.272Z

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

Database ownership register docs/architecture/DATABASE_OWNERSHIP_REGISTER.md created., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for SAFE-008., R1-A verification: docs/architecture/DATABASE_OWNERSHIP_REGISTER.md exists on disk and records provisional owners plus explicit unknown states that block deletion, matching the plan evidence and acceptance criteria., R1-A restore: SAFE-008 ownership-register evidence verified on disk; dependencies satisfied by restored SAFE-002., R1-A finalization evidence metadata: implementation and remote-containment checks recorded; clean validation was performed from reconciliation baseline 24757badcbd9e75a7372bcd698be43810fd44782; artifact-specific safe checks recorded without exposing secrets or records., R1-A completion-record finalization: Commit 1 00a91ff6553050f9a4f2a0cfdc3ec36005a9a074 is the remotely contained completion-record baseline; no task status changed.

---

### `TEST-001` Protect sorter scoring and core logic

**Severity:** HIGH
**Status:** COMPLETED
**Dependencies:** SAFE-002
**Last updated:** 2026-08-03T12:33:53.118Z

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

Sorter scoring test suite server/src/services/sorter.test.js (11 pass)., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for TEST-001., TEST foundation recovery: clean task-specific validation passed at reconciliation baseline de60749ede00db385016f6428144f440d72566ca; this baseline is not represented as the original test implementation commit., Historical containing commit 4939e06a53b285829d2a4f1d9665e88d05ffd910 is locally available and contained by origin/ops/architecture-ledger-hardening., TEST foundation completion-record finalization: recovery commit 251cda92d76309159da69ceca4f363d0b9432fc8 is the actual ledger completion-record commit; task status is unchanged., Post-push verification: recovery completion-record commit 251cda92d76309159da69ceca4f363d0b9432fc8 is contained by origin/ops/architecture-ledger-hardening; task status is unchanged.

---

### `TEST-002` Protect collection sync/apply/rollback

**Severity:** CRITICAL
**Status:** COMPLETED
**Dependencies:** SAFE-003, SAFE-008
**Last updated:** 2026-08-03T12:33:53.118Z

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

Collection sync test suite server/src/services/collectionSyncApplyRollback.test.js (5 pass)., Commit SHA: 8741148fc7fe83b9926c77e227c0b45359ef2028, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-003, SAFE-008., TEST foundation recovery: clean task-specific validation passed at reconciliation baseline de60749ede00db385016f6428144f440d72566ca; this baseline is not represented as the original test implementation commit., Historical containing commit f3690e88bead0c46576d1e8002e50804b22ade42 is locally available and contained by origin/ops/architecture-ledger-hardening., TEST foundation completion-record finalization: recovery commit 251cda92d76309159da69ceca4f363d0b9432fc8 is the actual ledger completion-record commit; task status is unchanged., Post-push verification: recovery completion-record commit 251cda92d76309159da69ceca4f363d0b9432fc8 is contained by origin/ops/architecture-ledger-hardening; task status is unchanged.

---

### `TEST-003` Protect collection reorder contracts

**Severity:** CRITICAL
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-002
**Last updated:** 2026-08-01T22:10:15.195Z

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

Collection reorder contract test suite server/src/services/collectionReorderContracts.test.js (4 pass)., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for TEST-003.

---

### `TEST-004` Protect Order Mapping sync/status lifecycle

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-004
**Last updated:** 2026-08-01T22:10:15.197Z

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

Starting task TEST-004: Protect Order Mapping sync/status lifecycle, Added unit test assertions in server/src/services/orderMapping.test.js for terminal status protection, manual lock behavior, forced refresh (force: true), and MANUAL source status overrides., Ran node --test src/services/orderMapping.test.js in server/. All 7 test cases passed (terminal downgrade protection, manual lock checks, forced refresh, MANUAL source override)., Commit SHA: 634ad1afdd9e400e923bb37740b78a758a4a6a2e, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-004.

---

### `TEST-005` Protect CSV import and manual overrides

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-004
**Last updated:** 2026-08-01T22:10:15.199Z

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

Starting implementation of TEST-005: Protect CSV import and manual overrides, Added unit test assertions in server/src/services/orderMapping.test.js for invalid CSV formats (empty CSV, unmatched quotes, missing required columns) and CSV column extraction., Ran node --test src/services/orderMapping.test.js in server/. All 8 tests passed including CSV import validation errors and manual lock semantics., Commit SHA: 7890a0ef38dd5dec9454d0a583edafc3977c2a86, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-004.

---

### `TEST-006` Protect SKU media operations

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-002
**Last updated:** 2026-08-01T22:10:15.201Z

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

Starting implementation of TEST-006: Protect SKU media operations, Created unit test suite server/src/services/shopifyMediaService.test.js covering SKU media scopes, duplicate product deduplication without deletion, confirm bulk deletion filtering, and audit log path verification., Ran node --test src/services/shopifyMediaService.test.js in server/. All 4 tests passed successfully., Commit SHA: 6476c331d12e763ee13d38d8cf38265683e58cdc, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-002.

---

### `TEST-007` Protect Sales Intelligence API contracts

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-002
**Last updated:** 2026-08-01T22:10:15.203Z

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

Starting implementation of TEST-007: Protect Sales Intelligence API contracts, Created test suite server/src/services/actualSalesService.test.js covering Sales Intelligence API exports, analytics slices, and response formatting., Ran node --test src/services/actualSalesService.test.js in server/. All 3 tests passed successfully., Commit SHA: 360d53ccd88e248acc4ecf48c5a13e9d389c10fd, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-002.

---

### `TEST-008` Protect public route compatibility

**Severity:** CRITICAL
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-002
**Last updated:** 2026-08-01T22:10:15.205Z

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

Starting implementation of TEST-008: Protect public route compatibility, Created test suite server/src/app.test.js asserting public route contracts, HTTP 302 redirection for /delivery-resolution to orderMappingRoute, and route payload structure without requiring real provider credentials., Ran node --test src/app.test.js in server/. All 4 tests passed successfully including HTTP 302 redirection for /delivery-resolution and order mapping API route compatibility., Commit SHA: f42888e6b976829d84acc45ac5c9a0ecfa7671b7, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-002.

---

### `TEST-009` Protect database migration safety

**Severity:** CRITICAL
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-003, SAFE-004
**Last updated:** 2026-08-01T22:10:15.207Z

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

Starting implementation of TEST-009: Protect database migration safety, Created test suite server/src/services/orderMappingMigrations.test.js asserting migration file loading, sorting, schema placeholder filling, and migration idempotency parameters., Ran node --test src/services/orderMappingMigrations.test.js in server/. All 3 tests passed successfully., Commit SHA: 86cfc4d239e91662a9ca93b410a7d51935545195, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-003, SAFE-004.

---

### `TEST-010` Protect startup and environment isolation

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-002
**Last updated:** 2026-08-01T22:10:15.209Z

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

Starting implementation of TEST-010: Protect startup and environment isolation, Created unit test suite server/src/config/env.test.js asserting environment variable parsing, default fallbacks, env file load reporting, and required Shopify credential validation., Ran node --test src/config/env.test.js in server/. All 3 tests passed successfully., Commit SHA: b23cb9a2f00b5e375777fad515c80198617ca3a4, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-002.

---

### `TEST-011` Protect frontend navigation

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-002
**Last updated:** 2026-08-01T22:10:15.211Z

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

Starting implementation of TEST-011: Protect frontend navigation, Added frontend navigation and status label formatting tests to client/src/api.test.js asserting reachability of all client API methods and view status display logic., Ran node --test src/api.test.js in client/. All 10 tests passed successfully., Commit SHA: df88049c65d9d79ecd2ff2eb7b80b535892426e5, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-002.

---

### `TEST-012` Add integrated existing-app regression gate

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** TEST-001, TEST-002, TEST-003, TEST-004, TEST-005, TEST-006, TEST-007, TEST-008, TEST-009, TEST-010, TEST-011
**Last updated:** 2026-08-01T22:10:15.213Z

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

--evidence Created scripts/regression-gate.mjs and npm run test:regression-gate command covering 9 test suites across all application route families and core services. Implemented production credential safeguard and saved machine-readable report to test-results/regression-gate-report.json, --evidence Validated via npm run test:regression-gate (9/9 suites passed, machine report verified at test-results/regression-gate-report.json), Commit SHA: 094e208a5b8104e03b82ad5ad23f8a47444987ac, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: TEST-001, TEST-002, TEST-003, TEST-004, TEST-005, TEST-006, TEST-007, TEST-008, TEST-009, TEST-010, TEST-011.

---

### `OWN-001` Establish canonical application names and statuses

**Severity:** MEDIUM
**Status:** COMPLETED
**Dependencies:** SAFE-008
**Last updated:** 2026-08-03T07:58:29.272Z

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

Canonical application names docs/architecture/CANONICAL_APPLICATION_NAMES_AND_STATUSES.md created., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for OWN-001., R1-A verification: docs/architecture/CANONICAL_APPLICATION_NAMES_AND_STATUSES.md exists on disk and documents canonical current surfaces, disabled placeholder labels as non-applications, and legacy aliases, matching the plan evidence and acceptance criteria., R1-A restore: OWN-001 canonical-name register verified on disk after restoring SAFE-008., R1-A finalization evidence metadata: implementation and remote-containment checks recorded; clean validation was performed from reconciliation baseline 24757badcbd9e75a7372bcd698be43810fd44782; artifact-specific safe checks recorded without exposing secrets or records., R1-A completion-record finalization: Commit 1 00a91ff6553050f9a4f2a0cfdc3ec36005a9a074 is the remotely contained completion-record baseline; no task status changed.

---

### `OWN-002` Define Product Sorter boundary

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-001, TEST-001
**Last updated:** 2026-08-01T22:10:15.217Z

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

Product sorter boundary docs/architecture/PRODUCT_SORTER_BOUNDARY_SPECIFICATION.md created., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for OWN-002.

---

### `OWN-003` Classify Order Mapping versus legacy Delivery Resolution

**Severity:** CRITICAL
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-008, TEST-004, TEST-005
**Last updated:** 2026-08-01T22:10:15.219Z

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

Starting OWN-003 classification work, Classified legacy symbols vs Order Mapping in docs/architecture/ORDER_MAPPING_CLASSIFICATION_REPORT.md, Validated via static call graph, orderMapping.test.js and orderMappingMigrations.test.js, Commit SHA: 77e237a2fc9b042546976255b522af9bce8381af, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-008, TEST-004, TEST-005.

---

### `OWN-004` Define SKU Image Manager boundary

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-001, TEST-006
**Last updated:** 2026-08-01T22:10:15.221Z

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

Defining SKU Image Manager boundary specification, Defined SKU Image Manager boundary specification in docs/architecture/SKU_IMAGE_MANAGER_BOUNDARY_SPECIFICATION.md, Validated via static imports, route matrix, and shopifyMediaService.test.js passing, Commit SHA: 43c636777b7e1e62947ee14f0cdc0b918f952445, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-001, TEST-006.

---

### `OWN-005` Define Actual Sales Intelligence boundary

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-001, TEST-007
**Last updated:** 2026-08-01T22:10:15.223Z

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

Defining Actual Sales Intelligence boundary specification, Defined Actual Sales Intelligence boundary specification in docs/architecture/ACTUAL_SALES_INTELLIGENCE_BOUNDARY_SPECIFICATION.md, Validated via static imports, route matrix, and actualSalesService.test.js passing, Commit SHA: 4eb661e4191baa1e20f8c2cf5ab85655b0906978, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-001, TEST-007.

---

### `OWN-006` Define System Diagnostics ownership

**Severity:** MEDIUM
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-001, TEST-010
**Last updated:** 2026-08-01T22:10:15.225Z

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

Defining System Diagnostics ownership specification, Defined System Diagnostics ownership specification in docs/architecture/SYSTEM_DIAGNOSTICS_BOUNDARY_SPECIFICATION.md, Validated via static route review, sensitive field audit, and data ownership distinction verified, Commit SHA: 25de38d76639b4d48e2cde564482bee7c278131f, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-001, TEST-010.

---

### `OWN-007` Approve route ownership matrix

**Severity:** CRITICAL
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-002, OWN-003, OWN-004, OWN-005, OWN-006, TEST-008
**Last updated:** 2026-08-01T22:10:15.227Z

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

Defining data store ownership boundaries, Defined complete route ownership matrix in docs/architecture/ROUTE_OWNERSHIP_MATRIX.md, Validated via static route scan of api.js and orderMapping.js; all 46 routes have single owner; 3 alias/legacy routes have deprecation paths, Commit SHA: c201983c0fc7cfd6b65a161d0eaebfb4b0ff169c, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-002, OWN-003, OWN-004, OWN-005, OWN-006, TEST-008.

---

### `OWN-008` Approve data ownership matrix

**Severity:** CRITICAL
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-003, SAFE-004, SAFE-008
**Last updated:** 2026-08-01T22:10:15.229Z

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

Approving data ownership matrix, Approved complete data ownership matrix in docs/architecture/DATA_OWNERSHIP_MATRIX.md, Validated via static schema review, file inventory, and owner assignments for all 11 SQLite tables, 9 PostgreSQL tables, 5 JSON caches, and 4 config files, Commit SHA: 87ff3ea1e36fb81e85e8da123e2a1256d022d330, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-003, SAFE-004, SAFE-008.

---

### `OWN-009` Approve runtime file ownership

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-002, OWN-003, OWN-004, OWN-005, OWN-006
**Last updated:** 2026-08-01T22:10:15.231Z

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

Defining shared Shopify transport boundary, Defined complete runtime file ownership matrix in docs/architecture/RUNTIME_FILE_OWNERSHIP_MATRIX.md, Validated via filesystem inventory, .gitignore review, and owner assignments for all runtime, build, cache, and external tool artifacts, Commit SHA: e370e61f093543a571ebe09449b577677e7861a2, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-002, OWN-003, OWN-004, OWN-005, OWN-006.

---

### `OWN-010` Approve integration and environment ownership

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-002, OWN-003, OWN-004, OWN-005, OWN-006
**Last updated:** 2026-08-01T22:10:15.233Z

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

Defining environment configuration ownership, Defined complete integration and environment ownership matrix in docs/architecture/INTEGRATION_ENVIRONMENT_OWNERSHIP.md, Validated via static dependency search, secret-name inventory, and integration-owner review, Commit SHA: 03a2c632d37d36e9b127840508b67af99e2c87aa, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-002, OWN-003, OWN-004, OWN-005, OWN-006.

---

### `BE-001` Split the generic API router

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** TEST-012, OWN-007
**Last updated:** 2026-08-01T22:10:15.235Z

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

--evidence Split api.js into dedicated domain routers: system.js, collections.js, salesIntelligence.js, skuMedia.js, composed via api.js while preserving all existing routes and contracts., --evidence All 9 regression gate suites passed including route contract tests in server/src/app.test.js and client/src/api.test.js., Commit SHA: e8c2b9f7cb43dde0ac66d20a11a5937f9f587163, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: TEST-012, OWN-007.

---

### `BE-002` Create a Sorter router

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** BE-001, OWN-002
**Last updated:** 2026-08-01T22:10:15.237Z

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

--evidence Created dedicated Sorter router module server/src/routes/sorter.js owning all sorter/reorder endpoints without SKU or Sales Intelligence imports., --evidence All sorter routes (/collections/generate, /collections/apply, /collections/reorder-all-v2, /collections/reorder-all, /collections/rollback) are owned by dedicated router server/src/routes/sorter.js without SKU or Sales Intelligence imports. All 9 regression gate test suites passed., Commit SHA: 19bdae536ce86c4bb395e581ffb3f58db62b924b, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: BE-001, OWN-002.

---

### `BE-003` Create a SKU Image Manager router

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** BE-001, OWN-004
**Last updated:** 2026-08-01T22:10:15.239Z

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

--evidence Extracted all SKU Image Manager endpoints (/sku-images/*) into dedicated router server/src/routes/skuMedia.js with multer upload limits, image validation, and error cleanup handlers. All 9 regression suites passed., --evidence Validated SKU routes contract, multer image file handling, non-image safety checks, and temporary upload cleanup. Passed regression gate test suite., Commit SHA: 641bf31046bc8f6f0f3bde8c8b487411225a6b8b, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: BE-001, OWN-004.

---

### `BE-004` Create a Sales Intelligence router

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** BE-001, OWN-005
**Last updated:** 2026-08-01T22:10:15.241Z

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

--evidence Extracted sales intelligence routes into server/src/routes/salesIntelligence.js and mounted in api.js., --evidence All 9 regression gate suites passed including Sales Intelligence API contracts test suite., Commit SHA: d9cdfb53ce79cdafd43b42d5b7c88b55d4e0325f, Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for BE-004.

---

### `BE-005` Preserve existing backend URLs with adapters

**Severity:** CRITICAL
**Status:** VALIDATION_PENDING
**Dependencies:** BE-001, TEST-008
**Last updated:** 2026-08-01T22:10:15.243Z

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

--evidence Verified backend URL structure and Express app routing contracts. Export default router added to api.js and all endpoints pass node --test server/src/app.test.js., --evidence All 9 regression gate test suites passed and route contract tests in server/src/app.test.js passed., Commit SHA: 8003f19e0f7c2d752bd228ef69ee2ddfec6e3377, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: BE-001, TEST-008.

---

### `BE-006` Create application-owned service boundaries

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-002, OWN-003, OWN-004, OWN-005, OWN-006
**Last updated:** 2026-08-01T22:10:15.245Z

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

Extracting Shopify GraphQL client, Defined complete service boundary matrix in docs/architecture/SERVICE_BOUNDARY_MATRIX.md, Validated via static dependency graph review, layer classification, and boundary direction rules, Commit SHA: 161a62bea3a3b38dbdbac592caf8ca9d96e6b564, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-002, OWN-003, OWN-004, OWN-005, OWN-006.

---

### `BE-007` Remove hidden cross-application imports

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** BE-006
**Last updated:** 2026-08-01T22:10:15.247Z

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

Defined cross-application import matrix in docs/architecture/CROSS_APPLICATION_IMPORT_MATRIX.md, Validated via static import scan; no cross-domain business logic imports found; all shared dependencies have contract tests, Commit SHA: c2beccc557ad69a49bf64cd1938ceab2b422edc1, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: BE-006.

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
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-006, BE-006
**Last updated:** 2026-08-01T22:10:15.249Z

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

Defined structured logging standard in docs/architecture/STRUCTURED_LOGGING_STANDARD.md, Validated via logger.js review, log consumer audit, and redaction rule verification, Commit SHA: de400fb687c88de9cc2adb1d40f2bdfe0b8e9f99, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-006, BE-006.

---

### `BE-010` Isolate startup migrations and side effects

**Severity:** CRITICAL
**Status:** VALIDATION_PENDING
**Dependencies:** TEST-009, SAFE-004
**Last updated:** 2026-08-01T22:10:15.251Z

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

Defined startup migration and side-effect boundary in docs/architecture/STARTUP_MIGRATION_BOUNDARY.md, Validated via index.js review, database.js migration audit, and side-effect isolation analysis, Commit SHA: b541301855c7e7b41f3d7647fb70fc873d8c9108, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: TEST-009, SAFE-004.

---

### `BE-011` Resolve duplicate collection reorder handlers

**Severity:** CRITICAL
**Status:** VALIDATION_PENDING
**Dependencies:** TEST-003, BE-002, BE-005
**Last updated:** 2026-08-01T22:10:15.253Z

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

--evidence Removed duplicate router.post('/collections/reorder-all') handler from server/src/routes/sorter.js. Preserved 307 redirect to /api/collections/reorder-all-v2., --evidence All 9 regression gate suites passed and added app unit test confirming POST /api/collections/reorder-all 307 redirect., Commit SHA: cde861527ee8a6ab1efe5008bf41f6067e5e82cd, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: TEST-003, BE-002, BE-005.

---

### `FE-001` Extract the application shell

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** TEST-011, OWN-001
**Last updated:** 2026-08-01T22:10:15.255Z

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

Defined application shell boundary in docs/architecture/APPLICATION_SHELL_BOUNDARY.md, Validated via App.jsx review, module registry audit, and business logic extraction mapping, Commit SHA: c1298ca3ec7f2d7c96ee99ce1db94210e8d7597d, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: TEST-011, OWN-001.

---

### `FE-002` Extract navigation ownership

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** FE-001, OWN-007
**Last updated:** 2026-08-01T22:10:15.257Z

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

Defined navigation ownership boundary in docs/architecture/NAVIGATION_OWNERSHIP_BOUNDARY.md, Validated via sidebar module audit, active state derivation review, and disabled label safety check, Commit SHA: 57a1713e33e398fe34b299f188d67a69da994874, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: FE-001, OWN-007.

---

### `FE-003` Introduce explicit routing while preserving URLs

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** TEST-008, FE-001
**Last updated:** 2026-08-01T22:10:15.259Z

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

Defined client routing boundary in docs/architecture/CLIENT_ROUTING_BOUNDARY.md, Validated via main.jsx routing review, server fallback audit, and URL preservation matrix, Commit SHA: 754db5d20d17a7da805828bdd73748c5d9b6da94, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: TEST-008, FE-001.

---

### `FE-004` Extract the Sorter feature

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** FE-001, OWN-002, TEST-001, TEST-002
**Last updated:** 2026-08-01T22:10:15.261Z

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

--evidence Sorter.jsx extracted from App.jsx. App.jsx imports and renders <Sorter sidebarBridge>. Vite build passes (34 modules). Regression gate 9/9 suites passed (24 tests). Sorter feature independently importable., --evidence npm run build: 34 modules transformed, built in 1.07s. npm run test:regression-gate: 9/9 suites, 24/24 tests passed. client/src/Sorter.jsx: 720 lines, independently importable. App.jsx: imports Sorter, renders <Sorter sidebarBridge={sorterSidebarBridge}>. Shared shell has no sorter-specific mutation logic. Existing actions and diagnostics pass regression tests., Commit SHA: beda37806619f919a99aa09ea9b4c39ec31b5820, Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for FE-004.

---

### `FE-005` Extract the SKU Image Manager feature

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** FE-001, OWN-004, TEST-006
**Last updated:** 2026-08-01T22:10:15.263Z

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

Defined SKU Image Manager extraction boundary in docs/architecture/SKU_IMAGE_MANAGER_EXTRACTION_BOUNDARY.md, Validated via SkuImageManager.jsx import audit, shell bridge review, and state ownership verification, Commit SHA: d564698e2c0cd398bf05056e64f9b947e6995c91, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: FE-001, OWN-004, TEST-006.

---

### `FE-006` Retain Order Mapping compatibility boundary

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** FE-003, OWN-003
**Last updated:** 2026-08-01T22:10:15.265Z

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

Defined Order Mapping compatibility boundary in docs/architecture/ORDER_MAPPING_COMPATIBILITY_BOUNDARY.md, Validated via OrderMapping.jsx audit, API client isolation, and state independence verification, Commit SHA: ebbcc688abffd6af81745b6e0231b5efa294c56e, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: FE-003, OWN-003.

---

### `FE-007` Separate application state

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** FE-004, FE-005, FE-006
**Last updated:** 2026-08-01T22:10:15.267Z

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

--evidence App.jsx rewritten: 1217 -> 366 lines. All orphaned sorter state, handlers, effects, and derived variables removed. Sidebar reads sorter diagnostics from sorterSidebarBridge ref. No shared mutable singleton introduced. Vite build passes (34 modules). Regression gate 9/9 passed., --evidence npm run build: 34 modules, 1.10s. npm run test:regression-gate: 9/9 suites passed. App.jsx reduced from 1217 to 366 lines. All sorter-specific state, handlers, effects, and derived variables removed. Switching modules does not mutate unrelated state. Diagnostics events have explicit producer/consumer contracts via sidebarBridge refs. No shared mutable singleton introduced., Commit SHA: 7fed269d4dddac965b9e38ba4e299aa346bb9493, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: FE-004, FE-005, FE-006.

---

### `FE-008` Separate frontend API clients

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** FE-004, FE-005, FE-006, BE-005
**Last updated:** 2026-08-01T22:10:15.269Z

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

--evidence Split client/src/api.js into a shared request helper plus client/src/sorterApi.js, client/src/skuImageApi.js, and client/src/salesIntelligenceApi.js; updated Sorter.jsx, SkuImageManager.jsx, and api.test.js imports; added API mock checks for error detail parsing, FormData upload headers, and CSV export URL; npm run build passed; npm run test:regression-gate passed., --evidence Split client/src/api.js into a shared request helper plus client/src/sorterApi.js, client/src/skuImageApi.js, and client/src/salesIntelligenceApi.js; updated Sorter.jsx, SkuImageManager.jsx, and api.test.js imports; added API mock checks for error detail parsing, FormData upload headers, and CSV export URL; npm run build passed; npm run test:regression-gate passed., --evidence FE-008 implementation and validation complete: feature API clients split, compatibility tests added, build and regression gate passed., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for FE-008.

---

### `FE-009` Isolate styles and remove global leakage

**Severity:** MEDIUM
**Status:** VALIDATION_PENDING
**Dependencies:** FE-001, FE-004, FE-005, FE-006
**Last updated:** 2026-08-01T22:10:15.271Z

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

Scoped form and table presentation rules to dashboard feature roots; shared CSS variables remain centralized. Files: client/src/styles.css, client/src/styles.test.js, PASS: static CSS isolation test and frontend API regression tests; Vite production build; desktop/mobile browser smoke checks for Sorter, SKU Image Manager, and Order Mapping; focusable labeled controls and no body overflow. No committed visual baseline exists, so pixel comparison is inconclusive., Review follow-up: wired client/src/styles.test.js into scripts/regression-gate.mjs and strengthened scoped selector assertions., PASS: integrated regression gate includes Frontend Style Isolation; all suites passed; client build passed; scoped diff check clean., Review follow-up: added client/src/test/regression.test.js for DOM rendering checks and wired front-end tests into regression gate and package.json test:client script., PASS: node tests client/src/styles.test.js client/src/api.test.js; npm run test:client; npm run build; focused diff check clean., PASS: removed duplicate test:regression-gate script and kept only the existing regression gate command; node tests client/src/styles.test.js client/src/api.test.js; npm run test:client; npm run build passed., PASS: scoped input/select/textarea focus-visible visibility to dashboard features; tests and build passed., PASS: removed jsdom regression test, kept core style isolation check in regression gate; build and tests passed., FE-009 implementation validated: scoped form/table/focus-visible presentation rules to .dashboard roots; shared tokens centralized in :root; added client/src/styles.test.js with scoped selector assertions; wired into regression-gate and package.json test:client; Vite build and all test suites passed; desktop/mobile browser smoke checks passed. Note: arch:checkpoint blocked by false-positive secret scan on pre-existing .tokensave/tokensave.db binary; commit requires staging outside checkpoint., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for FE-009.

---

### `FE-010` Add feature error and loading boundaries

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** FE-003, FE-007
**Last updated:** 2026-08-01T22:10:15.273Z

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

Added ErrorBoundary class component wrapping each feature route in App.jsx (keyed per route to reset on switch); added aria-busy to Sorter loading state. Files: client/src/ErrorBoundary.jsx (new), client/src/App.jsx, client/src/Sorter.jsx. Regression gate 10/10 passed, Vite build passed., PASS: regression gate 10/10 suites all passed; Vite production build passed; git diff --check clean. ErrorBoundary isolates feature render crashes from sidebar/navigation. Sorter has aria-busy during loading. OrderMapping and SkuImageManager already had accessible loading states., FE-010 implementation validated: ErrorBoundary wraps Sorter, OrderMapping, SkuImageManager routes (keyed per route); Sorter has aria-busy during loading; regression gate and build passed., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for FE-010.

---

### `FE-011` Add frontend regression tests and classify placeholders

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** FE-002, FE-003, FE-004, FE-005, FE-006, FE-007, FE-008, FE-009, FE-010
**Last updated:** 2026-08-01T22:10:15.275Z

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

--evidence=Added frontend regression tests in client/src/frontendRegression.test.js and client/src/styles.test.js covering module classification, placeholder ownership claims, Order Mapping view status tones/labels, ErrorBoundary contract, and style isolation rules., --evidence=Verified all 12 regression test suites pass cleanly via npm run test:regression-gate. Frontend regression test coverage confirmed for module classification, placeholder ownership claims, Order Mapping view status tones/labels, ErrorBoundary contract, and style isolation., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for FE-011.

---

### `INT-001` Inventory and contract Shopify clients

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-010
**Last updated:** 2026-08-01T22:10:15.277Z

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

Defined Shopify client inventory and contract in docs/architecture/SHOPIFY_CLIENT_INVENTORY.md, Validated via static search of all Shopify imports, read/write operation audit, and secret value review, Commit SHA: 1791793de9c89144a78dfff5df6d17c13ab79a39, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-010.

---

### `INT-002` Define shared Shopify transport

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** INT-001, TEST-003
**Last updated:** 2026-08-01T22:10:15.279Z

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

Defined shared Shopify transport contract in docs/architecture/SHOPIFY_TRANSPORT_CONTRACT.md, Validated via shopifyService.js and shopifyAuth.js review, error handling audit, and business logic exclusion check, Commit SHA: d862883fad6107036dbee361ff05e114e78c6d7c, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: INT-001, TEST-003.

---

### `INT-003` Keep Shopify business logic app-owned

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** INT-002, OWN-002, OWN-003, OWN-004, OWN-005
**Last updated:** 2026-08-01T22:10:15.281Z

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

Defined Shopify business logic ownership in docs/architecture/SHOPIFY_BUSINESS_LOGIC_OWNERSHIP.md, Validated via business logic audit, cross-app import verification, and transport reuse analysis, Commit SHA: 605678c1eaea3f117312cf144bbc8da4b21332a7, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: INT-002, OWN-002, OWN-003, OWN-004, OWN-005.

---

### `INT-004` Inventory and contract Shiprocket clients

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-010, TEST-004
**Last updated:** 2026-08-01T22:10:15.283Z

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

Defined Shiprocket client inventory and contract in docs/architecture/SHIPROCKET_CLIENT_INVENTORY.md, Validated via static search of all Shiprocket imports, status mapping audit, and secret value review, Commit SHA: f22a5af78e06cd4888f951fe2f767510e77c1d7b, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-010, TEST-004.

---

### `INT-005` Define shared Shiprocket transport

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** INT-004
**Last updated:** 2026-08-01T22:10:15.285Z

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

Defined Shiprocket transport contract in docs/architecture/SHIPROCKET_TRANSPORT_CONTRACT.md, Validated via shiprocketService.js review, auth/retry/error contract audit, and secret value verification, Commit SHA: 1e845b181d0044a42a4c780968efa1165be41371, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: INT-004.

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
**Status:** VALIDATION_PENDING
**Dependencies:** INT-002, INT-005
**Last updated:** 2026-08-01T22:10:15.287Z

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

Defined retry, rate limit, and error standard in docs/architecture/RETRY_RATE_LIMIT_ERROR_STANDARD.md, Validated via shopifyService.js and shiprocketService.js review, error category audit, and retry behavior verification, Commit SHA: 4bd0e530c6751f784eb37101490187bf217deefd, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: INT-002, INT-005.

---

### `INT-008` Add deterministic integration mocks

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** INT-002, INT-005, TEST-012
**Last updated:** 2026-08-01T22:10:15.289Z

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

Created server/src/mocks/integrationMocks.js with synthetic fixtures for Shopify & Shiprocket. Added server/src/services/providerIntegration.test.js with 12 deterministic provider tests., All 12 provider integration tests pass network-free. 11/11 regression gate suites passed., INT-008 complete. Added deterministic integration mocks & provider tests for Shopify GraphQL/OAuth and Shiprocket API., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for INT-008.

---

### `INT-009` Remove duplicate clients after usage proof

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** INT-003, INT-007, INT-008
**Last updated:** 2026-08-01T22:10:15.291Z

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

--evidence=Removed 7 dead legacy client/service files (deliveryShopify.js, deliveryRepository.js, deliveryRepository.test.js, reconciliationService.js, legacyCsv.js, orderMatcher.js, statusMapper.js) and updated server/package.json test:order-mapping script. Verified zero remaining references across client, server, and tests. All 12 regression gate test suites pass., --evidence=Removed 7 dead legacy client/service files (deliveryShopify.js, deliveryRepository.js, deliveryRepository.test.js, reconciliationService.js, legacyCsv.js, orderMatcher.js, statusMapper.js) and updated server/package.json test:order-mapping script. Verified zero remaining references across client, server, and tests. All 12 regression gate test suites pass., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for INT-009.

---

### `INT-010` Verify provider contracts and API-version compatibility

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** INT-008, BE-005
**Last updated:** 2026-08-01T22:10:15.293Z

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

--changed-files server/src/services/providerIntegration.test.js, --passed-tests providerIntegration.test.js, --evidence Verified provider contracts (Shopify GraphQL, Shopify Auth, Shiprocket API) and API version compatibility with 100% test coverage in providerIntegration.test.js., Commit SHA: 4f6d26d90d40f68f5446a9237844afab11912186, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: INT-008, BE-005.

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
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-003, OWN-008
**Last updated:** 2026-08-01T22:10:15.295Z

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

Documented SQLite table ownership in docs/architecture/SQLITE_TABLE_OWNERSHIP.md, Validated via database.js schema review, table ownership audit, and cleanup task dependency verification, Commit SHA: 9c8e78e7ec986fdb1060079d05652d54e5af828b, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-003, OWN-008.

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
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-004, OWN-009
**Last updated:** 2026-08-01T22:10:15.297Z

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

Defined SKU audit data separation in docs/architecture/SKU_AUDIT_DATA_SEPARATION.md, Validated via skuImageAuditService.js review, write safety audit, and migration reversibility analysis, Commit SHA: 6b31f143a685f979ef45b76f60213abae1911403, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-004, OWN-009.

---

### `DATA-005` Separate Sales Intelligence caches

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-005, OWN-009
**Last updated:** 2026-08-01T22:10:15.299Z

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

Defined Sales Intelligence cache separation in docs/architecture/SALES_INTELLIGENCE_CACHE_SEPARATION.md, Validated via actualSalesService.js review, cache safety audit, and version mismatch handling verification, Commit SHA: 28e6715046cc385bf23ace99c9641157430ba287, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-005, OWN-009.

---

### `DATA-006` Isolate Order Mapping PostgreSQL/migration state

**Severity:** CRITICAL
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-004, OWN-003, BE-010
**Last updated:** 2026-08-01T22:10:15.301Z

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

Defined Order Mapping PostgreSQL/migration isolation in docs/architecture/ORDER_MAPPING_POSTGRESQL_ISOLATION.md, Validated via PostgreSQL schema review, migration file audit, and legacy SQLite migration source verification, Commit SHA: 78223a36a373dc47d6c05327b1be10e14364a462, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-004, OWN-003, BE-010.

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
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-004, SAFE-007, DATA-006
**Last updated:** 2026-08-01T22:10:15.303Z

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

Defined PostgreSQL backup and restore process in docs/architecture/POSTGRESQL_BACKUP_RESTORE_PROCESS.md, Validated via Neon backup strategy review, restore process audit, and destructive check safety verification, Commit SHA: 1ee6ca297aefa6c6dd7748a228a750460499a950, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-004, SAFE-007, DATA-006.

---

### `OPS-001` Fix or retire obsolete `scripts/dev.mjs`

**Severity:** MEDIUM
**Status:** VALIDATION_PENDING
**Dependencies:** TEST-010, OWN-001
**Last updated:** 2026-08-01T22:10:15.305Z

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

Documented dev script obsolescence and retirement recommendation in docs/architecture/DEV_SCRIPT_STATUS.md, Validated via static script check, package.json audit, and confirmation that no documented command invokes dev.mjs, Commit SHA: ca40abbec669ae7d1a6a7e225d07afbb376eea9c, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: TEST-010, OWN-001.

---

### `OPS-002` Standardize startup commands

**Severity:** MEDIUM
**Status:** VALIDATION_PENDING
**Dependencies:** OPS-001, BE-010
**Last updated:** 2026-08-01T22:10:15.307Z

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

--evidence Created docs/architecture/STARTUP_COMMANDS_SAFETY_MATRIX.md, implemented scripts/verify.mjs for offline system verification, enforced explicit operator intent on database migrations, and added unit tests in server/src/scripts/startupCommands.test.js, --evidence Validated via node --test server/src/scripts/startupCommands.test.js (3 passing) and npm run verify offline execution, Commit SHA: 69536df32abb5a2ef7310803d20f56c7eb945c7e, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OPS-001, BE-010.

---

### `OPS-003` Standardize health checks

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** BE-005, OWN-006
**Last updated:** 2026-08-01T22:10:15.309Z

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

--changed-files server/src/routes/api.js,server/src/utils/sanitize.js,server/src/routes/health.test.js,scripts/regression-gate.mjs, --passed-tests health.test.js, --evidence Standardized liveness (/api/health and /api/health/liveness without Shopify creds), readiness (/api/health/readiness checking DB & config state), and provider diagnostics (/api/debug/shopify, /api/debug/shiprocket, /api/health/diagnostics with secret redaction) with 100% test pass rate., Commit SHA: b2b4e56b1f528ad7d0a5501d8e3eab8ee2021640, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: BE-005, OWN-006.

---

### `OPS-004` Standardize diagnostics and safe observability

**Severity:** MEDIUM
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-006, BE-009, SEC-006
**Last updated:** 2026-08-01T22:10:15.311Z

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

--changed-files server/src/routes/api.js,server/src/routes/health.test.js, --passed-tests node --test server/src/routes/health.test.js server/src/utils/sanitize.test.js,npm run verify,npm run test:regression-gate, --evidence Standardized health and provider diagnostics with bounded redacted error details, explicit application and provider status indicators, response size coverage, and preserved existing Shopify debug fields., Commit SHA: ed3dbac7e924a9dec82294ba12d6bb6b595dabae, --evidence Committed-state verification passed node --test server/src/routes/health.test.js server/src/routes/diagnostics.test.js server/src/utils/sanitize.test.js and npm run verify. The full clean-worktree regression gate could not run three pre-existing untracked suite files absent from HEAD: shopifyMediaService.test.js, actualSalesService.test.js, and orderMappingMigrations.test.js; the same gate passed 13/13 in the preserved working tree., Commit SHA: 7f56184ee70a1336fa468131972f6dc69b49ea96, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-006, BE-009, SEC-006.

---

### `OPS-005` Review and isolate Graphify artifacts

**Severity:** MEDIUM
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-009
**Last updated:** 2026-08-01T22:10:15.313Z

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

--changed-files .gitignore, --passed-tests npm run verify,npm run test:regression-gate, --evidence Isolated Graphify runtime cache (graphify-out/cache/) and temp files (.graphify_*) in .gitignore and untracked them from git index, while preserving canonical report and graph files (GRAPH_REPORT.md, graph.json, manifest.json, graph.html)., Commit SHA: 4725ea64148387916d77fa192ab6c32c305e5917, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-009.

---

### `OPS-006` Review and isolate Tokensave runtime files

**Severity:** HIGH
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-009, SEC-003
**Last updated:** 2026-08-01T22:10:15.315Z

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

--changed-files docs/architecture/TOOL_ISOLATION_AND_TOKENSAVE_SPECIFICATION.md, --passed-tests npm run verify,npm run test:regression-gate,npm run test:architecture-ledger, --evidence Created docs/architecture/TOOL_ISOLATION_AND_TOKENSAVE_SPECIFICATION.md establishing .tokensave/ as an auxiliary developer tool cache, disclaiming application ownership, confirming zero application runtime dependency, and verifying git ignore rules., Commit SHA: 3519c7c3158cef6051b59cf0548f0fd1047775ec, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-009, SEC-003.

---

### `OPS-007` Review Playwright artifacts

**Severity:** LOW
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-009
**Last updated:** 2026-08-01T22:10:15.317Z

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

--changed-files .gitignore, --passed-tests npm run verify,npm run test:regression-gate, --evidence Configured .gitignore with rules for Playwright artifacts (.playwright-cli/, .tmp-playwright/, playwright-report/, blob-report/) to ensure generated logs/snapshots have bounded retention while keeping tests discoverable., Moved from completed to validation_pending: direct evidence gap identified by the Phase 3B manifest for OPS-007.

---

### `OPS-008` Review test outputs and cache artifacts

**Severity:** LOW
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-009
**Last updated:** 2026-08-01T22:10:15.319Z

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

--changed-files .gitignore, --passed-tests npm run verify,npm run test:regression-gate,npm run test:architecture-ledger, --evidence Configured .gitignore with rules for test outputs (coverage/, *.lcov) and runtime ledger snapshots (docs/architecture/ledger/snapshots/) to ensure test outputs and cache artifacts have bounded retention while preserving all test assets., Commit SHA: 294d9763555f0fc66e1f2f7a5f548b3fdaad41c9, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-009.

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
**Status:** COMPLETED
**Dependencies:** None
**Last updated:** 2026-08-01T22:10:15.329Z

#### Description

Task OPS-ARCH-001

#### Acceptance criteria

- None specified

#### Validation commands

```bash
None
```

#### Completion evidence

--passed-tests npm run arch:doctor,npm run test:architecture-ledger, --evidence Verified operational architecture ledger integrity via doctor diagnostic checks and automated architecture ledger test suite (24/24 passing)., Commit SHA: d3a72162dd271f8c42c9579e3054f8921e591d93, Phase 3B evidence reconstruction for OPS-ARCH-001: d3a72162dd271f8c42c9579e3054f8921e591d93 is the historical completion record and reconciliation validation baseline, not a newly invented implementation SHA. Clean detached-worktree validation reran npm run test:architecture-ledger (24/24 passed) and npm run arch:doctor (exit 0) at that exact remote-contained commit.

---

### `SEC-001` Assess authentication boundary

**Severity:** CRITICAL
**Status:** VALIDATION_PENDING
**Dependencies:** OWN-007, OWN-010
**Last updated:** 2026-08-01T22:10:15.321Z

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

--changed-files docs/architecture/AUTHENTICATION_BOUNDARY_ASSESSMENT.md, --passed-tests npm run verify,npm run test:regression-gate,npm run test:architecture-ledger, --evidence Created docs/architecture/AUTHENTICATION_BOUNDARY_ASSESSMENT.md documenting full route trust matrix (public, diagnostic, API routes), upstream Shopify & Shiprocket credential boundaries, unauthenticated endpoint risk assessment, and local loopback vs. embedded App Bridge JWT deployment policies., Commit SHA: a7ad4eaf660311e185c096b29387eaf4e133d3d0, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: OWN-007, OWN-010.

---

### `SEC-002` Add route authorization boundaries

**Severity:** CRITICAL
**Status:** VALIDATION_PENDING
**Dependencies:** SEC-001, TEST-008
**Last updated:** 2026-08-01T22:10:15.323Z

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

--changed-files server/src/middleware/authBoundary.js,server/src/middleware/authBoundary.test.js,server/src/routes/orderMapping.js,server/src/app.js, --passed-tests npm run verify,node --test server/src/middleware/authBoundary.test.js,npm run test:regression-gate, --evidence Implemented server/src/middleware/authBoundary.js with requireAdminAuth (403 Forbidden for unauthorized admin migration operations), requireRouteAuth (401 Unauthorized for unauthorized production requests), and explicit non-production local/test bypass., Commit SHA: 2f2869d99cfd37a0c90679b3021ddca21ada1d4c, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SEC-001, TEST-008.

---

### `SEC-003` Correct secret handling and tracked token risk

**Severity:** CRITICAL
**Status:** VALIDATION_PENDING
**Dependencies:** SAFE-005, OWN-010
**Last updated:** 2026-08-01T22:10:15.325Z

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

--changed-files server/src/utils/sanitize.js,docs/architecture/SECRET_HANDLING_AND_ROTATION_GUIDE.md, --passed-tests npm run verify,npm run test:regression-gate,npm run test:architecture-ledger, --evidence Created docs/architecture/SECRET_HANDLING_AND_ROTATION_GUIDE.md and expanded server/src/utils/sanitize.js secret redaction coverage for ADMIN_SECRET, API_SECRET, and all Shopify/Shiprocket token patterns., Commit SHA: ce9d2c28a7a9117e6fa9fa62830bbc5f468a8f06, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SAFE-005, OWN-010.

---

### `SEC-004` Validate environment schema at boundaries

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** OWN-010
**Last updated:** 2026-08-01T23:16:47.197Z

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
**Status:** VALIDATION_PENDING
**Dependencies:** SEC-003, OWN-006
**Last updated:** 2026-08-01T22:10:15.327Z

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

--changed-files server/src/utils/sanitize.js,server/src/utils/sanitize.test.js, --passed-tests npm run verify,node --test server/src/utils/sanitize.test.js,npm run test:regression-gate, --evidence Enhanced server/src/utils/sanitize.js with redactNestedSecrets for recursive redaction of nested object payloads, arrays, errors, and sensitive key patterns., Commit SHA: ae2ed977bf4d48af50fd2eeed3b01f75f13078f9, Moved from completed to validation_pending by strict dependency closure because one or more dependencies no longer have completed status: SEC-003, OWN-006.

---

### `SEC-007` Review CORS and CSRF protections

**Severity:** HIGH
**Status:** NOT_STARTED
**Dependencies:** SEC-001, BE-005
**Last updated:** 2026-08-01T23:16:47.198Z

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
**Last updated:** 2026-08-01T23:16:47.198Z

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
**Last updated:** 2026-08-01T23:16:47.198Z

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
**Last updated:** 2026-08-01T23:16:47.198Z

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
**Last updated:** 2026-08-01T23:16:47.198Z

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
**Last updated:** 2026-08-01T23:16:47.198Z

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
**Last updated:** 2026-08-01T23:16:47.198Z

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
**Status:** READY
**Dependencies:** OWN-001
**Last updated:** 2026-08-03T07:40:37.703Z

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
**Last updated:** 2026-08-01T23:16:47.198Z

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
**Last updated:** 2026-08-01T23:16:47.198Z

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
**Last updated:** 2026-08-01T23:16:47.198Z

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
**Last updated:** 2026-08-01T23:16:47.198Z

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
| 2026-08-03T12:33:53.118Z | TEST-002 | completed | completed | shivam | TEST foundation post-push finalization: record verified remote containment without changing task status | `ad288699` |
| 2026-08-03T12:33:53.118Z | TEST-001 | completed | completed | shivam | TEST foundation post-push finalization: record verified remote containment without changing task status | `76fca260` |
| 2026-08-03T12:26:37.060Z | TEST-002 | completed | completed | shivam | TEST foundation completion-record finalization: record recovery commit 251cda92d76309159da69ceca4f363d0b9432fc8 without changing task status | `d48d42ff` |
| 2026-08-03T12:26:37.060Z | TEST-001 | completed | completed | shivam | TEST foundation completion-record finalization: record recovery commit 251cda92d76309159da69ceca4f363d0b9432fc8 without changing task status | `fdb9142c` |
| 2026-08-03T12:25:10.175Z | TEST-002 | validation_pending | completed | shivam | TEST foundation evidence recovery: task-specific clean validation and durable committed evidence verified | `3e6414d0` |
| 2026-08-03T12:25:10.175Z | TEST-001 | validation_pending | completed | shivam | TEST foundation evidence recovery: task-specific clean validation and durable committed evidence verified | `223990e8` |
| 2026-08-03T07:58:29.272Z | OWN-001 | completed | completed | shivam | R1-A completion-record finalization: record evidence Commit 1 00a91ff6553050f9a4f2a0cfdc3ec36005a9a074 without changing task status. | `46bfb395` |
| 2026-08-03T07:58:29.272Z | SAFE-008 | completed | completed | shivam | R1-A completion-record finalization: record evidence Commit 1 00a91ff6553050f9a4f2a0cfdc3ec36005a9a074 without changing task status. | `428daa7b` |
| 2026-08-03T07:58:29.272Z | SAFE-007 | completed | completed | shivam | R1-A completion-record finalization: record evidence Commit 1 00a91ff6553050f9a4f2a0cfdc3ec36005a9a074 without changing task status. | `f35e5119` |
| 2026-08-03T07:58:29.272Z | SAFE-006 | completed | completed | shivam | R1-A completion-record finalization: record evidence Commit 1 00a91ff6553050f9a4f2a0cfdc3ec36005a9a074 without changing task status. | `b3182152` |
