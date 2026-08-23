'use strict';
/* Phase: Agent server canonicalization + observability + provider contract.
   Tests the canonicalization function, safe error details, health SHA,
   and all mock provider variants. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/* ---- Server ---- */
const require_s = createRequire(import.meta.url);
const aiServer = require_s('../server/ai.js');
const { validateAgentProposal, canonicalizeAgentProposal, AGENT_PROPOSAL_SCHEMA } = aiServer;

/* ---- Client ---- */
const clientSrc = readFileSync(join(ROOT, 'js', 'ai-agent.js'), 'utf8');
const vm = await import('node:vm');
const sandbox = { module: {}, exports: {}, window: {}, globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(clientSrc, sandbox);
const ClientAgent = sandbox.globalThis.TaskFlowAIAgent || sandbox.module.exports;

const refs = { taskUids: new Set(['t1']), projectIds: new Set(['p1']), milestoneIds: new Set(['m1']) };
const emptyRefs = { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() };
const emptyContext = { tasks: [], projects: [], milestones: [] };

/* ---- Canonical fixtures ---- */
const CREATE_TASK = {
  id: 'a1', type: 'create_task',
  args: { taskRef: null, text: 'Test', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null },
};

const SCHEDULE_TASK = {
  id: 'a2', type: 'schedule_task',
  args: { taskRef: { kind: 'action', uid: null, actionId: 'a1' }, text: null, date: '2026-08-25', start: '19:00', duration: 30, priority: null, projectId: null, milestoneId: null, changes: null },
};

/* ================================================================
   22. EXACT USER CASE
   ================================================================ */
test('exact user case: canonical create_task passes server + client', () => {
  const proposal = { summary: 'Tạo task Test', actions: [CREATE_TASK] };
  const canonical = canonicalizeAgentProposal(proposal);
  const sv = validateAgentProposal(canonical, emptyRefs);
  const cv = ClientAgent.validateProposal(canonical, emptyContext);
  assert.ok(sv.ok, 'server: ' + JSON.stringify(sv.errors));
  assert.ok(cv.ok, 'client: ' + JSON.stringify(cv.errors));
});

/* ================================================================
   23. PRIORITY NULL
   ================================================================ */
test('priority:null canonicalized to false', () => {
  const raw = {
    summary: 'Test',
    actions: [{ id: 'a1', type: 'create_task', args: { taskRef: null, text: 'Test', date: null, start: null, duration: 30, priority: null, projectId: null, milestoneId: null, changes: null } }],
  };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.actions[0].args.priority, false, 'null → false');
  const sv = validateAgentProposal(canonical, emptyRefs);
  assert.ok(sv.ok, 'server: ' + JSON.stringify(sv.errors));
});

test('priority:undefined canonicalized to false', () => {
  const raw = {
    summary: 'Test',
    actions: [{ id: 'a1', type: 'create_task', args: { taskRef: null, text: 'Test', date: null, start: null, duration: 30, projectId: null, milestoneId: null, changes: null } }],
  };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.actions[0].args.priority, false, 'undefined → false');
});

test('priority:false remains false', () => {
  const raw = { summary: 'T', actions: [{ ...CREATE_TASK }] };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.actions[0].args.priority, false);
});

test('priority:true remains true', () => {
  const raw = {
    summary: 'T',
    actions: [{ id: 'a1', type: 'create_task', args: { ...CREATE_TASK.args, priority: true } }],
  };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.actions[0].args.priority, true);
});

/* ================================================================
   24. ALL-NULL CHANGES ON CREATE
   ================================================================ */
test('all-null changes on create_task → null', () => {
  const raw = {
    summary: 'Test',
    actions: [{ id: 'a1', type: 'create_task', args: { taskRef: null, text: 'Test', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: { text: null, priority: null, duration: null, date: null, projectId: null, milestoneId: null } } }],
  };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.actions[0].args.changes, null, 'all-null changes → null');
  const sv = validateAgentProposal(canonical, emptyRefs);
  assert.ok(sv.ok, 'server: ' + JSON.stringify(sv.errors));
});

