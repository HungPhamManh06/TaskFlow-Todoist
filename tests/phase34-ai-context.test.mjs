// TaskFlow — Phase 3A: Read-only AI Context Broker tests.
// Covers: today/week scopes via the canonical Today resolver, project/schedule
// scopes, privacy (reflections/mood OFF by default, keys omitted), secret-leak
// (allowlist), immutability (no state mutation), deterministic caps, today/week
// consistency, Google busy passthrough (no fetch), and scopeForIntent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const AIC = (await import('../js/ai-context.js')).default || (await import('../js/ai-context.js'));
const Clock = (await import('../js/clock.js')).default || (await import('../js/clock.js'));
const AI = (await import('../js/ai.js')).default || (await import('../js/ai.js'));
// Production order: ai.min.js loads before consumers — caps reuse kicks in.
globalThis.TaskFlowAI = AI;

const NOW = new Date(2026, 7, 19, 10, 0, 0); // Wed 2026-08-19
const YEAR = 2026, MONTH = 7; // August (0-based)
const NUM_DAYS = new Date(YEAR, MONTH + 1, 0).getDate(); // 31
const FIRST = new Date(YEAR, MONTH, 1);
const PLAN_START = new Date(FIRST.getTime() - FIRST.getDay() * 86400000); // Sun 2026-07-26
const NUM_WEEKS = Math.ceil((FIRST.getDay() + NUM_DAYS) / 7); // 6

function makeGrid() {
  const weeks = Array.from({ length: NUM_WEEKS }, (_, wi) => ({
    n: wi + 1,
    days: Array.from({ length: 7 }, (_, di) => ({ date: (di + 1) + '/' + (wi + 1), tasks: [] })),
  }));
  // dayIdx of NOW = 24 → weekIndex 3 (0-based), dayIndex 3 (Wed 19/8).
  const dayIdx = Math.round((new Date(YEAR, MONTH, NOW.getDate()) - new Date(PLAN_START.getFullYear(), PLAN_START.getMonth(), PLAN_START.getDate())) / 86400000);
  const weekIndex = Math.floor(dayIdx / 7);
  const dayIndex = dayIdx % 7;
  return { weeks, dayIdx, weekIndex, dayIndex };
}

function seedToday(weeks, weekIndex, dayIndex) {
  const day = weeks[weekIndex].days[dayIndex];
  day.tasks.push({ uid: 'task-a', text: 'Task A', done: false, kind: 'priority', estimatedMinutes: 60 });
  day.tasks.push({ uid: 'task-b', text: 'Task B', done: true, estimatedMinutes: 30 });
  return day;
}

function baseOpts(extra) {
  const { weeks, weekIndex, dayIndex } = makeGrid();
  return Object.assign({
    state: { weeks, habits: [], reflections: {} },
    now: NOW,
    today: '2026-08-19',
    planStart: PLAN_START,
    numDays: NUM_DAYS,
    year: YEAR,
    month: MONTH,
    resolveTodayCell: Clock.resolveTodayCell,
    timeblocks: { blocks: [] },
    busy: [],
  }, extra, { _seed: { weekIndex, dayIndex } });
}

/* ---------- TODAY ---------- */
test('today scope: canonical date, UIDs, done states, timeblock + busy included', () => {
  const o = baseOpts();
  seedToday(o.state.weeks, o._seed.weekIndex, o._seed.dayIndex);
  o.timeblocks.blocks.push({ id: 'blk-1', taskUid: 'task-a', date: '2026-08-19', start: '09:00', end: '10:00', status: 'planned' });
  o.busy.push({ start: '2026-08-19T13:00:00Z', end: '2026-08-19T14:00:00Z' });
  const ctx = AIC.build({ scope: 'today', ...o });
  assert.strictEqual(ctx.scope, 'today');
  assert.strictEqual(ctx.date, '2026-08-19');
  assert.deepEqual(ctx.tasks.map((t) => t.uid), ['task-a', 'task-b']);
  assert.strictEqual(ctx.tasks[0].done, false);
  assert.strictEqual(ctx.tasks[1].done, true);
  assert.strictEqual(ctx.tasks[0].priority, 1);
  assert.strictEqual(ctx.tasks[0].duration, 60);
  assert.strictEqual(ctx.timeblocks.length, 1);
  assert.strictEqual(ctx.timeblocks[0].start, '09:00');
  assert.strictEqual(ctx.timeblocks[0].end, '10:00');
  assert.strictEqual(ctx.busy.length, 1);
  assert.strictEqual(ctx.busy[0].start, '2026-08-19T13:00:00Z');
});

