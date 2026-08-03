# Plan: Phase 1 — Habit mục tiêu, Sao chép, Nhiều năm, Báo cáo, Huy hiệu

- Ngày: 2026-08-03
- Spec gốc: `docs/superpowers/specs/2026-08-03-feature-roadmap-design.md` (mục 1.1–1.5)
- Phong cách: vanilla JS, không framework; i18n luôn thêm cả `vi` + `en`; TDD — logic thuần đưa vào module mới `js/plan-math.js` (giống pattern `js/deeplink.js`: IIFE `window.` + `module.exports`), test bằng `node --test`.

## Bối cảnh code (đã khảo sát)

- `habitPct(h)` (app.js:1411) = done / elapsed — BỎ QUA `h.target` (chỉ seed ở `defaultState`, `addHabit` không set).
- `yearKey()` (app.js:134) dùng `new Date().getFullYear()` thay vì `PLAN_YEAR` → xem tháng 2027 vẫn ra năm 2026. Tương tự `loadYearState()` (193) kiểm `s.year !== new Date().getFullYear()`, `defaultYearState()` (156), `renderYear`/`yearCardHTML`/`yearGoalsCardHTML` (2288, 2299), `buildNav` tabYear (2628).
- `openMonth(m)` (2665) chặn `m < 0 || m > 11` → không wrap qua năm. `yearState = bootYearState()` chỉ boot 1 lần ở dòng 211 → phải re-boot khi đổi `PLAN_YEAR`.
- Đã có sẵn hạ tầng xuyên tháng: `monthStateRaw(y,m)` (1725), `habitInMonthState` (1736), `habitTimeline(h, 12)` (1757), `habitStreakOf` (1771), `saveMonthState(y,m,s)` (290), `loadMonthStateOrCreate(y,m)` (268), `invalidateYearCache` (266).
- Share ảnh có sẵn pattern canvas: `streakCardBlob` (1989) + `doShareStreak` (2088) → tái dùng cho báo cáo tháng.
- Modal sẵn pattern: `.sync-modal` / `.onboard-modal` (app.html:175, 212; css 1736+).
- Header nav: app.html:70–77 (`.month-nav`).
- LƯU Ý: tiến trình nền của user đang bump version sw.js/app.html — đọc lại file trước khi edit, KHÔNG sửa cache version của sw.js trừ khi cần (thêm file mới `js/plan-math.js` thì PHẢI thêm vào APP_SHELL + bump cache + đảm bảo script tag app.html có `?v=` bump).

## Task 1 — Module `js/plan-math.js` + test (TDD, logic thuần)

Tạo `js/plan-math.js`: IIFE như `js/deeplink.js`, exports `window.PlanMath` + `module.exports`.

```js
elapsedDays(y, m, now)          // habitDaysElapsed thuần: cùng tháng/năm → min(now.date, numDays), khác → numDays
numDaysOf(y, m)                 // new Date(y, m+1, 0).getDate()
habitPctFrom(days, elapsed, target) // target<=0 → target=100; 100% = đủ (elapsed * target/100) ngày; clamp 0..100
nextMonth(y, m) → {y, m}        // 11 → năm sau tháng 0
prevMonth(y, m) → {y, m}        // 0 → năm trước tháng 11
currentStreak(flags[])          // đếm lùi từ cuối
bestStreak(flags[])             // chuỗi dài nhất
evaluateBadges({ streaks: {id:{cur,best}}, goalPct, habitPcts: [{id,pct}], activeDays, numDays, targetHabitPcts? }) → ['b7','b30','goals100','habit100','active15']  
```

Quy tắc badge (id → điều kiện):
- `b7`: tồn tại habit có cur ≥ 7
- `b30`: tồn tại habit có cur ≥ 30
- `goals100`: goalPct = 100
- `habit100`: mọi habit đều đạt target (pct ≥ 100, habits không rỗng)
- `active15`: activeDays ≥ 15 (số ngày có ít nhất 1 ô habit tick trong tháng hiện tại)

