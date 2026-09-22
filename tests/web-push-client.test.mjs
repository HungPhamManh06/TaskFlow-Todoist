/**
 * Web Push client tests (v3.2 P2.1).
 *
 * The module is exercised in a vm sandbox with fake navigator/Notification/fetch
 * so the subscribe/unsubscribe protocol (what actually reaches the server) is
 * pinned without a browser: permission gate, request body shape, reuse of an
 * existing subscription, and the disable path.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(join(ROOT, 'js', 'push.js'), 'utf8');

// Real VAPID public key (the classic web-push sample) → 65 bytes, first byte 0x04.
const VAPID_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

// Kết quả trả về từ vm realm mang prototype của realm đó → spread sang object cục bộ
// trước khi deepStrictEqual (cùng lý do với cross-realm array trong tests/clock-fixtures).
const plain = (obj) => Object.assign({}, obj);

function makeSandbox(options = {}) {
  const calls = [];
  const state = {
    permission: options.permission || 'granted',
    permissionRequests: 0,
    subscribeCalls: 0,
    unsubscribeCalls: 0,
  };
  // Thiết bị này: `subscription` là những gì đã có sẵn, `device` là những gì
  // pushManager.subscribe() trả về khi đăng ký lần đầu.
  const device = {
    endpoint: 'https://fcm.googleapis.com/wp/device-1',
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/wp/device-1', keys: { p256dh: 'p256dh-value', auth: 'auth-value' } }),
    unsubscribe: async () => { state.unsubscribeCalls++; return true; },
  };
  const subscription = options.noSubscription ? null : device;

  const responses = options.responses || {};
  const fetchMock = async (url, init) => {
    calls.push({ url: String(url).replace(/^https?:\/\/[^/]+/, ''), method: (init && init.method) || 'GET', body: init && init.body ? JSON.parse(init.body) : null });
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    const preset = responses[path] || { status: 200, data: { ok: true } };
    return {
      ok: preset.status >= 200 && preset.status < 300,
      status: preset.status,
      json: async () => preset.data,
    };
  };

  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    fetch: fetchMock,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    API_CONFIG: { url: options.apiUrl === undefined ? 'https://todoist-m3c7.onrender.com' : options.apiUrl },
    localStorage: {
      store: options.token ? { 'planner-token': options.token } : {},
      getItem(k) { return this.store[k] === undefined ? null : this.store[k]; },
      setItem(k, v) { this.store[k] = v; },
      removeItem(k) { delete this.store[k]; },
    },
    TaskFlowI18N: { getLang: () => options.lang || 'vi' },
    t: (key) => 'T:' + key,
    Date, JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, Promise, parseInt,
  };
  if (options.supported !== false) {
    // window === sandbox (pattern của repo) → 'PushManager' in window kiểm tra đúng
    sandbox.PushManager = function PushManager() {};
    sandbox.navigator = {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => subscription,
            subscribe: async (opts) => { state.subscribeCalls++; state.subscribeOptions = opts; return device; },
          },
        }),
      },
    };
    sandbox.Notification = {
      get permission() { return state.permission; },
      // Người dùng bấm "Cho phép" ở hộp thoại đầu tiên ('default' → 'granted')
      requestPermission: async () => {
        state.permissionRequests++;
        if (state.permission === 'default') state.permission = 'granted';
        return state.permission;
      },
    };
  } else {
    sandbox.navigator = {}; // không có PushManager/Notification → unsupported
  }
  if (options.withDocument !== false) {
    sandbox.document = { getElementById: () => null };
  }
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { push: sandbox.TaskFlowPush, calls, state, sandbox };
}

describe('Web Push client: support detection & preconditions', () => {
  it('supported() false when PushManager is missing, and enable() refuses', async () => {
    const { push } = makeSandbox({ supported: false, token: 'tok' });
    assert.equal(push.supported(), false);
    assert.deepEqual(plain(await push.enable(20)), { ok: false, error: 'push-unsupported' });
  });

  it('status() reports not-signed-in without a token (no request sent)', async () => {
    const { push, calls } = makeSandbox({});
    const st = await push.status();
    assert.equal(st.configured, false);
    assert.equal(st.reason, 'not-signed-in');
    assert.equal(calls.length, 0, 'không gọi API khi chưa đăng nhập');
  });

  it('status() reports not configured when the server has no VAPID keys', async () => {
    const { push } = makeSandbox({
      token: 'tok',
      responses: { '/api/push/status': { status: 200, data: { configured: false, publicKey: null, subscriptions: 0 } } },
    });
    const st = await push.status();
    assert.equal(st.configured, false);
    assert.deepEqual(plain(await push.enable(20)), { ok: false, error: 'push-not-configured' });
  });

  it('status() short-circuits when no API URL is configured (offline-first app)', async () => {
    const { push, calls } = makeSandbox({ token: 'tok', apiUrl: '' });
    assert.equal((await push.status()).reason, 'not-signed-in');
    assert.equal(calls.length, 0);
  });
});

describe('Web Push client: enable()', () => {
  const configured = {
    '/api/push/status': { status: 200, data: { configured: true, publicKey: VAPID_KEY, subscriptions: 0 } },
  };

  it('requests permission, subscribes, and posts the device subscription with hour/tz/lang', async () => {
    const { push, calls, state } = makeSandbox({
      token: 'tok', permission: 'default', noSubscription: true,
      responses: { ...configured, '/api/push/subscribe': { status: 200, data: { ok: true } } },
    });
    const res = await push.enable(7);
    assert.deepEqual(plain(res), { ok: true, reminderHour: 7 });
    assert.equal(state.permissionRequests, 1, 'phải xin quyền khi chưa granted');
    assert.equal(state.subscribeCalls, 1, 'phải gọi pushManager.subscribe');

    const post = calls.find((c) => c.url === '/api/push/subscribe');
    assert.equal(post.method, 'POST');
    assert.equal(post.body.endpoint, 'https://fcm.googleapis.com/wp/device-1');
    assert.deepEqual(post.body.keys, { p256dh: 'p256dh-value', auth: 'auth-value' });
    assert.equal(post.body.reminderHour, 7);
    assert.equal(post.body.lang, 'vi');
    assert.equal(typeof post.body.tzOffsetMinutes, 'number');
    assert.equal(post.body.tzOffsetMinutes, -new Date().getTimezoneOffset());

    const key = state.subscribeOptions.applicationServerKey;
    assert.equal(Array.from(key).length, 65, 'applicationServerKey phải là 65 byte (P-256 uncompressed)');
    assert.equal(Array.from(key)[0], 4);
  });

  it('accepts the reminder time as "HH:MM" and defaults to 20:00 otherwise', async () => {
    const { push } = makeSandbox({
      token: 'tok', responses: { ...configured, '/api/push/subscribe': { status: 200, data: { ok: true } } },
    });
    // subscription đã tồn tại → không subscribe lại, vẫn gửi subscribe lên server
    assert.deepEqual(plain(await push.enable('07:30')), { ok: true, reminderHour: 7 });
    assert.deepEqual(plain(await push.enable('nonsense')), { ok: true, reminderHour: 20 });
    assert.deepEqual(plain(await push.enable()), { ok: true, reminderHour: 20 });
  });

  it('does not subscribe twice when the device already has a subscription', async () => {
    const { push, state } = makeSandbox({
      token: 'tok', responses: { ...configured, '/api/push/subscribe': { status: 200, data: { ok: true } } },
    });
    await push.enable(20);
    assert.equal(state.subscribeCalls, 0, 'đã có subscription → dùng lại, không gọi subscribe');
  });

  it('stops at a denied permission without touching the push service', async () => {
    const { push, calls, state } = makeSandbox({
      token: 'tok', permission: 'denied', responses: { ...configured, '/api/push/subscribe': { status: 200, data: { ok: true } } },
    });
    assert.deepEqual(plain(await push.enable(20)), { ok: false, error: 'permission-denied' });
    assert.equal(state.subscribeCalls, 0);
    assert.equal(calls.filter((c) => c.url === '/api/push/subscribe').length, 0, 'bị chặn quyền → không gửi gì lên server');
  });

  it('surfaces a server rejection instead of pretending success', async () => {
    const { push } = makeSandbox({
      token: 'tok',
      responses: { ...configured, '/api/push/subscribe': { status: 503, data: { error: 'push-not-configured' } } },
    });
    assert.deepEqual(plain(await push.enable(20)), { ok: false, error: 'push-not-configured' });
  });
});

describe('Web Push client: disable() & UI row', () => {
  it('unsubscribes locally first, then tells the server about that endpoint', async () => {
    const { push, calls, state } = makeSandbox({
      token: 'tok',
      responses: { '/api/push/unsubscribe': { status: 200, data: { ok: true, removed: 1 } } },
    });
    const res = await push.disable();
    assert.deepEqual(plain(res), { ok: true });
    assert.equal(state.unsubscribeCalls, 1, 'phải gọi unsubscribe của trình duyệt');
    const post = calls.find((c) => c.url === '/api/push/unsubscribe');
    assert.equal(post.body.endpoint, 'https://fcm.googleapis.com/wp/device-1');
  });

  it('isEnabledOnThisDevice() is true only when permission granted AND a subscription exists', async () => {
    const on = makeSandbox({ token: 'tok' });
    assert.equal(await on.push.isEnabledOnThisDevice(), true);
    const off = makeSandbox({ token: 'tok', noSubscription: true });
    assert.equal(await off.push.isEnabledOnThisDevice(), false);
    const blocked = makeSandbox({ token: 'tok', permission: 'denied' });
    assert.equal(await blocked.push.isEnabledOnThisDevice(), false);
  });

  it('renderClosedAppRow() is a no-op when the popup markup is absent', async () => {
    const { push } = makeSandbox({ token: 'tok' });
    await assert.doesNotReject(() => push.renderClosedAppRow());
  });

  it('urlBase64ToUint8Array decodes a real VAPID key (65 bytes, 0x04 prefix)', async () => {
    const { push } = makeSandbox({ token: 'tok' });
    const bytes = Array.from(push.urlBase64ToUint8Array(VAPID_KEY));
    assert.equal(bytes.length, 65);
    assert.equal(bytes[0], 4);
    // base64url (có '-'/'_') cũng phải giải mã đúng
    assert.deepEqual(Array.from(push.urlBase64ToUint8Array(VAPID_KEY.replace(/\+/g, '-').replace(/\//g, '_'))), bytes);
  });
});
