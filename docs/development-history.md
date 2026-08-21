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

## Personal Growth & Reflection — P8: Next Month Carry-over

- 🧭 **Chọn rõ trước khi chuyển** — launcher ở cuối Monthly Review mở dialog bắt đầu với mọi mục chưa chọn; người dùng chọn độc lập trụ cột, Monthly Focus, habit và từng metric rồi xem trước chính xác nội dung sẽ tạo hoặc bỏ qua.
- 🔗 **Liên kết an toàn** — HABIT metric bắt buộc habit nguồn được chọn hoặc đã tồn tại ở tháng đích; ID mới chống va chạm và `linkedHabitId` được remap sang habit đích.
- 🧼 **Khởi đầu sạch** — chỉ cấu trúc đã chọn được sao chép; task, goal, tiến độ ngày, skip day, reminder đang bật, focus log, weekly/monthly review đều không đi theo.
- 🛡️ **Không ghi đè** — habit/trụ cột tương đương ở tháng đích được giữ nguyên; lỗi quota không điều hướng và không thay đổi dữ liệu đích.
- 🌐 **Production-ready** — song ngữ Việt/Anh, dialog rộng trên desktop và một cột trên mobile, asset offline cache `v191` và scenario E2E riêng trong ma trận release.
- 🧪 **Kiểm chứng checkpoint P8** — hồi quy P4–P8 93/93, sync 7/7, E2E carry-over desktop/mobile PASS, minify 63/63 file; kiểm tra trực quan light/dark và mobile không tràn ngang.

## Personal Growth & Reflection — P9: Reports Integration

- ⚖️ **Monthly Balance** — Report tái sử dụng đúng điểm Monthly Review làm nguồn duy nhất, hiển thị progressbar truy cập được cho từng trụ cột và strongest/needs-attention từ metric thật.
- 📏 **Gợi ý theo quy tắc** — chỉ phát thông điệp trung tính khi metric dưới 40% hoặc trên 80%; hai biên 40/80 không phát gợi ý, không gọi AI và không suy diễn sức khỏe, ý định hay nguyên nhân.
- 🗂️ **Lịch sử reflection hợp nhất** — Daily, Weekly và Monthly Review từ mọi tháng được chuẩn hóa, sắp mới nhất trước và lọc bằng ba tab; mở bản ghi sẽ chuyển về đúng bề mặt có thể xem/sửa của loại đó.
- 🙂 **Mood trend trung thực** — ưu tiên mood trong Daily Reflection, fallback dữ liệu mood cũ, chỉ hiển thị phân bố và hướng khi có ít nhất ba ngày hợp lệ.
- 🌐 **Report production** — layout hai cột desktop/một cột mobile, dark mode, modal lịch sử có focus semantics, asset mới được precache offline trong service worker `v192`.
- 🧪 **Kiểm chứng checkpoint P9** — unit P7–P9 89/89 và frontend 134/134; E2E Report Growth desktop/mobile PASS với balance 60%, ngưỡng 30/90, ba filter, mở Daily detail, dark mode và không tràn ngang.

## Personal Growth & Reflection — P10: Data Lifecycle

- 🧬 **Schema v2 có migration an toàn** — month state được thêm `schemaVersion: 2` khi đọc/ghi; snapshot v1 và state chưa version được nâng cấp thuần, idempotent, giữ nguyên ID, `linkedMetricIds`, focus log, reflection và mọi trường tương lai chưa biết.
- 📦 **Export/import đầy đủ** — JSON export mang `version: 2` và gom dữ liệu planner có thể di chuyển cùng legacy key đúng một lần; token, metadata sync và các slot backup nội bộ bị loại bỏ. Import xác thực, hiển thị số key/version trước khi xác nhận, lưu backup hiện tại trước khi ghi và rollback toàn bộ key đã chạm nếu storage lỗi.
- 🚫 **Từ chối dữ liệu không an toàn** — snapshot sai app/key/value, JSON hỏng hoặc version tương lai đều không được ghi và không reload; giao diện trả thông báo Việt/Anh riêng cho backup từ phiên bản mới hơn.
- ☁️ **Hợp đồng sync được siết chặt** — backend chỉ nhận key `/^planner-[A-Za-z0-9._-]{1,120}$/`, giới hạn JSON 512 KiB với lỗi 400/413 rõ ràng, giữ nguyên JSONB và per-key last-write-wins; state v2 push/pull không mất trường tương lai.
- 🔐 **Minh bạch quyền riêng tư** — UI nêu rõ sync là tùy chọn, server không mã hóa đầu-cuối, last-write-wins có thể thay thế chỉnh sửa đồng thời cũ hơn và reflection không được gửi tới analytics, AI hay bên thứ ba.
- 🧪 **Kiểm chứng hoàn tất P7–P10** — unit 466/466, sync 8/8, server security 5/5, focused Data Lifecycle E2E desktop/mobile PASS, Chromium release 21 scenario × 5 viewport PASS, smoke PASS, mobile QA 262/262, accessibility 62/62, DOM audit PASS, critical CSS 0 diff và minify 66/66 file.
## Visual Theme Refinement — P1: Token palette (Zen Linen × Amber Hearth × Sage Mist)