test('today scope: task allowlist only — no UI-only or secret fields', () => {
  const o = baseOpts();
  seedToday(o.state.weeks, o._seed.weekIndex, o._seed.dayIndex);
  o.state.weeks[o._seed.weekIndex].days[o._seed.dayIndex].tasks[0].estimatedMinutes = 90;
  const ctx = AIC.build({ scope: 'today', ...o });
  const keys = Object.keys(ctx.tasks[0]).sort();
  assert.deepEqual(keys, ['deadline', 'done', 'duration', 'energy', 'priority', 'projectId', 'text', 'uid', 'contexts'].sort());
});

/* ---------- WEEK ---------- */
test('week scope: only the intended week, no unrelated month history', () => {
  const o = baseOpts();
  seedToday(o.state.weeks, o._seed.weekIndex, o._seed.dayIndex);
  // unrelated history: previous week + next week + month edges
  o.state.weeks[0].days[0].tasks.push({ uid: 'old-1', text: 'prev month', done: false });
  o.state.weeks[1].days[2].tasks.push({ uid: 'old-2', text: 'last week', done: false });
  o.state.weeks[5].days[6].tasks.push({ uid: 'next-1', text: 'next month', done: false });
  const ctx = AIC.build({ scope: 'week', ...o });
  assert.strictEqual(ctx.scope, 'week');
  assert.strictEqual(ctx.weekStart, '2026-08-16');
  assert.strictEqual(ctx.weekEnd, '2026-08-22');
  assert.strictEqual(ctx.days.length, 7);
  const allUids = ctx.days.flatMap((d) => d.tasks.map((t) => t.uid));
  assert.deepEqual(allUids, ['task-a', 'task-b']);
  assert.ok(!allUids.includes('old-1') && !allUids.includes('old-2') && !allUids.includes('next-1'));
  const day19 = ctx.days.find((d) => d.date === '2026-08-19');
  assert.deepEqual(day19.tasks.map((t) => t.uid), ['task-a', 'task-b']);
  assert.deepEqual(day19.tasks.map((t) => [t.text, t.done]), [['Task A', false], ['Task B', true]]);
});

/* ---------- TODAY/WEEK CONSISTENCY ---------- */
test('today task UID set equals week current-day task UID set (same canonical day)', () => {
  const o = baseOpts();
  seedToday(o.state.weeks, o._seed.weekIndex, o._seed.dayIndex);
  const today = AIC.build({ scope: 'today', ...o });
  const week = AIC.build({ scope: 'week', ...o });
  const day19 = week.days.find((d) => d.date === today.date);
  assert.deepEqual(day19.tasks.map((t) => t.uid).sort(), today.tasks.map((t) => t.uid).sort());
});

