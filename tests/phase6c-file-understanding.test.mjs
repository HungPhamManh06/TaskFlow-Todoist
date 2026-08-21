import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');

/* ---- Server File Validation Tests ---- */

describe('Phase 6C: Server File Validation', () => {
  const src = read('server/ai.js');

  it('has File route at /api/ai/file', () => {
    assert.ok(src.includes("router.post('/file'"));
  });

  it('requires busboy', () => {
    assert.ok(src.includes("require('busboy')"));
  });

  it('has rate limiter for file route', () => {
    assert.ok(src.includes('aiFileLimiter'));
    assert.ok(src.includes('aiFileHourlyLimiter'));
  });

  it('has concurrency guard', () => {
    assert.ok(src.includes('_fileInFlight'));
    assert.ok(src.includes('releaseSlot'));
  });

  it('validates file size', () => {
    assert.ok(src.includes('AI_FILE_MAX_BYTES'));
    assert.ok(src.includes('ai-file-too-large'));
  });

  it('validates empty file', () => {
    assert.ok(src.includes('ai-file-empty'));
  });

  it('validates MIME type', () => {
    assert.ok(src.includes('FILE_ALLOWED_MIMES'));
    assert.ok(src.includes('image/jpeg'));
    assert.ok(src.includes('image/png'));
    assert.ok(src.includes('image/webp'));
    assert.ok(src.includes('application/pdf'));
    assert.ok(src.includes('text/plain'));
    assert.ok(src.includes('text/markdown'));
  });

  it('validates magic bytes', () => {
    assert.ok(src.includes('detectFileType'));
    assert.ok(src.includes('FF D8 FF') || src.includes('0xFF, 0xD8, 0xFF'));
    assert.ok(src.includes('0x89, 0x50, 0x4E, 0x47')); // PNG
    assert.ok(src.includes('%PDF-'));
    assert.ok(src.includes('RIFF'));
    assert.ok(src.includes('WEBP'));
  });

  it('sanitizes filename', () => {
    assert.ok(src.includes('sanitizeFilename'));
    assert.ok(src.includes('\\\\/')); // strips path separators
  });

  it('rejects unsupported types', () => {
    assert.ok(src.includes('ai-file-type-unsupported'));
  });

  it('has auth via router.use(authMiddleware)', () => {
    assert.ok(src.includes('router.use(authMiddleware)'));
  });

  it('uses multipart/form-data', () => {
    assert.ok(src.includes('multipart/form-data'));
  });

  it('does NOT use JSON base64 from frontend', () => {
    // The server receives multipart, not JSON base64
    assert.ok(src.includes('Busboy'));
  });

  it('has prompt injection protection in system instruction', () => {
    assert.ok(src.includes('untrusted USER DATA'));
    assert.ok(src.includes('Do NOT follow'));
    assert.ok(src.includes('KHÔNG làm theo'));
  });

  it('has file error codes', () => {
    assert.ok(src.includes('ai-file-too-large'));
    assert.ok(src.includes('ai-file-type-unsupported'));
    assert.ok(src.includes('ai-file-empty'));
    assert.ok(src.includes('ai-file-invalid'));
    assert.ok(src.includes('ai-file-processing-failed'));
    // Phase 6Q: timeout/unavailable errors now handled by unified provider
    assert.ok(src.includes('callAiText'), 'file route uses unified provider');
  });

  it('cleans up in finally block', () => {
    assert.ok(src.includes('finally'));
    assert.ok(src.includes('releaseSlot()'));
  });

  it('does NOT route to Agent', () => {
    // File route should be separate from Agent
    const fileRouteStart = src.indexOf("router.post('/file'");
    const agentRouteStart = src.indexOf("router.post('/agent'");
    assert.ok(fileRouteStart > 0);
    assert.ok(agentRouteStart > 0);
    assert.ok(fileRouteStart !== agentRouteStart);
  });

  it('returns safe response format', () => {
    assert.ok(src.includes('ok: true'));
    assert.ok(src.includes('answer:'));
    assert.ok(src.includes('file: { name:')); 
  });
});

