// TaskFlow — V2.0 AI Copilot tests.
// Context builder (allowlist/caps/privacy), client schema + referential validation,
// conflict check (warn only), Apply pipeline via hooks, determinism, and production
// wiring (script tag, SW cache v221, plannerAi host, i18n VI/EN).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const AI = (await import('../js/ai.js')).default || (await import('../js/ai.js'));
const {
  buildContext, validateProposalLocal, conflictCheck, applyProposal,
  setConsent, getConsent, panelHTML, previewHTML, validDate,
} = AI;

const APP = readFileSync('app.html', 'utf8');
const SW = readFileSync('sw.js', 'utf8');
const I18N = readFileSync('js/i18n.js', 'utf8');
const AIJS = readFileSync('js/ai.js', 'utf8');

const TASK = { uid: 't1', text: 'Learn Spring Boot', estimatedMinutes: 90, kind: 'priority', deadline: '2026-03-01', energy: 'medium', contexts: ['ctx_home'], done: false };

function refs(tasks) {
  return { taskUids: new Set((tasks || []).map((t) => (typeof t === 'string' ? t : t.uid))) };
}

/* ---------- context builder: allowlist + caps + privacy ---------- */
test('buildContext strips unknown fields and caps arrays', () => {
  const ctx = buildContext({
    kind: 'plan_day', lang: 'vi', today: '2026-02-15',
    tasks: Array.from({ length: 100 }, (_, i) => ({ uid: 't' + i, text: 'x'.repeat(500), secret: 'leak' })),
    projects: [{ id: 'p1', title: 'P', secret: 'leak' }],
  });
  assert.strictEqual(ctx.kind, 'plan_day');
  assert.strictEqual(ctx.tasks.length, 60, 'cap tasks = 60');
  assert.ok(ctx.tasks.every((t) => t.secret === undefined), 'không leak field lạ');
  assert.ok(ctx.tasks.every((t) => t.text.length <= 160), 'cap text 160');
  assert.ok(ctx.tasks.every((t) => t.duration === 90 || t.duration === null));
  assert.deepEqual(ctx.projects[0].secret, undefined);
});

test('reflection/mood mặc định bị loại trừ; chỉ gửi khi allowSensitive', () => {
  const base = {
    kind: 'next_actions', lang: 'vi', today: '2026-02-15',
    tasks: [], projects: [], milestones: [], timeblocks: [], habits: [], busy: [], overdue: [],
    reflections: [{ date: '2026-02-14', text: 'private note' }],
    mood: [{ date: '2026-02-14', value: 3 }],
  };
  const off = buildContext({ ...base, allowSensitive: false });
  assert.strictEqual(off.reflections, undefined, 'không gửi reflection khi chưa opt-in');
  assert.strictEqual(off.mood, undefined);
  const on = buildContext({ ...base, allowSensitive: true });
  assert.strictEqual(on.reflections.length, 1);
  assert.strictEqual(on.reflections[0].text, 'private note');
  assert.strictEqual(on.mood.length, 1);
  assert.strictEqual(on.mood[0].value, 3);
});

test('consent không persist: getConsent trả bản sao, setConsent chỉ boolean', () => {
  const c = getConsent();
  assert.deepEqual(c, { tasks: true, projects: true, schedule: true, reflections: false, mood: false });
  c.reflections = true;
  assert.strictEqual(getConsent().reflections, false, 'bản sao không làm đổi state');
  setConsent({ reflections: true, tasks: 'yes' });
  assert.deepEqual(getConsent(), { tasks: true, projects: true, schedule: true, reflections: true, mood: false });
  setConsent({ reflections: false });
});

test('deterministic: cùng input → cùng context', () => {
  const a = buildContext({ kind: 'plan_day', lang: 'vi', today: '2026-02-15', tasks: [TASK], projects: [{ id: 'p1', title: 'P' }], milestones: [], timeblocks: [{ id: 'b1', taskUid: 't1', date: '2026-02-15', start: '09:00', end: '10:00', status: 'planned' }], habits: [{ name: 'H', target: 100 }], busy: [], overdue: [] });
  const b = buildContext({ kind: 'plan_day', lang: 'vi', today: '2026-02-15', tasks: [TASK], projects: [{ id: 'p1', title: 'P' }], milestones: [], timeblocks: [{ id: 'b1', taskUid: 't1', date: '2026-02-15', start: '09:00', end: '10:00', status: 'planned' }], habits: [{ name: 'H', target: 100 }], busy: [], overdue: [] });
  assert.deepEqual(a, b);
});

