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
const CSS = read('css/styles.css');
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

test('outside-click containment survives history item re-rendering', () => {
  const start = APP_JS.indexOf('// Click ngoài Chat');
  const end = APP_JS.indexOf('/* ---- Phase 3B:', start);
  const outsideClick = APP_JS.slice(start, end);
  assert.match(outsideClick, /p\.getAttribute\('data-presentation'\) === 'sheet'/);
  assert.match(outsideClick, /e\.composedPath\(\)/);
  assert.match(outsideClick, /path\.indexOf\(p\) !== -1/);
  assert.match(outsideClick, /closeChatPanel\(\)/);
});

test('closing chat restores focus to a visible opener with stable fallbacks', () => {
  assert.match(APP_JS, /let _chatOpener = null/);
  assert.match(APP_JS, /function canRestoreChatFocus\(element\)/);
  const closePanel = functionBody(APP_JS, 'closeChatPanel');
  assert.match(closePanel, /_chatOpener/);
  assert.match(closePanel, /document\.getElementById\('chatFab'\)/);
  assert.match(closePanel, /#mobileNav \[data-action="more"\]/);
  const toggleStart = APP_JS.indexOf("else if (act === 'chat-toggle')");
  const toggleFlow = APP_JS.slice(toggleStart, toggleStart + 1000);
  assert.match(toggleFlow, /_chatOpener = el/);
});

test('composer helpers submit plain Enter while preserving Shift+Enter and IME composition', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
  };

  try {
    delete require.cache[require.resolve('../js/chat.js')];
    const Chat = require('../js/chat.js');
    assert.equal(Chat._shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: false }), true);
    assert.equal(Chat._shouldSubmitComposer({ key: 'Enter', shiftKey: true, isComposing: false }), false);
    assert.equal(Chat._shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: true }), false);
    assert.equal(Chat._shouldSubmitComposer({ key: 'Escape', shiftKey: false, isComposing: false }), false);
  } finally {
    globalThis.document = previousDocument;
    delete require.cache[require.resolve('../js/chat.js')];
  }
});

test('composer owns auto-growth and app no longer intercepts chat Enter', () => {
  assert.match(CHAT, /function _resizeComposer\(textarea\)/);
  assert.match(CHAT, /textarea\.style\.height = 'auto'/);
  assert.match(CHAT, /Math\.min\([^,]+, 112\)/);
  assert.match(CHAT, /function _syncComposerState\(\)/);
  assert.match(CHAT, /function _initComposer\(\)/);
  assert.doesNotMatch(APP_JS, /activeElement\.id === 'chatInput'[\s\S]{0,180}doChatSend/);
});

test('composer measures intrinsic content height instead of flex-stretched auto height', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
  };
  let currentHeight = '';
  const textarea = {
    style: {
      get height() { return currentHeight; },
      set height(value) { currentHeight = value; },
    },
    get scrollHeight() { return currentHeight === '0px' ? 36 : 112; },
  };

  try {
    delete require.cache[require.resolve('../js/chat.js')];
    const Chat = require('../js/chat.js');
    Chat._resizeComposer(textarea);
    assert.equal(currentHeight, '36px');
  } finally {
    globalThis.document = previousDocument;
    delete require.cache[require.resolve('../js/chat.js')];
  }
});

test('safe message renderer keeps multiline text structured and scrolls only near the bottom', () => {
  assert.match(CHAT, /function _isNearBottom\(container\)/);
  assert.match(CHAT, /function _appendMessage\(container, text, role, metaKey\)/);
  assert.match(CHAT, /body\.textContent = text/);
  assert.doesNotMatch(CHAT, /body\.innerHTML = text/);
  assert.match(functionBody(CHAT, '_appendMessage'), /if \(shouldStick\) container\.scrollTop = container\.scrollHeight/);
  assert.doesNotMatch(CHAT, /function _appendText\(/);
});

test('send control keeps its node stable in stop mode and retry does not duplicate the user bubble', () => {
  const sendMode = functionBody(CHAT, '_setSendMode');
  assert.doesNotMatch(sendMode, /sendBtn\.textContent\s*=/);
  assert.match(sendMode, /querySelector\('\[data-chat-send-marker\]'\)/);
  assert.match(sendMode, /sendBtn\.disabled = false/);
  assert.match(functionBody(CHAT, 'stopActiveResponse'), /_resizeComposer\(input\)/);
  assert.match(functionBody(CHAT, 'stopActiveResponse'), /_syncComposerState\(\)/);
  assert.match(functionBody(CHAT, '_showRetry'), /_doSend\(failedMsg, \{ userBubble: false \}\)/);
});

test('initial suggestions are exactly three localized safe actions', () => {
  assert.deepEqual(
    [...CHAT.matchAll(/^\s{4}'([^']+)': \{ labelKey:/gm)].map((match) => match[1]),
    ['plan-today', 'priority-work', 'week-summary'],
  );
  assert.match(CHAT, /function _renderSuggestions\(mode\)/);
  assert.match(functionBody(CHAT, '_renderSuggestions'), /btn\.textContent = _t\(suggestion\.labelKey\)/);
  assert.match(functionBody(CHAT, '_renderSuggestions'), /mode === 'initial'/);
  for (const key of [
    'chatSuggestPlanToday', 'chatSuggestPriority', 'chatSuggestWeek',
    'chatSuggestPlanTodayPrompt', 'chatSuggestPriorityPrompt', 'chatSuggestWeekPrompt',
  ]) {
    assert.equal((I18N.match(new RegExp(`\\b${key}:`, 'g')) || []).length, 2, `${key} must exist once per locale`);
  }
});

test('composer and initial suggestions initialize in reachable module setup after history wiring', () => {
  const historyInit = CHAT.indexOf('\n  _initHistoryDrawer();');
  const composerInit = CHAT.indexOf('\n  _initComposer();');
  const suggestionsInit = CHAT.indexOf("\n  _renderSuggestions('initial');");
  const factoryReturn = CHAT.lastIndexOf('\n  return {');

  assert.ok(historyInit >= 0, 'history initialization must exist');
  assert.ok(composerInit > historyInit, 'composer initializes after history wiring');
  assert.ok(suggestionsInit > composerInit, 'initial suggestions render after composer setup');
  assert.ok(suggestionsInit < factoryReturn, 'module initialization must run before the factory returns');
});

test('context, consent, and local storage surfaces are explicit and independent', () => {
  assert.match(CHAT, /function _contextKeysFromEnvelope\(envelope\)/);
  assert.match(CHAT, /function _setContextStatus\(state, keys\)/);
  assert.match(APP, /data-chat-consent="reflections"[^>]*role="switch"[^>]*aria-checked="false"/);
  assert.match(APP, /data-chat-consent="mood"[^>]*role="switch"[^>]*aria-checked="false"/);
  assert.match(APP_JS, /TaskFlowAIContextConsent\.setPermission/);
  assert.match(functionBody(APP_JS, 'syncChatConsentSwitches'), /TaskFlowAIContextConsent\.getPermissions\(\)/);
  assert.equal((I18N.match(/chatHistoryLocalLabel:/g) || []).length, 2);
});

test('context categories come only from fields in the trusted outgoing envelope', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
  };

  try {
    delete require.cache[require.resolve('../js/chat.js')];
    const Chat = require('../js/chat.js');
    assert.deepEqual(Chat._contextKeysFromEnvelope({
      scope: 'overview',
      data: {
        tasks: [],
        milestones: [],
        busy: [],
        habits: [],
        reflections: [],
      },
      requestedPermissions: { mood: true },
    }), ['tasks', 'projects', 'schedule', 'habits', 'reflections']);
    assert.deepEqual(Chat._contextKeysFromEnvelope({
      data: { mood: [], projects: [] },
      permissions: { reflections: true },
    }), ['projects', 'mood']);
    assert.deepEqual(Chat._contextKeysFromEnvelope(null), []);
  } finally {
    globalThis.document = previousDocument;
    delete require.cache[require.resolve('../js/chat.js')];
  }
});

