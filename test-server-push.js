'use strict';
/* Test backend Web Push (v3.2 P2.1) — pg-mem, KHÔNG gọi push service thật.
   Phủ: auth, trạng thái chưa cấu hình VAPID (503), validation subscribe,
   subscribe lặp (idempotent theo endpoint), cô lập giữa các tài khoản,
   unsubscribe, hệ quả DB của recordResult, và các hàm thuần
   (shouldSendNow / buildDigest / localNow / monthKeyFor).
   Chạy: node test-server-push.js */
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || '100';
const assert = require('assert');
const path = require('path');
const { app, ensureSchema } = require('./server/index');
const push = require('./server/push');
const { initDb } = require('./server/db');
// web-push được cài trong server/node_modules (test chạy từ gốc repo) → resolve theo server/.
const webpush = require(require.resolve('web-push', { paths: [path.join(__dirname, 'server')] }));

async function signup(base, username) {
  const r = await fetch(base + '/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'Pass123456!' }),
  });
  const j = await r.json();
  assert.strictEqual(r.status, 201, 'signup phải thành công');
  assert.ok(j.token, 'phải trả token');
  return j.token;
}

const auth = (token) => ({ Authorization: 'Bearer ' + token });
const jsonAuth = (token) => ({ 'Content-Type': 'application/json', ...auth(token) });

