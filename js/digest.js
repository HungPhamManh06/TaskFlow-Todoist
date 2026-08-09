// TaskFlow — Weekly digest (nhắc bù qua Service Worker, tách từ app.js — P11 extraction 26).
// Gồm: computeDigest (tóm tắt habit chưa điểm danh hôm qua → {date,title,body}),
// updateDigestCache (ghi digest.json vào Cache API, throttle 60s qua digestCacheTs).
// Phụ thuộc app-level (state/PLAN_MONTH/PLAN_YEAR/t) — resolve qua global scope tại
// thời điểm GỌI (pattern inbox/chat/search/quick-add/mood/year-report). digestCacheTs
// là state nội bộ module (không ref ngoài). updateDigestCache được gọi từ app.js
// (afterHabitToggle/refreshToday/boot setTimeout) qua alias destructure.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowDigest = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  let digestCacheTs = 0;

  // Tóm tắt: habit chưa điểm danh hôm qua → lưu vào Cache API để SW đọc khi app đóng.
  function computeDigest() {
    const now = new Date();
    const yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    let s = null;
    if (yd.getMonth() === PLAN_MONTH && yd.getFullYear() === PLAN_YEAR) {
      s = state;
    } else {
      try {
        const raw = localStorage.getItem('planner-' + yd.getFullYear() + '-' + (yd.getMonth() + 1));
        s = raw ? JSON.parse(raw) : null;
      } catch (e) { s = null; }
    }
    if (!s || !Array.isArray(s.habits)) return null;
    const di = yd.getDate() - 1;
    const missed = s.habits.filter((h) => Array.isArray(h.days) && !h.days[di]);
    const names = missed.slice(0, 4).map((h) => h.name).join(', ') + (missed.length > 4 ? '…' : '');
    return {
      date: now.toDateString(),
      title: 'TaskFlow 🐥',
      body: missed.length === 0 ? t('digestNone') : t('digestBody', { names }),
    };
  }

  function updateDigestCache() {
    if (!('caches' in window)) return;
    const now = Date.now();
    if (now - digestCacheTs < 60000) return;
    digestCacheTs = now;
    const digest = computeDigest();
    if (!digest) return;
    caches.open('taskflow-digest').then((c) => {
      c.put('./digest.json', new Response(JSON.stringify(digest), { headers: { 'Content-Type': 'application/json' } }));
    }).catch(() => { /* ẩn */ });
  }

  return { computeDigest, updateDigestCache };
});
