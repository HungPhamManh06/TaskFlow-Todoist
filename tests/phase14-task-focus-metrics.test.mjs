// TaskFlow — P4 Task/Focus Metrics: pure helpers, migration and UI wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Pillars from '../js/pillars.js';
import PlanMath from '../js/plan-math.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const I18N_JS = readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const QUICK_ADD_JS = readFileSync(path.join(ROOT, 'js/quick-add.js'), 'utf8');
const INBOX_JS = readFileSync(path.join(ROOT, 'js/inbox.js'), 'utf8');
const PLAN_CARRY_JS = readFileSync(path.join(ROOT, 'js/plan-carry.js'), 'utf8');
const CSS = readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
const DEFERRED_CSS = readFileSync(path.join(ROOT, 'css/styles-deferred.css'), 'utf8');
const APP_HTML = readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const APP_MIN = readFileSync(path.join(ROOT, 'js/app.min.js'), 'utf8');
const PILLARS_MIN = readFileSync(path.join(ROOT, 'js/pillars.min.js'), 'utf8');
const I18N_MIN = readFileSync(path.join(ROOT, 'js/i18n.min.js'), 'utf8');
const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const E2E = readFileSync(path.join(ROOT, 'scripts/e2e-frontend.py'), 'utf8');

const {
  normalizeMetric,
  normalizeTaskMetricIds,
  setTaskMetricIds,
  monthTasks,
  metricDone,
  metricProgress,
  addMetric,
  updateMetric,
  metricEditHTML,
  metricRowHTML,
} = Pillars;

const translations = {
  metricTypeHABIT: 'Habit', metricTypeTASK: 'Task', metricTypeFOCUS: 'Focus',
  metricTypeMANUAL: 'Manual', metricTypeCUSTOM: 'Custom', metricDayUnit: ' days',
  metricTaskUnit: ' tasks', metricFocusUnit: ' min', metricUntitled: 'Untitled',
  metricEdit: 'Edit', metricDel: 'Delete', metricHabitGone: 'Gone',
  metricBarAria: '{title} — {done}/{target} days',
  metricBarAriaUnit: '{title} — {done}/{target} {unit}',
};
globalThis.t = (key, vars = {}) => String(translations[key] || key).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
globalThis.esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
globalThis.NUM_DAYS = 31;
globalThis.PLAN_YEAR = 2026;
globalThis.PLAN_MONTH = 7;

function monthState(tasks) {
  const midpoint = Math.ceil(tasks.length / 2);
  return {
    habits: [],
    weeks: [
      { days: [{ tasks: tasks.slice(0, midpoint) }, { tasks: [] }] },
      { days: [{ tasks: tasks.slice(midpoint) }] },
    ],
  };
}

test('normalizeTaskMetricIds: legacy/malformed values become unique string ids', () => {
  assert.deepEqual(normalizeTaskMetricIds({}), []);
  assert.deepEqual(
    normalizeTaskMetricIds({ linkedMetricIds: ['m1', '', 'm1', 7, '  m2  '] }),
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
  assert.equal(focus.target.mode, 'perMonth');
  assert.equal(normalizeMetric({ type: 'HABIT' }).type, 'HABIT');
});

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
  assert.deepEqual(
    monthTasks({ weeks: [{ days: [{ tasks: [{ uid: 't1' }] }, null] }] }).map((task) => task.uid),
    ['t1'],
  );
});

test('metricProgress TASK keeps raw done count while clamping percentage', () => {
  const state = monthState([
    { done: true, linkedMetricIds: ['m-task'] },
    { done: true, linkedMetricIds: ['m-task'] },
    { done: true, linkedMetricIds: ['m-task'] },
  ]);
  assert.deepEqual(
    metricProgress(state, { id: 'm-task', type: 'TASK', target: { mode: 'perMonth', value: 2 } }, 31),
    { done: 3, target: 2, pct: 100 },
  );
});

test('metricDone FOCUS sums only linked-task entries inside the selected month', () => {
  const state = monthState([
    { linkedMetricIds: ['m-focus'], focusLog: [
      { d: '2026-08-01', secs: 1500 },
      { d: '2026-08-31', secs: 900 },
      { d: '2026-07-31', secs: 3600 },
    ] },
    { linkedMetricIds: ['other'], focusLog: [{ d: '2026-08-10', secs: 7200 }] },
    { linkedMetricIds: ['m-focus'], focusLog: [
      { d: 'bad', secs: 600 },
      { d: '2026-08-11', secs: -5 },
    ] },
  ]);
  assert.equal(metricDone(state, { id: 'm-focus', type: 'FOCUS' }, { year: 2026, month: 7 }), 40);
});

