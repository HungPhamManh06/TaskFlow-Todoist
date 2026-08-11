# P4 Task and Focus Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit many-to-many task-to-monthly-metric links so TASK metrics count completed linked tasks and FOCUS metrics count focus minutes from linked tasks only.

**Architecture:** Keep metric definitions inside each month state's pillars and store the relationship on scheduled tasks as `linkedMetricIds`. Extend `js/pillars.js` with pure normalization and aggregation helpers, then use those helpers from the existing Task Detail and pillar metric UI. Preserve the existing flexible `metricDone`/`metricProgress` HABIT call contract while allowing a full month state for TASK and FOCUS calculations.

**Tech Stack:** Vanilla JavaScript IIFEs, HTML5, CSS custom properties, Node.js `node:test`, Python Playwright E2E, existing `scripts/minify.py` pipeline.

## Global Constraints

- Do not redesign TaskFlow or break Today, Inbox, Upcoming, Week, Month, Year, Habits, Focus, Reports, Task Detail, recurring tasks, localStorage, cloud sync, authentication, import/export, PWA, dark mode, or mobile UI.
- Do not create a second task, habit, or focus store and do not duplicate task/focus data.
- A TASK metric aggregates multiple explicitly linked tasks.
- A FOCUS metric aggregates focus logs only from tasks explicitly linked to that metric.
- One task may link to multiple metrics in its own month.
- Schema changes must be additive, idempotent, backward compatible, and preserve old local/cloud data.
- P4 excludes Daily Alignment, create-today actions, reviews, reports integration, and cross-month carry-over UI.
- Every production behavior follows RED → verify failure → GREEN → verify pass.
- Source files remain readable; regenerate `.min.js`/`.min.css` siblings before browser verification.

---

### Task 1: Pure task-link normalization and TASK/FOCUS aggregation

**Files:**
- Modify: `js/pillars.js`
- Create: `tests/phase14-task-focus-metrics.test.mjs`
- Test: `tests/phase13-metrics.test.mjs`

**Interfaces:**
- Produces: `normalizeTaskMetricIds(task): string[]`
- Produces: `setTaskMetricIds(task, ids): string[]`
- Produces: `monthTasks(state): object[]`
- Extends: `normalizeMetric(metric)` to recognize `TASK|FOCUS` and emit `unit: 'minutes'` for FOCUS.
- Extends: `metricDone(source, metric, context?)` where `source` may be the legacy habits array or a full month state and `context` may contain `{ year, month }`.
- Extends: `metricProgress(source, metric, monthDays, context?)` without changing existing HABIT/MANUAL/CUSTOM behavior.

- [ ] **Step 1: Write failing normalization and migration tests**

Add tests that express the desired public API:

```js
test('normalizeTaskMetricIds: legacy/malformed values become unique string ids', () => {
  assert.deepEqual(normalizeTaskMetricIds({}), []);
  assert.deepEqual(
    normalizeTaskMetricIds({ linkedMetricIds: ['m1', '', 'm1', 7, 'm2'] }),
    ['m1', 'm2'],
  );
});

test('setTaskMetricIds: stores a defensive normalized array', () => {
  const task = {};
  const input = ['m1', 'm1', 'm2'];
  assert.deepEqual(setTaskMetricIds(task, input), ['m1', 'm2']);
  input.push('m3');
  assert.deepEqual(task.linkedMetricIds, ['m1', 'm2']);
});

test('normalizeMetric: recognizes TASK and FOCUS without changing legacy types', () => {
  assert.equal(normalizeMetric({ type: 'TASK' }).type, 'TASK');
  const focus = normalizeMetric({ type: 'FOCUS', target: { mode: 'perMonth', value: 600 } });
  assert.equal(focus.type, 'FOCUS');
  assert.equal(focus.unit, 'minutes');
  assert.equal(normalizeMetric({ type: 'HABIT' }).type, 'HABIT');
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test tests/phase14-task-focus-metrics.test.mjs`

Expected: FAIL because `normalizeTaskMetricIds` and `setTaskMetricIds` are not exported and TASK/FOCUS currently normalize to MANUAL.

- [ ] **Step 3: Implement minimal normalization helpers**

In `js/pillars.js`, add pure helpers equivalent to:

