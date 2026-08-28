/* tests/phase12-task-store.test.mjs — Unit tests for Phase 12 canonical task mutation layer. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ts from '../js/task-store.js';

/* ===================== UID Generation ===================== */

describe('TaskFlowTaskStore — UID', () => {
  it('generates unique UIDs', () => {
    const a = ts.newTaskUid();
    const b = ts.newTaskUid();
    assert.ok(a !== b, 'UIDs must be unique');
    assert.ok(typeof a === 'string' && a.length > 3, 'UID must be a non-trivial string');
  });

  it('ensureTaskUid assigns UID if missing', () => {
    const t = { text: 'hello' };
    ts.ensureTaskUid(t);
    assert.ok(typeof t.uid === 'string' && t.uid.length > 3);
  });

  it('ensureTaskUid is idempotent', () => {
    const t = { uid: 'existing-uid', text: 'hello' };
    ts.ensureTaskUid(t);
    assert.equal(t.uid, 'existing-uid');
  });
});

/* ===================== Recurrence Identity ===================== */

describe('TaskFlowTaskStore — SeriesId', () => {
  it('returns repeat.seriesId when present', () => {
    const t = { uid: 'u1', repeat: { freq: 'daily', seriesId: 's1' } };
    assert.equal(ts.getSeriesId(t), 's1');
  });

  it('derives from uid when no seriesId', () => {
    const t = { uid: 'u1', repeat: { freq: 'daily' } };
    assert.equal(ts.getSeriesId(t), 'repeat:u1');
  });

  it('returns null for non-recurring task without uid', () => {
    assert.equal(ts.getSeriesId(null), null);
    assert.equal(ts.getSeriesId({}), null);
  });

  it('returns null for task without repeat', () => {
    assert.equal(ts.getSeriesId({ uid: 'u1' }), 'repeat:u1');
  });

  it('ensureSeriesId attaches seriesId idempotently', () => {
    const t = { uid: 'u1', repeat: { freq: 'daily' } };
    ts.ensureSeriesId(t);
    assert.equal(t.repeat.seriesId, 'repeat:u1');
    // Call again — no change
    ts.ensureSeriesId(t);
    assert.equal(t.repeat.seriesId, 'repeat:u1');
  });

  it('ensureSeriesId returns null for non-recurring', () => {
    const t = { uid: 'u1' };
    assert.equal(ts.ensureSeriesId(t), null);
  });
});

/* ===================== Normalize ===================== */

describe('TaskFlowTaskStore — normalizeTask', () => {
  it('fills defaults for missing fields', () => {
    const t = ts.normalizeTask({ text: 'hello' });
    assert.equal(t.text, 'hello');
    assert.equal(t.done, false);
    assert.equal(t.kind, 'regular');
    assert.ok(Array.isArray(t.tags));
    assert.ok(Array.isArray(t.linkedMetricIds));
    assert.deepEqual(t.remind, { enabled: false, time: '20:00' });
    assert.equal(t.repeat, null);
    assert.equal(t.carriedFrom, null);
  });

  it('preserves provided fields', () => {
    const t = ts.normalizeTask({
      text: 'task',
      done: true,
      kind: 'priority',
      tags: ['a'],
      repeat: { freq: 'daily', every: 1 },
      duration: 30,
      projectId: 'proj1',
    });
    assert.equal(t.done, true);
    assert.equal(t.kind, 'priority');
    assert.deepEqual(t.tags, ['a']);
    assert.deepEqual(t.repeat, { freq: 'daily', every: 1 });
    assert.equal(t.duration, 30);
    assert.equal(t.projectId, 'proj1');
  });

  it('deep-copies arrays and objects', () => {
    const tags = ['a'];
    const t = ts.normalizeTask({ text: 'x', tags: tags });
    tags.push('b');
    assert.deepEqual(t.tags, ['a']); // not affected by mutation
  });

  it('returns null for invalid input', () => {
    assert.equal(ts.normalizeTask(null), null);
    assert.equal(ts.normalizeTask('string'), null);
    assert.equal(ts.normalizeTask(42), null);
  });

  it('stringifies non-string text', () => {
    const t = ts.normalizeTask({ text: 123 });
    assert.equal(t.text, '123');
  });
});

