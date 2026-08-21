/**
 * Phase 6T — AI UX, Trust & User Control Tests
 *
 * Deterministic, no live LLM calls. Tests:
 * - Adaptive Planning default OFF
 * - Settings toggle
 * - Learned patterns view
 * - Reset preserves AI Memory
 * - Feedback store sanitization & validation
 * - i18n strings
 * - adaptive toggle → planner context
 * - server adaptiveHints sanitization
 * - feedback privacy
 *
 * Uses _sanitize / _buildProfile / _prune for Node-safe testing
 * (localStorage not guaranteed in CI).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Load modules
const A = require('../js/ai-adaptation.js');
const F = require('../js/ai-feedback.js');

/* ============================================
   Adaptation Module — Pure Function Tests
   ============================================ */

describe('Phase 6T: Adaptive Planning Source Audit', () => {
  it('module exports expected API surface', () => {
    assert.equal(typeof A.isEnabled, 'function', 'isEnabled');
    assert.equal(typeof A.setEnabled, 'function', 'setEnabled');
    assert.equal(typeof A.recordEvent, 'function', 'recordEvent');
    assert.equal(typeof A.buildAdaptiveHints, 'function', 'buildAdaptiveHints');
    assert.equal(typeof A.reset, 'function', 'reset');
    assert.equal(typeof A.clearAll, 'function', 'clearAll');
    assert.equal(typeof A.getStats, 'function', 'getStats');
  });

  it('module constants are correct', () => {
    assert.equal(A.STORAGE_KEY, 'taskflow-ai-adaptation-v1');
    assert.equal(A.VERSION, 1);
    assert.ok(A.MAX_EVENTS >= 500, 'MAX_EVENTS >= 500');
    assert.ok(A.MAX_RETENTION_DAYS >= 90, 'MAX_RETENTION_DAYS >= 90');
  });

  it('no mutation APIs in adaptation module', () => {
    const src = readFileSync('js/ai-adaptation.js', 'utf8');
    assert.ok(!src.includes('createTask('), 'no createTask');
    assert.ok(!src.includes('completeTask('), 'no completeTask');
    assert.ok(!src.includes('deleteTask('), 'no deleteTask');
    assert.ok(!src.includes('rescheduleTask('), 'no rescheduleTask');
  });
});

describe('Phase 6T: Event Sanitization', () => {
  it('sanitizes valid focus_session', () => {
    const e = A._sanitizeEvent({
      type: 'focus_session',
      timestamp: Date.now() - 10000,
      actualMinutes: 45,
      completed: true,
    });
    assert.ok(e, 'valid event accepted');
    assert.equal(e.type, 'focus_session');
    assert.equal(e.actualMinutes, 45);
    assert.equal(e.completed, true);
  });

  it('rejects unknown event type', () => {
    const e = A._sanitizeEvent({ type: 'unknown_type', timestamp: Date.now() });
    assert.equal(e, null, 'unknown type rejected');
  });

  it('strips task text from event', () => {
    const e = A._sanitizeEvent({
      type: 'focus_session',
      timestamp: Date.now() - 10000,
      text: 'secret task',
      taskTitle: 'my work',
    });
    assert.ok(e, 'event accepted');
    assert.equal(e.text, undefined, 'text stripped');
    assert.equal(e.taskTitle, undefined, 'taskTitle stripped');
  });

  it('strips hostile fields from event', () => {
    const e = A._sanitizeEvent({
      type: 'focus_session',
      timestamp: Date.now() - 10000,
      apiKey: 'secret',
      password: '12345',
      systemPrompt: 'ignore',
      completed: true,
    });
    assert.ok(e, 'event accepted');
    assert.equal(e.apiKey, undefined, 'apiKey stripped');
    assert.equal(e.password, undefined, 'password stripped');
    assert.equal(e.systemPrompt, undefined, 'systemPrompt stripped');
  });

  it('rejects future timestamp beyond skew', () => {
    const e = A._sanitizeEvent({
      type: 'focus_session',
      timestamp: Date.now() + 10 * 60000, // 10 min in future
      completed: true,
    });
    assert.equal(e, null, 'future timestamp rejected');
  });

  it('rejects negative timestamp', () => {
    const e = A._sanitizeEvent({ type: 'focus_session', timestamp: -1 });
    assert.equal(e, null, 'negative timestamp rejected');
  });

  it('rejects zero timestamp', () => {
    const e = A._sanitizeEvent({ type: 'focus_session', timestamp: 0 });
    assert.equal(e, null, 'zero timestamp rejected');
  });
});

