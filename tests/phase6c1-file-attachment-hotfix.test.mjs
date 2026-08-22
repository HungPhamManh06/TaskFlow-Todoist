import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');

describe('Phase 6C.1: File Attachment Init Hotfix', () => {
  const chatSrc = read('js/chat.js');
  const appHtml = read('app.html');

  it('chatAttachBtn exists in HTML', () => {
    assert.ok(appHtml.includes('id="chatAttachBtn"'));
  });

  it('chatFileInput exists in HTML', () => {
    assert.ok(appHtml.includes('id="chatFileInput"'));
  });

  it('_initFileAttachment is called at module scope (not inside doChatClear)', () => {
    // The init should be called immediately after definition, not gated behind doChatClear
    assert.ok(chatSrc.includes('_initFileAttachment();'), 'should call _initFileAttachment() at module scope');
    // Should NOT have the old doChatClear wrapper pattern
    assert.ok(!chatSrc.includes('var origOpen = doChatClear'), 'should not wrap doChatClear for init');
  });

  it('_initFileAttachment is idempotent (checks _fileInited)', () => {
    assert.ok(chatSrc.includes('if (_fileInited) return'), 'should early-return if already initialized');
  });

  it('click handler calls fileInput.click()', () => {
    assert.ok(chatSrc.includes("fileInput.click()"), 'attach button should trigger file picker');
  });

  it('change handler calls _handleFileSelect', () => {
    assert.ok(chatSrc.includes('_handleFileSelect(fileInput.files)'), 'change event should process all selected files');
  });

  it('does NOT use doChatClear as init trigger', () => {
    // The old pattern: doChatClear = function () { if (!_fileInited) { _initFileAttachment(); ...
    // Should not exist
    const lines = chatSrc.split('\n');
    const clearOverrideIdx = lines.findIndex((l) => l.includes('doChatClear = function'));
    if (clearOverrideIdx >= 0) {
      const clearBody = lines.slice(clearOverrideIdx, clearOverrideIdx + 5).join('\n');
      assert.ok(!clearBody.includes('_initFileAttachment'), 'doChatClear should not call _initFileAttachment');
    }
  });
});

describe('Phase 6C.1: Backend URL Routing', () => {
  const chatSrc = read('js/chat.js');

  it('file upload uses apiBase (not relative URL)', () => {
    // Should use apiBase for file endpoints (either literal or via variable)
    assert.ok(chatSrc.includes('apiBase + endpoint') || chatSrc.includes("apiBase + '/api/ai/file'"), 'should use apiBase for file endpoint');
    // Should NOT have bare fetch('/api/ai/file', ...) without apiBase
    const fetchMatches = chatSrc.match(/fetch\(['"]\/api\/ai\/file['"]/g);
    assert.ok(!fetchMatches, 'should not use bare relative URL for file endpoint');
  });

  it('api-config-missing is handled gracefully', () => {
    assert.ok(chatSrc.includes("throw { code: 'api-config-missing' }"), 'should throw on missing config');
    assert.ok(chatSrc.includes("e.code === 'api-config-missing'"), 'should catch api-config-missing in error handler');
  });

  it('existing chat API still uses apiBase', () => {
    assert.ok(chatSrc.includes("apiBase + '/api/ai/chat'"), 'chat endpoint should use apiBase');
  });
});

describe('Phase 6C.1: Preserved Phase 6C Behavior', () => {
  const chatSrc = read('js/chat.js');

  it('supports image preview via createObjectURL', () => {
    assert.ok(chatSrc.includes('createObjectURL'));
  });

  it('revokes object URL on cleanup', () => {
    assert.ok(chatSrc.includes('revokeObjectURL'));
  });

  it('uses FormData for upload', () => {
    assert.ok(chatSrc.includes('FormData'));
  });

  it('has abort controller', () => {
    assert.ok(chatSrc.includes('AbortController'));
  });

  it('validates file types client-side', () => {
    assert.ok(chatSrc.includes('_ALLOWED_TYPES'));
  });

  it('validates file size client-side', () => {
    assert.ok(chatSrc.includes('_FILE_MAX_BYTES'));
  });
});
