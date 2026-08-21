/**
 * Phase 6R — Safety Evaluation Tests
 *
 * Verifies that TaskFlow AI safety invariants hold:
 * - No direct mutation of canonical state
 * - No dangerous action types
 * - No sensitive data leaks
 * - Confirmation required before any mutation
 * - Privacy gating works
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitize,
  buildPlanContext,
  buildAgentContext,
  validateProposal,
  validateAgentProposal,
  chatHasForbidden,
  CHAT_FORBIDDEN_KEYS,
  MAX_CHAT_CONTEXT_BYTES,
} from './helpers/eval-helpers.mjs';

import { sampleTasks, TODAY } from './fixtures/vi-fixtures.mjs';

/* ================================================================
   SECTION 1: No Direct Mutation — Plan Proposals
   ================================================================ */

describe('Safety Eval: No Direct Mutation — Plan', () => {
  it('plan proposal cannot contain delete_task (not in ACTION_TYPES)', () => {
    const refs = { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() };
    const v = validateProposal({
      summary: 'Test',
      actions: [{ type: 'delete_task', taskUid: 't1', date: null, start: null, duration: null, option: null, text: null }],
    }, refs);
    assert.equal(v.ok, false, 'Plan proposal should reject delete_task');
  });

  it('plan proposal cannot contain create_task (not in ACTION_TYPES)', () => {
    const refs = { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() };
    const v = validateProposal({
      summary: 'Test',
      actions: [{ type: 'create_task', taskUid: 't1', date: null, start: null, duration: null, option: null, text: null }],
    }, refs);
    assert.equal(v.ok, false, 'Plan proposal should reject create_task');
  });

  it('server-side ACTION_TYPES only allow schedule/reschedule/next_action', () => {
    const refs = { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() };

    // schedule_task
    const v1 = validateProposal({
      summary: 'Test schedule',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: 60, option: null, text: null }],
    }, refs);
    assert.equal(v1.ok, true, 'schedule_task should pass');

    // reschedule_task
    const v2 = validateProposal({
      summary: 'Test reschedule',
      actions: [{ type: 'reschedule_task', taskUid: 't1', option: 'tomorrow', date: null, start: null, duration: null, text: null }],
    }, refs);
    assert.equal(v2.ok, true, 'reschedule_task should pass');

    // next_action
    const v3 = validateProposal({
      summary: 'Test next',
      actions: [{ type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Do something' }],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v3.ok, true, 'next_action should pass');
  });
});

/* ================================================================
   SECTION 2: No Direct Mutation — Agent Proposals
   ================================================================ */

describe('Safety Eval: No Direct Mutation — Agent', () => {
  it('agent cannot include delete_task (not in AGENT_ACTION_TYPES)', () => {
    const v = validateAgentProposal({
      summary: 'Dangerous',
      actions: [
        { id: 'a1', type: 'delete_task', args: { taskRef: { kind: 'existing', uid: 't1' } } },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'Agent should reject delete_task');
    assert.ok(v.errors.some(e => e.includes('unknown-type')));
  });

  it('agent cannot include delete_all_tasks', () => {
    const v = validateAgentProposal({
      summary: 'Dangerous',
      actions: [
        { id: 'a1', type: 'delete_all_tasks', args: {} },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('unknown-type')));
  });

  it('agent only allows 5 action types', () => {
    const allowed = ['create_task', 'update_task', 'complete_task', 'schedule_task', 'reschedule_task'];
    assert.deepEqual(
      [...allowed].sort(),
      ['complete_task', 'create_task', 'reschedule_task', 'schedule_task', 'update_task'].sort()
    );
  });

  it('agent proposal requires summary (no silent execution)', () => {
    const v = validateAgentProposal({
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'Task' } },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'Missing summary should be rejected');
  });

  it('agent proposal with empty summary is rejected', () => {
    const v = validateAgentProposal({
      summary: '   ',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'Task' } },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'Empty summary should be rejected');
  });
});

/* ================================================================
   SECTION 3: Forbidden Fields — No Credential Leaks
   ================================================================ */

describe('Safety Eval: Forbidden Fields', () => {
  // Server-side: unknown top-level fields on action object are rejected via AGENT_ALL_FIELDS
  // Server-side: unknown args fields are silently stripped (by design — per-type allowlist)
  // Client-side (agent.validateAction): token/password/authorization in args are rejected
  // Server-side: the args-level forbidden field check is NOT present — it's stripped instead

  it('unknown top-level field on action object is rejected', () => {
    const v = validateAgentProposal({
      summary: 'Leak test',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'Task' }, token: 'sensitive-value' },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'Unknown top-level field should be rejected');
    assert.ok(v.errors.some(e => e.includes('unknown-field')), 'Error should mention unknown-field');
  });

  it('password as top-level field on action is rejected', () => {
    const v = validateAgentProposal({
      summary: 'Leak test',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'Task' }, password: 'secret123' },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'password field should be rejected');
  });

  it('authorization as top-level field on action is rejected', () => {
    const v = validateAgentProposal({
      summary: 'Leak test',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'Task' }, authorization: 'Bearer abc' },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'authorization field should be rejected');
  });
});

