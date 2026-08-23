'use strict';
/**
 * P0 FINAL — E2E Review Integration Test
 *
 * CRITICAL: This test mocks fetch so /api/ai/agent returns production HTTP 200,
 * then exercises the FULL runtime path:
 *   handleAgent() → _callAgentAPI → fetch → validateProposal → dryRun →
 *   _renderCard → _renderCardFull → actual mock DOM
 *
 * It does NOT simulate _groupChangesForPreview independently.
 * It runs the actual runtime code end-to-end.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const agentSrc = readFileSync(join(ROOT, 'js', 'ai-agent.js'), 'utf8');
const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');

/* ---- Production fixtures ---- */
const PRODUCTION_CREATE = {
  summary: 'Tạo nhiệm vụ mới "Test".',
  actions: [{
    id: 'a1',
    type: 'create_task',
    args: {
      taskRef: null, text: 'Test', date: null, start: null,
      duration: null, priority: false, projectId: null,
      milestoneId: null, changes: null,
    },
  }],
};

const CREATE_SCHEDULE = {
  summary: 'Tạo task Test Schedule và xếp lịch',
  actions: [
    { id: 'a1', type: 'create_task', args: { taskRef: null, text: 'Test Schedule', date: null, start: null, duration: null, priority: false, projectId: null, milestoneId: null, changes: null } },
    { id: 'a2', type: 'schedule_task', args: { taskRef: { kind: 'action', uid: null, actionId: 'a1' }, text: null, date: '2026-08-25', start: '19:00', duration: 30, priority: null, projectId: null, milestoneId: null, changes: null } },
  ],
};

/* ---- Build sandbox with real DOM tracking ---- */
function buildSandbox(fixture) {
  const appended = [];

  const msgs = {
    appendChild(el) { appended.push(el); },
    scrollTop: 0,
    scrollHeight: 1000,
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {}, debug() {} },
    location: { search: '' },
    API_CONFIG: { url: 'http://localhost:3000' },
    navigator: { onLine: true },
    localStorage: {
      getItem: (k) => k === 'planner-token' ? 'test-token' : null,
      setItem() {},
      removeItem() {},
    },
    document: {
      getElementById: (id) => {
        if (id === 'chatInput') return { focus() {}, value: '' };
        if (id === 'chatPop') return { hidden: false, appendChild(el) { appended.push(el); } };
        return null;
      },
      createElement: (tag) => {
        const el = {
          tagName: tag.toUpperCase(),
          className: '',
          textContent: '',
          innerHTML: '',
          children: [],
          setAttribute(k, v) { this[k] = v; },
          getAttribute(k) { return this[k]; },
          appendChild(c) { this.children.push(c); return c; },
          removeChild() {},
          replaceChild(newC, oldC) {
            const idx = this.children.indexOf(oldC);
            if (idx >= 0) this.children[idx] = newC;
          },
          querySelectorAll() { return []; },
          querySelector(sel) {
            const match = sel.match && sel.match(/data-testid="([^"]+)"/);
            if (match) {
              const testid = match[1];
              function findInTree(node) {
                if (!node) return null;
                if (node.getAttribute && node.getAttribute('data-testid') === testid) return node;
                if (node.children) {
                  for (const child of node.children) {
                    const found = findInTree(child);
                    if (found) return found;
                  }
                }
                return null;
              }
              for (const a of appended) {
                const found = findInTree(a);
                if (found) return found;
              }
            }
            return null;
          },
          parentNode: msgs,
          style: {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {},
          disabled: false,
          get firstChild() { return this.children[0] || null; },
          get lastChild() { return this.children[this.children.length - 1] || null; },
          get nextSibling() { return null; },
          cloneNode() {
            return {
              tagName: this.tagName, className: '', textContent: '', children: [],
              setAttribute() {}, getAttribute() { return null; }, appendChild() {},
              querySelectorAll() { return []; }, querySelector() { return null; },
            };
          },
        };
        return el;
      },
    },
    fetch: async (url) => {
      if (url && url.includes('/api/ai/agent')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, proposal: fixture }),
          headers: { get() { return null; } },
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout() {},
    Date, JSON, Math, Map, Set, Array, Object, String, Number, Boolean, RegExp,
    Error, TypeError, RangeError,
  };

  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  return { sandbox, appended, msgs };
}

