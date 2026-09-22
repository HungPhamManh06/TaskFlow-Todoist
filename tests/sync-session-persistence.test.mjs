/**
 * Session persistence (giữ đăng nhập giữa các lần mở web).
 *
 * Lỗi thật đã xảy ra: backend Render free tier ngủ đông sau ~15 phút, request đầu
 * tiên trả 502/503 (hoặc treo). `ensureSession()` coi MỌI phản hồi không-phải-200 là
 * "hết phiên" → xoá `planner-token` → lần sau mở web luôn thấy "chưa đăng nhập", dù
 * người dùng chưa hề bấm đăng xuất. Tệ hơn: đăng nhập lại thì `login()` xoá sạch dữ
 * liệu local — chính là việc đã làm trong lúc tưởng mình vẫn đang đăng nhập.
 *
 * Bộ test này khoá lại cả hai nửa: (1) lỗi tạm thời KHÔNG được xoá token/đăng xuất,
 * (2) đăng nhập lại CÙNG tài khoản không được làm mất dữ liệu local.
 *
 * js/sync.js là script trình duyệt (IIFE, dùng `localStorage`/`fetch`/`window` toàn
 * cục) nên chạy trong vm sandbox + timer giả để tất định, không phụ thuộc mạng.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../js/sync.js', import.meta.url), 'utf8');

/** Timer giả: mọi setTimeout xếp hàng, chỉ chạy khi test gọi flush(). */
function makeClock() {
  let seq = 0;
  const jobs = [];
  return {
    jobs,
    setTimeout: (fn, ms) => { const id = ++seq; jobs.push({ id, ms: ms || 0, fn }); return id; },
    clearTimeout: (id) => { const i = jobs.findIndex((j) => j.id === id); if (i >= 0) jobs.splice(i, 1); },
    flush: () => jobs.splice(0, jobs.length).forEach((j) => j.fn()),
  };
}

/**
 * Chạy promise của app tới khi lắng, đồng thời "tua" timer giả (delay giữa các lần
 * thử lại phiên + backoff retry + debounce push). Có trần số vòng nên không treo.
 */
async function drive(promise, clock, rounds = 30) {
  let settled = false;
  promise.then(() => { settled = true; }, () => { settled = true; });
  for (let i = 0; i < rounds; i++) {
    clock.flush();
    await Promise.resolve();
    await Promise.resolve();
    if (settled && !clock.jobs.length) break;
  }
  return settled;
}

/**
 * Khởi động một "tab" với localStorage + fetch giả. `handler(call)` trả
 * {status, data} cho phản hồi, hoặc undefined để mô phỏng lỗi mạng (fetch reject).
 */
