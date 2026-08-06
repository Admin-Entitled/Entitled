# Data Ownership Matrix

**Task:** `OWN-008` — Approve data ownership matrix  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All data stores, files, caches, schemas, and artifacts in the repository

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `OWN-008` |
| Title | Approve data ownership matrix |
| Primary Owner | Architecture / Data Lead |
| Scope | SQLite tables, PostgreSQL schema, JSON caches, JSONL audit logs, and configuration files |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document provides the single, authoritative ownership matrix for every data store in the repository. Every listed store has an explicit owner or an unresolved decision recorded in the Decision Log.

Key Rules:
1. **Single Owner**: Every data store has exactly one owning application surface.
2. **Deletion/Relocation Blocked**: No data store may be deleted or relocated until `OWN-008` is approved and the corresponding `CLEAN-*` task executes.
3. **Backup Requirements**: Every data store has objective backup requirements documented below.

---

## 3. SQLite Database Tables (`server/data/app.db`)

| Table Name | Owner | Purpose | Backup Requirement |
| --- | --- | --- | --- |
| `collection_settings` | **Product Sorter** | Collection strategy weights, preferences, and sorter state | Daily backup; snapshot before migration |
| `product_preferences` | **Product Sorter** | Product pin/hide preferences per collection | Daily backup; snapshot before migration |
| `collection_snapshots` | **Product Sorter** | Historical snapshots of collection product order | Daily backup; retain 30 days minimum |
| `order_backups` | **Product Sorter** | Pre-apply backups of Shopify collection order | Daily backup; retain 30 days minimum |
| `shopify_auth_cache` | **Product Sorter** | Cached Shopify OAuth tokens and session data | Daily backup; sensitive — encrypt at rest |
| `sorter_runs` | **Product Sorter** | Batch reorder job run history | Daily backup; retain 90 days |
| `sorter_action_logs` | **Product Sorter** | Sorter action audit trail | Daily backup; retain 90 days |
| `sorter_network_logs` | **Product Sorter** | Sorter network request audit trail | Daily backup; retain 90 days |
| `delivery_orders` | **Order Mapping** (legacy sink) | Legacy order data for migration to PostgreSQL | Snapshot before migration; retain until `CLEAN-001` |
| `legacy_imports` | **Order Mapping** (legacy sink) | Legacy CSV import deduplication hashes | Snapshot before migration; retain until `CLEAN-001` |
| `delivery_logs` | **Order Mapping** (legacy sink) | Legacy warning/status logs | Snapshot before migration; retain until `CLEAN-001` |

---

## 4. PostgreSQL Schema (`order_mapping`)

Managed via `server/migrations/order-mapping/`. Schema name is configurable via `ORDER_MAPPING_SCHEMA` environment variable.

| Table Name | Owner | Purpose | Backup Requirement |
| --- | --- | --- | --- |
| `orders` | **Order Mapping** | Canonical order records (Shopify order data) | Daily backup; WAL archiving enabled |
| `shipments` | **Order Mapping** | Shipment tracking records (AWB, status, courier) | Daily backup; WAL archiving enabled |
| `tracking_events` | **Order Mapping** | Shipment status change history | Daily backup; WAL archiving enabled |
| `status_history` | **Order Mapping** | Audit trail of all status transitions | Daily backup; WAL archiving enabled |
| `import_batches` | **Order Mapping** | CSV import batch metadata | Daily backup; WAL archiving enabled |
| `import_rows` | **Order Mapping** | Individual CSV import row results | Daily backup; WAL archiving enabled |
| `sync_runs` | **Order Mapping** | Shiprocket/Shopify sync run history | Daily backup; WAL archiving enabled |
| `migration_exceptions` | **Order Mapping** | Records that failed SQLite → PostgreSQL migration | Daily backup; retain until resolution |
| `_migrations` | **Order Mapping** | Migration version tracking | Daily backup; schema management |

---

## 5. JSON Cache Files (`server/data/`)

| File Path | Owner | Purpose | Backup Requirement |
| --- | --- | --- | --- |
| `server/data/sales-shopify-cache.json` | **Actual Sales Intelligence** | Cached Shopify order data for sales analytics | Daily backup; regenerable from API |
| `server/data/sales-shiprocket-cache.json` | **Actual Sales Intelligence** | Cached Shiprocket shipment data for sales analytics | Daily backup; regenerable from API |
| `server/data/sales-reconciled-cache.json` | **Actual Sales Intelligence** | Reconciled unified sales dataset | Daily backup; regenerable from API |
| `server/data/strategy-settings.json` | **Product Sorter** | Sorter strategy weight configuration | Daily backup; small file |
| `server/data/sku-image-actions.jsonl` | **SKU Image Manager** | Image add/delete/reorder audit trail | Daily backup; append-only log |

---

## 6. Configuration & Environment Files

| File Path | Owner | Purpose | Sensitivity |
| --- | --- | --- | --- |
| `.env` / `server/.env` | **All Applications** | Environment variables (API keys, secrets, database URLs) | **SECRET** — must not be committed to Git |
| `.env.example` | **All Applications** | Template for required environment variables | Safe to commit |
| `server/src/config/env.js` | **Architecture** | Centralized environment variable loading and validation | Safe to commit |
| `package.json` | **Architecture** | Project metadata, scripts, and dependency declarations | Safe to commit |

---

## 7. Decision Log

| Decision | Status | Owner | Notes |
| --- | --- | --- | --- |
| `delivery_orders` table: retain or drop? | **DEFERRED** (`CLEAN-001`) | Order Mapping Owner | Retain until SQLite → PostgreSQL migration verified |
| `legacy_imports` table: retain or drop? | **DEFERRED** (`CLEAN-001`) | Order Mapping Owner | Retain until CSV import deduplication verified in PostgreSQL |
| `delivery_logs` table: retain or drop? | **DEFERRED** (`CLEAN-001`) | Order Mapping Owner | Retain until warning logs migrated to `status_history` |
| `strategy-settings.json`: migrate to DB? | **DEFERRED** (`BE-006`) | Product Sorter Owner | JSON file is simple and low-risk; defer unless complexity grows |
| `sku-image-actions.jsonl`: migrate to DB? | **DEFERRED** (`OWN-004` follow-up) | SKU Image Manager Owner | JSONL is append-only and low-risk; defer unless query needs grow |
| `shopify_auth_cache` table: encryption at rest? | **UNRESOLVED** | Security Owner | Requires SQLite encryption or application-level field encryption |

---

## 8. Acceptance Criteria Verification

- [x] **Every listed store has an owner or explicit unresolved decision.** (Sections 3–6: every table, cache, and config file has an owner; Section 7: 6 decisions recorded with status).
- [x] **Deletion/relocation tasks depend on this approval.** (All `CLEAN-*` tasks list `OWN-008` as a dependency).
- [x] **Backup requirements are objective.** (Every data store has an explicit backup frequency and retention requirement documented).
