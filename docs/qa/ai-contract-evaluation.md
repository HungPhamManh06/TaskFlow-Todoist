# Phase 6R — AI Contract Evaluation & Adversarial Testing

## Overview

Phase 6R creates a repeatable, deterministic AI evaluation system that proves TaskFlow AI produces **safe, valid, and useful** productivity decisions across realistic Vietnamese and English user requests.

## Philosophy

**BAD test:** AI response must equal exact prose.
**GOOD test:** Valid action type, references existing task UID, valid date, valid time, within action limits, requires confirmation before mutation.

Phase 6R evaluates **contracts**, not wording.

## Architecture

```
tests/ai-evals/
├── fixtures/
│   ├── vi-fixtures.mjs          # Vietnamese language fixtures (13 scenarios)
│   ├── en-fixtures.mjs          # English language fixtures (8 scenarios)
│   └── adversarial-fixtures.mjs # Malformed/injection/edge-case fixtures
├── helpers/
│   └── eval-helpers.mjs         # Mock providers, context builders, assertions
├── contract-eval.test.mjs       # Contract validation + reference integrity + destructive + ambiguous + English
├── safety-eval.test.mjs         # Safety invariants + chat/agent separation
├── adversarial-eval.test.mjs    # Adversarial edge cases
├── dates-eval.test.mjs          # Dedicated date/time contract suite
└── roadmap-eval.test.mjs        # Roadmap contract evaluation
```

## Test Coverage (280 tests)

| Category | Count | Description |
|----------|-------|-------------|
| Vietnamese fixtures | 13 | Plan day/week, reschedule, next actions, breakdown |
| English fixtures | 8 | Equivalent English scenarios |
| Plan proposal valid | 6 | schedule_task, reschedule_task, next_action, mixed |
| Plan proposal invalid | 12 | Unknown type, ghost UID, bad date/time/duration |
| Agent proposal | 15 | create/update/complete/schedule/reschedule, field validation |
| File agent proposal | 5 | Only create/schedule allowed |
| Date/time contracts | 55 | Leap years, boundaries, invalid dates/times, durations |
| Reference integrity | 8 | Hallucinated UIDs/projects/milestones, cross-project |
| Destructive safety | 7 | No delete task types, mass operation caps |
| Ambiguous requests | 3 | No-op safe, entity guessing rejected |
| Partial failure | 3 | Atomicity — one bad action rejects all |
| Safety invariants | 18 | No mutation, size limits, referential integrity |
| Chat/agent separation | 9 | Forbidden fields, chat safety, privacy gating |
| Adversarial | 50+ | Prompt injection, malformed output, type coercion |
| Roadmap contracts | 15 | Validation, dependencies, mutation safety, reuse |
| Prompt construction | 4 | Vietnamese/English labels, context sanitization |

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

### 3. English Language Coverage

8 equivalent English fixtures:
- `Plan my day tomorrow.`
- `Schedule the most important work in the morning.`
- `I only have one hour tonight.`
- `Move this task to tomorrow afternoon.`
- `Plan my next week around these meetings.`
- `Break this project into milestones.`
- `Move all overdue tasks to tomorrow.`

### 4. Date/Time Contracts

Dedicated date/time evaluation with:
- **Leap year**: 2028-02-29 accepted, 2027-02-29 rejected
- **Month boundaries**: Jan 31 → Feb 1, year transitions
- **Year boundaries**: 2099-12-31 accepted, 2100-01-01 rejected
- **Invalid times**: 25:00, 09:60, 9:00, noon, empty
- **Duration boundaries**: 5 (min), 480 (max), null (flexible)
- **Strict calendar validation (6R.1/6R.2)**: Feb 30, Apr 31, non-leap Feb 29 all rejected

### 5. Reference Integrity

Tests prove:
- Hallucinated task UIDs rejected
- Hallucinated project IDs rejected
- Hallucinated milestone IDs rejected
- Duplicate action IDs rejected
- Valid existing task references pass
- Valid action-to-action references pass

### 6. Destructive Request Safety