function boot({ store = {}, handler }) {
  const data = new Map(Object.entries(store));
  const clock = makeClock();
  const calls = [];
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    JSON, Math, Date, Object, Array, String, Number, RegExp, Error, Promise, Map, Set,
    AbortController,
    decodeURIComponent, encodeURIComponent,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    localStorage: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: (k) => data.delete(k),
      key: (i) => Array.from(data.keys())[i] || null,
      get length() { return data.size; },
    },
    API_CONFIG: { url: 'https://api.test', pushDebounceMs: 1 },
    fetch: async (url, init) => {
      const call = {
        path: String(url).replace(/^https?:\/\/[^/]+/, ''),
        method: (init && init.method) || 'GET',
        body: init && init.body ? JSON.parse(init.body) : null,
      };
      calls.push(call);
      const res = handler(call);
      if (!res) throw new TypeError('failed to fetch');
      return { ok: res.status >= 200 && res.status < 300, status: res.status, json: async () => res.data };
    },
  };
  sandbox.window = {
    location: { search: '', origin: 'http://localhost', pathname: '/app.html' },
    history: { replaceState() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { sync: sandbox.window.Sync, data, calls, clock };
}

// Backend ấm: /api/auth/me hợp lệ, cloud rỗng, push nhận bình thường.
const warm = (id = 1) => (call) => {
  if (call.path === '/api/auth/me') return { status: 200, data: { id, username: 'u' + id } };
  if (call.path === '/api/sync' && call.method === 'POST') return { status: 200, data: { updated_at: new Date().toISOString() } };
  if (call.path === '/api/sync') return { status: 200, data: [] };
  return { status: 200, data: { ok: true } };
};

const UNSYNCED = '{"weeklyGoals":["việc làm lúc chưa đồng bộ được"],"habits":[],"weeks":[]}';

test('502/503 khi server ngủ đông: GIỮ token và KHÔNG coi là đã đăng xuất', async () => {
  const { sync, data, clock } = boot({
    store: { 'planner-token': 'tok-1', 'planner-2026-9': UNSYNCED },
    handler: () => ({ status: 503, data: { error: 'service unavailable' } }),
  });
  await drive(sync.init(), clock);
  assert.equal(data.get('planner-token'), 'tok-1', 'token phải được giữ nguyên');
  assert.equal(sync.getStatus(), 'connecting', 'vẫn đang đăng nhập, chỉ là chưa kết nối được');
  assert.equal(sync.getUserId(), null, 'chưa xác thực được thì chưa có phiên');
});

test('lỗi mạng (fetch reject) cũng không làm mất phiên', async () => {
  const { sync, data, clock } = boot({
    store: { 'planner-token': 'tok-1' },
    handler: () => undefined, // mạng chết
  });
  await drive(sync.init(), clock);
  assert.equal(data.get('planner-token'), 'tok-1', 'token phải được giữ nguyên');
  assert.equal(sync.getStatus(), 'connecting');
});

test('server tỉnh lại: phiên tự phục hồi và việc làm offline được đẩy lên cloud', async () => {
  let awake = false;
  const { sync, data, calls, clock } = boot({
    store: { 'planner-token': 'tok-1', 'planner-2026-9': UNSYNCED },
    handler: (call) => (awake ? warm(1)(call) : { status: 503, data: { error: 'cold start' } }),
  });
  await drive(sync.init(), clock);
  assert.equal(sync.getStatus(), 'connecting');

  awake = true;
  await drive(sync.retryNow(), clock);
  assert.equal(sync.getStatus(), 'ready', 'server trở lại thì phiên phải thành ready');
  assert.equal(sync.getUserId(), 1);
  assert.equal(data.get('planner-account'), '1', 'ghi dấu tài khoản sở hữu dữ liệu local');
  assert.equal(data.get('planner-token'), 'tok-1', 'token cũ vẫn dùng lại được');
  const push = calls.find((c) => c.path === '/api/sync' && c.method === 'POST');
  assert.ok(push, 'việc chưa đồng bộ phải được đẩy lên');
  assert.equal(push.body.key, 'planner-2026-9');
});

test('401 (token thật sự hết hiệu lực) thì mới xoá token + báo đã đăng xuất', async () => {
  const { sync, data, clock } = boot({
    store: { 'planner-token': 'tok-het-han' },
    handler: (call) => (call.path === '/api/auth/me' ? { status: 401, data: { error: 'invalid token' } } : { status: 200, data: [] }),
  });
  await drive(sync.init(), clock);
  assert.equal(sync.getStatus(), 'signedout');
  assert.equal(data.get('planner-token'), undefined, '401 mới được xoá token');
});

test('đăng nhập lại CÙNG tài khoản: giữ dữ liệu local và đẩy lên cloud', async () => {
  const { sync, data, calls, clock } = boot({
    store: {
      'planner-account': '1',
      'planner-token': 'token-cu-da-mat',
      'planner-2026-9': UNSYNCED,
    },
    handler: (call) => {
      if (call.path === '/api/auth/login') return { status: 200, data: { token: 'tok-moi', user: { id: 1, username: 'u1' } } };
      return warm(1)(call);
    },
  });
  const res = await drive(sync.login('u1', 'Pass123456!'), clock);
  assert.equal(res, true);
  assert.equal(sync.getStatus(), 'ready');
  assert.equal(data.get('planner-2026-9'), UNSYNCED, 'dữ liệu local phải được giữ nguyên');
  assert.equal(data.get('planner-token'), 'tok-moi');
  const push = calls.find((c) => c.path === '/api/sync' && c.method === 'POST');
  assert.ok(push, 'việc chưa đồng bộ phải được đẩy lên cloud của chính tài khoản đó');
  assert.equal(push.body.key, 'planner-2026-9');
});

test('đăng nhập tài khoản KHÁC: xoá dữ liệu local (isolation) nhưng luôn để lại snapshot', async () => {
  const { sync, data, clock } = boot({
    store: {
      'planner-account': '1',
      'planner-token': 'token-cu',
      'planner-2026-9': UNSYNCED,
    },
    handler: (call) => {
      if (call.path === '/api/auth/login') return { status: 200, data: { token: 'tok-2', user: { id: 2, username: 'u2' } } };
      return warm(2)(call);
    },
  });
  await drive(sync.login('u2', 'Pass123456!'), clock);
  assert.equal(data.get('planner-2026-9'), undefined, 'tài khoản khác → không được trộn dữ liệu');
  assert.equal(sync.getAccount(), '2');
  const backup = sync.getAccountBackup();
  assert.ok(backup, 'phải có snapshot trước khi xoá');
  assert.equal(backup.data['planner-2026-9'], UNSYNCED, 'snapshot giữ nguyên nội dung cũ');
  assert.equal(backup.accountId, '1', 'snapshot ghi rõ dữ liệu thuộc tài khoản nào');
});
