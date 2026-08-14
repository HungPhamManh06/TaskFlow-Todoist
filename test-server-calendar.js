'use strict';
/* Test backend Google Calendar read-only (V1.6A) — chạy backend thật (pg-mem).
   Không gọi Google thật: test các nhánh auth/validation/trạng thái không nối mạng
   (chưa cấu hình / chưa kết nối / token thiếu / range sai / disconnect khi chưa kết nối). */
const assert = require('assert');
const { app, ensureSchema } = require('./server/index');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function main() {
  await ensureSchema();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;

  // ---------- TEST 1: /api/calendar/status cần Bearer token ----------
  {
    const res = await fetch(base + '/api/calendar/status');
    assert.strictEqual(res.status, 401, 'thiếu token → 401');
    const bad = await fetch(base + '/api/calendar/status', { headers: { Authorization: 'Bearer nonsense' } });
    assert.strictEqual(bad.status, 401, 'token sai → 401');
    console.log('TEST 1 OK — status yêu cầu auth hợp lệ');
  }

  // ---------- TEST 2: chưa kết nối → connected:false, write:false ----------
  {
    const token = await signup(base, 'gcaluser1');
    const res = await fetch(base + '/api/calendar/status', { headers: { Authorization: 'Bearer ' + token } });
    assert.strictEqual(res.status, 200);
    const j = await res.json();
    assert.strictEqual(j.connected, false, 'chưa kết nối → connected false');
    assert.strictEqual(j.write, false, 'read-only — write luôn false');
    assert.ok(Array.isArray(j.calendars));
    console.log('TEST 2 OK — status mặc định disconnected / read-only');
  }

  // ---------- TEST 3: /api/calendar/events validation ----------
  {
    const token = await signup(base, 'gcaluser2');
    const noRange = await fetch(base + '/api/calendar/events', { headers: { Authorization: 'Bearer ' + token } });
    assert.strictEqual(noRange.status, 400, 'thiếu timeMin/timeMax → 400');
    const badRange = await fetch(base + '/api/calendar/events?timeMin=garbage&timeMax=also-garbage', {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.strictEqual(badRange.status, 400, 'range sai → 400');
    console.log('TEST 3 OK — events yêu cầu range ISO hợp lệ');
  }

  // ---------- TEST 4: events khi chưa kết nối → 410 google-disconnected ----------
  {
    const token = await signup(base, 'gcaluser3');
    const res = await fetch(base + '/api/calendar/events?timeMin=2026-08-01T00:00:00Z&timeMax=2026-08-31T23:59:59Z', {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.strictEqual(res.status, 410, 'chưa kết nối → 410');
    const j = await res.json();
    assert.strictEqual(j.error, 'google-disconnected');
    console.log('TEST 4 OK — events khi chưa kết nối → 410');
  }

  // ---------- TEST 5: /api/calendar/connect khi chưa cấu hình → 503 ----------
  {
    const token = await signup(base, 'gcaluser4');
    const res = await fetch(base + '/api/calendar/connect?token=' + encodeURIComponent(token));
    // GOOGLE_CLIENT_ID rỗng trong môi trường test → 503 google-not-configured
    assert.strictEqual(res.status, 503, 'chưa cấu hình Google → 503');
    console.log('TEST 5 OK — connect chặn khi thiếu GOOGLE_CLIENT_ID');
  }

  // ---------- TEST 6: disconnect khi chưa kết nối → ok:true, không throw ----------
  {
    const token = await signup(base, 'gcaluser5');
    const res = await fetch(base + '/api/calendar/disconnect', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.strictEqual(res.status, 200);
    const j = await res.json();
    assert.strictEqual(j.ok, true, 'disconnect khi chưa kết nối phải ok');
    const st = await fetch(base + '/api/calendar/status', { headers: { Authorization: 'Bearer ' + token } }).then((x) => x.json());
    assert.strictEqual(st.connected, false);
    console.log('TEST 6 OK — disconnect idempotent khi chưa kết nối');
  }

  // ---------- TEST 7: /api/calendar/callback với state sai → redirect cal=error ----------
  {
    const res = await fetch(base + '/api/calendar/callback?code=x&state=bogus', { redirect: 'manual' });
    assert.ok(res.status === 302 || res.status === 307, 'callback phải redirect');
    const loc = res.headers.get('location') || '';
    assert.ok(loc.includes('cal=error'), 'state sai → cal=error: ' + loc);
    console.log('TEST 7 OK — callback từ chối state không hợp lệ');
  }

  console.log('\nALL SERVER CALENDAR TESTS PASS');
  server.close();
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
