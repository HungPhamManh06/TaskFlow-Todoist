# Plan: Phase 4 — Nhắc việc habit/task, Báo cáo tuần, Widget Pomodoro

- Ngày: 2026-08-03
- Spec gốc: `docs/superpowers/specs/2026-08-03-feature-roadmap-design.md` (mục 4.1–4.3)
- Phong cách: vanilla JS, không framework; i18n luôn thêm cả `vi` + `en`; TDD — logic thuần đưa vào module mới `js/plan-stats.js` (đã có `window.PlanStats` + `module.exports`); test bằng `node --test`.

## Bối cảnh code (đã khảo sát)

- **Reminder hiện có**: `sw.js` đã có `periodicsync` tag `daily-reminder` + `showReminder()` + `notificationclick` (focus/openWindow app). `app.js` có `registerPeriodicReminder()` (1242), `getRemindTime()` (1427), `showAppReminder()` (1276) dùng `Notification.requestPermission`, UI `remindPop` (app.html:101–111) với input `#remindTime` + nút `remind-on`/`remind-off`. Boot gọi `if (getRemindTime()) registerPeriodicReminder();` (4565). → Nhắc việc có sẵn **1 mốc giờ toàn cục/ngày**; Phase 4 mở rộng thành nhắc **theo từng habit/task**.
- **Pomodoro**: engine hoàn chỉnh `pomoStart`/`pomoReset`/`togglePomoPanel` (3438–3484), `POMO_WORK = 25*60`, `POMO_BREAK = 5*60`, overlay `pomoPanel` (app.html:246–252), FAB `pomo-fab` (245), `trackEvent('pomodoro_start'|'pomodoro_complete')`. → Chỉ cần tái dùng engine, thêm widget inline trong `view-week`.
- **renderWeek** (3103): banner `week-banner` + `weekTagFilterBar()` + `.week-head` (title-card + donut-card). `weekStats(w)` (1689) cho done/inProg/total/pct. `dayAggregate(d)` (1694) cho % habit theo ngày. → Điểm chèn nút báo cáo tuần + widget pomodoro.
- **Modal báo cáo tháng** (pattern để copy): `reportModal` (app.html:306–315) + `renderReportModal()`/`monthlyReportData()`/`reportCardBlob()`/`doShareReport()` (app.js:2416–2445) → canvas 1080×1080 → `navigator.share`/tải `taskflow-report.png`. → Báo cáo tuần copy nguyên pattern này.
- **Version hiện tại**: `styles.css?v=36`, `deeplink.js?v=2`, `plan-stats.js?v=1`, `app.js?v=35`, SW cache `taskflow-v26`. Mọi script/link mới hoặc đổi file phải bump.
- **LƯU Ý**: tiến trình nền của user đang bump version sw.js/app.html — đọc lại file trước khi edit; thêm script mới vào APP_SHELL + bump cache.

## Task 1 — Nhắc việc theo habit/task (4.1)

- **Data model**: habit + task thêm field `remind: { enabled: boolean, time: 'HH:MM' }` (mặc định `{ enabled:false }`). Migration trong `loadState()`: nếu `!h.remind` → `h.remind = { enabled:false, time:'20:00' }` (tương tự cho task trong mọi tuần). Field này sync tự nhiên qua JSONB server — không đổi backend.
- **UI**:
  - `remindPop` (app.html:104) mở rộng: sau `remindTime`/nút bật-tắt toàn cục, thêm danh sách `<div id="remindList">` liệt kê habit + task đã bật nhắc (mỗi dòng: tên + giờ + nút tắt `data-action="remind-off-item"`). Nút "Thêm nhắc" mở picker: chọn loại (habit/task) → chọn đối tượng → chọn giờ → `data-action="remind-add"`.
  - Trong `habitPanelHTML` item-actions: nút 🔔 `data-action="remind-habit" data-id` (title = `remindHabitAria`); trong task row (taskRowHTML): nút 🔔 `data-action="remind-task" data-id data-week` — mở mini-popup chọn giờ (input time + nút Lưu `data-action="remind-set"`).
  - Popup chọn giờ dùng pattern `.header-pop` sẵn có (như `remindPop`); đóng khi click ngoài (nối vào escape/click-outside handler hiện có).
