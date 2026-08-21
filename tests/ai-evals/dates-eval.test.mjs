/**
 * Phase 6R — Date/Time Contract Evaluation Tests
 *
 * Dedicated evaluation of date/time handling across TaskFlow AI contracts.
 * Tests valid/invalid dates, leap years, month/year/week boundaries,
 * time formats, durations, and reschedule options.
 *
 * Phase 6R.1: server/ai.js validDate now uses strict round-trip validation.
 * All impossible calendar dates (e.g. Feb 30, Apr 31) are now rejected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateProposal } from './helpers/eval-helpers.mjs';

/* ================================================================
   SECTION 1: Valid Date Formats
   ================================================================ */

describe('Date/Time Eval: Valid Date Formats', () => {
  const validDates = [
    '2026-01-01', '2026-06-15', '2026-12-31',
    '2027-02-28', '2028-02-29', // leap year
    '2029-03-01', '2030-04-30', '2031-10-01',
    '2040-07-04', '2050-12-25', '2099-12-31',
  ];

  for (const date of validDates) {
    it(`accepts valid date: ${date}`, () => {
      const v = validateProposal({
        summary: 'Plan',
        actions: [{ type: 'schedule_task', taskUid: 't1', date, start: '09:00', duration: 60, option: null, text: null }],
      }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
      assert.equal(v.ok, true, `Date ${date} should be accepted`);
    });
  }
});

/* ================================================================
   SECTION 2: Invalid Date Formats
   ================================================================ */

describe('Date/Time Eval: Invalid Date Formats', () => {
  const invalidDates = [
    { date: '2026-13-01', reason: 'month > 12' },
    { date: '2026-00-01', reason: 'month = 00' },
    { date: '2026-01-32', reason: 'day > 31' },
    { date: '2026-01-00', reason: 'day = 00' },
    { date: '2019-01-01', reason: 'before 2020 boundary' },
    { date: '1999-12-31', reason: 'before 2020 boundary' },
    { date: '2100-01-01', reason: 'after 2099 boundary' },
    { date: 'not-a-date', reason: 'not YYYY-MM-DD' },
    { date: '2026/01/01', reason: 'wrong separator' },
    { date: '01-01-2026', reason: 'wrong order' },
    { date: '', reason: 'empty string' },
    { date: '2026-1-1', reason: 'missing zero padding' },
    { date: '26-01-01', reason: '2-digit year' },
  ];

  for (const { date, reason } of invalidDates) {
    it(`rejects: ${date} (${reason})`, () => {
      const v = validateProposal({
        summary: 'Plan',
        actions: [{ type: 'schedule_task', taskUid: 't1', date, start: '09:00', duration: 60, option: null, text: null }],
      }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
      assert.equal(v.ok, false, `Date "${date}" should be rejected (${reason})`);
    });
  }
});

/* ================================================================
   SECTION 3: Server Date Roll-Over Limitation
   ================================================================ */

describe('Date/Time Eval: Strict Calendar Validation (6R.1 Fix)', () => {
  // Phase 6R.1: server/ai.js validDate now uses strict round-trip validation.
  // Impossible calendar dates are now REJECTED at the server level.

  it('Feb 30 rejected — not a valid calendar date', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-02-30', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'Feb 30 must be rejected by strict calendar validation');
  });

  it('April 31 rejected — not a valid calendar date', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-04-31', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'Apr 31 must be rejected by strict calendar validation');
  });

  it('June 31 rejected — not a valid calendar date', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-06-31', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'Jun 31 must be rejected');
  });

  it('September 31 rejected — not a valid calendar date', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-09-31', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'Sep 31 must be rejected');
  });

  it('November 31 rejected — not a valid calendar date', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-11-31', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'Nov 31 must be rejected');
  });

  it('2027-02-29 rejected — 2027 is not a leap year', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2027-02-29', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'Non-leap Feb 29 must be rejected');
  });

  it('2028-02-29 accepted — 2028 IS a leap year', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2028-02-29', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true, 'Leap year Feb 29 must be accepted');
  });

  it('2026-02-31 rejected — not a valid calendar date', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-02-31', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, 'Feb 31 must be rejected');
  });

  it('1900-02-29 rejected — outside TaskFlow year range', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '1900-02-29', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, '1900 is outside year range');
  });

  it('2000-02-29 accepted — 2000 is a leap year in range', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2000-02-29', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, '2000 is outside year range (2020-2099)');
  });
});

/* ================================================================
   SECTION 4: Leap Year Edge Cases
   ================================================================ */

