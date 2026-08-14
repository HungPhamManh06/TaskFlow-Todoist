# Google Calendar — Manual QA Checklist (Real Device, Production)

> Mục đích: xác minh toàn bộ chuỗi Google Calendar (V1.6A read-only → V1.6B export → V1.6C push-only) trên **thiết bị thật** chống lại **production**, trước khi công bố rộng rãi. Không thể tự động hoá được vì cần OAuth + account Google thật.

## Môi trường kiểm tra (production)

| Thành phần | Giá trị |
|---|---|
| App (Vercel) | `https://taskflow-todoist.vercel.app/app` |
| Backend (Render) | `https://todoist-m3c7.onrender.com` |
| Redirect URI OAuth | `https://todoist-m3c7.onrender.com/api/calendar/callback` |
| Google Cloud Console | OAuth Client (Web application) → Authorized redirect URI = redirect URI trên |

**Yêu cầu cấu hình trước khi test (kiểm tra 1 lần):**

- [ ] Server env có `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL=https://taskflow-todoist.vercel.app`
- [ ] Google Cloud Console: OAuth consent screen đã publish; scopes đã khai: `https://www.googleapis.com/auth/calendar.events.readonly` (bắt buộc) và `https://www.googleapis.com/auth/calendar.events` (test mode hoặc đã verify — dùng cho export)
- [ ] Đã tạo sẵn **1 sự kiện all-day** và **1 sự kiện có giờ** trong calendar Google (kể cả calendar phụ nếu muốn test multiple calendars)
- [ ] Người test có **2 tài khoản Google** (A = owner TaskFlow, B = chỉ để kiểm tra calendar thật hiển thị đúng — tuỳ chọn)

## Ma trận thiết bị

| ID | Thiết bị | Trình duyệt | Ghi chú |
|---|---|---|---|
| D1 | Android (Pixel/OnePlus) | Chrome, PWA đã cài | Test đầy đủ chuỗi |
| D2 | iPhone | Safari (PWA đã cài) | Safari không hỗ trợ Web Share Target — chỉ test gcal |
| D3 | Desktop | Chrome | Test song song 2 tab (đối chiếu realtime) |
| D4 | Desktop | Firefox | Smoke: connect + đọc events + export 1 block |

> Ghi chú: OAuth popup bị chặn bởi popup-blocker ở vài trình duyệt — nếu không thấy trang Google, cho phép popup rồi thử lại. Đây là hành vi đã biết, không phải lỗi app.

---

## A. OAuth read-only connect (V1.6A)

### A1. Kết nối lần đầu
1. Mở `https://taskflow-todoist.vercel.app/app` → vào **Calendar** → chuyển sang chế độ **Schedule** (nút toggle Month/Schedule).
2. Kéo xuống footer khu vực Google Calendar → bấm **"Kết nối Google Calendar"**.
3. **Kỳ vọng:** chuyển sang trang Google OAuth; màn hình consent **chỉ liệt kê quyền xem sự kiện (read-only)**, KHÔNG có quyền chỉnh sửa.
4. Chấp thuận → quay về app với toast **"Đã kết nối Google Calendar"**.
5. Footer hiển thị badge **"Đã kết nối"**.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### A2. Từ chối consent
1. Bấm **"Kết nối Google Calendar"** → ở trang Google, bấm **Cancel**.
2. **Kỳ vọng:** quay về app, toast báo lỗi kết nối (không treo, không crash), footer vẫn ở trạng thái chưa kết nối.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### A3. Token hết hạn / server mất kết nối
1. Đã kết nối → vào **Settings (⚙️) → Tài khoản** → bấm "Đăng xuất" (hoặc xoá `planner-token` trên thiết bị khác) để token lệch trạng thái.
2. Quay lại Schedule view → bấm **"Làm mới"**.
3. **Kỳ vọng:** không crash; nếu server trả 401/410 → footer trở về trạng thái "chưa kết nối" (hoặc toast hướng dẫn kết nối lại). Không có lỗi console JS.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

## B. Hiển thị events read-only (V1.6A)

