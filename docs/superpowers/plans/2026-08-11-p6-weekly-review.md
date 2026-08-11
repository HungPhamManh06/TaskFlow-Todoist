# P6 Weekly Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy weekly reflection card in Week view with a structured, autosaved Weekly Review containing week-local activity summaries, pillar scores, four reflection answers, and three next-week priorities.

**Architecture:** Add a focused UMD module, `js/weekly-review.js`, that owns record normalization, pure week calculations, rendering, and field mutation while receiving state and calendar context as arguments. Keep records as an additive `state.weeklyReviews` array and preserve `state.reflections.weeks` unchanged as readable legacy notes. Integrate through the existing Week renderer, delegated input handling, whole-month persistence, minification, service-worker shell, and E2E matrix.

**Tech Stack:** Vanilla JavaScript UMD modules, HTML/CSS, localStorage month-state JSON, Node `node:test`, Python Playwright E2E, existing minification/QA scripts.

## Global Constraints

- Do not create, move, carry, or preview next-week tasks or goals in P6.
- Weekly summary and pillar scores use only the selected week; pillar metric dates must also belong to the viewed month.
- Preserve `state.reflections.weeks` byte-for-byte as legacy content; never reinterpret old gratitude or next-week-goal answers as new fields.
- Store only additive `state.weeklyReviews`; do not add a localStorage key or backend schema.
- Only linked tasks and linked-task focus entries may affect TASK/FOCUS metric scores.
- Missing metrics, stale links, malformed records, empty weeks, boundary weeks, February, leap years, and 31-day months must not throw or produce `NaN`/`Infinity`.
- All new user-facing copy must exist in Vietnamese and English.
- Mobile must not require horizontal scrolling at 360×800, 390×844, or 412×915; preserve dark mode and focus-visible behavior.
- Use stable `data-testid` and data attributes for E2E; do not select by presentation-only CSS classes.
- Follow TDD: observe each focused test fail before writing the implementation that makes it pass.

---

## File Structure

- Create `js/weekly-review.js`: normalization, calendar slicing, weekly summary, metric/pillar scoring, review mutation, and HTML rendering.
- Create `js/weekly-review.min.js`: generated production sibling.
- Create `tests/phase16-weekly-review.test.mjs`: pure behavior, renderer contract, state wiring, i18n, CSS, production-asset, and E2E-contract assertions.
- Modify `js/app.js`: module guard, state migration hooks, Week composition, delegated editing, autosave status.
- Modify `js/i18n.js`: Vietnamese and English Weekly Review strings.
- Modify `css/styles.css` and `css/styles-deferred.css`: source and deferred responsive/dark-compatible styles.
- Modify generated `js/app.min.js`, `js/i18n.min.js`, `css/styles.min.css`, and `css/styles-deferred.min.css`.
- Modify `app.html`: load/version production assets.
- Modify `sw.js`: precache Weekly Review and bump cache.
- Modify `scripts/e2e-frontend.py`: focused `weekly-review` scenario and full-matrix registration.
- Modify `docs/development-history.md`, `docs/mobile-qa.md`, and `docs/a11y-audit.md`: verified P6 outcome and regenerated audit evidence.

---

### Task 1: Weekly Review Records and Activity Summary

**Files:**
- Create: `js/weekly-review.js`
- Create: `tests/phase16-weekly-review.test.mjs`

**Interfaces:**
- Produces: `emptyReview(): WeeklyReview`
- Produces: `normalizeReview(raw: unknown): WeeklyReview`
- Produces: `ensureWeeklyReviews(state: object, count: number): WeeklyReview[]`
- Produces: `weekCalendarDays(week: object, context: CalendarContext): WeekDayContext[]`
- Produces: `weeklySummary(week: object, habits: object[], focusMinutes: number, context: CalendarContext): WeeklySummary`
- `CalendarContext` is `{ planStart: Date, year: number, month: number, monthDays: number }`, where `month` is zero-based.
- `WeeklySummary` is `{ tasksDone, tasksTotal, tasksPct, habitsDone, habitsTotal, habitsPct, focusMinutes }`.

- [ ] **Step 1: Write failing normalization tests**

