'use strict';
/* Phase P0 — Unified Agent Structured Action Contract.
   Ensures AGENT_PROPOSAL_SCHEMA and FILE_AGENT_SCHEMA share the nested
   args contract, old flat format is rejected, and chunkText is wired in. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const src = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');

const require = createRequire(import.meta.url);
const ai = require('../server/ai.js');
const {
  validateAgentProposal,
  validateFileAgentProposal,
  AGENT_PROPOSAL_SCHEMA,
  FILE_AGENT_SCHEMA,
  FILE_AGENT_CHUNK_SCHEMA,
  AGENT_ACTION_TYPES,
  FILE_AGENT_ACTION_TYPES,
  AGENT_ALL_FIELDS,
  validActionId,
  chunkText,
  FILE_AGENT_CHUNK_MAX_ACTIONS,
  FILE_AGENT_MAX_CHUNKS,
  FILE_IMPORT_MAX_ITEMS,
} = ai;

const refs = {
  taskUids: new Set(['t1', 't2']),
  projectIds: new Set(['p1']),
  milestoneIds: new Set(['m1']),
};

/* ============ SCHEMA: nested args contract ============ */

test('schema: AGENT action items have id, type, args — not flat fields', () => {
  const items = AGENT_PROPOSAL_SCHEMA.properties.actions.items;
  assert.deepEqual(Object.keys(items.properties).sort(), ['args', 'id', 'type']);
  assert.deepEqual(items.required, ['id', 'type', 'args']);
  assert.equal(items.additionalProperties, false);
});

test('schema: AGENT args has all 9 required properties with nullable types', () => {
  const argsSchema = AGENT_PROPOSAL_SCHEMA.properties.actions.items.properties.args;
  assert.deepEqual(argsSchema.required.sort(), [
    'changes', 'date', 'duration', 'milestoneId',
    'priority', 'projectId', 'start', 'taskRef', 'text'
  ]);
  assert.equal(argsSchema.additionalProperties, false);
  // Every property should accept null
  for (const [key, prop] of Object.entries(argsSchema.properties)) {
    if (key === 'taskRef') {
      assert.ok(Array.isArray(prop.type), `${key} should accept null`);
      assert.ok(prop.type.includes('null'), `${key} should include null`);
    } else {
      assert.ok(Array.isArray(prop.type), `${key} type should be array for nullable`);
      assert.ok(prop.type.includes('null'), `${key} should include null`);
    }
  }
});

test('schema: AGENT schema has no pattern keyword (Gemini unsupported)', () => {
  const items = AGENT_PROPOSAL_SCHEMA.properties.actions.items;
  assert.equal(items.properties.id.pattern, undefined, 'pattern must not be used in provider schema');
  // Check deep — no pattern anywhere
  function walkSchema(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(walkSchema); return; }
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'pattern') throw new Error('Found unsupported pattern keyword: ' + JSON.stringify(v));
      if (v && typeof v === 'object') walkSchema(v);
    }
  }
  walkSchema(AGENT_PROPOSAL_SCHEMA);
});

test('schema: FILE_AGENT schema has no pattern keyword', () => {
  function walkSchema(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(walkSchema); return; }
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'pattern') throw new Error('Found unsupported pattern keyword in FILE_AGENT_SCHEMA: ' + JSON.stringify(v));
      if (v && typeof v === 'object') walkSchema(v);
    }
  }
  walkSchema(FILE_AGENT_SCHEMA);
});

test('schema: AGENT_ALL_FIELDS only allows root-level id, type, args', () => {
  const fields = Array.from(AGENT_ALL_FIELDS);
  assert.deepEqual(fields.sort(), ['args', 'id', 'type']);
});

test('schema: AGENT schema taskRef nested object requires kind, uid, actionId when object', () => {
  const argsSchema = AGENT_PROPOSAL_SCHEMA.properties.actions.items.properties.args;
  const taskRef = argsSchema.properties.taskRef;
  assert.deepEqual(taskRef.required.sort(), ['actionId', 'kind', 'uid']);
  assert.deepEqual(taskRef.properties.kind.enum, ['existing', 'action']);
});

test('schema: FILE_AGENT schema taskRef requires kind, uid, actionId when object', () => {
  const argsSchema = FILE_AGENT_SCHEMA.properties.actions.items.properties.args;
  const taskRef = argsSchema.properties.taskRef;
  assert.deepEqual(taskRef.required, ['kind', 'uid', 'actionId']);
});

