# TaskFlow Final Polish & Technical Cleanup — Remaining Phases

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the remaining polish/cleanup phases on top of the already-completed P1-P8 release batch.

**Architecture:** Vanilla JS SPA (app.html + js/app.js + 26 extracted modules), CSS tokens, PWA service worker. No build step; tests are Node `node:test` textual tests + Playwright e2e scripts. All phases must keep behavior identical and keep the 268 unit tests + e2e smoke green.

## Status preamble (verified 2026-08-09)

Already implemented, unit-tested, and e2e-verified (do NOT redo):
- **P1 horizontal scrollbar** — `html/body overflow-x: clip`, `.app-sidebar overflow-x: hidden`, fixed tooltip portal (`position:fixed` layer + `getBoundingClientRect()`), `::after` disabled when collapsed. Test: phase9 "Phase 20: sidebar collapsed".
- **P2 mobile bottom nav** — exactly 5 items (Today / Week / + / Habits / More); More bottom-sheet holds Inbox, Upcoming, Overview, Year, Calendar + Reports, Focus, Settings.
- **P3 sidebar IA** — groups MAIN / PLAN / TRACK with group labels.
- **P4 tools drawer** — duplicate nav removed; drawer = utilities only.
- **P5 Today-first boot** — `#view-today` active with static skeleton, topbar "Hôm nay".
- **P6 canonical/SEO** — clean URLs (`/app`, `/privacy`, ...) in canonical/og/sitemap.
- **P7 branding** — all public UI/meta = TaskFlow; "Todoist" only in repo URL + internal data identifiers (export filenames, `data.app`, PRODID) — keep for import compatibility.
- **P8 footer/legal** — landing footer has Product / Resources / Legal groups; privacy.html, terms.html, data-and-security.html exist with code-accurate claims.
- **P17 empty states, P18 toasts, P19 a11y, P22 PWA** (manifest shortcuts incl. `?quick=1`, notification deep-link to `./app?view=today`), **P23 data-testid e2e hooks** — all done.

## Global Constraints

