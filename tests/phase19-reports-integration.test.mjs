import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const Insights = require('../js/report-insights.js');
const History = require('../js/reflection-history.js');
const APP_HTML = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const APP_JS = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const REPORT_UI = readFileSync(new URL('../js/report-ui.js', import.meta.url), 'utf8');
const I18N = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
const STYLES = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const DEFERRED = readFileSync(new URL('../css/styles-deferred.css', import.meta.url), 'utf8');
const SW = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const E2E = readFileSync(new URL('../scripts/e2e-frontend.py', import.meta.url), 'utf8');

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

test('report UI composes accessible balance, guidance, mood trend and history launcher', () => {
  assert.match(REPORT_UI, /monthlyBalance\(monthlyReviewModel\)/);
  assert.match(REPORT_UI, /metricRecommendations\(monthlyReviewModel\)/);
  assert.match(REPORT_UI, /moodTrend\(/);
  assert.match(REPORT_UI, /class="report-balance-progress"[^>]*role="progressbar"/);
  assert.match(REPORT_UI, /data-testid="report-guidance"/);
  assert.match(REPORT_UI, /data-testid="report-mood-trend"/);
  assert.match(REPORT_UI, /data-action="report-history-open-panel"/);
});

test('report history modal and delegated owner actions are wired', () => {
  assert.match(APP_HTML, /id="reportHistoryModal"[^>]*data-testid="report-history-modal"/);
  assert.match(APP_JS, /TaskFlowReflectionHistory missing/);
  ['report-history-open-panel', 'report-history-filter', 'report-history-open', 'report-history-close'].forEach((action) => {
    assert.match(APP_JS, new RegExp(`act === '${action}'`));
  });
  assert.match(APP_JS, /openDeepReflection\(entry\.owner\.key\)/);
  assert.match(APP_JS, /openReportModal\(\)/);
});

test('P9 has VI/EN factual copy and mirrored responsive styles', () => {
  ['reportBalanceTitle', 'reportInsightMaintained', 'reportInsightLessOften', 'reportHistoryTitle', 'reportMoodTitle'].forEach((key) => {
    assert.ok((I18N.match(new RegExp(`${key}:`, 'g')) || []).length >= 2, `missing ${key}`);
  });
  const guidanceLines = I18N.split(/\r?\n/).filter((line) => /reportInsight(Maintained|LessOften):/.test(line)).join('\n');
  assert.doesNotMatch(guidanceLines, /\bAI\b|chẩn đoán|diagnos(e|is)/i);
  assert.match(STYLES, /\.report-balance-list/);
  assert.match(DEFERRED, /\.report-balance-list/);
  assert.match(STYLES, /@media[^{}]*\(max-width:\s*600px\)[\s\S]*?\.report-history-tabs/);
  assert.match(DEFERRED, /@media[^{}]*\(max-width:\s*600px\)[\s\S]*?\.report-history-tabs/);
});

test('P9 production assets load in dependency order and cache offline', () => {
  const insights = APP_HTML.indexOf('js/report-insights.min.js?v=1');
  const history = APP_HTML.indexOf('js/reflection-history.min.js?v=1');
  const report = APP_HTML.indexOf('js/report-ui.min.js?v=5');
  const app = APP_HTML.indexOf('js/app.min.js?v=225');
  assert.ok(insights >= 0 && history > insights && report > history && app > report);
  assert.match(APP_HTML, /js\/i18n\.min\.js\?v=60/);
  assert.equal((APP_HTML.match(/css\/styles-deferred\.min\.css\?v=\d+/g) || []).length, 2);
  assert.match(SW, /const CACHE = 'taskflow-v293'/);
  assert.match(SW, /'\.\/js\/report-insights\.min\.js'/);
  assert.match(SW, /'\.\/js\/reflection-history\.min\.js'/);
});

test('P9 E2E is focused and part of the release matrix', () => {
  assert.match(E2E, /def report_growth_checks\(/);
  assert.match(E2E, /\("report-growth", report_growth_checks\)/);
  assert.match(E2E, /args\.view == "report-growth"/);
  assert.match(E2E, /E2E REPORT-GROWTH OK/);
});
