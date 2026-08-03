import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import PlanMath from '../js/plan-math.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const APP_HTML = readFileSync(path.join(ROOT, 'app.html'), 'utf8');

/* ---------- PlanMath: ngày / elapsed ---------- */

test('numDaysOf: tháng 2 năm nhuận 2024 = 29', () => {
  assert.equal(PlanMath.numDaysOf(2024, 1), 29);
  assert.equal(PlanMath.numDaysOf(2026, 1), 28);
  assert.equal(PlanMath.numDaysOf(2026, 0), 31);
});

test('elapsedDays: tháng hiện tại → hôm nay; tháng khác → đủ tháng', () => {
  const now = new Date(2026, 2, 15);
  assert.equal(PlanMath.elapsedDays(2026, 2, now), 15);
  assert.equal(PlanMath.elapsedDays(2026, 2, new Date(2026, 2, 1)), 1);
  assert.equal(PlanMath.elapsedDays(2026, 3, now), 30);
  assert.equal(PlanMath.elapsedDays(2026, 1, now), 28);
});

/* ---------- PlanMath: habitPctFrom (target) ---------- */

test('habitPctFrom: target 100 = hành vi cũ (done/elapsed)', () => {
  const days = [true, true, false, false, true];
  assert.equal(PlanMath.habitPctFrom(days, 5, 100), 60);
});

test('habitPctFrom: target 50 → 100% khi đủ nửa số ngày', () => {
  const days = Array.from({ length: 30 }, (_, i) => i < 15);
  assert.equal(PlanMath.habitPctFrom(days, 30, 50), 100);
  const half = Array.from({ length: 30 }, (_, i) => i < 8);
  assert.equal(PlanMath.habitPctFrom(half, 30, 50), 53);
});

test('habitPctFrom: target thiếu/0 → mặc định 100; clamp 100', () => {
  const days = [true, true, true, true, true];
  assert.equal(PlanMath.habitPctFrom(days, 5, undefined), 100);
  assert.equal(PlanMath.habitPctFrom(days, 5, 0), 100);
  assert.equal(PlanMath.habitPctFrom(days, 2, 100), 100);
  assert.equal(PlanMath.habitPctFrom([], 10, 100), 0);
});

/* ---------- PlanMath: chuyển tháng qua năm ---------- */

test('nextMonth: wrap tháng 12 → tháng 1 năm sau', () => {
  assert.deepEqual(PlanMath.nextMonth(2026, 11), { y: 2027, m: 0 });
  assert.deepEqual(PlanMath.nextMonth(2026, 5), { y: 2026, m: 6 });
});

test('prevMonth: wrap tháng 1 → tháng 12 năm trước', () => {
  assert.deepEqual(PlanMath.prevMonth(2026, 0), { y: 2025, m: 11 });
  assert.deepEqual(PlanMath.prevMonth(2026, 5), { y: 2026, m: 4 });
});

/* ---------- PlanMath: streak ---------- */

test('currentStreak: đếm lùi từ cuối', () => {
  assert.equal(PlanMath.currentStreak([]), 0);
  assert.equal(PlanMath.currentStreak([true, true, false, true, true]), 2);
  assert.equal(PlanMath.currentStreak([true, true, true]), 3);
  assert.equal(PlanMath.currentStreak([false, false]), 0);
});

test('bestStreak: chuỗi dài nhất', () => {
  assert.equal(PlanMath.bestStreak([]), 0);
  assert.equal(PlanMath.bestStreak([true, true, false, true, true, true, true]), 4);
  assert.equal(PlanMath.bestStreak([false, true, false]), 1);
});

/* ---------- PlanMath: evaluateBadges ---------- */

