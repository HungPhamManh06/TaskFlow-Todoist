import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import PlanMath from '../js/plan-math.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const APP_HTML = readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const CSS = readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');

/* ============================================================
   Phase 5.1 — Undo / Redo (PlanMath.makeUndoStack + UI)
   ============================================================ */

test('5.1: makeUndoStack push/undo/redo/canUndo/clear', () => {
  const s = PlanMath.makeUndoStack(3);
  assert.equal(s.canUndo(), false);
  s.push({ a: 1 });
  s.push({ a: 2 });
  s.push({ a: 3 });
  s.push({ a: 4 }); // limit 3 → bỏ bản {a:1} cũ nhất
  assert.equal(s.canUndo(), true);
  assert.deepEqual(s.undo(), { a: 4 });
  assert.deepEqual(s.undo(), { a: 3 });
  assert.deepEqual(s.undo(), { a: 2 });
  assert.equal(s.undo(), null); // hết
  assert.equal(s.canUndo(), false);
});

test('5.1: makeUndoStack redo sau khi undo', () => {
  const s = PlanMath.makeUndoStack(5);
  s.push({ v: 1 });
  s.push({ v: 2 });
  assert.deepEqual(s.undo(), { v: 2 });
  assert.deepEqual(s.undo(), { v: 1 });
  assert.equal(s.canRedo(), true);
  assert.deepEqual(s.redo(), { v: 1 });
  assert.deepEqual(s.redo(), { v: 2 });
  assert.equal(s.redo(), null);
});

test('5.1: makeUndoStack push mới sau undo → clear redo', () => {
  const s = PlanMath.makeUndoStack(5);
  s.push({ v: 1 });
  s.push({ v: 2 });
  s.undo();
  s.push({ v: 3 }); // nhánh mới → xoá redo
  assert.equal(s.canRedo(), false);
});

test('5.1: undo/redo UI + nút header + Ctrl+Z', () => {
  assert.match(APP_HTML, /data-action="undo"/);
  assert.match(APP_HTML, /data-action="redo"/);
  assert.match(APP_HTML, /id="btnUndo"/);
  assert.match(APP_HTML, /id="btnRedo"/);
  assert.match(APP_JS, /makeUndoStack\(50\)/);
  assert.match(APP_JS, /function pushUndo\(\)/);
  assert.match(APP_JS, /function doUndo\(\)/);
  assert.match(APP_JS, /function doRedo\(\)/);
  assert.match(APP_JS, /function updateUndoButtons\(\)/);
  assert.match(APP_JS, /const k = \(e\.key \|\| ''\)\.toLowerCase\(\)/);
  assert.match(APP_JS, /k === 'z'/);
  assert.match(APP_JS, /UNDOABLE_ACTS/);
  assert.match(APP_JS, /pushUndo\(\)/);
});

test('5.1: i18n undo/redo keys đủ vi+en', () => {
  assert.ok(APP_JS.includes("undoBtn: '↩️ Hoàn tác (Ctrl+Z)'") && APP_JS.includes("undoBtn: '↩️ Undo (Ctrl+Z)'"), 'thiếu undoBtn');
  assert.ok(APP_JS.includes("redoBtn: '↪️ Làm lại (Ctrl+Shift+Z)'") && APP_JS.includes("redoBtn: '↪️ Redo (Ctrl+Shift+Z)'"), 'thiếu redoBtn');
});

/* ============================================================
   Phase 5.2 — Kéo-thả sắp xếp
   ============================================================ */

test('5.2: draggable trên task/goal/habit + drag events', () => {
  assert.match(APP_JS, /draggable="true"/);
  assert.match(APP_JS, /data-drag="task"/);
  assert.match(APP_JS, /data-drag="goal"/);
  assert.match(APP_JS, /data-drag="habit"/);
  assert.match(APP_JS, /dragstart/);
  assert.match(APP_JS, /dataTransfer\.setData/);
  assert.match(APP_JS, /'drop'/);
  assert.match(APP_JS, /'dragover'/);
  assert.match(APP_JS, /reorder_task/);
  assert.match(APP_JS, /reorder_goal/);
  assert.match(APP_JS, /reorder_habit/);
  assert.match(CSS, /\.drag-over/);
});

test('5.2: i18n dragHint đủ vi+en', () => {
  assert.ok(APP_JS.includes("dragHint: 'Kéo để sắp xếp lại'") && APP_JS.includes("dragHint: 'Drag to reorder'"), 'thiếu dragHint');
});

