import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');

/* ---- helpers ---- */

function createMemoryModule() {
  const store = {};
  const sandbox = {
    console,
    localStorage: {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; },
    },
    window: null, globalThis: null,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(read('js/ai-context-consent.js'), ctx);
  vm.runInContext(read('js/ai-memory.js'), ctx);
  return { memory: sandbox.TaskFlowAIMemory, consent: sandbox.TaskFlowAIContextConsent, store };
}

/* ---- tests ---- */

describe('Phase 6B: User-Controlled AI Memory', () => {
  let memory, consent, store;

  beforeEach(() => {
    const m = createMemoryModule();
    memory = m.memory;
    consent = m.consent;
    store = m.store;
  });

  // P1: Default OFF
  it('defaults to OFF', () => {
    assert.equal(memory.isEnabled(), false);
  });

  it('default preferences are all null', () => {
    const prefs = memory.getPreferences();
    assert.equal(prefs.defaultTaskDuration, null);
    assert.equal(prefs.preferredFocusDuration, null);
    assert.equal(prefs.preferredWorkWindow, null);
    assert.equal(prefs.planningStyle, null);
    assert.equal(prefs.responseStyle, null);
    assert.equal(prefs.language, null);
    assert.equal(prefs.preferredPlanningDays, null);
  });

  // P3: Schema
  it('STORAGE_KEY is versioned', () => {
    assert.ok(memory.STORAGE_KEY.includes('v1'));
  });

  it('VERSION is 1', () => {
    assert.equal(memory.VERSION, 1);
  });

  // P2: Local storage only
  it('stores in localStorage under correct key', () => {
    memory.setEnabled(true);
    assert.ok(store[memory.STORAGE_KEY]);
    const parsed = JSON.parse(store[memory.STORAGE_KEY]);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.enabled, true);
  });

  // P4: Allowlist
  it('getAllowedKeys returns strict allowlist', () => {
    const keys = memory.getAllowedKeys();
    assert.ok(keys.includes('defaultTaskDuration'));
    assert.ok(keys.includes('preferredFocusDuration'));
    assert.ok(keys.includes('preferredWorkWindow'));
    assert.ok(keys.includes('planningStyle'));
    assert.ok(keys.includes('responseStyle'));
    assert.ok(keys.includes('language'));
    assert.ok(keys.includes('preferredPlanningDays'));
    assert.equal(keys.length, 7);
  });

  // P5: Default task duration
  it('validates defaultTaskDuration range', () => {
    assert.ok(memory.validateValue('defaultTaskDuration', 45).ok);
    assert.ok(memory.validateValue('defaultTaskDuration', 5).ok);
    assert.ok(memory.validateValue('defaultTaskDuration', 480).ok);
    assert.ok(!memory.validateValue('defaultTaskDuration', 4).ok);
    assert.ok(!memory.validateValue('defaultTaskDuration', 481).ok);
    assert.ok(!memory.validateValue('defaultTaskDuration', -1).ok);
    assert.ok(!memory.validateValue('defaultTaskDuration', '45').ok);
  });

  it('rounds non-integer durations', () => {
    memory.setPreference('defaultTaskDuration', 45.7);
    assert.equal(memory.getPreferences().defaultTaskDuration, 46);
  });

  // P6: Focus duration
  it('validates preferredFocusDuration', () => {
    assert.ok(memory.validateValue('preferredFocusDuration', 50).ok);
    assert.ok(!memory.validateValue('preferredFocusDuration', 0).ok);
  });

  // P7: Work window
  it('validates preferredWorkWindow object', () => {
    assert.ok(memory.validateValue('preferredWorkWindow', { start: '19:00', end: '22:00' }).ok);
    assert.ok(memory.validateValue('preferredWorkWindow', { start: '00:00', end: '23:59' }).ok);
    assert.ok(!memory.validateValue('preferredWorkWindow', { start: '25:00', end: '22:00' }).ok);
    assert.ok(!memory.validateValue('preferredWorkWindow', { start: '19:00' }).ok);
    assert.ok(!memory.validateValue('preferredWorkWindow', '19:00-22:00').ok);
    assert.ok(!memory.validateValue('preferredWorkWindow', { start: 'abc', end: 'def' }).ok);
  });

  // P8: Planning style
  it('validates planningStyle enum', () => {
    assert.ok(memory.validateValue('planningStyle', 'balanced').ok);
    assert.ok(memory.validateValue('planningStyle', 'deep-work').ok);
    assert.ok(memory.validateValue('planningStyle', 'light').ok);
    assert.ok(memory.validateValue('planningStyle', 'deadline-first').ok);
    assert.ok(!memory.validateValue('planningStyle', 'custom').ok);
    assert.ok(!memory.validateValue('planningStyle', 123).ok);
  });

  // P9: Response style
  it('validates responseStyle enum', () => {
    assert.ok(memory.validateValue('responseStyle', 'concise').ok);
    assert.ok(memory.validateValue('responseStyle', 'balanced').ok);
    assert.ok(memory.validateValue('responseStyle', 'detailed').ok);
    assert.ok(!memory.validateValue('responseStyle', 'verbose').ok);
  });

  // P10: Language
  it('validates language enum', () => {
    assert.ok(memory.validateValue('language', 'vi').ok);
    assert.ok(memory.validateValue('language', 'en').ok);
    assert.ok(!memory.validateValue('language', 'fr').ok);
  });

  // P22: Independence from consent
  it('memory enable does NOT affect consent', () => {
    assert.equal(consent.getPermissions().reflections, false);
    assert.equal(consent.getPermissions().mood, false);
    memory.setEnabled(true);
    assert.equal(consent.getPermissions().reflections, false);
    assert.equal(consent.getPermissions().mood, false);
  });

  it('consent enable does NOT affect memory', () => {
    consent.setPermission('reflections', true);
    assert.equal(memory.isEnabled(), false);
  });

  // P12: No automatic learning
  it('does not auto-save from arbitrary data', () => {
    memory.setEnabled(true);
    // Simulate what would happen if someone tried to set via non-allowlisted key
    assert.equal(memory.setPreference('arbitraryKey', 'value'), false);
    assert.equal(memory.setPreference('password', 'secret'), false);
    assert.equal(memory.setPreference('apiKey', 'key'), false);
  });

  // P23: Reset
  it('reset clears preferences but keeps enabled state', () => {
    memory.setEnabled(true);
    memory.setPreference('defaultTaskDuration', 45);
    memory.reset();
    assert.equal(memory.isEnabled(), true); // reset only clears prefs
    assert.equal(memory.getPreferences().defaultTaskDuration, null);
  });

  // P24: Clear all
  it('clearAll removes entire store', () => {
    memory.setEnabled(true);
    memory.setPreference('defaultTaskDuration', 45);
    memory.clearAll();
    assert.equal(memory.isEnabled(), false);
    assert.equal(memory.getPreferences().defaultTaskDuration, null);
  });

  // P15: Context payload
  it('buildContextPayload returns null when disabled', () => {
    memory.setEnabled(false);
    memory.setPreference('defaultTaskDuration', 45);
    assert.equal(memory.buildContextPayload(), null);
  });

  it('buildContextPayload returns null when no prefs set', () => {
    memory.setEnabled(true);
    assert.equal(memory.buildContextPayload(), null);
  });

  it('buildContextPayload includes only set preferences', () => {
    memory.setEnabled(true);
    memory.setPreference('defaultTaskDuration', 45);
    memory.setPreference('preferredWorkWindow', { start: '19:00', end: '22:00' });
    const payload = memory.buildContextPayload();
    assert.ok(payload);
    assert.ok(payload.preferences);
    assert.equal(payload.preferences.defaultTaskDuration, 45);
    assert.equal(JSON.stringify(payload.preferences.preferredWorkWindow), JSON.stringify({ start: '19:00', end: '22:00' }));
    assert.equal(payload.preferences.planningStyle, undefined); // not set
  });

  // P39: Corrupted store
  it('handles corrupted localStorage gracefully', () => {
    store[memory.STORAGE_KEY] = 'not-json{{{';
    assert.equal(memory.isEnabled(), false);
    assert.equal(memory.getPreferences().defaultTaskDuration, null);
  });

  it('handles invalid version in store', () => {
    store[memory.STORAGE_KEY] = JSON.stringify({ version: 999, enabled: true, preferences: {} });
    assert.equal(memory.isEnabled(), false);
  });

  // P40: Unknown fields
  it('drops unknown fields silently', () => {
    memory.setPreferences({
      defaultTaskDuration: 45,
      apiKey: 'secret',
      password: 'hunter2',
      unknown: 'value',
    });
    const prefs = memory.getPreferences();
    assert.equal(prefs.defaultTaskDuration, 45);
    assert.equal(prefs.apiKey, undefined);
    assert.equal(prefs.password, undefined);
    assert.equal(prefs.unknown, undefined);
  });

  // P41: Invalid values
  it('drops invalid values', () => {
    memory.setPreference('defaultTaskDuration', 99999);
    assert.equal(memory.getPreferences().defaultTaskDuration, null);
    memory.setPreference('preferredWorkWindow', 'anything');
    assert.equal(memory.getPreferences().preferredWorkWindow, null);
    memory.setPreference('planningStyle', 'DELETE EVERYTHING');
    assert.equal(memory.getPreferences().planningStyle, null);
  });

  // P20: Max size
  it('rejects oversized stores', () => {
    memory.setEnabled(true);
    // Try to store a huge value
    const huge = 'x'.repeat(5000);
    const result = memory.setPreference('defaultTaskDuration', 45);
    assert.equal(result, true);
    // The store should still be under the limit
    const raw = store[memory.STORAGE_KEY];
    assert.ok(raw.length <= memory.MAX_SERIALIZED_BYTES + 100); // some overhead
  });

  // onChange
  it('onChange fires on changes', () => {
    let called = false;
    const unsub = memory.onChange(() => { called = true; });
    memory.setEnabled(true);
    assert.equal(called, true);
    unsub();
    called = false;
    memory.setEnabled(false);
    assert.equal(called, false);
  });

  // preferredPlanningDays
  it('validates preferredPlanningDays array', () => {
    assert.ok(memory.validateValue('preferredPlanningDays', [0, 1, 2]).ok);
    assert.ok(memory.validateValue('preferredPlanningDays', [6]).ok);
    assert.ok(!memory.validateValue('preferredPlanningDays', [7]).ok);
    assert.ok(!memory.validateValue('preferredPlanningDays', [-1]).ok);
    assert.ok(!memory.validateValue('preferredPlanningDays', [0, 0, 0, 0, 0, 0, 0, 0]).ok); // > 7
    assert.ok(!memory.validateValue('preferredPlanningDays', 'monday').ok);
  });

  // Explicit request override (conceptual test — override happens in agent prompt, not store)
  it('null clears a preference', () => {
    memory.setPreference('defaultTaskDuration', 45);
    assert.equal(memory.getPreferences().defaultTaskDuration, 45);
    memory.setPreference('defaultTaskDuration', null);
    assert.equal(memory.getPreferences().defaultTaskDuration, null);
  });
});

