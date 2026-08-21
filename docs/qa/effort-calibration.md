# Phase 6O — Opt-In Effort Calibration & Estimate Suggestions

## Overview

Phase 6O uses verified Phase 6N focus history to suggest more realistic time estimates. It is disabled by default, user-controlled, device-local, and never auto-updates canonical task estimates.

**Core principle:** OBSERVE → CALCULATE → SUGGEST → USER DECIDES

## Module

**`js/effort-calibration.js`** — Pure deterministic calibration engine (~350 lines).

- UMD module: `window.TaskFlowEffortCalibration` (browser) / `module.exports` (Node.js)
- Zero Gemini calls
- Zero ML dependencies
- Device-local only

## Safety Boundaries

### May
- Analyze verified duration history
- Calculate robust estimate ratios
- Suggest adjusted estimates
- Show estimate ranges
- Help Phase 6H planning with explicit user acceptance
- Help Phase 6M roadmap feasibility simulation
- Explain why an estimate is suggested

### May NOT
- Silently edit task duration
- Silently change roadmap estimates
- Silently replan
- Auto-reschedule
- Change deadlines
- Complete tasks
- Assign productivity scores
- Infer discipline/intelligence/motivation
- Monitor activity
- Call Gemini automatically
- Write Google Calendar

## Calibration Settings

Default: **OFF**

User must explicitly enable:
```
[ ] Cải thiện ước tính thời gian từ lịch sử của tôi
[ ] Improve time estimates from my history
```

## Storage

| Key | Purpose |
|-----|---------|
| `taskflow_effort_calibration_v1` | Settings + samples + cache |

Schema:
```json
{
  "version": 1,
  "enabled": false,
  "samples": {
    "<taskUid>": {
      "estimateAtStart": 60,
      "verifiedTotal": 95,
      "completed": true,
      "projectId": "proj_1",
      "tags": []
    }
  },
  "cache": {}
}
```

Device-local only. No cross-device claims.

## Eligible Samples

A calibration sample requires:

| Condition | Reason |
|-----------|--------|
| `outcome.userConfirmed === true` | Only verified data |
| `outcome.type` is `progress` or `task-completed` | Only meaningful outcomes |
| `outcome.creditedMinutes > 0` | Must have actual credited work |
| Task has `duration > 0` | Must have original estimate |
| Task has `uid` | Must be canonical task |

### Excluded
- Abandoned sessions
- No-progress sessions
- Unconfirmed timer time
- Raw elapsed time (only creditedMinutes)
- Tasks without duration estimates

## Task-Level Aggregation

Multiple focus sessions for one task → **one calibration sample**.

Example:
- Session 1: 30m credited
- Session 2: 25m credited  
- Session 3: 40m credited
- Task duration estimate: 60m

One sample: 95/60 = 1.58 ratio

**NOT** three separate 1:1 samples.

## Ratio Calculation

```
ratio = verifiedMinutes / estimatedMinutes
```

Example: estimate=60, verified=90 → ratio=1.5

## Robust Statistics

- **Median** of clamped ratios (not mean)
- Ratios clamped to [0.25, 4.0] before median
- Outliers cannot dominate the suggestion

### Minimum Samples

| Threshold | Behavior |
|-----------|----------|
| < 5 samples | No personalized suggestion |
| 5-9 samples | Basic calibration available |
| ≥ 10 samples | Full range + project-specific |

## Calibration Hierarchy

1. **Project-specific** — if project has ≥ 5 completed eligible tasks
2. **Global fallback** — if total eligible tasks ≥ 5
3. **No suggestion** — insufficient data

## Estimate Rounding

Suggestions rounded to nearest 5 minutes (TaskFlow-friendly units).

## Estimate Range

When ≥ 10 samples available:
- Low: 25th percentile of clamped ratios × original
- High: 75th percentile of clamped ratios × original

## User Override Precedence

1. Current explicit user estimate
2. Canonical task estimate
3. Accepted calibrated estimate
4. Generic calibrated suggestion
5. Default

**User override always wins.** No silent canonical update.

## Temporary Planning Override

User may choose "Use for this plan" which:
- Applies calibrated duration to Phase 6H preview only
- Does NOT change canonical task estimate
- Uses `effectivePlanningDuration` for current preview

## Phase Integrations

### Phase 6H (Planning)
- Optional: use calibrated estimates for planning
- Transparent: show "Planning estimate: 75m (calibrated from 60m)"
- User can toggle: use original vs calibrated

### Phase 6I (Recovery)
- Remaining work uses verified progress (not affected by calibration)
- Calibration applies only to estimated remaining workload

### Phase 6J (Health)
- If calibration ON: may show calibrated health view
- If OFF: uses canonical estimates exactly as before
- Must transparently indicate when calibrated estimates are involved

### Phase 6K (Watch)
- Enabling calibration does NOT trigger alert flood
- New baseline established first
- Calibration recompute → health recompute → watch evaluate once

### Phase 6L (Brief)
- Brief may show "Planning estimate adjusted from 60m to 75m" when relevant
- Avoid clutter

### Phase 6M (Roadmap)
- AI candidate 60m → calibrated planning 75m
- Both provenance values preserved
- `baseEstimate = 60`, `calibratedEstimate = 75`

### Phase 6N (Focus)
- Active session planned time stays fixed
- Calibration recompute does NOT change active session

## Privacy

- Device-local only
- No server analytics
- No behavioral profile
- No cross-device claims
- Delete calibration data control available
- Focus history NOT deleted when calibration data is cleared

## Accessibility

- Clear labels for original vs suggested
- Not indicated by color alone
- Why? button with aria-expanded
- Settings with proper label/description

## Files Changed

| File | Change |
|------|--------|
| `js/effort-calibration.js` | New module |
| `js/ai-intent.js` | classifyEstimateIntent export |
| `js/app.js` | Lazy-loading chain |
| `js/i18n.js` | VI + EN calibration keys |
| `sw.js` | Precache effort-calibration.min.js |
| `tests/phase6o-effort-calibration.test.mjs` | Comprehensive tests |
| `docs/qa/effort-calibration.md` | This document |
