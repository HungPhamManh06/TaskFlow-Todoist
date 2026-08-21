// TaskFlow — Goal Progress & Milestone Tracking (Phase 6P).
// Tracks roadmap goals after tasks become canonical TaskFlow work.
// Pure deterministic functions — 0 Gemini, 0 server calls, 0 canonical mutation.
// Device-local only. Explicit user opt-in required.
// Storage key: taskflow_goal_tracking_v1
// Export: loadGoalTrackers, saveGoalTrackers, createGoalTracker, deleteGoalTracker,
//   linkTaskToGoal, unlinkTaskFromGoal, markGoalComplete, markGoalActive,
//   computeMilestoneStatus, computeGoalProgress, computeGoalHealth,
//   computeGoalSummary, findMissingTasks, findNextAction,
//   explainGoalHealth, classifyGoalTrackingIntent,
//   GOAL_TRACKING_VERSION, GOAL_TRACKING_KEY, MAX_ACTIVE_GOALS
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowGoalTracking = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ---- Constants ----
  const GOAL_TRACKING_VERSION = 1;
  const GOAL_TRACKING_KEY = 'taskflow_goal_tracking_v1';
  const MAX_ACTIVE_GOALS = 20;

  // ---- Storage ----

  function loadGoalTrackers() {
    try {
      const raw = localStorage.getItem(GOAL_TRACKING_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.trackers)) return [];
      return data.trackers;
    } catch (e) {
      return [];
    }
  }

  function saveGoalTrackers(trackers) {
    try {
      // Bound: max 20 active goals
      const trimmed = Array.isArray(trackers) ? trackers.slice(0, MAX_ACTIVE_GOALS) : [];
      localStorage.setItem(GOAL_TRACKING_KEY, JSON.stringify({ version: GOAL_TRACKING_VERSION, trackers: trimmed }));
    } catch (e) { /* degrade */ }
  }

  // ---- Tracker CRUD ----

  function createGoalTracker(title, targetDate, milestones, taskMap) {
    if (!title || typeof title !== 'string') return { error: 'invalid-title' };
    const trackers = loadGoalTrackers();
    if (trackers.length >= MAX_ACTIVE_GOALS) return { error: 'too-many-goals' };
    const tracker = {
      id: 'goal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      version: GOAL_TRACKING_VERSION,
      title: title.trim(),
      targetDate: targetDate || null,
      createdAt: new Date().toISOString(),
      source: { kind: 'manual', roadmapId: null },
      milestones: (Array.isArray(milestones) ? milestones : []).map((m, i) => ({
        id: m.id || 'm_' + (i + 1),
        title: m.title || '',
        order: i + 1,
        requiredTaskUids: Array.isArray(m.requiredTaskUids) ? m.requiredTaskUids : [],
        optionalTaskUids: Array.isArray(m.optionalTaskUids) ? m.optionalTaskUids : []
      })),
      linkedTaskUids: [],
      status: 'active'
    };
    // Deduplicate linked UIDs from milestones
    const uidSet = new Set();
    for (const m of tracker.milestones) {
      for (const uid of m.requiredTaskUids) uidSet.add(uid);
      for (const uid of m.optionalTaskUids) uidSet.add(uid);
    }
    tracker.linkedTaskUids = Array.from(uidSet);
    trackers.push(tracker);
    saveGoalTrackers(trackers);
    return { tracker };
  }

  function deleteGoalTracker(goalId) {
    const trackers = loadGoalTrackers();
    const idx = trackers.findIndex((t) => t.id === goalId);
    if (idx < 0) return { error: 'not-found' };
    trackers.splice(idx, 1);
    saveGoalTrackers(trackers);
    return { deleted: goalId };
  }

  function markGoalComplete(goalId) {
    const trackers = loadGoalTrackers();
    const tracker = trackers.find((t) => t.id === goalId);
    if (!tracker) return { error: 'not-found' };
    tracker.status = 'completed';
    tracker.completedAt = new Date().toISOString();
    saveGoalTrackers(trackers);
    return { tracker };
  }

  function markGoalActive(goalId) {
    const trackers = loadGoalTrackers();
    const tracker = trackers.find((t) => t.id === goalId);
    if (!tracker) return { error: 'not-found' };
    tracker.status = 'active';
    delete tracker.completedAt;
    saveGoalTrackers(trackers);
    return { tracker };
  }

  // ---- Task Linking ----

  function linkTaskToGoal(goalId, milestoneId, taskUid, required) {
    if (!goalId || !milestoneId || !taskUid) return { error: 'missing-params' };
    const trackers = loadGoalTrackers();
    const tracker = trackers.find((t) => t.id === goalId);
    if (!tracker) return { error: 'not-found' };
    const milestone = tracker.milestones.find((m) => m.id === milestoneId);
    if (!milestone) return { error: 'milestone-not-found' };
    // Remove from both lists first (dedup)
    milestone.requiredTaskUids = milestone.requiredTaskUids.filter((u) => u !== taskUid);
    milestone.optionalTaskUids = milestone.optionalTaskUids.filter((u) => u !== taskUid);
    if (required) {
      milestone.requiredTaskUids.push(taskUid);
    } else {
      milestone.optionalTaskUids.push(taskUid);
    }
    // Rebuild linkedTaskUids
    const uidSet = new Set();
    for (const m of tracker.milestones) {
      for (const uid of m.requiredTaskUids) uidSet.add(uid);
      for (const uid of m.optionalTaskUids) uidSet.add(uid);
    }
    tracker.linkedTaskUids = Array.from(uidSet);
    saveGoalTrackers(trackers);
    return { tracker };
  }

  function unlinkTaskFromGoal(goalId, taskUid) {
    if (!goalId || !taskUid) return { error: 'missing-params' };
    const trackers = loadGoalTrackers();
    const tracker = trackers.find((t) => t.id === goalId);
    if (!tracker) return { error: 'not-found' };
    for (const m of tracker.milestones) {
      m.requiredTaskUids = m.requiredTaskUids.filter((u) => u !== taskUid);
      m.optionalTaskUids = m.optionalTaskUids.filter((u) => u !== taskUid);
    }
    tracker.linkedTaskUids = tracker.linkedTaskUids.filter((u) => u !== taskUid);
    saveGoalTrackers(trackers);
    return { tracker };
  }

  // ---- Progress Computation ----

  /**
   * Get resolved task state from canonical taskMap.
   * taskMap: { uid: { done, duration, projectId, text, ... } }
   */
  function resolveLinkedTasks(tracker, taskMap) {
    if (!tracker || !taskMap) return { resolved: [], missing: [] };
    const resolved = [];
    const missing = [];
    for (const uid of tracker.linkedTaskUids) {
      const task = taskMap[uid];
      if (task) {
        resolved.push({ uid, ...task });
      } else {
        missing.push(uid);
      }
    }
    return { resolved, missing };
  }

  /**
   * Compute milestone status deterministically.
   * Returns: { requiredTotal, requiredCompleted, optionalTotal, optionalCompleted, status }
   */
  function computeMilestoneStatus(milestone, taskMap) {
    if (!milestone) return null;
    const reqUids = milestone.requiredTaskUids || [];
    const optUids = milestone.optionalTaskUids || [];
    let requiredCompleted = 0;
    let optionalCompleted = 0;
    let missingRequired = 0;
    for (const uid of reqUids) {
      const task = taskMap && taskMap[uid];
      if (task) {
        if (task.done) requiredCompleted++;
      } else {
        missingRequired++;
      }
    }
    for (const uid of optUids) {
      const task = taskMap && taskMap[uid];
      if (task && task.done) optionalCompleted++;
    }
    const requiredTotal = reqUids.length;
    const optionalTotal = optUids.length;
    let status;
    if (requiredTotal === 0 && optionalTotal === 0) {
      status = 'not-started';
    } else if (requiredCompleted === requiredTotal) {
      status = 'complete';
    } else if (missingRequired > 0) {
      status = 'blocked';
    } else if (requiredCompleted > 0) {
      status = 'in-progress';
    } else {
      status = 'not-started';
    }
    return {
      milestoneId: milestone.id,
      title: milestone.title,
      order: milestone.order,
      requiredTotal,
      requiredCompleted,
      optionalTotal,
      optionalCompleted,
      missingRequired,
      status
    };
  }

  /**
   * Compute goal-level progress (task-count basis).
   */
  function computeGoalProgress(tracker, taskMap, verifiedProgressMap) {
    if (!tracker) return null;
    let requiredTotal = 0;
    let requiredCompleted = 0;
    let optionalTotal = 0;
    let optionalCompleted = 0;
    let totalEstimatedMinutes = 0;
    let totalVerifiedMinutes = 0;
    let effortKnown = true;

    for (const m of tracker.milestones) {
      for (const uid of m.requiredTaskUids) {
        requiredTotal++;
        const task = taskMap && taskMap[uid];
        if (task) {
          if (task.done) requiredCompleted++;
          const est = typeof task.duration === 'number' && task.duration > 0 ? task.duration : null;
          if (est) {
            totalEstimatedMinutes += est;
          } else {
            effortKnown = false;
          }
          const verified = verifiedProgressMap && verifiedProgressMap[uid] ? verifiedProgressMap[uid] : 0;
          totalVerifiedMinutes += Math.min(verified, est || 0);
        }
      }
      for (const uid of m.optionalTaskUids) {
        optionalTotal++;
        const task = taskMap && taskMap[uid];
        if (task && task.done) optionalCompleted++;
      }
    }

    const taskCountBasis = requiredTotal > 0 ? requiredCompleted / requiredTotal : 0;
    const effortBasis = effortKnown && totalEstimatedMinutes > 0
      ? Math.min(totalVerifiedMinutes / totalEstimatedMinutes, 1)
      : null;

    return {
      requiredTotal,
      requiredCompleted,
      optionalTotal,
      optionalCompleted,
      taskCountBasis: Math.round(taskCountBasis * 1000) / 10,
      effortKnown,
      effortBasis: effortBasis !== null ? Math.round(effortBasis * 1000) / 10 : null,
      totalEstimatedMinutes,
      totalVerifiedMinutes,
      remainingMinutes: effortKnown ? Math.max(0, totalEstimatedMinutes - totalVerifiedMinutes) : null
    };
  }

  /**
   * Compute goal health using Phase 6J concepts.
   * availableMinutesBeforeTarget: from Phase 6H/6J capacity engine
   */
  function computeGoalHealth(progress, availableMinutesBeforeTarget, calibratedRemaining) {
    if (!progress) return null;
    const canonicalRemaining = progress.remainingMinutes;
    if (canonicalRemaining === null) {
      return { health: 'unknown', slackMinutes: null, reason: 'insufficient-duration-data' };
    }
    const remaining = canonicalRemaining;
    const slack = availableMinutesBeforeTarget !== null
      ? availableMinutesBeforeTarget - remaining
      : null;
    let health;
    if (slack === null) {
      health = 'unknown';
    } else if (slack < 0) {
      health = 'insufficient-capacity';
    } else if (slack < remaining * 0.15) {
      health = 'at-risk';
    } else if (slack < remaining * 0.30) {
      health = 'watch';
    } else {
      health = 'healthy';
    }
    return {
      health,
      canonicalRemainingMinutes: remaining,
      calibratedRemainingMinutes: calibratedRemaining || remaining,
      availableMinutesBeforeTarget: availableMinutesBeforeTarget,
      slackMinutes: slack,
      atRiskTasks: progress.requiredTotal - progress.requiredCompleted,
      overdue: false // computed externally if needed
    };
  }

  /**
   * Full goal summary combining progress + milestones + health.
   */
  function computeGoalSummary(tracker, taskMap, verifiedProgressMap, availableMinutesBeforeTarget, calibratedRemaining) {
    if (!tracker) return null;
    const { resolved, missing } = resolveLinkedTasks(tracker, taskMap);
    const progress = computeGoalProgress(tracker, taskMap, verifiedProgressMap);
    const milestones = tracker.milestones.map((m) => computeMilestoneStatus(m, taskMap)).filter(Boolean);
    const health = computeGoalHealth(progress, availableMinutesBeforeTarget, calibratedRemaining);
    return {
      goalId: tracker.id,
      title: tracker.title,
      targetDate: tracker.targetDate,
      status: tracker.status,
      progress,
      milestones,
      health,
      missingTaskUids: missing,
      linkedTaskCount: tracker.linkedTaskUids.length
    };
  }

  // ---- Missing Task Handling ----

  function findMissingTasks(tracker, taskMap) {
    if (!tracker) return [];
    return tracker.linkedTaskUids.filter((uid) => !taskMap || !taskMap[uid]);
  }

  // ---- Next Action ----

  function findNextAction(tracker, taskMap) {
    if (!tracker || !taskMap) return null;
    // Find first incomplete required task that is unblocked (no incomplete dependency)
    for (const m of tracker.milestones.sort((a, b) => (a.order || 0) - (b.order || 0))) {
      for (const uid of m.requiredTaskUids) {
        const task = taskMap[uid];
        if (!task || task.done) continue;
        return { uid, text: task.text || '', milestoneTitle: m.title, milestoneId: m.id };
      }
    }
    return null;
  }

  // ---- Explainability ----

  function explainGoalHealth(summary) {
    if (!summary || !summary.health) return { lines: ['Không có dữ liệu sức khỏe mục tiêu.'] };
    const lines = [];
    const h = summary.health;
    if (h.health === 'unknown') {
      lines.push('Không đủ dữ liệu thời lượng để tính tiến độ.');
    } else {
      lines.push('Còn khoảng ' + h.canonicalRemainingMinutes + ' phút công việc bắt buộc.');
      if (h.availableMinutesBeforeTarget !== null) {
        lines.push(h.availableMinutesBeforeTarget + ' phút thời gian khả dụng trước mục tiêu.');
      }
      if (h.slackMinutes !== null) {
        if (h.slackMinutes >= 0) {
          lines.push('Dự phòng: ~' + h.slackMinutes + ' phút.');
        } else {
          lines.push('Thiếu hụt: ~' + Math.abs(h.slackMinutes) + ' phút.');
        }
      }
    }
    return { lines };
  }

  // ---- Intent Router ----

  function classifyGoalTrackingIntent(message) {
    if (!message || typeof message !== 'string') return null;
    var s = message.trim().toLowerCase();

    // Goal status
    if (/(?:tiến độ|mục tiêu|goal).*(?:thế nào|how|progress|status)/.test(s))
      return { kind: 'goal-status', confidence: 'high', reason: 'goal-status' };
    if (/(?:tôi làm đến đâu|làm đến đâu|đã làm)/.test(s))
      return { kind: 'goal-status', confidence: 'high', reason: 'progress-check' };

    // Goal progress
    if (/(?:bao nhiêu|mấy).*(?:task|việc).*(?:hoàn thành|xong|done)/.test(s))
      return { kind: 'goal-progress', confidence: 'high', reason: 'task-count' };

    // Milestone status
    if (/milestone.*(?:đang|is).*(?:chậm|blocked|delayed)/.test(s))
      return { kind: 'milestone-status', confidence: 'high', reason: 'milestone-blocked' };

    // Goal health
    if (/(?:còn kịp|kịp|đúng hạn|on track|trễ|late|risk|nguy cơ)/.test(s))
      return { kind: 'goal-health', confidence: 'high', reason: 'goal-health' };

    // Course correction
    if (/(?:điều chỉnh|sửa|adjust|giảm scope|reduce|thay đổi|change).*(?:roadmap|mục tiêu|goal)/.test(s))
      return { kind: 'goal-course-correct', confidence: 'high', reason: 'course-correct' };

    // Link task
    if (/(?:thêm|add|link).*(?:task|milestone)/.test(s))
      return { kind: 'goal-link-task', confidence: 'medium', reason: 'link-task' };

    // Complete goal
    if (/(?:hoàn thành|xong|complete|done).*(?:mục tiêu|goal)/.test(s))
      return { kind: 'goal-complete', confidence: 'high', reason: 'complete-goal' };

    return null;
  }

  // ---- Return API ----

  return {
    GOAL_TRACKING_VERSION,
    GOAL_TRACKING_KEY,
    MAX_ACTIVE_GOALS,

    loadGoalTrackers,
    saveGoalTrackers,
    createGoalTracker,
    deleteGoalTracker,
    markGoalComplete,
    markGoalActive,

    linkTaskToGoal,
    unlinkTaskFromGoal,

    resolveLinkedTasks,
    computeMilestoneStatus,
    computeGoalProgress,
    computeGoalHealth,
    computeGoalSummary,

    findMissingTasks,
    findNextAction,
    explainGoalHealth,

    classifyGoalTrackingIntent
  };
});
