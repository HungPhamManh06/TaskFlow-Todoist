# Phase 6F: Conversational Proposal Refinement

## Overview

Phase 6F allows users to modify a pending AI proposal using natural-language instructions, without calling Gemini for simple operations. The user must still explicitly click Apply to confirm changes.

## Core Security

- Conversation modifies PENDING REVIEW STATE only
- Conversation CANNOT modify canonical TaskFlow state
- No direct Apply from chat refinement path
- Explicit Confirm button remains mandatory

## Refinement Router

`classifyProposalMessage(message)` in `ai-intent.js` classifies messages as:

- `refine` — local deterministic or complex AI refinement
- `question` — question about the proposal
- `confirm-attempt` — BLOCKED (apply bypass protection)
- `cancel` — discard proposal
- `normal-chat` — not related to refinement

## Local Deterministic Operations

Simple refinements handled without Gemini:

| Operation | Example | Method |
|-----------|---------|--------|
| Select all | "Chọn tất cả" | Local |
| Deselect all | "Bỏ tất cả" | Local |
| Select index | "Chọn task 1" | Local |
| Deselect index | "Bỏ task 2" | Local |
| Select only | "Chỉ giữ task 1 và 3" | Local |
| Single edit | "Đổi task 1 thành 45 phút" | Local |
| Bulk edit | "Đổi tất cả thành 45 phút" | Local |
| Filter date | "Chỉ giữ task có deadline" | Local |

## Complex AI Refinement

When deterministic parsing cannot safely perform the request, the server calls Gemini via `POST /api/ai/refine`:

- Returns structured operations array
- Server validates each operation against allowlist
- Client applies operations to review state

## Operation Schema

```json
{
  "operations": [
    { "op": "select", "index": "1" },
    { "op": "deselect", "index": "2" },
    { "op": "set", "actionId": "a1", "field": "duration", "value": 45 },
    { "op": "bulk-set", "field": "duration", "value": 45 },
    { "op": "filter-date" }
  ]
}
```

## Operation Allowlist

Allowed: select, deselect, select-all, deselect-all, select-only, set, bulk-set, filter-date, reorder

NOT allowed: apply, confirm, execute, delete_task, create_task, replaceProposal, changeActionType

## Apply-Bypass Protection

Natural-language confirm attempts ("Áp dụng luôn", "Ok tạo đi", etc.) are blocked. Response: "Đề xuất đã sẵn sàng. Hãy dùng nút Áp dụng để xác nhận."

## Stale Response Protection

Each request includes current revision. Server echoes `baseRevision`. If revision changed before response arrives, response is discarded.

## Undo / Reset

- Undo: restores previous review state snapshot (max 5 history entries)
- Reset: restores original proposal state

## Dependency Safety

Deselecting a parent action automatically deselects dependent actions.

## Privacy

- File bytes not re-uploaded for refinement
- Minimal context sent to server
- No chain-of-thought
- No memory writes
