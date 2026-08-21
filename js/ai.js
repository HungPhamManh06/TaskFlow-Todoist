/* ============================================================
   TaskFlow-Todoist — AI Planning Copilot (V2.2, optional)
   ------------------------------------------------------------
   window.TaskFlowAI — lớp frontend của AI planning.

   Vai trò:
   - Context builder: chỉ gửi context tối thiểu (allowlist + caps),
     reflection/mood CHỈ khi user opt-in từng lần (allowSensitive).
   - Schema + referential validation phía client (mirror server).
   - Conflict check: cảnh báo chồng giờ, KHÔNG tự dời.
   - Apply pipeline: AI trả proposal → user xem preview → user bấm
     Apply → TaskFlow ghi state qua API chuẩn (TimeBlock/move helpers).
     AI KHÔNG BAO GIỜ ghi trực tiếp planner data.
   - Fallback: mọi lỗi AI đều để planner quy tắc (V1.4) vẫn dùng được.
   - Preview UI: KHÔNG bao giờ hiện task UID nội bộ — luôn hiện task text
     (taskLabels map từ context), fallback nhãn an toàn nếu thiếu; UID chỉ
     nằm trong data-task-uid cho action identity/debug.

   Không thêm framework; không đổi global sync. Consent KHÔNG persist.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const I18N = () => (typeof window !== 'undefined' ? window.TaskFlowI18N : null);
  const t = (key, vars) => (I18N() && I18N().t ? I18N().t(key, vars) : key);

  // Kinds hỗ trợ — khớp server/ai.js KINDS.
  const KINDS = ['plan_day', 'plan_week', 'next_actions', 'breakdown_project', 'breakdown_milestone', 'reschedule'];
  const ACTION_TYPES = ['schedule_task', 'reschedule_task', 'next_action'];
  const RESCHEDULE_OPTIONS = ['tomorrow', 'this-week', 'inbox'];

  // Caps chống đốt token — giống server.
  const ARRAY_CAPS = { tasks: 60, projects: 20, milestones: 60, timeblocks: 80, habits: 30, busy: 80, overdue: 40, reflections: 12, mood: 90 };
  const TEXT_MAX = 160;

  // Consent mặc định (bộ nhớ, KHÔNG persist).
  const consentState = { tasks: true, projects: true, schedule: true, reflections: false, mood: false };

  function setConsent(patch) {
    if (!patch || typeof patch !== 'object') return consentState;
    Object.keys(consentState).forEach((k) => {
      if (typeof patch[k] === 'boolean') consentState[k] = patch[k];
    });
    return consentState;
  }
  function getConsent() { return { ...consentState }; }

  function capText(v, max) {
    const s = String(v === undefined || v === null ? '' : v);
    return s.length > max ? s.slice(0, max) : s;
  }

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  function validDate(s) {
    const str = String(s);
    if (!DATE_RE.test(str)) return false;
    const parts = str.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    // Round-trip chặt: từ chối ngày roll-over như 2026-02-30 / 2026-13-40.
    return d.getFullYear() === parts[0] && d.getMonth() === parts[1] - 1 && d.getDate() === parts[2]
      && parts[0] >= 2020 && parts[0] <= 2099;
  }
  function validTime(s) {
    return typeof s === 'string' && TIME_RE.test(s);
  }

  /* ---- Context builder: tối thiểu, deterministic, allowlist ---- */
  function pickTask(tk) {
    return {
      uid: tk && tk.uid ? String(tk.uid) : undefined,
      text: capText(tk.text, TEXT_MAX),
      duration: (typeof tk.estimatedMinutes === 'number' && tk.estimatedMinutes > 0)
        ? Math.min(tk.estimatedMinutes, 480) : null,
      priority: tk.kind === 'priority' ? 1 : 0,
      deadline: validDate(tk.deadline) ? tk.deadline : undefined,
      projectId: tk.projectId || undefined,
      energy: ['low', 'medium', 'high'].includes(tk.energy) ? tk.energy : undefined,
      contexts: Array.isArray(tk.contexts) ? tk.contexts.slice(0, 8).map((c) => capText(c, 40)) : undefined,
      done: !!tk.done,
    };
  }

  function buildContext(opts) {
    const o = opts || {};
    const ctx = {
      kind: KINDS.includes(o.kind) ? o.kind : null,
      lang: o.lang === 'en' ? 'en' : 'vi',
      today: validDate(o.today) ? o.today : '',
      weekStart: validDate(o.weekStart) ? o.weekStart : '',
      weekEnd: validDate(o.weekEnd) ? o.weekEnd : '',
      selectedProjectId: o.selectedProjectId ? capText(o.selectedProjectId, 64) : '',
      selectedMilestoneId: o.selectedMilestoneId ? capText(o.selectedMilestoneId, 64) : '',
      userText: o.userText ? capText(o.userText, 300) : '',
    };
    const cap = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);
    ctx.tasks = cap(o.tasks, ARRAY_CAPS.tasks).map(pickTask).filter((x) => x && x.uid);
    ctx.projects = cap(o.projects, ARRAY_CAPS.projects).map((p) => ({
      id: p.id || undefined,
      title: capText(p.title, TEXT_MAX),
      status: ['active', 'completed', 'archived'].includes(p.status) ? p.status : 'active',
      milestones: Array.isArray(p.milestones) ? p.milestones.length : 0,
      progress: typeof p.progress === 'number' ? Math.max(0, Math.min(100, Math.round(p.progress))) : 0,
    })).filter((x) => x && x.id);
    ctx.milestones = cap(o.milestones, ARRAY_CAPS.milestones).map((m) => ({
      id: m.id || undefined,
      projectId: m.projectId || undefined,
      title: capText(m.title, TEXT_MAX),
      status: ['active', 'completed'].includes(m.status) ? m.status : 'active',
      targetDate: validDate(m.targetDate) ? m.targetDate : undefined,
    })).filter((x) => x && x.id);
    ctx.timeblocks = cap(o.timeblocks, ARRAY_CAPS.timeblocks).map((b) => ({
      id: b.id || undefined,
      taskUid: b.taskUid || undefined,
      date: validDate(b.date) ? b.date : undefined,
      start: validTime(b.start) ? b.start : undefined,
      end: validTime(b.end) ? b.end : undefined,
      status: ['planned', 'completed', 'cancelled'].includes(b.status) ? b.status : 'planned',
    })).filter((x) => x && x.date && x.start && x.end);
    ctx.habits = cap(o.habits, ARRAY_CAPS.habits).map((h) => ({
      name: capText(h && h.name, TEXT_MAX),
      target: h && typeof h.target === 'number' ? h.target : 100,
    })).filter((x) => x && x.name);
    ctx.busy = cap(o.busy, ARRAY_CAPS.busy).map((b) => ({
      start: b && b.start ? capText(b.start, 32) : undefined,
      end: b && b.end ? capText(b.end, 32) : undefined,
    })).filter((x) => x && x.start && x.end);
    ctx.overdue = cap(o.overdue, ARRAY_CAPS.overdue).map((tk) => ({
      uid: tk && tk.uid ? String(tk.uid) : undefined,
      text: capText(tk && tk.text, TEXT_MAX),
      duration: (tk && typeof tk.estimatedMinutes === 'number' && tk.estimatedMinutes > 0)
        ? Math.min(tk.estimatedMinutes, 480) : null,
      priority: tk && tk.kind === 'priority' ? 1 : 0,
      deadline: validDate(tk && tk.deadline) ? tk.deadline : undefined,
      daysOverdue: tk && typeof tk.daysOverdue === 'number' ? Math.max(0, Math.round(tk.daysOverdue)) : 0,
    })).filter((x) => x && x.uid);

    // PRIVACY: reflection/mood CHỈ khi opt-in rõ ràng từng lần.
    ctx.allowSensitive = !!o.allowSensitive;
    if (o.allowSensitive) {
      ctx.reflections = cap(o.reflections, ARRAY_CAPS.reflections).map((r) => ({
        date: validDate(r && r.date) ? r.date : '',
        text: capText(r && r.text, 300),
      })).filter((x) => x && x.date);
      ctx.mood = cap(o.mood, ARRAY_CAPS.mood).map((m) => ({
        date: validDate(m && m.date) ? m.date : '',
        value: m && typeof m.value === 'number' ? m.value : null,
      })).filter((x) => x && x.date);
    }
    // Phase 6S: Attach adaptive productivity hints when adaptation is enabled.
    // Hints are advisory, local, and stripped server-side before reaching the model.
    try {
      if (typeof window !== 'undefined' && window.TaskFlowAIAdaptation && window.TaskFlowAIAdaptation.isEnabled()) {
        var hints = window.TaskFlowAIAdaptation.buildAdaptiveHints();
        if (hints && typeof hints === 'object') {
          ctx.adaptiveHints = hints;
        }
      }
    } catch (e) { /* adaptation must never break planner */ }
    return ctx;
  }

  /* ---- Schema + referential validation (client) ---- */
  function validateProposalLocal(proposal, refs) {
    const r = refs || {};
    const taskUids = r.taskUids || new Set();
    const errors = [];
    if (!proposal || typeof proposal !== 'object') return { ok: false, errors: ['proposal-not-object'] };
    if (typeof proposal.summary !== 'string' || proposal.summary.length > 400) errors.push('summary-invalid');
    if (!Array.isArray(proposal.actions) || proposal.actions.length > 10) errors.push('actions-invalid');
    if (errors.length) return { ok: false, errors };

    proposal.actions.forEach((a, i) => {
      const tag = 'action-' + i;
      if (!a || typeof a !== 'object' || !ACTION_TYPES.includes(a.type)) {
        errors.push(tag + '-unknown-type');
        return;
      }
      if (a.type === 'next_action') {
        if (typeof a.text !== 'string' || !a.text.trim() || a.text.length > 160) errors.push(tag + '-text-invalid');
        return;
      }
      if (typeof a.taskUid !== 'string' || !taskUids.has(a.taskUid)) {
        errors.push(tag + '-unknown-task');
        return;
      }
      if (a.type === 'schedule_task') {
        if (!validDate(a.date)) errors.push(tag + '-invalid-date');
        if (a.start !== null && a.start !== undefined && !validTime(a.start)) errors.push(tag + '-invalid-start');
        if (a.duration !== null && a.duration !== undefined && (!Number.isInteger(a.duration) || a.duration < 5 || a.duration > 480)) {
          errors.push(tag + '-invalid-duration');
        }
      } else if (a.type === 'reschedule_task') {
        if (!RESCHEDULE_OPTIONS.includes(a.option)) errors.push(tag + '-invalid-option');
      }
    });
    return { ok: errors.length === 0, errors };
  }

  /* ---- Conflict check: chỉ cảnh báo, không tự dời ---- */
  function toMin(s) {
    let t = String(s || '');
    // Busy windows từ Google có thể là ISO datetime ('2026-02-15T09:00:00Z') — lấy phần giờ:phút.
    const iso = /T(\d{2}:\d{2})/.exec(t);
    if (iso) t = iso[1];
    if (!validTime(t)) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function conflictCheck(proposal, blocks, busy) {
    const warnings = [];
    if (!proposal || !Array.isArray(proposal.actions)) return warnings;
    const existing = (Array.isArray(blocks) ? blocks : []).map((b) => ({
      date: b.date, start: toMin(b.start), end: toMin(b.end), label: b.taskUid || '',
    }));
    const busyWin = (Array.isArray(busy) ? busy : []).map((b) => ({
      date: typeof b.date === 'string' && b.date ? b.date : null,
      start: toMin(b.start), end: toMin(b.end),
    })).filter((x) => x.start !== null && x.end !== null && x.start < x.end);

    const proposed = [];
    proposal.actions.forEach((a, i) => {
      if (!a || a.type !== 'schedule_task' || !validTime(a.start)) return;
      const start = toMin(a.start);
      const end = start + Math.min(a.duration || 60, 480);
      proposed.push({ idx: i, taskUid: a.taskUid, date: a.date, start, end });
    });
    // Chồng với block/busy đã có.
    proposed.forEach((p) => {
      const hit = existing.some((e) => e.date === p.date && e.start !== null && e.end !== null && overlaps(p.start, p.end, e.start, e.end));
      const busyHit = busyWin.some((e) => (!e.date || e.date === p.date) && overlaps(p.start, p.end, e.start, e.end));
      if (hit || busyHit) warnings.push({ actionIndex: p.idx, taskUid: p.taskUid, kind: hit ? 'existing' : 'busy' });
    });
    // Chồng giữa các action đề xuất với nhau.
    for (let i = 0; i < proposed.length; i++) {
      for (let j = i + 1; j < proposed.length; j++) {
        if (proposed[i].date === proposed[j].date && overlaps(proposed[i].start, proposed[i].end, proposed[j].start, proposed[j].end)) {
          warnings.push({ actionIndex: proposed[j].idx, taskUid: proposed[j].taskUid, kind: 'proposed' });
        }
      }
    }
    return warnings;
  }

  /* ---- Gọi server /api/ai/plan với Bearer token ---- */
  function apiBase() {
    const cfg = (typeof API_CONFIG !== 'undefined' && API_CONFIG) || {};
    if (cfg.url) return String(cfg.url).replace(/\/+$/, '');
    return '';
  }
  function authHeaders() {
    try {
      const token = localStorage.getItem('planner-token');
      return token ? { Authorization: 'Bearer ' + token } : {};
    } catch (e) { return {}; }
  }

  async function callPlanner(context, signal) {
    const base = apiBase();
    try {
      const res = await fetch(base + '/api/ai/plan', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ kind: context.kind, context }),
        signal: signal || undefined,
      });
      let j = null;
      try { j = await res.json(); } catch (e) { /* fallthrough */ }
      if (!res.ok) {
        const code = (j && j.error) || 'ai-provider-unavailable';
        return { ok: false, error: code, details: (j && j.details) || [] };
      }
      if (!j || !j.proposal) return { ok: false, error: 'ai-provider-unavailable' };
      return { ok: true, proposal: j.proposal };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, error: 'ai-timeout' };
      return { ok: false, error: 'network' };
    }
  }

  /* ---- Apply pipeline: user bấm Apply → API chuẩn ---- */
  // hooks = { findTask(uid), createBlock({taskUid,date,start,end}),
  //           moveToDay(uid, option), moveToInbox(uid) }
  function applyProposal(proposal, hooks) {
    const h = hooks || {};
    const result = { ok: true, created: 0, rescheduled: 0, advisory: 0, skipped: [] };
    if (!proposal || !Array.isArray(proposal.actions)) return { ok: false, created: 0, rescheduled: 0, advisory: 0, skipped: [] };
    proposal.actions.forEach((a) => {
      if (!a || typeof a !== 'object') return;
      if (a.type === 'next_action') { result.advisory += 1; return; }
      if (typeof h.findTask !== 'function' || !h.findTask(a.taskUid)) {
        result.skipped.push(a.taskUid);
        return; // task không tồn tại (tháng khác / đã xoá) → bỏ qua an toàn
      }
      if (a.type === 'schedule_task' && validDate(a.date) && validTime(a.start)) {
        const start = toMin(a.start);
        const duration = (a.duration !== null && a.duration !== undefined) ? Math.min(Math.max(a.duration, 5), 480) : 60;
        let endMin = start + duration;
        if (endMin > 24 * 60 - 1) endMin = 24 * 60 - 1;
        const end = String(Math.floor(endMin / 60)).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0');
        if (h.createBlock) { h.createBlock({ taskUid: a.taskUid, date: a.date, start: a.start, end }); result.created += 1; }
      } else if (a.type === 'reschedule_task' && RESCHEDULE_OPTIONS.includes(a.option)) {
        if (a.option === 'inbox') { if (h.moveToInbox) { h.moveToInbox(a.taskUid); result.rescheduled += 1; } }
        else if (h.moveToDay) { h.moveToDay(a.taskUid, a.option); result.rescheduled += 1; }
      }
    });
    return result;
  }

  /* ---- HTML helpers (consent + preview) ---- */
  function consentPanelHTML() {
    const c = consentState;
    const row = (key, label, checked) =>
      `<label class="ai-consent-chip"><input type="checkbox" data-ai-consent="${key}" ${checked ? 'checked' : ''}> ${label}</label>`;
    return `<div class="ai-consent" data-role="ai-consent">
      <span class="ai-consent-label">${t('aiAccess')}</span>
      ${row('tasks', t('aiConsentTasks'), c.tasks)}
      ${row('projects', t('aiConsentProjects'), c.projects)}
      ${row('schedule', t('aiConsentSchedule'), c.schedule)}
      ${row('reflections', t('aiConsentReflections'), c.reflections)}
      ${row('mood', t('aiConsentMood'), c.mood)}
    </div>`;
  }

  function kindOptionsHTML(selected) {
    return KINDS.map((k) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${t('aiKind' + k)}</option>`).join('');
  }

  function panelHTML(projects, milestones) {
    const pr = Array.isArray(projects) ? projects : [];
    const ms = Array.isArray(milestones) ? milestones : [];
    const projOpts = pr.map((p) => `<option value="${escAttr(p.id)}">${escHtml(p.title)}</option>`).join('');
    const msOpts = ms.map((m) => `<option value="${escAttr(m.id)}">${escHtml(m.title)}</option>`).join('');
    return `<div class="ai-panel" data-role="ai-panel">
      <div class="ai-panel-head">
        <span class="ai-panel-title">${icon('sparkles')} ${t('aiTitle')}</span>
        <select class="ai-kind" data-role="ai-kind" aria-label="${t('aiKindAria')}">${kindOptionsHTML('plan_day')}</select>
      </div>
      <div class="ai-targets" data-role="ai-targets" hidden>
        <label class="ai-target-row"><span>${t('aiSelectProject')}</span>
          <select class="ai-project" data-role="ai-project" aria-label="${t('aiSelectProject')}">
            <option value="">${t('aiNone')}</option>${projOpts}</select></label>
        <label class="ai-target-row"><span>${t('aiSelectMilestone')}</span>
          <select class="ai-milestone" data-role="ai-milestone" aria-label="${t('aiSelectMilestone')}">
            <option value="">${t('aiNone')}</option>${msOpts}</select></label>
      </div>
      ${consentPanelHTML()}
      <div class="ai-actions">
        <button type="button" class="button button-primary button-sm" data-action="ai-run">${t('aiRun')}</button>
      </div>
      <div class="ai-result" data-role="ai-result" aria-live="polite"></div>
    </div>`;
  }

  /* ---- Preview: semantic rows, KHÔNG hiện UID nội bộ ---- */
  // opts = { taskLabels: {uid → task.text}, today: 'YYYY-MM-DD', lang: 'vi'|'en' }
  function previewHTML(proposal, warnings, opts) {
    const o = opts || {};
    const labels = (o.taskLabels && typeof o.taskLabels === 'object') ? o.taskLabels : {};
    const lang = o.lang === 'en' ? 'en' : 'vi';
    const warnMap = {};
    (warnings || []).forEach((w) => { warnMap[w.actionIndex] = w; });
    // UID KHÔNG bao giờ là display text: fallback an toàn nếu thiếu label.
    const labelFor = (uid) => {
      const v = labels[uid];
      return (typeof v === 'string' && v.trim()) ? v : t('aiTaskFallback');
    };
    const shortDate = (dateStr) => {
      if (!validDate(dateStr)) return '';
      const y = +dateStr.slice(0, 4), mo = +dateStr.slice(5, 7), d = +dateStr.slice(8, 10);
      if (lang === 'vi') return String(d).padStart(2, '0') + '/' + String(mo).padStart(2, '0');
      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return d + ' ' + MONTHS[mo - 1];
    };
    const dateLabel = (a) => {
      if (a.date && o.today && a.date === o.today) return t('aiPlanToday');
      const s = shortDate(a.date);
      return s ? s : '';
    };
    const durText = (a) => {
      const min = (a.duration !== null && a.duration !== undefined) ? a.duration : 60;
      const R = (typeof window !== 'undefined' && window.TaskFlowPlannerRules) || null;
      if (R && typeof R.formatMinutes === 'function') return R.formatMinutes(min, lang);
      const m = Math.max(0, Math.round(min));
      if (m < 60) return m + (lang === 'vi' ? ' phút' : ' min');
      const h = Math.floor(m / 60), r = m % 60;
      if (!r) return lang === 'vi' ? h + ' giờ' : h + ' h';
      return lang === 'vi' ? h + ' giờ ' + r + ' phút' : h + ' h ' + r + ' min';
    };
    const items = proposal.actions.map((a, i) => {
      const w = warnMap[i];
      // P6: badge nhỏ gọn + text accessible theo kind (conflictCheck đã lộ kind an toàn).
      const kindKey = w && w.kind ? { existing: 'aiConflictExisting', busy: 'aiConflictBusy', proposed: 'aiConflictProposed' }[w.kind] : null;
      const tag = w
        ? ` <span class="ai-warn" role="note"${kindKey ? ` title="${escAttr(t(kindKey))}" aria-label="${escAttr(t(kindKey))}"` : ''}>${escHtml(t('aiConflict'))}</span>`
        : '';
      if (a.type === 'schedule_task') {
        const dLabel = dateLabel(a);
        const dateTime = (validDate(a.date) && validTime(a.start)) ? escAttr(a.date + 'T' + a.start) : '';
        return `<li class="ai-plan-item">
          <time class="ai-plan-time"${dateTime ? ` datetime="${dateTime}"` : ''}>${escHtml(a.start || '--:--')}</time>
          <div class="ai-plan-main">
            <strong class="ai-plan-task">${escHtml(labelFor(a.taskUid))}${tag}</strong>
            <span class="ai-plan-meta">${escHtml(durText(a))}${dLabel ? ' · ' + escHtml(dLabel) : ''}</span>
          </div>
          <span class="ai-plan-uid" data-task-uid="${escAttr(a.taskUid)}" hidden></span>
        </li>`;
      }
      if (a.type === 'reschedule_task') {
        return `<li class="ai-plan-item ai-plan-item-reschedule">${escHtml(t('aiActReschedule', { task: labelFor(a.taskUid), opt: t('aiOpt' + a.option) }))}${tag}</li>`;
      }
      return `<li class="ai-plan-item ai-plan-item-next">${escHtml(t('aiActNext'))}: ${escHtml(a.text)}${tag}</li>`;
    }).join('');
    const warnNote = (warnings && warnings.length)
      ? `<p class="ai-warn-note">${t('aiConflictsNote')}</p>`
      : '';
    return `<div class="ai-preview" data-role="ai-preview">
      <p class="ai-summary"><strong>${t('aiSummary')}:</strong> ${escHtml(proposal.summary)}</p>
      ${warnNote}
      <h4 class="ai-plan-section">${t('aiPlanSection')}</h4>
      <ul class="ai-plan-list">${items}</ul>
      <div class="ai-preview-actions">
        <button type="button" class="button button-ghost button-sm" data-action="ai-cancel">${t('aiCancel')}</button>
        <button type="button" class="button button-primary button-sm" data-action="ai-apply">${t('aiApply')}</button>
      </div>
    </div>`;
  }

  /* ---- small helpers ---- */
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escAttr(s) { return escHtml(s); }
  function icon(name) {
    return (typeof window !== 'undefined' && window.TaskFlowUI && window.TaskFlowUI.icon) ? window.TaskFlowUI.icon(name) : '';
  }

  return {
    KINDS,
    ACTION_TYPES,
    RESCHEDULE_OPTIONS,
    getConsent,
    setConsent,
    buildContext,
    validateProposalLocal,
    conflictCheck,
    callPlanner,
    applyProposal,
    panelHTML,
    consentPanelHTML,
    previewHTML,
    validDate,
    validTime,
  };
});
