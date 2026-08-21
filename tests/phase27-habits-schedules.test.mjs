// TaskFlow V1.4 — Flexible Habit Schedules.
// Test: normalizeSchedule/scheduleOf, due-day logic, periodProgress (daily/weekdays/
// weekly_count/monthly_count), consistencyPct, runInfo, migration (ensureHabitSchedules)
// + wiring (xp habitPct delegate, app.html modal, SW cache v217).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const H = (await import('../js/habits.js')).default || (await import('../js/habits.js'));
const M = (await import('../js/data-migrations.js')).default || (await import('../js/data-migrations.js'));
const XP = (await import('../js/xp.js')).default || (await import('../js/xp.js'));

const APP = readFileSync('app.html', 'utf8');
const SW = readFileSync('sw.js', 'utf8');
const APPJS = readFileSync('js/app.js', 'utf8');
const I18N = readFileSync('js/i18n.js', 'utf8');

// Fixture: February 2024 (năm nhuận, 29 ngày). Thứ 2 = 5/2.
const FEB = 2024, FEBM = 1, FEB_DAYS = 29;
function febDays() { return Array(FEB_DAYS).fill(false); }

test('normalizeSchedule: hợp lệ daily/weekdays/weekly_count/monthly_count', () => {
  assert.deepEqual(H.normalizeSchedule({ type: 'daily' }), { type: 'daily' });
  assert.deepEqual(H.normalizeSchedule({ type: 'weekdays', days: [1, 3, 5] }), { type: 'weekdays', days: [1, 3, 5] });
  assert.deepEqual(H.normalizeSchedule({ type: 'weekly_count', count: 4 }), { type: 'weekly_count', count: 4 });
  assert.deepEqual(H.normalizeSchedule({ type: 'monthly_count', count: 12 }), { type: 'monthly_count', count: 12 });
  // de-dupe + sort
  assert.deepEqual(H.normalizeSchedule({ type: 'weekdays', days: [5, 1, 3, 1] }), { type: 'weekdays', days: [1, 3, 5] });
});

test('normalizeSchedule: malformed → null', () => {
  assert.equal(H.normalizeSchedule(null), null);
  assert.equal(H.normalizeSchedule({}), null);
  assert.equal(H.normalizeSchedule({ type: 'weekly' }), null);
  assert.equal(H.normalizeSchedule({ type: 'weekdays', days: [] }), null);
  assert.equal(H.normalizeSchedule({ type: 'weekdays', days: [0, 8, 3] }), null); // 0 & 8 ngoài 1..7
  assert.equal(H.normalizeSchedule({ type: 'weekly_count', count: 0 }), null);
  assert.equal(H.normalizeSchedule({ type: 'weekly_count', count: -3 }), null);
  assert.equal(H.normalizeSchedule({ type: 'weekly_count', count: 1.5 }), null);
  assert.equal(H.normalizeSchedule({ type: 'weekly_count', count: 32 }), null);
  assert.equal(H.normalizeSchedule({ type: 'monthly_count', count: 94 }), null);
  assert.equal(H.normalizeSchedule({ type: 'monthly_count', count: '12' }), null); // không phải int
  assert.equal(H.normalizeSchedule([1, 2]), null);
});

test('scheduleOf: legacy habit → daily; malformed → daily; valid → chuẩn hoá', () => {
  assert.deepEqual(H.scheduleOf({}), { type: 'daily' });
  assert.deepEqual(H.scheduleOf({ schedule: null }), { type: 'daily' });
  assert.deepEqual(H.scheduleOf({ schedule: { type: 'garbage' } }), { type: 'daily' });
  assert.deepEqual(H.scheduleOf({ schedule: { type: 'weekdays', days: [2, 4] } }), { type: 'weekdays', days: [2, 4] });
  assert.deepEqual(H.scheduleOf({ schedule: { type: 'weekly_count', count: 3 } }), { type: 'weekly_count', count: 3 });
});

