/**
 * TaskFlow — Phase 6E: AI Explainability + Provenance
 *
 * Deterministic transparency for AI proposals.
 * Shows SOURCE FACTS + APPLIED RULES + USER-RELEVANT REASONS.
 * NEVER exposes chain-of-thought, hidden reasoning, or system prompts.
 *
 * Architecture:
 *   proposal + validated context + provenance factors
 *   → local deterministic formatter
 *   → user explanation
 *
 * No Gemini calls. No mutations. No state. Pure functions where possible.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAIExplainability = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ================================================================
     PROVENANCE SCHEMA (P1)
     ================================================================ */
  var PROVENANCE_VERSION = 1;

  /**
   * Factor types — strict allowlist (P2).
   * Only these may appear in provenance factors.
   */
  var ALLOWED_FACTOR_TYPES = [
    'user-request',
    'document-evidence',
    'document-derived',
    'explicit-deadline',
    'saved-preference',
    'current-task-state',
    'project-context',
    'timeblock-availability',
    'google-busy',
    'duplicate-check',
    'past-deadline',
    'conflict',
    'default-value',
    'user-edit',
    'user-time-override',
    'dependency-select',
  ];

  /* ================================================================
     PROVENANCE NORMALIZATION (P1 + P26-P27)
     ================================================================ */

  /**
   * Create a normalized provenance object.
   * @param {string} source - "user"|"taskflow"|"file"|"preference"|"derived"
   * @param {Array} factors - factor objects [{type, label}]
   * @returns {object|null} normalized provenance or null if invalid
   */
  function normalizeProvenance(source, factors) {
    if (source !== 'user' && source !== 'taskflow' && source !== 'file' && source !== 'preference' && source !== 'derived') {
      return null;
    }
    if (!Array.isArray(factors)) factors = [];
    var cleaned = [];
    for (var i = 0; i < factors.length && cleaned.length < 6; i++) {
      var f = factors[i];
      if (!f || typeof f !== 'object') continue;
      if (ALLOWED_FACTOR_TYPES.indexOf(f.type) === -1) continue;
      if (typeof f.label !== 'string' || !f.label.trim()) continue;
      cleaned.push({ type: f.type, label: f.label.trim().slice(0, 160) });
    }
    return { version: PROVENANCE_VERSION, source: source, factors: cleaned };
  }

  /**
   * Validate provenance structure.
   * @param {object} prov - provenance object
   * @returns {{ok: boolean, errors: string[]}}
   */
  function validateProvenance(prov) {
    if (!prov || typeof prov !== 'object' || Array.isArray(prov)) {
      return { ok: false, errors: ['provenance-not-object'] };
    }
    if (prov.version !== PROVENANCE_VERSION) {
      return { ok: false, errors: ['provenance-version-mismatch'] };
    }
    var validSources = ['user', 'taskflow', 'file', 'preference', 'derived'];
    if (validSources.indexOf(prov.source) === -1) {
      return { ok: false, errors: ['provenance-invalid-source'] };
    }
    if (!Array.isArray(prov.factors)) {
      return { ok: false, errors: ['provenance-factors-not-array'] };
    }
    for (var i = 0; i < prov.factors.length; i++) {
      var f = prov.factors[i];
      if (!f || typeof f !== 'object') return { ok: false, errors: ['provenance-factor-not-object'] };
      if (ALLOWED_FACTOR_TYPES.indexOf(f.type) === -1) return { ok: false, errors: ['provenance-factor-type-not-allowed'] };
      if (typeof f.label !== 'string' || !f.label.trim()) return { ok: false, errors: ['provenance-factor-label-empty'] };
    }
    return { ok: true, errors: [] };
  }

  /* ================================================================
     FACTOR BUILDING (P3, P5-P13)
     ================================================================ */

  /**
   * Build provenance factors for an action within a proposal.
   * Deterministic — no LLM calls, no state mutations.
   *
   * @param {object} action - proposal action
   * @param {object} opts - {proposal, ctx, editState, warnings, fileSource, preferenceData}
   * @returns {object} normalized provenance
   */
  function buildActionFactors(action, opts) {
    opts = opts || {};
    var factors = [];
    var source = 'taskflow';

    // P28: User request factor
    if (opts.userMessage) {
      factors.push({ type: 'user-request', label: _summarizeUserRequest(opts.userMessage) });
    }

    // File provenance (P6)
    if (opts.fileSource) {
      source = 'file';
      if (opts.fileSource.kind === 'document') {
        factors.push({ type: 'document-evidence', label: opts.fileSource.evidence || opts.fileSource.name || 'Tài liệu' });
      } else if (opts.fileSource.kind === 'ai-suggested') {
        factors.push({ type: 'document-derived', label: opts.fileSource.evidence || 'AI đề xuất dựa trên tài liệu' });
      }
    }

    // Action-specific factors
    if (action && action.type === 'create_task') {
      _addCreateFactors(action, factors, opts);
    } else if (action && (action.type === 'schedule_task' || action.type === 'reschedule_task')) {
      _addScheduleFactors(action, factors, opts);
      source = factors.length > 0 ? source : 'taskflow';
    }

    // Saved preference factor (P18)
    if (opts.preferenceData && opts.preferenceData.defaultTaskDuration && action && action.type === 'create_task' && action.args && !opts.editState) {
      factors.push({ type: 'saved-preference', label: 'Thời lượng mặc định: ' + opts.preferenceData.defaultTaskDuration + ' phút' });
    }

    // Duplicate check (P11)
    if (opts.warnings) {
      for (var w = 0; w < opts.warnings.length; w++) {
        if (opts.warnings[w].code === 'duplicate' || (opts.warnings[w].code && opts.warnings[w].code.indexOf('duplicate') !== -1)) {
          factors.push({ type: 'duplicate-check', label: 'Có thể trùng task hiện có' });
        }
        if (opts.warnings[w].code === 'conflict' || (opts.warnings[w].code && opts.warnings[w].code.indexOf('conflict') !== -1)) {
          factors.push({ type: 'conflict', label: 'Có xung đột lịch' });
        }
        if (opts.warnings[w].code === 'past-deadline' || (opts.warnings[w].code && opts.warnings[w].code.indexOf('past') !== -1)) {
          factors.push({ type: 'past-deadline', label: 'Deadline đã qua' });
        }
      }
    }

    // User edit override (P38)
    if (opts.editState) {
      factors.push({ type: 'user-edit', label: 'Bạn đã chỉnh trước khi áp dụng' });
    }

    return normalizeProvenance(source, factors);
  }

  function _addCreateFactors(action, factors, opts) {
    var args = action.args || {};
    // Explicit deadline (P5)
    if (args.date) {
      factors.push({ type: 'explicit-deadline', label: 'Deadline: ' + args.date });
    }
    // Duration
    if (args.duration) {
      var fromSource = 'từ yêu cầu';
      if (opts.preferenceData && opts.preferenceData.defaultTaskDuration === args.duration && !opts.editState) {
        fromSource = 'từ tùy chọn mặc định';
      }
      factors.push({ type: 'default-value', label: 'Thời lượng ' + args.duration + ' phút ' + fromSource });
    }
  }

  function _addScheduleFactors(action, factors, opts) {
    var args = action.args || {};

    // TimeBlock availability (P8)
    factors.push({ type: 'timeblock-availability', label: 'Không có TimeBlock trùng' });

    // Google busy (P8)
    factors.push({ type: 'google-busy', label: 'Không có Google busy event trùng' });

    // User time override (P9)
    if (opts.userMessage && args.start && /\d{1,2}[:\s]*\d{2}/.test(opts.userMessage)) {
      factors.push({ type: 'user-time-override', label: 'Thời gian ' + args.start + ' do bạn chỉ định' });
    } else if (opts.preferenceData && opts.preferenceData.preferredWorkWindow) {
      var ww = opts.preferenceData.preferredWorkWindow;
      factors.push({ type: 'saved-preference', label: 'Khung giờ ưu tiên: ' + (ww.start || '') + '–' + (ww.end || '') });
    }

    // Dependency (P13)
    if (args.taskRef && args.taskRef.kind === 'action') {
      factors.push({ type: 'dependency-select', label: 'Phụ thuộc vào task được tạo trước đó' });
    }
  }

  function _summarizeUserRequest(message) {
    if (!message) return 'Bạn yêu cầu tạo task';
    var s = message.trim();
    if (s.length > 100) s = s.slice(0, 100) + '...';
    return 'Bạn yêu cầu: ' + s;
  }

  /* ================================================================
     EXPLANATION FORMATTING (P5, P34)
     ================================================================ */

  /**
   * Format action explanation for display.
   * Returns safe text content (no HTML).
   *
   * @param {object} provenance - normalized provenance
   * @param {string} lang - 'vi' or 'en'
   * @returns {string} formatted explanation text
   */
  function formatActionExplanation(provenance, lang) {
    if (!provenance || !provenance.factors || provenance.factors.length === 0) {
      return lang === 'en' ? 'No specific explanation available.' : 'Không có giải thích cụ thể.';
    }

    var lines = [];
    lines.push(lang === 'en' ? 'Why this action?' : 'Vì sao AI đề xuất việc này?');
    lines.push('');

    for (var i = 0; i < provenance.factors.length; i++) {
      var f = provenance.factors[i];
      var bullet = _factorBullet(f.type, lang);
      lines.push('• ' + bullet + ': ' + f.label);
    }

    return lines.join('\n');
  }

  function _factorBullet(type, lang) {
    var map_vi = {
      'user-request': 'Yêu cầu',
      'document-evidence': 'Có trong tài liệu',
      'document-derived': 'AI đề xuất',
      'explicit-deadline': 'Deadline',
      'saved-preference': 'Tùy chọn đã lưu',
      'current-task-state': 'Trạng thái task',
      'project-context': 'Project',
      'timeblock-availability': 'Lịch hiện tại',
      'google-busy': 'Google Calendar',
      'duplicate-check': 'Kiểm tra trùng',
      'past-deadline': 'Deadline đã qua',
      'conflict': 'Xung đột',
      'default-value': 'Giá trị mặc định',
      'user-edit': 'Bạn chỉnh sửa',
      'user-time-override': 'Bạn chỉ định',
      'dependency-select': 'Phụ thuộc',
    };
    var map_en = {
      'user-request': 'User request',
      'document-evidence': 'In document',
      'document-derived': 'AI suggestion',
      'explicit-deadline': 'Deadline',
      'saved-preference': 'Saved preference',
      'current-task-state': 'Task state',
      'project-context': 'Project',
      'timeblock-availability': 'Schedule',
      'google-busy': 'Google Calendar',
      'duplicate-check': 'Duplicate check',
      'past-deadline': 'Past deadline',
      'conflict': 'Conflict',
      'default-value': 'Default value',
      'user-edit': 'User edit',
      'user-time-override': 'User specified',
      'dependency-select': 'Dependency',
    };
    var map = lang === 'en' ? map_en : map_vi;
    return map[type] || type;
  }

  /* ================================================================
     CONTEXT USAGE SUMMARY (P14-P17)
     ================================================================ */

  /**
   * Build a summary of which data categories were actually used.
   * @param {object} ctx - validated context envelope
   * @param {object} opts - {fileSource, preferenceData, hasReflection, hasMood}
   * @returns {Array<{key: string, label_vi: string, label_en: string}>}
   */
  function buildContextUsageSummary(ctx, opts) {
    opts = opts || {};
    var used = [];

    // Tasks
    if (ctx && ctx.data && Array.isArray(ctx.data.tasks) && ctx.data.tasks.length > 0) {
      used.push({ key: 'tasks', label_vi: 'Tasks', label_en: 'Tasks' });
    }

    // Projects
    if (ctx && ctx.data && Array.isArray(ctx.data.projects) && ctx.data.projects.length > 0) {
      used.push({ key: 'projects', label_vi: 'Projects', label_en: 'Projects' });
    }

    // Schedule / timeblocks
    if (ctx && ctx.data && (Array.isArray(ctx.data.timeblocks) && ctx.data.timeblocks.length > 0 || ctx.data.schedule)) {
      used.push({ key: 'schedule', label_vi: 'Lịch', label_en: 'Schedule' });
    }

    // Google busy
    if (ctx && ctx.data && ctx.data.googleBusy && Array.isArray(ctx.data.googleBusy) && ctx.data.googleBusy.length > 0) {
      used.push({ key: 'googleBusy', label_vi: 'Google Calendar', label_en: 'Google Calendar' });
    }

    // Saved preferences (P18)
    if (opts.preferenceData && typeof opts.preferenceData === 'object') {
      var prefKeys = Object.keys(opts.preferenceData).filter(function (k) { return opts.preferenceData[k] != null; });
      if (prefKeys.length > 0) {
        used.push({ key: 'preferences', label_vi: 'Tùy chọn đã lưu', label_en: 'Saved preferences' });
      }
    }

    // File attachment (P6, P21)
    if (opts.fileSource && opts.fileSource.name) {
      used.push({ key: 'file', label_vi: opts.fileSource.name, label_en: opts.fileSource.name });
    }

    // Sensitive: Reflection (P17)
    if (opts.hasReflection && ctx && ctx.data && ctx.data.reflections) {
      used.push({ key: 'reflections', label_vi: 'Reflection', label_en: 'Reflection' });
    }

    // Sensitive: Mood (P17)
    if (opts.hasMood && ctx && ctx.data && ctx.data.mood) {
      used.push({ key: 'mood', label_vi: 'Mood', label_en: 'Mood' });
    }

    return used;
  }

  /**
   * Format context usage summary as a compact string.
   * @param {Array} summary - from buildContextUsageSummary
   * @param {string} lang - 'vi' or 'en'
   * @returns {string}
   */
  function formatContextUsageSummary(summary, lang) {
    if (!summary || summary.length === 0) {
      return lang === 'en' ? 'AI used no personal data.' : 'AI không dùng dữ liệu cá nhân.';
    }
    var labels = summary.map(function (s) { return lang === 'en' ? s.label_en : s.label_vi; });
    return (lang === 'en' ? 'AI used: ' : 'AI đã dùng: ') + labels.join(' · ');
  }

  /**
   * Disabled action explanation (P13).
   * @param {string} reason - 'dependency-not-selected'|'past-deadline'|etc
   * @param {string} lang - 'vi' or 'en'
   * @returns {string}
   */
  function formatDisabledReason(reason, lang) {
    var map = {
      'dependency-not-selected': { vi: 'Không thể xếp lịch vì task cha chưa được chọn để tạo.', en: 'Cannot schedule because the parent task was not selected.' },
      'past-deadline': { vi: 'Deadline đã qua — không thể áp dụng tự động.', en: 'Deadline has passed — cannot apply automatically.' },
      'conflict': { vi: 'Có xung đột với TimeBlock hiện có.', en: 'Conflicts with an existing TimeBlock.' },
      'default': { vi: 'Hành động này hiện không khả dụng.', en: 'This action is currently unavailable.' },
    };
    var m = map[reason] || map['default'];
    return m[lang] || m.vi;
  }

  /* ================================================================
     PUBLIC API
     ================================================================ */
  return {
    PROVENANCE_VERSION: PROVENANCE_VERSION,
    ALLOWED_FACTOR_TYPES: ALLOWED_FACTOR_TYPES.slice(),
    normalizeProvenance: normalizeProvenance,
    validateProvenance: validateProvenance,
    buildActionFactors: buildActionFactors,
    formatActionExplanation: formatActionExplanation,
    buildContextUsageSummary: buildContextUsageSummary,
    formatContextUsageSummary: formatContextUsageSummary,
    formatDisabledReason: formatDisabledReason,
  };
});
