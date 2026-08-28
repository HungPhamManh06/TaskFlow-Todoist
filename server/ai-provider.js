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
const MIN_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 120000;
const MAX_MAX_TOKENS = 8192;

// Phase 6U.1: Provider message budget — reject oversized messages before fetch
const DEFAULT_MAX_MESSAGE_BYTES = 64 * 1024;
// File routes may opt into a larger, still-bounded ceiling. Normal chat keeps
// DEFAULT_MAX_MESSAGE_BYTES because callers must pass maxMessageBytes explicitly.
const MAX_MAX_MESSAGE_BYTES = 41 * 1024 * 1024;

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
 * Returns a safe bounded integer between MIN_TIMEOUT_MS and MAX_TIMEOUT_MS.
 */
function validateTimeout(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(n), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

/**
 * Validate and normalize a maxTokens value.
 * Returns a safe positive integer capped at MAX_MAX_TOKENS.
 */
function validateMaxTokens(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 2048;
  return Math.min(Math.floor(n), MAX_MAX_TOKENS);
}

/**
 * Validate and normalize a maxMessageBytes value.
 * Returns a safe positive integer capped at MAX_MAX_MESSAGE_BYTES.
 */
function validateMaxMessageBytes(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_MESSAGE_BYTES;
  return Math.min(Math.floor(n), MAX_MAX_MESSAGE_BYTES);
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
 * Parse Retry-After header value into safe seconds.
 * Accepts numeric seconds and HTTP-date format.
 * Bounds: 1..3600. Returns null on invalid/missing.
 */
function _parseRetryAfter(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Numeric seconds
  const n = Number(s);
  if (Number.isFinite(n) && n >= 1 && n <= 3600) return Math.floor(n);
  // HTTP-date format
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const diffSec = Math.ceil((d.getTime() - Date.now()) / 1000);
    if (diffSec >= 1 && diffSec <= 3600) return diffSec;
  }
  return null;
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
    maxTokens: rawMaxTokens = 2048,
    timeoutMs: explicitTimeout,
    requestId = '',
    routeName = '',
    model: modelOverride,
  } = options;
  const maxTokens = validateMaxTokens(rawMaxTokens);
  const maxMessageBytes = validateMaxMessageBytes(options.maxMessageBytes);

  const cfg = getConfig();
  if (!cfg.apiKey) {
    return { ok: false, content: null, latencyMs: 0, status: 503, error: 'ai-not-configured', details: null };
  }

  // Phase 6U.1: Provider message budget — reject before fetch
  try {
    const msgBytes = Buffer.byteLength(JSON.stringify(messages), 'utf8');
    if (msgBytes > maxMessageBytes) {
      logSafe('status=message-budget-exceeded msgBytes=' + msgBytes + ' maxBytes=' + maxMessageBytes + ' route=' + routeName);
      return { ok: false, content: null, latencyMs: 0, status: 413, error: 'payload-too-large', details: ['provider-message-budget'] };
    }
  } catch (e) { /* serialization failure is non-critical but we continue */ }

  const model = modelOverride || cfg.model;
  const effectiveTimeout = (Number.isFinite(explicitTimeout) && explicitTimeout > 0)
    ? Math.floor(explicitTimeout)
    : cfg.timeoutMs;
  const provider = deriveProviderLabel(cfg.apiUrl);
  const startedAt = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, effectiveTimeout);
  // Phase: link external abort signal (e.g. client disconnect) to provider abort
  if (options.signal) {
    if (options.signal.aborted) { controller.abort(); clearTimeout(timer); }
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

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
      if (timedOut) {
        // Internal provider timeout — safe timeout metadata
        logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=timeout timeoutMs=' + effectiveTimeout + ' latencyMs=' + latencyMs);
        return {
          ok: false, content: null, latencyMs, status: 504, error: 'ai-timeout', details: null,
          timeout: { source: 'provider', timeoutMs: effectiveTimeout, latencyMs },
        };
      }
      // External abort (client disconnect / user Stop) — not a provider error
      logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=client-abort latencyMs=' + latencyMs);
      return { ok: false, content: null, latencyMs, status: 499, error: 'ai-client-abort', details: null };
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
    const result = {
      ok: false,
      content: null,
      latencyMs,
      status: upstream.status === 429 ? 429 : 502,
      error: code,
      details: ['upstream-' + upstream.status],
    };
    // Parse Retry-After for provider rate limits
    if (upstream.status === 429) {
      const retryAfter = _parseRetryAfter(upstream.headers && upstream.headers.get('retry-after'));
      result.rateLimit = {
        source: 'provider',
        retryAfterSeconds: retryAfter,
      };
      logSafe(logPrefix + ' provider=' + provider + ' rateLimitSource=provider retryAfterSeconds=' + (retryAfter === null ? 'null' : retryAfter) + ' latencyMs=' + latencyMs);
    }
    return result;
  }

  // Parse response JSON
  let json;
  try {
    json = await upstream.json();
  } catch (_e) {
    logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=json-parse-error latencyMs=' + latencyMs);
    return { ok: false, content: null, latencyMs, status: 502, error: 'ai-provider-unavailable', details: null };
  }

  // Extract content and finish_reason from OpenAI-compatible response
  const choice = json && json.choices && json.choices[0];
  const content = choice && choice.message && choice.message.content;
  const finishReason = choice && choice.finish_reason ? String(choice.finish_reason) : null;
  if (typeof content !== 'string' || !content.trim()) {
    logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=empty-content latencyMs=' + latencyMs);
    return { ok: false, content: null, latencyMs, status: 422, error: 'ai-invalid-response', details: ['empty-content'] };
  }

  logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=success latencyMs=' + latencyMs);
  return { ok: true, content: content.trim(), latencyMs, status: 200, error: null, details: null, finishReason };
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

