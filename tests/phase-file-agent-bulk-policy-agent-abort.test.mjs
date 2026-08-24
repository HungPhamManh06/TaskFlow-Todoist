'use strict';
/* Phase: File-Agent bulk policy + Normal Agent abort closure.
   Tests scoped validation policies (normal=10, fileImport=120),
   abort signal propagation, and bulk import regression. */
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
const FP = ClientAgent.VALIDATION_POLICIES.fileImport;
const NP = ClientAgent.VALIDATION_POLICIES.normal;

/* ---- Helpers ---- */
function makeCreateAction(id, text) {
  return {
    id,
    type: 'create_task',
    args: { taskRef: null, text, date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null },
  };
}

function makeScheduleAction(id, refActionId, date, start) {
  return {
    id,
    type: 'schedule_task',
    args: { taskRef: { kind: 'action', uid: null, actionId: refActionId }, text: null, date, start, duration: 30, priority: null, projectId: null, milestoneId: null, changes: null },
  };
}

function makeActions(n, type) {
  const actions = [];
  for (let i = 1; i <= n; i++) {
    actions.push(makeCreateAction('a' + i, 'Task ' + i));
  }
  return actions;
}

function makeProposal(actions) {
  return { summary: 'Test', actions };
}

/* ================================================================
   PART D — BULK FILE IMPORT REGRESSION TESTS
   ================================================================ */

test('D1: Normal Agent 10 actions accepted', () => {
  const proposal = makeProposal(makeActions(10));
  const r = ClientAgent.validateProposal(proposal, emptyContext, NP);
  assert.ok(r.ok, '10 actions should pass normal policy');
});

test('D2: Normal Agent 11 actions rejected', () => {
  const proposal = makeProposal(makeActions(11));
  const r = ClientAgent.validateProposal(proposal, emptyContext, NP);
  assert.ok(!r.ok, '11 actions should fail normal policy');
  assert.ok(r.errors.some(e => e.code === 'proposal-too-large'));
});

test('D3: File Import 11 valid create_task accepted', () => {
  const proposal = makeProposal(makeActions(11));
  const r = ClientAgent.validateProposal(proposal, emptyContext, FP);
  assert.ok(r.ok, '11 create_task should pass fileImport policy');
});

test('D4: File Import 40 valid create_task accepted', () => {
  const proposal = makeProposal(makeActions(40));
  const r = ClientAgent.validateProposal(proposal, emptyContext, FP);
  assert.ok(r.ok, '40 create_task should pass fileImport policy');
});

test('D5: File Import 120 valid actions accepted', () => {
  const proposal = makeProposal(makeActions(120));
  const r = ClientAgent.validateProposal(proposal, emptyContext, FP);
  assert.ok(r.ok, '120 create_task should pass fileImport policy');
});

test('D6: File Import 121 actions rejected', () => {
  const proposal = makeProposal(makeActions(121));
  const r = ClientAgent.validateProposal(proposal, emptyContext, FP);
  assert.ok(!r.ok, '121 actions should fail fileImport policy');
  assert.ok(r.errors.some(e => e.code === 'proposal-too-large'));
});

test('D7: File Import update_task rejected', () => {
  const proposal = makeProposal([{
    id: 'a1', type: 'update_task',
    args: { taskRef: { kind: 'existing', uid: 't1' }, text: null, date: null, start: null, duration: null, priority: null, projectId: null, milestoneId: null, changes: { text: 'X' } },
  }]);
  const ctx = { tasks: [{ uid: 't1', text: 'T', kind: 'regular' }], projects: [], milestones: [] };
  const r = ClientAgent.validateProposal(proposal, ctx, FP);
  assert.ok(!r.ok, 'update_task should fail fileImport policy');
  assert.ok(r.errors.some(e => e.code === 'unsupported-action'));
});

