/* Phase 3C — Runtime: Trusted Chat Context Provider Tests.
   Tests js/chat-provider.js (window.TaskFlowChatContextProvider) via ESM
   imports, using the real Phase 3A broker + Phase 3B prep module.

   Coverage:
   - P2 shouldAttachContext gate (general → NO context; personal → YES)
   - P4 prepare() envelope flow
   - P5 reflections/mood never in envelope
   - P8 safe fallback (no gather, throwing gather, module missing)
   - P17 general chat sends no personal context
   - P22 fresh snapshot per request
   - P23 envelope size cap
   - P4.1/P34 no network, no storage reads in provider source */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Phase 3A broker
const ctx = require(join(__dirname, '..', 'js', 'ai-context.js'));
globalThis.TaskFlowAIContext = ctx;

// Phase 3B prep module
const cc = require(join(__dirname, '..', 'js', 'ai-chat-context.js'));
globalThis.TaskFlowAIChatContext = cc;

// Module under test
const provider = require(join(__dirname, '..', 'js', 'chat-provider.js'));

/* ---- helper: trusted gather fn (mirrors app.js chatContextGatherOptions) ---- */
function makeGather(extra) {
  const dayTasks = [{ uid: 't1', text: 'Test task', done: false }];
  return function gather() {
    return Object.assign({
      state: {
        weeks: [{ days: [{ date: '2026-08-19', tasks: dayTasks }] }],
        habits: [],
      },
      now: new Date('2026-08-19T12:00:00'),
      today: '2026-08-19',
      planStart: new Date('2026-08-01'),
      numDays: 31,
      year: 2026,
      month: 7,
      resolveTodayCell: null,
      todayCell: {
        inPlanMonth: true,
        weekIndex: 0,
        weekNumber: 1,
        dayIndex: 0,
        dayIdx: 0,
        day: { date: '2026-08-19', tasks: dayTasks },
      },
      projects: { projects: [] },
      timeblocks: { blocks: [] },
      busy: [],
      habits: [],
    }, extra || {});
  };
}

/* ---------- P2: attach gate ---------- */

test('P2/P17: general questions → NO context', () => {
  assert.equal(provider.shouldAttachContext('Pomodoro là gì?'), false);
  assert.equal(provider.shouldAttachContext('Give me study tips'), false);
  assert.equal(provider.shouldAttachContext('hello'), false);
  assert.equal(provider.shouldAttachContext(''), false);
  assert.equal(provider.shouldAttachContext(null), false);
  assert.equal(provider.shouldAttachContext(undefined), false);
});

test('P2: personal questions → context attached', () => {
  assert.equal(provider.shouldAttachContext('Hôm nay tôi còn task nào?'), true);
  assert.equal(provider.shouldAttachContext('Tuần này tôi bận ngày nào?'), true);
  assert.equal(provider.shouldAttachContext('Dự án Database tiến triển sao?'), true);
  assert.equal(provider.shouldAttachContext('Chiều nay lịch thế nào?'), true);
  assert.equal(provider.shouldAttachContext('Tổng quan của tôi thế nào?'), true);
  assert.equal(provider.shouldAttachContext('What tasks do I have today?'), true);
});

test('P2: explicit privacy opt-out wins', () => {
  assert.equal(provider.shouldAttachContext('Đừng gửi dữ liệu của tôi, chỉ trả lời chung'), false);
  assert.equal(provider.shouldAttachContext("Don't send my task data"), false);
  assert.equal(provider.shouldAttachContext('Không chia sẻ dữ liệu của tôi'), false);
});

/* ---------- P4: prepare() flow ---------- */

test('P4: personal question → safe envelope', () => {
  provider.register(makeGather());
  const r = provider.prepare('Hôm nay tôi còn task nào?');
  assert.equal(r.ok, true);
  assert.equal(r.scope, 'today');
  assert.ok(r.envelope);
  assert.equal(r.envelope.scope, 'today');
  assert.ok(r.envelope.data.tasks.length >= 1);
  assert.equal(r.envelope.data.tasks[0].text, 'Test task');
  assert.equal(r.envelope.data.tasks[0].done, false);
});

test('P17: general question → ok:false, no envelope', () => {
  provider.register(makeGather());
  const r = provider.prepare('Pomodoro là gì?');
  assert.equal(r.ok, false);
  assert.equal(r.envelope, undefined);
});

