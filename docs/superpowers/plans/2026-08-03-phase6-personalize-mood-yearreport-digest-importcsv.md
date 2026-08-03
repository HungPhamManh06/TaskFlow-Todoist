# Plan: Phase 6 — Cá nhân hoá & Dữ liệu thông minh (Habit templates, Mood, Báo cáo năm, Digest, Import CSV)

- Ngày: 2026-08-03
- Spec gốc: `docs/superpowers/specs/2026-08-03-feature-roadmap-design.md` (mục 6A.2, 6B.1–6B.4)
- Phong cách: vanilla JS, không framework; i18n luôn thêm cả `vi` + `en`; TDD — logic thuần đưa vào module `js/plan-math.js` / `js/plan-stats.js` (đã có `window.PlanMath`/`window.PlanStats` + `module.exports`); test bằng `node --test` (phải liệt kê file, `node --test tests` lỗi trên Windows).

## Bối cảnh code (đã khảo sát)

- **Version trước Phase 6**: `styles.css?v=44`, `app.js?v=38`, `plan-stats.js?v=1`, SW cache `taskflow-v33`. Mọi file đổi phải bump. → đã bump: `styles.css?v=45`, `app.js?v=39`, `plan-stats.js?v=2`, SW `taskflow-v34`.
- **Đã có sẵn (user đã làm, uncommitted)**: theme picker (6A.1), onboarding (6A.3), confetti (6A.4), toàn bộ Phase 5 → Phase 6 **không code lại** những phần này.
- **Dữ liệu mặc định**: đầu `js/app.js` (dòng 1–~100) có seed `DAYS`/`HABIT_DEFS`/`GOAL_DEFS`/`WEEK_PATTERNS` — không đụng tới.
- **Export CSV sẵn có**: `buildCSVRows` trong `js/plan-stats.js` — các section: `MonthlyGoals`, `Habits`, `Tasks`, `MonthReflections`, `YearGoals`, `YearReflections`, `YearNotes` + dòng đầu `TaskFlow-Todoist Export`; **dòng dữ liệu lặp lại tag section**, dòng header có cột 1 là tên cột chuẩn (`Month`/`Kind`/`Scope`) → `parseCSVRows` phân biệt header/data bằng cột 1 (bảng `CSV_HEADER_COL1`).
- **Pattern modal chia sẻ ảnh**: `weekReportModal` + `weekReportCardBlob` (canvas 1080×1080) — copy cho `yearReportModal`/`yearReportCardBlob`. Các key share đã có: `shareDone`/`shareFail`/`shareNamePrompt`/`meName`.
- **Notification SW**: `sw.js` có `showReminder()` được gọi bởi periodic sync + notificationclick — Phase 6.3 chỉ thêm đọc `./digest.json` từ cache `taskflow-digest` (app ghi qua `updateDigestCache`, throttle 60s).
- **Sync đám mây**: `handleSyncChange(keys)` áp thay đổi remote — mood thêm key `planner-mood` (đã có pattern `planner-theme`).
- **Mutation cần undo**: `UNDOABLE_ACTS` (Phase 5) — Phase 6 thêm `template-add`, `demo-data`.

## Task 1 — Thói quen mẫu (6A.2) + Demo data

- `HABIT_TEMPLATES`: 16 mục `{ icon, vi, en }` (💧 uống nước, 📚 đọc sách, 🏃 vận động, 😴 ngủ đủ, 🥗 ăn lành, 🧘 thiền, ✍️ viết nhật ký, 💻 học kỹ năng, 🚶 đi bộ, 🙏 biết ơn, 📵 bỏ điện thoại, 🍳 nấu ăn, 🧹 dọn nhà, 🐱 chăm thú cưng, 🌅 dậy sớm, 💪 tập gym).
- UI: nút `✨ Thói quen mẫu` (`data-action="templates-toggle"`) cạnh tiêu đề panel thói quen → popup `templatesPopHTML()` (16 chip `data-action="template-add"` `data-name`), đóng khi click ngoài.
- `template-add`: `addHabit(name)` (hàm có sẵn) + `trackEvent('template_add')`; thuộc `UNDOABLE_ACTS`.
- `demoPlan()`: nếu trống → tạo 3 mục tiêu tháng + 4 thói quen (tick ngẫu nhiên 80% các ngày đã qua) + 2 task hôm nay; nội dung theo `LANG` (vi/en); `renderCurrentView()` + `trackEvent('demo_data')`; thuộc `UNDOABLE_ACTS`. Nút `🎬 Demo` trong popup 💾 (`data-action="demo-data"`).
- i18n: `templatesTitle`, `templatesHint`, `demoData`, `demoDataDone`.
- Test: `HABIT_TEMPLATES`, `data-action="templates-toggle"`, `template-add`, `demoPlan`, `trackEvent('demo_data')`.

## Task 2 — Mood tracker (6B.1)

