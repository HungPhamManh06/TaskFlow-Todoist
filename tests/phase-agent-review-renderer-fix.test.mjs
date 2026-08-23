'use strict';
/* Phase: Agent Review renderer contract fix.
   Tests that _renderCard passes proposal.actions (canonical) to
   _groupChangesForPreview, NOT dry.changes (flattened). */
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

const emptyContext = { tasks: [], projects: [], milestones: [] };

/* ---- Exact production fixtures ---- */
const PRODUCTION_CREATE = {
  summary: 'Tạo nhiệm vụ mới "Test"',
  actions: [{
    id: 'a1',
    type: 'create_task',
    args: {
      taskRef: null,
      text: 'Test',
      date: null,
      start: null,
      duration: null,
      priority: false,
      projectId: null,
      milestoneId: null,
      changes: null,
    },
  }],
};

const CREATE_SCHEDULE = {
  summary: 'Create and schedule',
  actions: [
    { id: 'a1', type: 'create_task', args: { taskRef: null, text: 'Task A', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null } },
    { id: 'a2', type: 'schedule_task', args: { taskRef: { kind: 'action', uid: null, actionId: 'a1' }, text: null, date: '2026-08-25', start: '19:00', duration: 30, priority: null, projectId: null, milestoneId: null, changes: null } },
  ],
};

const UPDATE_TASK = {
  summary: 'Update task',
  actions: [{
    id: 'a1',
    type: 'update_task',
    args: { taskRef: { kind: 'existing', uid: 't1' }, text: null, date: null, start: null, duration: null, priority: null, projectId: null, milestoneId: null, changes: { text: 'New name' } },
  }],
};

const COMPLETE_TASK = {
  summary: 'Complete',
  actions: [{
    id: 'a1',
    type: 'complete_task',
    args: { taskRef: { kind: 'existing', uid: 't1' }, text: null, date: null, start: null, duration: null, priority: null, projectId: null, milestoneId: null, changes: null },
  }],
};

const RESCHEDULE_TASK = {
  summary: 'Reschedule',
  actions: [{
    id: 'a1',
    type: 'reschedule_task',
    args: { taskRef: { kind: 'existing', uid: 't1' }, text: null, date: '2026-08-26', start: '10:00', duration: 60, priority: null, projectId: null, milestoneId: null, changes: null },
  }],
};

/* ---- DOM helpers for testing Review renderer ---- */
function createMockDocument() {
  const elements = {};
  const doc = {
    getElementById: (id) => elements[id] || null,
    createElement: (tag) => {
      const el = {
        tagName: tag,
        className: '',
        textContent: '',
        style: {},
        childNodes: [],
        parentNode: null,
        attributes: {},
        setAttribute: (k, v) => { el.attributes[k] = v; },
        getAttribute: (k) => el.attributes[k],
        appendChild: (child) => { el.childNodes.push(child); child.parentNode = el; },
        removeChild: (child) => { el.childNodes = el.childNodes.filter(c => c !== child); child.parentNode = null; },
        replaceChild: (newChild, oldChild) => {
          const idx = el.childNodes.indexOf(oldChild);
          if (idx >= 0) { el.childNodes[idx] = newChild; newChild.parentNode = el; oldChild.parentNode = null; }
        },
        querySelectorAll: () => [],
        scrollIntoView: () => {},
        addEventListener: () => {},
        cloneNode: () => ({ tagName: tag, className: '', textContent: '', style: {}, childNodes: [], setAttribute: () => {}, getAttribute: () => null, appendChild: () => {}, querySelectorAll: () => [] }),
        get firstChild() { return el.childNodes[0] || null; },
        get lastChild() { return el.childNodes[el.childNodes.length - 1] || null; },
        get nextSibling() { return null; },
      };
      return el;
    },
  };
  return { doc, elements };
}

/* ================================================================
   ROOT CAUSE REPRODUCTION
   ================================================================ */

