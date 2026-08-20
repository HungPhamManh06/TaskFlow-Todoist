/**
 * TaskFlow — Phase 6B: User-Controlled AI Memory & Preferences
 * -------------------------------------------------------------
 * window.TaskFlowAIMemory — persistent, user-declared preference store.
 *
 * Guarantees:
 * - LOCAL ONLY: never syncs, never sends to server/Gemini directly.
 * - DEFAULT OFF: master switch starts as OFF.
 * - EXPLICIT SAVE ONLY: no automatic inference, no conversation mining.
 * - STRICT ALLOWLIST: only known preference keys with validated types.
 * - SAFE FALLBACK: any read failure returns defaults (OFF, empty prefs).
 * - DETERMINISTIC: same store → same preferences.
 * - SIZE-BOUNDED: serialized store ≤ 4 KB.
 * - INDEPENDENT: enabling Memory does NOT enable Reflection/Mood consent.
 *
 * Public API:
 * - isEnabled() → boolean
 * - setEnabled(value) → boolean
 * - getPreferences() → { ...allowed fields with safe defaults }
 * - setPreference(key, value) → boolean
 * - setPreferences(obj) → boolean (bulk set, validates each)
 * - reset() → defaults (OFF, empty prefs)
 * - clearAll() → wipe store entirely
 * - onChange(fn) → unsubscribe function
 * - buildContextPayload() → { preferences: {...} } | null
 * - getAllowedKeys() → string[]
 * - validateValue(key, value) → { ok: boolean, reason?: string }
 * - STORAGE_KEY: string (exposed for tests)
 * - VERSION: number (exposed for tests)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAIMemory = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var STORAGE_KEY = 'taskflow-ai-memory-v1';
  var VERSION = 1;
  var MAX_SERIALIZED_BYTES = 4096;

  /* ---- Allowlisted preference keys with type/range metadata ---- */

  var ALLOWED_KEYS = {
    defaultTaskDuration: {
      type: 'number',
      min: 5,
      max: 480,
      nullable: true,
      description: 'Default task duration in minutes',
    },
    preferredFocusDuration: {
      type: 'number',
      min: 5,
      max: 480,
      nullable: true,
      description: 'Preferred focus/Pomodoro session duration in minutes',
    },
    preferredWorkWindow: {
      type: 'object',
      nullable: true,
      shape: {
        start: { type: 'string', pattern: /^([01]\d|2[0-3]):[0-5]\d$/, required: true },
        end: { type: 'string', pattern: /^([01]\d|2[0-3]):[0-5]\d$/, required: true },
      },
      description: 'Preferred work time window { start: "HH:MM", end: "HH:MM" }',
    },
    planningStyle: {
      type: 'enum',
      values: ['balanced', 'deep-work', 'light', 'deadline-first'],
      nullable: true,
      description: 'Planning approach preference',
    },
    responseStyle: {
      type: 'enum',
      values: ['concise', 'balanced', 'detailed'],
      nullable: true,
      description: 'AI response verbosity preference',
    },
    language: {
      type: 'enum',
      values: ['vi', 'en'],
      nullable: true,
      description: 'Preferred AI response language',
    },
    preferredPlanningDays: {
      type: 'array',
      nullable: true,
      items: { type: 'number', min: 0, max: 6 },
      maxLength: 7,
      description: 'Preferred days of week for planning (0=Mon..6=Sun)',
    },
  };

  var DEFAULT_PREFERENCES = {};
  Object.keys(ALLOWED_KEYS).forEach(function (k) {
    DEFAULT_PREFERENCES[k] = null;
  });

  var _listeners = [];

  /* ---- Validation ---- */

  function validateValue(key, value) {
    if (!(key in ALLOWED_KEYS)) {
      return { ok: false, reason: 'unknown-key' };
    }
    var spec = ALLOWED_KEYS[key];

    // null is always allowed (clears the preference)
    if (value === null || value === undefined) {
      return { ok: true };
    }

    if (spec.type === 'number') {
      if (typeof value !== 'number' || !isFinite(value)) {
        return { ok: false, reason: 'not-a-number' };
      }
      var n = Math.round(value);
      if (n < spec.min || n > spec.max) {
        return { ok: false, reason: 'out-of-range:' + spec.min + '-' + spec.max };
      }
      return { ok: true };
    }

    if (spec.type === 'enum') {
      if (typeof value !== 'string') {
        return { ok: false, reason: 'not-a-string' };
      }
      if (spec.values.indexOf(value) === -1) {
        return { ok: false, reason: 'invalid-enum:' + spec.values.join(',') };
      }
      return { ok: true };
    }

    if (spec.type === 'object') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { ok: false, reason: 'not-an-object' };
      }
      if (spec.shape) {
        var keys = Object.keys(spec.shape);
        // Only allow known shape keys
        var vKeys = Object.keys(value);
        for (var i = 0; i < vKeys.length; i++) {
          if (keys.indexOf(vKeys[i]) === -1) {
            return { ok: false, reason: 'unknown-field:' + vKeys[i] };
          }
        }
        for (var j = 0; j < keys.length; j++) {
          var fk = keys[j];
          var fSpec = spec.shape[fk];
          var fVal = value[fk];
          if (fVal === undefined || fVal === null) {
            if (fSpec.required) return { ok: false, reason: 'required-field-missing:' + fk };
            continue; // optional sub-fields
          }
          if (fSpec.type === 'string') {
            if (typeof fVal !== 'string') {
              return { ok: false, reason: 'field-not-string:' + fk };
            }
            if (fSpec.pattern && !fSpec.pattern.test(fVal)) {
              return { ok: false, reason: 'field-invalid-format:' + fk };
            }
          }
        }
      }
      return { ok: true };
    }

    if (spec.type === 'array') {
      if (!Array.isArray(value)) {
        return { ok: false, reason: 'not-an-array' };
      }
      if (spec.maxLength && value.length > spec.maxLength) {
        return { ok: false, reason: 'too-many-items:' + spec.maxLength };
      }
      if (spec.items) {
        for (var k = 0; k < value.length; k++) {
          var item = value[k];
          if (spec.items.type === 'number') {
            if (typeof item !== 'number' || !isFinite(item)) {
              return { ok: false, reason: 'item-not-number:' + k };
            }
            if (item < spec.items.min || item > spec.items.max) {
              return { ok: false, reason: 'item-out-of-range:' + k };
            }
          }
        }
      }
      return { ok: true };
    }

    return { ok: false, reason: 'unknown-type' };
  }

  function _validateAll(prefs) {
    var out = {};
    var keys = Object.keys(prefs);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!(k in ALLOWED_KEYS)) continue; // silently drop unknown
      var v = prefs[k];
      var r = validateValue(k, v);
      if (r.ok) {
        out[k] = (v === undefined) ? null : v;
      }
      // invalid entries are dropped (not stored)
    }
    return out;
  }

  /* ---- localStorage helpers ---- */

  function _read() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.version === VERSION) {
        return {
          enabled: !!parsed.enabled,
          preferences: (parsed.preferences && typeof parsed.preferences === 'object')
            ? parsed.preferences : {},
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function _write(state) {
    try {
      var data = {
        version: VERSION,
        enabled: !!state.enabled,
        preferences: state.preferences || {},
        updatedAt: Date.now(),
      };
      var serialized = JSON.stringify(data);
      if (serialized.length > MAX_SERIALIZED_BYTES) {
        return false; // refuse oversized stores
      }
      localStorage.setItem(STORAGE_KEY, serialized);
      return true;
    } catch (e) {
      return false;
    }
  }

  function _notify() {
    var state = _read() || { enabled: false, preferences: {} };
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](state); } catch (e) { /* never break */ }
    }
  }

  function _defaults() {
    return { enabled: false, preferences: Object.assign({}, DEFAULT_PREFERENCES) };
  }

  /* ---- Public API ---- */

  function isEnabled() {
    var state = _read();
    return state ? !!state.enabled : false;
  }

  function setEnabled(value) {
    var state = _read() || _defaults();
    state.enabled = !!value;
    var ok = _write(state);
    if (ok) _notify();
    return ok;
  }

  function getPreferences() {
    var state = _read();
    if (!state) return Object.assign({}, DEFAULT_PREFERENCES);
    var out = {};
    Object.keys(ALLOWED_KEYS).forEach(function (k) {
      var v = state.preferences && state.preferences[k] !== undefined
        ? state.preferences[k] : null;
      // Re-validate on read (defense-in-depth against corrupted storage)
      var r = validateValue(k, v);
      out[k] = r.ok ? v : null;
    });
    return out;
  }

  function setPreference(key, value) {
    if (!(key in ALLOWED_KEYS)) return false;
    var r = validateValue(key, value);
    if (!r.ok) return false;
    var state = _read() || _defaults();
    if (!state.preferences) state.preferences = {};
    // Store the canonical (rounded/validated) form
    var canonical = value;
    if (value !== null && value !== undefined) {
      var spec = ALLOWED_KEYS[key];
      if (spec.type === 'number') canonical = Math.round(value);
    }
    state.preferences[key] = (value === undefined) ? null : canonical;
    var ok = _write(state);
    if (ok) _notify();
    return ok;
  }

  function setPreferences(obj) {
    if (!obj || typeof obj !== 'object') return false;
    var state = _read() || _defaults();
    if (!state.preferences) state.preferences = {};
    var anyChanged = false;
    Object.keys(obj).forEach(function (k) {
      if (!(k in ALLOWED_KEYS)) return;
      var r = validateValue(k, obj[k]);
      if (r.ok) {
        state.preferences[k] = (obj[k] === undefined) ? null : obj[k];
        anyChanged = true;
      }
    });
    if (anyChanged) {
      var ok = _write(state);
      if (ok) _notify();
      return ok;
    }
    return false;
  }

  function reset() {
    var state = _read() || _defaults();
    state.preferences = Object.assign({}, DEFAULT_PREFERENCES);
    var ok = _write(state);
    if (ok) _notify();
    return ok;
  }

  function clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      _notify();
      return true;
    } catch (e) {
      return false;
    }
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    _listeners.push(fn);
    return function () {
      var idx = _listeners.indexOf(fn);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  }

  /**
   * buildContextPayload() → { preferences: {...} } | null
   * Returns a context payload to include in the AI envelope.
   * Returns null if memory is disabled or no preferences are set.
   */
  function buildContextPayload() {
    if (!isEnabled()) return null;
    var prefs = getPreferences();
    var hasAny = false;
    var payload = {};
    Object.keys(prefs).forEach(function (k) {
      if (prefs[k] !== null && prefs[k] !== undefined) {
        payload[k] = prefs[k];
        hasAny = true;
      }
    });
    if (!hasAny) return null;
    return { preferences: payload };
  }

  function getAllowedKeys() {
    return Object.keys(ALLOWED_KEYS).slice();
  }

  return {
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    getPreferences: getPreferences,
    setPreference: setPreference,
    setPreferences: setPreferences,
    reset: reset,
    clearAll: clearAll,
    onChange: onChange,
    buildContextPayload: buildContextPayload,
    getAllowedKeys: getAllowedKeys,
    validateValue: validateValue,
    ALLOWED_KEYS: ALLOWED_KEYS,
    DEFAULT_PREFERENCES: Object.assign({}, DEFAULT_PREFERENCES),
    STORAGE_KEY: STORAGE_KEY,
    VERSION: VERSION,
    MAX_SERIALIZED_BYTES: MAX_SERIALIZED_BYTES,
  };
});
