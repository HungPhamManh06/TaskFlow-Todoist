/**
 * Phase P0: Agent Provider Timeout Semantics
 * - Provider timeout → 504 (not 502)
 * - External abort → ai-client-abort (not ai-timeout)
 * - Timeout metadata preserved
 * - Shared sendAiProviderError helper used across routes
 * - 429 regression
 * - Success regression
 * - Concurrency slot release after timeout
 * - Agent-specific timeout config
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const aiJS = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
const providerJS = readFileSync(join(ROOT, 'server', 'ai-provider.js'), 'utf8');
const clientJS = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');

/* ============================================================
   1. PROVIDER GATEWAY: timeout vs abort distinction
   ============================================================ */
describe('P0: Provider Gateway — timeout vs abort', () => {

  it('sets timedOut=true before abort on internal timeout', () => {
    assert.ok(
      providerJS.includes("timedOut = true; controller.abort()"),
      'timer callback must set timedOut=true before abort'
    );
  });

  it('timedOut variable declared before timer', () => {
    const timerIdx = providerJS.indexOf('const timer = setTimeout');
    const timedOutIdx = providerJS.indexOf('let timedOut = false');
    assert.ok(timedOutIdx < timerIdx, 'timedOut must be declared before timer setup');
  });

  it('returns ai-timeout with 504 for internal timeout', () => {
    assert.ok(providerJS.includes("error: 'ai-timeout'"), 'returns ai-timeout error');
    assert.ok(providerJS.includes("status: 504"), 'returns 504 status for timeout');
  });

  it('returns ai-client-abort for external abort', () => {
    assert.ok(providerJS.includes("error: 'ai-client-abort'"), 'returns ai-client-abort for external abort');
    assert.ok(providerJS.includes("status: 499"), 'returns 499 status for client abort');
  });

  it('includes timeout metadata in result', () => {
    assert.ok(
      providerJS.includes("timeout: { source: 'provider', timeoutMs: effectiveTimeout, latencyMs }"),
      'timeout metadata includes source, timeoutMs, latencyMs'
    );
  });

  it('logs timeout with timeoutMs and latencyMs', () => {
    assert.ok(
      providerJS.includes('status=timeout timeoutMs='),
      'timeout log includes timeoutMs'
    );
    assert.ok(
      providerJS.includes('status=client-abort'),
      'client abort has separate log line'
    );
  });
});

/* ============================================================
   2. SHARED ERROR HELPER: sendAiProviderError
   ============================================================ */
describe('P0: Shared sendAiProviderError helper', () => {

  it('sendAiProviderError function exists in ai.js', () => {
    assert.ok(aiJS.includes('function sendAiProviderError'), 'helper function exists');
  });

  it('handles ai-timeout → 504', () => {
    const fnStart = aiJS.indexOf('function sendAiProviderError');
    const fnEnd = aiJS.indexOf('\n}', fnStart + 500);
    const fnBody = aiJS.substring(fnStart, fnEnd + 1);
    assert.ok(fnBody.includes("error === 'ai-timeout'"), 'checks for ai-timeout');
    assert.ok(fnBody.includes('504'), 'returns 504 for timeout');
  });

  it('handles 429 → 429 with rate limit', () => {
    const fnStart = aiJS.indexOf('function sendAiProviderError');
    const fnEnd = aiJS.indexOf('\n}', fnStart + 500);
    const fnBody = aiJS.substring(fnStart, fnEnd + 1);
    assert.ok(fnBody.includes('status === 429'), 'checks for 429');
  });

  it('handles ai-not-configured → 503', () => {
    const fnStart = aiJS.indexOf('function sendAiProviderError');
    const fnEnd = aiJS.indexOf('\n}', fnStart + 500);
    const fnBody = aiJS.substring(fnStart, fnEnd + 1);
    assert.ok(fnBody.includes("'ai-not-configured'"), 'checks for not-configured');
    assert.ok(fnBody.includes('503'), 'returns 503');
  });

  it('handles payload-too-large → 413', () => {
    const fnStart = aiJS.indexOf('function sendAiProviderError');
    const fnEnd = aiJS.indexOf('\n}', fnStart + 500);
    const fnBody = aiJS.substring(fnStart, fnEnd + 1);
    assert.ok(fnBody.includes("'payload-too-large'"), 'checks for payload-too-large');
    assert.ok(fnBody.includes('413'), 'returns 413');
  });

  it('includes timeout metadata in response body', () => {
    const fnStart = aiJS.indexOf('function sendAiProviderError');
    const fnEnd = aiJS.indexOf('\n}', fnStart + 500);
    const fnBody = aiJS.substring(fnStart, fnEnd + 1);
    assert.ok(fnBody.includes('aiResult.timeout'), 'includes timeout metadata');
  });
});

