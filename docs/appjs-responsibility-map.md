# P1.7 — app.js Responsibility Map

> Deliverable của phase hardening. Mục tiêu: **clear responsibility boundaries**, không phải "app.js phải dưới X dòng".
> Quy tắc: chỉ extract subsystem **LOW risk** trước; mỗi extraction = một commit riêng; sau extraction phải xóa code cũ + test + E2E + console + git diff.

## 1. Bức tranh hiện tại (sau extractions #28–#37)

| Metric | Giá trị |
|---|---|
| `js/app.js` | **5.870 dòng, ~227 hàm** (từ 7.463 dòng / ~812 hàm — bản đồ gốc) |
| Module đã tách (trong `js/`) | **44 source** (43 module + app.js) |
| Boot chain (`app.html`) | **38 script** synchronous cuối `<body>`; 5 module action-gated (chat/search/quick-add/year-report/digest) load qua `runLazyModule` (P1.5) |
| Extractions #28–#37 | **10 pass** (~1.595 dòng rời app.js): popups, config, export-builders, widget, xp, streak-ui, today, report-ui, upcoming, focus-stats |

### 1.1 Các module đã tách (không còn trong app.js)

**Boot + destructure guard (fail-fast):**

| Module | API expose qua guard | Ghi chú |
|---|---|---|
| `ui.js` (TaskFlowUI) | `toast` (50 refs — module được dùng nhiều nhất) | toast/popover/tooltip |
| `shell.js` (TaskFlowShell) | `monthKey, updateBrand, buildMonthNav` | brand + month nav |
| `account.js` (TaskFlowAccount) | `BADGES_KEY, hasAccount, defaultYearState, emptyYearState, loadBadges, saveBadges` | account/auth + badges storage |
| `goals.js` (TaskFlowGoals) | `monthPctOf, monthGoalsOf` | goal calc thuần |
| `storage.js` (TaskFlowStorage) | `POMO_LOG_KEY, monthStateRaw, saveMonthState, loadPomoLog, savePomoLog, backupSlotKey` | month-state storage |
| `util.js` (TaskFlowUtil) | `esc, localISODate, formatFocusTime, lineChartSVG` | pure utils |
| `i18n.js` (TaskFlowI18N) | `I18N, t, monthLabel, dayLabel, fmtDeadline, dateLocale, getLang, setLangCore, applyStaticI18N` | i18n core |
| `clock.js` (TaskFlowClock) | `nowInfo, renderClock` | clock + week/day calc |
| `theme.js` (TaskFlowTheme) | `systemPrefersDark, darkIsOn, applyDark, toggleDark` | theme + dark mode |
| `analytics.js` (TaskFlowAnalytics) | `GA4_ID, GA4_ENABLED, initAnalytics, trackEvent` | GA4 |
| `remind.js` (TaskFlowRemind) | `getRemindTime, setRemindTime, requestRemindPermission, registerPeriodicReminder` | reminder core |
| `remind-ui.js` (TaskFlowRemindUI) | `syncReminderTimers, renderRemindList, insertBeforeTaskActions, beginRemindEdit, turnOffRemind` | reminder UI (render path) |
| `export.js` (TaskFlowExport) | `downloadFile, collectAllData, exportJSON, exportCSV, exportICS` (+ private `csvRow/icsEscape/icsDayFromDay/legacyCSVRows`) | export primitives **+ builders (extraction #30)** |
| `mood.js` (TaskFlowMood) | `loadMood, saveMood, moodCardHTML, openMoodPicker, closeMoodPicker, rerenderMoodCard` | mood tracker (render path) |
| `fab.js` (TaskFlowFab) | `loadFabPos, saveFabPos, clampFabPos, initFabDrags, fabTuckAllowed, nearestTuckEdge, tuckOffset, initFabTuck` | FAB drag/tuck (boot destructure) |
| `config.js` (TaskFlowConfig) | `HABIT_DEFS, GOAL_DEFS, WEEK_PATTERNS, REFLECT_PROMPTS_MONTH, REFLECT_PROMPTS_WEEK` | seed data (extraction #29) |
| `widget.js` (TaskFlowWidget) | `widgetConfigKey, initWidgetConfig, saveWidgetConfig, getVisibleWidgets, setLang, setTheme, prefersReducedMotion, registerSW` | widget config + bootstrap glue (extraction #31) |
| `xp.js` (TaskFlowXP) | `xpTotal` (private), `loadXP, saveXP, xpLevelInfo, addXP, removeXP, renderXP, habitPct, dayPct, donutSVG, checkboxHTML` | XP + pure render helpers (extraction #32) |
| `streak-ui.js` (TaskFlowStreakUI) | `weekHabitPct, weekCompareHTML, dayAggregateAt, heatHeroHTML, heatRibbonHTML, habitMiniHTML, habitHeatCardHTML, shareTopInfo, canvasCircle, streakCardBlob, doShareStreak` | streak/heatmap renderers + share card (extraction #33) |
| `today.js` (TaskFlowToday) | `todayGreeting, todayWeekdayLabel, renderToday, totalFocusMinutesToday, taskRowHTML` | Today render (default boot view — extraction #34) |
| `reflection.js` (TaskFlowReflection) | `dailyKey, normalizeEntry, summaryFrom, groupByMonth` (pure), `loadReflections, saveReflections, getEntry, setEntry`, `reflectionCardHTML, rerenderCard, dailySummaryData, setMood, saveQuickFromCard, onFieldInput, openDeepReflection, closeDeepReflection, saveDeepFromModal, openHistoryEntry, openHistory, closeHistory, historyHTML` | Daily Reflection (P1: quick + deep + summary + history, `planner-reflections-daily` — feature module, boot destructure `loadReflections`) |
| `report-ui.js` (TaskFlowReportUI) | `monthlyReportData, renderReportModal, open/closeReportModal, reportCardBlob, doShareReport, weeklyReportData, lastWeekReportData, vsCell, focusReportBars, renderWeekReportModal, open/closeWeekReportModal, weekReportCardBlob, doShareWeekReport` | month/week report UI (extraction #35) |
| `upcoming.js` (TaskFlowUpcoming) | `setUpcomingRange, tasksForDate, upcomingOverdueTasks, upcomingCollect, upcomingDayHeader, upcomingTaskMeta, upcomingTaskRowHTML, renderUpcoming, pushTaskToDate` | Upcoming view (extraction #36); `upcomingRange` là state riêng của module |
| `focus-stats.js` (TaskFlowFocusStats) | `pomoDaySecs, focusWeekMinutes, focusMonthMinutes, topFocusTasksInWeek, topFocusTasksInMonth, taskFocusMinLabel` (+ private `taskFocusSecsInRange`) | focus/pomo stats helpers (extraction #37) |
| `popups.js` (TaskFlowPopups) | `confettiBurst, templatesPopHTML, demoPlan` (+ seed/import helpers) | popup/demo/templates (extraction #28) |

**Boot + resolve tại call time (không destructure):** `inbox.js`, `streak.js`, `stats.js`, `planmini.js`, `keys.js`, `habits.js`, `dates.js`, `syncui.js` (mỗi module ~3 refs `window.TaskFlowX`).

**Lazy (P1.5, qua `ensureLazyModule`/`runLazyModule`):** `chat.js`, `search.js`, `quick-add.js`, `year-report.js`, `digest.js` — không còn trong boot chain, load khi action đầu tiên.

**Pattern đã kiểm chứng qua 10 extraction (#28–#37):** UMD + guard fail-fast + destructure alias ở app.js; module resolve `t/state/PLAN_*` qua **global lexical tại thời điểm GỌI** (mood.js/popups.js). Đã chứng minh chiều ngược: `report-ui.js`/`year-report.js` (module) gọi `focusReportBars`/`focusMonthMinutes`/`taskFocusMinLabel` — vốn là hàm app.js đã alias từ destructure — resolve ngược qua cùng cơ chế, không cần import trực tiếp. Không có circular import nào xuất hiện.

## 2. Bản đồ trách nhiệm HIỆN TẠI (app.js 5.870 dòng)

**Chú thích rủi ro:**
- **LOW** — self-contained, ít phụ thuộc global state/DOM, API nhỏ → extract an toàn.
- **MEDIUM** — phụ thuộc vừa phải; extract được nhưng cần truyền dependency rõ ràng.
- **HIGH** — gắn chặt global state/DOM/render path → chỉ extract khi có lý do thực sự, hoặc để nguyên.

| # | Region (dòng) | Responsibility | Dependencies | Global state | DOM coupling | Risk | Extract? |
|---|---|---|---|---|---|---|---|
| A1 | 3–34 | `ensureLazyModule`/`runLazyModule` — lazy loader (P1.5) | none | none | inject `<script>` | LOW | **không** — infra boot, giữ ở composition root |
| A2 | 35–61 | Plan globals: `MONTH_NAMES, PLAN_YEAR/MONTH, NUM_DAYS/WEEKS, PLAN_START/END, initPlan` | none | `PLAN_*` đọc khắp nơi | none | HIGH | **không** — boot state, mọi module đọc qua lexical |
| A3 | 61–272 | Year/plan state: `yearKey, capturePlan/restorePlan, defaultMonthPct, loadYearState, yearState, saveYear, yearGoalStats, yearMonthlyCache/Data, invalidateYearCache, loadMonthStateOrCreate, toggleMonthGoal, toggleQuarterGoal, pullYearGoalsFromMonths, quarterStats` | storage, goals, account | `state`, `yearState`, `viewedMonth`, cache | none | HIGH | **không** — core state |
| A4 | 272–323 | Widget defs: `WIDGET_DEFS_OVERVIEW/YEAR` | none | đọc bởi widget.js + render | — | LOW | **không** — data của composition root; widget.js đọc qua lexical |
| A5 | 323–387 | Theme/PWA globals: `THEME, THEMES, DARK, deferredPrompt` + install listeners | theme.js | `THEME`, `DARK` | install prompt | LOW–MED | **không** — ~60 dòng, event wiring |
| A6 | 387–438 | Reminder glue: `enableReminder, disableReminder, checkDailyReminder` + `lastRemindDay` | remind.js, i18n | reminder state | header bell, Notification | MED | tùy chọn — ~50 dòng, giá trị thấp |
| A7 | 438–489 | Recurrence: `beginRepeatEdit, applyRecurrence` | state, i18n | `state` | repeat modal DOM | MED | tùy chọn — phụ thuộc `setView/renderCurrentView` |
| A8 | 489–540 | Import JSON/popup glue: `importJSONFile, togglePop` | export, storage, UI | `state` | file input, popup | MED | ✅ **ứng viên** — gộp A8+A9 thành import glue |
| A9 | 540–650 | Import CSV + data/guards: `MOOD_KEY, MOODS, moodMap` (data), mood/keys/habits guards, `importCSVFile` | plan-stats, storage, keys, habits | `state`, `yearState` | file input | MED | ✅ ứng viên — `importCSVFile` tách; mood data giữ lại |
| A10 | 650–850 | Persistence: `defaultState, loadState, emptyState, bootState, bootYearState, rebootState` + `state, inbox, save` | storage, account, keys | `state` (global) | none | HIGH | **không** — trái tim persistence |
| A11 | 850–922 | Reflection + overview metric: `getRefQuestion, saveRefQuestion, reflectionHTML, overviewMetricSnapshot, syncOverviewMetrics, syncOverviewFocus` | storage, sync | `state` | reflection DOM, metric cards | MED–HIGH | tùy chọn — gắn sync + render path |
| A12 | 922–1272 | **Overview render**: `renderOverview` + 8 builders | i18n, clock, stats, mood, remind-ui, habits | `state`, `viewedMonth` | toàn bộ #overview DOM | HIGH | **không** — render path chính |
| A13 | 1272–1560 | Badges + CRUD: `BADGE_DEFS, badgesStore, countActiveDays, evaluateMonthBadges, badgePanelHTML, refreshHeatCard, showGoalAdd, addGoal, removeGoal, addHabit, removeHabit, copyHabitsToNextMonth, beginTargetEdit, beginTagEdit, refreshHabitLabels, beginInlineEdit` | account, storage, UI, undo | `state`, `badgesStore` | badge panel, inline edit DOM | MED–HIGH | tùy chọn — chỉ tách badge calc thuần (`countActiveDays`/`evaluateMonthBadges`) nếu muốn; CRUD gắn undo + render |
| A14 | 1560–1826 | **Year render**: `renderYear` + 11 builders | i18n, stats, goals, habits | `state`, `viewedYear` | toàn bộ #year DOM | HIGH | **không** — render path |
| A15 | 1826–2096 | **Week/Day render**: `tagFilter/calendarTagFilters, weekTagFilterBar, renderWeek` + 8 builders | i18n, clock, mood, plan-math | `state`, `viewedMonth`, `tagFilter` | toàn bộ #week/#day DOM | HIGH | **không** — render path |
| A16 | 2096–2367 | **Task Detail**: `taskDetailRef/MonthState, taskDetailState, saveTaskDetailState, getTaskDetailTarget, openInboxTaskDetail, openTaskDetail, closeTaskDetail, refreshTaskRowAfterEdit, renderTaskDetail, bindTaskDetailEvents` (+ dblclick listener ở A29) | storage, i18n, keys, inbox | `taskDetail` state | #taskDrawer DOM + events | MED–HIGH | tùy chọn — event-heavy + refresh chéo view; chờ |
| A17 | 2367–2547 | Calendar + template: `calendarDayEntries, calendarTaskMatches, calendarVisibleTasks, calendarDayPct, calendarTagFilterBar, calendarTasksHTML, renderCalendar, open/closeTemplateModal, copyMonthTemplate` | i18n, stats, habits | `calendarTagFilters` (dùng chung với A15) | #calendar DOM, modal | MED–HIGH | tùy chọn — filter state dùng chung với week view |
| A18 | 2547–2710 | **Pomodoro timer**: `pomo` state, `renderPomo, pomoDuration, pomoSync, pomoComplete, pomoStart, pomoReset, pomoSetMode, togglePomoPanel, pomoAddSession, pomoWeekSecs` | storage, i18n, focus-stats | `pomo`, `pomoEndAt` | pomo panel | MED | ✅ **ứng viên #3** — timer state machine + panel |
| A19 | 2710–2753 | Year focus helpers: `focusMonthMinutesFor, focusYearByMonth, topFocusTasksInYear` | storage, keys | — | none | LOW–MED | ✅ **ứng viên** — gộp vào `focus-stats.js` (họ hàng của #37) |
| A20 | 2753–3020 | Stats modal + focus chart: `statsRange, statsWeekStartOf, statsMonthsForRange, statsWeekLabel, statsMonthLabel, statsData, statsCorrelation, statsScatterSVG, renderStatsModal, open/closeStatsModal, focusChartCardHTML, renderPomoWidgetStats, renderPomoTomatoCounter` | stats.js, storage, i18n | `statsRange` | stats modal, charts | MED | ✅ **ứng viên #4** — `stats.js` đã tách core calc; đây là modal UI còn lại |
| A21 | 3020–3038 | Chat Enter shortcut: keydown cho chatInput/quickAddInput (lazy) | lazy modules | none | chat input | LOW | **không** — ~20 dòng glue |
| A22 | 3038–3245 | Year dashboard + widget settings + profile: `bestHabitAcrossYear, bestProductiveDay, yearDashboardHTML, open/close/renderWidgetSettingsModal, setFieldError, clearFormErrors, open/closeProfileModal, doChangePassword, doDeleteAccount` | account, i18n, UI, sync, widget | `state` | modals, account forms | MED–HIGH | tùy chọn — account ops gắn sync; year dashboard là render |
| A23 | 3245–3566 | Nav/shell/tooltips: `isSidebarCollapsed, applySidebarCollapse, toggleSidebarCollapse, sidebarTooltipLayer/Host, show/hideSidebarTooltip, shellNavLabel, MORE_SHEET_VIEWS, buildNav, updateNav, renderShellIcons, updateShellContext, openMoreSheet, closeMoreSheet, openToolsDrawer, closeToolsDrawer` | shell.js, i18n, keys | `nav` state | toàn bộ sidebar/bottom-nav/more-sheet DOM | MED | ✅ ứng viên — gộp vào `shell.js` (nav build còn sót) |
| A24 | 3566–3696 | **View switching**: `setView, goWeek, openMonth, openYear` (+ quick-add guard comment) | mọi renderer | `state`, `viewedMonth` | view container | HIGH | **không** — bộ điều phối trung tâm |
| A25 | 3696–3806 | Undo/redo + shortcuts: `undoStack, lastSnapshotJson, snapshotAll, pushUndo, applySnapshot, renderCurrentView, doUndo, doRedo, updateUndoButtons, toggleSearchModal, focusTodayTaskAdd` | plan-math, mọi renderer | `state`, `undoStack` | view container | HIGH | **không** — trạng thái undo toàn cục |
| A26 | 3806–3955 | Drag & drop: `dragState` + dragstart/dragover/dragleave/drop/dragend listeners | state, storage | `dragState`, `state` | task/group DOM | MED | tùy chọn — self-contained nhưng thao tác state trực tiếp + undo |
| A27 | 3975–4042 | Backups: `rotateBackup, lastBackupTs, maybeAutoBackup, listBackups, openBackupModal, closeBackupModal, doRestoreBackup` | storage, UI, i18n | `state` (snapshot) | backup modal DOM | MED | ✅ **ứng viên #1** — API nhỏ (6 fn), self-contained, call-sites rõ (save→maybeAutoBackup, dispatcher 4355–4357, outside-click 5553) |
| A28 | 4042–4295 | **Focus mode**: `focusTaskRef, open/closeFocusMode, focusMonthState, focusState, saveFocusState, getFocusedTask, taskFocusLog/Secs/Today/Sessions, FOCUS_PRESETS, focusTimer, focusTimerRender/Sync/Complete/Start/Reset/SetDur, getTaskByUid, renderFocusContent, refreshFocusIfOpen, fmtSessionDate` | storage, i18n, UI, focus-stats | `focusState`, `focusTimer` | #focusMode DOM + timer | MED | ✅ **ứng viên #2** — timer tự bind sự kiện trong region (4131); đã gần self-contained |
| A29 | 4295–5272 | **Event dispatchers**: click dispatcher (~730 dòng) + change/dblclick/input/focusin/keydown listeners + `taskDetailDblClickListener` + `saveSoon/saveYearSoon/saveInboxSoon/saveTaskDetailStateSoon/flushPendingSaves` | mọi module | `state` | toàn bộ DOM events | HIGH | **không** — wiring layer; chỉ tách branch khi có lý do |
| A30 | 5272–5383 | Post-toggle updates: `afterGoalToggle, afterYearGoalToggle, afterHabitToggle, afterWGoalToggle, refreshTaskUI` | storage, XP, sync, undo | `state` | task DOM | HIGH | **không** — mutation + render xen kẽ |
| A31 | 5383–5434 | Carry-over: `newTaskUid, ensureTaskUid, carryOverRepeatTasks, carriedDateLabel, syncCarriedDone` | plan-carry, storage | `state` | task DOM | MED–HIGH | tùy chọn — core đã ở plan-carry.js; phần này là glue |
| A32 | 5434–5513 | Realtime refresh glue: `lastDayKey, lastRealWeek, viewedMonth, refreshToday, scrollWeekToToday` + visibilitychange/focus listeners | mọi renderer, sync | `state`, `viewedMonth` | toàn bộ view | HIGH | **không** — render coordinator |
| A33 | 5513–5681 | Cloud sync glue: `syncNow, toggleSyncModal, closeSyncModal, syncMode, setSyncMode, doSyncSignup/Login/Google/Logout, handleSyncChange` | sync.js, syncui, account | `syncMode` | sync modal | MED | ✅ **ứng viên #5** — form/modal glue; core đã ở sync.js |
| A34 | 5681–5773 | Onboarding: `obStep, obHasAnyData, obNeeded, obGoStep, startOnboarding, obFinish, obDoGoal, obDoHabits, obDoTheme, maybeStartOnboarding` | account, theme, storage | onboarding state | onboarding DOM | MED | ✅ **ứng viên #5** — wizard self-contained, gộp với A33 thành sync-forms |
| A35 | 5773–5870 | **Boot sequence**: ti0/lastRealWeek init, deeplink, `setTheme/applyDark/buildNav/loadMood/loadXP/setView`, sync init, `initAnalytics/registerSW/initFabDrags/reminder timers`, import input | tất cả | — | — | — | **không** — composition root, giữ nguyên |

## 3. Đánh giá: tiếp tục hay dừng?

**Đã hoàn thành:** 10 extraction (#28–#37), app.js từ **7.463 → 5.870 dòng** (−1.595, ~21%). Từng vùng LOW/MEDIUM self-contained đã được tách và kiểm chứng (tests 288/288, smoke 3 engine, full E2E, minify check).

**Còn 5 ứng viên đáng làm (MEDIUM, self-contained, theo thứ tự):**

1. **A27 — Backups** → `js/backup.js` (~70 dòng). API nhỏ (6 fn), call-sites rõ ràng (save, dispatcher, outside-click). Rủi ro thấp nhất còn lại.
2. **A28 — Focus mode** → `js/focus.js` (~250 dòng). Timer tự bind sự kiện trong region (4131) → đã gần self-contained; chỉ phụ thuộc `taskFocusLog` họ hàng + storage. Là vùng UI lớn nhất còn lại.
3. **A18 — Pomodoro timer** → `js/pomo.js` (~160 dòng). Timer state machine + panel; có thể gộp chung A19 (year focus helpers → focus-stats.js) ở cùng pass.
4. **A20 — Stats modal + focus chart** → `js/stats-ui.js` (~270 dòng). Core calc đã ở `stats.js`; phần còn lại là modal UI.
5. **A33+A34 — Sync/onboarding glue** → `js/sync-forms.js` (~190 dòng). Form/modal glue; core sync đã ở sync.js/syncui.js.

Nếu làm cả 5: app.js ≈ **4.800–4.900 dòng** (−~1.000 nữa, tổng −~2.600 so với gốc).

**Điểm dừng (SAU 5 ứng viên trên — không extract tiếp):**

- **HIGH không bao giờ chạm:** A3 (plan state), A10 (persistence), A12/A14/A15 (render overview/year/week), A24 (view switching), A25 (undo/redo), A29 (event dispatchers), A30 (task mutations), A32 (render coordinator), A35 (boot).
- **MED–HIGH tùy chọn nhưng KHÔNG nên:** A16 (task detail — event-heavy + refresh chéo), A17 (calendar — filter state dùng chung week view), A13 (badges CRUD — undo + render), A22 (profile — async + sync-coupled), A11 (reflection — sync-coupled), A26 (drag-drop — thao tác state trực tiếp), A31 (carry-over — glue mỏng), A23 (nav — buildNav gắn render path; chỉ tách nếu gộp sạch vào shell.js).
- Lý do: các vùng này cần **truyền dependency rõ ràng** (state refs, undo, render callbacks, event binding) — vi phạm quy tắc **API nhỏ** của P1.9 và làm architecture khó theo dõi hơn. Đúng tinh thần luật dừng: *"nếu extraction khiến architecture phức tạp hơn — không tiếp tục."*

**Kết luận:** tiếp tục có kiểm soát với đúng 5 ứng viên (#1–#5), mỗi pass một commit + tests + smoke 3 engine. Sau đó **dừng extraction**, chuyển trọng tâm sang QA cuối (mobile real-device, edge states, a11y, regression) — vì lợi ích còn lại của việc tách tiếp không bù được rủi ro chạm vào core dispatcher/render.

## 4. Quy tắc module (P1.9) — nhắc lại cho mỗi extraction

- Module mới phải có **responsibility rõ**, **API nhỏ**, không duplicate state, không copy-paste rồi giữ bản cũ.
- Không tạo **circular import** (UMD + resolve `window.*` tại call time đã tránh được điều này — giữ pattern).
- Không truy cập DOM toàn cục nếu không cần; nhận dependency qua tham số khi hợp lý.
- Sau extraction: **xóa implementation cũ** sau khi tests pass; không để dead code.
- Mỗi extraction: chạy `node --test`, smoke E2E 3 engine, mở app check console, review `git diff`, commit riêng.
- Nếu extraction làm architecture phức tạp hơn → **không tiếp tục**.

## 5. Trạng thái theo dõi

| Extraction | Module | Status |
|---|---|---|
| #1–27 | 34 module gốc trong `js/` | ✅ done (qua các phase P11) |
| #28 | `js/popups.js` — R9 popup/demo/templates | ✅ `commit` (P11 series) |
| #29 | `js/config.js` — R2 constants | ✅ |
| #30 | `js/export.js` — R8 export builders (gộp vào module có sẵn) | ✅ |
| #31 | `js/widget.js` — R4+R5 widget-config + bootstrap glue | ✅ |
| #32 | `js/xp.js` — R11 XP + donutSVG/checkboxHTML | ✅ |
| #33 | `js/streak-ui.js` — R14 streak/heatmap UI | ✅ |
| #34 | `js/today.js` — R19 Today render | ✅ |
| #35 | `js/report-ui.js` — R15 month/week reports | ✅ |
| #36 | `js/upcoming.js` — R25 Upcoming view | ✅ |
| #37 | `js/focus-stats.js` — focus/pomo stats helpers | ✅ |
| #38 | `js/backup.js` — A27 backups (lazy qua `ensureLazyModule` sau save + `runLazyModule` ở dispatcher, P1.2 opt#3) | ✅ `commit` (P1.2 series) |
| #39 (đề xuất) | `js/focus.js` — A28 focus mode | ⏳ |
| #40 (đề xuất) | `js/pomo.js` — A18 pomodoro timer (+ A19 → focus-stats.js) | ⏳ |
| #41 | `js/stats-ui.js` — A20 stats modal (lazy qua `runLazyModule`, P1.2 opt#3) | ✅ `commit` (P1.2 series) |
| P1 feature | `js/reflection.js` — Daily Reflection (quick/deep/summary/history, `planner-reflections-daily` + mirror mood) | ✅ P1 (Personal Growth series) |
| P2 feature | `js/pillars.js` — Monthly Life Pillars (template 3 trụ cột + CRUD + Monthly Focus, `state.pillars`) | ✅ P2 (Personal Growth series) |
| P3 feature | `js/pillars.js` — Monthly Metrics (HABIT/MANUAL/CUSTOM, linkedHabitId, day-count target, `state.pillars[].metrics`) | ✅ P3 (Personal Growth series) |
| #42 (đề xuất) | `js/sync-forms.js` — A33+A34 sync/onboarding glue | ⏳ |
| sau #42 | **DỪNG extraction** — chuyển sang QA cuối | ⏳ |

_Cập nhật file này sau mỗi extraction thành công._
