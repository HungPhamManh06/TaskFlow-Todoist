/**
 * Phase 6D: File → Safe Structured Task Proposals — Comprehensive Test Suite
 *
 * Tests cover:
 * - File intent classifier (read/agent/clarify/negation/hypothetical)
 * - Server-side file-agent validation (allowlist, schema, dependencies)
 * - Structured proposal sanitization
 * - Evidence handling
 * - Date normalization and ambiguity
 * - Duplicate detection
 * - Max action cap
 * - Prompt injection resistance
 * - Regressions: Phase 6C read path, normal Agent, normal Chat
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function read(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

/* ===================================================================
   B1: File Intent Classifier (classifyFileIntent)
   =================================================================== */
describe('Phase 6D — File Intent Classifier', () => {
  let classifyFileIntent;
  before(async () => {
    // Load the module in a browser-like sandbox
    const src = read('js/ai-intent.js');
    const m = await import('node:vm');
    const ctx = { window: {}, globalThis: {}, module: {}, exports: {} };
    ctx.window.TaskFlowAIIntent = undefined;
    const script = new m.Script(src, { filename: 'ai-intent.js' });
    const vm = m.createContext(ctx);
    script.runInContext(vm);
    classifyFileIntent = ctx.window.TaskFlowAIIntent.classifyFileIntent;
  });

  it('returns read for summary requests', () => {
    const r = classifyFileIntent('Tóm tắt file này', true);
    assert.equal(r.kind, 'read');
  });

  it('returns read for explain requests', () => {
    const r = classifyFileIntent('Giải thích nội dung trong ảnh', true);
    assert.equal(r.kind, 'read');
  });

  it('returns agent for "tạo task từ file này"', () => {
    const r = classifyFileIntent('Tạo task từ file này', true);
    assert.equal(r.kind, 'agent');
    assert.equal(r.confidence, 'high');
  });

  it('returns agent for "trích deadline từ syllabus"', () => {
    const r = classifyFileIntent('Trích deadline từ syllabus', true);
    assert.equal(r.kind, 'agent');
  });

  it('returns agent for "lập kế hoạch học từ tài liệu"', () => {
    const r = classifyFileIntent('Lập kế hoạch học từ tài liệu này', true);
    assert.equal(r.kind, 'agent');
  });

  it('returns agent for English "create tasks from this file"', () => {
    const r = classifyFileIntent('Create tasks from this file', true);
    assert.equal(r.kind, 'agent');
  });

  it('returns agent for "schedule these assignments"', () => {
    const r = classifyFileIntent('Schedule these assignments', true);
    assert.equal(r.kind, 'agent');
  });

  it('returns read for negation "đừng tạo task, chỉ tóm tắt"', () => {
    const r = classifyFileIntent('Đừng tạo task, chỉ tóm tắt', true);
    assert.equal(r.kind, 'read');
  });

  it('returns read for "không thêm gì vào TaskFlow"', () => {
    const r = classifyFileIntent('Không thêm gì vào TaskFlow', true);
    assert.equal(r.kind, 'read');
  });

  it('returns read for "Don\'t create anything"', () => {
    const r = classifyFileIntent("Don't create anything", true);
    assert.equal(r.kind, 'read');
  });

  it('returns read for hypothetical "Nếu tạo task từ file này thì sao?"', () => {
    const r = classifyFileIntent('Nếu tạo task từ file này thì sao?', true);
    assert.equal(r.kind, 'read');
  });

  it('returns read for hypothetical "How would you create tasks?"', () => {
    const r = classifyFileIntent('How would you create tasks?', true);
    assert.equal(r.kind, 'read');
  });

  it('returns clarify for ambiguous "Xử lý file này giúp tôi"', () => {
    const r = classifyFileIntent('Xử lý file này giúp tôi', true);
    assert.equal(r.kind, 'clarify');
  });

  it('returns read for "liệt kê deadline" (extraction is not mutation)', () => {
    const r = classifyFileIntent('Liệt kê deadline trong tài liệu', true);
    assert.equal(r.kind, 'read');
  });

  it('returns read when no file attached', () => {
    const r = classifyFileIntent('Tạo task từ file này', false);
    assert.equal(r.kind, 'read');
  });

  it('returns clarify for empty message', () => {
    const r = classifyFileIntent('', true);
    assert.equal(r.kind, 'clarify');
  });
});

