import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');

describe('Chat Paste Attachments: Source Structure', () => {
  const chatSrc = read('js/chat.js');

  it('has _extractClipboardFiles function', () => {
    assert.ok(chatSrc.includes('function _extractClipboardFiles('));
  });

  it('has _handleComposerPaste function', () => {
    assert.ok(chatSrc.includes('function _handleComposerPaste('));
  });

  it('has _normalizeClipboardFileName function', () => {
    assert.ok(chatSrc.includes('function _normalizeClipboardFileName('));
  });

  it('has existing _attachedFiles array', () => {
    assert.ok(chatSrc.includes('var _attachedFiles = []'));
  });

  it('has existing _FILE_MAX_FILES = 5', () => {
    assert.ok(chatSrc.includes('_FILE_MAX_FILES = 5'));
  });

  it('has existing _FILE_MAX_TOTAL_BYTES = 30 MB', () => {
    assert.ok(chatSrc.includes('30 * 1024 * 1024'));
  });
});

describe('Chat Paste Attachments: Clipboard Extraction', () => {
  const chatSrc = read('js/chat.js');

  it('reads event.clipboardData', () => {
    assert.ok(chatSrc.includes('event.clipboardData'));
  });

  it('inspects clipboardData.items', () => {
    assert.ok(chatSrc.includes('cd.items'));
  });

  it('checks item.kind === file', () => {
    assert.ok(chatSrc.includes("item.kind === 'file'"));
  });

  it('calls getAsFile()', () => {
    assert.ok(chatSrc.includes('item.getAsFile()'));
  });

  it('falls back to clipboardData.files', () => {
    assert.ok(chatSrc.includes('cd.files'));
  });

  it('does NOT use navigator.clipboard.read()', () => {
    assert.ok(!chatSrc.includes('navigator.clipboard.read()'));
  });

  it('collects multiple clipboard files', () => {
    assert.ok(chatSrc.includes('files.push(f)'));
  });
});

describe('Chat Paste Attachments: Paste Handler', () => {
  const chatSrc = read('js/chat.js');

  it('registers paste listener on chatInput', () => {
    assert.ok(chatSrc.includes("addEventListener('paste'") || chatSrc.includes('addEventListener("paste"'));
  });

  it('paste handler calls event.preventDefault() for files', () => {
    assert.ok(chatSrc.includes('event.preventDefault()'));
  });

  it('paste handler returns early for text-only paste', () => {
    assert.ok(chatSrc.includes('clipboardFiles.length === 0') || chatSrc.includes('clipboardFiles.length === 0) return'));
  });

  it('paste handler calls _handleFileSelect with candidates', () => {
    assert.ok(chatSrc.includes('_handleFileSelect(candidates)'));
  });

  it('paste ignored when input is disabled (in-flight)', () => {
    assert.ok(chatSrc.includes('input.disabled'));
  });

  it('normalizes clipboard screenshot filenames', () => {
    assert.ok(chatSrc.includes('Screenshot'));
  });

  it('normalizes filename based on MIME type', () => {
    assert.ok(chatSrc.includes("file.type === 'image/jpeg'"));
    assert.ok(chatSrc.includes("file.type === 'image/webp'"));
    // image/png is the default extension, no explicit check needed
  });

  it('paste does NOT auto-send', () => {
    const pasteIdx = chatSrc.indexOf('function _handleComposerPaste');
    const pasteEnd = chatSrc.indexOf('/* ---- Initialize file attachment');
    const pasteBody = chatSrc.slice(pasteIdx, pasteEnd);
    assert.ok(!pasteBody.includes('doChatSend()'), 'paste should not call doChatSend');
    assert.ok(pasteBody.includes('_handleFileSelect(candidates)'), 'paste should call _handleFileSelect');
  });
});

describe('Chat Paste Attachments: Filename Normalization', () => {
  const chatSrc = read('js/chat.js');

  it('detects generic blob name', () => {
    assert.ok(chatSrc.includes('/^blob$/i'));
  });

  it('detects image.png generic name', () => {
    assert.ok(chatSrc.includes("name === 'image.png'"));
  });

  it('preserves useful filenames', () => {
    assert.ok(chatSrc.includes('!isGeneric'));
  });

  it('uses zero-padded timestamps', () => {
    assert.ok(chatSrc.includes("n < 10 ? '0' + n"));
  });
});

describe('Chat Paste Attachments: Security', () => {
  const chatSrc = read('js/chat.js');

  it('no innerHTML injection from clipboard', () => {
    const pasteIdx = chatSrc.indexOf('function _handleComposerPaste');
    const pasteEnd = chatSrc.indexOf('/* ---- Initialize file attachment');
    const pasteBody = chatSrc.slice(pasteIdx, pasteEnd);
    assert.ok(!pasteBody.includes('innerHTML'));
  });

  it('no arbitrary URL fetch from clipboard', () => {
    const pasteIdx = chatSrc.indexOf('function _handleComposerPaste');
    const pasteEnd = chatSrc.indexOf('/* ---- Initialize file attachment');
    const pasteBody = chatSrc.slice(pasteIdx, pasteEnd);
    assert.ok(!pasteBody.includes('fetch('));
  });

  it('no navigator.clipboard.read()', () => {
    assert.ok(!chatSrc.includes('navigator.clipboard.read()'));
  });

  it('no base64 conversion', () => {
    assert.ok(!chatSrc.includes('readAsDataURL'));
    assert.ok(!chatSrc.includes('btoa('));
  });
});

describe('Chat Paste Attachments: Public API', () => {
  const chatSrc = read('js/chat.js');

  it('exports _extractClipboardFiles', () => {
    assert.ok(chatSrc.includes('_extractClipboardFiles: _extractClipboardFiles'));
  });

  it('exports _handleComposerPaste', () => {
    assert.ok(chatSrc.includes('_handleComposerPaste: _handleComposerPaste'));
  });

  it('exports _normalizeClipboardFileName', () => {
    assert.ok(chatSrc.includes('_normalizeClipboardFileName: _normalizeClipboardFileName'));
  });
});

describe('Chat Paste Attachments: Existing Behavior Preserved', () => {
  const chatSrc = read('js/chat.js');

  it('file picker still works', () => {
    assert.ok(chatSrc.includes('fileInput.files && fileInput.files.length'));
  });

  it('drag & drop still works', () => {
    assert.ok(chatSrc.includes('dragenter'));
    assert.ok(chatSrc.includes('dragover'));
    assert.ok(chatSrc.includes('dragleave'));
    assert.ok(chatSrc.includes("'drop'"));
  });

  it('stop response still works', () => {
    assert.ok(chatSrc.includes('stopActiveResponse'));
  });

  it('new conversation clears attachments', () => {
    const ncIdx = chatSrc.indexOf('function newConversation()');
    const ncBody = chatSrc.slice(ncIdx, ncIdx + 500);
    assert.ok(ncBody.includes('_clearFileAttachments()') || ncBody.includes('_clearFileAttachment'));
  });
});