### B1. Sự kiện có giờ hiển thị trong Schedule view
1. Đã kết nối → chọn đúng ngày có sự kiện (tạo trước ở mục Môi trường).
2. **Kỳ vọng:** sự kiện Google xuất hiện trên timeline, **phân biệt rõ về mặt hình ảnh** với TimeBlock của TaskFlow (màu/chữ riêng), có tên sự kiện + giờ đúng múi giờ máy.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### B2. All-day event
1. Chọn ngày có sự kiện all-day.
2. **Kỳ vọng:** hiển thị ở vùng all-day / đầu ngày; không chiếm một khối giờ cụ thể sai; không lỗi.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### B3. Multiple calendars
1. Nếu có calendar phụ → tạo sự kiện trong calendar phụ, chọn đúng ngày.
2. **Kỳ vọng:** sự kiện calendar phụ cũng xuất hiện (nếu server list tất cả calendars đã cấp) hoặc không — ghi nhận hành vi thực tế. Không duplicate event.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### B4. Xoá sự kiện ở Google rồi refresh
1. Trong Google Calendar (web/app khác) **xoá** sự kiện đang hiển thị.
2. Về TaskFlow → bấm **"Làm mới"**.
3. **Kỳ vọng:** sự kiện biến mất khỏi Schedule view sau refresh (cache không giữ event đã xoá quá lâu).

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### B5. Timezone / DST
1. Đổi múi giờ máy (Settings → Date & time) sang múi giờ khác (± nơi có DST nếu test được), reload app, xem cùng một sự kiện.
2. **Kỳ vọng:** giờ hiển thị chuyển theo đúng múi giờ máy mới (ISO instant → giờ local), ngày không bị lệch sang hôm khác.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### B6. Ngoại tuyến — không có cache events
1. Airplane mode bật → mở lại Schedule view đã connect.
2. **Kỳ vọng:** app tải offline bình thường; phần Google events im lặng (không spinner treo, không lỗi đỏ); phần TaskFlow TimeBlock vẫn hoạt động đầy đủ.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

## C. Connect-write (V1.6B — scope ghi, tuỳ chọn)

### C1. Export khi chưa có scope ghi
1. Đã kết nối (read-only) → tạo 1 TimeBlock trong Schedule view (task có giờ).
2. Bấm nút **calendar** ("Thêm vào Google Calendar") trên block.
3. **Kỳ vọng:** toast **"Cần quyền ghi để thêm vào Google Calendar — xác nhận kết nối lại"** → tự chuyển sang trang Google OAuth; màn hình consent giờ liệt kê quyền **chỉnh sửa sự kiện** (write). KHÔNG được tự đổi scope khi user chưa bấm export.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### C2. Huỷ ở màn hình write consent
1. Lặp lại C1 nhưng bấm **Cancel** ở trang Google.
2. **Kỳ vọng:** app vẫn hoạt động, vẫn ở trạng thái read-only; không có event nào được tạo; bấm export lại → lại hỏi scope ghi.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

## D. Export TimeBlock → Google Event (V1.6B)

### D1. Export thành công + verify trên Google
1. Có TimeBlock `19:00–20:30` (task "Học Spring Boot") → bấm nút calendar trên block.
2. **Kỳ vọng:** toast **"Đã thêm vào Google Calendar"**; nút biến thành badge **calendar-check** (không còn là nút — không thể bấm lại để tạo event lặp).
3. Mở Google Calendar (web/điện thoại) → **Kỳ vọng:** xuất hiện 1 event đúng tên task, đúng giờ `19:00–20:30`, đúng ngày, nằm trong calendar mặc định.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### D2. Duplicate guard
1. Cùng block đã export ở D1 → reload app → bấm lại khu vực badge (nếu là button) hoặc thử export lại qua flow khác.
2. **Kỳ vọng:** **KHÔNG có event thứ hai** trên Google; toast **"Khung giờ đã có trên Google Calendar"**; badge giữ nguyên.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### D3. Export khi offline
1. Export thành công 1 block → Airplane mode → tạo TimeBlock mới → bấm export.
2. **Kỳ vọng:** không crash; toast lỗi mạng hoặc im lặng; **không có mapping ảo** — khi online, bấm export lại phải tạo đúng 1 event (không trùng).

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### D4. Export thất bại (server lỗi)
1. Nếu có thể: tạm thời dừng backend (hoặc test trên môi trường dev có server tắt) → bấm export.
2. **Kỳ vọng:** toast **"Không thêm được vào Google Calendar — thử lại sau"**; không lưu mapping sai; không tạo event rác.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

## E. Push-only update — PATCH (V1.6C)

