// TaskFlow — Monthly Life Pillars (P2+P3: template 3 trụ cột + CRUD + Monthly Focus
// + Monthly Metrics).
// Dữ liệu: state.pillars = [{ id, name, icon, hidden, focus, metrics }] — additive
// trong month state (planner-YYYY-M). Dữ liệu cũ không có pillars → migration additive
// tự điền template mặc định (ensurePillars); dữ liệu cũ không bị mất, không đổi schema
// khác. metric: { id, title, type: HABIT|MANUAL|CUSTOM, linkedHabitId, target:
// { mode: daily|perWeek|perMonth|custom, value }, days: [bool × ngày trong tháng] }.
// Progress: HABIT đếm ngày habit đã tick trong tháng (skipDays không tính là done);
// MANUAL/CUSTOM đếm ô ngày tự đánh dấu. Target tính theo day-count THẬT của tháng
// (28/29/30/31 — không hard-code 30): daily → số ngày trong tháng; perWeek →
// ceil(v × ngày/7); perMonth/custom → v.
//
// LƯU Ý coupling: module KHÔNG sở hữu state app — các hàm nhận `state` qua tham số
// (pattern goals.js/inbox.js). t/esc/TaskFlowUI/emptyStateHTML resolve qua global
// lexical tại thời điểm GỌI (pattern mood.js/popups.js — app.js nạp sau module, mọi
// hàm đụng t/esc chỉ chạy sau khi app.js đã load).
//
// Phần PURE (defaultTemplate, ensurePillars, normalizePillar, upsertPillar,
// removePillar, togglePillarHidden, resetPillars, setFocus, visiblePillars,
// pillarById) unit-test được trong Node — defaultTemplate/ensurePillars/resetPillars
// nhận translator `tt` tuỳ chọn (mặc định resolve t global).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowPillars = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Palette icon mặc định (user có thể chọn icon khác khi sửa/thêm trụ cột).
  // Sprite icons từ icons/ui-sprite.svg (stroke 1.8, rounded line) — không còn emoji.
  const ICONS = ['heart-pulse', 'target', 'users', 'home', 'book', 'sprout',
    'moon', 'rocket', 'bolt', 'briefcase', 'palette', 'brain',
    'sparkles', 'sunrise', 'sun', 'clock'];

  // Migration: dữ liệu pillar cũ (trước khi chuyển sprite) lưu emoji → sprite
  // tương đương. Chỉ map emoji đã từng nằm trong palette; icon lạ (custom) giữ
  // nguyên — không mất dữ liệu, không phá dữ liệu cloud cũ.
  const EMOJI_TO_ICON = {
    '💪': 'heart-pulse', '🎯': 'target', '🤝': 'users', '🏠': 'home',
    '📚': 'book', '🧘': 'sprout', '🚀': 'rocket', '🏃': 'bolt',
    '💼': 'briefcase', '🎨': 'palette', '🥗': 'sprout', '💤': 'moon',
    '⚡': 'bolt', '🧠': 'brain', '🌱': 'sprout', '❤️': 'heart-pulse',
  };

  // Emoji cũ → sprite tương đương; giá trị khác (custom) giữ nguyên.
  function migrateIcon(icon) {
    if (typeof icon !== 'string' || !icon) return icon;
    return EMOJI_TO_ICON[icon] || icon;
  }

  // Render icon: sprite nếu tên nằm trong palette (browser có TaskFlowUI);
  // fallback text cho icon custom / môi trường Node (unit test không có DOM).
  function iconHTML(name) {
    if (typeof name === 'string' && name && ICONS.includes(name)
        && typeof TaskFlowUI !== 'undefined' && TaskFlowUI.icon) {
      return TaskFlowUI.icon(name);
    }
    return esc(name || '');
  }

  // Icon cho nút hành động (edit/trash/plus/refresh...) — KHÔNG gate theo ICONS
  // palette (palette chỉ dành cho icon trụ cột user chọn). Luôn dùng sprite khi
  // browser có TaskFlowUI; fallback rỗng ở Node/unit test.
  function actionIcon(name) {
    if (typeof TaskFlowUI !== 'undefined' && TaskFlowUI.icon) {
      return TaskFlowUI.icon(name);
    }
    return '';
  }

  // Template mặc định: 3 trụ cột (tên lấy từ i18n theo ngôn ngữ hiện tại).
  const TEMPLATE = [
    { labelKey: 'pillarBody', icon: 'heart-pulse' },
    { labelKey: 'pillarWork', icon: 'target' },
    { labelKey: 'pillarSocial', icon: 'users' },
  ];

  function defaultT(key, vars) {
    // Global lexical t (destructure trong app.js từ TaskFlowI18N) — resolve lúc gọi.
    if (typeof t === 'function') return t(key, vars);
    return key;
  }

  /* ---------------- Pure helpers (unit-testable) ---------------- */

  // Template mặc định theo ngôn ngữ hiện tại. tt: translator tuỳ chọn (test Node).
  function defaultTemplate(tt) {
    const tr = typeof tt === 'function' ? tt : defaultT;
    return TEMPLATE.map((tp, i) => ({
      id: 'p' + (i + 1),
      name: tr(tp.labelKey),
      icon: tp.icon,
      hidden: false,
      focus: '',
      metrics: [],
    }));
  }

  // Chuẩn hoá 1 pillar — điền default cho field thiếu (migration / dữ liệu cũ).
  function normalizePillar(p, i, tt) {
    const tr = typeof tt === 'function' ? tt : defaultT;
    if (!p || typeof p !== 'object') return null;
    return {
      id: typeof p.id === 'string' && p.id ? p.id : 'pp' + Date.now() + i,
      name: typeof p.name === 'string' && p.name.trim() ? p.name : (i < TEMPLATE.length ? tr(TEMPLATE[i].labelKey) : tr('pillarBody')),
      icon: typeof p.icon === 'string' && p.icon ? migrateIcon(p.icon) : ICONS[i % ICONS.length],
      hidden: p.hidden === true,
      focus: typeof p.focus === 'string' ? p.focus : '',
      metrics: Array.isArray(p.metrics) ? p.metrics.map(normalizeMetric).filter(Boolean) : [],
    };
  }

  // Migration additive: đảm bảo state.pillars tồn tại + hợp lệ. Không xoá field khác.
  function ensurePillars(state, tt) {
    if (!state || typeof state !== 'object') return state;
    if (!Array.isArray(state.pillars)) state.pillars = defaultTemplate(tt);
    state.pillars = state.pillars.map((p, i) => normalizePillar(p, i, tt)).filter(Boolean);
    return state;
  }

  function pillarById(state, id) {
    if (!state || !Array.isArray(state.pillars)) return null;
    return state.pillars.find((p) => p && p.id === id) || null;
  }

  function visiblePillars(state) {
    if (!state || !Array.isArray(state.pillars)) return [];
    return state.pillars.filter((p) => p && p.hidden !== true);
  }

  // Thêm mới hoặc cập nhật pillar. Trả về pillar đã lưu (null nếu thiếu tên).
  function upsertPillar(state, data) {
    const name = data && typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return null;
    ensurePillars(state);
    const found = data && data.id ? state.pillars.find((p) => p.id === data.id) : null;
    if (found) {
      found.name = name;
      if (data.icon) found.icon = data.icon;
      if (typeof data.hidden === 'boolean') found.hidden = data.hidden;
      return found;
    }
    const p = {
      id: data.id || 'pp' + Date.now() + Math.random().toString(36).slice(2, 6),
      name,
      icon: data.icon || ICONS[0],
      hidden: data.hidden === true,
      focus: '',
      metrics: [],
    };
    state.pillars.push(p);
    return p;
  }

  function removePillar(state, id) {
    ensurePillars(state);
    const before = state.pillars.length;
    state.pillars = state.pillars.filter((p) => !p || p.id !== id);
    return state.pillars.length !== before;
  }

  function togglePillarHidden(state, id) {
    const p = pillarById(state, id);
    if (!p) return null;
    p.hidden = !p.hidden;
    return p;
  }

  function setFocus(state, id, value) {
    const p = pillarById(state, id);
    if (!p) return;
    p.focus = typeof value === 'string' ? value : '';
  }

  function resetPillars(state, tt) {
    ensurePillars(state, tt);
    state.pillars = defaultTemplate(tt);
    return state.pillars;
  }

  /* ================= P3 — Monthly Metrics ================= */

  // Liên kết metric nằm trên task để đi theo task khi chuyển ngày trong cùng tháng.
  // Dữ liệu legacy không có field này được xem như mảng rỗng; giá trị rác/trùng bị bỏ.
  function normalizeTaskMetricIds(task) {
    const ids = task && Array.isArray(task.linkedMetricIds) ? task.linkedMetricIds : [];
    return [...new Set(ids
      .filter((id) => typeof id === 'string' && id.trim())
      .map((id) => id.trim()))];
  }

  function setTaskMetricIds(task, ids) {
    if (!task || typeof task !== 'object') return [];
    task.linkedMetricIds = normalizeTaskMetricIds({ linkedMetricIds: ids });
    return task.linkedMetricIds;
  }

  // Chuẩn hoá 1 metric — điền default cho field thiếu (migration / dữ liệu cũ).
  function normalizeMetric(m) {
    if (!m || typeof m !== 'object') return null;
    const type = ['HABIT', 'MANUAL', 'CUSTOM', 'TASK', 'FOCUS'].includes(m.type) ? m.type : 'MANUAL';
    const target = (m.target && typeof m.target === 'object' && m.target.mode)
      ? m.target
      : { mode: 'daily', value: 1 };
    return {
      id: typeof m.id === 'string' && m.id ? m.id : 'mm' + Date.now() + Math.random().toString(36).slice(2, 6),
      title: typeof m.title === 'string' ? m.title : '',
      type,
      linkedHabitId: (type === 'HABIT' && typeof m.linkedHabitId === 'string') ? m.linkedHabitId : null,
      target: {
        mode: ['daily', 'perWeek', 'perMonth', 'custom'].includes(target.mode) ? target.mode : 'daily',
        value: Number.isFinite(+target.value) && +target.value > 0 ? Math.round(+target.value) : 1,
      },
      days: Array.isArray(m.days) ? m.days : [],
      createdAt: typeof m.createdAt === 'string' ? m.createdAt : null,
      ...(type === 'FOCUS' ? { unit: 'minutes' } : {}),
    };
  }

  function metricById(state, id) {
    if (!state || !Array.isArray(state.pillars)) return null;
    for (const p of state.pillars) {
      if (!p || !Array.isArray(p.metrics)) continue;
      const m = p.metrics.find((x) => x && x.id === id);
      if (m) return m;
    }
    return null;
  }

  // Số ngày mục tiêu của metric trong tháng có `monthDays` ngày.
  // daily → monthDays (day-count THẬT: 28/29/30/31); perWeek → ceil(v × monthDays/7);
  // perMonth/custom → v. Không hard-code 30.
  function metricTarget(metric, monthDays) {
    const m = normalizeMetric(metric);
    const days = Number.isFinite(+monthDays) && +monthDays > 0 ? Math.round(+monthDays) : 30;
    const t = m.target || { mode: 'daily', value: 1 };
    const v = Number.isFinite(+t.value) && +t.value > 0 ? Math.round(+t.value) : 1;
    switch (t.mode) {
      case 'perWeek': return Math.ceil(v * days / 7);
      case 'perMonth': return v;
      case 'custom': return v;
      default: return days;
    }
  }

  // Thu thập task trong một month state. Duyệt phòng thủ để dữ liệu cũ/rỗng không crash.
  function monthTasks(state) {
    if (!state || !Array.isArray(state.weeks)) return [];
    const tasks = [];
    state.weeks.forEach((week) => {
      if (!week || !Array.isArray(week.days)) return;
      week.days.forEach((day) => {
        if (day && Array.isArray(day.tasks)) tasks.push(...day.tasks.filter(Boolean));
      });
    });
    return tasks;
  }

  // Số ngày đã hoàn thành của metric trong tháng.
  // HABIT: đếm ngày habit liên kết tick ✓ (habit bị xoá → 0).
  // MANUAL/CUSTOM: đếm ô ngày tự đánh dấu trong metric.days.
  function metricDone(source, metric, context) {
    const m = normalizeMetric(metric);
    const habits = Array.isArray(source) ? source : (source && Array.isArray(source.habits) ? source.habits : []);
    if (m.type === 'HABIT') {
      const h = habits.find((x) => x && x.id === m.linkedHabitId);
      if (!h || !Array.isArray(h.days)) return 0;
      return h.days.filter(Boolean).length;
    }
    if (m.type === 'TASK') {
      return monthTasks(source).filter((task) => task.done === true
        && normalizeTaskMetricIds(task).includes(m.id)).length;
    }
    if (m.type === 'FOCUS') {
      const year = context && Number.isFinite(+context.year) ? Math.round(+context.year) : null;
      const month = context && Number.isFinite(+context.month) ? Math.round(+context.month) : null;
      if (year === null || month === null || month < 0 || month > 11) return 0;
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
      let totalSecs = 0;
      monthTasks(source).forEach((task) => {
        if (!normalizeTaskMetricIds(task).includes(m.id) || !Array.isArray(task.focusLog)) return;
        task.focusLog.forEach((entry) => {
          const secs = entry && Number.isFinite(+entry.secs) ? +entry.secs : 0;
          if (entry && typeof entry.d === 'string' && entry.d.startsWith(prefix) && secs > 0) totalSecs += secs;
        });
      });
      return Math.floor(totalSecs / 60);
    }
    return Array.isArray(m.days) ? m.days.filter(Boolean).length : 0;
  }

  // Progress tổng hợp: { done, target, pct } — pct giới hạn 0-100, target 0 → 0.
  function metricProgress(source, metric, monthDays, context) {
    const target = metricTarget(metric, monthDays);
    const done = Math.max(0, metricDone(source, metric, context));
    return { done, target, pct: target > 0 ? Math.min(100, Math.round(done / target * 100)) : 0 };
  }

  // Thêm metric mới vào pillar (pillarId bắt buộc). Trả về metric đã thêm / null.
  function addMetric(state, pillarId, data) {
    ensurePillars(state);
    const p = state.pillars.find((x) => x && x.id === pillarId);
    if (!p) return null;
    if (!Array.isArray(p.metrics)) p.metrics = [];
    const m = normalizeMetric({
      id: null,
      title: data && data.title,
      type: data && data.type,
      linkedHabitId: data && data.linkedHabitId,
      target: data && data.target,
      unit: data && data.unit,
      days: [],
    });
    m.createdAt = new Date().toISOString();
    p.metrics.push(m);
    return m;
  }

  // Cập nhật metric theo id (tên/type/link/target). Trả về metric / null.
  function updateMetric(state, id, data) {
    const m = metricById(state, id);
    if (!m) return null;
    if (typeof data.title === 'string') m.title = data.title.trim();
    if (['HABIT', 'MANUAL', 'CUSTOM', 'TASK', 'FOCUS'].includes(data.type)) {
      m.type = data.type;
      m.linkedHabitId = data.type === 'HABIT' && typeof data.linkedHabitId === 'string' ? data.linkedHabitId : null;
      if (data.type === 'FOCUS') m.unit = 'minutes';
      else delete m.unit;
    }
    if (data.target && typeof data.target === 'object' && data.target.mode) {
      m.target = {
        mode: ['daily', 'perWeek', 'perMonth', 'custom'].includes(data.target.mode) ? data.target.mode : 'daily',
        value: Number.isFinite(+data.target.value) && +data.target.value > 0 ? Math.round(+data.target.value) : 1,
      };
    }
    return m;
  }

  function removeMetric(state, id) {
    ensurePillars(state);
    for (const p of state.pillars) {
      if (!p || !Array.isArray(p.metrics)) continue;
      const before = p.metrics.length;
      p.metrics = p.metrics.filter((m) => !m || m.id !== id);
      if (p.metrics.length !== before) return true;
    }
    return false;
  }

  // Toggle ô ngày của metric MANUAL/CUSTOM (dayIndex 0-based).
  function toggleMetricDay(state, id, dayIndex) {
    const m = metricById(state, id);
    if (!m) return null;
    if (!Array.isArray(m.days)) m.days = [];
    const i = Number.isFinite(+dayIndex) ? Math.round(+dayIndex) : -1;
    if (i < 0) return m;
    while (m.days.length <= i) m.days.push(false);
    m.days[i] = !m.days[i];
    return m;
  }

  /* ---------------- UI: block trong goals widget (Overview tháng) ---------------- */

  function monthDaysCount() {
    return (typeof NUM_DAYS === 'number' && NUM_DAYS > 0) ? NUM_DAYS : 30;
  }

  // Ô ngày để đánh dấu manual (MANUAL/CUSTOM) — như habit grid mini, tất cả ngày trong tháng.
  function metricDayStripHTML(state, p, m) {
    const days = monthDaysCount();
    const today = (typeof PLAN_YEAR === 'number' && typeof PLAN_MONTH === 'number')
      ? ((new Date().getFullYear() === PLAN_YEAR && new Date().getMonth() === PLAN_MONTH) ? new Date().getDate() - 1 : -1)
      : -1;
    const cells = Array.from({ length: days }, (_, d) => {
      const done = Array.isArray(m.days) && m.days[d] === true;
      const cls = ['metric-day-cell', done ? 'on' : '', today === d ? 'today' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" data-action="metric-day" data-id="${esc(m.id)}" data-day="${d}"
        aria-pressed="${done ? 'true' : 'false'}" aria-label="${t('metricDayAria', { title: m.title, d: d + 1 })}">${d + 1}</button>`;
    }).join('');
    return `<div class="metric-day-strip" role="group" aria-label="${t('metricDayStripAria', { title: m.title })}">${cells}</div>`;
  }

  function metricRowHTML(state, p, m) {
    const context = {
      year: typeof PLAN_YEAR === 'number' ? PLAN_YEAR : null,
      month: typeof PLAN_MONTH === 'number' ? PLAN_MONTH : null,
    };
    const prog = metricProgress(state, m, monthDaysCount(), context);
    const unit = m.type === 'TASK' ? t('metricTaskUnit')
      : m.type === 'FOCUS' ? t('metricFocusUnit') : t('metricDayUnit');
    const barLabel = (m.type === 'TASK' || m.type === 'FOCUS')
      ? t('metricBarAriaUnit', { title: m.title, done: prog.done, target: prog.target, unit: unit.trim() })
      : t('metricBarAria', { title: m.title, done: prog.done, target: prog.target });
    const habitMissing = m.type === 'HABIT'
      && !(Array.isArray(state.habits) && state.habits.some((h) => h && h.id === m.linkedHabitId));
    return `<div class="metric-row" data-testid="metric-row" data-metric-id="${esc(m.id)}">
      <div class="metric-main">
        <span class="metric-title" title="${esc(m.title)}">${esc(m.title) || t('metricUntitled')}</span>
        ${habitMissing ? `<span class="metric-warn" title="${t('metricHabitGone')}">${t('metricHabitGone')}</span>` : ''}
        <span class="metric-num">${prog.done}/${prog.target}${unit}</span>
        <div class="pillar-actions">
          <button type="button" class="mini-btn" data-action="metric-edit" data-id="${esc(m.id)}" title="${t('metricEdit')}" aria-label="${t('metricEdit')}">${actionIcon('edit')}</button>
          <button type="button" class="mini-btn" data-action="metric-delete" data-id="${esc(m.id)}" title="${t('metricDel')}" aria-label="${t('metricDel')}">${actionIcon('trash')}</button>
        </div>
      </div>
      <div class="metric-bar" role="progressbar" aria-valuenow="${prog.pct}" aria-valuemin="0" aria-valuemax="100"
        aria-label="${barLabel}">
        <div class="metric-bar-fill" style="width:${prog.pct}%"></div>
      </div>
      ${(m.type === 'MANUAL' || m.type === 'CUSTOM') ? metricDayStripHTML(state, p, m) : ''}
    </div>`;
  }

  function pillarCardHTML(state, p) {
    const metrics = Array.isArray(p.metrics) ? p.metrics : [];
    return `<article class="pillar-card" data-pillar-id="${esc(p.id)}" data-testid="pillar-card">
      <div class="pillar-head">
        <span class="pillar-icon" aria-hidden="true">${iconHTML(p.icon)}</span>
        <span class="pillar-name">${esc(p.name)}</span>
        <div class="pillar-actions">
          <button type="button" class="mini-btn" data-action="pillar-edit" data-id="${esc(p.id)}" title="${t('pillarEdit')}" aria-label="${t('pillarEdit')}">${actionIcon('edit')}</button>
          <button type="button" class="mini-btn" data-action="pillar-toggle" data-id="${esc(p.id)}" title="${t('pillarHide')}" aria-label="${t('pillarHide')}">🙈</button>
        </div>
      </div>
      <div class="pillar-focus-row">
        <input type="text" class="pillar-focus-input" data-pillar-focus="${esc(p.id)}" value="${esc(p.focus || '')}"
          placeholder="${t('pillarFocusPh')}" aria-label="${t('pillarFocusAria', { name: p.name })}" maxlength="200" />
      </div>
      ${metrics.length ? `<div class="pillar-metrics" data-testid="pillar-metrics">
        <div class="pillar-metrics-head">
          <span class="pillar-metrics-label">${t('metricLbl')}</span>
          <button type="button" class="mini-btn add-btn" data-action="metric-add" data-pillar-id="${esc(p.id)}">${actionIcon('plus')}<span>${t('metricAdd')}</span></button>
        </div>
        ${metrics.map((m) => metricRowHTML(state, p, m)).join('')}
      </div>` : `<button type="button" class="mini-btn add-btn metric-empty-add" data-action="metric-add" data-pillar-id="${esc(p.id)}">${actionIcon('plus')}<span>${t('metricAdd')}</span></button>`}
    </article>`;
  }

  // Block hiển thị trong goals widget — host <div data-role="pillars-block"> để
  // rerenderPillars() chỉ thay nội dung block (giữ scroll/focus).
  function pillarsBlockHTML(state) {
    ensurePillars(state);
    const vis = visiblePillars(state);
    const empty = (typeof emptyStateHTML === 'function')
      ? emptyStateHTML('🎯', 'pillarsEmptyT', 'pillarsEmptyH', [{ label: t('pillarEmptyCta'), action: 'pillar-add' }])
      : '';
    return `<section class="pillars-block" aria-label="${t('pillarTitle')}" data-testid="pillars-block">
      <div class="pillars-head">
        <h4 class="pillars-title">${t('pillarTitle')}</h4>
        <div class="pillars-actions">
          <button type="button" class="mini-btn add-btn" data-action="pillar-add">${actionIcon('plus')}<span>${t('pillarAdd')}</span></button>
          <button type="button" class="mini-btn" data-action="pillars-reset" title="${t('pillarsReset')}" aria-label="${t('pillarsReset')}">${actionIcon('refresh')}</button>
        </div>
      </div>
      ${vis.length ? `<div class="pillar-list">${vis.map((p) => pillarCardHTML(state, p)).join('')}</div>` : empty}
    </section>`;
  }

  /* ---------------- UI: edit/add modal ---------------- */

  let iconListenerAttached = false;

  function pillarEditHTML(state, id, tt) {
    const tr = typeof tt === 'function' ? tt : defaultT;
    const p = id ? pillarById(state, id) : null;
    const name = p ? p.name : '';
    const icon = p ? p.icon : ICONS[0];
    const hidden = p ? p.hidden === true : false;
    return `<div class="pillar-edit-body" data-pillar-edit-id="${id ? esc(id) : ''}">
      <label class="pillar-edit-field">
        <span class="pillar-edit-label">${tr('pillarIconLbl')}</span>
        <div class="pillar-icon-grid" role="radiogroup" aria-label="${tr('pillarIconLbl')}">
          ${ICONS.map((ic) => `<button type="button" role="radio" aria-checked="${ic === icon ? 'true' : 'false'}" class="pillar-icon-opt${ic === icon ? ' on' : ''}" data-pillar-icon="${ic}" title="${ic}" aria-label="${ic}">${iconHTML(ic)}</button>`).join('')}
        </div>
      </label>
      <label class="pillar-edit-field">
        <span class="pillar-edit-label">${tr('pillarNameLbl')}</span>
        <input type="text" class="inline-input" data-role="pillar-name" value="${esc(name)}" placeholder="${tr('pillarNamePh')}" maxlength="60" />
      </label>
      <label class="pillar-hidden-row">
        <input type="checkbox" data-role="pillar-hidden" ${hidden ? 'checked' : ''} />
        <span>${tr('pillarHiddenLbl')}</span>
      </label>
      <div class="pillar-edit-actions">
        ${id ? `<button type="button" class="button pillar-delete-btn" data-action="pillar-delete" data-id="${esc(id)}">${tr('pillarDel')}</button>` : ''}
        <button type="button" class="button button-primary" data-action="pillar-save">${tr('pillarSave')}</button>
      </div>
    </div>`;
  }

  function onIconPick(e) {
    const btn = e.target.closest('[data-pillar-icon]');
    if (!btn) return;
    const grid = btn.closest('.pillar-icon-grid');
    if (!grid) return;
    grid.querySelectorAll('[data-pillar-icon]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function openPillarEdit(id, opener) {
    const content = document.getElementById('pillarEditContent');
    if (!content) return;
    content.innerHTML = pillarEditHTML(state, id || null);
    if (!iconListenerAttached) {
      content.addEventListener('click', onIconPick);
      iconListenerAttached = true;
    }
    TaskFlowUI.openDialog('pillarEditModal', opener);
  }

  function closePillarEdit() {
    const content = document.getElementById('pillarEditContent');
    if (content && iconListenerAttached) {
      content.removeEventListener('click', onIconPick);
      iconListenerAttached = false;
    }
    TaskFlowUI.closeDialog('pillarEditModal');
  }

  // Đọc form modal → upsert vào state (state do app.js truyền). Không tự lưu —
  // app.js quản lý persistence (save()/saveSoon()) theo pattern goals hiện tại.
  function applyPillarEdit(state) {
    const content = document.getElementById('pillarEditContent');
    if (!content) return { ok: false };
    const nameEl = content.querySelector('[data-role="pillar-name"]');
    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
      if (typeof TaskFlowUI !== 'undefined' && TaskFlowUI.toast) TaskFlowUI.toast(t('pillarNameRequired'), 'error');
      return { ok: false };
    }
    const iconEl = content.querySelector('.pillar-icon-opt.on');
    const hiddenEl = content.querySelector('[data-role="pillar-hidden"]');
    const body = content.querySelector('[data-pillar-edit-id]');
    const id = body ? (body.dataset.pillarEditId || null) : null;
    const pillar = upsertPillar(state, {
      id: id || null,
      name,
      icon: iconEl ? iconEl.dataset.pillarIcon : ICONS[0],
      hidden: hiddenEl ? hiddenEl.checked : false,
    });
    closePillarEdit();
    return { ok: !!pillar, pillar };
  }

  /* ---------------- UI: metric edit/add modal ---------------- */

  const METRIC_TYPES = ['HABIT', 'TASK', 'FOCUS', 'MANUAL', 'CUSTOM'];
  let metricModalListenerAttached = false;

  function metricEditHTML(state, metricId, pillarId, tt) {
    const tr = typeof tt === 'function' ? tt : defaultT;
    const m = metricId ? metricById(state, metricId) : null;
    const title = m ? m.title : '';
    const type = m ? m.type : 'MANUAL';
    const targetMode = m && m.target && m.target.mode ? m.target.mode : 'daily';
    const targetValue = m && m.target && Number.isFinite(+m.target.value) ? +m.target.value : 1;
    const linked = m ? (m.linkedHabitId || '') : '';
    const habits = Array.isArray(state.habits) ? state.habits : [];
    const typeOpt = (ty) => `<button type="button" role="radio" aria-checked="${type === ty ? 'true' : 'false'}"
      class="metric-type-opt${type === ty ? ' on' : ''}" data-metric-type="${ty}">${tr('metricType' + ty)}</button>`;
    const targetOpt = (mode, label) => `<option value="${mode}"${targetMode === mode ? ' selected' : ''}>${label}</option>`;
    const habitOptions = habits.length
      ? habits.map((h) => `<option value="${esc(h.id)}"${linked === h.id ? ' selected' : ''}>${esc(h.name)}</option>`).join('')
      : `<option value="">${tr('metricHabitNone')}</option>`;
    return `<div class="pillar-edit-body" data-metric-edit-id="${metricId ? esc(metricId) : ''}" data-metric-pillar-id="${pillarId ? esc(pillarId) : ''}">
      <label class="pillar-edit-field">
        <span class="pillar-edit-label">${tr('metricTitleLbl')}</span>
        <input type="text" class="inline-input" data-role="metric-title" value="${esc(title)}" placeholder="${tr('metricTitlePh')}" maxlength="80" />
      </label>
      <div class="pillar-edit-field">
        <span class="pillar-edit-label">${tr('metricTypeLbl')}</span>
        <div class="metric-type-row" role="radiogroup" aria-label="${tr('metricTypeLbl')}">
          ${METRIC_TYPES.map(typeOpt).join('')}
        </div>
      </div>
      <div class="pillar-edit-field" data-role="metric-habit-row" ${type === 'HABIT' ? '' : 'hidden'}>
        <label class="pillar-edit-label" for="metricHabitSel">${tr('metricHabitLbl')}</label>
        <select class="inline-input" id="metricHabitSel" data-role="metric-habit">
          ${habitOptions}
        </select>
        ${habits.length ? '' : `<p class="pillar-edit-hint">${tr('metricHabitNoneHint')}</p>`}
      </div>
      <p class="pillar-edit-hint" data-role="metric-type-hint" ${type === 'TASK' || type === 'FOCUS' ? '' : 'hidden'}>
        ${type === 'FOCUS' ? tr('metricFocusHint') : tr('metricTaskHint')}
      </p>
      <label class="pillar-edit-field">
        <span class="pillar-edit-label" for="metricTargetMode" data-role="metric-target-label">${type === 'FOCUS' ? tr('metricTargetMinutesLbl') : tr('metricTargetLbl')}</span>
        <select class="inline-input" id="metricTargetMode" data-role="metric-target-mode" ${type === 'FOCUS' ? 'disabled' : ''}>
          ${targetOpt('daily', tr('metricTargetDaily'))}
          ${targetOpt('perWeek', tr('metricTargetPerWeek'))}
          ${targetOpt('perMonth', tr('metricTargetPerMonth'))}
          ${targetOpt('custom', tr('metricTargetCustom'))}
        </select>
      </label>
      <label class="pillar-edit-field" data-role="metric-target-value-row" ${targetMode === 'daily' ? 'hidden' : ''}>
        <span class="pillar-edit-label" for="metricTargetValue">${tr('metricTargetValueLbl')}</span>
        <input type="number" min="1" max="${type === 'FOCUS' ? 100000 : 31}" step="1" class="inline-input" id="metricTargetValue" data-role="metric-target-value" value="${targetValue}" />
      </label>
      <div class="pillar-edit-actions">
        ${metricId ? `<button type="button" class="button pillar-delete-btn" data-action="metric-delete" data-id="${esc(metricId)}">${tr('metricDel')}</button>` : ''}
        <button type="button" class="button button-primary" data-action="metric-save">${tr('pillarSave')}</button>
      </div>
    </div>`;
  }

  // Type radio + target mode select trong modal → hiện/ẩn hàng habit + giá trị target.
  function onMetricModalChange(e) {
    const typeBtn = e.target.closest('[data-metric-type]');
    const content = document.getElementById('metricEditContent');
    if (!content) return;
    if (typeBtn) {
      content.querySelectorAll('[data-metric-type]').forEach((b) => {
        const on = b === typeBtn;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      const habitRow = content.querySelector('[data-role="metric-habit-row"]');
      if (habitRow) habitRow.hidden = typeBtn.dataset.metricType !== 'HABIT';
      const type = typeBtn.dataset.metricType;
      const hint = content.querySelector('[data-role="metric-type-hint"]');
      if (hint) {
        hint.hidden = type !== 'TASK' && type !== 'FOCUS';
        hint.textContent = type === 'FOCUS' ? t('metricFocusHint') : t('metricTaskHint');
      }
      const mode = content.querySelector('[data-role="metric-target-mode"]');
      if (mode && (type === 'TASK' || type === 'FOCUS')) mode.value = 'perMonth';
      if (mode) mode.disabled = type === 'FOCUS';
      const targetLabel = content.querySelector('[data-role="metric-target-label"]');
      if (targetLabel) targetLabel.textContent = type === 'FOCUS' ? t('metricTargetMinutesLbl') : t('metricTargetLbl');
      const targetValue = content.querySelector('[data-role="metric-target-value"]');
      if (targetValue) targetValue.max = type === 'FOCUS' ? '100000' : '31';
    }
    const modeSel = content.querySelector('[data-role="metric-target-mode"]');
    if (modeSel && (e.target === modeSel || typeBtn)) {
      const row = content.querySelector('[data-role="metric-target-value-row"]');
      if (row) row.hidden = modeSel.value === 'daily';
    }
  }

  function openMetricEdit(metricId, pillarId, opener) {
    const content = document.getElementById('metricEditContent');
    if (!content) return;
    content.innerHTML = metricEditHTML(state, metricId || null, pillarId || null);
    if (!metricModalListenerAttached) {
      content.addEventListener('change', onMetricModalChange);
      content.addEventListener('click', onMetricModalChange);
      metricModalListenerAttached = true;
    }
    TaskFlowUI.openDialog('metricEditModal', opener);
  }

  function closeMetricEdit() {
    const content = document.getElementById('metricEditContent');
    if (content && metricModalListenerAttached) {
      content.removeEventListener('change', onMetricModalChange);
      content.removeEventListener('click', onMetricModalChange);
      metricModalListenerAttached = false;
    }
    TaskFlowUI.closeDialog('metricEditModal');
  }

  // Đọc form modal → add/update metric (state do app.js truyền). Không tự lưu.
  function applyMetricEdit(state) {
    const content = document.getElementById('metricEditContent');
    if (!content) return { ok: false };
    const titleEl = content.querySelector('[data-role="metric-title"]');
    const title = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      if (typeof TaskFlowUI !== 'undefined' && TaskFlowUI.toast) TaskFlowUI.toast(t('metricNameRequired'), 'error');
      return { ok: false };
    }
    const typeBtn = content.querySelector('.metric-type-opt.on');
    const type = typeBtn ? typeBtn.dataset.metricType : 'MANUAL';
    const habitEl = content.querySelector('[data-role="metric-habit"]');
    const linkedHabitId = (type === 'HABIT' && habitEl && habitEl.value) ? habitEl.value : null;
    if (type === 'HABIT' && !linkedHabitId) {
      if (typeof TaskFlowUI !== 'undefined' && TaskFlowUI.toast) TaskFlowUI.toast(t('metricHabitRequired'), 'error');
      return { ok: false };
    }
    const modeEl = content.querySelector('[data-role="metric-target-mode"]');
    const mode = modeEl ? modeEl.value : 'daily';
    const valueEl = content.querySelector('[data-role="metric-target-value"]');
    const value = valueEl && valueEl.value ? +valueEl.value : (mode === 'perWeek' ? 5 : mode === 'perMonth' ? 20 : 10);
    const body = content.querySelector('[data-metric-edit-id]');
    const metricId = body ? (body.dataset.metricEditId || null) : null;
    const pillarId = body ? (body.dataset.metricPillarId || null) : null;
    const data = { title, type, linkedHabitId, target: { mode, value }, ...(type === 'FOCUS' ? { unit: 'minutes' } : {}) };
    const metric = metricId ? updateMetric(state, metricId, data) : (pillarId ? addMetric(state, pillarId, data) : null);
    closeMetricEdit();
    return { ok: !!metric, metric };
  }

  return {
    ICONS,
    migrateIcon,
    defaultTemplate,
    normalizePillar,
    normalizeMetric,
    normalizeTaskMetricIds,
    setTaskMetricIds,
    ensurePillars,
    pillarById,
    metricById,
    visiblePillars,
    upsertPillar,
    removePillar,
    togglePillarHidden,
    setFocus,
    resetPillars,
    metricTarget,
    monthTasks,
    metricDone,
    metricProgress,
    addMetric,
    updateMetric,
    removeMetric,
    toggleMetricDay,
    pillarsBlockHTML,
    metricEditHTML,
    metricRowHTML,
    openPillarEdit,
    closePillarEdit,
    applyPillarEdit,
    openMetricEdit,
    closeMetricEdit,
    applyMetricEdit,
  };
});
