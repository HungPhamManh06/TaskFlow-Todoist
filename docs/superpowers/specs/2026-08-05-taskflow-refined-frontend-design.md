# TaskFlow Refined Frontend Design

**Date:** 2026-08-05

**Status:** Proposed for implementation

## 1. Purpose

Modernize the complete TaskFlow frontend while preserving its warm, approachable identity. The redesign covers both the marketing landing page (`index.html`) and the planner application (`app.html`). It improves hierarchy, navigation, responsive behavior, accessibility, and visual consistency without changing the application's data model or feature set.

## 2. Product Reading

TaskFlow is a personal productivity application for users who want one friendly place to manage yearly, monthly, and weekly goals, habits, tasks, focus sessions, reports, and reflections. Its recognizable identity comes from warm cream surfaces, terracotta accents, soft rounded forms, and a small mascot/logo presence.

The redesign is therefore not a conversion into a cold enterprise dashboard. It is a refinement of the current style into a focused productivity interface.

Design dials:

- Design variance: 5/10
- Motion intensity: 3/10
- Visual density: 6/10

## 3. Goals

- Make the first screen immediately useful by surfacing current priorities and progress.
- Reduce visual noise from decorative emoji, thick borders, repeated cards, and equally weighted actions.
- Give every current feature a discoverable location in a coherent navigation model.
- Provide a usable layout from 360px mobile screens through large desktop screens.
- Preserve all current behavior, persisted data, localization, offline support, synchronization, import/export, and PWA functionality.
- Meet WCAG 2.2 AA expectations for semantics, focus, keyboard use, contrast, and touch targets.
- Establish a reusable visual system so later frontend work does not add more one-off CSS.

## 4. Non-goals

- No database, authentication, synchronization protocol, or localStorage schema changes.
- No removal of existing product features.
- No framework migration; the application remains HTML, CSS, and vanilla JavaScript.
- No new subscription, collaboration, social, or AI backend functionality.
- No unrelated server refactoring.

## 5. Audit Baseline

The current frontend has the following issues that the redesign must resolve:

- The application header presents too many actions at the same visual level and uses 25–29px mobile controls.
- The in-app marketing hero is approximately 425px high and pushes working content below the initial viewport.
- The monthly overview can render more than 500 buttons, including habit checkboxes without accessible names.
- The main application content has no page-level `h1` and no skip link.
- Some fields depend on placeholder text instead of explicit labels.
- Several editable areas remove their outline without a sufficiently strong `focus-visible` replacement.
- Modal behavior is inconsistent and does not systematically trap focus, restore focus, or contain overscroll.
- Blocking `alert()` and `confirm()` calls are used for routine feedback.
- View changes are read from deep links but are not written back to the URL.
- Mobile layout and information density require dedicated designs rather than scaled-down desktop grids.

## 6. Design Principles

### 6.1 Familiar but refined

Retain the cream, terracotta, sage, and muted gold family. Keep the TaskFlow mark and rounded character. Remove brick patterns and most decorative emoji. The mascot may appear in onboarding, empty states, and selected brand moments, but not throughout working data surfaces.

### 6.2 Work before marketing

The application opens directly to useful information. The marketing hero exists only on the landing page. Inside the app, the first viewport shows the current date, the user's priorities, and compact progress indicators.

### 6.3 Progressive disclosure

Primary navigation and the main creation action remain visible. Data tools, synchronization, themes, help, import/export, printing, and secondary utilities move into labeled menus and drawers.

### 6.4 Calm density

Spacing, typography, dividers, and surface contrast establish hierarchy. Cards are used only when they group a real unit of information. Lists and sections use spacing and separators instead of wrapping every item in another card.

### 6.5 Accessible by default

Every control has an accessible name, visible keyboard focus, sufficient touch area, and a semantic element. Dialogs behave consistently. Status changes are announced without blocking the user.

## 7. Visual System

### 7.1 Color roles

The existing themes remain, but each theme exposes the same semantic roles:

- `--color-canvas`: page background
- `--color-sidebar`: navigation surface
- `--color-surface`: primary content surface
- `--color-surface-muted`: secondary content and hover surface
- `--color-text`: primary text
- `--color-text-muted`: secondary text
- `--color-border`: neutral dividers and outlines
- `--color-accent`: primary terracotta or theme accent
- `--color-accent-soft`: selected navigation and subtle accent background
- `--color-positive`, `--color-warning`, `--color-danger`, `--color-info`: semantic states

Dark mode provides explicit values for every semantic role and sets `color-scheme: dark` and a matching `theme-color`.

### 7.2 Typography

- Use Nunito for brand and major display headings.
- Use a neutral system-first sans stack for navigation, controls, data, and body text.
- Use tabular numerals for progress values, timers, charts, and comparable metrics.
- Page headings use balanced wrapping and a clear `h1`–`h3` hierarchy.

