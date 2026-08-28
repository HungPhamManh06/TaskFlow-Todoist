import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import PlanMath from '../js/plan-math.js';
import Util from '../js/util.js';
import I18N from '../js/i18n.js';
import Storage from '../js/storage.js';
import Account from '../js/account.js';
import Dates from '../js/dates.js';
import Stats from '../js/stats.js';
import Habits from '../js/habits.js';
import Keys from '../js/keys.js';
import Remind from '../js/remind.js';
import Theme from '../js/theme.js';
import Analytics from '../js/analytics.js';
import Export from '../js/export.js';
import Streak from '../js/streak.js';
import Goals from '../js/goals.js';
import Fab from '../js/fab.js';
import SyncUI from '../js/syncui.js';
import PlanMini from '../js/planmini.js';
import Clock from '../js/clock.js';
import Shell from '../js/shell.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const I18N_JS = readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');
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

test('5.1: makeUndoStack redo sau khi undo (before/after model)', () => {
  const s = PlanMath.makeUndoStack(5);
  s.push({ v: 1 }); // push A
  s.push({ v: 2 }); // push B
  // State sequence: A → B → C (current=C)
  // undo: pop B from undo, push C to redo → returns B
  assert.deepEqual(s.undo({ v: 3 }), { v: 2 });
  // undo: pop A from undo, push B to redo → returns A
  assert.deepEqual(s.undo({ v: 2 }), { v: 1 });
  assert.equal(s.canRedo(), true);
  // redo: pop B from redo, push A to undo → returns B
  assert.deepEqual(s.redo({ v: 1 }), { v: 2 });
  // redo: pop C from redo, push B to undo → returns C
  assert.deepEqual(s.redo({ v: 2 }), { v: 3 });
  assert.equal(s.redo({ v: 3 }), null); // redo empty
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
  assert.ok(I18N_JS.includes("undoBtn: '↩️ Hoàn tác (Ctrl+Z)'") && I18N_JS.includes("undoBtn: '↩️ Undo (Ctrl+Z)'"), 'thiếu undoBtn');
  assert.ok(I18N_JS.includes("redoBtn: '↪️ Làm lại (Ctrl+Shift+Z)'") && I18N_JS.includes("redoBtn: '↪️ Redo (Ctrl+Shift+Z)'"), 'thiếu redoBtn');
});

/* ============================================================
   Phase 5.2 — Kéo-thả sắp xếp
   ============================================================ */

