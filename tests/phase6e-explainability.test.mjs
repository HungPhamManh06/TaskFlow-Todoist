/**
 * Phase 6E: AI Explainability + Provenance — Comprehensive Test Suite
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

describe('Phase 6E — Provenance Schema', () => {
  let mod;
  before(async () => {
    const src = read('js/ai-explainability.js');
    const vm = await import('node:vm');
    const ctx = { window: {}, globalThis: {}, module: {}, exports: {} };
    const script = new vm.Script(src, { filename: 'ai-explainability.js' });
    const sandbox = vm.createContext(ctx);
    script.runInContext(sandbox);
    mod = ctx.window.TaskFlowAIExplainability;
  });

  it('exports provenance version', () => {
    assert.equal(mod.PROVENANCE_VERSION, 1);
  });

  it('exports allowed factor types', () => {
    assert.ok(Array.isArray(mod.ALLOWED_FACTOR_TYPES));
    assert.ok(mod.ALLOWED_FACTOR_TYPES.includes('user-request'));
    assert.ok(mod.ALLOWED_FACTOR_TYPES.includes('document-evidence'));
    assert.ok(mod.ALLOWED_FACTOR_TYPES.includes('saved-preference'));
    assert.ok(mod.ALLOWED_FACTOR_TYPES.includes('conflict'));
    assert.ok(mod.ALLOWED_FACTOR_TYPES.includes('duplicate-check'));
    assert.ok(mod.ALLOWED_FACTOR_TYPES.includes('past-deadline'));
    assert.ok(mod.ALLOWED_FACTOR_TYPES.includes('dependency-select'));
  });

  it('factor types DO NOT include chain-of-thought or reasoning', () => {
    assert.ok(!mod.ALLOWED_FACTOR_TYPES.includes('chain-of-thought'));
    assert.ok(!mod.ALLOWED_FACTOR_TYPES.includes('reasoning'));
    assert.ok(!mod.ALLOWED_FACTOR_TYPES.includes('hidden-reasoning'));
    assert.ok(!mod.ALLOWED_FACTOR_TYPES.includes('thoughts'));
  });

  it('normalizeProvenance accepts valid source', () => {
    const p = mod.normalizeProvenance('file', [{ type: 'document-evidence', label: 'Assignment 1 due Sep 20' }]);
    assert.ok(p);
    assert.equal(p.source, 'file');
    assert.equal(p.factors.length, 1);
    assert.equal(p.version, 1);
  });

  it('normalizeProvenance rejects invalid source', () => {
    const p = mod.normalizeProvenance('unknown', []);
    assert.equal(p, null);
  });

  it('normalizeProvenance caps at 6 factors', () => {
    const factors = [];
    for (let i = 0; i < 10; i++) {
      factors.push({ type: 'user-request', label: 'Factor ' + i });
    }
    const p = mod.normalizeProvenance('taskflow', factors);
    assert.equal(p.factors.length, 6);
  });

  it('normalizeProvenance caps label at 160 chars', () => {
    const longLabel = 'A'.repeat(300);
    const p = mod.normalizeProvenance('taskflow', [{ type: 'user-request', label: longLabel }]);
    assert.ok(p.factors[0].label.length <= 160);
  });

  it('normalizeProvenance drops invalid factor types', () => {
    const p = mod.normalizeProvenance('taskflow', [
      { type: 'user-request', label: 'Valid' },
      { type: 'invalid-type', label: 'Should be dropped' },
    ]);
    assert.equal(p.factors.length, 1);
    assert.equal(p.factors[0].type, 'user-request');
  });

  it('normalizeProvenance drops factors with empty labels', () => {
    const p = mod.normalizeProvenance('taskflow', [
      { type: 'user-request', label: '' },
      { type: 'user-request', label: '  ' },
    ]);
    assert.equal(p.factors.length, 0);
  });
});

describe('Phase 6E — validateProvenance', () => {
  let mod;
  before(async () => {
    const src = read('js/ai-explainability.js');
    const vm = await import('node:vm');
    const ctx = { window: {}, globalThis: {}, module: {}, exports: {} };
    const script = new vm.Script(src, { filename: 'ai-explainability.js' });
    const sandbox = vm.createContext(ctx);
    script.runInContext(sandbox);
    mod = ctx.window.TaskFlowAIExplainability;
  });

  it('validates correct provenance', () => {
    const p = mod.normalizeProvenance('file', [{ type: 'document-evidence', label: 'Test' }]);
    const v = mod.validateProvenance(p);
    assert.ok(v.ok);
  });

  it('rejects non-object', () => {
    assert.ok(!mod.validateProvenance(null).ok);
    assert.ok(!mod.validateProvenance('string').ok);
  });

  it('rejects wrong version', () => {
    assert.ok(!mod.validateProvenance({ version: 99, source: 'file', factors: [] }).ok);
  });

  it('rejects invalid source', () => {
    assert.ok(!mod.validateProvenance({ version: 1, source: 'invalid', factors: [] }).ok);
  });

  it('rejects non-array factors', () => {
    assert.ok(!mod.validateProvenance({ version: 1, source: 'file', factors: 'bad' }).ok);
  });

  it('rejects factor with disallowed type', () => {
    const p = mod.normalizeProvenance('taskflow', []);
    p.factors = [{ type: 'chain-of-thought', label: 'sneaky' }];
    assert.ok(!mod.validateProvenance(p).ok);
  });
});

describe('Phase 6E — buildActionFactors', () => {
  let mod;
  before(async () => {
    const src = read('js/ai-explainability.js');
    const vm = await import('node:vm');
    const ctx = { window: {}, globalThis: {}, module: {}, exports: {} };
    const script = new vm.Script(src, { filename: 'ai-explainability.js' });
    const sandbox = vm.createContext(ctx);
    script.runInContext(sandbox);
    mod = ctx.window.TaskFlowAIExplainability;
  });

  it('builds factors for create_task from file', () => {
    const action = { id: 'a1', type: 'create_task', args: { text: 'Submit report', date: '2026-09-20', duration: 60 } };
    const prov = mod.buildActionFactors(action, {
      fileSource: { kind: 'document', evidence: 'Report due Sep 20' },
    });
    assert.equal(prov.source, 'file');
    assert.ok(prov.factors.some(f => f.type === 'document-evidence'));
    assert.ok(prov.factors.some(f => f.type === 'explicit-deadline'));
  });

  it('builds factors for schedule_task', () => {
    const action = { id: 'a2', type: 'schedule_task', args: { date: '2026-09-19', start: '20:00', duration: 60, taskRef: { kind: 'action', actionId: 'a1' } } };
    const prov = mod.buildActionFactors(action, {});
    assert.ok(prov.factors.some(f => f.type === 'timeblock-availability'));
    assert.ok(prov.factors.some(f => f.type === 'dependency-select'));
  });

  it('adds user-edit factor when edit state present', () => {
    const action = { id: 'a1', type: 'create_task', args: { text: 'Task', date: '2026-09-20' } };
    const prov = mod.buildActionFactors(action, { editState: true });
    assert.ok(prov.factors.some(f => f.type === 'user-edit'));
  });

  it('adds duplicate-check factor from warnings', () => {
    const action = { id: 'a1', type: 'create_task', args: { text: 'Task', date: null } };
    const prov = mod.buildActionFactors(action, {
      warnings: [{ code: 'duplicate' }],
    });
    assert.ok(prov.factors.some(f => f.type === 'duplicate-check'));
  });

  it('adds conflict factor from warnings', () => {
    const action = { id: 'a1', type: 'schedule_task', args: { date: '2026-09-20', start: '20:00', duration: 60 } };
    const prov = mod.buildActionFactors(action, {
      warnings: [{ code: 'conflict' }],
    });
    assert.ok(prov.factors.some(f => f.type === 'conflict'));
  });

  it('adds past-deadline factor from warnings', () => {
    const action = { id: 'a1', type: 'create_task', args: { text: 'Task', date: '2020-01-01' } };
    const prov = mod.buildActionFactors(action, {
      warnings: [{ code: 'past-deadline' }],
    });
    assert.ok(prov.factors.some(f => f.type === 'past-deadline'));
  });
});

describe('Phase 6E — formatActionExplanation', () => {
  let mod;
  before(async () => {
    const src = read('js/ai-explainability.js');
    const vm = await import('node:vm');
    const ctx = { window: {}, globalThis: {}, module: {}, exports: {} };
    const script = new vm.Script(src, { filename: 'ai-explainability.js' });
    const sandbox = vm.createContext(ctx);
    script.runInContext(sandbox);
    mod = ctx.window.TaskFlowAIExplainability;
  });

  it('formats VI explanation', () => {
    const prov = mod.normalizeProvenance('file', [
      { type: 'document-evidence', label: 'Assignment 1 due Sep 20' },
      { type: 'explicit-deadline', label: 'Deadline: 2026-09-20' },
    ]);
    const text = mod.formatActionExplanation(prov, 'vi');
    assert.ok(text.includes('Vì sao AI đề xuất'));
    assert.ok(text.includes('Assignment 1 due Sep 20'));
    assert.ok(text.includes('Có trong tài liệu'));
    assert.ok(text.includes('Deadline'));
  });

  it('formats EN explanation', () => {
    const prov = mod.normalizeProvenance('taskflow', [
      { type: 'saved-preference', label: 'Focus session: 50 min' },
    ]);
    const text = mod.formatActionExplanation(prov, 'en');
    assert.ok(text.includes('Why this action'));
    assert.ok(text.includes('Focus session: 50 min'));
    assert.ok(text.includes('Saved preference'));
  });

  it('returns fallback for empty factors', () => {
    const prov = mod.normalizeProvenance('taskflow', []);
    const text = mod.formatActionExplanation(prov, 'vi');
    assert.ok(text.includes('Không có giải thích'));
  });
});

describe('Phase 6E — Context Usage Summary', () => {
  let mod;
  before(async () => {
    const src = read('js/ai-explainability.js');
    const vm = await import('node:vm');
    const ctx = { window: {}, globalThis: {}, module: {}, exports: {} };
    const script = new vm.Script(src, { filename: 'ai-explainability.js' });
    const sandbox = vm.createContext(ctx);
    script.runInContext(sandbox);
    mod = ctx.window.TaskFlowAIExplainability;
  });

  it('detects tasks in context', () => {
    const ctx = { data: { tasks: [{ uid: '1', text: 'Task 1' }] } };
    const used = mod.buildContextUsageSummary(ctx, {});
    assert.ok(used.some(u => u.key === 'tasks'));
  });

  it('detects projects in context', () => {
    const ctx = { data: { projects: [{ id: 'p1', name: 'Project' }] } };
    const used = mod.buildContextUsageSummary(ctx, {});
    assert.ok(used.some(u => u.key === 'projects'));
  });

  it('detects file attachment', () => {
    const used = mod.buildContextUsageSummary({}, { fileSource: { name: 'syllabus.pdf' } });
    assert.ok(used.some(u => u.key === 'file'));
    assert.ok(used.some(u => u.label_vi === 'syllabus.pdf'));
  });

  it('detects saved preferences', () => {
    const used = mod.buildContextUsageSummary({}, { preferenceData: { defaultTaskDuration: 45 } });
    assert.ok(used.some(u => u.key === 'preferences'));
  });

  it('does NOT show Reflection when OFF', () => {
    const ctx = { data: { reflections: { weekly: [] } } };
    const used = mod.buildContextUsageSummary(ctx, { hasReflection: false });
    assert.ok(!used.some(u => u.key === 'reflections'));
  });

  it('shows Reflection only when ON and present', () => {
    const ctx = { data: { reflections: { weekly: [] } } };
    const used = mod.buildContextUsageSummary(ctx, { hasReflection: true });
    assert.ok(used.some(u => u.key === 'reflections'));
  });

  it('returns empty for empty context', () => {
    const used = mod.buildContextUsageSummary(null, {});
    assert.equal(used.length, 0);
  });

  it('formatContextUsageSummary formats VI', () => {
    const used = [{ key: 'tasks', label_vi: 'Tasks', label_en: 'Tasks' }];
    const text = mod.formatContextUsageSummary(used, 'vi');
    assert.ok(text.includes('AI đã dùng'));
    assert.ok(text.includes('Tasks'));
  });

  it('formatContextUsageSummary formats EN', () => {
    const used = [{ key: 'tasks', label_vi: 'Tasks', label_en: 'Tasks' }];
    const text = mod.formatContextUsageSummary(used, 'en');
    assert.ok(text.includes('AI used'));
  });

  it('formatContextUsageSummary handles empty', () => {
    const text = mod.formatContextUsageSummary([], 'vi');
    assert.ok(text.includes('không dùng'));
  });
});

describe('Phase 6E — Disabled Reason', () => {
  let mod;
  before(async () => {
    const src = read('js/ai-explainability.js');
    const vm = await import('node:vm');
    const ctx = { window: {}, globalThis: {}, module: {}, exports: {} };
    const script = new vm.Script(src, { filename: 'ai-explainability.js' });
    const sandbox = vm.createContext(ctx);
    script.runInContext(sandbox);
    mod = ctx.window.TaskFlowAIExplainability;
  });

  it('formats dependency-not-selected', () => {
    const text = mod.formatDisabledReason('dependency-not-selected', 'vi');
    assert.ok(text.includes('task cha'));
  });

  it('formats past-deadline', () => {
    const text = mod.formatDisabledReason('past-deadline', 'vi');
    assert.ok(text.includes('Deadline đã qua'));
  });

  it('formats conflict', () => {
    const text = mod.formatDisabledReason('conflict', 'vi');
    assert.ok(text.includes('xung đột'));
  });
});

/* ===================================================================
   Source Code Structural Tests
   =================================================================== */

