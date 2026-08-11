// TaskFlow — Weekly Review derived from one selected week and additive month-state records.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowWeeklyReview = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function emptyReview() {
    return {
      best: '',
      blocker: '',
      learned: '',
      change: '',
      priorities: ['', '', ''],
      updatedAt: null,
    };
  }

  function normalizeReview(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = Object.assign({}, source, emptyReview());
    ['best', 'blocker', 'learned', 'change'].forEach((key) => {
      out[key] = typeof source[key] === 'string' ? source[key] : '';
    });
    const priorities = Array.isArray(source.priorities) ? source.priorities : [];
    out.priorities = [0, 1, 2].map((i) => typeof priorities[i] === 'string' ? priorities[i] : '');
    out.updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : null;
    return out;
  }

  function ensureWeeklyReviews(state, count) {
    if (!state || typeof state !== 'object') return [];
    const source = Array.isArray(state.weeklyReviews) ? state.weeklyReviews : [];
    const length = Number.isInteger(count) && count > 0 ? count : 0;
    state.weeklyReviews = Array.from({ length }, (_, i) => normalizeReview(source[i]));
    return state.weeklyReviews;
  }

  function localDateKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function weekCalendarDays(week, context) {
    const ctx = context && typeof context === 'object' ? context : {};
    const start = ctx.planStart instanceof Date && !Number.isNaN(ctx.planStart.getTime())
      ? ctx.planStart
      : new Date(0);
    const weekNumber = Number.isInteger(week && week.n) && week.n > 0 ? week.n : 1;
    const records = week && Array.isArray(week.days) ? week.days : [];
    return Array.from({ length: 7 }, (_, index) => {
      const offset = (weekNumber - 1) * 7 + index;
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
      const inMonth = date.getFullYear() === ctx.year && date.getMonth() === ctx.month;
      return {
        index,
        record: records[index] && typeof records[index] === 'object' ? records[index] : {},
        date,
        dateKey: localDateKey(date),
        inMonth,
        dayIndex: inMonth ? date.getDate() - 1 : -1,
      };
    });
  }

  function percentage(done, total) {
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }

  function weeklySummary(week, habits, focusMinutes, context) {
    const days = weekCalendarDays(week, context);
    const taskList = days.flatMap((day) => {
      const tasks = day.record && Array.isArray(day.record.tasks) ? day.record.tasks : [];
      return tasks.filter((task) => task && typeof task.text === 'string' && task.text.trim());
    });
    const tasksDone = taskList.filter((task) => task.done === true).length;
    const safeHabits = Array.isArray(habits) ? habits.filter((habit) => habit && typeof habit === 'object') : [];
    let habitsDone = 0;
    let habitsTotal = 0;
    days.filter((day) => day.inMonth).forEach((day) => {
      safeHabits.forEach((habit) => {
        const skipped = Array.isArray(habit.skipDays) && habit.skipDays.includes(day.dayIndex);
        if (skipped) return;
        habitsTotal += 1;
        if (Array.isArray(habit.days) && habit.days[day.dayIndex] === true) habitsDone += 1;
      });
    });
    const minutes = Number.isFinite(focusMinutes) && focusMinutes > 0 ? Math.round(focusMinutes) : 0;
    return {
      tasksDone,
      tasksTotal: taskList.length,
      tasksPct: percentage(tasksDone, taskList.length),
      habitsDone,
      habitsTotal,
      habitsPct: percentage(habitsDone, habitsTotal),
      focusMinutes: minutes,
    };
  }

  return {
    emptyReview,
    normalizeReview,
    ensureWeeklyReviews,
    weekCalendarDays,
    weeklySummary,
  };
});
