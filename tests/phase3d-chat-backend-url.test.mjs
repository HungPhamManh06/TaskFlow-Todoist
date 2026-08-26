'use strict';
/* Phase 3B hotfix — Chat backend URL resolution regression suite.
   Root cause (prod): chat.js read `window.API_CONFIG` — but api-config.js
   declares top-level `const API_CONFIG`, a LEXICAL global that is NOT on
   window. Result: apiUrl='' → fetch('/api/ai/chat') hit Vercel 404.

   The vm harness replays the REAL browser classic-script scope: api-config.js
   then the provider chain then chat.js all run in ONE shared global scope,
   exactly like <script> tags in app.html. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const read = (f) => readFileSync(join(ROOT, 'js', f), 'utf8');

/* ---- harness: shared-scope browser replay ---- */
function makeContext(withConfig) {
  const calls = [];
  const logs = [];
  const sandbox = {
    console: {
      log: (...a) => logs.push(a.join(' ')),
      warn: (...a) => logs.push(a.join(' ')),
      error: (...a) => logs.push(a.join(' ')),
      debug: (...a) => logs.push(a.join(' ')),
    },
    location: { search: '' },
    document: { getElementById: () => null },
    navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetch: async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, status: 200, json: async () => ({ ok: true, answer: 'OK' }) };
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  if (withConfig) vm.runInContext(read('api-config.js'), ctx);
  vm.runInContext(read('ai-context.js'), ctx);
  vm.runInContext(read('ai-chat-context.js'), ctx);
  vm.runInContext(read('chat-provider.js'), ctx);
  vm.runInContext(read('chat.js'), ctx);
  // Trusted gather fn (mirrors app.js chatContextGatherOptions; todayCell needed
  // by the broker to resolve today's tasks).
  vm.runInContext(`(function () {
    var dayTasks = [{ uid: 't1', text: 'Test task', done: false }];
    window.TaskFlowChatContextProvider.register(function gather() {
      return {
        state: { weeks: [{ days: [{ date: '2026-08-19', tasks: dayTasks }] }], habits: [] },
        now: new Date('2026-08-19T12:00:00'),
        today: '2026-08-19',
        planStart: new Date('2026-08-01'),
        numDays: 31,
        year: 2026,
        month: 7,
        resolveTodayCell: null,
        todayCell: { inPlanMonth: true, weekIndex: 0, weekNumber: 1, dayIndex: 0, dayIdx: 0, day: { date: '2026-08-19', tasks: dayTasks } },
        projects: { projects: [] },
        timeblocks: { blocks: [] },
        busy: [],
        habits: [],
      };
    });
  })()`, ctx);
  return { ctx, calls, logs };
}

/* ---------- P5: config access ---------- */