```js
function normalizeTaskMetricIds(task) {
  const ids = task && Array.isArray(task.linkedMetricIds) ? task.linkedMetricIds : [];
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))];
}

function setTaskMetricIds(task, ids) {
  if (!task || typeof task !== 'object') return [];
  task.linkedMetricIds = normalizeTaskMetricIds({ linkedMetricIds: ids });
  return task.linkedMetricIds;
}
```

Extend recognized metric types to `HABIT`, `MANUAL`, `CUSTOM`, `TASK`, and `FOCUS`. FOCUS normalizes to `{ target: { mode: 'perMonth', value }, unit: 'minutes' }`; non-FOCUS metrics omit `unit`. Export both helpers.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/phase14-task-focus-metrics.test.mjs`

Expected: PASS for the normalization tests.

- [ ] **Step 5: Write failing TASK aggregation tests**

Use a fixture with tasks spread across multiple weeks/days:

```js
test('metricDone TASK counts every completed linked task and ignores unrelated tasks', () => {
  const state = monthState([
    { uid: 't1', done: true, linkedMetricIds: ['m-task'] },
    { uid: 't2', done: false, linkedMetricIds: ['m-task'] },
    { uid: 't3', done: true, linkedMetricIds: ['m-task', 'm-other'] },
    { uid: 't4', done: true, linkedMetricIds: ['m-other'] },
  ]);
  assert.equal(metricDone(state, { id: 'm-task', type: 'TASK' }), 2);
});

test('monthTasks tolerates missing weeks and malformed days', () => {
  assert.deepEqual(monthTasks({}), []);
  assert.deepEqual(monthTasks({ weeks: [{ days: [{ tasks: [{ uid: 't1' }] }, null] }] }).map((t) => t.uid), ['t1']);
});
```

- [ ] **Step 6: Run the TASK tests and verify RED**

Run: `node --test tests/phase14-task-focus-metrics.test.mjs --test-name-pattern="TASK|monthTasks"`

Expected: FAIL because the existing `metricDone` treats TASK as MANUAL and `monthTasks` does not exist.

- [ ] **Step 7: Implement TASK aggregation**

Add `monthTasks(state)` to flatten `state.weeks[].days[].tasks[]` defensively. For `metric.type === 'TASK'`, filter tasks containing `metric.id` and count only `done === true`. Keep the existing habits-array branch unchanged for HABIT calls.

- [ ] **Step 8: Run TASK tests and verify GREEN**

Run: `node --test tests/phase14-task-focus-metrics.test.mjs --test-name-pattern="TASK|monthTasks"`

Expected: PASS.

- [ ] **Step 9: Write failing FOCUS aggregation tests**

```js
test('metricDone FOCUS sums only linked-task entries inside the selected month', () => {
  const state = monthState([
    { linkedMetricIds: ['m-focus'], focusLog: [
      { d: '2026-08-01', secs: 1500 },
      { d: '2026-08-31', secs: 900 },
      { d: '2026-07-31', secs: 3600 },
    ] },
    { linkedMetricIds: ['other'], focusLog: [{ d: '2026-08-10', secs: 7200 }] },
    { linkedMetricIds: ['m-focus'], focusLog: [{ d: 'bad', secs: 600 }, { d: '2026-08-11', secs: -5 }] },
  ]);
  assert.equal(metricDone(state, { id: 'm-focus', type: 'FOCUS' }, { year: 2026, month: 7 }), 40);
});
```

Also assert empty/malformed logs produce `0`, seconds are floored only after summing, and `metricProgress` returns raw `done` while clamping only `pct` at 100.

- [ ] **Step 10: Run the FOCUS tests and verify RED**

Run: `node --test tests/phase14-task-focus-metrics.test.mjs --test-name-pattern="FOCUS|raw done"`

Expected: FAIL because FOCUS aggregation and month-date filtering are absent.

- [ ] **Step 11: Implement FOCUS aggregation and raw-count progress**

Aggregate valid positive `focusLog[].secs` values from linked tasks when `entry.d` starts with the selected local `YYYY-MM-` prefix, then return `Math.floor(totalSecs / 60)`. In `metricProgress`, keep `done` raw and clamp only the percentage:

```js
const done = Math.max(0, metricDone(source, metric, context));
return { done, target, pct: target > 0 ? Math.min(100, Math.round(done / target * 100)) : 0 };
```

- [ ] **Step 12: Verify Task 1 and commit**

Run:

```powershell
node --test tests/phase13-metrics.test.mjs tests/phase14-task-focus-metrics.test.mjs
node --check js/pillars.js
```

Expected: both suites PASS and syntax check exits 0.

Commit:

```powershell
git add js/pillars.js tests/phase14-task-focus-metrics.test.mjs
git commit -m "feat(metrics): aggregate linked task and focus progress"
```

---

### Task 2: Metric editor and progress-row presentation

**Files:**
- Modify: `js/pillars.js`
- Modify: `js/i18n.js`
- Modify: `tests/phase14-task-focus-metrics.test.mjs`

**Interfaces:**
- Consumes: Task 1 `metricDone`, `metricProgress`, and recognized metric types.
- Produces: metric editor options for TASK/FOCUS and unit-aware row labels.

- [ ] **Step 1: Write failing editor and row tests**

Add textual/pure-render assertions that:

- `metricEditHTML` exposes type buttons for `TASK` and `FOCUS`;
- new TASK and FOCUS metrics default to `perMonth` targets;
- FOCUS hides/disables day-based target modes and submits `unit: 'minutes'`;
- HABIT keeps its linked-habit selector;
- TASK renders `2/12 tasks` and FOCUS renders `40/600 min`, not the generic day suffix;
- the progressbar accessible label uses the same unit;
- vi/en contain every new key exactly twice.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/phase14-task-focus-metrics.test.mjs --test-name-pattern="editor|row|i18n"`

