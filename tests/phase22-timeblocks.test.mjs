// TaskFlow — V1.2 Time Blocking: unit tests cho js/timeblocks.js (store thuần).
// Pattern phase21-projects.test.mjs — import module trực tiếp (UMD, không cần browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import TimeBlocks from '../js/timeblocks.js';

const {
  TIMEBLOCKS_KEY, STORE_VERSION, migrateTimeBlocks, loadTimeBlocks, saveTimeBlocks,
  getBlock, blocksForDate, blocksForTask, createTimeBlock, updateTimeBlock,
  deleteTimeBlock, setTimeBlockStatus, findOverlaps, removeTaskBlocks,
  sanitizeSnapshotRefs, resolveTaskRef, toMinutes, validRange,
} = TimeBlocks;

function emptyStore() {
  return { version: STORE_VERSION, blocks: [] };
}

function makeBlock(store, over) {
  const b = createTimeBlock(store, {
    taskUid: 'task_alpha', date: '2026-08-20', start: '09:00', end: '10:30', ...over,
  });
  return b;
}

/* ---------------- CRUD ---------------- */

test('createTimeBlock: tạo block id ổn định, status mặc định planned, taskUid tuỳ chọn', () => {
  const store = emptyStore();
  const b = makeBlock(store, { taskUid: null });
  assert.ok(b.id.startsWith('block_'), 'id phải có prefix block_');
  assert.equal(b.taskUid, null, 'taskUid mặc định null khi không truyền');
  assert.equal(b.status, 'planned', 'status mặc định planned');
  assert.equal(b.date, '2026-08-20');
  assert.equal(b.start, '09:00');
  assert.equal(b.end, '10:30');
  assert.equal(store.blocks.length, 1, 'block phải vào store');
  assert.equal(getBlock(store, b.id).id, b.id, 'getBlock phải tìm được');
});

test('createTimeBlock: taskUid + status được tôn trọng', () => {
  const store = emptyStore();
  const b = createTimeBlock(store, { taskUid: 'task_beta', date: '2026-08-21', start: '08:00', end: '08:30', status: 'completed' });
  assert.equal(b.taskUid, 'task_beta');
  assert.equal(b.status, 'completed');
});

test('createTimeBlock: range không hợp lệ → null, không đổi store', () => {
  const store = emptyStore();
  assert.equal(createTimeBlock(store, { date: '2026-08-20', start: '10:30', end: '09:00' }), null, 'end < start bị từ chối');
  assert.equal(createTimeBlock(store, { date: '2026-08-20', start: '09:00', end: '09:00' }), null, 'end == start bị từ chối');
  assert.equal(createTimeBlock(store, { date: '2026-08-20', start: '25:00', end: '09:00' }), null, 'giờ sai định dạng');
  assert.equal(createTimeBlock(store, { date: '20-08-2026', start: '09:00', end: '10:00' }), null, 'ngày sai định dạng');
  assert.equal(store.blocks.length, 0, 'không có block lỗi nào vào store');
});

test('createTimeBlock: không hỗ trợ xuyên ngày — end "00:00" bị từ chối (midnight edge)', () => {
  const store = emptyStore();
  assert.equal(createTimeBlock(store, { date: '2026-08-20', start: '23:00', end: '00:00' }), null, 'end 00:00 = start kế tiếp → không hợp lệ');
  // start 00:00 hợp lệ (đầu ngày)
  const b = createTimeBlock(store, { date: '2026-08-20', start: '00:00', end: '00:30' });
  assert.ok(b, 'start 00:00 hợp lệ');
});

test('toMinutes / validRange: edge hợp lệ', () => {
  assert.equal(toMinutes('00:00'), 0);
  assert.equal(toMinutes('23:59'), 1439);
  assert.equal(toMinutes('24:00'), null);
  assert.equal(toMinutes('9:00'), null, 'phải đủ 2 chữ số giờ');
  assert.equal(validRange('09:00', '10:00'), true);
  assert.equal(validRange('10:00', '09:00'), false);
  assert.equal(validRange('09:00', '09:00'), false);
});

test('updateTimeBlock: patch từng phần, validate lại range', () => {
  const store = emptyStore();
  const b = makeBlock(store);
  const u = updateTimeBlock(store, b.id, { end: '11:00' });
  assert.equal(u.end, '11:00', 'end phải được sửa');
  assert.equal(u.taskUid, 'task_alpha', 'taskUid không đổi khi không patch');
  assert.equal(store.blocks.length, 1);
  // range mới không hợp lệ → null, state KHÔNG đổi
  assert.equal(updateTimeBlock(store, b.id, { end: '08:00' }), null, 'end < start hiện tại → từ chối');
  assert.equal(getBlock(store, b.id).end, '11:00', 'block không bị đổi khi update thất bại');
  // date mới không hợp lệ → từ chối
  assert.equal(updateTimeBlock(store, b.id, { date: 'x' }), null);
});

