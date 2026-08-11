# TaskFlow — Lịch sử phát triển (Development History)

> Ghi chép lịch sử triển khai TaskFlow theo từng giai đoạn (phase).
> Nội dung trong trang này được chuyển từ `README.md` để giữ README tập trung
> vào sản phẩm hiện tại — hữu ích cho người dùng mới, nhà phát triển và nhà
> tuyển dụng mà không cần đọc toàn bộ lịch sử dự án.

---

## Giai đoạn 5 — Growth loop

- 🔥 **Share streak**: nút *Chia sẻ streak 🔥* trên thẻ thói quen tạo ảnh card 1080×1080 (tên + số ngày liên tiếp + heatmap 16 tuần) tải về làm story — mỗi bài share là một kênh marketing miễn phí. Trên điện thoại hỗ trợ **Web Share API** (chia sẻ ảnh thẳng vào app khác).
- 💬 **Feedback FAB**: nút 💬 góc phải dưới mở popup Góp ý — nối **Google Form** qua `FB_FORM_URL` và email qua `FB_EMAIL` (khai báo đầu file `js/app.js`). Mọi phản hồi đều theo dõi bằng event `feedback_click` (GA4).
- 📊 **Iterate theo analytics**: điền `GA4_ID` (đầu `js/analytics.js` — hiện đang placeholder `G-XXXXXXXXXX`) để bắt đầu đo. Các event sẵn sàng: `first_visit`, `return_visit`, `create_goal`, `create_habit`, `create_task`, `share_streak` (kèm số ngày + kênh: native/fallback/download), `feedback_click`, `onboarding_*`, `export_*`, `print`, `reminder_*`.
  - Mẹo iterate: xem GA4 → *Reports → Engagement → Events* — kênh nào (landing → app, share story, bạn bè giới thiệu) đem traffic về, đổ thêm công sức vào kênh đó.

---

## Lộ trình phát triển (đã hoàn thành)

- [x] Tổng quan tháng + habit tracker + reflection
- [x] View tuần (task + ghi chú 7 ngày)
- [x] View **Kế hoạch năm** (goals, biểu đồ quý/tháng, reflection)
- [x] Điều hướng **12 tháng** — mỗi tháng dữ liệu riêng biệt
- [x] **CRUD động** mục tiêu & thói quen (thêm/sửa/xoá, lưu localStorage)
- [x] **Streak & heatmap** kiểu GitHub + streak đa tháng
- [x] **Nút "Hôm nay"** + tự nhảy tuần hiện tại
- [x] **4 chủ đề màu** pastel + toggle ngôn ngữ **VI/EN**
- [x] **Xuất/nhập JSON + CSV** (đồng bộ Google Sheets)
- [x] **Chế độ in / PDF** (A4 ngang, checkbox ☐/☑)
- [x] **PWA** — cài đặt offline, chạy như app thật & nhắc việc hằng ngày
- [x] **Analytics GA4** — lượt truy cập, quay lại, tạo mục tiêu/thói quen
- [x] **Đăng nhập & đồng bộ đa thiết bị (backend riêng)** — username/password + Google OAuth, offline-first
- [x] **Landing page tách riêng** (`index.html`) — SEO tĩnh, OG image 1200×630 cho Facebook/Zalo
- [x] **Onboarding 3 bước** — mục tiêu năm → 2 thói quen → chủ đề màu (lần dùng đầu)
- [x] **Empty states** có hướng dẫn cho từng panel (mục tiêu, thói quen)
- [x] **Share streak 🔥** — ảnh card 1080×1080 (tên + streak + heatmap) tải về / chia sẻ native
- [x] **Feedback FAB** 💬 — Google Form (`FB_FORM_URL`) + email (`FB_EMAIL`) + event GA4

---

## Ghi chú triển khai theo phase

### Phase 2

- 🔍 **Tìm kiếm xuyên tháng** (`Ctrl+K`) — tìm theo tên task, ghi chú, tag hoặc mục tiêu.
- 📋 **Template tháng** — sao chép cấu trúc tháng (mục tiêu, thói quen & cấu trúc tuần) sang tháng khác.
- 🍅 **Pomodoro** — timer 25/5, bộ đếm cà chua, nghỉ dài theo chu kỳ.

### Phase 3

- 👤 **Tài khoản & Profile** — đổi mật khẩu, xoá tài khoản (modal Profile trong app).

### Phase 4

