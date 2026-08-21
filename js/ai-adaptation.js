/**
 * js/ai-adaptation.js — Phase 6S: Privacy-First Adaptive Personal Planning
 * ---------------------------------------------------------------------------
 * window.TaskFlowAIAdaptation — deterministic, local-only behavioral learning.
 *
 * Guarantees:
 * - LOCAL ONLY: never synced, never sent to server/Gemini directly.
 * - DEFAULT OFF: master switch starts as OFF.
 * - DETERMINISTIC: same events → same profile.
 * - ADVISORY ONLY: never mutates tasks, deadlines, projects, milestones, or settings.
 * - PRIVACY: no task text, no reflection, no mood, no chat content.
 * - SIZE-BOUNDED: ≤ 32 KB serialized.
 * - RETENTION-BOUNDED: ≤ 90 days and/or ≤ 500 events.
 * - INDEPENDENT: enabling Adaptation does NOT enable Memory, and vice-versa.
 *
 * Public API:
 * - isEnabled() → boolean
 * - setEnabled(value) → boolean
 * - recordEvent(event) → boolean
 * - buildProfile() → { durationCalibration, focusWindow, focusDuration, ... }
 * - buildAdaptiveHints() → object | null
 * - getStats() → { eventCount, ... }
 * - reset() → boolean
 * - clearAll() → boolean
 * - onChange(fn) → unsubscribe function
 * - STORAGE_KEY: string (exposed for tests)
 * - VERSION: number (exposed for tests)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAIAdaptation = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var STORAGE_KEY = 'taskflow-ai-adaptation-v1';
  var VERSION = 1;
  var MAX_SERIALIZED_BYTES = 32768; // 32 KB
  var MAX_EVENTS = 500;
  var MAX_RETENTION_DAYS = 90;
  var MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // 5 minutes clock skew allowance

  /* ---- Confidence thresholds ---- */
  var CONFIDENCE_NONE = 'none';
  var CONFIDENCE_LOW = 'low';
  var CONFIDENCE_MEDIUM = 'medium';
  var CONFIDENCE_HIGH = 'high';
  var MIN_SAMPLES_LOW = 3;
  var MIN_SAMPLES_MEDIUM = 5;
  var MIN_SAMPLES_HIGH = 10;

  /* ---- Allowed event types ---- */
  var VALID_EVENT_TYPES = [
    'focus_session',
    'task_scheduled',
    'task_completed',
    'task_estimated',
  ];

  /* ---- Allowed event fields (sanitize on record) ---- */
  var EVENT_FIELDS = new Set([
    'type', 'timestamp', 'plannedMinutes', 'actualMinutes',
    'completed', 'hour', 'weekday', 'daypart', 'sessionId',
  ]);

  /* ---- Allowed profile hint keys ---- */
  var HINT_KEYS = new Set([
    'durationCalibration', 'focusWindow', 'focusDuration', 'weekdayPatterns', 'rescheduleRisk',
  ]);

  var _listeners = [];

  /* ---- Date helpers ---- */
  function _daypartFromHour(h) {
    if (typeof h !== 'number' || !isFinite(h)) return null;
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 18) return 'afternoon';
    if (h >= 18 && h < 23) return 'evening';
    return 'night';
  }

  function _weekdayFromTimestamp(ts) {
    var d = new Date(ts);
    return isFinite(d.getTime()) ? d.getDay() : null;
  }

  function _hourFromTimestamp(ts) {
    var d = new Date(ts);
    return isFinite(d.getTime()) ? d.getHours() : null;
  }

  /* ---- Sanitize a single event ---- */
  function _sanitizeEvent(evt) {
    if (!evt || typeof evt !== 'object' || Array.isArray(evt)) return null;
    if (typeof evt.type !== 'string' || VALID_EVENT_TYPES.indexOf(evt.type) === -1) return null;

    var out = {};
    for (var key of EVENT_FIELDS) {
      if (key === 'type') {
        out.type = evt.type;
      } else if (key === 'timestamp') {
        var ts = Number(evt.timestamp);
        if (!isFinite(ts) || ts <= 0) return null;
        // Reject unreasonable future timestamps
        var now = (typeof evt._now === 'number') ? evt._now : Date.now();
        if (ts > now + MAX_FUTURE_SKEW_MS) return null;
        out.timestamp = ts;
      } else if (key === 'plannedMinutes' || key === 'actualMinutes') {
        var v = evt[key];
        if (v === null || v === undefined) {
          // omit
        } else {
          v = Number(v);
          if (!isFinite(v) || v < 0 || v > 1440) return null;
          out[key] = Math.round(v);
        }
      } else if (key === 'completed') {
        out.completed = !!evt.completed;
      } else if (key === 'hour') {
        var h = Number(evt.hour);
        if (!isFinite(h)) {
          // derive from timestamp
          h = _hourFromTimestamp(evt.timestamp);
          if (h !== null) out.hour = h;
        } else if (h >= 0 && h <= 23) {
          out.hour = Math.floor(h);
        }
      } else if (key === 'weekday') {
        var w = Number(evt.weekday);
        if (!isFinite(w)) {
          w = _weekdayFromTimestamp(evt.timestamp);
          if (w !== null) out.weekday = w;
        } else if (w >= 0 && w <= 6) {
          out.weekday = Math.floor(w);
        }
      } else if (key === 'daypart') {
        if (typeof evt.daypart === 'string' && ['morning', 'afternoon', 'evening', 'night'].indexOf(evt.daypart) !== -1) {
          out.daypart = evt.daypart;
        }
      } else if (key === 'sessionId') {
        if (typeof evt.sessionId === 'string' && evt.sessionId.length <= 64) {
          out.sessionId = evt.sessionId;
        }
      }
    }

    // Auto-derive daypart/hour/weekday from timestamp if missing
    if (out.timestamp) {
      if (out.hour === undefined) out.hour = _hourFromTimestamp(out.timestamp);
      if (out.weekday === undefined) out.weekday = _weekdayFromTimestamp(out.timestamp);
      if (out.daypart === undefined) out.daypart = _daypartFromHour(out.hour);
    }

    return out;
  }

  /* ---- Stats helpers ---- */
  function _confidence(sampleCount) {
    if (sampleCount >= MIN_SAMPLES_HIGH) return CONFIDENCE_HIGH;
    if (sampleCount >= MIN_SAMPLES_MEDIUM) return CONFIDENCE_MEDIUM;
    if (sampleCount >= MIN_SAMPLES_LOW) return CONFIDENCE_LOW;
    return CONFIDENCE_NONE;
  }

  function _median(arr) {
    if (!arr.length) return null;
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function _trimmedMean(arr, trimPct) {
    if (!arr.length) return null;
    var trim = Math.floor(arr.length * (trimPct || 0.1));
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var trimmed = sorted.slice(trim, sorted.length - trim || sorted.length);
    if (!trimmed.length) return null;
    var sum = 0;
    for (var i = 0; i < trimmed.length; i++) sum += trimmed[i];
    return Math.round(sum / trimmed.length);
  }

  function _mode(arr) {
    if (!arr.length) return null;
    var freq = {};
    var maxFreq = 0;
    var maxVal = null;
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      freq[v] = (freq[v] || 0) + 1;
      if (freq[v] > maxFreq) { maxFreq = freq[v]; maxVal = v; }
    }
    return maxVal;
  }

  /* ---- Retention pruning ---- */
  function _pruneEvents(events) {
    var now = Date.now();
    var cutoff = now - MAX_RETENTION_DAYS * 86400000;
    var pruned = [];
    for (var i = 0; i < events.length; i++) {
      if (events[i].timestamp >= cutoff) pruned.push(events[i]);
    }
    // Rolling window: keep at most MAX_EVENTS (newest first)
    if (pruned.length > MAX_EVENTS) {
      pruned = pruned.slice(pruned.length - MAX_EVENTS);
    }
    return pruned;
  }

  /* ---- localStorage ---- */
  function _read() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.version === VERSION && Array.isArray(parsed.events)) {
        return { enabled: !!parsed.enabled, events: parsed.events };
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
        events: state.events || [],
        updatedAt: Date.now(),
      };
      var serialized = JSON.stringify(data);
      if (serialized.length > MAX_SERIALIZED_BYTES) return false;
      localStorage.setItem(STORAGE_KEY, serialized);
      return true;
    } catch (e) {
      return false;
    }
  }

  function _notify() {
    var state = _read() || { enabled: false, events: [] };
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](state); } catch (e) { /* never break */ }
    }
  }

  function _defaults() {
    return { enabled: false, events: [] };
  }

  /* ---- Profile building ---- */
  function _buildProfile(events) {
    if (!events || !events.length) return {};

    var profile = {};

    // 1. Duration calibration: planned vs actual
    var durations = [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.plannedMinutes && e.actualMinutes) {
        durations.push({ planned: e.plannedMinutes, actual: e.actualMinutes });
      }
    }
    if (durations.length >= MIN_SAMPLES_LOW) {
      var plannedVals = durations.map(function (d) { return d.planned; });
      var actualVals = durations.map(function (d) { return d.actual; });
      var medianPlanned = _median(plannedVals);
      var medianActual = _median(actualVals);
      if (medianPlanned !== null && medianActual !== null && medianPlanned > 0) {
        profile.durationCalibration = {
          suggestedMinutes: medianActual,
          confidence: _confidence(durations.length),
          samples: durations.length,
        };
      }
    }

    // 2. Focus duration learning: actual completed session lengths
    var completedDurations = [];
    for (var j = 0; j < events.length; j++) {
      var ev = events[j];
      if (ev.type === 'focus_session' && ev.completed && ev.actualMinutes) {
        completedDurations.push(ev.actualMinutes);
      }
    }
    if (completedDurations.length >= MIN_SAMPLES_LOW) {
      var medFocus = _median(completedDurations);
      if (medFocus !== null) {
        profile.focusDuration = {
          suggestedMinutes: medFocus,
          confidence: _confidence(completedDurations.length),
          samples: completedDurations.length,
        };
      }
    }

    // 3. Work window: most productive daypart
    var dayparts = [];
    for (var k = 0; k < events.length; k++) {
      var ek = events[k];
      if (ek.completed && ek.daypart) {
        dayparts.push(ek.daypart);
      }
    }
    if (dayparts.length >= MIN_SAMPLES_MEDIUM) {
      var bestDaypart = _mode(dayparts);
      if (bestDaypart) {
        // Map daypart to rough hour ranges
        // Do NOT emit overnight focusWindow (22:00-01:00) — unsafe for same-day planner.
        // Night pattern still contributes to profile/daypart display, but not focusWindow.
        var ranges = { morning: '08:00-11:00', afternoon: '13:00-17:00', evening: '19:00-22:00' };
        var range = ranges[bestDaypart];
        if (range) {
          var parts = range.split('-');
          profile.focusWindow = {
            start: parts[0],
            end: parts[1],
            confidence: _confidence(dayparts.length),
            samples: dayparts.length,
            daypart: bestDaypart,
          };
        }
      }
    }

    // 4. Weekday patterns: which days have most completions
    var weekdayCompletions = {};
    var totalWeekdays = 0;
    for (var w = 0; w < events.length; w++) {
      var ew = events[w];
      if (ew.completed && typeof ew.weekday === 'number' && ew.weekday >= 0 && ew.weekday <= 6) {
        weekdayCompletions[ew.weekday] = (weekdayCompletions[ew.weekday] || 0) + 1;
        totalWeekdays++;
      }
    }
    if (totalWeekdays >= MIN_SAMPLES_MEDIUM) {
      // Find days with above-average completions
      var avgPerDay = totalWeekdays / 7;
      var productiveDays = [];
      var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (var d = 0; d < 7; d++) {
        if ((weekdayCompletions[d] || 0) > avgPerDay) {
          productiveDays.push(dayNames[d]);
        }
      }
      if (productiveDays.length > 0 && productiveDays.length < 7) {
        profile.weekdayPatterns = {
          productiveDays: productiveDays,
          confidence: _confidence(totalWeekdays),
          samples: totalWeekdays,
        };
      }
    }

    return profile;
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

  function recordEvent(event) {
    if (!isEnabled()) return false;
    var sanitized = _sanitizeEvent(event);
    if (!sanitized) return false;
    // Dedupe: reject if sessionId already recorded
    if (sanitized.sessionId) {
      var state = _read() || _defaults();
      var events = state.events || [];
      for (var i = 0; i < events.length; i++) {
        if (events[i].sessionId === sanitized.sessionId) return false;
      }
    }
    var state = _read() || _defaults();
    state.events = _pruneEvents(state.events || []);
    state.events.push(sanitized);
    state.events = _pruneEvents(state.events);
    var ok = _write(state);
    if (ok) _notify();
    return ok;
  }

  function buildProfile() {
    var state = _read();
    if (!state || !state.enabled || !state.events) return {};
    return _buildProfile(state.events);
  }

  function buildAdaptiveHints() {
    if (!isEnabled()) return null;
    var profile = buildProfile();
    var hasAny = false;
    var hints = {};
    if (profile.durationCalibration) { hints.durationCalibration = profile.durationCalibration; hasAny = true; }
    if (profile.focusDuration) { hints.focusDuration = profile.focusDuration; hasAny = true; }
    if (profile.focusWindow) { hints.focusWindow = profile.focusWindow; hasAny = true; }
    if (profile.weekdayPatterns) { hints.weekdayPatterns = profile.weekdayPatterns; hasAny = true; }
    return hasAny ? hints : null;
  }

  function getStats() {
    var state = _read();
    if (!state || !state.events) return { eventCount: 0 };
    var events = state.events;
    var eventCount = events.length;
    var oldest = eventCount > 0 ? events[0].timestamp : null;
    var newest = eventCount > 0 ? events[eventCount - 1].timestamp : null;
    return { eventCount: eventCount, oldest: oldest, newest: newest };
  }

  function reset() {
    var state = _read() || _defaults();
    state.events = [];
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

  return {
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    recordEvent: recordEvent,
    buildProfile: buildProfile,
    buildAdaptiveHints: buildAdaptiveHints,
    getStats: getStats,
    reset: reset,
    clearAll: clearAll,
    onChange: onChange,
    STORAGE_KEY: STORAGE_KEY,
    VERSION: VERSION,
    MAX_SERIALIZED_BYTES: MAX_SERIALIZED_BYTES,
    MAX_EVENTS: MAX_EVENTS,
    MAX_RETENTION_DAYS: MAX_RETENTION_DAYS,
    VALID_EVENT_TYPES: VALID_EVENT_TYPES,
    CONFIDENCE_NONE: CONFIDENCE_NONE,
    CONFIDENCE_LOW: CONFIDENCE_LOW,
    CONFIDENCE_MEDIUM: CONFIDENCE_MEDIUM,
    CONFIDENCE_HIGH: CONFIDENCE_HIGH,
    MIN_SAMPLES_LOW: MIN_SAMPLES_LOW,
    MIN_SAMPLES_MEDIUM: MIN_SAMPLES_MEDIUM,
    MIN_SAMPLES_HIGH: MIN_SAMPLES_HIGH,
    // Expose for testing
    _sanitizeEvent: _sanitizeEvent,
    _buildProfile: _buildProfile,
    _median: _median,
    _trimmedMean: _trimmedMean,
    _confidence: _confidence,
    _pruneEvents: _pruneEvents,
    _daypartFromHour: _daypartFromHour,
  };
});
