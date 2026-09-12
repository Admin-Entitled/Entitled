# Production stability verification

## Incident outcome

The September 12, 2026 incident did not submit a new OpenArt creation. The corrected click reused the deterministic SQLite key `product 01:01`, so it updated the historical failed record whose provider creation ID was `uyy3oYQabXDT7wcV91l8`. The read-only OpenArt response identified that historical record as `upstream_error`: `[openai] 400 Invalid 'prompt': string too long. Expected a string with maximum length 32000, but got a string with length 50733 instead.` The account remained at 10,474 credits and no additional credit was consumed.

## Protections

- Each confirmed run receives a UUID-based `runId`; jobs use `${runId}:${mappingId}` and cannot collide with historical jobs.
- SQLite persists `submitting` before uploads or CLI submission.
- The renderer opens `Generate selected images?` first. Cancel performs no IPC. Only `Generate Images` calls `batch:start`, and the controller plus main coordinator coalesce duplicate requests.
- `attemptCount` and `retryCount` are separate. Retry limit zero permits one initial attempt and zero retry submissions.
- After a creation ID exists, polling, timeout, status failure, and download failure never call generate again.
- Startup resumes only persisted creation IDs; an ambiguous submitting row without one is failed without resubmission.
- Main-to-renderer updates are guarded when a window is closed, so closing the window during polling does not convert a recoverable job into an `Object has been destroyed` failure.

## Verification

The source suite contains 21 test files and 77 tests, with 84.62% statement and 87.06% line coverage in the final run. It covers mapping, prompt compilation, SQLite migration, provider parsing, retry/resume behavior, submission locking, and atomic output handling.

`npm run test:e2e:packaged` runs the packaged AppImage against a local fake CLI only. It exercises delayed upload, submission, queued/processing/completed polling, restart recovery, nested provider failure, polling interruption, download failure, double-click protection, cancellation, and pre-submission hash failure. The fake CLI records exactly one generation call in the happy path and never contacts OpenArt.

The old manual-credit-authorization tests were intentionally removed because that workflow was explicitly removed from the normal UI. The historical failed row remains in SQLite and is displayed under collapsed `PREVIOUS RUNS` with its exact provider code/message and zero credits consumed.
