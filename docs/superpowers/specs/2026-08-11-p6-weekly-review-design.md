# P6 Weekly Review Design

**Date:** 2026-08-11  
**Status:** Approved  
**Branch:** `codex/p4-task-focus-metrics`

## Goal

Turn the existing four-question weekly reflection card into a structured Weekly Review that helps the user understand what happened during one selected week and decide what to change next week.

P6 answers two product questions:

- What did I learn from the week that just ended?
- What should I continue, stop, or change next week?

P6 does not create, move, or carry tasks and goals into another week. It only records three next-week priorities. Plan creation and carry-over remain outside this phase.

## Placement and User Flow

Weekly Review stays inside the existing Week view. It replaces the current weekly reflection card in the support area, so no new top-level navigation is added.

The card contains, in order:

1. A heading: `Week {n} · Review`.
2. A compact summary for tasks, habits, and focus.
3. A compact score for each visible pillar that has scorable metrics.
4. Four labeled reflection textareas:
   - Best thing this week.
   - What got in my way.
   - What I learned.
   - What I should change next week.
5. Three labeled next-week priority inputs.
6. A passive autosave status.
7. A collapsible legacy-notes area when the old weekly reflection contains content.

The layout is responsive. Summary cells may form a compact grid on desktop but stack or wrap without horizontal scrolling on mobile. Textareas remain tall enough to write comfortably. The review stays usable when the week has no activity data.

## Module Boundary

Create `js/weekly-review.js` as `window.TaskFlowWeeklyReview` with CommonJS export support for Node tests, following the existing UMD-style feature modules.

The module owns:

- normalization of Weekly Review records;
- extraction of the selected week's date range and activity;
- pure summary and pillar-score calculations;
- Weekly Review HTML rendering;
- field updates and debounced persistence;
- local card status updates.

The module does not own the global month state or duplicate tasks, habits, focus logs, metrics, or old reflections. Runtime dependencies are passed to pure functions or resolved through the existing app integration boundary.

`app.js` remains responsible for:

- ensuring the new state field exists during month-state creation and loading;
- invoking the module from `renderWeek()`;
- routing delegated input events;
- calling the existing `saveSoon()` persistence path.

## Data Model

Add an optional additive field to each month state:

```js
weeklyReviews: [
  {
    best: '',
    blocker: '',
    learned: '',
    change: '',
    priorities: ['', '', ''],
    updatedAt: null
  }
]
```

The array is normalized to `NUM_WEEKS` entries. Each entry maps to the week at the same zero-based index in `state.weeks`.

Normalization rules:

- missing or malformed `weeklyReviews` becomes an array of empty records;
- missing records are appended without replacing valid records;
- text fields accept strings only and otherwise become empty strings;
- priorities are normalized to exactly three strings;
- unknown fields are retained when practical for forward compatibility;
- `updatedAt` remains `null` until the user changes a Weekly Review field.

Review updates use the existing month-state `saveSoon()` path. Because cloud sync and JSON backup already persist the complete month-state JSON value, the new field follows the existing storage path without a new backend schema or separate localStorage key.

## Legacy Weekly Reflection Compatibility

The existing `state.reflections.weeks[weekIndex]` arrays are never deleted, overwritten, or reinterpreted as the new question set.

The legacy prompts do not have a one-to-one semantic mapping to the new questions, especially the old gratitude prompt and free-form next-week goals prompt. Automatic copying could silently change meaning, so P6 does not migrate old answers into new fields.

If any legacy weekly answer is non-empty, the Weekly Review renders a collapsed `Previous reflection notes` section with the original question and answer pairs. The user can still read the old content while writing the new structured review. Existing month reflection and export behavior continues to read the legacy arrays unchanged.

## Weekly Summary Calculation

All summary values are derived from the selected week's seven day records. Blank placeholder tasks are excluded.

### Tasks

- `total`: tasks whose trimmed `text` is non-empty across all seven days;
- `done`: those tasks with `done === true`;
- `pct`: `done / total`, rounded to the nearest integer; zero when total is zero.

### Habits

Only calendar days that belong to the viewed month are eligible. For each habit and eligible day:

- a day in `habit.skipDays` is excluded from the denominator;
- an eligible non-skipped day adds one opportunity;
- `habit.days[dayIndex] === true` adds one completion.

The displayed percentage is total completions divided by total opportunities, rounded to the nearest integer; zero when there are no opportunities.

### Focus

Reuse the existing Pomodoro/focus daily log through `focusWeekMinutes(weekNumber)`. Sum the seven returned minute values. Rendering uses the existing focus-time formatter.

## Pillar Weekly Scores

Only visible pillars are rendered. Hidden pillars and pillars without scorable metrics are omitted.

Each metric produces a week-local `done`, `target`, and percentage. The pillar percentage is the arithmetic mean of its scorable metric percentages, rounded to the nearest integer and capped to `0..100`. A malformed metric or stale link is ignored only when no meaningful target can be derived; it must never make the review fail.