- No new frameworks/libraries. No redesigns. No big features.
- Every change: run `node --test tests/*.test.mjs` (expect 268 pass) and `python scripts/e2e-smoke.py` (expect "E2E SMOKE OK").
- Any change to files inside `sw.js` APP_SHELL (index.html, app.html, js/*, css/*) requires bumping `CACHE = 'taskflow-vNNN'` in sw.js (current v143 → v144).
- E2E scripts must keep using `data-testid` selectors; never `.active`/`:nth-child()`/layout classes.
- Do not rename repo, do not change internal `taskflow-todoist` data identifiers.

---

## Phase A — Release polish batch (execute now)

**Files:**
- Modify: `index.html` (footer Resources group)
- Modify: `sw.js` (cache bump if index.html changes)
- Verify: `tests/*.test.mjs`, `scripts/e2e-smoke.py`, `scripts/e2e-frontend.py`

- [x] **Step 1: Add Feedback link to landing footer**

In `index.html`, the footer `Tài nguyên / Resources` group currently has only the GitHub link. Add a second link `Góp ý / Feedback` using the sibling pattern (`data-t-vi` / `data-t-en` attributes, `rel="noopener noreferrer"`). Target URL: read `js/api-config.js` — if it defines `FB_FORM_URL`, use it; otherwise use `https://github.com/HungPhamManh06/Todoist/issues`. No CSS change needed (`.footer-group a` styles already exist).

- [x] **Step 2: Bump SW cache**

`index.html` is in `APP_SHELL`, so bump `CACHE` in `sw.js`: `'taskflow-v143'` → `'taskflow-v144'`.

- [x] **Step 3: Verify unit tests + smoke**

Run: `node --test tests/*.test.mjs` → all pass. Run: `python scripts/e2e-smoke.py` → "E2E SMOKE OK".

- [x] **Step 4: Full QA gate**

Run: `python scripts/e2e-frontend.py --all` (self-hosts server; allow long timeout). Expect "E2E RELEASE OK", zero PAGE ERRORS, zero overflow at 360/390/768/1024/1440 widths. If failures appear: find the ROOT CAUSE, apply the minimal fix (no structural rewrites, no redesigns), re-run. If a finding is deep/risky, do NOT attempt a risky fix — document it and report back.

- [x] **Step 5: Report**

Report changed file:line, test/QA results, and any findings left for later phases.

---

## Phase B — P11 continuation: extract Inbox module from app.js (next session)

**Goal:** Reduce app.js (8206 lines) by one more behavior-identical extraction, following the established extraction pattern (extractions 1-19 done).

**Candidate:** Inbox view — capture flow, inbox list rendering, schedule/move-to-today actions, `addInboxTask`, `saveInbox`, `inboxTargetForDate`, `renderInbox`.

**Files:**
- Create: `js/inbox.js`
- Modify: `app.html` (script tag before app.js), `sw.js` (add `./js/inbox.js` to APP_SHELL + bump cache), `js/app.js` (remove moved functions, keep a thin re-export if anything references them), `tests/phase9-frontend.test.mjs` (textual tests: module loaded before app.js, functions present, no duplicate declarations)

**Rules:**
- Move code as-is; do NOT change behavior or public function names.
- Run unit tests + smoke after the extraction.
- If a function is interdependent with app.js state, pass `state`/`inbox` via parameters rather than globals; keep the diff minimal.

---

## Phase C — P12 remaining performance + P15 visual QA (done 2026-08-09)

Measurement harness added: `scripts/measure-perf.py` (Playwright; boot timing, DOM node counts per view, view-switch cost matrix, localStorage write counting per interaction, isolated render-fn cost). Results (headless Chromium, empty seed, 1440×900):

- **Boot**: nav→DCL 345ms, nav→load 650ms, app ready ~700ms (29 end-of-body module scripts — expected for the no-build architecture; bundling would be a structural change, not applied). Multi-run baseline added later (`--runs N`): nav→load mean 730–830ms across 3-run passes (sd 2–121ms depending on machine load), app ready mean 771–867ms; single-run numbers swing ±100ms with machine load, so use `--runs 3` for regression comparison.
- **DOM nodes**: today 723 · inbox 637 · calendar 904 · week 2142 · year 2148 · overview 2271. All well within budget; heavy widgets already deferred via `content-visibility: auto` + inactive-view DOM cleanup in `setView` (verified: inactive sections hold 0 visible nodes across all viewports by `scripts/audit-dom.py`).
- **View-switch cost**: worst case < 10ms (year). Render fns 2–18ms isolated.
- **localStorage writes**: **1 month-key write per real interaction** (task toggle, quick-add, habit toggle), plus 1 xp write for XP-earning actions (task/habit toggle — intended). The 4 debounced save paths (`saveSoon`/`saveYearSoon`/`saveInboxSoon`/`saveTaskDetailStateSoon`) + `flushPendingSaves` already in place; `setView`'s own `save()` persists view state (intended).
- Derived-calc caches already present: `yearMonthlyCache`, `habitStreakCached` (+ `clearStreakCache`). No additional safe win surfaced by measurement — **no code change applied** (per "measure first, only fix what shows a problem").

Visual QA (live preview + e2e screenshot matrix at 1440/768/390 + overflow at 360/1024, light + dark):

- `python scripts/e2e-frontend.py --all` → **E2E RELEASE OK**, zero page errors, zero horizontal overflow at all widths (the `ConnectionAbortedError` traceback lines are benign Windows localhost server-thread noise; exit 0).
- `python scripts/audit-dom.py` → DOM AUDIT OK (headings, controls, focus, duplicate IDs, reflow, motion, deferred rendering).
- `node --test tests/*.test.mjs` → 269 pass.
- Contrast spot-checks (computed WCAG ratios): dark — body 15.2:1, muted 9.1:1, primary CTA 5.33:1, eyebrow 6.3:1; light — body 11.7:1, muted 7.7:1, CTA 6.2:1. All ≥ AA (4.5:1).
- Nav state verified: active tab tracks `[data-nav-view]` correctly incl. More-sheet views (inbox/calendar) and week-vs-day; bottom nav items untouched.
- No new libraries. No structural rewrites.

- [x] Measure: JS execution time, DOM node count on Today/Overview, localStorage write frequency during interactions, hidden-view render cost.
- [x] Apply only safe wins: cache derived calculations (month stats, heatmap), debounce already-present save paths, avoid unnecessary re-renders of inactive views (verify the existing "inactive views stay hidden" behavior covers all views).
- [x] Re-run `python scripts/e2e-frontend.py --all`; review the screenshots at 1440/768/390 in light + dark for spacing, overflow, contrast.
- [x] No new libraries. No structural rewrites.

---

## Phase D — E2E hardening: inbox view flow + notification deep-link (done 2026-08-09)

**Goal:** Close the one gap Phase 19/P23 left open: the Inbox view had only a section-level `data-testid="inbox-view"` (asserted textually) but no browser-level flow test, and the dynamic inbox rows / add button had no stable `data-testid` (tests could only target them via `data-role`/class). Also verify the P22 notification deep-link routing at the browser level, not just textually.

**Files:**
- Modify: `js/inbox.js` — add `data-testid="inbox-task-row"` (row div) and `data-testid="inbox-add"` (empty-state CTA via `emptyStateHTML` `attrs` + bottom add button) to `inboxTaskRowHTML`/`renderInbox`.
- Modify: `scripts/e2e-frontend.py` — add `inbox_checks()` (full flow: deep-link load → empty state → add task → type text → schedule-to-today → row clears → task lands on Today → overflow check + screenshot) and `deeplink_checks()` (browser-level PWA deep-link: `/app?view=today` = notification click target → Today visible; `/app?view=today&quick=1` = manifest shortcut → Quick Add opens; extended later to loop all remaining manifest shortcuts `/app?view=week|overview|year` → each boots its own view, h1 present, quick-add stays closed). Wire both into the `--all` scenario matrix + `--view inbox|deeplink` CLI choice. Inbox load uses `.upcoming-page` (NOT `load_planning_view`, which looks for `.{view}-page`).
- Modify: `tests/phase9-frontend.test.mjs` — new Phase 21 textual test: inbox.js emits both new data-testid hooks; e2e-frontend.py contains `inbox_checks`/`deeplink_checks` + the new selectors.

**Verification:** `node --test tests/*.test.mjs` (expect 269 + 1 new), `python scripts/e2e-smoke.py`, `python scripts/e2e-frontend.py --all` (now 10 scenarios × 3 viewports + 2 release-layout passes → 30 screenshots).

- [x] Add stable data-testid hooks to inbox task rows + add button.
- [x] Add `inbox_checks` + `deeplink_checks` browser flows to `scripts/e2e-frontend.py`, wired into `--all`.
- [x] Textual Phase 21 test covering the new hooks + script wiring.
- [x] Re-run unit tests + smoke + full e2e-frontend matrix; no regression.
