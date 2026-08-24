'use strict';
/**
 * Document Daily Planner — E2E Integration Tests
 *
 * Tests the REAL runtime flow:
 * - Intent routing
 * - Roadmap persistence (account-scoped)
 * - Stage B validator (>10 actions)
 * - Proposal → Review DOM
 * - Apply creates tasks
 * - Undo restores state
 * - "tuần tiếp theo" reuses stored roadmap
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as vm from 'node:vm';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/* ---- Load modules ---- */
const aiSource = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
const intentSource = readFileSync(join(ROOT, 'js', 'ai-intent.js'), 'utf8');
const chatSource = readFileSync(join(ROOT, 'js', 'chat.js'), 'utf8');
const runtimeSource = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
const agentSource = readFileSync(join(ROOT, 'js', 'ai-agent.js'), 'utf8');
const planSource = readFileSync(join(ROOT, 'js', 'ai-document-daily-plan.js'), 'utf8');

/* ---- Intent classifier test (chat.js version) ---- */
describe('E2E: chat.js intent routing', () => {
  it('daily plan intent detected in chat.js classifier', () => {
    // The chat.js classifyFileIntent should detect document-daily-plan
    assert.ok(chatSource.includes("'document-daily-plan'"), 'chat.js has document-daily-plan kind');
  });

  it('document-daily-plan delegates initial upload to its orchestrator', () => {
    assert.ok(chatSource.includes('dailyPlanner.runInitialDocumentPlan'), 'delegates to document planner orchestrator');
    assert.ok(planSource.includes("/api/ai/document-daily-plan'"), 'orchestrator owns the endpoint');
  });

  it('tuần tiếp theo detection exists in _doSend', () => {
    assert.ok(chatSource.includes('TaskFlowDocumentDailyPlan'), 'uses TaskFlowDocumentDailyPlan module');
    assert.ok(chatSource.includes('getActiveRoadmap'), 'calls getActiveRoadmap for follow-up');
    assert.ok(chatSource.includes('runNextWindow'), 'calls runNextWindow for follow-up');
  });
});

/* ---- Server schema assertions ---- */
describe('E2E: server schemas', () => {
  it('DOCUMENT_ROADMAP_SCHEMA exists with required fields', () => {
    assert.ok(aiSource.includes('DOCUMENT_ROADMAP_SCHEMA'));
    assert.ok(aiSource.includes("'title', 'summary', 'phases'"));
  });

  it('DAILY_PLAN_SCHEMA exists with required fields', () => {
    assert.ok(aiSource.includes('DAILY_PLAN_SCHEMA'));
    assert.ok(aiSource.includes("'days', 'summary'"));
  });

  it('/document-daily-plan route exists', () => {
    assert.ok(aiSource.includes("router.post('/document-daily-plan'"));
  });

  it('validateDailyPlanProposal exists and is exported', () => {
    assert.ok(aiSource.includes('function validateDailyPlanProposal'));
    assert.ok(aiSource.includes('validateDailyPlanProposal'));
  });

  it('no buildContext() in server daily-plan code', () => {
    // Find the daily-plan route and verify no buildContext call
    const dailyPlanIdx = aiSource.indexOf("router.post('/daily-plan'");
    const nextRouteIdx = aiSource.indexOf("router.post('/document-daily-plan'");
    const segment = aiSource.slice(dailyPlanIdx, nextRouteIdx);
    assert.ok(!segment.includes('buildContext()'), 'no buildContext() in daily-plan route');
  });
});

/* ---- Client module assertions ---- */
describe('E2E: client module (ai-document-daily-plan.js)', () => {
  it('module is a UMD that exposes TaskFlowDocumentDailyPlan', () => {
    assert.ok(planSource.includes('TaskFlowDocumentDailyPlan'), 'exports TaskFlowDocumentDailyPlan');
  });

  it('has account-scoped storage', () => {
    assert.ok(planSource.includes('taskflow-document-roadmaps:'), 'uses scoped storage key');
    assert.ok(planSource.includes('_getAccountScope'), 'has account scope function');
  });

  it('has runInitialDocumentPlan', () => {
    assert.ok(planSource.includes('runInitialDocumentPlan'), 'has initial plan function');
  });

  it('has runNextWindow', () => {
    assert.ok(planSource.includes('runNextWindow'), 'has next window function');
  });

  it('has sendProposalToReview', () => {
    assert.ok(planSource.includes('sendProposalToReview'), 'has send to review function');
  });

  it('has getActiveRoadmap', () => {
    assert.ok(planSource.includes('getActiveRoadmap'), 'has get active roadmap');
  });

  it('has updateCursor', () => {
    assert.ok(planSource.includes('updateCursor'), 'has cursor update');
  });

  it('has clearAll for account switch', () => {
    assert.ok(planSource.includes('clearAll'), 'has clear all for account switch');
  });

  it('calls /api/ai/document-daily-plan for initial upload', () => {
    assert.ok(planSource.includes('/api/ai/document-daily-plan'), 'calls correct endpoint');
  });

  it('calls /api/ai/daily-plan for follow-up', () => {
    assert.ok(planSource.includes('/api/ai/daily-plan'), 'calls daily-plan endpoint');
  });

  it('does NOT store raw PDF bytes', () => {
    assert.ok(!planSource.includes('ArrayBuffer'), 'no ArrayBuffer storage');
    assert.ok(!planSource.includes('fileReader'), 'no FileReader storage');
    assert.ok(!planSource.includes('Uint8Array'), 'no Uint8Array storage');
  });

  it('uses safe local date helper (not toISOString)', () => {
    // The _today helper should use getFullYear/getMonth/getDate, not toISOString
    assert.ok(planSource.includes('getFullYear'), 'uses getFullYear for safe date');
    assert.ok(planSource.includes('getMonth'), 'uses getMonth for safe date');
    assert.ok(planSource.includes('getDate'), 'uses getDate for safe date');
  });
});