test('updateTimeBlock: status lạ → null, không đổi state', () => {
  const store = emptyStore();
  const b = makeBlock(store);
  assert.equal(updateTimeBlock(store, b.id, { status: 'weird' }), null);
  assert.equal(getBlock(store, b.id).status, 'planned');
});

test('setTimeBlockStatus: completed / cancelled / reopen', () => {
  const store = emptyStore();
  const b = makeBlock(store);
  setTimeBlockStatus(store, b.id, 'completed');
  assert.equal(getBlock(store, b.id).status, 'completed');
  setTimeBlockStatus(store, b.id, 'cancelled');
  assert.equal(getBlock(store, b.id).status, 'cancelled');
  setTimeBlockStatus(store, b.id, 'planned');
  assert.equal(getBlock(store, b.id).status, 'planned');
  assert.equal(setTimeBlockStatus(store, b.id, 'bad'), null, 'status lạ bị từ chối');
});

test('deleteTimeBlock: xoá block, KHÔNG đụng task', () => {
  const store = emptyStore();
  const b1 = makeBlock(store);
  const b2 = makeBlock(store, { start: '14:00', end: '15:00' });
  const removed = deleteTimeBlock(store, b1.id);
  assert.equal(removed.id, b1.id, 'trả block đã xoá');
  assert.equal(store.blocks.length, 1, 'chỉ còn block còn lại');
  assert.equal(getBlock(store, b2.id).id, b2.id, 'block kia giữ nguyên');
  assert.equal(deleteTimeBlock(store, 'block_nope'), null);
});

test('blocksForDate / blocksForTask: lọc đúng', () => {
  const store = emptyStore();
  const b1 = makeBlock(store, { date: '2026-08-20', taskUid: 'task_alpha' });
  makeBlock(store, { date: '2026-08-21', taskUid: 'task_alpha' });
  makeBlock(store, { date: '2026-08-20', taskUid: 'task_beta' });
  assert.equal(blocksForDate(store, '2026-08-20').length, 2);
  assert.equal(blocksForTask(store, 'task_alpha').length, 2);
  assert.equal(blocksForTask(store, 'task_beta').length, 1);
  assert.equal(blocksForTask(store, 'task_gamma').length, 0);
});

/* ---------------- Overlap ---------------- */

test('findOverlaps: phát hiện trùng thật', () => {
  const store = emptyStore();
  makeBlock(store, { date: '2026-08-20', start: '09:00', end: '10:30' });
  const hits = findOverlaps(store, '2026-08-20', '10:00', '11:00');
  assert.equal(hits.length, 1, '10:00-11:00 trùng 09:00-10:30');
});

test('findOverlaps: back-to-back KHÔNG trùng (nửa-mở [start,end))', () => {
  const store = emptyStore();
  makeBlock(store, { date: '2026-08-20', start: '09:00', end: '10:00' });
  assert.equal(findOverlaps(store, '2026-08-20', '10:00', '11:00').length, 0, '10:00 bắt đầu đúng lúc block cũ kết thúc → không trùng');
});

test('findOverlaps: cancelled không tranh chấp lịch', () => {
  const store = emptyStore();
  makeBlock(store, { date: '2026-08-20', start: '09:00', end: '10:30', status: 'cancelled' });
  assert.equal(findOverlaps(store, '2026-08-20', '09:30', '10:00').length, 0, 'block cancelled bị bỏ qua');
});

test('findOverlaps: ignoreId bỏ qua chính block đang sửa', () => {
  const store = emptyStore();
  const b = makeBlock(store, { date: '2026-08-20', start: '09:00', end: '10:30' });
  assert.equal(findOverlaps(store, '2026-08-20', '09:30', '10:00', b.id).length, 0, 'ignore chính nó');
});

test('findOverlaps: khác date → không trùng', () => {
  const store = emptyStore();
  makeBlock(store, { date: '2026-08-20', start: '09:00', end: '10:30' });
  assert.equal(findOverlaps(store, '2026-08-21', '09:30', '10:00').length, 0);
});

/* ---------------- Task deletion cleanup ---------------- */

