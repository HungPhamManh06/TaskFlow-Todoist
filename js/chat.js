// TaskFlow — Trợ lý TaskFlow (Gemini Chat, Phase 2 + Phase 3B context).
// Gửi tin nhắn → POST /api/ai/chat → backend gọi Gemini → trả lời thật.
// Phase 3B: với câu hỏi về dữ liệu TaskFlow, client gửi taskflowContext
// (envelope an toàn từ TaskFlowChatContextProvider — READ-ONLY, không
// reflections/mood). Câu hỏi chung KHÔNG gửi context. Mọi lỗi context đều
// fallback về chat thường — không bao giờ làm hỏng cuộc trò chuyện.
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

  /* ---- Show retry button (P8: ONE wrapper = mapped error text + retry) ---- */
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
      // P9: reuse same message, one request — user bubble already exists.
      if (failedMsg) _doSend(failedMsg, { userBubble: false });
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

  /* ---- Context badge (P18): shows which scope is in use, or nothing ---- */
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

  /* ---- API base resolution (canonical pattern shared with sync/gcal/ai) ----
     api-config.js declares `const API_CONFIG` at top level — a lexical global,
     NOT attached to the window object; resolve it lexically. */
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
  async function _callChatAPI(message, history) {
    var apiBase = _getApiBase();

    // P3: no silent production fallback — if the backend base cannot be
    // resolved, fail locally instead of calling the wrong origin (e.g. Vercel).
    if (!apiBase) {
      throw { code: 'api-config-missing' };
    }
    var url = apiBase + '/api/ai/chat';

    // Get token — Sync module or direct localStorage
    var token = null;
    try { token = localStorage.getItem('planner-token'); } catch (e) { /* */ }

    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    // Phase 3B (P7): optional taskflowContext envelope from the trusted
    // provider. Any failure → proceed WITHOUT context (P8), never break chat.
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

    // 3. Append user bubble (skipped on retry — bubble already in thread)
    if (opts.userBubble !== false) _appendText(msgs, text, 'chat-msg user');

    // 4. Show typing indicator
    var typingEl = _showTyping(msgs);

    try {
      // Phase 5B: deterministic intent classification with ambiguity handling.
      // classifyIntent returns { kind, actionType, confidence, reason, taskHint, candidates }
      var intent = null;
      if (window.TaskFlowAIIntent && typeof window.TaskFlowAIIntent.classifyIntent === 'function') {
        try {
          var taskCtx = window.TaskFlowAIAgentRuntime ? window.TaskFlowAIAgentRuntime.buildContext() : null;
          var tasks = taskCtx && taskCtx.tasks ? taskCtx.tasks : [];
          intent = window.TaskFlowAIIntent.classifyIntent(text, tasks);
        } catch (e) { intent = null; }
      }

      // Phase 4B/5B: route based on intent classification
      var useAgent = false;
      if (intent) {
        if (intent.kind === 'clarify' && intent.candidates && intent.candidates.length > 0) {
          // Ambiguous task → show clarification card (P14-P17)
          _removeTyping(typingEl);
          if (window.TaskFlowAIAgentRuntime && typeof window.TaskFlowAIAgentRuntime.showClarification === 'function') {
            window.TaskFlowAIAgentRuntime.showClarification(msgs, intent, function (selectedUid, selectedTask) {
              // User selected a task — re-send as agent with resolution hint
              var _send = (typeof send === 'function') ? send : null;
              if (_send) _send(text, { userBubble: false, resolutionHint: { taskUid: selectedUid } });
            });
          } else {
            _appendText(msgs, _t('clarifyFallback'), 'chat-msg bot');
          }
          _history.push({ role: 'user', content: text });
          if (_history.length > MAX_HISTORY) _history = _history.slice(-MAX_HISTORY);
          return;
        }
        useAgent = (intent.kind === 'agent');
      } else {
        // Fallback: legacy isActionIntent if classifyIntent unavailable
        useAgent = !!(window.TaskFlowAIAgentRuntime && window.TaskFlowAIAgentRuntime.isActionIntent(text));
      }

      if (useAgent) {
        var agentRes = await window.TaskFlowAIAgentRuntime.handleAgent(text, _history, msgs);
        _removeTyping(typingEl);
        if (agentRes && agentRes.handled) {
          var agentReply = (window.TaskFlowAIAgentRuntime.takeResult ? window.TaskFlowAIAgentRuntime.takeResult() : null) || agentRes.reply || null;
          _history.push({ role: 'user', content: text });
          if (agentReply) _history.push({ role: 'assistant', content: agentReply });
          if (_history.length > MAX_HISTORY) _history = _history.slice(-MAX_HISTORY);
          return;
        }
        throw { code: 'agent-unhandled' };
      }

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
      // P8: exactly ONE error bubble + ONE retry button — no second info bubble.
      _showRetry(msgs, text, errMsg);
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
    _setContextBadge(null);
    _clearFileAttachment();
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

  /* ---- Phase 6C: File Attachment ---- */
  var _attachedFile = null;
  var _fileObjectURL = null;
  var _fileAbort = null;
  var _FILE_MAX_BYTES = 15 * 1024 * 1024; // 15 MB client limit
  var _ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown']);
  var _ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.txt', '.md']);

  var FILE_CHIPS_IMAGE = [
    { key: 'fileChipImageDesc', prompt: 'Mô tả ảnh này' },
    { key: 'fileChipImageExplain', prompt: 'Giải thích nội dung trong ảnh' },
    { key: 'fileChipImageRead', prompt: 'Đọc nội dung chữ trong ảnh' },
    { key: 'fileChipImageFindError', prompt: 'Tìm lỗi trong ảnh này' },
  ];
  var FILE_CHIPS_DOC = [
    { key: 'fileChipSummary', prompt: 'Tóm tắt tài liệu này' },
    { key: 'fileChipExplain', prompt: 'Giải thích nội dung chính' },
    { key: 'fileChipKeyPoints', prompt: 'Liệt kê các điểm chính' },
    { key: 'fileChipQuiz', prompt: 'Tạo 10 câu hỏi ôn tập từ tài liệu' },
  ];
  var FILE_CHIPS_TEXT = [
    { key: 'fileChipSummary', prompt: 'Tóm tắt nội dung' },
    { key: 'fileChipKeyPoints', prompt: 'Tìm các ý chính' },
    { key: 'fileChipDocExtract', prompt: 'Trích xuất thông tin quan trọng' },
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

    // Image preview
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

    // Show chips
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
    if (_fileAbort) { try { _fileAbort.abort(); } catch (e) {} _fileAbort = null; }
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

  async function _sendWithFile(text, file) {
    if (_inFlight || !file) return;
    _inFlight = true;
    _setInputEnabled(false);
    _setChipsVisible(false);

    // Show user bubble with file info
    var userBubble = _bubble('user');
    var userText = document.createElement('span');
    userText.textContent = text;
    userBubble.appendChild(userText);
    if (file) {
      var fileInfo = document.createElement('div');
      fileInfo.style.cssText = 'font-size:11px;color:#857062;margin-top:2px;';
      fileInfo.textContent = _fileIcon(file.type) + ' ' + file.name + ' (' + _formatFileSize(file.size) + ')';
      userBubble.appendChild(fileInfo);
    }
    _appendBubble(userBubble);

    _setFileLoading(file.name, true);

    try {
      _fileAbort = new AbortController();
      var fd = new FormData();
      fd.append('file', file);
      fd.append('message', text);

      var token = _getToken();
      var headers = {};
      if (token) headers['Authorization'] = 'Bearer ' + token;

      var resp = await fetch('/api/ai/file', {
        method: 'POST',
        headers: headers,
        body: fd,
        signal: _fileAbort.signal,
      });
      _fileAbort = null;

      var json;
      try { json = await resp.json(); } catch (e) { json = null; }

      _setFileLoading(file.name, false);

      if (!resp.ok || !json || !json.ok) {
        var errMsg = json && json.error ? json.error : 'ai-file-processing-failed';
        var botBubble = _bubble('bot');
        var errSpan = document.createElement('span');
        errSpan.textContent = _t('fileFailed');
        botBubble.appendChild(errSpan);
        _appendBubble(botBubble);
        return;
      }

      var botBubble = _bubble('bot');
      _appendMarkdown(botBubble, json.answer || '');
      _appendBubble(botBubble);

      // Add to history
      _history.push({ role: 'user', content: text });
      _history.push({ role: 'assistant', content: json.answer || '' });
    } catch (e) {
      _setFileLoading(file.name, false);
      if (e && e.name === 'AbortError') return; // cancelled
      var botBubble = _bubble('bot');
      var errSpan = document.createElement('span');
      errSpan.textContent = _t('fileFailed');
      botBubble.appendChild(errSpan);
      _appendBubble(botBubble);
    } finally {
      _inFlight = false;
      _setInputEnabled(true);
      _clearFileAttachment();
      var input = _el('chatInput');
      if (input) input.focus();
    }
  }

  /** Override doChatSend to check for attached file */
  var _origDoChatSend = doChatSend;
  doChatSend = function () {
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

  /** Initialize file attachment handlers */
  function _initFileAttachment() {
    var attachBtn = _el('chatAttachBtn');
    var fileInput = _el('chatFileInput');
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) {
          _handleFileSelect(fileInput.files[0]);
        }
      });
    }
  }
  // Init on first chat open
  var _fileInited = false;
  var origOpen = doChatClear;
  doChatClear = function () {
    if (!_fileInited) { _initFileAttachment(); _fileInited = true; }
    origOpen();
  };

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
    _setContextBadge: _setContextBadge,
    _getApiBase: _getApiBase,
    _callChatAPI: _callChatAPI,
    _mapError: _mapError,
  };
});
