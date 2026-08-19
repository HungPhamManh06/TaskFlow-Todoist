// TaskFlow — Trợ lý TaskFlow (Gemini Chat, Phase 2).
// Gửi tin nhắn → POST /api/ai/chat → backend gọi Gemini → trả lời thật.
// Module KHÔNG gửi TaskFlow personal data — chỉ message + bounded history.
// Gateway: Browser → TaskFlow backend → Gemini (KHÔNG BAO GIỜ browser → Gemini trực tiếp).
// Lazy-loaded — giữ nguyên pattern P1.5, không nằm trong boot path.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowChat = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ---- Config ---- */
  var MAX_HISTORY = 10;
  var MAX_MSG_LEN = 4000;

  /* ---- State ---- */
  var _history = [];        // [{role:'user'|'assistant', content:string}]
  var _inFlight = false;    // double-send guard

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

  /* ---- Suggestion chips mapping: topic → natural-language Gemini question ---- */
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
    // Render as text — no innerHTML for untrusted model output
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

  /* ---- Show localized message (error / offline / guest) ---- */
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
  function _showRetry(container, failedMsg) {
    var wrap = document.createElement('div');
    wrap.className = 'chat-msg bot chat-retry-wrap';
    var p = document.createElement('p');
    p.textContent = _t('chatErrorMsg');
    wrap.appendChild(p);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-retry-btn';
    btn.textContent = _t('chatRetry');
    btn.addEventListener('click', function () {
      if (failedMsg) _doSend(failedMsg);
    });
    wrap.appendChild(btn);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  /* ---- Update input enabled/disabled state ---- */
  function _setInputEnabled(enabled) {
    var input = _el('chatInput');
    var sendBtn = document.querySelector('[data-action="chat-send"]');
    if (input) input.disabled = !enabled;
    if (sendBtn) sendBtn.disabled = !enabled;
  }

  /* ---- Hide suggestion chips during active chat ---- */
  function _setChipsVisible(visible) {
    var chips = document.querySelectorAll('.chat-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].style.display = visible ? '' : 'none';
    }
  }

  /* ---- API call ---- */
  async function _callChatAPI(message, history) {
    // Build API URL from existing config
    var apiUrl = '';
    try { apiUrl = (window.API_CONFIG && API_CONFIG.url) || ''; } catch (e) { /* */ }
    var url = apiUrl + '/api/ai/chat';

    // Get token — Sync module or direct localStorage
    var token = null;
    try { token = localStorage.getItem('planner-token'); } catch (e) { /* */ }

    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var res = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ message: message, history: history }),
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
      default: return _t('chatErrorMsg');
    }
  }

  /* ---- Core send flow ---- */
  async function _doSend(text) {
    if (_inFlight) return;
    text = (text || '').trim();
    if (!text) return;

    var msgs = _el('chatMessages');
    if (!msgs) return;

    // 1. Pre-flight checks
    if (!_isOnline()) {
      _showInfo(msgs, _t('chatOffline'));
      return;
    }
    if (!_hasToken()) {
      _showGuestPrompt(msgs);
      return;
    }

    // 2. Validate input length
    if (text.length > MAX_MSG_LEN) {
      _showInfo(msgs, _t('chatErrorTooLong'));
      return;
    }

    _inFlight = true;
    _setInputEnabled(false);
    _setChipsVisible(false);

    // 3. Append user bubble
    _appendText(msgs, text, 'chat-msg user');

    // 4. Show typing indicator
    var typingEl = _showTyping(msgs);

    try {
      // 5. Call API
      var answer = await _callChatAPI(text, _history);

      // 6. Remove typing
      _removeTyping(typingEl);

      // 7. Append assistant bubble (safe text)
      _appendText(msgs, answer, 'chat-msg bot');

      // 8. Update bounded history
      _history.push({ role: 'user', content: text });
      _history.push({ role: 'assistant', content: answer });
      if (_history.length > MAX_HISTORY) {
        _history = _history.slice(-MAX_HISTORY);
      }

    } catch (err) {
      _removeTyping(typingEl);
      var errMsg = _mapError(err);
      _showRetry(msgs, text);
      // Also show error info in chat
      _showInfo(msgs, errMsg);
    } finally {
      _inFlight = false;
      _setInputEnabled(true);
      // Re-focus input
      var input = _el('chatInput');
      if (input) input.focus();
    }
  }

  /* ---- Public API ---- */

  /** Send from chat input */
  function doChatSend() {
    var input = _el('chatInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    _doSend(text);
  }

  /** Handle suggestion chip click — sends real natural-language prompt */
  function doChatSuggest(topic) {
    var sug = SUGGESTIONS[topic];
    if (sug && sug.prompt) {
      var input = _el('chatInput');
      if (input) input.value = '';
      _doSend(sug.prompt);
    }
  }

  /** Clear conversation — reset to welcome state */
  function doChatClear() {
    _history = [];
    _inFlight = false;
    _setInputEnabled(true);
    var msgs = _el('chatMessages');
    if (!msgs) return;
    // Remove all messages
    msgs.innerHTML = '';
    // Re-add welcome
    var welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'chat-msg bot';
    var welcomeSpan = document.createElement('span');
    welcomeSpan.setAttribute('data-i18n', 'chatWelcome');
    welcomeSpan.textContent = _t('chatWelcome');
    welcomeDiv.appendChild(welcomeSpan);
    msgs.appendChild(welcomeDiv);
    // Restore suggestion chips
    _setChipsVisible(true);
  }

  return {
    SUGGESTIONS: SUGGESTIONS,
    doChatSend: doChatSend,
    doChatSuggest: doChatSuggest,
    doChatClear: doChatClear,
    // Expose for testing
    _doSend: _doSend,
    _hasToken: _hasToken,
    _isOnline: _isOnline,
    _history: function () { return _history; },
  };
});
