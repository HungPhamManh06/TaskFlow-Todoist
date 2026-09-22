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
    const key = 'planner-' + y + '-' + (m + 1);
    // P1.3: đi qua storageSet (js/util.js) để ghi có phòng vệ hết dung lượng — dọn slot
    // sao lưu rồi ghi lại, bó tay thì BÁO người dùng thay vì im lặng không lưu.
    // Tra cứu lúc GỌI (không destructure lúc nạp) để không phụ thuộc thứ tự script.
    let ok = null;
    try {
      const util = (typeof globalThis !== 'undefined' && globalThis.TaskFlowUtil) || null;
      if (util && util.storageSet) ok = util.storageSet(key, JSON.stringify(s)).ok;
    } catch (e) { /* ẩn */ }
    if (ok === null) {
      try { localStorage.setItem(key, JSON.stringify(s)); ok = true; } catch (e) { ok = false; }
    }
    if (ok && typeof window !== 'undefined' && window.Sync) window.Sync.push(key);
    return ok;
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
