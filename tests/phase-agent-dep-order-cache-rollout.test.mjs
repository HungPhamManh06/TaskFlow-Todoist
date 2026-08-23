'use strict';
/* Phase: Agent dependency execution order + SW cache rollout + server/client contract parity.
   Tests the corrected topological sort (producer before consumer), Service Worker cache version,
   server/client all-null update parity, and priority:false preservation. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/* ---- Client validator (UMD) ---- */
const clientSrc = readFileSync(join(ROOT, 'js', 'ai-agent.js'), 'utf8');
const vm = await import('node:vm');
const sandbox = { module: {}, exports: {}, window: {}, globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(clientSrc, sandbox);
const ClientAgent = sandbox.globalThis.TaskFlowAIAgent || sandbox.module.exports;

/* ---- Server validator ---- */
const require_s = createRequire(import.meta.url);
const aiServer = require_s('../server/ai.js');
const { validateAgentProposal } = aiServer;

const emptyContext = { tasks: [], projects: [], milestones: [] };

/* ================================================================
   TOPOLOGICAL SORT TESTS
   ================================================================ */

test('topo sort: basic a1→a2 produces a1 before a2', () => {
  const dag = new Map();
  dag.set('a1', new Set());
  dag.set('a2', new Set(['a1'])); // a2 depends on a1

  const order = ClientAgent.topologicalSort(dag);
  assert.ok(order, 'should return valid order');
  assert.strictEqual(JSON.stringify(order), JSON.stringify(['a1', 'a2']));
});

test('topo sort: reverse graph is correctly handled', () => {
  const dag = new Map();
  dag.set('a1', new Set(['a2'])); // a1 depends on a2
  dag.set('a2', new Set());

  const order = ClientAgent.topologicalSort(dag);
  assert.ok(order, 'should return valid order');
  assert.strictEqual(JSON.stringify(order), JSON.stringify(['a2', 'a1']));
});

test('topo sort: complex multi-level dependency', () => {
  // a1→[], a2→[], a3→[a1], a4→[a1,a2], a5→[a4]
  const dag = new Map();
  dag.set('a1', new Set());
  dag.set('a2', new Set());
  dag.set('a3', new Set(['a1']));
  dag.set('a4', new Set(['a1', 'a2']));
  dag.set('a5', new Set(['a4']));

  const order = ClientAgent.topologicalSort(dag);
  assert.ok(order, 'should return valid order');
  assert.strictEqual(order.length, 5);

  // Verify invariants
  const idx = {};
  order.forEach((id, i) => { idx[id] = i; });
  assert.ok(idx.a1 < idx.a3, 'a1 must execute before a3');
  assert.ok(idx.a1 < idx.a4, 'a1 must execute before a4');
  assert.ok(idx.a2 < idx.a4, 'a2 must execute before a4');
  assert.ok(idx.a4 < idx.a5, 'a4 must execute before a5');
});

test('topo sort: multiple independent producers', () => {
  const dag = new Map();
  dag.set('a1', new Set());
  dag.set('a2', new Set());
  dag.set('a3', new Set(['a1']));
  dag.set('a4', new Set(['a2']));

  const order = ClientAgent.topologicalSort(dag);
  assert.ok(order);
  const idx = {};
  order.forEach((id, i) => { idx[id] = i; });
  assert.ok(idx.a1 < idx.a3, 'a1 before a3');
  assert.ok(idx.a2 < idx.a4, 'a2 before a4');
});

test('topo sort: cycle detection returns null', () => {
  const dag = new Map();
  dag.set('a1', new Set(['a2']));
  dag.set('a2', new Set(['a1']));

  const order = ClientAgent.topologicalSort(dag);
  assert.strictEqual(order, null, 'cycle should return null');
});

test('topo sort: single node', () => {
  const dag = new Map();
  dag.set('a1', new Set());
  const order = ClientAgent.topologicalSort(dag);
  assert.strictEqual(JSON.stringify(order), JSON.stringify(['a1']));
});

test('topo sort: three independent nodes preserve insertion order', () => {
  const dag = new Map();
  dag.set('a1', new Set());
  dag.set('a2', new Set());
  dag.set('a3', new Set());

  const order = ClientAgent.topologicalSort(dag);
  assert.strictEqual(JSON.stringify(order), JSON.stringify(['a1', 'a2', 'a3']));
});

/* ================================================================
   DRY RUN + VIRTUAL ENTITY TESTS
   ================================================================ */

test('dry run: create + schedule produces correct order', () => {
  const proposal = {
    summary: 'Create and schedule',
    actions: [
      { id: 'a1', type: 'create_task', args: { taskRef: null, text: 'Test', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null } },
      { id: 'a2', type: 'schedule_task', args: { taskRef: { kind: 'action', uid: null, actionId: 'a1' }, text: null, date: '2026-08-25', start: '19:00', duration: 30, priority: null, projectId: null, milestoneId: null, changes: null } },
    ],
  };
  const dry = ClientAgent.dryRun(proposal, emptyContext);
  assert.ok(dry.valid, 'dry run should pass');
  assert.ok(dry.dependencyGraph, 'should have dependency graph');

  const order = ClientAgent.topologicalSort(dry.dependencyGraph);
  assert.ok(order, 'should have execution order');
  assert.strictEqual(JSON.stringify(order), JSON.stringify(['a1', 'a2']), 'producer a1 must come before consumer a2');

  // Verify virtual entity for a1
  assert.ok(dry.virtualEntities.has('a1'), 'virtual entity for a1');
  assert.strictEqual(dry.virtualEntities.get('a1').text, 'Test');
});

test('dry run: create + schedule has virtualEntities map', () => {
  const proposal = {
    summary: 'Test',
    actions: [
      { id: 'a1', type: 'create_task', args: { taskRef: null, text: 'Test', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null } },
      { id: 'a2', type: 'schedule_task', args: { taskRef: { kind: 'action', uid: null, actionId: 'a1' }, text: null, date: '2026-08-25', start: '19:00', duration: 30, priority: null, projectId: null, milestoneId: null, changes: null } },
    ],
  };
  const dry = ClientAgent.dryRun(proposal, emptyContext);
  assert.ok(dry.valid);
  assert.ok(dry.virtualEntities && typeof dry.virtualEntities.has === 'function' && typeof dry.virtualEntities.get === 'function', 'virtualEntities should be Map-like');
  // Count via iteration since VM Map may differ from host Map
  let count = 0;
  const iter = dry.virtualEntities.keys ? dry.virtualEntities.keys() : null;
  if (iter && typeof iter[Symbol.iterator] === 'function') { for (const _ of iter) count++; }
  assert.strictEqual(count, 1);
  assert.ok(dry.virtualEntities.has('a1'));
});

/* ================================================================
   CLIENT VALIDATOR — STRICT SCHEMA NULL CONTRACT
   ================================================================ */

test('client: create_task with taskRef:null passes', () => {
  const proposal = {
    summary: 'Test',
    actions: [{ id: 'a1', type: 'create_task', args: { taskRef: null, text: 'Test', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null } }],
  };
  const r = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(r.ok, 'should accept create_task with taskRef:null');
});

test('client: update_task with all-null changes is rejected (no-op)', () => {
  const proposal = {
    summary: 'All null',
    actions: [{
      id: 'a1',
      type: 'update_task',
      args: {
        taskRef: { kind: 'existing', uid: 't1', actionId: null },
        text: null, date: null, start: null, duration: null, priority: null,
        projectId: null, milestoneId: null,
        changes: { text: null, priority: null, duration: null, date: null, projectId: null, milestoneId: null },
      },
    }],
  };
  const ctx = { tasks: [{ uid: 't1', text: 'Task', kind: 'regular' }], projects: [], milestones: [] };
  const r = ClientAgent.validateProposal(proposal, ctx);
  assert.ok(!r.ok, 'should reject all-null changes as no-op');
  const codes = r.errors.map(e => e.code);
  assert.ok(codes.includes('changes-invalid'), 'should have changes-invalid error');
});

test('client: update_task with priority:false is accepted', () => {
  const proposal = {
    summary: 'Set priority',
    actions: [{
      id: 'a1',
      type: 'update_task',
      args: {
        taskRef: { kind: 'existing', uid: 't1', actionId: null },
        text: null, date: null, start: null, duration: null, priority: null,
        projectId: null, milestoneId: null,
        changes: { text: null, priority: false, duration: null, date: null, projectId: null, milestoneId: null },
      },
    }],
  };
  const ctx = { tasks: [{ uid: 't1', text: 'Task', kind: 'priority' }], projects: [], milestones: [] };
  const r = ClientAgent.validateProposal(proposal, ctx);
  assert.ok(r.ok, 'priority:false is a real change, should be accepted');
  assert.ok(r.actions[0].args.changes.priority === false, 'priority:false preserved');
});

test('client: update_task with real change and null fields passes', () => {
  const proposal = {
    summary: 'Update',
    actions: [{
      id: 'a1',
      type: 'update_task',
      args: {
        taskRef: { kind: 'existing', uid: 't1', actionId: null },
        text: null, date: null, start: null, duration: null, priority: null,
        projectId: null, milestoneId: null,
        changes: { text: 'New title', priority: null, duration: null, date: null, projectId: null, milestoneId: null },
      },
    }],
  };
  const ctx = { tasks: [{ uid: 't1', text: 'Old', kind: 'regular' }], projects: [], milestones: [] };
  const r = ClientAgent.validateProposal(proposal, ctx);
  assert.ok(r.ok, 'should accept with real text change');
  assert.strictEqual(r.actions[0].args.changes.text, 'New title');
});

/* ================================================================
   SERVER/CLIENT PARITY — ALL-NULL UPDATE
   ================================================================ */

test('server: update_task with all-null changes is rejected', () => {
  const proposal = {
    summary: 'All null',
    actions: [{
      id: 'a1',
      type: 'update_task',
      args: {
        taskRef: { kind: 'existing', uid: 't1', actionId: null },
        text: null, date: null, start: null, duration: null, priority: null,
        projectId: null, milestoneId: null,
        changes: { text: null, priority: null, duration: null, date: null, projectId: null, milestoneId: null },
      },
    }],
  };
  const refs = { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() };
  const r = validateAgentProposal(proposal, refs);
  assert.ok(!r.ok, 'server should reject all-null changes');
});

test('server + client: both reject all-null update', () => {
  const proposal = {
    summary: 'All null',
    actions: [{
      id: 'a1',
      type: 'update_task',
      args: {
        taskRef: { kind: 'existing', uid: 't1', actionId: null },
        text: null, date: null, start: null, duration: null, priority: null,
        projectId: null, milestoneId: null,
        changes: { text: null, priority: null, duration: null, date: null, projectId: null, milestoneId: null },
      },
    }],
  };
  const refs = { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() };
  const ctx = { tasks: [{ uid: 't1', text: 'Task', kind: 'regular' }], projects: [], milestones: [] };
  const sr = validateAgentProposal(proposal, refs);
  const cr = ClientAgent.validateProposal(proposal, ctx);
  assert.ok(!sr.ok, 'server rejects');
  assert.ok(!cr.ok, 'client rejects');
});

test('server + client: both accept update with real change + nulls', () => {
  const proposal = {
    summary: 'Update',
    actions: [{
      id: 'a1',
      type: 'update_task',
      args: {
        taskRef: { kind: 'existing', uid: 't1', actionId: null },
        text: null, date: null, start: null, duration: null, priority: null,
        projectId: null, milestoneId: null,
        changes: { text: 'New title', priority: null, duration: null, date: null, projectId: null, milestoneId: null },
      },
    }],
  };
  const refs = { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() };
  const ctx = { tasks: [{ uid: 't1', text: 'Old', kind: 'regular' }], projects: [], milestones: [] };
  const sr = validateAgentProposal(proposal, refs);
  const cr = ClientAgent.validateProposal(proposal, ctx);
  assert.ok(sr.ok, 'server accepts: ' + JSON.stringify(sr.errors));
  assert.ok(cr.ok, 'client accepts: ' + JSON.stringify(cr.errors));
});

/* ================================================================
   SERVICE WORKER CACHE VERSION
   ================================================================ */

test('SW: cache version is v273', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.match(sw, /const CACHE = 'taskflow-v279'/, 'SW cache should be v273');
  assert.ok(!sw.includes('taskflow-v272'), 'should not contain old v272');
});