### E1. Sửa giờ block đã export → event cập nhật
1. Chọn block đã export (có badge calendar-check) → mở dialog sửa → đổi giờ `19:00–20:30` → `20:00–21:30` → lưu.
2. **Kỳ vọng:** toast **"Đã cập nhật sự kiện Google"** (hoặc im lặng nếu offline); mở Google Calendar → **Kỳ vọng: cùng 1 event** (cùng event id) giờ thành `20:00–21:30`, **KHÔNG tạo event mới**, không duplicate.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### E2. Sửa tên task / đổi ngày
1. Đổi tên task gắn với block đã export (hoặc kéo block sang ngày khác) → lưu.
2. **Kỳ vọng:** event Google phản ánh title/ngày mới; vẫn cùng 1 event id.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### E3. Sửa khi offline → lành khi online
1. Airplane mode → sửa giờ block đã export → lưu (app cho phép, không crash).
2. Bật mạng lại → reload → **Kỳ vọng:** lần sửa online tiếp theo (hoặc refresh) PATCH lại; mở Google Calendar → giờ cuối cùng khớp. Không cần thao tác tay.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

## F. Unlink + syncDeletes (V1.6C)

### F1. Xoá block với syncDeletes TẮT (mặc định)
1. Footer Google Calendar → **tắt** checkbox "Xóa khung giờ cũng xóa sự kiện Google" (default).
2. Xoá 1 block đã export.
3. **Kỳ vọng:** block biến mất trong TaskFlow; **event Google vẫn tồn tại** (không bị xoá); không toast lỗi.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### F2. Xoá block với syncDeletes BẬT
1. Footer → **bật** checkbox "Xóa khung giờ cũng xóa sự kiện Google".
2. Xoá 1 block đã export khác.
3. **Kỳ vọng:** block biến mất; toast **"Đã xóa sự kiện Google"**; mở Google Calendar → event **đã bị xoá**.
4. Tắt lại checkbox sau khi test.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### F3. Xoá block chưa bao giờ export
1. Tạo block mới, KHÔNG export → xoá.
2. **Kỳ vọng:** không gọi API Google; không lỗi; không toast về Google.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### F4. Event đã bị xoá ở Google từ trước (404 graceful)
1. Export 1 block → xoá event đó thủ công trên Google → bật syncDeletes → xoá block trong TaskFlow.
2. **Kỳ vọng:** không crash; coi như xong (404 = event đã mất → no-op); mapping được dọn.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

## G. Ngắt kết nối

### G1. Disconnect
1. Footer → bấm **"Ngắt kết nối"**.
2. **Kỳ vọng:** toast **"Đã ngắt kết nối Google Calendar"**; footer về trạng thái chưa kết nối; Schedule view không còn hiển thị events Google; TimeBlocks TaskFlow vẫn nguyên vẹn.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

### G2. Disconnect → connect lại
1. Sau G1 → kết nối lại.
2. **Kỳ vọng:** phải consent lại từ đầu (read-only), events hiển thị lại bình thường; mapping export cũ **không** bị hiển thị sai (nếu mapping cũ mất, nút export xuất hiện lại — ghi nhận hành vi).

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú: __________

## H. Bảo mật / quyền riêng tư

- [ ] Consent OAuth read-only **không** yêu cầu scope ghi (A1)
- [ ] Scope ghi **chỉ** được yêu cầu sau khi user bấm export (C1)
- [ ] Không có dữ liệu Reflection/Mood nào gửi ra ngoài (chỉ gửi tiêu đề task + khung giờ khi export)
- [ ] Xoá block mặc định **không** xoá event Google (F1) — hành vi xoá phải chủ động bật
- [ ] Kiểm tra Google → "Tài khoản" → "App có quyền truy cập": chỉ có scope events.readonly (+ events nếu đã export)

## I. Kết quả tổng hợp

| Thiết bị | A. Connect | B. Đọc events | C. Write scope | D. Export | E. PATCH | F. Unlink/Delete | G. Disconnect | Kết luận |
|---|---|---|---|---|---|---|---|---|
| D1 Android Chrome/PWA |  |  |  |  |  |  |  | ☐ OK ☐ FAIL |
| D2 iPhone Safari/PWA |  |  |  |  |  |  |  | ☐ OK ☐ FAIL |
| D3 Desktop Chrome |  |  |  |  |  |  |  | ☐ OK ☐ FAIL |
| D4 Desktop Firefox |  |  |  |  |  |  |  | ☐ OK ☐ FAIL |

**Các lỗi gặp phải (nếu có):** __________

**Kết luận chung:** ☐ Sẵn sàng công bố rộng rãi ☐ Cần sửa trước khi công bố

---

*Checklist được sinh từ surface thật của code: routes `/api/calendar/connect|connect-write|callback|status|events|export|unlink|disconnect` (`server/gcal.js`), client `js/gcal.js` + `js/gcal-ui.js`, dispatcher `js/app.js` (actions `gcal-connect`, `gcal-refresh`, `gcal-disconnect`, `gcal-syncdeletes`, `gcal-export`).*