### 7.3 Spacing and shape

- Base spacing unit: 4px.
- Primary spacing steps: 4, 8, 12, 16, 24, 32, and 48px.
- Control radius: 8–10px.
- Panel radius: 12–14px.
- Pill shapes are limited to tags, status, and segmented controls.
- Shadows are subtle and limited to floating layers; normal content relies on borders and surface contrast.

### 7.4 Icons

Replace functional emoji with a local, consistent SVG icon set. Icons use current color, a common 1.75–2px stroke, and 18–20px default size. Emoji remain only when the content itself is a mood, badge, or user-selected symbol.

## 8. Information Architecture

### 8.1 Landing page

The landing page contains:

1. Compact navigation with brand, product sections, theme/language access, and one primary CTA.
2. Split hero with a direct value proposition and a real product preview.
3. Trust strip: free, offline-first, private data, and optional synchronization.
4. Feature narrative grouped into planning, habits, focus, reflection/reporting, and data ownership.
5. Product screenshots or live mockups for overview, week, and habit tracking.
6. Final CTA and concise footer.

### 8.2 Application shell

Desktop uses a fixed sidebar and a contextual top bar.

Sidebar primary destinations map to the existing views:

- Month overview
- Current week
- Year plan
- Calendar

Sidebar secondary destinations open existing modes rather than create new data models:

- Focus mode
- Reports
- Tools and settings
- Landing page

The top bar contains:

- Current view title
- Month/year context control
- Undo and redo
- Search
- A labeled tools trigger
- One primary “Add task” action

Mobile uses a bottom navigation bar for Overview, Week, Year, and Calendar. A “More” destination opens a bottom sheet containing Focus, reports, tools, themes, data, sync, and help. The month picker and primary creation action remain in a compact mobile top bar.

## 9. Page Designs

### 9.1 Month overview

The in-app hero is removed. The page begins with a greeting/date line followed by four compact metrics:

- Weekly progress
- Completed work
- Today's habits
- Current streak

The default widget order is:

1. Monthly goals and today's priorities
2. Today's habits
3. Streak heatmap
4. Mood heatmap and insight
5. Monthly reflection
6. Six-week progress
7. Awards and secondary analytics

Widget customization remains available. On mobile, widgets become a single column and large tables use contained horizontal scrolling with sticky contextual labels.

### 9.2 Week view

The week view contains:

- Week title, date range, and weekly report action
- Weekly goals summary
- Seven day sections
- Task groups, notes, tags, reminders, and mood per day
- Weekly habit summary
- Pomodoro widget
- Weekly reflection

Desktop may show multiple day columns. Tablet shows two columns. Mobile shows a vertically stacked day list or a horizontally swipeable day selector with one visible day panel; it must not compress seven desktop columns into the viewport.

### 9.3 Year view

The year view contains:

- Four summary metrics
- Year goals
- Quarterly overview
- Twelve-month progress
- Year habit heatmap
- Quarterly and yearly reflections
- Year report action

Twelve month cards use a responsive two- or three-column grid on smaller screens rather than fixed-width overflow as the default interaction.

### 9.4 Calendar

Desktop retains a seven-column month grid. Mobile uses an agenda-first presentation with a compact date strip; the full grid may be opened as an alternative. Calendar state, selected month, and filters are represented in the URL.

### 9.5 Focus mode

Focus mode is a dedicated full-screen dialog or route-like overlay containing only today's priority tasks, due habits, and Pomodoro entry. It hides global decorative content and restores focus to its opening control when closed.

## 10. Shared Components

The redesign introduces reusable vanilla components and patterns:

- App shell and responsive navigation
- Button variants and icon button
- Form field with label, hint, and inline error
- Checkbox with generated accessible name
- Metric block
- Progress bar
- Section header
- Dialog
- Drawer and mobile bottom sheet
- Popover/menu
- Toast region with `aria-live="polite"`
- Empty, loading, and error states
- Local SVG icon renderer

These components may be implemented as focused rendering helpers and CSS classes. They must retain current `data-action` contracts so the application event delegation continues to work.

## 11. Interaction and Data Flow

Existing state and persistence remain the source of truth.

1. Existing state loaders produce the same month, week, year, calendar, habit, task, and preference data.
2. View renderers map that state into the new component markup.
3. Existing delegated actions update state through current functions.
4. Renderers update the affected view or component.
5. Persistence, backup, analytics, and synchronization continue through existing functions.

`setView`, month changes, week selection, and calendar filters also update query parameters with `history.replaceState` or `history.pushState`. Initial deep-link parsing remains backward compatible.

## 12. Dialogs, Feedback, and Errors

