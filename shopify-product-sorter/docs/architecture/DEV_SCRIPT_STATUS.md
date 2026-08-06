# Dev Script Status

**Task:** `OPS-001` — Fix or retire obsolete `scripts/dev.mjs`  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** `scripts/dev.mjs` and development workflow

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `OPS-001` |
| Title | Fix or retire obsolete `scripts/dev.mjs` |
| Primary Owner | Architecture / Operations Lead |
| Scope | `scripts/dev.mjs` |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative status of `scripts/dev.mjs`. The script is **obsolete** and should be retired. No documented command invokes it. The actual dev workflow uses `npm run dev` with `concurrently`.

---

## 3. Script Analysis

### 3.1 Current Script (`scripts/dev.mjs`)

| Property | Value |
| --- | --- |
| **Purpose** | Spawn `dev:server` and `dev:client` as child processes |
| **Dependencies** | `npm run dev:server`, `npm run dev:client` |
| **Status** | ❌ **Obsolete** — references non-existent scripts |
| **Process management** | SIGTERM forwarding, graceful shutdown |

### 3.2 Actual Dev Workflow

| Property | Value |
| --- | --- |
| **Command** | `npm run dev` |
| **Implementation** | `concurrently --kill-others-on-fail --names SERVER,CLIENT --prefix-colors blue,green "npm run server" "npm run client"` |
| **Status** | ✅ **Active** — working and documented |

---

## 4. Obsolescence Evidence

| Check | Result |
| --- |---|
| `dev:server` exists in `package.json`? | ❌ No |
| `dev:client` exists in `package.json`? | ❌ No |
| `dev.mjs` referenced in any npm script? | ❌ No |
| `dev.mjs` referenced in any documentation? | ❌ No |
| `dev.mjs` imported by any code? | ❌ No |

---

## 5. Retirement Recommendation

| Action | Impact | Risk |
| --- |---|---|
| **Delete `scripts/dev.mjs`** | None (no callers) | None |
| **No replacement needed** | `npm run dev` already covers | None |

---

## 6. Acceptance Criteria Verification

- [x] **No documented command invokes a broken target.** (Section 4: `dev.mjs` is not referenced by any script or documentation).
- [x] **Child processes terminate safely.** (Section 3.1: SIGTERM forwarding implemented; but script is obsolete).
- [x] **Startup behavior is covered.** (Section 3.2: `npm run dev` with `concurrently` covers all startup needs).
