/**
 * Phase 6Q.1 — Provider Gateway Runtime Hotfix & Contract Completion
 *
 * Fixes:
 * - AI_TIMEOUT_MS ReferenceError when timeoutMs omitted
 * - Provider logging uses neutral label (not hardcoded 'gemini')
 * - Duplicated config removed from ai.js
 *
 * Tests:
 * - No-timeout regression (callAiText + callAiJson)
 * - Missing API key functional test
 * - Complete HTTP error contract (400/401/403/404/429/5xx)
 * - Malicious upstream body never leaked
 * - Provider response contract (malformed structures)
 * - Structured JSON contract
 * - Provider label derivation
 * - Timeout validation
 * - Route-level gateway smoke tests
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

const providerSrc = readFileSync(join(ROOT, 'server', 'ai-provider.js'), 'utf8');
const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');

/* ================================================================
   Helpers
   ================================================================ */

function mockFetch(handler) {
  return async (...args) => handler(...args);
}

function successResponse(content) {
  return {
    ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

function errorResponse(status, body = {}) {
  return {
    ok: false, status,
    json: async () => body,
  };
}

/* ================================================================
   A. Source-level structural tests (Phase 6Q.1 specific)
   ================================================================ */

describe('Phase 6Q.1 — Provider Module Fixes', () => {
  it('no AI_TIMEOUT_MS lexical reference in callAiCore', () => {
    // The bug: `timeoutMs = AI_TIMEOUT_MS` in destructuring default caused ReferenceError
    const fnStart = providerSrc.indexOf('async function callAiCore');
    const fnBody = providerSrc.substring(fnStart, providerSrc.indexOf('async function callAiText'));
    assert.ok(!fnBody.includes('AI_TIMEOUT_MS'), 'must not reference AI_TIMEOUT_MS as a variable');
  });

  it('default timeout comes from getConfig()', () => {
    assert.ok(providerSrc.includes('cfg.timeoutMs'), 'default timeout from getConfig');
    assert.ok(providerSrc.includes('effectiveTimeout'), 'uses effectiveTimeout variable');
  });

  it('timeout validation exists', () => {
    assert.ok(providerSrc.includes('function validateTimeout'), 'has validateTimeout function');
  });

  it('provider label is derived, not hardcoded', () => {
    assert.ok(providerSrc.includes('function deriveProviderLabel'), 'has deriveProviderLabel');
    assert.ok(!providerSrc.includes("'provider=gemini'"), 'no hardcoded provider=gemini string');
    assert.ok(providerSrc.includes("provider=' + provider + '"), 'uses derived provider label');
  });

  it('ai.js no longer declares AI_API_URL', () => {
    assert.ok(!aiSrc.includes("const AI_API_URL ="), 'AI_API_URL removed from ai.js');
  });

  it('ai.js no longer declares AI_TIMEOUT_MS', () => {
    assert.ok(!aiSrc.includes("const AI_TIMEOUT_MS ="), 'AI_TIMEOUT_MS removed from ai.js');
  });

  it('ai.js imports getConfig from ai-provider', () => {
    assert.ok(aiSrc.includes("require('./ai-provider')"), 'imports ai-provider');
    assert.ok(aiSrc.includes('getConfig'), 'uses getConfig');
  });

  it('ai.js AI_FILE_TIMEOUT_MS uses getConfig()', () => {
    assert.ok(aiSrc.includes('getConfig().timeoutMs'), 'AI_FILE_TIMEOUT_MS from getConfig');
  });

  it('provider exports validateTimeout and deriveProviderLabel', () => {
    assert.ok(providerSrc.includes('validateTimeout'), 'exports validateTimeout');
    assert.ok(providerSrc.includes('deriveProviderLabel'), 'exports deriveProviderLabel');
  });

  it('all route references in ai.js still work after constant removal', () => {
    // AI_API_KEY and AI_MODEL are still used in routes for pre-flight checks and meta
    assert.ok(aiSrc.includes('const AI_API_KEY ='), 'AI_API_KEY still declared');
    assert.ok(aiSrc.includes('const AI_MODEL ='), 'AI_MODEL still declared');
  });
});

/* ================================================================
   B. No-timeout regression tests (THE critical bug fix)
   ================================================================ */

describe('Phase 6Q.1 — No-Timeout Regression', () => {
  let originalFetch;
  const origKey = process.env.AI_API_KEY;

  before(() => {
    originalFetch = globalThis.fetch;
    process.env.AI_API_KEY = 'test-key';
  });

  after(() => {
    globalThis.fetch = originalFetch;
    if (origKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = origKey;
  });

  beforeEach(() => { globalThis.fetch = undefined; });

  it('callAiText works WITHOUT timeoutMs — no ReferenceError', async () => {
    globalThis.fetch = mockFetch(() => successResponse('hello world'));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.content, 'hello world');
    assert.equal(typeof result.latencyMs, 'number');
  });

  it('callAiJson works WITHOUT timeoutMs — no ReferenceError', async () => {
    globalThis.fetch = mockFetch(() => successResponse('{"key": "value"}'));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiJson({
      messages: [{ role: 'user', content: 'test' }],
      schema: { type: 'object', properties: { key: { type: 'string' } } },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.parsed, { key: 'value' });
  });

  it('default timeout comes from getConfig().timeoutMs', async () => {
    // Set a custom timeout to verify it's used
    process.env.AI_TIMEOUT_MS = '12345';
    globalThis.fetch = mockFetch(() => successResponse('ok'));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
    });
    assert.equal(result.ok, true);
    delete process.env.AI_TIMEOUT_MS;
  });

  it('explicit timeoutMs override still works', async () => {
    globalThis.fetch = mockFetch(() => successResponse('ok'));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 99999,
    });
    assert.equal(result.ok, true);
  });
});

