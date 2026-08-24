import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const Carry = require('../js/month-carryover.js');
const Storage = require('../js/storage.js');

const {
  nextMonth,
  normalizeCarrySelection,
  buildCarryPreview,
  applyCarryover,
  carryDialogHTML,
} = Carry;

const APP_HTML = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const APP_JS = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const MONTHLY_REVIEW_JS = readFileSync(new URL('../js/monthly-review.js', import.meta.url), 'utf8');
const I18N = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
const STYLES = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const DEFERRED = readFileSync(new URL('../css/styles-deferred.css', import.meta.url), 'utf8');
const SW = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const E2E = readFileSync(new URL('../scripts/e2e-frontend.py', import.meta.url), 'utf8');

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

const copy = {
  monthCarryTitle: 'Next month plan', monthCarryIntro: 'Choose what to carry.',
  monthCarryPillars: 'Pillars', monthCarryFocus: 'Monthly Focus', monthCarryHabits: 'Habits',
  monthCarryMetrics: 'Metrics', monthCarryPreview: 'Preview', monthCarryCreate: 'Create next month',
  monthCarryNothing: 'Nothing selected.', monthCarryWillCreate: 'Will create', monthCarryWillSkip: 'Will skip',
  monthCarryMissingHabit: 'Select the linked habit.', monthCarryMissingPillar: 'Select the pillar.',
};
const t = (key) => copy[key] || key;
const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('carryDialogHTML starts fully unselected and renders exact preview groups', () => {
  const preview = buildCarryPreview(sourceFixture(), destinationFixture(), fullSelection, { monthDays: 30 });
  const html = carryDialogHTML(sourceFixture(), fullSelection, preview, { t, esc });
  assert.match(html, /data-carry-kind="pillar" data-carry-id="p-body"/);
  assert.match(html, /data-carry-kind="habit" data-carry-id="h-gym"/);
  assert.match(html, /data-carry-kind="metric" data-carry-id="m-habit"/);
  assert.match(html, /data-testid="month-carry-preview"/);
  assert.match(html, /Will create/);
  const empty = carryDialogHTML(sourceFixture(), normalizeCarrySelection(null), buildCarryPreview(sourceFixture(), destinationFixture(), null), { t, esc });
  assert.doesNotMatch(empty, /checked/);
  assert.match(empty, /Nothing selected/);
});

test('carryDialogHTML renders dependency errors and disables apply', () => {
  const selection = { ...fullSelection, habitIds: [] };
  const preview = buildCarryPreview(sourceFixture(), destinationFixture(), selection, { monthDays: 30 });
  const html = carryDialogHTML(sourceFixture(), selection, preview, { t, esc });
  assert.match(html, /Select the linked habit/);
  assert.match(html, /data-action="month-carry-apply"[^>]*disabled/);
});

test('saveMonthState reports success and storage failure', () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = { setItem() {} };
  try {
    assert.equal(Storage.saveMonthState(2026, 8, { habits: [] }), true);
    globalThis.localStorage = { setItem() { throw new Error('quota'); } };
    assert.equal(Storage.saveMonthState(2026, 8, { habits: [] }), false);
  } finally {
    globalThis.localStorage = previous;
  }
});

test('P8 dialog, dispatcher, destination persistence and launcher are wired', () => {
  assert.match(APP_HTML, /id="monthCarryModal"[^>]*data-testid="month-carry-modal"/);
  assert.match(APP_JS, /TaskFlowMonthCarryover missing/);
  ['month-carry-open', 'month-carry-preview', 'month-carry-apply', 'month-carry-close'].forEach((action) => {
    assert.match(APP_JS, new RegExp(`act === '${action}'`));
  });
  assert.match(APP_JS, /saveMonthState\(monthCarryTarget\.year, monthCarryTarget\.month/);
  assert.match(APP_JS, /openMonth\(PLAN_MONTH \+ 1\)/);
  assert.match(MONTHLY_REVIEW_JS, /data-action="month-carry-open"/);
});

test('P8 has VI/EN copy and mirrored responsive styles', () => {
  ['monthCarryTitle', 'monthCarryPreview', 'monthCarryCreate', 'monthCarryMissingHabit'].forEach((key) => {
    assert.ok((I18N.match(new RegExp(`${key}:`, 'g')) || []).length >= 2, `missing ${key}`);
  });
  assert.match(STYLES, /\.month-carry-grid/);
  assert.match(DEFERRED, /\.month-carry-grid/);
  assert.match(STYLES, /@media[^{}]*\(max-width:\s*600px\)[\s\S]*?\.month-carry-grid/);
  assert.match(DEFERRED, /@media[^{}]*\(max-width:\s*600px\)[\s\S]*?\.month-carry-grid/);
});

test('P8 production assets load before monthly review/app and cache offline', () => {
  const carryIndex = APP_HTML.indexOf('js/month-carryover.min.js?v=1');
  const monthlyIndex = APP_HTML.indexOf('js/monthly-review.min.js?v=2');
  const appIndex = APP_HTML.indexOf('js/app.min.js?v=224');
  assert.ok(carryIndex >= 0 && monthlyIndex > carryIndex && appIndex > monthlyIndex);
  assert.match(APP_HTML, /js\/i18n\.min\.js\?v=59/);
  assert.match(APP_HTML, /js\/storage\.min\.js\?v=3/);
  assert.equal((APP_HTML.match(/css\/styles-deferred\.min\.css\?v=\d+/g) || []).length, 2);
  assert.match(SW, /const CACHE = 'taskflow-v286'/);
  assert.match(SW, /'\.\/js\/month-carryover\.min\.js'/);
});

test('P8 E2E is focused and part of the release matrix', () => {
  assert.match(E2E, /def month_carryover_checks\(/);
  assert.match(E2E, /\("month-carryover", month_carryover_checks\)/);
  assert.match(E2E, /args\.view == "month-carryover"/);
  assert.match(E2E, /E2E MONTH-CARRYOVER OK/);
});
