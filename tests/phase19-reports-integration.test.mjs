import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Insights = require('../js/report-insights.js');
const History = require('../js/reflection-history.js');

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

function memoryStorage(records) {
  const keys = Object.keys(records);
  return {
    get length() { return keys.length; },
    key(index) { return keys[index] ?? null; },
    getItem(key) { return Object.hasOwn(records, key) ? records[key] : null; },
  };
}

const historyStorage = memoryStorage({
  'planner-reflections-daily': JSON.stringify({
    '2026-08-03': { mood: 3, quickGood: 'Daily win', updatedAt: '2026-08-03T20:00:00.000Z' },
    bad: 'ignored',
  }),
  'planner-2026-8': JSON.stringify({
    monthKey: 'planner-2026-8',
    weeklyReviews: [{ best: 'Week one win', blocker: '', learned: '', change: '', priorities: [], updatedAt: '2026-08-07T20:00:00.000Z' }],
    monthlyReview: { achievement: 'July outcome', learned: '', continue: '', stop: '', start: '', updatedAt: '2026-07-31T20:00:00.000Z' },
  }),
  'planner-2026-9': JSON.stringify({
    monthKey: 'planner-2026-9',
    weeklyReviews: [null, { best: '', blocker: 'Week blocker', learned: '', change: '', priorities: [], updatedAt: '2026-08-12T20:00:00.000Z' }],
    monthlyReview: { achievement: 'August outcome', learned: 'Learned', continue: '', stop: '', start: '', updatedAt: '2026-08-31T20:00:00.000Z' },
  }),
  'planner-2026-10': '{bad json',
  'unrelated': JSON.stringify({ monthlyReview: { achievement: 'ignore' } }),
});

test('collectReflectionHistory combines daily, weekly and monthly newest first', () => {
  const entries = History.collectReflectionHistory(historyStorage);
  assert.deepEqual(entries.map((entry) => entry.type), ['monthly', 'weekly', 'weekly', 'daily', 'monthly']);
  assert.deepEqual(entries.map((entry) => entry.date), ['2026-08-31', '2026-08-12', '2026-08-07', '2026-08-03', '2026-07-31']);
  assert.equal(entries.find((entry) => entry.type === 'daily').mood, 4);
  assert.equal(entries[0].excerpt, 'August outcome');
});

test('filterHistory supports the three exact types and safe defaults', () => {
  const entries = History.collectReflectionHistory(historyStorage);
  assert.equal(History.filterHistory(entries, 'daily').length, 1);
  assert.equal(History.filterHistory(entries, 'weekly').length, 2);
  assert.equal(History.filterHistory(entries, 'monthly').length, 2);
  assert.equal(History.filterHistory(entries, 'invalid').length, entries.length);
});

test('collectReflectionHistory tolerates malformed storage and empty records', () => {
  const storage = memoryStorage({
    'planner-reflections-daily': '[]',
    'planner-2026-8': JSON.stringify({ weeklyReviews: [{ best: '' }], monthlyReview: {} }),
    'planner-2026-9': 'null',
  });
  assert.deepEqual(History.collectReflectionHistory(storage), []);
  assert.deepEqual(History.collectReflectionHistory(null), []);
});

const historyCopy = {
  reportHistoryDaily: 'Daily', reportHistoryWeekly: 'Weekly', reportHistoryMonthly: 'Monthly',
  reportHistoryEmpty: 'No entries', reportHistoryOpen: 'Open entry',
};
const historyT = (key) => historyCopy[key] || key;
const historyEsc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('reflectionHistoryHTML renders accessible filters, newest entries and empty states', () => {
  const entries = History.collectReflectionHistory(historyStorage);
  const html = History.reflectionHistoryHTML({ entries, filter: 'weekly' }, { t: historyT, esc: historyEsc });
  assert.match(html, /role="tablist"/);
  assert.match(html, /data-action="report-history-filter" data-history-filter="weekly"[^>]*aria-selected="true"/);
  assert.match(html, /data-action="report-history-open"/);
  assert.match(html, /Week blocker/);
  assert.ok(html.indexOf('Week blocker') < html.indexOf('Week one win'));
  const empty = History.reflectionHistoryHTML({ entries: [], filter: 'daily' }, { t: historyT, esc: historyEsc });
  assert.match(empty, /No entries/);
});