Tạo `tests/phase1.test.mjs` (node --test) với ít nhất:
- elapsedDays: tháng hiện tại → ngày hôm nay; tháng khác → đủ tháng; tháng 2 năm nhuận (2024) = 29.
- habitPctFrom: target 100 = hành vi cũ; target 50 với 25/30 ngày đã làm = 100; target 0 → 100; clamp > 100.
- nextMonth(2026,11) → {2027,0}; prevMonth(2026,0) → {2025,11}.
- currentStreak/bestStreak: [T,T,T,F,T,T] → cur 2, best 3; rỗng → 0; toàn T → cur=best=n.
- evaluateBadges: từng badge; kết hợp nhiều; habits rỗng → không habit100.

Chạy `node --test tests/phase1.test.mjs` → xanh. CHẠY LẠI `node --test tests/phase0.test.mjs` để chắc không phá.

## Task 2 — Habit target có UI (1.1)

- `js/app.js`:
  - `habitPct(h)` dùng `PlanMath.habitPctFrom(h.days, habitDaysElapsed(), h.target)`; `addHabit` thêm `target: 100`.
  - Migration: trong `loadState()` sau validate — nếu `typeof h.target !== 'number' || h.target < 1` → `h.target = 100` (chạy cho mọi habit trong `s.habits`).
  - UI: trong `habitPanelHTML` item-actions thêm `<button ... data-action="targetedit" data-id="${h.id}" title="${t('targetAria', { n: h.target ?? 100 })}">🎯</button>`; thêm hàm `beginTargetEdit(btn)` giống `beginInlineEdit`: tạo `input type=number min=1 max=100` trong `.habit-name-cell`, commit → `h.target = clamp(1..100)`, `refreshHabitLabels`? (chỉ cần re-render pct) → `renderOverview(); save(); trackEvent('edit_habit_target')`.
  - Handler click: nhánh `act === 'targetedit'`.
- `js/plan-math.js` không đổi.
- Test textual (thêm vào phase1.test.mjs): app.js chứa `target: 100` trong `addHabit`; chứa `habitPctFrom`; chứa `data-action="targetedit"`; loadState chứa `h.target = 100` (migration). i18n: `targetAria` tồn tại ở cả vi + en (đọc I18N trong file).

## Task 3 — Sao chép habit sang tháng sau (1.2)

- `habitPanelHTML`: nút `data-action="copyhabits"` (trong `.habit-add-row` hoặc `.habit-title-row`) → `t('copyHabitsTxt')` + icon 🗓️.
- `copyHabitsToNextMonth()`:
  - `const { y, m } = PlanMath.nextMonth(PLAN_YEAR, PLAN_MONTH);`
  - `let s = loadMonthStateOrCreate(y, m)` (tháng sau), đảm bảo `s.habits` là array.
  - Với mỗi habit hiện tại: tìm trong `s.habits` theo id rồi theo tên (`habitInMonthState`); nếu có → thay thế `{ ...old, id: h.id, name: h.name, target: h.target, days: fresh }`; nếu chưa → push `{ id: h.id, name: h.name, target: h.target, days: fresh }`. days = `Array.from({length: numDaysOf(y,m)}, () => false)` — KHÔNG copy tick, chỉ copy tên/target/id để streak nối xuyên tháng.
  - `saveMonthState(y, m, s); invalidateYearCache();`
  - Thông báo: toast/alert `t('copyHabitsDone', { n })` (n = số habit).
- Handler: `act === 'copyhabits'` → gọi hàm + `trackEvent('copy_habits', { n })`.
- i18n: `copyHabitsTxt`, `copyHabitsDone`.
- Test textual: app.js chứa `data-action="copyhabits"`, `copyHabitsToNextMonth`, `'planner-'` save qua `saveMonthState`; i18n cả vi+en. (Smoke test ở Task 7 xác nhận id giữ nguyên.)

## Task 4 — Nhiều năm: điều hướng + đồng bộ PLAN_YEAR (1.3)

