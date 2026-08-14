// TaskFlow — V1.2 Phase 2 Time Blocking UI tests.
// Schedule view (timeline/daystrip), block dialog, task-detail blocks, overlap note,
// focus ref resolution. Pure functions — no DOM/browser required.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Stub browser globals for modules loaded via dynamic import (UMD factory reads window.*).
globalThis.window = globalThis;
const TimeBlocks = (await import('../js/timeblocks.js')).default || (await import('../js/timeblocks.js'));
const UI = (await import('../js/timeblocks-ui.js')).default || (await import('../js/timeblocks-ui.js'));
window.TaskFlowTimeBlocks = TimeBlocks;
window.TaskFlowI18N = { t: (k, v) => (k || ''), locale: 'en-US' };
window.TaskFlowUI = { esc: (s) => String(s == null ? '' : s), icon: (n) => '<i>' + n + '</i>' };

function makeState() {
  return {
    weeks: [
      { n: 1, days: [
        { tasks: [{ uid: 'u1', text: 'Learn Spring Boot' }], date: '2026-08-10' },
        { tasks: [{ uid: 'u2', text: 'Deploy API' }], date: '2026-08-11' },
      ] },
    ],
  };
}
const inbox = [{ uid: 'u9', text: 'Inbox item' }];
function makeStore() {
  return { version: 2, blocks: [
    { id: 'b1', taskUid: 'u1', date: '2026-08-10', start: '09:00', end: '10:30', status: 'planned', createdAt: 'x', updatedAt: 'x' },
    { id: 'b2', taskUid: 'u9', date: '2026-08-10', start: '14:00', end: '15:00', status: 'completed', createdAt: 'x', updatedAt: 'x' },
    { id: 'b3', taskUid: 'u2', date: '2026-08-11', start: '08:00', end: '09:00', status: 'planned', createdAt: 'x', updatedAt: 'x' },
  ] };
}
const planStart = new Date(2026, 7, 10); // Monday 2026-08-10

test('iso/parseISO round trip local', () => {
  const d = new Date(2026, 7, 10, 23, 30);
  assert.equal(UI.iso(d), '2026-08-10');
  const p = UI.parseISO('2026-08-10');
  assert.equal(p.getFullYear(), 2026);
  assert.equal(p.getMonth(), 7);
  assert.equal(p.getDate(), 10);
  assert.equal(UI.parseISO('bad'), null);
});

test('weekDayForDate maps date into week/day indices', () => {
  assert.deepEqual(UI.weekDayForDate('2026-08-10', planStart), { week: 1, day: 0 });
  assert.deepEqual(UI.weekDayForDate('2026-08-11', planStart), { week: 1, day: 1 });
  assert.equal(UI.weekDayForDate('2026-08-03', planStart), null); // before plan start
});

test('tasksForDate returns that day tasks only', () => {
  const state = makeState();
  assert.equal(UI.tasksForDate(state, planStart, '2026-08-10').length, 1);
  assert.equal(UI.tasksForDate(state, planStart, '2026-08-11').length, 1);
  assert.equal(UI.tasksForDate(state, planStart, '2026-08-12').length, 0);
});

test('taskTextFor resolves month + inbox tasks, missing → empty', () => {
  const state = makeState();
  assert.equal(UI.taskTextFor('u1', state, inbox), 'Learn Spring Boot');
  assert.equal(UI.taskTextFor('u9', state, inbox), 'Inbox item');
  assert.equal(UI.taskTextFor('ghost', state, inbox), '');
});

test('focusRefForUid resolves month + inbox refs', () => {
  const state = makeState();
  assert.deepEqual(UI.focusRefForUid('u1', state, inbox), { week: 1, day: 0, task: 0 });
  assert.deepEqual(UI.focusRefForUid('u9', state, inbox), { scope: 'inbox', task: 0 });
  assert.equal(UI.focusRefForUid('ghost', state, inbox), null);
});

test('sortedBlocks orders by start time', () => {
  const store = makeStore();
  const list = UI.sortedBlocks(store, '2026-08-10');
  assert.equal(list[0].start, '09:00');
  assert.equal(list[1].start, '14:00');
});

test('detectOverlaps flags overlapping blocks, ignores cancelled', () => {
  const store = makeStore();
  assert.equal(UI.detectOverlaps(store, '2026-08-10'), ''); // no overlap
  store.blocks.push({ id: 'b4', taskUid: 'u1', date: '2026-08-10', start: '09:30', end: '11:00', status: 'planned', createdAt: 'x', updatedAt: 'x' });
  assert.ok(UI.detectOverlaps(store, '2026-08-10').length > 0);
  // cancelled block must not produce overlap
  store.blocks.push({ id: 'b5', taskUid: 'u1', date: '2026-08-10', start: '10:45', end: '12:00', status: 'cancelled', createdAt: 'x', updatedAt: 'x' });
  assert.equal(UI.detectOverlaps(store, '2026-08-10').includes('10:45'), false);
});

test('scheduleViewHTML renders timeline, daystrip, add button, nav', () => {
  const store = makeStore();
  const html = UI.scheduleViewHTML({
    store, date: '2026-08-10', state: makeState(), inbox,
    planStart, todayIso: '2026-08-10', monthStart: '2026-08-01', monthEnd: '2026-08-31',
  });
  assert.ok(html.includes('tb-timeline'));
  assert.ok(html.includes('tb-daystrip'));
  assert.ok(html.includes('data-action="tb-add"'));
  assert.ok(html.includes('data-action="tb-prev"'));
  assert.ok(html.includes('data-action="tb-next"'));
  assert.ok(html.includes('data-action="tb-today"'));
  assert.ok(html.includes('tb-block'));
});