Expected: FAIL because the editor type list and localized unit labels do not exist.

- [ ] **Step 3: Implement minimal editor behavior**

Change `METRIC_TYPES` to `['HABIT', 'TASK', 'FOCUS', 'MANUAL', 'CUSTOM']`. When a type button changes:

- show the habit row only for HABIT;
- set new TASK/FOCUS metrics to `perMonth`;
- for FOCUS, lock the mode to `perMonth`, show a minute-specific target label, and raise the numeric max above 31 (for example 100000);
- pass `unit: 'minutes'` only for FOCUS.

Extend `addMetric`/`updateMetric` so TASK/FOCUS survive CRUD and switching away from HABIT clears `linkedHabitId`.

- [ ] **Step 4: Add localized unit and helper copy**

Add vi/en keys for:

```text
metricTypeTASK, metricTypeFOCUS, metricTaskHint, metricFocusHint,
metricTaskUnit, metricFocusUnit, metricBarAriaUnit,
metricTargetMinutesLbl
```

Use `vi: công việc / phút` and `en: tasks / min` in compact rows. Keep existing day labels unchanged for HABIT/MANUAL/CUSTOM.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
node --test tests/phase13-metrics.test.mjs tests/phase14-task-focus-metrics.test.mjs
node --check js/pillars.js
node --check js/i18n.js
```

Expected: PASS.

Commit:

```powershell
git add js/pillars.js js/i18n.js tests/phase14-task-focus-metrics.test.mjs
git commit -m "feat(metrics): add task and focus metric controls"
```

---

### Task 3: Task Detail many-to-many metric linking and lifecycle rules

**Files:**
- Modify: `js/app.js`
- Modify: `js/quick-add.js`
- Modify: `js/inbox.js`
- Modify: `js/plan-carry.js`
- Modify: `js/i18n.js`
- Modify: `css/styles.css`
- Modify: `css/styles-deferred.css`
- Modify: `tests/phase14-task-focus-metrics.test.mjs`

**Interfaces:**
- Consumes: Task 1 `normalizeTaskMetricIds`, `setTaskMetricIds`, `metricById`.
- Produces: scheduled Task Detail checkbox group `data-role="td-linked-metrics"` and checkbox action `data-action="td-metric-link"`.
- Lifecycle contract: same-month moves preserve links; duplicate, recurrence, carry-over, Quick Add, Today/Week Add, and newly scheduled Inbox tasks start with `linkedMetricIds: []` unless explicitly set by a later phase.

- [ ] **Step 1: Write failing migration and lifecycle tests**

Add source-level and pure-helper assertions for:

```js
test('task metric links: same-month move preserves links and duplicate clears them', () => {
  assert.match(APP_JS, /moveTaskAcrossDays/);
  assert.match(APP_JS, /linkedMetricIds:\s*\[\]/);
  assert.match(APP_JS, /task-duplicate[\s\S]*linkedMetricIds:\s*\[\]/);
});

