# Phase 6I — Execution-Aware Recovery + Safe Replanning

## Overview

Phase 6I helps users recover when an existing plan is no longer realistic —
missed sessions, new conflicts, partial progress, or changed availability.

## Core Principle

OBSERVE ≠ SUGGEST ≠ APPLY

Recovery is triggered only by explicit user request. No autonomous rescheduling.

## Required Flow

1. User explicitly requests recovery
2. Deterministic delta analysis (completed, missed, remaining, conflicts)
3. Remaining capacity calculation
4. AI recovery synthesis (when needed)
5. RECOVERY PREVIEW (diff-based, read-only)
6. User inspection / refinement
7. "Đưa thay đổi vào đề xuất"
8. Phase 5C Review
9. Explicit Apply
10. Confirm-time revalidation
11. Canonical TaskFlow transaction

## Delta Model

```json
{
  "completedSessions": [...],
  "missedSessions": [...],
  "remainingSessions": [...],
  "changedTasks": [...],
  "newConflicts": [...],
  "changedAvailability": [...],
  "deadlineRisks": [...]
}
```

## Recovery Principles

### Explicit Request Only (P3)
No background detection, no cron, no morning auto-replan.
Recovery starts only after explicit current user intent.

### Completed Work is Immutable (P8)
Completed tasks/sessions are never re-added.
User must explicitly reopen through existing workflows.

### Preserve Unaffected Work (P9)
Minimum necessary change. Don't move Friday if it's still valid.
Don't globally reshuffle unless user asks "Làm lại toàn bộ kế hoạch."

### Session Locking (P12)
User can freeze sessions: "Giữ nguyên lịch thứ Sáu."
Locked sessions become HARD constraints. Server enforces this.

### Partial Progress (P14)
"Tôi mới làm 30/90 phút." → remaining = 60 minutes.
Don't schedule full 90 again.

### Current Time Boundary (P22)
Don't schedule sessions in the past.
Use canonical browser/app time.

### Deadline Changes (P17)
"Do NOT directly update canonical deadline from recovery planner."
Route through existing Agent proposal or use as what-if constraint.

## Recovery Preview Schema

```json
{
  "recoveryId": "...",
  "revision": 0,
  "basePlanId": "...",
  "preservedSessions": [...],
  "movedSessions": [...],
  "newSessions": [...],
  "removedFromPlan": [...],
  "unscheduled": [...],
  "warnings": [...]
}
```

## Diff UI

Show changes, not full plan:

```
Database
~~Thứ Năm 20:00~~
→ Thứ Bảy 09:00
Vì: phiên trước bị bỏ lỡ
```

Compact preserved count: "4 phiên được giữ nguyên"

## What-If Recovery

Queries like "Nếu tôi nghỉ hôm nay?" create read-only alternate previews.
No active plan mutation.

## Recovery → Proposal

Delta-only: only moved/new sessions become proposal actions.
Use `reschedule_task` for existing scheduled tasks.
No `create_task` unless user explicitly requests new work.

## Capacity

Reuses Phase 6H capacity engine.
Calculate remaining available capacity from NOW until recovery horizon.
V1 max: 14 days.

## Infeasibility

If remaining work cannot fit:

```
Cần thêm: 180 phút
Thời gian trống: 90 phút
Thiếu: 90 phút
```

Never silently extend deadline or violate constraints.

## Privacy

Send: short task labels, remaining duration, deadlines, available windows, normalized session data, constraints.
Do NOT send: full task notes, file bytes, Reflection, Mood, full calendar events, chat history.

## Known Limitations

- V1 requires explicit user request — no background detection
- Recovery shares Phase 6H planning budget
- No autonomous replanning
- No memory writes from recovery statements
- No guilt/judgmental language

## Non-Negotiable

Phase 6I does NOT:
- Auto-detect missed sessions in background
- Auto-reschedule
- Auto-apply
- Write Google Calendar
- Delete tasks
- Change deadlines silently
- Save recovery statements to Memory
- Use Reflection/Mood
- Expose chain-of-thought
- Create second Review/transaction system
