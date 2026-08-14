# V1.6 — Google Calendar Integration: Design & Shipped State

> **Status — UPDATED (2026-08-14):**
> - ✅ **V1.6A (read-only)** — SHIPPED `3a9303c`
> - ✅ **V1.6B (export one-way)** — SHIPPED `3af20a1`
> - ✅ **V1.6C (push-only propagation)** — SHIPPED `84eaa51`
> - ⏸ **Full two-way sync (pull-back)** — **DEFERRED** (reasons in §9). This design doc's
>   original conflict-engine section (§5 of the first revision) remains as the *reference
>   blueprint* for pull-back, explicitly not built.
>
> Trust direction is **TaskFlow → Google**. Google Calendar plays two roles only:
> (a) busy-window input for the rule-based planner (read-only), (b) a push-only mirror of
> TimeBlocks the user explicitly exports. There is **no automatic two-way sync**, no
> background poller, and the global `planner-*` sync conflict model is untouched.

---

## 1. Shipped state (verified on disk, HEAD `84eaa51`)

| Area | Shipped behavior | Evidence |
|---|---|---|
| Google OAuth — read connect | `GET /api/calendar/connect` → scopes `openid email profile calendar.readonly`, `access_type=offline`, `prompt=consent`, state-bound callback | `server/gcal.js:144,187` |
| Google OAuth — write connect | `GET /api/calendar/connect-write` → adds `calendar.events`; requested **only when the user enables export**; re-consent re-issues refresh token | `server/gcal.js:166` |
| Token lifecycle | `google_access_token / google_refresh_token / google_token_expires_at / google_scopes / google_connected_at` columns; `withFreshGoogleToken` refresh + one retry; refresh `invalid_grant` → clears google columns → endpoints return `google-disconnected` | `server/schema.sql`, `server/gcal.js` |
| Read endpoints | `GET /api/calendar/status` (`{connected, write, calendars}`, list cached 1h) · `GET /api/calendar/events?timeMin&timeMax` (all user calendars, read-only merge) | `server/gcal.js:225,253` |
| Export (create) | `POST /api/calendar/export` — validate blockId/title/range (end > start, ≤ 24h), 410 when disconnected, 403 `write-scope-required` without write scope, create one Google event, **idempotent** (existing mapping → return old mapping, no second event), retry once on transient 5xx, persistent failure → 502 with **no mapping saved** | `server/gcal.js:324` |
| Export (update, push-only) | same route with `update:true` → **PATCH** the existing Google event (same event id) with new time/title; 409 `no-mapping` when not exported; retry + 502 semantics as create | `server/gcal.js:324` |
| Unlink (delete, gated) | `POST /api/calendar/unlink` — `deleteEvent:true` only when user enabled `syncDeletes` (default **off**) → DELETE event (404 = already gone → ok); `deleteEvent:false` → remove mapping only, event kept; idempotent noop without mapping | `server/gcal.js:473` |
| Disconnect | `POST /api/calendar/disconnect` — clear google columns + best-effort revoke; client clears cache + mapping mirror | `server/gcal.js:513` |
| Mapping store | **Server DB** table `google_cal_mapping` (`user_id, taskflow_block_id, google_event_id, calendar_id, last_synced_at`, unique `(user_id, taskflow_block_id)`) + **client mirror** `planner-gcal-mappings` (offline badge + duplicate guard). No `hash`/`state` fields (deviation — see §8) | `server/schema.sql`, `js/gcal.js:300-314` |
| Frontend module | `js/gcal.js` (`window.TaskFlowGCal`): `normalizeEvents`, `localDayRange`, `eventsForDate`, `busyForDate`, `mergeAndSort`, cache `planner-gcal-cache` (TTL 15 min, stale-while-revalidate), `buildBlockISO` (date+HH:mm → ISO instant in device tz), `exportBlock` (create/update, client-idempotent), `unlinkBlock`, `getSyncDeletes`/`setSyncDeletes` (local-only flag) | `js/gcal.js` |
| Busy-window merge | planner `openPlannerModal` merges `[...todayBlocks, ...TaskFlowGCal.busyForDate(cache, today)]` — `planner-rules.js` untouched | `js/app.js` |
| UI | Day view: read-only "Sự kiện Google" list (muted/dashed, distinct from TimeBlocks, no task conversion). Schedule view: per-block **"Add to Google Calendar"** action → exported badge; block edit propagates time change to Google (PATCH); block delete unlinks (DELETE only with syncDeletes). More sheet: status + Connect / Enable write / syncDeletes toggle / Disconnect | `js/gcal-ui.js`, `js/app.js`, `js/i18n.js` |
| Cache versions | SW `taskflow-v223`, `app.min.js?v=181`, `gcal.min.js?v=3`, `gcal-ui.min.js?v=3` | `sw.js`, `app.html` |
| Privacy | Reflection/Mood never sent to Google or the calendar API; only task text + times in exported event payloads | `server/gcal.js`, `js/gcal.js` |

