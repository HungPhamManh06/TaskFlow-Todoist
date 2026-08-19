/* ============================================================
   TaskFlow — Phase 3A: Read-only AI Context Broker
   ------------------------------------------------------------
   window.TaskFlowAIContext — data/context layer for future
   TaskFlow-aware Gemini Chat (Phase 3B). NOT wired to Chat yet.

   Guarantees:
   - READ-ONLY: never mutates TaskFlow state/stores; every output
     is constructed field-by-field from an explicit allowlist.
   - NO NETWORK: zero fetch; Google busy arrives pre-read from the
     caller (planner-gcal-cache). No Google calls inside the broker.
   - NO GEMINI: no /api/ai/plan, /api/ai/chat, provider calls.
   - PRIVACY: sensitive domains (reflections, mood) are OFF by
     default; denied keys are omitted entirely (not empty arrays).
   - DETERMINISTIC: same inputs -> same snapshot. Truncation keeps
     the first N in documented order (planner grid / store order;
     most-recent-first for mood/reflections).

   Reuse (single source of truth):
   - Today resolution goes through the canonical resolver
     TaskFlowClock.resolveTodayCell — today scope resolves the SAME
     day object as Today/Week UI. Callers may inject it explicitly
     (resolveTodayCell) or a pre-resolved cell (todayCell).
   - Task/project/milestone/timeblock/habit/busy/reflection/mood
     pickers and array caps mirror TaskFlowAI.buildContext; caps are
     taken from TaskFlowAI.ARRAY_CAPS at build time when available.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAIContext = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SCOPES = ['today', 'week', 'project', 'schedule', 'overview'];

  // Local caps; overlapping entries are overridden at build time by
  // TaskFlowAI.ARRAY_CAPS when that module is loaded (one source of truth).
  const DEFAULT_CAPS = {
    todayTasks: 60,
    weekTasks: 100,
    projects: 20,
    milestones: 60,
    timeblocks: 80,
    busy: 80,
    habits: 30,
    reflections: 12,
    mood: 90,
  };

  const DEFAULT_PERMISSIONS = {
    tasks: true,
    projects: true,
    schedule: true,
    habits: true,
    reflections: false,
    mood: false,
  };

  const TEXT_MAX = 160;           // mirror TaskFlowAI
  const REFLECTION_TEXT_MAX = 300; // mirror TaskFlowAI
  const DURATION_MAX = 480;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  /* ---------------- small pure helpers ---------------- */

  function capText(v, max) {
    const s = String(v === undefined || v === null ? '' : v);
    return s.length > max ? s.slice(0, max) : s;
  }

  function validDate(s) {
    const str = String(s);
    if (!DATE_RE.test(str)) return false;
    const parts = str.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.getFullYear() === parts[0] && d.getMonth() === parts[1] - 1 && d.getDate() === parts[2]
      && parts[0] >= 2020 && parts[0] <= 2099;
  }

  function validTime(s) {
    return typeof s === 'string' && TIME_RE.test(s);
  }

  function isStr(v) {
    return typeof v === 'string';
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function firstN(arr, n) {
    return asArray(arr).slice(0, n);
  }

  function dateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function normalizeMoodDate(key) {
    const s = String(key === undefined || key === null ? '' : key).trim();
    if (DATE_RE.test(s)) return validDate(s) ? s : null;
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (!m) return null;
    const p = [m[1], String(+m[2]).padStart(2, '0'), String(+m[3]).padStart(2, '0')].join('-');
    return validDate(p) ? p : null;
  }

  function effectiveCaps() {
    const AI = (typeof window !== 'undefined' && window.TaskFlowAI)
      || (typeof globalThis !== 'undefined' && globalThis.TaskFlowAI) || null;
    const src = AI && AI.ARRAY_CAPS && typeof AI.ARRAY_CAPS === 'object' ? AI.ARRAY_CAPS : {};
    const num = (k, fb) => (typeof src[k] === 'number' ? src[k] : fb);
    return {
      todayTasks: num('tasks', DEFAULT_CAPS.todayTasks),
      weekTasks: DEFAULT_CAPS.weekTasks,
      projects: num('projects', DEFAULT_CAPS.projects),
      milestones: num('milestones', DEFAULT_CAPS.milestones),
      timeblocks: num('timeblocks', DEFAULT_CAPS.timeblocks),
      busy: num('busy', DEFAULT_CAPS.busy),
      habits: num('habits', DEFAULT_CAPS.habits),
      reflections: num('reflections', DEFAULT_CAPS.reflections),
      mood: num('mood', DEFAULT_CAPS.mood),
    };
  }

  /* ---------------- allowlisted pickers (field-by-field) ---------------- */

  function pickTask(tk) {
    if (!tk || typeof tk !== 'object') return null;
    return {
      uid: tk.uid !== undefined && tk.uid !== null ? String(tk.uid) : undefined,
      text: capText(tk.text, TEXT_MAX),
      done: !!tk.done,
      priority: tk.kind === 'priority' ? 1 : 0,
      duration: (typeof tk.estimatedMinutes === 'number' && tk.estimatedMinutes > 0)
        ? Math.min(tk.estimatedMinutes, DURATION_MAX) : null,
      deadline: validDate(tk.deadline) ? tk.deadline : undefined,
      projectId: isStr(tk.projectId) ? tk.projectId : undefined,
      energy: ['low', 'medium', 'high'].includes(tk.energy) ? tk.energy : undefined,
      contexts: Array.isArray(tk.contexts) ? tk.contexts.slice(0, 8).map((c) => capText(c, 40)) : undefined,
    };
  }

  function pickTimeBlock(b) {
    if (!b || typeof b !== 'object') return null;
    const date = validDate(b.date) ? b.date : '';
    const start = validTime(b.start) ? b.start : '';
    const end = validTime(b.end) ? b.end : '';
    if (!date || !start || !end) return null;
    return {
      id: isStr(b.id) ? b.id : undefined,
      taskUid: isStr(b.taskUid) && b.taskUid ? b.taskUid : undefined,
      date,
      start,
      end,
      status: ['planned', 'completed', 'cancelled'].includes(b.status) ? b.status : 'planned',
    };
  }

  function pickProject(p) {
    if (!p || typeof p !== 'object' || p.id === undefined || p.id === null) return null;
    return {
      id: String(p.id),
      title: capText(p.title, TEXT_MAX),
      status: ['active', 'completed', 'archived'].includes(p.status) ? p.status : 'active',
      progress: typeof p.progress === 'number' ? Math.max(0, Math.min(100, Math.round(p.progress))) : 0,
      milestones: Array.isArray(p.milestones) ? p.milestones.length : 0,
    };
  }

  function pickMilestone(m) {
    if (!m || typeof m !== 'object' || m.id === undefined || m.id === null) return null;
    return {
      id: String(m.id),
      projectId: isStr(m.projectId) ? m.projectId : undefined,
      title: capText(m.title, TEXT_MAX),
      status: ['active', 'completed'].includes(m.status) ? m.status : 'active',
      targetDate: validDate(m.targetDate) ? m.targetDate : undefined,
    };
  }

  function pickHabit(h) {
    if (!h || typeof h !== 'object' || !isStr(h.name) || !h.name) return null;
    return {
      id: isStr(h.id) ? h.id : undefined,
      name: capText(h.name, TEXT_MAX),
      target: typeof h.target === 'number' ? h.target : 100,
    };
  }

  function pickBusy(b) {
    if (!b || typeof b !== 'object') return null;
    const start = isStr(b.start) && b.start ? capText(b.start, 32) : '';
    const end = isStr(b.end) && b.end ? capText(b.end, 32) : '';
    if (!start || !end) return null;
    return { start, end };
  }

  function pickReflection(r) {
    if (!r || typeof r !== 'object') return null;
    const date = validDate(r.date) ? r.date : '';
    const text = capText(r.text, REFLECTION_TEXT_MAX);
    if (!date || !text.trim()) return null;
    return { date, text };
  }

  function pickMood(m) {
    if (!m || typeof m !== 'object') return null;
    const date = validDate(m.date) ? m.date : '';
    const value = typeof m.value === 'number' ? m.value : null;
    if (!date || value === null) return null;
    return { date, value };
  }

  /* ---------------- canonical today resolution ---------------- */

  // Returns { now, today, cell, day, weeks }. `day` is a READ-ONLY reference
  // to the canonical day object (never returned to callers — only copied).
  function resolveToday(o) {
    const now = o.now instanceof Date ? o.now : new Date();
    const today = validDate(o.today) ? o.today : dateStr(now);
    const weeks = o.state && Array.isArray(o.state.weeks) ? o.state.weeks : [];
    let cell = null;
    if (o.todayCell && typeof o.todayCell === 'object') cell = o.todayCell;
    if (!cell) {
      let resolver = typeof o.resolveTodayCell === 'function' ? o.resolveTodayCell : null;
      if (!resolver) {
        const C = (typeof globalThis !== 'undefined' && globalThis.TaskFlowClock)
          || (typeof window !== 'undefined' && window.TaskFlowClock) || null;
        if (C && typeof C.resolveTodayCell === 'function') resolver = C.resolveTodayCell;
      }
      if (resolver) {
        try {
          cell = resolver({
            planStart: o.planStart instanceof Date ? o.planStart : null,
            numDays: typeof o.numDays === 'number' ? o.numDays : (weeks.length ? weeks.length * 7 : 0),
            year: typeof o.year === 'number' ? o.year : now.getFullYear(),
            month: typeof o.month === 'number' ? o.month : now.getMonth(),
            weeks,
            now,
          });
        } catch (e) { cell = null; }
      }
    }
    if (!cell || typeof cell !== 'object') {
      cell = { inPlanMonth: false, weekIndex: null, weekNumber: null, dayIndex: null, day: null, dayIdx: null };
    }
    const day = cell.day && typeof cell.day === 'object' ? cell.day : null;
    return { now, today, cell, day, weeks };
  }

  /* ---------------- scope builders ---------------- */

  function blocksOf(o) {
    return o.timeblocks && Array.isArray(o.timeblocks)
      ? o.timeblocks
      : (o.timeblocks && Array.isArray(o.timeblocks.blocks) ? o.timeblocks.blocks : []);
  }

  function buildToday(res, o, caps, perms) {
    const out = { scope: 'today', date: res.today, tasks: [], timeblocks: [], busy: [] };
    if (perms.tasks) {
      out.tasks = firstN(res.day && Array.isArray(res.day.tasks) ? res.day.tasks : [], caps.todayTasks)
        .map(pickTask).filter((x) => x && x.uid);
    }
    if (perms.schedule) {
      out.timeblocks = firstN(blocksOf(o).filter((b) => b && b.date === res.today), caps.timeblocks)
        .map(pickTimeBlock).filter(Boolean);
      // Busy: caller-supplied intervals; keep those whose local start date is
      // today (or unparseable — caller already filtered the window).
      out.busy = firstN(asArray(o.busy).filter((b) => {
        const d = busyLocalDate(b && b.start);
        return d === null || d === res.today;
      }), caps.busy).map(pickBusy).filter(Boolean);
    }
    return out;
  }

  function busyLocalDate(iso) {
    const t = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso === undefined || iso === null ? '' : iso));
    if (!t) return null;
    const d = new Date(+t[1], +t[2] - 1, +t[3], +t[4], +t[5]);
    if (Number.isNaN(d.getTime())) return null;
    return dateStr(d);
  }

  function buildWeek(res, o, caps, perms) {
    const out = { scope: 'week', weekStart: '', weekEnd: '', days: [] };
    const weekIndex = res.cell.weekIndex;
    const w = weekIndex !== null && weekIndex >= 0 ? res.weeks[weekIndex] : null;
    if (!w || !Array.isArray(w.days)) return out;
    const planStart = o.planStart instanceof Date ? o.planStart : null;
    const baseIdx = weekIndex * 7;
    let remaining = caps.weekTasks;
    const rows = w.days.map((d, di) => {
      const date = planStart ? dateStr(addDays(planStart, baseIdx + di)) : '';
      const tasks = [];
      if (perms.tasks && remaining > 0) {
        asArray(d && d.tasks).forEach((tk) => {
          if (remaining <= 0) return;
          const p = pickTask(tk);
          if (p && p.uid) { tasks.push(p); remaining -= 1; }
        });
      }
      return { date, tasks };
    });
    out.days = rows;
    if (planStart && rows.length) {
      out.weekStart = rows[0].date;
      out.weekEnd = rows[rows.length - 1].date;
    }
    return out;
  }

  function projectsAndMilestones(o, caps, filterId) {
    const list = o.projects && Array.isArray(o.projects)
      ? o.projects
      : (o.projects && Array.isArray(o.projects.projects) ? o.projects.projects : []);
    let src = list;
    if (filterId) src = src.filter((p) => p && p.id === filterId);
    const projects = [];
    const milestones = [];
    firstN(src, caps.projects).forEach((p) => {
      const pp = pickProject(p);
      if (!pp) return;
      projects.push(pp);
      asArray(p.milestones).forEach((m) => {
        const mm = pickMilestone(m);
        if (!mm) return;
        if (mm.projectId === undefined) mm.projectId = p.id;
        milestones.push(mm);
      });
    });
    return { projects, milestones: firstN(milestones, caps.milestones) };
  }

  function buildProject(o, caps, perms) {
    const out = { scope: 'project', projects: [], milestones: [] };
    if (!perms.projects) return out;
    const filterId = isStr(o.projectId) && o.projectId ? o.projectId : null;
    const r = projectsAndMilestones(o, caps, filterId);
    out.projects = r.projects;
    out.milestones = r.milestones;
    return out;
  }

  function buildSchedule(o, caps, perms) {
    const out = { scope: 'schedule', timeblocks: [], busy: [] };
    if (!perms.schedule) return out;
    const from = validDate(o.from) ? o.from : '';
    const to = validDate(o.to) ? o.to : '';
    let blocks = blocksOf(o);
    if (from && to) blocks = blocks.filter((b) => b && b.date >= from && b.date <= to);
    out.timeblocks = firstN(blocks, caps.timeblocks).map(pickTimeBlock).filter(Boolean);
    out.busy = firstN(asArray(o.busy), caps.busy).map(pickBusy).filter(Boolean);
    return out;
  }

  function collectReflections(res, o, caps) {
    const entries = [];
    if (Array.isArray(o.reflections)) {
      entries.push(...o.reflections);
    } else if (o.state && o.state.reflections && typeof o.state.reflections === 'object') {
      const planStart = o.planStart instanceof Date ? o.planStart : null;
      asArray(o.state.reflections.weeks).forEach((wk, wi) => {
        asArray(wk).forEach((txt, di) => {
          if (!txt || !String(txt).trim()) return;
          const date = planStart ? dateStr(addDays(planStart, wi * 7 + di)) : '';
          entries.push({ date, text: String(txt).slice(0, REFLECTION_TEXT_MAX) });
        });
      });
      asArray(o.state.reflections.overview).forEach((txt) => {
        if (txt && String(txt).trim()) entries.push({ date: res.today, text: String(txt).slice(0, REFLECTION_TEXT_MAX) });
      });
    }
    const picked = entries.map(pickReflection).filter(Boolean);
    picked.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return picked.slice(-caps.reflections);
  }

  function collectMood(o, caps) {
    const picked = [];
    if (Array.isArray(o.mood)) {
      o.mood.forEach((m) => { const p = pickMood(m); if (p) picked.push(p); });
    } else if (o.mood && typeof o.mood === 'object') {
      Object.keys(o.mood).forEach((k) => {
        const date = normalizeMoodDate(k);
        if (!date) return;
        const v = o.mood[k];
        if (typeof v !== 'number') return;
        picked.push({ date, value: v });
      });
    }
    picked.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return picked.slice(-caps.mood);
  }

  function buildOverview(res, o, caps, perms) {
    const out = {
      scope: 'overview',
      today: res.today,
      tasks: [],
      projects: [],
      milestones: [],
      timeblocks: [],
      habits: [],
      busy: [],
    };
    if (perms.tasks) {
      const seen = new Set();
      const tasks = [];
      res.weeks.forEach((w) => asArray(w && w.days).forEach((d) => asArray(d && d.tasks).forEach((tk) => {
        if (tk && tk.uid && !seen.has(tk.uid)) { seen.add(tk.uid); tasks.push(tk); }
      })));
      out.tasks = firstN(tasks, caps.todayTasks).map(pickTask).filter((x) => x && x.uid);
    }
    if (perms.projects) {
      const r = projectsAndMilestones(o, caps, null);
      out.projects = r.projects;
      out.milestones = r.milestones;
    }
    if (perms.schedule) {
      out.timeblocks = firstN(blocksOf(o), caps.timeblocks).map(pickTimeBlock).filter(Boolean);
      out.busy = firstN(asArray(o.busy), caps.busy).map(pickBusy).filter(Boolean);
    }
    if (perms.habits) {
      const habits = Array.isArray(o.habits) ? o.habits
        : (o.state && Array.isArray(o.state.habits) ? o.state.habits : []);
      out.habits = firstN(habits, caps.habits).map(pickHabit).filter(Boolean);
    }
    if (perms.reflections) out.reflections = collectReflections(res, o, caps);
    if (perms.mood) out.mood = collectMood(o, caps);
    return out;
  }

  /* ---------------- public entry ---------------- */

  function normalizePermissions(p) {
    const out = Object.assign({}, DEFAULT_PERMISSIONS);
    if (p && typeof p === 'object') {
      Object.keys(out).forEach((k) => { if (typeof p[k] === 'boolean') out[k] = p[k]; });
    }
    return out;
  }

  // build({ scope, permissions, state, now, today, planStart, numDays, year,
  //         month, resolveTodayCell, todayCell, projects, timeblocks, busy,
  //         habits, reflections, mood, projectId, from, to })
  // Pure/read-only: constructs a fresh allowlisted snapshot, never mutates
  // inputs, never reads network.
  function build(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const perms = normalizePermissions(o.permissions);
    const caps = effectiveCaps();
    const res = resolveToday(o);
    const scope = SCOPES.includes(o.scope) ? o.scope : 'overview';
    switch (scope) {
      case 'today': return buildToday(res, o, caps, perms);
      case 'week': return buildWeek(res, o, caps, perms);
      case 'project': return buildProject(o, caps, perms);
      case 'schedule': return buildSchedule(o, caps, perms);
      default: return buildOverview(res, o, caps, perms);
    }
  }

  // Deterministic intent -> scope routing helper (future use; deliberately NOT
  // NLP and NOT wired to Chat). Unknown intent -> 'overview'.
  const INTENT_TOKENS = [
    ['today', 'today'], ['hôm nay', 'today'], ['hom nay', 'today'],
    ['week', 'week'], ['tuần', 'week'], ['tuan', 'week'],
    ['project', 'project'], ['dự án', 'project'], ['du an', 'project'],
    ['milestone', 'project'], ['mốc', 'project'], ['moc', 'project'],
    ['schedule', 'schedule'], ['lịch', 'schedule'], ['lich', 'schedule'], ['calendar', 'schedule'],
  ];

  function scopeForIntent(intent) {
    const s = String(intent === undefined || intent === null ? '' : intent).trim().toLowerCase();
    if (!s) return 'overview';
    for (let i = 0; i < INTENT_TOKENS.length; i++) {
      const token = INTENT_TOKENS[i][0];
      if (s === token || s.startsWith(token + ' ') || s.endsWith(' ' + token) || s.indexOf(' ' + token + ' ') !== -1) {
        return INTENT_TOKENS[i][1];
      }
    }
    return 'overview';
  }

  return {
    SCOPES,
    CAPS: Object.assign({}, DEFAULT_CAPS),
    DEFAULT_PERMISSIONS: Object.assign({}, DEFAULT_PERMISSIONS),
    effectiveCaps,
    build,
    scopeForIntent,
    validDate,
    validTime,
    normalizeMoodDate,
    pickTask,
    pickTimeBlock,
    pickProject,
    pickMilestone,
    pickHabit,
    pickBusy,
    pickReflection,
    pickMood,
  };
});