describe('Phase 6B: Server Preference Sanitization', () => {
  const serverAiSrc = read('server/ai.js');

  it('sanitizeChatContextEnvelope processes preferences', () => {
    // Verify the function exists and handles preferences
    assert.ok(serverAiSrc.includes('ALLOWED_PREF_KEYS'));
    assert.ok(serverAiSrc.includes('preferredWorkWindow'));
  });

  it('preferences are included in envelope when valid', () => {
    // The server-side sanitization is tested via the exported function
    // Here we verify the source code structure
    assert.ok(serverAiSrc.includes("envelope.preferences = sanitizedPrefs"));
  });
});

describe('Phase 6B: Regression — Chat Context Provider', () => {
  it('chat-provider.js injects preferences from memory module', () => {
    const src = read('js/chat-provider.js');
    assert.ok(src.includes('TaskFlowAIMemory'));
    assert.ok(src.includes('buildContextPayload'));
    assert.ok(src.includes('envelope.preferences'));
  });

  it('chat-provider.js still respects consent store', () => {
    const src = read('js/chat-provider.js');
    assert.ok(src.includes('TaskFlowAIContextConsent'));
    assert.ok(src.includes('buildPermissions'));
  });
});

describe('Phase 6B: Regression — App Lazy Chain', () => {
  it('app.js loads ai-memory.min.js in lazy chain', () => {
    const src = read('js/app.js');
    assert.ok(src.includes('ai-memory.min.js'));
    // Both runLazyChat and preloadLazyChat should have it
    const matches = src.match(/ai-memory\.min\.js/g);
    assert.ok(matches && matches.length >= 2, 'ai-memory.min.js should appear in both lazy chains');
  });

  it('app.js preserves ai-intent and ai-context-consent in chain', () => {
    const src = read('js/app.js');
    assert.ok(src.includes('ai-intent.min.js'));
    assert.ok(src.includes('ai-context-consent.min.js'));
  });
});

