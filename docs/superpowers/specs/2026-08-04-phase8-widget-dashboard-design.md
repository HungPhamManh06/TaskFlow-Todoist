# Phase 8 — Widget Dashboard System Design

- Ngày: 2026-08-04
- Trạng thái: Design draft

## Bối cảnh

TaskFlow-Todoist hiện có 4 views cứng với layout cố định. Overview (tháng) và Year view có nhiều card nhưng người dùng không thể tuỳ chỉnh — không thể ẩn card không cần, không thể sắp xếp lại thứ tự. Phase 8 thêm cơ chế widget system để người dùng bật/tắt và sắp xếp các card trong view.

## Mục tiêu

- Cho phép bật/tắt từng card/widget trong Overview và Year view
- Cho phép kéo-thả sắp xếp thứ tự widget
- Lưu cấu hình vào localStorage
- Tương thích ngược: không có config → hiện tất cả theo thứ tự mặc định

## Kiến trúc

### Config Storage

- Key: `planner-widgets-overview` cho Overview, `planner-widgets-year` cho Year
- Giá trị: JSON array `[{ id, visible, order }]`
- Migration: `loadWidgetConfig(view)` trả về config hoặc null; `initWidgetConfig(view)` tạo mặc định nếu chưa có

```js
// Cấu trúc config mẫu
[
  { id: 'goals', visible: true, order: 0 },
  { id: 'habits', visible: true, order: 1 },
  { id: 'streak-heatmap', visible: true, order: 2 },
  { id: 'mood', visible: true, order: 3 },
  { id: 'weekly-chart', visible: true, order: 4 },
  { id: 'date-card', visible: true, order: 5 },
  { id: 'scene-card', visible: true, order: 6 },
  { id: 'badges', visible: true, order: 7 },
]
```

### Widget Registry

Mỗi widget có id, tên hiển thị (i18n), icon, và hàm render.

```js
const WIDGETS_OVERVIEW = [
  { id: 'date-card',       nameKey: 'widgetDateCard',       icon: '📅', render: (ms) => dateCardHTML() },
  { id: 'weekly-chart',    nameKey: 'widgetWeeklyChart',    icon: '📊', render: (ms) => weeklyChartHTML() },
  { id: 'scene-card',      nameKey: 'widgetSceneCard',      icon: '🐥', render: (ms) => sceneCardHTML() },
  { id: 'goals',           nameKey: 'widgetGoals',          icon: '🎯', render: (ms) => goalsPanelHTML(ms) },
  { id: 'habits',          nameKey: 'widgetHabits',         icon: '✅', render: (ms) => habitPanelHTML() },
  { id: 'streak-heatmap',  nameKey: 'widgetStreakHeatmap',  icon: '🔥', render: (ms) => habitHeatCardHTML() },
  { id: 'mood',            nameKey: 'widgetMood',           icon: '😊', render: (ms) => moodCardHTML() },
  { id: 'badges',          nameKey: 'widgetBadges',         icon: '🏅', render: (ms) => badgePanelHTML() },
];

const WIDGETS_YEAR = [
  { id: 'year-dashboard',      nameKey: 'widgetYearDashboard',      icon: '📊', render: (gs) => yearDashboardHTML() },
  { id: 'year-card',           nameKey: 'widgetYearCard',           icon: '📅', render: (gs) => yearCardHTML() },
  { id: 'year-charts',         nameKey: 'widgetYearCharts',         icon: '📈', render: (gs) => yearChartsHTML() },
  { id: 'year-goals',           nameKey: 'widgetYearGoals',          icon: '🎯', render: (gs) => yearGoalsCardHTML(gs) },
  { id: 'year-overview-ref',   nameKey: 'widgetYearOverviewRef',    icon: '📝', render: (gs) => yearOverviewReflectionHTML() },
  { id: 'year-quarters',       nameKey: 'widgetYearQuarters',       icon: '🔢', render: (gs) => yearQuartersHTML() },
  { id: 'year-months',         nameKey: 'widgetYearMonths',         icon: '📆', render: (gs) => yearMonthsHTML() },
  { id: 'year-reflections',    nameKey: 'widgetYearReflections',    icon: '💭', render: (gs) => yearReflectionsHTML() },
  { id: 'year-heatmap',        nameKey: 'widgetYearHeatmap',        icon: '🔥', render: (gs) => yearHabitHeatmapHTML() },
];
```

### Render logic

Thay vì `renderOverview()` gọi cứng từng hàm, nó đọc config, lọc widget visible, sắp xếp theo order, render theo thứ tự:

```js
function renderOverview() {
  const el = document.getElementById('ov-content');
  const ms = monthlyStats();
  evaluateMonthBadges();
  const config = loadWidgetConfig('overview');
  const widgets = (config || WIDGETS_OVERVIEW.map((w, i) => ({ id: w.id, visible: true, order: i })))
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order);
  el.innerHTML = `
    <div class="ov-top">
      <div class="ov-toolbar">
        <button type="button" class="pop-btn" data-action="widget-settings" data-view="overview" title="${t('widgetSettings')}">⚙️ ${t('widgetSettings')}</button>
      </div>
    </div>
    ${widgets.map((c) => {
      const w = WIDGETS_OVERVIEW.find((x) => x.id === c.id);
      return w ? w.render(ms) : '';
    }).join('')}
  `;
}
```

Tương tự cho `renderYear()`.

### Modal Widget Settings

