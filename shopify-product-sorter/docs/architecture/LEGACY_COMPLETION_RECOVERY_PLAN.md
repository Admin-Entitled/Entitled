# Legacy Completion Recovery Plan

## Executive Summary

This document establishes a read-only legacy-completion recovery assessment for all **76** `validation_pending` tasks in the Shopify Product Sorter architecture remediation ledger. 

The purpose of this recovery plan is to restore previously implemented and validated tasks to `completed` status using existing Git commits, remote references, test suites, documentation specs, and durable external artifacts—**without redoing any completed work**.

### Classification Totals

| Classification Group | Description | Task Count |
| :--- | :--- | :---: |
| **A. RESTORE_WITH_EXISTING_EVIDENCE** | Implementation and validation evidence already exists in remote Git history or durable external artifacts | **29** |
| **B. RESTORE_AFTER_BATCH_VALIDATION** | Implementation exists in Git/disk; clean batch regression validation must be rerun | **12** |
| **C. NEEDS_EVIDENCE_BACKFILL** | Implementation exists in remote Git history, but ledger metadata (`changed_files`, `validation_files`, commit SHA) must be reconstructed | **31** |
| **D. NEEDS_EXISTING_DIRTY_WORK_COMMITTED** | Implementation exists only in the preserved dirty working tree | **1** |
| **E. GENUINELY_INCOMPLETE** | Required implementation or artifact does not exist; requires new development | **3** |
| **TOTAL VALIDATION_PENDING TASKS** | | **76** |

### Key Findings & Recovery Metrics

- **Tasks Restorable Without Reimplementation**: **73** of 76 tasks (96.1%)
- **Tasks Genuinely Requiring Reimplementation**: **3** of 76 tasks (`FE-009`, `FE-010`, `FE-011`)
- **Currently Completed Ledger Tasks**: 2 (`SAFE-001`, `OPS-ARCH-001`)
- **Expected Completed Count After Evidence-Only Recovery**: **75** tasks (2 currently completed + 73 restored)

---

## Task Restoration Categories

### 1. Tasks Restorable Without Touching Application Files (Group A - 29 Tasks)
These tasks represent durable external backup artifacts, architecture documentation specs, matrix registers, file deletions, or `.gitignore` configuration updates. All evidence is already intact in Git history or on disk.
- **Backup Artifacts**: `SAFE-002`, `SAFE-003`, `SAFE-004`, `SAFE-005`, `SAFE-006`, `SAFE-007`
- **Documentation & Spec Registers**: `SAFE-008`, `OWN-001`, `OWN-002`, `OWN-003`, `OWN-004`, `OWN-005`, `OWN-006`, `OWN-007`, `OWN-008`, `OWN-009`, `OWN-010`, `DATA-002`, `DATA-004`, `DATA-005`, `DATA-006`, `DATA-012`, `OPS-005`, `OPS-006`, `OPS-007`, `OPS-008`, `SEC-001`, `SEC-003`
- **File Deletions**: `INT-009`

### 2. Tasks Requiring One Shared Clean Regression Validation (Group B & C Code/Test Tasks - 43 Tasks)
These tasks represent existing backend services, frontend modules, integration contracts, security boundaries, and test suites stored in remote Git commits or workspace code files. Their recovery requires running the existing suite (`npm test`) once in batch mode without altering application logic:
- **Test Protection Suites**: `TEST-001`, `TEST-002`, `TEST-003`, `TEST-004`, `TEST-005`, `TEST-006`, `TEST-007`, `TEST-008`, `TEST-009`, `TEST-010`, `TEST-011`, `TEST-012`
- **Backend Domain Services & Routers**: `BE-001`, `BE-002`, `BE-003`, `BE-004`, `BE-005`, `BE-006`, `BE-007`, `BE-009`, `BE-010`, `BE-011`
- **Frontend App Shell & Boundaries**: `FE-001`, `FE-002`, `FE-003`, `FE-004`, `FE-005`, `FE-006`, `FE-007`
- **Integrations & Security**: `INT-001`, `INT-002`, `INT-003`, `INT-004`, `INT-005`, `INT-007`, `INT-008`, `INT-010`, `SEC-002`, `SEC-006`, `OPS-001`, `OPS-002`, `OPS-003`, `OPS-004`

### 3. Tasks Requiring Individual External-Artifact Checks (7 Tasks)
These tasks depend on verifying specific physical directories, custom archive files, or isolated manifests outside the main repository tree:
- `SAFE-002`: `~/.codex/artifacts/shopify-product-sorter/2026-07-30T12-28-53+0530-safe-002-baseline.manifest`
- `SAFE-003`: `~/.codex/artifacts/shopify-product-sorter/2026-07-30T12-33-40+0530-safe-003-sqlite/`
- `SAFE-004`: `~/.codex/artifacts/shopify-product-sorter/2026-07-30T12-40-39+0530-safe-004-postgres/`
- `SAFE-005`: `~/.codex/artifacts/shopify-product-sorter/2026-07-30T12-50-43+0530-safe-005-secrets/`
- `SAFE-006`: `~/.codex/artifacts/shopify-product-sorter/2026-07-31T10-30-00+0530-safe-006-offdevice/` & commit `e2bb549c2ec7e7b2291a09750932c80b0ab547e3`
- `SAFE-007`: `~/.codex/artifacts/shopify-product-sorter/2026-07-30T21-16-08+0530-safe-007-restore-rehearsal/`
- `SAFE-008`: `docs/architecture/DATABASE_OWNERSHIP_REGISTER.md`

### 4. Tasks Requiring Existing Dirty Work Committed (Group D - 1 Task)
- `FE-008`: The separated API clients (`client/src/sorterApi.js`, `client/src/skuImageApi.js`, `client/src/salesIntelligenceApi.js`) exist in the preserved dirty working tree. Committing these files completes recovery without re-writing code.

### 5. Tasks Genuinely Requiring Implementation (Group E - 3 Tasks)
These features have never been implemented or committed in git history and do not exist on disk:
- `FE-009`: Isolate styles and remove global leakage
- `FE-010`: Add feature error and loading boundaries
- `FE-011`: Add frontend regression tests and classify placeholders

---

## Detailed Task Recovery Audit Matrix

### SAFE-002: Capture working-tree and baseline manifest
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Artifact/Doc`
- **Commit Exists Locally & Remotely**: Local: `NO` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (Artifact/File verified on disk)`
- **Test / Artifact Evidence**: External artifact in ~/.codex/artifacts/ or docs/architecture/
- **Dependency State**: `None`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### SAFE-003: Confirm SQLite backups
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Artifact/Doc`
- **Commit Exists Locally & Remotely**: Local: `NO` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (Artifact/File verified on disk)`
- **Test / Artifact Evidence**: External artifact in ~/.codex/artifacts/ or docs/architecture/
- **Dependency State**: `SAFE-002`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### SAFE-004: Complete PostgreSQL/Neon backup
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Artifact/Doc`
- **Commit Exists Locally & Remotely**: Local: `NO` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (Artifact/File verified on disk)`
- **Test / Artifact Evidence**: External artifact in ~/.codex/artifacts/ or docs/architecture/
- **Dependency State**: `SAFE-002`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### SAFE-005: Encrypt secret archive
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Artifact/Doc`
- **Commit Exists Locally & Remotely**: Local: `NO` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (Artifact/File verified on disk)`
- **Test / Artifact Evidence**: External artifact in ~/.codex/artifacts/ or docs/architecture/
- **Dependency State**: `SAFE-002`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### SAFE-006: Create off-device backup copy
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `e2bb549c2ec7e7b2291a09750932c80b0ab547e3`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (3 files in commit diff)`
- **Test / Artifact Evidence**: External artifact in ~/.codex/artifacts/ or docs/architecture/
- **Dependency State**: `SAFE-003, SAFE-004, SAFE-005`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### SAFE-007: Validate restoration instructions
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Artifact/Doc`
- **Commit Exists Locally & Remotely**: Local: `NO` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (Artifact/File verified on disk)`
- **Test / Artifact Evidence**: External artifact in ~/.codex/artifacts/ or docs/architecture/
- **Dependency State**: `SAFE-003, SAFE-004, SAFE-006`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### SAFE-008: Record database ownership uncertainties
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Artifact/Doc`
- **Commit Exists Locally & Remotely**: Local: `NO` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (Artifact/File verified on disk)`
- **Test / Artifact Evidence**: External artifact in ~/.codex/artifacts/ or docs/architecture/
- **Dependency State**: `SAFE-002`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### TEST-001: Protect sorter scoring and core logic
- **Classification**: `B. RESTORE_AFTER_BATCH_VALIDATION`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Repo code`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: `tests`
- **Files Exist at Commit / Disk**: `NO`
- **Test / Artifact Evidence**: Existing test suite or module code at commit head
- **Dependency State**: `SAFE-002`
- **Exact Minimum Action Required**: Run shared batch regression test suite and confirm 100% pass.
- **Reimplementation Required**: **NO**