/* ---------- PROJECT / SCHEDULE ---------- */
test('project scope: allowlisted projects + milestones (id, title, status, progress, milestone count)', () => {
  const o = baseOpts({
    projects: { version: 1, projects: [
      { id: 'p1', title: 'Project 1', status: 'active', progress: 40, secret: 'leak',
        milestones: [
          { id: 'm1', title: 'M1', status: 'active', targetDate: '2026-09-01', notes: 'nope' },
          { id: 'm2', title: 'M2', status: 'completed', targetDate: '2026-08-01' },
        ] },
      { id: 'p2', title: 'Project 2', status: 'archived', progress: 100, milestones: [] },
    ] },
  });
  const ctx = AIC.build({ scope: 'project', ...o });
  assert.deepEqual(ctx.projects.map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(ctx.projects[0], {
    id: 'p1', title: 'Project 1', status: 'active', progress: 40, milestones: 2,
  });
  assert.strictEqual(ctx.projects[0].secret, undefined);
  assert.deepEqual(ctx.milestones[0], {
    id: 'm1', projectId: 'p1', title: 'M1', status: 'active', targetDate: '2026-09-01',
  });
  assert.strictEqual(ctx.milestones[0].notes, undefined);
  assert.strictEqual(ctx.milestones[1].projectId, 'p1');
});

test('project scope: projectId filter keeps only that project + its milestones', () => {
  const o = baseOpts({
    projects: { version: 1, projects: [
      { id: 'p1', title: 'P1', milestones: [{ id: 'm1', title: 'M1' }] },
      { id: 'p2', title: 'P2', milestones: [{ id: 'm2', title: 'M2' }] },
    ] },
  });
  const ctx = AIC.build({ scope: 'project', projectId: 'p2', ...o });
  assert.deepEqual(ctx.projects.map((p) => p.id), ['p2']);
  assert.deepEqual(ctx.milestones.map((m) => m.id), ['m2']);
});

test('schedule scope: timeblocks (range-filterable) + busy intervals', () => {
  const o = baseOpts({
    timeblocks: { blocks: [
      { id: 'b1', taskUid: 't1', date: '2026-08-19', start: '09:00', end: '10:00', status: 'planned' },
      { id: 'b2', taskUid: 't2', date: '2026-08-21', start: '14:00', end: '15:00', status: 'completed' },
      { id: 'b3', taskUid: 't3', date: '2026-09-05', start: '08:00', end: '09:00', status: 'planned' },
    ] },
    busy: [{ start: '2026-08-19T13:30:00Z', end: '2026-08-19T14:30:00Z' }],
  });
  const all = AIC.build({ scope: 'schedule', ...o });
  assert.strictEqual(all.timeblocks.length, 3);
  assert.deepEqual(all.busy[0], { start: '2026-08-19T13:30:00Z', end: '2026-08-19T14:30:00Z' });
  const ranged = AIC.build({ scope: 'schedule', from: '2026-08-16', to: '2026-08-22', ...o });
  assert.deepEqual(ranged.timeblocks.map((b) => b.id), ['b1', 'b2']);
});

/* ---------- GOOGLE BUSY ---------- */
test('google busy: cached intervals pass through today + schedule when schedule permission on', () => {
  const o = baseOpts({ busy: [{ start: '2026-08-19T13:30:00Z', end: '2026-08-19T14:30:00Z' }] });
  seedToday(o.state.weeks, o._seed.weekIndex, o._seed.dayIndex);
  const today = AIC.build({ scope: 'today', ...o });
  const sched = AIC.build({ scope: 'schedule', ...o });
  assert.deepEqual(today.busy, [{ start: '2026-08-19T13:30:00Z', end: '2026-08-19T14:30:00Z' }]);
  assert.deepEqual(sched.busy, [{ start: '2026-08-19T13:30:00Z', end: '2026-08-19T14:30:00Z' }]);
  const denied = AIC.build({ scope: 'today', permissions: { schedule: false }, ...o });
  assert.deepEqual(denied.busy, []);
  assert.deepEqual(denied.timeblocks, []);
});

/* ---------- PRIVACY (reflections/mood) ---------- */
test('reflections/mood OFF by default: keys omitted entirely, content never serialized', () => {
  const o = baseOpts({
    reflections: [{ date: '2026-08-18', text: 'Private reflection content' }],
    mood: { '2026-08-18': 3 },
    state: Object.assign(baseOpts().state, {
      reflections: { weeks: [['Private reflection content']], overview: ['Private reflection content'] },
    }),
  });
  ['today', 'week', 'project', 'schedule', 'overview'].forEach((scope) => {
    const ctx = AIC.build({ scope, ...o });
    const json = JSON.stringify(ctx);
    assert.ok(!json.includes('Private reflection content'), scope + ' must not leak reflections');
    assert.ok(!json.includes('reflections'), scope + ' must omit the reflections key');
    assert.ok(!json.includes('mood'), scope + ' must omit the mood key');
  });
  assert.strictEqual(AIC.DEFAULT_PERMISSIONS.reflections, false);
  assert.strictEqual(AIC.DEFAULT_PERMISSIONS.mood, false);
});

test('reflections enabled: included in overview within caps, text capped', () => {
  const o = baseOpts({
    permissions: { reflections: true },
    reflections: [{ date: '2026-08-18', text: 'Private reflection content'.repeat(30) }],
  });
  const ctx = AIC.build({ scope: 'overview', ...o });
  assert.strictEqual(ctx.reflections.length, 1);
  assert.strictEqual(ctx.reflections[0].date, '2026-08-18');
  assert.strictEqual(ctx.reflections[0].text.length, 300, 'reflection text cap 300');
  assert.ok(ctx.reflections[0].text.startsWith('Private reflection content'));
});

test('reflections: derived from state.reflections (weeks grid + overview) when enabled', () => {
  const o = baseOpts({
    permissions: { reflections: true },
    reflections: undefined,
    state: Object.assign(baseOpts().state, {
      reflections: { weeks: [[null, 'grid entry']], overview: ['overview entry'] },
    }),
  });
  const ctx = AIC.build({ scope: 'overview', ...o });
  const texts = ctx.reflections.map((r) => r.text);
  assert.ok(texts.includes('grid entry'), 'grid week reflection derived');
  assert.ok(texts.includes('overview entry'), 'overview reflection derived');
  assert.ok(ctx.reflections.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)), 'dates normalized to YYYY-MM-DD');
});