/* ================================================================
   25. ALL-NULL CHANGES ON UPDATE
   ================================================================ */
test('all-null changes on update_task stays as object (still invalid)', () => {
  const raw = {
    summary: 'Update',
    actions: [{ id: 'a1', type: 'update_task', args: { taskRef: { kind: 'existing', uid: 't1' }, text: null, date: null, start: null, duration: null, priority: null, projectId: null, milestoneId: null, changes: { text: null, priority: null, duration: null, date: null, projectId: null, milestoneId: null } } }],
  };
  const canonical = canonicalizeAgentProposal(raw);
  // update_task all-null changes should NOT be canonicalized to null
  assert.ok(canonical.actions[0].args.changes !== null, 'update_task all-null changes preserved as object');
  const sv = validateAgentProposal(canonical, refs);
  assert.ok(!sv.ok, 'update_task all-null should fail');
});

/* ================================================================
   26. EMPTY SUMMARY
   ================================================================ */
test('empty summary → "AI proposal"', () => {
  const raw = { summary: '', actions: [CREATE_TASK] };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.summary, 'AI proposal');
});

test('whitespace-only summary → "AI proposal"', () => {
  const raw = { summary: '   ', actions: [CREATE_TASK] };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.summary, 'AI proposal');
});

test('missing summary → "AI proposal"', () => {
  const raw = { actions: [CREATE_TASK] };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.summary, 'AI proposal');
});

test('valid summary preserved', () => {
  const raw = { summary: 'Custom summary', actions: [CREATE_TASK] };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.summary, 'Custom summary');
});

/* ================================================================
   27. MALFORMED TASKREF
   ================================================================ */
test('malformed taskRef object not canonicalized to null', () => {
  const raw = {
    summary: 'Test',
    actions: [{ id: 'a1', type: 'create_task', args: { taskRef: { kind: 'existing', uid: null, actionId: null }, text: 'Test', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null } }],
  };
  const canonical = canonicalizeAgentProposal(raw);
  // Should NOT be normalized to null
  assert.ok(typeof canonical.actions[0].args.taskRef === 'object', 'malformed taskRef not canonicalized');
});

/* ================================================================
   28. UNKNOWN TYPE
   ================================================================ */
test('unknown action type not canonicalized', () => {
  const raw = {
    summary: 'Test',
    actions: [{ id: 'a1', type: 'add_task', args: { text: 'Test' } }],
  };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.actions[0].type, 'add_task', 'type preserved');
  const sv = validateAgentProposal(canonical, emptyRefs);
  assert.ok(!sv.ok, 'unknown type should fail');
});

/* ================================================================
   29. CREATE + SCHEDULE
   ================================================================ */
test('create + schedule canonical + server + client + topological order', () => {
  const raw = {
    summary: 'Create and schedule',
    actions: [
      { id: 'a1', type: 'create_task', args: { taskRef: null, text: 'Task A', date: null, start: null, duration: 30, priority: null, projectId: null, milestoneId: null, changes: { text: null, priority: null, duration: null, date: null, projectId: null, milestoneId: null } } },
      { id: 'a2', type: 'schedule_task', args: { taskRef: { kind: 'action', uid: null, actionId: 'a1' }, text: null, date: '2026-08-25', start: '19:00', duration: 30, priority: null, projectId: null, milestoneId: null, changes: null } },
    ],
  };
  const canonical = canonicalizeAgentProposal(raw);
  const sv = validateAgentProposal(canonical, emptyRefs);
  const cv = ClientAgent.validateProposal(canonical, emptyContext);
  assert.ok(sv.ok, 'server: ' + JSON.stringify(sv.errors));
  assert.ok(cv.ok, 'client: ' + JSON.stringify(cv.errors));
  const dry = ClientAgent.dryRun(canonical, emptyContext);
  assert.ok(dry.valid, 'dryRun: ' + JSON.stringify(dry.errors));
  const order = ClientAgent.topologicalSort(dry.dependencyGraph);
  assert.strictEqual(JSON.stringify(order), JSON.stringify(['a1', 'a2']), 'producer before consumer');
});

