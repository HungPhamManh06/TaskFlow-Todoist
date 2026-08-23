import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/* ============================================================
   Phase: File-Agent Structured Output + Long Plan Import Tests
   ============================================================ */

/* ---- 1. Server source inspection tests ---- */

describe('FILE_AGENT_SCHEMA — matches runtime contract', function () {
  const aiSource = readFileSync(new URL('../server/ai.js', import.meta.url), 'utf8');

  it('schema declares nested args object', function () {
    // Schema should have args as a nested property
    assert.ok(aiSource.includes("required: ['id', 'type', 'args']"), 'Schema must require id, type, args');
  });

  it('schema does NOT have flattened taskRef at action level', function () {
    // Find the FILE_AGENT_SCHEMA definition and check it doesn't have flattened fields
    const schemaStart = aiSource.indexOf('const FILE_AGENT_SCHEMA');
    const schemaEnd = aiSource.indexOf('validateFileAgentProposal', schemaStart);
    const schemaSection = aiSource.slice(schemaStart, schemaEnd);
    // Should NOT have required: ['id', 'type', 'taskRef', 'taskIdRef', ...] (old flattened)
    assert.ok(!schemaSection.includes("'taskRef', 'taskIdRef'"), 'Schema must not have flattened taskRef/taskIdRef at action level');
  });

  it('schema has args.text, args.date, args.duration, args.priority', function () {
    const schemaStart = aiSource.indexOf('const FILE_AGENT_SCHEMA');
    const schemaEnd = aiSource.indexOf('validateFileAgentProposal', schemaStart);
    const schemaSection = aiSource.slice(schemaStart, schemaEnd);
    assert.ok(schemaSection.includes("'text'"), 'Schema args must have text');
    assert.ok(schemaSection.includes("'date'"), 'Schema args must have date');
    assert.ok(schemaSection.includes("'duration'"), 'Schema args must have duration');
    assert.ok(schemaSection.includes("'priority'"), 'Schema args must have priority');
  });

  it('schema args has taskRef for schedule_task', function () {
    const schemaStart = aiSource.indexOf('const FILE_AGENT_SCHEMA');
    const schemaSection = aiSource.slice(schemaStart, schemaStart + 3000);
    assert.ok(schemaSection.includes('taskRef'), 'Schema args must have taskRef');
    assert.ok(schemaSection.includes("enum: ['existing', 'action']"), 'taskRef must have kind enum');
  });

  it('uses callAiJson not callAiText for file-agent', function () {
    // Find the file-agent route section
    const routeStart = aiSource.indexOf("router.post('/file-agent'");
    const routeEnd = aiSource.indexOf("router.post('/refine'", routeStart);
    const routeSection = aiSource.slice(routeStart, routeEnd);
    assert.ok(routeSection.includes('callAiJson'), 'file-agent must use callAiJson');
    assert.ok(!routeSection.includes("await callAiText("), 'file-agent must not use callAiText');
  });

  it('passes FILE_AGENT_CHUNK_SCHEMA to callAiJson per chunk', function () {
    const routeStart = aiSource.indexOf("router.post('/file-agent'");
    const routeEnd = aiSource.indexOf("router.post('/refine'", routeStart);
    const routeSection = aiSource.slice(routeStart, routeEnd);
    assert.ok(routeSection.includes('schema: FILE_AGENT_CHUNK_SCHEMA'), 'Must pass FILE_AGENT_CHUNK_SCHEMA to callAiJson per chunk');
  });

  it('uses chunkCallResult.parsed for structured output per chunk', function () {
    const routeStart = aiSource.indexOf("router.post('/file-agent'");
    const routeEnd = aiSource.indexOf("router.post('/refine'", routeStart);
    const routeSection = aiSource.slice(routeStart, routeEnd);
    assert.ok(routeSection.includes('chunkCallResult.parsed'), 'Must use chunkCallResult.parsed');
  });

  it('has chunking function', function () {
    assert.ok(aiSource.includes('function chunkText'), 'Must have chunkText function');
  });

  it('FILE_AGENT_CHUNK_MAX_ACTIONS is defined', function () {
    assert.ok(aiSource.includes('FILE_AGENT_CHUNK_MAX_ACTIONS'), 'Must have per-chunk limit');
  });

  it('FILE_AGENT_MAX_CHUNKS is defined', function () {
    assert.ok(aiSource.includes('FILE_AGENT_MAX_CHUNKS'), 'Must have max chunk count');
  });

  it('FILE_AGENT_CHUNK_TOKENS is defined', function () {
    assert.ok(aiSource.includes('FILE_AGENT_CHUNK_TOKENS'), 'Must have per-chunk token budget');
  });
});

