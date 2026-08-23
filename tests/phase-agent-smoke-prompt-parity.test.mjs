'use strict';
/* Phase: Real Agent smoke parity + prompt contract closure + deploy proof.
   Tests the smoke script source structure, system prompt contracts,
   build SHA helper, and all canonicalization variants. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/* ---- Modules ---- */
const require_s = createRequire(import.meta.url);
const aiServer = require_s('../server/ai.js');
const aiProvider = require_s('../server/ai-provider.js');
const { validateAgentProposal, canonicalizeAgentProposal, AGENT_PROPOSAL_SCHEMA,
  AGENT_SYSTEM_INSTRUCTION_VI, AGENT_SYSTEM_INSTRUCTION_EN } = aiServer;
const { getBuildSha } = aiProvider;

/* ---- Client validator (UMD) ---- */
const clientSrc = readFileSync(join(ROOT, 'js', 'ai-agent.js'), 'utf8');
const vm = await import('node:vm');
const sandbox = { module: {}, exports: {}, window: {}, globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(clientSrc, sandbox);
const ClientAgent = sandbox.globalThis.TaskFlowAIAgent || sandbox.module.exports;

const emptyRefs = { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() };
const emptyContext = { tasks: [], projects: [], milestones: [] };

const FP = { maxActions: 120, allowedTypes: ['create_task', 'schedule_task'] };

/* ---- Canonical fixtures ---- */
function makeCreate(args) {
  return { id: 'a1', type: 'create_task', args: Object.assign({ taskRef: null, text: 'Test', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null }, args || {}) };
}
function makeSchedule(refId) {
  return { id: 'a2', type: 'schedule_task', args: { taskRef: { kind: 'action', uid: null, actionId: refId }, text: null, date: '2026-08-25', start: '19:00', duration: 30, priority: null, projectId: null, milestoneId: null, changes: null } };
}
function makeProposal(actions) { return { summary: 'Test', actions }; }

/* ================================================================
   SMOKE SCRIPT SOURCE TESTS
   ================================================================ */

test('smoke script imports callAiJson from ai-provider', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'smoke-agent-provider.js'), 'utf8');
  assert.ok(src.includes("require2('../server/ai-provider')") || src.includes('require2("../server/ai-provider")'),
    'must import from ai-provider');
  assert.ok(src.includes('callAiJson'), 'must import callAiJson');
  assert.ok(!src.includes("ai.callAiJson") && !src.includes('ai.callAiJson'),
    'must not call ai.callAiJson (ai.js does not export callAiJson)');
});

test('smoke script imports from ai.js correctly', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'smoke-agent-provider.js'), 'utf8');
  assert.ok(src.includes('AGENT_PROPOSAL_SCHEMA'), 'must import schema');
  assert.ok(src.includes('canonicalizeAgentProposal'), 'must import canonicalizer');
  assert.ok(src.includes('validateAgentProposal'), 'must import validator');
  assert.ok(src.includes('AGENT_SYSTEM_INSTRUCTION_VI'), 'must import production instruction');
});

test('smoke script validates CANONICAL proposal (not raw)', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'smoke-agent-provider.js'), 'utf8');
  // Must call validateAgentProposal with canonical, not raw proposal
  assert.ok(src.includes('validateAgentProposal(canonical'), 'must validate canonical object');
  // Must NOT call validateAgentProposal(proposal — that would be raw
  const lines = src.split('\n');
  const validateLines = lines.filter(l => l.includes('validateAgentProposal('));
  assert.ok(validateLines.length > 0, 'must have validateAgentProposal call');
  validateLines.forEach(l => {
    assert.ok(l.includes('canonical'), 'validateAgentProposal must receive canonical, not raw: ' + l.trim());
  });
});

test('smoke script uses exact production user request', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'smoke-agent-provider.js'), 'utf8');
  assert.ok(src.includes('Tạo task Test'), 'must use exact Vietnamese production request');
});

test('smoke script exits non-zero on failure', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'smoke-agent-provider.js'), 'utf8');
  assert.ok(src.includes('process.exit(1)'), 'must exit(1) on failure');
  // Must NOT have success-like wording when validation fails
  assert.ok(src.includes('SMOKE TEST FAILED') || src.includes('SMOKE TEST PASSED'),
    'must have clear pass/fail messaging');
});

test('smoke script does not print task text content', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'smoke-agent-provider.js'), 'utf8');
  // The script should only print structural descriptions
  assert.ok(src.includes('describeString') || src.includes('string('),
    'should use structural descriptions, not raw content');
});

test('smoke script documents Windows PowerShell syntax', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'smoke-agent-provider.js'), 'utf8');
  assert.ok(src.includes('PowerShell') || src.includes('$env:AI_API_KEY'),
    'must document Windows PowerShell syntax');
});

/* ================================================================
   SYSTEM PROMPT CONTRACT TESTS
   ================================================================ */

