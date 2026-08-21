/**
 * Phase 6R — Contract Evaluation Tests
 *
 * Deterministic evaluation of AI proposal contracts using Vietnamese fixtures.
 * Tests verify that valid proposals are accepted and invalid ones are rejected.
 * Uses ONLY mocked/canned provider outputs — no real Gemini calls in CI.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkPlanProposal,
  checkAgentProposal,
  checkFileAgentProposal,
  sanitize,
  buildPlanContext,
  buildAgentContext,
  validateProposal,
  validateAgentProposal,
  validateFileAgentProposal,
  buildPrompt,
  AGENT_ACTION_TYPES,
  AGENT_MAX_ACTIONS,
  AGENT_MAX_TEXT,
  FILE_AGENT_ACTION_TYPES,
} from './helpers/eval-helpers.mjs';

import {
  allFixtures,
  sampleTasks,
  sampleProjects,
  sampleOverdue,
  TODAY,
  TOMORROW,
} from './fixtures/vi-fixtures.mjs';

/* ================================================================
   SECTION 1: Vietnamese Planning Fixtures — Contract Validation
   ================================================================ */

describe('Contract Eval: Vietnamese Planning Fixtures', () => {
  for (const fixture of allFixtures) {
    it(`${fixture.id}: ${fixture.request}`, () => {
      const { context, mockResponse, expected } = fixture;

      // 1. Validate mock response against contract
      if (expected.allowedActions) {
        for (const action of mockResponse.actions) {
          assert.ok(
            expected.allowedActions.includes(action.type),
            `Action type "${action.type}" should be in allowedActions: ${expected.allowedActions.join(', ')}`
          );
        }
      }

      if (expected.forbiddenActions) {
        for (const action of mockResponse.actions) {
          assert.ok(
            !expected.forbiddenActions.includes(action.type),
            `Action type "${action.type}" should NOT be in forbiddenActions`
          );
        }
      }

      // 2. Check action count
      if (expected.maxActions) {
        assert.ok(
          mockResponse.actions.length <= expected.maxActions,
          `Action count ${mockResponse.actions.length} exceeds max ${expected.maxActions}`
        );
      }

      // 3. Check summary length
      if (expected.summaryMaxLen) {
        assert.ok(
          mockResponse.summary.length <= expected.summaryMaxLen,
          `Summary length ${mockResponse.summary.length} exceeds max ${expected.summaryMaxLen}`
        );
      }

      // 4. Check task UIDs exist in context
      if (expected.taskUidsMustExist) {
        const contextUids = new Set(context.tasks.map(t => t.uid));
        for (const action of mockResponse.actions) {
          if (action.taskUid) {
            assert.ok(
              contextUids.has(action.taskUid),
              `Task UID "${action.taskUid}" should exist in context`
            );
          }
        }
      }

      // 5. Check dates are valid YYYY-MM-DD
      if (expected.datesMustBeValid) {
        for (const action of mockResponse.actions) {
          if (action.date) {
            assert.ok(
              /^\d{4}-\d{2}-\d{2}$/.test(action.date),
              `Date "${action.date}" should be YYYY-MM-DD`
            );
          }
        }
      }

      // 6. Check durations are in valid range
      if (expected.durationsMustBeRange) {
        const [min, max] = expected.durationsMustBeRange;
        for (const action of mockResponse.actions) {
          if (action.duration !== null && action.duration !== undefined) {
            assert.ok(
              action.duration >= min && action.duration <= max,
              `Duration ${action.duration} should be between ${min} and ${max}`
            );
          }
        }
      }

      // 7. Verify server-side validation would pass for the mock response
      const taskUids = context.tasks.map(t => t.uid);
      const v = validateProposal(mockResponse, {
        taskUids: new Set(taskUids),
        projectIds: new Set((context.projects || []).map(p => p.id)),
        milestoneIds: new Set((context.milestones || []).map(m => m.id)),
      });
      assert.equal(v.ok, true, `Server validation should pass: ${JSON.stringify(v.errors)}`);
    });
  }
});