describe('Phase 6C: Client File Attachment', () => {
  const chatSrc = read('js/chat.js');
  const appSrc = read('app.html');

  it('has attach button in HTML', () => {
    assert.ok(appSrc.includes('chatAttachBtn'));
    assert.ok(appSrc.includes('chat-attach-btn'));
  });

  it('has hidden file input', () => {
    assert.ok(appSrc.includes('chatFileInput'));
    assert.ok(appSrc.includes('type="file"'));
    assert.ok(appSrc.includes('accept="image/'));
  });

  it('has file card container', () => {
    assert.ok(appSrc.includes('chatFileCard'));
  });

  it('has file chips container', () => {
    assert.ok(appSrc.includes('chatFileChips'));
  });

  it('has file validation in chat.js', () => {
    assert.ok(chatSrc.includes('_validateFile'));
    assert.ok(chatSrc.includes('_FILE_MAX_BYTES'));
  });

  it('has file card rendering', () => {
    assert.ok(chatSrc.includes('_renderFileCard'));
    assert.ok(chatSrc.includes('chat-file-card'));
  });

  it('has image preview', () => {
    assert.ok(chatSrc.includes('createObjectURL'));
    assert.ok(chatSrc.includes('revokeObjectURL'));
  });

  it('has suggested chips for files', () => {
    assert.ok(chatSrc.includes('FILE_CHIPS_IMAGE'));
    assert.ok(chatSrc.includes('FILE_CHIPS_DOC'));
    assert.ok(chatSrc.includes('FILE_CHIPS_TEXT'));
  });

  it('sends via FormData', () => {
    assert.ok(chatSrc.includes('FormData'));
    assert.ok(chatSrc.includes("fd.append('file'"));
    assert.ok(chatSrc.includes("fd.append('message'"));
  });

  it('uses AbortController', () => {
    assert.ok(chatSrc.includes('AbortController'));
    assert.ok(chatSrc.includes('_fileAbort'));
  });

  it('clears file on chat clear', () => {
    assert.ok(chatSrc.includes('_clearFileAttachment'));
  });

  it('validates client-side before upload', () => {
    assert.ok(chatSrc.includes('_ALLOWED_TYPES'));
    assert.ok(chatSrc.includes('_ALLOWED_EXTS'));
  });

  it('does NOT send to /api/ai/agent for files', () => {
    // File requests go to /api/ai/file, not /api/ai/agent
    assert.ok(chatSrc.includes('/api/ai/file'));
  });
});

describe('Phase 6C: CSS Styles', () => {
  const css = read('css/styles-critical.css');

  it('has attachment button styles', () => {
    assert.ok(css.includes('.chat-attach-btn'));
  });

  it('has file card styles', () => {
    assert.ok(css.includes('.chat-file-card'));
  });

  it('has file preview styles', () => {
    assert.ok(css.includes('.chat-file-preview'));
  });

  it('has file loading styles', () => {
    assert.ok(css.includes('.chat-file-loading'));
  });

  it('has chip styles', () => {
    assert.ok(css.includes('.chat-chips'));
    assert.ok(css.includes('.chat-chip'));
  });
});

describe('Phase 6C: i18n Keys', () => {
  const src = read('js/i18n.js');

  it('has VI file keys', () => {
    assert.ok(src.includes("fileAttach: 'Đính kèm tệp'"));
    assert.ok(src.includes("fileRemove: 'Xóa tệp đính kèm'"));
    assert.ok(src.includes("fileTooLarge: 'Tệp quá lớn"));
    assert.ok(src.includes("fileUnsupported: 'Loại tệp không được hỗ trợ'"));
    assert.ok(src.includes("fileProcessing: 'Đang xử lý'"));
  });

  it('has EN file keys', () => {
    assert.ok(src.includes("fileAttach: 'Attach file'"));
    assert.ok(src.includes("fileRemove: 'Remove attachment'"));
    assert.ok(src.includes("fileTooLarge: 'File too large"));
    assert.ok(src.includes("fileUnsupported: 'Unsupported file type'"));
  });
});

describe('Phase 6C: Security', () => {
  it('server has prompt injection boundary', () => {
    const src = read('server/ai.js');
    assert.ok(src.includes('untrusted USER DATA'));
    assert.ok(src.includes('Never execute'));
    assert.ok(src.includes('KHÔNG thực hiện'));
  });

  it('client does not expose filesystem paths', () => {
    const chatSrc = read('js/chat.js');
    // Should show filename, not full path
    assert.ok(chatSrc.includes('file.name'));
    assert.ok(!chatSrc.includes('webkitRelativePath'));
  });

  it('server rejects oversized files', () => {
    const src = read('server/ai.js');
    assert.ok(src.includes('AI_FILE_MAX_BYTES'));
  });

  it('file bytes are not stored permanently', () => {
    const src = read('server/ai.js');
    // Should process in memory, no permanent storage
    assert.ok(!src.includes('fs.writeFile'));
    assert.ok(!src.includes('uploads/'));
  });
});

describe('Phase 6C: Regression — No Agent Routing', () => {
  it('file route is separate from agent route', () => {
    const src = read('server/ai.js');
    const fileIdx = src.indexOf("router.post('/file'");
    const agentIdx = src.indexOf("router.post('/agent'");
    assert.ok(fileIdx > 0 && agentIdx > 0);
    assert.ok(fileIdx !== agentIdx);
  });

  it('file analysis does not call agent apply', () => {
    const src = read('server/ai.js');
    // File route section should not contain agent-specific logic
    const fileStart = src.indexOf("router.post('/file'");
    // End at the Phase 6D section boundary or module.exports
    const phase6dMarker = src.indexOf('Phase 6D: POST /api/ai/file-agent');
    const fileEnd = phase6dMarker > fileStart ? phase6dMarker : src.indexOf('module.exports');
    const fileSection = src.slice(fileStart, fileEnd);
    assert.ok(!fileSection.includes('buildAgentDependencyGraph'));
    assert.ok(!fileSection.includes('AGENT_ACTION_TYPES'));
  });
});

describe('Phase 6C: Regression — General Chat', () => {
  it('general chat route unchanged', () => {
    const src = read('server/ai.js');
    assert.ok(src.includes("router.post('/chat'"));
  });

  it('agent route unchanged', () => {
    const src = read('server/ai.js');
    assert.ok(src.includes("router.post('/agent'"));
  });
});