function loadModules(sandbox) {
  vm.createContext(sandbox);
  // Load agent (UMD → module.exports or window.TaskFlowAIAgent)
  vm.runInContext(agentSrc, sandbox);
  const ClientAgent = sandbox.TaskFlowAIAgent || (sandbox.module && sandbox.module.exports);
  // Ensure it's on window for the runtime to find
  sandbox.TaskFlowAIAgent = ClientAgent;

  // Capture agent's module.exports before overwriting
  const agentExports = sandbox.module ? sandbox.module.exports : null;

  // Reset module/exports to fresh objects so runtime's UMD won't use stale agent exports
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;

  // Load runtime (UMD → module.exports or window.TaskFlowAIAgentRuntime)
  vm.runInContext(runtimeSrc, sandbox);
  const Runtime = sandbox.TaskFlowAIAgentRuntime || sandbox.module.exports;
  return { ClientAgent, Runtime };
}

/* ============================================================
   Helper: collect all text from a DOM tree
   ============================================================ */
function collectText(node) {
  let text = '';
  if (!node) return text;
  if (typeof node === 'string') return node;
  if (node.textContent) text += node.textContent;
  if (node.children) {
    for (const c of node.children) text += ' ' + collectText(c);
  }
  return text;
}

/* ============================================================
   E2E: HTTP 200 → Review DOM (single create_task)
   ============================================================ */
describe('P0 E2E: HTTP 200 → Review DOM (single create_task)', () => {

  it('handleAgent creates agent-card with correct testids and task name', async () => {
    const { sandbox, appended } = buildSandbox(PRODUCTION_CREATE);
    const { Runtime } = loadModules(sandbox);
    const msgs = {
      appendChild(el) { appended.push(el); },
      scrollTop: 0,
      scrollHeight: 1000,
    };

    const result = await Runtime.handleAgent('Tạo task Test', [], msgs);

    assert.equal(result.handled, true, 'handleAgent returns handled=true');
    assert.equal(result.aborted, undefined, 'not aborted');

    // Verify agent-card was appended
    const card = appended.find(el => el && el.className && el.className.includes('agent-card'));
    assert.ok(card, 'agent-card element was appended to DOM');
    assert.equal(card.getAttribute('data-testid'), 'agent-card', 'card has data-testid="agent-card"');

    // Recursive testid finder
    function findByTestId(node, testid) {
      if (!node) return null;
      if (node.getAttribute && node.getAttribute('data-testid') === testid) return node;
      if (node.children) {
        for (const c of node.children) {
          const found = findByTestId(c, testid);
          if (found) return found;
        }
      }
      return null;
    }

    // Verify review-action-a1 exists (nested inside agent-card-body)
    const actionRow = findByTestId(card, 'review-action-a1');
    assert.ok(actionRow, 'review-action-a1 row exists');

    // Verify review-confirm button exists
    const confirmBtn = findByTestId(card, 'review-confirm');
    assert.ok(confirmBtn, 'review-confirm button exists');

    // Verify task name "Test" is visible in card text
    const cardText = collectText(card);
    assert.ok(cardText.includes('Test'), `card text must include "Test", got: ${cardText}`);

    // Verify NO generic "AI unavailable" error is rendered
    assert.ok(!cardText.includes('chưa khả dụng'), 'no generic AI unavailable error in card');
  });

  it('handleAgent does NOT throw ReferenceError for TYPE_TITLES etc.', async () => {
    const { sandbox, appended } = buildSandbox(PRODUCTION_CREATE);
    const { Runtime } = loadModules(sandbox);
    const msgs = {
      appendChild(el) { appended.push(el); },
      scrollTop: 0,
      scrollHeight: 1000,
    };

    const caughtErrors = [];
    sandbox.onerror = (msg) => { caughtErrors.push(msg); };

    const result = await Runtime.handleAgent('Tạo task Test', [], msgs);
    assert.equal(result.handled, true);
    const refErrors = caughtErrors.filter(e => typeof e === 'string' && e.includes('ReferenceError'));
    assert.deepStrictEqual(refErrors, [], `no ReferenceErrors: ${JSON.stringify(refErrors)}`);
  });

  it('card rendered without crashing when DOM methods are called', async () => {
    const { sandbox, appended } = buildSandbox(PRODUCTION_CREATE);
    const { ClientAgent, Runtime } = loadModules(sandbox);

    assert.ok(sandbox.TaskFlowAIAgent, 'TaskFlowAIAgent is set on window');
    assert.equal(typeof sandbox.TaskFlowAIAgent.validateProposal, 'function');
    assert.equal(typeof sandbox.TaskFlowAIAgent.dryRun, 'function');
    assert.equal(typeof sandbox.TaskFlowAIAgent.previewAction, 'function');

    const msgs = {
      appendChild(el) { appended.push(el); },
      scrollTop: 0,
      scrollHeight: 1000,
    };

    const result = await Runtime.handleAgent('Tạo task Test', [], msgs);
    assert.equal(result.handled, true);
    const card = appended.find(el => el && el.className && el.className.includes('agent-card'));
    assert.ok(card, 'agent-card exists');
  });
});