test('dayStripHTML marks selected/today/muted days', () => {
  const html = UI.dayStripHTML('2026-08-10', '2026-08-10', '2026-08-01', '2026-08-31');
  assert.ok(html.includes('selected'));
  assert.ok(html.includes('today'));
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
});

test('blockRowHTML exposes time, task text, status, actions with labels', () => {
  const store = makeStore();
  const html = UI.blockRowHTML(store.blocks[0], makeState(), inbox);
  assert.ok(html.includes('09:00'));
  assert.ok(html.includes('10:30'));
  assert.ok(html.includes('Learn Spring Boot'));
  assert.ok(html.includes('tb-focus'));
  assert.ok(html.includes('tb-status'));
  assert.ok(html.includes('tb-del'));
  assert.ok(html.includes('role="group"'));
});

test('taskOptionsHTML: day tasks + inbox + no-task option, selected preserved', () => {
  const state = makeState();
  const html = UI.taskOptionsHTML(state, inbox, planStart, '2026-08-10', 'u1');
  assert.ok(html.includes('value="u1"'));
  assert.ok(html.includes('Learn Spring Boot'));
  assert.ok(html.includes('value="u9"'));
  assert.ok(html.includes('Inbox item'));
  assert.ok(html.includes('selected'));
  assert.ok(html.includes('value=""'));
});

test('blockDialogHTML pre-fills values and status options', () => {
  const state = makeState();
  const html = UI.blockDialogHTML({ block: makeStore().blocks[0], date: '2026-08-10', state, inbox, planStart });
  assert.ok(html.includes('value="2026-08-10"'));
  assert.ok(html.includes('value="09:00"'));
  assert.ok(html.includes('value="10:30"'));
  assert.ok(html.includes('value="planned"'));
  assert.ok(html.includes('data-role="tb-task"'));
});

test('readBlockDialog reads form values', () => {
  const root = {
    querySelector: (sel) => {
      const map = {
        '[data-role="tb-task"]': { value: 'u1' },
        '[data-role="tb-date"]': { value: '2026-08-12' },
        '[data-role="tb-start"]': { value: '19:00' },
        '[data-role="tb-end"]': { value: '20:30' },
        '[data-role="tb-status"]': { value: 'planned' },
      };
      return map[sel] || null;
    },
  };
  const v = UI.readBlockDialog(root);
  assert.equal(v.taskUid, 'u1');
  assert.equal(v.date, '2026-08-12');
  assert.equal(v.start, '19:00');
  assert.equal(v.end, '20:30');
  assert.equal(v.status, 'planned');
});

test('taskDetailBlocksHTML lists task blocks across days, sorted', () => {
  const store = makeStore();
  // add second block for u1 on a later day
  store.blocks.push({ id: 'b6', taskUid: 'u1', date: '2026-08-12', start: '07:00', end: '07:30', status: 'planned', createdAt: 'x', updatedAt: 'x' });
  const html = UI.taskDetailBlocksHTML(store, 'u1');
  assert.ok(html.includes('td-tb-row'));
  assert.ok(html.includes('tb-focus'));
  assert.ok(html.includes('tb-edit'));
  assert.ok(html.includes('tb-del'));
  assert.ok(html.includes('tb-add'));
  assert.ok(html.includes('07:00–07:30'));
  // another task's blocks not shown
  const html2 = UI.taskDetailBlocksHTML(store, 'u2');
  assert.ok(!html2.includes('07:00–07:30'));
});

test('taskDetailBlocksHTML empty state', () => {
  const store = makeStore();
  const html = UI.taskDetailBlocksHTML(store, 'ghost');
  assert.ok(html.includes('tbNoBlocks'));
  assert.ok(!html.includes('td-tb-row'));
});

test('block time range uses en-dash, both directions stable', () => {
  assert.equal(UI.fmtTimeRange('09:00', '10:30'), '09:00–10:30');
});

test('overlap text lists both ranges', () => {
  const store = makeStore();
  store.blocks.push({ id: 'b7', taskUid: 'u1', date: '2026-08-10', start: '09:15', end: '10:00', status: 'planned', createdAt: 'x', updatedAt: 'x' });
  const note = UI.detectOverlaps(store, '2026-08-10');
  assert.ok(note.includes('09:00–10:30'));
  assert.ok(note.includes('09:15–10:00'));
});

test('timelineHTML renders 24 hour grid + empty note', () => {
  const empty = UI.timelineHTML({ version: 2, blocks: [] }, '2026-08-10', makeState(), inbox);
  assert.ok(empty.includes('tb-empty'));
  assert.equal((empty.match(/tb-hour/g) || []).length, 24);
  const full = UI.timelineHTML(makeStore(), '2026-08-10', makeState(), inbox);
  assert.ok(!full.includes('tb-empty'));
});

test('dayStrip muted day (outside month) flagged', () => {
  const html = UI.dayStripHTML('2026-08-31', '2026-08-10', '2026-08-01', '2026-08-31');
  // 2026-08-31 is a Monday → strip covers 08-31..09-06 → 09-01..09-06 muted
  assert.ok(html.includes('muted'));
});
