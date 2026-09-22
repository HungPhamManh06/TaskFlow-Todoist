/**
 * Clock-seam proof (Lớp 3 — P3.2).
 *
 * The 2026-09-20 CI failure was not a bug in the product: fixtures pinned to
 * the literal date 2026-09-10 rotted the moment the wall clock passed them.
 * These tests prove the *behaviour* under test is clock-relative by running it
 * against two clocks on opposite sides of the fixture era (2019 and 2031) —
 * something hardcoded dates can never do.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { isoDate, localISODate, todayISO, frozenDate } from './helpers/clock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FROZEN_DAYS = ['2019-01-15', '2026-09-20', '2031-07-04'];

function baseDay(iso) {
  return new Date(`${iso}T12:00:00`);
}

/* ===========================================================
   1. THE HELPERS THEMSELVES
   =========================================================== */
describe('clock helpers: isoDate / frozenDate', () => {
  it('shifts across month and year boundaries (local time, never UTC)', () => {
    assert.equal(isoDate(0, new Date(2026, 11, 31)), '2026-12-31');
    assert.equal(isoDate(1, new Date(2026, 11, 31)), '2027-01-01');
    assert.equal(isoDate(-1, new Date(2026, 0, 1)), '2025-12-31');
    assert.equal(isoDate(31, new Date(2026, 0, 15)), '2026-02-15');
  });

  it('todayISO matches the local date, not the UTC date', () => {
    assert.equal(todayISO(), localISODate(new Date()));
  });

  it('frozenDate pins new Date() and Date.now(), and still parses arguments', () => {
    const FrozenDate = frozenDate('2031-07-04');
    const now = new FrozenDate();
    assert.equal(localISODate(now), '2031-07-04');
    assert.equal(new FrozenDate().getTime(), new FrozenDate().getTime());
    assert.equal(FrozenDate.now(), new FrozenDate().getTime());
    // Argument-taking forms must behave exactly like the real Date.
    assert.equal(new FrozenDate('2020-01-02T00:00:00').getFullYear(), 2020);
    assert.ok(new FrozenDate() instanceof Date);
  });

  it('frozenDate rejects a non-ISO string instead of silently freezing to NaN', () => {
    assert.throws(() => frozenDate('not-a-date'), TypeError);
  });
});

/* ===========================================================
   2. get_tasks FILTERS UNDER TWO OPPOSITE CLOCKS
   =========================================================== */
describe('clock seam: get_tasks filters are clock-relative', () => {
  const toolsSource = readFileSync(join(ROOT, 'js', 'ai-tools.js'), 'utf8');

  function toolsAt(frozenISO) {
    const day = baseDay(frozenISO);
    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      state: {
        weeks: [{
          week: 1,
          days: [{
            day: 1,
            tasks: [
              { uid: 'today', text: 'hôm nay', done: false, deadline: frozenISO },
              { uid: 'overdue', text: 'quá hạn', done: false, deadline: isoDate(-3, day) },
              { uid: 'upcoming', text: 'sắp tới', done: false, deadline: isoDate(3, day) },
            ],
          }],
        }],
      },
      TaskFlowI18N: { t: (k) => k },
      Date: frozenDate(frozenISO),
      JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(toolsSource, sandbox);
    return sandbox.TaskFlowAITools;
  }

  for (const frozenISO of FROZEN_DAYS) {
    it(`filters stay correct with the clock frozen at ${frozenISO}`, () => {
      const tools = toolsAt(frozenISO);
      // Spread into a local array: values built inside the vm realm carry that
      // realm's Array.prototype, which deepStrictEqual rejects on prototype.
      const uids = (filter) => [...tools.getTool('get_tasks').execute({ filter }).tasks.map((t) => t.uid)];
      assert.deepEqual(uids('today'), ['today'], 'today = exactly the frozen day');
      assert.deepEqual(uids('overdue'), ['overdue'], 'overdue = strictly before the frozen day');
      assert.deepEqual(uids('upcoming'), ['upcoming'], 'upcoming = strictly after the frozen day');
    });
  }
});

/* ===========================================================
   3. runWindow CLAMP UNDER TWO OPPOSITE CLOCKS
   =========================================================== */
describe('clock seam: runWindow clamps past startDate to the injected today', () => {
  const planSource = readFileSync(join(ROOT, 'js', 'ai-document-daily-plan.js'), 'utf8');

  function runWindowAt(frozenISO, startDate) {
    let capturedBody = null;
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
        capturedBody = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => ({ ok: true, proposal: { summary: 'P', actions: [] }, meta: { daysGenerated: 7 } }) };
      },
      TaskFlowAIAgentRuntime: { buildContext: () => ({ tasks: [] }) },
      TaskFlowI18N: { getLang: () => 'vi' },
      Date: frozenDate(frozenISO),
      JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(planSource, sandbox);
    const api = sandbox.TaskFlowDocumentDailyPlan;
    const day = baseDay(frozenISO);
    api.saveRoadmap({
      id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1', documentName: 'test.pdf',
      createdAt: Date.now(), updatedAt: Date.now(),
      roadmap: { title: 'Test', phases: [] }, baseDate: isoDate(14, day),
      cursor: { nextWeek: 1, lastAppliedStartDate: isoDate(14, day), lastAppliedDaysCount: 7 },
    });
    return api.runWindow({ startDate, daysCount: 5 }, {}).then(() => capturedBody);
  }

  for (const frozenISO of FROZEN_DAYS) {
    it(`keeps a future startDate, clamps a past one (frozen ${frozenISO})`, async () => {
      const day = baseDay(frozenISO);
      const future = isoDate(3, day);
      const past = isoDate(-3, day);

      const kept = await runWindowAt(frozenISO, future);
      assert.equal(kept.startDate, future, 'future startDate passes through unchanged');
      assert.equal(kept.daysCount, 5, 'daysCount passes through unchanged');

      const clamped = await runWindowAt(frozenISO, past);
      assert.equal(clamped.startDate, frozenISO, 'past startDate is clamped to the injected today');
    });
  }
});
