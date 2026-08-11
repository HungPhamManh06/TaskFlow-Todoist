// TaskFlow — Daily Alignment derived from existing monthly pillars, metrics, tasks and habits.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAlignment = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function collectDailyAlignment(state, context) {
    if (!context || context.inTodayMonth !== true) return [];
    const pillars = Array.isArray(state && state.pillars) ? state.pillars : [];
    const habits = Array.isArray(state && state.habits) ? state.habits : [];
    const week = Number.isInteger(context.week) ? context.week : 0;
    const day = Number.isInteger(context.day) ? context.day : -1;
    const dayIndex = Number.isInteger(context.dayIndex) ? context.dayIndex : -1;
    const weekState = state && Array.isArray(state.weeks) ? state.weeks[week - 1] : null;
    const dayState = weekState && Array.isArray(weekState.days) ? weekState.days[day] : null;
    const tasks = dayState && Array.isArray(dayState.tasks) ? dayState.tasks : [];

    return pillars.filter((pillar) => pillar && pillar.hidden !== true).map((pillar) => {
      const metrics = Array.isArray(pillar.metrics) ? pillar.metrics : [];
      const taskMetricIds = new Set(metrics
        .filter((metric) => metric && (metric.type === 'TASK' || metric.type === 'FOCUS') && typeof metric.id === 'string')
        .map((metric) => metric.id));
      const habitIds = new Set(metrics
        .filter((metric) => metric && metric.type === 'HABIT' && typeof metric.linkedHabitId === 'string')
        .map((metric) => metric.linkedHabitId));
      const items = [];

      tasks.forEach((task, taskIndex) => {
        const ids = task && Array.isArray(task.linkedMetricIds) ? task.linkedMetricIds : [];
        if (ids.some((id) => taskMetricIds.has(id))) {
          items.push({ kind: 'task', key: `${week}:${day}:${taskIndex}`, task, week, day, taskIndex });
        }
      });
      habits.forEach((habit) => {
        const skipped = habit && Array.isArray(habit.skipDays) && habit.skipDays.includes(dayIndex);
        if (habit && typeof habit.id === 'string' && habitIds.has(habit.id) && !skipped) {
          items.push({ kind: 'habit', key: habit.id, habit, dayIndex });
        }
      });
      return {
        pillar: { id: pillar.id, name: pillar.name, icon: pillar.icon },
        items,
      };
    }).filter((group) => group.items.length > 0);
  }

  return { collectDailyAlignment };
});
