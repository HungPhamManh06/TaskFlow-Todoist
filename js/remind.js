// TaskFlow — reminder helpers (tách từ app.js trong P11 refactor, extraction 9).
// Gồm: getRemindTime/setRemindTime (localStorage 'planner-remind'),
// requestRemindPermission (Notification API), registerPeriodicReminder
// (periodic background sync). Không phụ thuộc app.js state — dễ unit test.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowRemind = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function getRemindTime() {
    try { return localStorage.getItem('planner-remind'); } catch (e) { return null; }
  }

  function setRemindTime(v) {
    try { if (v) localStorage.setItem('planner-remind', v); else localStorage.removeItem('planner-remind'); } catch (e) { /* ẩn */ }
  }

  function requestRemindPermission() {
    if (!('Notification' in window)) return Promise.resolve(true);
    if (Notification.permission === 'granted') return Promise.resolve(true);
    const p = Notification.requestPermission();
    if (p && typeof p.then === 'function') return p.then((v) => v === 'granted');
    return Promise.resolve(true);
  }

  function registerPeriodicReminder() {
    if (!('serviceWorker' in navigator) || !('periodicSync' in navigator.serviceWorker)) return;
    navigator.serviceWorker.ready.then((reg) => {
      if (!('periodicSync' in reg)) return;
      navigator.permissions.query({ name: 'periodic-background-sync' }).then((status) => {
        if (status.state !== 'granted') return;
        const res = reg.periodicSync.register('daily-reminder', { minInterval: 24 * 60 * 60 * 1000 });
        if (res && typeof res.catch === 'function') res.catch(() => { /* ẩn */ });
      }).catch(() => { /* ẩn */ });
    }).catch(() => { /* ẩn */ });
  }

  return { getRemindTime, setRemindTime, requestRemindPermission, registerPeriodicReminder };
});