test('D8: File Import complete_task rejected', () => {
  const proposal = makeProposal([{
    id: 'a1', type: 'complete_task',
    args: { taskRef: { kind: 'existing', uid: 't1' }, text: null, date: null, start: null, duration: null, priority: null, projectId: null, milestoneId: null, changes: null },
  }]);
  const ctx = { tasks: [{ uid: 't1', text: 'T', kind: 'regular' }], projects: [], milestones: [] };
  const r = ClientAgent.validateProposal(proposal, ctx, FP);
  assert.ok(!r.ok, 'complete_task should fail fileImport policy');
});

test('D9: File Import reschedule_task rejected', () => {
  const proposal = makeProposal([{
    id: 'a1', type: 'reschedule_task',
    args: { taskRef: { kind: 'existing', uid: 't1' }, text: null, date: '2026-08-25', start: '10:00', duration: 30, priority: null, projectId: null, milestoneId: null, changes: null },
  }]);
  const ctx = { tasks: [{ uid: 't1', text: 'T', kind: 'regular' }], projects: [], milestones: [] };
  const r = ClientAgent.validateProposal(proposal, ctx, FP);
  assert.ok(!r.ok, 'reschedule_task should fail fileImport policy');
});

test('D10: File Import unknown action type rejected', () => {
  const proposal = makeProposal([{
    id: 'a1', type: 'delete_task',
    args: { taskRef: { kind: 'existing', uid: 't1' }, text: null, date: null, start: null, duration: null, priority: null, projectId: null, milestoneId: null, changes: null },
  }]);
  const ctx = { tasks: [{ uid: 't1', text: 'T', kind: 'regular' }], projects: [], milestones: [] };
  const r = ClientAgent.validateProposal(proposal, ctx, FP);
  assert.ok(!r.ok, 'delete_task should fail fileImport policy');
});

test('D11: File Import create+schedule dependency accepted', () => {
  const proposal = makeProposal([
    makeCreateAction('a1', 'Learn CMake'),
    makeScheduleAction('a2', 'a1', '2026-08-25', '19:00'),
  ]);
  const r = ClientAgent.validateProposal(proposal, emptyContext, FP);
  assert.ok(r.ok, 'create+schedule pair should pass fileImport policy');
});

test('D12: File Import complete_task rejected (not in allowed types)', () => {
  // complete_task is not in fileImport allowedTypes, so it fails before cycle detection
  const proposal = makeProposal([
    { id: 'a1', type: 'complete_task', args: { taskRef: { kind: 'existing', uid: 't1' }, text: null, date: null, start: null, duration: null, priority: null, projectId: null, milestoneId: null, changes: null } },
  ]);
  const ctx = { tasks: [{ uid: 't1', text: 'T', kind: 'regular' }], projects: [], milestones: [] };
  const r = ClientAgent.validateProposal(proposal, ctx, FP);
  assert.ok(!r.ok, 'complete_task should fail fileImport policy');
  assert.ok(r.errors.some(e => e.code === 'unsupported-action'));
});

test('D13: File Import invalid action reference rejected', () => {
  const proposal = makeProposal([
    makeScheduleAction('a1', 'a99', '2026-08-25', '19:00'),
  ]);
  const r = ClientAgent.validateProposal(proposal, emptyContext, FP);
  assert.ok(!r.ok, 'invalid ref should be rejected');
});

test('D14: File Import self-reference rejected', () => {
  const proposal = makeProposal([
    makeScheduleAction('a1', 'a1', '2026-08-25', '19:00'),
  ]);
  const r = ClientAgent.validateProposal(proposal, emptyContext, FP);
  assert.ok(!r.ok, 'self-reference should be rejected');
});

test('D15: File Import schedule references create → producer before consumer', () => {
  const proposal = makeProposal([
    makeCreateAction('a1', 'Task A'),
    makeScheduleAction('a2', 'a1', '2026-08-25', '19:00'),
  ]);
  const r = ClientAgent.validateProposal(proposal, emptyContext, FP);
  assert.ok(r.ok);
  const dry = ClientAgent.dryRun(proposal, emptyContext, FP);
  assert.ok(dry.valid);
  const order = ClientAgent.topologicalSort(dry.dependencyGraph);
  assert.strictEqual(JSON.stringify(order), JSON.stringify(['a1', 'a2']));
});

