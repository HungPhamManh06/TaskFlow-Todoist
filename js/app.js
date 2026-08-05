'use strict';

/* ============================ Dữ liệu ============================ */

const DAYS = [
  { name: 'Monday',    icon: '🍐' },
  { name: 'Tuesday',   icon: '🍎' },
  { name: 'Wednesday', icon: '🍐' },
  { name: 'Thursday',  icon: '🍊' },
  { name: 'Friday',    icon: '🍋' },
  { name: 'Saturday',  icon: '🍉' },
  { name: 'Sunday',    icon: '🍇' },
];

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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LEGACY_KEY = 'january-planner-2026';

let PLAN_YEAR = new Date().getFullYear();
let PLAN_MONTH = new Date().getMonth();
let NUM_DAYS = new Date(PLAN_YEAR, PLAN_MONTH + 1, 0).getDate();
let NUM_WEEKS = 4;
let PLAN_START = new Date(PLAN_YEAR, PLAN_MONTH, 1);
let PLAN_END = new Date(PLAN_YEAR, PLAN_MONTH + 1, 0);

function initPlan(now) {
  PLAN_YEAR = now.getFullYear();
  PLAN_MONTH = now.getMonth();
  NUM_DAYS = new Date(PLAN_YEAR, PLAN_MONTH + 1, 0).getDate();
  const first = new Date(PLAN_YEAR, PLAN_MONTH, 1);
  const dow = (first.getDay() + 6) % 7; // Thứ 2 = 0
  PLAN_START = new Date(first.getTime() - dow * 86400000);
  PLAN_END = new Date(PLAN_YEAR, PLAN_MONTH + 1, 0);
  NUM_WEEKS = Math.ceil((dow + NUM_DAYS) / 7); // 4..6 tuần
}

function monthKey() {
  return 'planner-' + PLAN_YEAR + '-' + (PLAN_MONTH + 1);
}

function updateBrand() {
  const el = document.getElementById('brandTitle');
  if (el) el.textContent = 'TaskFlow-Todoist';
  const s = document.getElementById('brandSub');
  if (s) s.hidden = true;
  document.title = 'TaskFlow-Todoist';
  buildMonthNav();
}

function buildMonthNav() {
  const options = MONTH_NAMES.map((n, m) => `<option value="${m}">${t('monthOption', { m: monthLabel(m), n: m + 1, y: PLAN_YEAR })}</option>`).join('');
  document.querySelectorAll('[data-action="monthselect"]').forEach((select) => {
    select.innerHTML = options;
    select.value = String(PLAN_MONTH);
  });
}

/* ============================ Kế hoạch năm ============================ */

function yearKey() {
  return 'planner-year-' + PLAN_YEAR;
}

const YEAR_REFLECT_PROMPTS = () => [t('rm0'), t('rm1'), t('rm2'), t('rm3')];
const QUARTER_REFLECT_PROMPTS = () => [t('rm0'), t('rm1'), t('rm2'), t('rq3')];

const YEAR_GOAL_DEFS = [
  ['Hoàn thành 4 video youtube', 'priority', true],
  ['Hoàn thành 21 video ngắn', 'priority', true],
  ['Học xong khóa luyện phát âm TA', 'priority', true],
  ['Đọc 48 cuốn sách', 'priority', true],
  ['Tiết kiệm được 20 triệu', 'priority', false],
  ['Chạy bộ 150 buổi', 'priority', false],
  ['Gọi điện về nhà 48 lần', 'regular', false],
  ['Viết nhật ký 365 ngày', 'regular', false],
  ['Đi xem phim 6 lần', 'regular', false],
  ['Học tiếng Anh giao tiếp', 'regular', false],
];

const MONTH_FRUITS = ['🍎', '🍎', '🍋', '🍎', '🍎', '🍋', '🍎', '🍎', '🍋', '🍎', '🍎', '🍋'];

function defaultYearState() {
  return {
    year: PLAN_YEAR,
    goals: YEAR_GOAL_DEFS.map(([text, kind, done], i) => ({ id: 'yg' + i, text, kind, done })),
    reflections: {
      year: ['', '', '', ''],
      q1: ['', '', '', ''], q2: ['', '', '', ''], q3: ['', '', '', ''], q4: ['', '', '', ''],
    },
    monthNotes: Array.from({ length: 12 }, () => ''),
  };
}

function capturePlan() {
  return { y: PLAN_YEAR, m: PLAN_MONTH, nd: NUM_DAYS, nw: NUM_WEEKS, ps: PLAN_START, pe: PLAN_END };
}
function restorePlan(p) {
  PLAN_YEAR = p.y; PLAN_MONTH = p.m; NUM_DAYS = p.nd; NUM_WEEKS = p.nw; PLAN_START = p.ps; PLAN_END = p.pe;
}

function defaultMonthPct(y, m) {
  const prev = capturePlan();
  try {
    initPlan(new Date(y, m, 1));
    const s = defaultState();
    const pcts = s.weeks.map((w) => {
      const t = w.goals.length;
      const d = w.goals.filter((g) => g.done).length;
      return t ? Math.round((d / t) * 100) : 0;
    });
    return pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  } catch (e) {
    return 0;
  } finally {
    restorePlan(prev);
  }
}

function loadYearState() {
  try {
    const raw = localStorage.getItem(yearKey());
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.goals) || s.year !== PLAN_YEAR) return null;
    if (!s.reflections || typeof s.reflections !== 'object') s.reflections = defaultYearState().reflections;
    if (!Array.isArray(s.reflections.year) || s.reflections.year.length !== 4) s.reflections.year = ['', '', '', ''];
    ['q1', 'q2', 'q3', 'q4'].forEach((q) => {
      if (!Array.isArray(s.reflections[q]) || s.reflections[q].length !== 4) s.reflections[q] = ['', '', '', ''];
    });
    if (!Array.isArray(s.monthNotes) || s.monthNotes.length !== 12) s.monthNotes = Array.from({ length: 12 }, () => '');
    return s;
  } catch (e) {
    return null;
  }
}

let yearState = bootYearState();

function saveYear() {
  try { localStorage.setItem(yearKey(), JSON.stringify(yearState)); } catch (e) { /* ẩn */ }
  if (window.Sync) window.Sync.push(yearKey());
}

function yearGoalStats() {
  const total = yearState.goals.length;
  const done = yearState.goals.filter((g) => g.done).length;
  return { done, inProg: total - done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function monthPctOf(y, m) {
  let raw = null;
  try { raw = localStorage.getItem('planner-' + y + '-' + (m + 1)); } catch (e) { return hasAccount() ? 0 : defaultMonthPct(y, m); }
  if (!raw) return hasAccount() ? 0 : defaultMonthPct(y, m);
  try {
    const s = JSON.parse(raw);
    if (!Array.isArray(s.weeks) || !s.weeks.length) return hasAccount() ? 0 : defaultMonthPct(y, m);
    // Hàm thuần trong PlanStats (unit-test trong tests/phase2.test.mjs)
    return window.PlanStats ? window.PlanStats.weekGoalPct(s) : (() => {
      const pcts = s.weeks.map((w) => {
        const total = w.goals.length;
        const done = w.goals.filter((g) => g.done).length;
        return total ? Math.round((done / total) * 100) : 0;
      });
      return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    })();
  } catch (e) {
    return hasAccount() ? 0 : defaultMonthPct(y, m);
  }
}

function monthGoalsOf(y, m) {
  let raw = null;
  try { raw = localStorage.getItem('planner-' + y + '-' + (m + 1)); } catch (e) { /* ẩn */ }
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (Array.isArray(s.monthlyGoals)) return s.monthlyGoals;
    } catch (e) { /* ẩn */ }
  }
  // Tài khoản đã đăng nhập: tháng không có dữ liệu → TRỐNG, không hiện dữ liệu mẫu
  if (hasAccount()) return [];
  return GOAL_DEFS.map(([text, kind, done], i) => ({ id: 'g' + i, text, kind, done }));
}

let yearMonthlyCache = null;
function yearMonthlyData() {
  if (!yearMonthlyCache) {
    if (window.PlanStats) {
      // Hàm thuần: nhận loader trả state tháng (hoặc null) → [{pct, goals}] (unit-test ở phase2)
      const rawStates = Array.from({ length: 12 }, (_, m) => monthStateRaw(PLAN_YEAR, m));
      yearMonthlyCache = window.PlanStats.yearMonthlyFrom((m) => rawStates[m], PLAN_YEAR)
        .map((md, m) => ({
          // Chỉ fallback demo khi tháng KHÔNG có dữ liệu; tháng có dữ liệu 0% phải giữ 0
          pct: rawStates[m] ? md.pct : (hasAccount() ? 0 : defaultMonthPct(PLAN_YEAR, m)),
          goals: rawStates[m] ? md.goals : monthGoalsOf(PLAN_YEAR, m),
        }));
    } else {
      yearMonthlyCache = Array.from({ length: 12 }, (_, m) => ({
        pct: monthPctOf(PLAN_YEAR, m),
        goals: monthGoalsOf(PLAN_YEAR, m),
      }));
    }
  }
  return yearMonthlyCache;
}
function invalidateYearCache() { yearMonthlyCache = null; }

function loadMonthStateOrCreate(y, m) {
  let s = null;
  try {
    const raw = localStorage.getItem('planner-' + y + '-' + (m + 1));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.monthlyGoals)) s = parsed;
    }
  } catch (e) { /* ẩn */ }
  if (!s) {
    const prev = capturePlan();
    try {
      initPlan(new Date(y, m, 1));
      // Tài khoản đã đăng nhập: tháng chưa có dữ liệu → TRỐNG, không tạo demo
      s = hasAccount() ? emptyState() : defaultState();
    } finally {
      restorePlan(prev);
    }
  }
  return s;
}

function saveMonthState(y, m, s) {
  try { localStorage.setItem('planner-' + y + '-' + (m + 1), JSON.stringify(s)); } catch (e) { /* ẩn */ }
  if (window.Sync) window.Sync.push('planner-' + y + '-' + (m + 1));
}

function toggleMonthGoal(m, id) {
  const y = PLAN_YEAR;
  const s = loadMonthStateOrCreate(y, m);
  const g = s.monthlyGoals.find((x) => x.id === id);
  if (!g) return;
  g.done = !g.done;
  const total = s.monthlyGoals.length;
  const done = s.monthlyGoals.filter((x) => x.done).length;
  if (g.done && total && Math.round((done / total) * 100) === 100) confettiBurst();
  saveMonthState(y, m, s);
  invalidateYearCache();
  renderYear();
}

function toggleQuarterGoal(q, key) {
  const sep = key.indexOf('|');
  const kind = key.slice(0, sep);
  const text = key.slice(sep + 1);
  let cur = null;
  for (let i = 0; i < 3; i++) {
    const s = loadMonthStateOrCreate(PLAN_YEAR, q * 3 + i);
    const g = s.monthlyGoals.find((x) => x.kind === kind && x.text === text);
    if (g) cur = g.done;
  }
  const next = !cur;
  if (cur === null) return;
  let celebrated = false;
  for (let i = 0; i < 3; i++) {
    const m = q * 3 + i;
    const s = loadMonthStateOrCreate(PLAN_YEAR, m);
    s.monthlyGoals.forEach((g) => { if (g.kind === kind && g.text === text) g.done = next; });
    if (next && !celebrated) {
      const total = s.monthlyGoals.length;
      const done = s.monthlyGoals.filter((x) => x.done).length;
      if (total && Math.round((done / total) * 100) === 100) { confettiBurst(); celebrated = true; }
    }
    saveMonthState(PLAN_YEAR, m, s);
  }
  invalidateYearCache();
  renderYear();
}

function pullYearGoalsFromMonths() {
  const y = PLAN_YEAR;
  const seen = new Map();
  for (let m = 0; m < 12; m++) {
    monthGoalsOf(y, m).forEach((g) => {
      const k = g.kind + '|' + g.text;
      const e = seen.get(k);
      if (!e) seen.set(k, { text: g.text, kind: g.kind, done: g.done, n: 1, d: g.done ? 1 : 0 });
      else { e.n++; if (g.done) e.d++; }
    });
  }
  yearState.goals = Array.from(seen.values()).map((e, i) => ({
    id: 'yg' + i,
    text: e.text,
    kind: e.kind,
    done: e.d >= Math.ceil(e.n / 2),
  }));
  invalidateYearCache();
  saveYear();
  renderYear();
}

function quarterStats() {
  const monthly = yearMonthlyData();
  return [0, 1, 2, 3].map((q) => {
    const pcts = [0, 1, 2].map((i) => monthly[q * 3 + i].pct);
    const seen = new Map();
    [0, 1, 2].forEach((i) => {
      monthly[q * 3 + i].goals.forEach((g) => {
        const k = g.kind + '|' + g.text;
        const e = seen.get(k);
        if (!e) seen.set(k, { text: g.text, kind: g.kind, done: g.done, n: 1, d: g.done ? 1 : 0 });
        else { e.n++; if (g.done) e.d++; }
      });
    });
    const goals = Array.from(seen.values()).map((e) => ({ ...e, done: e.d === e.n }));
    const done = goals.filter((g) => g.done).length;
    return { q, pct: Math.round(pcts.reduce((a, b) => a + b, 0) / 3), goals, done, total: goals.length, inProg: goals.length - done };
  });
}

function lineChartSVG(values, w = 480, h = 110) {
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 20) + 10;
    const y = h - 18 - (Math.max(0, Math.min(100, v)) / 100) * (h - 34);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  const line = pts.join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="${t('lineAria')}">
    <defs>
      <linearGradient id="lgYearLine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#F39A82" stop-opacity=".5"/>
        <stop offset="100%" stop-color="#F39A82" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${10},${h - 18} ${line} ${w - 10},${h - 18}" fill="url(#lgYearLine)"/>
    <polyline points="${line}" fill="none" stroke="#C88570" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${values.map((v, i) => `<circle cx="${pts[i].split(',')[0]}" cy="${pts[i].split(',')[1]}" r="3" fill="#fff" stroke="#C88570" stroke-width="2"><title>${t('lineMonthT', { n: i + 1, p: v })}</title></circle>`).join('')}
  </svg>`;
}

/* ============================ Tiện ích ============================ */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ============================ Phase 8: Widget Dashboard System ============================ */

/* 8.1 — Widget config: định nghĩa widget + helpers */

const WIDGET_DEFS_OVERVIEW = [
  { id: 'date-card',     labelKey: 'widgetLabel_date-card',     render: function (ms) { return dateCardHTML(); } },
  { id: 'weekly-chart',  labelKey: 'widgetLabel_weekly-chart',  render: function (ms) { return weeklyChartHTML(); } },
  { id: 'scene-card',    labelKey: 'widgetLabel_scene-card',    render: function (ms) { return focusCardHTML(); } },
  { id: 'goals',         labelKey: 'widgetLabel_goals',         render: function (ms) { return goalsPanelHTML(ms); } },
  { id: 'habits',        labelKey: 'widgetLabel_habits',        render: function (ms) { return habitPanelHTML(); } },
  { id: 'streak-heatmap',labelKey: 'widgetLabel_streak-heatmap',render: function (ms) { return habitHeatCardHTML(); } },
  { id: 'mood',          labelKey: 'widgetLabel_mood',          render: function (ms) { return moodCardHTML(); } },
  { id: 'badges',        labelKey: 'widgetLabel_badges',        render: function (ms) { return badgePanelHTML(); } },
];

const WIDGET_DEFS_YEAR = [
  { id: 'year-dashboard',        labelKey: 'widgetLabel_year-dashboard',        render: function (gs) { return yearDashboardHTML(); } },
  { id: 'year-card',             labelKey: 'widgetLabel_year-card',             render: function (gs) { return yearCardHTML(); } },
  { id: 'year-charts',           labelKey: 'widgetLabel_year-charts',           render: function (gs) { return yearChartsHTML(); } },
  { id: 'year-goals',            labelKey: 'widgetLabel_year-goals',            render: function (gs) { return yearGoalsCardHTML(gs); } },
  { id: 'year-overview-ref',     labelKey: 'widgetLabel_year-overview-ref',     render: function (gs) { return yearOverviewReflectionHTML(); } },
  { id: 'year-quarters',         labelKey: 'widgetLabel_year-quarters',         render: function (gs) { return yearQuartersHTML(); } },
  { id: 'year-months',           labelKey: 'widgetLabel_year-months',           render: function (gs) { return yearMonthsHTML(); } },
  { id: 'year-reflections',      labelKey: 'widgetLabel_year-reflections',      render: function (gs) { return yearReflectionsHTML(); } },
  { id: 'year-heatmap',          labelKey: 'widgetLabel_year-heatmap',          render: function (gs) { return yearHabitHeatmapHTML(); } },
];

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
      var stats = view === 'year' ? yearGoalStats() : monthlyStats();
      return { id: w.id, html: def.render(stats), label: t(def.labelKey) };
    });
}

/* ============================ i18n VI/EN ============================ */

const MONTH_NAMES_VI = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

const I18N = {
  vi: {
    navMonths: 'Chuyển tháng trong năm',
    prevMonth: 'Tháng trước',
    nextMonth: 'Tháng sau',
    prevYear: 'Năm trước',
    nextYear: 'Năm sau',
    selectMonth: 'Chọn tháng',
    navPlan: 'Điều hướng kế hoạch',
    resetTitle: 'Xoá toàn bộ dữ liệu đã lưu',
    resetTxt: '↺ Đặt lại',
    todayTitle: 'Về hôm nay & tuần hiện tại',
    todayTxt: '📍 Hôm nay',
    nowAria: 'Ngày giờ hiện tại',
    tabOverview: '📅 Tổng quan tháng',
    tabYear: '🗓️ Năm {y}',
    weekN: 'Tuần {n}',
    viewOverview: 'Tổng quan tháng',
    overviewEyebrow: 'Không gian làm việc tháng',
    overviewTitle: 'Tổng quan {m}',
    overviewSubtitle: 'Theo dõi điều quan trọng, điều chỉnh nhịp độ và giữ đà mỗi ngày.',
    overviewMetricWeek: 'Tiến độ tuần',
    overviewMetricGoals: 'Mục tiêu hoàn thành',
    overviewMetricHabits: 'Thói quen hôm nay',
    overviewMetricStreak: 'Chuỗi hiện tại',
    overviewMetricWeekMeta: 'Tuần {n}',
    overviewMetricGoalsMeta: '{done}/{total} mục tiêu',
    overviewMetricHabitsMeta: '{done}/{total} thói quen',
    overviewMetricStreakMeta: 'ngày liên tiếp tốt nhất',
    overviewFocusTitle: 'Ưu tiên tiếp theo',
    overviewFocusEmpty: 'Chọn một mục tiêu quan trọng để bắt đầu.',
    overviewOpenWeek: 'Mở kế hoạch tuần',
    overviewHabitGridAria: 'Bảng theo dõi thói quen trong tháng',
    viewYear: 'Kế hoạch năm',
    viewWeek: 'Kế hoạch tuần',
    yearWorkspaceEyebrow: 'Không gian làm việc năm',
    yearPageTitle: 'Kế hoạch năm {y}',
    yearPageSubtitle: 'Biến mục tiêu dài hạn thành nhịp tiến bộ có thể theo dõi mỗi tháng.',
    yearSummaryGoals: 'Mục tiêu hoàn thành',
    yearSummaryAverage: 'Tiến độ trung bình',
    yearSummaryQuarter: 'Quý nổi bật',
    yearSummaryHabit: 'Thói quen dẫn đầu',
    weekWorkspaceEyebrow: 'Không gian làm việc tuần',
    weekPageTitle: 'Kế hoạch Tuần {n}',
    weekPageSubtitle: 'Chọn việc quan trọng, phân bổ theo ngày và giữ nhịp tập trung.',
    weekGoalsSummaryAria: 'Tổng quan mục tiêu tuần',
    weekProgressLabel: 'Tiến độ tuần',
    weekGoalsHeading: 'Mục tiêu tuần',
    weekHabitsHeading: 'Thói quen tuần',
    weekHabitsMeta: '{done}/{total} lượt hoàn thành',
    weekHabitsEmpty: 'Chưa có thói quen trong tháng này.',
    weekDaySelectorAria: 'Chuyển nhanh đến ngày trong tuần',
    weekJumpDay: 'Đi đến {day}',
    weekDaysHeading: 'Kế hoạch theo ngày',
    weekSupportAria: 'Công cụ và phản ánh tuần',
    brandSub: 'Kế hoạch tháng {n} · {y}',
    monthOption: 'Tháng {n} {y}',
    selWeekAria: 'Chọn tuần hiện tại',
    viewWeekT: 'Xem Tuần {n}',
    chicks10Aria: '10 chú gà con',
    goalsTitle: 'Mục tiêu tháng',
    unitGoals: 'mục tiêu',
    priLbl: 'Ưu tiên',
    regLbl: 'Thường',
    addGoal: '＋ Thêm mục tiêu',
    goalPh: 'Nhập mục tiêu mới...',
    goalNameAria: 'Tên mục tiêu mới {label}',
    editGoalAria: 'Sửa mục tiêu',
    delGoalAria: 'Xoá mục tiêu',
    noGoals: 'Chưa có mục tiêu nào',
    addTxt: 'Thêm',
    habitTitle: 'Thói quen',
    legendDone: 'Hoàn thành',
    legendNotDone: 'Chưa',
    statsDone: 'Hoàn thành',
    statsInProg: 'Đang thực hiện',
    statsTotal: 'Tổng cộng',
    yGoalsTitle: 'Mục tiêu năm {y}',
    weekBanner: '🌸 Mục tiêu & công việc tuần',
    habitPh: 'Tên thói quen mới...',
    habitNameAria: 'Tên thói quen mới',
    addHabitTxt: '＋ Thêm thói quen',
    renameAria: 'Đổi tên',
    delAria: 'Xoá',
    noHabits: 'Chưa có thói quen nào, thêm một thói quen mới nhé 🐥',
    habitCol: 'Thói quen',
    refTitle: 'Phản ánh',
    writeHere: 'Viết ở đây...',
    qEditPh: 'Sửa câu hỏi...',
    refQAria: 'Sửa câu hỏi phản ánh {n}',
    refAria: 'Viết phản ánh {n}',
    hmTitle: '🔥 Streak &amp; Heatmap',
    hmNoData: 'Chưa đủ dữ liệu tuần để so sánh 🐥',
    hmThis: 'Tuần này',
    hmLast: 'Tuần trước',
    hmCur: 'Chuỗi hiện tại',
    hmBest: 'Chuỗi dài nhất',
    hmLess: 'Ít',
    hmMore: 'Nhiều',
    hmDayFullT: '{m} {d}: {p}% hoàn thành',
    hmNoHabits: 'Chưa có thói quen nào',
    hmHeroDays: 'ngày liên tiếp',
    hmHeroRecLbl: 'kỷ lục',
    hmHeroNew: 'Kỷ lục mới! 🎉',
    hmHeroRec: 'còn {n} ngày để phá kỷ lục',
    hmHeroStart: 'Tick thói quen hôm nay để bắt đầu chuỗi 🔥',
    hmMiniT: '14 ngày gần nhất',
    yearTh: 'Năm',
    curMonthTh: 'Tháng hiện tại',
    monthTh: 'Tháng',
    curWeekTh: 'Tuần hiện tại',
    weeklyProg: 'Tiến độ tuần',
    motto: '4 điều bạn sẽ không bao giờ hối tiếc:<br>🌱 Sống kín đáo<br>📚 Sống kỷ luật<br>💼 Chăm lo chuyện của mình<br>💛 Yêu thương bản thân',
    chicks12Aria: '12 chú gà con',
    pullBtn: '📥 Lấy dữ liệu từ 12 tháng từ Dashboard',
    yGoalPh: 'Viết mục tiêu...',
    yGoalAria: 'Mục tiêu năm',
    addPriGoalAria: 'Thêm mục tiêu ưu tiên',
    addRegGoalAria: 'Thêm mục tiêu thường',
    progressYear: 'Tiến độ cả năm',
    quarterT: 'Quý',
    m12: '12 tháng',
    progress12: 'Tiến độ 12 tháng',
    qOverview: 'Tổng quan theo quý',
    mCardT: '12 Tháng · Mục tiêu &amp; ghi chú theo tháng',
    openMonthT: 'Mở kế hoạch tháng {n}',
    monthT: 'Tháng {n}',
    nowTag: ' · nay',
    writePh: 'Viết...',
    mGoalAria: 'Mục tiêu tháng {n}',
    noteBanner: 'Ghi chú',
    mNoteAria: 'Ghi chú tháng {n}',
    refQ: 'Phản ánh Q{n}',
    refQuarterAria: 'Viết phản ánh quý {n} mục {m}',
    refYearAria: 'Viết phản ánh năm mục {n}',
    refQuarters: 'Phản ánh quý',
    weekRange: 'Hôm nay ({a}) nằm ngoài phạm vi kế hoạch ({b} - {c})',
    prevWeek: '‹ Tuần trước',
    nextWeek: 'Tuần sau ›',
    priGoalsSub: 'Mục tiêu ưu tiên',
    regGoalsSub: 'Mục tiêu thường',
    wGoalAria: 'Mục tiêu tuần {n}',
    todayBadge: 'Hôm nay',
    taskPriSub: 'Task ưu tiên',
    taskRegSub: 'Task thường',
    taskPh: 'Viết task...',
    taskAria: 'Task {n}',
    delTaskAria: 'Xoá task {n}',
    addPriTaskAria: 'Thêm task ưu tiên',
    addRegTaskAria: 'Thêm task thường',
    noteAria: 'Ghi chú {name}',
    dayNames: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'],
    doneAria: '{p}% hoàn thành',
    lineAria: 'Biểu đồ tiến độ 12 tháng',
    lineMonthT: 'Tháng {n}: {p}%',
    resetConfirm: 'Xoá toàn bộ dữ liệu đã lưu của 12 tháng và đặt lại mặc định?',
    dataTitle: '💾 Dữ liệu của bạn',
    exportJson: '📤 Xuất JSON (sao lưu)',
    importJson: '📥 Nhập JSON (khôi phục)',
    exportCsv: '📊 Xuất CSV (Google Sheets)',
    csvNote: 'Sheet chia nhỏ theo Section để lọc trong Google Sheets',
    printTitle: 'In / Lưu PDF',
    remindTitle: '🔔 Nhắc việc hằng ngày',
    remindTimeLbl: 'Giờ nhắc',
    remindOn: 'Bật nhắc',
    remindOff: 'Tắt nhắc',
    remindNote: 'Trình duyệt sẽ nhắc bạn một lần mỗi ngày để điểm danh thói quen.',
    remindEnabled: 'Đã bật nhắc việc hằng ngày lúc {t}.',
    remindDisabled: 'Đã tắt nhắc việc.',
    remindDenied: 'Trình duyệt đang chặn thông báo. Hãy cho phép thông báo để nhận nhắc việc.',
    remindBody: 'Hôm nay bạn đã hoàn thành những mục tiêu nào? Vào điểm danh thói quen nhé! 🐥',
    importConfirm: 'Nhập file sẽ GHI ĐÈ dữ liệu hiện tại. Bạn chắc chắn muốn tiếp tục?',
    importError: 'File không hợp lệ: không phải file sao lưu TaskFlow-Todoist.',
    importOk: 'Đã nhập dữ liệu thành công! Trang sẽ tải lại.',
    rm0: 'Điều gì tôi đã làm tốt và muốn tiếp tục phát huy?',
    rm1: 'Bài học quan trọng nhất tôi rút ra được là gì?',
    rm2: 'Tôi biết ơn về việc ...',
    rm3: 'Ba mục tiêu tôi cần tập trung trong năm tiếp theo là?',
    rw3: 'Ba mục tiêu tôi cần tập trung trong tuần tiếp theo là?',
    rq3: 'Ba mục tiêu tôi cần tập trung trong quý tới là?',
    closeBtn: 'Đóng',
    syncTitle: 'Đồng bộ đám mây',
    syncDesc: 'Đăng nhập để đồng bộ dữ liệu giữa các thiết bị. Dữ liệu hiện tại sẽ tự động được nâng cấp lên đám mây.',
    syncLogin: 'Đăng nhập',
    syncSignup: 'Tạo tài khoản',
    syncLogout: 'Đăng xuất',
    syncStatusOff: 'Chưa kích hoạt đồng bộ đám mây',
    syncStatusConnecting: 'Đang kết nối...',
    syncStatusSyncing: 'Đang đồng bộ...',
    syncStatusReady: 'Đã đồng bộ ✓',
    syncStatusSignedOut: 'Chưa đăng nhập',
    syncStatusError: 'Lỗi đồng bộ',
    syncNeedEmail: 'Vui lòng nhập tên người dùng và mật khẩu',
    syncNeedUser: 'Vui lòng nhập tên người dùng và mật khẩu',
    syncUserInvalid: 'Tên người dùng gồm 3-30 ký tự chữ/số/_ . -',
    syncPassShort: 'Mật khẩu phải có ít nhất 6 ký tự',
    syncPassMismatch: 'Xác nhận mật khẩu không khớp',
    syncLoginErr: 'Đăng nhập thất bại, kiểm tra lại tên người dùng/mật khẩu',
    syncSignupOk: 'Đã tạo tài khoản! Đồng bộ tự động bắt đầu ✓',
    syncSignupErr: 'Tạo tài khoản thất bại, tên người dùng có thể đã tồn tại.',
    syncUserPh: 'Tên người dùng',
    syncPassPh: 'Mật khẩu',
    syncPass2Ph: 'Xác nhận mật khẩu',
    syncNoAccount: 'Chưa có tài khoản? Tạo ngay',
    syncHaveAccount: 'Đã có tài khoản? Đăng nhập',
    syncGoogle: 'Tiếp tục với Google',
    syncOr: 'hoặc bằng tài khoản',
    syncGoogleErr: 'Không mở được Google. Kiểm tra lại cấu hình OAuth trên backend (GOOGLE_CLIENT_ID/SECRET).',
    syncNeedConfig: 'Chưa cấu hình backend, điền URL API trong js/api-config.js',
    syncErrUsernameTaken: 'Tên người dùng đã tồn tại, thử tên khác.',
    syncErrBadCredentials: 'Sai tên người dùng hoặc mật khẩu.',
    syncErrNetwork: 'Không kết nối được máy chủ, kiểm tra lại URL trong js/api-config.js.',
    syncErrServer: 'Máy chủ báo lỗi, thử lại sau.',
    syncErrRateLimited: 'Quá nhiều lần thử đăng nhập. Đợi 15 phút rồi thử lại.',
    homeTitle: 'Về trang giới thiệu',
    installTitle: 'Cài đặt ứng dụng',
    targetAria: 'Mục tiêu {n}% — chỉnh số ngày cần đạt mỗi tháng',
    copyHabitsTxt: 'Sao chép sang tháng sau',
    copyHabitsDone: 'Đã sao chép {n} thói quen sang tháng sau (giữ streak 🔥, tick mới để lại trống).',
    reportTitle: 'Báo cáo tháng',
    reportGoalPct: 'Mục tiêu tháng',
    reportGoalsDone: 'Mục tiêu đã xong',
    reportHabitAvg: 'Thói quen trung bình',
    reportTopHabit: 'Chuỗi tốt nhất',
    reportRecord: 'Kỷ lục',
    reportActive: 'Ngày đã điểm danh',
    reportShare: 'Chia sẻ ảnh',
    reportCardTitle: 'Báo cáo {m} · {y}',
    badgesTitle: 'Huy hiệu',
    badge7: '🔥 7 ngày liên tiếp',
    badge30: '🔥🔥 30 ngày liên tiếp',
    badgeBest14: '🏆 Kỷ lục 14 ngày',
    badgeGoals100: '🎯 Hoàn thành mọi mục tiêu tháng',
    badgeHabit100: '💯 Mọi thói quen đạt mục tiêu',
    badgeActive15: '📅 Điểm danh 15 ngày',
    badgeNew: '🎖️ Huy hiệu mới: {b}!',
    badgeEarned: 'Đạt được tháng {m} · {y}',
    badgeHint7: 'Cần chuỗi 7 ngày liên tiếp',
    badgeHint30: 'Cần chuỗi 30 ngày liên tiếp',
    badgeHintBest14: 'Cần kỷ lục chuỗi 14 ngày',
    badgeHintGoals100: 'Cần 100% mục tiêu tháng',
    badgeHintHabit100: 'Cần mọi thói quen đạt mục tiêu',
    badgeHintActive15: 'Cần điểm danh ít nhất 15 ngày trong tháng',
    shareTitle: 'Chia sẻ streak 🔥',
    shareNamePrompt: 'Tên hiển thị trên tấm ảnh (bỏ trống = "Tôi")?',
    meName: 'Tôi',
    shareNoStreak: 'Tích thói quen hôm nay để có streak 🔥 rồi mới chia sẻ được nhé!',
    shareDone: 'Đã tải ảnh chia sẻ: taskflow-streak.png',
    shareFail: 'Không tạo được ảnh chia sẻ.',
    shareFooter: 'Kế hoạch năm 2026 · 100% offline',
    fbTitle: 'Góp ý / phản hồi',
    fbForm: '📝 Góp ý qua Google Form',
    fbMail: '📧 Gửi email',
    mailSubj: 'TaskFlow phản hồi',
    fbNoForm: 'Chưa có link Google Form, điền FB_FORM_URL trong js/app.js',
    obGoalTitle: 'Mục tiêu số 1 của năm nay là gì?',
    obGoalSub: 'Gợi ý nhanh: chọn một mục tiêu, hoặc tự gõ ở dưới:',
    obGoalPh: 'VD: Tiết kiệm 20 triệu',
    obNext: 'Tiếp tục →',
    obHabitTitle: '2 thói quen muốn xây dựng?',
    obHabitSub: 'Mỗi ngày tích ✓ một ô, app tự tính %, streak 🔥 và heatmap.',
    obHabitPh1: 'Thói quen 1, VD: Dậy lúc 5H sáng',
    obHabitPh2: 'Thói quen 2, VD: Đọc sách 30 phút',
    obThemeTitle: 'Chọn chủ đề màu cho kế hoạch',
    obThemeSub: 'Đổi bất cứ lúc nào bằng 4 chấm màu trên thanh trên.',
    themeLbl: 'Chọn chủ đề màu',
    themeCream: 'Chủ đề kem',
    themeMint: 'Chủ đề bạc hà',
    themeLavender: 'Chủ đề oải hương',
    themePeach: 'Chủ đề đào',
    darkTitle: 'Bật/tắt chế độ tối',
    langTitle: 'Đổi ngôn ngữ',
    landTitle: 'Lên kế hoạch năm, tháng &amp; tuần <em>theo cách dễ thương</em>',
    landSub: 'Chốt mục tiêu, điểm danh thói quen và ghi nhật ký reflection. Dữ liệu nằm ngay trong trình duyệt của bạn, miễn phí và riêng tư.',
    landCta: 'Khám phá kế hoạch',
    obDone: 'Bắt đầu kế hoạch 🚀',
    obSkip: 'Bỏ qua phần giới thiệu',
    obSugg1: 'Tiết kiệm 20 triệu',
    obSugg2: 'Đọc 24 cuốn sách',
    obSugg3: 'Chạy bộ 100 buổi',
    obSugg4: 'Học tiếng Anh giao tiếp',
    emptyGoalsT: 'Chưa có mục tiêu nào',
    emptyGoalsH: 'Bấm "+ Thêm mục tiêu" phía dưới để bắt đầu.',
    emptyHabitsT: 'Chưa có thói quen nào',
    emptyHabitsH: 'Nhập tên thói quen ở ô bên trên rồi bấm "+ Thêm thói quen".',
    /* ===== Phase 2: Tìm kiếm, Tag, Lịch, Template, Dashboard, Pomodoro ===== */
    searchTitle: 'Tìm kiếm xuyên tháng',
    searchPh: 'Nhập từ khoá... (mục tiêu, task, thói quen, phản ánh)',
    searchEmpty: 'Gõ ít nhất 2 ký tự để tìm kiếm.',
    searchNoResults: 'Không tìm thấy kết quả nào 🐥',
    searchGoal: 'Mục tiêu',
    searchHabit: 'Thói quen',
    searchTask: 'Task',
    searchNote: 'Ghi chú',
    searchReflect: 'Phản ánh',
    searchMonth: 'Tháng {n}',
    searchYear: 'Năm {y}',
    searchAll: 'Tất cả',
    searchOpenAria: 'Tìm kiếm xuyên tháng',
    tagLbl: 'Tag',
    tagAdd: '🏷️ Thêm tag',
    tagPh: 'Nhập tag rồi Enter (phân cách bằng dấu phẩy)',
    tagFilter: 'Lọc theo tag',
    tagAll: 'Tất cả',
    tagNoTags: 'Chưa có tag nào',
    tagAria: 'Thêm tag cho task',
    tabCalendar: '📅 Lịch',
    viewCalendar: 'Lịch tháng',
    calendarWorkspaceEyebrow: 'Lịch công việc',
    calendarPageTitle: 'Lịch {m} {y}',
    calendarPageSubtitle: 'Xem khối lượng theo ngày và lọc nhanh theo ngữ cảnh công việc.',
    calendarFilterAria: 'Lọc lịch theo tag',
    calendarAgendaTitle: 'Lịch trình trong tháng',
    calendarAgendaEmpty: 'Không có công việc phù hợp với bộ lọc hiện tại.',
    calendarTaskCount: '{n} công việc',
    calEmpty: 'Chưa có công việc',
    templateTitle: 'Sao chép cấu trúc tháng',
    templateDesc: 'Sao chép mục tiêu, thói quen & cấu trúc tuần (bỏ ô tick ✓) sang tháng khác.',
    templateSrc: 'Tháng nguồn',
    templateDst: 'Tháng đích',
    templateDo: '📋 Sao chép',
    templateDone: 'Đã sao chép cấu trúc tháng {src} sang {dst} (bỏ tick ✓).',
    templateNoData: 'Tháng nguồn chưa có dữ liệu.',
    templateSame: 'Chọn tháng đích khác tháng nguồn.',
    templateOpenT: 'Sao chép cấu trúc tháng',
    dashTitle: '📊 Dashboard',
    dashBestHabit: 'Thói quen tốt nhất',
    dashBestHabitSub: '{n} ngày tích',
    dashProdDay: 'Ngày năng suất nhất',
    dashProdDaySub: '{n} task xong',
    dashQuarter: 'Tỉ lệ theo quý',
    dashBestQuarter: 'Quý tốt nhất: Q{n} ({p}%)',
    dashGoalTotal: 'Mục tiêu năm',
    dashGoalDone: '{d}/{t} xong',
    pomoTitle: '🍅 Pomodoro',
    pomoStart: '▶ Bắt đầu',
    pomoPause: '⏸ Tạm dừng',
    pomoReset: '↺',
    pomoWork: 'Tập trung',
    pomoBreak: 'Nghỉ ngơi',
    pomoMin: '{n} phút',
    pomoDoneWork: 'Xong phiên tập trung! Nghỉ 5 phút nhé 🍅',
    pomoDoneBreak: 'Hết giờ nghỉ! Bắt đầu phiên mới 🍅',
    /* Phase 4 — Nhắc việc habit/task */
    remindHabitAria: 'Đặt nhắc việc cho thói quen',
    remindTaskAria: 'Đặt nhắc việc cho task',
    remindAdd: '＋ Thêm nhắc',
    remindPickKind: 'Loại',
    remindKindHabit: 'Thói quen',
    remindKindTask: 'Task',
    remindPickTarget: 'Chọn mục',
    remindPickTime: 'Giờ nhắc',
    remindSave: 'Lưu',
    remindListEmpty: 'Chưa có nhắc việc nào cho habit/task.',
    remindOffItem: 'Tắt nhắc này',
    remindSetDone: 'Đã đặt nhắc {kind} lúc {t} 🔔',
    remindItemBody: '🔔 {kind}: {name}',
    /* Phase 4 — Báo cáo tuần */
    weekReportTitle: 'Báo cáo tuần',
    weekReportGoalPct: 'Mục tiêu tuần',
    weekReportDone: 'Xong',
    weekReportInProg: 'Đang làm',
    weekReportTotal: 'Tổng',
    weekReportTopHabit: 'Thói quen nổi bật',
    weekReportBestDay: 'Ngày tốt nhất',
    weekReportClose: 'Đóng',
    weekReportShare: 'Chia sẻ',
    weekReportCardTitle: 'Báo cáo Tuần {n}',
    weekReportShareTxt: 'Tuần {n} · {p}%',
    weekReportDayT: 'Ngày {d}',
    /* Phase 4 — Widget Pomodoro */
    pomoWidgetTitle: '🍅 Pomodoro',
    pomoToday: 'Hôm nay',
    pomoWeek: 'Tuần này',
    pomoMinShort: '{n}p',
    pomoWidgetStats: '{today} · {week}',
    pomoWorkDoneTxt: 'Xong phiên tập trung! Nghỉ 5 phút nhé 🍅',
    pomoBreakDoneTxt: 'Hết giờ nghỉ! Bắt đầu phiên mới 🍅',
    pomoTomatoCounter: '🍅 {n}/{total}',
    pomoLongBreak: 'Nghỉ dài 🧘',
    pomoLongBreakDone: 'Hết giờ nghỉ dài! Bắt đầu chu kỳ mới 🍅',
    pomoSessionCount: 'Đã tập trung {n} lần',
    chatTitle: '🤖 Trợ lý học tập',
    chatWelcome: '👋 Chào bạn! Tôi là trợ lý học tập. Bạn cần hỗ trợ gì?',
    chatPh: 'Nhập câu hỏi của bạn...',
    chatSend: 'Gửi',
    helpTitle: 'Hướng dẫn sử dụng',
    helpContent: '<h3>📋 Các chức năng của TaskFlow-Todoist</h3><ul><li><b>📅 Tổng quan tháng:</b> Xem mục tiêu, thói quen và tiến độ tháng.</li><li><b>🗓️ Kế hoạch năm:</b> Mục tiêu năm, biểu đồ 12 tháng, phản ánh quý/năm.</li><li><b>📋 Kế hoạch tuần:</b> Mục tiêu & task theo ngày, thói quen, phản ánh, Pomodoro.</li><li><b>🎯 Mục tiêu:</b> Thêm/sửa/xoá mục tiêu ưu tiên và thường. Tick ✓ để đánh dấu hoàn thành.</li><li><b>🔥 Thói quen:</b> Theo dõi thói quen 31 ngày, tính % hoàn thành, streak và heatmap.</li><li><b>🍅 Pomodoro:</b> Timer tập trung 25 phút. Sau 4 lần tập trung sẽ được nghỉ dài 25 phút.</li><li><b>📝 Phản ánh:</b> Viết nhật ký reflection theo tuần, tháng, quý, năm.</li><li><b>🏷️ Tag:</b> Gắn tag cho task để lọc và tìm kiếm.</li><li><b>🔍 Tìm kiếm:</b> Tìm kiếm xuyên tháng (Ctrl+K).</li><li><b>📊 Dashboard:</b> Thống kê tổng quan năm.</li><li><b>🌙 Chế độ tối:</b> Bật/tắt giao diện tối.</li><li><b>🌐 Ngôn ngữ:</b> Chuyển đổi VI/EN.</li><li><b>🎯 Chế độ Tập trung:</b> Xem task & thói quen hôm nay trong giao diện tối giản.</li><li><b>↩️ Hoàn tác/Làm lại:</b> Ctrl+Z / Ctrl+Shift+Z.</li><li><b>💾 Dữ liệu:</b> Xuất/nhập JSON, CSV, sao lưu tự động, khôi phục.</li><li><b>☁️ Đồng bộ:</b> Đăng nhập để đồng bộ dữ liệu giữa các thiết bị.</li><li><b>📅 Lịch:</b> Xem task theo lịch tháng.</li><li><b>📋 Templates:</b> Sao chép cấu trúc tháng.</li><li><b>🎨 Chủ đề:</b> 4 chủ đề màu kem/bạc hà/oải hương/đào.</li><li><b>🤖 Trợ lý học tập:</b> Chatbot hỗ trợ lên kế hoạch học tập và trả lời câu hỏi.</li></ul><p>💡 <b>Mẹo:</b> Dùng phím số 1-5 để chuyển nhanh giữa các view.</p>',
    profileTitle: 'Tài khoản',
    profileUser: 'Tên người dùng: {u}',
    pwTitle: 'Đổi mật khẩu',
    pwCurrentPh: 'Mật khẩu hiện tại',
    pwNewPh: 'Mật khẩu mới',
    pwBtn: 'Đổi mật khẩu',
    pwOk: 'Đã đổi mật khẩu ✓',
    pwErr: 'Đổi mật khẩu thất bại. Kiểm tra mật khẩu hiện tại.',
    pwNeedLogin: 'Cần đăng nhập để đổi mật khẩu.',
    acctDeleteTitle: 'Xoá tài khoản',
    acctDeleteBtn: '🗑 Xoá tài khoản',
    acctDeleteConfirm: 'Xoá tài khoản sẽ xoá vĩnh viễn toàn bộ dữ liệu đám mây. Bạn chắc chắn?',
    acctDeleted: 'Đã xoá tài khoản.',
    acctDeleteErr: 'Không xoá được tài khoản, thử lại sau.',
    profileOpen: '👤 Tài khoản',
    /* ===== Phase 5 — Trải nghiệm & an toàn dữ liệu ===== */
    undoBtn: '↩️ Hoàn tác (Ctrl+Z)',
    redoBtn: '↪️ Làm lại (Ctrl+Shift+Z)',
    undoDone: 'Đã hoàn tác',
    redoDone: 'Đã làm lại',
    noUndo: 'Không có gì để hoàn tác',
    dragHint: 'Kéo để sắp xếp lại',
    reorderDone: 'Đã sắp xếp lại',
    shortcutHint: 'Phím tắt: Ctrl+K tìm kiếm · 1-5 chuyển view · / thêm task',
    backupRestore: 'Khôi phục bản sao lưu tự động',
    backupEmpty: 'Chưa có bản sao lưu nào. Bản sao lưu tự lưu sau mỗi lần bạn thay đổi dữ liệu.',
    backupRestoreDone: 'Đã khôi phục bản sao lưu! Trang sẽ tải lại.',
    backupRestoreConfirm: 'Khôi phục bản sao lưu sẽ GHI ĐÈ dữ liệu hiện tại. Tiếp tục?',
    backupSlot: '{n} key dữ liệu',
    focusTitle: '🎯 Chế độ Tập trung',
    focusToday: 'Task hôm nay',
    focusHabits: 'Thói quen hôm nay',
    focusClose: 'Đóng chế độ tập trung (Esc)',
    focusOpen: 'Chế độ Tập trung',
    focusNoTask: 'Hôm nay chưa có task nào 🐥',
    focusHabitDone: 'Đã xong hết thói quen hôm nay! 🎉',
    feedbackBtn: '💬 Góp ý / phản hồi',
    /* ===== Phase 6 — Cá nhân hoá & dữ liệu thông minh ===== */
    templatesTitle: '✨ Thói quen mẫu',
    templatesHint: 'Chọn nhanh một thói quen để thêm vào tháng này:',
    demoData: '✨ Tạo dữ liệu mẫu',
    demoDataDone: 'Đã tạo dữ liệu mẫu! Dùng Ctrl+Z nếu muốn hoàn tác.',
    moodTitle: 'Tâm trạng tháng',
    moodHint: 'Chạm emoji để ghi tâm trạng mỗi ngày',
    mood0: 'Rất buồn',
    mood1: 'Buồn',
    mood2: 'Bình thường',
    mood3: 'Vui',
    mood4: 'Tuyệt vời',
    moodInsight: 'Ngày vui có habit {g}% — cao hơn ngày buồn {d}% 🐥',
    moodInsightNone: 'Ghi vài ngày tâm trạng để xem insight của bạn.',
    moodPickAria: 'Chọn tâm trạng ngày {d}',
    moodPickTitle: 'Tâm trạng ngày {d}',
    moodClear: 'Xoá tâm trạng',
    yearReportTitle: 'Báo cáo năm',
    yearReportGoalPct: 'Mục tiêu năm',
    yearReportTopMonth: 'Tháng đỉnh cao',
    yearReportBestHabit: 'Habit nổi bật',
    yearReportProdDay: 'Ngày năng suất',
    yearReportShare: 'Chia sẻ ảnh',
    yearReportCardTitle: 'Tổng kết năm {y}',
    yearReportDaySub: 'tháng {m}',
    importCsv: '📥 Nhập CSV (khôi phục)',
    importCsvConfirm: 'Nhập CSV sẽ GỘP dữ liệu (không ghi đè mục trùng tên). Bạn chắc chắn muốn tiếp tục?',
    importCsvDone: 'Đã nhập CSV!',
    importCsvError: 'Không đọc được CSV. Đảm bảo file là bản xuất từ TaskFlow-Todoist.',
    digestNone: 'Hôm qua bạn điểm danh đủ thói quen! 🎉',
    /* ===== Phase 8: Widget Dashboard ===== */
    widgetSettings: 'Tuỳ chỉnh Widget',
    widgetSave: 'Lưu',
    widgetHide: 'Ẩn widget này',
    widgetShow: 'Hiện widget này',
    'widgetLabel_date-card': 'Ngày tháng',
    'widgetLabel_weekly-chart': 'Tiến độ tuần',
    'widgetLabel_scene-card': 'Ưu tiên tiếp theo',
    widgetLabel_goals: 'Mục tiêu tháng',
    widgetLabel_habits: 'Thói quen',
    'widgetLabel_streak-heatmap': 'Streak & Heatmap',
    widgetLabel_mood: 'Tâm trạng',
    widgetLabel_badges: 'Huy hiệu',
    'widgetLabel_year-dashboard': 'Dashboard',
    'widgetLabel_year-card': 'Thông tin năm',
    'widgetLabel_year-charts': 'Biểu đồ 12 tháng',
    'widgetLabel_year-goals': 'Mục tiêu năm',
    'widgetLabel_year-overview-ref': 'Tổng quan năm',
    'widgetLabel_year-quarters': 'Quý',
    'widgetLabel_year-months': '12 tháng',
    'widgetLabel_year-reflections': 'Phản ánh quý',
    'widgetLabel_year-heatmap': 'Habit Heatmap',
    digestBody: 'Hôm qua chưa điểm danh: {names}',
  },
  en: {
    navMonths: 'Navigate months',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    prevYear: 'Previous year',
    nextYear: 'Next year',
    selectMonth: 'Select month',
    navPlan: 'Plan navigation',
    resetTitle: 'Clear all saved data',
    resetTxt: '↺ Reset',
    todayTitle: 'Go to today & current week',
    todayTxt: '📍 Today',
    nowAria: 'Current date & time',
    tabOverview: '📅 Overview',
    tabYear: '🗓️ Year {y}',
    weekN: 'Week {n}',
    viewOverview: 'Month overview',
    overviewEyebrow: 'Monthly workspace',
    overviewTitle: '{m} overview',
    overviewSubtitle: 'Track what matters, adjust your pace, and keep momentum each day.',
    overviewMetricWeek: 'Weekly progress',
    overviewMetricGoals: 'Goals completed',
    overviewMetricHabits: 'Habits today',
    overviewMetricStreak: 'Current streak',
    overviewMetricWeekMeta: 'Week {n}',
    overviewMetricGoalsMeta: '{done}/{total} goals',
    overviewMetricHabitsMeta: '{done}/{total} habits',
    overviewMetricStreakMeta: 'best active run in days',
    overviewFocusTitle: 'Next priority',
    overviewFocusEmpty: 'Choose one important goal to get started.',
    overviewOpenWeek: 'Open weekly plan',
    overviewHabitGridAria: 'Monthly habit tracking table',
    viewYear: 'Year plan',
    viewWeek: 'Week plan',
    yearWorkspaceEyebrow: 'Annual workspace',
    yearPageTitle: '{y} plan',
    yearPageSubtitle: 'Turn long-term goals into a monthly rhythm you can review and improve.',
    yearSummaryGoals: 'Goals completed',
    yearSummaryAverage: 'Average progress',
    yearSummaryQuarter: 'Best quarter',
    yearSummaryHabit: 'Leading habit',
    weekWorkspaceEyebrow: 'Weekly workspace',
    weekPageTitle: 'Week {n} plan',
    weekPageSubtitle: 'Choose what matters, distribute the work, and protect your focus.',
    weekGoalsSummaryAria: 'Weekly goals overview',
    weekProgressLabel: 'Weekly progress',
    weekGoalsHeading: 'Weekly goals',
    weekHabitsHeading: 'Weekly habits',
    weekHabitsMeta: '{done}/{total} completions',
    weekHabitsEmpty: 'No habits in this month yet.',
    weekDaySelectorAria: 'Jump to a day in this week',
    weekJumpDay: 'Go to {day}',
    weekDaysHeading: 'Daily plan',
    weekSupportAria: 'Weekly tools and reflection',
    brandSub: '{m} {y}',
    monthOption: '{m} {y}',
    selWeekAria: 'Select current week',
    viewWeekT: 'View Week {n}',
    chicks10Aria: '10 little chicks',
    goalsTitle: 'Monthly Goals',
    unitGoals: 'goals',
    priLbl: 'Priority',
    regLbl: 'Regular',
    addGoal: '＋ Add goal',
    goalPh: 'Type a new goal...',
    goalNameAria: 'New {label} goal name',
    editGoalAria: 'Edit goal',
    delGoalAria: 'Delete goal',
    noGoals: 'No goals yet',
    addTxt: 'Add',
    habitTitle: 'Habits',
    legendDone: 'Done',
    legendNotDone: 'Not yet',
    statsDone: 'Completed',
    statsInProg: 'In Progress',
    statsTotal: 'Total',
    yGoalsTitle: '{y} goals',
    weekBanner: '🌸 Week goals & tasks',
    habitPh: 'New habit name...',
    habitNameAria: 'New habit name',
    addHabitTxt: '＋ Add habit',
    renameAria: 'Rename',
    delAria: 'Delete',
    noHabits: 'No habits yet, add one 🐥',
    habitCol: 'Habit',
    refTitle: 'Reflection',
    writeHere: 'Write here...',
    qEditPh: 'Edit question...',
    refQAria: 'Edit reflection question {n}',
    refAria: 'Reflection {n}',
    hmTitle: '🔥 Streak &amp; Heatmap',
    hmNoData: 'Not enough week data to compare 🐥',
    hmThis: 'This week',
    hmLast: 'Last week',
    hmCur: 'Current streak',
    hmBest: 'Best streak',
    hmLess: 'Less',
    hmMore: 'More',
    hmDayFullT: '{m} {d}: {p}% completed',
    hmNoHabits: 'No habits yet',
    hmHeroDays: 'day streak',
    hmHeroRecLbl: 'record',
    hmHeroNew: 'New record! 🎉',
    hmHeroRec: '{n} days to beat the record',
    hmHeroStart: 'Tick a habit today to start a streak 🔥',
    hmMiniT: 'Last 14 days',
    yearTh: 'Year',
    curMonthTh: 'Current Month',
    monthTh: 'Month',
    curWeekTh: 'Current Week',
    weeklyProg: 'Weekly Progress',
    motto: '4 things you will never regret:<br>🌱 Live quietly<br>📚 Live disciplined<br>💼 Mind your own business<br>💛 Love yourself',
    chicks12Aria: '12 little chicks',
    pullBtn: '📥 Pull goals from 12-month dashboard',
    yGoalPh: 'Type a goal...',
    yGoalAria: 'Year goal',
    addPriGoalAria: 'Add priority goal',
    addRegGoalAria: 'Add regular goal',
    progressYear: 'Yearly progress',
    quarterT: 'Quarter',
    m12: '12 months',
    progress12: '12-month progress',
    qOverview: 'Quarterly overview',
    mCardT: '12 Months · Goals &amp; notes by month',
    openMonthT: 'Open month {n} plan',
    monthT: 'Month {n}',
    nowTag: ' · now',
    writePh: 'Type...',
    mGoalAria: 'Month {n} goal',
    noteBanner: 'Note',
    mNoteAria: 'Month {n} note',
    refQ: 'Reflection Q{n}',
    refQuarterAria: 'Quarter {n} reflection {m}',
    refYearAria: 'Year reflection {n}',
    refQuarters: 'Quarterly reflections',
    weekRange: 'Today ({a}) is outside the plan range ({b} - {c})',
    prevWeek: '‹ Previous week',
    nextWeek: 'Next week ›',
    priGoalsSub: 'Priority goals',
    regGoalsSub: 'Regular goals',
    wGoalAria: 'Week goal {n}',
    todayBadge: 'Today',
    taskPriSub: 'Priority tasks',
    taskRegSub: 'Regular tasks',
    taskPh: 'Type a task...',
    taskAria: 'Task {n}',
    delTaskAria: 'Delete task {n}',
    addPriTaskAria: 'Add priority task',
    addRegTaskAria: 'Add regular task',
    noteAria: '{name} note',
    dayNames: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    doneAria: '{p}% completed',
    lineAria: '12-month progress chart',
    lineMonthT: 'Month {n}: {p}%',
    resetConfirm: 'Delete all saved data for 12 months and reset to defaults?',
    dataTitle: '💾 Your data',
    exportJson: '📤 Export JSON (backup)',
    importJson: '📥 Import JSON (restore)',
    exportCsv: '📊 Export CSV (Google Sheets)',
    csvNote: 'Sheet split into sections, filter in Google Sheets',
    printTitle: 'Print / Save PDF',
    remindTitle: '🔔 Daily reminder',
    remindTimeLbl: 'Remind at',
    remindOn: 'Turn on',
    remindOff: 'Turn off',
    remindNote: 'Your browser will remind you once a day to check in on your habits.',
    remindEnabled: 'Daily reminder enabled at {t}.',
    remindDisabled: 'Daily reminder turned off.',
    remindDenied: 'Your browser blocks notifications. Allow them to get reminders.',
    remindBody: 'What goals did you complete today? Time to check in on your habits! 🐥',
    importConfirm: 'Importing will OVERWRITE your current data. Continue?',
    importError: 'Invalid file: not a TaskFlow-Todoist backup.',
    importOk: 'Data imported successfully! The page will reload.',
    rm0: 'What did I do well that I want to keep doing?',
    rm1: 'What is the most important lesson I learned?',
    rm2: 'I am grateful for ...',
    rm3: 'Three goals I should focus on next year?',
    rw3: 'Three goals I should focus on next week?',
    rq3: 'Three goals I should focus on next quarter?',
    closeBtn: 'Close',
    syncTitle: 'Cloud sync',
    syncDesc: 'Sign in to sync data across devices. Your existing data will be automatically upgraded to the cloud.',
    syncLogin: 'Sign in',
    syncSignup: 'Create account',
    syncLogout: 'Sign out',
    syncStatusOff: 'Cloud sync not configured',
    syncStatusConnecting: 'Connecting...',
    syncStatusSyncing: 'Syncing...',
    syncStatusReady: 'Synced ✓',
    syncStatusSignedOut: 'Signed out',
    syncStatusError: 'Sync error',
    syncNeedEmail: 'Please enter username and password',
    syncNeedUser: 'Please enter username and password',
    syncUserInvalid: 'Username: 3-30 characters (letters, numbers, _ . -)',
    syncPassShort: 'Password must be at least 6 characters',
    syncPassMismatch: 'Passwords do not match',
    syncLoginErr: 'Sign in failed, check username/password',
    syncSignupOk: 'Account created! Sync started automatically ✓',
    syncSignupErr: 'Sign up failed, the username may already be taken.',
    syncUserPh: 'Username',
    syncPassPh: 'Password',
    syncPass2Ph: 'Confirm password',
    syncNoAccount: 'No account? Create one',
    syncHaveAccount: 'Have an account? Sign in',
    syncGoogle: 'Continue with Google',
    syncOr: 'or use an account',
    syncGoogleErr: 'Could not open Google. Check OAuth config on the backend (GOOGLE_CLIENT_ID/SECRET).',
    syncNeedConfig: 'Backend not configured, fill in the API URL in js/api-config.js',
    syncErrUsernameTaken: 'Username already taken, try another one.',
    syncErrBadCredentials: 'Wrong username or password.',
    syncErrNetwork: 'Cannot reach the server, check the URL in js/api-config.js.',
    syncErrServer: 'Server error, please try again later.',
    syncErrRateLimited: 'Too many login attempts. Try again in 15 minutes.',
    homeTitle: 'Back to the intro page',
    installTitle: 'Install app',
    targetAria: 'Target {n}% — adjust the days to reach each month',
    copyHabitsTxt: 'Copy to next month',
    copyHabitsDone: 'Copied {n} habits to next month (streak kept 🔥, ticks left blank).',
    reportTitle: 'Monthly report',
    reportGoalPct: 'Monthly goals',
    reportGoalsDone: 'Goals done',
    reportHabitAvg: 'Average habits',
    reportTopHabit: 'Best streak',
    reportRecord: 'Record',
    reportActive: 'Active days',
    reportShare: 'Share image',
    reportCardTitle: 'Report {m} · {y}',
    badgesTitle: 'Badges',
    badge7: '🔥 7-day streak',
    badge30: '🔥🔥 30-day streak',
    badgeBest14: '🏆 14-day record',
    badgeGoals100: '🎯 All monthly goals done',
    badgeHabit100: '💯 Every habit on target',
    badgeActive15: '📅 15 active days',
    badgeNew: '🎖️ New badge: {b}!',
    badgeEarned: 'Earned in {m} · {y}',
    badgeHint7: 'Reach a 7-day streak',
    badgeHint30: 'Reach a 30-day streak',
    badgeHintBest14: 'Reach a 14-day best streak',
    badgeHintGoals100: 'Complete 100% of monthly goals',
    badgeHintHabit100: 'Get every habit to its target',
    badgeHintActive15: 'Tick at least 15 days in a month',
    shareTitle: 'Share streak 🔥',
    shareNamePrompt: 'Name shown on the card (empty = "Me")?',
    meName: 'Me',
    shareNoStreak: 'Tick a habit today to build a streak 🔥 before sharing!',
    shareDone: 'Saved share image: taskflow-streak.png',
    shareFail: 'Could not create share image.',
    shareFooter: '2026 plan · 100% offline',
    fbTitle: 'Feedback',
    fbForm: '📝 Feedback via Google Form',
    fbMail: '📧 Send email',
    mailSubj: 'TaskFlow feedback',
    fbNoForm: 'No Google Form link yet, fill FB_FORM_URL in js/app.js',
    obGoalTitle: 'What is your #1 goal this year?',
    obGoalSub: 'Quick picks: choose one, or type your own below:',
    obGoalPh: 'e.g. Save 20 million VND',
    obNext: 'Continue →',
    obHabitTitle: '2 habits you want to build?',
    obHabitSub: 'Tick ✓ one cell every day, app tracks %, streak 🔥 and heatmap.',
    obHabitPh1: 'Habit 1, e.g. Wake up at 5AM',
    obHabitPh2: 'Habit 2, e.g. Read 30 minutes',
    obThemeTitle: 'Pick a color theme',
    obThemeSub: 'Change anytime via the 4 color dots up top.',
    themeLbl: 'Choose color theme',
    themeCream: 'Cream theme',
    themeMint: 'Mint theme',
    themeLavender: 'Lavender theme',
    themePeach: 'Peach theme',
    darkTitle: 'Toggle dark mode',
    langTitle: 'Switch language',
    landTitle: 'Plan your year, month &amp; week <em>in an adorable way</em>',
    landSub: 'Set goals, check off daily habits and keep a reflection journal. Your data lives right in your browser, free and private.',
    landCta: 'Explore your plan',
    obDone: 'Start planning 🚀',
    obSkip: 'Skip intro',
    obSugg1: 'Save 20 million VND',
    obSugg2: 'Read 24 books',
    obSugg3: 'Run 100 times',
    obSugg4: 'Speak English fluently',
    emptyGoalsT: 'No goals yet',
    emptyGoalsH: 'Tap "+ Add goal" below to get started.',
    emptyHabitsT: 'No habits yet',
    emptyHabitsH: 'Type a habit in the box above, then tap "+ Add habit".',
    /* ===== Phase 2: Search, Tags, Calendar, Template, Dashboard, Pomodoro ===== */
    searchTitle: 'Search across months',
    searchPh: 'Type to search... (goals, tasks, habits, reflections)',
    searchEmpty: 'Type at least 2 characters to search.',
    searchNoResults: 'No results found 🐥',
    searchGoal: 'Goal',
    searchHabit: 'Habit',
    searchTask: 'Task',
    searchNote: 'Note',
    searchReflect: 'Reflection',
    searchMonth: 'Month {n}',
    searchYear: 'Year {y}',
    searchAll: 'All',
    searchOpenAria: 'Search across months',
    tagLbl: 'Tag',
    tagAdd: '🏷️ Add tag',
    tagPh: 'Type a tag then Enter (comma-separated)',
    tagFilter: 'Filter by tag',
    tagAll: 'All',
    tagNoTags: 'No tags yet',
    tagAria: 'Add tag to task',
    tabCalendar: '📅 Calendar',
    viewCalendar: 'Month calendar',
    calendarWorkspaceEyebrow: 'Work calendar',
    calendarPageTitle: '{m} {y} calendar',
    calendarPageSubtitle: 'See daily workload and filter the month by work context.',
    calendarFilterAria: 'Filter calendar by tag',
    calendarAgendaTitle: 'Monthly agenda',
    calendarAgendaEmpty: 'No tasks match the current filters.',
    calendarTaskCount: '{n} tasks',
    calEmpty: 'No tasks',
    templateTitle: 'Copy month structure',
    templateDesc: 'Copy goals, habits & week structure (without ✓ ticks) to another month.',
    templateSrc: 'Source month',
    templateDst: 'Target month',
    templateDo: '📋 Copy',
    templateDone: 'Copied {src} structure to {dst} (ticks cleared).',
    templateNoData: 'Source month has no data yet.',
    templateSame: 'Pick a target month different from the source.',
    templateOpenT: 'Copy month structure',
    dashTitle: '📊 Dashboard',
    dashBestHabit: 'Best habit',
    dashBestHabitSub: '{n} days checked',
    dashProdDay: 'Most productive day',
    dashProdDaySub: '{n} tasks done',
    dashQuarter: 'Quarterly ratio',
    dashBestQuarter: 'Best quarter: Q{n} ({p}%)',
    dashGoalTotal: 'Year goals',
    dashGoalDone: '{d}/{t} done',
    pomoTitle: '🍅 Pomodoro',
    pomoStart: '▶ Start',
    pomoPause: '⏸ Pause',
    pomoReset: '↺',
    pomoWork: 'Focus',
    pomoBreak: 'Break',
    pomoMin: '{n} min',
    pomoDoneWork: 'Focus session done! Take a 5-min break 🍅',
    pomoDoneBreak: 'Break over! Start a new session 🍅',
    pomoWorkDoneTxt: 'Focus session done! Take a 5-min break 🍅',
    pomoBreakDoneTxt: 'Break over! Start a new session 🍅',
    pomoTomatoCounter: '🍅 {n}/{total}',
    pomoLongBreak: 'Long break 🧘',
    pomoLongBreakDone: 'Long break done! Start a new cycle 🍅',
    pomoSessionCount: 'Focused {n} times',
    chatTitle: '🤖 Study Assistant',
    chatWelcome: '👋 Hi! I am your study assistant. How can I help you?',
    chatPh: 'Type your question...',
    chatSend: 'Send',
    helpTitle: 'User Guide',
    helpContent: '<h3>📋 TaskFlow-Todoist Features</h3><ul><li><b>📅 Month Overview:</b> View monthly goals, habits and progress.</li><li><b>🗓️ Year Plan:</b> Year goals, 12-month chart, quarter/year reflections.</li><li><b>📋 Week Plan:</b> Daily goals & tasks, habits, reflections, Pomodoro.</li><li><b>🎯 Goals:</b> Add/edit/delete priority & regular goals. Tick ✓ to mark done.</li><li><b>🔥 Habits:</b> Track 31-day habits, calculate %, streak and heatmap.</li><li><b>🍅 Pomodoro:</b> 25-min focus timer. After 4 focus sessions, take a 25-min long break.</li><li><b>📝 Reflection:</b> Write reflection journals by week, month, quarter, year.</li><li><b>🏷️ Tags:</b> Tag tasks for filtering and searching.</li><li><b>🔍 Search:</b> Search across months (Ctrl+K).</li><li><b>📊 Dashboard:</b> Year overview statistics.</li><li><b>🌙 Dark Mode:</b> Toggle dark interface.</li><li><b>🌐 Language:</b> Switch VI/EN.</li><li><b>🎯 Focus Mode:</b> View today tasks & habits in a minimalist interface.</li><li><b>↩️ Undo/Redo:</b> Ctrl+Z / Ctrl+Shift+Z.</li><li><b>💾 Data:</b> Export/import JSON, CSV, auto backup, restore.</li><li><b>☁️ Sync:</b> Sign in to sync data across devices.</li><li><b>📅 Calendar:</b> View tasks in monthly calendar.</li><li><b>📋 Templates:</b> Copy month structure.</li><li><b>🎨 Themes:</b> 4 color themes: cream/mint/lavender/peach.</li><li><b>🤖 Study Assistant:</b> Chatbot for study planning and answering questions.</li></ul><p>💡 <b>Tip:</b> Use number keys 1-5 to quickly switch between views.</p>',
    /* Phase 4 — habit/task reminders */
    remindHabitAria: 'Set reminder for habit',
    remindTaskAria: 'Set reminder for task',
    remindAdd: '＋ Add reminder',
    remindPickKind: 'Type',
    remindKindHabit: 'Habit',
    remindKindTask: 'Task',
    remindPickTarget: 'Pick item',
    remindPickTime: 'Remind at',
    remindSave: 'Save',
    remindListEmpty: 'No habit/task reminders yet.',
    remindOffItem: 'Turn off this reminder',
    remindSetDone: 'Reminder set for {kind} at {t} 🔔',
    remindItemBody: '🔔 {kind}: {name}',
    /* Phase 4 — Weekly report */
    weekReportTitle: 'Weekly report',
    weekReportGoalPct: 'Week goals',
    weekReportDone: 'Done',
    weekReportInProg: 'In progress',
    weekReportTotal: 'Total',
    weekReportTopHabit: 'Top habit',
    weekReportBestDay: 'Best day',
    weekReportClose: 'Close',
    weekReportShare: 'Share',
    weekReportCardTitle: 'Week {n} report',
    weekReportShareTxt: 'Week {n} · {p}%',
    weekReportDayT: 'Day {d}',
    /* Phase 4 — Pomodoro widget */
    pomoWidgetTitle: '🍅 Pomodoro',
    pomoToday: 'Today',
    pomoWeek: 'This week',
    pomoMinShort: '{n} min',
    pomoWidgetStats: '{today} · {week}',
    profileTitle: 'Account',
    profileUser: 'Username: {u}',
    pwTitle: 'Change password',
    pwCurrentPh: 'Current password',
    pwNewPh: 'New password',
    pwBtn: 'Change password',
    pwOk: 'Password changed ✓',
    pwErr: 'Could not change password. Check your current password.',
    pwNeedLogin: 'Sign in to change your password.',
    acctDeleteTitle: 'Delete account',
    acctDeleteBtn: '🗑 Delete account',
    acctDeleteConfirm: 'Deleting your account permanently removes all cloud data. Are you sure?',
    acctDeleted: 'Account deleted.',
    acctDeleteErr: 'Could not delete the account, try again later.',
    profileOpen: '👤 Account',
    /* ===== Phase 5 — UX & data safety ===== */
    undoBtn: '↩️ Undo (Ctrl+Z)',
    redoBtn: '↪️ Redo (Ctrl+Shift+Z)',
    undoDone: 'Undone',
    redoDone: 'Redone',
    noUndo: 'Nothing to undo',
    dragHint: 'Drag to reorder',
    reorderDone: 'Reordered',
    shortcutHint: 'Shortcuts: Ctrl+K search · 1-5 switch view · / add task',
    backupRestore: 'Restore auto backup',
    backupEmpty: 'No backups yet. Backups are saved automatically after each change.',
    backupRestoreDone: 'Backup restored! The page will reload.',
    backupRestoreConfirm: 'Restoring a backup will OVERWRITE current data. Continue?',
    backupSlot: '{n} data keys',
    focusTitle: '🎯 Focus Mode',
    focusToday: "Today's tasks",
    focusHabits: "Today's habits",
    focusClose: 'Close focus mode (Esc)',
    focusOpen: 'Focus Mode',
    focusNoTask: 'No tasks today 🐥',
    focusHabitDone: 'All habits done today! 🎉',
    feedbackBtn: '💬 Feedback',
    /* ===== Phase 6 — Personalization & insights ===== */
    templatesTitle: '✨ Habit ideas',
    templatesHint: 'Pick a habit idea to add to this month:',
    demoData: '✨ Add sample data',
    demoDataDone: 'Sample data added! Press Ctrl+Z to undo.',
    moodTitle: 'Monthly mood',
    moodHint: 'Tap an emoji to log your daily mood',
    mood0: 'Very low',
    mood1: 'Low',
    mood2: 'Okay',
    mood3: 'Happy',
    mood4: 'Amazing',
    moodInsight: 'Happy days score {g}% habits — {d}% higher than low days 🐥',
    moodInsightNone: 'Log a few moods to see your insights.',
    moodPickAria: 'Pick mood for day {d}',
    moodPickTitle: 'Mood for day {d}',
    moodClear: 'Clear mood',
    yearReportTitle: 'Year report',
    yearReportGoalPct: 'Year goals',
    yearReportTopMonth: 'Peak month',
    yearReportBestHabit: 'Top habit',
    yearReportProdDay: 'Most productive day',
    yearReportShare: 'Share image',
    yearReportCardTitle: 'Year {y} in review',
    yearReportDaySub: 'month {m}',
    importCsv: '📥 Import CSV (restore)',
    importCsvConfirm: 'Importing CSV will MERGE data (duplicates by name will not overwrite). Continue?',
    importCsvDone: 'CSV imported!',
    importCsvError: 'Could not read CSV. Make sure it is a TaskFlow-Todoist export.',
    digestNone: 'All habits ticked yesterday! 🎉',
    /* ===== Phase 8: Widget Dashboard ===== */
    widgetSettings: 'Customize Widgets',
    widgetSave: 'Save',
    widgetHide: 'Hide this widget',
    widgetShow: 'Show this widget',
    'widgetLabel_date-card': 'Date card',
    'widgetLabel_weekly-chart': 'Weekly progress',
    'widgetLabel_scene-card': 'Next priority',
    widgetLabel_goals: 'Monthly goals',
    widgetLabel_habits: 'Habits',
    'widgetLabel_streak-heatmap': 'Streak & Heatmap',
    widgetLabel_mood: 'Mood',
    widgetLabel_badges: 'Badges',
    'widgetLabel_year-dashboard': 'Dashboard',
    'widgetLabel_year-card': 'Year info',
    'widgetLabel_year-charts': '12-month chart',
    'widgetLabel_year-goals': 'Year goals',
    'widgetLabel_year-overview-ref': 'Year overview',
    'widgetLabel_year-quarters': 'Quarters',
    'widgetLabel_year-months': '12 months',
    'widgetLabel_year-reflections': 'Quarterly reflections',
    'widgetLabel_year-heatmap': 'Habit Heatmap',
    digestBody: 'Missed yesterday: {names}',
  },
};

let LANG = 'vi';
try { LANG = localStorage.getItem('planner-lang') || 'vi'; } catch (e) { /* ẩn */ }
if (LANG !== 'vi' && LANG !== 'en') LANG = 'vi';

function t(key, vars) {
  const dict = I18N[LANG] || I18N.vi;
  let s = dict[key] != null ? dict[key] : I18N.vi[key] != null ? I18N.vi[key] : key;
  if (vars) Object.keys(vars).forEach((k) => { s = s.split('{' + k + '}').join(String(vars[k])); });
  return s;
}

function monthLabel(m) {
  return LANG === 'vi' ? MONTH_NAMES_VI[m] : MONTH_NAMES[m];
}
function dayLabel(d) {
  const names = t('dayNames');
  return Array.isArray(names) ? names[d] : DAYS[d].name;
}
function dateLocale() { return LANG === 'vi' ? 'vi-VN' : 'en-GB'; }

function applyStaticI18N() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  const b = document.getElementById('langBtn');
  if (b) {
    const label = b.querySelector('span:last-child');
    if (label) label.textContent = LANG === 'vi' ? 'EN' : 'VI';
    else b.textContent = LANG === 'vi' ? 'EN' : 'VI';
  }
}

function setLang(l) {
  if (l !== 'vi' && l !== 'en') l = 'vi';
  LANG = l;
  try { localStorage.setItem('planner-lang', l); } catch (e) { /* ẩn */ }
  if (window.Sync) window.Sync.push('planner-lang');
  applyStaticI18N();
  setSyncMode(syncMode);
  updateBrand();
  buildNav();
  if (state.view === 'overview') renderOverview();
  else if (state.view === 'week') renderWeek();
  else if (state.view === 'calendar') renderCalendar();
  else renderYear();
  updateNav();
  save();
}

/* ============================ Chủ đề màu ============================ */

let THEME = 'cream';
try { THEME = localStorage.getItem('planner-theme') || 'cream'; } catch (e) { /* ẩn */ }
const THEMES = ['cream', 'mint', 'lavender', 'peach'];
if (!THEMES.includes(THEME)) THEME = 'cream';

function setTheme(th) {
  if (!THEMES.includes(th)) th = 'cream';
  THEME = th;
  try { localStorage.setItem('planner-theme', th); } catch (e) { /* ẩn */ }
  if (window.Sync) window.Sync.push('planner-theme');
  document.documentElement.dataset.theme = th;
  document.querySelectorAll('.theme-dot').forEach((d) => d.classList.toggle('active', d.dataset.theme === th));
}

/* ============ Chế độ tối (dark mode) ============ */
let DARK = null; // null = theo hệ thống (prefers-color-scheme)
try { DARK = localStorage.getItem('planner-dark'); } catch (e) { /* ẩn */ }
DARK = DARK === '1' ? true : DARK === '0' ? false : null;

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function prefersReducedMotion(matchMedia = window.matchMedia) {
  return Boolean(matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function darkIsOn() { return DARK === null ? systemPrefersDark() : DARK; }

function applyDark() {
  const on = darkIsOn();
  document.documentElement.dataset.dark = on ? 'true' : 'false';
  const btn = document.getElementById('btnDark');
  if (btn) btn.textContent = on ? '☀️' : '🌙';
  const mc = document.querySelector('meta[name="theme-color"]');
  if (mc) mc.setAttribute('content', on ? '#1b1917' : '#f4f0e9');
}

function toggleDark() {
  DARK = !darkIsOn();
  try { localStorage.setItem('planner-dark', DARK ? '1' : '0'); } catch (e) { /* ẩn */ }
  applyDark();
}

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (DARK === null) applyDark();
  });
}

/* ============================ Analytics (GA4) ============================ */

// 👉 Thay 'G-XXXXXXXXXX' bằng Measurement ID của bạn:
// Google Analytics → Quản trị → Luồng dữ liệu → Web → đo ID (định dạng G-XXXXXXXXXX)
const GA4_ID = 'G-XXXXXXXXXX';
const GA4_ENABLED = !!(GA4_ID && !GA4_ID.startsWith('G-XXXX'));

// 👉 Link Google Form nhận góp ý (Giai đoạn 5 — Feedback):
// Tạo form tại https://forms.google.com rồi dán link dạng .../viewform vào đây
const FB_FORM_URL = '';
// 👉 Email nhận góp ý (dự phòng khi chưa có form)
const FB_EMAIL = '';

function initAnalytics() {
  if (!GA4_ENABLED) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
  document.head.appendChild(s);
  gtag('js', new Date());
  gtag('config', GA4_ID, { anonymize_ip: true });
  try {
    const now = Date.now();
    if (!localStorage.getItem('planner-ga-first')) {
      localStorage.setItem('planner-ga-first', '1');
      gtag('event', 'first_visit');
    } else {
      const last = localStorage.getItem('planner-ga-last');
      if (last) {
        gtag('event', 'return_visit', {
          days_since: Math.max(0, Math.floor((now - new Date(last).getTime()) / 86400000)),
        });
      }
    }
    localStorage.setItem('planner-ga-last', new Date().toISOString());
  } catch (e) { /* ẩn */ }
}

function trackEvent(name, params) {
  if (!GA4_ENABLED || !window.gtag) return;
  try { gtag('event', name, params || {}); } catch (e) { /* ẩn */ }
}

/* ============================ PWA ============================ */

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* ẩn */ });
  });
}

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const b = document.getElementById('btnInstall');
  if (b) b.hidden = false;
});

window.addEventListener('appinstalled', () => {
  trackEvent('pwa_install');
  const b = document.getElementById('btnInstall');
  if (b) b.hidden = true;
  deferredPrompt = null;
});

/* ---------- Nhắc việc hằng ngày ---------- */

function getRemindTime() {
  try { return localStorage.getItem('planner-remind'); } catch (e) { return null; }
}
function setRemindTime(v) {
  try { if (v) localStorage.setItem('planner-remind', v); else localStorage.removeItem('planner-remind'); } catch (e) { /* ẩn */ }
}

function requestRemindPermission() {
  if (!('Notification' in window)) return Promise.resolve(true);
  if (Notification.permission === 'granted') return Promise.resolve(true);
  const p = Notification.requestPermission();
  if (p && typeof p.then === 'function') return p.then((v) => v === 'granted');
  return Promise.resolve(true);
}

function registerPeriodicReminder() {
  if (!('serviceWorker' in navigator) || !('periodicSync' in navigator.serviceWorker)) return;
  navigator.serviceWorker.ready.then((reg) => {
    if (!('periodicSync' in reg)) return;
    navigator.permissions.query({ name: 'periodic-background-sync' }).then((status) => {
      if (status.state !== 'granted') return;
      const res = reg.periodicSync.register('daily-reminder', { minInterval: 24 * 60 * 60 * 1000 });
      if (res && typeof res.catch === 'function') res.catch(() => { /* ẩn */ });
    }).catch(() => { /* ẩn */ });
  }).catch(() => { /* ẩn */ });
}

function enableReminder() {
  const input = document.getElementById('remindTime');
  const time = input && input.value ? input.value : '20:00';
  requestRemindPermission().then((granted) => {
    if (!granted) { TaskFlowUI.toast(t('remindDenied'), 'error'); return; }
    setRemindTime(time);
    registerPeriodicReminder();
    TaskFlowUI.toast(t('remindEnabled', { t: time }), 'success');
    trackEvent('reminder_enabled');
  });
}

function disableReminder() {
  setRemindTime(null);
  TaskFlowUI.toast(t('remindDisabled'), 'info');
  trackEvent('reminder_disabled');
}

let lastRemindDay = '';
function checkDailyReminder() {
  const time = getRemindTime();
  if (!time) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const dayKey = now.toDateString();
  if (lastRemindDay === dayKey) return;
  const [hh, mm] = time.split(':').map(Number);
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
  if (now < target) return;
  try {
    if (localStorage.getItem('planner-remind-shown') === dayKey) return;
    localStorage.setItem('planner-remind-shown', dayKey);
  } catch (e) { /* ẩn */ }
  lastRemindDay = dayKey;
  new Notification('TaskFlow-Todoist 🐥', {
    body: t('remindBody'),
    icon: './icons/icon-192.png',
    tag: 'daily-reminder',
  });
}

/* ---------- Nhắc việc theo habit/task (Phase 4) ---------- */

let itemRemindTimers = [];

// Lên lịch 1 mốc nhắc cho item (lần kế tiếp trong ngày, hoặc ngày mai nếu đã qua).
function scheduleItemReminder(it, from) {
  const [hh, mm] = String(it.time || '20:00').split(':').map(Number);
  let target = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hh, mm, 0, 0);
  if (target <= from) target = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, hh, mm, 0, 0);
  const delay = target.getTime() - from.getTime();
  if (delay > 2147483647) return; // setTimeout max ~24.8 ngày — mọi mốc nhắc trong ngày đều < 24h
  const timer = setTimeout(() => {
    try {
      new Notification('TaskFlow-Todoist 🐥', {
        body: t('remindItemBody', { kind: t(it.kind === 'habit' ? 'remindKindHabit' : 'remindKindTask'), name: it.name }),
        icon: './icons/icon-192.png',
        tag: 'item-reminder',
      });
      trackEvent('reminder_show', { kind: it.kind });
    } catch (e) { /* ẩn */ }
    // Tự lên lịch lại cho ngày hôm sau (app mở lâu không mất nhắc)
    scheduleItemReminder(it, new Date(target.getTime() + 86400000));
  }, delay);
  itemRemindTimers.push(timer);
}

// Quét state hiện tại, lên lịch setTimeout cho từng habit/task đã bật nhắc.
function syncReminderTimers() {
  itemRemindTimers.forEach(clearTimeout);
  itemRemindTimers = [];
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const items = [];
  state.habits.forEach((h) => { if (h.remind && h.remind.enabled) items.push({ kind: 'habit', name: h.name, time: h.remind.time }); });
  state.weeks.forEach((w) => (w.days || []).forEach((d) => (d.tasks || []).forEach((tk) => {
    if (tk.remind && tk.remind.enabled && tk.text) items.push({ kind: 'task', name: tk.text, time: tk.remind.time });
  })));
  const now = new Date();
  items.forEach((it) => scheduleItemReminder(it, now));
}

// Điền danh sách nhắc đang bật vào popup remindPop.
function renderRemindList() {
  const list = document.getElementById('remindList');
  if (!list) return;
  const rows = [];
  state.habits.forEach((h) => {
    if (h.remind && h.remind.enabled) rows.push({ kind: 'habit', id: h.id, name: h.name, time: h.remind.time });
  });
  state.weeks.forEach((w) => (w.days || []).forEach((d) => (d.tasks || []).forEach((tk, ti) => {
    if (tk.remind && tk.remind.enabled && tk.text) rows.push({ kind: 'task', week: w.n, day: d.date, task: ti, name: tk.text, time: tk.remind.time });
  })));
  list.innerHTML = rows.length
    ? rows.map((r) => `
      <div class="remind-item">
        <span class="remind-item-name">${esc(r.kind === 'habit' ? '🔔 ' + r.name : '📋 ' + r.name)}</span>
        <span class="remind-item-time">${esc(r.time)}</span>
        <button type="button" class="mini-btn" data-action="remind-off-item" data-kind="${r.kind}" ${r.kind === 'habit' ? `data-id="${esc(r.id)}"` : `data-week="${r.week}" data-day="${esc(r.day)}" data-task="${r.task}"`} title="${t('remindOffItem')}" aria-label="${t('remindOffItem')}">✕</button>
      </div>`).join('')
    : `<p class="pop-note">${t('remindListEmpty')}</p>`;
}

// Inline picker giờ nhắc (pattern beginTagEdit): nhấn 🔔 → input time + nút lưu ngay cạnh nút.
function beginRemindEdit(btn) {
  const kind = btn.dataset.action === 'remind-habit' ? 'habit' : 'task';
  const host = kind === 'habit' ? btn.closest('.habit-name-cell') : btn.closest('.task-row');
  if (!host) return;
  const existing = host.querySelector('.remind-edit-input');
  if (existing) { existing.remove(); return; }
  const wrap = document.createElement('span');
  wrap.className = 'remind-edit-input';
  const input = document.createElement('input');
  input.type = 'time';
  const cur = kind === 'habit'
    ? state.habits.find((h) => h.id === btn.dataset.id)
    : state.weeks[+btn.dataset.week - 1] && state.weeks[+btn.dataset.week - 1].days[+btn.dataset.day] && state.weeks[+btn.dataset.week - 1].days[+btn.dataset.day].tasks[+btn.dataset.task];
  input.value = (cur && cur.remind && cur.remind.time) || '20:00';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'mini-btn add-btn';
  save.textContent = t('remindSave');
  const off = document.createElement('button');
  off.type = 'button';
  off.className = 'mini-btn';
  off.textContent = '✕';
  wrap.appendChild(input);
  wrap.appendChild(save);
  wrap.appendChild(off);
  // Chèn vào đúng cha trực tiếp của nút (item-actions với habit, task-row với task)
  btn.parentElement.insertBefore(wrap, btn.nextSibling);
  input.focus();
  const commit = () => {
    const target = kind === 'habit'
      ? state.habits.find((h) => h.id === btn.dataset.id)
      : state.weeks[+btn.dataset.week - 1] && state.weeks[+btn.dataset.week - 1].days[+btn.dataset.day] && state.weeks[+btn.dataset.week - 1].days[+btn.dataset.day].tasks[+btn.dataset.task];
    if (!target) { wrap.remove(); return; }
    target.remind = { enabled: true, time: input.value || '20:00' };
    wrap.remove();
    renderRemindList();
    if (kind === 'habit') renderOverview(); else renderWeek();
    save();
    syncReminderTimers();
    trackEvent('reminder_item_set', { kind });
    TaskFlowUI.toast(t('remindSetDone', { kind: t(kind === 'habit' ? 'remindKindHabit' : 'remindKindTask'), t: target.remind.time }), 'success');
  };
  save.addEventListener('click', commit);
  off.addEventListener('click', () => wrap.remove());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') wrap.remove();
  });
}

// Tắt nhắc của 1 habit/task từ danh sách trong remindPop.
function turnOffRemind(el) {
  const kind = el.dataset.kind;
  const target = kind === 'habit'
    ? state.habits.find((h) => h.id === el.dataset.id)
    : state.weeks[+el.dataset.week - 1] && state.weeks[+el.dataset.week - 1].days.find((d) => String(d.date) === el.dataset.day) && state.weeks[+el.dataset.week - 1].days.find((d) => String(d.date) === el.dataset.day).tasks[+el.dataset.task];
  if (!target) return;
  if (target.remind) target.remind.enabled = false;
  renderRemindList();
  if (kind === 'habit') renderOverview(); else renderWeek();
  save();
  syncReminderTimers();
  trackEvent('reminder_item_off', { kind });
}

/* ---------- Phase 7.1: Chỉnh sửa lặp lại task (repeat-edit) ---------- */

function beginRepeatEdit(btn) {
  const host = btn.closest('.task-row');
  if (!host) return;
  const existing = host.querySelector('.repeat-edit-input');
  if (existing) { existing.remove(); return; }
  const wrap = document.createElement('span');
  wrap.className = 'repeat-edit-input';
  wrap.style.cssText = 'display:inline-flex;gap:4px;align-items:center;font-size:11px;';
  const sel = document.createElement('select');
  sel.innerHTML = '<option value="">' + t('repeatOff') + '</option><option value="daily">' + t('repeatDaily') + '</option><option value="weekly">' + t('repeatWeekly') + '</option><option value="monthly">' + t('repeatMonthly') + '</option>';
  const w = state.weeks[+btn.dataset.week - 1];
  const d = w && w.days[+btn.dataset.day];
  const tk = d && d.tasks[+btn.dataset.task];
  if (tk && tk.repeat && tk.repeat.freq) sel.value = tk.repeat.freq;
  sel.addEventListener('change', () => {
    if (!tk) return;
    if (sel.value) tk.repeat = { freq: sel.value, every: 1 };
    else tk.repeat = null;
    renderWeek(); save(); trackEvent('repeat_set');
  });
  wrap.appendChild(sel);
  btn.parentElement.insertBefore(wrap, btn.nextSibling);
  sel.focus();
}

/* ---------- Phase 7.1: Tự sinh task lặp lại ---------- */

function applyRecurrence() {
  // Lỗi cũ: scan "alreadyExists" quét cả ngày quá khứ (gồm chính task đang xét) → luôn
  // true → không bao giờ sinh; giờ chuyển logic thuần sang PlanMath.planRecurrence
  // (chỉ so sánh với task từ hôm nay trở đi) và push bản sao vào ĐÚNG ngày hôm nay.
  const ti = nowInfo();
  if (!ti.inRange || !window.PlanMath || !window.PlanMath.planRecurrence) return; // hôm nay ngoài kỳ kế hoạch → không có chỗ sinh
  const todayDay = state.weeks[ti.week - 1] && state.weeks[ti.week - 1].days[ti.dayInWeek];
  if (!todayDay) return;
  const plan = window.PlanMath.planRecurrence(state.weeks, ti.dayIdx);
  plan.mark.forEach((t) => { t._recurred = true; });
  plan.copies.forEach((c) => todayDay.tasks.push(c));
}

/* ============================ Xuất / Nhập dữ liệu ============================ */

function collectAllData() {
  const out = { app: 'taskflow-todoist', version: 1, exportedAt: new Date().toISOString(), keys: {} };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('planner-') || k === LEGACY_KEY) out.keys[k] = localStorage.getItem(k);
    }
  } catch (e) { /* ẩn */ }
  return out;
}

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

function exportJSON() {
  const date = new Date().toISOString().slice(0, 10);
  downloadFile('taskflow-todoist-backup-' + date + '.json', JSON.stringify(collectAllData(), null, 2), 'application/json');
  trackEvent('export_json');
}

function csvRow(row) {
  return row.map((c) => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',');
}

function exportCSV() {
  const date = new Date().toISOString().slice(0, 10);
  let rows;
  if (window.PlanStats) {
    // Hàm thuần: dựng toàn bộ rows từ 12 state tháng + yearState (unit-test ở phase2)
    const months = Array.from({ length: 12 }, (_, m) => loadMonthStateOrCreate(PLAN_YEAR, m));
    rows = window.PlanStats.buildCSVRows(months, yearState, t('csvNote'));
  } else {
    rows = legacyCSVRows();
  }
  downloadFile('taskflow-todoist-data-' + date + '.csv', rows.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
  trackEvent('export_csv');
}

// Bản cũ (dự phòng nếu PlanStats chưa tải được) — giữ nguyên hành vi để không hồi quy.
function legacyCSVRows() {
  const rows = [];
  const push = (row) => rows.push(csvRow(row));

  push(['TaskFlow-Todoist Export', new Date().toISOString(), t('csvNote')]);

  push([]);
  push(['MonthlyGoals', 'Month', 'Kind', 'Text', 'Done']);
  for (let m = 0; m < 12; m++) {
    loadMonthStateOrCreate(PLAN_YEAR, m).monthlyGoals.forEach((g) => push(['MonthlyGoals', m + 1, g.kind, g.text, g.done ? 1 : 0]));
  }

  push([]);
  push(['Habits', 'Month', 'Habit', 'Day', 'Done']);
  for (let m = 0; m < 12; m++) {
    loadMonthStateOrCreate(PLAN_YEAR, m).habits.forEach((h) => {
      if (Array.isArray(h.days)) h.days.forEach((v, d) => { if (v) push(['Habits', m + 1, h.name, d + 1, 1]); });
    });
  }

  push([]);
  push(['Tasks', 'Month', 'Week', 'Day', 'Date', 'Kind', 'Text', 'Done']);
  for (let m = 0; m < 12; m++) {
    const s = loadMonthStateOrCreate(PLAN_YEAR, m);
    s.weeks.forEach((w) => {
      w.days.forEach((d, di) => {
        d.tasks.forEach((tk) => push(['Tasks', m + 1, w.n, di + 1, d.date, tk.kind, tk.text, tk.done ? 1 : 0]));
      });
    });
  }

  push([]);
  push(['MonthReflections', 'Month', 'Section', 'Index', 'Text']);
  for (let m = 0; m < 12; m++) {
    const s = loadMonthStateOrCreate(PLAN_YEAR, m);
    if (s.reflections && Array.isArray(s.reflections.overview)) {
      s.reflections.overview.forEach((r, i) => push(['MonthReflections', m + 1, 'overview', i + 1, r]));
      s.reflections.weeks.forEach((w, wi) => w.forEach((r, i) => push(['MonthReflections', m + 1, 'week' + (wi + 1), i + 1, r])));
    }
  }

  push([]);
  push(['YearGoals', 'Kind', 'Text', 'Done']);
  yearState.goals.forEach((g) => push(['YearGoals', g.kind, g.text, g.done ? 1 : 0]));

  push([]);
  push(['YearReflections', 'Scope', 'Index', 'Text']);
  Object.keys(yearState.reflections).forEach((scope) => {
    yearState.reflections[scope].forEach((r, i) => push(['YearReflections', scope, i + 1, r]));
  });

  push([]);
  push(['YearNotes', 'Month', 'Note']);
  yearState.monthNotes.forEach((n, m) => push(['YearNotes', m + 1, n]));

  return rows;
}

function importJSONFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || data.app !== 'taskflow-todoist' || !data.keys || typeof data.keys !== 'object') throw new Error('bad');
      if (!confirm(t('importConfirm'))) return;
      // Phase 5: chốt bản sao lưu dữ liệu hiện tại trước khi ghi đè (an toàn dữ liệu)
      try { rotateBackup(collectAllData()); } catch (e) { /* ẩn */ }
      Object.keys(data.keys).forEach((k) => {
        try { localStorage.setItem(k, data.keys[k]); } catch (e) { /* ẩn */ }
      });
      TaskFlowUI.toast(t('importOk'), 'success');
      location.reload();
    } catch (e) {
      TaskFlowUI.toast(t('importError'), 'error');
    }
  };
  reader.onerror = () => TaskFlowUI.toast(t('importError'), 'error');
  reader.readAsText(file);
}

function togglePop(id) {
  const p = document.getElementById(id);
  if (!p) return;
  p.hidden = !p.hidden;
  if (id === 'remindPop' && !p.hidden) {
    const input = document.getElementById('remindTime');
    if (input) input.value = getRemindTime() || '20:00';
    renderRemindList();
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('.header-pop') || e.target.closest('.remind-wrap') || e.target.closest('.data-wrap')) return;
  document.querySelectorAll('.header-pop').forEach((p) => { p.hidden = true; });
  const tp = document.getElementById('templatesPop');
  if (tp && !tp.hidden && !e.target.closest('.templates-pop') && !e.target.closest('[data-action="templates-toggle"]')) tp.hidden = true;
  const pk = document.getElementById('moodPicker');
  if (pk && !pk.hidden && !e.target.closest('.mood-picker') && !e.target.closest('[data-action="mood-pick"]')) closeMoodPicker();
});

/* ============================ Confetti ============================ */

let confettiRun = null;
function confettiBurst() {
  if (prefersReducedMotion()) return;
  if (confettiRun) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.scale(DPR, DPR);
  const colors = ['#F59890', '#F7D970', '#8EBCDF', '#9ED3A8', '#C3A8E8', '#F2A48E', '#FFF5D6'];
  const parts = [];
  for (let i = 0; i < 150; i++) {
    parts.push({
      x: W * 0.5 + (Math.random() - 0.5) * 260,
      y: H * 0.35 + (Math.random() - 0.5) * 160,
      vx: (Math.random() - 0.5) * 13,
      vy: -(4 + Math.random() * 9),
      g: 0.22 + Math.random() * 0.12,
      size: 5 + Math.random() * 7,
      color: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      shape: Math.random() < 0.5 ? 'rect' : 'circle',
    });
  }
  const start = performance.now();
  const DUR = 2400;
  confettiRun = true;
  function frame(now) {
    const t = Math.min(1, (now - start) / DUR);
    ctx.clearRect(0, 0, W, H);
    parts.forEach((p) => {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      const alpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    });
    if (t < 1) requestAnimationFrame(frame);
    else { canvas.remove(); confettiRun = null; }
  }
  requestAnimationFrame(frame);
}


/* ============================ Phase 6: Thói quen mẫu, Demo, Mood, Báo cáo năm, Import CSV ============================ */

/* ---------- 6A.2 — Thư viện thói quen mẫu ---------- */

const HABIT_TEMPLATES = [
  { icon: '📚', vi: 'Đọc sách 20 phút', en: 'Read 20 minutes' },
  { icon: '💧', vi: 'Uống nước đủ 2L', en: 'Drink 2L water' },
  { icon: '🏃', vi: 'Vận động 30 phút', en: 'Exercise 30 min' },
  { icon: '🧘', vi: 'Thiền 10 phút', en: 'Meditate 10 min' },
  { icon: '🥗', vi: 'Ăn rau xanh', en: 'Eat veggies' },
  { icon: '😴', vi: 'Ngủ đủ 8 tiếng', en: 'Sleep 8 hours' },
  { icon: '🕊', vi: 'Dậy sớm 6h', en: 'Wake up at 6am' },
  { icon: '✍️', vi: 'Viết nhật ký', en: 'Journal' },
  { icon: '📵', vi: 'Không lướt điện thoại 1h', en: 'No phone for 1 hour' },
  { icon: '💪', vi: 'Hít đất 20 cái', en: '20 push-ups' },
  { icon: '🗣', vi: 'Học tiếng Anh 30 phút', en: 'Study English 30 min' },
  { icon: '🎨', vi: 'Luyện kỹ năng mới', en: 'Practice a skill' },
  { icon: '🌅', vi: 'Đi bộ 10.000 bước', en: 'Walk 10k steps' },
  { icon: '🧹', vi: 'Dọn dẹp 15 phút', en: 'Tidy 15 min' },
  { icon: '💰', vi: 'Tiết kiệm tiền', en: 'Save money' },
  { icon: '🙏', vi: 'Biết ơn 3 điều', en: 'Note 3 gratitudes' },
];

function templatesPopHTML() {
  return `<div class="templates-pop" id="templatesPop" hidden>
    <strong class="templates-title">${t('templatesTitle')}</strong>
    <p class="templates-hint">${t('templatesHint')}</p>
    <div class="templates-list">
      ${HABIT_TEMPLATES.map((h) => `<button type="button" class="template-chip" data-action="template-add" data-name="${esc(h[LANG])}">${h.icon} ${esc(h[LANG])}</button>`).join('')}
    </div>
  </div>`;
}

/* ---------- 6A.3 — Dữ liệu mẫu ---------- */

function demoPlan() {
  const now = new Date();
  const ti = nowInfo();
  const today = now.getDate() - 1;
  const isEn = LANG === 'en';
  if (!state.monthlyGoals.length) {
    state.monthlyGoals.push(
      { id: 'dg' + Date.now(), text: isEn ? 'Finish the biggest project' : 'Hoàn thành dự án lớn nhất', kind: 'priority', done: false },
      { id: 'dg' + (Date.now() + 1), text: isEn ? 'Work out 4 times/week' : 'Tập thể dục 4 lần/tuần', kind: 'priority', done: false },
      { id: 'dg' + (Date.now() + 2), text: isEn ? 'Read 2 books' : 'Đọc 2 cuốn sách', kind: 'regular', done: false }
    );
  }
  if (!state.habits.length) {
    (isEn
      ? ['💧 Drink 2L of water', '📚 Read for 20 minutes', '🏃 Move for 30 minutes', '😴 Sleep 8 hours']
      : ['💧 Uống nước đủ 2L', '📚 Đọc sách 20 phút', '🏃 Vận động 30 phút', '😴 Ngủ đủ 8 tiếng']).forEach((name, i) => {
      const h = { id: 'dh' + Date.now() + i, name, target: 100, days: Array.from({ length: NUM_DAYS }, () => false), remind: { enabled: false, time: '20:00' } };
      for (let d = 0; d <= today && d < NUM_DAYS; d++) h.days[d] = Math.random() < 0.8;
      state.habits.push(h);
    });
  }
  if (ti.inRange) {
    const w = state.weeks[ti.week - 1];
    const d = w && w.days[ti.dayInWeek];
    if (d && !d.tasks.length) {
      d.tasks.push({ kind: 'priority', done: false, text: isEn ? 'Lock in today\u2019s goals' : 'Chốt mục tiêu hôm nay', tags: [], remind: { enabled: false, time: '20:00' } });
      d.tasks.push({ kind: 'regular', done: false, text: isEn ? 'Check in habits' : 'Điểm danh thói quen', tags: [], remind: { enabled: false, time: '20:00' } });
    }
  }
  renderCurrentView();
  save();
  trackEvent('demo_data');
}

/* ---------- 6B.1 — Mood tracker ---------- */

const MOOD_KEY = 'planner-mood';
const MOODS = [
  { icon: '😢', labelKey: 'mood0' },
  { icon: '😕', labelKey: 'mood1' },
  { icon: '😐', labelKey: 'mood2' },
  { icon: '😊', labelKey: 'mood3' },
  { icon: '🤩', labelKey: 'mood4' },
];

let moodMap = {};

function loadMood() {
  try {
    const raw = localStorage.getItem(MOOD_KEY);
    moodMap = raw ? JSON.parse(raw) : {};
  } catch (e) { moodMap = {}; }
  if (typeof moodMap !== 'object' || Array.isArray(moodMap) || !moodMap) moodMap = {};
}

function saveMood() {
  try { localStorage.setItem(MOOD_KEY, JSON.stringify(moodMap)); } catch (e) { /* ẩn */ }
  if (window.Sync) window.Sync.push(MOOD_KEY);
}

function moodDateKey(d) {
  // d có thể là số (ngày trong tháng) hoặc label "DD/MM" (tuần cắt ngang tháng)
  if (typeof d === 'number') return PLAN_YEAR + '-' + (PLAN_MONTH + 1) + '-' + d;
  const parts = String(d).split('/');
  return PLAN_YEAR + '-' + parts[1] + '-' + parts[0];
}

function moodCardHTML() {
  const cells = [];
  let logged = 0;
  const today = new Date();
  const todayDay = (today.getFullYear() === PLAN_YEAR && today.getMonth() === PLAN_MONTH) ? today.getDate() : -1;
  for (let d = 1; d <= NUM_DAYS; d++) {
    const m = moodMap[moodDateKey(d)];
    if (m !== undefined && MOODS[m]) logged++;
    const set = m !== undefined && MOODS[m];
    cells.push(`<button type="button" class="mood-cell${set ? ' has l' + m : ''}${d === todayDay ? ' today' : ''}" data-action="mood-pick" data-day="${d}" title="${t('moodPickTitle', { d })}" aria-label="${t('moodPickAria', { d })}">${set ? MOODS[m].icon : `<span class="mood-day">${d}</span>`}</button>`);
  }
  const pairs = [];
  for (let d = 0; d < NUM_DAYS; d++) {
    const m = moodMap[moodDateKey(d + 1)];
    if (m !== undefined) pairs.push({ mood: m, pct: dayAggregate(d) });
  }
  const s = window.PlanStats ? window.PlanStats.moodSummary(pairs) : null;
  let insight = '';
  if (s && s.goodDays + s.badDays >= 2 && s.delta !== null && s.goodAvg !== null && s.badAvg !== null) {
    insight = t('moodInsight', { g: s.goodAvg, d: s.delta });
  } else if (!logged) {
    insight = t('moodInsightNone');
  }
  return `<div class="card mood-card" id="moodCard">
    <div class="mood-card-head">
      <h3 class="card-title">${t('moodTitle')}</h3>
      <span class="mood-hint">${t('moodHint')}</span>
    </div>
    <div class="mood-heat" role="group" aria-label="${t('moodTitle')}">${cells.join('')}</div>
    <div class="mood-picker" id="moodPicker" hidden role="dialog" aria-modal="false" aria-labelledby="moodPickerTitle"></div>
    ${insight ? `<p class="mood-insight">${insight}</p>` : ''}
  </div>`;
}

/* Pick mood từ heatmap overview: mở picker popover trên chính card */
function openMoodPicker(day) {
  const pk = document.getElementById('moodPicker');
  if (!pk) return;
  const cur = moodMap[moodDateKey(day)];
  pk.innerHTML = `<div class="mood-picker-title" id="moodPickerTitle">${t('moodPickTitle', { d: day })}</div>
    <div class="mood-picker-opts">
      ${MOODS.map((m, i) => `<button type="button" class="mood-btn${cur === i ? ' on' : ''}" data-action="mood-set" data-day="${day}" data-mood="${i}" title="${t(m.labelKey)}" aria-label="${t(m.labelKey)}">${m.icon}</button>`).join('')}
    </div>
    <button type="button" class="mood-picker-clear" data-action="mood-clear" data-day="${day}">${t('moodClear')}</button>`;
  TaskFlowUI.openDialog('moodPicker');
}
function closeMoodPicker() {
  TaskFlowUI.closeDialog('moodPicker');
}
function rerenderMoodCard() {
  const card = document.getElementById('moodCard');
  if (!card) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = moodCardHTML();
  card.replaceWith(tmp.firstElementChild);
}

/* ---------- 6B.2 — Báo cáo tổng kết năm ---------- */

function yearlyReportData() {
  const gs = yearGoalStats();
  const monthly = yearMonthlyData();
  const bh = bestHabitAcrossYear();
  const pd = bestProductiveDay();
  let topMonth = 0;
  monthly.forEach((x, m) => { if (x.pct > monthly[topMonth].pct) topMonth = m; });
  return {
    y: PLAN_YEAR,
    pct: gs.pct,
    done: gs.done,
    inProg: gs.inProg,
    total: gs.total,
    months: monthly.map((x) => x.pct),
    topMonth,
    topHabit: bh,
    prodDay: pd,
  };
}

function renderYearReportModal() {
  const el = document.getElementById('yearReportContent');
  if (!el) return;
  const r = yearlyReportData();
  const topName = r.topHabit && r.topHabit.name ? esc(r.topHabit.name) : '—';
  const prod = r.prodDay ? esc(r.prodDay.label) + ' · ' + r.prodDay.n : '—';
  el.innerHTML = `
    <div class="report-head">
      <div class="donut-wrap"><div class="donut">${donutSVG(r.pct, 96, 12, '#C24E28')}</div>
        <div class="donut-center"><span>${r.pct}%</span><small>${t('yearReportGoalPct')}</small></div>
      </div>
    </div>
    <div class="report-grid">
      <div class="report-cell"><b>${r.done}</b><span>${t('statsDone')}</span></div>
      <div class="report-cell"><b>${r.inProg}</b><span>${t('statsInProg')}</span></div>
      <div class="report-cell"><b>${r.total}</b><span>${t('statsTotal')}</span></div>
      <div class="report-cell"><b>📅 ${shortMonth(r.topMonth)}</b><span>${t('yearReportTopMonth')} · ${r.months[r.topMonth]}%</span></div>
      <div class="report-cell"><b>🔥 ${topName}</b><span>${t('yearReportBestHabit')}</span></div>
      <div class="report-cell"><b>⚡ ${prod}</b><span>${t('yearReportProdDay')}</span></div>
    </div>
    <div class="report-weekbars" aria-hidden="true">${r.months.map((p) => `<div class="rw-bar" style="height:${Math.max(p, 4)}%"></div>`).join('')}</div>`;
}

function openYearReportModal() {
  const m = document.getElementById('yearReportModal');
  if (!m) return;
  renderYearReportModal();
  TaskFlowUI.openDialog('yearReportModal');
}

function closeYearReportModal() {
  TaskFlowUI.closeDialog('yearReportModal');
}

// Ảnh tổng kết năm 1080×1080 — style streak/week report card.
function yearReportCardBlob(r) {
  return new Promise((resolve, reject) => {
    try {
      const W = 1080, H = 1080;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#FFF6EA');
      grad.addColorStop(0.55, '#FDEBD7');
      grad.addColorStop(1, '#F8DCC0');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.5)';
      canvasCircle(g, W - 110, 130, 170);
      canvasCircle(g, 40, H - 150, 230);
      g.textAlign = 'center';
      g.fillStyle = '#4A403A';
      g.font = "700 36px 'Baloo 2','Fredoka','Nunito',sans-serif";
      g.fillText('🐥 TaskFlow-Todoist', W / 2, 96);
      g.fillStyle = '#8A7A6B';
      g.font = "700 42px 'Baloo 2','Nunito',sans-serif";
      g.fillText(t('yearReportCardTitle', { y: r.y }), W / 2, 158);
      g.fillStyle = '#C24E28';
      g.font = "800 120px 'Baloo 2','Fredoka',sans-serif";
      g.fillText(r.pct + '%', W / 2, 300);
      g.fillStyle = '#4A403A';
      g.font = "700 40px 'Baloo 2','Nunito',sans-serif";
      g.fillText(t('yearReportGoalPct') + ' · ' + r.done + '/' + r.total, W / 2, 352);
      const rows = [
        [t('yearReportTopMonth'), shortMonth(r.topMonth) + ' · ' + r.months[r.topMonth] + '%'],
        [t('yearReportBestHabit'), r.topHabit && r.topHabit.name ? r.topHabit.name : '—'],
        [t('yearReportProdDay'), r.prodDay ? r.prodDay.label + ' · ' + r.prodDay.n : '—'],
      ];
      g.font = "700 34px 'Nunito','Quicksand',sans-serif";
      rows.forEach((row, i) => {
        const y = 430 + i * 74;
        const pw = g.measureText(row[0] + '  ' + row[1]).width + 56, ph = 58;
        g.fillStyle = 'rgba(255,253,248,.85)';
        g.beginPath();
        if (g.roundRect) g.roundRect(W / 2 - pw / 2, y - ph + 16, pw, ph, 29);
        else g.rect(W / 2 - pw / 2, y - ph + 16, pw, ph);
        g.fill();
        g.fillStyle = '#8A7A6B';
        g.textAlign = 'left';
        g.fillText(row[0], W / 2 - pw / 2 + 28, y + 4);
        g.fillStyle = '#C24E28';
        g.textAlign = 'right';
        g.fillText(String(row[1]), W / 2 + pw / 2 - 28, y + 4);
        g.textAlign = 'center';
      });
      // Bar chart 12 tháng
      const bx = W / 2 - 300, bw = 600, bh = 180, by = 800;
      g.fillStyle = '#8A7A6B';
      g.font = "700 28px 'Nunito','Quicksand',sans-serif";
      g.fillText(t('yearReportTitle') + ' · ' + r.y, W / 2, by - 24);
      const maxP = Math.max(1, ...r.months);
      r.months.forEach((p, i) => {
        const h = Math.max(6, (p / maxP) * bh);
        g.fillStyle = '#C24E28';
        g.beginPath();
        if (g.roundRect) g.roundRect(bx + (i * bw) / 12 + 6, by - h, bw / 12 - 12, h, 8);
        else g.rect(bx + (i * bw) / 12 + 6, by - h, bw / 12 - 12, h);
        g.fill();
      });
      g.fillStyle = '#8A7A6B';
      g.font = "700 30px 'Nunito','Quicksand',sans-serif";
      g.fillText(t('shareFooter'), W / 2, H - 60);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
    } catch (e) { reject(e); }
  });
}

async function doShareYearReport() {
  const r = yearlyReportData();
  let name = localStorage.getItem('planner-name');
  if (!name) {
    name = (prompt(t('shareNamePrompt')) || '').trim() || t('meName');
    try { localStorage.setItem('planner-name', name); } catch (e) { /* ẩn */ }
  }
  try {
    const blob = await yearReportCardBlob(r);
    const file = new File([blob], 'taskflow-year-report.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'TaskFlow-Todoist 🐥',
          text: '📊 ' + t('yearReportCardTitle', { y: r.y }) + ' · ' + r.pct + '%',
        });
        trackEvent('share_year_report', { pct: r.pct, via: 'native' });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        trackEvent('share_year_report', { pct: r.pct, via: 'fallback' });
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'taskflow-year-report.png';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
    trackEvent('share_year_report', { pct: r.pct, via: 'download' });
    TaskFlowUI.toast(t('shareDone'), 'success');
  } catch (e) {
    TaskFlowUI.toast(t('shareFail'), 'error');
  }
}

/* ---------- 6B.3 — Weekly digest (nhắc bù qua Service Worker) ---------- */

let digestCacheTs = 0;

// Tóm tắt: habit chưa điểm danh hôm qua → lưu vào Cache API để SW đọc khi app đóng.
function computeDigest() {
  const now = new Date();
  const yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  let s = null;
  if (yd.getMonth() === PLAN_MONTH && yd.getFullYear() === PLAN_YEAR) {
    s = state;
  } else {
    try {
      const raw = localStorage.getItem('planner-' + yd.getFullYear() + '-' + (yd.getMonth() + 1));
      s = raw ? JSON.parse(raw) : null;
    } catch (e) { s = null; }
  }
  if (!s || !Array.isArray(s.habits)) return null;
  const di = yd.getDate() - 1;
  const missed = s.habits.filter((h) => Array.isArray(h.days) && !h.days[di]);
  const names = missed.slice(0, 4).map((h) => h.name).join(', ') + (missed.length > 4 ? '…' : '');
  return {
    date: now.toDateString(),
    title: 'TaskFlow-Todoist 🐥',
    body: missed.length === 0 ? t('digestNone') : t('digestBody', { names }),
  };
}

function updateDigestCache() {
  if (!('caches' in window)) return;
  const now = Date.now();
  if (now - digestCacheTs < 60000) return;
  digestCacheTs = now;
  const digest = computeDigest();
  if (!digest) return;
  caches.open('taskflow-digest').then((c) => {
    c.put('./digest.json', new Response(JSON.stringify(digest), { headers: { 'Content-Type': 'application/json' } }));
  }).catch(() => { /* ẩn */ });
}

/* ---------- 6B.4 — Import CSV ---------- */

function importCSVFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (!window.PlanStats) throw new Error('nostats');
      const data = window.PlanStats.parseCSVRows(reader.result);
      if (!Object.keys(data.months).length && !data.year.goals.length) throw new Error('empty');
      if (!confirm(t('importCsvConfirm'))) return;
      pushUndo();
      Object.keys(data.months).forEach((mk) => {
        const m = +mk;
        const s = loadMonthStateOrCreate(PLAN_YEAR, m - 1);
        const chunk = data.months[m];
        chunk.goals.forEach((g) => {
          if (!s.monthlyGoals.some((x) => x.text === g.text)) {
            s.monthlyGoals.push({ id: 'ig' + Date.now() + Math.random().toString(36).slice(2, 6), text: g.text, kind: g.kind, done: g.done });
          }
        });
        chunk.habits.forEach((hh) => {
          let h = s.habits.find((x) => x.name === hh.name);
          if (!h) {
            h = { id: 'ih' + Date.now() + Math.random().toString(36).slice(2, 6), name: hh.name, target: 100, days: Array(NUM_DAYS).fill(false), remind: { enabled: false, time: '20:00' } };
            s.habits.push(h);
          }
          const di = hh.day - 1;
          if (di >= 0 && di < NUM_DAYS && hh.done) h.days[di] = true;
        });
        chunk.tasks.forEach((tk) => {
          const w = s.weeks[tk.week - 1];
          const d = w && w.days[tk.day - 1];
          if (w && d) d.tasks.push({ kind: tk.kind, done: tk.done, text: tk.text, tags: [], remind: { enabled: false, time: '20:00' } });
        });
        saveMonthState(PLAN_YEAR, m - 1, s);
        // Tháng đang xem: đồng bộ vào state in-memory để setView/save() không ghi đè bản đã merge.
        if (m - 1 === PLAN_MONTH) state = s;
      });
      data.year.goals.forEach((g) => {
        if (!yearState.goals.some((x) => x.text === g.text)) {
          yearState.goals.push({ id: 'iyg' + Date.now() + Math.random().toString(36).slice(2, 6), text: g.text, kind: g.kind, done: g.done });
        }
      });
      saveYear();
      invalidateYearCache();
      setView(state.view, state.currentWeek);
      TaskFlowUI.toast(t('importCsvDone'), 'success');
      trackEvent('import_csv');
    } catch (e) {
      TaskFlowUI.toast(t('importCsvError'), 'error');
    }
  };
  reader.onerror = () => TaskFlowUI.toast(t('importCsvError'), 'error');
  reader.readAsText(file);
}


function habitDaysElapsed() {
  // Số ngày ĐÃ TRÔI QUA tính đến hôm nay (tháng hiện tại) — hoặc cả tháng nếu xem tháng khác.
  const now = new Date();
  const inRange = now.getFullYear() === PLAN_YEAR && now.getMonth() === PLAN_MONTH;
  return inRange ? Math.min(now.getDate(), NUM_DAYS) : NUM_DAYS;
}

function seedHabitDays(targetPct) {
  // Chỉ tick những ngày đã trôi qua đến hôm nay — KHÔNG bao giờ tick ngày tương lai.
  // Nhờ đó streak/record/% phản ánh đúng số ô ✓ thực tế, không "tính từ ngày tạo thói quen".
  const elapsed = habitDaysElapsed();
  const n = Math.max(0, Math.round((elapsed * targetPct) / 100));
  const start = Math.max(0, elapsed - n);
  return Array.from({ length: NUM_DAYS }, (_, i) => i >= start && i < elapsed);
}
function seedTasks(pct) {
  const checked = Math.round(pct / 20); // 0..5
  return Array.from({ length: 5 }, (_, i) => ({ kind: i < 2 ? 'priority' : 'regular', done: i < checked, text: '', tags: [] }));
}

function defaultState() {
  const ti = nowInfo();
  return {
    view: 'overview',
    currentWeek: ti.inRange ? ti.week : 1,
    goalTab: 'priority',
    monthKey: monthKey(),
    monthlyGoals: GOAL_DEFS.map(([text, kind, done], i) => ({ id: 'g' + i, text, kind, done })),
    habits: HABIT_DEFS.map(([name, target], i) => ({ id: 'h' + i, name, target, days: seedHabitDays(target) })),
    weeks: WEEK_PATTERNS.slice(0, NUM_WEEKS).map((wd, wi) => {
      const start = PLAN_START;
      return {
        n: wi + 1,
        goals: wd.goals.map(([text, kind, done]) => ({ text, kind, done })),
        days: wd.pcts.map((pct, di) => {
          const dt = new Date(start.getTime() + (wi * 7 + di) * 86400000);
          return {
            tasks: seedTasks(pct),
            date: `${dt.getDate()}/${dt.getMonth() + 1}`,
            yy: dt.getFullYear() % 100,
            sticky: wd.stickyDay === di ? wd.stickyText : null,
            note: '',
          };
        }),
      };
    }),
    reflections: {
      overview: ['', '', '', ''],
      weeks: WEEK_PATTERNS.slice(0, NUM_WEEKS).map(() => ['', '', '', '']),
    },
  };
}

function loadState() {
  try {
    let raw = localStorage.getItem(monthKey());
    // Chỉ dùng dữ liệu legacy cho khách vãng lai; tài khoản đã đăng nhập không kế thừa key cũ
    if (!raw && monthKey() === 'planner-2026-1' && !hasAccount()) raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.monthlyGoals) || !Array.isArray(s.habits) || !Array.isArray(s.weeks)) return null;
    if (s.monthKey !== monthKey() || s.weeks.length !== NUM_WEEKS) return null;
    if (!s.reflections || !Array.isArray(s.reflections.weeks) || s.reflections.weeks.length !== NUM_WEEKS) s.reflections = defaultState().reflections;
    if (!s.goalTab) s.goalTab = 'priority';
    if (typeof s.currentWeek !== 'number' || s.currentWeek < 1 || s.currentWeek > NUM_WEEKS) s.currentWeek = 1;
    if (s.view !== 'overview' && s.view !== 'week' && s.view !== 'year' && s.view !== 'calendar') s.view = 'overview';
    // Migration: task cũ thiếu tags → mảng rỗng; thiếu remind → tắt
    s.weeks.forEach((w) => {
      (w.days || []).forEach((d) => {
        (d.tasks || []).forEach((tk) => {
          if (!Array.isArray(tk.tags)) tk.tags = [];
          if (!tk.remind || typeof tk.remind !== 'object') tk.remind = { enabled: false, time: '20:00' };
          if (typeof tk.repeat === 'undefined') tk.repeat = null;
        });
      });
    });
    // Đồng bộ streak với số tích ✓: khi xem tháng hiện tại, tự bỏ tick các ngày tương lai
    // (dữ liệu cũ / seed trước đây từng tick cả tháng) để số streak phản ánh đúng những gì đã tick.
    const now = new Date();
    if (now.getFullYear() === PLAN_YEAR && now.getMonth() === PLAN_MONTH) {
      const today = Math.min(now.getDate(), NUM_DAYS);
      let dirty = false;
      s.habits.forEach((h) => {
        // Migration: habit cũ thiếu mục tiêu (target) → mặc định 100% số ngày.
        if (typeof h.target !== 'number' || h.target < 1) h.target = 100;
        // Migration: habit cũ thiếu remind → tắt
        if (!h.remind || typeof h.remind !== 'object') h.remind = { enabled: false, time: '20:00' };
        // Phase 7.5: skipDays mặc định là mảng rỗng
        if (!Array.isArray(h.skipDays)) h.skipDays = [];
        if (Array.isArray(h.days)) {
          for (let d = today; d < h.days.length; d++) {
            if (h.days[d]) { h.days[d] = false; dirty = true; }
          }
        }
      });
      // Lưu lại dữ liệu đã vệ sinh (không gọi save() vì biến global state đang trong TDZ khi load lúc khởi động).
      if (dirty) {
        try { localStorage.setItem(monthKey(), JSON.stringify(s)); } catch (e) { /* ẩn */ }
      }
    }
    return s;
  } catch (e) {
    return null;
  }
}

initPlan(new Date());

// Đã đăng nhập tài khoản? (có token đăng nhập) — dùng để phân biệt:
//   · Khách vãng lai (chưa có tài khoản, chưa có dữ liệu) → hiện dữ liệu mẫu (demo)
//   · Đã đăng nhập + chưa có dữ liệu → hiện state TRỐNG (tài khoản mới = dữ liệu mới, không demo)
function hasAccount() {
  try { return !!localStorage.getItem('planner-token'); } catch (e) { return false; }
}

function emptyState() {
  const ti = nowInfo();
  return {
    view: 'overview',
    currentWeek: ti.inRange ? ti.week : 1,
    goalTab: 'priority',
    monthKey: monthKey(),
    monthlyGoals: [],
    habits: [],
    weeks: Array.from({ length: NUM_WEEKS }, (_, wi) => {
      const start = PLAN_START;
      return {
        n: wi + 1,
        goals: [],
        days: Array.from({ length: 7 }, (_, di) => {
          const dt = new Date(start.getTime() + (wi * 7 + di) * 86400000);
          return {
            tasks: [
              { kind: 'priority', done: false, text: '', tags: [], remind: { enabled: false, time: '20:00' } },
              { kind: 'priority', done: false, text: '', tags: [], remind: { enabled: false, time: '20:00' } },
              { kind: 'regular', done: false, text: '', tags: [], remind: { enabled: false, time: '20:00' } },
              { kind: 'regular', done: false, text: '', tags: [], remind: { enabled: false, time: '20:00' } },
              { kind: 'regular', done: false, text: '', tags: [], remind: { enabled: false, time: '20:00' } },
            ],
            date: `${dt.getDate()}/${dt.getMonth() + 1}`,
            yy: dt.getFullYear() % 100,
            sticky: null,
            note: '',
          };
        }),
      };
    }),
    reflections: {
      overview: ['', '', '', ''],
      weeks: Array.from({ length: NUM_WEEKS }, () => ['', '', '', '']),
    },
  };
}

function emptyYearState() {
  return {
    year: PLAN_YEAR,
    goals: [],
    reflections: {
      year: ['', '', '', ''],
      q1: ['', '', '', ''], q2: ['', '', '', ''], q3: ['', '', '', ''], q4: ['', '', '', ''],
    },
    monthNotes: Array.from({ length: 12 }, () => ''),
  };
}

function bootState() { return loadState() || (hasAccount() ? emptyState() : defaultState()); }
function bootYearState() { return loadYearState() || (hasAccount() ? emptyYearState() : defaultYearState()); }

// Nạp lại state từ localStorage sau khi đổi tài khoản (login/signup/Google OAuth).
// QUAN TRỌNG: phải gọi sau khi Sync đã xoá local + pull remote — nếu không UI vẫn
// hiển thị (và vô tình lưu) dữ liệu của tài khoản trước đó.
function rebootState(render = true) {
  state = bootState();
  yearState = bootYearState();
  invalidateYearCache();
  // Phase 5: đổi tài khoản/sync-pull → xoá undo cũ (snapshot của tài khoản cũ không còn hợp lệ)
  if (typeof undoStack !== 'undefined' && undoStack) { undoStack.clear(); lastSnapshotJson = null; }
  if (render) {
    setView(state.view, state.currentWeek);
    updateNav();
  }
}

let state = bootState();

function save() {
  try { localStorage.setItem(monthKey(), JSON.stringify(state)); } catch (e) { /* ẩn */ }
  if (window.Sync) window.Sync.push(monthKey());
  maybeAutoBackup();
}

/* ============================ Tính toán ============================ */

function habitPct(h) {
  const days = Array.isArray(h.days) ? h.days : [];
  return window.PlanMath ? window.PlanMath.habitPctFrom(days, habitDaysElapsed(), h.target) : 0;
}
function dayPct(day) {
  const tasks = Array.isArray(day.tasks) ? day.tasks : [];
  return tasks.length ? Math.round((tasks.filter((task) => task.done).length / tasks.length) * 100) : 0;
}
function monthlyStats() {
  const total = state.monthlyGoals.length;
  const done = state.monthlyGoals.filter((g) => g.done).length;
  return { done, inProg: total - done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}
function weekStats(w) {
  const total = w.goals.length;
  const done = w.goals.filter((g) => g.done).length;
  return { done, inProg: total - done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}
function dayAggregate(d) {
  if (!state.habits.length) return 0;
  let sum = 0;
  state.habits.forEach((h) => { if (h.days[d]) sum++; });
  return Math.round((sum / state.habits.length) * 100);
}

function donutSVG(pct, size = 140, stroke = 18, color = '#F39A82') {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${t('doneAria', { p: pct })}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(74,64,58,.12)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
      transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset .6s ease"/>
  </svg>`;
}

function checkboxHTML(mod, checked, attrs = '', label) {
  const cls = mod ? ` cb-${mod}` : '';
  const a11y = window.TaskFlowUI.checkboxA11y(checked, label);
  return `<button type="button" class="checkbox${cls}" ${a11y} ${attrs}></button>`;
}

/* ============================ Trình bày ============================ */

function getRefQuestion(scope, i, fallback) {
  const store = scope === 'yr' || scope.startsWith('yq') ? yearState : state;
  const qs = store.reflectionQuestions || {};
  const arr = qs[scope];
  return (arr && arr[i] && arr[i].trim()) ? arr[i] : fallback;
}

function saveRefQuestion(scope, i, text) {
  const store = scope === 'yr' || scope.startsWith('yq') ? yearState : state;
  if (!store.reflectionQuestions) store.reflectionQuestions = {};
  if (!store.reflectionQuestions[scope]) store.reflectionQuestions[scope] = [];
  store.reflectionQuestions[scope][i] = text;
  if (store === yearState) saveYear(); else save();
}

function reflectionHTML(key, prompts) {
  const refs = key === 'ov' ? state.reflections.overview : state.reflections.weeks[state.currentWeek - 1];
  return `<h4 class="ref-title">${t('refTitle')}</h4>
    ${prompts.map((p, i) => `<div class="ref-item">
      <div class="ref-question" contenteditable="true" spellcheck="false" data-singleline="1" data-reflect-q="${key}-${i}" data-placeholder="${t('qEditPh')}" aria-label="${t('refQAria', { n: i + 1 })}">${esc(getRefQuestion(key, i, p))}</div>
      <div class="ref-line" contenteditable="true" spellcheck="false" data-reflect="${key}-${i}" data-placeholder="${t('writeHere')}" aria-label="${t('refAria', { n: i + 1 })}">${esc(refs[i])}</div>
    </div>`).join('')}`;
}

/* ---------- Tổng quan tháng ---------- */

function overviewMetricSnapshot() {
  const ms = monthlyStats();
  const selectedWeek = state.weeks[state.currentWeek - 1] || state.weeks[0];
  const now = new Date();
  const todayIndex = now.getFullYear() === PLAN_YEAR && now.getMonth() === PLAN_MONTH ? now.getDate() - 1 : -1;
  const habitsDone = todayIndex >= 0
    ? state.habits.filter(function (habit) { return !!habit.days[todayIndex]; }).length
    : 0;
  clearStreakCache();
  const activeStreak = state.habits.reduce(function (best, habit) {
    return Math.max(best, habitStreakCached(habit).cur);
  }, 0);
  return {
    ms,
    weekProgress: selectedWeek ? weekStats(selectedWeek).pct : 0,
    habitsDone,
    activeStreak,
  };
}

function syncOverviewMetrics() {
  if (!document.querySelector('.overview-metrics')) return;
  const snapshot = overviewMetricSnapshot();
  const values = {
    'overview-week-value': snapshot.weekProgress + '%',
    'overview-goals-value': String(snapshot.ms.done),
    'overview-goals-meta': t('overviewMetricGoalsMeta', { done: snapshot.ms.done, total: snapshot.ms.total }),
    'overview-habits-value': String(snapshot.habitsDone),
    'overview-habits-meta': t('overviewMetricHabitsMeta', { done: snapshot.habitsDone, total: state.habits.length }),
    'overview-streak-value': String(snapshot.activeStreak),
  };
  Object.entries(values).forEach(function ([role, value]) {
    const target = document.querySelector(`[data-role="${role}"]`);
    if (target) target.textContent = value;
  });
}

function syncOverviewFocus() {
  const target = document.querySelector('[data-role="overview-focus-title"]');
  if (!target) return;
  const nextGoal = state.monthlyGoals.find(function (goal) { return !goal.done; });
  target.textContent = nextGoal ? nextGoal.text : t('overviewFocusEmpty');
}

function renderOverview() {
  const el = document.getElementById('ov-content');
  const snapshot = overviewMetricSnapshot();
  const ms = snapshot.ms;
  evaluateMonthBadges();
  const widgets = getVisibleWidgets('overview');
  const deferredIds = new Set(['streak-heatmap', 'mood', 'badges']);
  const wrapWidget = function (widget) {
    const modifier = `overview-widget--${widget.id}`;
    return `<section class="overview-widget ${modifier}${deferredIds.has(widget.id) ? ' overview-widget--deferred' : ''}" data-widget-id="${widget.id}" aria-label="${esc(widget.label)}">${widget.html}</section>`;
  };
  el.innerHTML = `
    <div class="overview-page">
      <header class="overview-header">
        <div>
          <p class="overview-eyebrow">${t('overviewEyebrow')}</p>
          <h1 class="overview-title">${t('overviewTitle', { m: monthLabel(PLAN_MONTH) })}</h1>
          <p class="overview-subtitle">${t('overviewSubtitle')}</p>
        </div>
        <button type="button" class="button button-secondary widget-settings-btn" data-action="widget-settings" data-view="overview" title="${t('widgetSettings')}">
          ${window.TaskFlowUI.icon('settings')}<span>${t('widgetSettings').replace(/^⚙️\s*/, '')}</span>
        </button>
      </header>

      <section class="overview-metrics" aria-label="${t('viewOverview')}">
        <article class="metric metric--week">
          <span class="metric-label">${t('overviewMetricWeek')}</span>
          <strong class="metric-value" data-role="overview-week-value">${snapshot.weekProgress}%</strong>
          <span class="metric-meta">${t('overviewMetricWeekMeta', { n: state.currentWeek })}</span>
        </article>
        <article class="metric metric--goals">
          <span class="metric-label">${t('overviewMetricGoals')}</span>
          <strong class="metric-value" data-role="overview-goals-value">${ms.done}</strong>
          <span class="metric-meta" data-role="overview-goals-meta">${t('overviewMetricGoalsMeta', { done: ms.done, total: ms.total })}</span>
        </article>
        <article class="metric metric--habits">
          <span class="metric-label">${t('overviewMetricHabits')}</span>
          <strong class="metric-value" data-role="overview-habits-value">${snapshot.habitsDone}</strong>
          <span class="metric-meta" data-role="overview-habits-meta">${t('overviewMetricHabitsMeta', { done: snapshot.habitsDone, total: state.habits.length })}</span>
        </article>
        <article class="metric metric--streak">
          <span class="metric-label">${t('overviewMetricStreak')}</span>
          <strong class="metric-value" data-role="overview-streak-value">${snapshot.activeStreak}</strong>
          <span class="metric-meta">${t('overviewMetricStreakMeta')}</span>
        </article>
      </section>

      <div class="overview-primary-grid">
        ${widgets.map(function (w) { return wrapWidget(w); }).join('')}
      </div>
    </div>
  `;
}

function dateCardHTML() {
  return `<div class="card date-card">
    <p class="section-kicker">${t('curMonthTh')}</p>
    <div class="date-card-period"><strong>${monthLabel(PLAN_MONTH)}</strong><span>${PLAN_YEAR}</span></div>
    <label class="date-card-week">${t('curWeekTh')}
      <select class="week-select" data-action="weekselect" aria-label="${t('selWeekAria')}">
        ${state.weeks.map((w) => `<option value="${w.n}" ${w.n === state.currentWeek ? 'selected' : ''}>${t('weekN', { n: w.n })}</option>`).join('')}
      </select>
    </label>
  </div>`;
}

function weeklyChartHTML() {
  const levels = [100, 75, 50, 25, 0];
  const curWeek = nowInfo().week;
  return `<div class="card chart-card">
    <h3 class="card-title">${t('weeklyProg')}</h3>
    <div class="chart-wrap">
      <div class="chart-grid" aria-hidden="true">
        ${levels.map((l) => `<span class="gl" style="bottom:${l}%">${l}%</span><span class="gl-line" style="bottom:${l}%"></span>`).join('')}
      </div>
      <div class="bars">
        ${state.weeks.map((w) => {
          const st = weekStats(w);
          return `<button type="button" class="bar-col${w.n === curWeek ? ' current' : ''}" data-action="weekbar" data-week="${w.n}" title="${t('viewWeekT', { n: w.n })}">
            <span class="bar-val">${st.pct}%</span>
            <span class="bar" style="height:${Math.max(st.pct, 4)}%"></span>
            <span class="bar-label">${t('weekN', { n: w.n })}</span>
          </button>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

function focusCardHTML() {
  const nextGoal = state.monthlyGoals.find(function (goal) { return !goal.done; });
  return `<div class="card focus-card">
    <p class="section-kicker">${t('overviewFocusTitle')}</p>
    <h3 class="focus-card-title" data-role="overview-focus-title">${nextGoal ? esc(nextGoal.text) : t('overviewFocusEmpty')}</h3>
    <div class="focus-card-footer">
      <span>${t('overviewMetricWeekMeta', { n: state.currentWeek })}</span>
      <button type="button" class="button button-secondary" data-action="weekbar" data-week="${state.currentWeek}">${t('overviewOpenWeek')}</button>
    </div>
  </div>`;
}

function sceneCardHTML() {
  return `<div class="card scene-card">
    <div class="scene">
      <div class="sky">
        <span class="sun" aria-hidden="true">☀️</span>
        <span class="sun-glow" aria-hidden="true"></span>
        <span class="moon" aria-hidden="true">🌙</span>
        <span class="cloud c1" aria-hidden="true">☁️</span>
        <span class="cloud c2" aria-hidden="true">☁️</span>
        <span class="cloud c3" aria-hidden="true">☁️</span>
        <span class="bird" aria-hidden="true">🐦</span>
        <span class="star s1" aria-hidden="true">✦</span>
        <span class="star s2" aria-hidden="true">✦</span>
        <span class="star s3" aria-hidden="true">✦</span>
      </div>
      <div class="scene-tree" aria-hidden="true">
        <div class="leaf-blob b1"></div>
        <div class="leaf-blob b2"></div>
        <div class="leaf-blob b3"></div>
        <div class="leaf-blob b4"></div>
        <span class="apple a1">🍎</span>
        <span class="apple a2">🍎</span>
        <div class="trunk"></div>
        <div class="swing">
          <span class="rope r1"></span>
          <span class="rope r2"></span>
          <span class="seat"></span>
          <span class="swing-chick">🐥</span>
        </div>
      </div>
      <div class="window" aria-hidden="true">
        <div class="win-sky"></div>
        <div class="win-shelf"></div>
        <span class="win-curtain cur-l"></span>
        <span class="win-curtain cur-r"></span>
        <span class="win-rabbit">🐰</span>
        <div class="win-frame"></div>
      </div>
      <div class="win-box" aria-hidden="true">
        <span class="wb-flower">🌷</span>
        <span class="wb-flower">🌼</span>
      </div>
      <div class="grass">
        <span class="g-bush" aria-hidden="true"></span>
        <span class="g-critter cr1" aria-hidden="true">🐥</span>
        <span class="g-critter cr2" aria-hidden="true">🦫</span>
        <span class="g-flower f1" aria-hidden="true">🌸</span>
        <span class="g-flower f2" aria-hidden="true">🌼</span>
        <span class="g-butterfly" aria-hidden="true">🦋</span>
      </div>
    </div>
    <div class="chick-row" aria-label="${t('chicks10Aria')}">
      ${Array.from({ length: 10 }, (_, i) => `<span class="chick-unit" style="--i:${i}" aria-hidden="true">🐥<span class="chick-phones">🎧</span></span>`).join('')}
    </div>
  </div>`;
}

function goalsPanelHTML(ms) {
  const pct = ms.pct;
  const priGoals = state.monthlyGoals.filter((g) => g.kind === 'priority');
  const regGoals = state.monthlyGoals.filter((g) => g.kind === 'regular');
  
  return `<div class="card goals-panel">
    <div class="goals-top">
      <div class="goals-info sub">
        <div class="big-pct" data-role="big-pct">${pct}%</div>
        <h3 class="card-title">${t('goalsTitle')}</h3>
        <table class="stats-table">
          <tr><th>${t('statsDone')}</th><th>${t('statsInProg')}</th><th>${t('statsTotal')}</th></tr>
          <tr data-role="ov-stats"><td>${ms.done}</td><td>${ms.inProg}</td><td>${ms.total}</td></tr>
        </table>
      </div>
      <div class="goals-donut sub">
        <div class="donut-wrap">
          <div class="donut" data-role="ov-donut">${donutSVG(pct, 140, 18, '#666854')}</div>
          <div class="donut-center"><span data-role="big-pct">${pct}%</span><small>${t('unitGoals')}</small></div>
        </div>
      </div>
      <div class="goal-list sub">
        <div class="goal-group-dual">
          ${goalBlockHTML('priority', priGoals)}
          ${goalBlockHTML('regular', regGoals)}
        </div>
      </div>
      <div class="reflection sub">${reflectionHTML('ov', REFLECT_PROMPTS_MONTH())}</div>
    </div>
  </div>`;
}

function emptyStateHTML(icon, titleKey, hintKey) {
  return `<div class="empty-state">
    <span class="empty-icon" aria-hidden="true">${icon}</span>
    <p class="empty-title">${t(titleKey)}</p>
    <p class="empty-hint">${t(hintKey)}</p>
  </div>`;
}

function goalBlockHTML(kind, goals) {
  const label = t(kind === 'priority' ? 'priLbl' : 'regLbl');
  const mod = kind === 'priority' ? 'pink' : 'blue';
  return `<div class="goal-block">
    <div class="v-strip ${mod}"><span>${label}</span></div>
    <div class="goal-block-main">
      <ul class="goal-items">
        ${goals.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}" draggable="true" data-drag="goal" data-scope="m" data-id="${g.id}" title="${t('dragHint')}">
          ${checkboxHTML(mod, g.done, `data-action="goal" data-id="${g.id}"`, window.TaskFlowUI.checkboxLabel('goal', g.text, `${monthLabel(PLAN_MONTH)} ${PLAN_YEAR}`))}
          <span class="g-text" data-role="goal-text" data-id="${g.id}">${esc(g.text)}</span>
          <span class="item-actions">
            <button type="button" class="mini-btn" data-action="editgoal" data-id="${g.id}" title="${t('editGoalAria')}" aria-label="${t('editGoalAria')}">✏️</button>
            <button type="button" class="mini-btn" data-action="delgoal" data-scope="m" data-id="${g.id}" title="${t('delGoalAria')}" aria-label="${t('delGoalAria')}">🗑</button>
          </span>
        </li>`).join('') || `<li class="goal-item empty-item">${emptyStateHTML('🎯', 'emptyGoalsT', 'emptyGoalsH')}</li>`}
      </ul>
      <div class="goal-add-wrap">
        <button type="button" class="mini-btn add-btn" data-action="addgoal" data-kind="${kind}">${t('addGoal')}</button>
        <div class="goal-add-bar" hidden data-role="goal-add-bar" data-kind="${kind}">
          <input class="inline-input" data-role="goal-add-input" data-kind="${kind}" placeholder="${t('goalPh')}" aria-label="${t('goalNameAria', { label })}" maxlength="120" />
          <button type="button" class="mini-btn" data-action="confirm-addgoal" data-kind="${kind}" title="${t('addTxt')}" aria-label="${t('addTxt')}">✓</button>
        </div>
      </div>
    </div>
  </div>`;
}

function habitPanelHTML() {
  const dayBars = Array.from({ length: NUM_DAYS }, (_, d) => dayAggregate(d));
  const n = new Date();
  const habitToday = (n.getMonth() === PLAN_MONTH && n.getFullYear() === PLAN_YEAR) ? n.getDate() - 1 : -1;
  return `<div class="card habit-panel">
    <div class="habit-title-row">
      <div>
        <h3 class="card-title">${t('habitTitle')}</h3>
      </div>
      <div class="habit-legend">
        <span class="dot on"></span> ${t('legendDone')}
        <span class="dot off"></span> ${t('legendNotDone')}
      </div>
    </div>
    <div class="habit-add-row">
      <input class="inline-input habit-name-input" data-role="habit-name-input" placeholder="${t('habitPh')}" aria-label="${t('habitNameAria')}" maxlength="60" />
      <button type="button" class="mini-btn add-btn" data-action="addhabit" title="${t('addHabitTxt')}">${t('addHabitTxt')}</button>
      <button type="button" class="mini-btn" data-action="copyhabits" title="${t('copyHabitsTxt')}">🗓️ ${t('copyHabitsTxt')}</button>
      <button type="button" class="mini-btn" data-action="templates-toggle" title="${t('templatesTitle')}" aria-label="${t('templatesTitle')}">✨</button>
    </div>
    ${templatesPopHTML()}
    <div class="habit-layout">
      <div class="habit-table-wrap" role="region" aria-label="${t('overviewHabitGridAria')}" tabindex="0">
        <table class="habit-table" aria-label="${t('overviewHabitGridAria')}">
          <thead>
            <tr class="mini-bar-tr">
              <th class="sticky name-col" aria-hidden="true"></th>
              <th class="sticky pct-col" aria-hidden="true"></th>
              ${dayBars.map((p, d) => `<th class="mini-th"><span class="mini-bar" data-role="day-mini" data-day="${d}" style="height:${Math.max(p, 4)}%"></span></th>`).join('')}
            </tr>
            <tr class="day-num-tr">
              <th class="sticky name-col">${t('habitCol')}</th>
              <th class="sticky pct-col">%</th>
              ${Array.from({ length: NUM_DAYS }, (_, d) => `<th class="day-num${d === habitToday ? ' today' : ''}">${d + 1}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${state.habits.length ? state.habits.map((h) => {
              const p = habitPct(h);
              return `<tr draggable="true" data-drag="habit" data-id="${h.id}" title="${t('dragHint')}">
                <td class="sticky name-col"><span class="habit-name-cell">
                  <span class="habit-name-text" data-id="${h.id}" title="${esc(h.name)}">${esc(h.name)}</span>
                  <span class="item-actions">
                    <button type="button" class="mini-btn" data-action="remind-habit" data-id="${h.id}" title="${t('remindHabitAria')}" aria-label="${t('remindHabitAria')}">🔔${h.remind && h.remind.enabled ? '<sup class="remind-dot"></sup>' : ''}</button>
                    <button type="button" class="mini-btn" data-action="targetedit" data-id="${h.id}" title="${t('targetAria', { n: h.target || 100 })}" aria-label="${t('targetAria', { n: h.target || 100 })}">🎯</button>
                    <button type="button" class="mini-btn" data-action="edithabit" data-id="${h.id}" title="${t('renameAria')}" aria-label="${t('renameAria')}">✏️</button>
                    <button type="button" class="mini-btn" data-action="delhabit" data-id="${h.id}" title="${t('delAria')}" aria-label="${t('delAria')}">🗑</button>
                  </span>
                </span></td>
                <td class="sticky pct-col"><b data-role="habit-pct" data-id="${h.id}">${p}%</b></td>
                ${h.days.map((v, d) => `<td class="day-cell${d === habitToday ? ' today' : ''}${h.skipDays && h.skipDays.includes(d) ? ' skipped' : ''}" data-context="habit-day" data-id="${h.id}" data-day="${d}">${checkboxHTML('', v, `data-action="habit" data-id="${h.id}" data-day="${d}"`, window.TaskFlowUI.checkboxLabel('habit', h.name, `${String(d + 1).padStart(2, '0')}/${String(PLAN_MONTH + 1).padStart(2, '0')}`))}</td>`).join('')}
              </tr>`;
            }).join('') : `<tr>
              <td class="sticky name-col"></td>
              <td class="sticky pct-col"></td>
              <td colspan="${NUM_DAYS}" class="empty-cell">${emptyStateHTML('🐥', 'emptyHabitsT', 'emptyHabitsH')}</td>
            </tr>`}
          </tbody>
        </table>
      </div>
      <div class="habit-chart">
        ${state.habits.map((h) => {
          const p = habitPct(h);
          return `<div class="hbar-row">
            <span class="hbar-label" data-role="hbar-label" data-id="${h.id}" title="${esc(h.name)}">${esc(h.name)}</span>
            <div class="hbar-track"><div class="hbar" data-role="habit-bar" data-id="${h.id}" style="width:${p}%"></div></div>
            <span class="hbar-val" data-role="habit-bar-val" data-id="${h.id}">${p}%</span>
          </div>`;
        }).join('')}
        <div class="hbar-axis"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
      </div>
    </div>
  </div>`;
}

/* ---------- Streak & Heatmap (Giai đoạn 2) ---------- */

function heatLevel(pct) {
  if (pct >= 100) return 5;
  if (pct >= 75) return 4;
  if (pct >= 50) return 3;
  if (pct >= 25) return 2;
  if (pct > 0) return 1;
  return 0;
}

/* ---- Đa tháng: đọc dữ liệu tháng khác (read-only) để nối streak xuyên tháng ---- */
function monthStateRaw(y, m) {
  try {
    const raw = localStorage.getItem('planner-' + y + '-' + (m + 1));
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.habits)) return null;
    return s;
  } catch (e) { return null; }
}

// Tìm thói quen trong state của tháng bất kỳ theo id (ưu tiên) rồi theo tên.
function habitInMonthState(s, h) {
  if (!s || !Array.isArray(s.habits)) return null;
  return s.habits.find((x) => x.id === h.id) || s.habits.find((x) => x.name === h.name) || null;
}

// Lấy mảng days[] của thói quen ở tháng (y,m) — null nếu tháng đó chưa có dữ liệu.
function habitDaysAt(y, m, h) {
  if (y === PLAN_YEAR && m === PLAN_MONTH) return Array.isArray(h.days) ? h.days : null;
  const s = monthStateRaw(y, m);
  const hh = habitInMonthState(s, h);
  return hh && Array.isArray(hh.days) ? hh.days : null;
}

// Ngày đánh dấu "hôm nay" (index 0-based) của tháng đang xem: hôm nay nếu đang xem tháng hiện tại, ngày cuối nếu xem tháng khác.
function streakAnchorDay() {
  const now = new Date();
  const inRange = now.getFullYear() === PLAN_YEAR && now.getMonth() === PLAN_MONTH;
  return inRange ? Math.min(now.getDate() - 1, NUM_DAYS - 1) : NUM_DAYS - 1;
}

// Dựng mảng boolean liên tục theo thứ tự thời gian: từ N-1 tháng trước → hôm nay của tháng đang xem.
function habitTimeline(h, months = 3) {
  const out = [];
  const anchor = streakAnchorDay();
  for (let back = months - 1; back >= 0; back--) {
    let y = PLAN_YEAR, m = PLAN_MONTH - back;
    while (m < 0) { m += 12; y--; }
    const nd = new Date(y, m + 1, 0).getDate();
    const days = habitDaysAt(y, m, h);
    const upto = (back === 0) ? anchor : nd - 1;
    for (let d = 0; d <= upto; d++) out.push(!!(days && days[d]));
  }
  return out;
}

function habitStreakOf(h) {
  // Streak ĐA THÁNG: 🔥 đếm lùi từ hôm nay xuyên qua ranh giới tháng;
  // 🏆 chuỗi dài nhất trong cửa sổ 12 tháng. Dùng MỘT timeline duy nhất.
  const tl = habitTimeline(h, 12);
  let cur = 0;
  for (let i = tl.length - 1; i >= 0 && tl[i]; i--) cur++;
  let best = 0, run = 0;
  for (let i = 0; i < tl.length; i++) {
    if (tl[i]) { run++; if (run > best) best = run; }
    else run = 0;
  }
  return { cur, best };
}

// Cache streak theo habit trong một lần render (tránh dựng timeline 12 tháng nhiều lần).
let hmStreakCache = new Map();
function clearStreakCache() { hmStreakCache = new Map(); }
function habitStreakCached(h) {
  if (!hmStreakCache.has(h.id)) hmStreakCache.set(h.id, habitStreakOf(h));
  return hmStreakCache.get(h.id);
}

function weekHabitPct(wk) {
  if (wk < 1) return null;
  const first = new Date(PLAN_YEAR, PLAN_MONTH, 1);
  const dow0 = (first.getDay() + 6) % 7;
  let sum = 0, n = 0;
  for (let d = 0; d < NUM_DAYS; d++) {
    if (Math.floor((dow0 + d) / 7) + 1 === wk) { sum += dayAggregate(d); n++; }
  }
  return n ? Math.round(sum / n) : null;
}

function weekCompareHTML() {
  const ti = nowInfo();
  const curWeek = ti.inRange ? ti.week : state.currentWeek;
  const thisWk = weekHabitPct(curWeek);
  const lastWk = weekHabitPct(curWeek - 1);
  if (thisWk === null || lastWk === null) {
    return `<div class="hm-wkcompare" data-role="hm-week-compare"><span class="hm-wk-item">${t('hmNoData')}</span></div>`;
  }
  const diff = thisWk - lastWk;
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '＝';
  const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  return `<div class="hm-wkcompare" data-role="hm-week-compare">
    <span class="hm-wk-item">${t('hmThis')} <b>${thisWk}%</b></span>
    <span class="hm-wk-item">${t('hmLast')} <b>${lastWk}%</b></span>
    <span class="hm-delta ${cls}">${arrow} ${Math.abs(diff)}%</span>
  </div>`;
}

/* ---- Ribbon đa tháng: % hoàn thành của một ngày bất kỳ (y,m,d) ---- */
function dayAggregateAt(y, m, d) {
  let hs = null;
  if (y === PLAN_YEAR && m === PLAN_MONTH) hs = state.habits;
  else {
    const s = monthStateRaw(y, m);
    hs = s ? s.habits : null;
  }
  if (!hs || !hs.length) return 0;
  let sum = 0;
  hs.forEach((hh) => { if (Array.isArray(hh.days) && hh.days[d]) sum++; });
  return Math.round((sum / hs.length) * 100);
}

function shortMonth(m) {
  return LANG === 'vi' ? 'T' + (m + 1) : MONTH_NAMES[m].slice(0, 3).toUpperCase();
}

// Hero: thói quen có chuỗi 🔥 dài nhất + thanh tiến tới kỷ lục 🏆
function heatHeroHTML() {
  let top = null;
  state.habits.forEach((h) => {
    const s = habitStreakCached(h);
    if (!top || s.cur > top.s.cur) top = { h, s };
  });
  if (!top) return '';
  const { cur, best } = top.s;
  const pct = best ? Math.min(100, Math.round((cur / best) * 100)) : 0;
  const note = cur === 0 ? t('hmHeroStart')
    : best > 0 && cur >= best ? t('hmHeroNew')
    : t('hmHeroRec', { n: best - cur });
  return `<div class="hm-hero">
    <div class="hm-hero-flame" aria-hidden="true">🔥</div>
    <div class="hm-hero-main">
      <div class="hm-hero-top">
        <b class="hm-hero-num" data-role="hm-hero-cur">${cur}</b>
        <span class="hm-hero-unit">${t('hmHeroDays')}</span>
        <span class="hm-hero-name" data-role="hm-hero-name">${esc(top.h.name)}</span>
      </div>
      <div class="hm-hero-track"><div class="hm-hero-fill" data-role="hm-hero-fill" style="width:${pct}%"></div></div>
      <div class="hm-hero-note" data-role="hm-hero-note">${note}</div>
    </div>
    <div class="hm-hero-rec">
      <span class="hm-rec-ico" aria-hidden="true">🏆</span>
      <b data-role="hm-hero-best">${best}</b>
      <span>${t('hmHeroRecLbl')}</span>
    </div>
  </div>`;
}

// Dải 90 ngày xuyên 3 tháng, kiểu GitHub (cột = tuần, hàng = thứ), có nhãn tháng.
function heatRibbonHTML() {
  const now = new Date();
  const inRange = now.getFullYear() === PLAN_YEAR && now.getMonth() === PLAN_MONTH;
  const anchor = streakAnchorDay();
  const anchorDate = new Date(PLAN_YEAR, PLAN_MONTH, anchor + 1);
  const start = new Date(anchorDate.getTime() - 89 * 86400000);
  const monday = new Date(start);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const dayNames = LANG === 'vi' ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const cols = [];
  const tags = [];
  let prevMonthKey = null;
  for (let w = 0; ; w++) {
    const colStart = new Date(monday.getTime() + w * 7 * 86400000);
    if (colStart > anchorDate) break;
    let col = '';
    let monthKey = null;
    for (let dow = 0; dow < 7; dow++) {
      const dt = new Date(colStart.getTime() + dow * 86400000);
      if (dt < start || dt > anchorDate) { col += '<span class="hm-rb-cell hm-empty"></span>'; continue; }
      const y = dt.getFullYear(), m = dt.getMonth(), d = dt.getDate() - 1;
      if (monthKey === null) monthKey = y + '-' + m;
      const pct = dayAggregateAt(y, m, d);
      const lvl = heatLevel(pct);
      const isToday = inRange && y === now.getFullYear() && m === now.getMonth() && d === now.getDate() - 1;
      col += `<span class="hm-rb-cell hm-l${lvl}${isToday ? ' today' : ''}" data-role="hm-rb-cell" data-y="${y}" data-m="${m}" data-d="${d}" title="${t('hmDayFullT', { m: shortMonth(m), d: d + 1, p: pct })}"></span>`;
    }
    cols.push(`<div class="hm-rb-col">${col}</div>`);
    tags.push(`<span class="hm-rb-tag${monthKey !== null && monthKey !== prevMonthKey ? ' show' : ''}">${monthKey !== null ? shortMonth(+monthKey.split('-')[1]) : ''}</span>`);
    if (monthKey !== null) prevMonthKey = monthKey;
  }
  // Luôn gắn nhãn tháng anchor (tháng đang xem) — nó có thể nằm cuối cột tuần
  // bắt đầu từ tháng trước nên chưa từng được đánh dấu (vd: đầu tháng ở cuối tuần).
  const anchorKey = PLAN_YEAR + '-' + PLAN_MONTH;
  if (prevMonthKey !== anchorKey && tags.length) {
    tags[tags.length - 1] = `<span class="hm-rb-tag show">${shortMonth(PLAN_MONTH)}</span>`;
  }
  return `<div class="hm-rb-scroll">
    <div class="hm-rb">
      <div class="hm-rb-side">
        <span class="hm-rb-tag hm-spacer" aria-hidden="true"></span>
        ${dayNames.map((n) => `<span class="hm-rb-dlabel">${n}</span>`).join('')}
      </div>
      <div class="hm-rb-main">
        <div class="hm-rb-tags">${tags.join('')}</div>
        <div class="hm-rb-cols">${cols.join('')}</div>
      </div>
    </div>
  </div>`;
}

// Vệt 14 ngày gần nhất của một thói quen (cho hàng streak).
function habitMiniHTML(h) {
  const anchor = streakAnchorDay();
  const cells = [];
  for (let back = 13; back >= 0; back--) {
    const dt = new Date(PLAN_YEAR, PLAN_MONTH, anchor + 1 - back);
    const y = dt.getFullYear(), m = dt.getMonth(), d = dt.getDate() - 1;
    const days = habitDaysAt(y, m, h);
    cells.push(`<i class="hm-mini-cell${days && days[d] ? ' on' : ''}"></i>`);
  }
  return cells.join('');
}

function habitHeatCardHTML() {
  clearStreakCache();
  const streaks = state.habits.map((h) => {
    const s = habitStreakCached(h);
    return `<div class="hm-streak-row">
      <div class="hm-streak-top">
        <span class="hm-streak-name" title="${esc(h.name)}">${esc(h.name)}</span>
        <span class="hm-streak-pct">${habitPct(h)}%</span>
      </div>
      <div class="hm-streak-bottom">
        <span class="hm-mini" data-role="hm-mini" data-id="${h.id}" title="${t('hmMiniT')}">${habitMiniHTML(h)}</span>
        <span class="hm-streak-badges">
          <span class="hm-streak-badge" title="${t('hmCur')}">🔥<b data-role="hm-streak-cur" data-id="${h.id}">${s.cur}</b></span>
          <span class="hm-streak-badge" title="${t('hmBest')}">🏆<b data-role="hm-streak-best" data-id="${h.id}">${s.best}</b></span>
        </span>
      </div>
    </div>`;
  }).join('') || `<p class="empty-cell">${t('hmNoHabits')}</p>`;

  return `<div class="card habit-heat-card">
    <div class="hm-head">
      <h3 class="card-title">${t('hmTitle')}</h3>
      ${weekCompareHTML()}
      <button type="button" class="pop-btn share-btn" data-action="share-streak">${t('shareTitle')}</button>
      <button type="button" class="pop-btn share-btn" data-action="report" title="${t('reportTitle')}">📊 ${t('reportTitle')}</button>
    </div>
    ${heatHeroHTML()}
    ${heatRibbonHTML()}
    <div class="hm-legend">
      <span>${t('hmLess')}</span>
      <span class="hm-rb-cell hm-l0"></span><span class="hm-rb-cell hm-l1"></span><span class="hm-rb-cell hm-l2"></span><span class="hm-rb-cell hm-l3"></span><span class="hm-rb-cell hm-l4"></span><span class="hm-rb-cell hm-l5"></span>
      <span>${t('hmMore')}</span>
    </div>
    <div class="hm-streaks">${streaks}</div>
  </div>`;
}

/* ---- Chia sẻ streak 🔥: tạo ảnh card 1080×1080 (tên + streak + heatmap) ---- */
function shareTopInfo() {
  let top = null;
  state.habits.forEach((h) => {
    const s = habitStreakCached(h);
    if (!top || s.cur > top.s.cur) top = { h, s };
  });
  return top;
}

function canvasCircle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function streakCardBlob(name, habitName, cur, best) {
  return new Promise((resolve, reject) => {
    try {
      const W = 1080, H = 1080;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');

      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#FFF6EA');
      grad.addColorStop(0.55, '#FDEBD7');
      grad.addColorStop(1, '#F8DCC0');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);

      g.fillStyle = 'rgba(255,255,255,.5)';
      canvasCircle(g, W - 110, 130, 170);
      canvasCircle(g, 40, H - 150, 230);
      g.fillStyle = 'rgba(194,78,40,.05)';
      canvasCircle(g, W - 190, H - 220, 130);
      g.fillStyle = 'rgba(185,138,31,.08)';
      canvasCircle(g, 200, 150, 90);

      g.textAlign = 'center';

      g.fillStyle = '#4A403A';
      g.font = "700 36px 'Baloo 2','Fredoka','Nunito',sans-serif";
      g.fillText('🐥 TaskFlow-Todoist', W / 2, 96);

      g.fillStyle = '#8A7A6B';
      g.font = "700 42px 'Baloo 2','Nunito',sans-serif";
      g.fillText(name, W / 2, 158);

      g.fillStyle = '#C24E28';
      g.font = "800 260px 'Baloo 2','Fredoka',sans-serif";
      g.fillText(String(cur), W / 2, 400);

      g.fillStyle = '#4A403A';
      g.font = "700 46px 'Baloo 2','Nunito',sans-serif";
      g.fillText(t('hmHeroDays'), W / 2, 468);

      g.font = "700 34px 'Nunito','Quicksand',sans-serif";
      const tw = g.measureText('🔥 ' + habitName).width;
      const pw = tw + 48, ph = 62;
      g.fillStyle = 'rgba(255,253,248,.85)';
      g.beginPath();
      if (g.roundRect) g.roundRect(W / 2 - pw / 2, 506, pw, ph, 31);
      else g.rect(W / 2 - pw / 2, 506, pw, ph);
      g.fill();
      g.fillStyle = '#C24E28';
      g.fillText('🔥 ' + habitName, W / 2, 548);

      g.fillStyle = '#B98A1F';
      g.font = "800 38px 'Baloo 2','Nunito',sans-serif";
      g.fillText('🏆 ' + best + ' · ' + t('hmHeroRecLbl'), W / 2, 636);

      // Heatmap: 16 tuần × 7 ngày
      const anchor = streakAnchorDay();
      const anchorDate = new Date(PLAN_YEAR, PLAN_MONTH, anchor + 1);
      const start = new Date(anchorDate.getTime() - (16 * 7 - 1) * 86400000);
      const monday = new Date(start);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const levels = ['#EFE6DA', '#FBE4CE', '#F7C79B', '#EE9E66', '#E0753F', '#C24E28'];
      const cell = 42, gap = 8, colW = cell + gap, rowH = cell + gap;
      const gridW = 16 * colW - gap;
      const x0 = (W - gridW) / 2, y0 = 716;
      const now = new Date();
      const inRange = now.getFullYear() === PLAN_YEAR && now.getMonth() === PLAN_MONTH;
      for (let w = 0; w < 16; w++) {
        const colStart = new Date(monday.getTime() + w * 7 * 86400000);
        for (let dow = 0; dow < 7; dow++) {
          const dt = new Date(colStart.getTime() + dow * 86400000);
          if (dt < start || dt > anchorDate) continue;
          const y = dt.getFullYear(), m = dt.getMonth(), d = dt.getDate() - 1;
          const lvl = heatLevel(dayAggregateAt(y, m, d));
          g.fillStyle = levels[lvl];
          g.beginPath();
          if (g.roundRect) g.roundRect(x0 + w * colW, y0 + dow * rowH, cell, cell, 12);
          else g.rect(x0 + w * colW, y0 + dow * rowH, cell, cell);
          g.fill();
          const isToday = inRange && y === now.getFullYear() && m === now.getMonth() && d === now.getDate() - 1;
          if (isToday) {
            g.strokeStyle = '#C24E28';
            g.lineWidth = 5;
            g.stroke();
          }
        }
      }

      g.fillStyle = '#8A7A6B';
      g.font = "700 30px 'Nunito','Quicksand',sans-serif";
      g.fillText(t('shareFooter'), W / 2, H - 70);

      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
    } catch (e) { reject(e); }
  });
}

async function doShareStreak() {
  const top = shareTopInfo();
  if (!top || top.s.cur === 0) { TaskFlowUI.toast(t('shareNoStreak'), 'error'); return; }
  let name = localStorage.getItem('planner-name');
  if (!name) {
    name = (prompt(t('shareNamePrompt')) || '').trim() || t('meName');
    try { localStorage.setItem('planner-name', name); } catch (e) { /* ẩn */ }
  }
  try {
    const blob = await streakCardBlob(name, top.h.name, top.s.cur, top.s.best);
    const file = new File([blob], 'taskflow-streak.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'TaskFlow-Todoist 🐥',
          text: '🔥 ' + top.s.cur + ' ' + t('hmHeroDays') + ' · ' + top.h.name,
        });
        trackEvent('share_streak', { days: top.s.cur, via: 'native' });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        trackEvent('share_streak', { days: top.s.cur, via: 'fallback' });
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'taskflow-streak.png';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
    trackEvent('share_streak', { days: top.s.cur, via: 'download' });
    TaskFlowUI.toast(t('shareDone'), 'success');
  } catch (e) {
    TaskFlowUI.toast(t('shareFail'), 'error');
  }
}

/* ---------- Báo cáo tháng 📊 ---------- */
function monthlyReportData() {
  const ms = monthlyStats();
  const pcts = state.habits.map((h) => habitPct(h));
  const habitAvg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  let top = null, rec = null;
  state.habits.forEach((h) => {
    const s = habitStreakCached(h);
    if (!top || s.cur > top.s.cur) top = { h, s };
    if (!rec || s.best > rec.s.best) rec = { h, s };
  });
  let activeDays = 0;
  for (let d = 0; d < NUM_DAYS; d++) if (dayAggregate(d) > 0) activeDays++;
  return {
    y: PLAN_YEAR, m: PLAN_MONTH,
    goalPct: ms.pct, goalDone: ms.done, goalTotal: ms.total,
    habitAvg, top, rec, activeDays, numDays: NUM_DAYS,
    weekPcts: state.weeks.map((w) => weekStats(w).pct),
  };
}

function renderReportModal() {
  const el = document.getElementById('reportContent');
  if (!el) return;
  const r = monthlyReportData();
  const topName = r.top ? esc(r.top.h.name) : '—';
  const recName = r.rec ? esc(r.rec.h.name) : '—';
  el.innerHTML = `
    <div class="report-head">
      <div class="donut-wrap"><div class="donut">${donutSVG(r.goalPct, 96, 12, '#C24E28')}</div>
        <div class="donut-center"><span>${r.goalPct}%</span><small>${t('reportGoalPct')}</small></div>
      </div>
    </div>
    <div class="report-grid">
      <div class="report-cell"><b>${r.habitAvg}%</b><span>${t('reportHabitAvg')}</span></div>
      <div class="report-cell"><b>${r.goalDone}/${r.goalTotal}</b><span>${t('reportGoalsDone')}</span></div>
      <div class="report-cell"><b>🔥 ${r.top ? r.top.s.cur : 0}</b><span>${t('reportTopHabit')} · ${topName}</span></div>
      <div class="report-cell"><b>🏆 ${r.rec ? r.rec.s.best : 0}</b><span>${t('reportRecord')} · ${recName}</span></div>
      <div class="report-cell"><b>${r.activeDays}/${r.numDays}</b><span>${t('reportActive')}</span></div>
    </div>
    <div class="report-weekbars" aria-hidden="true">${r.weekPcts.map((p) => `<div class="rw-bar" style="height:${Math.max(p, 4)}%"></div>`).join('')}</div>`;
}

function openReportModal() {
  const m = document.getElementById('reportModal');
  if (!m) return;
  renderReportModal();
  TaskFlowUI.openDialog('reportModal');
}

function closeReportModal() {
  TaskFlowUI.closeDialog('reportModal');
}

// Tạo ảnh báo cáo 1080×1080 (style streak card) để chia sẻ.
function reportCardBlob(r) {
  return new Promise((resolve, reject) => {
    try {
      const W = 1080, H = 1080;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');

      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#FFF6EA');
      grad.addColorStop(0.55, '#FDEBD7');
      grad.addColorStop(1, '#F8DCC0');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);

      g.fillStyle = 'rgba(255,255,255,.5)';
      canvasCircle(g, W - 110, 130, 170);
      canvasCircle(g, 40, H - 150, 230);
      g.fillStyle = 'rgba(194,78,40,.05)';
      canvasCircle(g, W - 190, H - 220, 130);

      g.textAlign = 'center';
      g.fillStyle = '#4A403A';
      g.font = "700 36px 'Baloo 2','Fredoka','Nunito',sans-serif";
      g.fillText('🐥 TaskFlow-Todoist', W / 2, 96);
      g.fillStyle = '#8A7A6B';
      g.font = "700 42px 'Baloo 2','Nunito',sans-serif";
      g.fillText(t('reportCardTitle', { m: monthLabel(r.m), y: r.y }), W / 2, 158);

      g.fillStyle = '#C24E28';
      g.font = "800 120px 'Baloo 2','Fredoka',sans-serif";
      g.fillText(r.goalPct + '%', W / 2, 300);
      g.fillStyle = '#4A403A';
      g.font = "700 40px 'Baloo 2','Nunito',sans-serif";
      g.fillText(t('reportGoalPct') + ' · ' + r.goalDone + '/' + r.goalTotal, W / 2, 352);

      const rows = [
        [t('reportHabitAvg'), r.habitAvg + '%'],
        [t('reportTopHabit'), r.top ? '🔥 ' + r.top.s.cur + ' · ' + r.top.h.name : '—'],
        [t('reportRecord'), r.rec ? '🏆 ' + r.rec.s.best + ' · ' + r.rec.h.name : '—'],
        [t('reportActive'), r.activeDays + '/' + r.numDays],
      ];
      g.font = "700 34px 'Nunito','Quicksand',sans-serif";
      rows.forEach((row, i) => {
        const y = 430 + i * 74;
        const pw = g.measureText(row[0] + '  ' + row[1]).width + 56, ph = 58;
        g.fillStyle = 'rgba(255,253,248,.85)';
        g.beginPath();
        if (g.roundRect) g.roundRect(W / 2 - pw / 2, y - ph + 16, pw, ph, 29);
        else g.rect(W / 2 - pw / 2, y - ph + 16, pw, ph);
        g.fill();
        g.fillStyle = '#8A7A6B';
        g.textAlign = 'left';
        g.fillText(row[0], W / 2 - pw / 2 + 28, y + 4);
        g.fillStyle = '#C24E28';
        g.textAlign = 'right';
        g.fillText(row[1], W / 2 + pw / 2 - 28, y + 4);
        g.textAlign = 'center';
      });

      g.fillStyle = '#8A7A6B';
      g.font = "700 30px 'Nunito','Quicksand',sans-serif";
      g.fillText(t('shareFooter'), W / 2, H - 70);

      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
    } catch (e) { reject(e); }
  });
}

async function doShareReport() {
  const r = monthlyReportData();
  let name = localStorage.getItem('planner-name');
  if (!name) {
    name = (prompt(t('shareNamePrompt')) || '').trim() || t('meName');
    try { localStorage.setItem('planner-name', name); } catch (e) { /* ẩn */ }
  }
  try {
    const blob = await reportCardBlob(r);
    const file = new File([blob], 'taskflow-report.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'TaskFlow-Todoist 🐥',
          text: '📊 ' + t('reportCardTitle', { m: monthLabel(r.m), y: r.y }) + ' · ' + r.goalPct + '%',
        });
        trackEvent('share_report', { goalPct: r.goalPct, via: 'native' });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        trackEvent('share_report', { goalPct: r.goalPct, via: 'fallback' });
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'taskflow-report.png';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
    trackEvent('share_report', { goalPct: r.goalPct, via: 'download' });
    TaskFlowUI.toast(t('shareDone'), 'success');
  } catch (e) {
    TaskFlowUI.toast(t('shareFail'), 'error');
  }
}

/* ---------- Báo cáo tuần (Phase 4) ---------- */

// Số liệu tuần: % goals + habit theo từng ngày + top habit + ngày năng suất nhất.
function weeklyReportData(w) {
  const st = weekStats(w);
  const habitByDay = [];
  for (let di = 0; di < 7; di++) {
    const gi = (w.n - 1) * 7 + di; // chỉ số ngày toàn tháng tương ứng
    habitByDay.push(gi < NUM_DAYS ? dayAggregate(gi) : 0);
  }
  let top = null, topN = 0;
  state.habits.forEach((h) => {
    let n = 0;
    for (let di = 0; di < 7; di++) {
      const gi = (w.n - 1) * 7 + di;
      if (gi < NUM_DAYS && h.days[gi]) n++;
    }
    if (n > topN) { topN = n; top = h; }
  });
  let bestDay = 0;
  habitByDay.forEach((p, i) => { if (p > habitByDay[bestDay]) bestDay = i; });
  return { n: w.n, pct: st.pct, done: st.done, inProg: st.inProg, total: st.total, habitByDay, top, topN, bestDay };
}

function renderWeekReportModal() {
  const el = document.getElementById('weekReportContent');
  if (!el) return;
  const w = state.weeks[state.currentWeek - 1];
  if (!w) return;
  const r = weeklyReportData(w);
  const topName = r.top ? esc(r.top.name) : '—';
  el.innerHTML = `
    <div class="report-head">
      <div class="donut-wrap"><div class="donut">${donutSVG(r.pct, 96, 12, '#C24E28')}</div>
        <div class="donut-center"><span>${r.pct}%</span><small>${t('weekReportGoalPct')}</small></div>
      </div>
    </div>
    <div class="report-grid">
      <div class="report-cell"><b>${r.done}</b><span>${t('weekReportDone')}</span></div>
      <div class="report-cell"><b>${r.inProg}</b><span>${t('weekReportInProg')}</span></div>
      <div class="report-cell"><b>${r.total}</b><span>${t('weekReportTotal')}</span></div>
      <div class="report-cell"><b>🔥 ${r.topN}</b><span>${t('weekReportTopHabit')} · ${topName}</span></div>
      <div class="report-cell"><b>⭐ ${t('weekReportDayT', { d: r.bestDay + 1 })}</b><span>${t('weekReportBestDay')} · ${r.habitByDay[r.bestDay]}%</span></div>
    </div>
    <div class="report-weekbars" aria-hidden="true">${r.habitByDay.map((p) => `<div class="rw-bar" style="height:${Math.max(p, 4)}%"></div>`).join('')}</div>`;
}

function openWeekReportModal() {
  const m = document.getElementById('weekReportModal');
  if (!m) return;
  renderWeekReportModal();
  TaskFlowUI.openDialog('weekReportModal');
}

function closeWeekReportModal() {
  TaskFlowUI.closeDialog('weekReportModal');
}

// Ảnh báo cáo tuần 1080×1080 — style streak/report card.
function weekReportCardBlob(r) {
  return new Promise((resolve, reject) => {
    try {
      const W = 1080, H = 1080;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#FFF6EA');
      grad.addColorStop(0.55, '#FDEBD7');
      grad.addColorStop(1, '#F8DCC0');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.5)';
      canvasCircle(g, W - 110, 130, 170);
      canvasCircle(g, 40, H - 150, 230);
      g.textAlign = 'center';
      g.fillStyle = '#4A403A';
      g.font = "700 36px 'Baloo 2','Fredoka','Nunito',sans-serif";
      g.fillText('🐥 TaskFlow-Todoist', W / 2, 96);
      g.fillStyle = '#8A7A6B';
      g.font = "700 42px 'Baloo 2','Nunito',sans-serif";
      g.fillText(t('weekReportCardTitle', { n: r.n }), W / 2, 158);
      g.fillStyle = '#C24E28';
      g.font = "800 120px 'Baloo 2','Fredoka',sans-serif";
      g.fillText(r.pct + '%', W / 2, 300);
      g.fillStyle = '#4A403A';
      g.font = "700 40px 'Baloo 2','Nunito',sans-serif";
      g.fillText(t('weekReportGoalPct') + ' · ' + r.done + '/' + r.total, W / 2, 352);
      const rows = [
        [t('weekReportDone'), r.done],
        [t('weekReportInProg'), r.inProg],
        [t('weekReportTopHabit'), r.top ? '🔥 ' + r.topN + ' · ' + r.top.name : '—'],
        [t('weekReportBestDay'), t('weekReportDayT', { d: r.bestDay + 1 }) + ' · ' + r.habitByDay[r.bestDay] + '%'],
      ];
      g.font = "700 34px 'Nunito','Quicksand',sans-serif";
      rows.forEach((row, i) => {
        const y = 430 + i * 74;
        const pw = g.measureText(row[0] + '  ' + row[1]).width + 56, ph = 58;
        g.fillStyle = 'rgba(255,253,248,.85)';
        g.beginPath();
        if (g.roundRect) g.roundRect(W / 2 - pw / 2, y - ph + 16, pw, ph, 29);
        else g.rect(W / 2 - pw / 2, y - ph + 16, pw, ph);
        g.fill();
        g.fillStyle = '#8A7A6B';
        g.textAlign = 'left';
        g.fillText(row[0], W / 2 - pw / 2 + 28, y + 4);
        g.fillStyle = '#C24E28';
        g.textAlign = 'right';
        g.fillText(String(row[1]), W / 2 + pw / 2 - 28, y + 4);
        g.textAlign = 'center';
      });
      // Bar chart 7 ngày
      const bx = W / 2 - 300, bw = 600, bh = 180, by = 800;
      const w = state.weeks[r.n - 1];
      g.fillStyle = '#8A7A6B';
      g.font = "700 28px 'Nunito','Quicksand',sans-serif";
      g.fillText(t('weekReportBestDay') + ' · ' + (w ? w.days.map((d) => d.date).join(' – ') : '1–7'), W / 2, by - 24);
      const maxP = Math.max(1, ...r.habitByDay);
      r.habitByDay.forEach((p, i) => {
        const h = Math.max(6, (p / maxP) * bh);
        g.fillStyle = '#C24E28';
        g.beginPath();
        if (g.roundRect) g.roundRect(bx + (i * bw) / 7 + 8, by - h, bw / 7 - 16, h, 10);
        else g.rect(bx + (i * bw) / 7 + 8, by - h, bw / 7 - 16, h);
        g.fill();
      });
      g.fillStyle = '#8A7A6B';
      g.font = "700 30px 'Nunito','Quicksand',sans-serif";
      g.fillText(t('shareFooter'), W / 2, H - 60);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
    } catch (e) { reject(e); }
  });
}

async function doShareWeekReport() {
  const w = state.weeks[state.currentWeek - 1];
  if (!w) return;
  const r = weeklyReportData(w);
  let name = localStorage.getItem('planner-name');
  if (!name) {
    name = (prompt(t('shareNamePrompt')) || '').trim() || t('meName');
    try { localStorage.setItem('planner-name', name); } catch (e) { /* ẩn */ }
  }
  try {
    const blob = await weekReportCardBlob(r);
    const file = new File([blob], 'taskflow-week-report.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'TaskFlow-Todoist 🐥',
          text: '📊 ' + t('weekReportShareTxt', { n: r.n, p: r.pct }),
        });
        trackEvent('share_week_report', { pct: r.pct, via: 'native' });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        trackEvent('share_week_report', { pct: r.pct, via: 'fallback' });
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'taskflow-week-report.png';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
    trackEvent('share_week_report', { pct: r.pct, via: 'download' });
    TaskFlowUI.toast(t('shareDone'), 'success');
  } catch (e) {
    TaskFlowUI.toast(t('shareFail'), 'error');
  }
}

/* ---------- Huy hiệu 🎖️ ---------- */
const BADGES_KEY = 'planner-badges';
const BADGE_DEFS = [
  { id: 'b7', icon: '🔥', nameKey: 'badge7', hintKey: 'badgeHint7' },
  { id: 'b30', icon: '🔥🔥', nameKey: 'badge30', hintKey: 'badgeHint30' },
  { id: 'best14', icon: '🏆', nameKey: 'badgeBest14', hintKey: 'badgeHintBest14' },
  { id: 'goals100', icon: '🎯', nameKey: 'badgeGoals100', hintKey: 'badgeHintGoals100' },
  { id: 'habit100', icon: '💯', nameKey: 'badgeHabit100', hintKey: 'badgeHintHabit100' },
  { id: 'active15', icon: '📅', nameKey: 'badgeActive15', hintKey: 'badgeHintActive15' },
];

function loadBadges() {
  try {
    const raw = localStorage.getItem(BADGES_KEY);
    const b = raw ? JSON.parse(raw) : null;
    return b && typeof b.earned === 'object' ? b : { earned: {} };
  } catch (e) { return { earned: {} }; }
}

function saveBadges(badges) {
  try { localStorage.setItem(BADGES_KEY, JSON.stringify(badges)); } catch (e) { /* ẩn */ }
  if (window.Sync) window.Sync.push(BADGES_KEY);
}

let badgesStore = loadBadges();

function countActiveDays() {
  let n = 0;
  for (let d = 0; d < NUM_DAYS; d++) if (dayAggregate(d) > 0) n++;
  return n;
}

// Trao huy hiệu mới khi đang xem tháng hiện tại; trả về số badge vừa mở.
function evaluateMonthBadges() {
  const now = new Date();
  if (now.getFullYear() !== PLAN_YEAR || now.getMonth() !== PLAN_MONTH) return 0;
  const streaks = {};
  state.habits.forEach((h) => { streaks[h.id] = habitStreakCached(h); });
  const ms = monthlyStats();
  const earned = window.PlanMath ? window.PlanMath.evaluateBadges({
    streaks,
    goalPct: ms.pct,
    goalTotal: ms.total,
    habitPcts: state.habits.map((h) => habitPct(h)),
    activeDays: countActiveDays(),
  }) : [];
  let fresh = 0;
  earned.forEach((id) => {
    if (badgesStore.earned[id]) return;
    badgesStore.earned[id] = { t: Date.now(), y: PLAN_YEAR, m: PLAN_MONTH };
    fresh++;
    trackEvent('award_badge', { badge: id });
    const def = BADGE_DEFS.find((x) => x.id === id);
    TaskFlowUI.toast(t('badgeNew', { b: def ? t(def.nameKey) : id }), 'success');
  });
  if (fresh) saveBadges(badgesStore);
  return fresh;
}

function badgePanelHTML() {
  return `<div class="card badge-card">
    <div class="badge-head">
      <h3 class="card-title">🎖️ ${t('badgesTitle')}</h3>
    </div>
    <div class="badge-grid">
      ${BADGE_DEFS.map((d) => {
        const e = badgesStore.earned[d.id];
        const cls = e ? '' : ' locked';
        const title = e ? t('badgeEarned', { m: monthLabel(e.m), y: e.y }) : t(d.hintKey);
        return `<span class="badge-item${cls}" title="${title}" aria-label="${title}">
          <span class="badge-icon" aria-hidden="true">${d.icon}</span>
          <span class="badge-name">${t(d.nameKey)}</span>
          ${e ? `<span class="badge-when">${monthLabel(e.m)} ${e.y}</span>` : ''}
        </span>`;
      }).join('')}
    </div>
  </div>`;
}

function refreshHeatCard() {
  clearStreakCache();
  document.querySelectorAll('[data-role="hm-rb-cell"]').forEach((cell) => {
    const y = +cell.dataset.y, m = +cell.dataset.m, d = +cell.dataset.d;
    const pct = dayAggregateAt(y, m, d);
    const lvl = heatLevel(pct);
    const now = new Date();
    const isToday = y === now.getFullYear() && m === now.getMonth() && d === now.getDate() - 1;
    cell.className = 'hm-rb-cell hm-l' + lvl + (isToday ? ' today' : '');
    cell.title = t('hmDayFullT', { m: shortMonth(m), d: d + 1, p: pct });
  });
  // Hero
  let top = null;
  state.habits.forEach((h) => {
    const s = habitStreakCached(h);
    if (!top || s.cur > top.s.cur) top = { h, s };
  });
  if (top) {
    const curEl = document.querySelector('[data-role="hm-hero-cur"]');
    if (curEl) curEl.textContent = top.s.cur;
    const bestEl = document.querySelector('[data-role="hm-hero-best"]');
    if (bestEl) bestEl.textContent = top.s.best;
    const nameEl = document.querySelector('[data-role="hm-hero-name"]');
    if (nameEl) nameEl.textContent = top.h.name;
    const fillEl = document.querySelector('[data-role="hm-hero-fill"]');
    if (fillEl) fillEl.style.width = (top.s.best ? Math.min(100, Math.round((top.s.cur / top.s.best) * 100)) : 0) + '%';
    const noteEl = document.querySelector('[data-role="hm-hero-note"]');
    if (noteEl) noteEl.textContent = top.s.cur === 0 ? t('hmHeroStart')
      : top.s.best > 0 && top.s.cur >= top.s.best ? t('hmHeroNew')
      : t('hmHeroRec', { n: top.s.best - top.s.cur });
  }
  state.habits.forEach((h) => {
    const s = habitStreakCached(h);
    const curEl = document.querySelector(`[data-role="hm-streak-cur"][data-id="${h.id}"]`);
    if (curEl) curEl.textContent = s.cur;
    const bestEl = document.querySelector(`[data-role="hm-streak-best"][data-id="${h.id}"]`);
    if (bestEl) bestEl.textContent = s.best;
    const miniEl = document.querySelector(`[data-role="hm-mini"][data-id="${h.id}"]`);
    if (miniEl) miniEl.innerHTML = habitMiniHTML(h);
  });
  const wcEl = document.querySelector('[data-role="hm-week-compare"]');
  if (wcEl) wcEl.outerHTML = weekCompareHTML();
}

/* ---------- Thêm / sửa / xoá động (goals & habits) ---------- */

function showGoalAdd(kind) {
  const bar = document.querySelector(`[data-role="goal-add-bar"][data-kind="${kind}"]`);
  if (!bar) return;
  bar.hidden = !bar.hidden;
  const input = bar.querySelector('[data-role="goal-add-input"]');
  if (!bar.hidden && input) input.focus();
}

function addGoal(kind, text) {
  text = (text || '').trim();
  if (!text) return false;
  state.monthlyGoals.push({ id: 'g' + Date.now(), text, kind, done: false });
  renderOverview();
  save();
  trackEvent('create_goal', { kind });
  return true;
}

function removeGoal(id) {
  const g = state.monthlyGoals.find((x) => x.id === id);
  if (!g) return;
  state.monthlyGoals = state.monthlyGoals.filter((x) => x.id !== id);
  renderOverview();
  save();
}

function addHabit(name) {
  name = (name || '').trim();
  if (!name) return false;
  state.habits.push({ id: 'h' + Date.now(), name, target: 100, days: Array.from({ length: NUM_DAYS }, () => false), remind: { enabled: false, time: '20:00' } });
  renderOverview();
  save();
  trackEvent('create_habit');
  return true;
}

function removeHabit(id) {
  const h = state.habits.find((x) => x.id === id);
  if (!h) return;
  state.habits = state.habits.filter((x) => x.id !== id);
  renderOverview();
  save();
}

// Sao chép habit (tên + target, GIỮ id) sang tháng sau để streak nối xuyên tháng; không copy ô tick.
function copyHabitsToNextMonth() {
  const nm = window.PlanMath ? window.PlanMath.nextMonth(PLAN_YEAR, PLAN_MONTH) : { y: PLAN_YEAR, m: PLAN_MONTH + 1 };
  const y = nm.y, m = nm.m;
  let s = loadMonthStateOrCreate(y, m);
  if (!Array.isArray(s.habits)) s.habits = [];
  const freshDays = Array.from({ length: new Date(y, m + 1, 0).getDate() }, () => false);
  let n = 0;
  state.habits.forEach((h) => {
    const old = habitInMonthState(s, h);
    const next = { id: h.id, name: h.name, target: typeof h.target === 'number' && h.target >= 1 ? h.target : 100, days: freshDays.slice() };
    if (old) s.habits[s.habits.indexOf(old)] = next;
    else s.habits.push(next);
    n++;
  });
  saveMonthState(y, m, s);
  invalidateYearCache();
  trackEvent('copy_habits', { n });
  if (n) TaskFlowUI.toast(t('copyHabitsDone', { n }), 'success');
  return n;
}

function beginTargetEdit(btn) {
  const id = btn.dataset.id;
  const cell = btn.closest('.habit-name-cell');
  const h = state.habits.find((x) => x.id === id);
  if (!cell || !h) return;
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'inline-input target-input';
  input.min = '1';
  input.max = '100';
  input.value = h.target || 100;
  const span = cell.querySelector('.habit-name-text');
  span.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    const v = Math.min(100, Math.max(1, parseInt(input.value, 10) || 100));
    h.target = v;
    renderOverview();
    save();
    trackEvent('edit_habit_target', { target: v });
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { renderOverview(); }
  });
  input.addEventListener('blur', commit);
}

// Sửa tag của task: thay nút 🏷️ bằng input inline, Enter để lưu (phân cách bằng dấu phẩy).
function beginTagEdit(btn) {
  const wk = +btn.dataset.week, di = +btn.dataset.day, ti = +btn.dataset.task;
  const w = state.weeks[wk - 1];
  const task = w && w.days[di] && w.days[di].tasks[ti];
  const row = btn.closest('.task-row');
  if (!task || !row) return;
  const existing = row.querySelector('.tag-edit-input');
  if (existing) { existing.remove(); return; }
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-input tag-edit-input';
  input.maxLength = 60;
  input.value = (task.tags || []).join(', ');
  input.placeholder = t('tagPh');
  row.insertBefore(input, btn.nextSibling);
  input.focus();
  input.select();
  const commit = () => {
    const tags = input.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8);
    task.tags = tags;
    renderWeek();
    save();
    trackEvent('edit_task_tags', { n: tags.length });
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { renderWeek(); }
  });
  input.addEventListener('blur', () => {
    if (input.isConnected) commit();
  });
}

function refreshHabitLabels(h) {
  const lbl = document.querySelector(`[data-role="hbar-label"][data-id="${h.id}"]`);
  if (lbl) { lbl.textContent = h.name; lbl.title = h.name; }
}

function beginInlineEdit(btn) {
  const id = btn.dataset.id;
  const cell = btn.closest('.goal-item, .habit-name-cell');
  const span = cell ? cell.querySelector('[data-role="goal-text"], .habit-name-text') : null;
  if (!span) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-input';
  input.maxLength = 120;
  input.value = span.textContent;
  span.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    const val = input.value.trim();
    if (span.dataset.role === 'goal-text') {
      const g = state.monthlyGoals.find((x) => x.id === id);
      if (g) { g.text = val || g.text; save(); }
      const span2 = document.createElement('span');
      span2.className = 'g-text';
      span2.dataset.role = 'goal-text';
      span2.dataset.id = id;
      span2.textContent = val || (g ? g.text : '');
      input.replaceWith(span2);
    } else {
      const h = state.habits.find((x) => x.id === id);
      if (h) { h.name = val || h.name; refreshHabitLabels(h); save(); }
      const span2 = document.createElement('span');
      span2.className = 'habit-name-text';
      span2.dataset.id = id;
      span2.title = h.name;
      span2.textContent = h.name;
      input.replaceWith(span2);
    }
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { input.value = input.defaultValue; input.blur(); }
  });
}

/* ---------- Kế hoạch năm ---------- */

function renderYear() {
  invalidateYearCache();
  const el = document.getElementById('view-year');
  const gs = yearGoalStats();
  const widgets = getVisibleWidgets('year');
  const monthly = yearMonthlyData();
  const average = monthly.length ? Math.round(monthly.reduce((sum, item) => sum + item.pct, 0) / monthly.length) : 0;
  const quarters = quarterStats();
  const bestQuarterIndex = quarters.reduce((best, quarter, index) => quarter.pct > quarters[best].pct ? index : best, 0);
  const bestHabit = bestHabitAcrossYear();
  el.innerHTML = `
    <div class="year-page">
      <header class="year-page-header">
        <div>
          <p class="year-page-eyebrow">${t('yearWorkspaceEyebrow')}</p>
          <h1 class="year-page-title">${t('yearPageTitle', { y: PLAN_YEAR })}</h1>
          <p class="year-page-subtitle">${t('yearPageSubtitle')}</p>
        </div>
        <div class="year-page-actions">
          <button type="button" class="pop-btn" data-action="year-report" title="${t('yearReportTitle')}">${window.TaskFlowUI.icon('report')}<span>${t('yearReportTitle')}</span></button>
          <button type="button" class="pop-btn widget-settings-btn" data-action="widget-settings" data-view="year" title="${t('widgetSettings')}">${window.TaskFlowUI.icon('settings')}<span>${t('widgetSettings')}</span></button>
        </div>
      </header>
      <section class="year-summary" aria-label="${t('yearWorkspaceEyebrow')}">
        <article class="metric year-summary-metric"><span>${t('yearSummaryGoals')}</span><strong data-role="year-summary-goals">${gs.done}/${gs.total}</strong><small data-role="year-summary-goals-pct">${gs.pct}%</small></article>
        <article class="metric year-summary-metric"><span>${t('yearSummaryAverage')}</span><strong>${average}%</strong><small>${PLAN_YEAR}</small></article>
        <article class="metric year-summary-metric"><span>${t('yearSummaryQuarter')}</span><strong>Q${bestQuarterIndex + 1}</strong><small>${quarters[bestQuarterIndex].pct}%</small></article>
        <article class="metric year-summary-metric"><span>${t('yearSummaryHabit')}</span><strong>${bestHabit.name ? esc(bestHabit.name) : '—'}</strong><small>${bestHabit.days}</small></article>
      </section>
      <div class="year-widget-flow">
        ${widgets.map(function (widget) { return `<section class="year-widget year-widget--${widget.id}" data-widget-id="${widget.id}">${widget.html}</section>`; }).join('')}
      </div>
    </div>
  `;
}

function yearCardHTML() {
  const now = new Date();
  return `<div class="card year-card">
    <h2 class="week-section-title">${t('widgetLabel_year-card')}</h2>
    <table class="info-table">
      <tr><th>${t('yearTh')}</th><td>${PLAN_YEAR}</td></tr>
      <tr><th>${t('curMonthTh')}</th><td>${now.getMonth() + 1}</td></tr>
    </table>
    <p class="year-motto">${t('motto')}</p>
  </div>`;
}

function yearGoalsCardHTML(gs) {
  const y = PLAN_YEAR;
  const pri = yearState.goals.filter((g) => g.kind === 'priority');
  const reg = yearState.goals.filter((g) => g.kind === 'regular');
  return `<div class="card year-goals-card">
    <div class="year-goal-grid year-goals-top">
      <div class="goals-info sub">
        <div class="big-pct" data-role="year-big-pct">${gs.pct}%</div>
        <h3 class="card-title">${t('yGoalsTitle', { y })}</h3>
        <table class="stats-table">
          <tr><th>${t('statsDone')}</th><th>${t('statsInProg')}</th><th>${t('statsTotal')}</th></tr>
          <tr data-role="year-stats"><td>${gs.done}</td><td>${gs.inProg}</td><td>${gs.total}</td></tr>
        </table>
        <button type="button" class="ydata-btn" data-action="pullyear" title="${t('pullBtn')}">${t('pullBtn')}</button>
      </div>
      <div class="goals-donut sub">
        <div class="donut-wrap">
          <div class="donut" data-role="year-donut">${donutSVG(gs.pct, 140, 18, '#666854')}</div>
          <div class="donut-center"><span data-role="year-big-pct">${gs.pct}%</span><small>${t('unitGoals')}</small></div>
        </div>
      </div>
      <div class="goal-list sub">
        <div class="goal-group-dual">
          <div class="goal-block">
            <div class="v-strip pink"><span>${t('priLbl')}</span></div>
            <ul class="goal-items">
              ${pri.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}" draggable="true" data-drag="goal" data-scope="y" data-id="${g.id}" title="${t('dragHint')}">
                ${checkboxHTML('pink', g.done, `data-action="ygoal" data-id="${g.id}"`, window.TaskFlowUI.checkboxLabel('goal', g.text, String(PLAN_YEAR)))}
                <span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="y-goal-text" data-id="${g.id}" data-placeholder="${t('yGoalPh')}" aria-label="${t('yGoalAria')}">${esc(g.text)}</span>
                <button type="button" class="btn-del" data-action="delgoal" data-scope="y" data-id="${g.id}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">✕</button>
              </li>`).join('')}
              <li class="goal-item add-item"><button type="button" class="btn-add" data-action="addgoal" data-scope="y" data-kind="priority" aria-label="${t('addPriGoalAria')}" title="${t('addPriGoalAria')}">＋</button></li>
            </ul>
          </div>
          <div class="goal-block">
            <div class="v-strip blue"><span>${t('regLbl')}</span></div>
            <ul class="goal-items">
              ${reg.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}" draggable="true" data-drag="goal" data-scope="y" data-id="${g.id}" title="${t('dragHint')}">
                ${checkboxHTML('blue', g.done, `data-action="ygoal" data-id="${g.id}"`, window.TaskFlowUI.checkboxLabel('goal', g.text, String(PLAN_YEAR)))}
                <span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="y-goal-text" data-id="${g.id}" data-placeholder="${t('yGoalPh')}" aria-label="${t('yGoalAria')}">${esc(g.text)}</span>
                <button type="button" class="btn-del" data-action="delgoal" data-scope="y" data-id="${g.id}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">✕</button>
              </li>`).join('')}
              <li class="goal-item add-item"><button type="button" class="btn-add" data-action="addgoal" data-scope="y" data-kind="regular" aria-label="${t('addRegGoalAria')}" title="${t('addRegGoalAria')}">＋</button></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function yearChartsHTML() {
  const monthly = yearMonthlyData();
  const quarters = [0, 1, 2, 3].map((q) => Math.round((monthly[q * 3].pct + monthly[q * 3 + 1].pct + monthly[q * 3 + 2].pct) / 3));
  return `<div class="card year-charts-card">
    <div class="charts-head"><h3 class="card-title">${t('progressYear')}</h3></div>
    <div class="mini-chart-block">
      <div class="mini-chart-title">${t('quarterT')}</div>
      <div class="chart-row chart-row-q">
        ${quarters.map((p, i) => `<div class="bar-col" title="Q${i + 1}: ${p}%"><span class="bar-val">${p}%</span><span class="bar" style="height:${Math.max(p, 4)}%"></span><span class="bar-label">Q${i + 1}</span></div>`).join('')}
      </div>
    </div>
    <div class="mini-chart-block">
      <div class="mini-chart-title">${t('m12')}</div>
      <div class="chart-row chart-row-m">
        ${monthly.map((md, i) => `<div class="bar-col" title="${t('lineMonthT', { n: i + 1, p: md.pct })}"><span class="bar-val">${md.pct}%</span><span class="bar" style="height:${Math.max(md.pct, 4)}%"></span><span class="bar-label">T${i + 1}</span></div>`).join('')}
      </div>
    </div>
  </div>`;
}

function yearOverviewReflectionHTML() {
  const refs = yearState.reflections.year;
  const vals = yearMonthlyData().map((md) => md.pct);
  return `<div class="card year-mid-card">
    <div class="year-mid-grid">
      <div class="reflection sub">
        <h4 class="ref-title">${t('refTitle')}</h4>
        ${YEAR_REFLECT_PROMPTS().map((p, i) => `<div class="ref-item">
          <div class="ref-question" contenteditable="true" spellcheck="false" data-singleline="1" data-reflect-q="yr-${i}" data-placeholder="${t('qEditPh')}" aria-label="${t('refQAria', { n: i + 1 })}">${esc(getRefQuestion('yr', i, p))}</div>
          <div class="ref-line" contenteditable="true" spellcheck="false" data-reflect="yr-${i}" data-placeholder="${t('writeHere')}" aria-label="${t('refYearAria', { n: i + 1 })}">${esc(refs[i])}</div>
        </div>`).join('')}
      </div>
      <div class="sub year-line-card">
        <h4 class="ref-title">${t('progress12')}</h4>
        ${lineChartSVG(vals)}
        <div class="line-labels">${Array.from({ length: 12 }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>
      </div>
    </div>
  </div>`;
}

function yearQuartersHTML() {
  const qs = quarterStats();
  return `<div class="year-quarters-card">
    <h3 class="card-title">${t('qOverview')}</h3>
    <div class="quarter-grid quarters-grid">
      ${qs.map((q, i) => {
        const pri = q.goals.filter((g) => g.kind === 'priority');
        const reg = q.goals.filter((g) => g.kind === 'regular');
        return `<div class="card quarter-card">
          <div class="q-head">Q${i + 1}<span class="q-pct">${q.pct}%</span></div>
          <div class="q-donut"><div class="donut-wrap">
            <div class="donut">${donutSVG(q.pct, 96, 12, '#666854')}</div>
            <div class="donut-center"><span>${q.pct}%</span></div>
          </div></div>
          <table class="stats-table">
            <tr><th>${t('statsDone')}</th><th>${t('statsInProg')}</th><th>${t('statsTotal')}</th></tr>
            <tr><td>${q.done}</td><td>${q.inProg}</td><td>${q.total}</td></tr>
          </table>
          <div class="q-lists">
            <div class="q-block">
              <div class="v-strip pink"><span>${t('priLbl')}</span></div>
              <ul class="goal-items q-items">
                ${pri.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">${checkboxHTML('pink', g.done, `data-action="qgoal" data-q="${i}" data-key="${esc(g.kind + '|' + g.text)}"`, window.TaskFlowUI.checkboxLabel('goal', g.text, `Q${i + 1} · ${PLAN_YEAR}`))}<span class="g-text">${esc(g.text)}</span></li>`).join('')}
              </ul>
            </div>
            <div class="q-block">
              <div class="v-strip blue"><span>${t('regLbl')}</span></div>
              <ul class="goal-items q-items">
                ${reg.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">${checkboxHTML('blue', g.done, `data-action="qgoal" data-q="${i}" data-key="${esc(g.kind + '|' + g.text)}"`, window.TaskFlowUI.checkboxLabel('goal', g.text, `Q${i + 1} · ${PLAN_YEAR}`))}<span class="g-text">${esc(g.text)}</span></li>`).join('')}
              </ul>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function yearMonthsHTML() {
  const monthly = yearMonthlyData();
  const realM = new Date().getMonth();
  return `<div class="card year-months-card">
    <h3 class="card-title">${t('mCardT')}</h3>
    <div class="month-progress-grid months-scroll">
      ${Array.from({ length: 12 }, (_, m) => {
        const p = monthly[m].pct;
        const goals = monthly[m].goals;
        const pri = goals.filter((g) => g.kind === 'priority');
        const reg = goals.filter((g) => g.kind === 'regular');
        const cls = [];
        if (m === realM) cls.push('current');
        if (viewedMonth !== null && m === viewedMonth) cls.push('viewing');
        return `<div class="ym-col${cls.length ? ' ' + cls.join(' ') : ''}">
          <div class="ym-head">
            <span class="ym-fruit" aria-hidden="true">${MONTH_FRUITS[m]}</span>
            <button type="button" class="ym-name" data-action="month" data-month="${m}" title="${t('openMonthT', { n: m + 1 })}">${t('monthT', { n: m + 1 })}${m === realM ? `<small>${t('nowTag')}</small>` : ''}</button>
            <span class="ym-pct" data-role="ym-pct" data-month="${m}">${p}%</span>
          </div>
          <div class="ym-bar-wrap"><div class="ym-bar" style="height:${Math.max(p, 4)}%"></div></div>
          <div class="ym-lists">
            <div class="ym-block">
              <div class="v-strip pink"><span>${t('priLbl')}</span></div>
              <ul class="goal-items ym-items">
                ${pri.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">${checkboxHTML('pink', g.done, `data-action="mgoal" data-month="${m}" data-id="${g.id}"`, window.TaskFlowUI.checkboxLabel('goal', g.text, `${monthLabel(m)} ${PLAN_YEAR}`))}<span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="ym-goal-text" data-month="${m}" data-id="${g.id}" data-placeholder="${t('writePh')}" aria-label="${t('mGoalAria', { n: m + 1 })}">${esc(g.text)}</span><button type="button" class="btn-del" data-action="delgoal" data-scope="ym" data-month="${m}" data-id="${g.id}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">✕</button></li>`).join('')}
                <li class="goal-item add-item"><button type="button" class="btn-add" data-action="addgoal" data-scope="ym" data-month="${m}" data-kind="priority" aria-label="${t('addPriGoalAria')}" title="${t('addPriGoalAria')}">＋</button></li>
              </ul>
            </div>
            <div class="ym-block">
              <div class="v-strip blue"><span>${t('regLbl')}</span></div>
              <ul class="goal-items ym-items">
                ${reg.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">${checkboxHTML('blue', g.done, `data-action="mgoal" data-month="${m}" data-id="${g.id}"`, window.TaskFlowUI.checkboxLabel('goal', g.text, `${monthLabel(m)} ${PLAN_YEAR}`))}<span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="ym-goal-text" data-month="${m}" data-id="${g.id}" data-placeholder="${t('writePh')}" aria-label="${t('mGoalAria', { n: m + 1 })}">${esc(g.text)}</span><button type="button" class="btn-del" data-action="delgoal" data-scope="ym" data-month="${m}" data-id="${g.id}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">✕</button></li>`).join('')}
                <li class="goal-item add-item"><button type="button" class="btn-add" data-action="addgoal" data-scope="ym" data-month="${m}" data-kind="regular" aria-label="${t('addRegGoalAria')}" title="${t('addRegGoalAria')}">＋</button></li>
              </ul>
            </div>
          </div>
          <div class="ym-note">
            <div class="note-banner">${t('noteBanner')}</div>
            <div class="note-area ym-note-area" contenteditable="true" spellcheck="false" data-ynote="${m}" data-placeholder="..." aria-label="${t('mNoteAria', { n: m + 1 })}">${esc(yearState.monthNotes[m]).replace(/\n/g, '<br>')}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function yearReflectionHTML(qn) {
  const refs = yearState.reflections['q' + qn];
  return `<h4 class="ref-title">${t('refQ', { n: qn })}</h4>
    ${QUARTER_REFLECT_PROMPTS().map((p, i) => `<div class="ref-item">
      <div class="ref-question" contenteditable="true" spellcheck="false" data-singleline="1" data-reflect-q="yq${qn}-${i}" data-placeholder="${t('qEditPh')}" aria-label="${t('refQAria', { n: i + 1 })}">${esc(getRefQuestion('yq' + qn, i, p))}</div>
      <div class="ref-line" contenteditable="true" spellcheck="false" data-reflect="yq${qn}-${i}" data-placeholder="${t('writeHere')}" aria-label="${t('refQuarterAria', { n: qn, m: i + 1 })}">${esc(refs[i])}</div>
    </div>`).join('')}`;
}

function yearReflectionsHTML() {
  return `<div class="card year-reflections-card">
    <h3 class="card-title">${t('refQuarters')}</h3>
    <div class="year-reflections">
      ${[1, 2, 3, 4].map((q) => `<div class="reflection sub">${yearReflectionHTML(q)}</div>`).join('')}
    </div>
  </div>`;
}

function yearHabitHeatmapHTML() {
  var habits = state.habits;
  if (!habits || !habits.length) return '';
  var matrix = window.PlanStats && window.PlanStats.habitYearMatrix ? window.PlanStats.habitYearMatrix(habits, PLAN_YEAR) : [];
  if (!matrix.length) return '';
  var rows = matrix.map(function (h) {
    var cells = '';
    for (var m = 0; m < 12; m++) {
      var pct = h.months[m].pct;
      var cls = 'yhm-cell';
      if (pct >= 100) cls += ' l4';
      else if (pct >= 75) cls += ' l3';
      else if (pct >= 50) cls += ' l2';
      else if (pct > 0) cls += ' l1';
      cells += '<span class="' + cls + '" title="' + t('hmDayFullT', { m: m + 1, d: 1, p: pct }) + '"></span>';
    }
    return '<div class="yhm-row"><div class="yhm-name">' + esc(h.name) + '</div><div class="yhm-cells">' + cells + '</div></div>';
  }).join('');
  return '<div class="card year-heat-card"><div class="card-title">' + t('hmTitle') + '</div>' + rows + '</div>';
}

/* ---------- Trang tuần ---------- */

let tagFilter = null;
let calendarTagFilters = [];

function weekTagFilterBar() {
  const allTags = new Set();
  state.weeks.forEach((w) => w.days.forEach((d) => d.tasks.forEach((tk) => (Array.isArray(tk.tags) ? tk.tags : []).forEach((tg) => allTags.add(tg)))));
  if (!allTags.size) return '';
  const chips = [`<button type="button" class="tag-chip${tagFilter === null ? ' active' : ''}" data-action="tagfilter" data-tag="">${t('tagAll')}</button>`]
    .concat(Array.from(allTags).map((tg) => `<button type="button" class="tag-chip${tagFilter === tg ? ' active' : ''}" data-action="tagfilter" data-tag="${esc(tg)}">#${esc(tg)}</button>`));
  return `<div class="tag-filter-bar"><span class="tag-filter-lbl">${t('tagFilter')}</span>${chips.join('')}${tagFilter ? `<button type="button" class="tag-chip tag-clear" data-action="tagfilter" data-tag="">✕ ${t('tagAll')}</button>` : ''}</div>`;
}

function renderWeek() {
  applyRecurrence();
  const el = document.getElementById('view-week');
  const w = state.weeks[state.currentWeek - 1];
  const st = weekStats(w);
  const ti = nowInfo();
  el.innerHTML = `
    <div class="week-page">
      <header class="week-page-header">
        <div class="week-page-heading">
          <p class="week-page-eyebrow">${t('weekWorkspaceEyebrow')}</p>
          <h1 class="week-page-title">${t('weekPageTitle', { n: w.n })}</h1>
          <p class="week-page-subtitle">${t('weekPageSubtitle')}</p>
          ${ti.inRange ? '' : `<p class="week-range-note">${t('weekRange', { a: fmtDate(ti.now), b: fmtDate(PLAN_START), c: fmtDate(PLAN_END) })}</p>`}
        </div>
        <div class="week-page-actions">
          <button type="button" class="btn-nav" data-action="prev" ${state.currentWeek === 1 ? 'disabled' : ''}>${t('prevWeek')}</button>
          <button type="button" class="btn-nav" data-action="next" ${state.currentWeek === NUM_WEEKS ? 'disabled' : ''}>${t('nextWeek')}</button>
          <button type="button" class="pop-btn share-btn week-report-btn" data-action="week-report" title="${t('weekReportTitle')}">${window.TaskFlowUI.icon('report')}<span>${t('weekReportTitle')}</span></button>
        </div>
      </header>
      ${weekTagFilterBar()}
      <section class="week-goals-summary" aria-label="${t('weekGoalsSummaryAria')}">
        <article class="card week-progress-card">
          <div class="week-progress-heading">
            <span>${t('weekProgressLabel')}</span>
            <strong data-role="w-badge">${st.pct}%</strong>
          </div>
          <div class="w-top-bar" data-role="w-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${st.pct}" aria-label="${t('weekProgressLabel')}">
            <div class="w-bar-fill" data-role="w-bar-fill" style="width:${st.pct}%"></div>
          </div>
          <table class="stats-table">
            <tr><th>${t('statsDone')}</th><th>${t('statsInProg')}</th><th>${t('statsTotal')}</th></tr>
            <tr data-role="w-stats"><td>${st.done}</td><td>${st.inProg}</td><td>${st.total}</td></tr>
          </table>
        </article>
        <section class="card week-goals-card">
          <h2 class="week-section-title">${t('weekGoalsHeading')}</h2>
          ${weeklyGoalsHTML(w)}
        </section>
      </section>
      <section class="week-support-grid" aria-label="${t('weekSupportAria')}">
        ${weekHabitsHTML(w)}
        <div class="card pomo-widget" data-role="pomo-widget">
          <div class="pomo-widget-head">
            <span class="pomo-widget-title">${t('pomoWidgetTitle')}</span>
            <span class="pomo-widget-mode" id="pomoWidgetMode"></span>
          </div>
          <div class="pomo-widget-time" id="pomoWidgetTime">25:00</div>
          <div class="pomo-widget-actions">
            <button type="button" class="pop-btn primary" data-action="pomo-start" id="pomoWidgetStart"></button>
            <button type="button" class="pop-btn" data-action="pomo-reset" data-i18n="pomoReset">↺</button>
            <button type="button" class="pop-btn" data-action="pomo-mode" data-mode="work">${t('pomoWork')}</button>
            <button type="button" class="pop-btn" data-action="pomo-mode" data-mode="break">${t('pomoBreak')}</button>
          </div>
          <div class="pomo-widget-stats" id="pomoWidgetStats"></div>
          <div class="pomo-tomato-wrap" id="pomoWidgetTomato"></div>
        </div>
        <div class="card reflection sub week-reflection-card">${reflectionHTML('w' + w.n, REFLECT_PROMPTS_WEEK())}</div>
      </section>
      <nav class="week-day-selector" aria-label="${t('weekDaySelectorAria')}">
        ${w.days.map((d, di) => `<button type="button" class="week-day-selector-button${isDayToday(d) ? ' today' : ''}" data-action="day-jump" data-day-target="week-day-${w.n}-${di}" aria-label="${t('weekJumpDay', { day: dayLabel(di) })}"><span>${dayLabel(di)}</span><small>${d.date}</small></button>`).join('')}
      </nav>
      <section class="week-days-section" aria-labelledby="week-days-title">
        <h2 class="week-section-title week-days-title" id="week-days-title">${t('weekDaysHeading')}</h2>
        <div class="week-day-list">
          ${w.days.map((d, di) => dayColumnHTML(w, di, isDayToday(d))).join('')}
        </div>
      </section>
    </div>`;
  renderPomo();
  renderPomoWidgetStats();
}

function weekHabitsHTML(w) {
  const dayIndexes = w.days.map((d) => {
    const parts = String(d.date).split('/').map(Number);
    return parts[1] === PLAN_MONTH + 1 ? parts[0] - 1 : null;
  }).filter(Number.isInteger);
  const habits = Array.isArray(state.habits) ? state.habits : [];
  const rows = habits.map((habit) => {
    const available = dayIndexes.filter((day) => !Array.isArray(habit.skipDays) || !habit.skipDays.includes(day));
    const done = available.filter((day) => Array.isArray(habit.days) && habit.days[day]).length;
    const total = available.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return `<div class="week-habit-row">
      <div class="week-habit-copy"><strong>${esc(habit.name)}</strong><span>${t('weekHabitsMeta', { done, total })}</span></div>
      <div class="week-habit-progress" role="progressbar" aria-label="${esc(habit.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      <b>${pct}%</b>
    </div>`;
  }).join('');
  return `<section class="card week-habits-card">
    <h2 class="week-section-title">${t('weekHabitsHeading')}</h2>
    <div class="week-habit-list">${rows || `<p class="week-empty-state">${t('weekHabitsEmpty')}</p>`}</div>
  </section>`;
}

function weeklyGoalsHTML(w) {
  const pri = w.goals.map((g, gi) => ({ g, gi })).filter((x) => x.g.kind === 'priority');
  const reg = w.goals.map((g, gi) => ({ g, gi })).filter((x) => x.g.kind === 'regular');
  return `<div class="legend-groups">
      <div class="legend-col">
        <div class="v-strip pink"><span>${t('priLbl')}</span></div>
        <div class="legend-goals">
          <span class="section-sub-title">${t('priGoalsSub')}</span>
          ${pri.map(({ g, gi }) => `<div class="legend-goal" draggable="true" data-drag="goal" data-scope="w" data-week="${w.n}" data-id="${gi}" title="${t('dragHint')}">
            ${checkboxHTML('pink', g.done, `data-action="wgoal" data-week="${w.n}" data-id="${gi}"`, window.TaskFlowUI.checkboxLabel('goal', g.text, t('weekN', { n: w.n })))}
            <span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="w-goal-text" data-week="${w.n}" data-id="${gi}" data-placeholder="${t('yGoalPh')}" aria-label="${t('wGoalAria', { n: gi + 1 })}">${esc(g.text)}</span>
            <button type="button" class="btn-del" data-action="delgoal" data-scope="w" data-week="${w.n}" data-id="${gi}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">✕</button>
          </div>`).join('')}
          <div class="legend-goal"><button type="button" class="btn-add" data-action="addgoal" data-scope="w" data-week="${w.n}" data-kind="priority" aria-label="${t('addPriGoalAria')}" title="${t('addPriGoalAria')}">＋</button></div>
        </div>
      </div>
      <div class="legend-col">
        <div class="v-strip blue"><span>${t('regLbl')}</span></div>
        <div class="legend-goals">
          <span class="section-sub-title">${t('regGoalsSub')}</span>
          ${reg.map(({ g, gi }) => `<div class="legend-goal" draggable="true" data-drag="goal" data-scope="w" data-week="${w.n}" data-id="${gi}" title="${t('dragHint')}">
            ${checkboxHTML('blue', g.done, `data-action="wgoal" data-week="${w.n}" data-id="${gi}"`, window.TaskFlowUI.checkboxLabel('goal', g.text, t('weekN', { n: w.n })))}
            <span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="w-goal-text" data-week="${w.n}" data-id="${gi}" data-placeholder="${t('yGoalPh')}" aria-label="${t('wGoalAria', { n: gi + 1 })}">${esc(g.text)}</span>
            <button type="button" class="btn-del" data-action="delgoal" data-scope="w" data-week="${w.n}" data-id="${gi}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">✕</button>
          </div>`).join('')}
          <div class="legend-goal"><button type="button" class="btn-add" data-action="addgoal" data-scope="w" data-week="${w.n}" data-kind="regular" aria-label="${t('addRegGoalAria')}" title="${t('addRegGoalAria')}">＋</button></div>
        </div>
      </div>
    </div>`;
}

function dayColumnHTML(w, di, isToday) {
  const d = w.days[di];
  const p = dayPct(d);
  const pri = d.tasks.map((t, ti) => ({ t, ti })).filter((x) => x.t.kind === 'priority');
  const reg = d.tasks.map((t, ti) => ({ t, ti })).filter((x) => x.t.kind === 'regular');
  return `<section class="week-day-panel day-col day-col-${di}${isToday ? ' today' : ''}" id="week-day-${w.n}-${di}" aria-labelledby="week-day-title-${w.n}-${di}" tabindex="-1">
    <header class="week-day-panel-header">
      <div>
        <p class="week-day-date">${d.date}/${d.yy}</p>
        <h2 class="week-day-name" id="week-day-title-${w.n}-${di}">${dayLabel(di)}</h2>
      </div>
      <div class="week-day-status">
        ${isToday ? `<span class="today-badge">${t('todayBadge')}</span>` : ''}
        <strong data-role="day-pct" data-day="${di}">${p}%</strong>
      </div>
    </header>
    <div class="week-day-progress" data-role="day-progress" data-day="${di}" role="progressbar" aria-label="${dayLabel(di)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><span data-role="day-progress-fill" style="width:${p}%"></span></div>
    ${d.sticky ? `<div class="sticky-note-box"><span>${esc(d.sticky)}</span></div>` : ''}
    <div class="mood-row" role="group" aria-label="${t('moodTitle')}" data-i18n-aria="moodTitle">
      ${MOODS.map((m, i) => `<button type="button" class="mood-btn${moodMap[moodDateKey(d.date)] === i ? ' on' : ''}" data-action="mood" data-day-key="${moodDateKey(d.date)}" data-mood="${i}" title="${t(m.labelKey)}" aria-label="${t(m.labelKey)}">${m.icon}</button>`).join('')}
    </div>
    <div class="day-tasks">
      <div class="task-group">
        <div class="v-strip pink"><span>${t('priLbl')}</span></div>
        <div class="task-rows" data-drop="taskzone" data-week="${w.n}" data-day="${di}" data-kind="priority">
          <span class="task-sub-head">${t('taskPriSub')}</span>
          ${pri.map(({ t, ti }, i) => taskRowHTML(w.n, di, ti, 'pink', t, i)).join('')}
          <button type="button" class="btn-add" data-action="addtask" data-week="${w.n}" data-day="${di}" data-kind="priority" aria-label="${t('addPriTaskAria')}" title="${t('addPriTaskAria')}">＋</button>
        </div>
      </div>
      <div class="task-group">
        <div class="v-strip blue"><span>${t('regLbl')}</span></div>
        <div class="task-rows" data-drop="taskzone" data-week="${w.n}" data-day="${di}" data-kind="regular">
          <span class="task-sub-head">${t('taskRegSub')}</span>
          ${reg.map(({ t, ti }, i) => taskRowHTML(w.n, di, ti, 'blue', t, i)).join('')}
          <button type="button" class="btn-add" data-action="addtask" data-week="${w.n}" data-day="${di}" data-kind="regular" aria-label="${t('addRegTaskAria')}" title="${t('addRegTaskAria')}">＋</button>
        </div>
      </div>
    </div>
    <div class="day-note">
      <div class="note-banner">${t('noteBanner')}</div>
      <div class="note-area" contenteditable="true" spellcheck="false" data-note="${w.n}-${di}" data-placeholder="..." aria-label="${t('noteAria', { name: dayLabel(di) })}">${esc(d.note).replace(/\n/g, '<br>')}</div>
    </div>
  </section>`;
}

function taskRowHTML(wn, di, ti, mod, task, pos) {
  const tags = Array.isArray(task.tags) ? task.tags : [];
  return `<div class="task-row${tagFilter && !tags.includes(tagFilter) ? ' filtered-out' : ''}" draggable="true" data-drag="task" data-week="${wn}" data-day="${di}" data-task="${ti}" data-kind="${task.kind}" data-pos="${pos ?? 0}" title="${t('dragHint')}" aria-label="${t('dragHint')}">
    ${checkboxHTML(mod, task.done, `data-action="task" data-week="${wn}" data-day="${di}" data-task="${ti}"`, window.TaskFlowUI.checkboxLabel('task', task.text, `${t('weekN', { n: wn })}, ${dayLabel(di)}`))}
    <span class="task-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="task-text" data-week="${wn}" data-day="${di}" data-task="${ti}" data-placeholder="${t('taskPh')}" aria-label="${t('taskAria', { n: ti + 1 })}">${esc(task.text ?? '')}</span>
    ${tags.length ? `<span class="task-tags">${tags.map((tg) => `<span class="tag-chip" data-tag="${esc(tg)}">#${esc(tg)}</span>`).join('')}</span>` : ''}
    <span class="dotted-line" aria-hidden="true"></span>
    <button type="button" class="btn-tag" data-action="remind-task" data-week="${wn}" data-day="${di}" data-task="${ti}" title="${t('remindTaskAria')}" aria-label="${t('remindTaskAria')}">🔔${task.remind && task.remind.enabled ? '<sup class="remind-dot"></sup>' : ''}</button>
    <button type="button" class="btn-tag" data-action="tag-edit" data-week="${wn}" data-day="${di}" data-task="${ti}" title="${t('tagAdd')}" aria-label="${t('tagAria')}">🏷️</button>
    <button type="button" class="btn-tag" data-action="repeat-edit" data-week="${wn}" data-day="${di}" data-task="${ti}" title="${t('repeatTitle')}" aria-label="${t('repeatTitle')}">🔁${task.repeat && task.repeat.freq ? '<sup class="remind-dot"></sup>' : ''}</button>
    <button type="button" class="btn-del" data-action="deltask" data-week="${wn}" data-day="${di}" data-task="${ti}" aria-label="${t('delTaskAria', { n: ti + 1 })}" title="${t('delTaskAria', { n: ti + 1 })}">✕</button>
  </div>`;
}

/* ============================ Phase 2: Tìm kiếm xuyên tháng ============================ */

function openSearchModal() {
  const m = document.getElementById('searchModal');
  if (!m) return;
  const inp = document.getElementById('searchInput');
  if (inp) inp.value = '';
  renderSearchResults('');
  TaskFlowUI.openDialog('searchModal');
}

function closeSearchModal() {
  TaskFlowUI.closeDialog('searchModal');
}

// Tìm kiếm xuyên tháng: đọc chéo 12 tháng qua monthStateRaw() + yearState (tháng đang xem dùng state trực tiếp).
function runSearch(q) {
  q = (q || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const hits = [];
  const y = PLAN_YEAR;
  const now = new Date();
  for (let m = 0; m < 12; m++) {
    const s = (y === now.getFullYear() && m === now.getMonth()) ? state : monthStateRaw(y, m);
    if (!s) continue;
    const push = (type, text, week, day) => {
      if (text && String(text).toLowerCase().includes(q)) hits.push({ y, m, type, text: String(text), week, day });
    };
    (s.monthlyGoals || []).forEach((g) => push('goal', g.text));
    (s.habits || []).forEach((h) => push('habit', h.name));
    (s.weeks || []).forEach((w) => {
      (w.days || []).forEach((d, di) => {
        (d.tasks || []).forEach((tk) => push('task', tk.text, w.n, di));
        push('note', d.note, w.n, di);
        push('note', d.sticky, w.n, di);
      });
    });
    if (s.reflections) {
      (s.reflections.overview || []).forEach((r) => push('reflect', r));
      (s.reflections.weeks || []).forEach((w) => w.forEach((r) => push('reflect', r)));
    }
  }
  (yearState.goals || []).forEach((g) => push('ygoal', g.text));
  (yearState.monthNotes || []).forEach((n, mi) => push('ynote', n, null, mi));
  return hits;
}

function renderSearchResults(q) {
  const box = document.getElementById('searchResults');
  if (!box) return;
  q = (q || '').trim();
  if (q.length < 2) {
    box.innerHTML = `<p class="search-hint">${t('searchEmpty')}</p>`;
    return;
  }
  const hits = runSearch(q);
  if (!hits.length) {
    box.innerHTML = `<p class="search-hint">${t('searchNoResults')}</p>`;
    return;
  }
  const typeIcon = { goal: '🎯', habit: '🐥', task: '✅', note: '📝', reflect: '💭', ygoal: '🎯', ynote: '📝' };
  const typeLbl = { goal: 'goal', habit: 'habit', task: 'task', note: 'note', reflect: 'reflect', ygoal: 'goal', ynote: 'note' };
  // Nhóm theo tháng
  const groups = new Map();
  hits.forEach((h) => {
    const key = h.m >= 0 ? 'm' + h.m : 'y';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  });
  const order = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'y'];
  const months = Array.from(groups.keys()).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  box.innerHTML = months.map((key) => {
    const items = groups.get(key);
    const label = key === 'y' ? t('searchYear', { y: PLAN_YEAR }) : t('searchMonth', { n: (+key.slice(1)) + 1 });
    return `<div class="search-group">
      <div class="search-group-h">${label} <small>${items.length}</small></div>
      ${items.map((h) => `<button type="button" class="search-hit" data-action="search-go" data-y="${h.y}" data-m="${h.m}" data-week="${h.week ?? ''}" data-day="${h.day ?? ''}">
        <span class="search-hit-icon" aria-hidden="true">${typeIcon[h.type] || '📌'}</span>
        <span class="search-hit-body"><span class="search-hit-type">${t('search' + typeLbl[h.type][0].toUpperCase() + typeLbl[h.type].slice(1))}</span>
        <span class="search-hit-text">${esc(h.text)}</span></span>
      </button>`).join('')}
    </div>`;
  }).join('');
}

function goSearchResult(btn) {
  const y = +btn.dataset.y, m = +btn.dataset.m;
  closeSearchModal();
  if (m < 0) { openYear(y - PLAN_YEAR); setView('year'); return; }
  openMonth(m);
  const wk = btn.dataset.week;
  if (wk) setView('week', +wk);
  else setView('overview');
}

/* ============================ Phase 2: View Lịch ============================ */

function calendarDayEntries() {
  const now = new Date();
  return state.weeks.flatMap((week) => week.days.map((day, dayIndex) => {
    const date = new Date(PLAN_START.getTime() + ((week.n - 1) * 7 + dayIndex) * 86400000);
    return {
      week,
      day,
      dayIndex,
      date,
      dayNumber: date.getDate(),
      currentMonth: date.getMonth() === PLAN_MONTH && date.getFullYear() === PLAN_YEAR,
      today: date.toDateString() === now.toDateString(),
      tasks: day.tasks.map((task, taskIndex) => ({ task, taskIndex }))
        .sort((a, b) => (a.task.kind === b.task.kind ? 0 : a.task.kind === 'priority' ? -1 : 1)),
    };
  }));
}

function localISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calendarTaskMatches(task) {
  if (!calendarTagFilters.length) return true;
  const tags = Array.isArray(task.tags) ? task.tags : [];
  return calendarTagFilters.some((tag) => tags.includes(tag));
}

function calendarVisibleTasks(entry) {
  return entry.tasks.filter(({ task }) => String(task.text || '').trim() && calendarTaskMatches(task));
}

function calendarDayPct(day) {
  const tasks = day.tasks.filter((task) => String(task.text || '').trim());
  return tasks.length ? Math.round((tasks.filter((task) => task.done).length / tasks.length) * 100) : 0;
}

function calendarTagFilterBar() {
  const tags = new Set();
  state.weeks.forEach((week) => week.days.forEach((day) => day.tasks.forEach((task) => {
    (Array.isArray(task.tags) ? task.tags : []).forEach((tag) => tags.add(tag));
  })));
  if (!tags.size) return '';
  const all = `<button type="button" class="tag-chip${calendarTagFilters.length ? '' : ' active'}" data-action="calendar-tagfilter" data-tag="" aria-pressed="${calendarTagFilters.length ? 'false' : 'true'}">${t('tagAll')}</button>`;
  const buttons = Array.from(tags).map((tag) => {
    const active = calendarTagFilters.includes(tag);
    return `<button type="button" class="tag-chip${active ? ' active' : ''}" data-action="calendar-tagfilter" data-tag="${esc(tag)}" aria-pressed="${active}">#${esc(tag)}</button>`;
  }).join('');
  return `<div class="calendar-filter-bar" role="group" aria-label="${t('calendarFilterAria')}"><span>${t('tagFilter')}</span>${all}${buttons}</div>`;
}

function calendarTasksHTML(entry, extraClass = '') {
  const tasks = calendarVisibleTasks(entry);
  if (!tasks.length) return `<span class="cal-empty">${t('calEmpty')}</span>`;
  const context = entry.date.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  return tasks.map(({ task, taskIndex }) => `<div class="cal-task${extraClass ? ' ' + extraClass : ''}${task.done ? ' done' : ''}" data-week="${entry.week.n}" data-day="${entry.dayIndex}" data-task="${taskIndex}">
    ${checkboxHTML(task.kind === 'priority' ? 'pink' : 'blue', task.done, `data-action="task" data-week="${entry.week.n}" data-day="${entry.dayIndex}" data-task="${taskIndex}"`, window.TaskFlowUI.checkboxLabel('task', task.text, context))}
    <span class="cal-task-text">${esc(task.text || '')}</span>
    ${(Array.isArray(task.tags) && task.tags.length) ? `<span class="task-tags">${task.tags.map((tag) => `<span class="tag-chip">#${esc(tag)}</span>`).join('')}</span>` : ''}
  </div>`).join('');
}

function renderCalendar() {
  const el = document.getElementById('view-calendar');
  const entries = calendarDayEntries();
  const dowLbl = t('dayNames');
  const agendaEntries = entries.filter((entry) => entry.currentMonth && calendarVisibleTasks(entry).length);
  el.innerHTML = `<div class="calendar-page">
    <header class="calendar-page-header">
      <div>
        <p class="calendar-page-eyebrow">${t('calendarWorkspaceEyebrow')}</p>
        <h1 class="calendar-page-title">${t('calendarPageTitle', { m: monthLabel(PLAN_MONTH), y: PLAN_YEAR })}</h1>
        <p class="calendar-page-subtitle">${t('calendarPageSubtitle')}</p>
      </div>
      <div class="cal-legend"><span class="dot on"></span> ${t('legendDone')} <span class="dot off"></span> ${t('legendNotDone')}</div>
    </header>
    ${calendarTagFilterBar()}
    <section class="calendar-grid-desktop" aria-label="${t('viewCalendar')}">
      ${dowLbl.map((day) => `<div class="cal-dow">${day}</div>`).join('')}
      ${entries.map((entry) => `<article class="cal-cell${entry.today ? ' today' : ''}${entry.currentMonth ? '' : ' outside'}" data-week="${entry.week.n}" data-day="${entry.dayIndex}">
        <div class="cal-cell-head"><span class="cal-date">${entry.dayNumber}</span><span class="cal-pct" data-role="cal-pct" data-week="${entry.week.n}" data-day="${entry.dayIndex}">${calendarDayPct(entry.day)}%</span></div>
        <div class="cal-tasks">${calendarTasksHTML(entry)}</div>
      </article>`).join('')}
    </section>
    <section class="calendar-agenda-mobile" aria-labelledby="calendar-agenda-title">
      <h2 id="calendar-agenda-title">${t('calendarAgendaTitle')}</h2>
      ${agendaEntries.length ? agendaEntries.map((entry) => `<article class="calendar-agenda-day${entry.today ? ' today' : ''}">
        <header><time datetime="${localISODate(entry.date)}">${entry.date.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</time><span>${t('calendarTaskCount', { n: calendarVisibleTasks(entry).length })}</span></header>
        <div class="calendar-agenda-tasks">${calendarTasksHTML(entry, 'calendar-agenda-task')}</div>
      </article>`).join('') : `<p class="calendar-agenda-empty">${t('calendarAgendaEmpty')}</p>`}
    </section>
  </div>`;
}

/* ============================ Phase 2: Template tháng ============================ */

function openTemplateModal() {
  const m = document.getElementById('templateModal');
  if (!m) return;
  const src = document.getElementById('templateSrc');
  const dst = document.getElementById('templateDst');
  const opts = MONTH_NAMES.map((n, i) => `<option value="${i}" ${i === PLAN_MONTH ? 'selected' : ''}>${t('monthOption', { m: monthLabel(i), n: i + 1, y: PLAN_YEAR })}</option>`).join('');
  if (src) src.innerHTML = opts;
  if (dst) {
    // Mặc định đích = tháng sau (tránh alert "chọn tháng khác" ngay lần mở đầu)
    const def = (PLAN_MONTH + 1) % 12;
    const dstOpts = MONTH_NAMES.map((n, i) => `<option value="${i}" ${i === def ? 'selected' : ''}>${t('monthOption', { m: monthLabel(i), n: i + 1, y: PLAN_YEAR })}</option>`).join('');
    dst.innerHTML = dstOpts;
  }
  TaskFlowUI.openDialog('templateModal');
}

function closeTemplateModal() {
  TaskFlowUI.closeDialog('templateModal');
}

// Sao chép CẤU TRÚC tháng (goals + habits + tuần) sang tháng đích, BỎ ô tick ✓.
// QUAN TRỌNG: dựng lại weeks theo lịch THÁNG ĐÍCH (đúng NUM_WEEKS + đúng ngày/tháng),
// chỉ copy goals/tasks theo vị trí tuần — nếu không loadState() sẽ loại state vì
// weeks.length !== NUM_WEEKS và ngày hiển thị sai tháng.
function copyMonthTemplate() {
  const srcM = +document.getElementById('templateSrc').value;
  const dstM = +document.getElementById('templateDst').value;
  if (srcM === dstM) { TaskFlowUI.toast(t('templateSame'), 'error'); return; }
  const src = loadMonthStateOrCreate(PLAN_YEAR, srcM);
  if (!src || (!src.monthlyGoals.length && !src.habits.length)) { TaskFlowUI.toast(t('templateNoData'), 'error'); return; }
  const prev = capturePlan();
  let dst = null;
  try {
    initPlan(new Date(PLAN_YEAR, dstM, 1)); // chuyển sang lịch tháng đích để lấy NUM_WEEKS/PLAN_START đúng
    const nd = NUM_DAYS;
    dst = {
      view: 'overview', currentWeek: 1, goalTab: 'priority', monthKey: 'planner-' + PLAN_YEAR + '-' + (dstM + 1),
      monthlyGoals: src.monthlyGoals.map((g) => ({ id: 'g' + Date.now() + Math.floor(Math.random() * 999), text: g.text, kind: g.kind, done: false })),
      habits: src.habits.map((h) => ({ id: 'h' + Date.now() + Math.floor(Math.random() * 999), name: h.name, target: h.target || 100, days: Array(nd).fill(false) })),
      weeks: Array.from({ length: NUM_WEEKS }, (_, wi) => {
        const sw = src.weeks[wi] || { goals: [], days: [] };
        return {
          n: wi + 1,
          goals: (sw.goals || []).map((g) => ({ text: g.text, kind: g.kind, done: false })),
          days: Array.from({ length: 7 }, (_, di) => {
            const dt = new Date(PLAN_START.getTime() + (wi * 7 + di) * 86400000);
            const sd = (sw.days && sw.days[di]) || {};
            return {
              tasks: (sd.tasks || []).map((tk) => ({ kind: tk.kind, done: false, text: tk.text || '', tags: Array.isArray(tk.tags) ? tk.tags.slice() : [] })),
              date: `${dt.getDate()}/${dt.getMonth() + 1}`,
              yy: dt.getFullYear() % 100,
              sticky: sd.sticky || null,
              note: '',
            };
          }),
        };
      }),
      reflections: { overview: ['', '', '', ''], weeks: Array.from({ length: NUM_WEEKS }, () => ['', '', '', '']) },
    };
  } finally {
    restorePlan(prev);
  }
  saveMonthState(PLAN_YEAR, dstM, dst);
  invalidateYearCache();
  trackEvent('copy_month_template', { src: srcM, dst: dstM });
  TaskFlowUI.toast(t('templateDone', { src: monthLabel(srcM), dst: monthLabel(dstM) }), 'success');
  closeTemplateModal();
}

/* ============================ Phase 2: Pomodoro ============================ */

const POMO_WORK = 25 * 60, POMO_BREAK = 5 * 60, POMO_LONG_BREAK = 25 * 60;
let pomo = { mode: 'work', left: POMO_WORK, running: false, timer: null, sessionCount: 0, todayCount: 0 };

function renderPomo() {
  const mm = String(Math.floor(pomo.left / 60)).padStart(2, '0');
  const ss = String(pomo.left % 60).padStart(2, '0');
  const tEl = document.getElementById('pomoTime');
  if (tEl) tEl.textContent = mm + ':' + ss;
  const mEl = document.getElementById('pomoMode');
  if (mEl) {
    const modeLabel = pomo.mode === 'work' ? t('pomoWork') : (pomo.mode === 'longBreak' ? t('pomoLongBreak') : t('pomoBreak'));
    const minLabel = pomo.mode === 'longBreak' ? 25 : (pomo.mode === 'work' ? 25 : 5);
    mEl.textContent = modeLabel + ' · ' + t('pomoMin', { n: minLabel });
  }
  const bEl = document.getElementById('pomoStart');
  if (bEl) bEl.textContent = pomo.running ? t('pomoPause') : t('pomoStart');
  // Widget tuần view (nếu có)
  const wT = document.getElementById('pomoWidgetTime');
  if (wT) wT.textContent = mm + ':' + ss;
  const wM = document.getElementById('pomoWidgetMode');
  if (wM) {
    const modeLabel = pomo.mode === 'work' ? t('pomoWork') : (pomo.mode === 'longBreak' ? t('pomoLongBreak') : t('pomoBreak'));
    const minLabel = pomo.mode === 'longBreak' ? 25 : (pomo.mode === 'work' ? 25 : 5);
    wM.textContent = modeLabel + ' · ' + t('pomoMin', { n: minLabel });
  }
  const wB = document.getElementById('pomoWidgetStart');
  if (wB) wB.textContent = pomo.running ? t('pomoPause') : t('pomoStart');
}

function pomoStart() {
  if (pomo.running) { clearInterval(pomo.timer); pomo.running = false; renderPomo(); return; }
  pomo.running = true;
  trackEvent('pomodoro_start', { mode: pomo.mode });
  pomo.timer = setInterval(() => {
    pomo.left--;
    if (pomo.left <= 0) {
      clearInterval(pomo.timer);
      pomo.running = false;
      const finished = pomo.mode;
      trackEvent('pomodoro_complete', { mode: finished });
      if (finished === 'work') {
        pomoAddSession(POMO_WORK);
        // Tăng session count và kiểm tra 4 lần → long break
        const log = loadPomoLog();
        const todayKey = pomoDateKey(new Date());
        const todaySessions = log[todayKey] ? log[todayKey].count : 0;
        if (todaySessions > 0 && todaySessions % 4 === 0) {
          pomo.mode = 'longBreak'; pomo.left = POMO_LONG_BREAK;
          TaskFlowUI.toast(t('pomoWorkDoneTxt') + ' · ' + t('pomoLongBreak'), 'success');
        } else {
          TaskFlowUI.toast(t('pomoDoneWork'), 'success');
          pomo.mode = 'break'; pomo.left = POMO_BREAK;
        }
      } else if (finished === 'longBreak') {
        TaskFlowUI.toast(t('pomoLongBreakDone'), 'success');
        pomo.mode = 'work'; pomo.left = POMO_WORK;
      } else {
        TaskFlowUI.toast(t('pomoDoneBreak'), 'success');
        pomo.mode = 'work'; pomo.left = POMO_WORK;
      }
      renderPomoWidgetStats();
    }
    renderPomo();
  }, 1000);
  renderPomo();
}

function pomoReset() {
  clearInterval(pomo.timer);
  pomo.running = false;
  pomo.left = pomo.mode === 'work' ? POMO_WORK : (pomo.mode === 'longBreak' ? POMO_LONG_BREAK : POMO_BREAK);
  renderPomo();
}

function pomoSetMode(mode) {
  clearInterval(pomo.timer);
  pomo.running = false;
  pomo.mode = mode === 'break' ? 'break' : mode === 'longBreak' ? 'longBreak' : 'work';
  pomo.left = pomo.mode === 'work' ? POMO_WORK : (pomo.mode === 'longBreak' ? POMO_LONG_BREAK : POMO_BREAK);
  renderPomo();
  trackEvent('pomodoro_mode', { mode: pomo.mode });
}

function togglePomoPanel() {
  const p = document.getElementById('pomoPanel');
  if (!p) return;
  p.hidden = !p.hidden;
  if (!p.hidden) {
    const chat = document.getElementById('chatPop');
    if (chat) chat.hidden = true;
    renderPomo();
  }
}

/* ---------- Pomodoro widget trong tuần view (Phase 4) ---------- */

const POMO_LOG_KEY = 'planner-pomo-log';

function loadPomoLog() {
  try { return JSON.parse(localStorage.getItem(POMO_LOG_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function savePomoLog(log) {
  try { localStorage.setItem(POMO_LOG_KEY, JSON.stringify(log)); } catch (e) { /* ẩn */ }
  if (window.Sync) window.Sync.push(POMO_LOG_KEY);
}
function pomoDateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function pomoAddSession(secs) {
  const log = loadPomoLog();
  const k = pomoDateKey(new Date());
  if (!log[k]) log[k] = { count: 0, secs: 0 };
  log[k].count++;
  log[k].secs += secs;
  savePomoLog(log);
}
function pomoWeekSecs() {
  // Cộng 7 ngày của tuần hiện tại (PLAN_START + offset)
  const log = loadPomoLog();
  let secs = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(PLAN_START.getTime() + ((state.currentWeek - 1) * 7 + i) * 86400000);
    const e = log[pomoDateKey(d)];
    if (e) secs += e.secs;
  }
  return secs;
}
function renderPomoWidgetStats() {
  const el = document.getElementById('pomoWidgetStats');
  if (!el) return;
  const log = loadPomoLog();
  const today = log[pomoDateKey(new Date())] || { count: 0, secs: 0 };
  const todayTxt = t('pomoToday') + ': ' + today.count + ' · ' + t('pomoMinShort', { n: Math.round(today.secs / 60) });
  const weekTxt = t('pomoWeek') + ': ' + t('pomoMinShort', { n: Math.round(pomoWeekSecs() / 60) });
  el.textContent = t('pomoWidgetStats', { today: todayTxt, week: weekTxt });
}

function renderPomoTomatoCounter() {
  // Vẽ icon cà chua bên dưới panel pomo và widget
  const log = loadPomoLog();
  const todayKey = pomoDateKey(new Date());
  const todaySessions = log[todayKey] ? log[todayKey].count : 0;
  const sessionCount = todaySessions || 0;
  const target = 4;
  const done = sessionCount % target;
  const total = target;
  let html = '<div class="pomo-tomato-row" title="' + t('pomoSessionCount', { n: sessionCount }) + '">';
  for (var i = 0; i < total; i++) {
    html += '<span class="pomo-tomato-icon" data-state="' + (i < done ? 'done' : 'pending') + '">' + (i < done ? '🍅' : '🍅') + '</span>';
  }
  html += '</div>';
  // Cập nhật cả panel widget và overlay
  var panelEl = document.getElementById('pomoTomatoCounter');
  if (panelEl) panelEl.innerHTML = html;
  var widgetEl = document.getElementById('pomoWidgetTomato');
  if (widgetEl) widgetEl.innerHTML = html;
}

// Ghi đè renderPomoWidgetStats để cập nhật tomato counter
const _origRenderPomoWidgetStats = renderPomoWidgetStats;
renderPomoWidgetStats = function() {
  _origRenderPomoWidgetStats();
  renderPomoTomatoCounter();
};

/* ============================ Chatbot trợ lý học tập ============================ */

const CHAT_RESPONSES = {
  'study-plan': '📚 <b>Kế hoạch học tập hiệu quả:</b><br><br>1. <b>Xác định mục tiêu:</b> Bạn muốn đạt được gì? (VD: thi đỗ, học ngoại ngữ, kỹ năng mới)<br><br>2. <b>Chia nhỏ mục tiêu:</b> Chia thành các mục tiêu theo tháng/tuần trong app.<br><br>3. <b>Phân bổ thời gian:</b> Dùng Pomodoro 25 phút tập trung, 5 phút nghỉ — sau 4 lần nghỉ dài 25 phút.<br><br>4. <b>Theo dõi thói quen:</b> Tạo habit học tập trong app để theo dõi % hoàn thành và streak 🔥<br><br>5. <b>Phản ánh:</b> Cuối tuần viết reflection để xem lại tiến độ.<br><br>💡 Gợi ý: Dùng tính năng Mục tiêu năm để đặt mục tiêu lớn, Mục tiêu tháng để chia nhỏ, và Task tuần để hành động cụ thể!',
  'goal-tips': '🎯 <b>Mẹo đạt mục tiêu:</b><br><br>1. <b>SMART goals:</b> Cụ thể, đo lường được, khả thi, liên quan, có thời hạn.<br><br>2. <b>Chia nhỏ:</b> Mục tiêu năm → tháng → tuần. App có sẵn cấu trúc này!<br><br>3. <b>Theo dõi:</b> Tick ✓ mỗi mục tiêu khi hoàn thành. App tự tính % tiến độ.<br><br>4. <b>Streak 🔥:</b> Duy trì mỗi ngày — streak càng dài càng có động lực!<br><br>5. <b>Phản ánh:</b> Viết reflection mỗi tuần/tháng để rút kinh nghiệm.<br><br>💡 Bạn có thể dùng Pull Goals từ Dashboard để tổng hợp mục tiêu từ 12 tháng!',
  'habit-tips': '🔥 <b>Mẹo xây thói quen mới:</b><br><br>1. <b>Bắt đầu nhỏ:</b> Chỉ 1 thói quen, cực kỳ dễ (VD: đọc 1 trang sách).<br><br>2. <b>Gắn với thói quen cũ:</b> "Sau khi uống cà phê sáng, tôi sẽ đọc 1 trang sách."<br><br>3. <b>Theo dõi liên tục:</b> Tick ✓ mỗi ngày trong app, duy trì streak 🔥<br><br>4. <b>Đặt mục tiêu %:</b> Mỗi habit có target %, app tự tính. Đạt 100% là cíuu!<br><br>5. <b>Heatmap:</b> Xem heatmap tháng và năm để thấy sự tiến bộ.<br><br>💡 App có sẵn 10 thói quen mẫu — bạn có thể xoá/sửa và thêm thói quen của riêng mình!',
  'pomodoro-tips': '🍅 <b>Cách dùng Pomodoro hiệu quả:</b><br><br>1. <b>Chọn task:</b> Chọn 1 task cụ thể để tập trung.<br><br>2. <b>Bắt đầu timer:</b> Ấn nút 🍅, tập trung 25 phút.<br><br>3. <b>Nghỉ ngắn:</b> Hết 25 phút → nghỉ 5 phút. Đứng dậy, vươn vai.<br><br>4. <b>Lặp lại:</b> Sau 4 lần tập trung → nghỉ dài 25 phút 🧘<br><br>5. <b>Theo dõi:</b> App ghi lại số lần tập trung hôm nay và tuần này.<br><br>💡 Mẹo: Dùng Pomodoro widget ngay trong view tuần để tiện theo dõi!',
};

function doChatSend() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  // Thêm tin nhắn user
  const userDiv = document.createElement('div');
  userDiv.className = 'chat-msg user';
  userDiv.innerHTML = esc(text);
  msgs.appendChild(userDiv);
  // Tự động trả lời
  setTimeout(() => {
    const botDiv = document.createElement('div');
    botDiv.className = 'chat-msg bot';
    botDiv.innerHTML = chatBotReply(text);
    msgs.appendChild(botDiv);
    msgs.scrollTop = msgs.scrollHeight;
  }, 500);
  msgs.scrollTop = msgs.scrollHeight;
}

function doChatSuggest(topic) {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  const botDiv = document.createElement('div');
  botDiv.className = 'chat-msg bot';
  botDiv.innerHTML = CHAT_RESPONSES[topic] || 'Cảm ơn bạn! Tôi sẽ giúp bạn học tập tốt hơn.';
  msgs.appendChild(botDiv);
  msgs.scrollTop = msgs.scrollHeight;
}

function chatBotReply(text) {
  const lower = text.toLowerCase();
  // Kiểm tra từ khóa
  if (lower.includes('kế hoạch') || lower.includes('học tập') || lower.includes('study') || lower.includes('plan'))
    return CHAT_RESPONSES['study-plan'];
  if (lower.includes('mục tiêu') || lower.includes('goal') || lower.includes('target'))
    return CHAT_RESPONSES['goal-tips'];
  if (lower.includes('thói quen') || lower.includes('habit') || lower.includes('streak') || lower.includes('xây'))
    return CHAT_RESPONSES['habit-tips'];
  if (lower.includes('pomodoro') || lower.includes('tập trung') || lower.includes('focus') || lower.includes('timer') || lower.includes('cà chua'))
    return CHAT_RESPONSES['pomodoro-tips'];
  // Trả lời mặc định
  return 'Cảm ơn câu hỏi của bạn! 🐥<br><br>Bạn có thể tham khảo các chủ đề:<br>• 📚 <b>Lên kế hoạch học tập</b> — bấm nút gợi ý bên trên<br>• 🎯 <b>Mẹo đạt mục tiêu</b><br>• 🔥 <b>Xây thói quen mới</b><br>• 🍅 <b>Cách dùng Pomodoro</b><br><br>Hoặc gõ trực tiếp câu hỏi của bạn!';
}

// Enter key trong chat input gửi tin nhắn
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'chatInput') {
    e.preventDefault();
    doChatSend();
  }
});

/* ============================ Phase 2: Dashboard (year view) ============================ */

// Thói quen có tổng số ngày tích nhiều nhất trong 12 tháng.
function bestHabitAcrossYear() {
  let best = null, bestN = 0;
  const now = new Date();
  for (let m = 0; m < 12; m++) {
    const s = monthStateRaw(PLAN_YEAR, m);
    if (!s) continue;
    (s.habits || []).forEach((h) => {
      const n = (Array.isArray(h.days) ? h.days.filter(Boolean).length : 0);
      if (n > bestN) { bestN = n; best = h.name; }
    });
  }
  if (bestN === 0 && state.habits.length) { best = state.habits[0].name; bestN = 0; }
  return { name: best, days: bestN };
}

// Ngày có nhiều task HOÀN THÀNH nhất trong 12 tháng.
function bestProductiveDay() {
  let best = null, bestN = -1;
  for (let m = 0; m < 12; m++) {
    const s = monthStateRaw(PLAN_YEAR, m);
    if (!s) continue;
    (s.weeks || []).forEach((w) => {
      (w.days || []).forEach((d) => {
        const n = (d.tasks || []).filter((tk) => tk.done).length;
        if (n > bestN) { bestN = n; best = { month: m, date: d.date }; }
      });
    });
  }
  if (bestN <= 0) return null;
  return { ...best, label: (best.month + 1) + '/' + best.date, n: bestN };
}

function yearDashboardHTML() {
  const bh = bestHabitAcrossYear();
  const pd = bestProductiveDay();
  const monthly = yearMonthlyData();
  const quarters = [0, 1, 2, 3].map((q) => Math.round((monthly[q * 3].pct + monthly[q * 3 + 1].pct + monthly[q * 3 + 2].pct) / 3));
  const gs = yearGoalStats();
  const bestQ = quarters.indexOf(Math.max(...quarters));
  return `<div class="card year-dash-card">
    <div class="dash-head"><h3 class="card-title">${t('dashTitle')}</h3><span class="bear-big" aria-hidden="true">🐻</span></div>
    <div class="dash-grid">
      <div class="dash-cell"><span class="dash-emoji" aria-hidden="true">🔥</span>
        <b>${bh.name ? esc(bh.name) : '—'}</b><small>${t('dashBestHabit')} · ${t('dashBestHabitSub', { n: bh.days })}</small></div>
      <div class="dash-cell"><span class="dash-emoji" aria-hidden="true">⚡</span>
        <b>${pd ? esc(pd.label) : '—'}</b><small>${t('dashProdDay')} · ${t('dashProdDaySub', { n: pd ? pd.n : 0 })}</small></div>
      <div class="dash-cell"><span class="dash-emoji" aria-hidden="true">📊</span>
        <b>${t('dashQuarter')}</b>
        <div class="dash-quarters">${quarters.map((p, i) => `<span class="dq${i === bestQ ? ' best' : ''}" title="${t('dashQuarter')} Q${i + 1}: ${p}%"><i>Q${i + 1}</i><b>${p}%</b></span>`).join('')}</div></div>
      <div class="dash-cell"><span class="dash-emoji" aria-hidden="true">🎯</span>
        <b>${gs.done}/${gs.total}</b><small>${t('dashGoalTotal')} · ${t('dashGoalDone', { d: gs.done, t: gs.total })}</small></div>
    </div>
  </div>`;
}

/* ============================ Phase 8: Widget Settings Modal ============================ */

function openWidgetSettingsModal(view) {
  const m = document.getElementById('widgetSettingsModal');
  if (!m) return;
  m.dataset.widgetView = view;
  renderWidgetSettingsModal(view);
  TaskFlowUI.openDialog('widgetSettingsModal');
}

function closeWidgetSettingsModal() {
  TaskFlowUI.closeDialog('widgetSettingsModal');
}

function renderWidgetSettingsModal(view) {
  const el = document.getElementById('widgetList');
  if (!el) return;
  const defs = view === 'year' ? WIDGET_DEFS_YEAR : WIDGET_DEFS_OVERVIEW;
  const config = initWidgetConfig(view);
  const configMap = {};
  config.forEach(function (w) { configMap[w.id] = w; });
  var sorted = config.slice().sort(function (a, b) { return a.order - b.order; });
  el.innerHTML = sorted.map(function (w, i) {
    var def = defs.find(function (d) { return d.id === w.id; });
    if (!def) return '';
    var label = t(def.labelKey);
    return `<div class="widget-item" draggable="true" data-widget-id="${w.id}" data-widget-order="${w.order}">
      <span class="widget-handle" data-widget-drag="${w.id}" aria-label="${esc(t('dragHint'))}">🟰</span>
      <span class="widget-name">${esc(label)}</span>
      <button type="button" class="widget-toggle${w.visible ? ' on' : ' off'}" data-action="widget-toggle" data-widget-id="${w.id}" aria-checked="${w.visible ? 'true' : 'false'}" aria-label="${esc(w.visible ? t('widgetHide') : t('widgetShow'))}">${w.visible ? '✓' : '✕'}</button>
    </div>`;
  }).join('');
  // Attach drag events for reorder
  el.querySelectorAll('.widget-item').forEach(function (item) {
    item.addEventListener('dragstart', function (e) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.dataset.widgetId);
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', function () {
      item.classList.remove('dragging');
      document.querySelectorAll('.widget-item').forEach(function (n) { return n.classList.remove('drag-over'); });
    });
    item.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', function () {
      item.classList.remove('drag-over');
    });
    item.addEventListener('drop', function (e) {
      e.preventDefault();
      item.classList.remove('drag-over');
      var fromId = e.dataTransfer.getData('text/plain');
      if (!fromId || fromId === item.dataset.widgetId) return;
      var items = Array.from(el.querySelectorAll('.widget-item'));
      var fromIdx = items.findIndex(function (x) { return x.dataset.widgetId === fromId; });
      var toIdx = items.indexOf(item);
      if (fromIdx < 0 || toIdx < 0) return;
      // Reorder by swapping order values
      var fromOrder = parseInt(items[fromIdx].dataset.widgetOrder, 10);
      var toOrder = parseInt(items[toIdx].dataset.widgetOrder, 10);
      var configNow = initWidgetConfig(view);
      var fromCfg = configNow.find(function (c) { return c.id === fromId; });
      var toCfg = configNow.find(function (c) { return c.id === item.dataset.widgetId; });
      if (fromCfg && toCfg) {
        fromCfg.order = toOrder;
        toCfg.order = fromOrder;
        saveWidgetConfig(view, configNow);
        renderWidgetSettingsModal(view);
      }
    });
  });
}

/* ============================ Phase 3: Profile / tài khoản ============================ */

function setFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return null;
  const errorId = (field.getAttribute('aria-describedby') || '').split(/\s+/).find((id) => id.endsWith('Error')) || fieldId + 'Error';
  const error = document.getElementById(errorId);
  field.setAttribute('aria-invalid', 'true');
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
  return field;
}

function clearFormErrors(root) {
  const scope = root || document;
  scope.querySelectorAll('[aria-invalid="true"]').forEach((field) => field.removeAttribute('aria-invalid'));
  scope.querySelectorAll('.field-error').forEach((error) => {
    error.hidden = true;
    error.textContent = '';
  });
}

function openProfileModal() {
  const m = document.getElementById('profileModal');
  if (!m) return;
  const u = document.getElementById('profileUser');
  const uname = (window.Sync && window.Sync.getUsername) ? window.Sync.getUsername() : '';
  if (u) u.textContent = uname ? t('profileUser', { u: uname }) : '';
  clearFormErrors(m);
  TaskFlowUI.openDialog('profileModal');
}

function closeProfileModal() {
  TaskFlowUI.closeDialog('profileModal');
}

async function doChangePassword() {
  if (!window.Sync || !window.Sync.changePassword) { TaskFlowUI.toast(t('pwNeedLogin'), 'error'); return; }
  const cur = document.getElementById('pwCurrent');
  const nw = document.getElementById('pwNew');
  if (!cur || !nw) return;
  clearFormErrors(document.getElementById('profileModal'));
  let firstInvalid = null;
  if (!cur.value) firstInvalid = setFieldError('pwCurrent', t('pwCurrentPh'));
  if (!nw.value) firstInvalid = firstInvalid || setFieldError('pwNew', t('pwNewPh'));
  if (firstInvalid) { firstInvalid.focus(); return; }
  const r = await window.Sync.changePassword(cur.value, nw.value);
  if (r && r.ok) {
    TaskFlowUI.toast(t('pwOk'), 'success');
    cur.value = ''; nw.value = '';
    closeProfileModal();
  } else {
    setFieldError('pwNew', t('pwErr')).focus();
  }
}

async function doDeleteAccount() {
  if (!window.Sync || !window.Sync.deleteAccount) { TaskFlowUI.toast(t('pwNeedLogin'), 'error'); return; }
  if (!confirm(t('acctDeleteConfirm'))) return;
  const r = await window.Sync.deleteAccount();
  if (r && r.ok) {
    TaskFlowUI.toast(t('acctDeleted'), 'success');
    closeProfileModal();
    closeSyncModal();
    updateSyncStatus();
    rebootState();
  } else {
    TaskFlowUI.toast(t('acctDeleteErr'), 'error');
  }
}

/* ============================ Điều hướng ============================ */

function shellNavLabel(value) {
  return String(value || '').replace(/^[\p{Extended_Pictographic}\uFE0F]+\s*/u, '');
}

function buildNav() {
  const desktop = document.getElementById('navTabs');
  const mobile = document.getElementById('mobileNav');
  const items = [
    { view: 'overview', icon: 'overview', label: shellNavLabel(t('tabOverview')), id: 'tab-overview', controls: 'view-overview' },
    { view: 'week', icon: 'week', label: shellNavLabel(t('weekN', { n: state.currentWeek })), id: 'tab-week-' + state.currentWeek, controls: 'view-week', week: state.currentWeek },
    { view: 'year', icon: 'year', label: shellNavLabel(t('tabYear', { y: PLAN_YEAR })), id: 'tab-year', controls: 'view-year' },
    { view: 'calendar', icon: 'calendar', label: shellNavLabel(t('tabCalendar')), id: 'tab-calendar', controls: 'view-calendar' },
  ];
  const navAttributes = {
    overview: 'data-nav-view="overview" data-view="overview"',
    week: 'data-nav-view="week" data-view="week"',
    year: 'data-nav-view="year" data-view="year"',
    calendar: 'data-nav-view="calendar" data-view="calendar"',
  };
  if (desktop) {
    desktop.innerHTML = items.map((item) => `<button type="button" class="app-nav-item tab" role="tab"
      id="${item.id}" aria-controls="${item.controls}" data-action="nav" ${navAttributes[item.view]}
      ${item.week ? `data-week="${item.week}"` : ''}>
      ${window.TaskFlowUI.icon(item.icon)}<span>${esc(item.label)}</span></button>`).join('');
  }
  if (mobile) {
    mobile.innerHTML = items.map((item) => `<button type="button" class="app-mobile-nav-item tab" role="tab"
      id="mobile-${item.id}" aria-controls="${item.controls}" data-action="nav" ${navAttributes[item.view]}
      ${item.week ? `data-week="${item.week}"` : ''}>
      ${window.TaskFlowUI.icon(item.icon)}<span>${esc(item.label)}</span></button>`).join('') +
      `<button type="button" class="app-mobile-nav-item" data-action="tools-open" aria-controls="toolsDrawer"
        aria-expanded="false">${window.TaskFlowUI.icon('more')}<span>Thêm</span></button>`;
  }
  renderShellIcons();
}
function updateNav() {
  document.querySelectorAll('[data-nav-view]').forEach((b) => {
    const active = b.dataset.view === state.view && (!b.dataset.week || +b.dataset.week === state.currentWeek);
    b.classList.toggle('active', active);
    b.setAttribute('aria-current', active ? 'page' : 'false');
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
  });
  updateShellContext();
}

function renderShellIcons() {
  document.querySelectorAll('[data-shell-icon]').forEach((el) => {
    if (!el.querySelector('.ui-icon')) {
      el.insertAdjacentHTML('afterbegin', window.TaskFlowUI.icon(el.dataset.shellIcon));
    }
  });
  document.querySelectorAll('[data-inline-icon]').forEach((el) => {
    el.innerHTML = window.TaskFlowUI.icon(el.dataset.inlineIcon);
  });
}

function updateShellContext() {
  const title = document.getElementById('appViewTitle');
  const period = document.getElementById('appPeriod');
  const labels = {
    overview: t('tabOverview'),
    week: t('weekN', { n: state.currentWeek }),
    year: t('tabYear', { y: PLAN_YEAR }),
    calendar: t('tabCalendar'),
  };
  if (title) title.textContent = labels[state.view] || labels.overview;
  if (period) period.textContent = `${monthLabel(PLAN_MONTH)} · ${PLAN_YEAR}`;
}

function openToolsDrawer(opener) {
  const drawer = document.getElementById('toolsDrawer');
  const backdrop = document.getElementById('toolsDrawerBackdrop');
  if (!drawer || !backdrop) return;
  backdrop.hidden = false;
  document.body.classList.add('tools-drawer-open');
  document.querySelectorAll('[data-action="tools-open"]').forEach((button) => button.setAttribute('aria-expanded', 'true'));
  TaskFlowUI.openDrawer('toolsDrawer', opener);
}

function closeToolsDrawer() {
  const drawer = document.getElementById('toolsDrawer');
  const backdrop = document.getElementById('toolsDrawerBackdrop');
  if (!drawer || drawer.hidden) return;
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove('tools-drawer-open');
  document.querySelectorAll('[data-action="tools-open"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  TaskFlowUI.closeDrawer('toolsDrawer');
}

function addTaskFromShell() {
  const today = nowInfo();
  const week = today.inRange ? today.week : state.currentWeek;
  const day = today.inRange && today.week === week ? today.dayInWeek : 0;
  setView('week', week);
  const add = document.querySelector(`.day-col-${day} [data-action="addtask"][data-kind="regular"]`)
    || document.querySelector(`[data-action="addtask"][data-week="${week}"]`);
  if (add) add.click();
}

function setView(view, week) {
  state.view = view;
  if (week) {
    const weekChanged = state.currentWeek !== week;
    state.currentWeek = week;
    if (weekChanged) buildNav();
  }
  updateNav();
  const ov = document.getElementById('view-overview');
  const wk = document.getElementById('view-week');
  const yr = document.getElementById('view-year');
  const cal = document.getElementById('view-calendar');
  ov.classList.toggle('active', view === 'overview');
  wk.classList.toggle('active', view === 'week');
  yr.classList.toggle('active', view === 'year');
  if (cal) cal.classList.toggle('active', view === 'calendar');
  if (view === 'overview') {
    ov.setAttribute('aria-labelledby', 'tab-overview');
    renderOverview();
  } else if (view === 'week') {
    wk.setAttribute('aria-labelledby', 'tab-week-' + state.currentWeek);
    renderWeek();
  } else if (view === 'calendar') {
    if (cal) cal.setAttribute('aria-labelledby', 'tab-calendar');
    renderCalendar();
  } else {
    yr.setAttribute('aria-labelledby', 'tab-year');
    renderYear();
  }
  window.TaskFlowUI.syncUrl({
    view,
    year: PLAN_YEAR,
    month: PLAN_MONTH,
    week: view === 'week' ? state.currentWeek : undefined,
    tags: view === 'calendar' ? calendarTagFilters : undefined,
  });
  save();
}
function goWeek(v) {
  const n = Math.min(NUM_WEEKS, Math.max(1, v));
  // Tag filter theo tuần cũ — reset để không còn task bị ẩn khi sang tuần không có tag đó
  tagFilter = null;
  calendarTagFilters = [];
  setView('week', n);
}
function openMonth(m) {
  // Wrap qua biên năm: tháng 1 −1 → tháng 12 năm trước; tháng 12 +1 → tháng 1 năm sau.
  const nm = window.PlanMath ? (m < 0 ? window.PlanMath.prevMonth(PLAN_YEAR, 0) : m > 11 ? window.PlanMath.nextMonth(PLAN_YEAR, 11) : null) : null;
  if (nm) { m = nm.m; PLAN_YEAR = nm.y; }
  if (m < 0 || m > 11) return;
  const now = new Date();
  if (m === now.getMonth() && PLAN_YEAR === now.getFullYear()) viewedMonth = null;
  else viewedMonth = m;
  initPlan(new Date(PLAN_YEAR, m, 1));
  state = bootState();
  yearState = bootYearState();
  state.view = 'overview';
  // Tag filter theo tháng cũ — reset để không còn task bị ẩn mà không có UI gỡ
  tagFilter = null;
  calendarTagFilters = [];
  updateBrand();
  updateNowBtn();
  buildNav();
  setView('overview', state.currentWeek);
  syncReminderTimers();
}
function openYear(dy) {
  const y = PLAN_YEAR + dy;
  if (y < 2000 || y > 2099) return;
  PLAN_YEAR = y;
  initPlan(new Date(PLAN_YEAR, PLAN_MONTH, 1));
  state = bootState();
  yearState = bootYearState();
  state.view = 'overview';
  updateBrand();
  updateNowBtn();
  buildNav();
  setView('overview', state.currentWeek);
}
function updateNowBtn() {
  const b = document.getElementById('btnNow');
  if (b) b.hidden = false;
}

/* ============================ Phase 5: Undo/Redo, Phím tắt, Kéo-thả, Sao lưu, Focus Mode ============================ */

// Phase 5: MỘT stack duy nhất (makeUndoStack tự quản lý undo + redo nội bộ)
let undoStack = window.PlanMath ? window.PlanMath.makeUndoStack(50) : null;
let lastSnapshotJson = null;

function snapshotAll() {
  return {
    state: JSON.parse(JSON.stringify(state)),
    yearState: JSON.parse(JSON.stringify(yearState)),
    mood: typeof moodMap !== 'undefined' ? JSON.parse(JSON.stringify(moodMap)) : null,
    theme: (typeof THEME !== 'undefined' ? THEME : null) || null,
    plan: { y: PLAN_YEAR, m: PLAN_MONTH, cw: state.currentWeek },
  };
}
function pushUndo() {
  if (!undoStack) return;
  const snap = snapshotAll();
  const j = JSON.stringify(snap);
  if (j === lastSnapshotJson) return; // tránh push trùng liên tiếp (focus nối tiếp không đổi state)
  lastSnapshotJson = j;
  undoStack.push(snap); // push() tự clear nhánh redo cũ (hành vi standard)
  updateUndoButtons();
}
function applySnapshot(snap) {
  if (!snap) return;
  state = snap.state;
  yearState = snap.yearState;
  if (snap.mood && typeof moodMap !== 'undefined') { moodMap = JSON.parse(JSON.stringify(snap.mood)); }
  if (snap.theme) {
    setTheme(snap.theme);
  }
  if (snap.plan) {
    PLAN_YEAR = snap.plan.y;
    PLAN_MONTH = snap.plan.m;
    state.currentWeek = snap.plan.cw;
  }
  invalidateYearCache();
  renderCurrentView();
  save();
  saveYear();
  saveMood();
  lastSnapshotJson = null; // bản khôi phục không được "ăn" lần push kế tiếp
  updateUndoButtons();
}
function renderCurrentView() {
  if (state.view === 'overview') renderOverview();
  else if (state.view === 'week') renderWeek();
  else if (state.view === 'calendar') renderCalendar();
  else renderYear();
  updateNav();
  refreshFocusIfOpen();
}
function doUndo() {
  if (!undoStack || !undoStack.canUndo()) return;
  const snap = undoStack.undo(); // undo() tự đẩy bản đang undo sang nhánh redo
  if (!snap) return;
  applySnapshot(snap);
  trackEvent('undo');
}
function doRedo() {
  if (!undoStack || !undoStack.canRedo()) return;
  const snap = undoStack.redo(); // redo() tự đẩy bản redo ngược về nhánh undo
  if (!snap) return;
  applySnapshot(snap);
  trackEvent('redo');
}
function updateUndoButtons() {
  const undoDisabled = !(undoStack && undoStack.canUndo());
  const redoDisabled = !(undoStack && undoStack.canRedo());
  document.querySelectorAll('[data-action="undo"]').forEach((button) => {
    button.disabled = undoDisabled;
  });
  document.querySelectorAll('[data-action="redo"]').forEach((button) => {
    button.disabled = redoDisabled;
  });
}

/* ---------- Phím tắt (Phase 5.3) ---------- */

function toggleSearchModal() {
  const m = document.getElementById('searchModal');
  if (!m) return;
  if (m.hidden) openSearchModal(); else closeSearchModal();
}
function focusTodayTaskAdd() {
  const ti = nowInfo();
  if (state.view !== 'week' || !ti.inRange) return;
  const col = document.querySelector(`.day-col-${ti.dayInWeek}`);
  const add = col && col.querySelector('[data-action="addtask"]');
  if (add) add.click();
}

/* ---------- Kéo-thả sắp xếp (Phase 5.2) ---------- */

let dragState = null;
document.addEventListener('dragstart', (e) => {
  const el = e.target.closest('[data-drag]');
  if (!el) return;
  dragState = { type: el.dataset.drag, week: el.dataset.week, day: el.dataset.day, task: el.dataset.task, id: el.dataset.id, scope: el.dataset.scope, el };
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', 'x'); } catch (err) { /* ẩn */ }
  el.classList.add('dragging');
});
document.addEventListener('dragover', (e) => {
  if (!dragState) return;
  // Task: thả lên row khác CÙNG ngày (chèn tại vị trí row) HOẶC lên vùng nhóm
  // (chèn cuối nhóm) — row được ưu tiên vì nó nằm BÊN TRONG vùng nhóm.
  if (dragState.type === 'task') {
    const el = e.target.closest('[data-drag]');
    if (el && el.dataset.drag === 'task' && el !== dragState.el
        && el.dataset.week === dragState.week && el.dataset.day === dragState.day) {
      e.preventDefault();
      el.classList.add('drag-over');
      return;
    }
    const zone = e.target.closest('[data-drop="taskzone"]');
    if (zone && zone.dataset.week === dragState.week) {
      e.preventDefault();
      zone.classList.add('drag-over');
      return;
    }
    return;
  }
  const el = e.target.closest('[data-drag]');
  if (!el || el === dragState.el) return;
  if (dragState.type === 'goal') {
    if (el.dataset.drag !== 'goal') return;
    if (dragState.scope !== el.dataset.scope) return;
    if (dragState.scope === 'w' && el.dataset.week !== dragState.week) return;
  } else if (dragState.type === 'habit') {
    if (el.dataset.drag !== 'habit') return;
  } else {
    return;
  }
  e.preventDefault();
  el.classList.add('drag-over');
});
document.addEventListener('dragleave', (e) => {
  const el = e.target.closest('[data-drag]');
  if (el) el.classList.remove('drag-over');
  const zone = e.target.closest('[data-drop="taskzone"]');
  if (zone) zone.classList.remove('drag-over');
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const el = e.target.closest('[data-drag]');
  const zone = e.target.closest('[data-drop="taskzone"]');
  document.querySelectorAll('.drag-over').forEach((n) => n.classList.remove('drag-over'));
  if (!dragState) return;
  if (dragState.type === 'task') {
    const w = state.weeks[+dragState.week - 1];
    const d = w && w.days[+dragState.day];
    if (!d || !window.PlanMath || !window.PlanMath.reorderTask) { dragState = null; return; }
    const from = +dragState.task;
    if (from < 0 || from >= d.tasks.length) { dragState = null; return; }
    // Phải khai báo TRƯỚC nhánh kéo qua ngày khác — gán trước khai báo `let` = TDZ ReferenceError
    let toKind = null;
    // Nếu thả vào zone khác ngày trong cùng tuần → moveTaskAcrossDays
    if (zone && zone.dataset.day !== dragState.day) {
      if (zone.dataset.week !== dragState.week) { dragState = null; return; }
      toKind = zone.dataset.kind;
      if (toKind !== 'priority' && toKind !== 'regular') { dragState = null; return; }
      var srcDay = state.weeks[+dragState.week - 1].days[+dragState.day];
      var dstDay = state.weeks[+zone.dataset.week - 1].days[+zone.dataset.day];
      if (!srcDay || !dstDay) { dragState = null; return; }
      var result = window.PlanMath.moveTaskAcrossDays(srcDay.tasks, dstDay.tasks, +dragState.task, toKind);
      // No-op check: mảng không đổi (vd thả vào ngày trống không có gì để di chuyển)
      if (result.tasksFrom === srcDay.tasks && result.tasksTo === dstDay.tasks) { dragState = null; return; }
      pushUndo();
      srcDay.tasks = result.tasksFrom;
      dstDay.tasks = result.tasksTo;
      renderWeek(); save(); trackEvent('move_task_across_days');
      dragState = null; return;
    }
    let toPos = 0;
    if (el && el.dataset.drag === 'task') {
      // Thả lên đúng row đang kéo → không làm gì (no-op)
      if (el === dragState.el) { dragState = null; return; }
      // Thả lên row khác: chèn đúng vị trí của row trong nhóm đích
      if (el.dataset.week !== dragState.week || el.dataset.day !== dragState.day) { dragState = null; return; }
      toKind = el.dataset.kind;
      toPos = +el.dataset.pos;
    } else if (zone) {
      // Thả vào vùng nhóm (khoảng trống / nút + / nhóm rỗng) → chèn CUỐI nhóm đích
      if (zone.dataset.week !== dragState.week || zone.dataset.day !== dragState.day) { dragState = null; return; }
      toKind = zone.dataset.kind;
      toPos = d.tasks.filter((x) => x.kind === toKind).length;
    }
    if (toKind !== 'priority' && toKind !== 'regular') { dragState = null; return; }
    // reorderTask THUẦN: trả về đúng mảng gốc khi hiển thị không đổi (no-op)
    // → không push undo phantom (vd: thả task cuối nhóm lên đúng vùng nhóm của nó)
    const next = window.PlanMath.reorderTask(d.tasks, from, toKind, toPos);
    if (next === d.tasks) { dragState = null; return; }
    pushUndo(); // snapshot trước khi gán mảng mới
    d.tasks = next;
    renderWeek(); save(); trackEvent('reorder_task');
  } else {
    if (!el || el === dragState.el) { dragState = null; return; }
    if (dragState.type === 'goal' && (el.dataset.drag !== 'goal' || dragState.scope !== el.dataset.scope || (dragState.scope === 'w' && el.dataset.week !== dragState.week))) { dragState = null; return; }
    if (dragState.type === 'habit' && el.dataset.drag !== 'habit') { dragState = null; return; }
  }
  if (dragState.type === 'goal') {
    if (dragState.scope === 'm') {
      const from = state.monthlyGoals.findIndex((g) => g.id === dragState.id);
      const to = state.monthlyGoals.findIndex((g) => g.id === el.dataset.id);
      if (from < 0 || to < 0 || from === to) return;
      pushUndo();
      const item = state.monthlyGoals.splice(from, 1)[0];
      state.monthlyGoals.splice(to, 0, item);
      renderOverview(); save(); trackEvent('reorder_goal');
    } else if (dragState.scope === 'w') {
      const w = state.weeks[+dragState.week - 1];
      const from = +dragState.id, to = +el.dataset.id;
      if (!w || from === to || from < 0 || to < 0 || from >= w.goals.length || to >= w.goals.length) return;
      pushUndo();
      const item = w.goals.splice(from, 1)[0];
      w.goals.splice(to, 0, item);
      renderWeek(); save(); trackEvent('reorder_goal');
    } else if (dragState.scope === 'y') {
      const from = yearState.goals.findIndex((g) => g.id === dragState.id);
      const to = yearState.goals.findIndex((g) => g.id === el.dataset.id);
      if (from < 0 || to < 0 || from === to) return;
      pushUndo();
      const item = yearState.goals.splice(from, 1)[0];
      yearState.goals.splice(to, 0, item);
      renderYear(); saveYear(); trackEvent('reorder_goal');
    }
  } else if (dragState.type === 'habit') {
    const from = state.habits.findIndex((h) => h.id === dragState.id);
    const to = state.habits.findIndex((h) => h.id === el.dataset.id);
    if (from < 0 || to < 0 || from === to) return;
    pushUndo();
    const item = state.habits.splice(from, 1)[0];
    state.habits.splice(to, 0, item);
    renderOverview(); save(); trackEvent('reorder_habit');
  }
  dragState = null;
});
document.addEventListener('dragend', () => {
  dragState = null;
  document.querySelectorAll('.drag-over, .dragging').forEach((n) => n.classList.remove('drag-over', 'dragging'));
});

/* ---------- Phase 7.5: Ngày nghỉ habit (contextmenu → skip) ---------- */
document.addEventListener('contextmenu', (e) => {
  const cell = e.target.closest('[data-context="habit-day"]');
  if (!cell) return;
  e.preventDefault();
  const h = state.habits.find(x => x.id === cell.dataset.id);
  if (!h) return;
  const day = +cell.dataset.day;
  if (!Array.isArray(h.skipDays)) h.skipDays = [];
  const idx = h.skipDays.indexOf(day);
  if (idx >= 0) h.skipDays.splice(idx, 1);
  else h.skipDays.push(day);
  save();
  renderOverview();
  trackEvent('habit_skip_day');
});

/* ---------- Sao lưu tự động (Phase 5.4) ---------- */

const BACKUP_SLOTS = 7;
function backupSlotKey(i) { return 'planner-backup-' + i; }
function rotateBackup(data) {
  try {
    let idx = 0;
    try { idx = (+localStorage.getItem('planner-backup-idx') || -1) + 1; } catch (e) { /* ẩn */ }
    idx = ((idx % BACKUP_SLOTS) + BACKUP_SLOTS) % BACKUP_SLOTS;
    localStorage.setItem('planner-backup-idx', String(idx));
    localStorage.setItem(backupSlotKey(idx), JSON.stringify({ savedAt: new Date().toISOString(), data }));
  } catch (e) {
    // Hết quota: xoá toàn bộ slot cũ rồi thử lại 1 lần
    try {
      for (let i = 0; i < BACKUP_SLOTS; i++) localStorage.removeItem(backupSlotKey(i));
      localStorage.setItem(backupSlotKey(0), JSON.stringify({ savedAt: new Date().toISOString(), data }));
      localStorage.setItem('planner-backup-idx', '0');
    } catch (e2) { /* ẩn */ }
  }
}
let lastBackupTs = 0;
function maybeAutoBackup() {
  const now = Date.now();
  if (now - lastBackupTs < 60000) return; // tối đa 1 lần/phút — tránh ghi đè liên tục khi gõ text
  lastBackupTs = now;
  try { rotateBackup(collectAllData()); } catch (e) { /* ẩn */ }
}
function listBackups() {
  const out = [];
  for (let i = 0; i < BACKUP_SLOTS; i++) {
    try {
      const raw = localStorage.getItem(backupSlotKey(i));
      if (!raw) continue;
      const b = JSON.parse(raw);
      if (b && b.data && b.data.keys) out.push({ idx: i, savedAt: b.savedAt, keys: Object.keys(b.data.keys).length });
    } catch (e) { /* ẩn */ }
  }
  return out.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}
function openBackupModal() {
  const m = document.getElementById('backupModal');
  if (!m) return;
  const box = document.getElementById('backupList');
  const list = listBackups();
  if (box) {
    box.innerHTML = list.length
      ? list.map((b) => `<button type="button" class="backup-row" data-action="backup-use" data-idx="${b.idx}"><span>🕑 ${new Date(b.savedAt).toLocaleString(dateLocale())}</span><small>${t('backupSlot', { n: b.keys })}</small></button>`).join('')
      : `<p class="pop-note">${t('backupEmpty')}</p>`;
  }
  TaskFlowUI.openDialog('backupModal');
}
function closeBackupModal() {
  TaskFlowUI.closeDialog('backupModal');
}
function doRestoreBackup(idx) {
  try {
    const b = JSON.parse(localStorage.getItem(backupSlotKey(idx)));
    if (!b || !b.data || !b.data.keys) return;
    if (!confirm(t('backupRestoreConfirm'))) return;
    // Không khôi phục token đăng nhập / chính các slot backup (tránh ghi đè phiên + vòng lặp backup)
    Object.keys(b.data.keys).forEach((k) => {
      if (k === 'planner-token' || k === 'planner-backup-idx' || k.startsWith('planner-backup-')) return;
      try { localStorage.setItem(k, b.data.keys[k]); } catch (e) { /* ẩn */ }
    });
    TaskFlowUI.toast(t('backupRestoreDone'), 'success');
    window.setTimeout(() => location.reload(), 450);
  } catch (e) { /* ẩn */ }
}

/* ---------- Focus Mode (Phase 5.6) ---------- */

function openFocusMode() {
  document.body.classList.add('focus-mode');
  renderFocusContent();
  TaskFlowUI.openDialog('focusOverlay');
  trackEvent('focus_open');
}
function closeFocusMode() {
  document.body.classList.remove('focus-mode');
  TaskFlowUI.closeDialog('focusOverlay');
}
function renderFocusContent() {
  const box = document.getElementById('focusContent');
  if (!box) return;
  const now = new Date();
  const ti = nowInfo();
  const today = ti.inRange ? ti.dayInWeek : -1;
  let tasks = [];
  if (ti.inRange) {
    const w = state.weeks[ti.week - 1];
    const d = w && w.days[ti.dayInWeek];
    if (d) tasks = d.tasks || [];
  }
  const habits = state.habits.filter((h) => today >= 0 && !h.days[today]);
  box.innerHTML = `
    <p class="focus-date">📅 ${fmtDate(now)}</p>
    <h3 class="focus-sec-title">${t('focusToday')}</h3>
    <div class="focus-tasks">
      ${tasks.length ? tasks.map((tk, i) => `<div class="focus-task ${tk.done ? 'done' : ''}">${checkboxHTML(tk.kind === 'priority' ? 'pink' : 'blue', tk.done, `data-action="task" data-week="${ti.week}" data-day="${ti.dayInWeek}" data-task="${i}"`, window.TaskFlowUI.checkboxLabel('task', tk.text, fmtDate(now)))}<span class="focus-task-text">${esc(tk.text) || '…'}</span></div>`).join('') : `<p class="focus-empty">${t('focusNoTask')}</p>`}
    </div>
    <h3 class="focus-sec-title">${t('focusHabits')}</h3>
    <div class="focus-habits">
      ${habits.length ? habits.map((h) => `<button type="button" class="focus-habit" data-action="habit" data-id="${h.id}" data-day="${today}">🐥 ${esc(h.name)}</button>`).join('') : `<p class="focus-empty">${t('focusHabitDone')}</p>`}
    </div>`;
}
function refreshFocusIfOpen() {
  if (document.body.classList.contains('focus-mode')) renderFocusContent();
}

/* ============================ Sự kiện ============================ */

document.addEventListener('click', (e) => {
  if (e.target.closest('select')) return;
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const act = el.dataset.action;

  // Phase 5: bọc mọi mutation bằng undo snapshot (trước khi đổi state)
  // Lưu ý: 'reset' KHÔNG nằm trong set — pushUndo được gọi trong nhánh đã confirm (tránh phantom entry khi user bấm Hủy)
  const UNDOABLE_ACTS = new Set(['goal', 'ygoal', 'habit', 'wgoal', 'task', 'addtask', 'deltask', 'addgoal', 'confirm-addgoal', 'delgoal', 'addhabit', 'delhabit', 'remind-off-item', 'mgoal', 'qgoal', 'copyhabits', 'template-do', 'pullyear', 'template-add', 'demo-data', 'mood-set', 'mood-clear', 'theme', 'repeat-edit']);
  if (UNDOABLE_ACTS.has(act)) pushUndo();

  if (act === 'tools-open') { openToolsDrawer(el); return; }
  else if (act === 'tools-close') { closeToolsDrawer(); return; }
  else if (act === 'shell-add-task') { addTaskFromShell(); return; }
  else if (act === 'undo') { doUndo(); return; }
  else if (act === 'redo') { doRedo(); return; }
  else if (act === 'focus') { openFocusMode(); return; }
  else if (act === 'focus-close') { closeFocusMode(); return; }
  else if (act === 'backup-restore') { openBackupModal(); return; }
  else if (act === 'backup-close') { closeBackupModal(); return; }
  else if (act === 'backup-use') { doRestoreBackup(+el.dataset.idx); return; }
  else if (act === 'feedback') {
    trackEvent('feedback_click', { kind: 'form' });
    if (!FB_FORM_URL) { TaskFlowUI.toast(t('fbNoForm'), 'error'); return; }
    window.open(FB_FORM_URL, '_blank', 'noopener');
    return;
  }
  else if (act === 'chat-toggle') {
    const p = document.getElementById('chatPop');
    if (p) {
      p.hidden = !p.hidden;
      if (!p.hidden) {
        const pomoPanel = document.getElementById('pomoPanel');
        if (pomoPanel) pomoPanel.hidden = true;
      }
    }
    return;
  }
  else if (act === 'chat-close') {
    const p = document.getElementById('chatPop');
    if (p) p.hidden = true;
    return;
  }
  else if (act === 'chat-send') {
    doChatSend();
    return;
  }
  else if (act === 'chat-suggest') {
    doChatSuggest(el.dataset.topic);
    return;
  }
  else if (act === 'help-toggle') {
    const m = document.getElementById('helpModal');
    if (m) {
      if (m.hidden) {
        const content = document.getElementById('helpContent');
        if (content) content.innerHTML = t('helpContent');
        TaskFlowUI.openDialog('helpModal', el);
      } else TaskFlowUI.closeDialog('helpModal');
    }
    return;
  }
  else if (act === 'help-close') {
    TaskFlowUI.closeDialog('helpModal');
    return;
  }

  if (act === 'nav') setView(el.dataset.view, +el.dataset.week || undefined);
  else if (act === 'journey') {
    const target = document.getElementById('ov-content');
    if (target) target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  } else if (act === 'prevmonth') openMonth(PLAN_MONTH - 1);
  else if (act === 'nextmonth') openMonth(PLAN_MONTH + 1);
  else if (act === 'prevyear') openYear(-1);
  else if (act === 'nextyear') openYear(1);
  else if (act === 'prev') goWeek(state.currentWeek - 1);
  else if (act === 'next') goWeek(state.currentWeek + 1);
  else if (act === 'weekbar') goWeek(+el.dataset.week);
  else if (act === 'day-jump') {
    const target = document.getElementById(el.dataset.dayTarget);
    if (target) {
      target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      target.focus({ preventScroll: true });
    }
  }
  else if (act === 'goal') {
    const g = state.monthlyGoals.find((x) => x.id === el.dataset.id);
    if (g) { g.done = !g.done; afterGoalToggle(g); if (g.done && monthlyStats().pct === 100) confettiBurst(); }
  } else if (act === 'ygoal') {
    const g = yearState.goals.find((x) => x.id === el.dataset.id);
    if (g) { g.done = !g.done; afterYearGoalToggle(); }
  } else if (act === 'month') {
    openMonth(+el.dataset.month);
  } else if (act === 'gotoday') {
    const now = new Date();
    if (PLAN_MONTH !== now.getMonth() || PLAN_YEAR !== now.getFullYear()) openMonth(now.getMonth());
    const ti = nowInfo();
    if (ti.inRange) setView('week', ti.week);
    else setView('overview');
  } else if (act === 'pullyear') {
    pullYearGoalsFromMonths();
  } else if (act === 'mgoal') {
    toggleMonthGoal(+el.dataset.month, el.dataset.id);
  } else if (act === 'qgoal') {
    toggleQuarterGoal(+el.dataset.q, el.dataset.key);
  } else if (act === 'habit') {
    const h = state.habits.find((x) => x.id === el.dataset.id);
    if (h) { h.days[+el.dataset.day] = !h.days[+el.dataset.day]; afterHabitToggle(); refreshFocusIfOpen(); }
  } else if (act === 'wgoal') {
    const w = state.weeks[+el.dataset.week - 1];
    const g = w.goals[+el.dataset.id];
    if (g) { g.done = !g.done; afterWGoalToggle(w); if (g.done && weekStats(w).pct === 100) confettiBurst(); }
  } else if (act === 'task') {
    const w = state.weeks[+el.dataset.week - 1];
    const d = w.days[+el.dataset.day];
    const t = d.tasks[+el.dataset.task];
    if (t) { t.done = !t.done; refreshTaskUI(w, +el.dataset.day); save(); refreshFocusIfOpen(); }
  } else if (act === 'addtask') {
    const w = state.weeks[+el.dataset.week - 1];
    const d = w.days[+el.dataset.day];
    d.tasks.push({ kind: el.dataset.kind, done: false, text: '', tags: [], remind: { enabled: false, time: '20:00' } });
    renderWeek();
    save();
    trackEvent('create_task', { kind: el.dataset.kind });
    // Tiện ích: sau khi tạo, nhảy thẳng vào ô viết task mới để gõ luôn (Enter = xong)
    const fresh = document.querySelector(`[data-role="task-text"][data-week="${w.n}"][data-day="${el.dataset.day}"][data-task="${d.tasks.length - 1}"]`);
    if (fresh) fresh.focus();
  } else if (act === 'deltask') {
    const w = state.weeks[+el.dataset.week - 1];
    w.days[+el.dataset.day].tasks.splice(+el.dataset.task, 1);
    renderWeek();
    save();
  } else if (act === 'addgoal') {
    const scope = el.dataset.scope;
    if (scope === 'm') {
      state.monthlyGoals.push({ id: 'g' + Date.now(), text: '', kind: el.dataset.kind, done: false });
      renderOverview();
      save();
      trackEvent('create_goal', { scope: 'month' });
    } else if (scope === 'w') {
      const w = state.weeks[+el.dataset.week - 1];
      w.goals.push({ text: '', kind: el.dataset.kind, done: false });
      renderWeek();
      save();
      trackEvent('create_goal', { scope: 'week' });
    } else if (scope === 'y') {
      yearState.goals.push({ id: 'yg' + Date.now(), text: '', kind: el.dataset.kind, done: false });
      renderYear();
      saveYear();
      trackEvent('create_goal', { scope: 'year' });
    } else if (scope === 'ym') {
      const s = loadMonthStateOrCreate(PLAN_YEAR, +el.dataset.month);
      s.monthlyGoals.push({ id: 'g' + Date.now(), text: '', kind: el.dataset.kind, done: false });
      saveMonthState(PLAN_YEAR, +el.dataset.month, s);
      invalidateYearCache();
      renderYear();
      trackEvent('create_goal', { scope: 'month' });
    } else {
      showGoalAdd(el.dataset.kind);
    }
  } else if (act === 'confirm-addgoal') {
    const input = document.querySelector(`[data-role="goal-add-input"][data-kind="${el.dataset.kind}"]`);
    if (input && addGoal(el.dataset.kind, input.value)) { input.value = ''; input.focus(); }
  } else if (act === 'delgoal') {
    const scope = el.dataset.scope;
    if (scope === 'w') {
      const w = state.weeks[+el.dataset.week - 1];
      w.goals.splice(+el.dataset.id, 1);
      renderWeek();
      save();
    } else if (scope === 'y') {
      yearState.goals = yearState.goals.filter((g) => g.id !== el.dataset.id);
      renderYear();
      saveYear();
    } else if (scope === 'ym') {
      const s = loadMonthStateOrCreate(PLAN_YEAR, +el.dataset.month);
      s.monthlyGoals = s.monthlyGoals.filter((g) => g.id !== el.dataset.id);
      saveMonthState(PLAN_YEAR, +el.dataset.month, s);
      invalidateYearCache();
      renderYear();
    } else {
      removeGoal(el.dataset.id);
    }
  } else if (act === 'editgoal' || act === 'edithabit') {
    beginInlineEdit(el);
  } else if (act === 'targetedit') {
    beginTargetEdit(el);
  } else if (act === 'addhabit') {
    const ni = document.querySelector('[data-role="habit-name-input"]');
    if (ni && addHabit(ni.value)) {
      const fresh = document.querySelector('[data-role="habit-name-input"]');
      if (fresh) { fresh.value = ''; fresh.focus(); }
    }
  } else if (act === 'delhabit') {
    removeHabit(el.dataset.id);
  } else if (act === 'copyhabits') {
    copyHabitsToNextMonth();
  } else if (act === 'search-toggle') {
    openSearchModal();
  } else if (act === 'search-close') {
    closeSearchModal();
  } else if (act === 'search-go') {
    goSearchResult(el);
  } else if (act === 'tagfilter') {
    tagFilter = el.dataset.tag || null;
    if (state.view === 'calendar') renderCalendar();
    else renderWeek();
  } else if (act === 'calendar-tagfilter') {
    const selectedTag = el.dataset.tag || '';
    if (!selectedTag) calendarTagFilters = [];
    else if (calendarTagFilters.includes(selectedTag)) calendarTagFilters = calendarTagFilters.filter((tag) => tag !== selectedTag);
    else calendarTagFilters = calendarTagFilters.concat(selectedTag);
    renderCalendar();
    window.TaskFlowUI.syncUrl({ view: 'calendar', year: PLAN_YEAR, month: PLAN_MONTH, tags: calendarTagFilters });
  } else if (act === 'tag-edit') {
    beginTagEdit(el);
  } else if (act === 'repeat-edit') {
    // Phase 7.1: mở select chọn tần suất lặp cho task (trước đây beginRepeatEdit
    // tồn tại nhưng KHÔNG được gọi — nút 🔁 không làm gì cả)
    beginRepeatEdit(el);
  } else if (act === 'template') {
    openTemplateModal();
  } else if (act === 'template-close') {
    closeTemplateModal();
  } else if (act === 'template-do') {
    copyMonthTemplate();
  } else if (act === 'pomo-toggle') {
    togglePomoPanel();
  } else if (act === 'pomo-start') {
    pomoStart();
  } else if (act === 'pomo-reset') {
    pomoReset();
  } else if (act === 'pomo-mode') {
    pomoSetMode(el.dataset.mode === 'break' ? 'break' : 'work');
  } else if (act === 'profile-open') {
    openProfileModal();
  } else if (act === 'profile-close') {
    closeProfileModal();
  } else if (act === 'pw-change') {
    doChangePassword();
  } else if (act === 'acct-delete') {
    doDeleteAccount();
  } else if (act === 'sync-toggle') {
    toggleSyncModal();
  } else if (act === 'sync-close') {
    closeSyncModal();
  } else if (act === 'report') {
    openReportModal();
  } else if (act === 'close-report') {
    closeReportModal();
  } else if (act === 'share-report') {
    doShareReport();
  } else if (act === 'week-report') {
    openWeekReportModal();
  } else if (act === 'close-week-report') {
    closeWeekReportModal();
  } else if (act === 'share-week-report') {
    doShareWeekReport();
  } else if (act === 'year-report') {
    openYearReportModal();
  } else if (act === 'close-year-report') {
    closeYearReportModal();
  } else if (act === 'share-year-report') {
    doShareYearReport();
  } else if (act === 'templates-toggle') {
    const tp = document.getElementById('templatesPop');
    if (tp) tp.hidden = !tp.hidden;
  } else if (act === 'template-add') {
    const name = el.dataset.name || '';
    if (name) { addHabit(name); trackEvent('template_habit_add'); }
  } else if (act === 'demo-data') {
    togglePop('dataPop');
    demoPlan();
    TaskFlowUI.toast(t('demoDataDone'), 'success');
  } else if (act === 'mood') {
    moodMap[el.dataset.dayKey] = +el.dataset.mood;
    saveMood();
    renderWeek();
  } else if (act === 'mood-pick') {
    openMoodPicker(+el.dataset.day);
  } else if (act === 'mood-set') {
    moodMap[moodDateKey(+el.dataset.day)] = +el.dataset.mood;
    saveMood();
    trackEvent('mood_set', { level: +el.dataset.mood });
    closeMoodPicker();
    rerenderMoodCard();
  } else if (act === 'mood-clear') {
    delete moodMap[moodDateKey(+el.dataset.day)];
    saveMood();
    trackEvent('mood_clear', { day: +el.dataset.day });
    closeMoodPicker();
    rerenderMoodCard();
  } else if (act === 'import-csv') {
    togglePop('dataPop');
    const fi = document.getElementById('importFile');
    if (fi) fi.click();
  } else if (act === 'sync-toggle-mode') {
    setSyncMode(syncMode === 'signup' ? 'login' : 'signup');
  } else if (act === 'sync-google') {
    doSyncGoogle();
  } else if (act === 'sync-logout') {
    doSyncLogout();
  } else if (act === 'theme') {
    setTheme(el.dataset.theme);
  } else if (act === 'dark') {
    toggleDark();
  } else if (act === 'lang') {
    setLang(LANG === 'vi' ? 'en' : 'vi');
  } else if (act === 'remind-toggle') {
    togglePop('remindPop');
  } else if (act === 'remind-on') {
    enableReminder();
    togglePop('remindPop');
  } else if (act === 'remind-off') {
    disableReminder();
    togglePop('remindPop');
  } else if (act === 'remind-habit' || act === 'remind-task') {
    beginRemindEdit(el);
  } else if (act === 'remind-off-item') {
    turnOffRemind(el);
  } else if (act === 'data-toggle') {
    togglePop('dataPop');
  } else if (act === 'export-json') {
    togglePop('dataPop');
    exportJSON();
  } else if (act === 'import-json') {
    togglePop('dataPop');
    const fi = document.getElementById('importFile');
    if (fi) fi.click();
  } else if (act === 'export-csv') {
    togglePop('dataPop');
    exportCSV();
  } else if (act === 'widget-settings') {
    openWidgetSettingsModal(el.dataset.view);
  } else if (act === 'widget-toggle') {
    const view = document.getElementById('widgetSettingsModal').dataset.widgetView;
    const config = initWidgetConfig(view);
    const w = config.find(function (c) { return c.id === el.dataset.widgetId; });
    if (w) { w.visible = !w.visible; saveWidgetConfig(view, config); renderWidgetSettingsModal(view); }
  } else if (act === 'widget-save') {
    closeWidgetSettingsModal();
    renderCurrentView();
  } else if (act === 'widget-close') {
    closeWidgetSettingsModal();
  } else if (act === 'print') {
    trackEvent('print');
    window.print();
  } else if (act === 'install-app') {
    const b = document.getElementById('btnInstall');
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choice) => {
        trackEvent('pwa_prompt', { outcome: choice.outcome });
        if (b) b.hidden = true;
        deferredPrompt = null;
      });
    }
  } else if (act === 'share-streak') {
    doShareStreak();
  } else if (act === 'ob-goal') {
    trackEvent('onboarding_goal');
    obDoGoal();
  } else if (act === 'ob-habits') {
    trackEvent('onboarding_habits');
    obDoHabits();
  } else if (act === 'ob-theme') {
    obDoTheme(e.target.dataset.theme);
  } else if (act === 'ob-done') {
    trackEvent('onboarding_done');
    obFinish();
  } else if (act === 'ob-skip') {
    trackEvent('onboarding_skip');
    obFinish();
  } else if (act === 'reset') {
    if (confirm(t('resetConfirm'))) {
      pushUndo(); // sau khi user xác nhận — undo sẽ khôi phục toàn bộ dữ liệu trước khi reset
      try {
        for (let m = 0; m < 12; m++) localStorage.removeItem('planner-' + PLAN_YEAR + '-' + (m + 1));
        localStorage.removeItem(LEGACY_KEY);
        localStorage.removeItem(yearKey());
      } catch (err) { /* ẩn */ }
      if (window.Sync && window.Sync.clearAll) window.Sync.clearAll();
      yearState = hasAccount() ? emptyYearState() : defaultYearState();
      state = hasAccount() ? emptyState() : defaultState();
      setView(state.view, state.currentWeek);
    }
  }
});

document.addEventListener('change', (e) => {
  const act = e.target.dataset && e.target.dataset.action;
  if (act === 'weekselect') goWeek(+e.target.value);
  else if (act === 'monthselect') openMonth(+e.target.value);
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'searchInput') renderSearchResults(t.value);
});

// Phase 5: bắt đầu phiên sửa text → snapshot trước để undo về đúng trạng thái trước khi gõ
document.addEventListener('focusin', (e) => {
  if (e.target.closest('[contenteditable="true"]')) pushUndo();
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.reflectQ) {
    const [scope, i] = t.dataset.reflectQ.split('-');
    saveRefQuestion(scope, +i, t.innerText);
  } else if (t.dataset.reflect) {
    const [scope, i] = t.dataset.reflect.split('-');
    if (scope.startsWith('yq')) {
      yearState.reflections['q' + scope[2]][+i] = t.innerText;
      saveYear();
    } else if (scope === 'yr') {
      yearState.reflections.year[+i] = t.innerText;
      saveYear();
    } else {
      if (scope === 'ov') state.reflections.overview[+i] = t.innerText;
      else state.reflections.weeks[+scope.replace('w', '') - 1][+i] = t.innerText;
      save();
    }
  } else if (t.dataset.ynote) {
    yearState.monthNotes[+t.dataset.ynote] = t.innerText;
    saveYear();
  } else if (t.dataset.note) {
    const [wn, di] = t.dataset.note.split('-');
    state.weeks[+wn - 1].days[+di].note = t.innerText;
    save();
  } else if (t.dataset.role === 'task-text') {
    state.weeks[+t.dataset.week - 1].days[+t.dataset.day].tasks[+t.dataset.task].text = t.innerText;
    save();
  } else if (t.dataset.role === 'w-goal-text') {
    state.weeks[+t.dataset.week - 1].goals[+t.dataset.id].text = t.innerText;
    save();
  } else if (t.dataset.role === 'y-goal-text') {
    const g = yearState.goals.find((x) => x.id === t.dataset.id);
    if (g) { g.text = t.innerText; saveYear(); }
  } else if (t.dataset.role === 'ym-goal-text') {
    const s = loadMonthStateOrCreate(PLAN_YEAR, +t.dataset.month);
    const g = s.monthlyGoals.find((x) => x.id === t.dataset.id);
    if (g) { g.text = t.innerText; saveMonthState(PLAN_YEAR, +t.dataset.month, s); invalidateYearCache(); }
  }
});

document.addEventListener('keydown', (e) => {
  // Phase 5 — phím tắt (chèn TRƯỚC guard để nhận cả tổ hợp Ctrl)
  const k = (e.key || '').toLowerCase();
  const inField = e.target.closest('input, [contenteditable="true"], textarea, select');
  if ((e.ctrlKey || e.metaKey) && !e.altKey && k === 'z') {
    // Trong ô nhập text, để trình duyệt tự undo text — không xử lý state
    if (inField) return;
    e.preventDefault();
    if (e.shiftKey) doRedo(); else doUndo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && k === 'k') {
    e.preventDefault();
    toggleSearchModal();
    return;
  }
  if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
  if (!inField) {
    const views = ['overview', 'week', 'year', 'calendar', 'week'];
    const idx = ['1', '2', '3', '4', '5'].indexOf(e.key);
    if (idx >= 0) {
      e.preventDefault();
      setView(views[idx], idx === 1 ? state.currentWeek : undefined);
      return;
    }
    if (e.key === '/' && state.view === 'week') {
      e.preventDefault();
      focusTodayTaskAdd();
      return;
    }
  }
  const inp = e.target.closest('[data-role="goal-add-input"]');
  if (inp && e.key === 'Enter') {
    e.preventDefault();
    const btn = document.querySelector(`[data-action="confirm-addgoal"][data-kind="${inp.dataset.kind}"]`);
    if (btn) btn.click();
    return;
  }
  const hInp = e.target.closest('.habit-add-row input');
  if (hInp && e.key === 'Enter') {
    e.preventDefault();
    const btn = document.querySelector('[data-action="addhabit"]');
    if (btn) btn.click();
    return;
  }
  const ed = e.target.closest('[contenteditable="true"]');
  if (ed && ed.dataset.singleline && e.key === 'Enter') {
    e.preventDefault();
    ed.blur();
    return;
  }
  const tab = e.target.closest('[data-nav-view]');
  if (!tab || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const nav = tab.closest('[role="tablist"]');
  const tabs = Array.from(nav ? nav.querySelectorAll('[data-nav-view]') : document.querySelectorAll('[data-nav-view]'));
  let i = tabs.indexOf(tab);
  if (e.key === 'ArrowRight') i = (i + 1) % tabs.length;
  else if (e.key === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length;
  else if (e.key === 'Home') i = 0;
  else i = tabs.length - 1;
  tabs[i].focus();
  tabs[i].click();
});

/* ============================ Cập nhật sau khi tích ============================ */

function afterGoalToggle(g) {
  const ms = monthlyStats();
  const cb = document.querySelector(`[data-action="goal"][data-id="${g.id}"]`);
  if (cb) {
    cb.setAttribute('aria-checked', g.done);
    const li = cb.closest('.goal-item');
    if (li) li.classList.toggle('done', g.done);
  }
  const tx = document.querySelector(`[data-role="goal-text"][data-id="${g.id}"]`);
  if (tx) tx.classList.toggle('done', g.done);
  const bp = document.querySelectorAll('[data-role="big-pct"]');
  bp.forEach((b) => { b.textContent = ms.pct + '%'; });
  const don = document.querySelector('[data-role="ov-donut"]');
  if (don) don.innerHTML = donutSVG(ms.pct, 140, 18, '#666854');
  const stats = document.querySelector('[data-role="ov-stats"]');
  if (stats) stats.innerHTML = `<td>${ms.done}</td><td>${ms.inProg}</td><td>${ms.total}</td>`;
  syncOverviewMetrics();
  syncOverviewFocus();
  save();
}

function afterYearGoalToggle() {
  const gs = yearGoalStats();
  document.querySelectorAll('[data-action="ygoal"]').forEach((cb) => {
    const g = yearState.goals.find((x) => x.id === cb.dataset.id);
    cb.setAttribute('aria-checked', g.done);
    const li = cb.closest('.goal-item');
    if (li) li.classList.toggle('done', g.done);
  });
  document.querySelectorAll('[data-role="y-goal-text"]').forEach((tx) => {
    const g = yearState.goals.find((x) => x.id === tx.dataset.id);
    tx.classList.toggle('done', g.done);
  });
  document.querySelectorAll('[data-role="year-big-pct"]').forEach((b) => { b.textContent = gs.pct + '%'; });
  const don = document.querySelector('[data-role="year-donut"]');
  if (don) don.innerHTML = donutSVG(gs.pct, 140, 18, '#666854');
  const stats = document.querySelector('[data-role="year-stats"]');
  if (stats) stats.innerHTML = `<td>${gs.done}</td><td>${gs.inProg}</td><td>${gs.total}</td>`;
  const yearSummaryGoals = document.querySelector('[data-role="year-summary-goals"]');
  if (yearSummaryGoals) yearSummaryGoals.textContent = gs.done + '/' + gs.total;
  const yearSummaryPct = document.querySelector('[data-role="year-summary-goals-pct"]');
  if (yearSummaryPct) yearSummaryPct.textContent = gs.pct + '%';
  saveYear();
}

function afterHabitToggle() {
  updateDigestCache();
  state.habits.forEach((h) => {
    const p = habitPct(h);
    document.querySelectorAll(`[data-action="habit"][data-id="${h.id}"]`).forEach((b) => {
      b.setAttribute('aria-checked', h.days[+b.dataset.day]);
    });
    const pc = document.querySelector(`[data-role="habit-pct"][data-id="${h.id}"]`);
    if (pc) pc.textContent = p + '%';
    const bar = document.querySelector(`[data-role="habit-bar"][data-id="${h.id}"]`);
    if (bar) bar.style.width = p + '%';
    const val = document.querySelector(`[data-role="habit-bar-val"][data-id="${h.id}"]`);
    if (val) val.textContent = p + '%';
  });
  for (let d = 0; d < NUM_DAYS; d++) {
    const m = document.querySelector(`[data-role="day-mini"][data-day="${d}"]`);
    if (m) m.style.height = Math.max(dayAggregate(d), 4) + '%';
  }
  refreshHeatCard();
  syncOverviewMetrics();
  save();
}

function afterWGoalToggle(w) {
  const st = weekStats(w);
  document.querySelectorAll('[data-role="w-badge"]').forEach((b) => { b.textContent = st.pct + '%'; });
  const fill = document.querySelector('[data-role="w-bar-fill"]');
  if (fill) fill.style.width = st.pct + '%';
  const wProgress = document.querySelector('[data-role="w-progress"]');
  if (wProgress) wProgress.setAttribute('aria-valuenow', String(st.pct));
  const don = document.querySelector('[data-role="w-donut"]');
  if (don) don.innerHTML = donutSVG(st.pct, 140, 18, '#F39A82');
  const stats = document.querySelector('[data-role="w-stats"]');
  if (stats) stats.innerHTML = `<td>${st.done}</td><td>${st.inProg}</td><td>${st.total}</td>`;
  w.goals.forEach((g, gi) => {
    const cb = document.querySelector(`[data-action="wgoal"][data-week="${w.n}"][data-id="${gi}"]`);
    if (cb) cb.setAttribute('aria-checked', g.done);
    const tx = document.querySelector(`[data-role="w-goal-text"][data-week="${w.n}"][data-id="${gi}"]`);
    if (tx) tx.classList.toggle('done', g.done);
  });
  save();
}

function refreshTaskUI(w, di) {
  const d = w.days[di];
  const p = dayPct(d);
  document.querySelectorAll(`[data-action="task"][data-week="${w.n}"][data-day="${di}"]`).forEach((b) => {
    b.setAttribute('aria-checked', d.tasks[+b.dataset.task].done);
  });
  const pctEl = document.querySelector(`.day-col-${di} [data-role="day-pct"]`);
  if (pctEl) pctEl.textContent = p + '%';
  const dayProgress = document.querySelector(`.day-col-${di} [data-role="day-progress"]`);
  if (dayProgress) dayProgress.setAttribute('aria-valuenow', String(p));
  const dayProgressFill = dayProgress && dayProgress.querySelector('[data-role="day-progress-fill"]');
  if (dayProgressFill) dayProgressFill.style.width = p + '%';
  // View Lịch: cập nhật % ngày trong ô calendar
  const calPct = document.querySelector(`[data-role="cal-pct"][data-week="${w.n}"][data-day="${di}"]`);
  if (calPct) calPct.textContent = calendarDayPct(d) + '%';
  document.querySelectorAll(`.cal-task[data-week="${w.n}"][data-day="${di}"]`).forEach((cell) => {
    const cb = cell.querySelector('[data-action="task"]');
    if (cb) cell.classList.toggle('done', d.tasks[+cb.dataset.task].done);
  });
}

/* ============================ Đồng bộ thời gian thực ============================ */

const fmtDate = (d) => d.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });

function isDayToday(d) {
  const now = new Date();
  return d.date === `${now.getDate()}/${now.getMonth() + 1}` && d.yy === now.getFullYear() % 100;
}

function nowInfo() {
  const now = new Date();
  const dayIdx = Math.floor((now - PLAN_START) / 86400000);
  const inRange = dayIdx >= 0 && dayIdx < NUM_DAYS;
  return {
    now,
    dayIdx,
    inRange,
    week: inRange ? Math.floor(dayIdx / 7) + 1 : null,
    dayInWeek: inRange ? dayIdx % 7 : null,
    habitCol: inRange ? dayIdx : -1,
  };
}

function renderClock() {
  const box = document.getElementById('nowText');
  if (!box) return;
  const n = new Date();
  box.textContent = fmtDate(n) + ' · ' + n.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

let lastDayKey = '';
let lastRealWeek = null;
let viewedMonth = null;

function refreshToday() {
  updateDigestCache();
  const now = new Date();
  if (viewedMonth !== null) {
    if (viewedMonth === now.getMonth() && PLAN_YEAR === now.getFullYear()) {
      viewedMonth = null;
      initPlan(now);
      state = bootState();
      updateBrand();
      updateNowBtn();
      buildNav();
      setView(state.view, state.currentWeek);
    }
    return;
  }
  const prevKey = monthKey();
  initPlan(now);
  const ti = nowInfo();
  const jump = state.view === 'week' && ti.inRange && ti.week !== state.currentWeek && state.currentWeek === lastRealWeek;
  lastRealWeek = ti.inRange ? ti.week : null;
  if (monthKey() !== prevKey) {
    state = bootState();
    updateBrand();
    updateNowBtn();
    buildNav();
    setView(state.view, state.currentWeek);
  } else {
    if (jump) state.currentWeek = ti.week;
    if (state.view === 'week') renderWeek();
    else if (state.view === 'overview') renderOverview();
    else if (state.view === 'calendar') renderCalendar();
    else renderYear();
    updateNav();
    save();
  }
}

function syncNow() {
  renderClock();
  const n = new Date();
  if (n.toDateString() !== lastDayKey) {
    lastDayKey = n.toDateString();
    refreshToday();
  }
}

setInterval(syncNow, 1000);

// Đồng bộ lại ngay khi quay lại tab (trình duyệt làm chậm timer khi tab ẩn)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncNow();
});
window.addEventListener('focus', syncNow);

/* ============================ Đồng bộ đám mây ============================ */

function syncStatusText(s) {
  switch (s) {
    case 'connecting': return t('syncStatusConnecting');
    case 'syncing': return t('syncStatusSyncing');
    case 'ready': return t('syncStatusReady');
    case 'signedout': return t('syncStatusSignedOut');
    case 'error': return t('syncStatusError');
    default: return t('syncStatusOff');
  }
}

function updateSyncStatus() {
  const st = document.getElementById('syncStatus');
  if (!st) return;
  const s = (window.Sync && window.Sync.getStatus) ? window.Sync.getStatus() : 'off';
  st.textContent = syncStatusText(s);
  st.dataset.status = s;
  const dot = document.getElementById('syncDot');
  if (dot) dot.dataset.status = s;
  const btn = document.getElementById('syncBtn');
  if (btn) {
    btn.dataset.status = s;
    btn.title = t('syncTitle') + ' - ' + syncStatusText(s);
  }
  const lo = document.getElementById('syncLogoutBtn');
  if (lo) lo.hidden = (s !== 'ready' && s !== 'syncing' && s !== 'connecting');
  const pf = document.getElementById('syncProfileBtn');
  if (pf) pf.hidden = lo ? lo.hidden : true;
}

function toggleSyncModal() {
  const m = document.getElementById('syncModal');
  if (!m) return;
  if (m.hidden) {
    setSyncMode('login');
    updateSyncStatus();
    clearFormErrors(m);
    TaskFlowUI.openDialog('syncModal');
  } else closeSyncModal();
}

function closeSyncModal() {
  TaskFlowUI.closeDialog('syncModal');
}

document.addEventListener('click', (e) => {
  const m = document.getElementById('syncModal');
  if (m && !m.hidden && e.target === m) closeSyncModal();
  const r = document.getElementById('reportModal');
  if (r && !r.hidden && e.target === r) closeReportModal();
  const wr = document.getElementById('weekReportModal');
  if (wr && !wr.hidden && e.target === wr) closeWeekReportModal();
  const yr = document.getElementById('yearReportModal');
  if (yr && !yr.hidden && e.target === yr) closeYearReportModal();
  const s = document.getElementById('searchModal');
  if (s && !s.hidden && e.target === s) closeSearchModal();
  const t = document.getElementById('templateModal');
  if (t && !t.hidden && e.target === t) closeTemplateModal();
  const p = document.getElementById('profileModal');
  if (p && !p.hidden && e.target === p) closeProfileModal();
  const bm = document.getElementById('backupModal');
  if (bm && !bm.hidden && e.target === bm) closeBackupModal();
  const help = document.getElementById('helpModal');
  if (help && !help.hidden && e.target === help) TaskFlowUI.closeDialog('helpModal');
  const widget = document.getElementById('widgetSettingsModal');
  if (widget && !widget.hidden && e.target === widget) closeWidgetSettingsModal();
  const focus = document.getElementById('focusOverlay');
  if (focus && !focus.hidden && e.target === focus) closeFocusMode();
});

function syncFormValues() {
  const us = document.getElementById('syncUser');
  const pw = document.getElementById('syncPass');
  const pw2 = document.getElementById('syncPass2');
  return { user: us ? us.value.trim() : '', pass: pw ? pw.value : '', pass2: pw2 ? pw2.value : '' };
}

let syncMode = 'login';

function setSyncMode(mode) {
  syncMode = mode === 'signup' ? 'signup' : 'login';
  const pass2 = document.getElementById('syncPass2');
  const submit = document.querySelector('#syncForm button[type="submit"]');
  const toggle = document.querySelector('[data-action="sync-toggle-mode"]');
  if (pass2) pass2.hidden = syncMode !== 'signup';
  if (submit) submit.textContent = syncMode === 'signup' ? t('syncSignup') : t('syncLogin');
  if (toggle) toggle.textContent = syncMode === 'signup' ? t('syncHaveAccount') : t('syncNoAccount');
  const ph = { syncUser: 'syncUserPh', syncPass: 'syncPassPh', syncPass2: 'syncPass2Ph' };
  Object.keys(ph).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.placeholder = t(ph[id]);
  });
  clearFormErrors(document.getElementById('syncModal'));
}

const USER_RE = /^[A-Za-z0-9_.-]{3,30}$/;

function syncErrorText(code) {
  switch (code) {
    case 'username-taken': return t('syncErrUsernameTaken');
    case 'bad-credentials': return t('syncErrBadCredentials');
    case 'network': return t('syncErrNetwork');
    case 'no-config': return t('syncNeedConfig');
    case 'too-many-requests': return t('syncErrRateLimited');
    default: return t('syncErrServer');
  }
}

async function doSyncSignup() {
  if (!window.Sync) return;
  const { user, pass, pass2 } = syncFormValues();
  clearFormErrors(document.getElementById('syncModal'));
  let firstInvalid = null;
  if (!user) firstInvalid = setFieldError('syncUser', t('syncNeedUser'));
  else if (!USER_RE.test(user)) firstInvalid = setFieldError('syncUser', t('syncUserInvalid'));
  if (!pass) firstInvalid = firstInvalid || setFieldError('syncPass', t('syncNeedUser'));
  else if (pass.length < 6) firstInvalid = firstInvalid || setFieldError('syncPass', t('syncPassShort'));
  if (pass !== pass2) firstInvalid = firstInvalid || setFieldError('syncPass2', t('syncPassMismatch'));
  if (firstInvalid) { firstInvalid.focus(); return; }
  const r = await window.Sync.signup(user, pass);
  updateSyncStatus();
  if (r && r.ok) {
    trackEvent('signup');
    TaskFlowUI.toast(t('syncSignupOk'), 'success');
    closeSyncModal();
    // Dữ liệu local đã được làm sạch → reload để app khởi động lại với dữ liệu mới của tài khoản vừa tạo
    location.reload();
  } else {
    const target = r && r.error === 'username-taken' ? 'syncUser' : 'syncPass';
    setFieldError(target, syncErrorText(r && r.error)).focus();
  }
}

async function doSyncLogin() {
  if (!window.Sync) return;
  const { user, pass } = syncFormValues();
  clearFormErrors(document.getElementById('syncModal'));
  let firstInvalid = null;
  if (!user) firstInvalid = setFieldError('syncUser', t('syncNeedUser'));
  if (!pass) firstInvalid = firstInvalid || setFieldError('syncPass', t('syncNeedUser'));
  if (firstInvalid) { firstInvalid.focus(); return; }
  const r = await window.Sync.login(user, pass);
  updateSyncStatus();
  if (r && r.ok) {
    trackEvent('login');
    TaskFlowUI.toast(t('syncStatusReady'), 'success');
    closeSyncModal();
    // Tài khoản mới/khác = dữ liệu mới: localStorage đã được xoá + pull remote,
    // boot lại state để KHÔNG còn hiển thị (và vô tình lưu) dữ liệu của tài khoản cũ
    rebootState();
  } else {
    setFieldError('syncPass', syncErrorText(r && r.error)).focus();
    // Lỗi mạng khi pull: token đã đổi + local đã bị xoá nhưng chưa kéo được dữ liệu.
    // Vẫn reboot để UI khớp với local trống — tránh save() vô tình đẩy dữ liệu tài khoản cũ
    if (r && r.error === 'pull-failed') rebootState();
  }
}

async function doSyncGoogle() {
  if (!window.Sync) return;
  const s = window.Sync.getStatus();
  if (s === 'off') { TaskFlowUI.toast(t('syncNeedConfig'), 'error'); return; }
  const r = await window.Sync.loginWithGoogle();
  if (!(r && r.ok)) TaskFlowUI.toast(t('syncGoogleErr'), 'error');
  else {
    TaskFlowUI.toast(t('syncStatusReady'), 'success');
    closeSyncModal();
  }
}

function doSyncLogout() {
  if (window.Sync) { window.Sync.logout(); updateSyncStatus(); }
}

function handleSyncChange(keys) {
  // Đã có dữ liệu remote mới được ghi vào localStorage — áp dụng ngay vào giao diện.
  // QUAN TRỌNG: nạp lại state tháng/năm TRƯỚC khi gọi setLang() — vì setLang() kết thúc bằng
  // save() ghi biến global `state`; nếu state vẫn là bản cũ (rỗng), save() sẽ đè mất dữ liệu
  // remote vừa pull từ pullAll và đẩy dữ liệu cũ lên server.
  const cur = monthKey();
  const yk = yearKey();
  const monthHit = keys.indexOf(cur) >= 0;
  const yearHit = keys.indexOf(yk) >= 0;
  if (yearHit) { yearState = bootYearState(); invalidateYearCache(); }
  if (monthHit) { state = bootState(); }
  if (monthHit || yearHit) {
    setView(state.view, state.currentWeek);
    updateNav();
  }
  // Áp dụng ngôn ngữ/chủ đề sau khi đã nạp lại state (an toàn với save() bên trong setLang)
  if (keys.indexOf('planner-lang') >= 0) {
    const l = localStorage.getItem('planner-lang');
    if (l && l !== LANG) setLang(l);
  }
  if (keys.indexOf('planner-theme') >= 0) {
    const th = localStorage.getItem('planner-theme');
    if (th && th !== THEME) setTheme(th);
  }
  if (keys.indexOf('planner-mood') >= 0) {
    loadMood();
    if (state.view === 'week') renderWeek();
    else if (state.view === 'overview') renderOverview();
  }
  updateSyncStatus();
}

/* ============================ Onboarding 3 bước (lần dùng đầu) ============================ */

const ONBOARD_KEY = 'planner-onboarded';
let obStep = 1;

function obHasAnyData() {
  try {
    if (localStorage.getItem(monthKey())) return true;
    if (localStorage.getItem(yearKey())) return true;
  } catch (e) { /* ẩn */ }
  return false;
}

function obNeeded() {
  try {
    if (localStorage.getItem(ONBOARD_KEY)) return false;
    return true; // chưa từng thấy onboarding
  } catch (e) { return false; }
}

function obGoStep(n) {
  obStep = n;
  document.querySelectorAll('.ob-step').forEach((el) => { el.hidden = +el.dataset.obStep !== n; });
  document.querySelectorAll('.ob-dot').forEach((el) => { el.classList.toggle('active', +el.dataset.obDot <= n); });
  const focus = n === 1 ? 'obGoalInput' : n === 2 ? 'obHabit1' : null;
  const el = focus && document.getElementById(focus);
  if (el) el.focus();
}

function startOnboarding() {
  const m = document.getElementById('onboardModal');
  if (!m) return;
  const chips = document.getElementById('obGoalChips');
  if (chips) {
    chips.innerHTML = [1, 2, 3, 4].map((i) =>
      `<button type="button" class="ob-chip" data-sugg="${i}">${t('obSugg' + i)}</button>`).join('');
    chips.querySelectorAll('.ob-chip').forEach((b) => {
      b.addEventListener('click', () => {
        const inp = document.getElementById('obGoalInput');
        if (inp) { inp.value = b.textContent.trim(); inp.focus(); }
      });
    });
  }
  const ph = { obGoalInput: 'obGoalPh', obHabit1: 'obHabitPh1', obHabit2: 'obHabitPh2' };
  Object.keys(ph).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.placeholder = t(ph[id]);
  });
  obGoStep(1);
  TaskFlowUI.openDialog('onboardModal');
}

function obFinish() {
  try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) { /* ẩn */ }
  TaskFlowUI.closeDialog('onboardModal');
  setView(state.view, state.currentWeek);
}

function obDoGoal() {
  const inp = document.getElementById('obGoalInput');
  const text = (inp ? inp.value.trim() : '');
  if (text) {
    yearState.goals[0] = { id: 'yg0', text: text, kind: 'priority', done: false };
    invalidateYearCache();
    saveYear();
  }
  obGoStep(2);
}

function obDoHabits() {
  const names = [1, 2].map((i) => {
    const el = document.getElementById('obHabit' + i);
    return el ? el.value.trim() : '';
  }).filter(Boolean);
  if (names.length) {
    names.forEach((name, i) => {
      state.habits.unshift({ id: 'oh' + Date.now() + i, name: name, target: 100, days: Array(NUM_DAYS).fill(false) });
    });
    save();
  }
  obGoStep(3);
}

function obDoTheme(th) { setTheme(th); }

function maybeStartOnboarding() {
  if (!obNeeded()) return;
  // Người dùng đã có dữ liệu (đang dùng thật) → không hiện onboarding, chỉ đánh dấu.
  if (obHasAnyData()) { try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) { /* ẩn */ } return; }
  startOnboarding();
}

/* ============================ Khởi động ============================ */

const ti0 = nowInfo();
if (ti0.inRange) {
  state.currentWeek = ti0.week;
  // Không tự nhảy view — mở app ở view đã chọn (mặc định Overview có landing hero)
}
lastRealWeek = ti0.inRange ? ti0.week : null;
lastDayKey = ti0.now.toDateString();
// QUAN TRỌNG: quyết định onboarding TRƯỚC khi bất kỳ save() nào chạy
// (setView() dưới đây gọi save() → sẽ ghi default state, làm "có dữ liệu")
maybeStartOnboarding();

// Consume and remove the OAuth credential before setView() can replace the URL.
// Reload without rendering so stale data from the previous account is never saved back.
const googleSwitched = window.Sync ? window.Sync.consumeRedirectToken() : false;
if (googleSwitched) rebootState(false);

/* ---------- Deep link từ manifest shortcuts (?view=, ?m=YYYY-M, ?w=N) ---------- */
if (window.DeepLink) {
  const dl = window.DeepLink.parse(location.href);
  if (dl.year !== null && dl.month !== null) {
    initPlan(new Date(dl.year, dl.month, 1));
    state = bootState();
    const nowD = new Date();
    viewedMonth = (dl.year === nowD.getFullYear() && dl.month === nowD.getMonth()) ? null : dl.month;
    updateBrand();
    updateNowBtn();
  }
  if (dl.view) state.view = dl.view;
  if (dl.view === 'week' && dl.week !== null && dl.week <= NUM_WEEKS) state.currentWeek = dl.week;
  if (dl.view === 'calendar' && Array.isArray(dl.tags)) calendarTagFilters = dl.tags;
}

setTheme(THEME);
applyDark();
applyStaticI18N();
updateBrand();
updateNowBtn();
renderClock();
buildNav();
updateUndoButtons();
loadMood();
setView(state.view, state.currentWeek);
setTimeout(updateDigestCache, 2000);


/* ---------- Khởi động đồng bộ đám mây (backend Render) ---------- */
if (window.Sync) {
  // OAuth state was consumed and reloaded before the first render above.
  window.Sync.onStatus(updateSyncStatus);
  window.Sync.onRemoteChange(handleSyncChange);
  const f = document.getElementById('syncForm');
  if (f) f.addEventListener('submit', (e) => {
    e.preventDefault();
    if (syncMode === 'signup') doSyncSignup();
    else doSyncLogin();
  });
  setSyncMode('login');
  updateSyncStatus();
  window.Sync.init();
}

/* ---------- Khởi động phụ trợ (PWA, Analytics, Nhắc việc, Import) ---------- */

initAnalytics();
registerSW();
setInterval(checkDailyReminder, 30000);
if (getRemindTime()) registerPeriodicReminder();
setTimeout(syncReminderTimers, 1000);

const importFileInput = document.getElementById('importFile');
if (importFileInput) {
  importFileInput.addEventListener('change', () => {
    const f = importFileInput.files && importFileInput.files[0];
    if (!f) return;
    if (/\.csv$/i.test(f.name)) importCSVFile(f);
    else importJSONFile(f);
  });
}
