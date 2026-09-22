# TaskFlow AI Chatbot UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign TaskFlow’s existing AI chatbot as a compact Focused Coach popover on desktop and a keyboard-safe full-screen sheet on mobile, improving readability, speed, and truthful data-use feedback without changing backend contracts.

**Architecture:** Keep the existing framework-free, lazy-loaded `TaskFlowChat` IIFE and current `/api/ai/chat`, file, intent, and confirm-before-write flows. Revise the static shell in `app.html`, add small DOM/render helpers inside `js/chat.js`, keep open/close integration in `js/app.js`, and use existing TaskFlow CSS/i18n/build pipelines. Add one focused Node test file for the redesign plus browser coverage in the existing frontend E2E suite.

**Tech Stack:** HTML5, CSS custom properties, vanilla JavaScript IIFEs, Node.js `node:test`, Python Playwright E2E, existing `scripts/minify.py` and `scripts/check-release-assets.py` pipelines.

## Global Constraints

- Preserve the current AI backend endpoints, payloads, consent rules, bounded history, file limits, and confirm-before-write behavior.
- Keep `js/chat.js` lazy-loaded; do not add chat or context modules to the `app.html` boot script chain.
- Render model and file content with `textContent`; never inject untrusted HTML.
- Preserve all existing chatbot IDs and `data-action` hooks. Any unavoidable hook change must update dispatchers and tests in the same task.
- Use TaskFlow’s existing Nunito font, theme tokens, terracotta brand accent, semantic green, radius system, and light/dark modes; add no UI dependency.
- Desktop target is approximately 380 px by 520 px within viewport constraints; mobile uses a full-screen `100dvh` sheet with safe-area padding.
- Reflection and Mood remain sensitive, independently controlled categories: both default to OFF and are sent only after explicit user opt-in through the existing `TaskFlowAIContextConsent` store.
- Preserve unrelated work. In particular, do not edit or stage `js/ai-roadmap.js`, `server/ai-roadmap-validator.js`, or `server/ai.js` for this redesign.
- Before implementation, inspect `git status --short`. If the current checkout contains unrelated changes or remains on an unrelated feature branch, create an isolated `codex/ai-chatbot-ui-ux-redesign` worktree from the approved-spec commit.
- Follow TDD: make each named test fail for the intended reason before implementing its production change.
- Regenerate minified assets only after readable sources pass their focused tests, then bump affected `?v=` asset versions and the service-worker cache version once in the release task.

## File map

- `app.html`: semantic chatbot shell, header/menu, context strip, suggestions, file region, textarea composer, and stable test hooks.
- `css/styles-critical.css`: all boot-critical chatbot shell, message, action, attachment, proposal-card, responsive, dark-mode, focus, and reduced-motion styles.
- `css/styles-critical.min.css`: generated release sibling of `styles-critical.css`.
- `js/chat.js`: lazy chatbot state, rendering, composer events, data-use status, message scrolling, retry, file UI, and public test helpers.
- `js/chat.min.js`: generated release sibling of `chat.js`.
- `js/app.js`: chatbot open/close integration, responsive dialog semantics, focus restoration, and removal of the old global Enter-to-send handler.
- `js/app.min.js`: generated release sibling if `app.js` changes.
- `js/i18n.js`: Vietnamese and English strings for the redesigned shell and states.
- `js/i18n.min.js`: generated release sibling of `i18n.js`.
- `tests/phase35-chat-redesign.test.mjs`: focused source/markup contracts and pure-helper behavior for the redesign.
- `tests/phase9-frontend.test.mjs`: update legacy chatbot expectations that intentionally change while preserving lazy-load, FAB, and collision guards.
- `scripts/e2e-frontend.py`: desktop/mobile interaction and visual-state smoke coverage.
- `app.html`, `sw.js`: release cache-busting versions only in the final release-assets task.

---

### Task 1: Build the semantic chatbot shell and bilingual copy

**Files:**
- Create: `tests/phase35-chat-redesign.test.mjs`
- Modify: `app.html:473-512`
- Modify: `js/app.js:4324-4350`
- Modify: `js/app.js:5458-5510`
- Modify: `js/i18n.js:560-610`
- Modify: `js/i18n.js:2036-2086`
- Modify: `tests/phase9-frontend.test.mjs:1090-1155`

**Interfaces:**
- Consumes: existing IDs `chatFab`, `chatPop`, `chatMessages`, `chatActions`, `chatFileCard`, `chatFileChips`, `chatAttachBtn`, `chatInput`, and `chatFileInput`; existing actions `chat-toggle`, `chat-close`, `chat-clear`, `chat-send`, and `chat-suggest`.
- Produces: `#chatDialogTitle`, `#chatStatusText`, `#chatContextStatus`, `#chatMenu`, `#chatDataPanel`, `#chatComposer`, a textarea `#chatInput`, and working menu/data-info actions used by Tasks 2-6.

- [ ] **Step 1: Write the failing shell-contract tests**

Create `tests/phase35-chat-redesign.test.mjs` with the shared file loader and the first tests:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');
const APP = read('app.html');
const CHAT = read('js/chat.js');
const APP_JS = read('js/app.js');
const I18N = read('js/i18n.js');
const CSS = read('css/styles-critical.css');