The selected week may contain calendar cells outside the viewed month. Only days inside the viewed month participate in metric calculations.

### HABIT

- `done`: linked habit completions on eligible, non-skipped days in the selected week;
- `target`: eligible, non-skipped days for `daily` mode; otherwise the prorated weekly target described below;
- a missing linked habit makes the metric unscorable.

### MANUAL and CUSTOM

- `done`: checked `metric.days[dayIndex]` entries inside the selected week;
- `target`: the week-local target.

### TASK

- `done`: completed non-blank tasks scheduled in the selected week whose `linkedMetricIds` contains the metric id;
- `target`: the week-local target;
- unrelated tasks never affect the score.

### FOCUS

- `done`: total linked-task focus minutes whose focus-log date falls within both the selected week and the viewed month;
- `target`: the week-local target expressed in minutes;
- focus from unrelated tasks never affects the score.

### Week-local Target

Let `eligibleDays` be the count of selected-week dates inside the viewed month and `monthDays` be the actual day count of that month.

- `daily`: target equals `eligibleDays`.
- `perWeek`: target equals `metric.target.value * eligibleDays / 7`.
- `perMonth` or `custom`: target equals `metric.target.value * eligibleDays / monthDays`.

Targets may be fractional for scoring and are not rounded before division. A target less than or equal to zero is unscorable. This keeps partial boundary weeks proportional and avoids February or 31-day-month distortion.

## Editing and Persistence

Every textarea and priority input has a stable data attribute identifying the selected week and field. Delegated input handling updates only that week's normalized record.

Saving is debounced using the existing `saveSoon()` persistence mechanism. Each accepted edit sets `updatedAt` to the current ISO timestamp and changes the card status to `Saving…`; after the debounce interval, the status becomes `Saved`. Rendering another week reads its own record and never leaks draft values across week indexes.

No primary Save button is required. A persistence failure follows the application's existing storage behavior; the module must not claim `Saved` before the scheduled save callback has run.

## Accessibility and Internationalization

- The card is a named section with a stable `data-testid="weekly-review"`.
- Every textarea and priority input has a visible `<label>` and an accessible name.
- Summary and pillar percentages use semantic text; progress bars, if used, include `aria-valuemin`, `aria-valuemax`, and `aria-valuenow`.
- Legacy notes use a native disclosure element where possible.
- Focus order follows visual order.
- Focus-visible styling, dark mode, reduced motion, and existing dialog behavior are preserved.
- All new copy is added to both Vietnamese and English dictionaries. No user-facing Vietnamese string is hard-coded in the feature module.

## Production Integration

- Load `weekly-review.min.js` before `app.min.js` in `app.html`.
- Guard the module in `app.js` at boot.
- Add the minified asset to the service-worker app shell and bump the cache version.
- Regenerate all changed minified siblings and bump affected asset query versions.
- Add stable E2E selectors rather than relying on presentation classes.

## Empty and Error States

- A week with no tasks, habits, focus, or scorable pillars still renders the review form.
- Summary values display zero rather than `NaN`, `Infinity`, or an absent card.
- A missing habit, task link, metric, pillar, focus log, or malformed legacy record is tolerated.
- Hidden pillars remain absent.
- When no pillar can be scored, show a short neutral message while retaining the reflection fields.

## Testing Strategy

### Unit tests

Add a focused P6 test file covering:

- normalization of missing, partial, and malformed review records;
- preservation of unknown record fields;
- tasks excluding blank placeholders;
- habit totals with skipped days;
- focus minute aggregation contract;
- HABIT, MANUAL/CUSTOM, TASK, and FOCUS week-local metric scores;
- exclusion of unrelated task/focus data;
- stale links and malformed data;
- boundary weeks spanning two months;
- February, leap-year February, and 31-day target prorating;
- visible pillar averaging and hidden-pillar omission;
- legacy reflection content remaining unchanged;
- VI/EN keys, asset load order, service-worker cache, and mirrored CSS.

### Browser tests

Add a focused `weekly-review` E2E scenario and include it in the release matrix. Verify:

- the selected week's derived summary;
- pillar scores from linked data;
- editing all four questions and three priorities;
- autosave status and persistence after reload;
- switching weeks keeps records isolated;
- legacy notes remain readable;
- empty-week usability;
- mobile layouts at 360×800, 390×844, and 412×915;
- dark mode;
- no console errors and stable test ids.

### Regression checks

Run the full unit suite, sync tests, minification check, full Chromium E2E matrix, focused P6 E2E, mobile QA, accessibility audit, critical CSS verifier, and repository diff checks.

## Out of Scope

- Creating next week's goals or tasks.
- Previewing task carry-over.
- Automatically moving unfinished tasks.
- Monthly Review.
- Next Month Carry-over.
- New navigation or a separate review dashboard.
- Sending reflection content to an external AI or API.

