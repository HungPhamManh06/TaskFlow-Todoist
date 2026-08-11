import test from 'node:test';
import assert from 'node:assert/strict';

import WeeklyReview from '../js/weekly-review.js';

const {
  emptyReview,
  normalizeReview,
  ensureWeeklyReviews,
  weekCalendarDays,
  weeklySummary,
  weekTarget,
  weeklyMetricProgress,
  weeklyPillarScores,
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

test('weekTarget prorates all modes without rounding the target', () => {
  assert.equal(weekTarget({ target: { mode: 'daily', value: 99 } }, 2, 31), 2);
  assert.equal(weekTarget({ target: { mode: 'perWeek', value: 7 } }, 2, 31), 2);
  assert.equal(weekTarget({ target: { mode: 'perMonth', value: 31 } }, 2, 31), 2);
  assert.equal(weekTarget({ target: { mode: 'custom', value: 15.5 } }, 2, 31), 1);
});

test('weekTarget handles February, leap-year February and 31-day proportions', () => {
  assert.equal(weekTarget({ target: { mode: 'perMonth', value: 28 } }, 7, 28), 7);
  assert.equal(weekTarget({ target: { mode: 'perMonth', value: 29 } }, 7, 29), 7);
  assert.equal(weekTarget({ target: { mode: 'perMonth', value: 31 } }, 7, 31), 7);
  assert.equal(weekTarget({ target: { mode: 'perMonth', value: 0 } }, 7, 31), 7 / 31);
  assert.equal(weekTarget({ target: { mode: 'perMonth', value: 2 } }, 0, 31), null);
});

const augustContext = {
  planStart: new Date(2026, 7, 3),
  year: 2026,
  month: 7,
  monthDays: 31,
};

const fullWeek = {
  n: 1,
  days: Array.from({ length: 7 }, (_, day) => ({ tasks: day === 0 ? [
    {
      text: 'Linked task done', done: true, linkedMetricIds: ['m-task', 'm-focus'],
      focusLog: [
        { d: '2026-08-03', secs: 3600 },
        { d: '2026-08-04', secs: 1800 },
        { d: '2026-08-15', secs: 7200 },
      ],
    },
    { text: 'Linked task open', done: false, linkedMetricIds: ['m-task'], focusLog: [] },
    {
      text: 'Unrelated done', done: true, linkedMetricIds: ['other'],
      focusLog: [{ d: '2026-08-04', secs: 7200 }],
    },
  ] : [] })),
};

const habitDays = Array(31).fill(false);
habitDays[2] = true;
habitDays[3] = true;

const habitMetric = {
  id: 'm-habit', type: 'HABIT', linkedHabitId: 'h1',
  target: { mode: 'daily', value: 1 },
};
const taskMetric = { id: 'm-task', type: 'TASK', target: { mode: 'perWeek', value: 2 } };
const focusMetric = { id: 'm-focus', type: 'FOCUS', target: { mode: 'perWeek', value: 120 } };
const manualMetric = {
  id: 'm-manual', type: 'MANUAL', target: { mode: 'perWeek', value: 7 },
  days: [false, false, true, true, true, false, false],
};

const metricState = {
  habits: [{ id: 'h1', days: habitDays, skipDays: [4] }],
  weeks: [fullWeek],
  pillars: [
    { id: 'body', name: 'Body', icon: 'B', metrics: [habitMetric] },
    { id: 'work', name: 'Work', icon: 'W', metrics: [taskMetric, focusMetric] },
    { id: 'hidden', name: 'Hidden', hidden: true, metrics: [manualMetric] },
    { id: 'empty', name: 'Empty', metrics: [] },
  ],
};

test('weeklyMetricProgress scores HABIT and excludes skipped days from daily target', () => {
  assert.deepEqual(weeklyMetricProgress(metricState, fullWeek, habitMetric, augustContext), {
    done: 2, target: 6, pct: 33,
  });
});

test('weeklyMetricProgress scores MANUAL and CUSTOM checked days', () => {
  assert.deepEqual(weeklyMetricProgress(metricState, fullWeek, manualMetric, augustContext), {
    done: 3, target: 7, pct: 43,
  });
  assert.deepEqual(weeklyMetricProgress(metricState, fullWeek, { ...manualMetric, type: 'CUSTOM' }, augustContext), {
    done: 3, target: 7, pct: 43,
  });
});

test('weeklyMetricProgress TASK counts only completed linked non-blank tasks', () => {
  assert.deepEqual(weeklyMetricProgress(metricState, fullWeek, taskMetric, augustContext), {
    done: 1, target: 2, pct: 50,
  });
});

test('weeklyMetricProgress FOCUS sums linked task logs only inside the selected week', () => {
  assert.deepEqual(weeklyMetricProgress(metricState, fullWeek, focusMetric, augustContext), {
    done: 90, target: 120, pct: 75,
  });
});

test('weeklyMetricProgress omits stale links, unsupported types and invalid input', () => {
  assert.equal(weeklyMetricProgress(metricState, fullWeek, { ...habitMetric, linkedHabitId: 'missing' }, augustContext), null);
  assert.equal(weeklyMetricProgress(metricState, fullWeek, { type: 'UNKNOWN' }, augustContext), null);
  assert.equal(weeklyMetricProgress(null, null, null, augustContext), null);
});

test('weeklyPillarScores averages scorable metrics and omits hidden or empty pillars', () => {
  const scores = weeklyPillarScores(metricState, fullWeek, augustContext);
  assert.deepEqual(scores.map((p) => ({ id: p.id, pct: p.pct, metricCount: p.metricCount })), [
    { id: 'body', pct: 33, metricCount: 1 },
    { id: 'work', pct: 63, metricCount: 2 },
  ]);
});
