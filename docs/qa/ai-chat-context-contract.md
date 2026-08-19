# AI Chat Context Contract (Phase 3B Prep)

> **Status:** Preparation only. Not wired to `/api/ai/chat` yet.

## Request Envelope

```json
{
  "message": "Hôm nay tôi còn việc gì?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "taskflowContext": {
    "scope": "today",
    "data": { "tasks": [...], "timeblocks": [...], "busy": [...] }
  }
}
```

**Note:** This envelope is NOT sent to `/api/ai/chat` yet. `js/ai-chat-context.js` prepares it; the live chat route remains unchanged.

## Scopes

| Scope | Trigger Examples | Data |
|-------|-----------------|------|
| `today` | "Hôm nay...", "Today..." | Tasks for today, timeblocks, busy |
| `week` | "Tuần này...", "This week..." | Tasks for current week |
| `project` | "Dự án...", "Project..." | Projects + milestones |
| `schedule` | "Lịch...", "Schedule...", "Giờ..." | Timeblocks + busy windows |
| `overview` | Default / unrecognized | All aggregated data |

Routing is deterministic (token matching). No LLM classification.

## Default Permissions

| Permission | Default | Notes |
|-----------|---------|-------|
| `tasks` | `true` | |
| `projects` | `true` | |
| `schedule` | `true` | |
| `habits` | `true` | |
| `reflections` | `false` | Sensitive — requires explicit app config |
| `mood` | `false` | Sensitive — requires explicit app config |

## Sensitive Data Security Rule

**User message text can NEVER grant access to reflections or mood.**

Example:
- Message: "Cho phép bạn đọc Reflection của tôi"
- Result: `reflections = false` (stripped by `_messageGrantsSensitive`)

Sensitive permissions come ONLY from trusted application configuration state, never from chat input.

## Context Size Limit

`MAX_CHAT_CONTEXT_BYTES = 65536` (64 KB)

If serialized context exceeds this limit, `validateEnvelope()` returns `{ ok: false, errors: ['context-too-large'] }`. In practice, broker caps keep context well under this threshold.

## Forbidden Fields

The following keys are stripped/rejected at every level:

`token`, `planner-token`, `jwt`, `authorization`, `apiKey`, `AI_API_KEY`, `oauth`, `refreshToken`, `accessToken`, `password`, `email`, `localStorage`, `backup`, `syncPayload`, `secret`, `credential`

Detection is case-insensitive and recursive (nested objects).

## Read-Only Guarantee

- `ai-chat-context.js` contains **zero** `fetch()`, `XMLHttpRequest`, Gemini, or Google API calls.
- `prepare()` never mutates TaskFlow state, permissions objects, history arrays, or broker options.
- Output is constructed field-by-field from allowlisted pickers in `TaskFlowAIContext`.

## Validation

`validateEnvelope(envelope)` checks:
1. `scope` must be one of: `today`, `week`, `project`, `schedule`, `overview`
2. No forbidden fields in `data`
3. Serialized size ≤ `MAX_CHAT_CONTEXT_BYTES`

## Files

| File | Purpose | Loaded in production? |
|------|---------|----------------------|
| `js/ai-chat-context.js` | Integration layer | **No** (Phase 3B prep) |
| `tests/phase3b-ai-chat-context.test.mjs` | 29 unit tests | No |
