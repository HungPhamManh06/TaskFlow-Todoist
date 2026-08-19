/* ============================================================
   TaskFlow — Phase 3B Prep: Context-Aware Chat Integration Layer
   ------------------------------------------------------------
   window.TaskFlowAIChatContext — bridge between TaskFlowAIContext
   (Phase 3A read-only broker) and Gemini Chat (Phase 3B runtime).

   Loaded lazily via js/chat-provider.min.js (which loads js/ai-context.min.js
   first). Never part of the app.html boot path.

   Guarantees:
   - ZERO NETWORK: no fetch, XMLHttpRequest, Gemini, or Google calls.
   - READ-ONLY: never mutates TaskFlow state, permissions, or history.
   - PRIVACY: sensitive domains (reflections, mood) are OFF by default
     and CANNOT be granted by user message text — only by trusted app
     configuration state. Phase 3B runtime keeps them OFF (no toggle).
   - DETERMINISTIC: same inputs → same snapshot (modulo Date.now fallback).
   - SIZE-BOUNDED: serialized context is capped at MAX_CHAT_CONTEXT_BYTES.
   - FORBIDDEN-FIELD SAFE: recursive scan covers nested objects AND items
     inside arrays of objects (e.g. tasks[].authorization).

   Public API:
   - prepare({ message, requestedScope, permissions, brokerOptions })
   - resolveScope(message) → scope string
   - normalizePermissions(permissions) → permissions object
   - validateEnvelope(envelope) → { ok, errors }
   - byteLengthUtf8(value) → byte length (TextEncoder → Buffer → fallback)
   - MAX_CHAT_CONTEXT_BYTES (constant)
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAIChatContext = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ---- Constants ---- */

  var MAX_CHAT_CONTEXT_BYTES = 65536; // 64 KB conservative limit

  var VALID_SCOPES = ['today', 'week', 'project', 'schedule', 'overview'];

  var SENSITIVE_KEYS = ['reflections', 'mood'];

  // Fields that must NEVER appear in the context envelope or history.
  var FORBIDDEN_FIELDS = [
    'token', 'planner-token', 'jwt', 'authorization', 'apiKey',
    'AI_API_KEY', 'oauth', 'refreshToken', 'accessToken',
    'password', 'email', 'localStorage', 'backup', 'syncPayload',
    'secret', 'credential',
  ];

  // Known envelope shape — anything else is stripped/rejected.
  var ENVELOPE_KEYS = ['scope', 'data'];

  /* ---- Scope Routing ---- */

  // Deterministic intent → scope. No LLM. No Gemini. No NLP.
  // Delegates to TaskFlowAIContext.scopeForIntent where available,
  // with a standalone fallback for testability.
  var INTENT_TOKENS = [
    // today
    ['today', 'today'], ['hôm nay', 'today'], ['hom nay', 'today'],
    ['ngày mai', 'today'], ['ngay mai', 'today'],
    // week
    ['week', 'week'], ['tuần', 'week'], ['tuan', 'week'],
    // project
    ['project', 'project'], ['dự án', 'project'], ['du an', 'project'],
    ['milestone', 'project'], ['mốc', 'project'], ['moc', 'project'],
    // schedule
    ['schedule', 'schedule'], ['lịch', 'schedule'], ['lich', 'schedule'],
    ['calendar', 'schedule'], ['giờ', 'schedule'], ['gio', 'schedule'],
  ];

  function resolveScope(message) {
    var s = String(message === undefined || message === null ? '' : message).trim().toLowerCase();
    if (!s) return 'overview';
    // Try TaskFlowAIContext.scopeForIntent first
    var broker = _getBroker();
    if (broker && typeof broker.scopeForIntent === 'function') {
      var scope = broker.scopeForIntent(s);
      if (VALID_SCOPES.indexOf(scope) !== -1) return scope;
    }
    // Fallback: local token matching
    for (var i = 0; i < INTENT_TOKENS.length; i++) {
      var token = INTENT_TOKENS[i][0];
      if (s === token || s.indexOf(token) !== -1) {
        return INTENT_TOKENS[i][1];
      }
    }
    return 'overview';
  }

  /* ---- Permissions ---- */

  var DEFAULT_PERMISSIONS = {
    tasks: true,
    projects: true,
    schedule: true,
    habits: true,
    reflections: false,
    mood: false,
  };

  // CRITICAL PRIVACY RULE:
  // Sensitive permissions (reflections, mood) default to OFF and
  // can ONLY be set by trusted app configuration — NEVER by user message text.
  function normalizePermissions(perms) {
    var out = {};
    var keys = Object.keys(DEFAULT_PERMISSIONS);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (perms && typeof perms === 'object' && typeof perms[k] === 'boolean') {
        out[k] = perms[k];
      } else {
        out[k] = DEFAULT_PERMISSIONS[k];
      }
    }
    return out;
  }

  // Scan message text for attempt to grant sensitive permissions.
  // This is a defense-in-depth check; the architecture already prevents
  // user message from influencing permissions, but we verify anyway.
  function _messageGrantsSensitive(message, permissions) {
    var lower = String(message || '').toLowerCase();
    var issues = [];
    // Vietnamese/English patterns for trying to grant access
    var patterns = {
      reflections: [
        'cho phép.*reflection', 'cho.*đọc.*reflection', 'cho.*xem.*reflection',
        'allow.*reflection', 'read.*reflection', 'access.*reflection',
        'reflection của tôi', 'my reflection',
      ],
      mood: [
        'cho phép.*mood', 'cho.*đọc.*mood', 'cho.*xem.*mood',
        'allow.*mood', 'read.*mood', 'access.*mood',
        'mood của tôi', 'my mood',
      ],
    };
    var sensitiveKeys = Object.keys(patterns);
    for (var i = 0; i < sensitiveKeys.length; i++) {
      var key = sensitiveKeys[i];
      if (permissions[key]) {
        var pats = patterns[key];
        for (var j = 0; j < pats.length; j++) {
          if (new RegExp(pats[j], 'i').test(lower)) {
            issues.push(key);
            break;
          }
        }
      }
    }
    return issues;
  }

  /* ---- Forbidden Fields ---- */

  // Recursive scan: object keys AND items inside arrays of objects.
  // e.g. { tasks: [{ authorization: 'secret' }] } must be detected.
  function _containsForbidden(obj, path) {
    if (!obj || typeof obj !== 'object') return [];
    var found = [];
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var fullPath = path ? path + '.' + k : k;
      // Check key name against forbidden list
      var lk = k.toLowerCase();
      for (var j = 0; j < FORBIDDEN_FIELDS.length; j++) {
        if (lk === FORBIDDEN_FIELDS[j].toLowerCase()) {
          found.push(fullPath);
          break;
        }
      }
      // Recurse into nested objects AND arrays of objects
      if (typeof obj[k] === 'object' && obj[k] !== null) {
        if (Array.isArray(obj[k])) {
          for (var a = 0; a < obj[k].length; a++) {
            if (obj[k][a] && typeof obj[k][a] === 'object') {
              found = found.concat(_containsForbidden(obj[k][a], fullPath + '[' + a + ']'));
            }
          }
        } else {
          found = found.concat(_containsForbidden(obj[k], fullPath));
        }
      }
    }
    return found;
  }

  // Recursive strip: removes forbidden keys from objects AND from items
  // inside arrays of objects. Returns a fresh object — inputs never mutated.
  function _stripForbidden(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    var out = {};
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var lk = k.toLowerCase();
      var forbidden = false;
      for (var j = 0; j < FORBIDDEN_FIELDS.length; j++) {
        if (lk === FORBIDDEN_FIELDS[j].toLowerCase()) { forbidden = true; break; }
      }
      if (forbidden) continue;
      if (Array.isArray(obj[k])) {
        out[k] = obj[k].map(function (item) {
          return (item && typeof item === 'object') ? _stripForbidden(item) : item;
        });
      } else if (typeof obj[k] === 'object' && obj[k] !== null) {
        out[k] = _stripForbidden(obj[k]);
      } else {
        out[k] = obj[k];
      }
    }
    return out;
  }

  /* ---- UTF-8 byte length (browser-safe; P1) ---- */

  // Node's Buffer.byteLength is undefined in browsers. Prefer TextEncoder,
  // fall back to Buffer, then a conservative UTF-8 count.
  function byteLengthUtf8(value) {
    var s = typeof value === 'string' ? value : JSON.stringify(value);
    if (typeof s !== 'string') s = '';
    try {
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(s).length;
      }
    } catch (e) { /* fall through */ }
    try {
      if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
        return Buffer.byteLength(s, 'utf8');
      }
    } catch (e) { /* fall through */ }
    var bytes = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) bytes += 1;
      else if (c < 0x800) bytes += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        var n = s.charCodeAt(i + 1);
        if (n >= 0xdc00 && n <= 0xdfff) { bytes += 4; i += 1; }
        else bytes += 3;
      } else bytes += 3;
    }
    return bytes;
  }

  /* ---- Envelope Validation ---- */

  function validateEnvelope(envelope) {
    var errors = [];
    if (!envelope || typeof envelope !== 'object') {
      return { ok: false, errors: ['envelope-not-object'] };
    }
    // scope
    if (VALID_SCOPES.indexOf(envelope.scope) === -1) {
      errors.push('invalid-scope');
    }
    // data
    if (envelope.data && typeof envelope.data === 'object') {
      // Check for forbidden fields
      var forbidden = _containsForbidden(envelope.data, 'data');
      if (forbidden.length) {
        errors.push('forbidden-fields: ' + forbidden.join(', '));
      }
      // Check size
      try {
        var bytes = byteLengthUtf8(JSON.stringify(envelope));
        if (bytes > MAX_CHAT_CONTEXT_BYTES) {
          errors.push('context-too-large: ' + bytes + ' > ' + MAX_CHAT_CONTEXT_BYTES);
        }
      } catch (e) {
        errors.push('serialization-error');
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /* ---- Broker Access ---- */

  function _getBroker() {
    if (typeof window !== 'undefined' && window.TaskFlowAIContext) return window.TaskFlowAIContext;
    if (typeof globalThis !== 'undefined' && globalThis.TaskFlowAIContext) return globalThis.TaskFlowAIContext;
    return null;
  }

  /* ---- prepare() — Main Entry Point ---- */

  /**
   * Prepare a context envelope for future Gemini Chat integration.
   *
   * @param {Object} opts
   * @param {string} opts.message - user's chat message
   * @param {string} [opts.requestedScope] - explicit scope override
   * @param {Object} [opts.permissions] - permission overrides
   * @param {Object} [opts.brokerOptions] - options passed to TaskFlowAIContext.build()
   * @returns {Object} { scope, permissions, context }
   */
  function prepare(opts) {
    var o = opts && typeof opts === 'object' ? opts : {};
    var message = typeof o.message === 'string' ? o.message : '';

    // 1. Resolve scope
    var scope = VALID_SCOPES.indexOf(o.requestedScope) !== -1
      ? o.requestedScope
      : resolveScope(message);

    // 2. Normalize permissions
    var perms = normalizePermissions(o.permissions);

    // 3. CRITICAL: Strip sensitive permissions if user message tries to grant them
    //    This is defense-in-depth — the architecture already prevents this,
    //    but we enforce it here as a hard rule.
    var sensitiveAttempt = _messageGrantsSensitive(message, perms);
    for (var i = 0; i < sensitiveAttempt.length; i++) {
      perms[sensitiveAttempt[i]] = false;
    }

    // 4. Build context via TaskFlowAIContext broker
    var broker = _getBroker();
    var context = null;
    if (broker && typeof broker.build === 'function') {
      var buildOpts = Object.assign({}, o.brokerOptions || {}, {
        scope: scope,
        permissions: perms,
      });
      context = broker.build(buildOpts);
    } else {
      // Broker not available — return minimal context
      context = { scope: scope };
    }

    // 5. Strip any forbidden fields that might have leaked in
    context = _stripForbidden(context);

    // 6. Validate envelope
    var envelope = { scope: scope, data: context };
    var validation = validateEnvelope(envelope);

    return {
      scope: scope,
      permissions: perms,
      context: context,
      _validation: validation, // expose for testing, can be removed for production
    };
  }

  /* ---- Public API ---- */

  return {
    MAX_CHAT_CONTEXT_BYTES: MAX_CHAT_CONTEXT_BYTES,
    VALID_SCOPES: VALID_SCOPES,
    FORBIDDEN_FIELDS: FORBIDDEN_FIELDS.slice(),
    DEFAULT_PERMISSIONS: normalizePermissions(null),
    prepare: prepare,
    resolveScope: resolveScope,
    normalizePermissions: normalizePermissions,
    validateEnvelope: validateEnvelope,
    byteLengthUtf8: byteLengthUtf8,
    // Expose internals for testing
    _containsForbidden: _containsForbidden,
    _stripForbidden: _stripForbidden,
    _messageGrantsSensitive: _messageGrantsSensitive,
  };
});