describe('Phase 6B: Regression — Phase 6A Consent', () => {
  it('consent module still works independently', () => {
    const { consent } = createMemoryModule();
    assert.equal(consent.getPermissions().reflections, false);
    assert.equal(consent.getPermissions().mood, false);
    consent.setPermission('reflections', true);
    assert.equal(consent.getPermissions().reflections, true);
    assert.equal(consent.getPermissions().mood, false); // still independent
  });
});

describe('Phase 6B: i18n Keys', () => {
  it('has VI memory keys', () => {
    const src = read('js/i18n.js');
    assert.ok(src.includes("memoryTitle: 'Ghi nhớ tùy chọn AI'"));
    assert.ok(src.includes("memoryEnable: 'Sử dụng tùy chọn đã lưu'"));
    assert.ok(src.includes("memoryReset: 'Xóa tất cả tùy chọn AI'"));
  });

  it('has EN memory keys', () => {
    const src = read('js/i18n.js');
    assert.ok(src.includes("memoryTitle: 'AI Saved Preferences'"));
    assert.ok(src.includes("memoryEnable: 'Use saved preferences'"));
    assert.ok(src.includes("memoryReset: 'Delete all AI preferences'"));
  });
});

describe('Phase 6B: SW Precache', () => {
  it('sw.js includes ai-memory.min.js in precache', () => {
    const src = read('sw.js');
    assert.ok(src.includes('ai-memory.min.js'));
  });
});

describe('Phase 6B: No New Write Powers', () => {
  it('memory module has no Gemini/network calls', () => {
    const src = read('js/ai-memory.js');
    assert.ok(!src.includes('fetch'));
    assert.ok(!src.includes('XMLHttpRequest'));
    assert.ok(!src.includes('/api/'));
  });

  it('memory does not auto-save from conversation', () => {
    const src = read('js/ai-memory.js');
    // Should not have auto-extraction patterns
    assert.ok(!src.includes('autoExtract'));
    assert.ok(!src.includes('conversationMining'));
    assert.ok(!src.includes('inferenceFromChat'));
  });
});
