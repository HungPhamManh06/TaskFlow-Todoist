# TaskFlow Refined Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the TaskFlow landing page and complete planner UI into the approved TaskFlow Refined experience while preserving every existing feature and persistence contract.

**Architecture:** Keep the vanilla HTML/CSS/JavaScript application and its delegated `data-action` event model. Introduce semantic tokens, a small global `TaskFlowUI` helper, reusable shell/component CSS, and local SVG icons; migrate one active view at a time while existing state, storage, sync, analytics, and calculations remain unchanged.

**Tech Stack:** HTML5, CSS custom properties and responsive Grid/Flexbox, vanilla JavaScript IIFEs, Node.js built-in test runner, Python Playwright smoke tests, existing PWA service worker.

## Global Constraints

- No database, authentication, synchronization protocol, or localStorage schema changes.
- No removal of existing product features.
- No framework migration; the application remains HTML, CSS, and vanilla JavaScript.
- Preserve current `id`, `data-action`, and persistence contracts until a browser test proves the replacement.
- Functional icons are local SVG assets; emoji remain only for mood, badges, or user-selected symbols.
- Required verification widths are exactly 360px, 390px, 768px, 1024px, and 1440px.
- Touch hit areas are at least 44×44px on touch layouts.
- Light and dark themes must meet WCAG 2.2 AA expectations.
- Existing phase tests must pass after every task.
- Do not stage or modify the unrelated untracked `todoist/` directory or `.superpowers/` preview directory.

## File Structure

- `css/tokens.css` — semantic color, typography, spacing, radius, elevation, focus, and theme tokens.
- `css/components.css` — buttons, fields, metrics, progress, dialogs, drawers, toasts, and shared accessibility behavior.
- `css/app-shell.css` — desktop sidebar/top bar, mobile top bar/bottom navigation, app layout, and safe-area behavior.
- `css/styles.css` — existing view-specific styles; migrated incrementally and retained for feature surfaces.
- `css/landing.css` — rewritten landing page layout and responsive presentation.
- `icons/ui-sprite.svg` — offline local line-icon symbols used through `<svg><use>`.
- `js/ui.js` — pure URL/accessibility helpers plus dialog, drawer, toast, and icon markup utilities exposed as `window.TaskFlowUI`.
- `js/app.js` — existing state and actions plus migrated renderers and shell wiring.
- `app.html` — semantic application shell, shared layers, labeled controls, and stylesheet/script order.
- `index.html` — refined marketing structure and product preview.
- `tests/phase9-frontend.test.mjs` — pure/helper and markup contract tests for the redesign.
- `scripts/e2e-smoke.py` — existing smoke path updated to use the new shell selectors.
- `scripts/e2e-frontend.py` — desktop/mobile navigation, dialog, accessibility, overflow, and screenshot coverage.
- `sw.js` — cache version and new CSS/JS/SVG shell assets.

---

### Task 1: Lock Frontend Contracts and Add UI Helpers

**Files:**
- Create: `js/ui.js`
- Create: `tests/phase9-frontend.test.mjs`
- Modify: `app.html:49-75, 190-198, 481-486`
- Modify: `js/app.js:2640, 5040-5067`

**Interfaces:**
- Consumes: existing `window.DeepLink`, `state.view`, `PLAN_YEAR`, `PLAN_MONTH`, and delegated `data-action` attributes.
- Produces: `TaskFlowUI.icon(name, className)`, `TaskFlowUI.checkboxLabel(kind, name, context)`, `TaskFlowUI.buildViewUrl(input)`, `TaskFlowUI.syncUrl(input)`, and the `#appMain` main landmark.

- [ ] **Step 1: Write failing pure-helper and markup contract tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import UI from '../js/ui.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(path.join(ROOT, 'app.html'), 'utf8');

test('buildViewUrl keeps month and selected view', () => {
  assert.equal(
    UI.buildViewUrl({ view: 'week', year: 2026, month: 7, week: 2 }),
    '?view=week&m=2026-08&w=2'
  );
});

test('checkboxLabel includes item and context', () => {
  assert.equal(UI.checkboxLabel('habit', 'Đọc sách', '05/08'), 'Đọc sách · 05/08');
});

