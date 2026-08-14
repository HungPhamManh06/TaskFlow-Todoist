// TaskFlow — V1.6A Google Calendar read-only: unit tests cho js/gcal.js (module thuần).
// Pattern phase22-timeblocks.test.mjs — import module trực tiếp (UMD, không cần browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import GCal from '../js/gcal.js';

const {
  normalizeEvents, localDayRange, eventsForDate, busyForDate, mergeAndSort,
  cacheValid, toLocalHHMM,
} = GCal;

/* ---------------- normalizeEvents ---------------- */

test('normalizeEvents: timed event với offset timezone → startMs/endMs đúng giờ địa phương', () => {
  // 2026-08-20 19:00 +07:00 = 12:00 UTC; máy test ở local (giả định máy dev dùng múi giờ máy).
  const items = [{
    id: 'ev1',
    summary: 'Họp đội',
    start: { dateTime: '2026-08-20T19:00:00+07:00' },
    end: { dateTime: '2026-08-20T20:00:00+07:00' },
  }];
  const evs = normalizeEvents(items, 'primary');
  assert.strictEqual(evs.length, 1);
  const e = evs[0];
  assert.strictEqual(e.id, 'ev1');
  assert.strictEqual(e.allDay, false);
  assert.strictEqual(e.key, 'primary:ev1');
  assert.ok(e.endMs > e.startMs, 'end sau start');
  assert.strictEqual(new Date(e.startMs).toISOString(), new Date('2026-08-20T19:00:00+07:00').toISOString());
});

test('normalizeEvents: all-day event — date inclusive, end exclusive → đúng ranh giới ngày local', () => {
  const items = [{
    id: 'ev2',
    summary: 'Nghỉ lễ',
    start: { date: '2026-09-02' },
    end: { date: '2026-09-03' },
  }];
  const evs = normalizeEvents(items, 'work');
  assert.strictEqual(evs.length, 1);
  const e = evs[0];
  assert.strictEqual(e.allDay, true);
  const day = localDayRange('2026-09-02');
  assert.strictEqual(e.startMs, day.startMs, 'bắt đầu từ 00:00 local của ngày start');
  assert.strictEqual(e.endMs, day.endMs, 'kết thúc 00:00 local ngày sau (exclusive)');
});

test('normalizeEvents: event thiếu start/end hoặc id → bỏ qua (null-safe)', () => {
  assert.deepStrictEqual(normalizeEvents([null, { id: 'x' }, {}], 'primary'), []);
});

test('normalizeEvents: _calendarId từ server thắng calendarId mặc định', () => {
  const evs = normalizeEvents([{ id: 'a', _calendarId: 'cal2', start: { date: '2026-09-02' }, end: { date: '2026-09-03' } }], 'primary');
  assert.strictEqual(evs[0].key, 'cal2:a');
});

test('normalizeEvents: summary quá dài bị cắt 500 ký tự, không throw', () => {
  const evs = normalizeEvents([{ id: 'b', summary: 'x'.repeat(1000), start: { date: '2026-09-02' }, end: { date: '2026-09-03' } }], 'primary');
  assert.strictEqual(evs[0].summary.length, 500);
});

/* ---------------- localDayRange / eventsForDate ---------------- */

test("localDayRange: 'YYYY-MM-DD' hợp lệ → start 00:00 local, end +24h; sai format → null", () => {
  const r = localDayRange('2026-08-20');
  assert.ok(r);
  assert.strictEqual(new Date(r.startMs).getHours(), 0);
  assert.strictEqual(r.endMs - r.startMs, 24 * 60 * 60 * 1000);
  assert.strictEqual(localDayRange('2026-13-40'), null);
  assert.strictEqual(localDayRange('garbage'), null);
});

test('eventsForDate: chỉ lấy event giao với ngày local (kể cả xuyên đêm)', () => {
  // event 23:00–01:00 (xuyên nửa đêm) phải xuất hiện ở cả 2 ngày
  const items = [{
    id: 'night',
    summary: 'Xuyên đêm',
    start: { dateTime: '2026-08-20T23:00:00' },
    end: { dateTime: '2026-08-21T01:00:00' },
  }, {
    id: 'day',
    summary: 'Ban ngày',
    start: { dateTime: '2026-08-21T10:00:00' },
    end: { dateTime: '2026-08-21T11:00:00' },
  }];
  const evs = normalizeEvents(items, 'primary');
  assert.strictEqual(eventsForDate(evs, '2026-08-20').map((e) => e.id).join(','), 'night');
  assert.strictEqual(eventsForDate(evs, '2026-08-21').map((e) => e.id).sort().join(','), 'day,night');
});

/* ---------------- busyForDate (planner) ---------------- */

