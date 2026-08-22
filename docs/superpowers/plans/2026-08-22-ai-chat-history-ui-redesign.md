# TaskFlow AI Chat History UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the shipped local conversation history and cancellable responses into the approved Focused Coach chatbot, using an adaptive two-column desktop popover and a full-width mobile history child view.

**Architecture:** Start from current `origin/main`, where commit `1894d98` owns persistence and request cancellation; do not cherry-pick the stale pre-history UI commit `0af5268`. Keep `TaskFlowChatHistory` as the storage boundary, keep `TaskFlowChat` lazy, render the adaptive history rail inside the existing popover, and keep shell/focus integration in `js/app.js`. Change only readable sources until the final release task, then run the existing CSS split and minification pipelines once.

**Tech Stack:** HTML5, canonical `css/styles.css`, vanilla JavaScript IIFEs, localStorage, Node.js `node:test`, Python Playwright E2E, `scripts/split-critical-css.py`, and `scripts/minify.py`.

## Global Constraints

- Base implementation on current `origin/main`, including `1894d98 feat(chat): add local conversation history and cancellable AI responses`.
- Preserve account-scoped local history: at most 30 conversations, 60 messages per conversation, 1 MB serialized storage, and 90-day retention.
- Never store raw attachment bytes; retain only the existing safe metadata fields `type`, `name`, and `size`.
- Keep all backend AI endpoints, request payloads, server abort propagation, consent rules, and confirm-before-write behavior unchanged.
- Keep `js/chat.js` and `js/chat-history.js` lazy; load `js/chat-history.min.js` immediately before `js/chat.min.js` in both lazy chains.
- Keep stable IDs and public actions unless this plan explicitly changes them: `chatFab`, `chatPop`, `chatHistoryDrawer`, `chatMessages`, `chatActions`, `chatFileCard`, `chatFileChips`, `chatAttachBtn`, `chatInput`, and `chatFileInput`.
- Render user, file, and model content with `textContent`; never inject untrusted content through `innerHTML`.
- Use TaskFlow's existing font, theme tokens, terracotta accent, semantic green, radius system, light/dark modes, and local SVG sprite. Add no UI dependency.
- Desktop chat width is approximately 400 px closed and 660 px with a 260 px history rail; when 660 px cannot fit safely, use the single-view history presentation.
- Mobile uses a `100dvh` full-screen sheet with safe-area padding and a full-width history child view.
- Reflection and Mood remain independently controlled, default-OFF sensitive categories supplied only after explicit opt-in through `TaskFlowAIContextConsent`.
- Do not edit `server/ai.js`, `server/ai-provider.js`, `server/ai-roadmap-validator.js`, or unrelated AI files.
- Follow TDD for every production change: run the named focused test and observe the intended failure before implementation.
- Treat `css/styles.css` as canonical. Do not hand-edit generated `css/styles-critical.css` or `css/styles-deferred.css`.
- Do not regenerate `.min` files or bump versions until Task 8.

## Execution baseline

At execution time, use `superpowers:using-git-worktrees` to create `codex/ai-chat-history-ui-redesign-v2` from a freshly fetched `origin/main`. Restore the approved spec and this plan from `codex/ai-chatbot-ui-ux-redesign` by path, commit those two docs, and cherry-pick `2597c1a` only for the known Windows CRLF portability fix. Do not cherry-pick `0af5268`; its static shell predates history and would overwrite `1894d98` integration.

Run before Task 1:

```powershell
git status --short --branch
git log -5 --oneline --decorate
node --test tests/*.test.mjs
```

Expected: clean isolated worktree, `1894d98` reachable from `HEAD`, and the full Node suite passes. If anything other than the exact phase33 CRLF assertions fails, stop and diagnose before implementation.

## File map

- `app.html`: semantic adaptive workspace, conversation column, static history container, data panel, file region, and multiline composer.
- `js/app.js`: lazy module order, open/close integration, responsive presentation, menu dispatch, Escape ordering, and focus restoration.
- `js/chat.js`: history rendering and view state, composer behavior, safe messages, stop state, suggestions, data-use status, file UI, and public helpers.
- `js/chat-history.js`: existing persistence boundary; modify only if a tested storage contract cannot be met in `js/chat.js`.
- `js/i18n.js`: exact Vietnamese and English UI copy.
- `css/styles.css`: sole canonical chatbot/history visual source.
- `tests/phase35-chat-history-redesign.test.mjs`: new focused source, DOM-helper, and integration contracts.
- `tests/phase-chat-history-stop.test.mjs`: extend shipped persistence and cancellation regressions.
- `tests/phase9-frontend.test.mjs`: preserve legacy lazy-load, FAB, focus, and release contracts while updating intentional shell expectations.
- `scripts/e2e-frontend.py`: desktop/mobile adaptive-history flow.
- `scripts/e2e-a11y.py`: existing accessibility runner used for final verification.
- Generated only in Task 8: `css/styles-critical.css`, `css/styles-deferred.css`, their minified siblings, `js/app.min.js`, `js/chat.min.js`, `js/chat-history.min.js` if needed, `js/i18n.min.js`, `app.html` versions, and `sw.js` cache name.

