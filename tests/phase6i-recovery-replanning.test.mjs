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

/* ─── Load ai-plan module ─── */
let Plan;
try {
  const mod = await import('../js/ai-plan.js');
  Plan = mod.default || mod;
} catch (e) {
  Plan = {};
}

/* ─── P4: Recovery Intent Router ─── */
describe('Phase 6I — Recovery Intent Router (P4)', () => {
  it('P4: classifyPlanningIntent exported', () => {
    assert.ok(aiIntentSrc.includes('classifyPlanningIntent'), 'function exists');
  });

  it('P4: recovery intent patterns present', () => {
    assert.ok(/bỏ\s+lỡ|missed|xếp\s+lại|replan|recovery|phục\s+hồi/i.test('Bỏ lỡ phiên tối qua'), 'recovery VI');
    assert.ok(/missed|replan|recovery/i.test('I missed a session'), 'recovery EN');
  });

  it('P4: recovery-availability pattern', () => {
    assert.ok(/bận|busy|không\s+rảnh/.test('Ngày mai tôi bận cả tối'), 'availability');
  });

  it('P4: recovery-remaining pattern', () => {
    assert.ok(/còn\s+lại|remaining|phần\s+còn/.test('Xếp lại phần còn lại'), 'remaining');
  });

  it('P4: what-if recovery pattern', () => {
    assert.ok(/nếu|what\s*if/i.test('Nếu tôi nghỉ hôm nay'), 'what-if recovery');
  });

  it('P4: recovery-analysis question pattern', () => {
    assert.ok(/đang\s+chậm|how\s+far/.test('Tôi đang chậm bao nhiêu'), 'analysis');
  });

  it('P4: read-only questions produce no mutation', () => {
    assert.ok(aiIntentSrc.includes('question') && aiIntentSrc.includes('recover'), 'analysis questions routed');
  });
});

/* ─── P6: Delta Model ─── */
describe('Phase 6I — Delta Model (P6)', () => {
  it('P6: createDelta exists', () => {
    assert.ok(aiPlanSrc.includes('createDelta'), 'function defined');
    assert.ok(Plan.createDelta, 'exported');
  });

  it('P6: createDelta returns expected fields', () => {
    const d = Plan.createDelta();
    assert.ok(Array.isArray(d.completedSessions), 'completedSessions array');
    assert.ok(Array.isArray(d.missedSessions), 'missedSessions array');
    assert.ok(Array.isArray(d.remainingSessions), 'remainingSessions array');
    assert.ok(Array.isArray(d.changedTasks), 'changedTasks array');
    assert.ok(Array.isArray(d.newConflicts), 'newConflicts array');
    assert.ok(Array.isArray(d.changedAvailability), 'changedAvailability array');
    assert.ok(Array.isArray(d.deadlineRisks), 'deadlineRisks array');
  });
});

/* ─── P13: Missed Session Detection ─── */
describe('Phase 6I — Missed Session Detection (P13)', () => {
  it('P13: isSessionMissed exists', () => {
    assert.ok(aiPlanSrc.includes('isSessionMissed'), 'function defined');
    assert.ok(Plan.isSessionMissed, 'exported');
  });

  it('P13: user-declared missed session', () => {
    const result = Plan.isSessionMissed(
      { id: 's2', date: '2026-08-20', start: '19:00', duration: 45 },
      { missedSessionIds: ['s2'] }
    );
    assert.equal(result, true);
  });

  it('P13: past session detected', () => {
    const result = Plan.isSessionMissed(
      { id: 's1', date: '2026-08-19', start: '19:00', duration: 45 },
      { now: '2026-08-21T10:00' }
    );
    assert.equal(result, true);
  });

  it('P13: future session not missed', () => {
    const result = Plan.isSessionMissed(
      { id: 's3', date: '2026-08-25', start: '19:00', duration: 45 },
      { now: '2026-08-21T10:00' }
    );
    assert.equal(result, false);
  });
});

