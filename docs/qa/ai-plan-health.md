# Phase 6J: Plan Health + Deadline Risk Forecasting

## Overview

Phase 6J provides an on-demand "health check" for the user's current workload and plan.
It gives deterministic risk metrics first, AI explanation second.

**Core principle:** MEASURE → EXPLAIN → SUGGEST OPTIONS

Phase 6J is read-only. It must NOT:
- move sessions automatically
- modify deadlines
- complete tasks
- create tasks
- apply proposals
- write Google Calendar
- start background monitoring

## Architecture

```
Current TaskFlow State
↓
Deterministic Plan-Health Metrics
↓
Risk Classification
↓
Structured Plan Health Report
↓
Optional AI Explanation / Mitigation Ideas
↓
User Chooses an Option
↓
Phase 6H / 6I Preview
↓
Existing Agent Review
↓
Explicit Confirm
↓
TaskFlow
```

No direct mutation from Phase 6J.

## Risk Labels

| Label | Description |
|-------|-------------|
| `safe` | Scheduled before deadline, positive slack, no conflicts |
| `watch` | Low slack, limited backup capacity |
| `at-risk` | Very low/zero slack, unplanned work, deadline pressure |
| `infeasible` | Remaining work cannot fit into remaining capacity |

## Thresholds (Centralized)

```javascript
RISK_THRESHOLDS = {
  lowSlackRatio: 0.15,      // slackRatio below → WATCH
  lowSlackMinutes: 30,      // absolute slack below → WATCH
  criticalSlackRatio: 0.05, // slackRatio below → AT-RISK
  criticalSlackMinutes: 0,  // below 0 → INFEASIBLE
  saturatedDayRatio: 0.90,  // utilization above → SATURATED
  overloadedDayRatio: 1.0,  // utilization above → OVERLOADED
  concentrationWarningRatio: 0.60,  // work on last day → CONCENTRATION
  minSafeBackupMinutes: 60  // min backup to be SAFE
}
```

## Slack Model

```
slack = availableCapacity - remainingWork
slackRatio = slack / remainingWork
```

Negative slack = objectively infeasible under current hard constraints.
This is capacity math, not AI prediction.

## Daily Utilization

For each day:
- `scheduledMinutes`: total planned minutes
- `availableMinutes`: total capacity minutes
- `utilizationRatio`: scheduled / available
- `overloaded`: ratio > 1.0
- `saturated`: ratio ≥ 0.90 and ≤ 1.0

## Work Concentration

Detects if most remaining work is packed close to the deadline.
Example: 80% of work occurs on the last available day → WARNING.

## Fragility / Single-Point Failure

A day is fragile when:
- High utilization (≥ 80%)
- Only one session fills the entire day
- If that session is missed, deadline becomes infeasible

## Mitigation Options

Phase 6J generates deterministic safe options:

| Type | Description |
|------|-------------|
| `replan` | Redistribute work with different constraints |
| `reduce-scope` | Defer a non-deadline task |
| `split-work` | Break large task into smaller sessions |
| `use-backup-capacity` | Find additional available time slots |

Mitigation options are suggestions only. They must pass through:
Preview → Review → Confirm before any mutation.

## What-If Risk Mode

User asks: "If I lose Friday evening, what becomes risky?"

This generates a read-only scenario report. Live state is unchanged.

## Safety Model

- Plan Health is decision-support only
- No fake probabilities (no "AI confidence 93%")
- No background monitoring
- No automatic scan/push notifications
- No schedule changes from health analysis
- TaskFlow calculates the facts; Gemini may summarize verified structured facts

## Privacy

If AI summary is used, send only:
- Numeric metrics
- Short normalized task labels if necessary
- Risk codes
- Mitigation candidates

Do NOT send:
- Raw file content
- Reflection
- Mood
- Full chat history
- Calendar titles
- Task notes unless required

## Google Calendar

Google Calendar remains READ-ONLY.
Plan health uses only busy windows (start/end).
No event write scope.

## Known Limitations (V1)

- No background monitoring (future opt-in phase)
- No productivity performance inference
- No statistical risk model backed by data
- Single planning horizon cap: 14 days
- Max 20 tasks in health scope