describe('Phase 6E — Source Code Structure', () => {
  it('ai-explainability.js exists and is UMD', () => {
    const src = read('js/ai-explainability.js');
    assert.ok(src.includes('TaskFlowAIExplainability'));
    assert.ok(src.includes('typeof module'));
  });

  it('ai-explainability.min.js exists', () => {
    const min = read('js/ai-explainability.min.js');
    assert.ok(min.length > 100);
    assert.ok(min.includes('TaskFlowAIExplainability'));
  });

  it('ai-agent-runtime.js has Why button', () => {
    const src = read('js/ai-agent-runtime.js');
    assert.ok(src.includes('agent-why-btn'));
    assert.ok(src.includes('reviewWhy'));
    assert.ok(src.includes('review-why-'));
    assert.ok(src.includes('review-why-panel-'));
  });

  it('ai-agent-runtime.js has data-used summary', () => {
    const src = read('js/ai-agent-runtime.js');
    assert.ok(src.includes('agent-data-used'));
    assert.ok(src.includes('review-data-used'));
    assert.ok(src.includes('buildContextUsageSummary'));
    assert.ok(src.includes('formatContextUsageSummary'));
  });

  it('ai-agent-runtime.js uses TaskFlowAIExplainability', () => {
    const src = read('js/ai-agent-runtime.js');
    assert.ok(src.includes('TaskFlowAIExplainability.buildActionFactors'));
    assert.ok(src.includes('TaskFlowAIExplainability.formatActionExplanation'));
    assert.ok(src.includes('TaskFlowAIExplainability.buildContextUsageSummary'));
  });

  it('no chain-of-thought or hidden reasoning fields in runtime', () => {
    const src = read('js/ai-agent-runtime.js');
    assert.ok(!src.includes('chainOfThought'));
    assert.ok(!src.includes('reasoningTrace'));
    assert.ok(!src.includes('hiddenReasoning'));
    assert.ok(!src.includes('internalSteps'));
  });

  it('Why button has aria-expanded', () => {
    const src = read('js/ai-agent-runtime.js');
    assert.ok(src.includes("setAttribute('aria-expanded', 'false')"));
  });

  it('Why panel has role=region', () => {
    const src = read('js/ai-agent-runtime.js');
    assert.ok(src.includes("setAttribute('role', 'region')"));
  });
});