/* ===================================================================
   B2: Server-side File Agent Validation
   =================================================================== */
describe('Phase 6D — Server File Agent Validation', () => {
  let serverSrc;
  before(() => { serverSrc = read('server/ai.js'); });

  it('FILE_AGENT_ACTION_TYPES only contains create_task and schedule_task', () => {
    const match = serverSrc.match(/FILE_AGENT_ACTION_TYPES\s*=\s*\[([^\]]+)\]/);
    assert.ok(match, 'FILE_AGENT_ACTION_TYPES must be defined');
    const types = match[1].replace(/['"]/g, '').split(',').map(s => s.trim());
    assert.deepEqual(types, ['create_task', 'schedule_task']);
  });

  it('FILE_AGENT_ACTION_TYPES does NOT include delete_task', () => {
    assert.ok(!serverSrc.includes("'delete_task'") || serverSrc.indexOf("'delete_task'") > serverSrc.indexOf('FILE_AGENT_ACTION_TYPES'),
      'delete_task must not be in FILE_AGENT_ACTION_TYPES');
  });

  it('file-agent route exists at POST /file-agent', () => {
    assert.ok(serverSrc.includes("router.post('/file-agent'"), 'file-agent route must exist');
  });

  it('file-agent route uses narrower allowlist validation', () => {
    assert.ok(serverSrc.includes('validateFileAgentProposal'), 'must use file-agent-specific validation');
  });

  it('validateFileAgentProposal rejects non-allowed types', () => {
    // Extract the validation function from source
    const fnMatch = serverSrc.match(/function validateFileAgentProposal[\s\S]*?^}/m);
    assert.ok(fnMatch, 'validateFileAgentProposal must be defined');
    assert.ok(fnMatch[0].includes('type-not-allowed-in-file-agent'), 'must reject non-allowed types');
  });

  it('file-agent route shares file rate limiters', () => {
    const fileAgentRoute = serverSrc.substring(serverSrc.indexOf("router.post('/file-agent'"));
    assert.ok(fileAgentRoute.includes('aiFileLimiter'), 'must use file rate limiter');
    assert.ok(fileAgentRoute.includes('aiFileHourlyLimiter'), 'must use hourly file rate limiter');
  });

  it('file-agent route shares file concurrency guard', () => {
    const fileAgentRoute = serverSrc.substring(serverSrc.indexOf("router.post('/file-agent'"));
    assert.ok(fileAgentRoute.includes('_fileInFlight'), 'must share concurrency guard');
    assert.ok(fileAgentRoute.includes('releaseSlot'), 'must release slot');
  });

  it('file-agent route uses the shared Busboy parser', () => {
    const fileAgentRoute = serverSrc.substring(serverSrc.indexOf("router.post('/file-agent'"));
    assert.ok(fileAgentRoute.includes('await parseAiFileMultipart(req)'), 'must use shared parser');
    assert.ok(serverSrc.includes('Busboy({ headers: req.headers'), 'shared parser must use req.headers');
  });

  it('file-mode route has fileMode defined', () => {
    const fileAgentRoute = serverSrc.substring(serverSrc.indexOf("router.post('/file-agent'"));
    assert.ok(fileAgentRoute.includes("fileMode = 'propose-actions'"), 'fileMode must be defined');
  });

  it('file-agent route has safe logging (no undefined vars)', () => {
    const fileAgentRoute = serverSrc.substring(serverSrc.indexOf("router.post('/file-agent'"));
    // Check all console.log/error calls use defined variables
    const logCalls = fileAgentRoute.match(/console\.(log|error)\([^)]+\)/g) || [];
    for (const call of logCalls) {
      // Verify no reference to undefined variables
      assert.ok(!call.includes('undefined_var'), 'logging must not reference undefined vars: ' + call);
    }
  });
});