/* ================================================================
   SECTION 2: Context Sanitization Contracts
   ================================================================ */

describe('Contract Eval: Context Sanitization', () => {
  it('strips unknown keys from context', () => {
    const { ctx } = sanitize({
      kind: 'plan_day',
      lang: 'vi',
      today: '2026-08-21',
      evilKey: 'should-be-removed',
      tasks: [{ uid: 't1', text: 'Test', secret: 'leak' }],
    });
    assert.equal(ctx.evilKey, undefined, 'Unknown top-level key should be stripped');
    assert.equal(ctx.tasks[0].secret, undefined, 'Unknown task field should be stripped');
  });

  it('caps task text at TEXT_MAX (160)', () => {
    const { ctx } = sanitize({
      kind: 'plan_day',
      today: '2026-08-21',
      tasks: [{ uid: 't1', text: 'x'.repeat(500) }],
    });
    assert.ok(ctx.tasks[0].text.length <= 160, 'Task text should be capped at 160');
  });

  it('caps task array at ARRAY_CAPS.tasks (60)', () => {
    const tasks = Array.from({ length: 100 }, (_, i) => ({ uid: 't' + i, text: 'Task ' + i }));
    const { ctx } = sanitize({ kind: 'plan_day', today: '2026-08-21', tasks });
    assert.ok(ctx.tasks.length <= 60, 'Task array should be capped at 60');
  });

  it('gates reflections behind allowSensitive', () => {
    const { ctx: without } = sanitize({
      kind: 'plan_day',
      today: '2026-08-21',
      reflections: [{ date: '2026-08-01', text: 'private thought' }],
    });
    assert.equal(without.reflections, undefined, 'Reflections should be absent without allowSensitive');

    const { ctx: withOpt } = sanitize({
      kind: 'plan_day',
      today: '2026-08-21',
      allowSensitive: true,
      reflections: [{ date: '2026-08-01', text: 'private thought' }],
    });
    assert.ok(Array.isArray(withOpt.reflections), 'Reflections should be present with allowSensitive');
  });

  it('gates mood behind allowSensitive', () => {
    const { ctx: without } = sanitize({
      kind: 'plan_day',
      today: '2026-08-21',
      mood: [{ date: '2026-08-01', value: 4 }],
    });
    assert.equal(without.mood, undefined, 'Mood should be absent without allowSensitive');

    const { ctx: withOpt } = sanitize({
      kind: 'plan_day',
      today: '2026-08-21',
      allowSensitive: true,
      mood: [{ date: '2026-08-01', value: 4 }],
    });
    assert.ok(Array.isArray(withOpt.mood), 'Mood should be present with allowSensitive');
  });

  it('validates today as YYYY-MM-DD or empty', () => {
    const { ctx: good } = sanitize({ kind: 'plan_day', today: '2026-08-21' });
    assert.equal(good.today, '2026-08-21');

    const { ctx: bad } = sanitize({ kind: 'plan_day', today: 'not-a-date' });
    assert.equal(bad.today, '');
  });

  it('accepts only valid kind values', () => {
    const { ctx } = sanitize({ kind: 'invalid_kind', today: '2026-08-21' });
    assert.equal(ctx.kind, null, 'Invalid kind should be null');
  });
});

/* ================================================================
   SECTION 3: Plan Proposal Contract — Valid Cases
   ================================================================ */