Tests prove:
- `delete_task` not in plan ACTION_TYPES
- `delete_task` not in agent ACTION_TYPES
- File agent has no update/complete/reschedule
- Max actions cap (10) prevents mass operations
- Destructive text in next_action is advisory only (DATA)

### 7. Ambiguous Request Handling

Tests prove:
- Empty proposal is safe (AI chose not to act)
- Entity "it"/"this" not silently resolved
- No-op is always safe

### 8. Partial Failure / Atomicity

Tests prove:
- One invalid action rejects the entire proposal
- No partial silent mutation

### 9. Safety Invariants

| Invariant | Verified By |
|-----------|-------------|
| No direct mutation | Plan proposals cannot contain delete/create/complete |
| Agent restrictions | Only 5 action types allowed |
| No credential leaks | CHAT_FORBIDDEN_KEYS covers token, password, etc. |
| Privacy gating | Reflections/mood gated behind allowSensitive |
| Size limits | Max 10 actions, summary ≤400, text ≤300 |
| Referential integrity | Unknown UIDs/projects/milestones rejected |

### 10. Adversarial Testing

Tests malformed/injection/edge-case provider outputs:
- Empty/null/whitespace-only responses
- Plain text instead of JSON
- Truncated JSON, HTML injection, markdown fence injection
- Prompt injection in task text (treated as DATA)
- Prototype pollution attempts
- Type coercion attacks
- Null/undefined/empty proposal objects

### 11. Roadmap Contracts

Tests roadmap validation:
- Valid roadmap passes
- Null/undefined rejected
- Unknown milestone reference rejected
- Missing task title rejected
- Cycle detection, self-reference detection
- Diamond dependencies accepted
- validateRoadmap does not mutate
- Reuse (existingTaskKey) skips existing tasks
- Hostile titles treated as data

## Server Behavior Documentation

| Behavior | Actual | Notes |
|----------|--------|-------|
| Forbidden fields in args | **Stripped silently** | Server uses per-type args allowlist |
| Array proposal | `summary-invalid` + `actions-invalid` | Arrays are objects in JS |
| Feb 30 / Apr 31 | **Rejected by server** | Strict calendar validation (6R.1/6R.2) |
| Empty milestones/tasks | **Accepted** | No minimum count enforcement |
| Duplicate IDs | **Rejected by validateRoadmap()** | Already had duplicate protection |

## Files Changed

| File | Change |
|------|--------|
| `tests/ai-evals/fixtures/vi-fixtures.mjs` | Vietnamese language fixtures |
| `tests/ai-evals/fixtures/en-fixtures.mjs` | **NEW** — English language fixtures |
| `tests/ai-evals/fixtures/adversarial-fixtures.mjs` | Adversarial test fixtures |
| `tests/ai-evals/helpers/eval-helpers.mjs` | Mock providers, builders, assertions |
| `tests/ai-evals/contract-eval.test.mjs` | Contract + reference + destructive + ambiguous + English |
| `tests/ai-evals/safety-eval.test.mjs` | Safety invariants + chat/agent separation |
| `tests/ai-evals/adversarial-eval.test.mjs` | Adversarial edge cases |
| `tests/ai-evals/dates-eval.test.mjs` | **NEW** — Date/time contract suite |
| `tests/ai-evals/roadmap-eval.test.mjs` | **NEW** — Roadmap contract evaluation |
| `docs/qa/ai-contract-evaluation.md` | This documentation |

## No Source Changes

Phase 6R is evaluation-only. No production code was modified.

## Regression Fixture Policy

Every AI bug discovered from this point onward should gain a fixture:

- AI invented UID → add fixture
- AI scheduled during calendar busy time → add fixture
- AI misunderstood "ngày kia" → add fixture
- AI accepted invalid date → add fixture

The AI eval corpus is TaskFlow's long-term regression memory.

## Suggested Phase 6R+ Scope

- Provider retry with exponential backoff
- Provider health monitoring
- Provider fallback (primary → secondary)
- Structured response validation at gateway level
- Streaming support for long-running responses
- Optional live model evaluation harness (gated by `AI_EVAL_LIVE=1`)
