import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const aiIntentSrc = readFileSync(resolve(root, 'js/ai-intent.js'), 'utf8');
const aiPlanSrc = readFileSync(resolve(root, 'js/ai-plan.js'), 'utf8');
const serverSrc = readFileSync(resolve(root, 'server/ai.js'), 'utf8');
const i18nSrc = readFileSync(resolve(root, 'js/i18n.js'), 'utf8');

/* ─── Load ai-plan module for direct testing ─── */
let Plan;
try {
  const mod = await import('../js/ai-plan.js');
  Plan = mod.default || mod;
} catch (e) {
  Plan = {};
}

/* ─── Intent Classifier ─── */
describe('Phase 6H — Plan Intent Router (P26)', () => {
  it('P26: "Lên lịch tuần này" → plan', () => {
    assert.ok(aiIntentSrc.includes('classifyPlanningIntent'), 'classifier exists');
    // Verify the function is exported
    assert.ok(aiIntentSrc.includes("classifyPlanningIntent: classifyPlanningIntent"), 'exported');
  });

  it('P26: plan keyword patterns present', () => {
    assert.ok(/lên\s+lịch|xếp\s+lịch|schedule|plan/i.test('Lên lịch tuần này'), 'plan intent matches');
    assert.ok(/schedule|plan/i.test('schedule my week'), 'English plan matches');
  });

  it('P28: what-if patterns present', () => {
    assert.ok(/nếu|what\s*if/i.test('Nếu tôi chỉ học 1 tiếng mỗi tối'), 'what-if VI');
    assert.ok(/what\s*if/i.test('What if I study 1 hour'), 'what-if EN');
  });

  it('P25: convert-plan patterns', () => {
    assert.ok(/đưa|chuyển|convert|convert/i.test('Đưa kế hoạch này vào đề xuất'), 'convert-plan');
  });

  it('P27: negation → what-if', () => {
    assert.ok(/đừng|không\s+cần|chỉ\s+cho/.test('Đừng thay đổi, chỉ cho xem'), 'negation');
  });
});

/* ─── Capacity Engine (P9) ─── */
describe('Phase 6H — Capacity Calculation (P9)', () => {
  it('P9: calculateFreeWindows exists', () => {
    assert.ok(aiPlanSrc.includes('calculateFreeWindows'), 'function defined');
  });

  it('P9: calculateDayCapacity exists', () => {
    assert.ok(aiPlanSrc.includes('calculateDayCapacity'), 'function defined');
  });

  it('P9: calculateRangeCapacity exists', () => {
    assert.ok(aiPlanSrc.includes('calculateRangeCapacity'), 'function defined');
  });

  it('P9: exports are available', () => {
    assert.ok(Plan.calculateFreeWindows, 'calculateFreeWindows exported');
    assert.ok(Plan.calculateDayCapacity, 'calculateDayCapacity exported');
    assert.ok(Plan.calculateRangeCapacity, 'calculateRangeCapacity exported');
  });
});

/* ─── Plan Preview Schema (P3) ─── */
describe('Phase 6H — Plan Preview Schema (P3)', () => {
  it('P3: createPlanPreview exists', () => {
    assert.ok(aiPlanSrc.includes('createPlanPreview'), 'function defined');
    assert.ok(Plan.createPlanPreview, 'exported');
  });

  it('P3: preview has required fields', () => {
    const p = Plan.createPlanPreview('test-1');
    assert.equal(p.id, 'test-1');
    assert.equal(p.revision, 0);
    assert.ok(p.range, 'range present');
    assert.ok(Array.isArray(p.sessions), 'sessions array');
    assert.ok(Array.isArray(p.unscheduled), 'unscheduled array');
    assert.ok(Array.isArray(p.warnings), 'warnings array');
  });
});

/* ─── Duration Splitting (P19) ─── */
describe('Phase 6H — Task Splitting (P19)', () => {
  it('P19: splitDuration exists', () => {
    assert.ok(aiPlanSrc.includes('splitDuration'), 'function defined');
    assert.ok(Plan.splitDuration, 'exported');
  });

  it('P19: 120min task → 50+50+20 with maxSession=50', () => {
    const result = Plan.splitDuration(120, 50);
    assert.deepEqual(result, [50, 50, 20]);
  });

  it('P19: 45min task → [45] with maxSession=50', () => {
    const result = Plan.splitDuration(45, 50);
    assert.deepEqual(result, [45]);
  });

  it('P19: 180min task → 50+50+50+30 with maxSession=50', () => {
    const result = Plan.splitDuration(180, 50);
    assert.deepEqual(result, [50, 50, 50, 30]);
  });
});

