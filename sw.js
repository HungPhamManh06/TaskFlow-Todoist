/* TaskFlow-Todoist Service Worker
   Cache app shell â†’ hoáº¡t Ä‘á»™ng offline nhÆ° app tháº­t.
   Chiáº¿n lÆ°á»£c: network-first cho Ä‘iá»u hÆ°á»›ng, stale-while-revalidate cho tÄ©nh. */
'use strict';

const CACHE = 'taskflow-v34';
const APP_SHELL = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './css/styles.css',
  './css/landing.css',
  './js/app.js',
  './js/sync.js',
  './js/api-config.js',
  './js/deeplink.js',
  './js/plan-math.js',
  './js/plan-stats.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== 'taskflow-digest').map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Äiá»u hÆ°á»›ng: Æ°u tiÃªn máº¡ng, offline â†’ cache shell (cache theo Ä‘Ãºng URL trang)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // TÄ©nh: stale-while-revalidate
  e.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});

/* ---------- Nháº¯c viá»‡c háº±ng ngÃ y (Periodic Background Sync) ---------- */

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'daily-reminder') {
    e.waitUntil(showReminder());
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.navigate('./') && c.focus();
      }
      return self.clients.openWindow('./');
    })
  );
});

function showReminder() {
  const fallback = {
    title: 'TaskFlow-Todoist 🐥',
    body: 'Hôm nay bạn đã hoàn thành những mục tiêu nào? Vào điểm danh thói quen nhé!',
  };
  const opts = (d) => ({
    body: d.body || fallback.body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: 'daily-reminder',
    renotify: true,
  });
  // Phase 6: đọc digest.json do app ghi vào cache (nhắc bù habit bỏ lỡ hôm qua); fallback nếu chưa có.
  return caches.match('./digest.json').then((res) => {
    if (!res) return self.registration.showNotification(fallback.title, opts(fallback));
    return res.json().then((d) => {
      const info = (d && d.body && d.date === new Date().toDateString()) ? d : fallback;
      return self.registration.showNotification(info.title || fallback.title, opts(info));
    }).catch(() => self.registration.showNotification(fallback.title, opts(fallback)));
  });
}
