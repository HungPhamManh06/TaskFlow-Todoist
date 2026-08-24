import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const Pillars = require('../js/pillars.js');
const MonthlyReview = require('../js/monthly-review.js');

const {
  emptyMonthlyReview,
  normalizeMonthlyReview,
  ensureMonthlyReview,
  monthlyPillarScores,
  buildMonthlyReviewModel,
  monthlyReviewHTML,
  updateMonthlyReviewField,
} = MonthlyReview;

const APP_JS = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const REPORT_UI = readFileSync(new URL('../js/report-ui.js', import.meta.url), 'utf8');
const I18N = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
const STYLES = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const DEFERRED = readFileSync(new URL('../css/styles-deferred.css', import.meta.url), 'utf8');
const APP_HTML = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const SW = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const E2E = readFileSync(new URL('../scripts/e2e-frontend.py', import.meta.url), 'utf8');

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

const copy = {
  monthlyReviewTitle: 'Monthly Review',
  monthlyReviewOverall: 'Overall',
  monthlyReviewNoData: 'Not enough data yet.',
  monthlyReviewStrongest: 'Strongest',
  monthlyReviewAttention: 'Needs attention',
  monthlyReviewAchievement: 'Biggest achievement?',
  monthlyReviewLearned: 'Most important lesson?',
  monthlyReviewContinue: 'Continue',
  monthlyReviewStop: 'Stop',
  monthlyReviewStart: 'Start',
  monthlyReviewLegacy: 'Previous monthly reflection',
  monthlyReviewSaving: 'Saving…',
  monthlyReviewSaved: 'Saved',
};
const t = (key, vars = {}) => String(copy[key] || key).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('monthlyReviewHTML renders accessible progress, five fields and legacy notes', () => {
  const state = fixture();
  state.monthlyReview = { achievement: '<Win>' };
  const html = monthlyReviewHTML(buildMonthlyReviewModel(state, context), { t, esc });
  assert.match(html, /data-testid="monthly-review"/);
  assert.match(html, /role="progressbar"[^>]*aria-valuenow="65"/);
  ['achievement', 'learned', 'continue', 'stop', 'start'].forEach((field) => {
    assert.match(html, new RegExp(`data-monthly-review-field="${field}"`));
  });
  assert.match(html, /monthly-review-legacy/);
  assert.match(html, /&lt;Win&gt;/);
});

test('monthlyReviewHTML keeps reflection writable when no scores exist', () => {
  const html = monthlyReviewHTML(buildMonthlyReviewModel({ pillars: [] }, context), { t, esc });
  assert.match(html, /Not enough data yet/);
  assert.match(html, /data-monthly-review-field="start"/);
});

test('updateMonthlyReviewField edits only approved fields and timestamps the record', () => {
  const state = {};
  assert.equal(updateMonthlyReviewField(state, 'achievement', 'Finished', '2026-08-11T14:00:00.000Z').achievement, 'Finished');
  assert.equal(state.monthlyReview.updatedAt, '2026-08-11T14:00:00.000Z');
  assert.equal(updateMonthlyReviewField(state, 'future', 'No', 'later'), null);
});

test('app state migrates and saves additive monthlyReview', () => {
  assert.match(APP_JS, /TaskFlowMonthlyReview missing/);
  assert.ok((APP_JS.match(/monthlyReview:\s*emptyMonthlyReview\(\)/g) || []).length >= 2);
  assert.match(APP_JS, /ensureMonthlyReview\(s\)/);
  assert.match(APP_JS, /ensureMonthlyReview\(state\)/);
  assert.match(APP_JS, /dataset\.monthlyReviewField/);
  assert.match(APP_JS, /updateMonthlyReviewField\(/);
});

test('monthly report composes the new review model', () => {
  assert.match(REPORT_UI, /buildMonthlyReviewModel\(/);
  assert.match(REPORT_UI, /monthlyReviewHTML\(/);
});

test('Monthly Review has VI/EN copy and mirrored responsive styles', () => {
  ['monthlyReviewTitle', 'monthlyReviewAchievement', 'monthlyReviewContinue', 'monthlyReviewStop', 'monthlyReviewStart'].forEach((key) => {
    assert.ok((I18N.match(new RegExp(`${key}:`, 'g')) || []).length >= 2, `missing ${key}`);
  });
  assert.match(STYLES, /\.monthly-review-card/);
  assert.match(DEFERRED, /\.monthly-review-card/);
  assert.match(STYLES, /@media[^{}]*\(max-width:\s*600px\)[\s\S]*?\.monthly-review-fields/);
  assert.match(DEFERRED, /@media[^{}]*\(max-width:\s*600px\)[\s\S]*?\.monthly-review-fields/);
});

test('Monthly Review production assets load before report/app and cache offline', () => {
  const monthlyIndex = APP_HTML.indexOf('js/monthly-review.min.js?v=2');
  const reportIndex = APP_HTML.indexOf('js/report-ui.min.js?v=5');
  const appIndex = APP_HTML.indexOf('js/app.min.js?v=225');
  assert.ok(monthlyIndex >= 0 && reportIndex > monthlyIndex && appIndex > reportIndex);
  assert.match(APP_HTML, /js\/i18n\.min\.js\?v=60/);
  assert.equal((APP_HTML.match(/css\/styles-deferred\.min\.css\?v=\d+/g) || []).length, 2);
  assert.match(SW, /const CACHE = 'taskflow-v291'/);
  assert.match(SW, /'\.\/js\/monthly-review\.min\.js'/);
});

test('Monthly Review E2E is focused and part of the release matrix', () => {
  assert.match(E2E, /def monthly_review_checks\(/);
  assert.match(E2E, /\("monthly-review", monthly_review_checks\)/);
  assert.match(E2E, /args\.view == "monthly-review"/);
  assert.match(E2E, /E2E MONTHLY-REVIEW OK/);
});