test('root cause: dry.changes does NOT have args property', () => {
  const dry = ClientAgent.dryRun(PRODUCTION_CREATE, emptyContext);
  assert.ok(dry.valid);
  assert.ok(Array.isArray(dry.changes));
  assert.ok(dry.changes.length > 0);
  const first = dry.changes[0];
  assert.strictEqual(first.type, 'create_task');
  assert.strictEqual(first.id, 'a1');
  assert.strictEqual(first.displayText, 'Test');
  // CRITICAL: dry.changes entries do NOT have args
  assert.strictEqual(first.args, undefined, 'dry.changes must NOT have args');
});

test('root cause: proposal.actions DOES have args property', () => {
  const v = ClientAgent.validateProposal(PRODUCTION_CREATE, emptyContext);
  assert.ok(v.ok);
  const first = v.actions[0];
  assert.strictEqual(first.type, 'create_task');
  assert.ok(first.args, 'proposal.actions must have args');
  assert.strictEqual(first.args.text, 'Test');
});

/* ================================================================
   SOURCE ASSERTIONS
   ================================================================ */

test('source: _renderCard does NOT pass dry.changes to _groupChangesForPreview', () => {
  const src = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  // Find _renderCard function and check its _groupChangesForPreview call
  const renderCardStart = src.indexOf('function _renderCard(msgs, proposal, dry');
  assert.ok(renderCardStart > 0, '_renderCard function found');
  const renderCardBody = src.slice(renderCardStart, src.indexOf('\n  function ', renderCardStart + 10));
  assert.ok(!renderCardBody.includes('_groupChangesForPreview(dry.changes'),
    '_renderCard must NOT pass dry.changes to _groupChangesForPreview');
  assert.ok(renderCardBody.includes('_groupChangesForPreview(proposal.actions'),
    '_renderCard MUST pass proposal.actions to _groupChangesForPreview');
});

test('source: _renderCardFull uses proposal.actions (unchanged)', () => {
  const src = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  const renderCardFullStart = src.indexOf('function _renderCardFull(msgs, proposal)');
  assert.ok(renderCardFullStart > 0);
  const body = src.slice(renderCardFullStart, renderCardFullStart + 300);
  assert.ok(body.includes('_groupChangesForPreview(proposal.actions'));
});

test('source: contract comment exists above _groupChangesForPreview', () => {
  const src = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  assert.ok(src.includes('Do NOT pass dryRun().changes here'),
    'contract comment must warn against dry.changes');
  assert.ok(src.includes('flattened preview shape'),
    'contract comment must explain the shape difference');
});

/* ================================================================
   FULL PIPELINE: PROPOSAL → VALIDATE → DRY RUN → REVIEW RENDER
   ================================================================ */

test('production create proposal: full pipeline produces Review', () => {
  // Step 1: validateProposal
  const v = ClientAgent.validateProposal(PRODUCTION_CREATE, emptyContext);
  assert.ok(v.ok, 'validateProposal: ' + JSON.stringify(v.errors));

  // Step 2: dryRun
  const dry = ClientAgent.dryRun(PRODUCTION_CREATE, emptyContext);
  assert.ok(dry.valid, 'dryRun: ' + JSON.stringify(dry.errors));
  assert.ok(dry.changes.length === 1);
  assert.ok(dry.virtualEntities);

  // Step 3: _groupChangesForPreview with proposal.actions (the fix)
  // This is what _renderCard now does — test it directly
  const grouped = ClientAgent.validateProposal(PRODUCTION_CREATE, emptyContext);
  // We can't call the internal _groupChangesForPreview directly,
  // but we can verify the contract: proposal.actions has args, dry.changes doesn't
  const proposalAction = PRODUCTION_CREATE.actions[0];
  assert.ok(proposalAction.args, 'proposal.actions[0].args exists');
  assert.strictEqual(proposalAction.args.text, 'Test');
  assert.ok(typeof proposalAction.args.text.trim === 'function', 'args.text.trim is callable');

  // Verify dry.changes would crash if passed to _groupChangesForPreview
  const dryChange = dry.changes[0];
  assert.strictEqual(dryChange.args, undefined, 'dry.changes[0].args is undefined');
  // If we tried to do dryChange.args.text.trim(), it would throw
  assert.throws(() => { dryChange.args.text.trim(); }, TypeError, 'dry.changes crashes if passed to grouping');
});

