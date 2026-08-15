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
// Stub i18n: resolve V2 unscheduled keys (with {n} interpolation), keep unknown keys as-is.
const T_KEYS = {
  tbUnscheduled: 'Unscheduled', tbUnsCountOne: '1 task', tbUnsCount: '{n} tasks',
  tbUnsDur: '{n} min', tbScheduleAction: 'Schedule',
  tbUnsShowMore: 'Show {n} more', tbUnsCollapse: 'Collapse',
  tbNoTasksNoBlocks: 'No tasks or time blocks yet', tbNoBlocksUnscheduled: 'Unscheduled tasks above',
};
window.TaskFlowI18N = {
  t: (k, v) => {
    const s = T_KEYS[k];
    if (s === undefined) return k || '';
    return v ? String(s).replace(/\{(\w+)\}/g, (_, m) => (v[m] == null ? '' : v[m])) : s;
  },
  locale: 'en-US',
};
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

/* ---------------- V2 Schedule UX: unscheduled tasks ---------------- */

test('unscheduledTasksForDate: scheduled iff any non-cancelled block on the day', () => {
  const state = {
    weeks: [{
      n: 1, days: [
        { date: '2026-08-10', tasks: [
          { uid: 'a', text: 'No block' },
          { uid: 'b', text: 'Planned block' },
          { uid: 'c', text: 'Cancelled-only' },
          { uid: 'd', text: 'Done task', done: true },
          { uid: 'e', text: 'Two blocks' },
        ] },
        { date: '2026-08-11', tasks: [{ uid: 'f', text: 'Other day' }] },
      ],
    }],
  };
  const store = { version: 2, blocks: [
    { id: 'x1', taskUid: 'b', date: '2026-08-10', start: '09:00', end: '10:00', status: 'planned' },
    { id: 'x2', taskUid: 'c', date: '2026-08-10', start: '11:00', end: '12:00', status: 'cancelled' },
    { id: 'x3', taskUid: 'e', date: '2026-08-10', start: '08:00', end: '08:30', status: 'planned' },
    { id: 'x4', taskUid: 'e', date: '2026-08-10', start: '16:00', end: '17:00', status: 'completed' },
  ] };
  // 1 no block, 2 planned block, 3 cancelled-only, 4 done, 5 two blocks (planned+completed)
  const res = UI.unscheduledTasksForDate({ state, planStart, date: '2026-08-10', timeblockStore: store });
  assert.deepEqual(res.map((t) => t.uid).sort(), ['a', 'c']);
  // 6 task from another date excluded
  const day2 = UI.unscheduledTasksForDate({ state, planStart, date: '2026-08-11', timeblockStore: store });
  assert.deepEqual(day2.map((t) => t.uid), ['f']);
  // cancelled-only task disappears once a real block is added
  store.blocks.push({ id: 'x5', taskUid: 'c', date: '2026-08-10', start: '13:00', end: '13:30', status: 'planned' });
  const after = UI.unscheduledTasksForDate({ state, planStart, date: '2026-08-10', timeblockStore: store });
  assert.deepEqual(after.map((t) => t.uid), ['a']);
});

test('unscheduledTasksForDate: no store / no blocks → all day tasks unscheduled', () => {
  const state = makeState();
  const res = UI.unscheduledTasksForDate({ state, planStart, date: '2026-08-10', timeblockStore: null });
  assert.deepEqual(res.map((t) => t.uid), ['u1']);
  const empty = UI.unscheduledTasksForDate({ state, planStart, date: '2026-08-12', timeblockStore: null });
  assert.deepEqual(empty, []);
});

test('unscheduledSectionHTML: rows with duration, priority dot, quick action; empty → ""', () => {
  const tasks = [
    { uid: 'a', text: 'Làm bài Database', duration: 60, kind: 'regular' },
    { uid: 'c', text: 'Học English', estimatedMinutes: 30, kind: 'priority' },
  ];
  const html = UI.unscheduledSectionHTML(tasks, '2026-08-15');
  assert.ok(html.includes('tb-unscheduled'));
  assert.ok(html.includes('tb-uns-row'));
  assert.ok(html.includes('Làm bài Database'));
  assert.ok(html.includes('data-action="tb-quick"'));
  assert.ok(html.includes('data-uid="a"'));
  assert.ok(html.includes('data-date="2026-08-15"'));
  assert.ok(html.includes('data-dur="60"'));
  assert.ok(html.includes('data-dur="30"'));
  assert.ok(html.includes('60 min'));
  assert.ok(html.includes('2 tasks'));
  assert.ok(html.includes('tb-uns-dot priority'));
  assert.ok(html.includes('aria-label="Schedule: Làm bài Database"'));
  assert.equal(UI.unscheduledSectionHTML([], '2026-08-15'), '');
  // task without duration → row without duration chip
  const noDur = UI.unscheduledSectionHTML([{ uid: 'z', text: 'Quick note' }], '2026-08-15');
  assert.ok(noDur.includes('Quick note'));
  assert.ok(!noDur.includes('tb-uns-dur'));
});