---

## 2. OAuth & token lifecycle (shipped, V1.6A)

### 2.1 Scopes (minimum, incremental)
- Login flow unchanged: `openid email profile`.
- **Read connect** (`/api/calendar/connect`): `openid email profile https://www.googleapis.com/auth/calendar.readonly`.
- **Write connect** (`/api/calendar/connect-write`) — requested **only when the user enables export**:
  adds `https://www.googleapis.com/auth/calendar.events` (minimal manage-events scope; never full `calendar`).
- OAuth params add `access_type=offline` and `prompt=consent` (re-consent on scope upgrade also re-issues the refresh token).

### 2.2 State binding
1. Frontend: `GET /api/calendar/connect?write=0|1&token=<jwt>` (JWT verified server-side).
2. Backend creates `state = nonce`, stores `{flow:'calendar', write, userId, created}`, redirects to Google.
3. Callback verifies state → stores tokens on the user row → redirects `APP_URL?cal=ok` (or `?cal=error=…`). Frontend reads `cal` param, clears it, refreshes status.

### 2.3 Token persistence (additive schema — `add column if not exists`)
```sql
alter table users add column if not exists google_access_token text;
alter table users add column if not exists google_refresh_token text;
alter table users add column if not exists google_token_expires_at timestamptz;
alter table users add column if not exists google_scopes text;
alter table users add column if not exists google_connected_at timestamptz;
```
- `google_scopes` lets the server answer "write yet?" without asking the client.
- Tokens never leave the server; the client only sees `{connected, write, calendars}`.

### 2.4 Token refresh + expiry
- `withFreshGoogleToken(userId)`: if `expires_at < now+60s`, POST `oauth2.googleapis.com/token` with the refresh token; persist new access token; retry the Google call once.
- Refresh failure (`invalid_grant`) → clear google columns → endpoints return `google-disconnected` → UI shows reconnect banner. Mapping store + cache preserved.
- Google 401 → refresh once → retry once → else disconnected.

---

## 3. Event layer — `js/gcal.js` (shipped)

- `normalizeEvents(items, calendarId)` → `{key: calId:id, id, calendarId, summary, allDay, startMs, endMs}`. Timed events parsed from `dateTime` with explicit offset (JS Date handles DST; tested across boundaries). All-day from `date` (end exclusive).
- `eventsForDate(events, localDateStr)` / `busyForDate(events, localDateStr)` → `[{start:'HH:mm', end:'HH:mm', status:'planned'}]` for planner free-window merge. All-day events shown in the list but **not** fed into HH:mm slot math (documented choice).
- `mergeAndSort(events)` → dedup by `key`, sort by `startMs`.
- Cache `planner-gcal-cache` `{version:1, fetchedAt, events}` — TTL 15 min, stale-while-revalidate on view open, offline → cache + "last synced" stamp, fetch failure → cache + error note. Never blocks the app.
- `buildBlockISO({date, start, end})` → `{startIso, endIso}` computed in the **device's local timezone** — the event carries the correct instant regardless of the calendar's timezone. `null` when range invalid (end ≤ start, malformed) — cross-day blocks are rejected by design.

