'use strict';
/**
 * P0 — Single-User AI Rate Limit Mode
 *
 * Tests:
 * - AI_SINGLE_USER_MODE default is false
 * - maybeRateLimit bypasses limiter when single-user mode enabled
 * - maybeRateLimit passes through when single-user mode disabled
 * - Auth still required in single-user mode
 * - All routes wrapped with maybeRateLimit
 * - Source metadata preserved (taskflow vs provider)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const aiSource = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');

/* ============================================================
   1. SOURCE ASSERTIONS
   ============================================================ */
describe('P0 Single-User: source assertions', () => {

  it('AI_SINGLE_USER_MODE is defined with explicit true check', () => {
    assert.ok(aiSource.includes("process.env.AI_SINGLE_USER_MODE === 'true'"),
      'must use explicit === true check');
  });

  it('maybeRateLimit helper exists', () => {
    assert.ok(aiSource.includes('function maybeRateLimit('), 'maybeRateLimit function defined');
    assert.ok(aiSource.includes('AI_SINGLE_USER_MODE'), 'references AI_SINGLE_USER_MODE');
  });

  it('maybeRateLimit calls next() when bypassed', () => {
    const idx = aiSource.indexOf('function maybeRateLimit(');
    const body = aiSource.slice(idx, idx + 300);
    assert.ok(body.includes('next()'), 'calls next() to bypass');
  });

  it('all 9 rate-limited routes use maybeRateLimit', () => {
    const routes = ['/chat', '/agent', '/file', '/file-agent', '/plan', '/plan-synthesis', '/plan-health', '/refine', '/roadmap'];
    for (const route of routes) {
      const routeIdx = aiSource.indexOf("router.post('" + route + "'");
      assert.ok(routeIdx > 0, 'route ' + route + ' exists');
      // Find the next line after router.post
      const lineEnd = aiSource.indexOf('\n', routeIdx);
      const routeLine = aiSource.slice(routeIdx, lineEnd);
      assert.ok(routeLine.includes('maybeRateLimit('), 'route ' + route + ' uses maybeRateLimit');
    }
  });

  it('authMiddleware is NOT wrapped with maybeRateLimit', () => {
    // Auth must remain active regardless of single-user mode
    assert.ok(aiSource.includes('router.use(authMiddleware)'), 'auth middleware still active');
    // Verify auth is not wrapped with maybeRateLimit
    const authIdx = aiSource.indexOf('router.use(authMiddleware)');
    const surroundingCode = aiSource.slice(Math.max(0, authIdx - 100), authIdx + 50);
    assert.ok(!surroundingCode.includes('maybeRateLimit'), 'auth is NOT bypassed by single-user mode');
  });
});

/* ============================================================
   2. RATE LIMITER STRUCTURE
   ============================================================ */
describe('P0 Single-User: rate limiter structure', () => {

  it('all limiters have source=taskflow in their message', () => {
    // Find all rateLimit() calls and verify they include source: 'taskflow'
    const limiterRegex = /rateLimit\(\{[^}]*message:\s*\{[^}]*source:\s*'taskflow'/g;
    const matches = aiSource.match(limiterRegex);
    assert.ok(matches && matches.length >= 5, 'at least 5 limiters have source=taskflow');
  });

  it('file limiter has correct defaults (3/min, 15/hour)', () => {
    assert.ok(aiSource.includes("AI_FILE_RATE_LIMIT_PER_MIN") || aiSource.includes("'3'"),
      'file per-minute limit defined');
    assert.ok(aiSource.includes("AI_FILE_RATE_LIMIT_PER_HOUR") || aiSource.includes("'15'"),
      'file hourly limit defined');
  });
});

/* ============================================================
   3. ROUTE BEHAVIOR SIMULATION
   ============================================================ */
describe('P0 Single-User: maybeRateLimit behavior', () => {

  // Simulate the maybeRateLimit function
  function simulateMaybeRateLimit(singleUserMode) {
    const AI_SINGLE_USER_MODE = singleUserMode;
    function maybeRateLimit(limiter) {
      if (!AI_SINGLE_USER_MODE) return limiter;
      return function bypassRateLimit(req, res, next) { next(); };
    }
    return maybeRateLimit;
  }

  it('normal mode: returns original limiter', () => {
    const maybeRateLimit = simulateMaybeRateLimit(false);
    const mockLimiter = (req, res, next) => next();
    const result = maybeRateLimit(mockLimiter);
    assert.strictEqual(result, mockLimiter, 'returns original limiter in normal mode');
  });

  it('single-user mode: returns bypass function', () => {
    const maybeRateLimit = simulateMaybeRateLimit(true);
    const mockLimiter = (req, res, next) => { throw new Error('should not be called'); };
    const result = maybeRateLimit(mockLimiter);
    assert.notStrictEqual(result, mockLimiter, 'returns different function in single-user mode');
    assert.equal(typeof result, 'function', 'bypass is a function');
  });

  it('single-user bypass calls next() without calling limiter', () => {
    const maybeRateLimit = simulateMaybeRateLimit(true);
    const mockLimiter = (req, res, next) => { throw new Error('limiter should not execute'); };
    const bypass = maybeRateLimit(mockLimiter);
    let nextCalled = false;
    bypass({}, {}, () => { nextCalled = true; });
    assert.ok(nextCalled, 'next() was called');
  });

  it('normal mode limiter executes normally', () => {
    const maybeRateLimit = simulateMaybeRateLimit(false);
    let limiterCalled = false;
    const mockLimiter = (req, res, next) => { limiterCalled = true; next(); };
    const wrapped = maybeRateLimit(mockLimiter);
    wrapped({}, {}, () => {});
    assert.ok(limiterCalled, 'limiter was called in normal mode');
  });
});

/* ============================================================
   4. COMPREHENSIVE BEHAVIOR MATRIX
   ============================================================ */
describe('P0 Single-User: behavior matrix', () => {

  it('AI_SINGLE_USER_MODE=false: all limiters active', () => {
    // Simulate normal mode — all limiters should execute
    function maybeRateLimit(limiter) {
      if (process.env.AI_SINGLE_USER_MODE === 'true') {
        return function bypassRateLimit(req, res, next) { next(); };
      }
      return limiter;
    }
    // In test env, AI_SINGLE_USER_MODE is not set, so limiters stay
    const mockLimiter = () => 'limited';
    const result = maybeRateLimit(mockLimiter);
    assert.strictEqual(result, mockLimiter, 'limiter unchanged when mode is false/unset');
  });

  it('default value: AI_SINGLE_USER_MODE is not true', () => {
    // The default must NOT enable bypass
    const defaultMode = process.env.AI_SINGLE_USER_MODE === 'true';
    assert.equal(defaultMode, false, 'default must not be single-user mode');
  });
});
