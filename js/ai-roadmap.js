/**
 * js/ai-roadmap.js — Phase 6M: Goal-to-Roadmap + Safe Milestone Planning
 *
 * Deterministic helpers for:
 *  - Goal normalization (P11-P13)
 *  - Roadmap Preview schema (P4-P5)
 *  - Milestone model (P20-P21)
 *  - Candidate task model (P16-P17)
 *  - Dependency validation (P22-P24)
 *  - Cycle detection (P23)
 *  - Existing task reuse (P25-P26)
 *  - Feasibility via Phase 6H/6J (P41-P46)
 *  - Roadmap refinement + revision + undo (P49-P54)
 *  - Convert to Phase 6G proposal (P57-P62)
 *  - AI estimate provenance (P18-P19)
 *  - Roadmap intent router (P6-P10)
 *
 * NO Gemini calls. NO server calls. Pure local logic.
 * NO mutation of TaskFlow state.
 */
;(function (g) {
  'use strict';

  var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var TEMP_ID_RE = /^[rm]\d+$/;
  var MAX_MILESTONES = 8;   // P15
  var MAX_TASKS = 20;        // P15
  var MAX_DEPTH = 4;         // P24
  var MAX_HISTORY = 5;       // P53

  /* Strict calendar date validation — rejects impossible dates like 2026-02-30 */
  function isValidCalendarDate(s) {
    if (typeof s !== 'string' || !ISO_DATE_RE.test(s)) return false;
    var parts = s.split('-').map(Number);
    var year = parts[0], month = parts[1], day = parts[2];
    if (year < 2020 || year > 2099) return false;
    var d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  }

  /* ─── P11: Goal Normalization ─── */
  function normalizeGoal(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title) return null;
    return {
      title: title,
      targetDate: (raw.targetDate && isValidCalendarDate(raw.targetDate)) ? raw.targetDate : null,
      desiredOutcome: typeof raw.desiredOutcome === 'string' ? raw.desiredOutcome.trim() : null,
      scope: raw.scope || null,
      constraints: raw.constraints || null
    };
  }

  /* ─── P4: Roadmap Preview Schema ─── */
  function createRoadmap(opts) {
    var goal = normalizeGoal(opts && opts.goal);
    if (!goal) return null;
    return {
      roadmapId: 'roadmap-' + Date.now(),
      revision: 0,
      goal: goal,
      scope: (opts && opts.scope) || null,
      milestones: [],
      tasks: [],
      warnings: [],
      assumptions: [],
      feasibility: { status: 'unknown', totalWorkMinutes: 0, capacityMinutes: 0, slackMinutes: 0 },
      createdAt: Date.now()
    };
  }

  /* ─── Milestone Helpers ─── */
  function addMilestone(roadmap, milestone) {
    if (!roadmap || !milestone) return false;
    if (!Array.isArray(roadmap.milestones)) roadmap.milestones = [];
    if (roadmap.milestones.length >= MAX_MILESTONES) return false;
    var id = milestone.id || ('m' + (roadmap.milestones.length + 1));
    if (roadmap.milestones.some(function (m) { return m.id === id; })) return false;
    roadmap.milestones.push({
      id: id,
      title: milestone.title || 'Untitled',
      order: typeof milestone.order === 'number' ? milestone.order : roadmap.milestones.length + 1,
      candidateTaskIds: []
    });
    return true;
  }

  function removeMilestone(roadmap, milestoneId) {
    if (!roadmap || !milestoneId) return false;
    var idx = roadmap.milestones.findIndex(function (m) { return m.id === milestoneId; });
    if (idx < 0) return false;
    roadmap.milestones.splice(idx, 1);
    // Remove orphaned tasks
    if (Array.isArray(roadmap.tasks)) {
      roadmap.tasks = roadmap.tasks.filter(function (t) { return t.milestoneId !== milestoneId; });
    }
    return true;
  }

  /* ─── Candidate Task Helpers ─── */
  function addCandidateTask(roadmap, task) {
    if (!roadmap || !task) return false;
    if (!Array.isArray(roadmap.tasks)) roadmap.tasks = [];
    if (roadmap.tasks.length >= MAX_TASKS) return false;
    var id = task.id || ('r' + (roadmap.tasks.length + 1));
    if (roadmap.tasks.some(function (t) { return t.id === id; })) return false;

    var newTask = {
      id: id,
      milestoneId: task.milestoneId || null,
      title: task.title || '',
      duration: typeof task.duration === 'number' ? Math.max(1, task.duration) : null,
      deadline: (task.deadline && isValidCalendarDate(task.deadline)) ? task.deadline : null,
      dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn : [],
      existingTaskKey: task.existingTaskKey || null,
      source: task.source || 'ai-suggested',
      required: task.required !== false,
      aiEstimated: !!task.aiEstimated
    };

    roadmap.tasks.push(newTask);

    // Add to milestone's candidateTaskIds
    if (newTask.milestoneId) {
      var ms = roadmap.milestones.find(function (m) { return m.id === newTask.milestoneId; });
      if (ms && Array.isArray(ms.candidateTaskIds)) {
        ms.candidateTaskIds.push(id);
      }
    }
    return true;
  }

  function removeCandidateTask(roadmap, taskId) {
    if (!roadmap || !taskId) return false;
    var idx = roadmap.tasks.findIndex(function (t) { return t.id === taskId; });
    if (idx < 0) return false;
    var task = roadmap.tasks[idx];
    roadmap.tasks.splice(idx, 1);
    // Remove from milestone's candidateTaskIds
    if (task.milestoneId) {
      var ms = roadmap.milestones.find(function (m) { return m.id === task.milestoneId; });
      if (ms && Array.isArray(ms.candidateTaskIds)) {
        ms.candidateTaskIds = ms.candidateTaskIds.filter(function (tid) { return tid !== taskId; });
      }
    }
    // Remove from other tasks' dependsOn
    roadmap.tasks.forEach(function (t) {
      if (Array.isArray(t.dependsOn)) {
        t.dependsOn = t.dependsOn.filter(function (d) { return d !== taskId; });
      }
    });
    return true;
  }

  /* ─── P22-P24: Dependency Validation ─── */
  function validateDependencies(roadmap) {
    var errors = [];
    if (!roadmap || !Array.isArray(roadmap.tasks)) return errors;
    var taskIds = {};
    roadmap.tasks.forEach(function (t) { taskIds[t.id] = true; });

    roadmap.tasks.forEach(function (t) {
      if (!Array.isArray(t.dependsOn)) return;
      t.dependsOn.forEach(function (depId) {
        if (!taskIds[depId]) {
          errors.push({ code: 'unknown-ref', taskId: t.id, ref: depId });
        }
        if (depId === t.id) {
          errors.push({ code: 'self-reference', taskId: t.id });
        }
      });
    });

    return errors;
  }

  /* ─── P23: Cycle Detection ─── */
  function detectCycle(roadmap) {
    if (!roadmap || !Array.isArray(roadmap.tasks)) return false;
    var adj = {};
    roadmap.tasks.forEach(function (t) {
      adj[t.id] = Array.isArray(t.dependsOn) ? t.dependsOn.slice() : [];
    });

    var WHITE = 0, GRAY = 1, BLACK = 2;
    var color = {};
    Object.keys(adj).forEach(function (k) { color[k] = WHITE; });

    function dfs(node) {
      color[node] = GRAY;
      var neighbors = adj[node] || [];
      for (var i = 0; i < neighbors.length; i++) {
        var next = neighbors[i];
        if (color[next] === GRAY) return true; // cycle
        if (color[next] === WHITE && dfs(next)) return true;
      }
      color[node] = BLACK;
      return false;
    }

    var nodes = Object.keys(adj);
    for (var i = 0; i < nodes.length; i++) {
      if (color[nodes[i]] === WHITE && dfs(nodes[i])) return true;
    }
    return false;
  }

  /* ─── P24: Dependency Depth ─── */
  function dependencyDepth(roadmap) {
    if (!roadmap || !Array.isArray(roadmap.tasks)) return 0;
    var adj = {};
    roadmap.tasks.forEach(function (t) {
      adj[t.id] = Array.isArray(t.dependsOn) ? t.dependsOn.slice() : [];
    });

    var memo = {};
    function depth(node, visited) {
      if (visited[node]) return 0; // prevent infinite loop
      if (memo[node] !== undefined) return memo[node];
      var deps = adj[node] || [];
      if (!deps.length) { memo[node] = 0; return 0; }
      var maxD = 0;
      visited[node] = true;
      for (var i = 0; i < deps.length; i++) {
        maxD = Math.max(maxD, 1 + depth(deps[i], visited));
      }
      delete visited[node];
      memo[node] = maxD;
      return maxD;
    }

    var maxDepth = 0;
    Object.keys(adj).forEach(function (k) {
      maxDepth = Math.max(maxDepth, depth(k, {}));
    });
    return maxDepth;
  }

  /* ─── P25-P26: Duplicate Detection ─── */
  function detectDuplicates(roadmap, existingTasks) {
    if (!roadmap || !Array.isArray(roadmap.tasks)) return [];
    if (!Array.isArray(existingTasks)) existingTasks = [];
    var duplicates = [];

    roadmap.tasks.forEach(function (rt) {
      if (rt.existingTaskKey) return; // already references existing
      var normTitle = (rt.title || '').toLowerCase().trim();
      existingTasks.forEach(function (et) {
        var etTitle = (et.text || et.title || '').toLowerCase().trim();
        if (normTitle && etTitle && normTitle === etTitle) {
          duplicates.push({ roadmapTaskId: rt.id, existingTaskUid: et.uid || et.id, title: rt.title });
        }
      });
    });

    return duplicates;
  }

  /* ─── P41-P46: Feasibility Check ─── */
  function computeFeasibility(roadmap, availableCapacityMinutes, nowDate) {
    if (!roadmap) return { status: 'unknown', totalWorkMinutes: 0, capacityMinutes: 0, slackMinutes: 0 };

    var totalWork = 0;
    var hasUnknownDuration = false;
    if (Array.isArray(roadmap.tasks)) {
      roadmap.tasks.forEach(function (t) {
        if (typeof t.duration === 'number' && t.duration > 0) {
          totalWork += t.duration;
        } else {
          hasUnknownDuration = true;
        }
      });
    }

    var capacity = typeof availableCapacityMinutes === 'number' ? availableCapacityMinutes : 0;
    var slack = capacity - totalWork;
    var status;

    if (hasUnknownDuration && roadmap.tasks.some(function (t) { return !t.duration; })) {
      status = 'unknown';
    } else if (slack >= 60) {
      status = 'feasible';
    } else if (slack >= 0) {
      status = 'tight';
    } else {
      status = 'insufficient-capacity';
    }

    return {
      status: status,
      totalWorkMinutes: totalWork,
      capacityMinutes: capacity,
      slackMinutes: slack,
      hasUnknownDuration: hasUnknownDuration
    };
  }

  /* ─── P6-P10: Goal Intent Router ─── */
  function classifyGoalIntent(message) {
    if (typeof message !== 'string') return null;
    var s = message.toLowerCase().trim();

    // Decompose existing (check before goal-roadmap — requires explicit decompose/breakdown/split/chia nhỏ)
    if (/(?:chia\s+nhỏ|phân\s+rã|breakdown|decompose|split\s+nhỏ|phân\s+tách).*(?:mục\s+tiêu|goal|này|this|project|đồ\s+án)/i.test(s))
      return { kind: 'goal-decompose', confidence: 'high', reason: 'decompose' };

    // Goal → roadmap
    if (/(?:roadmap|lộ\s+trình|kế\s+hoạch|chia|phân|rã|breakdown|decompose).*(?:mục\s+tiêu|goal|đồ\s+án|project|assignment|bài)/i.test(s))
      return { kind: 'goal-roadmap', confidence: 'high', reason: 'goal-roadmap' };
    if (/(?:hoàn\s+thành|làm\s+xong|đạt| hoàn成|finish|complete).*(?:trước|before|trong|within|tuần|week|tháng|month|ngày|day)/i.test(s) &&
        /(?:roadmap|lộ\s+trình|kế\s+hoạch|chia|breakdown|steps|bước)/i.test(s))
      return { kind: 'goal-roadmap', confidence: 'high', reason: 'goal-roadmap-implicit' };
    if (/(?:tôi\s+muốn|học|xong|làm|đạt|hoàn\s+thành).*(?:trong|trước|before|within|tuần|week|tháng|month)/i.test(s) &&
        !/(?:task|công\s+việc|xếp|lịch|schedule|plan|kế\s+hoạch\s+ngày)/i.test(s))
      return { kind: 'goal-roadmap', confidence: 'medium', reason: 'goal-timeline' };

    // Roadmap question
    if (/(?:roadmap|lộ\s+trình).*(?:quá|nhiều|ít|thiếu|đủ|quá\s+lớn|insufficient|feasible|cufficient|tight)/i.test(s))
      return { kind: 'roadmap-question', confidence: 'high', reason: 'roadmap-question' };

    // What-if roadmap
    if (/(?:nếu|what\s*if|giả\s+sử).*(?:roadmap|lộ\s+trình|mục\s+tiêu|deadline|thời\s+hạn)/i.test(s))
      return { kind: 'what-if-roadmap', confidence: 'high', reason: 'what-if-roadmap' };

    // Convert
    if (/(?:đưa|apply|convert|tạo|create).*(?:task|đề\s+xử|proposal|tất\s+cả|all)/i.test(s) &&
        /(?:roadmap|mục\s+tiêu|lộ\s+trình)/i.test(s))
      return { kind: 'roadmap-convert', confidence: 'high', reason: 'roadmap-convert' };

    // Refine
    if (/(?:thêm|add|xóa|remove|bỏ|sửa|edit|chia|split|gộp|merge).*(?:bước|step|task|milestone|mốc)/i.test(s))
      return { kind: 'roadmap-refine', confidence: 'high', reason: 'roadmap-refine' };

    // Plan from roadmap
    if (/(?:xem|preview|lên|schedule|kế\s+hoạch\s+lịch).*(?:roadmap|lộ\s+trình|mục\s+tiêu)/i.test(s))
      return { kind: 'roadmap-plan', confidence: 'high', reason: 'roadmap-plan' };

    return null;
  }

  /* ─── P39: Full Roadmap Validation ─── */
  function validateRoadmap(roadmap) {
    var errors = [];
    if (!roadmap || typeof roadmap !== 'object') return { valid: false, errors: [{ code: 'not-object' }] };

    if (!roadmap.goal || !roadmap.goal.title) errors.push({ code: 'missing-goal-title' });
    if (roadmap.goal && roadmap.goal.targetDate && !isValidCalendarDate(roadmap.goal.targetDate)) {
      errors.push({ code: 'invalid-target-date', date: roadmap.goal.targetDate });
    }
    if (!Array.isArray(roadmap.milestones)) errors.push({ code: 'missing-milestones' });
    else if (roadmap.milestones.length > MAX_MILESTONES) errors.push({ code: 'too-many-milestones', count: roadmap.milestones.length });
    if (!Array.isArray(roadmap.tasks)) errors.push({ code: 'missing-tasks' });
    else if (roadmap.tasks.length > MAX_TASKS) errors.push({ code: 'too-many-tasks', count: roadmap.tasks.length });

    // Validate temp IDs
    if (Array.isArray(roadmap.milestones)) {
      var mIds = {};
      roadmap.milestones.forEach(function (m) {
        if (!m.id) errors.push({ code: 'missing-milestone-id' });
        else if (mIds[m.id]) errors.push({ code: 'duplicate-milestone-id', id: m.id });
        else mIds[m.id] = true;
        if (!m.title) errors.push({ code: 'missing-milestone-title', id: m.id });
      });
    }

    if (Array.isArray(roadmap.tasks)) {
      var tIds = {};
      roadmap.tasks.forEach(function (t) {
        if (!t.id) errors.push({ code: 'missing-task-id' });
        else if (tIds[t.id]) errors.push({ code: 'duplicate-task-id', id: t.id });
        else tIds[t.id] = true;
        if (!t.title) errors.push({ code: 'missing-task-title', id: t.id });
        if (t.deadline && !isValidCalendarDate(t.deadline)) {
          errors.push({ code: 'invalid-deadline', taskId: t.id, date: t.deadline });
        }
        if (t.milestoneId && roadmap.milestones && !roadmap.milestones.some(function (m) { return m.id === t.milestoneId; })) {
          errors.push({ code: 'unknown-milestone-ref', taskId: t.id, milestoneId: t.milestoneId });
        }
      });
    }

    // Dependency validation
    var depErrors = validateDependencies(roadmap);
    errors = errors.concat(depErrors);

    // Cycle detection
    if (detectCycle(roadmap)) errors.push({ code: 'cycle-detected' });

    // Depth check
    var depth = dependencyDepth(roadmap);
    if (depth > MAX_DEPTH) errors.push({ code: 'depth-exceeded', depth: depth });

    return { valid: errors.length === 0, errors: errors };
  }

  /* ─── P57-P62: Convert Roadmap → Phase 6G Proposal ─── */
  function convertToProposal(roadmap, selectedMilestoneIds) {
    if (!roadmap || !Array.isArray(roadmap.tasks)) return { ok: false, error: 'invalid-roadmap' };

    var validation = validateRoadmap(roadmap);
    if (!validation.valid) return { ok: false, error: 'validation-failed', errors: validation.errors };

    // Determine which tasks to convert
    var tasksToConvert;
    if (Array.isArray(selectedMilestoneIds) && selectedMilestoneIds.length > 0) {
      tasksToConvert = roadmap.tasks.filter(function (t) {
        return t.milestoneId && selectedMilestoneIds.indexOf(t.milestoneId) >= 0;
      });
    } else {
      tasksToConvert = roadmap.tasks.filter(function (t) { return !t.existingTaskKey; });
    }

    // Dependency closure (P62)
    var included = {};
    tasksToConvert.forEach(function (t) { included[t.id] = true; });
    var changed = true;
    while (changed) {
      changed = false;
      tasksToConvert.forEach(function (t) {
        if (Array.isArray(t.dependsOn)) {
          t.dependsOn.forEach(function (depId) {
            if (!included[depId]) {
              var depTask = roadmap.tasks.find(function (rt) { return rt.id === depId; });
              if (depTask && !depTask.existingTaskKey) {
                tasksToConvert.push(depTask);
                included[depId] = true;
                changed = true;
              }
            }
          });
        }
      });
    }

    // Build proposal actions
    var actions = [];
    var actionId = 0;
    tasksToConvert.forEach(function (t) {
      if (t.existingTaskKey) return; // don't create existing tasks
      actionId++;
      actions.push({
        id: 'a' + actionId,
        type: 'create_task',
        args: {
          text: t.title,
          duration: t.duration || null,
          date: t.deadline || null,
          priority: t.required ? true : undefined
        }
      });
    });

    if (actions.length === 0) return { ok: true, proposal: { actions: [], summary: 'No new tasks to create.' } };

    return {
      ok: true,
      proposal: {
        actions: actions,
        summary: actions.length + ' tasks from roadmap'
      }
    };
  }

  /* ─── P49-P54: Refinement / Revision / Undo ─── */
  function createRoadmapState(roadmap) {
    if (!roadmap) return null;
    return {
      revision: 0,
      originalRoadmap: JSON.parse(JSON.stringify(roadmap)),
      workingRoadmap: JSON.parse(JSON.stringify(roadmap)),
      history: []
    };
  }

  function refineRoadmap(state, editFn) {
    if (!state || typeof editFn !== 'function') return false;
    // Save current to history
    if (state.history.length >= MAX_HISTORY) state.history.shift();
    state.history.push(JSON.parse(JSON.stringify(state.workingRoadmap)));
    // Apply edit
    editFn(state.workingRoadmap);
    state.revision++;
    return true;
  }

  function undoRoadmap(state) {
    if (!state || !state.history.length) return false;
    state.workingRoadmap = state.history.pop();
    state.revision++;
    return true;
  }

  function resetRoadmap(state) {
    if (!state || !state.originalRoadmap) return false;
    state.workingRoadmap = JSON.parse(JSON.stringify(state.originalRoadmap));
    state.history = [];
    state.revision++;
    return true;
  }

  /* ─── P46: Roadmap Health Summary ─── */
  function buildRoadmapSummary(roadmap) {
    if (!roadmap) return null;
    var totalWork = 0;
    var taskCount = 0;
    var milestoneCount = roadmap.milestones ? roadmap.milestones.length : 0;
    var tasksWithDuration = 0;

    if (Array.isArray(roadmap.tasks)) {
      taskCount = roadmap.tasks.length;
      roadmap.tasks.forEach(function (t) {
        if (typeof t.duration === 'number' && t.duration > 0) {
          totalWork += t.duration;
          tasksWithDuration++;
        }
      });
    }

    var hours = Math.round(totalWork / 60 * 10) / 10;
    var feasibility = roadmap.feasibility || {};

    return {
      milestoneCount: milestoneCount,
      taskCount: taskCount,
      totalWorkMinutes: totalWork,
      totalWorkHours: hours,
      tasksWithEstimate: tasksWithDuration,
      tasksWithoutEstimate: taskCount - tasksWithDuration,
      feasibilityStatus: feasibility.status || 'unknown',
      slackMinutes: feasibility.slackMinutes || 0
    };
  }

  /* ─── Final roadmap validation (for AI-generated roadmaps before apply) ─── */
  function validateRoadmapForApply(roadmap) {
    var base = validateRoadmap(roadmap);
    if (!base.valid) return base;
    var errors = [];
    // Final AI roadmap must have useful content
    if (Array.isArray(roadmap.milestones) && roadmap.milestones.length === 0) {
      errors.push({ code: 'empty-milestones' });
    }
    if (Array.isArray(roadmap.tasks) && roadmap.tasks.length === 0) {
      errors.push({ code: 'empty-tasks' });
    }
    return { valid: errors.length === 0, errors: errors };
  }

  /* ─── Exports ─── */
  var api = {
    MAX_MILESTONES: MAX_MILESTONES,
    MAX_TASKS: MAX_TASKS,
    MAX_DEPTH: MAX_DEPTH,
    MAX_HISTORY: MAX_HISTORY,

    isValidCalendarDate: isValidCalendarDate,
    normalizeGoal: normalizeGoal,
    createRoadmap: createRoadmap,
    addMilestone: addMilestone,
    removeMilestone: removeMilestone,
    addCandidateTask: addCandidateTask,
    removeCandidateTask: removeCandidateTask,
    validateDependencies: validateDependencies,
    detectCycle: detectCycle,
    dependencyDepth: dependencyDepth,
    detectDuplicates: detectDuplicates,
    computeFeasibility: computeFeasibility,
    classifyGoalIntent: classifyGoalIntent,
    validateRoadmap: validateRoadmap,
    validateRoadmapForApply: validateRoadmapForApply,
    convertToProposal: convertToProposal,
    createRoadmapState: createRoadmapState,
    refineRoadmap: refineRoadmap,
    undoRoadmap: undoRoadmap,
    resetRoadmap: resetRoadmap,
    buildRoadmapSummary: buildRoadmapSummary
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    g.TaskFlowAIRoadmap = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
