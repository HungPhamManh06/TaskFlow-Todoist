# TaskFlow V2 Schedule contrast and density hardening

Date: 2026-08-15
Approved approach: local semantic-token migration with presentation-only disclosure

## Scope

Harden the existing Calendar Schedule view without redesigning it or changing Task/TimeBlock behavior. The change covers three confirmed presentation defects:

1. legacy Time Blocking color variables fall back to light literals in dark themes;
2. a long unscheduled-task list pushes the timeline too far below the fold;
3. the empty Calendar legend node remains visible as a blank capsule in Schedule mode.

The stable Calendar shell, shared segmented control, TimeBlock derivation, Quick Schedule dialog, storage, sync, and all unrelated product areas remain unchanged.

## Root cause and color architecture

The Time Blocking CSS predates the current semantic token system. `--surface` is a defined compatibility alias to `--color-surface`, but the following properties used by Schedule are undefined and therefore activate light fallback literals: `--surface-soft`, `--text`, `--text-strong`, `--text-faint`, `--border-soft`, `--border-faint`, `--accent`, `--sage`, `--warn-text`, and `--warn-soft`.

The fix is local to Time Blocking selectors. No global aliases and no Schedule-specific palette will be added. The migration is:

| Legacy usage | Semantic replacement |
| --- | --- |
| `--surface` | `--color-surface` |
| `--surface-soft` | `--color-surface-muted` |
| `--text`, `--text-strong` | `--color-text` |
| `--text-faint` | `--color-text-muted` |
| `--border-soft` | `--color-border` |
| `--border-faint` | a transparent mix of `--color-border` where a weaker rule is required |
| `--accent` | `--color-accent` |
| `--sage` | `--color-positive` |
| `--warn-text` | `--color-warning` |
| `--warn-soft` | a subtle mix of `--color-warning` and the semantic surface |

Hard-coded cancelled, missing, danger-hover, and shadow colors inside the same section will also use the closest existing semantic status/surface tokens or a local `color-mix()` expression. The dialog fields keep their existing shared field styling; only Time Blocking-specific warning colors change.

## Unscheduled-task disclosure

`unscheduledTasksForDate()` remains the sole derivation of unscheduled tasks. Presentation renders the first five valid rows by default. If more rows remain, the section renders one real button after the list:

- collapsed: `Xem thêm N việc` / `Show N more`;
- expanded: `Thu gọn` / `Collapse`.

The button exposes `aria-expanded` and references the task list through `aria-controls`. New Vietnamese and English strings live in the existing i18n dictionaries. Expansion is an ephemeral boolean owned by the Calendar UI orchestration layer and is neither stored nor synced. A disclosure click rerenders only `.calendar-mode-content` with the same derived collection; it never mutates task or TimeBlock data. Every selected-day navigation action resets the boolean before rendering the new date.

Rows retain the existing Quick Schedule action and its dialog inputs. On narrow screens, task text receives available width, metadata remains non-overflowing, and the secondary action keeps an accessible touch target.

## Calendar legend

The existing `.cal-legend` node and the three-column `.calendar-page-header` grid remain intact. An empty-only style makes the node visually absent with `visibility: hidden`, no border/background, and no pointer events. It does not use `display: none`, so desktop column three continues to occupy its grid track and the Month/Schedule segmented control keeps identical geometry and DOM identity.

## Rendering and state boundaries

The change adds a five-row presentation constant and an `expanded` rendering option to `timeblocks-ui.js`, but it will not change the data module in `timeblocks.js`. Calendar mode switches continue replacing only `.calendar-mode-content`; `#view-calendar` and the mode-toggle node remain stable.

The existing delegated click handling in `app.js` will handle the disclosure action. No listener is attached per row, and no persistent state is introduced.

## Accessibility and contrast

The dynamic contrast audit will seed a selected Schedule day with normal and priority unscheduled tasks, one scheduled block, timeline labels, and Quick Schedule controls for all four dark themes. It will measure the requested Schedule selectors using computed foreground, background, and border colors.

Acceptance thresholds are 4.5:1 for normal text and 3:1 for qualifying large text and interactive boundaries/states. Secondary information remains semantic muted text rather than being promoted to white. Keyboard focus continues to use TaskFlow's existing global focus-visible ring.

## Tests and visual verification

Test-first regressions will cover:

- five initial rows for a ten-task collection;
- correct remaining count and bilingual labels;
- accessible disclosure attributes and expand/collapse behavior;
- unchanged unscheduled derivation for planned, completed, cancelled-only, and completed tasks;
- Quick Schedule dialog inputs and save/cancel transitions;
- empty legend visual suppression without node removal or grid movement;
- Month to Schedule round trips with stable shell/toggle identity and no duplicate rows or blocks;
- dynamic Schedule contrast across cream, mint, lavender, and peach dark themes;
- 0, 3, 10-collapsed, and 10-expanded unscheduled visual states in dark mode, plus light cream and one alternate dark theme;
- responsive layouts at 360x800, 390x844, 412x915, 768x1024, 1440x900, and 1920x1080 with no horizontal body overflow.

## Generated assets and release

After source changes, the repository's current minification and critical/deferred CSS workflow will regenerate affected siblings. Exact asset query pins and the service-worker cache generation will be bumped only where required by the release checker.

Before publication, the full requested battery will run: unit tests, release-assets, minify check, Chromium frontend and offline E2E, cross-engine smoke tests, mobile QA, accessibility, dynamic dark contrast, and CSS verification. Only scoped files will be staged; existing user edits to `docs/a11y-audit.md`, `docs/mobile-qa.md`, and `scripts/__pycache__/` remain outside the commit. After push, CI jobs and Vercel production must reach final successful/READY states for the pushed SHA before completion is reported.
