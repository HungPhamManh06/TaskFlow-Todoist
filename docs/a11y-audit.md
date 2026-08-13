# TaskFlow — P2.3 Accessibility Audit

_Generated 2026-08-13 18:36 · browser: chromium · desktop 1440x900 + mobile 390x844 (touch) + reduced-motion comparison_

**Result: 62 PASS / 0 FAIL**

## Checks

| Area | Check | Status | Detail |
|---|---|---|---|
| Quick Add | dialog semantics (role/aria-modal/aria-labelledby) | PASS |  |
| Quick Add | focus moves inside on open | PASS |  |
| Quick Add | Tab trap (focus stays in layer) | PASS |  |
| Quick Add | accessible names on quick-add controls | PASS |  |
| Quick Add | inputs labeled (aria-label or label) | PASS |  |
| Quick Add | Escape closes | PASS |  |
| Task Drawer | task menu opens via keyboard + aria-expanded=true | PASS | (=true) |
| Task Drawer | dialog semantics (role/aria-modal/aria-labelledby) | PASS |  |
| Task Drawer | focus moves inside on open | PASS |  |
| Task Drawer | Tab trap (focus stays in layer) | PASS |  |
| Task Drawer | accessible names on drawer controls | PASS |  |
| Task Drawer | Escape closes | PASS |  |
| Task Drawer | focus returns to opener | PASS |  |
| Search | dialog semantics (role/aria-modal/aria-labelledby) | PASS |  |
| Search | focus moves inside on open | PASS |  |
| Search | search returns hits | PASS | (2 hits) |
| Search | ArrowDown moves focus to result | PASS |  |
| Search | Enter activates result (modal closes) | PASS |  |
| Search | Escape closes | PASS |  |
| Calendar (tag flow) | Escape closes | PASS |  |
| Calendar | tag chips have aria-pressed | PASS | (=true) |
| Calendar | calendar task controls present | PASS | (3) |
| Calendar | calendar task checkbox role/aria-checked | PASS | ({'role': 'checkbox', 'checked': 'false'}) |
| Calendar | calendar grid has aria-label | PASS | (=Lịch tháng) |
| Calendar | month nav buttons labeled | PASS |  |
| Focus | dialog semantics (role/aria-modal/aria-labelledby) | PASS |  |
| Focus | focus moves inside on open | PASS |  |
| Focus | Tab trap (focus stays in layer) | PASS |  |
| Focus | accessible names on focus controls | PASS |  |
| Focus | Escape closes | PASS |  |
| Auth (sync) | dialog semantics (role/aria-modal/aria-labelledby) | PASS |  |
| Auth (sync) | focus moves inside on open | PASS |  |
| Auth (sync) | Tab trap (focus stays in layer) | PASS |  |
| Auth (sync) | accessible names on sync form controls | PASS |  |
| Auth (sync) | empty submit shows inline error + focuses field | PASS | (err=True, focus=True) |
| Auth (sync) | Escape closes | PASS |  |
| Auth (profile) | dialog semantics (role/aria-modal/aria-labelledby) | PASS |  |
| Auth (profile) | focus moves inside on open | PASS |  |
| Auth (profile) | Tab trap (focus stays in layer) | PASS |  |
| Auth (profile) | accessible names on profile form controls | PASS |  |
| Auth (profile) | Escape closes | PASS |  |
| Cross-cutting | focus-visible ring on keyboard focus | PASS | ({'style': 'solid', 'width': '3px'}) |
| Cross-cutting | active desktop nav tab aria-current=page | PASS | (=page) |
| Cross-cutting | contrast primary CTA text >= 4.5:1 | PASS | (5.40:1) |
| Cross-cutting | contrast muted text >= 4.5:1 | PASS | (4.97:1) |
| Cross-cutting | contrast field error text >= 4.5:1 | PASS | (4.78:1) |
| Cross-cutting | contrast search input text >= 4.5:1 | PASS | (13.28:1) |
| Cross-cutting | no horizontal overflow | PASS |  |
| desktop overall | no horizontal overflow | PASS |  |
| More Sheet | dialog semantics (role/aria-modal/aria-labelledby) | PASS |  |
| More Sheet | focus moves inside on open | PASS |  |
| More Sheet | Tab trap (focus stays in layer) | PASS |  |
| More Sheet | accessible names on more-sheet controls | PASS |  |
| More Sheet | trigger aria-expanded=true while open | PASS | (=true) |
| More Sheet | body scroll locked while open | PASS | (overflow=hidden) |
| More Sheet | Escape closes | PASS |  |
| More Sheet | trigger aria-expanded=false after close | PASS | (=false) |
| More Sheet | focus returns to more trigger | PASS |  |
| More Sheet | active bottom-nav tab aria-current=page | PASS | (=page) |
| mobile overall | no horizontal overflow | PASS |  |
| mobile overall | no horizontal overflow (mobile) | PASS |  |
| Cross-cutting | reduced motion disables transitions/animations | PASS | (normal={'transition': '0.14s, 0.14s', 'anim': 'none'}, reduce={'transition': '0s', 'anim': 'none'}) |

## Page errors

None.

## Simulation limits

- Software keyboard is not emulated; real-device keyboard overlap needs a physical device.
- env(safe-area-inset-*) is 0 in headless (no notch).
- Screen-reader announcements (aria-live output) are asserted structurally, not via a real SR.
- Calendar day cells are not themselves keyboard-focusable; their interactive controls are. Day navigation is covered by the Today/Week views.