describe('Contract Eval: Plan Proposal Valid Cases', () => {
  it('valid schedule_task passes', () => {
    const taskUids = ['t1', 't2'];
    const v = validateProposal({
      summary: 'Kế hoạch ngày mai',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: 60, option: null, text: null },
      ],
    }, { taskUids: new Set(taskUids), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true, JSON.stringify(v.errors));
  });

  it('valid reschedule_task passes', () => {
    const v = validateProposal({
      summary: 'Reschedule',
      actions: [
        { type: 'reschedule_task', taskUid: 't1', option: 'tomorrow', date: null, start: null, duration: null, text: null },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true, JSON.stringify(v.errors));
  });

  it('valid next_action passes', () => {
    const v = validateProposal({
      summary: 'Next steps',
      actions: [
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Do something useful' },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true, JSON.stringify(v.errors));
  });

  it('mixed valid actions pass', () => {
    const v = validateProposal({
      summary: 'Mixed plan',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: 60, option: null, text: null },
        { type: 'reschedule_task', taskUid: 't2', option: 'inbox', date: null, start: null, duration: null, text: null },
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Focus on DB first' },
      ],
    }, { taskUids: new Set(['t1', 't2']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true, JSON.stringify(v.errors));
  });

  it('schedule_task with null duration passes', () => {
    const v = validateProposal({
      summary: 'Flexible plan',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '10:00', duration: null, option: null, text: null },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true, JSON.stringify(v.errors));
  });

  it('schedule_task with null start passes', () => {
    const v = validateProposal({
      summary: 'Any time plan',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: null, duration: 30, option: null, text: null },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true, JSON.stringify(v.errors));
  });
});

/* ================================================================
   SECTION 4: Plan Proposal Contract — Invalid Cases
   ================================================================ */

describe('Contract Eval: Plan Proposal Invalid Cases', () => {
  it('rejects unknown action type', () => {
    const v = validateProposal({
      summary: 'Bad plan',
      actions: [
        { type: 'delete_everything', taskUid: 't1', date: null, start: null, duration: null, option: null, text: null },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('unknown-type')));
  });

  it('rejects ghost task UID', () => {
    const v = validateProposal({
      summary: 'Ghost plan',
      actions: [
        { type: 'schedule_task', taskUid: 'GHOST', date: '2026-08-22', start: '09:00', duration: 60, option: null, text: null },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('unknown-task')));
  });

  it('rejects invalid date', () => {
    const v = validateProposal({
      summary: 'Bad date',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2026-13-40', start: '09:00', duration: 60, option: null, text: null },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-date')));
  });

  it('rejects invalid time', () => {
    const v = validateProposal({
      summary: 'Bad time',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '25:99', duration: 60, option: null, text: null },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-start')));
  });

  it('rejects duration < 5', () => {
    const v = validateProposal({
      summary: 'Too short',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: 3, option: null, text: null },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-duration')));
  });

  it('rejects duration > 480', () => {
    const v = validateProposal({
      summary: 'Too long',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: 500, option: null, text: null },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-duration')));
  });

  it('rejects invalid reschedule option', () => {
    const v = validateProposal({
      summary: 'Bad option',
      actions: [
        { type: 'reschedule_task', taskUid: 't1', option: 'never', date: null, start: null, duration: null, text: null },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-option')));
  });

  it('rejects empty next_action text', () => {
    const v = validateProposal({
      summary: 'Empty',
      actions: [
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: '' },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('text-invalid')));
  });

  it('rejects summary > 400 chars', () => {
    const v = validateProposal({
      summary: 'x'.repeat(401),
      actions: [],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('summary-invalid')));
  });

  it('rejects > 10 actions', () => {
    const v = validateProposal({
      summary: 'Too many',
      actions: Array.from({ length: 11 }, (_, i) => ({
        type: 'next_action', taskUid: null, date: null, start: null,
        duration: null, option: null, text: 'Action ' + i,
      })),
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('actions-invalid')));
  });

  it('rejects null proposal', () => {
    const v = validateProposal(null, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('proposal-not-object'));
  });

  it('rejects array proposal', () => {
    const v = validateProposal([], { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });
});

/* ================================================================
   SECTION 5: Agent Proposal Contract
   ================================================================ */

describe('Contract Eval: Agent Proposal Contracts', () => {
  it('valid create_task proposal passes', () => {
    const v = validateAgentProposal({
      summary: 'Create tasks',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'Học C# nâng cao', duration: 60 } },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true, JSON.stringify(v.errors));
  });

  it('valid multi-action proposal passes', () => {
    const v = validateAgentProposal({
      summary: 'Multi-action plan',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'New task' } },
        { id: 'a2', type: 'update_task', args: { taskRef: { kind: 'existing', uid: 't1' }, changes: { text: 'Updated' } } },
        { id: 'a3', type: 'complete_task', args: { taskRef: { kind: 'existing', uid: 't2' } } },
        { id: 'a4', type: 'schedule_task', args: { taskRef: { kind: 'existing', uid: 't3' }, date: '2026-08-22', start: '09:00', duration: 60 } },
        { id: 'a5', type: 'reschedule_task', args: { taskRef: { kind: 'existing', uid: 't4' }, date: '2026-08-22', start: '10:00', duration: 30 } },
      ],
    }, { taskUids: new Set(['t1', 't2', 't3', 't4']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true, JSON.stringify(v.errors));
  });

  it('all 5 action types are allowed', () => {
    assert.deepEqual(AGENT_ACTION_TYPES.sort(), ['create_task', 'update_task', 'complete_task', 'schedule_task', 'reschedule_task'].sort());
  });

  it('MAX_ACTIONS is 10', () => {
    assert.equal(AGENT_MAX_ACTIONS, 10);
  });

  it('MAX_TEXT is 300', () => {
    assert.equal(AGENT_MAX_TEXT, 300);
  });

  it('rejects unsupported action type', () => {
    const v = validateAgentProposal({
      summary: 'Bad',
      actions: [
        { id: 'a1', type: 'delete_all_tasks', args: {} },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('unknown-type') || e.includes('unsupported')));
  });

  it('rejects forbidden top-level field (token on action object)', () => {
    // Note: server checks AGENT_ALL_FIELDS for action-level keys, not args-level
    // token in args is silently ignored (stripped) — this is by design
    // Forbidden field check is client-side (agent.validateAction)
    // Server rejects unknown top-level fields on the action object itself
    const v = validateAgentProposal({
      summary: 'Leak',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'Task' }, token: 'Bearer abc' },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'Unknown top-level field on action should be rejected');
    assert.ok(v.errors.some(e => e.includes('unknown-field')), 'Error should mention unknown-field');
  });

  it('unknown fields in args are silently stripped (not rejected)', () => {
    // Server strips unknown args fields per action type allowlist
    const v = validateAgentProposal({
      summary: 'Strip test',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'Task', color: 'red' } },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true, 'Unknown args field should be stripped silently');
    // Server validates args per-type allowlist, so unknown args are ignored
    // The key test is that validation passes (ok: true)
  });

  it('rejects unknown task reference', () => {
    const v = validateAgentProposal({
      summary: 'Ghost',
      actions: [
        { id: 'a1', type: 'update_task', args: { taskRef: { kind: 'existing', uid: 'ghost' }, changes: { text: 'x' } } },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('unknown-task')));
  });

  it('rejects duration > 1440', () => {
    const v = validateAgentProposal({
      summary: 'Long',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'Task', duration: 9999 } },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-duration')));
  });

  it('rejects empty text in create_task (text-invalid)', () => {
    const v = validateAgentProposal({
      summary: 'Empty',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: '' } },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('text-invalid')));
  });

  it('rejects > 10 actions', () => {
    const v = validateAgentProposal({
      summary: 'Too many',
      actions: Array.from({ length: 11 }, (_, i) => ({
        id: 'a' + (i + 1), type: 'create_task', args: { text: 'Task ' + i },
      })),
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('actions-invalid')));
  });
});

/* ================================================================
   SECTION 6: File Agent Proposal Contract
   ================================================================ */

describe('Contract Eval: File Agent Proposal Contracts', () => {
  it('allows create_task', () => {
    const v = validateFileAgentProposal({
      summary: 'File extraction',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'Task from file' } },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true, JSON.stringify(v.errors));
  });

  it('allows schedule_task', () => {
    const v = validateFileAgentProposal({
      summary: 'Schedule from file',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'New task' } },
        { id: 'a2', type: 'schedule_task', args: { taskRef: { kind: 'action', actionId: 'a1' }, date: '2026-08-22', start: '09:00', duration: 60 } },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true, JSON.stringify(v.errors));
  });

  it('rejects update_task', () => {
    const v = validateFileAgentProposal({
      summary: 'Bad',
      actions: [
        { id: 'a1', type: 'update_task', args: { taskRef: { kind: 'existing', uid: 't1' }, changes: { text: 'x' } } },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('type-not-allowed-in-file-agent') || e.includes('unsupported')));
  });

  it('rejects complete_task', () => {
    const v = validateFileAgentProposal({
      summary: 'Bad',
      actions: [
        { id: 'a1', type: 'complete_task', args: { taskRef: { kind: 'existing', uid: 't1' } } },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('type-not-allowed-in-file-agent') || e.includes('unsupported')));
  });

  it('rejects reschedule_task', () => {
    const v = validateFileAgentProposal({
      summary: 'Bad',
      actions: [
        { id: 'a1', type: 'reschedule_task', args: { taskRef: { kind: 'existing', uid: 't1' }, date: '2026-08-22', start: '09:00', duration: 60 } },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('type-not-allowed-in-file-agent') || e.includes('unsupported')));
  });
});

/* ================================================================
   SECTION 7: Date Interpretation Contracts
   ================================================================ */

describe('Contract Eval: Date Interpretation', () => {
  it('validDate accepts YYYY-MM-DD', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: 60, option: null, text: null },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });

  it('validDate rejects 2026-13-40', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2026-13-40', start: '09:00', duration: 60, option: null, text: null },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-date')));
  });

  it('validDate rejects 2019-01-01 (before 2020 boundary)', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2019-01-01', start: '09:00', duration: 60, option: null, text: null },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-date')));
  });
});

