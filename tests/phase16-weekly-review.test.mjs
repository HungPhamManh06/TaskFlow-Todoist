import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  buildWeeklyReviewModel,
  weeklyReviewHTML,
  updateReviewField,
  setSaveStatus,
  scheduleSavedStatus,
} = WeeklyReview;

const I18N_JS = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
const STYLES = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const DEFERRED_STYLES = readFileSync(new URL('../css/styles-deferred.css', import.meta.url), 'utf8');
const APP_JS = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const APP_HTML = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const SW = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const E2E = readFileSync(new URL('../scripts/e2e-frontend.py', import.meta.url), 'utf8');

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

test('buildWeeklyReviewModel keeps legacy notes separate from the new record', () => {
  const state = {
    weeklyReviews: [{ best: 'New win' }],
    reflections: { weeks: [['Old win', '', 'Old gratitude', 'Old goals']] },
    weeks: [fullWeek],
    habits: [],
    pillars: [],
  };
  const model = buildWeeklyReviewModel(state, 0, {
    ...augustContext,
    focusMinutes: 30,
    legacyPrompts: ['Old Q1', 'Old Q2', 'Old Q3', 'Old Q4'],
  });
  assert.equal(model.review.best, 'New win');
  assert.deepEqual(model.legacy.map((item) => item.answer), ['Old win', 'Old gratitude', 'Old goals']);
  assert.deepEqual(state.reflections.weeks[0], ['Old win', '', 'Old gratitude', 'Old goals']);
});

test('updateReviewField edits only allowed fields and one priority', () => {
  const state = { weeklyReviews: [] };
  updateReviewField(state, 1, 'blocker', 'Meetings', null, '2026-08-11T12:00:00.000Z');
  updateReviewField(state, 1, 'priority', 'Ship P6', 2, '2026-08-11T12:01:00.000Z');
  assert.equal(state.weeklyReviews[1].blocker, 'Meetings');
  assert.equal(state.weeklyReviews[1].priorities[2], 'Ship P6');
  assert.equal(state.weeklyReviews[1].updatedAt, '2026-08-11T12:01:00.000Z');
  assert.equal(updateReviewField(state, 1, 'unknown', 'x', null, 'now'), null);
  assert.equal(updateReviewField(state, 1, 'priority', 'x', 3, 'now'), null);
});

test('save status helpers update the live region after the requested delay', async () => {
  const status = { textContent: '' };
  const previousDocument = globalThis.document;
  globalThis.document = { querySelector: () => status };
  try {
    setSaveStatus('Saving');
    assert.equal(status.textContent, 'Saving');
    await new Promise((resolve) => scheduleSavedStatus(() => {
      setSaveStatus('Saved');
      resolve();
    }, 5));
    assert.equal(status.textContent, 'Saved');
  } finally {
    globalThis.document = previousDocument;
  }
});

const copy = {
  weeklyReviewTitle: 'Week {n} · Review',
  weeklyReviewSummary: 'Weekly summary',
  weeklyReviewTasks: 'Tasks',
  weeklyReviewHabits: 'Habits',
  weeklyReviewFocus: 'Focus',
  weeklyReviewPillars: 'Pillar progress',
  weeklyReviewNoPillars: 'No scorable pillars.',
  weeklyReviewBest: 'Best thing this week?',
  weeklyReviewBlocker: 'What got in my way?',
  weeklyReviewLearned: 'What did I learn?',
  weeklyReviewChange: 'What should I change?',
  weeklyReviewPriorities: 'Next-week priorities',
  weeklyReviewPriority: 'Priority {n}',
  weeklyReviewSaving: 'Saving…',
  weeklyReviewSaved: 'Saved',
  weeklyReviewLegacy: 'Previous reflection notes',
  weeklyReviewTaskValue: '{done}/{total} · {pct}%',
  weeklyReviewHabitValue: '{done}/{total} · {pct}%',
};

