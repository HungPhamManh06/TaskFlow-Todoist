// TaskFlow — Upcoming (Công việc sắp tới) (tách từ app.js trong P11 refactor, extraction 36 — R25).
// Gồm: setUpcomingRange, tasksForDate, upcomingOverdueTasks, upcomingCollect, upcomingDayHeader,
// upcomingTaskMeta, upcomingTaskRowHTML, renderUpcoming, pushTaskToDate. upcomingRange là state
// RIÊNG của module (key 'planner-upcoming-range').
// pushTaskToDate dùng CHUNG với inbox.js + quick-add.js (cả hai resolve qua global lexical
// của app.js) — module phải expose + app.js phải giữ alias.
// Deps resolve qua global lexical tại thời điểm GỌI — pattern mood.js/popups.js:
//   t, esc, dateLocale, fmtDeadline, fmtDate, checkboxHTML (TaskFlowXP), window.TaskFlowUI,
//   emptyStateHTML, inboxTargetForDate (TaskFlowInbox), monthStateRaw/loadMonthStateOrCreate/
//   saveMonthState (TaskFlowStorage), save, trackEvent, state, PLAN_YEAR/PLAN_MONTH/PLAN_START/
//   NUM_WEEKS
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowUpcoming = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ============================ Upcoming — Công việc sắp tới ============================ */
  // Hiển thị task từ hôm nay đến +N ngày (7/14/30), nhóm theo ngày, quá hạn riêng.
  // Task thuộc tháng hiện tại đọc từ `state`; tháng khác đọc qua monthStateRaw (không tạo state mới).
  let upcomingRange = 14;
  const UPCOMING_RANGE_KEY = 'planner-upcoming-range';
  // P1.2 — progressive disclosure cho danh sách quá hạn dài: hiện tối đa
  // OVERDUE_LIMIT dòng, phần còn lại qua nút "Xem thêm N" (không ẩn vĩnh viễn
  // — tất cả task vẫn truy cập được qua nút, keyboard + screen-reader).
  const OVERDUE_LIMIT = 15;
  let overdueExpanded = false;

  try { const r = +localStorage.getItem(UPCOMING_RANGE_KEY); if (r === 7 || r === 14 || r === 30) upcomingRange = r; } catch (e) { /* ẩn */ }

  function setUpcomingRange(n) {
    if (n !== 7 && n !== 14 && n !== 30) return;
    upcomingRange = n;
    try { localStorage.setItem(UPCOMING_RANGE_KEY, String(n)); } catch (e) { /* ẩn */ }
    renderUpcoming();
    trackEvent('upcoming_range', { days: n });
  }

  // Quy ước: task của ngày D nằm trong lưới tháng đang xem (PLAN_START → +NUM_WEEKS*7 ngày)
  // nếu D nằm trong lưới đó — khớp cách view Lịch hiển thị (kể cả ngày ngoài tháng).
  // Ngược lại đọc từ chính tháng của D (monthStateRaw — không tạo state mới cho tháng tương lai).
  function tasksForDate(dt) {
    const inCur = Math.floor((dt - PLAN_START) / 86400000);
    if (inCur >= 0 && inCur < NUM_WEEKS * 7) {
      const w = state.weeks[Math.floor(inCur / 7)];
      const d = w && w.days && w.days[inCur % 7];
      return d ? { y: PLAN_YEAR, m: PLAN_MONTH, week: Math.floor(inCur / 7) + 1, day: inCur % 7, tasks: d.tasks || [] } : null;
    }
    const y = dt.getFullYear(), m = dt.getMonth();
    const first = new Date(y, m, 1);
    const dow = (first.getDay() + 6) % 7; // Thứ 2 = 0
    const start = new Date(first.getTime() - dow * 86400000);
    const dayIdx = Math.floor((dt - start) / 86400000);
    if (dayIdx < 0) return null;
    const st = monthStateRaw(y, m);
    if (!st) return null;
    const w = st.weeks && st.weeks[Math.floor(dayIdx / 7)];
    const d = w && w.days && w.days[dayIdx % 7];
    return d ? { y, m, week: Math.floor(dayIdx / 7) + 1, day: dayIdx % 7, tasks: d.tasks || [] } : null;
  }

  // Gom task từ PLAN_START (đầu lưới tháng đang xem) đến hôm qua → quá hạn (chưa xong).
  function upcomingOverdueTasks() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const out = [];
    const start = new Date(PLAN_START.getTime());
    const end = today.getTime() - 86400000; // hôm qua
    for (let t = start.getTime(); t <= end; t += 86400000) {
      const ref = tasksForDate(new Date(t));
      if (!ref) continue;
      (ref.tasks || []).forEach((tk, ti) => {
        if (!tk.done) out.push({ ...ref, task: ti, tk, date: new Date(t) });
      });
    }
    return out;
  }

  // Tổng task trong cửa sổ cố định tính từ hôm nay (không phụ thuộc upcomingRange đang chọn)
  // — chỉ dùng dữ liệu đã có, phục vụ header density (P3).
  function upcomingSummaryCounts() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const countIn = (n) => {
      let c = 0;
      for (let i = 0; i < n; i++) {
        const ref = tasksForDate(new Date(today.getTime() + i * 86400000));
        if (ref && ref.tasks) c += ref.tasks.length;
      }
      return c;
    };
    return { today: countIn(1), d7: countIn(7), d30: countIn(30) };
  }

  // Gom task từ hôm nay → +upcomingRange ngày. Không trùng task (mỗi ngày quét đúng 1 lần).
  function upcomingCollect() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = [];
    for (let i = 0; i < upcomingRange; i++) {
      const dt = new Date(today.getTime() + i * 86400000);
      const ref = tasksForDate(dt);
      const list = ref ? (ref.tasks || []).map((tk, ti) => ({ ...ref, task: ti, tk, date: dt })) : [];
      // Sort: task có giờ theo giờ tăng dần; task không giờ nằm cuối ngày; done xếp dưới cùng.
      list.sort((a, b) => {
        const ad = a.tk.done ? 1 : 0, bd = b.tk.done ? 1 : 0;
        if (ad !== bd) return ad - bd;
        const at = a.tk.remind && a.tk.remind.enabled && a.tk.remind.time ? a.tk.remind.time : '99:99';
        const bt = b.tk.remind && b.tk.remind.enabled && b.tk.remind.time ? b.tk.remind.time : '99:99';
        return at.localeCompare(bt);
      });
      days.push({ date: dt, ref, tasks: list });
    }
    return days;
  }

  function upcomingDayHeader(dt, i) {
    if (i === 0) return t('upcomingTodayLabel');
    if (i === 1) return t('upcomingTomorrowLabel');
    return dt.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // Meta gọn cho dòng Upcoming: giờ · thời lượng · P1 · deadline · repeat · tags.
  function upcomingTaskMeta(tk) {
    const bits = [];
    const timed = tk.remind && tk.remind.enabled && tk.remind.time;
    if (timed) bits.push(timed);
    if (tk.duration) bits.push(t('pomoMinShort', { n: tk.duration }));
    if (tk.kind === 'priority') bits.push(t('taskPriorityLabel'));
    if (tk.deadline) bits.push(fmtDeadline(tk.deadline));
    if (tk.repeat && tk.repeat.freq) bits.push(t('repeatTitle'));
    const tags = Array.isArray(tk.tags) ? tk.tags : [];
    return { bits, tags };
  }

  function upcomingTaskRowHTML(r) {
    const { tk, date, y, m, week, day, task } = r;
    const data = `data-y="${y}" data-m="${m}" data-week="${week}" data-day="${day}" data-task="${task}"`;
    const { bits, tags } = upcomingTaskMeta(tk);
    const check = checkboxHTML(tk.kind === 'priority' ? 'pink' : 'blue', tk.done, `data-action="task" ${data}`, window.TaskFlowUI.checkboxLabel('task', tk.text, fmtDate(date)));
    const meta = bits.length ? `<span class="up-meta">${bits.map((b) => `<span>${esc(b)}</span>`).join('<span class="up-dot">·</span>')}</span>` : '';
    const tagsHTML = tags.length ? `<span class="task-tags">${tags.map((tg) => `<span class="tag-chip" data-tag="${esc(tg)}">#${esc(tg)}</span>`).join('')}</span>` : '';
    return `<div class="up-task-row${tk.done ? ' done' : ''}${tk.kind === 'priority' ? ' prio' : ''}">
    ${check}
    <span class="up-main" data-action="task-detail" ${data} role="button" tabindex="0"
      aria-label="${t('taskDetail')}: ${esc(tk.text || '')}">
      <span class="up-text">${esc(tk.text ?? '')}</span>
      ${meta}
      ${tagsHTML}
    </span>
    ${tk.done ? '' : `<button type="button" class="up-focus" data-action="focus-task" ${data} title="${t('taskFocusBtn')}" aria-label="${t('taskFocusBtn')}">${window.TaskFlowUI.icon('focus')}</button>`}
  </div>`;
  }

  function renderUpcoming() {
    const el = document.getElementById('view-upcoming');
    if (!el) return;
    const overdue = upcomingOverdueTasks();
    const days = upcomingCollect();
    const hasAny = overdue.length || days.some((d) => d.tasks.length);
    // P1.2: nếu danh sách quá hạn dài (> OVERDUE_LIMIT) và chưa mở rộng, chỉ vẽ
    // OVERDUE_LIMIT dòng + nút "Xem thêm N". Khi đã mở rộng, vẽ đủ + nút Thu gọn.
    const overdueVisible = overdueExpanded ? overdue : overdue.slice(0, OVERDUE_LIMIT);
    const overdueHidden = overdue.length - overdueVisible.length;
    const summary = upcomingSummaryCounts();
    const summaryChip = (n, label) => `<span class="up-summary-chip"><b>${n}</b>${esc(label)}</span>`;
    const summaryHTML = `<div class="up-summary" role="list" aria-label="${t('upcomingSummaryAria')}">
      ${summaryChip(overdue.length, t('upcomingOverdue'))}
      ${summaryChip(summary.today, t('upcomingTodayLabel'))}
      ${summaryChip(summary.d7, t('upcomingRange7'))}
      ${summaryChip(summary.d30, t('upcomingRange30'))}
    </div>`;
    const rangeBtn = (n) => `<button type="button" class="up-range-btn${upcomingRange === n ? ' active' : ''}" data-action="upcoming-range" data-days="${n}" aria-pressed="${upcomingRange === n}">${t('upcomingRange' + n)}</button>`;
    const overdueMoreBtn = overdueHidden > 0
      ? `<button type="button" class="up-overdue-more" data-action="upcoming-overdue-toggle" aria-expanded="false" aria-controls="up-overdue-body">${t('upcomingOverdueMore', { n: overdueHidden })}<span class="up-overdue-more-n">${overdueHidden}</span></button>`
      : (overdueExpanded ? `<button type="button" class="up-overdue-more" data-action="upcoming-overdue-toggle" aria-expanded="true" aria-controls="up-overdue-body">${t('upcomingOverdueShowLess')}</button>` : '');
    const overdueHTML = overdue.length ? `<section class="up-group up-overdue" aria-label="${t('upcomingOverdueAria')}">
    <h2 class="up-group-head overdue"><span class="up-overdue-dot" aria-hidden="true"></span>${t('upcomingOverdue')}<span class="up-count">${overdue.length}</span></h2>
    <div class="up-group-body" id="up-overdue-body">${overdueVisible.map((r) => upcomingTaskRowHTML(r)).join('')}</div>
    ${overdueMoreBtn}
  </section>` : '';
    const daysHTML = days.map((d, i) => {
      if (!d.tasks.length) return '';
      return `<section class="up-group" aria-label="${t('upcomingDayAria', { d: upcomingDayHeader(d.date, i) })}">
      <h2 class="up-group-head${i === 0 ? ' today' : ''}">${esc(upcomingDayHeader(d.date, i))}<span class="up-count">${d.tasks.length}</span></h2>
      <div class="up-group-body">${d.tasks.map((r) => upcomingTaskRowHTML(r)).join('')}</div>
    </section>`;
    }).join('');
    const emptyHTML = !hasAny ? emptyStateHTML('🗓️', 'upcomingEmpty', 'upcomingEmptySub', [
      { label: t('emptyPlanWeek'), action: 'nav', attrs: 'data-view="week"' },
    ]) : '';
    el.innerHTML = `<div class="upcoming-page">
    <header class="upcoming-header">
      <div>
        <p class="upcoming-eyebrow">${t('upcomingEyebrow')}</p>
        <h1 class="upcoming-title">${t('upcomingTitle')}</h1>
        <p class="upcoming-subtitle">${t('upcomingSubtitle')}</p>
      </div>
      <div class="up-range" role="group" aria-label="${t('upcomingRangeAria', { n: upcomingRange })}">
        ${rangeBtn(7)}${rangeBtn(14)}${rangeBtn(30)}
      </div>
    </header>
    ${summaryHTML}
    ${overdueHTML}
    ${daysHTML}
    ${emptyHTML}
  </div>`;
  }

  function toggleOverdueExpanded() {
    overdueExpanded = !overdueExpanded;
    renderUpcoming();
    trackEvent('upcoming_overdue_toggle', { expanded: overdueExpanded });
  }

  // Đặt 1 task vào ngày dt (lưới tháng đúng — tháng khác tạo qua loadMonthStateOrCreate).
  // Dùng chung cho: lên lịch từ Inbox, Quick Add. Trả về false nếu ngày không hợp lệ.
  function pushTaskToDate(tk, dt) {
    const tgt = inboxTargetForDate(dt);
    if (!tgt) return false;
    const st = (tgt.y === PLAN_YEAR && tgt.m === PLAN_MONTH) ? state : loadMonthStateOrCreate(tgt.y, tgt.m);
    const w = st && st.weeks && st.weeks[tgt.week - 1];
    if (!w || !Array.isArray(w.days) || !w.days[tgt.day] || !Array.isArray(w.days[tgt.day].tasks)) return false;
    w.days[tgt.day].tasks.push(tk);
    if (tgt.y === PLAN_YEAR && tgt.m === PLAN_MONTH) save(); else saveMonthState(tgt.y, tgt.m, st);
    return true;
  }

  return { setUpcomingRange, tasksForDate, upcomingOverdueTasks, upcomingCollect, upcomingDayHeader, upcomingTaskMeta, upcomingTaskRowHTML, renderUpcoming, pushTaskToDate, toggleOverdueExpanded, OVERDUE_LIMIT };
});