test('app exposes skip link and main landmark', () => {
  assert.match(APP, /class="skip-link"[^>]*href="#appMain"/);
  assert.match(APP, /<main[^>]*id="appMain"/);
});
```

- [ ] **Step 2: Run the new test and confirm the missing module failure**

Run: `node --test tests/phase9-frontend.test.mjs`

Expected: FAIL because `js/ui.js` does not exist and the skip-link contract is absent.

- [ ] **Step 3: Add the pure helper module**

```js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function checkboxLabel(kind, name, context) {
    return [name || kind, context].filter(Boolean).join(' · ');
  }
  function buildViewUrl({ view, year, month, week }) {
    const q = new URLSearchParams();
    q.set('view', view);
    q.set('m', `${year}-${String(month + 1).padStart(2, '0')}`);
    if (view === 'week' && week) q.set('w', String(week));
    return `?${q.toString()}`;
  }
  function syncUrl(input) {
    history.replaceState(null, '', buildViewUrl(input));
  }
  function icon(name, className = 'ui-icon') {
    return `<svg class="${className}" aria-hidden="true"><use href="icons/ui-sprite.svg#${name}"></use></svg>`;
  }
  return { checkboxLabel, buildViewUrl, syncUrl, icon };
});
```

- [ ] **Step 4: Add semantic entry points and wire URL state**

Add a skip link immediately inside `<body>`, change `<main class="container">` to `<main class="container" id="appMain" tabindex="-1">`, load `js/ui.js` before `js/app.js`, and call:

```js
window.TaskFlowUI.syncUrl({
  view,
  year: PLAN_YEAR,
  month: PLAN_MONTH,
  week: view === 'week' ? state.currentWeek : undefined,
});
```

at the end of `setView()` after render selection and before `save()`.

- [ ] **Step 5: Give generated checkboxes accessible names**

Extend `checkboxHTML` to accept an optional label:

```js
function checkboxHTML(cls, checked, attrs, label) {
  const aria = label ? ` aria-label="${esc(label)}"` : '';
  return `<button type="button" class="checkbox${cls}" role="checkbox" aria-checked="${checked}"${aria} ${attrs}></button>`;
}
```

Pass item name plus day/month context at goal, task, calendar, and habit call sites.

- [ ] **Step 6: Run focused and existing unit tests**

Run: `node --test tests/phase9-frontend.test.mjs tests/phase0.test.mjs tests/phase1.test.mjs tests/phase2.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit the contract foundation**

```bash
git add app.html js/ui.js js/app.js tests/phase9-frontend.test.mjs
git commit -m "feat(frontend): add accessible UI contracts"
```

### Task 2: Add Semantic Tokens, Components, and Local Icons

**Files:**
- Create: `css/tokens.css`
- Create: `css/components.css`
- Create: `css/app-shell.css`
- Create: `icons/ui-sprite.svg`
- Modify: `app.html:43-66`
- Modify: `css/styles.css:1-54, 1490-1548, 2566-2705`
- Modify: `sw.js:5-27`
- Test: `tests/phase9-frontend.test.mjs`

**Interfaces:**
- Consumes: existing `data-theme` and `data-dark` attributes.
- Produces: semantic `--color-*`, `--space-*`, `--radius-*`, `.ui-icon`, `.button`, `.icon-button`, `.field`, `.metric`, `.dialog`, `.drawer`, and `.toast-region` contracts.

- [ ] **Step 1: Add failing asset and token assertions**

```js
test('semantic token and local icon assets are loaded before legacy styles', () => {
  assert.match(APP, /css\/tokens\.css[^]*css\/components\.css[^]*css\/app-shell\.css[^]*css\/styles\.css/);
  assert.match(readFileSync(path.join(ROOT, 'css/tokens.css'), 'utf8'), /--color-canvas:/);
  assert.match(readFileSync(path.join(ROOT, 'icons/ui-sprite.svg'), 'utf8'), /id="search"/);
});
```

- [ ] **Step 2: Run the asset test and confirm it fails**