test('weekday1: 1=Thứ 2 .. 7=Chủ nhật (local date)', () => {
  assert.equal(H.weekday1(new Date(2024, 1, 5)), 1);  // Thứ 2
  assert.equal(H.weekday1(new Date(2024, 1, 11)), 7); // Chủ nhật
  assert.equal(H.weekday1(new Date(2024, 1, 1)), 4);  // Thứ 5
  assert.equal(H.weekday1(new Date(2024, 1, 29)), 4); // 29/2 nhuận cũng Thứ 5
});

test('dueDayIndexes: chỉ đưa ngày thuộc thứ đã chọn', () => {
  const due = H.dueDayIndexes({ type: 'weekdays', days: [1, 3, 5] }, FEB, FEBM, FEB_DAYS);
  assert.deepEqual(due.slice(0, 5), [1, 4, 6, 8, 11]); // 5/2(T2), 7/2(T4), 9/2(T6), 12/2...
  due.forEach((i) => assert.ok([1, 3, 5].includes(H.weekday1(new Date(FEB, FEBM, i + 1)))));
});

test('isDueToday: daily luôn, weekdays theo thứ, count không ràng buộc ngày', () => {
  const s = { type: 'weekdays', days: [1, 3, 5] };
  assert.equal(H.isDueToday(s, new Date(2024, 1, 7)), true);  // Thứ 4
  assert.equal(H.isDueToday(s, new Date(2024, 1, 8)), false); // Thứ 5
  assert.equal(H.isDueToday({ type: 'daily' }, new Date(2024, 1, 8)), true);
  assert.equal(H.isDueToday({ type: 'weekly_count', count: 4 }, new Date(2024, 1, 8)), false);
  assert.equal(H.isDueToday({ type: 'monthly_count', count: 12 }, new Date(2024, 1, 8)), false);
});

test('periodProgress daily: giữ ngữ nghĩa target % legacy', () => {
  // target 100, elapsed 10, 5 ngày làm → 50%
  const d = febDays(); [0, 1, 2, 3, 4].forEach((i) => { d[i] = true; });
  assert.deepEqual(H.periodProgress({ type: 'daily' }, d, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 10)),
    { done: 5, required: 10, pct: 50 });
  // target 50, elapsed 10, 5 ngày làm → 100%
  assert.deepEqual(H.periodProgress({ type: 'daily' }, d, 50, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 10)),
    { done: 5, required: 5, pct: 100 });
  // thiếu target → mặc định 100
  assert.deepEqual(H.periodProgress({ type: 'daily' }, d, undefined, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 10)),
    { done: 5, required: 10, pct: 50 });
});

test('periodProgress weekdays: chỉ đếm ngày đến hạn đã trôi qua', () => {
  // schedule T2/T4/T6 (days [1,3,5]). Feb 2024: 2/2 (T6), 5/2 (T2), 7/2 (T4), 9/2 (T6)
  // → 4 ngày due đã qua tính tới 10/2 (chỉ số 1,4,6,8).
  const d = febDays(); [4, 6, 8].forEach((i) => { d[i] = true; }); // tick 3/4 ngày due
  const r = H.periodProgress({ type: 'weekdays', days: [1, 3, 5] }, d, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 10));
  assert.equal(r.done, 3); assert.equal(r.required, 4); assert.equal(r.pct, 75);
  // tick ngày KHÔNG due (Thứ 7 10/2, index 9) → không tính
  d[9] = true;
  assert.equal(H.periodProgress({ type: 'weekdays', days: [1, 3, 5] }, d, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 10)).done, 3);
});

