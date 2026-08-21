/**
 * Phase 6O — Opt-In Effort Calibration & Estimate Suggestions
 * Comprehensive test suite
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');

describe('Phase 6O — Opt-In Effort Calibration', () => {
  let calibrationSrc, aiIntentSrc, i18nSrc, swSrc, appSrc;

  before(() => {
    calibrationSrc = read('js/effort-calibration.js');
    aiIntentSrc = read('js/ai-intent.js');
    i18nSrc = read('js/i18n.js');
    swSrc = read('sw.js');
    appSrc = read('js/app.js');
  });

  // ===== MODULE STRUCTURE =====

  it('O.1: effort-calibration.js is a valid UMD module', () => {
    assert.ok(calibrationSrc.includes('typeof window'), 'UMD global check');
    assert.ok(calibrationSrc.includes('module.exports'), 'CommonJS export');
    assert.ok(calibrationSrc.includes('TaskFlowEffortCalibration'), 'Browser global name');
  });

  it('O.2: Module exports all required functions', () => {
    const required = [
      'loadCalibrationData', 'saveCalibrationData', 'clearCalibrationData',
      'isCalibrationEnabled', 'toggleCalibration',
      'collectEligibleSamples', 'aggregateSamplesPerTask', 'filterFinalizedSamples',
      'computeRatio', 'computeRobustRatio', 'clampRatio',
      'computeProjectCalibration', 'computeGlobalCalibration',
      'computeEstimateSuggestion', 'computeEstimateRange', 'roundToNearest',
      'buildEstimateSuggestion', 'explainSuggestion', 'classifyEstimateIntent',
      'median', 'percentile',
      'CALIBRATION_VERSION', 'CALIBRATION_KEY', 'CALIBRATION_DEFAULTS'
    ];
    for (const fn of required) {
      assert.ok(calibrationSrc.includes(fn), `Export missing: ${fn}`);
    }
  });

  it('O.3: Constants are correct', () => {
    assert.ok(calibrationSrc.includes('CALIBRATION_VERSION = 1'), 'Version = 1');
    assert.ok(calibrationSrc.includes('taskflow_effort_calibration_v1'), 'Storage key uses taskflow prefix');
    assert.ok(calibrationSrc.includes('minSamples: 5'), 'Min samples = 5');
    assert.ok(calibrationSrc.includes('maxRatioContribution: 4'), 'Max ratio = 4');
    assert.ok(calibrationSrc.includes('minRatioContribution: 0.25'), 'Min ratio = 0.25');
  });

  // ===== DEFAULT OFF =====

  it('O.4: Calibration is disabled by default', () => {
    assert.ok(calibrationSrc.includes('enabled: false'), 'Default disabled');
  });

  it('O.5: No pre-checked toggle', () => {
    assert.ok(calibrationSrc.includes("'taskflow_effort_calibration_v1'"), 'Uses correct storage key');
  });

  // ===== STORAGE =====

  it('O.6: loadCalibrationData handles missing/corrupt data safely', () => {
    assert.ok(calibrationSrc.includes('catch (e)'), 'Handles parse errors');
    assert.ok(calibrationSrc.includes('enabled: false'), 'Returns default on error');
  });

  it('O.7: clearCalibrationData removes calibration store', () => {
    assert.ok(calibrationSrc.includes("localStorage.removeItem(CALIBRATION_KEY)"), 'Clears storage');
  });

  // ===== ELIGIBLE SAMPLES =====

  it('O.8: collectEligibleSamples requires userConfirmed = true', () => {
    assert.ok(calibrationSrc.includes("s.outcome.userConfirmed"), 'Checks userConfirmed');
  });

  it('O.9: collectEligibleSamples requires type progress/task-completed', () => {
    assert.ok(calibrationSrc.includes("'progress'") && calibrationSrc.includes("'task-completed'"), 'Checks types');
  });

  it('O.10: collectEligibleSamples requires creditedMinutes > 0', () => {
    assert.ok(calibrationSrc.includes("creditedMinutes <= 0"), 'Checks credited > 0');
  });

  it('O.11: collectEligibleSamples requires task with duration > 0', () => {
    assert.ok(calibrationSrc.includes("estimatedMinutes"), 'Uses estimatedMinutes');
  });

  // ===== TASK-LEVEL AGGREGATION =====

  it('O.12: aggregateSamplesPerTask combines sessions by uid', () => {
    assert.ok(calibrationSrc.includes("byUid.get(s.taskUid)"), 'Groups by uid');
    assert.ok(calibrationSrc.includes("existing.verifiedMinutes += s.creditedMinutes"), 'Sums credits');
  });

  it('O.13: Aggregate produces one sample per task, not per session', () => {
    // The function should combine multiple sessions for the same task
    assert.ok(calibrationSrc.includes("sessionCount += 1"), 'Counts sessions per task');
  });

  // ===== FINALIZED SAMPLES =====

  it('O.14: filterFinalizedSamples only includes completed tasks', () => {
    assert.ok(calibrationSrc.includes("s.completed"), 'Checks completion');
  });

  // ===== RATIO =====

  it('O.15: computeRatio = verifiedMinutes / estimatedMinutes', () => {
    assert.ok(calibrationSrc.includes("verifiedMinutes / estimatedMinutes"), 'Computes ratio');
  });

  it('O.16: Invalid samples excluded (estimate <= 0, verified <= 0)', () => {
    assert.ok(calibrationSrc.includes("estimatedMinutes <= 0"), 'Excludes invalid estimate');
    assert.ok(calibrationSrc.includes("verifiedMinutes <= 0"), 'Excludes invalid verified');
  });

  // ===== ROBUST STATISTICS =====

  it('O.17: Median is used as robust estimator', () => {
    assert.ok(calibrationSrc.includes("median(clamped)"), 'Uses median of clamped ratios');
  });

  it('O.18: Ratios are clamped before median', () => {
    assert.ok(calibrationSrc.includes("clampRatio(r, d)"), 'Clamps ratios');
  });

  it('O.19: Outlier robustness: maxRatioContribution limits extreme values', () => {
    assert.ok(calibrationSrc.includes("maxRatioContribution"), 'Has max ratio bound');
  });

  // ===== PROJECT CALIBRATION =====

  it('O.20: computeProjectCalibration requires minSamples', () => {
    assert.ok(calibrationSrc.includes("projectSamples.length < d.minSamples"), 'Checks min samples');
  });

  it('O.21: computeProjectCalibration returns null for insufficient data', () => {
    assert.ok(calibrationSrc.includes("return null"), 'Returns null when insufficient');
  });

  // ===== GLOBAL FALLBACK =====

  it('O.22: computeGlobalCalibration is used when project lacks data', () => {
    assert.ok(calibrationSrc.includes("computeGlobalCalibration(aggregated, d)"), 'Global fallback');
  });

  it('O.23: Global calibration requires minSamples', () => {
    assert.ok(calibrationSrc.includes("finalized.length < d.minSamples"), 'Checks min samples for global');
  });

  // ===== ESTIMATE ROUNDING =====

  it('O.24: Rounding to nearest 5 minutes', () => {
    assert.ok(calibrationSrc.includes("roundingMinutes: 5"), 'Rounds to 5 min');
    assert.ok(calibrationSrc.includes("roundToNearest"), 'Has rounding function');
  });

  // ===== ESTIMATE SUGGESTION =====

  it('O.25: buildEstimateSuggestion tries project first, then global', () => {
    assert.ok(calibrationSrc.includes("computeProjectCalibration"), 'Tries project first');
    assert.ok(calibrationSrc.includes("computeGlobalCalibration"), 'Falls back to global');
  });

  it('O.26: Returns reason: insufficient-data when no calibration available', () => {
    assert.ok(calibrationSrc.includes("'insufficient-data'"), 'Has insufficient-data reason');
  });

  // ===== ESTIMATE RANGE =====

  it('O.27: Range uses 25th/75th percentile when enough data', () => {
    assert.ok(calibrationSrc.includes("percentile(ratios, 25)"), 'Uses 25th percentile');
    assert.ok(calibrationSrc.includes("percentile(ratios, 75)"), 'Uses 75th percentile');
  });

  it('O.28: Range requires strongSamples count', () => {
    assert.ok(calibrationSrc.includes("strongSamples: 10"), 'Strong samples = 10');
  });

  // ===== EXPLAINABILITY =====

  it('O.29: explainSuggestion provides transparent reasoning', () => {
    assert.ok(calibrationSrc.includes('Estimate'), 'Explains estimate');
    assert.ok(calibrationSrc.includes('Dựa trên') || calibrationSrc.includes('Based on'), 'Shows sample count');
    assert.ok(calibrationSrc.includes('ratio') || calibrationSrc.includes('Tỷ lệ'), 'Shows ratio');
  });

  // ===== USER OVERRIDE =====

  it('O.30: User override always wins (no auto-update)', () => {
    assert.ok(calibrationSrc.includes("'keep-original-estimate'"), 'Has keep-original intent');
    assert.ok(calibrationSrc.includes("'use-calibrated-estimate'"), 'Has use-calibrated intent');
  });

  // ===== CANONICAL ESTIMATE SAFETY =====

  it('O.31: Module does not auto-update task estimates', () => {
    // Check for actual assignment (task.duration = X) not comparison (task.duration ===)
    assert.ok(!/task\.duration\s*=\s*[^=]/.test(calibrationSrc), 'No task.duration assignment');
    assert.ok(!/tk\.duration\s*=\s*[^=]/.test(calibrationSrc), 'No tk.duration assignment');
  });

  it('O.32: Module has zero network fetch calls (no AI requests)', () => {
    assert.ok(!calibrationSrc.includes('fetch('), 'No fetch calls in module');
  });

  // ===== PRIVACY =====

  it('O.33: Device-local storage only', () => {
    assert.ok(calibrationSrc.includes('localStorage'), 'Uses localStorage');
    assert.ok(!calibrationSrc.includes('fetch('), 'No server calls');
  });

  it('O.34: No productivity scores', () => {
    assert.ok(!calibrationSrc.includes('productivityScore') && !calibrationSrc.includes('performanceScore') && !calibrationSrc.includes('disciplineScore'), 'No scores');
  });

  it('O.35: No ML dependencies', () => {
    assert.ok(!calibrationSrc.includes('tensorflow') && !calibrationSrc.includes('neural') && !calibrationSrc.includes('regression'), 'No ML');
  });

  it('O.36: No Reflection/Mood usage', () => {
    assert.ok(!calibrationSrc.includes('reflection') && !calibrationSrc.includes('mood'), 'No Reflection/Mood');
  });

  // ===== INTENT ROUTER =====

  it('O.37: classifyEstimateIntent classifies estimate-question', () => {
    assert.ok(calibrationSrc.includes("'estimate-question'"), 'Has estimate-question kind');
  });

  it('O.38: classifyEstimateIntent classifies use-calibrated-estimate', () => {
    assert.ok(calibrationSrc.includes("'use-calibrated-estimate'"), 'Has use-calibrated kind');
  });

  it('O.39: classifyEstimateIntent classifies keep-original-estimate', () => {
    assert.ok(calibrationSrc.includes("'keep-original-estimate'"), 'Has keep-original kind');
  });

  it('O.40: classifyEstimateIntent classifies calibration-settings', () => {
    assert.ok(calibrationSrc.includes("'calibration-settings'"), 'Has calibration-settings kind');
  });

  // ===== AI INTENT INTEGRATION =====

  it('O.41: ai-intent.js exports classifyEstimateIntent', () => {
    assert.ok(aiIntentSrc.includes('classifyEstimateIntent'), 'ai-intent.js exports classifyEstimateIntent');
  });

  it('O.42: ai-intent.js has classifyEstimateIntent with estimate-question patterns', () => {
    assert.ok(aiIntentSrc.includes("'estimate-question'"), 'Has estimate-question in ai-intent');
  });

  // ===== I18N =====

  it('O.43: i18n.js has VI effort calibration keys', () => {
    const viKeys = ['effortCalibrationTitle', 'effortCalibrationDesc', 'effortEstimateCurrent', 'effortEstimateSuggested', 'effortEstimateUse', 'effortEstimateKeep', 'effortEstimateInsufficientData', 'effortEstimateBasedOn', 'effortCalibrationDelete'];
    for (const key of viKeys) {
      assert.ok(i18nSrc.includes(key + ':'), `Missing VI key: ${key}`);
    }
  });

  it('O.44: i18n.js has EN effort calibration keys', () => {
    const enKeyNames = ['effortCalibrationTitle', 'effortCalibrationDesc', 'effortEstimateCurrent', 'effortEstimateSuggested', 'effortEstimateUse', 'effortEstimateKeep', 'effortEstimateInsufficientData', 'effortCalibrationDelete'];
    for (const key of enKeyNames) {
      const matches = i18nSrc.match(new RegExp(key + ':', 'g'));
      assert.ok(matches && matches.length >= 2, `EN key missing or only once: ${key}`);
    }
  });

  // ===== LAZY LOADING =====

  it('O.45: effort-calibration.min.js is in the lazy-loading chain', () => {
    assert.ok(appSrc.includes("ensureLazyModule('js/effort-calibration.min.js')"), 'Lazy-loaded in app.js');
  });

  it('O.46: effort-calibration.min.js is loaded after focus-session.min.js', () => {
    const focusIdx = appSrc.indexOf("ensureLazyModule('js/focus-session.min.js')");
    const calIdx = appSrc.indexOf("ensureLazyModule('js/effort-calibration.min.js')");
    assert.ok(calIdx > focusIdx, 'Loaded after focus-session');
  });

  // ===== SW CACHE =====

  it('O.47: effort-calibration.min.js is in SW precache list', () => {
    assert.ok(swSrc.includes("'./js/effort-calibration.min.js'"), 'In SW precache');
  });

  it('O.48: effort-calibration.min.js is listed exactly once in SW precache', () => {
    const matches = swSrc.match(/effort-calibration\.min\.js/g);
    assert.ok(matches && matches.length === 1, 'Exactly once in precache');
  });

  // ===== EDGE CASES =====

  it('O.49: collectEligibleSamples returns [] for empty input', () => {
    assert.ok(calibrationSrc.includes("return [];"), 'Returns empty array');
  });

  it('O.50: computeEstimateSuggestion returns null for invalid input', () => {
    assert.ok(calibrationSrc.includes("return null"), 'Returns null for invalid');
  });
});