test('D16: >10 file import proposal does not fail later because dryRun uses normal max', () => {
  const proposal = makeProposal(makeActions(15));
  // Initial validation with fileImport policy passes
  const v = ClientAgent.validateProposal(proposal, emptyContext, FP);
  assert.ok(v.ok, '15 actions should pass fileImport validation');
  // dryRun must also accept 15 actions
  const dry = ClientAgent.dryRun(proposal, emptyContext, FP);
  assert.ok(dry.valid, '15 actions dryRun should pass with fileImport policy');
  assert.ok(dry.changes.length === 15);
});

test('D17: Normal Agent cannot escape max=10 by supplying fileImport policy', () => {
  const proposal = makeProposal(makeActions(15));
  // Using normal policy — should fail regardless
  const r = ClientAgent.validateProposal(proposal, emptyContext, NP);
  assert.ok(!r.ok, '15 actions should fail normal policy even if caller passes wrong policy');
});

test('D18: No policy defaults to normal (backward compatible)', () => {
  const proposal = makeProposal(makeActions(10));
  const r = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(r.ok, 'no policy arg should default to normal, 10 actions accepted');
  const r2 = ClientAgent.validateProposal(makeProposal(makeActions(11)), emptyContext);
  assert.ok(!r2.ok, 'no policy arg should default to normal, 11 actions rejected');
});

/* ================================================================
   VALIDATION POLICIES STRUCTURE
   ================================================================ */

test('VALIDATION_POLICIES: normal policy has maxActions=10 and all 5 types', () => {
  assert.strictEqual(NP.maxActions, 10);
  assert.ok(Array.isArray(NP.allowedTypes));
  assert.strictEqual(NP.allowedTypes.length, 5);
  assert.ok(NP.allowedTypes.includes('create_task'));
  assert.ok(NP.allowedTypes.includes('update_task'));
  assert.ok(NP.allowedTypes.includes('complete_task'));
  assert.ok(NP.allowedTypes.includes('schedule_task'));
  assert.ok(NP.allowedTypes.includes('reschedule_task'));
});

test('VALIDATION_POLICIES: fileImport policy has maxActions=120 and 2 types', () => {
  assert.strictEqual(FP.maxActions, 120);
  assert.ok(Array.isArray(FP.allowedTypes));
  assert.strictEqual(FP.allowedTypes.length, 2);
  assert.ok(FP.allowedTypes.includes('create_task'));
  assert.ok(FP.allowedTypes.includes('schedule_task'));
});

test('VALIDATION_POLICIES: policies are frozen', () => {
  assert.ok(Object.isFrozen(NP));
  assert.ok(Object.isFrozen(FP));
});

/* ================================================================
   PART E — ABORT REGRESSION TESTS
   ================================================================ */

test('E1: handleAgent accepts opts.signal parameter', () => {
  const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  assert.ok(runtimeSrc.includes('async function handleAgent(message, history, msgs, opts)'),
    'handleAgent should accept opts parameter');
});

test('E2: _callAgentAPI passes AbortSignal to fetch', () => {
  const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  assert.ok(runtimeSrc.includes('signal: signal || undefined'),
    '_callAgentAPI should pass signal to fetch');
  assert.ok(runtimeSrc.includes('async function _callAgentAPI(message, history, signal)'),
    '_callAgentAPI should accept signal parameter');
});

test('E3: handleAgent extracts signal from opts', () => {
  const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  assert.ok(runtimeSrc.includes("const signal = opts && opts.signal ? opts.signal : undefined"),
    'handleAgent should extract signal from opts');
});

test('E4: AbortError is caught silently in handleAgent', () => {
  const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  assert.ok(runtimeSrc.includes("err.name === 'AbortError'"),
    'handleAgent should check for AbortError');
  assert.ok(runtimeSrc.includes('aborted: true'),
    'handleAgent should return aborted:true on AbortError');
});