---

### Task 1: Lock the current-main lazy history foundation

**Files:**
- Create: `tests/phase35-chat-history-redesign.test.mjs`
- Modify: `js/app.js:4400-4450`

**Interfaces:**
- Consumes: `ensureLazyModule(url)`, `runLazyChat(fn)`, `preloadLazyChat()`, `TaskFlowChatHistory`, and `TaskFlowChat`.
- Produces: a guaranteed lazy order where `TaskFlowChatHistory` exists before the chat module initializes.

- [ ] **Step 1: Write the failing lazy-order contract**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const APP_JS = read('js/app.js');

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
```

- [ ] **Step 2: Run RED**

```powershell
node --test tests/phase35-chat-history-redesign.test.mjs
```

Expected: FAIL because `chat-history.min.js` is precached but absent from both lazy chains.

- [ ] **Step 3: Insert the missing module in both chains**

Immediately before each existing `ensureLazyModule('js/chat.min.js')`, add:

```js
.then(() => ensureLazyModule('js/chat-history.min.js'))
```

Keep history and chat out of the eager `app.html` script chain.

- [ ] **Step 4: Run focused and shipped history tests**

```powershell
node --check js/app.js
node --test tests/phase35-chat-history-redesign.test.mjs tests/phase-chat-history-stop.test.mjs tests/phase9-frontend.test.mjs
```

Expected: PASS; existing cancellation and persistence contracts remain green.

- [ ] **Step 5: Commit**

```powershell
git add -- js/app.js tests/phase35-chat-history-redesign.test.mjs
git commit -m "fix(chat): load local history before chat runtime"
```

---

### Task 2: Build the semantic adaptive shell and bilingual copy

**Files:**
- Modify: `app.html:502-540`
- Modify: `js/app.js:4453-4466,5600-5650`
- Modify: `js/i18n.js` in both chat locale blocks
- Modify: `tests/phase35-chat-history-redesign.test.mjs`
- Modify: `tests/phase9-frontend.test.mjs`

**Interfaces:**
- Consumes: all stable IDs, existing actions `chat-toggle`, `chat-close`, `chat-history`, `chat-new`, `chat-clear`, `chat-send`, and `chat-suggest`.
- Produces: `#chatDialogTitle`, `#chatStatusText`, `#chatContextStatus`, `#chatMenu`, `#chatDataPanel`, `.chat-workspace`, `.chat-conversation`, `#chatHistoryDrawer`, `#chatHistoryTitle`, `#chatHistoryBack`, and `#chatComposer`.

- [ ] **Step 1: Add failing semantic-shell tests**

Append tests that extract the `#chatPop` markup and assert:

```js
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
```

Also require each new i18n key exactly twice: `chatStatusReady`, `chatContextIdle`, `chatMenuAria`, `chatDataSettings`, `chatDataPanelTitle`, `chatDataPanelBody`, `chatHistoryLocalLabel`, `chatHistoryBack`, `chatHistoryMessageCount`, `chatComposerAria`, `chatSendAria`, and the three suggestion labels.

- [ ] **Step 2: Run RED**

```powershell
node --test --test-name-pattern="semantic|copy" tests/phase35-chat-history-redesign.test.mjs
```

Expected: FAIL against the old one-column shell and single-line input.

- [ ] **Step 3: Replace only the chatbot inner shell**

Keep `#chatFabWrap` and `#chatFab`. Use this structure inside `#chatPop`:

```html
<div class="chat-workspace">
  <aside class="chat-history-drawer" id="chatHistoryDrawer" hidden
    aria-labelledby="chatHistoryTitle" data-testid="chat-history-drawer">
    <div class="chat-history-header">
      <button type="button" id="chatHistoryBack" data-action="chat-history-close"
        data-shell-icon="chevron-left" data-i18n-aria="chatHistoryBack"></button>
      <strong id="chatHistoryTitle" data-i18n="chatHistory">Lịch sử trò chuyện</strong>
      <button type="button" data-action="chat-new" data-i18n="chatNewConversation">Cuộc trò chuyện mới</button>
    </div>
    <p class="chat-history-local" data-i18n="chatHistoryLocalLabel">Lưu trên thiết bị này</p>
    <div id="chatHistoryList"></div>
    <div id="chatHistoryFooter"></div>
  </aside>
  <section class="chat-conversation">
    <header class="chat-header">
      <span class="chat-assistant-mark" aria-hidden="true">✦</span>
      <span class="chat-heading-copy">
        <strong id="chatDialogTitle" data-i18n="chatTitle">Trợ lý TaskFlow</strong>
        <span class="chat-status"><span class="chat-status-dot" aria-hidden="true"></span><span id="chatStatusText" data-i18n="chatStatusReady">Sẵn sàng lập kế hoạch</span></span>
      </span>
      <div class="chat-header-actions">
        <button type="button" class="chat-history-btn" data-action="chat-history"
          aria-controls="chatHistoryDrawer" aria-expanded="false" data-shell-icon="clock"
          data-i18n-aria="chatHistoryOpen"></button>
        <button type="button" class="chat-menu-btn" data-action="chat-menu-toggle"
          aria-controls="chatMenu" aria-expanded="false" data-shell-icon="more"
          data-i18n-aria="chatMenuAria"></button>
        <button type="button" class="sync-close" data-action="chat-close"
          data-shell-icon="close" data-i18n-aria="closeBtn"></button>
      </div>
    </header>
    <!-- chatMenu, chatDataPanel, chatContextStatus, chatMessages, chatActions,
         chatFileCard, chatFileChips, chatComposer, chatStoppedNote, chatFileInput -->
  </section>
</div>
```

