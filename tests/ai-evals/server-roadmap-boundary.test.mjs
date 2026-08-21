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

/* ================================================================
   SECTION 7: ExistingTaskKey Hallucination with Empty Set (Phase 6R.3)
   ================================================================ */

describe('Server Roadmap Boundary: ExistingTaskKey Hallucination', () => {
  it('rejects existingTaskKey when existingWorkKeys is empty Set', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Reuse', existingTaskKey: 'ghost', dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, false, 'Must reject when canonical set is empty');
    assert.ok(v.errors.some(e => e.includes('hallucinated-existingTaskKey')));
  });

  it('rejects existingTaskKey when existingWorkKeys is null', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Reuse', existingTaskKey: 'ghost', dependsOn: [] }],
    }, null);
    assert.equal(v.ok, false, 'Must reject when canonical set is null');
    assert.ok(v.errors.some(e => e.includes('hallucinated-existingTaskKey')));
  });

  it('rejects existingTaskKey when existingWorkKeys is undefined', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Reuse', existingTaskKey: 'ghost', dependsOn: [] }],
    }, undefined);
    assert.equal(v.ok, false, 'Must reject when canonical set is undefined');
    assert.ok(v.errors.some(e => e.includes('hallucinated-existingTaskKey')));
  });

  it('accepts existingTaskKey present in canonical set', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Reuse', existingTaskKey: 'real-key', dependsOn: [] }],
    }, new Set(['real-key']));
    assert.equal(v.ok, true, 'Legitimate key in canonical set should pass');
  });
});

/* ================================================================
   SECTION 8: Dependency Depth Enforcement (Phase 6R.3)
   ================================================================ */

describe('Server Roadmap Boundary: Dependency Depth', () => {
  it('accepts depth 0 (no dependencies)', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'A', dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, true);
  });

  it('accepts depth 4 (maximum)', () => {
    const tasks = [];
    for (let i = 1; i <= 5; i++) {
      tasks.push({
        tempId: 'r' + i, milestoneId: 'm1', title: 'T' + i,
        dependsOn: i === 1 ? [] : ['r' + (i - 1)],
      });
    }
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks,
    }, new Set());
    assert.equal(v.ok, true, 'Depth 4 should be accepted');
  });

  it('rejects depth 5 (exceeds maximum)', () => {
    const tasks = [];
    for (let i = 1; i <= 6; i++) {
      tasks.push({
        tempId: 'r' + i, milestoneId: 'm1', title: 'T' + i,
        dependsOn: i === 1 ? [] : ['r' + (i - 1)],
      });
    }
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks,
    }, new Set());
    assert.equal(v.ok, false, 'Depth 5 must be rejected');
    assert.ok(v.errors.some(e => e.includes('dependency-depth-exceeded')));
  });
});

/* ================================================================
   SECTION 9: Empty Roadmap Rejection (Phase 6R.3)
   ================================================================ */

describe('Server Roadmap Boundary: Empty Roadmap', () => {
  it('rejects roadmap with empty milestones', () => {
    const v = validateRoadmapModelOutput({
      milestones: [],
      tasks: [{ tempId: 'r1', title: 'Task', dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('empty-milestones'));
  });

  it('rejects roadmap with empty tasks', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('empty-tasks'));
  });

  it('rejects completely empty roadmap', () => {
    const v = validateRoadmapModelOutput({
      milestones: [],
      tasks: [],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('empty-milestones'));
    assert.ok(v.errors.includes('empty-tasks'));
  });
});

/* ================================================================
   SECTION 10: Milestone Order & Source Validation (Phase 6R.3)
   ================================================================ */

describe('Server Roadmap Boundary: Order & Source', () => {
  it('rejects invalid milestone order', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: -1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-order')));
  });

  it('rejects invalid source structure', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', source: 'bad', dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-source')));
  });

  it('rejects unknown source kind', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', source: { kind: 'hacker' }, dependsOn: [] }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('invalid-source-kind')));
  });

  it('accepts valid source kinds', () => {
    for (const kind of ['document', 'ai-suggested']) {
      const v = validateRoadmapModelOutput({
        milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
        tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', source: { kind }, dependsOn: [] }],
      }, new Set());
      assert.equal(v.ok, true, 'source.kind=' + kind + ' should be valid');
    }
  });
});

/* ================================================================
   SECTION 11: Reuse Array Validation (Phase 6R.3)
   ================================================================ */

describe('Server Roadmap Boundary: Reuse Array', () => {
  it('rejects non-array reuse', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', dependsOn: [] }],
      reuse: 'invalid',
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('reuse-not-array'));
  });

  it('rejects hallucinated reuse key', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', dependsOn: [] }],
      reuse: [{ existingTaskKey: 'ghost', roadmapTitle: 'Ghost' }],
    }, new Set());
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => e.includes('hallucinated-existingTaskKey')));
  });

  it('accepts valid reuse with canonical key', () => {
    const v = validateRoadmapModelOutput({
      milestones: [{ tempId: 'm1', title: 'Phase 1', order: 1 }],
      tasks: [{ tempId: 'r1', milestoneId: 'm1', title: 'Task', dependsOn: [] }],
      reuse: [{ existingTaskKey: 'real-key', roadmapTitle: 'Reused' }],
    }, new Set(['real-key']));
    assert.equal(v.ok, true);
  });
});
