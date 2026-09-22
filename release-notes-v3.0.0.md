# TaskFlow AI v3.0.0

Major release: TaskFlow with integrated AI Planning Copilot, Adaptive Personal Planning, AI Safety & Contract Evaluation, AI UX & Trust controls, and production hardening.

Built on the V2.0.0 planning foundation (projects, milestones, time blocks, smart planner, habits, reports, Google Calendar integration).

## Highlights

- **Smart Planner AI** — proposes your day with a preview before Apply
- **AI Agent** — natural-language task breakdown and scheduling proposals
- **AI Roadmap** — milestone planning with dependency validation
- **Plan Health** — personal briefs and actionable alerts
- **Adaptive Personal Planning** — local-first learned productivity patterns (OFF by default)
- **AI Memory preferences** — explicit user-set preferences with clear authority hierarchy
- **Before/After proposal review** — see exactly what will change
- **Edit before Apply** — modify proposals inline before committing
- **"Why this suggestion?"** — explainability with Data Used transparency
- **Undo integration** — full Undo/Redo including TimeBlock restoration
- **Cancellation & stale-response protection** — AbortController + request generation
- **VI/EN AI error handling** — friendly bilingual error messages
- **Production hardening** — request IDs, rate limiting, token/message/timeout budgets, idempotency, concurrency protection
- **Privacy controls** — Adaptive Planning OFF by default, local adaptation, content-free feedback
- **Safe provider errors** — never exposes API keys, prompts, or raw provider content
- **PWA/offline** — deterministic planner remains fully functional offline

## Safety & Privacy

- AI suggestions do not mutate TaskFlow until the user explicitly applies them.
- Adaptive Planning is OFF by default — opt-in required.
- AI Memory and learned adaptation are separate stores.
- Reflection/Mood data are not included by default.
- Learned adaptation data is local-only and never sent to the provider.
- Feedback is local and content-free (no task titles, proposal text, or chat content).
- Provider/API secrets stay server-side.
- Normal operational logs do not contain prompts or personal TaskFlow context.

## Known Limitations

- In-memory rate limits are instance-local in serverless deployment (defense-in-depth, not a global quota).
- There is no durable cross-instance AI rate-limit quota.
- AI is unavailable offline.
- The deterministic planner remains fully usable offline without AI.

## Validation

- Unit tests: 2545 pass / 0 fail
- PR CI (run 32553584555): success — all 7 jobs green
- Main CI (run 32553589613): success — all 7 jobs green
- Chromium smoke: success
- Firefox smoke: success
- WebKit smoke: success
- Frontend E2E: success
- Offline PWA E2E: success
- Server security: success
- Sync: success
- Release assets: success
- P0: 0
- P1: 0