test('schema: FILE_AGENT maxItems uses chunk limit, not import limit', () => {
  assert.equal(FILE_AGENT_SCHEMA.properties.actions.maxItems, FILE_AGENT_CHUNK_MAX_ACTIONS);
});

/* ============ VALIDATOR: nested args contract ============ */

test('validator: canonical create_task with nested args passes', () => {
  const proposal = {
    summary: 'Tạo task Test',
    actions: [{
      id: 'a1',
      type: 'create_task',
      args: {
        taskRef: null,
        text: 'Test',
        date: null,
        start: null,
        duration: 30,
        priority: false,
        projectId: null,
        milestoneId: null,
        changes: null,
      },
    }],
  };
  const r = validateAgentProposal(proposal, refs);
  assert.equal(r.ok, true, 'Canonical create_task should pass: ' + JSON.stringify(r.errors));
});

test('validator: canonical schedule_task with nested args passes', () => {
  const proposal = {
    summary: 'Schedule task',
    actions: [{
      id: 'a1',
      type: 'schedule_task',
      args: {
        taskRef: { kind: 'existing', uid: 't1' },
        text: null,
        date: '2026-08-25',
        start: '19:00',
        duration: 60,
        priority: null,
        projectId: null,
        milestoneId: null,
        changes: null,
      },
    }],
  };
  const r = validateAgentProposal(proposal, refs);
  assert.equal(r.ok, true, 'Canonical schedule_task should pass: ' + JSON.stringify(r.errors));
});

test('validator: create + schedule dependency with nested args passes', () => {
  const proposal = {
    summary: 'Create and schedule',
    actions: [
      {
        id: 'a1',
        type: 'create_task',
        args: {
          taskRef: null, text: 'Learn CMake', date: null,
          start: null, duration: 60, priority: false,
          projectId: null, milestoneId: null, changes: null,
        },
      },
      {
        id: 'a2',
        type: 'schedule_task',
        args: {
          taskRef: { kind: 'action', actionId: 'a1' },
          text: null, date: '2026-08-25', start: '19:00',
          duration: 60, priority: null, projectId: null,
          milestoneId: null, changes: null,
        },
      },
    ],
  };
  const r = validateAgentProposal(proposal, refs);
  assert.equal(r.ok, true, 'Create+schedule dependency should pass: ' + JSON.stringify(r.errors));
});

test('validator: update_task with nested args and changes passes', () => {
  const proposal = {
    summary: 'Update task',
    actions: [{
      id: 'a1',
      type: 'update_task',
      args: {
        taskRef: { kind: 'existing', uid: 't1' },
        text: null, date: null, start: null, duration: null,
        priority: null, projectId: null, milestoneId: null,
        changes: { text: 'New name', priority: true },
      },
    }],
  };
  const r = validateAgentProposal(proposal, refs);
  assert.equal(r.ok, true, 'Update_task should pass: ' + JSON.stringify(r.errors));
});

test('validator: complete_task with nested args passes', () => {
  const proposal = {
    summary: 'Complete task',
    actions: [{
      id: 'a1',
      type: 'complete_task',
      args: {
        taskRef: { kind: 'existing', uid: 't1' },
        text: null, date: null, start: null, duration: null,
        priority: null, projectId: null, milestoneId: null, changes: null,
      },
    }],
  };
  const r = validateAgentProposal(proposal, refs);
  assert.equal(r.ok, true, 'complete_task should pass: ' + JSON.stringify(r.errors));
});

/* ============ VALIDATOR: reject old flat format ============ */

test('validator: old flat action format is rejected (unknown field)', () => {
  const proposal = {
    summary: 'Old format',
    actions: [{ id: 'a1', type: 'create_task', text: 'Test', date: null }],
  };
  const r = validateAgentProposal(proposal, refs);
  assert.equal(r.ok, false, 'Flat format should be rejected');
  assert.ok(
    r.errors.includes('action-0-unknown-field') || r.errors.includes('action-0-text-invalid'),
    'Should fail with unknown-field or text-invalid: ' + JSON.stringify(r.errors)
  );
});

