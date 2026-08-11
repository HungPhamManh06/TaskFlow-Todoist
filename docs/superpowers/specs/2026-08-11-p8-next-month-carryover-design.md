# P8 Next Month Carry-over Design

**Date:** 2026-08-11
**Status:** Approved
**Depends on:** P7 monthly review and the current month-state storage model

## Goal

Let the user explicitly choose which planning structures to carry into the next month, preview the result, and create it without copying progress, tasks, or overwriting destination data.

## Scope

P8 includes a carry-over launcher at the end of Monthly Review, a selection/preview dialog, selectable pillars, Monthly Focus, habits, and metrics, safe ID remapping, destination conflict handling, persistence, Vietnamese/English copy, responsive styling, and tests.

P8 never carries tasks, completion history, habit streak history, skipped days, manual metric day marks, focus logs, weekly reviews, or monthly reflection answers.

## Selection Model

The dialog starts with every item unselected. A pillar can be selected independently. Within it, focus and each metric are separate choices. Habits referenced by selected HABIT metrics are shown and can be selected. If a selected metric requires a habit that is not selected, creation blocks with a clear validation message rather than silently breaking the link.

The preview lists exactly what will be created and what will be skipped because the destination already contains an equivalent item.

## Carry Rules

- Destination is the next calendar month, including December to January rollover.
- Existing destination records are never overwritten.
- Equivalent pillar, habit, and metric detection uses normalized names plus type within the appropriate scope.
- New records receive collision-safe IDs. A source-to-destination ID map updates every selected metric's `linkedHabitId`.
- Copied pillars retain name, icon, hidden state only when explicitly selected, and selected focus text.
- Copied habits retain descriptive configuration but reset `days`, `skipDays`, streak-derived state, reminders, and completion history.
- Copied metrics retain title, type, target, and a remapped habit link, but reset manual `days` and accumulated progress.
- TASK/FOCUS metric definitions may be copied, but no task is copied and therefore they begin with no linked destination tasks.
- Existing destination pillars/habits/metrics stay byte-for-byte unchanged.

## Architecture

`js/month-carryover.js` owns pure selection normalization, preview construction, equivalence checks, cloning, ID remapping, and `applyCarryover(source, destination, selection, context)`. `js/app.js` supplies source/destination states, opens the dialog, persists the destination through `saveMonthState`, and navigates only after successful creation.

## Error Handling and Compatibility

Invalid or malformed source records are skipped and reported in the preview. Missing required habit links block creation. Storage failure leaves the active month and destination unchanged and shows an error toast. The operation is deterministic and idempotent for the same destination because equivalent items are skipped.

## Verification

Test month/year rollover, default-unselected behavior, exact selection, reset rules, ID collisions and habit-link remapping, destination preservation, idempotency, validation failure, malformed legacy input, dialog semantics, mobile layout, E2E preview/apply/reload, and regression coverage.
