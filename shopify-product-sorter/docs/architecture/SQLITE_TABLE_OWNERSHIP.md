# SQLite Table Ownership

**Task:** `DATA-002` — Document SQLite table ownership  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All SQLite tables in `server/data/app.db` and their schema sources

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `DATA-002` |
| Title | Document SQLite table ownership |
| Primary Owner | Architecture / Data Lead |
| Scope | `server/src/db/database.js` (schema definition), all table consumers |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document provides the single, authoritative ownership registry for every SQLite table. Every table has one owner or explicit unknown. No cleanup task bypasses this map. Schema source is identified.

---

## 3. Complete SQLite Table Registry

### 3.1 Product Sorter Tables

| Table Name | Owner | Schema Source | Columns | Purpose |
| --- | --- | --- | --- | --- |
| `collection_settings` | **Product Sorter** | `database.js` (inline DDL) | 16 + 5 (ALTER TABLE) | Strategy weights, preferences, sorter state |
| `product_preferences` | **Product Sorter** | `database.js` (inline DDL) | 4 | Product pin/hide preferences |
| `collection_snapshots` | **Product Sorter** | `database.js` (inline DDL) | 3 | Historical snapshots of collection order |
| `order_backups` | **Product Sorter** | `database.js` (inline DDL) | 4 | Pre-apply backups of Shopify collection order |
| `shopify_auth_cache` | **Product Sorter** | `database.js` (inline DDL) | 7 | Cached Shopify OAuth tokens |
| `sorter_runs` | **Product Sorter** | `sorterRuntimeService.js` (inline DDL) | ~8 | Batch reorder job run history |
| `sorter_action_logs` | **Product Sorter** | `sorterRuntimeService.js` (inline DDL) | ~6 | Sorter action audit trail |
| `sorter_network_logs` | **Product Sorter** | `sorterRuntimeService.js` (inline DDL) | ~6 | Sorter network request audit trail |

### 3.2 Legacy Order Mapping Tables (Deferred to `CLEAN-001`)

| Table Name | Owner | Schema Source | Columns | Purpose |
| --- | --- | --- | --- | --- |
| `delivery_orders` | **Order Mapping** (legacy sink) | `database.js` (inline DDL) | 22 | Legacy order data for migration |
| `legacy_imports` | **Order Mapping** (legacy sink) | `database.js` (inline DDL) | 5 | Legacy CSV import deduplication |
| `delivery_logs` | **Order Mapping** (legacy sink) | `database.js` (inline DDL) | 4 | Legacy warning/status logs |

---

## 4. Schema Source Identification

| Source | Location | Tables | Method |
| --- | --- | --- | --- |
| `database.js` | `server/src/db/database.js` | 11 tables | `CREATE TABLE IF NOT EXISTS` (inline DDL) |
| `sorterRuntimeService.js` | `server/src/services/sorterRuntimeService.js` | 3 tables | `CREATE TABLE IF NOT EXISTS` (inline DDL) |

All SQLite schemas are defined via inline DDL statements. No external migration files exist for SQLite (unlike PostgreSQL).

---

## 5. Cleanup Task Dependency

| Cleanup Task | Requires DATA-002? | Tables Affected |
| --- | --- | --- |
| `CLEAN-001` | ✅ Yes | `delivery_orders`, `legacy_imports`, `delivery_logs` |
| `CLEAN-002` | ✅ Yes | None directly (duplicate artifacts) |

No cleanup task may proceed without DATA-002 approval.

---

## 6. Backup Status

| Table | Backup Strategy | Frequency |
| --- | --- | --- |
| `collection_settings` | Daily file copy | Daily |
| `product_preferences` | Daily file copy | Daily |
| `collection_snapshots` | Daily file copy | Daily |
| `order_backups` | Daily file copy | Daily |
| `shopify_auth_cache` | Daily file copy (sensitive) | Daily |
| `sorter_runs` | Daily file copy | Daily |
| `sorter_action_logs` | Daily file copy | Daily |
| `sorter_network_logs` | Daily file copy | Daily |
| `delivery_orders` | Snapshot before migration | Before `CLEAN-001` |
| `legacy_imports` | Snapshot before migration | Before `CLEAN-001` |
| `delivery_logs` | Snapshot before migration | Before `CLEAN-001` |

---

## 7. Acceptance Criteria Verification

- [x] **Every table has one owner or explicit unknown.** (Sections 3.1–3.2: all 11 tables have assigned owners).
- [x] **No cleanup task bypasses this map.** (Section 5: `CLEAN-001` and `CLEAN-002` require DATA-002 approval).
- [x] **Schema source is identified.** (Section 4: all schemas traced to inline DDL in `database.js` and `sorterRuntimeService.js`).