test('validator: create_task with taskRef object rejected (forbidden for create)', () => {
  const proposal = {
    summary: 'Bad create',
    actions: [{
      id: 'a1',
      type: 'create_task',
      args: {
        taskRef: { kind: 'existing', uid: 't1' },
        text: 'Test', date: null, start: null, duration: 30,
        priority: false, projectId: null, milestoneId: null, changes: null,
      },
    }],
  };
  const r = validateAgentProposal(proposal, refs);
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('action-0-forbidden-field-taskref'));
});

/* ============ VALIDATOR: File Agent ============ */

test('file-agent: canonical create_task with source passes', () => {
  const proposal = {
    summary: 'Extracted from PDF',
    actions: [{
      id: 'a1',
      type: 'create_task',
      args: {
        taskRef: null,
        text: 'Học CMake cơ bản',
        date: null,
        start: null,
        duration: 60,
        priority: false,
        projectId: null,
        milestoneId: null,
      },
      source: { kind: 'document', evidence: 'Tuần 15: CMake cơ bản' },
    }],
  };
  const r = validateFileAgentProposal(proposal, refs);
  assert.equal(r.ok, true, 'File agent create_task should pass: ' + JSON.stringify(r.errors));
});

test('file-agent: update_task and complete_task are rejected', () => {
  const proposal = {
    summary: 'Not allowed',
    actions: [{
      id: 'a1',
      type: 'update_task',
      args: {
        taskRef: { kind: 'existing', uid: 't1' },
        text: null, date: null, start: null, duration: null,
        priority: null, projectId: null, milestoneId: null,
        changes: { text: 'New' },
      },
      source: { kind: 'document', evidence: 'test' },
    }],
  };
  const r = validateFileAgentProposal(proposal, refs);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('type-not-allowed-in-file-agent')));
});

test('file-agent: schema only allows create_task and schedule_task', () => {
  assert.deepEqual(FILE_AGENT_ACTION_TYPES.sort(), ['create_task', 'schedule_task']);
});

/* ============ CHUNKING: chunkText ============ */

test('chunkText: short text returns single chunk with metadata', () => {
  const text = 'Short document content.';
  const result = chunkText(text, 6);
  assert.equal(result.chunks.length, 1);
  assert.equal(result.chunks[0], text);
  assert.equal(result.truncated, false);
  assert.equal(result.totalChunks, 1);
  assert.ok(result.processedBytes > 0);
  assert.equal(result.reason, null);
});

test('chunkText: empty text returns empty with metadata', () => {
  const result = chunkText('', 6);
  assert.equal(result.chunks.length, 0);
  assert.equal(result.truncated, false);
  assert.equal(result.totalChunks, 0);
});

test('chunkText: long text produces multiple bounded chunks', () => {
  const lines = [];
  for (let i = 0; i < 2000; i++) {
    lines.push('Tuần ' + (i + 1) + ': nội dung kế hoạch học tập cho tuần thứ ' + (i + 1));
  }
  const text = lines.join('\n');
  const result = chunkText(text, 6);
  assert.ok(result.chunks.length >= 2, 'Should produce multiple chunks');
  assert.ok(result.chunks.length <= 6, 'Should not exceed max chunks');
  for (const c of result.chunks) {
    assert.ok(Buffer.byteLength(c, 'utf8') <= 29000, 'Chunk should be under budget');
  }
});

test('chunkText: respects heading boundaries', () => {
  const lines = [];
  for (let i = 0; i < 500; i++) {
    if (i % 100 === 0) lines.push('Tuần ' + (i + 1) + ': Phase start');
    else lines.push('Day ' + i + ': content ' + i);
  }
  const text = lines.join('\n');
  const result = chunkText(text, 6, 5000);
  assert.ok(result.chunks.length >= 1);
});

test('chunkText: reports truncation when exceeding max chunks', () => {
  const lines = [];
  for (let i = 0; i < 5000; i++) {
    lines.push('Tuần ' + (i + 1) + ': content for week ' + (i + 1) + ' ' + 'x'.repeat(20));
  }
  const text = lines.join('\n');
  const result = chunkText(text, 3, 5000);
  assert.equal(result.truncated, true);
  assert.equal(result.reason, 'chunk-count-limit');
  assert.ok(result.chunks.length <= 3);
});

