import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const APP_JS = read('js/app.js');
const APP = read('app.html');
const I18N = read('js/i18n.js');

test('both lazy chat chains load local history before chat', () => {
  for (const name of ['function runLazyChat', 'function preloadLazyChat']) {
    const start = APP_JS.indexOf(name);
    const end = APP_JS.indexOf('\n}', start) + 2;
    const body = APP_JS.slice(start, end);
    const history = body.indexOf("ensureLazyModule('js/chat-history.min.js')");
    const chat = body.indexOf("ensureLazyModule('js/chat.min.js')");
    assert.ok(history >= 0, `${name} must load chat history`);
    assert.ok(chat > history, `${name} must load history before chat`);
  }
});

test('semantic adaptive chat shell preserves stable hooks and accessible regions', () => {
  const start = APP.indexOf('<div class="chat-pop" id="chatPop"');
  const end = APP.indexOf('\n  </div>\n\n  <!-- ===== Hướng dẫn sử dụng', start);
  const panel = APP.slice(start, end);

  assert.ok(start >= 0 && end > start, 'chat panel markup must be extractable');
  assert.match(panel, /id="chatPop"[^>]*role="dialog"[^>]*aria-labelledby="chatDialogTitle"/);
  assert.match(panel, /class="chat-workspace"/);
  assert.match(panel, /id="chatHistoryDrawer"[^>]*hidden[^>]*aria-labelledby="chatHistoryTitle"/);
  assert.match(panel, /id="chatHistoryBack"[^>]*data-action="chat-history-close"/);
  assert.match(panel, /class="chat-conversation"/);
  assert.match(panel, /id="chatContextStatus"[^>]*aria-live="polite"/);
  assert.match(panel, /<textarea[^>]*id="chatInput"[^>]*rows="1"[^>]*maxlength="4000"/);
  assert.match(panel, /data-action="chat-send"[^>]*disabled/);
  assert.doesNotMatch(panel, /class="chat-new-btn"/);
  assert.doesNotMatch(panel, /class="chat-clear-btn"/);
});

test('adaptive chat copy is complete in Vietnamese and English', () => {
  const keys = [
    'chatStatusReady',
    'chatContextIdle',
    'chatMenuAria',
    'chatDataSettings',
    'chatDataPanelTitle',
    'chatDataPanelBody',
    'chatHistoryLocalLabel',
    'chatHistoryBack',
    'chatHistoryMessageCount',
    'chatComposerAria',
    'chatSendAria',
    'chatSuggestPlanToday',
    'chatSuggestPriority',
    'chatSuggestWeek',
  ];
  for (const key of keys) {
    assert.equal((I18N.match(new RegExp(`\\b${key}:`, 'g')) || []).length, 2, `${key} must exist once per locale`);
  }

  assert.match(I18N, /chatDataPanelBody: 'TaskFlow chỉ gửi dữ liệu liên quan đến câu hỏi\. Reflection và Mood mặc định tắt và chỉ được gửi khi bạn chủ động bật\.'/);
  assert.match(I18N, /chatDataPanelBody: 'TaskFlow only sends data relevant to your question\. Reflections and Mood are off by default and are sent only when you turn them on\.'/);
});
