# P7 Monthly Review Design

**Date:** 2026-08-11
**Status:** Approved
**Depends on:** P2 pillars, P3 metrics, P4 task/focus metrics, P6 weekly review

## Goal

Add a truthful month-end review to the existing monthly report. It summarizes real pillar progress and stores a structured Continue / Stop / Start reflection without replacing legacy month reflections.

## Scope

P7 includes monthly summary, pillar scores, strongest and needs-attention metrics, five reflection fields, autosave, legacy-note display, Vietnamese/English copy, responsive styling, migration, unit tests, and focused browser coverage.

P7 does not copy data into another month, change reports outside the monthly modal, add AI recommendations, or change sync/export contracts.

## Data Model

Month state gains an additive record:

```js
monthlyReview: {
  achievement: '',
  learned: '',
  continue: '',
  stop: '',
  start: '',
  updatedAt: ''
}
```

`ensureMonthlyReview(state)` normalizes known fields while preserving unknown forward-compatible fields. Existing `state.reflections.overview` remains unchanged and is rendered in a collapsed legacy section when it contains answers.

## Calculation Rules

- Reuse the monthly metric calculation rules from `TaskFlowPillars.metricProgress`.
- Score each visible pillar as the rounded average percentage of its scorable metrics.
- Overall is the rounded average of scored visible pillars. If none can be scored, overall is unavailable rather than a fabricated zero.
- Strongest and needs-attention are the highest and lowest scorable metric within a pillar. Ties keep stable metric order.
- Blank, stale, unsupported, and unscorable metrics do not generate insights.
- TASK and FOCUS continue to count only tasks linked to the relevant metric.

## UI and Data Flow

`js/monthly-review.js` is a UMD/CommonJS-compatible module with pure model helpers and a renderer. `js/report-ui.js` composes its HTML inside the existing monthly report modal. Delegated input handling in `js/app.js` updates the current month state and uses the existing debounced save path.

The review remains writable when activity data is missing. The summary shows an honest empty-state message. Save status uses a polite live region. Mobile stacks all fields into one column; dark mode uses existing semantic tokens.

## Compatibility and Privacy

Migration is additive and idempotent. No legacy data is deleted or semantically remapped. Review text stays in the same local month-state key and therefore follows the same local storage, backup, and optional cloud-sync behavior as task data. No content is sent to AI or third-party APIs.

## Verification

Cover normalization, empty data, pillar scoring, real strongest/attention selection, linked TASK/FOCUS filtering, renderer semantics, legacy notes, autosave, i18n, responsive CSS, production asset order/cache, focused E2E, and the full existing regression suite.