- `yearKey()` → `'planner-year-' + PLAN_YEAR`.
- `loadYearState()`: kiểm `s.year !== PLAN_YEAR`.
- `defaultYearState()`: `year: PLAN_YEAR`.
- `openMonth(m)`: bỏ chặn biên — dùng `const { y, m: nm } = PlanMath` wrap: nếu m<0 → năm trước tháng 11; m>11 → năm sau tháng 0; đổi `initPlan(new Date(y, nm, 1))`; sau boot: `yearState = bootYearState();` (re-boot year cho đúng PLAN_YEAR).
- Nav thêm 2 nút năm: app.html `.month-nav` thêm `‹‹` (data-action="prevyear") và `››` (data-action="nextyear") với title/aria i18n `prevYear`/`nextYear`; handler: `openMonth(PLAN_MONTH)` nhưng đổi năm ±1 (viết `openYear(dy)`): `initPlan(new Date(PLAN_YEAR + dy, PLAN_MONTH, 1)); state = bootState(); yearState = bootYearState(); state.view='overview'; updateBrand(); updateNowBtn(); buildNav(); setView('overview', state.currentWeek);`
- `buildNav()` tabYear: `t('tabYear', { y: PLAN_YEAR })`.
- `renderYear`/`yearCardHTML`/`yearGoalsCardHTML`: `new Date().getFullYear()` → `PLAN_YEAR`.
- `gotoday` đã ok (dùng now). `viewedMonth` logic giữ nguyên.
- Test textual: yearKey dùng PLAN_YEAR; loadYearState `s.year !== PLAN_YEAR`; buildNav `{ y: PLAN_YEAR }`; app.html có `prevyear`/`nextyear`; i18n `prevYear`/`nextYear` vi+en.

## Task 5 — Báo cáo tháng + chia sẻ ảnh (1.4)

- `app.html`: modal mới `reportModal` (pattern `.sync-modal`): `div.report-modal#reportModal hidden` chứa `.report-modal-card` + nội dung `#reportContent` + nút đóng (data-action="close-report") + nút `📤` (data-action="share-report").
- `js/app.js`:
  - `monthlyReportData()`: `{ y: PLAN_YEAR, m: PLAN_MONTH, goalPct, habitAvg, topHabit: {name, cur}, bestRecord: {name, best}, activeDays, numDays }` (dùng `monthlyStats()`, `habitStreakCached`, đếm ngày có ≥1 tick).
  - `renderReportModal()`: điền `#reportContent` HTML (donut mục tiêu, % habit trung bình, top 🔥, kỷ lục 🏆, activeDays/numDays).
  - `reportCardBlob(data)`: canvas 1080×1080 theo style `streakCardBlob` (gradient + circle + tiêu đề "Báo cáo {tháng} {năm}" + donut vẽ tay + bar chart 4-6 tuần + footer share).
  - `doShareReport()`: giống `doShareStreak` (navigator.share files → fallback download `taskflow-report.png`; track `share_report`).
  - Handler: `act === 'report'` → `renderReportModal(); show #reportModal`; `act === 'close-report'` → hide; `act === 'share-report'` → `doShareReport()`. Esc đóng (nếu có pattern sẵn cho syncModal thì theo).
  - Nút mở: thêm vào `habitHeatCardHTML` hm-head cạnh nút share-streak: `data-action="report"` title `t('reportTitle')`.
- CSS (css/styles.css, theo `.sync-modal`): `.report-modal`, `.report-modal-card`, các dòng báo cáo, donut.
- i18n: `reportTitle`, `reportGoalPct`, `reportHabitAvg`, `reportTopHabit`, `reportRecord`, `reportActive`, `reportClose`, `reportShare`, `reportCardTitle`.
- Test textual: app.html có `reportModal` + `data-action="report"`; app.js có `monthlyReportData`, `reportCardBlob`, `share_report`; i18n vi+en.

## Task 6 — Huy hiệu (1.5)

