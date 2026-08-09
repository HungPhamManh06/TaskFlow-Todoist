// TaskFlow — sync UI helpers (tách từ app.js trong P11 refactor, extraction 16).
// Gồm: syncStatusText(s) + syncErrorText(code) thuần (chỉ t()), syncFormValues()
// (DOM reads), updateSyncStatus() (DOM + window.Sync.getStatus + t). GIỮ signature
// 100%. t() qua globalThis.TaskFlowI18N; window.Sync qua getSync() — browser:
// i18n.js + sync.js load trước; Node: guard optional (trả 'off' khi không có Sync).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowSyncUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function getI18n() {
    return (typeof globalThis !== 'undefined' && globalThis.TaskFlowI18N) || null;
  }

  function getSync() {
    return (typeof globalThis !== 'undefined' && globalThis.window && globalThis.window.Sync) || null;
  }

  function t(key) {
    const i18n = getI18n();
    return i18n && i18n.t ? i18n.t(key) : key;
  }

  function syncStatusText(s) {
    switch (s) {
      case 'connecting': return t('syncStatusConnecting');
      case 'syncing': return t('syncStatusSyncing');
      case 'ready': return t('syncStatusReady');
      case 'signedout': return t('syncStatusSignedOut');
      case 'error': return t('syncStatusError');
      default: return t('syncStatusOff');
    }
  }

  function updateSyncStatus() {
    if (typeof document === 'undefined') return;
    const st = document.getElementById('syncStatus');
    if (!st) return;
    const sync = getSync();
    const s = (sync && sync.getStatus) ? sync.getStatus() : 'off';
    st.textContent = syncStatusText(s);
    st.dataset.status = s;
    const dot = document.getElementById('syncDot');
    if (dot) dot.dataset.status = s;
    const btn = document.getElementById('syncBtn');
    if (btn) {
      btn.dataset.status = s;
      btn.title = t('syncTitle') + ' - ' + syncStatusText(s);
    }
    const lo = document.getElementById('syncLogoutBtn');
    if (lo) lo.hidden = (s !== 'ready' && s !== 'syncing' && s !== 'connecting');
    const pf = document.getElementById('syncProfileBtn');
    if (pf) pf.hidden = lo ? lo.hidden : true;
  }

  function syncFormValues() {
    if (typeof document === 'undefined') return { user: '', pass: '', pass2: '' };
    const us = document.getElementById('syncUser');
    const pw = document.getElementById('syncPass');
    const pw2 = document.getElementById('syncPass2');
    return { user: us ? us.value.trim() : '', pass: pw ? pw.value : '', pass2: pw2 ? pw2.value : '' };
  }

  function syncErrorText(code) {
    switch (code) {
      case 'username-taken': return t('syncErrUsernameTaken');
      case 'bad-credentials': return t('syncErrBadCredentials');
      case 'network': return t('syncErrNetwork');
      case 'no-config': return t('syncNeedConfig');
      case 'too-many-requests': return t('syncErrRateLimited');
      default: return t('syncErrServer');
    }
  }

  return { syncStatusText, updateSyncStatus, syncFormValues, syncErrorText };
});