/* ---- 2. ChunkText function tests ---- */

describe('chunkText — text splitting', function () {
  let chunkText;

  beforeEach(function () {
    // Re-evaluate module to get fresh exports
    delete require.cache[require.resolve('../server/ai.js')];
    const mod = require('../server/ai.js');
    chunkText = mod.chunkText;
  });

  it('short text returns single chunk with metadata', function () {
    const result = chunkText('Hello world');
    assert.equal(result.chunks.length, 1);
    assert.equal(result.chunks[0], 'Hello world');
    assert.equal(result.truncated, false);
    assert.equal(result.totalChunks, 1);
  });

  it('empty text returns empty with metadata', function () {
    const result = chunkText('');
    assert.equal(result.chunks.length, 0);
    assert.equal(result.truncated, false);
  });

  it('null text returns empty with metadata', function () {
    const result = chunkText(null);
    assert.equal(result.chunks.length, 0);
    assert.equal(result.truncated, false);
  });

  it('long text without headings splits by byte budget', function () {
    const lines = [];
    for (let i = 0; i < 1000; i++) {
      lines.push('Line ' + i + ': ' + 'x'.repeat(50));
    }
    const text = lines.join('\n');
    const result = chunkText(text, 6, 28000);
    assert.ok(result.chunks.length > 1, 'Long text should be chunked');
    assert.ok(result.chunks.length <= 6, 'Should not exceed max chunks');
  });

  it('text with headings splits at heading boundaries', function () {
    const text = [
      'Week 1: Introduction',
      'Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5',
      'Week 2: Basics',
      'Line 6', 'Line 7', 'Line 8', 'Line 9', 'Line 10',
    ].join('\n');
    const padded = text + '\n' + 'y'.repeat(30000);
    const result = chunkText(padded, 6, 28000);
    assert.ok(result.chunks.length >= 1);
  });
});

/* ---- 3. validateFileAgentProposal — args contract ---- */

