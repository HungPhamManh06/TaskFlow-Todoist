// TaskFlow — Config constants (tách từ app.js trong P11 refactor, extraction 29).
// Gồm: HABIT_DEFS/GOAL_DEFS/WEEK_PATTERNS (seed data), REFLECT_PROMPTS_MONTH/WEEK.
// Ghi chú: DAYS trong app.js là dead code — day names thuộc js/i18n.js, đã xoá.
// REFLECT_PROMPTS_* gọi t() tại thời điểm GỌI — resolve qua global lexical (app.js),
// pattern mood.js. Module không phụ thuộc state app; data thuần, zero DOM.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowConfig = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const HABIT_DEFS = [
    ['Dậy lúc 5H sáng', 100],
    ['1H đọc sách', 100],
    ['Viết 1000 chữ', 100],
    ['Workout', 87],
    ['Thiền 1H', 100],
    ['Viết nhật ký', 100],
    ['Học Tiếng Anh', 77],
    ['Học Tiếng Trung', 42],
    ['Chạy bộ', 74],
    ['Uống đủ nước', 77],
  ];

  const GOAL_DEFS = [
    ['Hoàn thành 4 video youtube', 'priority', true],
    ['Hoàn thành 21 video ngắn', 'priority', true],
    ['Học xong khóa luyện phát âm TA', 'priority', true],
    ['Đọc 4 cuốn sách', 'priority', true],
    ['Tiết kiệm được 20 triệu', 'priority', true],
    ['Hoàn thành báo cáo công việc', 'priority', true],
    ['Thói quen viết đạt 100%', 'regular', true],
    ['Thói quen dậy sớm đạt 100%', 'regular', true],
    ['Gọi điện về nhà 4 lần', 'regular', true],
    ['Đi xem phim 1 lần', 'regular', false],
  ];

  const WEEK_PATTERNS = [
    {
      pcts: [100, 60, 100, 60, 60, 60, 0],
      goals: [
        ['Đọc xong 2 cuốn sách', 'priority', true],
        ['Chạy bộ 3 buổi', 'priority', true],
      ],
    },
    {
      pcts: [100, 100, 60, 60, 60, 100, 0],
      goals: [
        ['Hoàn thành 4 video youtube', 'priority', true],
        ['Học 1H tiếng Anh mỗi ngày', 'priority', true],
        ['Đi xem phim 1 lần', 'regular', false],
      ],
    },
    {
      pcts: [60, 0, 100, 60, 0, 60, 0],
      stickyDay: 2,
      stickyText: '📌 Nhớ chốt số liệu cuối tuần!',
      goals: [
        ['Workout 4 buổi', 'priority', true],
        ['Gọi điện về nhà', 'regular', false],
      ],
    },
    {
      pcts: [60, 100, 60, 0, 60, 0, 100],
      goals: [
        ['Tiết kiệm được 5 triệu', 'priority', true],
        ['Đọc 1 cuốn sách', 'regular', false],
      ],
    },
    {
      pcts: [100, 100, 100, 100, 100, 100, 100],
      goals: [
        ['Viết 1000 chữ mỗi ngày', 'priority', true],
        ['Thiền mỗi sáng', 'priority', true],
      ],
    },
    {
      pcts: [0, 0, 0, 0, 0, 0, 0],
      goals: [
        ['Hoàn thành khóa phát âm', 'priority', false],
        ['Chạy bộ 3 buổi', 'regular', false],
      ],
    },
  ];

  const REFLECT_PROMPTS_MONTH = () => [t('rm0'), t('rm1'), t('rm2'), t('rm3')];
  const REFLECT_PROMPTS_WEEK = () => [t('rm0'), t('rm1'), t('rm2'), t('rw3')];

  /* ==========================================================================
     NAV CONFIG — MỘT NGUỒN DUY NHẤT cho bottom nav mobile + More sheet.

     Thêm/bớt tab = sửa DUY NHẤT mảng dưới đây. Không phải sửa:
       • js/app.js   (buildNav render từ mảng này)
       • css/app-shell.css (số cột suy ra từ số con: grid-auto-flow: column)
       • tests/ + scripts/e2e-mobile-qa.py (đọc chính object này)

     Thứ tự phần tử = thứ tự trái→phải trên thanh. Vị trí FAB "Thêm việc" do vị trí
     slot { type: 'add' } trong mảng quyết định (đặt giữa để thanh đối xứng) — KHÔNG
     hardcode index ở CSS/JS/test.

     type:
       'view'   → tab điều hướng thật (data-nav-view), active do updateNav() quản
       'add'    → FAB "Thêm việc" (không phải tab, không bao giờ active)
       'action' → nút action (vd mở More sheet) — không bao giờ active kiểu "page"
     ========================================================================== */
  const MOBILE_NAV_SLOTS = [
    { type: 'view', view: 'today' },
    { type: 'view', view: 'upcoming' },
    { type: 'add' }, // FAB — giữ ở giữa để thanh đối xứng (2 | + | 2)
    { type: 'view', view: 'projects' },
    { type: 'action', action: 'more', icon: 'more', labelKey: 'moreNav', sheet: 'moreSheet' },
  ];

  // View nằm trong More sheet — thứ tự phần tử = thứ tự hàng trong sheet
  // (tần suất dùng giảm dần: Inbox vừa rời thanh chính nên hay dùng nhất,
  // Lịch dùng thường xuyên hơn Năm). Tổng số view bottom nav + sheet = đủ 8 view app.
  const MORE_SHEET_VIEWS = ['inbox', 'week', 'overview', 'calendar', 'year'];

  return {
    HABIT_DEFS, GOAL_DEFS, WEEK_PATTERNS, REFLECT_PROMPTS_MONTH, REFLECT_PROMPTS_WEEK,
    MOBILE_NAV_SLOTS, MORE_SHEET_VIEWS,
  };
});