Use the existing `chevron-left`, `clock`, `more`, `close`, and `plus` symbols from `icons/ui-sprite.svg`; do not add a hand-drawn inline SVG or emoji.

Composer markup:

```html
<div class="chat-composer" id="chatComposer">
  <button type="button" class="chat-attach-btn" id="chatAttachBtn"
    data-shell-icon="plus" data-i18n-aria="fileAttach"></button>
  <textarea class="chat-input" id="chatInput" rows="1" maxlength="4000"
    data-i18n-placeholder="chatPh" data-i18n-aria="chatComposerAria"></textarea>
  <button type="button" class="chat-send" data-action="chat-send"
    data-i18n-aria="chatSendAria" disabled><span aria-hidden="true">↑</span></button>
</div>
```

- [ ] **Step 4: Add the menu and close cleanup in `js/app.js`**

Implement `chat-menu-toggle`, `chat-data-info`, `chat-data-info-close`, and `chat-history-close` action branches. Extend `closeChatPanel()` to hide `#chatMenu`, `#chatDataPanel`, and `#chatHistoryDrawer`; remove `data-history-open`; reset both `aria-expanded` controls; and preserve the existing FAB focus restoration.

- [ ] **Step 5: Add exact Vietnamese and English copy**

Add or replace these exact values in both locale objects:

```js
// vi
chatTitle: 'Trợ lý TaskFlow',
chatStatusReady: 'Sẵn sàng lập kế hoạch',
chatContextIdle: 'Chỉ dùng dữ liệu khi câu hỏi cần đến',
chatMenuAria: 'Mở tùy chọn trợ lý',
chatDataSettings: 'Quyền truy cập dữ liệu',
chatDataPanelTitle: 'Dữ liệu AI có thể sử dụng',
chatDataPanelBody: 'TaskFlow chỉ gửi dữ liệu liên quan đến câu hỏi. Reflection và Mood mặc định tắt và chỉ được gửi khi bạn chủ động bật.',
chatHistoryLocalLabel: 'Lưu trên thiết bị này',
chatHistoryBack: 'Quay lại cuộc trò chuyện',
chatHistoryMessageCount: '{n} tin nhắn',
chatConversationOptions: 'Tùy chọn cuộc trò chuyện',
chatComposerAria: 'Nhắn cho Trợ lý TaskFlow',
chatWelcome: 'Bạn muốn hoàn thành điều gì trước cuối ngày?',
chatPh: 'Nhắn cho trợ lý…',
chatSendAria: 'Gửi tin nhắn',
chatSuggestPlanToday: 'Lập kế hoạch hôm nay',
chatSuggestPriority: 'Xem việc ưu tiên',
chatSuggestWeek: 'Tóm tắt tuần',

// en
chatTitle: 'TaskFlow Assistant',
chatStatusReady: 'Ready to plan',
chatContextIdle: 'Only uses data when your question requires it',
chatMenuAria: 'Open assistant options',
chatDataSettings: 'Data access',
chatDataPanelTitle: 'Data the AI can use',
chatDataPanelBody: 'TaskFlow only sends data relevant to your question. Reflections and Mood are off by default and are sent only when you turn them on.',
chatHistoryLocalLabel: 'Stored on this device',
chatHistoryBack: 'Back to conversation',
chatHistoryMessageCount: '{n} messages',
chatConversationOptions: 'Conversation options',
chatComposerAria: 'Message the TaskFlow Assistant',
chatWelcome: 'What do you want to finish before the end of today?',
chatPh: 'Message the assistant…',
chatSendAria: 'Send message',
chatSuggestPlanToday: 'Plan today',
chatSuggestPriority: 'View priority work',
chatSuggestWeek: 'Summarize the week',
```

- [ ] **Step 6: Update only intentional phase9 expectations and run GREEN**

```powershell
node --check js/app.js
node --check js/i18n.js
node --test tests/phase35-chat-history-redesign.test.mjs tests/phase9-frontend.test.mjs
```

Expected: PASS; lazy loading, FAB behavior, Pomodoro exclusion, and stable IDs remain covered.

- [ ] **Step 7: Commit**

```powershell
git add -- app.html js/app.js js/i18n.js tests/phase35-chat-history-redesign.test.mjs tests/phase9-frontend.test.mjs
git commit -m "feat(chat): build adaptive assistant shell"
```

---

### Task 3: Make history adaptive without changing storage limits

**Files:**
- Modify: `js/chat.js:20-90,539-790,1154-1210`
- Modify: `js/app.js:4453-4485`
- Modify: `tests/phase35-chat-history-redesign.test.mjs`
- Modify: `tests/phase-chat-history-stop.test.mjs`

