# P7 Monthly Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a truthful, structured Monthly Review to the existing report modal.

**Architecture:** A pure UMD module owns schema normalization, monthly score derivation, and rendering. The report module composes it; app.js only supplies state/context and delegated autosave.

**Tech Stack:** Vanilla JavaScript UMD/CommonJS, Node test runner, Playwright Python E2E, existing CSS/i18n/service worker pipeline.

## Global Constraints

- Preserve `state.reflections.overview` without semantic remapping.
- TASK/FOCUS scores count only tasks linked to the metric.
- No AI calls or fabricated insights.
- Use TDD for every production behavior.

---

### Task 1: Monthly review schema and score model

**Files:**
- Create: `js/monthly-review.js`
- Create: `tests/phase17-monthly-review.test.mjs`

**Interfaces:**
- Produces: `emptyMonthlyReview()`, `normalizeMonthlyReview(raw)`, `ensureMonthlyReview(state)`, `monthlyPillarScores(state, context)`, `buildMonthlyReviewModel(state, context)`.

- [ ] **Step 1: Write failing schema/model tests**

```js
test('monthly review migration is additive', () => {
  const state = { reflections: { overview: ['legacy'] } };
  ensureMonthlyReview(state);
  assert.equal(state.monthlyReview.achievement, '');
  assert.deepEqual(state.reflections.overview, ['legacy']);
});

test('monthly scores use only scorable metric progress', () => {
  const model = buildMonthlyReviewModel(fixture, context);
  assert.equal(model.pillars[0].pct, 75);
  assert.equal(model.pillars[0].strongest.title, 'Gym');
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/phase17-monthly-review.test.mjs`
Expected: FAIL because `js/monthly-review.js` does not exist.

- [ ] **Step 3: Implement minimal pure model**

Use `TaskFlowPillars.metricProgress(metric, state, context)` for every metric, stable-sort only by original order, omit unscorable values, and preserve unknown review fields.

- [ ] **Step 4: Run GREEN and metric regressions**

Run: `node --test tests/phase17-monthly-review.test.mjs tests/phase13-metrics.test.mjs tests/phase14-task-focus-metrics.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

Run: `git add js/monthly-review.js tests/phase17-monthly-review.test.mjs && git commit -m "feat(review): derive monthly review model"`

### Task 2: Renderer, state migration, and autosave

**Files:**
- Modify: `js/monthly-review.js`
- Modify: `js/report-ui.js`
- Modify: `js/app.js`
- Modify: `js/i18n.js`
- Modify: `css/styles.css`
- Modify: `css/styles-deferred.css`
- Modify: `tests/phase17-monthly-review.test.mjs`

**Interfaces:**
- Produces: `monthlyReviewHTML(model, options)`, `updateMonthlyReviewField(state, field, value, updatedAt)`.
- Consumes: `buildMonthlyReviewModel`, existing `saveSoon`, `t`, `esc`, and report modal lifecycle.

- [ ] **Step 1: Write failing renderer/integration tests**

```js
test('monthly review renders five labeled fields and legacy notes', () => {
  const html = monthlyReviewHTML(model, { t, esc });
  assert.match(html, /data-monthly-review-field="achievement"/);
  assert.match(html, /data-monthly-review-field="start"/);
  assert.match(html, /monthly-review-legacy/);
});
```

Add static assertions for default/empty/load/save migration and delegated `input` handling.

- [ ] **Step 2: Run RED**

Run: `node --test tests/phase17-monthly-review.test.mjs`
Expected: FAIL on missing renderer and integration.

- [ ] **Step 3: Implement renderer and composition**

Render semantic progress bars, honest empty state, five fields, polite save status, and collapsed legacy notes. Call `ensureMonthlyReview` in default, empty, load, cross-month load, and save paths.

- [ ] **Step 4: Add VI/EN and mirrored responsive CSS**

Use semantic tokens; at `max-width: 600px`, stack summary, pillar, and reflection grids to one column.

- [ ] **Step 5: Run GREEN**

Run: `node --test tests/phase17-monthly-review.test.mjs tests/phase9-frontend.test.mjs`
Expected: all pass.

- [ ] **Step 6: Commit**

Run: `git add js/monthly-review.js js/report-ui.js js/app.js js/i18n.js css/styles.css css/styles-deferred.css tests/phase17-monthly-review.test.mjs && git commit -m "feat(review): render monthly review workflow"`

### Task 3: Production assets and browser verification

**Files:**
- Modify: `app.html`, `sw.js`, `scripts/e2e-frontend.py`
- Create: `js/monthly-review.min.js`
- Modify generated minified siblings and audit docs.

- [ ] Write failing asset/E2E contract tests for script order, version bumps, cache entry, and `monthly-review` focused view.
- [ ] Run RED with `node --test tests/phase17-monthly-review.test.mjs`.
- [ ] Add E2E data fixture verifying score truth, five-field persistence, legacy disclosure, reload, mobile overflow, and dark mode.
- [ ] Generate/check minified files with `python scripts/minify.py` and `python scripts/minify.py --check`.
- [ ] Run focused E2E: `python scripts/e2e-frontend.py --view monthly-review`.
- [ ] Run unit regression: `node --test tests/*.test.mjs`.
- [ ] Commit: `git commit -m "feat(review): ship monthly review"` with only P7 production/generated/test/audit files staged.
