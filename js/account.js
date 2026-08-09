// TaskFlow — account & gamification core (tách từ app.js trong P11 refactor, extraction 4).
// Gồm: hasAccount(), defaultYearState/emptyYearState (nhận year tham số), badges storage.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAccount = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const BADGES_KEY = 'planner-badges';

  const YEAR_GOAL_DEFS = [
    ['Hoàn thành 4 video youtube', 'priority', true],
    ['Hoàn thành 21 video ngắn', 'priority', true],
    ['Học xong khóa luyện phát âm TA', 'priority', true],
    ['Đọc 48 cuốn sách', 'priority', true],
    ['Tiết kiệm được 20 triệu', 'priority', false],
    ['Chạy bộ 150 buổi', 'priority', false],
    ['Gọi điện về nhà 48 lần', 'regular', false],
    ['Viết nhật ký 365 ngày', 'regular', false],
    ['Đi xem phim 6 lần', 'regular', false],
    ['Học tiếng Anh giao tiếp', 'regular', false],
  ];

  function hasAccount() {
    try { return !!localStorage.getItem('planner-token'); } catch (e) { return false; }
  }

  function defaultYearState(year) {
    return {
      year,
      goals: YEAR_GOAL_DEFS.map(([text, kind, done], i) => ({ id: 'yg' + i, text, kind, done })),
      reflections: {
        year: ['', '', '', ''],
        q1: ['', '', '', ''], q2: ['', '', '', ''], q3: ['', '', '', ''], q4: ['', '', '', ''],
      },
      monthNotes: Array.from({ length: 12 }, () => ''),
    };
  }
  function emptyYearState(year) {
    return {
      year,
      goals: [],
      reflections: {
        year: ['', '', '', ''],
        q1: ['', '', '', ''], q2: ['', '', '', ''], q3: ['', '', '', ''], q4: ['', '', '', ''],
      },
      monthNotes: Array.from({ length: 12 }, () => ''),
    };
  }

  function loadBadges() {
    try {
      const raw = localStorage.getItem(BADGES_KEY);
      const b = raw ? JSON.parse(raw) : null;
      return b && typeof b.earned === 'object' ? b : { earned: {} };
    } catch (e) { return { earned: {} }; }
  }
  function saveBadges(badges) {
    try { localStorage.setItem(BADGES_KEY, JSON.stringify(badges)); } catch (e) { /* ẩn */ }
    if (typeof window !== 'undefined' && window.Sync) window.Sync.push(BADGES_KEY);
  }

  return { BADGES_KEY, YEAR_GOAL_DEFS, hasAccount, defaultYearState, emptyYearState, loadBadges, saveBadges };
});