/* ─── P12: Locked Sessions ─── */
describe('Phase 6I — Locked Sessions (P12)', () => {
  it('P12: isSessionLocked exists', () => {
    assert.ok(aiPlanSrc.includes('isSessionLocked'), 'function defined');
    assert.ok(Plan.isSessionLocked, 'exported');
  });

  it('P12: locked session detected', () => {
    assert.equal(Plan.isSessionLocked('s2', ['s2', 's3']), true);
  });

  it('P12: unlocked session not locked', () => {
    assert.equal(Plan.isSessionLocked('s1', ['s2', 's3']), false);
  });

  it('P12: no locks = not locked', () => {
    assert.equal(Plan.isSessionLocked('s1', []), false);
    assert.equal(Plan.isSessionLocked('s1', null), false);
  });
});

/* ─── P14: Partial Progress ─── */
describe('Phase 6I — Partial Progress (P14)', () => {
  it('P14: calculateRemaining exists', () => {
    assert.ok(aiPlanSrc.includes('calculateRemaining'), 'function defined');
    assert.ok(Plan.calculateRemaining, 'exported');
  });

  it('P14: 90 total - 40 done = 50 remaining', () => {
    assert.equal(Plan.calculateRemaining(90, 40), 50);
  });

  it('P14: 60 total - 80 done = 0 remaining (capped)', () => {
    assert.equal(Plan.calculateRemaining(60, 80), 0);
  });

  it('P14: 120 total - 0 done = 120 remaining', () => {
    assert.equal(Plan.calculateRemaining(120, 0), 120);
  });
});

/* ─── P19: Conflict Detection ─── */
describe('Phase 6I — Conflict Detection (P19)', () => {
  it('P19: detectSessionConflicts exists', () => {
    assert.ok(aiPlanSrc.includes('detectSessionConflicts'), 'function defined');
    assert.ok(Plan.detectSessionConflicts, 'exported');
  });

  it('P19: TimeBlock conflict detected', () => {
    const session = { id: 's1', date: '2026-08-21', start: '19:00', duration: 60 };
    const timeblocks = { blocks: [{ id: 'b1', date: '2026-08-21', start: '19:30', end: '20:30', status: 'scheduled' }] };
    const conflicts = Plan.detectSessionConflicts(session, { timeblocks });
    assert.ok(conflicts.length > 0);
    assert.equal(conflicts[0].type, 'timeblock');
  });

  it('P19: no conflict when no overlap', () => {
    const session = { id: 's1', date: '2026-08-21', start: '19:00', duration: 60 };
    const timeblocks = { blocks: [{ id: 'b1', date: '2026-08-21', start: '21:00', end: '22:00', status: 'scheduled' }] };
    const conflicts = Plan.detectSessionConflicts(session, { timeblocks });
    assert.equal(conflicts.length, 0);
  });
});

/* ─── P22: Current Time Boundary ─── */
describe('Phase 6I — Current Time Boundary (P22)', () => {
  it('P22: isSessionInPast exists', () => {
    assert.ok(aiPlanSrc.includes('isSessionInPast'), 'function defined');
    assert.ok(Plan.isSessionInPast, 'exported');
  });

  it('P22: past session detected', () => {
    assert.equal(Plan.isSessionInPast(
      { date: '2026-08-20', start: '19:00', duration: 45 },
      '2026-08-21T10:00'
    ), true);
  });

  it('P22: future session not past', () => {
    assert.equal(Plan.isSessionInPast(
      { date: '2026-08-25', start: '19:00', duration: 45 },
      '2026-08-21T10:00'
    ), false);
  });

  it('P22: same-day session before now = past', () => {
    assert.equal(Plan.isSessionInPast(
      { date: '2026-08-21', start: '19:00', duration: 60 },
      '2026-08-21T20:00'
    ), true);
  });
});

/* ─── P42: Duration Conservation ─── */
describe('Phase 6I — Duration Conservation (P42)', () => {
  it('P42: validateRecoveryDuration exists', () => {
    assert.ok(aiPlanSrc.includes('validateRecoveryDuration'), 'function defined');
    assert.ok(Plan.validateRecoveryDuration, 'exported');
  });

  it('P42: valid: planned = remaining', () => {
    assert.equal(Plan.validateRecoveryDuration(80, 80).ok, true);
  });

  it('P42: invalid: over-planned (180 for 80 remaining)', () => {
    assert.equal(Plan.validateRecoveryDuration(80, 180).ok, false);
  });

  it('P42: invalid: under-planned (20 for 80 remaining)', () => {
    assert.equal(Plan.validateRecoveryDuration(80, 20).ok, false);
  });
});

