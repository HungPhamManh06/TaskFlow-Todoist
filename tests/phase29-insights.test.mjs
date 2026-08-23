// TaskFlow — V1.4.1 Actionable Insights tests.
// Sample thresholds, division-by-zero/missing metadata, old tasks, determinism,
// each of the 9 rules, privacy (no Reflection/Mood input), i18n VI/EN coverage,
// and production wiring (script tag, SW cache, report modal).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const TI = (await import('../js/insights.js')).default || (await import('../js/insights.js'));
const { computeInsights, MIN_SAMPLES } = TI;

const APP = readFileSync('app.html', 'utf8');
const SW = readFileSync('sw.js', 'utf8');
const I18N = readFileSync('js/i18n.js', 'utf8');
const REPORT = readFileSync('js/report-ui.js', 'utf8');

const NOW = new Date(2026, 1, 15); // Feb 15 2026
const BASE = { year: 2026, month: 1, numDays: 28, now: NOW };

function mk(uid, over) {
  return Object.assign({ uid, text: 't' + uid, done: false }, over || {});
}

/* ---------- empty / old / malformed ---------- */
test('empty input → no insights, no crash', () => {
  assert.deepEqual(computeInsights({ ...BASE, tasks: [], habits: [], timeblocks: [], projects: [] }), []);
  assert.deepEqual(computeInsights(BASE), []);
});

test('old tasks (uid/text/done only) stay valid → no insight, no crash', () => {
  const old = [mk('a'), mk('b'), mk('c', { done: true })];
  assert.deepEqual(computeInsights({ ...BASE, tasks: old, prevTasks: [], habits: [], timeblocks: [], projects: [] }), []);
});

test('missing metadata (no est/energy/doneAt) → no insight', () => {
  const tasks = Array.from({ length: 10 }, (_, i) => mk('m' + i, { done: i % 2 === 0 }));
  assert.deepEqual(computeInsights({ ...BASE, tasks, prevTasks: [], habits: [], timeblocks: [], projects: [] }), []);
});

test('deterministic: same input → same proposal', () => {
  const tasks = [
    mk('a', { estimatedMinutes: 120 }), mk('b', { estimatedMinutes: 120 }), mk('c', { estimatedMinutes: 120 }),
    mk('d', { estimatedMinutes: 30, done: true }), mk('e', { estimatedMinutes: 30, done: true }), mk('f', { estimatedMinutes: 30, done: true }),
  ];
  const deps = { ...BASE, tasks, prevTasks: [], habits: [], timeblocks: [], projects: [] };
  assert.deepEqual(computeInsights(deps), computeInsights(deps));
});

/* ---------- sample thresholds ---------- */
test('durationCompletion below sample → none', () => {
  const t = [mk('a', { estimatedMinutes: 120 }), mk('b', { estimatedMinutes: 120 }), mk('c', { estimatedMinutes: 30, done: true }), mk('d', { estimatedMinutes: 30, done: true })];
  assert.equal(computeInsights({ ...BASE, tasks: t }).some((i) => i.id === 'duration_completion'), false);
});

test('repeatedOverdue below sample → none', () => {
  const t = [mk('a', { deadline: '2025-12-10' }), mk('b', { deadline: '2025-12-11' })];
  assert.equal(computeInsights({ ...BASE, tasks: t, prevTasks: [] }).some((i) => i.id === 'repeated_overdue'), false);
});

test('plannedCompleted below sample / no completed work → none', () => {
  const a = Array.from({ length: 4 }, (_, i) => mk('p' + i, { estimatedMinutes: 60 }));
  assert.equal(computeInsights({ ...BASE, tasks: a }).some((i) => i.id === 'planned_completed'), false);
  const b = Array.from({ length: 6 }, (_, i) => mk('q' + i, { estimatedMinutes: 60 })); // all open
  assert.equal(computeInsights({ ...BASE, tasks: b }).some((i) => i.id === 'planned_completed'), false);
});

test('focusCompletion below sample / low focus → none', () => {
  const done4 = Array.from({ length: 4 }, (_, i) => mk('f' + i, { done: true }));
  assert.equal(computeInsights({ ...BASE, tasks: done4, focusMinutes: 400 }).some((i) => i.id === 'focus_completion'), false);
  const done5 = Array.from({ length: 5 }, (_, i) => mk('g' + i, { done: true }));
  assert.equal(computeInsights({ ...BASE, tasks: done5, focusMinutes: 30 }).some((i) => i.id === 'focus_completion'), false);
});

