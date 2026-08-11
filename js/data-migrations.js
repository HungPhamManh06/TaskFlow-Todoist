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

  function migrateMonthState(raw, context) {
    const out = objectOrEmpty(raw);
    out.schemaVersion = VERSION;
    out.monthlyGoals = Array.isArray(out.monthlyGoals) ? out.monthlyGoals : [];
    out.habits = Array.isArray(out.habits) ? out.habits : [];
    out.weeks = Array.isArray(out.weeks) ? out.weeks : [];
    if (context && Number.isInteger(context.year) && out.year == null) out.year = context.year;
    if (context && Number.isInteger(context.month) && out.month == null) out.month = context.month;
    return out;
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
  };
});
