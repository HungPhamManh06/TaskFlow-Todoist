# Phase 8 — Widget Dashboard System

- **Ngày:** 2026-08-04
- **Trạng thái:** Đã duyệt spec → Đang lên kế hoạch triển khai
- **Spec:** `docs/superpowers/specs/2026-08-04-phase8-widget-dashboard-design.md`
- **Tổng quan:** Biến card trong Overview (tháng) và Year view thành widget có thể bật/tắt & sắp xếp qua modal settings.

---

## Kiến trúc

### Config storage

- **Key:** `planner-widgets-overview` và `planner-widgets-year`
- **Dạng:** `[{ id: 'goals', visible: true, order: 0 }, ...]`
- **Fallback:** nếu không có config → hiện tất cả, thứ tự mặc định (theo thứ tự trong renderOverview/renderYear)

### Widget IDs

**Overview (tháng):**

| ID | Hàm render | CSS class |
|---|---|---|
| `date-card` | `dateCardHTML()` | `.date-card` |
| `weekly-chart` | `weeklyChartHTML()` | `.chart-card` |
| `scene-card` | `sceneCardHTML()` | `.scene-card` |
| `goals` | `goalsPanelHTML(ms)` | `.goals-panel` |
| `habits` | `habitPanelHTML()` | `.habits-panel` |
| `streak-heatmap` | `habitHeatCardHTML()` | `.heat-card` |
| `mood` | `moodCardHTML()` | `.mood-card` |
| `badges` | `badgePanelHTML()` | `.badges-panel` |

**Year view:**

| ID | Hàm render | CSS class |
|---|---|---|
| `year-dashboard` | `yearDashboardHTML()` | `.year-dash-card` |
| `year-card` | `yearCardHTML()` | `.year-card` |
| `year-charts` | `yearChartsHTML()` | `.year-charts-card` |
| `year-goals` | `yearGoalsCardHTML(gs)` | `.year-goals-card` |
| `year-overview-ref` | `yearOverviewReflectionHTML()` | `.year-overview-ref-card` |
| `year-quarters` | `yearQuartersHTML()` | `.year-quarters-card` |
| `year-months` | `yearMonthsHTML()` | `.year-months-card` |
| `year-reflections` | `yearReflectionsHTML()` | `.year-reflections-card` |
| `year-heatmap` | `yearHabitHeatmapHTML()` | `.year-heat-card` |

---

## Các bước triển khai

### 8.1 — Init widget config & helpers (js/app.js)

- `WIDGET_DEFS_OVERVIEW` — mảng định nghĩa widget overview
- `WIDGET_DEFS_YEAR` — mảng định nghĩa widget year
- `initWidgetConfig(view)` — đọc từ localStorage, fallback default
- `saveWidgetConfig(view, config)` — lưu
- `getVisibleWidgets(view)` — trả về mảng widget đã lọc + sắp xếp

**Mỗi định nghĩa:** `{ id, render: renderFn, label: t(key), cssClass: 'card ...' }`

### 8.2 — Sửa renderOverview (js/app.js)

Thay vì hardcode thứ tự:

```js
function renderOverview() {
  const el = document.getElementById('ov-content');
  const ms = monthlyStats();
  evaluateMonthBadges();
  const widgets = getVisibleWidgets('overview');
  el.innerHTML = `
    <div class="ov-top">${widgets.filter(w => w.id === 'date-card' || w.id === 'weekly-chart' || w.id === 'scene-card').map(w => w.render(ms)).join('')}</div>
    ${widgets.filter(w => w.id !== 'date-card' && w.id !== 'weekly-chart' && w.id !== 'scene-card').map(w => w.render(ms)).join('')}
    <button type="button" class="pop-btn widget-settings-btn" data-action="widget-settings" data-view="overview" title="${t('widgetSettings')}">⚙️ ${t('widgetSettings')}</button>
  `;
}
```

**Lưu ý:** `ov-top` grid chỉ dành cho 3 card đầu (date-card, weekly-chart, scene-card). Các card còn lại nằm riêng lẻ.

### 8.3 — Sửa renderYear (js/app.js)

```js
function renderYear() {
  invalidateYearCache();
  const el = document.getElementById('view-year');
  const gs = yearGoalStats();
  const widgets = getVisibleWidgets('year');
  el.innerHTML = `
    <div class="year-banner">
      <h2 class="year-banner-title">${t('yGoalsTitle', { y: PLAN_YEAR })}</h2>
      <button type="button" class="pop-btn share-btn week-report-btn" data-action="year-report" title="${t('yearReportTitle')}">📊 ${t('yearReportTitle')}</button>
    </div>
    ${widgets.map(w => w.render(gs)).join('')}
    <button type="button" class="pop-btn widget-settings-btn" data-action="widget-settings" data-view="year" title="${t('widgetSettings')}">⚙️ ${t('widgetSettings')}</button>
  `;
}
```

### 8.4 — Modal Widget Settings (js/app.js)

- `openWidgetSettingsModal(view)`
- `renderWidgetSettingsModal(view)` — lưới widget với toggle + drag handle
- Modal HTML thêm vào app.html (ẩn, mở bằng data-action="widget-settings")
- Nút toggle: data-action="widget-toggle" aria-checked
- Kéo thả sắp xếp: HTML5 drag & drop trên các hàng widget

### 8.5 — Modal HTML (app.html)