test('removeTaskBlocks: xoá toàn bộ block của task đã xoá, giữ block khác', () => {
  const store = emptyStore();
  makeBlock(store, { taskUid: 'task_alpha' });
  makeBlock(store, { taskUid: 'task_alpha', start: '14:00', end: '15:00' });
  makeBlock(store, { taskUid: 'task_beta' });
  const n = removeTaskBlocks(store, 'task_alpha');
  assert.equal(n, 2, 'trả số block đã xoá');
  assert.equal(store.blocks.length, 1, 'chỉ còn block của task_beta');
  assert.equal(store.blocks[0].taskUid, 'task_beta');
  assert.equal(removeTaskBlocks(store, 'task_gamma'), 0, 'uid không tồn tại → 0');
});

/* ---------------- Migration ---------------- */

test('migrateTimeBlocks: thiếu key → store rỗng hợp lệ', () => {
  const { store, changed } = migrateTimeBlocks(null);
  assert.deepStrictEqual(store, { version: STORE_VERSION, blocks: [] });
  assert.equal(changed, true);
  assert.deepStrictEqual(migrateTimeBlocks(undefined).store.blocks, []);
  assert.deepStrictEqual(migrateTimeBlocks('junk').store.blocks, []);
});

test('migrateTimeBlocks: store hợp lệ giữ nguyên + idempotent', () => {
  const raw = { version: 1, blocks: [{ id: 'block_1', taskUid: 'task_a', date: '2026-08-20', start: '09:00', end: '10:00', status: 'planned', createdAt: 'x', updatedAt: 'x' }] };
  const first = migrateTimeBlocks(raw);
  assert.equal(first.store.blocks.length, 1);
  assert.equal(first.changed, false, 'store hợp lệ → không changed');
  const second = migrateTimeBlocks(first.store);
  assert.equal(second.changed, false, 'chạy lại → idempotent, 0 thay đổi');
  assert.equal(second.store.blocks[0].id, 'block_1', 'id giữ nguyên');
});

test('migrateTimeBlocks: record malformed bị bỏ qua từng record, KHÔNG xoá cả store', () => {
  const raw = {
    version: 1,
    blocks: [
      { id: 'block_1', date: '2026-08-20', start: '09:00', end: '10:00' },          // hợp lệ
      { id: 'block_2', date: '2026-08-20', start: '11:00', end: '10:00' },          // end < start → bỏ
      'junk',                                                                        // không phải object → bỏ
      null,
      { id: 'block_3', date: '2026-08-20', start: '08:00', end: '08:30', status: 'completed' }, // hợp lệ
    ],
  };
  const { store, changed } = migrateTimeBlocks(raw);
  assert.equal(store.blocks.length, 2, 'chỉ giữ 2 record hợp lệ');
  assert.equal(changed, true, 'có malformed → changed true');
  assert.equal(store.blocks[0].id, 'block_1');
  assert.equal(store.blocks[1].id, 'block_3');
});

test('migrateTimeBlocks: status lạ → mặc định planned, không bỏ record', () => {
  const raw = { version: 1, blocks: [{ id: 'block_1', date: '2026-08-20', start: '09:00', end: '10:00', status: 'foo' }] };
  const { store } = migrateTimeBlocks(raw);
  assert.equal(store.blocks[0].status, 'planned');
});

/* ---------------- Import sanitization ---------------- */

function snapshotWithBlocks(blocks, tasks) {
  return {
    app: 'taskflow-todoist', version: 2, exportedAt: new Date().toISOString(),
    keys: {
      [TIMEBLOCKS_KEY]: JSON.stringify({ version: 1, blocks }),
      'planner-inbox': JSON.stringify(tasks),
    },
  };
}

test('sanitizeSnapshotRefs: block trỏ task không tồn tại → clear taskUid, GIỮ block', () => {
  const snap = snapshotWithBlocks(
    [{ id: 'block_1', taskUid: 'task_ghost', date: '2026-08-20', start: '09:00', end: '10:00', status: 'planned' }],
    [{ uid: 'task_real', text: 'exists', done: false }]
  );
  const out = sanitizeSnapshotRefs(snap);
  const blocks = JSON.parse(out.keys[TIMEBLOCKS_KEY]).blocks;
  assert.equal(blocks.length, 1, 'block được giữ');
  assert.equal(blocks[0].taskUid, null, 'taskUid ghost → null');
  assert.equal(blocks[0].start, '09:00', 'giờ/ngày giữ nguyên');
});

