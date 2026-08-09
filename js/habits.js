// TaskFlow — habit day helpers (tách từ app.js trong P11 refactor, extraction 7).
// Gồm: habitDaysElapsed(y, m, numDays), dayAggregate(state, d), heatLevel(pct) —
// không phụ thuộc global ngoài tham số, dễ unit test.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowHabits = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function habitDaysElapsed(y, m, numDays) {
    // Số ngày ĐÃ TRÔI QUA tính đến hôm nay (tháng y/m) — hoặc cả tháng nếu xem tháng khác.
    const now = new Date();
    const inRange = now.getFullYear() === y && now.getMonth() === m;
    return inRange ? Math.min(now.getDate(), numDays) : numDays;
  }

  function dayAggregate(state, d) {
    if (!state.habits.length) return 0;
    let sum = 0;
    state.habits.forEach((h) => { if (h.days[d]) sum++; });
    return Math.round((sum / state.habits.length) * 100);
  }

  function heatLevel(pct) {
    if (pct >= 100) return 5;
    if (pct >= 75) return 4;
    if (pct >= 50) return 3;
    if (pct >= 25) return 2;
    if (pct > 0) return 1;
    return 0;
  }

  return { habitDaysElapsed, dayAggregate, heatLevel };
});