### TEST-002: Protect collection sync/apply/rollback
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `f3690e88bead0c46576d1e8002e50804b22ade42`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (5 files in commit diff)`
- **Test / Artifact Evidence**: Commit f3690e88bead0c46576d1e8002e50804b22ade42 contains 5 files
- **Dependency State**: `SAFE-003, SAFE-008`
- **Exact Minimum Action Required**: Backfill changed_files from commit f3690e88bead0c46576d1e8002e50804b22ade42 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### TEST-003: Protect collection reorder contracts
- **Classification**: `B. RESTORE_AFTER_BATCH_VALIDATION`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Repo code`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: `tests`
- **Files Exist at Commit / Disk**: `NO`
- **Test / Artifact Evidence**: Existing test suite or module code at commit head
- **Dependency State**: `SAFE-002`
- **Exact Minimum Action Required**: Run shared batch regression test suite and confirm 100% pass.
- **Reimplementation Required**: **NO**

### TEST-004: Protect Order Mapping sync/status lifecycle
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `634ad1afdd9e400e923bb37740b78a758a4a6a2e`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit 634ad1afdd9e400e923bb37740b78a758a4a6a2e contains 4 files
- **Dependency State**: `SAFE-004`
- **Exact Minimum Action Required**: Backfill changed_files from commit 634ad1afdd9e400e923bb37740b78a758a4a6a2e into tasks.json metadata.
- **Reimplementation Required**: **NO**

### TEST-005: Protect CSV import and manual overrides
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `7890a0ef38dd5dec9454d0a583edafc3977c2a86`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit 7890a0ef38dd5dec9454d0a583edafc3977c2a86 contains 4 files
- **Dependency State**: `SAFE-004`
- **Exact Minimum Action Required**: Backfill changed_files from commit 7890a0ef38dd5dec9454d0a583edafc3977c2a86 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### TEST-006: Protect SKU media operations
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `6476c331d12e763ee13d38d8cf38265683e58cdc`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit 6476c331d12e763ee13d38d8cf38265683e58cdc contains 4 files
- **Dependency State**: `SAFE-002`
- **Exact Minimum Action Required**: Backfill changed_files from commit 6476c331d12e763ee13d38d8cf38265683e58cdc into tasks.json metadata.
- **Reimplementation Required**: **NO**

### TEST-007: Protect Sales Intelligence API contracts
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `360d53ccd88e248acc4ecf48c5a13e9d389c10fd`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit 360d53ccd88e248acc4ecf48c5a13e9d389c10fd contains 4 files
- **Dependency State**: `SAFE-002`
- **Exact Minimum Action Required**: Backfill changed_files from commit 360d53ccd88e248acc4ecf48c5a13e9d389c10fd into tasks.json metadata.
- **Reimplementation Required**: **NO**

### TEST-008: Protect public route compatibility
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `f42888e6b976829d84acc45ac5c9a0ecfa7671b7`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit f42888e6b976829d84acc45ac5c9a0ecfa7671b7 contains 4 files
- **Dependency State**: `SAFE-002`
- **Exact Minimum Action Required**: Backfill changed_files from commit f42888e6b976829d84acc45ac5c9a0ecfa7671b7 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### TEST-009: Protect database migration safety
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `86cfc4d239e91662a9ca93b410a7d51935545195`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit 86cfc4d239e91662a9ca93b410a7d51935545195 contains 4 files
- **Dependency State**: `SAFE-003, SAFE-004`
- **Exact Minimum Action Required**: Backfill changed_files from commit 86cfc4d239e91662a9ca93b410a7d51935545195 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### TEST-010: Protect startup and environment isolation
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `b23cb9a2f00b5e375777fad515c80198617ca3a4`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit b23cb9a2f00b5e375777fad515c80198617ca3a4 contains 4 files
- **Dependency State**: `SAFE-002`
- **Exact Minimum Action Required**: Backfill changed_files from commit b23cb9a2f00b5e375777fad515c80198617ca3a4 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### TEST-011: Protect frontend navigation
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `df88049c65d9d79ecd2ff2eb7b80b535892426e5`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit df88049c65d9d79ecd2ff2eb7b80b535892426e5 contains 4 files
- **Dependency State**: `SAFE-002`
- **Exact Minimum Action Required**: Backfill changed_files from commit df88049c65d9d79ecd2ff2eb7b80b535892426e5 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### TEST-012: Add integrated existing-app regression gate
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `e6e41918ab44115f82ac46eb5c920e22e7f07d6d`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (7 files in commit diff)`
- **Test / Artifact Evidence**: Commit e6e41918ab44115f82ac46eb5c920e22e7f07d6d contains 7 files
- **Dependency State**: `TEST-001, TEST-002, TEST-003, TEST-004, TEST-005, TEST-006, TEST-007, TEST-008, TEST-009, TEST-010, TEST-011`
- **Exact Minimum Action Required**: Backfill changed_files from commit e6e41918ab44115f82ac46eb5c920e22e7f07d6d into tasks.json metadata.
- **Reimplementation Required**: **NO**

### OWN-001: Establish canonical application names and statuses
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Artifact/Doc`
- **Commit Exists Locally & Remotely**: Local: `NO` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (Artifact/File verified on disk)`
- **Test / Artifact Evidence**: Documentation matrix in docs/architecture/
- **Dependency State**: `SAFE-008`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### OWN-002: Define Product Sorter boundary
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Artifact/Doc`
- **Commit Exists Locally & Remotely**: Local: `NO` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES, but the pre-recovery specification required current-code correction`
- **Test / Artifact Evidence**: Fresh committed-state route, service, store, environment, dependency, and test inventory is required.
- **Dependency State**: `OWN-001, TEST-001`
- **Exact Minimum Action Required**: Do not restore completion from this recovery row alone. Correct the specification against current committed code, commit the corrected artifact, validate the exact committed state, and record truthful ledger evidence.
- **Reimplementation Required**: **NO**

### OWN-003: Classify Order Mapping versus legacy Delivery Resolution
- **Classification**: `E. GENUINELY_INCOMPLETE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `77e237a2fc9b042546976255b522af9bce8381af`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785498221.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `NO — commit 77e237a contains ledger/generated-report files but not docs/architecture/ORDER_MAPPING_CLASSIFICATION_REPORT.md`
- **Test / Artifact Evidence**: The standalone classification artifact claimed by the ledger is absent from the cited commit and the current committed baseline.
- **Dependency State**: `SAFE-008, TEST-004, TEST-005`
- **Exact Minimum Action Required**: Reconstruct a current classification report from committed repository evidence, commit it, validate the exact committed state, and replace the unsupported implementation evidence. Commit 77e237a may be retained only as historical ledger provenance.
- **Reimplementation Required**: **YES (documentation reconstruction only)**

