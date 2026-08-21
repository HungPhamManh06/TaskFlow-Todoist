# Phase 6D: File → Safe Structured Task Proposals

## Overview

Phase 6D allows users to upload a supported file and explicitly request TaskFlow actions (create tasks, schedule tasks) extracted from the document. The model never writes directly — all proposals go through server validation → browser validation → user review → user confirmation → canonical TaskFlow apply.

## Architecture

```
File upload
  → POST /api/ai/file-agent (server)
    → Busboy multipart parse
    → magic-byte validation
    → Gemini structured extraction
    → server sanitization (narrower allowlist)
    → response with proposal
  → browser Phase 5C review
    → validateProposal
    → dryRun
    → per-action select/edit
    → user Confirm
    → revalidate
    → canonical apply
```

## Supported Actions

Phase 6D file-agent ONLY supports:
- `create_task` — extract tasks from document
- `schedule_task` — schedule a created task

**NOT supported** (even if normal Agent supports them):
- `update_task`
- `complete_task`
- `reschedule_task`
- `delete_task`
- Any external tool writes

## File Types

Same as Phase 6C:
- JPEG, PNG, WEBP (images)
- PDF (documents)
- TXT, MD (text)

## Evidence Design

Each file-derived action carries a `source` field:
```json
{
  "kind": "document" | "ai-suggested",
  "evidence": "Assignment 1 due September 20"
}
```

- `document` = direct extraction from file text
- `ai-suggested` = derived planning (e.g., study session before a deadline)

Evidence max 160 characters per action.

## Date Handling

- Dates normalized to `YYYY-MM-DD`
- Ambiguous dates (no year, no day) → omit date or mark needsReview
- Past deadlines → shown as warning, not silently moved
- Server validates date format strictly

## Duplicate Detection

Before review, proposals are compared against current TaskFlow tasks using:
- Normalized text match
- Same date
- Same project (if applicable)

Duplicates shown as warnings, not auto-dropped.

## Schedule Conflicts

For `schedule_task`, existing TimeBlock conflict detection is reused.
Conflicts shown as warnings, not auto-resolved.

## Max Actions

Capped at 10 (same as normal Agent). If document contains more:
- Server returns error: `ai-file-agent-too-many-actions`
- User asked to request a smaller batch

## Security

- File contents = untrusted request-scoped data
- Model output = untrusted proposal
- Server validates against `FILE_AGENT_ACTION_TYPES` allowlist
- Unsupported types rejected before client sees them
- Prompt injection boundary in system instruction
- No file data enters AI Memory
- No permanent file storage
- No direct Gemini writes

## Rate Limiting

Shares existing file-AI rate limits:
- 3 requests/min per user
- 15 requests/hour per user
- 1 concurrent file operation per user

## Confirm-Time Revalidation

Before mutation:
- Re-fetch current canonical local state
- Revalidate selected actions, dependencies, duplicates, task existence, projects, dates, schedule conflicts, busy periods
- Proposal may be stale

## Known Limitations

- Phase 6D does NOT support file-derived `update_task`, `complete_task`, `reschedule_task`
- Planning mode (derived study sessions) requires explicit user request
- Image OCR may misread dates — evidence shown for user verification
- Year ambiguity on documents without clear year context