describe('Date/Time Eval: Leap Year Edge Cases', () => {
  it('2028-02-29 is accepted (2028 is a leap year)', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2028-02-29', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });

  it('2028-02-28 is accepted (day before leap day)', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2028-02-28', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });

  it('2028-03-01 is accepted (day after leap day)', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2028-03-01', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });
});

/* ================================================================
   SECTION 5: Month/Year Boundaries
   ================================================================ */

describe('Date/Time Eval: Month/Year Boundaries', () => {
  it('2027-01-01 is accepted (year transition)', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2027-01-01', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true, '2027-01-01 should be accepted');
  });

  it('month transitions: Jan 31 → Feb 1', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-02-01', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });

  it('year transitions: 2099-12-31 is accepted', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2099-12-31', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });

  it('year transitions: 2100-01-01 is rejected (after boundary)', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2100-01-01', start: '09:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false, '2100-01-01 should be rejected');
  });
});

/* ================================================================
   SECTION 6: Invalid Time Formats
   ================================================================ */

describe('Date/Time Eval: Invalid Time Formats', () => {
  const invalidTimes = [
    { time: '25:00', reason: 'hour > 23' },
    { time: '24:01', reason: 'hour = 24 with minutes' },
    { time: '09:60', reason: 'minute > 59' },
    { time: '09:99', reason: 'minute = 99' },
    { time: '9:00', reason: 'missing zero pad' },
    { time: '006:00', reason: 'extra digit' },
    { time: 'abc', reason: 'not a time' },
    { time: '', reason: 'empty string' },
    { time: 'noon', reason: 'text not time' },
    { time: '09:00:00', reason: 'seconds included' },
  ];

  for (const { time, reason } of invalidTimes) {
    it(`rejects time: "${time}" (${reason})`, () => {
      const v = validateProposal({
        summary: 'Plan',
        actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: time, duration: 60, option: null, text: null }],
      }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
      assert.equal(v.ok, false, `Time "${time}" should be rejected (${reason})`);
    });
  }
});

/* ================================================================
   SECTION 7: Valid Time Formats
   ================================================================ */

describe('Date/Time Eval: Valid Time Formats', () => {
  const validTimes = [
    '00:00', '00:01', '00:30', '00:59',
    '01:00', '06:00', '08:30', '09:00', '12:00', '12:30',
    '13:00', '17:00', '18:30', '19:00', '20:00',
    '23:00', '23:30', '23:59',
  ];

  for (const time of validTimes) {
    it(`accepts valid time: ${time}`, () => {
      const v = validateProposal({
        summary: 'Plan',
        actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: time, duration: 60, option: null, text: null }],
      }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
      assert.equal(v.ok, true, `Time ${time} should be accepted`);
    });
  }
});

/* ================================================================
   SECTION 8: Time Boundary Values
   ================================================================ */

describe('Date/Time Eval: Time Boundary Values', () => {
  it('00:00 (midnight) is valid', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '00:00', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });

  it('23:59 (end of day) is valid', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '23:59', duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });

  it('null start is valid (no specific time)', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: null, duration: 60, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });
});

/* ================================================================
   SECTION 9: Duration Boundaries
   ================================================================ */

describe('Date/Time Eval: Duration Boundaries', () => {
  it('duration = 5 (minimum) is valid', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: 5, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });

  it('duration = 4 (below minimum) is rejected', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: 4, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });

  it('duration = 480 (maximum = 8h) is valid', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: 480, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });

  it('duration = 481 (above maximum) is rejected', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: 481, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });

  it('duration = 0 is rejected', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: 0, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });

  it('duration = -1 is rejected', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: -1, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });

  it('duration = null is valid (flexible)', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: null, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });

  it('duration = 1000 (way above max) is rejected', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-22', start: '09:00', duration: 1000, option: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });
});

/* ================================================================
   SECTION 10: Reschedule Options
   ================================================================ */

describe('Date/Time Eval: Reschedule Options', () => {
  it('valid: tomorrow', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'reschedule_task', taskUid: 't1', option: 'tomorrow', date: null, start: null, duration: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });

  it('valid: this-week', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'reschedule_task', taskUid: 't1', option: 'this-week', date: null, start: null, duration: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });

  it('valid: inbox', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'reschedule_task', taskUid: 't1', option: 'inbox', date: null, start: null, duration: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, true);
  });

  it('invalid: never', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'reschedule_task', taskUid: 't1', option: 'never', date: null, start: null, duration: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });

  it('invalid: next-month', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'reschedule_task', taskUid: 't1', option: 'next-month', date: null, start: null, duration: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });

  it('invalid: delete', () => {
    const v = validateProposal({
      summary: 'Plan',
      actions: [{ type: 'reschedule_task', taskUid: 't1', option: 'delete', date: null, start: null, duration: null, text: null }],
    }, { taskUids: new Set(['t1']), projectIds: new Set(), milestoneIds: new Set() });
    assert.equal(v.ok, false);
  });
});
