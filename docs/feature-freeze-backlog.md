# TaskFlow Feature Freeze Backlog

Items deferred until after beta freeze period (3–6 weeks).

## P0 — Must fix before any release

None currently known.

## P1 — Must fix before general availability

None currently known.

## P2 — UX improvements (documented, non-blocking)

1. **A11y screen reader audit**: Formal audit with NVDA/VoiceOver for critical flows
2. **Large dataset E2E**: Automated test with 1000+ tasks to verify performance
3. **Monthly review date sensitivity**: Consider making test date-independent without clock freeze

## Future Ideas (post-freeze)

### Build & Release
- Remove legacy `.min.js`/`.min.css` siblings from source tree
- Retire `scripts/minify.py` once E2E tests no longer depend on it
- Add production artifact E2E (serve dist/ instead of source root)

### UX
- Empty state CTAs for primary views (Today, Inbox, Upcoming)
- Collapsed completed tasks visual treatment in Today
- Contextual header improvements per view
- AI contextual entry points per view

### Performance
- Bundle splitting for lazy modules
- Critical CSS optimization audit
- Large dataset rendering performance

### Quality
- Visual regression testing with Playwright screenshots
- Automated accessibility testing in CI
- Performance budget CI gate

### Features (post-freeze only)
- Advanced filtering/sorting in Today
- Project templates
- Habit scheduling improvements
- More report customization
