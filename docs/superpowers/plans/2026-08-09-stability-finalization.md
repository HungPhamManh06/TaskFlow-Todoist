# TaskFlow — Stability, Performance & Code Quality Finalization

> Mục tiêu: ổn định production (taskflow-todoist.vercel.app). KHÔNG thêm feature lớn,
> KHÔNG đổi framework, KHÔNG rewrite. stability > features · correctness > cosmetic ·
> performance > animation · maintainability > clever code.

## Trạng thái

- [x] **P0.1 — Legal HTML fix**: escaped-quote `\"` + `\uXXXX` trong data-t-* attributes
      (privacy.html ×1, terms.html ×3 paragraphs) → split span + standalone anchor.
      Regression guards trong phase9 test. 270→271 tests.
- [x] **P0.2 — Full E2E regression**: viewport matrix mở rộng (360×800, 1920×1080 → 11
      scenarios × 5 viewports = 55 runs), scenario `taskdetail_checks` (drawer edit flow +
      delete/undo + export downloads). Tìm & fix 2 bug thật:
      - `td-prio` thiếu handler (priority edit không lưu) — thêm nhánh dispatcher
      - Nút Undo trên delete-toast không click được (`.toast-region` pointer-events:none
        không có child re-enable) — `pointer-events: auto` trên `.toast`
- [x] **P1.2 — Lighthouse baseline** (harness `scripts/measure-lighthouse.py`, reports +
  `BASELINE.md` + `baseline.json` trong `docs/lighthouse/`). Baseline chốt lần 1 (1 run/combo,
  lighthouse@13.4.1, server local static). **Baseline chốt lần 2 (MEDIAN 3 runs, sau P1.1
  extraction 21–27 — app.js 8206→7414 dòng)** — số ổn định để so sánh after-optimization:

