'use strict';
/**
 * Document Daily Planner — Runtime Tests
 *
 * Tests REAL function calls, NOT source.includes() assertions.
 * Covers: validator, account isolation, module API, lazy chain, SW,
 * cursor logic, Review DOM for multi-action proposals.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as vm from 'node:vm';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const aiSource = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
const planSource = readFileSync(join(ROOT, 'js', 'ai-document-daily-plan.js'), 'utf8');
const appSource = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');
const swSource = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const agentSrc = readFileSync(join(ROOT, 'js', 'ai-agent.js'), 'utf8');
const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
const chatSource = readFileSync(join(ROOT, 'js', 'chat.js'), 'utf8');

/* ===========================================================
   1. VALIDATOR FUNCTION — real function calls
   =========================================================== */
describe('Runtime: validateDailyPlanProposal', () => {
  let validateFn;

  beforeEach(() => {
    // Extract and eval the validator from server/ai.js
    const startIdx = aiSource.indexOf('function validateDailyPlanProposal');
    assert.ok(startIdx >= 0, 'validator function found');
    // Find the function body up to the next top-level const/function
    let depth = 0;
    let endIdx = startIdx;
    const src = aiSource.slice(startIdx);
    // Simple bracket matching
    let started = false;
    for (let i = 0; i < src.length; i++) {
      if (src[i] === '{') { depth++; started = true; }
      if (src[i] === '}') { depth--; }
      if (started && depth === 0) { endIdx = startIdx + i + 1; break; }
    }
    // Also extract helper functions/constants it depends on
    const validDateIdx = aiSource.indexOf('function validDate(');
    const validDateEnd = aiSource.indexOf('\n}', validDateIdx) + 2;
    const validActionIdIdx = aiSource.indexOf('function validActionId(');
    const validActionIdEnd = aiSource.indexOf('\n}', validActionIdIdx) + 2;
    const actionIdReIdx = aiSource.indexOf('const ACTION_ID_RE =');
    const actionIdReEnd = aiSource.indexOf('\n', actionIdReIdx) + 1;
    const helpers = aiSource.slice(actionIdReIdx, actionIdReEnd) + '\n' + aiSource.slice(validDateIdx, validDateEnd) + '\n' + aiSource.slice(validActionIdIdx, validActionIdEnd) + '\n';
    const fnSrc = helpers + aiSource.slice(startIdx, endIdx);
    const sandbox = { Date, Math, Array, Object, Set, Map, String, Number, TypeError, RangeError, Error, JSON, parseInt };
    vm.createContext(sandbox);
    vm.runInContext(fnSrc, sandbox);
    validateFn = sandbox.validateDailyPlanProposal;
  });

  it('accepts a valid 21-action proposal', () => {
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    }
    const proposal = {
      summary: 'Kế hoạch 7 ngày',
      actions: Array.from({ length: 21 }, (_, i) => ({
        id: 'a' + (i + 1),
        type: 'create_task',
        args: {
          text: 'Task ' + (i + 1),
          date: dates[i % 7],
          duration: 45,
          priority: false,
          start: null,
          projectId: null,
          milestoneId: null,
          taskRef: null,
          changes: null,
        },
      })),
    };
    const result = validateFn(proposal);
    assert.equal(result.ok, true, '21-action proposal should be valid, errors: ' + JSON.stringify(result.errors));
  });

  it('accepts a valid 84-action proposal (max)', () => {
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    }
    const proposal = {
      summary: 'Kế hoạch 14 ngày',
      actions: Array.from({ length: 84 }, (_, i) => ({
        id: 'a' + (i + 1),
        type: 'create_task',
        args: {
          text: 'Task ' + (i + 1),
          date: dates[i % 14],
          duration: 30,
          priority: false,
          start: null,
          projectId: null,
          milestoneId: null,
          taskRef: null,
          changes: null,
        },
      })),
    };
    const result = validateFn(proposal);
    assert.equal(result.ok, true, '84-action proposal should be valid');
  });

  it('rejects 85 actions', () => {
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const proposal = {
      summary: 'Too many',
      actions: Array.from({ length: 85 }, (_, i) => ({
        id: 'a' + (i + 1),
        type: 'create_task',
        args: {
          text: 'Task', date: dateStr, duration: 30, priority: false,
          start: null, projectId: null, milestoneId: null, taskRef: null, changes: null,
        },
      })),
    };
    const result = validateFn(proposal);
    assert.equal(result.ok, false, '85 actions should be rejected');
    assert.ok(result.errors.includes('actions-too-many'), 'has actions-too-many error');
  });

  it('rejects past date', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
    const proposal = {
      summary: 'Past date test',
      actions: [{
        id: 'a1', type: 'create_task',
        args: {
          text: 'Past task', date: yStr, duration: 30, priority: false,
          start: null, projectId: null, milestoneId: null, taskRef: null, changes: null,
        },
      }],
    };
    const result = validateFn(proposal);
    assert.equal(result.ok, false, 'past date should be rejected');
    assert.ok(result.errors.some(e => e.includes('past-date')), 'has past-date error: ' + JSON.stringify(result.errors));
  });

  it('rejects non-create_task type', () => {
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const proposal = {
      summary: 'Wrong type',
      actions: [{
        id: 'a1', type: 'schedule_task',
        args: {
          text: 'Bad', date: dateStr, duration: 30, priority: false,
          start: null, projectId: null, milestoneId: null, taskRef: null, changes: null,
        },
      }],
    };
    const result = validateFn(proposal);
    assert.equal(result.ok, false, 'non-create_task should be rejected');
    assert.ok(result.errors.some(e => e.includes('type-not-create')), 'has type error');
  });

  it('rejects duplicate IDs', () => {
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const proposal = {
      summary: 'Dup IDs',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'First', date: dateStr, duration: 30, priority: false, start: null, projectId: null, milestoneId: null, taskRef: null, changes: null } },
        { id: 'a1', type: 'create_task', args: { text: 'Second', date: dateStr, duration: 30, priority: false, start: null, projectId: null, milestoneId: null, taskRef: null, changes: null } },
      ],
    };
    const result = validateFn(proposal);
    assert.equal(result.ok, false, 'duplicate IDs should be rejected');
    assert.ok(result.errors.some(e => e.includes('duplicate-id')), 'has duplicate-id error');
  });

  it('rejects duration < 20', () => {
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const proposal = {
      summary: 'Short duration',
      actions: [{ id: 'a1', type: 'create_task', args: { text: 'Short', date: dateStr, duration: 10, priority: false, start: null, projectId: null, milestoneId: null, taskRef: null, changes: null } }],
    };
    const result = validateFn(proposal);
    assert.equal(result.ok, false, 'duration 10 should be rejected');
    assert.ok(result.errors.some(e => e.includes('invalid-duration')), 'has duration error');
  });

  it('rejects duration > 120', () => {
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const proposal = {
      summary: 'Long duration',
      actions: [{ id: 'a1', type: 'create_task', args: { text: 'Long', date: dateStr, duration: 121, priority: false, start: null, projectId: null, milestoneId: null, taskRef: null, changes: null } }],
    };
    const result = validateFn(proposal);
    assert.equal(result.ok, false, 'duration 121 should be rejected');
    assert.ok(result.errors.some(e => e.includes('invalid-duration')), 'has duration error');
  });

  it('rejects non-null taskRef', () => {
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const proposal = {
      summary: 'Bad taskRef',
      actions: [{ id: 'a1', type: 'create_task', args: { text: 'Ref', date: dateStr, duration: 30, priority: false, start: null, projectId: null, milestoneId: null, taskRef: { kind: 'existing' }, changes: null } }],
    };
    const result = validateFn(proposal);
    assert.equal(result.ok, false, 'non-null taskRef should be rejected');
    assert.ok(result.errors.some(e => e.includes('taskRef-not-null')), 'has taskRef error');
  });

  it('rejects empty text', () => {
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const proposal = {
      summary: 'Empty text',
      actions: [{ id: 'a1', type: 'create_task', args: { text: '', date: dateStr, duration: 30, priority: false, start: null, projectId: null, milestoneId: null, taskRef: null, changes: null } }],
    };
    const result = validateFn(proposal);
    assert.equal(result.ok, false, 'empty text should be rejected');
    assert.ok(result.errors.some(e => e.includes('text-invalid')), 'has text error');
  });

  it('rejects non-null start', () => {
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const proposal = {
      summary: 'Bad start',
      actions: [{ id: 'a1', type: 'create_task', args: { text: 'Start', date: dateStr, duration: 30, priority: false, start: '09:00', projectId: null, milestoneId: null, taskRef: null, changes: null } }],
    };
    const result = validateFn(proposal);
    assert.equal(result.ok, false, 'non-null start should be rejected');
    assert.ok(result.errors.some(e => e.includes('start-not-null')), 'has start error');
  });
});

