// TaskFlow P10 — pure, additive data migrations for local snapshots.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowDataMigrations = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const APP = 'taskflow-todoist';
  const VERSION = 2;
  const MONTH_KEY = /^planner-(\d{4})-(\d{1,2})$/;
  const PLANNER_KEY = /^planner-[A-Za-z0-9._-]{1,120}$/;
  const LEGACY_KEY = 'january-planner-2026';

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function objectOrEmpty(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? clone(value) : {};
  }

  // V1.4 — Chuẩn hoá schedule habit (additive, idempotent, không phá legacy).
  // Habit không có schedule → giữ nguyên (mặc định daily). Schedule malformed →
  // reset về daily (không xoá habit, không đụng days/target/remind).
  function normalizeHabitSchedule(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    const type = s.type;
    if (type === 'daily') return { type: 'daily' };
    if (type === 'weekdays') {
      const days = Array.isArray(s.days)
        ? s.days.map((d) => (Number.isInteger(d) ? d : NaN)).filter((d) => d >= 1 && d <= 7)
          .filter((d, i, a) => a.indexOf(d) === i).sort((a, b) => a - b)
        : [];
      if (!days.length) return null;
      return { type: 'weekdays', days };
    }
    if (type === 'weekly_count') {
      const count = Number(s.count);
      if (!Number.isInteger(count) || count < 1 || count > 31) return null;
      return { type: 'weekly_count', count };
    }
    if (type === 'monthly_count') {
      const count = Number(s.count);
      if (!Number.isInteger(count) || count < 1 || count > 93) return null;
      return { type: 'monthly_count', count };
    }
    return null;
  }

  function ensureHabitSchedules(state) {
    const out = objectOrEmpty(state);
    if (!Array.isArray(out.habits)) out.habits = [];
    out.habits = out.habits.map((h) => {
      if (!h || typeof h !== 'object' || Array.isArray(h)) return h;
      const n = normalizeHabitSchedule(h.schedule);
      if (n) h.schedule = n;
      else if (h.schedule !== undefined) h.schedule = { type: 'daily' }; // malformed → daily
      return h;
    });
    return out;
  }

  function migrateMonthState(raw, context) {
    const out = ensureHabitSchedules(objectOrEmpty(raw));
    out.schemaVersion = VERSION;
    out.monthlyGoals = Array.isArray(out.monthlyGoals) ? out.monthlyGoals : [];
    out.habits = Array.isArray(out.habits) ? out.habits : [];
    out.weeks = Array.isArray(out.weeks) ? out.weeks : [];
    if (context && Number.isInteger(context.year) && out.year == null) out.year = context.year;
    if (context && Number.isInteger(context.month) && out.month == null) out.month = context.month;
    return out;
  }

  // P0.2B — Định nghĩa DUY NHẤT của "task trống thật sự" (dùng chung cho lifecycle
  // draft + migration cleanup). Task chỉ được tự xoá khi text (trim) rỗng VÀ không
  // chứa bất kỳ nội dung/trạng thái người dùng có ý nghĩa nào:
  // tags, notes, subtasks, deadline, remind bật, repeat, duration, linkedMetricIds,
  // focusLog, carried/carriedFrom (dồn ngày chủ động). Trả true = an toàn để xoá.
  function isTaskTrulyEmpty(tk) {
    if (!tk || typeof tk !== 'object' || Array.isArray(tk)) return false;
    if ((tk.text || '').trim() !== '') return false;
    if (Array.isArray(tk.tags) && tk.tags.length) return false;
    if (Array.isArray(tk.subtasks) && tk.subtasks.length) return false;
    if (typeof tk.notes === 'string' && tk.notes.trim() !== '') return false;
    if (typeof tk.note === 'string' && tk.note.trim() !== '') return false;
    if (tk.deadline) return false;
    if (tk.remind && tk.remind.enabled) return false;
    if (tk.repeat && tk.repeat.freq) return false;
    if (tk.duration) return false;
    if (Array.isArray(tk.linkedMetricIds) && tk.linkedMetricIds.length) return false;
    if (Array.isArray(tk.focusLog) && tk.focusLog.length) return false;
    if (tk.carriedFrom) return false;
    if (tk.carried) return false;
    return true;
  }

  // P0.3 — Cleanup additive, KHÔNG mutate input. Quét weeks[].days[].tasks của month
  // state, xoá CHỈ task truly-empty (isTaskTrulyEmpty). Giữ nguyên uid, thứ tự, done
  // và toàn bộ metadata của task thật. Trả { state, removed }. Idempotent: chạy lần 2
  // trên kết quả trả về removed = 0 (không có blank mới).
  function cleanupTrulyEmptyTasks(state) {
    const out = clone(state || {});
    let removed = 0;
    if (Array.isArray(out.weeks)) {
      out.weeks.forEach((w) => {
        if (!w || !Array.isArray(w.days)) return;
        w.days.forEach((d) => {
          if (!d || !Array.isArray(d.tasks)) return;
          const kept = d.tasks.filter((tk) => {
            if (isTaskTrulyEmpty(tk)) { removed++; return false; }
            return true;
          });
          d.tasks = kept;
        });
      });
    }
    return { state: out, removed };
  }

  function migrateReflectionStore(raw) {
    return objectOrEmpty(raw);
  }

  function validateSnapshot(snapshot) {
    const errors = [];
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return { ok: false, errors: ['invalid-snapshot'] };
    if (snapshot.app !== APP) errors.push('invalid-app');
    const version = snapshot.version == null ? 1 : Number(snapshot.version);
    if (!Number.isInteger(version) || version < 1) errors.push('invalid-version');
    else if (version > VERSION) errors.push('unsupported-version');
    if (!snapshot.keys || typeof snapshot.keys !== 'object' || Array.isArray(snapshot.keys)) {
      errors.push('invalid-keys');
    } else {
      Object.keys(snapshot.keys).forEach((key) => {
        if (!PLANNER_KEY.test(key) && key !== LEGACY_KEY) errors.push('invalid-key:' + key);
        if (typeof snapshot.keys[key] !== 'string') errors.push('invalid-value:' + key);
        if ((MONTH_KEY.test(key) || key === 'planner-reflections-daily') && typeof snapshot.keys[key] === 'string') {
          try { JSON.parse(snapshot.keys[key]); } catch (e) { errors.push('invalid-json:' + key); }
        }
      });
    }
    return { ok: errors.length === 0, errors };
  }

  function migrateSnapshot(snapshot) {
    const check = validateSnapshot(snapshot);
    if (!check.ok) {
      const error = new Error(check.errors[0] || 'invalid-snapshot');
      error.errors = check.errors;
      throw error;
    }
    const out = clone(snapshot);
    out.version = VERSION;
    out.keys = Object.assign({}, out.keys);
    Object.keys(out.keys).forEach((key) => {
      const match = MONTH_KEY.exec(key);
      if (match) {
        const parsed = JSON.parse(out.keys[key]);
        out.keys[key] = JSON.stringify(migrateMonthState(parsed, { year: +match[1], month: +match[2] }));
      } else if (key === 'planner-reflections-daily') {
        out.keys[key] = JSON.stringify(migrateReflectionStore(JSON.parse(out.keys[key])));
      }
    });
    return out;
  }

  return {
    APP, VERSION, MONTH_KEY, PLANNER_KEY, LEGACY_KEY,
    migrateMonthState, migrateReflectionStore, migrateSnapshot, validateSnapshot,
    isTaskTrulyEmpty, cleanupTrulyEmptyTasks, ensureHabitSchedules, normalizeHabitSchedule,
  };
});