describe('Phase 6E — Lazy Load Chain', () => {
  it('app.js includes ai-explainability in lazy chain', () => {
    const src = read('js/app.js');
    assert.ok(src.includes('ai-explainability.min.js'));
    assert.ok(src.includes('ai-explainability.min.js') && src.includes('ai-agent-runtime.min.js'));
  });

  it('sw.js precaches ai-explainability', () => {
    const sw = read('sw.js');
    assert.ok(sw.includes('ai-explainability.min.js'));
  });
});

describe('Phase 6E — I18n Keys', () => {
  let i18n;
  before(() => { i18n = read('js/i18n.js'); });

  it('VI has reviewWhy', () => {
    assert.ok(i18n.includes("reviewWhy: 'Tại sao?'"));
  });

  it('VI has reviewWhyTitle', () => {
    assert.ok(i18n.includes("reviewWhyTitle: 'Vì sao AI đề xuất việc này?'"));
  });

  it('VI has reviewDataUsed', () => {
    assert.ok(i18n.includes("reviewDataUsed: 'AI đã dùng:'"));
  });

  it('VI has reviewSourceDocument', () => {
    assert.ok(i18n.includes("reviewSourceDocument: 'Trích từ tài liệu'"));
  });

  it('EN has reviewWhy', () => {
    assert.ok(i18n.includes("reviewWhy: 'Why?'"));
  });

  it('EN has reviewWhyTitle', () => {
    assert.ok(i18n.includes("reviewWhyTitle: 'Why was this action suggested?'"));
  });

  it('EN has reviewDataUsed', () => {
    assert.ok(i18n.includes("reviewDataUsed: 'AI used:'"));
  });
});

