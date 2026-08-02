<div align="center">

# 🐥 TaskFlow-Todoist

**Ứng dụng lập kế hoạch cá nhân miễn phí — Quản lý mục tiêu năm · tháng · tuần, theo dõi thói quen, streak & heatmap, nhật ký reflection**

Giao diện pastel kawaii · Hoạt động **100% offline** · Dữ liệu lưu ngay trên trình duyệt (localStorage) · Không cần tài khoản · Hỗ trợ **tiếng Việt & tiếng Anh**

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![No Framework](https://img.shields.io/badge/No%20Framework-100%25%20thu%E1%BA%A7n-4A403A?style=flat-square)](https://developer.mozilla.org/en-US/docs/Learn)
[![Offline](https://img.shields.io/badge/Offline-Ready-7FAFD3?style=flat-square)]()
[![MIT License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**🚀 Demo:** [https://hungphammanh06.github.io/Todoist/](https://hungphammanh06.github.io/Todoist/)

</div>

---

## 📖 Giới thiệu

**TaskFlow-Todoist** là trang web lập kế hoạch cá nhân dành cho năm 2026, được thiết kế theo phong cách *"kawaii spreadsheet"* với tông màu pastel ấm áp. Ứng dụng giúp bạn:

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
- Panel **Reflection** 4 câu hỏi (viết được, lưu tự động)

### 🔥 Streak & Heatmap
- **Flame Hero** — chuỗi hiện tại 🔥, chuỗi kỷ lục 🏆, thanh tiến độ tới kỷ lục, thông báo "New record! 🎉"
- **Ember Ribbon 90 ngày** — heatmap kiểu GitHub xuyên 3 tháng, nhãn tháng, ô hôm nay viền đậm, tooltip đầy đủ tháng/ngày/%
- **Streak đa tháng** — đếm chuỗi ngày liên tiếp xuyên qua ranh giới tháng (dữ liệu đọc từ localStorage tháng trước)
- **Vệt 14 ngày** cho từng thói quen + % hoàn thành

### 🗓️ Kế hoạch năm
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

### 📦 PWA — cài đặt như app thật
- 📲 **Cài đặt offline**: mở trang → chọn "Cài đặt ứng dụng" (Chrome/Edge) — app chạy ngoài cửa sổ trình duyệt, **hoạt động offline 100%**
- 🔔 **Nhắc việc hằng ngày**: bật nút 🔔 trong header, chọn giờ — trình duyệt nhắc điểm danh thói quen mỗi ngày (kể cả khi app đã đóng, nhờ Periodic Background Sync)
- 🖼️ Icon pastel kawaii đầy đủ kích thước (192/512/maskable) cho Android & iOS

### 💾 Dữ liệu của bạn — sao lưu & in
- 📤 **Xuất JSON**: sao lưu toàn bộ 12 tháng + năm thành 1 file (khôi phục bất cứ lúc nào)
- 📥 **Nhập JSON**: khôi phục dữ liệu từ file sao lưu (ghi đè)
- 📊 **Xuất CSV**: mọi mục tiêu/thói quen/task/reflection thành bảng 7 section — dán thẳng vào **Google Sheets**
- 🖨️ **In / PDF**: in view đang mở (Tổng quan/Năm/Tuần) tối ưu A4 ngang, checkbox hiện ☐/☑, ẩn nút thao tác

### 📈 Analytics (GA4)
- Theo dõi **lượt truy cập, người dùng quay lại, tạo mục tiêu/thói quen/task, cài đặt PWA** — cấu hình Measurement ID trong `js/app.js`

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

## ☁️ Đồng bộ đám mây (Supabase)

Từ phiên bản này, app hỗ trợ **đồng bộ dữ liệu đa thiết bị qua Supabase** (Postgres đám mây miễn phí):

- 🔄 **Đồng bộ 2 chiều** — mọi mục tiêu/thói quen/reflection/streak được đẩy lên đám mây và kéo về tự động
- 📤 **Nâng cấp dữ liệu cũ** — dữ liệu đang nằm trong localStorage được tự động đẩy lên server lần đầu kết nối
- 📱 **Đa thiết bị** — mở cùng tài khoản trên điện thoại/laptop/PC là thấy cùng một bản kế hoạch
- 🚫 **Offline-first** — chưa cấu hình hoặc mất mạng vẫn dùng bình thường (localStorage là nguồn chính, Supabase là bản sao)

### ⚙️ Cách kích hoạt (khoảng 10 phút)

1. **Tạo project miễn phí** tại [supabase.com](https://supabase.com) → **New Project**
2. **Chạy schema**: mở **SQL Editor → New query**, dán toàn bộ nội dung [`supabase/schema.sql`](supabase/schema.sql) rồi bấm **Run** (tạo bảng `planner_state` + Row Level Security + trigger `updated_at`)
3. **Lấy key** (giao diện mới của Supabase):
   - Cách nhanh: bấm nút **Connect** ở góc trên → mục *Use the Supabase client library* → copy **Project URL** + **anon public key**
   - Hoặc: **Settings (⚙️) → API Keys → tab Legacy API Keys** → copy **Project URL** + **anon public key** (dạng `eyJhbGciOiJIUzI1NiIs...`)
4. **Dán vào config**: mở [`js/supabase-config.js`](js/supabase-config.js) và điền 2 giá trị:
   ```js
   const SUPABASE_CONFIG = {
     url: 'https://xxxx.supabase.co',     // Project URL
     anonKey: 'eyJhbGciOiJIUzI1NiIs...', // anon public key
     autoAnonymous: true
   };
   ```
5. **Bật đăng nhập ẩn danh** (tuỳ chọn nhưng khuyên dùng): **Authentication → Sign In / Up → Anonymous sign-ins → Enable**
6. **Bật đăng nhập Google** (tuỳ chọn — nút ☁️ sẽ hiện *Tiếp tục với Google*):
   - **Authentication → Providers → Google → Enable**
   - Điền **Client ID / Client Secret** tạo tại [console.cloud.google.com](https://console.cloud.google.com) → *APIs & Services → Credentials → OAuth client ID* (loại **Web application**; authorized JavaScript origins gồm `https://<tên-trang>.github.io` và `http://localhost:8777` nếu chạy local; authorized redirect URIs để mặc định của Supabase)
   - Dưới bảng cấu hình, thêm **Redirect URL** của trang vào danh sách — thường là `https://<tên-trang>.github.io/Todoist/` (kèm slash cuối) hoặc `http://localhost:8777/`
   - Khi đăng nhập Google, app sẽ **quay về đúng URL** đang mở (có thể ghi đè qua `redirectTo` trong `js/supabase-config.js`)

> 💡 Dùng **anonymous** cho trải nghiệm "tự đồng bộ, không cần tài khoản". Muốn đồng bộ giữa **nhiều thiết bị** thì đăng nhập qua nút ☁️ trên thanh header — **Google OAuth** (nhanh nhất) hoặc **email/password**.

### 🧪 Kiểm tra
```bash
node test-sync.js   # 4 test: no-config, pull+migrate, push debounce, clearAll
```

> ⚠️ **Lưu ý gói miễn phí**: Supabase free tier giới hạn **số email xác nhận/gửi** (rate limit `over_email_send_rate_limit` — mặc định ~30 email/giờ/project). Nếu người dùng báo "tạo tài khoản thất bại", thường do hết hạn mức email — kiểm tra **Authentication → Rate Limits** và tăng lên, hoặc bật **Anonymous sign-ins** (mục 5) để không cần email.

---

## 🌱 Giai đoạn 5 — Growth loop

- 🔥 **Share streak**: nút *Chia sẻ streak 🔥* trên thẻ thói quen tạo ảnh card 1080×1080 (tên + số ngày liên tiếp + heatmap 16 tuần) tải về làm story — mỗi bài share là một kênh marketing miễn phí. Trên điện thoại hỗ trợ **Web Share API** (chia sẻ ảnh thẳng vào app khác).
- 💬 **Feedback FAB**: nút 💬 góc phải dưới mở popup Góp ý — nối **Google Form** qua `FB_FORM_URL` và email qua `FB_EMAIL` (khai báo đầu file `js/app.js`). Mọi phản hồi đều theo dõi bằng event `feedback_click` (GA4).
- 📊 **Iterate theo analytics**: điền `GA4_ID` (đầu `js/app.js` — hiện đang placeholder `G-XXXXXXXXXX`) để bắt đầu đo. Các event sẵn sàng: `first_visit`, `return_visit`, `create_goal`, `create_habit`, `create_task`, `share_streak` (kèm số ngày + kênh: native/fallback/download), `feedback_click`, `onboarding_*`, `export_*`, `print`, `reminder_*`.
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

## 📂 Cấu trúc dự án

```
TaskFlow-Todoist/
├── index.html          # Trang giới thiệu (landing, SEO tĩnh, OG image, JSON-LD, EN/VI)
├── app.html            # Trang ứng dụng chính (app shell, onboarding 3 bước, modal sync)
├── og-preview.html     # Nguồn tạo og-image.png (1200×630) — mở + chụp màn hình
├── og-image.png        # Ảnh chia sẻ Facebook/Zalo (og:image)
├── app-screenshot.png  # Ảnh chụp app hiển thị trên landing
├── css/
│   ├── styles.css      # Giao diện pastel kawaii app + 4 chủ đề màu + onboarding/empty states
│   └── landing.css     # Giao diện trang giới thiệu
├── js/
│   ├── app.js          # Logic ứng dụng (vanilla JS, không framework)
│   ├── sync.js         # Engine đồng bộ Supabase (pull/push/migrate, offline-first)
│   └── supabase-config.js # Điền Project URL + anon key tại đây
├── supabase/
│   └── schema.sql      # Bảng planner_state + RLS + trigger (chạy trong SQL Editor)
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
| **Google Fonts** | Baloo 2, Fredoka, Nunito, Quicksand, Playfair Display |

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
- [x] **Đăng nhập & đồng bộ đa thiết bị (Supabase)** — email/password + Google OAuth, RLS, offline-first
- [x] **Landing page tách riêng** (`index.html`) — SEO tĩnh, OG image 1200×630 cho Facebook/Zalo
- [x] **Onboarding 3 bước** — mục tiêu năm → 2 thói quen → chủ đề màu (lần dùng đầu)
- [x] **Empty states** có hướng dẫn cho từng panel (mục tiêu, thói quen)
- [x] **Share streak 🔥** — ảnh card 1080×1080 (tên + streak + heatmap) tải về / chia sẻ native
- [x] **Feedback FAB** 💬 — Google Form (`FB_FORM_URL`) + email (`FB_EMAIL`) + event GA4
- [x] **Đăng ký/đăng nhập email đã chạy** — lỗi hiện đúng thông báo của server; cần xác nhận email (hoặc bật Anonymous)

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