### OWN-004: Define SKU Image Manager boundary
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `43c636777b7e1e62947ee14f0cdc0b918f952445`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (3 files in commit diff)`
- **Test / Artifact Evidence**: Documentation matrix in docs/architecture/
- **Dependency State**: `OWN-001, TEST-006`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### OWN-005: Define Actual Sales Intelligence boundary
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `4eb661e4191baa1e20f8c2cf5ab85655b0906978`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785500834.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Documentation matrix in docs/architecture/
- **Dependency State**: `OWN-001, TEST-007`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### OWN-006: Define System Diagnostics ownership
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `25de38d76639b4d48e2cde564482bee7c278131f`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785503688.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Documentation matrix in docs/architecture/
- **Dependency State**: `OWN-001, TEST-010`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### OWN-007: Approve route ownership matrix
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `c201983c0fc7cfd6b65a161d0eaebfb4b0ff169c`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785504213.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Documentation matrix in docs/architecture/
- **Dependency State**: `OWN-002, OWN-003, OWN-004, OWN-005, OWN-006, TEST-008`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### OWN-008: Approve data ownership matrix
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `87ff3ea1e36fb81e85e8da123e2a1256d022d330`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785504549.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Documentation matrix in docs/architecture/
- **Dependency State**: `SAFE-003, SAFE-004, SAFE-008`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### OWN-009: Approve runtime file ownership
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `e370e61f093543a571ebe09449b577677e7861a2`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785505029.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Documentation matrix in docs/architecture/
- **Dependency State**: `OWN-002, OWN-003, OWN-004, OWN-005, OWN-006`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### OWN-010: Approve integration and environment ownership
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `03a2c632d37d36e9b127840508b67af99e2c87aa`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785505483.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Documentation matrix in docs/architecture/
- **Dependency State**: `OWN-002, OWN-003, OWN-004, OWN-005, OWN-006`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### BE-001: Split the generic API router
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `e8c2b9f7cb43dde0ac66d20a11a5937f9f587163`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (3 files in commit diff)`
- **Test / Artifact Evidence**: Commit e8c2b9f7cb43dde0ac66d20a11a5937f9f587163 contains 3 files
- **Dependency State**: `TEST-012, OWN-007`
- **Exact Minimum Action Required**: Backfill changed_files from commit e8c2b9f7cb43dde0ac66d20a11a5937f9f587163 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### BE-002: Create a Sorter router
- **Classification**: `B. RESTORE_AFTER_BATCH_VALIDATION`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `292e70e99ab975b1408b22e846601b6cccd99c38`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785513696.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`, `shopify-product-sorter/server/src/routes/api.js`, `shopify-product-sorter/server/src/routes/sorter.js`
- **Declared Validation Files**: `tests`
- **Files Exist at Commit / Disk**: `YES (6 files in commit diff)`
- **Test / Artifact Evidence**: Existing test suite or module code at commit 292e70e99ab975b1408b22e846601b6cccd99c38
- **Dependency State**: `BE-001, OWN-002`
- **Exact Minimum Action Required**: Run shared batch regression test suite and confirm 100% pass.
- **Reimplementation Required**: **NO**

### BE-003: Create a SKU Image Manager router
- **Classification**: `B. RESTORE_AFTER_BATCH_VALIDATION`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `641bf31046bc8f6f0f3bde8c8b487411225a6b8b`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`, `shopify-product-sorter/server/src/routes/api.js`, `shopify-product-sorter/server/src/routes/skuMedia.js`
- **Declared Validation Files**: `tests`
- **Files Exist at Commit / Disk**: `YES (5 files in commit diff)`
- **Test / Artifact Evidence**: Existing test suite or module code at commit 641bf31046bc8f6f0f3bde8c8b487411225a6b8b
- **Dependency State**: `BE-001, OWN-004`
- **Exact Minimum Action Required**: Run shared batch regression test suite and confirm 100% pass.
- **Reimplementation Required**: **NO**

### BE-004: Create a Sales Intelligence router
- **Classification**: `B. RESTORE_AFTER_BATCH_VALIDATION`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `d9cdfb53ce79cdafd43b42d5b7c88b55d4e0325f`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: `tests`
- **Files Exist at Commit / Disk**: `YES (3 files in commit diff)`
- **Test / Artifact Evidence**: Existing test suite or module code at commit d9cdfb53ce79cdafd43b42d5b7c88b55d4e0325f
- **Dependency State**: `BE-001, OWN-005`
- **Exact Minimum Action Required**: Run shared batch regression test suite and confirm 100% pass.
- **Reimplementation Required**: **NO**

### BE-005: Preserve existing backend URLs with adapters
- **Classification**: `B. RESTORE_AFTER_BATCH_VALIDATION`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `8003f19e0f7c2d752bd228ef69ee2ddfec6e3377`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: `tests`
- **Files Exist at Commit / Disk**: `YES (3 files in commit diff)`
- **Test / Artifact Evidence**: Existing test suite or module code at commit 8003f19e0f7c2d752bd228ef69ee2ddfec6e3377
- **Dependency State**: `BE-001, TEST-008`
- **Exact Minimum Action Required**: Run shared batch regression test suite and confirm 100% pass.
- **Reimplementation Required**: **NO**

### BE-006: Create application-owned service boundaries
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `161a62bea3a3b38dbdbac592caf8ca9d96e6b564`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit 161a62bea3a3b38dbdbac592caf8ca9d96e6b564 contains 4 files
- **Dependency State**: `OWN-002, OWN-003, OWN-004, OWN-005, OWN-006`
- **Exact Minimum Action Required**: Backfill changed_files from commit 161a62bea3a3b38dbdbac592caf8ca9d96e6b564 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### BE-007: Remove hidden cross-application imports
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `c2beccc557ad69a49bf64cd1938ceab2b422edc1`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit c2beccc557ad69a49bf64cd1938ceab2b422edc1 contains 4 files
- **Dependency State**: `BE-006`
- **Exact Minimum Action Required**: Backfill changed_files from commit c2beccc557ad69a49bf64cd1938ceab2b422edc1 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### BE-009: Standardize structured logging
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `de400fb687c88de9cc2adb1d40f2bdfe0b8e9f99`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit de400fb687c88de9cc2adb1d40f2bdfe0b8e9f99 contains 4 files
- **Dependency State**: `OWN-006, BE-006`
- **Exact Minimum Action Required**: Backfill changed_files from commit de400fb687c88de9cc2adb1d40f2bdfe0b8e9f99 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### BE-010: Isolate startup migrations and side effects
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `b541301855c7e7b41f3d7647fb70fc873d8c9108`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit b541301855c7e7b41f3d7647fb70fc873d8c9108 contains 4 files
- **Dependency State**: `TEST-009, SAFE-004`
- **Exact Minimum Action Required**: Backfill changed_files from commit b541301855c7e7b41f3d7647fb70fc873d8c9108 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### BE-011: Resolve duplicate collection reorder handlers
- **Classification**: `B. RESTORE_AFTER_BATCH_VALIDATION`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `cde861527ee8a6ab1efe5008bf41f6067e5e82cd`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: `tests`
- **Files Exist at Commit / Disk**: `YES (3 files in commit diff)`
- **Test / Artifact Evidence**: Existing test suite or module code at commit cde861527ee8a6ab1efe5008bf41f6067e5e82cd
- **Dependency State**: `TEST-003, BE-002, BE-005`
- **Exact Minimum Action Required**: Run shared batch regression test suite and confirm 100% pass.
- **Reimplementation Required**: **NO**