test('busyForDate: timed events → busy windows HH:mm, clamp vào ngày, bỏ all-day', () => {
  const items = [
    { id: 'm1', summary: 'Họp 1', start: { dateTime: '2026-08-20T09:00:00+07:00' }, end: { dateTime: '2026-08-20T10:00:00+07:00' } },
    { id: 'm2', summary: 'Họp 2', start: { dateTime: '2026-08-20T13:00:00+07:00' }, end: { dateTime: '2026-08-20T14:30:00+07:00' } },
    { id: 'al', summary: 'Cả ngày', start: { date: '2026-08-20' }, end: { date: '2026-08-21' } },
  ];
  const evs = normalizeEvents(items, 'primary');
  const busy = busyForDate(evs, '2026-08-20');
  assert.strictEqual(busy.length, 2, 'all-day không vào busy windows');
  assert.ok(busy.every((b) => b._gcal === true));
  // so sánh theo giờ local — lấy từ event đã normalize (startMs local)
  const h1 = toLocalHHMM(evs[0].startMs);
  const h2 = toLocalHHMM(evs[1].startMs);
  assert.strictEqual(busy[0].start, h1);
  assert.strictEqual(busy[1].start, h2);
  assert.strictEqual(busy[1].end, toLocalHHMM(evs[1].endMs));
});

test('busyForDate: clamp event chạy quá nửa đêm vào cuối ngày', () => {
  const items = [{
    id: 'night',
    summary: 'Xuyên đêm',
    start: { dateTime: '2026-08-20T23:00:00' },
    end: { dateTime: '2026-08-21T02:00:00' },
  }];
  const evs = normalizeEvents(items, 'primary');
  const busy = busyForDate(evs, '2026-08-20');
  assert.strictEqual(busy.length, 1);
  assert.strictEqual(busy[0].end, '23:59', 'clamp vào 23:59 của ngày (start < end giữ đúng)');
  // Ngày sau: start clamp về 00:00
  const busy2 = busyForDate(evs, '2026-08-21');
  assert.ok(busy2.length >= 1);
});

/* ---------------- mergeAndSort ---------------- */

test('mergeAndSort: dedup theo key + sort theo startMs', () => {
  const a = normalizeEvents([
    { id: 'e1', _calendarId: 'c1', start: { dateTime: '2026-08-20T10:00:00Z' }, end: { dateTime: '2026-08-20T11:00:00Z' } },
    { id: 'e2', _calendarId: 'c2', start: { dateTime: '2026-08-20T09:00:00Z' }, end: { dateTime: '2026-08-20T10:00:00Z' } },
    { id: 'e1', _calendarId: 'c1', start: { dateTime: '2026-08-20T10:00:00Z' }, end: { dateTime: '2026-08-20T11:00:00Z' } },
  ], 'primary');
  const out = mergeAndSort(a);
  assert.strictEqual(out.length, 2, 'e1 trùng bị dedup');
  assert.strictEqual(out[0].id, 'e2', 'bắt đầu sớm hơn đứng trước');
});

test('mergeAndSort: mảng rỗng / null → []', () => {
  assert.deepStrictEqual(mergeAndSort(null), []);
  assert.deepStrictEqual(mergeAndSort([]), []);
});

/* ---------------- cache ---------------- */

test('cacheValid: fetchedAt cũ hơn TTL → false; mới → true; thiếu → false', () => {
  const fresh = { fetchedAt: new Date(Date.now() - 60 * 1000).toISOString() };
  assert.strictEqual(cacheValid(fresh, 15 * 60 * 1000), true);
  const stale = { fetchedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
  assert.strictEqual(cacheValid(stale, 15 * 60 * 1000), false);
  assert.strictEqual(cacheValid({ fetchedAt: null }, 15 * 60 * 1000), false);
  assert.strictEqual(cacheValid(null, 15 * 60 * 1000), false);
});

/* ---------------- DST (giả định máy dev) ---------------- */

test('normalizeEvents: offset timezone khác nhau giữa 2 event được giữ đúng (không cắt theo UTC)', () => {
  // Event 09:00+07 và event 09:00+08: cùng giờ wall-clock nhưng lệch đúng 1h thực —
  // Date.parse phải giữ nguyên chênh lệch; toLocalHHMM render theo giờ máy nên chỉ
  // kiểm tra delta ms, không kiểm tra giờ hiển thị.
  const items = [
    { id: 'd1', summary: 'A', start: { dateTime: '2026-03-29T09:00:00+07:00' }, end: { dateTime: '2026-03-29T10:00:00+07:00' } },
    { id: 'd2', summary: 'B', start: { dateTime: '2026-03-29T09:00:00+08:00' }, end: { dateTime: '2026-03-29T10:00:00+08:00' } },
  ];
  const evs = normalizeEvents(items, 'primary');
  assert.strictEqual(Math.abs(evs[1].startMs - evs[0].startMs), 60 * 60 * 1000, 'cùng wall-clock 09:00 lệch đúng 1h thực giữa 2 offset');
  assert.strictEqual(evs[0].endMs - evs[0].startMs, 60 * 60 * 1000);
  assert.strictEqual(evs[1].endMs - evs[1].startMs, 60 * 60 * 1000);
});
