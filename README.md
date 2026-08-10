<div align="center">

# 🐥 TaskFlow

**Ứng dụng lập kế hoạch cá nhân miễn phí — Today · Inbox · Upcoming · Mục tiêu năm/tháng/tuần · Thói quen & streak · Focus/Pomodoro · Lịch · Báo cáo**

Giao diện pastel kawaii · **Offline-first** — dùng được không cần tài khoản, dữ liệu lưu trên trình duyệt (localStorage) · **Đồng bộ đám mây tùy chọn** khi đăng nhập · Hỗ trợ **tiếng Việt & tiếng Anh**

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![No Framework](https://img.shields.io/badge/No%20Framework-100%25%20thu%E1%BA%A7n-4A403A?style=flat-square)](https://developer.mozilla.org/en-US/docs/Learn)
[![Offline](https://img.shields.io/badge/Offline-Ready-7FAFD3?style=flat-square)]()
[![MIT License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**🚀taskflow-todoist.vercel.app

</div>

**TaskFlow là personal productivity system offline-first** — một nơi duy nhất cho việc lập kế hoạch và điều hành hằng ngày:

- 🗓️ **Today** — việc cần làm hôm nay: tiến độ, thói quen, Focus
- 📥 **Inbox** — bắt nhanh mọi ý tưởng, lên lịch sau
- 🔭 **Upcoming** — nhìn trước công việc những ngày tới
- 📅 **Week · Month · Year** — kế hoạch tuần, tổng quan tháng, mục tiêu năm
- ✅ **Tasks** — ưu tiên, subtask, lặp lại, nhắc việc
- 🔁 **Habits** — streak & heatmap
- 🍅 **Focus / Pomodoro**
- 📊 **Calendar & Reports** — lịch, báo cáo tháng/tuần/năm
- 🔍 **Search** + 📤 **Import/Export** (JSON · CSV · ICS)
- 📲 **PWA** — cài như app thật, chạy offline-first
- ☁️ **Optional cloud sync** — đăng nhập để đồng bộ đa thiết bị

---

## 📖 Giới thiệu

**TaskFlow** là trang web lập kế hoạch cá nhân dành cho năm 2026, được thiết kế theo phong cách *"kawaii spreadsheet"* với tông màu pastel ấm áp. Ứng dụng giúp bạn:

- 🗓️ **Điều hướng 12 tháng trong năm** — mỗi tháng có bộ mục tiêu, thói quen, reflection và kế hoạch tuần riêng
- 🎯 **Đặt và theo dõi mục tiêu** cho cả năm, từng tháng và từng tuần — thêm/sửa/xoá tự do
- 📊 **Habit tracker 31 ngày** với CRUD động, phần trăm hoàn thành theo từng thói quen
- 🔥 **Streak & heatmap đa tháng** — chuỗi ngày liên tiếp kiểu GitHub, tính xuyên qua ranh giới tháng
- ✅ **Checklist công việc** hằng ngày theo nhóm ưu tiên (Priority) và thường (Regular)
- 📝 **Nhật ký Reflection** — tổng kết điều làm tốt, bài học, lòng biết ơn, mục tiêu tiếp theo
- 🎨 **4 chủ đề màu pastel** (kem, bạc hà, oải hương, đào) + chuyển đổi ngôn ngữ **VI/EN**

Tất cả dữ liệu được lưu an toàn trong **localStorage** của trình duyệt — bạn không cần tài khoản, không cần internet, không lo lộ dữ liệu.

---

## ✨ Tính năng chính

### 📅 Tổng quan tháng
- Thẻ thông tin tháng/năm/tuần hiện tại + đồng hồ thời gian thực
- Biểu đồ tiến độ **6 tuần** dạng cột
- Panel **Mục tiêu tháng** với donut tiến độ, bảng thống kê, danh sách mục tiêu ưu tiên/thường (thêm/sửa/xoá)
- **Habit tracker 31 ngày** với cột sticky, ô tick + biểu đồ phần trăm từng thói quen (thêm/đổi tên/xoá)
- 🎯 **Mục tiêu habit tùy chỉnh** — mỗi thói quen có mục tiêu ngày riêng (mặc định 100%), phần trăm tính theo mục tiêu
- 🗓️ **Sao chép thói quen sang tháng sau** — giữ nguyên tên + mục tiêu, bảng tick tháng mới trống
- Panel **Reflection** 4 câu hỏi (viết được, lưu tự động)

### 📊 Báo cáo tháng & Huy hiệu
- 📄 **Báo cáo tháng** — 1 cú nhấn: % mục tiêu, số ngày đạt, tổng streak 🔥, kỷ lục 🏆, điểm danh, thói quen đạt tốt nhất
- 📤 **Chia sẻ ảnh báo cáo** — tạo ảnh 1080×1080 (donut + thống kê), chia sẻ trực tiếp hoặc tải về `taskflow-report.png`
- 🏅 **Huy hiệu** — 🔥 7 ngày liên tiếp, 🔥🔥 30 ngày, 🏆 kỷ lục 14 ngày, 🎯 hoàn thành mọi mục tiêu, 💯 mọi thói quen đạt 100%, 📅 điểm danh 15 ngày — tự trao khi xem tháng hiện tại, lưu vĩnh viễn

### 🔥 Streak & Heatmap
- **Flame Hero** — chuỗi hiện tại 🔥, chuỗi kỷ lục 🏆, thanh tiến độ tới kỷ lục, thông báo "New record! 🎉"
- **Ember Ribbon 90 ngày** — heatmap kiểu GitHub xuyên 3 tháng, nhãn tháng, ô hôm nay viền đậm, tooltip đầy đủ tháng/ngày/%
- **Streak đa tháng** — đếm chuỗi ngày liên tiếp xuyên qua ranh giới tháng (dữ liệu đọc từ localStorage tháng trước)
- **Vệt 14 ngày** cho từng thói quen + % hoàn thành

### 🗓️ Kế hoạch năm
- 🧭 **Điều hướng nhiều năm** — nút «/» chuyển năm, tab "Năm YYYY" luôn đúng năm đang xem, lưới 12 tháng riêng cho từng năm
- Card tổng quan **năm + tháng hiện tại** kèm câu motto
- Biểu đồ cột **4 quý (Q1–Q4)** và **12 tháng**
- Panel **2026 Goals** — donut, thống kê, nút **"Lấy dữ liệu từ 12 tháng từ Dashboard"** gộp mục tiêu toàn năm
- **Line chart tiến độ 12 tháng** + Reflection năm
- Bảng **Tổng quan theo quý** (donut + checklist từng quý)
- Lưới **12 tháng chi tiết**: bar tiến độ, checklist mục tiêu và ô ghi chú riêng từng tháng

### 📆 Kế hoạch tuần
- 6 tuần trong tháng, mỗi tuần một view riêng
- Grid **7 ngày** với task ưu tiên/thường, thanh tiến độ, ghi chú từng ngày
- Mục tiêu tuần + donut tiến độ + reflection tuần

### 🛠️ Tiện ích & Tuỳ chỉnh
- ⏱️ **Đồng hồ thời gian thực** — tự chuyển tuần/tháng khi qua ngày mới
- 📍 **Nút "Hôm nay"** — quay về tuần/tháng hiện tại ngay lập tức
- 🧭 **Điều hướng bàn phím** trên tab (mũi tên / Home / End)
- 🔄 **Nút "Quay lại tháng này"** khi bạn xem tháng khác
- 🎨 **4 chủ đề màu** lưu lựa chọn + toggle ngôn ngữ **VI/EN**
- ♿ Hỗ trợ **aria-label**, `role=checkbox`, điều hướng bằng Tab
- 📱 **Responsive** trên mobile, tablet và desktop

### 🔔 Nhắc việc habit/task (Phase 4)
- Mỗi **thói quen** và **task** có thể bật nhắc riêng với giờ tự chọn (nút 🔔 cạnh tên) — khi đến giờ, trình duyệt hiện thông báo kèm tên mục cần làm
- Danh sách nhắc đang bật hiển thị ngay trong popup 🔔 của header, bật/tắt từng mục nhanh chóng
- Nhắc chính xác giờ hoạt động khi app đang mở (`setTimeout` tự lên lịch lại mỗi ngày); khi app đóng, nhắc hằng ngày dùng Periodic Background Sync (giới hạn của trình duyệt)

### 📊 Báo cáo tuần (Phase 4)
- Nút **"📊 Báo cáo tuần"** trong view Tuần: % mục tiêu, số xong/đang làm/tổng, tỉ lệ habit theo 7 ngày, thói quen nổi bật 🔥, ngày năng suất nhất ⭐
- 📤 **Chia sẻ ảnh báo cáo tuần** — ảnh 1080×1080 (donut + thống kê + bar chart 7 ngày), chia sẻ trực tiếp hoặc tải `taskflow-week-report.png`

### 🍅 Widget Pomodoro trong tuần view (Phase 4)
- Card **Pomodoro** ngay trong view Tuần: timer 25/5, start/pause/reset, chuyển nhanh chế độ Tập trung/Nghỉ
- **Thống kê session**: số phiên + tổng phút hôm nay và tuần này (key `planner-pomo-log`, tự đồng bộ đám mây)

### 📦 PWA — cài đặt như app thật
- 📲 **Cài đặt offline**: mở trang → chọn "Cài đặt ứng dụng" (Chrome/Edge) — app chạy ngoài cửa sổ trình duyệt, **hoạt động offline-first** (vẫn dùng được khi mất mạng)
- 🔔 **Nhắc việc hằng ngày**: bật nút 🔔 trong header, chọn giờ — trình duyệt nhắc điểm danh thói quen mỗi ngày (kể cả khi app đã đóng, nhờ Periodic Background Sync)
- 🔔 **Nhắc việc theo habit/task**: mỗi thói quen & task có giờ nhắc riêng (nút 🔔 cạnh tên) — chính xác khi app mở
- 🖼️ Icon pastel kawaii đầy đủ kích thước (192/512/maskable) cho Android & iOS

### 💾 Dữ liệu của bạn — sao lưu & in
- 📤 **Xuất JSON**: sao lưu toàn bộ 12 tháng + năm thành 1 file (khôi phục bất cứ lúc nào)
- 📥 **Nhập JSON**: khôi phục dữ liệu từ file sao lưu (ghi đè)
- 📊 **Xuất CSV**: mọi mục tiêu/thói quen/task/reflection thành bảng 7 section — dán thẳng vào **Google Sheets**
- 🖨️ **In / PDF**: in view đang mở (Tổng quan/Năm/Tuần) tối ưu A4 ngang, checkbox hiện ☐/☑, ẩn nút thao tác

### ↩️ Undo / Redo (Phase 5)
- **Hoàn tác / Làm lại** mọi thao tác: tick task/habit/goal, thêm/xoá mục, sửa text, sắp xếp, thậm chí cả nút "Đặt lại"
- Nút ↩️/↪️ trong header + phím **`Ctrl+Z`** / **`Ctrl+Shift+Z`** — snapshot tối đa 50 bước trong phiên

### 🔀 Kéo-thả sắp xếp (Phase 5)
- Kéo thả **task** trong ngày, **mục tiêu** trong tháng/tuần/năm, **thói quen** trong bảng để đổi thứ tự (lưu ngay, có undo)
- Gợi ý: kéo thả tốt nhất trên máy tính; trên mobile dùng thứ tự mặc định

### ⌨️ Phím tắt (Phase 5)
- `Ctrl+K` — mở/đóng tìm kiếm xuyên tháng · `1-5` — chuyển view (Tổng quan/Tuần/Năm/Lịch) · `/` — focus ô thêm task hôm nay · `Esc` — đóng modal/chế độ tập trung

### 🕑 Sao lưu tự động (Phase 5)
- App tự lưu **7 bản sao lưu** (`planner-backup-0..6`, vòng xoay) sau mỗi lần thay đổi — mở 💾 → **"Khôi phục bản sao lưu tự động"** để quay lại bản cũ bất kỳ
- Trước khi import JSON, app tự chốt 1 bản sao lưu dữ liệu hiện tại (an toàn không mất)

### 🎯 Chế độ Tập trung (Phase 5)
- Nút 🎯 trong header: overlay tối giản chỉ còn **task hôm nay + thói quen cần làm** — tick ngay trong đó, `Esc` để thoát

### ✨ Thói quen mẫu & Demo (Phase 6)
- Nút **✨ Thói quen mẫu** trong panel thói quen: 16 gợi ý (💧 📚 🏃 😴 …) thêm 1 chạm
- Nút **🎬 Demo** trong 💾: tạo sẵn 3 mục tiêu + 4 thói quen + 2 task hôm nay (dữ liệu đầy đủ để trải nghiệm ngay)

### 😊 Mood tracker (Phase 6)
- **Chấm mood mỗi ngày** (😢→🤩) ngay trong view Tuần — nhiệt kế **heatmap cả tháng** ngay trên Tổng quan
- **Insight tự động**: ngày vui vs ngày buồn — hôm nào bạn hoàn thành thói quen tốt hơn? (tự đồng bộ đám mây)

### 📅 Báo cáo năm (Phase 6)
- Nút **"📊 Báo cáo năm"** trong view Năm: % hoàn thành mục tiêu, tháng đạt mục tiêu nhất 🏆, thói quen nổi bật 🔥, ngày năng suất nhất ⭐
- 📤 **Chia sẻ ảnh báo cáo năm** — ảnh 1080×1080 (donut + thống kê), chia sẻ trực tiếp hoặc tải `taskflow-year-report.png`

### 📥 Nhập CSV (Phase 6)
- **Nhập CSV** (nút trong 💾): khôi phục mục tiêu/thói quen/task từ file xuất trước đó — dữ liệu trùng tên **gộp vào, không ghi đè** (an toàn khi cập nhật từ Google Sheets)

### 🔔 Weekly digest (Phase 6)
- App tự ghi bản tóm tắt hôm qua (thói quen bỏ lỡ, mục tiêu hôm nay) vào cache — nhắc hằng ngày của trình duyệt hiển thị **số liệu thực tế** thay vì câu mặc định

### 📈 Analytics (GA4)
- Theo dõi **lượt truy cập, người dùng quay lại, tạo mục tiêu/thói quen/task, cài đặt PWA** — cấu hình Measurement ID trong `js/analytics.js`

---

## 🚀 Cách chạy

### Cách 1 — Mở trực tiếp (đơn giản nhất)
Tải về hoặc clone repo, sau đó **mở file `index.html`** bằng bất kỳ trình duyệt hiện đại nào (Chrome, Edge, Firefox, Safari).

### Cách 2 — Chạy bằng server local (khuyến nghị)
```bash
# Dùng Python
python -m http.server 8080

# Hoặc dùng Node.js
npx serve .
```
Mở trình duyệt tại `http://localhost:8080`.

> ⚠️ Lưu ý: dữ liệu lưu trong localStorage **theo từng trình duyệt** — dùng đúng một trình duyệt để giữ dữ liệu liên tục.

---

## 🧊 Offline-first & Sync

TaskFlow hoạt động **offline-first / local-first**:

- **Không đăng nhập** → toàn bộ dữ liệu nằm ngay trong trình duyệt (localStorage). Mở app là dùng được, kể cả khi mất mạng.
- **Đăng nhập** → **đồng bộ đám mây là tùy chọn**: dữ liệu được đồng bộ qua backend để dùng trên nhiều thiết bị.
- Cloud sync **không phải yêu cầu bắt buộc** — TaskFlow dùng tốt hoàn toàn local, không cần tài khoản.

---

## ☁️ Đồng bộ đám mây (backend Render)

App hỗ trợ **đồng bộ dữ liệu đa thiết bị qua backend riêng** (Node.js + Express + Postgres trên Render):

- 🔄 **Đồng bộ 2 chiều** — mọi mục tiêu/thói quen/reflection/streak được đẩy lên đám mây và kéo về tự động
- 🆕 **Tài khoản mới = dữ liệu mới** — khi tạo tài khoản mới (hoặc đăng nhập tài khoản khác), dữ liệu local của tài khoản trước bị xoá, app kéo đúng dữ liệu của tài khoản đang dùng — không trộn lẫn giữa các tài khoản trên cùng thiết bị
- 📱 **Đa thiết bị** — mở cùng tài khoản trên điện thoại/laptop/PC là thấy cùng một bản kế hoạch
- 👤 **Tài khoản username/password** — đăng ký đơn giản, không cần email xác nhận (hết lo rate limit email)
- 🚫 **Offline-first** — chưa cấu hình hoặc mất mạng vẫn dùng bình thường (localStorage là nguồn chính, backend là bản sao)

### ⚙️ Cách kích hoạt (khoảng 15 phút)

1. **Deploy backend** trên [render.com](https://render.com) → **New → Blueprint** → chọn repo này.
   Render đọc [`server/render.yaml`](server/render.yaml) tự tạo **Postgres** + **Web Service** (chạy `server/`, không cần cấu hình gì thêm — chưa kịp cấu hình Google thì bỏ qua biến `GOOGLE_CLIENT_ID/SECRET`, app vẫn dùng username/password bình thường).
2. **Dán URL vào config**: mở [`js/api-config.js`](js/api-config.js), sửa:
   ```js
   const API_CONFIG = {
     url: 'https://taskflow-backend.onrender.com', // URL Web Service vừa tạo
     google: true, // bật/tắt nút "Tiếp tục với Google"
   };
   ```
3. **Chạy local không cần DB**: `cd server && npm install && node index.js` — tự dùng Postgres ảo (pg-mem) trên cổng 4000; bật `js/api-config.js` url `http://localhost:4000` rồi mở app để thử.

### 🔑 Đăng nhập Google (tuỳ chọn)

1. Tạo **OAuth Client ID** loại *Web application* tại [console.cloud.google.com](https://console.cloud.google.com) → *APIs & Services → Credentials*; thêm *Authorized redirect URI*: `https://<tên-backend>.onrender.com/api/auth/google/callback` (và `http://localhost:4000/api/auth/google/callback` nếu chạy local).
2. Điền **GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET** + **APP_URL** (URL trang app của bạn, vd `https://<tên-trang>.github.io/Todoist/app.html`) vào **Environment** của Web Service trên Render, rồi **Deploy** lại.
3. Sau khi đăng nhập Google, app quay về `APP_URL?token=...` và tự đăng nhập.

### 🧪 Kiểm tra
```bash
node test-sync.js   # 6 test: no-config, signup+migrate, login lỗi/đúng, push debounce, clearAll, username trùng
```

> ⚠️ **Thay đổi backend**: endpoint nằm trong [`server/`](server/) (auth JWT + schema `users`/`planner_state` trong `server/schema.sql`). Token JWT lưu ở localStorage (`planner-token`), TTL 30 ngày.

---

## 🌱 Giai đoạn 5 — Growth loop

- 🔥 **Share streak**: nút *Chia sẻ streak 🔥* trên thẻ thói quen tạo ảnh card 1080×1080 (tên + số ngày liên tiếp + heatmap 16 tuần) tải về làm story — mỗi bài share là một kênh marketing miễn phí. Trên điện thoại hỗ trợ **Web Share API** (chia sẻ ảnh thẳng vào app khác).
- 💬 **Feedback FAB**: nút 💬 góc phải dưới mở popup Góp ý — nối **Google Form** qua `FB_FORM_URL` và email qua `FB_EMAIL` (khai báo đầu file `js/app.js`). Mọi phản hồi đều theo dõi bằng event `feedback_click` (GA4).
- 📊 **Iterate theo analytics**: điền `GA4_ID` (đầu `js/analytics.js` — hiện đang placeholder `G-XXXXXXXXXX`) để bắt đầu đo. Các event sẵn sàng: `first_visit`, `return_visit`, `create_goal`, `create_habit`, `create_task`, `share_streak` (kèm số ngày + kênh: native/fallback/download), `feedback_click`, `onboarding_*`, `export_*`, `print`, `reminder_*`.
  - Mẹo iterate: xem GA4 → *Reports → Engagement → Events* — kênh nào (landing → app, share story, bạn bè giới thiệu) đem traffic về, đổ thêm công sức vào kênh đó.

---

## ☁️ Triển khai lên mạng (Vercel)

Trang web là **static site thuần** (HTML/CSS/JS) — không cần build, không cần server.

### 🚀 Vercel

**Cách 1 — Import từ GitHub (nhanh nhất, không cần cài đặt):**
1. Đăng nhập [vercel.com](https://vercel.com) (nên đăng nhập bằng GitHub)
2. **Add New → Project** → chọn repo `Todoist` → Vercel tự nhận là static site → **Deploy**
3. Xong! Link có dạng `https://todoist-xxx.vercel.app` — có thể đổi tên miền tuỳ ý trong **Settings → Domains**

**Cách 2 — Bằng Vercel CLI (tự động hoá):**
```bash
npm i -g vercel   # cài CLI
vercel login      # đăng nhập (mở trình duyệt)
vercel --prod     # deploy production
```

> Cấu hình sẵn trong [`vercel.json`](vercel.json): clean URLs + header bảo mật. Khi push code lên GitHub, Vercel **tự deploy lại** nếu đã import repo (git integration).

---

## 📈 Kích hoạt Analytics & Góp ý

1. Tạo GA4 property tại [analytics.google.com](https://analytics.google.com) → lấy Measurement ID dạng `G-XXXXXXX`
2. Điền vào `js/analytics.js` (`GA4_ID`) và `js/app.js` (`FB_FORM_URL`, `FB_EMAIL`):
3. Mỗi hành động quan trọng đã có sẵn event GA4 (`create_goal`, `share_streak`, `pwa_install`, `pwa_prompt`, ...) — xem ở Reports → Engagement → Events

---

## 📂 Cấu trúc dự án

```
TaskFlow/
├── index.html          # Trang giới thiệu (landing, SEO tĩnh, OG image, JSON-LD, EN/VI)
├── app.html            # Trang ứng dụng chính (app shell, onboarding 3 bước, modal sync)
├── og-preview.html     # Nguồn tạo og-image.png (1200×630) — mở + chụp màn hình
├── og-image.png        # Ảnh chia sẻ Facebook/Zalo (og:image)
├── app-screenshot.png  # Ảnh chụp app hiển thị trên landing
├── css/
│   ├── tokens.css      # Design tokens (màu, spacing, font)
│   ├── components.css  # Component dùng chung (button, input, toast, drawer, tooltip)
│   ├── app-shell.css   # App shell: sidebar, topbar, mobile bottom nav, More sheet
│   ├── styles.css      # Giao diện pastel kawaii app + 4 chủ đề màu + onboarding/empty states
│   ├── legal.css       # Trang pháp lý (privacy/terms/data-and-security)
│   └── landing.css     # Giao diện trang giới thiệu
├── js/
│   ├── app.js          # Logic ứng dụng chính (vanilla JS, không framework)
│   ├── inbox.js        # Inbox view (add/save/schedule/render)
│   ├── search.js       # Tìm kiếm (open/close/run/render/go-result)
│   ├── quick-add.js    # Quick Add (submit/chunk/target-date)
│   ├── mood.js         # Mood tracker
│   ├── year-report.js  # Báo cáo năm
│   ├── digest.js       # Weekly digest cache
│   ├── remind-ui.js    # UI nhắc việc
│   ├── chat.js         # Trợ lý chat
│   ├── sync.js         # Engine đồng bộ backend (pull/push/migrate, offline-first)
│   ├── deeplink.js     # Parse ?view= & ?m=YYYY-M (manifest shortcuts) — module nhỏ, có unit test
│   ├── plan-math.js    # Tính toán thuần: % theo mục tiêu habit, streak, huy hiệu — có unit test
│   └── api-config.js   # Điền URL backend tại đây (js/api-config.js)
│   (mỗi module có bản .min.js do scripts/minify.py tạo)
├── server/
│   ├── index.js        # Backend Express (auth JWT + sync API)
│   ├── auth.js         # Đăng ký/đăng nhập username/password + Google OAuth
│   ├── sync.js         # API đọc/ghi dữ liệu (planner_state)
│   ├── db.js           # Kết nối Postgres (hoặc pg-mem khi chạy local)
│   ├── schema.sql      # Bảng users + planner_state
│   ├── package.json    # Dependencies + npm start
│   └── render.yaml     # Blueprint Render (Postgres + Web Service)
├── scripts/
│   └── ocr-image.py    # OCR ảnh: tự chọn Windows OCR (vi-VN) → easyocr (py -3.12 scripts/ocr-image.py <ảnh>)
├── vercel.json         # Cấu hình triển khai Vercel
├── README.md
└── .gitignore
```

---

## 🛠️ Công nghệ sử dụng

| Công nghệ | Mục đích |
|---|---|
| **HTML5** | Cấu trúc trang, SEO meta, Open Graph, semantic markup |
| **CSS3** | Grid layout, sticky columns, animation, responsive, CSS variables cho 4 theme |
| **Vanilla JavaScript** | Toàn bộ logic, không framework, không thư viện ngoài |
| **localStorage** | Lưu trữ dữ liệu mục tiêu/thói quen/reflection theo từng tháng (key `planner-{y}-{m}`) |
| **SVG** | Donut chart, line chart, bar chart vẽ tay |
| **Google Fonts** | Nunito |

---

## 🗺️ Lộ trình phát triển

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
- [x] **Đăng ký/đăng nhập email đã chạy** — lỗi hiện đúng thông báo của server; cần xác nhận email (hoặc bật Anonymous)

---

## 🔒 Privacy & Data

- Không đăng nhập → dữ liệu chỉ nằm trong trình duyệt của bạn.
- Đăng nhập → đồng bộ đám mây tùy chọn; chi tiết ở các trang pháp lý:

[Chính sách bảo mật](/privacy) · [Điều khoản sử dụng](/terms) · [Dữ liệu & Bảo mật](/data-and-security)

---

## 🤝 Đóng góp

Mọi ý tưởng, báo lỗi hay pull request đều được hoan nghênh! Hãy mở [issue](https://github.com/HungPhamManh06/Todoist/issues) hoặc gửi pull request.

---

## 📄 Giấy phép

Dự án được phân phối dưới giấy phép **MIT** — bạn tự do sử dụng, sửa đổi và phân phối.

---

<div align="center">

**Làm chủ năm 2026 của bạn, từng mục tiêu một. 🐥**

</div>