---

## 4. Mapping store (shipped — server DB + client mirror)

**Server (authoritative):** `google_cal_mapping` — unique `(user_id, taskflow_block_id)`.

```
user_id | taskflow_block_id | google_event_id | calendar_id | last_synced_at
```

- Created/updated/removed by `/export` and `/unlink` (idempotent, upsert with `on conflict`).
- The unique key is the anti-duplicate guard: a second `/export` for the same block returns the existing mapping without creating a new event.

**Client (mirror, offline):** `planner-gcal-mappings` `{version:1, mappings:[…]}` — mirrors rows for badge display and to prevent duplicate server calls while offline. Not authoritative; reconciled on every successful server response.

**Deviation from the original design:** the doc proposed `planner-gcal-map` with `hash` (field fingerprint) and `state` (`pending|synced|local-only|remote-deleted`), plus a `taskflowBlockId` private extended property on the Google event for lost-mapping recovery. **None of these were shipped** — dedup relies on the server unique key instead (simpler, and the mapping row survives disconnects). Consequences are logged in §8.

---

## 5. Conflict model — shipped subset vs deferred engine

**Global sync is untouched** (generic `planner-*`, LWW by server `updated_at`, debounced push). Calendar has its own, explicit rules:

### 5.1 Shipped (push-only)
1. **Block exported, then edited in TaskFlow** → block save detects a mapping + time change and calls `/export` with `update:true` → Google event PATCHed to the new time/title (same event id). Best-effort: offline failure is silent and self-heals on the next online edit; 403 prompts re-granting write scope.
2. **Block deleted in TaskFlow** → `/unlink`:
   - `syncDeletes` **off** (default): mapping removed, Google event **kept** (no data loss on the calendar).
   - `syncDeletes` **on**: Google event DELETEd (404 = already gone → ok), then mapping removed.
3. **Duplicate export / retry** → idempotent on both sides (client mirror + server unique key + retry-once for transient 5xx).

### 5.2 Deferred — full two-way (pull-back) blueprint (NOT built)
The original design's reconciliation engine — per-mapping LWW by side timestamp when both sides changed, remote-delete → block kept + `remote-deleted` state, pull-remote-when-local-clean — is **not implemented** and is **not planned** for the current roadmap (§9).

---

## 6. Backend routes (final shipped surface)

| Route | Purpose |
|---|---|
| `GET /api/calendar/connect` | OAuth redirect — read-only scope |
| `GET /api/calendar/connect-write` | OAuth redirect — adds `calendar.events` (only on user opt-in) |
| `GET /api/calendar/callback` | OAuth callback — verifies state, stores tokens |
| `GET /api/calendar/status` | `{connected, write, calendars:[{id,summary}], fetchedAt}` (calendar list cached 1h) |
| `GET /api/calendar/events?timeMin&timeMax` | merged events from all user calendars, read-only |
| `POST /api/calendar/export` | create event; with `update:true` → PATCH existing event (push-only propagation) |
| `POST /api/calendar/unlink` | remove mapping; `deleteEvent:true` (syncDeletes on) → DELETE event |
| `POST /api/calendar/disconnect` | clear google columns + best-effort revoke |

Auth: all calendar routes except `/connect*` and `/callback` require Bearer JWT. `server/index.js` exports `{ app, ensureSchema }` so server tests boot on ephemeral ports with pg-mem + stubbed global `fetch`.

---

## 7. Frontend UI (shipped)

- **More sheet → "Google Calendar"**: status row, Connect (read-only) / Enable write (export) / **syncDeletes toggle** / Ngắt kết nối. VI + EN, reuses existing sheet patterns.
- **Day view**: read-only "Sự kiện Google" list, class `gcal-event` (muted, dashed — visually distinct from TimeBlocks), no checkboxes, no task conversion. Connection banner when not connected.
- **Schedule view (TimeBlock timeline)**: per-block **"Add to Google Calendar"** action → exported badge (`calendar-check`, not a button → cannot re-trigger); block **edit** propagates the new time (PATCH); block **delete** unlinks (DELETE gated by syncDeletes).
- **Planner**: busy-window merge per §3. Nothing sent back to Google except the event the user explicitly creates/updates.
- Styling: Zen Linen palette, no new design language, no icon library additions (reused sprite `calendar` / `calendar-check`).