test('VI prompt: create_task taskRef must be null', () => {
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('args.taskRef PHẢI là null'),
    'VI prompt must explicitly state taskRef MUST be null for create_task');
});

test('VI prompt: create_task start must be null', () => {
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('args.start PHẢI là null'),
    'VI prompt must explicitly state start MUST be null for create_task');
});

test('VI prompt: create_task changes must be null', () => {
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('args.changes PHẢI là null'),
    'VI prompt must explicitly state changes MUST be null for create_task');
});

test('VI prompt: create_task text rules', () => {
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('args.text PHẢI là chuỗi không rỗng'),
    'VI prompt must state text must be non-empty string');
});

test('VI prompt: create_task priority rules', () => {
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('args.priority là true/false'),
    'VI prompt must state priority is boolean');
});

test('VI prompt: update_task changes rules', () => {
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('args.changes chứa các trường cần đổi'),
    'VI prompt must describe update_task changes semantics');
});

test('VI prompt: complete_task contract', () => {
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('complete_task'), 'VI must mention complete_task');
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('args.taskRef bắt buộc'), 'VI must require taskRef for complete_task');
});

test('VI prompt: schedule_task contract', () => {
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('schedule_task'), 'VI must mention schedule_task');
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('args.date YYYY-MM-DD bắt buộc'), 'VI must require date for schedule');
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('args.start HH:mm bắt buộc'), 'VI must require start for schedule');
});

test('EN prompt matches VI contract structure', () => {
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('args.taskRef MUST be null'), 'EN: create taskRef null');
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('args.start MUST be null'), 'EN: create start null');
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('args.changes MUST be null'), 'EN: create changes null');
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('args.text MUST be a non-empty string'), 'EN: text non-empty');
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('args.priority boolean'), 'EN: priority boolean');
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('args.taskRef required'), 'EN: taskRef required for update');
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('args.date YYYY-MM-DD required'), 'EN: date required for schedule');
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('args.start HH:mm required'), 'EN: start required for schedule');
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('args.duration minutes'), 'EN: duration required for schedule');
});

test('EN prompt mentions all 5 action types', () => {
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('create_task'));
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('update_task'));
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('complete_task'));
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('schedule_task'));
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.includes('reschedule_task'));
});

test('VI prompt mentions all 5 action types', () => {
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('create_task'));
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('update_task'));
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('complete_task'));
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('schedule_task'));
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.includes('reschedule_task'));
});

/* ================================================================
   BUILD SHA HELPER
   ================================================================ */

test('getBuildSha returns string', () => {
  const sha = getBuildSha();
  assert.strictEqual(typeof sha, 'string');
  assert.ok(sha.length > 0);
});

test('getBuildSha exported from ai-provider', () => {
  assert.strictEqual(typeof getBuildSha, 'function');
  assert.strictEqual(aiProvider.getBuildSha, getBuildSha);
});

test('health endpoint uses getBuildSha', () => {
  const src = readFileSync(join(ROOT, 'server', 'index.js'), 'utf8');
  assert.ok(src.includes('getBuildSha'), 'health must use getBuildSha');
  assert.ok(!src.includes('process.env.TASKFLOW_BUILD_SHA'), 'health must not inline env lookup');
});

test('agent debug meta uses getBuildSha', () => {
  const src = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
  const agentRoute = src.slice(src.indexOf("router.post('/agent'"), src.indexOf('module.exports'));
  assert.ok(agentRoute.includes('getBuildSha()'), 'agent debug meta must use getBuildSha()');
  assert.ok(!agentRoute.includes('process.env.TASKFLOW_BUILD_SHA'), 'agent route must not inline env lookup');
});

/* ================================================================
   CANONICALIZATION VARIANTS (expanded from previous)
   ================================================================ */

test('raw create with priority:null + all-null changes + empty summary → passes', () => {
  const raw = {
    summary: '',
    actions: [{
      id: 'a1', type: 'create_task',
      args: { taskRef: null, text: 'Test', date: null, start: null, duration: 30, priority: null, projectId: null, milestoneId: null,
        changes: { text: null, priority: null, duration: null, date: null, projectId: null, milestoneId: null } },
    }],
  };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.summary, 'AI proposal');
  assert.strictEqual(canonical.actions[0].args.priority, false);
  assert.strictEqual(canonical.actions[0].args.changes, null);
  const sv = validateAgentProposal(canonical, emptyRefs);
  assert.ok(sv.ok, 'server: ' + JSON.stringify(sv.errors));
});

test('perfect canonical create → still passes', () => {
  const raw = { summary: 'Create', actions: [makeCreate()] };
  const canonical = canonicalizeAgentProposal(raw);
  const sv = validateAgentProposal(canonical, emptyRefs);
  assert.ok(sv.ok);
});