test('chat redesign exposes one semantic shell with stable hooks', () => {
  const panel = (APP.match(/<div class="chat-pop"[\s\S]*?<input type="file"[\s\S]*?<\/div>\s*<\/div>/) || [''])[0];
  assert.match(panel, /id="chatPop"/);
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /aria-labelledby="chatDialogTitle"/);
  assert.match(panel, /id="chatDialogTitle"/);
  assert.match(panel, /id="chatStatusText"/);
  assert.match(panel, /id="chatContextStatus"[^>]*aria-live="polite"/);
  assert.match(panel, /id="chatMenu"[^>]*hidden/);
  assert.match(panel, /id="chatDataPanel"[^>]*hidden/);
  assert.match(panel, /id="chatComposer"/);
  assert.match(panel, /<textarea[^>]*id="chatInput"[^>]*rows="1"/);
  ['chatMessages', 'chatActions', 'chatFileCard', 'chatFileChips', 'chatAttachBtn', 'chatFileInput']
    .forEach((id) => assert.match(panel, new RegExp(`id="${id}"`)));
});

test('chat redesign copy exists in Vietnamese and English', () => {
  [
    'chatStatusReady', 'chatContextIdle', 'chatContextPreparing',
    'chatMenuAria', 'chatDataSettings', 'chatDataPanelTitle', 'chatDataPanelBody', 'chatComposerAria',
    'chatWelcome', 'chatPh', 'chatSendAria', 'chatNoDataChanged',
  ].forEach((key) => {
    assert.equal((I18N.match(new RegExp(`${key}:`, 'g')) || []).length, 2, `${key} must exist in vi and en`);
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
node --test tests/phase35-chat-redesign.test.mjs
```

Expected: FAIL because `chatDialogTitle`, `chatContextStatus`, the menu, and the textarea do not exist yet.

- [ ] **Step 3: Replace the current chatbot markup with the approved hierarchy**

Keep the outer `#chatFabWrap` and `#chatFab`, then use this structure inside `#chatPop`:

```html
<div class="chat-pop" id="chatPop" hidden data-testid="chat-pop"
  role="dialog" aria-labelledby="chatDialogTitle" aria-describedby="chatContextStatus">
  <div class="chat-header">
    <span class="chat-assistant-mark" aria-hidden="true">✦</span>
    <span class="chat-heading-copy">
      <strong id="chatDialogTitle" data-i18n="chatTitle">Trợ lý TaskFlow</strong>
      <span class="chat-status"><span class="chat-status-dot" aria-hidden="true"></span><span id="chatStatusText" data-i18n="chatStatusReady">Sẵn sàng lập kế hoạch</span></span>
    </span>
    <div class="chat-header-actions">
      <button type="button" class="chat-menu-btn" data-action="chat-menu-toggle"
        data-i18n-aria="chatMenuAria" aria-controls="chatMenu" aria-expanded="false"
        data-shell-icon="more"></button>
      <button type="button" class="sync-close" data-action="chat-close"
        data-i18n-aria="closeBtn" data-shell-icon="close"></button>
    </div>
  </div>
  <div class="chat-menu" id="chatMenu" hidden>
    <button type="button" data-action="chat-data-info" data-i18n="chatDataSettings">Quyền truy cập dữ liệu</button>
    <button type="button" data-action="chat-clear" data-i18n="chatClear">Xóa cuộc trò chuyện</button>
  </div>
  <section class="chat-data-panel" id="chatDataPanel" hidden aria-labelledby="chatDataPanelTitle">
    <h3 id="chatDataPanelTitle" data-i18n="chatDataPanelTitle">Dữ liệu AI có thể sử dụng</h3>
    <p data-i18n="chatDataPanelBody">TaskFlow chỉ gửi dữ liệu liên quan đến câu hỏi. Reflection và Mood mặc định tắt và chỉ được gửi khi bạn chủ động bật.</p>
    <button type="button" data-action="chat-data-info-close" data-i18n="closeBtn">Đóng</button>
  </section>
  <div class="chat-context-status" id="chatContextStatus" aria-live="polite">
    <span class="chat-context-icon" aria-hidden="true">◉</span>
    <span id="chatContextBadge" data-chat-context-copy data-i18n="chatContextIdle">Chỉ dùng dữ liệu khi câu hỏi cần đến</span>
  </div>
  <div class="chat-messages" id="chatMessages" role="log" aria-live="polite" aria-relevant="additions text">
    <div class="chat-msg bot"><span data-i18n="chatWelcome">Bạn muốn hoàn thành điều gì trước cuối ngày?</span></div>
  </div>
  <div class="chat-actions" id="chatActions"></div>
  <div id="chatFileCard"></div>
  <div id="chatFileChips" class="chat-chips" hidden></div>
  <div class="chat-composer" id="chatComposer">
    <button type="button" class="chat-attach-btn" id="chatAttachBtn" data-i18n-aria="fileAttach" data-shell-icon="plus"></button>
    <textarea class="chat-input" id="chatInput" rows="1" data-i18n-placeholder="chatPh"
      data-i18n-aria="chatComposerAria" maxlength="4000"></textarea>
    <button type="button" class="chat-send" data-action="chat-send" data-i18n-aria="chatSendAria" disabled>
      <span aria-hidden="true">↑</span>
    </button>
  </div>
  <input type="file" id="chatFileInput"
    accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/markdown,.md" hidden />
</div>
```

Populate `#chatActions` with exactly three buttons using the existing `chat-suggest` action and topics `plan-today`, `priority-work`, and `week-summary`.

In the `js/app.js` action dispatcher, add `chat-menu-toggle`, `chat-data-info`, and `chat-data-info-close`. The menu toggle updates `#chatMenu.hidden` and the menu button’s `aria-expanded`. The data-info action hides the menu, resets the menu button to `aria-expanded="false"`, and reveals `#chatDataPanel`. The close action hides the panel and focuses the menu button. Extend `closeChatPanel()` so both secondary surfaces are hidden whenever the chatbot closes.

- [ ] **Step 4: Add exact bilingual strings**

Add the following keys to both locale objects in `js/i18n.js`:

```js
// vi
chatTitle: 'Trợ lý TaskFlow',
chatStatusReady: 'Sẵn sàng lập kế hoạch',
chatContextIdle: 'Chỉ dùng dữ liệu khi câu hỏi cần đến',
chatContextPreparing: 'Đang phân tích câu hỏi của bạn',
chatMenuAria: 'Mở tùy chọn trợ lý',
chatDataSettings: 'Quyền truy cập dữ liệu',
chatDataPanelTitle: 'Dữ liệu AI có thể sử dụng',
chatDataPanelBody: 'TaskFlow chỉ gửi dữ liệu liên quan đến câu hỏi. Reflection và Mood mặc định tắt và chỉ được gửi khi bạn chủ động bật.',
chatClear: 'Xóa cuộc trò chuyện',
chatComposerAria: 'Nhắn cho Trợ lý TaskFlow',
chatWelcome: 'Bạn muốn hoàn thành điều gì trước cuối ngày?',
chatPh: 'Nhắn cho trợ lý…',
chatSendAria: 'Gửi tin nhắn',
chatNoDataChanged: 'Dữ liệu TaskFlow của bạn chưa bị thay đổi',
chatSuggestPlanToday: 'Lập kế hoạch hôm nay',
chatSuggestPriority: 'Xem việc ưu tiên',
chatSuggestWeek: 'Tóm tắt tuần',

// en
chatTitle: 'TaskFlow Assistant',
chatStatusReady: 'Ready to plan',
chatContextIdle: 'Only uses data when your question requires it',
chatContextPreparing: 'Analyzing your question',
chatMenuAria: 'Open assistant options',
chatDataSettings: 'Data access',
chatDataPanelTitle: 'Data the AI can use',
chatDataPanelBody: 'TaskFlow only sends data relevant to your question. Reflections and Mood are off by default and are sent only when you turn them on.',
chatClear: 'Clear conversation',
chatComposerAria: 'Message the TaskFlow Assistant',
chatWelcome: 'What do you want to finish before the end of today?',
chatPh: 'Message the assistant…',
chatSendAria: 'Send message',
chatNoDataChanged: 'Your TaskFlow data has not been changed',
chatSuggestPlanToday: 'Plan today',
chatSuggestPriority: 'View priority work',
chatSuggestWeek: 'Summarize the week',
```

- [ ] **Step 5: Update the legacy P11 assertions intentionally changed by the redesign**

In `tests/phase9-frontend.test.mjs`, preserve assertions for the lazy chain, stable IDs, FAB, mutual exclusion, and focus restoration. Replace only the old `input` assertion with checks for the textarea and semantic dialog hooks. In `tests/phase35-chat-redesign.test.mjs`, assert `js/app.js` contains all three new action branches and that `closeChatPanel()` hides both `#chatMenu` and `#chatDataPanel`. Desktop/mobile geometry assertions are added in Task 5 when those styles exist.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
node --test tests/phase35-chat-redesign.test.mjs tests/phase9-frontend.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the semantic shell**

```powershell
git add -- app.html js/app.js js/i18n.js tests/phase35-chat-redesign.test.mjs tests/phase9-frontend.test.mjs
git commit -m "feat(chat): refine assistant shell and copy"
```

---

### Task 2: Add multiline composer behavior and duplicate-send protection

**Files:**
- Modify: `tests/phase35-chat-redesign.test.mjs`
- Modify: `js/chat.js:17-150`
- Modify: `js/chat.js:378-430`
- Modify: `js/chat.js:732-763`
- Modify: `js/app.js:4398-4407`

**Interfaces:**
- Consumes: textarea `#chatInput`, `#chatComposer`, `[data-action="chat-send"]`, `_attachedFile`, `_inFlight`, and public `doChatSend()`.
- Produces: `_shouldSubmitComposer(event): boolean`, `_resizeComposer(textarea): void`, `_syncComposerState(): void`, and `_initComposer(): void`; exports the first two for Node tests.

- [ ] **Step 1: Add failing pure-helper and wiring tests**

Append to `tests/phase35-chat-redesign.test.mjs`:

```js
test('chat composer owns Enter, Shift+Enter, autoresize, and send state', () => {
  assert.match(CHAT, /function _shouldSubmitComposer\(event\)/);
  assert.match(CHAT, /event\.key === 'Enter' && !event\.shiftKey/);
  assert.match(CHAT, /function _resizeComposer\(textarea\)/);
  assert.match(CHAT, /textarea\.style\.height = 'auto'/);
  assert.match(CHAT, /function _syncComposerState\(\)/);
  assert.match(CHAT, /function _initComposer\(\)/);
  assert.doesNotMatch(APP_JS, /activeElement\.id === 'chatInput'[\s\S]{0,160}doChatSend/);
});
```

Create a fresh CommonJS load inside the test so the pure helper can be called:

```js
test('composer submit helper sends Enter but preserves Shift+Enter', async () => {
  const Chat = loadChatModule();
  assert.equal(Chat._shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: false }), true);
  assert.equal(Chat._shouldSubmitComposer({ key: 'Enter', shiftKey: true, isComposing: false }), false);
  assert.equal(Chat._shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: true }), false);
});
```

Add this reusable loader above the tests, together with `import { createRequire } from 'node:module'`:

```js
const require = createRequire(import.meta.url);

function loadChatModule() {
  const previousDocument = global.document;
  const modulePath = path.join(ROOT, 'js/chat.js');
  global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  try {
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
  } finally {
    global.document = previousDocument;
  }
}
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node --test --test-name-pattern="composer" tests/phase35-chat-redesign.test.mjs
```

Expected: FAIL because the composer helpers are absent and the old global keydown handler remains.

- [ ] **Step 3: Implement the composer helpers in `js/chat.js`**

Add:

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
  if (!send) return;
  var hasText = !!(input && input.value && input.value.trim());
  send.disabled = _inFlight || (!hasText && !_attachedFile);
  var composer = _el('chatComposer');
  if (composer) composer.setAttribute('aria-busy', String(_inFlight));
}

function _initComposer() {
  var input = _el('chatInput');
  if (!input || input.dataset.chatComposerReady === 'true') return;
  input.addEventListener('input', function () {
    _resizeComposer(input);
    _syncComposerState();
  });
  input.addEventListener('keydown', function (event) {
    if (!_shouldSubmitComposer(event)) return;
    event.preventDefault();
    doChatSend();
  });
  input.dataset.chatComposerReady = 'true';
  _syncComposerState();
}
```

Call `_initComposer()` at module initialization beside `_initFileAttachment()`. Export `_shouldSubmitComposer` and `_resizeComposer` for tests.

- [ ] **Step 4: Preserve drafts while blocking duplicate sends**

Replace `_setInputEnabled(enabled)` with `_setComposerBusy(busy)`. It must not disable or clear the textarea; it only updates `aria-busy` and calls `_syncComposerState()`. Keep the existing `_inFlight = true/false` assignments as the authoritative guards in `_doSend()` and `_sendWithFile()`, and call `_setComposerBusy(_inFlight)` immediately after each assignment.

After `doChatSend()` clears a submitted value, call `_resizeComposer(input)` and `_syncComposerState()`. Do the same after file selection/removal and after each request settles.

- [ ] **Step 5: Remove the old app-level chat Enter handler**

Delete only this branch from the global `keydown` listener in `js/app.js`:

```js
if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'chatInput') {
  e.preventDefault();
  runLazyChat(() => window.TaskFlowChat.doChatSend());
}
```

The lazy-loaded module now owns composer keyboard behavior after the panel preloads. Keep the quick-add Enter branch unchanged.

- [ ] **Step 6: Run focused behavior and legacy tests**

```powershell
node --check js/chat.js
node --check js/app.js
node --test --test-name-pattern="composer|chat helpers|chat FAB behavior" tests/phase35-chat-redesign.test.mjs tests/phase9-frontend.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit composer behavior**

```powershell
git add -- js/chat.js js/app.js tests/phase35-chat-redesign.test.mjs tests/phase9-frontend.test.mjs
git commit -m "feat(chat): add multiline composer behavior"
```

---

### Task 3: Make data-use and processing status truthful

**Files:**
- Modify: `app.html:480-525`
- Modify: `js/app.js:5490-5535`
- Modify: `tests/phase35-chat-redesign.test.mjs`
- Modify: `js/chat.js:55-230`
- Modify: `js/chat.js:280-375`
- Modify: `js/i18n.js` in both chat locale blocks

**Interfaces:**
- Consumes: `ctxRes.scope`, `ctxRes.envelope.data`, current `_callChatAPI()`, existing TaskFlow context scopes `today`, `week`, `project`, `schedule`, `overview`, and `window.TaskFlowAIContextConsent`.
- Produces: `_contextCategoryKeys(scope, data): string[]`, `_setContextStatus(state, detailKeys): void`, `_lastContextKeys: string[]`, `_syncConsentControls(): void`, `toggleSensitiveConsent(key): void`, and `_showTyping(container, statusKey): HTMLElement`; exports `_contextCategoryKeys` for tests while preserving `_callChatAPI(): Promise<string>`.

- [ ] **Step 1: Write failing category and state tests**

Append:

```js
test('context category helper derives labels from the actual allowlisted envelope', () => {
  assert.match(CHAT, /function _contextCategoryKeys\(scope, data\)/);
  assert.match(CHAT, /Object\.prototype\.hasOwnProperty\.call/);
  assert.match(CHAT, /chatContextUsing/);
  assert.match(CHAT, /chatContextUsed/);
  assert.doesNotMatch(CHAT, /_setContextBadge\(ctxScope\)/);
  assert.match(CHAT, /function _syncConsentControls\(\)/);
  assert.match(CHAT, /function toggleSensitiveConsent\(key\)/);
});

test('processing state is specific and cleaned up on every exit path', () => {
  assert.match(CHAT, /_setContextStatus\('preparing'/);
  assert.match(CHAT, /_setContextStatus\('using'/);
  assert.match(CHAT, /_setContextStatus\('used'/);
  assert.match(CHAT, /_setContextStatus\('idle'/);
});
```

Add a CommonJS assertion for the exported helper inside the same test:

```js
const Chat = loadChatModule();
assert.deepEqual(Chat._contextCategoryKeys('today', { tasks: [], timeblocks: [], busy: [] }), ['tasks', 'schedule']);
assert.deepEqual(Chat._contextCategoryKeys('project', { projects: [], milestones: [] }), ['projects']);
assert.deepEqual(Chat._contextCategoryKeys('week', { days: [] }), ['tasks']);
assert.deepEqual(Chat._contextCategoryKeys('overview', {
  tasks: [], projects: [], milestones: [], timeblocks: [], habits: [], busy: [],
}), ['tasks', 'projects', 'schedule', 'habits']);
assert.deepEqual(Chat._contextCategoryKeys('overview', {
  tasks: [], reflections: [], mood: [],
}), ['tasks', 'reflections', 'mood']);
```

- [ ] **Step 2: Run RED**

```powershell
node --test --test-name-pattern="context category|processing state" tests/phase35-chat-redesign.test.mjs
```

Expected: FAIL because `_setContextBadge` is still the only context UI.

- [ ] **Step 3: Implement actual-category derivation**

Use allowlisted keys only:

```js
function _contextCategoryKeys(scope, data) {
  var has = function (key) {
    return !!data && Object.prototype.hasOwnProperty.call(data, key);
  };
  var keys = [];
  if (scope === 'week' || has('tasks') || has('days')) keys.push('tasks');
  if (has('projects') || has('milestones')) keys.push('projects');
  if (has('timeblocks') || has('busy')) keys.push('schedule');
  if (has('habits')) keys.push('habits');
  if (has('reflections')) keys.push('reflections');
  if (has('mood')) keys.push('mood');
  return keys;
}
```

Reflection and Mood labels appear only when those exact allowlisted properties exist in the prepared envelope after consent enforcement. Do not infer them from user text and do not inspect arbitrary nested values.

- [ ] **Step 4: Replace the badge with a context-strip state renderer**

Implement `_setContextStatus(state, detailKeys)` using only `textContent` and localized category labels:

```js
function _setContextStatus(state, detailKeys) {
  var strip = _el('chatContextStatus');
  var copy = strip && strip.querySelector('[data-chat-context-copy]');
  if (!strip || !copy) return;
  var keys = Array.isArray(detailKeys) ? detailKeys : [];
  var labels = keys.map(function (key) { return _t('chatData' + key.charAt(0).toUpperCase() + key.slice(1)); });
  strip.dataset.state = state || 'idle';
  copy.textContent = state === 'preparing' ? _t('chatContextPreparing')
    : state === 'using' ? _t('chatContextUsing', { categories: labels.join(' · ') })
      : state === 'used' ? _t('chatContextUsed', { categories: labels.join(' · ') })
        : state === 'error' ? _t('chatNoDataChanged')
          : _t('chatContextIdle');
}
```

Extend `_t` to accept interpolation data and forward it unchanged: `function _t(key, vars) { ... window.TaskFlowI18N.t(key, vars) ... }`. Add Vietnamese/English strings for `chatContextUsing`, `chatContextUsed`, `chatDataTasks`, `chatDataProjects`, `chatDataSchedule`, `chatDataHabits`, `chatDataReflections`, and `chatDataMood`.

- [ ] **Step 5: Expose the existing sensitive-consent controls in the data panel**

Add two switch rows inside `#chatDataPanel`:

```html
<button type="button" class="chat-consent-toggle" data-action="chat-consent-toggle"
  data-consent-key="reflections" role="switch" aria-checked="false">
  <span data-i18n="chatConsentReflections">Reflection</span>
</button>
<button type="button" class="chat-consent-toggle" data-action="chat-consent-toggle"
  data-consent-key="mood" role="switch" aria-checked="false">
  <span data-i18n="chatConsentMood">Mood</span>
</button>
```

Implement `_syncConsentControls()` from `TaskFlowAIContextConsent.getPermissions()` and `toggleSensitiveConsent(key)` from `TaskFlowAIContextConsent.toggle(key)`. Reject every key except `reflections` and `mood`, update both `aria-checked` values after each toggle, and never mutate permissions from message text. Export `toggleSensitiveConsent` publicly.

Add an app dispatcher branch:

```js
else if (act === 'chat-consent-toggle') {
  runLazyChat(() => window.TaskFlowChat.toggleSensitiveConsent(el.dataset.consentKey));
  return;
}
```

Call `_syncConsentControls()` when the lazy chat module initializes and whenever `#chatDataPanel` opens. Add bilingual labels and a short note stating that sensitive access is local, explicit, and independently reversible.

- [ ] **Step 6: Wire status transitions into the existing send flow**

At request start, call `_setContextStatus('preparing')`. After the provider returns a valid envelope, compute category keys from `taskflowContext.data`, store them in module state `_lastContextKeys`, and call `_setContextStatus('using', _lastContextKeys)` before `fetch`. Keep `_callChatAPI()` returning the bare answer string so `tests/phase3d-chat-backend-url.test.mjs` and existing callers retain their contract. After `_callChatAPI()` resolves, render the answer and call `_setContextStatus('used', _lastContextKeys)`.

For agent flows that do not use `_callChatAPI()`, keep `preparing` while classifying/handling, then return to `idle` after a handled read-only response or let existing proposal UI communicate the pending write. On every offline, guest, validation, exception, and unhandled branch, set `idle` or `error` explicitly so stale categories never remain.

- [ ] **Step 7: Run chat/context regressions**

```powershell
node --check js/chat.js
node --test tests/phase35-chat-redesign.test.mjs tests/phase3b-ai-chat-context.test.mjs tests/phase34-ai-context.test.mjs tests/phase6a-sensitive-context-consent.test.mjs
node test-server-ai-chat.js
```

Expected: all PASS; request payloads remain unchanged.

- [ ] **Step 8: Commit status transparency**

```powershell
git add -- app.html js/app.js js/chat.js js/i18n.js tests/phase35-chat-redesign.test.mjs
git commit -m "feat(chat): show truthful context status"
```

---

### Task 4: Improve message rendering, suggestions, retry, and scroll behavior

**Files:**
- Modify: `tests/phase35-chat-redesign.test.mjs`
- Modify: `js/chat.js:35-150`
- Modify: `js/chat.js:280-430`
- Modify: `js/i18n.js` in both chat locale blocks

**Interfaces:**
- Consumes: `#chatMessages`, `#chatActions`, `SUGGESTIONS`, `_doSend(text, opts)`, `_showRetry()`, and `doChatClear()`.
- Produces: `_isNearBottom(container): boolean`, `_appendMessage(container, text, role, metaKey): HTMLElement`, `_renderSuggestions(mode): void`, and `_renderWelcome(): void`.

- [ ] **Step 1: Add failing message and recovery tests**

```js
test('message renderer preserves safe text and user scroll position', () => {
  assert.match(CHAT, /function _isNearBottom\(container\)/);
  assert.match(CHAT, /container\.scrollHeight - container\.scrollTop - container\.clientHeight <= 72/);
  assert.match(CHAT, /function _appendMessage\(container, text, role, metaKey\)/);
  assert.match(CHAT, /body\.textContent = text/);
  assert.doesNotMatch(CHAT, /body\.innerHTML = text/);
});

test('retry is one inline error and never duplicates the user message', () => {
  const retryBody = CHAT.slice(CHAT.indexOf('function _showRetry'), CHAT.indexOf('function _setComposerBusy'));
  assert.match(retryBody, /_doSend\(failedMsg, \{ userBubble: false \}\)/);
  assert.match(retryBody, /chatNoDataChanged/);
  assert.equal((retryBody.match(/appendChild\(wrap\)/g) || []).length, 1);
});

test('initial chat exposes exactly three action-oriented suggestions', () => {
  assert.match(CHAT, /'plan-today'/);
  assert.match(CHAT, /'priority-work'/);
  assert.match(CHAT, /'week-summary'/);
  assert.match(CHAT, /function _renderSuggestions\(mode\)/);
});
```

- [ ] **Step 2: Run RED**

```powershell
node --test --test-name-pattern="message renderer|retry|suggestions" tests/phase35-chat-redesign.test.mjs
```

Expected: FAIL because the current `_appendText()` force-scrolls and the old four study chips remain.

- [ ] **Step 3: Replace `_appendText()` with a safe structured message renderer**

Build DOM elements without parsing Markdown or HTML:

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

Use CSS `white-space: pre-wrap` later so safe newline-separated answers remain readable. Replace all `_appendText()` call sites, including file responses, with `_appendMessage()`.

- [ ] **Step 4: Replace static suggestions with localized rendering**

Define exactly three initial suggestions:

```js
var SUGGESTIONS = {
  'plan-today': { key: 'chatSuggestPlanToday', promptKey: 'chatSuggestPlanTodayPrompt' },
  'priority-work': { key: 'chatSuggestPriority', promptKey: 'chatSuggestPriorityPrompt' },
  'week-summary': { key: 'chatSuggestWeek', promptKey: 'chatSuggestWeekPrompt' },
};
```

Add exact Vietnamese and English prompt strings. `_renderSuggestions('initial')` creates buttons with `data-action="chat-suggest"` and localized text. `_renderSuggestions('hidden')` empties the container. Call the initial mode from module initialization and `doChatClear()`, and hide after the first valid send.

- [ ] **Step 5: Rebuild welcome, typing, and retry through the same renderer**

`_renderWelcome()` clears only the conversation UI, appends one welcome message, resets context status, renders initial suggestions, and clears file state. `_showTyping()` uses a three-dot element plus localized status text, and `_showRetry()` renders exactly one error block containing error copy, `chatNoDataChanged`, and one retry button.

Keep retry behavior `_doSend(failedMsg, { userBubble: false })` so it never inserts another user message.

- [ ] **Step 6: Run focused chat/file regressions**

```powershell
node --check js/chat.js
node --test tests/phase35-chat-redesign.test.mjs tests/phase6c1-file-attachment-hotfix.test.mjs tests/phase6c2-file-send-hotfix.test.mjs tests/phase6c-file-understanding.test.mjs
node test-server-ai-chat.js
```

Expected: PASS. Update the `_appendText` assertions in `tests/phase6c2-file-send-hotfix.test.mjs` to assert `_appendMessage` while preserving their safe-render and duplicate-send intent.

- [ ] **Step 7: Commit conversation behavior**

```powershell
git add -- js/chat.js js/i18n.js tests/phase35-chat-redesign.test.mjs tests/phase6c2-file-send-hotfix.test.mjs
git commit -m "feat(chat): improve conversation recovery and actions"
```

---

### Task 5: Apply the Focused Coach visual system and responsive presentation

**Files:**
- Modify: `tests/phase35-chat-redesign.test.mjs`
- Modify: `css/styles-critical.css:1538-1546`
- Modify: `css/styles-critical.css:1761-2468`
- Modify: `js/app.js:4324-4350`
- Modify: `js/app.js:5458-5498`

**Interfaces:**
- Consumes: approved shell class names, existing TaskFlow CSS variables, `closeChatPanel()`, `chat-toggle`, Pomodoro mutual exclusion, and `#appMain`.
- Produces: desktop anchored popover, mobile `data-presentation="sheet"`, responsive `aria-modal`, focus containment on mobile, and coherent styles for all existing agent/file states.

- [ ] **Step 1: Add failing visual-contract tests**

```js
test('Focused Coach CSS uses TaskFlow tokens and responsive geometry', () => {
  assert.match(CSS, /\.chat-pop \{[\s\S]*width: min\(380px, calc\(100vw - 24px\)\)/);
  assert.match(CSS, /\.chat-pop \{[\s\S]*max-height: min\(520px, calc\(100dvh - 24px\)\)/);
  assert.match(CSS, /\.chat-context-status\[data-state="using"\]/);
  assert.match(CSS, /\.chat-msg-body \{[\s\S]*white-space: pre-wrap/);
  assert.match(CSS, /@media \(max-width: 767px\)[\s\S]*\.chat-pop \{[\s\S]*position: fixed;[\s\S]*height: 100dvh/);
  assert.match(CSS, /env\(safe-area-inset-bottom\)/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
});

test('chat presentation synchronizes mobile modal semantics', () => {
  assert.match(APP_JS, /function syncChatPresentation\(\)/);
  assert.match(APP_JS, /matchMedia\('\(max-width: 767px\)'\)/);
  assert.match(APP_JS, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(APP_JS, /removeAttribute\('aria-modal'\)/);
});
```

- [ ] **Step 2: Run RED**

```powershell
node --test --test-name-pattern="Focused Coach|presentation" tests/phase35-chat-redesign.test.mjs
```

Expected: FAIL against the old 340 px popover and capped mobile popover.

- [ ] **Step 3: Replace legacy chatbot shell CSS with token-driven styles**

Implement these required values and relationships:

```css
.chat-pop {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  width: min(380px, calc(100vw - 24px));
  max-height: min(520px, calc(100dvh - 24px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--card-border);
  border-radius: 16px;
  background: var(--card-bg);
  box-shadow: 0 18px 48px rgba(var(--ink-rgb), .18);
}

.chat-msg-body { white-space: pre-wrap; overflow-wrap: anywhere; }
.chat-msg.bot { max-width: 84%; background: rgb(var(--ink-rgb) / .06); }
.chat-msg.user { max-width: 82%; background: var(--color-accent); color: var(--color-on-accent); }
.chat-input { min-height: 28px; max-height: 112px; resize: none; overflow-y: auto; }
.chat-send { width: 32px; height: 32px; background: var(--color-accent); color: var(--color-on-accent); }
.chat-context-status[data-state="using"],
.chat-context-status[data-state="used"] { color: var(--color-positive); }
```

Use one 8/12/16 px spacing rhythm, 8-11 px control radii, 44 px touch targets on mobile, and existing theme tokens. Replace the old permanent privacy note and badge styles. Retheme, but do not remove, `.agent-card`, `.clarification-card`, `.chat-file-card`, `.chat-file-loading`, `.chat-retry-wrap`, and guest states.

- [ ] **Step 4: Implement the full-screen mobile sheet**

```css
@media (max-width: 767px) {
  .chat-pop {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100dvh;
    max-height: none;
    border: 0;
    border-radius: 0;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    z-index: 1200;
  }
  .chat-messages { min-height: 0; max-height: none; }
  .chat-header-actions button,
  .chat-menu button,
  .chat-attach-btn,
  .chat-send { min-width: 44px; min-height: 44px; }
}
```

Ensure the message log alone owns vertical scrolling while header, context strip, actions, file row, and composer retain their natural size.

- [ ] **Step 5: Synchronize responsive semantics and focus in `js/app.js`**

Add `syncChatPresentation()` that sets `data-presentation="sheet"` plus `aria-modal="true"` below 768 px, and removes `aria-modal` above that breakpoint. Call it before opening and on the media-query `change` event.

On mobile sheet only, contain `Tab` and `Shift+Tab` between visible interactive elements inside `#chatPop`. Keep the existing `Escape`, outside-click, close, `aria-expanded`, Pomodoro exclusion, and focus-restoration behavior. Outside-click must not close the full-screen sheet because there is no outside surface.

Ensure `doChatClear()` also leaves `#chatMenu` and `#chatDataPanel` hidden so they cannot reopen stale after the module resets the conversation.

- [ ] **Step 6: Add dark-mode, focus, and reduced-motion guarantees**

Use existing dark theme tokens rather than new literal surface colors. Every icon-only control needs `:focus-visible`; the context state must pair color with text; typing motion must be disabled under reduced motion while its status label remains visible.

- [ ] **Step 7: Run focused tests**

```powershell
node --check js/app.js
node --test tests/phase35-chat-redesign.test.mjs tests/phase9-frontend.test.mjs
python scripts/audit-dark-contrast.py
```

Expected: PASS with no new dark-mode contrast failures.

- [ ] **Step 8: Commit the responsive visual system**

```powershell
git add -- css/styles-critical.css js/app.js tests/phase35-chat-redesign.test.mjs tests/phase9-frontend.test.mjs
git commit -m "feat(chat): apply Focused Coach responsive design"
```

---

### Task 6: Add end-to-end chat interaction and accessibility coverage

**Files:**
- Modify: `scripts/e2e-frontend.py:1818-1845`
- Modify: `tests/phase35-chat-redesign.test.mjs`

**Interfaces:**
- Consumes: stable `data-testid="chat-fab"`, `data-testid="chat-pop"`, chatbot IDs, new context strip, textarea composer, menu, and existing mobile More-sheet entry.
- Produces: `chat_redesign_checks(page, viewport_name)` browser scenario covering desktop and mobile layout and interaction.

- [ ] **Step 1: Add a failing source contract for the E2E scenario**

Append:

```js
test('frontend E2E covers the redesigned chatbot states', () => {
  const E2E = read('scripts/e2e-frontend.py');
  assert.match(E2E, /def chat_redesign_checks\(page, viewport_name\):/);
  [
    '#chatContextStatus', '#chatInput', '#chatComposer', '#chatMenu', '#chatDataPanel',
    '[data-action="chat-menu-toggle"]', '[data-action="chat-send"]',
  ].forEach((selector) => assert.ok(E2E.includes(selector), `missing E2E selector ${selector}`));
  assert.match(E2E, /Shift\+Enter/);
  assert.match(E2E, /aria-modal/);
});
```

- [ ] **Step 2: Run RED**

```powershell
node --test --test-name-pattern="frontend E2E" tests/phase35-chat-redesign.test.mjs
```

Expected: FAIL because `chat_redesign_checks` does not exist.

- [ ] **Step 3: Implement the browser scenario without requiring a live AI response**

Add a function that:

1. Opens chat through the desktop FAB or mobile More sheet.
2. Asserts exactly one visible `#chatPop`, correct `aria-expanded`, and focused `#chatInput`.
3. Types `Dòng một`, presses `Shift+Enter`, types `Dòng hai`, and asserts the textarea contains a newline without submitting.
4. Asserts the send control becomes enabled and the textarea height is greater than its initial height.
5. Opens `chatMenu`, opens `chatDataPanel`, verifies both sensitive switches default to `aria-checked="false"`, closes the panel, and verifies focus returns to the menu button.
6. On desktop, asserts the popover width is between 350 and 390 px and height does not exceed the viewport.
7. On mobile, asserts the popover bounding box fills the viewport within 1 px, `aria-modal="true"`, and composer bottom stays inside the viewport.
8. Presses `Escape`, asserts the panel is hidden, and verifies focus returns to the opening control.
9. Reopens chat, opens Pomodoro, and preserves the existing mutual-exclusion assertion.

Use Playwright bounding boxes and attributes, not screenshots alone. Do not send the typed message, so this scenario remains deterministic offline.

- [ ] **Step 4: Add an in-page synthetic state check**

Within the same E2E scenario, use `page.evaluate` only to set the context strip’s `data-state`/text and append a long safe `.chat-msg.bot` node with `textContent`. Assert:

- The long message wraps without horizontal overflow.
- The context strip is visible in both light and dark modes.
- Reduced-motion emulation leaves the typing label visible.

This verifies layout states without mocking the backend or weakening production code.

- [ ] **Step 5: Run focused browser checks**

The E2E script starts its own loopback static server. Run:

```powershell
python scripts/e2e-frontend.py --all
```

Expected: all existing scenarios plus `chat_redesign_checks` PASS at every configured viewport.

- [ ] **Step 6: Run accessibility checks**

```powershell
python scripts/e2e-a11y.py
```

Expected: no critical or serious violations; chatbot icon buttons have names, the context status is announced politely, and focus is visible.

- [ ] **Step 7: Commit browser coverage**

```powershell
git add -- scripts/e2e-frontend.py tests/phase35-chat-redesign.test.mjs
git commit -m "test(chat): cover redesigned assistant flow"
```

---

### Task 7: Regenerate release assets and run the full verification matrix

**Files:**
- Modify (generated): `js/chat.min.js`
- Modify (generated): `js/app.min.js`
- Modify (generated): `js/i18n.min.js`
- Modify (generated): `css/styles-critical.min.css`
- Modify: `app.html` asset query versions
- Modify: `sw.js` cache version from the current `taskflow-vNNN` value to the next integer
- Modify: any release-version assertions that explicitly pin the changed asset versions

**Interfaces:**
- Consumes: all readable-source changes from Tasks 1-6 and the repository’s canonical minification/cache pipeline.
- Produces: deployable minified assets with cache-busting versions and a verified release candidate.

- [ ] **Step 1: Inspect the complete diff and confirm scope**

```powershell
git status --short
git diff --name-only HEAD~6..HEAD
git diff --check
```

Expected: only the chatbot design spec/plan and the files named in this implementation plan. Explicitly stop if unrelated AI-roadmap or server files appear.

- [ ] **Step 2: Regenerate minified siblings**

```powershell
python scripts/minify.py
```

Expected: updated `js/chat.min.js`, `js/app.min.js`, `js/i18n.min.js`, and `css/styles-critical.min.css`; other generated files remain byte-equivalent unless their readable source changed.

- [ ] **Step 3: Bump cache-busting versions once**

Increment the query values in `app.html` for each changed minified asset loaded there. Follow the existing `sw.js` cache-name convention and bump it once so precached `chat.min.js` and boot assets refresh. Update only tests that assert those exact version numbers.

- [ ] **Step 4: Verify syntax and focused tests**

```powershell
node --check js/chat.js
node --check js/app.js
node --check js/i18n.js
node --test tests/phase35-chat-redesign.test.mjs
node --test tests/phase9-frontend.test.mjs
node --test tests/phase3b-ai-chat-context.test.mjs tests/phase34-ai-context.test.mjs
node --test tests/phase6c1-file-attachment-hotfix.test.mjs tests/phase6c2-file-send-hotfix.test.mjs tests/phase6c-file-understanding.test.mjs
node test-server-ai-chat.js
```

Expected: all PASS.

- [ ] **Step 5: Verify all Node regressions and generated assets**

```powershell
node --test tests/*.test.mjs
python scripts/minify.py --check
python scripts/check-release-assets.py
```

Expected: all tests PASS, minified assets are current, and release references are valid.

- [ ] **Step 6: Run browser, accessibility, offline, and smoke verification**

```powershell
python scripts/e2e-frontend.py --all
python scripts/e2e-a11y.py
python scripts/e2e-offline.py
python scripts/e2e-smoke.py
```

Expected: every command exits 0. Manually inspect the chatbot in Vietnamese and English, light and dark themes, desktop and mobile widths. Exercise open, multiline draft, close/focus return, file selection/removal, synthetic long response, context states, retry state, and Pomodoro mutual exclusion.

- [ ] **Step 7: Perform the final safety review**

```powershell
git diff --check
git status --short
git diff --stat
```

Confirm:

- No `.env`, database, transient screenshot, `.superpowers/brainstorm`, or unrelated file is staged.
- Reflection/Mood remain default-off, independently opt-in, and accurately named whenever consent includes them.
- No raw model output reaches `innerHTML`.
- Mobile sheet and desktop popover both restore focus correctly.
- No backend API contract changed.

- [ ] **Step 8: Commit release assets**

```powershell
git add -- app.html sw.js js/chat.min.js js/app.min.js js/i18n.min.js css/styles-critical.min.css tests/phase35-chat-redesign.test.mjs tests/phase9-frontend.test.mjs
git commit -m "build(chat): refresh redesigned assistant assets"
```

- [ ] **Step 9: Record final evidence**

Capture the exact commit hashes, test counts, E2E viewport coverage, and any intentionally skipped command in the implementation handoff. Do not claim deployment, publication, merge, or production verification unless those actions are separately requested and confirmed.
