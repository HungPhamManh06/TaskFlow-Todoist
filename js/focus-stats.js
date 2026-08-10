// TaskFlow — Focus stats (tách từ app.js trong P11 refactor, extraction 37).
// Gồm: pomoDaySecs, focusWeekMinutes, focusMonthMinutes, topFocusTasksInWeek,
// topFocusTasksInMonth, taskFocusMinLabel. taskFocusSecsInRange là helper RIÊNG
// (chỉ được gọi từ topFocusTasksInWeek/Month) — không expose.
// Deps resolve qua global lexical tại thời điểm GỌI — pattern mood.js/popups.js:
//   t, state, PLAN_START/PLAN_YEAR/PLAN_MONTH/NUM_DAYS, loadPomoLog, pomoDateKey,
//   taskFocusLog (TaskFlowFocus — js/focus.js, extraction 39)
// Report-ui.js + year-report.js gọi các hàm này qua global lexical của app.js
// (app.js giữ alias từ destructure) — không import trực tiếp.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowFocusStats = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Số giây focus của một ngày cụ thể (từ pomo log — hợp nhất pomo + task-focus).
  function pomoDaySecs(date) {
    const log = loadPomoLog();
    const e = log[pomoDateKey(date)];
    return e && typeof e.secs === 'number' ? e.secs : 0;
  }

  // Phút focus 7 ngày của một tuần (Mon → Sun) — mặc định tuần hiện tại, truyền week để tính tuần khác.
  function focusWeekMinutes(week) {
    const wn = week ?? state.currentWeek;
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(PLAN_START.getTime() + ((wn - 1) * 7 + i) * 86400000);
      out.push(Math.round(pomoDaySecs(d) / 60));
    }
    return out;
  }

  // Tổng phút focus của tháng đang xem (chỉ tính các ngày thuộc tháng — bỏ ô tràn grid).
  function focusMonthMinutes() {
    let secs = 0;
    for (let i = 0; i < NUM_DAYS; i++) {
      const d = new Date(PLAN_START.getTime() + i * 86400000);
      if (d.getFullYear() === PLAN_YEAR && d.getMonth() === PLAN_MONTH) secs += pomoDaySecs(d);
    }
    return Math.round(secs / 60);
  }

  // Tổng giây focus của task trong khoảng [startKey, endKey] (date key 'YYYY-MM-DD').
  function taskFocusSecsInRange(tk, startKey, endKey) {
    return taskFocusLog(tk).filter((e) => e.d >= startKey && e.d <= endKey).reduce((s, e) => s + (e.secs || 0), 0);
  }

  // Top N task có thời gian focus nhiều nhất trong tuần (từ task.focusLog của chính tuần đó).
  function topFocusTasksInWeek(w, n) {
    const start = new Date(PLAN_START.getTime() + (w.n - 1) * 7 * 86400000);
    const end = new Date(start.getTime() + 6 * 86400000);
    const sk = pomoDateKey(start), ek = pomoDateKey(end);
    const acc = [];
    w.days.forEach((d) => (d.tasks || []).forEach((tk) => {
      const secs = taskFocusSecsInRange(tk, sk, ek);
      if (secs > 0) acc.push({ tk, secs });
    }));
    acc.sort((a, b) => b.secs - a.secs);
    return acc.slice(0, n);
  }

  // Top N task có focus nhiều nhất trong tháng đang xem.
  function topFocusTasksInMonth(n) {
    const mKey = PLAN_YEAR + '-' + String(PLAN_MONTH + 1).padStart(2, '0');
    const sk = mKey + '-01';
    const last = new Date(PLAN_YEAR, PLAN_MONTH + 1, 0).getDate();
    const ek = mKey + '-' + String(last).padStart(2, '0');
    const acc = [];
    state.weeks.forEach((w) => w.days.forEach((d) => (d.tasks || []).forEach((tk) => {
      const secs = taskFocusSecsInRange(tk, sk, ek);
      if (secs > 0) acc.push({ tk, secs });
    })));
    acc.sort((a, b) => b.secs - a.secs);
    return acc.slice(0, n);
  }

  // Nhãn phút focus ngắn (VD: '25p') từ giây.
  function taskFocusMinLabel(secs) { return t('pomoMinShort', { n: Math.round((secs || 0) / 60) }); }

  return { pomoDaySecs, focusWeekMinutes, focusMonthMinutes, topFocusTasksInWeek, topFocusTasksInMonth, taskFocusMinLabel };
});
