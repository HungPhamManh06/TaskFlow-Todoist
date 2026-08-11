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

  function alignmentItemHTML(item, options) {
    const escape = options.esc;
    const dayLabel = options.dayLabel || '';
    if (item.kind === 'task') {
      const task = item.task || {};
      const done = task.done === true;
      const attrs = `data-action="task" data-week="${item.week}" data-day="${item.day}" data-task="${item.taskIndex}"`;
      const checkbox = options.checkboxHTML('', done, attrs, options.checkboxLabel('task', task.text || '', dayLabel));
      return `<div class="today-alignment-item${done ? ' done' : ''}" data-testid="alignment-item" data-alignment-kind="task" data-alignment-key="${escape(item.key)}">
        ${checkbox}<span class="today-alignment-text">${escape(task.text || '')}</span>
      </div>`;
    }
    const habit = item.habit || {};
    const done = Array.isArray(habit.days) && habit.days[item.dayIndex] === true;
    const attrs = `data-action="habit" data-id="${escape(habit.id || '')}" data-day="${item.dayIndex}"`;
    const checkbox = options.checkboxHTML('', done, attrs, options.checkboxLabel('habit', habit.name || '', dayLabel));
    return `<div class="today-alignment-item${done ? ' done' : ''}" data-testid="alignment-item" data-alignment-kind="habit" data-alignment-key="${escape(item.key)}">
      ${checkbox}<span class="today-alignment-text">${escape(habit.name || '')}</span>
    </div>`;
  }

  function alignmentGroupHTML(group, options) {
    const items = Array.isArray(group && group.items) ? group.items : [];
    const pillar = group && group.pillar ? group.pillar : {};
    const done = items.filter((item) => item.kind === 'task'
      ? item.task && item.task.done === true
      : item.habit && Array.isArray(item.habit.days) && item.habit.days[item.dayIndex] === true).length;
    return `<section class="today-alignment-pillar" data-testid="alignment-pillar" aria-label="${options.esc(pillar.name || '')}">
      <div class="today-alignment-pillar-head">
        <span class="today-alignment-pillar-name"><span aria-hidden="true">${options.esc(pillar.icon || '')}</span>${options.esc(pillar.name || '')}</span>
        <span class="today-alignment-count">${options.t('todayAlignmentCount', { done, total: items.length })}</span>
      </div>
      <div class="today-alignment-list">${items.map((item) => alignmentItemHTML(item, options)).join('')}</div>
    </section>`;
  }

  function alignmentCardHTML(groups, options) {
    const list = Array.isArray(groups) ? groups : [];
    const opts = options || {};
    const body = opts.inTodayMonth === false
      ? `<p class="today-alignment-empty">${opts.t('todayAlignmentUnavailable')}</p>`
      : list.length
        ? list.map((group) => alignmentGroupHTML(group, opts)).join('')
        : `<p class="today-alignment-empty">${opts.t('todayAlignmentEmpty')}</p>`;
    return `<section class="today-card today-alignment-card" data-testid="daily-alignment" aria-labelledby="dailyAlignmentTitle">
      <div class="today-card-head"><h2 class="today-card-title" id="dailyAlignmentTitle">${opts.t('todayAlignmentTitle')}</h2></div>
      <div class="today-alignment-groups">${body}</div>
    </section>`;
  }

  return { collectDailyAlignment, alignmentCardHTML };
});