test('all task creation paths initialize linkedMetricIds without altering legacy loads', () => {
  assertCreationPathsUseEmptyMetricLinks(APP_JS, QUICK_ADD_JS, INBOX_JS, PLAN_CARRY_JS);
});
```

Also test that legacy tasks missing the field remain readable and get normalized during existing load sanitation without losing `uid`, `tags`, `focusLog`, or unknown fields.

- [ ] **Step 2: Run lifecycle tests and verify RED**

Run: `node --test tests/phase14-task-focus-metrics.test.mjs --test-name-pattern="lifecycle|creation|legacy"`

Expected: FAIL because creation paths and duplication do not yet state the link policy.

- [ ] **Step 3: Implement additive task migration and lifecycle behavior**

During the existing task sanitation loop in `loadState`, call `setTaskMetricIds(tk, tk.linkedMetricIds)`. Add `linkedMetricIds: []` to every new-task constructor in `app.js`, `quick-add.js`, and `inbox.js`. Ensure plan-carry/recurrence copies and `task-duplicate` explicitly clear the field. Do not remove unknown task fields.

- [ ] **Step 4: Verify lifecycle GREEN**

Run: `node --test tests/phase14-task-focus-metrics.test.mjs --test-name-pattern="lifecycle|creation|legacy"`

Expected: PASS.

- [ ] **Step 5: Write failing Task Detail rendering and persistence tests**

Assert that scheduled Task Detail:

- groups visible TASK/FOCUS/HABIT/MANUAL/CUSTOM metrics under visible pillars;
- emits checked states from `tk.linkedMetricIds`;
- supports multiple checked metrics;
- shows a localized empty state when the month has no metrics;
- shows schedule-first guidance for Inbox without metric checkboxes;
- uses a `fieldset`/`legend` or equivalently named group;
- saves changes through `saveTaskDetailState()` and refreshes the active metric view immediately.

- [ ] **Step 6: Run Task Detail tests and verify RED**

Run: `node --test tests/phase14-task-focus-metrics.test.mjs --test-name-pattern="Task Detail|linked metrics|Inbox"`

Expected: FAIL because Task Detail has no monthly metric link editor.

- [ ] **Step 7: Implement Task Detail link UI**

Add a small render helper in `js/app.js` that reads `taskDetailState().pillars`, filters hidden pillars and missing metrics, and returns an accessible checkbox group. Each checkbox uses:

```html
<input type="checkbox"
  data-action="td-metric-link"
  data-metric-id="..."
  aria-label="Pillar name · Metric title">
