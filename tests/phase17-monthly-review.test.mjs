import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Pillars = require('../js/pillars.js');
const MonthlyReview = require('../js/monthly-review.js');

const {
  emptyMonthlyReview,
  normalizeMonthlyReview,
  ensureMonthlyReview,
  monthlyPillarScores,
  buildMonthlyReviewModel,
} = MonthlyReview;

const context = {
  year: 2026,
  month: 7,
  monthDays: 31,
  metricProgress: Pillars.metricProgress,
  legacyPrompts: ['Old one', 'Old two', 'Old three', 'Old four'],
};

function fixture() {
  return {
    habits: [{ id: 'h-gym', name: 'Gym', days: Array.from({ length: 31 }, (_, i) => i < 20) }],
    weeks: [{ days: [{ tasks: [
      { text: 'Ship', done: true, linkedMetricIds: ['m-task'], focusLog: [{ d: '2026-08-04', secs: 3600 }] },
      { text: 'Unlinked', done: true, linkedMetricIds: [], focusLog: [{ d: '2026-08-04', secs: 7200 }] },
    ] }] }],
    pillars: [
      {
        id: 'p-body', name: 'Body', icon: 'B', hidden: false, metrics: [
          { id: 'm-gym', title: 'Gym', type: 'HABIT', linkedHabitId: 'h-gym', target: { mode: 'perMonth', value: 25 } },
          { id: 'm-sleep', title: 'Sleep', type: 'MANUAL', days: Array.from({ length: 31 }, (_, i) => i < 10), target: { mode: 'perMonth', value: 20 } },
        ],
      },
      {
        id: 'p-work', name: 'Work', icon: 'W', hidden: false, metrics: [
          { id: 'm-task', title: 'Delivery', type: 'TASK', target: { mode: 'perMonth', value: 2 } },
          { id: 'm-focus', title: 'Deep work', type: 'FOCUS', target: { mode: 'perMonth', value: 120 } },
        ],
      },
      { id: 'p-hidden', name: 'Hidden', hidden: true, metrics: [{ id: 'x', title: 'X', type: 'MANUAL', days: [true], target: { mode: 'custom', value: 1 } }] },
    ],
    reflections: { overview: ['Legacy answer', '', '', ''] },
  };
}

test('emptyMonthlyReview returns independent structured records', () => {
  const a = emptyMonthlyReview();
  const b = emptyMonthlyReview();
  a.achievement = 'Changed';
  assert.equal(b.achievement, '');
  assert.deepEqual(Object.keys(b), ['achievement', 'learned', 'continue', 'stop', 'start', 'updatedAt']);
});

test('normalizeMonthlyReview sanitizes known fields and preserves forward fields', () => {
  const out = normalizeMonthlyReview({ achievement: 42, learned: 'Lesson', future: { kept: true } });
  assert.equal(out.achievement, '');
  assert.equal(out.learned, 'Lesson');
  assert.deepEqual(out.future, { kept: true });
});

test('ensureMonthlyReview is additive and preserves legacy month reflection', () => {
  const state = { monthlyReview: { achievement: 'Won', future: 1 }, reflections: { overview: ['legacy'] } };
  const originalLegacy = state.reflections.overview;
  ensureMonthlyReview(state);
  assert.equal(state.monthlyReview.achievement, 'Won');
  assert.equal(state.monthlyReview.future, 1);
  assert.equal(state.reflections.overview, originalLegacy);
});

test('monthlyPillarScores derives real strongest and attention metrics', () => {
  const scores = monthlyPillarScores(fixture(), context);
  assert.equal(scores.length, 2);
  assert.deepEqual(scores[0], {
    id: 'p-body', name: 'Body', icon: 'B', pct: 65,
    strongest: { id: 'm-gym', title: 'Gym', pct: 80, done: 20, target: 25 },
    attention: { id: 'm-sleep', title: 'Sleep', pct: 50, done: 10, target: 20 },
    metrics: [
      { id: 'm-gym', title: 'Gym', type: 'HABIT', pct: 80, done: 20, target: 25 },
      { id: 'm-sleep', title: 'Sleep', type: 'MANUAL', pct: 50, done: 10, target: 20 },
    ],
  });
});

test('TASK and FOCUS monthly scores count only linked tasks', () => {
  const work = monthlyPillarScores(fixture(), context)[1];
  assert.equal(work.metrics.find((m) => m.type === 'TASK').done, 1);
  assert.equal(work.metrics.find((m) => m.type === 'FOCUS').done, 0);
  const focusMetric = fixture().pillars[1].metrics[1];
  fixture();
  const state = fixture();
  state.weeks[0].days[0].tasks[0].linkedMetricIds.push('m-focus');
  assert.equal(monthlyPillarScores(state, context)[1].metrics.find((m) => m.type === 'FOCUS').done, 60);
  assert.equal(focusMetric.id, 'm-focus');
});

test('hidden pillars, stale habits and unsupported metrics are unscorable', () => {
  const state = fixture();
  state.pillars[0].metrics.push({ id: 'stale', title: 'Stale', type: 'HABIT', linkedHabitId: 'missing', target: { mode: 'perMonth', value: 5 } });
  state.pillars[0].metrics.push({ id: 'unknown', title: 'Unknown', type: 'ALIEN', target: { mode: 'custom', value: 1 } });
  const scores = monthlyPillarScores(state, context);
  assert.equal(scores.length, 2);
  assert.equal(scores[0].metrics.length, 2);
});

test('buildMonthlyReviewModel reports unavailable overall without scored pillars', () => {
  const state = { pillars: [], reflections: { overview: ['', '', '', ''] } };
  const model = buildMonthlyReviewModel(state, context);
  assert.equal(model.overall, null);
  assert.deepEqual(model.pillars, []);
  assert.deepEqual(model.legacy, []);
});

test('buildMonthlyReviewModel separates legacy answers from new reflection', () => {
  const state = fixture();
  state.monthlyReview = { achievement: 'New achievement' };
  const model = buildMonthlyReviewModel(state, context);
  assert.equal(model.review.achievement, 'New achievement');
  assert.deepEqual(model.legacy, [{ prompt: 'Old one', answer: 'Legacy answer' }]);
  assert.equal(model.overall, 45);
});