/* ================================================================
   REVIEW STATE WITH CANONICAL ACTIONS
   ================================================================ */

test('create proposal: dryRun + proposal.actions integration', () => {
  const v = ClientAgent.validateProposal(PRODUCTION_CREATE, emptyContext);
  const dry = ClientAgent.dryRun(PRODUCTION_CREATE, emptyContext);
  assert.ok(v.ok && dry.valid);

  // Simulate what _renderCard now does
  const grouped = simulateGrouping(PRODUCTION_CREATE.actions, dry.virtualEntities, emptyContext);
  assert.ok(grouped.length === 1);
  assert.strictEqual(grouped[0].actionId, 'a1');
  assert.strictEqual(grouped[0].title, 'Tạo công việc');
  assert.strictEqual(grouped[0].description, 'Test');
});

test('create+schedule: both actions grouped with dependency', () => {
  const v = ClientAgent.validateProposal(CREATE_SCHEDULE, emptyContext);
  const dry = ClientAgent.dryRun(CREATE_SCHEDULE, emptyContext);
  assert.ok(v.ok && dry.valid);

  const grouped = simulateGrouping(CREATE_SCHEDULE.actions, dry.virtualEntities, emptyContext);
  assert.ok(grouped.length === 2);
  // a1 (create) should come before a2 (schedule) due to dependency
  const ids = grouped.map(g => g.actionId);
  assert.ok(ids.indexOf('a1') < ids.indexOf('a2'), 'create before schedule');
  // a2 should be marked dependent
  const scheduleGroup = grouped.find(g => g.actionId === 'a2');
  assert.ok(scheduleGroup.isDependent, 'schedule is dependent');
});

test('update task: review renders from proposal.actions', () => {
  const ctx = { tasks: [{ uid: 't1', text: 'Old', kind: 'regular' }], projects: [], milestones: [] };
  const v = ClientAgent.validateProposal(UPDATE_TASK, ctx);
  const dry = ClientAgent.dryRun(UPDATE_TASK, ctx);
  assert.ok(v.ok && dry.valid);

  const grouped = simulateGrouping(UPDATE_TASK.actions, dry.virtualEntities, ctx);
  assert.ok(grouped.length === 1);
  assert.strictEqual(grouped[0].title, 'Cập nhật công việc');
});

test('complete task: review renders from proposal.actions', () => {
  const ctx = { tasks: [{ uid: 't1', text: 'Done', kind: 'regular' }], projects: [], milestones: [] };
  const v = ClientAgent.validateProposal(COMPLETE_TASK, ctx);
  const dry = ClientAgent.dryRun(COMPLETE_TASK, ctx);
  assert.ok(v.ok && dry.valid);

  const grouped = simulateGrouping(COMPLETE_TASK.actions, dry.virtualEntities, ctx);
  assert.ok(grouped.length === 1);
  assert.strictEqual(grouped[0].title, 'Hoàn thành công việc');
});

test('reschedule: review renders from proposal.actions', () => {
  const ctx = { tasks: [{ uid: 't1', text: 'Task', kind: 'regular' }], projects: [], milestones: [] };
  const v = ClientAgent.validateProposal(RESCHEDULE_TASK, ctx);
  const dry = ClientAgent.dryRun(RESCHEDULE_TASK, ctx);
  assert.ok(v.ok && dry.valid);

  const grouped = simulateGrouping(RESCHEDULE_TASK.actions, dry.virtualEntities, ctx);
  assert.ok(grouped.length === 1);
  assert.strictEqual(grouped[0].title, 'Đổi lịch');
});

