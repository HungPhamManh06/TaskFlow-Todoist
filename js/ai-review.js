'use strict';
/**
 * Phase 6T.1 — AI Proposal Review Model
 *
 * Deterministic, no LLM calls, no mutations, no localStorage.
 * Builds a review surface from a validated proposal + canonical state.
 * Same inputs → same output.
 */
(function (g) {
  var UMD_NAME = 'TaskFlowAIReview';

  /* ---- Date/time helpers ---- */
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  var RESCHEDULE_OPTIONS = ['tomorrow', 'this-week', 'inbox'];

  function validDate(d) {
    if (typeof d !== 'string' || !DATE_RE.test(d)) return false;
    var parts = d.split('-').map(Number);
    var dt = new Date(parts[0], parts[1] - 1, parts[2]);
    return dt.getFullYear() === parts[0] && dt.getMonth() === parts[1] - 1 && dt.getDate() === parts[2]
      && parts[0] >= 2020 && parts[0] <= 2099;
  }
  function validTime(t) { return typeof t === 'string' && TIME_RE.test(t); }

  function shortDate(dateStr, lang) {
    if (!validDate(dateStr)) return '';
    var mo = +dateStr.slice(5, 7), d = +dateStr.slice(8, 10);
    if (lang === 'vi') return String(d).padStart(2, '0') + '/' + String(mo).padStart(2, '0');
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d + ' ' + MONTHS[mo - 1];
  }

  function formatMinutes(min, lang) {
    var m = Math.max(0, Math.round(min));
    if (m < 60) return m + (lang === 'vi' ? ' phút' : ' min');
    var h = Math.floor(m / 60), r = m % 60;
    if (!r) return lang === 'vi' ? h + ' giờ' : h + ' h';
    return lang === 'vi' ? h + ' giờ ' + r + ' phút' : h + ' h ' + r + ' min';
  }

  /* ---- Canonical state lookups ---- */
  function findTask(tasks, uid) {
    if (!Array.isArray(tasks)) return null;
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i] && (tasks[i].uid === uid || tasks[i].id === uid)) return tasks[i];
    }
    return null;
  }

  function findTimeblock(timeblocks, taskUid, date) {
    if (!Array.isArray(timeblocks)) return null;
    for (var i = 0; i < timeblocks.length; i++) {
      var tb = timeblocks[i];
      if (tb && tb.taskUid === taskUid && tb.date === date && tb.status !== 'cancelled') return tb;
    }
    return null;
  }

  /* ---- Editable field definitions per action type ---- */
  var EDITABLE_FIELDS = {
    schedule_task: ['date', 'start', 'duration'],
    reschedule_task: ['option'],
  };

  /**
   * Get the set of fields a user may safely edit for a given action.
   */
  function getEditableFields(action) {
    if (!action || !action.type) return [];
    return EDITABLE_FIELDS[action.type] || [];
  }

  /* ---- Build before/after for an action ---- */

  function _buildScheduleBeforeAfter(action, canonical, labels, lang) {
    var task = findTask(canonical.tasks, action.taskUid);
    var taskLabel = (task && task.text) ? task.text : (labels[action.taskUid] || 'Task');
    var before = { lines: [] };
    var after = { lines: [] };

    // Before: existing timeblock or unscheduled
    var existingTB = findTimeblock(canonical.timeblocks, action.taskUid, action.date);
    if (existingTB) {
      before.lines.push(existingTB.start + '–' + existingTB.end);
      before.lines.push(shortDate(existingTB.date, lang));
    } else {
      before.lines.push(lang === 'vi' ? 'Chưa xếp lịch' : 'Unscheduled');
    }

    // After: proposed
    after.lines.push(action.start || '--:--');
    if (action.duration) after.lines.push(formatMinutes(action.duration, lang));
    if (validDate(action.date)) after.lines.push(shortDate(action.date, lang));

    return {
      type: 'schedule_task',
      actionId: action.id,
      label: taskLabel,
      before: before,
      after: after,
      editableFields: getEditableFields(action),
    };
  }

  function _buildRescheduleBeforeAfter(action, canonical, labels, lang) {
    var task = findTask(canonical.tasks, action.taskUid);
    var taskLabel = (task && task.text) ? task.text : (labels[action.taskUid] || 'Task');
    var before = { lines: [] };
    var after = { lines: [] };

    // Before: find current timeblock
    var allTBs = canonical.timeblocks || [];
    var currentTB = null;
    for (var i = 0; i < allTBs.length; i++) {
      if (allTBs[i] && allTBs[i].taskUid === action.taskUid && allTBs[i].status !== 'cancelled') {
        currentTB = allTBs[i]; break;
      }
    }
    if (currentTB) {
      before.lines.push(shortDate(currentTB.date, lang) + ' · ' + currentTB.start);
    } else {
      before.lines.push(lang === 'vi' ? 'Chưa xếp lịch' : 'Unscheduled');
    }

    // After
    var optLabel = action.option === 'inbox' ? (lang === 'vi' ? 'Inbox' : 'Inbox')
      : action.option === 'tomorrow' ? (lang === 'vi' ? 'Ngày mai' : 'Tomorrow')
      : action.option === 'this-week' ? (lang === 'vi' ? 'Tuần này' : 'This week')
      : action.option;
    after.lines.push(optLabel);

    return {
      type: 'reschedule_task',
      actionId: action.id,
      label: taskLabel,
      before: before,
      after: after,
      editableFields: getEditableFields(action),
    };
  }

  function _buildCreateBeforeAfter(action, canonical, labels, lang) {
    var before = { lines: [] };
    var after = { lines: [] };

    before.lines.push(lang === 'vi' ? 'Chưa tồn tại' : 'Does not exist');

    after.lines.push(action.text || (lang === 'vi' ? 'Task mới' : 'New task'));
    if (action.duration) after.lines.push(formatMinutes(action.duration, lang));
    if (validDate(action.date)) after.lines.push(shortDate(action.date, lang));

    return {
      type: 'create_task',
      actionId: action.id,
      label: action.text || (lang === 'vi' ? 'Task mới' : 'New task'),
      before: before,
      after: after,
      editableFields: getEditableFields(action),
    };
  }

  function _buildNextActionBeforeAfter(action, lang) {
    return {
      type: 'next_action',
      actionId: action.id,
      label: action.text || (lang === 'vi' ? 'Gợi ý tiếp theo' : 'Next action'),
      before: { lines: [lang === 'vi' ? 'Gợi ý AI' : 'AI suggestion'] },
      after: { lines: [action.text || ''] },
      editableFields: [],
    };
  }

  /* ---- Build full review model ---- */

  /**
   * Build a deterministic review from proposal + canonical state.
   * @param {object} proposal - validated proposal
   * @param {object} canonical - { tasks, timeblocks }
   * @param {object} opts - { taskLabels, warnings, lang, contextUsage }
   * @returns {object} review model
   */
  function buildReview(proposal, canonical, opts) {
    opts = opts || {};
    var lang = opts.lang === 'en' ? 'en' : 'vi';
    var labels = opts.taskLabels || {};
    var warnings = opts.warnings || [];
    var warnMap = {};
    warnings.forEach(function (w) { if (w) warnMap[w.actionIndex] = w; });

    var actions = [];
    if (proposal && Array.isArray(proposal.actions)) {
      proposal.actions.forEach(function (a, i) {
        if (!a || !a.type) return;
        var diff;
        if (a.type === 'schedule_task') {
          diff = _buildScheduleBeforeAfter(a, canonical, labels, lang);
        } else if (a.type === 'reschedule_task') {
          diff = _buildRescheduleBeforeAfter(a, canonical, labels, lang);
        } else if (a.type === 'create_task') {
          diff = _buildCreateBeforeAfter(a, canonical, labels, lang);
        } else if (a.type === 'next_action') {
          diff = _buildNextActionBeforeAfter(a, lang);
        } else {
          diff = { type: a.type, actionId: a.id, label: a.text || a.type, before: { lines: [] }, after: { lines: [] }, editableFields: [] };
        }
        diff.warning = warnMap[i] || null;
        diff.index = i;
        actions.push(diff);
      });
    }

    return {
      version: 1,
      summary: (proposal && proposal.summary) || '',
      actions: actions,
      contextUsage: opts.contextUsage || [],
    };
  }

  /* ---- Revalidation after edit ---- */

  /**
   * Validate an edited review action draft.
   * @param {object} reviewAction - one entry from review.actions
   * @param {object} originalAction - the original proposal action
   * @param {object} canonical - { tasks, timeblocks }
   * @returns {{ok: boolean, errors: string[]}}
   */
  function validateReviewDraft(reviewAction, originalAction, canonical) {
    if (!reviewAction || !originalAction) return { ok: false, errors: ['invalid-action'] };
    var errors = [];
    var type = originalAction.type;

    if (type === 'schedule_task') {
      if (reviewAction.editedFields) {
        var ef = reviewAction.editedFields;
        if (ef.date !== undefined && ef.date !== null && ef.date !== '' && !validDate(ef.date)) {
          errors.push('invalid-date');
        }
        if (ef.start !== undefined && ef.start !== null && ef.start !== '' && !validTime(ef.start)) {
          errors.push('invalid-start');
        }
        if (ef.duration !== undefined && ef.duration !== null) {
          var d = Number(ef.duration);
          if (!Number.isFinite(d) || d < 5 || d > 480) errors.push('invalid-duration');
        }
      }
    } else if (type === 'reschedule_task') {
      if (reviewAction.editedFields) {
        var ef2 = reviewAction.editedFields;
        if (ef2.option !== undefined && ef2.option !== null && ef2.option !== '' && RESCHEDULE_OPTIONS.indexOf(ef2.option) === -1) {
          errors.push('invalid-reschedule-option');
        }
      }
    }

    return { ok: errors.length === 0, errors: errors };
  }

  /* ---- Apply edits to produce patched proposal action ---- */

  /**
   * Patch a proposal action with user edits (does NOT mutate canonical state).
   * @param {object} action - original proposal action (will be cloned)
   * @param {object} editedFields - { field: newValue }
   * @returns {object} cloned + patched action
   */
  function patchAction(action, editedFields) {
    if (!action || !editedFields) return action ? JSON.parse(JSON.stringify(action)) : action;
    var patched = JSON.parse(JSON.stringify(action));
    if (patched.type === 'schedule_task') {
      if (editedFields.date !== undefined) patched.date = editedFields.date || undefined;
      if (editedFields.start !== undefined) patched.start = editedFields.start || undefined;
      if (editedFields.duration !== undefined) patched.duration = editedFields.duration != null ? Number(editedFields.duration) : undefined;
    } else if (patched.type === 'reschedule_task') {
      if (editedFields.option !== undefined && RESCHEDULE_OPTIONS.indexOf(editedFields.option) !== -1) {
        patched.option = editedFields.option;
      }
    }
    return patched;
  }

  /* ---- Error mapping ---- */
  var ERROR_MAP = {
    vi: {
      'ai-not-configured': 'AI chưa được cấu hình.',
      'ai-timeout': 'Yêu cầu hết thời gian chờ.',
      'ai-rate-limited': 'Đã đạt giới hạn yêu cầu. Vui lòng thử lại sau.',
      'ai-provider-unavailable': 'AI hiện không khả dụng. Trình lập kế hoạch vẫn hoạt động bình thường.',
      'ai-provider-auth': 'Lỗi xác thực AI.',
      'ai-provider-forbidden': 'AI bị từ chối truy cập.',
      'ai-provider-bad-request': 'Yêu cầu AI không hợp lệ.',
      'ai-invalid-response': 'Phản hồi AI không hợp lệ.',
      'ai-validation-failed': 'Kết quả AI không đạt kiểm tra.',
      'ai-context-invalid': 'Ngữ cảnh không hợp lệ.',
      'network': 'Lỗi mạng.',
      'default': 'Đã xảy ra lỗi. Planner vẫn hoạt động bình thường.',
    },
    en: {
      'ai-not-configured': 'AI is not configured.',
      'ai-timeout': 'Request timed out.',
      'ai-rate-limited': 'Rate limit reached. Please try again later.',
      'ai-provider-unavailable': 'AI is unavailable right now. Your planner still works normally.',
      'ai-provider-auth': 'AI authentication error.',
      'ai-provider-forbidden': 'AI access forbidden.',
      'ai-provider-bad-request': 'Invalid AI request.',
      'ai-invalid-response': 'Invalid AI response.',
      'ai-validation-failed': 'AI output failed validation.',
      'ai-context-invalid': 'Invalid context.',
      'network': 'Network error.',
      'default': 'An error occurred. Your planner still works normally.',
    }
  };

  function friendlyError(code, lang) {
    var map = ERROR_MAP[lang === 'en' ? 'en' : 'vi'] || ERROR_MAP.vi;
    return map[code] || map['default'];
  }

  /* ---- Public API ---- */
  var ns = {
    buildReview: buildReview,
    validateReviewDraft: validateReviewDraft,
    patchAction: patchAction,
    getEditableFields: getEditableFields,
    friendlyError: friendlyError,
    shortDate: shortDate,
    formatMinutes: formatMinutes,
    RESCHEDULE_OPTIONS: RESCHEDULE_OPTIONS,
    EDITABLE_FIELDS: EDITABLE_FIELDS,
    // For tests
    _findTask: findTask,
    _findTimeblock: findTimeblock,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ns;
  } else {
    g[UMD_NAME] = ns;
  }
})(typeof window !== 'undefined' ? window : globalThis);
