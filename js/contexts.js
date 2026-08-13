// TaskFlow — V1.2.1 Task Planning Metadata: Contexts store + task metadata helpers.
// Dữ liệu: store riêng ở key 'planner-contexts' — Store = { version: 1, contexts: [Context] }.
// Context = { id: 'ctx_…', label, createdAt, updatedAt }. ID ổn định — label (tên hiển thị)
// có thể sửa; task chỉ lưu ID (không lưu emoji/name trong task.contexts).
//
// Task metadata mở rộng (OPTIONAL, đọc thiếu như null/[] — KHÔNG eager-rewrite task cũ):
//   estimatedMinutes — BẢN ĐỒ TỚI field duration CÓ SẴN (task.duration, đơn vị phút, đã có
//     ở Task Detail + Quick Add + inbox/upcoming chip + blank-draft detection). Không nhân
//     đôi state: taskEstimatedMinutes(task) đọc task.duration.
//   energy: null | 'low' | 'medium' | 'high'
//   contexts: [] — mảng context ID (không phải label).
//
// Quy tắc referential: xoá context KHÔNG xoá task — caller gọi removeContextFromTasks()
// để lọc task.contexts (mọi tháng + inbox). Import: task.contexts trỏ ID không tồn tại
// trong store import → lọc ID đó (giữ task). Seed default (Computer/Phone/Home/School/
// Online/Outside) chỉ khi chưa từng có key — migration additive + idempotent.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowContexts = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const CONTEXTS_KEY = 'planner-contexts';
  const STORE_VERSION = 1;
  const ENERGY_LEVELS = ['low', 'medium', 'high'];

  // Default suggestions — editable; chỉ seed lần đầu (chưa có key).
  const DEFAULT_CONTEXTS = ['Computer', 'Phone', 'Home', 'School', 'Online', 'Outside'];

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

  function defaultContext() {
    return { id: '', label: '', createdAt: '', updatedAt: '' };
  }

  // Chuẩn hoá 1 context — skip record malformed (không phải object, thiếu label).
  function normalizeContext(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    const label = typeof c.label === 'string' ? c.label.trim() : '';
    if (!label) return null;
    const base = defaultContext();
    return {
      ...base,
      id: (typeof c.id === 'string' && c.id) ? c.id : newId('ctx_'),
      label,
      createdAt: typeof c.createdAt === 'string' ? c.createdAt : '',
      updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : '',
    };
  }

  // Migration additive + idempotent: thiếu key → seed DEFAULT_CONTEXTS (lần đầu).
  // Record malformed bị bỏ qua; store hợp lệ giữ nguyên (chạy lại → changed false).
  function migrateContexts(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      const now = nowISO();
      return {
        store: {
          version: STORE_VERSION,
          contexts: DEFAULT_CONTEXTS.map((label) => ({
            ...defaultContext(), id: newId('ctx_'), label, createdAt: now, updatedAt: now,
          })),
        },
        changed: true,
      };
    }
    const contexts = Array.isArray(raw.contexts)
      ? raw.contexts.map(normalizeContext).filter(Boolean)
      : [];
    const store = {
      version: STORE_VERSION,
      contexts: contexts.map((c, i) => ({ ...c, id: c.id || 'ctx_' + i })),
    };
    const rawCount = Array.isArray(raw.contexts) ? raw.contexts.length : 0;
    return {
      store,
      changed: contexts.length !== rawCount || (raw.version || 0) !== STORE_VERSION,
    };
  }

  function loadContexts() {
    let raw = null;
    try {
      const s = localStorage.getItem(CONTEXTS_KEY);
      if (s) raw = JSON.parse(s);
    } catch (e) { /* ẩn */ }
    const { store } = migrateContexts(raw);
    return store;
  }

  function saveContexts(store) {
    const out = store && typeof store === 'object' ? store : { version: STORE_VERSION, contexts: [] };
    try { localStorage.setItem(CONTEXTS_KEY, JSON.stringify(out)); } catch (e) { /* ẩn */ }
    if (typeof window !== 'undefined' && window.Sync && window.Sync.push) {
      window.Sync.push(CONTEXTS_KEY);
    }
  }

  /* ---------------- Lookup ---------------- */

  function getContext(store, id) {
    if (!store || !Array.isArray(store.contexts)) return null;
    return store.contexts.find((c) => c && c.id === id) || null;
  }

  // Label hiển thị / null nếu ID không tồn tại (render bỏ qua ID lạ một cách an toàn).
  function contextLabel(store, id) {
    const c = getContext(store, id);
    return c ? c.label : null;
  }

  /* ---------------- Context CRUD ---------------- */

  function createContext(store, label) {
    const lbl = typeof label === 'string' ? label.trim() : '';
    if (!lbl) return null;
    if (!store || typeof store !== 'object' || !Array.isArray(store.contexts)) {
      store.contexts = [];
    }
    // ID ổn định: label trùng → vẫn tạo mới (mỗi context là 1 thực thể riêng).
    const now = nowISO();
    const c = { ...defaultContext(), id: newId('ctx_'), label: lbl, createdAt: now, updatedAt: now };
    store.contexts.push(c);
    return c;
  }

  function renameContext(store, id, label) {
    const c = getContext(store, id);
    if (!c) return null;
    const lbl = typeof label === 'string' ? label.trim() : '';
    if (!lbl) return null;
    c.label = lbl;
    c.updatedAt = nowISO();
    return c;
  }

  // Xoá context — KHÔNG xoá task; caller (app.js) gọi removeContextFromTasks() để lọc.
  function deleteContext(store, id) {
    const c = getContext(store, id);
    if (!c) return null;
    store.contexts = store.contexts.filter((x) => !x || x.id !== id);
    return c;
  }

  /* ---------------- Task metadata helpers (read missing as null/[]) ---------------- */

  // estimatedMinutes — map tới task.duration CÓ SẴN (phút). Trả số >= 0 / null.
  function taskEstimatedMinutes(task) {
    if (!task || typeof task !== 'object') return null;
    if (typeof task.estimatedMinutes === 'number' && task.estimatedMinutes >= 0) {
      return task.estimatedMinutes;
    }
    return typeof task.duration === 'number' && task.duration >= 0 ? task.duration : null;
  }

  function taskEnergy(task) {
    if (!task || typeof task !== 'object') return null;
    return ENERGY_LEVELS.includes(task.energy) ? task.energy : null;
  }

  // Mảng context ID đã lọc (chỉ ID hợp lệ trong store; bỏ ID lạ, bỏ non-array).
  function taskContextIds(task) {
    if (!task || typeof task !== 'object') return [];
    return Array.isArray(task.contexts) ? task.contexts.filter((x) => typeof x === 'string' && x) : [];
  }

  // Lọc ID không tồn tại trong store — trả { ids, changed } (không mutate task).
  function validateTaskContexts(store, task) {
    const ids = taskContextIds(task);
    const known = new Set((store && Array.isArray(store.contexts) ? store.contexts : []).map((c) => c.id));
    const kept = ids.filter((id) => known.has(id));
    return { ids: kept, changed: kept.length !== ids.length };
  }

  /* ---------------- Delete cleanup (mọi tháng + inbox) ---------------- */

  // Lọc context vừa xoá khỏi MỘT mảng task. Trả số task đã đổi. Không mutate nếu sạch.
  function removeContextFromTasks(ctxId, tasks) {
    if (!Array.isArray(tasks) || typeof ctxId !== 'string') return 0;
    let changed = 0;
    tasks.forEach((tk) => {
      if (!tk || typeof tk !== 'object') return;
      const ids = taskContextIds(tk);
      if (ids.includes(ctxId)) {
        tk.contexts = ids.filter((id) => id !== ctxId);
        changed++;
      }
    });
    return changed;
  }

  /* ---------------- Import sanitization (snapshot-level) ---------------- */

  // Sanitize snapshot import: nếu snapshot có planner-contexts → migrate; mọi task trong
  // month key + inbox chỉ giữ context ID có trong store import (KHÔNG xoá task).
  // Snapshot không có key contexts → trả nguyên (runtime loadContexts seed khi cần).
  function sanitizeSnapshotRefs(snapshot) {
    if (!snapshot || !snapshot.keys || typeof snapshot.keys !== 'object') return snapshot;
    const out = clone(snapshot);
    const raw = out.keys[CONTEXTS_KEY];
    if (!raw) return out;
    let store;
    try { store = migrateContexts(JSON.parse(raw)).store; } catch (e) { return out; }
    const known = new Set(store.contexts.map((c) => c.id));
    if (!known.size) return out;
    const cleanTask = (tk) => {
      if (!tk || typeof tk !== 'object') return false;
      const ids = taskContextIds(tk);
      if (!ids.length) return false;
      const kept = ids.filter((id) => known.has(id));
      if (kept.length !== ids.length) { tk.contexts = kept; return true; }
      return false;
    };
    Object.keys(out.keys).forEach((key) => {
      if (!/^planner-(\d{4})-(\d{1,2})$/.test(key) && key !== 'planner-inbox') return;
      let parsed;
      try { parsed = JSON.parse(out.keys[key]); } catch (e) { return; }
      let changed = false;
      if (key === 'planner-inbox') {
        if (Array.isArray(parsed)) parsed.forEach((tk) => { if (cleanTask(tk)) changed = true; });
      } else if (parsed && Array.isArray(parsed.weeks)) {
        parsed.weeks.forEach((w) => {
          if (!w || !Array.isArray(w.days)) return;
          w.days.forEach((d) => {
            if (d && Array.isArray(d.tasks)) d.tasks.forEach((tk) => { if (cleanTask(tk)) changed = true; });
          });
        });
      }
      if (changed) out.keys[key] = JSON.stringify(parsed);
    });
    return out;
  }

  return {
    CONTEXTS_KEY,
    STORE_VERSION,
    ENERGY_LEVELS,
    DEFAULT_CONTEXTS,
    newId,
    defaultContext,
    normalizeContext,
    migrateContexts,
    loadContexts,
    saveContexts,
    getContext,
    contextLabel,
    createContext,
    renameContext,
    deleteContext,
    taskEstimatedMinutes,
    taskEnergy,
    taskContextIds,
    validateTaskContexts,
    removeContextFromTasks,
    sanitizeSnapshotRefs,
  };
});
