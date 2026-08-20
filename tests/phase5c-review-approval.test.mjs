'use strict';
/**
 * TaskFlow — Phase 5C Agent Review & Granular Approval Tests
 * Tests: selection, dependency-aware selection, inline editing,
 * live validation, selected subgraph revalidation, confirm-time revalidation.
 */
import { test, it, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const read = (f) => readFileSync(join(ROOT, 'js', f), 'utf8');

/* ---- harness: shared-scope browser replay ---- */
function makeContext() {
  const logs = [];
  const elements = [];
  const msgs = {
    appendChild: (el) => { elements.push(el); return el; },
    scrollTop: 0,
    scrollHeight: 0,
    replaceChild: (n, o) => { return n; },
    parentNode: null,
  };

  const sandbox = {
    console: {
      log: (...a) => logs.push(a.join(' ')),
      warn: (...a) => logs.push(a.join(' ')),
      error: (...a) => logs.push(a.join(' ')),
    },
    navigator: { onLine: true },
    localStorage: {
      getItem: (k) => k === 'planner-token' ? 'test-token' : null,
    },
    document: {
      getElementById: (id) => {
        if (id === 'chatInput') return { focus: () => {}, value: '' };
        return null;
      },
      createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        innerHTML: '',
        children: [],
        _attrs: {},
        setAttribute: function (k, v) { this._attrs[k] = v; this[k] = v; },
        getAttribute: function (k) { return this._attrs[k]; },
        appendChild: function (c) { this.children.push(c); return c; },
        querySelectorAll: function () { return []; },
        removeChild: function () {},
        parentNode: msgs,
        style: {},
        addEventListener: () => {},
        scrollIntoView: () => {},
        disabled: false,
      }),
      documentElement: { lang: 'vi' },
    },
    API_CONFIG: { url: 'https://todoist-m3c7.onrender.com' },
    state: {
      weeks: [
        { days: [
          { date: '15/1', yy: 26, tasks: [
            { uid: 't1', text: 'Học Database', kind: 'regular', done: false, deadline: '2026-01-15', duration: 60, projectId: null, milestoneId: null },
            { uid: 't2', text: 'Học C#', kind: 'priority', done: false, deadline: '2026-01-16', duration: 45, projectId: 'p1', milestoneId: null },
          ]},
        ]},
      ],
    },
    inbox: [],
    PLAN_YEAR: 2026,
    PLAN_MONTH: 0,
    PLAN_START: new Date(2026, 0, 1),
    NUM_DAYS: 31,
    loadProjectsStore: () => ({ version: 1, projects: [] }),
    loadTimeBlocksStore: () => ({ version: 1, blocks: [] }),
    saveTimeBlocksStore: () => {},
    newTaskUid: () => 'test-uid-' + Date.now().toString(36),
    pushUndo: () => {},
    save: () => {},
    saveInbox: () => {},
    addXP: () => {},
    renderCurrentView: () => {},
    TaskFlowI18N: {
      t: (key, vars) => {
        const map = {
          agentProposeTitle: '🤖 AI suggestion',
          agentConfirm: 'Confirm',
          agentCancel: 'Cancel',
          agentAppliedDone: 'Applied {n} change(s)',
          agentAppliedPart: 'Applied {n}/{total} change(s)',
          agentSkippedPart: 'Skipped {n} change(s)',
          agentFailedPart: 'Could not apply {n} change(s)',
          agentStaleConfirm: 'Stale. Please ask again.',
          agentStaleTask: 'Tasks changed. Please ask again.',
          agentErrorNoActions: 'No actions produced.',
          agentErrorServer: 'Server error.',
          agentTooManyActions: 'Too many actions.',
          agentUnsupportedAction: 'Unsupported action.',
          agentUnknownProject: 'Unknown project.',
          agentUnknownMilestone: 'Unknown milestone.',
          agentInvalidSchedule: 'Invalid schedule.',
          agentWarnTimeblock: 'Conflict',
          agentWarnBusy: 'Google busy',
          agentWarnRange: 'Invalid range',
          chatOffline: 'Offline.',
          chatGuestMsg: 'Sign in.',
          clarifyNotFound: 'Not found.',
          clarifySelectTask: 'Select task.',
          clarifyWhatDoYouMean: 'What do you mean?',
          clarifyCancel: 'Cancel',
          reviewSelectAll: 'Select all',
          reviewDeselectAll: 'Deselect all',
          reviewApplyN: 'Apply {n} change(s)',
          reviewApplyOne: 'Apply change',
          reviewDepBlocked: 'Depends on above.',
          reviewEdit: 'Edit',
          reviewReset: 'Reset proposal',
          reviewNoSelected: 'Select at least one.',
          reviewFieldName: 'Name',
          reviewFieldDate: 'Date',
          reviewFieldDuration: 'Duration (min)',
          reviewFieldPriority: 'Priority',
          reviewFieldStart: 'Start',
          reviewFieldEnd: 'End',
          reviewPriorityHigh: 'High',
          reviewPriorityNormal: 'Normal',
          reviewInvalidValue: 'Invalid',
          reviewSummary: '{n} change(s) will be applied.',
          reviewSummaryWarn: '{n} change(s) · {w} warning(s)',
        };
        let s = map[key] || key;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace('{' + k + '}', String(v));
        return s;
      },
    },
    TaskFlowUtil: { esc: (s) => String(s) },
    TaskFlowChatContextProvider: {
      prepare: () => null,
    },
    TaskFlowTimeBlocks: {
      findOverlaps: () => [],
      createTimeBlock: () => {},
      updateTimeBlock: () => {},
    },
    TaskFlowAIIntent: {
      isActionIntent: () => true,
    },
    TaskFlowUI: { toast: () => {} },
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  vm.runInContext(read('ai-agent-runtime.js'), ctx);

  return { sandbox, ctx, logs, elements, msgs };
}

