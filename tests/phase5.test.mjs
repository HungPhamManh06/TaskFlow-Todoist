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
   Phase 5.2b — Kéo-thả CHÉO giữa task ưu tiên ↔ task thường
   ============================================================ */

const T = (kind, text) => ({ kind, text, done: false, tags: [] });

const sameOrder = (a, b) => a.map((x) => x.text).join('|') === b.map((x) => x.text).join('|');
const kinds = (a) => a.map((x) => x.kind);

test('5.2b: reorderTask đổi nhóm ưu tiên → thường (đổi kind, chèn đúng vị trí)', () => {
  const tasks = [T('priority', 'A'), T('regular', 'B'), T('regular', 'C')];
  // Kéo A (ưu tiên, from 0) thả lên C (thường, vị trí nhóm 1)
  const out = PlanMath.reorderTask(tasks, 0, 'regular', 1);
  assert.deepEqual(out.map((x) => x.text), ['B', 'A', 'C'], 'A phải vào nhóm thường giữa B và C');
  assert.deepEqual(kinds(out), ['regular', 'regular', 'regular'], 'A phải đổi kind sang regular');
  assert.equal(tasks[0].kind, 'priority', 'mảng gốc không bị sửa (thuần)');
});

test('5.2b: reorderTask đổi nhóm thường → ưu tiên (chèn đầu nhóm)', () => {
  const tasks = [T('priority', 'A'), T('priority', 'B'), T('regular', 'C')];
  // Kéo C (thường, from 2) thả lên A (ưu tiên, vị trí nhóm 0)
  const out = PlanMath.reorderTask(tasks, 2, 'priority', 0);
  assert.deepEqual(out.map((x) => x.text), ['C', 'A', 'B']);
  assert.deepEqual(kinds(out), ['priority', 'priority', 'priority']);
});

test('5.2b: reorderTask sắp xếp lại trong CÙNG nhóm (không đổi kind)', () => {
  const tasks = [T('priority', 'A'), T('priority', 'B'), T('priority', 'C')];
  // Kéo A (from 0) thả lên C (vị trí nhóm 2) → A xuống cuối
  const out = PlanMath.reorderTask(tasks, 0, 'priority', 2);
  assert.deepEqual(out.map((x) => x.text), ['B', 'C', 'A']);
  assert.deepEqual(kinds(out), ['priority', 'priority', 'priority']);
});

test('5.2b: reorderTask toPos >= số task nhóm đích → chèn cuối nhóm (append)', () => {
  const tasks = [T('priority', 'A'), T('regular', 'B')];
  const out = PlanMath.reorderTask(tasks, 0, 'regular', 99);
  assert.deepEqual(out.map((x) => x.text), ['B', 'A'], 'A chèn cuối nhóm regular');
  assert.deepEqual(kinds(out), ['regular', 'regular']);
});

test('5.2b: reorderTask mảng xáo trộn liên nhóm vẫn chèn đúng (index phẳng không theo nhóm)', () => {
  const tasks = [T('priority', 'P1'), T('regular', 'R1'), T('priority', 'P2')];
  // Kéo R1 (from 1) thả lên P2 (vị trí nhóm priority 1) → R1 đổi sang priority, xen giữa P1..P2
  const out = PlanMath.reorderTask(tasks, 1, 'priority', 1);
  assert.deepEqual(out.map((x) => x.text), ['P1', 'R1', 'P2']);
  assert.deepEqual(kinds(out), ['priority', 'priority', 'priority']);
});

test('5.2b: reorderTask giữ nguyên mảng khi index/kind không hợp lệ', () => {
  const tasks = [T('priority', 'A'), T('regular', 'B')];
  assert.ok(sameOrder(PlanMath.reorderTask(tasks, -1, 'regular', 0), tasks), 'fromIdx âm → trả nguyên');
  assert.ok(sameOrder(PlanMath.reorderTask(tasks, 5, 'regular', 0), tasks), 'fromIdx quá lớn → trả nguyên');
  assert.ok(sameOrder(PlanMath.reorderTask(tasks, 0, 'bogus', 0), tasks), 'kind lạ → trả nguyên');
});

test('5.2b: reorderTask trả về ĐÚNG mảng gốc khi không đổi (no-op, chống phantom undo)', () => {
  const tasks = [T('priority', 'A'), T('priority', 'B'), T('regular', 'C')];
  // Thả task cuối nhóm ưu tiên (B) lên vùng nhóm ưu tiên của nó → hiển thị không đổi
  assert.equal(PlanMath.reorderTask(tasks, 1, 'priority', 2), tasks, 'cuối nhóm + vùng của nó → no-op');
  // Thả task đầu nhóm về đúng vị trí cũ của nó → no-op
  assert.equal(PlanMath.reorderTask(tasks, 0, 'priority', 0), tasks, 'về đúng vị trí cũ → no-op');
  // Nhưng chuyển sang nhóm khác dù chỉ 1 task → vẫn đổi (mảng mới)
  const moved = PlanMath.reorderTask(tasks, 1, 'regular', 0);
  assert.notEqual(moved, tasks, 'đổi nhóm → mảng mới');
  assert.deepEqual(kinds(moved), ['priority', 'regular', 'regular']);
});

test('5.2b: task row có data-kind/data-pos + vùng nhóm data-drop=taskzone', () => {
  assert.match(APP_JS, /data-drop="taskzone"/);
  assert.match(APP_JS, /data-pos="/);
  assert.match(APP_JS, /data-kind="\$\{task\.kind\}"/);
  assert.match(APP_JS, /PlanMath\.reorderTask/);
  assert.match(APP_JS, /toPos = d\.tasks\.filter\(\(x\) => x\.kind === toKind\)\.length/);
  assert.match(CSS, /\.task-rows\.drag-over/);
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
   Phase 5.8 — Nút ＋ tạo task nhảy thẳng vào ô viết task
   ============================================================ */

test('5.8: nút + tạo task → focus ngay ô viết task mới', () => {
  assert.match(APP_JS, /act === 'addtask'/);
  assert.match(APP_JS, /d\.tasks\.push\(\{ kind: el\.dataset\.kind/);
  assert.match(APP_JS, /data-role=\"task-text\"/);
  assert.match(APP_JS, /d\.tasks\.length - 1/);
  assert.match(APP_JS, /fresh\.focus\(\)/);
});

/* ============================================================
   Phase 5 — Version bumps
   ============================================================ */

test('Phase 5: version bumps app.js>=38 styles.css>=44 plan-math>=2 sw cache>=v33', () => {
  const am = /js\/app\.js\?v=(\d{2,3})/.exec(APP_HTML);
  assert.ok(am && Number(am[1]) >= 38, `app.js version phải >= 38 (thấy ${am && am[1]})`);
  const cm = /css\/styles\.css\?v=(\d{2,3})/.exec(APP_HTML);
  assert.ok(cm && Number(cm[1]) >= 44, `styles.css version phải >= 44 (thấy ${cm && cm[1]})`);
  assert.match(APP_HTML, /js\/plan-math\.js\?v=([2-9]|\d{2})/);
  const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const m = /const CACHE = 'taskflow-v(\d+)';/.exec(SW);
  assert.ok(Number(m[1]) >= 33);
});
