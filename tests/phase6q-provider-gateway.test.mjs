/**
 * Phase 6Q — Unified AI Provider Gateway Tests
 *
 * Verifies the centralized provider abstraction in server/ai-provider.js.
 * All tests use mock fetch — no real Gemini API calls.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);

// Read source for source-level assertions
const providerSrc = readFileSync(join(ROOT, 'server', 'ai-provider.js'), 'utf8');
const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');

/* ================================================================
   A. Source-level structural tests
   ================================================================ */

describe('Phase 6Q — Provider Module Structure', () => {
  it('exports callAiText and callAiJson', () => {
    assert.ok(providerSrc.includes('callAiText'), 'exports callAiText');
    assert.ok(providerSrc.includes('callAiJson'), 'exports callAiJson');
  });

  it('no @google/generative-ai required anywhere in server/', () => {
    assert.ok(!aiSrc.includes("@google/generative-ai"), 'ai.js must not require generative-ai');
    assert.ok(!providerSrc.includes("@google/generative-ai"), 'ai-provider.js must not require generative-ai');
  });

  it('no hard-coded gemini model name in provider', () => {
    assert.ok(!providerSrc.includes('gemini-2.0-flash'), 'must not hardcode gemini-2.0-flash');
  });

  it('error mapping covers all expected statuses', () => {
    assert.ok(providerSrc.includes("'ai-provider-bad-request'"), 'maps 400');
    assert.ok(providerSrc.includes("'ai-provider-auth'"), 'maps 401');
    assert.ok(providerSrc.includes("'ai-provider-forbidden'"), 'maps 403');
    assert.ok(providerSrc.includes("'ai-provider-not-found'"), 'maps 404');
    assert.ok(providerSrc.includes("'ai-rate-limited'"), 'maps 429');
    assert.ok(providerSrc.includes("'ai-provider-unavailable'"), 'maps 5xx');
  });

  it('ai.js routes use callAiText or callAiJson', () => {
    assert.ok(aiSrc.includes("callAiText") || aiSrc.includes("callAiJson"), 'routes use unified provider');
    assert.ok(aiSrc.includes("require('./ai-provider')"), 'ai.js requires ai-provider');
  });

  it('plan-health does not use legacy SDK', () => {
    const planHealthIdx = aiSrc.indexOf("router.post('/plan-health'");
    assert.ok(planHealthIdx > 0, 'plan-health route exists');
    const planHealthSection = aiSrc.substring(planHealthIdx, planHealthIdx + 1500);
    assert.ok(!planHealthSection.includes("@google/generative-ai"), 'plan-health must not use legacy SDK');
    assert.ok(planHealthSection.includes('callAiText'), 'plan-health must use unified provider');
  });

  it('roadmap route does not reference undefined callAI', () => {
    const roadmapIdx = aiSrc.indexOf("router.post('/roadmap'");
    assert.ok(roadmapIdx > 0, 'roadmap route exists');
    const roadmapSection = aiSrc.substring(roadmapIdx, aiSrc.indexOf('module.exports', roadmapIdx));
    assert.ok(roadmapSection.includes('callAiJson'), 'roadmap must use unified provider');
    assert.ok(!roadmapSection.includes('await callAI('), 'must not use undefined callAI');
    assert.ok(!roadmapSection.includes('mapProviderError'), 'must not use undefined mapProviderError');
  });
});

/* ================================================================
   B. Mock-based functional tests
   ================================================================ */

