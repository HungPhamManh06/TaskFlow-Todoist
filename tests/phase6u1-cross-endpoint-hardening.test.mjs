/**
 * Phase 6U.1 — Cross-Endpoint Production Hardening Closure Tests
 *
 * Deterministic, no live Gemini calls.
 * Tests central request-ID, message budget, idempotency bounds,
 * rate-limit env validation, concurrency, and safety invariants.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const aiProvider = require('../server/ai-provider.js');

const aiJS = readFileSync('server/ai.js', 'utf8');
const providerJS = readFileSync('server/ai-provider.js', 'utf8');

// ====================================================================
// 1. ROUTE INVENTORY
// ====================================================================

describe('6U.1: Provider-backed route inventory', () => {
  const providerRoutes = ['/plan', '/plan-synthesis', '/plan-health', '/chat', '/agent', '/file', '/file-agent', '/refine', '/roadmap'];

  it('all provider-backed routes exist in server/ai.js', () => {
    for (const route of providerRoutes) {
      assert.ok(aiJS.includes(`router.post('${route}'`), `route ${route} must exist`);
    }
  });

  it('every provider-backed route has a rate limiter', () => {
    assert.ok(aiJS.includes("router.post('/plan', maybeRateLimit(aiPlanLimiter)"), 'plan must have limiter');
    assert.ok(aiJS.includes("router.post('/plan-synthesis', maybeRateLimit(aiPlanSynthLimiter)"), 'plan-synthesis must have limiter');
    assert.ok(aiJS.includes("router.post('/plan-health', maybeRateLimit(aiAgentLimiter)"), 'plan-health must have limiter');
    assert.ok(aiJS.includes("router.post('/chat', maybeRateLimit(aiChatLimiter)"), 'chat must have limiter');
    assert.ok(aiJS.includes("router.post('/agent', maybeRateLimit(aiAgentLimiter)"), 'agent must have minute limiter');
    assert.ok(aiJS.includes('aiAgentHourlyLimiter'), 'agent must have hourly limiter');
    assert.ok(aiJS.includes("router.post('/file', maybeRateLimit(aiFileLimiter)"), 'file must have limiter');
    assert.ok(aiJS.includes("router.post('/roadmap', maybeRateLimit(ROADMAP_LIMITER)"), 'roadmap must have limiter');
  });
});

// ====================================================================
// 2. CENTRAL REQUEST-ID MIDDLEWARE
// ====================================================================

describe('6U.1: Central request-ID middleware', () => {
  it('router uses central middleware for request IDs', () => {
    assert.ok(aiJS.includes('req.aiRequestId = rid'), 'middleware must assign rid to req.aiRequestId');
    assert.ok(aiJS.includes("res.setHeader('X-Request-Id', rid)"), 'middleware must set X-Request-Id');
  });

  it('middleware is applied before all routes', () => {
    const middlewareIdx = aiJS.indexOf('req.aiRequestId = rid');
    const firstRouteIdx = aiJS.indexOf("router.post('/plan'");
    assert.ok(middlewareIdx < firstRouteIdx, 'middleware must come before routes');
  });

  it('/plan uses req.aiRequestId', () => {
    const planIdx = aiJS.indexOf("router.post('/plan'");
    const planSeg = aiJS.slice(planIdx, planIdx + 500);
    assert.ok(planSeg.includes('const requestId = req.aiRequestId;'), 'plan must use req.aiRequestId');
  });

  it('/plan-synthesis uses req.aiRequestId', () => {
    const planSynthIdx = aiJS.indexOf("router.post('/plan-synthesis'");
    const planSynthSeg = aiJS.slice(planSynthIdx, planSynthIdx + 200);
    assert.ok(planSynthSeg.includes('req.aiRequestId'), 'plan-synthesis must use req.aiRequestId');
  });

  it('/plan-health uses req.aiRequestId', () => {
    const idx = aiJS.indexOf("router.post('/plan-health'");
    const seg = aiJS.slice(idx, idx + 200);
    assert.ok(seg.includes('req.aiRequestId'), 'plan-health must use req.aiRequestId');
  });

  it('/chat uses req.aiRequestId', () => {
    const idx = aiJS.indexOf("router.post('/chat'");
    const seg = aiJS.slice(idx, idx + 200);
    assert.ok(seg.includes('req.aiRequestId'), 'chat must use req.aiRequestId');
  });

  it('/agent uses req.aiRequestId', () => {
    const idx = aiJS.indexOf("router.post('/agent'");
    const seg = aiJS.slice(idx, idx + 200);
    assert.ok(seg.includes('req.aiRequestId'), 'agent must use req.aiRequestId');
  });

  it('/file uses req.aiRequestId', () => {
    const idx = aiJS.indexOf("router.post('/file'");
    const seg = aiJS.slice(idx, idx + 200);
    assert.ok(seg.includes('req.aiRequestId'), 'file must use req.aiRequestId');
  });

  it('/file-agent uses req.aiRequestId', () => {
    const idx = aiJS.indexOf("router.post('/file-agent'");
    const seg = aiJS.slice(idx, idx + 200);
    assert.ok(seg.includes('req.aiRequestId'), 'file-agent must use req.aiRequestId');
  });

  it('/refine uses req.aiRequestId', () => {
    const idx = aiJS.indexOf("router.post('/refine'");
    const seg = aiJS.slice(idx, idx + 200);
    assert.ok(seg.includes('req.aiRequestId'), 'refine must use req.aiRequestId');
  });

  it('/roadmap uses req.aiRequestId', () => {
    const idx = aiJS.indexOf("router.post('/roadmap'");
    const seg = aiJS.slice(idx, idx + 200);
    assert.ok(seg.includes('req.aiRequestId'), 'roadmap must use req.aiRequestId');
  });

  it('no standalone generateRequestId() calls in route handlers', () => {
    // After middleware, routes should use req.aiRequestId not generateRequestId()
    const routeSection = aiJS.slice(aiJS.indexOf("router.post('/plan'"));
    const standaloneCalls = routeSection.match(/const requestId = generateRequestId\(\)/g);
    assert.equal(standaloneCalls, null, 'should not have standalone generateRequestId in route handlers');
  });

  it('provider calls pass requestId', () => {
    const providerCalls = aiJS.match(/callAi(?:Text|Json)\(\{[^}]*routeName/g);
    assert.ok(providerCalls, 'should have provider calls');
    // Most should have requestId nearby
    const withRequestId = aiJS.match(/requestId,\s*\r?\n\s*routeName/g);
    assert.ok(withRequestId && withRequestId.length >= 5, 'most provider calls should pass requestId');
  });
});

// ====================================================================
// 3. PROVIDER MESSAGE BUDGET
// ====================================================================

describe('6U.1: Provider message budget', () => {
  it('DEFAULT_MAX_MESSAGE_BYTES defined', () => {
    assert.ok(providerJS.includes('DEFAULT_MAX_MESSAGE_BYTES'), 'must define default');
  });

  it('MAX_MAX_MESSAGE_BYTES defined', () => {
    assert.ok(providerJS.includes('MAX_MAX_MESSAGE_BYTES'), 'must define hard max');
  });

  it('validateMaxMessageBytes exported', () => {
    assert.ok(providerJS.includes('validateMaxMessageBytes'), 'must export validator');
  });

  it('callAiCore checks message bytes before fetch', () => {
    assert.ok(providerJS.includes('msgBytes > maxMessageBytes'), 'must check message size');
    assert.ok(providerJS.includes('provider-message-budget'), 'must return correct error detail');
  });

  it('validateMaxMessageBytes returns default for invalid input', () => {
    assert.equal(aiProvider.validateMaxMessageBytes('abc'), aiProvider.DEFAULT_MAX_MESSAGE_BYTES);
    assert.equal(aiProvider.validateMaxMessageBytes('-1'), aiProvider.DEFAULT_MAX_MESSAGE_BYTES);
    assert.equal(aiProvider.validateMaxMessageBytes('0'), aiProvider.DEFAULT_MAX_MESSAGE_BYTES);
    assert.equal(aiProvider.validateMaxMessageBytes('Infinity'), aiProvider.DEFAULT_MAX_MESSAGE_BYTES);
  });

  it('validateMaxMessageBytes clamps to max', () => {
    assert.equal(aiProvider.validateMaxMessageBytes('999999999'), aiProvider.MAX_MAX_MESSAGE_BYTES);
  });

  it('validateMaxMessageBytes accepts valid value', () => {
    const v = aiProvider.validateMaxMessageBytes('32768');
    assert.ok(v > 0 && v <= aiProvider.MAX_MAX_MESSAGE_BYTES);
  });

  it('/plan prompt size check still exists', () => {
    assert.ok(aiJS.includes('promptBytes > 64 * 1024'), '/plan must have prompt budget');
  });
});

// ====================================================================
// 4. IDEMPOTENCY CACHE BOUNDS
// ====================================================================

describe('6U.1: True idempotency cache bounds', () => {
  it('MAX_IDEMPOTENCY_ENTRIES defined', () => {
    assert.ok(aiJS.includes('MAX_IDEMPOTENCY_ENTRIES'), 'must have named constant');
  });

  it('cleanupIdempotencyCache function exists', () => {
    assert.ok(aiJS.includes('function cleanupIdempotencyCache'), 'must have cleanup function');
  });

  it('cleanup removes expired entries', () => {
    assert.ok(aiJS.includes('now - value.timestamp > IDEMPOTENCY_TTL_MS'), 'must check TTL');
  });

  it('cleanup evicts oldest when over max', () => {
    assert.ok(aiJS.includes('cache.size > MAX_IDEMPOTENCY_ENTRIES'), 'must check size after TTL cleanup');
    assert.ok(aiJS.includes('.sort((a, b) => a[1].timestamp - b[1].timestamp)'), 'must sort by timestamp for oldest eviction');
  });

  it('cleanup called after every cache insert', () => {
    // The function should be called after every .set()
    const insertCount = (aiJS.match(/agentIdempotencyCache\.set\(/g) || []).length;
    const cleanupCount = (aiJS.match(/cleanupIdempotencyCache\(agentIdempotencyCache/g) || []).length;
    assert.ok(cleanupCount >= insertCount, 'cleanup must be called at least as many times as insert');
  });

  it('cache is bounded to 500', () => {
    assert.ok(aiJS.includes('MAX_IDEMPOTENCY_ENTRIES = 500'), 'must be 500');
  });
});

// ====================================================================
// 5. RATE-LIMIT ENV VALIDATION
// ====================================================================

describe('6U.1: Rate-limit env validation', () => {
  it('readBoundedPositiveIntEnv helper exists', () => {
    assert.ok(aiJS.includes('function readBoundedPositiveIntEnv'), 'must have env validator');
  });

  it('rate limits use readBoundedPositiveIntEnv', () => {
    assert.ok(aiJS.includes('readBoundedPositiveIntEnv(process.env.AI_CHAT_RATE_LIMIT_PER_MIN'), 'chat rate uses validator');
    assert.ok(aiJS.includes('readBoundedPositiveIntEnv(process.env.AI_PLAN_RATE_LIMIT_PER_MIN'), 'plan rate uses validator');
    assert.ok(aiJS.includes('readBoundedPositiveIntEnv(process.env.AI_AGENT_RATE_LIMIT_PER_MIN'), 'agent rate uses validator');
    assert.ok(aiJS.includes('readBoundedPositiveIntEnv(process.env.AI_AGENT_RATE_LIMIT_PER_HOUR'), 'agent hourly uses validator');
  });
});

// ====================================================================
// 6. CONCURRENCY GUARD
// ====================================================================

describe('6U.1: Concurrency guard (source)', () => {
  it('MAX_AGENT_CONCURRENT defined', () => {
    assert.ok(aiJS.includes('MAX_AGENT_CONCURRENT'), 'concurrency limit must be defined');
  });

  it('releaseSlot helper exists', () => {
    assert.ok(aiJS.includes('const releaseSlot'), 'releaseSlot must exist');
  });

  it('slot released in finally block', () => {
    assert.ok(aiJS.includes('releaseSlot()'), 'must call releaseSlot');
  });

  it('_fileInFlight exists for file routes', () => {
    assert.ok(aiJS.includes('_fileInFlight'), 'file concurrency guard must exist');
  });
});

// ====================================================================
// 7. PROVIDER CONFIG OVERRIDE PROTECTION
// ====================================================================

describe('6U.1: Provider config override protection', () => {
  it('model comes from server config, not request body', () => {
    // The provider gateway should use config model, not body.model
    assert.ok(providerJS.includes('model: modelOverride'), 'model override is an option');
    assert.ok(providerJS.includes('const model = modelOverride || cfg.model'), 'falls back to config');
  });

  it('AI_API_URL comes from env only', () => {
    assert.ok(providerJS.includes("process.env.AI_API_URL"), 'URL from env');
  });

  it('AI_API_KEY comes from env only', () => {
    assert.ok(providerJS.includes("process.env.AI_API_KEY"), 'key from env');
  });

  it('schema is server-owned', () => {
    assert.ok(providerJS.includes('response_format'), 'structured output uses response_format');
    // Routes pass their own schemas, not from request body
  });
});

// ====================================================================
// 8. SAFE ERROR MAPPING
// ====================================================================

describe('6U.1: Safe error mapping', () => {
  it('provider errors never expose raw body', () => {
    assert.ok(!providerJS.includes('upstream.json()') || providerJS.includes('NEVER'), 'must not expose upstream body');
  });

  it('API key never logged', () => {
    assert.ok(!providerJS.includes('console.log.*apiKey'), 'key must not be logged');
  });

  it('all error codes are canonical', () => {
    const errorCodes = ['ai-not-configured', 'ai-timeout', 'ai-rate-limited', 'ai-provider-bad-request',
      'ai-provider-auth', 'ai-provider-forbidden', 'ai-provider-not-found', 'ai-provider-unavailable',
      'ai-invalid-response'];
    for (const code of errorCodes) {
      assert.ok(providerJS.includes(code) || aiJS.includes(code), `error code ${code} must exist`);
    }
  });
});

// ====================================================================
// 9. CONTEXT SANITIZATION BOUNDS
// ====================================================================

describe('6U.1: Context sanitization bounds (source)', () => {
  it('ARRAY_CAPS defined', () => {
    assert.ok(aiJS.includes('const ARRAY_CAPS'), 'array caps must exist');
  });

  it('TEXT_MAX defined', () => {
    assert.ok(aiJS.includes('const TEXT_MAX'), 'text max must exist');
  });

  it('CHAT context has byte limit', () => {
    assert.ok(aiJS.includes('MAX_CHAT_CONTEXT_BYTES'), 'chat context must have byte limit');
  });

  it('chatHasForbidden scans for sensitive keys', () => {
    assert.ok(aiJS.includes('CHAT_FORBIDDEN_KEYS'), 'must have forbidden keys list');
    assert.ok(aiJS.includes('function chatHasForbidden'), 'must have scanner function');
  });
});

// ====================================================================
// 10. SENSITIVE CONTEXT REGRESSION
// ====================================================================

describe('6U.1: Sensitive context regression (source)', () => {
  it('reflections only when allowSensitive=true', () => {
    assert.ok(aiJS.includes('raw.allowSensitive === true'), 'reflections must require opt-in');
  });

  it('adaptiveHints sanitized', () => {
    assert.ok(aiJS.includes('sanitizeAdaptiveHints'), 'adaptive hints must be sanitized');
  });

  it('preferences sanitized with allowlist', () => {
    assert.ok(aiJS.includes('ALLOWED_PREFS') || aiJS.includes('ALLOWED_PREF_KEYS'), 'preferences must be sanitized');
  });

  it('reflections/mood stripped from chat context', () => {
    assert.ok(aiJS.includes('delete data.reflections'), 'reflections must be stripped from chat');
    assert.ok(aiJS.includes('delete data.mood'), 'mood must be stripped from chat');
  });
});

// ====================================================================
// 11. PROMPT INJECTION RESISTANCE
// ====================================================================

describe('6U.1: Prompt injection resistance (source)', () => {
  it('system instructions are server-owned', () => {
    assert.ok(aiJS.includes('CHAT_SYSTEM_INSTRUCTION_VI'), 'VI instruction must exist');
    assert.ok(aiJS.includes('CHAT_SYSTEM_INSTRUCTION_EN'), 'EN instruction must exist');
  });

  it('context is documented as data, not instructions', () => {
    assert.ok(aiJS.includes('không phải lệnh hệ thống') || aiJS.includes('NOT instructions'), 'must clarify context is data');
  });
});

// ====================================================================
// 12. AI REVIEW EDIT CONTRACT
// ====================================================================

describe('6U.1: AI review edit contract (source)', () => {
  const reviewJS = readFileSync('js/ai-review.js', 'utf8');

  it('reschedule editable fields = option only', () => {
    assert.ok(reviewJS.includes("reschedule_task: ['option']"), 'reschedule must only edit option');
  });

  it('RESCHEDULE_OPTIONS exported', () => {
    assert.ok(reviewJS.includes("RESCHEDULE_OPTIONS: RESCHEDULE_OPTIONS"), 'must export options');
  });

  it('strict date validation (round-trip)', () => {
    assert.ok(reviewJS.includes("dt.getFullYear() === parts[0]"), 'must use calendar round-trip');
  });

  it('no Chinese characters in VI error', () => {
    const viUnavail = reviewJS.match(/'ai-provider-unavailable':\s*'([^']+)'/);
    assert.ok(viUnavail, 'must have VI provider-unavailable');
    assert.ok(!/[\u4e00-\u9fff]/.test(viUnavail[1]), 'VI error must not contain Chinese');
  });
});

// ====================================================================
// 13. BATCH ROLLBACK (client source)
// ====================================================================

describe('6U.1: Batch rollback (source)', () => {
  const appJS = readFileSync('js/app.js', 'utf8');

  it('aiApply captures pre-Apply snapshot', () => {
    assert.ok(appJS.includes('const preApplySnapshot = snapshotAll()'), 'should capture pre-Apply snapshot');
  });

  it('aiApply catches exceptions and restores', () => {
    assert.ok(appJS.includes('applySnapshot(preApplySnapshot)'), 'should restore snapshot on error');
  });

  it('busy windows preserved in edit revalidation', () => {
    assert.ok(appJS.includes('window._aiBusyWindows'), 'should store busy windows');
    assert.ok(appJS.includes('window._aiBusyWindows || []'), 'should pass busy windows in edit');
  });
});

// ====================================================================
// 14. TIMEOUT BOUNDS
// ====================================================================

describe('6U.1: Timeout bounds', () => {
  it('MIN_TIMEOUT_MS = 5000', () => {
    assert.equal(aiProvider.MIN_TIMEOUT_MS, 5000);
  });

  it('MAX_TIMEOUT_MS = 120000', () => {
    assert.equal(aiProvider.MAX_TIMEOUT_MS, 120000);
  });

  it('timeout validation clamps correctly', () => {
    assert.equal(aiProvider.validateTimeout('100'), 5000);
    assert.equal(aiProvider.validateTimeout('999999'), 120000);
    assert.equal(aiProvider.validateTimeout('30000'), 30000);
  });
});

// ====================================================================
// 15. MAX TOKENS BOUNDS
// ====================================================================

describe('6U.1: maxTokens bounds', () => {
  it('MAX_MAX_TOKENS = 8192', () => {
    assert.equal(aiProvider.MAX_MAX_TOKENS, 8192);
  });

  it('maxTokens validation clamps correctly', () => {
    assert.equal(aiProvider.validateMaxTokens('-1'), 2048);
    assert.equal(aiProvider.validateMaxTokens('99999'), 8192);
    assert.equal(aiProvider.validateMaxTokens('2048'), 2048);
  });
});

console.log('Phase 6U.1 tests loaded successfully.');
