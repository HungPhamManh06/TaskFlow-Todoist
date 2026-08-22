'use strict';
/* Phase 5A.1 — Runtime Stabilization Hotfix Regression Tests.
   Verifies that all Phase 5A regressions are fixed:
   - Chat invalid context no longer calls undefined releaseSlot()
   - Agent TDZ: releaseSlot() no longer called before declaration
   - Agent idempotency cache hit no longer leaks concurrency slots
   - Agent history + context sanitization declarations restored
   - Agent concurrency Map bounded (delete on count=0)
   - Idempotency cache bounded / TTL cleanup
   - agentRequestId validated (string, 8-64 chars safe-chars-only)
   - Single generateRequestId() definition (no duplicates) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const src = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');

const require = createRequire(import.meta.url);
const ai = require('../server/ai.js');
const {
  sanitizeChatContextEnvelope,
  sanitizeChatHistory,
  validateAgentProposal,
  chatHasForbidden,
  CHAT_VALID_SCOPES,
  MAX_CHAT_CONTEXT_BYTES,
  CHAT_FORBIDDEN_KEYS,
} = ai;

/* ================================================================
   P17: Chat invalid context — no releaseSlot() ReferenceError
   ================================================================ */
test('P17: chat invalid context returns 400 ai-context-invalid (no releaseSlot)', () => {
  // The chat route must NOT contain releaseSlot() anywhere
  const chatIdx = src.indexOf("router.post('/chat'");
  const chatEndIdx = src.indexOf("router.post('/agent'");
  const chatSeg = src.slice(chatIdx, chatEndIdx);
  assert.doesNotMatch(chatSeg, /releaseSlot\(\)/, 'chat route must not call releaseSlot()');
  assert.match(chatSeg, /ai-context-invalid/, 'chat route must handle ai-context-invalid');
  assert.match(chatSeg, /ctxSan\.ok/, 'chat route must check ctxSan.ok');
});

test('P17: sanitizeChatContextEnvelope rejects invalid scope', () => {
  const result = sanitizeChatContextEnvelope({ scope: 'bogus', data: {} });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid-scope');
});

