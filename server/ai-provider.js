/* server/ai-provider.js — Unified AI Provider Gateway (Phase 6Q).
   ---------------------------------------------------------------
   Centralizes all outbound LLM transport for TaskFlow AI routes.
   This module knows NOTHING about TaskFlow business logic — it only:
     - reads provider config from env
     - calls AI_API_URL with AI_API_KEY
     - handles AbortController timeout
     - normalizes provider errors to safe category codes
     - parses response JSON
     - records safe latency metadata

   Routes use: callAiText(options) or callAiJson(options)
   Both return: { ok, content, latencyMs, status, error, details }

   SECURITY:
   - API keys NEVER appear in logs, responses, or exception details
   - Provider raw error bodies are NEVER returned to clients
   - Only safe metadata is logged: route, provider, model, status, latencyMs
--------------------------------------------------------------- */
'use strict';

const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Read provider configuration from environment.
 * Called dynamically so values reflect runtime env changes (testability).
 */
function getConfig() {
  return {
    apiKey: process.env.AI_API_KEY || '',
    apiUrl: process.env.AI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: process.env.AI_MODEL || 'gemini-3.6-flash',
    timeoutMs: validateTimeout(process.env.AI_TIMEOUT_MS),
  };
}

/**
 * Validate and normalize a timeout value.
 * Returns a safe positive integer, falling back to DEFAULT_TIMEOUT_MS.
 */
function validateTimeout(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.floor(n);
}

/**
 * Derive a safe provider label from the configured API URL.
 * Never exposes the full URL (may contain sensitive paths).
 * Returns 'gemini' for Google endpoints, 'openai-compat' otherwise.
 */
function deriveProviderLabel(apiUrl) {
  if (!apiUrl) return 'unknown';
  if (apiUrl.includes('generativelanguage.googleapis.com')) return 'gemini';
  return 'openai-compat';
}

/**
 * Map upstream HTTP status to safe normalized error category.
 * Never exposes provider body — only the status-derived category.
 */
function mapUpstreamStatus(status) {
  if (status === 400) return 'ai-provider-bad-request';
  if (status === 401) return 'ai-provider-auth';
  if (status === 403) return 'ai-provider-forbidden';
  if (status === 404) return 'ai-provider-not-found';
  if (status === 429) return 'ai-rate-limited';
  return 'ai-provider-unavailable';
}

/**
 * Safe log — only metadata, never content/prompts/keys.
 */
function logSafe(parts) {
  console.log('[ai-provider] ' + parts);
}

/**
 * Core provider call. Sends messages to the AI endpoint and returns
 * the raw content string or an error object.
 *
 * @param {Object} options
 * @param {Array}   options.messages     - [{role, content}] message array
 * @param {Object}  [options.schema]     - JSON Schema for structured output (json mode)
 * @param {number}  [options.maxTokens]  - max output tokens (default 2048)
 * @param {number}  [options.timeoutMs]  - per-call timeout override (optional; default from config)
 * @param {string}  [options.requestId]  - correlation ID for logging
 * @param {string}  [options.routeName]  - route name for logging
 * @param {string}  [options.model]      - model override
 * @returns {{ ok: boolean, content: string|null, latencyMs: number, status: number, error: string|null, details: string[]|null }}
 */
async function callAiCore(options) {
  const {
    messages,
    schema = null,
    maxTokens = 2048,
    timeoutMs: explicitTimeout,
    requestId = '',
    routeName = '',
    model: modelOverride,
  } = options;

  const cfg = getConfig();
  if (!cfg.apiKey) {
    return { ok: false, content: null, latencyMs: 0, status: 503, error: 'ai-not-configured', details: null };
  }

  const model = modelOverride || cfg.model;
  const effectiveTimeout = (Number.isFinite(explicitTimeout) && explicitTimeout > 0)
    ? Math.floor(explicitTimeout)
    : cfg.timeoutMs;
  const provider = deriveProviderLabel(cfg.apiUrl);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);

  const logPrefix = (routeName ? 'route=' + routeName : 'route=unknown')
    + (requestId ? ' requestId=' + requestId : '');

  // Build request body
  const body = {
    model,
    max_tokens: maxTokens,
    messages,
  };

  // Structured JSON output via response_format
  if (schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'taskflow_response',
        strict: true,
        schema,
      },
    };
  }

  let upstream;
  try {
    upstream = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const latencyMs = Date.now() - startedAt;
    if (e && e.name === 'AbortError') {
      logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=timeout latencyMs=' + latencyMs);
      return { ok: false, content: null, latencyMs, status: 504, error: 'ai-timeout', details: null };
    }
    logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=upstream-error latencyMs=' + latencyMs);
    return { ok: false, content: null, latencyMs, status: 502, error: 'ai-provider-unavailable', details: null };
  }

  clearTimeout(timer);
  const latencyMs = Date.now() - startedAt;

  // Map upstream errors — NEVER expose provider body
  if (!upstream.ok) {
    const code = mapUpstreamStatus(upstream.status);
    logSafe(logPrefix + ' provider=' + provider + ' upstreamStatus=' + upstream.status + ' latencyMs=' + latencyMs);
    return {
      ok: false,
      content: null,
      latencyMs,
      status: upstream.status === 429 ? 429 : 502,
      error: code,
      details: ['upstream-' + upstream.status],
    };
  }

  // Parse response JSON
  let json;
  try {
    json = await upstream.json();
  } catch (_e) {
    logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=json-parse-error latencyMs=' + latencyMs);
    return { ok: false, content: null, latencyMs, status: 502, error: 'ai-provider-unavailable', details: null };
  }

  // Extract content from OpenAI-compatible response
  const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (typeof content !== 'string' || !content.trim()) {
    logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=empty-content latencyMs=' + latencyMs);
    return { ok: false, content: null, latencyMs, status: 422, error: 'ai-invalid-response', details: ['empty-content'] };
  }

  logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=success latencyMs=' + latencyMs);
  return { ok: true, content: content.trim(), latencyMs, status: 200, error: null, details: null };
}

/**
 * Call AI and return raw text content.
 * Returns: { ok, content, latencyMs, status, error, details }
 */
async function callAiText(options) {
  return callAiCore({ ...options, schema: null });
}

/**
 * Call AI and return parsed JSON.
 * Strips markdown code fences if present, then parses.
 * Returns: { ok, content, parsed, latencyMs, status, error, details }
 */
async function callAiJson(options) {
  const result = await callAiCore(options);
  if (!result.ok) return { ...result, parsed: null };

  let cleaned = result.content
    .replace(/^```json\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_e) {
    logSafe('status=parse-failed latencyMs=' + result.latencyMs);
    return { ok: false, content: result.content, parsed: null, latencyMs: result.latencyMs, status: 422, error: 'ai-invalid-response', details: ['parse-failed'] };
  }

  return { ok: true, content: result.content, parsed, latencyMs: result.latencyMs, status: 200, error: null, details: null };
}

module.exports = {
  callAiText,
  callAiJson,
  mapUpstreamStatus,
  logSafe,
  getConfig,
  deriveProviderLabel,
  validateTimeout,
  DEFAULT_TIMEOUT_MS,
};
