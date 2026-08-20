/* TaskFlow AI Agent — Phase 4A: safe action contracts + dry-run preview.
   PURE module: no network, no storage, no Gemini, no state mutation.
   Everything is a function of (action|proposal, context); the caller owns
   the context (read-only snapshot of TaskFlow state).

   Phase 4B will consume the validated previews and perform real writes.
   It performs no HTTP calls, no storage writes, and no mutation of TaskFlow
   state — those concerns belong to the Phase 4B executor. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAIAgent = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ---- Supported action types (Phase 4A) ----
     delete_task is intentionally absent (higher risk, evaluated later).
     No generic tools (execute_js / patch_object / run_command ...) exist. */
  const SUPPORTED_TYPES = [
    'create_task',
    'update_task',
    'complete_task',
    'schedule_task',
    'reschedule_task',
  ];

  const MAX_ACTIONS = 10;

  /* ---- Field allowlists ----
     create_task / update_task accept ONLY these fields. Everything else is
     stripped (unknown) or rejected (forbidden/secret). */
  const CREATE_FIELDS = ['text', 'date', 'priority', 'duration', 'projectId', 'milestoneId'];
  const UPDATE_CHANGE_FIELDS = ['text', 'priority', 'duration', 'date', 'projectId', 'milestoneId'];

  /* Field names that must NEVER travel through an agent action, at any depth.
     (Keys only — task text is data and is never scanned.) */
  const FORBIDDEN_KEYS = [
    'token', 'authorization', 'apiKey', 'api_key', 'apikey', 'jwt',
    'oauth', 'access_token', 'refresh_token', 'secret', 'password',
    'credential', 'localStorage', 'sync', 'syncMeta', 'planner-token',
  ];

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const MAX_TEXT = 300;
  const MAX_DURATION = 1440; // minutes: 24h, "reasonable"

  /* ---- Helpers (pure) ---- */

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function toMin(t) {
    if (typeof t !== 'string' || !TIME_RE.test(t)) return null;
    const m = /^(\d{2}):(\d{2})$/.exec(t);
    return (+m[1]) * 60 + (+m[2]);
  }

  /* Half-open [start, end) overlap — SAME semantics as
     TaskFlowTimeBlocks.findOverlaps (js/timeblocks.js:232-246), inlined so the
     module stays standalone; a caller-provided context.findOverlaps hook is
     preferred when the timeblocks module is already loaded. */
  function overlaps(s, e, bs, be) {
    return s < be && bs < e;
  }

  function endFromStart(start, duration) {
    const s = toMin(start);
    if (s === null) return null;
    const d = (typeof duration === 'number' && Number.isFinite(duration)) ? duration : 0;
    return s + Math.max(0, Math.floor(d));
  }

  /* HH:mm rendering of a minute-of-day value (may exceed 23:59 when a slot
     crosses midnight — findOverlaps treats such an end as invalid → []). */
  function clockFromMinutes(m) {
    const mm = Math.max(0, Math.floor(m));
    return String(Math.floor(mm / 60)).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0');
  }

  /* Context resolvers (read-only). Caller passes the snapshot. */
  function findTask(context, uid) {
    if (!context || !Array.isArray(context.tasks) || typeof uid !== 'string') return null;
    return context.tasks.find((t) => t && t.uid === uid) || null;
  }

  function taskLabel(context, uid) {
    const t = findTask(context, uid);
    return t && typeof t.text === 'string' && t.text.trim() ? t.text : null;
  }

  function findProject(context, id) {
    if (!context || !Array.isArray(context.projects) || typeof id !== 'string') return null;
    return context.projects.find((p) => p && p.id === id) || null;
  }

  function findMilestone(context, id) {
    if (!context || typeof id !== 'string') return null;
    if (Array.isArray(context.milestones)) {
      const m = context.milestones.find((x) => x && x.id === id);
      if (m) return m;
    }
    if (Array.isArray(context.projects)) {
      for (const p of context.projects) {
        if (p && Array.isArray(p.milestones)) {
          const m = p.milestones.find((x) => x && x.id === id);
          if (m) return m;
        }
      }
    }
    return null;
  }

  /* Secret scan: any forbidden key at ANY depth of an action → reject.
     Values (e.g. task text) are data and never inspected. */
  function findForbiddenKey(value) {
    if (Array.isArray(value)) {
      for (const v of value) {
        const hit = findForbiddenKey(v);
        if (hit) return hit;
      }
      return null;
    }
    if (!isPlainObject(value)) return null;
    for (const k of Object.keys(value)) {
      if (FORBIDDEN_KEYS.indexOf(k) !== -1) return k;
      const hit = findForbiddenKey(value[k]);
      if (hit) return hit;
    }
    return null;
  }

  /* Strip unknown (non-secret) fields via allowlist. */
  function pickFields(obj, allow) {
    const out = {};
    for (const k of allow) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    }
    return out;
  }

  /* ---- Validators ---- */

  function validText(v) {
    if (typeof v !== 'string') return false;
    const t = v.trim();
    return t.length > 0 && t.length <= MAX_TEXT;
  }

  function validDate(v, nullable) {
    if (v === null && nullable) return true;
    if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
    const d = new Date(v + 'T00:00:00');
    return !Number.isNaN(d.getTime()) &&
      d.getFullYear() === +v.slice(0, 4) &&
      d.getMonth() === +v.slice(5, 7) - 1 &&
      d.getDate() === +v.slice(8, 10);
  }

  function validPriority(v) {
    return typeof v === 'boolean';
  }

  function validDuration(v, nullable) {
    if (v === null && nullable) return true;
    return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_DURATION;
  }

  /* Validate one action. Returns { ok:true, action: <allowlisted> } or
     { ok:false, errors: [{ code, field? }] }. Never echoes args in errors. */
  function validateAction(action, context) {
    if (!isPlainObject(action)) {
      return { ok: false, errors: [{ code: 'action-not-object' }] };
    }
    const type = action.type;
    if (SUPPORTED_TYPES.indexOf(type) === -1) {
      return { ok: false, errors: [{ code: 'unsupported-action' }] };
    }
    const args = action.args;
    if (!isPlainObject(args)) {
      return { ok: false, errors: [{ code: 'invalid-args' }] };
    }

    /* Secret fields are always rejected first — even nested. */
    const forbidden = findForbiddenKey(args);
    if (forbidden) {
      return { ok: false, errors: [{ code: 'forbidden-field', field: forbidden }] };
    }

    const errors = [];

    if (type === 'create_task') {
      const clean = pickFields(args, CREATE_FIELDS);
      if (typeof clean.text !== 'string' || !clean.text.trim()) errors.push({ code: 'text-required', field: 'text' });
      else if (clean.text.trim().length > MAX_TEXT) errors.push({ code: 'text-too-long', field: 'text' });
      if (clean.date !== undefined && !validDate(clean.date, true)) errors.push({ code: 'invalid-date', field: 'date' });
      if (clean.priority !== undefined && !validPriority(clean.priority)) errors.push({ code: 'invalid-priority', field: 'priority' });
      if (clean.duration !== undefined && !validDuration(clean.duration, true)) errors.push({ code: 'invalid-duration', field: 'duration' });
      if (clean.projectId !== undefined && clean.projectId !== null && !findProject(context, clean.projectId)) errors.push({ code: 'unknown-project', field: 'projectId' });
      if (clean.milestoneId !== undefined && clean.milestoneId !== null && !findMilestone(context, clean.milestoneId)) errors.push({ code: 'unknown-milestone', field: 'milestoneId' });
      if (errors.length) return { ok: false, errors };
      return { ok: true, action: { type, args: clean } };
    }

    if (type === 'complete_task') {
      if (typeof args.taskUid !== 'string' || !findTask(context, args.taskUid)) {
        return { ok: false, errors: [{ code: 'unknown-task', field: 'taskUid' }] };
      }
      return { ok: true, action: { type, args: pickFields(args, ['taskUid']) } };
    }

    if (type === 'update_task') {
      if (typeof args.taskUid !== 'string' || !findTask(context, args.taskUid)) {
        return { ok: false, errors: [{ code: 'unknown-task', field: 'taskUid' }] };
      }
      const changes = args.changes;
      if (!isPlainObject(changes)) {
        return { ok: false, errors: [{ code: 'changes-invalid', field: 'changes' }] };
      }
      /* uid replacement / sync metadata / createdAt / arbitrary merge: rejected. */
      const rawKeys = Object.keys(changes);
      for (const k of rawKeys) {
        if (UPDATE_CHANGE_FIELDS.indexOf(k) === -1) {
          return { ok: false, errors: [{ code: 'forbidden-field', field: k }] };
        }
      }
      if (!rawKeys.length) return { ok: false, errors: [{ code: 'changes-invalid', field: 'changes' }] };
      const clean = pickFields(changes, UPDATE_CHANGE_FIELDS);
      if (clean.text !== undefined && !validText(clean.text)) errors.push({ code: 'text-too-long', field: 'text' });
      if (clean.date !== undefined && !validDate(clean.date, true)) errors.push({ code: 'invalid-date', field: 'date' });
      if (clean.priority !== undefined && !validPriority(clean.priority)) errors.push({ code: 'invalid-priority', field: 'priority' });
      if (clean.duration !== undefined && !validDuration(clean.duration, true)) errors.push({ code: 'invalid-duration', field: 'duration' });
      if (clean.projectId !== undefined && clean.projectId !== null && !findProject(context, clean.projectId)) errors.push({ code: 'unknown-project', field: 'projectId' });
      if (clean.milestoneId !== undefined && clean.milestoneId !== null && !findMilestone(context, clean.milestoneId)) errors.push({ code: 'unknown-milestone', field: 'milestoneId' });
      if (errors.length) return { ok: false, errors };
      return { ok: true, action: { type, args: { taskUid: args.taskUid, changes: clean } } };
    }

    /* schedule_task / reschedule_task */
    if (typeof args.taskUid !== 'string' || !findTask(context, args.taskUid)) {
      return { ok: false, errors: [{ code: 'unknown-task', field: 'taskUid' }] };
    }
    if (!validDate(args.date, false)) errors.push({ code: 'invalid-date', field: 'date' });
    if (typeof args.start !== 'string' || !TIME_RE.test(args.start)) errors.push({ code: 'invalid-start', field: 'start' });
    if (!validDuration(args.duration, false)) errors.push({ code: 'invalid-duration', field: 'duration' });
    if (errors.length) return { ok: false, errors };
    return { ok: true, action: { type, args: pickFields(args, ['taskUid', 'date', 'start', 'duration']) } };
  }

  /* ---- Proposal ---- */

  function validateProposal(proposal, context) {
    if (!isPlainObject(proposal)) {
      return { ok: false, errors: [{ index: -1, code: 'proposal-not-object' }] };
    }
    if (proposal.summary !== undefined && typeof proposal.summary !== 'string') {
      return { ok: false, errors: [{ index: -1, code: 'summary-invalid' }] };
    }
    if (!Array.isArray(proposal.actions)) {
      return { ok: false, errors: [{ index: -1, code: 'actions-invalid' }] };
    }
    if (proposal.actions.length > MAX_ACTIONS) {
      return { ok: false, errors: [{ index: -1, code: 'proposal-too-large' }] };
    }
    const errors = [];
    const actions = [];
    proposal.actions.forEach((a, i) => {
      const r = validateAction(a, context);
      if (r.ok) actions.push(r.action);
      else r.errors.forEach((e) => errors.push(Object.assign({ index: i }, e)));
    });
    if (errors.length) return { ok: false, errors };
    return { ok: true, actions };
  }

  /* ---- Conflict detection for schedule/reschedule dry-run ----
     Reuses TaskFlowTimeBlocks.findOverlaps semantics. The caller may pass
     context.findOverlaps (the real module's function) when it is loaded;
     otherwise the inline half-open check below is used (same formula). */
  function detectConflicts(action, context) {
    const warnings = [];
    const args = action.args;
    const start = toMin(args.start);
    if (start === null) return warnings;
    const end = endFromStart(args.start, args.duration);
    if (end === null) return warnings;
    if (end > 24 * 60) warnings.push({ code: 'invalid-time-range' });

    const store = context && context.timeblocks && isPlainObject(context.timeblocks) && Array.isArray(context.timeblocks.blocks)
      ? context.timeblocks
      : null;

    if (store) {
      const ignoreTaskUid = action.type === 'reschedule_task' ? args.taskUid : null;
      if (typeof context.findOverlaps === 'function') {
        const hit = context.findOverlaps(store, args.date, args.start, clockFromMinutes(end), null) || [];
        if (hit.length) warnings.push({ code: 'timeblock-conflict' });
      } else {
        const blocksOnDate = store.blocks.filter((b) => b && b.date === args.date && b.status !== 'cancelled' && b.taskUid !== ignoreTaskUid);
        for (const b of blocksOnDate) {
          const bs = toMin(b.start);
          const be = toMin(b.end);
          if (bs !== null && be !== null && overlaps(start, end, bs, be)) {
            warnings.push({ code: 'timeblock-conflict' });
            break;
          }
        }
      }
    }

    if (Array.isArray(context.busy)) {
      let dayStartMs = null;
      if (typeof args.date === 'string' && DATE_RE.test(args.date)) {
        const d = new Date(args.date + 'T00:00:00');
        dayStartMs = d.getTime();
      }
      for (const ev of context.busy) {
        let bs = null, be = null;
        if (isPlainObject(ev) && typeof ev.start === 'string' && typeof ev.end === 'string') {
          bs = toMin(ev.start);
          be = toMin(ev.end);
        } else if (isPlainObject(ev) && typeof ev.startMs === 'number' && typeof ev.endMs === 'number' && dayStartMs !== null) {
          const s = (ev.startMs - dayStartMs) / 60000;
          const e = (ev.endMs - dayStartMs) / 60000;
          if (s >= 0 && e >= 0 && s < 24 * 60) { bs = s; be = Math.min(e, 24 * 60); }
        }
        if (bs !== null && be !== null && overlaps(start, end, bs, be)) {
          warnings.push({ code: 'google-busy-conflict' });
          break;
        }
      }
    }
    return warnings;
  }

  /* ---- Dry run: deterministic, zero mutation ---- */
  function dryRun(proposal, context) {
    const v = validateProposal(proposal, context);
    if (!v.ok) return { valid: false, errors: v.errors };
    const changes = [];
    const warnings = [];
    v.actions.forEach((a, i) => {
      const type = a.type;
      const args = a.args;
      if (type === 'create_task') {
        const c = { type, displayText: args.text.trim() };
        if (args.date !== undefined && args.date !== null) c.date = args.date;
        if (args.priority !== undefined) c.priority = args.priority;
        if (args.duration !== undefined && args.duration !== null) c.duration = args.duration;
        if (args.projectId !== undefined && args.projectId !== null) c.projectId = args.projectId;
        if (args.milestoneId !== undefined && args.milestoneId !== null) c.milestoneId = args.milestoneId;
        changes.push(c);
      } else if (type === 'complete_task') {
        changes.push({ type, taskUid: args.taskUid, displayText: taskLabel(context, args.taskUid) });
      } else if (type === 'update_task') {
        const c = { type, taskUid: args.taskUid, displayText: taskLabel(context, args.taskUid), changes: args.changes };
        changes.push(c);
      } else { // schedule_task / reschedule_task
        changes.push({
          type,
          taskUid: args.taskUid,
          displayText: taskLabel(context, args.taskUid),
          date: args.date,
          start: args.start,
          duration: args.duration,
        });
        detectConflicts(a, context).forEach((w) => warnings.push(Object.assign({ index: i }, w)));
      }
    });
    return { valid: true, changes, warnings };
  }

  /* ---- UI-neutral preview model (no raw UIDs ever) ---- */

  const TYPE_TITLES = {
    create_task: { vi: 'Tạo công việc', en: 'Create task' },
    update_task: { vi: 'Cập nhật công việc', en: 'Update task' },
    complete_task: { vi: 'Hoàn thành công việc', en: 'Complete task' },
    schedule_task: { vi: 'Xếp lịch', en: 'Schedule' },
    reschedule_task: { vi: 'Đổi lịch', en: 'Reschedule' },
  };

  function dateLabel(date, context) {
    if (!date) return null;
    const today = context && typeof context.today === 'string' ? context.today : null;
    if (today === date) return (context && context.lang === 'en') ? 'Today' : 'Hôm nay';
    if (today) {
      const t = new Date(today + 'T00:00:00');
      const d = new Date(date + 'T00:00:00');
      if (t.getTime() + 86400000 === d.getTime()) return (context && context.lang === 'en') ? 'Tomorrow' : 'Ngày mai';
    }
    return date;
  }

  function minutesLabel(min, context) {
    if (typeof min !== 'number') return null;
    return (context && context.lang === 'en') ? `${min} min` : `${min} phút`;
  }

  function previewAction(action, context) {
    const r = validateAction(action, context);
    if (!r.ok) return { ok: false, errors: r.errors };
    const a = r.action;
    const type = a.type;
    const lang = context && context.lang === 'en' ? 'en' : 'vi';
    const title = TYPE_TITLES[type][lang];
    const args = a.args;

    if (type === 'create_task') {
      const parts = [];
      const dl = dateLabel(args.date, context);
      if (dl) parts.push(dl);
      const ml = minutesLabel(args.duration, context);
      if (ml) parts.push(ml);
      return { ok: true, preview: { title, description: args.text.trim(), meta: parts.join(' · ') } };
    }

    if (type === 'complete_task') {
      return { ok: true, preview: { title, description: taskLabel(context, args.taskUid), meta: '' } };
    }

    if (type === 'update_task') {
      const parts = [];
      if (args.changes.duration !== undefined && args.changes.duration !== null) {
        const ml = minutesLabel(args.changes.duration, context);
        if (ml) parts.push(ml);
      }
      return { ok: true, preview: { title, description: taskLabel(context, args.taskUid), meta: parts.join(' · ') } };
    }

    /* schedule_task / reschedule_task */
    const parts = [];
    const dl = dateLabel(args.date, context);
    if (dl) parts.push(dl);
    if (args.start) parts.push(args.start);
    const ml = minutesLabel(args.duration, context);
    if (ml) parts.push(ml);
    return { ok: true, preview: { title, description: taskLabel(context, args.taskUid), meta: parts.join(' · ') } };
  }

  function previewProposal(proposal, context) {
    const v = validateProposal(proposal, context);
    if (!v.ok) return { ok: false, errors: v.errors };
    const previews = v.actions.map((a) => {
      const p = previewAction({ type: a.type, args: a.args }, context);
      return p.preview;
    });
    return { ok: true, previews };
  }

  return {
    SUPPORTED_TYPES: SUPPORTED_TYPES,
    MAX_ACTIONS: MAX_ACTIONS,
    CREATE_FIELDS: CREATE_FIELDS,
    UPDATE_CHANGE_FIELDS: UPDATE_CHANGE_FIELDS,
    MAX_TEXT: MAX_TEXT,
    MAX_DURATION: MAX_DURATION,
    validateAction: validateAction,
    validateProposal: validateProposal,
    previewAction: previewAction,
    previewProposal: previewProposal,
    dryRun: dryRun,
    // Exposed for testing / Phase 4B reuse
    _findTask: findTask,
    _taskLabel: taskLabel,
    _findProject: findProject,
    _findMilestone: findMilestone,
    _toMin: toMin,
    _endFromStart: endFromStart,
  };
});