// TaskFlow — analytics helpers (tách từ app.js trong P11 refactor, extraction 11).
// Gồm: GA4_ID/GA4_ENABLED consts, initAnalytics() (load gtag script + first/return visit),
// trackEvent(name, params) (83 call-sites giữ nguyên qua alias — không đổi signature).
// GA4_ENABLED = false khi ID còn placeholder 'G-XXXX' — app tự tắt tracking.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAnalytics = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // 👉 Thay 'G-XXXXXXXXXX' bằng Measurement ID của bạn:
  // Google Analytics → Quản trị → Luồng dữ liệu → Web → đo ID (định dạng G-XXXXXXXXXX)
  const GA4_ID = 'G-XXXXXXXXXX';
  const GA4_ENABLED = !!(GA4_ID && !GA4_ID.startsWith('G-XXXX'));

  function initAnalytics() {
    if (!GA4_ENABLED) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA4_ID, { anonymize_ip: true });
    try {
      const now = Date.now();
      if (!localStorage.getItem('planner-ga-first')) {
        localStorage.setItem('planner-ga-first', '1');
        gtag('event', 'first_visit');
      } else {
        const last = localStorage.getItem('planner-ga-last');
        if (last) {
          gtag('event', 'return_visit', {
            days_since: Math.max(0, Math.floor((now - new Date(last).getTime()) / 86400000)),
          });
        }
      }
      localStorage.setItem('planner-ga-last', new Date().toISOString());
    } catch (e) { /* ẩn */ }
  }

  function trackEvent(name, params) {
    if (!GA4_ENABLED || !window.gtag) return;
    try { gtag('event', name, params || {}); } catch (e) { /* ẩn */ }
  }

  return { GA4_ID, GA4_ENABLED, initAnalytics, trackEvent };
});
