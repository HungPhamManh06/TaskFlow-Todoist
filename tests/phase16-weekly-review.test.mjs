import test from 'node:test';
import assert from 'node:assert/strict';

import WeeklyReview from '../js/weekly-review.js';

const {
  emptyReview,
  normalizeReview,
  ensureWeeklyReviews,
  weekCalendarDays,
  weeklySummary,
} = WeeklyReview;

const context = {
  planStart: new Date(2026, 6, 27),
  year: 2026,
  month: 7,
  monthDays: 31,
};

const boundaryWeek = {
  n: 1,
  days: Array.from({ length: 7 }, (_, i) => ({
    tasks: i === 5
      ? [{ text: 'Linked work', done: true }, { text: '   ', done: true }]
      : [{ text: `Task ${i}`, done: i % 2 === 0 }],
  })),
};

test('emptyReview returns independent records', () => {
  const first = emptyReview();
  const second = emptyReview();
  first.priorities[0] = 'Changed';
  assert.deepEqual(second, {
    best: '', blocker: '', learned: '', change: '',
    priorities: ['', '', ''], updatedAt: null,
  });
});

test('normalizeReview fills missing fields and preserves forward fields', () => {
  const out = normalizeReview({ best: 'Win', priorities: ['A'], future: 7 });
  assert.deepEqual(out.priorities, ['A', '', '']);
  assert.equal(out.blocker, '');
  assert.equal(out.learned, '');
  assert.equal(out.change, '');
  assert.equal(out.updatedAt, null);
  assert.equal(out.future, 7);
});

test('normalizeReview sanitizes malformed known fields', () => {
  const out = normalizeReview({
    best: 1,
    blocker: null,
    learned: [],
    change: {},
    priorities: ['A', 2, null, 'extra'],
    updatedAt: 3,
  });
  assert.deepEqual(out, {
    best: '', blocker: '', learned: '', change: '',
    priorities: ['A', '', ''], updatedAt: null,
  });
});

test('ensureWeeklyReviews adds records without replacing valid data', () => {
  const state = { weeklyReviews: [{ best: 'Kept' }], reflections: { weeks: [['legacy']] } };
  const reviews = ensureWeeklyReviews(state, 3);
  assert.equal(reviews.length, 3);
  assert.equal(reviews[0].best, 'Kept');
  assert.deepEqual(state.reflections.weeks, [['legacy']]);
});

test('weekCalendarDays marks only dates inside the viewed month', () => {
  const days = weekCalendarDays(boundaryWeek, context);
  assert.deepEqual(days.map((d) => d.inMonth), [false, false, false, false, false, true, true]);
  assert.deepEqual(days.filter((d) => d.inMonth).map((d) => d.dayIndex), [0, 1]);
  assert.deepEqual(days.filter((d) => d.inMonth).map((d) => d.dateKey), ['2026-08-01', '2026-08-02']);
});

test('weeklySummary excludes blank tasks and skipped habit opportunities', () => {
  const habits = [
    { days: [true, false], skipDays: [1] },
    { days: [false, true], skipDays: [] },
  ];
  assert.deepEqual(weeklySummary(boundaryWeek, habits, 95, context), {
    tasksDone: 5,
    tasksTotal: 7,
    tasksPct: 71,
    habitsDone: 2,
    habitsTotal: 3,
    habitsPct: 67,
    focusMinutes: 95,
  });
});

test('weeklySummary tolerates empty and malformed input', () => {
  assert.deepEqual(weeklySummary({}, null, NaN, context), {
    tasksDone: 0,
    tasksTotal: 0,
    tasksPct: 0,
    habitsDone: 0,
    habitsTotal: 0,
    habitsPct: 0,
    focusMinutes: 0,
  });
});
