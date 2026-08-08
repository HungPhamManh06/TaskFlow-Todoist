'use strict';
/* Test bảo mật backend — chạy backend thật (pg-mem) + kiểm tra:
   1. Fail-fast: production (DATABASE_URL) mà thiếu JWT_SECRET → từ chối khởi động
   2. CORS: origin ngoài allowlist không nhận ACAO, origin hợp lệ thì có
   3. Security headers hiện diện trên mọi response
   4. Auth flow: signup → login → /me → change-password → delete-account
   5. Rate limit login/signup: quá 10 lần / 15 phút → 429
*/
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const assert = require('assert');
const { app, ensureSchema } = require('./server/index');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await ensureSchema();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;

  // ---------- TEST 1: fail-fast khi production thiếu JWT_SECRET ----------
  {
    const script = path.join(__dirname, 'server', 'index.js');
    const res = spawnSync(process.execPath, [script], {
      env: { ...process.env, DATABASE_URL: 'postgres://fake:fake@localhost:1/fake', JWT_SECRET: '' },
      timeout: 20000,
      encoding: 'utf8',
    });
    assert.ok(res.status !== 0, 'server phải exit non-zero khi thiếu JWT_SECRET ở production');
    assert.match(res.stderr || '', /FATAL: JWT_SECRET/, 'lỗi phải nêu rõ JWT_SECRET');
    console.log('TEST 1 OK — fail-fast khi thiếu JWT_SECRET ở production');
  }

  // ---------- TEST 2: CORS allowlist ----------
  {
    const disallowed = await fetch(base + '/health', { headers: { Origin: 'https://evil.example' } });
    assert.ok(!disallowed.headers.has('access-control-allow-origin'),
      'origin lạ KHÔNG được nhận ACAO header');
    const allowed = await fetch(base + '/health', { headers: { Origin: 'https://taskflow-todoist.vercel.app' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://taskflow-todoist.vercel.app',
      'origin hợp lệ nhận đúng ACAO header');
    const preview = await fetch(base + '/health', { headers: { Origin: 'https://taskflow-todoist-git-fix.vercel.app' } });
    assert.equal(preview.headers.get('access-control-allow-origin'), 'https://taskflow-todoist-git-fix.vercel.app',
      'preview *.vercel.app được phép');
    console.log('TEST 2 OK — CORS allowlist hoạt động (deny lạ / allow hợp lệ + preview)');
  }

  // ---------- TEST 3: security headers ----------
  {
    const res = await fetch(base + '/health');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(res.headers.get('permissions-policy') || '', /geolocation=\(\)/);
    console.log('TEST 3 OK — security headers hiện diện');
  }

  // ---------- TEST 4: auth flow signup → login → me → change-password → delete ----------
  {
    const uname = 'sec_user_' + Date.now();
    const signup = await fetch(base + '/api/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uname, password: 'matkhau123' }),
    });
    assert.equal(signup.status, 201, 'signup phải 201');
    const { token } = await signup.json();
    assert.ok(token, 'signup trả token');

    const login = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uname, password: 'matkhau123' }),
    });
    assert.equal(login.status, 200, 'login phải 200');

    const badLogin = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uname, password: 'sai-mat-khau' }),
    });
    assert.equal(badLogin.status, 401, 'sai mật khẩu phải 401');
    assert.equal((await badLogin.json()).error, 'bad-credentials', 'không lộ thông tin user');

    const me = await fetch(base + '/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(me.status, 200, '/me với token hợp lệ phải 200');

    const forged = await fetch(base + '/api/auth/me', {
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjEsInVuYW1lIjoiaGFja2VyIn0.abc' },
    });
    assert.equal(forged.status, 401, 'token giả phải 401');

    const pw = await fetch(base + '/api/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ currentPassword: 'matkhau123', newPassword: 'matkhaumoi456' }),
    });
    assert.equal(pw.status, 200, 'change-password phải 200');

    const del = await fetch(base + '/api/auth/delete-account', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(del.status, 200, 'delete-account phải 200');
    console.log('TEST 4 OK — auth flow đầy đủ (signup/login/me/change-password/delete + token giả bị chặn)');
  }

  // ---------- TEST 5: rate limit signup ----------
  // Lưu ý: login + signup dùng CHUNG một limiter instance (10/15ph/IP) — TEST 4
  // đã tiêu 3 lượt (signup + 2 login), nên 429 xuất hiện ở lượt ~8/12. Nếu tách
  // limiter theo route hoặc tăng max, test này phải điều chỉnh theo.
  {
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const r = await fetch(base + '/api/auth/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'rl_' + Date.now() + '_' + i, password: 'matkhau123' }),
      });
      if (r.status === 429) { got429 = true; break; }
      await sleep(5);
    }
    assert.ok(got429, 'quá 10 lần signup trong 15 phút phải bị 429');
    console.log('TEST 5 OK — rate limit signup chặn brute-force');
  }

  server.close();
  console.log('\nALL SERVER SECURITY TESTS PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.error('SECURITY TEST FAILED:', e.message);
  process.exit(1);
});
