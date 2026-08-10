# P1.7 — app.js Responsibility Map

> Deliverable của phase hardening. Mục tiêu: **clear responsibility boundaries**, không phải "app.js phải dưới X dòng".
> Quy tắc: chỉ extract subsystem **LOW risk** trước; mỗi extraction = một commit riêng; sau extraction phải xóa code cũ + test + E2E + console + git diff.

## 1. Bức tranh hiện tại

| Metric | Giá trị |
|---|---|
| `js/app.js` | 7.463 dòng, ~812 hàm |
| Module đã tách (trong `js/`) | **34** (đã qua 27+ đợt extraction P11) |
| Cách nối module | UMD guard (`if (!window.TaskFlowX) throw ...`) + destructure alias, hoặc resolve `window.TaskFlowX` tại thời điểm gọi |
| Boot chain (`app.html`) | 30 script synchronous cuối `<body>`; 5 module action-gated (chat/search/quick-add/year-report/digest) load qua `runLazyModule` (P1.5) |

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
| `export.js` (TaskFlowExport) | `downloadFile, collectAllData, exportJSON` | export primitives |
| `mood.js` (TaskFlowMood) | `loadMood, saveMood, moodCardHTML, openMoodPicker, closeMoodPicker, rerenderMoodCard` | mood tracker (render path) |
| `fab.js` (TaskFlowFab) | `loadFabPos, saveFabPos, clampFabPos, initFabDrags, fabTuckAllowed, nearestTuckEdge, tuckOffset, initFabTuck` | FAB drag/tuck (boot destructure) |

**Boot + resolve tại call time (không destructure):** `inbox.js`, `streak.js`, `stats.js`, `planmini.js`, `keys.js`, `habits.js`, `dates.js`, `syncui.js` (mỗi module ~3 refs `window.TaskFlowX`).

**Lazy (P1.5, qua `ensureLazyModule`/`runLazyModule`):** `chat.js`, `search.js`, `quick-add.js`, `year-report.js`, `digest.js` — không còn trong boot chain, load khi action đầu tiên.

## 2. Bản đồ trách nhiệm (theo vùng trong app.js)

**Chú thích rủi ro:**
- **LOW** — self-contained, ít phụ thuộc global state/DOM, API nhỏ → extract an toàn.
- **MEDIUM** — phụ thuộc vừa phải; extract được nhưng cần truyền dependency rõ ràng.
- **HIGH** — gắn chặt global state/DOM/render path → chỉ extract khi có lý do thực sự, hoặc để nguyên.