test('mood enabled: minimal {date, value} only, from map or array, no interpretation', () => {
  const o = baseOpts({
    permissions: { mood: true },
    mood: { '2026-8-18': 3, '2026-08-19': 5, 'not-a-date': 1, '2026-08-19': 4 },
  });
  const ctx = AIC.build({ scope: 'overview', ...o });
  assert.deepEqual(ctx.mood, [{ date: '2026-08-18', value: 3 }, { date: '2026-08-19', value: 4 }]);
  const arr = AIC.build({ scope: 'overview', ...o, permissions: { mood: true }, mood: [{ date: '2026-08-19', value: 2 }] });
  assert.deepEqual(arr.mood, [{ date: '2026-08-19', value: 2 }]);
});

/* ---------- SECRET LEAK ---------- */
test('secret leak: planted tokens/keys never appear in any scope serialization', () => {
  const SECRETS = [
    'leak-planner-token-secret',
    'leak-jwt-secret',
    'leak-google-refresh-token-secret',
    'leak-google-access-token',
    'leak-AI-secret-key',
    'leak-password',
  ];
  const o = baseOpts();
  seedToday(o.state.weeks, o._seed.weekIndex, o._seed.dayIndex);
  // plant everywhere a secret could sit
  o.state['planner-token-secret'] = SECRETS[0];
  o.state.auth = { password: SECRETS[5], email: 'leak-email@example.com' };
  o.state.backup = 'leak-backup-blob';
  o.state.syncMeta = { lastSync: 'leak-sync-meta' };
  o.state.weeks[o._seed.weekIndex].days[o._seed.dayIndex].tasks[0].token = SECRETS[1];
  o.state.weeks[o._seed.weekIndex].days[o._seed.dayIndex].tasks[0].authorization = 'Bearer ' + SECRETS[1];
  o.projects = { version: 1, projects: [
    { id: 'p1', title: 'P', oauthAccessToken: SECRETS[3], refreshToken: SECRETS[2], AI_API_KEY: SECRETS[4],
      milestones: [{ id: 'm1', title: 'M', refreshToken: SECRETS[2] }] },
  ] };
  o.timeblocks = { blocks: [{ id: 'b1', taskUid: 'task-a', date: '2026-08-19', start: '09:00', end: '10:00', token: SECRETS[0] }] };
  o.busy = [{ start: '2026-08-19T13:00:00Z', end: '2026-08-19T14:00:00Z', summary: SECRETS[2], description: SECRETS[4] }];
  o.habits = [{ id: 'h1', name: 'H', secretKey: SECRETS[4] }];
  o.reflections = [{ date: 'not-a-date', text: SECRETS[0] }];
  o.mood = { 'leak-AI-secret-key': 5, '2026-08-19': 3 };
  o.state.habits = o.habits;

  const all = ['today', 'week', 'project', 'schedule', 'overview'].map((scope) =>
    JSON.stringify(AIC.build({ scope, permissions: { reflections: true, mood: true }, ...o }))).join('');
  SECRETS.forEach((s) => {
    assert.ok(!all.includes(s), 'serialized context must not contain ' + s);
  });
  assert.ok(!all.includes('leak-email@example.com'));
  assert.ok(!all.includes('leak-backup-blob'));
  assert.ok(!all.includes('leak-sync-meta'));
});