/* ============================================================
   3. ALL ROUTES: use sendAiProviderError (no more 502 collapse)
   ============================================================ */
describe('P0: Route audit — all AI routes use shared helper', () => {

  it('/api/ai/plan uses sendAiProviderError', () => {
    const planIdx = aiJS.indexOf("routeName: '/api/ai/plan'");
    const planSegment = aiJS.substring(planIdx, planIdx + 500);
    assert.ok(planSegment.includes('sendAiProviderError'), 'plan route uses shared helper');
  });

  it('/api/ai/plan-synthesis uses sendAiProviderError', () => {
    const idx = aiJS.indexOf("routeName: '/api/ai/plan-synthesis'");
    const segment = aiJS.substring(idx, idx + 500);
    assert.ok(segment.includes('sendAiProviderError'), 'plan-synthesis route uses shared helper');
  });

  it('/api/ai/chat uses sendAiProviderError', () => {
    const idx = aiJS.indexOf("routeName: '/api/ai/chat'");
    const segment = aiJS.substring(idx, idx + 500);
    assert.ok(segment.includes('sendAiProviderError'), 'chat route uses shared helper');
  });

  it('/api/ai/agent uses sendAiProviderError', () => {
    const idx = aiJS.indexOf("routeName: '/api/ai/agent'");
    const segment = aiJS.substring(idx, idx + 500);
    assert.ok(segment.includes('sendAiProviderError'), 'agent route uses shared helper');
  });

  it('/api/ai/refine uses sendAiProviderError', () => {
    const idx = aiJS.indexOf("routeName: '/api/ai/refine'");
    const segment = aiJS.substring(idx, idx + 500);
    assert.ok(segment.includes('sendAiProviderError'), 'refine route uses shared helper');
  });

  it('/api/ai/roadmap uses sendAiProviderError', () => {
    const idx = aiJS.indexOf("routeName: '/api/ai/roadmap'");
    const segment = aiJS.substring(idx, idx + 500);
    assert.ok(segment.includes('sendAiProviderError'), 'roadmap route uses shared helper');
  });

  it('/api/ai/plan-health uses sendAiProviderError', () => {
    const idx = aiJS.indexOf("routeName: '/api/ai/plan-health'");
    const segment = aiJS.substring(idx, idx + 500);
    assert.ok(segment.includes('sendAiProviderError'), 'plan-health route uses shared helper');
  });

  it('/api/ai/file uses sendAiProviderError', () => {
    const idx = aiJS.indexOf("routeName: '/api/ai/file'");
    const segment = aiJS.substring(idx, idx + 500);
    assert.ok(segment.includes('sendAiProviderError'), 'file route uses shared helper');
  });

  it('/api/ai/file-agent first-chunk uses sendAiProviderError', () => {
    const idx = aiJS.indexOf("routeName: '/api/ai/file-agent'");
    const segment = aiJS.substring(idx, idx + 1000);
    assert.ok(segment.includes('sendAiProviderError'), 'file-agent route uses shared helper');
  });

  it('no more raw 502 collapse for aiResult errors (except in helper default)', () => {
    const helperStart = aiJS.indexOf('function sendAiProviderError');
    const helperEnd = aiJS.indexOf('\n}', helperStart + 500);
    const afterHelper = aiJS.substring(helperEnd);
    const matches = afterHelper.match(/return res\.status\(502\)\.json\(\{.*?aiResult\.error/g);
    assert.ok(!matches || matches.length === 0, 'no raw 502 collapse for aiResult errors remaining');
  });
});

/* ============================================================
   4. AGENT-SPECIFIC TIMEOUT CONFIG
   ============================================================ */
describe('P0: Agent-specific timeout config', () => {

  it('getAgentTimeoutMs function exists', () => {
    assert.ok(providerJS.includes('function getAgentTimeoutMs'), 'getAgentTimeoutMs exists');
  });

  it('getAgentTimeoutMs exported', () => {
    assert.ok(providerJS.includes('getAgentTimeoutMs,'), 'getAgentTimeoutMs is exported');
  });

  it('getAgentTimeoutMs imported in ai.js', () => {
    assert.ok(aiJS.includes('getAgentTimeoutMs'), 'getAgentTimeoutMs imported');
  });

  it('agent route passes timeoutMs from getAgentTimeoutMs', () => {
    const agentIdx = aiJS.indexOf("routeName: '/api/ai/agent'");
    const agentSegment = aiJS.substring(agentIdx - 200, agentIdx + 200);
    assert.ok(agentSegment.includes('getAgentTimeoutMs()'), 'agent route uses getAgentTimeoutMs');
  });

  it('getAgentTimeoutMs uses AI_AGENT_TIMEOUT_MS env', () => {
    assert.ok(
      providerJS.includes("process.env.AI_AGENT_TIMEOUT_MS"),
      'checks AI_AGENT_TIMEOUT_MS env'
    );
  });

  it('getAgentTimeoutMs falls back to AI_TIMEOUT_MS', () => {
    assert.ok(
      providerJS.includes("process.env.AI_TIMEOUT_MS"),
      'falls back to AI_TIMEOUT_MS'
    );
  });
});

/* ============================================================
   5. REASONING CONFIGURATION DRIFT AUDIT
   ============================================================ */
describe('P0: Reasoning configuration drift audit', () => {

  it('reasoning_effort is NOT sent in outbound body', () => {
    const bodyMatch = providerJS.match(/const body = \{[\s\S]*?\};/);
    assert.ok(bodyMatch, 'request body object found');
    assert.ok(!bodyMatch[0].includes('reasoning_effort'), 'reasoning_effort NOT in request body');
  });

  it('stale reasoning_effort comment updated in ai.js header', () => {
    assert.ok(
      aiJS.includes('reasoning_effort KHÔNG được gửi') ||
      aiJS.includes('reasoning_effort is NOT sent'),
      'comment updated to reflect reasoning_effort is not sent'
    );
  });
});

/* ============================================================
   6. CONCURRENCY SLOT RELEASE AFTER TIMEOUT
   ============================================================ */
describe('P0: Concurrency slot release after timeout', () => {

  it('releaseSlot is called in finally block', () => {
    const finallyIdx = aiJS.indexOf('finally {');
    assert.ok(finallyIdx > 0, 'finally block exists in agent route');
    const finallySegment = aiJS.substring(finallyIdx, finallyIdx + 200);
    assert.ok(finallySegment.includes('releaseSlot()'), 'releaseSlot called in finally');
  });

  it('releaseSlot defined before try block', () => {
    const tryIdx = aiJS.indexOf('try {\n      // ── 6. Refs built');
    const releaseDefIdx = aiJS.indexOf('const releaseSlot = () =>');
    assert.ok(releaseDefIdx < tryIdx, 'releaseSlot defined before try');
  });
});

/* ============================================================
   7. CLIENT TIMEOUT METADATA PRESERVATION
   ============================================================ */
describe('P0: Client preserves timeout metadata', () => {

  it('client extracts timeout from response', () => {
    assert.ok(
      clientJS.includes("json.timeout && typeof json.timeout === 'object'"),
      'client extracts timeout from response'
    );
  });

  it('client includes timeout in error throw', () => {
    assert.ok(
      clientJS.includes('timeout: timeout || undefined'),
      'client throws timeout metadata'
    );
  });
});

/* ============================================================
   8. STALE COMMENT AUDIT
   ============================================================ */
describe('P0: Stale comment audit', () => {

  it('ai.js header no longer claims reasoning_effort is sent', () => {
    const headerEnd = aiJS.indexOf("'use strict';");
    const header = aiJS.substring(0, headerEnd);
    assert.ok(
      !header.includes('reasoning_effort="low" (OpenAI-compat) → thinking_level LOW'),
      'stale reasoning_effort claim removed from header'
    );
  });

  it('ai.js header mentions AI_AGENT_TIMEOUT_MS', () => {
    const headerEnd = aiJS.indexOf("'use strict';");
    const header = aiJS.substring(0, headerEnd);
    assert.ok(
      header.includes('AI_AGENT_TIMEOUT_MS') || header.includes('Agent timeout'),
      'header documents Agent-specific timeout'
    );
  });
});

console.log('\n✓ P0 timeout semantics tests loaded');
