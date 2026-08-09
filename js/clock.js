// TaskFlow — now/clock helpers (tách từ app.js trong P11 refactor, extraction 18).
// Gồm: nowInfo(planStart, numDays) — ĐỔI SIGNATURE (trước đọc PLAN_START/NUM_DAYS
// global, giờ nhận tham số — pattern habitStreakCached) + renderClock() giữ signature
// (DOM #nowText; fmtDate qua globalThis.TaskFlowDates, dateLocale qua TaskFlowI18N).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowClock = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function getDates() {
    return (typeof globalThis !== 'undefined' && globalThis.TaskFlowDates) || null;
  }

  function getI18n() {
    return (typeof globalThis !== 'undefined' && globalThis.TaskFlowI18N) || null;
  }

  // Vị trí hiện tại trong plan grid: dayIdx 0-based, week 1-based, dayInWeek, habitCol.
  function nowInfo(planStart, numDays) {
    const now = new Date();
    const dayIdx = Math.floor((now - planStart) / 86400000);
    const inRange = dayIdx >= 0 && dayIdx < numDays;
    return {
      now,
      dayIdx,
      inRange,
      week: inRange ? Math.floor(dayIdx / 7) + 1 : null,
      dayInWeek: inRange ? dayIdx % 7 : null,
      habitCol: inRange ? dayIdx : -1,
    };
  }

  function renderClock() {
    if (typeof document === 'undefined') return;
    const box = document.getElementById('nowText');
    if (!box) return;
    const n = new Date();
    const dates = getDates();
    const i18n = getI18n();
    const fmt = dates && dates.fmtDate ? dates.fmtDate : (d) => d.toLocaleDateString();
    const loc = i18n && i18n.dateLocale ? i18n.dateLocale() : 'en-GB';
    box.textContent = fmt(n) + ' · ' + n.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  return { nowInfo, renderClock };
});
