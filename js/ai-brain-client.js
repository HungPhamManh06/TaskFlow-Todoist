// TaskFlow — AI Brain Client Orchestrator (Phase 4).
// Bridges chat.js → /api/ai/brain → client tool execution → /api/ai/brain/continue
// Manages multi-step loop, abort, error mapping, and proposal handoff.
'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAIBrainClient = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {

  /* ---- Constants ---- */
  var MAX_STEPS = 8;
  var STEP_TIMEOUT_MS = 30000;

  /* ---- i18n ---- */
  function _t(key, vars) {
    try {
      if (window.TaskFlowI18N && window.TaskFlowI18N.t) return window.TaskFlowI18N.t(key, vars);
    } catch (e) { /* */ }
    return key;
  }

  /* ---- API base ---- */
  function _getApiBase() {
    try {
      if (typeof API_CONFIG !== 'undefined' && API_CONFIG && typeof API_CONFIG.url === 'string') {
        return API_CONFIG.url.replace(/\/+$/, '');
      }
    } catch (e) { /* */ }
    return '';
  }

  function _getToken() {
    try { return localStorage.getItem('planner-token'); } catch (e) { return null; }
  }

  /* ---- Error messages ---- */
  var ERROR_MESSAGES = {
    'brain-session-not-found': 'Phiên AI đã hết hạn. Vui lòng thử lại.',
    'brain-session-expired': 'Phiên AI đã hết hạn. Vui lòng thử lại.',
    'brain-invalid-state': 'Trạng thái AI không hợp lệ.',
    'brain-tool-invalid': 'Công cụ AI không hợp lệ.',
    'brain-tool-result-invalid': 'Kết quả công cụ AI không hợp lệ.',
    'brain-max-steps': 'AI đã thực hiện quá nhiều bước. Vui lòng thử lại với yêu cầu đơn giản hơn.',
    'brain-timeout': 'Yêu cầu AI quá lâu. Vui lòng thử lại.',
    'brain-provider-error': 'Dịch vụ AI tạm thời không khả dụng.',
    'brain-client-tool-failed': 'Thực thi công cụ thất bại.',
    'unknown-tool': 'Công cụ AI không được hỗ trợ.',
    'invalid-tool-args': 'Tham số công cụ AI không hợp lệ.',
    'ai-not-configured': 'AI chưa được cấu hình.',
    'ai-agent-busy': 'Đang có yêu cầu AI khác. Vui lòng chờ.',
  };

  function _friendlyError(code) {
    return ERROR_MESSAGES[code] || 'Đã xảy ra lỗi. Vui lòng thử lại.';
  }

  /* ---- Main entry: handle a message through AI Brain ---- */
  async function handleMessage(text, opts) {
    opts = opts || {};
    var signal = opts.signal || undefined;
    var apiBase = _getApiBase();
    if (!apiBase) return { ok: false, code: 'api-config-missing' };

    var token = _getToken();
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    // Step 1: Initial call
    var startTime = Date.now();
    var initBody = {
      message: text,
      history: opts.history || [],
    };

    var initResp;
    try {
      initResp = await fetch(apiBase + '/api/ai/brain', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(initBody),
        signal: signal,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, code: 'aborted' };
      return { ok: false, code: 'network-error' };
    }

    var initJson;
    try { initJson = await initResp.json(); } catch (e) { initJson = null; }

    if (!initResp.ok || !initJson || !initJson.ok) {
      var errCode = (initJson && initJson.error) || 'brain-provider-error';
      return { ok: false, code: errCode, friendlyMessage: _friendlyError(errCode) };
    }

    // Multi-step loop
    var sessionId = initJson.brainSessionId;
    var currentResult = initJson;

    for (var step = 0; step < MAX_STEPS; step++) {
      // Final answer
      if (currentResult.type === 'final') {
        return {
          ok: true,
          type: 'final',
          answer: currentResult.answer || '',
          brainSessionId: sessionId,
          toolTrace: currentResult.toolTrace || [],
          latencyMs: Date.now() - startTime,
        };
      }

      // Proposal from tool
      if (currentResult.type === 'proposal') {
        return {
          ok: true,
          type: 'proposal',
          proposal: currentResult.proposal,
          brainSessionId: sessionId,
          toolTrace: currentResult.toolTrace || [],
          latencyMs: Date.now() - startTime,
        };
      }

      // Tool request — execute client-side
      if (currentResult.type === 'tool_request' && currentResult.toolCall) {
        var toolCall = currentResult.toolCall;
        var toolName = toolCall.tool;
        var toolArgs = toolCall.args || {};
        var toolCallId = toolCall.id;

        // Execute tool via Tool Executor
        var execResult = await _executeClientTool(toolName, toolArgs);

        // Send result back to brain
        var continueBody = {
          brainSessionId: sessionId,
          toolCallId: toolCallId,
          result: execResult,
        };

        var contResp;
        try {
          contResp = await fetch(apiBase + '/api/ai/brain/continue', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(continueBody),
            signal: signal,
          });
        } catch (e) {
          if (e && e.name === 'AbortError') return { ok: false, code: 'aborted' };
          return { ok: false, code: 'network-error' };
        }

        var contJson;
        try { contJson = await contResp.json(); } catch (e) { contJson = null; }

        if (!contResp.ok || !contJson || !contJson.ok) {
          var contErrCode = (contJson && contJson.error) || 'brain-provider-error';
          return { ok: false, code: contErrCode, friendlyMessage: _friendlyError(contErrCode) };
        }

        currentResult = contJson;
        sessionId = contJson.brainSessionId || sessionId;
        continue;
      }

      // Unknown response type
      return { ok: false, code: 'brain-invalid-state' };
    }

    return { ok: false, code: 'brain-max-steps', friendlyMessage: _friendlyError('brain-max-steps') };
  }

  /* ---- Execute a client-side tool ---- */
  async function _executeClientTool(toolName, args) {
    var executor = window.TaskFlowAIToolExecutor;
    if (!executor || typeof executor.executeTool !== 'function') {
      return { ok: false, code: 'executor-not-loaded' };
    }

    var result = await executor.executeTool(toolName, args, { timeoutMs: STEP_TIMEOUT_MS });
    if (!result || !result.ok) {
      return { ok: false, code: result && result.code ? result.code : 'tool-execution-failed' };
    }

    // Sanitize result before sending to server
    var sanitized = _sanitizeToolResult(toolName, result.result);
    return sanitized;
  }

  /* ---- Sanitize tool results — strip internal fields ---- */
  function _sanitizeToolResult(toolName, result) {
    if (!result || typeof result !== 'object') return result;

    switch (toolName) {
      case 'get_tasks':
        return _sanitizeTasks(result);
      case 'get_projects':
        return _sanitizeProjects(result);
      case 'get_active_roadmap':
        return _sanitizeRoadmap(result);
      case 'get_plan_progress':
        return result; // already safe
      case 'get_free_time':
        return _sanitizeFreeTime(result);
      case 'generate_daily_plan':
        return result; // proposal — pass through
      default:
        return result;
    }
  }

  function _sanitizeTasks(result) {
    var tasks = Array.isArray(result.tasks) ? result.tasks : [];
    var sanitized = tasks.slice(0, 60).map(function (t) {
      return {
        uid: typeof t.uid === 'string' ? t.uid.slice(0, 128) : '',
        text: typeof t.text === 'string' ? t.text.slice(0, 300) : '',
        done: !!t.done,
        deadline: typeof t.deadline === 'string' ? t.deadline : null,
        scheduledDate: typeof t.scheduledDate === 'string' ? t.scheduledDate : null,
        duration: typeof t.duration === 'number' && Number.isFinite(t.duration) ? t.duration : null,
      };
    });
    return { tasks: sanitized, total: typeof result.total === 'number' ? result.total : sanitized.length };
  }

  function _sanitizeProjects(result) {
    var projects = Array.isArray(result.projects) ? result.projects : [];
    return {
      projects: projects.slice(0, 20).map(function (p) {
        return {
          id: p.id || '',
          title: typeof p.title === 'string' ? p.title.slice(0, 200) : '',
          status: p.status || null,
          milestones: Array.isArray(p.milestones) ? p.milestones.slice(0, 20).map(function (m) {
            return { id: m.id || '', title: typeof m.title === 'string' ? m.title.slice(0, 200) : '' };
          }) : [],
        };
      }),
    };
  }

  function _sanitizeRoadmap(result) {
    if (!result.roadmap) return { roadmap: null };
    // Only pass compact roadmap data, not raw text
    var rm = result.roadmap;
    return {
      roadmap: {
        title: typeof rm.title === 'string' ? rm.title.slice(0, 200) : '',
        summary: typeof rm.summary === 'string' ? rm.summary.slice(0, 500) : '',
        totalWeeks: rm.totalWeeks || 0,
        phases: Array.isArray(rm.phases) ? rm.phases.slice(0, 10).map(function (p) {
          return {
            id: p.id || '',
            title: typeof p.title === 'string' ? p.title.slice(0, 200) : '',
            weeks: Array.isArray(p.weeks) ? p.weeks.slice(0, 5).map(function (w) {
              return {
                week: w.week || 0,
                title: typeof w.title === 'string' ? w.title.slice(0, 200) : '',
                goals: Array.isArray(w.goals) ? w.goals.slice(0, 5) : [],
              };
            }) : [],
          };
        }) : [],
      },
      cursor: result.cursor || null,
      documentName: typeof result.documentName === 'string' ? result.documentName.slice(0, 100) : '',
    };
  }

  function _sanitizeFreeTime(result) {
    var busy = Array.isArray(result.busy) ? result.busy.slice(0, 100) : [];
    return {
      busy: busy.map(function (b) {
        return {
          date: typeof b.date === 'string' ? b.date : '',
          startMs: typeof b.startMs === 'number' ? b.startMs : 0,
          endMs: typeof b.endMs === 'number' ? b.endMs : 0,
          source: b.source === 'taskflow' ? 'taskflow' : 'gcal',
        };
      }),
      startDate: typeof result.startDate === 'string' ? result.startDate : '',
      daysCount: typeof result.daysCount === 'number' ? result.daysCount : 0,
    };
  }

  /* ---- Public API ---- */
  return {
    handleMessage: handleMessage,
    _executeClientTool: _executeClientTool,
    _sanitizeToolResult: _sanitizeToolResult,
    _friendlyError: _friendlyError,
    MAX_STEPS: MAX_STEPS,
  };
});
