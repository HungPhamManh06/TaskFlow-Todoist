// TaskFlow — P5 Daily Alignment: pure collector and Today integration coverage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Alignment from '../js/alignment.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TODAY_JS = readFileSync(path.join(ROOT, 'js/today.js'), 'utf8');
const I18N_JS = readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');
const STYLES = readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
const STYLES_DEFERRED = readFileSync(path.join(ROOT, 'css/styles-deferred.css'), 'utf8');
const APP = readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const E2E = readFileSync(path.join(ROOT, 'scripts/e2e-frontend.py'), 'utf8');
const alignmentMinPath = path.join(ROOT, 'js/alignment.min.js');
const ALIGNMENT_MIN = existsSync(alignmentMinPath) ? readFileSync(alignmentMinPath, 'utf8') : '';
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

function rendererOptions() {
  return {
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

test('renderer emits semantic groups and reuses real task/habit actions', () => {
  const groups = Alignment.collectDailyAlignment(monthState(), context);
  const html = Alignment.alignmentCardHTML(groups, rendererOptions());
  assert.match(html, /data-testid="daily-alignment"/);
  assert.match(html, /data-testid="alignment-pillar"/);
  assert.match(html, /data-testid="alignment-item"/);
  assert.match(html, /data-action="task" data-week="1" data-day="0" data-task="0"/);
  assert.match(html, /data-action="habit" data-id="h1" data-day="9"/);
  assert.match(html, /aria-labelledby="dailyAlignmentTitle"/);
  assert.match(html, /0\/2/);
});

test('renderer provides compact empty and unavailable states', () => {
  const options = rendererOptions();
  assert.match(Alignment.alignmentCardHTML([], options), /Link a task or habit/);
  assert.match(Alignment.alignmentCardHTML([], options), /data-action="nav" data-view="overview"/);
  assert.match(Alignment.alignmentCardHTML([], { ...options, inTodayMonth: false }), /Open the current month/);
});

test('Today composes Daily Alignment with real calendar coordinates', () => {
  assert.match(TODAY_JS, /TaskFlowAlignment\.collectDailyAlignment\(state,/);
  assert.match(TODAY_JS, /TaskFlowAlignment\.alignmentCardHTML\(/);
  assert.match(TODAY_JS, /dayIndex: habitIdx/);
  assert.ok(TODAY_JS.indexOf('${alignmentHTML}') < TODAY_JS.indexOf('<div class="today-grid">'));
});

test('Daily Alignment copy and responsive styles exist in both source stylesheets', () => {
  ['todayAlignmentTitle', 'todayAlignmentCount', 'todayAlignmentEmpty', 'todayAlignmentUnavailable'].forEach((key) => {
    assert.equal((I18N_JS.match(new RegExp(`${key}:`, 'g')) || []).length, 2, `${key} must exist in vi and en`);
  });
  ['today-alignment-card', 'today-alignment-groups', 'today-alignment-pillar', 'today-alignment-item'].forEach((name) => {
    assert.match(STYLES, new RegExp(`\\.${name}`));
    assert.match(STYLES_DEFERRED, new RegExp(`\\.${name}`));
  });
  assert.match(STYLES_DEFERRED, /\.today-alignment-item[\s\S]{0,180}min-height:\s*44px/);
  assert.match(STYLES_DEFERRED, /@media \(max-width:\s*719px\)[\s\S]*\.today-alignment-groups/);
});

test('P5 production assets load alignment before Today and cache it offline', () => {    assert.ok(APP.indexOf('js/alignment.min.js?v=2') < APP.indexOf('js/today.min.js?v=10'));
  assert.match(APP_JS, /TaskFlowAlignment missing/);
  assert.match(SW, /taskflow-v235/);
  assert.match(SW, /\.\/js\/alignment\.min\.js/);
  assert.match(ALIGNMENT_MIN, /collectDailyAlignment/);
});

test('P5 E2E scenario is focused and part of the release matrix', () => {
  assert.match(E2E, /def daily_alignment_checks\(/);
  assert.match(E2E, /\("daily-alignment", daily_alignment_checks\)/);
  assert.match(E2E, /args\.view == "daily-alignment"/);
});
