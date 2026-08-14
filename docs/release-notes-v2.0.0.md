# TaskFlow V2.0.0 — Planning System

> Release range: `b34f876…84eaa51` (V1.1 Projects → V1.6C Google push-only)
> Prerequisite: V1.0.0 stable (`e0802ee`, `0b1c921`).

TaskFlow V2.0.0 builds the planning system on top of the stable V1.0.0
offline-first core. Projects and milestones turn year goals into achievable
steps; time blocks put tasks on a real schedule; a rule-based planner proposes
the day with preview before Apply; habits support flexible daily, weekly, and
monthly schedules; Reports surface rule-based actionable insights; quick
capture pulls web shares and URLs straight into Inbox; an optional Google
Calendar connection shows external events and can push TimeBlocks one-way; and
an optional, consent-gated AI copilot assists planning without ever owning
TaskFlow state. All migrations are additive — every V1.x backup imports
unchanged.

Highlights in this release:
- Projects & Milestones with task linkage and auto-calculated progress
- Time Blocking + Energy/Context planning metadata
- Smart Daily Planner — rule-based, deterministic, preview → explicit Apply
- Flexible Habit Schedules — daily / weekdays / weekly count / monthly count
- Actionable rule-based Insights in Reports
- Quick Capture — PWA share target + quick URL into Inbox, sanitized
- Google Calendar — read-only events + push-only TimeBlock export
- AI Planning Copilot — optional, consent-gated, validated proposals

## What's new

### Projects & Milestones (V1.1)
- Dedicated `planner-projects` store with additive migration; Projects with
  Milestones, archive/complete/restore, auto-calculated progress
  (milestone-based, fallback task-based).
- Optional `projectId` / `milestoneId` on Tasks — old Tasks stay valid,
  referential rules enforced (invalid refs sanitized, never delete linked tasks).
- Projects page + Project Detail (desktop + More sheet on mobile), task-detail
  Project/Milestone selectors, compact project chip on task rows.
- Full participation in cloud sync, JSON export/import, backup/restore, offline.

### Time Blocking (V1.2) + Energy/Context (V1.2.1)
- `planner-timeblocks` store: a Task may have 0..n TimeBlocks (date, start, end,
  status planned/completed/cancelled), range validation, no cross-day blocks,
  orphan cleanup on task deletion.
- Schedule view (vertical timeline) with Calendar Month/Schedule mode toggle,
  Task Detail block list + Focus-from-block, compact time metadata in Today.
- Optional Task planning metadata: `estimatedMinutes`, `energy`
  (low/medium/high), `contexts` (editable `planner-contexts` store with stable IDs).

### Smart Daily Planner (V1.3)
- Rule-based `planner-rules.js`: overdue review → Top 3 → workload estimate →
  schedule suggestion → **preview → explicit Apply** (never mutates before Apply).
- Deterministic scoring (deadline, priority, project/milestone relevance,
  duration, energy), overload warning, smart reschedule options — no AI.

### Flexible Habit Schedules (V1.4)
- `schedule` on Habits: `daily`, `weekdays[1-7]`, `weekly_count`, `monthly_count`
  — legacy Habits keep current daily behavior.
- Period metrics: target completion, consistency, current run, best run
  (streak retained for daily); due/optional logic on Today; leap-year and
  boundary-tested.

### Actionable Insights (V1.4.1)
- Rule-based `js/insights.js` in Reports: 9 insight types (duration completion,
  repeated overdue, planned vs completed workload, focus vs completion, habit
  consistency, overloaded weekday, project velocity, time-of-day, energy).
  Minimum sample sizes, neutral language, no external data.

### Quick Capture (V1.5)
- PWA Web Share Target → Inbox (title/text/URL), quick URL
  (`/app?quick=1&text=…&url=…`) with sanitized input, preview-before-save,
  installable Quick Add shortcut preserved. No HTML injection, no javascript: URLs.

### Google Calendar (V1.6A/B/C)
- Read-only OAuth (minimal scopes) — external events in Schedule view,
  visually distinct, busy-window input for the planner, timezone-aware.
- Optional one-way export: "Add to Google Calendar" per TimeBlock, idempotent
  mapping (`google_cal_mapping`), duplicate guard, retry.
- Push-only propagation: edited block → PATCH event; deleted block → unlink,
  Google event DELETE gated by `syncDeletes` (default off). No two-way sync,
  no background poller, global sync untouched. Full pull-back deferred (see
  `docs/gcal-sync-design.md`).

### AI Planning Copilot (V2.0)
- Optional, consent-gated: context builder (Tasks/Projects/Schedule by default;
  Reflections/Mood opt-in, never silently), schema + referential + conflict
  validation, preview → explicit Apply through standard TaskFlow APIs.
- Rule-based planner remains the fallback when AI is unavailable; minimum
  structured context (no full localStorage); privacy docs updated.

## Verification

- Unit: **736/736** · Sync 2-client: 13/13 · Server security/AI/calendar
  suites: PASS (incl. 16 export/update/delete server tests)
- Full Chromium E2E matrix + Firefox/WebKit smokes: RELEASE OK
- Mobile QA 0 FAIL / a11y 62 PASS / dark contrast ALL PASS / CSS verifier 0 diffs
- Minify check 85 files up to date · Offline/SW smoke green (cache v223)

## Notes

- Additive-only migrations: every V1.x release imports into V2.0 (old JSON
  backups remain importable; removed fields never; unknown fields ignored).
- SW cache `taskflow-v223`; app.min.js `?v=181`.
- Known debt documented in `docs/gcal-sync-design.md` §10 (no mapping hash/state,
  no extended-property recovery; acceptable for push-only scope).