- ➕ **Thêm nhanh (Quick Add)** — thêm task nhanh từ mọi màn hình với ngày/giờ/thời lượng/ưu tiên.
- 🔔 **Nhắc việc habit/task** — mỗi thói quen & task có giờ nhắc riêng (nút 🔔 cạnh tên); danh sách nhắc bật/tắt ngay trong popup header.
- 📊 **Báo cáo tuần** — % mục tiêu, số xong/đang làm/tổng, tỉ lệ habit 7 ngày, thói quen nổi bật, ngày năng suất nhất; chia sẻ ảnh 1080×1080.
- 🍅 **Widget Pomodoro trong tuần view** — timer 25/5 ngay trong view Tuần, thống kê session hôm nay/tuần (`planner-pomo-log`).

### Phase 5

- ↩️ **Undo / Redo** — mọi thao tác (tick task/habit/goal, thêm/xoá, sửa text, sắp xếp, cả "Đặt lại"); snapshot tối đa 50 bước trong phiên, phím `Ctrl+Z` / `Ctrl+Shift+Z`.
- 🔀 **Kéo-thả sắp xếp** — task trong ngày, mục tiêu trong tháng/tuần/năm, thói quen trong bảng (lưu ngay, có undo).
- ⌨️ **Phím tắt** — `Ctrl+K` tìm kiếm · `1-5` chuyển view · `/` focus ô thêm task hôm nay · `Esc` đóng modal/chế độ tập trung.
- 🕑 **Sao lưu tự động** — 7 bản sao lưu (`planner-backup-0..6`, vòng xoay) sau mỗi thay đổi; chốt 1 bản trước khi import JSON.
- 🎯 **Chế độ Tập trung** — overlay tối giản chỉ còn task hôm nay + thói quen cần làm.
- 🗂 **Task Detail Drawer** — deadline · giờ · thời lượng · ưu tiên · lặp lại · tags · ghi chú · subtasks · nhắc việc.

### Phase 6

- ✨ **Thói quen mẫu & Demo** — 16 gợi ý thói quen thêm 1 chạm; nút Demo tạo sẵn 3 mục tiêu + 4 thói quen + 2 task.
- 😊 **Mood tracker** — chấm mood mỗi ngày, heatmap cả tháng, insight tự động (ngày vui vs ngày buồn).
- 📅 **Báo cáo năm** — % hoàn thành mục tiêu, tháng đạt mục tiêu nhất, thói quen nổi bật, ngày năng suất nhất; chia sẻ ảnh 1080×1080.
- 📥 **Nhập CSV** — khôi phục từ file xuất; dữ liệu trùng tên **gộp vào, không ghi đè**.
- 🔔 **Weekly digest** — tóm tắt hôm qua (thói quen bỏ lỡ, mục tiêu hôm nay) hiển thị trong nhắc hằng ngày.

### Phase 8–9

- 🔧 **Widget Settings** (Phase 8) — dashboard tuỳ chỉnh widget.
- 📊 **Thống kê tương quan focus × task** (Phase 9) — phân tích quan hệ giữa phiên tập trung và hoàn thành task.

### Sau Phase 9 — ổn định & bảo trì

