'use strict';
/* Test logic đồng bộ js/sync.js bằng Node — chạy backend thật (pg-mem) + mock localStorage + mock fetch */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const { app, ensureSchema } = require('./server/index');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mockLocalStorage(initial) {
  const store = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; },
    _store: store
  };
}

function loadSync() {
  const code = fs.readFileSync('js/sync.js', 'utf8');
  vm.runInThisContext(code, { filename: 'sync.js' });
  return global.window.Sync;
}

async function main() {
  await ensureSchema();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const base = `http://localhost:${port}`;
  console.log('backend (pg-mem) đang chạy tại', base);

  // ---- TEST 1: chưa cấu hình → status 'off', push no-op ----
  {
    global.localStorage = mockLocalStorage({ 'planner-2026-1': '{"monthlyGoals":[]}' });
    global.window = {};
    global.API_CONFIG = { url: '' };
    const Sync = loadSync();
    await Sync.init();
    assert.strictEqual(Sync.getStatus(), 'off');
    Sync.push('planner-2026-1'); // không throw
    await sleep(30);
    console.log('TEST 1 OK — no config → status off, push no-op');
  }

  // ---- TEST 2: signup → dữ liệu local bị xoá (tài khoản mới = dữ liệu mới), không migrate ----
  {
    global.localStorage = mockLocalStorage({
      'planner-2026-2': '{"monthlyGoals":[{"id":"h","done":false}]}', // dữ liệu "tài khoản cũ" trên máy
      'planner-sync-meta': '{"x":1}' // key meta phải bị loại trừ
    });
    global.window = {};
    global.API_CONFIG = { url: base, pushDebounceMs: 5 };
    const Sync = loadSync();
    const r = await Sync.signup('syncuser1', 'Pass123456!');
    assert.strictEqual(r.ok, true, 'signup phải thành công');
    assert.strictEqual(Sync.getStatus(), 'ready');
    // dữ liệu local cũ phải bị xoá hết
    assert.strictEqual(global.localStorage.getItem('planner-2026-2'), null, 'local của tài khoản cũ phải bị xoá');
    assert.strictEqual(global.localStorage.getItem('planner-sync-meta'), '{}', 'meta phải được reset');
    const token = global.localStorage.getItem('planner-token');
    assert.ok(token, 'phải lưu token');
    await sleep(60); // chờ debounce — nếu có push nhầm sẽ hiện ở đây
    const rows = await fetch(base + '/api/sync', { headers: { Authorization: 'Bearer ' + token } }).then((x) => x.json());
    assert.strictEqual(rows.length, 0, 'tài khoản mới không được có dữ liệu nào');
    console.log('TEST 2 OK — signup xoá local cũ, tài khoản mới trống');
  }

  // ---- TEST 3: login sai mật khẩu → bad-credentials; đúng → pull remote mới hơn ----
  {
    const bad = await new Promise((resolve) => {
      global.localStorage = mockLocalStorage({});
      global.window = {};
      global.API_CONFIG = { url: base, pushDebounceMs: 5 };
      const Sync = loadSync();
      resolve(Sync.login('syncuser1', 'sai-mat-khau'));
    });
    assert.strictEqual(bad.ok, false, 'login sai mật khẩu phải thất bại');
    assert.strictEqual(bad.error, 'bad-credentials');
    console.log('TEST 3a OK — login sai → bad-credentials');

    global.localStorage = mockLocalStorage({});
    global.window = {};
    global.API_CONFIG = { url: base, pushDebounceMs: 5 };
    const seedSync = loadSync();
    const seedRes = await seedSync.login('syncuser1', 'Pass123456!');
    assert.strictEqual(seedRes.ok, true);
    const seedToken = global.localStorage.getItem('planner-token');

    global.localStorage = mockLocalStorage({
      'planner-2026-3': '{"monthlyGoals":[],"old":true}' // local cũ hơn remote
    });
    const sync = await fetch(base + '/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + seedToken },
      body: JSON.stringify({ key: 'planner-2026-3', data: { monthlyGoals: [{ id: 'g0', done: true }] } })
    }).then((x) => x.json());
    assert.ok(sync.updated_at, 'phải upsert được remote');

    global.window = {};
    global.API_CONFIG = { url: base, pushDebounceMs: 5 };
    const Sync = loadSync();
    const ok = await Sync.login('syncuser1', 'Pass123456!');
    assert.strictEqual(ok.ok, true);
    const local3 = JSON.parse(global.localStorage.getItem('planner-2026-3'));
    assert.strictEqual(local3.monthlyGoals[0].done, true, 'remote mới hơn phải ghi đè local cũ');
    console.log('TEST 3b OK — login đúng → pull remote mới hơn');
  }

  // ---- TEST 4: push sau khi đổi dữ liệu → server có giá trị mới (debounce) ----
  {
    global.localStorage = mockLocalStorage({ 'planner-2026-4': '{"monthlyGoals":[]}' });
    global.window = {};
    global.API_CONFIG = { url: base, pushDebounceMs: 5 };
    const Sync = loadSync();
    await Sync.login('syncuser1', 'Pass123456!');
    global.localStorage.setItem('planner-2026-4', '{"monthlyGoals":[{"id":"g9","done":true}]}');
    Sync.push('planner-2026-4');
    await sleep(60);
    const token = global.localStorage.getItem('planner-token');
    const rows = await fetch(base + '/api/sync', { headers: { Authorization: 'Bearer ' + token } }).then((x) => x.json());
    const row = rows.find((r) => r.key === 'planner-2026-4');
    assert.ok(row && row.data.monthlyGoals[0].done === true, 'push phải cập nhật dữ liệu mới lên server');
    console.log('TEST 4 OK — push đẩy giá trị mới lên server');
  }

  // ---- TEST 5: clearAll xoá toàn bộ remote của user ----
  {
    global.localStorage = mockLocalStorage({ 'planner-2026-5': '{}' });
    global.window = {};
    global.API_CONFIG = { url: base, pushDebounceMs: 5 };
    const Sync = loadSync();
    await Sync.login('syncuser1', 'Pass123456!');
    await Sync.clearAll();
    const token = global.localStorage.getItem('planner-token');
    const rows = await fetch(base + '/api/sync', { headers: { Authorization: 'Bearer ' + token } }).then((x) => x.json());
    assert.strictEqual(rows.length, 0, 'clearAll phải xoá hết row remote');
    console.log('TEST 5 OK — clearAll');
  }

  // ---- TEST 6: signup trùng username → username-taken; invalid → 400 ----
  {
    global.localStorage = mockLocalStorage({});
    global.window = {};
    global.API_CONFIG = { url: base, pushDebounceMs: 5 };
    const Sync = loadSync();
    const dup = await Sync.signup('syncuser1', 'Pass123456!');
    assert.strictEqual(dup.ok, false);
    assert.strictEqual(dup.error, 'username-taken');
    const invalid = await Sync.signup('x!', 'Pass123456!');
    assert.strictEqual(invalid.ok, false);
    console.log('TEST 6 OK — trùng username + username không hợp lệ');
  }

  // ---- TEST 7: Google OAuth callback (consumeRedirectToken) → xoá local cũ, tài khoản mới trống ----
  {
    // Tạo user mới (mô phỏng "tài khoản Google mới vừa tạo") để lấy token thật
    const signup = await fetch(base + '/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'googleuser7', password: 'Pass123456!' })
    }).then((x) => x.json());
    assert.ok(signup.token, 'phải tạo được user cho luồng Google');

    // Máy đang có dữ liệu + token của tài khoản CŨ, quay về sau callback Google với token mới
    global.localStorage = mockLocalStorage({
      'planner-token': 'token-cua-tai-khoan-cu',
      'planner-2026-8': '{"monthlyGoals":[{"id":"g0","text":"mục tiêu cũ","kind":"priority","done":true}],"habits":[],"weeks":[]}',
      'planner-year-2026': '{"year":2026,"goals":[{"id":"yg0","text":"mục tiêu năm cũ"}]}',
      'planner-sync-meta': '{"planner-2026-8":{"savedAt":123,"syncedAt":123}}'
    });
    global.window = {
      location: {
        search: '?token=' + encodeURIComponent(signup.token),
        origin: 'http://localhost',
        pathname: '/app.html'
      },
      history: { replaceState: () => {} }
    };
    global.API_CONFIG = { url: base, pushDebounceMs: 5 };
    const Sync = loadSync();
    const consumed = Sync.consumeRedirectToken();
    assert.strictEqual(consumed, true, 'phải đọc được token từ URL');
    // Dữ liệu local của tài khoản cũ phải bị xoá (tài khoản mới = dữ liệu mới)
    assert.strictEqual(global.localStorage.getItem('planner-2026-8'), null, 'local tháng cũ phải bị xoá');
    assert.strictEqual(global.localStorage.getItem('planner-year-2026'), null, 'local năm cũ phải bị xoá');
    await Sync.init();
    assert.strictEqual(Sync.getStatus(), 'ready');
    await sleep(60); // chờ debounce — nếu migrateLocal đẩy nhầm dữ liệu cũ sẽ hiện ra đây
    const rows = await fetch(base + '/api/sync', { headers: { Authorization: 'Bearer ' + signup.token } }).then((x) => x.json());
    assert.strictEqual(rows.length, 0, 'tài khoản Google mới KHÔNG được nhận dữ liệu của tài khoản cũ');
    console.log('TEST 7 OK — Google OAuth: consumeRedirectToken xoá local cũ, tài khoản mới trống');
  }

  server.close();
  console.log('\n✅ Tất cả 7 test sync đều PASS');
}

main().catch((e) => { console.error('❌ TEST FAIL:', e); process.exit(1); });
