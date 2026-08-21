/**
 * Phase 6R.2 — Server-Side Roadmap Boundary Tests
 *
 * Tests the server-side roadmap model output validator with mocked provider output.
 * Proves that untrusted AI roadmap JSON is validated atomically before reaching client.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const { validateRoadmapModelOutput } = require(require('path').join(ROOT, 'server', 'ai-roadmap-validator.js'));

/* ================================================================
   SECTION 1: Valid Roadmaps
   ================================================================ */

describe('Server Roadmap Boundary: Valid Roadmaps', () => {
  it('valid minimal roadmap passes', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Design', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Design ERD', duration: 60, deadline: null, dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, true, JSON.stringify(v.errors));
  });

  it('valid roadmap with leap-day deadline passes', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', deadline: '2028-02-29', dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, true);
  });

  it('valid diamond dependency passes', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [
        { tempId: 'r1', milestoneId: 'm1', title: 'A', dependsOn: [] },
        { tempId: 'r2', milestoneId: 'm1', title: 'B', dependsOn: ['r1'] },
        { tempId: 'r3', milestoneId: 'm1', title: 'C', dependsOn: ['r1'] },
        { tempId: 'r4', milestoneId: 'm1', title: 'D', dependsOn: ['r2', 'r3'] },
      ],
    }, new Set());
    assert.equal(v.ok, true);
  });

  it('valid existingTaskKey from provided work passes', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Reuse', existingTaskKey: 'task-abc', dependsOn: [] }],
    }, new Set(['task-abc']));
    assert.equal(v.ok, true);
  });
});

/* ================================================================
   SECTION 2: Invalid Dates
   ================================================================ */

describe('Server Roadmap Boundary: Invalid Dates', () => {
  it('rejects Feb 30 deadline', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', deadline: '2026-02-30', dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-deadline')));
  });

  it('rejects Apr 31 deadline', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', deadline: '2026-04-31', dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-deadline')));
  });

  it('rejects non-leap Feb 29', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', deadline: '2027-02-29', dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-deadline')));
  });

  it('rejects non-date string as deadline', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', deadline: 'tomorrow', dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-deadline')));
  });
});

/* ================================================================
   SECTION 3: Duplicate IDs
   ================================================================ */

describe('Server Roadmap Boundary: Duplicate IDs', () => {
  it('rejects duplicate milestone tempIds', () => {
    const v = validateRoadmapModelOutput({
      milestones: [
        { tempId: 'm1', title: 'Phase 1', order: 1 },
        { tempId: 'm1', title: 'Phase 2', order: 2 },
      ],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('duplicate-tempid')));
  });

  it('rejects duplicate task tempIds', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [
        { tempId: 'r1', milestoneId: 'm1', title: 'A', dependsOn: [] },
        { tempId: 'r1', milestoneId: 'm1', title: 'B', dependsOn: [] },
      ],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('duplicate-tempid')));
  });
});

/* ================================================================
   SECTION 4: Reference Integrity
   ================================================================ */

describe('Server Roadmap Boundary: Reference Integrity', () => {
  it('rejects unknown milestoneId', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm999', title: 'Task', dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('unknown-milestone')));
  });

  it('rejects unknown dependsOn', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', dependsOn: ['r999'] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('unknown-dependency')));
  });

  it('rejects hallucinated existingTaskKey', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', existingTaskKey: 'ghost-key', dependsOn: [] }],
    }, new Set(['real-key']));
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('hallucinated-existingTaskKey')));
  });
});

/* ================================================================
   SECTION 5: Dependency Safety
   ================================================================ */

describe('Server Roadmap Boundary: Dependency Safety', () => {
  it('rejects self-reference', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'A', dependsOn: ['r1'] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('self-reference') || e.includes('dependency-cycle')));
  });

  it('rejects cycle', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [
        { tempId: 'r1', milestoneId: 'm1', title: 'A', dependsOn: ['r2'] },
        { tempId: 'r2', milestoneId: 'm1', title: 'B', dependsOn: ['r1'] },
      ],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('dependency-cycle')));
  });
});

/* ================================================================
   SECTION 6: Structural Validation
   ================================================================ */

describe('Server Roadmap Boundary: Structural Validation', () => {
  it('rejects null roadmap', () => {
    const v = validateRoadmapModelOutput(null, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('roadmap-not-object'));
  });

  it('rejects missing milestones array', () => {
    const v = validateRoadmapModelOutput({ tasks: [] }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('milestones-not-array'));
  });

  it('rejects missing tasks array', () => {
    const v = validateRoadmapModelOutput({ milestones: [] }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('tasks-not-array'));
  });

  it('rejects missing milestone title', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', order: 1 }],
      tasks: [],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-title')));
  });

  it('rejects missing task title', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-title')));
  });

  it('rejects malformed duration', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', duration: -5, dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-duration')));
  });

  it('atomicity: one bad task invalidates entire roadmap', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [
        { tempId: 'r1', milestoneId: 'm1', title: 'Good', dependsOn: [] },
        { tempId: 'r2', milestoneId: 'm1', title: 'Bad', deadline: '2026-02-30', dependsOn: [] },
        { tempId: 'r3', milestoneId: 'm1', title: 'Also Good', dependsOn: [] },
      ],
    }, new Set());
    assert.equal(v.ok, false, 'One invalid task must reject entire roadmap');
  });
});
