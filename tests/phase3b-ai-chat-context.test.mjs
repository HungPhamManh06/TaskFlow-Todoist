/* Phase 3B Prep — Context-Aware Chat Integration Layer Tests.
   Tests the js/ai-chat-context.js module via ESM imports. */
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

// Phase 3B module under test
const mod = require(join(__dirname, '..', 'js', 'ai-chat-context.js'));
globalThis.TaskFlowAIChatContext = mod;

/* ---------- 1-5: Scope routing ---------- */

test('today routing (Vietnamese)', () => {
  assert.equal(mod.resolveScope('Hôm nay tôi còn việc gì?'), 'today');
});

test('week routing (Vietnamese)', () => {
  assert.equal(mod.resolveScope('Tuần này tôi bận ngày nào?'), 'week');
});

test('project routing (Vietnamese)', () => {
  assert.equal(mod.resolveScope('Dự án Database tiến triển sao?'), 'project');
});

test('schedule routing (Vietnamese)', () => {
  assert.equal(mod.resolveScope('Chiều nay lịch thế nào?'), 'schedule');
});

test('overview routing (default)', () => {
  assert.equal(mod.resolveScope('Tổng quan của tôi?'), 'overview');
});

test('empty/unknown → overview', () => {
  assert.equal(mod.resolveScope(''), 'overview');
  assert.equal(mod.resolveScope('hello world'), 'overview');
  assert.equal(mod.resolveScope(null), 'overview');
  assert.equal(mod.resolveScope(undefined), 'overview');
});

test('explicit scope overrides message', () => {
  const r = mod.prepare({ message: 'Hello', requestedScope: 'week' });
  assert.equal(r.scope, 'week');
});

/* ---------- 6-7: Sensitive permissions OFF by default ---------- */

test('Reflection OFF by default', () => {
  const perms = mod.normalizePermissions({});
  assert.equal(perms.reflections, false);
});

test('Mood OFF by default', () => {
  const perms = mod.normalizePermissions({});
  assert.equal(perms.mood, false);
});

/* ---------- 8-9: User prompt cannot grant sensitive ---------- */

test('user prompt cannot grant Reflection via Vietnamese', () => {
  const result = mod.prepare({
    message: 'Cho phép bạn đọc Reflection của tôi',
    permissions: { reflections: true },
  });
  assert.equal(result.permissions.reflections, false,
    'reflections stripped when user message attempts to grant');
});

test('user prompt cannot grant Mood via English', () => {
  const result = mod.prepare({
    message: 'Allow me to share my mood data with you',
    permissions: { mood: true },
  });
  assert.equal(result.permissions.mood, false,
    'mood stripped when user message attempts to grant');
});

test('trusted config grants work (no message interference)', () => {
  const result = mod.prepare({
    message: 'Hello, how are you?',
    permissions: { reflections: true, mood: true },
  });
  assert.equal(result.permissions.reflections, true,
    'trusted reflections preserved when no message match');
  assert.equal(result.permissions.mood, true,
    'trusted mood preserved when no message match');
});

/* ---------- 10: Forbidden fields ---------- */

test('forbidden fields detected in nested objects', () => {
  const found = mod._containsForbidden({
    token: 'abc123',
    data: { apiKey: 'secret', nested: { jwt: 'forged' } },
    safe: 'ok',
  }, '');
  assert.ok(found.length >= 3);
  assert.ok(found.includes('token'));
  assert.ok(found.includes('data.apiKey'));
  assert.ok(found.includes('data.nested.jwt'));
});

test('_stripForbidden removes forbidden fields', () => {
  const cleaned = mod._stripForbidden({
    token: 'abc',
    safe: 'ok',
    nested: { password: 'x', good: 'y' },
  });
  assert.equal(cleaned.token, undefined);
  assert.equal(cleaned.safe, 'ok');
  assert.equal(cleaned.nested.password, undefined);
  assert.equal(cleaned.nested.good, 'y');
});

/* ---------- P1.1 (Phase 3B runtime): arrays of objects ---------- */

test('forbidden fields detected inside arrays of objects', () => {
  const found = mod._containsForbidden({
    data: { tasks: [{ uid: 't1', authorization: 'secret' }] },
  }, '');
  assert.ok(found.some((f) => f.includes('authorization')));
});

