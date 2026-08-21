# Phase 6H — Constraint-Aware Plan Synthesis + What-If Scheduling

## Overview

Phase 6H turns TaskFlow AI from "create/edit individual proposal actions" into
"build a realistic multi-day plan from existing work."

## Three Distinct Layers

1. **PLAN PREVIEW** — read-only suggested schedule (no TaskFlow writes)
2. **AGENT PROPOSAL** — validated TaskFlow actions in Review (after conversion)
3. **APPLY** — explicit user confirmation + revalidation + transaction

These layers must never be collapsed.

## Architecture

### Deterministic Pipeline

```
User request
→ deterministic intent (classifyPlanningIntent)
→ scope resolution (task keys)
→ deterministic free-window calculation
→ bounded planning context
→ Gemini structured PLAN
→ server validation
→ local conflict validation
→ Plan Preview
```

### Backend Endpoint

`POST /api/ai/plan-synthesis` — JSON request, dedicated endpoint for strict schema.

Input:
```json
{
  "message": "...",
  "today": "2026-08-21",
  "range": {"start": "2026-08-21", "end": "2026-08-27"},
  "tasks": [{ "uid": "...", "text": "...", "duration": 45, "deadline": "2026-08-25" }],
  "availableWindows": [...],
  "constraints": { "windowStart": "19:00", "windowEnd": "22:00", "dailyMaxMinutes": 120 },
  "preferences": { "maxSession": 50, "breakMinutes": 15 }
}
```

Output:
```json
{
  "ok": true,
  "plan": {
    "summary": "Có thể xếp 5/5 task",
    "sessions": [{ "taskKey": "t1", "date": "2026-08-22", "start": "19:00", "duration": 45 }],
    "unscheduled": [],
    "assumptions": []
  }
}
```

### Deterministic Capacity Engine

`calculateFreeWindows(date, opts)` — computes available time by:
- Taking default window [windowStart, windowEnd]
- Subtracting existing TimeBlocks
- Subtracting Google busy intervals
- Subtracting user unavailable windows
- Merging overlapping occupied intervals

This is deterministic — no Gemini calls for capacity calculation.

## Constraint Model

### Constraint Priority (P6)

1. Explicit current user instruction
2. Hard TaskFlow conflicts (TimeBlocks, Google busy)
3. Explicit task deadline
4. Existing TaskFlow state
5. Saved user preference (Phase 6B)
6. TaskFlow defaults
7. AI heuristic

### Hard vs Soft (P7)

**Hard** (cannot violate):
- Google busy intervals
- Existing TimeBlocks
- User unavailable windows
- Invalid times

**Soft** (violate with warning):
- Preferred study time
- Preferred session length
- Daily max minutes

## Plan Preview

Ephemeral structure — NOT persisted into canonical TaskFlow data.

```json
{
  "id": "plan-...",
  "revision": 0,
  "range": { "start": "...", "end": "..." },
  "sessions": [...],
  "unscheduled": [...],
  "warnings": [],
  "constraints": {}
}
```

## Task Splitting

Phase 6H may split a long task into multiple plan sessions:
- Task: 180 minutes, Max session: 50 minutes
- Preview: 50 + 50 + 50 + 30

This does NOT create multiple canonical tasks. Sessions are for the same task.

## What-If Mode

Queries like "Nếu tôi chỉ học 1 tiếng mỗi tối thì sao?" create read-only
what-if plans. No proposal mutation. No canonical writes.

## Convert to Proposal

User explicitly clicks [Đưa vào đề xuất]. Sessions are converted to
`schedule_task` actions using existing Agent action schema.

- Existing tasks → `schedule_task` with `taskRef: { kind: 'existing', uid }`
- Pending creates → `schedule_task` with `taskRef: { kind: 'action', actionId }`

## Confirm-Time Revalidation

Before Apply, re-fetch current:
- Tasks
- TimeBlocks
- Google busy cache

Recheck every selected schedule. Never trust preview-era availability.

## Google Calendar

Remains READ-ONLY. Phase 6H uses busy intervals to avoid collisions.
No event create/update/delete.

## Privacy

Send minimum planning data:
- Task key, short text, duration, deadline
- Available windows

Do NOT send:
- Raw files
- Full chat history
- Reflection/Mood
- Unrelated task content

## Known Limitations

- V1 supports max 14-day horizon, max 20 tasks, max 60 sessions
- What-if comparison limited to 2 alternatives in V1
- No autonomous daily replanning
- No background scheduling
- Multi-session same task uses one `schedule_task` per session (supported by canonical architecture)

## Non-Negotiable

Phase 6H does NOT:
- Auto-apply plans
- Write Google Calendar
- Delete tasks
- Auto-reschedule without request
- Create hidden tasks
- Persist raw AI reasoning
- Use Reflection/Mood by default