**Interfaces:**
- Consumes: `TaskFlowChatHistory.load`, `listConversations`, `getConversation`, `setActiveConversation`, `deleteConversation`, `clearAll`, and existing `_activeConversationId`.
- Produces: `_captureConversationView()`, `_restoreConversationView(id)`, `_setHistoryOpen(open, options)`, `_renderHistoryDrawer()`, `closeHistory(options)`, and lazy empty-conversation persistence.

- [ ] **Step 1: Add failing history-view tests**

Require source and DOM-helper contracts for:

```js
assert.match(CHAT, /function _captureConversationView\(\)/);
assert.match(CHAT, /function _restoreConversationView\(conversationId\)/);
assert.match(CHAT, /function _setHistoryOpen\(open, options\)/);
assert.match(CHAT, /function closeHistory\(options\)/);
assert.match(CHAT, /chat-history-item-menu/);
assert.match(CHAT, /chat-history-message-count/);
assert.match(CHAT, /chatDeleteConversationConfirm/);
assert.doesNotMatch(newConversationBody, /mod\.createConversation/);
assert.doesNotMatch(accountChangeBody, /mod\.createConversation/);
```

Add a shipped-history regression proving a state with `activeConversationId: ''` and zero conversations remains valid after save/load; creation occurs only when `addMessage` receives the first user message through `_ensureConversation()`.

- [ ] **Step 2: Run RED**

```powershell
node --test --test-name-pattern="history view|empty conversation|activeConversationId" tests/phase35-chat-history-redesign.test.mjs tests/phase-chat-history-stop.test.mjs
```

Expected: FAIL because the current New action immediately persists an empty conversation and the overlay lacks view-state helpers.

- [ ] **Step 3: Add in-memory draft and scroll state**

Inside `js/chat.js`:

```js
var _conversationViews = Object.create(null);

function _conversationViewKey(conversationId) {
  return _getAccountScope() + ':' + (conversationId || '__new__');
}

function _captureConversationView() {
  var input = _el('chatInput');
  var messages = _el('chatMessages');
  _conversationViews[_conversationViewKey(_activeConversationId)] = {
    draft: input ? input.value : '',
    scrollTop: messages ? messages.scrollTop : 0
  };
}

function _restoreConversationView(conversationId) {
  var view = _conversationViews[_conversationViewKey(conversationId)] || { draft: '', scrollTop: 0 };
  var input = _el('chatInput');
  var messages = _el('chatMessages');
  if (input) input.value = view.draft;
  if (messages) messages.scrollTop = view.scrollTop;
  _resizeComposer(input);
  _syncComposerState();
}
```

This cache is session-only UI state; do not add drafts or scroll positions to persistent history.

- [ ] **Step 4: Stop persisting empty conversations**

Change `_getActiveConversation()` so it returns `null` when the active ID is empty or missing instead of creating a record. Change `newConversation()` and `_onAccountChange()` to capture the previous view, stop any active response, set `_activeConversationId = null`, call `mod.setActiveConversation(scope, '')`, render welcome/suggestions, restore the `__new__` draft, and close history. Keep `_ensureConversation()` as the single creation point reached by the first persisted user message.

- [ ] **Step 5: Rebuild the rail renderer**

Render into `#chatHistoryList` and `#chatHistoryFooter`, not by replacing the entire aside. Group with existing localized Today/Yesterday/Last 7 days/Older labels. Each item must contain:

```html
<button class="chat-history-item-btn">Conversation title</button>
<time class="chat-history-item-time">16:42</time>
<span class="chat-history-message-count">5 tin nhắn</span>
<button class="chat-history-item-menu" aria-haspopup="menu" aria-expanded="false"></button>
<div class="chat-history-item-actions" role="menu" hidden>
  <button role="menuitem">Xóa cuộc trò chuyện</button>
</div>
```

Use `textContent` for titles. Set the menu trigger text to the punctuation glyph `⋯` and its accessible name to `chatConversationOptions`. Confirm individual deletion with `chatDeleteConversationConfirm`. If the active record is deleted, use the returned state's first conversation; otherwise render welcome. Keep clear-all in `#chatHistoryFooter` with the existing irreversible confirmation.

- [ ] **Step 6: Implement adaptive open/close and focus**

`_setHistoryOpen(true)` removes `hidden`, sets `#chatPop[data-history-open="true"]`, sets the trigger `aria-expanded="true"`, renders the rail, and focuses New conversation or the active item. `closeHistory({ focusTrigger: true })` reverses those states and focuses the history trigger. Selecting a conversation keeps history open on wide desktop but closes it in `matchMedia('(max-width: 767px)')` single-view mode.

In `js/app.js`, `Escape` closes visible history first through `TaskFlowChat.closeHistory({ focusTrigger: true })`; only the next Escape closes the chatbot. `closeChatPanel()` always clears stale history attributes even if the lazy module is unavailable.

- [ ] **Step 7: Run focused history and frontend regressions**