### FE-001: Extract the application shell
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `c1298ca3ec7f2d7c96ee99ce1db94210e8d7597d`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit c1298ca3ec7f2d7c96ee99ce1db94210e8d7597d contains 4 files
- **Dependency State**: `TEST-011, OWN-001`
- **Exact Minimum Action Required**: Backfill changed_files from commit c1298ca3ec7f2d7c96ee99ce1db94210e8d7597d into tasks.json metadata.
- **Reimplementation Required**: **NO**

### FE-002: Extract navigation ownership
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `57a1713e33e398fe34b299f188d67a69da994874`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit 57a1713e33e398fe34b299f188d67a69da994874 contains 4 files
- **Dependency State**: `FE-001, OWN-007`
- **Exact Minimum Action Required**: Backfill changed_files from commit 57a1713e33e398fe34b299f188d67a69da994874 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### FE-003: Introduce explicit routing while preserving URLs
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `754db5d20d17a7da805828bdd73748c5d9b6da94`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit 754db5d20d17a7da805828bdd73748c5d9b6da94 contains 4 files
- **Dependency State**: `TEST-008, FE-001`
- **Exact Minimum Action Required**: Backfill changed_files from commit 754db5d20d17a7da805828bdd73748c5d9b6da94 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### FE-004: Extract the Sorter feature
- **Classification**: `B. RESTORE_AFTER_BATCH_VALIDATION`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `beda37806619f919a99aa09ea9b4c39ec31b5820`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785519468.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: `tests`
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Existing test suite or module code at commit beda37806619f919a99aa09ea9b4c39ec31b5820
- **Dependency State**: `FE-001, OWN-002, TEST-001, TEST-002`
- **Exact Minimum Action Required**: Run shared batch regression test suite and confirm 100% pass.
- **Reimplementation Required**: **NO**

### FE-005: Extract the SKU Image Manager feature
- **Classification**: `B. RESTORE_AFTER_BATCH_VALIDATION`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `d564698e2c0cd398bf05056e64f9b947e6995c91`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785507527.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: `tests`
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Existing test suite or module code at commit d564698e2c0cd398bf05056e64f9b947e6995c91
- **Dependency State**: `FE-001, OWN-004, TEST-006`
- **Exact Minimum Action Required**: Run shared batch regression test suite and confirm 100% pass.
- **Reimplementation Required**: **NO**

### FE-006: Retain Order Mapping compatibility boundary
- **Classification**: `B. RESTORE_AFTER_BATCH_VALIDATION`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `ebbcc688abffd6af81745b6e0231b5efa294c56e`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785507728.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: `tests`
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Existing test suite or module code at commit ebbcc688abffd6af81745b6e0231b5efa294c56e
- **Dependency State**: `FE-003, OWN-003`
- **Exact Minimum Action Required**: Run shared batch regression test suite and confirm 100% pass.
- **Reimplementation Required**: **NO**

### FE-007: Separate application state
- **Classification**: `B. RESTORE_AFTER_BATCH_VALIDATION`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `7fed269d4dddac965b9e38ba4e299aa346bb9493`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785519488.json`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785520498.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: `client/src/frontendRegression.test.js`
- **Files Exist at Commit / Disk**: `YES (5 files in commit diff)`
- **Test / Artifact Evidence**: Existing test suite or module code at commit 7fed269d4dddac965b9e38ba4e299aa346bb9493
- **Dependency State**: `FE-004, FE-005, FE-006`
- **Exact Minimum Action Required**: Run shared batch regression test suite and confirm 100% pass.
- **Reimplementation Required**: **NO**

### FE-008: Separate frontend API clients
- **Classification**: `D. NEEDS_EXISTING_DIRTY_WORK_COMMITTED`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Dirty working tree`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `NO`
- **Declared Implementation Files**: `client/src/sorterApi.js`, `client/src/skuImageApi.js`, `client/src/salesIntelligenceApi.js`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (Artifact/File verified on disk)`
- **Test / Artifact Evidence**: Uncommitted client/src/{sorterApi,skuImageApi,salesIntelligenceApi}.js files on disk
- **Dependency State**: `FE-004, FE-005, FE-006, BE-005`
- **Exact Minimum Action Required**: Stage and commit existing separated frontend API client files from working tree.
- **Reimplementation Required**: **NO**

### FE-009: Isolate styles and remove global leakage
- **Classification**: `E. GENUINELY_INCOMPLETE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `None`
- **Commit Exists Locally & Remotely**: Local: `NO` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `NO`
- **Test / Artifact Evidence**: None
- **Dependency State**: `FE-001, FE-004, FE-005, FE-006`
- **Exact Minimum Action Required**: Design and write implementation code and tests.
- **Reimplementation Required**: **YES**

### FE-010: Add feature error and loading boundaries
- **Classification**: `E. GENUINELY_INCOMPLETE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `None`
- **Commit Exists Locally & Remotely**: Local: `NO` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `NO`
- **Test / Artifact Evidence**: None
- **Dependency State**: `FE-003, FE-007`
- **Exact Minimum Action Required**: Design and write implementation code and tests.
- **Reimplementation Required**: **YES**

### FE-011: Add frontend regression tests and classify placeholders
- **Classification**: `E. GENUINELY_INCOMPLETE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `None`
- **Commit Exists Locally & Remotely**: Local: `NO` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `NO`
- **Test / Artifact Evidence**: None
- **Dependency State**: `FE-002, FE-003, FE-004, FE-005, FE-006, FE-007, FE-008, FE-009, FE-010`
- **Exact Minimum Action Required**: Design and write implementation code and tests.
- **Reimplementation Required**: **YES**

### INT-001: Inventory and contract Shopify clients
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `1791793de9c89144a78dfff5df6d17c13ab79a39`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit 1791793de9c89144a78dfff5df6d17c13ab79a39 contains 4 files
- **Dependency State**: `OWN-010`
- **Exact Minimum Action Required**: Backfill changed_files from commit 1791793de9c89144a78dfff5df6d17c13ab79a39 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### INT-002: Define shared Shopify transport
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `d862883fad6107036dbee361ff05e114e78c6d7c`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit d862883fad6107036dbee361ff05e114e78c6d7c contains 4 files
- **Dependency State**: `INT-001, TEST-003`
- **Exact Minimum Action Required**: Backfill changed_files from commit d862883fad6107036dbee361ff05e114e78c6d7c into tasks.json metadata.
- **Reimplementation Required**: **NO**

### INT-003: Keep Shopify business logic app-owned
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `605678c1eaea3f117312cf144bbc8da4b21332a7`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit 605678c1eaea3f117312cf144bbc8da4b21332a7 contains 4 files
- **Dependency State**: `INT-002, OWN-002, OWN-003, OWN-004, OWN-005`
- **Exact Minimum Action Required**: Backfill changed_files from commit 605678c1eaea3f117312cf144bbc8da4b21332a7 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### INT-004: Inventory and contract Shiprocket clients
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `f22a5af78e06cd4888f951fe2f767510e77c1d7b`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit f22a5af78e06cd4888f951fe2f767510e77c1d7b contains 4 files
- **Dependency State**: `OWN-010, TEST-004`
- **Exact Minimum Action Required**: Backfill changed_files from commit f22a5af78e06cd4888f951fe2f767510e77c1d7b into tasks.json metadata.
- **Reimplementation Required**: **NO**

