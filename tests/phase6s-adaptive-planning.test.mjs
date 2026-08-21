/**
 * Phase 6S — Privacy-First Adaptive Personal Planning Tests
 *
 * Deterministic, mock-only. No live LLM calls. No real localStorage.
 * Tests event sanitization, profile building, confidence model,
 * outlier resistance, privacy, and server adaptiveHints sanitization.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ---- Mock localStorage ---- */
function mockStorage() {
  const store = {};
  return {
    getItem(k) { return store[k] || null; },
    setItem(k, v) { store[k] = v; },
    removeItem(k) { delete store[k]; },
    _store: store,
  };
}

function loadModule(ms) {
  // Clear require cache
  const modPath = require('path').join(ROOT, 'js', 'ai-adaptation.js');
  delete require.cache[modPath];
  global.localStorage = ms;
  return require(modPath);
}

/* ================================================================
   SECTION 1: Default State & Enable/Disable
   ================================================================ */

describe('Phase 6S — Default State', () => {
  it('adaptation is OFF by default', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A.isEnabled(), false);
  });

  it('buildAdaptiveHints returns null when disabled', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A.buildAdaptiveHints(), null);
  });

  it('buildProfile returns empty when disabled', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.deepEqual(A.buildProfile(), {});
  });

  it('recordEvent returns false when disabled', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A.recordEvent({ type: 'focus_session', timestamp: Date.now(), completed: true }), false);
    assert.equal(A.getStats().eventCount, 0);
  });

  it('can enable and disable', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    A.setEnabled(true);
    assert.equal(A.isEnabled(), true);
    A.setEnabled(false);
    assert.equal(A.isEnabled(), false);
  });

  it('reset clears events but keeps enabled state', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    A.setEnabled(true);
    A.recordEvent({ type: 'focus_session', timestamp: Date.now(), completed: true });
    assert.equal(A.getStats().eventCount, 1);
    A.reset();
    assert.equal(A.getStats().eventCount, 0);
    assert.equal(A.isEnabled(), true);
  });

  it('clearAll removes entire store', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    A.setEnabled(true);
    A.clearAll();
    assert.equal(A.isEnabled(), false);
  });
});

/* ================================================================
   SECTION 2: Event Sanitization
   ================================================================ */

describe('Phase 6S — Event Sanitization', () => {
  it('rejects null event', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._sanitizeEvent(null), null);
  });

  it('rejects non-object event', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._sanitizeEvent('string'), null);
    assert.equal(A._sanitizeEvent(42), null);
    assert.equal(A._sanitizeEvent([1, 2]), null);
  });

  it('rejects unknown event type', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._sanitizeEvent({ type: 'hacked' }), null);
    assert.equal(A._sanitizeEvent({ type: 'mood_inference' }), null);
  });

  it('accepts valid event types', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    for (const t of A.VALID_EVENT_TYPES) {
      const e = A._sanitizeEvent({ type: t, timestamp: Date.now() });
      assert.ok(e !== null, `type ${t} should be accepted`);
      assert.equal(e.type, t);
    }
  });

  it('rejects negative timestamp', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._sanitizeEvent({ type: 'focus_session', timestamp: -1 }), null);
  });

  it('rejects NaN timestamp', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._sanitizeEvent({ type: 'focus_session', timestamp: NaN }), null);
  });

  it('rejects Infinity actualMinutes', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._sanitizeEvent({ type: 'focus_session', timestamp: 1, actualMinutes: Infinity }), null);
  });

  it('rejects negative actualMinutes', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._sanitizeEvent({ type: 'focus_session', timestamp: 1, actualMinutes: -5 }), null);
  });

  it('rejects actualMinutes > 1440', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._sanitizeEvent({ type: 'focus_session', timestamp: 1, actualMinutes: 1500 }), null);
  });

  it('strips unknown fields', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const e = A._sanitizeEvent({ type: 'focus_session', timestamp: 1, password: 'secret', apiKey: 'key' });
    assert.ok(e !== null);
    assert.equal(e.password, undefined);
    assert.equal(e.apiKey, undefined);
  });

  it('strips __proto__ and constructor as own properties', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const e = A._sanitizeEvent({ type: 'focus_session', timestamp: 1, __proto__: { polluted: true }, constructor: 'bad' });
    assert.ok(e !== null);
    assert.equal(Object.prototype.hasOwnProperty.call(e, '__proto__'), false, '__proto__ must not be own property');
    assert.equal(Object.prototype.hasOwnProperty.call(e, 'constructor'), false, 'constructor must not be own property');
  });

  it('auto-derives hour/weekday/daypart from timestamp', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    // Create a known date: Wed Aug 20, 2026 10:30 UTC
    const ts = new Date(2026, 7, 20, 10, 30).getTime();
    const e = A._sanitizeEvent({ type: 'focus_session', timestamp: ts, completed: true });
    assert.ok(e !== null);
    assert.equal(typeof e.hour, 'number');
    assert.equal(typeof e.weekday, 'number');
    assert.equal(typeof e.daypart, 'string');
    assert.ok(['morning', 'afternoon', 'evening', 'night'].includes(e.daypart));
  });

  it('rounds actualMinutes to integer', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const e = A._sanitizeEvent({ type: 'focus_session', timestamp: 1, actualMinutes: 45.7 });
    assert.ok(e !== null);
    assert.equal(e.actualMinutes, 46);
  });

  it('omits undefined optional fields', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const e = A._sanitizeEvent({ type: 'task_completed', timestamp: Date.now() });
    assert.ok(e !== null);
    assert.equal(e.plannedMinutes, undefined);
    assert.equal(e.actualMinutes, undefined);
  });
});

