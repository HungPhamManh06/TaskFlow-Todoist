'use strict';

/**
 * Phase 6T — AI Feedback Store
 *
 * Local-only, bounded feedback for AI proposal ratings.
 * Stores: { feature, rating, reason?, timestamp }
 * No task text, no proposal content, no chat transcript.
 * Max 200 entries, 90-day retention.
 */
(function (g) {
  var STORAGE_KEY = 'taskflow-ai-feedback-v1';
  var VERSION = 1;
  var MAX_ENTRIES = 200;
  var MAX_RETENTION_DAYS = 90;
  var VALID_RATINGS = ['helpful', 'not-helpful'];
  var VALID_REASONS = ['too-many-changes', 'wrong-timing', 'missed-context', 'not-relevant', null];
  var ALLOWED_FIELDS = new Set(['feature', 'rating', 'reason', 'timestamp']);

  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.version === VERSION && Array.isArray(parsed.entries)) {
        return { version: VERSION, entries: parsed.entries };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function _save(store) {
    try {
      var str = JSON.stringify(store);
      if (str.length > 16384) return false;
      localStorage.setItem(STORAGE_KEY, str);
      return true;
    } catch (e) {
      return false;
    }
  }

  function _prune(entries) {
    var cutoff = Date.now() - MAX_RETENTION_DAYS * 86400000;
    var pruned = [];
    for (var i = 0; i < entries.length; i++) {
      if (entries[i] && typeof entries[i].timestamp === 'number' && entries[i].timestamp >= cutoff) {
        pruned.push(entries[i]);
      }
    }
    while (pruned.length > MAX_ENTRIES) pruned.shift();
    return pruned;
  }

  function _sanitize(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    var out = {};
    for (var k of ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(entry, k)) {
        if (k === 'feature') {
          out.feature = typeof entry.feature === 'string' && entry.feature.length <= 64 ? entry.feature : null;
        } else if (k === 'rating') {
          out.rating = VALID_RATINGS.indexOf(entry.rating) !== -1 ? entry.rating : null;
        } else if (k === 'reason') {
          out.reason = VALID_REASONS.indexOf(entry.reason) !== -1 ? entry.reason : null;
        } else if (k === 'timestamp') {
          var ts = Number(entry.timestamp);
          if (isFinite(ts) && ts > 0 && ts <= Date.now() + 300000) {
            out.timestamp = Math.round(ts);
          }
        }
      }
    }
    return out.feature && out.rating && out.timestamp ? out : null;
  }

  function recordFeedback(entry) {
    var sanitized = _sanitize(entry);
    if (!sanitized) return false;
    var store = _load() || { version: VERSION, entries: [] };
    store.entries = _prune(store.entries);
    store.entries.push(sanitized);
    store.entries = _prune(store.entries);
    return _save(store);
  }

  function getFeedback() {
    var store = _load();
    return store ? store.entries : [];
  }

  function getStats() {
    var entries = getFeedback();
    var helpful = 0, notHelpful = 0;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].rating === 'helpful') helpful++;
      else if (entries[i].rating === 'not-helpful') notHelpful++;
    }
    return { total: entries.length, helpful: helpful, notHelpful: notHelpful };
  }

  function clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  var ns = {
    recordFeedback: recordFeedback,
    getFeedback: getFeedback,
    getStats: getStats,
    clearAll: clearAll,
    STORAGE_KEY: STORAGE_KEY,
    VERSION: VERSION,
    MAX_ENTRIES: MAX_ENTRIES,
    MAX_RETENTION_DAYS: MAX_RETENTION_DAYS,
    VALID_RATINGS: VALID_RATINGS,
    VALID_REASONS: VALID_REASONS,
    _sanitize: _sanitize,
    _prune: _prune
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ns;
  } else {
    g.TaskFlowAIFeedback = ns;
  }
})(typeof window !== 'undefined' ? window : globalThis);
