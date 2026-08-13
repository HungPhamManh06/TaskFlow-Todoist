import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import TaskFlowDataMigrations from '../js/data-migrations.js';

/* ============================================================
   Phase 20 — Blank-task lifecycle (P0.2) + migration (P0.3)
   (js/data-migrations.js: isTaskTrulyEmpty, cleanupTrulyEmptyTasks;
    js/app.js + js/inbox.js: draft removal + boot cleanup)
   ============================================================ */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const INBOX_JS = readFileSync(path.join(ROOT, 'js/inbox.js'), 'utf8');
const APP = readFileSync(path.join(ROOT, 'app.html'), 'utf8');

const { isTaskTrulyEmpty, cleanupTrulyEmptyTasks } = TaskFlowDataMigrations;

function baseTask(overrides = {}) {
  return Object.assign(
    { uid: 'u1', kind: 'regular', done: false, text: '', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } },
    overrides
  );
}

function monthWith(days) {
  return { schemaVersion: 2, monthlyGoals: [], habits: [], weeks: [{ n: 1, days }] };
}

function dayWith(tasks) {
  return { date: '1/8', yy: 26, tasks };
}

/* ---------- P0.2B — isTaskTrulyEmpty ---------- */

test('20.1: blank plain task là truly-empty → được xoá', () => {
  assert.equal(isTaskTrulyEmpty(baseTask()), true);
});

test('20.2: task chỉ chứa whitespace là truly-empty → được xoá', () => {
  assert.equal(isTaskTrulyEmpty(baseTask({ text: '   ' })), true);
  assert.equal(isTaskTrulyEmpty(baseTask({ text: '\t\n ' })), true);
});

test('20.3: task không có field text (legacy) và không metadata → truly-empty', () => {
  const tk = baseTask();
  delete tk.text;
  assert.equal(isTaskTrulyEmpty(tk), true);
});

test('20.4: blank task có tag → GIỮ LẠI', () => {
  assert.equal(isTaskTrulyEmpty(baseTask({ tags: ['quan-trong'] })), false);
});

test('20.5: blank task có note → GIỮ LẠI', () => {
  assert.equal(isTaskTrulyEmpty(baseTask({ notes: 'ghi chú' })), false);
  assert.equal(isTaskTrulyEmpty(baseTask({ note: 'ghi chú' })), false);
});

test('20.6: blank task có subtask → GIỮ LẠI', () => {
  assert.equal(isTaskTrulyEmpty(baseTask({ subtasks: [{ id: 's1', text: 'bước 1', done: false }] })), false);
});

test('20.7: blank task có deadline → GIỮ LẠI', () => {
  assert.equal(isTaskTrulyEmpty(baseTask({ deadline: '2026-08-10' })), false);
});

test('20.8: blank task có reminder bật → GIỮ LẠI', () => {
  assert.equal(isTaskTrulyEmpty(baseTask({ remind: { enabled: true, time: '20:00' } })), false);
});

test('20.9: blank task liên kết metric → GIỮ LẠI', () => {
  assert.equal(isTaskTrulyEmpty(baseTask({ linkedMetricIds: ['m1'] })), false);
});

test('20.10: blank task có repeat/duration/focusLog/carried → GIỮ LẠI', () => {
  assert.equal(isTaskTrulyEmpty(baseTask({ repeat: { freq: 'daily', every: 1 } })), false);
  assert.equal(isTaskTrulyEmpty(baseTask({ duration: 25 })), false);
  assert.equal(isTaskTrulyEmpty(baseTask({ focusLog: [{ d: '2026-08-08', m: 25 }] })), false);
  assert.equal(isTaskTrulyEmpty(baseTask({ carriedFrom: { uid: 'src', date: '7/8/26' } })), false);
  assert.equal(isTaskTrulyEmpty(baseTask({ carried: true })), false);
});

test('20.11: task có text thật → GIỮ LẠI', () => {
  assert.equal(isTaskTrulyEmpty(baseTask({ text: 'Học bài' })), false);
});

test('20.12: isTaskTrulyEmpty chặn input không hợp lệ', () => {
  assert.equal(isTaskTrulyEmpty(null), false);
  assert.equal(isTaskTrulyEmpty(undefined), false);
  assert.equal(isTaskTrulyEmpty([]), false);
  assert.equal(isTaskTrulyEmpty('task'), false);
});