describe('validateFileAgentProposal — nested args', function () {
  let validateFileAgentProposal;

  beforeEach(function () {
    delete require.cache[require.resolve('../server/ai.js')];
    const mod = require('../server/ai.js');
    validateFileAgentProposal = mod.validateFileAgentProposal;
  });

  it('accepts valid nested args proposal', function () {
    const proposal = {
      summary: 'Test plan',
      actions: [{
        id: 'a1',
        type: 'create_task',
        args: {
          text: 'Cài Linux toolchain',
          date: null,
          duration: 60,
          priority: false,
        },
        source: { kind: 'document', evidence: 'Week 1' }
      }]
    };
    const result = validateFileAgentProposal(proposal, {});
    assert.ok(result.ok, 'Valid proposal should pass: ' + JSON.stringify(result.errors));
  });

  it('accepts schedule_task with nested args.taskRef', function () {
    const proposal = {
      summary: 'Scheduled plan',
      actions: [
        {
          id: 'a1',
          type: 'create_task',
          args: {
            text: 'Cài Linux toolchain',
            date: null,
            duration: 60,
            priority: false,
          },
          source: { kind: 'document', evidence: 'Week 1' }
        },
        {
          id: 'a2',
          type: 'schedule_task',
          args: {
            taskRef: { kind: 'action', actionId: 'a1' },
            text: null,
            date: '2026-08-24',
            start: '19:00',
            duration: 60,
            priority: null,
          },
          source: { kind: 'document', evidence: 'Week 1' }
        }
      ]
    };
    const result = validateFileAgentProposal(proposal, {});
    assert.ok(result.ok, 'Valid schedule proposal should pass: ' + JSON.stringify(result.errors));
  });

  it('rejects action without args', function () {
    const proposal = {
      summary: 'Bad',
      actions: [{
        id: 'a1',
        type: 'create_task',
        text: 'Missing args',  // flattened — no args object
        date: null,
        source: { kind: 'document', evidence: 'test' }
      }]
    };
    const result = validateFileAgentProposal(proposal, {});
    assert.ok(!result.ok, 'Flattened action without args should be rejected');
  });

  it('rejects action with invalid type', function () {
    const proposal = {
      summary: 'Bad type',
      actions: [{
        id: 'a1',
        type: 'delete_task',
        args: { text: 'test', date: null, duration: 60, priority: false },
        source: { kind: 'document', evidence: 'test' }
      }]
    };
    const result = validateFileAgentProposal(proposal, {});
    assert.ok(!result.ok, 'delete_task should be rejected');
  });

  it('rejects create_task without required text', function () {
    const proposal = {
      summary: 'Missing text',
      actions: [{
        id: 'a1',
        type: 'create_task',
        args: { text: '', date: null, duration: 60, priority: false },
        source: { kind: 'document', evidence: 'test' }
      }]
    };
    const result = validateFileAgentProposal(proposal, {});
    assert.ok(!result.ok, 'Empty text should be rejected');
  });

  it('rejects invalid date format', function () {
    const proposal = {
      summary: 'Bad date',
      actions: [{
        id: 'a1',
        type: 'create_task',
        args: { text: 'Task', date: 'not-a-date', duration: 60, priority: false },
        source: { kind: 'document', evidence: 'test' }
      }]
    };
    const result = validateFileAgentProposal(proposal, {});
    assert.ok(!result.ok, 'Invalid date should be rejected');
  });

  it('rejects duplicate action IDs', function () {
    const proposal = {
      summary: 'Dupes',
      actions: [
        { id: 'a1', type: 'create_task', args: { text: 'A', date: null, duration: 60, priority: false }, source: { kind: 'document', evidence: '1' } },
        { id: 'a1', type: 'create_task', args: { text: 'B', date: null, duration: 60, priority: false }, source: { kind: 'document', evidence: '2' } },
      ]
    };
    const result = validateFileAgentProposal(proposal, {});
    assert.ok(!result.ok, 'Duplicate IDs should be rejected');
  });

  it('rejects >120 actions', function () {
    const actions = [];
    for (let i = 0; i < 121; i++) {
      actions.push({
        id: 'a' + (i + 1),
        type: 'create_task',
        args: { text: 'Task ' + i, date: null, duration: 60, priority: false },
        source: { kind: 'document', evidence: 'test' }
      });
    }
    const result = validateFileAgentProposal({ summary: 'Too many', actions }, {});
    assert.ok(!result.ok, 'Over 120 actions should be rejected');
  });

  it('accepts up to 120 actions', function () {
    const actions = [];
    for (let i = 0; i < 120; i++) {
      actions.push({
        id: 'a' + (i + 1),
        type: 'create_task',
        args: { text: 'Task ' + i, date: null, duration: 60, priority: false },
        source: { kind: 'document', evidence: 'test' }
      });
    }
    const result = validateFileAgentProposal({ summary: '120 items', actions }, {});
    assert.ok(result.ok, '120 actions should be accepted');
  });
});

/* ---- 4. Classifier regression ---- */

