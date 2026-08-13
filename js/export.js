// TaskFlow — export helpers (tách từ app.js trong P11 refactor, extraction 12).
// Gồm: downloadFile(name, content, mime) thuần (Blob + DOM), collectAllData(legacyKey)
// (đổi signature nhận LEGACY_KEY tham số), exportJSON(legacyKey), và các export builder
// CSV/ICS (csvRow, exportCSV, icsEscape, icsDayFromDay, exportICS, legacyCSVRows) tách
// thêm ở extraction 30 (region R8 trong responsibility map). trackEvent gọi qua
// globalThis.TaskFlowAnalytics (browser: analytics.js load trước; Node: guard optional).
// Deps của export builder resolve qua global lexical tại thời điểm GỌI — pattern
// mood.js/popups.js: t, PLAN_YEAR, yearState, loadMonthStateOrCreate, window.PlanStats.
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

  function isReservedKey(key) {
    return key === 'planner-token'
      || key === 'planner-sync-meta'
      || key === 'planner-backup-idx'
      || key.startsWith('planner-backup-');
  }

  function collectAllData(legacyKey) {
    const out = { app: 'taskflow-todoist', version: 2, exportedAt: new Date().toISOString(), keys: {} };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !isReservedKey(k) && (k.startsWith('planner-') || k === legacyKey)) {
          out.keys[k] = localStorage.getItem(k);
        }
      }
    } catch (e) { /* ẩn */ }
    return out;
  }

  function migrations() {
    if (typeof globalThis !== 'undefined' && globalThis.TaskFlowDataMigrations) return globalThis.TaskFlowDataMigrations;
    if (typeof require === 'function') return require('./data-migrations.js');
    throw new Error('data-migrations-missing');
  }

  function prepareImport(raw) {
    let parsed;
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch (e) { return { ok: false, errors: ['invalid-json'] }; }
    const M = migrations();
    const check = M.validateSnapshot(parsed);
    if (!check.ok) return { ok: false, errors: check.errors };
    try {
      const fromVersion = parsed.version == null ? 1 : Number(parsed.version);
      let snapshot = M.migrateSnapshot(parsed);
      // V1.1 — Projects: task trỏ tới project/milestone không tồn tại trong snapshot import
      // → clear ref (KHÔNG xoá task). Guard optional cho Node test không nạp projects.js.
      if (typeof globalThis !== 'undefined' && globalThis.TaskFlowProjects
          && globalThis.TaskFlowProjects.sanitizeSnapshotRefs) {
        snapshot = globalThis.TaskFlowProjects.sanitizeSnapshotRefs(snapshot);
      }
      // V1.2 — TimeBlocks: block trỏ tới task không tồn tại trong snapshot → clear
      // taskUid (giữ block). Guard optional như Projects.
      if (typeof globalThis !== 'undefined' && globalThis.TaskFlowTimeBlocks
          && globalThis.TaskFlowTimeBlocks.sanitizeSnapshotRefs) {
        snapshot = globalThis.TaskFlowTimeBlocks.sanitizeSnapshotRefs(snapshot);
      }
      // V1.2.1 — Contexts: task.contexts chỉ giữ ID có trong store import (giữ task).
      if (typeof globalThis !== 'undefined' && globalThis.TaskFlowContexts
          && globalThis.TaskFlowContexts.sanitizeSnapshotRefs) {
        snapshot = globalThis.TaskFlowContexts.sanitizeSnapshotRefs(snapshot);
      }
      Object.keys(snapshot.keys).forEach((key) => {
        if (isReservedKey(key)) delete snapshot.keys[key];
      });
      return {
        ok: true,
        snapshot,
        preview: { fromVersion, toVersion: M.VERSION, keyCount: Object.keys(snapshot.keys).length },
      };
    } catch (e) {
      return { ok: false, errors: e.errors || [e.message || 'migration-failed'] };
    }
  }

  function applySnapshotTransactional(snapshot, storage) {
    const target = storage || localStorage;
    const keys = Object.keys(snapshot.keys || {}).filter((key) => !isReservedKey(key));
    const before = {};
    keys.forEach((key) => { before[key] = target.getItem(key); });
    try {
      keys.forEach((key) => target.setItem(key, snapshot.keys[key]));
      return { ok: true, keyCount: keys.length };
    } catch (error) {
      keys.forEach((key) => {
        try {
          if (before[key] === null) target.removeItem(key);
          else target.setItem(key, before[key]);
        } catch (rollbackError) { /* best effort for a broken storage provider */ }
      });
      return { ok: false, error };
    }
  }

  function exportJSON(legacyKey) {
    const date = new Date().toISOString().slice(0, 10);
    downloadFile('taskflow-todoist-backup-' + date + '.json', JSON.stringify(collectAllData(legacyKey), null, 2), 'application/json');
    const a = getAnalytics();
    if (a && a.trackEvent) a.trackEvent('export_json');
  }

  /* ==================== Export builders (R8, extraction 30) ==================== */

  function csvRow(row) {
    return row.map((c) => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',');
  }

  function exportCSV() {
    const date = new Date().toISOString().slice(0, 10);
    let rows;
    if (window.PlanStats) {
      // Hàm thuần: dựng toàn bộ rows từ 12 state tháng + yearState (unit-test ở phase2)
      const months = Array.from({ length: 12 }, (_, m) => loadMonthStateOrCreate(PLAN_YEAR, m));
      rows = window.PlanStats.buildCSVRows(months, yearState, t('csvNote'));
    } else {
      rows = legacyCSVRows();
    }
    downloadFile('taskflow-todoist-data-' + date + '.csv', rows.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
    const a = getAnalytics();
    if (a && a.trackEvent) a.trackEvent('export_csv');
  }

  // Xuất lịch .ics (Google Calendar / Apple Calendar / Outlook) — toàn bộ 12 tháng của năm.
  // Task có nhắc giờ (remind) → sự kiện có giờ cụ thể; còn lại là sự kiện cả ngày.
  function icsEscape(s) {
    return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function icsDayFromDay(d) {
    const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(d.date || ''));
    if (!m) return null;
    return new Date(2000 + (d.yy || 0), +m[2] - 1, +m[1]);
  }
  function exportICS() {
    const now = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const stamp = now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()) + 'T' + p2(now.getHours()) + p2(now.getMinutes()) + p2(now.getSeconds()) + 'Z';
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TaskFlow-Todoist//TaskFlow//VI',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:TaskFlow ' + PLAN_YEAR,
    ];
    const freqMap = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' };
    let uid = 1;
    for (let m = 0; m < 12; m++) {
      const s = loadMonthStateOrCreate(PLAN_YEAR, m);
      s.weeks.forEach((w, wi) => {
        (w.days || []).forEach((d, di) => {
          const dt = icsDayFromDay(d);
          if (!dt) return;
          const date = dt.getFullYear() + p2(dt.getMonth() + 1) + p2(dt.getDate());
          (d.tasks || []).forEach((tk) => {
            if (!tk.text || !tk.text.trim()) return;
            const timed = tk.remind && tk.remind.enabled && tk.remind.time;
            lines.push('BEGIN:VEVENT');
            lines.push('UID:taskflow-' + PLAN_YEAR + '-' + (m + 1) + '-' + (wi + 1) + '-' + (di + 1) + '-' + uid++ + '@taskflow-todoist');
            lines.push('DTSTAMP:' + stamp);
            lines.push('SUMMARY:' + icsEscape(tk.text));
            if (timed) lines.push('DTSTART:' + date + 'T' + String(tk.remind.time).replace(':', '') + '00');
            else lines.push('DTSTART;VALUE=DATE:' + date);
            if (tk.repeat && tk.repeat.freq && freqMap[tk.repeat.freq]) lines.push('RRULE:FREQ=' + freqMap[tk.repeat.freq]);
            // Lưu ý: không ghi STATUS:COMPLETED — RFC 5545 chỉ cho phép trạng thái này trên
            // VTODO/VJOURNAL, không hợp lệ trên VEVENT (Google/Apple có thể bỏ qua hoặc lỗi).
            lines.push('END:VEVENT');
          });
        });
      });
    }
    lines.push('END:VCALENDAR');
    downloadFile('taskflow-calendar-' + PLAN_YEAR + '.ics', lines.join('\r\n') + '\r\n', 'text/calendar;charset=utf-8');
    const a = getAnalytics();
    if (a && a.trackEvent) a.trackEvent('export_ics');
  }

  // Bản cũ (dự phòng nếu PlanStats chưa tải được) — giữ nguyên hành vi để không hồi quy.
  function legacyCSVRows() {
    const rows = [];
    const push = (row) => rows.push(csvRow(row));

    push(['TaskFlow Export', new Date().toISOString(), t('csvNote')]);

    push([]);
    push(['MonthlyGoals', 'Month', 'Kind', 'Text', 'Done']);
    for (let m = 0; m < 12; m++) {
      loadMonthStateOrCreate(PLAN_YEAR, m).monthlyGoals.forEach((g) => push(['MonthlyGoals', m + 1, g.kind, g.text, g.done ? 1 : 0]));
    }

    push([]);
    push(['Habits', 'Month', 'Habit', 'Day', 'Done']);
    for (let m = 0; m < 12; m++) {
      loadMonthStateOrCreate(PLAN_YEAR, m).habits.forEach((h) => {
        if (Array.isArray(h.days)) h.days.forEach((v, d) => { if (v) push(['Habits', m + 1, h.name, d + 1, 1]); });
      });
    }

    push([]);
    push(['Tasks', 'Month', 'Week', 'Day', 'Date', 'Kind', 'Text', 'Done']);
    for (let m = 0; m < 12; m++) {
      const s = loadMonthStateOrCreate(PLAN_YEAR, m);
      s.weeks.forEach((w) => {
        w.days.forEach((d, di) => {
          d.tasks.forEach((tk) => push(['Tasks', m + 1, w.n, di + 1, d.date, tk.kind, tk.text, tk.done ? 1 : 0]));
        });
      });
    }

    push([]);
    push(['MonthReflections', 'Month', 'Section', 'Index', 'Text']);
    for (let m = 0; m < 12; m++) {
      const s = loadMonthStateOrCreate(PLAN_YEAR, m);
      if (s.reflections && Array.isArray(s.reflections.overview)) {
        s.reflections.overview.forEach((r, i) => push(['MonthReflections', m + 1, 'overview', i + 1, r]));
        s.reflections.weeks.forEach((w, wi) => w.forEach((r, i) => push(['MonthReflections', m + 1, 'week' + (wi + 1), i + 1, r])));
      }
    }

    push([]);
    push(['YearGoals', 'Kind', 'Text', 'Done']);
    yearState.goals.forEach((g) => push(['YearGoals', g.kind, g.text, g.done ? 1 : 0]));

    push([]);
    push(['YearReflections', 'Scope', 'Index', 'Text']);
    Object.keys(yearState.reflections).forEach((scope) => {
      yearState.reflections[scope].forEach((r, i) => push(['YearReflections', scope, i + 1, r]));
    });

    push([]);
    push(['YearNotes', 'Month', 'Note']);
    yearState.monthNotes.forEach((n, m) => push(['YearNotes', m + 1, n]));

    return rows;
  }

  return { downloadFile, collectAllData, prepareImport, applySnapshotTransactional, exportJSON, exportCSV, exportICS };
});