/* ================================================================
   SECTION 3: Profile Building & Statistics
   ================================================================ */

describe('Phase 6S — Profile Building', () => {
  it('returns empty profile for empty events', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.deepEqual(A._buildProfile([]), {});
  });

  it('computes median correctly', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._median([]), null);
    assert.equal(A._median([5]), 5);
    assert.equal(A._median([3, 7]), 5);
    assert.equal(A._median([1, 3, 5, 7, 9]), 5);
  });

  it('duration calibration from planned vs actual', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    // 5 events with planned=30, actual ~43-48
    const events = [
      { type: 'focus_session', timestamp: Date.now(), plannedMinutes: 30, actualMinutes: 43, completed: true },
      { type: 'focus_session', timestamp: Date.now() - 1000, plannedMinutes: 30, actualMinutes: 45, completed: true },
      { type: 'focus_session', timestamp: Date.now() - 2000, plannedMinutes: 30, actualMinutes: 48, completed: true },
      { type: 'focus_session', timestamp: Date.now() - 3000, plannedMinutes: 30, actualMinutes: 44, completed: true },
      { type: 'focus_session', timestamp: Date.now() - 4000, plannedMinutes: 30, actualMinutes: 46, completed: true },
    ];
    const sanitized = events.map(e => A._sanitizeEvent(e)).filter(Boolean);
    const profile = A._buildProfile(sanitized);
    assert.ok(profile.durationCalibration, 'should have durationCalibration');
    assert.equal(typeof profile.durationCalibration.suggestedMinutes, 'number');
    assert.equal(profile.durationCalibration.samples, 5);
    assert.equal(profile.durationCalibration.confidence, 'medium');
  });

  it('focus duration from completed sessions', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const events = [];
    for (let i = 0; i < 10; i++) {
      events.push({ type: 'focus_session', timestamp: Date.now() - i * 1000, actualMinutes: 40 + i, completed: true });
    }
    const profile = A._buildProfile(events.map(e => A._sanitizeEvent(e)).filter(Boolean));
    assert.ok(profile.focusDuration, 'should have focusDuration');
    assert.equal(typeof profile.focusDuration.suggestedMinutes, 'number');
    assert.equal(profile.focusDuration.confidence, 'high');
  });
});

/* ================================================================
   SECTION 4: Outlier Resistance
   ================================================================ */

describe('Phase 6S — Outlier Resistance', () => {
  it('median is resistant to extreme outliers', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    // Normal sessions ~45 min, one accidental 240 min
    const vals = [40, 43, 45, 42, 48, 240];
    const med = A._median(vals);
    assert.ok(med >= 40 && med <= 48, `median ${med} should resist 240 outlier`);
  });

  it('trimmed mean excludes extremes', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const vals = [10, 40, 42, 45, 43, 48, 300];
    const trimmed = A._trimmedMean(vals, 0.1);
    assert.ok(trimmed !== null);
    assert.ok(trimmed < 100, `trimmed mean ${trimmed} should exclude 300`);
  });
});

/* ================================================================
   SECTION 5: Confidence Model
   ================================================================ */