test('periodProgress weekly_count: tuần dương lịch (Mon-Sun), ranh giới tháng', () => {
  // Tuần 5/2-11/2. now = 7/2 (Thứ 4). Tick T2 5/2 + T3 6/2 = 2/4.
  const d = febDays(); d[4] = true; d[5] = true;
  const r = H.periodProgress({ type: 'weekly_count', count: 4 }, d, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 7));
  assert.deepEqual(r, { done: 2, required: 4, pct: 50 });
  // Tick Chủ nhật 4/2 (tuần TRƯỚC) → không tính vào tuần hiện tại
  d[3] = true;
  assert.deepEqual(H.periodProgress({ type: 'weekly_count', count: 4 }, d, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 7)),
    { done: 2, required: 4, pct: 50 });
  // Ranh giới tháng: now = 1/3/2024 (Thứ 6) — tuần hiện tại 26/2-3/3; 29/2 (index 28) tính
  const dFeb = febDays(); dFeb[28] = true; // Thứ 5 29/2
  const r2 = H.periodProgress({ type: 'weekly_count', count: 4 }, dFeb, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 2, 1));
  assert.equal(r2.done, 1); assert.equal(r2.pct, 25);
  // 25/2 (Chủ nhật tuần trước, index 24) không tính
  dFeb[24] = true;
  assert.equal(H.periodProgress({ type: 'weekly_count', count: 4 }, dFeb, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 2, 1)).done, 1);
});

test('periodProgress monthly_count: đếm trong tháng, cap 100', () => {
  const d = febDays(); for (let i = 0; i < 6; i++) d[i] = true;
  assert.deepEqual(H.periodProgress({ type: 'monthly_count', count: 12 }, d, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 10)),
    { done: 6, required: 12, pct: 50 });
  // vượt mục tiêu → 100 (cap)
  const d2 = febDays(); for (let i = 0; i < 14; i++) d2[i] = true;
  assert.equal(H.periodProgress({ type: 'monthly_count', count: 12 }, d2, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 10)).pct, 100);
});

test('periodProgress: leap year / month length (29/2) và tháng không nhuận', () => {
  // 2023-02: 28 ngày — tick đủ 28/28 → 100%
  const d = Array(28).fill(false);
  for (let i = 0; i < 28; i++) d[i] = true;
  assert.equal(H.periodProgress({ type: 'monthly_count', count: 28 }, d, 100, 2023, 1, 28, new Date(2023, 1, 28)).pct, 100);
  // 2024-02 nhuận: elapsed 29 vào 29/2
  const d2 = febDays(); for (let i = 0; i < 29; i++) d2[i] = true;
  const r = H.periodProgress({ type: 'daily' }, d2, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 29));
  assert.equal(r.required, 29); assert.equal(r.pct, 100);
});

test('periodProgress: timezone/local date — dùng ngày local của `now`', () => {
  // now = 29/2 23:59 local → elapsed = 29 (không phụ thuộc giờ UTC)
  const d = febDays(); for (let i = 0; i < 29; i++) d[i] = true;
  const late = new Date(2024, 1, 29, 23, 59, 59);
  assert.equal(H.periodProgress({ type: 'daily' }, d, 100, FEB, FEBM, FEB_DAYS, late).required, 29);
  // now đầu tháng (1/2 00:00) → elapsed 1
  const d2 = febDays(); d2[0] = true;
  assert.deepEqual(H.periodProgress({ type: 'daily' }, d2, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 1)),
    { done: 1, required: 1, pct: 100 });
});

test('consistencyPct daily/weekdays: tỷ lệ ngày đến hạn', () => {
  const d = febDays(); [0, 1, 2, 3, 4].forEach((i) => { d[i] = true; });
  assert.equal(H.consistencyPct({ type: 'daily' }, d, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 10)), 50);
  // days [1,3,5]: 4 ngày due đã qua (2/2,5/2,7/2,9/2), tick 2/4 → 50%
  const w = febDays(); [4, 6].forEach((i) => { w[i] = true; });
  assert.equal(H.consistencyPct({ type: 'weekdays', days: [1, 3, 5] }, w, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 10)), 50);
});