- **Logic nhắc trong app mở**: `syncReminderTimers()` — quét mọi habit + task trong state hiện tại (và `monthStateRaw` các tháng? → **chỉ state hiện tại**, YAGNI) có `remind.enabled`, so giờ hiện tại, `setTimeout` đến mốc kế tiếp → `showAppReminder()` với body = tên habit/task + `trackEvent('reminder_show', { kind:'habit'|'task' })`. Gọi lại sau mỗi lần đổi tháng/tuần + sau `remind-set`. Clear timeout cũ trước khi schedule lại.
- **Khi app đóng**: SW `periodicsync` hiện chỉ có 1 tag `daily-reminder`. Giữ nguyên (trình duyệt giới hạn `minInterval` ~ 12h với periodic sync, không nhắc chính xác giờ — chấp nhận, ghi rõ trong README/spec). `notificationclick` đã focus app.
- **i18n**: `remindHabitAria`, `remindTaskAria`, `remindAdd`, `remindPickKind`, `remindKindHabit`, `remindKindTask`, `remindPickTarget`, `remindPickTime`, `remindSave`, `remindListEmpty`, `remindOffItem`, `remindSetDone` (vi + en).
- **Test textual** (thêm vào `tests/phase2.test.mjs`): app.js chứa `remind: { enabled`, `syncReminderTimers`, `data-action="remind-add"`, `data-action="remind-set"`, `data-action="remind-habit"`; app.html có `remindList`; i18n `remindSetDone` ở cả vi + en; migration `h.remind =` trong loadState.

## Task 2 — Báo cáo thống kê tuần (4.2)

- **app.html**: modal mới `weekReportModal` (copy `reportModal`, app.html:306): `div.report-modal#weekReportModal hidden` chứa `.report-modal-card` + `#weekReportContent` + nút đóng (`data-action="close-week-report"`) + nút 📤 (`data-action="share-week-report"`).
- **app.js**:
  - `weeklyReportData(w)`: `{ n: w.n, pct, done, inProg, total }` từ `weekStats(w)`; `habitByDay: [0..6]` = `dayAggregate(d)` cho 7 ngày tuần; `topHabit` = habit có nhiều tick nhất tuần (`{ name, ticks }`); `bestDay` = ngày có `dayAggregate` cao nhất (kèm tên thứ — `fmtDate`/mảng `weekDays` sẵn có).
  - `renderWeekReportModal()`: điền `#weekReportContent` (donut pct + 3 ô done/inProg/total + bar chart 7 ngày + topHabit 🏆 + bestDay ⭐).
  - `weekReportCardBlob(data)`: canvas 1080×1080 theo pattern `reportCardBlob` — gradient nền, tiêu đề "Báo cáo Tuần {n}", donut vẽ tay, bar 7 ngày, footer share. Tên file `taskflow-week-report.png`.
  - `doShareWeekReport()`: copy `doShareReport` (navigator.share files → fallback download; `trackEvent('share_week_report')`).
  - Handler: `act === 'week-report'` → `renderWeekReportModal(); show`; `'close-week-report'` → hide; `'share-week-report'` → `doShareWeekReport()`.
  - Nút mở: thêm vào `.week-banner` trong `renderWeek()` (3103) cạnh `weekBanner` h2: `<button class="pop-btn share-btn" data-action="week-report">📊 ${t('weekReportTitle')}</button>`.
  - Esc đóng: nối vào handler Esc hiện có (app.js:4264 xử lý reportModal → thêm weekReportModal).
- **CSS** (css/styles.css, theo `.report-modal`): `.week-report-bar` (bar 7 ngày), dòng stats. Nằm trong block dark mode luôn (dùng biến).
- **i18n**: `weekReportTitle`, `weekReportGoalPct`, `weekReportDone`, `weekReportInProg`, `weekReportTotal`, `weekReportTopHabit`, `weekReportBestDay`, `weekReportClose`, `weekReportShare`, `weekReportCardTitle` (vi + en).
- **Test textual**: app.html có `weekReportModal` + `data-action="week-report"`; app.js có `weeklyReportData`, `weekReportCardBlob`, `share_week_report`; i18n vi+en.

## Task 3 — Widget Pomodoro trong tuần view (4.3)