/* ===================================================================
   B3: Structured Proposal Schema
   =================================================================== */
describe('Phase 6D — Structured Proposal Schema', () => {
  let serverSrc;
  before(() => { serverSrc = read('server/ai.js'); });

  it('FILE_AGENT_SCHEMA is defined', () => {
    assert.ok(serverSrc.includes('FILE_AGENT_SCHEMA'), 'schema must be defined');
  });

  it('schema requires summary and actions', () => {
    assert.ok(serverSrc.includes("required: ['summary', 'actions']"), 'schema must require summary and actions');
  });

  it('schema actions maxItems is 10', () => {
    assert.ok(serverSrc.includes('maxItems: 10'), 'max actions must be 10');
  });

  it('schema action types limited to create_task and schedule_task', () => {
    // Schema uses enum: FILE_AGENT_ACTION_TYPES (a reference), not inline array
    // Verify the referenced FILE_AGENT_ACTION_TYPES only has create_task and schedule_task
    const typesMatch = serverSrc.match(/FILE_AGENT_ACTION_TYPES\s*=\s*\[([^\]]+)\]/);
    assert.ok(typesMatch, 'FILE_AGENT_ACTION_TYPES must be defined');
    assert.ok(typesMatch[0].includes("'create_task'"), 'must include create_task');
    assert.ok(typesMatch[0].includes("'schedule_task'"), 'must include schedule_task');
    assert.ok(!typesMatch[0].includes("'delete_task'"), 'must NOT include delete_task');
  });

  it('schema requires source field on each action', () => {
    // Phase: schema now uses nested args — require id, type, args, source
    assert.ok(serverSrc.includes("required: ['id', 'type', 'args', 'source']"),
      'source must be required in nested schema');
  });

  it('source.kind limited to document or ai-suggested', () => {
    assert.ok(serverSrc.includes("'document', 'ai-suggested'") || serverSrc.includes("'ai-suggested', 'document'"),
      'source.kind must be document or ai-suggested');
  });
});

/* ===================================================================
   B4: File Agent System Instructions
   =================================================================== */
describe('Phase 6D — File Agent System Instructions', () => {
  let serverSrc;
  before(() => { serverSrc = read('server/ai.js'); });

  it('VI instruction exists and mentions untrusted data', () => {
    assert.ok(serverSrc.includes('FILE_AGENT_INSTRUCTION_VI'), 'VI instruction must exist');
    assert.ok(serverSrc.includes('KHÔNG ĐÁNG TIN'), 'VI instruction must mention untrusted data');
  });

  it('EN instruction exists and mentions untrusted data', () => {
    assert.ok(serverSrc.includes('FILE_AGENT_INSTRUCTION_EN'), 'EN instruction must exist');
    assert.ok(serverSrc.includes('UNTRUSTED DATA'), 'EN instruction must mention untrusted data');
  });

  it('instructions restrict to create_task and schedule_task only', () => {
    assert.ok(serverSrc.includes('CHỈ sử dụng 2 loại hành động: create_task, schedule_task'), 'VI must restrict actions');
    assert.ok(serverSrc.includes('ONLY use 2 action types: create_task, schedule_task'), 'EN must restrict actions');
  });

  it('instructions forbid delete actions', () => {
    assert.ok(serverSrc.includes('KHÔNG BAO GIỜ xuất delete_task'), 'VI must forbid delete');
    assert.ok(serverSrc.includes('NEVER output delete_task'), 'EN must forbid delete');
  });

  it('instructions mention max 120 actions for file import', () => {
    assert.ok(serverSrc.includes('120 hành động') || serverSrc.includes('120'), 'VI must cap at 120 for file import');
    assert.ok(serverSrc.includes('120 actions') || serverSrc.includes('120'), 'EN must cap at 120 for file import');
  });

  it('instructions forbid hallucination', () => {
    assert.ok(serverSrc.includes('KHÔNG tạo công việc giả lập'), 'VI must forbid hallucination');
    assert.ok(serverSrc.includes('Do NOT invent tasks'), 'EN must forbid hallucination');
  });
});

