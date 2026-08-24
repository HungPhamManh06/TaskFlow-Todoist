import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);

/* ===========================================================
   1. TOOL CONTRACTS: client/server canonical source
   =========================================================== */
describe('AI Brain: Tool Contracts', () => {
  it('server ai-tool-contracts.js exports TOOL_CONTRACTS', () => {
    const mod = require(join(ROOT, 'server', 'ai-tool-contracts.js'));
    assert.ok(Array.isArray(mod.TOOL_CONTRACTS), 'TOOL_CONTRACTS is array');
    assert.ok(mod.TOOL_CONTRACTS.length >= 8, 'at least 8 tools defined');
    const names = mod.TOOL_CONTRACTS.map(t => t.name);
    assert.ok(names.includes('get_today'), 'get_today exists');
    assert.ok(names.includes('get_tasks'), 'get_tasks exists');
    assert.ok(names.includes('generate_daily_plan'), 'generate_daily_plan exists');
    assert.ok(names.includes('propose_create_task'), 'propose_create_task exists');
    assert.ok(names.includes('propose_complete_task'), 'propose_complete_task exists');
    assert.ok(names.includes('propose_reschedule_task'), 'propose_reschedule_task exists');
    // delete_task should NOT be in server contracts (Option A)
    assert.ok(!names.includes('propose_delete_task'), 'delete_task NOT in server contracts');
  });

  it('each contract has executionLocation and safety', () => {
    const { TOOL_CONTRACTS } = require(join(ROOT, 'server', 'ai-tool-contracts.js'));
    TOOL_CONTRACTS.forEach(c => {
      assert.ok(c.executionLocation, c.name + ' has executionLocation');
      assert.ok(['server', 'client'].includes(c.executionLocation), c.name + ' executionLocation is server|client');
      assert.ok(c.safety, c.name + ' has safety');
      assert.ok(['read', 'safe_proposal', 'destructive_proposal'].includes(c.safety), c.name + ' safety is valid');
    });
  });

  it('validateToolArgs rejects unknown tool', () => {
    const { validateToolArgs } = require(join(ROOT, 'server', 'ai-tool-contracts.js'));
    const v = validateToolArgs('nonexistent_tool', {});
    assert.equal(v.ok, false);
    assert.ok(v.errors[0].includes('unknown-tool'));
  });

  it('validateToolArgs rejects missing required field', () => {
    const { validateToolArgs } = require(join(ROOT, 'server', 'ai-tool-contracts.js'));
    const v = validateToolArgs('propose_create_task', {});
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('missing-required: text')));
  });

  it('validateToolArgs rejects invalid type', () => {
    const { validateToolArgs } = require(join(ROOT, 'server', 'ai-tool-contracts.js'));
    const v = validateToolArgs('get_tasks', { filter: 123 });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-type')));
  });

  it('validateToolArgs rejects invalid enum value', () => {
    const { validateToolArgs } = require(join(ROOT, 'server', 'ai-tool-contracts.js'));
    const v = validateToolArgs('get_tasks', { filter: 'nonexistent' });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-enum')));
  });

  it('validateToolArgs rejects unknown fields', () => {
    const { validateToolArgs } = require(join(ROOT, 'server', 'ai-tool-contracts.js'));
    const v = validateToolArgs('get_today', { foo: 'bar' });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('unknown-field')));
  });

  it('validateToolArgs accepts valid args', () => {
    const { validateToolArgs } = require(join(ROOT, 'server', 'ai-tool-contracts.js'));
    const v = validateToolArgs('get_tasks', { filter: 'today', limit: 10 });
    assert.equal(v.ok, true);
  });

  it('validateToolArgs accepts empty args for get_today', () => {
    const { validateToolArgs } = require(join(ROOT, 'server', 'ai-tool-contracts.js'));
    const v = validateToolArgs('get_today', {});
    assert.equal(v.ok, true);
  });
});

/* ===========================================================
   2. CURSOR TRANSACTION: proposal-scoped
   =========================================================== */
