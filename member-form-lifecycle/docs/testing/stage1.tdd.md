# Stage 1 test-first record

Date: 2026-10-05

## Scope

Tests cover subscriber validation, consent, normalized Indian phone deduplication, atomic create/update behavior, optional-field preservation, safe parameterized storage, health checks, CORS, rate limiting, and error handling.

## Red / green evidence

- Initial test run failed because `src/app.js` and `src/validation.js` had not yet been implemented.
- The added email edge-case regression failed for a double-dot local part before the validator was corrected.
- Final integration run against a disposable local PostgreSQL database: `TEST_DATABASE_URL=<disposable-local-postgres> npm test -- --experimental-test-coverage` — 27 passed, 0 failed, 0 skipped.
- Final coverage: 100% lines, 94.03% branches, 100% functions.
- The migration runner was run twice against the disposable database; first run applied the migration, second run was a no-op.
- A real `npm start` smoke check against disposable PostgreSQL verified `/health`, create (201), duplicate update (200), same returned id, and one stored row for the normalized phone.

## Environment boundary

Neon was not contacted. `DATABASE_URL` was unavailable, so the Neon migration and Neon-backed health check remain pending. No production or existing database data was changed.

## Review

The email regression from independent code review was fixed and covered. Security review found no Critical or High issues. Integration test records were isolated to the disposable local database and removed with it.
