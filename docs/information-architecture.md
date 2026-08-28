# TaskFlow Information Architecture

## Primary Navigation (Desktop Sidebar)

### Direct access (no group label)
- **Hôm nay** → execution focus, tasks for today
- **Inbox** → quick capture, unprocessed items
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

## Mobile Bottom Navigation (5+1)
1. Hôm nay
2. Inbox
3. Sắp tới
4. + (FAB — Quick Add)
5. Dự án
6. Khác (More sheet)

### More Sheet Groups
- **Điều hướng**: Tuần, Tổng quan, Năm, Lịch
- **Công cụ**: Tập trung, Trợ lý TaskFlow, Báo cáo, Pomodoro
- **Hệ thống**: Cài đặt

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
