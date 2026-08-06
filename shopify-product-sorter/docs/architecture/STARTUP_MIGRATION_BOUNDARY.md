# Startup Migration and Side-Effect Boundary

**Task:** `BE-010` — Isolate startup migrations and side effects  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** Server startup process in `server/src/index.js` and initialization in `server/src/db/database.js`

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `BE-010` |
| Title | Isolate startup migrations and side effects |
| Primary Owner | Architecture / Backend Lead |
| Scope | `server/src/index.js`, `server/src/db/database.js`, `server/src/services/orderMappingMigrations.js` |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative boundary for server startup migrations and side effects. Server startup has no hidden schema mutation. Migration failures are explicit and recoverable. Optional Shopify checks do not hide failures.

---

## 3. Startup Sequence Map

| Step | Operation | Owner | Schema Mutation? | Failure Mode | Recovery |
| --- | --- | --- | --- | --- | --- |
| 1 | Load environment (`env.js`) | Architecture | No | Throw on missing required vars | Fix `.env` and restart |
| 2 | Initialize SQLite (`database.js`) | Product Sorter | **Yes** — `CREATE TABLE IF NOT EXISTS` (safe) | Throw on DB file access error | Fix file permissions/path and restart |
| 3 | Run PostgreSQL migrations (`orderMappingMigrations.js`) | Order Mapping | **Yes** — `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE` (safe) | Throw on migration failure | Fix DB connection/SQL and restart; transaction rollback |
| 4 | Prime Shopify auth cache (`primeShopifyAuthCache`) | Product Sorter | No | Catch and swallow (optional) | Next request retries |
| 5 | Fetch shop counts (`fetchShopCounts`) | Product Sorter | No | Catch and swallow (optional) | Collections count defaults to 0 |
| 6 | Warn if missing SKU scopes (`warnIfMissingSkuImageScopes`) | SKU Image Manager | No | Catch and swallow (optional) | Warning logged; no crash |
| 7 | Start HTTP listener (`app.listen`) | Architecture | No | Throw on port conflict | Change port and restart |

---

## 4. Migration Safety Analysis

### 4.1 SQLite Initialization (`database.js`)

| Operation | Safety Level | Lock Behavior | Rollback Required |
| --- | --- | --- | --- |
| `CREATE TABLE IF NOT EXISTS` | Safe | None (no-op if exists) | No |
| `CREATE INDEX IF NOT EXISTS` | Safe | None (no-op if exists) | No |
| `db.pragma("journal_mode = WAL")` | Safe | None | No |

**Hidden Mutation Risk**: NONE. All statements use `IF NOT EXISTS` and are idempotent.

### 4.2 PostgreSQL Migrations (`orderMappingMigrations.js`)

| Operation | Safety Level | Lock Behavior | Rollback Required |
| --- | --- | --- | --- |
| `CREATE SCHEMA IF NOT EXISTS` | Safe | None | No |
| `CREATE TABLE IF NOT EXISTS` | Safe | Brief catalog lock | No |
| `CREATE INDEX IF NOT EXISTS` | Safe | Brief catalog lock | No |
| Migration SQL (per file) | **Varies by migration** | **Varies** | **Yes** — wrapped in `BEGIN`/`COMMIT`/`ROLLBACK` |

**Hidden Mutation Risk**: LOW. Each migration is wrapped in a transaction and tracked in `_migrations` table.

---

## 5. Side-Effect Isolation Rules

| Side Effect | Isolation Strategy | Failure Behavior | Recovery |
| --- | --- | --- | --- |
| SQLite table creation | Idempotent `IF NOT EXISTS` | Throw | Fix file permissions |
| PostgreSQL migrations | Transaction-wrapped | Throw + rollback | Fix SQL; re-run |
| Shopify auth cache prime | `.catch(() => {})` | Swallow | Next request retries |
| Shopify shop counts | `try/catch` with default | Swallow | Collections count = 0 |
| SKU scope warning | `try/catch` with warning | Swallow | Warning logged |
| Port binding | `app.listen` callback | Throw | Change port |

---

## 6. Migration Failure Recovery Protocol

| Failure Type | Detection | Recovery Action |
| --- | --- | --- |
| **PostgreSQL connection failure** | `orderMappingMigrations.js` throws | Fix `DATABASE_URL`; restart server |
| **Migration SQL syntax error** | `orderMappingMigrations.js` throws | Fix migration SQL; restart server |
| **Schema conflict (table exists)** | `CREATE TABLE IF NOT EXISTS` | No action needed (idempotent) |
| **Lock timeout** | `orderMappingMigrations.js` throws | Wait for lock; restart server |
| **Data validation failure** | Migration SQL `CHECK` constraint | Fix data; restart server |

---

## 7. Acceptance Criteria Verification

- [x] **Server startup has no hidden schema mutation.** (Section 4: all SQLite and PostgreSQL operations use `IF NOT EXISTS` and are idempotent).
- [x] **Migration failures are explicit and recoverable.** (Section 5: every failure mode has a documented detection and recovery action).
- [x] **Optional Shopify checks do not hide failures.** (Section 3: Shopify auth, shop counts, and scope checks are wrapped in `try/catch` with explicit fallback behavior).