test('habitConsistency below required history → none', () => {
  const habits = [{ id: 'h1', name: 'Gym', schedule: { type: 'daily' }, days: [], target: 100 }];
  const pp = () => ({ done: 0, required: 3, pct: 30 });
  const out = computeInsights({ ...BASE, habits, periodProgress: pp });
  assert.equal(out.some((i) => i.id === 'habit_consistency'), false);
});

test('overloadedWeekday below sample / no clear peak → none', () => {
  const blocks4 = Array.from({ length: 4 }, (_, i) => ({ id: 'b' + i, date: '2026-02-09', start: '09:00', end: '10:00' }));
  assert.equal(computeInsights({ ...BASE, timeblocks: blocks4 }).some((i) => i.id === 'overloaded_weekday'), false);
  const split = [
    ...Array.from({ length: 3 }, (_, i) => ({ id: 's' + i, date: '2026-02-09', start: '09:00', end: '10:00' })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: 's' + (i + 3), date: '2026-02-10', start: '09:00', end: '10:00' })),
  ];
  assert.equal(computeInsights({ ...BASE, timeblocks: split }).some((i) => i.id === 'overloaded_weekday'), false);
});

test('projectVelocity below sample / not lagging → none', () => {
  const small = [{ id: 'proj1', title: 'Small', status: 'active', milestones: [{ id: 'm1' }, { id: 'm2' }], startDate: '2026-01-01', targetDate: '2026-03-01' }];
  assert.equal(computeInsights({ ...BASE, projects: small, projectProgress: () => ({ pct: 10, done: 0, total: 2 }) }).some((i) => i.id === 'project_velocity'), false);
  const fine = [{ id: 'proj2', title: 'On track', status: 'active', milestones: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }], startDate: '2026-01-01', targetDate: '2026-03-01' }];
  assert.equal(computeInsights({ ...BASE, projects: fine, projectProgress: () => ({ pct: 80, done: 3, total: 3 }) }).some((i) => i.id === 'project_velocity'), false);
});

test('timeOfDay below sample / single hour → none', () => {
  const few = Array.from({ length: 4 }, (_, i) => mk('t' + i, { done: true, doneAt: '2026-02-03T19:15:00' }));
  assert.equal(computeInsights({ ...BASE, tasks: few }).some((i) => i.id === 'time_of_day'), false);
  const sameHour = Array.from({ length: 6 }, (_, i) => mk('u' + i, { done: true, doneAt: '2026-02-03T19:15:00' }));
  assert.equal(computeInsights({ ...BASE, tasks: sameHour }).some((i) => i.id === 'time_of_day'), false);
});

test('energyCompletion below sample / small gap → none', () => {
  const few = Array.from({ length: 4 }, (_, i) => mk('e' + i, { energy: 'low', done: true }));
  assert.equal(computeInsights({ ...BASE, tasks: few }).some((i) => i.id === 'energy_completion'), false);
  const even = [
    ...Array.from({ length: 4 }, (_, i) => mk('x' + i, { energy: 'low', done: i < 3 })),
    ...Array.from({ length: 4 }, (_, i) => mk('y' + i, { energy: 'high', done: i < 3 })), // same rate → gap 0
  ];
  assert.equal(computeInsights({ ...BASE, tasks: even }).some((i) => i.id === 'energy_completion'), false);
});

/* ---------- each rule fires on crafted data ---------- */
test('durationCompletion: long tasks lag → insight', () => {
  const t = [
    mk('a', { estimatedMinutes: 120 }), mk('b', { estimatedMinutes: 120 }), mk('c', { estimatedMinutes: 120 }),
    mk('d', { estimatedMinutes: 30, done: true }), mk('e', { estimatedMinutes: 30, done: true }), mk('f', { estimatedMinutes: 30, done: true }),
  ];
  const out = computeInsights({ ...BASE, tasks: t });
  const ins = out.find((i) => i.id === 'duration_completion');
  assert.ok(ins);
  assert.equal(ins.key, 'insightDurationCompletion');
  assert.equal(ins.actionKey, 'insightDurationCompletionAction');
});

