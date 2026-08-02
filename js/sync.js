/* ============================================================
   TaskFlow-Todoist — Supabase Sync Engine (js/sync.js)
   ------------------------------------------------------------
   Offline-first: localStorage VẪN là nguồn dữ liệu chính để app
   chạy bình thường (đọc nhanh, dùng offline). Supabase là bản sao
   đám mây để đồng bộ đa thiết bị.

   Nếu chưa cấu hình (SUPABASE_CONFIG trống / SDK không tải được),
   toàn bộ module trở thành no-op — app hoạt động y hệt như cũ.

   Conflict: last-write-wins theo updated_at của server.
   ============================================================ */
(function () {
  'use strict';

  var META_KEY = 'planner-sync-meta';
  var DATA_KEY_RE = /^planner-/;

  var cfg = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG) || {};
  var PUSH_DEBOUNCE_MS = (typeof cfg.pushDebounceMs === 'number' ? cfg.pushDebounceMs : 1200);

  var sb = null;        // supabase client
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
    return k !== META_KEY && (DATA_KEY_RE.test(k) || k === 'january-planner-2026');
  }
  function emitStatus(s) {
    statusListeners.forEach(function (fn) { try { fn(s); } catch (e) { /* ẩn */ } });
  }
  function emitChange(keys) {
    changeListeners.forEach(function (fn) { try { fn(keys); } catch (e) { /* ẩn */ } });
  }
  function setStatus(s) { currentStatus = s; emitStatus(s); }

  function createClient() {
    if (!cfg.url || !cfg.anonKey) return null;
    if (typeof window === 'undefined' || !window.supabase || !window.supabase.createClient) return null;
    try {
      return window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true }
      });
    }
    catch (e) { return null; }
  }

  async function ensureSession() {
    var user = null;
    var sess = await sb.auth.getSession();
    if (!sess.error && sess.data && sess.data.session && sess.data.session.user) {
      user = sess.data.session.user;
    } else if (cfg.autoAnonymous !== false) {
      var anon = await sb.auth.signInAnonymously();
      if (!anon.error && anon.data && anon.data.session && anon.data.session.user) {
        user = anon.data.session.user;
      }
    }
    if (!user) return false;
    userId = user.id;
    authed = true;
    return true;
  }

  // ---- Pull: đám mây -> localStorage (nếu remote mới hơn) ----
  async function pullAll() {
    if (!sb || !userId) return [];
    var res = await sb.from('planner_state').select('key,data,updated_at');
    if (res.error) throw res.error;
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
    if (!authed || !sb || !isDataKey(key)) return;
    var m = meta[key] || { savedAt: 0, syncedAt: 0 };
    m.savedAt = Date.now();
    meta[key] = m;
    writeMeta();
    if (pending[key]) clearTimeout(pending[key]);
    pending[key] = setTimeout(function () { flushKey(key); }, PUSH_DEBOUNCE_MS);
  }

  async function flushKey(key) {
    delete pending[key];
    if (!authed || !sb) return;
    var raw = getLocal(key);
    if (raw == null) return; // key đã bị xoá
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    var res = await sb.from('planner_state')
      .upsert({ user_id: userId, key: key, data: data }, { onConflict: 'user_id,key' })
      .select('updated_at');
    if (res.error) { setStatus('error'); return; }
    var remoteAt = Date.parse(res.data && res.data[0] && res.data[0].updated_at) || Date.now();
    var m = meta[key] || { savedAt: 0, syncedAt: 0 };
    m.syncedAt = remoteAt;
    meta[key] = m;
    writeMeta();
  }

  // ---- Migration: nâng cấp dữ liệu localStorage cũ lên đám mây ----
  function migrateLocal(remoteKeys) {
    if (!authed || !sb) return;
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
    if (!sb || !userId) return;
    try { await sb.from('planner_state').delete().eq('user_id', userId); } catch (e) { /* ẩn */ }
    meta = {};
    writeMeta();
  }

  async function init() {
    if (started) return;
    started = true;
    meta = readMeta();
    sb = createClient();
    if (!sb) { setStatus('off'); return; }
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

  async function login(email, password) {
    if (!sb) return { ok: false, error: 'no-client' };
    var res = await sb.auth.signInWithPassword({ email: email, password: password });
    if (res.error || !res.data || !res.data.session) {
      return { ok: false, error: res.error ? res.error.message : 'no-session' };
    }
    userId = res.data.session.user.id;
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

  async function signup(email, password) {
    if (!sb) return { ok: false, error: 'no-client' };
    var res = await sb.auth.signUp({ email: email, password: password });
    if (res.error) return { ok: false, error: res.error.message };
    if (res.data && res.data.session) {
      userId = res.data.session.user.id;
      authed = true;
      setStatus('syncing');
      try {
        var remoteKeys = await pullAll();
        migrateLocal(remoteKeys);
        setStatus('ready');
      } catch (e) { setStatus('error'); }
    }
    return { ok: true };
  }

  async function logout() {
    authed = false;
    userId = null;
    if (sb) { try { await sb.auth.signOut(); } catch (e) { /* ẩn */ } }
    setStatus('signedout');
  }

  // ---- Google OAuth: chuyển hướng sang Google rồi quay về app ----
  // PKCE: supabase-js tự lưu code verifier, tự đổi code khi quay về (getSession).
  // Bạn phải bật Google provider trong Supabase Dashboard (Authentication → Providers → Google)
  // và thêm Redirect URL của trang (vd https://tensite.github.io/Todoist/) vào danh sách.
  function loginWithGoogle() {
    if (!sb) return Promise.resolve({ ok: false, error: 'no-client' });
    var redirectTo = (typeof cfg.redirectTo === 'string' && cfg.redirectTo) ? cfg.redirectTo : window.location.href;
    return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo } })
      .then(function (res) {
        if (res.error) return { ok: false, error: res.error.message };
        return { ok: true };
      })
      .catch(function (e) { return { ok: false, error: 'oauth-failed' }; });
  }

  window.Sync = {
    init: init,
    push: push,
    clearAll: clearAll,
    login: login,
    signup: signup,
    logout: logout,
    loginWithGoogle: loginWithGoogle,
    onStatus: function (fn) { statusListeners.push(fn); },
    onRemoteChange: function (fn) { changeListeners.push(fn); },
    getStatus: function () { return currentStatus; },
    isReady: function () { return authed; }
  };
})();