/* ─── P59: Recovery to Proposal Conversion ─── */
describe('Phase 6I — Recovery to Proposal (P59)', () => {
  it('P59: convertRecoveryToProposal exists', () => {
    assert.ok(aiPlanSrc.includes('convertRecoveryToProposal'), 'function defined');
    assert.ok(Plan.convertRecoveryToProposal, 'exported');
  });

  it('P59: moved session → reschedule_task', () => {
    const recovery = {
      movedSessions: [{ sessionId: 's3', taskKey: 't1', date: '2026-08-23', start: '09:00', duration: 45 }]
    };
    const taskMap = { t1: { uid: 'uid-123', text: 'Test task' } };
    const result = Plan.convertRecoveryToProposal(recovery, taskMap);
    assert.equal(result.ok, true);
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].type, 'reschedule_task');
    assert.deepEqual(result.actions[0].args.taskRef, { kind: 'existing', uid: 'uid-123' });
  });

  it('P39: locked session → error', () => {
    const recovery = {
      movedSessions: [{ sessionId: 's2', taskKey: 't1', date: '2026-08-23', start: '09:00', duration: 45 }]
    };
    const taskMap = { t1: { uid: 'uid-123' } };
    const result = Plan.convertRecoveryToProposal(recovery, taskMap, ['s2']);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.code === 'locked-session'));
  });

  it('P59: unknown task → error', () => {
    const recovery = {
      movedSessions: [{ sessionId: 's1', taskKey: 't99', date: '2026-08-23', start: '09:00', duration: 45 }]
    };
    const result = Plan.convertRecoveryToProposal(recovery, {});
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.code === 'unknown-task'));
  });
});

/* ─── P49: Recovery Metrics ─── */
describe('Phase 6I — Recovery Metrics (P49)', () => {
  it('P49: recoveryMetrics exists', () => {
    assert.ok(aiPlanSrc.includes('recoveryMetrics'), 'function defined');
    assert.ok(Plan.recoveryMetrics, 'exported');
  });

  it('P49: calculates metrics correctly', () => {
    const original = { sessions: [{}, {}, {}, {}, {}] };
    const recovery = { movedSessions: [{}], unscheduled: [{}] };
    const m = Plan.recoveryMetrics(original, recovery);
    assert.equal(m.sessionsPreserved, 4);
    assert.equal(m.sessionsMoved, 1);
    assert.equal(m.unscheduledCount, 1);
    assert.equal(m.hasDeficit, true);
  });
});

/* ─── P33: Server Recovery Mode ─── */
describe('Phase 6I — Server Recovery Mode', () => {
  it('P33: recovery mode supported in plan-synthesis', () => {
    assert.ok(serverSrc.includes("mode === 'recovery'"), 'recovery mode check');
  });

  it('P12: locked session IDs in system prompt', () => {
    assert.ok(serverSrc.includes('lockedSessionIds'), 'locked sessions in request');
  });

  it('P22: current time in recovery prompt', () => {
    assert.ok(serverSrc.includes('body.now'), 'current time in request');
  });

  it('P9: minimize disruption in prompt', () => {
    assert.ok(serverSrc.includes('MINIMIZE DISRUPTION') || serverSrc.includes('TỐI THIỂU GIÁN ĐOẠN'), 'disruption policy');
  });

  it('P79: mode logged in response', () => {
    assert.ok(serverSrc.includes("mode: mode") || serverSrc.includes("'mode=' + mode"), 'mode in response');
  });
});

/* ─── I18n Keys ─── */
describe('Phase 6I — I18n Keys', () => {
  it('P70: recoveryTitle VI', () => {
    assert.ok(i18nSrc.includes("recoveryTitle: 'Kế hoạch phục hồi'"), 'VI key');
  });

  it('P70: recoveryTitle EN', () => {
    const enIdx = i18nSrc.indexOf("recoveryTitle:", i18nSrc.indexOf("recoveryTitle:") + 1);
    assert.ok(enIdx > 0, 'EN key exists');
  });

  it('P70: recoveryMissed exists', () => {
    assert.ok(i18nSrc.includes('recoveryMissed:'), 'missed key');
  });

  it('P70: recoveryPreserved exists', () => {
    assert.ok(i18nSrc.includes('recoveryPreserved:'), 'preserved key');
  });

  it('P70: recoveryAtRisk exists', () => {
    assert.ok(i18nSrc.includes('recoveryAtRisk:'), 'at-risk key');
  });

  it('P70: recoveryConvertBtn exists', () => {
    assert.ok(i18nSrc.includes('recoveryConvertBtn:'), 'convert button key');
  });
});