Thêm section modal:

```html
<div class="widget-modal" id="widgetSettingsModal" hidden>
  <div class="widget-modal-card" role="dialog" aria-modal="true" aria-label="Widget settings">
    <button type="button" class="sync-close" data-action="widget-close" aria-label="Đóng">✕</button>
    <h3 class="sync-modal-title">⚙️ <span data-i18n="widgetSettings">Tuỳ chỉnh Widget</span></h3>
    <div id="widgetList" class="widget-list"></div>
    <div class="sync-actions">
      <button type="button" class="pop-btn primary" data-action="widget-save" data-i18n="widgetSave">Lưu</button>
    </div>
  </div>
</div>
```

### 8.6 — CSS (styles.css)

- `.widget-settings-btn` — nút settings ở cuối view
- `.widget-modal` / `.widget-modal-card` — modal overlay
- `.widget-list` — grid layout cho widget items
- `.widget-item` — mỗi widget row: drag handle + name + toggle
- `.widget-handle` — drag handle 🟰
- `.widget-toggle` — toggle on/off

### 8.7 — Click handler (js/app.js)

- `data-action="widget-settings"` → `openWidgetSettingsModal(view)`
- `data-action="widget-toggle"` → toggle visible
- `data-action="widget-save"` → save config + re-render view
- `data-action="widget-close"` → close modal
- Drag & drop reorder: sử dụng pattern có sẵn (HTML5 drag&drop như task/goal reorder)

### 8.8 — i18n keys (js/app.js)

Thêm vào I18N (vi + en):

| Key | vi | en |
|---|---|---|
| `widgetSettings` | `Tuỳ chỉnh Widget` | `Customize Widgets` |
| `widgetSave` | `Lưu` | `Save` |
| `widgetLabel_date-card` | `Ngày tháng` | `Date card` |
| `widgetLabel_weekly-chart` | `Tiến độ tuần` | `Weekly progress` |
| `widgetLabel_scene-card` | `Cảnh vật` | `Scene` |
| `widgetLabel_goals` | `Mục tiêu tháng` | `Monthly goals` |
| `widgetLabel_habits` | `Thói quen` | `Habits` |
| `widgetLabel_streak-heatmap` | `Streak & Heatmap` | `Streak & Heatmap` |
| `widgetLabel_mood` | `Tâm trạng` | `Mood` |
| `widgetLabel_badges` | `Huy hiệu` | `Badges` |
| `widgetLabel_year-dashboard` | `Dashboard` | `Dashboard` |
| `widgetLabel_year-card` | `Thông tin năm` | `Year info` |
| `widgetLabel_year-charts` | `Biểu đồ 12 tháng` | `12-month chart` |
| `widgetLabel_year-goals` | `Mục tiêu năm` | `Year goals` |
| `widgetLabel_year-overview-ref` | `Tổng quan năm` | `Year overview` |
| `widgetLabel_year-quarters` | `Quý` | `Quarters` |
| `widgetLabel_year-months` | `12 tháng` | `12 months` |
| `widgetLabel_year-reflections` | `Phản ánh quý` | `Quarterly reflections` |
| `widgetLabel_year-heatmap` | `Habit Heatmap` | `Habit Heatmap` |

### 8.9 — Tests (tests/phase5.test.mjs)

- Textual test: app.js chứa `WIDGET_DEFS_OVERVIEW`, `WIDGET_DEFS_YEAR`, `initWidgetConfig`, `getVisibleWidgets`, `openWidgetSettingsModal`, `data-action="widget-settings"`
- i18n: `widgetSettings` + tất cả `widgetLabel_*` keys vi+en
- Version bumps: app.js, styles.css, sw cache

### 8.10 — Bump versions

- `app.html`: `js/app.js?v=49` → `v50`
- `css/styles.css?v=50` → `v51`
- `sw.js`: `CACHE = 'taskflow-v43'` → `v44`

---

## Files chạm

| File | Task |
|---|---|
| `js/app.js` | 8.1, 8.2, 8.3, 8.4, 8.7, 8.8 |
| `app.html` | 8.5 |
| `css/styles.css` | 8.6 |
| `tests/phase5.test.mjs` | 8.9 |
| `sw.js` | 8.10 |

---

## Thứ tự triển khai

1. **8.1** — Init widget config + helpers (WIDGET_DEFS, initWidgetConfig, getVisibleWidgets)
2. **8.2** — Sửa renderOverview
3. **8.3** — Sửa renderYear
4. **8.4** — Modal widget settings (openWidgetSettingsModal, renderWidgetSettingsModal, drag reorder)
5. **8.5** — Modal HTML
6. **8.6** — CSS
7. **8.7** — Click handler
8. **8.8** — i18n keys
9. **8.9** — Tests
10. **8.10** — Bump versions

---

## Edge cases & lưu ý

- `ov-top` grid chỉ có 3 cột → cần giữ nguyên 3 card đầu trong grid, các card còn lại bên ngoài
- `renderYear` hiện có `year-top` grid (year-card + year-charts) → cần xử lý tương tự
- Config mặc định: hiện tất cả, thứ tự như hiện tại → không breaking change
- Khi toggle widget ẩn → re-render view, không mất state
- Drag reorder trong modal: dùng HTML5 drag&drop pattern có sẵn (dragState, dragover, drop)
- saveWidgetConfig gọi save() + Sync.push