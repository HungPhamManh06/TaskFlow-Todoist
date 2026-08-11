# P4 Task and Focus Metric Integration Design

**Status:** Approved in conversation on 2026-08-11

**Goal:** Extend monthly metrics so TaskFlow can measure completed tasks and focused time that directly support a monthly metric, without duplicating tasks or focus sessions.

## Scope

P4 adds `TASK` and `FOCUS` metric types, lets a task link to multiple monthly metrics, shows those links in Task Detail, and calculates metric progress from existing task completion and task focus logs.

P4 does not add Daily Alignment, create-today actions, weekly or monthly reviews, report integration, or a second task/focus store. Those remain later phases.

## Architecture Decision

The relationship is stored on the task as `linkedMetricIds: string[]`.

This is preferred over storing task UIDs on each metric because the relationship travels with the task when it moves between days. It is preferred over tag-based matching because links are explicit and cannot accidentally match unrelated work.

A task may link to multiple metrics in its current month. A metric may aggregate any number of tasks.

## Data Model

### Task extension

```js
{
  uid: 'task-id',
  text: 'Fix reflection UI',
  done: false,
  linkedMetricIds: ['metric-taskflow', 'metric-deep-work'],
  focusLog: [
    { d: '2026-08-11', secs: 1500 }
  ]
}
```

`linkedMetricIds` is optional in stored legacy data and normalized to an empty array when read. Invalid, blank, and duplicate IDs are removed during normalization.

### Metric extension

```js
{
  id: 'metric-taskflow',
  pillarId: 'p2',
  title: 'TaskFlow',
  type: 'TASK',
  target: { mode: 'perMonth', value: 12 }
}
```

```js
{
  id: 'metric-deep-work',
  pillarId: 'p2',
  title: 'Deep Work',
  type: 'FOCUS',
  target: { mode: 'perMonth', value: 600 },
  unit: 'minutes'
}
```

The canonical FOCUS target unit is minutes. Existing HABIT, MANUAL, and CUSTOM metric records remain valid.

## Progress Rules

### TASK metrics

- Candidate tasks are all tasks in the metric's month whose `linkedMetricIds` contains the metric ID.
- `done` is the number of candidate tasks with `done === true`.
- `target` uses the metric target configuration. The P4 UI defaults new TASK metrics to `perMonth`.
- Progress is clamped to 100%, while the visible count may exceed the target.
- Deleting a linked task removes it naturally from the aggregate; no metric cleanup is required.

### FOCUS metrics

- Candidate tasks are all tasks in the metric's month whose `linkedMetricIds` contains the metric ID.
- Only `focusLog` entries whose date belongs to that same calendar month are included.
- Logged seconds are summed and converted to minutes using `Math.floor(totalSeconds / 60)`.
- The P4 UI defaults new FOCUS metrics to a monthly target measured in minutes.
- Focus time from unlinked tasks never contributes to the metric.

## Task Lifecycle Rules

- Moving a task to another day in the same month preserves `linkedMetricIds`.
- Moving a task to another month removes metric links because metric IDs are month-scoped.
- Carry-over and recurrence create a new task with no metric links unless a later phase explicitly defines cross-month carry-over.
- Duplicating a task creates a new task with no metric links to prevent unintended progress inflation.
- Inbox tasks cannot link to month metrics until they are scheduled into a month.
- Deleting or hiding a pillar does not mutate tasks. Links to missing metrics are ignored by calculations and omitted from Task Detail selections.

## User Interface

### Metric editor

The metric type selector adds `TASK` and `FOCUS`.

- TASK shows the normal target controls and a short explanation that completed linked tasks drive progress.
- FOCUS shows a monthly target input and the `minutes` unit. Habit selection is hidden.
- Changing away from HABIT clears `linkedHabitId`.

### Task Detail

Scheduled tasks show a `Linked monthly metrics` field containing the visible metrics for that task's month. It is a multi-select checkbox list grouped by pillar.

Each option shows the pillar icon, pillar name, and metric title. Changes save through the existing task-detail persistence path and refresh the current view. Inbox Task Detail shows a short instruction to schedule the task before linking it.

### Metric card

- TASK rows display `completed / target tasks`.
- FOCUS rows display focused minutes against target minutes, using the existing progress bar.
- HABIT, MANUAL, and CUSTOM rows keep their current presentation.

## Migration and Compatibility

Migration is additive and idempotent:

1. Existing tasks without `linkedMetricIds` behave as if the field were `[]`.
2. Existing metrics keep their current normalized representation.
3. Unknown metric types continue to fall back safely according to the module's compatibility rules; P4 adds TASK and FOCUS to the recognized set.
4. Month state remains stored under the existing `planner-*` keys. The backend syncs whole JSON values, so no database migration is required.
5. JSON export, restore, backup, and cloud sync automatically include the new fields.

No old reflection, goal, task, habit, focus-log, or monthly metric data is removed.

## Error Handling

- Missing metric IDs are ignored during aggregation and display.
- Malformed `linkedMetricIds` normalize to an empty, unique string array.
- Missing or malformed `focusLog` entries contribute zero.
- A deleted linked metric leaves harmless stale IDs on tasks; normalization and Task Detail omit them. A later save may prune stale IDs, but correctness does not depend on cleanup.
- Empty task sets and empty focus logs produce `0`, never `NaN`.

## Testing Strategy

Unit tests cover:

- task-link normalization and duplicate removal;
- TASK aggregation across multiple linked tasks;
- completed, incomplete, deleted, and unrelated tasks;
- FOCUS aggregation from only linked tasks and only dates in the selected month;
- second-to-minute conversion and empty/malformed logs;
- progress targets and 100% clamping;
- same-month move preservation and copy/recurrence link clearing;
- additive migration from legacy month state;
- metric editor, Task Detail, i18n, service-worker, and minified-bundle wiring.

Browser verification covers creating TASK and FOCUS metrics, linking multiple tasks, completing a task, recording focus, immediate progress updates, mobile Task Detail usability, dark mode, reload persistence, and no console errors.

Full regression includes all Node tests, the existing frontend E2E suite, mobile QA, accessibility checks, minification consistency, and a reviewed git diff.

## Acceptance Criteria

- A TASK metric aggregates every completed task explicitly linked to it.
- A FOCUS metric aggregates focus time only from explicitly linked tasks.
- One task can link to multiple metrics.
- Existing tasks and metrics load without data loss.
- Moving a task within its month preserves links; copying or carrying it to another month does not.
- Task Detail provides an accessible, mobile-usable link editor.
- Existing task, habit, focus, reflection, sync, import/export, PWA, dark-mode, and i18n behavior does not regress.
