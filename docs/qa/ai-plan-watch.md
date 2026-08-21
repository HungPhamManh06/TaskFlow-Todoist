# Phase 6K — Opt-In Plan Watch + Smart Risk Alerts

## Overview

Phase 6K adds an **optional** Plan Watch layer that alerts users when their plan health meaningfully worsens. It is:

- **Disabled by default** — requires explicit user opt-in
- **Deterministic** — no Gemini calls in evaluation loop
- **Event-driven** — evaluates on app open, focus, sync, state changes
- **Read-only** — never modifies tasks or schedules
- **Privacy-safe** — no raw task text in system notifications by default

## Architecture

```
Current TaskFlow state
↓
Phase 6J deterministic Plan Health
↓
compare with previous health snapshot
↓
meaningful risk transition?
↓
Alert Candidate
↓
dedupe / cooldown / snooze / quiet-hours
↓
In-App Alert
↓
optional Browser Notification
↓
user opens alert
↓
Phase 6J explanation
or
Phase 6I Recovery Preview
↓
Review
↓
Confirm
```

## Settings (Device-Local)

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `false` | Master Plan Watch toggle |
| `browserNotifications` | `false` | System notification permission |
| `showTaskDetailsInSystemNotifications` | `false` | Task title on lock screen |
| `categories.riskIncrease` | `true` | Risk level increase alerts |
| `categories.infeasible` | `true` | Capacity infeasibility alerts |
| `categories.newConflict` | `true` | New hard conflict alerts |
| `categories.overload` | `true` | Day overload alerts |
| `categories.urgentUnscheduled` | `true` | Urgent unscheduled work alerts |
| `categories.capacityLoss` | `true` | Capacity drop alerts |
| `quietHours.enabled` | `false` | Quiet hours suppression |
| `quietHours.start` | `"22:00"` | Quiet hours begin |
| `quietHours.end` | `"07:00"` | Quiet hours end (cross-midnight) |

## Alert Categories

| Category | Severity | Example Trigger |
|----------|----------|----------------|
| `risk-increase` | watch | Task safe → at-risk |
| `infeasible` | urgent | Task at-risk → infeasible |
| `hard-conflict` | urgent | New TimeBlock overlaps session |
| `overload` | watch | Day goes from not overloaded → overloaded |
| `capacity-loss` | watch | Slack drops >70% |
| `missed-session` | urgent | Past session with remaining work |
| `urgent-unscheduled` | watch | New unscheduled urgent task |

## Cooldown

| Category | Cooldown |
|----------|----------|
| watch | 12 hours |
| at-risk | 6 hours |
| infeasible | 3 hours |
| hard-conflict | 6 hours |
| overload | 6 hours |
| capacity-loss | 6 hours |
| missed-session | 3 hours |
| urgent-unscheduled | 3 hours |

**Severity worsening overrides cooldown.**  
If alert escalates from watch → infeasible, new alert is allowed.

## Deduplication

Same fingerprint → no duplicate alert until:
- Severity worsens
- Condition resolves then returns
- Cooldown period expires

## Snooze

- 1 hour
- Until tomorrow
- Dismiss (permanent until condition changes)

## Quiet Hours

- Cross-midnight handling (22:00 → 07:00)
- Only suppresses **system notifications**
- In-app alerts are still stored
- No retroactive flood when quiet hours end

## Browser Notification Permission

- **Never** requested on boot
- Only after user gesture: `[Bật thông báo trình duyệt]`
- Denied → "Thông báo trình duyệt đang bị chặn. Cảnh báo trong ứng dụng vẫn hoạt động."
- Plan Watch works without notification permission

## System Notification Throttle

- Max 3 system notifications per hour
- Summary fallback: 4+ urgent → one combined notification
- Privacy: task names hidden by default

## Storage

- Device-local: `taskflow-plan-watch-v1`
- History: `taskflow-plan-watch-history-v1`
- Max 100 alerts or 30 days (whichever first)
- Corrupt storage → safe reset to defaults

## Evaluation Triggers

- App open / resume / focus
- Task completion / creation / edit
- TimeBlock creation / move / delete
- Sync merge completion
- Google busy refresh
- Plan conversion / apply
- Recovery applied
- Optional: 30-min foreground timer

**No background polling.**  
**No server push.**  
**No Gemini in watch loop.**

## Alert Center

Compact in-app area showing:
- Active unresolved alerts
- Snooze / dismiss buttons
- CTA: "Xem chi tiết" → Plan Health
- CTA: "Xem kế hoạch phục hồi" → Recovery Preview

No new primary navigation item.

## Alert → Action

| Alert Action | Route |
|-------------|-------|
| `open-health` | Phase 6J Plan Health report |
| `open-recovery` | Phase 6I Recovery Preview |

No direct mutation from alert actions.

## Natural Language Settings

Deterministic routing (no Gemini):
- "Bật plan watch" → enable
- "Tắt cảnh báo" → disable
- "Tạm ẩn cảnh báo" → snooze
- "Đặt lại cảnh báo" → reset
- "Kiểm tra ngay" → manual check

Ambiguous requests → clarify.

## Privacy

| Data | In System Notification | In In-App Alert |
|------|----------------------|-----------------|
| Task title | No (default opt-in) | Yes |
| Task notes | Never | No |
| Calendar titles | Never | No |
| Reflection/Mood | Never | Never |

## Known Limitations

- Plan Watch evaluates when TaskFlow has an opportunity to evaluate state
- Browser/OS restrictions may prevent checks while app is closed
- V1 does not guarantee continuous monitoring
- No server-side push notifications

## Files Changed

- `js/ai-plan-watch.js` — Core Plan Watch module
- `js/ai-intent.js` — Settings intent classifier
- `js/app.js` — Lazy-loading integration
- `js/i18n.js` — I18n keys (VI + EN)
- `tests/phase6k-plan-watch.test.mjs` — Tests
- `docs/qa/ai-plan-watch.md` — This document