| Combo | Perf | A11y | BP | SEO | LCP | CLS | TBT | FCP |
|---|---|---|---|---|---|---|---|---|
| landing-desktop | 99 | 96 | 100 | 100 | 613 ms | 0.067 | 0 ms | 613 ms |
| landing-mobile | 88 | 96 | 100 | 100 | 2993 ms | 0 | 0 ms | 2993 ms |
| app-desktop | 95 | 92 | 100 | 100 | 1464 ms | 0.002 | 2 ms | 687 ms |
| app-mobile | **60** | 87 | 100 | 100 | **7094 ms** | 0 | **248 ms** | 3760 ms |

  (Baseline lần 1: landing-d 99/566ms, landing-m 98/1689ms, app-d 96/1398ms, app-m 54/7143ms
  — single-run, variance cao; median 3 runs ổn định hơn, xem `docs/lighthouse/BASELINE.md`.)

  **Diagnosis (app-mobile — nút thắt duy nhất)**:
  - **app.js 343 KB** (transfer), Lighthouse ước tính **267 KB/336 KB unused** (đúng — 20
    module + views render theo nhu cầu, nhưng cả bundle load + parse ở boot). Script
    parsing/eval 0.3s + Style & Layout **1.0s** (styles.css 212 KB) = 4 long tasks.
  - Cấu trúc network: app.js 343 KB + styles.css 212 KB + i18n.js 64 KB + app.html 43 KB
    = ~660 KB JS/CSS trước khi LCP (LCP element là app shell render sau boot JS).
  - Landing mạnh (99/88) — LCP mobile 2.99s (Nunito fonts + hero), không phải ưu tiên.
  - CLS 0.002 (app) / 0.067 (landing) — tốt. BP + SEO 100 mọi combo.
  - A11y app 87 < landing 96 — ngoài scope perf, ghi nhận.
  - **So sánh sau này**: `python scripts/measure-lighthouse.py --runs 3` → so
    `BASELINE.md`/`baseline.json`.

  **Đề xuất tối ưu (có đo lường, ưu tiên theo ROI)** — baseline là số trước; mỗi item
  chỉ coi là xong khi `measure-lighthouse.py --runs 3` cho thấy cải thiện:

  1. **Minify JS/CSS khi deploy** ✅ ĐÃ LÀM (opt#1): `scripts/minify.py` (terser JS
     + csso-cli CSS qua npx, sinh `.min.js`/`.min.css` SIBLING — source readable GIỮ
     nguyên cho tests + maintainability, app.html/sw.js trỏ bản min; `--check` mode
     cho CI). 42 files: **844 KB → 586 KB (−31%)** (app.js 352→245 KB, styles.css
     218→165 KB, i18n.js 66→56 KB). app.html trỏ `js/*.min.js?v=` (app.min.js?v=138,
     styles.min.css?v=97) + sw.js APP_SHELL 35 js + 6 css min, CACHE v152→v153.
     Tests: 279 pass (+1 textual P1.2 opt#1), SMOKE OK, `minify.py --check` OK.

     **Kết quả đo lại (median 3 runs)**:

     | Combo | Perf | LCP | TBT |
     |---|---|---|---|
     | app-desktop | 95 → **97** | 1464 → **1227 ms** | 2 → **0 ms** |
     | app-mobile | 60 → **68** | 7094 → **5795 ms** (−18%) | 248 → **172 ms** (−31%) |
     | landing-desktop | 99 → 99 | 613 → 648 ms | 0 → 0 |
     | landing-mobile | 88 → 88 | 2993 → 3060 ms | 0 → 0 |

     app-mobile Perf +8, LCP −1.3s, TBT −76ms — nhưng vẫn < 90 (JS boot + Style&
     Layout vẫn nặng). Landing không đổi (không minify landing assets). Item 2
     (defer script tags) + item 3 (lazy-load) tiếp theo để đẩy app-mobile tiếp.
  2. **Thêm `defer` cho script tag** (cấu trúc, rủi ro thấp): 30+ `<script>`
     synchronous đang chặn HTML parsing + download tuần tự. `defer` giữ thứ tự
     document order nhưng download song song + exec sau parse → FCP/LCP app-mobile
     (3760/7094ms) kỳ vọng giảm 1-2s; giảm luôn Script Eval 0.2s + Style&Layout
     1.0s trên main thread (4 long tasks).
  3. **Lazy-load module không cần ở boot**: chat/search/quick-add/mood/
     year-report/digest/remind-ui (đã tách ở P1.1) chỉ cần khi mở feature tương
     ứng → chuyển nhóm này sang load sau (defer sâu hơn / dynamic import) → trực
     tiếp giảm phần "267 KB wasted of 336 KB" của app.js + cả bundle 20+ module
     parse ở boot. Rủi ro trung bình (đụng script order + boot guard) → làm sau
     item 1-2.
  4. **Trim unused CSS**: styles.css 193 KB wasted / 212 KB (app-mobile) — CSS
     per-view (calendar/week/year/reports) load nguyên ở boot. Sau khi minify,
     cân nhắc tách per-view hoặc purge. Rủi ro trung bình (visual QA) → sau 1-2.
  5. **Tách i18n theo locale**: i18n.js 64 KB chứa cả vi+en — user dùng 1 locale,
     còn lại phí. Lazy-load locale còn lại khi switch. Rủi ro thấp-trung bình.
  6. **Landing mobile (88) không ưu tiên**: LCP 2993ms phụ thuộc Nunito
     (fonts.googleapis display=swap đã có + preconnect) — chỉ xử lý nếu còn budget.
  - **Lưu ý**: server local không gzip/brotli (Vercel tự nén static) → số local
    pessimistic hơn production; vẫn dùng chung harness cho before/after.

- [~] **P1.1 — app.js refactor incremental** (one module per commit, test sau mỗi extraction)
  - [x] **Extraction 21 — chat.js** (CHAT_RESPONSES/doChatSend/doChatSuggest/chatBotReply,
        ~72 dòng): module ít coupling nhất — 0 state, chỉ phụ thuộc `esc()` + DOM. UMD
        (window.TaskFlowChat), fail-fast guard + alias destructure ở app.js, call-site
        dispatcher (`chat-send`/`chat-suggest`) + keydown Enter giữ nguyên qua alias.
        app.html `?v=130→131`, sw.js APP_SHELL `+js/chat.js` + CACHE `v145→146`.
        app.js 8067 → 8019 dòng. 272 tests pass (+1 textual test), SMOKE OK,
        browser-level: send button + suggest chip + Enter-key đều chạy qua module mới.
  - [x] **Extraction 22 — search.js** (openSearchModal/closeSearchModal/runSearch/
        renderSearchResults/goSearchResult, ~127 dòng): UMD (window.TaskFlowSearch),
        fail-fast guard + alias destructure. Phụ thuộc runtime: state/PLAN_YEAR/
        monthStateRaw (tháng khác) + TaskFlowUI/setView/openMonth/openYear/emptyStateHTML.
        Keyboard-nav ↑↓/Enter trong app.js KHÔNG đụng hàm extract — giữ nguyên (click
        .search-hit trực tiếp). app.html `?v=131→132`, sw.js APP_SHELL `+js/search.js` +
        CACHE `v146→147`. app.js 8019 → 7915 dòng. 273 tests pass (+1 textual test),
        SMOKE OK, browser-level: debounced input → hit → click → week view; Enter-key →
        đóng modal + navigate (verified qua alias). 4 assertion cũ phase2 trỏ sang module.
  - [x] **Extraction 23 — quick-add.js** (openQuickAdd/closeQuickAdd/submitQuickAdd +
        quickAddDefaultTarget/quickAddTarget nội bộ, ~127 dòng — lưu ý tên thật khác
        đề xuất cũ: handleQuickAddChunk/quickAddTargetDate không tồn tại trong code
        hiện tại): UMD (window.TaskFlowQuickAdd), fail-fast guard + alias destructure
        (3 hàm app.js thực dùng). Phụ thuộc runtime: state/PLAN_*/newTaskUid/pushUndo/
        pushTaskToDate/renderCurrentView (function declaration global app.js) +
        inbox/saveInbox/inboxTargetForDate (alias TaskFlowInbox). call-sites giữ:
        keydown Enter, dispatcher shell-add-task/quickadd-close/quickadd-do, phím tắt q,
        outside-click, boot ?quick=1. app.html `?v=132→133`, sw.js APP_SHELL
        `+js/quick-add.js` + CACHE `v147→148`. app.js 7915 → 7814 dòng. 274 tests pass
        (+1 textual test), SMOKE OK, browser-level: open modal (module + phím q), submit
        → task vào đúng ngày (week 1 day 6 = CN hôm nay), inbox-scope (date field ẩn +
        inbox.push), close, undo enabled. 4 assertion cũ Phase 4 trỏ sang module.
  - [x] **Extraction 24 — mood.js** (loadMood/saveMood/moodCardHTML/openMoodPicker/
        closeMoodPicker/rerenderMoodCard, 88 dòng): UMD (window.TaskFlowMood), fail-fast
        guard + alias destructure. **Coupling đặc biệt**: MOOD_KEY/MOODS/moodMap VẪN ở
        app.js (dispatcher mood-*, day-view buttons, undo snapshot đọc/ghi trực tiếp) —
        module resolve qua global lexical lúc gọi. ⚠️ Bắt được bug trong quá trình tách:
        line-range removal vô tình xoá luôn TaskFlowKeys destructure (moodDateKey/pomoDateKey
        nằm giữa saveMood/moodCardHTML) — đã restore ngay sau mood guard, verify grep =1.
        app.html `?v=133→134`, sw.js APP_SHELL `+js/mood.js` + CACHE `v148→149`.
        app.js 7814 → 7751 dòng. 275 tests pass (+1 textual test), SMOKE OK,
        browser-level: mood card render (31 cells), picker 5 options, mood-set → 😊 +
        localStorage + auto rerender, mood-clear, day-view mood buttons (moodDateKey
        restore) + pomoDateKey OK. phase6 6.4/6.10 + phase9 keys test trỏ sang module.
  - [x] **Extraction 25 — year-report.js** (yearlyReportData/renderYearReportModal/
        openYearReportModal/closeYearReportModal/yearReportCardBlob/doShareYearReport,
        207 dòng): UMD (window.TaskFlowYearReport), fail-fast guard + alias destructure
        CHỈ 3 hàm app.js thực dùng (open/close/doShare — dispatcher + outside-click);
        yearlyReportData/renderYearReportModal/yearReportCardBlob là module-internal
        (đã note trong comment). Phụ thuộc runtime: yearGoalStats/yearMonthlyData/
        bestHabitAcrossYear/bestProductiveDay/focusYearByMonth/topFocusTasksInYear/
        donutSVG/focusReportBars/canvasCircle/taskFocusMinLabel (function declaration
        global app.js) + shortMonth (alias TaskFlowPlanMini). app.html `?v=134→135`,
        sw.js APP_SHELL `+js/year-report.js` + CACHE `v149→150`. app.js 7751 → 7569
        dòng. 276 tests pass (+1 textual test), SMOKE OK, browser-level: modal render
        (8 cells + donut + 4 quarters + 12 week bars), dispatcher close, yearReportCardBlob
        → 326KB PNG, yearlyReportData 12 tháng OK. 3 assertion cũ (planmini/analytics/
        Phase 8) trỏ sang module.
  - [x] **Extraction 26 — digest.js** (computeDigest/updateDigestCache, 54 dòng): UMD
        (window.TaskFlowDigest), fail-fast guard + destructure CHỈ 1 hàm (updateDigestCache
        — computeDigest không có call-site app.js, gọi nội bộ trong module). digestCacheTs
        là state nội bộ module (0 ref ngoài verified). Phụ thuộc runtime: state/PLAN_*/
        t/caches. Call-sites giữ: afterHabitToggle, refreshToday, boot setTimeout 2s.
        app.html `?v=135→136`, sw.js APP_SHELL `+js/digest.js` + CACHE `v150→151`.
        app.js 7569 → 7540 dòng. 277 tests pass (+1 textual test), SMOKE OK,
        browser-level: computeDigest → {title:'TaskFlow 🐥', missed habits}, updateDigestCache
        → digest.json trong taskflow-digest cache đọc lại được. phase6 6.6 trỏ sang module.
  - [x] **Extraction 27 — remind-ui.js** (scheduleItemReminder/syncReminderTimers/
        renderRemindList/insertBeforeTaskActions/beginRemindEdit/turnOffRemind, 152 dòng):
        UMD (window.TaskFlowRemindUI), fail-fast guard + destructure 5 hàm (scheduleItemReminder
        không có call-site app.js — gọi nội bộ). insertBeforeTaskActions dùng CHUNG với
        beginRepeatEdit/beginTagEdit (app.js) nên nằm trong destructure. itemRemindTimers là
        state nội bộ module (stray `let itemRemindTimers` bị bỏ sót khi line-range replacement
        và đã xoá thủ công). Call-sites giữ: beginRepeatEdit, beginTagEdit, togglePop→
        renderRemindList, openMonth→syncReminderTimers, dispatcher remind-habit/task/off-item,
        boot setTimeout 1s. app.html `?v=136→137`, sw.js APP_SHELL `+js/remind-ui.js` +
        CACHE `v151→152`. app.js 7540 → 7414 dòng. 278 tests pass (+1 textual test),
        SMOKE OK, browser-level: remind popup liệt kê task có remind → ✕ click →
        remind.enabled false qua dispatcher. phase2 4.1 repoint `remind-off-item` → REMIND_JS.
  - [ ] Extraction 28 (đề xuất kế tiếp: confetti/demo/templates — confettiBurst/
        templatesPopHTML/demoPlan ~140 dòng; HOẶC group topbar/search UI còn lại)
- [ ] **P1.3 — Mobile real-device QA** (checklist manual + viewport audit)
- [x] **P2.1 — Mobile PWA screenshot** (manifest `form_factor: narrow`) — done: `app-screenshot-mobile.png` 390×844 khớp manifest, commit `74ac197`
- [x] **P2.2 — README offline-first rewording** — done: header blurb "100% offline" → offline-first + optional cloud sync; thêm checklist feature hiện tại (Today/Inbox/Upcoming/Week·Month·Year/Tasks/Habits/Focus·Pomodoro/Calendar&Reports/Search/Import-Export/PWA/Cloud sync) + sections **Offline-first & Sync** + **Privacy & Data** (link /privacy /terms /data-and-security); PWA line + structure tree js/css + GA4 ref (`js/analytics.js`) refresh. Kèm manifest.json: description "Offline 100%" → "offline-first… đồng bộ đám mây là tùy chọn khi đăng nhập", `name` → `TaskFlow` (spec), screenshots 1200×900/390×844 khớp file; phase9 test cập nhật + 2 guard mới (`/offline-first/`, `doesNotMatch /Offline 100%/`).
- [x] **P0.3 — Production legal verify** — Playwright battery 33 checks × 3 pages × PROD+LOCAL: PROD 33/33 PASS, LOCAL 33/33 PASS (khớp source). Checked: không lộ data-t-vi/data-t-en/`href=\"` trong UI, language switch VI↔EN, dark mode (data-dark + theme-color #1b1917), links đủ href + target=_blank có rel noopener, mobile 390 không h-scroll, h1 visible, 0 uncaught exception. Không cần root-cause deployment — production đã serve source mới đúng.
- [ ] **P2.3 — Cross-browser** (Firefox + WebKit qua Playwright, hoặc ghi limitation)

## Nguyên tắc chung

- Mỗi phase: build/test → E2E liên quan → console → diff review → fix regression trước khi sang phase kế.
- KHÔNG thêm: team workspace, collaboration, chat, kanban enterprise, marketplace, social,
  coin, leaderboard, pet, subscription, payment, complex AI agent.
- TaskFlow = Personal Productivity System (CAPTURE → INBOX → PLAN → UPCOMING → TODAY →
  FOCUS → COMPLETE → REFLECT).