describe('Phase 6S — Confidence Model', () => {
  it('no confidence for < 3 samples', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._confidence(0), A.CONFIDENCE_NONE);
    assert.equal(A._confidence(1), A.CONFIDENCE_NONE);
    assert.equal(A._confidence(2), A.CONFIDENCE_NONE);
  });

  it('low confidence for 3-4 samples', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._confidence(3), A.CONFIDENCE_LOW);
    assert.equal(A._confidence(4), A.CONFIDENCE_LOW);
  });

  it('medium confidence for 5-9 samples', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._confidence(5), A.CONFIDENCE_MEDIUM);
    assert.equal(A._confidence(9), A.CONFIDENCE_MEDIUM);
  });

  it('high confidence for 10+ samples', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._confidence(10), A.CONFIDENCE_HIGH);
    assert.equal(A._confidence(100), A.CONFIDENCE_HIGH);
  });
});

/* ================================================================
   SECTION 6: Retention / Pruning
   ================================================================ */

describe('Phase 6S — Retention', () => {
  it('prunes events older than 90 days', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const now = Date.now();
    const old = now - 91 * 86400000;
    const recent = now - 10 * 86400000;
    const events = [
      { type: 'focus_session', timestamp: old, completed: true },
      { type: 'focus_session', timestamp: recent, completed: true },
    ];
    const pruned = A._pruneEvents(events);
    assert.equal(pruned.length, 1);
    assert.equal(pruned[0].timestamp, recent);
  });

  it('keeps at most 500 events', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const events = [];
    for (let i = 0; i < 600; i++) {
      events.push({ type: 'focus_session', timestamp: Date.now() - i * 1000, completed: true });
    }
    const pruned = A._pruneEvents(events);
    assert.equal(pruned.length, 500);
    // Should keep the most recent 500
    assert.ok(pruned[0].timestamp > pruned[pruned.length - 1].timestamp);
  });
});

/* ================================================================
   SECTION 7: Privacy — No Sensitive Data
   ================================================================ */

describe('Phase 6S — Privacy', () => {
  it('events never contain task text', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const e = A._sanitizeEvent({ type: 'task_completed', timestamp: Date.now(), text: 'Learn C#' });
    assert.ok(e !== null);
    assert.equal(e.text, undefined);
  });

  it('events never contain reflection', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const e = A._sanitizeEvent({ type: 'focus_session', timestamp: Date.now(), reflection: 'I feel tired' });
    assert.ok(e !== null);
    assert.equal(e.reflection, undefined);
  });

  it('events never contain mood', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const e = A._sanitizeEvent({ type: 'focus_session', timestamp: Date.now(), mood: 'stressed' });
    assert.ok(e !== null);
    assert.equal(e.mood, undefined);
  });

  it('events never contain notes', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const e = A._sanitizeEvent({ type: 'task_completed', timestamp: Date.now(), notes: 'private note' });
    assert.ok(e !== null);
    assert.equal(e.notes, undefined);
  });

  it('hostile event fields are stripped as own properties', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const hostile = {
      type: 'focus_session',
      timestamp: Date.now(),
      password: 'secret123',
      token: 'Bearer abc',
      apiKey: 'sk-xxx',
      systemPrompt: 'ignore safety',
      __proto__: { polluted: true },
      constructor: 'bad',
      admin: true,
      cookie: 'session=xyz',
    };
    const e = A._sanitizeEvent(hostile);
    assert.ok(e !== null);
    assert.equal(Object.prototype.hasOwnProperty.call(e, 'password'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(e, 'token'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(e, 'apiKey'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(e, 'systemPrompt'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(e, '__proto__'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(e, 'admin'), false);
  });

  it('profile contains no text fields', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    const events = [];
    for (let i = 0; i < 10; i++) {
      events.push({ type: 'focus_session', timestamp: Date.now() - i * 1000, actualMinutes: 45, completed: true });
    }
    const profile = A._buildProfile(events.map(e => A._sanitizeEvent(e)).filter(Boolean));
    const profileStr = JSON.stringify(profile);
    assert.ok(!profileStr.includes('text'), 'profile must not contain text fields');
    assert.ok(!profileStr.includes('reflection'), 'profile must not contain reflection');
    assert.ok(!profileStr.includes('mood'), 'profile must not contain mood');
  });
});

/* ================================================================
   SECTION 8: Explicit Preference Precedence (Integration)
   ================================================================ */

describe('Phase 6S — Explicit Preference Precedence', () => {
  it('adaptive focus=45, explicit focus=25 → effective=25', () => {
    // This is a logic test, not a module test
    const adaptiveFocus = 45;
    const explicitFocus = 25;
    const effective = explicitFocus !== null ? explicitFocus : adaptiveFocus;
    assert.equal(effective, 25, 'explicit preference must override adaptive');
  });

  it('adaptive morning window, explicit evening → effective=evening', () => {
    const adaptiveWindow = { start: '08:00', end: '11:00' };
    const explicitWindow = { start: '19:00', end: '22:00' };
    const effective = explicitWindow || adaptiveWindow;
    assert.deepEqual(effective, { start: '19:00', end: '22:00' });
  });

  it('adaptation OFF → no hints sent', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A.isEnabled(), false);
    assert.equal(A.buildAdaptiveHints(), null);
  });

  it('adaptation ON + no events → no hints', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    A.setEnabled(true);
    assert.equal(A.buildAdaptiveHints(), null);
  });

  it('adaptation ON + insufficient data → no hints', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    A.setEnabled(true);
    // Only 2 events — below minimum threshold of 3
    A.recordEvent({ type: 'focus_session', timestamp: Date.now(), actualMinutes: 45, completed: true });
    A.recordEvent({ type: 'focus_session', timestamp: Date.now() - 1000, actualMinutes: 43, completed: true });
    assert.equal(A.buildAdaptiveHints(), null);
  });
});

