// TaskFlow — date helpers (tách từ app.js trong P11 refactor, extraction 5).
// Gồm: fmtDate, isDayToday, dayLabelShort — thuần, phụ thuộc i18n qua
// globalThis.TaskFlowI18N (browser: load trước app.js; Node test: set thủ công).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowDates = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function getI18n() {
    // Browser: window === globalThis và i18n.js set root.TaskFlowI18N (root = window).
    return (typeof globalThis !== 'undefined' && globalThis.TaskFlowI18N) || null;
  }

  // Hạn chót ngắn: '3/8/2026' theo locale hiện tại (vi-VN / en-GB).
  function fmtDate(d) {
    const i18n = getI18n();
    const loc = (i18n && i18n.dateLocale) ? i18n.dateLocale() : 'en-GB';
    return d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function isDayToday(d) {
    const now = new Date();
    return d.date === `${now.getDate()}/${now.getMonth() + 1}` && d.yy === now.getFullYear() % 100;
  }

  // Nhãn ngày ngắn cho biểu đồ cột (VI: T2…T7, CN · EN: Mon, Tue…).
  function dayLabelShort(di) {
    const i18n = getI18n();
    if (i18n && i18n.getLang && i18n.getLang() === 'vi') return di === 6 ? 'CN' : 'T' + (di + 2);
    return (i18n && i18n.dayLabel) ? i18n.dayLabel(di).slice(0, 3) : '';
  }

  return { fmtDate, isDayToday, dayLabelShort };
});