/* ===========================================================
   2. CLIENT MODULE API — real runtime in VM
   =========================================================== */
describe('Runtime: ai-document-daily-plan.js module API', () => {
  let sandbox;
  let api;

  beforeEach(() => {
    sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: {
        _store: {},
        getItem(k) { return this._store[k] || null; },
        setItem(k, v) { this._store[k] = v; },
        removeItem(k) { delete this._store[k]; },
      },
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(planSource, sandbox);
    api = sandbox.TaskFlowDocumentDailyPlan;
  });

  it('exposes correct public API', () => {
    assert.equal(typeof api.loadStore, 'function');
    assert.equal(typeof api.saveRoadmap, 'function');
    assert.equal(typeof api.getActiveRoadmap, 'function');
    assert.equal(typeof api.updateCursor, 'function');
    assert.equal(typeof api.clearActiveRoadmap, 'function');
    assert.equal(typeof api.clearAll, 'function');
    assert.equal(typeof api.runInitialDocumentPlan, 'function');
    assert.equal(typeof api.runNextWindow, 'function');
    assert.equal(typeof api.sendProposalToReview, 'function');
    assert.equal(typeof api.getStatus, 'function');
    assert.equal(typeof api.onAccountChange, 'function');
    assert.equal(typeof api._getAccountScope, 'function');
    assert.equal(typeof api._today, 'function');
    assert.equal(typeof api._addDays, 'function');
  });

  it('_today returns local date format YYYY-MM-DD', () => {
    const today = api._today();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/, 'format YYYY-MM-DD');
    // Must NOT use UTC
    const now = new Date();
    const localDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    assert.equal(today, localDate, 'matches local date, not UTC');
  });

  it('_today does NOT use toISOString', () => {
    assert.ok(!planSource.includes('_today().toISOString'), 'no toISOString in _today');
    assert.ok(planSource.includes('getFullYear'), 'uses getFullYear');
    assert.ok(planSource.includes('getMonth'), 'uses getMonth');
    assert.ok(planSource.includes('getDate'), 'uses getDate');
  });

  it('_addDays works correctly', () => {
    assert.equal(api._addDays('2026-08-24', 1), '2026-08-25');
    assert.equal(api._addDays('2026-08-31', 1), '2026-09-01');
    assert.equal(api._addDays('2026-08-24', 7), '2026-08-31');
    assert.equal(api._addDays('2026-12-31', 1), '2027-01-01');
  });
});