/* ---------- P0.3 — cleanupTrulyEmptyTasks ---------- */

test('20.13: blank Inbox item → removed (inbox chỉ là vị trí, không phải nội dung)', () => {
  assert.equal(isTaskTrulyEmpty(baseTask({ inbox: true })), true);
});

test('20.14: nhiều task thật + blank → chỉ xoá blank, thứ tự task thật giữ nguyên', () => {
  const a = baseTask({ uid: 'a', text: 'Việc A' });
  const b = baseTask({ uid: 'b' }); // blank → xoá
  const c = baseTask({ uid: 'c', text: 'Việc C' });
  const s = monthWith([dayWith([a, b, c])]);
  const { state, removed } = cleanupTrulyEmptyTasks(s);
  assert.equal(removed, 1);
  assert.deepEqual(state.weeks[0].days[0].tasks.map((t) => t.uid), ['a', 'c']);
  // Không mutate input
  assert.equal(s.weeks[0].days[0].tasks.length, 3);
});

test('20.15: whitespace-only task bị xoá, task thật giữ metadata', () => {
  const a = baseTask({ uid: 'a', text: '   ' }); // whitespace → xoá
  const b = baseTask({ uid: 'b', text: 'Việc B', done: true, tags: ['x'], deadline: '2026-08-10' });
  const s = monthWith([dayWith([a, b])]);
  const { state, removed } = cleanupTrulyEmptyTasks(s);
  assert.equal(removed, 1);
  assert.equal(state.weeks[0].days[0].tasks.length, 1);
  assert.equal(state.weeks[0].days[0].tasks[0].uid, 'b');
  assert.equal(state.weeks[0].days[0].tasks[0].done, true);
  assert.deepEqual(state.weeks[0].days[0].tasks[0].tags, ['x']);
});

test('20.16: blank task có metadata qua mọi field → GIỮ LẠI trong cleanup', () => {
  const kept = [
    baseTask({ uid: 't1', tags: ['a'] }),
    baseTask({ uid: 't2', notes: 'n' }),
    baseTask({ uid: 't3', subtasks: [{ id: 's', text: 'x' }] }),
    baseTask({ uid: 't4', deadline: '2026-08-12' }),
    baseTask({ uid: 't5', remind: { enabled: true, time: '08:00' } }),
    baseTask({ uid: 't6', linkedMetricIds: ['m'] }),
    baseTask({ uid: 't7', repeat: { freq: 'weekly' } }),
    baseTask({ uid: 't8', duration: 15 }),
    baseTask({ uid: 't9', carriedFrom: { uid: 's' } }),
  ];
  const s = monthWith([dayWith(kept)]);
  const { state, removed } = cleanupTrulyEmptyTasks(s);
  assert.equal(removed, 0);
  assert.equal(state.weeks[0].days[0].tasks.length, 9);
});

test('20.17: migration idempotent — chạy lần 2 không xoá gì thêm', () => {
  const a = baseTask({ uid: 'a', text: 'Việc A' });
  const b = baseTask({ uid: 'b' });
  const c = baseTask({ uid: 'c', text: 'Việc C' });
  const first = cleanupTrulyEmptyTasks(monthWith([dayWith([a, b, c])]));
  assert.equal(first.removed, 1);
  const second = cleanupTrulyEmptyTasks(first.state);
  assert.equal(second.removed, 0);
  assert.equal(second.state.weeks[0].days[0].tasks.length, 2);
});

test('20.18: state không có weeks → không đổi, không crash', () => {
  const { state, removed } = cleanupTrulyEmptyTasks({ monthlyGoals: [], habits: [] });
  assert.equal(removed, 0);
  assert.equal(state.weeks, undefined);
});

/* ---------- P0.2 / P0.3 — tích hợp trong app.js + inbox.js ---------- */

test('20.19: emptyState/defaultState KHÔNG pre-seed task trống (tasks: [])', () => {
  assert.doesNotMatch(APP_JS, /kind: 'priority', done: false, text: ''/);
  assert.doesNotMatch(APP_JS, /tasks: seedTasks\(pct\)/);
});