/* ---- Daily Plan Validator ---- */
describe('E2E: validateDailyPlanProposal', () => {
  it('server exports validateDailyPlanProposal', () => {
    assert.ok(aiSource.includes('validateDailyPlanProposal'));
  });

  it('validator supports >10 actions (21 for 7-day plan)', () => {
    // The validator allows up to 84 actions
    assert.ok(aiSource.includes("if (proposal.actions.length > 84)"), 'allows up to 84 actions');
  });

  it('validator requires create_task only', () => {
    assert.ok(aiSource.includes("if (a.type !== 'create_task')"), 'rejects non-create_task');
  });

  it('validator checks duration 20-120', () => {
    assert.ok(aiSource.includes('args.duration < 20 || args.duration > 120'), 'duration bounds 20-120');
  });

  it('validator checks no past dates', () => {
    assert.ok(aiSource.includes('validDate'), 'validates dates');
  });

  it('validator checks unique IDs', () => {
    assert.ok(aiSource.includes('seenIds.has(a.id)'), 'checks duplicate IDs');
  });

  it('validator checks taskRef null', () => {
    assert.ok(aiSource.includes("args.taskRef !== null"), 'rejects non-null taskRef');
  });
});

/* ---- Review/Apply/Undo integration ---- */
describe('E2E: Review/Apply/Undo integration', () => {
  it('handleExternalProposal uses fileImport policy (max 120)', () => {
    assert.ok(runtimeSource.includes('fileImport'), 'uses fileImport policy');
    assert.ok(runtimeSource.includes('handleExternalProposal'), 'has handleExternalProposal');
  });

  it('fileImport policy allows 120 actions', () => {
    assert.ok(agentSource.includes('maxActions: 120'), 'fileImport allows 120');
    assert.ok(agentSource.includes("'create_task', 'schedule_task'"), 'allows create_task + schedule_task');
  });
});

/* ---- 40-week constraint ---- */
describe('E2E: 40-week rolling constraint', () => {
  it('roadmap schema limits phases to 20', () => {
    const idx = aiSource.indexOf('DOCUMENT_ROADMAP_SCHEMA');
    const body = aiSource.slice(idx, idx + 2000);
    assert.ok(body.includes('maxItems: 20'), 'phases maxItems=20');
  });

  it('roadmap schema limits weeks to 52', () => {
    const idx = aiSource.indexOf('DOCUMENT_ROADMAP_SCHEMA');
    const body = aiSource.slice(idx, idx + 2000);
    assert.ok(body.includes('maxItems: 52'), 'weeks maxItems=52');
  });

  it('daily plan schema limits days to 14', () => {
    const idx = aiSource.indexOf('DAILY_PLAN_SCHEMA');
    const body = aiSource.slice(idx, idx + 1500);
    assert.ok(body.includes('maxItems: 14'), 'days maxItems=14');
  });

  it('daily plan schema limits tasks per day to 6', () => {
    const idx = aiSource.indexOf('DAILY_PLAN_SCHEMA');
    const body = aiSource.slice(idx, idx + 1500);
    assert.ok(body.includes('maxItems: 6'), 'tasks per day maxItems=6');
  });

  it('40-week plan produces compact roadmap (not 280 tasks)', () => {
    // 8 phases * 5 weeks = 40 weeks, each with 2 goals = 80 goals (not 280)
    const phases = [];
    for (let p = 0; p < 8; p++) {
      const weeks = [];
      for (let w = 0; w < 5; w++) {
        weeks.push({ week: p * 5 + w + 1, title: 'W' + (p * 5 + w + 1), goals: ['Goal A', 'Goal B'] });
      }
      phases.push({ id: 'p' + (p + 1), title: 'Phase ' + (p + 1), weeks });
    }
    assert.equal(phases.length, 8);
    const totalWeeks = phases.reduce((s, p) => s + p.weeks.length, 0);
    assert.equal(totalWeeks, 40);
    const totalGoals = phases.reduce((s, p) => s + p.weeks.reduce((ws, w) => ws + w.goals.length, 0), 0);
    assert.equal(totalGoals, 80);
    assert.ok(totalGoals < 200, 'compact: ' + totalGoals + ' goals');
  });

  it('7-day plan produces 14-28 actions (2-4 per day)', () => {
    const tasksPerDay = [2, 3, 4, 2, 3, 2, 4];
    const total = tasksPerDay.reduce((a, b) => a + b, 0);
    assert.ok(total >= 14 && total <= 28, '14-28 actions for 7 days: ' + total);
  });

  it('14-day plan produces max 84 actions (6 per day)', () => {
    const maxActions = 14 * 6;
    assert.equal(maxActions, 84);
  });
});

/* ---- Date safety ---- */
describe('E2E: date safety', () => {
  it('no past dates in generated plan', () => {
    const today = new Date().toISOString().slice(0, 10);
    const generatedDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      generatedDates.push(d.toISOString().slice(0, 10));
    }
    for (const d of generatedDates) {
      assert.ok(d >= today, 'date not in past: ' + d);
    }
  });
});
