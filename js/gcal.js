/* ============================================================
   TaskFlow-Todoist — Google Calendar read-only (V1.6A)
   ------------------------------------------------------------
   Module thuần (UMD): window.TaskFlowGCal (browser) / require (Node).

   - normalizeEvents: Google items → {key,id,calendarId,summary,allDay,startMs,endMs}
     Timed events đọc từ dateTime (ISO có offset — Date.parse giữ đúng timezone),
     all-day từ date (end exclusive).
   - eventsForDate / busyForDate: giao với NGÀY LOCAL (app tính ranh giới ngày
     bằng múi giờ máy) — không cắt theo UTC.
   - Cache offline: planner-gcal-cache {version, fetchedAt, events}, TTL 15 phút,
     stale-while-revalidate; lỗi mạng → cache + không chặn app.
   - Không đụng sync global; chỉ đọc.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowGCal = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const CACHE_KEY = 'planner-gcal-cache';
  const CACHE_VERSION = 1;
  const TTL_MS = 15 * 60 * 1000;

  // V1.6B — mapping TimeBlock → Google Event (mirror offline của bảng server).
  const MAPPINGS_KEY = 'planner-gcal-mappings';
  const MAPPINGS_VERSION = 1;

  function apiBase() {
    const cfg = (typeof API_CONFIG !== 'undefined' && API_CONFIG) || {};
    return String(cfg.url || '').replace(/\/+$/, '');
  }

  function getToken() {
    try { return localStorage.getItem('planner-token'); } catch (e) { return null; }
  }

  function authHeaders() {
    const t = getToken();
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  async function gcalFetch(path, opts) {
    const base = apiBase();
    if (!base) return { ok: false, status: 0, data: { error: 'no-config' } };
    try {
      const init = { method: (opts && opts.method) || 'GET', headers: authHeaders() };
      if (opts && opts.body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(opts.body);
      }
      const res = await fetch(base + path, init);
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: 'network' } };
    }
  }

  /* ---------------- Normalize ---------------- */

  // Một item Google Calendar → event chuẩn (hoặc null nếu thiếu start/end).
  function normalizeItem(item, calendarId) {
    if (!item || !item.id || !item.start || !item.end) return null;
    const start = item.start;
    const end = item.end;
    if (start.dateTime && end.dateTime) {
      const s = Date.parse(start.dateTime);
      const e = Date.parse(end.dateTime);
      if (isNaN(s) || isNaN(e)) return null;
      return {
        key: calendarId + ':' + item.id,
        id: item.id,
        calendarId: calendarId,
        summary: String(item.summary || '(Không có tiêu đề)').slice(0, 500),
        allDay: false,
        startMs: s,
        endMs: e,
        source: item,
      };
    }
    if (start.date && end.date) {
      // All-day: date là ngày bắt đầu (inclusive), end.date exclusive — quy về LOCAL day
      const s = parseLocalDate(start.date);
      const e = parseLocalDate(end.date);
      if (s === null || e === null || e <= s) return null;
      return {
        key: calendarId + ':' + item.id,
        id: item.id,
        calendarId: calendarId,
        summary: String(item.summary || '(Cả ngày)').slice(0, 500),
        allDay: true,
        startMs: s,
        endMs: e,
        source: item,
      };
    }
    return null;
  }

  // 'YYYY-MM-DD' → start-of-day (local). Từ chối ngày roll-over (2026-13-40).
  function parseLocalDate(str) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str))) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str));
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
    if (isNaN(dt.getTime())) return null;
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt.getTime();
  }

  // items: mảng Google event (có thể kèm _calendarId từ server) — thêm calendarId nếu thiếu.
  function normalizeEvents(items, calendarId) {
    if (!Array.isArray(items)) return [];
    const out = [];
    items.forEach((it) => {
      const ev = normalizeItem(it, it && it._calendarId ? it._calendarId : calendarId);
      if (ev) out.push(ev);
    });
    return out;
  }

  // Ngày local 'YYYY-MM-DD' → { startMs, endMs } (ranh giới ngày theo máy).
  function localDayRange(localDateStr) {
    const s = parseLocalDate(localDateStr);
    if (s === null) return null;
    return { startMs: s, endMs: s + 24 * 60 * 60 * 1000 };
  }

  // Event giao với ngày local nào đó.
  function eventsForDate(events, localDateStr) {
    const range = localDayRange(localDateStr);
    if (!range || !Array.isArray(events)) return [];
    return events.filter((e) => e && e.startMs < range.endMs && e.endMs > range.startMs);
  }

  function toLocalHHMM(ms) {
    const d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // Busy windows cho planner-rules: chỉ timed events, clamp vào ngày, không tính all-day
  // (all-day không có khe giờ rời rạc — được show trong list nhưng không vào slot math).
  function busyForDate(events, localDateStr) {
    const range = localDayRange(localDateStr);
    if (!range) return [];
    return eventsForDate(events, localDateStr)
      .filter((e) => !e.allDay)
      .map((e) => ({
        // Clamp end vào 23:59 của ngày (không phải 24:00) — '00:00' sau nửa đêm
        // sẽ đánh bại filter b.start < b.end và làm mất block xuyên đêm.
        start: toLocalHHMM(Math.max(e.startMs, range.startMs)),
        end: toLocalHHMM(Math.min(e.endMs, range.endMs - 60 * 1000)),
        status: 'planned',
        _gcal: true,
      }))
      .filter((b) => b.start < b.end);
  }

  // Dedup theo key + sort theo startMs (calendar nào bắt đầu sớm hơn đứng trước).
  function mergeAndSort(events) {
    if (!Array.isArray(events)) return [];
    const seen = new Set();
    const out = [];
    events.forEach((e) => {
      if (!e || seen.has(e.key)) return;
      seen.add(e.key);
      out.push(e);
    });
    out.sort((a, b) => (a.startMs - b.startMs) || (a.endMs - b.endMs));
    return out;
  }

  /* ---------------- Cache offline ---------------- */

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return { version: CACHE_VERSION, fetchedAt: null, events: [] };
      const c = JSON.parse(raw);
      if (!c || c.version !== CACHE_VERSION || !Array.isArray(c.events)) {
        return { version: CACHE_VERSION, fetchedAt: null, events: [] };
      }
      return c;
    } catch (e) {
      return { version: CACHE_VERSION, fetchedAt: null, events: [] };
    }
  }

  function saveCache(events, fetchedAt) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        version: CACHE_VERSION,
        fetchedAt: fetchedAt || new Date().toISOString(),
        events,
      }));
    } catch (e) { /* quota — bỏ qua */ }
  }

  function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ẩn */ }
  }

  function cacheValid(cache, ttlMs) {
    if (!cache || !cache.fetchedAt) return false;
    return Date.now() - new Date(cache.fetchedAt).getTime() < (ttlMs || TTL_MS);
  }

  /* ---------------- Network ---------------- */

  async function fetchStatus() {
    return gcalFetch('/api/calendar/status');
  }

  // timeMin/timeMax: ISO string (RFC3339). Trả { events (normalized), fetchedAt, errors }.
  async function fetchEvents(timeMin, timeMax) {
    const qs = 'timeMin=' + encodeURIComponent(timeMin) + '&timeMax=' + encodeURIComponent(timeMax);
    const res = await gcalFetch('/api/calendar/events?' + qs);
    if (!res.ok || !res.data) return { ok: false, status: res.status, events: [], errors: [], fetchedAt: null };
    return {
      ok: true,
      status: res.status,
      events: normalizeEvents(res.data.events),
      errors: Array.isArray(res.data.errors) ? res.data.errors : [],
      fetchedAt: res.data.fetchedAt || null,
    };
  }

  function connect() {
    const base = apiBase();
    const token = getToken();
    if (!base) return false;
    window.location.href = base + '/api/calendar/connect?token=' + encodeURIComponent(token || '');
    return true;
  }

  // V1.6B — yêu cầu quyền ghi (chỉ khi user bật "Add to Google Calendar").
  function connectWrite() {
    const base = apiBase();
    const token = getToken();
    if (!base) return false;
    window.location.href = base + '/api/calendar/connect-write?token=' + encodeURIComponent(token || '');
    return true;
  }

  async function disconnect() {
    const res = await gcalFetch('/api/calendar/disconnect', { method: 'POST', body: {} });
    if (res.ok) clearCache();
    return res;
  }

  // Đọc ?cal=ok / ?cal=error=... từ URL (sau OAuth callback), xoá khỏi URL, trả kết quả.
  function consumeCalParam() {
    const m = window.location.search.match(/[?&]cal=(ok|error(?:=[^&]*)?)/);
    if (!m) return null;
    const clean = window.DeepLink
      ? window.DeepLink.withoutParam(window.location.href, 'cal')
      : window.location.origin + window.location.pathname;
    try { window.history.replaceState({}, '', clean); } catch (e) { /* ẩn */ }
    return m[1];
  }

  /* ============ V1.6B — Export TimeBlock → Google Calendar ============ */

  // block { date: 'YYYY-MM-DD', start: 'HH:mm', end: 'HH:mm' } → { startIso, endIso }
  // theo múi giờ MÁY của user (instant đúng bất kể timezone calendar của Google).
  // Pure — test được. Trả null nếu date/time không hợp lệ (end phải sau start).
  function buildBlockISO(block) {
    if (!block || typeof block !== 'object') return null;
    const date = String(block.date || '');
    const start = String(block.start || '');
    const end = String(block.end || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) return null;
    const sm = /^(\d{2}):(\d{2})$/.exec(start);
    const em = /^(\d{2}):(\d{2})$/.exec(end);
    if (!sm || !em) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const sMin = (+sm[1]) * 60 + (+sm[2]);
    const eMin = (+em[1]) * 60 + (+em[2]);
    if (eMin <= sMin) return null; // không xuyên ngày
    const startD = new Date(y, mo - 1, d, +sm[1], +sm[2], 0, 0);
    const endD = new Date(y, mo - 1, d, +em[1], +em[2], 0, 0);
    if (isNaN(startD.getTime()) || isNaN(endD.getTime())) return null;
    if (startD.getDate() !== d || startD.getMonth() !== mo - 1) return null; // chống roll-over
    return { startIso: startD.toISOString(), endIso: endD.toISOString() };
  }

  /* ---------------- Mapping mirror (offline) ---------------- */

  function loadMappings() {
    try {
      const raw = localStorage.getItem(MAPPINGS_KEY);
      if (!raw) return { version: MAPPINGS_VERSION, mappings: [] };
      const c = JSON.parse(raw);
      if (!c || c.version !== MAPPINGS_VERSION || !Array.isArray(c.mappings)) {
        return { version: MAPPINGS_VERSION, mappings: [] };
      }
      return c;
    } catch (e) {
      return { version: MAPPINGS_VERSION, mappings: [] };
    }
  }

  function saveMappings(mappings) {
    try {
      localStorage.setItem(MAPPINGS_KEY, JSON.stringify({
        version: MAPPINGS_VERSION,
        mappings: Array.isArray(mappings) ? mappings : [],
      }));
    } catch (e) { /* quota — bỏ qua */ }
  }

  // Upsert mapping (theo taskflowBlockId) vào mirror. Trả mảng mới.
  function upsertMapping(mapping) {
    if (!mapping || !mapping.taskflowBlockId) return loadMappings().mappings;
    const store = loadMappings();
    const idx = store.mappings.findIndex((x) => x && x.taskflowBlockId === mapping.taskflowBlockId);
    if (idx !== -1) store.mappings[idx] = { ...store.mappings[idx], ...mapping };
    else store.mappings.push({ ...mapping });
    saveMappings(store.mappings);
    return store.mappings;
  }

  function mappingForBlock(blockId) {
    if (!blockId) return null;
    return loadMappings().mappings.find((x) => x && x.taskflowBlockId === blockId) || null;
  }

  // Xuất 1 TimeBlock → Google. Idempotent client-side: mapping đã tồn tại → trả
  // mapping cũ (duplicate:true) KHÔNG gọi server (chống tạo event lặp khi click 2 lần).
  // block: { id, taskUid, date, start, end } — title tự sinh từ task/block nếu thiếu.
  async function exportBlock(block, opts) {
    const o = opts || {};
    if (!block || !block.id) return { ok: false, status: 400, data: { error: 'invalid-block' } };
    const existing = mappingForBlock(block.id);
    if (existing) {
      return { ok: true, status: 200, duplicate: true, mapping: existing };
    }
    const iso = buildBlockISO(block);
    if (!iso) return { ok: false, status: 400, data: { error: 'invalid-range' } };
    const title = String(o.title || block.title || '').trim()
      || 'TimeBlock ' + block.start + '–' + block.end;
    const res = await gcalFetch('/api/calendar/export', {
      method: 'POST',
      body: {
        blockId: block.id,
        taskUid: block.taskUid || null,
        title,
        startIso: iso.startIso,
        endIso: iso.endIso,
        calendarId: o.calendarId || 'primary',
      },
    });
    const data = res.data || {};
    if (res.ok && data.mapping) {
      upsertMapping(data.mapping);
    }
    return {
      ok: res.ok,
      status: res.status,
      duplicate: !!data.duplicate,
      mapping: data.mapping || null,
      data,
    };
  }

  return {
    CACHE_KEY, TTL_MS,
    normalizeEvents, localDayRange, eventsForDate, busyForDate, mergeAndSort,
    loadCache, saveCache, clearCache, cacheValid,
    fetchStatus, fetchEvents, connect, connectWrite, disconnect, consumeCalParam,
    buildBlockISO, loadMappings, saveMappings, upsertMapping, mappingForBlock, exportBlock,
    apiBase, toLocalHHMM,
  };
});
