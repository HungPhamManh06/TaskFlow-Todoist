/**
 * js/ai-plan-watch.js — Phase 6K: Opt-In Plan Watch + Smart Risk Alerts
 *
 * Deterministic local monitoring:
 *  - Watch snapshot model (P15-P16)
 *  - Health comparison (P17-P18)
 *  - Alert transitions (P17, P29-P32)
 *  - Deduplication (P30)
 *  - Cooldown (P31-P32)
 *  - Snooze (P34)
 *  - Quiet hours (P36-P38)
 *  - Alert history limit (P57-P58)
 *  - Browser notification support (P5-P7, P43-P46)
 *  - Settings model (P2-P5, P13-P14)
 *
 * NO Gemini calls. NO server calls. Pure local logic.
 * NO mutation of TaskFlow state.
 */
;(function (g) {
  'use strict';

  /* ─── Constants ─── */
  var WATCH_STORAGE_KEY = 'taskflow-plan-watch-v1';
  var WATCH_HISTORY_KEY = 'taskflow-plan-watch-history-v1';
  var MAX_ALERT_HISTORY = 100;
  var MAX_ALERT_HISTORY_DAYS = 30;
  var DEBOUNCE_MS = 800;

  /* ─── P31: Cooldown Constants (ms) ─── */
  var COOLDOWN = {
    watch:       12 * 60 * 60 * 1000,  // 12 hours
    'at-risk':    6 * 60 * 60 * 1000,  // 6 hours
    infeasible:   3 * 60 * 60 * 1000,  // 3 hours
    'hard-conflict': 6 * 60 * 60 * 1000, // 6 hours
    overload:     6 * 60 * 60 * 1000,  // 6 hours
    'capacity-loss': 6 * 60 * 60 * 1000, // 6 hours
    'missed-session': 3 * 60 * 60 * 1000, // 3 hours
    'urgent-unscheduled': 3 * 60 * 60 * 1000 // 3 hours
  };

  /* ─── P31: Severity-based min interval (ms) ─── */
  var SEVERITY_MIN_INTERVAL = {
    info:    24 * 60 * 60 * 1000, // 24 hours
    watch:   12 * 60 * 60 * 1000, // 12 hours
    urgent:   3 * 60 * 60 * 1000  // 3 hours
  };

  /* ─── P29: Alert Severity Mapping ─── */
  var CATEGORY_SEVERITY = {
    'risk-increase':      'watch',
    'infeasible':         'urgent',
    'hard-conflict':      'urgent',
    'overload':           'watch',
    'capacity-loss':      'watch',
    'missed-session':     'urgent',
    'urgent-unscheduled': 'watch'
  };

  /* ─── P40: Alert Categories ─── */
  var VALID_CATEGORIES = [
    'risk-increase', 'infeasible', 'hard-conflict', 'overload',
    'capacity-loss', 'missed-session', 'urgent-unscheduled'
  ];

  /* ─── P13: Default Watch Settings ─── */
  function defaultSettings() {
    return {
      version: 1,
      enabled: false,           // P2: OFF by default
      browserNotifications: false,
      showTaskDetailsInSystemNotifications: false,
      categories: {
        riskIncrease: true,
        infeasible: true,
        newConflict: true,
        overload: true,
        urgentUnscheduled: true,
        capacityLoss: true
      },
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '07:00'
      }
    };
  }

  /* ─── Default Watch State ─── */
  function defaultState() {
    return {
      version: 1,
      settings: defaultSettings(),
      lastSnapshot: null,
      alertHistory: [],
      snoozed: {},
      lastEvaluationAt: null,
      systemNotificationCount: 0,
      systemNotificationWindowStart: null
    };
  }

  /* ─── P57-P58: Alert History ─── */
  function defaultAlertHistory() {
    return [];
  }

  /* ─── Storage Helpers ─── */
  function loadWatchState() {
    try {
      var raw = localStorage.getItem(WATCH_STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return defaultState();
      // Merge with defaults for forward compatibility
      var def = defaultState();
      parsed.settings = Object.assign({}, def.settings, parsed.settings || {});
      parsed.settings.categories = Object.assign({}, def.settings.categories, (parsed.settings.categories || {}));
      parsed.settings.quietHours = Object.assign({}, def.settings.quietHours, (parsed.settings.quietHours || {}));
      parsed.alertHistory = Array.isArray(parsed.alertHistory) ? parsed.alertHistory : [];
      parsed.snoozed = parsed.snoozed && typeof parsed.snoozed === 'object' ? parsed.snoozed : {};
      return parsed;
    } catch (e) {
      return defaultState();
    }
  }

  function saveWatchState(state) {
    try {
      localStorage.setItem(WATCH_STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* silent */ }
  }

  /* ─── P15: Create Snapshot from Phase 6J Health Report ─── */
  function createWatchSnapshot(healthReport) {
    if (!healthReport || typeof healthReport !== 'object') return null;

    var tasks = {};
    if (Array.isArray(healthReport.tasks)) {
      healthReport.tasks.forEach(function (t) {
        if (t && t.taskKey) {
          tasks[t.taskKey] = {
            risk: t.risk || 'safe',
            slackMinutes: typeof t.slackMinutes === 'number' ? t.slackMinutes : 0,
            conflictCount: typeof t.conflictCount === 'number' ? t.conflictCount : 0,
            unscheduledMinutes: typeof t.unscheduledMinutes === 'number' ? t.unscheduledMinutes : 0
          };
        }
      });
    }

    var days = {};
    if (Array.isArray(healthReport.days)) {
      healthReport.days.forEach(function (d) {
        if (d && d.date) {
          days[d.date] = {
            overloaded: !!d.overloaded,
            saturated: !!d.saturated,
            utilizationRatio: typeof d.utilizationRatio === 'number' ? d.utilizationRatio : 0
          };
        }
      });
    }

    var summary = healthReport.summary || {};
    return {
      generatedAt: Date.now(),
      tasks: tasks,
      days: days,
      total: {
        slackMinutes: typeof summary.slackMinutes === 'number' ? summary.slackMinutes : 0,
        atRisk: typeof summary.atRiskTaskCount === 'number' ? summary.atRiskTaskCount : 0,
        infeasible: typeof summary.infeasibleTaskCount === 'number' ? summary.infeasibleTaskCount : 0,
        overloadedDayCount: typeof summary.overloadedDayCount === 'number' ? summary.overloadedDayCount : 0,
        unscheduledTaskCount: typeof summary.unscheduledTaskCount === 'number' ? summary.unscheduledTaskCount : 0
      }
    };
  }

  /* ─── P17: Detect Risk Transitions ─── */
  var RISK_ORDER = { safe: 0, watch: 1, 'at-risk': 2, infeasible: 3 };

  function detectRiskTransitions(prevSnapshot, currentSnapshot) {
    if (!prevSnapshot || !currentSnapshot) return [];

    var transitions = [];
    var prevTasks = prevSnapshot.tasks || {};
    var currTasks = currentSnapshot.tasks || {};

    // Check task-level transitions
    var allKeys = {};
    Object.keys(prevTasks).forEach(function (k) { allKeys[k] = true; });
    Object.keys(currTasks).forEach(function (k) { allKeys[k] = true; });

    Object.keys(allKeys).forEach(function (taskKey) {
      var prev = prevTasks[taskKey];
      var curr = currTasks[taskKey];

      var prevRisk = prev ? prev.risk : 'safe';
      var currRisk = curr ? curr.risk : 'safe';
      var prevOrder = RISK_ORDER[prevRisk] !== undefined ? RISK_ORDER[prevRisk] : 0;
      var currOrder = RISK_ORDER[currRisk] !== undefined ? RISK_ORDER[currRisk] : 0;

      if (currOrder > prevOrder) {
        transitions.push({
          category: currRisk === 'infeasible' ? 'infeasible' : 'risk-increase',
          taskKey: taskKey,
          from: prevRisk,
          to: currRisk,
          severity: currRisk === 'infeasible' ? 'urgent' : 'watch'
        });
      }
    });

    // Check day-level transitions (overload)
    var prevDays = prevSnapshot.days || {};
    var currDays = currentSnapshot.days || {};
    var allDayKeys = {};
    Object.keys(prevDays).forEach(function (k) { allDayKeys[k] = true; });
    Object.keys(currDays).forEach(function (k) { allDayKeys[k] = true; });

    Object.keys(allDayKeys).forEach(function (dateKey) {
      var prevDay = prevDays[dateKey] || {};
      var currDay = currDays[dateKey] || {};

      if (!prevDay.overloaded && currDay.overloaded) {
        transitions.push({
          category: 'overload',
          day: dateKey,
          severity: 'watch'
        });
      }
    });

    // Check global transitions
    var prevTotal = prevSnapshot.total || {};
    var currTotal = currentSnapshot.total || {};

    // Capacity loss → negative slack
    if (prevTotal.slackMinutes >= 0 && currTotal.slackMinutes < 0) {
      transitions.push({
        category: 'infeasible',
        severity: 'urgent',
        shortfallMinutes: Math.abs(currTotal.slackMinutes)
      });
    } else if (prevTotal.slackMinutes > 0 && currTotal.slackMinutes < prevTotal.slackMinutes * 0.3) {
      // Meaningful capacity loss (lost more than 70% of slack)
      transitions.push({
        category: 'capacity-loss',
        severity: 'watch'
      });
    }

    // New unscheduled work
    if (prevTotal.unscheduledTaskCount === 0 && currTotal.unscheduledTaskCount > 0) {
      transitions.push({
        category: 'urgent-unscheduled',
        severity: 'watch',
        count: currTotal.unscheduledTaskCount
      });
    }

    // New overload day count
    if ((prevTotal.overloadedDayCount || 0) < (currTotal.overloadedDayCount || 0)) {
      var alreadyOverload = transitions.some(function (t) { return t.category === 'overload'; });
      if (!alreadyOverload) {
        transitions.push({
          category: 'overload',
          severity: 'watch'
        });
      }
    }

    return transitions;
  }

  /* ─── P29: Build Alert Fingerprint ─── */
  function buildFingerprint(transition) {
    var parts = [transition.category];
    if (transition.taskKey) parts.push(transition.taskKey);
    if (transition.day) parts.push(transition.day);
    if (transition.to) parts.push(transition.to);
    return parts.join(':');
  }

  /* ─── P30: Deduplication ─── */
  function isDuplicate(fingerprint, alertHistory, now) {
    if (!Array.isArray(alertHistory)) return false;
    for (var i = 0; i < alertHistory.length; i++) {
      var alert = alertHistory[i];
      if (alert && alert.fingerprint === fingerprint && !alert.resolved) {
        return true;
      }
    }
    return false;
  }

  /* ─── P31-P32: Cooldown Check ─── */
  function isOnCooldown(fingerprint, alertHistory, now) {
    if (!Array.isArray(alertHistory)) return false;
    var category = fingerprint.split(':')[0] || 'watch';
    var cooldownMs = COOLDOWN[category] || COOLDOWN.watch;

    for (var i = 0; i < alertHistory.length; i++) {
      var alert = alertHistory[i];
      if (alert && alert.fingerprint === fingerprint && !alert.resolved) {
        if (now - alert.createdAt < cooldownMs) return true;
      }
    }
    return false;
  }

  /* ─── P31: Severity worsening overrides cooldown (P32) ─── */
  function isSeverityWorsening(fingerprint, currentSeverity, alertHistory) {
    if (!Array.isArray(alertHistory)) return false;
    var currentOrder = RISK_ORDER[currentSeverity] !== undefined ? RISK_ORDER[currentSeverity] : 0;

    for (var i = 0; i < alertHistory.length; i++) {
      var alert = alertHistory[i];
      if (alert && alert.fingerprint === fingerprint && !alert.resolved) {
        var prevSeverity = CATEGORY_SEVERITY[alert.category] || 'watch';
        var prevOrder = RISK_ORDER[prevSeverity] !== undefined ? RISK_ORDER[prevSeverity] : 0;
        return currentOrder > prevOrder;
      }
    }
    return false;
  }

  /* ─── P34: Snooze Check ─── */
  function isSnoozed(alertId, snoozed, now) {
    if (!snoozed || typeof snoozed !== 'object') return false;
    var until = snoozed[alertId];
    if (typeof until !== 'number') return false;
    return now < until;
  }

  /* ─── P36-P38: Quiet Hours ─── */
  function isQuietHours(quietHours, now) {
    if (!quietHours || !quietHours.enabled) return false;
    var start = parseTimeMinutes(quietHours.start || '22:00');
    var end = parseTimeMinutes(quietHours.end || '07:00');
    if (start === null || end === null) return false;

    var currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Handle cross-midnight (e.g., 22:00 → 07:00)
    if (start > end) {
      return currentMinutes >= start || currentMinutes < end;
    }
    return currentMinutes >= start && currentMinutes < end;
  }

  function parseTimeMinutes(timeStr) {
    if (typeof timeStr !== 'string') return null;
    var m = /^(\d{2}):(\d{2})$/.exec(timeStr);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  /* ─── P66: System Notification Throttle ─── */
  function canSendSystemNotification(state, now) {
    var MAX_PER_HOUR = 3;

    // Initialize or reset window
    if (!state.systemNotificationWindowStart || now - state.systemNotificationWindowStart > 60 * 60 * 1000) {
      state.systemNotificationWindowStart = now;
      state.systemNotificationCount = 0;
    }

    return state.systemNotificationCount < MAX_PER_HOUR;
  }

  function recordSystemNotification(state, now) {
    if (!state.systemNotificationWindowStart || now - state.systemNotificationWindowStart > 60 * 60 * 1000) {
      state.systemNotificationWindowStart = now;
      state.systemNotificationCount = 0;
    }
    state.systemNotificationCount++;
  }

  /* ─── P67: Summary Fallback ─── */
  function shouldUseSummaryFallback(alertCandidates) {
    if (!Array.isArray(alertCandidates)) return false;
    var urgentCount = alertCandidates.filter(function (a) {
      return a && a.severity === 'urgent';
    }).length;
    return urgentCount >= 4;
  }

  /* ─── Build Alert Object ─── */
  function buildAlert(transition, state, now) {
    var fingerprint = buildFingerprint(transition);
    var severity = transition.severity || CATEGORY_SEVERITY[transition.category] || 'watch';
    var category = transition.category || 'risk-increase';
    var alertId = 'alert-' + now + '-' + Math.random().toString(36).slice(2, 8);

    return {
      id: alertId,
      fingerprint: fingerprint,
      category: category,
      severity: severity,
      createdAt: now,
      title: null,  // filled by i18n-aware renderer
      body: null,   // filled by i18n-aware renderer
      taskKey: transition.taskKey || null,
      day: transition.day || null,
      resolved: false,
      action: category === 'missed-session' ? 'open-recovery' : 'open-health'
    };
  }

  /* ─── Should Notify? ─── */
  function shouldNotify(alert, state, now) {
    // Always false if disabled
    if (!state.settings || !state.settings.enabled) return false;

    // Check category
    var categoryKey = alert.category;
    if (categoryKey === 'risk-increase' && !state.settings.categories.riskIncrease) return false;
    if (categoryKey === 'infeasible' && !state.settings.categories.infeasible) return false;
    if (categoryKey === 'hard-conflict' && !state.settings.categories.newConflict) return false;
    if (categoryKey === 'overload' && !state.settings.categories.overload) return false;
    if (categoryKey === 'urgent-unscheduled' && !state.settings.categories.urgentUnscheduled) return false;
    if (categoryKey === 'capacity-loss' && !state.settings.categories.capacityLoss) return false;
    if (categoryKey === 'missed-session' && !state.settings.categories.newConflict) return false;

    // Check snooze
    if (isSnoozed(alert.id, state.snoozed, now)) return false;

    // Check quiet hours (only for system notifications)
    if (state.settings.browserNotifications && isQuietHours(state.settings.quietHours, new Date(now))) {
      return false; // suppress system notification, but in-app still shown
    }

    // Check system notification throttle
    if (state.settings.browserNotifications && !canSendSystemNotification(state, now)) {
      return false;
    }

    return true;
  }

  /* ─── Compare Snapshots + Generate Alert Candidates ─── */
  function compareWatchSnapshots(prevSnapshot, currentSnapshot, state, now) {
    now = now || Date.now();
    var transitions = detectRiskTransitions(prevSnapshot, currentSnapshot);
    var candidates = [];
    var seenFingerprints = {};

    transitions.forEach(function (transition) {
      var fp = buildFingerprint(transition);

      // Skip duplicates
      if (seenFingerprints[fp]) return;
      seenFingerprints[fp] = true;

      // Check dedup + cooldown
      if (isDuplicate(fp, state.alertHistory, now)) {
        // P32: severity worsening overrides
        var severity = transition.severity || 'watch';
        if (!isSeverityWorsening(fp, severity, state.alertHistory)) return;
      }
      if (isOnCooldown(fp, state.alertHistory, now)) return;

      var alert = buildAlert(transition, state, now);
      candidates.push(alert);
    });

    return candidates;
  }

  /* ─── P34-P35: Snooze / Dismiss ─── */
  function snoozeAlert(alertId, durationMs, state) {
    if (!state.snoozed) state.snoozed = {};
    state.snoozed[alertId] = Date.now() + durationMs;
    saveWatchState(state);
  }

  function dismissAlert(alertId, state) {
    // Mark resolved in history
    if (Array.isArray(state.alertHistory)) {
      state.alertHistory.forEach(function (a) {
        if (a && a.id === alertId) a.resolved = true;
      });
    }
    saveWatchState(state);
  }

  function resolveAlertByFingerprint(fingerprint, state) {
    if (Array.isArray(state.alertHistory)) {
      state.alertHistory.forEach(function (a) {
        if (a && a.fingerprint === fingerprint && !a.resolved) {
          a.resolved = true;
        }
      });
    }
  }

  /* ─── P57-P58: Prune Alert History ─── */
  function pruneAlertHistory(alertHistory, now) {
    if (!Array.isArray(alertHistory)) return [];
    var cutoff = now - MAX_ALERT_HISTORY_DAYS * 24 * 60 * 60 * 1000;
    var pruned = alertHistory.filter(function (a) {
      return a && typeof a.createdAt === 'number' && a.createdAt > cutoff;
    });
    // Keep at most MAX_ALERT_HISTORY
    if (pruned.length > MAX_ALERT_HISTORY) {
      pruned = pruned.slice(pruned.length - MAX_ALERT_HISTORY);
    }
    return pruned;
  }

  /* ─── P76: Reset Watch State (keep settings) ─── */
  function resetWatchData(state) {
    state.lastSnapshot = null;
    state.alertHistory = [];
    state.snoozed = {};
    state.lastEvaluationAt = null;
    state.systemNotificationCount = 0;
    state.systemNotificationWindowStart = null;
    saveWatchState(state);
  }

  /* ─── P55: Deterministic Settings Intent ─── */
  function classifyWatchSettingsIntent(message) {
    if (typeof message !== 'string') return null;
    var s = message.toLowerCase().trim();

    // Enable/disable plan watch
    if (/(?:bật|enable|turn\s+on|on|kích\s+hoạt|theo\s+dõi).*(?:plan\s*watch|kế\s*hoạch|cảnh\s+báo|watch)/i.test(s))
      return { kind: 'enable-watch' };

    // Snooze (check before disable — 'tạm ẩn' contains 'ẩn' which also matches disable)
    if (/(?:tạm\s+ẩn|snooze|ẩn).*(?:cảnh\s+báo|alert|hôm\s+nay|đến\s+mai)/i.test(s))
      return { kind: 'snooze-alert' };

    if (/(?:tắt|disable|turn\s+off|off).*(?:plan\s*watch|kế\s*hoạch|cảnh\s+báo|watch)/i.test(s))
      return { kind: 'disable-watch' };

    // Reset
    if (/(?:đặt\s+lại|reset|xóa\s+lịch\s+sử).*(?:cảnh\s+báo|alert|watch)/i.test(s))
      return { kind: 'reset-watch' };

    // Check now
    if (/(?:kiểm\s+tra\s+ngay|check\s+now|xem\s+ngay)/i.test(s))
      return { kind: 'check-now' };

    return null;
  }

  /* ─── Render Helpers (for UI integration) ─── */
  function alertTitleKey(alert) {
    if (!alert) return 'planWatchNeedsAttention';
    switch (alert.category) {
      case 'risk-increase': return 'planWatchRiskIncrease';
      case 'infeasible': return 'planWatchInsufficientCapacity';
      case 'hard-conflict': return 'planWatchNewConflict';
      case 'overload': return 'planWatchOverloadedDay';
      case 'capacity-loss': return 'planWatchCapacityLoss';
      case 'missed-session': return 'planWatchMissedSession';
      case 'urgent-unscheduled': return 'planWatchUnscheduledTask';
      default: return 'planWatchNeedsAttention';
    }
  }

  function alertBodyKey(alert) {
    if (!alert) return 'planWatchNeedsAttention';
    switch (alert.category) {
      case 'risk-increase': return 'planWatchRiskIncreasedBody';
      case 'infeasible': return 'planWatchInsufficientBody';
      case 'hard-conflict': return 'planWatchConflictBody';
      case 'overload': return 'planWatchOverloadBody';
      case 'capacity-loss': return 'planWatchCapacityLossBody';
      case 'missed-session': return 'planWatchMissedBody';
      case 'urgent-unscheduled': return 'planWatchUnscheduledBody';
      default: return 'planWatchNeedsAttention';
    }
  }

  function alertActionLabel(alert) {
    if (!alert) return 'planWatchViewDetails';
    if (alert.action === 'open-recovery') return 'planWatchViewRecovery';
    return 'planWatchViewDetails';
  }

  /* ─── Exports ─── */
  var api = {
    WATCH_STORAGE_KEY: WATCH_STORAGE_KEY,
    DEFAULT_DEBOUNCE_MS: DEBOUNCE_MS,
    COOLDOWN: COOLDOWN,
    SEVERITY_MIN_INTERVAL: SEVERITY_MIN_INTERVAL,
    CATEGORY_SEVERITY: CATEGORY_SEVERITY,
    VALID_CATEGORIES: VALID_CATEGORIES,
    MAX_ALERT_HISTORY: MAX_ALERT_HISTORY,

    defaultSettings: defaultSettings,
    defaultState: defaultState,
    loadWatchState: loadWatchState,
    saveWatchState: saveWatchState,

    createWatchSnapshot: createWatchSnapshot,
    detectRiskTransitions: detectRiskTransitions,
    buildFingerprint: buildFingerprint,
    buildAlert: buildAlert,
    isDuplicate: isDuplicate,
    isOnCooldown: isOnCooldown,
    isSeverityWorsening: isSeverityWorsening,
    isSnoozed: isSnoozed,
    isQuietHours: isQuietHours,
    canSendSystemNotification: canSendSystemNotification,
    recordSystemNotification: recordSystemNotification,
    shouldUseSummaryFallback: shouldUseSummaryFallback,

    compareWatchSnapshots: compareWatchSnapshots,
    shouldNotify: shouldNotify,

    snoozeAlert: snoozeAlert,
    dismissAlert: dismissAlert,
    resolveAlertByFingerprint: resolveAlertByFingerprint,
    pruneAlertHistory: pruneAlertHistory,
    resetWatchData: resetWatchData,

    classifyWatchSettingsIntent: classifyWatchSettingsIntent,

    alertTitleKey: alertTitleKey,
    alertBodyKey: alertBodyKey,
    alertActionLabel: alertActionLabel,

    parseTimeMinutes: parseTimeMinutes,
    RISK_ORDER: RISK_ORDER
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    g.TaskFlowAIPlanWatch = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
