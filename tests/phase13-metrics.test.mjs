// TaskFlow — P3 Monthly Metrics: unit tests cho pure helpers của js/pillars.js
// (normalizeMetric, metricTarget, metricDone, metricProgress, addMetric, updateMetric,
// removeMetric, toggleMetricDay, metricById) + migration additive (metrics trong
// pillar cũ) + wiring assertions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Pillars from '../js/pillars.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const I18N_JS = readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');

const {
  normalizeMetric, metricTarget, metricDone, metricProgress,
  addMetric, updateMetric, removeMetric, toggleMetricDay, metricById,
  defaultTemplate, ensurePillars,
} = Pillars;

const tr = (k) => ({ pillarBody: 'Body', pillarWork: 'Main Work', pillarSocial: 'Relationships' }[k] || k);

const habits = [
  { id: 'h0', name: 'Ngủ trước 23:30', target: 100, days: [true, false, true, false, true, false, true] },
  { id: 'h1', name: 'Workout', target: 87, days: [false, true, true, false, false, true, false] },
];

/* ---------------- normalizeMetric ---------------- */

test('normalizeMetric: default MANUAL + daily target khi raw thiếu field', () => {
  const m = normalizeMetric({ title: 'Ngủ đủ' });
  assert.equal(m.type, 'MANUAL');
  assert.equal(m.target.mode, 'daily');
  assert.equal(m.target.value, 1);
  assert.equal(m.linkedHabitId, null);
  assert.deepEqual(m.days, []);
  assert.ok(m.id);
});

test('normalizeMetric: giữ HABIT + linkedHabitId hợp lệ; xoá link nếu không phải HABIT', () => {
  const h = normalizeMetric({ title: 'Tập gym', type: 'HABIT', linkedHabitId: 'h1', target: { mode: 'perWeek', value: 5 } });
  assert.equal(h.type, 'HABIT');
  assert.equal(h.linkedHabitId, 'h1');
  assert.equal(h.target.mode, 'perWeek');
  assert.equal(h.target.value, 5);
  const m = normalizeMetric({ title: 'x', type: 'MANUAL', linkedHabitId: 'h1' });
  assert.equal(m.linkedHabitId, null);
});

test('normalizeMetric: type lạ → MANUAL; target mode lạ → daily', () => {
  const m = normalizeMetric({ title: 'x', type: 'TASK', target: { mode: 'weird', value: 3 } });
  assert.equal(m.type, 'MANUAL');
  assert.equal(m.target.mode, 'daily');
});

/* ---------------- metricTarget (day-count THẬT, không hard-code 30) ---------------- */

test('metricTarget: daily → đúng số ngày tháng (28/29/30/31)', () => {
  const m = { target: { mode: 'daily', value: 1 } };
  assert.equal(metricTarget(m, 28), 28);
  assert.equal(metricTarget(m, 29), 29);
  assert.equal(metricTarget(m, 30), 30);
  assert.equal(metricTarget(m, 31), 31);
});

test('metricTarget: perWeek → ceil(v × days/7)', () => {
  const m = { target: { mode: 'perWeek', value: 5 } };
  assert.equal(metricTarget(m, 28), 20);   // 5 × 4 tuần
  assert.equal(metricTarget(m, 30), Math.ceil(5 * 30 / 7)); // ≈ 21.43 → 22
  assert.equal(metricTarget(m, 31), Math.ceil(5 * 31 / 7)); // ≈ 22.14 → 23
});

test('metricTarget: perMonth/custom → giá trị cố định', () => {
  assert.equal(metricTarget({ target: { mode: 'perMonth', value: 20 } }, 30), 20);
  assert.equal(metricTarget({ target: { mode: 'custom', value: 24 } }, 31), 24);
});

test('metricTarget: value không hợp lệ → fallback 1', () => {
  assert.equal(metricTarget({ target: { mode: 'perMonth', value: 0 } }, 30), 1);
  assert.equal(metricTarget({ target: { mode: 'custom' } }, 30), 1);
});

/* ---------------- metricDone ---------------- */

test('metricDone HABIT: đếm số ngày habit tick trong tháng', () => {
  const m = { type: 'HABIT', linkedHabitId: 'h0', days: [] };
  assert.equal(metricDone(habits, m), 4); // h0 có 4 ngày true
});

test('metricDone HABIT: habit bị xoá (linkedHabitId lạ) → 0, không crash', () => {
  const m = { type: 'HABIT', linkedHabitId: 'h_removed', days: [] };
  assert.equal(metricDone(habits, m), 0);
  assert.equal(metricDone([], m), 0);
});

test('metricDone MANUAL/CUSTOM: đếm ô ngày đã đánh dấu', () => {
  assert.equal(metricDone([], { type: 'MANUAL', days: [true, false, true, true] }), 3);
  assert.equal(metricDone([], { type: 'CUSTOM', days: [] }), 0);
  assert.equal(metricDone([], { type: 'MANUAL' }), 0);
});

/* ---------------- metricProgress ---------------- */

test('metricProgress: pct = done/target, giới hạn 100', () => {
  const m = { type: 'HABIT', linkedHabitId: 'h0', target: { mode: 'daily', value: 1 } };
  const p = metricProgress(habits, m, 31);
  assert.equal(p.target, 31);
  assert.equal(p.done, 4);
  assert.equal(p.pct, Math.round(4 / 31 * 100));
  // done vượt target → cap 100
  const over = metricProgress([{ id: 'a', days: [true, true, true] }], { type: 'HABIT', linkedHabitId: 'a' }, 2);
  assert.equal(over.pct, 100);
});

test('metricProgress: target 0 → pct 0 (không chia 0)', () => {
  const p = metricProgress([], { type: 'MANUAL', target: { mode: 'custom', value: 0 } }, 30);
  assert.equal(p.pct, 0);
});

