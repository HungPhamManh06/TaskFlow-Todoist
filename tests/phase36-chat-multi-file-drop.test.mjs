import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const HTML = read('app.html');
const CSS = read('css/styles.css');
const I18N = read('js/i18n.js');

test('chat header uses an in-flow close control', () => {
  assert.match(HTML, /id="chat-close"[^>]*class="[^"]*chat-close-btn/);
  assert.doesNotMatch(HTML, /id="chat-close"[^>]*sync-close/);
  assert.match(CSS, /\.chat-close-btn\s*\{/);
});

test('composer exposes a multi-file picker and drop status', () => {
  assert.match(HTML, /id="chat-file-input"[^>]*multiple/);
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
