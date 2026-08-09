// TaskFlow — export helpers (tách từ app.js trong P11 refactor, extraction 12).
// Gồm: downloadFile(name, content, mime) thuần (Blob + DOM), collectAllData(legacyKey)
// (đổi signature nhận LEGACY_KEY tham số), exportJSON(legacyKey). trackEvent gọi qua
// globalThis.TaskFlowAnalytics (browser: analytics.js load trước; Node: guard optional).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowExport = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function getAnalytics() {
    return (typeof globalThis !== 'undefined' && globalThis.TaskFlowAnalytics) || null;
  }

  function downloadFile(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  function collectAllData(legacyKey) {
    const out = { app: 'taskflow-todoist', version: 1, exportedAt: new Date().toISOString(), keys: {} };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('planner-') || k === legacyKey) out.keys[k] = localStorage.getItem(k);
      }
    } catch (e) { /* ẩn */ }
    return out;
  }

  function exportJSON(legacyKey) {
    const date = new Date().toISOString().slice(0, 10);
    downloadFile('taskflow-todoist-backup-' + date + '.json', JSON.stringify(collectAllData(legacyKey), null, 2), 'application/json');
    const a = getAnalytics();
    if (a && a.trackEvent) a.trackEvent('export_json');
  }

  return { downloadFile, collectAllData, exportJSON };
});