/* ===================== Create ===================== */

describe('TaskFlowTaskStore — create', () => {
  it('creates a task with UID in the given array', () => {
    const dayTasks = [];
    const result = ts.create(dayTasks, { text: 'Buy milk' });
    assert.ok(typeof result === 'object' && result.uid);
    assert.equal(result.text, 'Buy milk');
    assert.equal(dayTasks.length, 1);
    assert.equal(dayTasks[0].uid, result.uid);
  });

  it('preserves provided UID', () => {
    const dayTasks = [];
    const result = ts.create(dayTasks, { uid: 'my-uid', text: 'Task' });
    assert.equal(result.uid, 'my-uid');
  });

  it('normalizes input', () => {
    const dayTasks = [];
    const result = ts.create(dayTasks, { text: 'X' });
    assert.equal(result.done, false);
    assert.equal(result.kind, 'regular');
    assert.ok(Array.isArray(result.tags));
  });

  it('returns skipped for invalid input', () => {
    const dayTasks = [];
    const result = ts.create(dayTasks, null);
    assert.ok(result && result.skipped);
    assert.equal(dayTasks.length, 0);
  });

  it('assigns seriesId for recurring tasks', () => {
    const dayTasks = [];
    const result = ts.create(dayTasks, { text: 'Daily', repeat: { freq: 'daily', every: 1 } });
    assert.ok(result.repeat.seriesId);
  });

  it('respects operationId dedup', () => {
    const dayTasks = [];
    const r1 = ts.create(dayTasks, { text: 'First' }, { operationId: 'op-1' });
    assert.ok(r1 && r1.uid);
    assert.equal(dayTasks.length, 1);
    // Second create with same operationId → skipped
    const r2 = ts.create(dayTasks, { text: 'Second' }, { operationId: 'op-1' });
    assert.ok(r2 && r2.skipped);
    assert.equal(dayTasks.length, 1);
  });

  it('allows duplicate text (manual tasks)', () => {
    const dayTasks = [];
    ts.create(dayTasks, { text: 'Read' });
    ts.create(dayTasks, { text: 'Read' });
    assert.equal(dayTasks.length, 2);
  });
});

/* ===================== Update ===================== */

