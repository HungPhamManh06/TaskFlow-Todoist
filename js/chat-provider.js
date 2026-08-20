/* ============================================================
   TaskFlow — Phase 3B Runtime: Trusted Chat Context Provider
   ------------------------------------------------------------
   window.TaskFlowChatContextProvider — the ONLY bridge chat.js uses
   to obtain a TaskFlow personal-data envelope. chat.js never reads
   localStorage/state directly; it asks this provider.

   Load chain (lazy, on first chat use — P6):
     js/ai-context.min.js → js/ai-chat-context.min.js → js/chat-provider.min.js
   (app.js runLazyChat() orchestrates; nothing is in the boot path.)

   Guarantees:
   - ZERO NETWORK: no fetch, XMLHttpRequest, Gemini, or Google calls.
   - ZERO STORAGE READS: the provider itself never touches localStorage;
     all data comes from the gather function registered by app.js, which
     reads ONLY canonical TaskFlow sources (state, projects, timeblocks,
     Google Calendar busy cache — no network during construction).
   - READ-ONLY: never mutates TaskFlow state, permissions, or history.
   - PRIVACY: reflections/mood default to OFF; user must explicitly opt-in
     via TaskFlowAIContextConsent. Defense-in-depth: data is stripped if
     consent is not granted, even if a gather fn leaks them.
   - DETERMINISTIC GATE: shouldAttachContext(message) decides whether a
     question needs personal data at all (general questions → no context).
   - SAFE FALLBACK: any failure returns { ok:false } — Chat proceeds
     without context; never breaks the conversation.
   - SIZE-BOUNDED: envelope re-validated against MAX_CHAT_CONTEXT_BYTES.

   Public API:
   - register(gatherFn) — trusted config from app.js (returns brokerOptions)
   - shouldAttachContext(message) → boolean
   - prepare(message) → { ok:true, scope, envelope } | { ok:false }
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowChatContextProvider = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var _gatherFn = null;

  // Personal-data markers (VI+EN). A message must reference TaskFlow data
  // (via scope tokens or explicit personal markers) to receive context.
  // General questions ("Pomodoro là gì?") match nothing → NO context.
  var PERSONAL_PATTERNS = [
    // scope tokens (same family as TaskFlowAIContext.scopeForIntent)
    'today', 'hôm nay', 'hom nay', 'ngày mai', 'ngay mai',
    'week', 'tuần', 'tuan',
    'project', 'dự án', 'du an', 'milestone', 'mốc', 'moc',
    'schedule', 'lịch', 'lich', 'calendar',
    // data domain words
    'task', 'công việc', 'cong viec',
    'thói quen', 'thoi quen', 'habit', 'goal', 'mục tiêu', 'muc tieu',
    'overdue', 'quá hạn', 'qua han', 'tổng quan', 'tong quan', 'overview',
    'reflection', 'mood', 'điểm danh', 'diem danh', 'check-in',
    // explicit personal references
    'của tôi', 'cua toi', 'của mình', 'cua minh', 'my task', 'my data',
    'my taskflow', 'taskflow data', 'dữ liệu taskflow', 'du lieu taskflow',
    'dữ liệu của', 'du lieu cua', 'data của', 'data cua',
    // explicit privacy opt-out (see below) — listed for clarity
    'đừng gửi', 'dung gui', 'không gửi', 'khong gui', 'don\'t send',
    'do not send', 'privacy',
  ];

  var OPT_OUT_PATTERNS = [
    'đừng gửi', 'dung gui', 'không gửi', 'khong gui',
    'don\'t send', 'do not send', 'đừng chia sẻ', 'dung chia se',
    'không chia sẻ', 'khong chia se', 'don\'t share', 'do not share',
  ];

  function _hasAny(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      if (p === 'task' && /\btask\b/.test(text)) return true;
      if (text.indexOf(p) !== -1) return true;
    }
    return false;
  }

  /* ---- P2: deterministic attach gate ---- */
  // True only when the question clearly references TaskFlow personal data.
  // A general/advice question must return false (P17 mandatory test).
  function shouldAttachContext(message) {
    var s = String(message === undefined || message === null ? '' : message).trim().toLowerCase();
    if (!s) return false;
    // Explicit privacy opt-out wins over everything.
    if (_hasAny(s, OPT_OUT_PATTERNS)) return false;
    var cc = _getChatContext();
    if (cc && typeof cc.resolveScope === 'function' && cc.resolveScope(s) !== 'overview') return true;
    return _hasAny(s, PERSONAL_PATTERNS);
  }

  /* ---- Trusted config: app.js registers the gather function ---- */
  function register(gatherFn) {
    _gatherFn = typeof gatherFn === 'function' ? gatherFn : null;
    return _gatherFn !== null;
  }

  /* ---- Broker access ---- */
  function _getChatContext() {
    if (typeof window !== 'undefined' && window.TaskFlowAIChatContext) return window.TaskFlowAIChatContext;
    if (typeof globalThis !== 'undefined' && globalThis.TaskFlowAIChatContext) return globalThis.TaskFlowAIChatContext;
    return null;
  }

  /* ---- P4: prepare a safe envelope for this message ---- */
  // Fresh snapshot per request (P22). Any failure → { ok:false } so Chat
  // proceeds normally (P8). Log only a code — never task text or secrets.
  function prepare(message) {
    try {
      if (!shouldAttachContext(message)) return { ok: false, reason: 'not-personal' };

      var cc = _getChatContext();
      if (!cc || typeof cc.prepare !== 'function') {
        _log('prepare-failed', 'module-unavailable');
        return { ok: false, reason: 'module-unavailable' };
      }
      if (typeof _gatherFn !== 'function') {
        _log('prepare-failed', 'no-gather-fn');
        return { ok: false, reason: 'no-gather-fn' };
      }

      // Gather fresh brokerOptions from trusted app sources (P4.1).
      var brokerOptions = _gatherFn();
      if (!brokerOptions || typeof brokerOptions !== 'object') {
        _log('prepare-failed', 'empty-options');
        return { ok: false, reason: 'empty-options' };
      }

      // Phase 6A: Read permissions from the consent store.
      // Sensitive categories (reflections, mood) default to OFF;
      // user must explicitly opt-in via settings.
      var perms;
      try {
        var consent = (typeof window !== 'undefined' && window.TaskFlowAIContextConsent)
          ? window.TaskFlowAIContextConsent.buildPermissions()
          : null;
        perms = consent || {
          tasks: true, projects: true, schedule: true, habits: true,
          reflections: false, mood: false,
        };
      } catch (e) {
        perms = {
          tasks: true, projects: true, schedule: true, habits: true,
          reflections: false, mood: false,
        };
      }

      var result = cc.prepare({ message: message, permissions: perms, brokerOptions: brokerOptions });
      if (!result || !result.context) {
        _log('prepare-failed', 'prepare-returned-empty');
        return { ok: false, reason: 'prepare-returned-empty' };
      }
      if (result._validation && result._validation.ok === false) {
        _log('prepare-failed', 'envelope-validation');
        return { ok: false, reason: 'envelope-validation' };
      }

      // Strip sensitive data NOT granted by user consent.
      // Phase 6A: only strip reflections/mood if user has NOT opted in.
      var data = cc._stripForbidden ? cc._stripForbidden(result.context) : result.context;
      if (data && typeof data === 'object') {
        if (!perms.reflections) delete data.reflections;
        if (!perms.mood) delete data.mood;
      }

      var envelope = { scope: result.scope, data: data };
      if (!cc.validateEnvelope || !cc.validateEnvelope(envelope).ok) {
        _log('prepare-failed', 'final-validation');
        return { ok: false, reason: 'final-validation' };
      }
      return { ok: true, scope: result.scope, envelope: envelope };
    } catch (e) {
      // Never leak task text/secrets — log only the error name.
      _log('prepare-failed', e && e.name ? e.name : 'exception');
      return { ok: false, reason: 'exception' };
    }
  }

  function _log(code, detail) {
    try {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[chat-context] ' + code + ' (' + detail + ')');
      }
    } catch (e) { /* logging must never break chat */ }
  }

  return {
    register: register,
    shouldAttachContext: shouldAttachContext,
    prepare: prepare,
    // Expose for tests
    _hasAny: _hasAny,
    PERSONAL_PATTERNS: PERSONAL_PATTERNS.slice(),
    OPT_OUT_PATTERNS: OPT_OUT_PATTERNS.slice(),
  };
});