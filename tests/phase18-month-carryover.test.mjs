import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Carry = require('../js/month-carryover.js');

const {
  nextMonth,
  normalizeCarrySelection,
  buildCarryPreview,
  applyCarryover,
} = Carry;

function sourceFixture() {
  return {
    monthKey: 'planner-2026-8',
    habits: [{
      id: 'h-gym', name: ' Gym ', target: 80, days: [true, true], skipDays: [2],
      remind: { enabled: true, time: '07:00' }, future: 'kept',
    }],
    pillars: [{
      id: 'p-body', name: 'Body', icon: 'B', hidden: false, focus: 'Build strength', future: 'kept',
      metrics: [
        { id: 'm-habit', title: 'Gym days', type: 'HABIT', linkedHabitId: 'h-gym', days: [true], target: { mode: 'perWeek', value: 4 } },
        { id: 'm-task', title: 'Deliveries', type: 'TASK', days: [true], target: { mode: 'perMonth', value: 3 } },
      ],
    }],
    weeks: [{ days: [{ tasks: [{ uid: 'source-task', text: 'Never copy me', linkedMetricIds: ['m-task'] }] }] }],
    monthlyGoals: [{ id: 'old-goal', text: 'Never copy goal' }],
    monthlyReview: { achievement: 'Never copy review' },
  };
}

function destinationFixture() {
  return {
    monthKey: 'planner-2026-9',
    habits: [],
    pillars: [],
    weeks: [{ days: [{ tasks: [{ uid: 'destination-task', text: 'Keep me' }] }] }],
    monthlyGoals: [{ id: 'dest-goal', text: 'Keep goal' }],
    marker: { unchanged: true },
  };
}

function ids() {
  let n = 0;
  return (kind) => `${kind}-new-${++n}`;
}

const fullSelection = {
  pillarIds: ['p-body'],
  focusPillarIds: ['p-body'],
  habitIds: ['h-gym'],
  metricIds: ['m-habit', 'm-task'],
};

test('nextMonth handles normal and December rollover', () => {
  assert.deepEqual(nextMonth(2026, 7), { year: 2026, month: 8 });
  assert.deepEqual(nextMonth(2026, 11), { year: 2027, month: 0 });
});

test('normalizeCarrySelection defaults everything to unselected and deduplicates ids', () => {
  assert.deepEqual(normalizeCarrySelection(null), { pillarIds: [], focusPillarIds: [], habitIds: [], metricIds: [] });
  assert.deepEqual(normalizeCarrySelection({ pillarIds: ['p', 'p', 4], habitIds: ['h'] }), {
    pillarIds: ['p'], focusPillarIds: [], habitIds: ['h'], metricIds: [],
  });
});

test('buildCarryPreview lists exact selected structures without mutating inputs', () => {
  const source = sourceFixture();
  const destination = destinationFixture();
  const sourceBefore = structuredClone(source);
  const destinationBefore = structuredClone(destination);
  const preview = buildCarryPreview(source, destination, fullSelection, { monthDays: 30 });
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.create.map((item) => item.kind), ['habit', 'pillar', 'focus', 'metric', 'metric']);
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(destination, destinationBefore);
});

test('applyCarryover remaps linked habit and resets all progress', () => {
  const result = applyCarryover(sourceFixture(), destinationFixture(), fullSelection, { monthDays: 30, id: ids() });
  assert.equal(result.ok, true);
  const habit = result.state.habits[0];
  const pillar = result.state.pillars[0];
  const habitMetric = pillar.metrics.find((metric) => metric.type === 'HABIT');
  assert.equal(habit.name, 'Gym');
  assert.deepEqual(habit.days, Array(30).fill(false));
  assert.deepEqual(habit.skipDays, []);
  assert.deepEqual(habit.remind, { enabled: false, time: '07:00' });
  assert.equal(habit.future, 'kept');
  assert.equal(pillar.focus, 'Build strength');
  assert.equal(pillar.future, 'kept');
  assert.equal(habitMetric.linkedHabitId, habit.id);
  assert.deepEqual(habitMetric.days, Array(30).fill(false));
});

test('applyCarryover never copies tasks, goals, review or source completion', () => {
  const destination = destinationFixture();
  const result = applyCarryover(sourceFixture(), destination, fullSelection, { monthDays: 30, id: ids() });
  assert.deepEqual(result.state.weeks, destination.weeks);
  assert.deepEqual(result.state.monthlyGoals, destination.monthlyGoals);
  assert.equal(result.state.monthlyReview, undefined);
  assert.equal(JSON.stringify(result.state).includes('source-task'), false);
  assert.equal(JSON.stringify(result.state).includes('Never copy review'), false);
});

test('equivalent destination pillar is skipped byte-for-byte with its children', () => {
  const destination = destinationFixture();
  destination.pillars.push({ id: 'dest-body', name: ' body ', icon: 'D', focus: 'Existing', metrics: [], keep: 1 });
  const before = structuredClone(destination.pillars[0]);
  const result = applyCarryover(sourceFixture(), destination, fullSelection, { monthDays: 30, id: ids() });
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.pillars[0], before);
  assert.equal(result.state.pillars.length, 1);
  assert.ok(result.preview.skip.some((item) => item.kind === 'pillar'));
});

test('equivalent destination habit satisfies HABIT metric without overwrite', () => {
  const destination = destinationFixture();
  destination.habits.push({ id: 'dest-gym', name: 'gym', days: [true], keep: 1 });
  const before = structuredClone(destination.habits[0]);
  const selection = { ...fullSelection, habitIds: [] };
  const result = applyCarryover(sourceFixture(), destination, selection, { monthDays: 30, id: ids() });
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.habits[0], before);
  assert.equal(result.state.pillars[0].metrics[0].linkedHabitId, 'dest-gym');
});

test('selected HABIT metric blocks when its habit is neither selected nor present', () => {
  const selection = { ...fullSelection, habitIds: [] };
  const preview = buildCarryPreview(sourceFixture(), destinationFixture(), selection, { monthDays: 30 });
  assert.equal(preview.ok, false);
  assert.deepEqual(preview.errors, [{ code: 'missing-habit', metricId: 'm-habit', habitId: 'h-gym' }]);
  const result = applyCarryover(sourceFixture(), destinationFixture(), selection, { monthDays: 30, id: ids() });
  assert.equal(result.ok, false);
  assert.equal(result.state, null);
});

test('metric selection requires its source pillar to be selected', () => {
  const preview = buildCarryPreview(sourceFixture(), destinationFixture(), { metricIds: ['m-task'] }, { monthDays: 30 });
  assert.equal(preview.ok, false);
  assert.deepEqual(preview.errors, [{ code: 'missing-pillar', metricId: 'm-task', pillarId: 'p-body' }]);
});

test('same carry selection is idempotent against the resulting destination', () => {
  const first = applyCarryover(sourceFixture(), destinationFixture(), fullSelection, { monthDays: 30, id: ids() });
  const second = applyCarryover(sourceFixture(), first.state, fullSelection, { monthDays: 30, id: ids() });
  assert.equal(second.ok, true);
  assert.deepEqual(second.state, first.state);
});

test('malformed source records are skipped without crashing', () => {
  const source = { habits: [null, { id: 2 }], pillars: [null, { id: 'p', name: '', metrics: [null] }] };
  const preview = buildCarryPreview(source, destinationFixture(), { pillarIds: ['p'], habitIds: ['x'] }, { monthDays: 30 });
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.create, []);
});