test('repeatedOverdue: tasks overdue since last month → insight with n', () => {
  const t = Array.from({ length: 3 }, (_, i) => mk('r' + i, { deadline: '2025-12-10' }));
  const out = computeInsights({ ...BASE, tasks: t, prevTasks: [] });
  const ins = out.find((i) => i.id === 'repeated_overdue');
  assert.ok(ins);
  assert.equal(ins.params.n, 3);
});

test('plannedCompleted: heavy open work vs light done → insight with pct', () => {
  const t = [
    ...Array.from({ length: 5 }, (_, i) => mk('d' + i, { estimatedMinutes: 10, done: true })),
    mk('big', { estimatedMinutes: 300 }),
  ];
  const ins = computeInsights({ ...BASE, tasks: t }).find((i) => i.id === 'planned_completed');
  assert.ok(ins);
  assert.ok(ins.params.pct >= 80);
});

test('focusCompletion: high focus per completed task → insight with min', () => {
  const t = Array.from({ length: 5 }, (_, i) => mk('f' + i, { done: true }));
  const ins = computeInsights({ ...BASE, tasks: t, focusMinutes: 600 }).find((i) => i.id === 'focus_completion');
  assert.ok(ins);
  assert.equal(ins.params.min, 120);
});

test('habitConsistency: habit below 50% with history → insight', () => {
  const habits = [{ id: 'h1', name: 'Gym', schedule: { type: 'daily' }, days: [], target: 100 }];
  const pp = () => ({ done: 0, required: 10, pct: 30 });
  const ins = computeInsights({ ...BASE, habits, periodProgress: pp }).find((i) => i.id === 'habit_consistency');
  assert.ok(ins);
  assert.equal(ins.params.name, 'Gym');
  assert.equal(ins.params.pct, 30);
});

test('overloadedWeekday: Monday overloaded → insight with day label', () => {
  const blocks = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: 'b' + i, date: '2026-02-09', start: '09:00', end: '10:00' })),
    { id: 'tue', date: '2026-02-10', start: '09:00', end: '10:00' },
  ];
  const wl = (di) => ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][di];
  const ins = computeInsights({ ...BASE, timeblocks: blocks, weekdayLabel: wl }).find((i) => i.id === 'overloaded_weekday');
  assert.ok(ins);
  assert.equal(ins.params.day, 'Mo');
});

test('projectVelocity: lagging project → insight with pct/exp', () => {
  const projects = [{ id: 'proj', title: 'Backend', status: 'active', milestones: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }], startDate: '2026-01-01', targetDate: '2026-03-01' }];
  const ins = computeInsights({ ...BASE, projects, projectProgress: () => ({ pct: 10, done: 0, total: 3 }) }).find((i) => i.id === 'project_velocity');
  assert.ok(ins);
  assert.equal(ins.params.name, 'Backend');
  assert.equal(ins.params.pct, 10);
  assert.ok(ins.params.exp > 50); // ~76% of the window elapsed
});

test('timeOfDay: clustered completion hour → insight with time', () => {
  const t = [
    ...Array.from({ length: 5 }, (_, i) => mk('n' + i, { done: true, doneAt: '2026-02-03T19:15:00' })),
    mk('early', { done: true, doneAt: '2026-02-04T08:00:00' }),
  ];
  const ins = computeInsights({ ...BASE, tasks: t }).find((i) => i.id === 'time_of_day');
  assert.ok(ins);
  assert.equal(ins.params.time, '19:00');
});

test('energyCompletion: high-energy tasks underperform → insight', () => {
  const t = [
    ...Array.from({ length: 4 }, (_, i) => mk('lo' + i, { energy: 'low', done: true })),
    ...Array.from({ length: 4 }, (_, i) => mk('hi' + i, { energy: 'high' })),
  ];
  const el = (l) => ({ low: 'Low', medium: 'Medium', high: 'High' })[l];
  const ins = computeInsights({ ...BASE, tasks: t, energyLabel: el }).find((i) => i.id === 'energy_completion');
  assert.ok(ins);
  assert.equal(ins.params.energy, 'High');
});

/* ---------- max 5 in UI (report slices) ---------- */
test('report-ui slices to at most 5 insights', () => {
  assert.match(REPORT, /ins\.slice\(0, 5\)/);
});