Create the test file with Node imports and exact record expectations:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import WeeklyReview from '../js/weekly-review.js';

const {
  emptyReview, normalizeReview, ensureWeeklyReviews,
  weekCalendarDays, weeklySummary,
} = WeeklyReview;

test('normalizeReview fills missing fields and preserves forward fields', () => {
  const out = normalizeReview({ best: 'Win', priorities: ['A'], future: 7 });
  assert.deepEqual(out.priorities, ['A', '', '']);
  assert.equal(out.blocker, '');
  assert.equal(out.learned, '');
  assert.equal(out.change, '');
  assert.equal(out.updatedAt, null);
  assert.equal(out.future, 7);
});

test('ensureWeeklyReviews adds records without replacing valid data', () => {
  const state = { weeklyReviews: [{ best: 'Kept' }], reflections: { weeks: [['legacy']] } };
  const reviews = ensureWeeklyReviews(state, 3);
  assert.equal(reviews.length, 3);
  assert.equal(reviews[0].best, 'Kept');
  assert.deepEqual(state.reflections.weeks, [['legacy']]);
});
```

- [ ] **Step 2: Run the new test to verify RED**

Run: `node --test tests/phase16-weekly-review.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/weekly-review.js`.

- [ ] **Step 3: Implement record normalization**

Create the same UMD shape as `js/alignment.js`. Implement immutable defaults and additive normalization:

```js
function emptyReview() {
  return {
    best: '', blocker: '', learned: '', change: '',
    priorities: ['', '', '], updatedAt: null,
  };
}

function normalizeReview(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = Object.assign({}, source, emptyReview());
  ['best', 'blocker', 'learned', 'change'].forEach((key) => {
    out[key] = typeof source[key] === 'string' ? source[key] : '';
  });
  const priorities = Array.isArray(source.priorities) ? source.priorities : [];
  out.priorities = [0, 1, 2].map((i) => typeof priorities[i] === 'string' ? priorities[i] : '');
  out.updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : null;
  return out;
}

function ensureWeeklyReviews(state, count) {
  const source = Array.isArray(state.weeklyReviews) ? state.weeklyReviews : [];
  state.weeklyReviews = Array.from({ length: Math.max(0, count || 0) }, (_, i) => normalizeReview(source[i]));
  return state.weeklyReviews;
}
```

Export these functions from the factory.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/phase16-weekly-review.test.mjs`

Expected: PASS for the two normalization tests.

- [ ] **Step 5: Add failing week-calendar and summary tests**

Add fixtures for a boundary week beginning 2026-07-27 while viewing August 2026:

```js
const context = {
  planStart: new Date(2026, 6, 27), year: 2026, month: 7, monthDays: 31,
};

const week = {
  n: 1,
  days: Array.from({ length: 7 }, (_, i) => ({
    tasks: i === 5
      ? [{ text: 'Linked work', done: true }, { text: '   ', done: true }]
      : [{ text: `Task ${i}`, done: i % 2 === 0 }],
  })),
};

test('weekCalendarDays marks only dates inside the viewed month', () => {
  const days = weekCalendarDays(week, context);
  assert.deepEqual(days.map((d) => d.inMonth), [false, false, false, false, false, true, true]);
  assert.deepEqual(days.filter((d) => d.inMonth).map((d) => d.dayIndex), [0, 1]);
  assert.deepEqual(days.filter((d) => d.inMonth).map((d) => d.dateKey), ['2026-08-01', '2026-08-02']);
});

test('weeklySummary excludes blank tasks and skipped habit opportunities', () => {
  const habits = [
    { days: [true, false], skipDays: [1] },
    { days: [false, true], skipDays: [] },
  ];
  assert.deepEqual(weeklySummary(week, habits, 95, context), {
    tasksDone: 4,
    tasksTotal: 7,
    tasksPct: 57,
    habitsDone: 2,
    habitsTotal: 3,
    habitsPct: 67,
    focusMinutes: 95,
  });
});

test('weeklySummary tolerates empty and malformed input', () => {
  assert.deepEqual(weeklySummary({}, null, NaN, context), {
    tasksDone: 0, tasksTotal: 0, tasksPct: 0,
    habitsDone: 0, habitsTotal: 0, habitsPct: 0,
    focusMinutes: 0,
  });
});
```

- [ ] **Step 6: Run the summary tests to verify RED**

Run: `node --test tests/phase16-weekly-review.test.mjs`

Expected: FAIL because `weekCalendarDays` and `weeklySummary` are not exported.

- [ ] **Step 7: Implement calendar slicing and summary calculation**

Implement `weekCalendarDays` from `context.planStart + ((week.n - 1) * 7 + dayIndex)` local calendar days. Return objects containing `index`, `record`, `date`, `dateKey`, `inMonth`, and `dayIndex` (`-1` outside the viewed month). Avoid parsing the display-only `day.date` string.

Implement `weeklySummary` with these exact rules:

```js
const taskList = days.flatMap((day) => {
  const tasks = day.record && Array.isArray(day.record.tasks) ? day.record.tasks : [];
  return tasks.filter((task) => task && typeof task.text === 'string' && task.text.trim());
});
const tasksDone = taskList.filter((task) => task.done === true).length;

let habitsDone = 0;
let habitsTotal = 0;
days.filter((day) => day.inMonth).forEach((day) => {
  safeHabits.forEach((habit) => {
    const skipped = Array.isArray(habit.skipDays) && habit.skipDays.includes(day.dayIndex);
    if (!skipped) {
      habitsTotal += 1;
      if (Array.isArray(habit.days) && habit.days[day.dayIndex] === true) habitsDone += 1;
    }
  });
});
```

Clamp non-finite or negative `focusMinutes` to zero and round it to the nearest integer.

- [ ] **Step 8: Run focused and legacy unit tests**

Run:

```powershell
node --test tests/phase16-weekly-review.test.mjs
node --test tests/phase11-reflection.test.mjs tests/phase15-daily-alignment.test.mjs
```

Expected: all focused and selected legacy tests PASS.

- [ ] **Step 9: Commit Task 1**

```powershell
git add js/weekly-review.js tests/phase16-weekly-review.test.mjs
git commit -m "feat(review): derive weekly activity summary"
```

---

### Task 2: Week-local Metric and Pillar Scores

**Files:**
- Modify: `js/weekly-review.js`
- Modify: `tests/phase16-weekly-review.test.mjs`

**Interfaces:**
- Consumes: `weekCalendarDays(week, context)` from Task 1.
- Produces: `weekTarget(metric: object, eligibleDays: number, monthDays: number): number | null`
- Produces: `weeklyMetricProgress(state: object, week: object, metric: object, context: CalendarContext): { done, target, pct } | null`
- Produces: `weeklyPillarScores(state: object, week: object, context: CalendarContext): PillarScore[]`
- `PillarScore` is `{ id, name, icon, pct, metricCount }`.

- [ ] **Step 1: Write failing target-proration tests**

```js
test('weekTarget prorates all modes without rounding the target', () => {
  assert.equal(weekTarget({ target: { mode: 'daily', value: 99 } }, 2, 31), 2);
  assert.equal(weekTarget({ target: { mode: 'perWeek', value: 7 } }, 2, 31), 2);
  assert.equal(weekTarget({ target: { mode: 'perMonth', value: 31 } }, 2, 31), 2);
  assert.equal(weekTarget({ target: { mode: 'custom', value: 15.5 } }, 2, 31), 1);
});

test('weekTarget handles February and leap-year proportions', () => {
  assert.equal(weekTarget({ target: { mode: 'perMonth', value: 28 } }, 7, 28), 7);
  assert.equal(weekTarget({ target: { mode: 'perMonth', value: 29 } }, 7, 29), 7);
  assert.equal(weekTarget({ target: { mode: 'perMonth', value: 31 } }, 7, 31), 7);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test tests/phase16-weekly-review.test.mjs`

Expected: FAIL because `weekTarget` is not exported.

- [ ] **Step 3: Implement `weekTarget`**

Normalize `mode` to `daily` and positive numeric `value` to `1`, then return:

```js
if (mode === 'daily') return eligibleDays > 0 ? eligibleDays : null;
if (mode === 'perWeek') return eligibleDays > 0 ? value * eligibleDays / 7 : null;
return eligibleDays > 0 && monthDays > 0 ? value * eligibleDays / monthDays : null;
```

Return `null` for a non-positive result.

- [ ] **Step 4: Add failing metric-type tests**

Build a seven-day August fixture containing:

- a linked habit completed on two of three eligible days with one skip;
- two TASK-linked tasks plus one unrelated completed task;
- FOCUS logs on linked tasks both inside and outside the selected week;
- MANUAL checked days;
- a stale HABIT link.

Assert exact results:

```js
assert.deepEqual(weeklyMetricProgress(state, fullWeek, habitMetric, augustContext), {
  done: 2, target: 6, pct: 33,
});
assert.deepEqual(weeklyMetricProgress(state, fullWeek, taskMetric, augustContext), {
  done: 1, target: 2, pct: 50,
});
assert.deepEqual(weeklyMetricProgress(state, fullWeek, focusMetric, augustContext), {
  done: 90, target: 120, pct: 75,
});
assert.equal(weeklyMetricProgress(state, fullWeek, staleHabitMetric, augustContext), null);
```

The fixture must prove an unrelated task and its focus log do not change TASK or FOCUS results.

- [ ] **Step 5: Run metric tests to verify RED**

Run: `node --test tests/phase16-weekly-review.test.mjs`

Expected: FAIL because `weeklyMetricProgress` is not exported.

- [ ] **Step 6: Implement each metric type**

Use only in-month `weekCalendarDays` entries.

- HABIT: find `state.habits` by `linkedHabitId`; count true days and exclude skips; use non-skipped eligible days as the daily target, otherwise `weekTarget`.
- MANUAL/CUSTOM: count true `metric.days[dayIndex]`; use `weekTarget`.
- TASK: scan non-blank tasks in the selected week and count only `done === true` tasks whose normalized `linkedMetricIds` contains `metric.id`; use `weekTarget`.
- FOCUS: scan tasks linked to `metric.id`; sum valid `task.focusLog` entries whose `d` is between the first and last in-month selected-week date keys; convert summed seconds to minutes after summing; use `weekTarget`.

Calculate `pct` as `Math.min(100, Math.max(0, Math.round(done / target * 100)))`. Return `null` for unsupported types, stale HABIT links, missing metric ids where required, or invalid targets.

- [ ] **Step 7: Add failing pillar aggregation tests**

```js
test('weeklyPillarScores averages scorable metrics and omits hidden or empty pillars', () => {
  const scores = weeklyPillarScores(state, fullWeek, augustContext);
  assert.deepEqual(scores.map((p) => ({ id: p.id, pct: p.pct, metricCount: p.metricCount })), [
    { id: 'body', pct: 33, metricCount: 1 },
    { id: 'work', pct: 63, metricCount: 2 },
  ]);
  assert.ok(!scores.some((p) => p.id === 'hidden'));
  assert.ok(!scores.some((p) => p.id === 'empty'));
});
```

- [ ] **Step 8: Implement pillar aggregation and run tests**

Filter `state.pillars` to `hidden !== true`. Map each metric through `weeklyMetricProgress`, discard `null`, average the remaining percentages, and return only pillars with at least one result.

Run:

```powershell
node --test tests/phase16-weekly-review.test.mjs
node --test tests/phase13-metrics.test.mjs tests/phase14-task-focus-metrics.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 9: Commit Task 2**

```powershell
git add js/weekly-review.js tests/phase16-weekly-review.test.mjs
git commit -m "feat(review): score weekly pillar progress"
```

---

### Task 3: Weekly Review Renderer and Editing Contract

**Files:**
- Modify: `js/weekly-review.js`
- Modify: `tests/phase16-weekly-review.test.mjs`
- Modify: `js/i18n.js`
- Modify: `css/styles.css`
- Modify: `css/styles-deferred.css`

**Interfaces:**
- Consumes: Task 1 and Task 2 functions.
- Produces: `buildWeeklyReviewModel(state, weekIndex, options): WeeklyReviewModel`
- Produces: `weeklyReviewHTML(model, options): string`
- Produces: `updateReviewField(state, weekIndex, field, value, priorityIndex, nowISO): WeeklyReview | null`
- `options` supplies `{ planStart, year, month, monthDays, focusMinutes, t, esc, formatFocusTime, legacyPrompts }`.

- [ ] **Step 1: Write failing model and mutation tests**

```js
test('buildWeeklyReviewModel keeps legacy notes separate from the new record', () => {
  const state = {
    weeklyReviews: [{ best: 'New win' }],
    reflections: { weeks: [['Old win', '', 'Old gratitude', 'Old goals']] },
    weeks: [fullWeek], habits: [], pillars: [],
  };
  const model = buildWeeklyReviewModel(state, 0, {
    ...augustContext, focusMinutes: 30,
    legacyPrompts: ['Old Q1', 'Old Q2', 'Old Q3', 'Old Q4'],
  });
  assert.equal(model.review.best, 'New win');
  assert.deepEqual(model.legacy.map((x) => x.answer), ['Old win', 'Old gratitude', 'Old goals']);
  assert.deepEqual(state.reflections.weeks[0], ['Old win', '', 'Old gratitude', 'Old goals']);
});

test('updateReviewField edits only allowed fields and one priority', () => {
  const state = { weeklyReviews: [] };
  updateReviewField(state, 1, 'blocker', 'Meetings', null, '2026-08-11T12:00:00.000Z');
  updateReviewField(state, 1, 'priority', 'Ship P6', 2, '2026-08-11T12:01:00.000Z');
  assert.equal(state.weeklyReviews[1].blocker, 'Meetings');
  assert.equal(state.weeklyReviews[1].priorities[2], 'Ship P6');
  assert.equal(updateReviewField(state, 1, 'unknown', 'x', null, 'now'), null);
});
```

- [ ] **Step 2: Run tests to verify RED, then implement model/mutation**

Run: `node --test tests/phase16-weekly-review.test.mjs`

Expected: FAIL because both functions are missing.

Implement `buildWeeklyReviewModel` by normalizing `state.weeklyReviews`, selecting `state.weeks[weekIndex]`, calling `weeklySummary` and `weeklyPillarScores`, and zipping non-empty legacy answers with the original prompt at the same index. Do not mutate `state.reflections`.

Implement `updateReviewField` with an allowlist of `best`, `blocker`, `learned`, `change`, plus field `priority` with integer index `0..2`. Update only the selected review and assign `updatedAt = nowISO`.

- [ ] **Step 3: Write failing renderer contract tests**

Create a deterministic translator and assert:

```js
const html = weeklyReviewHTML(model, { t: tr, esc, formatFocusTime: (m) => `${m}m` });
assert.match(html, /data-testid="weekly-review"/);
assert.match(html, /data-testid="weekly-review-summary"/);
assert.match(html, /data-testid="weekly-review-pillar"/);
assert.match(html, /data-week-review-field="best"/);
assert.match(html, /data-week-review-field="blocker"/);
assert.match(html, /data-week-review-field="learned"/);
assert.match(html, /data-week-review-field="change"/);
assert.equal((html.match(/data-week-review-field="priority"/g) || []).length, 3);
assert.match(html, /<details[^>]*data-testid="weekly-review-legacy"/);
assert.match(html, /aria-valuenow="\d+"/);
```

Also render an empty model and assert the form remains present with the no-pillar message and zero summary values.

- [ ] **Step 4: Implement semantic HTML renderer**

Use visible `<label>` elements around all textareas and priority inputs. Include these stable selectors:

- `data-testid="weekly-review"`
- `data-testid="weekly-review-summary"`
- `data-testid="weekly-review-pillar"`
- `data-testid="weekly-review-status"`
- `data-testid="weekly-review-legacy"`
- `data-week-review-field="best|blocker|learned|change|priority"`
- `data-week-index="{zeroBasedIndex}"`
- `data-priority-index="0|1|2"`

Render pillar bars with `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, and the calculated `aria-valuenow`.

- [ ] **Step 5: Add VI/EN strings and source-level assertions**

Add matching keys in both dictionaries:

```js
weeklyReviewTitle: 'Tuần {n} · Review',
weeklyReviewSummary: 'Tổng kết tuần',
weeklyReviewTasks: 'Tasks',
weeklyReviewHabits: 'Thói quen',
weeklyReviewFocus: 'Tập trung',
weeklyReviewPillars: 'Tiến độ theo trụ cột',
weeklyReviewNoPillars: 'Tuần này chưa có metric đủ dữ liệu để tính.',
weeklyReviewBest: 'Điều tốt nhất tuần này?',
weeklyReviewBlocker: 'Điều gì cản trở tôi?',
weeklyReviewLearned: 'Tôi học được điều gì?',
weeklyReviewChange: 'Tuần sau tôi nên thay đổi điều gì?',
weeklyReviewPriorities: 'Ưu tiên tuần sau',
weeklyReviewPriority: 'Ưu tiên {n}',
weeklyReviewSaving: 'Đang lưu…',
weeklyReviewSaved: 'Đã lưu',
weeklyReviewLegacy: 'Ghi chú reflection trước đây',
```

Add semantically equivalent English values. Extend the focused test to verify every key occurs twice in `js/i18n.js`.

- [ ] **Step 6: Add mirrored responsive styles**

Add the same Weekly Review component block to `css/styles.css` and `css/styles-deferred.css`, adapting placement to each file's split structure. Required selectors:

```css
.weekly-review-card {}
.weekly-review-summary-grid {}
.weekly-review-summary-cell {}
.weekly-review-pillars {}
.weekly-review-pillar {}
.weekly-review-pillar-bar {}
.weekly-review-fields {}
.weekly-review-field {}
.weekly-review-textarea {}
.weekly-review-priorities {}
.weekly-review-priority {}
.weekly-review-status {}
.weekly-review-legacy {}
```

Use existing tokens, `min-width: 0`, wrapping grids, and `width: 100%`. At `max-width: 600px`, use one column for reflection fields and priorities. Do not set a fixed card height or horizontal overflow.

Extend the test to confirm selectors exist in both source stylesheets and the mobile rule exists.

- [ ] **Step 7: Run focused tests and CSS diff check**

Run:

```powershell
node --test tests/phase16-weekly-review.test.mjs
python scripts/verify-critical-css.py
git diff --check
```

Expected: focused tests PASS, CSS verifier reports `TOTAL DIFFS: 0`, and diff check exits zero.

- [ ] **Step 8: Commit Task 3**

```powershell
git add js/weekly-review.js js/i18n.js css/styles.css css/styles-deferred.css tests/phase16-weekly-review.test.mjs
git commit -m "feat(review): render structured weekly review"
```

---

### Task 4: State Integration, Production Assets, E2E, and Release Verification

**Files:**
- Modify: `js/app.js`
- Create: `js/weekly-review.min.js`
- Modify: `js/app.min.js`
- Modify: `js/i18n.min.js`
- Modify: `css/styles.min.css`
- Modify: `css/styles-deferred.min.css`
- Modify: `app.html`
- Modify: `sw.js`
- Modify: `scripts/e2e-frontend.py`
- Modify: `tests/phase16-weekly-review.test.mjs`
- Modify: `docs/development-history.md`
- Modify: `docs/mobile-qa.md`
- Modify: `docs/a11y-audit.md`

**Interfaces:**
- Consumes: `TaskFlowWeeklyReview` API from Tasks 1–3.
- Produces: a production-loaded, persisted Weekly Review in Week view and a focused browser-verification scenario.

- [ ] **Step 1: Write failing state and production-wiring assertions**

Add source assertions that require:

```js
assert.match(APP_JS, /TaskFlowWeeklyReview missing/);
assert.match(APP_JS, /ensureWeeklyReviews\(s, NUM_WEEKS\)/);
assert.match(APP_JS, /weeklyReviewHTML/);
assert.match(APP_JS, /data\.weekReviewField|dataset\.weekReviewField/);
assert.ok(APP_HTML.indexOf('js/weekly-review.min.js') < APP_HTML.indexOf('js/app.min.js'));
assert.match(SW, /'\.\/js\/weekly-review\.min\.js'/);
assert.match(SW, /taskflow-v189/);
```

Also assert `defaultState()` and `emptyState()` include `weeklyReviews`, and `save()` normalizes it before serialization.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `node --test tests/phase16-weekly-review.test.mjs`

Expected: FAIL on missing app integration and production asset assertions.

- [ ] **Step 3: Integrate state migration and Week rendering**

In `app.js`:

1. Guard and alias `window.TaskFlowWeeklyReview` after the existing feature-module guards.
2. Add `weeklyReviews: Array.from({ length: NUM_WEEKS }, emptyReview)` to `defaultState()` and `emptyState()`.
3. Call `ensureWeeklyReviews(s, NUM_WEEKS)` in `loadState()` after the existing reflection check.
4. Call `ensureWeeklyReviews(state, NUM_WEEKS)` inside `save()` before serialization.
5. In `renderWeek()`, calculate `focusMinutes` as the sum of `focusWeekMinutes(w.n)`, build the model with `PLAN_START`, `PLAN_YEAR`, `PLAN_MONTH`, `NUM_DAYS`, and `REFLECT_PROMPTS_WEEK()`, then replace the old `reflectionHTML('w' + w.n, ...)` card with `weeklyReviewHTML(model, { t, esc, formatFocusTime })`.

Keep `reflectionHTML` and old arrays for month/year/legacy rendering; do not delete them.

- [ ] **Step 4: Integrate delegated input and autosave status**

At the start of the existing delegated `input` handler, add the Weekly Review branch:

```js
if (t.dataset.weekReviewField) {
  const weekIndex = Number(t.dataset.weekIndex);
  const priorityIndex = t.dataset.priorityIndex === undefined ? null : Number(t.dataset.priorityIndex);
  const updated = window.TaskFlowWeeklyReview.updateReviewField(
    state, weekIndex, t.dataset.weekReviewField, t.value,
    priorityIndex, new Date().toISOString()
  );
  if (updated) {
    window.TaskFlowWeeklyReview.setSaveStatus(t('weeklyReviewSaving'));
    saveSoon();
    window.TaskFlowWeeklyReview.scheduleSavedStatus(() => {
      window.TaskFlowWeeklyReview.setSaveStatus(t('weeklyReviewSaved'));
    }, 450);
  }
} else if (t.dataset.reflectQ) {
```

Add module functions `setSaveStatus(text)` and `scheduleSavedStatus(callback, delay)` with one internal timer. The delay is 450 ms, greater than the existing 350 ms `saveSoon()` delay, so the UI does not announce saved before persistence runs. `flushPendingSaves()` remains unchanged.

- [ ] **Step 5: Generate production assets and update cache versions**

Modify `app.html` to:

- load `js/weekly-review.min.js?v=1` after `js/alignment.min.js` and before `js/app.min.js`;
- bump `js/i18n.min.js` from `v=4` to `v=5`;
- bump `js/app.min.js` from `v=161` to `v=162`;
- bump `css/styles-deferred.min.css` and its `<noscript>` copy from `v=6` to `v=7`.

Modify `sw.js` to `const CACHE = 'taskflow-v189';` and add `'./js/weekly-review.min.js'` to `APP_SHELL`.

Run: `python scripts/minify.py`

Expected: generated minified siblings are updated, including the new Weekly Review file.

- [ ] **Step 6: Run focused production tests**

Run:

```powershell
node --test tests/phase16-weekly-review.test.mjs
node --test tests/phase9-frontend.test.mjs tests/phase11-reflection.test.mjs tests/phase14-task-focus-metrics.test.mjs tests/phase15-daily-alignment.test.mjs
python scripts/minify.py --check
```

If a legacy test asserts cache `v188`, update only that exact expectation to `v189` and rerun. Expected: all tests PASS and all minified files are current.

- [ ] **Step 7: Add focused browser scenario**

In `scripts/e2e-frontend.py`, implement:

```python
def weekly_review_checks(browser, base, width, height, errors, screenshot):
    # Seed one selected week with completed/unfinished tasks, habit days,
    # linked TASK/FOCUS metrics, focus logs, legacy reflection text,
    # and an empty weeklyReviews array before opening Week view.
    # Assert derived task/habit/focus values and pillar percentages.
    # Fill four textareas and three priority inputs via stable data attributes.
    # Wait beyond the 350 ms save debounce, reload, and assert all seven values.
    # Switch to another week and assert the fields are isolated.
    # Open legacy details and assert the original answer remains readable.
    # Enable dark mode and assert there is no page overflow.
    # Save the requested screenshot and collect page errors.
```

Use actual Playwright statements matching existing scenarios, including `page.locator('[data-testid="weekly-review"]')`, `.fill()`, `page.wait_for_timeout(500)`, reload, and `assert_no_page_overflow`.

Register `weekly-review` in:

- argparse `--view` choices;
- the `--all` scenario list;
- focused dispatch with 1440×900 and 390×844 screenshots.

Extend the Node test to assert all three registrations exist.

- [ ] **Step 8: Run RED then GREEN E2E**

Before implementing the scenario registration, run:

`node --test tests/phase16-weekly-review.test.mjs`

Expected: FAIL on missing `weekly-review` E2E contract.

After implementation, run:

`python scripts/e2e-frontend.py --view weekly-review`

Expected: `E2E WEEKLY-REVIEW OK`, desktop/mobile screenshots written, and no collected page errors.

Inspect both screenshots. Confirm form labels, summary wrapping, priority inputs, legacy disclosure, mobile keyboard-safe spacing, and dark-mode contrast.

- [ ] **Step 9: Run full verification**

Run the following fresh commands on the final tree:

```powershell
node --test tests/*.test.mjs
node test-sync.js
python scripts/minify.py --check
python scripts/e2e-frontend.py --all
python scripts/smoke-test.py
python scripts/mobile-qa.py
python scripts/a11y-audit.py
python scripts/verify-critical-css.py
git diff --check
git status --short
```

Expected gates:

- Node unit suite: zero failures.
- Sync: 7/7 PASS; the existing dev-only JWT warning is acceptable.
- Minification: every `.min` sibling current.
- Full Chromium E2E: release matrix succeeds with Weekly Review included.
- Smoke test: OK.
- Mobile QA: 262/262 or higher, zero failures.
- Accessibility audit: 62/62 or higher, zero failures.
- Critical CSS: `TOTAL DIFFS: 0`.
- Diff check: no whitespace errors.
- Status: only intended P6 files modified.

- [ ] **Step 10: Review migration and compatibility**

Inspect the final diff and confirm:

- old `state.reflections.weeks` values are neither modified nor migrated into new semantics;
- `weeklyReviews` is initialized in default, empty, loaded legacy, and save paths;
- full month-state JSON makes backup/export/sync include the additive field;
- no backend, authentication, import parser, task lifecycle, or habit writer changed;
- Weekly Review has no task/goal creation action;
- stale links and empty weeks are covered by tests.

- [ ] **Step 11: Update project history and audit evidence**

Append `Personal Growth & Reflection — P6: Weekly Review` to `docs/development-history.md`, recording only verified counts from Step 9. Keep generated timestamp/count changes from mobile and accessibility scripts in their audit documents.

- [ ] **Step 12: Commit Task 4**

Stage only the intended production, test, and documentation files, inspect the cached diff, then commit:

```powershell
git add js/weekly-review.js js/weekly-review.min.js js/app.js js/app.min.js js/i18n.js js/i18n.min.js css/styles.css css/styles.min.css css/styles-deferred.css css/styles-deferred.min.css app.html sw.js scripts/e2e-frontend.py tests/phase16-weekly-review.test.mjs docs/development-history.md docs/mobile-qa.md docs/a11y-audit.md
git diff --cached --check
git diff --cached --stat
git commit -m "feat(review): integrate weekly review workflow"
```

- [ ] **Step 13: Verify the committed tree and stop**

Run:

```powershell
node --test tests/*.test.mjs
node test-sync.js
git status --short
git log --oneline -6
```

Expected: unit and sync suites pass, the worktree is clean, and P6 commits appear at HEAD. Stop after P6 and present branch integration choices; do not begin P7 Monthly Review.
