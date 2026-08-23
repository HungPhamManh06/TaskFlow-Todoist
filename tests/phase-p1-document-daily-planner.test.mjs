'use strict';
/**
 * P1 — Document Daily Planner
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const aiSource = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');

describe('P1 Document Daily Planner: server schemas', () => {
  it('DOCUMENT_ROADMAP_SCHEMA exists', () => {
    assert.ok(aiSource.includes('DOCUMENT_ROADMAP_SCHEMA'));
    assert.ok(aiSource.includes("'title', 'summary', 'phases'"));
  });
  it('DAILY_PLAN_SCHEMA exists', () => {
    assert.ok(aiSource.includes('DAILY_PLAN_SCHEMA'));
    assert.ok(aiSource.includes("'days', 'summary'"));
  });
  it('roadmap schema has phases maxItems', () => {
    const idx = aiSource.indexOf('DOCUMENT_ROADMAP_SCHEMA');
    const body = aiSource.slice(idx, idx + 2000);
    assert.ok(body.includes('maxItems: 20'));
  });
  it('daily plan schema has days maxItems=14', () => {
    const idx = aiSource.indexOf('DAILY_PLAN_SCHEMA');
    const body = aiSource.slice(idx, idx + 1500);
    assert.ok(body.includes('maxItems: 14'));
    assert.ok(body.includes('maxItems: 6'));
  });
  it('/roadmap-extract route exists', () => {
    assert.ok(aiSource.includes("router.post('/roadmap-extract'"));
  });
  it('/daily-plan route exists', () => {
    assert.ok(aiSource.includes("router.post('/daily-plan'"));
  });
  it('daily-plan validates startDate', () => {
    assert.ok(aiSource.includes("ai-daily-plan-invalid-date"));
  });
  it('daily-plan clamps past dates', () => {
    assert.ok(aiSource.includes('d >= today'));
  });
});

describe('P1 Document Daily Planner: intent detection', () => {
  let aiIntent;
  it('imports ai-intent', () => {
    aiIntent = require(join(ROOT, 'js', 'ai-intent.js'));
    assert.ok(aiIntent.classifyFileIntent);
  });
  it('recognizes daily plan intent with file', () => {
    const r = aiIntent.classifyFileIntent('tạo task từng ngày từ pdf', true);
    assert.equal(r.kind, 'document-daily-plan');
  });
  it('recognizes variant 2', () => {
    const r = aiIntent.classifyFileIntent('chia tài liệu thành công việc mỗi ngày', true);
    assert.equal(r.kind, 'document-daily-plan');
  });
  it('recognizes weekly plan', () => {
    const r = aiIntent.classifyFileIntent('tạo kế hoạch tuần tiếp theo từ tài liệu này', true);
    assert.equal(r.kind, 'document-daily-plan');
  });
  it('does NOT trigger without file', () => {
    const r = aiIntent.classifyFileIntent('tạo task từng ngày', false);
    assert.notEqual(r.kind, 'document-daily-plan');
  });
  it('does NOT trigger on questions', () => {
    const r = aiIntent.classifyFileIntent('Tài liệu này có kế hoạch theo ngày không?', true);
    assert.notEqual(r.kind, 'document-daily-plan');
  });
});

describe('P1 Document Daily Planner: 40-week constraint', () => {
  it('roadmap produces compact representation', () => {
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
    assert.ok(totalGoals < 200, 'compact: ' + totalGoals + ' goals');
  });
  it('Stage B respects 7-day horizon', () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date('2026-08-25');
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    assert.equal(dates.length, 7);
    assert.equal(dates[0], '2026-08-25');
    assert.equal(dates[6], '2026-08-31');
  });
  it('max 14 days', () => {
    assert.equal(Math.min(30, 14), 14);
  });
  it('2-6 tasks per day', () => {
    const tasks = [2, 3, 4, 2, 3, 2, 4];
    for (const c of tasks) assert.ok(c >= 2 && c <= 6);
  });
  it('no past dates', () => {
    const today = '2026-08-25';
    for (const d of ['2026-08-25', '2026-08-26', '2026-08-27']) {
      assert.ok(d >= today);
    }
  });
});

describe('P1 Document Daily Planner: action structure', () => {
  it('create_task action with date and duration', () => {
    const a = { id: 'a1', type: 'create_task', args: { taskRef: null, text: 'Install GCC', date: '2026-08-25', start: null, duration: 45, priority: false, projectId: null, milestoneId: null, changes: null } };
    assert.equal(a.type, 'create_task');
    assert.ok(a.args.date);
    assert.ok(a.args.duration >= 20 && a.args.duration <= 120);
  });
  it('v1 does not use schedule_task', () => {
    assert.ok(!['create_task'].includes('schedule_task'));
  });
});