```powershell
node --check js/chat.js
node --check js/app.js
node --test tests/phase35-chat-history-redesign.test.mjs tests/phase-chat-history-stop.test.mjs tests/phase9-frontend.test.mjs
```

Expected: PASS, including original capacity, retention, sanitization, abort, delete, and clear-all tests.

- [ ] **Step 8: Commit**

```powershell
git add -- js/chat.js js/app.js tests/phase35-chat-history-redesign.test.mjs tests/phase-chat-history-stop.test.mjs
git commit -m "feat(chat): add adaptive conversation history"
```

---

### Task 4: Add multiline composition, safe messages, and stable stop state

**Files:**
- Modify: `js/chat.js:132-290,400-560,790-1165`
- Modify: `js/app.js:4520-4540`
- Modify: `js/i18n.js` in both chat locale blocks
- Modify: `tests/phase35-chat-history-redesign.test.mjs`
- Modify: `tests/phase6c2-file-send-hotfix.test.mjs:53-65,163-168`

**Interfaces:**
- Produces: `_shouldSubmitComposer(event)`, `_resizeComposer(textarea)`, `_syncComposerState()`, `_initComposer()`, `_isNearBottom(container)`, `_appendMessage(container,text,role,metaKey)`, and `_renderSuggestions(mode)`.

- [ ] **Step 1: Add failing pure-helper and source contracts**

Test these exact behaviors:

```js
assert.equal(Chat._shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: false }), true);
assert.equal(Chat._shouldSubmitComposer({ key: 'Enter', shiftKey: true, isComposing: false }), false);
assert.equal(Chat._shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: true }), false);
assert.match(CHAT, /textarea\.style\.height = 'auto'/);
assert.match(CHAT, /Math\.min\([^,]+, 112\)/);
assert.match(CHAT, /function _appendMessage\(container, text, role, metaKey\)/);
assert.match(CHAT, /body\.textContent = text/);
assert.doesNotMatch(CHAT, /body\.innerHTML = text/);
assert.doesNotMatch(APP_JS, /activeElement\.id === 'chatInput'[\s\S]{0,180}doChatSend/);
```

- [ ] **Step 2: Run RED**

```powershell
node --test --test-name-pattern="composer|safe message|scroll" tests/phase35-chat-history-redesign.test.mjs
```

Expected: FAIL because the current input is single-line, app-level Enter handler remains, and `_appendText()` always force-scrolls.

- [ ] **Step 3: Implement composer ownership in `js/chat.js`**

```js
function _shouldSubmitComposer(event) {
  return !!event && event.key === 'Enter' && !event.shiftKey && !event.isComposing;
}

function _resizeComposer(textarea) {
  if (!textarea || !textarea.style) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight || 0, 112) + 'px';
}

function _syncComposerState() {
  var input = _el('chatInput');
  var send = document.querySelector('[data-action="chat-send"]');
  var hasPayload = !!(input && input.value.trim()) || !!_attachedFile;
  if (send) send.disabled = !_inFlight && !hasPayload;
  var composer = _el('chatComposer');
  if (composer) composer.setAttribute('aria-busy', String(_inFlight));
}
```

`_initComposer()` owns `input` and `keydown`, prevents plain Enter, calls `doChatSend()`, and lets Shift+Enter insert a newline. Remove only the legacy chat Enter branch in `js/app.js`.

- [ ] **Step 4: Preserve the stop affordance without geometry changes**

Refactor `_setSendMode(isStopping)` to update a child icon/text marker and `aria-label` without replacing the whole button node. While `_inFlight` is true, the send/stop button remains enabled and calls `stopActiveResponse()`. Stopping removes typing, restores the textarea, resets height/state, keeps the submitted user message, and never calls `_persistAssistantMessage()` for partial output.

- [ ] **Step 5: Add safe structured messages and near-bottom scrolling**

```js
function _isNearBottom(container) {
  return !container || container.scrollHeight - container.scrollTop - container.clientHeight <= 72;
}

function _appendMessage(container, text, role, metaKey) {
  var shouldStick = _isNearBottom(container);
  var wrap = document.createElement('div');
  wrap.className = 'chat-msg ' + role;
  var body = document.createElement('div');
  body.className = 'chat-msg-body';
  body.textContent = text;
  wrap.appendChild(body);
  if (metaKey) {
    var meta = document.createElement('div');
    meta.className = 'chat-msg-meta';
    meta.textContent = _t(metaKey);
    wrap.appendChild(meta);
  }
  container.appendChild(wrap);
  if (shouldStick) container.scrollTop = container.scrollHeight;
  return wrap;
}
```

Replace `_appendText()` call sites, including restored history and file responses. Keep retry `_doSend(failedMsg, { userBubble: false })` so retry never duplicates a user bubble.

- [ ] **Step 6: Render exactly three localized initial suggestions**

Use `plan-today`, `priority-work`, and `week-summary` with localized label and prompt keys. `_renderSuggestions('initial')` creates safe buttons; `_renderSuggestions('hidden')` empties the container. Show initial suggestions only for a blank/new conversation.

- [ ] **Step 7: Run focused composer, file, stop, and legacy tests**

