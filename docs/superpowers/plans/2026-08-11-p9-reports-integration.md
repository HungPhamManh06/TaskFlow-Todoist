# P9 Reports Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate balance, factual recommendations, reflection history, and mood trend into Reports.

**Architecture:** `report-insights.js` derives report-only data. `reflection-history.js` normalizes multi-store entries. `report-ui.js` composes both into existing report surfaces.

**Tech Stack:** Vanilla JavaScript, localStorage adapters, existing reflection/review modules, Node tests, Playwright.

## Global Constraints

- No AI calls or AI labels.
- Recommendations only for real values above 80 or below 40.
- No radar chart or new top-level navigation.
- Mood direction requires at least three dated samples.

---

### Task 1: Balance, recommendations, and mood trend

**Files:** Create `js/report-insights.js`; create `tests/phase19-reports-integration.test.mjs`.

**Interfaces:** `monthlyBalance(model)`, `metricRecommendations(model)`, `moodTrend(entries)`.

- [ ] Write RED boundary tests for 39/40/80/81, no-data, stable ordering, non-judgmental message keys, and 2-vs-3 mood samples.
- [ ] Run RED.
- [ ] Implement pure derivation returning message keys, never prose generated from user data.
- [ ] Run GREEN.
- [ ] Commit: `feat(reports): derive balance and reflection insights`.

### Task 2: Unified reflection history

**Files:** Create `js/reflection-history.js`; extend P9 tests.

**Interfaces:** `collectReflectionHistory(storage, options)`, `filterHistory(entries,type)`, `reflectionHistoryHTML(model,options)`.

- [ ] Write RED tests using an in-memory Storage-shaped fixture with daily, weekly, monthly, malformed, and multiple-month records.

```js
assert.deepEqual(entries.map((entry) => entry.type), ['monthly', 'weekly', 'daily']);
assert.equal(filterHistory(entries, 'weekly').length, 1);
```

- [ ] Implement planner-key enumeration, normalized dates/labels/excerpts, newest-first sorting, filters, accessible tab buttons, and empty states.
- [ ] Run GREEN and Daily/Weekly/Monthly review regressions.
- [ ] Commit: `feat(reports): unify reflection history`.

### Task 3: Report UI, production assets, and E2E

**Files:** Modify `js/report-ui.js`, `js/app.js`, `app.html`, `js/i18n.js`, CSS sources, `sw.js`, E2E, minified files, and audit docs.

- [ ] Write RED static/integration tests for accessible balance bars, rule labels, history filters, mood empty/data states, asset order/cache, and E2E matrix registration.
- [ ] Compose sections in the existing report modal and a compact history panel; delegate filter/detail actions.
- [ ] Add VI/EN and mobile/dark styles.
- [ ] Add focused E2E for balance truth, threshold copy, three history filters, mood trend, reload, dark mode, and overflow.
- [ ] Run minify check, full unit suite, focused E2E, mobile QA, accessibility, and critical CSS.
- [ ] Commit: `feat(reports): integrate growth and reflection data`.