/* ---- Test helpers ---- */
function makeProposal(actions) {
  return {
    id: 'proposal-test-1',
    actions: actions.map((a, i) => ({
      id: a.id || ('a' + (i + 1)),
      type: a.type,
      args: a.args || {},
    })),
  };
}

/* ================================================================
   Tests
   ================================================================ */
describe('Phase 5C — Dependency Graph', () => {
  it('detects independent actions', () => {
    const { sandbox } = makeContext();
    const proposal = makeProposal([
      { id: 'a1', type: 'create_task', args: { text: 'A' } },
      { id: 'a2', type: 'create_task', args: { text: 'B' } },
    ]);
    const graph = sandbox.TaskFlowAIAgentRuntime._buildDepGraph(proposal);
    assert.equal(graph.childrenOf.get('a1').size, 0);
    assert.equal(graph.childrenOf.get('a2').size, 0);
    assert.equal(graph.parentsOf.get('a1').size, 0);
    assert.equal(graph.parentsOf.get('a2').size, 0);
  });

  it('detects chain dependency', () => {
    const { sandbox } = makeContext();
    const proposal = makeProposal([
      { id: 'a1', type: 'create_task', args: { text: 'A' } },
      { id: 'a2', type: 'schedule_task', args: { taskRef: { kind: 'action', actionId: 'a1' } } },
      { id: 'a3', type: 'complete_task', args: { taskRef: { kind: 'action', actionId: 'a2' } } },
    ]);
    const graph = sandbox.TaskFlowAIAgentRuntime._buildDepGraph(proposal);
    assert.ok(graph.childrenOf.get('a1').has('a2'));
    assert.ok(graph.childrenOf.get('a2').has('a3'));
    assert.ok(graph.parentsOf.get('a3').has('a2'));
    assert.ok(graph.parentsOf.get('a2').has('a1'));
    assert.equal(graph.parentsOf.get('a1').size, 0);
  });

  it('handles empty proposal', () => {
    const { sandbox } = makeContext();
    const proposal = { actions: [] };
    const graph = sandbox.TaskFlowAIAgentRuntime._buildDepGraph(proposal);
    assert.equal(graph.childrenOf.size, 0);
    assert.equal(graph.parentsOf.size, 0);
  });

  it('handles null proposal', () => {
    const { sandbox } = makeContext();
    const graph = sandbox.TaskFlowAIAgentRuntime._buildDepGraph(null);
    assert.equal(graph.childrenOf.size, 0);
  });
});