- Module `js/plan-stats.js`: `moodSummary(pairs)` thuần — pairs `[{date, mood, habitPct}]` → `{ goodDays, badDays, goodAvg, badAvg, delta }` (mood ≥ 3 = ngày vui, ≤ 1 = ngày buồn, skip không rõ); trả `null` nếu thiếu một phía; `delta` = goodAvg − badAvg.
- app.js: `MOOD_KEY = 'planner-mood'` (JSON `{'Y-M-D': 0..4}`) + `loadMood()/saveMood()` (saveMood push `window.Sync.push(MOOD_KEY)`), `moodDateKey(d)`, `moodCardHTML()` (heatmap 31 ô `.mood-cell` + insight).
- UI: view Tuần — mỗi ngày thêm hàng `.mood-row` 5 nút `data-action="mood"` `data-day-key` `data-mood`; view Tổng quan — card `.mood-card` (heatmap + insight text từ `moodSummary`).
- `handleSyncChange`: key `planner-mood` → `loadMood()` + render.
- i18n: `moodTitle`, `moodHint`, `mood0..mood4`, `moodInsight` (dùng `delta`/`goodAvg`/`badAvg`), `moodInsightNone`.
- Test: unit `moodSummary` (2 case) + textual mood UI/insight.

## Task 3 — Báo cáo năm (6B.2)

- app.js: `yearlyReportData()` (dùng `yearGoalStats`/`yearMonthlyData`/`bestHabitAcrossYear`/`bestProductiveDay` có sẵn) → `{ goalPct, topMonth, topGoalKind, bestHabit, prodDay, goalDone, goalTotal }`; `renderYearReportModal()` + `openYearReportModal()` (nút `data-action="year-report"` trong `.year-banner` view Năm) + `closeYearReportModal()` (Esc + click ngoài); `yearReportCardBlob()` (canvas 1080×1080) + `doShareYearReport()` (share native → fallback download, `trackEvent('share_year_report')`).
- app.html: modal `#yearReportModal` sau `#weekReportModal`.
- i18n: `yearReportTitle`, `yearReportGoalPct`, `yearReportTopMonth`, `yearReportBestHabit`, `yearReportProdDay`, `yearReportShare`, `yearReportCardTitle`.
- Test: textual — `yearlyReportData`, `yearReportModal`, `data-action="year-report"`, `taskflow-year-report.png`.

## Task 4 — Weekly digest (6B.3)

- app.js: `computeDigest()` — đọc state tháng hôm qua (key `planner-y-m`) → `{ date, missedHabits: [...], todayGoals: [...] }`; `updateDigestCache()` — ghi vào `caches.open('taskflow-digest')` → `./digest.json`, throttle 60s, fail-silent; gọi ở boot (setTimeout 2s), `afterHabitToggle()`, `refreshToday()`.
- sw.js: `showReminder()` — thử đọc `./digest.json` từ cache; nếu `d.date === new Date().toDateString()` dùng `digestBody` (danh sách habit bỏ lỡ + mục tiêu hôm nay), else fallback nội dung cũ. Giữ cache `taskflow-digest` trong activate.
- i18n: `digestBody` (mẫu text), `digestNone` (đủ habit).
- Test: textual — `updateDigestCache`, `'taskflow-digest'`, `digest.json` ở cả app.js + sw.js.

## Task 5 — Import CSV (6B.4)

- Module `js/plan-stats.js`: `splitCSVLine(line)` (hỗ trợ nháy kép + escape `""`, giữ ký tự CR bên trong); `parseCSVRows(text)` → `{ months: { m: { goals, habits, tasks } }, year: { goals } }` — bỏ qua dòng rác + section chưa biết, không ghi đè dữ liệu có sẵn.
- app.js: `importCSVFile(file)` — `FileReader` → parse → `confirm` (`importConfirm`) → `pushUndo()` → merge **theo tên** (habit gộp ngày tick, goal/task giữ nguyên) → `saveMonthState` từng tháng + `saveYear` → alert `importCsvDone`; lỗi → `importCsvError`. Route trong `#importFile` change: `.csv` → `importCSVFile`, còn lại → `importJSONFile` (đã có). Nút `📥 Nhập CSV` trong popup 💾.
- i18n: `importCsv`, `importCsvDone`, `importCsvError`, `importConfirm`.
- Test: unit `splitCSVLine` + round-trip `buildCSVRows → parseCSVRows` + dòng rác; textual — handler + routing `.csv$` + accept attr + nút.

## Verification

- `node --check` từng file JS.
- `node --test "tests\phase0.test.mjs" "tests\phase1.test.mjs" "tests\phase2.test.mjs" "tests\phase5.test.mjs" "tests\phase6.test.mjs"` → 93 tests pass; `node test-sync.js` → 7 pass.
- Smoke: mở `index.html` — thêm habit từ mẫu, chấm mood, báo cáo năm + share ảnh, nhập CSV, demo data, weekly digest cache.
- Không commit (user tự quyết). Cập nhật README + spec (Phase 5 ✅, Phase 6 đang triển khai).