- 🎨 **New semantic token palette** (css/tokens.css only, no component CSS yet): 60% Zen Linen warm paper surfaces + 25% Amber Hearth burnt-orange actions + 15% Sage Mist growth/success.
- 🧩 **New tokens:** `--color-on-accent` (dark mode: dark-brown text on amber 6.14:1 — fixes the old 2.77:1 white-on-amber dark button failure at the token layer), `--color-accent-hover`, `--color-positive-soft`, `--shadow-sm`; shadows softened to low-contrast linen system.
- 🎭 **4 themes re-tinted to the same design language** (accent stays TaskFlow orange for brand consistency): cream = Zen Linen, mint = sage, lavender = quiet reflection, peach = amber warm; dark mode = warm browns, never pure black.
- 🔤 Contrast-verified every theme × dark: muted/secondary ≥4.5, control/focus ≥3.0, on-accent ≥3.0 — 0 fails across all 8 combos (hardening tests + fresh computation).
- 📄 tokens.css minified (6.6KB → 4.2KB), app.html tokens.min.css?v=8, sw.js CACHE v187.
- 🧪 Kiểm chứng: unit 349/0 (version asserts updated), a11y 62/0, CSS verifier 6 view × 6 combo 0 diffs, minify --check 59 file OK, E2E overview + dialogs OK, preview visual QA light/dark × cream/mint/lavender/peach all render correct.
- ⏭ **P1 scope note:** legacy kawaii palette in styles.css `:root` (--ink 315×, --card-bg, --accent-btn #C24E28...) still shadows token changes in legacy views — aliasing to semantic tokens is the first step of P2.

## Visual Theme Refinement — P2: Legacy alias + buttons/inputs/cards (Amber Hearth)

- 🔗 **Alias legacy kawaii palette → semantic tokens** (css/styles.css `:root` + dark base + 3 dark variants): `--ink → var(--color-text)`, `--ink-rgb` = rgb của text mới (51,47,42 light / 243,236,227 dark), `--card-bg → var(--color-surface)`, `--bg-main → var(--color-canvas)`, `--accent-deep/--accent-btn/--terracotta → var(--color-accent)`, `--peach-bar → var(--color-accent-soft)`, `--surface*/--panel-* → surface-muted`. Derived rgba vars (bg-grid/ink-soft/card-border) giữ formula → tự theo ink-rgb. Decorative day-header/brick/tag giữ literal (identity). `--ink-solid` giữ literal dark (#4A403A) vì là fill đằng sau glyph trắng.
- 🟠 **Buttons (Amber Hearth):** primary CTA + skip-link + toast-action + tag-chip + cal-focus + habit-add chuyển `#fff/#fffdf9 → var(--color-on-accent)`; hover `#994329/#9c3d24/#b3482a → var(--color-accent-hover)`; dark override block app-shell token-driven. **Dark button giờ là chữ nâu đậm #2A1C12 trên amber #E08763 = 6.14:1** (fix lỗi cũ white-on-amber 2.77:1).
- 📝 **Inputs:** focus = accent border + soft accent ring (color-mix 16%) — Amber Hearth focus, keyboard ring vẫn do rule toàn cục.
- 🔢 Version bumps: components v7, app-shell v18, styles-critical/deferred v6, sw CACHE v188; re-split + re-minify + verify.
- 🧪 Kiểm chứng: unit 349/0, CSS verifier 6 view × 6 combo **0 diffs**, E2E Chromium đầy đủ RELEASE OK, FF + WebKit (reflection/pillars/metrics) OK, a11y 62/0, mobile QA 262/0, minify --check 59 file, preview visual QA light/dark — progress bar hbar giờ là gradient accent #A84F2E, legacy vars resolve đúng (--ink #332f2a, --card-bg #fffdf8).

## Visual Theme Refinement — P3: Sidebar + topbar (Zen Linen shell)

- 🧰 **Topbar de-glass:** bỏ `backdrop-filter: blur(14px)` + nền glass → giấy warm `color-mix(canvas 94%, surface)`, border dưới mảnh hơn `color-mix(border 70%, transparent)` — hết cảm giác "toolbar kỹ thuật". Mobile nav giữ blur(16px) (bottom sheet cần phân lớp nội dung cuộn qua).
- 🎨 **Sidebar:** active nav đã có soft accent bg + orange icon (từ a11y P2.3) — giữ nguyên; hover warm muted surface, inactive neutral không border, collapsed giữ behavior.
- 🟠 **Add button:** `.app-primary-action.button-primary` đã orange (P2); dark mobile FAB giữ `#b3482a` + white + (5.42:1) — có chủ đích (glyph trắng trên nền terracotta đậm).
- 🔢 Version bumps: app-shell v19, sw CACHE v189; re-minify.
- 🧪 Kiểm chứng: unit 349/0, CSS verifier 0 diffs, a11y 62/0, E2E overview + dialogs OK, preview computed-style xác nhận topbar backdrop none + nền warm, active nav accent-soft + accent text, dark FAB đúng.

## Visual Theme Refinement — P4: Today + task surfaces

- 🃏 **Today card = surface cream ấm** (`--color-surface` thay vì `--color-surface-elevated` trắng tinh) + border warm `--color-border` + shadow-panel nhẹ — Zen Linen.
- ✅ **Completed task/habit = sage status** (Sage Mist): `.today-task.done .task-text` và `.today-habit.done .today-habit-name` chuyển `--color-text-muted` → `--color-positive` (light `#55735D`, dark `#89AE91`) + giữ line-through — hoàn thành giờ đọc là "growth" không chỉ "mờ đi".
- 🟠 **Progress:** `.today-progress-fill` giữ accent orange (primary task context = orange per Amber Hearth); sage dành cho completed status.
- 👋 Greeting đã accent nhẹ từ trước (`--color-accent`) — giữ.
- 🔢 Version bumps: styles-critical/deferred v7, sw CACHE v190; re-split + re-minify + verify.
- 🧪 Kiểm chứng: unit 349/0, CSS verifier 0 diffs, a11y 62/0, E2E overview + dialogs OK, mobile QA 262/0, minify --check 59 file, preview: toggle task → done text sage `#55735D` light / `#89AE91` dark + card surface cream.

## Visual P5 — Reflection / Monthly Goals / Habits polish (Zen Linen × Amber Hearth × Sage Mist)

- 📖 **Reflection journal-like**: `.reflect-quick` layout thoáng (flex column, gap), `.reflect-textarea` nền `--color-surface-muted` + border warm `--color-border` + radius-input — không còn cảm giác admin form; mood row radiogroup giữ.
- 🎨 **Pillar semantic colors** (qua `data-pillar-id` — không đổi logic): p1 Cơ thể → sage (`border-inline-start: var(--color-positive)` + metric bar sage), p2 Việc chính → TaskFlow orange (default), p3 Tương tác → muted info blue. Pillar user thêm (p4+) giữ accent. Dùng border + metric bar, không dùng 3 nền mạnh.
- 🌿 **Habits sage heatmap**: thang `hm-l1..l5` chuyển orange → sage (light `#e4ede6 → #55735d`; dark `rgba(137,174,145,.18) → #89ae91`) — cập nhật cả 3 chỗ (light, dark override, `@media print`); `hm-mini-cell.on` + `hm-streak-badge` theo sage/amber. Không bright green.
- 🔢 Version bumps: styles v8, sw CACHE v191; re-split + re-minify + verify.
- 🧪 Kiểm chứng: unit 349/0, CSS verifier 0 diffs, a11y 62/0, E2E Chromium full matrix RELEASE OK, mobile QA 262/0, minify --check 59 file, preview: pillar border p1 sage `#55735D`/dark `#89AE91` · p2 orange · p3 info blue, heatmap ribbon dark = 5 mức sage, reflection journal render, 0 console errors.

## Visual P6 — Landing page polish (Zen Linen × Amber Hearth)

- 🟠 **CTA burnt orange**: `--landing-action-bg` `#a9472d` → **`#a84f2e`** (khớp `--color-accent` light — hết 2 màu orange), hover `#913a25` → **`#913f24`** (`--color-accent-hover`). White text 5.49:1 ✓ (test bắt buộc hex + ≥4.5 giữ nguyên).
- 🖼 **Screenshot frame**: `.product-preview` shadow nặng `0 28px 72px / .18` → **`--shadow-floating`** (linen nhẹ `0 8px 24px / .07 + 0 18px 48px / .12`); dark override giảm `.42 → .35`. Border warm `--color-border` giữ.
- 🃏 **Feature cards**: gap `16 → 20px`, padding `28 → 30px`, thêm `--shadow-sm` nhẹ — "less shadow, more spacing" đúng brief; border warm giữ.
- 🧱 **Footer**: đã neutral (`--color-sidebar` + border-top) — giữ. CTA band cuối `#403934` warm dark giữ (không phải accent).
- 🔢 Version bumps: landing.css v9 → v10, sw CACHE v191 → v192; re-minify landing.min.css.
- 🧪 Kiểm chứng: unit 349/0 (test landing action hex+contrast vẫn pass), E2E overview OK, a11y 62/0, minify --check 59 file, preview: light — canvas linen `#F4F0E8`, CTA `#A84F2E`+white, footer `#FAF7F1`; dark — CTA giữ `#A84F2E`+white 5.49 ✓, preview shadow dark.

## Visual P7 — Dark mode QA toàn diện (4 theme × dark, component-level)

- 🎯 **Audit mới `scripts/audit-dark-contrast.py`**: đo computed styles THẬT (không phải token) cho từng component đã polish ở P2-P6, trên cả 4 theme (cream/mint/lavender/peach) × dark, so WCAG AA (text 4.5:1, non-text 3:1). App: primary btn, reflect-input ×2, today-card title, mood btn on, muted text, done task sage, pillar border p1/p2/p3 + focus input + name, heatmap l1/l5 vs card. Landing: primary, skip, feature-accent, cta-final text + eyebrow, hero lead, footer.
- ✅ **Kết quả: ALL PASS (0 dưới AA)** — nổi bật: primary btn dark amber `#E08763` + nâu `#2A1C12` = **6.14:1** · pillar border sage/orange/blue 5.58–6.10:1 (≥3) · heatmap sage 8.53:1 · done task sage 8.53:1 · landing primary 5.49:1 · cta-final 11.33:1 · eyebrow 5.82:1 · hero lead 7.60:1. Không cần sửa CSS nào ở P7.
- 🔍 **Phương pháp**: seed mood + done task qua click (state fresh không có `.on`/`.done` → đã xử lý bằng cách click thật rồi đo); heatmap so với nền `.habit-heat-card`; pillar/heatmap đo ở view overview (không phải today).
- 📸 Screenshots dark 4 theme (today + overview) → `docs/qa/dark-{theme}-*.png`.
- 🧪 Kiểm chứng: unit 349/0, a11y 62/0, CSS verifier 0 diffs, E2E overview OK, minify --check 59 file, preview theme-switch dark resolve đúng 4 canvas, 0 console errors.

## Visual P8 — Mobile QA toàn diện (360x800 / 390x844 / 412x915)

- 📱 **Mở rộng `scripts/e2e-mobile-qa.py` thêm 14 check reflection/viewport**: quick card renders, 5 mood radios, quickGood/quickImprove present + font-size ≥16px (iOS zoom), mood select highlights (click → `.on`), quick save persists entry (verify localStorage `planner-reflections-daily`), deep modal opens + 4 textareas + fits viewport + closes, history opens + lists saved entry + closes, overflow checks. Bottom nav/More sheet/Quick Add/Task Drawer đã cover sẵn từ trước.
- ✅ **MOBILE QA: 318 checks / 0 FAIL** (tăng từ 262 → 318) trên chromium — 3 viewport 360x800/390x844/412x915 + tablet 768x1024; **0 pageerrors**.
- 🎨 Palette Zen Linen mới không gây regression: không overflow, touch target ≥44px, input ≥16px trên mọi viewport.
- 🌐 **FF/WebKit**: reflection block verify riêng (quick card 5 moods + deep modal 4 textareas + history opens) — **OK cả 2 browser**. Lưu ý: full mobile-qa suite chỉ chạy touch emulation cho chromium (`touch = browser_name == "chromium"`) — FF/WebKit fail ở SEARCH section là quirk pre-existing của harness (element intercept pointer events), không phải do reflection hay palette.
- 🧪 Kiểm chứng: unit 349/0, a11y 62/0 (More Sheet mobile: dialog semantics, focus, tab trap, names), E2E Chromium full matrix RELEASE OK, mobile QA 318/0.

## Visual Theme Refinement — FINAL VERIFICATION (sau P8)

- ✅ Toàn bộ 9 phase (P0 audit → P8 mobile QA) hoàn thành; final battery trên trạng thái sạch:
  - Unit **349/0** · E2E Chromium full matrix **RELEASE OK** · a11y **62/0** · mobile QA **318/0** · minify **59 file** · CSS verifier **0 diffs** · dark contrast audit **ALL PASS** (4 theme × dark, component-level).
- 🚀 **Lighthouse final**: landing-desktop **99** (FCP ~576ms LCP, CLS .067, TBT 0) · landing-mobile **98** · app-desktop **97** · app-mobile **77** (LCP 6249ms, CLS 0, TBT 45ms) — **bằng/trên baseline**, không regression performance từ theme work (theme là CSS variables thuần, không thêm asset/network).
- 🎨 Kết quả Visual Theme Refinement: Zen Linen canvas/surface/shadow, Amber Hearth CTA/active (dark amber + nâu 6.14:1), Sage Mist habits/positive/heatmap, dark 4 theme warm không pure black, contrast component-level AA verified.

## 🚀 Lighthouse BEFORE vs AFTER (final, 2026-08-11 13:44)

Chạy lại `measure-lighthouse.py --runs 3` trên state sạch; so với baseline gốc (commit `36bb1b6`, 2026-08-09).

| Page | Device | Perf | FCP | LCP | TBT | SI | CLS |
|---|---|---|---|---|---|---|---|
| Landing | Desktop | 99→99 | 648→**564** | 648→**564** | 0→0 | 648→**564** | .068→.067 |
| Landing | Mobile | 88→**98** | 3060→**1684** | 3060→**1684** | 0→0 | 3060→**1684** | 0→.067* |
| App | Desktop | 97→97 | 731→**527** | 1227→1303* | 0→0 | 908→**562** | .001→.002 |
| App | Mobile | 68→**77** | 3486→**1808** | 5795→6272* | 172→**29** | 3852→**1808** | 0→0 |

Ghi chú trung thực: app-mobile LCP dao động 5.5–6.3s là nhiễu emulation (mọi baseline post-split đều trong band đó) — FCP/TBT/SI giữ gains, perf score 68→77. Landing-mobile CLS 0 ban đầu là sample may; các run sau đều ~.067. Bảng đầy đủ: `docs/lighthouse/COMPARISON.md` (giữ được qua các lần chạy script vì BASELINE.md bị overwrite mỗi run).

## 🧪 Fix harness quirk: touch emulation trên Firefox/WebKit (mobile QA)

`e2e-mobile-qa.py` trước đây chỉ bật `has_touch` cho chromium (`touch = browser_name == "chromium"`), nên FF/WebKit không khớp media query `pointer: coarse` → row actions giữ `pointer-events:none`, click bị intercept (fail ở SEARCH section).

Fix: `has_touch=True` cho mọi engine (Playwright hỗ trợ đủ 3), chỉ giữ `is_mobile` riêng cho chromium (Chromium-only trong Playwright). Kết quả: **cả 3 browser đều 0 FAIL / 318 checks** (trước: chromium 318/0, FF/WebKit fail ở SEARCH).

## 🎨 Icon system (phase 1): mở rộng sprite +18 symbol

Thêm 18 symbol mới vào `icons/ui-sprite.svg` (Lucide-style geometry, đúng chuẩn hiện tại: 24×24, `stroke-width=1.8`, `fill=none`, `stroke=currentColor`, round caps/joins): sun, heart-pulse, users, target, sprout, clock, flag, notebook-pen, list-checks, check, sparkles, cloud-rain, wrench, sunrise, calendar-check, refresh, circle-stop, play. Sprite: 30 → **46 symbols**.

Pure-additive (không đụng 30 symbol cũ, không đổi consumer nào). Verify: XML parse OK · mọi symbol stroke nhất quán · sprite phục vụ đủ 46 qua HTTP + fetch in-page (lưu ý: `getBBox` trên `<use>` trỏ sprite ngoài là false-negative — dùng fetch-check thay thế). CACHE bump `v192 → v193` (test assert cập nhật) để PWA cài sẵn re-precache sprite. Unit **349/0**, minify 59 file OK. Screenshot: `docs/qa/icons-new.png`.

## 🎨 Icon system (phase 2): Today nav → sun + close buttons → sprite `close`

**Today nav:** `js/app.js` `{ view: 'today', icon: 'calendar' }` → `'sun'` — hết tình trạng 1 icon calendar dùng cho 3 nghĩa (Today nav, Calendar view, task deadline meta). Desktop sidebar + mobile nav + more sheet đều tự theo (cùng items array).

**Close buttons ✕ → sprite `close`:** thay toàn bộ text glyph ✕ (29 chỗ `>✕<` + remind-ui programmatic + tag-clear + widget-toggle ✓/✕ + task-menu menuitem = 33 glyph):
- app.html: 19 nút modal static thêm `data-shell-icon="close"` (hydrate bởi `renderShellIcons()` lúc boot — đúng pattern sẵn có)
- JS templates (app.js delgoal ×6, td-tag-del, td-subtask-del, tag-clear; today.js deltask ×2; inbox.js; remind-ui ×2): `${window.TaskFlowUI.icon('close')}` inline
- widget-toggle ✓/✕ → sprite `check`/`close` (trạng thái hiển thị widget)

**CSS sizing** (styles.css): `.sync-close/.task-drawer-close .ui-icon` 15px · `.btn-del/.td-tag-del/.td-subtask-del` 12px · `.mini-btn` 13px · `.tag-chip` 11px · `.widget-toggle` 16px — icon nhỏ không phình.

### Kiểm chứng
| Check | Kết quả |
|---|---|
| Unit tests | **349/0** (app.min.js v=162 + CACHE v194 assert update) |
| CSS verifier | **0 diffs** |
| E2E Chromium full matrix | **E2E RELEASE OK** |
| a11y | **62/0** |
| mobile QA | **318/0** |
| minify | 59 file OK |
| Preview real-app | today nav `#sun` ✓ · tools-close `#close` ✓ · quickadd-close `#close`, không còn ✕ text ✓ · **49 shell icons hydrated** |

**1 QA note:** lần đo đầu báo tools-close NO-ICON là bug của script check — `[data-action="tools-close"]` match backdrop div trước (DOM order), không phải nút. Dùng `button[data-action=...]` thì đúng.

## 🎨 Pillar icons: emoji → sprite (heart-pulse/target/users + palette 16)

**`js/pillars.js`** — bỏ hoàn toàn emoji trong palette pillar:
- `ICONS` → 16 sprite name: heart-pulse, target, users, home, book, sprout, moon, rocket, bolt, briefcase, palette, brain, sparkles, sunrise, sun, clock (đều đã có trong `icons/ui-sprite.svg`, stroke 1.8)
- `EMOJI_TO_ICON` migration map (16 emoji cũ → sprite tương đương, ví dụ 💪→heart-pulse, 🏃→bolt, 🥗→sprout); `migrateIcon()` giữ nguyên icon custom/lạ — không mất dữ liệu
- `normalizePillar` migrate icon lúc load (idempotent, additive — dữ liệu cloud cũ vẫn đọc được, lần save sau persist tên sprite)
- Render qua `iconHTML()` → `TaskFlowUI.icon(name)` (sprite) với fallback text cho icon custom/môi trường Node

**`css/styles.css`** — `.pillar-icon .ui-icon` + `.pillar-icon-opt .ui-icon` = 20px (khớp `--text-lg` trước đây).

**Tests/E2E:** phase12: 22 test (thêm migrateIcon + normalizePillar migrate, ICONS phải tồn tại trong sprite); E2E pillars: click `bolt`/`book`, assert `use[href*="bolt"]`.

**Verify (browser thật):** seed dữ liệu cũ 💪🎯🤝 → reload → render `#heart-pulse/#target/#users`, localStorage migrate `['heart-pulse','target','users']`, 0 ô emoji còn lại; edit modal 16 ô sprite, selected = heart-pulse. Screenshot `docs/qa/pillars-sprite.png`.

**Gates:** unit 351/0 · E2E RELEASE OK · a11y 62/0 · mobile QA 318/0 · CSS verifier 0 diffs · minify 59 file · CACHE v195 · pillars.min.js v2, styles v10.

Lưu ý: mini-btn action trong pillars block (✏️🙈🗑↺) vẫn là emoji — thuộc phase "task/action icons" riêng, chưa đụng.

## 🚀 P0.4 — App mobile LCP: static Today header (LCP element paint từ FCP)

**Root cause (đo, không đoán):** LCP element của /app mobile = `h1.today-date` (xác nhận bởi `lcp-breakdown-insight` Lighthouse 13.4). Element chỉ do `renderToday()` (cuối chuỗi 43 script đồng bộ) sinh ra → paint ở ~6.3s. Chuỗi eval ~3.4s (app.min.js 183KB chiếm ~3.1s) — network KHÔNG phải bottleneck (43 script tải song song trong ~500ms).

**Fix (PA2 — static header, renderToday KHÔNG đổi):**
- `app.html`: thêm `header.today-header` (greeting + `h1.today-date`) static trong `#view-today`, inline script ghi ngày/lời chào thật lúc parse (trước first paint, i18n VI/EN khớp `dateLocale()` = vi-VN/en-GB). `font-size: 33px` transient (bị thay ở boot) để kích thước vẽ static > boot render kể cả khi chưa có Nunito → boot render không tạo LCP entry mới (verify bằng experiment: Chrome KHÔNG dispatch entry khi size không tăng).
- `scripts/split-critical-css.py`: thêm `BOOT_CRITICAL` (`.today-skeleton` ×3) — splitter dùng `used-css.json` đo SAU boot nên không bao giờ thấy skeleton (chỉ tồn tại pre-boot) → rule grid/gap rơi vào deferred → bars tách nhau lúc deferred nạp (~2.5s slow network) = CLS latent. Fix: skeleton vào critical. **Đây là bug CLS thật (0.0 → 0.027 dưới real throttling), không chỉ là hiệu ứng phụ.**
- `sw.js` CACHE v195→v197, versions styles-critical/deferred v10→v11.

**Kết quả (median 3 runs):**

| Phương pháp | BEFORE | AFTER | Δ |
|---|---|---|---|
| Playwright devtools-throttle (cùng harness) | LCP ~5396/5300/6584 | **1944/1964/1948** | **−64%** |
| Lighthouse devtools (throttling thật) | — | **2202ms** · CLS **0.0** · perf **79** | LCP ~3.1–6.3s → 2.2s |
| Lighthouse Lantern (script mặc định) | 6301 / perf 77 / CLS 0.0 / TBT 29 | 6329 / perf 76 / CLS 0.0 / TBT 26 | **không đổi — model artifact** |

**Lantern caveat (trung thực):** script `measure-lighthouse.py` dùng default `throttlingMethod=simulate` (Lantern). Lantern gắn LCP của JS-heavy page vào dependency graph / load event (~6s — 43 scripts đồng bộ), không credit static-shell LCP: chứng cứ — cùng code, `--throttling-method=provided` (không throttle): LCP thật = **308ms**; `--throttling-method=devtools`: **2202ms**; chỉ Lantern báo 6329. Số Lantern chỉ dịch chuyển khi giảm được load event = defer set (PA1), chưa làm ở phase này.

**Gates:** unit 351/0 · E2E Chromium RELEASE OK · a11y 62/0 · mobile QA 318/0 · CSS verifier 0 diffs · minify 59 OK.

## 🎨 P1 — Functional icon migration hoàn tất (sprite 58)

Migrate toàn bộ glyph chức năng còn lại sang ui-sprite.svg (58 symbols, stroke 1.8):

- **Sprite mới:** `trash`, `upload`, `copy`, `key` (4 symbol bổ sung)
- **i18n (VI+EN):** strip glyph khỏi 10 key — exportJson, templateDo, profileOpen, acctDeleteBtn, resetTxt, pillarsReset, metricAdd, pillarAdd, remindAdd, quickAddBtn; pomoReset → 'Reset timer'
- **app.html (static):** export-json/template-do/acct-delete/profile-open/pomo-reset/quickadd-do/share-report/share-week-report/share-year-report → `data-shell-icon` hydration; profile-h heading 👤 → `user`
- **JS templates:** delgoal/delhabit (mini-btn + btn-del) `close`→`trash`; deltask ×2 (today), inbox-del, subtask-del → `trash`; btn-add ＋ ×8 → `plus`; pillars: metricAdd/pillarAdd `＋`→`plus`, pillars-reset `↺`→`refresh`; streak-ui: share-streak `upload`, report `📊`→`report`
- **Giữ emoji personality:** mood 😞😕😐🙂😄, 🍅 pomodoro, 🔥 streak, 🎉 celebration, 👋 greeting, help content + reminder prefixes (descriptive, không phải control)
- **Còn lại (cố ý):** 🔔/🎯/✏️ mini-btn habit actions (phase action-icon riêng), widget-toggle ✓/✕ (trạng thái), chip X (tag-clear/td-tag-del)
- **QA screenshots:** docs/qa/icons-light.png, icons-dark.png
- Versions: app.min.js v164 · today v5 · inbox v4 · i18n v4 · pillars v3 · streak-ui v2 · styles v12 · CACHE v199

## 🤖 P1.2 — Giảm prominence của AI Assistant (bỏ floating FAB)

- **app.html:** xoá `.fb-fab` (🤖 floating bottom-right, desktop) — giữ `#chatFabWrap` làm anchor cho chatPop; thêm `tools-row` `data-action="chat-toggle"` (icon `help`) vào Tools drawer nhóm "Hỗ trợ và hệ thống"
- **app.js:** chat-toggle khi mở từ Tools drawer (desktop) tự đóng drawer; More sheet (mobile) giữ nguyên flow E2E-verified (toggle chat/pomo trong sheet)
- **fab.js:** bỏ nhánh chat trong `initFabDrags` + `FAB_POS_KEYS.chat` — pomo FAB giữ nguyên
- **CSS dead code:** xoá `.fb-fab` (base/hover/focus), `.fb-fab-pop` (unused), `.fb-fab.fab-dragging`, `.fb-fab-wrap.fab-tucked`; `.chat-pop` bottom `calc(100%+12px)` → `0`; app-shell print/more-sheet selectors thu gọn về `.pomo-fab`; components touch-target bỏ `.fb-fab/.chat-fab`
- **Vẫn giữ:** chat panel, i18n, lazy chat.min.js, handlers, a11y; Truy cập: Tools → Trợ lý học tập (desktop) · More → Công cụ → Trợ lý (mobile)
- **Bug liên quan (tự phát hiện):** splitter bị kill giữa chừng → dom_closure chưa chạy xong để lại split chưa đóng (`.reflection` deferred đè `.week-reflection-card` critical — cascade flip, verify 30 diffs). Chạy lại splitter tới khi hội tụ (round 1 moved 3 stmts, round 2 → 0 diffs) → verify 0 diffs
- Versions: app.min.js v165 · fab.min.js v1 · styles-critical/deferred v13 · CACHE v200

## 🔤 P1.3 — Self-host Nunito trên toàn bộ first-party pages

- **index.html, privacy.html, terms.html, data-and-security.html:** bỏ preconnect ×2 + stylesheet Google Fonts → `preload fonts/nunito-vietnamese.woff2` + `css/fonts.min.css?v=1` (cùng strategy với app.html, @font-face KHÔNG duplicate — 1 file dùng chung)
- **Verify browser thật (5 trang):** 0 request tới fonts.googleapis/gstatic · nunito-vietnamese/latin-ext/latin.woff2 nạp local · `document.fonts.check('400 16px Nunito')` = true · Vietnamese (ă â ê ô ơ ư đ á à ả ã ạ ế ề ể ễ ệ ớ ờ ở ỡ ợ ứ ừ ử ữ ự) + English render Nunito
- **Offline:** SW đã precache sẵn cả 4 trang + fonts.min.css + 5 woff2 (không cần đổi sw.js) — offline E2E pass
- **Lighthouse landing (3 runs):** Desktop 99→99 (FCP 564→405, LCP 564→425) · Mobile 98→98 (FCP 1684→1657, LCP 1684→1882, CLS 0.067 giữ nguyên, TBT 0) — không regression, không chase score
- **CSP:** fonts.googleapis.com + fonts.gstatic.com giờ **có thể bỏ** (chuyển sang phase CSP riêng — chưa đụng)

## 🎨 P2 — Small action icon polish (Aug 11, 2026)

- Added `edit` (pencil) symbol to `icons/ui-sprite.svg` (stroke 1.8) → 59 symbols.
- Migrated 6 mini-btn action buttons from emoji to sprite:
  - `remind-habit` 🔔 → `bell` · `targetedit` 🎯 → `target` · `edithabit` ✏️ → `edit` (app.js)
  - `editgoal` ✏️ → `edit` (app.js)
  - `metric-edit` / `pillar-edit` ✏️ → `edit` (pillars.js)
- **Bug fix (tự phát hiện):** pillars.js `iconHTML()` gates on the user-icon palette (`ICONS`), so action buttons `edit/trash/plus/refresh` were rendering as literal text since the P1 migration. Added dedicated `actionIcon()` (no palette gate) → verified all 14 action buttons render sprite `<use>`.
- Kept personality emoji: 🙈 pillar visibility toggle, ✓ confirm-addgoal, 🗓️ copyhabits, ✨ templates, mood/pomodoro/streak/celebration.
- Versions: app v169 → pillars v5 → **CACHE v203** · gates: unit 471/0, E2E RELEASE OK, a11y 62/0, mobile QA PASS, minify 66 OK.

## Phase 6Q — Unified AI Provider Gateway (Aug 21, 2026)

- Created `server/ai-provider.js` — single centralized LLM transport module.
- All 9 AI routes now delegate to `callAiText()` / `callAiJson()` instead of duplicating fetch + AbortController + error mapping.
- Removed legacy `@google/generative-ai` SDK dependency from `/api/ai/plan-health`.

## Phase 6Q.1 — Provider Runtime Hardening (Aug 21, 2026)

- Fixed `ReferenceError: AI_TIMEOUT_MS is not defined` in `callAiCore()` — timeout default now read dynamically from `getConfig()`.
- Removed dead duplicated constants from `server/ai.js`.
- Added 54 comprehensive mock-only tests.

## Phase 6R — AI Contract Evaluation & Adversarial Testing (Aug 21, 2026)

- Created `tests/ai-evals/` evaluation harness with ~335 deterministic tests.
- Vietnamese fixtures (13), English fixtures (8), date/time contracts (55), adversarial edge cases (50+), roadmap contracts (15).
- All tests use mocked provider outputs — no live Gemini calls in CI.

## Phase 6R.1 — Strict Calendar Validation (Aug 21, 2026)

- Fixed `server/ai.js` `validDate()` — replaced rollover-prone validation with strict round-trip calendar validation.
- Impossible dates (Feb 30, Apr 31, non-leap Feb 29) now rejected at server level.
- Added `isValidCalendarDate()` to `js/ai-roadmap.js`.

## Phase 6R.2 — AI Boundary Validation Completion (Aug 21, 2026)

- Hardened `sanitizeContext()` — all date fields use strict calendar validation.
- Created `server/ai-roadmap-validator.js` — server-side model output validation.
- Added `validateRoadmapForApply()` — final AI roadmaps require ≥1 milestone AND ≥1 task.
- 335 Phase 6R evaluation tests, 2199+ full repository tests.

## Phase 6R.3 — Final Roadmap Contract Closure (Aug 21, 2026)

- Fixed `existingTaskKey` hallucination bug — model cannot assert reuse when canonical existing work set is empty/null.
- Enforced dependency depth limit (≤4) in server roadmap validator.
- `convertToProposal()` uses structural validation; final-roadmap validation remains server-side only.
- Server validates roadmap request `targetDate` and sanitizes `existingWork` input.
- Added 17 new server-boundary tests (existingTaskKey empty set, dependency depth, empty roadmap, source/reuse validation).
- Full validation: 2551 tests pass, sync 13/13, security 5/5, release assets OK.
- Phase 6R is now CLOSED — all roadmap boundary contracts hardened.

## Phase 6S — Privacy-First Adaptive Personal Planning (Aug 21, 2026)

- Created `js/ai-adaptation.js` — deterministic, local-only behavioral learning module.
- Signals: focus session duration, task completion times, work windows, weekday patterns.
- Privacy: no task text, no reflection, no mood, no chat content, no sensitive traits.
- Retention: 90 days / 500 events (whichever first).
- Confidence model: low (3+), medium (5+), high (10+) samples.
- Explicit preferences always override adaptive hints.
- Server sanitizes `adaptiveHints` with strict allowlist.
- Pre-flight: canonicalized roadmap output, strict milestone integer order, source contract tightened.
- 62 Phase 6S tests, 2613 total repository tests, all green.

## Phase 6S.1 — Adaptive Runtime Integration (Aug 21, 2026)

- ai-adaptation.min.js loaded in production via lazy chains (app.js) and precached in sw.js.
- Real focus session events recorded in confirmOutcome() with dedupe via sessionId.
- Future timestamp hardening: rejects timestamps > now + 5 minutes.
- Account isolation: adaptation data cleared on login/signup/logout.
- adaptiveHints injected into chat-provider.js envelope for AI planning.
- Server-side adaptiveHints sanitization with strict allowlist already in place.
- sw.js CACHE bumped to v269, app.min.js to v217, sync.min.js to v6.
- All version pins in tests updated. 2613 tests all green.

## Phase 6S.2 — Adaptive Integration Completion (Aug 21, 2026)

- Extracted sanitizeAdaptiveHints() helper — used by both sanitizeContext() and sanitizeChatContextEnvelope().
- Fixed chat server sanitizer — adaptiveHints now survive server sanitization.
- Night focusWindow no longer emitted as unsafe 22:00-01:00 (start > end).
- logout() now clears adaptation data (account isolation).
- ai-adaptation.min.js loaded in boot chain (early availability for Focus + Settings).
- sw.js precache includes ai-adaptation.min.js.
- All existing tests pass. Phase 6S is now COMPLETE.

## Phase 6S.3 — Final Adaptive Product Closure (Aug 21, 2026)

- Fixed duplicate module loading — removed ai-adaptation from lazy chat chains.
- Wired adaptiveHints into Smart Planner context (js/ai.js buildContext).
- Added server prompt authority wording (advisory hints, explicit prefs override).
- Fixed focus signal quality — no-progress/creditedMinutes=0 not counted as productive.
- logout() and deleteAccount() both clear adaptation data.
- sync.min.js bumped to v7 (app.html + tests).
- All existing tests pass. Phase 6S is genuinely CLOSED.

## Phase 6T — AI UX, Trust & User Control (Aug 22, 2026)

- **Adaptive Planning settings UI** — Toggle in Tools drawer (default OFF), View learned patterns modal, Reset learned data
- **Learned patterns view** — Transparent read-only display of focus duration, productive time, productive days, duration calibration with confidence levels
- **AI feedback store** — `js/ai-feedback.js` — Local-only bounded (200 entries, 90-day retention), stores only {feature, rating, reason, timestamp}, no task text or chat content
- **Proposal feedback** — Helpful/Not helpful buttons on AI plan preview
- **Adaptive settings in tools drawer** — Toggle, view patterns, reset
- **Smart Planner integration** — Adaptive hints attached to /api/ai/plan context
- **i18n** — 36 VI + EN strings for adaptive planning trust UX
- **Phase 6T test suite** — 41 deterministic tests (adaptation, feedback, i18n, boot, context, privacy)
- **app.min.js v218, sw CACHE v270**

## Phase 6T.1 — Trust UX Completion (Aug 22, 2026)

- **Release gate repair** — i18n.min.js version pin fixed (v51 → v52)
- **Review model** — `js/ai-review.js` deterministic before/after diffs for schedule, reschedule, create actions
- **Explainability integration** — "Why this suggestion?" provenance panels via existing ai-explainability.js
- **Data used transparency** — expandable context category display
- **Undo integration** — aiApply() pushes undo snapshot before mutations
- **AbortController** — in-flight requests cancelled on new run or panel close
- **Stale response protection** — monotonically increasing request generation counter
- **Friendly error mapping** — VI/EN error messages for all provider errors via TaskFlowAIReview.friendlyError()
- **Retry button** — explicit user-initiated retry after errors
- **Loading states** — honest progress indicator during AI request
- **app.min.js v219, i18n.min.js v52, sw CACHE v271**
