import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const HTML = read('app.html');
const CSS = read('css/styles.css');
const I18N = read('js/i18n.js');
const CHAT_SOURCE = read('js/chat.js');
const APP_SOURCE = read('js/app.js');
const FRONTEND_E2E = read('scripts/e2e-frontend.py');
const require = createRequire(import.meta.url);

globalThis.document = {
  getElementById() { return null; },
  querySelector() { return null; },
};
const CHAT = require('../js/chat.js');

const MB = 1024 * 1024;
const fileLike = (name, type, size = 1024, lastModified = 1) => ({ name, type, size, lastModified });

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`${name} body must be extractable`);
}

test('chat header uses an in-flow close control', () => {
  assert.match(HTML, /id="chat-close"[^>]*class="[^"]*chat-close-btn/);
  assert.doesNotMatch(HTML, /id="chat-close"[^>]*sync-close/);
  assert.match(CSS, /\.chat-close-btn\s*\{/);
});

test('composer exposes a multi-file picker and drop status', () => {
  assert.match(HTML, /id="chatFileInput"[^>]*multiple/);
  assert.match(HTML, /id="chat-drop-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(HTML, /class="chat-drop-overlay"[^>]*aria-hidden="true"/);
  assert.match(CSS, /\[data-drop-active="true"\]\s+\.chat-drop-overlay/);
});

test('multi-file drop copy exists in Vietnamese and English', () => {
  const keys = [
    'chatDropPrompt',
    'chatChooseFiles',
    'chatRemoveFile',
    'chatAcceptedCount',
    'chatFileDuplicate',
    'chatFileUnsupported',
    'chatFileTooLarge',
    'chatFileTooMany',
    'chatFilesTotalTooLarge',
  ];
  for (const key of keys) {
    assert.equal((I18N.match(new RegExp(`\\b${key}:`, 'g')) || []).length, 2, `${key} must exist once per locale`);
  }
  assert.match(I18N, /Tối đa 5 tệp, 15 MB mỗi tệp, tổng 30 MB\./);
  assert.match(I18N, /Up to 5 files, 15 MB each, 30 MB total\./);
});

test('attachment queue exposes the approved limits', () => {
  assert.deepEqual(CHAT.ATTACHMENT_LIMITS, {
    maxFiles: 5,
    maxFileBytes: 15 * MB,
    maxTotalBytes: 30 * MB,
  });
});

test('attachment queue accepts only the approved MIME types and case-insensitive Markdown fallback', () => {
  const approved = [
    fileLike('photo.jpg', 'image/jpeg'),
    fileLike('photo.png', 'image/png'),
    fileLike('photo.webp', 'image/webp'),
    fileLike('plan.pdf', 'application/pdf'),
    fileLike('notes.txt', 'text/plain'),
    fileLike('notes.markdown', 'text/markdown'),
  ];
  const mimeResult = CHAT.mergeAttachmentCandidates([], approved.slice(0, 5));
  assert.deepEqual(mimeResult.files, approved.slice(0, 5));
  assert.deepEqual(mimeResult.rejected, []);

  const mdResult = CHAT.mergeAttachmentCandidates([], [fileLike('NOTES.MD', '')]);
  assert.deepEqual(mdResult.files.map((file) => file.name), ['NOTES.MD']);
  assert.deepEqual(mdResult.rejected, []);
});

test('attachment queue rejects duplicate name-size-modified tuples before other rules', () => {
  const original = fileLike('same.png', 'image/png', 16 * MB, 42);
  const duplicate = fileLike('same.png', 'application/octet-stream', 16 * MB, 42);
  const result = CHAT.mergeAttachmentCandidates([original], [duplicate]);
  assert.deepEqual(result.files, [original]);
  assert.deepEqual(result.rejected, [{ name: 'same.png', code: 'duplicate' }]);
  assert.equal(CHAT.fileKey(original), CHAT.fileKey(duplicate));
});

test('attachment queue rejects empty candidates without clearing valid files', () => {
  const valid = fileLike('keep.txt', 'text/plain');
  const result = CHAT.mergeAttachmentCandidates([valid], [fileLike('empty.txt', 'text/plain', 0, 2)]);
  assert.deepEqual(result.files, [valid]);
  assert.deepEqual(result.rejected, [{ name: 'empty.txt', code: 'empty-file' }]);
});

test('attachment queue enforces per-file, count, and combined byte limits independently', () => {
  const tooLarge = CHAT.mergeAttachmentCandidates([], [fileLike('large.pdf', 'application/pdf', 15 * MB + 1)]);
  assert.deepEqual(tooLarge.rejected, [{ name: 'large.pdf', code: 'too-large' }]);

  const five = Array.from({ length: 5 }, (_, index) => fileLike(`${index}.txt`, 'text/plain', 1, index));
  const tooMany = CHAT.mergeAttachmentCandidates(five, [fileLike('six.txt', 'text/plain')]);
  assert.deepEqual(tooMany.rejected, [{ name: 'six.txt', code: 'too-many-files' }]);

  const current = [fileLike('first.pdf', 'application/pdf', 20 * MB)];
  const overTotal = CHAT.mergeAttachmentCandidates(current, [fileLike('second.pdf', 'application/pdf', 11 * MB)]);
  assert.deepEqual(overTotal.rejected, [{ name: 'second.pdf', code: 'total-too-large' }]);
});

test('attachment queue partially accepts a mixed batch in input order without mutation', () => {
  const current = [];
  const valid = fileLike('valid.png', 'image/png', 10, 10);
  const candidates = [
    fileLike('script.exe', 'application/octet-stream', 2, 2),
    valid,
    fileLike('valid.png', 'image/png', 10, 10),
    fileLike('huge.pdf', 'application/pdf', 15 * MB + 1, 4),
    fileLike('notes.md', '', 20, 5),
  ];
  const before = candidates.slice();
  const result = CHAT.mergeAttachmentCandidates(current, candidates);

  assert.deepEqual(result.files.map((file) => file.name), ['valid.png', 'notes.md']);
  assert.deepEqual(result.rejected.map((item) => item.code), ['unsupported-type', 'duplicate', 'too-large']);
  assert.deepEqual(candidates, before);
  assert.notEqual(result.files, current);
});

test('client lifecycle uses an array queue, stable-key removal, and object URL map', () => {
  assert.match(CHAT_SOURCE, /var _attachedFiles = \[\];/);
  assert.match(CHAT_SOURCE, /var _fileObjectUrls = new Map\(\);/);
  assert.match(CHAT_SOURCE, /var _dragDepth = 0;/);
  assert.match(functionBody(CHAT_SOURCE, '_removeAttachedFile'), /_fileKey\(file\) === fileKey/);
  assert.match(functionBody(CHAT_SOURCE, '_clearFileAttachments'), /_fileObjectUrls\.forEach/);
  assert.match(functionBody(CHAT_SOURCE, '_renderFileCards'), /chatRemoveFile/);
});

test('one file request freezes the queue and appends repeated multipart fields', () => {
  const body = functionBody(CHAT_SOURCE, '_sendWithFile');
  assert.match(body, /var requestFiles = _attachedFiles\.slice\(\);/);
  assert.match(body, /requestFiles\.forEach\(function \(file\) \{\s*fd\.append\('files', file, file\.name\);/);
  assert.doesNotMatch(body, /fd\.append\('file', file\)/);
  assert.match(body, /_setAttachmentControlsDisabled\(true\)/);
  assert.match(body, /if \(requestSucceeded\) _clearFileAttachments\(\)/);
});

test('stale file requests cannot clear or re-enable a newer queue', () => {
  const body = functionBody(CHAT_SOURCE, '_sendWithFile');
  assert.match(CHAT_SOURCE, /var _attachmentQueueVersion = 0;/);
  assert.match(body, /var requestQueueVersion = _attachmentQueueVersion;/);
  assert.match(body, /if \(!_isCurrentRequest\(req\.generation\)\) return;/);
  assert.match(body, /requestQueueVersion === _attachmentQueueVersion/);
  assert.match(body, /_setAttachmentControlsDisabled\(false\)/);
});

test('server rejection metadata is announced before accepted attachments reach history', () => {
  const body = functionBody(CHAT_SOURCE, '_sendWithFile');
  const announce = body.indexOf('_announceRejectedFiles(json.rejectedFiles');
  const persist = body.indexOf('_persistUserMessage(');
  assert.ok(announce >= 0, 'server rejectedFiles must be announced');
  assert.ok(persist > announce, 'history persistence must happen after server reconciliation');
  assert.match(body, /json\.files/);
});

test('picker and drag-drop share partial acceptance without hijacking non-file drags', () => {
  const initBody = functionBody(CHAT_SOURCE, '_initFileAttachment');
  assert.match(initBody, /fileInput\.files/);
  assert.match(initBody, /dragenter/);
  assert.match(initBody, /dragleave/);
  assert.match(initBody, /drop/);
  assert.match(initBody, /dataTransfer\.types/);
  assert.match(initBody, /_mergeAttachmentCandidates\(_attachedFiles,/);
  assert.match(initBody, /fileInput\.value = ''/);
  assert.match(initBody, /window\.addEventListener\('blur', _resetFileDragState\)/);
  assert.match(initBody, /document\.addEventListener\('drop'/);
});

test('conversation, panel, and account transitions clear attachments and drag state', () => {
  for (const name of ['doChatClear', 'newConversation', 'openConversation', '_onAccountChange']) {
    assert.match(functionBody(CHAT_SOURCE, name), /_clearFileAttachments\(\)/, `${name} must clear attachment files`);
  }
  assert.match(functionBody(APP_SOURCE, 'closeChatPanel'), /resetAttachmentDragState/);
  assert.match(functionBody(APP_SOURCE, '_resetChatForAccountChange'), /TaskFlowChat\._onAccountChange\(\)/);
  assert.match(functionBody(APP_SOURCE, 'doSyncLogin'), /_resetChatForAccountChange\(\)/);
  assert.match(functionBody(APP_SOURCE, 'doSyncGoogle'), /_resetChatForAccountChange\(\)/);
  const logoutBody = functionBody(APP_SOURCE, 'doSyncLogout');
  assert.ok(logoutBody.indexOf('_resetChatForAccountChange()') < logoutBody.indexOf('window.Sync.logout()'));
});

test('frontend E2E covers two-file selection, keyboard removal, and one retained multipart filename', () => {
  assert.match(FRONTEND_E2E, /chatFileInput.*set_input_files/s);
  assert.match(FRONTEND_E2E, /chat-file-card-remove.*press\("Enter"\)/s);
  assert.match(FRONTEND_E2E, /retained\.md/);
  assert.match(FRONTEND_E2E, /post_data_buffer/);
  assert.match(FRONTEND_E2E, /data-drop-active/);
});
