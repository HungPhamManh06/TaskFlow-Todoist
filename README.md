<div align="center">

# 🐥 Todoist 2026 Planner

**Ứng dụng lập kế hoạch tiếng Việt miễn phí — Quản lý mục tiêu năm · tháng · tuần, theo dõi thói quen & nhật ký reflection**

Giao diện pastel dễ thương · Hoạt động **100% offline** · Dữ liệu lưu ngay trên trình duyệt (localStorage) · Không cần tài khoản

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![No Framework](https://img.shields.io/badge/No%20Framework-100%25%20thu%E1%BA%A7n-4A403A?style=flat-square)](https://developer.mozilla.org/en-US/docs/Learn)
[![Offline](https://img.shields.io/badge/Offline-Ready-7FAFD3?style=flat-square)]()

**Demo:** [https://hungphammanh06.github.io/Todoist/](https://hungphammanh06.github.io/Todoist/)

</div>

---

## 📖 Giới thiệu

**Todoist 2026 Planner** là trang web lập kế hoạch cá nhân dành cho năm 2026, được thiết kế theo phong cách *"kawaii spreadsheet"* với tông màu pastel ấm áp (kem, đào, xanh oliu, vàng chanh). Ứng dụng giúp bạn:

- 🎯 **Đặt và theo dõi mục tiêu** cho cả năm, từng tháng và từng tuần
- ✅ **Checklist công việc** hằng ngày theo nhóm ưu tiên (Priority) và thường (Regular)
- 📊 **Habit tracker 31 ngày** — theo dõi thói quen với biểu đồ phần trăm từng ngày
- 📝 **Nhật ký Reflection** — tổng kết điều làm tốt, bài học, lòng biết ơn, mục tiêu tiếp theo
- 🗓️ **Tự động nhận diện tháng hiện tại** và đồng bộ ngày giờ thực tế

Tất cả dữ liệu được lưu an toàn trong **localStorage** của trình duyệt — bạn không cần tài khoản, không cần internet, không lo lộ dữ liệu.

---

## ✨ Tính năng chính

### 📅 Tổng quan tháng
- Thẻ thông tin tháng/năm/tuần hiện tại
- Biểu đồ tiến độ **6 tuần** dạng cột
- Panel **Mục tiêu tháng** với donut tiến độ, bảng thống kê, danh sách mục tiêu ưu tiên/thường
- **Habit tracker** 31 ngày với cột sticky, ô tick + biểu đồ phần trăm từng thói quen
- Panel **Reflection** 4 câu hỏi (viết được, lưu tự động)

### 🗓️ Kế hoạch năm
- Card tổng quan **năm + tháng hiện tại** kèm câu motto
- Biểu đồ cột **4 quý (Q1–Q4)** và **12 tháng**
- Panel **2026 Goals** — donut, thống kê, nút **"Lấy dữ liệu từ 12 tháng từ Dashboard"** gộp mục tiêu toàn năm
- **Line chart tiến độ 12 tháng** + Reflection năm
- Bảng **Tổng quan theo quý** (donut + checklist từng quý)
- Lưới **12 tháng chi tiết**: bar tiến độ, checklist mục tiêu và ô ghi chú riêng từng tháng
- 4 panel **Reflection quý** ở cuối trang

### 📆 Kế hoạch tuần
- 6 tuần trong tháng, mỗi tuần một view riêng
- Grid **7 ngày** với task ưu tiên/thường, thanh tiến độ, ghi chú từng ngày
- Mục tiêu tuần + donut tiến độ + reflection tuần

### 🛠️ Tiện ích
- ⏱️ **Đồng hồ thời gian thực** — tự chuyển tuần/tháng khi qua ngày mới
- 🧭 **Điều hướng bàn phím** trên tab (mũi tên / Home / End)
- 🔄 **Nút "Quay lại tháng này"** khi bạn xem tháng khác
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

## 📂 Cấu trúc dự án

```
Todoist/
├── index.html          # Trang chính (chứa SEO meta tags)
├── css/
│   └── styles.css      # Toàn bộ giao diện pastel kawaii
├── js/
│   └── app.js          # Logic ứng dụng (vanilla JS, không framework)
├── README.md
└── .gitignore
```

---

## 🛠️ Công nghệ sử dụng

| Công nghệ | Mục đích |
|---|---|
| **HTML5** | Cấu trúc trang, SEO meta, semantic markup |
| **CSS3** | Grid layout, sticky columns, animation, responsive |
| **Vanilla JavaScript** | Toàn bộ logic, không framework, không thư viện ngoài |
| **localStorage** | Lưu trữ dữ liệu mục tiêu/thói quen/reflection theo từng tháng |
| **SVG** | Donut chart, line chart, bar chart vẽ tay |

---

## 🗺️ Lộ trình phát triển

- [x] Tổng quan tháng + habit tracker + reflection
- [x] View tuần (task + ghi chú 7 ngày)
- [x] View **Kế hoạch năm** (goals, biểu đồ quý/tháng, reflection)
- [ ] Thêm/sửa/xoá mục tiêu & thói quen (CRUD)
- [ ] Xuất/nhập dữ liệu JSON + CSV (đồng bộ Google Sheets)
- [ ] Heatmap thói quen kiểu GitHub + streak
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