/* ---------- IMMUTABILITY ---------- */
test('immutability: all scopes never mutate state/stores/inputs', () => {
  const o = baseOpts();
  seedToday(o.state.weeks, o._seed.weekIndex, o._seed.dayIndex);
  o.projects = { version: 1, projects: [{ id: 'p1', title: 'P', status: 'active', progress: 10, milestones: [{ id: 'm1', title: 'M' }] }] };
  o.timeblocks.blocks.push({ id: 'b1', taskUid: 'task-a', date: '2026-08-19', start: '09:00', end: '10:00', status: 'planned' });
  o.busy = [{ start: '2026-08-19T13:00:00Z', end: '2026-08-19T14:00:00Z' }];
  o.habits = [{ id: 'h1', name: 'H', target: 100 }];
  o.reflections = [{ date: '2026-08-18', text: 'r1' }];
  o.mood = { '2026-08-18': 3 };
  o.state.habits = o.habits;
  const snap = () => JSON.stringify({ state: o.state, projects: o.projects, timeblocks: o.timeblocks, busy: o.busy, habits: o.habits, reflections: o.reflections, mood: o.mood });
  const before = snap();
  ['today', 'week', 'project', 'schedule', 'overview'].forEach((scope) => {
    AIC.build({ scope, permissions: { reflections: true, mood: true }, ...o });
    AIC.build({ scope, ...o });
  });
  assert.strictEqual(snap(), before, 'no mutation after all builds');
});

/* ---------- CAPS (deterministic truncation) ---------- */
test('caps: tasks today capped at 60 (grid order first-N), week capped at 100 total', () => {
  const o = baseOpts();
  const day = seedToday(o.state.weeks, o._seed.weekIndex, o._seed.dayIndex);
  for (let i = 0; i < 70; i++) day.tasks.push({ uid: 'extra-' + i, text: 'x' + i, done: false });
  const ctx = AIC.build({ scope: 'today', ...o });
  assert.strictEqual(ctx.tasks.length, 60, 'today tasks cap 60 (reused from TaskFlowAI.ARRAY_CAPS.tasks)');
  assert.strictEqual(ctx.tasks[0].uid, 'task-a');
  assert.strictEqual(ctx.tasks[59].uid, 'extra-57');
  // week: 5 days x 30 tasks = 150 → total 100, chronological
  for (let di = 0; di < 7; di++) {
    for (let i = 0; i < 30; i++) o.state.weeks[o._seed.weekIndex].days[di].tasks.push({ uid: 'w' + di + '-' + i, text: 't', done: false });
  }
  const week = AIC.build({ scope: 'week', ...o });
  const total = week.days.reduce((n, d) => n + d.tasks.length, 0);
  assert.strictEqual(total, 100, 'week tasks cap 100 total');
  assert.strictEqual(week.days[0].tasks[0].uid, 'w0-0');
  assert.strictEqual(AIC.effectiveCaps().weekTasks, 100);
});

test('caps: projects 20, milestones 60, timeblocks 80, busy 80, habits 30', () => {
  const o = baseOpts({
    projects: { version: 1, projects: Array.from({ length: 25 }, (_, i) => ({
      id: 'p' + i, title: 'P' + i, milestones: Array.from({ length: 5 }, (_, j) => ({ id: 'p' + i + '-m' + j, title: 'm' + j })),
    })) },
    timeblocks: { blocks: Array.from({ length: 90 }, (_, i) => ({ id: 'b' + i, taskUid: 't' + i, date: '2026-08-19', start: '09:00', end: '10:00', status: 'planned' })) },
    busy: Array.from({ length: 90 }, (_, i) => ({ start: '2026-08-19T1' + String(i % 10) + ':00:00Z', end: '2026-08-19T12:00:00Z' })),
    habits: Array.from({ length: 35 }, (_, i) => ({ id: 'h' + i, name: 'H' + i, target: 100 })),
  });
  o.state.habits = o.habits;
  const proj = AIC.build({ scope: 'project', ...o });
  assert.strictEqual(proj.projects.length, 20);
  assert.strictEqual(proj.milestones.length, 60);
  const sched = AIC.build({ scope: 'schedule', ...o });
  assert.strictEqual(sched.timeblocks.length, 80);
  assert.strictEqual(sched.busy.length, 80);
  const ov = AIC.build({ scope: 'overview', ...o });
  assert.strictEqual(ov.habits.length, 30);
});