- ♿ **A11y hardening** (P2.3) — audit harness, khôi phục focus cho task drawer.
- 📱 **Mobile QA suite** — real-device QA + sửa lỗi touch/menu phát hiện được.
- 🔁 **Module extractions từ `app.js`** (#28–#40): focus.js, pomo.js, … — xem [`appjs-responsibility-map.md`](appjs-responsibility-map.md).

---

## Personal Growth & Reflection — P1: Daily Reflection

- ✍️ **Daily Reflection** (P1) — module `js/reflection.js`, lưu `planner-reflections-daily` (key `YYYY-MM-DD`).
- ⚡ **Quick Reflection** — mood 5 mức (radiogroup, reuse `MOODS` + mirror sang `planner-mood` để heatmap nhất quán) + 2 ô ngắn (điều tốt / điều muốn cải thiện) + nút Lưu.
- 🧠 **Deep Reflection** — modal 4 câu hỏi (vui / chưa tốt / tiếp tục phát huy / cải thiện) + ô "điều quan trọng nhất ngày mai", autosave debounce 500ms.
- 📊 **Daily summary strip** (Phase 11) — trước form reflection: tasks `x/y`, habits `x/y`, Focus thời gian, % mục tiêu tháng.
- 📜 **Reflection history** (Phase 21) — nhóm theo tháng, click mở lại entry để xem/sửa.
- 🔌 **Sync/export tự động** — key `planner-*` mới đồng bộ + nằm trong JSON export/backup như mọi key khác, không cần đổi backend (whole-key JSONB).
- 🧪 Kiểm chứng: unit 307/0 (15 test mới `phase11-reflection.test.mjs`), E2E Chromium đầy đủ + scenario `reflection` (3 viewport) + Firefox/WebKit OK, a11y 62/0, mobile QA 262 checks, Lighthouse không hồi quy.

## Personal Growth & Reflection — P2: Monthly Life Pillars + Monthly Focus

- 🗂 **Trụ cột tháng** (P2) — module `js/pillars.js` (window.TaskFlowPillars), dữ liệu `state.pillars = [{ id, name, icon, hidden, focus }]` additive trong month state.
- 🏗 **Template 3 trụ cột mặc định** — Cơ thể / Việc chính / Tương tác (i18n vi/en), migration additive qua `ensurePillars` ở `loadState`/`loadMonthStateOrCreate`/`save()` + `defaultState`/`emptyState`; dữ liệu tháng cũ giữ nguyên, id ổn định `p1/p2/p3` (an toàn cho sync/carry-over).
- ✏️ **CRUD trụ cột** — đổi tên, đổi icon (grid 16 emoji, radiogroup), ẩn/hiện (giữ dữ liệu), thêm trụ cột riêng, xoá (confirm), reset về template mặc định (confirm); modal `pillarEditModal` qua `TaskFlowUI.openDialog`.
- 🎯 **Monthly Focus** — mỗi trụ cột 1 ô focus, autosave debounce `saveSoon()` qua input listener (pattern reflection); hiển thị trong goals widget (Overview tháng) phía trên mục tiêu tháng cũ — legacy `monthlyGoals` giữ nguyên song song theo quyết định P0.
- 🧪 Kiểm chứng: unit 327/0 (20 test mới `phase12-pillars.test.mjs`), E2E Chromium đầy đủ + scenario `pillars` (13 scenario × 5 viewport) + Firefox/WebKit OK, a11y 62/0, CSS verifier 0 diffs, mobile QA 262 checks, Lighthouse không hồi quy (app-mobile 76–77, nhiễu).

## Personal Growth & Reflection — P3: Monthly Metrics

- 📊 **Monthly Metric model** — mở rộng `js/pillars.js`: `state.pillars[].metrics = [{ id, title, type: HABIT|MANUAL|CUSTOM, linkedHabitId, target: { mode: daily|perWeek|perMonth|custom, value }, days: [bool × ngày tháng] }]`.
- 🔗 **Metric ↔ Habit** — `type: HABIT` + `linkedHabitId`: progress đếm ngày habit đã tick trong tháng (skipDays không tính), habit bị xoá → fallback MANUAL (dữ liệu metric không mất).
- 📆 **Target theo day-count thật** — daily → số ngày tháng (28/29/30/31, không hard-code 30); perWeek → ceil(value × ngày/7); perMonth/custom → value.
- ⏱ **MANUAL/CUSTOM** — ô ngày tự đánh dấu (day-strip), toggle qua dispatcher, re-render chỉ dòng (giữ scroll).
- 🧪 Kiểm chứng: unit 349/0 (22 test mới `phase13-metrics.test.mjs`: target modes 28/30/31/leap, HABIT link, habit bị xoá, MANUAL toggle, migration), E2E Chromium đầy đủ + scenario `metrics` + Firefox/WebKit OK, a11y 62/0, CSS verifier 0 diffs, minify 59 file, Lighthouse không hồi quy (app-mobile 76 — đợt đo 70/73 là nhiễu máy, lặp lại 3 run xác nhận).

## Personal Growth & Reflection — P4: Task + Focus Metric Integration

- ✅ **TASK metric** — một metric tổng hợp số task đã hoàn thành từ nhiều task được liên kết; task không liên kết không làm thay đổi tiến độ.
- ⏱ **FOCUS metric** — cộng tổng số phút trong `focusLog` của riêng các task liên kết, giới hạn đúng tháng đang xem; thời gian từ task không liên kết bị loại khỏi phép tính.
- 🔗 **Liên kết nhiều metric** — mỗi task lịch tháng có `linkedMetricIds: string[]`; Task Detail cung cấp nhóm checkbox truy cập được, cho phép một task liên kết đồng thời nhiều metric TASK/FOCUS.
- 🧭 **Quy tắc vòng đời** — di chuyển trong cùng tháng giữ liên kết; duplicate, recurrence và carry-over chủ động xoá liên kết để tránh cộng nhầm vào metric tháng nguồn.
- 🧪 **Kiểm chứng** — unit 372/0, sync 7/7, E2E Chromium đầy đủ 15 scenario × 5 viewport và scenario P4 chuyên biệt desktop/mobile, mobile QA 262/262, a11y 62/62, CSS verifier 0 diffs, minify 59/59 file.

## Personal Growth & Reflection — P5: Daily Alignment

- 🧭 **Daily Alignment trong Today** — một thẻ gọn theo từng trụ cột, đặt phía trên lịch hôm nay để chỉ ra các hành động cần làm ngay.
- 🔗 **Dữ liệu dẫn xuất, không tạo bản sao** — metric HABIT hiển thị habit được liên kết nếu hôm nay không bị bỏ qua; metric TASK/FOCUS chỉ hiển thị các task hôm nay được liên kết trực tiếp với metric đó; MANUAL/CUSTOM không tạo hành động.
- ♻️ **Khử trùng lặp đúng phạm vi** — cùng một task chỉ xuất hiện một lần trong một trụ cột, nhưng vẫn có thể xuất hiện ở nhiều trụ cột khi được liên kết hợp lệ; trạng thái hoàn thành tiếp tục dùng chính task/habit gốc.
- 📱 **Responsive + accessibility** — bố cục xếp dọc trên mobile, giữ nguyên các action hiện có và bổ sung test id ổn định cho kiểm thử trình duyệt.
- 🧪 **Kiểm chứng** — unit 382/382, sync 7/7, E2E Chromium đầy đủ 16 scenario × 5 viewport và scenario P5 chuyên biệt desktop/mobile, mobile QA 262/262, a11y 62/62, CSS verifier 0 diffs, minify 60/60 file.

## Personal Growth & Reflection — P6: Weekly Review

- 📊 **Tổng kết tuần tự động** — Week view hiển thị số task hoàn thành, tỷ lệ habit và tổng thời gian Focus theo đúng các ngày thuộc tuần đang xem.
- 🎯 **Điểm tiến độ theo trụ cột** — mỗi trụ cột tổng hợp các metric có thể chấm điểm; TASK và FOCUS chỉ tính các task được liên kết trực tiếp với metric tương ứng.
- ✍️ **Đánh giá có cấu trúc** — lưu riêng theo tuần các mục điều tốt nhất, trở ngại, bài học, thay đổi và ba ưu tiên tuần tới; autosave có trạng thái thông báo truy cập được.
- 🧳 **Tương thích dữ liệu cũ** — `state.weeklyReviews` được migration cộng thêm, không thay thế `state.reflections.weeks`; nội dung phản ánh cũ vẫn xem được trong phần thu gọn.
- 🌐 **Song ngữ + responsive** — đầy đủ tiếng Việt/Anh, giao diện một cột trên mobile, không gây tràn ngang và hoạt động offline qua service worker cache `v189`.
- 🧪 **Kiểm chứng** — unit 408/408, sync 7/7, server security PASS, E2E Chromium đầy đủ 17 scenario × 5 viewport và scenario Weekly Review chuyên biệt desktop/mobile, smoke PASS, mobile QA 262/262, a11y 62/62, CSS verifier 0 diffs, minify 61/61 file.

## Personal Growth & Reflection — P7: Monthly Review

- 📊 **Tổng kết tháng từ dữ liệu thật** — điểm tổng thể và tiến độ từng trụ cột dùng trực tiếp metric tháng; TASK/FOCUS chỉ tính task liên kết đúng metric, metric lỗi thời hoặc không chấm được bị loại khỏi insight.
- 🏆 **Strongest / Needs attention** — chọn metric cao nhất và thấp nhất theo thứ tự ổn định, không tạo nhận xét khi không có dữ liệu đủ điều kiện.
- ✍️ **Continue / Stop / Start** — năm trường reflection tháng autosave trong `state.monthlyReview`; tháng trống vẫn viết được và có trạng thái lưu truy cập được.
- 🧳 **Tương thích reflection cũ** — `state.reflections.overview` không bị chuyển nghĩa hoặc xoá; câu trả lời cũ hiển thị trong disclosure riêng.
- 🧪 **Kiểm chứng checkpoint P7** — unit 424/424, sync 7/7, E2E Monthly Review desktop/mobile PASS, CSS verifier 0 diffs, minify 62/62 file.
