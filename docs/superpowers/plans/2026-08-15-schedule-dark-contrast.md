# Schedule Dark Contrast Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Schedule theme-driven and accessible in every theme, limit the initial unscheduled list to five tasks, and hide the empty legend capsule without changing Calendar geometry or Task/TimeBlock behavior.

**Architecture:** Keep `unscheduledTasksForDate()` and TimeBlock persistence unchanged. Add an `expanded` presentation option to the pure Time Blocking renderer, own one ephemeral boolean in Calendar orchestration, migrate only Time Blocking CSS to semantic tokens, and retain the stable Calendar shell while hiding an empty legend visually.

**Tech Stack:** Static HTML, CSS custom properties, vanilla JavaScript UMD modules, Node test runner, Python Playwright, CSO/terser minification, service-worker precache, GitHub Actions, Vercel.

## Global Constraints

- Do not redesign Schedule or modify Task/TimeBlock schemas, derivation, storage, or sync.
- Do not add global legacy-token aliases or a private Schedule palette.
- Preserve the shared segmented-control geometry and stable Calendar shell/DOM identity.
- `INITIAL_VISIBLE` is exactly `5`; expansion is ephemeral and resets on selected-day navigation.
- Provide Vietnamese `Xem thêm {n} việc` / `Thu gọn` and English `Show {n} more` / `Collapse`.
- Use `aria-expanded` and `aria-controls`; preserve keyboard access and the existing focus-visible ring.
- Keep the third Calendar header grid column; do not use `display: none` for the empty legend.
- Normal text contrast is at least 4.5:1; qualifying large text and interactive boundaries/states are at least 3:1.
- Preserve user-owned changes in `docs/a11y-audit.md`, `docs/mobile-qa.md`, and `scripts/__pycache__/` unless a QA command intentionally refreshes the two reports; do not stage those pre-existing edits.

## File map

- `js/timeblocks-ui.js`: pure Schedule HTML and five-row disclosure.
- `js/i18n.js`: Vietnamese and English disclosure strings.
- `js/app.js`: ephemeral expansion state and delegated disclosure/day-navigation actions.
- `css/styles.css`: semantic Time Blocking colors, responsive disclosure styling, and empty-legend rule.
- `css/_v12-timeblocks-ui.css`: maintain the feature stylesheet source in sync with the Time Blocking section.
- `tests/phase26-timeblocks-ui.test.mjs`: pure renderer and derivation regressions.
- `tests/phase9-frontend.test.mjs`: source-architecture and stable-shell CSS/JS regressions.
- `scripts/e2e-frontend.py`: disclosure, Quick Schedule, DOM identity, responsive, and visual-state checks.
- `scripts/audit-dark-contrast.py`: dynamic Schedule seed and computed contrast measurements.
- `css/styles-critical.css`, `css/styles-deferred.css`: regenerated split CSS.
- `*.min.js`, `*.min.css`: regenerated production assets.
- `app.html`, `sw.js`: exact version pins and cache generation.

---

### Task 1: Pure five-row disclosure renderer and bilingual copy

**Files:**
- Modify: `tests/phase26-timeblocks-ui.test.mjs`
- Modify: `js/timeblocks-ui.js`
- Modify: `js/i18n.js`

**Interfaces:**
- Consumes: `unscheduledTasksForDate(args): Task[]` unchanged.
- Produces: `INITIAL_VISIBLE = 5`; `unscheduledSectionHTML(tasks, dateIso, expanded = false): string`; `scheduleViewHTML({... , unscheduledExpanded = false}): string`.

- [ ] **Step 1: Write failing pure-renderer tests**

Add i18n stubs `tbUnsShowMore: 'Show {n} more'` and `tbUnsCollapse: 'Collapse'`, then add:

```js
test('unscheduledSectionHTML: 10 tasks show five rows then accessible disclosure', () => {
  const tasks = Array.from({ length: 10 }, (_, i) => ({ uid: `u${i}`, text: `Task ${i + 1}` }));
  const html = UI.unscheduledSectionHTML(tasks, '2026-08-15');
  assert.equal((html.match(/class="tb-uns-row"/g) || []).length, 5);
  assert.match(html, /data-action="tb-uns-toggle"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="tb-uns-list-2026-08-15"/);
  assert.match(html, /Show 5 more/);
  assert.doesNotMatch(html, /Task 6/);
});

test('unscheduledSectionHTML: expanded renders all rows and collapse control', () => {
  const tasks = Array.from({ length: 10 }, (_, i) => ({ uid: `u${i}`, text: `Task ${i + 1}` }));
  const html = UI.unscheduledSectionHTML(tasks, '2026-08-15', true);
  assert.equal((html.match(/class="tb-uns-row"/g) || []).length, 10);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /Collapse/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/phase26-timeblocks-ui.test.mjs`

