/* Web Push (v3.2 P2.1) — nhắc việc khi app đã đóng.
 *
 * Vì sao cần: hiện tại nhắc việc chỉ chắc khi app đang mở (setTimeout), còn khi
 * app đóng thì phụ thuộc Periodic Background Sync — Chromium-only và hay bị hạn
 * chế. Web Push dùng hạ tầng đã có (server Express + Postgres + SW) nên nhắc
 * việc hoạt động cả khi trình duyệt đóng.
 *
 * Ranh giới: server CHỈ gửi thông báo, không bao giờ sửa dữ liệu người dùng.
 * Nội dung digest được tính từ planner_state đã đồng bộ (không có dữ liệu →
 * không gửi, không bịa).
 *
 * Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (secret), VAPID_SUBJECT (mailto:).
 * Thiếu key → mọi route trả 503 `push-not-configured` và client ẩn nút bật;
 * app vẫn nhắc được khi đang mở như trước. Sinh khoá:
 *   npx web-push generate-vapid-keys
 * (khoá riêng tư KHÔNG bao giờ commit — nhập tay trên Render, `sync: false`.)
 */
'use strict';
const express = require('express');
const { initDb } = require('./db');
const { authMiddleware } = require('./auth');

const router = express.Router();
router.use(authMiddleware);

const DEFAULT_HOUR = 20; // 20:00 giờ địa phương nếu client không gửi giờ
const MAX_ENDPOINT_LEN = 1024;
const MAX_KEY_LEN = 512;

let cachedClient = null; // web-push đã setVapidDetails
let loggedMissing = false;

/* ---------------- cấu hình VAPID ---------------- */

function vapidEnv() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(process.env.VAPID_SUBJECT || 'mailto:taskflow@example.com').trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

function isConfigured() {
  return vapidEnv() !== null;
}

/** web-push với VAPID đã thiết lập; null khi chưa cấu hình (hoặc key hỏng). */
function pushClient() {
  const cfg = vapidEnv();
  if (!cfg) {
    if (!loggedMissing) {
      loggedMissing = true;
      console.log('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY chưa cấu hình — /api/push/* trả 503');
    }
    return null;
  }
  if (!cachedClient) {
    try {
      const webpush = require('web-push');
      webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
      cachedClient = webpush;
    } catch (e) {
      console.error('[push] VAPID key không hợp lệ:', e.message);
      return null;
    }
  }
  return cachedClient;
}

/* ---------------- thời gian địa phương (thuần, test được) ---------------- */

