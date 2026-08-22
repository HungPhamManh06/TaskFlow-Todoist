// TaskFlow — V1.2.1 Task Planning Metadata: unit tests cho js/contexts.js (store + helpers)
// + defaultBlockEnd (js/timeblocks.js) + wiring (app.html/contexts script, sw.js v214,
// i18n vi/en, dispatcher td-energy/td-ctx-toggle/ctx-*).
// Pattern phase22-timeblocks.test.mjs — import module trực tiếp (UMD).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Contexts from '../js/contexts.js';
import TimeBlocks from '../js/timeblocks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const I18N_JS = readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');
const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

const {
  CONTEXTS_KEY, STORE_VERSION, migrateContexts, loadContexts, saveContexts,
  getContext, contextLabel, createContext, renameContext, deleteContext,
  taskEstimatedMinutes, taskEnergy, taskContextIds, validateTaskContexts,
  removeContextFromTasks, sanitizeSnapshotRefs, DEFAULT_CONTEXTS,
} = Contexts;
const { defaultBlockEnd } = TimeBlocks;

function emptyStore() {
  return { version: STORE_VERSION, contexts: [] };
}

function makeTask(over) {
  return { uid: 'u' + Math.random().toString(36).slice(2, 8), text: 'task', done: false, ...over };
}

/* ---------------- Context CRUD ---------------- */

test('createContext: id ổn định (ctx_), label trim, status ok', () => {
  const store = emptyStore();
  const c = createContext(store, '  Computer  ');
  assert.ok(c.id.startsWith('ctx_'), 'id phải có prefix ctx_');
  assert.equal(c.label, 'Computer', 'label phải trim');
  assert.equal(store.contexts.length, 1);
  assert.equal(getContext(store, c.id).label, 'Computer');
  assert.equal(createContext(store, '   '), null, 'label rỗng bị từ chối');
  assert.equal(store.contexts.length, 1);
});

test('renameContext: đổi label, giữ ID', () => {
  const store = emptyStore();
  const c = createContext(store, 'School');
  const r = renameContext(store, c.id, 'University');
  assert.equal(r.label, 'University');
  assert.equal(r.id, c.id, 'ID phải giữ nguyên (identity ổn định)');
  assert.equal(renameContext(store, c.id, '  '), null, 'label rỗng bị từ chối');
  assert.equal(getContext(store, c.id).label, 'University');
});

test('deleteContext: xoá context, không đụng task (helper riêng)', () => {
  const store = emptyStore();
  const c1 = createContext(store, 'Home');
  const c2 = createContext(store, 'Outside');
  assert.equal(deleteContext(store, c1.id).id, c1.id);
  assert.equal(store.contexts.length, 1);
  assert.equal(getContext(store, c2.id).id, c2.id);
  assert.equal(deleteContext(store, 'ctx_nope'), null);
});

test('contextLabel: ID không tồn tại → null (render bỏ qua an toàn)', () => {
  const store = emptyStore();
  const c = createContext(store, 'Online');
  assert.equal(contextLabel(store, c.id), 'Online');
  assert.equal(contextLabel(store, 'ctx_ghost'), null);
});

/* ---------------- Migration ---------------- */

test('migrateContexts: thiếu key → seed DEFAULT_CONTEXTS lần đầu, idempotent sau đó', () => {
  const first = migrateContexts(null);
  assert.deepStrictEqual(
    first.store.contexts.map((c) => c.label),
    DEFAULT_CONTEXTS,
    'seed đúng default suggestions'
  );
  assert.equal(first.changed, true);
  assert.equal(new Set(first.store.contexts.map((c) => c.id)).size, first.store.contexts.length, 'id phải unique');
  const second = migrateContexts(first.store);
  assert.equal(second.changed, false, 'chạy lại trên store hợp lệ → 0 thay đổi (idempotent)');
});

test('migrateContexts: store hợp lệ giữ nguyên; malformed bỏ từng record', () => {
  const raw = {
    version: 1,
    contexts: [
      { id: 'ctx_1', label: 'Computer', createdAt: 'x', updatedAt: 'x' },
      { id: 'ctx_2', label: '', createdAt: 'x', updatedAt: 'x' }, // label rỗng → bỏ
      'junk',
      null,
    ],
  };
  const { store, changed } = migrateContexts(raw);
  assert.equal(store.contexts.length, 1, 'chỉ giữ record hợp lệ');
  assert.equal(store.contexts[0].id, 'ctx_1');
  assert.equal(changed, true, 'có malformed → changed');
});

/* ---------------- Task metadata helpers ---------------- */

