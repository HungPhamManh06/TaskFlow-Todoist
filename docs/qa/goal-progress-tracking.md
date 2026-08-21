# Phase 6P — Goal Progress & Milestone Tracking

## Overview

Phase 6P tracks roadmap goals after their tasks become canonical TaskFlow work. It computes milestone progress, goal health, and provides safe course-correction previews.

**Core principle:** TRACK ≠ JUDGE ≠ REWRITE

## Module

**`js/goal-tracking.js`** — Pure deterministic goal tracking engine (~350 lines).

- UMD module: `window.TaskFlowGoalTracking` (browser) / `module.exports` (Node.js)
- Zero Gemini calls
- Device-local only
- No canonical task mutation

## Apply Mapping (P2)

Phase 6P uses stable task UIDs for linkage. The apply pipeline (`_applyCreate`) returns `{ status: 'applied', taskUid: task.uid }` and records the mapping in `actionIdToRealUid`.

**Title matching is forbidden.** Duplicate names are possible. Only stable UIDs are used.

## Storage

| Key | Purpose |
|-----|---------|
| `taskflow_goal_tracking_v1` | Goal trackers (device-local) |

Schema:
```json
{
  "version": 1,
  "trackers": [
    {
      "id": "goal_<ts>_<rand>",
      "version": 1,
      "title": "Hoàn thành đồ án Database",
      "targetDate": "2026-09-30",
      "createdAt": "...",
      "source": { "kind": "roadmap|manual", "roadmapId": null },
      "milestones": [
        {
          "id": "m1",
          "title": "Thiết kế",
          "order": 1,
          "requiredTaskUids": ["taskA", "taskB"],
          "optionalTaskUids": ["taskC"]
        }
      ],
      "linkedTaskUids": ["taskA", "taskB", "taskC"],
      "status": "active|completed|archived"
    }
  ]
}
```

## Task Linkage

- Tasks linked by stable canonical UID only
- No title-based matching
- Missing tasks detected gracefully (not counted as complete)
- Unlinking removes from tracker only, not canonical

## Milestone Status

| Status | Condition |
|--------|-----------|
| `complete` | All required tasks done |
| `in-progress` | Some required tasks done |
| `not-started` | No required tasks done |
| `blocked` | Required task missing/deleted |

Optional tasks do NOT prevent required completion.

## Progress Calculation

### Task-Count Basis
```
taskCountBasis = requiredCompleted / requiredTotal × 100
```

### Effort Basis (when durations known)
```
totalEstimatedMinutes = sum of required task durations
totalVerifiedMinutes = sum of min(verified_progress, estimate)
effortBasis = totalVerifiedMinutes / totalEstimatedMinutes × 100
```

### Unknown Duration
If any required task lacks duration: `effortKnown = false`. No fake percentage shown.

## Goal Health

Reuses Phase 6J concepts:

| Health | Condition |
|--------|-----------|
| `healthy` | Slack ≥ 30% of remaining work |
| `watch` | Slack 15-30% |
| `at-risk` | Slack < 15% |
| `insufficient-capacity` | Slack negative |
| `unknown` | No capacity data |

## Course Correction

- "Điều chỉnh roadmap" → Phase 6M Revision Preview
- "Xếp lại phần còn lại" → Phase 6I Recovery Preview
- Neither mutates active tracker

## Phase Integrations

### Phase 6M (Roadmap)
- After roadmap → proposal → apply → confirm: offer "Track this goal"
- Roadmap revision creates new preview, not direct edit

### Phase 6I (Recovery)
- CTA: "Replan remaining work" → Phase 6I Recovery Preview

### Phase 6J (Health)
- Reuses health engine for linked tasks

### Phase 6K (Watch)
- Goal alerts default OFF
- No new alert from creating tracker

### Phase 6L (Brief)
- May surface: "Next milestone: Vẽ ERD" or "1 active goal at risk"

### Phase 6N (Focus)
- Verified focus progress updates goal effort progress

### Phase 6O (Calibration)
- Progress basis uses canonical estimates
- Calibrated estimates for future feasibility only

## Safety Properties

- ✅ No auto-complete tasks
- ✅ No auto-complete goal
- ✅ No task deletion from tracker
- ✅ No deadline rewriting
- ✅ No title-based linking
- ✅ No raw AI storage
- ✅ No productivity scoring
- ✅ No success probability
- ✅ No Gemini required
- ✅ No canonical mutation
- ✅ Offline works
- ✅ Account isolation
- ✅ Data deletion control

## Files Changed

| File | Change |
|------|--------|
| `js/goal-tracking.js` | New module |
| `js/ai-intent.js` | classifyGoalTrackingIntent export |
| `js/app.js` | Lazy-loading chain |
| `js/i18n.js` | VI + EN goal tracking keys |
| `sw.js` | Precache goal-tracking.min.js |
| `tests/phase6p-goal-tracking.test.mjs` | Comprehensive tests |
| `docs/qa/goal-progress-tracking.md` | This document |
