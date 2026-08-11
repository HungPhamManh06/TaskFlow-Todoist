# P8 Next Month Carry-over Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preview and apply an explicit, non-destructive selection of planning structures to the next month.

**Architecture:** A pure carry-over module builds preview operations and applies them with collision-safe ID maps. app.js owns dialog state, storage, and navigation only.

**Tech Stack:** Vanilla JavaScript, Node test runner, existing modal API, localStorage month-state adapter, Playwright E2E.

## Global Constraints

- Default every carry option to unselected.
- Never copy tasks or progress/history fields.
- Never overwrite existing destination records.
- Block selected HABIT metrics whose required habit is not selected or already present.

---

### Task 1: Pure preview and carry engine

**Files:** Create `js/month-carryover.js`; create `tests/phase18-month-carryover.test.mjs`.

**Interfaces:**
- Produces: `nextMonth(y,m)`, `normalizeCarrySelection(raw)`, `buildCarryPreview(source,destination,selection,context)`, `applyCarryover(source,destination,selection,context)`.

- [ ] Write RED tests for December rollover, empty selection, exact copies, reset fields, equivalent-item skip, collision remap, habit dependency validation, destination immutability, idempotency, and malformed source.

```js
test('carry remaps linked habits and resets progress', () => {
  const result = applyCarryover(source, destination, selection, { id: sequenceIds() });
  assert.deepEqual(result.state.habits[0].days, Array(31).fill(false));
  assert.equal(result.state.pillars[0].metrics[0].linkedHabitId, result.state.habits[0].id);
  assert.deepEqual(result.state.pillars[0].metrics[0].days, Array(31).fill(false));
});
```

- [ ] Run RED: `node --test tests/phase18-month-carryover.test.mjs`.
- [ ] Implement minimal pure engine; clone inputs and return `{ ok, state, preview, errors, idMap }`.
- [ ] Run GREEN and P3/P4 regressions.
- [ ] Commit: `feat(planning): add safe month carry-over engine`.

### Task 2: Selection/preview dialog and persistence

**Files:** Modify `app.html`, `js/app.js`, `js/monthly-review.js`, `js/i18n.js`, both source stylesheets, and P8 tests.

**Interfaces:** app dispatcher actions `month-carry-open`, `month-carry-toggle`, `month-carry-apply`, `month-carry-close`.

- [ ] Write failing tests for accessible dialog, unselected controls, dependency error, preview list, apply/save destination, storage error, and no task copy.
- [ ] Run RED.
- [ ] Add launcher after Monthly Review, render dialog from pure preview, persist through `saveMonthState(next.y,next.m,result.state)`, and show success/error toast.
- [ ] Add responsive one-column layout and VI/EN copy.
- [ ] Run GREEN: P8 plus P7 and frontend tests.
- [ ] Commit: `feat(planning): add next month carry-over dialog`.

### Task 3: Production/E2E checkpoint

- [ ] Add `month-carryover.min.js`, app/cache version bumps, and focused E2E scenario.
- [ ] E2E must select a pillar/focus/habit/HABIT metric, preview, apply, reload next month, verify remapped link and reset progress, verify existing destination item unchanged, and verify zero copied tasks.
- [ ] Run minifier, focused E2E, full unit suite, sync tests, mobile overflow assertion, and diff check.
- [ ] Commit: `feat(planning): ship next month carry-over`.
