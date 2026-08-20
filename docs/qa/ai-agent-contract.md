# AI Agent Action Contracts (Phase 4A)

> **Status:** Preparation only. `js/ai-agent.js` validates and previews agent
> proposals — it performs **zero writes**. Phase 4B will add a real executor.

## Phase 4A Guarantee

**No TaskFlow mutation is enabled.** The module is pure:

- No `save()`, `Sync.push()`, `localStorage.setItem()`, `fetch()`, or any
  mutation API exists in the module (enforced by tests).
- `validateAction` / `validateProposal` / `previewAction` / `previewProposal` /
  `dryRun` are functions of `(proposal, context)` — the caller owns the
  read-only context snapshot. Byte-identical context after any call (TEST 10).
- No Gemini wiring: `/api/ai/chat` runtime behavior is untouched, no function
  calling, no automatic scheduling. The Agent cannot act on its own.

## Supported Actions (5)

| Action | Args | Notes |
|--------|------|-------|
| `create_task` | `text`, `date`, `priority`, `duration`, `projectId`, `milestoneId` | `text` required, ≤ 300 chars |
| `update_task` | `taskUid`, `changes` | `changes` allowlist only, see below |
| `complete_task` | `taskUid` | Task must exist |
| `schedule_task` | `taskUid`, `date`, `start`, `duration` | `start` `HH:MM`, `duration` 1–1440 min |
| `reschedule_task` | `taskUid`, `date`, `start`, `duration` | Same validation as schedule |

**Action envelope:**

```json
{ "type": "schedule_task", "args": { "taskUid": "t1", "date": "2026-08-20", "start": "20:00", "duration": 60 } }
```

**Proposal envelope:**

```json
{ "summary": "Xếp lịch học", "actions": [ ... ] }
```

Hard cap: **10 actions** per proposal → `proposal-too-large`.

## Field Allowlists

`create_task` and `update_task.changes` accept **only**:

- `text` — string, trimmed, 1–300 chars
- `date` — `YYYY-MM-DD` (real calendar day, roll-overs like `2026-13-40` rejected) or `null`
- `priority` — boolean (Phase 4B maps to `kind: 'priority'`)
- `duration` — integer minutes, 1–1440 (`999999` rejected)
- `projectId` / `milestoneId` — must reference existing projects/milestones in context

`update_task.changes` may **not** contain `uid`, sync metadata, `createdAt`,
or any other internal/derived field — rejected as `forbidden-field`. Empty
`changes` → `changes-invalid`. Tasks are never re-created, only patched.

## Validation Errors

```json
{ "ok": false, "errors": [ { "index": 0, "code": "unknown-task", "field": "taskUid" } ] }
```

| Code | Meaning |
|------|---------|
| `unknown-task` | `taskUid` not found in context |
| `unknown-project` / `unknown-milestone` | ref points to non-existent object |
| `invalid-date` / `invalid-start` / `invalid-duration` | bad `YYYY-MM-DD` / `HH:MM` / minutes |
| `text-required` / `text-too-long` | task text rules |
| `invalid-priority` | `priority` not boolean |
| `changes-invalid` | `changes` missing, non-object, or empty |
| `forbidden-field` | secret/unknown internal field present (any depth) |
| `unsupported-action` | type not in the 5 supported contracts |
| `proposal-too-large` | more than 10 actions |
| `summary-invalid` / `actions-invalid` / `proposal-not-object` | malformed envelope |

**Errors never echo action payloads** — no secrets, no internal state.

## Secret / Prompt-Injection Rules

- Forbidden keys (`token`, `authorization`, `apiKey`, `jwt`, `oauth`,
  `password`, `localStorage`, `sync`, …) are rejected at any depth.
- Unknown non-secret fields are **stripped** (allowlist copy).
- Task `text` is **data**, never instructions. A proposal saying "delete
  everything" still only produces a `create_task` preview with that text.
- `delete_task` and generic tools (`execute_js`, `patch_object`,
  `mutate_state`, `run_command`, …) **do not exist** in the module.

## Dry-Run Contract

```json
{
  "valid": true,
  "changes": [
    { "type": "schedule_task", "taskUid": "t1", "displayText": "Học C#",
      "date": "2026-08-20", "start": "20:00", "duration": 60 }
  ],
  "warnings": [ { "index": 0, "code": "timeblock-conflict" } ]
}
```

- `displayText` is the human task label — **raw UIDs never appear in previews**.
- Conflicts are **warnings, not errors**: the proposal stays `valid: true`.
  Nothing is auto-resolved or auto-moved.
- `dryRun` performs no writes; it is the full Phase 4B input.

## Conflict Detection (reused, not duplicated)

Schedule/reschedule dry-runs check the proposed slot with the **same
half-open `[start, end)` semantics as `TaskFlowTimeBlocks.findOverlaps`
(js/timeblocks.js:232)**:

- Caller passes `context.findOverlaps` (the real module) when loaded; the
  module also carries a matching inline fallback.
- Cancelled blocks never conflict; `reschedule_task` ignores the task's own
  existing blocks; Google busy events from `context.busy` (HH:mm or startMs
  forms, same day only) produce `google-busy-conflict`.
- Slots crossing midnight → `invalid-time-range` warning, never silently
  rewritten.

## Preview Contract (UI-neutral)

```json
{ "title": "Xếp lịch", "description": "Học C#", "meta": "Hôm nay · 20:00 · 60 phút" }
```

`previewAction` / `previewProposal` return this shape (Vietnamese by default,
English when `context.lang === 'en'`). Phase 4A ships **no chat UI** — these
models are consumed by the Phase 4B confirmation step.

## Testing

- `tests/phase4a-agent-contracts.test.mjs` — 20 tests: TEST 1–10 (valid
  create preview, valid schedule dry-run, `unknown-task`, `25:70`
  `invalid-start`, `999999` duration, 11-action cap, `delete_all_tasks`
  rejected, token/authorization rejected + unknown-field stripping, conflict
  warnings, context immutability) plus update_task allowlist, create_task
  field rules, complete/reschedule, prompt injection, envelope validation,
  and a source-level ban on network/storage/mutation APIs.
- Run: `node --test tests/*.test.mjs` (full suite, currently 893 passing).

## Module Loading

`js/ai-agent.js` is **not loaded at runtime** in Phase 4A — no `app.html`
script tag, no boot asset version bumps, no service-worker change. It is a
standalone UMD module (`window.TaskFlowAIAgent` / `module.exports`) ready for
the Phase 4B executor to import.