# Phase 6E: AI Explainability + Provenance

## Overview

Phase 6E adds transparent, deterministic explanations for AI proposals. Users can understand **why** each action was suggested and **what data** influenced it, without exposing hidden model reasoning.

## Core Principle

**Explainability ≠ chain-of-thought.**

TaskFlow shows:
- **Source Facts** — where the information came from
- **Applied Rules** — what TaskFlow logic was applied
- **User-Relevant Reasons** — why this action exists

TaskFlow does **NOT** show:
- Hidden chain-of-thought
- Model internal reasoning
- System/developer prompts
- API secrets
- Raw model traces

## Provenance Schema

```json
{
  "version": 1,
  "source": "user|taskflow|file|preference|derived",
  "factors": [
    {
      "type": "document-evidence",
      "label": "Assignment 1 due September 20"
    }
  ]
}
```

## Factor Type Allowlist

Only these types may appear in provenance:

| Type | Description |
|------|-------------|
| `user-request` | User's explicit request |
| `document-evidence` | Direct extraction from file |
| `document-derived` | AI suggestion based on file |
| `explicit-deadline` | Deadline from document/request |
| `saved-preference` | Phase 6B user preference |
| `current-task-state` | Existing TaskFlow task state |
| `project-context` | Project information |
| `timeblock-availability` | TimeBlock schedule check |
| `google-busy` | Google Calendar busy check |
| `duplicate-check` | Duplicate detection warning |
| `past-deadline` | Deadline already passed |
| `conflict` | Schedule conflict |
| `default-value` | Default value disclosure |
| `user-edit` | User edited before applying |
| `user-time-override` | User specified time |
| `dependency-select` | Depends on earlier action |

## Why? Button

Each action in the Review card has a `[Tại sao?]` / `[Why?]` button. Clicking it reveals a panel with:

1. Title: "Vì sao AI đề xuất việc này?"
2. Bullet points for each provenance factor
3. Human-readable labels

Panel uses `aria-expanded` and `role="region"` for accessibility.

## Data-Used Summary

At the top of the Review card, a compact line shows:

"AI đã dùng: Tasks · Projects · syllabus.pdf"

Only categories **actually used** are shown (not merely available).

## File Provenance

File-derived proposals show:
- `source.kind = "document"` → "Trích từ tài liệu"
- `source.kind = "ai-suggested"` → "AI đề xuất dựa trên tài liệu"
- Evidence max 160 chars

## Preference Provenance

If Phase 6B preference influenced a proposal:
- "Thời lượng mặc định: 45 phút" (from saved preference)

## Conflict & Duplicate Explanation

- "Có xung đột lịch" — schedule conflict
- "Có thể trùng task hiện có" — duplicate warning
- "Deadline đã qua" — past deadline

## Edit Attribution

If user edits a proposal:
- "Bạn đã chỉnh trước khi áp dụng"

## Privacy

- Factor labels are capped at 160 chars
- Max 6 factors per action
- Max 8 KB total provenance
- All labels rendered via textContent (no HTML injection)
- No file bytes, base64, or raw prompts in provenance
- No system/developer prompts exposed
- No chain-of-thought stored or shown

## Persistence

Explainability metadata is **ephemeral**:
- Lives only in current Chat session
- Not added to Task objects
- Not stored in localStorage
- Not persisted in any database

## Technical Architecture

### Module: `js/ai-explainability.js`

Pure functions:
- `normalizeProvenance(source, factors)` → provenance object
- `validateProvenance(prov)` → {ok, errors}
- `buildActionFactors(action, opts)` → provenance
- `formatActionExplanation(provenance, lang)` → text
- `buildContextUsageSummary(ctx, opts)` → usage array
- `formatContextUsageSummary(summary, lang)` → text
- `formatDisabledReason(reason, lang)` → text

No Gemini calls. No mutations. Lazy-loaded with AI Chat chain.

### Integration Points

- **`ai-agent-runtime.js`**: Why button in `_renderCardFull`, data-used summary
- **`chat.js`**: File source metadata passed to runtime
- **`i18n.js`**: VI + EN keys
- **`styles-critical.css`**: Why button + panel styles