/* ---------------- CRUD ---------------- */

test('addMetric: thêm vào đúng pillar, có createdAt; pillar lạ → null', () => {
  const state = { pillars: defaultTemplate(tr) };
  const m = addMetric(state, 'p1', { title: 'Ngủ đủ', type: 'HABIT', linkedHabitId: 'h0', target: { mode: 'daily', value: 1 } });
  assert.ok(m);
  assert.ok(m.createdAt);
  assert.equal(state.pillars[0].metrics.length, 1);
  assert.equal(state.pillars[1].metrics.length, 0);
  assert.equal(addMetric(state, 'p99', { title: 'x' }), null);
});

test('updateMetric: đổi tên / type / target / link theo id', () => {
  const state = { pillars: [{ id: 'p1', name: 'A', icon: '💪', hidden: false, focus: '', metrics: [] }] };
  const m = addMetric(state, 'p1', { title: 'Cũ', type: 'MANUAL', target: { mode: 'daily', value: 1 } });
  updateMetric(state, m.id, { title: 'Mới', type: 'HABIT', linkedHabitId: 'h1', target: { mode: 'perWeek', value: 5 } });
  const u = metricById(state, m.id);
  assert.equal(u.title, 'Mới');
  assert.equal(u.type, 'HABIT');
  assert.equal(u.linkedHabitId, 'h1');
  assert.equal(u.target.mode, 'perWeek');
  assert.equal(u.target.value, 5);
});

test('updateMetric: đổi type khỏi HABIT → xoá link', () => {
  const state = { pillars: [{ id: 'p1', name: 'A', icon: '💪', hidden: false, focus: '', metrics: [] }] };
  const m = addMetric(state, 'p1', { title: 'x', type: 'HABIT', linkedHabitId: 'h0' });
  updateMetric(state, m.id, { type: 'MANUAL' });
  assert.equal(metricById(state, m.id).linkedHabitId, null);
});

test('removeMetric: xoá đúng metric; false khi không tồn tại', () => {
  const state = { pillars: [{ id: 'p1', name: 'A', icon: '💪', hidden: false, focus: '', metrics: [] }] };
  const m1 = addMetric(state, 'p1', { title: 'a' });
  addMetric(state, 'p1', { title: 'b' });
  assert.equal(state.pillars[0].metrics.length, 2);
  assert.equal(removeMetric(state, m1.id), true);
  assert.equal(state.pillars[0].metrics.length, 1);
  assert.equal(removeMetric(state, 'zz'), false);
});

test('toggleMetricDay: toggle ô ngày, mở rộng mảng khi cần', () => {
  const state = { pillars: [{ id: 'p1', name: 'A', icon: '💪', hidden: false, focus: '', metrics: [] }] };
  const m = addMetric(state, 'p1', { title: 'Đọc sách', type: 'MANUAL' });
  toggleMetricDay(state, m.id, 0);
  toggleMetricDay(state, m.id, 4);
  assert.equal(metricById(state, m.id).days[0], true);
  assert.equal(metricById(state, m.id).days[4], true);
  assert.equal(metricById(state, m.id).days[3], false);
  toggleMetricDay(state, m.id, 0);
  assert.equal(metricById(state, m.id).days[0], false);
  // index lạ → không crash
  toggleMetricDay(state, m.id, -1);
  toggleMetricDay(state, m.id, 31);
  assert.equal(metricById(state, m.id).days.length >= 32, true);
});

/* ---------------- Migration additive ---------------- */

test('ensurePillars: pillar cũ (P2, không metrics) → metrics rỗng, dữ liệu khác giữ nguyên', () => {
  const state = { pillars: [{ id: 'p1', name: 'Cơ thể', icon: '💪', hidden: false, focus: 'abc' }], monthlyGoals: [{ id: 'g' }] };
  ensurePillars(state, tr);
  assert.deepEqual(state.pillars[0].metrics, []);
  assert.equal(state.pillars[0].focus, 'abc');
  assert.equal(state.monthlyGoals.length, 1);
});

test('defaultTemplate: pillar mẫu có metrics rỗng', () => {
  defaultTemplate(tr).forEach((p) => assert.deepEqual(p.metrics, []));
});

/* ---------------- Wiring ---------------- */

test('wiring: app.html có metricEditModal trước app.min.js', () => {
  const mi = APP.indexOf('metricEditModal');
  assert.ok(mi >= 0, 'app.html phải có metricEditModal');
  const ai = APP.indexOf('js/app.min.js');
  assert.ok(ai > mi);
});

test('wiring: dispatcher có metric-add/save/delete/day + updateMetricRow', () => {
  assert.ok(APP_JS.includes("'metric-add'"));
  assert.ok(APP_JS.includes("'metric-save'"));
  assert.ok(APP_JS.includes("'metric-delete'"));
  assert.ok(APP_JS.includes("'metric-day'"));
  assert.ok(APP_JS.includes('function updateMetricRow'));
});

test('wiring: i18n có đủ key metric (vi + en)', () => {
  ['metricLbl', 'metricAdd', 'metricTitleLbl', 'metricTypeLbl', 'metricTypeHABIT', 'metricTypeMANUAL',
    'metricTypeCUSTOM', 'metricHabitLbl', 'metricTargetLbl', 'metricTargetDaily', 'metricTargetPerWeek',
    'metricTargetPerMonth', 'metricTargetCustom', 'metricBarAria', 'metricSaved'].forEach((k) => {
    const m = I18N_JS.match(new RegExp(k + ": '", 'g'));
    assert.ok(m && m.length === 2, `key ${k} phải có đúng vi + en (${m ? m.length : 0})`);
  });
});
