# TaskFlow Information Architecture

## Primary Navigation (Desktop Sidebar)

### Direct access (no group label)
- **Hôm nay** → execution focus, tasks for today
- **Inbox** → quick capture, unprocessed items (mobile: More sheet)
- **Sắp tới** → upcoming tasks in next 7/14/30 days

### Kế hoạch (Plan)
- **Tuần** → weekly planning view
- **Lịch** → calendar month + schedule
- **Dự án** → project management

### Theo dõi (Track)
- **Tổng quan** → monthly overview / dashboard
- **Năm** → yearly goals & planning
- Thói quen (action) → habit tracking
- Tập trung (action) → focus mode
- Báo cáo (action) → reports

## Mobile Bottom Navigation (5 slots)
1. Hôm nay
2. Sắp tới
3. + (FAB — Quick Add, **slot giữa**: thanh đối xứng 2 | + | 2)
4. Dự án
5. Thêm (More sheet)

**Nguồn duy nhất = `MOBILE_NAV_SLOTS` trong `js/config.js`.** Thứ tự phần tử trong mảng là thứ tự trái→phải trên thanh; vị trí FAB là vị trí slot `{ type: 'add' }` (không hardcode index ở đâu cả). Thêm/bớt tab = sửa **duy nhất** mảng đó:
- `js/app.js` render thuần bằng `MOBILE_NAV_SLOTS.map(slotHTML)`;
- `css/app-shell.css` không biết con số cụ thể (`grid-auto-flow: column` + `grid-auto-columns`);
- `tests/` và `scripts/e2e-mobile-qa.py` đọc chính object này (e2e so DOM với `window.TaskFlowConfig.MOBILE_NAV_SLOTS`).

Ba loại slot: `view` (tab thật, `data-nav-view`), `add` (FAB — không bao giờ active), `action` (nút mở sheet/overlay, khai báo `sheet` nếu cần `aria-controls`).
Ràng buộc được test khoá: đúng một slot `add`, số slot LẺ và slot `add` ở chính giữa (thanh đối xứng), mọi slot phải nằm trong viewport ở mọi viewport mobile.

Inbox không còn tab riêng trên mobile (chuyển vào More sheet 2026-09-22); desktop vẫn có tab Inbox trực tiếp ở sidebar.

### More Sheet Groups (xếp theo tần suất dùng giảm dần)
- **Điều hướng**: Inbox (kèm badge số việc chưa xử lý), Tuần, Tổng quan, Lịch, Năm
- **Công cụ**: Thói quen, Tập trung, Pomodoro, Trợ lý TaskFlow, Báo cáo
- **Hệ thống**: Cài đặt

Thứ tự nhóm Điều hướng = `MORE_SHEET_VIEWS` trong `js/config.js` (cùng chỗ với `MOBILE_NAV_SLOTS`; Inbox hay dùng nhất vì vừa rời thanh chính, Lịch dùng thường xuyên hơn Năm). Badge Inbox = số item có `done !== true`, cập nhật khi mở sheet (`updateInboxBadge`), ẩn khi bằng 0.

**Thói quen** trong nhóm Công cụ là shortcut (không phải view): nó mở Tổng quan rồi cuộn tới widget habits — đúng thứ sidebar desktop có ở nhóm "Theo dõi". Trước 2026-09-22 trên điện thoại không có entry nào cho thói quen, phải mở Tổng quan rồi tìm widget.

## Breakpoints — bề mặt nào dùng cho thiết bị nào

Nguồn chuẩn: `@media (max-width: 767px)` trong `css/app-shell.css` (hằng số `MOBILE_MAX = 767` trong `scripts/e2e-mobile-qa.py`).

| Width | Sidebar desktop | Bottom nav 5 slot | More sheet |
|---|---|---|---|
| ≤ 767px (điện thoại dọc) | ẩn | hiện (fixed đáy) | mở từ nút "Thêm" |
| 768 – 1180px (tablet, laptop nhỏ) | hiện (200px, thu gọn được) | ẩn | **không mở được** (không có trigger nào hiện) |
| > 1180px | hiện (236px) | ẩn | không mở được |

Hệ quả cần nhớ khi sửa nav:
- More sheet là bề mặt **chỉ-mobile**. Ở ≥768px nút mở sheet không được render (nhánh `if (mobile)` của `buildNav`), nên mọi view/shortcut trong sheet PHẢI cũng có trong sidebar — bất biến này được khoá bởi `tests/nav-surface-parity.test.mjs`.
- Điện thoại **nằm ngang** (vd 844×390) rộng > 767px nên rơi vào layout sidebar: thanh bottom nav biến mất và sidebar phải cuộn (nội dung ~929px). Đây là hành vi đã có từ trước, không phải hệ quả của việc đưa Inbox vào sheet.
- Ở tablet nằm ngang (1024×768) nhóm phụ của sidebar (Cài đặt / Tài khoản / Trang giới thiệu / Thu gọn) nằm dưới màn hình → phải cuộn sidebar; đường tắt khác cho Cài đặt là nút công cụ trên topbar (`.app-tools-trigger`, hiện ở ≥768px).
- "Tài khoản" (profile-open) chỉ có ở sidebar + trong drawer Cài đặt; trên điện thoại vào qua Cài đặt.

## Tools Drawer
- **Lập kế hoạch**: Month nav, Undo/Redo, Stats, Templates
- **Nhắc việc và dữ liệu**: Reminders, Backup/Import/Export, Sync
- **Giao diện**: Theme, Dark mode, Language

## Mental Model: Capture → Plan → Do → Review

| Phase | Features |
|-------|----------|
| CAPTURE | Inbox, Quick Add |
| PLAN | Week, Calendar, Projects, Upcoming |
| DO | Today, Focus |
| REVIEW | Overview, Reports, Reflection, Goals |

AI ("Trợ lý TaskFlow") is contextual assistant across all phases.

## Deep Links (preserved)
- `?view=today`
- `?view=week`
- `?view=inbox`
- `?view=upcoming`
- `?view=overview`
- `?view=year`
- `?view=calendar`
- `?view=projects`