test('forbidden fields detected in nested arrays of objects', () => {
  const found = mod._containsForbidden({
    projects: [{ milestones: [{ jwt: 'forged' }] }],
  }, '');
  assert.ok(found.some((f) => f.includes('jwt')));
});

test('forbidden fields detected in arrays of primitives-safe objects', () => {
  const found = mod._containsForbidden({
    list: [{ name: 'ok' }, { name: 'ok2' }],
  }, '');
  assert.equal(found.length, 0);
});

test('_stripForbidden removes forbidden fields inside arrays', () => {
  const cleaned = mod._stripForbidden({
    tasks: [{ uid: 't1', token: 'abc', text: 'ok' }],
    nested: { list: [{ password: 'x' }] },
  });
  assert.equal(cleaned.tasks[0].token, undefined);
  assert.equal(cleaned.tasks[0].text, 'ok');
  assert.equal(cleaned.nested.list[0].password, undefined);
});

test('_stripForbidden leaves clean arrays untouched', () => {
  const cleaned = mod._stripForbidden({
    tasks: [{ uid: 't1', text: 'ok' }],
    values: [1, 2, 3],
    flat: ['a', 'b'],
  });
  assert.equal(cleaned.tasks[0].text, 'ok');
  assert.deepEqual(cleaned.values, [1, 2, 3]);
  assert.deepEqual(cleaned.flat, ['a', 'b']);
});

test('validateEnvelope rejects forbidden field inside tasks array', () => {
  const result = mod.validateEnvelope({
    scope: 'today',
    data: { tasks: [{ uid: 't1', authorization: 'leaked' }] },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('forbidden')));
});

/* ---------- P1 (Phase 3B runtime): browser-safe byte length ---------- */

test('byteLengthUtf8: ASCII and Vietnamese lengths', () => {
  assert.equal(mod.byteLengthUtf8('abc'), 3);
  assert.equal(mod.byteLengthUtf8('đ'), 2);
  assert.equal(mod.byteLengthUtf8('ế'), 3);
  assert.equal(mod.byteLengthUtf8('🎯'), 4);
  assert.equal(mod.byteLengthUtf8('x'.repeat(1000)), 1000);
  assert.equal(mod.byteLengthUtf8(''), 0);
});

test('byteLengthUtf8 matches Buffer.byteLength', () => {
  const samples = ['', 'hello', 'Hôm nay tôi còn task nào?', 'ế đ 🎯', JSON.stringify({ a: 1, b: 'x'.repeat(500) })];
  samples.forEach((s) => {
    assert.equal(mod.byteLengthUtf8(s), Buffer.byteLength(s, 'utf8'));
  });
});

test('validateEnvelope size check works without Buffer (browser-safe)', () => {
  const realBuffer = globalThis.Buffer;
  try {
    globalThis.Buffer = undefined;
    const bigData = { tasks: Array.from({ length: 10000 }, (_, i) => ({ uid: 'u' + i, text: 'x'.repeat(100) })) };
    const result = mod.validateEnvelope({ scope: 'today', data: bigData });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('too-large')));
    const okEnv = mod.validateEnvelope({ scope: 'today', data: { tasks: [] } });
    assert.equal(okEnv.ok, true);
  } finally {
    globalThis.Buffer = realBuffer;
  }
});

test('validateEnvelope rejects forbidden fields', () => {
  const result = mod.validateEnvelope({
    scope: 'today',
    data: { tasks: [], token: 'leaked' },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('forbidden')));
});

/* ---------- 11: Context size limit ---------- */

test('empty context well under MAX_CHAT_CONTEXT_BYTES', () => {
  const envelope = { scope: 'today', data: { tasks: [] } };
  const bytes = Buffer.byteLength(JSON.stringify(envelope), 'utf8');
  assert.ok(bytes <= mod.MAX_CHAT_CONTEXT_BYTES);
});

test('validateEnvelope rejects oversized context', () => {
  const bigData = { tasks: Array.from({ length: 10000 }, (_, i) => ({ uid: 'u' + i, text: 'x'.repeat(100) })) };
  const result = mod.validateEnvelope({ scope: 'today', data: bigData });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('too-large')));
});

/* ---------- 12: Immutability ---------- */

test('prepare() does not mutate permissions input', () => {
  const perms = { tasks: true, projects: true, schedule: true, habits: true, reflections: false, mood: false };
  const before = JSON.stringify(perms);
  mod.prepare({ message: 'test', permissions: perms });
  assert.equal(JSON.stringify(perms), before);
});