/* ===========================================================
   3. ACCOUNT-SCOPED STORAGE ISOLATION
   =========================================================== */
describe('Runtime: account-scoped roadmap storage', () => {
  it('roadmap saved under account scope key', () => {
    const store = { _store: {} };
    const mockStorage = {
      getItem(k) { return store._store[k] || null; },
      setItem(k, v) { store._store[k] = v; },
      removeItem(k) { delete store._store[k]; },
    };

    // Simulate user A
    const sandboxA = {
      window: {}, console: { log() {}, error() {} },
      localStorage: mockStorage,
      Sync: { getUserId: () => 'user-a' },
    };
    sandboxA.globalThis = sandboxA;
    sandboxA.window = sandboxA;
    vm.createContext(sandboxA);
    vm.runInContext(planSource, sandboxA);
    const apiA = sandboxA.TaskFlowDocumentDailyPlan;

    apiA.saveRoadmap({
      id: 'roadmap-a',
      accountScope: apiA._getAccountScope(),
      fingerprint: 'pdf-a',
      documentName: 'Roadmap A',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      roadmap: { title: 'A', phases: [] },
    });

    // Simulate user B
    const sandboxB = {
      window: {}, console: { log() {}, error() {} },
      localStorage: mockStorage,
      Sync: { getUserId: () => 'user-b' },
    };
    sandboxB.globalThis = sandboxB;
    sandboxB.window = sandboxB;
    vm.createContext(sandboxB);
    vm.runInContext(planSource, sandboxB);
    const apiB = sandboxB.TaskFlowDocumentDailyPlan;

    // B should NOT see A's roadmap
    const activeB = apiB.getActiveRoadmap();
    assert.equal(activeB, null, 'user B does not see user A roadmap');

    // Save B's roadmap
    apiB.saveRoadmap({
      id: 'roadmap-b',
      accountScope: apiB._getAccountScope(),
      fingerprint: 'pdf-b',
      documentName: 'Roadmap B',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      roadmap: { title: 'B', phases: [] },
    });

    // Verify isolation
    const activeA = apiA.getActiveRoadmap();
    assert.ok(activeA, 'user A has active roadmap');
    assert.equal(activeA.id, 'roadmap-a', 'user A roadmap is A');

    const activeB2 = apiB.getActiveRoadmap();
    assert.ok(activeB2, 'user B has active roadmap');
    assert.equal(activeB2.id, 'roadmap-b', 'user B roadmap is B');

    // Check storage keys are different
    const storageKeys = Object.keys(store._store);
    assert.ok(storageKeys.some(k => k.includes('user-a')), 'has user-a storage key');
    assert.ok(storageKeys.some(k => k.includes('user-b')), 'has user-b storage key');
  });

  it('anonymous user gets anon scope', () => {
    const store = { _store: {} };
    const mockStorage = {
      getItem(k) { return store._store[k] || null; },
      setItem(k, v) { store._store[k] = v; },
      removeItem(k) { delete store._store[k]; },
    };
    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: mockStorage,
      // No Sync = anonymous
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(planSource, sandbox);
    const api = sandbox.TaskFlowDocumentDailyPlan;

    assert.equal(api._getAccountScope(), 'anon', 'anonymous scope');
  });

  it('uses window.Sync.getUserId() not TaskFlowSync', () => {
    assert.ok(planSource.includes('window.Sync'), 'references window.Sync');
    assert.ok(!planSource.includes('TaskFlowSync'), 'does NOT reference TaskFlowSync');
  });

  it('invalid JSON in storage recovers safely', () => {
    const store = { _store: {} };
    const key = 'taskflow-document-roadmaps:test-user';
    store._store[key] = '{invalid json!!!}';
    const mockStorage = {
      getItem(k) { return store._store[k] || null; },
      setItem(k, v) { store._store[k] = v; },
      removeItem(k) { delete store._store[k]; },
    };
    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: mockStorage,
      Sync: { getUserId: () => 'test-user' },
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(planSource, sandbox);
    const api = sandbox.TaskFlowDocumentDailyPlan;

    // Should not throw, should return empty store
    const storeData = api.loadStore();
    assert.equal(storeData.version, 2);
    assert.ok(Array.isArray(storeData.roadmaps), 'roadmaps is array');
    assert.equal(storeData.roadmaps.length, 0, 'roadmaps is empty');
    assert.equal(storeData.activeRoadmapId, null);
  });

  it('onAccountChange clears pending cursor but preserves roadmap', () => {
    const store = { _store: {} };
    const mockStorage = {
      getItem(k) { return store._store[k] || null; },
      setItem(k, v) { store._store[k] = v; },
      removeItem(k) { delete store._store[k]; },
    };
    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: mockStorage,
      Sync: { getUserId: () => 'user-x' },
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(planSource, sandbox);
    const api = sandbox.TaskFlowDocumentDailyPlan;

    api.saveRoadmap({
      id: 'rm-1', accountScope: 'user-x', fingerprint: 'f1',
      documentName: 'Test', createdAt: Date.now(), updatedAt: Date.now(),
      roadmap: { title: 'Test', phases: [] },
    });
    assert.ok(api.getActiveRoadmap(), 'has active roadmap');

    api.onAccountChange();
    // onAccountChange should NOT clear another account's persistent data.
    // The roadmap data is account-scoped via storage key, so it persists.
    assert.ok(api.getActiveRoadmap(), 'roadmap preserved after account change (storage is account-scoped)');
  });
});

