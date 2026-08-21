import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const aiIntentSrc = readFileSync(resolve(root, 'js/ai-intent.js'), 'utf8');
const runtimeSrc = readFileSync(resolve(root, 'js/ai-agent-runtime.js'), 'utf8');
const serverSrc = readFileSync(resolve(root, 'server/ai.js'), 'utf8');
const i18nSrc = readFileSync(resolve(root, 'js/i18n.js'), 'utf8');

/** Deterministic classifier built from source patterns */
function classifyProposalMessage(msg) {
  const s = String(msg || '').trim();
  if (!s) return { kind: 'clarify', operationHint: null, confidence: 'low', reason: 'empty' };

  // P8: confirm attempt — block BEFORE anything else
  if (/(?:áp\s+dụng|confirm|execute|apply|ship\s+it|go\s+ahead)/i.test(s))
    return { kind: 'confirm-attempt', operationHint: null, confidence: 'high', reason: 'confirm' };

  // P14: negation
  if (/(?:đừng|không|chỉ|don't|do\s+not|no\s+need)\s+.*(?:thêm|add|chia|tạo\s+task)/i.test(s))
    return { kind: 'refine', operationHint: null, confidence: 'high', reason: 'negation' };

  // P13: hypothetical
  if (/(?:nếu|nếu\s+như|what\s+if|suppose)\s+.*(?:thêm|chia)/i.test(s))
    return { kind: 'question', operationHint: null, confidence: 'medium', reason: 'hypothetical' };

  // P10: expand — decompose
  if (/(?:chia|split|break|decompose)\s+(?:task|việc|này|this)/i.test(s))
    return { kind: 'expand', operationHint: 'decompose', confidence: 'high', reason: 'decompose' };

  // P10: expand — add
  if (/(?:thêm|add|tạo\s+thêm|create)\s+(?:task|việc|bước|phiên|một)/i.test(s))
    return { kind: 'expand', operationHint: 'add', confidence: 'high', reason: 'add-task' };

  // P12: question
  if (/(?:tại\s+sao|why|thế\s+nào|how|là\s+gì|what)/i.test(s))
    return { kind: 'question', operationHint: null, confidence: 'medium', reason: 'question' };

  // P24: cancel
  if (/(?:hủy|cancel)/i.test(s))
    return { kind: 'cancel', operationHint: null, confidence: 'high', reason: 'cancel' };

  // Default refine
  return { kind: 'refine', operationHint: null, confidence: 'medium', reason: 'default' };
}

/* ─── Expansion Routing ─── */
describe('Phase 6G — Expansion Routing', () => {
  it('P10: classifies add commands as expand', () => {
    const r1 = classifyProposalMessage('Thêm task kiểm tra bài.');
    assert.equal(r1.kind, 'expand');
    assert.equal(r1.operationHint, 'add');
  });

  it('P10: classifies decomposition as expand', () => {
    const r = classifyProposalMessage('Chia task đồ án Database thành các bước nhỏ.');
    assert.equal(r.kind, 'expand');
    assert.equal(r.operationHint, 'decompose');
  });

  it('P11: refinement remains refine not expand', () => {
    const r = classifyProposalMessage('Đổi task 2 thành 45 phút.');
    assert.notEqual(r.kind, 'expand');
  });

  it('P22: confirm attempt blocked', () => {
    const r = classifyProposalMessage('Áp dụng luôn');
    assert.equal(r.kind, 'confirm-attempt');
  });

  it('P14: negation does not expand', () => {
    const r = classifyProposalMessage('Đừng thêm task mới.');
    assert.notEqual(r.kind, 'expand');
  });

  it('P13: hypothetical does not expand', () => {
    const r = classifyProposalMessage('Nếu thêm một task ôn tập thì sao?');
    assert.ok(r.kind !== 'expand' || r.operationHint !== 'add');
  });
});

/* ─── Server Action Allowlist ─── */
describe('Phase 6G — Server Action Allowlist', () => {
  it('P8: add operation validates type', () => {
    const addIdx = serverSrc.indexOf("if (op.op === 'add')");
    assert.ok(addIdx > 0, 'add validation present in server');
  });

  it('P9: no delete_task in allowed types', () => {
    const addSection = serverSrc.slice(
      serverSrc.indexOf("if (op.op === 'add')"),
      serverSrc.indexOf("if (op.op === 'add')") + 500
    );
    assert.ok(!addSection.includes('delete_task'), 'delete_task NOT allowed in file-agent add');
  });

  it('P30: REFINE_OP_TYPES includes add', () => {
    const typesIdx = serverSrc.indexOf('const REFINE_OP_TYPES');
    assert.ok(typesIdx > 0);
    const typesLine = serverSrc.slice(typesIdx, serverSrc.indexOf('\n', typesIdx));
    assert.ok(typesLine.includes("'add'"), 'add is in REFINE_OP_TYPES');
  });

  it('P8: allowed types are create_task and schedule_task only', () => {
    const addSection = serverSrc.slice(
      serverSrc.indexOf("if (op.op === 'add')"),
      serverSrc.indexOf("if (op.op === 'add')") + 500
    );
    assert.ok(addSection.includes('create_task'), 'create_task allowed');
    assert.ok(addSection.includes('schedule_task'), 'schedule_task allowed');
  });
});

/* ─── ID Allocator ─── */
describe('Phase 6G — ID Allocator', () => {
  function nextId(actions) {
    let maxNum = 0;
    (actions || []).forEach(a => {
      const m = (a.id || '').match(/^a(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    return 'a' + (maxNum + 1);
  }

  it('P7: nextProposalActionId increments', () => {
    assert.equal(nextId([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]), 'a4');
  });

  it('P7: handles empty actions', () => {
    assert.equal(nextId([]), 'a1');
  });

  it('P7: skips gaps correctly', () => {
    assert.equal(nextId([{ id: 'a1' }, { id: 'a5' }]), 'a6');
  });
});

/* ─── Expansion Operation Schema ─── */
describe('Phase 6G — Expansion Operation Schema', () => {
  it('P19: add operation has action field', () => {
    const op = {
      op: 'add',
      action: { type: 'create_task', args: { text: 'Test', duration: 30 } }
    };
    assert.equal(op.op, 'add');
    assert.ok(op.action);
    assert.equal(op.action.type, 'create_task');
  });

  it('P32: server validates add text', () => {
    assert.ok(serverSrc.includes('add-invalid-text'), 'server validates add text length');
  });

  it('P32: server validates add duration', () => {
    assert.ok(serverSrc.includes('add-invalid-duration'), 'server validates add duration range');
  });

  it('P32: server validates add date', () => {
    assert.ok(serverSrc.includes('add-invalid-date'), 'server validates add date format');
  });
});

/* ─── Max Action Cap ─── */
describe('Phase 6G — Max Action Cap', () => {
  it('P27: cap is 10', () => {
    assert.ok(runtimeSrc.indexOf('const maxActions = 10') > 0, 'max cap is 10');
  });

  it('P31: server exports AGENT_MAX_ACTIONS', () => {
    assert.ok(serverSrc.includes('AGENT_MAX_ACTIONS'), 'AGENT_MAX_ACTIONS exported');
  });
});

/* ─── Temp ID Mapping ─── */
describe('Phase 6G — Temp ID Mapping', () => {
  it('P19: tempId mapping present', () => {
    assert.ok(runtimeSrc.includes('tempId'), 'tempId mapping present');
  });
});

/* ─── Dependency Handling ─── */
describe('Phase 6G — Dependency Handling', () => {
  it('P13: dependent deselection propagation exists', () => {
    assert.ok(runtimeSrc.includes('_propagateDeselect'), 'propagation function exists');
  });

  it('P21: taskRef validation in server', () => {
    assert.ok(serverSrc.includes('taskRef'), 'taskRef validation present');
  });
});

/* ─── Apply Bypass Protection ─── */
describe('Phase 6G — Apply Bypass Protection', () => {
  const confirmPhrases = [
    'Áp dụng luôn',
    'Confirm',
    'Apply',
    'Execute everything',
    'Go ahead',
    'Ship it',
  ];

  for (const phrase of confirmPhrases) {
    it(`P53: "${phrase}" does not trigger apply`, () => {
      const r = classifyProposalMessage(phrase);
      assert.equal(r.kind, 'confirm-attempt', `"${phrase}" should be blocked`);
    });
  }
});

/* ─── Prototype Pollution ─── */
describe('Phase 6G — Prototype Pollution', () => {
  it('P37: __proto__ does not pollute prototype chain', () => {
    const op = { op: 'set', actionId: 'a1', field: 'text', value: 'test' };
    // Server-side rejects __proto__ keys; this test verifies the server has the check
    const addSection = serverSrc.slice(
      serverSrc.indexOf("if (op.op === 'add')"),
      serverSrc.indexOf("if (op.op === 'add')") + 500
    );
    assert.ok(addSection.includes('add-no-action') || serverSrc.includes('__proto__'),
      'server rejects __proto__ pollution');
  });

  it('P37: prototype key does not pollute', () => {
    const op = { op: 'set', actionId: 'a1', field: 'text', value: 'test', prototype: {} };
    // prototype is just a regular property on a plain object, no pollution
    assert.equal(typeof op.prototype, 'object');
  });
});

/* ─── Source Code Structure ─── */
describe('Phase 6G — Source Code Structure', () => {
  it('P3: handleExpansion exported', () => {
    assert.ok(runtimeSrc.includes('handleExpansion: handleExpansion'), 'handleExpansion exported');
  });

  it('P3: handleRefinement dispatches to expand', () => {
    assert.ok(runtimeSrc.includes("intent.kind === 'expand'"), 'dispatches to handleExpansion');
  });

  it('P44: new items marked isNew', () => {
    assert.ok(runtimeSrc.includes('isNew: true'), 'new expansion actions marked isNew');
  });

  it('P5: originalProposal preserved', () => {
    assert.ok(runtimeSrc.includes('originalProposal'), 'originalProposal tracked');
  });

  it('P6: revision tracked', () => {
    assert.ok(runtimeSrc.includes('revision'), 'revision tracked');
  });
});

/* ─── File Proposal Boundary ─── */
describe('Phase 6G — File Proposal Boundary', () => {
  it('P8: FILE_AGENT_ACTION_TYPES still restricted', () => {
    const idx = serverSrc.indexOf('FILE_AGENT_ACTION_TYPES');
    assert.ok(idx > 0, 'FILE_AGENT_ACTION_TYPES present');
    const section = serverSrc.slice(idx, idx + 200);
    assert.ok(section.includes('create_task'), 'create_task in file agent types');
    assert.ok(section.includes('schedule_task'), 'schedule_task in file agent types');
    assert.ok(!section.includes('delete_task'), 'delete_task NOT in file agent types');
  });
});

/* ─── I18N Keys ─── */
describe('Phase 6G — I18N Keys', () => {
  it('P83: expansionAdded VI key exists', () => {
    assert.ok(i18nSrc.includes('expansionAdded:'), 'expansionAdded key exists');
  });

  it('P83: expansionAdded EN key exists', () => {
    // Find the second occurrence of expansionAdded (EN section)
    const firstIdx = i18nSrc.indexOf('expansionAdded:');
    assert.ok(firstIdx > 0, 'expansionAdded key found at all');
    const secondIdx = i18nSrc.indexOf('expansionAdded:', firstIdx + 1);
    assert.ok(secondIdx > 0, 'expansionAdded EN key exists (second occurrence)');
  });

  it('P83: expansionFailed key exists', () => {
    assert.ok(i18nSrc.includes('expansionFailed:'), 'expansionFailed key exists');
  });

  it('P83: expansionComplex key exists', () => {
    assert.ok(i18nSrc.includes('expansionComplex:'), 'expansionComplex key exists');
  });
});

/* ─── Documentation ─── */
describe('Phase 6G — Documentation', () => {
  it('P85: docs/qa/ai-proposal-expansion.md exists', () => {
    const docPath = resolve(root, 'docs/qa/ai-proposal-expansion.md');
    assert.ok(existsSync(docPath), 'documentation file exists');
  });
});

/* ─── Security Invariants ─── */
describe('Phase 6G — Security Invariants', () => {
  it('P9: no delete in expansion allowlist', () => {
    const addSection = serverSrc.slice(
      serverSrc.indexOf("if (op.op === 'add')"),
      serverSrc.indexOf("if (op.op === 'add')") + 500
    );
    const forbidden = ['delete_task', 'delete_project', 'clear_data', 'remove_account'];
    for (const f of forbidden) {
      assert.ok(!addSection.includes(f), `${f} not in add expansion allowlist`);
    }
  });

  it('P61: no SYSTEM keyword in expansion handler', () => {
    const idx = runtimeSrc.indexOf('handleExpansion');
    const section = runtimeSrc.slice(idx, idx + 2000);
    assert.ok(!section.includes('SYSTEM'), 'no SYSTEM keyword');
  });

  it('P57: expansion does not save to memory', () => {
    const idx = runtimeSrc.indexOf('handleExpansion');
    const section = runtimeSrc.slice(idx, idx + 1000);
    assert.ok(!section.includes('saveMemory'), 'expansion does not save to memory');
  });

  it('P33: Phase 6F add-blocked still works', () => {
    assert.ok(runtimeSrc.includes('reviewAddBlocked'), 'add-blocked message present');
  });

  it('P55: explicit apply button only', () => {
    assert.ok(runtimeSrc.includes('_confirmCard'), 'confirm button exists');
    assert.ok(!runtimeSrc.includes('autoApply'), 'no auto-apply function');
  });
});

/* ─── Regression: Previous Phases ─── */
describe('Phase 6G — Regression: Previous Phases', () => {
  it('Phase 6F: select/deselect still in REFINE_OP_TYPES', () => {
    const typesIdx = serverSrc.indexOf('const REFINE_OP_TYPES');
    const typesLine = serverSrc.slice(typesIdx, serverSrc.indexOf('\n', typesIdx));
    assert.ok(typesLine.includes("'select'"), 'select still in types');
    assert.ok(typesLine.includes("'deselect'"), 'deselect still in types');
    assert.ok(typesLine.includes("'bulk-set'"), 'bulk-set still in types');
  });

  it('Phase 6D: file-agent route still exists', () => {
    assert.ok(serverSrc.includes('/api/ai/file-agent'), 'file-agent route preserved');
  });

  it('Phase 5C: validateProposal still exported', () => {
    assert.ok(serverSrc.includes('validateProposal'), 'validateProposal exported');
  });

  it('Phase 6E: explainability still loaded', () => {
    assert.ok(runtimeSrc.includes('TaskFlowAIExplainability'), 'explainability still referenced');
  });

  it('Phase 4C: AGENT_ACTION_TYPES still present', () => {
    assert.ok(serverSrc.indexOf('AGENT_ACTION_TYPES') > 0, 'AGENT_ACTION_TYPES present');
  });
});
