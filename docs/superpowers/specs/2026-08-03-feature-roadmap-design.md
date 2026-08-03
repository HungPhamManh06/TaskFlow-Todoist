# Feature Roadmap — TaskFlow-Todoist

- Ngày: 2026-08-03
- Trạng thái: Đã duyệt (toàn bộ 4 pha) — Phase 0 ✅, Phase 1 ✅, Phase 2 ✅, Phase 3 ✅, Phase 4 ✅ hoàn thành 2026-08-03

## Bối cảnh

Ứng dụng vanilla HTML/CSS/JS (~3.800 dòng JS) + backend Express/Postgres. Codebase đã được khảo sát đầy đủ; mọi tham chiếu dòng dựa trên bản hiện tại.

## Pha 0 — Chất lượng & vá lỗ hổng ✅ DONE

| # | Việc | Chi tiết kỹ thuật |
|---|---|---|
| 0.1 | PWA offline có sync ✅ | `js/sync.js` + `js/api-config.js` + `js/deeplink.js` vào APP_SHELL (sw.js); cache bump (nền có tiến trình bump tiếp lên v22+) |
| 0.2 | Deep link `?view=` ✅ | Module mới `js/deeplink.js` (unit test 8 case); boot parse `?view=` + `?m=YYYY-M` (app.js boot); manifest shortcuts hoạt động |
| 0.3 | Tạo lại `app-screenshot.png` ✅ | Chụp app thật 1200×900 bằng agent-browser (199 KB, tông pastel, đủ nội dung) — hết 404 trên landing |
| 0.4 | Dọn code chết ✅ | Xoá block `.landing-video` (app.js setView); sửa copy "Supabase" → "đồng bộ đám mây" (app.js vi/en + section comment, index.html landing vi/en, css comment, README) |
| 0.5 | Nút cài đặt app ✅ | `beforeinstallprompt` → nút 📲 header (ẩn khi không khả dụng); event `pwa_prompt` GA4 |
| 0.6 | Kích hoạt GA4/FB 📝 | User chưa có ID → chỉ ghi README hướng dẫn "Kích hoạt Analytics & Góp ý" |

Kiểm thử: `tests/phase0.test.mjs` 12/12 PASS (node --test), `node test-sync.js` 7/7 PASS, `node --check` toàn bộ JS sạch, smoke test browser: deep link year/month, chuyển view, tick habit (31→30), toggle goal (9→8) persist đúng, export JSON không lỗi.

## Pha 1 — Thói quen & gamification ✅ HOÀN THÀNH (2026-08-03)

| # | Việc | Chi tiết kỹ thuật |
|---|---|---|
| 1.1 | Habit target có UI | ✅ Nút 🎯 trong habit row → `beginTargetEdit()`; `habitPct` dùng `PlanMath.habitPctFrom`; migration `loadState` gán target=100 cho habit cũ |
| 1.2 | Lặp habit qua tháng | ✅ Nút 🗓️ trong `.habit-add-row` → `copyHabitsToNextMonth()` giữ `id` (streak xuyên tháng) + target, days trống |
| 1.3 | Nhiều năm | ✅ `openYear(dy)` + nút «/», `yearKey()` = `planner-year-{PLAN_YEAR}`, `openMonth` wrap qua năm bằng `PlanMath.prevMonth/nextMonth`, tab "Năm YYYY" động |
| 1.4 | Tổng kết tháng | ✅ Modal "Báo cáo tháng" (donut + 5 ô thống kê + weekbars), canvas 1080×1080 → `navigator.share`/tải `taskflow-report.png` |
| 1.5 | Huy hiệu | ✅ 6 badge (b7, b30, best14, goals100, habit100, active15), key `planner-badges`, tự sync, chỉ trao khi xem tháng hiện tại |

## Pha 2 — Năng suất ✅ HOÀN THÀNH (2026-08-03)

| # | Việc | Chi tiết kỹ thuật |
|---|---|---|
| 2.1 | Tìm kiếm xuyên tháng | Modal tìm goal/task/habit/reflection theo text; đọc chéo `monthStateRaw()` (pattern streak, app.js:1667) |
| 2.2 | Tag cho task | Mảng `tags` trong task object; chip màu + lọc nhanh |
| 2.3 | View Lịch | Tab thứ 4: calendar grid 7 cột × tuần hiện task theo ngày; pattern thêm view (app.html section + `buildNav` app.js:2566 + `setView` 2581) |
| 2.4 | Template tháng | "Sao chép cấu trúc tháng" (goals + habits + tuần, bỏ ticks) sang tháng khác |
| 2.5 | Dashboard | Nâng cấp year view: best habit, ngày năng suất nhất, tỉ lệ theo quý (dùng `yearMonthlyData()` app.js:257) |
| 2.6 | Pomodoro | Overlay timer 25/5 + `trackEvent` |

## Pha 3 — Backend & kiểm thử ✅ HOÀN THÀNH (2026-08-03)

| # | Việc | Chi tiết kỹ thuật |
|---|---|---|
| 3.1 | Tài khoản | `POST /api/auth/change-password`, `DELETE /api/auth/me` + modal Profile (server/auth.js:59–95) |
| 3.2 | Rate limit | express-rate-limit cho login/signup |
| 3.3 | Unit test app.js | Tách hàm thuần (streak, `yearMonthlyData`, CSV) → `node:test` theo mẫu test-sync.js |
| 3.4 | E2E smoke | Playwright: load app → toggle habit → chuyển view → export |
| 3.5 | CI | GitHub Actions: `node --test` + `node test-sync.js` mỗi push |

## Pha 4 — Nhắc việc, báo cáo tuần & widget Pomodoro ✅ HOÀN THÀNH (2026-08-03)

| # | Việc | Chi tiết kỹ thuật |
|---|---|---|
| 4.1 | Nhắc việc cho habit/task | ✅ Field `remind: { enabled, time }` trên habit + task (migration loadState); nút 🔔 cạnh tên → inline picker giờ; danh sách nhắc trong `remindPop`; `syncReminderTimers()` schedule setTimeout mỗi mốc (tự reschedule ngày sau), `trackEvent('reminder_show'|'reminder_item_set')` |
| 4.2 | Báo cáo thống kê tuần | ✅ Modal `weekReportModal`: `weeklyReportData(w)` (goals pct, habitByDay 7 ngày, top habit, bestDay), canvas 1080×1080 → `taskflow-week-report.png`, nút 📊 trong `week-banner` renderWeek, `trackEvent('share_week_report')` |
| 4.3 | Widget Pomodoro trong tuần view | ✅ Card `.pomo-widget` trong `view-week` (timer + start/pause/reset + chuyển work/break), đồng bộ 1 chiều với overlay qua `renderPomo()`; `planner-pomo-log` đếm session hôm nay/tuần, `pomoSetMode`, `trackEvent('pomodoro_mode')` |

## Loại bỏ (YAGNI)

Real-time sync (SSE/WebSocket), export Google Sheets trực tiếp, kanban, mã hoá đầu cuối, email reset password, notification server-side push (FCM/Web Push) — nhắc việc chạy client-side thuần (SW + `setTimeout`), không cần backend mới.

## Nguyên tắc triển khai

- Mỗi pha ship độc lập; Phase 0–2 không sửa backend (server generic `{key, data}` JSONB).
- Thêm key i18n vào cả `vi` + `en` (app.js:406–803); `data-action` cho nút mới (app.js:2632).
- Data mới phải qua migration như pattern `reflectionQuestions` (app.js:1242).
- Chạy `node test-sync.js` trước khi kết thúc mỗi pha.
