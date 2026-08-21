/**
 * Phase 6R.3 — Server-Side Roadmap Model Output Validator
 *
 * Validates untrusted AI-generated roadmap JSON before it reaches the client.
 * Every bad milestone or task invalidates the entire response (atomic).
 * No silent dropping of invalid items.
 */

'use strict';

const MAX_ID_LEN = 64;
const MAX_TITLE_LEN = 200;
const MAX_DEPENDENCY_DEPTH = 4;
const MAX_REUSE_LEN = 20;
const VALID_SOURCE_KINDS = ['document', 'ai-suggested'];

function validateRoadmapModelOutput(roadmap, existingWorkKeys, opts) {
  const maxMilestones = (opts && opts.maxMilestones) || 8;
  const maxTasks = (opts && opts.maxTasks) || 20;
  const errors = [];

  // 1. Top-level structure
  if (!roadmap || typeof roadmap !== 'object' || Array.isArray(roadmap)) {
    return { ok: false, errors: ['roadmap-not-object'] };
  }
  if (!Array.isArray(roadmap.milestones)) {
    return { ok: false, errors: ['milestones-not-array'] };
  }
  if (!Array.isArray(roadmap.tasks)) {
    return { ok: false, errors: ['tasks-not-array'] };
  }

  // 2. Minimum content — server endpoint returns AI preview, not editable draft
  if (roadmap.milestones.length === 0) {
    errors.push('empty-milestones');
  }
  if (roadmap.tasks.length === 0) {
    errors.push('empty-tasks');
  }

  // 3. Caps
  if (roadmap.milestones.length > maxMilestones) {
    errors.push('too-many-milestones');
  }
  if (roadmap.tasks.length > maxTasks) {
    errors.push('too-many-tasks');
  }

  // 4. Milestone validation
  const milestoneIds = new Set();
  for (let i = 0; i < roadmap.milestones.length; i++) {
    const m = roadmap.milestones[i];
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      errors.push('milestone-' + i + '-not-object');
      continue;
    }
    if (typeof m.tempId !== 'string' || !m.tempId.trim() || m.tempId.length > MAX_ID_LEN) {
      errors.push('milestone-' + i + '-invalid-tempid');
    } else if (milestoneIds.has(m.tempId)) {
      errors.push('milestone-' + i + '-duplicate-tempid');
    } else {
      milestoneIds.add(m.tempId);
    }
    if (typeof m.title !== 'string' || !m.title.trim() || m.title.length > MAX_TITLE_LEN) {
      errors.push('milestone-' + i + '-invalid-title');
    }
    // order: optional, integer, positive
    if (m.order !== undefined && m.order !== null) {
      if (typeof m.order !== 'number' || !Number.isFinite(m.order) || m.order < 1 || m.order > 1000) {
        errors.push('milestone-' + i + '-invalid-order');
      }
    }
  }

  // 5. Task validation (two-pass: first collect IDs, then validate references)
  const taskIds = new Set();
  for (let i = 0; i < roadmap.tasks.length; i++) {
    const t = roadmap.tasks[i];
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
      errors.push('task-' + i + '-not-object');
      continue;
    }
    if (typeof t.tempId !== 'string' || !t.tempId.trim() || t.tempId.length > MAX_ID_LEN) {
      errors.push('task-' + i + '-invalid-tempid');
    } else if (taskIds.has(t.tempId)) {
      errors.push('task-' + i + '-duplicate-tempid');
    } else {
      taskIds.add(t.tempId);
    }
    if (typeof t.title !== 'string' || !t.title.trim() || t.title.length > MAX_TITLE_LEN) {
      errors.push('task-' + i + '-invalid-title');
    }
    if (t.milestoneId && !milestoneIds.has(t.milestoneId)) {
      errors.push('task-' + i + '-unknown-milestone');
    }
    if (t.duration !== null && t.duration !== undefined) {
      if (typeof t.duration !== 'number' || !Number.isFinite(t.duration) || t.duration < 1 || t.duration > 1440) {
        errors.push('task-' + i + '-invalid-duration');
      }
    }
    if (t.deadline !== null && t.deadline !== undefined) {
      if (typeof t.deadline !== 'string' || !isValidCalendarDate(t.deadline)) {
        errors.push('task-' + i + '-invalid-deadline');
      }
    }
    // dependsOn: validate type after all IDs collected
    if (t.dependsOn !== undefined && t.dependsOn !== null && !Array.isArray(t.dependsOn)) {
      errors.push('task-' + i + '-dependsOn-not-array');
    }
    // existingTaskKey: MUST exist in canonical set — no bypass when empty
    if (t.existingTaskKey !== undefined && t.existingTaskKey !== null) {
      if (typeof t.existingTaskKey !== 'string' || !t.existingTaskKey.trim()) {
        errors.push('task-' + i + '-invalid-existingTaskKey');
      } else if (!existingWorkKeys || !existingWorkKeys.has(t.existingTaskKey)) {
        // Bug fix: reject if no canonical set exists OR key not in set
        errors.push('task-' + i + '-hallucinated-existingTaskKey');
      }
    }
    // source: validate structure
    if (t.source !== undefined && t.source !== null) {
      if (typeof t.source !== 'object' || Array.isArray(t.source)) {
        errors.push('task-' + i + '-invalid-source');
      } else if (typeof t.source.kind === 'string' && !VALID_SOURCE_KINDS.includes(t.source.kind)) {
        errors.push('task-' + i + '-invalid-source-kind');
      }
    }
  }

  // Pass 2: validate dependsOn references
  for (let i = 0; i < roadmap.tasks.length; i++) {
    const t = roadmap.tasks[i];
    if (!t || !Array.isArray(t.dependsOn)) continue;
    for (const dep of t.dependsOn) {
      if (!taskIds.has(dep)) {
        errors.push('task-' + i + '-unknown-dependency');
      }
    }
  }

  // 6. Self-reference check
  for (let i = 0; i < roadmap.tasks.length; i++) {
    const t = roadmap.tasks[i];
    if (t && Array.isArray(t.dependsOn) && t.dependsOn.includes(t.tempId)) {
      errors.push('task-' + i + '-self-reference');
    }
  }

  // 7. Dependency depth enforcement (iterative to avoid recursion)
  if (errors.length === 0 && roadmap.tasks.length > 0) {
    // Build adjacency: dep → dependent (reversed for depth calc)
    const adjMap = new Map();
    for (const t of roadmap.tasks) adjMap.set(t.tempId, []);
    for (const t of roadmap.tasks) {
      if (Array.isArray(t.dependsOn)) {
        for (const dep of t.dependsOn) {
          if (adjMap.has(dep)) adjMap.get(dep).push(t.tempId);
        }
      }
    }

    // 8. Cycle detection via iterative DFS
    const visited = new Set();
    const recStack = new Set();
    function dfs(node) {
      visited.add(node);
      recStack.add(node);
      for (const neighbor of (adjMap.get(node) || [])) {
        if (!visited.has(neighbor)) { if (dfs(neighbor)) return true; }
        else if (recStack.has(neighbor)) return true;
      }
      recStack.delete(node);
      return false;
    }
    for (const node of adjMap.keys()) {
      if (!visited.has(node) && dfs(node)) {
        errors.push('dependency-cycle');
        break;
      }
    }

    // 9. Dependency depth (only if no cycle)
    if (!errors.includes('dependency-cycle')) {
      // Compute depth via topological DP
      const inDegree = new Map();
      const depthMap = new Map();
      for (const t of roadmap.tasks) {
        inDegree.set(t.tempId, 0);
        depthMap.set(t.tempId, 0);
      }
      for (const t of roadmap.tasks) {
        if (Array.isArray(t.dependsOn)) {
          for (const dep of t.dependsOn) {
            if (inDegree.has(t.tempId)) inDegree.set(t.tempId, inDegree.get(t.tempId) + 1);
          }
        }
      }
      // Kahn's algorithm for topological order + depth
      const queue = [];
      for (const [id, deg] of inDegree) { if (deg === 0) queue.push(id); }
      let processed = 0;
      while (queue.length > 0) {
        const current = queue.shift();
        processed++;
        for (const t of roadmap.tasks) {
          if (Array.isArray(t.dependsOn) && t.dependsOn.includes(current)) {
            const newDepth = depthMap.get(current) + 1;
            if (newDepth > depthMap.get(t.tempId)) depthMap.set(t.tempId, newDepth);
            const deg = inDegree.get(t.tempId) - 1;
            inDegree.set(t.tempId, deg);
            if (deg === 0) queue.push(t.tempId);
          }
        }
      }
      let maxDepth = 0;
      for (const d of depthMap.values()) { if (d > maxDepth) maxDepth = d; }
      if (maxDepth > MAX_DEPENDENCY_DEPTH) {
        errors.push('dependency-depth-exceeded');
      }
    }
  }

  // 10. Reuse array validation
  if (roadmap.reuse !== undefined && roadmap.reuse !== null) {
    if (!Array.isArray(roadmap.reuse)) {
      errors.push('reuse-not-array');
    } else if (roadmap.reuse.length > MAX_REUSE_LEN) {
      errors.push('reuse-too-many');
    } else {
      for (let i = 0; i < roadmap.reuse.length; i++) {
        const r = roadmap.reuse[i];
        if (!r || typeof r !== 'object' || Array.isArray(r)) {
          errors.push('reuse-' + i + '-not-object');
          continue;
        }
        if (typeof r.existingTaskKey !== 'string' || !r.existingTaskKey.trim()) {
          errors.push('reuse-' + i + '-invalid-existingTaskKey');
        } else if (!existingWorkKeys || !existingWorkKeys.has(r.existingTaskKey)) {
          errors.push('reuse-' + i + '-hallucinated-existingTaskKey');
        }
        if (r.roadmapTitle !== undefined && r.roadmapTitle !== null) {
          if (typeof r.roadmapTitle !== 'string' || r.roadmapTitle.length > MAX_TITLE_LEN) {
            errors.push('reuse-' + i + '-invalid-roadmapTitle');
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function isValidCalendarDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const parts = s.split('-').map(Number);
  const year = parts[0], month = parts[1], day = parts[2];
  if (year < 2020 || year > 2099) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

module.exports = { validateRoadmapModelOutput, isValidCalendarDate };