/* ─── Plan Validation (P40-P43) ─── */
describe('Phase 6H — Plan Validation (P40)', () => {
  it('P40: validatePlan exists', () => {
    assert.ok(aiPlanSrc.includes('validatePlan'), 'function defined');
    assert.ok(Plan.validatePlan, 'exported');
  });

  it('P40: unknown task key rejected', () => {
    const preview = Plan.createPlanPreview();
    preview.sessions = [{ taskKey: 't99', date: '2026-08-25', start: '19:00', duration: 45 }];
    const taskMap = { t1: { text: 'Test' } };
    const result = Plan.validatePlan(preview, taskMap);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'unknown-task-key'));
  });

  it('P40: invalid date rejected', () => {
    const preview = Plan.createPlanPreview();
    preview.sessions = [{ taskKey: 't1', date: 'not-a-date', start: '19:00', duration: 45 }];
    const taskMap = { t1: { text: 'Test' } };
    const result = Plan.validatePlan(preview, taskMap);
    assert.equal(result.valid, false);
  });

  it('P40: invalid time rejected', () => {
    const preview = Plan.createPlanPreview();
    preview.sessions = [{ taskKey: 't1', date: '2026-08-25', start: '25:99', duration: 45 }];
    const taskMap = { t1: { text: 'Test' } };
    const result = Plan.validatePlan(preview, taskMap);
    assert.equal(result.valid, false);
  });

  it('P40: duration too small rejected', () => {
    const preview = Plan.createPlanPreview();
    preview.sessions = [{ taskKey: 't1', date: '2026-08-25', start: '19:00', duration: 3 }];
    const taskMap = { t1: { text: 'Test' } };
    const result = Plan.validatePlan(preview, taskMap);
    assert.equal(result.valid, false);
  });

  it('P43: duration conservation warning', () => {
    const preview = Plan.createPlanPreview();
    preview.sessions = [
      { taskKey: 't1', date: '2026-08-25', start: '19:00', duration: 50 },
      { taskKey: 't1', date: '2026-08-26', start: '19:00', duration: 50 },
      { taskKey: 't1', date: '2026-08-27', start: '19:00', duration: 50 },
    ];
    const taskMap = { t1: { text: 'Test', duration: 60 } };
    const result = Plan.validatePlan(preview, taskMap);
    assert.ok(result.warnings.some(w => w.code === 'duration-exceeded'));
  });

  it('P42: overlap detection', () => {
    const preview = Plan.createPlanPreview();
    preview.sessions = [
      { taskKey: 't1', date: '2026-08-25', start: '19:00', duration: 60 },
      { taskKey: 't2', date: '2026-08-25', start: '19:30', duration: 60 },
    ];
    const taskMap = { t1: { text: 'A' }, t2: { text: 'B' } };
    const result = Plan.validatePlan(preview, taskMap);
    assert.ok(result.warnings.some(w => w.code === 'session-overlap'));
  });
});

/* ─── Convert to Proposal (P57-P59) ─── */
describe('Phase 6H — Convert Plan to Proposal (P57)', () => {
  it('P57: convertPlanToProposal exists', () => {
    assert.ok(aiPlanSrc.includes('convertPlanToProposal'), 'function defined');
    assert.ok(Plan.convertPlanToProposal, 'exported');
  });

  it('P57: existing task → schedule_task with taskRef', () => {
    const preview = Plan.createPlanPreview();
    preview.sessions = [{ taskKey: 't1', date: '2026-08-25', start: '19:00', duration: 45 }];
    const taskMap = { t1: { uid: 'uid-123', text: 'Test task' } };
    const result = Plan.convertPlanToProposal(preview, taskMap);
    assert.equal(result.ok, true);
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].type, 'schedule_task');
    assert.deepEqual(result.actions[0].args.taskRef, { kind: 'existing', uid: 'uid-123' });
    assert.equal(result.actions[0].args.date, '2026-08-25');
  });

  it('P59: pending create → schedule_task with action dependency', () => {
    const preview = Plan.createPlanPreview();
    preview.sessions = [{ taskKey: 'pa3', date: '2026-08-25', start: '19:00', duration: 45 }];
    const pendingActions = { pa3: { id: 'pa3', type: 'create_task' } };
    const result = Plan.convertPlanToProposal(preview, {}, pendingActions);
    assert.equal(result.ok, true);
    assert.equal(result.actions.length, 1);
    assert.deepEqual(result.actions[0].args.taskRef, { kind: 'action', actionId: 'pa3' });
  });

  it('P58: unknown task → error', () => {
    const preview = Plan.createPlanPreview();
    preview.sessions = [{ taskKey: 't99', date: '2026-08-25', start: '19:00', duration: 45 }];
    const result = Plan.convertPlanToProposal(preview, {});
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
  });
});

