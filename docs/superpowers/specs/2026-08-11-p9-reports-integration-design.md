# P9 Reports Integration Design

**Date:** 2026-08-11
**Status:** Approved
**Depends on:** Daily Reflection, Weekly Review, Monthly Review, pillars and metrics

## Goal

Bring the new growth and reflection data into the existing Reports experience using readable progress bars, factual rule-based guidance, and a unified reflection history.

## Scope

P9 adds Monthly Balance, strongest/needs-attention detail, non-judgmental rule recommendations, Daily/Weekly/Monthly reflection-history filters, and mood trend when sufficient data exists. It does not add AI, radar charts, complex search, or a new top-level navigation destination.

## Monthly Balance

The current monthly report modal receives a section with one row per scored visible pillar. Each row shows name, percentage, and an accessible progress bar. No scored pillars produces a concise empty state. Monthly Review calculations are the single source of truth.

## Rule-based Guidance

Rules operate only on real scorable metric percentages:

- `pct > 80`: a neutral message that the item is being maintained well.
- `pct < 40`: a neutral message that the item has been performed less often.
- `40 <= pct <= 80`: no recommendation.

Rules are deterministic, contain no AI labeling, and never infer intent, health, morality, or causation.

## Reflection History

`js/reflection-history.js` creates normalized entries from:

- daily records in `planner-reflections-daily`;
- `weeklyReviews` from every stored month key;
- `monthlyReview` from every stored month key.

Filters are Daily, Weekly, and Monthly. Entries sort newest first and open in a read/edit-capable detail surface by delegating to the owning feature where practical. Empty filters have explicit states. No full-text search is added.

## Mood Trend

Use daily reflection mood values as the primary source and the existing mood map only as a backward-compatible fallback. Show a simple chronological bar/line-free distribution and direction text only when at least three dated samples exist. Fewer samples show an honest empty state; no causal insight is generated.

## Architecture and UI

`js/report-insights.js` owns pure balance, recommendation, and mood-trend derivation. `js/reflection-history.js` owns collection, normalization, filtering, sorting, and rendering. `js/report-ui.js` composes these sections in the existing modal. A compact history control opens from Reports; no new main navigation item is created.

## Verification

Test score reuse, threshold boundaries, no-data behavior, non-AI copy, multi-month history collection, filters and sort order, malformed storage tolerance, mood sample threshold, accessible progress bars/tabs, i18n, responsive styling, focused E2E, and full regression.
