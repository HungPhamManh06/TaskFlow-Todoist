<div align="center">

#  TaskFlow

**Ứng dụng lập kế hoạch cá nhân miễn phí — Today · Inbox · Upcoming · Mục tiêu năm/tháng/tuần · Thói quen & streak · Focus/Pomodoro · Lịch · Báo cáo**

**Calm Productivity** · **Offline-first** — dùng được không cần tài khoản, dữ liệu lưu trong trình duyệt (localStorage) · **Đồng bộ đám mây tùy chọn** khi đăng nhập · Hỗ trợ **tiếng Việt & tiếng Anh**

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![No Framework](https://img.shields.io/badge/No%20Framework-100%25%20thu%E1%BA%A7n-4A403A?style=flat-square)](https://developer.mozilla.org/en-US/docs/Learn)
[![Offline](https://img.shields.io/badge/Offline-Ready-7FAFD3?style=flat-square)]()
[![MIT License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**🚀 [taskflow-todoist.vercel.app](https://taskflow-todoist.vercel.app/)**

</div>

**TaskFlow là hệ thống quản lý năng suất cá nhân offline-first** — một nơi duy nhất cho việc lập kế hoạch và điều hành hằng ngày.

> TaskFlow is an offline-first personal productivity system that connects long-term goals with weekly planning, daily tasks, habits and focused work.

---

## ✨ Tính năng chính (Core Features)

- 🗓️ **Today Dashboard** — việc cần làm hôm nay: task, tiến độ, thói quen, Focus
- 📥 **Inbox** — bắt nhanh mọi ý tưởng, lên lịch sau
- 🔭 **Upcoming** — nhìn trước công việc những ngày tới (hôm nay / sắp tới / quá hạn)
- ➕ **Quick Add** — thêm task nhanh từ mọi nơi (phím tắt, nút +)
- 📋 **Task Detail** — deadline · giờ · thời lượng · ưu tiên · lặp lại · tags · ghi chú · subtasks · nhắc việc
- 📅 **Week planning** — 7 ngày, task + ghi chú + mục tiêu tuần + Pomodoro
- 📊 **Month planning** — mục tiêu tháng, habit tracker 31 ngày, reflection
- 🎯 **Year goals** — mục tiêu năm, biểu đồ quý/tháng, line chart 12 tháng
- 🗓️ **Calendar** — lịch task & focus theo ngày
- 🔁 **Habit tracking** — streak 🔥 & heatmap kiểu GitHub, mục tiêu habit riêng
- 🍅 **Focus / Pomodoro** — timer 25/5, thống kê phiên, chế độ tập trung
- 📈 **Reports** — báo cáo tháng/tuần/năm, huy hiệu, chia sẻ ảnh 1080×1080
- 🔍 **Search** — tìm kiếm xuyên tháng (`Ctrl+K`)
- 📤 **Import / Export / Backup** — JSON · CSV · ICS, sao lưu tự động 7 bản
- 📲 **PWA** — cài như app thật, chạy offline-first
- ☁️ **Optional cloud sync** — đăng nhập để đồng bộ đa thiết bị
- 🌙 **Dark mode** + 4 chủ đề màu pastel (kem · bạc hà · oải hương · đào)
- 🌐 **Tiếng Việt / English**

---

## 📸 Ảnh chụp màn hình

| Tổng quan tháng (Overview) — desktop | Today — mobile |
|---|---|
| <img src="https://github.com/user-attachments/assets/ac9e44ee-880a-44a3-9919-0929fba2b0d2" alt="TaskFlow desktop" width="700"> | <img src="https://github.com/user-attachments/assets/5852356b-6e95-403c-a1d8-024f18e46637" alt="TaskFlow mobile" width="260"> |

---

## 📖 Giới thiệu

**TaskFlow** là hệ thống năng suất cá nhân **offline-first** — *Calm Productivity*: một nơi duy nhất kết nối mục tiêu dài hạn với thực thi hằng ngày.

**Luồng sản phẩm chính:**

```
Capture
  ↓
Inbox
  ↓
Plan
  ↓
Upcoming
  ↓
Today
  ↓
Focus
  ↓
Complete
  ↓
Reflect
```

Cấu trúc kế hoạch: **Year → Month → Week → Today** — mục tiêu năm được rải xuống tháng, tuần và việc của hôm nay.

Khi chưa đăng nhập, tất cả dữ liệu được lưu an toàn trong **localStorage** của trình duyệt — không cần tài khoản, không cần internet, không lo lộ dữ liệu. Đăng nhập chỉ để bật **đồng bộ đám mây tùy chọn** (xem [Offline-first & Sync](#-offline-first--sync)).

---

## 📚 Chi tiết tính năng

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
- Panel **Mục tiêu năm** — donut, thống kê, nút **"Lấy dữ liệu từ 12 tháng từ Dashboard"** gộp mục tiêu toàn năm
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
- 🎨 **4 chủ đề màu** + **Dark mode** lưu lựa chọn + toggle ngôn ngữ **VI/EN**
- ♿ Hỗ trợ **aria-label**, `role=checkbox`, điều hướng bằng Tab
- 📱 **Responsive** trên mobile, tablet và desktop

### 🔔 Nhắc việc habit/task
- Mỗi **thói quen** và **task** có thể bật nhắc riêng với giờ tự chọn (nút 🔔 cạnh tên) — khi đến giờ, trình duyệt hiện thông báo kèm tên mục cần làm
- Danh sách nhắc đang bật hiển thị ngay trong popup 🔔 của header, bật/tắt từng mục nhanh chóng
- Nhắc chính xác giờ hoạt động khi app đang mở (`setTimeout` tự lên lịch lại mỗi ngày); khi app đóng, nhắc hằng ngày dùng Periodic Background Sync (giới hạn của trình duyệt)

### 📊 Báo cáo tuần
- Nút **"📊 Báo cáo tuần"** trong view Tuần: % mục tiêu, số xong/đang làm/tổng, tỉ lệ habit theo 7 ngày, thói quen nổi bật 🔥, ngày năng suất nhất ⭐
- 📤 **Chia sẻ ảnh báo cáo tuần** — ảnh 1080×1080 (donut + thống kê + bar chart 7 ngày), chia sẻ trực tiếp hoặc tải `taskflow-week-report.png`

### 🍅 Widget Pomodoro trong tuần view
- Card **Pomodoro** ngay trong view Tuần: timer 25/5, start/pause/reset, chuyển nhanh chế độ Tập trung/Nghỉ
- **Thống kê session**: số phiên + tổng phút hôm nay và tuần này (key `planner-pomo-log`, tự đồng bộ đám mây)

### 📦 PWA — cài đặt như app thật
- 📲 **Cài đặt offline**: mở trang → chọn "Cài đặt ứng dụng" (Chrome/Edge) — app chạy ngoài cửa sổ trình duyệt, **hoạt động offline-first** (vẫn dùng được khi mất mạng)
- 🔔 **Nhắc việc hằng ngày**: bật nút 🔔 trong header, chọn giờ — trình duyệt nhắc điểm danh thói quen mỗi ngày (kể cả khi app đã đóng, nhờ Periodic Background Sync)
- 🔔 **Nhắc việc theo habit/task**: mỗi thói quen & task có giờ nhắc riêng (nút 🔔 cạnh tên) — chính xác khi app mở
- 🖼️ Icon pastel đầy đủ kích thước (192/512/maskable) cho Android & iOS

### 💾 Dữ liệu của bạn — sao lưu & in
- 📤 **Xuất JSON**: sao lưu toàn bộ 12 tháng + năm thành 1 file (khôi phục bất cứ lúc nào)
- 📥 **Nhập JSON**: khôi phục dữ liệu từ file sao lưu (ghi đè)
- 📊 **Xuất CSV**: mọi mục tiêu/thói quen/task/reflection thành bảng 7 section — dán thẳng vào **Google Sheets**
- 🖨️ **In / PDF**: in view đang mở (Tổng quan/Năm/Tuần) tối ưu A4 ngang, checkbox hiện ☐/☑, ẩn nút thao tác

### ↩️ Undo / Redo
- **Hoàn tác / Làm lại** mọi thao tác: tick task/habit/goal, thêm/xoá mục, sửa text, sắp xếp, thậm chí cả nút "Đặt lại"
- Nút ↩️/↪️ trong header + phím **`Ctrl+Z`** / **`Ctrl+Shift+Z`** — snapshot tối đa 50 bước trong phiên

### 🔀 Kéo-thả sắp xếp
- Kéo thả **task** trong ngày, **mục tiêu** trong tháng/tuần/năm, **thói quen** trong bảng để đổi thứ tự (lưu ngay, có undo)
- Gợi ý: kéo thả tốt nhất trên máy tính; trên mobile dùng thứ tự mặc định

### ⌨️ Phím tắt
- `Ctrl+K` — mở/đóng tìm kiếm xuyên tháng · `1-5` — chuyển view (Tổng quan/Tuần/Năm/Lịch) · `/` — focus ô thêm task hôm nay · `Esc` — đóng modal/chế độ tập trung

### 🕑 Sao lưu tự động
- App tự lưu **7 bản sao lưu** (`planner-backup-0..6`, vòng xoay) sau mỗi lần thay đổi — mở 💾 → **"Khôi phục bản sao lưu tự động"** để quay lại bản cũ bất kỳ
- Trước khi import JSON, app tự chốt 1 bản sao lưu dữ liệu hiện tại (an toàn không mất)

### 🎯 Chế độ Tập trung
- Nút 🎯 trong header: overlay tối giản chỉ còn **task hôm nay + thói quen cần làm** — tick ngay trong đó, `Esc` để thoát

### ✨ Thói quen mẫu & Demo
- Nút **✨ Thói quen mẫu** trong panel thói quen: 16 gợi ý (💧 📚 🏃 😴 …) thêm 1 chạm
- Nút **🎬 Demo** trong 💾: tạo sẵn 3 mục tiêu + 4 thói quen + 2 task hôm nay (dữ liệu đầy đủ để trải nghiệm ngay)

### 😊 Mood tracker
- **Chấm mood mỗi ngày** (😢→🤩) ngay trong view Tuần — nhiệt kế **heatmap cả tháng** ngay trên Tổng quan
- **Insight tự động**: ngày vui vs ngày buồn — hôm nào bạn hoàn thành thói quen tốt hơn? (tự đồng bộ đám mây)

### 📅 Báo cáo năm
- Nút **"📊 Báo cáo năm"** trong view Năm: % hoàn thành mục tiêu, tháng đạt mục tiêu nhất 🏆, thói quen nổi bật 🔥, ngày năng suất nhất ⭐
- 📤 **Chia sẻ ảnh báo cáo năm** — ảnh 1080×1080 (donut + thống kê), chia sẻ trực tiếp hoặc tải `taskflow-year-report.png`

### 📥 Nhập CSV
- **Nhập CSV** (nút trong 💾): khôi phục mục tiêu/thói quen/task từ file xuất trước đó — dữ liệu trùng tên **gộp vào, không ghi đè** (an toàn khi cập nhật từ Google Sheets)

### 🔔 Weekly digest
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

```
Chưa đăng nhập:                Đã đăng nhập (cloud sync tùy chọn):

  Browser                         Browser
     │                                ↕
     ▼                           TaskFlow API
  Local storage                      ↕
                                 Database
```

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
   Render đọc [`render.yaml`](render.yaml) ở gốc repo tự tạo **Postgres** + **Web Service** (chạy `server/`, không cần cấu hình gì thêm — chưa kịp cấu hình Google thì bỏ qua biến `GOOGLE_CLIENT_ID/SECRET`, app vẫn dùng username/password bình thường).
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

## ☁️ Triển khai lên mạng (Vercel)

**Frontend** là static site (HTML/CSS/JS) — không cần build, chạy trực tiếp trên bất kỳ static host nào và hoạt động **offline-first mà không cần backend**.

**Backend là tùy chọn** — chỉ cần khi bạn muốn:

- 👤 Tài khoản người dùng
- 🔑 Đăng nhập Google
- ☁️ Đồng bộ đám mây

Kiến trúc:

```
Chưa đăng nhập:             Đã đăng nhập (cloud sync tùy chọn):

  Browser                     Browser
     │                           ↕
     ▼                      TaskFlow API
  LocalStorage                   ↕
                           PostgreSQL
```

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
├── index.html              # Trang giới thiệu (landing, SEO tĩnh, OG image, JSON-LD, EN/VI)
├── app.html                # Trang ứng dụng chính (app shell, onboarding 3 bước, modal sync)
├── privacy.html            # Chính sách bảo mật
├── terms.html              # Điều khoản sử dụng
├── data-and-security.html  # Dữ liệu & Bảo mật
├── manifest.json           # PWA manifest (offline-first + đồng bộ đám mây tùy chọn)
├── sw.js                   # Service Worker (cache app shell, nhắc việc hằng ngày)
├── og-preview.html         # Nguồn tạo og-image.png (1200×630) — mở + chụp màn hình
├── og-image.png            # Ảnh chia sẻ Facebook/Zalo (og:image)
├── app-screenshot.png      # Ảnh chụp app hiển thị trên landing (1200×900)
├── app-screenshot-mobile.png  # Ảnh chụp app mobile (PWA screenshot, 390×844)
├── vercel.json             # Triển khai Vercel (clean URLs + security headers)
├── render.yaml             # Blueprint Render (Postgres + Web Service backend)
├── robots.txt · sitemap.xml
├── css/
│   ├── tokens.css          # Design tokens (màu, spacing, font)
│   ├── components.css      # Component dùng chung (button, input, toast, drawer, tooltip)
│   ├── app-shell.css       # App shell: sidebar, topbar, mobile bottom nav, More sheet
│   ├── styles.css          # Giao diện pastel app + 4 chủ đề màu + empty states
│   ├── legal.css           # Trang pháp lý
│   └── landing.css         # Giao diện trang giới thiệu
│   (mỗi file có bản .min.css do scripts/minify.py tạo)
├── js/                     # Các module tách dần từ app.js (P11 refactor) — mỗi module có bản .min.js
│   ├── app.js              # Logic ứng dụng chính (vanilla JS, không framework)
│   ├── ui.js · util.js · keys.js · theme.js · i18n.js · dates.js · storage.js · stats.js
│   ├── inbox.js · search.js · quick-add.js · mood.js · year-report.js
│   ├── sync.js · syncui.js · account.js · api-config.js
│   ├── goals.js · habits.js · streak.js · remind.js · remind-ui.js · digest.js · chat.js
│   ├── clock.js · shell.js · fab.js · export.js · analytics.js · planmini.js
│   └── plan-math.js · plan-stats.js · plan-carry.js · deeplink.js
├── icons/                   # PWA icons (192/512/maskable) + logo/SVG sprite
├── server/                  # Backend Express (auth JWT + sync API, Postgres / pg-mem local)
│   ├── index.js · auth.js · sync.js · db.js · schema.sql · package.json
├── scripts/                 # QA & build tooling
│   ├── e2e-smoke.py         # Smoke test Playwright (nav, drawer, add task, export, overflow)
│   ├── e2e-frontend.py      # E2E frontend suite (landing/overview/week/year/calendar/dialogs/focus)
│   ├── minify.py            # Sinh .min.js/.min.css (terser + csso) — chạy --check trong CI
│   ├── measure-lighthouse.py# Đo Lighthouse baseline (trước/sau khi tối ưu)
│   ├── measure-perf.py      # Playwright measurement harness
│   └── ocr-image.py         # OCR ảnh: tự chọn Windows OCR (vi-VN) → easyocr
├── tests/                    # Unit tests (node --test): phase0..phase10 + phase9-frontend
├── .github/workflows/ci.yml  # CI: syntax check, minify check, unit tests, E2E
├── docs/                     # Lighthouse baseline + development history + superpowers plans/specs
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

## 🔒 Privacy & Data

- Không đăng nhập → dữ liệu chỉ nằm trong trình duyệt của bạn.
- Đăng nhập → đồng bộ đám mây tùy chọn; chi tiết ở các trang pháp lý:

[Chính sách bảo mật](https://taskflow-todoist.vercel.app/privacy) · [Điều khoản sử dụng](https://taskflow-todoist.vercel.app/terms) · [Dữ liệu & Bảo mật](https://taskflow-todoist.vercel.app/data-and-security)

---

## 👨‍💻 Dành cho nhà phát triển

- 📍 **Bản đồ trách nhiệm `app.js`** — [`docs/appjs-responsibility-map.md`](docs/appjs-responsibility-map.md): 32 vùng trách nhiệm, phân loại rủi ro (LOW/MEDIUM/HIGH) và thứ tự đề xuất để tách module.
- 🧪 **Unit tests** — `node --test tests/*.test.mjs`
- 🌐 **E2E** — `python scripts/e2e-smoke.py --browser chromium|firefox|webkit` (smoke) · `python scripts/e2e-frontend.py --all` (full suite)
- ⚙️ **Build** — `python scripts/minify.py` (tạo `.min.js`/`.min.css`, chạy `--check` trong CI)
- 📊 **Lighthouse** — `python scripts/measure-lighthouse.py` (baseline trong `docs/lighthouse/`)
- 📜 **Lịch sử phát triển** — [`docs/development-history.md`](docs/development-history.md): roadmap, ghi chú theo phase, growth loop

---

## 🤝 Đóng góp

Mọi ý tưởng, báo lỗi hay pull request đều được hoan nghênh! Hãy mở [issue](https://github.com/HungPhamManh06/Todoist/issues) hoặc gửi pull request.

---

## 📄 Giấy phép

Dự án được phân phối dưới giấy phép **MIT** — bạn tự do sử dụng, sửa đổi và phân phối.

---

<div align="center">

**Lập kế hoạch rõ ràng, tiến bộ mỗi ngày. 🐥**

</div>
