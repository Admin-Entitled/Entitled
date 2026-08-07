# Dev Script Status — `scripts/dev.mjs`

**Task:** OPS-001  
**Status:** Completed  
**Disposition:** `RETIRE`  
**Last updated:** 2026-08-06  
**Validation:** Static package.json audit · `tests/providerInventory.test.js`

---

## Summary

`scripts/dev.mjs` is **retired** — it is an obsolete development startup script that
is no longer referenced by any `package.json` script.  No documented command invokes it.
The supported replacement is the root-level `npm run dev` script, which uses `concurrently`
and is the single source of truth for starting both the server and client.

---

## Disposition: RETIRE

The script is retained in the repository for historical reference but is not invoked
by any supported command.  No documentation tells operators to run it directly.

### Why RETIRE (not RETAIN_AND_FIX)

| Criterion | Verdict |
|---|---|
| Any package.json script calls `scripts/dev.mjs`? | **No** |
| Any documented command tells operators to run it? | **No** |
| Is there an alternative that covers all use cases? | **Yes** — `npm run dev` via `concurrently` |
| Does it start client and server correctly? | Partially — no signal coalescing failure; `concurrently` is more featureful |
| Is it needed? | **No** |

---

## Replacement — Supported Startup Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start server and client concurrently (uses `concurrently --kill-others-on-fail`) |
| `npm run server` | Start server only (`npm run dev --workspace server`) |
| `npm run client` | Start client only (`npm run dev --workspace client`) |
| `npm run start` | Production server start (`npm run start --workspace server`) |

---

## Current State of `scripts/dev.mjs`

The file exists but is not referenced by any npm script.

```
scripts/dev.mjs
```

Contents (for historical reference — the file is not executed):

- Spawns `npm run dev:server` and `npm run dev:client` in parallel
- Handles `SIGINT` / `SIGTERM` — shuts down both children
- Kills both children when one exits with non-zero code

**Note:** The target scripts (`dev:server`, `dev:client`) were later replaced by
`server` and `client` scripts in root `package.json`, making `scripts/dev.mjs`
effectively dead code.

---

## Signal and Child-Process Behaviour

The script handles signals correctly but is not called by any live command.
The `concurrently` package used by `npm run dev` provides equivalent or superior
orchestration (`--kill-others-on-fail`, `--prefix-colors`, named processes).

---

## Validation

```
node --test tests/providerInventory.test.js
```

The tests in section C (OPS-001) assert:

1. `scripts/dev.mjs` exists on disk (historical record).
2. The `dev` script in `package.json` uses `concurrently`, not `scripts/dev.mjs`.
3. No `package.json` script references `scripts/dev.mjs`.
4. This document (`DEV_SCRIPT_STATUS.md`) exists.
5. Supported startup commands (`dev`, `server`, `client`, `start`) are all defined in `package.json`.

---

## Future Action

- `scripts/dev.mjs` may be deleted in a future cleanup pass (see CLEAN-008).
- Do not add new references to `scripts/dev.mjs` in npm scripts or documentation.
