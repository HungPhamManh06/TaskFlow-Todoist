'use strict';
/* Fallback redirect test: khi GOOGLE_REDIRECT_URI KHÔNG được cấu hình, redirect_uri
   phải suy ra từ request (req.protocol + req.host) — giúp local dev hoạt động.
   Chạy tách biệt (file riêng) vì env được đọc lúc require server. */
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
// Cố ý KHÔNG set GOOGLE_REDIRECT_URI.
process.env.APP_URL = 'http://127.0.0.1';

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
  return j.token;
}

async function main() {
  await ensureSchema();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;

  const token = await signup(base, 'oauthfallback1');
  const res = await fetch(base + '/api/calendar/connect?token=' + encodeURIComponent(token), { redirect: 'manual' });
  assert.ok(res.status === 302 || res.status === 307, 'connect phải redirect');
  const loc = res.headers.get('location') || '';
  const u = new URL(loc);
  const redirectUri = u.searchParams.get('redirect_uri') || '';
  const expected = 'http://127.0.0.1:' + port + '/api/calendar/callback';
  assert.strictEqual(redirectUri, expected, 'fallback phải là request-derived: ' + redirectUri);
  console.log('FALLBACK OK — không có GOOGLE_REDIRECT_URI → redirect_uri từ request: ' + redirectUri);

  server.close();
  console.log('\nALL SERVER CALENDAR OAUTH FALLBACK TESTS PASS');
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
