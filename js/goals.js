// TaskFlow — month goal helpers (tách từ app.js trong P11 refactor, extraction 14).
// Gồm: monthPctOf(y, m, defaultPct) + monthGoalsOf(y, m, goalDefs) — ĐỔI SIGNATURE:
// trước đọc defaultMonthPct/GOAL_DEFS/hasAccount global, giờ nhận defaultPct/goalDefs
// tham số (defaultMonthPct + GOAL_DEFS vẫn sống trong app.js) + hasAccount qua
// globalThis.TaskFlowAccount (browser: account.js load trước; Node: guard optional).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowGoals = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function getAccount() {
    return (typeof globalThis !== 'undefined' && globalThis.TaskFlowAccount) || null;
  }

  function isAccount() {
    const a = getAccount();
    return !!(a && a.hasAccount && a.hasAccount());
  }

  function getPlanStats() {
    return (typeof globalThis !== 'undefined' && globalThis.window && globalThis.window.PlanStats) || null;
  }

  // % hoàn thành mục tiêu của tháng (y, m). defaultPct = app.js defaultMonthPct —
  // chỉ fallback khi KHÔNG có tài khoản (chế độ demo hiện dữ liệu mẫu).
  function monthPctOf(y, m, defaultPct) {
    let raw = null;
    try { raw = localStorage.getItem('planner-' + y + '-' + (m + 1)); } catch (e) { return isAccount() ? 0 : defaultPct(y, m); }
    if (!raw) return isAccount() ? 0 : defaultPct(y, m);
    try {
      const s = JSON.parse(raw);
      if (!Array.isArray(s.weeks) || !s.weeks.length) return isAccount() ? 0 : defaultPct(y, m);
      // Hàm thuần trong PlanStats (unit-test trong tests/phase2.test.mjs)
      const ps = getPlanStats();
      return ps ? ps.weekGoalPct(s) : (() => {
        const pcts = s.weeks.map((w) => {
          const total = w.goals.length;
          const done = w.goals.filter((g) => g.done).length;
          return total ? Math.round((done / total) * 100) : 0;
        });
        return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
      })();
    } catch (e) {
      return isAccount() ? 0 : defaultPct(y, m);
    }
  }

  // Mục tiêu tháng (y, m): dữ liệu đã lưu nếu có; goalDefs = app.js GOAL_DEFS mẫu
  // (chỉ dùng khi chưa đăng nhập — demo).
  function monthGoalsOf(y, m, goalDefs) {
    let raw = null;
    try { raw = localStorage.getItem('planner-' + y + '-' + (m + 1)); } catch (e) { /* ẩn */ }
    if (raw) {
      try {
        const s = JSON.parse(raw);
        if (Array.isArray(s.monthlyGoals)) return s.monthlyGoals;
      } catch (e) { /* ẩn */ }
    }
    // Tài khoản đã đăng nhập: tháng không có dữ liệu → TRỐNG, không hiện dữ liệu mẫu
    if (isAccount()) return [];
    return goalDefs.map(([text, kind, done], i) => ({ id: 'g' + i, text, kind, done }));
  }

  return { monthPctOf, monthGoalsOf };
});
