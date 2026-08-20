/**
 * TaskFlow — Phase 6A: Sensitive AI Context Consent Store
 * -------------------------------------------------------
 * window.TaskFlowAIContextConsent — persistent opt-in store for
 * sensitive data categories (Reflection, Mood).
 *
 * Guarantees:
 * - LOCAL ONLY: never sends consent state to server/Gemini.
 * - DEFAULT OFF: both reflections and mood start as OFF.
 * - INDEPENDENT: granting reflection does NOT grant mood and vice versa.
 * - PERSISTENT: stored in localStorage under 'ai-context-consent'.
 * - SAFE FALLBACK: any read failure returns defaults (all OFF).
 * - DETERMINISTIC: same store → same permissions.
 *
 * Public API:
 * - getPermissions() → { reflections: boolean, mood: boolean }
 * - setPermission(key, value) → boolean (true if saved)
 * - toggle(key) → new value
 * - reset() → defaults (both OFF)
 * - isSensitive(key) → boolean
 * - getSensitiveKeys() → string[]
 * - onChange(fn) → unsubscribe function
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAIContextConsent = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var STORAGE_KEY = 'ai-context-consent';
  var VERSION = 1;

  var SENSITIVE_KEYS = ['reflections', 'mood'];

  var DEFAULT_PERMISSIONS = {};
  SENSITIVE_KEYS.forEach(function (k) { DEFAULT_PERMISSIONS[k] = false; });

  var _listeners = [];

  /* ---- localStorage helpers ---- */

  function _read() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.version === VERSION && typeof parsed.permissions === 'object') {
        return parsed.permissions;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function _write(permissions) {
    try {
      var data = { version: VERSION, permissions: permissions, updatedAt: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function _notify() {
    var perms = getPermissions();
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](perms); } catch (e) { /* never break */ }
    }
  }

  /* ---- Public API ---- */

  /**
   * getPermissions() → { reflections: boolean, mood: boolean }
   * Returns current consent state. Falls back to defaults on any error.
   */
  function getPermissions() {
    var stored = _read();
    var out = {};
    SENSITIVE_KEYS.forEach(function (k) {
      out[k] = (stored && typeof stored[k] === 'boolean') ? stored[k] : DEFAULT_PERMISSIONS[k];
    });
    return out;
  }

  /**
   * setPermission(key, value) → boolean
   * Sets a single sensitive permission. Returns true if saved.
   * Only accepts known sensitive keys.
   */
  function setPermission(key, value) {
    if (SENSITIVE_KEYS.indexOf(key) === -1) return false;
    var perms = getPermissions();
    perms[key] = !!value;
    var ok = _write(perms);
    if (ok) _notify();
    return ok;
  }

  /**
   * toggle(key) → new boolean value
   * Toggles a single sensitive permission. Returns the new value.
   */
  function toggle(key) {
    if (SENSITIVE_KEYS.indexOf(key) === -1) return false;
    var perms = getPermissions();
    var newVal = !perms[key];
    perms[key] = newVal;
    _write(perms);
    _notify();
    return newVal;
  }

  /**
   * reset() → void
   * Resets all permissions to defaults (all OFF).
   */
  function reset() {
    var perms = {};
    SENSITIVE_KEYS.forEach(function (k) { perms[k] = false; });
    _write(perms);
    _notify();
  }

  /**
   * isSensitive(key) → boolean
   */
  function isSensitive(key) {
    return SENSITIVE_KEYS.indexOf(key) !== -1;
  }

  /**
   * getSensitiveKeys() → string[]
   */
  function getSensitiveKeys() {
    return SENSITIVE_KEYS.slice();
  }

  /**
   * onChange(fn) → unsubscribe function
   * Register a listener for permission changes.
   */
  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    _listeners.push(fn);
    return function () {
      var idx = _listeners.indexOf(fn);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  }

  /**
   * buildPermissions() → full permissions object
   * Returns a complete permissions object with safe defaults (true)
   * for non-sensitive keys and user-controlled values for sensitive keys.
   * This is the object to pass to prepare() / build().
   */
  function buildPermissions() {
    var consent = getPermissions();
    return {
      tasks: true,
      projects: true,
      schedule: true,
      habits: true,
      reflections: consent.reflections,
      mood: consent.mood,
    };
  }

  return {
    getPermissions: getPermissions,
    setPermission: setPermission,
    toggle: toggle,
    reset: reset,
    isSensitive: isSensitive,
    getSensitiveKeys: getSensitiveKeys,
    onChange: onChange,
    buildPermissions: buildPermissions,
    SENSITIVE_KEYS: SENSITIVE_KEYS.slice(),
    DEFAULT_PERMISSIONS: Object.assign({}, DEFAULT_PERMISSIONS),
    STORAGE_KEY: STORAGE_KEY,
  };
});
