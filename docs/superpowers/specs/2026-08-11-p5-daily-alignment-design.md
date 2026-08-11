# P5 Daily Alignment Design

**Date:** 2026-08-11  
**Status:** Approved design  
**Depends on:** P2 Monthly Pillars, P3 Monthly Metrics, P4 Task/Focus Metric Integration

## Goal

Add a compact Daily Alignment section to Today so users can see which real tasks and habits move their monthly pillars forward. The section must reuse existing task, habit, pillar, and metric data. It must not create a second checklist or persist duplicate completion state.

## Scope

P5 includes:

- deriving today's aligned tasks and habits from current month state;
- grouping aligned items by visible pillar;
- toggling the real task or habit through existing application actions;
- immediate UI synchronization after completion changes;
- responsive, dark-mode, accessible, Vietnamese, and English presentation;
- unit, integration, migration, and browser coverage.

P5 excludes:

- creating tasks from Monthly Goals;
- linking weekly or year goals;
- weekly or monthly reviews;
- new persistence or sync fields;
- recommendations or AI behavior.

## Architecture

Create `js/alignment.js` as a focused module exposed as `window.TaskFlowAlignment`. It owns pure collection helpers and the Daily Alignment card renderer. `js/today.js` remains responsible for composing the Today page and calls the alignment module with the current month state and today's calendar context.

The module is loaded before `js/today.js` and included in the service-worker app shell. Source and minified siblings remain synchronized through the existing minification workflow.

This boundary keeps relationship logic reusable for later Weekly and Monthly Review phases without mixing it into the pillar CRUD module or expanding the Today module with domain calculations.

## Derived Data Model

Daily Alignment is computed at render time and adds no stored schema.

The collector receives:

- current month `state`;
- today's week/day position and month-day index;
- translation and escaping dependencies only for rendering.

It returns ordered groups shaped conceptually as:

```js
[
  {
    pillar: { id, name, icon },
    items: [
      { kind: 'task', task, week, day, taskIndex },
      { kind: 'habit', habit, dayIndex }
    ]
  }
]
```

These objects contain references and coordinates for existing entities; they do not copy completion data into localStorage.

## Eligibility Rules

Only visible pillars participate. Their existing order determines group order.

- `HABIT` metric: include its linked habit when the habit exists and today is not in `skipDays`.
- `TASK` metric: include today's scheduled tasks whose `linkedMetricIds` contains the metric id.
- `FOCUS` metric: include today's scheduled tasks whose `linkedMetricIds` contains the metric id, because the real task is the actionable entry point for that focus metric.
- `MANUAL` and `CUSTOM` metrics: omit them because they do not reference a real task or habit.
- Deleted or malformed metric links are ignored without throwing.
- A task or habit linked through multiple metrics in the same pillar appears once in that pillar.
- A task or habit linked to metrics in different pillars appears once under every related pillar. All appearances still point to the same underlying entity.
- When Today is opened while viewing another month, the card renders an unavailable/empty state rather than mapping today's date into the wrong month.

## UI and Interaction

The card appears immediately below the Today header and above the existing task/habit/focus grid. It is intentionally smaller than the main Today task card.

Each pillar group contains its icon, name, completed/total count, and aligned rows. Rows use the existing checkbox helper and existing actions:

- task rows dispatch `data-action="task"` with the real week/day/task coordinates;
- habit rows dispatch `data-action="habit"` with the real habit id and month-day index.

No new toggle handler is introduced. Existing Today rerender behavior after task and habit toggles updates every repeated reference immediately, including the same task shown under multiple pillars.

Desktop uses compact responsive groups. Mobile stacks pillar groups vertically, maintains at least 44px checkbox hit areas, and does not require horizontal scrolling. Dark mode uses existing semantic color tokens.

If no aligned item exists, the card remains small and explains that users can link a scheduled task from Task Detail or link a habit through a monthly metric. It does not create data automatically.

## Accessibility and Internationalization

- The card is a labeled region with an `h2` following the Today page `h1`.
- Each pillar group has an accessible name.
- Completion counts are textual and do not rely on color.
- Checkboxes reuse the existing accessible checkbox label helper.
- Focus-visible behavior and 44px mobile targets match existing Today controls.
- All visible strings use `TaskFlowI18N` keys in Vietnamese and English.

## Error Handling and Compatibility

The collector treats absent pillars, metrics, weeks, days, tasks, habits, malformed arrays, deleted habits, and stale metric ids as empty inputs. Rendering must never mutate state.

Because P5 adds no persisted data:

- no localStorage migration is required;
- cloud sync payloads remain unchanged;
- JSON import/export and backup formats remain unchanged;
- legacy month states continue to render with an empty alignment card;
- P4 `linkedMetricIds` normalization remains the source of truth for task links.

## Testing

Unit tests cover:

- linked task inclusion and unlinked task exclusion;
- linked habit inclusion and skipped-day exclusion;
- TASK and FOCUS task sources;
- MANUAL/CUSTOM omission;
- deduplication within a pillar;
- repeated display across different pillars;
- hidden pillar exclusion;
- stale links and malformed legacy state.

Integration assertions cover script order, service-worker precache, i18n keys, semantic markup, and existing dispatcher reuse.

The browser scenario will:

1. create or seed linked task/habit metrics;
2. open Today and verify grouping by pillar;
3. verify unlinked items do not appear;
4. toggle a repeated cross-pillar task and confirm every reference updates;
5. toggle a linked habit and confirm metric/Today synchronization;
6. reload and confirm state remains correct;
7. run desktop and mobile layouts, dark mode, no horizontal overflow, and no console errors.

Full unit, sync, minify, Chromium E2E, mobile QA, accessibility, and critical-CSS regression suites run before completion.

## Acceptance Criteria

- Today shows a compact Daily Alignment card grouped by visible monthly pillar.
- Only real linked tasks and habits appear.
- Unlinked tasks and habits never appear in the card.
- A cross-pillar linked item appears under every related pillar without duplicating stored data.
- Completing any aligned row updates the underlying task or habit and all rendered references immediately.
- Legacy data, sync, export/import, mobile, dark mode, and existing Today behavior do not regress.