test('unknown action type not canonicalized', () => {
  const raw = { summary: 'T', actions: [{ id: 'a1', type: 'add_task', args: { text: 'T' } }] };
  const canonical = canonicalizeAgentProposal(raw);
  assert.strictEqual(canonical.actions[0].type, 'add_task');
  const sv = validateAgentProposal(canonical, emptyRefs);
  assert.ok(!sv.ok);
});

test('malformed taskRef object not canonicalized', () => {
  const raw = { summary: 'T', actions: [makeCreate({ taskRef: { kind: 'existing', uid: null } })] };
  const canonical = canonicalizeAgentProposal(raw);
  assert.ok(typeof canonical.actions[0].args.taskRef === 'object');
});

test('empty text remains rejected after canonicalization', () => {
  const raw = { summary: 'T', actions: [makeCreate({ text: '' })] };
  const canonical = canonicalizeAgentProposal(raw);
  const sv = validateAgentProposal(canonical, emptyRefs);
  assert.ok(!sv.ok, 'empty text must still be rejected');
});

test('invalid date remains rejected', () => {
  const raw = { summary: 'T', actions: [makeCreate({ date: 'tomorrow' })] };
  const canonical = canonicalizeAgentProposal(raw);
  const sv = validateAgentProposal(canonical, emptyRefs);
  assert.ok(!sv.ok, 'invalid date must still be rejected');
});

test('invalid duration=0 remains rejected', () => {
  const raw = { summary: 'T', actions: [makeCreate({ duration: 0 })] };
  const canonical = canonicalizeAgentProposal(raw);
  const sv = validateAgentProposal(canonical, emptyRefs);
  assert.ok(!sv.ok, 'duration 0 must be rejected');
});

test('create + schedule dependency preserved after canonicalization', () => {
  const raw = {
    summary: 'Dep',
    actions: [
      makeCreate({ priority: null, changes: { text: null, priority: null, duration: null, date: null, projectId: null, milestoneId: null } }),
      makeSchedule('a1'),
    ],
  };
  const canonical = canonicalizeAgentProposal(raw);
  const sv = validateAgentProposal(canonical, emptyRefs);
  assert.ok(sv.ok, 'server: ' + JSON.stringify(sv.errors));
  const cr = ClientAgent.validateProposal(canonical, emptyContext);
  assert.ok(cr.ok, 'client: ' + JSON.stringify(cr.errors));
  const dry = ClientAgent.dryRun(canonical, emptyContext);
  assert.ok(dry.valid);
  const order = ClientAgent.topologicalSort(dry.dependencyGraph);
  assert.strictEqual(JSON.stringify(order), JSON.stringify(['a1', 'a2']));
});

/* ================================================================
   EXISTING BEHAVIOR NOT REGRESSED
   ================================================================ */

test('update_task all-null changes still rejected', () => {
  const raw = {
    summary: 'U',
    actions: [{ id: 'a1', type: 'update_task', args: { taskRef: { kind: 'existing', uid: 't1' }, text: null, date: null, start: null, duration: null, priority: null, projectId: null, milestoneId: null,
      changes: { text: null, priority: null, duration: null, date: null, projectId: null, milestoneId: null } } }],
  };
  const refs = { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() };
  const canonical = canonicalizeAgentProposal(raw);
  const sv = validateAgentProposal(canonical, refs);
  assert.ok(!sv.ok, 'update all-null must still fail');
});

test('delete_task still rejected after canonicalization', () => {
  const raw = { summary: 'D', actions: [{ id: 'a1', type: 'delete_task', args: { taskRef: { kind: 'existing', uid: 't1' } } }] };
  const refs = { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() };
  const canonical = canonicalizeAgentProposal(raw);
  const sv = validateAgentProposal(canonical, refs);
  assert.ok(!sv.ok);
});

test('non-proposal input passed through', () => {
  assert.strictEqual(canonicalizeAgentProposal(null), null);
  assert.strictEqual(canonicalizeAgentProposal('string'), 'string');
  assert.strictEqual(canonicalizeAgentProposal(42), 42);
});

/* ================================================================
   SERVER MODULE EXPORTS
   ================================================================ */

test('ai.js exports AGENT_SYSTEM_INSTRUCTION_VI', () => {
  assert.strictEqual(typeof AGENT_SYSTEM_INSTRUCTION_VI, 'string');
  assert.ok(AGENT_SYSTEM_INSTRUCTION_VI.length > 100);
});

test('ai.js exports AGENT_SYSTEM_INSTRUCTION_EN', () => {
  assert.strictEqual(typeof AGENT_SYSTEM_INSTRUCTION_EN, 'string');
  assert.ok(AGENT_SYSTEM_INSTRUCTION_EN.length > 100);
});

test('ai.js exports canonicalizeAgentProposal', () => {
  assert.strictEqual(typeof canonicalizeAgentProposal, 'function');
});

test('ai.js exports AGENT_PROPOSAL_SCHEMA', () => {
  assert.ok(AGENT_PROPOSAL_SCHEMA);
  assert.strictEqual(AGENT_PROPOSAL_SCHEMA.type, 'object');
});