test('taskEstimatedMinutes: map tới task.duration CÓ SẴN (không nhân đôi state)', () => {
  assert.equal(taskEstimatedMinutes({ duration: 60 }), 60, 'đọc task.duration');
  assert.equal(taskEstimatedMinutes({ duration: 0 }), 0);
  assert.equal(taskEstimatedMinutes({}), null, 'thiếu field → null (old task hợp lệ)');
  assert.equal(taskEstimatedMinutes(null), null);
  assert.equal(taskEstimatedMinutes({ estimatedMinutes: 90 }), 90, 'field mới cũng đọc được');
});

test('taskEnergy: null | low | medium | high; giá trị lạ → null', () => {
  assert.equal(taskEnergy({ energy: 'low' }), 'low');
  assert.equal(taskEnergy({ energy: 'high' }), 'high');
  assert.equal(taskEnergy({ energy: 'extreme' }), null, 'giá trị lạ → null');
  assert.equal(taskEnergy({}), null, 'thiếu field → null (old task hợp lệ)');
});

test('taskContextIds: mảng ID; non-array / ID rác bị lọc', () => {
  assert.deepStrictEqual(taskContextIds({ contexts: ['ctx_a', 'ctx_b'] }), ['ctx_a', 'ctx_b']);
  assert.deepStrictEqual(taskContextIds({}), [], 'thiếu field → [] (old task hợp lệ)');
  assert.deepStrictEqual(taskContextIds({ contexts: 'x' }), []);
  assert.deepStrictEqual(taskContextIds({ contexts: ['ctx_a', '', 5] }), ['ctx_a']);
});

test('validateTaskContexts: ID không tồn tại trong store → lọc', () => {
  const store = emptyStore();
  const c = createContext(store, 'Home');
  const ok = validateTaskContexts(store, { contexts: [c.id, 'ctx_ghost'] });
  assert.deepStrictEqual(ok.ids, [c.id]);
  assert.equal(ok.changed, true);
  const ok2 = validateTaskContexts(store, { contexts: [c.id] });
  assert.equal(ok2.changed, false);
});

/* ---------------- Delete cleanup ---------------- */

test('removeContextFromTasks: lọc context vừa xoá khỏi mảng task, giữ task', () => {
  const tasks = [
    makeTask({ contexts: ['ctx_a', 'ctx_b'] }),
    makeTask({ contexts: ['ctx_a'] }),
    makeTask({ contexts: ['ctx_c'] }),
    makeTask({}),
  ];
  const n = removeContextFromTasks('ctx_a', tasks);
  assert.equal(n, 2, '2 task bị đổi');
  assert.deepStrictEqual(tasks[0].contexts, ['ctx_b'], 'task giữ nguyên, chỉ bỏ context');
  assert.deepStrictEqual(tasks[1].contexts, []);
  assert.equal(tasks[2].contexts.length, 1, 'task không liên quan không đổi');
  assert.equal(removeContextFromTasks('ctx_z', tasks), 0);
});

/* ---------------- Import sanitization ---------------- */

function snapshotWith(tasks, ctxStoreRaw) {
  const keys = { 'planner-inbox': JSON.stringify(tasks) };
  if (ctxStoreRaw) keys[CONTEXTS_KEY] = JSON.stringify(ctxStoreRaw);
  return { app: 'taskflow-todoist', version: 2, exportedAt: new Date().toISOString(), keys };
}

test('sanitizeSnapshotRefs: task.contexts ID lạ trong snapshot → lọc, GIỮ task', () => {
  const store = emptyStore();
  const c = createContext(store, 'Home');
  const snap = snapshotWith([makeTask({ contexts: [c.id, 'ctx_ghost'] })], store);
  const out = sanitizeSnapshotRefs(snap);
  const tasks = JSON.parse(out.keys['planner-inbox']);
  assert.equal(tasks.length, 1, 'task được giữ');
  assert.deepStrictEqual(tasks[0].contexts, [c.id], 'chỉ giữ ID tồn tại');
});

test('sanitizeSnapshotRefs: không có key contexts → snapshot giữ nguyên', () => {
  const snap = snapshotWith([makeTask({ contexts: ['ctx_x'] })], null);
  const out = sanitizeSnapshotRefs(snap);
  assert.deepStrictEqual(out, snap, 'không đổi khi snapshot không có planner-contexts');
});

/* ---------------- Round trip ---------------- */