test('20.20: lifecycle draft: taskAtText/removeTrulyEmptyDraft/focusin/focusout/Escape', () => {
  assert.match(APP_JS, /function taskAtText\(el\)/);
  assert.match(APP_JS, /function removeTrulyEmptyDraft\(t\)/);
  assert.match(APP_JS, /addEventListener\('focusin'/);
  assert.match(APP_JS, /addEventListener\('focusout'/);
  assert.match(APP_JS, /freshBlank/);
  assert.match(APP_JS, /removeTrulyEmptyDraft\(dt\)/); // Escape
  // Không undo/toast cho draft bỏ dở
  const block = APP_JS.slice(APP_JS.indexOf('function removeTrulyEmptyDraft'), APP_JS.indexOf('document.addEventListener(\'focusin\''));
  assert.doesNotMatch(block, /pushUndo/);
  assert.doesNotMatch(block, /TaskFlowUI\.toast/);
});

test('20.21: boot cleanup dùng isTaskTrulyEmpty trong loadState + loadMonthStateOrCreate', () => {
  assert.match(APP_JS, /isTaskTrulyEmpty\(tk\)/); // loadState in-place filter
  assert.match(APP_JS, /blankRemoved/);
  assert.match(APP_JS, /cleanupTrulyEmptyTasks\(parsed\)/); // loadMonthStateOrCreate
});

test('20.22: inbox loadInbox xoá item truly-empty (P0.3)', () => {
  assert.match(INBOX_JS, /isTaskTrulyEmpty\(tk\)/);
});

test('20.24: pointer-caused blur defers draft render until after the click completes (P0.2C)', () => {
  // Regression ea26fc5: synchronous renderWeek() during focusout destroyed the clicked
  // checkbox before its click event → first click swallowed, day progress frozen.
  // Guard: pointerdown/pointerup tracking + pendingDraftRender + flush after click.
  assert.match(APP_JS, /let pointerPressed = false;/);
  assert.match(APP_JS, /let pendingDraftRender = null;/);
  assert.match(APP_JS, /addEventListener\('pointerdown', \(\) => \{ pointerPressed = true; \}, true\)/);
  assert.match(APP_JS, /addEventListener\('pointerup', \(\) => \{ pointerPressed = false; \}, true\)/);
  assert.match(APP_JS, /function flushPendingDraftRender\(\)/);
  assert.match(APP_JS, /pointerPressed\) \{/); // focusout branches on pointer
  assert.match(APP_JS, /pendingDraftRender = \(\) => \{/);
  // Splice data synchronously during blur (storage consistent) but defer the render.
  // The synchronous section ends where the deferred closure starts.
  const syncBlock = APP_JS.slice(APP_JS.indexOf('if (pointerPressed) {'), APP_JS.indexOf('pendingDraftRender = () => {'));
  assert.match(syncBlock, /\.tasks\.splice\(t\.i, 1\)/);
  assert.match(syncBlock, /save\(\);/);
  assert.doesNotMatch(syncBlock, /renderWeek\(|renderToday\(|renderInbox\(/); // no sync re-render in blur
  // The deferred closure must still dispatch the view render after the click.
  const deferredBlock = APP_JS.slice(APP_JS.indexOf('pendingDraftRender = () => {'), APP_JS.indexOf('removeTrulyEmptyDraft(t);'));
  assert.match(deferredBlock, /renderWeek\(|renderToday\(|renderInbox\(inbox\)/);
  // Escape (keyboard) path must still remove synchronously — not pointer-deferred.
  assert.match(APP_JS, /removeTrulyEmptyDraft\(dt\)/);
});

test('20.23: assets được build + version bump (app.min/inbox.min/data-migrations.min + sw CACHE)', () => {
  const min = (rel) => { assert.ok(existsSync(path.join(ROOT, rel)), `missing ${rel}`); return readFileSync(path.join(ROOT, rel), 'utf8'); };
  assert.match(min('js/app.min.js'), /removeTrulyEmptyDraft/);
  assert.match(min('js/inbox.min.js'), /isTaskTrulyEmpty/);
  assert.match(min('js/data-migrations.min.js'), /isTaskTrulyEmpty/);
  assert.match(APP, /js\/data-migrations\.min\.js\?v=/);
  assert.match(APP, /js\/app\.min\.js\?v=/);
  assert.match(readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), /const CACHE = 'taskflow-v\d+'/);
});
