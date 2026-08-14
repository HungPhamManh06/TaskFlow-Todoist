// TaskFlow — Today Dashboard (tách từ app.js trong P11 refactor, extraction 34 — R19).
// Gồm: todayGreeting, todayWeekdayLabel, renderToday, totalFocusMinutesToday, taskRowHTML
// (row renderer dùng chung cho week/today).
// LƯU Ý coupling: module này KHÔNG sở hữu state app; resolve dependencies qua global
// lexical tại thời điểm GỌI — pattern mood.js/popups.js:
//   t, esc, dateLocale, fmtDeadline, dayLabel (TaskFlowI18N/TaskFlowUtil), checkboxHTML
//   (TaskFlowXP), nowInfo (TaskFlowClock), habitStreakCached (TaskFlowStreak),
//   formatFocusTime (TaskFlowUtil), loadPomoLog (TaskFlowStorage), pomoDateKey (TaskFlowKeys),
//   window.TaskFlowUI, window.TaskFlowAlignment, emptyStateHTML, taskFocusSecs/taskFocusLog, carriedDateLabel,
//   state, viewedMonth, tagFilter, PLAN_START/NUM_DAYS/PLAN_YEAR/PLAN_MONTH
// Đều nằm trong global lexical của app.js (script load sau) hoặc window — resolve runtime.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowToday = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // V1.1: cache store projects mỗi lần render (đọc localStorage 1 lần, không mỗi row).
  let projectsStoreCache = { version: 1, projects: [] };
  function refreshProjectsStoreCache() {
    try {
      if (window.TaskFlowProjects) projectsStoreCache = window.TaskFlowProjects.loadProjects();
    } catch (e) { /* ẩn */ }
  }
  function projectsChip(task) {
    if (!window.TaskFlowProjectsUI || !window.TaskFlowProjectsUI.taskProjectChip) return '';
    try { return window.TaskFlowProjectsUI.taskProjectChip(projectsStoreCache, task); } catch (e) { return ''; }
  }

  function todayGreeting() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return t('todayGreetingMorning');
    if (h >= 12 && h < 18) return t('todayGreetingAfternoon');
    return t('todayGreetingEvening');
  }

  function todayWeekdayLabel() {
    return new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function renderToday() {
    const el = document.getElementById('view-today');
    if (!el) return;
    const ti = nowInfo(PLAN_START, NUM_DAYS);
    // Đang xem tháng khác (viewedMonth !== null) → "hôm nay" không thuộc tháng đang xem:
    // ẩn tasks/habits để không hiển thị nhầm ngày tương ứng trong lịch tháng khác.
    const inTodayMonth = viewedMonth === null && ti.inRange;
    const w = inTodayMonth ? state.weeks[ti.week - 1] : null;
    const d = w && w.days[ti.dayInWeek];
    const tasks = d && Array.isArray(d.tasks) ? d.tasks : [];
    const done = tasks.filter((tk) => tk.done).length;
    const total = tasks.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const habits = Array.isArray(state.habits) ? state.habits : [];
    // Habit.days[] được index theo ngày-trong-tháng (0-based) — nhất quán với overview/week/day view.
    // KHÔNG dùng ti.dayIdx (số ngày từ PLAN_START neo theo thứ của tuần đầu) — sẽ lệch vài ngày.
    const habitIdx = viewedMonth === null && ti.inRange ? new Date().getDate() - 1 : -1;
    const habitTodayDate = habitIdx >= 0 ? new Date() : null;
    // V1.4 — Flexible schedules: chỉ hiển thị habit ĐẾN HẠN hôm nay. daily luôn hiển thị;
    // weekdays chỉ vào ngày được chọn; weekly_count/monthly_count hiển thị khi mục tiêu
    // kỳ hiện tại CHƯA đạt (optional progress) và ẩn khi đã đạt. Legacy không schedule → daily.
    const habitsToday = habits.filter((h) => {
      if (habitIdx < 0) return false;
      if (Array.isArray(h.skipDays) && h.skipDays.includes(habitIdx)) return false;
      const H = window.TaskFlowHabits;
      const hs = H && H.scheduleOf ? H.scheduleOf(h) : { type: 'daily' };
      if (hs.type === 'daily') return true;
      if (hs.type === 'weekdays') return H.isDueToday(hs, habitTodayDate);
      const pr = H.periodProgress(hs, Array.isArray(h.days) ? h.days : [], h.target, PLAN_YEAR, PLAN_MONTH, NUM_DAYS, habitTodayDate);
      return pr.pct < 100;
    });
    const habitsDone = habitsToday.filter((h) => Array.isArray(h.days) && h.days[habitIdx] === true).length;
    const alignmentGroups = window.TaskFlowAlignment.collectDailyAlignment(state, {
      inTodayMonth,
      week: ti.week,
      day: ti.dayInWeek,
      dayIndex: habitIdx,
    });
    const alignmentHTML = window.TaskFlowAlignment.alignmentCardHTML(alignmentGroups, {
      inTodayMonth,
      dayLabel: todayWeekdayLabel(),
      t,
      esc,
      checkboxHTML,
      checkboxLabel: window.TaskFlowUI.checkboxLabel,
    });

    refreshProjectsStoreCache();
    const taskRows = tasks.length
      ? tasks.map((tk, i) => {
          const timed = tk.remind && tk.remind.enabled && tk.remind.time;
          return `<div class="today-task ${tk.done ? 'done' : ''}">
        ${checkboxHTML(tk.kind === 'priority' ? 'pink' : 'blue', tk.done, `data-action="task" data-week="${ti.week}" data-day="${ti.dayInWeek}" data-task="${i}"`, window.TaskFlowUI.checkboxLabel('task', tk.text, todayWeekdayLabel()))}
        <span class="task-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="task-text" data-week="${ti.week}" data-day="${ti.dayInWeek}" data-task="${i}" data-placeholder="${t('taskPh')}" aria-label="${t('taskAria', { n: i + 1 })}">${esc(tk.text ?? '')}</span>
        ${tk.kind === 'priority' ? `<span class="badge badge-accent today-prio">${t('todayPriority')}</span>` : ''}
        ${timed ? `<span class="today-task-time">${esc(timed)}</span>` : ''}
        ${projectsChip(tk)}
        ${tk.done ? '' : `<button type="button" class="btn-del" data-action="deltask" data-week="${ti.week}" data-day="${ti.dayInWeek}" data-task="${i}" aria-label="${t('delTaskAria', { n: i + 1 })}" title="${t('delTaskAria', { n: i + 1 })}">${window.TaskFlowUI.icon('trash')}</button>`}
      </div>`;
        }).join('')
      : emptyStateHTML('🎯', 'todayEmpty', 'todayEmptySub', [
          { label: t('emptyAddToday'), action: 'shell-add-task' },
          { label: t('emptyGoUpcoming'), action: 'nav', attrs: 'data-view="upcoming"' },
        ]);

    const habitRows = habitsToday.length
      ? habitsToday.map((h) => {
          const on = Array.isArray(h.days) && h.days[habitIdx] === true;
          const H = window.TaskFlowHabits;
          const hs = H && H.scheduleOf ? H.scheduleOf(h) : { type: 'daily' };
          let run = habitStreakCached(h).cur;
          if ((hs.type === 'weekly_count' || hs.type === 'monthly_count') && H && H.runInfo) {
            run = H.runInfo(hs, Array.isArray(h.days) ? h.days : [], h.target, PLAN_YEAR, PLAN_MONTH, NUM_DAYS, habitTodayDate).cur;
          }
          const schedLbl = typeof habitSchedLabel === 'function' ? habitSchedLabel(hs) : '';
          return `<div class="today-habit${on ? ' done' : ''}">
        ${checkboxHTML('', on, `data-action="habit" data-id="${esc(h.id)}" data-day="${habitIdx}"`, window.TaskFlowUI.checkboxLabel('habit', h.name, todayWeekdayLabel()))}
        <span class="today-habit-name">${esc(h.name)}</span>
        ${schedLbl ? `<span class="today-habit-sched" title="${esc(schedLbl)}">${esc(schedLbl)}</span>` : ''}
        <span class="today-habit-streak" title="${t('overviewMetricStreakMeta')}">🔥<span>${run}</span></span>
      </div>`;
        }).join('')
      : `<p class="today-habits-empty">${t('todayHabitsEmpty')} <button type="button" class="empty-btn" data-action="habit-focus" title="${t('emptyAddHabit')}">${t('emptyAddHabit')}</button></p>`;

    const focusMinutes = totalFocusMinutesToday();
    el.innerHTML = `<div class="today-page">
    <header class="today-header">
      <p class="today-greeting">${esc(todayGreeting())}</p>
      <h1 class="today-date">${esc(todayWeekdayLabel())}</h1>
      ${window.TaskFlowPlannerUI ? `<button type="button" class="today-planner-btn" data-action="planner-open" aria-label="${t('plannerOpen')}">${window.TaskFlowUI.icon('calendar')}<span>${t('plannerOpen')}</span></button>` : ''}
    </header>
    ${alignmentHTML}
    <div class="today-grid">
      <div class="today-main">
        <section class="today-card today-tasks-card" aria-label="${t('todayTasksTitle')}">
          <div class="today-card-head">
            <h2 class="today-card-title">${t('todayTasksTitle')}</h2>
            <span class="today-count" data-role="today-count">${done}/${total}</span>
          </div>
          <div class="today-progress" role="progressbar" aria-label="${t('todayProgress')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
            <span class="today-progress-fill" data-role="today-progress-fill" style="width:${pct}%"></span>
          </div>
          <div class="today-task-list" data-role="today-task-list">${taskRows}</div>
          <button type="button" class="btn-add-today" data-action="today-addtask" aria-label="${t('todayAddTask')}">${window.TaskFlowUI.icon('plus')}<span>${t('todayAddTask')}</span></button>
        </section>
      </div>
      <aside class="today-side">
        <section class="today-card" aria-label="${t('todayHabitsTitle')}">
          <div class="today-card-head">
            <h2 class="today-card-title">${t('todayHabitsTitle')}</h2>
            <span class="today-count">${habitsDone}/${habitsToday.length}</span>
          </div>
          <div class="today-habit-list" data-role="today-habit-list">${habitRows}</div>
        </section>
        <section class="today-card today-focus-card" aria-label="${t('todayFocusTitle')}">
          <div class="today-card-head">
            <h2 class="today-card-title">${t('todayFocusTitle')}</h2>
          </div>
          <div class="today-focus-time">${formatFocusTime(focusMinutes)}</div>
          <p class="today-focus-tip">${t('todayFocusTip')}</p>
          <button type="button" class="button button-primary today-focus-btn" data-action="focus">${window.TaskFlowUI.icon('focus')}<span>${t('todayFocusStart')}</span></button>
        </section>
      </aside>
    </div>
    ${window.TaskFlowReflection ? window.TaskFlowReflection.reflectionCardHTML() : ''}
  </div>`;
  }

  function totalFocusMinutesToday() {
    const log = loadPomoLog();
    const k = pomoDateKey(new Date());
    const entry = log[k];
    return entry && typeof entry.secs === 'number' ? Math.round(entry.secs / 60) : 0;
  }

  function taskRowHTML(wn, di, ti, mod, task, pos) {
    const tags = Array.isArray(task.tags) ? task.tags : [];
    const timed = task.remind && task.remind.enabled && task.remind.time;
    const repeated = task.repeat && task.repeat.freq;
    // Meta line: giờ (remind) · badge P1 · indicator lặp · hạn chót — hiển thị gọn dưới text, chỉ khi có thông tin
    const metaBits = [];
    if (task.kind === 'priority') metaBits.push(`<span class="task-prio badge badge-accent">${t('taskPriorityLabel')}</span>`);
    if (timed) metaBits.push(`<span class="task-meta-time" title="${t('remindTaskAria')}">${window.TaskFlowUI.icon('bell')}<span>${esc(timed)}</span></span>`);
    if (repeated) metaBits.push(`<span class="task-meta-repeat" title="${t('taskMetaRepeat')}">${window.TaskFlowUI.icon('repeat')}</span>`);
    if (task.deadline) metaBits.push(`<span class="task-meta-deadline" title="${esc(fmtDeadline(task.deadline))}">${window.TaskFlowUI.icon('calendar')}<span>${esc(fmtDeadline(task.deadline))}</span></span>`);
    if (taskFocusSecs(task) > 0) metaBits.push(`<span class="task-meta-focus" title="${t('focusLogTotal', { n: Math.round(taskFocusSecs(task) / 60) })}">${window.TaskFlowUI.icon('focus')}<span>${esc(formatFocusTime(Math.round(taskFocusSecs(task) / 60)))}</span></span>`);
    const meta = metaBits.length ? `<span class="task-meta">${metaBits.join('')}</span>` : '';
    const pjChip = projectsChip(task);
    return `<div class="task-row${tagFilter && !tags.includes(tagFilter) ? ' filtered-out' : ''}${task.carriedFrom ? ' carried' : ''}${task.done ? ' done' : ''}" data-testid="task-row" draggable="true" data-drag="task" data-week="${wn}" data-day="${di}" data-task="${ti}" data-kind="${task.kind}" data-pos="${pos ?? 0}" title="${t('dragHint')}" aria-label="${t('dragHint')}">
    ${checkboxHTML(mod, task.done, `data-action="task" data-week="${wn}" data-day="${di}" data-task="${ti}"`, window.TaskFlowUI.checkboxLabel('task', task.text, `${t('weekN', { n: wn })}, ${dayLabel(di)}`))}
    ${task.carriedFrom ? `<span class="carried-badge" title="${t('carriedFrom', { date: carriedDateLabel(task.carriedFrom) })}" aria-label="${t('carriedFrom', { date: carriedDateLabel(task.carriedFrom) })}">↳</span>` : ''}
    <span class="task-main">
      <span class="task-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="task-text" data-week="${wn}" data-day="${di}" data-task="${ti}" data-placeholder="${t('taskPh')}" aria-label="${t('taskAria', { n: ti + 1 })}">${esc(task.text ?? '')}</span>
      ${meta}
    </span>
    ${pjChip}
    ${tags.length ? `<span class="task-tags">${tags.map((tg) => `<span class="tag-chip" data-tag="${esc(tg)}">#${esc(tg)}</span>`).join('')}</span>` : ''}
    <span class="task-row-actions">
      <button type="button" class="task-focus-btn" data-action="focus-task" data-week="${wn}" data-day="${di}" data-task="${ti}" title="${t('taskFocusBtn')}" aria-label="${t('taskFocusBtn')}">${window.TaskFlowUI.icon('focus')}</button>
      <button type="button" class="task-menu-open" data-action="task-menu" data-week="${wn}" data-day="${di}" data-task="${ti}" title="${t('taskMenu')}" aria-label="${t('taskMenu')}" aria-haspopup="menu" aria-expanded="false">${window.TaskFlowUI.icon('more')}</button>
      <span class="task-menu" role="menu" hidden>
        <button type="button" role="menuitem" data-action="task-detail" data-week="${wn}" data-day="${di}" data-task="${ti}">${window.TaskFlowUI.icon('data')} <span>${t('taskDetail')}</span></button>
        <button type="button" role="menuitem" data-action="task-move" data-week="${wn}" data-day="${di}" data-task="${ti}">${window.TaskFlowUI.icon('calendar')} <span>${t('taskMove')}</span></button>
        <button type="button" role="menuitem" data-action="remind-task" data-week="${wn}" data-day="${di}" data-task="${ti}">${window.TaskFlowUI.icon('bell')} <span>${t('remindTitle')}</span>${task.remind && task.remind.enabled ? ' <span class="task-menu-on" aria-hidden="true">●</span>' : ''}</button>
        <button type="button" role="menuitem" data-action="tag-edit" data-week="${wn}" data-day="${di}" data-task="${ti}">${window.TaskFlowUI.icon('tag')} <span>${t('tagAdd')}</span></button>
        <button type="button" role="menuitem" data-action="repeat-edit" data-week="${wn}" data-day="${di}" data-task="${ti}">${window.TaskFlowUI.icon('repeat')} <span>${t('repeatTitle')}</span>${repeated ? ' <span class="task-menu-on" aria-hidden="true">●</span>' : ''}</button>
        <button type="button" role="menuitem" data-action="task-duplicate" data-week="${wn}" data-day="${di}" data-task="${ti}">${window.TaskFlowUI.icon('copy')} <span>${t('taskDuplicate')}</span></button>
        <button type="button" role="menuitem" class="danger" data-action="deltask" data-week="${wn}" data-day="${di}" data-task="${ti}">${window.TaskFlowUI.icon('trash')} <span>${t('delTaskAria', { n: ti + 1 })}</span></button>
      </span>
    </span>
  </div>`;
  }

  return { todayGreeting, todayWeekdayLabel, renderToday, totalFocusMinutesToday, taskRowHTML };
});