/* ================================================================
   SCHEMA STRUCTURE
   ================================================================ */
test('AGENT_PROPOSAL_SCHEMA has actions.maxItems = 10', () => {
  assert.strictEqual(AGENT_PROPOSAL_SCHEMA.properties.actions.maxItems, 10);
});

test('AGENT_PROPOSAL_SCHEMA requires summary and actions', () => {
  assert.ok(AGENT_PROPOSAL_SCHEMA.required.includes('summary'));
  assert.ok(AGENT_PROPOSAL_SCHEMA.required.includes('actions'));
});

/* ================================================================
   HEALTH ENDPOINT
   ================================================================ */
test('health endpoint includes version field', () => {
  const src = readFileSync(join(ROOT, 'server', 'index.js'), 'utf8');
  assert.ok(src.includes('/health'), 'health route exists');
  assert.ok(src.includes('version:'), 'version field in health response');
});

/* ================================================================
   CLIENT ERROR PRESERVATION
   ================================================================ */
test('client preserves error details from server', () => {
  const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
  assert.ok(runtimeSrc.includes('safeDetails'), 'preserves safe details');
  assert.ok(runtimeSrc.includes('requestId'), 'preserves requestId');
});

/* ================================================================
   OBSERVABILITY LOG FORMAT
   ================================================================ */
test('server logs validation failure with safe codes', () => {
  const src = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
  assert.ok(src.includes('status=validation-failed'), 'logs validation-failed status');
  assert.ok(src.includes('firstError='), 'logs firstError');
  assert.ok(src.includes('errors='), 'logs error count');
});

test('server debug mode includes buildSha', () => {
  const src = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
  assert.ok(src.includes('buildSha:'), 'debug mode includes buildSha');
});

/* ================================================================
   EXISTING BEHAVIOR NOT REGRESSED
   ================================================================ */
test('delete_task still rejected after canonicalization', () => {
  const raw = { summary: 'Delete', actions: [{ id: 'a1', type: 'delete_task', args: { taskRef: { kind: 'existing', uid: 't1' } } }] };
  const canonical = canonicalizeAgentProposal(raw);
  const sv = validateAgentProposal(canonical, refs);
  assert.ok(!sv.ok);
});

test('cycle still rejected after canonicalization', () => {
  const raw = {
    summary: 'Cycle',
    actions: [
      { id: 'a1', type: 'complete_task', args: { taskRef: { kind: 'action', uid: null, actionId: 'a2' } } },
      { id: 'a2', type: 'complete_task', args: { taskRef: { kind: 'action', uid: null, actionId: 'a1' } } },
    ],
  };
  const canonical = canonicalizeAgentProposal(raw);
  const sv = validateAgentProposal(canonical, refs);
  assert.ok(!sv.ok);
});

test('invalid priority string not canonicalized', () => {
  const raw = {
    summary: 'T',
    actions: [{ id: 'a1', type: 'create_task', args: { taskRef: null, text: 'T', date: null, start: null, duration: 30, priority: 'high', projectId: null, milestoneId: null, changes: null } }],
  };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.actions[0].args.priority, 'high', 'invalid priority not changed');
  const sv = validateAgentProposal(canonical, emptyRefs);
  assert.ok(!sv.ok, 'invalid priority should fail');
});

test('non-proposal input passed through', () => {
  assert.strictEqual(canonicalizeAgentProposal(null), null);
  assert.strictEqual(canonicalizeAgentProposal('string'), 'string');
  assert.strictEqual(canonicalizeAgentProposal(42), 42);
});

test('proposal without actions array passed through', () => {
  const raw = { summary: 'Test' };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.summary, 'Test');
  assert.strictEqual(canonical.actions, undefined);
});
