import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const APP_JS = read('js/app.js');
const APP = read('app.html');
const I18N = read('js/i18n.js');
const CHAT = read('js/chat.js');
const require = createRequire(import.meta.url);

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`${name} body must be extractable`);
}

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

test('history view keeps drafts in memory and persists only the first user message', () => {
  for (const name of ['_captureConversationView', '_restoreConversationView', '_setHistoryOpen', 'closeHistory']) {
    assert.match(CHAT, new RegExp(`function ${name}\\(`));
  }

  assert.doesNotMatch(functionBody(CHAT, '_getActiveConversation'), /createConversation/);
  assert.match(functionBody(CHAT, '_ensureConversation'), /createConversation/);
  assert.doesNotMatch(functionBody(CHAT, 'newConversation'), /createConversation/);
  assert.doesNotMatch(functionBody(CHAT, '_onAccountChange'), /createConversation/);
  assert.match(functionBody(CHAT, '_persistUserMessage'), /_ensureConversation\(\)/);
});

test('history rail renders inside static list and footer regions with safe secondary actions', () => {
  const render = functionBody(CHAT, '_renderHistoryDrawer');
  assert.match(render, /_el\('chatHistoryList'\)/);
  assert.match(render, /_el\('chatHistoryFooter'\)/);
  assert.doesNotMatch(render, /drawer\.innerHTML\s*=/);
  assert.match(render, /chat-history-item-menu/);
  assert.match(render, /chat-history-message-count/);
  assert.match(render, /chatDeleteConversationConfirm/);
  assert.match(render, /chatConversationOptions/);
  assert.match(render, /\.textContent\s*=\s*conv\.title/);
});

test('deleting the active conversation captures its view before opening the replacement', () => {
  const remove = functionBody(CHAT, 'deleteConversation');
  assert.match(remove, /var nextConversationId = state && state\.activeConversationId/);
  assert.match(remove, /if \(nextConversationId\) \{\s*openConversation\(nextConversationId\);/);
  assert.doesNotMatch(remove, /_activeConversationId = state[\s\S]*openConversation\(_activeConversationId\)/);
});

test('adaptive history open and close synchronize DOM state and focus', () => {
  const nodes = new Map();
  const makeNode = (id = '') => ({
    id,
    hidden: false,
    children: [],
    attributes: new Map(),
    className: '',
    classList: { add() {}, remove() {} },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    addEventListener() {},
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    removeAttribute(name) { this.attributes.delete(name); },
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    focus() { this.focused = true; },
  });
  for (const id of ['chatHistoryDrawer', 'chatHistoryList', 'chatHistoryFooter', 'chatPop', 'chatInput', 'chatMessages']) {
    nodes.set(id, makeNode(id));
  }
  const historyTrigger = makeNode('historyTrigger');
  const newTrigger = makeNode('newTrigger');
  const previousDocument = globalThis.document;
  const previousHistory = globalThis.TaskFlowChatHistory;
  globalThis.document = {
    getElementById: (id) => nodes.get(id) || null,
    createElement: () => makeNode(),
    querySelector: (selector) => selector === '[data-action="chat-history"]' ? historyTrigger
      : selector === '[data-action="chat-new"]' ? newTrigger : null,
  };
  globalThis.TaskFlowChatHistory = {
    listConversations: () => [],
    load: () => ({ activeConversationId: '', conversations: [] }),
  };

  try {
    delete require.cache[require.resolve('../js/chat.js')];
    const Chat = require('../js/chat.js');
    Chat._setHistoryOpen(true);
    assert.equal(nodes.get('chatHistoryDrawer').hidden, false);
    assert.equal(nodes.get('chatPop').getAttribute('data-history-open'), 'true');
    assert.equal(historyTrigger.getAttribute('aria-expanded'), 'true');
    assert.equal(newTrigger.focused, true);

    Chat.closeHistory({ focusTrigger: true });
    assert.equal(nodes.get('chatHistoryDrawer').hidden, true);
    assert.equal(nodes.get('chatPop').getAttribute('data-history-open'), null);
    assert.equal(historyTrigger.getAttribute('aria-expanded'), 'false');
    assert.equal(historyTrigger.focused, true);
  } finally {
    globalThis.document = previousDocument;
    globalThis.TaskFlowChatHistory = previousHistory;
    delete require.cache[require.resolve('../js/chat.js')];
  }
});

test('Escape closes visible history before closing the chatbot panel', () => {
  const escapeStart = APP_JS.lastIndexOf("if (e.key === 'Escape')");
  const escapeFlow = APP_JS.slice(escapeStart, escapeStart + 500);
  const closeHistoryAt = escapeFlow.indexOf('closeVisibleChatHistory(e)');
  const closePanelAt = escapeFlow.indexOf('closeChatPanel()');
  assert.ok(escapeStart >= 0, 'Escape handler must exist');
  assert.ok(closeHistoryAt >= 0, 'Escape must close visible history');
  assert.ok(closePanelAt > closeHistoryAt, 'only the next Escape may close the chatbot');
  assert.match(functionBody(APP_JS, 'closeVisibleChatHistory'), /TaskFlowChat\.closeHistory\(\{ focusTrigger: true \}\)/);
  const closePanel = functionBody(APP_JS, 'closeChatPanel');
  assert.match(closePanel, /historyDrawer\.hidden = true/);
  assert.match(closePanel, /removeAttribute\('data-history-open'\)/);
  assert.match(closePanel, /historyBtn\.setAttribute\('aria-expanded', 'false'\)/);
});
