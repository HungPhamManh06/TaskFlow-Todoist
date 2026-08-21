// TaskFlow — Focus Session Execution & Verified Progress Capture (Phase 6N).
// Extends existing focus timer (js/focus.js) with:
//   outcome review, pause/resume, active session persistence, session history,
//   verified progress aggregation, remaining work calculation.
// Pure deterministic functions — 0 Gemini calls.
// Deps: global lexical t (i18n), taskFocusLog (TaskFlowFocus).
// Storage keys: taskflow_focus_active_v1, taskflow_focus_history_v1
// Export: createFocusSession, resumeFocusSession, endFocusSession,
//   pauseFocusSession, resumeFocusTimer, abandonFocusSession,
//   confirmOutcome, getVerifiedProgressMinutes, getRemainingWork,
//   calculateRemainingWork, buildFocusOutcomeReview, loadActiveSession,
//   saveActiveSession, clearActiveSession, loadSessionHistory,
//   saveSessionToHistory, getSessionStats, isSessionStale,
//   canCreditMinutes, FOCUS_SESSION_VERSION, FOCUS_STALE_HOURS,
//   FOCUS_HISTORY_MAX, FOCUS_DURATION_MIN, FOCUS_DURATION_MAX
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowFocusSession = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ---- Constants ----
  const FOCUS_SESSION_VERSION = 1;
  const FOCUS_STALE_HOURS = 6;
  const FOCUS_HISTORY_MAX = 500;
  const FOCUS_DURATION_MIN = 5;
  const FOCUS_DURATION_MAX = 240;
  const ACTIVE_KEY = 'taskflow_focus_active_v1';
  const HISTORY_KEY = 'taskflow_focus_history_v1';

  // ---- Session Schema ----
  // {
  //   id: 'fs_<ts>_<rand>',
  //   version: 1,
  //   taskRef: { uid: '...', text: '...' },
  //   planSessionRef: null,
  //   startedAt: <timestamp>,
  //   endedAt: null,
  //   plannedMinutes: 45,
  //   elapsedMinutes: 0,
  //   pausedAt: null,
  //   totalPausedMs: 0,
  //   status: 'active' | 'paused' | 'ended' | 'abandoned' | 'outcome-pending',
  //   outcome: null
  // }

  // ---- Helpers ----

  function generateSessionId() {
    return 'fs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function clampDuration(mins) {
    return Math.max(FOCUS_DURATION_MIN, Math.min(FOCUS_DURATION_MAX, Math.round(mins)));
  }

  function computeElapsedMs(session) {
    if (!session || !session.startedAt) return 0;
    const end = session.endedAt || Date.now();
    const activeEnd = session.status === 'paused' && session.pausedAt ? session.pausedAt : end;
    return Math.max(0, activeEnd - session.startedAt - (session.totalPausedMs || 0));
  }

  function computeElapsedMinutes(session) {
    return Math.round(computeElapsedMs(session) / 60000);
  }

  // ---- Active Session Persistence ----

  function loadActiveSession() {
    try {
      const raw = localStorage.getItem(ACTIVE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || typeof session !== 'object') return null;
      if (session.version !== FOCUS_SESSION_VERSION) return null;
      if (!session.id || !session.taskRef) return null;
      return session;
    } catch (e) {
      return null;
    }
  }

  function saveActiveSession(session) {
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(session));
    } catch (e) { /* quota exceeded — degrade gracefully */ }
  }

  function clearActiveSession() {
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch (e) { /* ignore */ }
  }

  // ---- Session History ----

  function loadSessionHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.sessions)) return [];
      return data.sessions;
    } catch (e) {
      return [];
    }
  }

  function saveSessionToHistory(session) {
    const history = loadSessionHistory();
    history.push(session);
    // Bound: max 500 or 90 days
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    let trimmed = history.filter((s) => (s.endedAt || s.startedAt) >= cutoff);
    if (trimmed.length > FOCUS_HISTORY_MAX) {
      trimmed = trimmed.slice(-FOCUS_HISTORY_MAX);
    }
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify({ sessions: trimmed }));
    } catch (e) { /* degrade */ }
    return trimmed;
  }

  // ---- Stale Detection ----

  function isSessionStale(session, now) {
    if (!session || !session.startedAt) return false;
    const elapsed = (now || Date.now()) - session.startedAt;
    return elapsed > FOCUS_STALE_HOURS * 60 * 60 * 1000;
  }

  // ---- Session Lifecycle ----

  function createFocusSession(taskRef, plannedMinutes, now) {
    if (!taskRef || !taskRef.uid) return { error: 'focus-invalid-task' };
    const mins = clampDuration(plannedMinutes || 25);
    const active = loadActiveSession();
    if (active && active.status !== 'ended' && active.status !== 'abandoned') {
      return { error: 'focus-already-active', activeSession: active };
    }
    const session = {
      id: generateSessionId(),
      version: FOCUS_SESSION_VERSION,
      taskRef: { uid: taskRef.uid, text: taskRef.text || '' },
      planSessionRef: null,
      startedAt: now || Date.now(),
      endedAt: null,
      plannedMinutes: mins,
      elapsedMinutes: 0,
      pausedAt: null,
      totalPausedMs: 0,
      status: 'active',
      outcome: null
    };
    saveActiveSession(session);
    return { session };
  }

  function resumeFocusSession(session, now) {
    if (!session) return { error: 'focus-no-session' };
    if (session.status !== 'ended' && session.status !== 'abandoned' && session.status !== 'outcome-pending') {
      return { error: 'focus-still-active', session };
    }
    if (isSessionStale(session, now)) {
      return { error: 'focus-stale-session', session };
    }
    return createFocusSession(session.taskRef, session.plannedMinutes, now);
  }

  function pauseFocusSession(session, now) {
    if (!session || session.status !== 'active') return { error: 'focus-not-active' };
    session.status = 'paused';
    session.pausedAt = now || Date.now();
    session.elapsedMinutes = computeElapsedMinutes(session);
    saveActiveSession(session);
    return { session };
  }

  function resumeFocusTimer(session, now) {
    if (!session || session.status !== 'paused') return { error: 'focus-not-paused' };
    const pauseDuration = (now || Date.now()) - session.pausedAt;
    session.totalPausedMs = (session.totalPausedMs || 0) + pauseDuration;
    session.pausedAt = null;
    session.status = 'active';
    session.elapsedMinutes = computeElapsedMinutes(session);
    saveActiveSession(session);
    return { session };
  }

  function endFocusSession(session, now) {
    if (!session || (session.status !== 'active' && session.status !== 'paused')) {
      return { error: 'focus-not-running' };
    }
    // If paused, compute total pause before ending
    if (session.status === 'paused' && session.pausedAt) {
      session.totalPausedMs = (session.totalPausedMs || 0) + ((now || Date.now()) - session.pausedAt);
      session.pausedAt = null;
    }
    session.status = 'outcome-pending';
    session.endedAt = now || Date.now();
    session.elapsedMinutes = computeElapsedMinutes(session);
    saveActiveSession(session);
    return { session };
  }

  function abandonFocusSession(session) {
    if (!session) return { error: 'focus-no-session' };
    session.status = 'abandoned';
    session.endedAt = Date.now();
    session.elapsedMinutes = computeElapsedMinutes(session);
    clearActiveSession();
    saveSessionToHistory(session);
    return { session };
  }

  // ---- Outcome Review ----

  function buildFocusOutcomeReview(session) {
    if (!session) return null;
    const elapsed = session.elapsedMinutes || computeElapsedMinutes(session);
    const planned = session.plannedMinutes || 0;
    const overTime = elapsed - planned;
    return {
      sessionId: session.id,
      taskRef: session.taskRef,
      plannedMinutes: planned,
      elapsedMinutes: elapsed,
      overTimeMinutes: overTime > 0 ? overTime : 0,
      options: [
        { type: 'task-completed', label: 'focusOutcomeCompleted', creditedDefault: elapsed },
        { type: 'progress', label: 'focusOutcomeProgress', creditedDefault: elapsed },
        { type: 'no-progress', label: 'focusOutcomeNoProgress', creditedDefault: 0 }
      ]
    };
  }

  function canCreditMinutes(creditedMinutes, elapsedMinutes) {
    if (typeof creditedMinutes !== 'number' || creditedMinutes < 0) return false;
    if (typeof elapsedMinutes !== 'number' || elapsedMinutes < 0) return false;
    return creditedMinutes <= elapsedMinutes;
  }

  function confirmOutcome(session, outcome) {
    if (!session || session.status !== 'outcome-pending') return { error: 'focus-not-pending' };
    if (!outcome || typeof outcome.type !== 'string') return { error: 'focus-invalid-outcome' };
    const validTypes = ['task-completed', 'progress', 'no-progress'];
    if (!validTypes.includes(outcome.type)) return { error: 'focus-invalid-outcome' };

    const elapsed = session.elapsedMinutes || computeElapsedMinutes(session);
    let creditedMinutes = Math.round(outcome.creditedMinutes);
    if (typeof creditedMinutes !== 'number' || isNaN(creditedMinutes)) creditedMinutes = 0;
    // Clamp: 0 <= credited <= elapsed
    creditedMinutes = Math.max(0, Math.min(elapsed, creditedMinutes));

    if (outcome.type === 'no-progress') creditedMinutes = 0;

    session.outcome = {
      type: outcome.type,
      creditedMinutes,
      userConfirmed: true
    };
    session.status = 'ended';
    session.elapsedMinutes = elapsed;
    clearActiveSession();
    saveSessionToHistory(session);
    return { session };
  }

  // ---- Verified Progress Aggregation ----

  /**
   * Sum verified creditedMinutes from session history for a given task uid.
   * Only counts: outcome.userConfirmed === true AND type in [progress, task-completed]
   * AND creditedMinutes > 0.
   */
  function getVerifiedProgressMinutes(taskUid, history) {
    if (!taskUid) return 0;
    const sessions = history || loadSessionHistory();
    let total = 0;
    for (const s of sessions) {
      if (!s || !s.taskRef || s.taskRef.uid !== taskUid) continue;
      if (!s.outcome || !s.outcome.userConfirmed) continue;
      if (s.outcome.type !== 'progress' && s.outcome.type !== 'task-completed') continue;
      if (typeof s.outcome.creditedMinutes !== 'number') continue;
      total += Math.max(0, s.outcome.creditedMinutes);
    }
    return total;
  }

  // ---- Remaining Work Calculation ----

  /**
   * Calculate remaining work for a task given its estimated duration and verified progress.
   * estimatedMinutes: task.duration or task.estimatedMinutes (minutes)
   * verifiedProgressMinutes: from getVerifiedProgressMinutes()
   * Returns: { remainingMinutes, overrun, estimateUsed }
   */
  function calculateRemainingWork(estimatedMinutes, verifiedProgressMinutes) {
    const estimate = typeof estimatedMinutes === 'number' && estimatedMinutes > 0
      ? Math.round(estimatedMinutes) : null;
    const progress = Math.max(0, Math.round(verifiedProgressMinutes || 0));

    if (estimate === null) {
      return { remainingMinutes: null, overrun: false, estimateUsed: null };
    }
    const remaining = Math.max(0, estimate - progress);
    return {
      remainingMinutes: remaining,
      overrun: estimate > 0 && progress > estimate,
      estimateUsed: estimate
    };
  }

  /**
   * Convenience: get remaining work for a task by looking up verified progress.
   * task: { uid, duration, estimatedMinutes }
   */
  function getRemainingWork(task) {
    if (!task) return { remainingMinutes: null, overrun: false, estimateUsed: null };
    const uid = task.uid;
    const estimate = typeof task.duration === 'number' && task.duration > 0
      ? task.duration
      : (typeof task.estimatedMinutes === 'number' && task.estimatedMinutes > 0 ? task.estimatedMinutes : null);
    const progress = uid ? getVerifiedProgressMinutes(uid) : 0;
    return calculateRemainingWork(estimate, progress);
  }

  // ---- Session Stats ----

  function getSessionStats(history) {
    const sessions = history || loadSessionHistory();
    const valid = sessions.filter((s) => s && s.outcome && s.outcome.userConfirmed);
    const totalMinutes = valid.reduce((sum, s) => sum + (s.outcome.creditedMinutes || 0), 0);
    const completedTasks = valid.filter((s) => s.outcome.type === 'task-completed').length;
    return {
      totalSessions: valid.length,
      totalMinutes,
      completedTasks,
      byType: {
        'task-completed': valid.filter((s) => s.outcome.type === 'task-completed').length,
        'progress': valid.filter((s) => s.outcome.type === 'progress').length,
        'no-progress': valid.filter((s) => s.outcome.type === 'no-progress').length
      }
    };
  }

  // ---- Focus Intent Router (Deterministic) ----

  function classifyFocusIntent(message) {
    if (!message || typeof message !== 'string') return { kind: 'clarify' };
    const m = message.trim().toLowerCase();

    // Start focus
    if (/^(bắt đầu|start)\s+(focus|tập trung|phiên)/.test(m)) return { kind: 'start-focus' };
    if (/(tập trung|focus)\s+(task|việc|assignment|database)/.test(m)) return { kind: 'start-focus' };
    if (/^\s*(học|làm)\s+/.test(m) && /\d+\s*(phút|p|min)/.test(m)) return { kind: 'start-focus' };

    // Pause
    if (/^(tạm dừng|pause|dừng)\s*(lại)?$/.test(m)) return { kind: 'pause-focus' };

    // Resume
    if (/^(tiếp tục|resume|tiếp)\s*(lại)?$/.test(m)) return { kind: 'resume-focus' };

    // End
    if (/^(kết thúc|end|dừng|xong|stop)\s*(phiên|focus)?/.test(m)) return { kind: 'end-focus' };

    // Progress report
    if (/tôi\s+(làm được|đã làm|focus được|được)\s+\d+/.test(m)) return { kind: 'progress-report' };
    if (/\d+\s*(phút|p|min)\s*(tiến độ|progress|thực sự)/.test(m)) return { kind: 'progress-report' };

    return { kind: 'focus-question' };
  }

  // ---- Return API ----

  return {
    // Constants
    FOCUS_SESSION_VERSION,
    FOCUS_STALE_HOURS,
    FOCUS_HISTORY_MAX,
    FOCUS_DURATION_MIN,
    FOCUS_DURATION_MAX,
    ACTIVE_KEY,
    HISTORY_KEY,

    // Active session persistence
    loadActiveSession,
    saveActiveSession,
    clearActiveSession,

    // Session history
    loadSessionHistory,
    saveSessionToHistory,

    // Session lifecycle
    createFocusSession,
    resumeFocusSession,
    pauseFocusSession,
    resumeFocusTimer,
    endFocusSession,
    abandonFocusSession,

    // Outcome review
    buildFocusOutcomeReview,
    confirmOutcome,
    canCreditMinutes,

    // Progress aggregation
    getVerifiedProgressMinutes,
    calculateRemainingWork,
    getRemainingWork,

    // Stats
    getSessionStats,
    isSessionStale,

    // Internal helpers (for testing)
    computeElapsedMinutes,
    generateSessionId,
    clampDuration,

    // Focus intent router
    classifyFocusIntent
  };
});