Expected: FAIL because all ten rows render and `tb-uns-toggle` is absent.

- [ ] **Step 3: Implement the minimal pure rendering change**

In `js/timeblocks-ui.js`, define `const INITIAL_VISIBLE = 5;`, slice only presentation rows, generate a date-stable list id, and append:

```js
const visibleTasks = expanded ? tasks : tasks.slice(0, INITIAL_VISIBLE);
const remaining = Math.max(0, tasks.length - INITIAL_VISIBLE);
const listId = `tb-uns-list-${dateIso}`;
const disclosure = tasks.length > INITIAL_VISIBLE
  ? `<button type="button" class="pop-btn tb-uns-toggle" data-action="tb-uns-toggle"
      aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${esc(listId)}">
      ${esc(expanded ? t('tbUnsCollapse') : t('tbUnsShowMore', { n: remaining }))}</button>`
  : '';
```

Render `visibleTasks`, set `id` on `.tb-uns-list`, pass `unscheduledExpanded` from `scheduleViewHTML`, and export `INITIAL_VISIBLE`. Add the exact VI/EN strings to both dictionaries in `js/i18n.js`.

- [ ] **Step 4: Verify GREEN and unchanged derivation tests**

Run: `node --test tests/phase26-timeblocks-ui.test.mjs`

Expected: all Phase 26 tests pass, including cancelled-only and completed-task derivation cases.

- [ ] **Step 5: Commit the renderer unit**

```powershell
git add -- tests/phase26-timeblocks-ui.test.mjs js/timeblocks-ui.js js/i18n.js
git commit -m "feat(schedule): add unscheduled disclosure"
```

---

### Task 2: Ephemeral Calendar expansion state and functional regression

**Files:**
- Modify: `scripts/e2e-frontend.py`
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `scheduleViewHTML({ unscheduledExpanded })` and `[data-action="tb-uns-toggle"]` from Task 1.
- Produces: `calendarUnscheduledExpanded: boolean`, reset by `tb-day`, `tb-prev`, `tb-next`, and `tb-today`.

- [ ] **Step 1: Extend the Schedule E2E scenario to ten unscheduled tasks**

In `schedule_unscheduled_checks`, seed nine real tasks on today, including one priority task, and no initial TimeBlock. Preserve the existing real Quick Add flow so `Test Schedule Task` becomes the tenth task. After save, assert:

```python
rows = page.locator('[data-testid="tb-unscheduled"] .tb-uns-row')
assert rows.count() == 5
toggle = page.locator('[data-action="tb-uns-toggle"]')
assert toggle.get_attribute('aria-expanded') == 'false'
assert '5' in toggle.inner_text()
toggle.click()
assert rows.count() == 10
assert toggle.get_attribute('aria-expanded') == 'true'
toggle.click()
assert rows.count() == 5
```

Keep the existing Quick Schedule flow, expand and target `Test Schedule Task`, then verify saving its block reduces the collection to nine without creating duplicates. Capture the `.cal-mode-toggle` element handle before Month/Schedule switches and assert `page.evaluate('(node) => node === document.querySelector(".cal-mode-toggle")', handle)` remains true.

- [ ] **Step 2: Run the focused E2E and verify RED**

Run: `python scripts/e2e-frontend.py --view schedule-unscheduled --browser chromium`

Expected: FAIL because the disclosure click has no app-level handler and expansion state is not passed to the renderer.

- [ ] **Step 3: Implement Calendar-only ephemeral state**

Near `calendarMode`/`calendarSelDate`, add:

```js
let calendarUnscheduledExpanded = false;
```

Pass it as `unscheduledExpanded` from `renderCalendarSchedule()`. Add delegated handling:

```js
} else if (act === 'tb-uns-toggle') {
  calendarUnscheduledExpanded = el.getAttribute('aria-expanded') !== 'true';
  renderCalendarSchedule();
```

Set `calendarUnscheduledExpanded = false` before every selected-day mutation in `tb-day`, `tb-prev`, `tb-next`, and `tb-today`. Do not touch localStorage or the TimeBlock store.

