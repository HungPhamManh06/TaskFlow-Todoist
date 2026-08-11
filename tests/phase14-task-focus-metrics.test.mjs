// TaskFlow — P4 Task/Focus Metrics: pure helpers, migration and UI wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Pillars from '../js/pillars.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const I18N_JS = readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');

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