/** Giờ địa phương của người dùng từ offset phút (+420 = UTC+7). */
function localNow(tzOffsetMinutes, now = new Date()) {
  const shifted = new Date(now.getTime() + (Number(tzOffsetMinutes) || 0) * 60000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

/** Key planner_state của tháng đang xét — trùng định dạng client ('planner-2026-9'). */
function monthKeyFor(local) {
  return 'planner-' + local.year + '-' + local.month;
}

function sameLocalDay(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * Cron chạy mỗi giờ theo UTC → gửi khi giờ địa phương của subscription trùng
 * giờ đã chọn, và chưa gửi trong ngày đó (cron có thể chạy lại/catch-up).
 */
function shouldSendNow(sub, now = new Date()) {
  if (!sub) return false;
  const tz = Number(sub.tz_offset_minutes) || 0;
  const hour = sub.reminder_hour === null || sub.reminder_hour === undefined
    ? DEFAULT_HOUR
    : Number(sub.reminder_hour);
  const local = localNow(tz, now);
  if (local.hour !== hour) return false;
  if (sub.last_sent_at) {
    const last = new Date(sub.last_sent_at);
    if (!Number.isNaN(last.getTime()) && sameLocalDay(localNow(tz, last), local)) return false;
  }
  return true;
}

/* ---------------- nội dung digest (thuần, test được) ---------------- */

function todaysTasks(state, day) {
  const weeks = state && Array.isArray(state.weeks) ? state.weeks : [];
  for (const week of weeks) {
    if (!week || !Array.isArray(week.days)) continue;
    for (const d of week.days) {
      if (d && d.day === day && Array.isArray(d.tasks)) return d.tasks;
    }
  }
  return [];
}

/**
 * Digest từ state đã đồng bộ: việc chưa xong hôm nay + thói quen chưa điểm danh
 * hôm qua (đúng nội dung nhắc khi app đang mở, xem js/digest.js).
 * → null khi không có gì đáng nhắc (thà không gửi còn hơn gửi thông báo rỗng).
 */
function buildDigest(state, local, lang = 'vi') {
  if (!state || typeof state !== 'object') return null;
  const habits = Array.isArray(state.habits) ? state.habits : [];
  const yesterdayIndex = local.day - 2; // mảng days[] của tháng là 0-based
  const missed = yesterdayIndex >= 0
    ? habits.filter((h) => h && Array.isArray(h.days) && !h.days[yesterdayIndex])
    : [];
  const pending = todaysTasks(state, local.day).filter((t) => t && !t.done);

  const vi = lang !== 'en';
  const parts = [];
  if (pending.length) parts.push(vi ? `còn ${pending.length} việc hôm nay` : `${pending.length} task(s) left today`);
  if (missed.length) parts.push(vi ? `${missed.length} thói quen chưa điểm danh hôm qua` : `${missed.length} habit(s) missed yesterday`);
  if (!parts.length) return null;
  return { title: 'TaskFlow 🐥', body: parts.join(' · '), url: '/app', tag: 'taskflow-digest' };
}

/* ---------------- gửi ---------------- */

/** Gửi 1 subscription. 'sent' | 'pruned' (404/410 → xoá) | 'failed' (tăng failures).
 * `client` có thể bơm vào từ test (mặc định lấy web-push đã cấu hình VAPID). */
async function sendToSubscription(sub, payload, client = pushClient()) {
  if (!client) return 'not-configured';
  try {
    await client.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return 'sent';
  } catch (e) {
    const status = e && e.statusCode;
    if (status === 404 || status === 410) return 'pruned';
    return 'failed';
  }
}

async function recordResult(pool, sub, result) {
  if (result === 'sent') {
    await pool.query('update push_subscription set last_sent_at = now(), failures = 0 where id = $1', [sub.id]);
  } else if (result === 'pruned') {
    await pool.query('delete from push_subscription where id = $1', [sub.id]);
  } else if (result === 'failed') {
    await pool.query('update push_subscription set failures = failures + 1 where id = $1', [sub.id]);
  }
}

/** Gửi tới mọi thiết bị của user (dùng cho /test và cron). */
async function sendToUser(pool, userId, payload) {
  const rows = await pool.query(
    'select id, user_id, endpoint, p256dh, auth from push_subscription where user_id = $1',
    [userId]
  );
  let sent = 0, pruned = 0, failed = 0;
  for (const sub of rows.rows) {
    const result = await sendToSubscription(sub, payload);
    if (result === 'sent') sent++;
    if (result === 'pruned') pruned++;
    if (result === 'failed') failed++;
    await recordResult(pool, sub, result);
  }
  return { sent, pruned, failed, total: rows.rowCount };
}

/* ---------------- routes ---------------- */

// GET /api/push/status → { configured, publicKey, subscriptions }
// publicKey là khoá công khai (trình duyệt cần để subscribe) — không phải secret.
router.get('/status', async (req, res) => {
  try {
    const cfg = vapidEnv();
    const p = initDb();
    const r = await p.query('select count(*) as n from push_subscription where user_id = $1', [req.user.id]);
    res.json({
      configured: !!cfg,
      publicKey: cfg ? cfg.publicKey : null,
      subscriptions: r.rows[0] ? Number(r.rows[0].n) || 0 : 0,
    });
  } catch (e) {
    res.status(500).json({ error: 'server-error' });
  }
});

// POST /api/push/subscribe { endpoint, keys:{p256dh,auth}, reminderHour, tzOffsetMinutes, lang }
router.post('/subscribe', async (req, res) => {
  if (!isConfigured()) return res.status(503).json({ error: 'push-not-configured' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const endpoint = String(body.endpoint || '').trim();
    const keys = body.keys && typeof body.keys === 'object' ? body.keys : {};
    const p256dh = String(keys.p256dh || '').trim();
    const authKey = String(keys.auth || '').trim();
    if (!endpoint.startsWith('https://') || endpoint.length > MAX_ENDPOINT_LEN) {
      return res.status(400).json({ error: 'invalid-endpoint' });
    }
    if (!p256dh || !authKey || p256dh.length > MAX_KEY_LEN || authKey.length > MAX_KEY_LEN) {
      return res.status(400).json({ error: 'invalid-keys' });
    }
    const hour = body.reminderHour === undefined || body.reminderHour === null
      ? DEFAULT_HOUR
      : Number(body.reminderHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return res.status(400).json({ error: 'invalid-reminder-hour' });
    }
    const tz = body.tzOffsetMinutes === undefined || body.tzOffsetMinutes === null
      ? 0
      : Number(body.tzOffsetMinutes);
    if (!Number.isInteger(tz) || tz < -840 || tz > 840) {
      return res.status(400).json({ error: 'invalid-tz-offset' });
    }
    const lang = body.lang === 'en' ? 'en' : 'vi';
    const ua = String(req.headers['user-agent'] || '').slice(0, 300);

    const p = initDb();
    await p.query(
      `insert into push_subscription
         (user_id, endpoint, p256dh, auth, reminder_hour, tz_offset_minutes, lang, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (endpoint) do update set
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         reminder_hour = excluded.reminder_hour,
         tz_offset_minutes = excluded.tz_offset_minutes,
         lang = excluded.lang,
         user_agent = excluded.user_agent,
         failures = 0`,
      [req.user.id, endpoint, p256dh, authKey, hour, tz, lang, ua]
    );
    res.json({ ok: true, reminderHour: hour });
  } catch (e) {
    res.status(500).json({ error: 'server-error' });
  }
});

// POST /api/push/unsubscribe { endpoint } → xoá đúng thiết bị của user này
router.post('/unsubscribe', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const endpoint = String(body.endpoint || '').trim();
    if (!endpoint) return res.status(400).json({ error: 'invalid-endpoint' });
    const p = initDb();
    const r = await p.query(
      'delete from push_subscription where user_id = $1 and endpoint = $2',
      [req.user.id, endpoint]
    );
    res.json({ ok: true, removed: r.rowCount });
  } catch (e) {
    res.status(500).json({ error: 'server-error' });
  }
});

// POST /api/push/test → thông báo thử tới mọi thiết bị của user (không cần chờ cron)
router.post('/test', async (req, res) => {
  if (!isConfigured()) return res.status(503).json({ error: 'push-not-configured' });
  try {
    const p = initDb();
    const result = await sendToUser(p, req.user.id, {
      title: 'TaskFlow 🐥',
      body: 'Thông báo thử — nhắc việc đã hoạt động.',
      url: '/app',
      tag: 'taskflow-test',
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: 'server-error' });
  }
});

module.exports = {
  router,
  // thuần — test trực tiếp
  isConfigured,
  localNow,
  monthKeyFor,
  shouldSendNow,
  buildDigest,
  // I/O
  sendToUser,
  sendToSubscription,
  recordResult,
  DEFAULT_HOUR,
};
