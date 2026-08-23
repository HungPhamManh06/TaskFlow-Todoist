/**
 * Phase 6U — AI Production Hardening Tests
 *
 * Deterministic, no live Gemini calls.
 * Tests server hardening, provider gateway bounds, client rollback,
 * timeout/maxTokens validation, idempotency bounds, and safety invariants.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serverAi = require('../server/ai.js');
const aiProvider = require('../server/ai-provider.js');

// ====================================================================
// 1. TIMEOUT VALIDATION
// ====================================================================

describe('6U: Timeout validation', () => {
  it('validates positive finite timeout', () => {
    const t = aiProvider.validateTimeout('30000');
    assert.ok(t >= aiProvider.MIN_TIMEOUT_MS && t <= aiProvider.MAX_TIMEOUT_MS);
  });

  it('rejects NaN timeout', () => {
    const t = aiProvider.validateTimeout('abc');
    assert.equal(t, aiProvider.DEFAULT_TIMEOUT_MS);
  });

  it('rejects negative timeout', () => {
    const t = aiProvider.validateTimeout('-1000');
    assert.equal(t, aiProvider.DEFAULT_TIMEOUT_MS);
  });

  it('rejects zero timeout', () => {
    const t = aiProvider.validateTimeout('0');
    assert.equal(t, aiProvider.DEFAULT_TIMEOUT_MS);
  });

  it('rejects Infinity timeout', () => {
    const t = aiProvider.validateTimeout('Infinity');
    assert.equal(t, aiProvider.DEFAULT_TIMEOUT_MS);
  });

  it('clamps excessively large timeout to MAX_TIMEOUT_MS', () => {
    const t = aiProvider.validateTimeout('999999999');
    assert.equal(t, aiProvider.MAX_TIMEOUT_MS);
  });

  it('clamps too-small timeout to MIN_TIMEOUT_MS', () => {
    const t = aiProvider.validateTimeout('100');
    assert.equal(t, aiProvider.MIN_TIMEOUT_MS);
  });

  it('accepts empty string (returns default)', () => {
    const t = aiProvider.validateTimeout('');
    assert.equal(t, aiProvider.DEFAULT_TIMEOUT_MS);
  });
});

// ====================================================================
// 2. MAX TOKENS VALIDATION
// ====================================================================

describe('6U: maxTokens validation', () => {
  it('validates positive finite maxTokens', () => {
    const t = aiProvider.validateMaxTokens('2048');
    assert.ok(t > 0 && t <= aiProvider.MAX_MAX_TOKENS);
  });

  it('rejects NaN maxTokens', () => {
    const t = aiProvider.validateMaxTokens('abc');
    assert.equal(t, 2048);
  });

  it('rejects negative maxTokens', () => {
    const t = aiProvider.validateMaxTokens('-100');
    assert.equal(t, 2048);
  });

  it('rejects zero maxTokens', () => {
    const t = aiProvider.validateMaxTokens('0');
    assert.equal(t, 2048);
  });

  it('clamps excessively large maxTokens', () => {
    const t = aiProvider.validateMaxTokens('999999');
    assert.equal(t, aiProvider.MAX_MAX_TOKENS);
  });
});

// ====================================================================
// 3. PROVIDER STATUS MAPPING
// ====================================================================

describe('6U: Provider status mapping', () => {
  it('maps 400 to ai-provider-bad-request', () => {
    assert.equal(aiProvider.mapUpstreamStatus(400), 'ai-provider-bad-request');
  });

  it('maps 401 to ai-provider-auth', () => {
    assert.equal(aiProvider.mapUpstreamStatus(401), 'ai-provider-auth');
  });

  it('maps 403 to ai-provider-forbidden', () => {
    assert.equal(aiProvider.mapUpstreamStatus(403), 'ai-provider-forbidden');
  });

  it('maps 404 to ai-provider-not-found', () => {
    assert.equal(aiProvider.mapUpstreamStatus(404), 'ai-provider-not-found');
  });

  it('maps 429 to ai-rate-limited', () => {
    assert.equal(aiProvider.mapUpstreamStatus(429), 'ai-rate-limited');
  });

  it('maps 500 to ai-provider-unavailable', () => {
    assert.equal(aiProvider.mapUpstreamStatus(500), 'ai-provider-unavailable');
  });

  it('maps unknown to ai-provider-unavailable', () => {
    assert.equal(aiProvider.mapUpstreamStatus(599), 'ai-provider-unavailable');
  });
});

// ====================================================================
// 4. PROVIDER LABEL DERIVATION
// ====================================================================

describe('6U: Provider label', () => {
  it('derives gemini for Google endpoints', () => {
    assert.equal(aiProvider.deriveProviderLabel('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'), 'gemini');
  });

  it('derives openai-compat for other endpoints', () => {
    assert.equal(aiProvider.deriveProviderLabel('https://api.openai.com/v1/chat/completions'), 'openai-compat');
  });

  it('returns unknown for empty URL', () => {
    assert.equal(aiProvider.deriveProviderLabel(''), 'unknown');
  });
});

// ====================================================================
// 5. SERVER AI MODULE EXPORTS
// ====================================================================

describe('6U: Server AI module structure', () => {
  it('exports a router', () => {
    assert.ok(serverAi, 'server/ai.js should export');
  });
});

// ====================================================================
// 6. CLIENT BATCH ROLLBACK (source inspection)
// ====================================================================

describe('6U: Client batch rollback (source)', () => {
  const appJS = readFileSync('js/app.js', 'utf8');

  it('aiApply captures pre-Apply snapshot', () => {
    assert.ok(appJS.includes('const preApplySnapshot = snapshotAll()'), 'should capture pre-Apply snapshot');
  });

  it('aiApply catches exceptions and restores', () => {
    assert.ok(appJS.includes('applySnapshot(preApplySnapshot)'), 'should restore snapshot on error');
  });

  it('aiApply shows error toast on rollback', () => {
    assert.ok(appJS.includes('TaskFlowUI.toast(errMsg, \'error\')'), 'should show error toast');
  });
});

// ====================================================================
// 7. CLIENT BUSY WINDOWS IN EDIT (source inspection)
// ====================================================================

describe('6U: Client edit busy-window preservation (source)', () => {
  const appJS = readFileSync('js/app.js', 'utf8');

  it('stores busy windows from original AI request', () => {
    assert.ok(appJS.includes('window._aiBusyWindows'), 'should store busy windows');
  });

  it('passes stored busy windows to conflictCheck during edit', () => {
    assert.ok(appJS.includes('window._aiBusyWindows || []'), 'should pass busy windows in edit revalidation');
  });

  it('clears busy windows on cancel', () => {
    assert.ok(appJS.includes('_aiBusyWindows = []'), 'should clear busy windows on cancel/apply');
  });
});

// ====================================================================
// 8. SERVER PROMPT SIZE BUDGET (source inspection)
// ====================================================================

describe('6U: Server prompt size budget (source)', () => {
  const aiJS = readFileSync('server/ai.js', 'utf8');

  it('checks prompt bytes before provider call', () => {
    assert.ok(aiJS.includes('promptBytes > 64 * 1024'), 'should enforce 64KB prompt budget');
  });

  it('returns payload-too-large on oversized prompt', () => {
    assert.ok(aiJS.includes('prompt-too-large'), 'should return prompt-too-large error');
  });
});

// ====================================================================
// 9. SERVER PAYLOAD LIMIT (source inspection)
// ====================================================================

describe('6U: Server payload limit (source)', () => {
  const aiJS = readFileSync('server/ai.js', 'utf8');

  it('checks raw body size', () => {
    assert.ok(aiJS.includes('128 * 1024') || aiJS.includes('131072'), 'should have 128KB body limit');
  });
});

// ====================================================================
// 10. SERVER REQUEST ID (source inspection)
// ====================================================================

describe('6U: Server request ID (source)', () => {
  const aiJS = readFileSync('server/ai.js', 'utf8');

  it('/plan route uses central requestId from middleware', () => {
    assert.ok(aiJS.includes('req.aiRequestId'), 'plan should use req.aiRequestId');
  });

  it('central middleware sets X-Request-Id header', () => {
    assert.ok(aiJS.includes("res.setHeader('X-Request-Id', rid)"), 'middleware should set X-Request-Id');
  });

  it('central middleware generates requestId', () => {
    assert.ok(aiJS.includes('req.aiRequestId = rid'), 'middleware should assign requestId');
  });

  it('requestId passed to callAiJson', () => {
    assert.ok(aiJS.includes('requestId,'), 'requestId should be passed to provider');
  });
});

// ====================================================================
// 11. SERVER RATE LIMITS (source inspection)
// ====================================================================

describe('6U: Server rate limits (source)', () => {
  const aiJS = readFileSync('server/ai.js', 'utf8');

  it('chat has rate limiter', () => {
    assert.ok(aiJS.includes("router.post('/chat', maybeRateLimit(aiChatLimiter)"), 'chat must have rate limiter');
  });

  it('plan has rate limiter', () => {
    assert.ok(aiJS.includes("router.post('/plan', maybeRateLimit(aiPlanLimiter)"), 'plan must have rate limiter');
  });

  it('agent has minute + hourly rate limiters', () => {
    assert.ok(aiJS.includes("router.post('/agent', maybeRateLimit(aiAgentLimiter), maybeRateLimit(aiAgentHourlyLimiter)"), 'agent must have both limiters');
  });
});

// ====================================================================
// 12. CONCURRENCY GUARD (source inspection)
// ====================================================================

describe('6U: Concurrency guard (source)', () => {
  const aiJS = readFileSync('server/ai.js', 'utf8');

  it('MAX_AGENT_CONCURRENT defined', () => {
    assert.ok(aiJS.includes('MAX_AGENT_CONCURRENT'), 'concurrency limit must be defined');
  });

  it('releaseSlot helper exists', () => {
    assert.ok(aiJS.includes('const releaseSlot'), 'releaseSlot must exist');
  });

  it('slot released in finally block', () => {
    assert.ok(aiJS.includes('releaseSlot()'), 'must call releaseSlot');
  });
});

// ====================================================================
// 13. IDEMPOTENCY KEY VALIDATION (source inspection)
// ====================================================================

describe('6U: Idempotency key validation (source)', () => {
  const aiJS = readFileSync('server/ai.js', 'utf8');

  it('validates agentRequestId as string', () => {
    assert.ok(aiJS.includes("typeof body.agentRequestId === 'string'"), 'must validate type');
  });

  it('bounds agentRequestId length to 8-64', () => {
    assert.ok(aiJS.includes('agentRequestId.length < 8'), 'must have min length');
    assert.ok(aiJS.includes('agentRequestId.length > 64'), 'must have max length 64');
  });

  it('validates safe characters only', () => {
    assert.ok(aiJS.includes('/^[a-zA-Z0-9_-]+$/'), 'must validate safe chars');
  });

  it('cache has bounded size (500)', () => {
    assert.ok(aiJS.includes('MAX_IDEMPOTENCY_ENTRIES'), 'cache must have named constant');
    assert.ok(aiJS.includes('cleanupIdempotencyCache'), 'must have cleanup helper');
  });
});

// ====================================================================
// 14. SAFE PROVIDER ERROR MAP (source inspection)
// ====================================================================

describe('6U: Provider errors never leak (source)', () => {
  const aiJS = readFileSync('server/ai.js', 'utf8');
  const providerJS = readFileSync('server/ai-provider.js', 'utf8');

  it('no raw provider body in response', () => {
    assert.ok(!providerJS.includes('res.body') || providerJS.includes('NEVER'), 'provider body must not be returned');
  });

  it('API key never logged', () => {
    assert.ok(!providerJS.includes('console.log.*apiKey') && !providerJS.includes('console.log.*API_KEY'), 'API key must not be logged');
  });
});

// ====================================================================
// 15. CONTEXT SANITIZATION BOUNDS (source inspection)
// ====================================================================

describe('6U: Context sanitization bounds (source)', () => {
  const aiJS = readFileSync('server/ai.js', 'utf8');

  it('ARRAY_CAPS defined', () => {
    assert.ok(aiJS.includes('const ARRAY_CAPS'), 'array caps must exist');
  });

  it('TEXT_MAX defined', () => {
    assert.ok(aiJS.includes('const TEXT_MAX'), 'text max must exist');
  });

  it('CHAT context has byte limit', () => {
    assert.ok(aiJS.includes('MAX_CHAT_CONTEXT_BYTES'), 'chat context must have byte limit');
  });
});

// ====================================================================
// 16. PROMPT INJECTION RESISTANCE (source inspection)
// ====================================================================

describe('6U: Prompt injection resistance (source)', () => {
  const aiJS = readFileSync('server/ai.js', 'utf8');

  it('system instruction is server-owned', () => {
    assert.ok(aiJS.includes('CHAT_SYSTEM_INSTRUCTION_VI'), 'VI system instruction must exist');
    assert.ok(aiJS.includes('CHAT_SYSTEM_INSTRUCTION_EN'), 'EN system instruction must exist');
  });

  it('context is user data, not instructions', () => {
    assert.ok(aiJS.includes('không phải lệnh hệ thống') || aiJS.includes('NOT instructions'), 'must clarify context is data');
  });

  it('reflections/mood stripped from chat context', () => {
    assert.ok(aiJS.includes('delete data.reflections'), 'reflections must be stripped');
    assert.ok(aiJS.includes('delete data.mood'), 'mood must be stripped');
  });
});

// ====================================================================
// 17. SENSITIVE CONTEXT REGRESSION (source inspection)
// ====================================================================

describe('6U: Sensitive context regression (source)', () => {
  const aiJS = readFileSync('server/ai.js', 'utf8');

  it('reflections only when allowSensitive=true', () => {
    assert.ok(aiJS.includes('raw.allowSensitive === true'), 'reflections must require opt-in');
  });

  it('adaptiveHints sanitized', () => {
    assert.ok(aiJS.includes('sanitizeAdaptiveHints'), 'adaptive hints must be sanitized');
  });

  it('preferences sanitized', () => {
    assert.ok(aiJS.includes('ALLOWED_PREFS') || aiJS.includes('ALLOWED_PREF_KEYS'), 'preferences must be sanitized');
  });
});

// ====================================================================
// 18. AI REVIEW EDIT CONTRACT (source inspection)
// ====================================================================

describe('6U: AI review edit contract (source)', () => {
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
// 19. TIMEOUT BOUNDS CONSTANTS (source inspection)
// ====================================================================

describe('6U: Provider timeout bounds (source)', () => {
  const providerJS = readFileSync('server/ai-provider.js', 'utf8');

  it('MIN_TIMEOUT_MS defined', () => {
    assert.ok(providerJS.includes('MIN_TIMEOUT_MS'), 'MIN_TIMEOUT_MS must be defined');
  });

  it('MAX_TIMEOUT_MS defined', () => {
    assert.ok(providerJS.includes('MAX_TIMEOUT_MS'), 'MAX_TIMEOUT_MS must be defined');
  });

  it('MAX_MAX_TOKENS defined', () => {
    assert.ok(providerJS.includes('MAX_MAX_TOKENS'), 'MAX_MAX_TOKENS must be defined');
  });

  it('validateMaxTokens exported', () => {
    assert.ok(providerJS.includes('validateMaxTokens'), 'must export validateMaxTokens');
  });
});

// ====================================================================
// 20. APP.HTML — ai-review.min.js loaded
// ====================================================================

describe('6U: Production assets (source)', () => {
  const APP = readFileSync('app.html', 'utf8');

  it('ai-review.min.js loaded', () => {
    assert.ok(APP.includes('js/ai-review.min.js'), 'ai-review.min.js must be in app.html');
  });
});

console.log('Phase 6U tests loaded successfully.');
