# Phase 6Q — Unified AI Provider Gateway & Reliability Foundation

## Goal

Make the existing TaskFlow AI backend reliable, consistent, testable and provider-independent before adding more AI intelligence.

## Previous Architecture

`server/ai.js` (2568 lines) contained:
- API routing
- Provider transport (fetch + AbortController)
- Timeout handling
- Provider error mapping (duplicated 7×)
- Output parsing
- Schemas, validation
- Prompt construction

The `POST /api/ai/plan-health` route used `require('@google/generative-ai')` with a hardcoded `gemini-2.0-flash` model — a legacy SDK not declared in `server/package.json`.

The `POST /api/ai/roadmap` route referenced undefined functions `callAI`, `mapProviderError`, and `logSafe`.

## New Architecture

### Provider Gateway: `server/ai-provider.js`

A small, focused CommonJS module (~180 lines) that centralizes all outbound LLM transport:

```
server/ai-provider.js
├── getConfig()          — reads env vars dynamically (AI_API_KEY, AI_API_URL, AI_MODEL, AI_TIMEOUT_MS)
├── mapUpstreamStatus()  — maps HTTP status → safe error category
├── logSafe()            — centralized safe logging (metadata only)
├── callAiCore()         — core fetch + error handling + response parsing
├── callAiText()         — public API for text responses
└── callAiJson()         — public API for structured JSON responses
```

### Responsibilities

- Read provider configuration from env (dynamic, not cached)
- Call AI_API_URL with AI_API_KEY
- Handle AbortController timeout
- Normalize provider errors to safe category codes
- Parse response JSON
- Record safe latency metadata
- Support JSON structured output (via response_format)
- Support normal text output

### What It Does NOT Know

- TaskFlow business logic
- Prompt construction
- Proposal validation
- Action safety rules
- API request/response contracts

## Migrated Endpoints

| Route | Before | After |
|-------|--------|-------|
| `POST /api/ai/plan` | Inline fetch + error handling | `callAiJson()` |
| `POST /api/ai/plan-synthesis` | Inline fetch + error handling | `callAiJson()` |
| `POST /api/ai/plan-health` | `require('@google/generative-ai')` + `gemini-2.0-flash` | `callAiText()` |
| `POST /api/ai/chat` | Inline fetch + error handling | `callAiText()` |
| `POST /api/ai/agent` | Inline fetch + error handling | `callAiJson()` |
| `POST /api/ai/file` | Inline fetch + error handling | `callAiText()` |
| `POST /api/ai/file-agent` | Inline fetch + error handling | `callAiText()` |
| `POST /api/ai/refine` | Inline fetch + error handling | `callAiJson()` |
| `POST /api/ai/roadmap` | Broken `callAI()` (undefined) | `callAiJson()` |

## Normalized Errors

All routes now produce consistent error categories via the provider:

- `ai-not-configured` — missing API key
- `ai-timeout` — AbortController timeout
- `ai-rate-limited` — upstream 429
- `ai-provider-bad-request` — upstream 400
- `ai-provider-auth` — upstream 401
- `ai-provider-forbidden` — upstream 403
- `ai-provider-not-found` — upstream 404
- `ai-provider-unavailable` — upstream 5xx / network error
- `ai-invalid-response` — empty content or parse failure

## Security / Privacy Invariants

- API keys NEVER appear in logs, responses, or exception details
- Provider raw error bodies are NEVER returned to clients
- Only safe metadata is logged: route, provider, model, status, latencyMs
- `@google/generative-ai` is no longer required anywhere
- No hardcoded model names in routes

## Tests Added

`tests/phase6q-provider-gateway.test.mjs` — 19 tests:

### Source-level structural (6):
- Provider exports callAiText and callAiJson
- No @google/generative-ai in server/
- No hardcoded gemini-2.0-flash in provider
- Error mapping covers all expected statuses
- Routes use unified provider
- Plan-health uses unified provider (no legacy SDK)
- Roadmap route uses unified provider (no undefined functions)

### Mock-based functional (13):
- Empty API key → ai-not-configured
- Timeout → ai-timeout (504)
- Network failure → ai-provider-unavailable (502)
- 400 → ai-provider-bad-request
- 401 → ai-provider-auth
- 429 → ai-rate-limited (429)
- 500 → ai-provider-unavailable (502)
- Empty content → ai-invalid-response
- Malformed response JSON → ai-provider-unavailable
- Valid JSON → parsed result
- Markdown code fences stripped before parse
- Unparseable JSON → ai-invalid-response (422)

All tests use mock fetch — no real API calls.

## Known Limitations

- Phase 6Q does not add retry logic (AI_TIMEOUT_MS is a hard ceiling)
- Provider-specific features (thinking_config, reasoning_effort) are not exposed through the gateway
- The gateway assumes OpenAI-compatible response format
- Route-level logging (validation failures, success) remains in ai.js

## Suggested Phase 6R Scope

- Add request-level retry with exponential backoff
- Add provider health monitoring
- Add structured response validation at the gateway level
- Add streaming support for long-running responses
- Consider provider fallback (primary → secondary)
