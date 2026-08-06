# Integration and Environment Ownership Matrix

**Task:** `OWN-010` — Approve integration and environment ownership  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All external integrations and environment variables in the repository

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `OWN-010` |
| Title | Approve integration and environment ownership |
| Primary Owner | Architecture / Integration Lead |
| Scope | Shopify Admin API, Shiprocket API, PostgreSQL, SQLite, OAuth flows, and all environment variables |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document provides the single, authoritative ownership matrix for every external integration and environment variable in the repository. Each integration has a target owner. Each environment variable has one owner and side (server/client). Duplicate client usage is explicitly gated by tests.

Key Rules:
1. **Single Owner**: Every integration has exactly one owning application surface.
2. **Environment Variable Ownership**: Every variable has one owner and one side (server or client).
3. **Duplicate Client Removal**: Shopify/Shiprocket client consolidation is gated by test coverage.

---

## 3. Integration Ownership Matrix

### 3.1 External Integrations

| Integration | Service Files | Owner | Primary Consumers | Notes |
| --- | --- | --- | --- | --- |
| **Shopify Admin API** | `shopifyService.js`, `shopifyAuth.js` | **Product Sorter** | Product Sorter, Order Mapping, SKU Image Manager, Actual Sales Intelligence | Centralized GraphQL client; OAuth token management |
| **Shiprocket API** | `shiprocketService.js` | **Order Mapping** | Order Mapping, Actual Sales Intelligence | REST API client; token-based authentication |
| **PostgreSQL** | `orderMappingDb.js`, `orderMappingMigrations.js` | **Order Mapping** | Order Mapping | Neon Serverless Postgres; schema-based isolation |
| **SQLite** | `database.js` | **Product Sorter** | Product Sorter, Legacy Delivery Resolution | Local file database; 11 tables |

### 3.2 Integration Side Classification

| Integration | Server-Side | Client-Side | Notes |
| --- | --- | --- | --- |
| **Shopify Admin API** | `shopifyService.js` | None (server-only) | All Shopify calls are server-side |
| **Shiprocket API** | `shiprocketService.js` | None (server-only) | All Shiprocket calls are server-side |
| **PostgreSQL** | `orderMappingDb.js` | None (server-only) | Database connections are server-side |
| **SQLite** | `database.js` | None (server-only) | SQLite file access is server-side |

---

## 4. Environment Variable Ownership Matrix

### 4.1 Server-Side Variables

| Variable Name | Owner | Required | Default | Sensitivity | Notes |
| --- | --- | --- | --- | --- | --- |
| `PORT` | **Architecture** | No | `4000` | Safe | Server listening port |
| `CLIENT_ORIGIN` | **Architecture** | No | `http://localhost:5173` | Safe | CORS allowed origin |
| `SQLITE_PATH` | **Product Sorter** | No | `server/data/app.db` | Safe | SQLite database file path |
| `DATABASE_URL` | **Order Mapping** | Yes | None | **SECRET** | PostgreSQL connection string |
| `DIRECT_DATABASE_URL` | **Order Mapping** | No | Falls back to `DATABASE_URL` | **SECRET** | Direct (non-pooled) PostgreSQL connection |
| `DATABASE_URL_UNPOOLED` | **Order Mapping** | No | Falls back to `DATABASE_URL` | **SECRET** | Alternative unpooled connection |
| `ORDER_MAPPING_SCHEMA` | **Order Mapping** | No | `order_mapping` | Safe | PostgreSQL schema name |
| `SHOPIFY_STORE_DOMAIN` | **Product Sorter** | Yes | None | Safe | Shopify store domain |
| `SHOPIFY_CLIENT_ID` | **Product Sorter** | Yes | None | Safe | Shopify OAuth client ID |
| `SHOPIFY_CLIENT_SECRET` | **Product Sorter** | Yes | None | **SECRET** | Shopify OAuth client secret |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | **Product Sorter** | No | None | **SECRET** | Shopify Admin API access token |
| `SHOPIFY_API_VERSION` | **Product Sorter** | No | `2026-04` | Safe | Shopify API version |
| `SHOPIFY_ANALYTICS_DAYS` | **Actual Sales Intelligence** | No | `365` | Safe | Analytics lookback window |
| `SHIPROCKET_EMAIL` | **Order Mapping** | Yes | None | Safe | Shiprocket account email |
| `SHIPROCKET_PASSWORD` | **Order Mapping** | Yes | None | **SECRET** | Shiprocket account password |
| `SHIPROCKET_TOKEN` | **Order Mapping** | No | None | **SECRET** | Shiprocket API token |
| `SHIPROCKET_BASE_URL` | **Order Mapping** | No | `https://apiv2.shiprocket.in` | Safe | Shiprocket API base URL |
| `SHIPROCKET_CHANNEL_ID` | **Order Mapping** | No | None | Safe | Shiprocket channel identifier |

### 4.2 Client-Side Variables

| Variable Name | Owner | Required | Default | Sensitivity | Notes |
| --- | --- | --- | --- | --- | --- |
| `VITE_API_URL` | **Architecture** | No | `http://localhost:4000` | Safe | API base URL for client-side fetches |

---

## 5. Duplicate Client Removal Gate

| Current Duplicate | Owner | Consolidation Target | Gate Requirement |
| --- | --- | --- | --- |
| `deliveryShopify.js` (legacy Shopify client) | **Legacy Delivery Resolution** | `shopifyService.js` | `CLEAN-001` requires passing `orderMapping.test.js` and `deliveryRepository.test.js` before removal |
| `legacyCsv.js` (legacy CSV parser) | **Legacy Delivery Resolution** | `orderMappingCsv.js` | `CLEAN-001` requires passing `orderMapping.test.js` before removal |
| `deliveryRepository.js` (legacy data access) | **Legacy Delivery Resolution** | `orderMappingRepository.js` | `CLEAN-001` requires passing `orderMappingMigrations.test.js` before removal |

---

## 6. Environment File Locations

| File Path | Owner | Purpose | Sensitivity |
| --- | --- | --- | --- |
| `.env` (root) | **All Applications** | Shared environment variables | **SECRET** — must not be committed |
| `server/.env` | **All Applications** | Server-specific overrides | **SECRET** — must not be committed |
| `.env.example` | **Architecture** | Template for required variables | Safe to commit (does not exist yet) |

---

## 7. Acceptance Criteria Verification

- [x] **Each integration has a target owner.** (Section 3: Shopify → Product Sorter, Shiprocket → Order Mapping, PostgreSQL → Order Mapping, SQLite → Product Sorter).
- [x] **Each environment variable has one owner and side.** (Section 4: all 18 server-side variables and 1 client-side variable have owners and side classifications).
- [x] **Duplicate client removal is explicitly gated by tests.** (Section 5: 3 legacy duplicates with test gate requirements documented).