```powershell
node --check js/chat.js
node --check js/app.js
node --test tests/phase35-chat-history-redesign.test.mjs tests/phase-chat-history-stop.test.mjs tests/phase6c1-file-attachment-hotfix.test.mjs tests/phase6c2-file-send-hotfix.test.mjs tests/phase6c-file-understanding.test.mjs tests/phase9-frontend.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add -- js/chat.js js/app.js js/i18n.js tests/phase35-chat-history-redesign.test.mjs tests/phase6c2-file-send-hotfix.test.mjs
git commit -m "feat(chat): refine composer and response states"
```

---

### Task 5: Make data-use and local-storage status truthful

**Files:**
- Modify: `app.html`
- Modify: `js/app.js`
- Modify: `js/chat.js`
- Modify: `js/i18n.js`
- Modify: `tests/phase35-chat-history-redesign.test.mjs`
- Test with: `tests/phase6a-sensitive-context-consent.test.mjs`, `tests/phase34-ai-context.test.mjs`, `tests/phase3b-ai-chat-context.test.mjs`

**Interfaces:**
- Consumes: `TaskFlowAIContextConsent.getPermissions()`, `setPermission(key, enabled)`, existing context-provider envelope, and account-local history.
- Produces: `_contextKeysFromEnvelope(envelope)`, `_setContextStatus(state, keys)`, and accurate consent switches in `#chatDataPanel`.

- [ ] **Step 1: Add failing context and consent contracts**

Require:

```js
assert.match(CHAT, /function _contextKeysFromEnvelope\(envelope\)/);
assert.match(CHAT, /function _setContextStatus\(state, keys\)/);
assert.match(APP, /data-chat-consent="reflections"[^>]*role="switch"/);
assert.match(APP, /data-chat-consent="mood"[^>]*role="switch"/);
assert.match(APP_JS, /TaskFlowAIContextConsent\.setPermission/);
assert.equal((I18N.match(/chatHistoryLocalLabel:/g) || []).length, 2);
```

- [ ] **Step 2: Run RED**

```powershell
node --test --test-name-pattern="context|consent|local storage" tests/phase35-chat-history-redesign.test.mjs
```

Expected: FAIL because the current privacy note and hidden badge do not implement the approved context strip/data panel.

- [ ] **Step 3: Add explicit sensitive-category switches**

In `#chatDataPanel`, render independent `reflections` and `mood` switches, both defaulting visually and semantically to OFF until `TaskFlowAIContextConsent.getPermissions()` says otherwise. On `chat-data-info`, synchronize `aria-checked`. On switch activation, call `TaskFlowAIContextConsent.setPermission(key, nextValue)` and update only that switch. Do not infer consent from conversation content.

- [ ] **Step 4: Derive categories from the actual request envelope**

`_contextKeysFromEnvelope(envelope)` must inspect only the trusted context envelope actually added to the request. Map present categories to localized Tasks, Projects, Schedule, Habits, Reflection, and Mood labels. Never show a category that was requested but excluded by consent or unavailable.

- [ ] **Step 5: Wire status lifecycle**

Set `preparing` at valid request start, `using` immediately before fetch when the envelope is known, `used` after a successful response, and `idle` or `error` on every offline, guest, validation, abort, exception, and retry path. History's “Stored on this device” message stays in the rail and is never merged with the data-use strip.

- [ ] **Step 6: Run context and backend-contract regressions**

```powershell
node --check js/chat.js
node --check js/app.js
node --test tests/phase35-chat-history-redesign.test.mjs tests/phase3b-ai-chat-context.test.mjs tests/phase34-ai-context.test.mjs tests/phase6a-sensitive-context-consent.test.mjs tests/phase-chat-history-stop.test.mjs
node test-server-ai-chat.js
```

Expected: PASS; request payloads and default-OFF consent remain unchanged.

- [ ] **Step 7: Commit**

```powershell
git add -- app.html js/app.js js/chat.js js/i18n.js tests/phase35-chat-history-redesign.test.mjs
git commit -m "feat(chat): clarify context and local storage"
```

---

### Task 6: Apply the Focused Coach visual system and responsive layout

**Files:**
- Modify: `css/styles.css:3030-3685` and relevant chatbot media queries
- Modify: `js/app.js`
- Modify: `tests/phase35-chat-history-redesign.test.mjs`

**Interfaces:**
- Consumes: `#chatPop[data-history-open]`, `[data-presentation]`, `.chat-workspace`, `.chat-history-drawer`, `.chat-conversation`, existing TaskFlow tokens, and approved shell classes.
- Produces: 400 px compact desktop chat, 660 px adaptive two-column history state, constrained single-view fallback, and `100dvh` mobile sheet.

- [ ] **Step 1: Add failing geometry and design contracts**

```js
assert.match(CSS, /\.chat-pop \{[\s\S]*width: min\(400px, calc\(100vw - 24px\)\)/);
assert.match(CSS, /\.chat-pop\[data-history-open="true"\][\s\S]*width: min\(660px, calc\(100vw - 24px\)\)/);
assert.match(CSS, /\.chat-workspace[\s\S]*grid-template-columns/);
assert.match(CSS, /\.chat-history-item--active[\s\S]*border-inline-start/);
assert.match(CSS, /@media \(max-width: 767px\)[\s\S]*height: 100dvh/);
assert.match(CSS, /env\(safe-area-inset-bottom\)/);
assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(APP_JS, /function syncChatPresentation\(\)/);
```

