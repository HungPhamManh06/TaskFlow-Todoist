/* TaskFlow Service Worker
   Cache app shell → hoạt động offline như app thật.
   Chiến lược: network-first cho điều hướng, stale-while-revalidate cho tĩnh. */
'use strict';

const CACHE = 'taskflow-v254';
const APP_SHELL = [
  './',
  './index.html',
  './app.html',
  './privacy.html',
  './terms.html',
  './data-and-security.html',
  './manifest.json',
  './css/tokens.css',
  './css/landing.css',
  './css/legal.css',
  './css/fonts.min.css',
  './css/tokens.min.css',
  './css/components.min.css',
  './css/app-shell.min.css',
  './css/styles-critical.min.css',
  './css/styles-deferred.min.css',
  './js/app.min.js',
  './js/data-migrations.min.js',
  './js/config.min.js',
  './js/widget.min.js',
  './js/xp.min.js',
  './js/streak-ui.min.js',
  './js/alignment.min.js',
  './js/weekly-review.min.js',
  './js/month-carryover.min.js',
  './js/monthly-review.min.js',
  './js/report-insights.min.js',
  './js/insights.min.js',
  './js/reflection-history.min.js',
  './js/today.min.js',
  './js/report-ui.min.js',
  './js/upcoming.min.js',
  './js/focus-stats.min.js',
  './js/focus.min.js',
  './js/pomo.min.js',
  './js/sync.min.js',
  './js/stats-ui.min.js',
  './js/backup.min.js',
  './js/api-config.min.js',
  './js/deeplink.min.js',
  './js/quickcapture.min.js',
  './js/ui.min.js',
  './js/util.min.js',
  './js/i18n.min.js',
  './js/storage.min.js',
  './js/account.min.js',
  './js/dates.min.js',
  './js/stats.min.js',
  './js/habits.min.js',
  './js/keys.min.js',
  './js/remind.min.js',
  './js/theme.min.js',
  './js/analytics.min.js',
  './js/export.min.js',
  './js/streak.min.js',
  './js/goals.min.js',
  './js/fab.min.js',
  './js/syncui.min.js',
  './js/planmini.min.js',
  './js/clock.min.js',
  './js/shell.min.js',
  './js/plan-math.min.js',
  './js/plan-stats.min.js',
  './js/plan-carry.min.js',
  './js/popups.min.js',
  './js/inbox.min.js',
  './js/chat.min.js',
  './js/ai-context.min.js',
  './js/ai-context-consent.min.js',
  './js/ai-memory.min.js',
  './js/ai-chat-context.min.js',
  './js/chat-provider.min.js',
  './js/ai-agent.min.js',
  './js/ai-intent.min.js',
  './js/ai-agent-runtime.min.js',
  './js/search.min.js',
  './js/quick-add.min.js',
  './js/mood.min.js',
  './js/reflection.min.js',
  './js/pillars.min.js',
  './js/projects.min.js',
  './js/projects-ui.min.js',
  './js/contexts.min.js',
  './js/timeblocks.min.js',
  './js/timeblocks-ui.min.js',
  './js/planner-rules.min.js',
  './js/planner-ui.min.js',
  './js/gcal.min.js',
  './js/gcal-ui.min.js',
  './js/ai.min.js',
  './js/year-report.min.js',
  './js/digest.min.js',
  './js/remind-ui.min.js',
  './fonts/nunito-cyrillic-ext.woff2',
  './fonts/nunito-cyrillic.woff2',
  './fonts/nunito-latin-ext.woff2',
  './fonts/nunito-latin.woff2',
  './fonts/nunito-vietnamese.woff2',
  './icons/ui-sprite.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

/* ---------- Chuẩn hoá HTML navigation responses ----------
   Vercel cleanUrls phục vụ /app, /privacy, /terms... kèm header delivery-only
   `Content-Disposition: inline; filename="..."`. Khi SW trả response này cho
   một navigation OFFLINE, Chromium từ chối với ERR_FAILED (root "/" không có
   filename= nên vẫn chạy). Chỉ bỏ ĐÚNG header đó; giữ nguyên mọi header khác
   (Content-Type, CSP, security headers...).
   Blob: HTML được phục vụ không nén (Vercel text/html không kèm
   Content-Encoding), blob() trả body đã giải mã — an toàn cho HTML. */
async function normalizeNavigationResponse(response) {
  if (!response || !response.headers) return response;
  if (!response.headers.has('content-disposition')) return response;
  const headers = new Headers(response.headers);
  headers.delete('content-disposition');
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('install', (e) => {
  // Precache APP_SHELL; chỉ riêng entry HTML (./, *.html) được chuẩn hoá
  // trước khi lưu để entry cache sạch header độc hại ngay từ đầu.
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        APP_SHELL.map(async (url) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error('Precache failed: ' + url);
          const isHtml = url === './' || url.endsWith('.html');
          c.put(url, isHtml ? await normalizeNavigationResponse(res) : res);
        })
      )
    ).then(() => self.skipWaiting())
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
    e.respondWith(
      fetch(req)
        .then((res) => {
          // Online: trả NGUYÊN response mạng; chỉ bản sao cache bị chuẩn hoá.
          const copy = res.clone();
          caches.open(CACHE).then((c) =>
            normalizeNavigationResponse(copy).then((normalized) => c.put(req, normalized))
          );
          return res;
        })
        .catch(() => offlineNavigationResponse(req, url))
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

/* Offline navigation: URL chính xác (ignoreSearch để /app?view=today vẫn
   khớp /app đã cache) → clean URL + '.html' (cleanUrls /privacy →
   privacy.html) → shell (app.html / index.html). Mọi HTML phục vụ đều được
   chuẩn hoá để header Content-Disposition của Vercel không sống sót vào
   navigation response offline. */
async function offlineNavigationResponse(req, url) {
  let cached = await caches.match(req, { ignoreSearch: true });
  if (!cached && !url.pathname.endsWith('.html')) {
    cached = await caches.match(url.pathname + '.html');
  }
  if (!cached) {
    const offlineShell = (url.pathname.endsWith('/app') || url.pathname.endsWith('/app.html'))
      ? './app.html'
      : './index.html';
    cached = await caches.match(offlineShell);
  }
  return cached ? normalizeNavigationResponse(cached) : cached;
}

/* ---------- Nhắc việc hằng ngày (Periodic Background Sync) ---------- */

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'daily-reminder') {
    e.waitUntil(showReminder());
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  // Deep-link vào app (không đưa về landing). Dùng ?view=today để mở màn hình chính.
  // Clean URL (Vercel cleanUrls): /app (không /app.html) là đường dẫn thật của app.
  const APP_URL = './app?view=today';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          const p = new URL(c.url).pathname;
          if (p === '/app' || p === '/app.html') {
            return c.focus().then(() => c.navigate(APP_URL));
          }
        }
      }
      return self.clients.openWindow(APP_URL);
    })
  );
});

function showReminder() {
  const fallback = {
    title: 'TaskFlow 🐥',
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
