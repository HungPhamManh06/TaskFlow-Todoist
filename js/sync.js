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
  var DATA_KEY_RE = /^planner-[A-Za-z0-9._-]{1,120}$/;
  var MONTH_KEY_RE = /^planner-(\d{4})-(\d{1,2})$/;

  var cfg = (typeof API_CONFIG !== 'undefined' && API_CONFIG) || {};
  var base = String(cfg.url || '').replace(/\/+$/, '');
  var PUSH_DEBOUNCE_MS = (typeof cfg.pushDebounceMs === 'number' ? cfg.pushDebounceMs : 1200);

  var userId = null;
  var username = null;
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
    username = res.data.username || null;
    authed = true;
    return true;
  }

  // ---- Hội tụ blank-task legacy lên cloud (P2/P3) ----
  // App tự dọn task "trống thật sự" ở boot nhưng chỉ ghi localStorage (không Sync.push),
  // nên cloud giữ blank vô thời hạn. Sau mỗi lần pull remote thành công, chuẩn hoá các
  // key vừa kéo (month/inbox) bằng ĐÚNG định nghĩa isTaskTrulyEmpty/cleanupTrulyEmptyTasks
  // của data-migrations; key nào có blank bị xoá thì đẩy 1 lần qua debounce thường.
  // Idempotent: cloud đã sạch → removed = 0 → không gọi push (không loop, không ghi mỗi boot).
  function convergeBlankCleanup(keys) {
    var DM = (typeof window !== 'undefined' && window.TaskFlowDataMigrations) || null;
    if (!DM || !DM.isTaskTrulyEmpty || !keys || !keys.length) return;
    keys.forEach(function (key) {
      var raw = getLocal(key);
      if (raw == null) return;
      var removed = 0;
      var out = null;
      if (key === 'planner-inbox') {
        var arr = null;
        try { arr = JSON.parse(raw); } catch (e) { return; }
        if (!Array.isArray(arr)) return;
        out = arr.filter(function (tk) { if (DM.isTaskTrulyEmpty(tk)) { removed++; return false; } return true; });
      } else if (MONTH_KEY_RE.test(key)) {
        var st = null;
        try { st = JSON.parse(raw); } catch (e) { return; }
        if (!st || typeof st !== 'object' || Array.isArray(st)) return;
        var res = DM.cleanupTrulyEmptyTasks(st);
        if (res.removed === 0) return;
        removed = res.removed;
        out = res.state;
      } else {
        return;
      }
      if (removed > 0 && out != null) {
        setLocal(key, JSON.stringify(out));
        push(key);
      }
    });
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
    // P2: bản vừa kéo (remote mới hơn) có thể còn blank legacy → dọn + đẩy 1 lần để hội tụ
    convergeBlankCleanup(remoteKeys);
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

  // ---- Xoá toàn bộ dữ liệu local (tạo tài khoản mới / đăng nhập tài khoản khác) ----
  // Mục đích: dữ liệu của tài khoản này không được trộn vào tài khoản khác trên cùng thiết bị
  function clearLocalData() {
    // Huỷ các push đang chờ debounce — tránh đẩy nhầm dữ liệu vừa xoá lên tài khoản mới
    Object.keys(pending).forEach(function (k) { clearTimeout(pending[k]); delete pending[k]; });
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (isDataKey(k)) {
        try { localStorage.removeItem(k); } catch (e) { /* ẩn */ }
      }
    }
    // Phase 6S: Clear adaptation data on account switch (account isolation)
    try {
      if (window.TaskFlowAIAdaptation) window.TaskFlowAIAdaptation.clearAll();
      else localStorage.removeItem('taskflow-ai-adaptation-v1');
    } catch (e) { /* adaptation clear must never break sync */ }
    meta = {};
    writeMeta();
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
    username = res.data.user.username || null;
    authed = true;
    // Xoá dữ liệu local của tài khoản trước → kéo dữ liệu ĐÚNG tài khoản đang đăng nhập
    clearLocalData();
    setStatus('syncing');
    try {
      await pullAll();
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
    username = res.data.user.username || null;
    authed = true;
    // Tài khoản mới → dữ liệu mới: xoá dữ liệu local cũ, KHÔNG migrate lên tài khoản mới
    clearLocalData();
    setStatus('syncing');
    try {
      await pullAll();
      setStatus('ready');
    } catch (e) { setStatus('error'); }
    return { ok: true };
  }

  async function logout() {
    authed = false;
    userId = null;
    username = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ẩn */ }
    // Phase 6S: Clear adaptation on logout (account isolation)
    try {
      if (window.TaskFlowAIAdaptation) window.TaskFlowAIAdaptation.clearAll();
      else localStorage.removeItem('taskflow-ai-adaptation-v1');
    } catch (e) { /* adaptation clear must never break sync */ }
    setStatus('signedout');
  }

  // ---- Đổi mật khẩu (Bearer) ----
  async function changePassword(currentPassword, newPassword) {
    if (!base) return { ok: false, error: 'no-config' };
    var res;
    try {
      res = await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: currentPassword, newPassword: newPassword } });
    } catch (e) {
      return { ok: false, error: 'network' };
    }
    if (!res.ok) return { ok: false, error: res.data && res.data.error || 'server' };
    return { ok: true };
  }

  // ---- Xoá tài khoản (Bearer) — xoá luôn dữ liệu cloud của user ----
  async function deleteAccount() {
    if (!base) return { ok: false, error: 'no-config' };
    var res;
    try {
      res = await api('/api/auth/delete-account', { method: 'POST', body: {} });
    } catch (e) {
      return { ok: false, error: 'network' };
    }
    if (!res.ok) return { ok: false, error: 'server' };
    authed = false;
    userId = null;
    username = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ẩn */ }
    // Phase 6S: Clear adaptation on account deletion (account isolation)
    try {
      if (window.TaskFlowAIAdaptation) window.TaskFlowAIAdaptation.clearAll();
      else localStorage.removeItem('taskflow-ai-adaptation-v1');
    } catch (e) { /* adaptation clear must never break sync */ }
    setStatus('signedout');
    return { ok: true };
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
    // Google OAuth = đăng nhập / chuyển tài khoản: xoá dữ liệu local của tài khoản cũ
    // để KHÔNG migrate dữ liệu cũ lên tài khoản mới (giống signup/login)
    clearLocalData();
    var clean = window.DeepLink
      ? window.DeepLink.withoutParam(window.location.href, 'token')
      : window.location.origin + window.location.pathname;
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
    changePassword: changePassword,
    deleteAccount: deleteAccount,
    getUsername: function () { return username; },
    loginWithGoogle: loginWithGoogle,
    consumeRedirectToken: consumeRedirectToken,
    onStatus: function (fn) { statusListeners.push(fn); },
    onRemoteChange: function (fn) { changeListeners.push(fn); },
    getStatus: function () { return currentStatus; },
    getUserId: function () { return userId; },
  };
})();