test('unscheduledSectionHTML: one row per given task (derivation dedupes upstream)', () => {
  const tasks = [
    { uid: 'a', text: 'Again' },
    { uid: 'a', text: 'Again' }, // defensive: callers pass the derived list; section renders rows 1:1
  ];
  const html = UI.unscheduledSectionHTML(tasks, '2026-08-15');
  assert.equal((html.match(/tb-uns-row/g) || []).length, 2);
});

test('unscheduledSectionHTML: 10 tasks show five rows then accessible disclosure', () => {
  const tasks = Array.from({ length: 10 }, (_, i) => ({ uid: `u${i}`, text: `Task ${i + 1}` }));
  const html = UI.unscheduledSectionHTML(tasks, '2026-08-15');
  assert.equal((html.match(/class="tb-uns-row"/g) || []).length, 5);
  assert.match(html, /data-action="tb-uns-toggle"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="tb-uns-list-2026-08-15"/);
  assert.match(html, /Show 5 more/);
  assert.doesNotMatch(html, /Task 6/);
});

test('unscheduledSectionHTML: expanded renders all rows and collapse control', () => {
  const tasks = Array.from({ length: 10 }, (_, i) => ({ uid: `u${i}`, text: `Task ${i + 1}` }));
  const html = UI.unscheduledSectionHTML(tasks, '2026-08-15', true);
  assert.equal((html.match(/class="tb-uns-row"/g) || []).length, 10);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /Collapse/);
});

test('unscheduledSectionHTML: collapsed view uses the first five tasks with renderable text', () => {
  const tasks = [
    { uid: 'u1', text: 'Task 1' },
    { uid: 'blank', text: '   ' },
    { uid: 'u2', text: 'Task 2' },
    { uid: 'u3', text: 'Task 3' },
    { uid: 'u4', text: 'Task 4' },
    { uid: 'u5', text: 'Task 5' },
    { uid: 'u6', text: 'Task 6' },
  ];
  const html = UI.unscheduledSectionHTML(tasks, '2026-08-15');
  assert.equal((html.match(/class="tb-uns-row"/g) || []).length, 5);
  assert.match(html, />6 tasks</);
  assert.match(html, /Task 5/);
  assert.doesNotMatch(html, /Task 6/);
  assert.match(html, /Show 1 more/);
});

test('timelineEmptyMessage: context variants', () => {
  assert.equal(UI.timelineEmptyMessage(0, 0), 'No tasks or time blocks yet');
  assert.equal(UI.timelineEmptyMessage(3, 2), 'Unscheduled tasks above');
  assert.equal(UI.timelineEmptyMessage(3, 0), 'tbNoBlocks');
});

test('scheduleViewHTML: unscheduled section above timeline, present only when tasks exist', () => {
  const state = {
    weeks: [{ n: 1, days: [{ date: '2026-08-10', tasks: [{ uid: 'u1', text: 'Learn Spring Boot' }] }] }],
  };
  const store = makeStore(); // b1 planned for u1 on 08-10 → scheduled, no unscheduled section
  const html = UI.scheduleViewHTML({ store, date: '2026-08-10', state, inbox, planStart, todayIso: '2026-08-10', monthStart: '2026-08-01', monthEnd: '2026-08-31' });
  assert.ok(!html.includes('tb-unscheduled'));
  // drop the planned block → section appears above the timeline
  const bare = { version: 2, blocks: store.blocks.filter((b) => b.taskUid !== 'u1' || b.date !== '2026-08-10') };
  const html2 = UI.scheduleViewHTML({ store: bare, date: '2026-08-10', state, inbox, planStart, todayIso: '2026-08-10', monthStart: '2026-08-01', monthEnd: '2026-08-31' });
  assert.ok(html2.includes('tb-unscheduled'));
  assert.ok(html2.indexOf('tb-unscheduled') < html2.indexOf('tb-timeline'));
  // empty day → combined message, no section
  const empty = UI.scheduleViewHTML({ store: bare, date: '2026-08-12', state, inbox, planStart, todayIso: '2026-08-10', monthStart: '2026-08-01', monthEnd: '2026-08-31' });
  assert.ok(!empty.includes('tb-unscheduled'));
  assert.ok(empty.includes('No tasks or time blocks yet'));
});

test('blockDialogHTML: durationMinutes proposes end = start + duration for new block only', () => {
  const state = makeState();
  // 09:00 default start + 90m → 10:30 (distinct from the 10:00 default end)
  const fresh = UI.blockDialogHTML({ date: '2026-08-10', state, inbox, planStart, durationMinutes: 90 });
  assert.ok(fresh.includes('value="09:00"'));
  assert.ok(fresh.includes('value="10:30"'));
  assert.ok(!fresh.includes('value="10:00"'));
  // editing an existing block never prefills — keeps its own end (b2 ends 15:00)
  const editing = UI.blockDialogHTML({ block: makeStore().blocks[1], date: '2026-08-10', state, inbox, planStart, durationMinutes: 90 });
  assert.ok(editing.includes('value="15:00"'));
  assert.ok(!editing.includes('value="10:30"'));
  // invalid duration → no prefill, plain default end
  const bad = UI.blockDialogHTML({ date: '2026-08-10', state, inbox, planStart, durationMinutes: 0 });
  assert.ok(bad.includes('value="10:00"'));
  assert.ok(!bad.includes('value="10:30"'));
});
