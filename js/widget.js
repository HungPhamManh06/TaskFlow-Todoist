// TaskFlow — Widget config + bootstrap glue (tách từ app.js trong P11 refactor, extraction 31).
// Gồm R4: widgetConfigKey/initWidgetConfig/saveWidgetConfig/getVisibleWidgets (cấu hình widget
// overview/year theo view), và R5: setLang/setTheme/prefersReducedMotion/registerSW (glue
// bootstrap: i18n, theme, PWA).
// LƯU Ý coupling: module này KHÔNG sở hữu state app; resolve dependencies qua global lexical
// tại thời điểm GỌI — pattern mood.js/popups.js:
//   WIDGET_DEFS_OVERVIEW/WIDGET_DEFS_YEAR, t, state, monthlyStats/yearGoalStats, THEME/THEMES,
//   setLangCore/applyStaticI18N, applySidebarCollapse, setSyncMode/syncMode, updateBrand,
//   PLAN_YEAR/PLAN_MONTH, buildNav, render*, updateNav, renderXP, save, window.Sync
// Đều nằm trong global lexical của app.js (script load sau) hoặc window — resolve runtime.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowWidget = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ============================ Widget config (R4) ============================ */

  function widgetConfigKey(view) { return 'planner-widgets-' + view; }

  function initWidgetConfig(view) {
    const defs = view === 'year' ? WIDGET_DEFS_YEAR : WIDGET_DEFS_OVERVIEW;
    try {
      const raw = localStorage.getItem(widgetConfigKey(view));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Validate: giữ lại các widget hợp lệ, bỏ widget cũ không còn trong defs
          const validIds = new Set(defs.map(function (d) { return d.id; }));
          var cleaned = parsed.filter(function (w) { return validIds.has(w.id); });
          // Thêm widget mới (nếu chưa có trong config)
          var existingIds = new Set(cleaned.map(function (w) { return w.id; }));
          defs.forEach(function (d) {
            if (!existingIds.has(d.id)) {
              cleaned.push({ id: d.id, visible: true, order: cleaned.length });
            }
          });
          return cleaned;
        }
      }
    } catch (e) { /* ẩn */ }
    // Fallback: hiện tất cả, thứ tự mặc định
    return defs.map(function (d, i) { return { id: d.id, visible: true, order: i }; });
  }

  function saveWidgetConfig(view, config) {
    try { localStorage.setItem(widgetConfigKey(view), JSON.stringify(config)); } catch (e) { /* ẩn */ }
    if (window.Sync) window.Sync.push(widgetConfigKey(view));
  }

  function getVisibleWidgets(view) {
    const defs = view === 'year' ? WIDGET_DEFS_YEAR : WIDGET_DEFS_OVERVIEW;
    const config = initWidgetConfig(view);
    var sorted = config.slice().sort(function (a, b) { return a.order - b.order; });
    var map = {};
    defs.forEach(function (d) { map[d.id] = d; });
    return sorted
      .filter(function (w) { return w.visible && map[w.id]; })
      .map(function (w) {
        var def = map[w.id];
        // Một số widget cần stats (goalsPanelHTML nhận monthStats, yearGoalsCardHTML nhận
        // yearGoalStats) — truyền đúng tham số, tránh TypeError "reading 'pct'".
        var stats = view === 'year' ? yearGoalStats() : monthlyStats(state);
        return { id: w.id, html: def.render(stats), label: t(def.labelKey) };
      });
  }

  /* ============================ Bootstrap glue (R5) ============================ */

  function setLang(l) {
    setLangCore(l);
    if (window.Sync) window.Sync.push('planner-lang');
    applyStaticI18N();
    applySidebarCollapse();
    setSyncMode(syncMode);
    updateBrand(PLAN_YEAR, PLAN_MONTH);
    buildNav();
    if (state.view === 'today') renderToday();
    else if (state.view === 'overview') renderOverview();
    else if (state.view === 'week') renderWeek();
    else if (state.view === 'day') renderDay();
    else if (state.view === 'calendar') renderCalendar();
    else renderYear();
    updateNav();
    renderXP();
    save();
  }

  function setTheme(th) {
    if (!THEMES.includes(th)) th = 'cream';
    THEME = th;
    try { localStorage.setItem('planner-theme', th); } catch (e) { /* ẩn */ }
    if (window.Sync) window.Sync.push('planner-theme');
    document.documentElement.dataset.theme = th;
    document.querySelectorAll('.theme-dot').forEach((d) => d.classList.toggle('active', d.dataset.theme === th));
  }

  function prefersReducedMotion(matchMedia = window.matchMedia) {
    return Boolean(matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* ẩn */ });
    });
  }

  return { widgetConfigKey, initWidgetConfig, saveWidgetConfig, getVisibleWidgets, setLang, setTheme, prefersReducedMotion, registerSW };
});