### INT-005: Define shared Shiprocket transport
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `1e845b181d0044a42a4c780968efa1165be41371`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit 1e845b181d0044a42a4c780968efa1165be41371 contains 4 files
- **Dependency State**: `INT-004`
- **Exact Minimum Action Required**: Backfill changed_files from commit 1e845b181d0044a42a4c780968efa1165be41371 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### INT-007: Standardize retries, rate limits, and errors
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `4bd0e530c6751f784eb37101490187bf217deefd`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit 4bd0e530c6751f784eb37101490187bf217deefd contains 4 files
- **Dependency State**: `INT-002, INT-005`
- **Exact Minimum Action Required**: Backfill changed_files from commit 4bd0e530c6751f784eb37101490187bf217deefd into tasks.json metadata.
- **Reimplementation Required**: **NO**

### INT-008: Add deterministic integration mocks
- **Classification**: `B. RESTORE_AFTER_BATCH_VALIDATION`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Repo code`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: `tests`
- **Files Exist at Commit / Disk**: `NO`
- **Test / Artifact Evidence**: Existing test suite or module code at commit head
- **Dependency State**: `INT-002, INT-005, TEST-012`
- **Exact Minimum Action Required**: Run shared batch regression test suite and confirm 100% pass.
- **Reimplementation Required**: **NO**

### INT-009: Remove duplicate clients after usage proof
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Artifact/Doc`
- **Commit Exists Locally & Remotely**: Local: `NO` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (Artifact/File verified on disk)`
- **Test / Artifact Evidence**: Verified removal of 7 dead legacy client/service files
- **Dependency State**: `INT-003, INT-007, INT-008`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### INT-010: Verify provider contracts and API-version compatibility
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `4f6d26d90d40f68f5446a9237844afab11912186`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (15 files in commit diff)`
- **Test / Artifact Evidence**: Commit 4f6d26d90d40f68f5446a9237844afab11912186 contains 15 files
- **Dependency State**: `INT-008, BE-005`
- **Exact Minimum Action Required**: Backfill changed_files from commit 4f6d26d90d40f68f5446a9237844afab11912186 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### DATA-002: Document SQLite table ownership
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `9c8e78e7ec986fdb1060079d05652d54e5af828b`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785509281.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: `server/src/services/orderMappingMigrations.test.js`
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Durable spec/doc or artifact verified
- **Dependency State**: `OWN-003, OWN-008`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### DATA-004: Separate SKU audit data
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `6b31f143a685f979ef45b76f60213abae1911403`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785509468.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: `server/src/services/actualSalesService.test.js`
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Durable spec/doc or artifact verified
- **Dependency State**: `OWN-004, OWN-009`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### DATA-005: Separate Sales Intelligence caches
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `28e6715046cc385bf23ace99c9641157430ba287`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785509593.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Durable spec/doc or artifact verified
- **Dependency State**: `OWN-005, OWN-009`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### DATA-006: Isolate Order Mapping PostgreSQL/migration state
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `78223a36a373dc47d6c05327b1be10e14364a462`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785509745.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Durable spec/doc or artifact verified
- **Dependency State**: `SAFE-004, OWN-003, BE-010`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### DATA-012: Validate PostgreSQL backup and restore process
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `1ee6ca297aefa6c6dd7748a228a750460499a950`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785509886.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Durable spec/doc or artifact verified
- **Dependency State**: `SAFE-004, SAFE-007, DATA-006`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### OPS-001: Fix or retire obsolete `scripts/dev.mjs`
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `ca40abbec669ae7d1a6a7e225d07afbb376eea9c`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (4 files in commit diff)`
- **Test / Artifact Evidence**: Commit ca40abbec669ae7d1a6a7e225d07afbb376eea9c contains 4 files
- **Dependency State**: `TEST-010, OWN-001`
- **Exact Minimum Action Required**: Backfill changed_files from commit ca40abbec669ae7d1a6a7e225d07afbb376eea9c into tasks.json metadata.
- **Reimplementation Required**: **NO**

### OPS-002: Standardize startup commands
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `d9339c6d7c0d6396234f721952d0a9a1aabb6e2a`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (12 files in commit diff)`
- **Test / Artifact Evidence**: Commit d9339c6d7c0d6396234f721952d0a9a1aabb6e2a contains 12 files
- **Dependency State**: `OPS-001, BE-010`
- **Exact Minimum Action Required**: Backfill changed_files from commit d9339c6d7c0d6396234f721952d0a9a1aabb6e2a into tasks.json metadata.
- **Reimplementation Required**: **NO**