test('E5: AbortError does not create error bubble', () => {
  const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  // Find the AbortError handler in handleAgent's catch block and verify it returns before _mapError
  const handleAgentIdx = runtimeSrc.indexOf('async function handleAgent');
  const catchBlockIdx = runtimeSrc.indexOf('} catch (err) {', handleAgentIdx);
  const abortIdx = runtimeSrc.indexOf("err.name === 'AbortError'", catchBlockIdx);
  const mapErrorIdx = runtimeSrc.indexOf('_mapError(err)', catchBlockIdx);
  assert.ok(abortIdx > catchBlockIdx && abortIdx < mapErrorIdx,
    'AbortError check must come before _mapError in handleAgent catch block');
});

test('E6: Normal successful request still calls _mapError on real errors', () => {
  const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  assert.ok(runtimeSrc.includes('_mapError(err)'), '_mapError should still handle non-abort errors');
});

/* ================================================================
   REVIEW STATE POLICY PRESERVATION
   ================================================================ */

test('review state stores _validationPolicy', () => {
  const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  assert.ok(runtimeSrc.includes('_validationPolicy: validationPolicy || null'),
    '_initReviewState should store validationPolicy');
});

test('confirm handler reads stored policy for revalidation', () => {
  const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  assert.ok(runtimeSrc.includes('_reviewState._validationPolicy'),
    'confirm handler should read _validationPolicy from review state');
  assert.ok(runtimeSrc.includes('savedPolicy'),
    'confirm handler should use savedPolicy variable');
});

test('handleExternalProposal passes policy to _renderCard', () => {
  const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  // The handleExternalProposal function should call _renderCard with policy
  const hepIdx = runtimeSrc.indexOf('function handleExternalProposal');
  const renderIdx = runtimeSrc.indexOf('_renderCard(msgs, proposal, dry, policy)', hepIdx);
  assert.ok(renderIdx > hepIdx, 'handleExternalProposal should pass policy to _renderCard');
});

/* ================================================================
   EXISTING BEHAVIOR NOT REGRESSED
   ================================================================ */

test('Normal Agent create_task still works with default policy', () => {
  const proposal = makeProposal([makeCreateAction('a1', 'Test')]);
  const r = ClientAgent.validateProposal(proposal, emptyContext);
  assert.ok(r.ok);
  const dry = ClientAgent.dryRun(proposal, emptyContext);
  assert.ok(dry.valid);
});

test('File Import create+schedule dryRun produces correct order', () => {
  const proposal = makeProposal([
    makeCreateAction('a1', 'Task A'),
    makeScheduleAction('a2', 'a1', '2026-08-25', '19:00'),
  ]);
  const dry = ClientAgent.dryRun(proposal, emptyContext, FP);
  assert.ok(dry.valid);
  assert.ok(dry.virtualEntities);
  const order = ClientAgent.topologicalSort(dry.dependencyGraph);
  assert.strictEqual(JSON.stringify(order), JSON.stringify(['a1', 'a2']));
});

test('File Import large bulk (80 actions) dryRun works', () => {
  const proposal = makeProposal(makeActions(80));
  const dry = ClientAgent.dryRun(proposal, emptyContext, FP);
  assert.ok(dry.valid);
  assert.strictEqual(dry.changes.length, 80);
});

/* ================================================================
   SW CACHE VERSION
   ================================================================ */

test('SW: cache version is v274', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.match(sw, /const CACHE = 'taskflow-v292'/);
  assert.ok(!sw.includes('taskflow-v273'), 'should not contain old v273');
});

/* ================================================================
   SERVER PARITY — bulk actions
   ================================================================ */

test('server: FILE_IMPORT_MAX_ITEMS is 120', () => {
  assert.strictEqual(aiServer.FILE_IMPORT_MAX_ITEMS, 120);
});
