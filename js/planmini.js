// TaskFlow — mini plan/report helpers (tách từ app.js trong P11 refactor, extraction 17).
// Gồm: psStart(s, y, m) (ngày bắt đầu grid của tháng — state.start hoặc fallback ngày 1)
// + shortMonth(m) (nhãn tháng ngắn: 'T1' tiếng Việt / 'JAN' tiếng Anh). GIỮ signature
// 100%. getLang + MONTH_NAMES access qua globalThis.TaskFlowI18N (i18n.js load trước,
// export sẵn MONTH_NAMES — không cần duplicate; Node: guard optional).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowPlanMini = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function getI18n() {
    return (typeof globalThis !== 'undefined' && globalThis.TaskFlowI18N) || null;
  }

  // Ngày bắt đầu grid của tháng (state lưu field start; thiếu thì fallback ngày 1)
  function psStart(s, y, m) {
    if (s && s.start) return s.start;
    return new Date(y, m, 1);
  }

  function shortMonth(m) {
    const i18n = getI18n();
    if (i18n && i18n.getLang && i18n.getLang() === 'vi') return 'T' + (m + 1);
    const names = i18n && i18n.MONTH_NAMES ? i18n.MONTH_NAMES : null;
    return names ? names[m].slice(0, 3).toUpperCase() : String(m + 1);
  }

  return { psStart, shortMonth };
});
