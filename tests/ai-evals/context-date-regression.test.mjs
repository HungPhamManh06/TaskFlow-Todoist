/**
 * Phase 6R.2 — Context Date Regression Tests
 *
 * Proves that sanitizeContext rejects impossible dates in ALL date fields:
 * today, weekStart, weekEnd, tasks.deadline, milestones.targetDate,
 * timeblocks.date, overdue.deadline, reflections.date, mood.date.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const ai = require(require('path').join(ROOT, 'server', 'ai.js'));

/* ================================================================
   SECTION 1: Top-Level Date Fields
   ================================================================ */

describe('Context Date Regression: Top-Level Fields', () => {
  it('today: "2026-02-30" → empty', () => {
    const { ctx } = ai.sanitizeContext({ kind: 'plan_day', today: '2026-02-30' });
    assert.equal(ctx.today, '');
  });

  it('today: "2026-04-31" → empty', () => {
    const { ctx } = ai.sanitizeContext({ kind: 'plan_day', today: '2026-04-31' });
    assert.equal(ctx.today, '');
  });

  it('today: "2027-02-29" → empty (non-leap)', () => {
    const { ctx } = ai.sanitizeContext({ kind: 'plan_day', today: '2027-02-29' });
    assert.equal(ctx.today, '');
  });

  it('today: "2028-02-29" → preserved (leap year)', () => {
    const { ctx } = ai.sanitizeContext({ kind: 'plan_day', today: '2028-02-29' });
    assert.equal(ctx.today, '2028-02-29');
  });

  it('today: "2026-08-21" → preserved (valid)', () => {
    const { ctx } = ai.sanitizeContext({ kind: 'plan_day', today: '2026-08-21' });
    assert.equal(ctx.today, '2026-08-21');
  });

  it('weekStart: "2026-02-30" → empty', () => {
    const { ctx } = ai.sanitizeContext({ kind: 'plan_week', weekStart: '2026-02-30' });
    assert.equal(ctx.weekStart, '');
  });

  it('weekEnd: "2026-04-31" → empty', () => {
    const { ctx } = ai.sanitizeContext({ kind: 'plan_week', weekEnd: '2026-04-31' });
    assert.equal(ctx.weekEnd, '');
  });
});

/* ================================================================
   SECTION 2: Context Item Date Fields
   ================================================================ */

describe('Context Date Regression: Item Fields', () => {
  it('tasks.deadline: "2026-02-30" → null', () => {
    const { ctx } = ai.sanitizeContext({
      kind: 'plan_day', today: '2026-08-21',
      tasks: [{ uid: 't1', text: 'Task', deadline: '2026-02-30' }],
    });
    assert.equal(ctx.tasks[0].deadline, null);
  });

  it('tasks.deadline: "2028-02-29" → preserved (leap)', () => {
    const { ctx } = ai.sanitizeContext({
      kind: 'plan_day', today: '2026-08-21',
      tasks: [{ uid: 't1', text: 'Task', deadline: '2028-02-29' }],
    });
    assert.equal(ctx.tasks[0].deadline, '2028-02-29');
  });

  it('milestones.targetDate: "2026-04-31" → null', () => {
    const { ctx } = ai.sanitizeContext({
      kind: 'plan_day', today: '2026-08-21',
      milestones: [{ id: 'm1', targetDate: '2026-04-31' }],
    });
    assert.equal(ctx.milestones[0].targetDate, null);
  });

  it('timeblocks.date: "2026-06-31" → null', () => {
    const { ctx } = ai.sanitizeContext({
      kind: 'plan_day', today: '2026-08-21',
      timeblocks: [{ id: 'b1', date: '2026-06-31', start: '09:00', end: '10:00', status: 'scheduled' }],
    });
    assert.equal(ctx.timeblocks[0].date, null);
  });

  it('overdue.deadline: "2027-02-29" → null', () => {
    const { ctx } = ai.sanitizeContext({
      kind: 'plan_day', today: '2026-08-21',
      overdue: [{ uid: 'to1', text: 'Overdue', deadline: '2027-02-29' }],
    });
    assert.equal(ctx.overdue[0].deadline, null);
  });
});

/* ================================================================
   SECTION 3: Reflection/Mood Dates
   ================================================================ */

describe('Context Date Regression: Sensitive Dates', () => {
  it('reflections.date: "2026-02-30" → empty', () => {
    const { ctx } = ai.sanitizeContext({
      kind: 'plan_day', today: '2026-08-21',
      allowSensitive: true,
      reflections: [{ date: '2026-02-30', text: 'Hello' }],
    });
    assert.equal(ctx.reflections[0].date, '');
  });

  it('mood.date: "2026-04-31" → empty', () => {
    const { ctx } = ai.sanitizeContext({
      kind: 'plan_day', today: '2026-08-21',
      allowSensitive: true,
      mood: [{ date: '2026-04-31', value: 4 }],
    });
    assert.equal(ctx.mood[0].date, '');
  });

  it('reflections.date: "2028-02-29" → preserved (leap)', () => {
    const { ctx } = ai.sanitizeContext({
      kind: 'plan_day', today: '2026-08-21',
      allowSensitive: true,
      reflections: [{ date: '2028-02-29', text: 'Hello' }],
    });
    assert.equal(ctx.reflections[0].date, '2028-02-29');
  });

  it('mood.date: "2028-02-29" → preserved (leap)', () => {
    const { ctx } = ai.sanitizeContext({
      kind: 'plan_day', today: '2026-08-21',
      allowSensitive: true,
      mood: [{ date: '2028-02-29', value: 4 }],
    });
    assert.equal(ctx.mood[0].date, '2028-02-29');
  });

  it('reflections remain excluded without allowSensitive', () => {
    const { ctx } = ai.sanitizeContext({
      kind: 'plan_day', today: '2026-08-21',
      reflections: [{ date: '2026-08-21', text: 'Private' }],
    });
    assert.equal(ctx.reflections, undefined);
  });
});

/* ================================================================
   SECTION 4: Valid Dates Still Work
   ================================================================ */

describe('Context Date Regression: Valid Dates Preserved', () => {
  const validDates = [
    '2026-01-01', '2026-04-30', '2026-06-30', '2026-09-30',
    '2026-11-30', '2026-12-31', '2028-02-29', '2099-12-31',
  ];

  for (const date of validDates) {
    it(`today "${date}" is preserved`, () => {
      const { ctx } = ai.sanitizeContext({ kind: 'plan_day', today: date });
      assert.equal(ctx.today, date);
    });
  }
});
