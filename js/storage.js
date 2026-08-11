// TaskFlow — storage core (tách từ app.js trong P11 refactor, extraction 3).
// Gồm: read/write month state, pomo log, backup slot key — các helper thuần
// không phụ thuộc app.js state (chỉ dùng localStorage + window.Sync push).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowStorage = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const POMO_LOG_KEY = 'planner-pomo-log';

  function monthStateRaw(y, m) {
    try {
      const raw = localStorage.getItem('planner-' + y + '-' + (m + 1));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const M = typeof globalThis !== 'undefined' && globalThis.TaskFlowDataMigrations;
      const s = M ? M.migrateMonthState(parsed, { year: y, month: m + 1 }) : parsed;
      if (M && parsed.schemaVersion !== M.VERSION) {
        try { localStorage.setItem('planner-' + y + '-' + (m + 1), JSON.stringify(s)); } catch (e) { /* read still succeeds */ }
      }
      if (!s || !Array.isArray(s.habits)) return null;
      return s;
    } catch (e) { return null; }
  }

  function saveMonthState(y, m, s) {
    if (s && typeof s === 'object') s.schemaVersion = 2;
    try { localStorage.setItem('planner-' + y + '-' + (m + 1), JSON.stringify(s)); } catch (e) { return false; }
    if (typeof window !== 'undefined' && window.Sync) window.Sync.push('planner-' + y + '-' + (m + 1));
    return true;
  }

  function loadPomoLog() {
    try { return JSON.parse(localStorage.getItem(POMO_LOG_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function savePomoLog(log) {
    try { localStorage.setItem(POMO_LOG_KEY, JSON.stringify(log)); } catch (e) { /* ẩn */ }
    if (typeof window !== 'undefined' && window.Sync) window.Sync.push(POMO_LOG_KEY);
  }

  function backupSlotKey(i) { return 'planner-backup-' + i; }

  return { POMO_LOG_KEY, monthStateRaw, saveMonthState, loadPomoLog, savePomoLog, backupSlotKey };
});
