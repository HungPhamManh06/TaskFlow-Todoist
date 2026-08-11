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

  function weekTarget(metric, eligibleDays, monthDays) {
    const rawTarget = metric && metric.target && typeof metric.target === 'object' ? metric.target : {};
    const modes = ['daily', 'perWeek', 'perMonth', 'custom'];
    const mode = modes.includes(rawTarget.mode) ? rawTarget.mode : 'daily';
    const numericValue = Number(rawTarget.value);
    const value = Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
    if (!Number.isFinite(eligibleDays) || eligibleDays <= 0) return null;
    let target;
    if (mode === 'daily') target = eligibleDays;
    else if (mode === 'perWeek') target = value * eligibleDays / 7;
    else target = Number.isFinite(monthDays) && monthDays > 0 ? value * eligibleDays / monthDays : 0;
    return Number.isFinite(target) && target > 0 ? target : null;
  }

  function linkedMetricIds(task) {
    return task && Array.isArray(task.linkedMetricIds)
      ? task.linkedMetricIds.filter((id) => typeof id === 'string')
      : [];
  }

  function weekTasks(days) {
    return days.flatMap((day) => {
      const tasks = day.record && Array.isArray(day.record.tasks) ? day.record.tasks : [];
      return tasks.filter((task) => task && typeof task.text === 'string' && task.text.trim());
    });
  }

  function resultFrom(done, target) {
    if (!Number.isFinite(target) || target <= 0) return null;
    const safeDone = Number.isFinite(done) && done > 0 ? done : 0;
    return {
      done: safeDone,
      target,
      pct: Math.min(100, Math.max(0, Math.round((safeDone / target) * 100))),
    };
  }

  function weeklyMetricProgress(state, week, metric, context) {
    if (!state || typeof state !== 'object' || !metric || typeof metric !== 'object') return null;
    const days = weekCalendarDays(week, context);
    const inMonthDays = days.filter((day) => day.inMonth);
    const eligibleDays = inMonthDays.length;
    const monthDays = context && Number(context.monthDays);
    const type = typeof metric.type === 'string' ? metric.type : '';

    if (type === 'HABIT') {
      const habits = Array.isArray(state.habits) ? state.habits : [];
      const habit = habits.find((item) => item && item.id === metric.linkedHabitId);
      if (!habit) return null;
      const available = inMonthDays.filter((day) => !Array.isArray(habit.skipDays) || !habit.skipDays.includes(day.dayIndex));
      const done = available.filter((day) => Array.isArray(habit.days) && habit.days[day.dayIndex] === true).length;
      const mode = metric.target && metric.target.mode;
      const target = mode === 'daily' || !['perWeek', 'perMonth', 'custom'].includes(mode)
        ? (available.length || null)
        : weekTarget(metric, eligibleDays, monthDays);
      return resultFrom(done, target);
    }

    if (type === 'MANUAL' || type === 'CUSTOM') {
      const done = inMonthDays.filter((day) => Array.isArray(metric.days) && metric.days[day.dayIndex] === true).length;
      return resultFrom(done, weekTarget(metric, eligibleDays, monthDays));
    }

    if ((type === 'TASK' || type === 'FOCUS') && typeof metric.id !== 'string') return null;
    const tasks = weekTasks(days).filter((task) => linkedMetricIds(task).includes(metric.id));

    if (type === 'TASK') {
      const done = tasks.filter((task) => task.done === true).length;
      return resultFrom(done, weekTarget(metric, eligibleDays, monthDays));
    }

    if (type === 'FOCUS') {
      if (!inMonthDays.length) return null;
      const startKey = inMonthDays[0].dateKey;
      const endKey = inMonthDays[inMonthDays.length - 1].dateKey;
      const seconds = tasks.reduce((total, task) => {
        const log = Array.isArray(task.focusLog) ? task.focusLog : [];
        return total + log.reduce((sum, entry) => {
          if (!entry || typeof entry.d !== 'string' || entry.d < startKey || entry.d > endKey) return sum;
          const secs = Number(entry.secs);
          return sum + (Number.isFinite(secs) && secs > 0 ? secs : 0);
        }, 0);
      }, 0);
      return resultFrom(Math.round(seconds / 60), weekTarget(metric, eligibleDays, monthDays));
    }

    return null;
  }

  function weeklyPillarScores(state, week, context) {
    const pillars = state && Array.isArray(state.pillars) ? state.pillars : [];
    return pillars.filter((pillar) => pillar && pillar.hidden !== true).map((pillar) => {
      const metrics = Array.isArray(pillar.metrics) ? pillar.metrics : [];
      const results = metrics.map((metric) => weeklyMetricProgress(state, week, metric, context)).filter(Boolean);
      if (!results.length) return null;
      return {
        id: pillar.id,
        name: pillar.name,
        icon: pillar.icon,
        pct: Math.round(results.reduce((sum, result) => sum + result.pct, 0) / results.length),
        metricCount: results.length,
      };
    }).filter(Boolean);
  }

  function buildWeeklyReviewModel(state, weekIndex, options) {
    const source = state && typeof state === 'object' ? state : {};
    const weeks = Array.isArray(source.weeks) ? source.weeks : [];
    const safeIndex = Number.isInteger(weekIndex) && weekIndex >= 0 ? weekIndex : 0;
    ensureWeeklyReviews(source, Math.max(weeks.length, safeIndex + 1));
    const week = weeks[safeIndex] && typeof weeks[safeIndex] === 'object'
      ? weeks[safeIndex]
      : { n: safeIndex + 1, days: [] };
    const opts = options && typeof options === 'object' ? options : {};
    const legacyWeeks = source.reflections && Array.isArray(source.reflections.weeks)
      ? source.reflections.weeks
      : [];
    const legacyAnswers = Array.isArray(legacyWeeks[safeIndex]) ? legacyWeeks[safeIndex] : [];
    const prompts = Array.isArray(opts.legacyPrompts) ? opts.legacyPrompts : [];
    const legacy = legacyAnswers.map((answer, index) => ({
      prompt: typeof prompts[index] === 'string' ? prompts[index] : '',
      answer: typeof answer === 'string' ? answer : '',
    })).filter((item) => item.answer.trim());
    return {
      weekIndex: safeIndex,
      weekNumber: Number.isInteger(week.n) ? week.n : safeIndex + 1,
      review: normalizeReview(source.weeklyReviews[safeIndex]),
      summary: weeklySummary(week, source.habits, opts.focusMinutes, opts),
      pillars: weeklyPillarScores(source, week, opts),
      legacy,
    };
  }

  function updateReviewField(state, weekIndex, field, value, priorityIndex, nowISO) {
    if (!state || typeof state !== 'object' || !Number.isInteger(weekIndex) || weekIndex < 0) return null;
    const count = Math.max(
      weekIndex + 1,
      Array.isArray(state.weeks) ? state.weeks.length : 0,
      Array.isArray(state.weeklyReviews) ? state.weeklyReviews.length : 0
    );
    ensureWeeklyReviews(state, count);
    const review = state.weeklyReviews[weekIndex];
    const text = typeof value === 'string' ? value : '';
    if (['best', 'blocker', 'learned', 'change'].includes(field)) review[field] = text;
    else if (field === 'priority' && Number.isInteger(priorityIndex) && priorityIndex >= 0 && priorityIndex < 3) review.priorities[priorityIndex] = text;
    else return null;
    review.updatedAt = typeof nowISO === 'string' ? nowISO : new Date().toISOString();
    return review;
  }

  function reviewFieldHTML(field, labelKey, review, model, options) {
    const id = `weekly-review-${model.weekIndex}-${field}`;
    return `<label class="weekly-review-field" for="${id}">
      <span>${options.t(labelKey)}</span>
      <textarea class="weekly-review-textarea" id="${id}" data-week-review-field="${field}" data-week-index="${model.weekIndex}" maxlength="1000">${options.esc(review[field] || '')}</textarea>
    </label>`;
  }

  function weeklyReviewHTML(model, options) {
    const data = model && typeof model === 'object' ? model : {};
    const opts = options && typeof options === 'object' ? options : {};
    const t = typeof opts.t === 'function' ? opts.t : (key) => key;
    const esc = typeof opts.esc === 'function' ? opts.esc : (value) => String(value ?? '');
    const formatFocusTime = typeof opts.formatFocusTime === 'function' ? opts.formatFocusTime : (minutes) => String(minutes || 0);
    const renderOptions = { t, esc };
    const review = normalizeReview(data.review);
    const summary = data.summary && typeof data.summary === 'object' ? data.summary : {};
    const pillars = Array.isArray(data.pillars) ? data.pillars : [];
    const legacy = Array.isArray(data.legacy) ? data.legacy : [];
    const weekIndex = Number.isInteger(data.weekIndex) ? data.weekIndex : 0;
    const weekNumber = Number.isInteger(data.weekNumber) ? data.weekNumber : weekIndex + 1;
    const fieldModel = { weekIndex };
    const pillarHTML = pillars.length ? pillars.map((pillar) => `<div class="weekly-review-pillar" data-testid="weekly-review-pillar">
      <div class="weekly-review-pillar-head"><span><span aria-hidden="true">${esc(pillar.icon || '')}</span>${esc(pillar.name || '')}</span><strong>${pillar.pct}%</strong></div>
      <div class="weekly-review-pillar-bar" role="progressbar" aria-label="${esc(pillar.name || '')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pillar.pct}"><span style="width:${pillar.pct}%"></span></div>
    </div>`).join('') : `<p class="weekly-review-empty">${t('weeklyReviewNoPillars')}</p>`;
    const legacyHTML = legacy.length ? `<details class="weekly-review-legacy" data-testid="weekly-review-legacy">
      <summary>${t('weeklyReviewLegacy')}</summary>
      <div>${legacy.map((item) => `<div class="weekly-review-legacy-item"><strong>${esc(item.prompt || '')}</strong><p>${esc(item.answer || '')}</p></div>`).join('')}</div>
    </details>` : '';
    return `<section class="card weekly-review-card" data-testid="weekly-review" aria-labelledby="weeklyReviewTitle-${weekIndex}">
      <div class="weekly-review-head"><div><p class="week-page-eyebrow">${t('weeklyReviewSummary')}</p><h2 id="weeklyReviewTitle-${weekIndex}" class="week-section-title">${t('weeklyReviewTitle', { n: weekNumber })}</h2></div><span class="weekly-review-status" data-testid="weekly-review-status" role="status" aria-live="polite">${review.updatedAt ? t('weeklyReviewSaved') : ''}</span></div>
      <div class="weekly-review-summary-grid" data-testid="weekly-review-summary" aria-label="${t('weeklyReviewSummary')}">
        <div class="weekly-review-summary-cell"><span>${t('weeklyReviewTasks')}</span><strong>${t('weeklyReviewTaskValue', { done: summary.tasksDone || 0, total: summary.tasksTotal || 0, pct: summary.tasksPct || 0 })}</strong></div>
        <div class="weekly-review-summary-cell"><span>${t('weeklyReviewHabits')}</span><strong>${t('weeklyReviewHabitValue', { done: summary.habitsDone || 0, total: summary.habitsTotal || 0, pct: summary.habitsPct || 0 })}</strong></div>
        <div class="weekly-review-summary-cell"><span>${t('weeklyReviewFocus')}</span><strong>${esc(formatFocusTime(summary.focusMinutes || 0))}</strong></div>
      </div>
      <div class="weekly-review-pillars"><h3>${t('weeklyReviewPillars')}</h3>${pillarHTML}</div>
      <div class="weekly-review-fields">
        ${reviewFieldHTML('best', 'weeklyReviewBest', review, fieldModel, renderOptions)}
        ${reviewFieldHTML('blocker', 'weeklyReviewBlocker', review, fieldModel, renderOptions)}
        ${reviewFieldHTML('learned', 'weeklyReviewLearned', review, fieldModel, renderOptions)}
        ${reviewFieldHTML('change', 'weeklyReviewChange', review, fieldModel, renderOptions)}
      </div>
      <fieldset class="weekly-review-priorities"><legend>${t('weeklyReviewPriorities')}</legend>${review.priorities.map((priority, index) => {
        const id = `weekly-review-${weekIndex}-priority-${index}`;
        return `<label class="weekly-review-priority" for="${id}"><span>${t('weeklyReviewPriority', { n: index + 1 })}</span><input id="${id}" type="text" value="${esc(priority)}" data-week-review-field="priority" data-week-index="${weekIndex}" data-priority-index="${index}" maxlength="200"></label>`;
      }).join('')}</fieldset>
      ${legacyHTML}
    </section>`;
  }

  let savedStatusTimer = null;
  function setSaveStatus(text) {
    if (typeof document === 'undefined') return;
    const status = document.querySelector('[data-testid="weekly-review-status"]');
    if (status) status.textContent = typeof text === 'string' ? text : '';
  }

  function scheduleSavedStatus(callback, delay) {
    clearTimeout(savedStatusTimer);
    savedStatusTimer = setTimeout(() => {
      savedStatusTimer = null;
      if (typeof callback === 'function') callback();
    }, Number.isFinite(delay) && delay >= 0 ? delay : 450);
    return savedStatusTimer;
  }

  return {
    emptyReview,
    normalizeReview,
    ensureWeeklyReviews,
    weekCalendarDays,
    weeklySummary,
    weekTarget,
    weeklyMetricProgress,
    weeklyPillarScores,
    buildWeeklyReviewModel,
    weeklyReviewHTML,
    updateReviewField,
    setSaveStatus,
    scheduleSavedStatus,
  };
});