async function main() {
  await ensureSchema();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  // ---------- TEST 1: /api/push/* yêu cầu Bearer token ----------
  {
    const noToken = await fetch(base + '/api/push/status');
    assert.strictEqual(noToken.status, 401, 'thiếu token → 401');
    const badToken = await fetch(base + '/api/push/status', { headers: auth('nonsense') });
    assert.strictEqual(badToken.status, 401, 'token sai → 401');
    console.log('TEST 1 OK — push routes yêu cầu auth hợp lệ');
  }

  // ---------- TEST 2: chưa cấu hình VAPID → configured:false + subscribe 503 ----------
  {
    assert.strictEqual(push.isConfigured(), false, 'chưa có VAPID key → isConfigured false');
    const token = await signup(base, 'pushuser1');
    const status = await fetch(base + '/api/push/status', { headers: auth(token) });
    const j = await status.json();
    assert.strictEqual(status.status, 200);
    assert.strictEqual(j.configured, false, 'chưa cấu hình → configured false (client ẩn nút bật)');
    assert.strictEqual(j.publicKey, null, 'chưa cấu hình → không lộ publicKey');
    assert.strictEqual(j.subscriptions, 0);

    const sub = await fetch(base + '/api/push/subscribe', {
      method: 'POST',
      headers: jsonAuth(token),
      body: JSON.stringify({ endpoint: 'https://push.example/x', keys: { p256dh: 'k', auth: 'a' } }),
    });
    assert.strictEqual(sub.status, 503, 'chưa cấu hình → 503');
    assert.strictEqual((await sub.json()).error, 'push-not-configured');
    console.log('TEST 2 OK — chưa cấu hình VAPID: status báo false, subscribe 503');
  }

  // ---------- TEST 3: shouldSendNow (thuần) ----------
  {
    const sub = { reminder_hour: 20, tz_offset_minutes: 420, last_sent_at: null }; // UTC+7, nhắc 20:00
    assert.strictEqual(push.shouldSendNow(sub, new Date('2026-09-20T13:00:00Z')), true, '13:00Z = 20:00 giờ VN → gửi');
    assert.strictEqual(push.shouldSendNow(sub, new Date('2026-09-20T14:00:00Z')), false, '14:00Z = 21:00 giờ VN → không gửi');
    assert.strictEqual(push.shouldSendNow(sub, new Date('2026-09-20T12:00:00Z')), false, '12:00Z = 19:00 giờ VN → không gửi');

    const sentToday = { ...sub, last_sent_at: new Date('2026-09-20T13:00:00Z') };
    assert.strictEqual(push.shouldSendNow(sentToday, new Date('2026-09-20T13:30:00Z')), false,
      'đã gửi trong ngày (giờ địa phương) → không gửi lại dù cron chạy lặp');
    const sentYesterday = { ...sub, last_sent_at: new Date('2026-09-19T13:00:00Z') };
    assert.strictEqual(push.shouldSendNow(sentYesterday, new Date('2026-09-20T13:00:00Z')), true,
      'hôm qua gửi rồi → hôm nay vẫn gửi');

    const utcSub = { reminder_hour: 20, tz_offset_minutes: 0, last_sent_at: null };
    assert.strictEqual(push.shouldSendNow(utcSub, new Date('2026-09-20T20:05:00Z')), true, 'UTC+0 dùng đúng giờ UTC');
    assert.strictEqual(push.shouldSendNow(null, new Date()), false, 'không có subscription → false');
    console.log('TEST 3 OK — shouldSendNow: đúng giờ địa phương, mỗi ngày một lần');
  }

  // ---------- TEST 4: buildDigest + localNow + monthKeyFor (thuần) ----------
  {
    const local = push.localNow(420, new Date('2026-09-20T13:00:00Z'));
    assert.deepStrictEqual(local, { year: 2026, month: 9, day: 20, hour: 20 }, 'UTC+7 quy đổi đúng sang giờ địa phương');
    assert.strictEqual(push.monthKeyFor(local), 'planner-2026-9', 'key tháng đúng định dạng client');

    // 20/09 → chỉ số "hôm qua" trong days[] là 18; tasks của ngày 20 chưa done.
    const state = {
      habits: [
        { name: 'Nước', days: new Array(18).fill(true) }, // hôm qua (index 18) chưa tick
        { name: 'Đọc', days: new Array(19).fill(true) },   // hôm qua đã tick
      ],
      weeks: [{ week: 3, days: [{ day: 20, tasks: [{ text: 'A', done: true }, { text: 'B', done: false }] }] }],
    };
    const digest = push.buildDigest(state, local, 'vi');
    assert.strictEqual(digest.title, 'TaskFlow 🐥');
    assert.ok(digest.body.includes('1 việc'), 'đếm đúng việc chưa xong: ' + digest.body);
    assert.ok(digest.body.includes('1 thói quen'), 'đếm đúng thói quen bỏ lỡ: ' + digest.body);
    assert.strictEqual(digest.tag, 'taskflow-digest');

    const en = push.buildDigest(state, local, 'en');
    assert.ok(en.body.includes('task(s) left today'), 'lang=en dùng tiếng Anh: ' + en.body);

    assert.strictEqual(push.buildDigest(null, local), null, 'không có state → không gửi');
    assert.strictEqual(push.buildDigest({}, local), null, 'state rỗng → không gửi');
    const allDone = {
      habits: [{ name: 'Nước', days: new Array(19).fill(true) }],
      weeks: [{ week: 3, days: [{ day: 20, tasks: [{ text: 'A', done: true }] }] }],
    };
    assert.strictEqual(push.buildDigest(allDone, local), null, 'không có gì đáng nhắc → không gửi');
    console.log('TEST 4 OK — buildDigest/localNow/monthKeyFor thuần, không gửi thông báo rỗng');
  }

  // ---------- TEST 5: sendToSubscription phân loại kết quả (client bơm vào) ----------
  {
    const sub = { id: 1, endpoint: 'https://push.example/x', p256dh: 'k', auth: 'a' };
    const ok = { sendNotification: async () => ({ statusCode: 201 }) };
    const gone = { sendNotification: async () => { const e = new Error('gone'); e.statusCode = 410; throw e; } };
    const notFound = { sendNotification: async () => { const e = new Error('nf'); e.statusCode = 404; throw e; } };
    const broken = { sendNotification: async () => { const e = new Error('boom'); e.statusCode = 500; throw e; } };

    assert.strictEqual(await push.sendToSubscription(sub, { title: 't' }, ok), 'sent');
    assert.strictEqual(await push.sendToSubscription(sub, { title: 't' }, gone), 'pruned', '410 → endpoint chết');
    assert.strictEqual(await push.sendToSubscription(sub, { title: 't' }, notFound), 'pruned', '404 → endpoint chết');
    assert.strictEqual(await push.sendToSubscription(sub, { title: 't' }, broken), 'failed', '5xx → lỗi tạm thời');
    assert.strictEqual(await push.sendToSubscription(sub, { title: 't' }, null), 'not-configured');
    console.log('TEST 5 OK — sendToSubscription: sent / pruned (404·410) / failed');
  }

  // ---------- TEST 6: cấu hình VAPID → subscribe, idempotent, cô lập user, unsubscribe ----------
  {
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    assert.strictEqual(push.isConfigured(), true, 'có key → configured');

    const tokenA = await signup(base, 'pushuser2');
    const tokenB = await signup(base, 'pushuser3');

    const statusA = await (await fetch(base + '/api/push/status', { headers: auth(tokenA) })).json();
    assert.strictEqual(statusA.configured, true);
    assert.strictEqual(statusA.publicKey, keys.publicKey, 'client cần publicKey để subscribe');

    const subscribe = (token, body) => fetch(base + '/api/push/subscribe', {
      method: 'POST',
      headers: jsonAuth(token),
      body: JSON.stringify(body),
    });
    const good = {
      endpoint: 'https://fcm.googleapis.com/wp/abc',
      keys: { p256dh: 'p'.repeat(40), auth: 'a'.repeat(20) },
      reminderHour: 7,
      tzOffsetMinutes: 420,
      lang: 'vi',
    };

    assert.strictEqual((await subscribe(tokenA, { ...good, endpoint: 'http://insecure/x' })).status, 400,
      'endpoint không https → 400');
    assert.strictEqual((await subscribe(tokenA, { ...good, keys: { p256dh: '', auth: '' } })).status, 400,
      'thiếu khoá → 400');
    assert.strictEqual((await subscribe(tokenA, { ...good, reminderHour: 24 })).status, 400,
      'giờ nhắc ngoài 0–23 → 400');
    assert.strictEqual((await subscribe(tokenA, { ...good, tzOffsetMinutes: 9000 })).status, 400,
      'offset múi giờ vô lý → 400');

    const okRes = await subscribe(tokenA, good);
    assert.strictEqual(okRes.status, 200, 'subscribe hợp lệ → 200');
    assert.strictEqual((await okRes.json()).reminderHour, 7);

    const again = await subscribe(tokenA, { ...good, reminderHour: 8 });
    assert.strictEqual(again.status, 200);
    const p = initDb();
    const countA = await p.query('select count(*) as n from push_subscription where user_id = (select id from users where username_lower = $1)', ['pushuser2']);
    assert.strictEqual(Number(countA.rows[0].n), 1, 'subscribe lặp cùng endpoint → vẫn 1 dòng (idempotent)');
    const hourRow = await p.query('select reminder_hour from push_subscription where endpoint = $1', [good.endpoint]);
    assert.strictEqual(Number(hourRow.rows[0].reminder_hour), 8, 'subscribe lại cập nhật giờ nhắc');

    await subscribe(tokenB, { ...good, endpoint: 'https://fcm.googleapis.com/wp/other' });

    // B không thể xoá subscription của A (endpoint của A)
    await fetch(base + '/api/push/unsubscribe', {
      method: 'POST', headers: jsonAuth(tokenB), body: JSON.stringify({ endpoint: good.endpoint }),
    });
    const stillThere = await p.query('select count(*) as n from push_subscription where endpoint = $1', [good.endpoint]);
    assert.strictEqual(Number(stillThere.rows[0].n), 1, 'user khác không xoá được subscription của A');

    const removed = await (await fetch(base + '/api/push/unsubscribe', {
      method: 'POST', headers: jsonAuth(tokenA), body: JSON.stringify({ endpoint: good.endpoint }),
    })).json();
    assert.strictEqual(removed.removed, 1, 'chủ sở hữu xoá được');
    const afterCount = await (await fetch(base + '/api/push/status', { headers: auth(tokenA) })).json();
    assert.strictEqual(afterCount.subscriptions, 0, 'status phản ánh đã xoá');
    console.log('TEST 6 OK — subscribe validation, idempotent, cô lập user, unsubscribe');
  }

  // ---------- TEST 7: recordResult cập nhật đúng DB ----------
  {
    if (!process.env.VAPID_PUBLIC_KEY) {
      const keys = webpush.generateVAPIDKeys();
      process.env.VAPID_PUBLIC_KEY = keys.publicKey;
      process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    }
    const token = await signup(base, 'pushuser4');
    const endpoint = 'https://fcm.googleapis.com/wp/counted';
    await fetch(base + '/api/push/subscribe', {
      method: 'POST',
      headers: jsonAuth(token),
      body: JSON.stringify({
        endpoint, keys: { p256dh: 'p'.repeat(40), auth: 'a'.repeat(20) },
        reminderHour: 9, tzOffsetMinutes: 0, lang: 'vi',
      }),
    });
    const p = initDb();
    const row = await p.query('select id from push_subscription where endpoint = $1', [endpoint]);
    const sub = { id: row.rows[0].id };

    await push.recordResult(p, sub, 'failed');
    await push.recordResult(p, sub, 'failed');
    let cur = await p.query('select failures, last_sent_at from push_subscription where endpoint = $1', [endpoint]);
    assert.strictEqual(Number(cur.rows[0].failures), 2, 'failed → tăng failures');
    assert.strictEqual(cur.rows[0].last_sent_at, null, 'failed → không đánh dấu đã gửi');

    await push.recordResult(p, sub, 'sent');
    cur = await p.query('select failures, last_sent_at from push_subscription where endpoint = $1', [endpoint]);
    assert.strictEqual(Number(cur.rows[0].failures), 0, 'gửi được → reset failures');
    assert.ok(cur.rows[0].last_sent_at, 'gửi được → ghi last_sent_at (chặn gửi trùng trong ngày)');

    await push.recordResult(p, sub, 'pruned');
    cur = await p.query('select count(*) as n from push_subscription where endpoint = $1', [endpoint]);
    assert.strictEqual(Number(cur.rows[0].n), 0, 'endpoint chết (410) → xoá khỏi DB');
    console.log('TEST 7 OK — recordResult: failures / last_sent_at / prune theo endpoint chết');
  }

  server.close();
  console.log('\nALL PUSH SERVER TESTS PASSED');
}

main().catch((e) => {
  console.error('PUSH TEST FAILED:', e);
  process.exit(1);
});
