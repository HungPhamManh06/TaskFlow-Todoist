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

    push(['TaskFlow Export', new Date().toISOString(), csvNote || '']);

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

  // ---- Mood & dữ liệu thông minh (Phase 6) ----

  // moodSummary: pairs = [{ mood: 0..4 hoặc null, pct: 0..100 }] — so sánh habit % trung bình
  // của ngày "vui" (mood >= 3) với ngày "buồn" (mood <= 1) để đưa ra insight đơn giản.
  function moodSummary(pairs) {
    const good = [];
    const bad = [];
    (pairs || []).forEach((p) => {
      if (!p || typeof p.mood !== 'number' || typeof p.pct !== 'number') return;
      if (p.mood >= 3) good.push(p.pct);
      else if (p.mood <= 1) bad.push(p.pct);
    });
    const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    const goodAvg = avg(good);
    const badAvg = avg(bad);
    return {
      goodDays: good.length,
      badDays: bad.length,
      goodAvg: goodAvg,
      badAvg: badAvg,
      delta: (goodAvg !== null && badAvg !== null) ? goodAvg - badAvg : null,
    };
  }

  // ---- Import CSV (Phase 6) ----

  // Tách 1 dòng CSV thành các ô (hỗ trợ nháy kép + escape ""), round-trip với csvRow().
  function splitCSVLine(line) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  // Nhận cả tag cũ 'TaskFlow-Todoist Export' để file CSV xuất trước đây vẫn import được.
  const CSV_SECTIONS = ['MonthlyGoals', 'Habits', 'Tasks', 'MonthReflections', 'YearGoals', 'YearReflections', 'YearNotes', 'TaskFlow Export', 'TaskFlow-Todoist Export'];
  // Cột 1 của dòng HEADER mỗi section — dòng dữ liệu luôn lặp lại tag nên phải phân biệt.
  const CSV_HEADER_COL1 = { MonthlyGoals: 'Month', Habits: 'Month', Tasks: 'Month', MonthReflections: 'Month', YearGoals: 'Kind', YearReflections: 'Scope', YearNotes: 'Month' };

  // parseCSVRows(text): đọc file CSV export của app → { months: { m: { goals, habits, tasks } }, year: { goals } }.
  // Thuần, không đụng storage — merge vào state ở app.js.
  function parseCSVRows(text) {
    const out = { months: {}, year: { goals: [] } };
    // Một số editor/trình duyệt dịch dòng thành "\r\r\n" (hoặc file Windows thô) → cắt \r thừa cuối dòng.
    const lines = String(text || '').split(/\r?\n/).map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
    let section = null;
    lines.forEach((ln) => {
      const cells = splitCSVLine(ln);
      if (!cells.length) return;
      const tag = (cells[0] || '').trim();
      if (CSV_SECTIONS.indexOf(tag) >= 0) {
        // Dòng header (cột 1 trùng tên cột chuẩn) mới chuyển section; dòng dữ liệu lặp lại tag → xử lý tiếp.
        if (tag === 'TaskFlow Export' || tag === 'TaskFlow-Todoist Export' || (cells[1] || '').trim() === CSV_HEADER_COL1[tag]) { section = tag; return; }
      }
      if (!section) return;
      if (section === 'MonthlyGoals') {
        const m = +cells[1];
        if (m >= 1 && m <= 12 && cells[3]) {
          if (!out.months[m]) out.months[m] = { goals: [], habits: [], tasks: [] };
          out.months[m].goals.push({ kind: cells[2] === 'priority' ? 'priority' : 'regular', text: cells[3], done: cells[4] === '1' });
        }
      } else if (section === 'Habits') {
        const m = +cells[1];
        if (m >= 1 && m <= 12 && cells[2]) {
          if (!out.months[m]) out.months[m] = { goals: [], habits: [], tasks: [] };
          out.months[m].habits.push({ name: cells[2], day: +cells[3], done: cells[4] === '1' });
        }
      } else if (section === 'Tasks') {
        const m = +cells[1];
        if (m >= 1 && m <= 12 && cells[6]) {
          if (!out.months[m]) out.months[m] = { goals: [], habits: [], tasks: [] };
          out.months[m].tasks.push({ week: +cells[2], day: +cells[3], kind: cells[5] === 'priority' ? 'priority' : 'regular', text: cells[6], done: cells[7] === '1' });
        }
      } else if (section === 'YearGoals') {
        if (cells[2]) out.year.goals.push({ kind: cells[1] === 'priority' ? 'priority' : 'regular', text: cells[2], done: cells[3] === '1' });
      }
    });
    return out;
  }

  // Trả về ma trận habit × 12 tháng: mỗi habit có months[m] = { month, pct, streak }.
  // Đọc từ localStorage trực tiếp (thuần, không đụng state global).
  function habitYearMatrix(habits, year) {
    if (!Array.isArray(habits)) return [];
    return habits.map(function (h) {
      var months = [];
      for (var m = 0; m < 12; m++) {
        var raw = null;
        try {
          var k = 'planner-' + year + '-' + (m + 1);
          raw = typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
        } catch (e) { /* ẩn */ }
        var s = raw ? JSON.parse(raw) : null;
        var hh = null;
        if (s && Array.isArray(s.habits)) {
          hh = s.habits.find(function (x) { return x.id === h.id; }) || s.habits.find(function (x) { return x.name === h.name; }) || null;
        }
        var days = hh && Array.isArray(hh.days) ? hh.days : [];
        var done = 0;
        for (var d = 0; d < days.length; d++) { if (days[d]) done++; }
        var pct = days.length > 0 ? Math.round((done / days.length) * 100) : 0;
        var cur = 0;
        for (var i = days.length - 1; i >= 0 && days[i]; i--) cur++;
        months.push({ month: m, pct: pct, streak: cur });
      }
      return { id: h.id, name: h.name, target: h.target || 100, months: months };
    });
  }

  var api = {
    weekGoalPct: weekGoalPct,
    yearMonthlyFrom: yearMonthlyFrom,
    habitYearMatrix: habitYearMatrix,
    csvRow: csvRow,
    buildCSVRows: buildCSVRows,
    moodSummary: moodSummary,
    splitCSVLine: splitCSVLine,
    parseCSVRows: parseCSVRows,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.PlanStats = api;
})();
