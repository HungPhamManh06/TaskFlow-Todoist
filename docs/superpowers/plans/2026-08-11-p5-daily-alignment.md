# P5 Daily Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a compact Today card that derives real tasks and habits linked to monthly metrics, grouped by pillar, and toggles the original entities without duplicating data.

**Architecture:** Add a focused `TaskFlowAlignment` module with a pure collector and a dependency-injected HTML renderer. `TaskFlowToday` supplies today's month coordinates and composes the returned card above its existing grid. The feature is derived entirely from current month state, so persistence, sync, export, and migration schemas remain unchanged.

**Tech Stack:** Vanilla JavaScript IIFEs, HTML5, CSS custom properties, Node.js `node:test`, Python Playwright E2E, existing `scripts/minify.py` pipeline.

## Global Constraints

- Do not redesign TaskFlow or break Today, Inbox, Upcoming, Week, Month, Year, Habits, Focus, Reports, Task Detail, recurring tasks, localStorage, cloud sync, authentication, import/export, PWA, dark mode, or mobile UI.
- Do not create a second task, habit, metric, or alignment store; Daily Alignment is derived at render time.
- Include only linked real tasks and habits; omit MANUAL and CUSTOM metrics.
- Deduplicate an entity inside one pillar, but show it once under every related pillar.
- Hidden pillars do not appear.
- When Today is outside the viewed month, do not map today's date into that month.
- All new visible copy must use Vietnamese and English i18n keys.
- Mobile widths 360x800, 390x844, and 412x915 must stack without horizontal scrolling and retain at least 44px checkbox hit areas.
- Every production behavior follows RED → verify failure → GREEN → verify pass.
- Source files remain readable; regenerate `.min.js` and `.min.css` siblings before browser verification.

---

### Task 1: Pure Daily Alignment collector

**Files:**
- Create: `js/alignment.js`
- Create: `tests/phase15-daily-alignment.test.mjs`

**Interfaces:**
- Produces: `collectDailyAlignment(state, context): AlignmentGroup[]`
- Consumes: `state.pillars[].metrics`, `state.habits`, and today's `state.weeks[week - 1].days[day].tasks`.
- `context` shape: `{ inTodayMonth: boolean, week: number, day: number, dayIndex: number }`.
- `AlignmentGroup` shape: `{ pillar: { id, name, icon }, items: AlignmentItem[] }`.
- Task item shape: `{ kind: 'task', key, task, week, day, taskIndex }`.
- Habit item shape: `{ kind: 'habit', key, habit, dayIndex }`.

- [ ] **Step 1: Write failing collection tests**

Create `tests/phase15-daily-alignment.test.mjs` with fixtures and expectations equivalent to:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import Alignment from '../js/alignment.js';

const context = { inTodayMonth: true, week: 1, day: 0, dayIndex: 9 };

function monthState() {
  const shared = { text: 'Shared task', done: false, linkedMetricIds: ['mt', 'mf', 'mt2'] };
  return {
    pillars: [
      {
        id: 'p1', name: 'Body', icon: 'B', hidden: false,
        metrics: [
          { id: 'mt', type: 'TASK' },
          { id: 'mf', type: 'FOCUS' },
          { id: 'mh', type: 'HABIT', linkedHabitId: 'h1' },
          { id: 'manual', type: 'MANUAL' },
        ],
      },
      { id: 'p2', name: 'Work', icon: 'W', hidden: false, metrics: [{ id: 'mt2', type: 'TASK' }] },
      { id: 'p3', name: 'Hidden', icon: 'H', hidden: true, metrics: [{ id: 'mt', type: 'TASK' }] },
    ],
    habits: [
      { id: 'h1', name: 'Workout', days: [], skipDays: [] },
      { id: 'h2', name: 'Unlinked', days: [], skipDays: [] },
    ],
    weeks: [{ days: [{ tasks: [shared, { text: 'Unlinked task', linkedMetricIds: [] }] }] }],
  };
}

