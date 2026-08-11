// TaskFlow — P1 Daily Reflection: unit tests cho pure helpers của js/reflection.js
// (dailyKey, normalizeEntry, summaryFrom, groupByMonth) + assertions wiring
// (app.html nạp reflection.min.js trước app.min.js, sw.js precache, i18n vi/en).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Reflection from '../js/reflection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const I18N_JS = readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');
const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

const { dailyKey, normalizeEntry, summaryFrom, groupByMonth } = Reflection;

/* ---------------- dailyKey ---------------- */

test('dailyKey: YYYY-MM-DD local, pad 2 chữ số', () => {
  assert.equal(dailyKey(new Date(2026, 7, 10)), '2026-08-10');
  assert.equal(dailyKey(new Date(2026, 0, 3)), '2026-01-03');
  assert.equal(dailyKey(new Date(2026, 11, 31)), '2026-12-31');
});

test('dailyKey: nhất quán theo local (không lệch UTC)', () => {
  // Giờ cuối ngày local không được nhảy sang ngày hôm sau do timezone
  const late = new Date(2026, 7, 10, 23, 59, 59);
  assert.equal(dailyKey(late), '2026-08-10');
});

/* ---------------- normalizeEntry ---------------- */

test('normalizeEntry: default đầy đủ khi raw rỗng/null', () => {
  const e = normalizeEntry(null);
  assert.deepEqual(e, {
    mood: null, quickGood: '', quickImprove: '', good: '', bad: '', cont: '',
    improve: '', tomorrow: '', createdAt: null, updatedAt: null,
  });
});

test('normalizeEntry: giữ field có, điền default cho field thiếu', () => {
  const e = normalizeEntry({ mood: 3, good: 'viết code' });
  assert.equal(e.mood, 3);
  assert.equal(e.good, 'viết code');
  assert.equal(e.quickGood, '');
  assert.equal(e.tomorrow, '');
});

test('normalizeEntry: không đụng dữ liệu lạ (forward-compat)', () => {
  const e = normalizeEntry({ tomorrow: 'x', futureField: 42 });
  assert.equal(e.tomorrow, 'x');
  assert.equal(e.futureField, 42);
});

/* ---------------- summaryFrom ---------------- */

test('summaryFrom: tháng rỗng → 0/0 không chia 0', () => {
  const s = summaryFrom([], [], 0, 0, 0);
  assert.deepEqual({ ...s }, {
    tasksDone: 0, tasksTotal: 0, tasksPct: 0,
    habitsDone: 0, habitsTotal: 0, habitsPct: 0,
    focusMinutes: 0, goalPct: 0,
  });
});

test('summaryFrom: đếm task done / habit done theo habitIdx + skipDays', () => {
  const tasks = [{ done: true }, { done: false }, { done: true }];
  const habits = [
    { days: [true, false, true], skipDays: [] },
    { days: [false, true, false], skipDays: [] },
    { days: [true, true, true], skipDays: [0] }, // skip ngày 0
  ];
  const s = summaryFrom(tasks, habits, 105, 80, 0);
  assert.equal(s.tasksDone, 2);
  assert.equal(s.tasksTotal, 3);
  assert.equal(s.tasksPct, 67);
  assert.equal(s.habitsDone, 1); // habit[0]=true, habit[1]=false; habit[2] bị skip
  assert.equal(s.habitsTotal, 2); // habit[2] loại khỏi tổng do skipDays
  assert.equal(s.habitsPct, 50);
  assert.equal(s.focusMinutes, 105);
  assert.equal(s.goalPct, 80);
});

test('summaryFrom: habitIdx = -1 (xem tháng khác) → habits 0/0, tasks vẫn tính', () => {
  const s = summaryFrom([{ done: true }], [{ days: [true] }], 0, 0, -1);
  assert.equal(s.tasksDone, 1);
  assert.equal(s.habitsTotal, 0);
  assert.equal(s.habitsPct, 0);
});

/* ---------------- groupByMonth ---------------- */

test('groupByMonth: nhóm theo tháng giảm dần, trong tháng giảm dần theo ngày', () => {
  const entries = [
    { key: '2026-08-03', entry: { mood: 3 } },
    { key: '2026-08-10', entry: { mood: 4 } },
    { key: '2026-07-31', entry: { mood: 2 } },
    { key: '2026-08-01', entry: { mood: 1 } },
  ];
  const groups = groupByMonth(entries);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].month, '2026-08');
  assert.deepEqual(groups[0].items.map((i) => i.key), ['2026-08-10', '2026-08-03', '2026-08-01']);
  assert.equal(groups[1].month, '2026-07');
  assert.equal(groups[1].items[0].key, '2026-07-31');
});

test('groupByMonth: rỗng → []', () => {
  assert.deepEqual(groupByMonth([]), []);
});

/* ---------------- wiring: app.html / sw.js / app.js / i18n ---------------- */

test('app.html: reflection.min.js nạp trước app.min.js', () => {
  const ri = APP.indexOf('js/reflection.min.js');
  const ai = APP.indexOf('js/app.min.js');
  assert.ok(ri >= 0, 'thiếu script reflection.min.js');
  assert.ok(ai > ri, 'reflection.min.js phải nạp trước app.min.js');
});

test('app.html: modal reflection + history có data-testid', () => {
  assert.match(APP, /id="reflectionModal"[^>]*data-testid="reflection-modal"/);
  assert.match(APP, /id="reflectionHistoryModal"[^>]*data-testid="reflection-history-modal"/);
});

test('sw.js: precache reflection.min.js + CACHE bump mới hơn v183', () => {
  assert.match(SW, /'\.\/js\/reflection\.min\.js'/);
  const m = SW.match(/const CACHE = 'taskflow-v(\d+)'/);
  assert.ok(m && +m[1] > 183, 'CACHE phải bump so với trước (v184+)');
});

test('app.js: destructure TaskFlowReflection + dispatcher reflection-* + input listener', () => {
  assert.match(APP_JS, /window\.TaskFlowReflection\)/);
  assert.match(APP_JS, /const \{ loadReflections \} = window\.TaskFlowReflection;/);
  assert.match(APP_JS, /act === 'reflection-mood'/);
  assert.match(APP_JS, /act === 'reflection-save-quick'/);
  assert.match(APP_JS, /act === 'reflection-deep'/);
  assert.match(APP_JS, /act === 'reflection-history'/);
  assert.match(APP_JS, /t\.dataset\.reflectField/);
  assert.match(APP_JS, /loadReflections\(\);/);
});

test('i18n: đủ key vi + en cho reflection', () => {
  const keys = ['reflectTitle', 'reflectSummaryTitle', 'reflectMoodQ', 'reflectGoodToday',
    'reflectImproveToday', 'reflectSave', 'reflectDeepLink', 'reflectDeepGood', 'reflectDeepBad',
    'reflectDeepCont', 'reflectDeepImprove', 'reflectTomorrow', 'reflectAutosaved',
    'reflectHistory', 'reflectHistoryEmpty', 'reflectHistoryItemAria'];
  keys.forEach((k) => {
    const vi = I18N_JS.indexOf(`    ${k}:`) >= 0;
    const en = I18N_JS.indexOf(`    ${k}:`) >= 0 && I18N_JS.indexOf(`    ${k}:`, I18N_JS.indexOf('  en: {')) >= 0;
    assert.ok(vi, `thiếu key vi ${k}`);
    assert.ok(en, `thiếu key en ${k}`);
  });
});