- [ ] **Step 2: Run RED**

```powershell
node --test --test-name-pattern="Focused Coach|geometry|presentation" tests/phase35-chat-history-redesign.test.mjs
```

Expected: FAIL against the current 340 px overlay drawer.

- [ ] **Step 3: Replace canonical chatbot/history rules in `css/styles.css`**

Required relationships:

```css
.chat-pop {
  width: min(400px, calc(100vw - 24px));
  max-height: min(560px, calc(100dvh - 24px));
  overflow: hidden;
  border: 1px solid var(--card-border);
  border-radius: 16px;
  background: var(--card-bg);
}
.chat-pop[data-history-open="true"] { width: min(660px, calc(100vw - 24px)); }
.chat-workspace { display: grid; grid-template-columns: 0 minmax(0, 400px); min-height: 0; }
.chat-pop[data-history-open="true"] .chat-workspace { grid-template-columns: 260px minmax(0, 400px); }
.chat-history-drawer { min-width: 0; border-inline-end: 1px solid var(--card-border); }
.chat-history-item--active { border-inline-start: 3px solid var(--color-accent); background: var(--color-accent-soft); }
.chat-msg-body { white-space: pre-wrap; overflow-wrap: anywhere; }
.chat-input { min-height: 28px; max-height: 112px; resize: none; overflow-y: auto; }
```

Use the 8/12/16 px rhythm, existing radii, visible focus, 44 px mobile targets, semantic status text, and no gradient/glass/purple AI styling. Retheme existing proposal, clarification, file, retry, guest, typing, and stopped states; do not remove their behavior.

- [ ] **Step 4: Add constrained and mobile single-view presentations**

Below the width needed for a safe 660 px popover, history occupies the workspace and the conversation column is hidden while history is open. At `max-width: 767px`, use fixed `inset: 0`, `width: 100%`, `height: 100dvh`, no border/radius, safe-area padding, sticky history header, and a message log as the only flexible scrolling region.

- [ ] **Step 5: Synchronize presentation semantics in `js/app.js`**

`syncChatPresentation()` sets `data-presentation="sheet"` and `aria-modal="true"` below 768 px, `data-presentation="compact"` otherwise, and updates the dialog label to `chatHistoryTitle` only while mobile history is visible. Outside click closes compact desktop chat but not the full-screen sheet. Preserve Pomodoro mutual exclusion and FAB focus restoration.

- [ ] **Step 6: Generate temporary split CSS for focused verification**

```powershell
python scripts/split-critical-css.py
node --test tests/phase35-chat-history-redesign.test.mjs tests/phase9-frontend.test.mjs
python scripts/audit-dark-contrast.py
python scripts/verify-critical-css.py
```

Expected: PASS. Generated readable split files may be present in the working tree but must not be hand-edited.

- [ ] **Step 7: Commit canonical source and generated readable split files**

```powershell
git add -- css/styles.css css/styles-critical.css css/styles-deferred.css js/app.js tests/phase35-chat-history-redesign.test.mjs tests/phase9-frontend.test.mjs
git commit -m "feat(chat): apply adaptive Focused Coach layout"
```

---

### Task 7: Add browser interaction and accessibility coverage

**Files:**
- Modify: `scripts/e2e-frontend.py:1810-1850`
- Modify: `tests/phase35-chat-history-redesign.test.mjs`

**Interfaces:**
- Produces: `chat_history_redesign_checks(page, viewport_name)` covering desktop and mobile without requiring a live AI response.

- [ ] **Step 1: Add a failing E2E source contract**

Require the new function and selectors `#chatHistoryDrawer`, `#chatHistoryBack`, `#chatHistoryList`, `#chatContextStatus`, `#chatComposer`, `#chatInput`, `[data-action="chat-history"]`, `[data-action="chat-new"]`, and `[data-action="chat-send"]`. Require explicit checks for `Shift+Enter`, `aria-expanded`, `aria-modal`, and `data-history-open`.

- [ ] **Step 2: Run RED**

```powershell
node --test --test-name-pattern="frontend E2E" tests/phase35-chat-history-redesign.test.mjs
```

Expected: FAIL because the browser scenario is absent.

- [ ] **Step 3: Implement deterministic desktop coverage**

The scenario opens chat, verifies input focus, types two lines with Shift+Enter, verifies auto-growth and enabled send, opens history, asserts the compact width is in `[388, 412]` px and the expanded width is in `[648, 672]` px, verifies the conversation stays visible, selects a seeded local conversation, opens/closes the per-item menu, and collapses history with focus returned to its trigger. Seed only bounded text records through the public history module and clear them after the scenario.

- [ ] **Step 4: Implement deterministic mobile coverage**

At the configured mobile viewport, assert `100dvh`, `aria-modal="true"`, safe composer placement, history replacing the conversation body, visible Back control, minimum 44 px targets, Escape closing history before chat, and final focus restoration. Verify long titles, long safe messages, and the English message-count template do not cause horizontal overflow.

