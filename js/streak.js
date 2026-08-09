// TaskFlow — habit streak helpers (tách từ app.js trong P11 refactor, extraction 13).
// Gồm: habitInMonthState(s,h) thuần, habitDaysAt(y,m,h,py,pm), streakAnchorDay(y,m,nd),
// habitTimeline(h,months,py,pm,nd), habitStreakOf(h,py,pm,nd), habitStreakCached(h,py,pm,nd),
// clearStreakCache() — hmStreakCache nội bộ. Các hàm đổi signature nhận
// PLAN_YEAR/PLAN_MONTH/NUM_DAYS tham số thay vì đọc global (pattern moodDateKey).
// monthStateRaw access qua globalThis.TaskFlowStorage (browser: storage.js load trước).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowStreak = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  let hmStreakCache = new Map();

  function getStorage() {
    return (typeof globalThis !== 'undefined' && globalThis.TaskFlowStorage) || null;
  }

  function habitInMonthState(s, h) {
    if (!s || !Array.isArray(s.habits)) return null;
    return s.habits.find((x) => x.id === h.id) || s.habits.find((x) => x.name === h.name) || null;
  }

  function habitDaysAt(y, m, h, py, pm) {
    if (y === py && m === pm) return Array.isArray(h.days) ? h.days : null;
    const st = getStorage();
    const s = st ? st.monthStateRaw(y, m) : null;
    const hh = habitInMonthState(s, h);
    return hh && Array.isArray(hh.days) ? hh.days : null;
  }

  // Anchor = index ngày cuối cùng đã trôi qua trong tháng hiện tại (0-based).
  function streakAnchorDay(y, m, numDays) {
    const now = new Date();
    const inRange = now.getFullYear() === y && now.getMonth() === m;
    return inRange ? Math.min(now.getDate() - 1, numDays - 1) : numDays - 1;
  }

  function habitTimeline(h, months, py, pm, numDays) {
    const out = [];
    const anchor = streakAnchorDay(py, pm, numDays);
    for (let back = months - 1; back >= 0; back--) {
      let y = py, m = pm - back;
      while (m < 0) { m += 12; y--; }
      const nd = new Date(y, m + 1, 0).getDate();
      const days = habitDaysAt(y, m, h, py, pm);
      const upto = (back === 0) ? anchor : nd - 1;
      for (let d = 0; d <= upto; d++) out.push(!!(days && days[d]));
    }
    return out;
  }

  function habitStreakOf(h, py, pm, numDays) {
    // Streak ĐA THÁNG: 🔥 đếm lùi từ hôm nay xuyên qua ranh giới tháng;
    // 🏆 chuỗi dài nhất trong cửa sổ 12 tháng. Dùng MỘT timeline duy nhất.
    const tl = habitTimeline(h, 12, py, pm, numDays);
    let cur = 0;
    for (let i = tl.length - 1; i >= 0 && tl[i]; i--) cur++;
    let best = 0, run = 0;
    for (let i = 0; i < tl.length; i++) {
      if (tl[i]) { run++; if (run > best) best = run; }
      else run = 0;
    }
    return { cur, best };
  }

  function habitStreakCached(h, py, pm, numDays) {
    if (!hmStreakCache.has(h.id)) hmStreakCache.set(h.id, habitStreakOf(h, py, pm, numDays));
    return hmStreakCache.get(h.id);
  }

  function clearStreakCache() { hmStreakCache = new Map(); }

  return { habitInMonthState, habitDaysAt, streakAnchorDay, habitTimeline, habitStreakOf, habitStreakCached, clearStreakCache };
});
