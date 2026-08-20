/**
 * Phase 6C.2 — File Send Runtime Hotfix Tests
 *
 * Verifies that _sendWithFile:
 * - Does NOT reference undefined helpers (_bubble, _appendBubble, _appendMarkdown, _getToken)
 * - Uses canonical helpers (_appendText, _hasToken, _getApiBase, _isOnline, _showInfo)
 * - Has preflight checks BEFORE locking UI
 * - Has try/finally that ALWAYS restores _inFlight and input enabled state
 * - Uses localStorage token pattern (not undefined _getToken)
 * - Uses canonical apiBase routing (not bare '/api/ai/file')
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const src = readFileSync(join(__dirname, '..', 'js', 'chat.js'), 'utf8');

describe('Phase 6C.2 — File Send Hotfix', () => {

  it('should NOT reference _bubble() in _sendWithFile', () => {
    // Extract _sendWithFile function body
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile function not found');
    const body = match[0];
    assert.ok(!/_bubble\(/.test(body), '_sendWithFile references undefined _bubble()');
  });

  it('should NOT reference _appendBubble() in _sendWithFile', () => {
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile function not found');
    const body = match[0];
    assert.ok(!/_appendBubble\(/.test(body), '_sendWithFile references undefined _appendBubble()');
  });

  it('should NOT reference _appendMarkdown() in _sendWithFile', () => {
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile function not found');
    const body = match[0];
    assert.ok(!/_appendMarkdown\(/.test(body), '_sendWithFile references undefined _appendMarkdown()');
  });

  it('should NOT reference _getToken() in _sendWithFile', () => {
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile function not found');
    const body = match[0];
    assert.ok(!/_getToken\(/.test(body), '_sendWithFile references undefined _getToken()');
  });

  it('should use _appendText for user bubble', () => {
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile function not found');
    const body = match[0];
    assert.ok(body.includes('_appendText(') && body.includes("'chat-msg user'"), 'should use _appendText for user message');
  });

  it('should use _appendText for bot response', () => {
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile function not found');
    const body = match[0];
    assert.ok(body.includes('_appendText(') && body.includes("'chat-msg bot'"), 'should use _appendText for bot message');
  });

  it('should use localStorage.getItem for token', () => {
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile function not found');
    const body = match[0];
    assert.ok(/localStorage\.getItem\(['"]planner-token['"]\)/.test(body),
      'should use localStorage.getItem for token retrieval');
  });

  it('should have preflight checks BEFORE _inFlight = true', () => {
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile function not found');
    const body = match[0];
    const inflightIdx = body.indexOf('_inFlight = true');
    assert.ok(inflightIdx > 0, '_inFlight = true not found');
    const preflightSection = body.substring(0, inflightIdx);
    assert.ok(/_isOnline\(\)/.test(preflightSection), 'preflight should check _isOnline()');
    assert.ok(/_hasToken\(\)/.test(preflightSection), 'preflight should check _hasToken()');
    assert.ok(/_getApiBase\(\)/.test(preflightSection), 'preflight should check _getApiBase()');
  });

  it('should have try/finally covering _inFlight = true', () => {
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile function not found');
    const body = match[0];
    assert.ok(body.includes('try {'), 'should have try block');
    assert.ok(body.includes('finally {'), 'should have finally block');
    const finallyIdx = body.indexOf('finally {');
    const finallySection = body.substring(finallyIdx);
    assert.ok(/_inFlight\s*=\s*false/.test(finallySection), 'finally should reset _inFlight');
    assert.ok(/_setInputEnabled\(true\)/.test(finallySection), 'finally should re-enable input');
    assert.ok(/_clearFileAttachment\(\)/.test(finallySection), 'finally should clear file attachment');
  });

  it('should NOT use bare /api/ai/file (must use apiBase prefix)', () => {
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile function not found');
    const body = match[0];
    // Should use apiBase + '/api/ai/file', NOT bare '/api/ai/file'
    assert.ok(!/fetch\(['"]\/api\/ai\/file['"]/.test(body),
      'should NOT use bare /api/ai/file without apiBase');
    assert.ok(/apiBase\s*\+\s*['"]\/api\/ai\/file['"]/.test(body),
      'should use apiBase + /api/ai/file');
  });

  it('should have _showInfo fallback for api-config-missing in preflight', () => {
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile function not found');
    const body = match[0];
    const inflightIdx = body.indexOf('_inFlight = true');
    const preflight = body.substring(0, inflightIdx);
    assert.ok(/api-config-missing/.test(preflight) || /_showInfo/.test(preflight),
      'preflight should handle api-config-missing');
  });

  it('should NOT lock UI before preflight checks', () => {
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile function not found');
    const body = match[0];
    const inflightIdx = body.indexOf('_inFlight = true');
    const setInputIdx = body.indexOf('_setInputEnabled(false)');
    assert.ok(inflightIdx > 0 && setInputIdx > 0, 'both _inFlight and _setInputEnabled must exist');
    // _setInputEnabled(false) should come AFTER or at same position as _inFlight = true
    assert.ok(setInputIdx >= inflightIdx,
      '_setInputEnabled(false) should come after or at _inFlight = true');
  });

  it('should not leave _inFlight true on error', () => {
    // The finally block must always reset _inFlight
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile not found');
    const body = match[0];
    // Verify _inFlight = true is set before try, and _inFlight = false is in finally
    const tryIdx = body.indexOf('try {');
    const finallyIdx = body.indexOf('finally {');
    const setTrueIdx = body.indexOf('_inFlight = true');
    const setFalseIdx = body.indexOf('_inFlight = false');
    assert.ok(setTrueIdx > 0 && setTrueIdx < tryIdx, '_inFlight = true should be before try block (after preflight)');
    assert.ok(setFalseIdx > finallyIdx, '_inFlight = false should be inside finally block');
  });

  it('Phase 6C features preserved: file validation exists', () => {
    assert.ok(src.includes('function _validateFile'), '_validateFile should exist');
    assert.ok(src.includes('function _handleFileSelect'), '_handleFileSelect should exist');
  });

  it('Phase 6C features preserved: file attachment init exists', () => {
    assert.ok(src.includes('function _initFileAttachment'), '_initFileAttachment should exist');
    assert.ok(src.includes('_fileInited'), '_fileInited guard should exist');
  });

  it('Phase 6C features preserved: doChatSend override exists', () => {
    assert.ok(src.includes('var _origDoChatSend = doChatSend'), 'doChatSend override should exist');
    assert.ok(src.includes('_sendWithFile(text'), 'doChatSend should call _sendWithFile');
  });

  it('should show error on AbortError without crashing', () => {
    const match = src.match(/async function _sendWithFile[\s\S]*?^  \}/m);
    assert.ok(match, '_sendWithFile not found');
    const body = match[0];
    assert.ok(/AbortError/.test(body), 'should handle AbortError');
    assert.ok(/_appendText.*chat-msg bot/.test(body), 'should show error via _appendText');
  });
});
