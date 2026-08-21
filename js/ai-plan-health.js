/**
 * js/ai-plan-health.js — Phase 6J: Plan Health + Deadline Risk Forecasting
 *
 * Deterministic risk engine for:
 *  - Remaining work calculation (P6)
 *  - Capacity calculation reused from Phase 6H (P7)
 *  - Slack model (P8-P9)
 *  - Deadline margin (P10)
 *  - Risk classification (P11-P15)
 *  - Centralized thresholds (P16-P17)
 *  - Daily utilization (P18-P21)
 *  - Work concentration (P22-P23)
 *  - Backup capacity (P24)
 *  - Unscheduled work (P25)
 *  - Deadline clusters (P26)
 *  - Mitigation options (P42-P45)
 *
 * NO Gemini calls. Pure deterministic functions.
 * NO mutation functions. Read-only analysis.
 */
;(function (g) {
  'use strict';

  /* ─── P16: Centralized Risk Thresholds ─── */
  var RISK_THRESHOLDS = {
    /** slackRatio below this → WATCH */
    lowSlackRatio: 0.15,
    /** absolute slack minutes below this → WATCH */
    lowSlackMinutes: 30,
    /** slackRatio below this → AT-RISK */
    criticalSlackRatio: 0.05,
    /** absolute slack minutes below 0 → INFEASIBLE */
    criticalSlackMinutes: 0,
    /** daily utilization ratio above this → SATURATED */
    saturatedDayRatio: 0.90,
    /** daily utilization ratio > 1.0 → OVERLOADED */
    overloadedDayRatio: 1.0,
    /** concentration ratio: % of work on last day before deadline */
    concentrationWarningRatio: 0.60,
    /** fragile: only one session window remaining and it's exactly the task duration */
    fragileOneWindow: true,
    /** min remaining minutes after planned work to be considered SAFE */
    minSafeBackupMinutes: 60
  };

  /* ─── P11-P15: Risk Categories ─── */
  var RISK_SAFE = 'safe';
  var RISK_WATCH = 'watch';
  var RISK_AT_RISK = 'at-risk';
  var RISK_INFEASIBLE = 'infeasible';

  var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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

  function _daysBetween(date1, date2) {
    var d1 = new Date(date1 + 'T12:00:00');
    var d2 = new Date(date2 + 'T12:00:00');
    return Math.round((d2 - d1) / (24 * 60 * 60 * 1000));
  }

  /* ─── P6: Remaining Work ─── */
  /**
   * Compute remaining minutes for a task.
   * @param {Object} task - { duration, estimatedMinutes, completedMinutes }
   * @returns {number} remaining minutes (>= 0)
   */
  function computeRemainingWork(task) {
    if (!task) return 0;
    var total = task.duration || task.estimatedMinutes || 45;
    var completed = task.completedMinutes || 0;
    var remaining = total - completed;
    return remaining > 0 ? remaining : 0;
  }

  /* ─── P7: Capacity Calculation (reuses Phase 6H engine) ─── */
  /**
   * Calculate available capacity from `fromDate` to `toDate` (inclusive).
   * Uses the same free-window logic from ai-plan.js but computes in-process.
   * @param {Object} opts - { fromDate, toDate, now, defaultWindowStart, defaultWindowEnd,
   *                           timeblocks, busy, unavailableWindows, breakMinutes }
   * @returns {{ total: number, perDay: Object, dates: Array<string> }}
   */
  function computeCapacity(opts) {
    opts = opts || {};
    var fromDate = opts.fromDate;
    var toDate = opts.toDate;
    var now = opts.now; // "HH:MM" for today's cutoff

    if (!ISO_DATE_RE.test(fromDate) || !ISO_DATE_RE.test(toDate)) {
      return { total: 0, perDay: {}, dates: [] };
    }

    var defaultStart = _toMin(opts.defaultWindowStart || '08:00');
    var defaultEnd = _toMin(opts.defaultWindowEnd || '22:00');
    var breakMins = opts.breakMinutes || 0;
    var dates = _dateRange(fromDate, toDate);
    var perDay = {};
    var total = 0;

    for (var d = 0; d < dates.length; d++) {
      var dateStr = dates[d];
      var dayStart = defaultStart;
      var dayEnd = defaultEnd;

      // P55: Current-time boundary — today, only count from now onward
      if (dateStr === (opts.today || fromDate) && now) {
        var nowMin = _toMin(now);
        if (nowMin !== null) {
          // Add small buffer (5 min) so we don't schedule in the immediate past
          var safeStart = nowMin + 5;
          if (safeStart > dayStart) dayStart = safeStart;
        }
      }

      if (dayStart >= dayEnd) { perDay[dateStr] = 0; continue; }

      // Collect occupied intervals for this date
      var occupied = [];

      // TimeBlocks
      var tb = opts.timeblocks;
      if (tb && Array.isArray(tb.blocks)) {
        for (var b = 0; b < tb.blocks.length; b++) {
          var block = tb.blocks[b];
          if (block.date === dateStr) {
            var bStart = _toMin(block.start);
            var bEnd = bStart + (block.duration || 0);
            if (bStart !== null) occupied.push([bStart, bEnd]);
          }
        }
      }

      // Google busy
      var busy = opts.busy;
      if (Array.isArray(busy)) {
        for (var bi = 0; bi < busy.length; bi++) {
          var bw = busy[bi];
          if (bw.date === dateStr || (!bw.date && bw.start && bw.end)) {
            var bBusyStart = _toMin(bw.start);
            var bBusyEnd = _toMin(bw.end);
            if (bBusyStart !== null && bBusyEnd !== null) {
              occupied.push([bBusyStart, bBusyEnd]);
            }
          }
        }
      }

      // Unavailable windows
      var unavail = opts.unavailableWindows;
      if (Array.isArray(unavail)) {
        for (var ui = 0; ui < unavail.length; ui++) {
          var uw = unavail[ui];
          if (uw.date === dateStr) {
            var uStart = _toMin(uw.start);
            var uEnd = _toMin(uw.end);
            if (uStart !== null && uEnd !== null) {
              occupied.push([uStart, uEnd]);
            }
          }
        }
      }

      // Sort occupied intervals
      occupied.sort(function (a, b) { return a[0] - b[0]; });

      // Merge overlapping intervals
      var merged = [];
      for (var oi = 0; oi < occupied.length; oi++) {
        var iv = occupied[oi];
        if (merged.length === 0) {
          merged.push([iv[0], iv[1]]);
        } else {
          var last = merged[merged.length - 1];
          if (iv[0] <= last[1]) {
            last[1] = Math.max(last[1], iv[1]);
          } else {
            merged.push([iv[0], iv[1]]);
          }
        }
      }

      // Calculate free windows
      var cursor = dayStart;
      var dayCapacity = 0;
      for (var mi = 0; mi < merged.length; mi++) {
        var occ = merged[mi];
        if (cursor < occ[0]) {
          var freeMins = occ[0] - cursor;
          if (breakMins > 0 && freeMins > breakMins) freeMins -= breakMins;
          if (freeMins > 0) dayCapacity += freeMins;
        }
        if (occ[1] > cursor) cursor = occ[1];
      }
      if (cursor < dayEnd) {
        var endFree = dayEnd - cursor;
        if (breakMins > 0 && endFree > breakMins) endFree -= breakMins;
        if (endFree > 0) dayCapacity += endFree;
      }

      perDay[dateStr] = dayCapacity;
      total += dayCapacity;
    }

    return { total: total, perDay: perDay, dates: dates };
  }

  /* ─── P8-P9: Slack Calculation ─── */
  /**
   * Compute slack for a task or the entire plan.
   * slack = available capacity - remaining work
   * @param {number} remainingWorkMinutes
   * @param {number} availableCapacityMinutes
   * @returns {{ slackMinutes: number, slackRatio: number, feasible: boolean }}
   */
  function computeSlack(remainingWorkMinutes, availableCapacityMinutes) {
    var slack = availableCapacityMinutes - remainingWorkMinutes;
    var ratio = remainingWorkMinutes > 0 ? slack / remainingWorkMinutes : 1.0;
    return {
      slackMinutes: slack,
      slackRatio: ratio,
      feasible: slack >= 0
    };
  }

  /* ─── P10: Deadline Margin ─── */
  /**
   * Calculate deadline margin in days and minutes.
   * @param {string} nowDate - YYYY-MM-DD
   * @param {string|null} deadline - YYYY-MM-DD or null
   * @param {string|null} lastPlannedDate - YYYY-MM-DD when last session is scheduled
   * @returns {{ daysUntilDeadline: number|null, lastSessionDaysBeforeDeadline: number|null, hasDeadline: boolean }}
   */
  function computeDeadlineMargin(nowDate, deadline, lastPlannedDate) {
    if (!deadline || !ISO_DATE_RE.test(deadline)) {
      return { daysUntilDeadline: null, lastSessionDaysBeforeDeadline: null, hasDeadline: false };
    }
    var daysUntil = _daysBetween(nowDate, deadline);
    var lastDaysBefore = lastPlannedDate ? _daysBetween(lastPlannedDate, deadline) : null;
    return {
      daysUntilDeadline: daysUntil,
      lastSessionDaysBeforeDeadline: lastDaysBefore,
      hasDeadline: true
    };
  }

  /* ─── P11-P15: Risk Classification ─── */
  /**
   * Classify task risk based on deterministic metrics.
   * @param {Object} metrics - { remainingWork, capacity, slack, deadlineMargin, hasDeadline, ... }
   * @returns {string} 'safe' | 'watch' | 'at-risk' | 'infeasible'
   */
  function classifyRisk(metrics) {
    if (!metrics) return RISK_SAFE;

    var slack = metrics.slackMinutes !== undefined ? metrics.slackMinutes : 9999;
    var slackRatio = metrics.slackRatio !== undefined ? metrics.slackRatio : 1.0;
    var remainingWork = metrics.remainingWork || 0;
    var hasDeadline = metrics.hasDeadline;

    // P15: INFEASIBLE — remaining work cannot fit
    if (remainingWork > 0 && !metrics.feasible) {
      return RISK_INFEASIBLE;
    }

    // P14: AT-RISK — very low/zero slack with deadline
    if (hasDeadline && slack < RISK_THRESHOLDS.lowSlackMinutes && slack >= 0) {
      return RISK_AT_RISK;
    }
    if (hasDeadline && slackRatio < RISK_THRESHOLDS.criticalSlackRatio && slack >= 0) {
      return RISK_AT_RISK;
    }

    // P13: WATCH — low slack
    if (hasDeadline && slack < RISK_THRESHOLDS.lowSlackMinutes * 2 && slack >= 0) {
      return RISK_WATCH;
    }
    if (hasDeadline && slackRatio < RISK_THRESHOLDS.lowSlackRatio && slack >= 0) {
      return RISK_WATCH;
    }

    // P12: SAFE
    return RISK_SAFE;
  }

  /* ─── P18-P21: Daily Utilization ─── */
  /**
   * Compute daily utilization metrics.
   * @param {string} dateStr - YYYY-MM-DD
   * @param {number} scheduledMinutes - total planned minutes on this day
   * @param {number} availableMinutes - total capacity on this day
   * @returns {{ date, scheduled, available, utilization, overloaded, saturated }}
   */
  function computeDailyUtilization(dateStr, scheduledMinutes, availableMinutes) {
    var utilization = availableMinutes > 0 ? scheduledMinutes / availableMinutes : (scheduledMinutes > 0 ? Infinity : 0);
    return {
      date: dateStr,
      scheduled: scheduledMinutes,
      available: availableMinutes,
      utilization: utilization,
      overloaded: utilization > RISK_THRESHOLDS.overloadedDayRatio,
      saturated: utilization >= RISK_THRESHOLDS.saturatedDayRatio && utilization <= RISK_THRESHOLDS.overloadedDayRatio
    };
  }

  /* ─── P22-P23: Work Concentration & Fragility ─── */
  /**
   * Detect work concentration and fragile sessions.
   * @param {Array} sessions - [{ date, duration, taskKey }]
   * @param {Array} dates - all dates in range
   * @param {Object} perDayCapacity - { dateStr: capacityMinutes }
   * @param {string} deadline - YYYY-MM-DD or null
   * @returns {{ concentration: boolean, concentrationRatio: number, fragileDays: Array, singlePointFailures: Array }}
   */
  function detectConcentration(sessions, dates, perDayCapacity, deadline) {
    if (!sessions || sessions.length === 0 || !dates || dates.length === 0) {
      return { concentration: false, concentrationRatio: 0, fragileDays: [], singlePointFailures: [] };
    }

    // Work per day
    var workPerDay = {};
    var totalWork = 0;
    for (var s = 0; s < sessions.length; s++) {
      var sess = sessions[s];
      if (!workPerDay[sess.date]) workPerDay[sess.date] = 0;
      workPerDay[sess.date] += (sess.duration || 0);
      totalWork += (sess.duration || 0);
    }

    // P22: Concentration — check if most work is on last days
    var lastDate = dates[dates.length - 1];
    var workOnLastDay = workPerDay[lastDate] || 0;
    var concentrationRatio = totalWork > 0 ? workOnLastDay / totalWork : 0;
    var concentration = concentrationRatio > RISK_THRESHOLDS.concentrationWarningRatio;

    // P23: Fragile / Single-point failure detection
    var fragileDays = [];
    var singlePointFailures = [];

    for (var d = 0; d < dates.length; d++) {
      var dayWork = workPerDay[dates[d]] || 0;
      var dayCap = perDayCapacity[dates[d]] || 0;
      var dayUtil = dayCap > 0 ? dayWork / dayCap : 0;

      if (dayUtil >= RISK_THRESHOLDS.saturatedDayRatio) {
        fragileDays.push({
          date: dates[d],
          workMinutes: dayWork,
          capacityMinutes: dayCap,
          utilization: dayUtil
        });
      }

      // Single-point failure: only one session on a day fills the entire day
      // and that session is critical (has deadline pressure)
      if (dayWork > 0 && dayCap > 0) {
        var daySessions = [];
        for (var si = 0; si < sessions.length; si++) {
          if (sessions[si].date === dates[d]) daySessions.push(sessions[si]);
        }
        if (daySessions.length === 1 && dayUtil >= 0.8) {
          singlePointFailures.push({
            date: dates[d],
            session: daySessions[0],
            utilization: dayUtil
          });
        }
      }
    }

    return {
      concentration: concentration,
      concentrationRatio: concentrationRatio,
      fragileDays: fragileDays,
      singlePointFailures: singlePointFailures
    };
  }

  /* ─── P25-P26: Unscheduled Work & Deadline Clusters ─── */
  /**
   * Find tasks with no sessions in the plan.
   * @param {Array} tasks - [{ uid, key, text, duration, deadline }]
   * @param {Array} sessions - [{ taskKey, ... }]
   * @returns {Array} unscheduled tasks
   */
  function findUnscheduledTasks(tasks, sessions) {
    var scheduledKeys = {};
    for (var s = 0; s < sessions.length; s++) {
      if (sessions[s].taskKey) scheduledKeys[sessions[s].taskKey] = true;
    }
    var unscheduled = [];
    for (var t = 0; t < tasks.length; t++) {
      var task = tasks[t];
      if (task.completed) continue;
      if (!scheduledKeys[task.key]) {
        // P68-P70: Privacy — only include safe fields
        unscheduled.push({
          key: task.key,
          text: task.text || '',
          duration: task.duration || task.estimatedMinutes || 45,
          deadline: task.deadline || null,
          completedMinutes: task.completedMinutes || 0
        });
      }
    }
    return unscheduled;
  }

  /**
   * Detect deadline clusters — multiple tasks due in a narrow window.
   * @param {Array} tasks - [{ deadline }]
   * @param {number} windowDays - cluster detection window (default: 2)
   * @returns {{ clustered: boolean, clusters: Array }}
   */
  function detectDeadlineClusters(tasks, windowDays) {
    windowDays = windowDays || 2;
    var deadlines = [];
    for (var t = 0; t < tasks.length; t++) {
      if (tasks[t].deadline && ISO_DATE_RE.test(tasks[t].deadline)) {
        deadlines.push(tasks[t].deadline);
      }
    }
    if (deadlines.length < 2) return { clustered: false, clusters: [] };

    deadlines.sort();
    var clusters = [];
    var currentCluster = [deadlines[0]];

    for (var d = 1; d < deadlines.length; d++) {
      if (_daysBetween(currentCluster[currentCluster.length - 1], deadlines[d]) <= windowDays) {
        currentCluster.push(deadlines[d]);
      } else {
        if (currentCluster.length >= 2) clusters.push(currentCluster.slice());
        currentCluster = [deadlines[d]];
      }
    }
    if (currentCluster.length >= 2) clusters.push(currentCluster);

    return {
      clustered: clusters.length > 0,
      clusters: clusters.map(function (c) {
        return { dates: c, count: c.length };
      })
    };
  }

  /* ─── P42-P45: Mitigation Options ─── */
  /**
   * Build deterministic mitigation candidates based on health report data.
   * @param {Object} healthReport - the computed health report
   * @returns {Array<{ id, type, label, effects }>}
   */
  function buildMitigationCandidates(healthReport) {
    var options = [];
    var id = 0;

    if (!healthReport || !healthReport.summary) return options;

    var summary = healthReport.summary;

    // Option: use backup capacity (if available)
    if (summary.slackMinutes < 0) {
      var deficit = Math.abs(summary.slackMinutes);
      options.push({
        id: 'm' + (++id),
        type: 'use-backup-capacity',
        label: 'Tìm thêm ' + deficit + ' phút trống trong lịch',
        effects: { slackDeltaMinutes: deficit, affectedTaskKeys: [] }
      });
    }

    // Option: reduce scope — remove lowest-priority unscheduled task
    if (healthReport.unscheduled && healthReport.unscheduled.length > 0) {
      var removed = healthReport.unscheduled[0];
      options.push({
        id: 'm' + (++id),
        type: 'reduce-scope',
        label: 'Hoãn task "' + (removed.text || '').substring(0, 30) + '"',
        effects: { slackDeltaMinutes: removed.duration || 45, affectedTaskKeys: [removed.key] }
      });
    }

    // Option: split work — if any task has large remaining duration
    if (healthReport.tasks) {
      for (var t = 0; t < healthReport.tasks.length; t++) {
        var task = healthReport.tasks[t];
        if (task.remainingWork > 90) {
          options.push({
            id: 'm' + (++id),
            type: 'split-work',
            label: 'Chia nhỏ "' + (task.text || '').substring(0, 30) + '"',
            effects: { slackDeltaMinutes: 0, affectedTaskKeys: [task.key] }
          });
          break; // Only one split option in V1
        }
      }
    }

    // Option: replan with different constraints
    if (summary.atRiskTaskCount > 0 || summary.overloadedDayCount > 0) {
      options.push({
        id: 'm' + (++id),
        type: 'replan',
        label: 'Xếp lại lịch với phân bổ đều hơn',
        effects: { slackDeltaMinutes: 0, affectedTaskKeys: [] }
      });
    }

    return options;
  }

  /* ─── P5: Main Health Report Engine ─── */
  /**
   * Compute a complete plan health report.
   * @param {Object} input - { now, today, range, tasks, sessions, availableWindows, busyWindows, constraints }
   * @returns {Object} health report
   */
  function computePlanHealth(input) {
    input = input || {};
    var now = input.now || '';
    var today = input.today || (now ? now.split('T')[0] : '');
    var range = input.range || { start: today, end: today };
    var tasks = input.tasks || [];
    var sessions = input.sessions || [];
    var busyWindows = input.busyWindows || [];
    var constraints = input.constraints || {};

    var rangeStart = range.start || today;
    var rangeEnd = range.end || rangeStart;

    // Compute remaining work per task
    var taskHealth = [];
    var totalRemainingWork = 0;
    var taskMap = {};
    for (var t = 0; t < tasks.length; t++) {
      var task = tasks[t];
      var remaining = computeRemainingWork(task);
      taskMap[task.key] = task;
      totalRemainingWork += remaining;
      taskHealth.push({
        key: task.key,
        text: task.text || '',
        duration: task.duration || task.estimatedMinutes || 45,
        completedMinutes: task.completedMinutes || 0,
        remainingWork: remaining,
        deadline: task.deadline || null,
        completed: task.completed || false
      });
    }

    // Compute capacity
    var capacity = computeCapacity({
      fromDate: rangeStart,
      toDate: rangeEnd,
      now: now ? now.split('T')[1] || '08:00' : undefined,
      today: today,
      defaultWindowStart: constraints.windowStart || '08:00',
      defaultWindowEnd: constraints.windowEnd || '22:00',
      timeblocks: input.timeblocks || null,
      busy: busyWindows,
      unavailableWindows: constraints.unavailableWindows || [],
      breakMinutes: constraints.breakMinutes || 0
    });

    // Compute slack
    var slack = computeSlack(totalRemainingWork, capacity.total);

    // Daily utilization
    var workPerDay = {};
    for (var s = 0; s < sessions.length; s++) {
      var sess = sessions[s];
      if (!workPerDay[sess.date]) workPerDay[sess.date] = 0;
      workPerDay[sess.date] += (sess.duration || 0);
    }

    var dayReports = [];
    var overloadedDayCount = 0;
    var saturatedDayCount = 0;
    for (var d = 0; d < capacity.dates.length; d++) {
      var dayDate = capacity.dates[d];
      var dayScheduled = workPerDay[dayDate] || 0;
      var dayAvailable = capacity.perDay[dayDate] || 0;
      var dayUtil = computeDailyUtilization(dayDate, dayScheduled, dayAvailable);
      dayReports.push(dayUtil);
      if (dayUtil.overloaded) overloadedDayCount++;
      if (dayUtil.saturated) saturatedDayCount++;
    }

    // Risk per task
    for (var ri = 0; ri < taskHealth.length; ri++) {
      var th = taskHealth[ri];
      if (th.completed || th.remainingWork <= 0) {
        th.risk = RISK_SAFE;
        th.slackMinutes = null;
        th.slackRatio = null;
        th.factors = ['completed'];
        continue;
      }

      // Find deadline-relevant capacity
      var deadlineCap = capacity.total;
      if (th.deadline && ISO_DATE_RE.test(th.deadline)) {
        // Capacity only up to deadline
        var deadlineCapObj = computeCapacity({
          fromDate: rangeStart,
          toDate: th.deadline,
          now: now ? now.split('T')[1] || '08:00' : undefined,
          today: today,
          defaultWindowStart: constraints.windowStart || '08:00',
          defaultWindowEnd: constraints.windowEnd || '22:00',
          timeblocks: input.timeblocks || null,
          busy: busyWindows,
          unavailableWindows: constraints.unavailableWindows || [],
          breakMinutes: constraints.breakMinutes || 0
        });
        deadlineCap = deadlineCapObj.total;
      }

      var taskSlack = computeSlack(th.remainingWork, deadlineCap);
      var lastPlannedDate = null;
      for (var si = 0; si < sessions.length; si++) {
        if (sessions[si].taskKey === th.key) {
          if (!lastPlannedDate || sessions[si].date > lastPlannedDate) {
            lastPlannedDate = sessions[si].date;
          }
        }
      }
      var deadlineMargin = computeDeadlineMargin(today, th.deadline, lastPlannedDate);

      th.risk = classifyRisk({
        remainingWork: th.remainingWork,
        capacity: deadlineCap,
        slackMinutes: taskSlack.slackMinutes,
        slackRatio: taskSlack.slackRatio,
        feasible: taskSlack.feasible,
        hasDeadline: deadlineMargin.hasDeadline,
        deadlineMarginDays: deadlineMargin.daysUntilDeadline
      });
      th.slackMinutes = taskSlack.slackMinutes;
      th.slackRatio = taskSlack.slackRatio;
      th.feasible = taskSlack.feasible;
      th.deadlineMargin = deadlineMargin;
      th.factors = [];

      if (th.risk === RISK_INFEASIBLE) th.factors.push('insufficient-capacity');
      if (th.risk === RISK_AT_RISK) th.factors.push('low-slack');
      if (th.slackRatio < RISK_THRESHOLDS.lowSlackRatio) th.factors.push('low-slack-ratio');
      if (deadlineMargin.hasDeadline && deadlineMargin.daysUntilDeadline <= 1) th.factors.push('deadline-tomorrow');
    }

    // Concentration & fragility
    var conc = detectConcentration(sessions, capacity.dates, capacity.perDay, null);

    // Unscheduled work
    var unscheduled = findUnscheduledTasks(tasks.filter(function (t) { return !t.completed; }), sessions);

    // Deadline clusters
    var clusters = detectDeadlineClusters(tasks);

    // Warnings
    var warnings = [];
    if (slack.slackMinutes < 0) {
      warnings.push({ code: 'capacity-deficit', deficitMinutes: Math.abs(slack.slackMinutes), message: 'Thiếu thời gian: ' + Math.abs(slack.slackMinutes) + ' phút' });
    }
    if (overloadedDayCount > 0) {
      warnings.push({ code: 'overloaded-day', count: overloadedDayCount, message: overloadedDayCount + ' ngày quá tải' });
    }
    if (conc.concentration) {
      warnings.push({ code: 'work-concentration', ratio: conc.concentrationRatio, message: 'Phần lớn công việc dồn về cuối' });
    }
    if (unscheduled.length > 0) {
      warnings.push({ code: 'unscheduled-work', count: unscheduled.length, message: unscheduled.length + ' task chưa được xếp' });
    }
    if (clusters.clustered) {
      warnings.push({ code: 'deadline-cluster', clusters: clusters.clusters, message: 'Deadline tập trung' });
    }

    // Summary counts
    var atRiskCount = 0;
    var watchCount = 0;
    var safeCount = 0;
    var infeasibleCount = 0;
    for (var ci = 0; ci < taskHealth.length; ci++) {
      if (taskHealth[ci].completed) continue;
      switch (taskHealth[ci].risk) {
        case RISK_AT_RISK: atRiskCount++; break;
        case RISK_WATCH: watchCount++; break;
        case RISK_INFEASIBLE: infeasibleCount++; break;
        default: safeCount++; break;
      }
    }

    var report = {
      version: 1,
      generatedAt: now || new Date().toISOString(),
      range: { start: rangeStart, end: rangeEnd },
      summary: {
        remainingWorkMinutes: totalRemainingWork,
        remainingCapacityMinutes: capacity.total,
        slackMinutes: slack.slackMinutes,
        slackRatio: slack.slackRatio,
        atRiskTaskCount: atRiskCount,
        watchTaskCount: watchCount,
        safeTaskCount: safeCount,
        infeasibleTaskCount: infeasibleCount,
        overloadedDayCount: overloadedDayCount,
        saturatedDayCount: saturatedDayCount,
        unscheduledTaskCount: unscheduled.length,
        totalTaskCount: taskHealth.length,
        sessionCount: sessions.length
      },
      days: dayReports,
      tasks: taskHealth,
      unscheduled: unscheduled,
      concentration: conc,
      deadlineClusters: clusters,
      warnings: warnings,
      mitigationOptions: []
    };

    // P42-P45: Generate mitigation options
    report.mitigationOptions = buildMitigationCandidates(report);

    return report;
  }

  /* ─── Validation ─── */
  /**
   * Validate a health report for integrity.
   * @param {Object} report
   * @returns {{ valid: boolean, errors: Array }}
   */
  function validateHealthReport(report) {
    var errors = [];
    if (!report || report.version !== 1) {
      errors.push({ code: 'invalid-version' });
    }
    if (!report.summary) {
      errors.push({ code: 'missing-summary' });
    }
    if (!Array.isArray(report.tasks)) {
      errors.push({ code: 'missing-tasks' });
    }
    if (!Array.isArray(report.warnings)) {
      errors.push({ code: 'missing-warnings' });
    }
    return { valid: errors.length === 0, errors: errors };
  }

  /* ─── Exports ─── */
  var api = {
    RISK_THRESHOLDS: RISK_THRESHOLDS,
    RISK_SAFE: RISK_SAFE,
    RISK_WATCH: RISK_WATCH,
    RISK_AT_RISK: RISK_AT_RISK,
    RISK_INFEASIBLE: RISK_INFEASIBLE,
    computeRemainingWork: computeRemainingWork,
    computeCapacity: computeCapacity,
    computeSlack: computeSlack,
    computeDeadlineMargin: computeDeadlineMargin,
    classifyRisk: classifyRisk,
    computeDailyUtilization: computeDailyUtilization,
    detectConcentration: detectConcentration,
    findUnscheduledTasks: findUnscheduledTasks,
    detectDeadlineClusters: detectDeadlineClusters,
    buildMitigationCandidates: buildMitigationCandidates,
    computePlanHealth: computePlanHealth,
    validateHealthReport: validateHealthReport,
    _toMin: _toMin,
    _minToTime: _minToTime,
    _dateRange: _dateRange
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    g.TaskFlowAIPlanHealth = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