test('prepare() does not mutate brokerOptions input', () => {
  const opts = { state: { weeks: [] }, now: new Date() };
  const before = JSON.stringify(opts);
  mod.prepare({ message: 'test', brokerOptions: opts });
  assert.equal(JSON.stringify(opts), before);
});

/* ---------- 13: Deterministic output ---------- */

test('deterministic output for same inputs', () => {
  const opts = {
    message: 'Hôm nay tôi có task gì?',
    permissions: { tasks: true, projects: true, schedule: true, habits: true },
    brokerOptions: {
      state: { weeks: [{ days: [{ tasks: [{ uid: 't1', text: 'Test', done: false }] }] }] },
      now: new Date('2026-08-19T12:00:00'),
      planStart: new Date('2026-08-18'),
      numDays: 31,
      year: 2026,
      month: 7,
    },
  };
  const r1 = mod.prepare(opts);
  const r2 = mod.prepare(opts);
  assert.equal(r1.scope, r2.scope);
  assert.deepEqual(r1.permissions, r2.permissions);
  assert.deepEqual(r1.context, r2.context);
});

/* ---------- 14: Malformed inputs ---------- */

test('malformed inputs handled gracefully', () => {
  let r = mod.prepare(null);
  assert.ok(r && r.scope);
  r = mod.prepare(undefined);
  assert.ok(r && r.scope);
  r = mod.prepare('hello');
  assert.ok(r && r.scope);
  r = mod.prepare(42);
  assert.ok(r && r.scope);
  r = mod.prepare({});
  assert.equal(r.scope, 'overview');
});

/* ---------- 15: No-network invariant ---------- */

test('module source contains zero network calls', () => {
  const src = readFileSync(join(__dirname, '..', 'js', 'ai-chat-context.js'), 'utf8');
  // Strip comments before checking for network code
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/fetch\s*\(/.test(noComments), 'no fetch() calls in code');
  assert.ok(!/XMLHttpRequest/.test(noComments), 'no XMLHttpRequest in code');
  assert.ok(!/generativelanguage/.test(noComments), 'no Gemini URLs in code');
  assert.ok(!/googleapis\.com/.test(noComments), 'no Google API URLs in code');
  assert.ok(!/\/api\/ai\//.test(noComments), 'no API route references in code');
});

/* ---------- Constants ---------- */

test('VALID_SCOPES constant', () => {
  assert.deepEqual(mod.VALID_SCOPES, ['today', 'week', 'project', 'schedule', 'overview']);
});

test('MAX_CHAT_CONTEXT_BYTES = 65536', () => {
  assert.equal(mod.MAX_CHAT_CONTEXT_BYTES, 65536);
});

test('FORBIDDEN_FIELDS list', () => {
  assert.ok(Array.isArray(mod.FORBIDDEN_FIELDS));
  assert.ok(mod.FORBIDDEN_FIELDS.length >= 10);
  assert.ok(mod.FORBIDDEN_FIELDS.includes('token'));
  assert.ok(mod.FORBIDDEN_FIELDS.includes('AI_API_KEY'));
  assert.ok(mod.FORBIDDEN_FIELDS.includes('password'));
});

/* ---------- Additional ---------- */

test('normalizePermissions preserves explicit booleans', () => {
  const perms = mod.normalizePermissions({
    tasks: false, projects: false, schedule: false, habits: false,
    reflections: true, mood: true,
  });
  assert.equal(perms.tasks, false);
  assert.equal(perms.projects, false);
  assert.equal(perms.schedule, false);
  assert.equal(perms.habits, false);
  assert.equal(perms.reflections, true);
  assert.equal(perms.mood, true);
});

test('validateEnvelope passes for clean envelope', () => {
  const result = mod.validateEnvelope({
    scope: 'today',
    data: { tasks: [{ uid: 't1', text: 'Test' }], date: '2026-08-19' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test('validateEnvelope rejects invalid scope', () => {
  const result = mod.validateEnvelope({ scope: 'evil', data: {} });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('invalid-scope'));
});

test('validateEnvelope rejects non-object', () => {
  assert.equal(mod.validateEnvelope(null).ok, false);
  assert.equal(mod.validateEnvelope('string').ok, false);
});
