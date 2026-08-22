'use strict';
/* Test backend Google Calendar export (V1.6B) — backend thật (pg-mem).
   Không gọi Google thật: stub global.fetch chỉ cho URL calendar/v3. Kiểm tra:
   auth, validation, chưa kết nối, thiếu scope ghi, thành công + mapping,
   duplicate idempotent (không tạo event lặp), retry lỗi nhất thời. */
process.env.AUTH_RATE_LIMIT_MAX = '1000'; // avoid rate-limit when creating many test accounts
const assert = require('assert');
const { app, ensureSchema } = require('./server/index');
const { initDb } = require('./server/db');

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
  return { token: j.token, username };
}

// Gắn kết nối Google cho user (scope theo tham số) trực tiếp trong DB pg-mem.
async function setGoogleRow(username, scopes) {
  const p = initDb();
  const r = await p.query('select id from users where username = $1', [username]);
  assert.ok(r.rows.length, 'user phải tồn tại');
  const uid = r.rows[0].id;
  await p.query(
    `update users set google_access_token = 'test-access', google_refresh_token = 'test-refresh',
       google_token_expires_at = now() + interval '2 hours', google_scopes = $2
     where id = $1`,
    [uid, scopes]
  );
  return uid;
}

const READ_ONLY_SCOPES = 'openid email profile https://www.googleapis.com/auth/calendar.readonly';
const WRITE_SCOPES = READ_ONLY_SCOPES + ' https://www.googleapis.com/auth/calendar.events';

