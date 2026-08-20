// TaskFlow — Safe Action Agent Runtime (Phase 4B).
// Flow: user request → deterministic action-intent router → POST /api/ai/agent
// → Gemini proposes → server sanitizes → TaskFlowAIAgent validates → dry-run
// → preview card in the Chat panel → user CONFIRMS → revalidation → canonical
// TaskFlow mutation APIs apply. NO direct Gemini write, NO autonomous actions,
// NO delete, NO auto-apply. Lazy-loaded with the Chat chain (never boot path).
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

  /* ---- P3: deterministic action-intent router (no LLM call) ---- */
  const CREATE_RE = /(^|\s)(tạo|thêm|add|create|new)\s+(task|công việc|việc|todo|work|nhiệm vụ)/i;
  const COMPLETE_RE = /hoàn thành|hoàn tất|đánh dấu[\s\S]*xong|mark[\s\S]*(done|complete)|complete|finish/i;
  const SCHEDULE_RE = /(xếp|sắp lịch|lên lịch|schedule|book|đặt giờ|đặt lịch)|vào lúc\s*\d{1,2}|vào\s*\d{1,2}\s*h/i;
  const RESCHEDULE_RE = /(chuyển|dời|reschedule|move)\s+(task|công việc|việc|todo|work)|chuyển\s+sang|dời\s+sang/i;
  const UPDATE_RE = /ưu tiên cao|ưu tiên thấp|priority|đổi[\s\S]*thời lượng|change[\s\S]*duration|đổi[\s\S]*tên|rename|đổi[\s\S]*deadline|đổi[\s\S]*ngày|set[\s\S]*(priority|duration)/i;

  function isActionIntent(message) {
    const s = String(message || '').trim();
    if (!s) return false;
    if (COMPLETE_RE.test(s)) return true;
    if (CREATE_RE.test(s)) return true;
    if (RESCHEDULE_RE.test(s)) return true;
    if (SCHEDULE_RE.test(s)) return true;
    if (UPDATE_RE.test(s)) return true;
    return false;
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
  async function _callAgentAPI(message, history) {
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
    });
    let json;
    try { json = await res.json(); } catch (e) { json = null; }
    if (!res.ok || !json || !json.ok) {
      const errCode = (json && json.error) || 'network';
      throw { code: errCode, status: res.status };
    }
    return json.proposal;
  }

  function _mapError(err) {
    const code = err && err.code ? err.code : 'network';
    switch (code) {
      case 'ai-not-configured': return _t('chatErrorNotConfigured');
      case 'ai-timeout': return _t('chatErrorTimeout');
      case 'ai-rate-limited': return _t('chatErrorRateLimited');
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

  /* ---- UI building (textContent only — no innerHTML with model data) ---- */
  function _bubble(className) {
    const el = document.createElement('div');
    el.className = 'chat-msg bot ' + className;
    return el;
  }

  function _renderCard(msgs, proposal, dry) {
    const card = _bubble('agent-card');
    card.setAttribute('data-testid', 'agent-card');

    const head = document.createElement('div');
    head.className = 'agent-card-head';
    head.textContent = _t('agentProposeTitle');
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'agent-card-body';
    const previews = window.TaskFlowAIAgent.previewProposal(proposal, dry ? dry._ctx : buildContext());
    const previewList = previews && previews.ok ? previews.previews : [];
    dry.changes.forEach((ch, i) => {
      const p = previewList[i] || {};
      const row = document.createElement('div');
      row.className = 'agent-row';
      const t = document.createElement('span');
      t.className = 'agent-row-title';
      t.textContent = p.title || ch.type;
      const d = document.createElement('span');
      d.className = 'agent-row-desc';
      d.textContent = p.description || '';
      const m = document.createElement('span');
      m.className = 'agent-row-meta';
      m.textContent = p.meta || '';
      row.appendChild(t); row.appendChild(d); row.appendChild(m);
      body.appendChild(row);
    });
    card.appendChild(body);

    if (Array.isArray(dry.warnings) && dry.warnings.length) {
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

    const actions = document.createElement('div');
    actions.className = 'agent-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'agent-btn agent-cancel';
    cancelBtn.textContent = _t('agentCancel');
    cancelBtn.addEventListener('click', () => _cancelCard(card, msgs));
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'agent-btn agent-confirm';
    confirmBtn.textContent = _t('agentConfirm');
    confirmBtn.addEventListener('click', () => _confirmCard(card, msgs, proposal));
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    card.appendChild(actions);

    card.setAttribute('aria-label', _t('agentProposeTitle'));
    msgs.appendChild(card);
    msgs.scrollTop = msgs.scrollHeight;
    const input = _el('chatInput');
    if (input && typeof input.focus === 'function') input.focus();
    return card;
  }

  function _cancelCard(card, msgs) {
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

  /* ---- Apply: canonical TaskFlow mutation APIs only (P13-P18) ---- */
  function _pushTask(dayRef, task) {
    const day = state.weeks[dayRef.week].days[dayRef.day];
    day.tasks.push(task);
  }

  function _applyCreate(action) {
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
    return { status: 'applied' };
  }

  function _applyUpdate(action) {
    const ref = _locate(action.args.taskUid);
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

  function _applyComplete(action) {
    const ref = _locate(action.args.taskUid);
    if (!ref) return { status: 'skipped', reason: 'stale' };
    if (ref.tk.done) return { status: 'skipped', reason: 'already-done' };
    ref.tk.done = true;
    try { if (typeof addXP === 'function') addXP(10); } catch (e) { /* */ }
    return { status: 'applied' };
  }

  function _applySchedule(action, isReschedule) {
    const args = action.args;
    const ref = _locate(args.taskUid);
    if (!ref) return { status: 'skipped', reason: 'stale' };
    const end = _endClock(args.start, args.duration);
    if (!end) return { status: 'skipped', reason: 'invalid-range' };
    let store;
    try { store = loadTimeBlocksStore(); } catch (e) { return { status: 'failed' }; }
    if (!store) store = { version: 1, blocks: [] };

    let existingId = null;
    if (isReschedule) {
      const b = (Array.isArray(store.blocks) ? store.blocks : []).find((x) => x && x.taskUid === args.taskUid && x.status !== 'cancelled');
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
        if (TB) TB.createTimeBlock(store, { taskUid: args.taskUid, date: args.date, start: args.start, end, status: 'scheduled' });
      }
      saveTimeBlocksStore(store);
    } catch (e) { return { status: 'failed' }; }
    return { status: 'applied' };
  }

  function _applyAction(action) {
    switch (action.type) {
      case 'create_task': return _applyCreate(action);
      case 'update_task': return _applyUpdate(action);
      case 'complete_task': return _applyComplete(action);
      case 'schedule_task': return _applySchedule(action, false);
      case 'reschedule_task': return _applySchedule(action, true);
      default: return { status: 'failed' };
    }
  }

  /* ---- Result text (P20/P23) — accurate, no UID ---- */
  function _resultText(applied, skipped, failed) {
    if (skipped + failed === 0) {
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

  /* ---- P7/P11/P20/P22: confirm → revalidate against CURRENT state, then apply ---- */
  async function _confirmCard(card, msgs, proposal) {
    if (_applying || !card || !card.parentNode) return;
    _applying = true;
    const btns = card.querySelectorAll('button');
    btns.forEach((b) => { b.disabled = true; });

    try {
      // P7: revalidate on confirm — state may have changed since preview.
      const ctx = buildContext();
      const v = window.TaskFlowAIAgent.validateProposal(proposal, ctx);
      if (!v.ok) {
        const errBubble = _bubble('agent-info');
        errBubble.textContent = _t('agentStaleConfirm');
        msgs.appendChild(errBubble);
        msgs.scrollTop = msgs.scrollHeight;
        if (card.parentNode) card.parentNode.removeChild(card);
        return;
      }
      const dry = window.TaskFlowAIAgent.dryRun(proposal, ctx);
      if (!dry.valid) {
        const errBubble = _bubble('agent-info');
        errBubble.textContent = _mapValidationError(dry.errors);
        msgs.appendChild(errBubble);
        msgs.scrollTop = msgs.scrollHeight;
        if (card.parentNode) card.parentNode.removeChild(card);
        return;
      }

      // P21: ONE undo checkpoint for the whole confirmed proposal.
      try { if (typeof pushUndo === 'function') pushUndo(); } catch (e) { /* */ }

      const applied = [], skipped = [], failed = [];
      const fresh = buildContext();
      for (const a of proposal.actions) {
        const r = _applyAction(a);
        if (r.status === 'applied') applied.push(a);
        else if (r.status === 'skipped') skipped.push({ action: a, reason: r.reason });
        else failed.push(a);
      }

      try { if (typeof save === 'function') save(); } catch (e) { /* */ }
      try {
        if (typeof renderCurrentView === 'function') renderCurrentView();
        else if (typeof renderToday === 'function') renderToday();
      } catch (e) { /* */ }

      if (card.parentNode) card.parentNode.removeChild(card);
      const reply = _resultText(applied.length, skipped.length, failed.length);
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
  async function handleAgent(message, history, msgs) {
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

      const proposal = await _callAgentAPI(message, history);

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
      const b = _bubble('agent-info');
      b.textContent = _mapError(err);
      msgs.appendChild(b);
      msgs.scrollTop = msgs.scrollHeight;
      return { handled: true, reply: null };
    }
  }

  return {
    isActionIntent: isActionIntent,
    handleAgent: handleAgent,
    buildContext: buildContext,
    takeResult: function takeResult() { const r = _lastResult; _lastResult = null; return r; },
    _mapError: _mapError,
    _mapValidationError: _mapValidationError,
    _locate: _locate,
    _applyAction: _applyAction,
    _endClock: _endClock,
    _targetDayForDate: _targetDayForDate,
  };
});