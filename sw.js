/* TaskFlow-Todoist Service Worker
   Cache app shell → hoạt động offline như app thật.
   Chiến lược: network-first cho điều hướng, stale-while-revalidate cho tĩnh. */
'use strict';

const CACHE = 'taskflow-v76';
const APP_SHELL = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './css/tokens.css',
  './css/components.css',
  './css/app-shell.css',
  './css/styles.css',
  './css/landing.css',
  './js/app.js',
  './js/sync.js',
  './js/api-config.js',
  './js/deeplink.js',
  './js/ui.js',
  './js/plan-math.js',
  './js/plan-stats.js',
  './icons/ui-sprite.svg',
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

  // Điều hướng: ưu tiên mạng, offline → cache shell (cache theo đúng URL trang)
  if (req.mode === 'navigate') {
    const offlineShell = url.pathname.endsWith('/app.html') ? './app.html' : './index.html';
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true })
            .then((cached) => cached || caches.match(offlineShell))
        )
    );
    return;
  }

  // Tĩnh: stale-while-revalidate + chống phiên bản chồng nhau.
  // Bước 1: match theo đúng URL (bao gồm ?v=N). Dùng ignoreSearch ở
  // bước này là bug: request `app.js?v=66` sẽ match nhầm entry cache cũ
  // không version (từ precache) và trả JS cũ — version bump không hiệu
  // lực, và HTML mới + JS cũ chạy chồng nhau gây crash
  // (SyntaxError: Identifier 'DAYS' already declared).
  // Bước 2: luôn fetch mới từ server khi miss hoặc offline.
  // Bước 3: chỉ khi offline (fetch thất bại) mới fallback ignoreSearch
  // để precache không-version (vd `./js/app.js`) vẫn phục vụ được.
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
        .catch(() =>
          caches.match(req, { ignoreSearch: true }).then((c2) => c2 || cached)
        );
      return cached || fresh;
    })
  );
});

/* ---------- Nhắc việc hằng ngày (Periodic Background Sync) ---------- */

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