async function main() {
  await ensureSchema();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;

  // Stub Google API (chỉ calendar/v3 + token endpoint). Trả theo script.
  let gcalCalls = 0;
  let gcalMode = 'ok'; // 'ok' | 'fail-then-ok' | 'fail'
  const gcalMethods = []; // log method: 'POST' | 'PATCH' | 'DELETE'
  const origFetch = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('calendar/v3')) {
      gcalCalls++;
      const method = (init && init.method) || 'GET';
      gcalMethods.push(method);
      if (gcalMode === 'fail') {
        return { ok: false, status: 502, json: async () => ({ error: 'backendError' }) };
      }
      if (gcalMode === 'fail-then-ok') {
        gcalMode = 'ok';
        return { ok: false, status: 502, json: async () => ({ error: 'backendError' }) };
      }
      if (method === 'DELETE') {
        return { ok: true, status: 204, json: async () => null };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'gcal-event-' + gcalCalls, htmlLink: 'https://calendar.google.com/event?id=' + gcalCalls }),
      };
    }
    if (u.includes('oauth2.googleapis.com/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'test-access', expires_in: 3600 }) };
    }
    return origFetch(url, init);
  };

  try {
    // ---------- TEST 1: export yêu cầu Bearer ----------
    {
      const res = await fetch(base + '/api/calendar/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      assert.strictEqual(res.status, 401, 'thiếu token → 401');
      console.log('TEST 1 OK — export yêu cầu auth');
    }

    // ---------- TEST 2: validation body ----------
    {
      const { token } = await signup(base, 'gcalw1');
      const bad = await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: '', title: 'x', startIso: '2026-08-20T09:00:00+07:00', endIso: '2026-08-20T10:00:00+07:00' }),
      });
      assert.strictEqual(bad.status, 400, 'blockId rỗng → 400');
      const badRange = await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'b', title: 'x', startIso: '2026-08-20T11:00:00+07:00', endIso: '2026-08-20T10:00:00+07:00' }),
      });
      assert.strictEqual(badRange.status, 400, 'end trước start → 400');
      console.log('TEST 2 OK — export validate blockId + range');
    }

    // ---------- TEST 3: chưa kết nối → 410 ----------
    {
      const { token } = await signup(base, 'gcalw2');
      const res = await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'b1', title: 'x', startIso: '2026-08-20T09:00:00+07:00', endIso: '2026-08-20T10:00:00+07:00' }),
      });
      assert.strictEqual(res.status, 410, 'chưa kết nối → 410');
      console.log('TEST 3 OK — export khi chưa kết nối → 410');
    }

    // ---------- TEST 4: kết nối read-only (thiếu scope ghi) → 403 ----------
    {
      const { token, username } = await signup(base, 'gcalw3');
      await setGoogleRow(username, READ_ONLY_SCOPES);
      const res = await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'b2', title: 'x', startIso: '2026-08-20T09:00:00+07:00', endIso: '2026-08-20T10:00:00+07:00' }),
      });
      assert.strictEqual(res.status, 403, 'thiếu scope ghi → 403');
      const j = await res.json();
      assert.strictEqual(j.error, 'write-scope-required');
      console.log('TEST 4 OK — export chặn khi chưa cấp scope ghi');
    }

    // ---------- TEST 5: status báo write:true khi có scope ghi ----------
    {
      const { token, username } = await signup(base, 'gcalw4');
      await setGoogleRow(username, WRITE_SCOPES);
      const res = await fetch(base + '/api/calendar/status', { headers: { Authorization: 'Bearer ' + token } });
      const j = await res.json();
      assert.strictEqual(j.connected, true);
      assert.strictEqual(j.write, true, 'có scope ghi → write:true');
      console.log('TEST 5 OK — status phản ánh write scope');
    }

    // ---------- TEST 6: export thành công → tạo event + lưu mapping ----------
    {
      const { token, username } = await signup(base, 'gcalw5');
      await setGoogleRow(username, WRITE_SCOPES);
      gcalCalls = 0;
      const res = await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-x', taskUid: 'task-1', title: 'Học Spring', startIso: '2026-08-20T09:00:00+07:00', endIso: '2026-08-20T10:30:00+07:00' }),
      });
      assert.strictEqual(res.status, 200);
      const j = await res.json();
      assert.strictEqual(j.ok, true);
      assert.strictEqual(j.duplicate, false);
      assert.strictEqual(j.mapping.taskflowBlockId, 'block-x');
      assert.ok(j.mapping.googleEventId, 'phải có googleEventId');
      assert.strictEqual(j.mapping.calendarId, 'primary');
      assert.strictEqual(gcalCalls, 1, 'tạo đúng 1 event');
      console.log('TEST 6 OK — export tạo event + mapping');
    }

    // ---------- TEST 7: duplicate → mapping cũ, KHÔNG tạo event lặp ----------
    {
      const { token, username } = await signup(base, 'gcalw6');
      await setGoogleRow(username, WRITE_SCOPES);
      gcalCalls = 0;
      const body = { blockId: 'block-dup', title: 'Lặp', startIso: '2026-08-20T09:00:00+07:00', endIso: '2026-08-20T10:00:00+07:00' };
      const opts = () => ({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
      const r1 = await fetch(base + '/api/calendar/export', opts()).then((x) => x.json());
      const r2 = await fetch(base + '/api/calendar/export', opts()).then((x) => x.json());
      assert.strictEqual(r1.duplicate, false);
      assert.strictEqual(r2.duplicate, true, 'lần 2 → duplicate');
      assert.strictEqual(r2.mapping.googleEventId, r1.mapping.googleEventId, 'cùng event, không tạo mới');
      assert.strictEqual(gcalCalls, 1, 'chỉ gọi Google 1 lần dù export 2 lần');
      console.log('TEST 7 OK — duplicate idempotent, không tạo event lặp');
    }

    // ---------- TEST 8: retry lỗi nhất thời (5xx) → thành công ----------
    {
      const { token, username } = await signup(base, 'gcalw7');
      await setGoogleRow(username, WRITE_SCOPES);
      gcalCalls = 0;
      gcalMode = 'fail-then-ok';
      const res = await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-retry', title: 'Retry', startIso: '2026-08-20T09:00:00+07:00', endIso: '2026-08-20T10:00:00+07:00' }),
      });
      const j = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(j.ok, true, 'retry sau lỗi nhất thời phải thành công');
      assert.strictEqual(gcalCalls, 2, '2 lần gọi (lần đầu 5xx, lần 2 ok)');
      console.log('TEST 8 OK — retry lỗi nhất thời');
    }

    // ---------- TEST 9: lỗi bền vững → 502, không lưu mapping ----------
    {
      const { token, username } = await signup(base, 'gcalw8');
      await setGoogleRow(username, WRITE_SCOPES);
      gcalCalls = 0;
      gcalMode = 'fail';
      const res = await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-fail', title: 'Fail', startIso: '2026-08-20T09:00:00+07:00', endIso: '2026-08-20T10:00:00+07:00' }),
      });
      assert.strictEqual(res.status, 502, 'Google 5xx bền vững → 502');
      const p = initDb();
      const r = await p.query('select 1 from google_cal_mapping where user_id = (select id from users where username = $1) and taskflow_block_id = $2', [username, 'block-fail']);
      assert.strictEqual(r.rows.length, 0, 'không lưu mapping khi thất bại');
      console.log('TEST 9 OK — lỗi bền vững → 502, không mapping');
    }

    // ---------- TEST 10: update khi chưa có mapping → 409 ----------
    {
      const { token, username } = await signup(base, 'gcalw9');
      await setGoogleRow(username, WRITE_SCOPES);
      const res = await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-nomap', title: 'x', startIso: '2026-08-21T09:00:00+07:00', endIso: '2026-08-21T10:00:00+07:00', update: true }),
      });
      assert.strictEqual(res.status, 409, 'update không mapping → 409');
      const j = await res.json();
      assert.strictEqual(j.error, 'no-mapping');
      console.log('TEST 10 OK — update không mapping → 409');
    }

    // ---------- TEST 11: update có mapping → PATCH event cùng id, không tạo mới ----------
    {
      const { token, username } = await signup(base, 'gcalw10');
      await setGoogleRow(username, WRITE_SCOPES);
      gcalCalls = 0;
      gcalMethods.length = 0;
      gcalMode = 'ok';
      const create = await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-upd', title: 'Cũ', startIso: '2026-08-21T09:00:00+07:00', endIso: '2026-08-21T10:00:00+07:00' }),
      }).then((x) => x.json());
      const upd = await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-upd', title: 'Mới', startIso: '2026-08-21T11:00:00+07:00', endIso: '2026-08-21T12:00:00+07:00', update: true }),
      });
      assert.strictEqual(upd.status, 200);
      const j = await upd.json();
      assert.strictEqual(j.ok, true);
      assert.strictEqual(j.updated, true);
      assert.strictEqual(j.duplicate, false);
      assert.strictEqual(j.mapping.googleEventId, create.mapping.googleEventId, 'PATCH giữ nguyên event id');
      assert.ok(gcalMethods.includes('PATCH'), 'phải gọi PATCH tới Google');
      assert.strictEqual(gcalCalls, 2, 'create(1) + patch(1) — không tạo event mới');
      console.log('TEST 11 OK — update PATCH event cùng id');
    }

    // ---------- TEST 12: unlink deleteEvent=false → bỏ mapping, KHÔNG gọi DELETE ----------
    {
      const { token, username } = await signup(base, 'gcalw11');
      await setGoogleRow(username, WRITE_SCOPES);
      gcalCalls = 0;
      gcalMethods.length = 0;
      gcalMode = 'ok';
      await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-unlink-keep', title: 'Giữ', startIso: '2026-08-21T09:00:00+07:00', endIso: '2026-08-21T10:00:00+07:00' }),
      });
      const res = await fetch(base + '/api/calendar/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-unlink-keep', deleteEvent: false }),
      });
      assert.strictEqual(res.status, 200);
      const j = await res.json();
      assert.strictEqual(j.ok, true);
      assert.strictEqual(j.deletedEvent, false);
      assert.ok(!gcalMethods.includes('DELETE'), 'không xoá event Google khi tắt syncDeletes');
      const p = initDb();
      const r = await p.query('select 1 from google_cal_mapping where user_id = (select id from users where username = $1) and taskflow_block_id = $2', [username, 'block-unlink-keep']);
      assert.strictEqual(r.rows.length, 0, 'mapping đã bị xoá');
      console.log('TEST 12 OK — unlink giữ event (syncDeletes off)');
    }

    // ---------- TEST 13: unlink deleteEvent=true → DELETE event Google + bỏ mapping ----------
    {
      const { token, username } = await signup(base, 'gcalw12');
      await setGoogleRow(username, WRITE_SCOPES);
      gcalCalls = 0;
      gcalMethods.length = 0;
      gcalMode = 'ok';
      await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-unlink-del', title: 'Xoá', startIso: '2026-08-21T09:00:00+07:00', endIso: '2026-08-21T10:00:00+07:00' }),
      });
      const res = await fetch(base + '/api/calendar/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-unlink-del', deleteEvent: true }),
      });
      assert.strictEqual(res.status, 200);
      const j = await res.json();
      assert.strictEqual(j.ok, true);
      assert.strictEqual(j.deletedEvent, true);
      assert.ok(gcalMethods.includes('DELETE'), 'phải gọi DELETE tới Google');
      const p = initDb();
      const r = await p.query('select 1 from google_cal_mapping where user_id = (select id from users where username = $1) and taskflow_block_id = $2', [username, 'block-unlink-del']);
      assert.strictEqual(r.rows.length, 0, 'mapping đã bị xoá');
      console.log('TEST 13 OK — unlink xoá event Google (syncDeletes on)');
    }

    // ---------- TEST 14: unlink không mapping → noop, không gọi Google ----------
    {
      const { token, username } = await signup(base, 'gcalw13');
      await setGoogleRow(username, WRITE_SCOPES);
      gcalCalls = 0;
      gcalMode = 'ok';
      const res = await fetch(base + '/api/calendar/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-ghost', deleteEvent: true }),
      });
      assert.strictEqual(res.status, 200);
      const j = await res.json();
      assert.strictEqual(j.noop, true, 'không mapping → noop');
      assert.strictEqual(gcalCalls, 0, 'không gọi Google');
      console.log('TEST 14 OK — unlink không mapping → noop');
    }

    // ---------- TEST 15: update retry lỗi nhất thời → PATCH thành công ----------
    {
      const { token, username } = await signup(base, 'gcalw14');
      await setGoogleRow(username, WRITE_SCOPES);
      gcalCalls = 0;
      gcalMethods.length = 0;
      gcalMode = 'ok';
      await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-upd-retry', title: 'Cũ', startIso: '2026-08-21T09:00:00+07:00', endIso: '2026-08-21T10:00:00+07:00' }),
      });
      gcalMode = 'fail-then-ok';
      const res = await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-upd-retry', title: 'Mới', startIso: '2026-08-21T11:00:00+07:00', endIso: '2026-08-21T12:00:00+07:00', update: true }),
      });
      assert.strictEqual(res.status, 200);
      const j = await res.json();
      assert.strictEqual(j.updated, true, 'update sau lỗi nhất thời phải thành công');
      assert.strictEqual(gcalCalls, 3, 'create(1) + patch fail(1) + patch ok(1)');
      console.log('TEST 15 OK — update retry lỗi nhất thời');
    }

    // ---------- TEST 16: update lỗi bền vững → 502, mapping giữ nguyên ----------
    {
      const { token, username } = await signup(base, 'gcalw15');
      await setGoogleRow(username, WRITE_SCOPES);
      gcalCalls = 0;
      gcalMode = 'ok';
      const created = await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-upd-fail', title: 'Cũ', startIso: '2026-08-21T09:00:00+07:00', endIso: '2026-08-21T10:00:00+07:00' }),
      }).then((x) => x.json());
      gcalMode = 'fail';
      const res = await fetch(base + '/api/calendar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blockId: 'block-upd-fail', title: 'Mới', startIso: '2026-08-21T11:00:00+07:00', endIso: '2026-08-21T12:00:00+07:00', update: true }),
      });
      assert.strictEqual(res.status, 502, 'PATCH 5xx bền vững → 502');
      const p = initDb();
      const r = await p.query('select google_event_id from google_cal_mapping where user_id = (select id from users where username = $1) and taskflow_block_id = $2', [username, 'block-upd-fail']);
      assert.strictEqual(r.rows.length, 1, 'mapping vẫn còn');
      assert.strictEqual(r.rows[0].google_event_id, created.mapping.googleEventId, 'event id không đổi');
      console.log('TEST 16 OK — update lỗi bền vững → 502, mapping giữ nguyên');
    }

    console.log('\nALL SERVER CALENDAR WRITE TESTS PASS');
  } finally {
    global.fetch = origFetch;
    server.close();
  }
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
