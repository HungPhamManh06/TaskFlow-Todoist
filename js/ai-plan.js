/**
 * js/ai-plan.js — Phase 6H: Constraint-Aware Plan Synthesis
 *
 * Deterministic helpers for:
 *  - Free-window calculation (P9)
 *  - Plan preview schema (P3)
 *  - Plan session validation (P40-P43)
 *  - Duration conservation (P43)
 *  - Convert plan sessions → Agent proposal actions (P57-P59)
 *
 * No Gemini calls. Pure functions where possible.
 */
;(function (g) {
  'use strict';

  /* ─── Constants ─── */
  var PLAN_MIN_SESSION = 25;   // P21: min session minutes
  var PLAN_MAX_SESSION = 180;  // P22: absolute max
  var PLAN_DEFAULT_SESSION = 45;
  var PLAN_MIN_BREAK = 0;      // P23: default break between sessions (minutes)
  var PLAN_MAX_HORIZON_DAYS = 14; // P32
  var PLAN_MAX_TASKS = 20;     // P34
  var PLAN_MAX_SESSIONS = 60;
  var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  /* ─── P3: Plan Preview Schema ─── */
  function createPlanPreview(id) {
    return {
      id: id || 'plan-' + Date.now(),
      revision: 0,
      range: { start: null, end: null },
      sessions: [],
      unscheduled: [],
      assumptions: [],
      warnings: [],
      constraints: {},
      createdAt: Date.now()
    };
  }

  /* ─── P9: Deterministic free-window calculation ─── */
  /**
   * Calculate available minutes per date.
   * @param {string} dateStr - YYYY-MM-DD
   * @param {Object} opts - { defaultWindowStart, defaultWindowEnd, timeblocks, busy, unavailableWindows }
   * @returns {Array<{start: string, end: string, minutes: number}>}
   */
  function calculateFreeWindows(dateStr, opts) {
    if (!ISO_DATE_RE.test(dateStr)) return [];
    opts = opts || {};

    // Default available window
    var windowStart = opts.defaultWindowStart || '00:00';
    var windowEnd = opts.defaultWindowEnd || '23:59';

    // Parse user constraints
    if (opts.constraints) {
      if (opts.constraints.windowStart) windowStart = opts.constraints.windowStart;
      if (opts.constraints.windowEnd) windowEnd = opts.constraints.windowEnd;
      if (opts.constraints.excludeDays) {
        var dow = new Date(dateStr + 'T12:00:00').getDay();
        var excluded = opts.constraints.excludeDays;
        if (Array.isArray(excluded) && excluded.indexOf(dow) !== -1) return [];
      }
    }

    var startMin = _toMin(windowStart);
    var endMin = _toMin(windowEnd);
    if (startMin === null || endMin === null || startMin >= endMin) return [];

    // Collect occupied intervals (startMin, endMin pairs in minutes)
    var occupied = [];

    // TimeBlocks
    var tb = opts.timeblocks;
    if (tb && Array.isArray(tb.blocks)) {
      for (var i = 0; i < tb.blocks.length; i++) {
        var b = tb.blocks[i];
        if (b && b.date === dateStr && b.status !== 'cancelled') {
          var bStart = _toMin(b.start);
          var bEnd = _toMin(b.end);
          if (bStart !== null && bEnd !== null) occupied.push([bStart, bEnd]);
        }
      }
    }

    // Google busy
    var busy = opts.busy;
    if (Array.isArray(busy)) {
      var dayMs = new Date(dateStr + 'T00:00:00').getTime();
      for (var j = 0; j < busy.length; j++) {
        var ev = busy[j];
        if (!ev) continue;
        var evStart, evEnd;
        if (typeof ev.start === 'string' && typeof ev.end === 'string') {
          evStart = _toMin(ev.start);
          evEnd = _toMin(ev.end);
        } else if (typeof ev.startMs === 'number' && typeof ev.endMs === 'number') {
          evStart = Math.round((ev.startMs - dayMs) / 60000);
          evEnd = Math.round((ev.endMs - dayMs) / 60000);
        }
        if (evStart !== null && evEnd !== null && evStart >= 0 && evEnd <= 1440) {
          occupied.push([evStart, evEnd]);
        }
      }
    }

    // Unavailable windows from constraints
    var uw = opts.unavailableWindows;
    if (Array.isArray(uw)) {
      for (var k = 0; k < uw.length; k++) {
        var w = uw[k];
        if (w && w.date === dateStr) {
          var wS = _toMin(w.start);
          var wE = _toMin(w.end);
          if (wS !== null && wE !== null) occupied.push([wS, wE]);
        }
      }
    }

    // Sort occupied intervals
    occupied.sort(function (a, b) { return a[0] - b[0]; });

    // Merge overlapping occupied intervals
    var merged = [];
    for (var m = 0; m < occupied.length; m++) {
      var cur = occupied[m];
      if (merged.length === 0) {
        merged.push([cur[0], cur[1]]);
      } else {
        var last = merged[merged.length - 1];
        if (cur[0] <= last[1]) {
          last[1] = Math.max(last[1], cur[1]);
        } else {
          merged.push([cur[0], cur[1]]);
        }
      }
    }

    // Compute free windows within [windowStart, windowEnd]
    var windows = [];
    var cursor = startMin;
    for (var n = 0; n < merged.length; n++) {
      var occ = merged[n];
      if (cursor < occ[0] && cursor < endMin) {
        var freeEnd = Math.min(occ[0], endMin);
        windows.push({
          start: _minToTime(cursor),
          end: _minToTime(freeEnd),
          minutes: freeEnd - cursor
        });
      }
      if (occ[1] > cursor) cursor = occ[1];
    }
    if (cursor < endMin) {
      windows.push({
        start: _minToTime(cursor),
        end: _minToTime(endMin),
        minutes: endMin - cursor
      });
    }

    return windows;
  }

  /** P9: Calculate total available minutes for a date */
  function calculateDayCapacity(dateStr, opts) {
    var windows = calculateFreeWindows(dateStr, opts);
    var total = 0;
    for (var i = 0; i < windows.length; i++) total += windows[i].minutes;
    return total;
  }

  /** P9: Calculate capacity for a date range */
  function calculateRangeCapacity(startStr, endStr, opts) {
    var dates = _dateRange(startStr, endStr);
    var perDay = {};
    var total = 0;
    for (var i = 0; i < dates.length; i++) {
      var cap = calculateDayCapacity(dates[i], opts);
      perDay[dates[i]] = cap;
      total += cap;
    }
    return { total: total, perDay: perDay, dates: dates };
  }

  /* ─── P18: Duration resolution ─── */
  function resolveDuration(task, opts) {
    opts = opts || {};
    if (task.duration && task.duration > 0) return task.duration;
    if (task.estimatedMinutes && task.estimatedMinutes > 0) return task.estimatedMinutes;
    if (opts.defaultTaskDuration && opts.defaultTaskDuration > 0) return opts.defaultTaskDuration;
    return PLAN_DEFAULT_SESSION;
  }

  /* ─── P19: Task splitting ─── */
  /**
   * Split a task's total duration into sessions.
   * @param {number} totalMinutes
   * @param {number} maxSession - max minutes per session
   * @returns {Array<number>} - array of session durations
   */
  function splitDuration(totalMinutes, maxSession) {
    maxSession = maxSession || PLAN_MAX_SESSION;
    if (maxSession < PLAN_MIN_SESSION) maxSession = PLAN_MIN_SESSION;
    var sessions = [];
    var remaining = totalMinutes;
    while (remaining > 0) {
      if (remaining <= maxSession) {
        sessions.push(remaining);
        remaining = 0;
      } else {
        sessions.push(maxSession);
        remaining -= maxSession;
      }
    }
    return sessions;
  }

  /* ─── P40-P43: Plan validation ─── */
  function validatePlan(preview, taskMap, opts) {
    opts = opts || {};
    var errors = [];
    var warnings = [];
    if (!preview || !Array.isArray(preview.sessions)) {
      return { valid: false, errors: ['plan-no-sessions'], warnings: [] };
    }

    var knownKeys = {};
    if (taskMap) {
      for (var k in taskMap) { if (taskMap.hasOwnProperty(k)) knownKeys[k] = true; }
    }

    var dayTotals = {};

    for (var i = 0; i < preview.sessions.length; i++) {
      var s = preview.sessions[i];

      // Known task key
      if (!s.taskKey || !knownKeys[s.taskKey]) {
        errors.push({ code: 'unknown-task-key', index: i, taskKey: s.taskKey });
        continue;
      }

      // Valid date
      if (!ISO_DATE_RE.test(s.date)) {
        errors.push({ code: 'invalid-date', index: i });
        continue;
      }

      // Valid time
      if (!TIME_RE.test(s.start)) {
        errors.push({ code: 'invalid-start', index: i });
        continue;
      }

      // Duration range
      if (typeof s.duration !== 'number' || s.duration < PLAN_MIN_SESSION || s.duration > PLAN_MAX_SESSION) {
        errors.push({ code: 'invalid-duration', index: i });
        continue;
      }

      // Within horizon
      if (preview.range && preview.range.start && preview.range.end) {
        if (s.date < preview.range.start || s.date > preview.range.end) {
          errors.push({ code: 'outside-horizon', index: i });
        }
      }

      // P43: Duration conservation
      if (taskMap && taskMap[s.taskKey]) {
        var task = taskMap[s.taskKey];
        if (!dayTotals[s.taskKey]) dayTotals[s.taskKey] = 0;
        dayTotals[s.taskKey] += s.duration;
        var taskDur = resolveDuration(task, opts);
        if (dayTotals[s.taskKey] > taskDur * 1.5) {
          warnings.push({ code: 'duration-exceeded', index: i, taskKey: s.taskKey, planned: dayTotals[s.taskKey], expected: taskDur });
        }
      }

      // P42: Overlap check within proposed sessions
      var sStart = _toMin(s.start);
      var sEnd = sStart + s.duration;
      for (var j = i + 1; j < preview.sessions.length; j++) {
        var s2 = preview.sessions[j];
        if (s2.date === s.date) {
          var s2Start = _toMin(s2.start);
          var s2End = s2Start + s2.duration;
          if (sStart < s2End && s2Start < sEnd) {
            warnings.push({ code: 'session-overlap', indices: [i, j] });
          }
        }
      }
    }

    // P44: Unscheduled count
    if (preview.unscheduled && preview.unscheduled.length > 0) {
      warnings.push({ code: 'partial-plan', unscheduledCount: preview.unscheduled.length });
    }

    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  /* ─── P57-P59: Convert plan sessions → Agent proposal actions ─── */
  /**
   * Convert plan sessions to Agent proposal actions.
   * @param {Object} preview - plan preview
   * @param {Object} taskMap - { taskKey: {uid, text, ...} }
   * @param {Object} pendingActions - { actionId: action } for pending create_task actions
   * @returns {Object} - { ok, actions, errors }
   */
  function convertPlanToProposal(preview, taskMap, pendingActions) {
    if (!preview || !Array.isArray(preview.sessions)) {
      return { ok: false, errors: ['no-sessions'] };
    }
    taskMap = taskMap || {};
    pendingActions = pendingActions || {};
    var actions = [];
    var errors = [];
    var actionIdCounter = 0;

    for (var i = 0; i < preview.sessions.length; i++) {
      var s = preview.sessions[i];
      actionIdCounter++;
      var actionId = 'pa' + actionIdCounter;

      var task = taskMap[s.taskKey];
      var pendingAction = pendingActions[s.taskKey]; // P59: pending create task

      if (!task && !pendingAction) {
        errors.push({ index: i, code: 'unknown-task', taskKey: s.taskKey });
        continue;
      }

      // P58: Existing task → schedule_task action
      if (task && task.uid) {
        actions.push({
          id: actionId,
          type: 'schedule_task',
          args: {
            taskRef: { kind: 'existing', uid: task.uid },
            date: s.date,
            start: s.start,
            duration: s.duration
          }
        });
      }
      // P59: Pending create → schedule_task with action dependency
      else if (pendingAction) {
        actions.push({
          id: actionId,
          type: 'schedule_task',
          args: {
            taskRef: { kind: 'action', actionId: s.taskKey },
            date: s.date,
            start: s.start,
            duration: s.duration
          }
        });
      }
    }

    return { ok: errors.length === 0, actions: actions, errors: errors };
  }

  /* ─── Helpers ─── */
  function _toMin(timeStr) {
    if (typeof timeStr !== 'string') return null;
    var m = /^(\d{2}):(\d{2})$/.exec(timeStr);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function _minToTime(mins) {
    mins = Math.max(0, Math.min(1439, Math.floor(mins)));
    return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  }

  function _dateRange(startStr, endStr) {
    var dates = [];
    var cur = new Date(startStr + 'T12:00:00');
    var end = new Date(endStr + 'T12:00:00');
    while (cur <= end) {
      dates.push(cur.getFullYear() + '-' +
        String(cur.getMonth() + 1).padStart(2, '0') + '-' +
        String(cur.getDate()).padStart(2, '0'));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  /* ─── Exports ─── */
  var api = {
    PLAN_MIN_SESSION: PLAN_MIN_SESSION,
    PLAN_MAX_SESSION: PLAN_MAX_SESSION,
    PLAN_DEFAULT_SESSION: PLAN_DEFAULT_SESSION,
    PLAN_MAX_HORIZON_DAYS: PLAN_MAX_HORIZON_DAYS,
    PLAN_MAX_TASKS: PLAN_MAX_TASKS,
    PLAN_MAX_SESSIONS: PLAN_MAX_SESSIONS,
    ISO_DATE_RE: ISO_DATE_RE,
    TIME_RE: TIME_RE,
    createPlanPreview: createPlanPreview,
    calculateFreeWindows: calculateFreeWindows,
    calculateDayCapacity: calculateDayCapacity,
    calculateRangeCapacity: calculateRangeCapacity,
    resolveDuration: resolveDuration,
    splitDuration: splitDuration,
    validatePlan: validatePlan,
    convertPlanToProposal: convertPlanToProposal,
    _toMin: _toMin,
    _minToTime: _minToTime,
    _dateRange: _dateRange
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    g.TaskFlowAIPlan = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
