// TaskFlow — V1.4.1 Actionable Insights.
// DATA → INSIGHT → SUGGESTED ACTION. Rule-based, deterministic, never labeled AI.
// Every insight enforces a minimum sample size; below it, no conclusion is emitted.
// Deps are injectable for unit tests; absent deps fall back to globals at call time.
// Privacy: this module never reads Reflection / Mood data.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowInsights = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Minimum sample sizes per insight. n < MIN → no conclusion.
  const MIN_SAMPLES = {
    durationCompletion: 5,
    repeatedOverdue: 3,
    plannedCompleted: 5,
    focusCompletion: 5,
    habitConsistency: 4,
    overloadedWeekday: 5,
    projectVelocity: 3,
    timeOfDay: 5,
    energyCompletion: 5,
  };

  /* ---------- helpers (pure) ---------- */
  function rate(done, total) {
    return total > 0 ? done / total : 0;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function dateKey(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  // "YYYY-MM-DD" (or longer ISO) → local Date at midnight, or null.
  function parseDateKey(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // "HH:mm" → minutes since midnight, or null.
  function toMin(hhmm) {
    const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = +m[1], mm = +m[2];
    if (h > 23 || mm > 59) return null;
    return h * 60 + mm;
  }

  function isDone(t) {
    return !!(t && t.done === true);
  }

  function hasEst(t) {
    return !!(t && Number.isFinite(t.estimatedMinutes) && t.estimatedMinutes > 0);
  }

  /* ---------- rules: each returns { id, key, actionKey, params } | null ---------- */

  // 1. Completion rate by estimated duration.
  function durationCompletion(tasks) {
    const withEst = tasks.filter(hasEst);
    if (withEst.length < MIN_SAMPLES.durationCompletion) return null;
    const longT = withEst.filter((t) => t.estimatedMinutes >= 90);
    const shortT = withEst.filter((t) => t.estimatedMinutes < 90);
    if (longT.length < 2 || shortT.length < 2) return null;
    const longRate = rate(longT.filter(isDone).length, longT.length);
    const shortRate = rate(shortT.filter(isDone).length, shortT.length);
    if (longRate >= shortRate - 0.15) return null;
    return { id: 'duration_completion', key: 'insightDurationCompletion', actionKey: 'insightDurationCompletionAction', params: {} };
  }

  // 2. Repeated overdue tasks (overdue across a full month boundary, or already
  //    overdue in the previous month state).
  function repeatedOverdue(tasks, prevTasks, now) {
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevStartKey = dateKey(prevMonthStart);
    const prevUids = new Set(
      (prevTasks || [])
        .filter((t) => t && !isDone(t) && parseDateKey(t.deadline) && dateKey(parseDateKey(t.deadline)) < prevStartKey)
        .map((t) => t.uid)
    );
    const repeated = (tasks || []).filter((t) => {
      if (!t || isDone(t)) return false;
      const dl = parseDateKey(t.deadline);
      if (!dl) return false;
      return prevUids.has(t.uid) || dateKey(dl) < prevStartKey;
    });
    if (repeated.length < MIN_SAMPLES.repeatedOverdue) return null;
    return { id: 'repeated_overdue', key: 'insightRepeatedOverdue', actionKey: 'insightRepeatedOverdueAction', params: { n: repeated.length } };
  }

  // 3. Planned vs completed workload (estimated minutes).
  function plannedCompleted(tasks) {
    const est = tasks.filter(hasEst);
    if (est.length < MIN_SAMPLES.plannedCompleted) return null;
    const planned = est.reduce((a, t) => a + t.estimatedMinutes, 0);
    const done = est.filter(isDone).reduce((a, t) => a + t.estimatedMinutes, 0);
    if (planned <= 0 || done <= 0) return null;
    const gap = (planned - done) / planned;
    if (gap < 0.35) return null;
    return { id: 'planned_completed', key: 'insightPlannedCompleted', actionKey: 'insightPlannedCompletedAction', params: { pct: Math.round(gap * 100) } };
  }

  // 4. Focus minutes vs completed tasks.
  function focusCompletion(tasks, focusMinutes) {
    const doneN = tasks.filter(isDone).length;
    if (doneN < MIN_SAMPLES.focusCompletion) return null;
    if (!Number.isFinite(focusMinutes) || focusMinutes < 60) return null;
    const perTask = focusMinutes / doneN;
    if (perTask < 90) return null;
    return { id: 'focus_completion', key: 'insightFocusCompletion', actionKey: 'insightFocusCompletionAction', params: { min: Math.round(perTask) } };
  }

  // 5. Habit target consistency (worst habit with enough history).
  function habitConsistency(habits, periodProgressFn, year, month, numDays, now) {
    if (!periodProgressFn || !Array.isArray(habits) || !habits.length) return null;
    const cands = [];
    habits.forEach((h) => {
      if (!h || !h.id) return;
      const s = typeof h.schedule === 'object' && h.schedule ? h.schedule : { type: 'daily' };
      let pp = null;
      try {
        pp = periodProgressFn(s, h.days, h.target, year, month, numDays, now);
      } catch (e) { pp = null; }
      if (pp && pp.required >= MIN_SAMPLES.habitConsistency && pp.pct < 50) cands.push({ h, pct: pp.pct });
    });
    if (!cands.length) return null;
    cands.sort((a, b) => a.pct - b.pct || String(a.h.name).localeCompare(String(b.h.name)));
    const c = cands[0];
    return { id: 'habit_consistency', key: 'insightHabitConsistency', actionKey: 'insightHabitConsistencyAction', params: { name: String(c.h.name || '').slice(0, 24), pct: Math.round(c.pct) } };
  }

  // 6. Most overloaded weekday (planned time-block minutes in the current month).
  function overloadedWeekday(timeblocks, year, month, weekdayLabelFn) {
    const prefix = year + '-' + pad2(month + 1) + '-';
    const minsByDay = [0, 0, 0, 0, 0, 0, 0];
    let counted = 0;
    (timeblocks || []).forEach((b) => {
      if (!b || b.status === 'cancelled' || !b.date || b.date.indexOf(prefix) !== 0) return;
      const dl = parseDateKey(b.date);
      if (!dl) return;
      const s = toMin(b.start), e = toMin(b.end);
      if (s === null || e === null || e <= s) return;
      minsByDay[dl.getDay()] += e - s;
      counted++;
    });
    if (counted < MIN_SAMPLES.overloadedWeekday) return null;
    // Peak day must clearly dominate the next-busiest day (>= 2x), so balanced
    // weeks do not produce a false overload insight.
    const sorted = minsByDay.slice().sort((a, b) => b - a);
    const peak = minsByDay.indexOf(sorted[0]);
    const second = sorted[1] || 0;
    if (second <= 0 || sorted[0] < second * 2) return null;
    return { id: 'overloaded_weekday', key: 'insightOverloadedWeekday', actionKey: 'insightOverloadedWeekdayAction', params: { day: weekdayLabelFn(peak) } };
  }

  // 7. Project progress velocity (active projects with milestones + target date).
  function projectVelocity(projects, tasks, now, progressFn) {
    if (!Array.isArray(projects)) return null;
    const act = projects.filter((p) => p && p.status === 'active' && Array.isArray(p.milestones) && p.milestones.length >= MIN_SAMPLES.projectVelocity && p.targetDate);
    let best = null;
    act.forEach((p) => {
      const start = parseDateKey(p.startDate || p.createdAt);
      const end = parseDateKey(p.targetDate);
      if (!start || !end || end <= start) return;
      const elapsed = (now.getTime() - start.getTime()) / (end.getTime() - start.getTime());
      if (elapsed < 0.15) return; // quá sớm để kết luận
      const expected = Math.round(elapsed * 100);
      const prog = progressFn ? progressFn(p, tasks) : { pct: 0 };
      if (prog.pct >= expected - 20) return;
      const lag = prog.pct - expected;
      if (!best || lag < best.lag) best = { p, prog, expected, lag };
    });
    if (!best) return null;
    return { id: 'project_velocity', key: 'insightProjectVelocity', actionKey: 'insightProjectVelocityAction', params: { name: String(best.p.title || '').slice(0, 24), pct: best.prog.pct, exp: best.expected } };
  }

  // 8. Time-of-day completion (only when tasks carry doneAt).
  function timeOfDay(tasks) {
    const doneAt = (tasks || []).filter((t) => t && t.done && typeof t.doneAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t.doneAt));
    if (doneAt.length < MIN_SAMPLES.timeOfDay) return null;
    const hours = doneAt.map((t) => +t.doneAt.slice(11, 13)).filter((h) => Number.isFinite(h) && h >= 0 && h <= 23);
    if (hours.length < MIN_SAMPLES.timeOfDay) return null;
    const buckets = Array(24).fill(0);
    hours.forEach((h) => { buckets[h]++; });
    if (buckets.filter((n) => n > 0).length < 2) return null;
    let peak = 0;
    for (let h = 1; h < 24; h++) if (buckets[h] > buckets[peak]) peak = h;
    return { id: 'time_of_day', key: 'insightTimeOfDay', actionKey: 'insightTimeOfDayAction', params: { time: pad2(peak) + ':00' } };
  }

  // 9. Energy vs completion (only when tasks carry energy).
  function energyCompletion(tasks, energyLabelFn) {
    const levels = ['low', 'medium', 'high'];
    const withE = (tasks || []).filter((t) => t && levels.indexOf(t.energy) >= 0);
    if (withE.length < MIN_SAMPLES.energyCompletion) return null;
    const stats = levels.map((l) => {
      const ts = withE.filter((t) => t.energy === l);
      return { l, n: ts.length, done: ts.filter(isDone).length };
    }).filter((s) => s.n > 0);
    let gapMax = 0, worst = null;
    for (let i = 0; i < stats.length; i++) {
      for (let j = 0; j < stats.length; j++) {
        if (i === j) continue;
        const a = stats[i], b = stats[j];
        if (a.n < 2 || b.n < 2) continue;
        // a better than b → b is the underperforming level.
        const diff = rate(a.done, a.n) - rate(b.done, b.n);
        if (diff > gapMax) { gapMax = diff; worst = b; }
      }
    }
    if (gapMax < 0.25 || !worst) return null;
    return { id: 'energy_completion', key: 'insightEnergyCompletion', actionKey: 'insightEnergyCompletionAction', params: { energy: energyLabelFn(worst.l) } };
  }

  /* ---------- global fallbacks (resolved at call time) ---------- */
  // TaskFlow stores tasks nested as weeks[].days[].tasks (plus a flat list in
  // some month shapes) — flatten both so insights see every task of the month.
  function flattenTasks(st) {
    const out = [];
    if (!st || typeof st !== 'object') return out;
    if (Array.isArray(st.tasks)) out.push(...st.tasks);
    if (Array.isArray(st.weeks)) {
      st.weeks.forEach((w) => {
        if (w && Array.isArray(w.days)) w.days.forEach((d) => {
          if (d && Array.isArray(d.tasks)) out.push(...d.tasks);
        });
      });
    }
    return out;
  }

  function readPrevTasks(year, month) {
    if (typeof window === 'undefined' || !window.TaskFlowStorage) return [];
    let yy = year, mm = month - 1;
    if (mm < 0) { mm = 11; yy--; }
    try {
      const raw = window.TaskFlowStorage.monthStateRaw ? window.TaskFlowStorage.monthStateRaw(yy, mm) : null;
      return raw ? flattenTasks(raw) : [];
    } catch (e) { return []; }
  }

  function defaultFocusMinutes() {
    try {
      if (typeof window !== 'undefined' && window.TaskFlowFocusStats && typeof window.TaskFlowFocusStats.focusMonthMinutes === 'function') {
        return window.TaskFlowFocusStats.focusMonthMinutes();
      }
    } catch (e) { /* fall through */ }
    return 0;
  }

  function defaultTimeblocks() {
    try {
      if (typeof window !== 'undefined' && window.TaskFlowTimeBlocks && typeof window.TaskFlowTimeBlocks.loadTimeBlocks === 'function') {
        return asList(window.TaskFlowTimeBlocks.loadTimeBlocks(), 'blocks');
      }
    } catch (e) { /* fall through */ }
    return [];
  }

  function defaultProjects() {
    try {
      if (typeof window !== 'undefined' && window.TaskFlowProjects && typeof window.TaskFlowProjects.loadProjects === 'function') {
        return asList(window.TaskFlowProjects.loadProjects(), 'projects');
      }
    } catch (e) { /* fall through */ }
    return [];
  }

  // Store modules return { version, <key>: [...] } — flatten to the array.
  function asList(store, key) {
    if (Array.isArray(store)) return store;
    if (store && typeof store === 'object' && Array.isArray(store[key])) return store[key];
    return [];
  }

  function defaultWeekdayLabel(di) {
    try {
      if (typeof window !== 'undefined' && window.TaskFlowDates && typeof window.TaskFlowDates.dayLabelShort === 'function') {
        return String(window.TaskFlowDates.dayLabelShort(di));
      }
    } catch (e) { /* fall through */ }
    return String(di);
  }

  function defaultEnergyLabel(l) {
    try {
      if (typeof t === 'function') return String(t('energy' + l[0].toUpperCase() + l.slice(1)));
    } catch (e) { /* fall through */ }
    return l;
  }

  function defaultPeriodProgress() {
    try {
      if (typeof window !== 'undefined' && window.TaskFlowHabits && typeof window.TaskFlowHabits.periodProgress === 'function') {
        return window.TaskFlowHabits.periodProgress;
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  /* ---------- entry ---------- */
  // deps: { tasks, prevTasks, habits, year, month, numDays, now, focusMinutes,
  //        timeblocks, projects, weekdayLabel, energyLabel, periodProgress,
  //        projectProgress }
  function computeInsights(deps) {
    const d = deps || {};
    const now = d.now || new Date();
    const year = d.year != null ? d.year : (typeof PLAN_YEAR !== 'undefined' ? PLAN_YEAR : now.getFullYear());
    const month = d.month != null ? d.month : (typeof PLAN_MONTH !== 'undefined' ? PLAN_MONTH : now.getMonth());
    const numDays = d.numDays != null ? d.numDays : (typeof NUM_DAYS !== 'undefined' ? NUM_DAYS : new Date(year, month + 1, 0).getDate());
    const tasks = d.tasks || flattenTasks(typeof state !== 'undefined' ? state : null);
    const habits = d.habits || (typeof state !== 'undefined' && state && Array.isArray(state.habits) ? state.habits : []);
    const prevTasks = d.prevTasks || readPrevTasks(year, month);
    const focusMinutes = d.focusMinutes != null ? d.focusMinutes : defaultFocusMinutes();
    const timeblocks = asList(d.timeblocks, 'blocks') || defaultTimeblocks();
    const projects = asList(d.projects, 'projects') || defaultProjects();
    const weekdayLabel = d.weekdayLabel || defaultWeekdayLabel;
    const energyLabel = d.energyLabel || defaultEnergyLabel;
    const periodProgress = d.periodProgress || defaultPeriodProgress();
    const progressFn = d.projectProgress ||
      (typeof window !== 'undefined' && window.TaskFlowProjects && typeof window.TaskFlowProjects.projectProgress === 'function'
        ? window.TaskFlowProjects.projectProgress
        : null);

    const out = [];
    const push = (ins) => { if (ins) out.push(ins); };

    push(durationCompletion(tasks));
    push(repeatedOverdue(tasks, prevTasks, now));
    push(plannedCompleted(tasks));
    push(focusCompletion(tasks, focusMinutes));
    push(habitConsistency(habits, periodProgress, year, month, numDays, now));
    push(overloadedWeekday(timeblocks, year, month, weekdayLabel));
    push(projectVelocity(projects, tasks, now, progressFn));
    push(timeOfDay(tasks));
    push(energyCompletion(tasks, energyLabel));

    return out;
  }

  return { MIN_SAMPLES, computeInsights, flattenTasks };
});