| # | Region (dòng) | Responsibility | Dependencies | Global state | DOM coupling | Risk | Extract? |
|---|---|---|---|---|---|---|---|
| R1 | 1–27 | `ensureLazyModule` / `runLazyModule` — lazy script loader (P1.5) | none | none | inject `<script>` | LOW | **không** — infra của boot, giữ ở composition root |
| R2 | 28–115 | Constants mặc định: `DAYS, HABIT_DEFS, GOAL_DEFS, WEEK_PATTERNS, REFLECT prompts` | none | none | none | LOW | ✅ **ứng viên #1** — pure data, move sang `js/config.js` |
| R3 | 115–390 | Plan state: `initPlan, yearKey, capturePlan/restorePlan, loadYearState, saveYear, yearGoalStats, yearMonthlyData, loadMonthStateOrCreate, toggleMonthGoal, toggleQuarterGoal, pullYearGoalsFromMonths, quarterStats` | storage, goals, account | `state`, `viewedMonth`, `YEAR_MONTH_CACHE` | none | HIGH | **không** — core state, coupling chặt |
| R4 | 389–447 | Widget config: `widgetConfigKey, initWidgetConfig, saveWidgetConfig, getVisibleWidgets` | storage | `widgetConfigs` | reads DOM section headers | MEDIUM | ✅ **ứng viên #4** — API nhỏ (4 fn), có thể tách cùng R5 |
| R5 | 447–520 | App-level glue: `setLang, setTheme, prefersReducedMotion, registerSW` | i18n, theme, shell | `LANG`, `THEME`, `DARK` | `document.documentElement`, SW register | MEDIUM | ✅ ứng viên #4 (gộp R4+R5 thành "settings/bootstrap") |
| R6 | 519–603 | Reminder app-glue: `enableReminder, disableReminder, checkDailyReminder` | remind, i18n | `reminder` state | header bell UI, Notification | MEDIUM | ✅ ứng viên #3 — logic nhỏ, self-contained |
| R7 | 603–651 | Recurrence: `beginRepeatEdit, applyRecurrence` | state, i18n | `state` | repeat modal DOM | MEDIUM | có thể; phụ thuộc `setView/renderCurrentView` → chờ |
| R8 | 651–799 | Export glue: `csvRow, exportCSV, icsEscape, icsDayFromDay, exportICS, legacyCSVRows, importJSONFile, togglePop` | export, storage, i18n, UI | `state` | file input, popup | MEDIUM | ✅ ứng viên #2 — `export.js` đã có primitives; đây là builders còn sót |
| R9 | 799–1054 | Popup/demo/templates: `confettiBurst, templatesPopHTML, demoPlan, importCSVFile, seedHabitDays, seedTasks` | storage, goals, habits | `state` (demo/seed ghi state) | canvas, modal DOM | LOW–MEDIUM | ✅ **ứng viên #1 (kế hoạch extraction #28)** — confetti/templates là pure; demo/seed tách riêng nếu cần |
| R10 | 1054–1245 | State load/save: `defaultState, emptyState, loadState, bootState, bootYearState, rebootState, save` | storage, account, keys | `state` (global) | none | HIGH | **không** — trái tim persistence |
| R11 | 1245–1337 | XP + helpers: `loadXP, saveXP, xpLevelInfo, addXP, removeXP, renderXP, habitPct, dayPct, donutSVG, checkboxHTML` | storage, i18n, UI | `xp` state | XP badge DOM, donut/checkbox HTML builders | MEDIUM | ✅ ứng viên #5 — `donutSVG/checkboxHTML` là pure render helpers |
| R12 | 1337–1415 | Reflection + overview metric: `getRefQuestion, saveRefQuestion, reflectionHTML, overviewMetricSnapshot, syncOverviewMetrics, syncOverviewFocus` | storage, sync | `state` | reflection DOM, metric cards | MEDIUM–HIGH | chờ — gắn render path + sync |
| R13 | 1415–1736 | **Overview render**: `renderOverview` + 8 builders (`dateCardHTML, weeklyChartHTML, focusCardHTML, sceneCardHTML, goalsPanelHTML, emptyStateHTML, goalBlockHTML, habitPanelHTML`) | i18n, clock, stats, mood, remind-ui, habits | `state`, `viewedMonth`, cache | toàn bộ #overview DOM | HIGH | **không** (render path chính) — có thể tách "HTML builders" thuần nếu muốn |
| R14 | 1736–2072 | Streak/heatmap UI: `weekHabitPct, weekCompareHTML, dayAggregateAt, heatHeroHTML, heatRibbonHTML, habitMiniHTML, habitHeatCardHTML, shareTopInfo, canvasCircle, streakCardBlob, doShareStreak` | streak (calc đã tách), i18n, UI, export | `state`, cache | heatmap DOM, canvas share | MEDIUM | ✅ ứng viên #6 — calc đã ở `streak.js`; phần còn lại là renderers/share |
| R15 | 2072–2524 | Reports tháng/tuần: `monthlyReportData, renderReportModal, open/closeReportModal, reportCardBlob, doShareReport, weeklyReportData, lastWeekReportData, vsCell, focusReportBars, renderWeekReportModal, open/closeWeekReportModal, weekReportCardBlob, doShareWeekReport` | stats, i18n, export, UI | `state`, month cache | report modal DOM, canvas | MEDIUM–HIGH | chờ — `year-report.js` đã tách; còn month/week report |
| R16 | 2524–2801 | Badges + CRUD: `countActiveDays, evaluateMonthBadges, badgePanelHTML, refreshHeatCard` + `showGoalAdd, addGoal, removeGoal, addHabit, removeHabit, copyHabitsToNextMonth, beginTargetEdit, beginTagEdit, refreshHabitLabels, beginInlineEdit` | account (badge storage), storage, UI, undo | `state` | badge panel, inline edit DOM | MEDIUM–HIGH | chờ — CRUD gắn undo + render |
| R17 | 2801–3079 | **Year render**: `renderYear` + 11 builders (`yearCardHTML, yearGoalsCardHTML, yearChartsHTML, yearOverviewReflectionHTML, yearQuartersHTML, yearMonthsHTML, yearReflectionHTML, yearReflectionsHTML, yearHabitHeatmapHTML, weekTagFilterBar`) | i18n, stats, goals, habits | `state`, `viewedYear` | toàn bộ #year DOM | HIGH | **không** (render path) |
| R18 | 3079–3330 | **Week/Day render**: `renderWeek` + 9 builders (`weekHabitsHTML, weeklyGoalsHTML, dayColumnHTML, dayOfMonthIndex, dayHabitsHTML, renderDay, openDay, goDay`) | i18n, clock, mood, plan-math | `state`, `viewedMonth` | toàn bộ #week/#day DOM | HIGH | **không** (render path) |
| R19 | 3329–3480 | **Today render**: `todayGreeting, todayWeekdayLabel, renderToday, totalFocusMinutesToday, taskRowHTML` | i18n, clock, focus, mood, remind-ui, inbox | `state` | toàn bộ #today DOM | MEDIUM | ✅ **ứng viên #7** — API nhỏ (5 fn), render path nhưng cô lập được; kế hoạch P1.8 từng liệt kê |
| R20 | 3480–3745 | **Task Detail**: `taskDetailState, saveTaskDetailState, getTaskDetailTarget, openInboxTaskDetail, openTaskDetail, closeTaskDetail, refreshTaskRowAfterEdit, renderTaskDetail, bindTaskDetailEvents` | storage, i18n, keys, inbox | `taskDetail` state | #taskDrawer DOM + events | MEDIUM–HIGH | chờ — 264 dòng, gắn sự kiện phức tạp |
| R21 | 3745–3931 | Calendar + template modal: `calendarDayEntries, calendarTaskMatches, calendarVisibleTasks, calendarDayPct, calendarTagFilterBar, calendarTasksHTML, renderCalendar` + `openTemplateModal, closeTemplateModal, copyMonthTemplate` | i18n, stats, habits | `state`, `calendarTagFilters` | #calendar DOM, modal | MEDIUM–HIGH | chờ — tag filter state global |
| R22 | 3931–4471 | **Pomodoro/Focus + Stats**: `renderPomo` + 17 pomo/focus fns + `statsWeekStartOf, statsMonthsForRange, statsData, statsCorrelation, statsScatterSVG, renderStatsModal, focusChartCardHTML, topFocusTasksInMonth, renderPomoWidgetStats, renderPomoTomatoCounter` | storage (POMO_LOG_KEY), i18n, stats module | `pomo` state | pomo panel, stats modal, charts | MEDIUM | ✅ **ứng viên #8** — `stats.js` đã tách core calc; pomo timer + stats modal còn lại |
| R23 | 4471–4626 | Year dashboard + widget settings + profile: `bestHabitAcrossYear, bestProductiveDay, yearDashboardHTML` + `open/close/renderWidgetSettingsModal, setFieldError, clearFormErrors, openProfileModal, closeProfileModal, doChangePassword, doDeleteAccount` | account, i18n, UI, sync | `state` | modals, account forms | MEDIUM–HIGH | chờ — account ops gắn sync |
| R24 | 4677–4993 | Shell/nav: `isSidebarCollapsed, applySidebarCollapse, toggleSidebarCollapse, sidebarTooltipLayer/Host, show/hideSidebarTooltip, shellNavLabel, buildNav, updateNav, renderShellIcons, updateShellContext, openMoreSheet, closeMoreSheet, openToolsDrawer, closeToolsDrawer` | shell module, i18n, keys | `nav` state | toàn bộ sidebar/bottom-nav/more-sheet DOM | MEDIUM–HIGH | chờ — `shell.js` mới giữ brand/month-nav; nav build còn ở đây |
| R25 | 4993–5243 | **Upcoming**: `setUpcomingRange, tasksForDate, upcomingOverdueTasks, upcomingCollect, upcomingDayHeader, upcomingTaskMeta, upcomingTaskRowHTML, renderUpcoming, pushTaskToDate` | i18n, dates, inbox | `state`, `upcomingRange` | #upcoming DOM | MEDIUM | ✅ **ứng viên #9** — `inbox.js` đã tách; upcoming là vùng cùng họ, tách sau |
| R26 | 5165–5382 | **View switching + Undo**: `setView, goWeek, openMonth, openYear, snapshotAll, pushUndo, applySnapshot, renderCurrentView, doUndo, doRedo, updateUndoButtons, toggleSearchModal, focusTodayTaskAdd` | mọi view renderer, keys, search (lazy) | `state`, `viewHistory`, `undoStack` | toàn bộ view container | HIGH | **không** — bộ điều phối trung tâm |
| R27 | 5567–5639 | Backups: `rotateBackup, maybeAutoBackup, listBackups, openBackupModal, closeBackupModal, doRestoreBackup` | storage, UI, i18n | `state` (snapshot) | backup modal DOM | MEDIUM | ✅ **ứng viên #10** — API nhỏ (6 fn), self-contained |
| R28 | 5639–5878 | **Focus mode**: `openFocusMode, closeFocusMode, focusState, saveFocusState, getFocusedTask, taskFocusLog, taskFocusSecs, taskFocusToday, taskFocusSessions, taskFocusMinLabel, focusTimerRender, focusTimerSync, focusTimerComplete, focusTimerStart, focusTimerReset, focusTimerSetDur, getTaskByUid, renderFocusContent, refreshFocusIfOpen, fmtSessionDate` | storage, i18n, UI | `focusState` (global) | #focusMode DOM + timer | MEDIUM | ✅ ứng viên #11 — timer logic thuần + DOM overlay; kế hoạch liệt kê "Focus" |
| R29 | 5890–6680 | **Event dispatchers**: click dispatcher (~700 dòng) + `change/dblclick/input/focusin` listeners + `saveSoon/saveYearSoon/saveInboxSoon/saveTaskDetailStateSoon/flushPendingSaves` | mọi module | `state` | toàn bộ DOM events | HIGH | **không** — đây là wiring layer; chỉ tách từng branch nếu có lý do |
| R30 | 6680–7034 | Task mutations: `afterGoalToggle, afterYearGoalToggle, afterHabitToggle, afterWGoalToggle, refreshTaskUI, newTaskUid, ensureTaskUid, carryOverRepeatTasks, carriedDateLabel, syncCarriedDone, scrollWeekToToday, refreshToday` | storage, plan-carry, XP | `state` | task DOM | HIGH | **không** — mutation + render xen kẽ |
| R31 | 7034–7378 | Sync glue + onboarding: `syncNow, toggleSyncModal, closeSyncModal, setSyncMode, doSyncSignup, doSyncLogin, doSyncGoogle, doSyncLogout, handleSyncChange` + `obHasAnyData, obNeeded, obGoStep, startOnboarding, obFinish, obDoGoal, obDoHabits, obDoTheme, maybeStartOnboarding` | sync, syncui, account, theme, i18n | `syncMode`, `onboarding` state | sync modal, onboarding DOM | MEDIUM | ✅ **ứng viên #12** — `sync.js`/`syncui.js` đã tách core; phần còn lại là form/modal glue |
| R32 | 7378–7463 | **Boot sequence**: `ti0`/`lastRealWeek` init, deeplink, `setTheme/applyDark/buildNav/loadMood/loadXP/setView`, sync init, `initAnalytics/registerSW/initFabDrags/reminder timers`, import input | tất cả | — | — | — | **không** — composition root, giữ nguyên |

