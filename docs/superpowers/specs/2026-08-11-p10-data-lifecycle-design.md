# P10 Export, Import, Migration and Sync Design

**Date:** 2026-08-11
**Status:** Approved
**Depends on:** P7-P9 persisted data and current planner-key sync infrastructure

## Goal

Version and validate the complete growth-data lifecycle so old backups migrate safely, new data exports/restores completely, and optional cloud sync retains its documented last-write-wins behavior.

## Schema Version

JSON snapshots move from `version: 1` to `version: 2`. Every month state gains additive `schemaVersion: 2` when loaded or saved. Version 1 snapshots and unversioned month states remain supported.

`js/data-migrations.js` exposes pure, idempotent migrations:

```js
migrateMonthState(raw, context) -> migratedMonthState
migrateReflectionStore(raw) -> migratedReflectionStore
migrateSnapshot(snapshot) -> version2Snapshot
validateSnapshot(snapshot) -> { ok, errors }
```

## Preservation Rules

Migrations must preserve unknown fields plus all legacy reflections, monthly goals, habit IDs, task IDs, `linkedMetricIds`, focus logs, and existing planner keys. They only add/normalize the P2-P9 structures required by the current schema. They never delete unsupported future fields.

## Export and Backup

`collectAllData` exports every `planner-*` key and the legacy key exactly once, with version 2 metadata. This includes month states, daily reflections, mood, focus, reminders, year state, Weekly Review, Monthly Review, and future planner keys. Rotating backup continues to use the same snapshot builder.

## Import

Import parses, validates, migrates, and previews the key count/version before confirmation. A backup of current data is captured before any write. Only validated planner keys are accepted. If migration or storage fails, the importer reports failure and does not reload; keys already written during a partial failure are restored from the pre-import snapshot.

Version 1 imports remain supported. Unsupported future snapshot versions are rejected with a localized explanation rather than guessed.

## Sync Audit and Contract

The existing client syncs any `planner-*` key as parsed JSON, and the backend stores `{ user_id, key, data JSONB, updated_at }`; therefore P7-P9 month-state fields require no database-column migration. P10 retains per-key last-write-wins and does not silently field-merge concurrent values.

Backend validation must accept only `planner-*` keys, enforce a bounded key length and JSON payload size, and return explicit 400/413 errors. Client tests cover push/pull of version 2 month state, conflict ordering, migration before application use, and error status. Reflection content is never sent anywhere except the configured TaskFlow sync backend when the user enables sync.

## Privacy and Communication

UI/help copy states that sync is optional, server data is not end-to-end encrypted, and last-write-wins may replace an older concurrent edit. No reflection content goes to analytics, AI, or third-party APIs.

## Verification

Use version 1 and malformed fixtures to test preservation, idempotency, rollback, unsupported versions, export completeness, backup compatibility, sync payload validation, size limits, and last-write-wins. Run the full unit suite, sync integration, server security, focused import/export/reload E2E, the full Chromium viewport matrix, mobile QA, accessibility, critical CSS, minification, and repository diff checks.
