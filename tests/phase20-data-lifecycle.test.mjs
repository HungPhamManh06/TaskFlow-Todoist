import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/snapshot-v1.json', import.meta.url), 'utf8'));

function storage(seed = {}, failOnKey = '') {
  const data = new Map(Object.entries(seed));
  return {
    get length() { return data.size; },
    key(i) { return [...data.keys()][i] ?? null; },
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { if (k === failOnKey) throw new Error('quota'); data.set(k, String(v)); },
    removeItem(k) { data.delete(k); },
    dump() { return Object.fromEntries(data); },
  };
}

test('v1 migration preserves IDs, links, logs, reflections and unknown fields', () => {
  const M = require('../js/data-migrations.js');
  const migrated = M.migrateSnapshot(fixture);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.futureSnapshotField, { kept: true });
  const month = JSON.parse(migrated.keys['planner-2026-8']);
  assert.equal(month.schemaVersion, 2);
  assert.equal(month.futureMonthField.kept, true);
  assert.equal(month.monthlyGoals[0].id, 'goal-old');
  assert.deepEqual(month.habits[0].linkedMetricIds, ['metric-habit']);
  assert.deepEqual(month.weeks[0].days[0].tasks[0].linkedMetricIds, ['metric-task']);
  assert.deepEqual(month.weeks[0].days[0].tasks[0].focusLog, [{ minutes: 25 }]);
  assert.equal(month.reflections.overview[0], 'Kept reflection');
  const daily = JSON.parse(migrated.keys['planner-reflections-daily']);
  assert.equal(daily['2026-08-01'].futureEntryField, true);
});

test('month, reflection and snapshot migrations are pure and idempotent', () => {
  const M = require('../js/data-migrations.js');
  const raw = JSON.parse(fixture.keys['planner-2026-8']);
  const once = M.migrateMonthState(raw, { year: 2026, month: 8 });
  const twice = M.migrateMonthState(once, { year: 2026, month: 8 });
  assert.deepEqual(twice, once);
  assert.notEqual(once, raw);
  assert.deepEqual(M.migrateSnapshot(M.migrateSnapshot(fixture)), M.migrateSnapshot(fixture));
});

test('known malformed structures normalize without deleting future fields', () => {
  const M = require('../js/data-migrations.js');
  const month = M.migrateMonthState({ monthlyGoals: 'bad', habits: null, weeks: {}, future: 7 });
  assert.deepEqual(month.monthlyGoals, []);
  assert.deepEqual(month.habits, []);
  assert.deepEqual(month.weeks, []);
  assert.equal(month.future, 7);
});

test('validation rejects malformed, foreign and future snapshots', () => {
  const M = require('../js/data-migrations.js');
  assert.equal(M.validateSnapshot(null).ok, false);
  assert.equal(M.validateSnapshot({ app: 'other', version: 1, keys: {} }).ok, false);
  const future = M.validateSnapshot({ app: 'taskflow-todoist', version: 3, keys: {} });
  assert.equal(future.ok, false);
  assert.ok(future.errors.includes('unsupported-version'));
  assert.equal(M.validateSnapshot({ app: 'taskflow-todoist', version: 2, keys: { bad: '{}' } }).ok, false);
});

test('collectAllData exports every planner key and legacy key exactly once as v2', () => {
  global.localStorage = storage({
    'planner-2026-8': '{"monthlyGoals":[]}',
    'planner-reflections-daily': '{}',
    'january-planner-2026': '{"legacy":true}',
    unrelated: 'no',
  });
  const E = require('../js/export.js');
  const snapshot = E.collectAllData('january-planner-2026');
  assert.equal(snapshot.version, 2);
  assert.deepEqual(Object.keys(snapshot.keys).sort(), ['january-planner-2026', 'planner-2026-8', 'planner-reflections-daily']);
});

test('prepareImport migrates v1 and provides preview metadata', () => {
  const E = require('../js/export.js');
  const result = E.prepareImport(JSON.stringify(fixture));
  assert.equal(result.ok, true);
  assert.equal(result.preview.fromVersion, 1);
  assert.equal(result.preview.toVersion, 2);
  assert.equal(result.preview.keyCount, 4);
  assert.equal(result.snapshot.version, 2);
});

test('prepareImport rejects future snapshots with an explicit error', () => {
  const E = require('../js/export.js');
  const result = E.prepareImport(JSON.stringify({ app: 'taskflow-todoist', version: 9, keys: {} }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('unsupported-version'));
});

test('transactional import rolls back every touched key after storage failure', () => {
  const E = require('../js/export.js');
  const s = storage({ 'planner-a': 'old-a', 'planner-c': 'old-c' }, 'planner-b');
  const before = s.dump();
  const result = E.applySnapshotTransactional({
    app: 'taskflow-todoist', version: 2,
    keys: { 'planner-a': 'new-a', 'planner-b': 'new-b', 'planner-c': 'new-c' },
  }, s);
  assert.equal(result.ok, false);
  assert.deepEqual(s.dump(), before);
});

test('P10 production assets and privacy copy are registered', () => {
  const html = fs.readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const i18n = fs.readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
  assert.match(html, /js\/data-migrations\.min\.js\?v=1/);
  assert.match(sw, /js\/data-migrations\.min\.js/);
  assert.match(i18n, /syncPrivacy/);
  assert.match(i18n, /last-write-wins/i);
});

test('P10 focused E2E is registered in the release matrix', () => {
  const e2e = fs.readFileSync(new URL('../scripts/e2e-frontend.py', import.meta.url), 'utf8');
  assert.match(e2e, /def data_lifecycle_checks\(/);
  assert.match(e2e, /\("data-lifecycle", data_lifecycle_checks\)/);
  assert.match(e2e, /E2E DATA-LIFECYCLE OK/);
});