/* ================================================================
   SECTION 8: Prompt Construction Contracts
   ================================================================ */

describe('Contract Eval: Prompt Construction', () => {
  it('Vietnamese prompt includes Vietnamese labels', () => {
    const { ctx } = sanitize({
      kind: 'plan_day',
      lang: 'vi',
      today: '2026-08-21',
      tasks: [{ uid: 't1', text: 'Test task' }],
    });
    const p = buildPrompt(ctx);
    assert.ok(p.user.includes('Lập kế hoạch'), 'Vietnamese label for plan_day');
    assert.ok(p.user.includes('"tasks"'), 'Context JSON has tasks');
  });

  it('English prompt includes English labels', () => {
    const { ctx } = sanitize({
      kind: 'next_actions',
      lang: 'en',
      today: '2026-08-21',
      tasks: [{ uid: 't1', text: 'Test task' }],
    });
    const p = buildPrompt(ctx);
    assert.ok(p.user.includes('Suggest next actions'), 'English label for next_actions');
  });

  it('context JSON does not contain unknown keys', () => {
    const { ctx } = sanitize({
      kind: 'plan_day',
      today: '2026-08-21',
      evilKey: 'should-not-appear',
      tasks: [],
    });
    const p = buildPrompt(ctx);
    assert.ok(!p.user.includes('evilKey'), 'Unknown key should not appear in prompt');
  });

  it('week plan includes week range', () => {
    const { ctx } = sanitize({
      kind: 'plan_week',
      lang: 'vi',
      today: '2026-08-21',
      weekStart: '2026-08-24',
      weekEnd: '2026-08-30',
      tasks: [],
    });
    const p = buildPrompt(ctx);
    assert.ok(p.user.includes('2026-08-24'), 'Week start in prompt');
    assert.ok(p.user.includes('2026-08-30'), 'Week end in prompt');
  });
});