Run: `node --test tests/phase9-frontend.test.mjs`

Expected: FAIL because token, component, shell, and sprite files are missing.

- [ ] **Step 3: Implement semantic theme tokens**

Define cream defaults and explicit mint, lavender, peach, and dark overrides. Include:

```css
:root {
  --color-canvas: #f4f0e9;
  --color-sidebar: #fbf9f5;
  --color-surface: #fffdf9;
  --color-surface-muted: #f8f4ed;
  --color-text: #342f2b;
  --color-text-muted: #776f67;
  --color-border: #e4ddd4;
  --color-accent: #c95b3b;
  --color-accent-soft: #f3e1d9;
  --focus-ring: 0 0 0 3px rgb(201 91 59 / .28);
  --space-1: 4px; --space-2: 8px; --space-3: 12px;
  --space-4: 16px; --space-6: 24px; --space-8: 32px;
  --radius-control: 9px; --radius-panel: 14px;
}
```

- [ ] **Step 4: Implement shared component styles and focus rules**

Use explicit transitions and include `button`, `a`, `input`, `select`, `textarea`, and `[contenteditable]` in `:focus-visible`. Add 44px mobile hit areas, tabular numerals, dialog overscroll containment, and reduced-motion fallbacks. Remove `transition: all` from `.chat-chip`.

Create the shell stylesheet with its stable root contract so the load-order test passes before navigation markup is migrated:

```css
.app-layout {
  min-height: 100dvh;
  background: var(--color-canvas);
  color: var(--color-text);
}
.app-workspace { min-width: 0; }
```

- [ ] **Step 5: Add the local SVG sprite**

Create symbols for `overview`, `week`, `year`, `calendar`, `focus`, `report`, `search`, `plus`, `more`, `settings`, `undo`, `redo`, `bell`, `data`, `sync`, `help`, `theme`, `print`, `close`, `chevron-left`, and `chevron-right`, all using `stroke="currentColor"` and a common viewBox.

- [ ] **Step 6: Load assets and update the service-worker shell**

Load token/component/shell CSS before legacy styles. Add `js/ui.js`, all new CSS, and `icons/ui-sprite.svg` to `APP_SHELL`, then bump `CACHE` from `taskflow-v45` to `taskflow-v46`.

- [ ] **Step 7: Run tests and commit**

Run: `node --test tests/*.test.mjs`

Expected: PASS.

```bash
git add app.html css/tokens.css css/components.css css/styles.css icons/ui-sprite.svg sw.js tests/phase9-frontend.test.mjs
git commit -m "feat(design-system): add TaskFlow refined tokens and icons"
```

### Task 3: Build the Responsive Application Shell

**Files:**
- Modify: `css/app-shell.css`
- Modify: `app.html:68-198`
- Modify: `js/app.js:5024-5067, 5540-5570, 5920-5970`
- Modify: `tests/phase9-frontend.test.mjs`
- Modify: `scripts/e2e-smoke.py:31-82`

**Interfaces:**
- Consumes: `buildNav()`, `updateNav()`, `setView()`, existing header actions, and `TaskFlowUI.icon()`.
- Produces: `#desktopSidebar`, `#mobileNav`, `#appTopbar`, `#toolsDrawer`, and `.app-layout`.

- [ ] **Step 1: Write shell contract tests**

Assert that `app.html` contains labeled desktop and mobile navigation, `appMain`, a single primary creation button, and no `.landing-hero` inside the application.

```js
test('application shell exposes desktop and mobile navigation', () => {
  assert.match(APP, /id="desktopSidebar"/);
  assert.match(APP, /id="mobileNav"/);
  assert.match(APP, /id="toolsDrawer"/);
  assert.doesNotMatch(APP, /class="landing-hero"/);
});
```

- [ ] **Step 2: Run the shell contract test and confirm failure**

Run: `node --test tests/phase9-frontend.test.mjs`

Expected: FAIL because the old header and in-app hero remain.

- [ ] **Step 3: Replace the header markup with the semantic shell**

Build a desktop sidebar with the four current views, Focus, reports, tools, and landing link. Build a concise top bar with current title, month control, undo/redo, search, tools, and Add Task. Preserve every original action inside the tools drawer so no feature becomes unreachable.

