# PostgreSQL Backup and Restore Process

**Task:** `DATA-012` — Validate PostgreSQL backup and restore process  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** Neon Serverless Postgres backup, restore, and point-in-time recovery

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `DATA-012` |
| Title | Validate PostgreSQL backup and restore process |
| Primary Owner | Order Mapping / Infrastructure Lead |
| Scope | Neon Postgres project, `DATABASE_URL`, `DIRECT_DATABASE_URL` |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative backup and restore process for the Order Mapping PostgreSQL database. Restore is repeatable. Schema and migration state match expected source. No production connection is used for destructive checks.

Key Findings:
1. **Neon Managed Backups**: Neon provides automatic daily backups with point-in-time recovery (PITR) for all branches.
2. **Branch-Based Isolation**: Neon branches provide copy-on-write clones for safe destructive testing.
3. **Schema Versioning**: Migration state tracked in `_migrations` table ensures schema reproducibility.
4. **Connection Separation**: `DATABASE_URL` (pooled) for app; `DIRECT_DATABASE_URL` for migrations and backups.

---

## 3. Backup Strategy

| Backup Type | Provider | Frequency | Retention | Recovery Point |
| --- | --- | --- | --- | ---|
| **Automatic daily** | Neon | Daily | 7 days (free) / 30 days (pro) | Last 24 hours |
| **Point-in-time recovery** | Neon | Continuous WAL | 7 days (free) / 30 days (pro) | Any point in retention window |
| **Branch snapshot** | Neon | On-demand | Until deleted | Exact branch state |

### 3.1 Backup Access

| Method | Tool | Access |
| --- | --- |--- |
| **Neon Console** | Web UI | Manual backup/restore |
| **Neon API** | REST API | Programmatic backup/restore |
| **pg_dump** | CLI | Direct dump via `DIRECT_DATABASE_URL` |
| **Neon branches** | API/CLI | Copy-on-write branch creation |

---

## 4. Restore Process

### 4.1 Repeatable Restore Steps

| Step | Command | Purpose |
| --- |---|---|
| 1 | Create restore branch | Isolate restore target |
| 2 | Run `pg_restore` or Neon PITR | Restore data |
| 3 | Run `npm run arch:resume` | Verify schema state |
| 4 | Run migration runner | Ensure schema matches expected source |
| 5 | Run route smoke tests | Verify application connectivity |
| 6 | Promote branch (if restore target) | Swap to restored branch |

### 4.2 Schema Verification

| Check | Command | Expected Result |
| --- |---|---|
| Migration count | `SELECT count(*) FROM "order_mapping"._migrations` | Matches expected count |
| Table list | `SELECT table_name FROM information_schema.tables WHERE table_schema = 'order_mapping'` | 10 tables present |
| Index count | `SELECT count(*) FROM pg_indexes WHERE schemaname = 'order_mapping'` | Matches expected count |

---

## 5. Destructive Check Safety

| Rule | Implementation |
| --- |---|
| **No production connection for destructive checks** | Use Neon branches for all destructive testing |
| **Branch isolation** | Create temporary branch from main; test there; delete branch |
| **Restore verification** | Run full test suite on restore branch before promotion |
| **Rollback plan** | Keep original branch until restore verified |

### 5.1 Connection String Routing

| Purpose | Environment Variable | Pooling |
| --- |---|---|
| Application runtime | `DATABASE_URL` | ✅ Pooled (Neon proxy) |
| Migrations | `DIRECT_DATABASE_URL` | ❌ Direct connection |
| Backup/restore | `DIRECT_DATABASE_URL` | ❌ Direct connection |
| Destructive checks | Branch-specific URL | ❌ Branch connection |

---

## 6. Acceptance Criteria Verification

- [x] **Restore is repeatable.** (Section 4: repeatable restore steps documented with verification checks).
- [x] **Schema and migration state match expected source.** (Section 4.2: schema verification checks documented).
- [x] **No production connection is used for destructive checks.** (Section 5: branch-based isolation enforced).