describe('Phase 6E — CSS', () => {
  it('styles-critical.css has Why button styles', () => {
    const css = read('css/styles-critical.css');
    assert.ok(css.includes('.agent-why-btn'));
    assert.ok(css.includes('.agent-why-panel'));
    assert.ok(css.includes('.agent-why-title'));
    assert.ok(css.includes('.agent-data-used'));
  });
});

describe('Phase 6E — Phase 6D Regression', () => {
  it('server/ai.js still has FILE_AGENT_ACTION_TYPES', () => {
    const src = read('server/ai.js');
    assert.ok(src.includes('FILE_AGENT_ACTION_TYPES'));
  });

  it('server/ai.js still has validateFileAgentProposal', () => {
    const src = read('server/ai.js');
    assert.ok(src.includes('validateFileAgentProposal'));
  });

  it('chat.js still routes to file-agent', () => {
    const src = read('js/chat.js');
    assert.ok(src.includes('/api/ai/file-agent'));
  });
});

describe('Phase 6E — Phase 5C Regression', () => {
  it('runtime still has handleAgent', () => {
    const src = read('js/ai-agent-runtime.js');
    assert.ok(src.includes('function handleAgent'));
  });

  it('runtime still has handleExternalProposal', () => {
    const src = read('js/ai-agent-runtime.js');
    assert.ok(src.includes('function handleExternalProposal'));
  });

  it('runtime still has _renderCardFull', () => {
    const src = read('js/ai-agent-runtime.js');
    assert.ok(src.includes('function _renderCardFull'));
  });

  it('runtime still has confirm-time revalidation', () => {
    const src = read('js/ai-agent-runtime.js');
    assert.ok(src.includes('validateProposal(selectedProposal, ctx)'));
    assert.ok(src.includes('dryRun(selectedProposal, ctx)'));
  });

  it('no new write capabilities added', () => {
    const src = read('js/ai-agent-runtime.js');
    assert.ok(!src.includes('delete_task'));
    assert.ok(!src.includes('create_tool'));
  });
});

