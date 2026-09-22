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
  // Dấu tài khoản đang sở hữu dữ liệu local + snapshot khi buộc phải xoá vì đổi
  // tài khoản. Cả hai KHÔNG phải data key (xem isDataKey) nên không bao giờ lên cloud.
  var ACCOUNT_KEY = 'planner-account';
  var BACKUP_KEY = 'planner-account-backup';
  // Server free tier ngủ đông: request đầu có thể treo lâu hoặc trả 502/503.
  var SESSION_TIMEOUT_MS = 12000;
  var SESSION_ATTEMPTS = 3;
  var SESSION_RETRY_MS = 1500;
  var RETRY_FIRST_MS = 5000;
  var RETRY_MAX_MS = 60000;

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
    return k !== META_KEY && k !== TOKEN_KEY && k !== ACCOUNT_KEY && k !== BACKUP_KEY
      && DATA_KEY_RE.test(k);
  }
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(t) {
    try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* ẩn */ }
  }
  // ---- Danh tính tài khoản sở hữu dữ liệu trong máy này ----
  // Dữ liệu localStorage thuộc tài khoản đăng nhập gần nhất. Nhớ id đó để lần đăng
  // nhập LẠI cùng tài khoản không xoá mất việc đã làm trong lúc chưa đồng bộ được.
  function getAccountId() {
    try { return localStorage.getItem(ACCOUNT_KEY) || null; } catch (e) { return null; }
  }
  function setAccountId(id) {
    try { localStorage.setItem(ACCOUNT_KEY, String(id)); } catch (e) { /* ẩn */ }
  }
  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }
  // Snapshot trước khi xoá vì đổi tài khoản — "đăng nhập nhầm tài khoản" không bao giờ
  // là mất trắng. Đọc lại bằng Sync.getAccountBackup(); không sync (xem isDataKey).
  function backupLocalData(reason, ownerId) {
    var snapshot = {};
    var count = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!isDataKey(k)) continue;
        snapshot[k] = localStorage.getItem(k);
        count++;
      }
    } catch (e) { return null; }
    if (!count) return null;
    var payload = {
      at: new Date().toISOString(),
      reason: reason || 'account-switch',
      accountId: ownerId !== undefined ? ownerId : getAccountId(),
      data: snapshot,
    };
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(payload)); } catch (e) { return null; }
    return payload;
  }
  // fetch có hạn chờ (AbortController) — server ngủ đông không được treo đồng bộ.
  function timedInit(init, timeoutMs) {
    if (!timeoutMs || typeof AbortController !== 'function') return { init: init, done: function () {} };
    var ctrl = new AbortController();
    init.signal = ctrl.signal;
    var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) { /* ẩn */ } }, timeoutMs);
    return { init: init, done: function () { clearTimeout(timer); } };
  }
  // Tài khoản vừa xác thực có phải chủ của dữ liệu local? Khác → xoá (isolation tài
  // khoản) nhưng luôn để lại snapshot. Cùng tài khoản → GIỮ NGUYÊN dữ liệu.
  function adoptAccount(id) {
    var prev = getAccountId();
    var switched = prev !== String(id);
    // Snapshot phải ghi chủ CŨ (dữ liệu là của tài khoản đó) → backup trước khi đổi dấu.
    if (switched) clearLocalData('account-switch', prev);
    setAccountId(id);
    return switched;
  }

  // Lỗi tạm thời (server ngủ đông / mạng chập chờn) KHÔNG phải lỗi đăng nhập → thử lại
  // theo backoff thay vì đẩy người dùng về màn hình login.
  var retryTimer = null;
  var retryDelay = 0;
  var oauthSwitchPending = false;

  function scheduleRetry() {
    if (retryTimer || !started) return;
    retryDelay = retryDelay ? Math.min(retryDelay * 2, RETRY_MAX_MS) : RETRY_FIRST_MS;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { scheduleRetry(); return; }
      connect();
    }, retryDelay);
  }
  function cancelRetry() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    retryDelay = 0;
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
    var guarded = timedInit(init, opts.timeoutMs);
    return fetch(base + path, guarded.init).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        guarded.done();
        return { ok: res.ok, status: res.status, data: data };
      });
    }, function (err) {
      guarded.done();
      throw err;
    });
  }

  function authedHeaders() {
    var token = getToken();
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  }

  // ---- Session: token trong localStorage → xác thực với backend ----
  // Kết quả: 'ok' (token hợp lệ) | 'invalid' (server TỪ CHỐI token) |
  //          'transient' (chưa kết luận được: server ngủ đông/mạng lỗi) | 'none' (không có token).
  // CHỈ 'invalid' mới được xoá token. Trước đây mọi lỗi (502/503 khi Render wake-up,
  // mạng chập chờn) đều bị coi là hết phiên → token bị xoá → mỗi lần vào web đều thấy
  // "chưa đăng nhập" dù chưa hề bấm đăng xuất.
  async function ensureSession() {
    var token = getToken();
    if (!token) return 'none';
    for (var attempt = 0; attempt < SESSION_ATTEMPTS; attempt++) {
      var res = null;
      try {
        res = await api('/api/auth/me', { timeoutMs: SESSION_TIMEOUT_MS });
      } catch (e) { res = null; }
      if (res && res.ok && res.data && res.data.id) {
        userId = res.data.id;
        username = res.data.username || null;
        authed = true;
        // KHÔNG ghi dấu tài khoản ở đây: connect() quyết định (cần id trước khi so
        // sánh với chủ sở hữu dữ liệu local, xem oauthSwitchPending).
        return 'ok';
      }
      if (res && (res.status === 401 || res.status === 403)) {
        try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ẩn */ }
        return 'invalid';
      }
      if (attempt < SESSION_ATTEMPTS - 1) await delay(SESSION_RETRY_MS * (attempt + 1));
    }
    return 'transient';
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

  // Một vòng kết nối: xác thực phiên rồi hội tụ dữ liệu hai chiều.
  // Trả về true khi đã KẾT LUẬN được trạng thái phiên (đang đăng nhập hoặc đã đăng xuất).
  async function connect() {
    try {
      var session = await ensureSession();
      if (session === 'none' || session === 'invalid') {
        setStatus('signedout');
        return true;
      }
      if (session === 'transient') {
        // Giữ token + giữ trạng thái đang đăng nhập, hẹn thử lại (backoff).
        setStatus('connecting');
        scheduleRetry();
        return false;
      }
      // Google OAuth vừa trả token về: giờ mới biết id → cùng tài khoản thì giữ dữ liệu.
      if (oauthSwitchPending) {
        oauthSwitchPending = false;
        adoptAccount(userId);
      } else if (!getAccountId()) {
        // Người dùng đã đăng nhập từ trước khi có dấu tài khoản (nâng cấp phiên bản):
        // nhận luôn dữ liệu local làm của tài khoản này — KHÔNG xoá gì.
        setAccountId(userId);
      }
      setStatus('syncing');
      var remoteKeys = await pullAll();
      migrateLocal(remoteKeys);
      setStatus('ready');
      cancelRetry();
      return true;
    } catch (e) {
      setStatus('error');
      scheduleRetry();
      return false;
    }
  }

  async function init() {
    if (started) return;
    started = true;
    meta = readMeta();
    if (!base) { setStatus('off'); return; }
    setStatus('connecting');
    await connect();
  }

  // ---- Xoá toàn bộ dữ liệu local (tạo tài khoản mới / đăng nhập tài khoản khác) ----
  // Mục đích: dữ liệu của tài khoản này không được trộn vào tài khoản khác trên cùng thiết bị
  function clearLocalData(reason, ownerId) {
    // Luôn để lại snapshot trước khi xoá (đổi tài khoản / đăng nhập nhầm).
    backupLocalData(reason || 'account-switch', ownerId);
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
    // Cùng tài khoản như lần trước (token cũ bị mất/hết hạn) → GIỮ dữ liệu local: rất có
    // thể là việc đã làm trong lúc tưởng mình vẫn đăng nhập. Chỉ đổi tài khoản thật sự
    // mới xoá (isolation), và luôn có snapshot trước khi xoá.
    var sameAccount = getAccountId() === String(res.data.user.id);
    adoptAccount(res.data.user.id);
    setStatus('syncing');
    try {
      var remoteKeys = await pullAll();
      // Việc làm trong lúc chưa xác thực được (offline) chưa từng lên cloud → đẩy lên ngay.
      if (sameAccount) migrateLocal(remoteKeys);
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
    // Tài khoản mới → dữ liệu mới: xoá dữ liệu local cũ (có snapshot), KHÔNG migrate lên
    // tài khoản mới. adoptAccount ghi luôn dấu chủ sở hữu dữ liệu local.
    adoptAccount(userId);
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
    // Google OAuth = đăng nhập, CÓ THỂ là chuyển tài khoản. Ở đây chỉ có token, chưa biết
    // id tài khoản → không xoá dữ liệu local ngay; connect() quyết định sau khi
    // /api/auth/me trả về id: cùng tài khoản thì giữ, khác tài khoản thì xoá (có snapshot).
    oauthSwitchPending = true;
    var clean = window.DeepLink
      ? window.DeepLink.withoutParam(window.location.href, 'token')
      : window.location.origin + window.location.pathname;
    try { window.history.replaceState({}, '', clean); } catch (e) { /* ẩn */ }
    return true;
  }

  // Mạng trở lại → bỏ backoff, thử lại ngay thay vì chờ hết chu kỳ.
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', function () {
      if (started && !authed) { cancelRetry(); connect(); }
    });
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
    // Chủ sở hữu dữ liệu local + snapshot của lần đổi tài khoản gần nhất.
    getAccount: function () { return getAccountId(); },
    getAccountBackup: function () {
      try { return JSON.parse(localStorage.getItem(BACKUP_KEY)) || null; } catch (e) { return null; }
    },
    // UI có thể gọi để thử kết nối lại ngay (không chờ backoff).
    retryNow: function () { cancelRetry(); return connect(); },
  };
})();