/* ---------- privacy ---------- */
test('privacy: reflection/mood-like task fields are ignored (no crash, no leak)', () => {
  const t = Array.from({ length: 8 }, (_, i) => mk('z' + i, { notes: 'private reflection text', done: i % 2 === 0 }));
  const out = computeInsights({ ...BASE, tasks: t, prevTasks: [], habits: [], timeblocks: [], projects: [] });
  assert.ok(Array.isArray(out));
  assert.equal(out.some((i) => i.key && i.key.indexOf('Reflection') >= 0), false);
});

/* ---------- i18n coverage ---------- */
test('i18n: every insight key exists in both VI and EN', () => {
  const keys = ['insightsTitle', 'insightsEmpty',
    'insightDurationCompletion', 'insightDurationCompletionAction',
    'insightRepeatedOverdue', 'insightRepeatedOverdueAction',
    'insightPlannedCompleted', 'insightPlannedCompletedAction',
    'insightFocusCompletion', 'insightFocusCompletionAction',
    'insightHabitConsistency', 'insightHabitConsistencyAction',
    'insightOverloadedWeekday', 'insightOverloadedWeekdayAction',
    'insightProjectVelocity', 'insightProjectVelocityAction',
    'insightTimeOfDay', 'insightTimeOfDayAction',
    'insightEnergyCompletion', 'insightEnergyCompletionAction'];
  const viIdx = I18N.indexOf('vi: {');
  const enIdx = I18N.indexOf('en: {');
  for (const k of keys) {
    assert.ok(I18N.indexOf(k + ':') > viIdx && I18N.indexOf(k + ':') < enIdx, `VI missing ${k}`);
    assert.ok(I18N.lastIndexOf(k + ':') > enIdx, `EN missing ${k}`);
  }
});

/* ---------- production wiring ---------- */
test('wiring: script tag, SW precache + cache bump, report modal hook', () => {
  assert.match(APP, /js\/insights\.min\.js\?v=1/);
  assert.match(SW, /'\.\/js\/insights\.min\.js'/);
  assert.match(SW, /const CACHE = 'taskflow-v281'/);
  assert.match(REPORT, /data-testid="report-insights"/);
  assert.ok(existsSync('js/insights.min.js'), 'insights.min.js must exist');
  assert.ok(existsSync('js/report-ui.min.js'), 'report-ui.min.js must exist');
});

/* ---------- nested month state (weeks[].days[].tasks) ---------- */
test('flattenTasks: nested weeks/days plus flat list', () => {
  const st = {
    tasks: [mk('flat')],
    weeks: [
      { days: [{ tasks: [mk('a', { estimatedMinutes: 30 }), mk('b', { estimatedMinutes: 60 })] }, { tasks: [mk('c', { done: true })] }] },
      { days: [{ tasks: [] }] },
    ],
  };
  const out = TI.flattenTasks(st);
  assert.equal(out.length, 4);
  assert.deepEqual(TI.flattenTasks(null), []);
  assert.deepEqual(TI.flattenTasks({}), []);
});

/* ---------- store-object normalization (real modules return {version, key: []}) ---------- */
test('store-object deps: {version, blocks} and {version, projects} are flattened', () => {
  const blocks = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: 'b' + i, date: '2026-02-09', start: '09:00', end: '10:00' })),
    { id: 'tue', date: '2026-02-10', start: '09:00', end: '10:00' },
  ];
  const projects = [{ id: 'proj', title: 'Backend', status: 'active', milestones: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }], startDate: '2026-01-01', targetDate: '2026-03-01' }];
  const wl = (di) => ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][di];
  const out = computeInsights({ ...BASE, timeblocks: { version: 1, blocks }, projects: { version: 1, projects }, weekdayLabel: wl, projectProgress: () => ({ pct: 10, done: 0, total: 3 }) });
  assert.ok(out.some((i) => i.id === 'overloaded_weekday'), 'blocks store must flatten');
  assert.ok(out.some((i) => i.id === 'project_velocity'), 'projects store must flatten');
});

/* ---------- min sample sizes are exported and sane ---------- */
test('MIN_SAMPLES: all rules covered, all >= 3', () => {
  const ids = ['durationCompletion', 'repeatedOverdue', 'plannedCompleted', 'focusCompletion', 'habitConsistency', 'overloadedWeekday', 'projectVelocity', 'timeOfDay', 'energyCompletion'];
  for (const id of ids) {
    assert.ok(Number.isInteger(MIN_SAMPLES[id]) && MIN_SAMPLES[id] >= 3, `${id} sample size`);
  }
});