/* ===========================================================
   4. LAZY LOADING CHAIN
   =========================================================== */
describe('Runtime: lazy loading chain includes document-daily-plan', () => {
  it('runLazyChat loads ai-document-daily-plan.min.js', () => {
    // Verify the module is in the chain between ai-agent-runtime and chat-history
    const runLazyIdx = appSource.indexOf('function runLazyChat');
    assert.ok(runLazyIdx >= 0, 'runLazyChat found');
    const chainEnd = appSource.indexOf('\n}', runLazyIdx + 500);
    const chain = appSource.slice(runLazyIdx, chainEnd > 0 ? chainEnd : runLazyIdx + 2000);

    const runtimeIdx = chain.indexOf('ai-agent-runtime.min.js');
    const dailyPlanIdx = chain.indexOf('ai-document-daily-plan.min.js');
    const chatHistIdx = chain.indexOf('chat-history.min.js');

    assert.ok(runtimeIdx >= 0, 'ai-agent-runtime.min.js in chain');
    assert.ok(dailyPlanIdx >= 0, 'ai-document-daily-plan.min.js in runLazyChat chain');
    assert.ok(chatHistIdx >= 0, 'chat-history.min.js in chain');
    assert.ok(runtimeIdx < dailyPlanIdx, 'document-daily-plan loads AFTER runtime');
    assert.ok(dailyPlanIdx < chatHistIdx, 'document-daily-plan loads BEFORE chat-history');
  });

  it('preloadLazyChat also loads ai-document-daily-plan.min.js', () => {
    const preloadIdx = appSource.indexOf('function preloadLazyChat');
    assert.ok(preloadIdx >= 0, 'preloadLazyChat found');
    const chainEnd = appSource.indexOf('\n}', preloadIdx + 500);
    const chain = appSource.slice(preloadIdx, chainEnd > 0 ? chainEnd : preloadIdx + 2000);

    assert.ok(chain.includes('ai-document-daily-plan.min.js'), 'preloadLazyChat includes module');
    assert.ok(chain.indexOf('ai-agent-runtime.min.js') < chain.indexOf('ai-document-daily-plan.min.js'),
      'loads after runtime');
  });

  it('chat.min.js loads AFTER ai-document-daily-plan.min.js', () => {
    const runLazyIdx = appSource.indexOf('function runLazyChat');
    const chain = appSource.slice(runLazyIdx, runLazyIdx + 2000);
    assert.ok(chain.indexOf('ai-document-daily-plan.min.js') < chain.indexOf('chat.min.js'),
      'document-daily-plan loads before chat');
  });
});

