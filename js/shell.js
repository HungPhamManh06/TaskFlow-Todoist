// TaskFlow — plan shell helpers (tách từ app.js trong P11 refactor, extraction 19).
// Gồm: monthKey(py, pm) — ĐỔI SIGNATURE (trước đọc PLAN_YEAR/PLAN_MONTH global, giờ
// nhận tham số) + updateBrand(py, pm)/buildMonthNav(py, pm) — cũng đổi signature để
// module không đọc global. buildMonthNav dùng t/monthLabel/MONTH_NAMES qua
// globalThis.TaskFlowI18N (i18n.js export sẵn MONTH_NAMES — không duplicate).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowShell = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function getI18n() {
    return (typeof globalThis !== 'undefined' && globalThis.TaskFlowI18N) || null;
  }

  // Key localStorage của tháng đang xem: 'planner-2026-8'
  function monthKey(py, pm) {
    return 'planner-' + py + '-' + (pm + 1);
  }

  function updateBrand(py, pm) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('brandTitle');
    if (el) el.textContent = 'TaskFlow';
    const s = document.getElementById('brandSub');
    if (s) s.hidden = true;
    document.title = 'TaskFlow';
    buildMonthNav(py, pm);
  }

  function buildMonthNav(py, pm) {
    if (typeof document === 'undefined') return;
    const i18n = getI18n();
    const t = (i18n && i18n.t) ? i18n.t : (k) => k;
    const monthLabel = (i18n && i18n.monthLabel) ? i18n.monthLabel : (m) => String(m + 1);
    const names = (i18n && i18n.MONTH_NAMES) ? i18n.MONTH_NAMES : Array.from({ length: 12 }, (_, i) => String(i + 1));
    const options = names.map((n, m) => `<option value="${m}">${t('monthOption', { m: monthLabel(m), n: m + 1, y: py })}</option>`).join('');
    document.querySelectorAll('[data-action="monthselect"]').forEach((select) => {
      select.innerHTML = options;
      select.value = String(pm);
    });
  }

  return { monthKey, updateBrand, buildMonthNav };
});