/* ============================================================
   Phase 5.3 — Phím tắt
   ============================================================ */

test('5.3: Ctrl+K search + số 1-5 view + / thêm task', () => {
  assert.match(APP_JS, /k === 'k'/);
  assert.match(APP_JS, /toggleSearchModal\(\)/);
  assert.match(APP_JS, /\['overview', 'week', 'year', 'calendar', 'week'\]/);
  assert.match(APP_JS, /focusTodayTaskAdd\(\)/);
});

test('5.3: i18n shortcutHint đủ vi+en', () => {
  assert.ok(APP_JS.includes("shortcutHint: 'Phím tắt: Ctrl+K tìm kiếm") && APP_JS.includes("shortcutHint: 'Shortcuts: Ctrl+K search"), 'thiếu shortcutHint');
});

/* ============================================================
   Phase 5.4 — Sao lưu tự động
   ============================================================ */

test('5.4: ring buffer backup + modal khôi phục', () => {
  assert.match(APP_JS, /planner-backup-/);
  assert.match(APP_JS, /function rotateBackup\(/);
  assert.match(APP_JS, /BACKUP_SLOTS = 7/);
  assert.match(APP_JS, /function maybeAutoBackup\(/);
  assert.match(APP_JS, /function listBackups\(/);
  assert.match(APP_JS, /function doRestoreBackup\(/);
  assert.match(APP_HTML, /id="backupModal"/);
  assert.match(APP_HTML, /data-action="backup-restore"/);
  assert.match(APP_JS, /data-action="backup-use"/);
});

test('5.4: i18n backup keys đủ vi+en', () => {
  assert.ok(APP_JS.includes("backupRestore: '🕑 Khôi phục bản sao lưu tự động'") && APP_JS.includes("backupRestore: '🕑 Restore auto backup'"), 'thiếu backupRestore');
  assert.ok(APP_JS.includes("backupEmpty: 'Chưa có bản sao lưu nào") && APP_JS.includes("backupEmpty: 'No backups yet"), 'thiếu backupEmpty');
});

/* ============================================================
   Phase 5.5 — Kích hoạt Analytics & Feedback
   ============================================================ */

test('5.5: nút feedback + FB_FORM_URL handler', () => {
  assert.match(APP_HTML, /data-action="feedback"/);
  assert.match(APP_JS, /act === 'feedback'/);
  assert.match(APP_JS, /FB_FORM_URL/);
});

/* ============================================================
   Phase 5.6 — Focus Mode
   ============================================================ */

test('5.6: focus overlay + open/close + body.focus-mode', () => {
  assert.match(APP_HTML, /id="focusOverlay"/);
  assert.match(APP_HTML, /data-action="focus-close"/);
  assert.match(APP_JS, /function openFocusMode\(\)/);
  assert.match(APP_JS, /function closeFocusMode\(\)/);
  assert.match(APP_JS, /function renderFocusContent\(\)/);
  assert.match(APP_JS, /focus-mode/);
  assert.match(APP_HTML, /data-action="focus"/);
  assert.match(CSS, /\.focus-overlay/);
  assert.match(CSS, /body\.focus-mode/);
});

test('5.6: i18n focus keys đủ vi+en', () => {
  assert.ok(APP_JS.includes("focusTitle: '🎯 Chế độ Tập trung'") && APP_JS.includes("focusTitle: '🎯 Focus Mode'"), 'thiếu focusTitle');
  assert.ok(APP_JS.includes("focusToday: 'Task hôm nay'") && APP_JS.includes("focusToday: \"Today's tasks\""), 'thiếu focusToday');
});

/* ============================================================
   Phase 5 — Version bumps
   ============================================================ */

test('Phase 5: version bumps app.js>=38 styles.css>=44 plan-math>=2 sw cache>=v33', () => {
  assert.match(APP_HTML, /js\/app\.js\?v=(3[8-9]|\d{3})/);
  assert.match(APP_HTML, /css\/styles\.css\?v=(4[4-9]|[5-9]\d|\d{3})/);
  assert.match(APP_HTML, /js\/plan-math\.js\?v=([2-9]|\d{2})/);
  const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const m = /const CACHE = 'taskflow-v(\d+)';/.exec(SW);
  assert.ok(Number(m[1]) >= 33);
});
