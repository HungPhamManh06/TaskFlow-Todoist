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
