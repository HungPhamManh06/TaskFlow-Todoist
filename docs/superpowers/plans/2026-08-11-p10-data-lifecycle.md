# P10 Data Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely version, export, import, migrate, back up, and sync all P1-P9 growth data.

**Architecture:** Pure migrations and snapshot validation run before application use or import writes. Import uses transactional localStorage rollback. Existing per-key JSONB sync remains last-write-wins with stricter server validation.

**Tech Stack:** Vanilla JavaScript, Express/Postgres JSONB, Node test runner, pg-mem sync integration, Playwright.

## Global Constraints

- Snapshot version is exactly 2; version 1 remains importable.
- Preserve unknown fields, IDs, links, goals, logs, and legacy reflections.
- Reject future versions rather than guessing.
- Sync only `planner-*`, with bounded key and payload sizes.
- No reflection content in analytics, AI, or third-party APIs.

---

### Task 1: Pure migrations and fixtures

**Files:** Create `js/data-migrations.js`, `tests/fixtures/snapshot-v1.json`, `tests/phase20-data-lifecycle.test.mjs`.

**Interfaces:** `migrateMonthState`, `migrateReflectionStore`, `migrateSnapshot`, `validateSnapshot`.

- [ ] Write RED tests for v1 preservation, schemaVersion 2, idempotency, malformed known fields, unknown field retention, old habit/task links, and future-version rejection.
- [ ] Run RED.
- [ ] Implement pure cloning migrations with `{ ok, errors }` validation.
- [ ] Run GREEN plus P1-P9 model tests.
- [ ] Commit: `feat(data): add versioned growth migrations`.

### Task 2: Export/import/rollback integration

**Files:** Modify `js/export.js`, `js/app.js`, `app.html`, `js/i18n.js`, and P10 tests.

**Interfaces:** `collectAllData(legacyKey)` emits version 2; `prepareImport(raw)` returns migrated snapshot; `applySnapshotTransactional(snapshot, storage)` restores pre-write keys on failure.

- [ ] Write RED tests proving every planner key exports once, v1 imports, invalid/future snapshots reject, preview metadata is correct, and a simulated quota error rolls back all writes.
- [ ] Implement parse/validate/migrate/preview/confirm/apply flow and pre-import backup.
- [ ] Run GREEN plus backup/export legacy tests.
- [ ] Commit: `feat(data): migrate and restore versioned backups`.

### Task 3: Sync contract hardening

**Files:** Modify `server/sync.js`, `js/sync.js`, `test-sync.js`, `test-server-security.js`, and P10 tests.

**Interfaces:** backend accepts keys matching `/^planner-[A-Za-z0-9._-]{1,120}$/`; JSON body limit is enforced before database upsert; client keeps per-key last-write-wins.

- [ ] Write failing integration tests for invalid key, oversized key, oversized JSON, version 2 push/pull, remote-newer overwrite, local-newer preservation, and error status.
- [ ] Run RED: `node test-sync.js` and `node test-server-security.js`.
- [ ] Add explicit 400/413 validation without changing auth or database columns; retain client conflict algorithm and document it in UI copy.
- [ ] Run GREEN.
- [ ] Commit: `fix(sync): validate versioned planner payloads`.

### Task 4: Production assets and full regression

**Files:** Modify asset versions/cache, E2E, development history, audit docs, and generated minified files.

- [ ] Write RED asset/E2E registration tests for `data-migrations.min.js`, version 2 import/export/reload scenario, and cache bump.
- [ ] Add focused E2E that exports version 2, imports a v1 fixture through the UI, reloads, verifies P7-P9 data and preserved legacy links, and checks dark/mobile states.
- [ ] Generate/check all minified files.
- [ ] Run full unit, sync, server security, full Chromium matrix, focused P7-P10 scenarios, smoke, mobile QA, accessibility, critical CSS, and diff checks.
- [ ] Append verified counts to `docs/development-history.md` only after commands pass.
- [ ] Commit: `feat(data): complete growth data lifecycle`.
