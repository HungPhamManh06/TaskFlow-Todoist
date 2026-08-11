// TaskFlow — P5 Daily Alignment: pure collector and Today integration coverage.
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