test('metricDone FOCUS floors after summing and malformed logs produce zero', () => {
  const state = monthState([
    { linkedMetricIds: ['m-focus'], focusLog: [
      { d: '2026-08-01', secs: 31 },
      { d: '2026-08-02', secs: 31 },
    ] },
    { linkedMetricIds: ['m-focus'], focusLog: null },
  ]);
  assert.equal(metricDone(state, { id: 'm-focus', type: 'FOCUS' }, { year: 2026, month: 7 }), 1);
  assert.equal(metricDone({}, { id: 'm-focus', type: 'FOCUS' }, { year: 2026, month: 7 }), 0);
});

test('metric editor exposes TASK and FOCUS types', () => {
  const state = { habits: [], pillars: [{ id: 'p1', metrics: [] }] };
  const html = metricEditHTML(state, null, 'p1', (key) => translations[key] || key);
  assert.match(html, /data-metric-type="TASK"/);
  assert.match(html, /data-metric-type="FOCUS"/);
});

test('metric CRUD preserves TASK/FOCUS types and clears habit links', () => {
  const state = { pillars: [{ id: 'p1', name: 'Work', icon: 'W', metrics: [] }] };
  const metric = addMetric(state, 'p1', {
    title: 'Tasks', type: 'TASK', target: { mode: 'perMonth', value: 5 },
  });
  assert.equal(metric.type, 'TASK');
  updateMetric(state, metric.id, {
    type: 'FOCUS', linkedHabitId: 'h1', target: { mode: 'perMonth', value: 300 },
  });
  assert.equal(metric.type, 'FOCUS');
  assert.equal(metric.unit, 'minutes');
  assert.equal(metric.linkedHabitId, null);
});

test('metric row uses task and focus units with full month-state aggregation', () => {
  const taskState = monthState([
    { done: true, linkedMetricIds: ['m-task'] },
    { done: false, linkedMetricIds: ['m-task'] },
  ]);
  const taskHtml = metricRowHTML(taskState, {}, {
    id: 'm-task', title: 'Ship', type: 'TASK', target: { mode: 'perMonth', value: 2 },
  });
  assert.match(taskHtml, />1\/2 tasks</);
  assert.match(taskHtml, /aria-label="Ship — 1\/2 tasks"/);

  const focusState = monthState([
    { linkedMetricIds: ['m-focus'], focusLog: [{ d: '2026-08-10', secs: 2400 }] },
  ]);
  const focusHtml = metricRowHTML(focusState, {}, {
    id: 'm-focus', title: 'Deep Work', type: 'FOCUS', target: { mode: 'perMonth', value: 60 },
  });
  assert.match(focusHtml, />40\/60 min</);
  assert.match(focusHtml, /aria-label="Deep Work — 40\/60 min"/);
});

test('i18n contains task/focus metric labels and unit copy in vi and en', () => {
  [
    'metricTypeTASK', 'metricTypeFOCUS', 'metricTaskHint', 'metricFocusHint',
    'metricTaskUnit', 'metricFocusUnit', 'metricBarAriaUnit', 'metricTargetMinutesLbl',
  ].forEach((key) => {
    const matches = I18N_JS.match(new RegExp(`${key}: '`, 'g'));
    assert.equal(matches && matches.length, 2, `${key} must exist in vi and en`);
  });
});

test('task lifecycle: same-month move preserves metric links', () => {
  const linked = { uid: 't1', kind: 'regular', linkedMetricIds: ['m1', 'm2'] };
  const result = PlanMath.moveTaskAcrossDays([linked], [], 0, 'regular');
  assert.deepEqual(result.tasksFrom, []);
  assert.deepEqual(result.tasksTo[0].linkedMetricIds, ['m1', 'm2']);
});

test('task lifecycle: duplicate, recurrence and carry-over explicitly clear metric links', () => {
  assert.match(APP_JS, /task-duplicate[\s\S]{0,700}linkedMetricIds:\s*\[\]/);
  assert.match(APP_JS, /plan\.copies\.forEach[\s\S]{0,250}linkedMetricIds\s*=\s*\[\]/);
  assert.match(PLAN_CARRY_JS, /copy:\s*Object\.assign[\s\S]{0,650}linkedMetricIds:\s*\[\]/);
});