## 3. Thứ tự extraction đề xuất (LOW → HIGH)

Chỉ extract **1 subsystem / 1 pass**, mỗi pass = 1 commit riêng, theo thứ tự:

1. **R9 — Popup/demo/templates** (kế hoạch extraction #28): `confettiBurst` + `templatesPopHTML` + `demoPlan` → `js/popups.js` (hoặc `js/demo.js`). LOW risk nhất vì pure + ít state.
2. **R2 — Constants** → `js/config.js` (DAYS, HABIT_DEFS, GOAL_DEFS, WEEK_PATTERNS, prompts). Pure data, không thể vỡ.
3. **R8 — Export builders** (csvRow, exportCSV, icsEscape, icsDayFromDay, exportICS, legacyCSVRows) → gộp vào `js/export.js` hoặc `js/export-format.js`. `importJSONFile/importCSVFile` giữ lại (gắn DOM input + backup).
4. **R4+R5 — Widget config + bootstrap glue** → `js/settings.js`.
5. **R11 — XP** → `js/xp.js` (kèm `donutSVG`/`checkboxHTML` nếu tách được render helpers thuần).
6. **R14 — Streak/heatmap renderers + share** → `js/streak-ui.js` (calc đã ở `streak.js`).
7. **R19 — Today render** → `js/today.js` (5 fn, render path cô lập được).
8. **R22 — Pomodoro/Focus timer + stats modal** → `js/pomo.js` + `js/stats-ui.js`.
9. **R25 — Upcoming** → `js/upcoming.js`.
10. **R27 — Backups** → `js/backup.js`.
11. **R28 — Focus mode** → `js/focus.js`.
12. **R31 — Sync/onboarding glue** → `js/sync-forms.js`.

**KHÔNG extract (giữ ở app.js):** R3 (plan state), R10 (persistence), R13/R17/R18 (render path overview/year/week), R26 (view dispatcher + undo), R29 (event dispatchers), R30 (task mutations), R32 (boot).

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
| #1–27 | 34 modules hiện tại trong `js/` | ✅ done (qua các phase P11) |
| #28 | R9 popup/demo/templates | ⏳ chưa làm |
| #29 | R2 constants | ⏳ chưa làm |
| … | xem thứ tự mục 3 | ⏳ |

_Cập nhật file này sau mỗi extraction thành công._
