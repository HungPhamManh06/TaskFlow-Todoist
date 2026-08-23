'use strict';
/* P0 Hotfix — Cross-boundary contract closure tests.
   Ensures server validateAgentProposal AND client TaskFlowAIAgent.validateProposal
   accept the SAME canonical strict nested-action fixtures.
   This catches contract drift between server and browser. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/* ---- Server validator ---- */
const require_s = createRequire(import.meta.url);
const aiServer = require_s('../server/ai.js');
const { validateAgentProposal, validateFileAgentProposal } = aiServer;

/* ---- Client validator (browser UMD loaded in Node) ---- */
const clientSrc = readFileSync(join(ROOT, 'js', 'ai-agent.js'), 'utf8');
// Evaluate UMD in global scope
const vm = await import('node:vm');
const sandbox = { module: {}, exports: {}, window: {}, globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(clientSrc, sandbox);
const ClientAgent = sandbox.globalThis.TaskFlowAIAgent || sandbox.module.exports;

/* ---- Shared fixtures ---- */
const emptyContext = { tasks: [], projects: [], milestones: [] };

const strictCreateTask = {
  id: 'a1',
  type: 'create_task',
  args: {
    taskRef: null,
    text: 'Test',
    date: null,
    start: null,
    duration: 30,
    priority: false,
    projectId: null,
    milestoneId: null,
    changes: null,
  },
};

const strictCreateSchedule = {
  id: 'a1',
  type: 'create_task',
  args: {
    taskRef: null,
    text: 'Learn CMake',
    date: null,
    start: null,
    duration: 60,
    priority: false,
    projectId: null,
    milestoneId: null,
    changes: null,
  },
};

const strictScheduleTask = {
  id: 'a2',
  type: 'schedule_task',
  args: {
    taskRef: { kind: 'action', uid: null, actionId: 'a1' },
    text: null,
    date: '2026-08-25',
    start: '19:00',
    duration: 60,
    priority: null,
    projectId: null,
    milestoneId: null,
    changes: null,
  },
};

const strictUpdateTask = {
  id: 'a1',
  type: 'update_task',
  args: {
    taskRef: { kind: 'existing', uid: 't1', actionId: null },
    text: null,
    date: null,
    start: null,
    duration: null,
    priority: null,
    projectId: null,
    milestoneId: null,
    changes: {
      text: 'Renamed task',
      priority: null,
      duration: null,
      date: null,
      projectId: null,
      milestoneId: null,
    },
  },
};

const strictCompleteTask = {
  id: 'a1',
  type: 'complete_task',
  args: {
    taskRef: { kind: 'existing', uid: 't1', actionId: null },
    text: null,
    date: null,
    start: null,
    duration: null,
    priority: null,
    projectId: null,
    milestoneId: null,
    changes: null,
  },
};

/* ---- Tests ---- */

test('server: create_task with taskRef:null passes', () => {
  const proposal = { summary: 'Tạo task Test', actions: [strictCreateTask] };
  const refs = { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() };
  const r = validateAgentProposal(proposal, refs);
  assert.ok(r.ok, 'server should accept create_task with taskRef:null, errors: ' + JSON.stringify(r.errors));
});

test('client: create_task with taskRef:null passes', () => {
  const proposal = { summary: 'Tạo task Test', actions: [strictCreateTask] };
  const r = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(r.ok, 'client should accept create_task with taskRef:null, errors: ' + JSON.stringify(r.errors));
});

test('server + client both accept canonical strict create_task', () => {
  const proposal = { summary: 'Tạo task Test', actions: [strictCreateTask] };
  const refs = { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() };
  const sr = validateAgentProposal(proposal, refs);
  const cr = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(sr.ok, 'server: ' + JSON.stringify(sr.errors));
  assert.ok(cr.ok, 'client: ' + JSON.stringify(cr.errors));
});

test('server + client both accept create + schedule dependency', () => {
  const proposal = {
    summary: 'Create and schedule',
    actions: [strictCreateSchedule, strictScheduleTask],
  };
  const refs = { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() };
  const sr = validateAgentProposal(proposal, refs);
  const cr = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(sr.ok, 'server: ' + JSON.stringify(sr.errors));
  assert.ok(cr.ok, 'client: ' + JSON.stringify(cr.errors));
});

test('server + client both accept update_task with strict nullable changes', () => {
  const proposal = { summary: 'Update task', actions: [strictUpdateTask] };
  const refs = { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() };
  const sr = validateAgentProposal(proposal, refs);
  // Client needs the task in context
  const ctx = { tasks: [{ uid: 't1', text: 'Old', kind: 'regular' }], projects: [], milestones: [] };
  const cr = ClientAgent.validateProposal(proposal, ctx);
  assert.ok(sr.ok, 'server: ' + JSON.stringify(sr.errors));
  assert.ok(cr.ok, 'client: ' + JSON.stringify(cr.errors));
});

test('server + client both accept complete_task with strict nullable fields', () => {
  const proposal = { summary: 'Complete task', actions: [strictCompleteTask] };
  const refs = { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() };
  const sr = validateAgentProposal(proposal, refs);
  const ctx = { tasks: [{ uid: 't1', text: 'Old', kind: 'regular' }], projects: [], milestones: [] };
  const cr = ClientAgent.validateProposal(proposal, ctx);
  assert.ok(sr.ok, 'server: ' + JSON.stringify(sr.errors));
  assert.ok(cr.ok, 'client: ' + JSON.stringify(cr.errors));
});

test('client: create_task with taskRef object is rejected', () => {
  const bad = {
    id: 'a1',
    type: 'create_task',
    args: {
      taskRef: { kind: 'existing', uid: 't1', actionId: null },
      text: 'Bad',
      date: null,
      start: null,
      duration: 30,
      priority: false,
      projectId: null,
      milestoneId: null,
      changes: null,
    },
  };
  const proposal = { summary: 'Bad', actions: [bad] };
  const r = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(!r.ok, 'client should reject create_task with taskRef object');
  const codes = r.errors.map((e) => e.code);
  assert.ok(codes.includes('forbidden-field'), 'should have forbidden-field error, got: ' + JSON.stringify(codes));
});

test('client: create_task with taskRef:null is NOT forbidden-field', () => {
  const proposal = { summary: 'Test', actions: [strictCreateTask] };
  const r = ClientAgent.validateProposal(proposal, emptyContext);
  if (!r.ok) {
    const codes = r.errors.map((e) => e.code);
    assert.ok(!codes.includes('forbidden-field'), 'taskRef:null should not produce forbidden-field, got: ' + JSON.stringify(codes));
  }
  assert.ok(r.ok, 'should pass: ' + JSON.stringify(r.errors));
});

test('client: create_task with start:null accepted (stripped by pickFields)', () => {
  const proposal = { summary: 'Test', actions: [strictCreateTask] };
  const r = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(r.ok, 'should accept start:null, errors: ' + JSON.stringify(r.errors));
  // The action should be canonicalized (start stripped)
  assert.ok(r.actions.length === 1);
  assert.ok(!('start' in r.actions[0].args), 'start should be stripped from canonicalized create_task');
});

test('client: create_task with changes:null accepted (stripped by pickFields)', () => {
  const proposal = { summary: 'Test', actions: [strictCreateTask] };
  const r = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(r.ok, 'should accept changes:null, errors: ' + JSON.stringify(r.errors));
  assert.ok(r.actions.length === 1);
  assert.ok(!('changes' in r.actions[0].args), 'changes should be stripped from canonicalized create_task');
});

test('old flat action (no args) is rejected by client', () => {
  const flat = {
    id: 'a1',
    type: 'create_task',
    text: 'Test',
    date: null,
    duration: 30,
    priority: false,
  };
  const proposal = { summary: 'Old format', actions: [flat] };
  const r = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(!r.ok, 'old flat action should be rejected');
  const codes = r.errors.map((e) => e.code);
  assert.ok(codes.includes('invalid-args'), 'should have invalid-args error');
});

test('old flat action is rejected by server', () => {
  const flat = {
    id: 'a1',
    type: 'create_task',
    text: 'Test',
    date: null,
    duration: 30,
    priority: false,
  };
  const proposal = { summary: 'Old format', actions: [flat] };
  const refs = { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() };
  const r = validateAgentProposal(proposal, refs);
  assert.ok(!r.ok, 'server should reject old flat action');
});

test('File-Agent proposal accepted by both server and client', () => {
  const fileProposal = {
    summary: 'Extracted from document',
    actions: [
      {
        id: 'a1',
        type: 'create_task',
        args: {
          taskRef: null,
          text: 'Learn CMake',
          date: null,
          start: null,
          duration: 60,
          priority: false,
          projectId: null,
          milestoneId: null,
        },
        source: {
          kind: 'document',
          evidence: 'Week 15: CMake basics',
        },
      },
    ],
  };
  const refs = { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() };
  const sr = validateFileAgentProposal(fileProposal, refs);
  const cr = ClientAgent.validateProposal(fileProposal, emptyContext);
  assert.ok(sr.ok, 'server file-agent: ' + JSON.stringify(sr.errors));
  assert.ok(cr.ok, 'client file-agent: ' + JSON.stringify(cr.errors));
});

test('client: update_task with all-null changes fields is rejected (no-op)', () => {
  const allNull = {
    id: 'a1',
    type: 'update_task',
    args: {
      taskRef: { kind: 'existing', uid: 't1', actionId: null },
      text: null,
      date: null,
      start: null,
      duration: null,
      priority: null,
      projectId: null,
      milestoneId: null,
      changes: { text: null, priority: null, duration: null, date: null, projectId: null, milestoneId: null },
    },
  };
  const proposal = { summary: 'All null update', actions: [allNull] };
  const ctx = { tasks: [{ uid: 't1', text: 'Task', kind: 'regular' }], projects: [], milestones: [] };
  const r = ClientAgent.validateProposal(proposal, ctx);
  // All-null changes canonicalize to empty → rejected as no-op
  assert.ok(!r.ok, 'client should reject all-null changes (no-op update)');
  const codes = r.errors.map(e => e.code);
  assert.ok(codes.includes('changes-invalid'), 'should have changes-invalid error');
});

test('dependency remapping: create + schedule both pass server+client', () => {
  const proposal = {
    summary: 'Create and schedule',
    actions: [strictCreateSchedule, strictScheduleTask],
  };
  const refs = { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() };
  const sr = validateAgentProposal(proposal, refs);
  const cr = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(sr.ok, 'server: ' + JSON.stringify(sr.errors));
  assert.ok(cr.ok, 'client: ' + JSON.stringify(cr.errors));

  // Verify client dry-run works
  const dry = ClientAgent.dryRun(proposal, emptyContext);
  assert.ok(dry.valid, 'dry-run should pass');
  assert.strictEqual(dry.changes.length, 2, 'should have 2 changes');
  const types = dry.changes.map(c => c.type);
  assert.ok(types.includes('create_task'), 'should include create_task');
  assert.ok(types.includes('schedule_task'), 'should include schedule_task');
});

test('client dry-run: review preview model works for strict nested actions', () => {
  const proposal = {
    summary: 'Tạo task Test',
    actions: [strictCreateTask],
  };
  const preview = ClientAgent.previewProposal(proposal, emptyContext);
  assert.ok(preview.ok, 'preview should pass');
  assert.strictEqual(preview.previews.length, 1);
  assert.strictEqual(preview.previews[0].title, 'Tạo công việc');
  assert.strictEqual(preview.previews[0].description, 'Test');
});

test('forbidden action type (delete_task) rejected by both', () => {
  const bad = {
    id: 'a1',
    type: 'delete_task',
    args: { taskRef: { kind: 'existing', uid: 't1' }, text: null, date: null, start: null, duration: null, priority: null, projectId: null, milestoneId: null, changes: null },
  };
  const proposal = { summary: 'Delete', actions: [bad] };
  const refs = { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() };
  const sr = validateAgentProposal(proposal, refs);
  const cr = ClientAgent.validateProposal(proposal, { tasks: [{ uid: 't1', text: 'Task', kind: 'regular' }], projects: [], milestones: [] });
  assert.ok(!sr.ok, 'server should reject delete_task');
  assert.ok(!cr.ok, 'client should reject delete_task');
});

test('client: create_task with taskRef:null produces clean canonical action', () => {
  const proposal = { summary: 'Test', actions: [strictCreateTask] };
  const r = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(r.ok);
  const a = r.actions[0];
  assert.strictEqual(a.type, 'create_task');
  assert.strictEqual(a.id, 'a1');
  // Should have only the create fields, no extra strict-schema nulls
  assert.strictEqual(a.args.text, 'Test');
  assert.strictEqual(a.args.date, null);
  assert.strictEqual(a.args.duration, 30);
  assert.strictEqual(a.args.priority, false);
  assert.ok(!('taskRef' in a.args), 'taskRef should be stripped');
  assert.ok(!('start' in a.args), 'start should be stripped');
  assert.ok(!('changes' in a.args), 'changes should be stripped');
});
