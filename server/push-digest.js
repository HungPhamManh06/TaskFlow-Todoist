/* Cron entry (v3.2 P2.1) — gửi digest Web Push mỗi giờ.
 *
 * Render: blueprint chạy file này như `type: cron` với schedule "0 * * * *"
 * (web service của Render free sẽ spin-down nên không thể tự hẹn giờ trong app).
 * Chạy tay: `node push-digest.js` (cần DATABASE_URL + VAPID_* trong env).
 *
 * Chỉ gửi cho subscription đúng giờ địa phương đã chọn và chưa gửi trong ngày
 * đó (shouldSendNow) — cron chạy lặp/catch-up không tạo thông báo trùng.
 * Không có dữ liệu đáng nhắc → không gửi gì.
 */
'use strict';
require('dotenv').config();
const { initDb, ensureSchema } = require('./db');
const push = require('./push');

async function main() {
  if (!push.isConfigured()) {
    console.log('[push-digest] VAPID chưa cấu hình — bỏ qua (không gửi gì)');
    return;
  }
  await ensureSchema();
  const pool = initDb();
  const now = new Date();
  const subs = await pool.query(
    `select id, user_id, endpoint, p256dh, auth, reminder_hour, tz_offset_minutes,
            lang, last_sent_at
       from push_subscription`
  );

  let sent = 0, pruned = 0, failed = 0, skipped = 0, empty = 0;
  for (const sub of subs.rows) {
    if (!push.shouldSendNow(sub, now)) { skipped++; continue; }

    const local = push.localNow(sub.tz_offset_minutes, now);
    const row = await pool.query(
      'select data from planner_state where user_id = $1 and key = $2',
      [sub.user_id, push.monthKeyFor(local)]
    );
    const payload = push.buildDigest(row.rows[0] && row.rows[0].data, local, sub.lang);
    if (!payload) { empty++; continue; }

    const result = await push.sendToSubscription(sub, payload);
    await push.recordResult(pool, sub, result);
    if (result === 'sent') sent++;
    else if (result === 'pruned') pruned++;
    else if (result === 'failed') failed++;
  }

  // Không exit 1 vì lỗi gửi tạm thời: job cron đỏ liên tục sẽ che mất lỗi thật.
  console.log(`[push-digest] sent=${sent} pruned=${pruned} failed=${failed} ` +
    `skipped=${skipped} nothing-to-remind=${empty} total=${subs.rowCount}`);
}

main().catch((e) => {
  console.error('[push-digest] lỗi:', e.message);
  process.exit(1);
});