- Lưu trữ: key `planner-badges` → `{ earned: { b7: { t: <epoch ms>, y, m }, ... } }`.
- `js/app.js`:
  - `loadBadges()` / `saveBadges(badges)` (localStorage + `window.Sync.push('planner-badges')`).
  - `evaluateMonthBadges()`: tính `{ streaks, goalPct, habitPcts, activeDays }` từ state hiện tại → `PlanMath.evaluateBadges` → với badge mới (chưa có trong `earned`) → thêm `{ t, y: PLAN_YEAR, m: PLAN_MONTH }`, toast 🎖️ `t('badgeNew', { b: t('badge' + id) })`, `trackEvent('award_badge', { badge: id })`, saveBadges.
  - Gọi trong `renderOverview()` (mỗi lần render tháng hiện tại — tránh award khi xem tháng khác: chỉ khi `nowInfo().inRange` hoặc PLAN_YEAR/MONTH == hiện tại? Đơn giản: chỉ award khi đang xem tháng hiện tại, không award cho tháng xem lại).
  - `badgePanelHTML()`: card nhỏ hiển thị 5 badge: đã mở khoá → màu + title ngày `t('badgeEarned', { d: ... })`; chưa → xám + title điều kiện `t('badgeHint' + id)`. Thêm vào `renderOverview()` sau `habitHeatCardHTML()`.
- CSS: `.badge-card`, `.badge-grid`, `.badge-item`, `.badge-item.locked`.
- i18n: `badgesTitle`, `badge7`, `badge30`, `badgeGoals100`, `badgeHabit100`, `badgeActive15`, `badgeNew`, `badgeEarned`, `badgeHint7`, `badgeHint30`, `badgeHintGoals100`, `badgeHintHabit100`, `badgeHintActive15` (vi+en).
- Test textual: app.js chứa `planner-badges`, `evaluateBadges` (qua PlanMath), `badgePanelHTML`; i18n vi+en.

## Task 7 — Verification chốt phase

1. `node --check` toàn bộ JS (app.js, plan-math.js, deeplink.js, sync.js, api-config.js, sw.js).
2. `node --test tests/phase1.test.mjs` + `node --test tests/phase0.test.mjs` + `node test-sync.js` → tất cả xanh.
3. sw.js: thêm `./js/plan-math.js` vào APP_SHELL + bump `taskflow-v` lên (hiện đang v22 → v23). app.html: thêm `<script src="js/plan-math.js?v=1"></script>` trước app.js; script tags `?v=` bump 1.
4. Smoke browser (agent-browser + python http.server):
   - prevyear/nextyear: `?m=2027-3` → bấm prevyear → year hiển thị 2026, localStorage `planner-year-2026` tồn tại; bấm nextyear quay lại 2027.
   - prev từ January 2027 → wrap về December 2026 (monthSelect value 11, year 2026).
   - Copy habits: tick 1 habit → copyhabits → đọc `planner-2027-4` (tháng sau): habit cùng id, days toàn false.
   - Target edit: click 🎯 → set 50 → habitPct hiển thị tính theo target.
   - Report: mở modal báo cáo → có donut + số liệu; bấm share → file `taskflow-report.png` tải về (check download).
   - Badges: inject state 7 ngày tick liên tiếp → render → `planner-badges` có `b7`, panel hiện badge.
   - Deep link cũ vẫn chạy (hồi quy).
5. Chụp lại `app-screenshot.png` (overview giờ có badge card) 1200×900, thay landing.
6. Cập nhật README (cấu trúc: `js/plan-math.js`; mô tả tính năng Phase 1) + đánh dấu 1.1–1.5 DONE trong spec.
7. KHÔNG commit (user tự quyết định).

## Rủi ro / lưu ý

- Tiến trình nền user có thể bump version giữa chừng → đọc lại file trước mỗi edit; test textual dùng regex linh hoạt.
- `loadMonthStateOrCreate` seed dữ liệu mẫu cho guest → sau copy, tháng sau vẫn là tháng mẫu + habit của bạn (hành vi chấp nhận được; đúng spec "giữ nguyên id").
- `evaluateBadges` chỉ award khi xem tháng hiện tại để tránh award giả khi xem lịch sử.
- Không đụng backend; `planner-badges` sync qua `Sync.push` như các key khác.
