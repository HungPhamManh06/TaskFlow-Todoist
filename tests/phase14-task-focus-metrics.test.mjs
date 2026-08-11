// TaskFlow — P4 Task/Focus Metrics: pure helpers, migration and UI wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import Pillars from '../js/pillars.js';

const {
  normalizeMetric,
  normalizeTaskMetricIds,
  setTaskMetricIds,
  monthTasks,
  metricDone,
  metricProgress,
} = Pillars;

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
