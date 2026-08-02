/* ============================================================
   TaskFlow-Todoist — Backend Sync Engine (js/sync.js)
   ------------------------------------------------------------
   Offline-first: localStorage VẪN là nguồn dữ liệu chính để app
   chạy bình thường (đọc nhanh, dùng offline). Backend (Render)
   là bản sao đám mây để đồng bộ đa thiết bị.

   Nếu chưa cấu hình (API_CONFIG.url trống), toàn bộ module trở
   thành no-op — app hoạt động y hệt như cũ.

   Conflict: last-write-wins theo updated_at của server.
   ============================================================ */
(function () {
  'use strict';

  var META_KEY = 'planner-sync-meta';
  var TOKEN_KEY = 'planner-token';
  var DATA_KEY_RE = /^planner-/;

  var cfg = (typeof API_CONFIG !== 'undefined' && API_CONFIG) || {};
  var base = String(cfg.url || '').replace(/\/+$/, '');
  var PUSH_DEBOUNCE_MS = (typeof cfg.pushDebounceMs === 'number' ? cfg.pushDebounceMs : 1200);

  var userId = null;
  var authed = false;
  var started = false;
  var currentStatus = 'off';
  var meta = {};        // key -> { savedAt, syncedAt }
  var pending = {};     // key -> timer id
  var statusListeners = [];
  var changeListeners = [];

  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ẩn */ }
  }
  function getLocal(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function setLocal(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* ẩn */ }
  }
  function isDataKey(k) {
    return k !== META_KEY && k !== TOKEN_KEY && DATA_KEY_RE.test(k);
  }
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(t) {
    try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* ẩn */ }
  }
  function emitStatus(s) {
    statusListeners.forEach(function (fn) { try { fn(s); } catch (e) { /* ẩn */ } });
  }
  function emitChange(keys) {
    changeListeners.forEach(function (fn) { try { fn(keys); } catch (e) { /* ẩn */ } });
  }
  function setStatus(s) { currentStatus = s; emitStatus(s); }

  // ---- API helper: fetch có Bearer token ----
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (opts.headers) Object.assign(headers, opts.headers);
    var init = { method: opts.method || 'GET', headers: headers };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetch(base + path, init).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function authedHeaders() {
    var token = getToken();
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  }

  // ---- Session: token trong localStorage → xác thực với backend ----
  async function ensureSession() {
    var token = getToken();
    if (!token) return false;
    var res;
    try {
      res = await api('/api/auth/me');
    } catch (e) { return false; }
    if (!res.ok || !res.data || !res.data.id) {
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ẩn */ }
      return false;
    }
    userId = res.data.id;
    authed = true;
    return true;
  }

  // ---- Pull: đám mây -> localStorage (nếu remote mới hơn) ----
  async function pullAll() {
    if (!authed) return [];
    var res = await api('/api/sync', { headers: authedHeaders() });
    if (!res.ok) throw new Error('pull-failed');
    var rows = res.data || [];
    var remoteKeys = [];
    var changed = [];
    rows.forEach(function (row) {
      remoteKeys.push(row.key);
      var m = meta[row.key] || { savedAt: 0, syncedAt: 0 };
      var remoteAt = Date.parse(row.updated_at) || 0;
      // Chỉ ghi đè local nếu remote mới hơn CẢ lần đồng bộ trước LẪN lần sửa local gần nhất
      // (tránh mất chỉnh sửa local mới hơn khi hai thiết bị đồng thời thay đổi)
      if (remoteAt > m.syncedAt && remoteAt >= (m.savedAt || 0)) {
        var cur = getLocal(row.key);
        var remoteData = JSON.stringify(row.data);
        if (cur !== remoteData) {
          setLocal(row.key, remoteData);
          changed.push(row.key);
        }
        meta[row.key] = { savedAt: m.savedAt, syncedAt: remoteAt };
      } else if (remoteAt > m.syncedAt) {
        // Remote mới hơn bản đã đồng bộ nhưng local đang có chỉnh sửa mới hơn → giữ local,
        // migrateLocal sẽ đẩy bản local mới hơn lên server (last-write-wins theo thời điểm sửa)
        meta[row.key] = { savedAt: m.savedAt, syncedAt: remoteAt };
      }
    });
    writeMeta();
    if (changed.length) emitChange(changed);
    return remoteKeys;
  }

  // ---- Push: localStorage -> đám mây (debounce theo key) ----
  function push(key) {
    if (!authed || !isDataKey(key)) return;
    var m = meta[key] || { savedAt: 0, syncedAt: 0 };
    m.savedAt = Date.now();
    meta[key] = m;
    writeMeta();
    if (pending[key]) clearTimeout(pending[key]);
    pending[key] = setTimeout(function () { flushKey(key); }, PUSH_DEBOUNCE_MS);
  }

  async function flushKey(key) {
    delete pending[key];
    if (!authed) return;
    var raw = getLocal(key);
    if (raw == null) return; // key đã bị xoá
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    var res = await api('/api/sync', { method: 'POST', body: { key: key, data: data } });
    if (!res.ok) { setStatus('error'); return; }
    var remoteAt = Date.parse(res.data && res.data.updated_at) || Date.now();
    var m = meta[key] || { savedAt: 0, syncedAt: 0 };
    m.syncedAt = remoteAt;
    meta[key] = m;
    writeMeta();
  }

  // ---- Migration: nâng cấp dữ liệu localStorage cũ lên đám mây ----
  function migrateLocal(remoteKeys) {
    if (!authed) return;
    var seen = {};
    remoteKeys.forEach(function (k) { seen[k] = true; });
    var toPush = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!isDataKey(k)) continue;
      var m = meta[k] || { savedAt: 0, syncedAt: 0 };
      if (!seen[k] || m.savedAt > m.syncedAt) toPush.push(k);
    }
    toPush.forEach(function (k) { push(k); });
  }

  async function clearAll() {
    // Huỷ các push đang chờ debounce — nếu không chúng sẽ đẩy lại dữ liệu ngay sau khi xoá
    Object.keys(pending).forEach(function (k) { clearTimeout(pending[k]); delete pending[k]; });
    if (!authed) return;
    try {
      await api('/api/sync/clear', { method: 'POST', body: {} });
    } catch (e) { /* ẩn */ }
    meta = {};
    writeMeta();
  }

  async function init() {
    if (started) return;
    started = true;
    meta = readMeta();
    if (!base) { setStatus('off'); return; }
    setStatus('connecting');
    try {
      var ok = await ensureSession();
      if (!ok) { setStatus('signedout'); return; }
      setStatus('syncing');
      var remoteKeys = await pullAll();
      migrateLocal(remoteKeys);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
    }
  }

  async function login(username, password) {
    if (!base) return { ok: false, error: 'no-config' };
    var res;
    try {
      res = await api('/api/auth/login', { method: 'POST', body: { username: username, password: password } });
    } catch (e) {
      return { ok: false, error: 'network' };
    }
    if (!res.ok || !res.data || !res.data.token) {
      return { ok: false, error: 'bad-credentials' };
    }
    setToken(res.data.token);
    userId = res.data.user.id;
    authed = true;
    setStatus('syncing');
    try {
      var remoteKeys = await pullAll();
      migrateLocal(remoteKeys);
      setStatus('ready');
      return { ok: true };
    } catch (e) {
      setStatus('error');
      return { ok: false, error: 'pull-failed' };
    }
  }

  async function signup(username, password) {
    if (!base) return { ok: false, error: 'no-config' };
    var res;
    try {
      res = await api('/api/auth/signup', { method: 'POST', body: { username: username, password: password } });
    } catch (e) {
      return { ok: false, error: 'network' };
    }
    if (!res.ok || !res.data || !res.data.token) {
      var msg = 'signup-failed';
      if (res.data && res.data.error === 'username-taken') msg = 'username-taken';
      return { ok: false, error: msg };
    }
    setToken(res.data.token);
    userId = res.data.user.id;
    authed = true;
    setStatus('syncing');
    try {
      var remoteKeys = await pullAll();
      migrateLocal(remoteKeys);
      setStatus('ready');
    } catch (e) { setStatus('error'); }
    return { ok: true };
  }

  async function logout() {
    authed = false;
    userId = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ẩn */ }
    setStatus('signedout');
  }

  // ---- Google OAuth: chuyển hướng sang backend → Google → quay về app.html?token=... ----
  // Bạn phải bật Google provider trong dashboard Google Cloud (OAuth client Web application)
  // và điền GOOGLE_CLIENT_ID/SECRET + APP_URL khi deploy backend trên Render.
  function loginWithGoogle() {
    if (!base) return Promise.resolve({ ok: false, error: 'no-config' });
    var url = base + '/api/auth/google';
    window.location.href = url;
    return Promise.resolve({ ok: true, redirect: true });
  }

  // Đọc token backend trả về qua URL (?token=...) sau callback Google — gọi từ app.js
  function consumeRedirectToken() {
    var m = window.location.search.match(/[?&]token=([^&]+)/);
    if (!m) return false;
    setToken(decodeURIComponent(m[1]));
    var clean = window.location.origin + window.location.pathname;
    try { window.history.replaceState({}, '', clean); } catch (e) { /* ẩn */ }
    return true;
  }

  window.Sync = {
    init: init,
    push: push,
    clearAll: clearAll,
    login: login,
    signup: signup,
    logout: logout,
    loginWithGoogle: loginWithGoogle,
    consumeRedirectToken: consumeRedirectToken,
    onStatus: function (fn) { statusListeners.push(fn); },
    onRemoteChange: function (fn) { changeListeners.push(fn); },
    getStatus: function () { return currentStatus; },
    getUserId: function () { return userId; },
  };
})();
