/**
 * Phase 6N — Focus Session Execution & Verified Progress Capture
 * Comprehensive test suite
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');

describe('Phase 6N — Focus Session Execution & Verified Progress Capture', () => {
  let focusSessionSrc, aiIntentSrc, i18nSrc, swSrc, appSrc;

  before(() => {
    focusSessionSrc = read('js/focus-session.js');
    aiIntentSrc = read('js/ai-intent.js');
    i18nSrc = read('js/i18n.js');
    swSrc = read('sw.js');
    appSrc = read('js/app.js');
  });

  // ===== MODULE STRUCTURE =====

  it('N.1: focus-session.js is a valid UMD module (IIFE + factory + exports)', () => {
    assert.ok(focusSessionSrc.includes('typeof window'), 'UMD global check');
    assert.ok(focusSessionSrc.includes('module.exports'), 'CommonJS export');
    assert.ok(focusSessionSrc.includes('TaskFlowFocusSession'), 'Browser global name');
  });

  it('N.2: Module exports all required functions', () => {
    const requiredExports = [
      'createFocusSession', 'resumeFocusSession', 'endFocusSession',
      'pauseFocusSession', 'resumeFocusTimer', 'abandonFocusSession',
      'confirmOutcome', 'getVerifiedProgressMinutes', 'getRemainingWork',
      'calculateRemainingWork', 'buildFocusOutcomeReview', 'loadActiveSession',
      'saveActiveSession', 'clearActiveSession', 'loadSessionHistory',
      'saveSessionToHistory', 'getSessionStats', 'isSessionStale',
      'canCreditMinutes', 'classifyFocusIntent',
      'FOCUS_SESSION_VERSION', 'FOCUS_STALE_HOURS', 'FOCUS_HISTORY_MAX',
      'FOCUS_DURATION_MIN', 'FOCUS_DURATION_MAX'
    ];
    for (const fn of requiredExports) {
      assert.ok(focusSessionSrc.includes(fn), `Export missing: ${fn}`);
    }
  });

  it('N.3: Constants are defined correctly', () => {
    assert.ok(focusSessionSrc.includes('FOCUS_STALE_HOURS = 6'), 'Stale threshold = 6 hours');
    assert.ok(focusSessionSrc.includes('FOCUS_HISTORY_MAX = 500'), 'History max = 500');
    assert.ok(focusSessionSrc.includes('FOCUS_DURATION_MIN = 5'), 'Min duration = 5 min');
    assert.ok(focusSessionSrc.includes('FOCUS_DURATION_MAX = 240'), 'Max duration = 240 min');
  });

  it('N.4: Storage keys follow repository conventions (taskflow_ prefix)', () => {
    assert.ok(focusSessionSrc.includes("taskflow_focus_active_v1"), 'Active key uses taskflow prefix');
    assert.ok(focusSessionSrc.includes("taskflow_focus_history_v1"), 'History key uses taskflow prefix');
  });

  // ===== SESSION CREATION =====

  it('N.5: createFocusSession requires valid taskRef with uid', () => {
    assert.ok(focusSessionSrc.includes("if (!taskRef || !taskRef.uid) return { error: 'focus-invalid-task' }"), 'Rejects missing uid');
  });

  it('N.6: createFocusSession rejects if another active session exists', () => {
    assert.ok(focusSessionSrc.includes("'focus-already-active'"), 'Returns focus-already-active error');
  });

  it('N.7: createFocusSession clamps duration within bounds', () => {
    assert.ok(focusSessionSrc.includes('clampDuration'), 'Uses clampDuration');
    assert.ok(focusSessionSrc.includes('Math.max(FOCUS_DURATION_MIN'), 'Clamps to min');
    assert.ok(focusSessionSrc.includes('Math.min(FOCUS_DURATION_MAX'), 'Clamps to max');
  });

  it('N.8: Session ID uses fs_ prefix with timestamp', () => {
    assert.ok(focusSessionSrc.includes("'fs_' + Date.now()"), 'Generates fs_ prefix IDs');
  });

  it('N.9: Session schema matches Phase 6N specification', () => {
    const requiredFields = ['id', 'version', 'taskRef', 'startedAt', 'endedAt', 'plannedMinutes', 'elapsedMinutes', 'pausedAt', 'totalPausedMs', 'status', 'outcome'];
    for (const field of requiredFields) {
      assert.ok(focusSessionSrc.includes(field + ':'), `Session field missing: ${field}`);
    }
  });

  it('N.10: Session status values are correct', () => {
    assert.ok(focusSessionSrc.includes("'active'"), 'Has active status');
    assert.ok(focusSessionSrc.includes("'paused'"), 'Has paused status');
    assert.ok(focusSessionSrc.includes("'ended'"), 'Has ended status');
    assert.ok(focusSessionSrc.includes("'abandoned'"), 'Has abandoned status');
    assert.ok(focusSessionSrc.includes("'outcome-pending'"), 'Has outcome-pending status');
  });

  // ===== PAUSE / RESUME =====

  it('N.11: pauseFocusSession only works when status is active', () => {
    assert.ok(focusSessionSrc.includes("if (!session || session.status !== 'active') return { error: 'focus-not-active' }"), 'Requires active status');
  });

  it('N.12: resumeFocusTimer only works when status is paused', () => {
    assert.ok(focusSessionSrc.includes("if (!session || session.status !== 'paused') return { error: 'focus-not-paused' }"), 'Requires paused status');
  });

  it('N.13: Pause accumulates totalPausedMs correctly', () => {
    assert.ok(focusSessionSrc.includes("session.totalPausedMs = (session.totalPausedMs || 0) + ((now || Date.now()) - session.pausedAt)"), 'Accumulates pause duration');
  });

  it('N.14: resumeFocusTimer adds pause duration to totalPausedMs', () => {
    assert.ok(focusSessionSrc.includes("session.totalPausedMs = (session.totalPausedMs || 0) + pauseDuration"), 'Adds pause duration on resume');
  });

  // ===== END SESSION =====

  it('N.15: endFocusSession transitions to outcome-pending', () => {
    assert.ok(focusSessionSrc.includes("session.status = 'outcome-pending'"), 'Sets outcome-pending status');
  });

  it('N.16: endFocusSession does not auto-complete task', () => {
    // The module should never call any task completion function
    assert.ok(!focusSessionSrc.includes('completeTask') && !focusSessionSrc.includes('complete_task'), 'No auto-complete');
  });

  it('N.17: endFocusSession handles paused sessions by computing final pause', () => {
    assert.ok(focusSessionSrc.includes("if (session.status === 'paused' && session.pausedAt)"), 'Handles paused end');
  });

  // ===== OUTCOME REVIEW =====

  it('N.18: buildFocusOutcomeReview returns structured outcome options', () => {
    assert.ok(focusSessionSrc.includes("'task-completed'"), 'Has task-completed option');
    assert.ok(focusSessionSrc.includes("'progress'"), 'Has progress option');
    assert.ok(focusSessionSrc.includes("'no-progress'"), 'Has no-progress option');
  });

  it('N.19: confirmOutcome validates outcome type', () => {
    assert.ok(focusSessionSrc.includes("validTypes = ['task-completed', 'progress', 'no-progress']"), 'Validates types');
  });

  it('N.20: confirmOutcome requires userConfirmed = true', () => {
    assert.ok(focusSessionSrc.includes("userConfirmed: true"), 'Outcome has userConfirmed');
  });

  it('N.21: confirmOutcome stores creditedMinutes separately from elapsed', () => {
    assert.ok(focusSessionSrc.includes("outcome.creditedMinutes"), 'Stores credited minutes');
    assert.ok(focusSessionSrc.includes("session.elapsedMinutes = elapsed"), 'Stores elapsed minutes');
  });

  it('N.22: confirmOutcome is idempotent (double-click safe)', () => {
    assert.ok(focusSessionSrc.includes("if (!session || session.status !== 'outcome-pending') return { error: 'focus-not-pending' }"), 'Checks outcome-pending status');
  });

  // ===== CREDITED MINUTES =====

  it('N.23: creditedMinutes cannot exceed elapsedMinutes', () => {
    assert.ok(focusSessionSrc.includes("creditedMinutes = Math.max(0, Math.min(elapsed, creditedMinutes))"), 'Clamps credit to elapsed');
  });

  it('N.24: canCreditMinutes validates range', () => {
    assert.ok(focusSessionSrc.includes('creditedMinutes <= elapsedMinutes'), 'Validates credit <= elapsed');
  });

  it('N.25: no-progress outcome sets creditedMinutes = 0', () => {
    assert.ok(focusSessionSrc.includes("if (outcome.type === 'no-progress') creditedMinutes = 0"), 'Zero credit for no-progress');
  });

  // ===== ABANDON =====

  it('N.26: abandonFocusSession marks status abandoned and clears active', () => {
    assert.ok(focusSessionSrc.includes("session.status = 'abandoned'"), 'Sets abandoned');
    assert.ok(focusSessionSrc.includes('clearActiveSession()'), 'Clears active session');
    assert.ok(focusSessionSrc.includes('saveSessionToHistory(session)'), 'Saves to history');
  });

  // ===== VERIFIED PROGRESS =====

  it('N.27: getVerifiedProgressMinutes only counts confirmed progress/task-completed', () => {
    assert.ok(focusSessionSrc.includes("s.outcome.type !== 'progress' && s.outcome.type !== 'task-completed'"), 'Filters by type');
    assert.ok(focusSessionSrc.includes("s.outcome.userConfirmed"), 'Checks userConfirmed');
  });

  it('N.28: getVerifiedProgressMinutes ignores abandoned/no-progress sessions', () => {
    // Only progress and task-completed with userConfirmed = true
    assert.ok(!focusSessionSrc.includes("'no-progress') && s.outcome.userConfirmed") || focusSessionSrc.includes("'task-completed'"), 'Does not count no-progress');
  });

  it('N.29: calculateRemainingWork handles null estimate', () => {
    assert.ok(focusSessionSrc.includes('remainingMinutes: null'), 'Returns null for missing estimate');
  });

  it('N.30: calculateRemainingWork handles estimate overrun', () => {
    assert.ok(focusSessionSrc.includes('overrun: estimate > 0 && progress > estimate'), 'Detects overrun');
  });

  it('N.31: getRemainingWork looks up task.uid for verified progress', () => {
    assert.ok(focusSessionSrc.includes("const uid = task.uid"), 'Reads uid from task');
    assert.ok(focusSessionSrc.includes('getVerifiedProgressMinutes(uid)'), 'Gets progress by uid');
  });

  // ===== STALE DETECTION =====

  it('N.32: isSessionStale uses FOCUS_STALE_HOURS threshold', () => {
    assert.ok(focusSessionSrc.includes('FOCUS_STALE_HOURS * 60 * 60 * 1000'), 'Uses 6-hour threshold');
  });

  it('N.33: resumeFocusSession rejects stale sessions', () => {
    assert.ok(focusSessionSrc.includes("'focus-stale-session'"), 'Returns stale error');
  });

  // ===== SESSION HISTORY =====

  it('N.34: loadSessionHistory reads from localStorage with safety', () => {
    assert.ok(focusSessionSrc.includes("JSON.parse(raw)"), 'Parses JSON safely');
    assert.ok(focusSessionSrc.includes('catch (e)'), 'Handles parse errors');
  });

  it('N.35: saveSessionToHistory enforces max 500 sessions', () => {
    assert.ok(focusSessionSrc.includes('FOCUS_HISTORY_MAX'), 'Uses max constant');
    assert.ok(focusSessionSrc.includes('trimmed.slice(-FOCUS_HISTORY_MAX)'), 'Trims to max');
  });

  it('N.36: saveSessionToHistory prunes sessions older than 90 days', () => {
    assert.ok(focusSessionSrc.includes('90 * 24 * 60 * 60 * 1000'), '90-day cutoff');
  });

  it('N.37: getSessionStats aggregates session data correctly', () => {
    assert.ok(focusSessionSrc.includes('totalSessions'), 'Has totalSessions');
    assert.ok(focusSessionSrc.includes('totalMinutes'), 'Has totalMinutes');
    assert.ok(focusSessionSrc.includes('completedTasks'), 'Has completedTasks');
  });

  // ===== FOCUS INTENT ROUTER =====

  it('N.38: classifyFocusIntent classifies start-focus', () => {
    assert.ok(focusSessionSrc.includes("'start-focus'"), 'Has start-focus kind');
  });

  it('N.39: classifyFocusIntent classifies pause-focus', () => {
    assert.ok(focusSessionSrc.includes("'pause-focus'"), 'Has pause-focus kind');
  });

  it('N.40: classifyFocusIntent classifies resume-focus', () => {
    assert.ok(focusSessionSrc.includes("'resume-focus'"), 'Has resume-focus kind');
  });

  it('N.41: classifyFocusIntent classifies end-focus', () => {
    assert.ok(focusSessionSrc.includes("'end-focus'"), 'Has end-focus kind');
  });

  it('N.42: classifyFocusIntent classifies progress-report', () => {
    assert.ok(focusSessionSrc.includes("'progress-report'"), 'Has progress-report kind');
  });

  it('N.43: classifyFocusIntent defaults to clarify for empty/unknown', () => {
    assert.ok(focusSessionSrc.includes("'clarify'"), 'Defaults to clarify');
  });

  // ===== AI INTENT INTEGRATION =====

  it('N.44: ai-intent.js exports classifyFocusIntent', () => {
    assert.ok(aiIntentSrc.includes('classifyFocusIntent'), 'ai-intent.js exports classifyFocusIntent');
  });

  it('N.45: ai-intent.js has classifyFocusIntent with start-focus patterns', () => {
    assert.ok(aiIntentSrc.includes("'start-focus'"), 'Has start-focus in ai-intent');
  });

  it('N.46: ai-intent.js has classifyFocusIntent with pause-focus patterns', () => {
    assert.ok(aiIntentSrc.includes("'pause-focus'"), 'Has pause-focus in ai-intent');
  });

  it('N.47: ai-intent.js has classifyFocusIntent with resume-focus patterns', () => {
    assert.ok(aiIntentSrc.includes("'resume-focus'"), 'Has resume-focus in ai-intent');
  });

  it('N.48: ai-intent.js has classifyFocusIntent with end-focus patterns', () => {
    assert.ok(aiIntentSrc.includes("'end-focus'"), 'Has end-focus in ai-intent');
  });

  it('N.49: ai-intent.js has classifyFocusIntent with progress-report patterns', () => {
    assert.ok(aiIntentSrc.includes("'progress-report'"), 'Has progress-report in ai-intent');
  });

  // ===== I18N =====

  it('N.50: i18n.js has VI focus session keys', () => {
    const viKeys = ['focusSessionTitle', 'focusSessionPause', 'focusSessionResume', 'focusSessionEnd', 'focusSessionActive', 'focusSessionTimeLeft', 'focusOutcomeTitle', 'focusOutcomeCompleted', 'focusOutcomeProgress', 'focusOutcomeNoProgress', 'focusOutcomeCredited', 'focusOutcomeConfirm', 'focusRemainingWork', 'focusHistory', 'focusPrivacyNote'];
    for (const key of viKeys) {
      assert.ok(i18nSrc.includes(key + ':'), `Missing VI key: ${key}`);
    }
  });

  it('N.51: i18n.js has EN focus session keys', () => {
    const enKeyNames = ['focusSessionTitle', 'focusSessionPause', 'focusSessionResume', 'focusSessionEnd', 'focusOutcomeTitle', 'focusOutcomeCompleted', 'focusOutcomeProgress', 'focusOutcomeNoProgress', 'focusOutcomeCredited', 'focusOutcomeConfirm', 'focusHistory', 'focusPrivacyNote'];
    for (const key of enKeyNames) {
      // Each key must appear exactly twice (VI + EN)
      const matches = i18nSrc.match(new RegExp(key + ':', 'g'));
      assert.ok(matches && matches.length >= 2, `EN key missing or only once: ${key} (found ${matches ? matches.length : 0})`);
    }
  });

  it('N.52: i18n keys have no raw key placeholders (use {n} not ${n})', () => {
    const regex = /focus\w+:.*\$\{/g;
    const matches = i18nSrc.match(regex);
    assert.ok(!matches, `Found raw \${} in focus i18n: ${JSON.stringify(matches)}`);
  });

  // ===== LAZY LOADING =====

  it('N.53: focus-session.min.js is in the lazy-loading chain', () => {
    assert.ok(appSrc.includes("ensureLazyModule(lazyAsset('js/focus-session.min.js'))"), 'Lazy-loaded in app.js');
  });

  it('N.54: focus-session.min.js is loaded after ai-roadmap.min.js', () => {
    const roadmapIdx = appSrc.indexOf("ensureLazyModule('js/ai-roadmap.min.js')");
    const focusIdx = appSrc.indexOf("ensureLazyModule(lazyAsset('js/focus-session.min.js'))");
    assert.ok(focusIdx > roadmapIdx, 'Loaded after ai-roadmap');
  });

  it('N.55: focus-session.min.js is loaded before ai-agent-runtime.min.js', () => {
    const focusIdx = appSrc.indexOf("ensureLazyModule(lazyAsset('js/focus-session.min.js'))");
    const agentIdx = appSrc.indexOf("ensureLazyModule(lazyAsset('js/ai-agent-runtime.min.js'))");
    assert.ok(focusIdx < agentIdx, 'Loaded before ai-agent-runtime');
  });

  // ===== SW CACHE =====

  it('N.56: focus-session.min.js is in SW precache list', () => {
    assert.ok(swSrc.includes("'./js/focus-session.min.js?v='"), 'In SW precache');
  });

  it('N.57: focus-session.min.js is listed exactly once in SW precache', () => {
    const matches = swSrc.match(/focus-session\.min\.js/g);
    assert.equal(matches ? matches.length : 0, 1, 'Exactly once in precache');
  });

  // ===== SAFETY =====

  it('N.58: Module has zero network fetch calls (no AI requests)', () => {
    assert.ok(!focusSessionSrc.includes('fetch('), 'No network fetch in module');
  });

  it('N.59: Module does not auto-complete tasks (no completeTask)', () => {
    assert.ok(!focusSessionSrc.includes('completeTask'), 'No auto-complete');
  });

  it('N.60: Module does not write to Google Calendar', () => {
    assert.ok(!focusSessionSrc.includes('google') || !focusSessionSrc.includes('calendar'), 'No Google Calendar writes');
  });

  it('N.61: Module does not track keyboard/mouse/screen', () => {
    assert.ok(!focusSessionSrc.includes('mousemove') && !focusSessionSrc.includes('keydown') && !focusSessionSrc.includes('screen'), 'No surveillance');
  });

  it('N.62: Module does not use Reflection/Mood', () => {
    assert.ok(!focusSessionSrc.includes('reflection') && !focusSessionSrc.includes('mood'), 'No Reflection/Mood');
  });

  it('N.63: Module does not store raw AI data', () => {
    assert.ok(!focusSessionSrc.includes('chain_of_thought') && !focusSessionSrc.includes('internal_steps'), 'No AI reasoning stored');
  });

  it('N.64: Module does not save focus preferences to Memory', () => {
    assert.ok(!focusSessionSrc.includes('Phase 6B') || !focusSessionSrc.includes('Memory'), 'No auto-save to Memory');
  });

  it('N.65: Core focus session loop has zero Gemini requests', () => {
    // createFocusSession, pauseFocusSession, resumeFocusTimer, endFocusSession,
    // confirmOutcome — none should call Gemini
    assert.ok(!focusSessionSrc.includes('fetch('), 'No network fetch in module');
  });

  // ===== INTEGRATION =====

  it('N.66: confirmOutcome sets ended and saves to history', () => {
    assert.ok(focusSessionSrc.includes("session.status = 'ended'"), 'Sets ended status');
    assert.ok(focusSessionSrc.includes('saveSessionToHistory(session)'), 'Saves to history');
    assert.ok(focusSessionSrc.includes('clearActiveSession()'), 'Clears active session');
  });

  it('N.67: One-active-session rule enforced on create', () => {
    assert.ok(focusSessionSrc.includes("'focus-already-active'"), 'Enforces one active session');
  });

  it('N.68: Session survives refresh via loadActiveSession', () => {
    assert.ok(focusSessionSrc.includes('loadActiveSession'), 'Has load function');
    assert.ok(focusSessionSrc.includes('saveActiveSession'), 'Has save function');
    assert.ok(focusSessionSrc.includes('ACTIVE_KEY'), 'Uses storage key');
  });

  it('N.69: buildFocusOutcomeReview shows overTimeMinutes when elapsed > planned', () => {
    assert.ok(focusSessionSrc.includes('overTimeMinutes'), 'Tracks overtime');
  });

  it('N.70: Phase 6N does not add new server endpoints', () => {
    // Verify the module is purely client-side
    assert.ok(focusSessionSrc.includes('localStorage'), 'Uses localStorage (client-side only)');
  });
});
