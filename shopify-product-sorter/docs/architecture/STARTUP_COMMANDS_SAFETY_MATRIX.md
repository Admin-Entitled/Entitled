# Startup Commands & Safety Classification Matrix

**Task ID**: OPS-002  
**Owner**: `package.json`, `server/package.json`, `scripts/verify.mjs`  
**Current Branch Ancestry**: `ops/architecture-ledger-hardening`  
**Evidence Model**: Branch-Native Evidence  

---

## 1. Overview & Classification Schema

This document specifies the safety matrix and operational contracts for all supported startup, development, build, test, and database migration commands across root and workspace scripts.

### Safety Classes:
- `READ_WRITE_LOCAL`: Modifies local node_modules or build dependencies.
- `LOCAL_DEV_SERVER`: Launches local development backend server.
- `LOCAL_DEV_CLIENT`: Launches local development frontend server.
- `LOCAL_DEV_SUITE`: Launches concurrent local development backend + frontend servers.
- `BUILD_SAFE`: Compiles static assets; completely offline and safe.
- `RUNTIME_SERVER`: Starts production backend server process.
- `DIAGNOSTIC_LIVE`: Queries local running HTTP server endpoints.
- `DIAGNOSTIC_OFFLINE`: Runs offline verification (ledger validation, build check, doctor).
- `DATA_MUTATION`: Alters local or remote database state (requires explicit confirmation).
- `LEDGER_GOVERNANCE`: Manages architecture remediation tasks and ledger history.

---

## 2. Command Safety & Capability Matrix

| Command | Safety Class | Explicit Confirmation Required | Offline Capable | Target / Target Replacement |
| --- | --- | --- | --- | --- |
| `npm run install:all` | `READ_WRITE_LOCAL` | No | No (requires npm) | `npm install --workspaces` |
| `npm run server` | `LOCAL_DEV_SERVER` | No | Yes | `npm run dev --workspace server` |
| `npm run client` | `LOCAL_DEV_CLIENT` | No | Yes | `npm run dev --workspace client` |
| `npm run dev` | `LOCAL_DEV_SUITE` | No | Yes | `concurrently ...` (runs server + client) |
| `npm run build` | `BUILD_SAFE` | No | Yes | `npm run build --workspace client` |
| `npm run start` | `RUNTIME_SERVER` | No | Yes | `npm run start --workspace server` |
| `npm run health` | `DIAGNOSTIC_LIVE` | No | Requires running server | `curl http://localhost:4000/api/debug/shopify` |
| `npm run verify` | `DIAGNOSTIC_OFFLINE` | No | Yes | `node scripts/verify.mjs` |
| `npm run test:regression-gate` | `DIAGNOSTIC_OFFLINE` | No | Yes | `node scripts/regression-gate.mjs` |
| `npm run migrate:order-mapping` (server) | `DATA_MUTATION` | **Yes** (`--confirm` / `CONFIRM_MIGRATION=true`) | Yes | `node server/src/scripts/migrateOrderMapping.js` |
| `npm run migrate:order-mapping-legacy` (server) | `DATA_MUTATION` | **Yes** (`--confirm` / `CONFIRM_MIGRATION=true`) | Yes | `node server/src/scripts/migrateOrderMappingLegacy.js` |
| `npm run repo:clean:confirm` | `DATA_MUTATION` | **Yes** (`--confirm`) | Yes | `node scripts/clean.mjs --confirm` |
| `npm run arch:*` | `LEDGER_GOVERNANCE` | No | Yes | `node scripts/architecture-ledger.mjs` |

---

## 3. Operational Safety Rules & Regulations

1. **Safety Class Compliance**: Every startup and operational script in `package.json` and `server/package.json` must be assigned to an explicit safety class.
2. **Offline Verification Guarantee**: `npm run verify` operates completely offline without failing or making unannounced external network calls if live servers or databases are unreachable.
3. **Explicit Operator Intent**: Commands in `DATA_MUTATION` class require explicit operator flags (`--confirm`, `--yes`) or environment variables (`CONFIRM_MIGRATION=true`). Execution without confirmation exits immediately with code 1.
4. **Obsolete Command Disposition**: Obsolete script targets (e.g. `scripts/dev.mjs`) have been replaced by supported `package.json` commands (`concurrently`). No supported package script points to obsolete targets.

---

## 4. Permanent Validation & Verification Commands

Validation is provided by synthetic unit and contract tests running offline without live network access:

```bash
# Focused startup contract test
node --test tests/integrationContracts.test.js

# Startup commands explicit intent test
node --test server/src/scripts/startupCommands.test.js
```

---

## 5. Branch-Native Implementation Evidence

This contract document and its associated test suite (`tests/integrationContracts.test.js`) establish durable current-branch implementation provenance on `ops/architecture-ledger-hardening`.
