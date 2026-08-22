# TaskFlow AI v3.0.0 — Post-Release Stabilization Plan

**Release:** v3.0.0
**SHA:** a6be0e83e62c70c86065b3308c8b78084f4200ea
**Date:** 2026-08-22

## P0 — Emergency (immediate patch release v3.0.1)

Data loss, security bypass, privacy leak, critical startup failure, auth bypass, unsafe AI mutation.

Action: immediate hotfix → v3.0.1

## P1 — Important (v3.0.1 patch)

Planner Apply/Undo broken, major AI flow unavailable, sync regression, PWA outage, privacy contract broken, provider cost guard bypass.

Action: hotfix branch → fix → green CI → merge → tag v3.0.1

## P2 — Improvement (queue for v3.1)

Copy changes, minor UX issues, non-blocking visual defects, accessibility polish, performance optimization.

Action: queue for v3.1.0

## Versioning Policy

- **v3.0.x** — bug/security/reliability patches only
- **v3.1.0** — new backward-compatible features
- **v4.0.0** — major architectural/product generation

Never rewrite an existing release tag.

## Hotfix Workflow

1. Create branch: `hotfix/v3.0.1-<issue>`
2. Minimal fix
3. Run tests
4. Open PR against main
5. Wait for green CI
6. Merge to main
7. Tag: `v3.0.1`
8. Create GitHub Release
9. Verify production deployment

No direct hotfix push to main.

## Optional v3.1 Roadmap

- **7A** — Post-Release Reliability
- **7B** — AI Quality Evaluation
- **7C** — Smart Planning Intelligence
- **7D** — Calendar & Scheduling Intelligence
- **7E** — Productivity Insights
- **7F** — Sharing / Collaboration
- **7G** — v3.1 Release Candidate