test('round-trip: contexts + task.contexts + energy + duration qua export → import', () => {
  const store = emptyStore();
  const c1 = createContext(store, 'Computer');
  createContext(store, 'Home');
  const task = makeTask({ contexts: [c1.id], energy: 'medium', duration: 45 });
  const snapshot = {
    app: 'taskflow-todoist', version: 2, exportedAt: new Date().toISOString(),
    keys: {
      [CONTEXTS_KEY]: JSON.stringify(store),
      'planner-inbox': JSON.stringify([task]),
    },
  };
  const imported = sanitizeSnapshotRefs(snapshot);
  const { store: storeIn } = migrateContexts(JSON.parse(imported.keys[CONTEXTS_KEY]));
  assert.equal(storeIn.contexts.length, 2, 'cả 2 context tồn tại');
  const taskIn = JSON.parse(imported.keys['planner-inbox'])[0];
  assert.deepStrictEqual(taskIn.contexts, [c1.id], 'task.contexts giữ nguyên');
  assert.equal(taskIn.energy, 'medium', 'energy giữ nguyên');
  assert.equal(taskEstimatedMinutes(taskIn), 45, 'duration giữ nguyên');
});

/* ---------------- defaultBlockEnd (V1.2 timeblock integration) ---------------- */

test('defaultBlockEnd: start + estimatedMinutes → end hợp lệ', () => {
  assert.equal(defaultBlockEnd('09:00', 60), '10:00');
  assert.equal(defaultBlockEnd('09:00', 90), '10:30');
  assert.equal(defaultBlockEnd('00:00', 30), '00:30');
  assert.equal(defaultBlockEnd('23:00', 59), '23:59');
});

test('defaultBlockEnd: không hợp lệ → null (không xuyên ngày, không ép)', () => {
  assert.equal(defaultBlockEnd('23:30', 60), null, 'vượt nửa đêm → null');
  assert.equal(defaultBlockEnd('24:00', 60), null, 'giờ sai');
  assert.equal(defaultBlockEnd('09:00', 0), null, 'minutes 0 → null');
  assert.equal(defaultBlockEnd('09:00', -10), null);
  assert.equal(defaultBlockEnd('09:00', null), null);
});

/* ---------------- Old task compatibility ---------------- */

test('old task không có field mới vẫn hợp lệ (đọc như null/[])', () => {
  const old = { uid: 'u1', text: 'x', done: false, tags: [], linkedMetricIds: [] };
  assert.equal(taskEstimatedMinutes(old), null);
  assert.equal(taskEnergy(old), null);
  assert.deepStrictEqual(taskContextIds(old), []);
});

/* ---------------- Storage (load/save) ---------------- */

test('saveContexts/loadContexts: localStorage + Sync.push', () => {
  const calls = [];
  const mem = {};
  global.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
    key: (i) => Object.keys(mem)[i] || null,
    get length() { return Object.keys(mem).length; },
  };
  global.window = { Sync: { push: (k) => calls.push(k) } };
  const store = emptyStore();
  createContext(store, 'School');
  saveContexts(store);
  assert.ok(mem[CONTEXTS_KEY], 'store được ghi');
  assert.deepStrictEqual(calls, [CONTEXTS_KEY], 'Sync.push được gọi');
  assert.equal(loadContexts().contexts.length, 1);
  delete global.localStorage;
  delete global.window;
});

/* ---------------- Wiring (V1.2.1) ---------------- */

test('wiring: app.html nạp contexts.min.js trước app.min.js + cache-bust đúng', () => {
  const ctxIdx = APP.indexOf('js/contexts.min.js?v=1');
  const appIdx = APP.indexOf('js/app.min.js?v=219');
  assert.ok(ctxIdx !== -1, 'contexts.min.js phải được nạp');
  assert.ok(appIdx !== -1, 'app.min.js?v=218');
  assert.ok(ctxIdx < appIdx, 'contexts nạp trước app.min.js');
});

test('wiring: sw.js precache contexts.min.js + cache bump v214', () => {
  assert.ok(SW.includes("'./js/contexts.min.js'"), 'SW precache contexts.min.js');
  assert.ok(SW.includes("const CACHE = 'taskflow-v270'"), 'SW cache bump v231');
});

test('wiring: app.js dispatcher có td-energy / td-ctx-toggle / ctx-* actions', () => {
  ['act === \'td-energy\'', 'act === \'td-ctx-toggle\'', 'act === \'ctx-add\'', 'act === \'ctx-delete\'', 'act === \'ctx-close\''].forEach((s) => {
    assert.ok(APP_JS.includes(s), s + ' phải có trong dispatcher');
  });
});

test('wiring: i18n vi + en có key năng lượng / bối cảnh', () => {
  ['energyLabel', 'energyLow', 'energyMedium', 'energyHigh', 'taskDetailContext', 'ctxManage', 'ctxAdd', 'ctxDeleteConfirm'].forEach((k) => {
    const vi = I18N_JS.indexOf(k + ':');
    const en = I18N_JS.indexOf(k + ':', vi + 1);
    assert.ok(vi !== -1 && en !== -1, k + ' phải có ở cả 2 dict');
  });
});