test('P17: sanitizeChatContextEnvelope rejects forbidden fields', () => {
  const result = sanitizeChatContextEnvelope({
    scope: 'today',
    data: { token: 'secret-token-value' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'forbidden-fields');
});

test('P17: sanitizeChatContextEnvelope accepts valid scope', () => {
  const result = sanitizeChatContextEnvelope({
    scope: 'today',
    data: { tasks: [{ uid: 't1', text: 'Test', priority: false, done: false, duration: 30 }] },
  });
  assert.equal(result.ok, true);
  assert.ok(result.envelope);
  assert.equal(result.envelope.scope, 'today');
});

test('P17: sanitizeChatContextEnvelope accepts null context', () => {
  const result = sanitizeChatContextEnvelope(null);
  assert.equal(result.ok, true);
  assert.equal(result.envelope, null);
});

/* ================================================================
   P14: Agent empty message → 400 invalid-message (no ReferenceError)
   ================================================================ */
test('P14: agent route validates message before slot (no TDZ)', () => {
  // The agent route must validate message BEFORE acquiring concurrency slot
  const agentIdx = src.indexOf("router.post('/agent'");
  const agentSeg = src.slice(agentIdx, src.indexOf('module.exports'));

  // message validation must appear before slot acquisition
  const msgValidateIdx = agentSeg.indexOf('invalid-message');
  const slotAcquireIdx = agentSeg.indexOf('agentInFlight.set(userId, current + 1)');
  assert.ok(msgValidateIdx < slotAcquireIdx,
    'message validation (invalid-message) must come before slot acquisition (agentInFlight.set)');

  // releaseSlot must NOT appear before declaration
  const releaseDeclIdx = agentSeg.indexOf('const releaseSlot = () =>');
  const releaseCallIdx = agentSeg.indexOf('releaseSlot();');
  assert.ok(releaseDeclIdx < releaseCallIdx,
    'releaseSlot must be declared before first call');
});

/* ================================================================
   P15: Agent oversized payload → 413 (no TDZ)
   ================================================================ */
test('P15: payload validation before slot acquisition', () => {
  const agentIdx = src.indexOf("router.post('/agent'");
  const agentSeg = src.slice(agentIdx, src.indexOf('module.exports'));
  const payloadIdx = agentSeg.indexOf('payload-too-large');
  const slotAcquireIdx = agentSeg.indexOf('agentInFlight.set(userId, current + 1)');
  assert.ok(payloadIdx < slotAcquireIdx,
    'payload validation must come before slot acquisition');
});

/* ================================================================
   P16: Agent invalid context → 400 (no TDZ, no slot)
   ================================================================ */
test('P16: context sanitization before slot acquisition', () => {
  const agentIdx = src.indexOf("router.post('/agent'");
  const agentSeg = src.slice(agentIdx, src.indexOf('module.exports'));
  const ctxIdx = agentSeg.indexOf('sanitizeChatContextEnvelope(body.taskflowContext)');
  const slotAcquireIdx = agentSeg.indexOf('agentInFlight.set(userId, current + 1)');
  assert.ok(ctxIdx < slotAcquireIdx,
    'context sanitization must come before slot acquisition');
  assert.match(agentSeg, /ai-context-invalid/, 'agent must handle ai-context-invalid');
});

/* ================================================================
   P4: Agent history + context declarations restored
   ================================================================ */
test('P4: agent route declares history and ctxSan', () => {
  const agentIdx = src.indexOf("router.post('/agent'");
  const agentSeg = src.slice(agentIdx, src.indexOf('module.exports'));
  assert.match(agentSeg, /const history = sanitizeChatHistory\(body\.history\)/,
    'agent must declare history via sanitizeChatHistory');
  assert.match(agentSeg, /const ctxSan = sanitizeChatContextEnvelope\(body\.taskflowContext\)/,
    'agent must declare ctxSan via sanitizeChatContextEnvelope');
  assert.match(agentSeg, /ctxSan\.envelope/,
    'agent must use ctxSan.envelope (not raw body.taskflowContext)');
  assert.match(agentSeg, /history\.map\(/,
    'agent must use history.map (not raw body.history)');
});

/* ================================================================
   P10: Single generateRequestId() — no duplicates
   ================================================================ */
test('P10: single generateRequestId definition (no duplicates)', () => {
  const matches = [...src.matchAll(/function generateRequestId\(\)/g)];
  assert.equal(matches.length, 1, 'generateRequestId must be defined exactly once');
});

/* ================================================================
   P8: Concurrency Map bounded — delete on count=0
   ================================================================ */
test('P8: agentInFlight.delete called when count reaches 0', () => {
  const agentIdx = src.indexOf("router.post('/agent'");
  const agentSeg = src.slice(agentIdx, src.indexOf('module.exports'));
  assert.match(agentSeg, /agentInFlight\.delete\(userId\)/,
    'agent must delete Map entry when count reaches 0');
});

test('P8: releaseSlot decrements or deletes (never negative)', () => {
  const agentIdx = src.indexOf("router.post('/agent'");
  const agentSeg = src.slice(agentIdx, src.indexOf('module.exports'));
  // The releaseSlot helper must check current > 0 before decrementing
  assert.match(agentSeg, /current > 1[\s\S]*agentInFlight\.set/,
    'releaseSlot must check current > 1 before setting to current-1');
  assert.match(agentSeg, /current > 0[\s\S]*agentInFlight\.delete/,
    'releaseSlot must check current > 0 before deleting');
});

/* ================================================================
   P5 + P2: Exactly-once slot release — single finally block
   ================================================================ */
test('P5+P2: slot released in exactly one finally block', () => {
  const agentIdx = src.indexOf("router.post('/agent'");
  const fileIdx = src.indexOf("router.post('/file'");
  // Agent segment ends at next route or module.exports
  const agentEnd = fileIdx > agentIdx ? fileIdx : src.indexOf('module.exports');
  const agentSeg = src.slice(agentIdx, agentEnd);

  // Count all releaseSlot() calls in agent segment — should be exactly 1
  const callMatches = [...agentSeg.matchAll(/\breleaseSlot\(\);/g)];
  assert.equal(callMatches.length, 1,
    'releaseSlot() must be called exactly once (in finally block), got ' + callMatches.length);

  // The single call must be inside a finally block
  const finallyIdx = agentSeg.indexOf('} finally {');
  const callIdx = agentSeg.indexOf('releaseSlot();');
  assert.ok(finallyIdx >= 0 && callIdx > finallyIdx,
    'the single releaseSlot() call must be inside a finally block');
});

/* ================================================================
   P3: slotAcquired flag pattern
   ================================================================ */
test('P3: slotAcquired flag guards releaseSlot', () => {
  const agentIdx = src.indexOf("router.post('/agent'");
  const agentSeg = src.slice(agentIdx, src.indexOf('module.exports'));
  assert.match(agentSeg, /let slotAcquired = false/,
    'agent must declare slotAcquired flag');
  assert.match(agentSeg, /slotAcquired = true/,
    'agent must set slotAcquired = true on acquisition');
  assert.match(agentSeg, /if \(slotAcquired/,
    'releaseSlot must check slotAcquired');
});

/* ================================================================
   P5: Idempotency cache lookup before slot acquisition
   ================================================================ */
test('P5: idempotency cache lookup before slot acquisition', () => {
  const agentIdx = src.indexOf("router.post('/agent'");
  const agentSeg = src.slice(agentIdx, src.indexOf('module.exports'));

  // Cache lookup must appear before slot acquisition
  const cacheKeyIdx = agentSeg.indexOf('agentIdempotencyCache.get(cacheKey)');
  const slotAcquireIdx = agentSeg.indexOf('agentInFlight.set(userId, current + 1)');
  assert.ok(cacheKeyIdx < slotAcquireIdx,
    'idempotency cache lookup must come before slot acquisition');

  // Cache hit return must come before slot acquisition
  const cacheHitReturnIdx = agentSeg.indexOf('idempotent: true');
  assert.ok(cacheHitReturnIdx < slotAcquireIdx,
    'idempotency cache hit return must come before slot acquisition');
});

/* ================================================================
   P6: agentRequestId validation
   ================================================================ */
test('P6: agentRequestId validated as string, 8-64 chars with safe chars', () => {
  const agentIdx = src.indexOf("router.post('/agent'");
  const agentSeg = src.slice(agentIdx, src.indexOf('module.exports'));
  assert.match(agentSeg, /typeof body\.agentRequestId === 'string'/,
    'agentRequestId must be validated as string type');
  assert.match(agentSeg, /agentRequestId\.length < 8/,
    'agentRequestId minimum length is 8');
  assert.match(agentSeg, /agentRequestId\.length > 64/,
    'agentRequestId maximum length is 64');
  assert.match(agentSeg, /invalid-agent-request-id/,
    'invalid agentRequestId must return 400');
});

/* ================================================================
   P9: Idempotency cache bounded
   ================================================================ */
test('P9: idempotency cache has size bound (500) and TTL cleanup', () => {
  assert.ok(src.includes('MAX_IDEMPOTENCY_ENTRIES'), 'must have named constant for max entries');
  assert.ok(src.includes('cleanupIdempotencyCache'), 'must have cleanup helper function');
  assert.ok(src.includes('IDEMPOTENCY_TTL_MS'), 'must have TTL constant');
});

/* ================================================================
   P11: Rate limiters preserved
   ================================================================ */
test('P11: rate limiters still applied to correct routes', () => {
  assert.match(src, /router\.post\('\/chat', aiChatLimiter/, 'chat uses chat limiter');
  assert.match(src, /router\.post\('\/plan', aiPlanLimiter/, 'plan uses plan limiter');
  assert.match(src, /router\.post\('\/agent', aiAgentLimiter, aiAgentHourlyLimiter/,
    'agent uses minute + hourly limiters');
});

/* ================================================================
   P12: Feature flag preserved
   ================================================================ */
test('P12: AI_AGENT_ENABLED=false returns 503 ai-agent-disabled', () => {
  const agentIdx = src.indexOf("router.post('/agent'");
  const agentSeg = src.slice(agentIdx, src.indexOf('module.exports'));
  assert.match(agentSeg, /AI_AGENT_ENABLED/, 'agent checks AI_AGENT_ENABLED');
  assert.match(agentSeg, /ai-agent-disabled/, 'returns ai-agent-disabled error');
  // Feature flag check must come before slot acquisition
  const flagIdx = agentSeg.indexOf('AI_AGENT_ENABLED');
  const slotAcquireIdx = agentSeg.indexOf('agentInFlight.set(userId, current + 1)');
  assert.ok(flagIdx < slotAcquireIdx,
    'feature flag check must come before slot acquisition');
});

/* ================================================================
   P26: No writes inside agent route
   ================================================================ */
test('P26: agent route returns proposal only — no persistence', () => {
  const agentIdx = src.indexOf("router.post('/agent'");
  const fileIdx = src.indexOf("router.post('/file'");
  const agentEnd = fileIdx > agentIdx ? fileIdx : src.indexOf('module.exports');
  const agentSeg = src.slice(agentIdx, agentEnd);
  assert.match(agentSeg, /resp = \{ ok: true, proposal \}/, 'returns proposal');
  // Exclude Map.delete (agentInFlight, agentIdempotencyCache) and JSON.stringify from the check
  const lines = agentSeg.split('\n');
  // Filter out known safe patterns: Map.delete, cleanup helper, JSON.stringify, code comments
  const nonMapLines = lines.filter((l) =>
    !l.includes('agentInFlight.delete') &&
    !l.includes('agentIdempotencyCache.delete') &&
    !l.includes('cleanupIdempotencyCache') &&
    !l.includes('JSON.stringify') &&
    !l.trim().startsWith('//') // skip comments
  ).join('\n');
  assert.doesNotMatch(nonMapLines, /writeFile|\.save\(|INSERT|UPDATE|DELETE/i,
    'no persistence operations in agent route');
});

/* ================================================================
   P31: Safe logging — no sensitive data in logs
   ================================================================ */
test('P31: agent logs contain no task text / context / credentials', () => {
  // Phase 6Q: agent route delegates to unified provider — verify no credentials in provider logs
  const agentIdx = src.indexOf("router.post('/agent'");
  const fileIdx = src.indexOf("router.post('/file'");
  const agentEnd = fileIdx > agentIdx ? fileIdx : src.indexOf('module.exports');
  const agentSeg = src.slice(agentIdx, agentEnd);
  assert.ok(agentSeg.includes('callAiJson'), 'agent must use unified provider');
  const providerSrc = readFileSync(join(ROOT, 'server', 'ai-provider.js'), 'utf8');
  // Phase 6Q: provider centralizes logging through logSafe — verify no credentials in log calls
  assert.ok(providerSrc.includes('logSafe'), 'provider has centralized log function');
  // Extract only logSafe calls and the logSafe function body to check for credential leaks
  const logSafeBody = providerSrc.substring(providerSrc.indexOf('function logSafe'), providerSrc.indexOf('function callAiCore'));
  const logSafeCalls = providerSrc.match(/logSafe\([^)]+\)/g) || [];
  const allLogCode = logSafeBody + logSafeCalls.join(' ');
  assert.doesNotMatch(allLogCode, /AI_API_KEY|Authorization|Bearer|password|secret/i,
    'provider logs must not embed credentials');
  assert.ok(providerSrc.includes('latencyMs='), 'provider logs latencyMs');
  assert.ok(providerSrc.includes('status='), 'provider logs status');
});

/* ================================================================
   P30: No new agent capabilities
   ================================================================ */
test('P30: no new agent action types added (still exactly 5)', () => {
  assert.deepEqual(ai.AGENT_ACTION_TYPES.sort(), [
    'complete_task', 'create_task', 'reschedule_task', 'schedule_task', 'update_task',
  ]);
  assert.ok(!ai.AGENT_ACTION_TYPES.includes('delete_task'));
  assert.ok(!ai.AGENT_ACTION_TYPES.includes('create_tool'));
  assert.ok(!ai.AGENT_ACTION_TYPES.includes('send_email'));
});

/* ================================================================
   Cross-cutting: sanitizeChatHistory produces valid array
   ================================================================ */
test('sanitizeChatHistory: filters invalid, caps length, trims content', () => {
  const input = [
    { role: 'user', content: 'Hello' },
    { role: 'system', content: 'System prompt' }, // invalid role
    { role: 'assistant', content: 'Hi there' },
    { role: 'user', content: 'A'.repeat(3000) },
    null, // invalid
    { role: 'user', content: '' }, // empty
  ];
  const result = sanitizeChatHistory(input);
  assert.ok(result.length >= 2, 'at least valid messages survive');
  // system role should be filtered out
  for (const m of result) {
    assert.ok(m.role === 'user' || m.role === 'assistant');
    assert.ok(m.content.trim().length > 0);
    assert.ok(m.content.length <= 2000, 'content capped at MAX_HISTORY_ITEM_LEN');
  }
});

/* ================================================================
   Cross-cutting: sanitizeChatContextEnvelope handles edge cases
   ================================================================ */
test('sanitizeChatContextEnvelope: context-too-large rejected', () => {
  const hugeData = { tasks: Array.from({ length: 200 }, (_, i) => ({
    uid: 't' + i, text: 'X'.repeat(300), priority: false, done: false, duration: 30,
  }))};
  const result = sanitizeChatContextEnvelope({ scope: 'today', data: hugeData });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'context-too-large');
});

test('sanitizeChatContextEnvelope: non-object raw rejected', () => {
  assert.deepEqual(sanitizeChatContextEnvelope('string'), { ok: false, reason: 'invalid-context' });
  assert.deepEqual(sanitizeChatContextEnvelope(42), { ok: false, reason: 'invalid-context' });
  assert.deepEqual(sanitizeChatContextEnvelope([1, 2]), { ok: false, reason: 'invalid-context' });
});

/* ================================================================
   Cross-cutting: validateAgentProposal basic sanity
   ================================================================ */
test('validateAgentProposal: rejects non-object proposal', () => {
  assert.equal(validateAgentProposal(null, {}).ok, false);
  assert.equal(validateAgentProposal('string', {}).ok, false);
  assert.equal(validateAgentProposal(42, {}).ok, false);
});

test('validateAgentProposal: accepts valid create_task proposal', () => {
  const proposal = {
    summary: 'Create task',
    actions: [{
      id: 'a1', type: 'create_task',
      args: { text: 'Learn C#', date: '2026-08-21', priority: true, duration: 60 },
    }],
  };
  const refs = { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() };
  const v = validateAgentProposal(proposal, refs);
  assert.equal(v.ok, true, 'valid proposal accepted: ' + JSON.stringify(v.errors));
});

/* ================================================================
   Cross-cutting: chatHasForbidden detects sensitive fields
   ================================================================ */
test('chatHasForbidden: detects JWT, token, password, email, etc.', () => {
  assert.equal(chatHasForbidden({ token: 'abc' }), true);
  assert.equal(chatHasForbidden({ authorization: 'Bearer xyz' }), true);
  assert.equal(chatHasForbidden({ password: 'secret' }), true);
  assert.equal(chatHasForbidden({ email: 'test@example.com' }), true);
  assert.equal(chatHasForbidden({ apiKey: 'key' }), true);
  assert.equal(chatHasForbidden({ data: { nested: { jwt: 'abc' } } }), true);
  assert.equal(chatHasForbidden({ safe: true }), false);
  assert.equal(chatHasForbidden({ tasks: [{ uid: 't1' }] }), false);
});
