# Phase 6M — Goal-to-Roadmap + Safe Milestone Planning

## Overview

Phase 6M lets users transform a **high-level goal** into a structured, reviewable roadmap.

- **Goal**: user intent
- **Roadmap Preview**: read-only milestones + candidate tasks
- **Task Proposal**: candidate create_task actions (on explicit convert)
- **Plan Preview**: optional scheduling via Phase 6H
- **Apply**: explicit Review + Confirm

## Core Principle

```
GOAL ≠ ROADMAP ≠ TASK PROPOSAL ≠ PLAN ≠ APPLY
```

Five layers kept separate. Never collapsed.

## Architecture

```
User goal
↓
deterministic intent
↓
goal normalization
↓
current TaskFlow context selection
↓
existing-task duplicate map
↓
bounded Gemini request
↓
strict roadmap JSON
↓
server validation
↓
client validation
↓
Roadmap Preview
↓
user refine
↓
"Đưa task vào đề xuất"
↓
Phase 6G candidate actions
↓
Phase 6H scheduling
↓
Phase 5C Review
↓
explicit Confirm
```

## Project/Hierarchy Capability Audit

| Capability | Status |
|-----------|--------|
| Project entity | YES (js/projects.js) |
| Task → Project link | YES (task.projectId) |
| Subtask support | No explicit subtask entity |
| Task dependency support | YES (Phase 4C proposal system) |
| Milestone entity | YES (embedded in projects) |

**Milestones are reused from existing project infrastructure.** No new canonical entity.

## Roadmap Preview Schema

```json
{
  "roadmapId": "roadmap-...",
  "revision": 0,
  "goal": {
    "title": "Hoàn thành đồ án Database",
    "targetDate": "2026-09-30"
  },
  "milestones": [
    {
      "id": "m1",
      "title": "Thiết kế",
      "order": 1,
      "candidateTaskIds": ["r1", "r2"]
    }
  ],
  "tasks": [
    {
      "id": "r1",
      "milestoneId": "m1",
      "title": "Vẽ ERD",
      "duration": 60,
      "deadline": null,
      "dependsOn": [],
      "existingTaskKey": null,
      "source": "ai-suggested",
      "aiEstimated": true
    }
  ],
  "feasibility": {
    "status": "feasible",
    "totalWorkMinutes": 300,
    "capacityMinutes": 540,
    "slackMinutes": 240
  }
}
```

**Ephemeral only.** Not persisted to canonical TaskFlow data.

## Size Caps

| Limit | Value |
|-------|-------|
| Max milestones | 8 |
| Max candidate tasks | 20 |
| Max dependency depth | 4 |
| Max undo history | 5 |

## ID Strategy

Request-local IDs: `m1`, `m2`, `r1`, `r2`. Never real canonical IDs until proposal conversion.

## Dependency Model

Reuses Phase 4C dependency infrastructure. Roadmap candidate: `r3 dependsOn ["r1", "r2"]`. On conversion: mapped to proposal taskRef/dependency format.

## Feasibility Check

Uses Phase 6H/6J deterministic capacity tools:

| Status | Meaning |
|--------|---------|
| feasible | slack ≥ 60min |
| tight | 0 ≤ slack < 60min |
| insufficient-capacity | slack < 0 |
| unknown | tasks lack duration estimates |

## AI Estimate Provenance

Each candidate shows origin:
- **AI đề xuất** — AI-suggested
- **Đã có trong TaskFlow** — existing task reused
- **Người dùng thêm** — user-added
- **~60 phút · AI ước tính** — AI-estimated duration

## Existing Task Reuse

Before creating candidates, checks current TaskFlow for likely duplicates. No silent duplication.

## Refinement / Revision

- Every edit increments revision
- Stale AI responses discarded (baseRevision mismatch)
- Undo: up to 5 revisions
- Reset: restores original roadmap

## Conversion to Phase 6G

Explicit: [Đưa task vào đề xuất]

- New candidates → create_task proposal actions
- Existing task references → skipped (no duplicate)
- Dependency closure enforced (if r5 depends r2, both included)
- Phase 6G action limit remains authoritative

## Roadmap → Phase 6H What-if Plan

CTA: [Xem kế hoạch lịch]

Creates ephemeral Phase 6H What-if Plan Preview over candidate tasks. No canonical writes.

## Privacy

- Goal title included (local only)
- AI receives: goal title, target date, sanitized existing work labels
- No raw TaskFlow data, no file content, no Reflection/Mood

## Known Limitations

- No productivity scoring
- No AI success probability
- No autonomous execution
- No automatic task creation
- No background Gemini
- No milestone DB entity modification
- No file reupload
- Google Calendar remains read-only
