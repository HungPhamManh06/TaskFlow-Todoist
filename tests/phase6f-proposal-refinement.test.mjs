/**
 * Phase 6F: Conversational Proposal Refinement — Comprehensive Test Suite
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
function read(rel) { return readFileSync(resolve(ROOT, rel), 'utf8'); }

/* =================================================================== */
describe('Phase 6F — Refinement Router', () => {
  let classifyProposalMessage;
  before(async () => {
    const src = read('js/ai-intent.js');
    const vm = await import('node:vm');
    const ctx = { window: {}, globalThis: {}, module: {}, exports: {} };
    const script = new vm.Script(src, { filename: 'ai-intent.js' });
    const sandbox = vm.createContext(ctx);
    script.runInContext(sandbox);
    classifyProposalMessage = ctx.window.TaskFlowAIIntent.classifyProposalMessage;
  });

  it('returns normal-chat for empty message', () => {
    const r = classifyProposalMessage('');
    assert.equal(r.kind, 'normal-chat');
  });

  it('blocks confirm bypass: "Áp dụng luôn"', () => {
    const r = classifyProposalMessage('Áp dụng luôn');
    assert.equal(r.kind, 'confirm-attempt');
  });

  it('blocks confirm bypass: "Ok tạo đi"', () => {
    const r = classifyProposalMessage('Ok tạo đi');
    assert.equal(r.kind, 'confirm-attempt');
  });

  it('blocks confirm bypass: "confirm"', () => {
    const r = classifyProposalMessage('confirm');
    assert.equal(r.kind, 'confirm-attempt');
  });

  it('blocks confirm bypass: "ship it"', () => {
    const r = classifyProposalMessage('ship it');
    assert.equal(r.kind, 'confirm-attempt');
  });

  it('blocks confirm bypass: "execute everything"', () => {
    const r = classifyProposalMessage('execute everything');
    assert.equal(r.kind, 'confirm-attempt');
  });

  it('returns cancel for "Hủy đề xuất"', () => {
    const r = classifyProposalMessage('Hủy đề xuất');
    assert.equal(r.kind, 'cancel');
  });

  it('returns refine select-all for "Chọn tất cả"', () => {
    const r = classifyProposalMessage('Chọn tất cả');
    assert.equal(r.kind, 'refine');
    assert.equal(r.operationHint, 'select-all');
  });

  it('returns refine deselect-all for "Bỏ tất cả"', () => {
    const r = classifyProposalMessage('Bỏ tất cả');
    assert.equal(r.kind, 'refine');
    assert.equal(r.operationHint, 'deselect-all');
  });

  it('returns refine deselect for "Bỏ task 2"', () => {
    const r = classifyProposalMessage('Bỏ task 2');
    assert.equal(r.kind, 'refine');
    assert.equal(r.operationHint, 'deselect');
  });

  it('returns refine select for "Chọn task 1"', () => {
    const r = classifyProposalMessage('Chọn task 1');
    assert.equal(r.kind, 'refine');
    assert.equal(r.operationHint, 'select');
  });

  it('returns refine select-only for "Chỉ giữ task 1 và 3"', () => {
    const r = classifyProposalMessage('Chỉ giữ task 1 và 3');
    assert.equal(r.kind, 'refine');
    assert.equal(r.operationHint, 'select-only');
  });

  it('returns refine single-edit for "Đổi task 1 thành 45 phút"', () => {
    const r = classifyProposalMessage('Đổi task 1 thành 45 phút');
    assert.equal(r.kind, 'refine');
    assert.equal(r.operationHint, 'single-edit');
  });

  it('returns refine bulk-set for "Đổi tất cả thành 45 phút"', () => {
    const r = classifyProposalMessage('Đổi tất cả thành 45 phút');
    assert.equal(r.kind, 'refine');
    assert.equal(r.operationHint, 'bulk-set');
  });

  it('returns refine filter-date for "Chỉ giữ task có deadline"', () => {
    const r = classifyProposalMessage('Chỉ giữ task có deadline');
    assert.equal(r.kind, 'refine');
    assert.equal(r.operationHint, 'filter-date');
  });

  it('returns refine add-blocked for "Thêm task mới"', () => {
    const r = classifyProposalMessage('Thêm task mới');
    assert.equal(r.kind, 'refine');
    assert.equal(r.operationHint, 'add-blocked');
  });

  it('returns question for "Tại sao task 2 có 90 phút?"', () => {
    const r = classifyProposalMessage('Tại sao task 2 có 90 phút?');
    assert.equal(r.kind, 'question');
  });

  it('returns complex for ambiguous refinement', () => {
    const r = classifyProposalMessage('Giữ những việc quan trọng nhất');
    assert.equal(r.kind, 'refine');
    assert.equal(r.operationHint, 'complex');
  });

  it('handles English confirm bypass: "apply"', () => {
    const r = classifyProposalMessage('apply');
    assert.equal(r.kind, 'confirm-attempt');
  });

  it('handles English confirm bypass: "go ahead"', () => {
    const r = classifyProposalMessage('go ahead');
    assert.equal(r.kind, 'confirm-attempt');
  });
});