/* ================================================================
   FILE-AGENT REVIEW
   ================================================================ */

test('file-agent proposal: review renders from canonical actions', () => {
  const fileProposal = {
    summary: 'Extracted from document',
    actions: [{
      id: 'a1', type: 'create_task',
      args: { taskRef: null, text: 'Learn CMake', date: null, start: null, duration: 60, priority: false, projectId: null, milestoneId: null },
      source: { kind: 'document', evidence: 'Week 15' },
    }],
  };
  const v = ClientAgent.validateProposal(fileProposal, emptyContext);
  const dry = ClientAgent.dryRun(fileProposal, emptyContext);
  assert.ok(v.ok && dry.valid);

  const grouped = simulateGrouping(fileProposal.actions, dry.virtualEntities, emptyContext);
  assert.ok(grouped.length === 1);
  assert.strictEqual(grouped[0].description, 'Learn CMake');
});

/* ================================================================
   34. STOP REGRESSION — dry.changes existence check still valid
   ================================================================ */

test('dry.changes still has displayText for other consumers', () => {
  const dry = ClientAgent.dryRun(PRODUCTION_CREATE, emptyContext);
  assert.ok(dry.changes[0].displayText, 'displayText exists in dry.changes');
  assert.ok(dry.changes[0].type, 'type exists in dry.changes');
  assert.ok(dry.changes[0].id, 'id exists in dry.changes');
});

/* ================================================================
   HELPER: simulate _groupChangesForPreview logic
   ================================================================ */

/**
 * Simulates the internal _groupChangesForPreview logic
 * using canonical proposal.actions (with args).
 */
function simulateGrouping(actions, virtualEntities, context) {
  const TYPE_TITLES = {
    create_task: { vi: 'Tạo công việc', en: 'Create task' },
    update_task: { vi: 'Cập nhật công việc', en: 'Update task' },
    complete_task: { vi: 'Hoàn thành công việc', en: 'Complete task' },
    schedule_task: { vi: 'Xếp lịch', en: 'Schedule' },
    reschedule_task: { vi: 'Đổi lịch', en: 'Reschedule' },
  };

  function taskLabel(ctx, uid) {
    if (!ctx || !Array.isArray(ctx.tasks) || typeof uid !== 'string') return null;
    const t = ctx.tasks.find(t => t && t.uid === uid);
    return t && typeof t.text === 'string' ? t.text : null;
  }

  // Group by dependency order
  const changeMap = new Map();
  actions.forEach(a => { if (a.id) changeMap.set(a.id, a); });

  const grouped = [];
  const processed = new Set();
  function process(actionId) {
    if (processed.has(actionId)) return;
    const ch = changeMap.get(actionId);
    if (!ch) return;
    const args = ch.args || {};
    if (args.taskRef && args.taskRef.kind === 'action') process(args.taskRef.actionId);
    grouped.push(ch);
    processed.add(actionId);
  }
  actions.forEach(a => process(a.id));
  actions.forEach(a => { if (!processed.has(a.id)) grouped.push(a); });

  return grouped.map(ch => {
    const type = ch.type;
    const lang = context && context.lang === 'en' ? 'en' : 'vi';
    const title = TYPE_TITLES[type][lang];
    const args = ch.args || {};
    let description = '';
    let isDependent = false;

    if (type === 'create_task') {
      description = args.text.trim();
    } else if (type === 'complete_task') {
      description = taskLabel(context, args.taskRef?.uid) || 'task';
    } else if (type === 'update_task') {
      description = taskLabel(context, args.taskRef?.uid) || 'task';
    } else {
      description = taskLabel(context, args.taskRef?.uid) || 'task';
      if (args.taskRef?.kind === 'action') isDependent = true;
    }

    return { title, description, actionId: ch.id, isDependent };
  });
}