test('evaluateBadges: từng badge riêng', () => {
  const base = { streaks: {}, goalPct: 0, goalTotal: 10, habitPcts: [50], activeDays: 0 };
  assert.deepEqual(PlanMath.evaluateBadges({ ...base, streaks: { a: { cur: 7, best: 7 } } }), ['b7']);
  assert.deepEqual(PlanMath.evaluateBadges({ ...base, streaks: { a: { cur: 30, best: 30 } } }), ['b7', 'b30', 'best14']);
  assert.deepEqual(PlanMath.evaluateBadges({ ...base, streaks: { a: { cur: 2, best: 14 } } }), ['best14']);
  assert.deepEqual(PlanMath.evaluateBadges({ ...base, goalPct: 100, goalTotal: 4 }), ['goals100']);
  assert.deepEqual(PlanMath.evaluateBadges({ ...base, habitPcts: [100, 100] }), ['habit100']);
  assert.deepEqual(PlanMath.evaluateBadges({ ...base, activeDays: 15 }), ['active15']);
});

test('evaluateBadges: habits rỗng → không habit100; goalTotal 0 → không goals100', () => {
  assert.deepEqual(PlanMath.evaluateBadges({ streaks: {}, goalPct: 100, goalTotal: 0, habitPcts: [], activeDays: 0 }), []);
  assert.deepEqual(PlanMath.evaluateBadges({ streaks: {}, goalPct: 0, goalTotal: 0, habitPcts: [], activeDays: 0 }), []);
});

test('evaluateBadges: kết hợp nhiều badge', () => {
  const r = PlanMath.evaluateBadges({
    streaks: { a: { cur: 30, best: 15 } },
    goalPct: 100, goalTotal: 3,
    habitPcts: [100, 100],
    activeDays: 20,
  });
  assert.deepEqual(r.sort(), ['active15', 'b30', 'b7', 'best14', 'goals100', 'habit100'].sort());
});

/* ---------- Textual: Task 2 — habit target ---------- */

test('Task2: addHabit gán target 100', () => {
  assert.match(APP_JS, /target:\s*100/);
});

test('Task2: habitPct dùng habitPctFrom theo target', () => {
  assert.match(APP_JS, /PlanMath\.habitPctFrom/);
});

test('Task2: migration mặc định target 100 trong loadState', () => {
  assert.match(APP_JS, /h\.target\s*=\s*100/);
});

test('Task2: nút 🎯 targetedit trong habit panel', () => {
  assert.match(APP_JS, /data-action="targetedit"/);
});

/* ---------- Textual: Task 3 — sao chép habit ---------- */

test('Task3: nút copyhabits + hàm copyHabitsToNextMonth', () => {
  assert.match(APP_JS, /data-action="copyhabits"/);
  assert.match(APP_JS, /function copyHabitsToNextMonth/);
});

/* ---------- Textual: Task 4 — nhiều năm ---------- */

test('Task4: yearKey dùng PLAN_YEAR', () => {
  assert.match(APP_JS, /function yearKey\(\)\s*\{\s*return 'planner-year-'\s*\+\s*PLAN_YEAR/);
});

test('Task4: loadYearState kiểm theo PLAN_YEAR', () => {
  assert.match(APP_JS, /s\.year\s*!==\s*PLAN_YEAR/);
});

test('Task4: tabYear hiển thị PLAN_YEAR', () => {
  assert.match(APP_JS, /tabYear[\s\S]{0,120}\{ y:\s*PLAN_YEAR\s*\}/);
});

test('Task4: nút prevyear/nextyear trong app.html', () => {
  assert.match(APP_HTML, /data-action="prevyear"/);
  assert.match(APP_HTML, /data-action="nextyear"/);
});

/* ---------- Textual: Task 5 — báo cáo tháng ---------- */

test('Task5: modal reportModal + nút report', () => {
  assert.match(APP_HTML, /id="reportModal"/);
  assert.match(APP_JS, /data-action="report"/);
});

test('Task5: hàm monthlyReportData + reportCardBlob + sự kiện share_report', () => {
  assert.match(APP_JS, /function monthlyReportData/);
  assert.match(APP_JS, /function reportCardBlob/);
  assert.match(APP_JS, /'share_report'/);
});

/* ---------- Textual: Task 6 — huy hiệu ---------- */

test('Task6: lưu planner-badges + evaluateBadges + badgePanelHTML', () => {
  assert.match(APP_JS, /planner-badges/);
  assert.match(APP_JS, /PlanMath\.evaluateBadges/);
  assert.match(APP_JS, /function badgePanelHTML/);
});