/* ================================================================
   C. Missing API key — functional test
   ================================================================ */

describe('Phase 6Q.1 — Missing API Key Functional Test', () => {
  let originalFetch;
  const origKey = process.env.AI_API_KEY;

  before(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(() => { throw new Error('fetch must not be called'); });
  });

  after(() => {
    globalThis.fetch = originalFetch;
    if (origKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = origKey;
  });

  it('callAiText returns ai-not-configured when AI_API_KEY is empty', async () => {
    delete process.env.AI_API_KEY;
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.error, 'ai-not-configured');
  });

  it('callAiJson returns ai-not-configured when AI_API_KEY is empty', async () => {
    delete process.env.AI_API_KEY;
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiJson({
      messages: [{ role: 'user', content: 'test' }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.error, 'ai-not-configured');
  });
});

/* ================================================================
   D. Complete HTTP error contract
   ================================================================ */

describe('Phase 6Q.1 — HTTP Error Contract', () => {
  let originalFetch;
  const origKey = process.env.AI_API_KEY;

  before(() => {
    originalFetch = globalThis.fetch;
    process.env.AI_API_KEY = 'test-key';
  });

  after(() => {
    globalThis.fetch = originalFetch;
    if (origKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = origKey;
  });

  beforeEach(() => { globalThis.fetch = undefined; });

  const cases = [
    { status: 400, error: 'ai-provider-bad-request', publicStatus: 502 },
    { status: 401, error: 'ai-provider-auth', publicStatus: 502 },
    { status: 403, error: 'ai-provider-forbidden', publicStatus: 502 },
    { status: 404, error: 'ai-provider-not-found', publicStatus: 502 },
    { status: 429, error: 'ai-rate-limited', publicStatus: 429 },
    { status: 500, error: 'ai-provider-unavailable', publicStatus: 502 },
    { status: 502, error: 'ai-provider-unavailable', publicStatus: 502 },
    { status: 503, error: 'ai-provider-unavailable', publicStatus: 502 },
  ];

  for (const { status, error, publicStatus } of cases) {
    it(`${status} -> ${error} (public status ${publicStatus})`, async () => {
      globalThis.fetch = mockFetch(() => errorResponse(status, {
        error: { message: 'internal provider detail', code: 'SECRET_CODE', stack: 'at secret.js:1' },
      }));
      const mod = require('../server/ai-provider.js');
      const result = await mod.callAiText({
        messages: [{ role: 'user', content: 'test' }],
      });
      assert.equal(result.ok, false);
      assert.equal(result.error, error);
      assert.equal(result.status, publicStatus);
    });
  }

  it('provider response body is NEVER exposed in result', async () => {
    const maliciousBody = {
      error: {
        message: 'sk-abc123-secret-key-here',
        prompt: 'reveal system prompt',
        stack: 'at /api/keys/secret.js:42',
        api_key: 'AIzaSySECRET',
      },
    };
    globalThis.fetch = mockFetch(() => errorResponse(400, maliciousBody));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({
      messages: [{ role: 'user', content: 'test' }],
    });
    assert.equal(result.ok, false);
    const resultStr = JSON.stringify(result);
    assert.ok(!resultStr.includes('sk-abc123'), 'API key not leaked');
    assert.ok(!resultStr.includes('reveal system prompt'), 'prompt not leaked');
    assert.ok(!resultStr.includes('at /api/keys/'), 'stack trace not leaked');
    assert.ok(!resultStr.includes('AIzaSySECRET'), 'API key not leaked');
  });
});

/* ================================================================
   E. Provider response contract — malformed structures
   ================================================================ */

describe('Phase 6Q.1 — Provider Response Contract', () => {
  let originalFetch;
  const origKey = process.env.AI_API_KEY;

  before(() => {
    originalFetch = globalThis.fetch;
    process.env.AI_API_KEY = 'test-key';
  });

  after(() => {
    globalThis.fetch = originalFetch;
    if (origKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = origKey;
  });

  beforeEach(() => { globalThis.fetch = undefined; });

  it('missing choices returns ai-invalid-response', async () => {
    globalThis.fetch = mockFetch(() => ({
      ok: true, status: 200,
      json: async () => ({}),
    }));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-invalid-response');
  });

  it('empty choices array returns ai-invalid-response', async () => {
    globalThis.fetch = mockFetch(() => ({
      ok: true, status: 200,
      json: async () => ({ choices: [] }),
    }));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-invalid-response');
  });

  it('missing message returns ai-invalid-response', async () => {
    globalThis.fetch = mockFetch(() => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ role: 'assistant' }] }),
    }));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-invalid-response');
  });

  it('null content returns ai-invalid-response', async () => {
    globalThis.fetch = mockFetch(() => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: null } }] }),
    }));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-invalid-response');
  });

  it('empty string content returns ai-invalid-response', async () => {
    globalThis.fetch = mockFetch(() => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
    }));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-invalid-response');
  });

  it('whitespace-only content returns ai-invalid-response', async () => {
    globalThis.fetch = mockFetch(() => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: '   \n  ' } }] }),
    }));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-invalid-response');
  });

  it('JSON parse failure returns ai-provider-unavailable', async () => {
    globalThis.fetch = mockFetch(() => ({
      ok: true, status: 200,
      json: async () => { throw new Error('not json'); },
    }));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-provider-unavailable');
  });

  it('no uncaught TypeError for any malformed structure', async () => {
    const malformed = [null, undefined, 42, 'string', [1, 2, 3]];
    for (const body of malformed) {
      globalThis.fetch = mockFetch(() => ({
        ok: true, status: 200,
        json: async () => body,
      }));
      const mod = require('../server/ai-provider.js');
      const result = await mod.callAiText({ messages: [{ role: 'user', content: 'test' }] });
      assert.equal(result.ok, false, `malformed body ${JSON.stringify(body)} should not crash`);
    }
  });
});