---

## 8. Tests (shipped)

- **Unit `tests/phase30-gcal.test.mjs`**: normalize (timed/all-day/offsets), eventsForDate, busyForDate (all-day excluded), mergeAndSort dedup, cache TTL + stale, DST boundaries, leap-day date, multiple calendars.
- **Unit `tests/phase32-gcal-write.test.mjs`** (18): buildBlockISO (valid / end ≤ start / roll-over), mapping mirror upsert + malformed store, exportBlock idempotent (duplicate → no server call), exportBlock update (409 no-mapping, PATCH body, mapping preserved), unlinkBlock (noop, deleteEvent false/true, failure keeps mapping), syncDeletes flag default off.
- **Server `test-server-calendar.js`** (read-only: auth, status, events proxy, token refresh, callback state rejection) and **`test-server-calendar-write.js`** (16: auth, validation, 410/403, status write flag, create + mapping, duplicate idempotent, retry, persistent 502 no-mapping, update 409/PATCH/retry/502-keeps-mapping, unlink keep/delete/noop).
- **E2E `scripts/e2e-frontend.py`**: `gcal_checks` (read-only render from stubbed routes) and `gcal-write` (export → badge → mirror; duplicate no second call; **edit → PATCH update:true; delete gated deleteEvent:false; syncDeletes on → deleteEvent:true**) — green on Chromium + Firefox + WebKit, desktop + mobile.
- **Regression**: full gates — unit, sync 13/13, server security/AI/calendar suites, full Chromium E2E matrix, smokes, mobile QA, a11y, dark contrast, CSS verifier, `minify --check`, offline/SW smoke (v223). All green on `84eaa51`.

---

## 9. Why full two-way (pull-back) is deferred

1. **Trust direction.** TaskFlow is offline-first and the primary planning surface. Google Calendar is a mirror/busy-input, not the source of truth. Pull-back (Google edits → TaskFlow) only pays off when the user edits events on their phone — not the core pattern of this product.
2. **Conflict engine is the most complex surface in the app.** Fingerprint hashing, per-mapping LWW, both-edited-offline, remote-delete vs local-edit, cancelled one-way — and it cannot be integration-tested against real Google in CI (stub-fetch only). Cost is high, value is niche.
3. **Data-loss surface.** `syncDeletes` is default-off by design; pull-back adds remote-delete handling that risks deleting blocks the user still wants.
4. **User-confusion risk.** Global sync already has its own LWW model; a second rule set for calendar sync must never fight it.

**Replacement that shipped:** push-only propagation (§5.1) — ~90% of the practical value (Google always mirrors TaskFlow correctly after edits) at a small fraction of the complexity, with zero conflict engine and no automatic deletion.

**Reopen pull-back only if:** real users report editing events in Google and expecting TaskFlow to follow. Until then the blueprint in §5.2 stays on the shelf.

---

## 10. Known debt (deviations from original design)

| Debt | Impact | Notes |
|---|---|---|
| No `hash`/`state` on mappings | Cannot tell *which side* changed since last sync — irrelevant for push-only, required for pull-back | If pull-back is ever reopened, add `hash` column (additive) + reconciliation engine per §5.2 |
| No `taskflowBlockId` private extended property on Google events | Lost server mapping row cannot be recovered by querying Google — a second export would create a duplicate | Low risk: mapping row survives disconnects and is only cleared by explicit unlink/disconnect; if needed later, set the ext prop on next PATCH |
| Sync only on explicit user action or block mutation | A block edited while offline then synced has its Google event updated only on the *next* online block edit | Acceptable per push-only scope; a periodic reconcile ("Đồng bộ ngay" in the More sheet) can be added without a background poller |