- [ ] **Step 5: Cover stop, dark, and reduced-motion states without live AI**

Use the existing page runtime to create a controlled pending request or invoke the exposed lifecycle helper, assert the send control becomes Stop without changing composer bounds, stop it, and verify the activity indicator disappears. Toggle the existing theme control and emulate reduced motion; ensure status text and active-history marker remain understandable without animation.

- [ ] **Step 6: Run browser and accessibility suites**

```powershell
python scripts/e2e-frontend.py --all
python scripts/e2e-a11y.py
```

Expected: all configured viewports pass with no critical or serious accessibility violations.

- [ ] **Step 7: Commit**

```powershell
git add -- scripts/e2e-frontend.py tests/phase35-chat-history-redesign.test.mjs
git commit -m "test(chat): cover adaptive history experience"
```

---

### Task 8: Regenerate release assets and verify the complete release candidate

**Files:**
- Generated: `css/styles-critical.css`, `css/styles-deferred.css`, `css/styles-critical.min.css`, `css/styles-deferred.min.css`
- Generated: `js/app.min.js`, `js/chat.min.js`, `js/i18n.min.js`
- Generated if source changed: `js/chat-history.min.js`
- Modify: `app.html` asset query versions
- Modify: `sw.js` cache name
- Modify: exact release-version assertions that pin changed values

**Interfaces:**
- Produces: deployable source/minified parity and fresh regression/browser evidence.

- [ ] **Step 1: Audit scope before generation**

```powershell
git status --short
git diff --name-only origin/main...HEAD
git diff --check
```

Expected: only approved docs and files named by this plan; no server, environment, database, or transient preview files.

- [ ] **Step 2: Regenerate from canonical sources**

```powershell
python scripts/split-critical-css.py
python scripts/minify.py
```

Expected: generated CSS splits/minified siblings match readable sources. Do not accept unrelated generated churn without tracing its source.

- [ ] **Step 3: Bump cache versions once**

Increment only the query versions for changed loaded assets in `app.html`. Increment the current `taskflow-vNNN` service-worker cache once. Update exact version assertions found with:

```powershell
rg -n "app\.min\.js\?v=|i18n\.min\.js\?v=|styles-critical\.min\.css\?v=|styles-deferred\.min\.css\?v=|taskflow-v270" tests app.html sw.js
```

- [ ] **Step 4: Run syntax and focused regressions**

```powershell
node --check js/app.js
node --check js/chat.js
node --check js/chat-history.js
node --check js/i18n.js
node --test tests/phase35-chat-history-redesign.test.mjs tests/phase-chat-history-stop.test.mjs tests/phase9-frontend.test.mjs
node --test tests/phase3b-ai-chat-context.test.mjs tests/phase34-ai-context.test.mjs tests/phase6a-sensitive-context-consent.test.mjs
node --test tests/phase6c1-file-attachment-hotfix.test.mjs tests/phase6c2-file-send-hotfix.test.mjs tests/phase6c-file-understanding.test.mjs
node test-server-ai-chat.js
```

Expected: all PASS.

- [ ] **Step 5: Run full source/generated verification**

```powershell
node --test tests/*.test.mjs
python scripts/minify.py --check
python scripts/verify-critical-css.py
python scripts/check-release-assets.py
```

Expected: every command exits 0.

- [ ] **Step 6: Run full browser/offline verification**

```powershell
python scripts/e2e-frontend.py --all
python scripts/e2e-a11y.py
python scripts/e2e-offline.py
python scripts/e2e-smoke.py
```

Expected: every command exits 0. Manually inspect Vietnamese/English, light/dark, compact desktop, expanded desktop history, constrained desktop fallback, and mobile history child view.

- [ ] **Step 7: Perform final safety review**

Confirm from fresh evidence:

- Account isolation, 30/60/1-MB/90-day bounds, and no raw file bytes remain intact.
- Stopped or stale responses never persist an assistant message.
- New conversations are not persisted until their first user message.
- Reflection and Mood remain default OFF and independently reversible.
- No raw model or history title reaches `innerHTML`.
- No server API contract changed.
- `.superpowers/brainstorm`, `.env`, databases, screenshots, and unrelated files are not staged.

- [ ] **Step 8: Commit release assets**

```powershell
git add -- app.html sw.js css/styles-critical.css css/styles-deferred.css css/styles-critical.min.css css/styles-deferred.min.css js/app.min.js js/chat.min.js js/i18n.min.js tests
git diff --quiet -- js/chat-history.js
if ($LASTEXITCODE -ne 0) { git add -- js/chat-history.min.js }
git commit -m "build(chat): refresh adaptive history assets"
```

Before running the conditional PowerShell line, inspect `git status --short`; if `js/chat-history.js` was unchanged, its minified sibling must also remain unchanged.

- [ ] **Step 9: Record final evidence**

Report exact commit hashes, full Node pass/fail counts, browser viewport coverage, accessibility/offline/smoke results, and any intentionally skipped command. Do not claim deployment, publication, merge, or production verification unless separately requested and verified.
