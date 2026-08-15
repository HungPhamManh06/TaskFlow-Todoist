'use strict';
/* Test backend Google Calendar OAuth flow (V2 release hardening) — backend thật
   (pg-mem). Stub fetch cho oauth2.googleapis.com/token. Kiểm tra:
   - redirect_uri dùng GOOGLE_REDIRECT_URI nhất quán trong connect/connect-write/callback
   - read connect → status write:false
   - write connect callback → scope calendar.events được lưu → status write:true
   - j.scope (scope thực Google cấp) thắng requestedScopes khi không có calendar.events
   - state không hợp lệ bị từ chối (cal=error) */
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'https://todoist-m3c7.onrender.com/api/calendar/callback';
process.env.APP_URL = 'https://taskflow-todoist.vercel.app/app';

const assert = require('assert');
const { app, ensureSchema } = require('./server/index');

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
  const REDIRECT = 'https://todoist-m3c7.onrender.com/api/calendar/callback';

  const READ_ONLY_SCOPES = 'openid email profile https://www.googleapis.com/auth/calendar.readonly';
  const WRITE_SCOPES = READ_ONLY_SCOPES + ' https://www.googleapis.com/auth/calendar.events';

  // Stub Google token endpoint: trả access_token + scope "được cấp" theo tokenScope.
  let tokenScope = READ_ONLY_SCOPES;
  const origFetch = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('oauth2.googleapis.com/token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'test-access',
          refresh_token: 'test-refresh',
          expires_in: 3600,
          scope: tokenScope,
        }),
      };
    }
    if (u.includes('calendar/v3')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ id: 'primary', summary: 'Primary', primary: true }],
        }),
      };
    }
    return origFetch(url, init);
  };

  function parseRedirect(location) {
    const u = new URL(location);
    return { host: u.host, path: u.pathname, params: Object.fromEntries(u.searchParams) };
  }

  // ---------- TEST 1: read connect → redirect_uri = GOOGLE_REDIRECT_URI, write:false ----------
  {
    const token = await signup(base, 'oauthread1');
    const res = await fetch(base + '/api/calendar/connect?token=' + encodeURIComponent(token), { redirect: 'manual' });
    assert.ok(res.status === 302 || res.status === 307, 'connect phải redirect, thấy ' + res.status);
    const r = parseRedirect(res.headers.get('location'));
    assert.strictEqual(r.host, 'accounts.google.com', 'redirect tới Google OAuth');
    assert.strictEqual(r.params.redirect_uri, REDIRECT, 'redirect_uri phải = GOOGLE_REDIRECT_URI');
    assert.ok(r.params.scope.includes('calendar.readonly'), 'scope phải có readonly');
    assert.ok(!r.params.scope.includes('calendar.events'), 'read connect KHÔNG yêu cầu write scope');
    assert.ok(r.params.state, 'phải có CSRF state');

    // callback với state đúng, Google cấp read-only → write:false
    const cb = await fetch(base + '/api/calendar/callback?code=code1&state=' + encodeURIComponent(r.params.state), { redirect: 'manual' });
    const loc = cb.headers.get('location') || '';
    assert.ok(loc.includes('cal=ok'), 'callback thành công → cal=ok: ' + loc);
    const st = await fetch(base + '/api/calendar/status', { headers: { Authorization: 'Bearer ' + token } }).then((x) => x.json());
    assert.strictEqual(st.connected, true, 'đã kết nối');
    assert.strictEqual(st.write, false, 'read connect → write:false');
    console.log('TEST 1 OK — read connect → GOOGLE_REDIRECT_URI nhất quán + write:false');
  }

  // ---------- TEST 2: write connect → scope có calendar.events → callback → write:true ----------
  {
    const token = await signup(base, 'oauthwrite1');
    const res = await fetch(base + '/api/calendar/connect-write?token=' + encodeURIComponent(token), { redirect: 'manual' });
    assert.ok(res.status === 302 || res.status === 307, 'connect-write phải redirect');
    const r = parseRedirect(res.headers.get('location'));
    assert.strictEqual(r.params.redirect_uri, REDIRECT, 'connect-write redirect_uri = GOOGLE_REDIRECT_URI');
    assert.ok(r.params.scope.includes('calendar.events'), 'connect-write phải yêu cầu calendar.events');

    tokenScope = WRITE_SCOPES; // Google cấp full scope
    const cb = await fetch(base + '/api/calendar/callback?code=code2&state=' + encodeURIComponent(r.params.state), { redirect: 'manual' });
    const loc = cb.headers.get('location') || '';
    assert.ok(loc.includes('cal=ok'), 'callback thành công: ' + loc);
    const st = await fetch(base + '/api/calendar/status', { headers: { Authorization: 'Bearer ' + token } }).then((x) => x.json());
    assert.strictEqual(st.connected, true);
    assert.strictEqual(st.write, true, 'connect-write + calendar.events được cấp → write:true');
    console.log('TEST 2 OK — write connect → calendar.events lưu → write:true');
  }

  // ---------- TEST 3: write connect nhưng Google chỉ cấp read scope → write:false ----------
  {
    const token = await signup(base, 'oauthwrite2');
    const res = await fetch(base + '/api/calendar/connect-write?token=' + encodeURIComponent(token), { redirect: 'manual' });
    const r = parseRedirect(res.headers.get('location'));

    tokenScope = READ_ONLY_SCOPES; // Google chỉ cấp read-only (user từ chối write)
    const cb = await fetch(base + '/api/calendar/callback?code=code3&state=' + encodeURIComponent(r.params.state), { redirect: 'manual' });
    const loc = cb.headers.get('location') || '';
    assert.ok(loc.includes('cal=ok'), 'callback thành công: ' + loc);
    const st = await fetch(base + '/api/calendar/status', { headers: { Authorization: 'Bearer ' + token } }).then((x) => x.json());
    assert.strictEqual(st.write, false, 'scope thực cấp không có calendar.events → write:false');
    console.log('TEST 3 OK — j.scope thắng requestedScopes (write connect, read granted → write:false)');
  }

  // ---------- TEST 4: state không hợp lệ bị từ chối ----------
  {
    const res = await fetch(base + '/api/calendar/callback?code=x&state=bogus', { redirect: 'manual' });
    assert.ok(res.status === 302 || res.status === 307, 'callback phải redirect');
    const loc = res.headers.get('location') || '';
    assert.ok(loc.includes('cal=error'), 'state sai → cal=error: ' + loc);
    console.log('TEST 4 OK — callback từ chối state không hợp lệ');
  }

  global.fetch = origFetch;
  console.log('\nALL SERVER CALENDAR OAUTH TESTS PASS');
  server.close();
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
