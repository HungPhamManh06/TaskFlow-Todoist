# AI Context Broker — Developer Contract (Phase 3A)

Module: `js/ai-context.js` (minified: `js/ai-context.min.js`) — `window.TaskFlowAIContext`.
Purpose: read-only, privacy-safe snapshot of TaskFlow state for future Gemini Chat
(Phase 3B). **Not wired into runtime yet** — no script tag, no SW entry, no boot cost.

## Guarantees

- **Read-only**: never mutates state/stores/inputs. Output is built field-by-field
  from an explicit allowlist. Never `JSON.stringify(state)` / `{ ...state }`.
- **No network**: zero fetch/XMLHttpRequest. Google busy must be pre-read from the
  caller (`TaskFlowGCal.loadCache()` → busy intervals) and passed in `opts.busy`.
- **No Gemini**: no `/api/ai/plan`, `/api/ai/chat`, provider calls.
- **Deterministic**: same inputs → same snapshot. Caps truncate to first N in
  documented order (below); no random selection.

## Public API

```js
TaskFlowAIContext.build({ scope, permissions, state, now, today, planStart,
  numDays, year, month, resolveTodayCell, todayCell, projects, timeblocks,
  busy, habits, reflections, mood, projectId, from, to })
TaskFlowAIContext.scopeForIntent(intent)  // deterministic token map → scope (no NLP)
TaskFlowAIContext.SCOPES / CAPS / DEFAULT_PERMISSIONS / effectiveCaps()
```

- `state`: TaskFlow state — only `weeks`, `habits`, `reflections` are read.
- `projects`: store `{version, projects}` or array. `timeblocks`: `{blocks}` or array.
- `busy`: array of `{start, end}` (ISO/`HH:MM`), caller-supplied from GCal cache.
- `reflections`: array `{date, text}`, or omitted to derive from `state.reflections`
  (weeks grid + overview) using the plan grid.
- `mood`: map `{dateKey: value}` (keys may be `YYYY-M-D`) or array `{date, value}`.
- `now`/`today`: freeze determinism; `today` must be the canonical day string.
- Today resolution goes through **`TaskFlowClock.resolveTodayCell`** (injected via
  `resolveTodayCell`, or read from the global) — same canonical day object as
  Today/Week UI. `todayCell` (pre-resolved) is accepted as an alternative.

## Scopes and composition

| scope | keys |
| --- | --- |
| `today` | `date`, `tasks`, `timeblocks` (date=today), `busy` (overlapping today) |
| `week` | `weekStart`, `weekEnd`, `days: [{date, tasks}]` (current canonical week only) |
| `project` | `projects`, `milestones` (optional `projectId` filter) |
| `schedule` | `timeblocks` (optional `from`/`to` range), `busy` |
| `overview` | `today`, `tasks`, `projects`, `milestones`, `timeblocks`, `habits`, `busy` (+ `reflections`, `mood` when permitted) |

Unknown scope → `overview`.

## Allowed fields (allowlist)

- task: `uid, text, done, priority (1|0), duration (min, ≤480), deadline, projectId, energy, contexts`
- timeblock: `id, taskUid, date, start, end, status (planned|completed|cancelled)`
- project: `id, title, status, progress (0–100), milestones (count)`
- milestone: `id, projectId, title, status, targetDate`
- habit: `id, name, target` · busy: `start, end` (capped 32 chars)
- reflection: `date, text` (capped 300 chars) · mood: `date, value` (no interpretation)

## Caps (hard, deterministic truncation)

`todayTasks 60* · weekTasks 100 · projects 20* · milestones 60* · timeblocks 80* ·
busy 80* · habits 30* · reflections 12* · mood 90*` — `*` reused from
`TaskFlowAI.ARRAY_CAPS` at build time (single source of truth); `weekTasks` is
broker-local. Ordering: planner grid / store order (chronological); reflections
and mood keep the **most recent N by date** (sorted ascending, last N).

## Sensitive data

- `permissions.reflections = false` and `permissions.mood = false` by default.
- When denied, keys are **omitted entirely** (not `[]`).
- Enabled reflections: capped 12 entries, text capped 300, recent first.
- Enabled mood: `{date, value}` only — the broker never interprets mental-health data.

## Forbidden data (never serialized)

planner-token, JWT, Authorization headers, API keys, Google OAuth access/refresh
tokens, AI_API_KEY, backup blobs, sync metadata, email/password fields, full
localStorage, raw server config. Unknown fields on any record are dropped by the
allowlist; invalid dates (e.g. non-date mood keys) are rejected.

## Testing

`node --test tests/phase34-ai-context.test.mjs` — today, week, privacy, secret
leak, immutability, caps, today/week consistency, Google busy, determinism,
garbage input, `scopeForIntent`.