test('SW: APP_SHELL still contains AI lazy modules', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.ok(sw.includes('./js/ai-agent.min.js'), 'should precache ai-agent.min.js');
  assert.ok(sw.includes('./js/ai-agent-runtime.min.js'), 'should precache ai-agent-runtime.min.js');
  assert.ok(sw.includes('./js/chat.min.js'), 'should precache chat.min.js');
});

/* ================================================================
   TOPOLOGICAL SORT — RUNTIME PARITY
   ================================================================ */

test('topo sort: ai-agent.js and runtime inline produce same order for simple dep', () => {
  const dag = new Map();
  dag.set('a1', new Set());
  dag.set('a2', new Set(['a1']));
  dag.set('a3', new Set(['a1', 'a2']));

  const clientOrder = ClientAgent.topologicalSort(dag);
  assert.ok(clientOrder);
  assert.strictEqual(JSON.stringify(clientOrder), JSON.stringify(['a1', 'a2', 'a3']));
});

test('topo sort: runtime uses canonical topologicalSort', () => {
  // Verify the runtime references TaskFlowAIAgent.topologicalSort
  const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  assert.ok(
    runtimeSrc.includes('TaskFlowAIAgent.topologicalSort'),
    'runtime should call canonical topologicalSort'
  );
});

/* ================================================================
   EXISTING BEHAVIOR NOT REGRESSED
   ================================================================ */