function tr(key, vars = {}) {
  return String(copy[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

test('weeklyReviewHTML renders semantic summary, pillars, fields and legacy notes', () => {
  const model = {
    weekIndex: 0,
    weekNumber: 1,
    review: normalizeReview({ best: '<Win>', priorities: ['A', 'B', 'C'] }),
    summary: { tasksDone: 2, tasksTotal: 4, tasksPct: 50, habitsDone: 3, habitsTotal: 5, habitsPct: 60, focusMinutes: 90 },
    pillars: [{ id: 'work', name: 'Work', icon: 'W', pct: 75, metricCount: 2 }],
    legacy: [{ prompt: 'Old Q', answer: 'Old answer' }],
  };
  const html = weeklyReviewHTML(model, { t: tr, esc, formatFocusTime: (minutes) => `${minutes}m` });
  assert.match(html, /data-testid="weekly-review"/);
  assert.match(html, /data-testid="weekly-review-summary"/);
  assert.match(html, /data-testid="weekly-review-pillar"/);
  assert.match(html, /data-week-review-field="best"/);
  assert.match(html, /data-week-review-field="blocker"/);
  assert.match(html, /data-week-review-field="learned"/);
  assert.match(html, /data-week-review-field="change"/);
  assert.equal((html.match(/data-week-review-field="priority"/g) || []).length, 3);
  assert.match(html, /<details[^>]*data-testid="weekly-review-legacy"/);
  assert.match(html, /aria-valuenow="75"/);
  assert.match(html, /&lt;Win&gt;/);
});

test('weeklyReviewHTML keeps the review form available for an empty week', () => {
  const html = weeklyReviewHTML({
    weekIndex: 2,
    weekNumber: 3,
    review: emptyReview(),
    summary: { tasksDone: 0, tasksTotal: 0, tasksPct: 0, habitsDone: 0, habitsTotal: 0, habitsPct: 0, focusMinutes: 0 },
    pillars: [],
    legacy: [],
  }, { t: tr, esc, formatFocusTime: () => '0m' });
  assert.match(html, /No scorable pillars/);
  assert.equal((html.match(/<textarea/g) || []).length, 4);
  assert.equal((html.match(/data-week-review-field="priority"/g) || []).length, 3);
});

test('Weekly Review copy exists in Vietnamese and English', () => {
  const keys = [
    'weeklyReviewTitle', 'weeklyReviewSummary', 'weeklyReviewTasks', 'weeklyReviewHabits',
    'weeklyReviewFocus', 'weeklyReviewPillars', 'weeklyReviewNoPillars', 'weeklyReviewBest',
    'weeklyReviewBlocker', 'weeklyReviewLearned', 'weeklyReviewChange', 'weeklyReviewPriorities',
    'weeklyReviewPriority', 'weeklyReviewSaving', 'weeklyReviewSaved', 'weeklyReviewLegacy',
    'weeklyReviewTaskValue', 'weeklyReviewHabitValue',
  ];
  keys.forEach((key) => {
    assert.equal((I18N_JS.match(new RegExp(`${key}:`, 'g')) || []).length, 2, `${key} must exist in vi and en`);
  });
});

test('Weekly Review responsive styles are mirrored in both source stylesheets', () => {
  const selectors = [
    '.weekly-review-card', '.weekly-review-summary-grid', '.weekly-review-summary-cell',
    '.weekly-review-pillars', '.weekly-review-pillar', '.weekly-review-pillar-bar',
    '.weekly-review-fields', '.weekly-review-field', '.weekly-review-textarea',
    '.weekly-review-priorities', '.weekly-review-priority', '.weekly-review-status',
    '.weekly-review-legacy',
  ];
  selectors.forEach((selector) => {
    assert.ok(STYLES.includes(selector), `${selector} missing from styles.css`);
    assert.ok(DEFERRED_STYLES.includes(selector), `${selector} missing from styles-deferred.css`);
  });
  assert.match(STYLES, /@media[^{}]*\(max-width:\s*600px\)[\s\S]*?\.weekly-review-fields/);
  assert.match(DEFERRED_STYLES, /@media[^{}]*\(max-width:\s*600px\)[\s\S]*?\.weekly-review-fields/);
});

test('app state creates, migrates and saves additive weeklyReviews', () => {
  assert.match(APP_JS, /TaskFlowWeeklyReview missing/);
  assert.ok((APP_JS.match(/weeklyReviews:\s*Array\.from\(\{ length: NUM_WEEKS \}/g) || []).length >= 2);
  assert.match(APP_JS, /ensureWeeklyReviews\(s, NUM_WEEKS\)/);
  assert.match(APP_JS, /ensureWeeklyReviews\(state, NUM_WEEKS\)/);
});

test('Week view composes Weekly Review and delegated autosave editing', () => {
  assert.match(APP_JS, /buildWeeklyReviewModel\(/);
  assert.match(APP_JS, /weeklyReviewHTML\(/);
  assert.match(APP_JS, /dataset\.weekReviewField/);
  assert.match(APP_JS, /updateReviewField\(/);
  assert.match(APP_JS, /weeklyReviewSaving/);
  assert.match(APP_JS, /weeklyReviewSaved/);
  assert.doesNotMatch(APP_JS, /week-reflection-card[^\n]*reflectionHTML\('w'/);
});

test('Weekly Review production asset loads before app and is cached offline', () => {
  const reviewIndex = APP_HTML.indexOf('js/weekly-review.min.js?v=1');
  const appIndex = APP_HTML.indexOf('js/app.min.js?v=197');
  assert.ok(reviewIndex >= 0);
  assert.ok(appIndex > reviewIndex);
  assert.match(APP_HTML, /js\/i18n\.min\.js\?v=27/);
  assert.equal((APP_HTML.match(/css\/styles-deferred\.min\.css\?v=\d+/g) || []).length, 2);
  assert.match(SW, /const CACHE = 'taskflow-v243'/);
  assert.match(SW, /'\.\/js\/weekly-review\.min\.js'/);
});

test('Weekly Review E2E scenario is focused and part of the release matrix', () => {
  assert.match(E2E, /def weekly_review_checks\(/);
  assert.match(E2E, /"weekly-review"/);
  assert.match(E2E, /\("weekly-review", weekly_review_checks\)/);
  assert.match(E2E, /args\.view == "weekly-review"/);
  assert.match(E2E, /E2E WEEKLY-REVIEW OK/);
});