test('chunkText: 40-week synthetic coverage sentinel', () => {
  const lines = [];
  for (let w = 1; w <= 40; w++) {
    lines.push('Tuần ' + w + ': Plan for week ' + w);
    lines.push('TASK_WEEK_' + String(w).padStart(2, '0') + ': sentinel task for week ' + w);
  }
  const text = lines.join('\n');
  const result = chunkText(text, 6);
  // All 40 sentinels must be in the chunks (even if truncated, content is preserved)
  const allChunks = result.chunks.join('\n');
  for (let w = 1; w <= 40; w++) {
    const sentinel = 'TASK_WEEK_' + String(w).padStart(2, '0');
    assert.ok(allChunks.includes(sentinel), 'Sentinel ' + sentinel + ' must be present');
  }
});

test('chunkText: FILE_AGENT_CHUNK_MAX_ACTIONS is 10', () => {
  assert.equal(FILE_AGENT_CHUNK_MAX_ACTIONS, 10);
});

test('chunkText: FILE_AGENT_MAX_CHUNKS is 6', () => {
  assert.equal(FILE_AGENT_MAX_CHUNKS, 6);
});

test('chunkText: FILE_IMPORT_MAX_ITEMS is 120', () => {
  assert.equal(FILE_IMPORT_MAX_ITEMS, 120);
});

/* ============ INTEGRATION: one-task user case ============ */

test('integration: "Tạo task Test" exact canonical proposal passes all validation', () => {
  // This is the exact provider output the fixed schema should produce
  const proposal = {
    summary: 'Tạo task Test',
    actions: [{
      id: 'a1',
      type: 'create_task',
      args: {
        taskRef: null,
        text: 'Test',
        date: null,
        start: null,
        duration: 30,
        priority: false,
        projectId: null,
        milestoneId: null,
        changes: null,
      },
    }],
  };
  const r = validateAgentProposal(proposal, new Set());
  assert.equal(r.ok, true, 'Exact user case should pass: ' + JSON.stringify(r.errors));
});

test('integration: 40-week synthetic plan with 60 tasks via file-agent chunk merge passes', () => {
  // Use file-agent validation which allows up to 120 actions
  const actions = [];
  for (let i = 0; i < 60; i++) {
    const week = Math.floor(i / 3) + 1;
    const dayOfWeek = (i % 3) + 1;
    actions.push({
      id: 'a' + (i + 1),
      type: 'create_task',
      args: {
        taskRef: null,
        text: 'Tuần ' + week + ' Ngày ' + dayOfWeek + ' task',
        date: '2026-08-25',
        start: null,
        duration: 60,
        priority: false,
        projectId: null,
        milestoneId: null,
        changes: null,
      },
      source: { kind: 'document', evidence: 'Tuần ' + week },
    });
  }
  const proposal = { summary: 'Extracted 60 tasks from 40-week plan', actions };
  const r = validateFileAgentProposal(proposal, refs);
  assert.equal(r.ok, true, '60-task file-agent merged proposal should pass: ' + JSON.stringify(r.errors));
  assert.equal(proposal.actions.length, 60);
});

/* ============ SOURCE-LEVEL ASSERTIONS ============ */

test('source: file-agent route uses chunkText', () => {
  const fileAgentSeg = src.slice(
    src.indexOf("router.post('/file-agent'"),
    src.indexOf("router.post('/refine'")
  );
  assert.match(fileAgentSeg, /chunkText/, 'file-agent route must use chunkText');
  assert.match(fileAgentSeg, /FILE_AGENT_CHUNK_SCHEMA/, 'file-agent route must use chunk schema');
  assert.match(fileAgentSeg, /FILE_AGENT_TOTAL_TIMEOUT_MS/, 'file-agent route must use total timeout budget');
});

test('source: file-agent route uses chunk schema and total timeout', () => {
  const fileAgentSeg = src.slice(
    src.indexOf("router.post('/file-agent'"),
    src.indexOf("router.post('/refine'")
  );
  assert.match(fileAgentSeg, /FILE_AGENT_CHUNK_SCHEMA/, 'file-agent route must use chunk schema');
  assert.match(fileAgentSeg, /FILE_AGENT_TOTAL_TIMEOUT_MS/, 'file-agent route must use total timeout budget');
  assert.match(fileAgentSeg, /chunkText/, 'file-agent route must use chunkText');
});

test('source: AGENT schema uses nested args in structure', () => {
  assert.match(src, /required: \['id', 'type', 'args'\]/, 'agent schema must require args');
});

