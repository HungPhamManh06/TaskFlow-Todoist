'use strict';
/* Test logic đồng bộ js/sync.js bằng Node — chạy backend thật (pg-mem) + mock localStorage + mock fetch */
// Suite chạy nhiều tài khoản test — nới rate limit auth (mặc định 10 lần/15ph là
// giới hạn bảo mật prod; server chỉ đọc env này khi được set rõ ràng).
process.env.AUTH_RATE_LIMIT_MAX = String(Number(process.env.AUTH_RATE_LIMIT_MAX) || 200);
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const { app, ensureSchema } = require('./server/index');
const M = require('./js/data-migrations.js');

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
  // sync.js dùng window.TaskFlowDataMigrations cho hội tụ blank (P2) — inject vào harness
  if (global.window) global.window.TaskFlowDataMigrations = M;
  return global.window.Sync;
}

async function main() {
  await ensureSchema();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const base = `http://localhost:${port}`;
  let lifecycleToken = '';
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
    lifecycleToken = signup.token;

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

  // ---- TEST 8: hợp đồng P10 — key hợp lệ, giới hạn payload và state v2 ----
  {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + lifecycleToken };
    const invalid = await fetch(base + '/api/sync', {
      method: 'POST', headers, body: JSON.stringify({ key: 'not-planner', data: {} }),
    });
    assert.strictEqual(invalid.status, 400, 'key ngoài planner-* phải bị từ chối');

    const missingBody = await fetch(base + '/api/sync', {
      method: 'POST', headers: { Authorization: 'Bearer ' + lifecycleToken },
    });
    assert.strictEqual(missingBody.status, 400, 'body trống phải trả lỗi key rõ ràng');

    const longKey = await fetch(base + '/api/sync', {
      method: 'POST', headers, body: JSON.stringify({ key: 'planner-' + 'x'.repeat(121), data: {} }),
    });
    assert.strictEqual(longKey.status, 400, 'key vượt giới hạn phải bị từ chối');

    const oversized = await fetch(base + '/api/sync', {
      method: 'POST', headers,
      body: JSON.stringify({ key: 'planner-p10-large', data: { text: 'x'.repeat(512 * 1024) } }),
    });
    assert.strictEqual(oversized.status, 413, 'payload JSON vượt giới hạn phải trả 413');

    const monthV2 = { schemaVersion: 2, monthlyGoals: [], habits: [], weeks: [], futureField: true };
    const valid = await fetch(base + '/api/sync', {
      method: 'POST', headers,
      body: JSON.stringify({ key: 'planner-2026-10', data: monthV2 }),
    });
    assert.strictEqual(valid.status, 200, 'state v2 hợp lệ phải được chấp nhận');
    const rows = await fetch(base + '/api/sync', { headers: { Authorization: 'Bearer ' + lifecycleToken } }).then((x) => x.json());
    const row = rows.find((x) => x.key === 'planner-2026-10');
    assert.deepStrictEqual(row.data, monthV2, 'push/pull phải giữ nguyên state v2 và trường tương lai');
    console.log('TEST 8 OK — validation key/payload + push/pull state v2');
  }

  // ---- TEST 9: hội tụ cloud — blank-task cleanup (month) ----
  // Cloud có Task A + Task B + 2 blank legacy + blank có metadata (phải GIỮ).
  // Client A đăng nhập → pull → boot cleanup → cloud phải được dọn;
  // Client B đăng nhập từ local sạch → nhận state đã dọn, không đẩy lại (no loop).
  {
    const seed = await fetch(base + '/api/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'blankuser9', password: 'Pass123456!' })
    }).then((x) => x.json());
    assert.ok(seed.token, 'phải tạo được user cho test hội tụ blank (month)');

    const monthKey = 'planner-2026-11';
    const monthWithBlanks = {
      schemaVersion: 2, monthlyGoals: [], habits: [],
      weeks: [{ n: 1, goals: [], days: [{
        tasks: [
          { uid: 'ta', text: 'Task A', tags: [], done: false },
          { uid: 'tb', text: 'Task B', tags: [], done: false },
          { uid: 'b1', text: '', tags: [] },
          { uid: 'b2', text: '', tags: [] },
          { uid: 'bm', text: '', tags: ['keep-me'], done: false },        // blank text + metadata → GIỮ
          { uid: 'bl', text: '', linkedMetricIds: ['m1'] },              // blank text + metric → GIỮ
        ],
        date: '1/11/26', yy: 26, sticky: null, note: ''
      }] }]
    };
    const put = await fetch(base + '/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + seed.token },
      body: JSON.stringify({ key: monthKey, data: monthWithBlanks })
    }).then((x) => x.json());
    assert.ok(put.updated_at, 'phải seed được month có blank lên cloud');

    // Client A: đăng nhập → clearLocalData + pullAll. Pull kéo cloud (có blank), rồi
    // convergeBlankCleanup dọn blank ngay trong pullAll và đẩy 1 lần qua debounce.
    global.localStorage = mockLocalStorage({});
    global.window = {};
    global.API_CONFIG = { url: base, pushDebounceMs: 5 };
    const SyncA = loadSync();
    const okA = await SyncA.login('blankuser9', 'Pass123456!');
    assert.strictEqual(okA.ok, true, 'Client A đăng nhập phải thành công');
    // local ngay sau login đã sạch (converge trong pullAll), không còn blank
    const localA = JSON.parse(global.localStorage.getItem(monthKey));
    const tasksLocalA = localA.weeks[0].days[0].tasks;
    assert.strictEqual(tasksLocalA.length, 4, 'local Client A phải sạch blank ngay sau pull');
    assert.deepStrictEqual(tasksLocalA.map((t) => t.uid), ['ta', 'tb', 'bm', 'bl'], 'uid phải giữ nguyên thứ tự');
    // idempotent: chạy cleanup lần nữa trên local → 0 removed
    assert.strictEqual(M.cleanupTrulyEmptyTasks(localA).removed, 0, 'cleanup lần 2 phải 0 (idempotent)');
    await sleep(80); // chờ debounce push

    const tokenA = global.localStorage.getItem('planner-token');
    const rowsA = await fetch(base + '/api/sync', { headers: { Authorization: 'Bearer ' + tokenA } }).then((x) => x.json());
    const rowA = rowsA.find((r) => r.key === monthKey);
    assert.ok(rowA, 'month phải tồn tại trên cloud');
    const serverTasksA = rowA.data.weeks[0].days[0].tasks;
    assert.strictEqual(serverTasksA.length, 4, 'cloud phải hội tụ: chỉ còn 4 task thật (2 real + 2 blank có metadata)');
    assert.deepStrictEqual(serverTasksA.map((t) => t.uid), ['ta', 'tb', 'bm', 'bl'], 'uid phải giữ nguyên thứ tự');
    assert.strictEqual(M.cleanupTrulyEmptyTasks(rowA.data).removed, 0, 'cleanup chạy lại trên cloud phải 0 (idempotent)');
    const cloudUpdatedAtA = rowA.updated_at;

    // Client B: đăng nhập từ local sạch → pull → state đã dọn, không đẩy lại
    global.localStorage = mockLocalStorage({});
    global.window = {};
    global.API_CONFIG = { url: base, pushDebounceMs: 5 };
    const SyncB = loadSync();
    const okB = await SyncB.login('blankuser9', 'Pass123456!');
    assert.strictEqual(okB.ok, true, 'Client B đăng nhập phải thành công');
    const localB = JSON.parse(global.localStorage.getItem(monthKey));
    const tasksB = localB.weeks[0].days[0].tasks;
    assert.strictEqual(tasksB.length, 4, 'Client B phải nhận state đã dọn (không còn blank legacy)');
    assert.deepStrictEqual(tasksB.map((t) => t.text), ['Task A', 'Task B', '', ''], 'thứ tự task thật phải giữ nguyên');
    assert.deepStrictEqual(tasksB.map((t) => t.uid), ['ta', 'tb', 'bm', 'bl'], 'uid task thật phải giữ nguyên');
    await sleep(80); // chờ debounce — Client B KHÔNG được đẩy lại gì
    const rowsB = await fetch(base + '/api/sync', { headers: { Authorization: 'Bearer ' + tokenA } }).then((x) => x.json());
    const rowB = rowsB.find((r) => r.key === monthKey);
    assert.strictEqual(rowB.updated_at, cloudUpdatedAtA, 'Client B không được đẩy lại (no push loop)');
    console.log('TEST 9 OK — blank-task cleanup hội tụ lên cloud (month)');
  }

  // ---- TEST 10: hội tụ cloud — blank-task cleanup (inbox) ----
  {
    const seed = await fetch(base + '/api/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'blankuser10', password: 'Pass123456!' })
    }).then((x) => x.json());
    assert.ok(seed.token, 'phải tạo được user cho test hội tụ blank (inbox)');

    const inboxKey = 'planner-inbox';
    const inboxWithBlank = [
      { uid: 'r1', text: 'Real inbox item', tags: [], done: false },
      { uid: 'r2', text: '', tags: [] },
      { uid: 'rm', text: '', tags: ['keep-me'], done: false }, // blank text + metadata → GIỮ
    ];
    const put = await fetch(base + '/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + seed.token },
      body: JSON.stringify({ key: inboxKey, data: inboxWithBlank })
    }).then((x) => x.json());
    assert.ok(put.updated_at, 'phải seed được inbox có blank lên cloud');

    global.localStorage = mockLocalStorage({});
    global.window = {};
    global.API_CONFIG = { url: base, pushDebounceMs: 5 };
    const SyncA = loadSync();
    const okA = await SyncA.login('blankuser10', 'Pass123456!');
    assert.strictEqual(okA.ok, true);
    // local sau login đã sạch blank (converge trong pullAll dùng isTaskTrulyEmpty)
    const arrA = JSON.parse(global.localStorage.getItem(inboxKey));
    assert.strictEqual(arrA.length, 2, 'local inbox Client A phải sạch blank ngay sau pull');
    assert.strictEqual(arrA.filter((tk) => !M.isTaskTrulyEmpty(tk)).length, 2, 'không còn item truly-empty');
    await sleep(80);

    const tokenA = global.localStorage.getItem('planner-token');
    const rowsA = await fetch(base + '/api/sync', { headers: { Authorization: 'Bearer ' + tokenA } }).then((x) => x.json());
    const rowA = rowsA.find((r) => r.key === inboxKey);
    assert.ok(rowA, 'inbox phải tồn tại trên cloud');
    assert.strictEqual(rowA.data.length, 2, 'cloud inbox phải hội tụ: chỉ còn 2 item thật');
    assert.deepStrictEqual(rowA.data.map((t) => t.uid), ['r1', 'rm'], 'uid inbox phải giữ nguyên');
    const cloudUpdatedAtA = rowA.updated_at;

    global.localStorage = mockLocalStorage({});
    global.window = {};
    global.API_CONFIG = { url: base, pushDebounceMs: 5 };
    const SyncB = loadSync();
    const okB = await SyncB.login('blankuser10', 'Pass123456!');
    assert.strictEqual(okB.ok, true);
    const localB = JSON.parse(global.localStorage.getItem(inboxKey));
    assert.strictEqual(localB.length, 2, 'Client B inbox phải nhận state đã dọn');
    assert.deepStrictEqual(localB.map((t) => t.uid), ['r1', 'rm'], 'inbox không được phục hồi blank');
    await sleep(80);
    const rowsB = await fetch(base + '/api/sync', { headers: { Authorization: 'Bearer ' + tokenA } }).then((x) => x.json());
    const rowB = rowsB.find((r) => r.key === inboxKey);
    assert.strictEqual(rowB.updated_at, cloudUpdatedAtA, 'Client B inbox không được đẩy lại (no push loop)');
    console.log('TEST 10 OK — blank-task cleanup hội tụ lên cloud (inbox)');
  }

  server.close();
  console.log('\n✅ Tất cả 10 test sync đều PASS');
}

main().catch((e) => { console.error('❌ TEST FAIL:', e); process.exit(1); });