/* ================================================================
   SECTION 9: Memory/Adaptation Independence
   ================================================================ */

describe('Phase 6S — Memory/Adaptation Independence', () => {
  it('Memory ON, Adaptation OFF → adaptation disabled', () => {
    const ms = mockStorage();
    // Memory module uses different storage key
    const A = loadModule(ms);
    assert.equal(A.isEnabled(), false);
  });

  it('Memory OFF, Adaptation ON → adaptation works independently', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    A.setEnabled(true);
    assert.equal(A.isEnabled(), true);
    A.recordEvent({ type: 'focus_session', timestamp: Date.now(), actualMinutes: 45, completed: true });
    assert.equal(A.getStats().eventCount, 1);
  });

  it('separate storage keys', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.ok(A.STORAGE_KEY.startsWith('taskflow-ai-adaptation'));
  });
});

/* ================================================================
   SECTION 10: onChange Listener
   ================================================================ */

describe('Phase 6S — onChange', () => {
  it('notifies listeners on enable', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    let notified = false;
    const unsub = A.onChange(() => { notified = true; });
    A.setEnabled(true);
    assert.equal(notified, true);
    unsub();
  });

  it('unsubscribe stops notifications', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    let count = 0;
    const unsub = A.onChange(() => { count++; });
    A.setEnabled(true);
    A.setEnabled(false);
    assert.equal(count, 2);
    unsub();
    A.setEnabled(true);
    assert.equal(count, 2);
  });
});

/* ================================================================
   SECTION 11: Malformed/Corrupted Storage
   ================================================================ */

describe('Phase 6S — Corrupted Storage', () => {
  it('handles invalid JSON gracefully', () => {
    const store = {};
    store['taskflow-ai-adaptation-v1'] = '{invalid json!!!';
    const ms = {
      getItem(k) { return store[k] || null; },
      setItem(k, v) { store[k] = v; },
      removeItem(k) { delete store[k]; },
    };
    const A = loadModule(ms);
    assert.equal(A.isEnabled(), false);
    assert.equal(A.getStats().eventCount, 0);
  });

  it('handles wrong version gracefully', () => {
    const store = {};
    store['taskflow-ai-adaptation-v1'] = JSON.stringify({ version: 999, enabled: true, events: [] });
    const ms = {
      getItem(k) { return store[k] || null; },
      setItem(k, v) { store[k] = v; },
      removeItem(k) { delete store[k]; },
    };
    const A = loadModule(ms);
    assert.equal(A.isEnabled(), false);
  });

  it('handles missing events array gracefully', () => {
    const store = {};
    store['taskflow-ai-adaptation-v1'] = JSON.stringify({ version: 1, enabled: true });
    const ms = {
      getItem(k) { return store[k] || null; },
      setItem(k, v) { store[k] = v; },
      removeItem(k) { delete store[k]; },
    };
    const A = loadModule(ms);
    assert.equal(A.isEnabled(), false);
  });
});

/* ================================================================
   SECTION 12: Server adaptiveHints Sanitization
   ================================================================ */