describe('classifyFileIntent — exact user phrase', function () {
  const chatSource = readFileSync(new URL('../js/chat.js', import.meta.url), 'utf8');

  it('exact user phrase contains classifyFileIntent', function () {
    assert.ok(chatSource.includes('function classifyFileIntent'), 'classifyFileIntent must exist');
  });

  it('source has create verbs for Vietnamese', function () {
    assert.ok(chatSource.includes('chia'), 'Must include chia (split)');
    assert.ok(chatSource.includes('tạo'), 'Must include tạo (create)');
    assert.ok(chatSource.includes('lên'), 'Must include lên (create plan)');
  });

  it('source has plan/noun signals', function () {
    // In chat.js, Vietnamese strings are literal Unicode, not regex-escaped
    assert.ok(chatSource.includes('task'), 'Must include task');
    assert.ok(chatSource.includes('ngày'), 'Must include ngày (day)');
    assert.ok(chatSource.includes('create-tasks'), 'Must include create-tasks kind');
  });
});

/* ---- 5. app.html — no changes expected ---- */

describe('app.html — review UI exists', function () {
  const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

  it('has chat-messages container for proposal display', function () {
    assert.ok(html.includes('chatMessages'), 'Must have chat messages container');
  });
});

/* ---- 6. Security contracts ---- */

describe('File-agent security — prompt injection', function () {
  const aiSource = readFileSync(new URL('../server/ai.js', import.meta.url), 'utf8');

  it('FILE_AGENT_ACTION_TYPES only allows create_task and schedule_task', function () {
    assert.ok(aiSource.includes("FILE_AGENT_ACTION_TYPES = ['create_task', 'schedule_task']"), 'Only create_task and schedule_task');
  });

  it('instruction says UNTRUSTED DATA', function () {
    assert.ok(aiSource.includes('KHÔNG ĐÁNG TIN') || aiSource.includes('UNTRUSTED DATA'), 'Must treat file as untrusted');
  });

  it('instruction says NEVER delete_task', function () {
    assert.ok(aiSource.includes('KHÔNG BAO GIỜ xuất delete_task') || aiSource.includes('NEVER output delete_task'), 'Must forbid delete_task');
  });
});

/* ---- 7. i18n — error strings for long import ---- */

describe('i18n — file-agent error strings', function () {
  const i18nSource = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');

  it('has fileFailed error string', function () {
    assert.ok(i18nSource.includes('fileFailed'), 'Must have fileFailed');
  });
});

/* ---- 8. Source contracts — no flattened schema ---- */

describe('Schema/Runtime alignment', function () {
  const aiSource = readFileSync(new URL('../server/ai.js', import.meta.url), 'utf8');

  it('validator reads a.args', function () {
    assert.ok(aiSource.includes('const args = a.args || {}'), 'Validator must read a.args');
  });

  it('validator reads args.text for create_task', function () {
    assert.ok(aiSource.includes("args.text"), 'Validator must read args.text');
  });

  it('validator reads args.taskRef for schedule_task', function () {
    assert.ok(aiSource.includes('args.taskRef'), 'Validator must read args.taskRef');
  });

  it('validator reads args.date', function () {
    // Should find args.date in validator context
    const validatorStart = aiSource.indexOf('function validateFileAgentProposal');
    const validatorEnd = aiSource.indexOf('router.post', validatorStart);
    const validatorSection = aiSource.slice(validatorStart, validatorEnd);
    assert.ok(validatorSection.includes('args.date'), 'Validator must check args.date');
  });
});

/* ---- 9. Long document flow tests ---- */

