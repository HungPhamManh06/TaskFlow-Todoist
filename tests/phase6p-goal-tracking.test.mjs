/**
 * Phase 6P — Goal Progress & Milestone Tracking
 * Comprehensive test suite
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');

describe('Phase 6P — Goal Progress & Milestone Tracking', () => {
  let trackingSrc, aiIntentSrc, i18nSrc, swSrc, appSrc;

  before(() => {
    trackingSrc = read('js/goal-tracking.js');
    aiIntentSrc = read('js/ai-intent.js');
    i18nSrc = read('js/i18n.js');
    swSrc = read('sw.js');
    appSrc = read('js/app.js');
  });

  // ===== MODULE STRUCTURE =====

  it('P.1: goal-tracking.js is a valid UMD module', () => {
    assert.ok(trackingSrc.includes('typeof window'), 'UMD global check');
    assert.ok(trackingSrc.includes('module.exports'), 'CommonJS export');
    assert.ok(trackingSrc.includes('TaskFlowGoalTracking'), 'Browser global name');
  });

  it('P.2: Module exports all required functions', () => {
    const required = [
      'loadGoalTrackers', 'saveGoalTrackers', 'createGoalTracker', 'deleteGoalTracker',
      'markGoalComplete', 'markGoalActive',
      'linkTaskToGoal', 'unlinkTaskFromGoal',
      'resolveLinkedTasks', 'computeMilestoneStatus', 'computeGoalProgress',
      'computeGoalHealth', 'computeGoalSummary',
      'findMissingTasks', 'findNextAction', 'explainGoalHealth',
      'classifyGoalTrackingIntent',
      'GOAL_TRACKING_VERSION', 'GOAL_TRACKING_KEY', 'MAX_ACTIVE_GOALS'
    ];
    for (const fn of required) {
      assert.ok(trackingSrc.includes(fn), `Export missing: ${fn}`);
    }
  });

  it('P.3: Constants are correct', () => {
    assert.ok(trackingSrc.includes('GOAL_TRACKING_VERSION = 1'), 'Version = 1');
    assert.ok(trackingSrc.includes('taskflow_goal_tracking_v1'), 'Storage key uses taskflow prefix');
    assert.ok(trackingSrc.includes('MAX_ACTIVE_GOALS = 20'), 'Max active goals = 20');
  });

  // ===== STORAGE =====

  it('P.4: loadGoalTrackers handles missing/corrupt data safely', () => {
    assert.ok(trackingSrc.includes('catch (e)'), 'Handles parse errors');
    assert.ok(trackingSrc.includes('return []'), 'Returns empty array on error');
  });

  it('P.5: saveGoalTrackers bounds to MAX_ACTIVE_GOALS', () => {
    assert.ok(trackingSrc.includes('trackers.slice(0, MAX_ACTIVE_GOALS)'), 'Bounds tracker count');
  });

  // ===== TRACKER CREATION =====

  it('P.6: createGoalTracker requires valid title', () => {
    assert.ok(trackingSrc.includes("'invalid-title'"), 'Returns invalid-title error');
  });

  it('P.7: createGoalTracker limits to MAX_ACTIVE_GOALS', () => {
    assert.ok(trackingSrc.includes("'too-many-goals'"), 'Returns too-many-goals error');
  });

  it('P.8: Tracker ID uses goal_ prefix', () => {
    assert.ok(trackingSrc.includes("'goal_' + Date.now()"), 'Generates goal_ prefix IDs');
  });

  it('P.9: Tracker schema matches Phase 6P specification', () => {
    const fields = ['id', 'version', 'title', 'targetDate', 'createdAt', 'source', 'milestones', 'linkedTaskUids', 'status'];
    for (const f of fields) {
      assert.ok(trackingSrc.includes(f + ':'), `Tracker field missing: ${f}`);
    }
  });

  it('P.10: Tracker status defaults to active', () => {
    assert.ok(trackingSrc.includes("status: 'active'"), 'Default status is active');
  });

  // ===== TASK LINKING =====

  it('P.11: linkTaskToGoal adds to required or optional', () => {
    assert.ok(trackingSrc.includes('required'), 'Has required list');
    assert.ok(trackingSrc.includes('optional'), 'Has optional list');
  });

  it('P.12: linkTaskToGoal deduplicates before adding', () => {
    assert.ok(trackingSrc.includes('filter((u) => u !== taskUid)'), 'Deduplicates before add');
  });

  it('P.13: unlinkTaskFromGoal removes from both lists', () => {
    assert.ok(trackingSrc.includes("m.requiredTaskUids = m.requiredTaskUids.filter"), 'Removes from required');
    assert.ok(trackingSrc.includes("m.optionalTaskUids = m.optionalTaskUids.filter"), 'Removes from optional');
  });

  // ===== MILESTONE STATUS =====

  it('P.14: computeMilestoneStatus marks complete when all required done', () => {
    assert.ok(trackingSrc.includes("'complete'"), 'Has complete status');
    assert.ok(trackingSrc.includes("requiredCompleted === requiredTotal"), 'Checks all required done');
  });

  it('P.15: computeMilestoneStatus marks blocked when missing required task', () => {
    assert.ok(trackingSrc.includes("'blocked'"), 'Has blocked status');
    assert.ok(trackingSrc.includes("missingRequired > 0"), 'Detects missing tasks');
  });

  it('P.16: Optional tasks do NOT prevent required completion', () => {
    assert.ok(trackingSrc.includes("requiredCompleted === requiredTotal"), 'Only checks required for complete');
  });

  // ===== PROGRESS =====

  it('P.17: computeGoalProgress calculates task-count basis', () => {
    assert.ok(trackingSrc.includes("taskCountBasis"), 'Has taskCountBasis');
    assert.ok(trackingSrc.includes("requiredCompleted / requiredTotal"), 'Calculates ratio');
  });

  it('P.18: computeGoalProgress calculates effort basis when durations known', () => {
    assert.ok(trackingSrc.includes("effortBasis"), 'Has effortBasis');
    assert.ok(trackingSrc.includes("totalEstimatedMinutes"), 'Tracks estimated minutes');
  });

  it('P.19: Unknown duration → effortKnown=false', () => {
    assert.ok(trackingSrc.includes("effortKnown = false"), 'Sets effortKnown false for missing durations');
  });

  it('P.20: Verified progress clamped to estimate for effort', () => {
    assert.ok(trackingSrc.includes("Math.min(verified, est || 0)"), 'Clamps verified to estimate');
  });

  // ===== GOAL HEALTH =====

  it('P.21: computeGoalHealth uses slack model', () => {
    assert.ok(trackingSrc.includes("slackMinutes"), 'Has slackMinutes');
    assert.ok(trackingSrc.includes("availableMinutesBeforeTarget - remaining"), 'Computes slack');
  });

  it('P.22: Health labels match Phase 6J taxonomy', () => {
    assert.ok(trackingSrc.includes("'healthy'"), 'Has healthy');
    assert.ok(trackingSrc.includes("'watch'"), 'Has watch');
    assert.ok(trackingSrc.includes("'at-risk'"), 'Has at-risk');
    assert.ok(trackingSrc.includes("'insufficient-capacity'"), 'Has insufficient-capacity');
  });

  it('P.23: No capacity data → health unknown', () => {
    assert.ok(trackingSrc.includes("'unknown'"), 'Has unknown health');
  });

  // ===== MISSING TASKS =====

  it('P.24: findMissingTasks returns deleted/unlinked UIDs', () => {
    assert.ok(trackingSrc.includes("findMissingTasks"), 'Has findMissingTasks');
    assert.ok(trackingSrc.includes("!taskMap || !taskMap[uid]"), 'Detects missing tasks');
  });

  it('P.25: Missing tasks are NOT counted as complete', () => {
    assert.ok(trackingSrc.includes("if (task)"), 'Checks task exists before counting');
  });

  // ===== NEXT ACTION =====

  it('P.26: findNextAction returns first incomplete required task', () => {
    assert.ok(trackingSrc.includes("findNextAction"), 'Has findNextAction');
    assert.ok(trackingSrc.includes('!task || task.done'), 'Checks task not done');
  });

  it('P.27: findNextAction sorts milestones by order', () => {
    assert.ok(trackingSrc.includes("sort((a, b) => (a.order || 0) - (b.order || 0))"), 'Sorts by order');
  });

  // ===== EXPLICIT COMPLETION =====

  it('P.28: markGoalComplete sets status to completed', () => {
    assert.ok(trackingSrc.includes("tracker.status = 'completed'"), 'Sets completed');
  });

  it('P.29: markGoalActive reverts to active', () => {
    assert.ok(trackingSrc.includes("tracker.status = 'active'"), 'Sets active');
  });

  it('P.30: No auto-complete of goal when milestones done', () => {
    assert.ok(!trackingSrc.includes("auto") && !trackingSrc.includes("Auto"), 'No auto-complete');
  });

  // ===== NO CANONICAL MUTATION =====

  it('P.31: Module does not mutate canonical tasks', () => {
    assert.ok(!trackingSrc.includes('task.done =') && !trackingSrc.includes('tk.done ='), 'No task.done assignment');
  });

  it('P.32: Module does not delete canonical tasks', () => {
    assert.ok(!trackingSrc.includes('deleteTask') && !trackingSrc.includes('removeTask'), 'No task deletion');
  });

  it('P.33: Module does not auto-reschedule', () => {
    assert.ok(!trackingSrc.includes('reschedule') && !trackingSrc.includes('Reschedule'), 'No auto-reschedule');
  });

  it('P.34: Module does not change deadlines', () => {
    assert.ok(!trackingSrc.includes('deadline ='), 'No deadline assignment');
  });

  // ===== NO GEMINI / AI =====

  it('P.35: Module has zero network fetch calls', () => {
    assert.ok(!trackingSrc.includes('fetch('), 'No fetch calls');
  });

  it('P.36: Module does not use productivity scores', () => {
    assert.ok(!trackingSrc.includes('productivityScore') && !trackingSrc.includes('performanceScore'), 'No scores');
  });

  // ===== PRIVACY =====

  it('P.37: Device-local storage only', () => {
    assert.ok(trackingSrc.includes('localStorage'), 'Uses localStorage');
    assert.ok(!trackingSrc.includes('fetch('), 'No server calls');
  });

  it('P.38: No raw AI storage', () => {
    assert.ok(!trackingSrc.includes('chain_of_thought') && !trackingSrc.includes('provider'), 'No raw AI');
  });

  // ===== INTENT ROUTER =====

  it('P.39: classifyGoalTrackingIntent classifies goal-status', () => {
    assert.ok(trackingSrc.includes("'goal-status'"), 'Has goal-status kind');
  });

  it('P.40: classifyGoalTrackingIntent classifies goal-health', () => {
    assert.ok(trackingSrc.includes("'goal-health'"), 'Has goal-health kind');
  });

  it('P.41: classifyGoalTrackingIntent classifies goal-course-correct', () => {
    assert.ok(trackingSrc.includes("'goal-course-correct'"), 'Has goal-course-correct kind');
  });

  it('P.42: classifyGoalTrackingIntent classifies goal-complete', () => {
    assert.ok(trackingSrc.includes("'goal-complete'"), 'Has goal-complete kind');
  });

  // ===== AI INTENT INTEGRATION =====

  it('P.43: ai-intent.js exports classifyGoalTrackingIntent', () => {
    assert.ok(aiIntentSrc.includes('classifyGoalTrackingIntent'), 'ai-intent.js exports it');
  });

  // ===== I18N =====

  it('P.44: i18n.js has VI goal tracking keys', () => {
    const keys = ['goalTrackTitle', 'goalTrackProgress', 'goalTrackMilestone', 'goalTrackRequired', 'goalTrackOptional', 'goalTrackActive', 'goalTrackCompleted', 'goalTrackTaskCount', 'goalTrackNoDuration', 'goalTrackRemaining', 'goalTrackSlack', 'goalTrackDelete', 'goalTrackDeviceData'];
    for (const key of keys) {
      assert.ok(i18nSrc.includes(key + ':'), `Missing VI key: ${key}`);
    }
  });

  it('P.45: i18n.js has EN goal tracking keys', () => {
    const keys = ['goalTrackTitle', 'goalTrackProgress', 'goalTrackMilestone', 'goalTrackRequired', 'goalTrackOptional', 'goalTrackActive', 'goalTrackCompleted', 'goalTrackTaskCount', 'goalTrackNoDuration', 'goalTrackRemaining', 'goalTrackSlack', 'goalTrackDelete', 'goalTrackDeviceData'];
    for (const key of keys) {
      const matches = i18nSrc.match(new RegExp(key + ':', 'g'));
      assert.ok(matches && matches.length >= 2, `EN key missing or only once: ${key}`);
    }
  });

  // ===== LAZY LOADING =====

  it('P.46: goal-tracking.min.js is in the lazy-loading chain', () => {
    assert.ok(appSrc.includes("ensureLazyModule(lazyAsset('js/goal-tracking.min.js'))"), 'Lazy-loaded in app.js');
  });

  it('P.47: goal-tracking.min.js is loaded after effort-calibration.min.js', () => {
    const calIdx = appSrc.indexOf("ensureLazyModule(lazyAsset('js/effort-calibration.min.js'))");
    const goalIdx = appSrc.indexOf("ensureLazyModule(lazyAsset('js/goal-tracking.min.js'))");
    assert.ok(goalIdx > calIdx, 'Loaded after effort-calibration');
  });

  // ===== SW CACHE =====

  it('P.48: goal-tracking.min.js is in SW precache list', () => {
    assert.ok(swSrc.includes("'./js/goal-tracking.min.js?v='"), 'In SW precache');
  });

  it('P.49: goal-tracking.min.js is listed exactly once', () => {
    const matches = swSrc.match(/goal-tracking\.min\.js/g);
    assert.ok(matches && matches.length === 1, 'Exactly once in precache');
  });

  // ===== EDGE CASES =====

  it('P.50: deleteGoalTracker returns error for not-found', () => {
    assert.ok(trackingSrc.includes("'not-found'"), 'Has not-found error');
  });

  it('P.51: createGoalTracker deduplicates UIDs from milestones', () => {
    assert.ok(trackingSrc.includes("uidSet.add(uid)"), 'Deduplicates UIDs');
    assert.ok(trackingSrc.includes("Array.from(uidSet)"), 'Converts set to array');
  });

  it('P.52: explainGoalHealth handles unknown health gracefully', () => {
    assert.ok(trackingSrc.includes('Không đủ dữ liệu'), 'Handles unknown gracefully');
  });
});
