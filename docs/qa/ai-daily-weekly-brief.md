# Phase 6L — Daily Focus Brief + Weekly Review

## Overview

Phase 6L gives TaskFlow a **deterministic** "What should I know right now?" layer.

- **Daily Brief**: focus items, deadlines, schedule, risks, alerts, free capacity
- **Weekly Review**: completed/unfinished work, deadlines, plan health, next-week risks
- **AI narrative**: optional, explicit-only, never runs automatically

## Core Principle

```
FACTS → PRIORITIZE → SUMMARIZE → OPTIONAL ACTION
```

**NOT**: SUMMARIZE → AUTO-CHANGE

## Architecture

```
Current TaskFlow state
+ Plan Health (6J)
+ Plan Watch (6K) alerts
+ Plan (6H) / Recovery (6I) previews
+ Agent Review (5C) pending
↓
deterministic Brief Model
↓
Daily / Weekly UI
↓
optional AI narrative (explicit only)
↓
user chooses action
↓
existing Preview / Review / Confirm
```

## History Capability Audit

| Capability | Status | Notes |
|-----------|--------|-------|
| task.doneAt | Available (optional) | ISO timestamp when task was completed |
| task.createdAt | Not stored | Cannot determine when task was created |
| timeblock.status | Available | 'completed' / 'planned' / 'cancelled' |
| Completion history | Partial | Only tasks with doneAt timestamps |
| Deadline history | Not tracked | Deadlines are current-state only |

**No fabricated historical metrics.** Weekly completed count only shown when doneAt data is available.

## Daily Brief Schema

```json
{
  "version": 1,
  "type": "daily",
  "date": "YYYY-MM-DD",
  "generatedAt": "...",
  "summary": {
    "dueToday": 2,
    "overdue": 1,
    "scheduledMinutes": 180,
    "freeCapacityMinutes": 120,
    "atRiskTasks": 1,
    "activeAlerts": 2
  },
  "focus": [...],
  "deadlines": [...],
  "schedule": [...],
  "risks": [...],
  "alerts": [...],
  "suggestions": [...],
  "fingerprint": "..."
}
```

## Weekly Review Schema

```json
{
  "version": 1,
  "type": "weekly",
  "range": { "start": "...", "end": "..." },
  "facts": {
    "totalTasks": 12,
    "completedCount": 8,
    "unfinishedCount": 4,
    "completedSessions": 5,
    "hasDoneAtTimestamps": true
  },
  "completed": [...],
  "unfinished": [...],
  "deadlines": [...],
  "planHealth": {...},
  "alerts": [...],
  "nextWeekRisks": [...]
}
```

## Focus Ranking Rules (P9)

Deterministic scoring:

| Priority | Score | Trigger |
|----------|-------|---------|
| Overdue | 100 | task.deadline < today |
| Due today | 90 | task.deadline === today |
| Infeasible | 85 | Phase 6J risk = infeasible |
| At-risk | 75 | Phase 6J risk = at-risk |
| High priority | 60 | task.kind = priority |
| Scheduled soon | 50 | TimeBlock today |
| Low slack | 40 | deadline within 2 days |
| Watch | 30 | Phase 6J risk = watch |
| Normal | 10 | default |

Top 3 items shown. No black-box AI ranking.

## Deadline Handling

- Overdue tasks separated and shown first
- Neutral wording: "1 task đã quá deadline" (not "Bạn thất bại")
- Due today shown prominently
- Next 3 upcoming deadlines displayed

## Capacity Integration

Reuses Phase 6H `calculateFreeWindows()`. Brief shows:
- Scheduled minutes today
- Free capacity minutes
- No past hours counted

## Health/Alert/Plan/Recovery Integration

- Phase 6J risks → surfaced in daily brief
- Phase 6K alerts → summarized count
- Phase 6H plan preview → "Kế hoạch đang chờ xem xét"
- Phase 6I recovery preview → "Kế hoạch phục hồi đang chờ xem xét"
- Phase 5C pending review → "Bạn có đề xuất chưa áp dụng"

## Optional AI Narrative (P38-P44)

- Never runs automatically
- Only on explicit user request: [Tóm tắt bằng AI]
- Sends sanitized brief model (no raw TaskFlow data)
- System prompt: summarize verified facts, no invention, no productivity traits
- Daily: ≤120 words. Weekly: ≤200 words.

## Auto-Show Settings

- Daily Brief auto-show: OFF by default
- Weekly Review auto-show: OFF by default
- Device-local preferences
- No forced morning modal

## Offline

Deterministic brief works offline. No AI/network required.

## Privacy

- Task titles included in brief (local only)
- AI summary: only sanitized numeric/label data
- No calendar event titles sent to AI
- No Reflection/Mood
- No file content

## Known Limitations

- No productivity scoring
- No week-over-week comparison without data
- No behavioral inference
- No background Gemini
- No automatic daily delivery
- No fabricated completion history