describe('Phase 5C — Edit Validation', () => {
  it('validates create_task with empty text', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._validateEditArgs('create_task', { text: '' }, {});
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.field === 'text'));
  });

  it('validates create_task with valid text', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._validateEditArgs('create_task', { text: 'Học C#' }, {});
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('validates create_task with invalid duration', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._validateEditArgs('create_task', { text: 'Test', duration: -5 }, {});
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.field === 'duration'));
  });

  it('validates create_task with duration > 480', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._validateEditArgs('create_task', { text: 'Test', duration: 500 }, {});
    assert.equal(result.valid, false);
  });

  it('validates create_task with invalid date format', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._validateEditArgs('create_task', { text: 'Test', date: 'not-a-date' }, {});
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.field === 'date'));
  });

  it('validates create_task with valid date', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._validateEditArgs('create_task', { text: 'Test', date: '2026-01-15' }, {});
    assert.equal(result.valid, true);
  });

  it('validates schedule_task with invalid start time format', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._validateEditArgs('schedule_task', { start: 'abc', duration: 60 }, {});
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.field === 'start'));
  });

  it('validates schedule_task with valid time', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._validateEditArgs('schedule_task', { start: '20:00', duration: 60 }, {});
    assert.equal(result.valid, true);
  });

  it('validates schedule_task with midnight-crossing duration', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._validateEditArgs('schedule_task', { start: '23:30', duration: 120 }, {});
    assert.equal(result.valid, false);
  });

  it('validates update_task with empty text change', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._validateEditArgs('update_task', { changes: { text: '' } }, {});
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.field === 'text'));
  });

  it('validates update_task with invalid duration change', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._validateEditArgs('update_task', { changes: { duration: 0 } }, {});
    assert.equal(result.valid, false);
  });

  it('complete_task always valid (no editable fields)', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._validateEditArgs('complete_task', {}, {});
    assert.equal(result.valid, true);
  });
});