describe('Phase 6E — Documentation', () => {
  it('docs/qa/ai-explainability.md exists with key content', () => {
    const doc = read('docs/qa/ai-explainability.md');
    assert.ok(doc.includes('Phase 6E'));
    assert.ok(doc.includes('chain-of-thought'));
    assert.ok(doc.includes('provenance'));
    assert.ok(doc.includes('factor'));
    assert.ok(doc.toLowerCase().includes('ephemeral'));
    assert.ok(doc.toLowerCase().includes('privacy'));
  });
});

describe('Phase 6E — No Hidden Prompts', () => {
  it('explainability.js has no system prompt references', () => {
    const src = read('js/ai-explainability.js');
    assert.ok(!src.includes('SYSTEM_INSTRUCTION'));
    // The file may mention 'system prompt' in comments (e.g., 'no system prompt exposure') — that's safe
    // But must not reference actual prompts as data
    assert.ok(!src.includes('system_prompt'));
    assert.ok(!src.includes('developer_prompt'));
  });

  it('runtime Why panel does not expose system instructions', () => {
    const src = read('js/ai-agent-runtime.js');
    // The why panel only uses buildActionFactors + formatActionExplanation
    assert.ok(!src.includes('FILE_AGENT_INSTRUCTION'));
    assert.ok(!src.includes('AGENT_SYSTEM_INSTRUCTION'));
  });
});
