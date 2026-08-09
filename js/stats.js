// TaskFlow — goal stats core (tách từ app.js trong P11 refactor, extraction 6).
// Gồm: weekStats(w) thuần, monthlyStats(st) nhận state tham số — không phụ thuộc
// global, dễ unit test.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowStats = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function weekStats(w) {
    const total = w.goals.length;
    const done = w.goals.filter((g) => g.done).length;
    return { done, inProg: total - done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function monthlyStats(st) {
    const total = st.monthlyGoals.length;
    const done = st.monthlyGoals.filter((g) => g.done).length;
    return { done, inProg: total - done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  return { weekStats, monthlyStats };
});