- Nút ⚙️ trong ov-toolbar và year-banner → `data-action="widget-settings" data-view="overview"|"year"`
- `openWidgetSettingsModal(view)` → render modal với lưới widget
- Mỗi widget: drag handle 🟰 + icon + tên + toggle switch (checkbox)
- Kéo thả để sắp xếp (HTML5 drag & drop, dùng pattern có sẵn)
- Nút "Đặt lại mặc định" + "Đóng"
- Lưu → đóng modal → re-render view + pushUndo

### Data flow

```
renderOverview()
  → loadWidgetConfig('overview')  // localStorage
  → filter visible + sort by order
  → render từng widget theo thứ tự

openWidgetSettingsModal('overview')
  → render modal với config hiện tại
  → user toggle / drag reorder
  → saveWidgetConfig('overview', newConfig)
  → renderOverview()
```

### Các hàm cần thêm (app.js)

| Hàm | Mô tả |
|---|---|
| `loadWidgetConfig(view)` | Đọc config từ localStorage, trả về array hoặc null |
| `saveWidgetConfig(view, config)` | Lưu config vào localStorage + Sync |
| `initWidgetConfig(view)` | Tạo config mặc định (nếu chưa có) |
| `openWidgetSettingsModal(view)` | Mở modal settings |
| `closeWidgetSettingsModal()` | Đóng modal |
| `renderWidgetSettingsModal(view)` | Render nội dung modal |
| `widgetDragStart(e)` / `widgetDragOver(e)` / `widgetDrop(e)` | Kéo thả widget trong modal |

### CSS

```css
/* Modal widget grid */
.widget-grid { display: flex; flex-direction: column; gap: 6px; }
.widget-grid-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--surface); border-radius: 8px; cursor: grab; }
.widget-grid-item:active { cursor: grabbing; }
.widget-grid-item .widget-drag-handle { cursor: grab; font-size: 16px; color: var(--ink-soft); }
.widget-grid-item .widget-icon { font-size: 20px; }
.widget-grid-item .widget-name { flex: 1; font-size: 13px; font-weight: 600; }
.widget-grid-item .widget-toggle { margin-left: auto; }
.widget-grid-item.dragging { opacity: .5; }
.widget-grid-item.drag-over { border: 2px dashed var(--terracotta); }

/* Toolbar */
.ov-toolbar, .year-toolbar { display: flex; justify-content: flex-end; margin-bottom: 8px; }
```

### i18n keys

vi: `widgetSettings: '⚙️ Tuỳ chỉnh widget'`, `widgetReset: 'Đặt lại mặc định'`, `widgetDateCard: 'Thẻ ngày'`, `widgetWeeklyChart: 'Biểu đồ tuần'`, `widgetSceneCard: 'Cảnh'`, `widgetGoals: 'Mục tiêu tháng'`, `widgetHabits: 'Thói quen'`, `widgetStreakHeatmap: 'Streak & Heatmap'`, `widgetMood: 'Tâm trạng'`, `widgetBadges: 'Huy hiệu'`, `widgetYearDashboard: 'Dashboard năm'`, `widgetYearCard: 'Thẻ năm'`, `widgetYearCharts: 'Biểu đồ năm'`, `widgetYearGoals: 'Mục tiêu năm'`, `widgetYearOverviewRef: 'Tổng quan năm'`, `widgetYearQuarters: 'Quý'`, `widgetYearMonths: 'Tháng'`, `widgetYearReflections: 'Phản ánh năm'`, `widgetYearHeatmap: 'Heatmap năm'`

en: `widgetSettings: '⚙️ Widget settings'`, `widgetReset: 'Reset to default'`, `widgetDateCard: 'Date card'`, `widgetWeeklyChart: 'Weekly chart'`, `widgetSceneCard: 'Scene'`, `widgetGoals: 'Monthly goals'`, `widgetHabits: 'Habits'`, `widgetStreakHeatmap: 'Streak & Heatmap'`, `widgetMood: 'Mood'`, `widgetBadges: 'Badges'`, `widgetYearDashboard: 'Year dashboard'`, `widgetYearCard: 'Year card'`, `widgetYearCharts: 'Year charts'`, `widgetYearGoals: 'Year goals'`, `widgetYearOverviewRef: 'Year overview'`, `widgetYearQuarters: 'Quarters'`, `widgetYearMonths: 'Months'`, `widgetYearReflections: 'Year reflections'`, `widgetYearHeatmap: 'Year heatmap'`

### Test

Test textual trong `tests/phase5.test.mjs`:

```js
test('8.1: widget settings modal + toggle', () => {
  assert.match(APP_JS, /data-action="widget-settings"/);
  assert.match(APP_JS, /function openWidgetSettingsModal\\(\\)/);
  assert.match(APP_JS, /function saveWidgetConfig\\(\\)/);
  assert.match(APP_JS, /loadWidgetConfig/);
  assert.match(APP_JS, /WIDGETS_OVERVIEW/);
  assert.match(APP_JS, /WIDGETS_YEAR/);
  assert.match(APP_HTML, /id="widgetSettingsModal"/);
});
```

### YAGNI

- Không làm widget cho Week và Calendar view (ít card)
- Không làm widget mới (chỉ bọc card hiện có)
- Không làm widget cho bên thứ 3
- Không real-time sync widget config
- Không multi-user dashboard

## Các bước triển khai

1. Định nghĩa WIDGETS_OVERVIEW + WIDGETS_YEAR registry
2. loadWidgetConfig / saveWidgetConfig / initWidgetConfig
3. Sửa renderOverview() dùng config
4. Sửa renderYear() dùng config
5. Modal widget settings (open, render, close)
6. Kéo-thả widget trong modal
7. CSS modal + toolbar
8. i18n vi + en
9. Test textual
10. Bump version + chạy test