- [ ] **Step 4: Verify GREEN and the existing Quick Schedule transition**

Run: `python scripts/e2e-frontend.py --view schedule-unscheduled --browser chromium`

Expected: PASS with 5→10→5 rows, correct dialog task/date/duration, saved task leaving Unscheduled, one timeline block, and stable toggle identity.

- [ ] **Step 5: Commit orchestration and E2E behavior**

```powershell
git add -- js/app.js scripts/e2e-frontend.py
git commit -m "test(schedule): cover disclosure workflow"
```

---

### Task 3: Semantic Schedule colors and invisible empty legend

**Files:**
- Modify: `tests/phase9-frontend.test.mjs`
- Modify: `css/styles.css`
- Modify: `css/_v12-timeblocks-ui.css`
- Modify: `scripts/audit-dark-contrast.py`

**Interfaces:**
- Consumes: semantic tokens from `css/tokens.css`.
- Produces: Time Blocking rules with no undefined legacy tokens or light fallback literals; `.calendar-page .cal-legend:empty` that preserves layout.

- [ ] **Step 1: Write failing source-architecture tests**

Add a test that extracts the `/* ===== Time Blocking UI` section through the next feature marker and checks:

```js
const styles = readRequiredAsset('css/styles.css');
const timeBlocking = styles.slice(styles.indexOf('/* ===== Time Blocking UI'), styles.indexOf('/* V1.4'));
for (const legacy of ['--surface-soft', '--text-strong', '--text-faint', '--border-soft', '--border-faint', '--accent', '--sage', '--warn-text', '--warn-soft']) {
  assert.doesNotMatch(timeBlocking, new RegExp(`var\\(${legacy}`));
}
assert.match(styles, /\.calendar-page \.cal-legend:empty\s*{/);
assert.match(styles, /visibility:\s*hidden/);
assert.doesNotMatch(styles, /\.calendar-page \.cal-legend:empty[^}]*display:\s*none/s);
```

- [ ] **Step 2: Add the failing dynamic Schedule contrast audit**

Add `PAIRS_SCHEDULE` entries for nav/date/day text, unscheduled heading/count/row/text/duration/button, hour labels, block time/text, and interactive borders. Seed at least four unscheduled tasks (one priority) plus one planned TimeBlock in localStorage before navigating to Calendar Schedule. Resolve translucent/composited backgrounds to their actual ancestor surface before calculating contrast.

- [ ] **Step 3: Run both regressions and verify RED**

Run:

```powershell
node --test --test-name-pattern="Schedule semantic colors" tests/phase9-frontend.test.mjs
python scripts/audit-dark-contrast.py
```

Expected: the source test fails on legacy variables/missing empty-legend rule, and the dynamic audit reports Schedule contrast failures caused by light fallbacks.

- [ ] **Step 4: Migrate the Time Blocking section locally**

Apply the approved mapping in both CSS sources:

```css
.tb-unscheduled { background: var(--color-surface-muted); border-color: var(--color-border); }
.tb-uns-heading { color: var(--color-text-secondary); }
.tb-uns-count, .tb-uns-dur { color: var(--color-text-muted); }
.tb-uns-row { background: var(--color-surface); border-color: var(--color-border); }
.tb-uns-text { color: var(--color-text); }
.tb-uns-dot.regular { background: var(--color-text-muted); }
.tb-uns-dot.priority { background: var(--color-accent); }
.tb-uns-toggle { align-self: center; justify-content: center; margin-top: 4px; }
```

Use `--color-text`, `--color-text-secondary`, `--color-text-muted`, `--color-surface`, `--color-surface-muted`, `--color-border`, `--color-control-border`, `--color-accent`, `--color-accent-soft`, `--color-positive`, `--color-warning`, and `--color-danger` throughout `.tb-*` and `.td-tb-*`. Use `color-mix(in srgb, var(--color-border) 70%, transparent)` for faint timeline/row rules and semantic `color-mix()` expressions for warning/danger soft backgrounds. Replace cancelled/missing hard-coded colors with muted/danger semantic colors.

Keep `.tb-uns-btn` visually secondary: semantic surface/transparent background, control border, normal text, accent-soft hover, and existing focus ring. Preserve all geometry except disclosure/mobile wrapping.

- [ ] **Step 5: Hide only the empty legend visual**

Add next to the existing Calendar legend rule:

```css
.calendar-page .cal-legend:empty {
  visibility: hidden;
  pointer-events: none;
  border: 0;
  background: transparent;
}
```

Do not remove the node or third grid column.

- [ ] **Step 6: Verify GREEN, measured contrast, and CSS parity**

Run:

```powershell
node --test --test-name-pattern="Schedule semantic colors" tests/phase9-frontend.test.mjs
python scripts/audit-dark-contrast.py
git diff --check
```

Expected: the static regression passes, cream/mint/lavender/peach dark Schedule pairs meet their thresholds, and no whitespace errors are reported.

- [ ] **Step 7: Commit semantic CSS and contrast coverage**

```powershell
git add -- tests/phase9-frontend.test.mjs css/styles.css css/_v12-timeblocks-ui.css scripts/audit-dark-contrast.py
git commit -m "fix(schedule): use semantic theme colors"
```

---

### Task 4: Visual regression and responsive matrix

**Files:**
- Modify: `scripts/e2e-frontend.py`

**Interfaces:**
- Consumes: the real Schedule view and semantic CSS from Tasks 1–3.
- Produces: visual-state screenshots and layout assertions for all required themes/states/viewports.

- [ ] **Step 1: Add a failing focused-path call for the visual matrix**

In the `args.view == "schedule-unscheduled"` branch, call a new `schedule_visual_matrix_checks(browser, base, errors)` after the existing functional scenario, without defining it yet.

Extend `schedule_unscheduled_checks` or add a focused Schedule visual helper that visits:

```text
A dark / 0 unscheduled
B dark / 3 unscheduled
C dark / 10 collapsed
D dark / 10 expanded
E cream light / 10 collapsed
F alternate dark / 10 collapsed
```

- [ ] **Step 2: Run the focused visual scenario and verify RED**

Run: `python scripts/e2e-frontend.py --view schedule-unscheduled --browser chromium --screenshots`

Expected: FAIL with `NameError: schedule_visual_matrix_checks is not defined`.

- [ ] **Step 3: Implement the minimal scenario dispatcher/fixtures**

Define `schedule_visual_matrix_checks` with the six named fixtures above. For each relevant case, assert no empty legend border/background, timeline presence, expected row count, usable Quick Schedule button, no body x-overflow, and unchanged segmented geometry. Run the viewport matrix `(360,800)`, `(390,844)`, `(412,915)`, `(768,1024)`, `(1440,900)`, `(1920,1080)` and write screenshots under the existing temporary screenshot convention. Reuse the Schedule seed/action helpers and pass explicit theme/dark/task-count/expanded parameters rather than duplicating product logic.

- [ ] **Step 4: Verify all themes and responsive sizes**

Run:

```powershell
python scripts/audit-dark-contrast.py
python scripts/e2e-frontend.py --view schedule-unscheduled --browser chromium --screenshots
```

Expected: cream/mint/lavender/peach dark pass the ratio thresholds; cream light preserves hierarchy; all six sizes have no horizontal overflow.

- [ ] **Step 5: Commit visual QA coverage**

```powershell
git add -- scripts/e2e-frontend.py
git commit -m "test(schedule): cover visual state matrix"
```

---

### Task 5: Regenerate production assets and exact cache pins

**Files:**
- Modify generated: `css/styles-critical.css`, `css/styles-deferred.css`, all affected `.min.css`
- Modify generated: `js/timeblocks-ui.min.js`, `js/i18n.min.js`, `js/app.min.js`
- Modify: `app.html`
- Modify: `sw.js`

**Interfaces:**
- Consumes: source JS/CSS from Tasks 1–4.
- Produces: production assets matching source and cache-busted HTML/SW references.

- [ ] **Step 1: Regenerate split CSS**

Run: `python scripts/split-critical-css.py`

Expected: `styles-critical.css` and `styles-deferred.css` are regenerated with cascade closure intact.

- [ ] **Step 2: Regenerate minified siblings**

Run: `python scripts/minify.py`

Expected: affected JS and CSS `.min` siblings change and pass syntax validation.

- [ ] **Step 3: Bump exact affected pins**

In `app.html`, bump:

```text
styles-critical.min.css  v=23 -> v=24
styles-deferred.min.css  v=23 -> v=24 (both link and noscript)
i18n.min.js              v=19 -> v=20
timeblocks-ui.min.js     v=3  -> v=4
app.min.js               v=184 -> v=185
```

In `sw.js`, bump `taskflow-v230` to `taskflow-v231`. Do not change unrelated asset pins.

- [ ] **Step 4: Verify generated parity and release pins**

Run:

```powershell
python scripts/minify.py --check
python scripts/check-release-assets.py
python scripts/verify-critical-css.py
```

Expected: all commands exit 0 with no stale minified asset, stale pin, or split-CSS mismatch.

- [ ] **Step 5: Commit generated release assets**

Stage only the explicit affected generated/source pin files, inspect `git diff --cached --stat`, then commit:

```powershell
git commit -m "chore(release): refresh schedule assets"
```

---

### Task 6: Full local release gate

**Files:**
- Verify only; do not stage pre-existing report timestamp changes.

**Interfaces:**
- Consumes: complete implementation and generated assets.
- Produces: fresh local evidence for every requested gate.

- [ ] **Step 1: Run syntax, unit, sync, and security tests**

```powershell
node --check js/timeblocks-ui.js
node --check js/app.js
node --test tests/*.test.mjs
node test-sync.js
node test-server-security.js
```

- [ ] **Step 2: Run release and CSS checks**

```powershell
python scripts/check-release-assets.py
python scripts/minify.py --check
python scripts/verify-critical-css.py
```

- [ ] **Step 3: Run full Chromium and offline E2E**

```powershell
python scripts/e2e-frontend.py --all --browser chromium
python scripts/e2e-offline.py
```

- [ ] **Step 4: Run the three-engine smoke matrix**

```powershell
python scripts/e2e-smoke.py --browser chromium
python scripts/e2e-smoke.py --browser firefox
python scripts/e2e-smoke.py --browser webkit
```

- [ ] **Step 5: Run mobile, accessibility, and contrast QA**

```powershell
python scripts/e2e-mobile-qa.py --browser chromium
python scripts/e2e-a11y.py --browser chromium
python scripts/audit-dark-contrast.py
```

- [ ] **Step 6: Audit scope before publication**

```powershell
git status -sb
git diff --ignore-all-space origin/main...HEAD --stat
git diff --check origin/main...HEAD
```

Confirm no Task/TimeBlock schema, storage, sync, Projects, Planner, Google, AI, Focus, auth, or offline-routing logic changed. Confirm user-owned report timestamps and `scripts/__pycache__/` remain unstaged.

---

### Task 7: Publish, CI, merge, and production verification

**Files:**
- No new source changes unless a verified CI or production defect requires a new RED→GREEN cycle.

**Interfaces:**
- Consumes: locally verified branch.
- Produces: scoped GitHub PR, green CI, merged main SHA, and Vercel production evidence for that SHA.

- [ ] **Step 1: Verify GitHub tooling and final scope**

```powershell
gh --version
gh auth status
git status -sb
git diff --name-only origin/main...HEAD
```

- [ ] **Step 2: Push the feature branch and open the scoped PR**

```powershell
git push -u origin codex/schedule-dark-contrast
gh pr create --draft --base main --head codex/schedule-dark-contrast --title "fix(schedule): harden dark contrast and density" --body-file $prBodyPath
```

The PR body must state the undefined-token root cause, local semantic migration, five-row disclosure, stable empty-legend slot, measured contrast, and completed checks.

- [ ] **Step 3: Wait for every GitHub check to finish**

Run: `gh pr checks --watch --fail-fast=false`

Expected final jobs: `test`, `release-assets`, `offline-e2e`, `e2e-frontend`, and Chromium/Firefox/WebKit smoke all pass. Do not report green while any job is queued or in progress.

- [ ] **Step 4: Promote and merge the approved release**

Because the approved spec includes production release, mark the green PR ready and merge it:

```powershell
gh pr ready
gh pr merge --squash --delete-branch
git fetch origin
$releaseSha = git rev-parse origin/main
```

- [ ] **Step 5: Verify main CI and Vercel production for the exact merge SHA**

Use `gh run list --commit $releaseSha` and `gh run watch <run-id>` until the main workflow is final. Inspect the Vercel deployment associated with `$releaseSha` until it is `READY`, then request `https://taskflow-todoist.vercel.app/app` and verify the returned HTML contains the new affected asset pins. Do not substitute a preview deployment or older READY deployment.

- [ ] **Step 6: Produce the required A–L report**

Report current/base HEAD, root cause and every legacy token, migration table, five-row UX, legend geometry preservation, measured major ratios, five-theme visual QA, all test results, pin/cache bumps, final CI jobs, Vercel status, and exact production commit SHA. Include any limitation such as simulated rather than physical-device mobile QA.
