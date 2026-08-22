// TaskFlow — Trợ lý TaskFlow (Gemini Chat, Phase 2 + Phase 3B context).
// Gửi tin nhắn → POST /api/ai/chat → backend gọi Gemini → trả lời thật.
// Phase 3B: với câu hỏi về dữ liệu TaskFlow, client gửi taskflowContext
// (envelope an toàn từ TaskFlowChatContextProvider — READ-ONLY, không
// reflections/mood). Câu hỏi chung KHÔNG gửi context. Mọi lỗi context đều
// fallback về chat thường — không bao giờ làm hỏng cuộc trò chuyện.
// Gateway: Browser → TaskFlow backend → Gemini (KHÔNG BAO GIỜ browser → Gemini trực tiếp).
// Lazy-loaded — giữ nguyên pattern P1.5, không nằm trong boot path.
// Phase: Chat History + Stop Response Lifecycle
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowChat = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ---- Config ---- */
  var MAX_PROVIDER_HISTORY = 10;
  var MAX_MSG_LEN = 4000;

  /* ---- State ---- */
  var _inFlight = false;
  var _activeRequest = null;   // { generation, controller, kind }
  var _requestGeneration = 0;

  /* ---- History ---- */
  var _historyMod = null;
  var _accountScope = null;
  var _activeConversationId = null;
  var _conversationViews = Object.create(null);

  function _getHistory() {
    if (!_historyMod) {
      _historyMod = (typeof TaskFlowChatHistory !== 'undefined') ? TaskFlowChatHistory : null;
    }
    return _historyMod;
  }

  function _getAccountScope() {
    if (_accountScope !== null) return _accountScope;
    try {
      if (window.Sync && typeof Sync.getUserId === 'function') {
        var uid = Sync.getUserId();
        _accountScope = uid || 'anon';
      } else {
        _accountScope = 'anon';
      }
    } catch (e) {
      _accountScope = 'anon';
    }
    return _accountScope;
  }

  function _getActiveConversation() {
    var mod = _getHistory();
    if (!mod) return null;
    var scope = _getAccountScope();
    var convId = _activeConversationId;
    if (!convId) {
      var state = mod.load(scope);
      convId = state.activeConversationId;
      if (!convId || !mod.getConversation(scope, convId)) return null;
      _activeConversationId = convId;
    }
    return mod.getConversation(scope, convId);
  }

  function _ensureConversation() {
    var conv = _getActiveConversation();
    if (conv) return conv;
    var mod = _getHistory();
    if (!mod) return null;
    var scope = _getAccountScope();
    var newConv = mod.createConversation(scope);
    _activeConversationId = newConv.id;
    return newConv;
  }

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
    if (typeof _resizeComposer === 'function') _resizeComposer(input);
    if (typeof _syncComposerState === 'function') _syncComposerState();
  }

  function _persistUserMessage(text, attachment) {
    var mod = _getHistory();
    if (!mod) return;
    var conv = _ensureConversation();
    if (!conv) return;
    mod.addMessage(_getAccountScope(), conv.id, {
      role: 'user',
      content: text,
      attachment: attachment || null
    });
  }

  function _persistAssistantMessage(text) {
    var mod = _getHistory();
    if (!mod) return;
    var conv = _getActiveConversation();
    if (!conv) return;
    mod.addMessage(_getAccountScope(), conv.id, {
      role: 'assistant',
      content: text
    });
  }

  function _getProviderHistory() {
    var mod = _getHistory();
    if (!mod) return [];
    var conv = _getActiveConversation();
    if (!conv) return [];
    return mod.getProviderHistory(_getAccountScope(), conv.id, MAX_PROVIDER_HISTORY);
  }

  /* ---- Shared Request Lifecycle ---- */

  function _startRequest(kind) {
    // Cancel any existing request
    if (_activeRequest) {
      try { _activeRequest.controller.abort(); } catch (e) { /* */ }
      _activeRequest = null;
    }
    _requestGeneration++;
    var gen = _requestGeneration;
    var controller = new AbortController();
    _activeRequest = { generation: gen, controller: controller, kind: kind };
    return { signal: controller.signal, generation: gen };
  }

  function _isCurrentRequest(gen) {
    return _activeRequest && _activeRequest.generation === gen;
  }

  function stopActiveResponse() {
    if (!_activeRequest) return false;
    try { _activeRequest.controller.abort(); } catch (e) { /* */ }
    _requestGeneration++;
    _activeRequest = null;
    _inFlight = false;
    // Remove typing indicator
    var typingEl = document.querySelector('.chat-typing');
    if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    // Re-enable input
    _setInputEnabled(true);
    _setSendMode(false);
    // Optionally show stopped message
    var msgs = _el('chatMessages');
    if (msgs) {
      _appendText(msgs, _t('chatStopped'), 'chat-msg bot chat-stopped');
    }
    return true;
  }

  function _setSendMode(isStopping) {
    var sendBtn = document.querySelector('[data-action="chat-send"]');
    if (!sendBtn) return;
    if (isStopping) {
      sendBtn.textContent = _t('chatStop');
      sendBtn.setAttribute('aria-label', _t('chatStopAria'));
      sendBtn.classList.add('chat-send--stopping');
    } else {
      sendBtn.textContent = _t('chatSend');
      sendBtn.setAttribute('aria-label', _t('chatSend'));
      sendBtn.classList.remove('chat-send--stopping');
    }
  }

  /* ---- i18n helpers ---- */
  function _t(key) {
    try { return (window.TaskFlowI18N && window.TaskFlowI18N.t) ? window.TaskFlowI18N.t(key) : key; }
    catch (e) { return key; }
  }
  function _esc(s) {
    try { return (window.TaskFlowUtil && window.TaskFlowUtil.esc) ? window.TaskFlowUtil.esc(s) : String(s); }
    catch (e) { return String(s); }
  }

  /* ---- Guest detection ---- */
  function _hasToken() {
    try { return !!localStorage.getItem('planner-token'); }
    catch (e) { return false; }
  }

  /* ---- Offline detection ---- */
  function _isOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  /* ---- DOM helpers ---- */
  function _el(id) { return document.getElementById(id); }

  /* ---- Suggestion chips mapping ---- */
  var SUGGESTIONS = {
    'study-plan': { text: '📚 Lên kế hoạch học tập', prompt: 'Giúp tôi tạo một phương pháp lập kế hoạch học tập hiệu quả.' },
    'goal-tips':  { text: '🎯 Mẹo đạt mục tiêu', prompt: 'Cho tôi những mẹo thiết thực để đạt được mục tiêu học tập và làm việc.' },
    'habit-tips': { text: '🔥 Xây thói quen mới', prompt: 'Làm thế nào để xây dựng một thói quen mới và duy trì nó lâu dài?' },
    'pomodoro-tips': { text: '🍅 Cách dùng Pomodoro', prompt: 'Giải thích kỹ thuật Pomodoro và cách áp dụng hiệu quả trong học tập.' },
  };

  /* ---- Safe text rendering ---- */
  function _appendText(container, text, className) {
    var div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  /* ---- Show/hide typing indicator ---- */
  function _showTyping(container) {
    var el = document.createElement('div');
    el.className = 'chat-msg bot chat-typing';
    el.setAttribute('aria-live', 'polite');
    el.textContent = _t('chatThinking');
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    return el;
  }
  function _removeTyping(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  /* ---- Show localized message ---- */
  function _showInfo(container, text) {
    var el = document.createElement('div');
    el.className = 'chat-msg bot chat-info';
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  /* ---- Show guest prompt with login button ---- */
  function _showGuestPrompt(container) {
    var wrap = document.createElement('div');
    wrap.className = 'chat-msg bot chat-guest-prompt';
    var p = document.createElement('p');
    p.textContent = _t('chatGuestMsg');
    wrap.appendChild(p);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-guest-btn';
    btn.textContent = _t('chatGuestBtn');
    btn.addEventListener('click', function () {
      if (window.TaskFlowUI && window.TaskFlowUI.openDialog) {
        window.TaskFlowUI.openDialog('syncModal');
      }
    });
    wrap.appendChild(btn);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  /* ---- Show retry button ---- */
  function _showRetry(container, failedMsg, mappedErrorText) {
    var wrap = document.createElement('div');
    wrap.className = 'chat-msg bot chat-retry-wrap';
    var p = document.createElement('p');
    p.textContent = mappedErrorText || _t('chatErrorMsg');
    wrap.appendChild(p);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-retry-btn';
    btn.textContent = _t('chatRetry');
    btn.addEventListener('click', function () {
      if (failedMsg) _doSend(failedMsg, { userBubble: false });
    });
    wrap.appendChild(btn);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  /* ---- Update input enabled/disabled state ---- */
  function _setInputEnabled(enabled) {
    var input = _el('chatInput');
    if (input) input.disabled = !enabled;
  }

  /* ---- Hide suggestion chips during active chat ---- */
  function _setChipsVisible(visible) {
    var chips = document.querySelectorAll('.chat-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].style.display = visible ? '' : 'none';
    }
  }

  /* ---- Context badge ---- */
  function _setContextBadge(scope) {
    var badge = _el('chatContextBadge');
    if (!badge) return;
    if (!scope) { badge.hidden = true; return; }
    var key = {
      today: 'chatContextBadgeToday',
      week: 'chatContextBadgeWeek',
      project: 'chatContextBadgeProject',
      schedule: 'chatContextBadgeSchedule',
      overview: 'chatContextBadgeOverview',
    }[scope];
    if (!key) { badge.hidden = true; return; }
    badge.textContent = _t(key);
    badge.title = _t('chatContextBadgeTitle');
    badge.hidden = false;
  }

  /* ---- API base resolution ---- */
  function _getApiBase() {
    try {
      if (typeof API_CONFIG !== 'undefined'
          && API_CONFIG
          && typeof API_CONFIG.url === 'string') {
        return API_CONFIG.url.replace(/\/+$/, '');
      }
    } catch (e) { /* fall through */ }
    return '';
  }

  /* ---- API call ---- */
  async function _callChatAPI(message, history, signal) {
    var apiBase = _getApiBase();
    if (!apiBase) {
      throw { code: 'api-config-missing' };
    }
    var url = apiBase + '/api/ai/chat';

    var token = null;
    try { token = localStorage.getItem('planner-token'); } catch (e) { /* */ }

    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var taskflowContext = null;
    var ctxScope = null;
    try {
      if (window.TaskFlowChatContextProvider && window.TaskFlowChatContextProvider.prepare) {
        var ctxRes = window.TaskFlowChatContextProvider.prepare(message);
        if (ctxRes && ctxRes.ok && ctxRes.envelope) {
          taskflowContext = ctxRes.envelope;
          ctxScope = ctxRes.scope || taskflowContext.scope || null;
        }
      }
    } catch (e) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[chat-context] prepare-failed (' + (e && e.name ? e.name : 'exception') + ')');
      }
    }
    _setContextBadge(ctxScope);

    var body = { message: message, history: history };
    if (taskflowContext) body.taskflowContext = taskflowContext;

    // P10: ?debug=1 safe diagnostics — URL resolution only, never token/body/context.
    var debugLog = typeof location !== 'undefined' && /[?&]debug=1/.test(location.search);
    if (debugLog && typeof console !== 'undefined' && console.log) {
      console.log('[chat] api-base=' + apiBase);
      console.log('[chat] request=/api/ai/chat');
    }

    var res = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: signal,
    });

    var json;
    try { json = await res.json(); } catch (e) { json = null; }

    if (!res.ok || !json || !json.ok) {
      var errCode = (json && json.error) || 'network';
      throw { code: errCode, status: res.status };
    }

    return json.answer;
  }

  /* ---- Error message mapping ---- */
  function _mapError(err) {
    if (err && err.name === 'AbortError') return null; // user stopped — no error
    var code = err && err.code ? err.code : 'network';
    switch (code) {
      case 'ai-not-configured': return _t('chatErrorNotConfigured');
      case 'ai-timeout': return _t('chatErrorTimeout');
      case 'ai-rate-limited': return _t('chatErrorRateLimited');
      case 'ai-provider-auth': return _t('chatErrorProviderAuth');
      case 'ai-provider-forbidden': return _t('chatErrorProviderForbidden');
      case 'ai-provider-bad-request': return _t('chatErrorBadRequest');
      case 'ai-provider-unavailable': case 'ai-provider-not-found':
        return _t('chatErrorUnavailable');
      case 'invalid-message': return _t('chatErrorInvalidMessage');
      case 'ai-context-invalid': return _t('chatErrorContextInvalid');
      case 'api-config-missing': return _t('chatErrorApiConfig');
      default: return _t('chatErrorMsg');
    }
  }

  /* ---- Core send flow ---- */
  async function _doSend(text, opts) {
    if (_inFlight) return;
    opts = opts || {};
    text = (text || '').trim();
    if (!text) return;

    var msgs = _el('chatMessages');
    if (!msgs) return;

    if (!_isOnline()) {
      _showInfo(msgs, _t('chatOffline'));
      return;
    }
    if (!_hasToken()) {
      _showGuestPrompt(msgs);
      return;
    }
    if (text.length > MAX_MSG_LEN) {
      _showInfo(msgs, _t('chatErrorTooLong'));
      return;
    }

    _inFlight = true;
    _setInputEnabled(false);
    _setChipsVisible(false);
    _setSendMode(true);

    if (opts.userBubble !== false) _appendText(msgs, text, 'chat-msg user');

    // Persist user message to history
    _persistUserMessage(text);

    var typingEl = _showTyping(msgs);

    // Start request lifecycle
    var req = _startRequest('chat');

    try {
      var intent = null;
      if (window.TaskFlowAIIntent && typeof window.TaskFlowAIIntent.classifyIntent === 'function') {
        try {
          var taskCtx = window.TaskFlowAIAgentRuntime ? window.TaskFlowAIAgentRuntime.buildContext() : null;
          var tasks = taskCtx && taskCtx.tasks ? taskCtx.tasks : [];
          intent = window.TaskFlowAIIntent.classifyIntent(text, tasks);
        } catch (e) { intent = null; }
      }

      var useAgent = false;
      if (intent) {
        if (intent.kind === 'clarify' && intent.candidates && intent.candidates.length > 0) {
          _removeTyping(typingEl);
          if (window.TaskFlowAIAgentRuntime && typeof window.TaskFlowAIAgentRuntime.showClarification === 'function') {
            window.TaskFlowAIAgentRuntime.showClarification(msgs, intent, function (selectedUid, selectedTask) {
              var _send = (typeof send === 'function') ? send : null;
              if (_send) _send(text, { userBubble: false, resolutionHint: { taskUid: selectedUid } });
            });
          } else {
            _appendText(msgs, _t('clarifyFallback'), 'chat-msg bot');
          }
          return;
        }
        useAgent = (intent.kind === 'agent');
      } else {
        useAgent = !!(window.TaskFlowAIAgentRuntime && window.TaskFlowAIAgentRuntime.isActionIntent(text));
      }

      if (useAgent) {
        var agentRes = await window.TaskFlowAIAgentRuntime.handleAgent(text, _getProviderHistory(), msgs, { signal: req.signal, generation: req.generation });
        if (!_isCurrentRequest(req.generation)) return; // stale
        _removeTyping(typingEl);
        if (agentRes && agentRes.handled) {
          var agentReply = (window.TaskFlowAIAgentRuntime.takeResult ? window.TaskFlowAIAgentRuntime.takeResult() : null) || agentRes.reply || null;
          if (agentReply) _persistAssistantMessage(agentReply);
          return;
        }
        throw { code: 'agent-unhandled' };
      }

      var answer = await _callChatAPI(text, _getProviderHistory(), req.signal);

      if (!_isCurrentRequest(req.generation)) return; // stale
      _removeTyping(typingEl);
      _appendText(msgs, answer, 'chat-msg bot');
      _persistAssistantMessage(answer);

    } catch (err) {
      if (err && err.name === 'AbortError') {
        // User stopped — typing already removed by stopActiveResponse
        return;
      }
      _removeTyping(typingEl);
      var errMsg = _mapError(err);
      if (errMsg) _showRetry(msgs, text, errMsg);
    } finally {
      if (_isCurrentRequest(req.generation)) {
        _inFlight = false;
        _activeRequest = null;
      }
      _setInputEnabled(true);
      _setSendMode(false);
      var input = _el('chatInput');
      if (input) input.focus();
    }
  }

  /* ---- Public API ---- */

  function doChatSend() {
    // If a request is active, this becomes the Stop action
    if (_inFlight && _activeRequest) {
      stopActiveResponse();
      return;
    }
    var input = _el('chatInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    _doSend(text);
  }

  function doChatSuggest(topic) {
    if (_inFlight && _activeRequest) {
      stopActiveResponse();
      return;
    }
    var sug = SUGGESTIONS[topic];
    if (sug && sug.prompt) {
      var input = _el('chatInput');
      if (input) input.value = '';
      _doSend(sug.prompt);
    }
  }

  /** Clear conversation — reset to welcome state */
  function doChatClear() {
    stopActiveResponse();
    _clearFileAttachment();
    // Don't delete conversation from history — just reset the view
    _renderWelcome();
    _setChipsVisible(true);
    _setContextBadge(null);
  }

  /** New conversation — keep a session-only draft until the first user message */
  function newConversation() {
    _captureConversationView();
    stopActiveResponse();
    _clearFileAttachment();
    _activeConversationId = null;
    var mod = _getHistory();
    if (mod) mod.setActiveConversation(_getAccountScope(), '');
    _renderWelcome();
    _setChipsVisible(true);
    _setContextBadge(null);
    _restoreConversationView(null);
    closeHistory({ focusTrigger: false });
  }

  /** Render welcome message */
  function _renderWelcome() {
    var msgs = _el('chatMessages');
    if (!msgs) return;
    msgs.innerHTML = '';
    var welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'chat-msg bot';
    var welcomeSpan = document.createElement('span');
    welcomeSpan.setAttribute('data-i18n', 'chatWelcome');
    welcomeSpan.textContent = _t('chatWelcome');
    welcomeDiv.appendChild(welcomeSpan);
    msgs.appendChild(welcomeDiv);
  }

  /** Open a conversation by ID */
  function openConversation(conversationId) {
    _captureConversationView();
    stopActiveResponse();
    _clearFileAttachment();
    _activeConversationId = conversationId;
    var mod = _getHistory();
    if (!mod) return;
    var scope = _getAccountScope();
    mod.setActiveConversation(scope, conversationId);
    var conv = mod.getConversation(scope, conversationId);
    if (!conv) {
      _activeConversationId = null;
      _renderWelcome();
      _setChipsVisible(true);
      _restoreConversationView(null);
      return;
    }
    // Render messages
    var msgs = _el('chatMessages');
    if (!msgs) return;
    msgs.innerHTML = '';
    for (var i = 0; i < conv.messages.length; i++) {
      var m = conv.messages[i];
      var cls = m.role === 'user' ? 'chat-msg user' : 'chat-msg bot';
      _appendText(msgs, m.content, cls);
    }
    _setChipsVisible(false);
    _restoreConversationView(conversationId);
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
      closeHistory({ focusTrigger: false });
    } else if (_drawerOpen) {
      _renderHistoryDrawer();
    }
  }

  /** Delete a conversation */
  function deleteConversation(conversationId) {
    var mod = _getHistory();
    if (!mod) return;
    var scope = _getAccountScope();
    var state = mod.deleteConversation(scope, conversationId);
    if (_activeConversationId === conversationId) {
      var nextConversationId = state && state.activeConversationId ? state.activeConversationId : null;
      if (nextConversationId) {
        openConversation(nextConversationId);
      } else {
        _activeConversationId = null;
        _renderWelcome();
        _setChipsVisible(true);
        _restoreConversationView(null);
      }
    }
    _renderHistoryDrawer();
  }

  /** Clear all history for current account */
  function clearAllHistory() {
    var mod = _getHistory();
    if (!mod) return;
    mod.clearAll(_getAccountScope());
    _activeConversationId = null;
    _renderWelcome();
    _setChipsVisible(true);
    _restoreConversationView(null);
    _renderHistoryDrawer();
  }

  /* ---- History Drawer ---- */
  var _drawerOpen = false;

  function toggleHistory() {
    _setHistoryOpen(!_drawerOpen);
  }

  function _setHistoryOpen(open, options) {
    options = options || {};
    var drawer = _el('chatHistoryDrawer');
    var panel = _el('chatPop');
    var trigger = document.querySelector('[data-action="chat-history"]');
    _drawerOpen = !!open;
    if (drawer) drawer.hidden = !_drawerOpen;
    if (panel) {
      if (_drawerOpen) panel.setAttribute('data-history-open', 'true');
      else panel.removeAttribute('data-history-open');
    }
    if (trigger) trigger.setAttribute('aria-expanded', String(_drawerOpen));
    if (_drawerOpen) {
      _renderHistoryDrawer();
      if (options.focus !== false) {
        var target = document.querySelector('#chatHistoryDrawer .chat-history-item--active .chat-history-item-btn') ||
          document.querySelector('[data-action="chat-new"]');
        if (target && typeof target.focus === 'function') target.focus();
      }
    } else if (options.focusTrigger && trigger && typeof trigger.focus === 'function') {
      trigger.focus();
    }
  }

  function closeHistory(options) {
    _setHistoryOpen(false, options || {});
  }

  function _renderHistoryDrawer() {
    var drawer = _el('chatHistoryDrawer');
    var list = _el('chatHistoryList');
    var footer = _el('chatHistoryFooter');
    if (!drawer || !list || !footer) return;
    list.innerHTML = '';
    footer.innerHTML = '';

    var mod = _getHistory();
    var scope = _getAccountScope();
    if (!_activeConversationId) _getActiveConversation();
    var conversations = mod ? mod.listConversations(scope) : [];

    if (conversations.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'chat-history-empty';
      var emptyText = document.createElement('p');
      emptyText.textContent = _t('chatHistoryEmpty');
      empty.appendChild(emptyText);
      var emptyNote = document.createElement('p');
      emptyNote.className = 'chat-history-empty-note';
      emptyNote.textContent = _t('chatHistoryLocalNote');
      empty.appendChild(emptyNote);
      list.appendChild(empty);
    } else {
      // Group by date
      var groups = _groupByDate(conversations);
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        var groupEl = document.createElement('div');
        groupEl.className = 'chat-history-group';
        var groupTitle = document.createElement('div');
        groupTitle.className = 'chat-history-group-title';
        groupTitle.textContent = group.label;
        groupEl.appendChild(groupTitle);
        for (var i = 0; i < group.items.length; i++) {
          var conv = group.items[i];
          var itemEl = document.createElement('div');
          itemEl.className = 'chat-history-item';
          if (conv.id === _activeConversationId) itemEl.classList.add('chat-history-item--active');

          var itemBtn = document.createElement('button');
          itemBtn.type = 'button';
          itemBtn.className = 'chat-history-item-btn';
          itemBtn.textContent = conv.title || 'Cuộc trò chuyện mới';
          itemBtn.setAttribute('aria-label', conv.title || _t('chatNewConversation'));
          itemBtn.addEventListener('click', (function (id) {
            return function () {
              openConversation(id);
            };
          })(conv.id));
          itemEl.appendChild(itemBtn);

          var timeEl = document.createElement('time');
          timeEl.className = 'chat-history-item-time';
          timeEl.textContent = _formatTime(conv.updatedAt);
          try { timeEl.dateTime = new Date(conv.updatedAt).toISOString(); } catch (e) { /* invalid timestamp */ }
          itemEl.appendChild(timeEl);

          var countEl = document.createElement('span');
          countEl.className = 'chat-history-message-count';
          countEl.textContent = _t('chatHistoryMessageCount').replace('{n}', String(conv.messages ? conv.messages.length : 0));
          itemEl.appendChild(countEl);

          var menuBtn = document.createElement('button');
          menuBtn.type = 'button';
          menuBtn.className = 'chat-history-item-menu';
          menuBtn.textContent = '⋯';
          menuBtn.setAttribute('aria-label', _t('chatConversationOptions'));
          menuBtn.setAttribute('aria-haspopup', 'menu');
          menuBtn.setAttribute('aria-expanded', 'false');

          var actions = document.createElement('div');
          actions.className = 'chat-history-item-actions';
          actions.setAttribute('role', 'menu');
          actions.hidden = true;
          var deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.setAttribute('role', 'menuitem');
          deleteBtn.textContent = _t('chatDeleteConversation');
          deleteBtn.addEventListener('click', (function (id) {
            return function (e) {
              e.stopPropagation();
              if (confirm(_t('chatDeleteConversationConfirm'))) deleteConversation(id);
            };
          })(conv.id));
          actions.appendChild(deleteBtn);
          menuBtn.addEventListener('click', (function (menu, actionMenu, deleteControl) {
            return function (e) {
              e.stopPropagation();
              var opening = actionMenu.hidden;
              actionMenu.hidden = !opening;
              menu.setAttribute('aria-expanded', String(opening));
              if (opening && typeof deleteControl.focus === 'function') deleteControl.focus();
            };
          })(menuBtn, actions, deleteBtn));
          itemEl.appendChild(menuBtn);
          itemEl.appendChild(actions);

          groupEl.appendChild(itemEl);
        }
        list.appendChild(groupEl);
      }

      // Clear all
      var clearEl = document.createElement('div');
      clearEl.className = 'chat-history-clear';
      var clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'chat-history-clear-btn';
      clearBtn.textContent = _t('chatClearHistory');
      clearBtn.addEventListener('click', function () {
        if (confirm(_t('chatClearHistoryConfirm'))) {
          clearAllHistory();
        }
      });
      clearEl.appendChild(clearBtn);
      footer.appendChild(clearEl);
    }
  }

  function _groupByDate(conversations) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var yesterday = today - 86400000;
    var weekAgo = today - 7 * 86400000;

    var groups = [];
    var todayItems = [], yesterdayItems = [], weekItems = [], olderItems = [];

    for (var i = 0; i < conversations.length; i++) {
      var ts = conversations[i].updatedAt;
      if (ts >= today) todayItems.push(conversations[i]);
      else if (ts >= yesterday) yesterdayItems.push(conversations[i]);
      else if (ts >= weekAgo) weekItems.push(conversations[i]);
      else olderItems.push(conversations[i]);
    }

    if (todayItems.length > 0) groups.push({ label: _t('chatToday'), items: todayItems });
    if (yesterdayItems.length > 0) groups.push({ label: _t('chatYesterday'), items: yesterdayItems });
    if (weekItems.length > 0) groups.push({ label: _t('chatLast7Days'), items: weekItems });
    if (olderItems.length > 0) groups.push({ label: _t('chatOlder'), items: olderItems });

    return groups;
  }

  function _formatTime(ts) {
    var d = new Date(ts);
    var h = d.getHours().toString().padStart(2, '0');
    var m = d.getMinutes().toString().padStart(2, '0');
    return h + ':' + m;
  }

  /* ---- Phase 6C: File Attachment ---- */
  var _attachedFile = null;
  var _fileObjectURL = null;
  var _pendingFileProposal = null;
  var _FILE_MAX_BYTES = 15 * 1024 * 1024;
  var _ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown']);
  var _ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.txt', '.md']);

  var FILE_CHIPS_IMAGE = [
    { key: 'fileChipImageDesc', prompt: 'Mô tả ảnh này' },
    { key: 'fileChipImageExplain', prompt: 'Giải thích nội dung trong ảnh' },
    { key: 'fileChipImageRead', prompt: 'Đọc nội dung chữ trong ảnh' },
    { key: 'fileChipImageFindError', prompt: 'Tìm lỗi trong ảnh này' },
    { key: 'fileChipCreateTask', prompt: 'Tạo task từ ảnh này', isAction: true },
    { key: 'fileChipExtractDeadline', prompt: 'Trích deadline từ ảnh', isAction: true },
  ];
  var FILE_CHIPS_DOC = [
    { key: 'fileChipSummary', prompt: 'Tóm tắt tài liệu này' },
    { key: 'fileChipExplain', prompt: 'Giải thích nội dung chính' },
    { key: 'fileChipKeyPoints', prompt: 'Liệt kê các điểm chính' },
    { key: 'fileChipQuiz', prompt: 'Tạo 10 câu hỏi ôn tập từ tài liệu' },
    { key: 'fileChipCreateTask', prompt: 'Tạo task từ tài liệu này', isAction: true },
    { key: 'fileChipExtractDeadline', prompt: 'Trích deadline từ tài liệu', isAction: true },
    { key: 'fileChipPlan', prompt: 'Lập kế hoạch học từ tài liệu này', isAction: true },
  ];
  var FILE_CHIPS_TEXT = [
    { key: 'fileChipSummary', prompt: 'Tóm tắt nội dung' },
    { key: 'fileChipKeyPoints', prompt: 'Tìm các ý chính' },
    { key: 'fileChipDocExtract', prompt: 'Trích xuất thông tin quan trọng' },
    { key: 'fileChipCreateTask', prompt: 'Tạo task từ nội dung này', isAction: true },
    { key: 'fileChipExtractDeadline', prompt: 'Trích deadline từ nội dung', isAction: true },
  ];

  function _formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function _fileIcon(mime) {
    if (mime && mime.startsWith('image/')) return '🖼';
    if (mime === 'application/pdf') return '📄';
    return '📝';
  }

  function _validateFile(file) {
    if (!file) return { ok: false, reason: 'fileEmpty' };
    if (file.size === 0) return { ok: false, reason: 'fileEmpty' };
    if (file.size > _FILE_MAX_BYTES) return { ok: false, reason: 'fileTooLarge' };
    var ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!_ALLOWED_TYPES.has(file.type) && !_ALLOWED_EXTS.has(ext)) {
      return { ok: false, reason: 'fileUnsupported' };
    }
    return { ok: true };
  }

  function _renderFileCard(file) {
    var card = _el('chatFileCard');
    if (!card) return;
    card.innerHTML = '';
    if (!file) return;

    var cardEl = document.createElement('div');
    cardEl.className = 'chat-file-card';

    var icon = document.createElement('span');
    icon.className = 'chat-file-card-icon';
    icon.textContent = _fileIcon(file.type);
    cardEl.appendChild(icon);

    if (file.type && file.type.startsWith('image/') && _fileObjectURL) {
      var preview = document.createElement('img');
      preview.className = 'chat-file-preview';
      preview.src = _fileObjectURL;
      preview.alt = file.name;
      cardEl.appendChild(preview);
    }

    var info = document.createElement('div');
    info.className = 'chat-file-card-info';
    var name = document.createElement('div');
    name.className = 'chat-file-card-name';
    name.textContent = file.name;
    info.appendChild(name);
    var size = document.createElement('div');
    size.className = 'chat-file-card-size';
    size.textContent = _formatFileSize(file.size);
    info.appendChild(size);
    cardEl.appendChild(info);

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'chat-file-card-remove';
    removeBtn.setAttribute('aria-label', _t('fileRemove'));
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', function () { _clearFileAttachment(); });
    cardEl.appendChild(removeBtn);

    card.appendChild(cardEl);
    _renderFileChips(file.type);
  }

  function _renderFileChips(mimeType) {
    var chipsEl = _el('chatFileChips');
    if (!chipsEl) return;
    chipsEl.innerHTML = '';
    chipsEl.hidden = false;
    var chips = mimeType && mimeType.startsWith('image/') ? FILE_CHIPS_IMAGE
      : mimeType === 'application/pdf' ? FILE_CHIPS_DOC : FILE_CHIPS_TEXT;
    chips.forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-chip';
      btn.textContent = _t(c.key);
      btn.addEventListener('click', function () {
        var input = _el('chatInput');
        if (input) input.value = c.prompt;
        doChatSend();
      });
      chipsEl.appendChild(btn);
    });
  }

  function _setFileLoading(fileName, loading) {
    var card = _el('chatFileCard');
    if (!card) return;
    var existing = card.querySelector('.chat-file-loading');
    if (loading) {
      if (existing) return;
      var loadEl = document.createElement('div');
      loadEl.className = 'chat-file-loading';
      var spinner = document.createElement('div');
      spinner.className = 'spinner';
      loadEl.appendChild(spinner);
      var text = document.createElement('span');
      text.textContent = _t('fileReading') + ' ' + fileName + '...';
      loadEl.appendChild(text);
      card.appendChild(loadEl);
    } else if (existing) {
      existing.remove();
    }
  }

  function _clearFileAttachment() {
    _attachedFile = null;
    if (_fileObjectURL) { URL.revokeObjectURL(_fileObjectURL); _fileObjectURL = null; }
    var card = _el('chatFileCard');
    if (card) card.innerHTML = '';
    var chips = _el('chatFileChips');
    if (chips) { chips.innerHTML = ''; chips.hidden = true; }
    var fileInput = _el('chatFileInput');
    if (fileInput) fileInput.value = '';
  }

  function _handleFileSelect(file) {
    var validation = _validateFile(file);
    if (!validation.ok) {
      var toast = window.TaskFlowUI && TaskFlowUI.toast;
      if (toast) toast(_t(validation.reason), 'error');
      return;
    }
    _attachedFile = file;
    if (file.type && file.type.startsWith('image/')) {
      _fileObjectURL = URL.createObjectURL(file);
    }
    _renderFileCard(file);
  }

  /* ---- Phase 6D: File intent detection ---- */
  function classifyFileIntent(text) {
    if (!text) return { kind: 'read', confidence: 'high', reason: 'empty' };
    var t = text.toLowerCase();

    if (/(?:không|đừng|\\bko\\b|\\bno\\b|\\bdo\\s+not\\b|\\bdon'?t\\b|\\bnever\\b|\\bskip\\b|\\bchỉ\\s+(?:tóm\\s+tắt|giải\\s+thích|đọc|liệt\\s+kê))/.test(t)) {
      return { kind: 'read', confidence: 'high', reason: 'negation' };
    }
    if (/(?:nếu|giả\\s+sử|giả\\s+như|\\bsuppose\\b|\\bassume\\b|\\bwhat\\s+if\\b|\\bimagine\\b|thì\\s+sao|\\bhow\\s+(?:would|could|can))/.test(t)) {
      return { kind: 'read', confidence: 'high', reason: 'hypothetical' };
    }

    var createVerbs = /(?:tạo|thêm|lập|lên|chia|tách|biến|chuyển|đưa\\s+vào|import|create|add|make|turn\\s+into|convert|split|break\\s+down)/i;
    var taskNouns = /(?:task|tasks|công\\s+việc|việc|nhiệm\\s+vụ|todo|to-do|checklist|action|action\\s+item|bước|việc\\s+cần\\s+làm)/i;
    var planNouns = /(?:kế\\s+hoạch|plan|roadmap|lịch|schedule|deadline|xếp\\s+lịch|lịch\\s+học|lịch\\s+trình)/i;
    var dayPattern = /(?:theo\\s+ngày|từng\\s+ngày|mỗi\\s+ngày|theo\\s+tuần|daily|weekly|each\\s+day|per\\s+day)/i;
    var flowVerbs = /(?:đưa\\s+(?:toàn\\s+bộ|tất\\+cả|vào)|đưa\\s+vào\\s+taskflow|vào\\s+taskflow|import\\s+to\\s+taskflow)/i;

    var hasCreateVerb = createVerbs.test(t);
    var hasTaskNoun = taskNouns.test(t);
    var hasPlanNoun = planNouns.test(t);
    var hasDayPattern = dayPattern.test(t);
    var hasFlowVerb = flowVerbs.test(t);

    if (hasFlowVerb) {
      return { kind: 'import-plan', confidence: 'high', reason: 'import-to-taskflow' };
    }
    if (hasCreateVerb && hasDayPattern) {
      return { kind: 'schedule-tasks', confidence: 'high', reason: 'create-with-schedule' };
    }
    if (hasCreateVerb && hasPlanNoun) {
      return { kind: 'schedule-tasks', confidence: 'high', reason: 'create-with-plan' };
    }
    if (hasCreateVerb && hasTaskNoun) {
      return { kind: 'create-tasks', confidence: 'high', reason: 'create-with-task' };
    }
    if (hasCreateVerb) {
      return { kind: 'create-tasks', confidence: 'medium', reason: 'create-verb-only' };
    }
    if (hasTaskNoun) {
      return { kind: 'create-tasks', confidence: 'medium', reason: 'task-noun-only' };
    }
    if (hasPlanNoun && hasDayPattern) {
      return { kind: 'schedule-tasks', confidence: 'medium', reason: 'plan-with-schedule' };
    }

    return { kind: 'read', confidence: 'high', reason: 'no-action-signal' };
  }

  function _isFileAgentIntent(text) {
    var intent = classifyFileIntent(text);
    return intent.kind !== 'read';
  }

  async function _sendWithFile(text, file) {
    if (_inFlight || !file) return;

    var msgs = _el('chatMessages');
    if (!msgs) return;
    if (!_isOnline()) {
      _showInfo(msgs, _t('chatOffline'));
      return;
    }
    if (!_hasToken()) {
      _showGuestPrompt(msgs);
      return;
    }
    var apiBase = _getApiBase();
    if (!apiBase) {
      _showInfo(msgs, _t('chatErrorApiConfig'));
      return;
    }

    var isFileAgent = _isFileAgentIntent(text);
    var endpoint = isFileAgent ? '/api/ai/file-agent' : '/api/ai/file';

    _inFlight = true;
    _setInputEnabled(false);
    _setChipsVisible(false);
    _setSendMode(true);

    // Start request lifecycle
    var req = _startRequest(isFileAgent ? 'file-agent' : 'file');

    try {
      var fileLabel = _fileIcon(file.type) + ' ' + file.name + ' (' + _formatFileSize(file.size) + ')';
      _appendText(msgs, text + '\n' + fileLabel, 'chat-msg user');

      // Persist to history with attachment metadata
      _persistUserMessage(text + '\n' + fileLabel, {
        type: file.type,
        name: file.name,
        size: file.size
      });

      _setFileLoading(file.name, true);

      var fd = new FormData();
      fd.append('file', file);
      fd.append('message', text);

      if (isFileAgent) {
        try {
          var ctxProvider = window.TaskFlowChatContextProvider;
          if (ctxProvider && typeof ctxProvider.prepare === 'function') {
            var ctxResult = ctxProvider.prepare(text);
            if (ctxResult && ctxResult.ok && ctxResult.envelope) {
              fd.append('taskflowContext', JSON.stringify(ctxResult.envelope.data || {}));
            }
          }
        } catch (e) { /* context must never break file send */ }
      }

      var token = null;
      try { token = localStorage.getItem('planner-token'); } catch (e) { /* */ }
      var headers = {};
      if (token) headers['Authorization'] = 'Bearer ' + token;

      var resp = await fetch(apiBase + endpoint, {
        method: 'POST',
        headers: headers,
        body: fd,
        signal: req.signal,
      });

      if (!_isCurrentRequest(req.generation)) return;

      var json;
      try { json = await resp.json(); } catch (e) { json = null; }

      _setFileLoading(file.name, false);

      if (!resp.ok || !json || !json.ok) {
        var errorCode = (json && typeof json.error === 'string') ? json.error : 'ai-file-processing-failed';
        var fileErrMsg;
        try {
          var Review = window.TaskFlowAIReview;
          fileErrMsg = Review && typeof Review.friendlyError === 'function'
            ? Review.friendlyError(errorCode, window.TaskFlowI18n && typeof window.TaskFlowI18n.getLang === 'function' ? window.TaskFlowI18n.getLang() : 'vi')
            : _t('fileFailed');
        } catch (e) { fileErrMsg = _t('fileFailed'); }
        _appendText(msgs, fileErrMsg, 'chat-msg bot');
        _persistAssistantMessage(fileErrMsg);
        return;
      }

      if (isFileAgent && json.proposal && Array.isArray(json.proposal.actions) && json.proposal.actions.length > 0) {
        _pendingFileProposal = { proposal: json.proposal, source: json.source || { type: file.type, name: file.name } };
        _appendText(msgs, json.proposal.summary || _t('fileAgentFound', { n: json.proposal.actions.length }), 'chat-msg bot');
        _persistAssistantMessage(json.proposal.summary || _t('fileAgentFound', { n: json.proposal.actions.length }));
        try {
          if (window.TaskFlowAIAgentRuntime && typeof window.TaskFlowAIAgentRuntime.handleExternalProposal === 'function') {
            window.TaskFlowAIAgentRuntime.handleExternalProposal(json.proposal, { source: 'file', fileName: json.source && json.source.name, fileMime: json.source && json.source.type });
          }
        } catch (e) { /* review must never break chat */ }
      } else if (isFileAgent && json.proposal && json.proposal.actions && json.proposal.actions.length === 0) {
        _appendText(msgs, json.proposal.summary || _t('fileAgentNoActions'), 'chat-msg bot');
        _persistAssistantMessage(json.proposal.summary || _t('fileAgentNoActions'));
      } else {
        _appendText(msgs, json.answer || '', 'chat-msg bot');
        _persistAssistantMessage(json.answer || '');
      }
    } catch (e) {
      _setFileLoading(file.name, false);
      if (e && e.name === 'AbortError') return;
      var errMsg = (e && e.code === 'api-config-missing') ? _t('chatErrorApiConfig') : _t('fileFailed');
      _appendText(msgs, errMsg, 'chat-msg bot');
    } finally {
      if (_isCurrentRequest(req.generation)) {
        _inFlight = false;
        _activeRequest = null;
      }
      _setInputEnabled(true);
      _setSendMode(false);
      _clearFileAttachment();
      var input = _el('chatInput');
      if (input) input.focus();
    }
  }

  /* Override doChatSend to check for attached file */
  var _origDoChatSend = doChatSend;
  doChatSend = function () {
    // If a request is active, this becomes the Stop action
    if (_inFlight && _activeRequest) {
      stopActiveResponse();
      return;
    }
    var input = _el('chatInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text && !_attachedFile) return;
    input.value = '';
    if (_attachedFile) {
      _sendWithFile(text || _t('fileChipSummary'), _attachedFile);
    } else {
      _doSend(text);
    }
  };

  /* ---- Initialize file attachment handlers ---- */
  var _fileInited = false;
  function _initFileAttachment() {
    if (_fileInited) return;
    var attachBtn = _el('chatAttachBtn');
    var fileInput = _el('chatFileInput');
    if (!attachBtn || !fileInput) return;
    attachBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) {
        _handleFileSelect(fileInput.files[0]);
      }
    });
    _fileInited = true;
  }
  _initFileAttachment();

  /* ---- Initialize history drawer ---- */
  function _initHistoryDrawer() {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
    var historyBtn = document.querySelector('[data-action="chat-history"]');
    if (historyBtn) {
      historyBtn.addEventListener('click', toggleHistory);
    }
    var newChatBtn = document.querySelector('[data-action="chat-new"]');
    if (newChatBtn) {
      newChatBtn.addEventListener('click', newConversation);
    }
    // Close drawer when clicking outside
    var drawer = _el('chatHistoryDrawer');
    if (drawer) {
      drawer.addEventListener('click', function (e) {
        if (e.target === drawer) {
          closeHistory({ focusTrigger: false });
        }
      });
    }
  }
  _initHistoryDrawer();

  /* ---- Listen for account changes ---- */
  function _onAccountChange() {
    _captureConversationView();
    stopActiveResponse();
    _clearFileAttachment();
    _accountScope = null; // Force re-detection
    _activeConversationId = null;
    var mod = _getHistory();
    if (mod) mod.setActiveConversation(_getAccountScope(), '');
    _renderWelcome();
    _setChipsVisible(true);
    _setContextBadge(null);
    _restoreConversationView(null);
    closeHistory({ focusTrigger: false });
  }

  return {
    SUGGESTIONS: SUGGESTIONS,
    doChatSend: doChatSend,
    doChatSuggest: doChatSuggest,
    doChatClear: doChatClear,
    newConversation: newConversation,
    openConversation: openConversation,
    deleteConversation: deleteConversation,
    clearAllHistory: clearAllHistory,
    toggleHistory: toggleHistory,
    closeHistory: closeHistory,
    stopActiveResponse: stopActiveResponse,
    classifyFileIntent: classifyFileIntent,
    _doSend: _doSend,
    _hasToken: _hasToken,
    _isOnline: _isOnline,
    _setContextBadge: _setContextBadge,
    _getApiBase: _getApiBase,
    _callChatAPI: _callChatAPI,
    _mapError: _mapError,
    _onAccountChange: _onAccountChange,
    _captureConversationView: _captureConversationView,
    _restoreConversationView: _restoreConversationView,
    _setHistoryOpen: _setHistoryOpen,
  };
});