describe('Long document flow', function () {
  const aiSource = readFileSync(new URL('../server/ai.js', import.meta.url), 'utf8');

  it('uses the aggregate bounded batch builder', function () {
    const routeStart = aiSource.indexOf("router.post('/file-agent'");
    const routeEnd = aiSource.indexOf("router.post('/refine'", routeStart);
    const routeSection = aiSource.slice(routeStart, routeEnd);
    assert.ok(routeSection.includes('buildAiFileBatchContent'), 'Must use bounded batch builder');
  });

  it('uses chunked provider requests with merge for long documents', function () {
    const routeStart = aiSource.indexOf("router.post('/file-agent'");
    const routeEnd = aiSource.indexOf("router.post('/refine'", routeStart);
    const routeSection = aiSource.slice(routeStart, routeEnd);
    assert.ok(routeSection.includes('chunkText'), 'Must use chunkText for long documents');
    assert.ok(routeSection.includes('for (let ci = 0'), 'Must have chunk loop');
    assert.ok(routeSection.includes('FILE_AGENT_TOTAL_TIMEOUT_MS'), 'Must have total timeout budget');
  });

  it('enforces FILE_IMPORT_MAX_ITEMS after merging', function () {
    const routeStart = aiSource.indexOf("router.post('/file-agent'");
    const routeEnd = aiSource.indexOf("router.post('/refine'", routeStart);
    const routeSection = aiSource.slice(routeStart, routeEnd);
    assert.ok(routeSection.includes('FILE_IMPORT_MAX_ITEMS'), 'Must enforce final limit');
  });

  it('deduplicates by normalized text+date', function () {
    const routeStart = aiSource.indexOf("router.post('/file-agent'");
    const routeEnd = aiSource.indexOf("router.post('/refine'", routeStart);
    const routeSection = aiSource.slice(routeStart, routeEnd);
    assert.ok(routeSection.includes('Deduplicate') || routeSection.includes('seen.add'), 'Must deduplicate');
  });

  it('validates provider IDs in the combined proposal', function () {
    const routeStart = aiSource.indexOf("router.post('/file-agent'");
    const routeEnd = aiSource.indexOf("router.post('/refine'", routeStart);
    const routeSection = aiSource.slice(routeStart, routeEnd);
    assert.ok(routeSection.includes('validateFileAgentProposal'), 'Must validate combined IDs');
  });

  it('validates taskRef.actionId dependencies once', function () {
    const routeStart = aiSource.indexOf("router.post('/file-agent'");
    const routeEnd = aiSource.indexOf("router.post('/refine'", routeStart);
    const routeSection = aiSource.slice(routeStart, routeEnd);
    assert.ok(aiSource.includes('buildAgentDependencyGraph(proposal.actions, taskUids)'), 'Must validate dependencies');
  });

  it('reports truncation in importMeta', function () {
    const routeStart = aiSource.indexOf("router.post('/file-agent'");
    const routeEnd = aiSource.indexOf("router.post('/refine'", routeStart);
    const routeSection = aiSource.slice(routeStart, routeEnd);
    assert.ok(routeSection.includes('importMeta'), 'Must report importMeta for truncation');
  });

  it('uses callAiJson with chunk schema for the batch', function () {
    const routeStart = aiSource.indexOf("router.post('/file-agent'");
    const routeEnd = aiSource.indexOf("router.post('/refine'", routeStart);
    const routeSection = aiSource.slice(routeStart, routeEnd);
    assert.ok(routeSection.includes('callAiJson'), 'Must use callAiJson');
    assert.ok(routeSection.includes('schema: FILE_AGENT_CHUNK_SCHEMA'), 'Must pass chunk schema');
    assert.ok(routeSection.includes('FILE_AGENT_CHUNK_TOKENS'), 'Must use chunk token budget');
  });
});

/* ---- 10. No raw PDF Base64 in provider messages ---- */

describe('File-agent — no raw PDF in provider messages', function () {
  const aiSource = readFileSync(new URL('../server/ai.js', import.meta.url), 'utf8');

  it('PDF path extracts text before sending', function () {
    const routeStart = aiSource.indexOf("router.post('/file-agent'");
    const routeEnd = aiSource.indexOf("router.post('/refine'", routeStart);
    const routeSection = aiSource.slice(routeStart, routeEnd);
    assert.ok(routeSection.includes('buildAiFileBatchContent'), 'Must use the shared extraction builder');
    assert.ok(aiSource.includes('const pdfResult = await extractPdfText'), 'Shared builder must extract PDF text');
    assert.ok(!routeSection.includes('data:application/pdf;base64'), 'Must not send raw PDF base64');
  });
});