test('client: create_task rejection of taskRef object unchanged', () => {
  const proposal = {
    summary: 'Bad',
    actions: [{
      id: 'a1',
      type: 'create_task',
      args: { taskRef: { kind: 'existing', uid: 't1' }, text: 'Bad', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null },
    }],
  };
  const r = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(!r.ok);
  const codes = r.errors.map(e => e.code);
  assert.ok(codes.includes('forbidden-field'));
});

test('client: delete_task still rejected', () => {
  const proposal = {
    summary: 'Delete',
    actions: [{ id: 'a1', type: 'delete_task', args: { taskRef: { kind: 'existing', uid: 't1' }, text: null, date: null, start: null, duration: null, priority: null, projectId: null, milestoneId: null, changes: null } }],
  };
  const ctx = { tasks: [{ uid: 't1', text: 'T', kind: 'regular' }], projects: [], milestones: [] };
  const r = ClientAgent.validateProposal(proposal, ctx);
  assert.ok(!r.ok);
});

test('client: old flat action (no args) still rejected', () => {
  const proposal = {
    summary: 'Old',
    actions: [{ id: 'a1', type: 'create_task', text: 'Test', date: null }],
  };
  const r = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(!r.ok);
  assert.ok(r.errors.some(e => e.code === 'invalid-args'));
});

test('client: cycle detection still works', () => {
  // a1 completes t1, a2 completes t2, but a1 depends on a2 and a2 depends on a1 → cycle
  const proposal = {
    summary: 'Cycle',
    actions: [
      { id: 'a1', type: 'complete_task', args: { taskRef: { kind: 'action', uid: null, actionId: 'a2' }, text: null, date: null, start: null, duration: null, priority: null, projectId: null, milestoneId: null, changes: null } },
      { id: 'a2', type: 'complete_task', args: { taskRef: { kind: 'action', uid: null, actionId: 'a1' }, text: null, date: null, start: null, duration: null, priority: null, projectId: null, milestoneId: null, changes: null } },
    ],
  };
  const r = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(!r.ok);
  assert.ok(r.errors.some(e => e.code === 'dependency-cycle'));
});
