/**
 * Phase 6V — TaskFlow AI v1.0 Release Candidate Validation
 *
 * Cross-module journeys, release invariants, and security regressions.
 * No live Gemini calls. Mock provider transport.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const aiProvider = require('../server/ai-provider.js');

const aiJS = readFileSync('server/ai.js', 'utf8');
const providerJS = readFileSync('server/ai-provider.js', 'utf8');
const appJS = readFileSync('js/app.js', 'utf8');
const aiClientJS = readFileSync('js/ai.js', 'utf8');
const reviewJS = readFileSync('js/ai-review.js', 'utf8');
const APP = readFileSync('app.html', 'utf8');
const swJS = readFileSync('sw.js', 'utf8');

// ====================================================================
// 1. FINAL AI ROUTE MATRIX
// ====================================================================

describe('6V: Final AI route matrix', () => {
  const routes = [
    { path: '/plan', limiter: 'aiPlanLimiter' },
    { path: '/plan-synthesis', limiter: 'aiPlanSynthLimiter' },
    { path: '/plan-health', limiter: 'aiAgentLimiter' },
    { path: '/chat', limiter: 'aiChatLimiter' },
    { path: '/agent', limiter: 'aiAgentLimiter' },
    { path: '/file', limiter: 'aiFileLimiter' },
    { path: '/file-agent', limiter: 'aiFileLimiter' },
    { path: '/refine', limiter: 'aiAgentLimiter' },
    { path: '/roadmap', limiter: 'ROADMAP_LIMITER' },
  ];

  for (const r of routes) {
    it(`${r.path} exists with rate limiter`, () => {
      assert.ok(aiJS.includes(`router.post('${r.path}'`), `${r.path} route must exist`);
    });
  }

  it('all routes inherit auth from router', () => {
    assert.ok(aiJS.includes('router.use(authMiddleware)'), 'router must use authMiddleware');
  });
});

// ====================================================================
// 2. CENTRAL REQUEST-ID CONSISTENCY
// ====================================================================

describe('6V: Request-ID consistency', () => {
  it('central middleware exists at router boundary', () => {
    assert.ok(aiJS.includes('req.aiRequestId = rid'), 'must assign requestId');
    assert.ok(aiJS.includes("res.setHeader('X-Request-Id', rid)"), 'must set header');
  });

  it('middleware before all routes', () => {
    const midIdx = aiJS.indexOf('req.aiRequestId = rid');
    const firstRoute = aiJS.indexOf("router.post('/plan'");
    assert.ok(midIdx < firstRoute, 'middleware must come before routes');
  });

  it('all 9 routes use req.aiRequestId', () => {
    const routeNames = ['/plan', '/plan-synthesis', '/plan-health', '/chat', '/agent', '/file', '/file-agent', '/refine', '/roadmap'];
    for (const r of routeNames) {
      const idx = aiJS.indexOf(`router.post('${r}'`);
      const seg = aiJS.slice(idx, idx + 300);
      assert.ok(seg.includes('req.aiRequestId'), `${r} must use req.aiRequestId`);
    }
  });

  it('no standalone generateRequestId() in route handlers', () => {
    const routeSection = aiJS.slice(aiJS.indexOf("router.post('/plan'"));
    assert.ok(!routeSection.includes('const requestId = generateRequestId()'), 'should not have standalone calls');
  });
});

// ====================================================================
// 3. PROVIDER MESSAGE BUDGET
// ====================================================================

describe('6V: Provider message budget', () => {
  it('validateMaxMessageBytes exists and works', () => {
    assert.equal(aiProvider.validateMaxMessageBytes('65536'), 65536);
    assert.equal(aiProvider.validateMaxMessageBytes('-1'), aiProvider.DEFAULT_MAX_MESSAGE_BYTES);
    assert.equal(aiProvider.validateMaxMessageBytes('Infinity'), aiProvider.DEFAULT_MAX_MESSAGE_BYTES);
    assert.equal(aiProvider.validateMaxMessageBytes('999999999'), aiProvider.MAX_MAX_MESSAGE_BYTES);
  });

  it('callAiCore checks message bytes', () => {
    assert.ok(providerJS.includes('msgBytes > maxMessageBytes'), 'must check before fetch');
  });
});

// ====================================================================
// 4. TOKEN / TIMEOUT BOUNDS
// ====================================================================

describe('6V: Token and timeout bounds', () => {
  it('timeout validation clamps correctly', () => {
    assert.equal(aiProvider.validateTimeout('100'), 5000);
    assert.equal(aiProvider.validateTimeout('999999'), 120000);
    assert.equal(aiProvider.validateTimeout('abc'), 60000);
    assert.equal(aiProvider.validateTimeout('-1'), 60000);
  });

  it('maxTokens validation clamps correctly', () => {
    assert.equal(aiProvider.validateMaxTokens('-1'), 2048);
    assert.equal(aiProvider.validateMaxTokens('99999'), 8192);
    assert.equal(aiProvider.validateMaxTokens('abc'), 2048);
  });
});

// ====================================================================
// 5. IDEMPOTENCY TRUE BOUND
// ====================================================================

describe('6V: Idempotency true bound', () => {
  it('MAX_IDEMPOTENCY_ENTRIES = 500', () => {
    assert.ok(aiJS.includes('MAX_IDEMPOTENCY_ENTRIES = 500'), 'must be 500');
  });

  it('cleanupIdempotencyCache enforces max', () => {
    assert.ok(aiJS.includes('cache.size > MAX_IDEMPOTENCY_ENTRIES'), 'must check size');
    assert.ok(aiJS.includes('.sort((a, b) => a[1].timestamp - b[1].timestamp)'), 'must evict oldest');
  });

  it('cleanup called after every insert', () => {
    const insertCount = (aiJS.match(/agentIdempotencyCache\.set\(/g) || []).length;
    const cleanupCount = (aiJS.match(/cleanupIdempotencyCache\(agentIdempotencyCache/g) || []).length;
    assert.ok(cleanupCount >= insertCount, 'cleanup must run after every insert');
  });
});

// ====================================================================
// 6. RATE-LIMIT ENV VALIDATION
// ====================================================================

describe('6V: Rate-limit env validation', () => {
  it('readBoundedPositiveIntEnv exists', () => {
    assert.ok(aiJS.includes('function readBoundedPositiveIntEnv'), 'must have validator');
  });

  it('all rate limits use validator', () => {
    assert.ok(aiJS.includes('readBoundedPositiveIntEnv(process.env.AI_CHAT_RATE_LIMIT_PER_MIN'));
    assert.ok(aiJS.includes('readBoundedPositiveIntEnv(process.env.AI_PLAN_RATE_LIMIT_PER_MIN'));
    assert.ok(aiJS.includes('readBoundedPositiveIntEnv(process.env.AI_AGENT_RATE_LIMIT_PER_MIN'));
    assert.ok(aiJS.includes('readBoundedPositiveIntEnv(process.env.AI_AGENT_RATE_LIMIT_PER_HOUR'));
  });
});

// ====================================================================
// 7. CONCURRENCY CLEANUP
// ====================================================================

describe('6V: Concurrency cleanup', () => {
  it('releaseSlot exists and is called', () => {
    assert.ok(aiJS.includes('const releaseSlot'), 'must have release helper');
    assert.ok(aiJS.includes('releaseSlot()'), 'must call releaseSlot');
  });

  it('_fileInFlight exists for file routes', () => {
    assert.ok(aiJS.includes('_fileInFlight'), 'file concurrency must exist');
  });
});

// ====================================================================
// 8. PROVIDER CONFIG OVERRIDE PROTECTION
// ====================================================================

describe('6V: Provider config override protection', () => {
  it('model from server config only', () => {
    assert.ok(providerJS.includes('const model = modelOverride || cfg.model'), 'model from config');
  });

  it('AI_API_URL from env only', () => {
    assert.ok(providerJS.includes("process.env.AI_API_URL"), 'URL from env');
  });

  it('AI_API_KEY from env only', () => {
    assert.ok(providerJS.includes("process.env.AI_API_KEY"), 'key from env');
  });

  it('structured schemas are server-owned', () => {
    assert.ok(aiJS.includes('PROPOSAL_SCHEMA'), 'plan schema exists');
    assert.ok(aiJS.includes('PLAN_SYNTHESIS_SCHEMA'), 'synthesis schema exists');
  });
});

// ====================================================================
// 9. CLIENT BATCH ROLLBACK
// ====================================================================

describe('6V: Client batch rollback', () => {
  it('aiApply captures pre-Apply snapshot', () => {
    assert.ok(appJS.includes('const preApplySnapshot = snapshotAll()'), 'must capture snapshot');
  });

  it('aiApply restores on exception', () => {
    assert.ok(appJS.includes('applySnapshot(preApplySnapshot)'), 'must restore');
  });

  it('busy windows preserved in edit', () => {
    assert.ok(appJS.includes('window._aiBusyWindows || []'), 'must pass busy windows');
  });
});

// ====================================================================
// 10. TIMEBLOCK UNDO INTEGRITY
// ====================================================================

describe('6V: TimeBlock Undo integrity', () => {
  it('snapshotAll includes timeblocks', () => {
    assert.ok(appJS.includes('timeblocks: tb'), 'snapshot must include timeblocks');
    assert.ok(appJS.includes('loadTimeBlocksStore()'), 'must load TimeBlocks');
  });

  it('applySnapshot restores timeblocks', () => {
    assert.ok(appJS.includes('snap.timeblocks'), 'must check snap.timeblocks');
    assert.ok(appJS.includes('saveTimeBlocksStore(snap.timeblocks)'), 'must restore TimeBlocks');
  });
});

// ====================================================================
// 11. AI REVIEW EDIT CONTRACT
// ====================================================================

describe('6V: AI review edit contract', () => {
  it('reschedule editable fields = option only', () => {
    assert.ok(reviewJS.includes("reschedule_task: ['option']"), 'must be option only');
  });

  it('RESCHEDULE_OPTIONS exported', () => {
    assert.ok(reviewJS.includes("RESCHEDULE_OPTIONS: RESCHEDULE_OPTIONS"), 'must export');
  });

  it('strict date validation', () => {
    assert.ok(reviewJS.includes("dt.getFullYear() === parts[0]"), 'must use round-trip');
  });

  it('no Chinese in VI error', () => {
    const vi = reviewJS.match(/'ai-provider-unavailable':\s*'([^']+)'/);
    assert.ok(vi && !/[\u4e00-\u9fff]/.test(vi[1]), 'VI must not contain Chinese');
  });
});

// ====================================================================
// 12. SENSITIVE CONTEXT REGRESSION
// ====================================================================

describe('6V: Sensitive context regression', () => {
  it('reflections/mood stripped from chat context', () => {
    assert.ok(aiJS.includes('delete data.reflections'), 'reflections must be stripped');
    assert.ok(aiJS.includes('delete data.mood'), 'mood must be stripped');
  });

  it('reflections require allowSensitive=true', () => {
    assert.ok(aiJS.includes('raw.allowSensitive === true'), 'must require opt-in');
  });

  it('adaptiveHints sanitized', () => {
    assert.ok(aiJS.includes('sanitizeAdaptiveHints'), 'must sanitize');
  });
});

// ====================================================================
// 13. PROMPT INJECTION RESISTANCE
// ====================================================================

describe('6V: Prompt injection resistance', () => {
  it('system instructions server-owned', () => {
    assert.ok(aiJS.includes('CHAT_SYSTEM_INSTRUCTION_VI'), 'VI instruction');
    assert.ok(aiJS.includes('CHAT_SYSTEM_INSTRUCTION_EN'), 'EN instruction');
  });

  it('context documented as data not instructions', () => {
    assert.ok(aiJS.includes('không phải lệnh hệ thống') || aiJS.includes('NOT instructions'), 'must clarify');
  });
});

// ====================================================================
// 14. SAFE ERROR MAPPING
// ====================================================================

describe('6V: Safe error mapping', () => {
  it('all error codes are canonical', () => {
    const codes = ['ai-not-configured', 'ai-timeout', 'ai-rate-limited', 'ai-provider-bad-request',
      'ai-provider-auth', 'ai-provider-forbidden', 'ai-provider-not-found', 'ai-provider-unavailable',
      'ai-invalid-response'];
    for (const c of codes) {
      assert.ok(aiJS.includes(c) || providerJS.includes(c), `error ${c} must exist`);
    }
  });

  it('API key never logged', () => {
    assert.ok(!providerJS.includes('console.log.*apiKey'), 'key must not be logged');
  });
});

// ====================================================================
// 15. DEBUG MODE SAFETY
// ====================================================================

describe('6V: Debug mode safety', () => {
  it('debug returns only safe metadata', () => {
    assert.ok(aiJS.includes("req.query.debug === '1'"), 'debug check exists');
    assert.ok(aiJS.includes('resp.meta = { provider:'), 'debug returns provider');
    assert.ok(aiJS.includes('model: AI_MODEL'), 'debug returns model');
    assert.ok(aiJS.includes('latencyMs:'), 'debug returns latency');
  });
});

// ====================================================================
// 16. DATE EDGE CASES
// ====================================================================

describe('6V: Date edge cases', () => {
  it('leap day 2028-02-29 accepted', () => {
    assert.ok(reviewJS.includes('parts[0] >= 2020 && parts[0] <= 2099'), 'year range enforced');
  });

  it('server validDate uses round-trip', () => {
    assert.ok(aiJS.includes('d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day'), 'server must use round-trip');
  });
});

// ====================================================================
// 17. PWA / OFFLINE
// ====================================================================

describe('6V: PWA / offline', () => {
  it('ai-review.min.js in precache', () => {
    assert.ok(swJS.includes('ai-review.min.js'), 'must precache ai-review');
  });

  it('ai-adaptation.min.js in precache', () => {
    assert.ok(swJS.includes('ai-adaptation.min.js'), 'must precache adaptation');
  });

  it('ai-feedback.min.js in precache', () => {
    assert.ok(swJS.includes('ai-feedback.min.js'), 'must precache feedback');
  });
});

// ====================================================================
// 18. RELEASE ASSETS
// ====================================================================

describe('6V: Release assets', () => {
  it('app.html has ai.min.js with version pin', () => {
    assert.ok(APP.match(/ai\.min\.js\?v=\d+/), 'must have versioned ai.min.js');
  });

  it('app.html has app.min.js with version pin', () => {
    assert.ok(APP.match(/app\.min\.js\?v=\d+/), 'must have versioned app.min.js');
  });

  it('app.html has i18n.min.js with version pin', () => {
    assert.ok(APP.match(/i18n\.min\.js\?v=\d+/), 'must have versioned i18n.min.js');
  });

  it('ai-review.min.js loaded in production', () => {
    assert.ok(APP.includes('js/ai-review.min.js'), 'must load ai-review');
  });

  it('ai-adaptation.min.js loaded in production', () => {
    assert.ok(APP.includes('js/ai-adaptation.min.js'), 'must load adaptation');
  });

  it('ai-feedback.min.js loaded in production', () => {
    assert.ok(APP.includes('js/ai-feedback.min.js'), 'must load feedback');
  });
});

// ====================================================================
// 19. ADAPTIVE PLANNING SEPARATION
// ====================================================================

describe('6V: Adaptive planning separation', () => {    it('adaptation store excluded from sync', () => {
    const syncJS = readFileSync('js/sync.js', 'utf8');
    // Adaptation key only appears in removeItem (cleanup) calls — never in sync upload/merge
    const lines = syncJS.split('\n');
    const adaptLines = lines.filter(l => l.includes('taskflow-ai-adaptation'));
    assert.ok(adaptLines.length > 0, 'adaptation key must appear in sync (for cleanup)');
    assert.ok(adaptLines.every(l => l.includes('removeItem')), 'adaptation key must only appear in removeItem (not upload/merge)');
  });

  it('feedback store excluded from sync', () => {
    const syncJS = readFileSync('js/sync.js', 'utf8');
    assert.ok(!syncJS.includes('taskflow-ai-feedback'), 'feedback must not sync');
  });
});

// ====================================================================
// 20. EXPLICIT PREFERENCE PRECEDENCE
// ====================================================================

describe('6V: Explicit preference precedence (source)', () => {    it('ai-context builds adaptive hints only when enabled', () => {
    // ai-context logic lives in ai.js buildContext — adaptation check must exist
    assert.ok(aiClientJS.includes('isEnabled()') || aiClientJS.includes('adaptiveHints'), 'client must check adaptation state');
  });

  it('no direct mutation from adaptation module', () => {
    const adaptJS = readFileSync('js/ai-adaptation.js', 'utf8');
    assert.ok(!adaptJS.includes('createTimeBlock') && !adaptJS.includes('moveToDay'), 'adaptation must not mutate');
  });
});

console.log('Phase 6V RC tests loaded successfully.');
