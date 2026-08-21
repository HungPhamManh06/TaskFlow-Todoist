# Phase 6R — AI Contract Evaluation & Adversarial Testing

## Overview

Phase 6R creates a repeatable, deterministic AI evaluation system that proves TaskFlow AI produces **safe, valid, and useful** productivity decisions across realistic Vietnamese requests.

## Philosophy

**BAD test:** AI response must equal exact prose.
**GOOD test:** Valid action type, references existing task UID, valid date, valid time, within action limits, requires confirmation before mutation.

Phase 6R evaluates **contracts**, not wording.

## Architecture

```
tests/ai-evals/
├── fixtures/
│   ├── vi-fixtures.mjs          # Vietnamese language fixtures with mock responses
│   └── adversarial-fixtures.mjs # Malformed/injection/edge-case fixtures
├── helpers/
│   └── eval-helpers.mjs         # Mock providers, context builders, assertion helpers
├── contract-eval.test.mjs       # Contract validation tests (157 tests total)
├── safety-eval.test.mjs         # Safety invariant tests
└── adversarial-eval.test.mjs    # Adversarial edge-case tests
```

## Key Design Decisions

### 1. Deterministic CI — No Live Gemini Calls

All evaluation tests use mocked/canned provider outputs. CI never depends on:
- Live Gemini API responses
- Network availability
- Rate limits
- Model behavior changes

### 2. Vietnamese Language Coverage

13 realistic Vietnamese fixtures covering:
- `Lập lịch học C# cho tôi vào ngày mai`
- `Sắp xếp việc quan trọng nhất vào buổi sáng`
- `Tối nay tôi chỉ có 1 tiếng`
- `Dời bài tập cơ sở dữ liệu sang chiều mai`
- `Tuần sau tôi phải hoàn thành đồ án`
- `Tôi muốn tập gym sau giờ học`
- Date interpretation: hôm nay, mai, sáng mai, chiều mai, tối nay, ngày kia, cuối tuần, tuần sau, thứ hai tuần sau

### 3. Contract Evaluation

Tests verify CONTRACT properties, not prose:
```javascript
{
  allowedActions: ['schedule_task', 'reschedule_task', 'next_action'],
  forbiddenActions: ['delete_task', 'create_task', 'complete_task'],
  maxActions: 10,
  mustRequireConfirmation: true,
  mustNotMutateDirectly: true,
  taskUidsMustExist: true,
  datesMustBeValid: true,
  durationsMustBeRange: [5, 480],
}
```

### 4. Safety Invariants Verified

| Invariant | Verified By |
|-----------|-------------|
| No direct mutation | Plan proposals cannot contain `delete_task`, `create_task`, `complete_task` |
| Agent restrictions | Only 5 action types allowed: `create_task`, `update_task`, `complete_task`, `schedule_task`, `reschedule_task` |
| No credential leaks | `CHAT_FORBIDDEN_KEYS` covers token, password, authorization, jwt, apikey |
| Privacy gating | Reflections/mood gated behind `allowSensitive` opt-in |
| Size limits | Max 10 actions, summary ≤400 chars, text ≤300 chars |
| Referential integrity | Unknown task UIDs rejected, unknown projects/milestones rejected |
| Forbidden fields | Unknown top-level fields on agent actions rejected via `AGENT_ALL_FIELDS` |

### 5. Adversarial Testing

Tests malformed/injection/edge-case provider outputs:
- Empty/null/whitespace-only responses
- Plain text instead of JSON
- Truncated JSON
- HTML injection in responses
- Markdown fence injection
- Prompt injection in task text (treated as DATA, not instructions)
- Prototype pollution attempts
- Type coercion attacks (number as summary, string as actions)
- Null/undefined/empty proposal objects
- Oversized payloads

### 6. Server Behavior Documentation

The evaluation suite documents actual server behavior that differs from initial assumptions:

| Behavior | Actual | Notes |
|----------|--------|-------|
| Forbidden fields in args (token/password) | **Stripped silently** | Server uses per-type args allowlist; forbidden field check is client-side only |
| Array proposal | Returns `summary-invalid` + `actions-invalid` | Arrays are objects in JS, so `proposal-not-object` doesn't trigger |
| `schedule_task` as dependency reference | **Invalid reference type** | Only `create_task` produces entities for `taskRef.kind = 'action'` |

## Test Results

- **157/157** Phase 6R evaluation tests pass
- **2199/2199** full repository tests pass
- **13/13** sync tests pass
- **5/5** security tests pass

## Files Changed

| File | Change |
|------|--------|
| `tests/ai-evals/fixtures/vi-fixtures.mjs` | **NEW** — Vietnamese language fixtures |
| `tests/ai-evals/fixtures/adversarial-fixtures.mjs` | **NEW** — Adversarial test fixtures |
| `tests/ai-evals/helpers/eval-helpers.mjs` | **NEW** — Mock providers, builders, assertions |
| `tests/ai-evals/contract-eval.test.mjs` | **NEW** — Contract evaluation tests |
| `tests/ai-evals/safety-eval.test.mjs` | **NEW** — Safety invariant tests |
| `tests/ai-evals/adversarial-eval.test.mjs` | **NEW** — Adversarial edge-case tests |
| `docs/qa/ai-contract-evaluation.md` | **NEW** — This documentation |

## No Source Changes

Phase 6R is evaluation-only. No production code was modified.

## Suggested Phase 6R+ Scope

- Provider retry with exponential backoff
- Provider health monitoring
- Provider fallback (primary → secondary)
- Structured response validation at gateway level
- Streaming support for long-running responses