test('task migration normalizes legacy links without replacing the task object', () => {
  assert.match(APP_JS, /setTaskMetricIds\(tk,\s*tk\.linkedMetricIds\)/);
  assert.doesNotMatch(APP_JS, /tk\s*=\s*\{[^}]*linkedMetricIds/);
});

test('all direct task creation modules initialize empty metric links', () => {
  assert.match(APP_JS, /today-addtask[\s\S]{0,500}linkedMetricIds:\s*\[\]/);
  assert.match(APP_JS, /act === 'addtask'[\s\S]{0,500}linkedMetricIds:\s*\[\]/);
  assert.match(QUICK_ADD_JS, /uid:\s*newTaskUid\(\)[\s\S]{0,300}linkedMetricIds:\s*\[\]/);
  assert.match(INBOX_JS, /inbox\.push\([\s\S]{0,300}linkedMetricIds:\s*\[\]/);
});

test('Task Detail renders an accessible multi-metric link group for scheduled tasks', () => {
  assert.match(APP_JS, /function taskMetricLinksHTML\(/);
  assert.match(APP_JS, /<fieldset[^>]*data-role="td-linked-metrics"/);
  assert.match(APP_JS, /<legend[^>]*>\$\{t\('taskLinkedMetrics'\)\}/);
  assert.match(APP_JS, /data-action="td-metric-link"/);
  assert.match(APP_JS, /visiblePillars\(monthState\)/);
  assert.match(APP_JS, /normalizeTaskMetricIds\(task\)/);
  assert.match(APP_JS, /taskMetricLinksHTML\(taskDetailState\(\),\s*tk,\s*inInbox\)/);
});

test('Task Detail metric links persist multiple checked ids and refresh metric UI', () => {
  assert.match(APP_JS, /querySelectorAll\('\[data-action="td-metric-link"\]:checked'\)/);
  assert.match(APP_JS, /setTaskMetricIds\(g\.tk,\s*ids\)/);
  assert.match(APP_JS, /saveTaskDetailState\(\)/);
  assert.match(APP_JS, /rerenderPillars\(\)/);
});

test('Task Detail metric links include localized empty/inbox states in vi and en', () => {
  ['taskLinkedMetrics', 'taskLinkedMetricsEmpty', 'taskLinkedMetricsInbox', 'taskLinkedMetricAria'].forEach((key) => {
    const matches = I18N_JS.match(new RegExp(`${key}: '`, 'g'));
    assert.equal(matches && matches.length, 2, `${key} must exist in vi and en`);
  });
  assert.match(APP_JS, /taskLinkedMetricsInbox/);
  assert.match(APP_JS, /taskLinkedMetricsEmpty/);
});

test('Task Detail metric link styles are responsive and mirrored in deferred CSS', () => {
  ['.td-linked-metrics', '.td-metric-option', '.td-metric-pillar'].forEach((selector) => {
    assert.match(CSS, new RegExp(selector.replace('.', '\\.')));
    assert.match(DEFERRED_CSS, new RegExp(selector.replace('.', '\\.')));
  });
  assert.match(CSS, /@media \(max-width:\s*600px\)[\s\S]*\.td-metric-option[\s\S]*min-height:\s*44px/);
});

test('P4 minified bundles contain task/focus metric implementation and load in order', () => {
  assert.ok(APP_HTML.indexOf('js/pillars.min.js') < APP_HTML.indexOf('js/app.min.js'));
  assert.match(APP_MIN, /td-metric-link/);
  assert.match(PILLARS_MIN, /normalizeTaskMetricIds/);
  assert.match(I18N_MIN, /taskLinkedMetrics/);
});

test('P4 service worker cache is bumped and precaches changed bundles', () => {
  const version = +(SW.match(/taskflow-v(\d+)/) || [])[1];
  assert.ok(version > 186, `cache version must be above P3 v186, got ${version}`);
  ['app.min.js', 'pillars.min.js', 'i18n.min.js', 'styles-deferred.min.css'].forEach((asset) => {
    assert.match(SW, new RegExp(asset.replace('.', '\\.')));
  });
});

test('P4 E2E scenario is available as a focused view and in the full matrix', () => {
  assert.match(E2E, /def task_focus_metrics_checks\(/);
  assert.match(E2E, /"task-focus-metrics"/);
  assert.match(E2E, /\("task-focus-metrics",\s*task_focus_metrics_checks\)/);
  assert.match(E2E, /data-role="td-linked-metrics"/);
  assert.match(E2E, /data-action="td-metric-link"/);
});