test('P5: api-config.js declares the canonical Render URL', () => {
  const src = read('api-config.js');
  assert.match(src, /const API_CONFIG\s*=\s*\{\s*url:\s*'https:\/\/todoist-m3c7\.onrender\.com'/);
});

test('P5: chat.js resolves lexically, NOT via window.API_CONFIG', () => {
  const chat = read('chat.js');
  assert.doesNotMatch(chat, /window\.API_CONFIG/);
  assert.match(chat, /typeof API_CONFIG !== 'undefined'/);
});

/* ---------- P4: trailing-slash normalization ---------- */

test('P4: _getApiBase strips trailing slashes', () => {
  const { ctx } = makeContext(true);
  vm.runInContext("API_CONFIG.url = 'https://todoist-m3c7.onrender.com///';", ctx);
  const base = vm.runInContext('window.TaskFlowChat._getApiBase()', ctx);
  assert.equal(base, 'https://todoist-m3c7.onrender.com');
});

/* ---------- P5/P6: URL + general chat ---------- */

test('P5+P6: "hi" → Render URL, no taskflowContext, never Vercel/relative', async () => {
  const { ctx, calls } = makeContext(true);
  assert.equal(vm.runInContext('window.TaskFlowChatContextProvider.shouldAttachContext("hi")', ctx), false);
  const answer = await vm.runInContext('window.TaskFlowChat._callChatAPI("hi", [])', ctx);
  assert.equal(answer.answer, 'OK');
  assert.equal(answer.truncated, false);
  assert.equal(calls.length, 1);
  const url = calls[0].url;
  assert.equal(url, 'https://todoist-m3c7.onrender.com/api/ai/chat');
  assert.notEqual(url, '/api/ai/chat');
  assert.ok(!url.startsWith('https://taskflow-todoist.vercel.app'));
  const body = JSON.parse(calls[0].opts.body);
  assert.deepEqual(body.message, 'hi');
  assert.ok(Array.isArray(body.history));
  assert.equal('taskflowContext' in body, false, 'general chat must not send context');
});

/* ---------- P7: context chat ---------- */

test('P7: personal question → same Render URL, taskflowContext scope=today', async () => {
  const { ctx, calls } = makeContext(true);
  assert.equal(vm.runInContext('window.TaskFlowChatContextProvider.shouldAttachContext("Hôm nay tôi còn việc gì?")', ctx), true);
  await vm.runInContext('window.TaskFlowChat._callChatAPI("Hôm nay tôi còn việc gì?", [])', ctx);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://todoist-m3c7.onrender.com/api/ai/chat');
  const body = JSON.parse(calls[0].opts.body);
  assert.ok(body.taskflowContext, 'personal question must send taskflowContext');
  assert.equal(body.taskflowContext.scope, 'today');
  assert.deepEqual(body.message, 'Hôm nay tôi còn việc gì?');
});

/* ---------- P3: no silent fallback ---------- */

test('P3: missing API config → controlled api-config-missing error, NO fetch', async () => {
  const { ctx, calls } = makeContext(false);
  assert.equal(vm.runInContext('window.TaskFlowChat._getApiBase()', ctx), '');
  await assert.rejects(
    () => vm.runInContext('window.TaskFlowChat._callChatAPI("hi", [])', ctx),
    (err) => err && err.code === 'api-config-missing'
  );
  assert.equal(calls.length, 0, 'must NOT fire a request to any origin');
});

test('P3: api-config-missing maps to the localized connection error', () => {
  const { ctx } = makeContext(false);
  const text = vm.runInContext('window.TaskFlowChat._mapError({ code: "api-config-missing" })', ctx);
  assert.equal(text, 'chatErrorApiConfig');
  const i18n = read('i18n.js');
  assert.match(i18n, /chatErrorApiConfig: 'Không thể kết nối tới dịch vụ AI\.'/);
  assert.match(i18n, /chatErrorApiConfig: 'Unable to connect to the AI service\.'/);
});

/* ---------- P10: debug diagnostics ---------- */

test('P10: ?debug=1 logs only URL resolution lines, never secrets', async () => {
  const { ctx, calls, logs } = makeContext(true);
  vm.runInContext("location.search = '?debug=1'", ctx);
  await vm.runInContext('window.TaskFlowChat._callChatAPI("hi", [])', ctx);
  assert.ok(logs.some((l) => l.includes('[chat] api-base=https://todoist-m3c7.onrender.com')), 'logs api-base');
  assert.ok(logs.some((l) => l.includes('[chat] request=/api/ai/chat')), 'logs request path');
  for (const l of logs) {
    assert.ok(!/(Authorization|Bearer|jwt|token|taskflowContext|api[_-]?key)/i.test(l), 'no secrets in logs: ' + l);
  }
  assert.equal(calls.length, 1);
});

/* ---------- P8/P9: error UI + retry (source-level invariants) ---------- */

test('P8: catch renders ONE retry wrapper with the mapped error — no duplicate _showInfo', () => {
  const chat = read('chat.js');
  assert.match(chat, /function _showRetry\(container, failedMsg, mappedErrorText/);
  const catchBlock = chat.match(/} catch \(err\) \{[\s\S]*?\} finally \{/);
  assert.ok(catchBlock, 'catch block found');
  assert.match(catchBlock[0], /_showRetry\(msgs, text, errMsg/);
  assert.doesNotMatch(catchBlock[0], /_showInfo/);
});

test('P9: retry reuses the same message, one request, no duplicate user bubble', () => {
  const chat = read('chat.js');
  assert.match(chat, /_doSend\(failedMsg, \{ userBubble: false, persistUser: false \}\)/);
  assert.match(chat, /async function _doSend\(text, opts\)/);
  assert.match(chat, /if \(opts\.userBubble !== false\) _appendMessage/);
});

/* ---------- Provider registration ordering (gather fn after lazy load) ---------- */

test('P4.1: gather fn registers AFTER the lazy chain loads, not at boot', () => {
  const app = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');
  // runLazyChat: chain loads, THEN initChatContextProvider, THEN the action fn.
  const chain = app.match(/function runLazyChat\(fn\) \{[\s\S]*?\n\}/);
  assert.ok(chain, 'runLazyChat definition found');
  assert.match(chain[0], /initChatContextProvider\(\);/);
  // The gather registration must not run before the provider exists (boot-time
  // guard) — chat must work without context when the provider is missing.
  assert.match(app, /function initChatContextProvider\(\) \{[\s\S]*?if \(!window\.TaskFlowChatContextProvider/);
});