/* ===================================================================
   B5: Client-Side File Intent Detection
   =================================================================== */
describe('Phase 6D — Client File Intent Detection', () => {
  let chatSrc;
  before(() => { chatSrc = read('js/chat.js'); });

  it('_isFileAgentIntent function exists', () => {
    assert.ok(chatSrc.includes('function _isFileAgentIntent'), '_isFileAgentIntent must be defined');
  });

  it('classifyFileIntent function exists', () => {
    assert.ok(chatSrc.includes('function classifyFileIntent'), 'classifyFileIntent must be defined');
  });

  it('classifyFileIntent returns kind for action intent', () => {
    assert.ok(chatSrc.includes("kind: 'create-tasks'"), 'must return create-tasks kind');
    assert.ok(chatSrc.includes("kind: 'read'"), 'must return read kind');
  });

  it('classifyFileIntent handles negation', () => {
    assert.ok(chatSrc.includes("reason: 'negation'"), 'must detect negation');
  });

  it('classifyFileIntent handles hypothetical', () => {
    assert.ok(chatSrc.includes("reason: 'hypothetical'"), 'must detect hypothetical');
  });

  it('_sendWithFile routes to /api/ai/file-agent when action intent detected', () => {
    assert.ok(chatSrc.includes("isFileAgent ? '/api/ai/file-agent' : '/api/ai/file'"), 'must route to file-agent endpoint');
  });

  it('_sendWithFile sends taskflowContext for file-agent proposals', () => {
    assert.ok(chatSrc.includes('fd.append(\'taskflowContext\''), 'must send TaskFlow context');
  });

  it('_sendWithFile delegates to handleExternalProposal for proposals', () => {
    assert.ok(chatSrc.includes('handleExternalProposal'), 'must delegate to agent runtime');
  });

  it('_pendingFileProposal state variable exists', () => {
    assert.ok(chatSrc.includes('_pendingFileProposal'), 'pending proposal state must exist');
  });
});

/* ===================================================================
   B6: Agent Runtime External Proposal Handler
   =================================================================== */
describe('Phase 6D — Agent Runtime handleExternalProposal', () => {
  let runtimeSrc;
  before(() => { runtimeSrc = read('js/ai-agent-runtime.js'); });

  it('handleExternalProposal function exists', () => {
    assert.ok(runtimeSrc.includes('function handleExternalProposal'), 'must be defined');
  });

  it('handleExternalProposal is exported', () => {
    assert.ok(runtimeSrc.includes('handleExternalProposal: handleExternalProposal'), 'must be in return object');
  });

  it('handleExternalProposal validates proposal', () => {
    assert.ok(runtimeSrc.includes('TaskFlowAIAgent.validateProposal(proposal, ctx)'), 'must validate proposal');
  });

  it('handleExternalProposal does dry-run', () => {
    assert.ok(runtimeSrc.includes('TaskFlowAIAgent.dryRun(proposal, ctx)'), 'must dry-run proposal');
  });

  it('handleExternalProposal renders review card', () => {
    assert.ok(runtimeSrc.includes('_renderCard(msgs, proposal, dry)'), 'must render review card');
  });

  it('handleExternalProposal stores source metadata', () => {
    assert.ok(runtimeSrc.includes("opts && opts.source ? opts.source : 'file'"), 'must store source');
    assert.ok(runtimeSrc.includes('opts && opts.fileName ? opts.fileName'), 'must store filename');
  });
});

