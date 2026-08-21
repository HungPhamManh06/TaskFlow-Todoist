# Phase 6G — Safe Proposal Expansion + Task Decomposition

## Scope

Phase 6G allows users to **add new candidate actions** to an existing pending AI Review
using natural language. It extends Phase 6F refinement to include:

- Add a new candidate task to the pending proposal
- Decompose a proposed task into smaller candidate steps
- Request additional planning around an existing proposal

Everything remains **proposal-only**. No TaskFlow mutation until explicit Apply.

## Architecture

### Expansion Router

`classifyProposalMessage()` in `ai-intent.js` classifies expansion intent:

- `kind: "expand"` with `operationHint: "add"` — simple add request
- `kind: "expand"` with `operationHint: "decompose"` — decomposition request

### Local Deterministic Add

`_parseSimpleAdd(message)` in `ai-agent-runtime.js` handles fully-specified add
commands locally without Gemini:

- "Thêm task Kiểm tra báo cáo 30 phút"
- "Thêm việc Ôn Database"

### Complex Expansion

Complex decomposition requires Gemini. The `/api/ai/refine` endpoint handles
expansion operations using the same structured operation schema.

### Operation Schema

```json
{
  "op": "add",
  "tempId": "n1",
  "action": {
    "type": "create_task",
    "args": {
      "text": "Kiểm tra báo cáo",
      "duration": 30
    }
  }
}
```

### Action ID Allocation

`_nextProposalActionId(actions)` allocates deterministic proposal-local IDs:

- Existing: a1, a2, a3
- Next: a4

Never reuses removed IDs. Never uses real TaskFlow UIDs.

### Temp ID Mapping

Gemini may use temporary request-local IDs (n1, n2) for dependencies inside
its response. Server/client maps these to canonical IDs (a4, a5) before merging.

## Safety Rules

### Original Proposal Immutable

`originalProposal` remains immutable. Phase 6G additions exist only in
`workingProposal`. Reset restores exact original.

### Max Action Cap

Maximum 10 actions per proposal. Expansion that would exceed the cap is
entirely rejected. No silent truncation.

### Action Type Allowlist

Normal Agent expansion: uses current normal Agent allowlist.

File Agent expansion: restricted to `create_task` + `schedule_task` only.

### No Direct Writes

Gemini may suggest new actions. Gemini may NOT:

- Write TaskFlow
- Apply
- Confirm
- Delete data
- Bypass Review
- Call external tools

### Apply Bypass Protection

Natural-language phrases like "Áp dụng luôn", "Confirm", "Execute" are
blocked. Response: "Đề xuất đã sẵn sàng. Hãy dùng nút Áp dụng để xác nhận."

Zero canonical writes from chat refinement path.

### No New Action Creation (V1 Limitation)

Phase 6G V1 does NOT add actions to a pending proposal from plain natural
language without explicit user command. Complex decomposition is AI-assisted.

### Action Type Immutability

Refinement must not transform action types (e.g., create_task → complete_task).

## Server Validation

1. Expansion operations validated against operation allowlist
2. Action type, fields, string lengths, dates, durations validated
3. Dependency graph validated (no cycles, depth limits)
4. Total proposal size validated after merge
5. Prototype pollution explicitly rejected

## Dual-Stage Validation

1. Validate expansion operations themselves
2. Validate merged working proposal using canonical validators

Both must pass before Review is updated.

## Atomic Update

Either ALL accepted expansion operations merge, or NONE merge. No partial
modification on malformed expansion.

## Revision Safety

Reuses Phase 6F revision model. Stale responses discarded. One request
in flight at a time.

## Undo / Reset

- Undo removes newly added actions from latest expansion
- Reset restores exact original proposal
- Both increment revision and refresh card

## Explainability

Newly added actions show: "Được thêm vì bạn yêu cầu trong cuộc trò chuyện."
No chain-of-thought. Phase 6E provenance extended with `user-expansion` or
`ai-derived-expansion` factor.

## Duplicate Detection

Every newly added `create_task` runs deterministic duplicate detection against
both current canonical tasks and other working proposal actions.

## Schedule Conflicts

New `schedule_task` actions rerun TimeBlock checks, Google busy, and existing
proposal schedule overlap detection.

## Offline Behavior

Fully specified deterministic additions may work offline. Complex decomposition
requires AI — offline shows unavailable message. Review stays intact.

## Known Limitations

- V1 does not add actions from plain natural language without explicit command
- Complex decomposition uses AI which may produce imperfect subtask breakdowns
- No concurrent expansion requests per proposal
- No file reupload during expansion (uses proposal evidence metadata)

## Privacy

- Send minimal context to Gemini for complex expansion
- No raw file bytes
- No AI Memory writes
- No Reflection/Mood by default

## Non-Negotiable

Phase 6G does NOT support:

- delete_task
- autonomous execution
- background Agent
- Google Calendar writes
- Natural-language Apply bypass
- Direct Gemini writes