test('5.2: draggable trên task/goal/habit + drag events', () => {
  assert.match(APP_JS, /draggable="true"/);
  assert.match(readFileSync(path.join(ROOT, 'js/today.js'), 'utf8'), /data-drag="task"/);
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
  assert.ok(I18N_JS.includes("dragHint: 'Kéo để sắp xếp lại'") && I18N_JS.includes("dragHint: 'Drag to reorder'"), 'thiếu dragHint');
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
  assert.match(readFileSync(path.join(ROOT, 'js/today.js'), 'utf8'), /data-pos="/);
  assert.match(readFileSync(path.join(ROOT, 'js/today.js'), 'utf8'), /data-kind="\$\{task\.kind\}"/);
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
  assert.ok(I18N_JS.includes("shortcutHint: 'Phím tắt: Ctrl+K tìm kiếm") && I18N_JS.includes("shortcutHint: 'Shortcuts: Ctrl+K search"), 'thiếu shortcutHint');
});

/* ============================================================
   Phase 5.4 — Sao lưu tự động
   ============================================================ */

test('5.4: ring buffer backup + modal khôi phục (module js/backup.js, lazy)', () => {
  const BK = readFileSync(path.join(ROOT, 'js/backup.js'), 'utf8');
  assert.match(BK, /planner-backup-/);
  assert.match(BK, /function rotateBackup\(/);
  assert.match(BK, /BACKUP_SLOTS = 7/);
  assert.match(BK, /function maybeAutoBackup\(/);
  assert.match(BK, /function listBackups\(/);
  assert.match(BK, /function doRestoreBackup\(/);
  assert.match(APP_HTML, /id="backupModal"/);
  assert.match(APP_HTML, /data-action="backup-restore"/);
  assert.match(BK, /data-action="backup-use"/);
});

test('5.4: i18n backup keys đủ vi+en', () => {
  assert.ok(I18N_JS.includes("backupRestore: 'Khôi phục bản sao lưu tự động'") && I18N_JS.includes("backupRestore: 'Restore auto backup'"), 'thiếu backupRestore');
  assert.ok(I18N_JS.includes("backupEmpty: 'Chưa có bản sao lưu nào") && I18N_JS.includes("backupEmpty: 'No backups yet"), 'thiếu backupEmpty');
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
  assert.match(readFileSync(path.join(ROOT, 'js/focus.js'), 'utf8'), /function openFocusMode\(ref\)/);
  assert.match(readFileSync(path.join(ROOT, 'js/focus.js'), 'utf8'), /function closeFocusMode\(\)/);
  assert.match(readFileSync(path.join(ROOT, 'js/focus.js'), 'utf8'), /function renderFocusContent\(\)/);
  assert.match(readFileSync(path.join(ROOT, 'js/focus.js'), 'utf8'), /focus-mode/);
  // P4: nút Focus đã bỏ khỏi tools drawer — reachable qua sidebar (buildNav actionBtn)
  assert.match(APP_JS, /actionBtn\('focus', 'focus'/);
  assert.match(CSS, /\.focus-overlay/);
  assert.match(CSS, /body\.focus-mode/);
});

test('5.6: i18n focus keys đủ vi+en', () => {
  assert.ok(I18N_JS.includes("focusTitle: '🎯 Chế độ Tập trung'") && I18N_JS.includes("focusTitle: '🎯 Focus Mode'"), 'thiếu focusTitle');
  assert.ok(I18N_JS.includes("focusToday: 'Task hôm nay'") && I18N_JS.includes("focusToday: \"Today's tasks\""), 'thiếu focusToday');
});

/* ============================================================
   Phase 5.8 — Nút ＋ tạo task nhảy thẳng vào ô viết task
   ============================================================ */

test('5.8: nút + tạo task → focus ngay ô viết task mới', () => {
  assert.match(APP_JS, /act === 'addtask'/);
  // Phase 12: allow either canonical TaskFlowTaskStore.create or legacy direct push
  assert.ok(
    /TaskFlowTaskStore\.create\(d\.tasks/.test(APP_JS) || /d\.tasks\.push\(\{ uid: newTaskUid/.test(APP_JS),
    'addtask handler must create task via TaskFlowTaskStore.create or legacy push'
  );
  assert.match(APP_JS, /data-role=\"task-text\"/);
  assert.match(APP_JS, /d\.tasks\.length - 1/);
  assert.match(APP_JS, /fresh\.focus\(\)/);
});





/* ============================================================
   Phase 7.1 — Task lặp lại (recurring)
   ============================================================ */

test('7.1: task lặp lại (recurring)', () => {
  assert.match(readFileSync(path.join(ROOT, 'js/today.js'), 'utf8'), /data-action="repeat-edit"/);
  assert.match(APP_JS, /function applyRecurrence\(\)/);
  assert.match(APP_JS, /repeat\.freq/);
  assert.match(APP_JS, /beginRepeatEdit/);
  // Nút 🔁 phải được wire vào click handler (từng bị chết: beginRepeatEdit không được gọi)
  assert.match(APP_JS, /act === 'repeat-edit'/);
  assert.ok(APP_JS.includes('repeatOff') && APP_JS.includes('repeatDaily'), 'thiếu repeat i18n usage');
  // applyRecurrence phải đẻ vào ngày HÔM NAY (dayIdx) chứ không phải ngày quá khứ
  assert.match(APP_JS, /planRecurrence\(state\.weeks, ti\.dayIdx\)/);
  // P10: recurrence chạy qua data lifecycle (prepareTodayState), KHÔNG còn trong renderWeek
  assert.match(APP_JS, /function prepareTodayState\(\)[\s\S]*?applyRecurrence\(\) > 0/);
  assert.doesNotMatch(APP_JS, /function renderWeek\(\)[\s\S]*?applyRecurrence\(\)/);
});

test('7.1b: planRecurrence sinh bản sao task lặp quá khứ vào hôm nay', () => {
  const weeks = [
    { n: 1, days: [
      { tasks: [{ kind: 'priority', text: 'Đọc sách', done: true, repeat: { freq: 'daily', every: 1 } }] }, // CN (quá khứ)
      { tasks: [] }, { tasks: [] }, { tasks: [] }, { tasks: [] }, { tasks: [] }, { tasks: [] },
    ]},
  ];
  const res = PlanMath.planRecurrence(weeks, 3); // hôm nay = chỉ số 3
  assert.equal(res.copies.length, 1);
  assert.equal(res.copies[0].text, 'Đọc sách');
  assert.equal(res.copies[0].done, false, 'bản sao chưa hoàn thành');
  assert.equal(res.copies[0].repeat.freq, 'daily', 'bản sao giữ repeat để chuỗi tiếp tục');
  assert.equal(res.copies[0]._recurred, undefined, 'bản sao KHÔNG bị đánh dấu _recurred');
  assert.equal(res.mark.length, 1);
  assert.equal(res.mark[0], weeks[0].days[0].tasks[0], 'đánh dấu task GỐC');
  assert.equal(weeks[0].days[0].tasks[0]._recurred, undefined, 'hàm thuần: không mutate đầu vào');
});

test('7.1c: planRecurrence không sinh trùng khi đã có task tương tự từ hôm nay trở đi', () => {
  const weeks = [
    { n: 1, days: [
      { tasks: [{ kind: 'regular', text: 'Gym', done: true, repeat: { freq: 'weekly', every: 1 } }] },
      { tasks: [] }, { tasks: [] }, { tasks: [] },
      { tasks: [{ kind: 'regular', text: 'Gym', done: false }] }, // hôm nay đã có sẵn
      { tasks: [] }, { tasks: [] },
    ]},
  ];
  const res = PlanMath.planRecurrence(weeks, 4);
  assert.equal(res.copies.length, 0);
  assert.equal(res.mark.length, 0);
});

test('7.1d: planRecurrence chỉ sinh 1 bản khi nhiều ngày quá khứ cùng text', () => {
  const weeks = [
    { n: 1, days: [
      { tasks: [{ kind: 'priority', text: 'Nước', repeat: { freq: 'daily', every: 1 } }] },
      { tasks: [{ kind: 'priority', text: 'Nước', repeat: { freq: 'daily', every: 1 } }] },
      { tasks: [] }, { tasks: [] }, { tasks: [] }, { tasks: [] }, { tasks: [] },
    ]},
  ];
  const res = PlanMath.planRecurrence(weeks, 3);
  assert.equal(res.copies.length, 1);
  assert.equal(res.mark.length, 1);
});

test('7.1e: planRecurrence bỏ qua task đã _recurred và task không repeat', () => {
  const weeks = [
    { n: 1, days: [
      { tasks: [
        { kind: 'priority', text: 'A', repeat: { freq: 'daily', every: 1 }, _recurred: true },
        { kind: 'regular', text: 'B', done: false },
        { kind: 'regular', text: 'C', repeat: null },
      ]},
      { tasks: [] }, { tasks: [] }, { tasks: [] }, { tasks: [] }, { tasks: [] }, { tasks: [] },
    ]},
  ];
  const res = PlanMath.planRecurrence(weeks, 3);
  assert.equal(res.copies.length, 0);
  assert.equal(res.mark.length, 0);
});

test('7.1f: planRecurrence task hôm nay trở đi không sinh bản mới', () => {
  const weeks = [
    { n: 1, days: [
      { tasks: [] }, { tasks: [] }, { tasks: [] },
      { tasks: [{ kind: 'priority', text: 'Tương lai', repeat: { freq: 'daily', every: 1 } }] }, // hôm nay
      { tasks: [] }, { tasks: [] }, { tasks: [] },
    ]},
  ];
  const res = PlanMath.planRecurrence(weeks, 3);
  assert.equal(res.copies.length, 0);
});

/* ============================================================
   Phase 7.2 — Kéo-thả task qua ngày khác
   ============================================================ */

test('7.2: kéo-thả task qua ngày khác', () => {
  assert.match(APP_JS, /moveTaskAcrossDays/);
  assert.match(APP_JS, /zone\.dataset\.day !== dragState\.day/);
  assert.match(APP_JS, /move_task_across_days/);
  // TDZ: `let toKind` phải khai báo TRƯỚC chỗ gán `toKind = zone.dataset.kind` —
  // trước đây gán trước khai báo làm drop qua ngày vỡ với ReferenceError.
  const decl = APP_JS.indexOf('let toKind');
  const assign = APP_JS.indexOf('toKind = zone.dataset.kind');
  assert.ok(decl >= 0 && assign > decl, `toKind phải khai báo trước khi gán (decl=${decl}, assign=${assign})`);
});

test('7.2b: moveTaskAcrossDays đổi ngày', () => {
  const from = [{ kind: 'priority', text: 'A', done: false }];
  const to = [{ kind: 'regular', text: 'B', done: false }];
  const r = PlanMath.moveTaskAcrossDays(from, to, 0, 'regular');
  assert.equal(r.tasksFrom.length, 0);
  assert.equal(r.tasksTo.length, 2);
  assert.equal(r.tasksTo[1].kind, 'regular');
  assert.equal(from[0].kind, 'priority', 'mảng gốc không bị sửa');
});

/* ============================================================
   Phase 7.3 — Habit heatmap năm
   ============================================================ */

test('7.3: habit heatmap năm', () => {
  assert.match(APP_JS, /function yearHabitHeatmapHTML\(\)/);
  assert.match(APP_JS, /yhm-cell/);
  assert.match(APP_JS, /habitYearMatrix/);
  assert.match(CSS, /\.yhm-cell/);
  assert.match(CSS, /\.year-heat-card/);
});

/* ============================================================
   Phase 7.4 — Undo/redo phủ mood, theme, repeat
   ============================================================ */

test('7.4: undo/redo phủ mood, theme, repeat', () => {
  assert.match(APP_JS, /snap\.mood/);
  assert.match(APP_JS, /snap\.theme/);
  assert.match(APP_JS, /snap\.plan/);
  assert.match(APP_JS, /saveMood\(\)/);
  assert.match(APP_JS, /setTheme\(snap\.theme\)/);
});

/* ============================================================
   Phase 7.5 — Ngày nghỉ habit (skip days)
   ============================================================ */

test('7.5: ngày nghỉ habit (skip days)', () => {
  assert.match(APP_JS, /data-context="habit-day"/);
  assert.match(APP_JS, /habit_skip_day/);
  assert.match(APP_JS, /if \(!Array\.isArray\(h\.skipDays\)\) h\.skipDays = \[\]/);
  assert.match(CSS, /\.day-cell\.skipped/);
});

/* ============================================================
   Phase 8 — Widget Dashboard System
   ============================================================ */

test('8.1: widget config + helpers', () => {
  assert.match(APP_JS, /WIDGET_DEFS_OVERVIEW/);
  assert.match(APP_JS, /WIDGET_DEFS_YEAR/);
  const WIDGET_MOD = readFileSync(path.join(ROOT, 'js/widget.js'), 'utf8');
  assert.match(WIDGET_MOD, /function initWidgetConfig/);
  assert.match(WIDGET_MOD, /function saveWidgetConfig/);
  assert.match(WIDGET_MOD, /function getVisibleWidgets/);
  assert.match(APP_JS, /function openWidgetSettingsModal/);
  assert.match(APP_JS, /function renderWidgetSettingsModal/);
  assert.match(WIDGET_MOD, /widgetConfigKey/);
  assert.match(WIDGET_MOD, /planner-widgets-/);
});

test('8.2: renderOverview dùng widget config', () => {
  assert.match(APP_JS, /getVisibleWidgets\('overview'\)/);
  assert.match(APP_JS, /overview-primary-grid/);
  assert.match(APP_JS, /data-action="widget-settings"/);
});

test('8.3: renderYear dùng widget config', () => {
  assert.match(APP_JS, /getVisibleWidgets\('year'\)/);
  assert.match(APP_JS, /data-action="widget-settings"/);
});

test('8.4: widget settings modal trong HTML', () => {
  assert.match(APP_HTML, /id="widgetSettingsModal"/);
  assert.match(APP_HTML, /data-action="widget-save"/);
  assert.match(APP_HTML, /data-action="widget-close"/);
  assert.match(APP_HTML, /widget-list/);
});

test('8.5: i18n widget keys đủ vi+en', () => {
  assert.ok(I18N_JS.includes("widgetSettings: 'Tuỳ chỉnh Widget'") && I18N_JS.includes("widgetSettings: 'Customize Widgets'"), 'thiếu widgetSettings');
  assert.ok(I18N_JS.includes("widgetSave: 'Lưu'") && I18N_JS.includes("widgetSave: 'Save'"), 'thiếu widgetSave');
  assert.ok(I18N_JS.includes("widgetHide: 'Ẩn widget này'") && I18N_JS.includes("widgetHide: 'Hide this widget'"), 'thiếu widgetHide');
  assert.ok(I18N_JS.includes("widgetShow: 'Hiện widget này'") && I18N_JS.includes("widgetShow: 'Show this widget'"), 'thiếu widgetShow');
  // Kiểm tra widgetLabel overview
  assert.ok(I18N_JS.includes("'widgetLabel_date-card': 'Ngày tháng'") && I18N_JS.includes("'widgetLabel_date-card': 'Date card'"), 'thiếu widgetLabel_date-card');
  assert.ok(I18N_JS.includes("widgetLabel_goals: 'Mục tiêu tháng'") && I18N_JS.includes("widgetLabel_goals: 'Monthly goals'"), 'thiếu widgetLabel_goals');
  assert.ok(I18N_JS.includes("widgetLabel_mood: 'Tâm trạng'") && I18N_JS.includes("widgetLabel_mood: 'Mood'"), 'thiếu widgetLabel_mood');
  // Kiểm tra widgetLabel year
  assert.ok(I18N_JS.includes("'widgetLabel_year-card': 'Thông tin năm'") && I18N_JS.includes("'widgetLabel_year-card': 'Year info'"), 'thiếu widgetLabel_year-card');
  assert.ok(I18N_JS.includes("'widgetLabel_year-charts': 'Biểu đồ 12 tháng'") && I18N_JS.includes("'widgetLabel_year-charts': '12-month chart'"), 'thiếu widgetLabel_year-charts');
  assert.ok(I18N_JS.includes("'widgetLabel_year-heatmap': 'Habit Heatmap'") && I18N_JS.includes("'widgetLabel_year-heatmap': 'Habit Heatmap'"), 'thiếu widgetLabel_year-heatmap');
  assert.ok(I18N_JS.includes("'widgetLabel_year-reflections': 'Phản ánh quý'") && I18N_JS.includes("'widgetLabel_year-reflections': 'Quarterly reflections'"), 'thiếu widgetLabel_year-reflections');
});

test('8.6: CSS widget modal', () => {
  assert.match(CSS, /\.widget-item/);
  assert.match(CSS, /\.widget-toggle/);
  assert.match(CSS, /\.widget-handle/);
  assert.match(CSS, /\.widget-modal/);
  assert.match(CSS, /\.widget-list/);
  assert.match(CSS, /\.widget-settings-btn/);
});

/* ============================================================
   Phase 5 — Version bumps
   ============================================================ */

test('Phase 5: version bumps app.min.js>=38 styles.min.css>=44 plan-math.min.js>=2 sw cache>=v33', () => {
  // P1.2 opt#1: app.html trỏ js/*.min.js + css/*.min.css
  const am = /js\/app\.min\.js\?v=(\d{2,3})/.exec(APP_HTML);
  assert.ok(am && Number(am[1]) >= 38, `app.min.js version phải >= 38 (thấy ${am && am[1]})`);
  const cm = /css\/styles-(?:critical|deferred)\.min\.css\?v=(\d+)/.exec(APP_HTML);
  assert.ok(cm && Number(cm[1]) >= 1, `styles (critical/deferred) phải versioned (thấy ${cm && cm[1]})`);
  assert.match(APP_HTML, /js\/plan-math\.min\.js\?v=([2-9]|\d{2})/);
  const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const m = /const CACHE = 'taskflow-v(\d+)';/.exec(SW);
  assert.ok(Number(m[1]) >= 33);
});

test('P11: i18n.js helpers giữ nguyên behavior sau khi tách', () => {
  // t(): tra dictionary vi/en + fallback về key + biến {var}
  assert.ok(I18N.t('todayTitle').length > 0, 't() vi hoạt động');
  assert.equal(I18N.t('no_such_key_xyz'), 'no_such_key_xyz', 'fallback về key khi thiếu');
  assert.equal(I18N.t('weekN', { n: 7 }), I18N.I18N[I18N.getLang()].weekN.split('{n}').join('7'), 'thay thế {var}');
  // setLangCore + getLang: đổi ngôn ngữ và persist (localStorage không tồn tại ở Node → silent)
  const before = I18N.getLang();
  I18N.setLangCore('en');
  assert.equal(I18N.getLang(), 'en', 'setLangCore("en") cập nhật LANG');
  assert.ok(I18N.t('todayTitle').length > 0, 't() en hoạt động');
  I18N.setLangCore('vi');
  assert.equal(I18N.getLang(), 'vi', 'setLangCore("vi") phục hồi');
  assert.ok(before === 'vi' || before === 'en', 'LANG ban đầu hợp lệ');
  // monthLabel/dayLabel: label tháng + ngày theo LANG
  I18N.setLangCore('vi');
  assert.ok(I18N.monthLabel(0).length > 0, 'monthLabel vi');
  assert.ok(I18N.dayLabel(0).length > 0, 'dayLabel vi');
  I18N.setLangCore('en');
  assert.ok(I18N.monthLabel(0).length > 0, 'monthLabel en');
  assert.ok(I18N.dayLabel(0).length > 0, 'dayLabel en');
  // fmtDeadline: iso → nhãn ngắn; null/chuỗi lạ → fallback
  assert.equal(I18N.fmtDeadline(null), '');
  assert.equal(I18N.fmtDeadline('abc'), 'abc');
  assert.ok(I18N.fmtDeadline('2026-08-09').includes('08') || I18N.fmtDeadline('2026-08-09').includes('8'), 'fmtDeadline định dạng ngày');
  // dateLocale: vi → vi-VN, en → en-GB
  I18N.setLangCore('vi');
  assert.equal(I18N.dateLocale(), 'vi-VN');
  I18N.setLangCore('en');
  assert.equal(I18N.dateLocale(), 'en-GB');
  // dictionary đủ 2 ngôn ngữ cho key chính
  assert.ok(I18N.I18N.vi.todayTitle && I18N.I18N.en.todayTitle, 'I18N có vi+en');
});

test('P11: storage.js helpers giữ nguyên behavior sau khi tách', () => {
  // backupSlotKey: prefix đúng
  assert.equal(Storage.backupSlotKey(0), 'planner-backup-0');
  assert.equal(Storage.backupSlotKey(3), 'planner-backup-3');
  // POMO_LOG_KEY export đúng
  assert.equal(Storage.POMO_LOG_KEY, 'planner-pomo-log');
  // monthStateRaw: không có data → null; data hợp lệ → trả state
  const store = {};
  const origLS = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try {
    assert.equal(Storage.monthStateRaw(2026, 7), null, 'chưa có data → null');
    const st = { habits: [], monthlyGoals: [], weeks: [] };
    store['planner-2026-8'] = JSON.stringify(st);
    assert.deepEqual(Storage.monthStateRaw(2026, 7), st, 'data hợp lệ → trả về');
    store['planner-2026-8'] = JSON.stringify({ noHabits: true });
    assert.equal(Storage.monthStateRaw(2026, 7), null, 'thiếu habits → null');
    store['planner-2026-8'] = 'not json{{';
    assert.equal(Storage.monthStateRaw(2026, 7), null, 'JSON lỗi → null (catch)');
    // saveMonthState: ghi key đúng 'planner-y-(m+1)' + không throw khi window.Sync thiếu
    Storage.saveMonthState(2026, 0, { habits: [] });
    assert.ok(store['planner-2026-1'], 'saveMonthState ghi đúng key');
    assert.deepEqual(JSON.parse(store['planner-2026-1']), { habits: [], schemaVersion: 2 });
    // loadPomoLog/savePomoLog round-trip
    Storage.savePomoLog({ '2026-08-09': { work: 1 } });
    assert.deepEqual(Storage.loadPomoLog(), { '2026-08-09': { work: 1 } }, 'pomo log round-trip');
  } finally {
    globalThis.localStorage = origLS;
  }
});

test('P11: account.js helpers giữ nguyên behavior sau khi tách', () => {
  // hasAccount: đọc planner-token (mock localStorage)
  const store = {};
  const origLS = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try {
    assert.equal(Account.hasAccount(), false, 'chưa có token → false');
    store['planner-token'] = 'abc';
    assert.equal(Account.hasAccount(), true, 'có token → true');
    // defaultYearState/emptyYearState: year theo tham số + cấu trúc đúng
    const dy = Account.defaultYearState(2026);
    assert.equal(dy.year, 2026, 'defaultYearState nhận year tham số');
    assert.ok(dy.goals.length >= 8, 'default year có mục tiêu mẫu');
    assert.equal(dy.reflections.q1.length, 4);
    assert.equal(dy.monthNotes.length, 12);
    const ey = Account.emptyYearState(2027);
    assert.equal(ey.year, 2027);
    assert.equal(ey.goals.length, 0, 'empty year không có mục tiêu');
    // loadBadges/saveBadges round-trip
    assert.deepEqual(Account.loadBadges(), { earned: {} }, 'chưa có badges → rỗng');
    Account.saveBadges({ earned: { b7: true } });
    assert.deepEqual(Account.loadBadges(), { earned: { b7: true } }, 'badges round-trip');
    assert.equal(Account.BADGES_KEY, 'planner-badges');
  } finally {
    globalThis.localStorage = origLS;
  }
});

test('P11: dates.js helpers giữ nguyên behavior sau khi tách', () => {
  // isDayToday: thuần, so sánh d.date + d.yy với hôm nay
  const now = new Date();
  const today = { date: `${now.getDate()}/${now.getMonth() + 1}`, yy: now.getFullYear() % 100 };
  assert.equal(Dates.isDayToday(today), true, 'hôm nay → true');
  assert.equal(Dates.isDayToday({ date: '1/1', yy: 99 }), false, 'ngày khác → false');
  // fmtDate: format theo locale (mock TaskFlowI18N.dateLocale)
  const origI18N = globalThis.TaskFlowI18N;
  globalThis.TaskFlowI18N = { dateLocale: () => 'en-GB', getLang: () => 'en', dayLabel: (d) => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d] };
  try {
    const f = Dates.fmtDate(new Date(2026, 7, 9));
    assert.ok(f.includes('2026'), 'fmtDate chứa năm');
    assert.ok(f.includes('09') || f.includes('9'), 'fmtDate chứa ngày');
    // dayLabelShort: EN → 3 chữ cái đầu; VI → T2…T7/CN
    assert.equal(Dates.dayLabelShort(0), 'Mon');
    globalThis.TaskFlowI18N = { dateLocale: () => 'vi-VN', getLang: () => 'vi', dayLabel: () => ['Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy','Chủ nhật'] };
    assert.equal(Dates.dayLabelShort(0), 'T2');
    assert.equal(Dates.dayLabelShort(5), 'T7');
    assert.equal(Dates.dayLabelShort(6), 'CN');
  } finally {
    globalThis.TaskFlowI18N = origI18N;
  }
});

test('P11: stats.js helpers giữ nguyên behavior sau khi tách', () => {
  // weekStats(w): goals week — done/inProg/total/pct
  assert.deepEqual(Stats.weekStats({ goals: [] }), { done: 0, inProg: 0, total: 0, pct: 0 });
  assert.deepEqual(Stats.weekStats({ goals: [{ done: true }, { done: false }] }), { done: 1, inProg: 1, total: 2, pct: 50 });
  assert.deepEqual(Stats.weekStats({ goals: [{ done: true }, { done: true }] }), { done: 2, inProg: 0, total: 2, pct: 100 });
  // monthlyStats(st): nhận state tham số — cùng logic weekStats
  assert.deepEqual(Stats.monthlyStats({ monthlyGoals: [] }), { done: 0, inProg: 0, total: 0, pct: 0 });
  assert.deepEqual(Stats.monthlyStats({ monthlyGoals: [{ done: true }] }), { done: 1, inProg: 0, total: 1, pct: 100 });
  // pct round (3/4 → 75, 2/3 → 67)
  assert.equal(Stats.monthlyStats({ monthlyGoals: [{ done: true }, { done: true }, { done: false }] }).pct, 67);
});

test('P11: habits.js helpers giữ nguyên behavior sau khi tách', () => {
  // habitDaysElapsed(y, m, numDays): tháng khác → cả tháng; tháng hiện tại → min(hôm nay, numDays)
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  assert.equal(Habits.habitDaysElapsed(y, m, 31), Math.min(now.getDate(), 31));
  assert.equal(Habits.habitDaysElapsed(y, (m + 11) % 12, 30), 30);
  // dayAggregate(state, d): % habit tick trong ngày d
  const state = { habits: [{ days: { 0: true, 1: true } }, { days: { 0: true } }, { days: {} }] };
  assert.equal(Habits.dayAggregate(state, 0), 67);
  assert.equal(Habits.dayAggregate(state, 1), 33);
  assert.equal(Habits.dayAggregate(state, 2), 0);
  assert.equal(Habits.dayAggregate({ habits: [] }, 0), 0);
  // heatLevel(pct): 5 mức + 0
  assert.equal(Habits.heatLevel(100), 5);
  assert.equal(Habits.heatLevel(80), 4);
  assert.equal(Habits.heatLevel(50), 3);
  assert.equal(Habits.heatLevel(30), 2);
  assert.equal(Habits.heatLevel(10), 1);
  assert.equal(Habits.heatLevel(0), 0);
});

test('P11: keys.js helpers giữ nguyên behavior sau khi tách', () => {
  // pomoDateKey(d): YYYY-MM-DD local không lệch UTC
  assert.equal(Keys.pomoDateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(Keys.pomoDateKey(new Date(2026, 11, 31)), '2026-12-31');
  assert.equal(Keys.pomoDateKey(new Date(2024, 1, 9)), '2024-02-09');
  // moodDateKey(d, y, m): số ngày trong tháng + label DD/MM (tuần cắt ngang tháng)
  assert.equal(Keys.moodDateKey(15, 2026, 7), '2026-8-15');
  assert.equal(Keys.moodDateKey('03/08', 2026, 7), '2026-08-03');
  assert.equal(Keys.moodDateKey('30/09', 2026, 8), '2026-09-30');
});

test('P11: remind.js helpers giữ nguyên behavior sau khi tách', () => {
  // getRemindTime/setRemindTime: localStorage 'planner-remind' round-trip
  const hadLS = typeof globalThis.localStorage !== 'undefined';
  const saved = hadLS ? globalThis.localStorage.getItem('planner-remind') : null;
  try {
    globalThis.localStorage = {
      _m: {},
      getItem(k) { return this._m[k] ?? null; },
      setItem(k, v) { this._m[k] = String(v); },
      removeItem(k) { delete this._m[k]; },
    };
    assert.equal(Remind.getRemindTime(), null);
    Remind.setRemindTime('20:00');
    assert.equal(Remind.getRemindTime(), '20:00');
    Remind.setRemindTime(null);
    assert.equal(Remind.getRemindTime(), null);
  } finally {
    if (hadLS) globalThis.localStorage = saved;
    else delete globalThis.localStorage;
  }
});

test('P11: theme.js helpers giữ nguyên behavior sau khi tách', () => {
  // darkIsOn(dark): null → theo hệ thống (mock matchMedia dark), true/false trực tiếp
  const hadWindow = typeof globalThis.window !== 'undefined';
  const savedMM = hadWindow ? globalThis.window.matchMedia : undefined;
  try {
    globalThis.window = { matchMedia: () => ({ matches: true }) };
    assert.equal(Theme.darkIsOn(null), true);
    assert.equal(Theme.darkIsOn(true), true);
    assert.equal(Theme.darkIsOn(false), false);
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    assert.equal(Theme.darkIsOn(null), false);
  } finally {
    if (hadWindow) globalThis.window = savedMM;
    else delete globalThis.window;
  }
});

test('P11: analytics.js helpers giữ nguyên behavior sau khi tách', () => {
  // GA4 placeholder -> GA4_ENABLED = false (không tải tracking khi chưa cấu hình)
  assert.equal(Analytics.GA4_ENABLED, false);
  assert.equal(Analytics.GA4_ID, 'G-XXXXXXXXXX');
  // trackEvent là no-op khi disabled (không throw dù window.gtag thiếu)
  assert.doesNotThrow(() => Analytics.trackEvent('demo_data'));
});

test('P11: export.js helpers giữ nguyên behavior sau khi tách', () => {
  // collectAllData(legacyKey): gom keys planner-* + legacyKey từ localStorage
  const hadLS = typeof globalThis.localStorage !== 'undefined';
  const saved = hadLS ? globalThis.localStorage : null;
  try {
    globalThis.localStorage = {
      _m: { 'planner-x': '1', 'planner-y': '2', 'other': '3', 'january-planner-2026': '4' },
      length: 4,
      key(i) { return Object.keys(this._m)[i]; },
      getItem(k) { return this._m[k] ?? null; },
      setItem(k, v) { this._m[k] = String(v); },
      removeItem(k) { delete this._m[k]; },
    };
    const out = Export.collectAllData('january-planner-2026');
    assert.equal(out.app, 'taskflow-todoist');
    assert.equal(out.version, 2);
    assert.ok(out.exportedAt);
    // chỉ planner-* + legacyKey, không lấy key lạ
    assert.ok('planner-x' in out.keys && 'planner-y' in out.keys);
    assert.ok('january-planner-2026' in out.keys);
    assert.ok(!('other' in out.keys));
  } finally {
    if (hadLS) globalThis.localStorage = saved;
    else delete globalThis.localStorage;
  }
  // exportJSON(legacyKey): chạy được với Blob/document/URL mock (trackEvent no-op)
  const savedBlob = globalThis.Blob;
  const savedURL = globalThis.URL;
  const savedDoc = globalThis.document;
  try {
    globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.opts = opts; } };
    globalThis.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} }; // revoke no-op: timer 500ms không chạm global thật
    globalThis.document = {
      createElement: () => ({ click() {}, remove() {}, href: '', download: '' }),
      body: { appendChild() {} },
    };
    assert.doesNotThrow(() => Export.exportJSON('january-planner-2026'));
  } finally {
    if (savedBlob === undefined) delete globalThis.Blob; else globalThis.Blob = savedBlob;
    if (savedURL === undefined) delete globalThis.URL; else globalThis.URL = savedURL;
    if (savedDoc === undefined) delete globalThis.document; else globalThis.document = savedDoc;
  }
});

test('P11: streak.js helpers giữ nguyên behavior sau khi tách', () => {
  // habitInMonthState: tìm theo id rồi tên
  const s = { habits: [{ id: 'a', name: 'X', days: [true] }, { id: 'b', name: 'Y', days: [false] }] };
  assert.equal(Streak.habitInMonthState(s, { id: 'b', name: 'Y' }).id, 'b');
  assert.equal(Streak.habitInMonthState(s, { id: 'zz', name: 'X' }).id, 'a');
  assert.equal(Streak.habitInMonthState(null, { id: 'a' }), null);
  // habitDaysAt: tháng hiện tại (y,m khớp) → days trực tiếp; khác tháng → monthStateRaw
  const hadLS = typeof globalThis.localStorage !== 'undefined';
  const savedLS = hadLS ? globalThis.localStorage : null;
  const savedStorage = globalThis.TaskFlowStorage;
  try {
    globalThis.localStorage = {
      _m: { 'planner-2026-8': JSON.stringify({ habits: [{ id: 'a', name: 'X', days: [true, false, true] }] }) },
      length: 1, key(i) { return Object.keys(this._m)[i]; },
      getItem(k) { return this._m[k] ?? null; },
      setItem(k, v) { this._m[k] = String(v); },
      removeItem(k) { delete this._m[k]; },
    };
    globalThis.TaskFlowStorage = { monthStateRaw: (y, m) => JSON.parse(globalThis.localStorage.getItem('planner-' + y + '-' + (m + 1))) };
    const h = { id: 'a', name: 'X', days: [true] };
    // cùng tháng → h.days trực tiếp
    assert.deepEqual(Streak.habitDaysAt(2026, 7, h, 2026, 7), h.days);
    // khác tháng → đọc từ monthStateRaw
    const cross = Streak.habitDaysAt(2026, 7, h, 2026, 8);
    assert.deepEqual(cross, [true, false, true]);
  } finally {
    if (hadLS) globalThis.localStorage = savedLS; else delete globalThis.localStorage;
    if (savedStorage === undefined) delete globalThis.TaskFlowStorage; else globalThis.TaskFlowStorage = savedStorage;
  }
  // streakAnchorDay: tháng hiện tại → min(hôm nay-1, numDays-1); khác tháng → numDays-1
  const now = new Date();
  const anchor = Streak.streakAnchorDay(now.getFullYear(), now.getMonth(), 31);
  assert.equal(anchor, Math.min(now.getDate() - 1, 30));
  assert.equal(Streak.streakAnchorDay(1999, 0, 31), 30);
  // habitStreakCached: cache nội bộ + cur/best. Dùng days DẠNG MẢNG (same-month path
  // trong habitDaysAt check Array.isArray) — tick tất cả ngày đã trôi qua → cur > 0.
  const h2 = { id: 'c', name: 'Z', days: Array.from({ length: 31 }, (_, i) => i <= now.getDate() - 1) };
  Streak.clearStreakCache();
  const r1 = Streak.habitStreakCached(h2, now.getFullYear(), now.getMonth(), 31);
  assert.ok(r1.cur > 0 && r1.best > 0, 'streak dương khi tick mọi ngày đã trôi qua: ' + JSON.stringify(r1));
  assert.ok(r1.best >= r1.cur, 'best >= cur');
  const r2 = Streak.habitStreakCached(h2, now.getFullYear(), now.getMonth(), 31);
  assert.deepEqual(r1, r2, 'cache trả cùng giá trị');
  Streak.clearStreakCache();
  const r3 = Streak.habitStreakCached(h2, now.getFullYear(), now.getMonth(), 31);
  assert.deepEqual(r1, r3, 'sau clearStreakCache vẫn tính đúng');
});

test('P11: goals.js monthPctOf/monthGoalsOf giữ nguyên behavior sau khi tách', () => {
  // Setup: mock localStorage với state tháng có weeks (cho monthPctOf) + monthlyGoals (cho monthGoalsOf)
  const hadLS = typeof globalThis.localStorage !== 'undefined';
  const savedLS = hadLS ? globalThis.localStorage : null;
  const savedAcc = globalThis.TaskFlowAccount;
  const savedPlanStats = globalThis.window ? globalThis.window.PlanStats : undefined;
  const hadWindow = typeof globalThis.window !== 'undefined';
  const savedWindow = hadWindow ? globalThis.window : null;
  const defaultPct = (y, m) => 42; // fake defaultMonthPct
  const goalDefs = [['G1', 'goal', false], ['G2', 'habit', true]];
  try {
    globalThis.localStorage = {
      _m: {
        'planner-2026-8': JSON.stringify({
          weeks: [{ goals: [{ done: true }, { done: true }] }, { goals: [{ done: false }] }],
          monthlyGoals: [{ id: 's1', text: 'Lưu', kind: 'goal', done: false }],
        }),
      },
      length: 1, key(i) { return Object.keys(this._m)[i]; },
      getItem(k) { return this._m[k] ?? null; },
      setItem(k, v) { this._m[k] = String(v); },
      removeItem(k) { delete this._m[k]; },
    };
    globalThis.TaskFlowAccount = { hasAccount: () => false };
    globalThis.window = { PlanStats: null };
    // monthPctOf: có dữ liệu → dùng PlanStats fallback (weekGoalPct null → tính inline)
    // weeks: 2/2 + 0/1 → 100% + 0% → 50
    assert.equal(Goals.monthPctOf(2026, 7, defaultPct), 50);
    // monthPctOf: có PlanStats.weekGoalPct → dùng hàm thuần (path browser chính)
    globalThis.window = { PlanStats: { weekGoalPct: (s) => 77 } };
    assert.equal(Goals.monthPctOf(2026, 7, defaultPct), 77);
    globalThis.window = { PlanStats: null };
    // monthPctOf: không có dữ liệu + chưa đăng nhập → defaultPct
    assert.equal(Goals.monthPctOf(2026, 1, defaultPct), 42);
    // monthGoalsOf: có monthlyGoals → trả dữ liệu đã lưu
    assert.deepEqual(Goals.monthGoalsOf(2026, 7, goalDefs), [{ id: 's1', text: 'Lưu', kind: 'goal', done: false }]);
    // monthGoalsOf: không có dữ liệu + chưa đăng nhập → goalDefs mẫu
    const demo = Goals.monthGoalsOf(2026, 1, goalDefs);
    assert.equal(demo.length, 2);
    assert.equal(demo[0].text, 'G1');
    // đã đăng nhập + không có dữ liệu → TRỐNG (không hiện mẫu)
    globalThis.TaskFlowAccount = { hasAccount: () => true };
    assert.deepEqual(Goals.monthGoalsOf(2026, 1, goalDefs), []);
    assert.equal(Goals.monthPctOf(2026, 1, defaultPct), 0);
  } finally {
    if (hadLS) globalThis.localStorage = savedLS; else delete globalThis.localStorage;
    if (savedAcc === undefined) delete globalThis.TaskFlowAccount; else globalThis.TaskFlowAccount = savedAcc;
    if (hadWindow) globalThis.window = savedWindow; else delete globalThis.window;
  }
});

test('P11: fab.js drag/tuck helpers giữ nguyên behavior sau khi tách', () => {
  // loadFabPos/saveFabPos/clearFabPos: localStorage round-trip + null/exception
  const hadLS = typeof globalThis.localStorage !== 'undefined';
  const savedLS = hadLS ? globalThis.localStorage : null;
  const hadWindow = typeof globalThis.window !== 'undefined';
  const savedWindow = hadWindow ? globalThis.window : null;
  try {
    globalThis.localStorage = {
      _m: {}, length: 0, key(i) { return Object.keys(this._m)[i]; },
      getItem(k) { return this._m[k] ?? null; },
      setItem(k, v) { this._m[k] = String(v); },
      removeItem(k) { delete this._m[k]; },
    };
    globalThis.window = { innerWidth: 1440, innerHeight: 900 };
    // save → load round-trip
    Fab.saveFabPos('planner-fab-test', 120, 300);
    assert.deepEqual(Fab.loadFabPos('planner-fab-test'), { x: 120, y: 300 });
    // clear → null
    Fab.clearFabPos('planner-fab-test');
    assert.equal(Fab.loadFabPos('planner-fab-test'), null);
    // dữ liệu hỏng → null (không throw)
    globalThis.localStorage.setItem('planner-fab-test', '{bad json');
    assert.equal(Fab.loadFabPos('planner-fab-test'), null);
    // clampFabPos: giới hạn trong viewport + lề FAB_MARGIN=8
    const c1 = Fab.clampFabPos(0, 0, 60, 60);
    assert.equal(c1.x, 8); assert.equal(c1.y, 8);
    const c2 = Fab.clampFabPos(5000, 5000, 60, 60);
    assert.equal(c2.x, 1440 - 60 - 8); assert.equal(c2.y, 900 - 60 - 8);
    // Mobile: chặn kéo xuống dưới bottom-nav (~82px)
    globalThis.window = { innerWidth: 390, innerHeight: 844 };
    const cm = Fab.clampFabPos(0, 9999, 56, 56);
    assert.equal(cm.y, 844 - 56 - 82);
  } finally {
    if (hadLS) globalThis.localStorage = savedLS; else delete globalThis.localStorage;
    if (hadWindow) globalThis.window = savedWindow; else delete globalThis.window;
  }
});

test('P11: syncui.js sync helpers giữ nguyên behavior sau khi tách', () => {
  // syncStatusText/syncErrorText: map t() keys qua TaskFlowI18N mock
  const savedI18n = globalThis.TaskFlowI18N;
  const hadWindow = typeof globalThis.window !== 'undefined';
  const savedWindow = hadWindow ? globalThis.window : null;
  try {
    globalThis.TaskFlowI18N = { t: (k) => '[' + k + ']' };
    globalThis.window = { Sync: null };
    // syncStatusText: mọi trạng thái → key tương ứng
    assert.equal(SyncUI.syncStatusText('connecting'), '[syncStatusConnecting]');
    assert.equal(SyncUI.syncStatusText('syncing'), '[syncStatusSyncing]');
    assert.equal(SyncUI.syncStatusText('ready'), '[syncStatusReady]');
    assert.equal(SyncUI.syncStatusText('signedout'), '[syncStatusSignedOut]');
    assert.equal(SyncUI.syncStatusText('error'), '[syncStatusError]');
    assert.equal(SyncUI.syncStatusText('anything-else'), '[syncStatusOff]');
    // syncErrorText: mọi code → key tương ứng
    assert.equal(SyncUI.syncErrorText('username-taken'), '[syncErrUsernameTaken]');
    assert.equal(SyncUI.syncErrorText('bad-credentials'), '[syncErrBadCredentials]');
    assert.equal(SyncUI.syncErrorText('network'), '[syncErrNetwork]');
    assert.equal(SyncUI.syncErrorText('no-config'), '[syncNeedConfig]');
    assert.equal(SyncUI.syncErrorText('too-many-requests'), '[syncErrRateLimited]');
    assert.equal(SyncUI.syncErrorText('xyz'), '[syncErrServer]');
    // updateSyncStatus + syncFormValues: không có Sync + không có DOM node → return sớm (không throw)
    assert.doesNotThrow(() => SyncUI.updateSyncStatus());
    assert.deepEqual(SyncUI.syncFormValues(), { user: '', pass: '', pass2: '' });
  } finally {
    if (savedI18n === undefined) delete globalThis.TaskFlowI18N; else globalThis.TaskFlowI18N = savedI18n;
    if (hadWindow) globalThis.window = savedWindow; else delete globalThis.window;
  }
});

test('P11: planmini.js psStart/shortMonth giữ nguyên behavior sau khi tách', () => {
  // psStart: state.start được ưu tiên; thiếu → fallback ngày 1
  const d0 = new Date(2026, 6, 20);
  assert.equal(PlanMini.psStart({ start: d0 }, 2026, 7), d0);
  const fallback = PlanMini.psStart(null, 2026, 7);
  assert.equal(fallback.getFullYear(), 2026);
  assert.equal(fallback.getMonth(), 7);
  assert.equal(fallback.getDate(), 1);
  // shortMonth: vi → T1..T12; en → JAN..DEC (via TaskFlowI18N mock)
  const savedI18n = globalThis.TaskFlowI18N;
  try {
    globalThis.TaskFlowI18N = {
      getLang: () => 'vi',
      MONTH_NAMES: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    };
    assert.equal(PlanMini.shortMonth(0), 'T1');
    assert.equal(PlanMini.shortMonth(11), 'T12');
    globalThis.TaskFlowI18N = {
      getLang: () => 'en',
      MONTH_NAMES: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    };
    assert.equal(PlanMini.shortMonth(0), 'JAN');
    assert.equal(PlanMini.shortMonth(8), 'SEP');
    // thiếu TaskFlowI18N → fallback số (không throw)
    delete globalThis.TaskFlowI18N;
    assert.equal(PlanMini.shortMonth(2), '3');
    assert.equal(PlanMini.psStart({}, 2026, 0).getDate(), 1);
  } finally {
    if (savedI18n === undefined) delete globalThis.TaskFlowI18N; else globalThis.TaskFlowI18N = savedI18n;
  }
});

test('P11: clock.js nowInfo/renderClock giữ nguyên behavior sau khi tách', () => {
  // nowInfo: tính vị trí trong plan grid từ planStart + numDays + năm/tháng planner
  const y = 2026, m = 7; // tháng 8/2026
  const first = new Date(y, m, 1);
  const dow = (first.getDay() + 6) % 7;
  const planStart = new Date(y, m, 1 - dow); // giống initPlan: thứ 2 tuần chứa ngày 1
  const numDays = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  const inRange = today.getFullYear() === y && today.getMonth() === m;
  const ti = Clock.nowInfo(planStart, numDays, y, m);
  assert.ok(ti.now instanceof Date);
  assert.equal(ti.dayIdx, Clock.calendarDayDiff(planStart, today));
  assert.equal(ti.inRange, inRange);
  if (inRange) {
    assert.equal(ti.week, Math.floor(ti.dayIdx / 7) + 1);
    assert.equal(ti.habitCol, ti.dayIdx);
  } else {
    assert.equal(ti.week, null);
    assert.equal(ti.habitCol, -1);
  }
  // ngoài range (quá khứ xa) → inRange false
  const past = Clock.nowInfo(new Date(2000, 0, 1), 30, 2000, 0);
  assert.equal(past.inRange, false);
  assert.equal(past.week, null);
  // fallback legacy (không truyền year/month) vẫn không throw
  assert.doesNotThrow(() => Clock.nowInfo(planStart, numDays));
  // renderClock: không có document → return sớm (không throw)
  assert.doesNotThrow(() => Clock.renderClock());
});

test('P10: nowInfo range theo THÁNG planner — 27–31/8 không bị loại sai', () => {
  // Tháng 8/2026: planStart = thứ 2 27/7 (tuần chứa 1/8), numDays = 31.
  // BUG cũ: inRange = dayIdx >= 0 && dayIdx < numDays → cửa sổ "27/7→26/8",
  // khiến 27–31/8 bị coi là NGOÀI tháng dù vẫn nằm trong lưới tuần tháng 8.
  const y = 2026, m = 7;
  const first = new Date(y, m, 1);
  const dow = (first.getDay() + 6) % 7;
  const planStart = new Date(y, m, 1 - dow);
  const numDays = new Date(y, m + 1, 0).getDate();
  const gridIdx = (day) => Clock.calendarDayDiff(planStart, new Date(y, m, day));
  const expect = (day, week, dayInWeek, label) => {
    const ti = Clock.nowInfo(planStart, numDays, y, m, new Date(y, m, day));
    assert.equal(ti.inRange, true, `${label}: inRange`);
    assert.equal(ti.week, week, `${label}: week`);
    assert.equal(ti.dayInWeek, dayInWeek, `${label}: dayInWeek`);
    assert.equal(ti.dayIdx, gridIdx(day), `${label}: dayIdx`);
  };
  expect(1, 1, 5, '1/8');   // thứ 7 tuần 1
  expect(17, 4, 0, '17/8'); // thứ 2 tuần 4 — ô hôm nay (Today/Week current-day)
  expect(26, 5, 2, '26/8');
  expect(27, 5, 3, '27/8'); // BUG cũ: dayIdx 31 >= 31 → out of range
  expect(31, 6, 0, '31/8'); // BUG cũ: dayIdx 35 >= 31 → out of range
  // 1/9 KHÔNG thuộc tháng 8
  const sep = Clock.nowInfo(planStart, numDays, y, m, new Date(y, 8, 1));
  assert.equal(sep.inRange, false, '1/9 ngoài tháng 8');
  assert.equal(sep.week, null);
});

test('P10: resolveTodayCell — resolver canonical cho Today/Week (day === cùng tham chiếu)', () => {
  const y = 2026, m = 7;
  const first = new Date(y, m, 1);
  const dow = (first.getDay() + 6) % 7;
  const planStart = new Date(y, m, 1 - dow);
  const numDays = new Date(y, m + 1, 0).getDate();
  const numWeeks = Math.ceil((dow + numDays) / 7);
  const weeks = Array.from({ length: numWeeks }, (_, wi) => ({
    n: wi + 1,
    days: Array.from({ length: 7 }, (_, di) => ({
      tasks: [],
      date: `${planStart.getDate() + wi * 7 + di}/${m + 1}`,
      yy: planStart.getFullYear() % 100,
    })),
  }));
  const now = new Date(y, m, 17, 8, 0, 0); // 17/8/2026 08:00 local — thứ 2 tuần 4
  const cell = Clock.resolveTodayCell({ planStart, numDays, year: y, month: m, weeks, now });
  assert.equal(cell.inPlanMonth, true);
  assert.equal(cell.weekNumber, 4);
  assert.equal(cell.weekIndex, 3);
  assert.equal(cell.dayIndex, 0);
  assert.equal(cell.day, weeks[3].days[0], 'day phải là THAM CHIẾU tới weeks[3].days[0]');
  assert.equal(cell.day.tasks, weeks[3].days[0].tasks, 'day.tasks là cùng mảng canonical');
  // push vào cell.day → thấy qua weeks[3].days[0] (không copy/không mirror)
  cell.day.tasks.push({ uid: 't-x' });
  assert.equal(weeks[3].days[0].tasks.length, 1);
  // ngoài tháng: 1/9 → inPlanMonth false, day null
  const sep = Clock.resolveTodayCell({ planStart, numDays, year: y, month: m, weeks, now: new Date(y, 8, 1) });
  assert.equal(sep.inPlanMonth, false);
  assert.equal(sep.day, null);
  // không truyền weeks → chỉ có toạ độ, day = null
  const coords = Clock.resolveTodayCell({ planStart, numDays, year: y, month: m, now });
  assert.equal(coords.weekIndex, 3);
  assert.equal(coords.day, null);
});

test('P10: calendarDayDiff an toàn DST — hiệu ngày lịch, không lệch theo giờ', () => {
  // Hai thời điểm KHÁC NGÀY nhưng sát nhau (23:59 → 00:01) → diff đúng 1 ngày
  assert.equal(Clock.calendarDayDiff(new Date(2026, 7, 17, 23, 59), new Date(2026, 7, 18, 0, 1)), 1);
  assert.equal(Clock.calendarDayDiff(new Date(2026, 7, 18, 0, 1), new Date(2026, 7, 17, 23, 59)), -1);
  // Cùng ngày lịch, giờ khác nhau → diff 0
  assert.equal(Clock.calendarDayDiff(new Date(2026, 7, 17, 1, 0), new Date(2026, 7, 17, 23, 0)), 0);
  // Tháng 8/2026: planStart 27/7 → 17/8 = 21 ngày
  assert.equal(Clock.calendarDayDiff(new Date(2026, 6, 27), new Date(2026, 7, 17)), 21);
});

test('P11: shell.js monthKey/updateBrand/buildMonthNav giữ nguyên behavior sau khi tách', () => {
  // monthKey: 'planner-Y-M' với month 0-based + 1
  assert.equal(Shell.monthKey(2026, 7), 'planner-2026-8');
  assert.equal(Shell.monthKey(2026, 0), 'planner-2026-1');
  assert.equal(Shell.monthKey(1999, 11), 'planner-1999-12');
  // buildMonthNav: không có document → return sớm (không throw)
  assert.doesNotThrow(() => Shell.buildMonthNav(2026, 7));
  // updateBrand: không có document → không throw
  assert.doesNotThrow(() => Shell.updateBrand(2026, 7));
});

test('P11: util.js helpers giữ nguyên behavior sau khi tách', () => {
  // esc: escape HTML
  assert.equal(Util.esc('<b>x</b> & "q"'), '&lt;b&gt;x&lt;/b&gt; &amp; &quot;q&quot;');
  assert.equal(Util.esc(null), '');
  assert.equal(Util.esc(undefined), '');
  // localISODate: local YYYY-MM-DD không lệch UTC
  assert.equal(Util.localISODate(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(Util.localISODate(new Date(2026, 11, 31)), '2026-12-31');
  // formatFocusTime: h/m
  assert.equal(Util.formatFocusTime(0), '0m');
  assert.equal(Util.formatFocusTime(20), '20m');
  assert.equal(Util.formatFocusTime(60), '1h');
  assert.equal(Util.formatFocusTime(380), '6h 20m');
  // lineChartSVG: sinh svg với điểm + polyline
  const svg = Util.lineChartSVG([0, 50, 100], 480, 110, (k) => k);
  assert.match(svg, /<svg/);
  assert.match(svg, /<polyline/);
  assert.match(svg, /lineAria/);
});