/**
 * Agent-specific timeout configuration.
 * AI_AGENT_TIMEOUT_MS overrides AI_TIMEOUT_MS for Agent route only.
 * Validation bounds: MIN_TIMEOUT_MS .. MAX_TIMEOUT_MS (5000..120000).
 * Default: 60000 (unchanged from current behavior).
 */
function getAgentTimeoutMs() {
  const raw = process.env.AI_AGENT_TIMEOUT_MS || process.env.AI_TIMEOUT_MS;
  return validateTimeout(raw);
}

/**
 * Chat-specific timeout configuration.
 * AI_CHAT_TIMEOUT_MS provides a generous timeout for conversational chat
 * (summarize, explain, etc.) without affecting other AI routes.
 * Validation bounds: MIN_TIMEOUT_MS .. MAX_TIMEOUT_MS (5000..120000).
 * Default: 120000 (2 minutes — chat responses can be long-form).
 */
function getChatTimeoutMs() {
  const raw = process.env.AI_CHAT_TIMEOUT_MS || '120000';
  return validateTimeout(raw);
}

/** Safe build SHA from environment. Used by /health and debug meta. */
function getBuildSha() {
  return process.env.TASKFLOW_BUILD_SHA || process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'unknown';
}

/* ---- Phase 11: Streaming chat ---- */

/**
 * Call AI with streaming enabled. Returns an async generator yielding:
 *   { type: 'delta', text: string }
 *   { type: 'done', finishReason: string|null, content: string }
 *   { type: 'error', error: string }
 *
 * The caller MUST consume the generator fully (or abort) to avoid resource leaks.
 * The response body is SSE or NDJSON — the Gemini OpenAI-compat endpoint
 * returns SSE lines: data: {"choices":[{"delta":{"content":"..."}}]}
 */
