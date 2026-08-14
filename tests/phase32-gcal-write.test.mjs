// TaskFlow — V1.6B Google Calendar export: unit tests cho js/gcal.js (mapping + ISO + idempotent).
// Pattern phase30-gcal.test.mjs — import module trực tiếp (UMD, không cần browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import GCal from '../js/gcal.js';

// localStorage mock toàn cục (pattern phase22-timeblocks.test.mjs) — module đọc
// trực tiếp global trong Node; mỗi test reset map riêng.
const _mem = new Map();
global.localStorage = {
  getItem: (k) => (_mem.has(k) ? _mem.get(k) : null),
  setItem: (k, v) => { _mem.set(k, String(v)); },
  removeItem: (k) => { _mem.delete(k); },
};
const resetStore = () => _mem.clear();

const {
  buildBlockISO, loadMappings, saveMappings, upsertMapping, mappingForBlock, exportBlock,
  MAPPINGS_KEY,
} = GCal;

/* ---------------- buildBlockISO (date+HH:mm → ISO instant theo múi giờ máy) ---------------- */

test('buildBlockISO: block hợp lệ → startIso/endIso đúng instant local', () => {
  const iso = buildBlockISO({ date: '2026-08-20', start: '19:00', end: '20:30' });
  assert.ok(iso, 'phải tạo ISO');
  const s = new Date(iso.startIso).getTime();
  const e = new Date(iso.endIso).getTime();
  assert.strictEqual(e - s, 90 * 60 * 1000, '90 phút đúng');
  // Cùng instant với Date(local)
  assert.strictEqual(iso.startIso, new Date(2026, 7, 20, 19, 0, 0, 0).toISOString());
});

test('buildBlockISO: end trước/ bằng start → null (không xuyên ngày)', () => {
  assert.strictEqual(buildBlockISO({ date: '2026-08-20', start: '20:00', end: '20:00' }), null);
  assert.strictEqual(buildBlockISO({ date: '2026-08-20', start: '21:00', end: '20:00' }), null);
});

test('buildBlockISO: date roll-over / thiếu field → null', () => {
  assert.strictEqual(buildBlockISO({ date: '2026-13-40', start: '09:00', end: '10:00' }), null);
  assert.strictEqual(buildBlockISO({ date: '', start: '09:00', end: '10:00' }), null);
  assert.strictEqual(buildBlockISO({ date: '2026-08-20', start: '9:00', end: '10:00' }), null);
  assert.strictEqual(buildBlockISO(null), null);
});

/* ---------------- Mapping mirror (localStorage) ---------------- */

test('loadMappings: chưa có key → store rỗng hợp lệ', () => {
  resetStore();
  const m = loadMappings();
  assert.strictEqual(m.version, 1);
  assert.deepStrictEqual(m.mappings, []);
});

test('loadMappings: store malformed → rỗng (không throw)', () => {
  resetStore();
  localStorage.setItem(MAPPINGS_KEY, '{not json');
  assert.deepStrictEqual(loadMappings().mappings, []);
  localStorage.setItem(MAPPINGS_KEY, JSON.stringify({ version: 99, mappings: [{ x: 1 }] }));
  assert.deepStrictEqual(loadMappings().mappings, [], 'version lạ → reset');
});

test('upsertMapping: thêm mới + cập nhật theo taskflowBlockId, không nhân đôi', () => {
  resetStore();
  upsertMapping({ taskflowBlockId: 'b1', googleEventId: 'ev1', calendarId: 'primary', lastSyncedAt: 't1' });
  upsertMapping({ taskflowBlockId: 'b2', googleEventId: 'ev2', calendarId: 'cal2', lastSyncedAt: 't2' });
  let m = loadMappings().mappings;
  assert.strictEqual(m.length, 2, '2 block → 2 mapping');
  // Upsert cùng block → cập nhật không thêm
  upsertMapping({ taskflowBlockId: 'b1', googleEventId: 'ev1b', calendarId: 'primary', lastSyncedAt: 't3' });
  m = loadMappings().mappings;
  assert.strictEqual(m.length, 2, 'upsert không nhân đôi');
  assert.strictEqual(mappingForBlock('b1').googleEventId, 'ev1b');
  assert.strictEqual(mappingForBlock('b1').lastSyncedAt, 't3');
});

