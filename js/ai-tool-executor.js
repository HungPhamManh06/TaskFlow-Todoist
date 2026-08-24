// TaskFlow — Tool Executor (AI Brain Phase 2).
// Executes tools selected by Gemini with safety enforcement.
// Read tools run automatically. Mutation proposals go to Review.
// Never allows direct state mutation.
'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAIToolExecutor = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {

  /* ---- i18n helper ---- */
  function _t(key, vars) {
    try {
      if (window.TaskFlowI18N && window.TaskFlowI18N.t) return window.TaskFlowI18N.t(key, vars);
    } catch (e) { /* */ }
    return key;
  }

  /* ---- Execute a single tool ---- */
  async function executeTool(toolName, args, opts) {
    opts = opts || {};
    var tools = window.TaskFlowAITools;
    if (!tools) return { ok: false, code: 'tool-registry-not-loaded' };

    var tool = tools.getTool(toolName);
    if (!tool) return { ok: false, code: 'unknown-tool', tool: toolName };

    // Validate args
    var validation = tools.validateArgs(toolName, args);
    if (!validation.ok) return { ok: false, code: 'invalid-args', errors: validation.errors };

    // Execute with timeout
    var timeoutMs = opts.timeoutMs || (tools.AGENT_STEP_TIMEOUT_MS || 30000);
    var signal = opts.signal || undefined;

    try {
      var result = await Promise.race([
        Promise.resolve().then(function () { return tool.execute(args || {}); }),
        new Promise(function (_, reject) {
          setTimeout(function () { reject({ code: 'tool-timeout', tool: toolName }); }, timeoutMs);
        }),
      ]);
      return { ok: true, tool: toolName, safety: tool.safety, result: result };
    } catch (e) {
      if (e && e.code === 'tool-timeout') return e;
      return { ok: false, code: 'tool-error', tool: toolName, error: e };
    }
  }

  /* ---- Execute tool result → handle mutation proposals ---- */
  function handleToolResult(toolResult, msgs) {
    if (!toolResult || !toolResult.ok) return toolResult;

    var result = toolResult.result;
    if (!result) return toolResult;

    // If result contains a proposal, send to Review
    if (result.ok && result.proposal) {
      var runtime = window.TaskFlowAIAgentRuntime;
      if (runtime && typeof runtime.handleExternalProposal === 'function') {
        var reviewResult = runtime.handleExternalProposal(result.proposal, {
          source: 'ai-tool:' + toolResult.tool,
          fileName: '',
        });
        return { ok: true, tool: toolResult.tool, review: reviewResult };
      }
    }

    return toolResult;
  }

  /* ---- Execute multiple tools in sequence (for agent loop) ---- */
  async function executeToolSequence(toolCalls, opts) {
    opts = opts || {};
    var results = [];
    var maxSteps = opts.maxSteps || 5;

    for (var i = 0; i < Math.min(toolCalls.length, maxSteps); i++) {
      var call = toolCalls[i];
      if (!call || !call.tool) continue;

      var result = await executeTool(call.tool, call.args, opts);
      results.push(result);

      // Stop if tool failed
      if (!result.ok) break;

      // If tool returned a proposal, send to Review and stop
      if (result.result && result.result.proposal) {
        handleToolResult(result, opts.msgs);
        break;
      }
    }

    return results;
  }

  /* ---- Collect context from required read tools ---- */
  async function collectContext(toolNames, opts) {
    opts = opts || {};
    var tools = window.TaskFlowAITools;
    if (!tools) return {};
    var context = {};

    for (var i = 0; i < toolNames.length; i++) {
      var toolName = toolNames[i];
      if (!tools.isReadTool(toolName)) continue;
      var result = await executeTool(toolName, {}, opts);
      if (result.ok && result.result) {
        context[toolName] = result.result;
      }
    }

    return context;
  }

  /* ---- Public API ---- */
  return {
    executeTool: executeTool,
    handleToolResult: handleToolResult,
    executeToolSequence: executeToolSequence,
    collectContext: collectContext,
  };
});