- [ ] **Step 4: Render synchronized navigation from existing state**

Update `buildNav()` to fill both navigation containers and update `updateNav()` to set `.active`, `aria-current="page"`, and `aria-selected` consistently. Keep number-key navigation and existing tab keyboard behavior.

- [ ] **Step 5: Implement responsive shell CSS**

Desktop: 236px fixed sidebar plus fluid workspace. Mobile: 64px top bar, fixed bottom navigation with `padding-bottom: env(safe-area-inset-bottom)`, no desktop sidebar, and `main` bottom padding that clears navigation and floating controls.

- [ ] **Step 6: Update the existing E2E selectors**

Switch the smoke test navigation assertions from `#navTabs .tab` to `[data-nav-view]`, while keeping habit toggle, search, export, and Pomodoro checks unchanged.

- [ ] **Step 7: Verify and commit**

Run: `node --test tests/*.test.mjs`

Run: `python scripts/e2e-smoke.py`

Expected: all tests PASS; the initial app viewport shows working content and no hero.

```bash
git add app.html css/app-shell.css js/app.js tests/phase9-frontend.test.mjs scripts/e2e-smoke.py
git commit -m "feat(app-shell): add responsive navigation"
```

### Task 4: Redesign the Month Overview and Widget Surfaces

**Files:**
- Modify: `js/app.js:2671-3190, 3690-3815, 4880-4960`
- Modify: `css/styles.css:222-683, 1239-1318, 2487-2556, 3076-3118, 3615-3702`
- Modify: `tests/phase9-frontend.test.mjs`
- Modify: `scripts/e2e-frontend.py`

**Interfaces:**
- Consumes: existing overview widget registry, `monthGoalStats()`, habit/streak/mood helpers, and widget visibility/order state.
- Produces: `.overview-header`, `.overview-metrics`, `.overview-primary-grid`, accessible habit grid labels, and mobile single-column widgets.

- [ ] **Step 1: Add overview markup contract tests**

Assert `renderOverview()` emits a page `h1`, four named metrics, widget settings, and no decorative scene or chick grid.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/phase9-frontend.test.mjs --test-name-pattern="overview"`

Expected: FAIL on missing refined overview classes and retained scene markup.

- [ ] **Step 3: Rewrite the overview renderer around existing widget data**

Render greeting/date, weekly progress, completed goals, today's habits, and streak metrics first. Place goals/tasks and today habits in the primary grid. Preserve the existing widget registry IDs and settings behavior for streak, mood, reflection, charts, badges, and dashboard data.

- [ ] **Step 4: Migrate overview styling**

Use semantic surfaces and dividers, remove brick/scene-specific overview decoration, contain habit horizontal scrolling, and apply `content-visibility: auto` to below-fold widgets with a practical intrinsic size.

- [ ] **Step 5: Add desktop and mobile overview E2E checks**

```python
assert page.locator("#view-overview h1").count() == 1
assert page.locator(".overview-metrics .metric").count() == 4
assert page.evaluate("document.documentElement.scrollWidth === document.documentElement.clientWidth")
```

At 390px, assert every `.overview-widget` width is no greater than `#appMain` width and habit scrolling is contained inside `.habit-table-wrap`.

- [ ] **Step 6: Run unit/E2E tests and commit**

Run: `node --test tests/*.test.mjs`

Run: `python scripts/e2e-frontend.py --view overview`

```bash
git add js/app.js css/styles.css tests/phase9-frontend.test.mjs scripts/e2e-frontend.py
git commit -m "feat(overview): redesign monthly dashboard"
```

### Task 5: Redesign the Week View

**Files:**
- Modify: `js/app.js:4252-4408, 4650-4765`
- Modify: `css/styles.css:683-917, 2396-2445`
- Modify: `tests/phase9-frontend.test.mjs`
- Modify: `scripts/e2e-frontend.py`

**Interfaces:**
- Consumes: existing week state, task/goal actions, mood actions, reminders, tags, Pomodoro state, and weekly report.
- Produces: `.week-page-header`, `.week-goals-summary`, `.week-day-selector`, `.week-day-list`, and responsive day panels.