test('caps: mood keeps most recent 90 by date; reflections most recent 12 by date', () => {
  const o = baseOpts({
    permissions: { reflections: true, mood: true },
    reflections: Array.from({ length: 20 }, (_, i) => ({ date: '2026-07-' + String(i + 1).padStart(2, '0'), text: 'r' + i })),
    mood: Array.from({ length: 100 }, (_, i) => ({ date: '2026-04-' + String((i % 28) + 1).padStart(2, '0'), value: i % 5 })),
  });
  const ctx = AIC.build({ scope: 'overview', ...o });
  assert.strictEqual(ctx.reflections.length, 12, 'reflections cap 12');
  assert.strictEqual(ctx.reflections[0].date, '2026-07-09', 'most recent 12 kept');
  assert.strictEqual(ctx.reflections[11].date, '2026-07-20');
  assert.strictEqual(ctx.mood.length, 90, 'mood cap 90');
  // mood: dates 2026-04-01..04-28 repeated; newest kept → 90 of the newest-sorted 100
  const sorted = ctx.mood.map((m) => m.date);
  assert.deepEqual(sorted, sorted.slice().sort((a, b) => (a < b ? -1 : 1)), 'deterministic ascending order');
});

/* ---------- DETERMINISM + GARBAGE INPUT ---------- */
test('deterministic: identical inputs → identical snapshots', () => {
  const o = baseOpts();
  seedToday(o.state.weeks, o._seed.weekIndex, o._seed.dayIndex);
  const a = AIC.build({ scope: 'today', ...o });
  const b = AIC.build({ scope: 'today', ...o });
  assert.deepEqual(a, b);
});

test('garbage inputs never throw; unknown scope → overview', () => {
  assert.doesNotThrow(() => AIC.build({}));
  assert.doesNotThrow(() => AIC.build(null));
  assert.doesNotThrow(() => AIC.build({ scope: 'bogus', state: null, timeblocks: 'x', busy: 'y', projects: 42 }));
  const ctx = AIC.build({ scope: 'bogus' });
  assert.strictEqual(ctx.scope, 'overview');
});

/* ---------- scopeForIntent ---------- */
test('scopeForIntent: deterministic small token map, no NLP; unknown → overview', () => {
  assert.strictEqual(AIC.scopeForIntent('today'), 'today');
  assert.strictEqual(AIC.scopeForIntent('week'), 'week');
  assert.strictEqual(AIC.scopeForIntent('project'), 'project');
  assert.strictEqual(AIC.scopeForIntent('schedule'), 'schedule');
  assert.strictEqual(AIC.scopeForIntent('show my week'), 'week');
  assert.strictEqual(AIC.scopeForIntent('lịch của tôi'), 'schedule');
  assert.strictEqual(AIC.scopeForIntent(''), 'overview');
  assert.strictEqual(AIC.scopeForIntent('random question'), 'overview');
  for (let i = 0; i < 3; i++) assert.strictEqual(AIC.scopeForIntent('week'), 'week', 'deterministic');
});

/* ---------- READ-ONLY / NO NETWORK surface ---------- */
test('module surface: build/scopeForIntent exported; no fetch/Gemini references', () => {
  assert.ok(AIC.build && typeof AIC.build === 'function');
  assert.ok(AIC.scopeForIntent && typeof AIC.scopeForIntent === 'function');
  assert.deepEqual(AIC.SCOPES, ['today', 'week', 'project', 'schedule', 'overview']);
  const src = readFileSync('js/ai-context.js', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/fetch\s*\(/.test(code), 'no network calls in broker');
  assert.ok(!/\/api\/ai\/(plan|chat)/.test(code), 'no Gemini endpoints in broker');
  assert.ok(!/localStorage/.test(code), 'broker does not touch localStorage');
  assert.ok(!/TaskFlowAI\.(callPlanner|applyProposal)/.test(code), 'no AI planner calls');
});