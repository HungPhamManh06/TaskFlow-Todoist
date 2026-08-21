/**
 * Phase 6R.2 — Server-Side Roadmap Model Output Validator
 *
 * Validates untrusted AI-generated roadmap JSON before it reaches the client.
 * Every bad milestone or task invalidates the entire response (atomic).
 * No silent dropping of invalid items.
 */

'use strict';

const MAX_ID_LEN = 64;
const MAX_TITLE_LEN = 200;
const MAX_DEPENDENCY_DEPTH = 4;
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

  // 2. Caps
  if (roadmap.milestones.length > maxMilestones) {
    errors.push('too-many-milestones');
  }
  if (roadmap.tasks.length > maxTasks) {
    errors.push('too-many-tasks');
  }

  // 3. Milestone validation
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
  }

  // 4. Task validation (two-pass: first collect IDs, then validate references)
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
    // dependsOn: validate references after all IDs collected
    if (t.dependsOn !== undefined && t.dependsOn !== null && !Array.isArray(t.dependsOn)) {
      errors.push('task-' + i + '-dependsOn-not-array');
    }
    if (t.existingTaskKey !== undefined && t.existingTaskKey !== null) {
      if (typeof t.existingTaskKey !== 'string') {
        errors.push('task-' + i + '-invalid-existingTaskKey');
      } else if (existingWorkKeys && existingWorkKeys.size > 0 && !existingWorkKeys.has(t.existingTaskKey)) {
        errors.push('task-' + i + '-hallucinated-existingTaskKey');
      }
    }
    if (t.source && typeof t.source === 'object') {
      if (typeof t.source.kind === 'string' && !VALID_SOURCE_KINDS.includes(t.source.kind)) {
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

  // 5. Self-reference check
  for (let i = 0; i < roadmap.tasks.length; i++) {
    const t = roadmap.tasks[i];
    if (t && Array.isArray(t.dependsOn) && t.dependsOn.includes(t.tempId)) {
      errors.push('task-' + i + '-self-reference');
    }
  }

  // 6. Cycle detection via DFS
  if (errors.length === 0 && roadmap.tasks.length > 0) {
    const adjMap = new Map();
    for (const t of roadmap.tasks) {
      adjMap.set(t.tempId, []);
    }
    for (const t of roadmap.tasks) {
      if (Array.isArray(t.dependsOn)) {
        for (const dep of t.dependsOn) {
          if (adjMap.has(dep)) adjMap.get(dep).push(t.tempId);
        }
      }
    }
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
