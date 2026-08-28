# TaskFlow Content Design

## Terminology

| English | Vietnamese | Notes |
|---------|-----------|-------|
| Task | Công việc | Primary user-facing term |
| Project | Dự án | |
| Milestone | Mốc | Short for milestone |
| Metric | Chỉ số | Monthly metric |
| AI | Trợ lý TaskFlow | Never "AI Chat" or "Trợ lý học tập" in user-facing text |
| Focus | Tập trung | |
| Reflection | Phản hồi | |
| Report | Báo cáo | |
| Habit | Thói quen | |
| Goal | Mục tiêu | |
| Template | Cấu trúc tháng | |

## Button Naming

| Action | Label |
|--------|-------|
| Add task | Thêm công việc |
| Complete task | (checkbox, no text) |
| Delete | Xoá |
| Undo | Hoàn tác |
| Redo | Làm lại |
| Search | Tìm kiếm |
| Settings | Cài đặt |
| More | Khác |

## Empty State Tone

- Friendly, not clinical
- One sentence + one CTA
- Example: "Hôm nay chưa có công việc." → [Thêm công việc]
- Never: "Không có dữ liệu."

## AI Naming Rules

Use ONE name: "Trợ lý TaskFlow"

In code: `TaskFlowChat`, `ai-agent-runtime` etc. are fine.
In UI text: always "Trợ lý TaskFlow"

Replace any occurrence of:
- "Trợ lý học tập"
- "AI Chat"
- "TaskFlow AI"
when referring to the same feature.