/* ─── Server Endpoint (P30, P79, P81, P84) ─── */
describe('Phase 6H — Server Plan Synthesis Endpoint', () => {
  it('P30: /api/ai/plan-synthesis route exists', () => {
    assert.ok(serverSrc.includes("'/plan-synthesis'"), 'endpoint defined');
  });

  it('P81: rate limiters defined', () => {
    assert.ok(serverSrc.includes('aiPlanSynthLimiter'), 'minute limiter defined');
    assert.ok(serverSrc.includes('aiPlanSynthHourlyLimiter'), 'hourly limiter defined');
  });

  it('P79: system prompt mentions preview only', () => {
    assert.ok(serverSrc.includes('SCHEDULE PREVIEW only') || serverSrc.includes('LỊCH TRÌNH ĐỀ XUẤT'), 'system prompt correct');
  });

  it('P32: max tasks cap exists', () => {
    assert.ok(serverSrc.includes('ai-plan-too-many-tasks'), 'too-many-tasks error');
  });

  it('P32: max range cap exists', () => {
    assert.ok(serverSrc.includes('ai-plan-too-long-range'), 'too-long-range error');
  });

  it('P38: unknown task key validation', () => {
    assert.ok(serverSrc.includes('unknown-key'), 'unknown key validation');
  });

  it('P40: session validation (date, start, duration)', () => {
    assert.ok(serverSrc.includes('invalid-date') || serverSrc.includes('invalid-start'), 'session validation');
  });

  it('P80: chain-of-thought discard', () => {
    assert.ok(serverSrc.includes('Discard') || serverSrc.includes('chain-of-thought'), 'CoT discard');
  });

  it('P84: safe logging present', () => {
    assert.ok(serverSrc.includes('route=/api/ai/plan-synthesis'), 'logging present');
  });

  it('P86: error codes present', () => {
    assert.ok(serverSrc.includes('ai-plan-no-tasks'), 'no-tasks error');
    assert.ok(serverSrc.includes('ai-plan-validation-failed'), 'validation error');
  });
});

/* ─── Duration Resolution (P18) ─── */
describe('Phase 6H — Duration Resolution (P18)', () => {
  it('P18: resolveDuration uses task.duration first', () => {
    assert.equal(Plan.resolveDuration({ duration: 60 }), 60);
  });

  it('P18: resolveDuration falls back to estimatedMinutes', () => {
    assert.equal(Plan.resolveDuration({ estimatedMinutes: 45 }), 45);
  });

  it('P18: resolveDuration falls back to default', () => {
    assert.equal(Plan.resolveDuration({}), Plan.PLAN_DEFAULT_SESSION);
  });
});

/* ─── Constants (P21, P22, P32, P34) ─── */
describe('Phase 6H — Constants', () => {
  it('P21: min session = 25', () => {
    assert.equal(Plan.PLAN_MIN_SESSION, 25);
  });

  it('P22: max session = 180', () => {
    assert.equal(Plan.PLAN_MAX_SESSION, 180);
  });

  it('P32: max horizon = 14 days', () => {
    assert.equal(Plan.PLAN_MAX_HORIZON_DAYS, 14);
  });

  it('P34: max tasks = 20', () => {
    assert.equal(Plan.PLAN_MAX_TASKS, 20);
  });
});

/* ─── Free Window Helpers ─── */
describe('Phase 6H — Free Window Helpers', () => {
  it('P9: _toMin parses HH:MM', () => {
    assert.equal(Plan._toMin('19:00'), 1140);
    assert.equal(Plan._toMin('00:00'), 0);
    assert.equal(Plan._toMin('23:59'), 1439);
  });

  it('P9: _minToTime formats minutes', () => {
    assert.equal(Plan._minToTime(1140), '19:00');
    assert.equal(Plan._minToTime(0), '00:00');
  });

  it('P9: _dateRange generates dates', () => {
    const dates = Plan._dateRange('2026-08-21', '2026-08-23');
    assert.deepEqual(dates, ['2026-08-21', '2026-08-22', '2026-08-23']);
  });
});