async function *callAiStream(options) {
  const {
    messages,
    maxTokens: rawMaxTokens = 2048,
    timeoutMs: explicitTimeout,
    requestId = '',
    routeName = '',
    signal,
  } = options;
  const maxTokens = validateMaxTokens(rawMaxTokens);
  const maxMessageBytes = validateMaxMessageBytes(options.maxMessageBytes);

  const cfg = getConfig();
  if (!cfg.apiKey) {
    yield { type: 'error', error: 'ai-not-configured' };
    return;
  }

  // Message budget check
  try {
    const msgBytes = Buffer.byteLength(JSON.stringify(messages), 'utf8');
    if (msgBytes > maxMessageBytes) {
      logSafe('status=message-budget-exceeded msgBytes=' + msgBytes + ' route=' + routeName);
      yield { type: 'error', error: 'payload-too-large' };
      return;
    }
  } catch (e) { /* non-critical */ }

  const model = options.model || cfg.model;
  const effectiveTimeout = (Number.isFinite(explicitTimeout) && explicitTimeout > 0)
    ? Math.floor(explicitTimeout)
    : cfg.timeoutMs;
  const provider = deriveProviderLabel(cfg.apiUrl);
  const startedAt = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, effectiveTimeout);
  if (signal) {
    if (signal.aborted) { controller.abort(); clearTimeout(timer); }
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const logPrefix = (routeName ? 'route=' + routeName : 'route=unknown')
    + (requestId ? ' requestId=' + requestId : '');

  const body = {
    model,
    max_tokens: maxTokens,
    messages,
    stream: true,
  };

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
      if (timedOut) {
        logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=timeout timeoutMs=' + effectiveTimeout + ' latencyMs=' + latencyMs);
        yield { type: 'error', error: 'ai-timeout' };
        return;
      }
      logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=client-abort latencyMs=' + latencyMs);
      yield { type: 'error', error: 'ai-client-abort' };
      return;
    }
    logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=upstream-error latencyMs=' + latencyMs);
    yield { type: 'error', error: 'ai-provider-unavailable' };
    return;
  }

  if (!upstream.ok) {
    clearTimeout(timer);
    const latencyMs = Date.now() - startedAt;
    const code = mapUpstreamStatus(upstream.status);
    logSafe(logPrefix + ' provider=' + provider + ' upstreamStatus=' + upstream.status + ' latencyMs=' + latencyMs);
    yield { type: 'error', error: code };
    return;
  }

  // Read SSE stream — Gemini OpenAI-compat returns lines like:
  // data: {"id":"...","choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}
  // data: [DONE]
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let finishReason = null;
  const latencyMs = Date.now() - startedAt;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') {
          if (trimmed === 'data: [DONE]') {
            finishReason = finishReason || 'stop';
          }
          continue;
        }
        // Strip SSE prefix
        const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const chunk = JSON.parse(jsonStr);
          const choice = chunk && chunk.choices && chunk.choices[0];
          if (choice) {
            if (choice.finish_reason) finishReason = choice.finish_reason;
            const delta = choice.delta;
            if (delta && typeof delta.content === 'string' && delta.content) {
              fullContent += delta.content;
              yield { type: 'delta', text: delta.content };
            }
          }
        } catch (parseErr) {
          // Skip malformed chunks — don't break the stream
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  logSafe(logPrefix + ' provider=' + provider + ' model=' + model + ' status=success latencyMs=' + (Date.now() - startedAt) + ' streamLength=' + fullContent.length);
  yield { type: 'done', finishReason, content: fullContent };
}

module.exports = {
  callAiText,
  callAiJson,
  callAiStream,
  mapUpstreamStatus,
  logSafe,
  getConfig,
  deriveProviderLabel,
  validateTimeout,
  validateMaxTokens,
  validateMaxMessageBytes,
  getAgentTimeoutMs,
  getChatTimeoutMs,
  getBuildSha,
  _parseRetryAfter,
  DEFAULT_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_MAX_TOKENS,
  DEFAULT_MAX_MESSAGE_BYTES,
  MAX_MAX_MESSAGE_BYTES,
};