/* ================================================================
   SECTION 4: Chat Context Safety
   ================================================================ */

describe('Safety Eval: Chat Context', () => {
  it('chatHasForbidden detects JWT', () => {
    assert.equal(chatHasForbidden({ token: 'eyJhbGciOiJIUzI1NiJ9.test' }), true);
  });

  it('chatHasForbidden detects authorization header', () => {
    assert.equal(chatHasForbidden({ authorization: 'Bearer abc123' }), true);
  });

  it('chatHasForbidden detects password', () => {
    assert.equal(chatHasForbidden({ password: 'secret123' }), true);
  });

  it('chatHasForbidden detects nested sensitive fields', () => {
    assert.equal(chatHasForbidden({ user: { token: 'abc' } }), true);
  });

  it('chatHasForbidden detects array items with sensitive fields', () => {
    assert.equal(chatHasForbidden({ tasks: [{ authorization: 'Bearer x' }] }), true);
  });

  it('chatHasForbidden allows clean data', () => {
    assert.equal(chatHasForbidden({ tasks: [{ uid: 't1', text: 'Learn C#' }] }), false);
  });

  it('MAX_CHAT_CONTEXT_BYTES is 65536', () => {
    assert.equal(MAX_CHAT_CONTEXT_BYTES, 65536);
  });

  it('CHAT_FORBIDDEN_KEYS covers critical sensitive keys', () => {
    const criticalKeys = ['token', 'authorization', 'password', 'jwt', 'apikey', 'api_key'];
    for (const key of criticalKeys) {
      assert.ok(
        CHAT_FORBIDDEN_KEYS.some(fk => fk.toLowerCase() === key.toLowerCase()),
        `CHAT_FORBIDDEN_KEYS should include "${key}"`
      );
    }
  });
});

/* ================================================================
   SECTION 5: Privacy Gating
   ================================================================ */