test('collector includes only linked TASK/FOCUS tasks and linked active habits', () => {
  const groups = Alignment.collectDailyAlignment(monthState(), context);
  assert.deepEqual(groups.map((group) => group.pillar.id), ['p1', 'p2']);
  assert.deepEqual(groups[0].items.map((item) => `${item.kind}:${item.key}`), ['task:1:0:0', 'habit:h1']);
  assert.deepEqual(groups[1].items.map((item) => `${item.kind}:${item.key}`), ['task:1:0:0']);
});

test('collector deduplicates within a pillar but repeats a shared task across pillars', () => {
  const groups = Alignment.collectDailyAlignment(monthState(), context);
  assert.equal(groups[0].items.filter((item) => item.kind === 'task').length, 1);
  assert.equal(groups[1].items.filter((item) => item.kind === 'task').length, 1);
  assert.equal(groups[0].items[0].task, groups[1].items[0].task);
});

test('collector omits skipped habits, hidden pillars, stale links and unavailable months', () => {
  const state = monthState();
  state.habits[0].skipDays = [9];
  state.pillars[0].metrics.push({ id: 'stale', type: 'HABIT', linkedHabitId: 'missing' });
  assert.deepEqual(
    Alignment.collectDailyAlignment(state, context)[0].items.map((item) => item.kind),
    ['task'],
  );
  assert.deepEqual(Alignment.collectDailyAlignment(state, { ...context, inTodayMonth: false }), []);
});

