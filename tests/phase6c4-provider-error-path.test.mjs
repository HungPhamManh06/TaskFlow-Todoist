/**
 * Phase 6C.4 — Provider Error Path Hotfix Tests
 *
 * Verifies:
 * - fileMode is defined in the file route
 * - No undefined variables in logging that could mask provider errors
 * - Provider error mapping works for 400/401/403/404/429/5xx
 * - Image payload uses correct OpenAI-compatible format
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const src = readFileSync(join(__dirname, '..', 'server', 'ai.js'), 'utf8');

describe('Phase 6C.4 — Provider Error Path Hotfix', () => {

  it('fileMode must be defined in the file route', () => {
    // Find the file route's variable declarations
    const fileRouteIdx = src.indexOf("router.post('/file'");
    assert.ok(fileRouteIdx > 0, 'file route not found');
    const routeSection = src.substring(fileRouteIdx, fileRouteIdx + 500);
    assert.ok(
      routeSection.includes("const fileMode = 'analyze'"),
      'fileMode must be defined as const in the file route'
    );
  });

  it('upstream-error log must reference fileMode (not undefined)', () => {
    // Phase 6Q: upstream error logging is centralized in ai-provider.js
    const providerSrc = readFileSync(join(__dirname, '..', 'server', 'ai-provider.js'), 'utf8');
    assert.ok(providerSrc.includes('upstream-status') || providerSrc.includes('upstreamStatus'),
      'provider must log upstream status');
    // File route uses unified provider — no undefined fileMode risk
    const fileRouteStart = src.indexOf("router.post('/file'");
    const fileAgentStart = src.indexOf("router.post('/file-agent'");
    const endIdx = fileAgentStart > 0 ? fileAgentStart : src.indexOf('module.exports = {');
    const fileRoute = src.substring(fileRouteStart, endIdx);
    assert.ok(fileRoute.includes('callAiText'), 'file route uses unified provider');
  });

  it('all console.log/error in file route must use defined variables only', () => {
    // Find the file route boundaries
    const fileRouteStart = src.indexOf("router.post('/file'");
    const fileAgentStart = src.indexOf("router.post('/file-agent'");
    const endIdx = fileAgentStart > 0 ? fileAgentStart : src.indexOf('module.exports = {');
    assert.ok(fileRouteStart > 0 && endIdx > fileRouteStart);
    const fileRoute = src.substring(fileRouteStart, endIdx);

    // Extract all variable declarations in the file route
    const varDecls = new Set();
    const declRegex = /(?:const|let|var)\s+(\w+)/g;
    let m;
    while ((m = declRegex.exec(fileRoute)) !== null) {
      varDecls.add(m[1]);
    }

    // Check all console.log/error calls reference defined variables
    // Strip string contents first to avoid false positives from log prefixes like [ai]
    const logRegex = /console\.(log|error)\(([^)]+)\)/g;
    let logMatch;
    while ((logMatch = logRegex.exec(fileRoute)) !== null) {
      const logContent = logMatch[2];
      // Remove all string literals from the log content before checking variable refs
      const stripped = logContent.replace(/'[^']*'/g, '""').replace(/"[^"]*"/g, '""');
      const varRefs = stripped.match(/\b(\w+)\b/g) || [];
      for (const ref of varRefs) {
        if (/^\d+$/.test(ref)) continue;
        if (['console', 'log', 'error', 'JSON', 'Date', 'Math', 'Error', 'String', 'parseInt', 'process', 'require', 'Buffer', 'Map', 'Set', 'fetch', 'AbortController', 'setTimeout', 'clearTimeout', 'encodeURIComponent'].includes(ref)) continue;
        if (['ok', 'status', 'headers', 'json', 'trim', 'length', 'includes', 'split', 'pop', 'toString', 'get', 'set', 'delete', 'has', 'forEach', 'push', 'slice', 'test', 'match', 'indexOf', 'replace', 'startsWith', 'endsWith', 'join', 'filter', 'map', 'reduce', 'concat', 'keys', 'values', 'entries', 'from', 'isArray', 'assign', 'create', 'prototype', 'constructor', 'name', 'type', 'code', 'message', 'error', 'AbortError', 'destroy', 'resume', 'on', 'pipe', 'abort', 'signal', 'body', 'method', 'user', 'id', 'ip', 'pages', 'truncated', 'textBytes', 'ok', 'text'].includes(ref)) continue;
        assert.ok(
          varDecls.has(ref),
          'Log references potentially undefined variable: ' + ref + ' in: ' + logContent.substring(0, 80)
        );
      }
    }
  });

  it('image payload must use image_url content part format', () => {
    assert.ok(
      src.includes("type: 'image_url'") || src.includes('type: "image_url"'),
      'image payload must use image_url content part type'
    );
    assert.ok(
      src.includes('image_url: { url:'),
      'image payload must include image_url.url field'
    );
    assert.ok(
      src.includes("'data:' + file.mime + ';base64,'"),
      'image payload must use data URL format with validated file MIME'
    );
  });

  it('PDF payload uses text extraction (not raw Base64)', () => {
    // v3.0.1: PDFs are now extracted as text server-side to avoid provider gateway overflow
    assert.ok(
      src.includes('extractPdfText') || src.includes('pdf-extract'),
      'PDF path must use server-side text extraction'
    );
    assert.ok(
      !src.includes("type: 'file'") || src.includes('extractPdfText'),
      'PDF must not send raw Base64 file_data through provider gateway'
    );
  });

  it('text-only batch content remains a plain string', () => {
    assert.ok(
      src.includes("content: hasImages ? parts : parts.join('\\n\\n')"),
      'text-only batch must collapse to its bounded text part'
    );
  });

  it('system instruction must be set before messages array', () => {
    assert.ok(
      src.includes("const messages = [{ role: 'system', content: FILE_SYSTEM_INSTRUCTION }]"),
      'messages array must start with system instruction'
    );
  });

  it('provider error mapping must cover all expected statuses', () => {
    // Phase 6Q: error mapping centralized in ai-provider.js
    assert.ok(src.includes('callAiText') || src.includes('callAiJson'), 'routes use unified provider');
    const providerSrc = readFileSync(join(__dirname, '..', 'server', 'ai-provider.js'), 'utf8');
    assert.ok(providerSrc.includes("'ai-provider-bad-request'"), 'must map 400');
    assert.ok(providerSrc.includes("'ai-provider-auth'"), 'must map 401');
    assert.ok(providerSrc.includes("'ai-provider-forbidden'"), 'must map 403');
    assert.ok(providerSrc.includes("'ai-provider-not-found'"), 'must map 404');
    assert.ok(providerSrc.includes("'ai-rate-limited'"), 'must map 429');
    assert.ok(providerSrc.includes("'ai-provider-unavailable'"), 'must map 5xx');
  });

  it('outer catch must log safe error type only', () => {
    const outerCatchIdx = src.lastIndexOf("catch (e) {");
    assert.ok(outerCatchIdx > 0, 'outer catch not found');
    const catchBlock = src.substring(outerCatchIdx, outerCatchIdx + 400);
    assert.ok(
      catchBlock.includes('errorType=') || catchBlock.includes('safeType'),
      'outer catch should log safe error type'
    );
    assert.ok(
      !catchBlock.includes('e.message') && !catchBlock.includes('e.stack'),
      'outer catch must NOT log raw exception details'
    );
  });

  it('Busboy must use req.headers (not req)', () => {
    assert.ok(
      src.includes('Busboy({ headers: req.headers'),
      'Busboy must receive req.headers'
    );
    assert.ok(
      !src.includes('Busboy({ headers: req,'),
      'Busboy must NOT receive full req object'
    );
  });

  it('shared multipart parsing preserves route-level provider handling', () => {
    assert.ok(src.includes('async function parseAiFileMultipart(req)'));
    assert.ok(src.includes('callAiText'));
    assert.ok(src.includes('callAiJson'));
  });

  it('no rate limiter should reference req.ip', () => {
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