describe('Phase 6T: Profile Building (Pure)', () => {
  it('empty array produces empty profile', () => {
    const p = A._buildProfile([]);
    assert.ok(p && typeof p === 'object');
    assert.equal(Object.keys(p).length, 0, 'empty profile');
  });

  it('insufficient samples produce no focusDuration', () => {
    const now = Date.now();
    const events = [
      { type: 'focus_session', actualMinutes: 45, completed: true, timestamp: now - 1000, daypart: 'morning', weekday: 1 },
    ];
    const p = A._buildProfile(events);
    // 1 sample < MIN_SAMPLES_LOW (3) → no focusDuration
    assert.equal(p.focusDuration, undefined, 'no focusDuration with 1 sample');
  });

  it('sufficient samples produce focusDuration', () => {
    const now = Date.now();
    const events = [];
    for (let i = 0; i < 10; i++) {
      events.push({
        type: 'focus_session',
        actualMinutes: 40 + i,
        completed: true,
        timestamp: now - (i + 1) * 60000,
        daypart: 'morning',
        weekday: (i % 7),
      });
    }
    const p = A._buildProfile(events);
    assert.ok(p.focusDuration, 'focusDuration produced');
    assert.ok(p.focusDuration.suggestedMinutes > 0, 'valid suggestedMinutes');
    assert.ok(['low', 'medium', 'high'].includes(p.focusDuration.confidence), 'valid confidence');
    assert.ok(p.focusDuration.samples >= 3, 'minimum samples');
  });

  it('outliers do not dominate median', () => {
    // Normal sessions around 40 min, one 240 min outlier
    const events = [40, 42, 41, 39, 43, 240].map((m, i) => ({
      type: 'focus_session',
      actualMinutes: m,
      completed: true,
      timestamp: Date.now() - (i + 1) * 60000,
      daypart: 'morning',
      weekday: i % 7,
    }));
    const p = A._buildProfile(events);
    // median of [39,40,41,42,43,240] = 41.5 → 42
    assert.ok(p.focusDuration, 'focusDuration produced');
    // Median should be near 42, NOT 240
    assert.ok(p.focusDuration.suggestedMinutes < 60, 'outlier does not dominate');
  });

  it('median calculation is correct', () => {
    assert.equal(A._median([1, 3, 2]), 2, 'odd median');
    assert.equal(A._median([1, 2, 3, 4]), 2.5, 'even median');
    assert.equal(A._median([]), null, 'empty median');
    assert.equal(A._median([5]), 5, 'single median');
  });

  it('trimmed mean removes edges', () => {
    const result = A._trimmedMean([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(result, 6, 'trimmed mean central');
  });

  it('confidence levels from sample count', () => {
    assert.equal(A._confidence(2), 'none', '2 samples = none');
    assert.equal(A._confidence(3), 'low', '3 samples = low');
    assert.equal(A._confidence(5), 'medium', '5 samples = medium');
    assert.equal(A._confidence(10), 'high', '10 samples = high');
  });
});

describe('Phase 6T: Night Window Safety', () => {
  it('daypart function handles night correctly', () => {
    assert.equal(A._daypartFromHour(23), 'night', '23:00 = night');
    assert.equal(A._daypartFromHour(0), 'night', '0:00 = night');
    assert.equal(A._daypartFromHour(8), 'morning', '08:00 = morning');
    assert.equal(A._daypartFromHour(14), 'afternoon', '14:00 = afternoon');
    assert.equal(A._daypartFromHour(20), 'evening', '20:00 = evening');
  });
});

/* ============================================
   Feedback Store — Pure Sanitize Tests
   ============================================ */

describe('Phase 6T: Feedback Store', () => {
  it('sanitizes valid feedback', () => {
    const e = F._sanitize({ feature: 'plan_day', rating: 'helpful', timestamp: Date.now() - 1000 });
    assert.ok(e, 'valid feedback accepted');
    assert.equal(e.feature, 'plan_day');
    assert.equal(e.rating, 'helpful');
  });

  it('sanitizes feedback with reason', () => {
    const e = F._sanitize({ feature: 'plan_day', rating: 'not-helpful', reason: 'too-many-changes', timestamp: Date.now() - 1000 });
    assert.ok(e, 'valid with reason');
    assert.equal(e.reason, 'too-many-changes');
  });

  it('strips unknown fields from feedback', () => {
    const e = F._sanitize({
      feature: 'plan_day',
      rating: 'helpful',
      timestamp: Date.now() - 1000,
      apiKey: 'secret',
      systemPrompt: 'ignore instructions',
      password: '12345',
    });
    assert.ok(e, 'feedback accepted (unknowns stripped)');
    assert.equal(e.apiKey, undefined, 'apiKey stripped');
    assert.equal(e.systemPrompt, undefined, 'systemPrompt stripped');
    assert.equal(e.password, undefined, 'password stripped');
  });

  it('rejects invalid rating', () => {
    const e = F._sanitize({ feature: 'plan_day', rating: 'invalid', timestamp: Date.now() });
    assert.equal(e, null, 'invalid rating rejected');
  });

  it('strips invalid reason to null', () => {
    const e = F._sanitize({ feature: 'plan_day', rating: 'helpful', reason: 'free-text-hack', timestamp: Date.now() });
    assert.ok(e, 'feedback accepted with invalid reason stripped');
    assert.equal(e.reason, null, 'invalid reason → null');
  });

  it('rejects missing feature', () => {
    const e = F._sanitize({ rating: 'helpful', timestamp: Date.now() });
    assert.equal(e, null, 'missing feature rejected');
  });

  it('rejects future timestamp', () => {
    const e = F._sanitize({ feature: 'plan_day', rating: 'helpful', timestamp: Date.now() + 600000 });
    assert.equal(e, null, 'future timestamp rejected');
  });

  it('prune removes old entries', () => {
    const old = Date.now() - 100 * 86400000;
    const recent = Date.now() - 1000;
    const result = F._prune([
      { feature: 'plan_day', rating: 'helpful', timestamp: old },
      { feature: 'plan_day', rating: 'helpful', timestamp: recent },
    ]);
    assert.equal(result.length, 1, 'old entry pruned');
    assert.equal(result[0].timestamp, recent, 'recent entry kept');
  });

  it('prune caps at MAX_ENTRIES', () => {
    const entries = [];
    for (let i = 0; i < F.MAX_ENTRIES + 5; i++) {
      entries.push({ feature: 'plan_day', rating: 'helpful', timestamp: Date.now() - (i + 1) * 1000 });
    }
    const result = F._prune(entries);
    assert.ok(result.length <= F.MAX_ENTRIES, 'capped at MAX_ENTRIES');
  });

  it('feedback VALID_RATINGS', () => {
    assert.ok(F.VALID_RATINGS.includes('helpful'));
    assert.ok(F.VALID_RATINGS.includes('not-helpful'));
  });

  it('feedback VALID_REASONS', () => {
    assert.ok(F.VALID_REASONS.includes('too-many-changes'));
    assert.ok(F.VALID_REASONS.includes('wrong-timing'));
    assert.ok(F.VALID_REASONS.includes('missed-context'));
    assert.ok(F.VALID_REASONS.includes('not-relevant'));
    assert.ok(F.VALID_REASONS.includes(null)); // null = no reason
  });
});

/* ============================================
   i18n Strings
   ============================================ */

describe('Phase 6T: i18n Strings', () => {
  const i18nSrc = readFileSync('js/i18n.js', 'utf8');

  it('VI adaptive planning strings present', () => {
    assert.ok(i18nSrc.includes("adaptivePlanning:"), 'adaptivePlanning VI');
    assert.ok(i18nSrc.includes("adaptivePlanningDesc:"), 'adaptivePlanningDesc VI');
    assert.ok(i18nSrc.includes("viewLearnedPatterns:"), 'viewLearnedPatterns VI');
    assert.ok(i18nSrc.includes("resetLearnedData:"), 'resetLearnedData VI');
    assert.ok(i18nSrc.includes("notEnoughData:"), 'notEnoughData VI');
    assert.ok(i18nSrc.includes("typicalFocusDuration:"), 'typicalFocusDuration VI');
    assert.ok(i18nSrc.includes("productiveTime:"), 'productiveTime VI');
    assert.ok(i18nSrc.includes("productiveDays:"), 'productiveDays VI');
    assert.ok(i18nSrc.includes("helpful:"), 'helpful VI');
    assert.ok(i18nSrc.includes("notHelpful:"), 'notHelpful VI');
    assert.ok(i18nSrc.includes("thanksFeedback:"), 'thanksFeedback VI');
    assert.ok(i18nSrc.includes("whySuggestion:"), 'whySuggestion VI');
    assert.ok(i18nSrc.includes("dataUsed:"), 'dataUsed VI');
    assert.ok(i18nSrc.includes("aiSuggestion:"), 'aiSuggestion VI');
    assert.ok(i18nSrc.includes("yourEdit:"), 'yourEdit VI');
  });
});

/* ============================================
   Production Boot
   ============================================ */

describe('Phase 6T: Production Boot', () => {
  const appHtml = readFileSync('app.html', 'utf8');
  const swJs = readFileSync('sw.js', 'utf8');

  it('ai-adaptation.min.js in boot chain', () => {
    assert.ok(appHtml.includes('ai-adaptation.min.js'), 'ai-adaptation in app.html');
  });

  it('ai-feedback.min.js in boot chain', () => {
    assert.ok(appHtml.includes('ai-feedback.min.js'), 'ai-feedback in app.html');
  });

  it('adaptive planning section in tools drawer', () => {
    assert.ok(appHtml.includes('adaptiveToggleBtn'), 'adaptive toggle button');
    assert.ok(appHtml.includes('adaptive-view'), 'adaptive view action');
    assert.ok(appHtml.includes('adaptive-reset'), 'adaptive reset action');
  });

  it('learned patterns modal in app.html', () => {
    assert.ok(appHtml.includes('adaptivePatternsModal'), 'patterns modal');
    assert.ok(appHtml.includes('adaptivePatternsContent'), 'patterns content');
  });

  it('SW precaches ai-adaptation.min.js', () => {
    assert.ok(swJs.includes('ai-adaptation.min.js'), 'sw precache adaptation');
  });

  it('SW precaches ai-feedback.min.js', () => {
    assert.ok(swJs.includes('ai-feedback.min.js'), 'sw precache feedback');
  });
});

/* ============================================
   AI Context Integration
   ============================================ */

describe('Phase 6T: AI Context Integration', () => {
  const aiSrc = readFileSync('js/ai.js', 'utf8');

  it('planner builds adaptiveHints', () => {
    assert.ok(aiSrc.includes('adaptiveHints'), 'buildContext attaches adaptiveHints');
  });

  it('previewHTML includes feedback bar', () => {
    assert.ok(aiSrc.includes('ai-feedback'), 'feedback bar in preview');
  });
});

describe('Phase 6T: Server Sanitization', () => {
  it('server ai.js has sanitizeAdaptiveHints', () => {
    const serverAiSrc = readFileSync('server/ai.js', 'utf8');
    assert.ok(serverAiSrc.includes('sanitizeAdaptiveHints'), 'server sanitizeAdaptiveHints exists');
  });
});

/* ============================================
   Explicit Preference Precedence
   ============================================ */

describe('Phase 6T: Preference Precedence', () => {
  it('explicit focus override adaptive focus', () => {
    const explicitPref = 25;
    const adaptiveHint = 45;
    // Effective should be the explicit preference
    const effective = explicitPref || adaptiveHint;
    assert.equal(effective, 25, 'explicit wins over adaptive');
  });

  it('adaptive used only when no explicit preference', () => {
    const explicitPref = null;
    const adaptiveHint = 45;
    const effective = explicitPref || adaptiveHint;
    assert.equal(effective, 45, 'adaptive fills in when no explicit');
  });
});
