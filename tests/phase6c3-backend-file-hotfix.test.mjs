/**
 * Phase 6C.3 — Backend File Processing Hotfix Tests
 *
 * Verifies:
 * - Busboy constructed with req.headers (not req)
 * - Rate limiters use String(req.user.id) without req.ip fallback
 * - Safe error logging in outer catch
 * - Provider error mapping covers 400/401/403/404/429
 * - Concurrency slot always released
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const src = readFileSync(join(__dirname, '..', 'server', 'ai.js'), 'utf8');

describe('Phase 6C.3 — Backend File Processing Hotfix', () => {

  it('Busboy should use req.headers (not req)', () => {
    assert.ok(
      src.includes('Busboy({ headers: req.headers'),
      'Busboy must receive req.headers, not the full req object'
    );
    assert.ok(
      !src.includes('Busboy({ headers: req,'),
      'Busboy must NOT receive the full Express req object as headers'
    );
  });

  it('aiFileLimiter keyGenerator should use String(req.user.id) without req.ip', () => {
    // Find the aiFileLimiter definition
    const match = src.match(/const aiFileLimiter = rateLimit\(\{[\s\S]*?\}\);/);
    assert.ok(match, 'aiFileLimiter not found');
    const block = match[0];
    assert.ok(
      block.includes("keyGenerator: (req) => String(req.user.id)"),
      'aiFileLimiter must use String(req.user.id) without req.ip fallback'
    );
    assert.ok(
      !block.includes('req.ip'),
      'aiFileLimiter must not reference req.ip'
    );
  });

  it('aiFileHourlyLimiter keyGenerator should use String(req.user.id) without req.ip', () => {
    const match = src.match(/const aiFileHourlyLimiter = rateLimit\(\{[\s\S]*?\}\);/);
    assert.ok(match, 'aiFileHourlyLimiter not found');
    const block = match[0];
    assert.ok(
      block.includes("keyGenerator: (req) => String(req.user.id)"),
      'aiFileHourlyLimiter must use String(req.user.id) without req.ip fallback'
    );
    assert.ok(
      !block.includes('req.ip'),
      'aiFileHourlyLimiter must not reference req.ip'
    );
  });

  it('aiChatLimiter keyGenerator should not reference req.ip', () => {
    const match = src.match(/const aiChatLimiter = rateLimit\(\{[\s\S]*?\}\);/);
    assert.ok(match, 'aiChatLimiter not found');
    assert.ok(
      !match[0].includes('req.ip'),
      'aiChatLimiter must not reference req.ip'
    );
  });

  it('aiAgentLimiter keyGenerator should not reference req.ip', () => {
    const match = src.match(/const aiAgentLimiter = rateLimit\(\{[\s\S]*?\}\);/);
    assert.ok(match, 'aiAgentLimiter not found');
    assert.ok(
      !match[0].includes('req.ip'),
      'aiAgentLimiter must not reference req.ip'
    );
  });

  it('aiPlanLimiter keyGenerator should not reference req.ip', () => {
    const match = src.match(/const aiPlanLimiter = rateLimit\(\{[\s\S]*?\}\);/);
    assert.ok(match, 'aiPlanLimiter not found');
    assert.ok(
      !match[0].includes('req.ip'),
      'aiPlanLimiter must not reference req.ip'
    );
  });

  it('aiAgentHourlyLimiter keyGenerator should not reference req.ip', () => {
    const match = src.match(/const aiAgentHourlyLimiter = rateLimit\(\{[\s\S]*?\}\);/);
    assert.ok(match, 'aiAgentHourlyLimiter not found');
    assert.ok(
      !match[0].includes('req.ip'),
      'aiAgentHourlyLimiter must not reference req.ip'
    );
  });

  it('file route userId should use String(req.user.id) without req.ip fallback', () => {
    // Find the file route's userId assignment
    const fileRouteMatch = src.match(/router\.post\('\/file'[\s\S]*?const userId =/);
    assert.ok(fileRouteMatch, 'file route userId not found');
    const afterUserId = src.substring(
      src.indexOf(fileRouteMatch[0]) + fileRouteMatch[0].length,
      src.indexOf(fileRouteMatch[0]) + fileRouteMatch[0].length + 50
    );
    assert.ok(
      afterUserId.includes('String(req.user.id)'),
      'file route userId must use String(req.user.id)'
    );
    assert.ok(
      !afterUserId.includes('req.ip'),
      'file route userId must not reference req.ip'
    );
  });

  it('outer catch should log safe error type (not raw exception)', () => {
    // Find the outer catch block for file route
    const outerCatchIdx = src.lastIndexOf("catch (e) {");
    assert.ok(outerCatchIdx > 0, 'outer catch not found');
    const catchBlock = src.substring(outerCatchIdx, outerCatchIdx + 300);
    assert.ok(
      catchBlock.includes('errorType=') || catchBlock.includes('safeType'),
      'outer catch should log safe error type'
    );
    assert.ok(
      !catchBlock.includes('e.message') && !catchBlock.includes('e.stack'),
      'outer catch should NOT log raw exception details'
    );
  });

  it('provider error mapping should cover 400/401/403/404/429', () => {
    // Phase 6Q: error mapping is centralized in ai-provider.js
    assert.ok(src.includes('callAiText'), 'file route uses unified provider');
    const providerSrc = readFileSync(join(__dirname, '..', 'server', 'ai-provider.js'), 'utf8');
    assert.ok(providerSrc.includes('ai-provider-bad-request'), 'provider must map 400 to ai-provider-bad-request');
    assert.ok(providerSrc.includes('ai-provider-auth'), 'provider must map 401 to ai-provider-auth');
    assert.ok(providerSrc.includes('ai-provider-forbidden'), 'provider must map 403 to ai-provider-forbidden');
    assert.ok(providerSrc.includes('ai-provider-not-found'), 'provider must map 404 to ai-provider-not-found');
    assert.ok(providerSrc.includes('ai-rate-limited'), 'provider must map 429 to ai-rate-limited');
  });

  it('Busboy require statement should exist', () => {
    assert.ok(
      src.includes("const Busboy = require('busboy')"),
      "Busboy must be required from 'busboy'"
    );
  });

  it('file route concurrency slot must be released in finally', () => {
    // Find the file route — it's the last router.post before module.exports
    const fileRouteStart = src.indexOf("router.post('/file'");
    assert.ok(fileRouteStart > 0, 'file route not found');
    const moduleExportsIdx = src.indexOf('module.exports = {');
    assert.ok(moduleExportsIdx > fileRouteStart, 'module.exports not found after file route');
    const fileRoute = src.substring(fileRouteStart, moduleExportsIdx);
    assert.ok(
      fileRoute.includes('releaseSlot()'),
      'file route must call releaseSlot()'
    );
    assert.ok(
      fileRoute.includes('finally'),
      'file route must have finally block'
    );
  });

  it('no raw req.ip should remain in any rate limiter keyGenerator', () => {
    // Find all keyGenerator usages
    const keyGenMatches = src.match(/keyGenerator:\s*\(req\)\s*=>[^,]+/g) || [];
    assert.ok(keyGenMatches.length >= 6, 'should have at least 6 rate limiters');
    for (const kg of keyGenMatches) {
      assert.ok(
        !kg.includes('req.ip'),
        'No rate limiter keyGenerator should reference req.ip: ' + kg.trim()
      );
    }
  });
});
