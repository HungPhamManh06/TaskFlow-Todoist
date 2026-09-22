/**
 * Shared clock fixtures for date-sensitive tests (Lớp 3 — P3.2).
 *
 * Why this file exists: `tests/ai-brain-runtime-bridge.test.mjs` hardcoded
 * `2026-09-10` as "today". Once the wall clock passed that date, `runWindow()`
 * started clamping the past startDate to today and the `overdue` filter started
 * treating the fixture as overdue — CI went red on a commit that had nothing to
 * do with either behaviour. Any test that compares a date with "now" must
 * therefore either (a) derive the date from the clock, or (b) inject a frozen
 * clock. Never a literal calendar date.
 *
 * Usage:
 *   import { isoDate, todayISO, frozenDate } from './helpers/clock.mjs';
 *
 *   isoDate(0)                    // today, local
 *   isoDate(-30)                  // 30 days ago
 *   isoDate(1, new Date(2026, 11, 31))  // '2027-01-01' — deterministic base
 *
 *   // Freeze the sandbox clock so the behaviour is provable on any day:
 *   const sandbox = { Date: frozenDate('2031-07-04'), ... };
 */

/** Local-time ISO date (YYYY-MM-DD) shifted by `offsetDays` from `base`. */
export function isoDate(offsetDays = 0, base = new Date()) {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + offsetDays);
  return localISODate(d);
}

/** Format a Date as YYYY-MM-DD in LOCAL time (never toISOString — UTC shifts the day). */
export function localISODate(date) {
  return (
    date.getFullYear() +
    '-' + String(date.getMonth() + 1).padStart(2, '0') +
    '-' + String(date.getDate()).padStart(2, '0')
  );
}

/** Today as YYYY-MM-DD (local). */
export function todayISO() {
  return localISODate(new Date());
}

/**
 * A `Date` replacement pinned to `iso` at `hour` local time. `new Date()` and
 * `Date.now()` return the frozen instant; every argument-taking form still
 * behaves like the real Date, so parsing fixtures keep working.
 */
export function frozenDate(iso, hour = 12) {
  const RealDate = Date;
  const stamp = new RealDate(`${iso}T${String(hour).padStart(2, '0')}:00:00`).getTime();
  if (Number.isNaN(stamp)) {
    throw new TypeError(`frozenDate: "${iso}" is not a valid ISO date`);
  }
  return class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(stamp);
      else super(...args);
    }

    static now() {
      return stamp;
    }
  };
}