```

In `bindTaskDetailEvents`, on change collect all checked metric IDs, call `setTaskMetricIds(g.tk, ids)`, persist through `saveTaskDetailState()`, and re-render the relevant Overview/Today/Week surface without closing the drawer.

- [ ] **Step 8: Add i18n and responsive/dark-mode styling**

Add vi/en keys for `taskLinkedMetrics`, `taskLinkedMetricsEmpty`, `taskLinkedMetricsInbox`, and `taskLinkedMetricAria`. Add compact checkbox-list styles using semantic token variables only. At `max-width: 600px`, keep each option at least 44px high and stack pillar groups. Avoid fixed colors and horizontal overflow.

- [ ] **Step 9: Verify Task 3 and commit**

Run:

```powershell
node --test tests/phase14-task-focus-metrics.test.mjs
node --test tests/phase13-metrics.test.mjs
node --check js/app.js
node --check js/quick-add.js
node --check js/inbox.js
node --check js/plan-carry.js
```

Expected: PASS.

Commit:

```powershell
git add js/app.js js/quick-add.js js/inbox.js js/plan-carry.js js/i18n.js css/styles.css css/styles-deferred.css tests/phase14-task-focus-metrics.test.mjs
git commit -m "feat(tasks): link tasks to monthly metrics"
```

---

### Task 4: Minified assets, PWA wiring, E2E flow, and full regression

**Files:**
- Modify: `js/app.min.js`
- Modify: `js/pillars.min.js`
- Modify: `js/i18n.min.js`
- Modify: `js/quick-add.min.js`
- Modify: `js/inbox.min.js`
- Modify: `js/plan-carry.min.js`
- Modify: `css/styles.min.css`
- Modify: `css/styles-deferred.min.css`
- Modify: `sw.js`
- Modify: `scripts/e2e-frontend.py`
- Modify: `tests/phase14-task-focus-metrics.test.mjs`
- Modify: `docs/development-history.md`

**Interfaces:**
- Consumes: all Task 1–3 behavior.
- Produces: deployable minified assets, updated service-worker cache version, and browser regression coverage named `task_focus_metrics_checks`.

- [ ] **Step 1: Write failing bundle/PWA/E2E wiring tests**

Add assertions that:

- `app.html` loads the updated minified modules before `app.min.js`;
- `sw.js` precaches the required minified files and bumps the cache version above the P3 value;
- `scripts/e2e-frontend.py` defines and registers `task_focus_metrics_checks` in `--all` and a focused CLI view;
- E2E uses stable `data-testid`/`data-role` selectors for the metric and Task Detail controls.

- [ ] **Step 2: Run wiring tests and verify RED**

Run: `node --test tests/phase14-task-focus-metrics.test.mjs --test-name-pattern="bundle|service worker|E2E"`

Expected: FAIL because the P4 E2E scenario and cache bump do not exist.

- [ ] **Step 3: Regenerate minified assets and update PWA cache**

Run:

```powershell
python scripts/minify.py
```

Increment the `sw.js` cache version once. Do not hand-edit generated `.min.js` or `.min.css` content.

- [ ] **Step 4: Implement the focused browser scenario**

In `scripts/e2e-frontend.py`, add a self-contained scenario that seeds or creates:

1. one TASK metric with target 2;
2. one FOCUS metric with target 30 minutes;
3. two scheduled tasks linked to the TASK metric and one of them also linked to FOCUS;
4. a completion toggle that changes TASK progress from `0/2` to `1/2` immediately;
5. a focus-log entry on the linked task that changes FOCUS progress, while an unlinked task's log does not;
6. reload persistence;
7. Task Detail usability at desktop and 390px, in light and dark themes;
8. zero page errors and zero horizontal overflow.

Use direct fixture injection only for focus duration to avoid waiting for a real timer; use the real UI for metric creation, task linking, and completion.

- [ ] **Step 5: Run focused verification and fix only P4-rooted failures**

Run:

```powershell
node --test tests/phase14-task-focus-metrics.test.mjs
python scripts/minify.py --check
python scripts/e2e-frontend.py --view task-focus-metrics
```

Expected: all commands exit 0 with no page errors.

- [ ] **Step 6: Run complete regression**

Run:

```powershell
node --test tests/*.test.mjs
node test-sync.js
python scripts/minify.py --check
python scripts/e2e-smoke.py --browser chromium
python scripts/e2e-frontend.py --all
python scripts/e2e-mobile-qa.py --browser chromium
python scripts/e2e-a11y.py --browser chromium
python scripts/verify-critical-css.py
git diff --check
git status --short
```

Expected:

- all Node tests pass with 0 failures;
- sync tests pass;
- minified assets are current;
- smoke and full E2E report success with zero page errors;
- mobile QA and accessibility checks report zero new P4 failures;
- critical CSS verifier reports no source/minified mismatch;
- diff check is clean and status contains only intended P4 files.

- [ ] **Step 7: Review requirements and document the phase**

Re-read the P4 design and confirm every acceptance criterion against tests or browser evidence. Add a concise P4 section to `docs/development-history.md` describing the schema, TASK/FOCUS calculation, migration, UI, and verification counts. Do not claim later phases.

- [ ] **Step 8: Final commit**

```powershell
git add js/*.min.js css/*.min.css sw.js scripts/e2e-frontend.py tests/phase14-task-focus-metrics.test.mjs docs/development-history.md
git commit -m "test(metrics): verify task and focus metric integration"
```

Review `git status --short --branch` and `git log --oneline -5`. Do not push unless the user asks.