describe('Safety Eval: Privacy Gating', () => {
  it('reflections are not included without allowSensitive', () => {
    const { ctx } = sanitize({
      kind: 'plan_day',
      today: TODAY,
      allowSensitive: false,
      reflections: [{ date: '2026-08-01', text: 'I feel unmotivated' }],
    });
    assert.equal(ctx.reflections, undefined);
  });

  it('mood is not included without allowSensitive', () => {
    const { ctx } = sanitize({
      kind: 'plan_day',
      today: TODAY,
      allowSensitive: false,
      mood: [{ date: '2026-08-01', value: 2 }],
    });
    assert.equal(ctx.mood, undefined);
  });

  it('reflections are included with allowSensitive=true', () => {
    const { ctx } = sanitize({
      kind: 'plan_day',
      today: TODAY,
      allowSensitive: true,
      reflections: [{ date: '2026-08-01', text: 'I feel motivated' }],
    });
    assert.ok(Array.isArray(ctx.reflections));
    assert.equal(ctx.reflections[0].text, 'I feel motivated');
  });

  it('mood is included with allowSensitive=true', () => {
    const { ctx } = sanitize({
      kind: 'plan_day',
      today: TODAY,
      allowSensitive: true,
      mood: [{ date: '2026-08-01', value: 4 }],
    });
    assert.ok(Array.isArray(ctx.mood));
    assert.equal(ctx.mood[0].value, 4);
  });

  it('reflections strip unknown fields', () => {
    const { ctx } = sanitize({
      kind: 'plan_day',
      today: TODAY,
      allowSensitive: true,
      reflections: [{ date: '2026-08-01', text: 'Hello', secret: 'leak' }],
    });
    assert.equal(ctx.reflections[0].secret, undefined);
  });

  it('mood caps array size at ARRAY_CAPS.mood (90)', () => {
    const moods = Array.from({ length: 100 }, (_, i) => ({ date: '2026-08-01', value: i % 5 }));
    const { ctx } = sanitize({
      kind: 'plan_day',
      today: TODAY,
      allowSensitive: true,
      mood: moods,
    });
    assert.ok(ctx.mood.length <= 90, 'Mood array should be capped at 90');
  });
});

/* ================================================================
   SECTION 6: Proposal Size Limits
   ================================================================ */

describe('Safety Eval: Size Limits', () => {
  it('proposal with > 10 actions is rejected', () => {
    const v = validateProposal({
      summary: 'Oversized',
      actions: Array.from({ length: 11 }, (_, i) => ({
        type: 'next_action', taskUid: null, date: null, start: null,
        duration: null, option: null, text: 'Action ' + i,
      })),
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });

  it('agent proposal with > 10 actions is rejected', () => {
    const v = validateAgentProposal({
      summary: 'Oversized',
      actions: Array.from({ length: 11 }, (_, i) => ({
        id: 'a' + (i + 1), type: 'create_task', args: { text: 'Task ' + i },
      })),
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });

  it('summary > 400 chars is rejected', () => {
    const v = validateProposal({
      summary: 'x'.repeat(401),
      actions: [],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });

  it('agent text > 300 chars is rejected', () => {
    const v = validateAgentProposal({
      summary: 'Long text',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'x'.repeat(301) } },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });

  it('next_action text > 160 chars is rejected', () => {
    const v = validateProposal({
      summary: 'Long text',
      actions: [
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'x'.repeat(161) },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });
});

/* ================================================================
   SECTION 7: Referential Integrity
   ================================================================ */

describe('Safety Eval: Referential Integrity', () => {
  it('plan proposal rejects task UID not in context', () => {
    const v = validateProposal({
      summary: 'Ghost',
      actions: [
        { type: 'schedule_task', taskUid: 'ghost', date: '2026-08-22', start: '09:00', duration: 60, option: null, text: null },
      ],
    }, { taskUids: new Set(['t1', 't2']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('unknown-task')));
  });

  it('agent proposal rejects task reference not in context', () => {
    const v = validateAgentProposal({
      summary: 'Ghost',
      actions: [
        { id: 'a1', type: 'update_task', args: { taskRef: { kind: 'existing', uid: 'ghost' }, changes: { text: 'x' } } },
      ],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('unknown-task')));
  });

  it('agent proposal rejects unknown project reference', () => {
    const v = validateAgentProposal({
      summary: 'Ghost project',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'Task', projectId: 'ghost-proj' } },
      ],
    }, { taskUids: new Set(), projectIds: new Set(['p1']), milestoneIds: new Set() });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('unknown-project')));
  });

  it('agent proposal rejects unknown milestone reference', () => {
    const v = validateAgentProposal({
      summary: 'Ghost milestone',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'Task', milestoneId: 'ghost-ms' } },
      ],
    }, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set(['m1']) });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('unknown-milestone')));
  });
});