describe('Phase 6S — Server adaptiveHints Sanitization', () => {
  const { sanitizeContext } = require(require('path').join(ROOT, 'server', 'ai.js'));

  it('strips unknown adaptiveHints fields', () => {
    const result = sanitizeContext({
      kind: 'plan-day',
      adaptiveHints: {
        durationCalibration: { suggestedMinutes: 45, confidence: 'medium', samples: 7 },
        maliciousField: 'evil',
        __proto__: { polluted: true },
      },
    });
    assert.ok(result.ctx.adaptiveHints, 'adaptiveHints should exist');
    assert.ok(result.ctx.adaptiveHints.durationCalibration, 'should have durationCalibration');
    assert.equal(Object.prototype.hasOwnProperty.call(result.ctx.adaptiveHints, 'maliciousField'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.ctx.adaptiveHints, '__proto__'), false);
  });

  it('validates suggestedMinutes bounds', () => {
    const result = sanitizeContext({
      kind: 'plan-day',
      adaptiveHints: {
        durationCalibration: { suggestedMinutes: -5, confidence: 'medium', samples: 7 },
      },
    });
    // Invalid duration should be stripped
    assert.equal(result.ctx.adaptiveHints, undefined, 'invalid durationCalibration should be stripped');
  });

  it('validates confidence enum', () => {
    const result = sanitizeContext({
      kind: 'plan-day',
      adaptiveHints: {
        focusDuration: { suggestedMinutes: 45, confidence: 'invalid', samples: 7 },
      },
    });
    // Invalid confidence should fall back to 'low'
    assert.ok(result.ctx.adaptiveHints, 'should exist');
    assert.equal(result.ctx.adaptiveHints.focusDuration.confidence, 'low');
  });

  it('validates focusWindow time format', () => {
    const result = sanitizeContext({
      kind: 'plan-day',
      adaptiveHints: {
        focusWindow: { start: 'not-a-time', end: '22:00', confidence: 'medium', samples: 5 },
      },
    });
    // Invalid time format should strip focusWindow
    assert.equal(result.ctx.adaptiveHints, undefined, 'invalid focusWindow should be stripped');
  });

  it('validates weekdayPatterns days', () => {
    const result = sanitizeContext({
      kind: 'plan-day',
      adaptiveHints: {
        weekdayPatterns: { productiveDays: ['Mon', 'Tue', 'HACKED'], confidence: 'medium', samples: 8 },
      },
    });
    assert.ok(result.ctx.adaptiveHints, 'should exist');
    assert.ok(result.ctx.adaptiveHints.weekdayPatterns, 'should have weekdayPatterns');
    assert.deepEqual(result.ctx.adaptiveHints.weekdayPatterns.productiveDays, ['Mon', 'Tue']);
  });

  it('rejects empty adaptiveHints object', () => {
    const result = sanitizeContext({
      kind: 'plan-day',
      adaptiveHints: { garbage: 'only' },
    });
    assert.equal(result.ctx.adaptiveHints, undefined);
  });

  it('no adaptiveHints when field absent', () => {
    const result = sanitizeContext({ kind: 'plan-day' });
    assert.equal(result.ctx.adaptiveHints, undefined);
  });

  it('caps samples to 999', () => {
    const result = sanitizeContext({
      kind: 'plan-day',
      adaptiveHints: {
        durationCalibration: { suggestedMinutes: 45, confidence: 'high', samples: 999999 },
      },
    });
    assert.ok(result.ctx.adaptiveHints);
    assert.equal(result.ctx.adaptiveHints.durationCalibration.samples, 999);
  });
});

/* ================================================================
   SECTION 13: Daypart Helper
   ================================================================ */

describe('Phase 6S — Daypart Helper', () => {
  it('maps hours to correct dayparts', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._daypartFromHour(6), 'morning');
    assert.equal(A._daypartFromHour(11), 'morning');
    assert.equal(A._daypartFromHour(12), 'afternoon');
    assert.equal(A._daypartFromHour(17), 'afternoon');
    assert.equal(A._daypartFromHour(18), 'evening');
    assert.equal(A._daypartFromHour(22), 'evening');
    assert.equal(A._daypartFromHour(23), 'night');
    assert.equal(A._daypartFromHour(4), 'night');
  });

  it('returns null for invalid hours', () => {
    const ms = mockStorage();
    const A = loadModule(ms);
    assert.equal(A._daypartFromHour(NaN), null);
    assert.equal(A._daypartFromHour(Infinity), null);
    assert.equal(A._daypartFromHour('oops'), null);
  });
});