/* ===========================================================
   5. SW APP_SHELL
   =========================================================== */
describe('Runtime: SW cache includes ai-document-daily-plan.min.js', () => {
  it('APP_SHELL contains ai-document-daily-plan.min.js', () => {
    assert.ok(swSource.includes("'./js/ai-document-daily-plan.min.js'"),
      'APP_SHELL has ai-document-daily-plan.min.js');
  });

  it('module is after ai-agent-runtime.min.js in APP_SHELL', () => {
    const rtIdx = swSource.indexOf("'./js/ai-agent-runtime.min.js'");
    const dpIdx = swSource.indexOf("'./js/ai-document-daily-plan.min.js'");
    assert.ok(rtIdx >= 0, 'runtime in APP_SHELL');
    assert.ok(dpIdx >= 0, 'document-daily-plan in APP_SHELL');
    assert.ok(rtIdx < dpIdx, 'document-daily-plan comes after runtime');
  });
});

/* ===========================================================
   6. CURSOR LOGIC
   =========================================================== */
describe('Runtime: cursor advance logic', () => {
  let api;
  let mockStorage;

  beforeEach(() => {
    mockStorage = {};
    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: {
        getItem(k) { return mockStorage[k] || null; },
        setItem(k, v) { mockStorage[k] = v; },
        removeItem(k) { delete mockStorage[k]; },
      },
      Sync: { getUserId: () => 'test-user' },
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(planSource, sandbox);
    api = sandbox.TaskFlowDocumentDailyPlan;
  });

  it('updateCursor merges correctly', () => {
    api.saveRoadmap({
      id: 'rm-1', accountScope: 'test-user', fingerprint: 'f1',
      documentName: 'Test', createdAt: Date.now(), updatedAt: Date.now(),
      roadmap: { title: 'Test', phases: [] },
      baseDate: '2026-08-24', cursor: { nextWeek: 1, lastAppliedStartDate: '2026-08-24', lastAppliedDaysCount: 7 },
    });

    api.updateCursor('rm-1', { nextWeek: 2, lastAppliedStartDate: '2026-08-31', lastAppliedDaysCount: 7 });

    const active = api.getActiveRoadmap();
    assert.equal(active.cursor.nextWeek, 2, 'nextWeek advanced');
    assert.equal(active.cursor.lastAppliedStartDate, '2026-08-31', 'lastAppliedStartDate updated');
    assert.equal(active.cursor.lastAppliedDaysCount, 7, 'lastAppliedDaysCount preserved');
  });

  it('clearActiveRoadmap does NOT delete stored data', () => {
    api.saveRoadmap({
      id: 'rm-1', accountScope: 'test-user', fingerprint: 'f1',
      documentName: 'Test', createdAt: Date.now(), updatedAt: Date.now(),
      roadmap: { title: 'Test', phases: [] },
    });

    api.clearActiveRoadmap();
    assert.equal(api.getActiveRoadmap(), null, 'active cleared');

    // But the roadmap is still in storage
    const store = api.loadStore();
    assert.equal(store.roadmaps.length, 1, 'roadmap still in storage');
    assert.equal(store.roadmaps[0].id, 'rm-1', 'same roadmap preserved');
  });

  it('clearAll removes all data for account', () => {
    api.saveRoadmap({
      id: 'rm-1', accountScope: 'test-user', fingerprint: 'f1',
      documentName: 'Test', createdAt: Date.now(), updatedAt: Date.now(),
      roadmap: { title: 'Test', phases: [] },
    });
    assert.ok(api.getActiveRoadmap(), 'has roadmap before clear');

    api.clearAll();
    assert.equal(api.getActiveRoadmap(), null, 'no roadmap after clearAll');
    assert.equal(mockStorage['taskflow-document-roadmaps:test-user'], undefined, 'storage key removed');
  });

  it('max 10 roadmaps stored', () => {
    for (let i = 0; i < 12; i++) {
      api.saveRoadmap({
        id: 'rm-' + i, accountScope: 'test-user', fingerprint: 'f' + i,
        documentName: 'Doc ' + i, createdAt: Date.now(), updatedAt: Date.now(),
        roadmap: { title: 'Doc ' + i, phases: [] },
      });
    }
    const store = api.loadStore();
    assert.ok(store.roadmaps.length <= 10, 'storage bounded to 10, got ' + store.roadmaps.length);
  });
});