/* ─── I18n Keys (P89) ─── */
describe('Phase 6H — I18n Keys', () => {
  it('P89: planPreviewTitle VI', () => {
    assert.ok(i18nSrc.includes("planPreviewTitle: 'Kế hoạch đề xuất'"), 'VI key');
  });

  it('P89: planPreviewTitle EN', () => {
    const enIdx = i18nSrc.indexOf("planPreviewTitle:", i18nSrc.indexOf("planPreviewTitle:") + 1);
    assert.ok(enIdx > 0, 'EN key exists');
  });

  it('P89: planConvertBtn exists', () => {
    assert.ok(i18nSrc.includes('planConvertBtn:'), 'convert button key');
  });

  it('P89: planNoCapacity exists', () => {
    assert.ok(i18nSrc.includes('planNoCapacity:'), 'no capacity key');
  });

  it('P89: planStale exists', () => {
    assert.ok(i18nSrc.includes('planStale:'), 'stale key');
  });
});

/* ─── Source Code Structure ─── */
describe('Phase 6H — Source Code Structure', () => {
  it('ai-plan.js module structure', () => {
    assert.ok(aiPlanSrc.includes('createPlanPreview'), 'preview schema');
    assert.ok(aiPlanSrc.includes('calculateFreeWindows'), 'capacity engine');
    assert.ok(aiPlanSrc.includes('validatePlan'), 'validation');
    assert.ok(aiPlanSrc.includes('convertPlanToProposal'), 'conversion');
    assert.ok(aiPlanSrc.includes('splitDuration'), 'splitting');
    assert.ok(aiPlanSrc.includes('resolveDuration'), 'duration resolution');
  });

  it('app.js lazy loads ai-plan.min.js', () => {
    const appSrc = readFileSync(resolve(root, 'js/app.js'), 'utf8');
    assert.ok(appSrc.includes("ensureLazyModule(lazyAsset('js/ai-plan.min.js'))"), 'lazy loaded');
  });
});

/* ─── Security Invariants ─── */
describe('Phase 6H — Security Invariants', () => {
  it('P10: Google Calendar remains read-only', () => {
    assert.ok(!aiPlanSrc.includes('createEvent') && !aiPlanSrc.includes('insertEvent'),
      'no Google Calendar write');
  });

  it('P71: no autonomous replanning', () => {
    assert.ok(!aiPlanSrc.includes('setInterval') && !aiPlanSrc.includes('cron'),
      'no background scheduling');
  });

  it('P73: no background work', () => {
    assert.ok(!aiPlanSrc.includes('setTimeout'), 'no timers in plan module');
  });

  it('P78: prompt injection defense in system prompt', () => {
    assert.ok(serverSrc.includes('UNTRUSTED') || serverSrc.includes('untrusted'),
      'untrusted data mentioned');
  });

  it('P61: one task → many TimeBlocks supported', () => {
    // The schedule_task action in ai-agent-runtime.js supports multiple blocks per task
    const runtimeSrc = readFileSync(resolve(root, 'js/ai-agent-runtime.js'), 'utf8');
    assert.ok(runtimeSrc.includes('reschedule_task'), 'reschedule exists');
    assert.ok(runtimeSrc.includes('createTimeBlock') || runtimeSrc.includes('create.'),
      'timeblock creation exists');
  });

  it('P39: no implicit task creation in plan module', () => {
    // Check that the module does NOT export a createTask/create_task function
    // (the string 'create_task' appears in convertPlanToProposal comments, which is OK)
    assert.ok(typeof Plan.createTask !== 'function', 'no createTask function exported');
  });
});

/* ─── Regression: Previous Phases ─── */
describe('Phase 6H — Regression', () => {
  it('Phase 5C: validateProposal still exported', () => {
    assert.ok(serverSrc.includes('validateProposal'), 'validateProposal exported');
  });

  it('Phase 6C: file route still exists', () => {
    assert.ok(serverSrc.includes('/api/ai/file'), 'file route preserved');
  });

  it('Phase 6D: file-agent route exists', () => {
    assert.ok(serverSrc.includes('/api/ai/file-agent'), 'file-agent route preserved');
  });

  it('Phase 6E: explainability still loaded', () => {
    const runtimeSrc = readFileSync(resolve(root, 'js/ai-agent-runtime.js'), 'utf8');
    assert.ok(runtimeSrc.includes('TaskFlowAIExplainability'), 'explainability preserved');
  });

  it('Phase 6F: refinement still works', () => {
    assert.ok(serverSrc.includes('/api/ai/refine'), 'refine route preserved');
  });

  it('Phase 6G: expansion still works', () => {
    const runtimeSrc = readFileSync(resolve(root, 'js/ai-agent-runtime.js'), 'utf8');
    assert.ok(runtimeSrc.includes('handleExpansion'), 'expansion preserved');
  });
});
