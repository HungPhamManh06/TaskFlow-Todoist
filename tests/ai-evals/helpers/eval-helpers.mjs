/**
 * Phase 6R — Evaluation Helpers
 *
 * Shared utilities for AI contract, safety, and adversarial evaluation tests.
 * All helpers are deterministic — no real API calls.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/* ─── Load server modules ─── */
const ROOT = process.cwd();
const ai = require(require('path').join(ROOT, 'server', 'ai.js'));
const aiProvider = require(require('path').join(ROOT, 'server', 'ai-provider.js'));

const {
  validateProposal,
  sanitizeContext,
  buildPrompt,
  parseProposalContent,
  validateAgentProposal,
  validateFileAgentProposal,
  validActionId,
  validateTaskRef,
  buildAgentDependencyGraph,
  AGENT_ACTION_TYPES,
  AGENT_ACTION_FIELDS,
  AGENT_CHANGE_FIELDS,
  AGENT_MAX_ACTIONS,
  AGENT_MAX_TEXT,
  AGENT_ALL_FIELDS,
  ENTITY_PRODUCERS,
  FILE_AGENT_ACTION_TYPES,
  chatHasForbidden,
  CHAT_VALID_SCOPES,
  MAX_CHAT_CONTEXT_BYTES,
  CHAT_FORBIDDEN_KEYS,
} = ai;

const { callAiText, callAiJson, getConfig } = aiProvider;

/* ─── Context builders ─── */

/**
 * Build a standard plan_day context from task arrays.
 */
export function buildPlanContext(tasks, opts = {}) {
  return {
    kind: opts.kind || 'plan_day',
    lang: opts.lang || 'vi',
    today: opts.today || '2026-08-21',
    weekStart: opts.weekStart || '',
    weekEnd: opts.weekEnd || '',
    tasks: tasks || [],
    projects: opts.projects || [],
    milestones: opts.milestones || [],
    overdue: opts.overdue || [],
    busy: opts.busy || [],
    timeblocks: opts.timeblocks || [],
    userText: opts.userText || '',
    selectedProjectId: opts.selectedProjectId || null,
    selectedMilestoneId: opts.selectedMilestoneId || null,
  };
}

/**
 * Build an agent context with taskUids, projectIds, milestoneIds.
 */
export function buildAgentContext(tasks, opts = {}) {
  const taskUids = new Set(tasks.map(t => t.uid).filter(Boolean));
  const projectIds = new Set((opts.projects || []).map(p => p.id).filter(Boolean));
  const milestoneIds = new Set((opts.milestones || []).map(m => m.id).filter(Boolean));
  return { taskUids, projectIds, milestoneIds };
}

/**
 * Sanitize a raw context and return the cleaned context.
 */
export function sanitize(raw) {
  return sanitizeContext(raw);
}

/* ─── Validation wrappers ─── */

/**
 * Validate a plan proposal against refs.
 */
export function checkPlanProposal(proposal, taskUids) {
  const refs = { taskUids: new Set(taskUids), projectIds: new Set(), milestoneIds: new Set() };
  return validateProposal(proposal, refs);
}

/**
 * Validate an agent proposal against refs.
 */
export function checkAgentProposal(proposal, taskUids, opts = {}) {
  const refs = {
    taskUids: new Set(taskUids),
    projectIds: new Set(opts.projectIds || []),
    milestoneIds: new Set(opts.milestoneIds || []),
  };
  return validateAgentProposal(proposal, refs);
}

/**
 * Validate a file agent proposal against refs.
 */
export function checkFileAgentProposal(proposal, taskUids, opts = {}) {
  const refs = {
    taskUids: new Set(taskUids),
    projectIds: new Set(opts.projectIds || []),
    milestoneIds: new Set(opts.milestoneIds || []),
  };
  return validateFileAgentProposal(proposal, refs);
}

/* ─── Mock fetch factory ─── */

/**
 * Create a mock globalThis.fetch that simulates an AI provider response.
 *
 * @param {object} options
 * @param {number} options.status - HTTP status code (default 200)
 * @param {object|function} options.body - Response body object, or function(request) => object
 * @param {number} options.latencyMs - Simulated latency (default 0)
 * @returns {function} restore function to undo the mock
 */
export function mockFetch(options = {}) {
  const { status = 200, body = {}, latencyMs = 0 } = options;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    if (latencyMs > 0) {
      await new Promise(r => setTimeout(r, latencyMs));
    }

    const responseBody = typeof body === 'function' ? body(init) : body;

    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => responseBody,
      text: async () => JSON.stringify(responseBody),
    };
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

/**
 * Mock fetch that always times out (never resolves).
 */
export function mockFetchTimeout() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => new Promise(() => {}); // never resolves
  return () => { globalThis.fetch = originalFetch; };
}

/**
 * Mock fetch that throws a network error.
 */
export function mockFetchNetworkError(message = 'fetch failed') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError(message); };
  return () => { globalThis.fetch = originalFetch; };
}

/* ─── Response parsers ─── */

/**
 * Build a valid OpenAI-compatible chat completion response body.
 */
export function openaiResponse(content) {
  return {
    choices: [{ message: { content } }],
  };
}

/**
 * Build a provider error response body.
 */
export function providerErrorBody(message = 'error') {
  return { error: { message } };
}

/* ─── Assertion helpers ─── */

/**
 * Assert that a result has ok: false and contains a specific error code.
 */
export function assertRejection(result, expectedErrorFragment) {
  if (result.ok !== false) {
    throw new Error(`Expected rejection but got ok: ${result.ok}`);
  }
  if (expectedErrorFragment) {
    const errors = result.errors || [result.error];
    const found = errors.some(e => typeof e === 'string' && e.includes(expectedErrorFragment));
    if (!found) {
      throw new Error(
        `Expected error containing "${expectedErrorFragment}" but got: ${JSON.stringify(errors)}`
      );
    }
  }
}

/**
 * Assert that a result has ok: true (no rejection).
 */
export function assertAcceptance(result) {
  if (result.ok !== true) {
    throw new Error(`Expected acceptance but got rejection: ${JSON.stringify(result.errors || result.error)}`);
  }
}

/**
 * Assert that a string does NOT contain any of the forbidden substrings.
 */
export function assertNoLeaks(str, forbiddenSubstrings, context = '') {
  for (const forbidden of forbiddenSubstrings) {
    if (typeof str === 'string' && str.includes(forbidden)) {
      throw new Error(`Leak detected${context ? ' in ' + context : ''}: string contains "${forbidden}"`);
    }
  }
}

/* ─── Exports ─── */
export {
  ai,
  aiProvider,
  validateProposal,
  sanitizeContext,
  buildPrompt,
  parseProposalContent,
  validateAgentProposal,
  validateFileAgentProposal,
  validActionId,
  validateTaskRef,
  buildAgentDependencyGraph,
  AGENT_ACTION_TYPES,
  AGENT_ACTION_FIELDS,
  AGENT_CHANGE_FIELDS,
  AGENT_MAX_ACTIONS,
  AGENT_MAX_TEXT,
  AGENT_ALL_FIELDS,
  ENTITY_PRODUCERS,
  FILE_AGENT_ACTION_TYPES,
  chatHasForbidden,
  CHAT_VALID_SCOPES,
  MAX_CHAT_CONTEXT_BYTES,
  CHAT_FORBIDDEN_KEYS,
  callAiText,
  callAiJson,
  getConfig,
};
