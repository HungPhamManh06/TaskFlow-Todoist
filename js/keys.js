// TaskFlow — date key generators (tách từ app.js trong P11 refactor, extraction 8).
// Gồm: pomoDateKey(d) thuần (YYYY-MM-DD từ Date), moodDateKey(d, y, m) —
// nhận năm/tháng tham số thay vì đọc PLAN_YEAR/PLAN_MONTH global, dễ unit test.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowKeys = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // YYYY-MM-DD local (không lệch UTC) từ Date — key cho pomo log / focus stats.
  function pomoDateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Key ngày cho mood map: d có thể là số (ngày trong tháng) hoặc label "DD/MM"
  // (tuần cắt ngang tháng). Nhận (y, m) tham số — tháng hiện tại trong app.js.
  function moodDateKey(d, y, m) {
    if (typeof d === 'number') return y + '-' + (m + 1) + '-' + d;
    const parts = String(d).split('/');
    return y + '-' + parts[1] + '-' + parts[0];
  }

  return { pomoDateKey, moodDateKey };
});
