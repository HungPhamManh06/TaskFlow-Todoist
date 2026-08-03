/* js/plan-stats.js — Tính toán thuần cho báo cáo & xuất dữ liệu:
   % tuần từ state tháng, yearMonthlyData, dựng rows CSV.
   Chạy được cả ở browser (window.PlanStats) lẫn Node (module.exports) để unit test. */
(function () {
  'use strict';

  // % hoàn thành mục tiêu tuần của 1 state tháng (weeks[].goals) — thuần, không đọc storage.
  function weekGoalPct(s) {
    if (!s || !Array.isArray(s.weeks) || !s.weeks.length) return 0;
    const pcts = s.weeks.map((w) => {
      const total = w.goals.length;
      const done = w.goals.filter((g) => g.done).length;
      return total ? Math.round((done / total) * 100) : 0;
    });
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  }

  // yearMonthlyData thuần: nhận hàm loadMonth(m) → state tháng (hoặc null) → [{pct, goals}].
  function yearMonthlyFrom(loadMonth, year) {
    const out = [];
    for (let m = 0; m < 12; m++) {
      const s = typeof loadMonth === 'function' ? loadMonth(m) : null;
      out.push({
        pct: weekGoalPct(s),
        goals: s && Array.isArray(s.monthlyGoals) ? s.monthlyGoals : [],
      });
    }
    return out;
  }

  // ---- CSV ----

  function csvRow(row) {
    return row.map((c) => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',');
  }

  // Dựng toàn bộ rows CSV từ 12 state tháng + yearState (thuần; months[i] = state tháng i hoặc null).
  function buildCSVRows(months, yearState, csvNote) {
    const rows = [];
    const push = (r) => rows.push(csvRow(r));

    push(['TaskFlow-Todoist Export', new Date().toISOString(), csvNote || '']);

    push([]);
    push(['MonthlyGoals', 'Month', 'Kind', 'Text', 'Done']);
    for (let m = 0; m < 12; m++) {
      const s = months[m];
      if (!s) continue;
      (s.monthlyGoals || []).forEach((g) => push(['MonthlyGoals', m + 1, g.kind, g.text, g.done ? 1 : 0]));
    }

    push([]);
    push(['Habits', 'Month', 'Habit', 'Day', 'Done']);
    for (let m = 0; m < 12; m++) {
      const s = months[m];
      if (!s) continue;
      (s.habits || []).forEach((h) => {
        if (Array.isArray(h.days)) h.days.forEach((v, d) => { if (v) push(['Habits', m + 1, h.name, d + 1, 1]); });
      });
    }

    push([]);
    push(['Tasks', 'Month', 'Week', 'Day', 'Date', 'Kind', 'Text', 'Done', 'Tags']);
    for (let m = 0; m < 12; m++) {
      const s = months[m];
      if (!s) continue;
      (s.weeks || []).forEach((w) => {
        (w.days || []).forEach((d, di) => {
          (d.tasks || []).forEach((tk) => push(['Tasks', m + 1, w.n, di + 1, d.date, tk.kind, tk.text, tk.done ? 1 : 0, (tk.tags || []).join(' ')]));
        });
      });
    }

    push([]);
    push(['MonthReflections', 'Month', 'Section', 'Index', 'Text']);
    for (let m = 0; m < 12; m++) {
      const s = months[m];
      if (!s || !s.reflections) continue;
      if (Array.isArray(s.reflections.overview)) s.reflections.overview.forEach((r, i) => push(['MonthReflections', m + 1, 'overview', i + 1, r]));
      (s.reflections.weeks || []).forEach((w, wi) => w.forEach((r, i) => push(['MonthReflections', m + 1, 'week' + (wi + 1), i + 1, r])));
    }

    push([]);
    push(['YearGoals', 'Kind', 'Text', 'Done']);
    (yearState && yearState.goals || []).forEach((g) => push(['YearGoals', g.kind, g.text, g.done ? 1 : 0]));

    push([]);
    push(['YearReflections', 'Scope', 'Index', 'Text']);
    if (yearState && yearState.reflections) {
      Object.keys(yearState.reflections).forEach((scope) => {
        (yearState.reflections[scope] || []).forEach((r, i) => push(['YearReflections', scope, i + 1, r]));
      });
    }

    push([]);
    push(['YearNotes', 'Month', 'Note']);
    (yearState && yearState.monthNotes || []).forEach((n, m) => push(['YearNotes', m + 1, n]));

    return rows;
  }

  var api = {
    weekGoalPct: weekGoalPct,
    yearMonthlyFrom: yearMonthlyFrom,
    csvRow: csvRow,
    buildCSVRows: buildCSVRows,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.PlanStats = api;
})();