test('mappingForBlock: không tìm thấy → null; thiếu id → null', () => {
  resetStore();
  assert.strictEqual(mappingForBlock('nope'), null);
  assert.strictEqual(mappingForBlock(''), null);
});

/* ---------------- exportBlock — idempotent client-side ---------------- */

test('exportBlock: mapping đã tồn tại → duplicate:true, KHÔNG gọi server (không tạo event lặp)', async () => {
  resetStore();
  upsertMapping({ taskflowBlockId: 'b1', googleEventId: 'ev1', calendarId: 'primary', lastSyncedAt: 't' });
  let calls = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { calls++; throw new Error('must not hit network'); };
  try {
    const res = await exportBlock({ id: 'b1', date: '2026-08-20', start: '09:00', end: '10:00' }, {});
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.duplicate, true);
    assert.strictEqual(res.mapping.googleEventId, 'ev1');
    assert.strictEqual(calls, 0, 'không gọi mạng khi đã export');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('exportBlock: block mới → gọi server, thành công thì lưu mapping', async () => {
  resetStore();
  globalThis.API_CONFIG = { url: 'http://test.local' };
  localStorage.setItem('planner-token', 'tok');
  const origFetch = globalThis.fetch;
  let body = null;
  globalThis.fetch = async (url, init) => {
    body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        duplicate: false,
        mapping: { taskflowBlockId: body.blockId, googleEventId: 'g-new', calendarId: 'primary', lastSyncedAt: 'now' },
      }),
    };
  };
  try {
    const res = await exportBlock({ id: 'b9', date: '2026-08-20', start: '09:00', end: '10:00' }, { title: 'Học Spring' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.duplicate, false);
    assert.strictEqual(body.blockId, 'b9');
    assert.strictEqual(body.title, 'Học Spring');
    assert.ok(body.startIso && body.endIso, 'gửi ISO instant');
    // Mapping đã được lưu vào mirror → lần sau không gọi lại server
    assert.strictEqual(mappingForBlock('b9').googleEventId, 'g-new');
  } finally {
    globalThis.fetch = origFetch;
    delete globalThis.API_CONFIG;
    resetStore();
  }
});

test('exportBlock: range không hợp lệ → 400 local, không gọi mạng', async () => {
  resetStore();
  let calls = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 500, json: async () => ({}) }; };
  try {
    const res = await exportBlock({ id: 'b3', date: '2026-08-20', start: '20:00', end: '20:00' }, {});
    assert.strictEqual(res.ok, false);
    assert.strictEqual(calls, 0, 'không gọi server khi range sai');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('exportBlock: server trả 403 write-scope-required → ok:false, không lưu mapping', async () => {
  resetStore();
  globalThis.API_CONFIG = { url: 'http://test.local' };
  localStorage.setItem('planner-token', 'tok');
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: 'write-scope-required' }) });
  try {
    const res = await exportBlock({ id: 'b4', date: '2026-08-20', start: '09:00', end: '10:00' }, {});
    assert.strictEqual(res.status, 403);
    assert.strictEqual(mappingForBlock('b4'), null, '403 → không ghi mapping');
  } finally {
    globalThis.fetch = origFetch;
    delete globalThis.API_CONFIG;
    resetStore();
  }
});

/* ---------------- saveMappings tồn tại như API công khai ---------------- */

test('saveMappings: ghi trực tiếp store', () => {
  resetStore();
  saveMappings([{ taskflowBlockId: 'z', googleEventId: 'evz' }]);
  assert.strictEqual(loadMappings().mappings.length, 1);
  resetStore();
});