test('collector tolerates malformed legacy state', () => {
  assert.deepEqual(Alignment.collectDailyAlignment({}, context), []);
  assert.deepEqual(Alignment.collectDailyAlignment({ pillars: [null, { hidden: false }] }, context), []);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/phase15-daily-alignment.test.mjs`

Expected: FAIL because `js/alignment.js` does not exist.

- [ ] **Step 3: Implement the minimal pure collector**

Create `js/alignment.js` as a CommonJS/browser-compatible IIFE. Implement defensive array access, preserve visible pillar order, preserve today's task order followed by habit order, and use per-pillar sets for deduplication. The central implementation should follow:

```js
function collectDailyAlignment(state, context) {
  if (!context || context.inTodayMonth !== true) return [];
  const pillars = Array.isArray(state && state.pillars) ? state.pillars : [];
  const habits = Array.isArray(state && state.habits) ? state.habits : [];
  const week = Number.isInteger(context.week) ? context.week : 0;
  const day = Number.isInteger(context.day) ? context.day : -1;
  const dayIndex = Number.isInteger(context.dayIndex) ? context.dayIndex : -1;
  const weekState = state && Array.isArray(state.weeks) ? state.weeks[week - 1] : null;
  const dayState = weekState && Array.isArray(weekState.days) ? weekState.days[day] : null;
  const tasks = dayState && Array.isArray(dayState.tasks) ? dayState.tasks : [];

  return pillars.filter((pillar) => pillar && pillar.hidden !== true).map((pillar) => {
    const metrics = Array.isArray(pillar.metrics) ? pillar.metrics : [];
    const taskMetricIds = new Set(metrics
      .filter((metric) => metric && (metric.type === 'TASK' || metric.type === 'FOCUS') && typeof metric.id === 'string')
      .map((metric) => metric.id));
    const habitIds = new Set(metrics
      .filter((metric) => metric && metric.type === 'HABIT' && typeof metric.linkedHabitId === 'string')
      .map((metric) => metric.linkedHabitId));
    const items = [];

    tasks.forEach((task, taskIndex) => {
      const ids = task && Array.isArray(task.linkedMetricIds) ? task.linkedMetricIds : [];
      if (ids.some((id) => taskMetricIds.has(id))) {
        items.push({ kind: 'task', key: `${week}:${day}:${taskIndex}`, task, week, day, taskIndex });
      }
    });
    habits.forEach((habit) => {
      const skipped = habit && Array.isArray(habit.skipDays) && habit.skipDays.includes(dayIndex);
      if (habit && typeof habit.id === 'string' && habitIds.has(habit.id) && !skipped) {
        items.push({ kind: 'habit', key: habit.id, habit, dayIndex });
      }
    });
    return { pillar: { id: pillar.id, name: pillar.name, icon: pillar.icon }, items };
  }).filter((group) => group.items.length > 0);
}
```

Export `{ collectDailyAlignment }`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/phase15-daily-alignment.test.mjs`

Expected: all collector tests PASS.

- [ ] **Step 5: Run legacy pillar and P4 tests**

Run: `node --test tests/phase12-pillars.test.mjs tests/phase13-metrics.test.mjs tests/phase14-task-focus-metrics.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit the collector**

```bash
git add js/alignment.js tests/phase15-daily-alignment.test.mjs
git commit -m "feat(alignment): derive linked actions for today"
```

---

### Task 2: Accessible Today card, i18n, and responsive styling

**Files:**
- Modify: `js/alignment.js`
- Modify: `js/today.js`
- Modify: `js/i18n.js`
- Modify: `css/styles.css`
- Modify: `css/styles-deferred.css`
- Test: `tests/phase15-daily-alignment.test.mjs`

**Interfaces:**
- Consumes: `collectDailyAlignment(state, context)` from Task 1.
- Produces: `alignmentCardHTML(groups, options): string`.
- `options` shape: `{ inTodayMonth, dayLabel, t, esc, checkboxHTML, checkboxLabel }`.
- `js/today.js` calls both functions with `state`, `ti.week`, `ti.dayInWeek`, and the real month-day index.

- [ ] **Step 1: Write failing renderer and wiring tests**

Append focused tests equivalent to:

```js
test('renderer emits semantic groups and reuses real task/habit actions', () => {
  const groups = Alignment.collectDailyAlignment(monthState(), context);
  const html = Alignment.alignmentCardHTML(groups, {
    inTodayMonth: true,
    dayLabel: 'Monday',
    t: (key, vars = {}) => ({
      todayAlignmentTitle: 'Toward monthly goals',
      todayAlignmentCount: `${vars.done}/${vars.total}`,
      todayAlignmentEmpty: 'Link a task or habit',
      todayAlignmentUnavailable: 'Open the current month',
    }[key] || key),
    esc: (value) => String(value),
    checkboxHTML: (tone, checked, attrs, label) => `<button role="checkbox" aria-checked="${checked}" ${attrs} aria-label="${label}"></button>`,
    checkboxLabel: (kind, text, label) => `${kind}: ${text}, ${label}`,
  });
  assert.match(html, /data-testid="daily-alignment"/);
  assert.match(html, /data-testid="alignment-pillar"/);
  assert.match(html, /data-testid="alignment-item"/);
  assert.match(html, /data-action="task" data-week="1" data-day="0" data-task="0"/);
  assert.match(html, /data-action="habit" data-id="h1" data-day="9"/);
  assert.match(html, /aria-labelledby="dailyAlignmentTitle"/);
});

test('renderer provides compact empty and unavailable states', () => {
  const options = rendererOptions();
  assert.match(Alignment.alignmentCardHTML([], options), /todayAlignmentEmpty|Link a task or habit/);
  assert.match(Alignment.alignmentCardHTML([], { ...options, inTodayMonth: false }), /todayAlignmentUnavailable|Open the current month/);
});

test('Today composes Daily Alignment with real calendar coordinates', () => {
  assert.match(TODAY_JS, /TaskFlowAlignment\.collectDailyAlignment\(state,/);
  assert.match(TODAY_JS, /TaskFlowAlignment\.alignmentCardHTML\(/);
});
```

Add file reads for `js/today.js`, both CSS sources, and `js/i18n.js` at the top of the test.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/phase15-daily-alignment.test.mjs`

Expected: FAIL because `alignmentCardHTML`, Today source integration, styles, and i18n keys are absent.

- [ ] **Step 3: Add the dependency-injected renderer**

In `js/alignment.js`, add `alignmentCardHTML(groups, options)` and export it. It must:

- emit `<section class="today-card today-alignment-card" data-testid="daily-alignment" aria-labelledby="dailyAlignmentTitle">`;
- use an `h2` with id `dailyAlignmentTitle`;
- emit each group with `data-testid="alignment-pillar"` and `aria-label` containing the pillar name;
- emit each row with `data-testid="alignment-item"`, `data-alignment-kind`, and `data-alignment-key`;
- compute each group's completed count from `item.task.done` or `item.habit.days[item.dayIndex]`;
- reuse `options.checkboxHTML` with exact existing `data-action="task"` and `data-action="habit"` coordinates;
- escape names and icons through `options.esc`;
- use only `options.t` for visible copy;
- render `todayAlignmentEmpty` when `groups` is empty and `todayAlignmentUnavailable` when `inTodayMonth` is false.

Use an implementation structure equivalent to:

```js
function alignmentCardHTML(groups, options) {
  const list = Array.isArray(groups) ? groups : [];
  const opts = options || {};
  const tr = opts.t;
  const escape = opts.esc;
  const check = opts.checkboxHTML;
  const label = opts.checkboxLabel;
  const body = opts.inTodayMonth === false
    ? `<p class="today-alignment-empty">${tr('todayAlignmentUnavailable')}</p>`
    : list.length
      ? list.map((group) => alignmentGroupHTML(group, opts)).join('')
      : `<p class="today-alignment-empty">${tr('todayAlignmentEmpty')}</p>`;
  return `<section class="today-card today-alignment-card" data-testid="daily-alignment" aria-labelledby="dailyAlignmentTitle">
    <div class="today-card-head"><h2 class="today-card-title" id="dailyAlignmentTitle">${tr('todayAlignmentTitle')}</h2></div>
    <div class="today-alignment-groups">${body}</div>
  </section>`;
}
```

- [ ] **Step 4: Compose the module in Today source**

In `js/today.js`, after calculating `habitIdx`, derive and render the card:

```js
const alignmentGroups = window.TaskFlowAlignment.collectDailyAlignment(state, {
  inTodayMonth,
  week: ti.week,
  day: ti.dayInWeek,
  dayIndex: habitIdx,
});
const alignmentHTML = window.TaskFlowAlignment.alignmentCardHTML(alignmentGroups, {
  inTodayMonth,
  dayLabel: todayWeekdayLabel(),
  t,
  esc,
  checkboxHTML,
  checkboxLabel: window.TaskFlowUI.checkboxLabel,
});
```

Insert `${alignmentHTML}` after the Today header and before `.today-grid`. Keep existing task and habit dispatch branches unchanged; their existing `renderToday()` calls provide immediate synchronization.

- [ ] **Step 5: Add exact Vietnamese and English copy**

Add these keys to both i18n dictionaries in `js/i18n.js`:

```js
// vi
todayAlignmentTitle: 'Để tiến gần mục tiêu tháng',
todayAlignmentCount: '{done}/{total} hoàn thành',
todayAlignmentEmpty: 'Chưa có việc hoặc thói quen được liên kết cho hôm nay. Hãy liên kết trong Chi tiết task hoặc Metric tháng.',
todayAlignmentUnavailable: 'Daily Alignment chỉ hiển thị cho tháng hiện tại.',

// en
todayAlignmentTitle: 'Toward your monthly goals',
todayAlignmentCount: '{done}/{total} completed',
todayAlignmentEmpty: 'No linked task or habit for today. Link one in Task Detail or a monthly metric.',
todayAlignmentUnavailable: 'Daily Alignment is available for the current month.',
```

- [ ] **Step 6: Add responsive semantic styles**

Add mirrored source rules to `css/styles.css` and `css/styles-deferred.css`:

- `.today-alignment-card` uses existing Today card surface tokens and a smaller vertical padding than the main tasks card;
- `.today-alignment-groups` uses `grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr))`;
- `.today-alignment-pillar` has no extra heavy border and uses subtle background/token separation;
- `.today-alignment-item` is a minimum 44px flex row;
- `.today-alignment-item.done .today-alignment-text` uses the existing muted/line-through convention;
- `.today-alignment-empty` uses muted text and compact spacing;
- at `max-width: 719px`, groups use one column and the card keeps `min-width: 0` with no horizontal overflow;
- dark mode relies only on existing semantic tokens, without hard-coded light colors.

- [ ] **Step 7: Run focused and Today regression tests**

Run: `node --test tests/phase15-daily-alignment.test.mjs tests/phase9-frontend.test.mjs`

Expected: all tests PASS.

- [ ] **Step 8: Commit UI integration**

```bash
git add js/alignment.js js/today.js js/i18n.js css/styles.css css/styles-deferred.css tests/phase15-daily-alignment.test.mjs
git commit -m "feat(today): show daily alignment by pillar"
```

---

### Task 3: Browser scenario, production assets, and offline cache

**Files:**
- Modify: `scripts/e2e-frontend.py`
- Modify: `tests/phase15-daily-alignment.test.mjs`
- Modify: `js/app.js`
- Modify: `app.html`
- Modify: `sw.js`
- Create: `js/alignment.min.js` through `scripts/minify.py`
- Modify: `js/today.min.js`, `js/app.min.js`, `js/i18n.min.js`, `css/styles.min.css`, and `css/styles-deferred.min.css` through `scripts/minify.py`

**Interfaces:**
- Adds Playwright scenario: `daily_alignment_checks(browser, base, width, height, errors, screenshot)`.
- Adds CLI view: `--view daily-alignment`.
- Adds full-matrix entry: `("daily-alignment", daily_alignment_checks)`.
- Raises the full Chromium matrix from 15 to 16 scenarios across five viewports.

- [ ] **Step 1: Write failing production-asset and E2E wiring assertions**

Append tests equivalent to:

```js
test('P5 production assets load alignment before Today and cache it offline', () => {
  assert.ok(APP.indexOf('js/alignment.min.js?v=1') < APP.indexOf('js/today.min.js?v=3'));
  assert.match(APP_JS, /TaskFlowAlignment missing/);
  assert.match(SW, /taskflow-v188/);
  assert.match(SW, /\.\/js\/alignment\.min\.js/);
  assert.match(ALIGNMENT_MIN, /collectDailyAlignment/);
});

test('P5 E2E scenario is focused and part of the release matrix', () => {
  assert.match(E2E, /def daily_alignment_checks\(/);
  assert.match(E2E, /\("daily-alignment", daily_alignment_checks\)/);
  assert.match(E2E, /args\.view == "daily-alignment"/);
});
```

Read `app.html`, `js/app.js`, `js/alignment.min.js`, `sw.js`, and `scripts/e2e-frontend.py` as required test assets.

- [ ] **Step 2: Run the production-asset tests and verify RED**

Run: `node --test --test-name-pattern="production assets|E2E scenario" tests/phase15-daily-alignment.test.mjs`

Expected: FAIL because minified alignment, cache v188, and the browser scenario do not exist.

- [ ] **Step 3: Add the focused Playwright scenario**

Implement `daily_alignment_checks` using stable test IDs. The scenario must:

1. load the current month state;
2. make two pillars visible and seed deterministic TASK, FOCUS, and HABIT metrics;
3. set today's first scheduled task to `P5 shared task` and link it to metrics in both pillars;
4. set another today's task to `P5 unlinked task` with no links;
5. link a real active habit named `P5 linked habit` through the HABIT metric;
6. open Today and assert two `[data-testid="alignment-pillar"]` groups;
7. assert the shared task appears twice and the unlinked task does not appear in `[data-testid="daily-alignment"]`;
8. click one aligned task checkbox and assert both aligned task checkboxes plus the original Today task checkbox become checked;
9. click the aligned habit checkbox and assert its original Today habit checkbox becomes checked;
10. reload and assert both completion states persist;
11. on mobile, assert every alignment row is at least 44px high and there is no horizontal overflow;
12. enable dark mode, reload, assert `html[data-dark="true"]`, take the screenshot, and close the page.

Use `data-testid`, `data-alignment-kind`, `data-alignment-key`, and existing action attributes. Do not locate controls by generated class names.

- [ ] **Step 4: Register the scenario**

Add `daily-alignment` to the `--view` choices, add it to the full matrix, and run desktop 1440x900 plus mobile 390x844 in focused mode. Update the module docstring to `16 scenarios x 5 viewports`.

- [ ] **Step 5: Update browser cache versions and generate assets**

In `js/app.js`, add a startup guard immediately before the existing `TaskFlowToday` guard:

```js
if (!window.TaskFlowAlignment) throw new Error('TaskFlowAlignment missing — js/alignment.js failed to load');
```

In `app.html`:

- add `js/alignment.min.js?v=1` before Today;
- bump `js/today.min.js` from `v=2` to `v=3`;
- bump `js/i18n.min.js` from `v=3` to `v=4`;
- bump `css/styles-deferred.min.css` from `v=5` to `v=6` in both link and noscript tags.

In `sw.js`, bump `taskflow-v187` to `taskflow-v188` and add `./js/alignment.min.js` immediately before `./js/today.min.js`.

Run: `python scripts/minify.py`

Expected: `js/alignment.min.js` is created and all changed source/minified siblings are refreshed.

- [ ] **Step 6: Run focused tests and browser flow**

Run:

```bash
node --test tests/phase15-daily-alignment.test.mjs
python scripts/minify.py --check
python scripts/e2e-frontend.py --view daily-alignment
```

Expected: all unit/integration tests PASS, all minified files are current, and output ends with `E2E DAILY-ALIGNMENT OK`.

- [ ] **Step 7: Commit production verification assets**

```bash
git add app.html sw.js js/app.js scripts/e2e-frontend.py tests/phase15-daily-alignment.test.mjs js/*.min.js css/*.min.css
git commit -m "test(alignment): cover daily alignment browser flow"
```

Before committing, inspect `git diff --cached --stat` and unstage any generated file that did not change from a P5 source modification.

---

### Task 4: Full regression and development history

**Files:**
- Modify: `docs/development-history.md`
- Modify only when regenerated by the verification scripts: `docs/mobile-qa.md`, `docs/a11y-audit.md`

**Interfaces:**
- No new runtime interface.
- Records P5 behavior and only verified test totals.

- [ ] **Step 1: Run the full automated regression**

Run each command from the P5 worktree and stop on the first failure:

```bash
node --test tests/*.test.mjs
node test-sync.js
python scripts/minify.py --check
python scripts/e2e-smoke.py --browser chromium
python scripts/e2e-frontend.py --all
python scripts/e2e-mobile-qa.py --browser chromium
python scripts/e2e-a11y.py --browser chromium
python scripts/verify-critical-css.py
git diff --check
```

Expected:

- every Node test passes with zero failures;
- all seven sync tests pass;
- all minified files are current;
- smoke and the 16-scenario Chromium matrix pass;
- mobile QA reports 262 checks with zero failures;
- accessibility reports 62 passes and zero failures;
- critical CSS reports zero diffs;
- `git diff --check` reports no whitespace errors.

- [ ] **Step 2: Review migration and compatibility evidence**

Confirm from tests and diff that:

- no new field is written to month state, inbox, reflection, or year state;
- no sync/backend/import/export payload changed;
- malformed or old month states yield an empty card without throwing;
- hidden pillars, skipped habits, deleted habits, stale metric ids, and missing task links are ignored;
- existing task and habit dispatch paths remain the only completion writers.

Run: `git diff -- js/alignment.js js/today.js js/app.js js/i18n.js app.html sw.js`

Expected: no persistence writer or backend schema change appears.

- [ ] **Step 3: Update development history with measured results**

Append a `Personal Growth & Reflection — P5: Daily Alignment` section to `docs/development-history.md` describing:

- the derived per-pillar Today card;
- TASK, FOCUS, and HABIT eligibility;
- within-pillar deduplication and cross-pillar repeated references;
- immediate synchronization through existing actions;
- the actual unit, sync, E2E, mobile, accessibility, minify, and CSS verifier totals from Step 1.

Do not record Firefox, WebKit, Lighthouse, deployment, push, or PR results unless those commands were actually run successfully.

- [ ] **Step 4: Inspect final scope**

Run:

```bash
git status --short
git diff --stat
git diff --check
```

Expected: only P5 source, generated P5 assets, P5 tests, service-worker/app versioning, and verified documentation are modified.

- [ ] **Step 5: Commit the verified history**

```bash
git add docs/development-history.md docs/mobile-qa.md docs/a11y-audit.md
git commit -m "docs: record daily alignment verification"
```

Stage `docs/mobile-qa.md` and `docs/a11y-audit.md` only if the verification scripts regenerated them. After commit, `git status --short` must be empty.