describe('TaskFlowTaskStore — update', () => {
  it('updates known fields', () => {
    const t = { uid: 'u1', text: 'old', done: false, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    const r = ts.update(t, { text: 'new', done: true, kind: 'priority' });
    assert.ok(r.ok);
    assert.equal(t.text, 'new');
    assert.equal(t.done, true);
    assert.equal(t.kind, 'priority');
  });

  it('rejects unknown UID', () => {
    const t = null;
    const r = ts.update(t, { text: 'x' });
    assert.equal(r.ok, false);
  });

  it('ignores unknown fields', () => {
    const t = { uid: 'u1', text: 'old', done: false, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    const r = ts.update(t, { text: 'new', hacks: 'evil' });
    assert.ok(r.ok);
    assert.equal(t.text, 'new');
    assert.equal(t.hacks, undefined);
  });

  it('updates repeat and ensures seriesId', () => {
    const t = { uid: 'u1', text: 't', done: false, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' }, repeat: null };
    ts.update(t, { repeat: { freq: 'daily', every: 1 } });
    assert.equal(t.repeat.seriesId, 'repeat:u1');
  });
});

/* ===================== Remove ===================== */

describe('TaskFlowTaskStore — remove', () => {
  it('removes by index', () => {
    const tasks = [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }];
    const r = ts.remove(tasks, 1);
    assert.ok(r.ok);
    assert.equal(r.removed.uid, 'b');
    assert.equal(tasks.length, 2);
  });

  it('removes by task reference', () => {
    const t = { uid: 'x' };
    const tasks = [t, { uid: 'y' }];
    const r = ts.remove(tasks, t);
    assert.ok(r.ok);
    assert.equal(tasks.length, 1);
  });

  it('returns error for out-of-bounds', () => {
    const tasks = [{ uid: 'a' }];
    const r = ts.remove(tasks, 5);
    assert.equal(r.ok, false);
  });

  it('returns error for non-existent task', () => {
    const tasks = [{ uid: 'a' }];
    const r = ts.remove(tasks, { uid: 'z' });
    assert.equal(r.ok, false);
  });
});

/* ===================== Complete ===================== */

describe('TaskFlowTaskStore — complete', () => {
  it('toggles done state', () => {
    const t = { uid: 'u1', done: false };
    ts.complete(t);
    assert.equal(t.done, true);
    ts.complete(t);
    assert.equal(t.done, false);
  });

  it('sets explicit done value', () => {
    const t = { uid: 'u1', done: false };
    ts.complete(t, true);
    assert.equal(t.done, true);
    ts.complete(t, true); // idempotent
    assert.equal(t.done, true);
  });

  it('calls side-effect hook', () => {
    const t = { uid: 'u1', done: false };
    let called = false;
    ts.complete(t, true, () => { called = true; });
    assert.equal(called, true);
    assert.equal(t.done, true);
  });

  it('rejects null task', () => {
    const r = ts.complete(null);
    assert.equal(r.ok, false);
  });
});

/* ===================== Move ===================== */

describe('TaskFlowTaskStore — move', () => {
  it('moves task from src to dst', () => {
    const src = [{ uid: 'a' }, { uid: 'b' }];
    const dst = [{ uid: 'c' }];
    const r = ts.move(src, dst, 0);
    assert.ok(r.ok);
    assert.equal(src.length, 1);
    assert.equal(dst.length, 2);
    assert.equal(dst[1].uid, 'a');
  });

  it('moves by task reference', () => {
    const t = { uid: 'a' };
    const src = [t, { uid: 'b' }];
    const dst = [];
    const r = ts.move(src, dst, t);
    assert.ok(r.ok);
    assert.equal(src.length, 1);
    assert.equal(dst.length, 1);
    assert.equal(dst[0].uid, 'a');
  });

  it('inserts at specific position', () => {
    const src = [{ uid: 'a' }];
    const dst = [{ uid: 'b' }, { uid: 'c' }];
    ts.move(src, dst, 0, 1);
    assert.equal(dst[1].uid, 'a');
  });

  it('preserves UID and metadata', () => {
    const t = { uid: 'a', text: 'hello', done: true, tags: ['x'] };
    const src = [t];
    const dst = [];
    ts.move(src, dst, 0);
    assert.equal(dst[0].uid, 'a');
    assert.equal(dst[0].text, 'hello');
    assert.equal(dst[0].done, true);
  });

  it('returns error for missing task', () => {
    const src = [{ uid: 'a' }];
    const dst = [];
    const r = ts.move(src, dst, 5);
    assert.equal(r.ok, false);
  });

  it('returns error for invalid arrays', () => {
    const r = ts.move(null, [], 0);
    assert.equal(r.ok, false);
  });
});

/* ===================== findByUid ===================== */

describe('TaskFlowTaskStore — findByUid', () => {
  it('finds task across weeks', () => {
    const weeks = [
      { days: [{ tasks: [{ uid: 'a' }, { uid: 'b' }] }] },
      { days: [{ tasks: [] }, { tasks: [{ uid: 'c' }] }] },
    ];
    const r = ts.findByUid(weeks, 'c');
    assert.ok(r);
    assert.equal(r.task.uid, 'c');
    assert.equal(r.weekIdx, 1);
    assert.equal(r.dayIdx, 1);
    assert.equal(r.taskIdx, 0);
  });

  it('returns null for missing UID', () => {
    const weeks = [{ days: [{ tasks: [{ uid: 'a' }] }] }];
    assert.equal(ts.findByUid(weeks, 'z'), null);
  });

  it('returns null for null/undefined inputs', () => {
    assert.equal(ts.findByUid(null, 'x'), null);
    assert.equal(ts.findByUid([], null), null);
  });
});

/* ===================== materializeRecurrence ===================== */

describe('TaskFlowTaskStore — materializeRecurrence', () => {
  it('creates occurrence copy in target day', () => {
    const source = { uid: 'src1', text: 'Daily', repeat: { freq: 'daily', every: 1 }, done: false, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    const target = [];
    const r = ts.materializeRecurrence(source, target);
    assert.ok(r);
    assert.ok(r.uid !== 'src1'); // new UID
    assert.equal(r.text, 'Daily');
    assert.equal(r.done, false);
    assert.equal(r.repeat.seriesId, 'repeat:src1');
    assert.equal(target.length, 1);
  });

  it('is idempotent (same series = no duplicate)', () => {
    const source = { uid: 'src1', text: 'Daily', repeat: { freq: 'daily', every: 1 }, done: false, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    const target = [];
    ts.materializeRecurrence(source, target);
    const r2 = ts.materializeRecurrence(source, target);
    assert.equal(r2, null); // already exists
    assert.equal(target.length, 1);
  });

  it('respects operationId dedup', () => {
    const source = { uid: 'src1', text: 'Daily', repeat: { freq: 'daily', every: 1 }, done: false, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    const target = [];
    ts.materializeRecurrence(source, target, { operationId: 'occ-1' });
    const r2 = ts.materializeRecurrence(source, target, { operationId: 'occ-1' });
    assert.equal(r2, null);
    assert.equal(target.length, 1);
  });

  it('allows different series in same day', () => {
    const s1 = { uid: 'a', text: 'A', repeat: { freq: 'daily' }, done: false, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    const s2 = { uid: 'b', text: 'B', repeat: { freq: 'daily' }, done: false, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    const target = [];
    ts.materializeRecurrence(s1, target);
    ts.materializeRecurrence(s2, target);
    assert.equal(target.length, 2);
  });

  it('returns null for non-recurring task', () => {
    assert.equal(ts.materializeRecurrence({ uid: 'u1', text: 'X' }, []), null);
  });
});

/* ===================== carry ===================== */

describe('TaskFlowTaskStore — carry', () => {
  it('creates carry copy when no same-series in target', () => {
    const source = { uid: 'src1', text: 'Drink water', repeat: { freq: 'daily' }, done: false, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    const target = [];
    const r = ts.carry(source, target, '2026-08-27');
    assert.equal(r.merged, false);
    assert.ok(r.copy);
    assert.ok(r.copy.uid !== 'src1');
    assert.equal(r.copy.carriedFrom.uid, 'src1');
    assert.equal(r.copy.repeat, null); // carry copy doesn't re-recur
    assert.equal(target.length, 1);
  });

  it('merges when same-series exists in target', () => {
    const seriesTask = { uid: 'today-occ', text: 'Drink water', repeat: { freq: 'daily', seriesId: 's1' }, done: false, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    const source = { uid: 'yesterday', text: 'Drink water', repeat: { freq: 'daily', seriesId: 's1' }, done: false, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    const target = [seriesTask];
    const r = ts.carry(source, target, '2026-08-27');
    assert.equal(r.merged, true);
    assert.equal(target.length, 1); // no duplicate
    assert.equal(r.copy.carriedFrom.uid, 'yesterday');
  });

  it('does not carry completed source', () => {
    const source = { uid: 'src1', text: 'X', repeat: { freq: 'daily' }, done: true, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    const target = [];
    const r = ts.carry(source, target);
    assert.equal(r.merged, false);
    assert.equal(r.copy, null);
    assert.equal(target.length, 0);
  });

  it('does not carry non-recurring tasks', () => {
    const source = { uid: 'src1', text: 'X', done: false, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    const target = [];
    const r = ts.carry(source, target);
    assert.equal(r.merged, false);
    assert.equal(r.copy, null);
  });

  it('preserves done state when merging into existing', () => {
    const existing = { uid: 'today1', text: 'X', done: true, repeat: { freq: 'daily', seriesId: 's1' }, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    const source = { uid: 'y1', text: 'X', done: false, repeat: { freq: 'daily', seriesId: 's1' }, kind: 'regular', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } };
    ts.carry(source, [existing], '2026-08-27');
    assert.equal(existing.done, true); // done=true stays true
  });
});

/* ===================== Transaction ===================== */

describe('TaskFlowTaskStore — transaction', () => {
  it('returns needsSave when dirty and batch completes', () => {
    const r = ts.transaction(() => { ts.markDirty(); return 42; });
    assert.equal(r.result, 42);
    assert.equal(r.needsSave, true);
  });

  it('returns needsSave=false when not dirty', () => {
    const r = ts.transaction(() => 42);
    assert.equal(r.result, 42);
    assert.equal(r.needsSave, false);
  });

  it('defers save while batching', () => {
    ts.beginBatch();
    ts.markDirty();
    const r1 = ts.endBatch(); // still depth > 0? no — depth becomes 0
    assert.equal(r1, true); // should signal save
  });

  it('nesting: inner endBatch does not flush', () => {
    ts.beginBatch();
    ts.beginBatch();
    ts.markDirty();
    const r = ts.endBatch();
    assert.equal(r, false); // depth 1 → not flushing yet
    const r2 = ts.endBatch();
    assert.equal(r2, true); // depth 0 → flush
  });
});

/* ===================== Validation ===================== */

describe('TaskFlowTaskStore — validateTask', () => {
  it('validates a canonical task', () => {
    const t = ts.create([], { text: 'X' });
    const r = ts.validateTask(t);
    assert.ok(r.ok);
  });

  it('rejects non-object', () => {
    assert.equal(ts.validateTask(null).ok, false);
    assert.equal(ts.validateTask('x').ok, false);
  });

  it('rejects missing UID', () => {
    assert.equal(ts.validateTask({ text: 'x', done: false, kind: 'regular' }).ok, false);
  });

  it('rejects invalid kind', () => {
    const r = ts.validateTask({ uid: 'u', text: 'x', done: false, kind: 'invalid' });
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('invalid-kind'));
  });
});

/* ===================== Atomic Transaction ===================== */

describe('TaskFlowTaskStore — atomicTransaction', () => {
  it('executes mutations and returns needsSave on success', () => {
    const arr = [];
    const r = ts.atomicTransaction([arr], () => {
      ts.create(arr, { text: 'A' });
      ts.create(arr, { text: 'B' });
    });
    assert.equal(r.ok, true);
    assert.equal(arr.length, 2);
    assert.equal(r.needsSave, true);
  });

  it('rolls back on failure — no half-state', () => {
    const arr = [];
    const r = ts.atomicTransaction([arr], () => {
      ts.create(arr, { text: 'A' });
      ts.create(arr, { text: 'B' });
      throw new Error('boom');
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'boom');
    assert.equal(arr.length, 0, 'array must be empty after rollback');
  });

  it('rolls back multiple arrays atomically', () => {
    const a1 = [];
    const a2 = [];
    const r = ts.atomicTransaction([a1, a2], () => {
      ts.create(a1, { text: 'A' });
      ts.create(a2, { text: 'B' });
      throw new Error('fail');
    });
    assert.equal(r.ok, false);
    assert.equal(a1.length, 0);
    assert.equal(a2.length, 0);
  });

  it('does not modify arrays on failure', () => {
    const arr = [{ uid: 'existing', text: 'old', done: false }];
    const r = ts.atomicTransaction([arr], () => {
      arr[0].text = 'mutated';
      throw new Error('nope');
    });
    assert.equal(r.ok, false);
    assert.equal(arr[0].text, 'old', 'original task must be restored');
  });

  it('returns ok:false on invalid args', () => {
    assert.equal(ts.atomicTransaction(null, () => {}).ok, false);
    assert.equal(ts.atomicTransaction([], 'notfn').ok, false);
  });
});

/* ===================== normalizeTask UID Guarantee ===================== */

describe('TaskFlowTaskStore — normalizeTask always produces UID', () => {
  it('assigns UID when input has no uid', () => {
    const t = ts.normalizeTask({ text: 'test' });
    assert.ok(t.uid, 'normalizeTask must never return task with null/undefined uid');
    assert.equal(typeof t.uid, 'string');
  });

  it('preserves supplied UID', () => {
    const t = ts.normalizeTask({ uid: 'my-uid', text: 'test' });
    assert.equal(t.uid, 'my-uid');
  });

  it('each call produces a different UID', () => {
    const a = ts.normalizeTask({ text: 'a' });
    const b = ts.normalizeTask({ text: 'b' });
    assert.notEqual(a.uid, b.uid);
  });

  it('produces valid task for all default fields', () => {
    const t = ts.normalizeTask({ text: 'minimal' });
    assert.equal(t.done, false);
    assert.equal(typeof t.text, 'string');
    assert.ok(Array.isArray(t.tags));
    assert.ok(Array.isArray(t.linkedMetricIds));
  });
});