- Dialogs trap focus, close on Escape, close on backdrop only when safe, and restore focus to the opener.
- Destructive actions use an explicit confirmation dialog and retain current undo where available.
- Routine success messages use non-blocking toasts.
- Validation errors appear next to the field and focus the first invalid control.
- Synchronization status is announced through an `aria-live` status region.
- Import/export failures state what happened and the next action the user can take.
- Offline and reconnect states remain visible but non-blocking.

## 13. Accessibility Requirements

- Add a “Skip to main content” link.
- Each active view contains one visible `h1`.
- All inputs, textareas, selects, contenteditable fields, and icon buttons have programmatic labels.
- Goal, task, and habit checkboxes include the item name and applicable date in their accessible name.
- All interactive targets are at least 44×44px on touch layouts or have an equivalent 44px hit area.
- Focus uses `:focus-visible`; no control removes outlines without an equivalent replacement.
- Decorative icons are hidden from assistive technology.
- Motion respects `prefers-reduced-motion`.
- Light and dark themes meet WCAG AA contrast for text and controls.
- Tables retain semantic headers and meaningful row/column context.

## 14. Responsive Requirements

Required verification widths:

- 360px
- 390px
- 768px
- 1024px
- 1440px

Additional rules:

- Use `100dvh` where viewport-height behavior matters.
- Apply safe-area insets to mobile bottom navigation, sheets, and floating controls.
- Prevent floating Pomodoro and chatbot panels from overlapping each other or primary navigation.
- Use CSS grid and flex layout rather than JavaScript measurement.
- Contain horizontal overflow within the habit table, heatmaps, and desktop calendar rather than the whole document.

## 15. Performance Requirements

- Render only the active primary view.
- Lazy-render or apply `content-visibility: auto` to below-fold dashboard sections.
- Avoid rebuilding unrelated large sections for a single checkbox update where practical.
- Batch DOM reads and writes in interactive chart and drag operations.
- Keep the icon set local for offline use.
- Preserve current font preconnects and use `font-display: swap` through the font provider.
- Target LCP below 2.5s, INP below 200ms, and CLS below 0.1 on a representative mobile device.

## 16. Testing Strategy

### 16.1 Existing behavior

Run all current phase tests to ensure the redesign does not change calculations, persistence, synchronization helpers, or feature behavior.

### 16.2 Browser interaction

Playwright smoke tests cover:

- Landing CTA to app
- Navigation among Overview, Week, Year, and Calendar
- Month and week changes
- Task, goal, and habit creation and completion
- Search, Focus, Pomodoro, chatbot, reminders, templates, reports, data tools, sync, themes, and language
- Dialog keyboard behavior
- Mobile bottom navigation and sheets

### 16.3 Visual regression

Capture stable screenshots for all primary views at 390px, 768px, and 1440px in cream light mode. Add representative dark mode screenshots for Overview and one dialog.

### 16.4 Accessibility

Verify keyboard navigation, focus order, accessible names, heading hierarchy, dialog behavior, zoom at 200%, and theme contrast.

## 17. Delivery Sequence

1. Add regression tests and fix critical mobile/accessibility defects.
2. Add semantic design tokens and local icon foundations.
3. Build the application shell and responsive navigation.
4. Redesign the month overview and widget system.
5. Redesign week, year, and calendar views.
6. Unify dialogs, drawers, popovers, toasts, and form feedback.
7. Redesign the landing page.
8. Complete accessibility, performance, visual regression, and PWA verification.

Each step must preserve a working application and pass the relevant existing and new tests before the next step starts.

## 18. Acceptance Criteria

- Every existing feature remains reachable and functional.
- No application hero appears above the working dashboard.
- Desktop navigation is organized into a labeled sidebar and concise top bar.
- Mobile navigation uses a bottom bar and secondary bottom sheet without horizontal page overflow.
- All primary views pass at 360px, 390px, 768px, 1024px, and 1440px.
- Functional emoji are replaced by consistent local icons; mood and badge emoji remain where semantic.
- All checkbox controls and fields have meaningful accessible names.
- Dialogs have complete focus management and routine feedback no longer relies on blocking alerts.
- View and month state are reflected in the URL.
- Existing tests pass and new browser/visual tests cover the redesigned surfaces.
- Light and dark themes remain coherent across landing, app, dialogs, and print output.

## 19. Risks and Mitigation

- **Risk: large markup changes break delegated actions.** Preserve existing `data-action`, `data-*`, and element IDs until each behavior has a passing browser test.
- **Risk: CSS migration causes regressions across many features.** Introduce semantic tokens first, migrate one view at a time, and keep visual snapshots at required widths.
- **Risk: mobile navigation hides features.** Keep four primary destinations visible and provide a labeled, searchable “More” sheet for every secondary feature.
- **Risk: accessibility work changes interaction details.** Add keyboard and accessible-name assertions before replacing the corresponding controls.
- **Risk: offline behavior loses icon/font assets.** Store functional icons locally and include them in the service-worker asset list.
