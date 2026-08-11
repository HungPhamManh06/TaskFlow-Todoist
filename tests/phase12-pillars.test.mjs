// TaskFlow — P2 Monthly Life Pillars: unit tests cho pure helpers của js/pillars.js
// (defaultTemplate, ensurePillars, normalizePillar, upsertPillar, removePillar,
// togglePillarHidden, resetPillars, setFocus, visiblePillars, pillarById) + assertions
// wiring (app.html nạp pillars.min.js trước app.min.js, sw.js precache, i18n vi/en).
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
const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

const {
  ICONS, defaultTemplate, normalizePillar, ensurePillars, pillarById,
  visiblePillars, upsertPillar, removePillar, togglePillarHidden, setFocus, resetPillars,
} = Pillars;

// Translator giả cho test (không phụ thuộc i18n global)
const tr = (k) => ({ pillarBody: 'Body', pillarWork: 'Main Work', pillarSocial: 'Relationships' }[k] || k);

/* ---------------- defaultTemplate ---------------- */

test('defaultTemplate: 3 trụ cột mặc định theo translator', () => {
  const tpl = defaultTemplate(tr);
  assert.equal(tpl.length, 3);
  assert.equal(tpl[0].name, 'Body');
  assert.equal(tpl[1].name, 'Main Work');
  assert.equal(tpl[2].name, 'Relationships');
  assert.equal(tpl[0].icon, '💪');
  assert.equal(tpl[1].icon, '🎯');
  assert.equal(tpl[2].icon, '🤝');
  tpl.forEach((p, i) => {
    assert.equal(p.id, 'p' + (i + 1));
    assert.equal(p.hidden, false);
    assert.equal(p.focus, '');
  });
});

test('defaultTemplate: id cố định p1/p2/p3 — ổn định cho sync + carry-over', () => {
  const a = defaultTemplate(tr);
  const b = defaultTemplate(tr);
  assert.deepEqual(a.map((p) => p.id), b.map((p) => p.id));
});

/* ---------------- normalizePillar / ensurePillars (migration additive) ---------------- */

test('ensurePillars: state cũ không có pillars → điền template, không mất field khác', () => {
  const state = { monthlyGoals: [{ id: 'g1', text: 'x', kind: 'priority', done: false }], weeks: [] };
  ensurePillars(state, tr);
  assert.ok(Array.isArray(state.pillars));
  assert.equal(state.pillars.length, 3);
  assert.equal(state.pillars[0].name, 'Body');
  // dữ liệu cũ giữ nguyên
  assert.equal(state.monthlyGoals.length, 1);
  assert.equal(state.monthlyGoals[0].text, 'x');
});

test('ensurePillars: pillars đã có → giữ nguyên, chỉ chuẩn hoá field thiếu', () => {
  const state = { pillars: [{ id: 'px', name: 'Học tập', icon: '📚' }] };
  ensurePillars(state, tr);
  assert.equal(state.pillars.length, 1);
  assert.equal(state.pillars[0].id, 'px');
  assert.equal(state.pillars[0].name, 'Học tập');
  assert.equal(state.pillars[0].icon, '📚');
  // field thiếu được điền default
  assert.equal(state.pillars[0].hidden, false);
  assert.equal(state.pillars[0].focus, '');
});

test('ensurePillars: pillar thiếu tên/icon → fallback template theo index', () => {
  const state = { pillars: [{ id: 'a' }, { id: 'b', name: 'Tên' }, null] };
  ensurePillars(state, tr);
  assert.equal(state.pillars.length, 2);
  assert.equal(state.pillars[0].name, 'Body');
  assert.equal(state.pillars[0].icon, '💪');
  assert.equal(state.pillars[1].name, 'Tên');
  assert.equal(state.pillars[1].icon, '🎯');
});

test('normalizePillar: giữ nguyên dữ liệu hợp lệ', () => {
  const p = normalizePillar({ id: 'p1', name: 'Cơ thể', icon: '🏃', hidden: true, focus: 'Duy trì' }, 0, tr);
  assert.equal(p.name, 'Cơ thể');
  assert.equal(p.icon, '🏃');
  assert.equal(p.hidden, true);
  assert.equal(p.focus, 'Duy trì');
});

/* ---------------- CRUD ---------------- */

test('upsertPillar: thêm pillar mới với id sinh tự động', () => {
  const state = { pillars: defaultTemplate(tr) };
  const p = upsertPillar(state, { name: 'Học tập', icon: '📚' });
  assert.ok(p);
  assert.ok(p.id);
  assert.equal(state.pillars.length, 4);
  assert.equal(state.pillars[3].name, 'Học tập');
  assert.equal(state.pillars[3].icon, '📚');
});

test('upsertPillar: cập nhật pillar có sẵn (không duplicate)', () => {
  const state = { pillars: defaultTemplate(tr) };
  const p = upsertPillar(state, { id: 'p1', name: 'Sức khỏe', icon: '🏃', hidden: true });
  assert.equal(state.pillars.length, 3);
  assert.equal(state.pillars[0].name, 'Sức khỏe');
  assert.equal(state.pillars[0].icon, '🏃');
  assert.equal(state.pillars[0].hidden, true);
});

test('upsertPillar: tên trống → null, không thêm', () => {
  const state = { pillars: defaultTemplate(tr) };
  const p = upsertPillar(state, { name: '   ' });
  assert.equal(p, null);
  assert.equal(state.pillars.length, 3);
});