describe('AI Brain: Cursor Transaction (proposal-scoped)', () => {
  let planSource;
  before(() => {
    planSource = readFileSync(join(ROOT, 'js', 'ai-document-daily-plan.js'), 'utf8');
  });

  function makeApi(overrides) {
    const store = {};
    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: {
        getItem(k) { return store[k] || null; },
        setItem(k, v) { store[k] = v; },
        removeItem(k) { delete store[k]; },
      },
      Sync: { getUserId: () => 'test-user' },
      API_CONFIG: { url: 'http://localhost:3000' },
      fetch: async (url, opts) => {
        if (overrides && overrides.fetchInterceptor) return overrides.fetchInterceptor(url, opts);
        return { ok: true, status: 200, json: async () => ({ ok: true, proposal: { summary: 'W2', actions: [] }, meta: { daysGenerated: 7 } }) };
      },
      TaskFlowAIAgentRuntime: { buildContext: () => ({ tasks: [] }) },
      TaskFlowI18N: { getLang: () => 'vi' },
      Date, JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(planSource, sandbox);
    return sandbox.TaskFlowDocumentDailyPlan;
  }

  function futureCursorStart() {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  it('pending cursor has proposalId and source', async () => {
    const api = makeApi();
    const startDate = futureCursorStart();
    api.saveRoadmap({ id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1', documentName: 'test.pdf', createdAt: Date.now(), updatedAt: Date.now(), roadmap: { title: 'Test', phases: [] }, baseDate: startDate, cursor: { nextWeek: 1, lastAppliedStartDate: startDate, lastAppliedDaysCount: 7 } });
    await api.runNextWindow('tuần tiếp theo', {});
    const pending = api.getPendingCursor();
    assert.ok(pending, 'pending cursor exists');
    assert.ok(pending.proposalId, 'has proposalId');
    assert.equal(pending.source, 'document-daily-plan');
    assert.ok(pending.fromCursor, 'has fromCursor');
    assert.ok(pending.toCursor, 'has toCursor');
  });

  it('commit with wrong proposalId does not advance cursor', async () => {
    const api = makeApi();
    const startDate = futureCursorStart();
    api.saveRoadmap({ id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1', documentName: 'test.pdf', createdAt: Date.now(), updatedAt: Date.now(), roadmap: { title: 'Test', phases: [] }, baseDate: startDate, cursor: { nextWeek: 1, lastAppliedStartDate: startDate, lastAppliedDaysCount: 7 } });
    await api.runNextWindow('tuần tiếp theo', {});
    const pending = api.getPendingCursor();
    // Commit with wrong proposalId
    const result = api.commitPendingCursor('wrong-id');
    assert.equal(result, false, 'commit with wrong id returns false');
    const active = api.getActiveRoadmap();
    assert.equal(active.cursor.lastAppliedStartDate, startDate, 'cursor not advanced');
  });

  it('commit with correct proposalId advances cursor', async () => {
    const api = makeApi();
    const startDate = futureCursorStart();
    api.saveRoadmap({ id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1', documentName: 'test.pdf', createdAt: Date.now(), updatedAt: Date.now(), roadmap: { title: 'Test', phases: [] }, baseDate: startDate, cursor: { nextWeek: 1, lastAppliedStartDate: startDate, lastAppliedDaysCount: 7 } });
    await api.runNextWindow('tuần tiếp theo', {});
    const pending = api.getPendingCursor();
    const result = api.commitPendingCursor(pending.proposalId);
    assert.ok(result, 'commit with correct id succeeds');
    const active = api.getActiveRoadmap();
    assert.equal(active.cursor.lastAppliedStartDate, addDays(startDate, 7), 'cursor advanced');
    assert.equal(active.cursor.nextWeek, 2, 'nextWeek incremented');
  });

  it('cancel with wrong proposalId does not clear pending cursor', async () => {
    const api = makeApi();
    const startDate = futureCursorStart();
    api.saveRoadmap({ id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1', documentName: 'test.pdf', createdAt: Date.now(), updatedAt: Date.now(), roadmap: { title: 'Test', phases: [] }, baseDate: startDate, cursor: { nextWeek: 1, lastAppliedStartDate: startDate, lastAppliedDaysCount: 7 } });
    await api.runNextWindow('tuần tiếp theo', {});
    api.cancelPendingCursor('wrong-id');
    assert.ok(api.getPendingCursor(), 'pending cursor still exists');
  });

  it('cancel with correct proposalId clears pending cursor', async () => {
    const api = makeApi();
    const startDate = futureCursorStart();
    api.saveRoadmap({ id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1', documentName: 'test.pdf', createdAt: Date.now(), updatedAt: Date.now(), roadmap: { title: 'Test', phases: [] }, baseDate: startDate, cursor: { nextWeek: 1, lastAppliedStartDate: startDate, lastAppliedDaysCount: 7 } });
    await api.runNextWindow('tuần tiếp theo', {});
    const pending = api.getPendingCursor();
    api.cancelPendingCursor(pending.proposalId);
    assert.equal(api.getPendingCursor(), null, 'pending cursor cleared');
  });
});

/* ===========================================================
   3. RUN WINDOW: structured API
   =========================================================== */
describe('AI Brain: runWindow structured API', () => {
  let planSource;
  before(() => {
    planSource = readFileSync(join(ROOT, 'js', 'ai-document-daily-plan.js'), 'utf8');
  });

  function makeApi(overrides) {
    const store = {};
    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: {
        getItem(k) { return store[k] || null; },
        setItem(k, v) { store[k] = v; },
        removeItem(k) { delete store[k]; },
      },
      Sync: { getUserId: () => 'test-user' },
      API_CONFIG: { url: 'http://localhost:3000' },
      fetch: async (url, opts) => {
        if (overrides && overrides.fetchInterceptor) return overrides.fetchInterceptor(url, opts);
        return { ok: true, status: 200, json: async () => ({ ok: true, proposal: { summary: 'Plan', actions: [] }, meta: { daysGenerated: 7 } }) };
      },
      TaskFlowAIAgentRuntime: { buildContext: () => ({ tasks: [] }) },
      TaskFlowI18N: { getLang: () => 'vi' },
      Date, JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(planSource, sandbox);
    return sandbox.TaskFlowDocumentDailyPlan;
  }

  function futureDate() {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  it('runWindow calls /daily-plan with structured params', async () => {
    const api = makeApi();
    const startDate = futureDate();
    api.saveRoadmap({ id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1', documentName: 'test.pdf', createdAt: Date.now(), updatedAt: Date.now(), roadmap: { title: 'Test', phases: [] }, baseDate: startDate, cursor: { nextWeek: 1, lastAppliedStartDate: startDate, lastAppliedDaysCount: 7 } });

    let capturedBody = null;
    const api2 = makeApi({
      fetchInterceptor: async (url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => ({ ok: true, proposal: { summary: 'P', actions: [] }, meta: { daysGenerated: 5 } }) };
      },
    });
    api2.saveRoadmap({ id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1', documentName: 'test.pdf', createdAt: Date.now(), updatedAt: Date.now(), roadmap: { title: 'Test', phases: [] }, baseDate: startDate, cursor: { nextWeek: 1, lastAppliedStartDate: startDate, lastAppliedDaysCount: 7 } });

    await api2.runWindow({ startDate: '2026-09-10', daysCount: 5 }, {});
    assert.ok(capturedBody, 'body captured');
    assert.equal(capturedBody.startDate, '2026-09-10', 'startDate passed directly');
    assert.equal(capturedBody.daysCount, 5, 'daysCount passed directly');
  });

  it('runWindow clamps past startDate to today', async () => {
    const api = makeApi();
    api.saveRoadmap({ id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1', documentName: 'test.pdf', createdAt: Date.now(), updatedAt: Date.now(), roadmap: { title: 'Test', phases: [] }, baseDate: '2020-01-01', cursor: { nextWeek: 1, lastAppliedStartDate: '2020-01-01', lastAppliedDaysCount: 7 } });

    let capturedBody = null;
    const api2 = makeApi({
      fetchInterceptor: async (url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => ({ ok: true, proposal: { summary: 'P', actions: [] }, meta: { daysGenerated: 7 } }) };
      },
    });
    api2.saveRoadmap({ id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1', documentName: 'test.pdf', createdAt: Date.now(), updatedAt: Date.now(), roadmap: { title: 'Test', phases: [] }, baseDate: '2020-01-01', cursor: { nextWeek: 1, lastAppliedStartDate: '2020-01-01', lastAppliedDaysCount: 7 } });

    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    await api2.runWindow({ startDate: '2020-01-01', daysCount: 7 }, {});
    assert.ok(capturedBody.startDate >= todayStr, 'startDate clamped to today or later');
  });
});

/* ===========================================================
   4. GET_TASKS SEMANTICS
   =========================================================== */
describe('AI Brain: get_tasks filter semantics', () => {
  let toolsSource;
  before(() => {
    toolsSource = readFileSync(join(ROOT, 'js', 'ai-tools.js'), 'utf8');
  });

  function makeTools() {
    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      state: {
        weeks: [{
          week: 1,
          days: [
            { day: 1, tasks: [
              { uid: 't1', text: 'Task today', done: false, deadline: '2026-09-10' },
              { uid: 't2', text: 'Task overdue', done: false, deadline: '2026-01-01' },
              { uid: 't3', text: 'Task done', done: true, deadline: '2026-09-10' },
              { uid: 't4', text: 'Task upcoming', done: false, deadline: '2026-12-25' },
              { uid: 't5', text: 'Task no deadline', done: false },
            ]},
          ],
        }],
      },
      TaskFlowI18N: { t: (k) => k },
      Date, JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(toolsSource, sandbox);
    return sandbox.TaskFlowAITools;
  }

  it('filter=active returns only undone tasks', () => {
    const tools = makeTools();
    const result = tools.getTool('get_tasks').execute({ filter: 'active' });
    assert.ok(result.tasks.every(t => !t.done), 'all active');
    assert.ok(result.tasks.some(t => t.uid === 't1'), 'includes t1');
    assert.ok(!result.tasks.some(t => t.uid === 't3'), 'excludes done t3');
  });

  it('filter=completed returns only done tasks', () => {
    const tools = makeTools();
    const result = tools.getTool('get_tasks').execute({ filter: 'completed' });
    assert.ok(result.tasks.every(t => t.done), 'all completed');
    assert.ok(result.tasks.some(t => t.uid === 't3'), 'includes t3');
  });

  it('filter=today returns tasks with deadline===today', () => {
    const tools = makeTools();
    const d = new Date();
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    // Set a task with today's deadline
    const sandbox = { window: {}, console: { log() {}, error() {} }, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      state: { weeks: [{ week: 1, days: [{ day: 1, tasks: [
        { uid: 'tt', text: 'Today task', done: false, deadline: today },
        { uid: 'tn', text: 'Not today', done: false, deadline: '2026-12-25' },
      ]}] }] },
      TaskFlowI18N: { t: (k) => k }, Date, JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandbox.globalThis = sandbox; sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(toolsSource, sandbox);
    const result = sandbox.TaskFlowAITools.getTool('get_tasks').execute({ filter: 'today' });
    assert.ok(result.tasks.some(t => t.uid === 'tt'), 'includes today task');
    assert.ok(!result.tasks.some(t => t.uid === 'tn'), 'excludes non-today task');
  });

  it('filter=overdue returns tasks with deadline < today', () => {
    const tools = makeTools();
    const result = tools.getTool('get_tasks').execute({ filter: 'overdue' });
    assert.ok(result.tasks.some(t => t.uid === 't2'), 'includes overdue t2');
    assert.ok(!result.tasks.some(t => t.uid === 't1'), 'excludes today t1');
  });

  it('filter=upcoming returns tasks with deadline > today', () => {
    const tools = makeTools();
    const result = tools.getTool('get_tasks').execute({ filter: 'upcoming' });
    assert.ok(result.tasks.some(t => t.uid === 't4'), 'includes upcoming t4');
    assert.ok(!result.tasks.some(t => t.uid === 't2'), 'excludes overdue t2');
  });
});

/* ===========================================================
   5. TOOL RESULT SANITIZER
   =========================================================== */
describe('AI Brain: Tool Result Sanitizer', () => {
  let brainSource;
  before(() => {
    brainSource = readFileSync(join(ROOT, 'js', 'ai-brain-client.js'), 'utf8');
  });

  function getSanitizer() {
    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      API_CONFIG: { url: 'http://localhost:3000' },
      Date, JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(brainSource, sandbox);
    return sandbox.TaskFlowAIBrainClient;
  }

  it('sanitizeTasks strips internal fields', () => {
    const client = getSanitizer();
    const result = client._sanitizeToolResult('get_tasks', {
      tasks: [{ uid: 't1', text: 'Hello', done: false, deadline: '2026-09-10', duration: 30, priority: 1, projectId: 'p1', syncToken: 'secret', internalId: 42 }],
      total: 1,
    });
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].uid, 't1');
    assert.equal(result.tasks[0].text, 'Hello');
    assert.equal(result.tasks[0].syncToken, undefined, 'syncToken stripped');
    assert.equal(result.tasks[0].internalId, undefined, 'internalId stripped');
  });

  it('sanitizeProjects caps at 20', () => {
    const client = getSanitizer();
    const projects = Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i, title: 'Project ' + i }));
    const result = client._sanitizeToolResult('get_projects', { projects });
    assert.equal(result.projects.length, 20, 'capped at 20');
  });

  it('sanitizeTasks caps at 60', () => {
    const client = getSanitizer();
    const tasks = Array.from({ length: 100 }, (_, i) => ({ uid: 't' + i, text: 'Task ' + i }));
    const result = client._sanitizeToolResult('get_tasks', { tasks, total: 100 });
    assert.equal(result.tasks.length, 60, 'capped at 60');
  });
});

/* ===========================================================
   6. DELETE TOOL NOT IN SERVER CONTRACTS
   =========================================================== */
describe('AI Brain: delete_task not in server contracts', () => {
  it('propose_delete_task is not in TOOL_CONTRACTS', () => {
    const { TOOL_CONTRACTS } = require(join(ROOT, 'server', 'ai-tool-contracts.js'));
    const names = TOOL_CONTRACTS.map(t => t.name);
    assert.ok(!names.includes('propose_delete_task'), 'delete not in server contracts');
  });
});

/* ===========================================================
   7. BRAIN SESSION STATE
   =========================================================== */
describe('AI Brain: Server brain route structure', () => {
  it('brain route exists in server/ai.js exports', () => {
    // The brain route is added via router.post, so it's in the router
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSrc.includes("router.post('/brain'"), 'brain route exists');
    assert.ok(aiSrc.includes("router.post('/brain/continue'"), 'brain/continue route exists');
  });

  it('brain route uses ai-tool-contracts', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSrc.includes("require('./ai-tool-contracts')"), 'imports tool contracts');
  });

  it('brain route has session cache', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSrc.includes('_brainSessions'), 'has session cache');
    assert.ok(aiSrc.includes('BRAIN_SESSION_TTL_MS'), 'has TTL');
  });
});

/* ===========================================================
   8. CHAT.JS INTEGRATION
   =========================================================== */
describe('AI Brain: Chat.js integration', () => {
  it('chat.js references TaskFlowAIBrainClient', () => {
    const chatSrc = readFileSync(join(ROOT, 'js', 'chat.js'), 'utf8');
    assert.ok(chatSrc.includes('TaskFlowAIBrainClient'), 'chat.js references brain client');
    assert.ok(chatSrc.includes('handleMessage'), 'chat.js calls handleMessage');
  });

  it('chat.js has _shouldUseBrain routing helper', () => {
    const chatSrc = readFileSync(join(ROOT, 'js', 'chat.js'), 'utf8');
    assert.ok(chatSrc.includes('_shouldUseBrain'), 'has _shouldUseBrain');
  });

  it('chat.js falls back to legacy agent if brain fails', () => {
    const chatSrc = readFileSync(join(ROOT, 'js', 'chat.js'), 'utf8');
    // Check that after brain attempt, there's a fallback to legacy
    const brainIdx = chatSrc.indexOf('TaskFlowAIBrainClient');
    const legacyIdx = chatSrc.indexOf('handleAgent', brainIdx);
    assert.ok(legacyIdx > brainIdx, 'legacy agent fallback exists after brain');
  });
});

/* ===========================================================
   9. PROPOSAL CONTRACT: canonical action IDs
   =========================================================== */
describe('AI Brain: Canonical proposal action IDs', () => {
  let toolsSource;
  before(() => {
    toolsSource = readFileSync(join(ROOT, 'js', 'ai-tools.js'), 'utf8');
  });

  function makeTools() {
    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      TaskFlowI18N: { t: (k) => k },
      Date, JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(toolsSource, sandbox);
    return sandbox.TaskFlowAITools;
  }

  it('propose_create_task uses a1 action ID', () => {
    const tools = makeTools();
    const result = tools.getTool('propose_create_task').execute({ text: 'Test task' });
    assert.ok(result.ok);
    assert.equal(result.proposal.actions[0].id, 'a1');
    assert.equal(result.proposal.actions[0].type, 'create_task');
    assert.equal(result.proposal.actions[0].args.taskRef, null, 'create_task taskRef is null');
    assert.equal(result.proposal.actions[0].args.source.kind, 'ai-brain');
  });

  it('propose_complete_task uses typed taskRef', () => {
    const tools = makeTools();
    const result = tools.getTool('propose_complete_task').execute({ taskUid: 'uid-123' });
    assert.ok(result.ok);
    assert.equal(result.proposal.actions[0].id, 'a1');
    assert.equal(JSON.stringify(result.proposal.actions[0].args.taskRef), JSON.stringify({ kind: 'existing', uid: 'uid-123' }));
  });

  it('propose_reschedule_task creates canonical update_task', () => {
    const tools = makeTools();
    const result = tools.getTool('propose_reschedule_task').execute({ taskUid: 'uid-456', newDate: '2026-10-01' });
    assert.ok(result.ok);
    assert.equal(result.proposal.actions[0].id, 'a1');
    assert.equal(result.proposal.actions[0].type, 'update_task', 'reschedule creates update_task');
    assert.equal(JSON.stringify(result.proposal.actions[0].args.taskRef), JSON.stringify({ kind: 'existing', uid: 'uid-456' }));
    assert.ok(result.proposal.actions[0].args.changes, 'has changes');
    assert.equal(result.proposal.actions[0].args.changes.date, '2026-10-01');
  });
});
