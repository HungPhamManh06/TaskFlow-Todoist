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

## ☁️ Triển khai lên mạng (Vercel & Render)

Trang web là **static site thuần** (HTML/CSS/JS) — không cần build, không cần server. Có thể triển khai miễn phí trên cả Vercel và Render.

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

### 🦩 Render

1. Đăng nhập [render.com](https://render.com) (đăng nhập bằng GitHub)
2. **New → Blueprint** → chọn repo `Todoist` → Render đọc [`render.yaml`](render.yaml) và tự tạo **Static Site** → **Apply**
3. Xong! Link có dạng `https://taskflow-todoist.onrender.com`

> 💡 Mẹo: dùng **Vercel** cho domain chính (tốc độ + phân tích), **Render** làm bản sao dự phòng. Dữ liệu lưu trong localStorage theo từng trình duyệt nên hai bản deploy là độc lập nhau.

---

## 📂 Cấu trúc dự án

```
TaskFlow-Todoist/
├── index.html          # Trang chính (chứa SEO meta tags, OG, Twitter)
├── css/
│   └── styles.css      # Toàn bộ giao diện pastel kawaii + 4 chủ đề màu
├── js/
│   └── app.js          # Logic ứng dụng (vanilla JS, không framework)
├── vercel.json         # Cấu hình triển khai Vercel
├── render.yaml         # Blueprint triển khai Render (Static Site)
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
| **Google Fonts** | Baloo 2, Fredoka, Nunito, Quicksand, Instrument Serif |

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
- [ ] Xuất/nhập dữ liệu JSON + CSV (đồng bộ Google Sheets)
- [ ] Chế độ in / PDF
- [ ] PWA — cài đặt offline & nhắc việc

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