test('removePillar: xoá đúng id; trả về false nếu không tồn tại', () => {
  const state = { pillars: defaultTemplate(tr) };
  assert.equal(removePillar(state, 'p2'), true);
  assert.equal(state.pillars.length, 2);
  assert.ok(!state.pillars.some((p) => p.id === 'p2'));
  assert.equal(removePillar(state, 'p99'), false);
});

test('togglePillarHidden: ẩn/hiện qua lại', () => {
  const state = { pillars: defaultTemplate(tr) };
  const p = togglePillarHidden(state, 'p1');
  assert.equal(p.hidden, true);
  assert.equal(visiblePillars(state).length, 2);
  togglePillarHidden(state, 'p1');
  assert.equal(visiblePillars(state).length, 3);
});

test('setFocus: cập nhật focus của đúng pillar; pillar lạ bị bỏ qua', () => {
  const state = { pillars: defaultTemplate(tr) };
  setFocus(state, 'p1', 'Duy trì năng lượng ổn định');
  assert.equal(state.pillars[0].focus, 'Duy trì năng lượng ổn định');
  setFocus(state, 'p1', '');
  assert.equal(state.pillars[0].focus, '');
  setFocus(state, 'p99', 'x');
  assert.equal(state.pillars[1].focus, '');
});

test('resetPillars: khôi phục template mặc định (xoá pillar tùy chỉnh)', () => {
  const state = { pillars: [
    { id: 'c1', name: 'Tùy chỉnh', icon: '🎨', hidden: false, focus: 'x' },
    { id: 'p2', name: 'Giữ tên?', icon: '🎯', hidden: true, focus: 'y' },
  ] };
  resetPillars(state, tr);
  assert.equal(state.pillars.length, 3);
  assert.deepEqual(state.pillars.map((p) => p.id), ['p1', 'p2', 'p3']);
  assert.equal(state.pillars[0].name, 'Body');
  assert.equal(state.pillars[0].focus, '');
  assert.equal(state.pillars[0].hidden, false);
});

test('pillarById: tìm đúng / null khi không có', () => {
  const state = { pillars: defaultTemplate(tr) };
  assert.equal(pillarById(state, 'p2').name, 'Main Work');
  assert.equal(pillarById(state, 'zz'), null);
});

test('visiblePillars: bỏ pillar ẩn, giữ thứ tự', () => {
  const state = { pillars: [
    { id: 'a', name: 'A', icon: '1', hidden: false, focus: '' },
    { id: 'b', name: 'B', icon: '2', hidden: true, focus: '' },
    { id: 'c', name: 'C', icon: '3', hidden: false, focus: '' },
  ] };
  assert.deepEqual(visiblePillars(state).map((p) => p.id), ['a', 'c']);
});

test('ICONS: palette có icon mặc định của template', () => {
  assert.ok(ICONS.includes('💪'));
  assert.ok(ICONS.includes('🎯'));
  assert.ok(ICONS.includes('🤝'));
  assert.ok(ICONS.length >= 12);
});

/* ---------------- Wiring assertions (app.html / sw.js / i18n) ---------------- */

test('wiring: app.html nạp pillars.min.js trước app.min.js', () => {
  const pi = APP.indexOf('js/pillars.min.js');
  const ai = APP.indexOf('js/app.min.js');
  assert.ok(pi >= 0, 'pillars.min.js phải có trong app.html');
  assert.ok(ai > pi, 'pillars.min.js phải nạp trước app.min.js (guard trong app.js)');
});

test('wiring: sw.js precache pillars.min.js', () => {
  assert.ok(SW.includes("'./js/pillars.min.js'"), 'sw.js phải precache pillars.min.js');
});

test('wiring: i18n có đủ key pillars (vi + en)', () => {
  const vi = APP_JS ? I18N_JS : I18N_JS; // giữ signature — đọc trực tiếp
  const keys = ['pillarTitle', 'pillarBody', 'pillarWork', 'pillarSocial', 'pillarAdd',
    'pillarFocusPh', 'pillarEdit', 'pillarDel', 'pillarSave', 'pillarsReset'];
  keys.forEach((k) => {
    assert.ok(vi.includes(k + ": '") || vi.includes(k + ': \''), `thiếu key ${k} (dạng key: '...')`);
    assert.ok(vi.includes(k + ": '") || vi.includes(k + ': \''), `key ${k} chỉ có 1 bản?`);
  });
  // vi != en cho ít nhất tên trụ cột
  const bodyVi = I18N_JS.match(/pillarBody: '([^']+)'/)[1];
  const bodyEn = I18N_JS.match(/pillarBody: '([^']+)'/g);
  assert.equal(bodyEn.length, 2, 'pillarBody phải có cả vi lẫn en');
  assert.equal(bodyVi, 'Cơ thể');
});

test('wiring: app.js guard + migration hooks + dispatcher', () => {
  assert.ok(APP_JS.includes("TaskFlowPillars missing"));
  assert.ok(APP_JS.includes('window.TaskFlowPillars.ensurePillars'), 'loadState/loadMonthStateOrCreate/save phải gọi ensurePillars');
  assert.ok(APP_JS.includes("'pillar-save'"), 'dispatcher phải có pillar-save');
  assert.ok(APP_JS.includes("'pillar-toggle'"), 'dispatcher phải có pillar-toggle');
  assert.ok(APP_JS.includes("'pillars-reset'"), 'dispatcher phải có pillars-reset');
  assert.ok(APP_JS.includes('data-pillar-focus') || APP_JS.includes('dataset.pillarFocus'), 'input listener phải xử lý pillarFocus');
  assert.ok(APP_JS.includes('pillarsBlockHTML'), 'goalsPanelHTML phải render pillarsBlockHTML');
});
