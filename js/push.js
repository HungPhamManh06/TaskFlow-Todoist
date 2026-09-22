// TaskFlow — Web Push client (v3.2 P2.1). Bật/tắt nhắc việc khi app ĐÃ ĐÓNG.
// Trước đây nhắc khi app đóng chỉ dựa vào Periodic Background Sync (Chromium-only,
// hay bị hạn chế); module này đăng ký PushManager với server (VAPID) để hoạt động
// trên mọi trình duyệt hỗ trợ Web Push.
//
// Ranh giới: server chỉ GỬI thông báo; module này chỉ đăng ký/huỷ đăng ký thiết bị
// hiện tại, không đọc dữ liệu người dùng. Chưa đăng nhập hoặc server chưa cấu hình
// VAPID → hàng UI tự ẩn, app vẫn nhắc khi đang mở như cũ.
//
// Phụ thuộc app-level (navigator/Notification/API_CONFIG/localStorage/fetch/t) resolve
// qua global scope tại thời điểm GỌI (pattern remind-ui/inbox/mood).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowPush = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const TOKEN_KEY = 'planner-token';
  const DEFAULT_HOUR = 20;

  function cfg() { return (typeof API_CONFIG !== 'undefined' && API_CONFIG) || {}; }
  function base() { return String(cfg().url || '').replace(/\/+$/, ''); }
  function token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function lang() {
    try { return (typeof TaskFlowI18N !== 'undefined' && TaskFlowI18N.getLang()) === 'en' ? 'en' : 'vi'; }
    catch (e) { return 'vi'; }
  }
  function tr(key, fallback) {
    try { return typeof t === 'function' ? t(key) : fallback; } catch (e) { return fallback; }
  }

  function supported() {
    return typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      typeof window !== 'undefined' &&
      'PushManager' in window &&
      typeof Notification !== 'undefined';
  }

  function api(path, opts) {
    opts = opts || {};
    const headers = { 'Content-Type': 'application/json' };
    const tk = token();
    if (tk) headers.Authorization = 'Bearer ' + tk;
    const init = { method: opts.method || 'GET', headers: headers };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetch(base() + path, init).then(
      (res) => res.json().catch(() => null).then((data) => ({ ok: res.ok, status: res.status, data: data })),
      () => ({ ok: false, status: 0, data: null })
    );
  }

  /** VAPID public key (base64url) → Uint8Array cho applicationServerKey. */
  function urlBase64ToUint8Array(base64) {
    const padded = String(base64 || '').replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function status() {
    if (!base() || !token()) return { configured: false, subscribed: false, reason: 'not-signed-in' };
    const res = await api('/api/push/status');
    if (!res.ok || !res.data) return { configured: false, subscribed: false, reason: 'unavailable' };
    return {
      configured: !!res.data.configured,
      publicKey: res.data.publicKey || null,
      subscriptions: res.data.subscriptions || 0,
    };
  }

  /** Subscription của THIẾT BỊ NÀY (server chỉ biết tổng số, không biết thiết bị nào). */
  async function currentSubscription() {
    if (!supported()) return null;
    try {
      const reg = await navigator.serviceWorker.ready;
      return (await reg.pushManager.getSubscription()) || null;
    } catch (e) { return null; }
  }

  async function isEnabledOnThisDevice() {
    if (!supported()) return false;
    if (typeof Notification === 'undefined' || typeof Notification.permission === 'undefined') return false;
    if (Notification.permission !== 'granted') return false;
    return !!(await currentSubscription());
  }

  /**
   * Bật nhắc khi app đã đóng. `hour` mặc định lấy giờ nhắc hằng ngày hiện có
   * (remindTime) để người dùng chỉ phải chọn giờ ở MỘT chỗ.
   */
  async function enable(hour) {
    if (!supported()) return { ok: false, error: 'push-unsupported' };
    if (!token()) return { ok: false, error: 'not-signed-in' };
    const st = await status();
    if (!st.configured || !st.publicKey) return { ok: false, error: 'push-not-configured' };

    let permission = 'granted';
    if (Notification.permission !== 'granted') {
      permission = await Notification.requestPermission().catch(() => 'denied');
    }
    if (permission !== 'granted') return { ok: false, error: 'permission-denied' };

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(st.publicKey),
        });
      }
      const json = typeof sub.toJSON === 'function' ? sub.toJSON() : {};
      const reminderHour = Number.isInteger(hour) ? hour : (typeof hour === 'string' && /^\d{1,2}:\d{2}$/.test(hour) ? Number(hour.split(':')[0]) : DEFAULT_HOUR);
      const res = await api('/api/push/subscribe', {
        method: 'POST',
        body: {
          endpoint: sub.endpoint,
          keys: (json && json.keys) || {},
          reminderHour: reminderHour,
          tzOffsetMinutes: -new Date().getTimezoneOffset(),
          lang: lang(),
        },
      });
      if (!res.ok) return { ok: false, error: (res.data && res.data.error) || 'push-subscribe-failed' };
      return { ok: true, reminderHour: reminderHour };
    } catch (e) {
      return { ok: false, error: 'push-subscribe-failed' };
    }
  }

  /** Tắt: huỷ ở trình duyệt TRƯỚC, rồi báo server (endpoint thay đổi mỗi lần subscribe lại). */
  async function disable() {
    const sub = await currentSubscription();
    const endpoint = sub ? sub.endpoint : null;
    if (sub) { try { await sub.unsubscribe(); } catch (e) { /* ẩn */ } }
    if (endpoint) await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: endpoint } });
    return { ok: true };
  }

  async function sendTest() {
    const res = await api('/api/push/test', { method: 'POST' });
    if (!res.ok) return { ok: false, error: (res.data && res.data.error) || 'push-test-failed' };
    return { ok: true, sent: (res.data && res.data.sent) || 0 };
  }

  /* ---------------- UI trong popup nhắc việc ---------------- */

  /** Hàng "Bật/tắt nhắc khi app đã đóng" — chỉ hiện khi server cấu hình VAPID + đã đăng nhập. */
  async function renderClosedAppRow() {
    const wrap = document.getElementById('pushClosedWrap');
    const btn = document.getElementById('pushClosedBtn');
    const note = document.getElementById('pushClosedNote');
    if (!wrap || !btn || !note) return;
    if (!supported()) { wrap.hidden = true; note.hidden = true; return; }

    const st = await status();
    if (!st.configured) { wrap.hidden = true; note.hidden = true; return; }

    const on = await isEnabledOnThisDevice();
    wrap.hidden = false;
    note.hidden = false;
    btn.textContent = on ? tr('pushClosedAppOff', 'Tắt nhắc khi app đã đóng') : tr('pushClosedAppOn', 'Bật nhắc khi app đã đóng');
    btn.dataset.pushOn = on ? '1' : '0';
    note.textContent = tr('pushClosedAppNote', '');

    if (btn.dataset.pushBound === '1') return;
    btn.dataset.pushBound = '1';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const enabled = btn.dataset.pushOn === '1';
      let result;
      if (enabled) {
        result = await disable();
      } else {
        let hour = DEFAULT_HOUR;
        try {
          const input = document.getElementById('remindTime');
          if (input && input.value) hour = input.value; // 'HH:MM' → enable() lấy giờ
        } catch (e) { /* dùng mặc định */ }
        result = await enable(hour);
      }
      btn.disabled = false;
      if (result.ok) {
        renderClosedAppRow();
        return;
      }
      if (result.error === 'permission-denied') note.textContent = tr('pushClosedAppBlocked', '');
      else if (result.error === 'not-signed-in' || result.error === 'push-not-configured') renderClosedAppRow();
      else note.textContent = tr('pushClosedAppFailed', '');
    });
  }

  return {
    supported,
    status,
    currentSubscription,
    isEnabledOnThisDevice,
    enable,
    disable,
    sendTest,
    renderClosedAppRow,
    urlBase64ToUint8Array,
  };
});