- [ ] **Step 1: Add failing week contracts**

Test for one page `h1`, seven labeled day panels, a mobile day selector, weekly goals, Pomodoro, habits, reflection, and weekly report trigger.

- [ ] **Step 2: Run the week contract test and confirm failure**

Run: `node --test tests/phase9-frontend.test.mjs --test-name-pattern="week"`

- [ ] **Step 3: Restructure week markup without changing actions**

Keep `data-week`, `data-day`, `data-task`, `data-action`, tag, reminder, contenteditable, and drag attributes. Wrap each day in a labeled section and generate day-selector buttons that scroll/focus the corresponding day on mobile.

- [ ] **Step 4: Implement responsive week behavior**

Use three/four columns on wide desktop, two columns on tablet, and one active/stacked day flow on mobile. Ensure tasks wrap, notes expand, and horizontal page overflow remains zero.

- [ ] **Step 5: Test task, mood, reminder, report, and Pomodoro interactions**

In `scripts/e2e-frontend.py`, add a task, edit its tag, toggle mood, open a reminder, open weekly report, and start/pause/reset Pomodoro at desktop and 390px.

- [ ] **Step 6: Run and commit**

Run: `node --test tests/*.test.mjs`

Run: `python scripts/e2e-frontend.py --view week`

```bash
git add js/app.js css/styles.css tests/phase9-frontend.test.mjs scripts/e2e-frontend.py
git commit -m "feat(week): redesign weekly planning view"
```

### Task 6: Redesign Year and Calendar Views

**Files:**
- Modify: `js/app.js:3984-4250, 4506-4540`
- Modify: `css/styles.css:917-1109, 2556-2564, 2967-3045, 3482-3490`
- Modify: `tests/phase9-frontend.test.mjs`
- Modify: `scripts/e2e-frontend.py`

**Interfaces:**
- Consumes: year goals/reflections, quarter/month stats, year heatmap, calendar tasks/tags, year/month report actions.
- Produces: `.year-summary`, `.year-goal-grid`, `.quarter-grid`, `.month-progress-grid`, `.calendar-grid-desktop`, and `.calendar-agenda-mobile`.

- [ ] **Step 1: Add failing year/calendar contracts**

Assert both views render one `h1`, year exposes four metrics and twelve months, and calendar includes desktop grid plus mobile agenda containers.

- [ ] **Step 2: Run contract tests and confirm failure**

Run: `node --test tests/phase9-frontend.test.mjs --test-name-pattern="year|calendar"`

- [ ] **Step 3: Migrate the year view**

Retain all edit/add/delete actions and reflection keys. Present summary metrics, goals, quarters, months, heatmap, and reflections in that order. Use responsive grids rather than fixed 190px month overflow as the default mobile layout.

- [ ] **Step 4: Add the mobile calendar agenda**

Render the same selected month data as a chronological list grouped by date below 720px. Keep the seven-column grid for desktop and use one shared tag filter state for both renderings.

- [ ] **Step 5: Sync calendar month/filter state to URL**

Extend `TaskFlowUI.buildViewUrl` with repeated `tag` parameters and restore them during initial boot. Add pure tests for encoded Vietnamese tag values.

- [ ] **Step 6: Run E2E at required widths and commit**

Run: `python scripts/e2e-frontend.py --view year --view calendar`

Expected: zero document-level horizontal overflow at 360/390/768/1024/1440px.

```bash
git add js/ui.js js/app.js css/styles.css tests/phase9-frontend.test.mjs scripts/e2e-frontend.py
git commit -m "feat(planning): redesign year and calendar views"
```

### Task 7: Unify Dialogs, Drawers, Forms, and Feedback

**Files:**
- Modify: `js/ui.js`
- Modify: `app.html:198-480`
- Modify: `js/app.js:1500-2405, 3300-3680, 4410-4610, 4900-5020, 5180-5438, 6160-6335`
- Modify: `css/components.css`
- Modify: `tests/phase9-frontend.test.mjs`
- Modify: `scripts/e2e-frontend.py`

