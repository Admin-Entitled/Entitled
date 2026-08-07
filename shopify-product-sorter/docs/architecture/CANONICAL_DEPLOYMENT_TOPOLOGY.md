# Canonical Deployment Topology and Startup Commands

> **Canonical Document**: `DOC-009`  
> **Status**: APPROVED / ACTIVE  
> **Last Updated**: 2026-08-07  

## 1. Deployment Topology

- **Frontend Client**: React single-page app built via Vite (`client/`). Proxy configured to forward `/api` requests to Express port `4000`.
- **Backend Application Server**: Express app running on Node.js (`server/`). Listening on port `4000` (or `PORT`).
- **Database Engine**: Local SQLite (`sorter.db`) for Product Sorter core + PostgreSQL for optional Order Mapping.

---

## 2. Canonical Startup & Operational Commands

| Command | Purpose | Safe / Mutating |
| --- | --- | --- |
| `npm run dev` | Launch server + client concurrently in dev mode | Safe |
| `npm run build` | Build Vite frontend production bundle | Safe |
| `npm run verify` | Run system verification script (`scripts/verify.mjs`) | Safe |
| `npm run test:regression-gate` | Execute full 14-suite regression gate | Safe |
| `npm run test:architecture-ledger` | Run architecture ledger governance unit tests | Safe |
| `npm run arch:doctor` | Perform ledger integrity & Markdown sync check | Safe |
| `npm run arch:audit-completed` | Perform strict completed-task audit | Safe |
| `npm run delivery-migrator` | Run PostgreSQL Knex migrations for Order Mapping | **Mutating** |
