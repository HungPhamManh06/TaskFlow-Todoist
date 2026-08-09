// TaskFlow — dark mode helpers (tách từ app.js trong P11 refactor, extraction 10).
// Gồm: systemPrefersDark() thuần (matchMedia), darkIsOn(dark)/applyDark(dark)/
// toggleDark(dark) — nhận `dark` tham số thay vì đọc DARK global (pattern
// monthlyStats(state)). prefersReducedMotion ở lại app.js (test lock).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowTheme = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // null = theo hệ thống (prefers-color-scheme)
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function darkIsOn(dark) { return dark === null ? systemPrefersDark() : dark; }

  function applyDark(dark) {
    const on = darkIsOn(dark);
    document.documentElement.dataset.dark = on ? 'true' : 'false';
    const btn = document.getElementById('btnDark');
    if (btn) btn.textContent = on ? '☀️' : '🌙';
    const mc = document.querySelector('meta[name="theme-color"]');
    if (mc) mc.setAttribute('content', on ? '#1b1917' : '#f4f0e9');
  }

  function toggleDark(dark) {
    const next = !darkIsOn(dark);
    try { localStorage.setItem('planner-dark', next ? '1' : '0'); } catch (e) { /* ẩn */ }
    applyDark(next);
    return next;
  }

  return { systemPrefersDark, darkIsOn, applyDark, toggleDark };
});
