// TaskFlow — Sao lưu tự động (tách từ app.js trong P11 refactor, extraction 38 — A27).
// Gồm: rotateBackup (xoay 7 slot), maybeAutoBackup (throttle 1/phút, gọi sau mỗi save),
// listBackups/open/closeBackupModal (modal khôi phục), doRestoreBackup (khôi phục slot).
// Module lazy: KHÔNG nằm trong chuỗi script boot — nạp lần đầu sau save (ensureLazyModule,
// best-effort) hoặc khi mở modal Khôi phục (runLazyModule ở dispatcher).
// Phụ thuộc app-level (backupSlotKey/collectAllData/LEGACY_KEY/dateLocale/t/TaskFlowUI) —
// resolve qua global scope tại thời điểm GỌI (pattern inbox/chat/search/stats-ui).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowBackup = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

/* ---------- Sao lưu tự động (Phase 5.4) ---------- */

const BACKUP_SLOTS = 7;
function rotateBackup(data) {
  try {
    let idx = 0;
    try { idx = (+localStorage.getItem('planner-backup-idx') || -1) + 1; } catch (e) { /* ẩn */ }
    idx = ((idx % BACKUP_SLOTS) + BACKUP_SLOTS) % BACKUP_SLOTS;
    localStorage.setItem('planner-backup-idx', String(idx));
    localStorage.setItem(backupSlotKey(idx), JSON.stringify({ savedAt: new Date().toISOString(), data }));
  } catch (e) {
    // Hết quota: xoá toàn bộ slot cũ rồi thử lại 1 lần
    try {
      for (let i = 0; i < BACKUP_SLOTS; i++) localStorage.removeItem(backupSlotKey(i));
      localStorage.setItem(backupSlotKey(0), JSON.stringify({ savedAt: new Date().toISOString(), data }));
      localStorage.setItem('planner-backup-idx', '0');
    } catch (e2) { /* ẩn */ }
  }
}
let lastBackupTs = 0;
function maybeAutoBackup() {
  const now = Date.now();
  if (now - lastBackupTs < 60000) return; // tối đa 1 lần/phút — tránh ghi đè liên tục khi gõ text
  lastBackupTs = now;
  try { rotateBackup(collectAllData(LEGACY_KEY)); } catch (e) { /* ẩn */ }
}
function listBackups() {
  const out = [];
  for (let i = 0; i < BACKUP_SLOTS; i++) {
    try {
      const raw = localStorage.getItem(backupSlotKey(i));
      if (!raw) continue;
      const b = JSON.parse(raw);
      if (b && b.data && b.data.keys) out.push({ idx: i, savedAt: b.savedAt, keys: Object.keys(b.data.keys).length });
    } catch (e) { /* ẩn */ }
  }
  return out.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}
function openBackupModal() {
  const m = document.getElementById('backupModal');
  if (!m) return;
  const box = document.getElementById('backupList');
  const list = listBackups();
  if (box) {
    box.innerHTML = list.length
      ? list.map((b) => `<button type="button" class="backup-row" data-action="backup-use" data-idx="${b.idx}"><span>🕑 ${new Date(b.savedAt).toLocaleString(dateLocale())}</span><small>${t('backupSlot', { n: b.keys })}</small></button>`).join('')
      : `<p class="pop-note">${t('backupEmpty')}</p>`;
  }
  TaskFlowUI.openDialog('backupModal');
}
function closeBackupModal() {
  TaskFlowUI.closeDialog('backupModal');
}
function doRestoreBackup(idx) {
  try {
    const b = JSON.parse(localStorage.getItem(backupSlotKey(idx)));
    if (!b || !b.data || !b.data.keys) return;
    if (!confirm(t('backupRestoreConfirm'))) return;
    // Không khôi phục token đăng nhập / chính các slot backup (tránh ghi đè phiên + vòng lặp backup)
    Object.keys(b.data.keys).forEach((k) => {
      if (k === 'planner-token' || k === 'planner-backup-idx' || k.startsWith('planner-backup-')) return;
      try { localStorage.setItem(k, b.data.keys[k]); } catch (e) { /* ẩn */ }
    });
    TaskFlowUI.toast(t('backupRestoreDone'), 'success');
    window.setTimeout(() => location.reload(), 450);
  } catch (e) { /* ẩn */ }
}

  return { rotateBackup, maybeAutoBackup, openBackupModal, closeBackupModal, doRestoreBackup };
});