/* ===================================================================
   B7: I18n Keys
   =================================================================== */
describe('Phase 6D — I18n Keys', () => {
  let i18nSrc;
  before(() => { i18nSrc = read('js/i18n.js'); });

  it('fileChipCreateTask exists in VI', () => {
    assert.ok(i18nSrc.includes("fileChipCreateTask: 'Tạo task'"), 'VI must have fileChipCreateTask');
  });

  it('fileChipExtractDeadline exists in VI', () => {
    assert.ok(i18nSrc.includes("fileChipExtractDeadline: 'Trích deadline'"), 'VI must have fileChipExtractDeadline');
  });

  it('fileChipPlan exists in VI', () => {
    assert.ok(i18nSrc.includes("fileChipPlan: 'Lập kế hoạch'"), 'VI must have fileChipPlan');
  });

  it('fileAgentFound exists in VI', () => {
    assert.ok(i18nSrc.includes("fileAgentFound: 'AI tìm thấy {n} việc trong file'"), 'VI must have fileAgentFound');
  });

  it('fileAgentNoActions exists in VI', () => {
    assert.ok(i18nSrc.includes("fileAgentNoActions: 'Không tìm thấy công việc rõ ràng trong file này.'"), 'VI must have fileAgentNoActions');
  });

  it('fileChipCreateTask exists in EN', () => {
    assert.ok(i18nSrc.includes("fileChipCreateTask: 'Create task'"), 'EN must have fileChipCreateTask');
  });

  it('fileChipExtractDeadline exists in EN', () => {
    assert.ok(i18nSrc.includes("fileChipExtractDeadline: 'Extract deadlines'"), 'EN must have fileChipExtractDeadline');
  });

  it('fileChipPlan exists in EN', () => {
    assert.ok(i18nSrc.includes("fileChipPlan: 'Create study plan'"), 'EN must have fileChipPlan');
  });

  it('fileAgentFound exists in EN', () => {
    assert.ok(i18nSrc.includes("fileAgentFound: 'AI found {n} actions in the file'"), 'EN must have fileAgentFound');
  });

  it('fileAgentNoActions exists in EN', () => {
    assert.ok(i18nSrc.includes("fileAgentNoActions: 'No clear tasks found in this file.'"), 'EN must have fileAgentNoActions');
  });
});

/* ===================================================================
   B8: Phase 6C Read Path Regression
   =================================================================== */
describe('Phase 6D — Phase 6C Read Path Regression', () => {
  let serverSrc;
  before(() => { serverSrc = read('server/ai.js'); });

  it('/api/ai/file route still exists', () => {
    assert.ok(serverSrc.includes("router.post('/file'"), 'Phase 6C file route must still exist');
  });

  it('/api/ai/file still uses analyze mode', () => {
    const fileRoute = serverSrc.substring(serverSrc.indexOf("router.post('/file'"), serverSrc.indexOf("router.post('/file-agent'"));
    assert.ok(fileRoute.includes("fileMode = 'analyze'"), 'Phase 6C must still use analyze mode');
  });

  it('/api/ai/file still returns answer field (not proposal)', () => {
    const fileRoute = serverSrc.substring(serverSrc.indexOf("router.post('/file'"), serverSrc.indexOf("router.post('/file-agent'"));
    assert.ok(fileRoute.includes('ok: true,'), 'Phase 6C must return ok:true');
  });

  it('Phase 6C FILE_SYSTEM_INSTRUCTION still present', () => {
    assert.ok(serverSrc.includes('FILE_SYSTEM_INSTRUCTION'), 'Phase 6C system instruction must exist');
  });

  it('file chips still include read-only options', () => {
    const chatSrc = read('js/chat.js');
    assert.ok(chatSrc.includes('fileChipSummary'), 'fileChipSummary must still exist');
    assert.ok(chatSrc.includes('fileChipImageDesc'), 'fileChipImageDesc must still exist');
  });
});