**Interfaces:**
- Consumes: every existing modal ID/action and current translated strings.
- Produces: `TaskFlowUI.openDialog(id, opener)`, `TaskFlowUI.closeDialog(id)`, `TaskFlowUI.openDrawer(id, opener)`, `TaskFlowUI.toast(message, kind)`, `#toastRegion`, and consistent `.field-error` markup.

- [ ] **Step 1: Write pure and markup tests for shared layers**

Assert the app contains `#toastRegion[aria-live="polite"]`, every dialog has a heading referenced by `aria-labelledby`, and fields have explicit labels or `aria-label`.

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test tests/phase9-frontend.test.mjs --test-name-pattern="dialog|field|toast"`

- [ ] **Step 3: Implement dialog focus management**

Store the opener, focus the first meaningful control, trap Tab/Shift+Tab, close on Escape, and return focus:

```js
const dialogState = new Map();
function openDialog(id, opener = document.activeElement) {
  const layer = document.getElementById(id);
  dialogState.set(id, opener);
  layer.hidden = false;
  layer.querySelector('[autofocus], input, button, [tabindex="0"]')?.focus();
}
function closeDialog(id) {
  document.getElementById(id).hidden = true;
  dialogState.get(id)?.focus();
  dialogState.delete(id);
}
function openDrawer(id, opener = document.activeElement) {
  const drawer = document.getElementById(id);
  dialogState.set(id, opener);
  drawer.hidden = false;
  drawer.setAttribute('aria-hidden', 'false');
  drawer.querySelector('button, input, select, [tabindex="0"]')?.focus();
}
```

Add the Tab trap in the same helper, implement `closeDrawer(id)` as the drawer counterpart to `closeDialog(id)`, export both drawer functions, and register all existing modals through the shared API.

- [ ] **Step 4: Replace routine alerts with toasts and inline errors**

Keep explicit confirmation for reset, account deletion, destructive import, and backup restore. Convert successful reminder, export/import, template, report share, badge, sync, and Pomodoro completion messages to `TaskFlowUI.toast()`. Render validation beside username/password/time inputs and focus the first invalid field.

- [ ] **Step 5: Convert tools and secondary controls into responsive drawers**

Use desktop popover/drawer and mobile bottom sheet behavior. Ensure Pomodoro and chatbot panels are mutually exclusive on mobile and clear the bottom navigation plus safe area.

- [ ] **Step 6: Test keyboard, focus return, errors, and panel overlap**

Use Playwright to open Search with Ctrl+K, cycle Tab, close with Escape, verify focus returns, trigger an invalid sign-in, and assert only one of chatbot/Pomodoro is visible at 390px.

- [ ] **Step 7: Run and commit**

Run: `node --test tests/*.test.mjs`

Run: `python scripts/e2e-frontend.py --dialogs`

```bash
git add js/ui.js app.html js/app.js css/components.css tests/phase9-frontend.test.mjs scripts/e2e-frontend.py
git commit -m "feat(ui): unify dialogs drawers and feedback"
```

### Task 8: Redesign the Landing Page and Offline Shell

**Files:**
- Modify: `index.html:75-320`
- Modify: `css/landing.css`
- Modify: `sw.js:5-27`
- Modify: `tests/phase9-frontend.test.mjs`
- Modify: `scripts/e2e-frontend.py`

**Interfaces:**
- Consumes: existing language and dark-mode localStorage preferences and `app.html` entry point.
- Produces: `.landing-nav`, `.landing-hero`, `.product-preview`, `.trust-strip`, `.feature-narrative`, `.landing-cta-final`, and a concise footer.

- [ ] **Step 1: Add landing structure tests**

Assert exactly one page `h1`, one primary hero CTA to `app.html`, real-width/height product images or semantic HTML product preview, section anchors with scroll margins, and no decorative brick strip.

- [ ] **Step 2: Run the landing tests and confirm failure**

Run: `node --test tests/phase9-frontend.test.mjs --test-name-pattern="landing"`

- [ ] **Step 3: Rewrite the landing markup**

Build compact navigation, split hero, trust strip, five-part feature narrative, product evidence, final CTA, and footer. Preserve Vietnamese/English attributes, dark toggle, and language toggle.

- [ ] **Step 4: Rewrite landing CSS with the shared visual roles**

Use token-compatible colors, balanced headings, responsive split/grid layouts, local logo assets, explicit focus/hover/active states, reduced motion, and lazy loading for below-fold screenshots.

- [ ] **Step 5: Update offline cache and run landing E2E**

Verify theme/language persistence, anchor navigation, CTA to app, 200% zoom, dark mode, and no horizontal overflow at all required widths. Bump service-worker cache to `taskflow-v47` after final asset names stabilize.

- [ ] **Step 6: Run and commit**

Run: `node --test tests/*.test.mjs`

Run: `python scripts/e2e-frontend.py --landing`

```bash
git add index.html css/landing.css sw.js tests/phase9-frontend.test.mjs scripts/e2e-frontend.py
git commit -m "feat(landing): redesign TaskFlow marketing page"
```

### Task 9: Accessibility, Performance, Visual Regression, and Release Verification

**Files:**
- Modify: `css/tokens.css`
- Modify: `css/components.css`
- Modify: `css/app-shell.css`
- Modify: `css/styles.css`
- Modify: `js/app.js`
- Modify: `scripts/e2e-frontend.py`
- Modify: `scripts/audit-dom.py`
- Modify: `sw.js`
- Test: `tests/*.test.mjs`

**Interfaces:**
- Consumes: all redesigned surfaces from Tasks 1–8.
- Produces: release evidence for accessibility, responsive behavior, performance, offline cache, and unchanged feature behavior.

- [ ] **Step 1: Extend the DOM audit with release assertions**

Add checks for one active-view `h1`, labeled controls, icon-button accessible names, duplicate IDs, visible skip link on focus, no empty primary buttons, and no `transition: all` or unpaired `outline: none` patterns.

- [ ] **Step 2: Add the full responsive screenshot matrix**

Capture Landing, Overview, Week, Year, Calendar, Search dialog, Tools drawer, Focus mode, and dark Overview at 390px, 768px, and 1440px. Add 360px overflow-only checks and 1024px layout checks.

- [ ] **Step 3: Add performance and motion assertions**

Assert inactive views are hidden and not re-rendered during unrelated actions, below-fold overview sections use `content-visibility`, animations disable under reduced motion, and layout uses no document-level horizontal overflow.

- [ ] **Step 4: Run the complete verification suite**

Run: `node --test tests/*.test.mjs`

Run: `python scripts/audit-dom.py`

Run: `python scripts/e2e-smoke.py`

Run: `python scripts/e2e-frontend.py --all --screenshots`

Expected: all commands exit 0 with no page errors, accessibility contract failures, or overflow failures.

- [ ] **Step 5: Verify offline behavior manually through Playwright**

Load Landing and App once, wait for the service worker to control the page, switch the context offline, reload `app.html?view=overview&m=2026-08`, and verify the shell, local icon sprite, CSS, and JavaScript render successfully.

- [ ] **Step 6: Review the final diff and commit hardening**

Run: `git diff --check`

Run: `git status --short`

Confirm only intended frontend, test, and documentation files changed.

```bash
git add css js app.html index.html icons sw.js scripts tests
git commit -m "test(frontend): harden responsive and accessibility coverage"
```

## Final Acceptance Checklist

- [ ] Every existing feature is reachable in desktop and mobile navigation.
- [ ] No in-app marketing hero appears above the dashboard.
- [ ] All primary views have one visible `h1` and zero document-level horizontal overflow.
- [ ] All generated task, goal, calendar, and habit checkboxes have meaningful accessible names.
- [ ] All dialogs trap and restore focus; routine feedback is non-blocking.
- [ ] URL state restores view, month, week, and calendar filters.
- [ ] Cream, mint, lavender, peach, and dark themes remain coherent.
- [ ] Offline reload includes every new CSS, JavaScript, and SVG shell asset.
- [ ] Existing Node tests and new Playwright tests pass.
- [ ] Required viewport screenshots have been visually reviewed.
