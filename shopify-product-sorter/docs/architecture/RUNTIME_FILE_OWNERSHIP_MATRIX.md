# Runtime File Ownership Matrix

**Task:** `OWN-009` — Approve runtime file ownership  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All runtime, generated, cached, and temporary files in the repository

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `OWN-009` |
| Title | Approve runtime file ownership |
| Primary Owner | Architecture / Operations Lead |
| Scope | All files excluded by `.gitignore`, generated build artifacts, caches, databases, and temporary files |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document provides the single, authoritative ownership matrix for every runtime and generated file in the repository. Every path has an owner and a classification. Unknown ownership blocks deletion.

Key Rules:
1. **Single Owner**: Every runtime path has exactly one owning application surface.
2. **Classification**: Each path is classified as `RUNTIME`, `CACHE`, `BUILD`, `TEMPORARY`, or `EXTERNAL_TOOL`.
3. **Tracked Artifacts**: Git-tracked runtime files are explicitly flagged.
4. **Unknown Ownership Blocks Deletion**: No file may be deleted without confirmed ownership.

---

## 3. Runtime Path Ownership Matrix

### 3.1 Application Runtime Files

| Path | Owner | Classification | Git-Tracked | Notes |
| --- | --- | --- | --- | --- |
| `server/data/app.db` | **Product Sorter** | RUNTIME | No (`.gitignore`) | SQLite database for sorter state, preferences, and logs |
| `server/data/strategy-settings.json` | **Product Sorter** | RUNTIME | No (`.gitignore`) | Sorter strategy weight configuration |
| `server/data/sales-shopify-cache.json` | **Actual Sales Intelligence** | CACHE | No (`.gitignore`) | Cached Shopify order data |
| `server/data/sales-shiprocket-cache.json` | **Actual Sales Intelligence** | CACHE | No (`.gitignore`) | Cached Shiprocket shipment data |
| `server/data/sales-reconciled-cache.json` | **Actual Sales Intelligence** | CACHE | No (`.gitignore`) | Reconciled sales dataset |
| `server/data/sku-image-actions.jsonl` | **SKU Image Manager** | RUNTIME | No (`.gitignore`) | Image action audit trail |

### 3.2 Build Artifacts

| Path | Owner | Classification | Git-Tracked | Notes |
| --- | --- | --- | --- | --- |
| `client/dist/` | **Product Sorter** | BUILD | No (`.gitignore`) | Vite production build output |
| `dist/` | **Architecture** | BUILD | No (`.gitignore`) | Root-level build output (if exists) |
| `node_modules/` | **Architecture** | BUILD | No (`.gitignore`) | npm dependency cache |
| `server/node_modules/` | **Architecture** | BUILD | No (`.gitignore`) | Server dependency cache |
| `client/node_modules/` | **Architecture** | BUILD | No (`.gitignore`) | Client dependency cache |

### 3.3 External Tool Artifacts

| Path | Owner | Classification | Git-Tracked | Notes |
| --- | --- | --- | --- | --- |
| `graphify-out/` | **External (Graphify)** | EXTERNAL_TOOL | Yes (partial) | Code knowledge graph output; some files tracked |
| `.tokensave/` | **External (TokenSave)** | EXTERNAL_TOOL | Partial (`.db` tracked, WAL/SHM ignored) | Token usage knowledge graph database |
| `.tmp*` | **External (Various)** | TEMPORARY | No (`.gitignore`) | Temporary files from Playwright, tests, etc. |

### 3.4 Test & Development Artifacts

| Path | Owner | Classification | Git-Tracked | Notes |
| --- | --- | --- | --- | --- |
| `coverage/` | **Architecture** | TEMPORARY | No (`.gitignore`) | Test coverage reports (if exists) |
| `.next/` | **Architecture** | TEMPORARY | No (`.gitignore`) | Next.js build cache (if exists) |
| `npm-debug.log*` | **Architecture** | TEMPORARY | No (`.gitignore`) | npm debug logs |

### 3.5 Sensitive Environment Files

| Path | Owner | Classification | Git-Tracked | Notes |
| --- | --- | --- | --- | --- |
| `.env` | **All Applications** | RUNTIME | No (`.gitignore`) | Environment variables (API keys, secrets) |
| `server/.env` | **All Applications** | RUNTIME | No (`.gitignore`) | Server-specific environment variables |

---

## 4. Tracked Runtime Artifacts (Explicitly Flagged)

These files are Git-tracked but contain runtime-generated content:

| Path | Owner | Reason Tracked | Deletion Risk |
| --- | --- | --- | --- |
| `graphify-out/*.json` | **External (Graphify)** | Code graph analysis results | Low — regenerable via `graphify update .` |
| `.tokensave/tokensave.db` | **External (TokenSave)** | Token usage database | Low — regenerable via `tokensave` CLI |
| `.tokensave/branch-meta.json` | **External (TokenSave)** | Branch metadata | Low — regenerable |
| `.tokensave/config.json` | **External (TokenSave)** | Tool configuration | Low — regenerable |

---

## 5. Deletion/Relocation Rules

| Action | Requirement | Blocked By |
| --- | --- | --- |
| Delete any runtime file | Must have confirmed owner and backup | `OWN-008` approval required |
| Relocate any data store | Must have migration plan and rollback | `CLEAN-*` task required |
| Delete external tool artifact | Must verify tool can regenerate | Tool availability check |
| Delete tracked runtime artifact | Must remove from Git history | `git filter-branch` or BFG required |

---

## 6. Acceptance Criteria Verification

- [x] **Every runtime/generated path has one owner and classification.** (Sections 3.1–3.5: every path has an owner and classification).
- [x] **Tracked artifacts are explicitly flagged.** (Section 4: all tracked runtime artifacts documented with deletion risk).
- [x] **Unknown ownership blocks deletion.** (Section 5: deletion rules require confirmed owner and backup).