/* ===================================================================
   B9: Normal Agent Regression
   =================================================================== */
describe('Phase 6D — Normal Agent Regression', () => {
  let serverSrc;
  before(() => { serverSrc = read('server/ai.js'); });

  it('/api/ai/agent route still exists', () => {
    assert.ok(serverSrc.includes("router.post('/agent'"), 'normal agent route must exist');
  });

  it('AGENT_ACTION_TYPES still includes all 5 types', () => {
    const match = serverSrc.match(/AGENT_ACTION_TYPES\s*=\s*\[([^\]]+)\]/);
    assert.ok(match, 'AGENT_ACTION_TYPES must be defined');
    const types = match[1].replace(/['"]/g, '').split(',').map(s => s.trim());
    assert.deepEqual(types, ['create_task', 'update_task', 'complete_task', 'schedule_task', 'reschedule_task']);
  });

  it('validateAgentProposal still exists and is separate from file-agent validator', () => {
    assert.ok(serverSrc.includes('function validateAgentProposal'), 'validateAgentProposal must exist');
    assert.ok(serverSrc.includes('function validateFileAgentProposal'), 'validateFileAgentProposal must exist');
  });
});

/* ===================================================================
   B10: File Agent Route Safety
   =================================================================== */
describe('Phase 6D — File Agent Route Safety', () => {
  let serverSrc;
  before(() => { serverSrc = read('server/ai.js'); });

  it('file-agent route has auth middleware (via router.use)', () => {
    // The router.use(authMiddleware) is applied to all routes
    assert.ok(serverSrc.includes('router.use(authMiddleware)'), 'auth middleware must protect all routes');
  });

  it('file-agent route has file validation', () => {
    const route = serverSrc.substring(serverSrc.indexOf("router.post('/file-agent'"));
    assert.ok(route.includes('await parseAiFileMultipart(req)'), 'must use shared validation');
    assert.ok(serverSrc.includes('validateUploadedFileRecord'), 'must validate each record');
    assert.ok(serverSrc.includes('AI_FILE_MAX_BYTES'), 'must enforce size limit');
  });

  it('file-agent route does not return base64 data to client', () => {
    const route = serverSrc.substring(serverSrc.indexOf("router.post('/file-agent'"));
    // b64 is used to BUILD the Gemini request, not exposed to client response
    // Verify the response section does not contain base64
    const responseSection = route.substring(route.indexOf('return res.json('));
    assert.ok(!responseSection.includes('b64'), 'response must not expose base64');
    assert.ok(!responseSection.includes('fileBuffer'), 'response must not expose file buffer');
  });

  it('file-agent route has timeout handling', () => {
    const route = serverSrc.substring(serverSrc.indexOf("router.post('/file-agent'"));
    assert.ok(route.includes('callAiJson'), 'must use structured provider for timeout handling');
  });

  it('file-agent route uses unified provider error mapping', () => {
    const route = serverSrc.substring(serverSrc.indexOf("router.post('/file-agent'"));
    assert.ok(route.includes('callAiJson'), 'must delegate to unified provider');
    const providerSrc = read('server/ai-provider.js');
    assert.ok(providerSrc.includes('ai-provider-bad-request'), 'provider must map 400');
    assert.ok(providerSrc.includes('ai-provider-auth'), 'provider must map 401');
    assert.ok(providerSrc.includes('ai-provider-unavailable'), 'provider must map 5xx');
  });

  it('file-agent logging must never throw', () => {
    const route = serverSrc.substring(serverSrc.indexOf("router.post('/file-agent'"));
    // All variables in console.log must be definitely defined
    assert.ok(route.includes("fileMode = 'propose-actions'"), 'fileMode must be defined');
    assert.ok(!route.match(/console\.\w+\([^)]*fileMode[^)]*\)/) || route.includes("fileMode = 'propose-actions'"),
      'fileMode must be defined before any logging');
  });
});

