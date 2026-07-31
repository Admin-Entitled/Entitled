# AGENTS.md — Low Token Codex Rules

## Primary Rule

Before doing any task, read this file and follow it strictly.

Goal: reduce token usage, avoid unnecessary repo scans, and make only precise changes.

## Token Usage Rules

- Use minimum context.
- Use minimum output.
- Do not scan the full repository unless explicitly required.
- Inspect only files directly related to the task.
- Do not read large/generated folders:
  - node_modules
  - dist
  - build
  - .git
  - .next
  - coverage
  - logs
  - cache folders
- Do not open lock files unless dependency changes are required.
- Do not paste full files in the response unless requested.
- Do not repeat existing code back to me.
- Do not summarize unrelated files.

## Workflow

For every task:

1. Identify the smallest relevant file set.
2. Inspect only those files.
3. Explain the change plan briefly.
4. Apply the smallest possible patch.
5. Return only changed files, short explanation, and test command.

## Editing Rules

- Make minimal diffs only.
- Do not rewrite whole files.
- Do not refactor unless I ask.
- Do not change unrelated files.
- Do not rename variables, routes, APIs, or components unless required.
- Preserve existing architecture.
- Preserve existing styling and layout.
- Preserve working logic.
- Do not add dependencies unless necessary.

## MCP Rules

Use MCP only when it reduces tokens.

- Use filesystem MCP only for targeted file reads.
- Use git MCP for changed files, status, and diffs.
- Use Context7 MCP only for external library documentation.
- Do not use MCP to scan the entire repo.
- Prefer targeted search over full file loading.

## Output Format

Always respond in this format:

## Files Changed
- `path/to/file`: reason

## What Changed
- short bullet
- short bullet

## Test Command
```bash
command here

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Architecture Remediation Execution Protocol

### Authoritative ledger

The authoritative architecture execution ledger files are:
- `docs/architecture/ledger/tasks.json` (JSON task database)
- `docs/architecture/ledger/history.jsonl` (SHA-256 hash-chained history log)

`docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md` is a generated report; direct edits to task status in the Markdown file are strictly prohibited.

No separate architecture checklist, progress file, task ledger, or competing plan may be created.

### Mandatory session startup

Before modifying any repository file, every Codex architecture session must:

1. Read `AGENTS.md`.
2. Begin with `npm run arch:resume`.
3. Inspect current in-progress, ready, and blocked tasks.
4. Confirm that requested task dependencies are satisfied.
5. All task state transitions must be executed via the Architecture Ledger CLI (`scripts/architecture-ledger.mjs` or `npm run arch:*`).
6. Conversational claims of task completion are not authoritative.
7. A task is completed only after implementation, validation, ledger update, history append, generated report synchronization, Git commit, remote push, and SHA verification via `npm run arch:checkpoint`.
8. Exactly one architecture task per commit.
9. No task status may be inferred from Obsidian alone.
3. Confirm that requested task dependencies are satisfied.
4. Capture the current Git baseline.
5. Identify pre-existing changes and leave them untouched.
6. State the exact task IDs being executed.
7. Refuse opportunistic changes outside those task IDs.

### Mandatory execution scope

Every implementation session must:

- Work only on explicitly approved task IDs.
- Never silently expand scope or combine unrelated cleanup.
- Never delete files without ownership evidence and an approved task.
- Never alter public routes or data contracts unless the task explicitly permits it.
- Preserve existing applications.
- Follow each task's backup prerequisite and rollback plan.
- Stop when acceptance criteria cannot be satisfied.

### Mandatory ledger update

Any session that changes repository implementation, architecture, tests, configuration, data paths, scripts, or documentation must update the master plan in the same session. The master-plan update is part of the implementation, not an optional final step.

For every executed task, update its status, last updated date, implementation sequence progress, acceptance-criteria results, required-validation results, completion evidence, files changed, commands run, tests passed, tests failed, manual validation, commit hash when available, remaining risks, follow-up task IDs, and change history. Also update the master task index, progress summary, current execution focus, and the risk register or decision log when affected.

### Completion rule

A task must not be marked `COMPLETED` merely because code was written. It may be marked `COMPLETED` only when the required implementation is finished; every applicable acceptance criterion passes; required tests, existing-application regression checks, and applicable data-integrity checks pass; documentation is updated; rollback instructions remain valid; and completion evidence is written into the master plan.

When implementation is complete but validation is incomplete, use `IMPLEMENTED — VALIDATION PENDING`. When validation fails, use `BLOCKED` or `IN PROGRESS`, as appropriate. Never falsely mark a task complete.

### Failed or partial work

When a task cannot be completed, do not hide partial implementation. Record what changed, failed validation, the blocker, the safest rollback or continuation point, and the accurate task status. Update the current execution focus.

### Session-end requirement

Before ending any implementation session:

1. Re-read the executed task records.
2. Verify the master plan reflects the actual repository state.
3. Recalculate progress totals and confirm that status counts match detailed task records.
4. Run applicable validation.
5. Show all changed files.
6. Confirm the master plan was updated.
7. Report tasks completed, pending, and blocked.

A session must not report success when implementation files changed but the master plan was not updated.

### Commit requirements

When explicitly requested to commit:

- Stage implementation files and the corresponding master-plan update together.
- Do not commit implementation changes without the ledger update.
- Do not stage unrelated pre-existing changes.
- Use path-specific staging.
- Do not push unless explicitly requested.
