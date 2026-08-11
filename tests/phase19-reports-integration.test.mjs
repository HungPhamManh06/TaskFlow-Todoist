import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Insights = require('../js/report-insights.js');

const model = {
  pillars: [{
    id: 'p1', name: 'Body', icon: 'B', pct: 60,
    strongest: { id: 'm81', title: 'Exercise', pct: 81 },
    attention: { id: 'm39', title: 'Sleep', pct: 39 },
    metrics: [
      { id: 'm39', title: 'Sleep', type: 'MANUAL', pct: 39 },
      { id: 'm40', title: 'Water', type: 'HABIT', pct: 40 },
      { id: 'm80', title: 'Walk', type: 'TASK', pct: 80 },
      { id: 'm81', title: 'Exercise', type: 'FOCUS', pct: 81 },
    ],
  }, {
    id: 'p2', name: 'Work', icon: 'W', pct: 25,
    strongest: { id: 'm2', title: 'Ship', pct: 25 },
    attention: { id: 'm2', title: 'Ship', pct: 25 },
    metrics: [{ id: 'm2', title: 'Ship', type: 'TASK', pct: 25 }],
  }],
};

test('monthlyBalance reuses scored pillar order and accessible facts', () => {
  assert.deepEqual(Insights.monthlyBalance(model), [{
    id: 'p1', name: 'Body', icon: 'B', pct: 60,
    strongest: { id: 'm81', title: 'Exercise', pct: 81 },
    attention: { id: 'm39', title: 'Sleep', pct: 39 },
  }, {
    id: 'p2', name: 'Work', icon: 'W', pct: 25,
    strongest: { id: 'm2', title: 'Ship', pct: 25 },
    attention: { id: 'm2', title: 'Ship', pct: 25 },
  }]);
  assert.deepEqual(Insights.monthlyBalance({ pillars: null }), []);
});

test('metricRecommendations uses exact 39/40/80/81 boundaries and stable order', () => {
  assert.deepEqual(Insights.metricRecommendations(model), [{
    pillarId: 'p1', pillarName: 'Body', metricId: 'm39', metricTitle: 'Sleep', pct: 39,
    messageKey: 'reportInsightLessOften', tone: 'attention',
  }, {
    pillarId: 'p1', pillarName: 'Body', metricId: 'm81', metricTitle: 'Exercise', pct: 81,
    messageKey: 'reportInsightMaintained', tone: 'maintained',
  }, {
    pillarId: 'p2', pillarName: 'Work', metricId: 'm2', metricTitle: 'Ship', pct: 25,
    messageKey: 'reportInsightLessOften', tone: 'attention',
  }]);
});

test('metricRecommendations ignores malformed or unscored metrics and never emits prose', () => {
  const result = Insights.metricRecommendations({ pillars: [{ id: 'p', name: 'P', metrics: [
    null, { id: 'x', title: 'X', pct: NaN }, { id: 'y', title: '', pct: 99 }, { id: 'z', title: 'Z', pct: 50 },
  ] }] });
  assert.deepEqual(result, []);
  Insights.metricRecommendations(model).forEach((item) => assert.match(item.messageKey, /^reportInsight/));
});

test('moodTrend requires three dated samples and builds a chronological distribution', () => {
  assert.deepEqual(Insights.moodTrend([{ date: '2026-08-01', mood: 2 }, { date: '2026-08-02', mood: 4 }]), {
    available: false, sampleCount: 2, samples: [], distribution: [0, 0, 0, 0, 0], directionKey: null,
  });
  const trend = Insights.moodTrend([
    { date: '2026-08-03', mood: 5 }, { date: 'bad', mood: 1 },
    { date: '2026-08-01', mood: 2 }, { date: '2026-08-02', mood: 3 },
  ]);
  assert.equal(trend.available, true);
  assert.deepEqual(trend.samples.map((item) => item.date), ['2026-08-01', '2026-08-02', '2026-08-03']);
  assert.deepEqual(trend.distribution, [0, 1, 1, 0, 1]);
  assert.equal(trend.directionKey, 'reportMoodImproving');
});

test('moodTrend returns steady and declining facts without causal labels', () => {
  assert.equal(Insights.moodTrend([
    { date: '2026-08-01', mood: 3 }, { date: '2026-08-02', mood: 3 }, { date: '2026-08-03', mood: 3 },
  ]).directionKey, 'reportMoodSteady');
  assert.equal(Insights.moodTrend([
    { date: '2026-08-01', mood: 5 }, { date: '2026-08-02', mood: 3 }, { date: '2026-08-03', mood: 1 },
  ]).directionKey, 'reportMoodDeclining');
});