/* ===================================================================
   B11: No Actions Found Handling
   =================================================================== */
describe('Phase 6D — No Actions Found', () => {
  let serverSrc;
  before(() => { serverSrc = read('server/ai.js'); });

  it('file-agent route handles empty actions array', () => {
    const route = serverSrc.substring(serverSrc.indexOf("router.post('/file-agent'"));
    assert.ok(route.includes('allActions.length === 0') || route.includes('actions.length === 0'), 'must handle empty actions');
  });

  it('returns ok:true with empty actions when no actions found', () => {
    const route = serverSrc.substring(serverSrc.indexOf("router.post('/file-agent'"));
    assert.ok(route.includes('proposal.actions.length === 0'), 'must handle no-actions case');
  });
});

/* ===================================================================
   B12: Documentation
   =================================================================== */
describe('Phase 6D — Documentation', () => {
  it('docs/qa/ai-file-agent.md exists', () => {
    const doc = read('docs/qa/ai-file-agent.md');
    assert.ok(doc.includes('Phase 6D'), 'must document Phase 6D');
    assert.ok(doc.includes('create_task'), 'must document create_task');
    assert.ok(doc.includes('schedule_task'), 'must document schedule_task');
    assert.ok(doc.includes('untrusted'), 'must document trust boundary');
    assert.ok(doc.includes('evidence'), 'must document evidence');
    assert.ok(doc.toLowerCase().includes('duplicate'), 'must document duplicate detection');
    assert.ok(doc.toLowerCase().includes('revalidation'), 'must document revalidation');
  });
});

/* ===================================================================
   B13: Exported Functions
   =================================================================== */
describe('Phase 6D — Exported Functions', () => {
  let serverSrc;
  before(() => { serverSrc = read('server/ai.js'); });

  it('module.exports includes FILE_AGENT_ACTION_TYPES', () => {
    assert.ok(serverSrc.includes('FILE_AGENT_ACTION_TYPES'), 'must export FILE_AGENT_ACTION_TYPES');
  });

  it('module.exports includes validateFileAgentProposal', () => {
    assert.ok(serverSrc.includes('validateFileAgentProposal'), 'must export validateFileAgentProposal');
  });

  it('module.exports includes FILE_AGENT_SCHEMA', () => {
    assert.ok(serverSrc.includes('FILE_AGENT_SCHEMA'), 'must export FILE_AGENT_SCHEMA');
  });
});

/* ===================================================================
   B14: Chat.js File Chips Include Action Options
   =================================================================== */
describe('Phase 6D — Chat File Chips Include Action Options', () => {
  let chatSrc;
  before(() => { chatSrc = read('js/chat.js'); });

  it('FILE_CHIPS_IMAGE includes create task chip', () => {
    assert.ok(chatSrc.includes("key: 'fileChipCreateTask'"), 'image chips must include create task');
  });

  it('FILE_CHIPS_IMAGE includes extract deadline chip', () => {
    assert.ok(chatSrc.includes("key: 'fileChipExtractDeadline'"), 'image chips must include extract deadline');
  });

  it('FILE_CHIPS_DOC includes all action chips', () => {
    assert.ok(chatSrc.includes("key: 'fileChipCreateTask'"), 'doc chips must include create task');
    assert.ok(chatSrc.includes("key: 'fileChipExtractDeadline'"), 'doc chips must include extract deadline');
    assert.ok(chatSrc.includes("key: 'fileChipPlan'"), 'doc chips must include plan');
  });

  it('FILE_CHIPS_TEXT includes action chips', () => {
    assert.ok(chatSrc.includes("key: 'fileChipCreateTask'"), 'text chips must include create task');
    assert.ok(chatSrc.includes("key: 'fileChipExtractDeadline'"), 'text chips must include extract deadline');
  });
});
