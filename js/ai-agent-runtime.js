// TaskFlow — Safe Action Agent Runtime (Phase 4B/4C/5C).
// Flow: user request → deterministic action-intent router → POST /api/ai/agent
// → Gemini proposes → server sanitizes → TaskFlowAIAgent validates → dry-run
// → preview card in the Chat panel → user CONFIRMS → revalidation → canonical
// TaskFlow mutation APIs apply. NO direct Gemini write, NO autonomous actions,
// NO delete, NO auto-apply. Lazy-loaded with the Chat chain (never boot path).
//
// Phase 4C adds:
// - Dependent actions via taskRef (existing vs action-produced)
// - Topological execution order
// - Runtime entity resolution (actionId → real UID mapping)
// - Grouped preview for dependent actions
// - Transaction safety with rollback on partial failure
//
// Phase 5C adds:
// - Per-action selection with dependency-aware behavior
// - Safe argument editing before apply (no Gemini call)
// - Live local validation + conflict refresh
// - Human-readable update diffs
// - Selected subgraph revalidation at confirm time
// - Dynamic confirm button label
// - Double-click safety guard
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAIAgentRuntime = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ---- i18n / esc helpers (mirror chat.js) ---- */
  function _t(key, vars) {
    try {
      if (window.TaskFlowI18N && window.TaskFlowI18N.t) return window.TaskFlowI18N.t(key, vars);
    } catch (e) { /* */ }
    return key;
  }
  function _esc(s) {
    try { return (window.TaskFlowUtil && window.TaskFlowUtil.esc) ? window.TaskFlowUtil.esc(s) : String(s); }
    catch (e) { return String(s); }
  }
  function _el(id) { return document.getElementById(id); }
  function _hasToken() {
    try { return !!localStorage.getItem('planner-token'); } catch (e) { return false; }
  }
  function _isOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
  function _getApiBase() {
    try {
      if (typeof API_CONFIG !== 'undefined' && API_CONFIG && typeof API_CONFIG.url === 'string') {
        return API_CONFIG.url.replace(/\/+$/, '');
      }
    } catch (e) { /* */ }
    return '';
  }

  /* ---- P3/P5B: deterministic action-intent router ---- */
  // Phase 5B: delegates to TaskFlowAIIntent classifier when available,
  // falls back to legacy boolean patterns for backward compat.
  function isActionIntent(message) {
    try {
      if (window.TaskFlowAIIntent && typeof window.TaskFlowAIIntent.isActionIntent === 'function') {
        return window.TaskFlowAIIntent.isActionIntent(message);
      }
    } catch (e) { /* fallback */ }
    // Legacy fallback (pre-Phase 5B)
    const CREATE_RE = /(^|\s)(tạo|thêm|add|create|new)\s+(task|công việc|việc|todo|work|nhiệm vụ)/i;
    const COMPLETE_RE = /hoàn thành|hoàn tất|đánh dấu[\s\S]*xong|mark[\s\S]*(done|complete)|complete|finish/i;
    const SCHEDULE_RE = /(xếp|sắp lịch|lên lịch|schedule|book|đặt giờ|đặt lịch)|vào lúc\s*\d{1,2}|vào\s*\d{1,2}\s*h/i;
    const RESCHEDULE_RE = /(chuyển|dời|reschedule|move)\s+(task|công việc|việc|todo|work)|chuyển\s+sang|dời\s+sang/i;
    const UPDATE_RE = /ưu tiên cao|ưu tiên thấp|priority|đổi[\s\S]*thời lượng|change[\s\S]*duration|đổi[\s\S]*tên|rename|đổi[\s\S]*deadline|đổi[\s\S]*ngày|set[\s\S]*(priority|duration)/i;
    const s = String(message || '').trim();
    if (!s) return false;
    return CREATE_RE.test(s) || COMPLETE_RE.test(s) || RESCHEDULE_RE.test(s) || SCHEDULE_RE.test(s) || UPDATE_RE.test(s);
  }

  /* ---- P4: read-only context from CURRENT canonical state (no mutation) ---- */
  function _taskToCtx(tk) {
    if (!tk) return null;
    return {
      uid: tk.uid,
      text: typeof tk.text === 'string' ? tk.text : '',
      kind: tk.kind,
      deadline: tk.deadline || null,
      duration: (typeof tk.duration === 'number' && Number.isFinite(tk.duration)) ? tk.duration
        : (typeof tk.estimatedMinutes === 'number' && Number.isFinite(tk.estimatedMinutes)) ? tk.estimatedMinutes : null,
      priority: tk.kind === 'priority' ? 1 : 0,
      projectId: tk.projectId || null,
      milestoneId: tk.milestoneId || null,
    };
  }

  function _localTodayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function buildContext() {
    const tasks = [];
    try {
      if (typeof state !== 'undefined' && state && Array.isArray(state.weeks)) {
        state.weeks.forEach((w) => {
          if (!w || !Array.isArray(w.days)) return;
          w.days.forEach((d) => {
            if (!d || !Array.isArray(d.tasks)) return;
            d.tasks.forEach((tk) => { const c = _taskToCtx(tk); if (c) tasks.push(c); });
          });
        });
      }
    } catch (e) { /* */ }
    try {
      if (typeof inbox !== 'undefined' && Array.isArray(inbox)) {
        inbox.forEach((tk) => { const c = _taskToCtx(tk); if (c) tasks.push(c); });
      }
    } catch (e) { /* */ }

    const projects = [];
    const milestones = [];
    try {
      if (typeof loadProjectsStore === 'function') {
        const store = loadProjectsStore();
        if (store && Array.isArray(store.projects)) {
          store.projects.forEach((p) => {
            if (!p || !p.id) return;
            projects.push({ id: p.id, title: p.title || '', status: p.status, milestones: [] });
            (Array.isArray(p.milestones) ? p.milestones : []).forEach((m) => {
              if (!m || !m.id) return;
              projects[projects.length - 1].milestones.push({ id: m.id, title: m.title || '' });
              milestones.push({ id: m.id, projectId: p.id, title: m.title || '' });
            });
          });
        }
      }
    } catch (e) { /* */ }

    let timeblocks = null;
    try {
      if (typeof loadTimeBlocksStore === 'function') timeblocks = loadTimeBlocksStore();
    } catch (e) { /* */ }

    const busy = [];
    try {
      if (window.TaskFlowGCal && window.TaskFlowGCal.loadCache && window.TaskFlowGCal.eventsForDate) {
        const cache = window.TaskFlowGCal.loadCache();
        const events = cache && Array.isArray(cache.events) ? cache.events : [];
        const today = _todayStr();
        const days = [today];
        if (typeof PLAN_START !== 'undefined' && PLAN_START instanceof Date) {
          for (let d = 0; d < (typeof NUM_DAYS !== 'undefined' ? NUM_DAYS : 31) && d < 7; d++) {
            days.push(new Date(PLAN_START.getFullYear(), PLAN_START.getMonth(), 1 + d).getFullYear() + '-' + String(new Date(PLAN_START.getFullYear(), PLAN_START.getMonth(), 1 + d).getMonth() + 1).padStart(2, '0') + '-' + String(new Date(PLAN_START.getFullYear(), PLAN_START.getMonth(), 1 + d).getDate()).padStart(2, '0'));
          }
        }
        days.forEach((dayStr) => {
          (window.TaskFlowGCal.eventsForDate(events, dayStr) || []).forEach((e) => {
            busy.push({ startMs: e.startMs, endMs: e.endMs });
          });
        });
      }
    } catch (e) { /* offline → no busy */ }

    let today = _localTodayIso();
    try {
      if (typeof PlannerUI !== 'undefined' && PlannerUI.todayStr) today = PlannerUI.todayStr() || today;
    } catch (e) { /* */ }
    let lang = 'vi';
    try {
      if (document.documentElement && document.documentElement.lang === 'en') lang = 'en';
    } catch (e) { /* */ }

    const ctx = {
      today,
      lang,
      tasks,
      projects,
      milestones,
      timeblocks,
      busy,
    };
    if (window.TaskFlowTimeBlocks && typeof window.TaskFlowTimeBlocks.findOverlaps === 'function') {
      ctx.findOverlaps = window.TaskFlowTimeBlocks.findOverlaps;
    }
    return ctx;
  }

  function _todayStr() {
    try { return _localTodayIso(); } catch (e) { return null; }
  }

  /* ---- API call ---- */
  async function _callAgentAPI(message, history, signal) {
    const apiBase = _getApiBase();
    if (!apiBase) throw { code: 'api-config-missing' };
    const url = apiBase + '/api/ai/agent';
    let token = null;
    try { token = localStorage.getItem('planner-token'); } catch (e) { /* */ }
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    let taskflowContext = null;
    try {
      if (window.TaskFlowChatContextProvider && window.TaskFlowChatContextProvider.prepare) {
        const ctxRes = window.TaskFlowChatContextProvider.prepare(message);
        if (ctxRes && ctxRes.ok && ctxRes.envelope) taskflowContext = ctxRes.envelope;
      }
    } catch (e) { /* chat works without context */ }

    const body = { message, history };
    if (taskflowContext) body.taskflowContext = taskflowContext;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: signal || undefined,
    });
    let json;
    try { json = await res.json(); } catch (e) { json = null; }
    if (!res.ok || !json || !json.ok) {
      const errCode = (json && json.error) || 'network';
      // Preserve safe error details for debugging (only known TaskFlow error codes)
      const safeDetails = json && Array.isArray(json.details) ? json.details.slice(0, 5) : undefined;
      const requestId = res.headers && typeof res.headers.get === 'function' ? res.headers.get('x-request-id') : undefined;
      const rateLimit = json && json.rateLimit && typeof json.rateLimit === 'object' ? json.rateLimit : undefined;
      const timeout = json && json.timeout && typeof json.timeout === 'object' ? json.timeout : undefined;
      throw { code: errCode, status: res.status, details: safeDetails, requestId: requestId || undefined, rateLimit: rateLimit || undefined, timeout: timeout || undefined };
    }
    return json.proposal;
  }

  function _mapError(err) {
    const code = err && err.code ? err.code : 'network';
    // Distinguish provider vs local rate limit
    if (code === 'ai-rate-limited') {
      const rl = err && err.rateLimit;
      if (rl && rl.source === 'taskflow') return _t('chatErrorLocalRateLimited');
      return _t('chatErrorRateLimited');
    }
    switch (code) {
      case 'ai-not-configured': return _t('chatErrorNotConfigured');
      case 'ai-timeout': return _t('chatErrorTimeout');
      case 'ai-provider-auth': return _t('chatErrorProviderAuth');
      case 'ai-provider-forbidden': return _t('chatErrorProviderForbidden');
      case 'ai-provider-bad-request': return _t('chatErrorBadRequest');
      case 'ai-provider-unavailable': case 'ai-provider-not-found':
        return _t('chatErrorUnavailable');
      case 'ai-invalid-response': return _t('agentErrorServer');
      case 'ai-validation-failed': return _t('agentErrorServer');
      case 'ai-context-invalid': return _t('chatErrorContextInvalid');
      case 'api-config-missing': return _t('chatErrorApiConfig');
      case 'invalid-message': return _t('chatErrorInvalidMessage');
      default: return _t('chatErrorMsg');
    }
  }

  /* ---- Validation-error → user text (generic, never UID/secret) ---- */
  function _mapValidationError(errors) {
    const e = errors && errors[0] ? errors[0] : null;
    if (!e) return _t('agentErrorNoActions');
    switch (e.code) {
      case 'unknown-task': return _t('agentStaleTask');
      case 'unsupported-action': return _t('agentUnsupportedAction');
      case 'proposal-too-large': return _t('agentTooManyActions');
      case 'unknown-project': return _t('agentUnknownProject');
      case 'unknown-milestone': return _t('agentUnknownMilestone');
      case 'invalid-date': case 'invalid-start': case 'invalid-duration':
        return _t('agentInvalidSchedule');
      case 'forbidden-field': return _t('agentUnsupportedAction');
      case 'invalid-action-id': return _t('agentUnsupportedAction');
      case 'duplicate-action-id': return _t('agentUnsupportedAction');
      case 'taskref-required': return _t('agentUnsupportedAction');
      case 'taskref-not-object': return _t('agentUnsupportedAction');
      case 'taskref-invalid-kind': return _t('agentUnsupportedAction');
      case 'unknown-action-reference': return _t('agentUnsupportedAction');
      case 'self-reference': return _t('agentUnsupportedAction');
      case 'invalid-reference-type': return _t('agentUnsupportedAction');
      case 'dependency-cycle': return _t('agentUnsupportedAction');
      case 'dependency-depth-exceeded': return _t('agentUnsupportedAction');
      default: return _t('agentErrorNoActions');
    }
  }

  /* ---- Warnings (P10) — shown, never auto-resolved ---- */
  function _warnText(code) {
    switch (code) {
      case 'timeblock-conflict': return _t('agentWarnTimeblock');
      case 'google-busy-conflict': return _t('agentWarnBusy');
      case 'invalid-time-range': return _t('agentWarnRange');
      default: return code;
    }
  }

  /* ================================================================
     Phase 5C — Review State Management
     Ephemeral per-proposal. Never persisted, never sent to Gemini.
     ================================================================ */
  let _reviewState = null;

  /**
   * _initReviewState(proposal, dry, grouped)
   * Creates ephemeral review state for ONE proposal.
   * Each action entry: { id, selected: true, editedArgs: null, originalArgs }
   */
  function _initReviewState(proposal, dry, grouped, validationPolicy) {
    const actions = grouped.map(function (g) {
      const action = proposal.actions.find(function (a) { return a.id === g.actionId; });
      const originalArgs = action ? JSON.parse(JSON.stringify(action.args || {})) : {};
      return {
        id: g.actionId,
        selected: true,
        editedArgs: null,
        originalArgs: originalArgs,
        isDependent: g.isDependent,
      };
    });
    _reviewState = {
      proposalId: proposal.id || 'p-' + Date.now(),
      actions: actions,
      dirty: false,
      revision: 0,
      originalProposal: JSON.parse(JSON.stringify(proposal)),
      workingProposal: proposal,
      _history: [],
      _source: dry && dry._source ? dry._source : null,
      _fileName: dry && dry._fileName ? dry._fileName : null,
      _fileMime: dry && dry._fileMime ? dry._fileMime : null,
      _validationPolicy: validationPolicy || null,
      _dry: dry || null,
    };
  }

  function _clearReviewState() { _reviewState = null; }
  function _getReviewState() { return _reviewState; }

  /* ---- Dependency graph helpers (Phase 5C) ---- */
  function _buildDepGraph(proposal) {
    const childrenOf = new Map();
    const parentsOf = new Map();
    if (!proposal || !Array.isArray(proposal.actions)) return { childrenOf, parentsOf };
    proposal.actions.forEach(function (a) {
      if (!a.id) return;
      if (!childrenOf.has(a.id)) childrenOf.set(a.id, new Set());
      if (!parentsOf.has(a.id)) parentsOf.set(a.id, new Set());
    });
    proposal.actions.forEach(function (a) {
      if (!a.id || !a.args || !a.args.taskRef) return;
      const ref = a.args.taskRef;
      if (ref.kind === 'action' && ref.actionId) {
        if (parentsOf.has(a.id)) parentsOf.get(a.id).add(ref.actionId);
        if (childrenOf.has(ref.actionId)) childrenOf.get(ref.actionId).add(a.id);
      }
    });
    return { childrenOf, parentsOf };
  }

  function _transitiveDescendants(ids, childrenOf) {
    const result = new Set();
    const stack = Array.from(ids);
    while (stack.length) {
      const id = stack.pop();
      const kids = childrenOf.get(id);
      if (!kids) continue;
      kids.forEach(function (kid) {
        if (!result.has(kid)) { result.add(kid); stack.push(kid); }
      });
    }
    return result;
  }

  function _transitiveAncestors(ids, parentsOf) {
    const result = new Set();
    const stack = Array.from(ids);
    while (stack.length) {
      const id = stack.pop();
      const pars = parentsOf.get(id);
      if (!pars) continue;
      pars.forEach(function (p) {
        if (!result.has(p)) { result.add(p); stack.push(p); }
      });
    }
    return result;
  }

  function _getSelectedIds() {
    if (!_reviewState) return new Set();
    const ids = new Set();
    _reviewState.actions.forEach(function (a) {
      if (a.selected) ids.add(a.id);
    });
    return ids;
  }

  /* ---- Selection management ---- */
  function _toggleAction(actionId, card, proposal) {
    if (!_reviewState) return;
    const entry = _reviewState.actions.find(function (a) { return a.id === actionId; });
    if (!entry) return;
    const { childrenOf, parentsOf } = _buildDepGraph(proposal);
    if (entry.selected) {
      entry.selected = false;
      const descendants = _transitiveDescendants(new Set([actionId]), childrenOf);
      descendants.forEach(function (descId) {
        const desc = _reviewState.actions.find(function (a) { return a.id === descId; });
        if (desc) desc.selected = false;
      });
    } else {
      entry.selected = true;
      const ancestors = _transitiveAncestors(new Set([actionId]), parentsOf);
      ancestors.forEach(function (ancId) {
        const anc = _reviewState.actions.find(function (a) { return a.id === ancId; });
        if (anc) anc.selected = true;
      });
    }
    _refreshReviewUI(card, proposal);
  }

  function _selectAll(card, proposal) {
    if (!_reviewState) return;
    _reviewState.actions.forEach(function (a) { a.selected = true; });
    _refreshReviewUI(card, proposal);
  }

  function _deselectAll(card, proposal) {
    if (!_reviewState) return;
    _reviewState.actions.forEach(function (a) { a.selected = false; });
    _refreshReviewUI(card, proposal);
  }

  /* ---- Edit validation ---- */
  function _validateEditArgs(actionType, args) {
    const errors = [];
    switch (actionType) {
      case 'create_task': {
        if (!(args.text || '').trim()) errors.push({ field: 'text' });
        if (args.duration != null) { const d = Number(args.duration); if (!Number.isFinite(d) || d < 1 || d > 480) errors.push({ field: 'duration' }); }
        if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) errors.push({ field: 'date' });
        break;
      }
      case 'schedule_task':
      case 'reschedule_task': {
        if (args.start && !/^\d{2}:\d{2}$/.test(args.start)) errors.push({ field: 'start' });
        if (args.duration != null) { const d = Number(args.duration); if (!Number.isFinite(d) || d < 1 || d > 480) errors.push({ field: 'duration' }); }
        if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) errors.push({ field: 'date' });
        if (args.start && args.duration) {
          const endMin = parseInt(args.start.split(':')[0]) * 60 + parseInt(args.start.split(':')[1]) + Math.floor(Number(args.duration));
          if (endMin >= 24 * 60) errors.push({ field: 'duration' });
        }
        break;
      }
      case 'update_task': {
        const ch = args.changes || {};
        if (ch.duration != null) { const d = Number(ch.duration); if (!Number.isFinite(d) || d < 1 || d > 480) errors.push({ field: 'duration' }); }
        if (ch.text !== undefined && ch.text !== null && !(ch.text || '').trim()) errors.push({ field: 'text' });
        break;
      }
      default: break;
    }
    return { valid: errors.length === 0, errors: errors };
  }

  /** Apply user edit to action entry in review state */
  function _applyEdit(actionId, field, value, card, proposal) {
    if (!_reviewState) return;
    const entry = _reviewState.actions.find(function (a) { return a.id === actionId; });
    if (!entry) return;
    const action = proposal.actions.find(function (a) { return a.id === actionId; });
    if (!action) return;
    let edited = entry.editedArgs ? JSON.parse(JSON.stringify(entry.editedArgs)) : JSON.parse(JSON.stringify(entry.originalArgs || {}));
    switch (field) {
      case 'text':
        if (action.type === 'create_task') edited.text = value;
        else if (action.type === 'update_task') { if (!edited.changes) edited.changes = {}; edited.changes.text = value; }
        break;
      case 'date': edited.date = value || undefined; break;
      case 'start': edited.start = value || undefined; break;
      case 'duration': {
        const numVal = value ? Number(value) : null;
        if (action.type === 'update_task') { if (!edited.changes) edited.changes = {}; edited.changes.duration = numVal; }
        else edited.duration = numVal;
        break;
      }
      case 'priority':
        if (action.type === 'create_task') edited.priority = (value === 'high');
        else if (action.type === 'update_task') { if (!edited.changes) edited.changes = {}; edited.changes.priority = (value === 'high'); }
        break;
    }
    entry.editedArgs = edited;
    _reviewState.dirty = true;
    entry._editValid = _validateEditArgs(action.type, edited).valid;
    _refreshReviewUI(card, proposal);
  }

  /** Reset one action to original args */
  function _resetEdit(actionId, card, proposal) {
    if (!_reviewState) return;
    const entry = _reviewState.actions.find(function (a) { return a.id === actionId; });
    if (!entry) return;
    entry.editedArgs = null;
    entry._editValid = true;
    _refreshReviewUI(card, proposal);
  }

  /** Apply edits to proposal clone (returns modified proposal) */
  function _applyEditsToProposal(proposal) {
    if (!_reviewState || !_reviewState.dirty) return proposal;
    const modified = JSON.parse(JSON.stringify(proposal));
    modified.actions = modified.actions.map(function (a) {
      const entry = _reviewState.actions.find(function (ra) { return ra.id === a.id; });
      if (entry && entry.editedArgs) a.args = JSON.parse(JSON.stringify(entry.editedArgs));
      return a;
    });
    return modified;
  }

  /* ================================================================
   Phase 6F: Conversational Proposal Refinement
   ================================================================ */

  /** Snapshot current state for undo history */
  function _snapshotReviewState() {
    if (!_reviewState) return null;
    return JSON.parse(JSON.stringify(_reviewState.actions.map(function (a) {
      return { id: a.id, selected: a.selected, editedArgs: a.editedArgs };
    })));
  }

  /** Push undo checkpoint */
  function _pushUndo() {
    if (!_reviewState) return;
    const snap = _snapshotReviewState();
    if (snap) {
      if (!_reviewState._history) _reviewState._history = [];
      _reviewState._history.push(snap);
      if (_reviewState._history.length > 5) _reviewState._history.shift();
      _reviewState.revision = (_reviewState.revision || 0) + 1;
    }
  }

  /** Parse human index to action index (0-based) */
  function _parseHumanIndex(s, actionsLen) {
    if (!s) return -1;
    const m = String(s).trim().toLowerCase();
    if (m === 'đầu' || m === 'first' || m === '1st' || m === '1') return 0;
    if (m === 'cuối' || m === 'last') return actionsLen - 1;
    const n = parseInt(m, 10);
    if (!isNaN(n) && n >= 1 && n <= actionsLen) return n - 1;
    return -1;
  }

  /** Phase 6G: Allocate next proposal-local action ID */
  function _nextProposalActionId(actions) {
    let maxNum = 0;
    (actions || []).forEach(function (a) {
      const m = (a.id || '').match(/^a(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    return 'a' + (maxNum + 1);
  }

  /** Phase 6G: Parse simple add command deterministically */
  function _parseSimpleAdd(message) {
    if (!message) return null;
    const s = String(message).trim();
    // "Thêm task X 30 phút" or "Thêm việc X"
    const match = s.match(/(?:thêm|add|tạo\s+thêm|create)\s+(?:task|việc)?\s*(.+?)(?:\s+(\d+)\s*phút)?$/i);
    if (match) {
      const text = match[1].trim().replace(/\s+\d+\s*phút$/, '').trim();
      const duration = match[2] ? parseInt(match[2], 10) : null;
      if (text && text.length > 0 && text.length <= 300) {
        return {
          op: 'add',
          action: {
            type: 'create_task',
            args: { text: text, date: null, duration: duration || null, priority: null }
          }
        };
      }
    }
    return null;
  }

  /** Phase 6G: Add action to working proposal */
  function _addExpansionAction(op, proposal) {
    if (!op || !op.action) return { ok: false, reason: 'no-action' };
    if (!_reviewState) return { ok: false, reason: 'no-review' };
    const actions = _reviewState.actions;

    // Check max cap
    const maxActions = 10;
    if (actions.length >= maxActions) return { ok: false, reason: 'too-many-actions' };

    // Allocate ID
    const actionId = _nextProposalActionId(actions);
    const action = op.action;
    action.id = actionId;

    // Map temp references
    if (op.tempId && proposal) {
      proposal.actions.forEach(function (a) { if (a.id === op.tempId) a.id = actionId; });
    }

    // Create new review entry
    actions.push({
      id: actionId,
      selected: true,
      editedArgs: null,
      originalArgs: JSON.parse(JSON.stringify(action.args || {})),
      isDependent: false,
      isNew: true,
    });

    return { ok: true, actionId: actionId };
  }

  /** Phase 6G: Handle expansion request */
  function handleExpansion(message, msgs, card, proposal) {
    if (!message || !_reviewState) return null;
    const msgsEl = msgs || (typeof document !== 'undefined' ? document.getElementById('chatMessages') : null);

    // Classify
    if (typeof window === 'undefined' || !window.TaskFlowAIIntent) return null;
    const intent = window.TaskFlowAIIntent.classifyProposalMessage(message);
    if (intent.kind !== 'expand') return null;

    // Try simple local add first
    if (intent.operationHint === 'add') {
      const parsed = _parseSimpleAdd(message);
      if (parsed) {
        _pushUndo();
        const result = _addExpansionAction(parsed, proposal);
        const b = _bubble('agent-info');
        if (result.ok) {
          b.textContent = _t('expansionAdded').replace('{n}', '1');
          if (card) _refreshReviewUI(card, proposal);
        } else {
          b.textContent = _t('expansionFailed');
        }
        if (msgsEl) { msgsEl.appendChild(b); msgsEl.scrollTop = msgsEl.scrollHeight; }
        return { handled: true, reply: result.ok ? 'added' : result.reason };
      }
    }

    // Complex decomposition/add — needs AI
    // For now, show placeholder
    const b = _bubble('agent-info');
    b.textContent = _t('expansionComplex');
    if (msgsEl) { msgsEl.appendChild(b); msgsEl.scrollTop = msgsEl.scrollHeight; }
    return { handled: true, reply: 'expansion-ai-needed' };
  }

  /** Apply a single operation to review state */
  function _applyOperation(op, card, proposal) {
    if (!_reviewState || !op) return { ok: false, reason: 'no-review' };
    const actions = _reviewState.actions;
    if (!actions || !actions.length) return { ok: false, reason: 'no-actions' };

    if (op.op === 'select') {
      const idx = _parseHumanIndex(op.index, actions.length);
      if (idx < 0) return { ok: false, reason: 'invalid-index' };
      actions[idx].selected = true;
      return { ok: true, summary: 'Đã chọn việc ' + (idx + 1) };
    }
    if (op.op === 'deselect') {
      const idx = _parseHumanIndex(op.index, actions.length);
      if (idx < 0) return { ok: false, reason: 'invalid-index' };
      actions[idx].selected = false;
      _propagateDeselect(actions, proposal);
      return { ok: true, summary: 'Đã bỏ việc ' + (idx + 1) };
    }
    if (op.op === 'select-all') {
      actions.forEach(function (a) { a.selected = true; });
      return { ok: true, summary: 'Đã chọn tất cả' };
    }
    if (op.op === 'deselect-all') {
      actions.forEach(function (a) { a.selected = false; });
      return { ok: true, summary: 'Đã bỏ tất cả' };
    }
    if (op.op === 'select-only') {
      const indexes = (op.indexes || '').split(',').map(function (s) { return _parseHumanIndex(s, actions.length); }).filter(function (i) { return i >= 0; });
      if (!indexes.length) return { ok: false, reason: 'invalid-indexes' };
      actions.forEach(function (a, i) { a.selected = indexes.indexOf(i) !== -1; });
      return { ok: true, summary: 'Đã giữ ' + indexes.length + ' việc' };
    }
    if (op.op === 'set') {
      const entry = actions.find(function (a) { return a.id === op.actionId; });
      if (!entry) return { ok: false, reason: 'unknown-action' };
      if (['duration', 'date', 'text', 'priority', 'start'].indexOf(op.field) === -1) return { ok: false, reason: 'invalid-field' };
      if (!entry.editedArgs) entry.editedArgs = JSON.parse(JSON.stringify(entry.originalArgs || {}));
      entry.editedArgs[op.field] = op.value;
      _reviewState.dirty = true;
      return { ok: true, summary: 'Đã đổi ' + op.field + ' của ' + op.actionId };
    }
    if (op.op === 'bulk-set') {
      const field = op.field;
      const value = op.value;
      if (['duration', 'date', 'priority'].indexOf(field) === -1) return { ok: false, reason: 'invalid-field' };
      let count = 0;
      actions.forEach(function (a) {
        if (!a.selected) return;
        if (!a.editedArgs) a.editedArgs = JSON.parse(JSON.stringify(a.originalArgs || {}));
        a.editedArgs[field] = value;
        count++;
      });
      _reviewState.dirty = count > 0;
      return { ok: true, summary: 'Đã đổi ' + field + ' cho ' + count + ' việc' };
    }
    if (op.op === 'filter-date') {
      actions.forEach(function (a) {
        const args = a.editedArgs || a.originalArgs || {};
        a.selected = !!args.date;
      });
      _propagateDeselect(actions, proposal);
      return { ok: true, summary: 'Đã giữ việc có deadline' };
    }
    // Phase 6G: add operation
    if (op.op === 'add') {
      return _addExpansionAction(op, proposal);
    }
    return { ok: false, reason: 'unknown-op' };
  }

  /** Propagate deselection to dependents (P13) */
  function _propagateDeselect(actions, proposal) {
    if (!proposal || !Array.isArray(proposal.actions)) return;
    const depGraph = {};
    proposal.actions.forEach(function (a) {
      if (a.args && a.args.taskRef && a.args.taskRef.kind === 'action' && a.args.taskRef.actionId) {
        if (!depGraph[a.args.taskRef.actionId]) depGraph[a.args.taskRef.actionId] = [];
        depGraph[a.args.taskRef.actionId].push(a.id);
      }
    });
    let changed = true;
    while (changed) {
      changed = false;
      actions.forEach(function (a) {
        if (a.selected) return;
        (depGraph[a.id] || []).forEach(function (childId) {
          const child = actions.find(function (c) { return c.id === childId; });
          if (child && child.selected) { child.selected = false; changed = true; }
        });
      });
    }
  }

  /** Apply multiple operations from complex refinement */
  function _applyOperations(ops, card, proposal) {
    if (!Array.isArray(ops)) return { ok: false, summary: 'No operations' };
    const results = [];
    for (let i = 0; i < ops.length && i < 20; i++) {
      results.push(_applyOperation(ops[i], card, proposal));
    }
    const ok = results.filter(function (r) { return r.ok; });
    return { ok: ok.length > 0, summary: ok.map(function (r) { return r.summary; }).join('; ') };
  }

  /** Undo last refinement (P45) */
  function _undoRefinement(card, proposal) {
    if (!_reviewState || !_reviewState._history || !_reviewState._history.length) return false;
    const snap = _reviewState._history.pop();
    if (!snap) return false;
    snap.forEach(function (s) {
      const entry = _reviewState.actions.find(function (a) { return a.id === s.id; });
      if (entry) { entry.selected = s.selected; entry.editedArgs = s.editedArgs; }
    });
    _reviewState.revision = (_reviewState.revision || 0) + 1;
    if (card) _refreshReviewUI(card, proposal);
    return true;
  }

  /** Reset to original proposal (P46) */
  function _resetToOriginal(card) {
    if (!_reviewState || !_reviewState.originalProposal) return false;
    const orig = _reviewState.originalProposal;
    _reviewState.actions = orig.actions.map(function (a) {
      return { id: a.id, selected: true, editedArgs: null, originalArgs: JSON.parse(JSON.stringify(a.args || {})), isDependent: false };
    });
    _reviewState.dirty = false;
    _reviewState._history = [];
    _reviewState.revision = (_reviewState.revision || 0) + 1;
    if (card) _refreshReviewUI(card, _reviewState.originalProposal);
    return true;
  }

  /** Check if a message is a confirm-bypass attempt (P22-P23) */
  function _isConfirmAttempt(message) {
    if (typeof window !== 'undefined' && window.TaskFlowAIIntent && typeof window.TaskFlowAIIntent.classifyProposalMessage === 'function') {
      return window.TaskFlowAIIntent.classifyProposalMessage(message).kind === 'confirm-attempt';
    }
    return /(?:áp\s+dụng|tạo\s+làm|confirm|execute|apply|ship\s+it)/i.test(message);
  }

  /** Handle refinement message (called from chat.js) */
  function handleRefinement(message, msgs, card, proposal) {
    if (!message || !_reviewState) return null;
    const msgsEl = msgs || (typeof document !== 'undefined' ? document.getElementById('chatMessages') : null);

    // P22: confirm bypass protection
    if (_isConfirmAttempt(message)) {
      const b = _bubble('agent-info');
      b.textContent = _t('reviewConfirmBypass');
      if (msgsEl) { msgsEl.appendChild(b); msgsEl.scrollTop = msgsEl.scrollHeight; }
      return { handled: true, reply: _t('reviewConfirmBypass') };
    }

    // Classify the message
    if (typeof window === 'undefined' || !window.TaskFlowAIIntent) return null;
    const intent = window.TaskFlowAIIntent.classifyProposalMessage(message);
    if (intent.kind === 'expand') {
      return handleExpansion(message, msgs, card, proposal);
    }
    if (intent.kind !== 'refine' && intent.kind !== 'cancel' && intent.kind !== 'question') return null;

    // P24: cancel
    if (intent.kind === 'cancel') {
      if (card) _cancelCard(card, msgsEl);
      return { handled: true, reply: _t('reviewCancelled') };
    }

    // P25: question → answer from explainability
    if (intent.kind === 'question') {
      const b = _bubble('agent-info');
      b.textContent = message;
      if (msgsEl) { msgsEl.appendChild(b); msgsEl.scrollTop = msgsEl.scrollHeight; }
      return { handled: true, reply: message };
    }

    // P33: add-blocked
    if (intent.operationHint === 'add-blocked') {
      const b = _bubble('agent-info');
      b.textContent = _t('reviewAddBlocked');
      if (msgsEl) { msgsEl.appendChild(b); msgsEl.scrollTop = msgsEl.scrollHeight; }
      return { handled: true, reply: _t('reviewAddBlocked') };
    }

    // Push undo before applying
    _pushUndo();

    // Build operations from local intent
    const ops = _buildOpsFromIntent(intent, message);
    const result = _applyOperations(ops, card, proposal);

    // Show change summary
    const b = _bubble('agent-info');
    b.textContent = result.ok ? (_t('reviewUpdated') + ' ' + result.summary) : _t('reviewRefineFailed');
    if (msgsEl) { msgsEl.appendChild(b); msgsEl.scrollTop = msgsEl.scrollHeight; }

    // Refresh card
    if (card) _refreshReviewUI(card, proposal);

    return { handled: true, reply: result.summary };
  }

  /** Build operations from local intent classification */
  function _buildOpsFromIntent(intent, message) {
    const hint = intent.operationHint;
    if (!hint) return [];
    if (hint === 'select-all') return [{ op: 'select-all' }];
    if (hint === 'deselect-all') return [{ op: 'deselect-all' }];
    if (hint === 'filter-date') return [{ op: 'filter-date' }];

    // Parse index from message
    const indexMatch = message.match(/(\d+|đầu|cuối|first|last)/i);
    const idx = indexMatch ? indexMatch[1] : null;

    if (hint === 'select') return [{ op: 'select', index: idx }];
    if (hint === 'deselect') return [{ op: 'deselect', index: idx }];
    if (hint === 'select-only') {
      const indexes = message.match(/\d+/g) || [];
      return [{ op: 'select-only', indexes: indexes.join(',') }];
    }
    if (hint === 'single-edit') {
      const match = message.match(/(?:đổi|thay\s+đổi|set|change)\s+(?:task|việc)?\s*(?:thứ\s+)?(\d+|đầu|cuối)\s+(?:thành|to)\s*(.+)/i);
      if (match) {
        const actIdx = _parseHumanIndex(match[1], _reviewState ? _reviewState.actions.length : 3);
        if (actIdx >= 0 && _reviewState) {
          const entry = _reviewState.actions[actIdx];
          const val = match[2].trim().replace(/phút$/, '').trim();
          const numVal = parseInt(val, 10);
          if (!isNaN(numVal) && numVal > 0) {
            return [{ op: 'set', actionId: entry.id, field: 'duration', value: numVal }];
          }
          return [{ op: 'set', actionId: entry.id, field: 'text', value: val }];
        }
      }
      return [];
    }
    if (hint === 'bulk-set') {
      const match = message.match(/(?:đổi|set|change|đặt)\s+(?:tất\s+cả|all|các|những)\s+(?:task|việc|action)?\s*(?:thành|to|into)\s*(.+)/i);
      if (match) {
        const val = match[1].trim();
        const numVal = parseInt(val.replace(/phút$/, '').trim(), 10);
        if (!isNaN(numVal) && numVal > 0) return [{ op: 'bulk-set', field: 'duration', value: numVal }];
        const dateMatch = val.match(/(\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?)/);
        if (dateMatch) return [{ op: 'bulk-set', field: 'date', value: dateMatch[1] }];
      }
      return [];
    }
    if (hint === 'reorder') return [];
    return [];
  }

  /** Editable fields per action type */
  function _editableFields(actionType) {
    switch (actionType) {
      case 'create_task': return ['text', 'date', 'duration', 'priority'];
      case 'schedule_task': case 'reschedule_task': return ['date', 'start', 'duration'];
      case 'update_task': return ['text', 'date', 'duration', 'priority'];
      case 'complete_task': return [];
      default: return [];
    }
  }

  /** Build update diff display for update_task */
  function _buildUpdateDiff(args, originalArgs) {
    const diffs = [];
    if (!args || !originalArgs) return diffs;
    const ch = args.changes || {};
    const orig = originalArgs.changes || {};
    if (ch.text !== undefined && ch.text !== (orig.text || originalArgs.text)) {
      diffs.push({ label: _t('reviewFieldName'), old: orig.text || originalArgs.text || '', new: ch.text || '' });
    }
    if (ch.duration !== undefined && ch.duration !== orig.duration) {
      const oldD = orig.duration != null ? orig.duration : originalArgs.duration;
      diffs.push({ label: _t('reviewFieldDuration'), old: oldD != null ? String(oldD) + ' phút' : '—', new: ch.duration != null ? String(ch.duration) + ' phút' : '—' });
    }
    if (ch.priority !== undefined && ch.priority !== orig.priority) {
      const oldP = orig.priority !== undefined ? orig.priority : originalArgs.priority;
      diffs.push({ label: _t('reviewFieldPriority'), old: oldP ? _t('reviewPriorityHigh') : _t('reviewPriorityNormal'), new: ch.priority ? _t('reviewPriorityHigh') : _t('reviewPriorityNormal') });
    }
    return diffs;
  }

  /* ---- UI building (textContent only — no innerHTML with model data) ---- */
  function _bubble(className) {
    const el = document.createElement('div');
    el.className = 'chat-msg bot ' + className;
    return el;
  }

  /* Group changes by dependency for preview (Phase 4C).
     Input must be canonical Agent actions: { id, type, args }.
     Do NOT pass dryRun().changes here — dry.changes uses a
     flattened preview shape without args.
     Phase P0: delegates to TaskFlowAIAgent.previewAction() for
     canonical preview text (TYPE_TITLES, dateLabel, minutesLabel,
     taskLabel live in ai-agent.js — NOT duplicated here). */
  function _groupChangesForPreview(changes, virtualEntities, context) {
    // Build a map of actionId -> action
    const actionMap = new Map();
    changes.forEach((ch) => {
      if (ch.id) actionMap.set(ch.id, ch);
    });

    // Group: for each change, show its dependencies first
    const grouped = [];
    const processed = new Set();

    function processChange(actionId) {
      if (processed.has(actionId)) return;
      const ch = actionMap.get(actionId);
      if (!ch) return;
      // Process dependencies first — dependency lives in args.taskRef
      const ref = ch.args && ch.args.taskRef ? ch.args.taskRef : null;
      if (ref && ref.kind === 'action') {
        processChange(ref.actionId);
      }
      grouped.push(ch);
      processed.add(actionId);
    }

    changes.forEach((ch) => processChange(ch.id));

    // Add any remaining
    changes.forEach((ch) => {
      if (!processed.has(ch.id)) grouped.push(ch);
    });

    // Delegate preview text to canonical TaskFlowAIAgent.previewAction()
    const hasPreviewAction = window.TaskFlowAIAgent
      && typeof window.TaskFlowAIAgent.previewAction === 'function';

    // Build proposal-local actionIdSet so dependent actions resolve
    const actionIdSet = new Set(changes.map((c) => c.id));

    return grouped.map((ch) => {
      let title = '';
      let description = '';
      let meta = '';

      if (hasPreviewAction) {
        try {
          const result = window.TaskFlowAIAgent.previewAction(ch, context, virtualEntities, actionIdSet);
          if (result && result.ok && result.preview) {
            title = result.preview.title || '';
            description = result.preview.description || '';
            meta = result.preview.meta || '';
          }
        } catch (_e) { /* preview must never break review render */ }
      }

      // Fallback if previewAction unavailable or failed
      if (!title) {
        const lang = context && context.lang === 'en' ? 'en' : 'vi';
        title = lang === 'en' ? ch.type : ch.type;
        description = '';
        meta = '';
      }

      const ref = ch.args && ch.args.taskRef ? ch.args.taskRef : null;
      const isDependent = !!(ref && ref.kind === 'action');

      return { title, description, meta, isDependent, actionId: ch.id };
    });
  }

  /** Phase 5C: Re-render card for review state changes.
      Pass the real chat message container (card.parentNode) as msgs
      so Confirm/Cancel handlers capture a valid appendChild target. */
  function _refreshReviewUI(card, proposal) {
    if (!card || !_reviewState) return;
    const parent = card.parentNode;
    const dry = _reviewState._dry || null;
    // Phase P0: pass parent (chat container) as msgs, not null
    const newCard = _renderCardFull(parent, proposal, dry);
    if (newCard && parent) {
      parent.replaceChild(newCard, card);
      newCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /** Phase 5C: Full card renderer with selection/edit/summary */
  function _renderCardFull(msgs, proposal, dry) {
    // Phase P0: preserve dry.virtualEntities from dryRun (not a fresh Map)
    const virtualEntities = dry && dry.virtualEntities ? dry.virtualEntities : new Map();
    const ctx = buildContext();
    const grouped = _groupChangesForPreview(proposal.actions, virtualEntities, ctx);
    const card = _bubble('agent-card');
    card.setAttribute('data-testid', 'agent-card');

    const head = document.createElement('div');
    head.className = 'agent-card-head';
    head.textContent = _t('agentProposeTitle');
    card.appendChild(head);

    // Phase 6E: Data-used summary (P14-P16)
    if (window.TaskFlowAIExplainability) {
      try {
        const ctx = buildContext();
        const used = window.TaskFlowAIExplainability.buildContextUsageSummary(ctx, {
          fileSource: _reviewState && _reviewState._source === 'file' ? { name: _reviewState._fileName || '' } : null,
          preferenceData: null,
          hasReflection: false,
          hasMood: false,
        });
        const summaryText = window.TaskFlowAIExplainability.formatContextUsageSummary(used, 'vi');
        const usageEl = document.createElement('div');
        usageEl.className = 'agent-data-used';
        usageEl.setAttribute('data-testid', 'review-data-used');
        usageEl.textContent = summaryText;
        card.appendChild(usageEl);
      } catch (e) { /* explainability must never break review */ }
    }

    const rs = _reviewState;
    const depInfo = _buildDepGraph(proposal);

    // Select all/none controls (3+ actions)
    if (grouped.length >= 3 && rs) {
      const selCtrl = document.createElement('div');
      selCtrl.className = 'agent-select-controls';
      const selAllBtn = document.createElement('button');
      selAllBtn.type = 'button';
      selAllBtn.className = 'agent-select-btn';
      selAllBtn.textContent = _t('reviewSelectAll');
      selAllBtn.addEventListener('click', function () { _selectAll(card, proposal); });
      const deselBtn = document.createElement('button');
      deselBtn.type = 'button';
      deselBtn.className = 'agent-select-btn';
      deselBtn.textContent = _t('reviewDeselectAll');
      deselBtn.addEventListener('click', function () { _deselectAll(card, proposal); });
      selCtrl.appendChild(selAllBtn);
      selCtrl.appendChild(deselBtn);
      card.appendChild(selCtrl);
    }

    const body = document.createElement('div');
    body.className = 'agent-card-body';

    grouped.forEach((g, idx) => {
      const entry = rs ? rs.actions.find(a => a.id === g.actionId) : null;
      const action = proposal.actions.find(a => a.id === g.actionId);
      const isSelected = entry ? entry.selected : true;

      const rowWrap = document.createElement('div');
      rowWrap.className = 'agent-row' + (g.isDependent ? ' agent-row-dependent' : '') + (isSelected ? '' : ' disabled-row');
      rowWrap.setAttribute('data-action-id', g.actionId);
      rowWrap.setAttribute('data-testid', 'review-action-' + g.actionId);

      // Select row (checkbox + info)
      const selectRow = document.createElement('div');
      selectRow.className = 'agent-row-select';

      const cb = document.createElement('button');
      cb.type = 'button';
      cb.className = 'agent-checkbox';
      cb.setAttribute('role', 'checkbox');
      cb.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      cb.setAttribute('aria-label', g.title + ' ' + (g.description || ''));
      cb.setAttribute('data-testid', 'review-checkbox-' + g.actionId);
      if (entry) cb.addEventListener('click', function () { _toggleAction(g.actionId, card, proposal); });

      const info = document.createElement('div');
      info.className = 'agent-row-info';

      const titleEl = document.createElement('span');
      titleEl.className = 'agent-row-title';
      titleEl.textContent = (idx + 1) + '. ' + g.title;
      if (g.isDependent) {
        const depBadge = document.createElement('span');
        depBadge.className = 'agent-dep-badge';
        depBadge.textContent = '→';
        titleEl.appendChild(depBadge);
      }

      const descEl = document.createElement('span');
      descEl.className = 'agent-row-desc';
      descEl.textContent = g.description || '';

      const metaEl = document.createElement('span');
      metaEl.className = 'agent-row-meta';
      metaEl.textContent = g.meta || '';

      info.appendChild(titleEl);
      info.appendChild(descEl);
      info.appendChild(metaEl);

      // Update diff display
      if (action && action.type === 'update_task' && isSelected) {
        const diffArgs = (entry && entry.editedArgs) || action.args;
        const diffs = _buildUpdateDiff(diffArgs, entry ? entry.originalArgs : action.args);
        if (diffs.length > 0) {
          const diffEl = document.createElement('div');
          diffEl.className = 'agent-update-diff';
          diffs.forEach(function (d) {
            const row = document.createElement('div');
            row.className = 'agent-diff-row';
            row.appendChild(Object.assign(document.createElement('span'), { className: 'agent-diff-label', textContent: d.label + ': ' }));
            row.appendChild(Object.assign(document.createElement('span'), { className: 'agent-diff-old', textContent: d.old }));
            row.appendChild(Object.assign(document.createElement('span'), { className: 'agent-diff-arrow', textContent: ' → ' }));
            row.appendChild(Object.assign(document.createElement('span'), { className: 'agent-diff-new', textContent: d.new }));
            diffEl.appendChild(row);
          });
          info.appendChild(diffEl);
        }
      }

      selectRow.appendChild(cb);
      selectRow.appendChild(info);
      rowWrap.appendChild(selectRow);

      // Inline edit button (only for selected actions with editable fields)
      if (isSelected && action && rs) {
        const editableFields = _editableFields(action.type);
        if (editableFields.length > 0) {
          const editBtnRow = document.createElement('div');
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'agent-edit-btn';
          editBtn.textContent = _t('reviewEdit');
          editBtn.setAttribute('data-testid', 'review-edit-' + g.actionId);
          let editPanelVisible = false;
          let editPanel = null;
          editBtn.addEventListener('click', function () {
            if (editPanelVisible && editPanel) { editPanel.style.display = 'none'; editPanelVisible = false; editBtn.textContent = _t('reviewEdit'); return; }
            if (editPanel) { editPanel.style.display = ''; editPanelVisible = true; editBtn.textContent = _t('reviewEdit') + ' ▲'; return; }
            editPanel = document.createElement('div');
            editPanel.className = 'agent-edit-panel';
            editPanel.setAttribute('data-testid', 'review-edit-panel-' + g.actionId);
            const currentArgs = (entry && entry.editedArgs) || (action ? action.args : {});
            function addField(fieldId, label, value, inputType) {
              const row = document.createElement('div');
              row.className = 'agent-edit-row';
              const lbl = document.createElement('label');
              lbl.className = 'agent-edit-label';
              lbl.textContent = label;
              const inp = document.createElement('input');
              inp.type = inputType || 'text';
              inp.className = 'agent-edit-input';
              inp.value = value != null ? String(value) : '';
              inp.setAttribute('data-testid', 'review-edit-' + fieldId + '-' + g.actionId);
              inp.addEventListener('change', function () { _applyEdit(g.actionId, fieldId, inp.value, card, proposal); });
              inp.addEventListener('blur', function () { _applyEdit(g.actionId, fieldId, inp.value, card, proposal); });
              row.appendChild(lbl);
              row.appendChild(inp);
              editPanel.appendChild(row);
            }
            if (action.type === 'create_task') {
              addField('text', _t('reviewFieldName'), currentArgs.text);
              addField('date', _t('reviewFieldDate'), currentArgs.date, 'date');
              addField('duration', _t('reviewFieldDuration'), currentArgs.duration, 'number');
            } else if (action.type === 'schedule_task' || action.type === 'reschedule_task') {
              addField('date', _t('reviewFieldDate'), currentArgs.date, 'date');
              addField('start', _t('reviewFieldStart'), currentArgs.start, 'time');
              addField('duration', _t('reviewFieldDuration'), currentArgs.duration, 'number');
            } else if (action.type === 'update_task') {
              const ch = currentArgs.changes || {};
              addField('text', _t('reviewFieldName'), ch.text);
              addField('date', _t('reviewFieldDate'), ch.date, 'date');
              addField('duration', _t('reviewFieldDuration'), ch.duration, 'number');
            }
            if (entry && entry.editedArgs) {
              const resetBtn = document.createElement('button');
              resetBtn.type = 'button';
              resetBtn.className = 'agent-edit-reset';
              resetBtn.textContent = _t('reviewReset');
              resetBtn.addEventListener('click', function () { _resetEdit(g.actionId, card, proposal); });
              editPanel.appendChild(resetBtn);
            }
            rowWrap.appendChild(editPanel);
            editPanelVisible = true;
            editBtn.textContent = _t('reviewEdit') + ' ▲';
          });
          editBtnRow.appendChild(editBtn);
          rowWrap.appendChild(editBtnRow);
        }
      }

      // Phase 6E: 'Why?' button for action-level explanation (P5)
      if (isSelected && rs) {
        const whyBtnRow = document.createElement('div');
        whyBtnRow.className = 'agent-why-btn-row';
        const whyBtn = document.createElement('button');
        whyBtn.type = 'button';
        whyBtn.className = 'agent-why-btn';
        whyBtn.textContent = _t('reviewWhy');
        whyBtn.setAttribute('data-testid', 'review-why-' + g.actionId);
        whyBtn.setAttribute('aria-expanded', 'false');
        let whyPanelVisible = false;
        let whyPanel = null;
        whyBtn.addEventListener('click', function () {
          if (whyPanelVisible && whyPanel) { whyPanel.style.display = 'none'; whyPanelVisible = false; whyBtn.setAttribute('aria-expanded', 'false'); return; }
          if (whyPanel) { whyPanel.style.display = ''; whyPanelVisible = true; whyBtn.setAttribute('aria-expanded', 'true'); return; }
          // Build explanation from provenance
          whyPanel = document.createElement('div');
          whyPanel.className = 'agent-why-panel';
          whyPanel.setAttribute('data-testid', 'review-why-panel-' + g.actionId);
          whyPanel.setAttribute('role', 'region');
          whyPanel.setAttribute('aria-label', _t('reviewWhyTitle'));
          const titleEl = document.createElement('div');
          titleEl.className = 'agent-why-title';
          titleEl.textContent = _t('reviewWhyTitle');
          whyPanel.appendChild(titleEl);
          // Build factors
          if (window.TaskFlowAIExplainability && action) {
            const isEdited = entry && entry.editedArgs;
            const prov = window.TaskFlowAIExplainability.buildActionFactors(action, {
              proposal: proposal,
              ctx: dry ? dry._ctx : null,
              editState: isEdited,
              warnings: dry ? dry.warnings : null,
              fileSource: dry && dry._source === 'file' ? { kind: 'document', evidence: g.description || '', name: dry._fileName || '' } : null,
            });
            const explanation = window.TaskFlowAIExplainability.formatActionExplanation(prov, 'vi');
            const lines = explanation.split('\n');
            for (let li = 0; li < lines.length; li++) {
              const lineEl = document.createElement('div');
              lineEl.className = 'agent-why-line';
              lineEl.textContent = lines[li];
              whyPanel.appendChild(lineEl);
            }
          } else {
            const fallbackEl = document.createElement('div');
            fallbackEl.className = 'agent-why-line';
            fallbackEl.textContent = g.description || '';
            whyPanel.appendChild(fallbackEl);
          }
          rowWrap.appendChild(whyPanel);
          whyPanelVisible = true;
          whyBtn.setAttribute('aria-expanded', 'true');
        });
        whyBtnRow.appendChild(whyBtn);
        rowWrap.appendChild(whyBtnRow);
      }

      body.appendChild(rowWrap);
    });

    card.appendChild(body);

    // Warnings
    if (Array.isArray(dry ? dry.warnings : []) && (dry ? dry.warnings.length : 0)) {
      const warnBox = document.createElement('div');
      warnBox.className = 'agent-warns';
      dry.warnings.forEach((w) => {
        const wl = document.createElement('div');
        wl.className = 'agent-warn';
        wl.textContent = '⚠ ' + _warnText(w.code);
        warnBox.appendChild(wl);
      });
      card.appendChild(warnBox);
    }

    // Summary
    const selectedCount = rs ? _getSelectedIds().size : grouped.length;
    const summary = document.createElement('div');
    summary.className = 'agent-summary';
    summary.setAttribute('data-testid', 'review-summary');
    summary.textContent = _t('reviewSummary', { n: selectedCount });
    card.appendChild(summary);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'agent-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'agent-btn agent-cancel';
    cancelBtn.textContent = _t('agentCancel');
    cancelBtn.addEventListener('click', function () { _cancelCard(card, msgs); });
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'agent-btn agent-confirm';
    confirmBtn.setAttribute('data-testid', 'review-confirm');
    confirmBtn.textContent = selectedCount > 0
      ? (grouped.length === 1 ? _t('reviewApplyOne') : _t('reviewApplyN', { n: selectedCount }))
      : _t('reviewNoSelected');
    confirmBtn.disabled = selectedCount === 0;
    confirmBtn.addEventListener('click', function () { _confirmCard(card, msgs, proposal); });
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    card.appendChild(actions);

    card.setAttribute('aria-label', _t('agentProposeTitle'));
    return card;
  }

  /* _groupChangesForPreview contract: input must be canonical Agent actions
   * { id, type, args }. Do NOT pass dryRun().changes here — dry.changes
   * uses a flattened preview shape without args. */
  function _renderCard(msgs, proposal, dry, validationPolicy) {
    // Phase 5C: initialize review state on first render
    const virtualEntities = dry.virtualEntities || new Map();
    const grouped = _groupChangesForPreview(proposal.actions, virtualEntities, dry._ctx);
    _initReviewState(proposal, dry, grouped, validationPolicy);
    const card = _renderCardFull(msgs, proposal, dry);
    if (card) {
      msgs.appendChild(card);
      msgs.scrollTop = msgs.scrollHeight;
      const input = _el('chatInput');
      if (input && typeof input.focus === 'function') input.focus();
    }
    return card;
  }

  function _cancelCard(card, msgs) {
    // Capture proposalId BEFORE clearing review state
    const proposalId = _reviewState && _reviewState.proposalId ? _reviewState.proposalId : null;
    _clearReviewState();
    // Discard pending document-daily-plan cursor on cancel
    try {
      if (proposalId && window.TaskFlowDocumentDailyPlan && typeof window.TaskFlowDocumentDailyPlan.cancelPendingCursor === 'function') {
        window.TaskFlowDocumentDailyPlan.cancelPendingCursor(proposalId);
      }
    } catch (e) { /* cancel must never break */ }
    if (!card || !card.parentNode) return;
    card.parentNode.removeChild(card);
    const input = _el('chatInput');
    if (input && typeof input.focus === 'function') input.focus();
  }

  /* ---- Locate task across current month grid + inbox ---- */
  function _locate(uid) {
    if (!uid) return null;
    try {
      if (typeof state !== 'undefined' && state && Array.isArray(state.weeks)) {
        for (let w = 0; w < state.weeks.length; w++) {
          const week = state.weeks[w];
          if (!week || !Array.isArray(week.days)) continue;
          for (let di = 0; di < week.days.length; di++) {
            const day = week.days[di];
            if (!day || !Array.isArray(day.tasks)) continue;
            for (let i = 0; i < day.tasks.length; i++) {
              if (day.tasks[i] && day.tasks[i].uid === uid) return { scope: 'month', week: w, day: di, idx: i, tk: day.tasks[i] };
            }
          }
        }
      }
    } catch (e) { /* */ }
    try {
      if (typeof inbox !== 'undefined' && Array.isArray(inbox)) {
        for (let i = 0; i < inbox.length; i++) {
          if (inbox[i] && inbox[i].uid === uid) return { scope: 'inbox', idx: i, tk: inbox[i] };
        }
      }
    } catch (e) { /* */ }
    return null;
  }

  /* ---- Target day for a create date within the current plan month ---- */
  function _targetDayForDate(dateStr) {
    if (!dateStr) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    let planY, planM;
    try {
      if (typeof PLAN_YEAR === 'undefined' || typeof PLAN_MONTH === 'undefined') return null;
      planY = PLAN_YEAR; planM = PLAN_MONTH; // 0-based month
    } catch (e) { return null; }
    if (y !== planY || mo !== planM + 1) return null; // outside current month → inbox
    const target = d + '/' + mo;
    try {
      for (let w = 0; w < state.weeks.length; w++) {
        const week = state.weeks[w];
        if (!week || !Array.isArray(week.days)) continue;
        for (let di = 0; di < week.days.length; di++) {
          const day = week.days[di];
          if (day && day.date === target && (day.yy === undefined || day.yy === y % 100)) {
            return { week: w, day: di };
          }
        }
      }
    } catch (e) { /* */ }
    return null;
  }

  function _todayDayRef() {
    try {
      if (window.TaskFlowClock && typeof window.TaskFlowClock.resolveTodayCell === 'function') {
        const cell = window.TaskFlowClock.resolveTodayCell({
          planStart: PLAN_START, numDays: NUM_DAYS, year: PLAN_YEAR, month: PLAN_MONTH, weeks: state.weeks,
        });
        if (cell && cell.inPlanMonth && cell.day && cell.weekIndex !== undefined && cell.dayIndex !== undefined) {
          return { week: cell.weekIndex, day: cell.dayIndex };
        }
      }
    } catch (e) { /* */ }
    return null;
  }

  function _endClock(start, duration) {
    const m = /^(\d{2}):(\d{2})$/.exec(start);
    if (!m || typeof duration !== 'number' || !Number.isFinite(duration) || duration < 1) return null;
    const endMin = (+m[1]) * 60 + (+m[2]) + Math.floor(duration);
    if (endMin >= 24 * 60) return null; // no cross-midnight scheduling
    return String(Math.floor(endMin / 60)).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0');
  }

  /* ---- Task label resolver (handles virtual entities) ---- */
  function _taskLabelFromRef(taskRef, context, virtualEntities, actionIdToRealUid) {
    if (!taskRef) return null;
    if (taskRef.kind === 'action') {
      // First check if we have a real UID mapping from a completed create_task
      if (actionIdToRealUid && actionIdToRealUid.has(taskRef.actionId)) {
        const realUid = actionIdToRealUid.get(taskRef.actionId);
        return taskLabel(context, realUid) || virtualEntities?.get(taskRef.actionId)?.text || 'công việc';
      }
      // Fallback to virtual entity text
      return virtualEntities?.get(taskRef.actionId)?.text || 'công việc';
    }
    return taskLabel(context, taskRef.uid);
  }

  /* ---- Apply: canonical TaskFlow mutation APIs only (P13-P18) ---- */
  function _pushTask(dayRef, task) {
    const day = state.weeks[dayRef.week].days[dayRef.day];
    day.tasks.push(task);
  }

  function _applyCreate(action, actionIdToRealUid) {
    const args = action.args;
    const text = (args.text || '').trim();
    if (!text) return { status: 'failed' };
    let dayRef = null;
    let targetDate = args.date || null;
    if (targetDate) dayRef = _targetDayForDate(targetDate);
    if (!dayRef) {
      const todayRef = _todayDayRef();
      if (todayRef && (!targetDate || targetDate === _todayStr())) dayRef = todayRef;
    }
    const task = {
      uid: (typeof newTaskUid === 'function') ? newTaskUid() : 'agent_' + Date.now().toString(36),
      kind: args.priority === true ? 'priority' : 'regular',
      done: false,
      text: text,
      tags: [],
      linkedMetricIds: [],
      remind: { enabled: false, time: '20:00' },
    };
    if (targetDate) task.deadline = targetDate;
    if (args.duration !== undefined && args.duration !== null) task.duration = args.duration;
    if (args.projectId) task.projectId = args.projectId;
    if (args.milestoneId) task.milestoneId = args.milestoneId;
    if (dayRef) {
      _pushTask(dayRef, task);
    } else {
      try {
        if (typeof inbox === 'undefined' || !Array.isArray(inbox)) return { status: 'failed' };
        task.inbox = true;
        inbox.push(task);
        saveInbox(inbox);
      } catch (e) { return { status: 'failed' }; }
    }
    // Record the real UID for subsequent dependent actions
    if (actionIdToRealUid && action.id) {
      actionIdToRealUid.set(action.id, task.uid);
    }
    return { status: 'applied', taskUid: task.uid };
  }

  function _applyUpdate(action, actionIdToRealUid, context, virtualEntities) {
    const taskRef = action.args.taskRef;
    let realUid = null;
    if (taskRef.kind === 'existing') {
      realUid = taskRef.uid;
    } else if (actionIdToRealUid && actionIdToRealUid.has(taskRef.actionId)) {
      realUid = actionIdToRealUid.get(taskRef.actionId);
    } else if (virtualEntities && virtualEntities.has(taskRef.actionId)) {
      // Virtual entity - shouldn't happen for update on virtual, but handle gracefully
      return { status: 'skipped', reason: 'virtual-not-real' };
    }
    if (!realUid) return { status: 'skipped', reason: 'stale' };
    const ref = _locate(realUid);
    if (!ref) return { status: 'skipped', reason: 'stale' };
    const ch = action.args.changes || {};
    const tk = ref.tk;
    if (ch.text !== undefined && ch.text !== null) tk.text = ch.text;
    if (ch.priority !== undefined && ch.priority !== null) tk.kind = ch.priority === true ? 'priority' : 'regular';
    if (ch.duration !== undefined && ch.duration !== null) tk.duration = ch.duration;
    if (ch.date !== undefined) {
      if (ch.date === null) delete tk.deadline; else tk.deadline = ch.date;
    }
    if (ch.projectId !== undefined) {
      if (ch.projectId === null) delete tk.projectId; else tk.projectId = ch.projectId;
    }
    if (ch.milestoneId !== undefined) {
      if (ch.milestoneId === null) delete tk.milestoneId; else tk.milestoneId = ch.milestoneId;
    }
    return { status: 'applied' };
  }

  function _applyComplete(action, actionIdToRealUid, context, virtualEntities) {
    const taskRef = action.args.taskRef;
    let realUid = null;
    if (taskRef.kind === 'existing') {
      realUid = taskRef.uid;
    } else if (actionIdToRealUid && actionIdToRealUid.has(taskRef.actionId)) {
      realUid = actionIdToRealUid.get(taskRef.actionId);
    } else if (virtualEntities && virtualEntities.has(taskRef.actionId)) {
      return { status: 'skipped', reason: 'virtual-not-real' };
    }
    if (!realUid) return { status: 'skipped', reason: 'stale' };
    const ref = _locate(realUid);
    if (!ref) return { status: 'skipped', reason: 'stale' };
    if (ref.tk.done) return { status: 'skipped', reason: 'already-done' };
    ref.tk.done = true;
    try { if (typeof addXP === 'function') addXP(10); } catch (e) { /* */ }
    return { status: 'applied' };
  }

  function _applySchedule(action, isReschedule, actionIdToRealUid, context, virtualEntities) {
    const args = action.args;
    const taskRef = args.taskRef;
    let realUid = null;
    if (taskRef.kind === 'existing') {
      realUid = taskRef.uid;
    } else if (actionIdToRealUid && actionIdToRealUid.has(taskRef.actionId)) {
      realUid = actionIdToRealUid.get(taskRef.actionId);
    } else if (virtualEntities && virtualEntities.has(taskRef.actionId)) {
      return { status: 'skipped', reason: 'virtual-not-real' };
    }
    if (!realUid) return { status: 'skipped', reason: 'stale' };
    const ref = _locate(realUid);
    if (!ref) return { status: 'skipped', reason: 'stale' };
    const end = _endClock(args.start, args.duration);
    if (!end) return { status: 'skipped', reason: 'invalid-range' };
    let store;
    try { store = loadTimeBlocksStore(); } catch (e) { return { status: 'failed' }; }
    if (!store) store = { version: 1, blocks: [] };

    let existingId = null;
    if (isReschedule) {
      const b = (Array.isArray(store.blocks) ? store.blocks : []).find((x) => x && x.taskUid === realUid && x.status !== 'cancelled');
      if (b) existingId = b.id;
    }

    // P17/P18: re-run conflict check BEFORE applying.
    const TB = window.TaskFlowTimeBlocks;
    let conflict = false;
    if (TB && typeof TB.findOverlaps === 'function') {
      const hit = TB.findOverlaps(store, args.date, args.start, end, existingId);
      if (hit && hit.length) conflict = true;
    }
    if (conflict) return { status: 'skipped', reason: 'conflict' };

    try {
      if (existingId) {
        if (TB) TB.updateTimeBlock(store, existingId, { date: args.date, start: args.start, end, status: 'scheduled' });
      } else {
        if (TB) TB.createTimeBlock(store, { taskUid: realUid, date: args.date, start: args.start, end, status: 'scheduled' });
      }
      saveTimeBlocksStore(store);
    } catch (e) { return { status: 'failed' }; }
    return { status: 'applied' };
  }

  function _applyAction(action, actionIdToRealUid, context, virtualEntities) {
    switch (action.type) {
      case 'create_task': return _applyCreate(action, actionIdToRealUid);
      case 'update_task': return _applyUpdate(action, actionIdToRealUid, context, virtualEntities);
      case 'complete_task': return _applyComplete(action, actionIdToRealUid, context, virtualEntities);
      case 'schedule_task': return _applySchedule(action, false, actionIdToRealUid, context, virtualEntities);
      case 'reschedule_task': return _applySchedule(action, true, actionIdToRealUid, context, virtualEntities);
      default: return { status: 'failed' };
    }
  }

  /* ---- Result text (P20/P23) — accurate, no UID ---- */
  function _resultText(applied, skipped, failed, context, virtualEntities) {
    if (skipped + failed === 0) {
      if (applied === 1) return _t('agentAppliedDone', { n: applied });
      // For multi-step, try to give more descriptive text
      return _t('agentAppliedDone', { n: applied });
    }
    const parts = [];
    if (applied > 0) parts.push(_t('agentAppliedPart', { n: applied, total: applied + skipped + failed }));
    if (skipped > 0) parts.push(_t('agentSkippedPart', { n: skipped }));
    if (failed > 0) parts.push(_t('agentFailedPart', { n: failed }));
    return parts.join(' ');
  }

  let _applying = false;
  let _lastResult = null;

  /* ---- Phase 5C: confirm → selected subgraph revalidation → apply ---- */
  async function _confirmCard(card, msgs, proposal) {
    if (_applying || !card || !card.parentNode) return;
    _applying = true;
    const btns = card.querySelectorAll('button');
    btns.forEach((b) => { b.disabled = true; });

    try {
      // Phase 5C: determine selected actions
      const selectedIds = _getSelectedIds();
      if (selectedIds.size === 0) {
        const infoBubble = _bubble('agent-info');
        infoBubble.textContent = _t('reviewNoSelected');
        msgs.appendChild(infoBubble);
        msgs.scrollTop = msgs.scrollHeight;
        return;
      }

      // Phase 5C: apply user edits to proposal before revalidation
      const activeProposal = _applyEditsToProposal(proposal);

      // Filter proposal to only selected actions
      const selectedProposal = JSON.parse(JSON.stringify(activeProposal));
      selectedProposal.actions = selectedProposal.actions.filter(function (a) {
        return selectedIds.has(a.id);
      });

      // P22: revalidate selected subgraph against CURRENT state
      // Use the stored validation policy (e.g. fileImport for File-Agent proposals)
      const savedPolicy = _reviewState && _reviewState._validationPolicy ? _reviewState._validationPolicy : null;
      const ctx = buildContext();
      const v = window.TaskFlowAIAgent.validateProposal(selectedProposal, ctx, savedPolicy);
      if (!v.ok) {
        const errBubble = _bubble('agent-info');
        errBubble.textContent = _t('agentStaleConfirm');
        msgs.appendChild(errBubble);
        msgs.scrollTop = msgs.scrollHeight;
        _clearReviewState();
        if (card.parentNode) card.parentNode.removeChild(card);
        return;
      }
      const dry = window.TaskFlowAIAgent.dryRun(selectedProposal, ctx, savedPolicy);
      if (!dry.valid) {
        const errBubble = _bubble('agent-info');
        errBubble.textContent = _mapValidationError(dry.errors);
        msgs.appendChild(errBubble);
        msgs.scrollTop = msgs.scrollHeight;
        _clearReviewState();
        if (card.parentNode) card.parentNode.removeChild(card);
        return;
      }

      // P21: ONE undo checkpoint for the whole confirmed proposal.
      try { if (typeof pushUndo === 'function') pushUndo(); } catch (e) { /* */ }

      // Phase 4C: topological execution with runtime entity resolution
      const actionIdToRealUid = new Map();
      const virtualEntities = dry.virtualEntities || new Map();

      let executionOrder = [];
      if (dry.dependencyGraph) {
        // Use the canonical topologicalSort from TaskFlowAIAgent
        if (window.TaskFlowAIAgent && typeof window.TaskFlowAIAgent.topologicalSort === 'function') {
          executionOrder = window.TaskFlowAIAgent.topologicalSort(dry.dependencyGraph);
          if (!executionOrder) executionOrder = [];
        } else {
          // Fallback: inline Kahn's algorithm with correct DAG semantics
          const dag = dry.dependencyGraph;
          const inDegree = new Map();
          const nodes = Array.from(dag.keys());
          for (const node of nodes) inDegree.set(node, (dag.get(node) || new Set()).size);
          const queue = nodes.filter((n) => inDegree.get(n) === 0);
          while (queue.length) {
            const n = queue.shift();
            executionOrder.push(n);
            for (const [node, deps] of dag.entries()) {
              if (deps.has(n)) {
                const newDeg = inDegree.get(node) - 1;
                inDegree.set(node, newDeg);
                if (newDeg === 0) queue.push(node);
              }
            }
          }
        }
      }

      const actionMap = new Map();
      selectedProposal.actions.forEach((a) => actionMap.set(a.id, a));

      const applied = [], skipped = [], failed = [];
      for (const actionId of executionOrder) {
        const action = actionMap.get(actionId);
        if (!action) continue;
        const r = _applyAction(action, actionIdToRealUid, ctx, virtualEntities);
        if (r.status === 'applied') applied.push(action);
        else if (r.status === 'skipped') skipped.push({ action, reason: r.reason });
        else failed.push(action);
      }

      selectedProposal.actions.forEach((a) => {
        if (!executionOrder.includes(a.id)) {
          const r = _applyAction(a, actionIdToRealUid, ctx, virtualEntities);
          if (r.status === 'applied') applied.push(a);
          else if (r.status === 'skipped') skipped.push({ action: a, reason: r.reason });
          else failed.push(a);
        }
      });

      try { if (typeof save === 'function') save(); } catch (e) { /* */ }
      try {
        if (typeof renderCurrentView === 'function') renderCurrentView();
        else if (typeof renderToday === 'function') renderToday();
      } catch (e) { /* */ }

      // Capture proposalId AND source BEFORE clearing review state
      const _cursorProposalId = _reviewState && _reviewState.proposalId ? _reviewState.proposalId : null;
      const _cursorSource = _reviewState && _reviewState.source ? _reviewState.source : null;
      _clearReviewState();
      if (card.parentNode) card.parentNode.removeChild(card);
      // Commit pending document-daily-plan cursor ONLY on full success
      try {
        if (_cursorProposalId && window.TaskFlowDocumentDailyPlan && typeof window.TaskFlowDocumentDailyPlan.commitPendingCursor === 'function') {
          var _isDocumentProposal = _cursorSource === 'document-daily-plan' || (typeof _cursorProposalId === 'string' && _cursorProposalId.indexOf('proposal_doc_') === 0);
          var _allSucceeded = failed.length === 0 && skipped.length === 0;
          if (_allSucceeded || !_isDocumentProposal) {
            window.TaskFlowDocumentDailyPlan.commitPendingCursor(_cursorProposalId);
          }
        }
      } catch (e) { /* cursor commit must never break Apply */ }
      const reply = _resultText(applied.length, skipped.length, failed.length, ctx, virtualEntities);
      _lastResult = reply;
      const resBubble = _bubble('agent-info');
      resBubble.textContent = reply;
      msgs.appendChild(resBubble);
      msgs.scrollTop = msgs.scrollHeight;
      try {
        if (window.TaskFlowUI && window.TaskFlowUI.toast) {
          window.TaskFlowUI.toast(skipped.length + failed.length ? reply : _t('agentAppliedDone', { n: applied.length }), skipped.length + failed.length ? 'info' : 'success');
        }
      } catch (e) { /* */ }
      const input = _el('chatInput');
      if (input && typeof input.focus === 'function') input.focus();
      return { handled: true, reply };
    } finally {
      _applying = false;
    }
  }

  /* ---- P1/P6/P24: main entry — returns { handled, reply? } ---- */
  async function handleAgent(message, history, msgs, opts) {
    try {
      if (!_isOnline()) {
        const b = _bubble('agent-info');
        b.textContent = _t('chatOffline');
        msgs.appendChild(b);
        msgs.scrollTop = msgs.scrollHeight;
        return { handled: true, reply: null };
      }
      if (!_hasToken()) {
        const b = _bubble('agent-info');
        b.textContent = _t('chatGuestMsg');
        msgs.appendChild(b);
        msgs.scrollTop = msgs.scrollHeight;
        return { handled: true, reply: null };
      }
      if (!window.TaskFlowAIAgent) {
        const b = _bubble('agent-info');
        b.textContent = _t('agentErrorServer');
        msgs.appendChild(b);
        msgs.scrollTop = msgs.scrollHeight;
        return { handled: true, reply: null };
      }

      const signal = opts && opts.signal ? opts.signal : undefined;
      const proposal = await _callAgentAPI(message, history, signal);

      // P6: browser is the final authority.
      const ctx = buildContext();
      const v = window.TaskFlowAIAgent.validateProposal(proposal, ctx);
      if (!v.ok) {
        const b = _bubble('agent-info');
        b.textContent = _mapValidationError(v.errors);
        msgs.appendChild(b);
        msgs.scrollTop = msgs.scrollHeight;
        return { handled: true, reply: null };
      }
      const dry = window.TaskFlowAIAgent.dryRun(proposal, ctx);
      if (!dry.valid) {
        const b = _bubble('agent-info');
        b.textContent = _mapValidationError(dry.errors);
        msgs.appendChild(b);
        msgs.scrollTop = msgs.scrollHeight;
        return { handled: true, reply: null };
      }
      if (!Array.isArray(dry.changes) || !dry.changes.length) {
        const b = _bubble('agent-info');
        b.textContent = _t('agentErrorNoActions');
        msgs.appendChild(b);
        msgs.scrollTop = msgs.scrollHeight;
        return { handled: true, reply: null };
      }
      dry._ctx = ctx;
      _renderCard(msgs, proposal, dry);
      return { handled: true, reply: null };
    } catch (err) {
      // AbortError = user pressed Stop — silent cancellation, no error bubble
      if (err && err.name === 'AbortError') {
        return { handled: true, aborted: true, reply: null };
      }
      const b = _bubble('agent-info');
      var errMsg = _mapError(err);
      b.textContent = errMsg;
      // For rate-limit errors, add a retry button with optional countdown
      if (err && err.code === 'ai-rate-limited') {
        var retrySec = err.rateLimit && err.rateLimit.retryAfterSeconds;
        b.appendChild(document.createElement('br'));
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chat-retry-btn';
        btn.setAttribute('data-testid', 'agent-retry-btn');
        var _doRetry = function () {
          if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
          try { handleAgent(message, history, msgs, opts); } catch (_e) { /* */ }
        };
        var retryTimer = null;
        if (Number.isFinite(retrySec) && retrySec > 0) {
          var remaining = Math.ceil(retrySec);
          btn.disabled = true;
          btn.textContent = _t('chatRetryIn', { seconds: remaining });
          retryTimer = setInterval(function () {
            remaining--;
            if (remaining <= 0) {
              if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
              btn.disabled = false;
              btn.textContent = _t('chatRetry');
            } else {
              btn.textContent = _t('chatRetryIn', { seconds: remaining });
            }
          }, 1000);
        } else {
          btn.textContent = _t('chatRetry');
        }
        btn.addEventListener('click', _doRetry);
        b.appendChild(btn);
      }
      msgs.appendChild(b);
      msgs.scrollTop = msgs.scrollHeight;
      return { handled: true, reply: null };
    }
  }

  /* ---- P14-P17: Clarification UI ---- */
  let _pendingClarification = null;

  /**
   * showClarification(msgs, intentResult, onSelect) → renders clarification card
   * onSelect(taskUid) is called when user selects a candidate.
   */
  function showClarification(msgs, intentResult, onSelect) {
    if (!msgs || !intentResult || !Array.isArray(intentResult.candidates) || !intentResult.candidates.length) return;
    if (_pendingClarification) return; // one pending at most (P16)

    _pendingClarification = { intentResult, onSelect };

    const card = _bubble('agent-card clarification-card');
    card.setAttribute('data-testid', 'clarification-card');

    const head = document.createElement('div');
    head.className = 'agent-card-head';
    const reason = intentResult.reason || '';
    if (reason === 'not-found') {
      head.textContent = _t('clarifyNotFound');
    } else if (reason === 'ambiguous-task') {
      head.textContent = _t('clarifySelectTask');
    } else {
      head.textContent = _t('clarifyWhatDoYouMean');
    }
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'agent-card-body clarification-body';

    intentResult.candidates.slice(0, 5).forEach(function (cand, idx) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'clarification-option';
      btn.setAttribute('data-testid', 'clarification-option-' + idx);
      btn.setAttribute('aria-label', cand.label || cand.task?.text || '');
      btn.textContent = cand.label || cand.task?.text || '';
      btn.addEventListener('click', function () {
        _dismissClarification(card);
        if (typeof onSelect === 'function' && cand.task && cand.task.uid) {
          onSelect(cand.task.uid, cand.task);
        }
      });
      body.appendChild(btn);
    });

    card.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'agent-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'agent-btn agent-cancel';
    cancelBtn.textContent = _t('clarifyCancel');
    cancelBtn.setAttribute('data-testid', 'clarification-cancel');
    cancelBtn.addEventListener('click', function () {
      _dismissClarification(card);
    });
    actions.appendChild(cancelBtn);
    card.appendChild(actions);

    card.setAttribute('aria-label', _t('clarifySelectTask'));
    msgs.appendChild(card);
    msgs.scrollTop = msgs.scrollHeight;

    var input = _el('chatInput');
    if (input && typeof input.focus === 'function') input.focus();
  }

  function _dismissClarification(card) {
    _pendingClarification = null;
    if (card && card.parentNode) card.parentNode.removeChild(card);
    var input = _el('chatInput');
    if (input && typeof input.focus === 'function') input.focus();
  }

  function getPendingClarification() { return _pendingClarification; }
  function clearPendingClarification() { _pendingClarification = null; }

  /* ---- Phase 6D: handle external file-agent proposal ---- */
  // Receives a server-validated proposal from /api/ai/file-agent.
  // Feeds it into the same Phase 5C review/confirm/apply pipeline.
  function handleExternalProposal(proposal, opts) {
    try {
      const msgs = _el('chatMessages');
      if (!msgs) return { ok: false, code: 'no-chat-messages' };

      // File-Agent proposals use the fileImport policy (max 120, create+schedule only)
      const policy = window.TaskFlowAIAgent && window.TaskFlowAIAgent.VALIDATION_POLICIES
        ? window.TaskFlowAIAgent.VALIDATION_POLICIES.fileImport
        : null;

      // Validate against current TaskFlow state
      const ctx = buildContext();
      const v = window.TaskFlowAIAgent.validateProposal(proposal, ctx, policy);
      if (!v.ok) {
        const b = _bubble('agent-info');
        b.textContent = _mapValidationError(v.errors);
        msgs.appendChild(b);
        msgs.scrollTop = msgs.scrollHeight;
        return { ok: false, code: 'validation-failed', errors: v.errors };
      }
      const dry = window.TaskFlowAIAgent.dryRun(proposal, ctx, policy);
      if (!dry.valid) {
        const b = _bubble('agent-info');
        b.textContent = _mapValidationError(dry.errors);
        msgs.appendChild(b);
        msgs.scrollTop = msgs.scrollHeight;
        return { ok: false, code: 'dry-run-failed', errors: dry.errors };
      }
      if (!Array.isArray(dry.changes) || !dry.changes.length) {
        const b = _bubble('agent-info');
        b.textContent = _t('agentErrorNoActions');
        msgs.appendChild(b);
        msgs.scrollTop = msgs.scrollHeight;
        return { ok: false, code: 'no-actions' };
      }
      dry._ctx = ctx;
      dry._source = opts && opts.source ? opts.source : 'file';
      dry._fileName = opts && opts.fileName ? opts.fileName : '';
      dry._fileMime = opts && opts.fileMime ? opts.fileMime : '';
      _renderCard(msgs, proposal, dry, policy);
      return { ok: true };
    } catch (e) {
      try {
        const msgs = _el('chatMessages');
        if (msgs) {
          const b = _bubble('agent-info');
          b.textContent = _t('agentErrorReviewFailed') || _t('agentErrorServer');
          msgs.appendChild(b);
          msgs.scrollTop = msgs.scrollHeight;
        }
      } catch (e2) { /* */ }
      return { ok: false, code: 'exception', error: e };
    }
  }

  return {
    isActionIntent: isActionIntent,
    handleAgent: handleAgent,
    buildContext: buildContext,
    takeResult: function takeResult() { const r = _lastResult; _lastResult = null; return r; },
    showClarification: showClarification,
    getPendingClarification: getPendingClarification,
    clearPendingClarification: clearPendingClarification,
    getReviewState: _getReviewState,
    _mapError: _mapError,
    _mapValidationError: _mapValidationError,
    handleExternalProposal: handleExternalProposal,
    handleRefinement: handleRefinement,
    handleExpansion: handleExpansion,
    _undoRefinement: _undoRefinement,
    _resetToOriginal: _resetToOriginal,
    _isConfirmAttempt: _isConfirmAttempt,
    _locate: _locate,
    _applyAction: _applyAction,
    _endClock: _endClock,
    _targetDayForDate: _targetDayForDate,
    _buildDepGraph: _buildDepGraph,
    _validateEditArgs: _validateEditArgs,
  };
});