/* TaskFlow AI Agent — Phase 4A/4C: safe action contracts + dry-run preview + multi-step transactions.
   PURE module: no network, no storage, no Gemini, no state mutation.
   Everything is a function of (action|proposal, context); the caller owns
   the context (read-only snapshot of TaskFlow state).

   Phase 4B will consume the validated previews and perform real writes.
   It performs no HTTP calls, no storage writes, and no mutation of TaskFlow
   state — those concerns belong to the Phase 4B executor.

   Phase 4C adds:
   - Proposal-local action IDs (a1, a2, ...)
   - Typed entity references (existing vs action-produced)
   - Dependency graph validation (cycle detection, producer type validation)
   - Virtual dry-run with in-memory entity mapping for dependent actions */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAIAgent = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ---- Supported action types (Phase 4A) ----
     delete_task is intentionally absent (higher risk, evaluated later).
     No generic tools (execute_js / patch_object / run_command ...) exist. */
  const SUPPORTED_TYPES = [
    'create_task',
    'update_task',
    'complete_task',
    'schedule_task',
    'reschedule_task',
  ];

  const MAX_ACTIONS = 10;
  const MAX_DEPENDENCY_DEPTH = 4;
  const ACTION_ID_RE = /^a\d+$/; // a1, a2, a3, ...

  /* ---- Scoped validation policies ----
     Normal Agent: max 10 actions, all 5 types allowed.
     File-Agent bulk import: max 120 actions, only create_task + schedule_task.
     Policies are frozen to prevent runtime mutation. */
  const VALIDATION_POLICIES = Object.freeze({
    normal: Object.freeze({
      maxActions: MAX_ACTIONS,
      allowedTypes: Object.freeze(SUPPORTED_TYPES.slice()),
    }),
    fileImport: Object.freeze({
      maxActions: 120,
      allowedTypes: Object.freeze(['create_task', 'schedule_task']),
    }),
  });

  /* ---- Field allowlists ----
     create_task / update_task accept ONLY these fields. Everything else is
     stripped (unknown) or rejected (forbidden/secret). */
  const CREATE_FIELDS = ['text', 'date', 'priority', 'duration', 'projectId', 'milestoneId'];
  const UPDATE_CHANGE_FIELDS = ['text', 'priority', 'duration', 'date', 'projectId', 'milestoneId'];

  /* Field names that must NEVER travel through an agent action, at any depth.
     (Keys only — task text is data and never scanned.) */
  const FORBIDDEN_KEYS = [
    'token', 'authorization', 'apiKey', 'api_key', 'apikey', 'jwt',
    'oauth', 'access_token', 'refresh_token', 'secret', 'password',
    'credential', 'localStorage', 'sync', 'syncMeta', 'planner-token',
  ];

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const MAX_TEXT = 300;
  const MAX_DURATION = 1440; // minutes: 24h, "reasonable"

  /* ---- Helpers (pure) ---- */

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function toMin(t) {
    if (typeof t !== 'string' || !TIME_RE.test(t)) return null;
    const m = /^(\d{2}):(\d{2})$/.exec(t);
    return (+m[1]) * 60 + (+m[2]);
  }

  /* Half-open [start, end) overlap — SAME semantics as
     TaskFlowTimeBlocks.findOverlaps (js/timeblocks.js:232-246), inlined so the
     module stays standalone; a caller-provided context.findOverlaps hook is
     preferred when the timeblocks module is already loaded. */
  function overlaps(s, e, bs, be) {
    return s < be && bs < e;
  }

  function endFromStart(start, duration) {
    const s = toMin(start);
    if (s === null) return null;
    const d = (typeof duration === 'number' && Number.isFinite(duration)) ? duration : 0;
    return s + Math.max(0, Math.floor(d));
  }

  /* HH:mm rendering of a minute-of-day value (may exceed 23:59 when a slot
     crosses midnight — findOverlaps treats such an end as invalid → []). */
  function clockFromMinutes(m) {
    const mm = Math.max(0, Math.floor(m));
    return String(Math.floor(mm / 60)).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0');
  }

  /* Context resolvers (read-only). Caller passes the snapshot. */
  function findTask(context, uid) {
    if (!context || !Array.isArray(context.tasks) || typeof uid !== 'string') return null;
    return context.tasks.find((t) => t && t.uid === uid) || null;
  }

  function taskLabel(context, uid) {
    const t = findTask(context, uid);
    return t && typeof t.text === 'string' && t.text.trim() ? t.text : null;
  }

  function findProject(context, id) {
    if (!context || !Array.isArray(context.projects) || typeof id !== 'string') return null;
    return context.projects.find((p) => p && p.id === id) || null;
  }

  function findMilestone(context, id) {
    if (!context || typeof id !== 'string') return null;
    if (Array.isArray(context.milestones)) {
      const m = context.milestones.find((x) => x && x.id === id);
      if (m) return m;
    }
    if (Array.isArray(context.projects)) {
      for (const p of context.projects) {
        if (p && Array.isArray(p.milestones)) {
          const m = p.milestones.find((x) => x && x.id === id);
          if (m) return m;
        }
      }
    }
    return null;
  }

  /* Secret scan: any forbidden key at ANY depth of an action → reject.
     Values (e.g. task text) are data and never inspected. */
  function findForbiddenKey(value) {
    if (Array.isArray(value)) {
      for (const v of value) {
        const hit = findForbiddenKey(v);
        if (hit) return hit;
      }
      return null;
    }
    if (!isPlainObject(value)) return null;
    for (const k of Object.keys(value)) {
      if (FORBIDDEN_KEYS.indexOf(k) !== -1) return k;
      const hit = findForbiddenKey(value[k]);
      if (hit) return hit;
    }
    return null;
  }

  /* Strip unknown (non-secret) fields via allowlist. */
  function pickFields(obj, allow) {
    const out = {};
    for (const k of allow) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    }
    return out;
  }

  /* ---- Proposal-local action ID validation ---- */

  function validActionId(id) {
    return typeof id === 'string' && ACTION_ID_RE.test(id);
  }

  /* ---- Typed entity reference validation ----
     taskRef = { kind: 'existing', uid: '...' }
     taskRef = { kind: 'action', actionId: 'a1' } */
  function validateTaskRef(ref, actionIdSet, context) {
    if (!isPlainObject(ref)) return { ok: false, code: 'taskref-not-object' };
    const kind = ref.kind;
    if (kind !== 'existing' && kind !== 'action') return { ok: false, code: 'taskref-invalid-kind' };
    if (kind === 'existing') {
      if (typeof ref.uid !== 'string' || !findTask(context, ref.uid)) {
        return { ok: false, code: 'unknown-task' };
      }
      return { ok: true, ref: { kind: 'existing', uid: ref.uid } };
    }
    // kind === 'action'
    if (typeof ref.actionId !== 'string' || !actionIdSet.has(ref.actionId)) {
      return { ok: false, code: 'unknown-action-reference' };
    }
    return { ok: true, ref: { kind: 'action', actionId: ref.actionId } };
  }

  /* ---- Dependency graph analysis ---- */

  /* Build dependency graph from actions.
     Returns { dag: Map<actionId, Set<actionId>>, errors: [] }
     - Only actions with taskRef.kind === 'action' create edges
     - Validates: no cycles, no self-ref, no unknown refs, producer type compatibility
     - Max depth limit */
  function buildDependencyGraph(actions, context) {
    const errors = [];
    const actionIdSet = new Set();
    const dag = new Map(); // actionId -> Set of dependency actionIds

    // First pass: collect action IDs
    actions.forEach((a, i) => {
      const id = a.id;
      if (!validActionId(id)) {
        errors.push({ index: i, code: 'invalid-action-id', field: 'id' });
        return;
      }
      if (actionIdSet.has(id)) {
        errors.push({ index: i, code: 'duplicate-action-id', field: 'id' });
        return;
      }
      actionIdSet.add(id);
      dag.set(id, new Set());
    });
    if (errors.length) return { dag: null, errors };

    // Second pass: build edges from taskRef
    actions.forEach((a, i) => {
      const id = a.id;
      const args = a.args;
      if (!args || !args.taskRef) return; // no dependency
      const refResult = validateTaskRef(args.taskRef, actionIdSet, context);
      if (!refResult.ok) {
        errors.push({ index: i, code: refResult.code, field: 'taskRef' });
        return;
      }
      if (refResult.ref.kind === 'action') {
        const depId = refResult.ref.actionId;
        if (depId === id) {
          errors.push({ index: i, code: 'self-reference', field: 'taskRef' });
          return;
        }
        dag.get(id).add(depId);
      }
    });
    if (errors.length) return { dag: null, errors };

    // Cycle detection (Kahn's algorithm / DFS)
    const visited = new Set();
    const recStack = new Set();

    function dfs(node) {
      visited.add(node);
      recStack.add(node);
      for (const dep of dag.get(node) || []) {
        if (!visited.has(dep)) {
          if (dfs(dep)) return true;
        } else if (recStack.has(dep)) {
          return true; // cycle
        }
      }
      recStack.delete(node);
      return false;
    }

    for (const node of dag.keys()) {
      if (!visited.has(node)) {
        if (dfs(node)) {
          errors.push({ index: -1, code: 'dependency-cycle' });
          return { dag: null, errors };
        }
      }
    }

    // Max depth check (longest path)
    function getDepth(node, memo) {
      if (memo.has(node)) return memo.get(node);
      const deps = dag.get(node) || new Set();
      if (!deps.size) return memo.set(node, 0), 0;
      let max = 0;
      for (const d of deps) max = Math.max(max, 1 + getDepth(d, memo));
      memo.set(node, max);
      return max;
    }
    const memo = new Map();
    for (const node of dag.keys()) {
      if (getDepth(node, memo) > MAX_DEPENDENCY_DEPTH) {
        errors.push({ index: -1, code: 'dependency-depth-exceeded' });
        return { dag: null, errors };
      }
    }

    return { dag, errors: [] };
  }

  /* Topological sort of actions (Kahn's algorithm).
     dag.get(node) = Set of action IDs that this node DEPENDS ON.
     Invariant: producer (dependency) always executes before consumer (dependent).
     Returns ordered action IDs, or null if cycle (should not happen if buildDependencyGraph passed). */
  function topologicalSort(dag) {
    const inDegree = new Map();
    const nodes = Array.from(dag.keys());
    // Each node's in-degree = number of dependencies it has (dag.get(node).size)
    for (const node of nodes) inDegree.set(node, (dag.get(node) || new Set()).size);
    const queue = nodes.filter((n) => inDegree.get(n) === 0);
    const order = [];
    while (queue.length) {
      const n = queue.shift();
      order.push(n);
      // After executing n, find all dependents and decrement their in-degree
      for (const [node, deps] of dag.entries()) {
        if (deps.has(n)) {
          const newDeg = inDegree.get(node) - 1;
          inDegree.set(node, newDeg);
          if (newDeg === 0) queue.push(node);
        }
      }
    }
    return order.length === nodes.length ? order : null;
  }

  /* ---- Producer type validation ----
     Only create_task produces a task entity that can be referenced.
     update_task, complete_task, schedule_task, reschedule_task do NOT produce new tasks. */
  const ENTITY_PRODUCERS = new Set(['create_task']);
  // complete_task produces nothing (marks done), schedule_task produces timeblock (not task)

  function validateProducerType(actionId, producerActionId, actions) {
    const producer = actions.find((a) => a.id === producerActionId);
    if (!producer) return false; // unknown actionId - already caught by graph builder
    return ENTITY_PRODUCERS.has(producer.type);
  }

  /* ---- Validators ---- */

  function validText(v) {
    if (typeof v !== 'string') return false;
    const t = v.trim();
    return t.length > 0 && t.length <= MAX_TEXT;
  }

  function validDate(v, nullable) {
    if (v === null && nullable) return true;
    if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
    const d = new Date(v + 'T00:00:00');
    return !Number.isNaN(d.getTime()) &&
      d.getFullYear() === +v.slice(0, 4) &&
      d.getMonth() === +v.slice(5, 7) - 1 &&
      d.getDate() === +v.slice(8, 10);
  }

  function validPriority(v) {
    return typeof v === 'boolean';
  }

  function validDuration(v, nullable) {
    if (v === null && nullable) return true;
    return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_DURATION;
  }

  /* Validate one action. Returns { ok:true, action: <allowlisted> } or
     { ok:false, errors: [{ code, field? }] }. Never echoes args in errors. */
  function validateAction(action, context, actionIdSet, policy) {
    const p = policy || VALIDATION_POLICIES.normal;
    if (!isPlainObject(action)) {
      return { ok: false, errors: [{ code: 'action-not-object' }] };
    }
    // Phase 4C: action.id is required
    if (!validActionId(action.id)) {
      return { ok: false, errors: [{ code: 'invalid-action-id', field: 'id' }] };
    }
    const type = action.type;
    if (p.allowedTypes.indexOf(type) === -1) {
      return { ok: false, errors: [{ code: 'unsupported-action' }] };
    }
    const args = action.args;
    if (!isPlainObject(args)) {
      return { ok: false, errors: [{ code: 'invalid-args' }] };
    }

    /* Secret fields are always rejected first — even nested. */
    const forbidden = findForbiddenKey(args);
    if (forbidden) {
      return { ok: false, errors: [{ code: 'forbidden-field', field: forbidden }] };
    }

    const errors = [];

    if (type === 'create_task') {
      const clean = pickFields(args, CREATE_FIELDS);
      if (typeof clean.text !== 'string' || !clean.text.trim()) errors.push({ code: 'text-required', field: 'text' });
      else if (clean.text.trim().length > MAX_TEXT) errors.push({ code: 'text-too-long', field: 'text' });
      if (clean.date !== undefined && !validDate(clean.date, true)) errors.push({ code: 'invalid-date', field: 'date' });
      if (clean.priority !== undefined && !validPriority(clean.priority)) errors.push({ code: 'invalid-priority', field: 'priority' });
      if (clean.duration !== undefined && !validDuration(clean.duration, true)) errors.push({ code: 'invalid-duration', field: 'duration' });
      if (clean.projectId !== undefined && clean.projectId !== null && !findProject(context, clean.projectId)) errors.push({ code: 'unknown-project', field: 'projectId' });
      if (clean.milestoneId !== undefined && clean.milestoneId !== null && !findMilestone(context, clean.milestoneId)) errors.push({ code: 'unknown-milestone', field: 'milestoneId' });
      // taskRef must be null or undefined for create_task (strict schema sends null)
      if (args.taskRef != null) errors.push({ code: 'forbidden-field', field: 'taskRef' });
      if (errors.length) return { ok: false, errors };
      return { ok: true, action: { type, id: action.id, args: clean } };
    }

    if (type === 'complete_task') {
      // Must have taskRef (existing or action)
      if (!args.taskRef) {
        errors.push({ code: 'taskref-required', field: 'taskRef' });
      } else {
        const refResult = validateTaskRef(args.taskRef, actionIdSet, context);
        if (!refResult.ok) errors.push({ code: refResult.code, field: 'taskRef' });
        // Producer type validation is handled by buildDependencyGraph
      }
      if (errors.length) return { ok: false, errors };
      return { ok: true, action: { type, id: action.id, args: { taskRef: args.taskRef } } };
    }

    if (type === 'update_task') {
      if (!args.taskRef) {
        errors.push({ code: 'taskref-required', field: 'taskRef' });
      } else {
        const refResult = validateTaskRef(args.taskRef, actionIdSet, context);
        if (!refResult.ok) errors.push({ code: refResult.code, field: 'taskRef' });
        // Producer type validation is handled by buildDependencyGraph
      }
      let changes = args.changes;
      // Strict schema may send changes:null for non-update actions; canonicalize away null
      if (changes === null || changes === undefined) {
        changes = {};
      }
      if (!isPlainObject(changes)) {
        return { ok: false, errors: [{ code: 'changes-invalid', field: 'changes' }] };
      }
      /* uid replacement / sync metadata / createdAt / arbitrary merge: rejected. */
      const rawKeys = Object.keys(changes);
      for (const k of rawKeys) {
        if (UPDATE_CHANGE_FIELDS.indexOf(k) === -1) {
          return { ok: false, errors: [{ code: 'forbidden-field', field: k }] };
        }
      }
      if (!rawKeys.length) return { ok: false, errors: [{ code: 'changes-invalid', field: 'changes' }] };
      // Strict schema populates all change fields; strip nulls to keep only real changes
      const cleanChanges = {};
      for (const k of rawKeys) {
        if (changes[k] != null) {
          cleanChanges[k] = changes[k];
        }
      }
      changes = cleanChanges;
      const clean = pickFields(changes, UPDATE_CHANGE_FIELDS);
      if (!Object.keys(clean).length) return { ok: false, errors: [{ code: 'changes-invalid', field: 'changes' }] };
      if (clean.text !== undefined && !validText(clean.text)) errors.push({ code: 'text-too-long', field: 'text' });
      if (clean.date !== undefined && !validDate(clean.date, true)) errors.push({ code: 'invalid-date', field: 'date' });
      if (clean.priority !== undefined && !validPriority(clean.priority)) errors.push({ code: 'invalid-priority', field: 'priority' });
      if (clean.duration !== undefined && !validDuration(clean.duration, true)) errors.push({ code: 'invalid-duration', field: 'duration' });
      if (clean.projectId !== undefined && clean.projectId !== null && !findProject(context, clean.projectId)) errors.push({ code: 'unknown-project', field: 'projectId' });
      if (clean.milestoneId !== undefined && clean.milestoneId !== null && !findMilestone(context, clean.milestoneId)) errors.push({ code: 'unknown-milestone', field: 'milestoneId' });
      if (errors.length) return { ok: false, errors };
      return { ok: true, action: { type, id: action.id, args: { taskRef: args.taskRef, changes: clean } } };
    }

    /* schedule_task / reschedule_task */
    if (!args.taskRef) {
      errors.push({ code: 'taskref-required', field: 'taskRef' });
    } else {
      const refResult = validateTaskRef(args.taskRef, actionIdSet, context);
      if (!refResult.ok) errors.push({ code: refResult.code, field: 'taskRef' });
      // Producer type validation is handled by buildDependencyGraph
    }
    if (!validDate(args.date, false)) errors.push({ code: 'invalid-date', field: 'date' });
    if (typeof args.start !== 'string' || !TIME_RE.test(args.start)) errors.push({ code: 'invalid-start', field: 'start' });
    if (!validDuration(args.duration, false)) errors.push({ code: 'invalid-duration', field: 'duration' });
    if (errors.length) return { ok: false, errors };
    return { ok: true, action: { type, id: action.id, args: pickFields(args, ['taskRef', 'date', 'start', 'duration']) } };
  }

  /* ---- Proposal validation ---- */

  function validateProposal(proposal, context, policy) {
    const p = policy || VALIDATION_POLICIES.normal;
    if (!isPlainObject(proposal)) {
      return { ok: false, errors: [{ index: -1, code: 'proposal-not-object' }] };
    }
    if (proposal.summary !== undefined && typeof proposal.summary !== 'string') {
      return { ok: false, errors: [{ index: -1, code: 'summary-invalid' }] };
    }
    if (!Array.isArray(proposal.actions)) {
      return { ok: false, errors: [{ index: -1, code: 'actions-invalid' }] };
    }
    if (proposal.actions.length > p.maxActions) {
      return { ok: false, errors: [{ index: -1, code: 'proposal-too-large' }] };
    }

    // Collect action IDs for cross-action reference validation
    const actionIdSet = new Set();
    proposal.actions.forEach((a) => {
      if (validActionId(a.id)) actionIdSet.add(a.id);
    });

    const errors = [];
    const actions = [];
    proposal.actions.forEach((a, i) => {
      const r = validateAction(a, context, actionIdSet, p);
      if (r.ok) actions.push(r.action);
      else r.errors.forEach((e) => errors.push(Object.assign({ index: i }, e)));
    });
    if (errors.length) return { ok: false, errors };

    // Build and validate dependency graph
    const depResult = buildDependencyGraph(actions, context);
    if (depResult.errors.length) return { ok: false, errors: depResult.errors };

    return { ok: true, actions, dependencyGraph: depResult.dag };
  }

  /* ---- Conflict detection for schedule/reschedule dry-run ----
     Reuses TaskFlowTimeBlocks.findOverlaps semantics. The caller may pass
     context.findOverlaps (the real module's function) when it is loaded;
     otherwise the inline half-open check below is used (same formula). */
  function detectConflicts(action, context, virtualEntities) {
    const warnings = [];
    const args = action.args;
    const start = toMin(args.start);
    if (start === null) return warnings;
    const end = endFromStart(args.start, args.duration);
    if (end === null) return warnings;
    if (end > 24 * 60) warnings.push({ code: 'invalid-time-range' });

    const store = context && context.timeblocks && isPlainObject(context.timeblocks) && Array.isArray(context.timeblocks.blocks)
      ? context.timeblocks
      : null;

    if (store) {
      // Determine ignoreTaskUid: for reschedule, ignore the task's existing block
      // For create+schedule, we need to check if the task is a virtual entity from this proposal
      let ignoreTaskUid = action.type === 'reschedule_task' ? args.taskRef?.kind === 'existing' ? args.taskRef.uid : null : null;
      if (typeof context.findOverlaps === 'function') {
        const hit = context.findOverlaps(store, args.date, args.start, clockFromMinutes(end), ignoreTaskUid) || [];
        if (hit.length) warnings.push({ code: 'timeblock-conflict' });
      } else {
        const blocksOnDate = store.blocks.filter((b) => b && b.date === args.date && b.status !== 'cancelled' && b.taskUid !== ignoreTaskUid);
        for (const b of blocksOnDate) {
          const bs = toMin(b.start);
          const be = toMin(b.end);
          if (bs !== null && be !== null && overlaps(start, end, bs, be)) {
            warnings.push({ code: 'timeblock-conflict' });
            break;
          }
        }
      }
    }

    if (Array.isArray(context.busy)) {
      let dayStartMs = null;
      if (typeof args.date === 'string' && DATE_RE.test(args.date)) {
        const d = new Date(args.date + 'T00:00:00');
        dayStartMs = d.getTime();
      }
      for (const ev of context.busy) {
        let bs = null, be = null;
        if (isPlainObject(ev) && typeof ev.start === 'string' && typeof ev.end === 'string') {
          bs = toMin(ev.start);
          be = toMin(ev.end);
        } else if (isPlainObject(ev) && typeof ev.startMs === 'number' && typeof ev.endMs === 'number' && dayStartMs !== null) {
          const s = (ev.startMs - dayStartMs) / 60000;
          const e = (ev.endMs - dayStartMs) / 60000;
          if (s >= 0 && e >= 0 && s < 24 * 60) { bs = s; be = Math.min(e, 24 * 60); }
        }
        if (bs !== null && be !== null && overlaps(start, end, bs, be)) {
          warnings.push({ code: 'google-busy-conflict' });
          break;
        }
      }
    }
    return warnings;
  }

  /* ---- Virtual entity creation for dry-run ----
     When a create_task action is validated, we create a virtual entity that
     subsequent actions in the same proposal can reference. */
  function createVirtualTask(action, context) {
    const args = action.args;
    // Generate a virtual UID that is proposal-local and clearly not real
    const virtualUid = 'virtual:' + action.id;
    return {
      uid: virtualUid,
      text: args.text.trim(),
      kind: args.priority === true ? 'priority' : 'regular',
      deadline: args.date || null,
      duration: args.duration || null,
      projectId: args.projectId || null,
      milestoneId: args.milestoneId || null,
      _virtual: true,
      _actionId: action.id,
    };
  }

  /* ---- Dry run: deterministic, zero mutation ----
     Now supports dependent actions via virtual entity mapping. */
  function dryRun(proposal, context, policy) {
    const v = validateProposal(proposal, context, policy);
    if (!v.ok) return { valid: false, errors: v.errors, dependencyGraph: null };

    const actions = v.actions;
    const dag = v.dependencyGraph;
    const order = topologicalSort(dag);

    // Virtual entity map: actionId -> virtual entity
    const virtualEntities = new Map();
    const changes = [];
    const warnings = [];

    for (const actionId of order) {
      const action = actions.find((a) => a.id === actionId);
      if (!action) continue; // should not happen
      const type = action.type;
      const args = action.args;

      // For actions referencing an action-produced entity, resolve the virtual UID
      let resolvedArgs = args;
      if (args.taskRef && args.taskRef.kind === 'action') {
        const virtualEntity = virtualEntities.get(args.taskRef.actionId);
        if (virtualEntity) {
          resolvedArgs = Object.assign({}, args, { taskUid: virtualEntity.uid });
        }
      }

      if (type === 'create_task') {
        const virtualTask = createVirtualTask(action, context);
        virtualEntities.set(action.id, virtualTask);

        const c = { type, id: action.id, displayText: args.text.trim() };
        if (args.date !== undefined && args.date !== null) c.date = args.date;
        if (args.priority !== undefined) c.priority = args.priority;
        if (args.duration !== undefined && args.duration !== null) c.duration = args.duration;
        if (args.projectId !== undefined && args.projectId !== null) c.projectId = args.projectId;
        if (args.milestoneId !== undefined && args.milestoneId !== null) c.milestoneId = args.milestoneId;
        changes.push(c);
      } else if (type === 'complete_task') {
        const displayText = args.taskRef?.kind === 'action'
          ? (virtualEntities.get(args.taskRef.actionId)?.text || 'task')
          : taskLabel(context, args.taskRef?.uid);
        changes.push({ type, id: action.id, taskRef: args.taskRef, displayText });
      } else if (type === 'update_task') {
        const displayText = args.taskRef?.kind === 'action'
          ? (virtualEntities.get(args.taskRef.actionId)?.text || 'task')
          : taskLabel(context, args.taskRef?.uid);
        changes.push({ type, id: action.id, taskRef: args.taskRef, displayText, changes: args.changes });
      } else { // schedule_task / reschedule_task
        const displayText = args.taskRef?.kind === 'action'
          ? (virtualEntities.get(args.taskRef.actionId)?.text || 'task')
          : taskLabel(context, args.taskRef?.uid);
        changes.push({
          type,
          id: action.id,
          taskRef: args.taskRef,
          displayText,
          date: args.date,
          start: args.start,
          duration: args.duration,
        });
        detectConflicts(action, context, virtualEntities).forEach((w) => warnings.push(Object.assign({ index: order.indexOf(action.id) }, w)));
      }
    }

    return { valid: true, changes, warnings, dependencyGraph: dag, virtualEntities };
  }

  /* ---- UI-neutral preview model (no raw UIDs ever) ---- */

  const TYPE_TITLES = {
    create_task: { vi: 'Tạo công việc', en: 'Create task' },
    update_task: { vi: 'Cập nhật công việc', en: 'Update task' },
    complete_task: { vi: 'Hoàn thành công việc', en: 'Complete task' },
    schedule_task: { vi: 'Xếp lịch', en: 'Schedule' },
    reschedule_task: { vi: 'Đổi lịch', en: 'Reschedule' },
  };

  function dateLabel(date, context) {
    if (!date) return null;
    const today = context && typeof context.today === 'string' ? context.today : null;
    if (today === date) return (context && context.lang === 'en') ? 'Today' : 'Hôm nay';
    if (today) {
      const t = new Date(today + 'T00:00:00');
      const d = new Date(date + 'T00:00:00');
      if (t.getTime() + 86400000 === d.getTime()) return (context && context.lang === 'en') ? 'Tomorrow' : 'Ngày mai';
    }
    return date;
  }

  function minutesLabel(min, context) {
    if (typeof min !== 'number') return null;
    return (context && context.lang === 'en') ? `${min} min` : `${min} phút`;
  }

  function previewAction(action, context, virtualEntities) {
    const r = validateAction(action, context, new Set()); // actionIdSet not strictly needed for preview
    if (!r.ok) return { ok: false, errors: r.errors };
    const a = r.action;
    const type = a.type;
    const lang = context && context.lang === 'en' ? 'en' : 'vi';
    const title = TYPE_TITLES[type][lang];
    const args = a.args;

    if (type === 'create_task') {
      const parts = [];
      const dl = dateLabel(args.date, context);
      if (dl) parts.push(dl);
      const ml = minutesLabel(args.duration, context);
      if (ml) parts.push(ml);
      return { ok: true, preview: { title, description: args.text.trim(), meta: parts.join(' · ') } };
    }

    if (type === 'complete_task') {
      const displayText = args.taskRef?.kind === 'action'
        ? (virtualEntities?.get(args.taskRef.actionId)?.text || 'task')
        : taskLabel(context, args.taskRef?.uid);
      return { ok: true, preview: { title, description: displayText, meta: '' } };
    }

    if (type === 'update_task') {
      const parts = [];
      if (args.changes.duration !== undefined && args.changes.duration !== null) {
        const ml = minutesLabel(args.changes.duration, context);
        if (ml) parts.push(ml);
      }
      const displayText = args.taskRef?.kind === 'action'
        ? (virtualEntities?.get(args.taskRef.actionId)?.text || 'task')
        : taskLabel(context, args.taskRef?.uid);
      return { ok: true, preview: { title, description: displayText, meta: parts.join(' · ') } };
    }

    /* schedule_task / reschedule_task */
    const parts = [];
    const dl = dateLabel(args.date, context);
    if (dl) parts.push(dl);
    if (args.start) parts.push(args.start);
    const ml = minutesLabel(args.duration, context);
    if (ml) parts.push(ml);
    const displayText = args.taskRef?.kind === 'action'
      ? (virtualEntities?.get(args.taskRef.actionId)?.text || 'task')
      : taskLabel(context, args.taskRef?.uid);
    return { ok: true, preview: { title, description: displayText, meta: parts.join(' · ') } };
  }

  function previewProposal(proposal, context) {
    const v = validateProposal(proposal, context);
    if (!v.ok) return { ok: false, errors: v.errors };
    const virtualEntities = new Map();
    // Build virtual entities for create_task actions
    v.actions.filter((a) => a.type === 'create_task').forEach((a) => {
      virtualEntities.set(a.id, createVirtualTask(a, context));
    });
    const previews = v.actions.map((a) => {
      const p = previewAction(a, context, virtualEntities);
      return p.preview;
    });
    return { ok: true, previews, virtualEntities };
  }

  return {
    SUPPORTED_TYPES: SUPPORTED_TYPES,
    MAX_ACTIONS: MAX_ACTIONS,
    MAX_DEPENDENCY_DEPTH: MAX_DEPENDENCY_DEPTH,
    ACTION_ID_RE: ACTION_ID_RE,
    CREATE_FIELDS: CREATE_FIELDS,
    UPDATE_CHANGE_FIELDS: UPDATE_CHANGE_FIELDS,
    MAX_TEXT: MAX_TEXT,
    MAX_DURATION: MAX_DURATION,
    ENTITY_PRODUCERS: ENTITY_PRODUCERS,
    VALIDATION_POLICIES: VALIDATION_POLICIES,
    validateAction: validateAction,
    validateProposal: validateProposal,
    previewAction: previewAction,
    previewProposal: previewProposal,
    dryRun: dryRun,
    buildDependencyGraph: buildDependencyGraph,
    topologicalSort: topologicalSort,
    // Exposed for testing / Phase 4B reuse
    _findTask: findTask,
    _taskLabel: taskLabel,
    _findProject: findProject,
    _findMilestone: findMilestone,
    _toMin: toMin,
    _endFromStart: endFromStart,
    _validActionId: validActionId,
    _validateTaskRef: validateTaskRef,
    _createVirtualTask: createVirtualTask,
  };
});