# Startup Commands & Safety Classification Matrix

| Command | Purpose | Safety Class | Explicit Intent Required | Offline Capable |
| --- | --- | --- | --- | --- |
| `npm run install:all` | Install all workspace dependencies | `READ_WRITE_LOCAL` | No | No (requires npm registry) |
| `npm run server` | Launch server in development mode | `LOCAL_DEV_SERVER` | No | Yes |
| `npm run client` | Launch client in development mode | `LOCAL_DEV_CLIENT` | No | Yes |
| `npm run dev` | Launch server + client concurrently | `LOCAL_DEV_SUITE` | No | Yes |
| `npm run build` | Build client assets | `BUILD_SAFE` | No | Yes |
| `npm run start` | Start server in production mode | `RUNTIME_SERVER` | No | Yes |
| `npm run health` | Check live server endpoint health | `DIAGNOSTIC_LIVE` | No | Yes (requires running server) |
| `npm run verify` | Run system verification (doctor, build, optional live check) | `DIAGNOSTIC_OFFLINE` | No | Yes |
| `npm run migrate:order-mapping` (server) | Apply database migrations for Order Mapping | `DATA_MUTATION` | **Yes** (`--confirm` or `CONFIRM_MIGRATION=true`) | Yes |
| `npm run migrate:order-mapping-legacy` (server) | Apply Order Mapping migrations and import legacy SQLite data | `DATA_MUTATION` | **Yes** (`--confirm` or `CONFIRM_MIGRATION=true`) | Yes |
| `npm run arch:*` | Architecture ledger tracking commands | `LEDGER_GOVERNANCE` | No | Yes |

## Rules

1. **Safety Class**: Every command must belong to a defined safety class.
2. **Offline Verification**: `npm run verify` performs static/offline checks first (architecture ledger doctor and build validation) and skips unannounced live server checks gracefully if the server is offline.
3. **Explicit Operator Intent**: Destructive or data-mutating scripts (such as database migrations) require explicit confirmation flags (`--confirm`, `--yes`) or environment variable (`CONFIRM_MIGRATION=true`).