/* ---------- schema + referential validation ---------- */
test('validateProposalLocal: proposal hợp lệ', () => {
  const r = refs(['t1']);
  const ok = validateProposalLocal({
    summary: 'Plan',
    actions: [
      { type: 'schedule_task', taskUid: 't1', date: '2026-02-15', start: '09:00', duration: 60 },
      { type: 'reschedule_task', taskUid: 't1', option: 'tomorrow' },
      { type: 'next_action', text: 'Do X' },
    ],
  }, r);
  assert.deepEqual(ok, { ok: true, errors: [] });
});

test('validateProposalLocal: từ chối action lạ / task bịa / ngày-giờ-duration sai', () => {
  const r = refs(['t1']);
  assert.ok(!validateProposalLocal({ summary: 'x', actions: [{ type: 'delete_everything', taskUid: 't1' }] }, r).ok);
  assert.ok(!validateProposalLocal({ summary: 'x', actions: [{ type: 'schedule_task', taskUid: 'ghost', date: '2026-02-15', start: '09:00' }] }, r).ok, 'taskUid không có trong context');
  assert.ok(!validateProposalLocal({ summary: 'x', actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-13-40', start: '09:00' }] }, r).ok, 'ngày sai');
  assert.ok(!validateProposalLocal({ summary: 'x', actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-02-15', start: '25:99' }] }, r).ok, 'giờ sai');
  assert.ok(!validateProposalLocal({ summary: 'x', actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-02-15', start: '09:00', duration: 3 }] }, r).ok, 'duration < 5');
  assert.ok(!validateProposalLocal({ summary: 'x', actions: [{ type: 'reschedule_task', taskUid: 't1', option: 'never' }] }, r).ok, 'option sai');
  assert.ok(!validateProposalLocal({ summary: 'x', actions: [{ type: 'next_action', text: '' }] }, r).ok, 'next_action rỗng');
  assert.ok(!validateProposalLocal({ summary: 'x'.repeat(401), actions: [] }, r).ok, 'summary quá dài');
  assert.ok(!validateProposalLocal({ summary: 'x', actions: Array.from({ length: 11 }, () => ({ type: 'next_action', text: 'a' })) }, r).ok, 'quá 10 action');
  assert.ok(!validateProposalLocal(null, r).ok);
});

/* ---------- conflict check: chỉ cảnh báo ---------- */
test('conflictCheck: chồng với TimeBlock có sẵn → cảnh báo', () => {
  const blocks = [{ id: 'b1', taskUid: 't2', date: '2026-02-15', start: '09:00', end: '10:30', status: 'planned' }];
  const w = conflictCheck({ summary: 'x', actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-02-15', start: '09:30', duration: 60 }] }, blocks, []);
  assert.strictEqual(w.length, 1);
  assert.strictEqual(w[0].kind, 'existing');
});

test('conflictCheck: chồng với busy Google → cảnh báo busy', () => {
  const busy = [{ start: '2026-02-15T08:00:00Z', end: '2026-02-15T10:00:00Z' }];
  const w = conflictCheck({ summary: 'x', actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-02-15', start: '09:00', duration: 60 }] }, [], busy);
  assert.strictEqual(w.length, 1);
  assert.strictEqual(w[0].kind, 'busy');
});

test('conflictCheck: chồng giữa 2 action đề xuất → cảnh báo proposed; không chồng → sạch', () => {
  const p = { summary: 'x', actions: [
    { type: 'schedule_task', taskUid: 't1', date: '2026-02-15', start: '09:00', duration: 60 },
    { type: 'schedule_task', taskUid: 't2', date: '2026-02-15', start: '10:30', duration: 60 },
  ] };
  assert.strictEqual(conflictCheck(p, [], []).length, 0);
  const clash = { summary: 'x', actions: [
    { type: 'schedule_task', taskUid: 't1', date: '2026-02-15', start: '09:00', duration: 60 },
    { type: 'schedule_task', taskUid: 't2', date: '2026-02-15', start: '09:30', duration: 60 },
  ] };
  const w = conflictCheck(clash, [], []);
  assert.strictEqual(w.length, 1);
  assert.strictEqual(w[0].kind, 'proposed');
});

/* ---------- apply pipeline: chỉ ghi qua hooks ---------- */
test('applyProposal: schedule tạo block (end = start + duration), reschedule di chuyển, next_action chỉ gợi ý', () => {
  const created = [];
  const moved = [];
  const inboxed = [];
  const hooks = {
    findTask: (uid) => uid === 't1' || uid === 't2',
    createBlock: (p) => created.push(p),
    moveToDay: (uid, opt) => moved.push([uid, opt]),
    moveToInbox: (uid) => inboxed.push(uid),
  };
  const res = applyProposal({
    summary: 'x',
    actions: [
      { type: 'schedule_task', taskUid: 't1', date: '2026-02-15', start: '09:00', duration: 90 },
      { type: 'schedule_task', taskUid: 't1', date: '2026-02-15', start: '23:30', duration: 120 },
      { type: 'reschedule_task', taskUid: 't2', option: 'tomorrow' },
      { type: 'next_action', text: 'advisory only' },
    ],
  }, hooks);
  assert.strictEqual(res.created, 2);
  assert.strictEqual(created[0].end, '10:30');
  assert.strictEqual(created[1].end, '23:59', 'clamp hết ngày');
  assert.strictEqual(res.rescheduled, 1);
  assert.deepEqual(moved, [['t2', 'tomorrow']]);
  assert.strictEqual(res.advisory, 1);
});

test('applyProposal: task không tìm thấy → skip an toàn, không crash', () => {
  const hooks = { findTask: () => false, createBlock: () => { throw new Error('không được gọi'); } };
  const res = applyProposal({
    summary: 'x',
    actions: [{ type: 'schedule_task', taskUid: 'ghost', date: '2026-02-15', start: '09:00', duration: 60 }],
  }, hooks);
  assert.strictEqual(res.created, 0);
  assert.deepEqual(res.skipped, ['ghost']);
  assert.strictEqual(res.ok, true);
});

test('applyProposal: action schedule có date/start sai → bỏ qua an toàn', () => {
  const hooks = { findTask: () => true, createBlock: () => { throw new Error('không được gọi'); } };
  const res = applyProposal({
    summary: 'x',
    actions: [{ type: 'schedule_task', taskUid: 't1', date: 'not-a-date', start: 'oops', duration: 60 }],
  }, hooks);
  assert.strictEqual(res.created, 0);
  assert.strictEqual(res.ok, true);
});

/* ---------- helpers ---------- */
test('validDate: từ chối roll-over (2026-13-40)', () => {
  assert.ok(validDate('2026-02-15'));
  assert.ok(!validDate('2026-13-40'));
  assert.ok(!validDate('2026-02-30'));
  assert.ok(!validDate('garbage'));
});

/* ---------- production wiring ---------- */
test('app.html: plannerAi host + ai.min.js script + app.min bump', () => {
  assert.ok(APP.includes('id="plannerAi"'), 'host #plannerAi');
  assert.ok(APP.includes('js/ai.min.js?v=2'), 'script ai.min.js');
  assert.ok(APP.includes('js/app.min.js?v=193'), 'app.min.js v193');
});

test('sw.js: cache v239 + precache ai.min.js', () => {
  assert.ok(SW.includes("const CACHE = 'taskflow-v239';"), 'cache v239');
  assert.ok(SW.includes("'./js/ai.min.js',"), 'precache ai.min.js');
});

test('i18n: đủ key VI + EN', () => {
  const keys = ['aiTitle', 'aiRun', 'aiApply', 'aiCancel', 'aiConsentTasks', 'aiConsentReflections', 'aiConsentMood', 'aiKindplan_day', 'aiKindbreakdown_project', 'aiKindreschedule', 'aiNotConfigured', 'aiInvalidOutput', 'aiApplied', 'aiConflict', 'aiSelectProject', 'aiSelectMilestone'];
  keys.forEach((k) => {
    assert.ok(I18N.includes(k + ":"), 'thiếu key ' + k);
  });
});

test('panelHTML/previewHTML render không throw', () => {
  const panel = panelHTML([{ id: 'p1', title: 'P' }], [{ id: 'm1', projectId: 'p1', title: 'M' }]);
  assert.ok(panel.includes('data-role="ai-panel"'));
  assert.ok(panel.includes('data-ai-consent="reflections"'));
  const prev = previewHTML({ summary: 'S', actions: [{ type: 'next_action', text: 'hi' }] }, []);
  assert.ok(prev.includes('data-role="ai-preview"'));
});
