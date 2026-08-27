// TaskFlow — Trợ lý TaskFlow (Gemini Chat, Phase 2 + Phase 3B context).
// Gửi tin nhắn → POST /api/ai/chat → backend gọi Gemini → trả lời thật.
// Phase 3B: với câu hỏi về dữ liệu TaskFlow, client gửi taskflowContext
// (envelope an toàn từ TaskFlowChatContextProvider — READ-ONLY; Reflection
// và Mood chỉ có sau opt-in tường minh). Câu hỏi chung KHÔNG gửi context. Mọi lỗi context đều
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

  /* ---- Continuation join helper (Phase 7) ---- */
  /* Removes suffix/prefix overlap between two consecutive assistant fragments.
   Conservative: only trims clear sentence-level overlap, never rewrites content. */
  function joinContinuation(prev, cont) {
    if (!prev) return cont || '';
    if (!cont) return prev || '';
    // Try overlap at increasing suffix lengths of prev vs prefix of cont
    var maxCheck = Math.min(prev.length, cont.length, 500);
    for (var len = maxCheck; len >= 3; len--) {
      var suffix = prev.slice(prev.length - len);
      if (cont.indexOf(suffix) === 0) {
        return prev + cont.slice(len);
      }
    }
    return prev + cont;
  }

  /* ---- State ---- */
  var _inFlight = false;
  var _pendingContinuation = null;  // { generation, partialAnswer, lastBotEl }
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

  function _persistUserMessage(text, attachments) {
    var mod = _getHistory();
    if (!mod) return;
    var conv = _ensureConversation();
    if (!conv) return;
    var normalized = Array.isArray(attachments) ? attachments.slice(0, 5) : (attachments ? [attachments] : []);
    mod.addMessage(_getAccountScope(), conv.id, {
      role: 'user',
      content: text,
      attachment: normalized[0] || null,
      attachments: normalized
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

  /* Update the last assistant message in history (for continuation merge). */
  function _updateLastAssistantMessage(text) {
    var mod = _getHistory();
    if (!mod) return;
    var conv = _getActiveConversation();
    if (!conv) return;
    if (typeof mod.updateLastMessage === 'function') {
      mod.updateLastMessage(_getAccountScope(), conv.id, 'assistant', text);
    } else {
      // Fallback: append if update API unavailable
      mod.addMessage(_getAccountScope(), conv.id, { role: 'assistant', content: text });
    }
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
    _pendingContinuation = null;
    _removeContinueButton();
    // Remove typing indicator
    var typingEl = document.querySelector('.chat-typing');
    if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    // Re-enable input
    _setInputEnabled(true);
    _setAttachmentControlsDisabled(false);
    _setSendMode(false);
    var msgs = _el('chatMessages');
    if (msgs) {
      _appendMessage(msgs, _t('chatStopped'), 'bot chat-stopped');
    }
    var input = _el('chatInput');
    _resizeComposer(input);
    _syncComposerState();
    _setContextStatus('idle', []);
    if (input) input.focus();
    return true;
  }

  function _setSendMode(isStopping) {
    var sendBtn = document.querySelector('[data-action="chat-send"]');
    if (!sendBtn) return;
    var marker = sendBtn.querySelector('[data-chat-send-marker]') || sendBtn.firstElementChild;
    if (marker && !marker.hasAttribute('data-chat-send-marker')) {
      marker.setAttribute('data-chat-send-marker', '');
    }
    if (isStopping) {
      if (marker) marker.textContent = '■';
      sendBtn.setAttribute('aria-label', _t('chatStopAria'));
      sendBtn.classList.add('chat-send--stopping');
      sendBtn.disabled = false;
    } else {
      if (marker) marker.textContent = '↑';
      sendBtn.setAttribute('aria-label', _t('chatSendAria'));
      sendBtn.classList.remove('chat-send--stopping');
      _syncComposerState();
    }
  }

  /* ---- i18n helpers ---- */
  function _t(key, vars) {
    try { return (window.TaskFlowI18N && window.TaskFlowI18N.t) ? window.TaskFlowI18N.t(key, vars) : key; }
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

  /* ---- Suggestion chips mapping (replaces legacy study-plan topics) ---- */
  var SUGGESTIONS = {
    'plan-today': { labelKey: 'chatSuggestPlanToday', promptKey: 'chatSuggestPlanTodayPrompt' },
    'priority-work': { labelKey: 'chatSuggestPriority', promptKey: 'chatSuggestPriorityPrompt' },
    'week-summary': { labelKey: 'chatSuggestWeek', promptKey: 'chatSuggestWeekPrompt' },
  };

  /* ---- Safe text rendering ---- */
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
    _appendMessage(container, text, 'bot chat-info');
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

  /* ---- Show retry button (optionally with countdown) ---- */
  function _showRetry(container, failedMsg, mappedErrorText, retryAfterSeconds) {
    var wrap = document.createElement('div');
    wrap.className = 'chat-msg bot chat-retry-wrap';
    var p = document.createElement('p');
    p.textContent = mappedErrorText || _t('chatErrorMsg');
    wrap.appendChild(p);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-retry-btn';
    var retryTimer = null;
    function _doRetry() {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (failedMsg) _doSend(failedMsg, { userBubble: false, persistUser: false });
    }
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      var remaining = Math.ceil(retryAfterSeconds);
      btn.disabled = true;
      btn.textContent = _t('chatRetryIn', { seconds: remaining });
      retryTimer = setInterval(function () {
        remaining--;
        if (remaining <= 0) {
          if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
          btn.disabled = false;
          btn.textContent = _t('chatRetry');
        } else {
          btn.textContent = _t('chatRetryIn', { seconds: remaining });
        }
      }, 1000);
      btn.addEventListener('click', _doRetry);
    } else {
      btn.textContent = _t('chatRetry');
      btn.addEventListener('click', _doRetry);
    }
    wrap.appendChild(btn);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  /* ---- Continue button (Phase 7) ---- */
  function _showContinueButton(container) {
    var wrap = document.createElement('div');
    wrap.className = 'chat-msg bot chat-continue-wrap';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-retry-btn';
    btn.textContent = _t('chatContinue');
    btn.addEventListener('click', function () {
      if (_pendingContinuation) _doContinue();
    });
    wrap.appendChild(btn);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function _removeContinueButton() {
    var wrap = document.querySelector('.chat-continue-wrap');
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
  }

  async function _doContinue() {
    if (!_pendingContinuation || _inFlight) return;
    var pc = _pendingContinuation;
    _pendingContinuation = null;
    _removeContinueButton();

    var msgs = _el('chatMessages');
    if (!msgs) return;

    _inFlight = true;
    _setInputEnabled(false);
    _setSendMode(true);
    _removeContinueButton();
    var typingEl = _showTyping(msgs);
    var req = _startRequest('continue');

    try {
      var apiBase = _getApiBase();
      if (!apiBase) throw { code: 'api-config-missing' };
      var token = null;
      try { token = localStorage.getItem('planner-token'); } catch (e) { /* */ }
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      var res = await fetch(apiBase + '/api/ai/chat/continue', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          partialAnswer: pc.partialAnswer,
          history: pc.history,
        }),
        signal: req.signal,
      });
      var json;
      try { json = await res.json(); } catch (e) { json = null; }

      if (!_isCurrentRequest(req.generation)) return;
      _removeTyping(typingEl);

      if (!res.ok || !json || !json.ok) {
        var errCode = (json && json.error) || 'network';
        throw { code: errCode, status: res.status };
      }

      var merged = joinContinuation(pc.partialAnswer, json.answer);
      if (pc.lastBotEl) {
        var body = pc.lastBotEl.querySelector('.chat-msg-body');
        if (body) body.textContent = merged;
      }
      // Update last assistant message in history instead of appending duplicate
      _updateLastAssistantMessage(merged);
      if (json.truncated) {
        _pendingContinuation = {
          generation: req.generation,
          partialAnswer: merged,
          history: pc.history,
          lastBotEl: pc.lastBotEl,
        };
        _showContinueButton(msgs, pc.lastBotEl);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return;
      }
      _removeTyping(typingEl);
      // Show error but preserve the partial answer already rendered
      var errMsg = _mapError(err);
      if (errMsg) {
        _appendMessage(msgs, errMsg, 'bot');
      }
      // Re-show continue button so user can retry
      if (pc.lastBotEl) {
        _pendingContinuation = pc;
        _showContinueButton(msgs, pc.lastBotEl);
      }
    } finally {
      if (_isCurrentRequest(req.generation)) {
        _inFlight = false;
        _activeRequest = null;
      }
      _setInputEnabled(true);
      _setSendMode(false);
      var input = _el('chatInput');
      _resizeComposer(input);
      _syncComposerState();
      if (input) input.focus();
    }
  }

  /* ---- Update input enabled/disabled state ---- */
  function _setInputEnabled(enabled) {
    var input = _el('chatInput');
    if (input) input.disabled = !enabled;
  }

  function _renderSuggestions(mode) {
    var actions = _el('chatActions');
    if (!actions) return;
    while (actions.firstChild) actions.removeChild(actions.firstChild);
    if (mode === 'initial') {
      Object.keys(SUGGESTIONS).forEach(function (topic) {
        var suggestion = SUGGESTIONS[topic];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chat-chip';
        btn.setAttribute('data-action', 'chat-suggest');
        btn.setAttribute('data-topic', topic);
        btn.setAttribute('data-i18n', suggestion.labelKey);
        btn.textContent = _t(suggestion.labelKey);
        actions.appendChild(btn);
      });
    }
  }

  /* ---- Hide suggestion chips during active chat ---- */
  function _setChipsVisible(visible) {
    _renderSuggestions(visible ? 'initial' : 'hidden');
  }

  /* ---- Multiline composer ---- */
  function _shouldSubmitComposer(event) {
    return !!event && event.key === 'Enter' && !event.shiftKey && !event.isComposing;
  }

  function _resizeComposer(textarea) {
    if (!textarea || !textarea.style) return;
    textarea.style.height = 'auto';
    // A flex item with height:auto can stretch to the composer's available
    // height before scrollHeight is read. Collapse it for an intrinsic measure.
    textarea.style.height = '0px';
    textarea.style.height = Math.min(textarea.scrollHeight || 0, 112) + 'px';
  }

  function _syncComposerState() {
    var input = _el('chatInput');
    var send = document.querySelector('[data-action="chat-send"]');
    var hasPayload = !!(input && String(input.value || '').trim()) || _attachedFiles.length > 0;
    if (send) send.disabled = !_inFlight && !hasPayload;
    var composer = _el('chatComposer');
    if (composer) composer.setAttribute('aria-busy', String(_inFlight));
  }

  var _composerInited = false;
  function _initComposer() {
    if (_composerInited) return;
    var input = _el('chatInput');
    if (!input) return;
    input.addEventListener('input', function () {
      _resizeComposer(input);
      _syncComposerState();
    });
    input.addEventListener('keydown', function (event) {
      if (!_shouldSubmitComposer(event)) return;
      event.preventDefault();
      doChatSend();
    });
    _composerInited = true;
    _resizeComposer(input);
    _syncComposerState();
  }

  /* ---- Truthful context-use status ---- */
  function _contextKeysFromEnvelope(envelope) {
    var data = envelope && envelope.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
    var has = function (key) { return Object.prototype.hasOwnProperty.call(data, key); };
    var keys = [];
    if (has('tasks')) keys.push('tasks');
    if (has('projects') || has('milestones')) keys.push('projects');
    if (has('timeblocks') || has('busy') || has('schedule')) keys.push('schedule');
    if (has('habits')) keys.push('habits');
    if (has('reflections')) keys.push('reflections');
    if (has('mood')) keys.push('mood');
    return keys;
  }

  function _setContextStatus(state, keys) {
    var status = _el('chatContextStatus');
    var badge = _el('chatContextBadge');
    var copy = status && status.querySelector ? status.querySelector('[data-chat-context-copy]') : null;
    var safeKeys = Array.isArray(keys) ? keys.slice() : [];
    var labels = safeKeys.map(function (key) {
      var suffix = key.charAt(0).toUpperCase() + key.slice(1);
      return _t('chatContextCategory' + suffix);
    });
    var categories = labels.join(', ');
    var copyKey = {
      preparing: 'chatContextPreparing',
      using: categories ? 'chatContextUsing' : 'chatContextNoData',
      used: categories ? 'chatContextUsed' : 'chatContextNoData',
      error: 'chatContextError',
      idle: 'chatContextIdle',
    }[state] || 'chatContextIdle';
    if (status) status.setAttribute('data-context-state', state || 'idle');
    if (copy) copy.textContent = _t(copyKey, { categories: categories });
    if (badge) {
      badge.textContent = categories;
      badge.hidden = !categories;
      badge.title = categories ? _t('chatContextBadgeTitle') : '';
    }
  }

  /* Legacy public helper retained for compatibility; new requests use envelope categories. */
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
  async function _callChatAPI(message, history, signal, opts) {
    opts = opts || {};
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
    try {
      if (window.TaskFlowChatContextProvider && window.TaskFlowChatContextProvider.prepare) {
        var ctxRes = window.TaskFlowChatContextProvider.prepare(message);
        if (ctxRes && ctxRes.ok && ctxRes.envelope) {
          taskflowContext = ctxRes.envelope;
        }
      }
    } catch (e) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[chat-context] prepare-failed (' + (e && e.name ? e.name : 'exception') + ')');
      }
    }
    var body = { message: message, history: history };
    if (taskflowContext) body.taskflowContext = taskflowContext;
    if (opts.documentContext) body.documentContext = opts.documentContext;
    var contextKeys = _contextKeysFromEnvelope(taskflowContext);

    // P10: ?debug=1 safe diagnostics — URL resolution only, never token/body/context.
    var debugLog = typeof location !== 'undefined' && /[?&]debug=1/.test(location.search);
    if (debugLog && typeof console !== 'undefined' && console.log) {
      console.log('[chat] api-base=' + apiBase);
      console.log('[chat] request=/api/ai/chat');
    }

    _setContextStatus('using', contextKeys);
    var res = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: signal,
    });

    var json;
    try { json = await res.json(); } catch (e) { json = null; }

    if (!res.ok || !json || !json.ok) {
      _setContextStatus('error', []);
      var errCode = (json && json.error) || 'network';
      var rateLimit = json && json.rateLimit && typeof json.rateLimit === 'object' ? json.rateLimit : undefined;
      throw { code: errCode, status: res.status, rateLimit: rateLimit || undefined };
    }

    _setContextStatus('used', contextKeys);
    return { answer: json.answer, truncated: !!json.truncated };
  }

  /* ---- Error message mapping ---- */
  function _mapError(err) {
    if (err && err.name === 'AbortError') return null; // user stopped — no error
    var code = err && err.code ? err.code : 'network';
    // Distinguish provider vs local rate limit
    if (code === 'ai-rate-limited') {
      var rl = err && err.rateLimit;
      if (rl && rl.source === 'taskflow') return _t('chatErrorLocalRateLimited');
      return _t('chatErrorRateLimited');
    }
    switch (code) {
      case 'ai-not-configured': return _t('chatErrorNotConfigured');
      case 'ai-timeout': return _t('chatErrorTimeout');
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

  /* ---- Document-aware intent detection (Phase 8) ---- */
  function _isDocumentQuestion(text) {
    if (!text) return false;
    // Explicit document references (with and without diacritics)
    if (/(?:tài\s+liệu|tai\s+lieu|document|pdf|file).{0,30}(?:này|nay|đang|dang|đã|da|đính\s+gắn|dinh\s+gan|upload|tải|tai)/i.test(text)) return true;
    if (/(?:này|nay|đang|dang).{0,20}(?:nói|noi|đề\s+cập|de\s+cap|đang|dang|hướng\s+đến)/i.test(text) && /(?:tài\s+liệu|tai\s+lieu|document|roadmap|kế\s+hoạch|ke\s+hoach|lộ\s+trình|lo\s+trinh)/i.test(text)) return true;
    // Summarize/explain document
    if (/(?:tóm\s+tắt|tom\s+tat|summarize|summary|tổng\s+hợp|tong\s+hop).{0,40}(?:tài\s+liệu|tai\s+lieu|document|pdf|này|nay)/i.test(text)) return true;
    if (/(?:giải\s+thích|giai\s+thich|explain).{0,40}(?:phần|phan|chương|chuong|chapter|section|topic|phương).{0,40}(?:trong|cua|từ|tu).{0,30}(?:tài\s+liệu|tai\s+lieu|document|pdf)/i.test(text)) return true;
    // Week-specific questions about the roadmap
    if (/(?:tuần|tuan)\s+\d+.{0,30}(?:học|hoc|làm|lam|nội\s+nội|noi\s+dung|chương\s+trình|chuong\s+trinh|gì|gi)/i.test(text)) return true;
    if (/\d+.{0,10}(?:week|tuần|tuan).{0,30}(?:learn|study|học|hoc|làm|lam|gì|gi)/i.test(text)) return true;
    // Goals/structure of the document/roadmap
    if (/(?:mục\s+tiêu|muc\s+tieu|goal|objective).{0,30}(?:của|cua|trong).{0,30}(?:roadmap|lộ\s+trình|lo\s+trinh|kế\s+hoạch|ke\s+hoach|tài\s+liệu|tai\s+lieu)/i.test(text)) return true;
    return false;
  }

  function _getDocumentContext() {
    try {
      var planner = window.TaskFlowDocumentDailyPlan;
      if (!planner || typeof planner.getActiveRoadmap !== 'function') return null;
      var active = planner.getActiveRoadmap();
      if (!active || !active.roadmap) return null;
      var status = typeof planner.getStatus === 'function' ? planner.getStatus() : null;
      // Minimize data: only send roadmap phases + title + totalWeeks + cursor
      var roadmapBrief = {
        title: active.roadmap.title || '',
        totalWeeks: active.roadmap.totalWeeks || null,
        phases: (active.roadmap.phases || []).map(function (p) {
          return {
            name: p.name || '',
            weeks: p.weeks || null,
            goals: (p.goals || []).slice(0, 5),
            deliverables: (p.deliverables || []).slice(0, 5),
            topics: (p.topics || []).slice(0, 10)
          };
        })
      };
      return {
        roadmap: roadmapBrief,
        documentName: active.documentName || 'document',
        totalWeeks: active.roadmap.totalWeeks || null,
        cursor: active.cursor || {}
      };
    } catch (e) { return null; }
  }

  /* ---- Routing: should this message go to AI Brain? ---- */
  function _shouldUseBrain(text, intent) {
    if (!text) return false;
    // Greetings and social chat → normal chat API
    var t = text.trim();
    if (/^(hi|hello|chào|xin chào|hey|yo|ok|thanks|cảm ơn|tạm biệt|bye)\b/i.test(t)) return false;
    // Clarify → deterministic path (not Brain)
    if (intent && intent.kind === 'clarify') return false;
    // Document plan requests → deterministic path
    if (_isDocumentPlanRequest(text)) return false;
    // Action intents (create/complete/reschedule) → Brain
    if (intent && intent.kind === 'agent') return true;
    // Read-only TaskFlow queries → Brain
    if (/(?:task|công việc|việc|roadmap|lộ trình|kế hoạch|tuần|ngày|hôm nay|tuần này|bao nhiêu|rảnh|deadline|đến hạn)/i.test(t)) return true;
    // Action verbs → Brain
    if (/(?:tạo|thêm|xóa|sửa|hoàn thành|chuyển|dời|lập lịch|xếp|lên lịch)/i.test(t)) return true;
    return false;
  }

  function _isDocumentPlanRequest(text) {
    if (/(?:tuần\s+tiếp|next\s+week|tuần\s+tiếp\s+theo|lập\s+tuần\s+tiếp)/i.test(text || '')) return true;
    try {
      if (window.TaskFlowAIIntent && typeof window.TaskFlowAIIntent.isDocumentPlanIntent === 'function') {
        return window.TaskFlowAIIntent.isDocumentPlanIntent(text);
      }
      if (window.TaskFlowAIIntent && typeof window.TaskFlowAIIntent.classifyFileIntent === 'function') {
        return window.TaskFlowAIIntent.classifyFileIntent(text, true).kind === 'document-daily-plan';
      }
    } catch (e) { /* deterministic fallback below */ }
    return /(?:lập|tạo|chia).{0,80}(?:kế\s+hoạch\s+học|từng\s+ngày|mỗi\s+ngày|7\s+ngày).{0,80}(?:tài\s+liệu|pdf)|(?:tài\s+liệu|pdf).{0,80}(?:kế\s+hoạch\s+học|từng\s+ngày|mỗi\s+ngày|7\s+ngày)/i.test(text || '');
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
      _setContextStatus('error', []);
      _showInfo(msgs, _t('chatOffline'));
      return;
    }
    if (!_hasToken()) {
      _setContextStatus('error', []);
      _showGuestPrompt(msgs);
      return;
    }
    if (text.length > MAX_MSG_LEN) {
      _setContextStatus('error', []);
      _showInfo(msgs, _t('chatErrorTooLong'));
      return;
    }

    _setContextStatus('preparing', []);
    _inFlight = true;
    _setInputEnabled(false);
    _setChipsVisible(false);
    _setSendMode(true);

    if (opts.userBubble !== false) _appendMessage(msgs, text, 'user');

    // Persist user message to history (skip on retry to avoid duplication)
    if (opts.persistUser !== false) _persistUserMessage(text);

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
          _setContextStatus('idle', []);
          _removeTyping(typingEl);
          if (window.TaskFlowAIAgentRuntime && typeof window.TaskFlowAIAgentRuntime.showClarification === 'function') {
            window.TaskFlowAIAgentRuntime.showClarification(msgs, intent, function (selectedUid, selectedTask) {
              var _send = (typeof send === 'function') ? send : null;
              if (_send) _send(text, { userBubble: false, resolutionHint: { taskUid: selectedUid } });
            });
          } else {
            _appendMessage(msgs, _t('clarifyFallback'), 'bot');
          }
          return;
        }
        useAgent = (intent.kind === 'agent');
      } else {
        useAgent = !!(window.TaskFlowAIAgentRuntime && window.TaskFlowAIAgentRuntime.isActionIntent(text));
      }

      // Phase 8: Document-aware chat — detect BEFORE Brain and BEFORE
      // document-plan request so informational questions go to /api/ai/chat
      // with document context, while planning actions go to daily-plan.
      var documentContext = null;
      if (_isDocumentQuestion(text)) {
        documentContext = _getDocumentContext();
        if (!documentContext) {
          _removeTyping(typingEl);
          _appendMessage(msgs, _t('chatNoActiveDocument') || 'Bạn chưa có tài liệu đang hoạt động. Hãy đính kèm hoặc chọn một tài liệu.', 'bot');
          _persistAssistantMessage(_t('chatNoActiveDocument') || 'Bạn chưa có tài liệu đang hoạt động.');
          _setContextStatus('idle', []);
          return;
        }
        // Route document questions directly to chat with context — skip Brain
      } else if (_isDocumentPlanRequest(text)) {
        // Document-plan request without an attached file: reuse the saved
        // roadmap when possible; otherwise ask for the PDF.
        var planner = window.TaskFlowDocumentDailyPlan;
        var activePlan = planner && typeof planner.getActiveRoadmap === 'function'
          ? planner.getActiveRoadmap()
          : null;
        if (activePlan) {
          var planResult = await planner.runNextWindow(text, { signal: req.signal });
          _removeTyping(typingEl);
          if (planResult && planResult.ok && planResult.proposal && planResult.proposal.actions && planResult.proposal.actions.length > 0) {
            var planSummary = planResult.proposal.summary || ('Kế hoạch ' + (planResult.meta ? planResult.meta.daysGenerated : 7) + ' ngày — ' + planResult.proposal.actions.length + ' công việc');
            _appendMessage(msgs, planSummary, 'bot');
            _persistAssistantMessage(planSummary);
            planner.sendProposalToReview(planResult.proposal, { source: 'document-daily-plan', fileName: activePlan.documentName });
            _setContextStatus('idle', []);
            return;
          } else if (planResult && planResult.ok && planResult.proposal && Array.isArray(planResult.proposal.actions)) {
            var emptyPlanSummary = planResult.proposal.summary || _t('documentPlanNoNewTasks');
            _appendMessage(msgs, emptyPlanSummary, 'bot');
            _persistAssistantMessage(emptyPlanSummary);
            _setContextStatus('idle', []);
            return;
          } else {
            var failedPlanMessage = (planResult && planResult.code)
              ? (window.TaskFlowDocumentDailyPlan && window.TaskFlowDocumentDailyPlan.friendlyError
                ? window.TaskFlowDocumentDailyPlan.friendlyError(planResult.code)
                : (planResult.message || _t('documentPlanFailed')))
              : (planResult && planResult.message || _t('documentPlanFailed'));
            _appendMessage(msgs, failedPlanMessage, 'bot');
            _persistAssistantMessage(failedPlanMessage);
            _setContextStatus('error', []);
            return;
          }
        } else {
          _removeTyping(typingEl);
          var attachRequiredMessage = _t('documentPlanAttachRequired');
          _appendMessage(msgs, attachRequiredMessage, 'bot');
          _persistAssistantMessage(attachRequiredMessage);
          _setContextStatus('idle', []);
          return;
        }
      } else {
        // Try AI Brain for TaskFlow-specific queries and action intents
        var brainClient = window.TaskFlowAIBrainClient;
        if (brainClient && typeof brainClient.handleMessage === 'function' && _shouldUseBrain(text, intent)) {
          try {
            var brainResult = await brainClient.handleMessage(text, {
              signal: req.signal,
              history: _getProviderHistory(),
            });

            if (!_isCurrentRequest(req.generation)) return;
            _removeTyping(typingEl);

            if (brainResult && brainResult.ok) {
              if (brainResult.type === 'final' && brainResult.answer) {
                _appendMessage(msgs, brainResult.answer, 'bot');
                _persistAssistantMessage(brainResult.answer);
                _setContextStatus('idle', []);
                return;
              }
              if (brainResult.type === 'proposal' && brainResult.proposal) {
                var brainSummary = brainResult.proposal.summary || ('Kế hoạch — ' + (brainResult.proposal.actions ? brainResult.proposal.actions.length : 0) + ' hành động');
                _appendMessage(msgs, brainSummary, 'bot');
                _persistAssistantMessage(brainSummary);
                var _reviewResult = null;
                try {
                  if (window.TaskFlowAIAgentRuntime && typeof window.TaskFlowAIAgentRuntime.handleExternalProposal === 'function') {
                    _reviewResult = window.TaskFlowAIAgentRuntime.handleExternalProposal(brainResult.proposal, { source: 'ai-brain' });
                  }
                } catch (e) { /* review must never break chat */ }
                if (_reviewResult && !_reviewResult.ok) {
                  _appendMessage(msgs, _t('agentErrorReviewFailed') || _t('agentErrorServer'), 'bot');
                }
                _setContextStatus('idle', []);
                return;
              }
            }
            // Brain failed or returned tool_request without resolution — fall through to legacy
          } catch (e) {
            // Brain error — fall through to legacy
          }
        }
      }

      // Fallback: legacy agent or chat API
      // Skip agent path for document-aware questions (Phase 8)
      if (useAgent && !documentContext) {
        var agentRes = await window.TaskFlowAIAgentRuntime.handleAgent(text, _getProviderHistory(), msgs, { signal: req.signal, generation: req.generation });
        if (!_isCurrentRequest(req.generation)) return; // stale
        _removeTyping(typingEl);
        if (agentRes && agentRes.handled) {
          _setContextStatus('idle', []);
          var agentReply = (window.TaskFlowAIAgentRuntime.takeResult ? window.TaskFlowAIAgentRuntime.takeResult() : null) || agentRes.reply || null;
          if (agentReply) _persistAssistantMessage(agentReply);
          return;
        }
        throw { code: 'agent-unhandled' };
      }

      // Phase 9: Deterministic roadmap resolver — answer factual questions without AI call
      if (documentContext && documentContext.roadmap && window.TaskFlowRoadmapResolver) {
        var deterministicResult = window.TaskFlowRoadmapResolver.resolveRoadmapQuestion(
          text, documentContext.roadmap, documentContext.cursor
        );
        if (deterministicResult && deterministicResult.matched) {
          _removeTyping(typingEl);
          var detBotEl = _appendMessage(msgs, deterministicResult.answer, 'bot');
          _persistAssistantMessage(deterministicResult.answer);
          _setContextStatus('idle', []);
          return;
        }
      }

      var chatResult = await _callChatAPI(text, _getProviderHistory(), req.signal, {
        documentContext: documentContext
      });

      if (!_isCurrentRequest(req.generation)) return; // stale
      _removeTyping(typingEl);
      var botEl = _appendMessage(msgs, chatResult.answer, 'bot');
      _persistAssistantMessage(chatResult.answer);
      if (chatResult.truncated) {
        _pendingContinuation = {
          generation: req.generation,
          partialAnswer: chatResult.answer,
          history: _getProviderHistory(),
          lastBotEl: botEl,
        };
        _showContinueButton(msgs, botEl);
      }

    } catch (err) {
      if (err && err.name === 'AbortError') {
        // User stopped — typing already removed by stopActiveResponse
        _setContextStatus('idle', []);
        return;
      }
      _setContextStatus('error', []);
      _removeTyping(typingEl);
      var errMsg = _mapError(err);
      var retrySec = err && err.rateLimit && err.rateLimit.retryAfterSeconds;
      if (errMsg) _showRetry(msgs, text, errMsg, retrySec);
    } finally {
      if (_isCurrentRequest(req.generation)) {
        _inFlight = false;
        _activeRequest = null;
      }
      _setInputEnabled(true);
      _setSendMode(false);
      var input = _el('chatInput');
      _resizeComposer(input);
      _syncComposerState();
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
    _resizeComposer(input);
    _syncComposerState();
    _doSend(text);
  }

  function doChatSuggest(topic) {
    if (_inFlight && _activeRequest) {
      stopActiveResponse();
      return;
    }
    var sug = SUGGESTIONS[topic];
    if (sug && sug.promptKey) {
      var input = _el('chatInput');
      if (input) {
        input.value = '';
        _resizeComposer(input);
        _syncComposerState();
      }
      _doSend(_t(sug.promptKey));
    }
  }

  /** Clear conversation — reset to welcome state */
  function doChatClear() {
    stopActiveResponse();
    _clearFileAttachments();
    // Don't delete conversation from history — just reset the view
    _renderWelcome();
    _setChipsVisible(true);
    _setContextStatus('idle', []);
  }

  /** New conversation — keep a session-only draft until the first user message */
  function newConversation() {
    _captureConversationView();
    stopActiveResponse();
    _clearFileAttachments();
    _activeConversationId = null;
    var mod = _getHistory();
    if (mod) mod.setActiveConversation(_getAccountScope(), '');
    _renderWelcome();
    _setChipsVisible(true);
    _setContextStatus('idle', []);
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
    _clearFileAttachments();
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
      var role = m.role === 'user' ? 'user' : 'bot';
      _appendMessage(msgs, m.content, role);
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
  var _attachedFiles = [];
  var _fileObjectUrls = new Map();
  var _attachmentQueueVersion = 0;
  var _dragDepth = 0;
  var _pendingFileProposal = null;
  var _FILE_MAX_FILES = 5;
  var _FILE_MAX_BYTES = 15 * 1024 * 1024;
  var _FILE_MAX_TOTAL_BYTES = 30 * 1024 * 1024;
  var _ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown']);
  var _ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.txt', '.md']);

  function _fileKey(file) {
    return `${file.name}\u0000${file.size}\u0000${file.lastModified || 0}`;
  }

  function _mergeAttachmentCandidates(current, candidates) {
    var files = Array.isArray(current) ? current.slice() : [];
    var incoming = Array.isArray(candidates) ? candidates : Array.from(candidates || []);
    var rejected = [];
    var keys = new Set(files.map(_fileKey));
    var totalBytes = files.reduce(function (sum, file) {
      return sum + (Number.isFinite(file && file.size) && file.size > 0 ? file.size : 0);
    }, 0);

    incoming.forEach(function (file) {
      var name = String(file && file.name || '');
      var key = file ? _fileKey(file) : '';
      var supported = !!file && (_ALLOWED_TYPES.has(file.type) || /\.md$/i.test(name));
      var code = '';

      if (keys.has(key)) code = 'duplicate';
      else if (!supported) code = 'unsupported-type';
      else if (!Number.isFinite(file.size) || file.size <= 0) code = 'empty-file';
      else if (file.size > _FILE_MAX_BYTES) code = 'too-large';
      else if (files.length >= _FILE_MAX_FILES) code = 'too-many-files';
      else if (totalBytes + file.size > _FILE_MAX_TOTAL_BYTES) code = 'total-too-large';

      if (code) {
        rejected.push({ name: name, code: code });
        return;
      }
      files.push(file);
      keys.add(key);
      totalBytes += file.size;
    });

    return { files: files, rejected: rejected };
  }

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
    { key: 'fileChipPlan', prompt: 'Lập kế hoạch học từ tài liệu này', isAction: true, intentKind: 'document-daily-plan' },
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

  function _renderFileCards() {
    var card = _el('chatFileCard');
    if (!card) return;
    card.innerHTML = '';
    _attachedFiles.forEach(function (file) {
      var fileKey = _fileKey(file);
      var cardEl = document.createElement('div');
      cardEl.className = 'chat-file-card';
      cardEl.setAttribute('data-file-key', fileKey);

      var icon = document.createElement('span');
      icon.className = 'chat-file-card-icon';
      icon.textContent = _fileIcon(file.type);
      cardEl.appendChild(icon);

      var objectUrl = _fileObjectUrls.get(fileKey);
      if (file.type && file.type.startsWith('image/') && objectUrl) {
        var preview = document.createElement('img');
        preview.className = 'chat-file-preview';
        preview.src = objectUrl;
        preview.alt = '';
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
      removeBtn.setAttribute('aria-label', _t('chatRemoveFile', { name: file.name }));
      removeBtn.textContent = '×';
      removeBtn.disabled = _inFlight;
      removeBtn.addEventListener('click', function () { _removeAttachedFile(fileKey, true); });
      cardEl.appendChild(removeBtn);
      card.appendChild(cardEl);
    });

    _renderFileChips(_attachedFiles[0] && _attachedFiles[0].type);
  }

  function _renderFileCard() {
    _renderFileCards();
  }

  function _renderFileChips(mimeType) {
    var chipsEl = _el('chatFileChips');
    if (!chipsEl) return;
    chipsEl.innerHTML = '';
    if (!_attachedFiles.length) {
      chipsEl.hidden = true;
      return;
    }
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
        doChatSend({ fileIntentKind: c.intentKind });
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

  function _setAttachmentControlsDisabled(disabled) {
    var attachBtn = _el('chatAttachBtn');
    var fileInput = _el('chatFileInput');
    if (attachBtn) attachBtn.disabled = !!disabled;
    if (fileInput) fileInput.disabled = !!disabled;
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      document.querySelectorAll('.chat-file-card-remove').forEach(function (button) {
        button.disabled = !!disabled;
      });
    }
  }

  function _announceRejectedFiles(rejected) {
    if (!Array.isArray(rejected) || !rejected.length) return;
    var keyByCode = {
      duplicate: 'chatFileDuplicate',
      'unsupported-type': 'chatFileUnsupported',
      'too-large': 'chatFileTooLarge',
      'too-many-files': 'chatFileTooMany',
      'total-too-large': 'chatFilesTotalTooLarge'
    };
    var lines = rejected.map(function (item) {
      if (item.code === 'empty-file') return item.name + ': ' + _t('fileEmpty');
      return _t(keyByCode[item.code] || 'fileFailed', { name: item.name });
    });
    var message = lines.join(' ');
    var status = _el('chat-drop-status');
    if (status) status.textContent = message;
    var toast = window.TaskFlowUI && TaskFlowUI.toast;
    if (toast) toast(message, 'error');
  }

  function _announceAcceptedCount() {
    var status = _el('chat-drop-status');
    if (status) status.textContent = _attachedFiles.length ? _t('chatAcceptedCount', { count: _attachedFiles.length }) : '';
  }

  function _removeAttachedFile(fileKey, restoreFocus) {
    if (_inFlight) return;
    var index = _attachedFiles.findIndex(function (file) { return _fileKey(file) === fileKey; });
    if (index < 0) return;
    var objectUrl = _fileObjectUrls.get(fileKey);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    _fileObjectUrls.delete(fileKey);
    _attachedFiles = _attachedFiles.filter(function (file) { return _fileKey(file) !== fileKey; });
    _attachmentQueueVersion++;
    _renderFileCards();
    _announceAcceptedCount();
    _syncComposerState();
    if (restoreFocus) {
      var buttons = document.querySelectorAll('.chat-file-card-remove');
      var target = buttons[index] || buttons[index - 1] || _el('chatAttachBtn');
      if (target && typeof target.focus === 'function') target.focus();
    }
  }

  function _clearFileAttachments() {
    _fileObjectUrls.forEach(function (objectUrl) { URL.revokeObjectURL(objectUrl); });
    _fileObjectUrls.clear();
    _attachedFiles = [];
    _attachmentQueueVersion++;
    var fileInput = _el('chatFileInput');
    if (fileInput) fileInput.value = '';
    _renderFileCards();
    _announceAcceptedCount();
    _syncComposerState();
  }

  function _clearFileAttachment() {
    _clearFileAttachments();
  }

  function _handleFileSelect(candidates) {
    if (_inFlight) return;
    var candidateFiles = candidates && typeof candidates.length === 'number'
      ? Array.from(candidates)
      : (candidates ? [candidates] : []);
    var result = _mergeAttachmentCandidates(_attachedFiles, candidateFiles);
    result.files.forEach(function (file) {
      var key = _fileKey(file);
      if (file.type && file.type.startsWith('image/') && !_fileObjectUrls.has(key)) {
        _fileObjectUrls.set(key, URL.createObjectURL(file));
      }
    });
    if (result.files.length !== _attachedFiles.length) _attachmentQueueVersion++;
    _attachedFiles = result.files;
    _renderFileCards();
    if (result.rejected.length) _announceRejectedFiles(result.rejected);
    else _announceAcceptedCount();
    _syncComposerState();
  }

  function _resetFileDragState() {
    _dragDepth = 0;
    var panel = _el('chatPop');
    if (panel) panel.removeAttribute('data-drop-active');
  }

  /* ---- Phase 6D: File intent detection ---- */
  function classifyFileIntent(text) {
    try {
      if (window.TaskFlowAIIntent && typeof window.TaskFlowAIIntent.classifyFileIntent === 'function') {
        return window.TaskFlowAIIntent.classifyFileIntent(text, true);
      }
    } catch (e) { /* deterministic fallback below */ }
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
    var studyPlanPattern = /(?:kế\s+hoạch\s+học|lộ\s+trình\s+học|study\s+plan|learning\s+plan)/i;
    var flowVerbs = /(?:đưa\\s+(?:toàn\\s+bộ|tất\\+cả|vào)|đưa\\s+vào\\s+taskflow|vào\\s+taskflow|import\\s+to\\s+taskflow)/i;

    var hasCreateVerb = createVerbs.test(t);
    var hasTaskNoun = taskNouns.test(t);
    var hasPlanNoun = planNouns.test(t);
    var hasDayPattern = dayPattern.test(t);
    var hasFlowVerb = flowVerbs.test(t);

    if (hasFlowVerb) {
      return { kind: 'import-plan', confidence: 'high', reason: 'import-to-taskflow' };
    }
    if ((hasDayPattern || studyPlanPattern.test(t)) && (hasCreateVerb || hasPlanNoun)) {
      return { kind: 'document-daily-plan', confidence: 'high', reason: 'daily-plan-from-document' };
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
    return { kind: 'read', confidence: 'high', reason: 'no-action-signal' };
  }

  function _isFileAgentIntent(text) {
    var intent = classifyFileIntent(text);
    return intent.kind !== 'read';
  }

  function _resolveFileIntent(text, explicitKind) {
    if (explicitKind === 'document-daily-plan') {
      return { kind: 'document-daily-plan', confidence: 'high', reason: 'explicit-file-chip' };
    }
    return classifyFileIntent(text);
  }

  async function _sendWithFile(text, explicitIntentKind) {
    if (_inFlight || !_attachedFiles.length) return;
    var requestFiles = _attachedFiles.slice();
    var requestQueueVersion = _attachmentQueueVersion;
    var requestSucceeded = false;

    var msgs = _el('chatMessages');
    if (!msgs) return;
    if (!_isOnline()) {
      _setContextStatus('error', []);
      _showInfo(msgs, _t('chatOffline'));
      return;
    }
    if (!_hasToken()) {
      _setContextStatus('error', []);
      _showGuestPrompt(msgs);
      return;
    }
    var apiBase = _getApiBase();
    if (!apiBase) {
      _setContextStatus('error', []);
      _showInfo(msgs, _t('chatErrorApiConfig'));
      return;
    }

    var fileIntent = _resolveFileIntent(text, explicitIntentKind);
    var isFileDailyPlan = fileIntent.kind === 'document-daily-plan';
    var isFileAgent = fileIntent.kind !== 'read' && !isFileDailyPlan;
    var endpoint = isFileAgent ? '/api/ai/file-agent' : '/api/ai/file';

    _setContextStatus('preparing', []);
    _inFlight = true;
    _setInputEnabled(false);
    _setAttachmentControlsDisabled(true);
    _setChipsVisible(false);
    _setSendMode(true);

    // Start request lifecycle
    var req = _startRequest(isFileDailyPlan ? 'document-daily-plan' : (isFileAgent ? 'file-agent' : 'file'));

    try {
      var fileLabel = requestFiles.map(function (file) {
        return _fileIcon(file.type) + ' ' + file.name + ' (' + _formatFileSize(file.size) + ')';
      }).join('\n');
      _appendMessage(msgs, text + '\n' + fileLabel, 'user');
      _setFileLoading(requestFiles[0].name, true);

      var fileContextEnvelope = null;
      var fileContextKeys = [];
      var json = null;
      var responseOk = false;

      if (isFileDailyPlan) {
        var dailyPlanner = window.TaskFlowDocumentDailyPlan;
        if (!dailyPlanner || typeof dailyPlanner.runInitialDocumentPlan !== 'function') {
          json = { ok: false, error: 'ai-document-plan-module-missing' };
        } else {
          _setContextStatus('using', []);
          json = await dailyPlanner.runInitialDocumentPlan(requestFiles, text, { signal: req.signal });
        }
        responseOk = !!(json && json.ok);
      } else {
        var fd = new FormData();
        requestFiles.forEach(function (file) {
          fd.append('files', file, file.name);
        });
        fd.append('message', text);

        if (isFileAgent) {
          try {
            var ctxProvider = window.TaskFlowChatContextProvider;
            if (ctxProvider && typeof ctxProvider.prepare === 'function') {
              var ctxResult = ctxProvider.prepare(text);
              if (ctxResult && ctxResult.ok && ctxResult.envelope) {
                fileContextEnvelope = ctxResult.envelope;
                fd.append('taskflowContext', JSON.stringify(ctxResult.envelope.data || {}));
              }
            }
          } catch (e) { /* context must never break file send */ }
        }

        var token = null;
        try { token = localStorage.getItem('planner-token'); } catch (e) { /* */ }
        var headers = {};
        if (token) headers['Authorization'] = 'Bearer ' + token;

        fileContextKeys = _contextKeysFromEnvelope(fileContextEnvelope);
        _setContextStatus('using', fileContextKeys);
        var resp = await fetch(apiBase + endpoint, {
          method: 'POST',
          headers: headers,
          body: fd,
          signal: req.signal,
        });
        try { json = await resp.json(); } catch (e) { json = null; }
        responseOk = !!(resp.ok && json && json.ok);
      }

      if (!_isCurrentRequest(req.generation)) return;

      _setFileLoading(requestFiles[0].name, false);

      if (!responseOk) {
        _setContextStatus('error', []);
        var errorCode = (json && typeof (json.error || json.code) === 'string') ? (json.error || json.code) : 'ai-file-processing-failed';
        var fileErrMsg;
        try {
          var Review = window.TaskFlowAIReview;
          fileErrMsg = Review && typeof Review.friendlyError === 'function'
            ? Review.friendlyError(errorCode, window.TaskFlowI18n && typeof window.TaskFlowI18n.getLang === 'function' ? window.TaskFlowI18n.getLang() : 'vi')
            : _t('fileFailed');
        } catch (e) { fileErrMsg = _t('fileFailed'); }
        _appendMessage(msgs, fileErrMsg, 'bot');
        _persistAssistantMessage(fileErrMsg);
        return;
      }

      _setContextStatus('used', fileContextKeys);
      if (Array.isArray(json.rejectedFiles) && json.rejectedFiles.length) {
        _announceRejectedFiles(json.rejectedFiles);
      }
      var acceptedFiles = Array.isArray(json.files) && json.files.length
        ? json.files.map(function (accepted) {
          return { type: accepted.type || '', name: accepted.name || '', size: accepted.size || 0 };
        })
        : requestFiles.map(function (accepted) {
          return { type: accepted.type || '', name: accepted.name || '', size: accepted.size || 0 };
        });
      _persistUserMessage(text + '\n' + fileLabel, acceptedFiles);
      requestSucceeded = true;
      // P1: roadmap persistence lives in runInitialDocumentPlan; chat only renders and opens Review.
      if (isFileDailyPlan && json.ok && json.proposal && Array.isArray(json.proposal.actions) && json.proposal.actions.length > 0) {
        try {
          var summaryText = json.proposal.summary || ('Kế hoạch ' + (json.meta ? json.meta.daysGenerated : 7) + ' ngày — ' + json.proposal.actions.length + ' công việc');
          _appendMessage(msgs, summaryText, 'bot');
          _persistAssistantMessage(summaryText);
          window.TaskFlowDocumentDailyPlan.sendProposalToReview(json.proposal, { source: 'document-daily-plan', fileName: json.documentName });
        } catch (e) { /* review must never break chat */ }
      } else if (isFileDailyPlan && json.ok && json.proposal && json.proposal.actions && json.proposal.actions.length === 0) {
        _appendMessage(msgs, 'Không tìm thấy kế hoạch đủ rõ để chia thành lịch hằng ngày.', 'bot');
        _persistAssistantMessage('Không tìm thấy kế hoạch đủ rõ để chia thành lịch hằng ngày.');
      } else if (isFileAgent && json.proposal && Array.isArray(json.proposal.actions) && json.proposal.actions.length > 0) {
        _pendingFileProposal = { proposal: json.proposal, source: json.source || acceptedFiles[0] || {} };
        _appendMessage(msgs, json.proposal.summary || _t('fileAgentFound', { n: json.proposal.actions.length }), 'bot');
        _persistAssistantMessage(json.proposal.summary || _t('fileAgentFound', { n: json.proposal.actions.length }));
        try {
          if (window.TaskFlowAIAgentRuntime && typeof window.TaskFlowAIAgentRuntime.handleExternalProposal === 'function') {
            var _proposalResult = window.TaskFlowAIAgentRuntime.handleExternalProposal(json.proposal, { source: 'file', fileName: json.source && json.source.name, fileMime: json.source && json.source.type });
            if (_proposalResult && !_proposalResult.ok && _proposalResult.code === 'exception') {
              _appendMessage(msgs, _t('agentErrorReviewFailed') || _t('agentErrorServer'), 'bot');
            }
          }
        } catch (e) { /* review must never break chat */ }
      } else if (isFileAgent && json.proposal && json.proposal.actions && json.proposal.actions.length === 0) {
        _appendMessage(msgs, json.proposal.summary || _t('fileAgentNoActions'), 'bot');
        _persistAssistantMessage(json.proposal.summary || _t('fileAgentNoActions'));
      } else {
        _appendMessage(msgs, json.answer || '', 'bot');
        _persistAssistantMessage(json.answer || '');
      }
    } catch (e) {
      _setFileLoading(requestFiles[0].name, false);
      if (e && e.name === 'AbortError') {
        _setContextStatus('idle', []);
        return;
      }
      _setContextStatus('error', []);
      var errMsg = (e && e.code === 'api-config-missing') ? _t('chatErrorApiConfig') : _t('fileFailed');
      _appendMessage(msgs, errMsg, 'bot');
    } finally {
      if (_isCurrentRequest(req.generation)) {
        _inFlight = false;
        _activeRequest = null;
        _setInputEnabled(true);
        _setAttachmentControlsDisabled(false);
        _setSendMode(false);
        if (requestSucceeded && requestQueueVersion === _attachmentQueueVersion) {
          _clearFileAttachments();
        }
        var input = _el('chatInput');
        _resizeComposer(input);
        _syncComposerState();
        if (input) input.focus();
      }
    }
  }

  /* Override doChatSend to check for attached file */
  var _origDoChatSend = doChatSend;
  doChatSend = function (options) {
    // If a request is active, this becomes the Stop action
    if (_inFlight && _activeRequest) {
      stopActiveResponse();
      return;
    }
    var input = _el('chatInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text && !_attachedFiles.length) return;
    input.value = '';
    _resizeComposer(input);
    _syncComposerState();
    if (_attachedFiles.length) {
      var explicitIntentKind = options && options.fileIntentKind;
      _sendWithFile(text || _t('fileChipSummary'), explicitIntentKind);
    } else {
      _doSend(text);
    }
  };

  /* ---- Clipboard paste support ---- */
  function _extractClipboardFiles(event) {
    var files = [];
    var cd = event.clipboardData;
    if (!cd) return files;
    if (cd.items && cd.items.length > 0) {
      for (var i = 0; i < cd.items.length; i++) {
        var item = cd.items[i];
        if (item.kind === 'file') {
          var f = item.getAsFile();
          if (f) files.push(f);
        }
      }
    }
    if (files.length === 0 && cd.files && cd.files.length > 0) {
      for (var j = 0; j < cd.files.length; j++) {
        if (cd.files[j]) files.push(cd.files[j]);
      }
    }
    return files;
  }

  function _normalizeClipboardFileName(file) {
    var name = file.name || '';
    var isGeneric = !name || name === 'image.png' || name === 'image.jpg' || name === 'image.jpeg' || name === 'image.webp' || /^blob$/i.test(name);
    if (!isGeneric) return name;
    var ext = '.png';
    if (file.type === 'image/jpeg') ext = '.jpg';
    else if (file.type === 'image/webp') ext = '.webp';
    var now = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var ts = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + '-' + pad(now.getMinutes()) + '-' + pad(now.getSeconds());
    return 'Screenshot ' + ts + ext;
  }

  function _handleComposerPaste(event) {
    var input = _el('chatInput');
    if (input && input.disabled) return;
    var clipboardFiles = _extractClipboardFiles(event);
    if (clipboardFiles.length === 0) return;
    event.preventDefault();
    var candidates = [];
    for (var i = 0; i < clipboardFiles.length; i++) {
      var f = clipboardFiles[i];
      var normalizedName = _normalizeClipboardFileName(f);
      if (normalizedName !== f.name) {
        f = new File([f], normalizedName, { type: f.type, lastModified: f.lastModified || Date.now() });
      }
      candidates.push(f);
    }
    _handleFileSelect(candidates);
  }

  /* ---- Initialize file attachment handlers ---- */
  var _fileInited = false;
  function _initFileAttachment() {
    if (_fileInited) return;
    var attachBtn = _el('chatAttachBtn');
    var fileInput = _el('chatFileInput');
    if (!attachBtn || !fileInput) return;
    attachBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files.length) _handleFileSelect(fileInput.files);
      fileInput.value = '';
    });
    var panel = _el('chatPop');
    function isFileDrag(event) {
      var types = event && event.dataTransfer && event.dataTransfer.types;
      return !!types && Array.from(types).indexOf('Files') >= 0;
    }
    if (panel) {
      panel.addEventListener('dragenter', function (event) {
        if (!isFileDrag(event) || _inFlight) return;
        event.preventDefault();
        _dragDepth++;
        panel.setAttribute('data-drop-active', 'true');
      });
      panel.addEventListener('dragover', function (event) {
        if (!isFileDrag(event) || _inFlight) return;
        event.preventDefault();
      });
      panel.addEventListener('dragleave', function (event) {
        if (!isFileDrag(event)) return;
        _dragDepth = Math.max(0, _dragDepth - 1);
        if (!_dragDepth) _resetFileDragState();
      });
      panel.addEventListener('drop', function (event) {
        if (!isFileDrag(event) || _inFlight) return;
        event.preventDefault();
        _resetFileDragState();
        _handleFileSelect(event.dataTransfer.files);
      });
    }
    window.addEventListener('blur', _resetFileDragState);
    document.addEventListener('drop', function (event) {
      if (!panel || panel.contains(event.target)) return;
      _resetFileDragState();
    });
    // Register paste handler on chatInput
    var chatInput = _el('chatInput');
    if (chatInput) {
      chatInput.addEventListener('paste', _handleComposerPaste);
    }
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
  _initComposer();
  _renderSuggestions('initial');

  /* ---- Listen for account changes ---- */
  function _onAccountChange() {
    _captureConversationView();
    stopActiveResponse();
    _clearFileAttachments();
    _accountScope = null; // Force re-detection
    _activeConversationId = null;
    var mod = _getHistory();
    if (mod) mod.setActiveConversation(_getAccountScope(), '');
    _renderWelcome();
    _setChipsVisible(true);
    _setContextStatus('idle', []);
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
    resolveFileIntent: _resolveFileIntent,
    _doSend: _doSend,
    _hasToken: _hasToken,
    _isOnline: _isOnline,
    _setContextBadge: _setContextBadge,
    _contextKeysFromEnvelope: _contextKeysFromEnvelope,
    _setContextStatus: _setContextStatus,
    _getApiBase: _getApiBase,
    _callChatAPI: _callChatAPI,
    _mapError: _mapError,
    _isDocumentPlanRequest: _isDocumentPlanRequest,
    _onAccountChange: _onAccountChange,
    resetAttachmentDragState: _resetFileDragState,
    _captureConversationView: _captureConversationView,
    _restoreConversationView: _restoreConversationView,
    _setHistoryOpen: _setHistoryOpen,
    _shouldSubmitComposer: _shouldSubmitComposer,
    _resizeComposer: _resizeComposer,
    _syncComposerState: _syncComposerState,
    _initComposer: _initComposer,
    _isNearBottom: _isNearBottom,
    _appendMessage: _appendMessage,
    _renderSuggestions: _renderSuggestions,
    ATTACHMENT_LIMITS: {
      maxFiles: _FILE_MAX_FILES,
      maxFileBytes: _FILE_MAX_BYTES,
      maxTotalBytes: _FILE_MAX_TOTAL_BYTES,
    },
    fileKey: _fileKey,
    mergeAttachmentCandidates: _mergeAttachmentCandidates,
    _extractClipboardFiles: _extractClipboardFiles,
    _handleComposerPaste: _handleComposerPaste,
    _normalizeClipboardFileName: _normalizeClipboardFileName,
  };
});
