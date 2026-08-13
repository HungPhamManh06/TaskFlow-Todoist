// TaskFlow — Time Blocking foundation (V1.2).
// Dữ liệu: store riêng ở key 'planner-timeblocks' — KHÔNG lưu giờ trên task.
// Store = { version: 1, blocks: [TimeBlock] }.
// TimeBlock = { id: 'block_…', taskUid: null|'task_…', date: 'YYYY-MM-DD',
//   start: 'HH:mm', end: 'HH:mm', status: 'planned'|'completed'|'cancelled',
//   createdAt, updatedAt }.
// Một task có thể có 0..n TimeBlock. Xoá block KHÔNG xoá task; xoá task → caller
// gọi removeTaskBlocks() để dọn block liên kết (không để orphan). Tài liệu tham chiếu
// taskUid không hợp lệ được dọn an toàn (clear taskUid → null, giữ block).
//
// Quy tắc thời gian: end PHẢI sau start (so sánh theo phút). Khoảng nửa-mở [start, end)
// — block back-to-back (09:00-10:00 và 10:00-11:00) KHÔNG bị coi là trùng. Không hỗ trợ
// block xuyên ngày (end <= start → reject, tức không có end '00:00' hợp lệ). '00:00' hợp
// lệ ở vị trí start. Trùng lặp: findOverlaps() cảnh báo — KHÔNG tự động di chuyển block.
//
// Overlap bỏ qua block status 'cancelled' (block huỷ không tranh chấp lịch).
//
// Migration additive + idempotent: thiếu key → store rỗng hợp lệ; record malformed bị
// bỏ qua (normalizeBlock) chứ không xoá cả store. Module KHÔNG sở hữu state app — nhận
// qua tham số; save/load đọc localStorage và gọi window.Sync.push (pattern storage.js).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowTimeBlocks = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const TIMEBLOCKS_KEY = 'planner-timeblocks';
  const STORE_VERSION = 1;
  const BLOCK_STATUSES = ['planned', 'completed', 'cancelled'];

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  // HH:mm — 00:00..23:59. Không chấp nhận 24:00 (không có xuyên ngày).
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  // Collision-resistant lightweight IDs theo convention uid hiện tại (timestamp + rand).
  function newId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function defaultBlock() {
    return {
      id: '',
      taskUid: null,
      date: '',
      start: '',
      end: '',
      status: 'planned',
      createdAt: '',
      updatedAt: '',
    };
  }

  // 'HH:mm' → số phút trong ngày; null nếu không hợp lệ. '00:00' → 0.
  function toMinutes(t) {
    if (typeof t !== 'string' || !TIME_RE.test(t)) return null;
    const m = /^(\d{2}):(\d{2})$/.exec(t);
    return (+m[1]) * 60 + (+m[2]);
  }

  // Khoảng nửa-mở [start, end): hợp lệ khi start < end (không bằng → không âm,
  // không xuyên ngày). end <= start (gồm end '00:00') → null.
  function validRange(start, end) {
    const s = toMinutes(start);
    const e = toMinutes(end);
    if (s === null || e === null) return false;
    return s < e;
  }

  // Chuẩn hoá 1 block — điền default field thiếu; trả null nếu record không dùng được
  // (không phải object, date/time sai, end <= start, status lạ). KHÔNG xoá cả store.
  function normalizeBlock(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
    const date = typeof b.date === 'string' ? b.date : '';
    const start = typeof b.start === 'string' ? b.start : '';
    const end = typeof b.end === 'string' ? b.end : '';
    if (!DATE_RE.test(date) || !validRange(start, end)) return null;
    const base = defaultBlock();
    return {
      ...base,
      id: (typeof b.id === 'string' && b.id) ? b.id : (base.id || newId('block_')),
      taskUid: (typeof b.taskUid === 'string' && b.taskUid) ? b.taskUid : null,
      date,
      start,
      end,
      status: BLOCK_STATUSES.includes(b.status) ? b.status : 'planned',
      createdAt: typeof b.createdAt === 'string' ? b.createdAt : '',
      updatedAt: typeof b.updatedAt === 'string' ? b.updatedAt : '',
    };
  }

  // Migration additive + idempotent. Trả { store, changed }. Dữ liệu cũ không có key →
  // store rỗng hợp lệ. Record malformed bị bỏ qua; store hợp lệ giữ nguyên.
  function migrateTimeBlocks(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { store: { version: STORE_VERSION, blocks: [] }, changed: true };
    }
    const blocks = Array.isArray(raw.blocks)
      ? raw.blocks.map(normalizeBlock).filter(Boolean)
      : [];
    const store = {
      version: STORE_VERSION,
      blocks: blocks.map((b, i) => ({ ...b, id: b.id || 'block_' + i })),
    };
    const rawCount = Array.isArray(raw.blocks) ? raw.blocks.length : 0;
    return {
      store,
      changed: blocks.length !== rawCount || (raw.version || 0) !== STORE_VERSION,
    };
  }

  // Đọc store từ localStorage (migrate mỗi lần load). Không throw — lỗi → store rỗng.
  function loadTimeBlocks() {
    let raw = null;
    try {
      const s = localStorage.getItem(TIMEBLOCKS_KEY);
      if (s) raw = JSON.parse(s);
    } catch (e) { /* ẩn */ }
    const { store } = migrateTimeBlocks(raw);
    return store;
  }

  // Ghi store + Sync.push theo convention storage.js. Không throw.
  function saveTimeBlocks(store) {
    const out = store && typeof store === 'object' ? store : { version: STORE_VERSION, blocks: [] };
    try { localStorage.setItem(TIMEBLOCKS_KEY, JSON.stringify(out)); } catch (e) { /* ẩn */ }
    if (typeof window !== 'undefined' && window.Sync && window.Sync.push) {
      window.Sync.push(TIMEBLOCKS_KEY);
    }
  }

  /* ---------------- Lookup ---------------- */

  function getBlock(store, id) {
    if (!store || !Array.isArray(store.blocks)) return null;
    return store.blocks.find((b) => b && b.id === id) || null;
  }

  function blocksForDate(store, date) {
    if (!store || !Array.isArray(store.blocks) || typeof date !== 'string') return [];
    return store.blocks.filter((b) => b && b.date === date);
  }

  // Tất cả block của 1 task (bao gồm cancelled — caller lọc khi cần).
  function blocksForTask(store, taskUid) {
    if (!store || !Array.isArray(store.blocks) || typeof taskUid !== 'string') return [];
    return store.blocks.filter((b) => b && b.taskUid === taskUid);
  }

  /* ---------------- CRUD ---------------- */

  // Tạo block. taskUid tuỳ chọn (null = block không liên kết). Trả block / null nếu
  // date/start/end không hợp lệ (end phải sau start, cùng ngày).
  function createTimeBlock(store, data) {
    const d = data && typeof data === 'object' ? data : {};
    const date = typeof d.date === 'string' ? d.date : '';
    const start = typeof d.start === 'string' ? d.start : '';
    const end = typeof d.end === 'string' ? d.end : '';
    if (!DATE_RE.test(date) || !validRange(start, end)) return null;
    if (!store || typeof store !== 'object' || !Array.isArray(store.blocks)) {
      store.blocks = [];
    }
    const now = nowISO();
    const b = {
      ...defaultBlock(),
      id: newId('block_'),
      taskUid: (typeof d.taskUid === 'string' && d.taskUid) ? d.taskUid : null,
      date,
      start,
      end,
      status: BLOCK_STATUSES.includes(d.status) ? d.status : 'planned',
      createdAt: now,
      updatedAt: now,
    };
    store.blocks.push(b);
    return b;
  }

  // Sửa block (patch từng phần). Nếu patch đổi date/start/end → validate lại range.
  // Trả block / null (không tồn tại hoặc range mới không hợp lệ — không đổi state).
  function updateTimeBlock(store, id, patch) {
    const b = getBlock(store, id);
    if (!b) return null;
    const p = patch && typeof patch === 'object' ? patch : {};
    const next = { ...b };
    if (typeof p.date === 'string') next.date = p.date;
    if (typeof p.start === 'string') next.start = p.start;
    if (typeof p.end === 'string') next.end = p.end;
    if (typeof p.taskUid === 'string' && p.taskUid) next.taskUid = p.taskUid;
    else if (p.taskUid === null || p.taskUid === undefined) next.taskUid = b.taskUid;
    if (typeof p.status === 'string') {
      if (!BLOCK_STATUSES.includes(p.status)) return null;
      next.status = p.status;
    }
    if (!DATE_RE.test(next.date) || !validRange(next.start, next.end)) return null;
    const out = { ...next, updatedAt: nowISO() };
    store.blocks[store.blocks.indexOf(b)] = out;
    return out;
  }

  // Xoá block — KHÔNG đụng task. Trả block đã xoá / null.
  function deleteTimeBlock(store, id) {
    const b = getBlock(store, id);
    if (!b) return null;
    store.blocks = store.blocks.filter((x) => !x || x.id !== id);
    return b;
  }

  // Đổi trạng thái (planned/completed/cancelled). Trả block / null.
  function setTimeBlockStatus(store, id, status) {
    if (!BLOCK_STATUSES.includes(status)) return null;
    const b = getBlock(store, id);
    if (!b) return null;
    const out = { ...b, status, updatedAt: nowISO() };
    store.blocks[store.blocks.indexOf(b)] = out;
    return out;
  }

  /* ---------------- Overlap ---------------- */

  // Tìm block trùng khoảng [start, end) nửa-mở trên cùng date. Bỏ qua block 'cancelled'
  // và ignoreId (chính block đang sửa). Trả danh sách block trùng (có thể rỗng).
  function findOverlaps(store, date, start, end, ignoreId) {
    if (!store || !Array.isArray(store.blocks)) return [];
    const s = toMinutes(start);
    const e = toMinutes(end);
    if (s === null || e === null || s >= e) return [];
    return store.blocks.filter((b) => {
      if (!b || b.id === ignoreId) return false;
      if (b.status === 'cancelled') return false;
      if (b.date !== date) return false;
      const bs = toMinutes(b.start);
      const be = toMinutes(b.end);
      if (bs === null || be === null) return false;
      return s < be && bs < e; // [s,e) và [bs,be) giao nhau
    });
  }

  /* ---------------- Task deletion cleanup ---------------- */

  // Xoá toàn bộ block liên kết với 1 task đã bị xoá. Trả số block đã xoá (0 nếu sạch).
  function removeTaskBlocks(store, taskUid) {
    if (!store || !Array.isArray(store.blocks) || typeof taskUid !== 'string') return 0;
    const before = store.blocks.length;
    store.blocks = store.blocks.filter((b) => !b || b.taskUid !== taskUid);
    return before - store.blocks.length;
  }

  /* ---------------- Estimated-duration integration (V1.2.1) ---------------- */

  // defaultBlockEnd('09:00', 90) → '10:30' — khi tạo TimeBlock, nếu task có
  // estimatedMinutes (task.duration), UI đề xuất duration đó làm mặc định.
  // KHÔNG ép buộc. Trả null nếu start không hợp lệ, minutes <= 0, hoặc kết quả
  // vượt quá nửa đêm (end '00:00' kế tiếp không được phép — không xuyên ngày).
  function defaultBlockEnd(start, minutes) {
    const s = toMinutes(start);
    if (s === null) return null;
    const m = typeof minutes === 'number' && Number.isFinite(minutes) ? Math.round(minutes) : 0;
    if (m <= 0) return null;
    const total = s + m;
    if (total > 24 * 60 - 1) return null; // 23:59 là end muộn nhất hợp lệ
    const h = String(Math.floor(total / 60)).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    return h + ':' + mm;
  }

  /* ---------------- Import sanitization (snapshot-level) ---------------- */

  // Sanitize snapshot import: block có taskUid trỏ tới task KHÔNG tồn tại trong snapshot
  // → clear taskUid (giữ block — có ngày/giờ riêng, chỉ mất liên kết). KHÔNG xoá block.
  // Trả snapshot mới (không mutate input).
  function sanitizeSnapshotRefs(snapshot) {
    if (!snapshot || !snapshot.keys || typeof snapshot.keys !== 'object') return snapshot;
    const out = clone(snapshot);
    const raw = out.keys[TIMEBLOCKS_KEY];
    if (!raw) return out;
    let store;
    try { store = migrateTimeBlocks(JSON.parse(raw)).store; } catch (e) { return out; }
    if (!store.blocks.length) return out;
    // Tập uid hợp lệ: mọi task trong month key + inbox của snapshot (context import).
    const valid = new Set();
    Object.keys(out.keys).forEach((key) => {
      if (!/^planner-(\d{4})-(\d{1,2})$/.test(key) && key !== 'planner-inbox') return;
      let parsed;
      try { parsed = JSON.parse(out.keys[key]); } catch (e) { return; }
      if (key === 'planner-inbox') {
        if (Array.isArray(parsed)) parsed.forEach((tk) => { if (tk && tk.uid) valid.add(tk.uid); });
        return;
      }
      if (parsed && Array.isArray(parsed.weeks)) {
        parsed.weeks.forEach((w) => {
          if (!w || !Array.isArray(w.days)) return;
          w.days.forEach((d) => {
            if (d && Array.isArray(d.tasks)) d.tasks.forEach((tk) => { if (tk && tk.uid) valid.add(tk.uid); });
          });
        });
      }
    });
    let changed = false;
    store.blocks.forEach((b) => {
      if (b.taskUid && !valid.has(b.taskUid)) { b.taskUid = null; changed = true; }
    });
    if (changed) out.keys[TIMEBLOCKS_KEY] = JSON.stringify(store);
    return out;
  }

  /* ---------------- Task ref resolution (dùng ở UI: mở task / Focus từ block) ---------------- */

  // resolveTaskRef(uid, state, inbox) — uid task ổn định nhưng vị trí (week/day/index)
  // thay đổi khi task di chuyển, nên quét toàn bộ weeks + inbox để tìm ref hiện tại.
  // Trả { scope: 'inbox', index } | { week, day, task } | null.
  // Pure — nhận state/inbox qua tham số để test được.
  function resolveTaskRef(uid, state, inbox) {
    if (typeof uid !== 'string' || !uid) return null;
    if (Array.isArray(inbox)) {
      const i = inbox.findIndex((tk) => tk && tk.uid === uid);
      if (i !== -1) return { scope: 'inbox', index: i };
    }
    if (state && Array.isArray(state.weeks)) {
      for (let w = 0; w < state.weeks.length; w++) {
        const week = state.weeks[w];
        if (!week || !Array.isArray(week.days)) continue;
        for (let d = 0; d < week.days.length; d++) {
          const day = week.days[d];
          if (!day || !Array.isArray(day.tasks)) continue;
          const ti = day.tasks.findIndex((tk) => tk && tk.uid === uid);
          if (ti !== -1) return { week: week.n, day: d, task: ti };
        }
      }
    }
    return null;
  }

  return {
    TIMEBLOCKS_KEY,
    STORE_VERSION,
    BLOCK_STATUSES,
    newId,
    defaultBlock,
    toMinutes,
    validRange,
    normalizeBlock,
    migrateTimeBlocks,
    loadTimeBlocks,
    saveTimeBlocks,
    getBlock,
    blocksForDate,
    blocksForTask,
    createTimeBlock,
    updateTimeBlock,
    deleteTimeBlock,
    setTimeBlockStatus,
    findOverlaps,
    removeTaskBlocks,
    defaultBlockEnd,
    sanitizeSnapshotRefs,
    resolveTaskRef,
  };
});