test('consistencyPct weekly_count: % tuần hoàn thành đạt mục tiêu (không phạt tuần chạy)', () => {
  // now = 25/2 (Chủ nhật). Tuần hoàn thành: 5/2-11/2 (đạt 4), 12/2-18/2 (chỉ 2).
  // Tuần 19/2-25/2 = current (không tính). → 1/2 = 50%
  const d = febDays();
  [4, 5, 6, 7].forEach((i) => { d[i] = true; });      // tuần 5/2: 4 lần → đạt
  [11, 12].forEach((i) => { d[i] = true; });          // tuần 12/2: 2 lần → không đạt
  assert.equal(H.consistencyPct({ type: 'weekly_count', count: 4 }, d, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 25)), 50);
  // Chưa có tuần hoàn thành → fallback tiến độ tuần hiện tại
  const d2 = febDays(); d2[19] = true; // Thứ 2 tuần current
  const fallback = H.consistencyPct({ type: 'weekly_count', count: 4 }, d2, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 20));
  assert.equal(fallback, H.periodProgress({ type: 'weekly_count', count: 4 }, d2, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 20)).pct);
});

test('consistencyPct monthly_count: % tháng đạt mục tiêu qua daysAt', () => {
  // Tháng 1/2024: 10/12 đạt? không. Tháng 12/2023: 12+ → đạt. → 1/2 = 50%
  const daysAt = (y, m) => {
    if (y === 2024 && m === 0) return Array.from({ length: 31 }, (_, i) => i < 10); // 10 ngày
    if (y === 2023 && m === 11) return Array.from({ length: 31 }, (_, i) => i < 12); // 12 ngày
    return Array(28).fill(false);
  };
  const cur = febDays(); [0, 1, 2, 3, 4, 5].forEach((i) => { cur[i] = true; }); // 6/12 hiện tại
  assert.equal(H.consistencyPct({ type: 'monthly_count', count: 12 }, cur, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 10), daysAt), 50);
  // Không có daysAt → fallback tiến độ tháng hiện tại
  assert.equal(H.consistencyPct({ type: 'monthly_count', count: 12 }, cur, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 10)),
    H.periodProgress({ type: 'monthly_count', count: 12 }, cur, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 10)).pct);
});

test('runInfo daily/weekdays: run ngày, ngày không due không phá run', () => {
  const d = febDays(); [4, 5, 6].forEach((i) => { d[i] = true; }); // 5,6,7/2 liên tiếp
  assert.deepEqual(H.runInfo({ type: 'daily' }, d, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 7)), { cur: 3, best: 3 });
  // weekdays T2/T4/T6: tick 5/2(T2) + 7/2(T4), bỏ 6/2(T3 không due) → run 2
  const w = febDays(); w[4] = true; w[6] = true;
  assert.deepEqual(H.runInfo({ type: 'weekdays', days: [1, 3, 5] }, w, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 7)), { cur: 2, best: 2 });
  // run bị phá khi miss 1 ngày due
  const m = febDays(); m[4] = true; m[6] = false; m[8] = true;
  assert.deepEqual(H.runInfo({ type: 'weekdays', days: [1, 3, 5] }, m, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 9)), { cur: 1, best: 1 });
});

test('runInfo weekly_count/monthly_count: run theo kỳ đạt mục tiêu', () => {
  // now = 25/2. Tuần 5/2 đạt (4), 12/2 đạt (4), 19/2 current (1) → cur 1, best 2
  const d = febDays();
  [4, 5, 6, 7].forEach((i) => { d[i] = true; });
  [11, 12, 13, 14].forEach((i) => { d[i] = true; });
  d[19] = true;
  const r = H.runInfo({ type: 'weekly_count', count: 4 }, d, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 25));
  assert.deepEqual(r, { cur: 1, best: 2 });
  // monthly với daysAt: tháng 12/2023 đạt, tháng 1/2024 không, current 6/12 → cur 0, best 1
  const daysAt = (y, m) => {
    if (y === 2023 && m === 11) return Array.from({ length: 31 }, (_, i) => i < 12);
    if (y === 2024 && m === 0) return Array.from({ length: 31 }, (_, i) => i < 5);
    return Array(28).fill(false);
  };
  const cur = febDays(); [0, 1, 2, 3, 4, 5].forEach((i) => { cur[i] = true; });
  assert.deepEqual(H.runInfo({ type: 'monthly_count', count: 12 }, cur, 100, FEB, FEBM, FEB_DAYS, new Date(2024, 1, 10), daysAt), { cur: 0, best: 1 });
});

