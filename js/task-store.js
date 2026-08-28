/* js/task-store.js — Phase 12: Canonical Task Mutation Layer.
   Single source of truth for all task mutations. Every module that creates, updates,
   removes, completes, moves, or carries tasks MUST go through this API.
   Runs in browser (window.TaskFlowTaskStore) and Node (module.exports) for unit tests.
   No DOM access, no localStorage, no render calls — pure data mutation. */
(function () {
  'use strict';

  /* ===================== UID Generation ===================== */

  // Stable UID: timestamp-base36 + 6 random chars. Collision-resistant within TaskFlow scope.
  function newTaskUid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Assign UID if missing (idempotent). Mutates task in-place.
  function ensureTaskUid(tk) {
    if (tk && typeof tk.uid !== 'string') tk.uid = newTaskUid();
    return tk;
  }

  /* ===================== Canonical Recurrence Identity ===================== */

  // Stable series identifier for recurring tasks. Never changes across occurrences.
  // Priority: repeat.seriesId > 'repeat:' + uid > null.
  function getSeriesId(task) {
    if (!task) return null;
    if (task.repeat && task.repeat.seriesId) return task.repeat.seriesId;
    if (task.uid) return 'repeat:' + task.uid;
    return null;
  }

  // Idempotently attach repeat.seriesId to a recurring task missing it.
  function ensureSeriesId(task) {
    if (!task) return null;
    if (!task.repeat || !task.repeat.freq) return null;
    var sid = getSeriesId(task);
    if (sid && !task.repeat.seriesId) {
      task.repeat.seriesId = sid;
    }
    return sid;
  }

  /* ===================== Task Normalization ===================== */

  // Canonical task field defaults. Every task created through this module
  // is guaranteed to have all these fields.
  var TASK_DEFAULTS = {
    uid: null,             // assigned by create if missing
    text: '',
    done: false,
    kind: 'regular',      // 'regular' | 'priority'
    tags: [],
    linkedMetricIds: [],
    remind: { enabled: false, time: '20:00' },
    repeat: null,         // { freq, every, seriesId } | null
    carriedFrom: null,    // { uid, date } | null
    carried: false,
    duration: undefined,
    deadline: undefined,
    projectId: undefined,
    milestoneId: undefined,
    energy: undefined,
    contexts: undefined,
    notes: undefined,
    subtasks: undefined,
    inbox: undefined,
    _recurred: undefined,
  };

  // Normalize a raw task input into canonical form.
  // Fills missing fields with defaults. Does NOT generate UID (use create for that).
  function normalizeTask(input) {
    if (!input || typeof input !== 'object') return null;
    var task = {};
    // Copy known fields from input
    var keys = Object.keys(TASK_DEFAULTS);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (input[k] !== undefined) {
        task[k] = input[k];
      } else {
        // Apply defaults (deep copy for objects)
        var def = TASK_DEFAULTS[k];
        if (def !== null && typeof def === 'object' && !Array.isArray(def)) {
          task[k] = Object.assign({}, def);
        } else if (Array.isArray(def)) {
          task[k] = [];
        } else {
          task[k] = def;
        }
      }
    }
    // Copy any extra fields not in defaults (forward-compatible)
    var allInputKeys = Object.keys(input);
    for (var j = 0; j < allInputKeys.length; j++) {
      var ek = allInputKeys[j];
      if (task[ek] === undefined) task[ek] = input[ek];
    }
    // Ensure arrays are safe copies
    if (Array.isArray(input.tags)) task.tags = input.tags.slice();
    if (Array.isArray(input.linkedMetricIds)) task.linkedMetricIds = input.linkedMetricIds.slice();
    if (input.remind && typeof input.remind === 'object') task.remind = Object.assign({}, input.remind);
    if (input.repeat && typeof input.repeat === 'object') task.repeat = Object.assign({}, input.repeat);
    if (input.carriedFrom && typeof input.carriedFrom === 'object') task.carriedFrom = Object.assign({}, input.carriedFrom);
    if (Array.isArray(input.contexts)) task.contexts = input.contexts.slice();
    if (Array.isArray(input.subtasks)) task.subtasks = input.subtasks.map(function (s) { return Object.assign({}, s); });
    // Text must be string
    if (typeof task.text !== 'string') task.text = String(task.text || '');
    return task;
  }

  /* ===================== OperationId Registry ===================== */

  // Bounded registry for dedup of automated operations (AI, repeat, carry, import).
  var _appliedOps = {};
  var MAX_OPS = 500;
  var _opOrder = [];

  function _registerOp(operationId) {
    if (!operationId) return;
    _appliedOps[operationId] = Date.now();
    _opOrder.push(operationId);
    // Evict oldest
    while (_opOrder.length > MAX_OPS) {
      var old = _opOrder.shift();
      delete _appliedOps[old];
    }
  }

  function isOpApplied(operationId) {
    if (!operationId) return false;
    return !!_appliedOps[operationId];
  }

  /* ===================== Find Task ===================== */

  // Find a task by UID across all weeks. Returns { task, week, day, dayIdx, taskIdx } or null.
  function findByUid(weeks, uid) {
    if (!uid || !Array.isArray(weeks)) return null;
    for (var wi = 0; wi < weeks.length; wi++) {
      var w = weeks[wi];
      if (!w || !Array.isArray(w.days)) continue;
      for (var di = 0; di < w.days.length; di++) {
        var d = w.days[di];
        if (!d || !Array.isArray(d.tasks)) continue;
        for (var ti = 0; ti < d.tasks.length; ti++) {
          if (d.tasks[ti] && d.tasks[ti].uid === uid) {
            return { task: d.tasks[ti], week: w, day: d, weekIdx: wi, dayIdx: di, taskIdx: ti };
          }
        }
      }
    }
    return null;
  }

  /* ===================== CRUD Operations ===================== */

  // Create a new task in a day's task array. Returns the created task.
  // options: { operationId, source }
  function create(dayTasks, input, options) {
    if (!Array.isArray(dayTasks)) return null;
    var opts = options || {};
    // OperationId dedup
    if (opts.operationId && isOpApplied(opts.operationId)) {
      return { skipped: true, reason: 'duplicate-operation' };
    }
    var task = normalizeTask(input);
    if (!task) return { skipped: true, reason: 'invalid-input' };
    // Ensure UID
    if (!task.uid) task.uid = newTaskUid();
    // Ensure seriesId for recurring tasks
    if (task.repeat && task.repeat.freq) ensureSeriesId(task);
    // Push to day
    dayTasks.push(task);
    // Register operation
    if (opts.operationId) _registerOp(opts.operationId);
    return task;
  }

  // Update a task with a patch of allowed fields.
  // Returns { ok: true } or { ok: false, error: string }.
  var UPDATEABLE_FIELDS = ['text', 'done', 'kind', 'tags', 'linkedMetricIds', 'remind',
    'repeat', 'duration', 'deadline', 'projectId', 'milestoneId', 'energy',
    'contexts', 'notes', 'subtasks', 'carriedFrom', 'carried', '_recurred', 'inbox'];

  function update(task, patch) {
    if (!task || typeof task !== 'object') return { ok: false, error: 'task-invalid' };
    if (!patch || typeof patch !== 'object') return { ok: false, error: 'patch-invalid' };
    var keys = Object.keys(patch);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (UPDATEABLE_FIELDS.indexOf(k) < 0) continue;
      var val = patch[k];
      // Deep copy objects/arrays to prevent shared references
      if (Array.isArray(val)) {
        task[k] = val.slice();
      } else if (val !== null && typeof val === 'object') {
        task[k] = Object.assign({}, val);
      } else {
        task[k] = val;
      }
    }
    // Re-normalize seriesId if repeat changed
    if (patch.repeat !== undefined && patch.repeat && patch.repeat.freq) {
      ensureSeriesId(task);
    }
    return { ok: true };
  }

  // Remove a task from a day's task array. Returns { ok, removed } or { ok: false }.
  function remove(dayTasks, taskOrIndex) {
    if (!Array.isArray(dayTasks)) return { ok: false, error: 'invalid-tasks' };
    var idx = -1;
    if (typeof taskOrIndex === 'number') {
      idx = taskOrIndex;
    } else if (taskOrIndex && typeof taskOrIndex === 'object') {
      idx = dayTasks.indexOf(taskOrIndex);
    }
    if (idx < 0 || idx >= dayTasks.length) return { ok: false, error: 'task-not-found' };
    var removed = dayTasks.splice(idx, 1)[0];
    return { ok: true, removed: removed };
  }

  // Toggle or set completion state. Handles carry sync callback.
  // completeFn(weekIdx, dayIdx, taskIdx, task) is optional — called for carry sync.
  function complete(task, done, completeFn) {
    if (!task || typeof task !== 'object') return { ok: false, error: 'task-invalid' };
    var newDone = done !== undefined ? !!done : !task.done;
    task.done = newDone;
    // Call side-effect hook if provided (for carry sync)
    if (typeof completeFn === 'function') {
      try { completeFn(task); } catch (e) { /* side-effect must not break mutation */ }
    }
    return { ok: true, done: newDone };
  }

  // Move a task from one day array to another. Preserves UID and all metadata.
  // Returns { ok, task } or { ok: false }.
  function move(srcTasks, dstTasks, taskOrIndex, insertIdx) {
    if (!Array.isArray(srcTasks) || !Array.isArray(dstTasks)) {
      return { ok: false, error: 'invalid-tasks' };
    }
    var idx = -1;
    if (typeof taskOrIndex === 'number') {
      idx = taskOrIndex;
    } else if (taskOrIndex && typeof taskOrIndex === 'object') {
      idx = srcTasks.indexOf(taskOrIndex);
    }
    if (idx < 0 || idx >= srcTasks.length) return { ok: false, error: 'task-not-found' };
    var task = srcTasks.splice(idx, 1)[0];
    var pos = (typeof insertIdx === 'number' && insertIdx >= 0 && insertIdx <= dstTasks.length)
      ? insertIdx : dstTasks.length;
    dstTasks.splice(pos, 0, task);
    return { ok: true, task: task };
  }

  /* ===================== Recurrence Materialization ===================== */

  // Create a recurrence occurrence for a source task on a target day.
  // Returns the new task copy or null if already exists (idempotent).
  // options: { operationId }
  function materializeRecurrence(sourceTask, dayTasks, options) {
    var opts = options || {};
    if (!sourceTask || !sourceTask.repeat || !sourceTask.repeat.freq) return null;
    if (!Array.isArray(dayTasks)) return null;
    // OperationId dedup
    if (opts.operationId && isOpApplied(opts.operationId)) return null;
    // Series-level idempotency: don't create if same series already in target day
    var seriesId = getSeriesId(sourceTask);
    if (seriesId) {
      for (var i = 0; i < dayTasks.length; i++) {
        if (getSeriesId(dayTasks[i]) === seriesId) return null; // already exists
      }
    }
    // Create occurrence copy
    var copy = normalizeTask(sourceTask);
    if (!copy) return null;
    copy.uid = newTaskUid();
    copy.done = false;
    copy.carriedFrom = null;
    copy.carried = false;
    copy._recurred = undefined;
    copy.linkedMetricIds = [];
    copy.repeat = Object.assign({}, sourceTask.repeat);
    if (!copy.repeat.seriesId && seriesId) copy.repeat.seriesId = seriesId;
    dayTasks.push(copy);
    if (opts.operationId) _registerOp(opts.operationId);
    return copy;
  }

  /* ===================== Smart Carry ===================== */

  // Carry a task into a target day, with recurrence-aware dedup.
  // If same-series task already exists in target, merges carry metadata instead of duplicating.
  // Returns { merged: bool, copy: task|null }.
  function carry(sourceTask, targetTasks, sourceDateStr) {
    if (!sourceTask || !Array.isArray(targetTasks)) return { merged: false, copy: null };
    if (!sourceTask.repeat || !sourceTask.repeat.freq || sourceTask.done) {
      return { merged: false, copy: null };
    }
    var srcSeriesId = getSeriesId(sourceTask);
    if (srcSeriesId) {
      for (var i = 0; i < targetTasks.length; i++) {
        if (getSeriesId(targetTasks[i]) === srcSeriesId) {
          // Same series already exists — merge carry metadata, don't duplicate
          var existing = targetTasks[i];
          if (!existing.carriedFrom) {
            existing.carriedFrom = {
              uid: sourceTask.uid,
              date: sourceDateStr || '',
            };
          }
          return { merged: true, copy: existing };
        }
      }
    }
    // No existing occurrence — create carry copy
    var copy = normalizeTask(sourceTask);
    if (!copy) return { merged: false, copy: null };
    copy.uid = newTaskUid();
    copy.done = false;
    copy.carried = false;
    copy.carriedFrom = { uid: sourceTask.uid, date: sourceDateStr || '' };
    copy.repeat = null; // carry copy doesn't re-recur
    copy._recurred = undefined;
    copy.linkedMetricIds = [];
    targetTasks.push(copy);
    return { merged: false, copy: copy };
  }

  /* ===================== Transaction/Batch ===================== */

  // Simple batch: collect mutations, then flush. Caller decides when to save/render.
  var _batchDepth = 0;
  var _batchDirty = false;

  function beginBatch() {
    _batchDepth++;
  }

  function endBatch() {
    if (_batchDepth > 0) _batchDepth--;
    if (_batchDepth === 0 && _batchDirty) {
      _batchDirty = false;
      return true; // signals caller to save
    }
    return false;
  }

  function isBatching() {
    return _batchDepth > 0;
  }

  function markDirty() {
    _batchDirty = true;
  }

  // Execute a function inside a batch scope. Returns the function's return value.
  // If the batch completes at depth 0, returns { result, needsSave: true }.
  function transaction(fn) {
    beginBatch();
    try {
      var result = fn();
      var needsSave = endBatch();
      return { result: result, needsSave: needsSave };
    } catch (e) {
      // On error, force end batch without saving
      while (_batchDepth > 0) _batchDepth--;
      throw e;
    }
  }

  /* ===================== Task Schema Helpers ===================== */

  // Canonical list of valid task fields for validation
  var VALID_TASK_FIELDS = [
    'uid', 'text', 'done', 'kind', 'tags', 'linkedMetricIds', 'remind',
    'repeat', 'carriedFrom', 'carried', 'duration', 'deadline', 'projectId',
    'milestoneId', 'energy', 'contexts', 'notes', 'subtasks', 'inbox', '_recurred',
  ];

  // Validate a task against canonical schema. Returns { ok, errors[] }.
  function validateTask(task) {
    if (!task || typeof task !== 'object') return { ok: false, errors: ['not-an-object'] };
    var errors = [];
    if (!task.uid || typeof task.uid !== 'string') errors.push('missing-uid');
    if (typeof task.text !== 'string') errors.push('invalid-text');
    if (typeof task.done !== 'boolean') errors.push('invalid-done');
    if (['regular', 'priority'].indexOf(task.kind) < 0) errors.push('invalid-kind');
    if (task.repeat !== null && typeof task.repeat !== 'object') errors.push('invalid-repeat');
    return { ok: errors.length === 0, errors: errors };
  }

  /* ===================== API ===================== */

  var api = {
    // UID
    newTaskUid: newTaskUid,
    ensureTaskUid: ensureTaskUid,

    // Recurrence identity
    getSeriesId: getSeriesId,
    ensureSeriesId: ensureSeriesId,

    // Normalization
    normalizeTask: normalizeTask,

    // CRUD
    create: create,
    update: update,
    remove: remove,
    complete: complete,
    move: move,

    // Recurrence & carry
    materializeRecurrence: materializeRecurrence,
    carry: carry,

    // Find
    findByUid: findByUid,

    // OperationId
    isOpApplied: isOpApplied,

    // Transaction/batch
    beginBatch: beginBatch,
    endBatch: endBatch,
    isBatching: isBatching,
    markDirty: markDirty,
    transaction: transaction,

    // Validation
    validateTask: validateTask,
    VALID_TASK_FIELDS: VALID_TASK_FIELDS,
    UPDATEABLE_FIELDS: UPDATEABLE_FIELDS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.TaskFlowTaskStore = api;
})();