- **app.html**: thêm card `.pomo-widget` trong `view-week` section (trước hoặc sau `.week-head`): `.pomo-widget` chứa `.pomo-widget-mode` + `.pomo-widget-time` (id `pomoWidgetTime`) + 3 nút `data-action="pomo-start"` (id `pomoWidgetStart`), `data-action="pomo-reset"`, và mini-panel đổi mode work/break (nút `data-action="pomo-mode"` data-mode) + dòng stats `pomoWidgetStats` (session hôm nay / tổng phút tuần).
- **app.js**:
  - `pomoLog` state mới: key `planner-pomo-log` → `{ [YYYY-MM-DD]: { count, secs } }` (localStorage + `window.Sync.push`). Migration không cần (đọc lười).
  - `pomoStart()` (3452) hiện chỉ cập nhật overlay `pomoPanel` — mở rộng: khi `pomodoro_complete` → ghi log ngày hôm nay (`pomoLog[date].count++`, `.secs += POMO_WORK`) + `renderPomoWidgetStats()`. Giữ `trackEvent('pomodoro_complete')`.
  - `renderPomoWidget()`: đồng bộ `#pomoWidgetTime` + `#pomoWidgetStart` text + mode với engine `pomo` hiện có (tái dùng hàm `updatePomoUI()`/tạo hàm chung `pomoRenderAll()` cập nhật cả overlay lẫn widget). Gọi trong `renderWeek()` + `setInterval` hiện tại của pomo (3460).
  - `renderPomoWidgetStats()`: tổng count/secs hôm nay (`pomoLog[fmtDate(now)]`) + tuần (cộng 7 ngày của `PLAN_START` + tuần hiện tại — đơn giản: cộng từ `planner-pomo-log` theo ngày trong khoảng `PLAN_START..PLAN_END` của tuần).
  - Handler: `'pomo-mode'` → đổi `pomo.mode` + reset `left` + `renderPomoWidget()` + track `pomodoro_mode`.
  - FAB `pomo-fab` giữ nguyên (mở overlay). Widget hiển thị cả trên mobile (flex wrap).
- **CSS**: `.pomo-widget`, `.pomo-widget-time` (font mono lớn), `.pomo-widget-stats`, nút nhỏ. Dark mode: dùng biến sẵn có.
- **i18n**: `pomoWidgetTitle`, `pomoWork`, `pomoBreak`, `pomoToday`, `pomoWeek`, `pomoMin` (vi + en). Tái dùng `pomoStart`/`pomoReset`/`pomoPause` có sẵn.
- **Test textual**: app.html có `pomo-widget` + `data-action="pomo-mode"`; app.js chứa `planner-pomo-log`, `renderPomoWidgetStats`, `pomoRenderAll` (hoặc tương đương); i18n `pomoWidgetTitle` vi+en.

## Task 4 — Verification chốt phase

1. `node --check` toàn bộ JS (app.js, plan-stats.js, plan-math.js, deeplink.js, sync.js, api-config.js, sw.js).
2. `node --test tests/*.test.mjs` (phase0 + phase1 + phase2 mới) + `node test-sync.js` → tất cả xanh.
3. sw.js: thêm file mới (nếu có) vào APP_SHELL + bump `taskflow-v26` → `taskflow-v27`. app.html: script `?v=` bump (app.js v36, styles.css v37, plan-stats.js v2 nếu đổi).
4. Smoke browser (python http.server + Playwright):
   - Remind: mở `remindPop`, bật nhắc 1 habit với giờ sắp tới (set giờ = now+1 phút) → chờ → notification hiện + `planner-remind`/localStorage lưu đúng; tắt nhắc → không còn timeout.
   - Báo cáo tuần: mở modal → donut + bar 7 ngày + topHabit; share → file `taskflow-week-report.png` tải về.
   - Pomo widget: vào view tuần → bấm start → time đếm ngược trên widget; hoàn thành (reset về 25:00 để test nhanh) → `planner-pomo-log` hôm nay count=1; stats hiển thị đúng.
   - Hồi quy: deep link, toggle habit, chuyển view, export CSV vẫn chạy.
5. Cập nhật README (tính năng Phase 4) + đánh dấu 4.1–4.3 DONE trong spec.
6. KHÔNG commit (user tự quyết định).

## Rủi ro / lưu ý

- Periodic sync trình duyệt chỉ cho `minInterval` lớn (~12h) và cần engagement — nhắc chính xác giờ **chỉ đảm bảo khi app mở** (`setTimeout`); khi đóng app chỉ nhận được nhắc daily-reminder cũ. Ghi rõ giới hạn trong README; không hứa hẹn push server-side (YAGNI).
- `setTimeout` max ~24.8 ngày (2^31 ms) — nhắc theo giờ trong ngày luôn < 24h, an toàn; vẫn clear/schedule lại mỗi lần render.
- Đổi tháng/tuần phải gọi `syncReminderTimers()` lại (state mới) và clear timeout cũ.
- `planner-pomo-log` tăng vô hạn theo ngày — chấp nhận (nhỏ); có thể dọn > 1 năm trong lúc đọc.
- Widget pomodoro phải đồng bộ 1 chiều với overlay (cùng biến `pomo`) — không tạo state thứ hai.
- Tiến trình nền user có thể bump version giữa chừng → đọc lại file trước mỗi edit; test textual dùng regex linh hoạt.