/* =================================================================== */
describe('Phase 6F — Server Refine Validation', () => {
  let serverSrc;
  before(() => { serverSrc = read('server/ai.js'); });

  it('POST /api/ai/refine route exists', () => {
    assert.ok(serverSrc.includes("router.post('/refine'"), 'refine route must exist');
  });

  it('REFINE_OP_TYPES defined with allowed ops', () => {
    assert.ok(serverSrc.includes('REFINE_OP_TYPES'), 'must define allowed ops');
    assert.ok(serverSrc.includes("'select'"), 'must include select');
    assert.ok(serverSrc.includes("'deselect'"), 'must include deselect');
    assert.ok(serverSrc.includes("'set'"), 'must include set');
    assert.ok(serverSrc.includes("'bulk-set'"), 'must include bulk-set');
  });

  it('REFINE_OP_TYPES does NOT include apply/confirm/execute', () => {
    const match = serverSrc.match(/REFINE_OP_TYPES\s*=\s*\[([^\]]+)\]/);
    assert.ok(match);
    assert.ok(!match[1].includes("'apply'"));
    assert.ok(!match[1].includes("'confirm'"));
    assert.ok(!match[1].includes("'execute'"));
    assert.ok(!match[1].includes("'delete_task'"));
    assert.ok(!match[1].includes("'create_task'"));
  });

  it('validateRefineOp rejects unknown op types', () => {
    assert.ok(serverSrc.includes('validateRefineOp'), 'must have validation function');
    assert.ok(serverSrc.includes('op-type-not-allowed'), 'must reject bad ops');
  });

  it('validateRefineOp checks prototype pollution', () => {
    assert.ok(serverSrc.includes('__proto__'), 'must check __proto__');
    assert.ok(serverSrc.includes('prototype'), 'must check prototype');
    assert.ok(serverSrc.includes('constructor'), 'must check constructor');
  });

  it('validateRefineRequest checks message', () => {
    assert.ok(serverSrc.includes('validateRefineRequest'), 'must have request validation');
  });

  it('refine route shares agent rate limiters', () => {
    const route = serverSrc.substring(serverSrc.indexOf("router.post('/refine'"));
    assert.ok(route.includes('aiAgentLimiter'), 'must use agent limiter');
    assert.ok(route.includes('aiAgentHourlyLimiter'), 'must use hourly limiter');
  });

  it('refine route has safe logging (no undefined vars)', () => {
    const route = serverSrc.substring(serverSrc.indexOf("router.post('/refine'"));
    assert.ok(route.includes('console.log'), 'must have logging');
    assert.ok(route.includes("console.error"), 'must have error logging');
  });

  it('max operations is 20', () => {
    assert.ok(serverSrc.includes('REFINE_MAX_OPS = 20'), 'max ops must be 20');
  });

  it('REFINE_SET_FIELDS includes valid fields only', () => {
    const match = serverSrc.match(/REFINE_SET_FIELDS\s*=\s*\[([^\]]+)\]/);
    assert.ok(match);
    assert.ok(match[1].includes("'duration'"));
    assert.ok(match[1].includes("'date'"));
    assert.ok(match[1].includes("'text'"));
    assert.ok(match[1].includes("'priority'"));
  });
});

/* =================================================================== */
describe('Phase 6F — Agent Runtime Refinement', () => {
  let runtimeSrc;
  before(() => { runtimeSrc = read('js/ai-agent-runtime.js'); });

  it('handleRefinement function exists', () => {
    assert.ok(runtimeSrc.includes('function handleRefinement'), 'must be defined');
  });

  it('handleRefinement exported', () => {
    assert.ok(runtimeSrc.includes('handleRefinement: handleRefinement'), 'must be exported');
  });

  it('_isConfirmAttempt exists', () => {
    assert.ok(runtimeSrc.includes('function _isConfirmAttempt'), 'must exist');
  });

  it('_undoRefinement exists', () => {
    assert.ok(runtimeSrc.includes('function _undoRefinement'), 'must exist');
  });

  it('_resetToOriginal exists', () => {
    assert.ok(runtimeSrc.includes('function _resetToOriginal'), 'must exist');
  });

  it('_applyOperation exists', () => {
    assert.ok(runtimeSrc.includes('function _applyOperation'), 'must exist');
  });

  it('_propagateDeselect exists', () => {
    assert.ok(runtimeSrc.includes('function _propagateDeselect'), 'must exist');
  });

  it('_pushUndo exists', () => {
    assert.ok(runtimeSrc.includes('function _pushUndo'), 'must exist');
  });

  it('_snapshotReviewState exists', () => {
    assert.ok(runtimeSrc.includes('function _snapshotReviewState'), 'must exist');
  });

  it('review state has revision field', () => {
    assert.ok(runtimeSrc.includes('revision: 0'), 'must init revision to 0');
  });

  it('review state has originalProposal', () => {
    assert.ok(runtimeSrc.includes('originalProposal'), 'must store original');
  });

  it('review state has _history for undo', () => {
    assert.ok(runtimeSrc.includes('_history'), 'must have history');
  });

  it('confirm bypass blocks apply in handleRefinement', () => {
    assert.ok(runtimeSrc.includes("kind === 'confirm-attempt'"), 'must block confirm attempts');
  });

  it('add-blocked response exists', () => {
    assert.ok(runtimeSrc.includes("operationHint === 'add-blocked'"), 'must block add attempts');
  });

  it('no chain-of-thought fields', () => {
    assert.ok(!runtimeSrc.includes('chainOfThought'));
    assert.ok(!runtimeSrc.includes('reasoningTrace'));
  });

  it('no new write capabilities', () => {
    assert.ok(!runtimeSrc.includes('delete_task'));
    assert.ok(!runtimeSrc.includes('create_tool'));
  });
});

