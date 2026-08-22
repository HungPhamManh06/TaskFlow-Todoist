# TaskFlow AI v1.0 — Release Checklist

## AI Routes (9 provider-backed)
- [x] /plan — Smart Planner
- [x] /plan-synthesis — Constraint-aware plan synthesis
- [x] /plan-health — Plan health explanation
- [x] /chat — Conversational AI assistant
- [x] /agent — Multi-step AI agent
- [x] /file — File-understanding AI
- [x] /file-agent — Structured file extraction
- [x] /refine — Proposal refinement
- [x] /roadmap — AI roadmap generation

## Production Controls (all routes)
- [x] Authentication via authMiddleware
- [x] Rate limiting (per-route minute + hourly where applicable)
- [x] Central request-ID middleware (X-Request-Id header)
- [x] Provider message budget (64KB default, 256KB max)
- [x] Provider maxTokens validation (hard cap 8192)
- [x] Provider timeout validation (5s–120s)
- [x] AI JSON body budget (128KB)
- [x] Structured output schemas (server-owned)
- [x] Safe error mapping (no raw provider content)

## Idempotency & Concurrency
- [x] Agent idempotency cache bounded to 500 entries
- [x] TTL cleanup + oldest eviction
- [x] Agent concurrency guard (max 2 per user)
- [x] File concurrency guard
- [x] All slots release on success/error/timeout

## Client AI Trust UX
- [x] Proposal review with Before/After diff
- [x] Edit before Apply (schedule: date/start/duration, reschedule: option)
- [x] Post-edit revalidation + conflict check
- [x] "Why this suggestion?" provenance
- [x] Data used transparency
- [x] Undo integration (including TimeBlocks)
- [x] Request cancellation (AbortController)
- [x] Stale response protection
- [x] Friendly VI/EN error mapping
- [x] Helpful/Not helpful feedback (local-only)

## Privacy
- [x] Reflection/Mood OFF by default (opt-in per request)
- [x] Adaptive Planning default OFF
- [x] AI Memory separate from Adaptation
- [x] Feedback store content-free
- [x] No raw adaptation events to provider
- [x] No task text in adaptation store
- [x] Adaptation store excluded from cloud sync
- [x] Feedback store excluded from cloud sync
- [x] No prompt/context in logs
- [x] No API key in logs
- [x] Debug mode returns metadata only

## Security
- [x] Auth required for all AI routes
- [x] Rate limits on all expensive endpoints
- [x] Prototype pollution protection (sanitizers)
- [x] Prompt injection resistance (architectural separation)
- [x] Provider config cannot be overridden by client
- [x] Response schemas server-owned
- [x] AgentRequestId validated (8–64 safe chars)

## Test Suites
- [x] Phase 6R AI contract tests
- [x] Phase 6S adaptive planning tests
- [x] Phase 6T trust UX tests (41)
- [x] Phase 6T.2 trust integrity tests (51)
- [x] Phase 6U production hardening tests (66)
- [x] Phase 6U.1 cross-endpoint tests (64)
- [x] Phase 6V RC journey tests (61)
- [x] Phase 5a1 runtime stability tests
- [x] Phase 9 frontend tests
- [x] Sync tests
- [x] Server security tests
- [x] Release asset checks

## CI Requirements
- [x] release-assets PASS
- [x] test PASS
- [x] sync PASS
- [x] server security PASS
- [x] offline E2E PASS
- [x] Chromium smoke PASS
- [x] Firefox smoke PASS
- [x] WebKit smoke PASS
- [x] frontend E2E PASS

## Production Environment Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| AI_API_KEY | Provider API key (required) | — |
| AI_API_URL | Provider endpoint URL | Gemini OpenAI-compat |
| AI_MODEL | Model name | gemini-3.6-flash |
| AI_TIMEOUT_MS | Provider timeout (5000–120000) | 60000 |
| AI_CHAT_RATE_LIMIT_PER_MIN | Chat requests/min/user | 15 |
| AI_PLAN_RATE_LIMIT_PER_MIN | Plan requests/min/user | 6 |
| AI_AGENT_RATE_LIMIT_PER_MIN | Agent requests/min/user | 6 |
| AI_AGENT_RATE_LIMIT_PER_HOUR | Agent requests/hour/user | 30 |
| AI_AGENT_ENABLED | Enable agent features | false |

## Known Limitations
- In-memory rate limits are instance-local (serverless defense-in-depth)
- No persistent durable quota across serverless instances
- AI unavailable offline (expected — planner rules still work)

## Release Status
- [x] 0 P0 issues
- [x] 0 P1 issues
- [x] RC validated
- [ ] Final tag pending owner approval