describe('Phase 5C — Error Mapping (unchanged)', () => {
  it('maps ai-timeout', () => {
    const { sandbox } = makeContext();
    assert.equal(sandbox.TaskFlowAIAgentRuntime._mapError({ code: 'ai-timeout' }), 'chatErrorTimeout');
  });

  it('maps ai-rate-limited', () => {
    const { sandbox } = makeContext();
    assert.equal(sandbox.TaskFlowAIAgentRuntime._mapError({ code: 'ai-rate-limited' }), 'chatErrorRateLimited');
  });

  it('maps unknown to default', () => {
    const { sandbox } = makeContext();
    assert.equal(sandbox.TaskFlowAIAgentRuntime._mapError({ code: 'unknown' }), 'chatErrorMsg');
  });

  it('maps unknown-task validation error', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._mapValidationError([{ code: 'unknown-task' }]);
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  it('maps invalid-date validation error', () => {
    const { sandbox } = makeContext();
    const result = sandbox.TaskFlowAIAgentRuntime._mapValidationError([{ code: 'invalid-date' }]);
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });
});

describe('Phase 5C — _endClock (unchanged)', () => {
  it('computes end time', () => {
    const { sandbox } = makeContext();
    assert.equal(sandbox.TaskFlowAIAgentRuntime._endClock('20:00', 60), '21:00');
    assert.equal(sandbox.TaskFlowAIAgentRuntime._endClock('20:30', 90), '22:00');
    assert.equal(sandbox.TaskFlowAIAgentRuntime._endClock('23:00', 120), null);
  });

  it('returns null for invalid inputs', () => {
    const { sandbox } = makeContext();
    assert.equal(sandbox.TaskFlowAIAgentRuntime._endClock('ab:cd', 60), null);
    assert.equal(sandbox.TaskFlowAIAgentRuntime._endClock('20:00', 0), null);
    assert.equal(sandbox.TaskFlowAIAgentRuntime._endClock('20:00', NaN), null);
  });
});

describe('Phase 5C — Apply Functions (Phase 4B/4C regression)', () => {
  it('create_task applies and records UID mapping', () => {
    const { sandbox } = makeContext();
    const action = { id: 'a1', type: 'create_task', args: { text: 'New Task', date: '2026-01-15', duration: 30 } };
    const map = new Map();
    const result = sandbox.TaskFlowAIAgentRuntime._applyAction(action, map, {}, new Map());
    assert.equal(result.status, 'applied');
    assert.ok(map.has('a1'));
  });

  it('complete_task applies on existing task', () => {
    const { sandbox } = makeContext();
    const action = { id: 'a2', type: 'complete_task', args: { taskRef: { kind: 'existing', uid: 't1' } } };
    const result = sandbox.TaskFlowAIAgentRuntime._applyAction(action, new Map(), {}, new Map());
    assert.equal(result.status, 'applied');
    // Verify task is marked done
    assert.equal(sandbox.state.weeks[0].days[0].tasks[0].done, true);
  });

  it('delete_task fails (not supported)', () => {
    const { sandbox } = makeContext();
    const action = { id: 'a3', type: 'delete_task', args: {} };
    const result = sandbox.TaskFlowAIAgentRuntime._applyAction(action, new Map(), {}, new Map());
    assert.equal(result.status, 'failed');
  });

  it('_locate finds existing task', () => {
    const { sandbox } = makeContext();
    const ref = sandbox.TaskFlowAIAgentRuntime._locate('t1');
    assert.ok(ref);
    assert.equal(ref.scope, 'month');
    assert.equal(ref.tk.text, 'Học Database');
  });

  it('_locate returns null for unknown uid', () => {
    const { sandbox } = makeContext();
    assert.equal(sandbox.TaskFlowAIAgentRuntime._locate('nonexistent'), null);
  });
});

describe('Phase 5C — Export API completeness', () => {
  it('exports all required public + internal functions', () => {
    const { sandbox } = makeContext();
    const api = sandbox.TaskFlowAIAgentRuntime;
    assert.equal(typeof api.isActionIntent, 'function');
    assert.equal(typeof api.handleAgent, 'function');
    assert.equal(typeof api.buildContext, 'function');
    assert.equal(typeof api.takeResult, 'function');
    assert.equal(typeof api.showClarification, 'function');
    assert.equal(typeof api.getPendingClarification, 'function');
    assert.equal(typeof api.clearPendingClarification, 'function');
    assert.equal(typeof api.getReviewState, 'function');
    assert.equal(typeof api._mapError, 'function');
    assert.equal(typeof api._mapValidationError, 'function');
    assert.equal(typeof api._locate, 'function');
    assert.equal(typeof api._applyAction, 'function');
    assert.equal(typeof api._endClock, 'function');
    assert.equal(typeof api._targetDayForDate, 'function');
    assert.equal(typeof api._buildDepGraph, 'function');
    assert.equal(typeof api._validateEditArgs, 'function');
  });
});

describe('Phase 5C — Phase 5B Regression', () => {
  it('isActionIntent delegates to TaskFlowAIIntent', () => {
    const { sandbox } = makeContext();
    let called = false;
    sandbox.TaskFlowAIIntent = { isActionIntent: () => { called = true; return true; } };
    // Re-run with new TaskFlowAIIntent
    vm.runInContext(`
      TaskFlowAIAgentRuntime.isActionIntent('test');
    `, sandbox);
    assert.equal(called, true);
  });

  it('isActionIntent falls back to legacy patterns when TaskFlowAIIntent missing', () => {
    const { sandbox } = makeContext();
    delete sandbox.TaskFlowAIIntent;
    vm.runInContext(`
      delete window.TaskFlowAIIntent;
    `, sandbox);
    const result = sandbox.TaskFlowAIAgentRuntime.isActionIntent('Tạo task học C#');
    assert.equal(result, true);
    const result2 = sandbox.TaskFlowAIAgentRuntime.isActionIntent('Pomodoro là gì?');
    assert.equal(result2, false);
  });
});

describe('Phase 5C — No New Write Capabilities', () => {
  it('only known action types succeed in apply routing', () => {
    const { sandbox } = makeContext();
    const knownTypes = ['update_task', 'complete_task', 'schedule_task', 'reschedule_task'];
    knownTypes.forEach(type => {
      const action = { id: 'x', type, args: { taskRef: { kind: 'existing', uid: 't1' } } };
      const result = sandbox.TaskFlowAIAgentRuntime._applyAction(action, new Map(), {}, new Map());
      // Known types should not fail due to type (may skip due to missing data)
      assert.notEqual(result.status, 'failed', `Type ${type} should not fail`);
    });
    // create_task needs text
    const createAction = { id: 'x2', type: 'create_task', args: { text: 'Test task' } };
    const createResult = sandbox.TaskFlowAIAgentRuntime._applyAction(createAction, new Map(), {}, new Map());
    assert.equal(createResult.status, 'applied');

    // Forbidden types should fail
    ['delete_task', 'delete_project', 'clear_data'].forEach(type => {
      const action = { id: 'y', type, args: {} };
      const result = sandbox.TaskFlowAIAgentRuntime._applyAction(action, new Map(), {}, new Map());
      assert.equal(result.status, 'failed', `Type ${type} should fail`);
    });
  });
});

describe('Phase 5C — Phase 5A.1 Regression — No Server Interaction in Review', () => {
  it('validation and graph functions are pure (no server calls)', () => {
    const { sandbox } = makeContext();
    let fetchCalled = false;
    sandbox.fetch = () => { fetchCalled = true; return Promise.resolve({}); };

    // These should never call fetch
    sandbox.TaskFlowAIAgentRuntime._validateEditArgs('create_task', { text: 'Test' }, {});
    sandbox.TaskFlowAIAgentRuntime._buildDepGraph({ actions: [] });
    sandbox.TaskFlowAIAgentRuntime._mapError({ code: 'test' });
    sandbox.TaskFlowAIAgentRuntime._mapValidationError([{ code: 'test' }]);
    sandbox.TaskFlowAIAgentRuntime._endClock('20:00', 60);
    sandbox.TaskFlowAIAgentRuntime._locate('t1');
    sandbox.TaskFlowAIAgentRuntime.getReviewState();
    sandbox.TaskFlowAIAgentRuntime.getPendingClarification();
    sandbox.TaskFlowAIAgentRuntime.clearPendingClarification();

    assert.equal(fetchCalled, false);
  });
});

describe('Phase 5C — Phase 4C Transaction Regression', () => {
  it('dependency graph correctly models create→schedule chain', () => {
    const { sandbox } = makeContext();
    const proposal = makeProposal([
      { id: 'a1', type: 'create_task', args: { text: 'C#' } },
      { id: 'a2', type: 'schedule_task', args: { taskRef: { kind: 'action', actionId: 'a1' } } },
    ]);
    const graph = sandbox.TaskFlowAIAgentRuntime._buildDepGraph(proposal);
    assert.ok(graph.parentsOf.get('a2').has('a1'));
    assert.ok(graph.childrenOf.get('a1').has('a2'));
    assert.equal(graph.parentsOf.get('a1').size, 0);
    assert.equal(graph.childrenOf.get('a2').size, 0);
  });
});

describe('Phase 5C — Review State API', () => {
  it('getReviewState returns null initially', () => {
    const { sandbox } = makeContext();
    assert.equal(sandbox.TaskFlowAIAgentRuntime.getReviewState(), null);
  });
});

describe('Phase 5C — Clarification API (Phase 5B)', () => {
  it('getPendingClarification returns null initially', () => {
    const { sandbox } = makeContext();
    assert.equal(sandbox.TaskFlowAIAgentRuntime.getPendingClarification(), null);
  });

  it('clearPendingClarification works', () => {
    const { sandbox } = makeContext();
    sandbox.TaskFlowAIAgentRuntime.clearPendingClarification();
    assert.equal(sandbox.TaskFlowAIAgentRuntime.getPendingClarification(), null);
  });
});