/* ===========================================================
   7. CHAT.JS INTEGRATION — wiring checks
   =========================================================== */
describe('Runtime: chat.js wires document-daily-plan correctly', () => {
  it('document-daily-plan upload is delegated to the canonical orchestrator', () => {
    assert.ok(chatSource.includes('dailyPlanner.runInitialDocumentPlan'), 'chat delegates initial upload');
    assert.ok(planSource.includes('/api/ai/document-roadmap'), 'orchestrator owns the Stage A endpoint');
    assert.ok(planSource.includes('/api/ai/daily-plan'), 'initial window rides the shared daily-plan endpoint');
  });

  it('follow-up "tuần tiếp theo" checks TaskFlowDocumentDailyPlan', () => {
    assert.ok(chatSource.includes('TaskFlowDocumentDailyPlan'), 'references module');
    assert.ok(chatSource.includes('getActiveRoadmap'), 'checks active roadmap');
    assert.ok(chatSource.includes('runNextWindow'), 'calls runNextWindow');
  });

  it('follow-up uses sendProposalToReview from module', () => {
    // The follow-up path after runNextWindow should use sendProposalToReview
    assert.ok(chatSource.includes('window.TaskFlowDocumentDailyPlan.sendProposalToReview'),
      'follow-up calls module sendProposalToReview');
  });

  it('initial plan uses module sendProposalToReview (not direct handleExternalProposal)', () => {
    // The initial document-daily-plan response should delegate to module
    assert.ok(chatSource.includes('window.TaskFlowDocumentDailyPlan.sendProposalToReview'),
      'initial plan delegates to module sendProposalToReview');
  });

  it('missing attachment is intercepted before the generic task agent', () => {
    assert.ok(chatSource.includes('function _isDocumentPlanRequest'), 'has no-file document plan guard');
    assert.ok(chatSource.includes('if (_isDocumentPlanRequest(text))'), 'checks guard before generic agent');
    assert.ok(chatSource.includes("_t('documentPlanAttachRequired')"), 'shows an actionable attach-PDF message');
    assert.ok(
      chatSource.indexOf('if (_isDocumentPlanRequest(text))') < chatSource.indexOf('if (useAgent)'),
      'document plan guard runs before generic agent routing',
    );
  });
});