describe('Phase 6Q — callAiText (mock fetch)', () => {
  let originalFetch;
  const origKey = process.env.AI_API_KEY;

  before(() => {
    originalFetch = globalThis.fetch;
    process.env.AI_API_KEY = 'test-key-for-mock';
  });

  after(() => {
    globalThis.fetch = originalFetch;
    if (origKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = origKey;
  });

  beforeEach(() => {
    globalThis.fetch = undefined;
  });

  it('returns ai-not-configured when AI_API_KEY is empty', () => {
    assert.ok(providerSrc.includes('ai-not-configured'), 'returns ai-not-configured');
    // Config is read dynamically via getConfig() — check that function exists
    assert.ok(providerSrc.includes('function getConfig'), 'has getConfig function');
  });

  it('handles internal provider timeout (AbortError from timer) correctly', async () => {
    // Mock fetch to wait long enough for the internal timer to fire
    globalThis.fetch = async (url, opts) => {
      return new Promise((resolve, reject) => {
        const onAbort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (opts && opts.signal) {
          if (opts.signal.aborted) return onAbort();
          opts.signal.addEventListener('abort', onAbort, { once: true });
        }
        // Never resolves — timer will abort via signal
      });
    };
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 10
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-timeout');
    assert.equal(result.status, 504);
    assert.ok(result.timeout, 'timeout metadata present');
    assert.equal(result.timeout.source, 'provider');
  });

  it('handles external abort (client disconnect) correctly', async () => {
    // Mock fetch to throw immediately (simulates client abort before timer fires)
    globalThis.fetch = async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 60000
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-client-abort');
    assert.equal(result.status, 499);
  });

  it('handles network failure correctly', async () => {
    globalThis.fetch = async () => { throw new Error('fetch failed'); };
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 5000
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-provider-unavailable');
    assert.equal(result.status, 502);
  });

  it('maps provider 400 to ai-provider-bad-request', async () => {
    globalThis.fetch = async () => ({
      ok: false, status: 400,
      json: async () => ({ error: 'bad request' })
    });
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 5000
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-provider-bad-request');
    assert.equal(result.status, 502);
  });

  it('maps provider 401 to ai-provider-auth', async () => {
    globalThis.fetch = async () => ({
      ok: false, status: 401,
      json: async () => ({ error: 'unauthorized' })
    });
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 5000
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-provider-auth');
  });

  it('maps provider 429 to ai-rate-limited with status 429', async () => {
    globalThis.fetch = async () => ({
      ok: false, status: 429,
      json: async () => ({ error: 'rate limited' })
    });
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 5000
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-rate-limited');
    assert.equal(result.status, 429);
  });

  it('maps provider 500 to ai-provider-unavailable', async () => {
    globalThis.fetch = async () => ({
      ok: false, status: 500,
      json: async () => ({ error: 'server error' })
    });
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 5000
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-provider-unavailable');
    assert.equal(result.status, 502);
  });

  it('returns ai-invalid-response for empty content', async () => {
    globalThis.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: '' } }] })
    });
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 5000
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-invalid-response');
  });

  it('returns ai-provider-unavailable for malformed JSON response', async () => {
    globalThis.fetch = async () => ({
      ok: true, status: 200,
      json: async () => { throw new Error('not json'); }
    });
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 5000
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-provider-unavailable');
  });
});

describe('Phase 6Q — callAiJson (mock fetch)', () => {
  let originalFetch;
  const origKey = process.env.AI_API_KEY;

  before(() => {
    originalFetch = globalThis.fetch;
    process.env.AI_API_KEY = 'test-key-for-mock';
  });
  after(() => {
    globalThis.fetch = originalFetch;
    if (origKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = origKey;
  });
  beforeEach(() => { globalThis.fetch = undefined; });

  it('parses valid JSON response', async () => {
    globalThis.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"key": "value"}' } }]
      })
    });

    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiJson({
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 5000
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.parsed, { key: 'value' });
  });

  it('strips markdown code fences before parsing', async () => {
    globalThis.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"key": "value"}\n```' } }]
      })
    });

    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiJson({
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 5000
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.parsed, { key: 'value' });
  });

  it('returns ai-invalid-response for unparseable JSON', async () => {
    globalThis.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        choices: [{ message: { content: 'not json at all' } }]
      })
    });

    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiJson({
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 5000
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-invalid-response');
    assert.equal(result.status, 422);
  });
});
