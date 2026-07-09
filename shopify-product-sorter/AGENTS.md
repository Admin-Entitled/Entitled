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