test('sanitizeSnapshotRefs: taskUid hợp lệ trong snapshot → giữ nguyên', () => {
  const snap = snapshotWithBlocks(
    [{ id: 'block_1', taskUid: 'task_real', date: '2026-08-20', start: '09:00', end: '10:00', status: 'planned' }],
    [{ uid: 'task_real', text: 'exists', done: false }]
  );
  const out = sanitizeSnapshotRefs(snap);
  assert.equal(JSON.parse(out.keys[TIMEBLOCKS_KEY]).blocks[0].taskUid, 'task_real');
});

test('sanitizeSnapshotRefs: không có key timeblocks → snapshot giữ nguyên', () => {
  const snap = { app: 'taskflow-todoist', version: 2, keys: { 'planner-inbox': '[]' } };
  const out = sanitizeSnapshotRefs(snap);
  assert.deepStrictEqual(out, snap, 'nội dung snapshot không đổi khi không có key timeblocks');
});

/* ---------------- Round trip (export → import) ---------------- */

test('round-trip: export → import giữ block, taskUid, giờ, status, UID', () => {
  const store = emptyStore();
  const b1 = makeBlock(store, { taskUid: 'task_a', status: 'planned' });
  const b2 = makeBlock(store, { taskUid: 'task_a', start: '14:00', end: '15:00', status: 'completed' });
  const taskA = { uid: 'task_a', text: 'Học Spring Boot', done: false };
  const snapshot = {
    app: 'taskflow-todoist', version: 2, exportedAt: new Date().toISOString(),
    keys: {
      [TIMEBLOCKS_KEY]: JSON.stringify(store),
      'planner-2026-8': JSON.stringify({
        schemaVersion: 2, monthlyGoals: [], habits: [],
        weeks: [{ n: 1, goals: [], days: [{ date: '1/8/26', yy: 26, sticky: null, note: '', tasks: [taskA] }] }],
      }),
    },
  };
  // import side (như prepareImport): sanitize → migrate
  const imported = sanitizeSnapshotRefs(snapshot);
  const { store: storeIn } = migrateTimeBlocks(JSON.parse(imported.keys[TIMEBLOCKS_KEY]));
  assert.equal(storeIn.blocks.length, 2, 'cả 2 block tồn tại sau round-trip');
  assert.deepStrictEqual(storeIn.blocks.map((b) => b.id).sort(), [b1.id, b2.id].sort(), 'block UID giữ nguyên');
  const a = storeIn.blocks.find((b) => b.id === b1.id);
  const c = storeIn.blocks.find((b) => b.id === b2.id);
  assert.equal(a.taskUid, 'task_a', 'taskUid giữ nguyên');
  assert.equal(a.start, '09:00');
  assert.equal(a.end, '10:30');
  assert.equal(a.status, 'planned');
  assert.equal(c.status, 'completed', 'status giữ nguyên');
});

/* ---------------- resolveTaskRef ---------------- */

test('resolveTaskRef: tìm task trong weeks (week/day/task)', () => {
  const state = { weeks: [{ n: 3, days: [{ tasks: [{ uid: 'u1', text: 'a' }] }, { tasks: [] }, { tasks: [{ uid: 'u2', text: 'b' }] }] }] };
  assert.deepStrictEqual(resolveTaskRef('u2', state, []), { week: 3, day: 2, task: 0 });
  assert.deepStrictEqual(resolveTaskRef('u1', state, []), { week: 3, day: 0, task: 0 });
});

test('resolveTaskRef: tìm task trong inbox (scope inbox)', () => {
  const inbox = [{ uid: 'u9', text: 'in' }];
  assert.deepStrictEqual(resolveTaskRef('u9', { weeks: [] }, inbox), { scope: 'inbox', index: 0 });
});

test('resolveTaskRef: uid không tồn tại → null', () => {
  assert.equal(resolveTaskRef('nope', { weeks: [] }, []), null);
  assert.equal(resolveTaskRef('', { weeks: [] }, []), null);
  assert.equal(resolveTaskRef(null, { weeks: [] }, []), null);
});

/* ---------------- Storage (load/save với localStorage mock) ---------------- */

test('saveTimeBlocks/loadTimeBlocks: ghi đọc qua localStorage, Sync.push được gọi', () => {
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
  makeBlock(store);
  saveTimeBlocks(store);
  assert.ok(mem[TIMEBLOCKS_KEY], 'store phải được ghi vào localStorage');
  assert.deepStrictEqual(calls, [TIMEBLOCKS_KEY], 'Sync.push phải được gọi với key');
  const loaded = loadTimeBlocks();
  assert.equal(loaded.blocks.length, 1, 'load lại phải đọc được block');
  delete global.localStorage;
  delete global.window;
});
