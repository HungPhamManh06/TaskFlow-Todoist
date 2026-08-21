// TaskFlow — Opt-In Effort Calibration & Estimate Suggestions (Phase 6O).
// Uses verified Phase 6N focus history to suggest more realistic time estimates.
// Pure deterministic functions — 0 Gemini, 0 ML, 0 server calls.
// Device-local only. OFF by default.
// Storage key: taskflow_effort_calibration_v1
// Export: loadCalibrationData, saveCalibrationData, clearCalibrationData,
//   collectEligibleSamples, aggregateSamplesPerTask, computeRatio,
//   computeRobustRatio, computeProjectCalibration, computeGlobalCalibration,
//   computeEstimateSuggestion, computeEstimateRange, buildEstimateSuggestion,
//   explainSuggestion, classifyEstimateIntent, isCalibrationEnabled,
//   toggleCalibration, CALIBRATION_VERSION, CALIBRATION_KEY, CALIBRATION_DEFAULTS
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowEffortCalibration = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ---- Constants ----
  const CALIBRATION_VERSION = 1;
  const CALIBRATION_KEY = 'taskflow_effort_calibration_v1';
  const CALIBRATION_DEFAULTS = {
    minSamples: 5,
    strongSamples: 10,
    maxRatioContribution: 4,
    minRatioContribution: 0.25,
    closeToEstimateLow: 0.9,
    closeToEstimateHigh: 1.1,
    maxSamples: 500,
    roundingMinutes: 5,
    ratioDecimals: 3
  };

  // ---- Storage ----

  function loadCalibrationData() {
    try {
      const raw = localStorage.getItem(CALIBRATION_KEY);
      if (!raw) return { version: CALIBRATION_VERSION, enabled: false, samples: {}, cache: {} };
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return { version: CALIBRATION_VERSION, enabled: false, samples: {}, cache: {} };
      if (data.version !== CALIBRATION_VERSION) return { version: CALIBRATION_VERSION, enabled: false, samples: {}, cache: {} };
      if (!data.samples || typeof data.samples !== 'object') data.samples = {};
      if (!data.cache || typeof data.cache !== 'object') data.cache = {};
      return data;
    } catch (e) {
      return { version: CALIBRATION_VERSION, enabled: false, samples: {}, cache: {} };
    }
  }

  function saveCalibrationData(data) {
    try {
      localStorage.setItem(CALIBRATION_KEY, JSON.stringify(data));
    } catch (e) { /* degrade */ }
  }

  function clearCalibrationData() {
    try {
      localStorage.removeItem(CALIBRATION_KEY);
    } catch (e) { /* ignore */ }
  }

  // ---- Settings ----

  function isCalibrationEnabled(data) {
    return !!(data && data.enabled);
  }

  function toggleCalibration(enabled, data) {
    const d = data || loadCalibrationData();
    d.enabled = !!enabled;
    saveCalibrationData(d);
    return d;
  }

  // ---- Sample Collection ----

  /**
   * Collect eligible calibration samples from focus session history.
   * A sample is eligible if:
   * - outcome.userConfirmed === true
   * - outcome.type is 'progress' or 'task-completed'
   * - outcome.creditedMinutes > 0
   * - task has a known estimated duration (task.duration > 0)
   * - task has a uid
   *
   * sessions: array of Phase 6N focus history sessions
   * taskMap: { uid: { duration, projectId, text, done } }
   */
  function collectEligibleSamples(sessions, taskMap) {
    if (!Array.isArray(sessions) || !taskMap || typeof taskMap !== 'object') return [];
    const samples = [];
    for (const s of sessions) {
      if (!s || !s.taskRef || !s.taskRef.uid) continue;
      if (!s.outcome || !s.outcome.userConfirmed) continue;
      if (s.outcome.type !== 'progress' && s.outcome.type !== 'task-completed') continue;
      if (typeof s.outcome.creditedMinutes !== 'number' || s.outcome.creditedMinutes <= 0) continue;
      const uid = s.taskRef.uid;
      const task = taskMap[uid];
      if (!task) continue;
      const estimatedMinutes = typeof task.duration === 'number' && task.duration > 0 ? task.duration : null;
      if (!estimatedMinutes) continue;
      samples.push({
        taskUid: uid,
        taskText: task.text || '',
        estimatedMinutes,
        creditedMinutes: Math.round(s.outcome.creditedMinutes),
        completed: !!(task.done),
        projectId: task.projectId || null,
        sessionId: s.id || null,
        outcomeType: s.outcome.type
      });
    }
    return samples;
  }

  // ---- Task-Level Aggregation ----

  /**
   * Aggregate multiple focus sessions for the same task into one sample.
   * Returns array of { taskUid, estimatedMinutes, verifiedMinutes, completed, projectId, taskText }
   */
  function aggregateSamplesPerTask(samples) {
    if (!Array.isArray(samples)) return [];
    const byUid = new Map();
    for (const s of samples) {
      if (!s.taskUid) continue;
      const existing = byUid.get(s.taskUid);
      if (existing) {
        existing.verifiedMinutes += s.creditedMinutes;
        existing.sessionCount += 1;
        if (s.completed) existing.completed = true;
      } else {
        byUid.set(s.taskUid, {
          taskUid: s.taskUid,
          taskText: s.taskText || '',
          estimatedMinutes: s.estimatedMinutes,
          verifiedMinutes: s.creditedMinutes,
          completed: !!s.completed,
          projectId: s.projectId || null,
          sessionCount: 1
        });
      }
    }
    return Array.from(byUid.values());
  }

  // ---- Only Finalized Samples ----

  /**
   * Filter to only completed tasks for ratio calibration.
   * Incomplete tasks may help estimate remaining effort but not final ratio.
   */
  function filterFinalizedSamples(aggregated) {
    if (!Array.isArray(aggregated)) return [];
    return aggregated.filter((s) => s.completed && s.estimatedMinutes > 0 && s.verifiedMinutes > 0);
  }

  // ---- Ratio Calculation ----

  function computeRatio(estimatedMinutes, verifiedMinutes) {
    if (!estimatedMinutes || estimatedMinutes <= 0 || !verifiedMinutes || verifiedMinutes <= 0) return null;
    return verifiedMinutes / estimatedMinutes;
  }

  function clampRatio(ratio, defaults) {
    const d = defaults || CALIBRATION_DEFAULTS;
    return Math.max(d.minRatioContribution, Math.min(d.maxRatioContribution, ratio));
  }

  // ---- Robust Statistics ----

  /**
   * Compute median of a sorted numeric array.
   */
  function median(sorted) {
    if (!Array.isArray(sorted) || sorted.length === 0) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Compute percentile (0-100) of a sorted numeric array.
   */
  function percentile(sorted, p) {
    if (!Array.isArray(sorted) || sorted.length === 0) return null;
    const idx = (p / 100) * (sorted.length - 1);
    const low = Math.floor(idx);
    const high = Math.ceil(idx);
    if (low === high) return sorted[low];
    return sorted[low] + (sorted[high] - sorted[low]) * (idx - low);
  }

  /**
   * Compute robust median ratio from array of ratios, with outlier clamping.
   */
  function computeRobustRatio(ratios, defaults) {
    if (!Array.isArray(ratios) || ratios.length === 0) return null;
    const d = defaults || CALIBRATION_DEFAULTS;
    const clamped = ratios.map((r) => clampRatio(r, d)).sort((a, b) => a - b);
    return median(clamped);
  }

  // ---- Project Calibration ----

  function computeProjectCalibration(aggregated, projectId, defaults) {
    if (!projectId) return null;
    const d = defaults || CALIBRATION_DEFAULTS;
    const projectSamples = filterFinalizedSamples(aggregated).filter((s) => s.projectId === projectId);
    if (projectSamples.length < d.minSamples) return null;
    const ratios = projectSamples.map((s) => computeRatio(s.estimatedMinutes, s.verifiedMinutes)).filter(Boolean);
    const robustMedian = computeRobustRatio(ratios, d);
    if (robustMedian === null) return null;
    return {
      source: 'project',
      ratio: Math.round(robustMedian * Math.pow(10, d.ratioDecimals)) / Math.pow(10, d.ratioDecimals),
      sampleCount: projectSamples.length,
      projectId
    };
  }

  // ---- Global Calibration ----

  function computeGlobalCalibration(aggregated, defaults) {
    const d = defaults || CALIBRATION_DEFAULTS;
    const finalized = filterFinalizedSamples(aggregated);
    if (finalized.length < d.minSamples) return null;
    const ratios = finalized.map((s) => computeRatio(s.estimatedMinutes, s.verifiedMinutes)).filter(Boolean);
    const robustMedian = computeRobustRatio(ratios, d);
    if (robustMedian === null) return null;
    return {
      source: 'global',
      ratio: Math.round(robustMedian * Math.pow(10, d.ratioDecimals)) / Math.pow(10, d.ratioDecimals),
      sampleCount: finalized.length,
      projectId: null
    };
  }

  // ---- Estimate Suggestion ----

  function roundToNearest(minutes, defaults) {
    const d = defaults || CALIBRATION_DEFAULTS;
    return Math.round(minutes / d.roundingMinutes) * d.roundingMinutes;
  }

  function computeEstimateSuggestion(originalMinutes, ratio, defaults) {
    if (!originalMinutes || originalMinutes <= 0 || !ratio || ratio <= 0) return null;
    return roundToNearest(originalMinutes * ratio, defaults);
  }

  function computeEstimateRange(originalMinutes, aggregated, defaults) {
    if (!originalMinutes || originalMinutes <= 0) return null;
    const d = defaults || CALIBRATION_DEFAULTS;
    const finalized = filterFinalizedSamples(aggregated);
    if (finalized.length < d.strongSamples) return null;
    const ratios = finalized.map((s) => computeRatio(s.estimatedMinutes, s.verifiedMinutes))
      .filter(Boolean)
      .map((r) => clampRatio(r, d))
      .sort((a, b) => a - b);
    if (ratios.length < 4) return null;
    const low = roundToNearest(originalMinutes * percentile(ratios, 25), d);
    const high = roundToNearest(originalMinutes * percentile(ratios, 75), d);
    return { low: Math.min(low, high), high: Math.max(low, high) };
  }

  // ---- Full Suggestion Builder ----

  function buildEstimateSuggestion(estimatedMinutes, projectId, aggregated, defaults) {
    if (!estimatedMinutes || estimatedMinutes <= 0) return null;
    const d = defaults || CALIBRATION_DEFAULTS;
    const finalized = filterFinalizedSamples(aggregated);

    // Try project-specific first, then global
    let cal = projectId ? computeProjectCalibration(aggregated, projectId, d) : null;
    if (!cal) cal = computeGlobalCalibration(aggregated, d);
    if (!cal) {
      return {
        originalMinutes: estimatedMinutes,
        suggestedMinutes: null,
        rangeMinutes: null,
        sampleCount: finalized.length,
        source: 'none',
        ratio: null,
        reason: 'insufficient-data'
      };
    }

    const suggested = computeEstimateSuggestion(estimatedMinutes, cal.ratio, d);
    const range = computeEstimateRange(estimatedMinutes, aggregated, d);

    return {
      originalMinutes: estimatedMinutes,
      suggestedMinutes: suggested,
      rangeMinutes: range,
      sampleCount: cal.sampleCount,
      source: cal.source,
      ratio: cal.ratio,
      reason: 'calibration-available'
    };
  }

  // ---- Explainability ----

  function explainSuggestion(suggestion) {
    if (!suggestion || suggestion.reason === 'insufficient-data') {
      return { lines: ['Chưa đủ dữ liệu để cải thiện ước tính.'] };
    }
    const lines = [];
    lines.push(suggestion.suggestedMinutes + ' phút được đề xuất.');
    lines.push('• Estimate hiện tại: ' + suggestion.originalMinutes + ' phút');
    lines.push('• Dựa trên ' + suggestion.sampleCount + ' task đã ghi nhận');
    lines.push('• Tỷ lệ median actual/estimate: ' + suggestion.ratio);
    lines.push('• Phạm vi: ' + suggestion.source);
    if (suggestion.rangeMinutes) {
      lines.push('• Khoảng: ' + suggestion.rangeMinutes.low + '–' + suggestion.rangeMinutes.high + ' phút');
    }
    return { lines };
  }

  // ---- Intent Router ----

  function classifyEstimateIntent(message) {
    if (!message || typeof message !== 'string') return null;
    var s = message.trim().toLowerCase();

    // Estimate question
    if (/(?:task|việc|công việc).*(?:bao lâu|bao nhiêu phút|estimate|thời gian)/.test(s))
      return { kind: 'estimate-question', confidence: 'high', reason: 'estimate-question' };
    if (/(?:nên|thể).*(?:để bao nhiêu|bao nhiêu phút|estimate)/.test(s))
      return { kind: 'estimate-question', confidence: 'high', reason: 'estimate-should' };

    // Use calibrated estimate
    if (/(?:dùng|sử dụng).*(?:estimate đề xuất|đề xuất|đã hiệu chỉnh|calibrated)/.test(s))
      return { kind: 'use-calibrated-estimate', confidence: 'high', reason: 'use-calibrated' };
    if (/(?:apply|dùng).*\d+.*phút/.test(s) && /(?:đề xuất|suggested)/.test(s))
      return { kind: 'use-calibrated-estimate', confidence: 'medium', reason: 'use-suggested' };

    // Keep original
    if (/(?:giữ|keep).*(?:60|original|hiện tại|current)/.test(s))
      return { kind: 'keep-original-estimate', confidence: 'high', reason: 'keep-original' };

    // Update task estimate
    if (/(?:cập nhật|update).*(?:estimate|thời gian|duration)/.test(s))
      return { kind: 'update-task-estimate', confidence: 'high', reason: 'update-estimate' };

    // Calibration status/settings
    if (/(?:hiệu chỉnh|calibration).*(?:bật|tắt|enable|disable|trạng thái|status)/.test(s))
      return { kind: 'calibration-settings', confidence: 'high', reason: 'calibration-settings' };
    if (/(?:tắt|disable).*(?:học estimate|calibration|hiệu chỉnh)/.test(s))
      return { kind: 'calibration-settings', confidence: 'high', reason: 'disable-calibration' };

    return null;
  }

  // ---- Return API ----

  return {
    CALIBRATION_VERSION,
    CALIBRATION_KEY,
    CALIBRATION_DEFAULTS,

    loadCalibrationData,
    saveCalibrationData,
    clearCalibrationData,

    isCalibrationEnabled,
    toggleCalibration,

    collectEligibleSamples,
    aggregateSamplesPerTask,
    filterFinalizedSamples,

    computeRatio,
    computeRobustRatio,
    clampRatio,

    computeProjectCalibration,
    computeGlobalCalibration,

    computeEstimateSuggestion,
    computeEstimateRange,
    roundToNearest,
    buildEstimateSuggestion,

    explainSuggestion,
    classifyEstimateIntent,

    median,
    percentile
  };
});