test('P5: envelope never contains reflections/mood', () => {
  provider.register(makeGather({
    state: {
      weeks: [{ days: [{ tasks: [{ uid: 't1', text: 'Test task', done: false }] }] }],
      habits: [],
      reflections: { weeks: [['secret reflection']], overview: [] },
    },
  }));
  const r = provider.prepare('Tổng quan của tôi thế nào?');
  assert.equal(r.ok, true);
  assert.equal(r.envelope.data.reflections, undefined);
  assert.equal(r.envelope.data.mood, undefined);
  assert.ok(!JSON.stringify(r.envelope).includes('reflection'));
  assert.ok(!JSON.stringify(r.envelope).includes('mood'));
});

test('P8: no registered gather → ok:false (safe fallback)', () => {
  provider.register(null);
  const r = provider.prepare('Hôm nay tôi còn task nào?');
  assert.equal(r.ok, false);
});

test('P8: throwing gather → ok:false, no crash', () => {
  provider.register(() => { throw new Error('boom'); });
  const r = provider.prepare('Hôm nay tôi còn task nào?');
  assert.equal(r.ok, false);
});

test('P8: broker module missing → ok:false', () => {
  const real = globalThis.TaskFlowAIChatContext;
  try {
    delete globalThis.TaskFlowAIChatContext;
    provider.register(makeGather());
    const r = provider.prepare('Hôm nay tôi còn task nào?');
    assert.equal(r.ok, false);
  } finally {
    globalThis.TaskFlowAIChatContext = real;
  }
});

test('P1.1: malicious gather data → envelope clean (no forbidden keys)', () => {
  provider.register(makeGather({
    state: { weeks: [{ days: [{ tasks: [{ uid: 't1', text: 'T', done: false, authorization: 'x' }] }] }], habits: [] },
  }));
  const r = provider.prepare('Hôm nay tôi còn task nào?');
  // Broker allowlist đã loại trước; kiểm tra không có key cấm lọt vào envelope.
  assert.ok(!JSON.stringify(r.envelope || {}).includes('authorization'));
  assert.ok(!JSON.stringify(r.envelope || {}).includes('token'));
});

test('P22: fresh snapshot per request (gather runs each time)', () => {
  let calls = 0;
  provider.register(() => { calls += 1; return makeGather()(); });
  provider.prepare('Hôm nay tôi còn task nào?');
  provider.prepare('Hôm nay tôi còn task nào?');
  assert.ok(calls >= 2, 'gather phải chạy lại mỗi request');
});

test('P23: envelope stays within MAX_CHAT_CONTEXT_BYTES', () => {
  const blocks = Array.from({ length: 200 }, (_, i) => ({
    id: 'b' + i, taskUid: 't1', date: '2026-08-19', start: '09:00', end: '10:00', status: 'scheduled',
  }));
  provider.register(makeGather({ timeblocks: { blocks } }));
  const r = provider.prepare('Chiều nay lịch thế nào?');
  assert.equal(r.ok, true);
  const bytes = Buffer.byteLength(JSON.stringify(r.envelope), 'utf8');
  assert.ok(bytes <= cc.MAX_CHAT_CONTEXT_BYTES, 'envelope bounded: ' + bytes);
});

test('register returns boolean and validates fn', () => {
  assert.equal(provider.register(() => ({})), true);
  assert.equal(provider.register(null), false);
  assert.equal(provider.register('x'), false);
});

test('P4.1/P34: provider source has zero network and zero storage reads', () => {
  const src = readFileSync(join(__dirname, '..', 'js', 'chat-provider.js'), 'utf8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/fetch\s*\(/.test(noComments), 'no fetch() in provider');
  assert.ok(!/XMLHttpRequest/.test(noComments), 'no XHR in provider');
  assert.ok(!/localStorage/.test(noComments), 'no localStorage in provider');
  assert.ok(!/sessionStorage/.test(noComments), 'no sessionStorage in provider');
  assert.ok(!/generativelanguage/.test(noComments), 'no Gemini URLs in provider');
  assert.ok(!/googleapis\.com/.test(noComments), 'no Google API URLs in provider');
  assert.ok(!/\/api\/ai\//.test(noComments), 'no API route references in provider');
});