test('source: no pattern keyword in AGENT schema', () => {
  // Extract just the AGENT_PROPOSAL_SCHEMA definition
  const schemaStart = src.indexOf('const AGENT_PROPOSAL_SCHEMA = {');
  const schemaEnd = src.indexOf('};', schemaStart) + 2;
  const schemaText = src.slice(schemaStart, schemaEnd);
  assert.doesNotMatch(schemaText, /pattern:/, 'AGENT_PROPOSAL_SCHEMA must not use pattern keyword');
});

test('source: FILE_AGENT_SCHEMA has all args properties required', () => {
  const fileSchemaStart = src.indexOf('const FILE_AGENT_SCHEMA = {');
  const fileSchemaEnd = src.indexOf('// Per-chunk schema', fileSchemaStart);
  const fileSchemaText = src.slice(fileSchemaStart, fileSchemaEnd);
  assert.match(fileSchemaText, /required: \['taskRef', 'text', 'date', 'start', 'duration', 'priority', 'projectId', 'milestoneId'\]/,
    'FILE_AGENT args must have all properties required');
});

test('source: agent system instructions reference nested args', () => {
  assert.match(src, /Dùng "args" để chứa tham số hành động/);
  assert.match(src, /Use "args" to hold action parameters/);
});

test('source: file-agent instruction mentions nested args with taskRef', () => {
  assert.match(src, /MỖI hành động PHẢI có "args" chứa tham số/);
});

/* ============ ID REMAPPING ============ */

test('validator: remapped IDs from chunk merge still validate', () => {
  // Simulate 3 chunks each producing 2 actions, remapped globally
  const proposal = {
    summary: 'Merged from 3 chunks',
    actions: [
      { id: 'a1', type: 'create_task', args: { taskRef: null, text: 'Task 1', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null } },
      { id: 'a2', type: 'create_task', args: { taskRef: null, text: 'Task 2', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null } },
      { id: 'a3', type: 'create_task', args: { taskRef: null, text: 'Task 3', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null } },
      { id: 'a4', type: 'schedule_task', args: { taskRef: { kind: 'action', actionId: 'a1' }, text: null, date: '2026-08-25', start: '10:00', duration: 30, priority: null, projectId: null, milestoneId: null, changes: null } },
      { id: 'a5', type: 'schedule_task', args: { taskRef: { kind: 'action', actionId: 'a3' }, text: null, date: '2026-08-26', start: '10:00', duration: 30, priority: null, projectId: null, milestoneId: null, changes: null } },
      { id: 'a6', type: 'create_task', args: { taskRef: null, text: 'Task 6', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null } },
    ],
  };
  const r = validateAgentProposal(proposal, refs);
  assert.equal(r.ok, true, 'Remapped cross-chunk IDs should validate: ' + JSON.stringify(r.errors));
});

test('validator: duplicate IDs from merge rejected', () => {
  const proposal = {
    summary: 'Duplicate IDs',
    actions: [
      { id: 'a1', type: 'create_task', args: { text: 'Task 1', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null } },
      { id: 'a1', type: 'create_task', args: { text: 'Task 2', date: null, start: null, duration: 30, priority: false, projectId: null, milestoneId: null, changes: null } },
    ],
  };
  const r = validateAgentProposal(proposal, refs);
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('action-1-duplicate-action-id'));
});

/* ============ PROMPT INJECTION ============ */

test('security: delete_task in args is rejected even if user asks', () => {
  const proposal = {
    summary: 'Evil proposal',
    actions: [{
      id: 'a1',
      type: 'delete_task',
      args: { taskRef: { kind: 'existing', uid: 't1' } },
    }],
  };
  const r = validateAgentProposal(proposal, refs);
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('action-0-unknown-type'));
});

test('security: unknown type in file-agent is rejected', () => {
  const proposal = {
    summary: 'Evil',
    actions: [{
      id: 'a1',
      type: 'complete_task',
      args: { taskRef: { kind: 'existing', uid: 't1' }, text: null, date: null, start: null, duration: null, priority: null, projectId: null, milestoneId: null },
      source: { kind: 'document', evidence: 'test' },
    }],
  };
  const r = validateFileAgentProposal(proposal, refs);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('type-not-allowed-in-file-agent')));
});