### OPS-003: Standardize health checks
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `85e50fbfc6cfa43b33157aa2d760724464e18bf7`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: `server/src/mocks/integrationMocks.js`, `server/src/services/providerIntegration.test.js`
- **Files Exist at Commit / Disk**: `YES (2 files in commit diff)`
- **Test / Artifact Evidence**: Commit 85e50fbfc6cfa43b33157aa2d760724464e18bf7 contains 2 files
- **Dependency State**: `BE-005, OWN-006`
- **Exact Minimum Action Required**: Backfill changed_files from commit 85e50fbfc6cfa43b33157aa2d760724464e18bf7 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### OPS-004: Standardize diagnostics and safe observability
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `7f56184ee70a1336fa468131972f6dc69b49ea96`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (3 files in commit diff)`
- **Test / Artifact Evidence**: Commit 7f56184ee70a1336fa468131972f6dc69b49ea96 contains 3 files
- **Dependency State**: `OWN-006, BE-009, SEC-006`
- **Exact Minimum Action Required**: Backfill changed_files from commit 7f56184ee70a1336fa468131972f6dc69b49ea96 into tasks.json metadata.
- **Reimplementation Required**: **NO**

### OPS-005: Review and isolate Graphify artifacts
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `4725ea64148387916d77fa192ab6c32c305e5917`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/.tokensave/branch-meta.json`, `shopify-product-sorter/.tokensave/config.json`, `shopify-product-sorter/.tokensave/tokensave.db`, `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785531722.json`, `shopify-product-sorter/docs/architecture/ledger/snapshots/tasks-completed-1785532037.json`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`, `shopify-product-sorter/graphify-out/.graphify_analysis.json`, `shopify-product-sorter/graphify-out/.graphify_ast.json`, `shopify-product-sorter/graphify-out/.graphify_chunk_01.json`, `shopify-product-sorter/graphify-out/.graphify_detect.json`, `shopify-product-sorter/graphify-out/.graphify_extract.json`, `shopify-product-sorter/graphify-out/.graphify_labels.json`, `shopify-product-sorter/graphify-out/.graphify_labels.json.sig`, `shopify-product-sorter/graphify-out/.graphify_python`, `shopify-product-sorter/graphify-out/.graphify_root`, `shopify-product-sorter/graphify-out/.graphify_semantic.json`, `shopify-product-sorter/graphify-out/.graphify_semantic_new.json`, `shopify-product-sorter/graphify-out/.graphify_uncached.txt`, `shopify-product-sorter/graphify-out/cache/ast/v0.9.22/242858f4bc04ad9832c4345c4921636cfc5d4f4d5b257c04f474cc34d544d299.json`, `shopify-product-sorter/graphify-out/cache/ast/v0.9.22/342d9c32446595dad521753443bc3ccd74539943c77681a61a92e029cdf47a3b.json`, `shopify-product-sorter/graphify-out/cache/ast/v0.9.22/4dea100c1acec513cc78d9d0d5786dc47e0a440837aa129a47663a9283243e61.json`, `shopify-product-sorter/graphify-out/cache/ast/v0.9.22/5f19d9b9ae9b7f33f0a25565da49c9ed165ff6d2b3eca214beaf15890b0ee4ea.json`, `shopify-product-sorter/graphify-out/cache/ast/v0.9.22/a1c1cd1e96c7a195a24d09c46711023266be28f3a140bceceb4331807e744bd4.json`, `shopify-product-sorter/graphify-out/cache/ast/v0.9.22/e137ae162f00b57d7cb3876872746c0712da3538d9d53f435eb86ce10fa368b4.json`, `shopify-product-sorter/graphify-out/cache/ast/v0.9.22/f34ed3352ef4ed5b763750b8bf05cc70dd783f726b45b6071b4d35e0563c932f.json`, `shopify-product-sorter/graphify-out/cache/last_query_stamp`, `shopify-product-sorter/graphify-out/cache/semantic/pd5fd89c46bb5/1b4b7ff2a84734397f842ab625e3f433ea89ef123affcc164333c9c682a4706f.json`, `shopify-product-sorter/graphify-out/cache/semantic/pd5fd89c46bb5/774e4a32aa2a5dcbecb79e8de75e13402c832707f2f55ffcb57f79e1095ae146.json`, `shopify-product-sorter/graphify-out/cache/semantic/pd5fd89c46bb5/a32f9a3bc3bb7f248b2a3bc22df88d630ae271f95f8c5ba4c540be9129c24d23.json`, `shopify-product-sorter/graphify-out/cache/stat-index.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (32 files in commit diff)`
- **Test / Artifact Evidence**: Durable spec/doc or artifact verified
- **Dependency State**: `OWN-009`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### OPS-006: Review and isolate Tokensave runtime files
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `3519c7c3158cef6051b59cf0548f0fd1047775ec`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (3 files in commit diff)`
- **Test / Artifact Evidence**: Durable spec/doc or artifact verified
- **Dependency State**: `OWN-009, SEC-003`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### OPS-007: Review Playwright artifacts
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `Artifact/Doc`
- **Commit Exists Locally & Remotely**: Local: `NO` | Remote: `NO`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (Artifact/File verified on disk)`
- **Test / Artifact Evidence**: Durable spec/doc or artifact verified
- **Dependency State**: `OWN-009`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### OPS-008: Review test outputs and cache artifacts
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `294d9763555f0fc66e1f2f7a5f548b3fdaad41c9`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (3 files in commit diff)`
- **Test / Artifact Evidence**: Durable spec/doc or artifact verified
- **Dependency State**: `OWN-009`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### SEC-001: Assess authentication boundary
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `a7ad4eaf660311e185c096b29387eaf4e133d3d0`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (3 files in commit diff)`
- **Test / Artifact Evidence**: Durable spec/doc or artifact verified
- **Dependency State**: `OWN-007, OWN-010`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### SEC-002: Add route authorization boundaries
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `2f2869d99cfd37a0c90679b3021ddca21ada1d4c`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (3 files in commit diff)`
- **Test / Artifact Evidence**: Commit 2f2869d99cfd37a0c90679b3021ddca21ada1d4c contains 3 files
- **Dependency State**: `SEC-001, TEST-008`
- **Exact Minimum Action Required**: Backfill changed_files from commit 2f2869d99cfd37a0c90679b3021ddca21ada1d4c into tasks.json metadata.
- **Reimplementation Required**: **NO**

### SEC-003: Correct secret handling and tracked token risk
- **Classification**: `A. RESTORE_WITH_EXISTING_EVIDENCE`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `ce9d2c28a7a9117e6fa9fa62830bbc5f468a8f06`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: `shopify-product-sorter/docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md`, `shopify-product-sorter/docs/architecture/ledger/history.jsonl`, `shopify-product-sorter/docs/architecture/ledger/tasks.json`
- **Declared Validation Files**: None declared
- **Files Exist at Commit / Disk**: `YES (3 files in commit diff)`
- **Test / Artifact Evidence**: Durable spec/doc or artifact verified
- **Dependency State**: `SAFE-005, OWN-010`
- **Exact Minimum Action Required**: Verify document/artifact on disk/git and restore completed status.
- **Reimplementation Required**: **NO**

### SEC-006: Sanitize sensitive logs and diagnostics
- **Classification**: `C. NEEDS_EVIDENCE_BACKFILL`
- **Historical Completed Transition**: undefined
- **Implementation Commit**: `69f1aced4c4adafd0850b4deed8d77e2cbd2b697`
- **Commit Exists Locally & Remotely**: Local: `YES` | Remote: `YES`
- **Declared Implementation Files**: None declared (Metadata gap)
- **Declared Validation Files**: `server/src/services/shopifyMediaService.test.js`
- **Files Exist at Commit / Disk**: `YES (2 files in commit diff)`
- **Test / Artifact Evidence**: Commit 69f1aced4c4adafd0850b4deed8d77e2cbd2b697 contains 2 files
- **Dependency State**: `SEC-003, OWN-006`
- **Exact Minimum Action Required**: Backfill changed_files from commit 69f1aced4c4adafd0850b4deed8d77e2cbd2b697 into tasks.json metadata.
- **Reimplementation Required**: **NO**

---

## Dependency-Aware Batch Restoration Order

The following 73 restorable tasks are ordered strictly according to their prerequisite topological dependencies so that each restored task has all its dependencies in `completed` status before restoration:

1. **SAFE-002** (Capture working-tree and baseline manifest) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `Artifact/Doc` | Action: Verify document/artifact on disk/git and restore completed status.]
2. **SAFE-003** (Confirm SQLite backups) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `Artifact/Doc` | Action: Verify document/artifact on disk/git and restore completed status.]
3. **SAFE-004** (Complete PostgreSQL/Neon backup) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `Artifact/Doc` | Action: Verify document/artifact on disk/git and restore completed status.]
4. **SAFE-005** (Encrypt secret archive) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `Artifact/Doc` | Action: Verify document/artifact on disk/git and restore completed status.]
5. **SAFE-006** (Create off-device backup copy) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `e2bb549c2ec7e7b2291a09750932c80b0ab547e3` | Action: Verify document/artifact on disk/git and restore completed status.]
6. **SAFE-007** (Validate restoration instructions) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `Artifact/Doc` | Action: Verify document/artifact on disk/git and restore completed status.]
7. **SAFE-008** (Record database ownership uncertainties) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `Artifact/Doc` | Action: Verify document/artifact on disk/git and restore completed status.]
8. **TEST-001** (Protect sorter scoring and core logic) — `B. RESTORE_AFTER_BATCH_VALIDATION` [Sha: `Repo code` | Action: Run shared batch regression test suite and confirm 100% pass.]
9. **TEST-002** (Protect collection sync/apply/rollback) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `f3690e88bead0c46576d1e8002e50804b22ade42` | Action: Backfill changed_files from commit f3690e88bead0c46576d1e8002e50804b22ade42 into tasks.json metadata.]
10. **TEST-003** (Protect collection reorder contracts) — `B. RESTORE_AFTER_BATCH_VALIDATION` [Sha: `Repo code` | Action: Run shared batch regression test suite and confirm 100% pass.]
11. **TEST-004** (Protect Order Mapping sync/status lifecycle) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `634ad1afdd9e400e923bb37740b78a758a4a6a2e` | Action: Backfill changed_files from commit 634ad1afdd9e400e923bb37740b78a758a4a6a2e into tasks.json metadata.]
12. **TEST-005** (Protect CSV import and manual overrides) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `7890a0ef38dd5dec9454d0a583edafc3977c2a86` | Action: Backfill changed_files from commit 7890a0ef38dd5dec9454d0a583edafc3977c2a86 into tasks.json metadata.]
13. **TEST-006** (Protect SKU media operations) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `6476c331d12e763ee13d38d8cf38265683e58cdc` | Action: Backfill changed_files from commit 6476c331d12e763ee13d38d8cf38265683e58cdc into tasks.json metadata.]
14. **TEST-007** (Protect Sales Intelligence API contracts) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `360d53ccd88e248acc4ecf48c5a13e9d389c10fd` | Action: Backfill changed_files from commit 360d53ccd88e248acc4ecf48c5a13e9d389c10fd into tasks.json metadata.]
15. **TEST-008** (Protect public route compatibility) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `f42888e6b976829d84acc45ac5c9a0ecfa7671b7` | Action: Backfill changed_files from commit f42888e6b976829d84acc45ac5c9a0ecfa7671b7 into tasks.json metadata.]
16. **TEST-009** (Protect database migration safety) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `86cfc4d239e91662a9ca93b410a7d51935545195` | Action: Backfill changed_files from commit 86cfc4d239e91662a9ca93b410a7d51935545195 into tasks.json metadata.]
17. **TEST-010** (Protect startup and environment isolation) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `b23cb9a2f00b5e375777fad515c80198617ca3a4` | Action: Backfill changed_files from commit b23cb9a2f00b5e375777fad515c80198617ca3a4 into tasks.json metadata.]
18. **TEST-011** (Protect frontend navigation) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `df88049c65d9d79ecd2ff2eb7b80b535892426e5` | Action: Backfill changed_files from commit df88049c65d9d79ecd2ff2eb7b80b535892426e5 into tasks.json metadata.]
19. **TEST-012** (Add integrated existing-app regression gate) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `e6e41918ab44115f82ac46eb5c920e22e7f07d6d` | Action: Backfill changed_files from commit e6e41918ab44115f82ac46eb5c920e22e7f07d6d into tasks.json metadata.]
20. **OWN-001** (Establish canonical application names and statuses) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `Artifact/Doc` | Action: Verify document/artifact on disk/git and restore completed status.]
21. **OWN-002** (Define Product Sorter boundary) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `Artifact/Doc` | Action: Verify document/artifact on disk/git and restore completed status.]
22. **OWN-003** (Classify Order Mapping versus legacy Delivery Resolution) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `77e237a2fc9b042546976255b522af9bce8381af` | Action: Verify document/artifact on disk/git and restore completed status.]
23. **OWN-004** (Define SKU Image Manager boundary) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `43c636777b7e1e62947ee14f0cdc0b918f952445` | Action: Verify document/artifact on disk/git and restore completed status.]
24. **OWN-005** (Define Actual Sales Intelligence boundary) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `4eb661e4191baa1e20f8c2cf5ab85655b0906978` | Action: Verify document/artifact on disk/git and restore completed status.]
25. **OWN-006** (Define System Diagnostics ownership) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `25de38d76639b4d48e2cde564482bee7c278131f` | Action: Verify document/artifact on disk/git and restore completed status.]
26. **OWN-007** (Approve route ownership matrix) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `c201983c0fc7cfd6b65a161d0eaebfb4b0ff169c` | Action: Verify document/artifact on disk/git and restore completed status.]
27. **OWN-008** (Approve data ownership matrix) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `87ff3ea1e36fb81e85e8da123e2a1256d022d330` | Action: Verify document/artifact on disk/git and restore completed status.]
28. **OWN-009** (Approve runtime file ownership) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `e370e61f093543a571ebe09449b577677e7861a2` | Action: Verify document/artifact on disk/git and restore completed status.]
29. **OWN-010** (Approve integration and environment ownership) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `03a2c632d37d36e9b127840508b67af99e2c87aa` | Action: Verify document/artifact on disk/git and restore completed status.]
30. **BE-001** (Split the generic API router) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `e8c2b9f7cb43dde0ac66d20a11a5937f9f587163` | Action: Backfill changed_files from commit e8c2b9f7cb43dde0ac66d20a11a5937f9f587163 into tasks.json metadata.]
31. **BE-002** (Create a Sorter router) — `B. RESTORE_AFTER_BATCH_VALIDATION` [Sha: `292e70e99ab975b1408b22e846601b6cccd99c38` | Action: Run shared batch regression test suite and confirm 100% pass.]
32. **BE-003** (Create a SKU Image Manager router) — `B. RESTORE_AFTER_BATCH_VALIDATION` [Sha: `641bf31046bc8f6f0f3bde8c8b487411225a6b8b` | Action: Run shared batch regression test suite and confirm 100% pass.]
33. **BE-004** (Create a Sales Intelligence router) — `B. RESTORE_AFTER_BATCH_VALIDATION` [Sha: `d9cdfb53ce79cdafd43b42d5b7c88b55d4e0325f` | Action: Run shared batch regression test suite and confirm 100% pass.]
34. **BE-005** (Preserve existing backend URLs with adapters) — `B. RESTORE_AFTER_BATCH_VALIDATION` [Sha: `8003f19e0f7c2d752bd228ef69ee2ddfec6e3377` | Action: Run shared batch regression test suite and confirm 100% pass.]
35. **BE-006** (Create application-owned service boundaries) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `161a62bea3a3b38dbdbac592caf8ca9d96e6b564` | Action: Backfill changed_files from commit 161a62bea3a3b38dbdbac592caf8ca9d96e6b564 into tasks.json metadata.]
36. **BE-007** (Remove hidden cross-application imports) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `c2beccc557ad69a49bf64cd1938ceab2b422edc1` | Action: Backfill changed_files from commit c2beccc557ad69a49bf64cd1938ceab2b422edc1 into tasks.json metadata.]
37. **BE-009** (Standardize structured logging) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `de400fb687c88de9cc2adb1d40f2bdfe0b8e9f99` | Action: Backfill changed_files from commit de400fb687c88de9cc2adb1d40f2bdfe0b8e9f99 into tasks.json metadata.]
38. **BE-010** (Isolate startup migrations and side effects) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `b541301855c7e7b41f3d7647fb70fc873d8c9108` | Action: Backfill changed_files from commit b541301855c7e7b41f3d7647fb70fc873d8c9108 into tasks.json metadata.]
39. **BE-011** (Resolve duplicate collection reorder handlers) — `B. RESTORE_AFTER_BATCH_VALIDATION` [Sha: `cde861527ee8a6ab1efe5008bf41f6067e5e82cd` | Action: Run shared batch regression test suite and confirm 100% pass.]
40. **FE-001** (Extract the application shell) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `c1298ca3ec7f2d7c96ee99ce1db94210e8d7597d` | Action: Backfill changed_files from commit c1298ca3ec7f2d7c96ee99ce1db94210e8d7597d into tasks.json metadata.]
41. **FE-002** (Extract navigation ownership) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `57a1713e33e398fe34b299f188d67a69da994874` | Action: Backfill changed_files from commit 57a1713e33e398fe34b299f188d67a69da994874 into tasks.json metadata.]
42. **FE-003** (Introduce explicit routing while preserving URLs) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `754db5d20d17a7da805828bdd73748c5d9b6da94` | Action: Backfill changed_files from commit 754db5d20d17a7da805828bdd73748c5d9b6da94 into tasks.json metadata.]
43. **FE-004** (Extract the Sorter feature) — `B. RESTORE_AFTER_BATCH_VALIDATION` [Sha: `beda37806619f919a99aa09ea9b4c39ec31b5820` | Action: Run shared batch regression test suite and confirm 100% pass.]
44. **FE-005** (Extract the SKU Image Manager feature) — `B. RESTORE_AFTER_BATCH_VALIDATION` [Sha: `d564698e2c0cd398bf05056e64f9b947e6995c91` | Action: Run shared batch regression test suite and confirm 100% pass.]
45. **FE-006** (Retain Order Mapping compatibility boundary) — `B. RESTORE_AFTER_BATCH_VALIDATION` [Sha: `ebbcc688abffd6af81745b6e0231b5efa294c56e` | Action: Run shared batch regression test suite and confirm 100% pass.]
46. **FE-007** (Separate application state) — `B. RESTORE_AFTER_BATCH_VALIDATION` [Sha: `7fed269d4dddac965b9e38ba4e299aa346bb9493` | Action: Run shared batch regression test suite and confirm 100% pass.]
47. **FE-008** (Separate frontend API clients) — `D. NEEDS_EXISTING_DIRTY_WORK_COMMITTED` [Sha: `Dirty working tree` | Action: Stage and commit existing separated frontend API client files from working tree.]
48. **INT-001** (Inventory and contract Shopify clients) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `1791793de9c89144a78dfff5df6d17c13ab79a39` | Action: Backfill changed_files from commit 1791793de9c89144a78dfff5df6d17c13ab79a39 into tasks.json metadata.]
49. **INT-002** (Define shared Shopify transport) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `d862883fad6107036dbee361ff05e114e78c6d7c` | Action: Backfill changed_files from commit d862883fad6107036dbee361ff05e114e78c6d7c into tasks.json metadata.]
50. **INT-003** (Keep Shopify business logic app-owned) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `605678c1eaea3f117312cf144bbc8da4b21332a7` | Action: Backfill changed_files from commit 605678c1eaea3f117312cf144bbc8da4b21332a7 into tasks.json metadata.]
51. **INT-004** (Inventory and contract Shiprocket clients) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `f22a5af78e06cd4888f951fe2f767510e77c1d7b` | Action: Backfill changed_files from commit f22a5af78e06cd4888f951fe2f767510e77c1d7b into tasks.json metadata.]
52. **INT-005** (Define shared Shiprocket transport) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `1e845b181d0044a42a4c780968efa1165be41371` | Action: Backfill changed_files from commit 1e845b181d0044a42a4c780968efa1165be41371 into tasks.json metadata.]
53. **INT-007** (Standardize retries, rate limits, and errors) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `4bd0e530c6751f784eb37101490187bf217deefd` | Action: Backfill changed_files from commit 4bd0e530c6751f784eb37101490187bf217deefd into tasks.json metadata.]
54. **INT-008** (Add deterministic integration mocks) — `B. RESTORE_AFTER_BATCH_VALIDATION` [Sha: `Repo code` | Action: Run shared batch regression test suite and confirm 100% pass.]
55. **INT-009** (Remove duplicate clients after usage proof) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `Artifact/Doc` | Action: Verify document/artifact on disk/git and restore completed status.]
56. **INT-010** (Verify provider contracts and API-version compatibility) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `4f6d26d90d40f68f5446a9237844afab11912186` | Action: Backfill changed_files from commit 4f6d26d90d40f68f5446a9237844afab11912186 into tasks.json metadata.]
57. **DATA-002** (Document SQLite table ownership) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `9c8e78e7ec986fdb1060079d05652d54e5af828b` | Action: Verify document/artifact on disk/git and restore completed status.]
58. **DATA-004** (Separate SKU audit data) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `6b31f143a685f979ef45b76f60213abae1911403` | Action: Verify document/artifact on disk/git and restore completed status.]
59. **DATA-005** (Separate Sales Intelligence caches) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `28e6715046cc385bf23ace99c9641157430ba287` | Action: Verify document/artifact on disk/git and restore completed status.]
60. **DATA-006** (Isolate Order Mapping PostgreSQL/migration state) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `78223a36a373dc47d6c05327b1be10e14364a462` | Action: Verify document/artifact on disk/git and restore completed status.]
61. **DATA-012** (Validate PostgreSQL backup and restore process) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `1ee6ca297aefa6c6dd7748a228a750460499a950` | Action: Verify document/artifact on disk/git and restore completed status.]
62. **OPS-001** (Fix or retire obsolete `scripts/dev.mjs`) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `ca40abbec669ae7d1a6a7e225d07afbb376eea9c` | Action: Backfill changed_files from commit ca40abbec669ae7d1a6a7e225d07afbb376eea9c into tasks.json metadata.]
63. **OPS-002** (Standardize startup commands) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `d9339c6d7c0d6396234f721952d0a9a1aabb6e2a` | Action: Backfill changed_files from commit d9339c6d7c0d6396234f721952d0a9a1aabb6e2a into tasks.json metadata.]
64. **OPS-003** (Standardize health checks) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `85e50fbfc6cfa43b33157aa2d760724464e18bf7` | Action: Backfill changed_files from commit 85e50fbfc6cfa43b33157aa2d760724464e18bf7 into tasks.json metadata.]
65. **SEC-003** (Correct secret handling and tracked token risk) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `ce9d2c28a7a9117e6fa9fa62830bbc5f468a8f06` | Action: Verify document/artifact on disk/git and restore completed status.]
66. **SEC-006** (Sanitize sensitive logs and diagnostics) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `69f1aced4c4adafd0850b4deed8d77e2cbd2b697` | Action: Backfill changed_files from commit 69f1aced4c4adafd0850b4deed8d77e2cbd2b697 into tasks.json metadata.]
67. **OPS-004** (Standardize diagnostics and safe observability) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `7f56184ee70a1336fa468131972f6dc69b49ea96` | Action: Backfill changed_files from commit 7f56184ee70a1336fa468131972f6dc69b49ea96 into tasks.json metadata.]
68. **OPS-005** (Review and isolate Graphify artifacts) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `4725ea64148387916d77fa192ab6c32c305e5917` | Action: Verify document/artifact on disk/git and restore completed status.]
69. **OPS-006** (Review and isolate Tokensave runtime files) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `3519c7c3158cef6051b59cf0548f0fd1047775ec` | Action: Verify document/artifact on disk/git and restore completed status.]
70. **OPS-007** (Review Playwright artifacts) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `Artifact/Doc` | Action: Verify document/artifact on disk/git and restore completed status.]
71. **OPS-008** (Review test outputs and cache artifacts) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `294d9763555f0fc66e1f2f7a5f548b3fdaad41c9` | Action: Verify document/artifact on disk/git and restore completed status.]
72. **SEC-001** (Assess authentication boundary) — `A. RESTORE_WITH_EXISTING_EVIDENCE` [Sha: `a7ad4eaf660311e185c096b29387eaf4e133d3d0` | Action: Verify document/artifact on disk/git and restore completed status.]
73. **SEC-002** (Add route authorization boundaries) — `C. NEEDS_EVIDENCE_BACKFILL` [Sha: `2f2869d99cfd37a0c90679b3021ddca21ada1d4c` | Action: Backfill changed_files from commit 2f2869d99cfd37a0c90679b3021ddca21ada1d4c into tasks.json metadata.]

---

## Expected Ledger State Post-Recovery

| Task Status | Current Count | Post-Recovery Expected Count | Net Change |
| :--- | :---: | :---: | :---: |
| **Completed** | 2 | **75** | +73 |
| **Validation Pending** | 76 | **0** | -76 |
| **Not Started** | 40 | **43** | +3 (`FE-009`, `FE-010`, `FE-011` transitioned to `not_started`) |
| **Blocked** | 3 | **3** (`DATA-001`, `CLEAN-001`, `CLEAN-002`) | 0 |
| **Deferred** | 8 | **8** | 0 |
| **TOTAL TASKS** | **129** | **129** | **0** |
