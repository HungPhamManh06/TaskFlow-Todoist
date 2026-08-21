/**
 * js/ai-brief.js — Phase 6L: Daily Focus Brief + Weekly Review
 *
 * Deterministic summary engine:
 *  - Daily Brief model (P5)
 *  - Weekly Review model (P6)
 *  - Focus ranking (P8-P10)
 *  - Deadline collection (P18)
 *  - Health risk integration (P15)
 *  - Plan Watch alert integration (P16)
 *  - Plan status integration (P20-P21)
 *  - Pending review surfacing (P22)
 *  - Stale fingerprint (P49)
 *  - Brief intent router (P32-P35)
 *
 * NO Gemini calls. NO server calls. Pure local logic.
 * NO mutation of TaskFlow state.
 */
;(function (g) {
  'use strict';

  var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  /* ─── P9: Focus Ranking Priority Weights ─── */
  var FOCUS_PRIORITY = {
    OVERDUE:            100,
    DUE_TODAY:           90,
    INFEASIBLE:          85,
    AT_RISK:             75,
    HIGH_PRIORITY:       60,
    SCHEDULED_SOON:      50,
    LOW_SLACK:           40,
    WATCH:               30,
    NORMAL:              10
  };

  /* ─── P8: Display Limits ─── */
  var MAX_FOCUS = 3;
  var MAX_DEADLINES = 3;
  var MAX_RISKS = 3;
  var MAX_ALERTS = 3;

  /* ─── P5: Build Daily Brief ─── */
  function buildDailyBrief(opts) {
    if (!opts || typeof opts !== 'object') return null;

    var today = opts.today || _todayStr();
    var tasks = Array.isArray(opts.tasks) ? opts.tasks : [];
    var timeblocks = Array.isArray(opts.timeblocks) ? opts.timeblocks : [];
    var busyWindows = Array.isArray(opts.busyWindows) ? opts.busyWindows : [];
    var healthReport = opts.healthReport || null;
    var watchAlerts = Array.isArray(opts.watchAlerts) ? opts.watchAlerts : [];
    var planPreview = opts.planPreview || null;
    var recoveryPreview = opts.recoveryPreview || null;
    var pendingReview = opts.pendingReview || null;
    var availableWindows = Array.isArray(opts.availableWindows) ? opts.availableWindows : [];

    /* ── Due / Overdue ── */
    var dueToday = [];
    var overdue = [];
    tasks.forEach(function (tk) {
      if (!tk || tk.done) return;
      if (tk.deadline && ISO_DATE_RE.test(tk.deadline)) {
        if (tk.deadline === today) dueToday.push(tk);
        else if (tk.deadline < today) overdue.push(tk);
      }
    });

    /* ── Scheduled today ── */
    var todayBlocks = timeblocks.filter(function (b) {
      return b && b.date === today && b.status !== 'cancelled';
    });
    var scheduledMinutes = todayBlocks.reduce(function (sum, b) {
      return sum + _blockMinutes(b);
    }, 0);

    /* ── Free capacity ── */
    var freeCapacityMinutes = 0;
    if (availableWindows.length > 0) {
      freeCapacityMinutes = availableWindows.reduce(function (sum, w) {
        return sum + (typeof w.minutes === 'number' ? w.minutes : 0);
      }, 0);
    }

    /* ── Risk counts ── */
    var atRiskTasks = 0;
    if (healthReport && Array.isArray(healthReport.tasks)) {
      healthReport.tasks.forEach(function (t) {
        if (t && (t.risk === 'at-risk' || t.risk === 'infeasible')) atRiskTasks++;
      });
    }

    /* ── Focus ranking ── */
    var focus = rankFocusItems(tasks, {
      today: today,
      healthReport: healthReport,
      timeblocks: timeblocks,
      maxItems: MAX_FOCUS
    });

    /* ── Deadlines ── */
    var deadlines = collectDeadlineItems(tasks, today, MAX_DEADLINES);

    /* ── Risks ── */
    var risks = [];
    if (healthReport && Array.isArray(healthReport.tasks)) {
      healthReport.tasks.forEach(function (t) {
        if (t && (t.risk === 'at-risk' || t.risk === 'infeasible')) {
          risks.push({
            taskKey: t.taskKey,
            text: t.text || t.taskKey,
            risk: t.risk,
            slackMinutes: typeof t.slackMinutes === 'number' ? t.slackMinutes : null
          });
        }
      });
      risks = risks.slice(0, MAX_RISKS);
    }

    /* ── Alerts ── */
    var alerts = watchAlerts.slice(0, MAX_ALERTS).map(function (a) {
      return {
        category: a.category || 'risk-increase',
        severity: a.severity || 'watch',
        taskKey: a.taskKey || null,
        titleKey: a.titleKey || null,
        bodyKey: a.bodyKey || null
      };
    });

    /* ── Schedule ── */
    var schedule = todayBlocks.map(function (b) {
      return {
        taskUid: b.taskUid || null,
        start: b.start || '',
        end: b.end || '',
        minutes: _blockMinutes(b)
      };
    }).sort(function (a, b) { return (a.start || '').localeCompare(b.start || ''); });

    /* ── Summary ── */
    var summary = {
      dueToday: dueToday.length,
      overdue: overdue.length,
      scheduledMinutes: scheduledMinutes,
      freeCapacityMinutes: freeCapacityMinutes,
      atRiskTasks: atRiskTasks,
      activeAlerts: watchAlerts.length
    };

    /* ── Suggestions (CTAs) ── */
    var suggestions = buildBriefSuggestions(summary, planPreview, recoveryPreview, pendingReview);

    var brief = {
      version: 1,
      type: 'daily',
      date: today,
      generatedAt: Date.now(),
      summary: summary,
      focus: focus,
      deadlines: deadlines,
      schedule: schedule,
      risks: risks,
      alerts: alerts,
      suggestions: suggestions,
      pendingPlan: !!planPreview,
      pendingRecovery: !!recoveryPreview,
      pendingReview: !!pendingReview
    };

    brief.fingerprint = createBriefFingerprint(brief);
    return brief;
  }

  /* ─── P6: Build Weekly Review ─── */
  function buildWeeklyReview(opts) {
    if (!opts || typeof opts !== 'object') return null;

    var range = opts.range || { start: '', end: '' };
    var tasks = Array.isArray(opts.tasks) ? opts.tasks : [];
    var timeblocks = Array.isArray(opts.timeblocks) ? opts.timeblocks : [];
    var healthReport = opts.healthReport || null;
    var watchAlerts = Array.isArray(opts.watchAlerts) ? opts.watchAlerts : [];

    /* ── Completed (only if doneAt is available) ── */
    var completed = [];
    var unfinished = [];
    tasks.forEach(function (tk) {
      if (!tk) return;
      if (tk.done) {
        /* P26: Only count if doneAt exists and falls within range */
        if (tk.doneAt && typeof tk.doneAt === 'string' && tk.doneAt >= range.start && tk.doneAt <= range.end) {
          completed.push({ text: tk.text || '', doneAt: tk.doneAt });
        } else if (tk.done) {
          /* done but no verifiable date — count as completed but note uncertainty */
          completed.push({ text: tk.text || '', doneAt: null });
        }
      } else {
        unfinished.push({
          text: tk.text || '',
          deadline: tk.deadline || null,
          duration: typeof tk.duration === 'number' ? tk.duration : null
        });
      }
    });

    /* ── Deadlines in range ── */
    var deadlines = [];
    tasks.forEach(function (tk) {
      if (!tk || tk.done) return;
      if (tk.deadline && ISO_DATE_RE.test(tk.deadline) && tk.deadline >= range.start && tk.deadline <= range.end) {
        deadlines.push({ text: tk.text || '', deadline: tk.deadline });
      }
    });
    deadlines.sort(function (a, b) { return a.deadline.localeCompare(b.deadline); });

    /* ── Completed TimeBlock sessions in range ── */
    var completedSessions = timeblocks.filter(function (b) {
      return b && b.status === 'completed' && b.date >= range.start && b.date <= range.end;
    }).length;

    /* ── Plan health summary ── */
    var planHealth = null;
    if (healthReport && healthReport.summary) {
      planHealth = {
        remainingWorkMinutes: healthReport.summary.remainingWorkMinutes || 0,
        remainingCapacityMinutes: healthReport.summary.remainingCapacityMinutes || 0,
        slackMinutes: healthReport.summary.slackMinutes || 0,
        atRiskTaskCount: healthReport.summary.atRiskTaskCount || 0,
        infeasibleTaskCount: healthReport.summary.infeasibleTaskCount || 0
      };
    }

    /* ── Alerts ── */
    var alerts = watchAlerts.slice(0, MAX_ALERTS).map(function (a) {
      return {
        category: a.category || 'risk-increase',
        severity: a.severity || 'watch',
        taskKey: a.taskKey || null
      };
    });

    /* ── Next week risks (from health report) ── */
    var nextWeekRisks = [];
    if (healthReport && Array.isArray(healthReport.tasks)) {
      healthReport.tasks.forEach(function (t) {
        if (t && (t.risk === 'at-risk' || t.risk === 'infeasible')) {
          nextWeekRisks.push({ taskKey: t.taskKey, risk: t.risk });
        }
      });
    }

    /* ── Facts ── */
    var facts = {
      totalTasks: tasks.length,
      completedCount: completed.length,
      unfinishedCount: unfinished.length,
      deadlineCount: deadlines.length,
      completedSessions: completedSessions,
      hasDoneAtTimestamps: completed.some(function (c) { return !!c.doneAt; })
    };

    var review = {
      version: 1,
      type: 'weekly',
      range: range,
      generatedAt: Date.now(),
      facts: facts,
      completed: completed,
      unfinished: unfinished,
      deadlines: deadlines,
      planHealth: planHealth,
      alerts: alerts,
      nextWeekRisks: nextWeekRisks,
      suggestedNextSteps: []
    };

    review.fingerprint = createBriefFingerprint(review);
    return review;
  }

  /* ─── P8-P10: Focus Ranking ─── */
  function rankFocusItems(tasks, opts) {
    if (!Array.isArray(tasks)) return [];
    var today = (opts && opts.today) || _todayStr();
    var healthReport = (opts && opts.healthReport) || null;
    var timeblocks = (opts && opts.timeblocks) || [];
    var maxItems = (opts && opts.maxItems) || MAX_FOCUS;

    /* Build risk map from health report */
    var riskMap = {};
    if (healthReport && Array.isArray(healthReport.tasks)) {
      healthReport.tasks.forEach(function (t) {
        if (t && t.taskKey) riskMap[t.taskKey] = t.risk || 'safe';
      });
    }

    /* Build today's schedule map */
    var scheduledToday = {};
    timeblocks.forEach(function (b) {
      if (b && b.date === today && b.status !== 'cancelled' && b.taskUid) {
        scheduledToday[b.taskUid] = b.start || '';
      }
    });

    var scored = [];
    tasks.forEach(function (tk) {
      if (!tk || tk.done) return;
      var score = FOCUS_PRIORITY.NORMAL;
      var reasons = [];

      /* Overdue */
      if (tk.deadline && ISO_DATE_RE.test(tk.deadline) && tk.deadline < today) {
        score = Math.max(score, FOCUS_PRIORITY.OVERDUE);
        reasons.push('deadline-past');
      }
      /* Due today */
      else if (tk.deadline === today) {
        score = Math.max(score, FOCUS_PRIORITY.DUE_TODAY);
        reasons.push('deadline-today');
      }

      /* Risk from Phase 6J */
      var risk = riskMap[tk.uid] || riskMap[tk.id] || null;
      if (risk === 'infeasible') {
        score = Math.max(score, FOCUS_PRIORITY.INFEASIBLE);
        reasons.push('risk-infeasible');
      } else if (risk === 'at-risk') {
        score = Math.max(score, FOCUS_PRIORITY.AT_RISK);
        reasons.push('risk-at-risk');
      } else if (risk === 'watch') {
        score = Math.max(score, FOCUS_PRIORITY.WATCH);
        reasons.push('risk-watch');
      }

      /* High priority */
      if (tk.kind === 'priority' || tk.priority === 1) {
        score = Math.max(score, FOCUS_PRIORITY.HIGH_PRIORITY);
        reasons.push('priority-high');
      }

      /* Scheduled soon today */
      if (scheduledToday[tk.uid] || scheduledToday[tk.id]) {
        score = Math.max(score, FOCUS_PRIORITY.SCHEDULED_SOON);
        reasons.push('scheduled-today:' + (scheduledToday[tk.uid] || scheduledToday[tk.id]));
      }

      /* Low slack — upcoming deadline with tight margin */
      if (tk.deadline && ISO_DATE_RE.test(tk.deadline) && tk.deadline > today && risk !== 'infeasible' && risk !== 'at-risk') {
        var daysUntil = Math.ceil((new Date(tk.deadline + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
        if (daysUntil <= 2) {
          score = Math.max(score, FOCUS_PRIORITY.LOW_SLACK);
          reasons.push('deadline-' + daysUntil + 'd');
        }
      }

      scored.push({
        uid: tk.uid || tk.id || '',
        text: tk.text || '',
        score: score,
        reasons: reasons
      });
    });

    /* Sort by score descending, then by deadline ascending */
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return 0;
    });

    return scored.slice(0, maxItems);
  }

  /* ─── P18: Deadline Collection ─── */
  function collectDeadlineItems(tasks, today, maxItems) {
    if (!Array.isArray(tasks)) return [];
    maxItems = maxItems || MAX_DEADLINES;

    var items = [];
    tasks.forEach(function (tk) {
      if (!tk || tk.done || !tk.deadline || !ISO_DATE_RE.test(tk.deadline)) return;
      items.push({
        uid: tk.uid || tk.id || '',
        text: tk.text || '',
        deadline: tk.deadline,
        overdue: tk.deadline < today,
        daysUntil: Math.ceil((new Date(tk.deadline + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000)
      });
    });

    /* Sort: overdue first, then by date */
    items.sort(function (a, b) {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return a.deadline.localeCompare(b.deadline);
    });

    return items.slice(0, maxItems);
  }

  /* ─── P76: Brief Suggestions (CTAs) ─── */
  function buildBriefSuggestions(summary, planPreview, recoveryPreview, pendingReview) {
    var suggestions = [];

    if (summary.overdue > 0 || summary.atRiskTasks > 0) {
      suggestions.push({ labelKey: 'briefAddressRisk', action: 'open-health' });
    }

    if (recoveryPreview) {
      suggestions.push({ labelKey: 'briefViewRecovery', action: 'open-recovery' });
    }

    if (planPreview) {
      suggestions.push({ labelKey: 'briefViewPlan', action: 'open-plan' });
    }

    if (pendingReview) {
      suggestions.push({ labelKey: 'briefViewProposal', action: 'open-review' });
    }

    suggestions.push({ labelKey: 'briefPlanToday', action: 'start-plan-preview' });
    suggestions.push({ labelKey: 'briefStartDay', action: 'open-today' });

    return suggestions;
  }

  /* ─── P49: Brief Fingerprint ─── */
  function createBriefFingerprint(brief) {
    if (!brief) return '';
    var parts = [];
    if (brief.type === 'daily') {
      parts.push('d:' + (brief.date || ''));
      var s = brief.summary || {};
      parts.push('dt:' + (s.dueToday || 0));
      parts.push('od:' + (s.overdue || 0));
      parts.push('sm:' + (s.scheduledMinutes || 0));
      parts.push('fc:' + (s.freeCapacityMinutes || 0));
      parts.push('ar:' + (s.atRiskTasks || 0));
      parts.push('al:' + (s.activeAlerts || 0));
    } else if (brief.type === 'weekly') {
      var r = brief.range || {};
      parts.push('w:' + (r.start || '') + '-' + (r.end || ''));
      var f = brief.facts || {};
      parts.push('cc:' + (f.completedCount || 0));
      parts.push('uc:' + (f.unfinishedCount || 0));
      parts.push('dc:' + (f.deadlineCount || 0));
    }
    return parts.join('|');
  }

  /* ─── P32-P35: Brief Intent Router ─── */
  function classifyBriefIntent(message) {
    if (typeof message !== 'string') return null;
    var s = message.toLowerCase().trim();

    /* Daily brief */
    if (/(?:hôm\s+nay|today|daily|tổng\s+quan.*hôm|ngày\s+hôm\s+nay)/i.test(s) &&
        /(?:cần|làm|gì|focus|tập\s+trung|brief|tóm\s+tắt|thế\s+nào)/i.test(s))
      return { kind: 'daily-brief', confidence: 'high', reason: 'daily-keyword' };
    if (/(?:tôi\s+cần\s+(?:làm|tập\s+trung)|what\s+should\s+i\s+(?:focus|do)|cho\s+ tôi\s+daily)/i.test(s))
      return { kind: 'daily-brief', confidence: 'high', reason: 'daily-focus' };
    if (/^(?:tóm\s+tắt|summary|brief)\s*(?:hôm\s+nay|today)?$/i.test(s))
      return { kind: 'daily-brief', confidence: 'medium', reason: 'daily-summary' };

    /* Weekly review */
    if (/(?:tuần|week|tổng\s+kết|review).*?(?:này|this|vừa\s+rồi|last)/i.test(s))
      return { kind: 'weekly-review', confidence: 'high', reason: 'weekly-keyword' };
    if (/(?:tuần\s+này|tuần\s+vừa\s+rồi|this\s+week|last\s+week).*(?:thế\s+nào|như\s+thế\s+nào|how|review|tổng)/i.test(s))
      return { kind: 'weekly-review', confidence: 'high', reason: 'weekly-phrase' };
    if (/^(?:review|tổng\s+kết)\s*(?:tuần|week)?$/i.test(s))
      return { kind: 'weekly-review', confidence: 'medium', reason: 'weekly-short' };

    /* Lookahead */
    if (/(?:ngày\s+mai|tomorrow|tuần\s+ tới|next\s+week).*(?:cần|chú\s+ý|quan\s+trọng|important|gì)/i.test(s))
      return { kind: 'lookahead', confidence: 'high', reason: 'lookahead-keyword' };

    /* Focus question (subset of daily) */
    if (/(?:ưu\s+tiên|priority|quan\s+trọng|important|nên\s+làm\s+gì)/i.test(s) &&
        /(?:ngày\s+hôm\s+nay|today|hôm\s+nay)/i.test(s))
      return { kind: 'focus-question', confidence: 'high', reason: 'focus-question' };

    return null;
  }

  /* ─── Helpers ─── */
  function _todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function _blockMinutes(b) {
    if (!b || !b.start || !b.end) return 0;
    var sm = _toMin(b.start);
    var em = _toMin(b.end);
    if (sm === null || em === null) return 0;
    return Math.max(0, em - sm);
  }

  function _toMin(t) {
    if (typeof t !== 'string') return null;
    var m = /^(\d{2}):(\d{2})$/.exec(t);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  /* ─── Validate Brief ─── */
  function validateBrief(brief) {
    var errors = [];
    if (!brief || typeof brief !== 'object') return { valid: false, errors: [{ code: 'not-object' }] };

    if (!brief.version) errors.push({ code: 'missing-version' });
    if (brief.type !== 'daily' && brief.type !== 'weekly') errors.push({ code: 'invalid-type' });
    if (!brief.generatedAt) errors.push({ code: 'missing-generatedAt' });

    if (brief.type === 'daily') {
      if (!brief.date) errors.push({ code: 'missing-date' });
      if (!brief.summary || typeof brief.summary !== 'object') errors.push({ code: 'missing-summary' });
      if (!Array.isArray(brief.focus)) errors.push({ code: 'missing-focus' });
      if (!Array.isArray(brief.deadlines)) errors.push({ code: 'missing-deadlines' });
      if (!Array.isArray(brief.schedule)) errors.push({ code: 'missing-schedule' });
      if (!Array.isArray(brief.risks)) errors.push({ code: 'missing-risks' });
      if (!Array.isArray(brief.alerts)) errors.push({ code: 'missing-alerts' });
    }

    if (brief.type === 'weekly') {
      if (!brief.range || !brief.range.start || !brief.range.end) errors.push({ code: 'missing-range' });
      if (!brief.facts || typeof brief.facts !== 'object') errors.push({ code: 'missing-facts' });
    }

    return { valid: errors.length === 0, errors: errors };
  }

  /* ─── Sanitize for AI Summary (P40) ─── */
  function sanitizeForAI(brief) {
    if (!brief || typeof brief !== 'object') return null;

    if (brief.type === 'daily') {
      return {
        type: 'daily',
        date: brief.date,
        dueToday: brief.summary ? brief.summary.dueToday : 0,
        overdue: brief.summary ? brief.summary.overdue : 0,
        freeCapacity: brief.summary ? brief.summary.freeCapacityMinutes : 0,
        scheduledMinutes: brief.summary ? brief.summary.scheduledMinutes : 0,
        riskCodes: (brief.risks || []).map(function (r) { return r.risk; }),
        focusLabels: (brief.focus || []).map(function (f) { return f.text || ''; }).slice(0, 5),
        alertCount: (brief.alerts || []).length
      };
    }

    if (brief.type === 'weekly') {
      return {
        type: 'weekly',
        range: brief.range,
        completedCount: brief.facts ? brief.facts.completedCount : 0,
        unfinishedCount: brief.facts ? brief.facts.unfinishedCount : 0,
        deadlineCount: brief.facts ? brief.facts.deadlineCount : 0,
        slackMinutes: brief.planHealth ? brief.planHealth.slackMinutes : 0,
        riskCodes: (brief.nextWeekRisks || []).map(function (r) { return r.risk; }),
        unfinishedLabels: (brief.unfinished || []).map(function (u) { return u.text || ''; }).slice(0, 8)
      };
    }

    return null;
  }

  /* ─── Exports ─── */
  var api = {
    MAX_FOCUS: MAX_FOCUS,
    MAX_DEADLINES: MAX_DEADLINES,
    MAX_RISKS: MAX_RISKS,
    MAX_ALERTS: MAX_ALERTS,
    FOCUS_PRIORITY: FOCUS_PRIORITY,

    buildDailyBrief: buildDailyBrief,
    buildWeeklyReview: buildWeeklyReview,
    rankFocusItems: rankFocusItems,
    collectDeadlineItems: collectDeadlineItems,
    buildBriefSuggestions: buildBriefSuggestions,
    createBriefFingerprint: createBriefFingerprint,
    classifyBriefIntent: classifyBriefIntent,
    validateBrief: validateBrief,
    sanitizeForAI: sanitizeForAI,
    _todayStr: _todayStr,
    _toMin: _toMin,
    _blockMinutes: _blockMinutes
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    g.TaskFlowAIBrief = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