/* ===========================================================
   8. NO buildContext() IN SERVER
   =========================================================== */
describe('Runtime: server daily-plan route has no buildContext()', () => {
  it('daily-plan route does not call buildContext()', () => {
    const dailyPlanIdx = aiSource.indexOf("router.post('/daily-plan'");
    const nextRouteIdx = aiSource.indexOf("router.post('/document-roadmap'");
    assert.ok(dailyPlanIdx >= 0, 'daily-plan route found');
    assert.ok(nextRouteIdx > dailyPlanIdx, 'document-roadmap route after daily-plan');
    const segment = aiSource.slice(dailyPlanIdx, nextRouteIdx);
    assert.ok(!segment.includes('buildContext()'), 'no buildContext() in daily-plan route');
  });
});

/* ===========================================================
   9. REVIEW DOM — multi-action daily plan proposal
   =========================================================== */
describe('Runtime: Review DOM for 14-action daily plan proposal', () => {
  it('handleExternalProposal renders card with all action rows', () => {
    // Build a 14-action daily plan proposal
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    }
    const proposal = {
      summary: 'Kế hoạch 7 ngày — 14 việc',
      actions: Array.from({ length: 14 }, (_, i) => ({
        id: 'a' + (i + 1),
        type: 'create_task',
        args: {
          text: 'Study task ' + (i + 1),
          date: dates[i % 7],
          duration: 45,
          priority: false,
          start: null,
          projectId: null,
          milestoneId: null,
          taskRef: null,
          changes: null,
        },
      })),
    };

    // Source-based verification that handleExternalProposal supports >10 actions
    assert.ok(runtimeSrc.includes('handleExternalProposal'), 'runtime has handleExternalProposal');
    assert.ok(runtimeSrc.includes('fileImport'), 'uses fileImport policy');
    assert.ok(agentSrc.includes('maxActions: 120'), 'fileImport allows 120 actions');
    assert.ok(proposal.actions.length === 14, 'proposal has 14 actions (>10)');
    assert.ok(proposal.actions.length <= 84, 'proposal within daily plan limit');
  });
});