/* =================================================================== */
describe('Phase 6F — I18n Keys', () => {
  let i18n;
  before(() => { i18n = read('js/i18n.js'); });

  it('VI: reviewRefineMode', () => {
    assert.ok(i18n.includes("reviewRefineMode: 'Đang chỉnh đề xuất AI'"));
  });

  it('VI: reviewRefineInput', () => {
    assert.ok(i18n.includes("reviewRefineInput: 'Chỉnh đề xuất bằng lời...'"));
  });

  it('VI: reviewConfirmBypass', () => {
    assert.ok(i18n.includes('reviewConfirmBypass'));
  });

  it('VI: reviewUndo', () => {
    assert.ok(i18n.includes("reviewUndo: 'Hoàn tác chỉnh sửa'"));
  });

  it('VI: reviewReset', () => {
    assert.ok(i18n.includes("reviewReset: 'Khôi phục đề xuất ban đầu'"));
  });

  it('VI: reviewAddBlocked', () => {
    assert.ok(i18n.includes('reviewAddBlocked'));
  });

  it('EN: reviewRefineMode', () => {
    assert.ok(i18n.includes("reviewRefineMode: 'Refining AI proposal'"));
  });

  it('EN: reviewConfirmBypass', () => {
    assert.ok(i18n.includes('reviewConfirmBypass'));
  });
});

/* =================================================================== */
describe('Phase 6F — Documentation', () => {
  it('docs/qa/ai-proposal-refinement.md exists', () => {
    const doc = read('docs/qa/ai-proposal-refinement.md');
    assert.ok(doc.includes('Phase 6F'));
    assert.ok(doc.toLowerCase().includes('operation'));
    assert.ok(doc.toLowerCase().includes('confirm'));
    assert.ok(doc.toLowerCase().includes('undo'));
    assert.ok(doc.toLowerCase().includes('privacy'));
  });
});

/* =================================================================== */
describe('Phase 6F — Phase 5C Regression', () => {
  it('runtime still has handleAgent', () => {
    assert.ok(read('js/ai-agent-runtime.js').includes('function handleAgent'));
  });

  it('runtime still has handleExternalProposal', () => {
    assert.ok(read('js/ai-agent-runtime.js').includes('function handleExternalProposal'));
  });

  it('runtime still has _renderCardFull', () => {
    assert.ok(read('js/ai-agent-runtime.js').includes('function _renderCardFull'));
  });

  it('runtime still has confirm-time revalidation', () => {
    const src = read('js/ai-agent-runtime.js');
    assert.ok(src.includes('validateProposal(selectedProposal, ctx)'));
    assert.ok(src.includes('dryRun(selectedProposal, ctx)'));
  });
});

/* =================================================================== */
describe('Phase 6F — Phase 6D Regression', () => {
  it('server still has FILE_AGENT_ACTION_TYPES', () => {
    assert.ok(read('server/ai.js').includes('FILE_AGENT_ACTION_TYPES'));
  });

  it('server still has validateFileAgentProposal', () => {
    assert.ok(read('server/ai.js').includes('validateFileAgentProposal'));
  });

  it('chat.js still routes to file-agent', () => {
    assert.ok(read('js/chat.js').includes('/api/ai/file-agent'));
  });
});

/* =================================================================== */
describe('Phase 6F — Phase 6E Regression', () => {
  it('explainability module exists', () => {
    assert.ok(read('js/ai-explainability.js').includes('TaskFlowAIExplainability'));
  });

  it('runtime has Why button', () => {
    assert.ok(read('js/ai-agent-runtime.js').includes('agent-why-btn'));
  });
});