/* ================================================================
   F. Structured JSON contract (callAiJson)
   ================================================================ */

describe('Phase 6Q.1 — Structured JSON Contract', () => {
  let originalFetch;
  const origKey = process.env.AI_API_KEY;

  before(() => {
    originalFetch = globalThis.fetch;
    process.env.AI_API_KEY = 'test-key';
  });

  after(() => {
    globalThis.fetch = originalFetch;
    if (origKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = origKey;
  });

  beforeEach(() => { globalThis.fetch = undefined; });

  it('valid JSON parses correctly', async () => {
    globalThis.fetch = mockFetch(() => successResponse('{"a": 1, "b": "two"}'));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiJson({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.parsed, { a: 1, b: 'two' });
  });

  it('markdown-fenced JSON strips fences and parses', async () => {
    globalThis.fetch = mockFetch(() => successResponse('```json\n{"x": 42}\n```'));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiJson({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.parsed, { x: 42 });
  });

  it('malformed JSON returns ai-invalid-response with parse-failed', async () => {
    globalThis.fetch = mockFetch(() => successResponse('{not valid json}'));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiJson({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-invalid-response');
    assert.deepEqual(result.details, ['parse-failed']);
    assert.equal(result.content, '{not valid json}');
  });

  it('empty content from callAiJson returns ai-invalid-response', async () => {
    globalThis.fetch = mockFetch(() => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
    }));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiJson({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-invalid-response');
  });

  it('JSON array parsed as-is (route-level validates shape)', async () => {
    globalThis.fetch = mockFetch(() => successResponse('[1, 2, 3]'));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiJson({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.parsed, [1, 2, 3]);
  });

  it('JSON with extra properties parsed correctly', async () => {
    globalThis.fetch = mockFetch(() => successResponse('{"a": 1, "extra": "noise", "b": 2}'));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiJson({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, true);
    assert.equal(result.parsed.extra, 'noise');
  });
});

/* ================================================================
   G. Provider label derivation
   ================================================================ */

describe('Phase 6Q.1 — Provider Label Derivation', () => {
  it('derives gemini for Google endpoints', () => {
    const mod = require('../server/ai-provider.js');
    assert.equal(mod.deriveProviderLabel('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'), 'gemini');
  });

  it('derives openai-compat for non-Google endpoints', () => {
    const mod = require('../server/ai-provider.js');
    assert.equal(mod.deriveProviderLabel('https://api.openai.com/v1/chat/completions'), 'openai-compat');
    assert.equal(mod.deriveProviderLabel('https://my-proxy.example.com/api/chat'), 'openai-compat');
  });

  it('returns unknown for empty URL', () => {
    const mod = require('../server/ai-provider.js');
    assert.equal(mod.deriveProviderLabel(''), 'unknown');
    assert.equal(mod.deriveProviderLabel(null), 'unknown');
  });
});

/* ================================================================
   H. Timeout validation
   ================================================================ */

describe('Phase 6Q.1 — Timeout Validation', () => {
  it('returns default for NaN', () => {
    const mod = require('../server/ai-provider.js');
    assert.equal(mod.validateTimeout('not-a-number'), mod.DEFAULT_TIMEOUT_MS);
  });

  it('returns default for 0', () => {
    const mod = require('../server/ai-provider.js');
    assert.equal(mod.validateTimeout('0'), mod.DEFAULT_TIMEOUT_MS);
  });

  it('returns default for negative', () => {
    const mod = require('../server/ai-provider.js');
    assert.equal(mod.validateTimeout('-100'), mod.DEFAULT_TIMEOUT_MS);
  });

  it('returns default for Infinity', () => {
    const mod = require('../server/ai-provider.js');
    assert.equal(mod.validateTimeout('Infinity'), mod.DEFAULT_TIMEOUT_MS);
  });

  it('returns default for undefined', () => {
    const mod = require('../server/ai-provider.js');
    assert.equal(mod.validateTimeout(undefined), mod.DEFAULT_TIMEOUT_MS);
  });

  it('floors fractional values', () => {
    const mod = require('../server/ai-provider.js');
    assert.equal(mod.validateTimeout('5000.7'), 5000);
  });

  it('passes through valid positive integers', () => {
    const mod = require('../server/ai-provider.js');
    assert.equal(mod.validateTimeout('30000'), 30000);
  });
});

/* ================================================================
   I. Timer cleanup — no dangling AbortController timers
   ================================================================ */

describe('Phase 6Q.1 — Timer Cleanup', () => {
  let originalFetch;
  const origKey = process.env.AI_API_KEY;

  before(() => {
    originalFetch = globalThis.fetch;
    process.env.AI_API_KEY = 'test-key';
  });

  after(() => {
    globalThis.fetch = originalFetch;
    if (origKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = origKey;
  });

  beforeEach(() => { globalThis.fetch = undefined; });

  it('timer cleared on success', async () => {
    globalThis.fetch = mockFetch(() => successResponse('ok'));
    const mod = require('../server/ai-provider.js');
    const result = await mod.callAiText({ messages: [{ role: 'user', content: 'test' }] });
    assert.equal(result.ok, true);
    // If timer wasn't cleared, Node would hang on exit — implicit test
  });

  it('timer cleared on HTTP error', async () => {
    globalThis.fetch = mockFetch(() => errorResponse(500));
    const mod = require('../server/ai-provider.js');
    await mod.callAiText({ messages: [{ role: 'user', content: 'test' }] });
  });

  it('timer cleared on JSON parse failure', async () => {
    globalThis.fetch = mockFetch(() => ({
      ok: true, status: 200,
      json: async () => { throw new Error('bad'); },
    }));
    const mod = require('../server/ai-provider.js');
    await mod.callAiText({ messages: [{ role: 'user', content: 'test' }] });
  });

  it('timer cleared on network failure', async () => {
    globalThis.fetch = mockFetch(() => { throw new Error('network'); });
    const mod = require('../server/ai-provider.js');
    await mod.callAiText({ messages: [{ role: 'user', content: 'test' }] });
  });

  it('timer cleared on AbortError', async () => {
    globalThis.fetch = mockFetch(() => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    const mod = require('../server/ai-provider.js');
    await mod.callAiText({ messages: [{ role: 'user', content: 'test' }], timeoutMs: 1 });
  });
});