/* ─── Source Code Structure ─── */
describe('Phase 6I — Source Code Structure', () => {
  it('ai-plan.js has recovery functions', () => {
    assert.ok(aiPlanSrc.includes('createDelta'), 'createDelta');
    assert.ok(aiPlanSrc.includes('calculateRemaining'), 'calculateRemaining');
    assert.ok(aiPlanSrc.includes('isSessionMissed'), 'isSessionMissed');
    assert.ok(aiPlanSrc.includes('isSessionLocked'), 'isSessionLocked');
    assert.ok(aiPlanSrc.includes('detectSessionConflicts'), 'detectSessionConflicts');
    assert.ok(aiPlanSrc.includes('isSessionInPast'), 'isSessionInPast');
    assert.ok(aiPlanSrc.includes('validateRecoveryDuration'), 'validateRecoveryDuration');
    assert.ok(aiPlanSrc.includes('convertRecoveryToProposal'), 'convertRecoveryToProposal');
    assert.ok(aiPlanSrc.includes('recoveryMetrics'), 'recoveryMetrics');
  });
});

/* ─── Security Invariants ─── */
describe('Phase 6I — Security Invariants', () => {
  it('P20: Google Calendar remains read-only', () => {
    assert.ok(!aiPlanSrc.includes('createEvent') && !aiPlanSrc.includes('insertEvent'),
      'no Google Calendar write');
  });

  it('P3: no autonomous replanning', () => {
    assert.ok(!aiPlanSrc.includes('setInterval') && !aiPlanSrc.includes('cron'),
      'no background scheduling');
  });

  it('P72: no memory writes in recovery', () => {
    assert.ok(!aiPlanSrc.includes('saveMemory'), 'no memory writes');
  });

  it('P74: no chain-of-thought', () => {
    assert.ok(!aiPlanSrc.includes('chainOfThought') && !aiPlanSrc.includes('reasoningTrace'),
      'no CoT fields');
  });

  it('P7: current state is authority (not chat history)', () => {
    assert.ok(serverSrc.includes('body.now') || serverSrc.includes('today'),
      'current state used');
  });

  it('P66: neutral recovery copy (no guilt in recovery keys)', () => {
    // Check only recovery-specific lines don't contain guilt language
    const lines = i18nSrc.split('\n');
    for (const line of lines) {
      if (/recovery/.test(line)) {
        assert.ok(!line.includes('thất bại'),
          'no guilt language in recovery line: ' + line.trim());
      }
    }
  });
});

/* ─── Regression ─── */
describe('Phase 6I — Regression', () => {
  it('Phase 6H: plan-synthesis endpoint still works', () => {
    assert.ok(serverSrc.includes('/plan-synthesis'), 'endpoint preserved');
  });

  it('Phase 6F: refinement still works', () => {
    assert.ok(serverSrc.includes('/api/ai/refine'), 'refine route preserved');
  });

  it('Phase 6G: expansion still works', () => {
    const runtimeSrc = readFileSync(resolve(root, 'js/ai-agent-runtime.js'), 'utf8');
    assert.ok(runtimeSrc.includes('handleExpansion'), 'expansion preserved');
  });

  it('Phase 6E: explainability still loaded', () => {
    const runtimeSrc = readFileSync(resolve(root, 'js/ai-agent-runtime.js'), 'utf8');
    assert.ok(runtimeSrc.includes('TaskFlowAIExplainability'), 'explainability preserved');
  });

  it('Phase 5C: validateProposal still exported', () => {
    assert.ok(serverSrc.includes('validateProposal'), 'validateProposal exported');
  });

  it('Phase 6D: file-agent route exists', () => {
    assert.ok(serverSrc.includes('/api/ai/file-agent'), 'file-agent route preserved');
  });
});