test('scheduleSummary: trả label data', () => {
  assert.deepEqual(H.scheduleSummary({ type: 'daily' }), { type: 'daily', value: null });
  assert.deepEqual(H.scheduleSummary({ type: 'weekdays', days: [2, 4] }), { type: 'weekdays', value: [2, 4] });
  assert.deepEqual(H.scheduleSummary({ type: 'weekly_count', count: 3 }), { type: 'weekly_count', value: 3 });
  assert.deepEqual(H.scheduleSummary(undefined), { type: 'daily', value: null });
});

test('migration: ensureHabitSchedules idempotent + không phá legacy', () => {
  const raw = {
    habits: [
      { id: 'h1', name: 'Legacy', days: [true, false] },
      { id: 'h2', name: 'Valid', days: [], schedule: { type: 'weekdays', days: [1, 3] } },
      { id: 'h3', name: 'Malformed', days: [], schedule: { type: 'weekly_count', count: 0 } },
      { id: 'h4', name: 'Dup', days: [], schedule: { type: 'weekdays', days: [5, 3, 3] } },
    ],
  };
  const s1 = M.ensureHabitSchedules(raw);
  assert.equal(s1.habits[0].schedule, undefined); // legacy giữ nguyên
  assert.deepEqual(s1.habits[1].schedule, { type: 'weekdays', days: [1, 3] });
  assert.deepEqual(s1.habits[2].schedule, { type: 'daily' }); // malformed → daily
  assert.deepEqual(s1.habits[3].schedule, { type: 'weekdays', days: [3, 5] }); // de-dupe+sort
  // idempotent
  const s2 = M.ensureHabitSchedules(s1);
  assert.deepEqual(s2, s1);
  // không phá dữ liệu khác
  assert.deepEqual(s2.habits[0].days, [true, false]);
});

test('migration: migrateMonthState chạy qua ensureHabitSchedules', () => {
  const out = M.migrateMonthState({ habits: [{ id: 'h1', schedule: { type: 'monthly_count', count: 99 } }] }, { year: 2024, month: 2 });
  assert.deepEqual(out.habits[0].schedule, { type: 'daily' }); // 99 > 93 → daily
  assert.equal(out.schemaVersion, M.VERSION);
});

test('wiring: app.html có modal habit-sched + xp habitPct delegate + SW v217', () => {
  assert.match(APP, /id="habitSchedModal"/);
  assert.match(APP, /data-action="habitsched-save"/);
  assert.match(APPJS, /habitSchedOf/);
  assert.match(APPJS, /data-action="habitsched"/);
  assert.equal(typeof H.periodProgress, 'function');
  const XPJS = readFileSync('js/xp.js', 'utf8');
  assert.match(XPJS, /periodProgress/); // xp habitPct delegate schedule-aware
  assert.match(I18N, /habitSchedWeeklyLabel/);
  assert.match(I18N, /habitSchedMonthlyLabel/);
  assert.match(SW, /const CACHE = 'taskflow-v258'/);
});

test('wiring: copyHabitsToNextMonth giữ schedule', () => {
  assert.match(APPJS, /normalizeSchedule\(h\.schedule\)/);
  assert.match(APPJS, /next\.schedule = sched/);
});

test('wiring: today.js lọc habit theo schedule', () => {
  const TODAY = readFileSync('js/today.js', 'utf8');
  assert.match(TODAY, /isDueToday/);
  assert.match(TODAY, /pr\.pct < 100/);
  assert.match(TODAY, /today-habit-sched/);
});
