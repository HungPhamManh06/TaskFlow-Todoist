# Phase 5C — Agent Review & Granular Approval

## Selection Lifecycle

1. Gemini proposes actions → server sanitizes → client validates → dry-run
2. Review card renders with per-action checkboxes (all selected by default)
3. User may:
   - Select/deselect individual actions
   - Edit safe proposal parameters inline
   - Review update diffs
   - See dependency relationships
4. User clicks Confirm → selected subgraph revalidated → applied

## Dependency Selection Rules

- **Deselect parent** → auto-deselect all transitive descendants
- **Select child** → auto-select all transitive ancestors
- Prevents executing an invalid dependency subset

## Editable Fields

| Action Type | Editable Fields |
|-------------|----------------|
| create_task | text, date, duration, priority |
| schedule_task | date, start, duration |
| reschedule_task | date, start, duration |
| update_task | text, date, duration, priority |
| complete_task | none |

**No action type can be changed.** Only arguments may be edited.

## Validation

- Live validation on blur/change
- Duration: 1–480 minutes
- Date: YYYY-MM-DD format
- Start: HH:MM format
- No midnight-crossing

## Confirm-Time Revalidation

After user edits and selection:
1. Apply edits to proposal clone
2. Filter to selected actions only
3. Revalidate against current TaskFlow state
4. Dry-run the selected subgraph
5. Execute with rollback on failure

## Transaction Safety

- Selected actions still use Phase 4C topological ordering
- Runtime entity resolution for action-produced dependencies
- Rollback on partial failure
- Double-confirm guard (applying flag)

## Privacy

- Review state is ephemeral (never persisted)
- No localStorage, no sync, no server storage
- No message text in logs
- No UIDs in UI labels

## Files Changed

- `js/ai-agent-runtime.js` — review state, selection, editing, revalidation
- `css/styles-critical.css` — checkbox, edit panel, summary, diff styles
- `js/i18n.js` — VI + EN keys for review UI
- `tests/phase5c-review-approval.test.mjs` — 37 test cases
