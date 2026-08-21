# Phase 6N — Focus Session Execution & Verified Progress Capture

## Overview

Phase 6N adds a safe execution layer between planning and completion. Users can run focus sessions on planned tasks, and explicitly record verified progress that feeds into Plan Health, Recovery, and Daily Brief calculations.

**Core principle:** Timer elapsed time ≠ task completed. Only explicit user confirmation records progress.

## Module

**`js/focus-session.js`** — Pure deterministic focus session engine (~400 lines).

- UMD module: `window.TaskFlowFocusSession` (browser) / `module.exports` (Node.js)
- Zero Gemini calls
- Device-local storage only
- No server endpoint

## Architecture

```
Task / Planned Session
        ↓
  Start Focus Session
        ↓
  local timer / session
        ↓
  [Pause / Resume] ← timestamp-based, drift-free
        ↓
  user ends session
        ↓
  Outcome Review ← explicit confirmation required
        ↓
  verified progress record
        ↓
  Phase 6I remaining-work update
  Phase 6J health recalculation
  Phase 6L brief update
```

## Session Schema

```json
{
  "id": "fs_<timestamp>_<random>",
  "version": 1,
  "taskRef": { "uid": "...", "text": "..." },
  "planSessionRef": null,
  "startedAt": <timestamp>,
  "endedAt": null,
  "plannedMinutes": 45,
  "elapsedMinutes": 0,
  "pausedAt": null,
  "totalPausedMs": 0,
  "status": "active" | "paused" | "ended" | "abandoned" | "outcome-pending",
  "outcome": null
}
```

## Session Lifecycle

1. **createFocusSession** → creates session, validates one-active-session rule
2. **pauseFocusSession** → records pause timestamp, accumulates totalPausedMs
3. **resumeFocusTimer** → adds pause duration, resumes active status
4. **endFocusSession** → transitions to outcome-pending, records endedAt
5. **confirmOutcome** → records creditedMinutes, saves to history
6. OR **abandonFocusSession** → marks abandoned, clears active, saves to history

## Outcome Review

When session ends, user must explicitly choose:

| Outcome | creditedMinutes | Notes |
|---------|----------------|-------|
| **task-completed** | elapsed (default) | Marks session as completed task work |
| **progress** | elapsed (default, adjustable) | Records verified work progress |
| **no-progress** | 0 | Session interrupted/abandoned without work |

**creditedMinutes** is always separate from **elapsedMinutes**. User can reduce credit (e.g., timer 45m but only 30m effective work).

## Storage

| Key | Purpose |
|-----|---------|
| `taskflow_focus_active_v1` | Active session (survives refresh) |
| `taskflow_focus_history_v1` | Completed session history |

- History: max 500 sessions or 90 days (whichever comes first)
- Device-local only, not synced across devices
- No raw AI data stored

## One Active Session

Only one focus session per device. If user tries to start another while one is active:

```
{ error: 'focus-already-active', activeSession: ... }
```

## Timer Model

- **Timestamp-based:** `Date.now() - startedAt - totalPausedMs`
- Drift-free across tab background/foreground
- Uses `endAt` for countdown display

## Pause / Resume

- **Pause:** Records `pausedAt` timestamp, increments `totalPausedMs`
- **Resume:** Adds pause duration to `totalPausedMs`, clears `pausedAt`
- Elapsed computation subtracts total paused time

## Stale Session Detection

Sessions older than **6 hours** (`FOCUS_STALE_HOURS`) are flagged stale:

```
isSessionStale(session, now) → boolean
resumeFocusSession() → { error: 'focus-stale-session' }
```

If user closed browser and returns after many hours, session is detected and must be explicitly reviewed.

## Verified Progress Aggregation

```
getVerifiedProgressMinutes(taskUid, history?) → number
```

Only counts sessions where:
- `outcome.userConfirmed === true`
- `outcome.type` is `progress` or `task-completed`
- `creditedMinutes > 0`

## Remaining Work Calculation

```
calculateRemainingWork(estimatedMinutes, verifiedProgressMinutes) → {
  remainingMinutes: number | null,
  overrun: boolean,
  estimateUsed: number | null
}
```

- `remainingMinutes = max(0, estimated - progress)`
- `overrun = true` when progress exceeds estimate
- `null` estimate → `remainingMinutes: null` (no fake guess)

```
getRemainingWork(task) → same shape
```

Reads `task.duration` (preferred) or `task.estimatedMinutes`, then calls `getVerifiedProgressMinutes(task.uid)`.

## Phase Integration

| Phase | Integration |
|-------|-------------|
| **6I Recovery** | Uses remaining work (estimated - verified progress) |
| **6J Health** | `remainingWorkMinutes` can be recalculated |
| **6K Watch** | After outcome confirmation, deterministic health refresh |
| **6L Brief** | Daily brief shows updated remaining work |
| **6M Roadmap** | Focus sessions run on canonical tasks only, not raw roadmap candidates |

## Focus Intent Router

Deterministic intent classification in both `focus-session.js` and `ai-intent.js`:

| Kind | Examples |
|------|----------|
| `start-focus` | "Bắt đầu focus task Database", "Học task này 45 phút" |
| `pause-focus` | "Tạm dừng", "Pause" |
| `resume-focus` | "Tiếp tục", "Resume" |
| `end-focus` | "Kết thúc", "Dừng phiên", "Xong" |
| `progress-report` | "Tôi làm được 30 phút", "45 phút tiến độ" |
| `focus-question` | (default for unclear messages) |

## Safety Properties

- ❌ No automatic task completion on timer end
- ❌ No automatic progress credit without confirmation
- ❌ No keyboard/mouse/screen tracking
- ❌ No website/app blocking
- ❌ No productivity scoring
- ❌ No behavioral inference
- ❌ No Gemini calls in core loop
- ❌ No Google Calendar writes
- ❌ No Reflection/Mood data access
- ❌ No Memory auto-save
- ✅ Timer completion → Outcome Review
- ✅ Elapsed ≠ credited
- ✅ One active session
- ✅ Stale session detection
- ✅ Device-local storage
- ✅ Bounded history (500 / 90 days)
- ✅ Offline-first

## Accessible Wording

- "Phiên này ghi nhận 30 phút tiến độ" (neutral)
- NOT: "Bạn thiếu tập trung" (judgmental)
- NOT: "Bạn thất bại" (shaming)

## Privacy

Focus session store contains:
- Task reference (uid, text)
- Timestamps (startedAt, endedAt)
- Minutes (planned, elapsed, credited)
- Status, outcome

Does NOT contain:
- Keystrokes
- Screen content
- Website history
- File contents
- Calendar event titles

## Files Changed

| File | Change |
|------|--------|
| `js/focus-session.js` | New module |
| `js/ai-intent.js` | classifyFocusIntent export |
| `js/app.js` | Lazy-loading chain |
| `js/i18n.js` | VI + EN focus session keys |
| `sw.js` | Precache focus-session.min.js |
| `tests/phase6n-focus-progress.test.mjs` | Comprehensive tests |
| `docs/qa/ai-focus-progress.md` | This document |
