import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const contracts = require(join(ROOT, 'server', 'ai-tool-contracts.js'));

test('get_tasks canonical output accepts nullables and rejects extra nested fields', () => {
  const valid = { tasks: [{ uid:'task-1', text:'GPIO', done:false, deadline:null, scheduledDate:'2026-08-25', duration:null }], total:1 };
  assert.equal(contracts.validateToolResult('get_tasks', valid).ok, true);
  assert.equal(contracts.validateToolResult('get_tasks', { ...valid, tasks:[{ ...valid.tasks[0], password:'secret' }] }).ok, false);
});

test('proposal result envelope preserves success and permits safe failure', () => {
  assert.equal(contracts.validateToolResult('propose_complete_task', { ok:true, proposal:{ summary:'done', actions:[] } }).ok, true);
  assert.equal(contracts.validateToolResult('propose_complete_task', { ok:false, code:'stale-task' }).ok, true);
});

test('invalid calendar dates are rejected by deep result validator', () => {
  const result = contracts.validateToolResult('get_free_time', { busy:[{ date:'2026-99-99', startMs:1, endMs:2, source:'gcal' }], startDate:'2026-08-24', daysCount:1 });
  assert.equal(result.ok, false);
});

test('browser task sanitizer emits exact canonical fields including scheduledDate', () => {
  const brainClient = require(join(ROOT, 'js', 'ai-brain-client.js'));
  const out = brainClient._sanitizeToolResult('get_tasks', { tasks:[{ uid:'task-1', text:'GPIO', done:false, deadline:null, scheduledDate:'2026-08-25', duration:null, priority:1, projectId:'p1', password:'secret' }], total:1 });
  assert.deepEqual(Object.keys(out.tasks[0]).sort(), ['deadline','done','duration','scheduledDate','text','uid'].sort());
  assert.equal(contracts.validateToolResult('get_tasks', out).ok, true);
});

test('generated browser contracts drive propose_create_task argument validation', () => {
  globalThis.window = globalThis;
  globalThis.TaskFlowAIToolContracts = require(join(ROOT, 'js', 'ai-tool-contracts.generated.js'));
  delete require.cache[require.resolve(join(ROOT, 'js', 'ai-tools.js'))];
  const tools = require(join(ROOT, 'js', 'ai-tools.js'));
  assert.ok(tools.getTool('propose_create_task').inputSchema.properties.projectId);
  assert.equal(tools.validateArgs('propose_create_task', { text:'API', projectId:'p1' }).ok, true);
});

test('get_free_time reads canonical TaskFlowTimeBlocks blocks store', async () => {
  globalThis.window = globalThis;
  globalThis.TaskFlowAIToolContracts = require(join(ROOT, 'js', 'ai-tool-contracts.generated.js'));
  globalThis.TaskFlowGCal = null;
  globalThis.TaskFlowTimeBlocks = { loadTimeBlocks: () => ({ version:1, blocks:[
    { id:'b1', date:'2026-08-25', start:'09:00', end:'10:00', status:'planned' },
    { id:'b2', date:'2026-08-25', start:'11:00', end:'12:00', status:'cancelled' },
  ] }) };
  delete require.cache[require.resolve(join(ROOT, 'js', 'ai-tools.js'))];
  const tools = require(join(ROOT, 'js', 'ai-tools.js'));
  const result = await tools.getTool('get_free_time').execute({ startDate:'2026-08-25', daysCount:1 });
  assert.equal(result.busy.length, 1);
  assert.equal(result.busy[0].source, 'taskflow');
  assert.equal(contracts.validateToolResult('get_free_time', result).ok, true);
});

test('legacy roadmap migration persists and is idempotent', () => {
  const store = new Map();
  globalThis.window = globalThis; globalThis.Sync = { getUserId: () => 'hotfix-user' };
  globalThis.localStorage = { getItem:k => store.has(k) ? store.get(k) : null, setItem:(k,v) => store.set(k,String(v)), removeItem:k => store.delete(k) };
  delete require.cache[require.resolve(join(ROOT, 'js', 'ai-document-daily-plan.js'))];
  const planner = require(join(ROOT, 'js', 'ai-document-daily-plan.js'));
  const key = 'taskflow-document-roadmaps:hotfix-user';
  store.set(key, JSON.stringify({ version:1, activeRoadmapId:'r1', roadmaps:[{ id:'r1', createdAt:new Date('2026-08-01T00:00:00Z').getTime(), cursor:{ nextWeek:3, lastStartDate:'2026-09-15', lastDaysCount:7 }, roadmap:{ title:'Embedded', totalWeeks:40 } }] }));
  const first = planner.loadStore();
  assert.equal(first.version, 2); assert.equal(first.roadmaps[0].baseDate, '2026-09-01'); assert.equal(first.roadmaps[0].cursor.lastAppliedDaysCount, 21);
  const persisted = JSON.parse(store.get(key)); assert.equal(persisted.version, 2); assert.equal(persisted.roadmaps[0].baseDate, '2026-09-01');
  const before = store.get(key); planner.loadStore(); assert.equal(store.get(key), before);
});

test('CI contract gate and generated browser boot asset are present', () => {
  const ci = readFileSync(join(ROOT,'.github','workflows','ci.yml'),'utf8');
  const html = readFileSync(join(ROOT,'app.html'),'utf8');
  const sw = readFileSync(join(ROOT,'sw.js'),'utf8');
  assert.match(ci,/generate-ai-tool-contracts\.mjs --check/); assert.match(html,/ai-tool-contracts\.generated\.min\.js\?v=1/); assert.match(sw,/ai-tool-contracts\.generated\.min\.js/);
});