/* ============================================================
   E2E: HTTP 200 → Review DOM (create + schedule)
   ============================================================ */
describe('P0 E2E: HTTP 200 → Review DOM (create + schedule)', () => {

  it('create+schedule renders both actions with canonical titles', async () => {
    const { sandbox, appended } = buildSandbox(CREATE_SCHEDULE);
    const { Runtime } = loadModules(sandbox);
    const msgs = {
      appendChild(el) { appended.push(el); },
      scrollTop: 0,
      scrollHeight: 1000,
    };

    const result = await Runtime.handleAgent('Tạo task Test Schedule và xếp lịch', [], msgs);
    assert.equal(result.handled, true);

    // Verify card
    const card = appended.find(el => el && el.className && el.className.includes('agent-card'));
    assert.ok(card, 'agent-card exists');

    // Recursive testid finder
    function findByTestId(node, testid) {
      if (!node) return null;
      if (node.getAttribute && node.getAttribute('data-testid') === testid) return node;
      if (node.children) {
        for (const c of node.children) {
          const found = findByTestId(c, testid);
          if (found) return found;
        }
      }
      return null;
    }

    // Verify both action rows (nested inside agent-card-body)
    const actionA1 = findByTestId(card, 'review-action-a1');
    assert.ok(actionA1, 'review-action-a1 exists');

    const actionA2 = findByTestId(card, 'review-action-a2');
    assert.ok(actionA2, 'review-action-a2 exists');

    // Verify confirm button
    const confirmBtn = findByTestId(card, 'review-confirm');
    assert.ok(confirmBtn, 'review-confirm button exists');

    // Verify "Test Schedule" is visible
    const cardText = collectText(card);
    assert.ok(cardText.includes('Test Schedule'), `card text must include "Test Schedule", got: ${cardText}`);

    // Verify schedule action row also has meaningful content (not raw type)
    const scheduleText = collectText(actionA2);
    assert.ok(scheduleText.includes('Test Schedule'),
      `schedule action must resolve task name, got: ${scheduleText}`);
    assert.ok(!scheduleText.includes('schedule_task'),
      `schedule action should not show raw type "schedule_task": ${scheduleText}`);
  });
});

/* ============================================================
   E2E: NO pre-mutation before confirm
   ============================================================ */
describe('P0 E2E: no pre-mutation before confirm', () => {

  it('handleAgent does not create any tasks before user confirms', async () => {
    const { sandbox, appended } = buildSandbox(PRODUCTION_CREATE);
    const { Runtime } = loadModules(sandbox);

    // Track any TaskFlow API calls
    const apiCalls = [];
    sandbox.TaskFlowTasks = {
      create(text) { apiCalls.push({ method: 'create', text }); return { uid: 'new-1' }; },
    };

    const msgs = {
      appendChild(el) { appended.push(el); },
      scrollTop: 0,
      scrollHeight: 1000,
    };

    await Runtime.handleAgent('Tạo task Test', [], msgs);
    assert.deepStrictEqual(apiCalls, [], 'no TaskFlow API calls before confirm');
  });
});