test('context status lifecycle is tied to the request envelope and every terminal path', () => {
  const callApi = functionBody(CHAT, '_callChatAPI');
  const send = functionBody(CHAT, '_doSend');
  const fileSend = functionBody(CHAT, '_sendWithFile');
  assert.match(callApi, /var contextKeys = _contextKeysFromEnvelope\(taskflowContext\)/);
  assert.match(callApi, /_setContextStatus\('using', contextKeys\)[\s\S]*fetch\(/);
  assert.match(callApi, /_setContextStatus\('used', contextKeys\)/);
  assert.match(send, /_setContextStatus\('preparing', \[\]\)/);
  assert.match(send, /_setContextStatus\('(idle|error)', \[\]\)/);
  assert.match(fileSend, /_contextKeysFromEnvelope\(fileContextEnvelope\)/);
  assert.match(functionBody(CHAT, 'stopActiveResponse'), /_setContextStatus\('idle', \[\]\)/);
});

test('context status copy and category labels exist once per locale', () => {
  for (const key of [
    'chatContextPreparing', 'chatContextUsing', 'chatContextUsed', 'chatContextError',
    'chatContextCategoryTasks', 'chatContextCategoryProjects', 'chatContextCategorySchedule',
    'chatContextCategoryHabits', 'chatContextCategoryReflections', 'chatContextCategoryMood',
    'chatConsentReflections', 'chatConsentMood',
  ]) {
    assert.equal((I18N.match(new RegExp(`\\b${key}:`, 'g')) || []).length, 2, `${key} must exist once per locale`);
  }
});

test('Focused Coach compact and expanded geometry use the approved adaptive grid', () => {
  assert.match(CSS, /\.chat-pop \{[\s\S]*width: min\(400px, calc\(100vw - 24px\)\)/);
  assert.match(CSS, /\.chat-pop\[data-history-open="true"\][\s\S]*width: min\(660px, calc\(100vw - 24px\)\)/);
  assert.match(CSS, /\.chat-workspace[\s\S]*grid-template-columns/);
  assert.match(CSS, /\.chat-history-item--active[\s\S]*border-inline-start/);
});

test('adaptive workspace pins conversation and history to stable grid columns', () => {
  assert.match(CSS, /\.chat-history-drawer \{[^}]*grid-column:\s*1/);
  assert.match(CSS, /\.chat-conversation \{[^}]*grid-column:\s*2/);
  assert.match(CSS, /@media \(max-width: 767px\)[\s\S]*\.chat-conversation \{[^}]*grid-column:\s*1/);
});

test('Focused Coach mobile presentation fills the dynamic viewport and honors safe areas', () => {
  assert.match(CSS, /@media \(max-width: 767px\)[\s\S]*height: 100dvh/);
  assert.match(CSS, /env\(safe-area-inset-bottom\)/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(CSS, /\.fb-fab-wrap\s*\{\s*inset:\s*0/);
});

test('chat presentation semantics distinguish compact popover from mobile sheet', () => {
  const presentation = functionBody(APP_JS, 'syncChatPresentation');
  assert.match(presentation, /matchMedia\('\(max-width: 767px\)'\)/);
  assert.match(presentation, /data-presentation/);
  assert.match(presentation, /aria-modal/);
  assert.match(presentation, /chatHistoryTitle/);
  assert.match(presentation, /chatDialogTitle/);
});
