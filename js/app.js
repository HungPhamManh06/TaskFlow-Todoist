'use strict';

/* ============================ Lazy-load modules (P1.5) ============================ */
// chat/search/quick-add/year-report/digest chỉ cần khi mở feature tương ứng — không
// nằm trong chuỗi script boot ở app.html (P11 extractions 21-26). ensureLazyModule nạp
// đúng 1 lần (cache theo URL); runLazyModule gọi fn sau khi nạp xong, fail loud nếu lỗi
// mạng. URL không có ?v= để khớp precache trong sw.js (offline vẫn dùng được feature).
const _lazyScripts = new Map();
function ensureLazyModule(url) {
  if (_lazyScripts.has(url)) return _lazyScripts.get(url);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { _lazyScripts.delete(url); reject(new Error('lazy module failed to load: ' + url)); };
    document.head.appendChild(s);
  });
  _lazyScripts.set(url, p);
  return p;
}
function runLazyModule(url, fn) {
  ensureLazyModule(url).then(fn).catch((err) => {
    console.error(err);
    if (window.TaskFlowUI && TaskFlowUI.toast) TaskFlowUI.toast('Không thể tải module — kiểm tra kết nối', 'error');
  });
}

// HABIT_DEFS/GOAL_DEFS/WEEK_PATTERNS/REFLECT_PROMPTS_MONTH/REFLECT_PROMPTS_WEEK được
// tách sang js/config.js (window.TaskFlowConfig) — P11 extraction 29. DAYS là dead
// code (day names thuộc js/i18n.js) — xoá luôn. Giữ alias để call-sites không đổi.
if (!window.TaskFlowConfig) throw new Error('TaskFlowConfig missing — js/config.js failed to load');
const { HABIT_DEFS, GOAL_DEFS, WEEK_PATTERNS, REFLECT_PROMPTS_MONTH, REFLECT_PROMPTS_WEEK } = window.TaskFlowConfig;

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

// monthKey/updateBrand/buildMonthNav được tách sang js/shell.js (window.TaskFlowShell) —
// đổi signature: monthKey(py, pm) + updateBrand(py, pm) + buildMonthNav(py, pm) nhận tham số.
// Destructure phải TRƯỚC top-level `state = bootState()` (defaultState/loadState dùng monthKey).
if (!window.TaskFlowShell) throw new Error('TaskFlowShell missing — js/shell.js failed to load');
const { monthKey, updateBrand, buildMonthNav } = window.TaskFlowShell;
/* ============================ Kế hoạch năm ============================ */

function yearKey() {
  return 'planner-year-' + PLAN_YEAR;
}

const YEAR_REFLECT_PROMPTS = () => [t('rm0'), t('rm1'), t('rm2'), t('rm3')];
const QUARTER_REFLECT_PROMPTS = () => [t('rm0'), t('rm1'), t('rm2'), t('rq3')];

// account & gamification core (hasAccount, year state, badges) được tách
// sang js/account.js (window.TaskFlowAccount). Giữ alias để call-sites không đổi.
if (!window.TaskFlowAccount) throw new Error('TaskFlowAccount missing — js/account.js failed to load');
const { BADGES_KEY, hasAccount, defaultYearState, emptyYearState, loadBadges, saveBadges } = window.TaskFlowAccount;

const MONTH_FRUITS = ['🍎', '🍎', '🍋', '🍎', '🍎', '🍋', '🍎', '🍎', '🍋', '🍎', '🍎', '🍋'];

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
    if (!s.reflections || typeof s.reflections !== 'object') s.reflections = defaultYearState(PLAN_YEAR).reflections;
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

// monthPctOf/monthGoalsOf được tách sang js/goals.js (window.TaskFlowGoals) —
// đổi signature: monthPctOf(y, m, defaultMonthPct) + monthGoalsOf(y, m, GOAL_DEFS);
// hasAccount access qua globalThis.TaskFlowAccount trong module.
if (!window.TaskFlowGoals) throw new Error('TaskFlowGoals missing — js/goals.js failed to load');
const { monthPctOf, monthGoalsOf } = window.TaskFlowGoals;

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
          goals: rawStates[m] ? md.goals : monthGoalsOf(PLAN_YEAR, m, GOAL_DEFS),
        }));
    } else {
      yearMonthlyCache = Array.from({ length: 12 }, (_, m) => ({
        pct: monthPctOf(PLAN_YEAR, m, defaultMonthPct),
        goals: monthGoalsOf(PLAN_YEAR, m, GOAL_DEFS),
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
      const source = JSON.parse(raw);
      const parsed = window.TaskFlowDataMigrations
        ? window.TaskFlowDataMigrations.migrateMonthState(source, { year: y, month: m + 1 })
        : source;
      if (window.TaskFlowDataMigrations && source.schemaVersion !== window.TaskFlowDataMigrations.VERSION) {
        try { localStorage.setItem('planner-' + y + '-' + (m + 1), JSON.stringify(parsed)); } catch (e) { /* read still succeeds */ }
      }
      // P0.3: xoá task truly-empty legacy trong state tháng (nếu có weeks) — ghi trực tiếp
      // theo convention boot-migration, idempotent, không tạo sync loop.
      const cleaned = window.TaskFlowDataMigrations
        ? window.TaskFlowDataMigrations.cleanupTrulyEmptyTasks(parsed)
        : { state: parsed, removed: 0 };
      if (cleaned.removed > 0) {
        try { localStorage.setItem('planner-' + y + '-' + (m + 1), JSON.stringify(cleaned.state)); } catch (e) { /* read still succeeds */ }
      }
      if (cleaned.state && Array.isArray(cleaned.state.monthlyGoals)) s = cleaned.state;
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
  // Migration additive (P2): đảm bảo pillars tồn tại trước khi trả về cho UI
  // (tháng cũ không có pillars → điền template mặc định theo ngôn ngữ hiện tại).
  if (window.TaskFlowPillars) window.TaskFlowPillars.ensurePillars(s);
  if (window.TaskFlowMonthlyReview) window.TaskFlowMonthlyReview.ensureMonthlyReview(s);
  return s;
}

// storage core (saveMonthState, monthStateRaw, pomo log, backup key) được tách
// sang js/storage.js (window.TaskFlowStorage). Giữ alias để call-sites không đổi.
if (!window.TaskFlowStorage) throw new Error('TaskFlowStorage missing — js/storage.js failed to load');
const { POMO_LOG_KEY, monthStateRaw, saveMonthState, loadPomoLog, savePomoLog, backupSlotKey } = window.TaskFlowStorage;

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
    monthGoalsOf(y, m, GOAL_DEFS).forEach((g) => {
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

/* ============================ Tiện ích (tách js/util.js — P11) ============================ */

// Các helper thuần (esc, localISODate, formatFocusTime, lineChartSVG) được tách sang
// js/util.js (window.TaskFlowUtil). Giữ alias để call-sites trong file này không đổi.
if (!window.TaskFlowUtil) throw new Error('js/util.js failed to load — app cannot boot');
const { esc, localISODate, formatFocusTime, lineChartSVG } = window.TaskFlowUtil;

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

// widget config (widgetConfigKey, initWidgetConfig, saveWidgetConfig, getVisibleWidgets) + bootstrap
// glue (setLang, setTheme, prefersReducedMotion, registerSW) được tách sang js/widget.js
// (window.TaskFlowWidget, extraction 31 — R4+R5). Deps (WIDGET_DEFS_*, t, state, THEME/THEMES,
// monthlyStats/yearGoalStats, setLangCore/applyStaticI18N, render/save/buildNav/...) resolve qua
// global lexical tại thời điểm GỌI — pattern mood.js/popups.js. Giữ alias để call-sites không đổi.
if (!window.TaskFlowWidget) throw new Error('TaskFlowWidget missing — js/widget.js failed to load');
const { widgetConfigKey, initWidgetConfig, saveWidgetConfig, getVisibleWidgets, setLang, setTheme, prefersReducedMotion, registerSW } = window.TaskFlowWidget;

// i18n core (I18N dictionary, LANG state, t(), label helpers, applyStaticI18N) được tách
// sang js/i18n.js (window.TaskFlowI18N). Giữ alias để call-sites không đổi.
if (!window.TaskFlowI18N) throw new Error('TaskFlowI18N missing — js/i18n.js failed to load');
const { I18N, t, monthLabel, dayLabel, fmtDeadline, dateLocale, getLang, setLangCore, applyStaticI18N } = window.TaskFlowI18N;
// nowInfo/renderClock tách sang js/clock.js (window.TaskFlowClock) — destructure
// phải TRƯỚC top-level `state = bootState()` (gọi loadState → nowInfo).
if (!window.TaskFlowClock) throw new Error('TaskFlowClock missing — js/clock.js failed to load');
const { nowInfo, renderClock } = window.TaskFlowClock;

/* ============================ Chủ đề màu ============================ */

let THEME = 'cream';
try { THEME = localStorage.getItem('planner-theme') || 'cream'; } catch (e) { /* ẩn */ }
const THEMES = ['cream', 'mint', 'lavender', 'peach'];
if (!THEMES.includes(THEME)) THEME = 'cream';

/* ============ Chế độ tối (dark mode) ============ */
let DARK = null; // null = theo hệ thống (prefers-color-scheme)
try { DARK = localStorage.getItem('planner-dark'); } catch (e) { /* ẩn */ }
DARK = DARK === '1' ? true : DARK === '0' ? false : null;

// dark mode helpers (systemPrefersDark, darkIsOn, applyDark, toggleDark) được tách
// sang js/theme.js (window.TaskFlowTheme). darkIsOn/applyDark/toggleDark nhận `dark`
// tham số thay vì đọc DARK global — call-sites truyền DARK.
if (!window.TaskFlowTheme) throw new Error('TaskFlowTheme missing — js/theme.js failed to load');
const { systemPrefersDark, darkIsOn, applyDark, toggleDark } = window.TaskFlowTheme;

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (DARK === null) applyDark(DARK);
  });
}

/* ============================ Analytics (GA4) ============================ */

// 👉 Link Google Form nhận góp ý (Giai đoạn 5 — Feedback):
// Tạo form tại https://forms.google.com rồi dán link dạng .../viewform vào đây
const FB_FORM_URL = '';
// 👉 Email nhận góp ý (dự phòng khi chưa có form)
const FB_EMAIL = '';

// analytics helpers (GA4_ID, GA4_ENABLED, initAnalytics, trackEvent) được tách
// sang js/analytics.js (window.TaskFlowAnalytics). Giữ alias — signature không đổi,
// 82 call-sites trackEvent giữ nguyên.
if (!window.TaskFlowAnalytics) throw new Error('TaskFlowAnalytics missing — js/analytics.js failed to load');
const { GA4_ID, GA4_ENABLED, initAnalytics, trackEvent } = window.TaskFlowAnalytics;

/* ============================ PWA ============================ */

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

// reminder helpers (getRemindTime, setRemindTime, requestRemindPermission,
// registerPeriodicReminder) được tách sang js/remind.js (window.TaskFlowRemind).
// Giữ alias — signature không đổi, call-sites giữ nguyên.
if (!window.TaskFlowRemind) throw new Error('TaskFlowRemind missing — js/remind.js failed to load');
const { getRemindTime, setRemindTime, requestRemindPermission, registerPeriodicReminder } = window.TaskFlowRemind;

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
  new Notification('TaskFlow 🐥', {
    body: t('remindBody'),
    icon: './icons/icon-192.png',
    tag: 'daily-reminder',
  });
}

/* ---------- Nhắc việc theo habit/task (Phase 4) ---------- */

// Nhắc việc theo habit/task (scheduleItemReminder/syncReminderTimers/renderRemindList/
// insertBeforeTaskActions/beginRemindEdit/turnOffRemind, itemRemindTimers nội bộ) được
// tách sang js/remind-ui.js (window.TaskFlowRemindUI) — P11 extraction 27.
// insertBeforeTaskActions dùng CHUNG với beginRepeatEdit/beginTagEdit (app.js) — có
// trong destructure. scheduleItemReminder không có call-site app.js (gọi nội bộ).
if (!window.TaskFlowRemindUI) throw new Error('TaskFlowRemindUI missing — js/remind-ui.js failed to load');
const { syncReminderTimers, renderRemindList, insertBeforeTaskActions, beginRemindEdit, turnOffRemind } = window.TaskFlowRemindUI;

/* ---------- Phase 6T: Adaptive Planning UI helpers ---------- */

function _updateAdaptiveToggleUI() {
  try {
    if (!window.TaskFlowAIAdaptation) return;
    const enabled = window.TaskFlowAIAdaptation.isEnabled();
    const label = document.getElementById('adaptiveToggleLabel');
    if (label) label.textContent = enabled ? t('adaptiveEnabled') : t('adaptiveDisabled');
    const btn = document.getElementById('adaptiveToggleBtn');
    if (btn) btn.setAttribute('aria-pressed', String(enabled));
  } catch (e) { /* silent */ }
}

function _showAdaptivePatterns() {
  try {
    const content = document.getElementById('adaptivePatternsContent');
    if (!content) return;
    if (!window.TaskFlowAIAdaptation) { content.innerHTML = '<p>' + esc(t('notEnoughData')) + '</p>'; TaskFlowUI.openDialog('adaptivePatternsModal'); return; }
    const hints = window.TaskFlowAIAdaptation.buildAdaptiveHints();
    if (!hints || Object.keys(hints).length === 0) {
      content.innerHTML = '<p class="adaptive-empty">' + esc(t('notEnoughData')) + '</p>';
      TaskFlowUI.openDialog('adaptivePatternsModal');
      return;
    }
    let html = '';
    const confidenceLabel = (c) => { if (c === 'high') return t('highConfidence'); if (c === 'medium') return t('mediumConfidence'); return t('lowConfidence'); };
    if (hints.focusDuration && hints.focusDuration.suggestedMinutes) {
      html += '<div class="adaptive-pattern-item"><strong>' + esc(t('typicalFocusDuration')) + '</strong> '
        + esc(String(hints.focusDuration.suggestedMinutes)) + ' min '
        + '<span class="adaptive-meta">' + esc(confidenceLabel(hints.focusDuration.confidence)) + ' · '
        + esc(String(hints.focusDuration.samples)) + ' ' + esc(t('samples')) + '</span></div>';
    }
    if (hints.focusWindow && hints.focusWindow.start) {
      html += '<div class="adaptive-pattern-item"><strong>' + esc(t('productiveTime')) + '</strong> '
        + esc(String(hints.focusWindow.start)) + '–' + esc(String(hints.focusWindow.end)) + ' '
        + '<span class="adaptive-meta">' + esc(confidenceLabel(hints.focusWindow.confidence)) + ' · '
        + esc(String(hints.focusWindow.samples)) + ' ' + esc(t('samples')) + '</span></div>';
    }
    if (hints.weekdayPatterns && hints.weekdayPatterns.productiveDays) {
      html += '<div class="adaptive-pattern-item"><strong>' + esc(t('productiveDays')) + '</strong> '
        + esc(hints.weekdayPatterns.productiveDays.join(', ')) + ' '
        + '<span class="adaptive-meta">' + esc(confidenceLabel(hints.weekdayPatterns.confidence)) + '</span></div>';
    }
    if (hints.durationCalibration && hints.durationCalibration.suggestedMinutes) {
      html += '<div class="adaptive-pattern-item"><strong>' + esc(t('durationCalibration')) + '</strong> '
        + esc(String(hints.durationCalibration.suggestedMinutes)) + ' min '
        + '<span class="adaptive-meta">' + esc(confidenceLabel(hints.durationCalibration.confidence)) + ' · '
        + esc(String(hints.durationCalibration.samples)) + ' ' + esc(t('samples')) + '</span></div>';
    }
    content.innerHTML = html || '<p class="adaptive-empty">' + esc(t('notEnoughData')) + '</p>';
    TaskFlowUI.openDialog('adaptivePatternsModal');
  } catch (e) { /* adaptive view must never break app */ }
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
  insertBeforeTaskActions(btn, wrap);
  sel.focus();
}

/* ---------- Phase 7.1: Tự sinh task lặp lại ---------- */

function applyRecurrence() {
  // Lỗi cũ: scan "alreadyExists" quét cả ngày quá khứ (gồm chính task đang xét) → luôn
  // true → không bao giờ sinh; giờ chuyển logic thuần sang PlanMath.planRecurrence
  // (chỉ so sánh với task từ hôm nay trở đi) và push bản sao vào ĐÚNG ngày hôm nay.
  const ti = nowInfo(PLAN_START, NUM_DAYS, PLAN_YEAR, PLAN_MONTH);
  if (!ti.inRange || !window.PlanMath || !window.PlanMath.planRecurrence) return 0; // hôm nay ngoài kỳ kế hoạch → không có chỗ sinh
  const todayDay = state.weeks[ti.week - 1] && state.weeks[ti.week - 1].days[ti.dayInWeek];
  if (!todayDay) return 0;
  const plan = window.PlanMath.planRecurrence(state.weeks, ti.dayIdx);
  plan.mark.forEach((t) => { t._recurred = true; });
  plan.copies.forEach((c) => { c.uid = newTaskUid(); c.linkedMetricIds = []; todayDay.tasks.push(c); });
  return plan.copies.length;
}

// Chuẩn bị DỮ LIỆU ô hôm nay một lần, idempotent, KHÔNG phụ thuộc view đang mở:
// materialize task lặp đến hạn (recurrence) + dồn task lặp bị lỡ (carry-over).
// Gọi tại các mốc data lifecycle: boot, đổi ngày (refreshToday), đổi tháng, đổi tài
// khoản/sync-load. KHÔNG gọi từ render — renderWeek/renderToday chỉ ĐỌC state.
// Trả về true nếu dữ liệu thay đổi (đã save).
function prepareTodayState() {
  let changed = false;
  if (applyRecurrence() > 0) { changed = true; save(); }
  if (carryOverRepeatTasks()) changed = true; // tự save nếu có bản dồn
  return changed;
}

/* ============================ Xuất / Nhập dữ liệu ============================ */

// export helpers + CSV/ICS builders (csvRow, exportCSV, icsEscape, icsDayFromDay,
// exportICS, legacyCSVRows) được tách sang js/export.js (window.TaskFlowExport,
// extraction 30/R8). collectAllData/exportJSON nhận LEGACY_KEY tham số — downloadFile
// giữ signature. Giữ alias để call-sites không đổi.
if (!window.TaskFlowExport) throw new Error('TaskFlowExport missing — js/export.js failed to load');
const { downloadFile, collectAllData, prepareImport, applySnapshotTransactional, exportJSON, exportCSV, exportICS } = window.TaskFlowExport;

function importJSONFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const prepared = prepareImport(reader.result);
      if (!prepared.ok) {
        const messageKey = prepared.errors.includes('unsupported-version') ? 'importFutureError' : 'importError';
        TaskFlowUI.toast(t(messageKey), 'error');
        return;
      }
      const preview = prepared.preview;
      if (!confirm(t('importConfirm', { n: preview.keyCount, from: preview.fromVersion, to: preview.toVersion }))) return;
      // Phase 5: chốt bản sao lưu dữ liệu hiện tại trước khi ghi đè (an toàn dữ liệu).
      // Snapshot lấy ĐỒNG BỘ ngay trước khi ghi đè rồi ghi slot bất đồng bộ qua module lazy.
      let importSnapshot = null;
      try { importSnapshot = collectAllData(LEGACY_KEY); } catch (e) { throw new Error('backup-capture-failed'); }
      await ensureLazyModule('js/backup.min.js');
      if (!window.TaskFlowBackup.rotateBackup(importSnapshot)) throw new Error('backup-write-failed');
      const applied = applySnapshotTransactional(prepared.snapshot, localStorage);
      if (!applied.ok) throw applied.error || new Error('import-write-failed');
      TaskFlowUI.toast(t('importOk'), 'success');
      trackEvent('import_json', { version: prepared.snapshot.version, keys: preview.keyCount });
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

// confettiBurst/templatesPopHTML/demoPlan/seedHabitDays/seedTasks + HABIT_TEMPLATES
// được tách sang js/popups.js (window.TaskFlowPopups) — P11 extraction 28.
// Module resolve prefersReducedMotion/t/esc/getLang/nowInfo/PLAN_*/NUM_DAYS/state/
// newTaskUid/renderCurrentView/save/trackEvent/habitDaysElapsed qua global lexical
// tại thời điểm GỌI — pattern mood.js. Giữ alias để call-sites không đổi.
if (!window.TaskFlowPopups) throw new Error('TaskFlowPopups missing — js/popups.js failed to load');
const { confettiBurst, templatesPopHTML, demoPlan, seedHabitDays, seedTasks } = window.TaskFlowPopups;


/* ============================ Phase 6: Thói quen mẫu, Demo, Mood, Báo cáo năm, Import CSV ============================ */


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

// Mood tracker (loadMood/saveMood/moodCardHTML/openMoodPicker/closeMoodPicker/
// rerenderMoodCard) được tách sang js/mood.js (window.TaskFlowMood) — P11 extraction 24.
// MOOD_KEY/MOODS/moodMap vẫn ở app.js (dispatcher mood-*, day-view, undo snapshot đọc
// trực tiếp); module resolve qua global lexical lúc gọi. Giữ alias để call-sites không đổi.
if (!window.TaskFlowMood) throw new Error('TaskFlowMood missing — js/mood.js failed to load');
const { loadMood, saveMood, moodCardHTML, openMoodPicker, closeMoodPicker, rerenderMoodCard } = window.TaskFlowMood;
// Daily Reflection (P1) — module js/reflection.js (window.TaskFlowReflection).
// Giữ alias để call-sites không đổi: loadReflections gọi ở boot, dispatcher
// reflection-* gọi qua window.TaskFlowReflection (pattern mood.js/backup.js).
if (!window.TaskFlowReflection) throw new Error('TaskFlowReflection missing — js/reflection.js failed to load');
const { loadReflections } = window.TaskFlowReflection;
// Weekly Review (P6) — module thuần, lưu additive trong month state và giữ
// state.reflections.weeks cũ làm ghi chú legacy chỉ đọc.
if (!window.TaskFlowWeeklyReview) throw new Error('TaskFlowWeeklyReview missing — js/weekly-review.js failed to load');
const {
  emptyReview, ensureWeeklyReviews, buildWeeklyReviewModel, weeklyReviewHTML,
  updateReviewField, setSaveStatus: setWeeklyReviewSaveStatus, scheduleSavedStatus,
} = window.TaskFlowWeeklyReview;
// Monthly Review (P7) — additive month-state reflection composed by report-ui.js.
if (!window.TaskFlowMonthlyReview) throw new Error('TaskFlowMonthlyReview missing — js/monthly-review.js failed to load');
const {
  emptyMonthlyReview, ensureMonthlyReview, updateMonthlyReviewField,
  setMonthlyReviewStatus, scheduleMonthlyReviewSaved,
} = window.TaskFlowMonthlyReview;
// P8 — explicit, previewed carry-over of planning structures into next month.
if (!window.TaskFlowMonthCarryover) throw new Error('TaskFlowMonthCarryover missing — js/month-carryover.js failed to load');
const {
  nextMonth: nextCarryMonth, normalizeCarrySelection, buildCarryPreview,
  applyCarryover, carryDialogHTML,
} = window.TaskFlowMonthCarryover;
if (!window.TaskFlowReflectionHistory) throw new Error('TaskFlowReflectionHistory missing — js/reflection-history.js failed to load');
const { collectReflectionHistory, reflectionHistoryHTML } = window.TaskFlowReflectionHistory;
// Monthly Life Pillars (P2) — module js/pillars.js (window.TaskFlowPillars). Module
// thuần: nhận state qua tham số; dispatcher + input listener gọi qua
// window.TaskFlowPillars (pattern reflection.js). defaultState/emptyState/loadState/
// loadMonthStateOrCreate/save() gọi defaultTemplate/ensurePillars để migration additive
// (dữ liệu tháng cũ không có pillars → tự điền template 3 trụ cột theo ngôn ngữ hiện tại).
if (!window.TaskFlowPillars) throw new Error('TaskFlowPillars missing — js/pillars.js failed to load');
const { visiblePillars, normalizeTaskMetricIds, setTaskMetricIds } = window.TaskFlowPillars;

// Projects & Milestones (V1.1) — js/projects.js (store) + js/projects-ui.js (render).
// Store riêng ở 'planner-projects'; task linkage là field optional (projectId/milestoneId).
// Module thuần: app.js orchestrate (nav, dispatcher, save, undo); UI đọc store qua tham số.
if (!window.TaskFlowProjects) throw new Error('TaskFlowProjects missing — js/projects.js failed to load');
if (!window.TaskFlowProjectsUI) throw new Error('TaskFlowProjectsUI missing — js/projects-ui.js failed to load');
const ProjectsStore = window.TaskFlowProjects;
const ProjectsUI = window.TaskFlowProjectsUI;
let projectsFilter = 'active'; // filter mặc định trên trang Projects

// Contexts & task planning metadata (V1.2.1) — js/contexts.js (store + helpers).
// task.estimatedMinutes map tới task.duration có sẵn; energy/contexts là field optional
// (đọc thiếu như null/[]). Context manager + chip toggle đều đi qua app.js dispatcher.
if (!window.TaskFlowContexts) throw new Error('TaskFlowContexts missing — js/contexts.js failed to load');
const Contexts = window.TaskFlowContexts;

// Smart Daily Planner (V1.3) — js/planner-rules.js (thuần) + js/planner-ui.js (render).
// Rule-based, NO AI. CRITICAL: proposal → preview → Apply. Không sửa data trước Apply.
if (!window.TaskFlowPlannerRules) throw new Error('TaskFlowPlannerRules missing — js/planner-rules.js failed to load');
if (!window.TaskFlowPlannerUI) throw new Error('TaskFlowPlannerUI missing — js/planner-ui.js failed to load');
const PlannerRules = window.TaskFlowPlannerRules;
const PlannerUI = window.TaskFlowPlannerUI;
if (!window.TaskFlowTimeBlocksUI) throw new Error('TaskFlowTimeBlocksUI missing — js/timeblocks-ui.js failed to load');
const TimeBlocksUI = window.TaskFlowTimeBlocksUI;

// V1.2 Phase 2 — Calendar view mode: 'month' (lưới tháng cũ) | 'schedule' (timeline theo ngày).
// State thuần UI, không lưu vào month state (không phải dữ liệu planner).
let calendarMode = 'month';
let calendarSelDate = ''; // 'YYYY-MM-DD' — ngày đang chọn trong Schedule view
let calendarUnscheduledExpanded = false;

function loadTimeBlocksStore() {
  return window.TaskFlowTimeBlocks.loadTimeBlocks();
}
function saveTimeBlocksStore(store) {
  window.TaskFlowTimeBlocks.saveTimeBlocks(store);
}

function loadContextsStore() {
  return Contexts.loadContexts();
}
function saveContextsStore(store) {
  Contexts.saveContexts(store);
}

// Load store projects (migrate mỗi lần). Caller save qua ProjectsStore.saveProjects.
function loadProjectsStore() {
  return ProjectsStore.loadProjects();
}
function saveProjectsStore(store) {
  ProjectsStore.saveProjects(store);
}
function renderProjectsView() {
  renderProjectsViewWith(loadProjectsStore(), projectsFilter, null);
}
function renderProjectsViewWith(store, filter, openId) {
  ProjectsUI.renderProjects(store, filter, openId);
}

// Mở dialog edit project (null = thêm mới).
function openProjectEditModal(projectId) {
  const store = loadProjectsStore();
  const content = document.getElementById('projectEditContent');
  if (content) content.innerHTML = ProjectsUI.projectEditForm(store, projectId);
  TaskFlowUI.openDialog('projectEditModal');
  const input = document.querySelector('[data-role="project-name"]');
  if (input) setTimeout(() => input.focus(), 30);
}

// Mở dialog edit milestone (milestoneId null = thêm mới trong project).
function openMilestoneEditModal(projectId, milestoneId) {
  const store = loadProjectsStore();
  const content = document.getElementById('milestoneEditContent');
  if (content) content.innerHTML = ProjectsUI.milestoneEditForm(store, projectId, milestoneId);
  TaskFlowUI.openDialog('milestoneEditModal');
  const input = document.querySelector('[data-role="milestone-name"]');
  if (input) setTimeout(() => input.focus(), 30);
}

// ---- Context manager (V1.2.1) ----
// Form quản lý bối cảnh: danh sách context (rename inline + delete) + row thêm mới.
function contextEditFormHTML() {
  const store = loadContextsStore();
  const list = Array.isArray(store.contexts) && store.contexts.length
    ? store.contexts.map((c) => `<div class="ctx-edit-row">
        <span class="ctx-edit-dot" aria-hidden="true"></span>
        <input type="text" class="ctx-edit-name" data-action="ctx-name" data-ctx="${esc(c.id)}" value="${esc(c.label)}" maxlength="40" aria-label="${t('taskDetailContext')}">
        <button type="button" class="btn-del" data-action="ctx-delete" data-ctx="${esc(c.id)}" aria-label="${t('ctxDeleteAria')}" title="${t('ctxDeleteAria')}">${window.TaskFlowUI.icon('trash')}</button>
      </div>`).join('')
    : `<p class="td-empty">${t('ctxNoContexts')}</p>`;
  return `<div class="ctx-edit-list" data-role="ctx-list">${list}</div>
    <span class="td-add-row"><input type="text" data-role="ctx-add-input" placeholder="${t('ctxNamePh')}" maxlength="40" aria-label="${t('ctxAddAria')}"><button type="button" class="td-add-btn" data-action="ctx-add" aria-label="${t('ctxAddAria')}">${window.TaskFlowUI.icon('plus')}</button></span>`;
}

function renderContextEditContent() {
  const content = document.getElementById('contextEditContent');
  if (content) content.innerHTML = contextEditFormHTML();
}

function openContextEditModal() {
  renderContextEditContent();
  TaskFlowUI.openDialog('contextEditModal');
  const input = document.querySelector('[data-role="ctx-add-input"]');
  if (input) setTimeout(() => input.focus(), 30);
}

/* ---------- V1.3 — Smart Daily Planner (rule-based, NO AI) ---------- */

// Lấy task hôm nay (chưa done) từ state.weeks để đưa vào planner.
// Dùng resolver canonical — cùng ô với Today/Week (không tự suy lại công thức).
function todayPlannerTasks() {
  const cell = window.TaskFlowClock.resolveTodayCell({
    planStart: PLAN_START, numDays: NUM_DAYS, year: PLAN_YEAR, month: PLAN_MONTH, weeks: state.weeks,
  });
  if (!cell.inPlanMonth || !cell.day || !Array.isArray(cell.day.tasks)) return [];
  return cell.day.tasks.map((tk, i) => ({ ...tk, _week: cell.weekNumber, _day: cell.dayIndex, _idx: i }));
}

// Mode của planner modal: 'rule' (mặc định) | 'ai' (AI preview đang chủ động).
// Khi mode=ai: ẩn rule planner content + footer — ĐÚNG MỘT Apply CTA.
function setPlannerMode(mode) {
  const modal = document.getElementById('plannerModal');
  if (!modal) return;
  const isAi = mode === 'ai';
  modal.dataset.planMode = isAi ? 'ai' : 'rule';
  const content = document.getElementById('plannerContent');
  const footer = modal.querySelector('.planner-actions');
  if (content) content.hidden = isAi;
  if (footer) footer.hidden = isAi;
}

// Mở dialog planner: thu thập input → buildProposal (thuần) → render preview.
// KHÔNG sửa data. Apply là hành động riêng (planner-apply).
function openPlannerModal() {
  const todayTasks = todayPlannerTasks();
  if (!todayTasks.length) {
    TaskFlowUI.toast(t('plannerNoTasks'), 'info');
    return;
  }
  const blocks = loadTimeBlocksStore();
  const today = PlannerUI.todayStr();
  const todayBlocks = window.TaskFlowTimeBlocks.blocksForDate(blocks, today);
  const projects = loadProjectsStore();
  const gcalBusy = gcalBusyToday(today);
  const proposal = PlannerRules.buildProposal({
    now: new Date(),
    tasks: todayTasks.map(({ _week, _day, _idx, ...tk }) => tk),
    blocks: todayBlocks.concat(gcalBusy),
    projects,
    availableMinutes: PlannerUI.DEFAULT_AVAIL_HOURS * 60,
  });
  window._lastPlannerProposal = proposal;
  const content = document.getElementById('plannerContent');
  if (content) content.innerHTML = PlannerUI.plannerContentHTML(proposal);
  renderAiPanel();
  setPlannerMode('rule');
  TaskFlowUI.openDialog('plannerModal');
  trackEvent('planner_open');
}

// ---- V2.0 — AI Copilot (optional). AI đề xuất; user bấm Apply; mọi ghi state qua API chuẩn. ----

// plan_day (P8 latency): chỉ task hôm nay — tránh gửi cả tháng + inbox lên Gemini.
function aiTodayTasks() {
  const seen = new Set();
  const out = [];
  todayPlannerTasks().forEach((tk) => { if (tk && tk.uid && !seen.has(tk.uid)) { seen.add(tk.uid); out.push(tk); } });
  return out;
}

// Danh sách task duy nhất theo uid: hôm nay + cả tháng + inbox.
function aiCollectTasks() {
  const seen = new Set();
  const out = [];
  const push = (tk) => { if (tk && tk.uid && !seen.has(tk.uid)) { seen.add(tk.uid); out.push(tk); } };
  todayPlannerTasks().forEach(push);
  (state.weeks || []).forEach((w) => (w.days || []).forEach((d) => (d.tasks || []).forEach(push)));
  (Array.isArray(inbox) ? inbox : []).forEach(push);
  return out;
}

// Việc quá hạn (deadline < hôm nay, chưa done). deterministic, không đọc Reflection.
function aiCollectOverdue() {
  const now = new Date();
  const today = PlannerUI.todayStr();
  const seen = new Set();
  const out = [];
  aiCollectTasks().forEach((tk) => {
    if (tk.done || !tk.deadline || seen.has(tk.uid)) return;
    if (String(tk.deadline) < today) {
      seen.add(tk.uid);
      const dd = PlannerRules.dayDelta(new Date(String(tk.deadline) + 'T00:00:00'), now);
      out.push({ ...tk, daysOverdue: dd < 0 ? -dd : 1 });
    }
  });
  return out;
}

// Reflection hiện có → [{date, text}] (chỉ khi user opt-in — mặc định tắt).
function aiCollectReflections() {
  const out = [];
  const today = PlannerUI.todayStr();
  try {
    if (Array.isArray(state.reflections.weeks)) {
      state.reflections.weeks.forEach((wk, wi) => {
        if (!Array.isArray(wk)) return;
        wk.forEach((txt, di) => {
          if (!txt || !String(txt).trim()) return;
          const dayIdx = wi * 7 + di;
          const d = new Date(PLAN_START.getFullYear(), PLAN_START.getMonth(), 1 + (dayIdx - (PLAN_START.getDay() + 6) % 7));
          out.push({ date: PlannerRules.dateStr(d), text: String(txt).slice(0, 300) });
        });
      });
    }
    if (Array.isArray(state.reflections.overview)) {
      state.reflections.overview.forEach((txt) => {
        if (txt && String(txt).trim()) out.push({ date: today, text: String(txt).slice(0, 300) });
      });
    }
  } catch (e) { /* bỏ qua an toàn */ }
  return out.slice(0, 12);
}

// Context tối thiểu cho AI theo kind. KHÔNG bao giờ gửi toàn bộ localStorage.
function aiBuildContext(kind, extra) {
  const AI = window.TaskFlowAI;
  const x = extra || {};
  const consent = AI.getConsent();
  const projectsStore = loadProjectsStore();
  const allProjects = Array.isArray(projectsStore.projects) ? projectsStore.projects : [];
  const allMilestones = [];
  allProjects.forEach((p) => (Array.isArray(p.milestones) ? p.milestones : []).forEach((m) => allMilestones.push({ ...m, projectId: p.id })));
  const blocks = loadTimeBlocksStore();
  const allBlocks = Array.isArray(blocks.blocks) ? blocks.blocks : [];
  const today = PlannerUI.todayStr();
  const weekStart = PlannerRules.dateStr(PLAN_START);
  const weekEnd = PlannerRules.dateStr(new Date(PLAN_START.getFullYear(), PLAN_START.getMonth(), 1 + NUM_DAYS - 1));

  // Busy windows từ Google Calendar (read-only) — planner chỉ được ĐỌC, không gửi ngược.
  const busy = [];
  if (window.TaskFlowGCal) {
    try {
      const cache = window.TaskFlowGCal.loadCache();
      const from = kind === 'plan_day' ? today : weekStart;
      const to = kind === 'plan_day' ? today : weekEnd;
      const startD = TimeBlocksUI.parseISO(from);
      const endD = TimeBlocksUI.parseISO(to);
      for (let d = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
        d.getTime() <= endD.getTime();
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        const dayStr = TimeBlocksUI.iso(d);
        (window.TaskFlowGCal.eventsForDate(cache.events, dayStr) || []).forEach((e) => {
          busy.push({ start: e.startMs ? new Date(e.startMs).toISOString() : '', end: e.endMs ? new Date(e.endMs).toISOString() : '' });
        });
      }
    } catch (e) { /* offline → không có busy */ }
  }

  return AI.buildContext({
    kind,
    lang: getLang(),
    today,
    weekStart,
    weekEnd,
    selectedProjectId: x.selectedProjectId || '',
    selectedMilestoneId: x.selectedMilestoneId || '',
    tasks: kind === 'plan_day' ? aiTodayTasks() : aiCollectTasks(),
    projects: allProjects,
    milestones: allMilestones,
    timeblocks: kind === 'plan_day' ? allBlocks.filter((b) => b.date === today) : allBlocks,
    habits: Array.isArray(state.habits) ? state.habits.map((h) => ({ name: h.name, target: h.target || 100 })) : [],
    busy,
    overdue: aiCollectOverdue(),
    allowSensitive: !!(consent.reflections || consent.mood),
    reflections: consent.reflections ? aiCollectReflections() : [],
    mood: consent.mood ? Object.entries(moodMap || {}).map(([date, value]) => ({ date, value })) : [],
  });
}

function renderAiPanel() {
  const host = document.getElementById('plannerAi');
  const AI = window.TaskFlowAI;
  if (!host || !AI) return;
  const projectsStore = loadProjectsStore();
  const allProjects = Array.isArray(projectsStore.projects) ? projectsStore.projects : [];
  const allMilestones = [];
  allProjects.forEach((p) => (Array.isArray(p.milestones) ? p.milestones : []).forEach((m) => allMilestones.push({ ...m, projectId: p.id })));
  host.innerHTML = AI.panelHTML(allProjects, allMilestones);
  delete window._lastAiProposal;
}

let _aiRequestGen = 0;
let _aiAbortCtrl = null;
let _aiDraft = null; // Phase 6T.2: cloned proposal draft for user edits
let _aiEditActive = false; // Phase 6T.2: whether edit mode is active

async function aiRun() {
  const AI = window.TaskFlowAI;
  if (!AI) return;
  const debugLog = typeof location !== 'undefined' && /[?&]debug=1/.test(location.search);
  const panel = document.querySelector('#plannerAi [data-role="ai-panel"]');
  if (!panel) return;
  const kindSel = panel.querySelector('[data-role="ai-kind"]');
  const kind = kindSel ? kindSel.value : 'plan_day';
  const consentPatch = {};
  panel.querySelectorAll('[data-ai-consent]').forEach((cb) => { consentPatch[cb.dataset.aiConsent] = cb.checked; });
  AI.setConsent(consentPatch);
  const projSel = panel.querySelector('[data-role="ai-project"]');
  const mileSel = panel.querySelector('[data-role="ai-milestone"]');
  const context = aiBuildContext(kind, {
    selectedProjectId: projSel ? projSel.value : '',
    selectedMilestoneId: mileSel ? mileSel.value : '',
  });
  const runBtn = panel.querySelector('[data-action="ai-run"]');
  const resultHost = panel.querySelector('[data-role="ai-result"]');
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = t('aiRunning'); }
  if (resultHost) resultHost.innerHTML = '<p class="ai-loading">' + esc(t('aiPreparing')) + '</p>';
  // Phase 6T.2: Reset edit state for new request
  _aiDraft = null;
  _aiEditActive = false;
  // Stale response protection: increment generation
  const gen = ++_aiRequestGen;
  // Cancel previous in-flight request
  if (_aiAbortCtrl) { try { _aiAbortCtrl.abort(); } catch (e) { /* ignore */ } }
  _aiAbortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const res = await AI.callPlanner(context, _aiAbortCtrl ? _aiAbortCtrl.signal : undefined);
  // Stale response: if generation changed, discard this response
  if (gen !== _aiRequestGen) return;
  _aiAbortCtrl = null;
  if (runBtn) { runBtn.disabled = false; runBtn.textContent = t('aiRun'); }
  if (!resultHost) return;
  if (!res.ok) {
    const Review = (typeof window !== 'undefined' && window.TaskFlowAIReview) || null;
    const errMsg = Review ? Review.friendlyError(res.error, getLang()) : esc(t('aiError'));
    const fallbackNote = t('aiFallbackNote');
    if (debugLog) console.warn('[ai] plan rejected:', res.error, res.details);
    resultHost.innerHTML = `<p class="ai-error">${esc(errMsg)}</p><p class="ai-fallback-note">${esc(fallbackNote)}</p><button type="button" class="button button-ghost button-sm" data-action="ai-retry">${t('aiRetry')}</button>`;
    return;
  }
  const refs = { taskUids: new Set(context.tasks.concat(context.overdue).map((tk) => tk.uid)) };
  const v = AI.validateProposalLocal(res.proposal, refs);
  if (!v.ok) {
    if (debugLog) console.warn('[ai] client validation failed:', v.errors);
    const Review = (typeof window !== 'undefined' && window.TaskFlowAIReview) || null;
    const errMsg = Review ? Review.friendlyError('ai-invalid-response', getLang()) : esc(t('aiInvalidOutput'));
    resultHost.innerHTML = `<p class="ai-error">${esc(errMsg)}</p><p class="ai-fallback-note">${esc(t('aiFallbackNote'))}</p>`; return;
  }
  const warnings = AI.conflictCheck(res.proposal, context.timeblocks, context.busy);
  window._lastAiProposal = { proposal: res.proposal, refs };
  // Phase 6T.2: Clone proposal as editable draft (original remains immutable)
  _aiDraft = JSON.parse(JSON.stringify(res.proposal));
  _aiEditActive = false;
  const taskLabels = {};
  context.tasks.concat(context.overdue).forEach((tk) => {
    if (tk && tk.uid && !taskLabels[tk.uid] && typeof tk.text === 'string' && tk.text.trim()) taskLabels[tk.uid] = tk.text;
  });
  // Phase 6T.1: Build context usage for Data Used section
  let contextUsage = [];
  try {
    const Explain = (typeof window !== 'undefined' && window.TaskFlowAIExplainability) || null;
    if (Explain) contextUsage = Explain.buildContextUsageSummary(context, {});
  } catch (e) { /* optional */ }
  resultHost.innerHTML = AI.previewHTML(res.proposal, warnings, {
    taskLabels,
    today: PlannerUI.todayStr(),
    lang: getLang(),
    canonical: context,
    context: context,
    contextUsage: contextUsage,
  });
  try {
    const fbBar = resultHost.querySelector('[data-role="ai-feedback"]');
    if (fbBar) fbBar.hidden = false;
  } catch (e) { /* feedback bar is optional */ }
  setPlannerMode('ai');
  trackEvent('ai_preview');
}

// Apply: CHỈ chạy khi user bấm Apply. Ghi state qua API chuẩn (TimeBlock store + move helpers).
// P7: guard đồng bộ chống double-click — một cú click = tối đa một lần Apply.
let aiApplying = false;
function aiApply() {
  const AI = window.TaskFlowAI;
  const last = window._lastAiProposal;
  if (!AI || !last || aiApplying) return;
  // Phase 6T.2: Use edited draft if available, otherwise original proposal
  const proposalToApply = _aiDraft || last.proposal;
  // Phase 6T.2: Preflight — revalidate all referenced tasks exist
  const refs = last.refs || {};
  const taskUids = refs.taskUids || new Set();
  const preflightMissing = [];
  if (proposalToApply && Array.isArray(proposalToApply.actions)) {
    proposalToApply.actions.forEach((a) => {
      if (a && a.taskUid && a.type !== 'next_action' && !taskUids.has(a.taskUid)) {
        preflightMissing.push(a.taskUid);
      }
    });
  }
  if (preflightMissing.length > 0) {
    TaskFlowUI.toast(t('aiSkipNote', { n: preflightMissing.length }), 'warning');
    return;
  }
  // Phase 6T.2: Revalidate the proposal before applying
  const v = AI.validateProposalLocal(proposalToApply, refs);
  if (!v.ok) {
    const Review = (typeof window !== 'undefined' && window.TaskFlowAIReview) || null;
    const errMsg = Review ? Review.friendlyError('ai-validation-failed', getLang()) : t('aiInvalidOutput');
    TaskFlowUI.toast(errMsg, 'error');
    return;
  }
  aiApplying = true;
  const proposalSnapshot = JSON.parse(JSON.stringify(proposalToApply));
  try {
    // Phase 6T.1: Push undo BEFORE mutations so Apply → Undo works
    pushUndo();
    const result = AI.applyProposal(proposalSnapshot, {
      findTask: (uid) => !!findPlannerTaskByUid(uid),
      createBlock: (payload) => {
        const store = loadTimeBlocksStore();
        window.TaskFlowTimeBlocks.createTimeBlock(store, {
          taskUid: payload.taskUid, date: payload.date, start: payload.start, end: payload.end, status: 'planned',
        });
        saveTimeBlocksStore(store);
      },
      moveToDay: (uid, option) => { const ref = findPlannerTaskByUid(uid); if (ref) movePlannerTaskToDay(ref, option); },
      moveToInbox: (uid) => { const ref = findPlannerTaskByUid(uid); if (ref) movePlannerTaskToInbox(ref); },
    });
    save();
    renderCurrentView();
    TaskFlowUI.closeDialog('plannerModal');
    delete window._lastAiProposal;
    _aiDraft = null;
    _aiEditActive = false;
    const skip = result.skipped && result.skipped.length ? ' ' + t('aiSkipNote', { n: result.skipped.length }) : '';
    const count = (result.created || 0) + (result.rescheduled || 0);
    const undoHint = count > 0 ? ' · ' + t('undoHint') : '';
    TaskFlowUI.toast(t('aiApplied') + skip + undoHint, 'success');
    trackEvent('ai_apply');
  } finally {
    aiApplying = false;
  }
}

// Áp dụng kế hoạch: tạo TimeBlock cho task đã chọn + dời việc quá hạn theo lựa chọn.
// CHỈ chạy khi user bấm Apply. Undo không phủ (theo precedent projects/timeblocks).
function applyPlannerPlan() {
  const proposal = window._lastPlannerProposal;
  const content = document.getElementById('plannerModal');
  if (!proposal || !content) return;
  const selections = PlannerUI.readSelections(content);
  const plan = PlannerUI.buildApplyPlan(proposal, selections);

  // 1) Tạo TimeBlock cho task đã chọn (nếu proposal gợi ý giờ).
  let blockStore = loadTimeBlocksStore();
  if (Array.isArray(plan.blocks) && plan.blocks.length) {
    const today = PlannerUI.todayStr();
    plan.blocks.forEach((b) => {
      window.TaskFlowTimeBlocks.createTimeBlock(blockStore, {
        taskUid: b.taskUid,
        date: today,
        start: b.start,
        end: b.end,
        status: 'planned',
      });
    });
    saveTimeBlocksStore(blockStore);
  }

  // 2) Dời việc quá hạn theo lựa chọn (tomorrow / this-week / inbox).
  if (Array.isArray(plan.reschedule) && plan.reschedule.length) {
    plan.reschedule.forEach((r) => {
      const o = proposal.overdue && proposal.overdue[r.idx];
      if (!o || !o.uid) return;
      const taskRef = findPlannerTaskByUid(o.uid);
      if (!taskRef) return; // không tìm thấy (tháng khác / đã xoá) → bỏ qua an toàn
      if (r.option === 'inbox') {
        movePlannerTaskToInbox(taskRef);
      } else if (r.option === 'tomorrow' || r.option === 'this-week') {
        movePlannerTaskToDay(taskRef, r.option);
      }
    });
  }

  save();
  renderCurrentView();
  TaskFlowUI.closeDialog('plannerModal');
  delete window._lastPlannerProposal;
  trackEvent('planner_apply');
  TaskFlowUI.toast(t('plannerApplied'), 'success');
}

// ---- V1.2 Phase 2 — Time Block dialog (Schedule view + Task Detail) ----

// Lưu id block đang edit (null = thêm mới). Dùng cho save từ dialog.
let _tbEditId = null;

function openTimeBlockModal({ blockId, date, taskUid, durationMinutes } = {}) {
  const blocks = loadTimeBlocksStore();
  const block = blockId ? window.TaskFlowTimeBlocks.getBlock(blocks, blockId) : null;
  _tbEditId = blockId || null;
  const d = (block && block.date) || date || localTodayIso();
  const content = document.getElementById('timeBlockContent');
  if (content) {
    content.innerHTML = TimeBlocksUI.blockDialogHTML({
      block,
      date: d,
      state,
      inbox,
      planStart: PLAN_START,
      // Quick Schedule: đề xuất end = start + duration (chỉ block mới, user sửa được).
      durationMinutes: block ? null : durationMinutes,
    });
  }
  TaskFlowUI.openDialog('timeBlockModal');
  const title = document.getElementById('timeBlockDialogTitle');
  if (title) title.textContent = block ? t('tbEditTitle') : t('tbAddTitle');
  const taskSel = content && content.querySelector('[data-role="tb-task"]');
  if (taskSel && taskUid && !block) {
    // Pre-select task mới (từ Task Detail) — option tồn tại vì taskUid thuộc ngày/inbox.
    const opt = Array.from(taskSel.options).find((o) => o.value === taskUid);
    if (opt) taskSel.value = taskUid;
  }
  setTimeout(() => {
    const first = content && content.querySelector('select[data-role="tb-task"], input[data-role="tb-date"]');
    if (first) first.focus();
  }, 30);
  trackEvent('tb_open');
}

function closeTimeBlockModal() {
  TaskFlowUI.closeDialog('timeBlockModal');
  _tbEditId = null;
}

// Đọc dialog → validate (end > start, không âm) → create/update qua API chuẩn.
function saveTimeBlockDialog() {
  const content = document.getElementById('timeBlockContent');
  if (!content) return;
  const v = TimeBlocksUI.readBlockDialog(content);
  const warn = content.querySelector('[data-role="tb-warn"]');
  if (!v.date || !v.start || !v.end) {
    if (warn) { warn.textContent = t('tbInvalid'); warn.hidden = false; }
    return;
  }
  const blocks = loadTimeBlocksStore();
  const ok = window.TaskFlowTimeBlocks.validRange(v.start, v.end);
  if (!ok) {
    if (warn) { warn.textContent = t('tbRangeError'); warn.hidden = false; }
    return;
  }
  if (_tbEditId) {
    // V1.6C (push-only): nếu block đã export và giờ thay đổi → cập nhật event Google.
    const prev = window.TaskFlowTimeBlocks.getBlock(blocks, _tbEditId);
    const updated = window.TaskFlowTimeBlocks.updateTimeBlock(blocks, _tbEditId, {
      taskUid: v.taskUid || null,
      date: v.date,
      start: v.start,
      end: v.end,
      status: v.status,
    });
    if (updated && prev && window.TaskFlowGCal && window.TaskFlowGCal.mappingForBlock(updated.id)) {
      const timeChanged = updated.date !== prev.date || updated.start !== prev.start || updated.end !== prev.end;
      if (timeChanged) propagateTimeBlockUpdate(updated);
    }
  } else {
    window.TaskFlowTimeBlocks.createTimeBlock(blocks, {
      taskUid: v.taskUid || null,
      date: v.date,
      start: v.start,
      end: v.end,
      status: v.status,
    });
  }
  saveTimeBlocksStore(blocks);
  TaskFlowUI.closeDialog('timeBlockModal');
  _tbEditId = null;
  if (calendarMode === 'schedule') renderCalendarSchedule();
  if (taskDetailRef && getTaskDetailTarget()) renderTaskDetail();
  TaskFlowUI.toast(t('tbSaved'), 'success');
  trackEvent('tb_save');
}

function deleteTimeBlockById(blockId) {
  const blocks = loadTimeBlocksStore();
  const g = window.TaskFlowGCal;
  const mapped = g && g.mappingForBlock(blockId);
  window.TaskFlowTimeBlocks.deleteTimeBlock(blocks, blockId);
  saveTimeBlocksStore(blocks);
  // V1.6C (push-only): block đã export → bỏ mapping (server tự dọn qua unlink).
  // Xoá event Google CHỈ khi user bật syncDeletes; mặc định OFF → event được GIỮ.
  if (mapped && g) {
    const syncDeletes = g.getSyncDeletes ? g.getSyncDeletes() : false;
    g.unlinkBlock(blockId, { deleteEvent: syncDeletes }).then((res) => {
      if (res && res.ok && syncDeletes) {
        TaskFlowUI.toast(t('gcalEventDeleted'), 'success');
        trackEvent('gcal_delete');
      } else if (res && !res.ok && !(res.status === 0)) {
        TaskFlowUI.toast(t('gcalEventDeleteFail'), 'error');
        trackEvent('gcal_delete_fail');
      }
    });
  }
  if (calendarMode === 'schedule') renderCalendarSchedule();
  if (taskDetailRef && getTaskDetailTarget()) renderTaskDetail();
  TaskFlowUI.toast(t('tbDeleted'), 'success');
  trackEvent('tb_delete');
}

// V1.6C (push-only) — block đã export bị sửa giờ → PATCH event Google (best-effort).
// Không chặn luồng chính: lỗi mạng (offline) im lặng — divergence sẽ tự lành ở lần
// sửa online tiếp theo; 403 → hướng dẫn cấp lại scope ghi.
async function propagateTimeBlockUpdate(block) {
  const g = window.TaskFlowGCal;
  if (!g || !block || !block.id) return;
  const text = window.TimeBlocksUI && window.TimeBlocksUI.taskTextFor
    ? window.TimeBlocksUI.taskTextFor(block.taskUid, state, inbox)
    : '';
  const title = String(text || '').trim() || t('gcalExportBlockTitle', { t: block.start + '–' + block.end });
  const res = await g.exportBlock(block, { title, update: true });
  if (res && res.ok && res.updated) {
    TaskFlowUI.toast(t('gcalUpdated'), 'success');
    trackEvent('gcal_update');
  } else if (res && res.status === 403) {
    TaskFlowUI.toast(t('gcalExportNeedWrite'), 'info');
  } else if (!(res && res.status === 0)) {
    TaskFlowUI.toast(t('gcalUpdateFail'), 'error');
    trackEvent('gcal_update_fail');
  }
}

function setTimeBlockStatusById(blockId, status) {
  const blocks = loadTimeBlocksStore();
  window.TaskFlowTimeBlocks.setTimeBlockStatus(blocks, blockId, status);
  saveTimeBlocksStore(blocks);
  if (calendarMode === 'schedule') renderCalendarSchedule();
  if (taskDetailRef && getTaskDetailTarget()) renderTaskDetail();
  trackEvent('tb_status');
}

// Bắt đầu Focus từ TimeBlock: resolve task theo uid (inbox / month) → openFocusMode.
function focusFromTimeBlock(blockId) {
  const blocks = loadTimeBlocksStore();
  const block = window.TaskFlowTimeBlocks.getBlock(blocks, blockId);
  if (!block || !block.taskUid) { TaskFlowUI.toast(t('tbNoTaskFocus'), 'info'); return; }
  const ref = TimeBlocksUI.focusRefForUid(block.taskUid, state, inbox);
  if (!ref) { TaskFlowUI.toast(t('tbTaskMissing'), 'error'); return; }
  closeTaskDetail();
  if (ref.scope === 'inbox') openFocusMode({ scope: 'inbox', task: ref.task });
  else openFocusMode({ week: ref.week, day: ref.day, task: ref.task });
}

// Tìm task theo uid trong state.weeks (tháng hiện tại). Trả {week, day, idx, tk} hoặc null.
function findPlannerTaskByUid(uid) {
  if (!uid) return null;
  for (let w = 0; w < state.weeks.length; w++) {
    const week = state.weeks[w];
    if (!week || !Array.isArray(week.days)) continue;
    for (let d = 0; d < week.days.length; d++) {
      const day = week.days[d];
      if (!day || !Array.isArray(day.tasks)) continue;
      for (let i = 0; i < day.tasks.length; i++) {
        if (day.tasks[i] && day.tasks[i].uid === uid) return { week: w, day: d, idx: i, tk: day.tasks[i] };
      }
    }
  }
  return null;
}

// Dời task tới ngày mai hoặc cuối tuần này (trong cùng tháng). Dùng moveTaskAcrossDays
// giữ uid — đúng convention task-move. Không đổi kind.
function movePlannerTaskToDay(ref, option) {
  const ti = nowInfo(PLAN_START, NUM_DAYS, PLAN_YEAR, PLAN_MONTH);
  if (!ti.inRange) return;
  const srcDay = state.weeks[ref.week].days[ref.day];
  let targetWeek = ti.week - 1;
  let targetDay = ti.dayInWeek;
  if (option === 'tomorrow') {
    const tm = ti.dayIdx + 1;
    if (tm >= NUM_DAYS) return; // hết kỳ kế hoạch → giữ nguyên
    targetWeek = Math.floor(tm / 7);
    targetDay = tm % 7;
  } else if (option === 'this-week') {
    targetDay = 6; // cuối tuần hiện tại (Chủ Nhật)
  }
  const dstDay = state.weeks[targetWeek] && state.weeks[targetWeek].days[targetDay];
  if (!dstDay) return;
  const moved = window.PlanMath.moveTaskAcrossDays(srcDay.tasks, dstDay.tasks, ref.idx, ref.tk.kind || 'regular');
  srcDay.tasks = moved.tasksFrom;
  dstDay.tasks = moved.tasksTo;
}

// Chuyển task quá hạn về Inbox — GIỮ uid, giữ projectId/milestoneId/tags...
function movePlannerTaskToInbox(ref) {
  const srcDay = state.weeks[ref.week].days[ref.day];
  const tk = ref.tk;
  srcDay.tasks.splice(ref.idx, 1);
  const inboxTask = { ...tk, inbox: true };
  inbox.push(inboxTask);
  saveInbox();
}

// Xoá context → lọc task.contexts trên toàn store (month states + inbox), KHÔNG xoá task.
function removeContextAcrossStore(ctxId) {
  let fixed = 0;
  for (let y = (new Date().getFullYear()) - 1; y <= (new Date().getFullYear()) + 1; y++) {
    for (let m = 0; m < 12; m++) {
      const raw = (() => { try { return localStorage.getItem(`planner-${y}-${m}`); } catch (e) { return null; } })();
      if (!raw) continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch (e) { continue; }
      if (parsed && Array.isArray(parsed.weeks)) {
        let changed = false;
        parsed.weeks.forEach((w) => {
          if (!w || !Array.isArray(w.days)) return;
          w.days.forEach((d) => {
            if (d && Array.isArray(d.tasks)) {
              const n = Contexts.removeContextFromTasks(ctxId, d.tasks);
              if (n) changed = true;
            }
          });
        });
        if (changed) { try { localStorage.setItem(`planner-${y}-${m}`, JSON.stringify(parsed)); } catch (e) { /* ẩn */ } fixed++; }
      }
    }
  }
  const nInbox = Contexts.removeContextFromTasks(ctxId, inbox);
  if (nInbox) { saveInbox(); fixed++; }
  return fixed;
}

// Xoá milestone → task liên kết giữ projectId, clear milestoneId trên toàn store
// (month states + inbox). KHÔNG xoá task. Gọi save()/saveInbox() bởi caller.
function unlinkTaskMilestoneAcrossStore(projectId, milestoneId) {
  if (!milestoneId) return 0;
  let fixed = 0;
  const months = [];
  for (let y = (new Date().getFullYear()) - 1; y <= (new Date().getFullYear()) + 1; y++) {
    for (let m = 0; m < 12; m++) {
      const raw = (() => { try { return localStorage.getItem(`planner-${y}-${m}`); } catch (e) { return null; } })();
      if (!raw) continue;
      let s = null;
      try { s = JSON.parse(raw); } catch (e) { /* ẩn */ }
      if (!s || !Array.isArray(s.weeks)) continue;
      let touched = false;
      s.weeks.forEach((w) => {
        if (!w || !Array.isArray(w.days)) return;
        w.days.forEach((d) => {
          if (!d || !Array.isArray(d.tasks)) return;
          d.tasks.forEach((tk) => {
            if (tk && ProjectsStore.taskMilestoneId(tk) === milestoneId && ProjectsStore.taskProjectId(tk) === projectId) {
              delete tk.milestoneId;
              touched = true;
              fixed++;
            }
          });
        });
      });
      if (touched) {
        try { localStorage.setItem(`planner-${y}-${m}`, JSON.stringify(s)); } catch (e) { /* ẩn */ }
        months.push(`planner-${y}-${m}`);
      }
    }
  }
  // Inbox
  if (Array.isArray(inbox)) {
    let touched = false;
    inbox.forEach((tk) => {
      if (tk && ProjectsStore.taskMilestoneId(tk) === milestoneId && ProjectsStore.taskProjectId(tk) === projectId) {
        delete tk.milestoneId;
        touched = true;
        fixed++;
      }
    });
    if (touched) saveInbox(inbox);
  }
  return fixed;
}

// date key generators (pomoDateKey, moodDateKey) được tách sang js/keys.js
// (window.TaskFlowKeys). pomoDateKey giữ signature; moodDateKey nhận (d, y, m) —
// call-sites truyền PLAN_YEAR/PLAN_MONTH.
if (!window.TaskFlowKeys) throw new Error('TaskFlowKeys missing — js/keys.js failed to load');
const { pomoDateKey, moodDateKey } = window.TaskFlowKeys;

/* ---------- 6B.2 — Báo cáo tổng kết năm ---------- */
/* ---------- 6B.2 — Báo cáo tổng kết năm ---------- */
// yearlyReportData/renderYearReportModal/openYearReportModal/closeYearReportModal/
// yearReportCardBlob/doShareYearReport được tách sang js/year-report.js
// (window.TaskFlowYearReport) — P11 extraction 25. Giữ alias để call-sites
// (dispatcher year-report/close-year-report/share-year-report, outside-click) không đổi.
// Lưu ý: yearlyReportData/renderYearReportModal/yearReportCardBlob chỉ dùng NỘI BỘ
// trong module (openYearReportModal→render, doShareYearReport→data+blob) — không có
// alias ở app.js, đừng grep lạc.
// Lazy-load (P1.5): js/year-report.min.js không nằm trong chuỗi script boot, chỉ nạp
// khi mở báo cáo năm lần đầu (runLazyModule ở dispatcher + outside-click).

/* ---------- 6B.3 — Weekly digest (nhắc bù qua Service Worker) ---------- */
/* ---------- 6B.3 — Weekly digest (nhắc bù qua Service Worker) ---------- */
// computeDigest/updateDigestCache (digestCacheTs nội bộ) được tách sang js/digest.js
// (window.TaskFlowDigest) — P11 extraction 26. Lazy-load (P1.5): chỉ nạp khi cần cập
// nhật cache digest (afterHabitToggle/refreshToday/boot setTimeout — runLazyModule).

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
          if (w && d) d.tasks.push({ uid: newTaskUid(), kind: tk.kind, done: tk.done, text: tk.text, tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } });
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


// habit day helpers (habitDaysElapsed, dayAggregate, heatLevel) được tách sang js/habits.js
// (window.TaskFlowHabits). Giữ alias để call-sites không đổi.
if (!window.TaskFlowHabits) throw new Error('TaskFlowHabits missing — js/habits.js failed to load');
const { habitDaysElapsed, dayAggregate, heatLevel } = window.TaskFlowHabits;


function defaultState() {
  const ti = nowInfo(PLAN_START, NUM_DAYS, PLAN_YEAR, PLAN_MONTH);
  return {
    view: 'today',
    currentWeek: ti.inRange ? ti.week : 1,
    dayWeek: ti.inRange ? ti.week : 1,
    dayDay: ti.inRange ? ti.dayInWeek : 0,
    goalTab: 'priority',
    monthKey: monthKey(PLAN_YEAR, PLAN_MONTH),
    monthlyGoals: GOAL_DEFS.map(([text, kind, done], i) => ({ id: 'g' + i, text, kind, done })),
    pillars: window.TaskFlowPillars.defaultTemplate(),
    habits: HABIT_DEFS.map(([name, target], i) => ({ id: 'h' + i, name, target, days: seedHabitDays(target) })),
    weeks: WEEK_PATTERNS.slice(0, NUM_WEEKS).map((wd, wi) => {
      const start = PLAN_START;
      return {
        n: wi + 1,
        goals: wd.goals.map(([text, kind, done]) => ({ text, kind, done })),
        days: wd.pcts.map((pct, di) => {
          const dt = new Date(start.getTime() + (wi * 7 + di) * 86400000);
          // P0.2C: không pre-seed task trống — dữ liệu mẫu thật chỉ có qua demoPlan().
          return {
            tasks: [],
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
    weeklyReviews: Array.from({ length: NUM_WEEKS }, () => emptyReview()),
    monthlyReview: emptyMonthlyReview(),
  };
}

function loadState() {
  try {
    let raw = localStorage.getItem(monthKey(PLAN_YEAR, PLAN_MONTH));
    // Chỉ dùng dữ liệu legacy cho khách vãng lai; tài khoản đã đăng nhập không kế thừa key cũ
    if (!raw && monthKey(PLAN_YEAR, PLAN_MONTH) === 'planner-2026-1' && !hasAccount()) raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    if (!window.TaskFlowDataMigrations) throw new Error('TaskFlowDataMigrations missing');
    const parsedState = JSON.parse(raw);
    const schemaDirty = parsedState.schemaVersion !== window.TaskFlowDataMigrations.VERSION;
    const s = window.TaskFlowDataMigrations.migrateMonthState(parsedState, { year: PLAN_YEAR, month: PLAN_MONTH + 1 });
    if (!s || !Array.isArray(s.monthlyGoals) || !Array.isArray(s.habits) || !Array.isArray(s.weeks)) return null;
    if (s.monthKey !== monthKey(PLAN_YEAR, PLAN_MONTH) || s.weeks.length !== NUM_WEEKS) return null;
    if (!s.reflections || !Array.isArray(s.reflections.weeks) || s.reflections.weeks.length !== NUM_WEEKS) s.reflections = defaultState().reflections;
    ensureWeeklyReviews(s, NUM_WEEKS);
    ensureMonthlyReview(s);
    if (!s.goalTab) s.goalTab = 'priority';
    // Migration additive (P2): tháng cũ chưa có pillars → điền template mặc định.
    window.TaskFlowPillars.ensurePillars(s);
    if (typeof s.currentWeek !== 'number' || s.currentWeek < 1 || s.currentWeek > NUM_WEEKS) s.currentWeek = 1;
    // Migration: vị trí Xem ngày (tuần + ngày trong tuần) — mặc định về hôm nay nếu hợp lệ
    const tiMig = nowInfo(PLAN_START, NUM_DAYS, PLAN_YEAR, PLAN_MONTH);
    if (typeof s.dayWeek !== 'number' || s.dayWeek < 1 || s.dayWeek > NUM_WEEKS) s.dayWeek = tiMig.inRange ? tiMig.week : 1;
    if (typeof s.dayDay !== 'number' || s.dayDay < 0 || s.dayDay > 6) s.dayDay = tiMig.inRange ? tiMig.dayInWeek : 0;
    if (s.view !== 'overview' && s.view !== 'week' && s.view !== 'year' && s.view !== 'calendar' && s.view !== 'today' && s.view !== 'day' && s.view !== 'upcoming' && s.view !== 'inbox') s.view = 'today';
    // Migration: task cũ thiếu tags → mảng rỗng; thiếu remind → tắt; thiếu uid → gán uid cố định
    // (uid là nền tảng để carry-over theo dõi task qua việc xoá/chèn task phía trước).
    let tasksDirty = false;
    s.weeks.forEach((w) => {
      (w.days || []).forEach((d) => {
        (d.tasks || []).forEach((tk) => {
          if (!Array.isArray(tk.tags)) tk.tags = [];
          window.TaskFlowPillars.setTaskMetricIds(tk, tk.linkedMetricIds);
          if (!tk.remind || typeof tk.remind !== 'object') tk.remind = { enabled: false, time: '20:00' };
          if (typeof tk.repeat === 'undefined') tk.repeat = null;
          if (typeof tk.uid !== 'string') { tk.uid = newTaskUid(); tasksDirty = true; }
        });
      });
    });
    // P0.3: xoá task truly-empty legacy (text rỗng + không metadata) ngay khi load —
    // additive, idempotent, giữ nguyên uid/thứ tự/done/metadata của task thật. Filter
    // tại chỗ để state `s` dùng tiếp bên dưới không lệch bản ghi. Ghi theo đúng
    // convention boot-migration (localStorage trực tiếp, không gọi save()/Sync).
    let blankRemoved = 0;
    s.weeks.forEach((w) => {
      (w.days || []).forEach((d) => {
        if (!Array.isArray(d.tasks)) return;
        const kept = d.tasks.filter((tk) => {
          if (window.TaskFlowDataMigrations.isTaskTrulyEmpty(tk)) { blankRemoved++; return false; }
          return true;
        });
        if (kept.length !== d.tasks.length) d.tasks = kept;
      });
    });
    if (blankRemoved > 0) tasksDirty = true;
    // Lưu uid mới sinh / blank đã xoá ngay (không gọi save() — state global đang trong TDZ lúc load khởi động)
    if (tasksDirty || schemaDirty) {
      try { localStorage.setItem(monthKey(PLAN_YEAR, PLAN_MONTH), JSON.stringify(s)); } catch (e) { /* ẩn */ }
    }
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
        try { localStorage.setItem(monthKey(PLAN_YEAR, PLAN_MONTH), JSON.stringify(s)); } catch (e) { /* ẩn */ }
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
function emptyState() {
  const ti = nowInfo(PLAN_START, NUM_DAYS, PLAN_YEAR, PLAN_MONTH);
  return {
    view: 'today',
    currentWeek: ti.inRange ? ti.week : 1,
    dayWeek: ti.inRange ? ti.week : 1,
    dayDay: ti.inRange ? ti.dayInWeek : 0,
    goalTab: 'priority',
    monthKey: monthKey(PLAN_YEAR, PLAN_MONTH),
    monthlyGoals: [],
    pillars: window.TaskFlowPillars.defaultTemplate(),
    habits: [],
    weeks: Array.from({ length: NUM_WEEKS }, (_, wi) => {
      const start = PLAN_START;
      return {
        n: wi + 1,
        goals: [],
        days: Array.from({ length: 7 }, (_, di) => {
          const dt = new Date(start.getTime() + (wi * 7 + di) * 86400000);
          // P0.2C: không pre-seed task trống — tài khoản mới bắt đầu với ngày thật sự
          // trống; task chỉ được tạo qua hành động Thêm (draft rỗng sẽ bị xoá khi bỏ dở).
          return {
            tasks: [],
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
    weeklyReviews: Array.from({ length: NUM_WEEKS }, () => emptyReview()),
    monthlyReview: emptyMonthlyReview(),
  };
}

function bootState() { return loadState() || (hasAccount() ? emptyState() : defaultState()); }
function bootYearState() { return loadYearState() || (hasAccount() ? emptyYearState(PLAN_YEAR) : defaultYearState(PLAN_YEAR)); }

// Nạp lại state từ localStorage sau khi đổi tài khoản (login/signup/Google OAuth).
// QUAN TRỌNG: phải gọi sau khi Sync đã xoá local + pull remote — nếu không UI vẫn
// hiển thị (và vô tình lưu) dữ liệu của tài khoản trước đó.
function rebootState(render = true) {
  state = bootState();
  yearState = bootYearState();
  invalidateYearCache();
  // Phase 5: đổi tài khoản/sync-pull → xoá undo cũ (snapshot của tài khoản cũ không còn hợp lệ)
  if (typeof undoStack !== 'undefined' && undoStack) { undoStack.clear(); lastSnapshotJson = null; }
  loadXP();
  prepareTodayState();
  if (render) {
    renderXP();
    setView(state.view, state.currentWeek);
    updateNav();
  }
}

let state = bootState();

/* ============================ Inbox — bắt nhanh việc chưa lên lịch ============================ */
// Inbox view (loadInbox/saveInbox/renderInbox/inboxTargetForDate/scheduleInboxTask/
// addInboxTask/handleInboxAction) được tách sang js/inbox.js (window.TaskFlowInbox) —
// P11 extraction 20. State `inbox` vẫn là global lexical tại đây (nhiều call-site app.js
// đọc/ghi trực tiếp) — module nhận `inbox` qua tham số. Destructure phải TRƯỚC top-level
// `let inbox = loadInbox()` (inbox nạp ngay khi boot, trước mọi render).
if (!window.TaskFlowInbox) throw new Error('TaskFlowInbox missing — js/inbox.js failed to load');
const { loadInbox, saveInbox, renderInbox, inboxTargetForDate, handleInboxAction } = window.TaskFlowInbox;
let inbox = loadInbox();

/* ============================ P0.2 — Draft task trống ============================ */
// Task vừa tạo (Today/Week/Inbox) bắt đầu với text rỗng rồi focus vào ô viết. Nếu người
// dùng bỏ dở (blur, Tab, click chỗ khác, Escape, điều hướng) mà không gõ text, draft
// KHÔNG được thành task thật: xoá an toàn, KHÔNG undo, KHÔNG toast. Chỉ xoá task "trống
// THẬT SỰ" (isTaskTrulyEmpty) — task có deadline/tags/notes/subtasks/... luôn được giữ.

// Giải mã task theo ô contenteditable (task-text = Today/Week, inbox-text = Inbox).
function taskAtText(el) {
  if (el.dataset.role === 'task-text') {
    const w = state.weeks[+el.dataset.week - 1];
    const d = w && w.days[+el.dataset.day];
    const tk = d && d.tasks[+el.dataset.task];
    return tk ? { scope: 'week', tk, d, i: +el.dataset.task } : null;
  }
  if (el.dataset.role === 'inbox-text') {
    const tk = inbox[+el.dataset.task];
    return tk ? { scope: 'inbox', tk, i: +el.dataset.task } : null;
  }
  return null;
}

function removeTrulyEmptyDraft(t) {
  if (t.scope === 'week') {
    t.d.tasks.splice(t.i, 1);
    if (state.view === 'today') renderToday();
    else renderWeek();
    save();
  } else {
    inbox.splice(t.i, 1);
    saveInbox(inbox);
    renderInbox(inbox);
  }
}

document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (!el || !el.dataset) return;
  if (el.dataset.role !== 'task-text' && el.dataset.role !== 'inbox-text') return;
  const t = taskAtText(el);
  // Đánh dấu "trống từ lúc focus": chỉ xoá khi task rỗng NGAY TỪ ĐẦU (draft mới hoặc
  // blank legacy còn sót) — KHÔNG xoá task cũ đang bị người dùng xoá text (bỏ dở việc xoá).
  if (t && window.TaskFlowDataMigrations.isTaskTrulyEmpty(t.tk)) el.dataset.freshBlank = '1';
});

document.addEventListener('focusout', (e) => {
  const el = e.target;
  if (!el || !el.dataset || el.dataset.freshBlank !== '1') return;
  delete el.dataset.freshBlank;
  if (!document.contains(el)) return; // đã bị re-render → bỏ qua (chỉ mục có thể đã lệch)
  const t = taskAtText(el);
  if (!t || !window.TaskFlowDataMigrations.isTaskTrulyEmpty(t.tk)) return;
  // P0.2C: blur do CLICK (pointer đang giữ) — KHÔNG re-render đồng bộ trong focusout.
  // renderWeek()/renderToday()/renderInbox() thay toàn bộ DOM của view, phá hủy phần tử
  // mà người dùng ĐANG click TRƯỚC khi click event được dispatch (mousedown đã xảy ra,
  // click đổ lên phần tử đã bị gỡ) → click đầu tiên bị nuốt: task không toggle, day
  // progress không đổi (regression ea26fc5). Draft luôn là task CUỐI của ngày (được
  // push), nên splice ngay lập tức KHÔNG làm lệch index của các task khác — chỉ cần
  // hoãn RENDER đến khi chuỗi click (pointerup → click) kết thúc.
  if (pointerPressed) {
    if (t.scope === 'week') {
      t.d.tasks.splice(t.i, 1);
      save();
    } else {
      inbox.splice(t.i, 1);
      saveInbox(inbox);
    }
    pendingDraftRender = () => {
      // Click handler đã re-render view (addtask/deltask/renderToday/renderInbox...) thì
      // DOM đã nhất quán (draft đã splice khỏi data trước đó) → không cần render lại.
      if (!document.contains(el)) return;
      if (t.scope === 'inbox') renderInbox(inbox);
      else if (state.view === 'today') renderToday();
      else renderWeek();
    };
    return;
  }
  removeTrulyEmptyDraft(t);
});

// P0.2C: theo dõi pointer để biết blur có phải do click không (blur do Tab/bàn phím/
// programmatic vẫn xoá draft đồng bộ như trước).
let pointerPressed = false;
let pendingDraftRender = null;

document.addEventListener('pointerdown', () => { pointerPressed = true; }, true);
document.addEventListener('pointerup', () => { pointerPressed = false; }, true);
document.addEventListener('pointercancel', () => {
  pointerPressed = false;
  if (pendingDraftRender) setTimeout(flushPendingDraftRender, 0);
}, true);

function flushPendingDraftRender() {
  if (!pendingDraftRender) return;
  const fn = pendingDraftRender;
  pendingDraftRender = null;
  fn();
}

// Flush render SAU khi chuỗi click kết thúc: listener click của app (toggle/add/delete/...)
// chạy trong cùng click task, setTimeout(0) chạy sau task đó nên render không nuốt click.
// (Ngay cả khi timer chạy sớm hơn click trong trường hợp lạ, splice đã xong từ focusout
// và draft là task cuối → index các checkbox khác vẫn đúng, click vẫn hoạt động.)
document.addEventListener('click', () => {
  if (pendingDraftRender) setTimeout(flushPendingDraftRender, 0);
});
// Rời cửa sổ (Alt-Tab, đổi tab) — không còn click nào đang chờ → flush ngay.
window.addEventListener('blur', () => {
  pointerPressed = false;
  flushPendingDraftRender();
});

function save() {
  // Migration additive (P2): state luôn có pillars hợp lệ trước khi serialize.
  if (window.TaskFlowPillars) window.TaskFlowPillars.ensurePillars(state);
  ensureWeeklyReviews(state, NUM_WEEKS);
  ensureMonthlyReview(state);
  try { localStorage.setItem(monthKey(PLAN_YEAR, PLAN_MONTH), JSON.stringify(state)); } catch (e) { /* ẩn */ }
  if (window.Sync) window.Sync.push(monthKey(PLAN_YEAR, PLAN_MONTH));
  backupAfterSave();
}

// Sao lưu sau save: best-effort qua module lazy js/backup.js — không bao giờ chặn,
// làm hỏng hay spam toast trên đường lưu (module được precache trong SW nên offline vẫn có).
function backupAfterSave() {
  if (window.TaskFlowBackup) {
    try { window.TaskFlowBackup.maybeAutoBackup(); } catch (e) { /* ẩn */ }
    return;
  }
  ensureLazyModule('js/backup.min.js')
    .then(() => {
      try { window.TaskFlowBackup.maybeAutoBackup(); } catch (e) { /* ẩn */ }
    })
    .catch(() => { /* ẩn: backup là best-effort */ });
}

// XP & gamification core (xpTotal, loadXP, saveXP, xpLevelInfo, addXP, removeXP, renderXP)
// + render helpers thuần (habitPct, dayPct, donutSVG, checkboxHTML) được tách sang
// js/xp.js (window.TaskFlowXP, extraction 32 — R11). xpTotal là state riêng của module
// (key 'planner-xp' đồng bộ như mọi key planner-*, không reset theo tháng). Deps (t,
// confettiBurst, TaskFlowUI, window.Sync/PlanMath, habitDaysElapsed, PLAN_*/NUM_DAYS)
// resolve qua global lexical tại thời điểm GỌI — pattern mood.js/popups.js.
if (!window.TaskFlowXP) throw new Error('TaskFlowXP missing — js/xp.js failed to load');
const { loadXP, saveXP, xpLevelInfo, addXP, removeXP, renderXP, habitPct, dayPct, donutSVG, checkboxHTML } = window.TaskFlowXP;

/* ============================ Tính toán ============================ */

// goal stats core (weekStats, monthlyStats) được tách sang js/stats.js
// (window.TaskFlowStats). Giữ alias để call-sites không đổi.
if (!window.TaskFlowStats) throw new Error('TaskFlowStats missing — js/stats.js failed to load');
const { weekStats, monthlyStats } = window.TaskFlowStats;

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
  if (store === yearState) saveYearSoon(); else saveSoon();
}

function reflectionHTML(key, prompts) {
  const refs = key === 'ov' ? state.reflections.overview : state.reflections.weeks[state.currentWeek - 1];
  return `<h3 class="ref-title">${t('refTitle')}</h3>
    ${prompts.map((p, i) => `<div class="ref-item">
      <div class="ref-question" contenteditable="true" spellcheck="false" data-singleline="1" data-reflect-q="${key}-${i}" data-placeholder="${t('qEditPh')}" aria-label="${t('refQAria', { n: i + 1 })}">${esc(getRefQuestion(key, i, p))}</div>
      <div class="ref-line" contenteditable="true" spellcheck="false" data-reflect="${key}-${i}" data-placeholder="${t('writeHere')}" aria-label="${t('refAria', { n: i + 1 })}">${esc(refs[i])}</div>
    </div>`).join('')}`;
}

/* ---------- Tổng quan tháng ---------- */

function overviewMetricSnapshot() {
  const ms = monthlyStats(state);
  const selectedWeek = state.weeks[state.currentWeek - 1] || state.weeks[0];
  const now = new Date();
  const todayIndex = now.getFullYear() === PLAN_YEAR && now.getMonth() === PLAN_MONTH ? now.getDate() - 1 : -1;
  const habitsDone = todayIndex >= 0
    ? state.habits.filter(function (habit) { return !!habit.days[todayIndex]; }).length
    : 0;
  clearStreakCache();
  const activeStreak = state.habits.reduce(function (best, habit) {
    return Math.max(best, habitStreakCached(habit, PLAN_YEAR, PLAN_MONTH, NUM_DAYS).cur);
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
  const curWeek = nowInfo(PLAN_START, NUM_DAYS, PLAN_YEAR, PLAN_MONTH).week;
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

// P2: re-render chỉ block trụ cột (giữ scroll/focus của trang Overview) sau khi
// pillar CRUD / đổi focus — không renderOverview() toàn bộ.
function rerenderPillars() {
  const host = document.querySelector('[data-role="pillars-block"]');
  if (host) host.innerHTML = window.TaskFlowPillars.pillarsBlockHTML(state);
}

// P3: re-render chỉ 1 metric row (sau khi toggle ô ngày manual) — không render
// lại cả block để giữ focus/scroll trong day strip.
function updateMetricRow(state, metricId) {
  const host = document.querySelector(`[data-testid="metric-row"][data-metric-id="${metricId}"]`);
  if (!host) return;
  const p = (Array.isArray(state.pillars) ? state.pillars : []).find((x) => x
    && Array.isArray(x.metrics) && x.metrics.some((mm) => mm && mm.id === metricId));
  const m = p && Array.isArray(p.metrics) ? p.metrics.find((x) => x && x.id === metricId) : null;
  if (!p || !m) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = window.TaskFlowPillars.metricRowHTML(state, p, m);
  const fresh = tmp.firstElementChild;
  if (fresh) host.replaceWith(fresh);
}

function goalsPanelHTML(ms) {
  const pct = ms.pct;
  const priGoals = state.monthlyGoals.filter((g) => g.kind === 'priority');
  const regGoals = state.monthlyGoals.filter((g) => g.kind === 'regular');
  
  return `<div class="card goals-panel">
    <div data-role="pillars-block" class="pillars-block-host">${window.TaskFlowPillars.pillarsBlockHTML(state)}</div>
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

// Phase 7: empty state thống nhất — icon + title + hint + optional CTA actions.
// actions: [{ label, action, ...extraAttrs }] → render nút button data-action.
function emptyStateHTML(icon, titleKey, hintKey, actions) {
  const cta = (Array.isArray(actions) && actions.length)
    ? `<div class="empty-actions">${actions.map((a) => {
        const extra = a.attrs || '';
        return `<button type="button" class="empty-btn" data-action="${esc(a.action)}" ${extra}>${esc(a.label)}</button>`;
      }).join('')}</div>`
    : '';
  return `<div class="empty-state">
    <span class="empty-icon" aria-hidden="true">${icon}</span>
    <p class="empty-title">${t(titleKey)}</p>
    <p class="empty-hint">${t(hintKey)}</p>
    ${cta}
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
            <button type="button" class="mini-btn" data-action="editgoal" data-id="${g.id}" title="${t('editGoalAria')}" aria-label="${t('editGoalAria')}">${window.TaskFlowUI.icon('edit')}</button>
            <button type="button" class="mini-btn" data-action="delgoal" data-scope="m" data-id="${g.id}" title="${t('delGoalAria')}" aria-label="${t('delGoalAria')}">${window.TaskFlowUI.icon('trash')}</button>
          </span>
        </li>`).join('') || `<li class="goal-item empty-item">${emptyStateHTML('🎯', 'emptyGoalsT', 'emptyGoalsH')}</li>`}
      </ul>
      <div class="goal-add-wrap">
        <button type="button" class="mini-btn add-btn" data-action="addgoal" data-kind="${kind}">${window.TaskFlowUI.icon('plus')}<span>${t('addGoal')}</span></button>
        <div class="goal-add-bar" hidden data-role="goal-add-bar" data-kind="${kind}">
          <input class="inline-input" data-role="goal-add-input" data-kind="${kind}" placeholder="${t('goalPh')}" aria-label="${t('goalNameAria', { label })}" maxlength="120" />
          <button type="button" class="mini-btn" data-action="confirm-addgoal" data-kind="${kind}" title="${t('addTxt')}" aria-label="${t('addTxt')}">${window.TaskFlowUI.icon('check')}</button>
        </div>
      </div>
    </div>
  </div>`;
}

function habitPanelHTML() {
  const dayBars = Array.from({ length: NUM_DAYS }, (_, d) => dayAggregate(state, d));
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
      <button type="button" class="mini-btn add-btn" data-action="addhabit" title="${t('addHabitTxt')}">${window.TaskFlowUI.icon('plus')}<span>${t('addHabitTxt')}</span></button>
      <button type="button" class="mini-btn" data-action="copyhabits" title="${t('copyHabitsTxt')}">${window.TaskFlowUI.icon('calendar-check')} ${t('copyHabitsTxt')}</button>
      <button type="button" class="mini-btn" data-action="templates-toggle" title="${t('templatesTitle')}" aria-label="${t('templatesTitle')}">${window.TaskFlowUI.icon('sparkles')}</button>
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
              const hsch = habitSchedOf(h);
              const schedLbl = habitSchedLabel(hsch);
              const schedTargetable = hsch.type === 'daily' || hsch.type === 'weekdays';
              return `<tr draggable="true" data-drag="habit" data-id="${h.id}" title="${t('dragHint')}">
                <td class="sticky name-col"><span class="habit-name-cell">
                  <span class="habit-name-text" data-id="${h.id}" title="${esc(h.name)}">${esc(h.name)}</span>
                  ${schedLbl ? `<span class="habit-sched-hint" data-role="habit-sched-hint" data-id="${h.id}" title="${esc(schedLbl)}">${esc(schedLbl)}</span>` : ''}
                  <span class="item-actions">
                    <button type="button" class="mini-btn" data-action="remind-habit" data-id="${h.id}" title="${t('remindHabitAria')}" aria-label="${t('remindHabitAria')}">${window.TaskFlowUI.icon('bell')}${h.remind && h.remind.enabled ? '<sup class="remind-dot"></sup>' : ''}</button>
                    <button type="button" class="mini-btn" data-action="habitsched" data-id="${h.id}" title="${t('habitSchedAria')}" aria-label="${t('habitSchedAria')}">${window.TaskFlowUI.icon('calendar')}</button>
                    ${schedTargetable ? `<button type="button" class="mini-btn" data-action="targetedit" data-id="${h.id}" title="${t('targetAria', { n: h.target || 100 })}" aria-label="${t('targetAria', { n: h.target || 100 })}">${window.TaskFlowUI.icon('target')}</button>` : ''}
                    <button type="button" class="mini-btn" data-action="edithabit" data-id="${h.id}" title="${t('renameAria')}" aria-label="${t('renameAria')}">${window.TaskFlowUI.icon('edit')}</button>
                    <button type="button" class="mini-btn" data-action="delhabit" data-id="${h.id}" title="${t('delAria')}" aria-label="${t('delAria')}">${window.TaskFlowUI.icon('trash')}</button>
                  </span>
                </span></td>
                <td class="sticky pct-col"><b data-role="habit-pct" data-id="${h.id}">${p}%</b></td>
                ${h.days.map((v, d) => `<td class="day-cell${d === habitToday ? ' today' : ''}${h.skipDays && h.skipDays.includes(d) ? ' skipped' : ''}" data-context="habit-day" data-id="${h.id}" data-day="${d}">${checkboxHTML('', v, `data-action="habit" data-id="${h.id}" data-day="${d}"`, window.TaskFlowUI.checkboxLabel('habit', h.name, `${String(d + 1).padStart(2, '0')}/${String(PLAN_MONTH + 1).padStart(2, '0')}`))}</td>`).join('')}
              </tr>`;
            }).join('') : `<tr>
              <td class="sticky name-col"></td>
              <td class="sticky pct-col"></td>
              <td colspan="${NUM_DAYS}" class="empty-cell">${emptyStateHTML('🐥', 'emptyHabitsT', 'emptyHabitsH', [
                { label: t('emptyAddHabit'), action: 'habit-focus' },
              ])}</td>
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



/* ---- Đa tháng: streak xuyên tháng (habitInMonthState, habitDaysAt, streakAnchorDay,
     habitTimeline, habitStreakOf, habitStreakCached, clearStreakCache) được tách sang
     js/streak.js (window.TaskFlowStreak). Các hàm nhận PLAN_YEAR/PLAN_MONTH/NUM_DAYS tham số. ---- */
if (!window.TaskFlowStreak) throw new Error('TaskFlowStreak missing — js/streak.js failed to load');
const { habitInMonthState, habitDaysAt, streakAnchorDay, habitTimeline, habitStreakOf, habitStreakCached, clearStreakCache } = window.TaskFlowStreak;

// Streak/heatmap UI (weekHabitPct, weekCompareHTML, dayAggregateAt, heatHeroHTML,
// heatRibbonHTML, habitMiniHTML, habitHeatCardHTML, shareTopInfo, canvasCircle,
// streakCardBlob, doShareStreak) được tách sang js/streak-ui.js (window.TaskFlowStreakUI,
// extraction 33 — R14). Calc đã ở streak.js/habits.js; phần này là renderers + share.
// Deps (t, esc, state, PLAN_*, nowInfo, monthStateRaw, streakAnchorDay/habitDaysAt/
// habitStreakCached/clearStreakCache, heatLevel/dayAggregate, habitPct, shortMonth, getLang,
// TaskFlowUI, trackEvent) resolve qua global lexical tại thời điểm GỌI — pattern mood.js/popups.js.
if (!window.TaskFlowStreakUI) throw new Error('TaskFlowStreakUI missing — js/streak-ui.js failed to load');
const { weekHabitPct, weekCompareHTML, dayAggregateAt, heatHeroHTML, heatRibbonHTML, habitMiniHTML, habitHeatCardHTML, shareTopInfo, canvasCircle, streakCardBlob, doShareStreak } = window.TaskFlowStreakUI;

// psStart/shortMonth được tách sang js/planmini.js (window.TaskFlowPlanMini) —
// giữ signature 100%; getLang + MONTH_NAMES access qua TaskFlowI18N trong module.
if (!window.TaskFlowPlanMini) throw new Error('TaskFlowPlanMini missing — js/planmini.js failed to load');
const { psStart, shortMonth } = window.TaskFlowPlanMini;

// Báo cáo tháng/tuần (monthlyReportData, renderReportModal, open/closeReportModal,
// reportCardBlob, doShareReport, weeklyReportData, lastWeekReportData, vsCell,
// focusReportBars, renderWeekReportModal, open/closeWeekReportModal, weekReportCardBlob,
// doShareWeekReport) được tách sang js/report-ui.js (window.TaskFlowReportUI,
// extraction 35 — R15). year-report.js (lazy, P1.5) gọi focusReportBars qua global
// lexical — module expose + alias giữ để lazy resolve. Deps (t, esc, monthLabel,
// dayLabelShort, donutSVG, weekStats/monthlyStats, habitPct, habitStreakCached,
// dayAggregate, dayAggregateAt/canvasCircle, psStart, monthStateRaw, window.PlanMath,
// focus*/topFocus*/taskFocusMinLabel/pomoDaySecs, state, PLAN_*/NUM_DAYS, TaskFlowUI,
// trackEvent) resolve qua global lexical tại thời điểm GỌI — pattern mood.js/popups.js.
if (!window.TaskFlowReportUI) throw new Error('TaskFlowReportUI missing — js/report-ui.js failed to load');
const { monthlyReportData, renderReportModal, openReportModal, closeReportModal, reportCardBlob, doShareReport, weeklyReportData, lastWeekReportData, vsCell, focusReportBars, renderWeekReportModal, openWeekReportModal, closeWeekReportModal, weekReportCardBlob, doShareWeekReport } = window.TaskFlowReportUI;

let monthCarryTarget = null;
let monthCarryDestination = null;
let monthCarrySelection = normalizeCarrySelection(null);

function createEmptyMonthState(y, m) {
  const previous = capturePlan();
  try {
    initPlan(new Date(y, m, 1));
    const destination = emptyState();
    // A newly created destination must not silently contain template pillars:
    // the preview and final state contain only structures explicitly selected.
    destination.pillars = [];
    return destination;
  } finally {
    restorePlan(previous);
  }
}

function readMonthCarrySelection() {
  const selected = normalizeCarrySelection(null);
  document.querySelectorAll('#monthCarryContent [data-carry-kind]:checked').forEach((input) => {
    const id = input.dataset.carryId || '';
    if (!id) return;
    if (input.dataset.carryKind === 'pillar') selected.pillarIds.push(id);
    else if (input.dataset.carryKind === 'focus') selected.focusPillarIds.push(id);
    else if (input.dataset.carryKind === 'habit') selected.habitIds.push(id);
    else if (input.dataset.carryKind === 'metric') selected.metricIds.push(id);
  });
  return normalizeCarrySelection(selected);
}

function renderMonthCarry(preview) {
  const content = document.getElementById('monthCarryContent');
  if (!content || !monthCarryTarget || !monthCarryDestination) return;
  const nextPreview = preview || buildCarryPreview(state, monthCarryDestination, monthCarrySelection, {
    monthDays: new Date(monthCarryTarget.year, monthCarryTarget.month + 1, 0).getDate(),
  });
  content.innerHTML = carryDialogHTML(state, monthCarrySelection, nextPreview, { t, esc });
}

function openMonthCarry(trigger) {
  monthCarryTarget = nextCarryMonth(PLAN_YEAR, PLAN_MONTH);
  monthCarryDestination = monthStateRaw(monthCarryTarget.year, monthCarryTarget.month)
    || createEmptyMonthState(monthCarryTarget.year, monthCarryTarget.month);
  monthCarrySelection = normalizeCarrySelection(null);
  closeReportModal();
  renderMonthCarry();
  TaskFlowUI.openDialog('monthCarryModal', trigger);
}

function previewMonthCarry() {
  monthCarrySelection = readMonthCarrySelection();
  renderMonthCarry();
}

function applyMonthCarry() {
  monthCarrySelection = readMonthCarrySelection();
  const context = { monthDays: new Date(monthCarryTarget.year, monthCarryTarget.month + 1, 0).getDate() };
  const result = applyCarryover(state, monthCarryDestination, monthCarrySelection, context);
  if (!result.ok) {
    renderMonthCarry(result.preview);
    return;
  }
  const saved = saveMonthState(monthCarryTarget.year, monthCarryTarget.month, result.state);
  if (!saved) {
    TaskFlowUI.toast(t('monthCarrySaveError'), 'error');
    return;
  }
  TaskFlowUI.closeDialog('monthCarryModal');
  TaskFlowUI.toast(t('monthCarrySuccess'), 'success');
  openMonth(PLAN_MONTH + 1);
}

function closeMonthCarry() {
  TaskFlowUI.closeDialog('monthCarryModal');
}

let reportHistoryEntries = [];
let reportHistoryFilter = 'daily';

function renderUnifiedReportHistory() {
  const content = document.getElementById('reportHistoryContent');
  if (!content) return;
  content.innerHTML = reflectionHistoryHTML({ entries: reportHistoryEntries, filter: reportHistoryFilter }, { t, esc });
}

function openUnifiedReportHistory() {
  reportHistoryEntries = collectReflectionHistory(localStorage);
  reportHistoryFilter = 'daily';
  closeReportModal();
  renderUnifiedReportHistory();
  TaskFlowUI.openDialog('reportHistoryModal');
}

function closeUnifiedReportHistory() {
  TaskFlowUI.closeDialog('reportHistoryModal');
}

function openUnifiedHistoryEntry(id) {
  const entry = reportHistoryEntries.find((item) => item.id === id);
  if (!entry || !entry.owner) return;
  closeUnifiedReportHistory();
  if (entry.type === 'daily') {
    window.TaskFlowReflection.openDeepReflection(entry.owner.key);
    return;
  }
  if (Number.isInteger(entry.owner.year) && Number.isInteger(entry.owner.month)) {
    PLAN_YEAR = entry.owner.year;
    openMonth(entry.owner.month);
  }
  if (entry.type === 'weekly') {
    const week = Math.max(1, Math.min(NUM_WEEKS, (+entry.owner.weekIndex || 0) + 1));
    state.currentWeek = week;
    setView('week', week);
  } else if (entry.type === 'monthly') {
    openReportModal();
  }
}

/* ---------- Huy hiệu 🎖️ ---------- */
const BADGE_DEFS = [
  { id: 'b7', icon: '🔥', nameKey: 'badge7', hintKey: 'badgeHint7' },
  { id: 'b30', icon: '🔥🔥', nameKey: 'badge30', hintKey: 'badgeHint30' },
  { id: 'best14', icon: '🏆', nameKey: 'badgeBest14', hintKey: 'badgeHintBest14' },
  { id: 'goals100', icon: '🎯', nameKey: 'badgeGoals100', hintKey: 'badgeHintGoals100' },
  { id: 'habit100', icon: '💯', nameKey: 'badgeHabit100', hintKey: 'badgeHintHabit100' },
  { id: 'active15', icon: '📅', nameKey: 'badgeActive15', hintKey: 'badgeHintActive15' },
];

let badgesStore = loadBadges();

function countActiveDays() {
  let n = 0;
  for (let d = 0; d < NUM_DAYS; d++) if (dayAggregate(state, d) > 0) n++;
  return n;
}

// Trao huy hiệu mới khi đang xem tháng hiện tại; trả về số badge vừa mở.
function evaluateMonthBadges() {
  const now = new Date();
  if (now.getFullYear() !== PLAN_YEAR || now.getMonth() !== PLAN_MONTH) return 0;
  const streaks = {};
  state.habits.forEach((h) => { streaks[h.id] = habitStreakCached(h, PLAN_YEAR, PLAN_MONTH, NUM_DAYS); });
  const ms = monthlyStats(state);
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
    const s = habitStreakCached(h, PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
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
    const s = habitStreakCached(h, PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
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
    // V1.4: giữ schedule (đã chuẩn hoá) khi copy sang tháng sau; legacy không schedule → daily.
    const sched = window.TaskFlowHabits && window.TaskFlowHabits.normalizeSchedule ? window.TaskFlowHabits.normalizeSchedule(h.schedule) : undefined;
    const next = { id: h.id, name: h.name, target: typeof h.target === 'number' && h.target >= 1 ? h.target : 100, days: freshDays.slice() };
    if (sched) next.schedule = sched;
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

/* ===== V1.4 — Flexible Habit Schedules (schedule editor) ===== */
function habitSchedOf(h) {
  return window.TaskFlowHabits && window.TaskFlowHabits.scheduleOf ? window.TaskFlowHabits.scheduleOf(h) : { type: 'daily' };
}

function habitSchedLabel(hsch) {
  const H = window.TaskFlowHabits;
  const sum = H && H.scheduleSummary ? H.scheduleSummary(hsch) : { type: 'daily', value: null };
  if (sum.type === 'weekdays') {
    const names = t('dayNames');
    return sum.value.map((d) => names[d - 1]).join(', ');
  }
  if (sum.type === 'weekly_count') return t('habitSchedWeeklyLabel', { n: sum.value });
  if (sum.type === 'monthly_count') return t('habitSchedMonthlyLabel', { n: sum.value });
  return '';
}

let _habitSchedId = null;
let _habitSchedDraft = { type: 'daily', days: [], count: 3 };

function renderHabitSchedForm() {
  const el = document.getElementById('habitSchedContent');
  if (!el) return;
  const d = _habitSchedDraft;
  const names = t('dayNames');
  const isCount = d.type === 'weekly_count' || d.type === 'monthly_count';
  const chips = names.map((n, i) => {
    const on = d.days.indexOf(i + 1) >= 0;
    return `<button type="button" class="habit-sched-chip${on ? ' on' : ''}" data-action="habitsched-weekday" data-day="${i + 1}" aria-pressed="${on}" aria-label="${esc(n)}">${esc(n)}</button>`;
  }).join('');
  el.innerHTML = `<div class="habit-sched-form">
    <div class="habit-sched-types" role="radiogroup" aria-label="${esc(t('habitSchedTitle'))}">
      <label class="habit-sched-type"><input type="radio" name="hsched-type" value="daily" data-action="habitsched-type" ${d.type === 'daily' ? 'checked' : ''}><span>${esc(t('habitSchedDaily'))}</span></label>
      <label class="habit-sched-type"><input type="radio" name="hsched-type" value="weekdays" data-action="habitsched-type" ${d.type === 'weekdays' ? 'checked' : ''}><span>${esc(t('habitSchedWeekdays'))}</span></label>
      <label class="habit-sched-type"><input type="radio" name="hsched-type" value="weekly_count" data-action="habitsched-type" ${d.type === 'weekly_count' ? 'checked' : ''}><span>${esc(t('habitSchedWeeklyCount'))}</span></label>
      <label class="habit-sched-type"><input type="radio" name="hsched-type" value="monthly_count" data-action="habitsched-type" ${d.type === 'monthly_count' ? 'checked' : ''}><span>${esc(t('habitSchedMonthlyCount'))}</span></label>
    </div>
    <div class="habit-sched-weekdays" data-role="hsched-weekdays" ${d.type === 'weekdays' ? '' : 'hidden'}>
      <p class="habit-sched-sub">${esc(t('habitSchedWeekdays'))}</p>
      <div class="habit-sched-chips">${chips}</div>
    </div>
    <div class="habit-sched-count-row" data-role="hsched-count" ${isCount ? '' : 'hidden'}>
      <label for="hsched-count-input">${esc(t(d.type === 'weekly_count' ? 'habitSchedWeeklyCount' : 'habitSchedMonthlyCount'))}</label>
      <input id="hsched-count-input" type="number" min="1" max="${d.type === 'weekly_count' ? 31 : 93}" step="1" value="${d.count}" data-role="hsched-count-input" aria-label="${esc(t('habitSchedCountPh'))}">
    </div>
  </div>`;
}

function openHabitScheduleModal(id) {
  const h = state.habits.find((x) => x.id === id);
  if (!h) return;
  const s = habitSchedOf(h);
  _habitSchedId = id;
  _habitSchedDraft = {
    type: s.type,
    days: s.type === 'weekdays' ? s.days.slice() : [],
    count: s.type === 'weekly_count' || s.type === 'monthly_count' ? s.count : 3,
  };
  renderHabitSchedForm();
  TaskFlowUI.openDialog('habitSchedModal');
  const r = document.querySelector('.habit-sched-types input:checked');
  if (r) setTimeout(() => r.focus(), 30);
  trackEvent('habit_sched_open');
}

function saveHabitSchedule() {
  const h = state.habits.find((x) => x.id === _habitSchedId);
  if (!h) return;
  const d = _habitSchedDraft;
  if (d.type === 'weekdays' && !d.days.length) {
    TaskFlowUI.toast(t('habitSchedNeedDay'), 'error');
    return;
  }
  let sched;
  if (d.type === 'daily') sched = { type: 'daily' };
  else if (d.type === 'weekdays') sched = { type: 'weekdays', days: d.days.slice().sort((a, b) => a - b) };
  else {
    const inp = document.querySelector('[data-role="hsched-count-input"]');
    let v = d.count;
    if (inp) {
      const n = parseInt(inp.value, 10);
      if (Number.isInteger(n) && n >= 1) v = n;
    }
    sched = { type: d.type, count: d.type === 'weekly_count' ? Math.min(31, v) : Math.min(93, v) };
  }
  h.schedule = sched;
  renderOverview();
  save();
  TaskFlowUI.closeDialog('habitSchedModal');
  trackEvent('habit_schedule', { type: sched.type });
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
  insertBeforeTaskActions(btn, input);
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
    <h3 class="week-section-title">${t('widgetLabel_year-card')}</h3>
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
                <button type="button" class="btn-del" data-action="delgoal" data-scope="y" data-id="${g.id}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">${window.TaskFlowUI.icon('trash')}</button>
              </li>`).join('')}
              <li class="goal-item add-item"><button type="button" class="btn-add" data-action="addgoal" data-scope="y" data-kind="priority" aria-label="${t('addPriGoalAria')}" title="${t('addPriGoalAria')}">${window.TaskFlowUI.icon('plus')}</button></li>
            </ul>
          </div>
          <div class="goal-block">
            <div class="v-strip blue"><span>${t('regLbl')}</span></div>
            <ul class="goal-items">
              ${reg.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}" draggable="true" data-drag="goal" data-scope="y" data-id="${g.id}" title="${t('dragHint')}">
                ${checkboxHTML('blue', g.done, `data-action="ygoal" data-id="${g.id}"`, window.TaskFlowUI.checkboxLabel('goal', g.text, String(PLAN_YEAR)))}
                <span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="y-goal-text" data-id="${g.id}" data-placeholder="${t('yGoalPh')}" aria-label="${t('yGoalAria')}">${esc(g.text)}</span>
                <button type="button" class="btn-del" data-action="delgoal" data-scope="y" data-id="${g.id}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">${window.TaskFlowUI.icon('trash')}</button>
              </li>`).join('')}
              <li class="goal-item add-item"><button type="button" class="btn-add" data-action="addgoal" data-scope="y" data-kind="regular" aria-label="${t('addRegGoalAria')}" title="${t('addRegGoalAria')}">${window.TaskFlowUI.icon('plus')}</button></li>
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
        <h3 class="ref-title">${t('refTitle')}</h3>
        ${YEAR_REFLECT_PROMPTS().map((p, i) => `<div class="ref-item">
          <div class="ref-question" contenteditable="true" spellcheck="false" data-singleline="1" data-reflect-q="yr-${i}" data-placeholder="${t('qEditPh')}" aria-label="${t('refQAria', { n: i + 1 })}">${esc(getRefQuestion('yr', i, p))}</div>
          <div class="ref-line" contenteditable="true" spellcheck="false" data-reflect="yr-${i}" data-placeholder="${t('writeHere')}" aria-label="${t('refYearAria', { n: i + 1 })}">${esc(refs[i])}</div>
        </div>`).join('')}
      </div>
      <div class="sub year-line-card">
        <h3 class="ref-title">${t('progress12')}</h3>
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
                ${pri.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">${checkboxHTML('pink', g.done, `data-action="mgoal" data-month="${m}" data-id="${g.id}"`, window.TaskFlowUI.checkboxLabel('goal', g.text, `${monthLabel(m)} ${PLAN_YEAR}`))}<span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="ym-goal-text" data-month="${m}" data-id="${g.id}" data-placeholder="${t('writePh')}" aria-label="${t('mGoalAria', { n: m + 1 })}">${esc(g.text)}</span><button type="button" class="btn-del" data-action="delgoal" data-scope="ym" data-month="${m}" data-id="${g.id}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">${window.TaskFlowUI.icon('trash')}</button></li>`).join('')}
                <li class="goal-item add-item"><button type="button" class="btn-add" data-action="addgoal" data-scope="ym" data-month="${m}" data-kind="priority" aria-label="${t('addPriGoalAria')}" title="${t('addPriGoalAria')}">${window.TaskFlowUI.icon('plus')}</button></li>
              </ul>
            </div>
            <div class="ym-block">
              <div class="v-strip blue"><span>${t('regLbl')}</span></div>
              <ul class="goal-items ym-items">
                ${reg.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">${checkboxHTML('blue', g.done, `data-action="mgoal" data-month="${m}" data-id="${g.id}"`, window.TaskFlowUI.checkboxLabel('goal', g.text, `${monthLabel(m)} ${PLAN_YEAR}`))}<span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="ym-goal-text" data-month="${m}" data-id="${g.id}" data-placeholder="${t('writePh')}" aria-label="${t('mGoalAria', { n: m + 1 })}">${esc(g.text)}</span><button type="button" class="btn-del" data-action="delgoal" data-scope="ym" data-month="${m}" data-id="${g.id}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">${window.TaskFlowUI.icon('trash')}</button></li>`).join('')}
                <li class="goal-item add-item"><button type="button" class="btn-add" data-action="addgoal" data-scope="ym" data-month="${m}" data-kind="regular" aria-label="${t('addRegGoalAria')}" title="${t('addRegGoalAria')}">${window.TaskFlowUI.icon('plus')}</button></li>
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
  return `<h3 class="ref-title">${t('refQ', { n: qn })}</h3>
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
  return `<div class="tag-filter-bar"><span class="tag-filter-lbl">${t('tagFilter')}</span>${chips.join('')}${tagFilter ? `<button type="button" class="tag-chip tag-clear" data-action="tagfilter" data-tag="">${window.TaskFlowUI.icon('close')} ${t('tagAll')}</button>` : ''}</div>`;
}

function renderWeek() {
  // PURE render: không materialize dữ liệu ở đây — recurrence/carry-over chạy qua
  // prepareTodayState() ở data lifecycle (boot/rollover/month/account). Việc mở view
  // Tuần không được làm thay đổi mảng task của hôm nay.
  const el = document.getElementById('view-week');
  const w = state.weeks[state.currentWeek - 1];
  const st = weekStats(w);
  const ti = nowInfo(PLAN_START, NUM_DAYS, PLAN_YEAR, PLAN_MONTH);
  const weeklyReviewModel = buildWeeklyReviewModel(state, state.currentWeek - 1, {
    planStart: PLAN_START,
    year: PLAN_YEAR,
    month: PLAN_MONTH,
    monthDays: NUM_DAYS,
    focusMinutes: focusWeekMinutes(w.n).reduce((sum, minutes) => sum + minutes, 0),
    legacyPrompts: REFLECT_PROMPTS_WEEK(),
  });
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
            <button type="button" class="pop-btn" data-action="pomo-reset" aria-label="${t('pomoReset')}" title="${t('pomoReset')}">${window.TaskFlowUI.icon('refresh')}</button>
            <button type="button" class="pop-btn" data-action="pomo-mode" data-mode="work">${t('pomoWork')}</button>
            <button type="button" class="pop-btn" data-action="pomo-mode" data-mode="break">${t('pomoBreak')}</button>
          </div>
          <div class="pomo-widget-stats" id="pomoWidgetStats"></div>
          <div class="pomo-tomato-wrap" id="pomoWidgetTomato"></div>
        </div>
        ${focusChartCardHTML(w)}
        ${weeklyReviewHTML(weeklyReviewModel, { t, esc, formatFocusTime })}
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
            <button type="button" class="btn-del" data-action="delgoal" data-scope="w" data-week="${w.n}" data-id="${gi}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">${window.TaskFlowUI.icon('trash')}</button>
          </div>`).join('')}
          <div class="legend-goal"><button type="button" class="btn-add" data-action="addgoal" data-scope="w" data-week="${w.n}" data-kind="priority" aria-label="${t('addPriGoalAria')}" title="${t('addPriGoalAria')}">${window.TaskFlowUI.icon('plus')}</button></div>
        </div>
      </div>
      <div class="legend-col">
        <div class="v-strip blue"><span>${t('regLbl')}</span></div>
        <div class="legend-goals">
          <span class="section-sub-title">${t('regGoalsSub')}</span>
          ${reg.map(({ g, gi }) => `<div class="legend-goal" draggable="true" data-drag="goal" data-scope="w" data-week="${w.n}" data-id="${gi}" title="${t('dragHint')}">
            ${checkboxHTML('blue', g.done, `data-action="wgoal" data-week="${w.n}" data-id="${gi}"`, window.TaskFlowUI.checkboxLabel('goal', g.text, t('weekN', { n: w.n })))}
            <span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="w-goal-text" data-week="${w.n}" data-id="${gi}" data-placeholder="${t('yGoalPh')}" aria-label="${t('wGoalAria', { n: gi + 1 })}">${esc(g.text)}</span>
            <button type="button" class="btn-del" data-action="delgoal" data-scope="w" data-week="${w.n}" data-id="${gi}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">${window.TaskFlowUI.icon('trash')}</button>
          </div>`).join('')}
          <div class="legend-goal"><button type="button" class="btn-add" data-action="addgoal" data-scope="w" data-week="${w.n}" data-kind="regular" aria-label="${t('addRegGoalAria')}" title="${t('addRegGoalAria')}">${window.TaskFlowUI.icon('plus')}</button></div>
        </div>
      </div>
    </div>`;
}

function dayColumnHTML(w, di, isToday, inDayView) {
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
        ${inDayView ? '' : `<button type="button" class="btn-day-open" data-action="open-day" data-week="${w.n}" data-day="${di}" title="${t('dayOpenT')}" aria-label="${t('dayOpenT')}">${window.TaskFlowUI.icon('expand')}</button>`}
      </div>
    </header>
    <div class="week-day-progress" data-role="day-progress" data-day="${di}" role="progressbar" aria-label="${dayLabel(di)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><span data-role="day-progress-fill" style="width:${p}%"></span></div>
    ${d.sticky ? `<div class="sticky-note-box"><span>${esc(d.sticky)}</span></div>` : ''}
    <div class="mood-row" role="group" aria-label="${t('moodTitle')}" data-i18n-aria="moodTitle">
      ${MOODS.map((m, i) => `<button type="button" class="mood-btn${moodMap[moodDateKey(d.date, PLAN_YEAR, PLAN_MONTH)] === i ? ' on' : ''}" data-action="mood" data-day-key="${moodDateKey(d.date, PLAN_YEAR, PLAN_MONTH)}" data-mood="${i}" title="${t(m.labelKey)}" aria-label="${t(m.labelKey)}">${m.icon}</button>`).join('')}
    </div>
    <div class="day-tasks">
      <div class="task-group">
        <div class="v-strip pink"><span>${t('priLbl')}</span></div>
        <div class="task-rows" data-drop="taskzone" data-week="${w.n}" data-day="${di}" data-kind="priority">
          <span class="task-sub-head">${t('taskPriSub')}</span>
          ${pri.map(({ t, ti }, i) => taskRowHTML(w.n, di, ti, 'pink', t, i)).join('')}
          <button type="button" class="btn-add" data-action="addtask" data-week="${w.n}" data-day="${di}" data-kind="priority" aria-label="${t('addPriTaskAria')}" title="${t('addPriTaskAria')}">${window.TaskFlowUI.icon('plus')}</button>
        </div>
      </div>
      <div class="task-group">
        <div class="v-strip blue"><span>${t('regLbl')}</span></div>
        <div class="task-rows" data-drop="taskzone" data-week="${w.n}" data-day="${di}" data-kind="regular">
          <span class="task-sub-head">${t('taskRegSub')}</span>
          ${reg.map(({ t, ti }, i) => taskRowHTML(w.n, di, ti, 'blue', t, i)).join('')}
          <button type="button" class="btn-add" data-action="addtask" data-week="${w.n}" data-day="${di}" data-kind="regular" aria-label="${t('addRegTaskAria')}" title="${t('addRegTaskAria')}">${window.TaskFlowUI.icon('plus')}</button>
        </div>
      </div>
    </div>
    <div class="day-note">
      <div class="note-banner">${t('noteBanner')}</div>
      <div class="note-area" contenteditable="true" spellcheck="false" data-note="${w.n}-${di}" data-placeholder="..." aria-label="${t('noteAria', { name: dayLabel(di) })}">${esc(d.note).replace(/\n/g, '<br>')}</div>
    </div>
  </section>`;
}

/* ---------- Xem ngày (Day view full-screen) ---------- */

// Chỉ số 0-based của ngày trong tháng (theo d.date "D/M") — dùng cho habits; -1 nếu ngoài tháng
function dayOfMonthIndex(d) {
  const m = /^(\d{1,2})\//.exec(String(d.date || ''));
  return m ? +m[1] - 1 : -1;
}
function dayHabitsHTML(d, di) {
  const dayIdx = dayOfMonthIndex(d);
  if (dayIdx < 0 || dayIdx >= NUM_DAYS) return ''; // ngày thuộc tháng khác (lưới tuần) → ẩn habits
  const habits = Array.isArray(state.habits) ? state.habits : [];
  if (!habits.length) return `<p class="week-empty-state">${t('weekHabitsEmpty')}</p>`;
  const rows = habits.map((h) => {
    const on = Array.isArray(h.days) && h.days[dayIdx] === true;
    const skipped = Array.isArray(h.skipDays) && h.skipDays.includes(dayIdx);
    if (skipped) {
      // Ngày bị bỏ qua (skipDays) → không cho tích, hiển thị mờ — nhất quán với overview/tuần
      return `<div class="day-habit-row skipped" title="${t('habitSkipped', { name: h.name })}"><span class="day-habit-skip" aria-hidden="true">–</span><span class="day-habit-name">${esc(h.name)}</span></div>`;
    }
    return `<div class="day-habit-row${on ? ' done' : ''}">
      ${checkboxHTML('', on, `data-action="habit" data-id="${esc(h.id)}" data-day="${dayIdx}"`, window.TaskFlowUI.checkboxLabel('habit', h.name, `${dayLabel(di)} ${d.date}/${d.yy}`))}
      <span class="day-habit-name">${esc(h.name)}</span>
    </div>`;
  }).join('');
  return `<div class="day-habit-list">${rows}</div>`;
}
function renderDay() {
  const el = document.getElementById('view-day');
  if (!el) return;
  const w = state.weeks[state.dayWeek - 1];
  if (!w) { el.innerHTML = ''; return; }
  const di = Math.max(0, Math.min(6, state.dayDay));
  const d = w.days[di];
  const isToday = isDayToday(d);
  el.innerHTML = `
    <div class="day-view-page">
      <header class="day-view-header">
        <div class="day-view-heading">
          <p class="day-view-eyebrow">${t('dayViewEyebrow')}</p>
          <h1 class="day-view-title">${dayLabel(di)} · ${esc(d.date)}/${d.yy}</h1>
          <p class="day-view-subtitle">${t('dayViewSubtitle')}${isToday ? ` <span class="today-badge">${t('todayBadge')}</span>` : ''}</p>
        </div>
        <div class="day-view-actions">
          <button type="button" class="btn-nav" data-action="day-prev" title="${t('prevDay')}" aria-label="${t('prevDay')}">${t('prevDay')}</button>
          <button type="button" class="btn-nav" data-action="day-next" title="${t('nextDay')}" aria-label="${t('nextDay')}">${t('nextDay')}</button>
          <button type="button" class="pop-btn day-view-back" data-action="close-day" title="${t('backToWeek')}" aria-label="${t('backToWeek')}">${window.TaskFlowUI.icon('week')}<span>${t('backToWeek')}</span></button>
        </div>
      </header>
      <section class="day-view-habits" aria-label="${t('weekHabitsHeading')}">
        <h2 class="week-section-title">${t('weekHabitsHeading')}</h2>
        ${dayHabitsHTML(d, di)}
      </section>
      ${dayColumnHTML(w, di, isToday, true)}
    </div>`;
}
function openDay(week, day) {
  const wk = Number.isFinite(+week) ? +week : 1;
  const dd = Number.isFinite(+day) ? +day : 0;
  state.dayWeek = Math.min(NUM_WEEKS, Math.max(1, wk));
  state.dayDay = Math.max(0, Math.min(6, dd));
  // Truyền week vào setView để đồng bộ currentWeek + dựng lại nav (highlight tab tuần đúng)
  setView('day', state.dayWeek);
}
function goDay(offset) {
  const idx = (state.dayWeek - 1) * 7 + state.dayDay + offset;
  const total = NUM_WEEKS * 7;
  const c = Math.max(0, Math.min(total - 1, idx));
  state.dayWeek = Math.floor(c / 7) + 1;
  state.dayDay = c % 7;
  setView('day', state.dayWeek);
}

// Today Dashboard (todayGreeting, todayWeekdayLabel, renderToday, totalFocusMinutesToday,
// taskRowHTML) được tách sang js/today.js (window.TaskFlowToday, extraction 34 — R19).
// taskRowHTML là row renderer dùng chung cho week/today. Deps (t, esc, dateLocale,
// fmtDeadline, dayLabel, checkboxHTML, nowInfo, habitStreakCached, formatFocusTime,
// loadPomoLog, pomoDateKey, window.TaskFlowUI, emptyStateHTML, taskFocusSecs/taskFocusLog,
// carriedDateLabel, state, viewedMonth, tagFilter, PLAN_*/NUM_DAYS) resolve qua global
// lexical tại thời điểm GỌI — pattern mood.js/popups.js.
if (!window.TaskFlowAlignment) throw new Error('TaskFlowAlignment missing — js/alignment.js failed to load');
if (!window.TaskFlowToday) throw new Error('TaskFlowToday missing — js/today.js failed to load');
const { todayGreeting, todayWeekdayLabel, renderToday, totalFocusMinutesToday, taskRowHTML } = window.TaskFlowToday;

/* ============================ Phase 5: Task Detail Drawer ============================ */

// Con trỏ tới task đang xem trong drawer: { y, m, week, day, task }.
// y/m là tháng chứa task — mặc định tháng hiện tại; khi mở từ Upcoming có thể là tháng khác.
let taskDetailRef = null;
// State tháng chứa task khi ≠ tháng hiện tại (cache để mọi td-* handler mutate đúng state).
let taskDetailMonthState = null;

function taskDetailState() {
  if (!taskDetailRef) return null;
  if (taskDetailRef.y === PLAN_YEAR && taskDetailRef.m === PLAN_MONTH) return state;
  if (!taskDetailMonthState) taskDetailMonthState = monthStateRaw(taskDetailRef.y, taskDetailRef.m);
  return taskDetailMonthState;
}

function saveTaskDetailState() {
  if (!taskDetailRef) { save(); return; }
  if (taskDetailRef.scope === 'inbox') { saveInbox(inbox); return; }
  if (taskDetailRef.y === PLAN_YEAR && taskDetailRef.m === PLAN_MONTH) { save(); return; }
  if (taskDetailMonthState) saveMonthState(taskDetailRef.y, taskDetailRef.m, taskDetailMonthState);
}

function getTaskDetailTarget() {
  if (!taskDetailRef) return null;
  if (taskDetailRef.scope === 'inbox') {
    const tk = inbox[taskDetailRef.task];
    return tk ? { w: null, d: null, tk } : null;
  }
  const st = taskDetailState();
  if (!st) return null;
  const w = st.weeks && st.weeks[taskDetailRef.week - 1];
  if (!w) return null;
  const d = w.days && w.days[taskDetailRef.day];
  if (!d) return null;
  const tk = d.tasks && d.tasks[taskDetailRef.task];
  return tk ? { w, d, tk } : null;
}

function openInboxTaskDetail(i) {
  taskDetailRef = { scope: 'inbox', task: i };
  taskDetailMonthState = null;
  // Ưu tiên nút ⋯ (focusable) làm điểm trả focus khi đóng drawer
  const opener = document.querySelector(`[data-action="task-detail"][data-scope="inbox"][data-task="${i}"][type="button"]`)
    || document.querySelector(`[data-action="task-detail"][data-scope="inbox"][data-task="${i}"]`);
  renderTaskDetail();
  TaskFlowUI.openDrawer('taskDrawer', opener);
  const b = document.getElementById('taskDetailBackdrop');
  if (b) b.hidden = false;
}

function openTaskDetail(week, day, task, y, m) {
  taskDetailRef = { y: y === undefined ? PLAN_YEAR : y, m: m === undefined ? PLAN_MONTH : m, week, day, task };
  taskDetailMonthState = null;
  const opener = document.querySelector(`[data-action="task-detail"][data-week="${week}"][data-day="${day}"][data-task="${task}"]`);
  renderTaskDetail();
  TaskFlowUI.openDrawer('taskDrawer', opener);
  const b = document.getElementById('taskDetailBackdrop');
  if (b) b.hidden = false;
}

function closeTaskDetail() {
  TaskFlowUI.closeDrawer('taskDrawer');
  const b = document.getElementById('taskDetailBackdrop');
  if (b) b.hidden = true;
  // P2.3: focus restore fallback. The drawer's saved opener is the row ⋯ menuitem,
  // but opening the drawer closes the menu (document click handler), so the opener is
  // hidden by close time and ui.js's restoreLayerFocus skips it -> focus falls to body.
  // Return focus to the row's ⋯ trigger instead (APG: focus returns to the opener).
  const ae = document.activeElement;
  if (!ae || ae === document.body || !ae.getClientRects || !ae.getClientRects().length) {
    const ref = taskDetailRef;
    if (ref) {
      const row = document.querySelector(
        `.task-row[data-week="${ref.week}"][data-day="${ref.day}"][data-task="${ref.task}"]`);
      const trig = row && row.querySelector('[data-action="task-menu"]');
      if (trig && typeof trig.focus === 'function') trig.focus();
    }
  }
  taskDetailRef = null;
  taskDetailMonthState = null;
}

// Đồng bộ row task bên dưới sau khi sửa field trong drawer (không đóng drawer).
// Lưu đúng tháng chứa task (drawer có thể mở từ Upcoming cho task tháng khác).
function refreshTaskRowAfterEdit() {
  if (state.view === 'today') renderToday();
  else if (state.view === 'week') renderWeek();
  else if (state.view === 'upcoming') renderUpcoming();
  else if (state.view === 'inbox') renderInbox(inbox);
  saveTaskDetailState();
}

function taskMetricLinksHTML(monthState, task, inInbox) {
  const selected = new Set(normalizeTaskMetricIds(task));
  const pillars = inInbox ? [] : visiblePillars(monthState)
    .map((pillar) => ({ ...pillar, metrics: Array.isArray(pillar.metrics) ? pillar.metrics.filter(Boolean) : [] }))
    .filter((pillar) => pillar.metrics.length);
  let content = '';
  if (inInbox) {
    content = `<p class="td-empty">${t('taskLinkedMetricsInbox')}</p>`;
  } else if (!pillars.length) {
    content = `<p class="td-empty">${t('taskLinkedMetricsEmpty')}</p>`;
  } else {
    content = pillars.map((pillar) => `<div class="td-metric-pillar">
      <span class="td-metric-pillar-name"><span aria-hidden="true">${esc(pillar.icon)}</span>${esc(pillar.name)}</span>
      <div class="td-metric-options">
        ${pillar.metrics.map((metric) => `<label class="td-metric-option">
          <input type="checkbox" data-action="td-metric-link" data-metric-id="${esc(metric.id)}"
            ${selected.has(metric.id) ? 'checked' : ''}
            aria-label="${t('taskLinkedMetricAria', { pillar: pillar.name, metric: metric.title })}">
          <span>${esc(metric.title) || t('metricUntitled')}</span>
        </label>`).join('')}
      </div>
    </div>`).join('');
  }
  return `<fieldset class="td-linked-metrics" data-role="td-linked-metrics">
    <legend>${t('taskLinkedMetrics')}</legend>
    ${content}
  </fieldset>`;
}

function renderTaskDetail() {
  const drawer = document.getElementById('taskDrawer');
  const body = drawer && drawer.querySelector('[data-role="td-body"]');
  const kicker = document.getElementById('taskDrawerKicker');
  const tgt = getTaskDetailTarget();
  if (!drawer) return;
  if (!tgt) { if (body) body.innerHTML = ''; if (kicker) kicker.textContent = ''; return; }
  const { w, tk } = tgt;
  const timed = !!(tk.remind && tk.remind.enabled);
  const tags = Array.isArray(tk.tags) ? tk.tags : [];
  const subs = Array.isArray(tk.subtasks) ? tk.subtasks : [];
  const rep = tk.repeat && tk.repeat.freq ? tk.repeat.freq : '';
  const inInbox = taskDetailRef.scope === 'inbox';
  if (kicker) kicker.textContent = inInbox ? t('tabInbox') : `${t('weekN', { n: w.n })} · ${dayLabel(taskDetailRef.day)}`;
  const subDone = subs.filter((s) => s.done).length;
  // Ngày mặc định cho picker lên lịch (local, tránh lệch UTC)
  const _d = new Date();
  const todayIso = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`;
  body.innerHTML = `
      <div class="td-text-wrap">
        <span class="td-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="td-text" data-placeholder="${t('taskPh')}" aria-label="${t('taskAria', { n: taskDetailRef.task + 1 })}">${esc(tk.text ?? '')}</span>
      </div>
      <div class="td-focus-row">
        <span class="td-focus-stats" title="${t('focusLogTotal', { n: Math.round(taskFocusSecs(tk) / 60) })}">${window.TaskFlowUI.icon('focus')}<span>${taskFocusSecs(tk) > 0 ? esc(formatFocusTime(Math.round(taskFocusSecs(tk) / 60))) : t('focusNoSessions')}</span></span>
        <button type="button" class="td-focus-btn" data-action="focus-task" ${inInbox ? `data-scope="inbox"` : `data-week="${taskDetailRef.week}" data-day="${taskDetailRef.day}"`} data-task="${taskDetailRef.task}">${window.TaskFlowUI.icon('focus')}<span>${t('taskFocusBtn')}</span></button>
      </div>
      <div class="task-drawer-fields">
        ${inInbox ? `<label class="td-field">
          <span class="td-field-label">${t('inboxScheduleBtn')}</span>
          <span class="td-inbox-schedule">
            <button type="button" class="pop-btn" data-action="inbox-today" data-task="${taskDetailRef.task}">${t('inboxScheduleToday')}</button>
            <button type="button" class="pop-btn" data-action="inbox-tomorrow" data-task="${taskDetailRef.task}">${t('inboxScheduleTomorrow')}</button>
            <input type="date" data-role="inbox-date" value="${todayIso}" aria-label="${t('inboxScheduleDateLbl')}">
            <button type="button" class="pop-btn primary" data-action="inbox-date-schedule" data-task="${taskDetailRef.task}">${t('inboxScheduleBtn')}</button>
          </span>
        </label>` : `<label class="td-field">
          <span class="td-field-label">${t('taskDetailDate')}</span>
          <select data-action="td-date" aria-label="${t('taskDetailDate')}">
            ${[0, 1, 2, 3, 4, 5, 6].map((di) => `<option value="${di}" ${di === taskDetailRef.day ? 'selected' : ''}>${dayLabel(di)}</option>`).join('')}
          </select>
        </label>`}
        <label class="td-field">
          <span class="td-field-label">${t('taskDetailDeadline')}</span>
          <input type="date" data-action="td-deadline" value="${esc(tk.deadline ?? '')}" aria-label="${t('taskDetailDeadline')}">
        </label>
        <div class="td-field">
          <span class="td-field-label">${t('taskDetailTime')}</span>
          <span class="td-time-row">
            <label class="td-toggle"><input type="checkbox" data-action="td-time-toggle" ${timed ? 'checked' : ''} aria-label="${t('remindTaskAria')}">${window.TaskFlowUI.icon('bell')}</label>
            <input type="time" data-action="td-time" value="${esc((tk.remind && tk.remind.time) || '20:00')}" ${timed ? '' : 'disabled'} aria-label="${t('taskDetailTime')}">
          </span>
        </div>
        <div class="td-field">
          <span class="td-field-label">${t('taskDetailDuration')}</span>
          <input type="number" min="0" step="5" value="${tk.duration ?? ''}" placeholder="—" data-action="td-duration" aria-label="${t('taskDetailDuration')}">
        </div>
        <div class="td-field">
          <span class="td-field-label">${t('taskDetailPriority')}</span>
          <label class="td-toggle td-prio"><input type="checkbox" data-action="td-prio" ${tk.kind === 'priority' ? 'checked' : ''} aria-label="${t('taskDetailPriority')}"><span class="td-prio-badge">${t('taskPriorityLabel')}</span></label>
        </div>
        <label class="td-field">
          <span class="td-field-label">${t('taskDetailRepeat')}</span>
          <select data-action="td-repeat" aria-label="${t('taskDetailRepeat')}">
            <option value="" ${rep === '' ? 'selected' : ''}>${t('repeatOff')}</option>
            <option value="daily" ${rep === 'daily' ? 'selected' : ''}>${t('repeatDaily')}</option>
            <option value="weekly" ${rep === 'weekly' ? 'selected' : ''}>${t('repeatWeekly')}</option>
            <option value="monthly" ${rep === 'monthly' ? 'selected' : ''}>${t('repeatMonthly')}</option>
          </select>
        </label>
      </div>
      ${taskMetricLinksHTML(taskDetailState(), tk, inInbox)}
      ${ProjectsUI.taskLinkSelectsHTML(loadProjectsStore(), tk)}
      ${planningMetaHTML(tk)}
      ${TimeBlocksUI.taskDetailBlocksHTML(loadTimeBlocksStore(), tk.uid)}
      <div class="td-field">
        <span class="td-field-label">${t('taskDetailTags')}</span>
        <div class="td-tags">
          ${tags.length ? tags.map((tg) => `<span class="tag-chip td-tag">#${esc(tg)}<button type="button" class="td-tag-del" data-action="td-tag-del" data-tag="${esc(tg)}" aria-label="${t('tagDelAria', { tag: tg })}" title="${t('tagDelAria', { tag: tg })}">${window.TaskFlowUI.icon('close')}</button></span>`).join('') : `<span class="td-empty">—</span>`}
        </div>
        <span class="td-add-row"><input type="text" data-role="td-tag-input" placeholder="${t('tagAdd')}" maxlength="40" aria-label="${t('tagAdd')}"><button type="button" class="td-add-btn" data-action="td-tag-add" aria-label="${t('tagAdd')}">${window.TaskFlowUI.icon('plus')}</button></span>
      </div>
      <div class="td-field">
        <span class="td-field-label">${t('taskDetailNotes')}</span>
        <textarea class="td-note" data-action="td-note" rows="3" placeholder="—" aria-label="${t('taskDetailNotes')}">${esc(tk.notes ?? '')}</textarea>
      </div>
      <div class="td-field">
        <span class="td-field-label">${t('taskDetailSubtasks')}${subs.length ? ` <span class="td-sub-count">${subDone}/${subs.length}</span>` : ''}</span>
        <div class="td-subtasks">
          ${subs.length ? subs.map((s, i) => `<div class="td-subtask ${s.done ? 'done' : ''}">${checkboxHTML('blue', s.done, `data-action="subtask-toggle" data-sub="${i}"`, window.TaskFlowUI.checkboxLabel('subtask', s.text, `${t('taskDetailSubtasks')} ${i + 1}`))}<span class="td-subtask-text">${esc(s.text)}</span><button type="button" class="td-subtask-del" data-action="subtask-del" data-sub="${i}" aria-label="${t('delTaskAria', { n: i + 1 })}" title="${t('delTaskAria', { n: i + 1 })}">${window.TaskFlowUI.icon('trash')}</button></div>`).join('') : `<p class="td-empty">${t('taskDetailSubtaskPh')}</p>`}
        </div>
        <span class="td-add-row"><input type="text" data-role="td-subtask-input" placeholder="${t('taskDetailSubtaskPh')}" maxlength="120" aria-label="${t('taskDetailAddSubtask')}"><button type="button" class="td-add-btn" data-action="subtask-add" aria-label="${t('taskDetailAddSubtask')}">${window.TaskFlowUI.icon('plus')}</button></span>
      </div>
      <button type="button" class="td-delete danger" data-action="td-delete" ${inInbox ? `data-scope="inbox"` : `data-week="${taskDetailRef.week}" data-day="${taskDetailRef.day}"`} data-task="${taskDetailRef.task}">${t('taskDetailDelete')}</button>`;
  bindTaskDetailEvents(drawer);
}

// V1.2.1 — Planning metadata (energy + context chips). Không thêm vào Quick Add.
// estimatedMinutes map tới task.duration (field td-duration CÓ SẴN ở trên) — không
// nhân đôi control. Trả HTML compact; đọc store contexts mỗi lần render drawer.
function planningMetaHTML(tk) {
  const en = Contexts.taskEnergy(tk);
  const ctxStore = Contexts.loadContexts();
  const sel = new Set(Contexts.taskContextIds(tk));
  const energyBtns = Contexts.ENERGY_LEVELS.map((lv) => {
    const on = en === lv;
    return `<button type="button" class="td-energy-btn${on ? ' active' : ''}" data-action="td-energy" data-level="${lv}" aria-pressed="${on ? 'true' : 'false'}">${t('energy' + (lv === 'low' ? 'Low' : lv === 'medium' ? 'Medium' : 'High'))}</button>`;
  }).join('');
  const clearBtn = en ? `<button type="button" class="td-energy-clear" data-action="td-energy" data-level="" aria-label="${t('energyNone')}" title="${t('energyNone')}">${window.TaskFlowUI.icon('close')}</button>` : '';
  const chips = Array.isArray(ctxStore.contexts) && ctxStore.contexts.length
    ? ctxStore.contexts.map((c) => {
        const on = sel.has(c.id);
        return `<button type="button" class="td-ctx-chip${on ? ' active' : ''}" data-action="td-ctx-toggle" data-ctx="${esc(c.id)}" aria-pressed="${on ? 'true' : 'false'}">${esc(c.label)}</button>`;
      }).join('')
    : `<span class="td-empty">—</span>`;
  return `<div class="td-field">
    <span class="td-field-label">${t('energyLabel')}</span>
    <span class="td-energy-row" role="group" aria-label="${t('energyLabel')}">${energyBtns}${clearBtn}</span>
  </div>
  <div class="td-field">
    <span class="td-field-label">${t('taskDetailContext')}</span>
    <span class="td-ctx-row">${chips}</span>
    <span class="td-add-row"><button type="button" class="pop-btn" data-action="ctx-manage">${window.TaskFlowUI.icon('settings')}<span>${t('ctxManage')}</span></button></span>
  </div>`;
}

// Gắn listener riêng cho các control 'change'/'input' (không qua dispatcher click).
function bindTaskDetailEvents(drawer) {
  const txt = drawer.querySelector('[data-role="td-text"]');
  if (txt) {
    txt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); txt.blur(); }
    });
    txt.addEventListener('blur', () => {
      const g = getTaskDetailTarget();
      if (!g) return;
      const v = (txt.innerText || '').replace(/\s+$/g, '');
      if (g.tk.text !== v) { g.tk.text = v; refreshTaskRowAfterEdit(); trackEvent('edit_task_text'); }
    });
  }
  const timeIn = drawer.querySelector('[data-action="td-time"]');
  if (timeIn) {
    timeIn.addEventListener('change', () => {
      const g = getTaskDetailTarget();
      if (!g) return;
      if (!g.tk.remind) g.tk.remind = { enabled: false, time: '20:00' };
      g.tk.remind.time = timeIn.value || '20:00';
      refreshTaskRowAfterEdit();
    });
  }
  const durIn = drawer.querySelector('[data-action="td-duration"]');
  if (durIn) {
    durIn.addEventListener('change', () => {
      const g = getTaskDetailTarget();
      if (!g) return;
      g.tk.duration = durIn.value === '' ? undefined : Math.max(0, +durIn.value || 0);
      refreshTaskRowAfterEdit();
      trackEvent('edit_task_duration');
    });
  }
  const repSel = drawer.querySelector('[data-action="td-repeat"]');
  if (repSel) {
    repSel.addEventListener('change', () => {
      const g = getTaskDetailTarget();
      if (!g) return;
      g.tk.repeat = repSel.value ? { freq: repSel.value, every: 1 } : null;
      refreshTaskRowAfterEdit();
      trackEvent('repeat_set');
    });
  }
  const dateSel = drawer.querySelector('[data-action="td-date"]');
  if (dateSel) {
    dateSel.addEventListener('change', () => {
      const g = getTaskDetailTarget();
      const toDay = +dateSel.value;
      if (!g || !g.w || toDay === taskDetailRef.day || !window.PlanMath) return;
      const result = window.PlanMath.moveTaskAcrossDays(g.d.tasks, g.w.days[toDay].tasks, taskDetailRef.task, g.tk.kind || 'regular');
      if (result.tasksFrom === g.d.tasks && result.tasksTo === g.w.days[toDay].tasks) { dateSel.value = String(taskDetailRef.day); return; }
      pushUndo();
      g.d.tasks = result.tasksFrom;
      g.w.days[toDay].tasks = result.tasksTo;
      taskDetailRef = { y: taskDetailRef.y, m: taskDetailRef.m, week: taskDetailRef.week, day: toDay, task: g.w.days[toDay].tasks.length - 1 };
      renderTaskDetail();
      refreshTaskRowAfterEdit();
      trackEvent('move_task_across_days');
    });
  }
  const dlIn = drawer.querySelector('[data-action="td-deadline"]');
  if (dlIn) {
    dlIn.addEventListener('change', () => {
      const g = getTaskDetailTarget();
      if (!g) return;
      g.tk.deadline = dlIn.value || undefined;
      refreshTaskRowAfterEdit();
      trackEvent('edit_task_deadline');
    });
  }
  const subInput = drawer.querySelector('[data-role="td-subtask-input"]');
  if (subInput) {
    subInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const b = drawer.querySelector('[data-action="subtask-add"]'); if (b) b.click(); }
    });
  }
  const tagInput = drawer.querySelector('[data-role="td-tag-input"]');
  if (tagInput) {
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const b = drawer.querySelector('[data-action="td-tag-add"]'); if (b) b.click(); }
    });
  }
  const noteTa = drawer.querySelector('[data-action="td-note"]');
  if (noteTa) {
    // Lưu khi blur (change) thay vì từng phím — tránh ghi localStorage mỗi keystroke
    noteTa.addEventListener('change', () => {
      const g = getTaskDetailTarget();
      if (!g) return;
      g.tk.notes = noteTa.value;
      save();
    });
  }
  drawer.querySelectorAll('[data-action="td-metric-link"]').forEach((input) => {
    input.addEventListener('change', () => {
      const g = getTaskDetailTarget();
      if (!g) return;
      const ids = Array.from(drawer.querySelectorAll('[data-action="td-metric-link"]:checked'))
        .map((item) => item.dataset.metricId);
      setTaskMetricIds(g.tk, ids);
      saveTaskDetailState();
      if (state.view === 'overview') rerenderPillars();
      trackEvent('link_task_metric', { count: ids.length });
    });
  });
}

/* ============================ Phase 2: Tìm kiếm xuyên tháng ============================ */
// openSearchModal/closeSearchModal/runSearch/renderSearchResults/goSearchResult được tách
// sang js/search.js (window.TaskFlowSearch) — P11 extraction 22. Lazy-load (P1.5): module
// không nằm trong chuỗi script boot, chỉ nạp khi mở search lần đầu (runLazyModule). Module
// đọc state app-level + helper resolve qua global scope tại thời điểm GỌI — pattern inbox.js.

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

// Ngày hiện tại dạng 'YYYY-MM-DD' local (không dùng toISOString — lệch UTC).
function localTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Calendar page shell — header (heading + segmented mode toggle + legend slot) is
// rendered ONCE and survives Month ↔ Schedule switches, so the .cal-mode-toggle DOM
// node (and its grid-column position) never changes. Only .calendar-mode-content is
// swapped per mode — no whole-view innerHTML churn, no flash, focus preserved.
function ensureCalendarShell() {
  const el = document.getElementById('view-calendar');
  let page = el.querySelector(':scope > .calendar-page');
  if (page) return page;
  page = document.createElement('div');
  page.className = 'calendar-page';
  // P0: mode attribute trên view để CSS phân biệt tháng (fixed-height grid có
  // cuộn nội bộ) vs schedule (document là scroll container). Set ngay khi tạo
  // shell để không có frame nào mất scope trước lần render đầu.
  el.setAttribute('data-cal-mode', calendarMode);
  page.innerHTML = `<header class="calendar-page-header">
      <div class="calendar-page-heading">
        <p class="calendar-page-eyebrow">${t('calendarWorkspaceEyebrow')}</p>
        <h1 class="calendar-page-title" data-role="cal-title"></h1>
        <p class="calendar-page-subtitle">${t('calendarPageSubtitle')}</p>
      </div>
      <div class="cal-mode-toggle segmented segmented--accent" role="group" aria-label="${esc(t('calModeToggleAria'))}">
        <button type="button" class="segmented-item" data-action="cal-mode" data-mode="month" aria-pressed="false">${esc(t('calModeMonth'))}</button>
        <button type="button" class="segmented-item" data-action="cal-mode" data-mode="schedule" aria-pressed="false">${esc(t('calModeSchedule'))}</button>
      </div>
      <div class="cal-legend" data-role="cal-legend"></div>
    </header>
    <div class="calendar-mode-content" data-role="cal-content"></div>`;
  el.replaceChildren(page);
  return page;
}

// Đồng bộ trạng thái toggle + tiêu đề tháng trên shell đã tồn tại (không rebuild).
function syncCalendarShell(page) {
  // P0: đồng bộ data-cal-mode trên #view-calendar mỗi lần render (cả month lẫn
  // schedule) — CSS scope theo mode: month giữ fixed-height + overflow:hidden
  // (grid khớp viewport, cell cuộn nội bộ), schedule để document scroll tự nhiên.
  const viewEl = document.getElementById('view-calendar');
  if (viewEl) viewEl.setAttribute('data-cal-mode', calendarMode);
  const title = page.querySelector('[data-role="cal-title"]');
  if (title) {
    const next = t('calendarPageTitle', { m: monthLabel(PLAN_MONTH), y: PLAN_YEAR });
    if (title.textContent !== next) title.textContent = next;
  }
  page.querySelectorAll('.cal-mode-toggle [data-action="cal-mode"]').forEach((btn) => {
    const on = btn.dataset.mode === calendarMode;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

// Schedule view: timeline 1 ngày cho TimeBlocks — chỉ swap vùng content.
// skipGcalRefresh=true: đang ở trong chu trình refresh Google (đã fetch xong) —
// tránh loop render→refresh→render. Dùng cho onChange sau khi refresh/cache đổi.
function renderCalendarSchedule(skipGcalRefresh) {
  const todayIso = localTodayIso();
  if (!calendarSelDate) calendarSelDate = todayIso;
  const sel = TimeBlocksUI.parseISO(calendarSelDate);
  if (!sel) calendarSelDate = todayIso;
  const page = ensureCalendarShell();
  syncCalendarShell(page);
  const legend = page.querySelector('[data-role="cal-legend"]');
  if (legend) legend.innerHTML = '';
  const blocks = loadTimeBlocksStore();
  const monthStart = `${PLAN_YEAR}-${String(PLAN_MONTH + 1).padStart(2, '0')}-01`;
  const nd = new Date(PLAN_YEAR, PLAN_MONTH + 1, 0).getDate();
  const monthEnd = `${PLAN_YEAR}-${String(PLAN_MONTH + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
  const content = page.querySelector('[data-role="cal-content"]');
  const gcalTimeline = gcalTimelineData(calendarSelDate);
  content.innerHTML = `${TimeBlocksUI.scheduleViewHTML({
      store: blocks,
      date: calendarSelDate,
      state,
      inbox,
      planStart: PLAN_START,
      todayIso,
      monthStart,
      monthEnd,
      blockActions: gcalBlockActions,
      unscheduledExpanded: calendarUnscheduledExpanded,
      googleEvents: gcalTimeline ? gcalTimeline.events : undefined,
      gcalMappedKeys: gcalTimeline ? gcalTimeline.mappedKeys : undefined,
    })}
    <div id="gcal-section-host">${gcalScheduleSection(calendarSelDate, monthStart, monthEnd)}</div>`;
  if (!skipGcalRefresh) scheduleGcalRefresh(calendarSelDate || todayIso, monthStart, monthEnd);
}

/* ============ V1.6A Google Calendar (read-only) — section + actions ============ */

// Google events external cho timeline của 1 ngày (từ cache — KHÔNG fetch network ở
// đây; timeblocks-ui không sở hữu network/cache). Dedup: event Google là mirror của
// TimeBlock đã export (mapping) → không vẽ lần 2; chỉ dedup khi block local còn tồn
// tại (block đã xoá → event hiển thị như external bình thường).
function gcalTimelineData(dateIso) {
  const g = window.TaskFlowGCal;
  if (!g || !window.TaskFlowGCalUI) return null;
  try {
    if (!window.TaskFlowGCalUI.getState().connected) return null;
    const cache = g.loadCache();
    const events = g.eventsForDate(cache.events, dateIso);
    const mappedKeys = [];
    const store = loadTimeBlocksStore();
    (g.loadMappings().mappings || []).forEach((m) => {
      if (!m || !m.googleEventId || !m.calendarId) return;
      if (!window.TaskFlowTimeBlocks.getBlock(store, m.taskflowBlockId)) return;
      mappedKeys.push(m.calendarId + ':' + m.googleEventId);
    });
    return { events, mappedKeys };
  } catch (e) {
    return null;
  }
}

// Section "Sự kiện Google" trong Schedule view. Trả '' nếu module chưa load.
function gcalScheduleSection(dateIso, monthStart, monthEnd) {
  if (!window.TaskFlowGCalUI) return '';
  try {
    return window.TaskFlowGCalUI.scheduleSectionHTML({ dateIso, monthStart, monthEnd });
  } catch (e) {
    return '';
  }
}

let gcalSyncScheduled = false;

// Sau khi render: fetch trạng thái + events (nếu stale) một lần, rồi render lại.
// Guard gcalSyncScheduled chống vòng lặp render↔refresh.
// onChange chỉ re-render riêng phần gcal (#gcal-section-host) — KHÔNG re-render
// toàn bộ Schedule view (sẽ detach timeline đang tương tác / mất trạng thái).
async function scheduleGcalRefresh(dateIso, monthStart, monthEnd, force) {
  if (!window.TaskFlowGCalUI || gcalSyncScheduled) return;
  gcalSyncScheduled = true;
  try {
    const before = window.TaskFlowGCal.loadCache().fetchedAt;
    await window.TaskFlowGCalUI.afterRender({
      dateIso,
      monthStart,
      monthEnd,
      onChange: () => {
        // Cache Google thực sự đổi (refresh thành công) → re-render CẢ timeline +
        // section để event mới xuất hiện trên timeline; còn lại chỉ cập nhật section
        // trạng thái (không đụng timeline đang hiển thị). skipGcalRefresh=true chặn
        // vòng render→refresh→render.
        const after = window.TaskFlowGCal.loadCache().fetchedAt;
        if (force || before !== after) {
          renderCalendarSchedule(true);
        } else {
          renderGcalSection(dateIso, monthStart, monthEnd);
        }
      },
      force: !!force,
    });
  } catch (e) { /* ẩn lỗi mạng */ } finally {
    gcalSyncScheduled = false;
  }
}

// Background refresh Google khi quay lại tab (visibilitychange/focus) — cooldown 60s:
// user tạo event trên Google Calendar rồi quay lại TaskFlow → Schedule tự cập nhật
// (timeline + section). KHÔNG polling, KHÔNG setInterval.
//
// State machine (edge case Month): khi user quay lại tab lúc đang ở Month, KHÔNG
// fetch ngay — đánh dấu gcalRefreshPending. Lúc user bấm Month → Schedule, render
// cache ngay (không block UI) rồi fetch nền ĐÚNG 1 lần nếu pending + connected.
let gcalLastVisibleRefresh = 0;
let gcalRefreshPending = false;
const GCAL_VISIBLE_COOLDOWN_MS = 60 * 1000;

// Fetch events của tháng đang xem (month range) — ghi vào cache duy nhất (single source).
async function gcalFetchMonthEvents() {
  const todayIso = localTodayIso();
  const monthStart = `${PLAN_YEAR}-${String(PLAN_MONTH + 1).padStart(2, '0')}-01`;
  const nd = new Date(PLAN_YEAR, PLAN_MONTH + 1, 0).getDate();
  const monthEnd = `${PLAN_YEAR}-${String(PLAN_MONTH + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
  await window.TaskFlowGCalUI.refreshEvents(monthStart, monthEnd);
}

async function gcalVisibilityRefresh() {
  if (!window.TaskFlowGCal || !window.TaskFlowGCalUI) return;
  try {
    const now = Date.now();
    if (now - gcalLastVisibleRefresh < GCAL_VISIBLE_COOLDOWN_MS) return;
    const cache = window.TaskFlowGCal.loadCache();
    const lastFetch = cache.fetchedAt ? new Date(cache.fetchedAt).getTime() : 0;
    if (now - lastFetch < GCAL_VISIBLE_COOLDOWN_MS) return;
    gcalLastVisibleRefresh = now;
    if (calendarMode === 'schedule') {
      if (!window.TaskFlowGCalUI.getState().connected) return;
      await gcalFetchMonthEvents();
      if (calendarMode === 'schedule') renderCalendarSchedule(true);
    } else {
      // Month (hoặc view khác): không fetch — chỉ đánh dấu pending; khi vào
      // Schedule sẽ refresh nền đúng 1 lần (xem gcalConsumePendingRefresh).
      gcalRefreshPending = true;
    }
  } catch (e) { /* ẩn lỗi mạng */ }
}

// Tiêu thụ pending refresh khi vào Schedule: KHÔNG bị cooldown chặn (đây là fetch
// duy nhất cho lần quay lại tab). Trạng thái connected được resolve qua ensureStatus
// (đã load → không tốn mạng) để bắt kịp cả trường hợp boot lần đầu vào Month. Đặt
// stamp để visibility/focus sau đó trong cooldown không fetch thêm.
function gcalConsumePendingRefresh() {
  if (!gcalRefreshPending) return;
  gcalRefreshPending = false;
  if (!window.TaskFlowGCal || !window.TaskFlowGCalUI) return;
  const ui = window.TaskFlowGCalUI;
  ui.ensureStatus(false)
    .then(() => {
      if (!ui.getState().connected) return;
      gcalLastVisibleRefresh = Date.now();
      gcalFetchMonthEvents()
        .then(() => { if (calendarMode === 'schedule') renderCalendarSchedule(true); })
        .catch(() => { /* lỗi mạng: giữ cache cũ, Schedule vẫn dùng được */ });
    })
    .catch(() => { /* lỗi mạng status: giữ nguyên, không toast lặp */ });
}

// Re-render chỉ riêng section Google events trong Schedule view (không đụng timeline).
function renderGcalSection(dateIso, monthStart, monthEnd) {
  const host = document.getElementById('gcal-section-host');
  if (!host) return;
  const html = gcalScheduleSection(dateIso, monthStart, monthEnd);
  if (html) host.innerHTML = html;
}

async function disconnectGcal() {
  if (!window.TaskFlowGCal || !window.TaskFlowGCalUI) return;
  const res = await window.TaskFlowGCal.disconnect();
  if (res && res.ok) {
    window.TaskFlowGCalUI.getState().connected = false;
    window.TaskFlowGCalUI.getState().calendars = [];
    window.TaskFlowGCalUI.getState().statusLoaded = true;
    gcalRefreshPending = false;
    if (calendarMode === 'schedule') renderCalendarSchedule();
    TaskFlowUI.toast(t('gcalDisconnected'), 'success');
    trackEvent('gcal_disconnect');
  } else {
    TaskFlowUI.toast(t('gcalDisconnectFailed'), 'error');
  }
}

// Action slot cho từng TimeBlock trong timeline (V1.6B): nút "Add to Google Calendar"
// hoặc badge đã export. Trả '' khi module chưa load (timeline giữ hành vi cũ).
function gcalBlockActions(block) {
  if (!window.TaskFlowGCalUI || !window.TaskFlowGCalUI.exportActionsHTML) return '';
  try {
    const text = window.TimeBlocksUI && window.TimeBlocksUI.taskTextFor
      ? window.TimeBlocksUI.taskTextFor(block.taskUid, state, inbox)
      : '';
    return window.TaskFlowGCalUI.exportActionsHTML(block, text);
  } catch (e) {
    return '';
  }
}

// Xuất 1 TimeBlock → Google Calendar (V1.6B). Chặn trước: chưa kết nối → connect
// đọc; kết nối nhưng thiếu scope ghi → connect-write (chỉ khi user bấm xuất).
// Sau callback OAuth, app boot lại với ?cal=ok và render lại Schedule.
async function exportTimeBlockToGcal(blockId) {
  const g = window.TaskFlowGCal;
  const ui = window.TaskFlowGCalUI;
  if (!g || !ui || !blockId) return;
  const blocks = loadTimeBlocksStore();
  const block = window.TaskFlowTimeBlocks.getBlock(blocks, blockId);
  if (!block) return;
  const st = ui.getState();
  if (!st.statusLoaded) await ui.ensureStatus(true);
  if (!ui.getState().connected) {
    TaskFlowUI.toast(t('gcalConnectFirst'), 'info');
    g.connect();
    return;
  }
  const text = window.TimeBlocksUI && window.TimeBlocksUI.taskTextFor
    ? window.TimeBlocksUI.taskTextFor(block.taskUid, state, inbox)
    : '';
  const title = String(text || '').trim() || t('gcalExportBlockTitle', { t: block.start + '–' + block.end });
  // Khi chưa có scope ghi, /export trả 403 → chuyển sang flow connect-write.
  const res = await g.exportBlock(block, { title });
  if (res && res.ok && res.mapping) {
    TaskFlowUI.toast(res.duplicate ? t('gcalExportAlready') : t('gcalExportDone'), 'success');
    trackEvent(res.duplicate ? 'gcal_export_duplicate' : 'gcal_export');
    if (calendarMode === 'schedule') renderCalendarSchedule();
    return;
  }
  if (res && res.status === 403 && res.data && res.data.error === 'write-scope-required') {
    TaskFlowUI.toast(t('gcalExportNeedWrite'), 'info');
    g.connectWrite();
    return;
  }
  TaskFlowUI.toast(t('gcalExportFail'), 'error');
  trackEvent('gcal_export_fail');
}

// Busy windows từ Google cho planner (chỉ khi cache có dữ liệu — offline-safe).
function gcalBusyToday(todayIso) {
  if (!window.TaskFlowGCal) return [];
  try {
    const cache = window.TaskFlowGCal.loadCache();
    return window.TaskFlowGCal.busyForDate(cache.events, todayIso);
  } catch (e) {
    return [];
  }
}

function renderCalendar() {
  const el = document.getElementById('view-calendar');
  if (calendarMode === 'schedule') { renderCalendarSchedule(); return; }
  const entries = calendarDayEntries();
  const dowLbl = t('dayNames');
  const agendaEntries = entries.filter((entry) => entry.currentMonth && calendarVisibleTasks(entry).length);
  // Phase 8: thống kê focus của tháng đang xem — đọc log MỘT lần, tính cho mọi ô + summary
  const pomoLog = loadPomoLog();
  const dayFocusSecs = (date) => { const e = pomoLog[pomoDateKey(date)]; return e && typeof e.secs === 'number' ? e.secs : 0; };
  const focusEntries = entries.filter((entry) => entry.currentMonth);
  const monthFocusSecs = focusEntries.reduce((a, e) => a + dayFocusSecs(e.date), 0);
  let best = null, bestM = 0;
  focusEntries.forEach((e) => { const m = dayFocusSecs(e.date); if (m > bestM) { bestM = m; best = e; } });
  const calFocusSummary = `
    <div class="cal-focus-summary" data-role="cal-focus-summary">
      <span>🎯 ${t('calFocusMonth', { n: Math.round(monthFocusSecs / 60) })}</span>
      ${best && bestM > 0 ? `<span>⭐ ${t('calFocusBestDay', { d: best.dayNumber + '/' + (PLAN_MONTH + 1), n: Math.round(bestM / 60) })}</span>` : ''}
    </div>`;
  const page = ensureCalendarShell();
  syncCalendarShell(page);
  const legend = page.querySelector('[data-role="cal-legend"]');
  if (legend) legend.innerHTML = `<span class="dot on"></span> ${t('legendDone')} <span class="dot off"></span> ${t('legendNotDone')}`;
  const content = page.querySelector('[data-role="cal-content"]');
  content.innerHTML = `${calFocusSummary}
    ${calendarTagFilterBar()}
    <section class="calendar-grid-desktop" aria-label="${t('viewCalendar')}">
      ${dowLbl.map((day) => `<div class="cal-dow">${day}</div>`).join('')}
      ${entries.map((entry) => {
        const fmin = Math.round(dayFocusSecs(entry.date) / 60);
        const focusPill = fmin > 0 ? `<span class="cal-focus" title="${t('calFocusAria', { d: entry.date.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'numeric' }), n: fmin })}" aria-label="${t('calFocusAria', { d: entry.date.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'numeric' }), n: fmin })}">🎯 ${fmin}p</span>` : '';
        return `<article class="cal-cell${entry.today ? ' today' : ''}${entry.currentMonth ? '' : ' outside'}" data-week="${entry.week.n}" data-day="${entry.dayIndex}">
        <div class="cal-cell-head"><span class="cal-date">${entry.dayNumber}</span><span class="cal-pct" data-role="cal-pct" data-week="${entry.week.n}" data-day="${entry.dayIndex}">${calendarDayPct(entry.day)}%</span>${focusPill}</div>
        <div class="cal-tasks">${calendarTasksHTML(entry)}</div>
      </article>`;
      }).join('')}
    </section>
    <section class="calendar-agenda-mobile" aria-labelledby="calendar-agenda-title">
      <h2 id="calendar-agenda-title">${t('calendarAgendaTitle')}</h2>
      ${agendaEntries.length ? agendaEntries.map((entry) => `<article class="calendar-agenda-day${entry.today ? ' today' : ''}">
        <header><time datetime="${localISODate(entry.date)}">${entry.date.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</time><span>${t('calendarTaskCount', { n: calendarVisibleTasks(entry).length })}</span></header>
        <div class="calendar-agenda-tasks">${calendarTasksHTML(entry, 'calendar-agenda-task')}</div>
      </article>`).join('') : `<p class="calendar-agenda-empty">${t('calendarAgendaEmpty')}</p>`}
    </section>`;
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
              tasks: (sd.tasks || []).map((tk) => ({ uid: newTaskUid(), kind: tk.kind, done: false, text: tk.text || '', tags: Array.isArray(tk.tags) ? tk.tags.slice() : [], linkedMetricIds: [] })),
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

// Pomodoro timer (renderPomo, pomoSync, pomoStart/Reset/SetMode, togglePomoPanel,
// pomoAddSession, pomoWeekSecs — extraction 40, A18) được tách sang js/pomo.js
// (window.TaskFlowPomo). POMO_WORK/BREAK/LONG_BREAK, pomo, pomoEndAt là state RIÊNG
// của module; pomoDuration/pomoComplete chỉ dùng nội bộ. Week render (renderPomo),
// dispatcher (pomo-*), visibilitychange/focus listeners (pomoSync) + renderPomoWidgetStats
// (pomoWeekSecs) resolve qua destructure alias này (global lexical). focus.js gọi
// pomoAddSession qua lexical.
if (!window.TaskFlowPomo) throw new Error('TaskFlowPomo missing — js/pomo.js failed to load');
const { renderPomo, pomoSync, pomoStart, pomoReset, pomoSetMode, togglePomoPanel, pomoAddSession, pomoWeekSecs } = window.TaskFlowPomo;

/* ---------- Phase 7: Thống kê focus (biểu đồ tuần + báo cáo) ---------- */

// Các hàm tính toán focus stats (pomoDaySecs, focusWeekMinutes, focusMonthMinutes,
// topFocusTasksInWeek/Month, taskFocusMinLabel — extraction 37, từ R22/R28) được tách sang
// js/focus-stats.js (window.TaskFlowFocusStats). Report-ui.js + year-report.js + các call
// site còn lại trong app.js (focusChartCardHTML, focus mode, focusMonthMinutesFor) resolve
// qua destructure alias này (global lexical).
if (!window.TaskFlowFocusStats) throw new Error('TaskFlowFocusStats missing — js/focus-stats.js failed to load');
const { pomoDaySecs, focusWeekMinutes, focusMonthMinutes, topFocusTasksInWeek, topFocusTasksInMonth, taskFocusMinLabel } = window.TaskFlowFocusStats;

/* ---------- Phase 8: Thống kê focus năm + lịch ---------- */

// Phút focus của một tháng bất kỳ (theo ngày thật của tháng — không bị ảnh hưởng bởi ô tràn grid).
function focusMonthMinutesFor(y, m) {
  const dim = new Date(y, m + 1, 0).getDate();
  let secs = 0;
  for (let d = 1; d <= dim; d++) secs += pomoDaySecs(new Date(y, m, d));
  return Math.round(secs / 60);
}

// Mảng 12 giá trị phút focus của năm — quét log một lần (tránh parse localStorage từng ngày).
function focusYearByMonth() {
  const log = loadPomoLog();
  const out = new Array(12).fill(0);
  for (const key in log) {
    const m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m || +m[1] !== PLAN_YEAR) continue;
    const e = log[key];
    if (!e || typeof e.secs !== 'number') continue;
    out[+m[2] - 1] += e.secs;
  }
  return out.map((s) => Math.round(s / 60));
}

// Top N task có focus nhiều nhất trong năm (đọc chéo 12 tháng qua monthStateRaw — không tạo state mới).
function topFocusTasksInYear(y, n) {
  const prefix = y + '-';
  const acc = [];
  for (let m = 0; m < 12; m++) {
    const s = monthStateRaw(y, m);
    if (!s || !Array.isArray(s.weeks)) continue;
    s.weeks.forEach((w) => (w.days || []).forEach((d) => (d.tasks || []).forEach((tk) => {
      const secs = taskFocusLog(tk).filter((e) => String(e.d || '').startsWith(prefix)).reduce((a, e) => a + (e.secs || 0), 0);
      if (secs > 0) acc.push({ tk, secs });
    })));
  }
  acc.sort((a, b) => b.secs - a.secs);
  return acc.slice(0, n);
}


// date helpers (fmtDate, isDayToday, dayLabelShort) được tách sang js/dates.js
// (window.TaskFlowDates). Giữ alias để call-sites không đổi.
if (!window.TaskFlowDates) throw new Error('TaskFlowDates missing — js/dates.js failed to load');
const { fmtDate, isDayToday, dayLabelShort } = window.TaskFlowDates;

// Card biểu đồ cột thời gian tập trung theo ngày trong tuần (full-width trong week-support-grid).
function focusChartCardHTML(w) {
  const mins = focusWeekMinutes();
  const total = mins.reduce((a, b) => a + b, 0);
  const max = Math.max(...mins, 1);
  const top = topFocusTasksInWeek(w, 3);
  const empty = total <= 0;
  const bars = empty ? `<p class="focus-chart-empty">${t('focusChartEmpty')}</p>` : mins.map((m, di) => {
    const h = Math.max(3, Math.round((m / max) * 100));
    return `<div class="fc-col" role="img" aria-label="${t('focusChartBarAria', { day: dayLabel(di), n: m })}" title="${t('focusChartBarAria', { day: dayLabel(di), n: m })}">
      <span class="fc-min">${m > 0 ? m : ''}</span>
      <div class="fc-bar" style="height:${h}%"></div>
      <span class="fc-day">${dayLabelShort(di)}</span>
    </div>`;
  }).join('');
  const topHtml = top.length
    ? `<span class="focus-chart-top-label">${t('focusChartTop')}:</span> ${top.map((x) => `<span class="focus-chart-top-item" title="${esc(x.tk.text || '')}">${esc((x.tk.text || '…').slice(0, 18))} · ${taskFocusMinLabel(x.secs)}</span>`).join(', ')}`
    : '';
  return `<div class="card focus-chart-card" data-role="focus-chart">
    <div class="focus-chart-head">
      <span class="focus-chart-title">🎯 ${t('focusChartTitle')}</span>
      <span class="focus-chart-total">${t('focusChartWeekTotal', { n: total })}</span>
    </div>
    <div class="focus-chart-bars">${bars}</div>
    ${topHtml ? `<div class="focus-chart-top">${topHtml}</div>` : ''}
  </div>`;
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
// CHAT_RESPONSES/doChatSend/doChatSuggest/chatBotReply được tách sang js/chat.js
// (window.TaskFlowChat) — P11 extraction 21. Lazy-load (P1.5): module không nằm trong
// chuỗi script boot, chỉ nạp khi dùng chat lần đầu (runLazyModule). Helper app-level
// resolve qua global scope tại thời điểm GỌI — pattern syncui/clock.
// Phase 3B (P6): chat cần chuỗi lazy ai-context → ai-chat-context → chat-provider →
// chat. runLazyChat orchestrate chuỗi đó; KHÔNG thêm gì vào boot path.

function runLazyChat(fn) {
  ensureLazyModule('js/ai-context.min.js')
    .then(() => ensureLazyModule('js/ai-chat-context.min.js'))
    .then(() => ensureLazyModule('js/ai-context-consent.min.js'))
    .then(() => ensureLazyModule('js/ai-memory.min.js'))
    .then(() => ensureLazyModule('js/chat-provider.min.js'))
    .then(() => ensureLazyModule('js/ai-agent.min.js'))
    .then(() => ensureLazyModule('js/ai-intent.min.js'))
    .then(() => ensureLazyModule('js/ai-explainability.min.js'))
    .then(() => ensureLazyModule('js/ai-plan.min.js'))
    .then(() => ensureLazyModule('js/ai-plan-health.min.js'))
    .then(() => ensureLazyModule('js/ai-plan-watch.min.js'))
    .then(() => ensureLazyModule('js/ai-brief.min.js'))
    .then(() => ensureLazyModule('js/ai-roadmap.min.js'))
    .then(() => ensureLazyModule('js/focus-session.min.js'))
    .then(() => ensureLazyModule('js/effort-calibration.min.js'))
    .then(() => ensureLazyModule('js/goal-tracking.min.js'))
    .then(() => ensureLazyModule('js/ai-agent-runtime.min.js'))
    .then(() => ensureLazyModule('js/chat.min.js'))
    .then(() => { initChatContextProvider(); if (fn) fn(); })
    .catch((err) => {
      console.error(err);
      if (window.TaskFlowUI && TaskFlowUI.toast) TaskFlowUI.toast('Không thể tải module — kiểm tra kết nối', 'error');
    });
}

// Preload chuỗi chat khi mở panel (vẫn lazy — không nằm trong boot path).
function preloadLazyChat() {
  ensureLazyModule('js/ai-context.min.js')
    .then(() => ensureLazyModule('js/ai-chat-context.min.js'))
    .then(() => ensureLazyModule('js/ai-context-consent.min.js'))
    .then(() => ensureLazyModule('js/ai-memory.min.js'))
    .then(() => ensureLazyModule('js/chat-provider.min.js'))
    .then(() => ensureLazyModule('js/ai-agent.min.js'))
    .then(() => ensureLazyModule('js/ai-intent.min.js'))
    .then(() => ensureLazyModule('js/ai-explainability.min.js'))
    .then(() => ensureLazyModule('js/ai-plan.min.js'))
    .then(() => ensureLazyModule('js/ai-plan-health.min.js'))
    .then(() => ensureLazyModule('js/ai-agent-runtime.min.js'))
    .then(() => ensureLazyModule('js/chat.min.js'))
    .then(() => initChatContextProvider())
    .catch(() => { /* im lặng — send path sẽ tự fallback */ });
}

/* ---- Chat panel: shared close (P11/P15) ----
   Đóng popover, cập nhật aria-expanded, trả focus về FAB nếu chat mở từ FAB.
   KHÔNG xoá hội thoại/lịch sử. */
let _chatOpenedFromFab = false;
function closeChatPanel() {
  const p = document.getElementById('chatPop');
  if (!p || p.hidden) return false;
  p.hidden = true;
  const fab = document.getElementById('chatFab');
  if (fab) fab.setAttribute('aria-expanded', 'false');
  if (_chatOpenedFromFab && fab && typeof fab.focus === 'function') fab.focus();
  _chatOpenedFromFab = false;
  return true;
}

// Click ngoài Chat → đóng (không đóng khi click trong panel hoặc vào nút mở).
// Đăng ký SAU dispatcher data-action (line 5350) — dispatcher mở/đóng trước,
// listener này chỉ đóng khi click thật sự ra ngoài panel.
document.addEventListener('click', (e) => {
  const p = document.getElementById('chatPop');
  if (!p || p.hidden) return;
  const t = e.target;
  if (t && t.closest && (t.closest('#chatFabWrap') || t.closest('[data-action="chat-toggle"]'))) return;
  closeChatPanel();
});

/* ---- Phase 3B: Trusted Chat Context Provider (P4/P4.1) ---- */
// chat.js KHÔNG bao giờ đọc localStorage/state trực tiếp — chỉ hỏi
// TaskFlowChatContextProvider.prepare(message). App đăng ký gather fn đọc
// TỪ NGUỒN CANONICAL: state, projects store, timeblocks store, Google Calendar
// busy cache. KHÔNG network lúc build context. Reflections/Mood KHÔNG bao giờ
// được cấp (P5) — provider ép tắt kể cả khi state có.
function initChatContextProvider() {
  try {
    if (!window.TaskFlowChatContextProvider || typeof window.TaskFlowChatContextProvider.register !== 'function') return;
    window.TaskFlowChatContextProvider.register(function chatContextGatherOptions() {
      const today = PlannerUI.todayStr();
      const blocks = loadTimeBlocksStore();
      const busy = [];
      if (window.TaskFlowGCal && window.TaskFlowGCal.loadCache && window.TaskFlowGCal.eventsForDate) {
        try {
          const cache = window.TaskFlowGCal.loadCache();
          const events = cache && Array.isArray(cache.events) ? cache.events : [];
          const days = [today];
          if (PLAN_START instanceof Date) {
            for (let d = 0; d < NUM_DAYS && d < 7; d++) {
              days.push(TimeBlocksUI.iso(new Date(PLAN_START.getFullYear(), PLAN_START.getMonth(), 1 + d)));
            }
          }
          days.forEach((dayStr) => {
            (window.TaskFlowGCal.eventsForDate(events, dayStr) || []).forEach((e) => {
              busy.push({ start: e.startMs ? new Date(e.startMs).toISOString() : '', end: e.endMs ? new Date(e.endMs).toISOString() : '' });
            });
          });
        } catch (e) { /* offline → không có busy */ }
      }
      return {
        state: state,
        now: new Date(),
        today: today,
        planStart: PLAN_START instanceof Date ? PLAN_START : null,
        numDays: NUM_DAYS,
        year: PLAN_YEAR,
        month: PLAN_MONTH,
        resolveTodayCell: (window.TaskFlowClock && typeof TaskFlowClock.resolveTodayCell === 'function')
          ? TaskFlowClock.resolveTodayCell : null,
        projects: loadProjectsStore(),
        timeblocks: blocks,
        busy: busy,
        habits: Array.isArray(state.habits) ? state.habits : [],
      };
    });
  } catch (e) { /* provider optional — chat chạy bình thường không context */ }
}
initChatContextProvider();

// Enter key trong chat input gửi tin nhắn
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'chatInput') {
    e.preventDefault();
    runLazyChat(() => window.TaskFlowChat.doChatSend());
  }
  if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'quickAddInput') {
    e.preventDefault();
    runLazyModule('js/quick-add.min.js', () => window.TaskFlowQuickAdd.submitQuickAdd());
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
      <button type="button" class="widget-toggle${w.visible ? ' on' : ' off'}" data-action="widget-toggle" data-widget-id="${w.id}" aria-checked="${w.visible ? 'true' : 'false'}" aria-label="${esc(w.visible ? t('widgetHide') : t('widgetShow'))}">${w.visible ? window.TaskFlowUI.icon('check') : window.TaskFlowUI.icon('close')}</button>
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

function isSidebarCollapsed() {
  try { return localStorage.getItem('planner-sidebar-collapsed') === '1'; } catch (e) { /* ẩn */ }
  return false;
}
function applySidebarCollapse() {
  const layout = document.querySelector('.app-layout');
  if (!layout) return;
  const collapsed = isSidebarCollapsed();
  layout.classList.toggle('sidebar-collapsed', collapsed);
  const btn = document.getElementById('sidebarCollapseBtn');
  if (btn) {
    const labelKey = collapsed ? 'expandSidebar' : 'collapseSidebar';
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.setAttribute('aria-label', t(labelKey));
    btn.dataset.tooltip = t(labelKey);
    const label = btn.querySelector('span[data-i18n]');
    if (label) label.textContent = t(labelKey);
  }
}
function toggleSidebarCollapse() {
  const collapsed = !isSidebarCollapsed();
  try { localStorage.setItem('planner-sidebar-collapsed', collapsed ? '1' : '0'); } catch (e) { /* ẩn */ }
  applySidebarCollapse();
  trackEvent('sidebar_collapse');
}

/* ============================ Tooltip sidebar collapsed (portal) ============================ */
// ::after tooltip của sidebar collapsed nằm ngoài chiều rộng sidebar → tạo horizontal scrollbar
// trong scroll container (.app-sidebar). Thay bằng layer position:fixed ngoài scroll container,
// định vị bằng getBoundingClientRect() — không bị cắt bởi overflow-x:hidden, không tạo overflow.
function sidebarTooltipLayer() {
  let layer = document.getElementById('appSidebarTooltip');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'appSidebarTooltip';
    layer.className = 'app-tooltip-layer';
    layer.setAttribute('role', 'tooltip');
    document.body.appendChild(layer);
  }
  return layer;
}

function sidebarTooltipHost(target) {
  const layout = target && target.closest('.app-layout');
  if (!layout || !layout.classList.contains('sidebar-collapsed')) return null;
  const host = target.closest('.app-sidebar [data-tooltip]');
  return (host && host.dataset.tooltip) ? host : null;
}

function showSidebarTooltip(host) {
  const layer = sidebarTooltipLayer();
  layer.textContent = host.dataset.tooltip;
  const rect = host.getBoundingClientRect();
  layer.style.left = Math.round(rect.right + 12) + 'px';
  layer.style.top = Math.round(rect.top + rect.height / 2) + 'px';
  layer.classList.add('visible');
}

function hideSidebarTooltip() {
  const layer = document.getElementById('appSidebarTooltip');
  if (layer) layer.classList.remove('visible');
}

// Pointer + focus delegation: chỉ kích hoạt khi sidebar đang collapsed.
document.addEventListener('pointerover', (e) => {
  const host = sidebarTooltipHost(e.target);
  if (host) { showSidebarTooltip(host); return; }
  const layer = document.getElementById('appSidebarTooltip');
  if (layer && layer.classList.contains('visible') && !e.target.closest('.app-tooltip-layer')) hideSidebarTooltip();
});
document.addEventListener('focusin', (e) => {
  const host = sidebarTooltipHost(e.target);
  if (host) showSidebarTooltip(host);
});
document.addEventListener('focusout', () => hideSidebarTooltip());
// Rời hẳn cửa sổ/trang → ẩn tooltip (không có pointerover tiếp theo để dọn)
document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) hideSidebarTooltip(); });
document.addEventListener('click', () => hideSidebarTooltip());
window.addEventListener('scroll', hideSidebarTooltip, { capture: true });
window.addEventListener('resize', hideSidebarTooltip);

function shellNavLabel(value) {
  return String(value || '').replace(/^[\p{Extended_Pictographic}\uFE0F]+\s*/u, '');
}

// View nằm trong More sheet: highlight nút "Thêm" khi đang xem (luôn đúng 1 active trên mobile)
const MORE_SHEET_VIEWS = ['inbox', 'week', 'overview', 'year', 'calendar', 'projects'];

function buildNav() {
  const desktop = document.getElementById('navTabs');
  const mobile = document.getElementById('mobileNav');
  const items = [
    { view: 'today', icon: 'sun', label: shellNavLabel(t('todayTxt')), id: 'tab-today', controls: 'view-today' },
    { view: 'inbox', icon: 'inbox', label: shellNavLabel(t('tabInbox')), id: 'tab-inbox', controls: 'view-inbox' },
    { view: 'upcoming', icon: 'upcoming', label: shellNavLabel(t('tabUpcoming')), id: 'tab-upcoming', controls: 'view-upcoming' },
    { view: 'overview', icon: 'overview', label: shellNavLabel(t('tabOverview')), id: 'tab-overview', controls: 'view-overview' },
    { view: 'week', icon: 'week', label: shellNavLabel(t('weekN', { n: state.currentWeek })), id: 'tab-week-' + state.currentWeek, controls: 'view-week', week: state.currentWeek },
    { view: 'year', icon: 'year', label: shellNavLabel(t('tabYear', { y: PLAN_YEAR })), id: 'tab-year', controls: 'view-year' },
    { view: 'calendar', icon: 'calendar', label: shellNavLabel(t('tabCalendar')), id: 'tab-calendar', controls: 'view-calendar' },
    { view: 'projects', icon: 'briefcase', label: shellNavLabel(t('projectsPageTitle')), id: 'tab-projects', controls: 'view-projects' },
  ];
  const navAttributes = {
    today: 'data-nav-view="today" data-view="today"',
    inbox: 'data-nav-view="inbox" data-view="inbox"',
    upcoming: 'data-nav-view="upcoming" data-view="upcoming"',
    overview: 'data-nav-view="overview" data-view="overview"',
    week: 'data-nav-view="week" data-view="week"',
    year: 'data-nav-view="year" data-view="year"',
    calendar: 'data-nav-view="calendar" data-view="calendar"',
    projects: 'data-nav-view="projects" data-view="projects"',
  };
  const itemBtn = (item) => `<button type="button" class="app-nav-item tab" role="tab"
    id="${item.id}" aria-controls="${item.controls}" data-action="nav" ${navAttributes[item.view]}
    ${item.week ? `data-week="${item.week}"` : ''} data-tooltip="${esc(item.label)}" aria-label="${esc(item.label)}">
    ${window.TaskFlowUI.icon(item.icon)}<span>${esc(item.label)}</span></button>`;
  const actionBtn = (action, icon, label) => `<button type="button" class="app-nav-item"
    data-action="${action}" data-tooltip="${esc(label)}" aria-label="${esc(label)}">
    ${window.TaskFlowUI.icon(icon)}<span>${esc(label)}</span></button>`;
  const byView = {};
  items.forEach((it) => { byView[it.view] = it; });
  if (desktop) {
    const groups = [
      { label: t('navGroupMain'), items: [
        byView.today, byView.inbox, byView.upcoming,
      ] },
      // P3: PLAN = Tổng quan → Tuần → Năm → Lịch; TRACK = Thói quen → Focus → Báo cáo
      { label: t('navGroupPlan'), items: [
        byView.overview, byView.week, byView.year, byView.calendar, byView.projects,
      ] },
      { label: t('navGroupTrack'), items: [
        actionBtn('habits', 'habit', shellNavLabel(t('habitTitle'))),
        actionBtn('focus', 'focus', shellNavLabel(t('focusOpen'))),
        actionBtn('report', 'report', shellNavLabel(t('reportTitle'))),
      ] },
    ];
    desktop.innerHTML = groups.map((g) => `<div class="app-nav-group">
      ${g.label ? `<span class="app-nav-group-label">${esc(g.label)}</span>` : ''}
      ${g.items.map((it) => it.view ? itemBtn(it) : it).join('')}
    </div>`).join('');
  }
  if (mobile) {
    // Bottom-nav mobile (redesign): Hôm nay / Sắp tới / + (FAB action) / Thói quen / Thêm (sheet).
    // Chỉ view thật (Today/Upcoming) là tab có data-nav-view → updateNav active ĐÚNG MỘT tab.
    // + / Thói quen / Thêm là ACTION (không data-nav-view) → không bao giờ active.
    // More mở bottom sheet: Inbox, Tuần, Tổng quan, Năm, Lịch + Focus, Báo cáo, Cài đặt.
    // Không thêm class .tab (legacy pill-style trong styles.css) — nó ghi đè
    // border-radius 999px + border + surface background lên nav mobile mới.
    // updateNav() active qua [data-nav-view], không cần .tab.
    const mobileItem = (item) => `<button type="button" class="app-mobile-nav-item" role="tab"
      id="mobile-${item.id}" aria-controls="${item.controls}" data-action="nav" ${navAttributes[item.view]}
      ${item.week ? `data-week="${item.week}"` : ''}>
      ${window.TaskFlowUI.icon(item.icon)}<span>${esc(item.label)}</span></button>`;
    mobile.innerHTML =
      mobileItem(byView.today) +
      mobileItem(byView.upcoming) +
      `<div class="app-mobile-nav-add">
        <button type="button" class="app-mobile-nav-fab" data-action="shell-add-task"
          aria-label="${esc(t('quickAddTitle'))}">${window.TaskFlowUI.icon('plus')}</button>
        <span class="app-mobile-nav-add-label">${esc(t('moreAdd'))}</span>
      </div>` +
      `<button type="button" class="app-mobile-nav-item" data-action="habits"
        aria-label="${esc(shellNavLabel(t('habitTitle')))}">${window.TaskFlowUI.icon('habit')}<span>${esc(shellNavLabel(t('habitTitle')))}</span></button>` +
      `<button type="button" class="app-mobile-nav-item" data-action="more" aria-controls="moreSheet"
        aria-expanded="false" aria-haspopup="dialog">${window.TaskFlowUI.icon('more')}<span>${esc(t('moreNav'))}</span></button>`;
    const moreSheetNav = document.getElementById('moreSheetNav');
    if (moreSheetNav) {
      const sheetItem = (item) => `<button type="button" class="app-nav-item" data-action="nav" ${navAttributes[item.view]}
        ${item.week ? `data-week="${item.week}"` : ''}>
        ${window.TaskFlowUI.icon(item.icon)}<span>${esc(item.label)}</span></button>`;
      // Mobile UI polish: More sheet chia 3 nhóm — Điều hướng / Công cụ (Focus,
      // Trợ lý, Báo cáo — thay cho 2 nút floating trên mobile) / Hệ thống.
      const moreGroups = [
        { label: t('moreSheetTitle'), items: MORE_SHEET_VIEWS.map((v) => byView[v]).filter(Boolean).map((it) => sheetItem(it)) },
        { label: t('moreGroupTools'), items: [
          actionBtn('focus', 'focus', shellNavLabel(t('focusOpen'))),
          actionBtn('chat-toggle', 'help', shellNavLabel(t('chatTitle'))),
          actionBtn('report', 'report', shellNavLabel(t('reportTitle'))),
          actionBtn('pomo-toggle', 'bell', shellNavLabel(t('pomoWidgetTitle'))),
        ] },
        { label: t('moreGroupSystem'), items: [
          actionBtn('tools-open', 'settings', t('moreSettings')),
        ] },
      ];
      moreSheetNav.innerHTML = moreGroups.map((g) => `<div class="more-sheet-group">
        <span class="more-sheet-group-label">${esc(g.label)}</span>
        ${g.items.join('')}
      </div>`).join('');
    }
  }
  renderShellIcons();
}
function updateNav() {
  // Xem ngày là "con" của tuần: highlight tab tuần chứa ngày đang xem
  const viewKey = state.view === 'day' ? 'week' : state.view;
  const weekKey = state.view === 'day' ? state.dayWeek : state.currentWeek;
  document.querySelectorAll('[data-nav-view]').forEach((b) => {
    const active = b.dataset.view === viewKey && (!b.dataset.week || +b.dataset.week === weekKey);
    b.classList.toggle('active', active);
    b.setAttribute('aria-current', active ? 'page' : 'false');
    // aria-selected + roving tabindex chỉ hợp lệ trên tab thật (role="tab");
    // item trong More sheet không phải tab → chỉ nhận active/aria-current.
    if (b.getAttribute('role') === 'tab') {
      b.setAttribute('aria-selected', String(active));
      b.tabIndex = active ? 0 : -1;
    }
  });
  // Mobile: các view nằm trong More sheet (Inbox/Tuần/Tổng quan/Năm/Lịch) không có tab
  // ở main nav → highlight nút "Thêm" để LUÔN có đúng MỘT tab active trên mobile
  // (Inbox có tab desktop, nhưng không nằm trong bottom nav 5 vị trí).
  const moreBtn = document.querySelector('#mobileNav [data-action="more"]');
  if (moreBtn) {
    const moreActive = MORE_SHEET_VIEWS.includes(viewKey);
    moreBtn.classList.toggle('active', moreActive);
    if (moreActive) moreBtn.setAttribute('aria-current', 'page');
    else moreBtn.removeAttribute('aria-current');
  }
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
    today: t('todayTxt'),
    inbox: t('tabInbox'),
    upcoming: t('tabUpcoming'),
    overview: t('tabOverview'),
    week: t('weekN', { n: state.currentWeek }),
    year: t('tabYear', { y: PLAN_YEAR }),
    calendar: t('tabCalendar'),
    day: t('dayViewTitle'),
  };
  if (title) title.textContent = labels[state.view] || labels.today;
  if (period) period.textContent = `${monthLabel(PLAN_MONTH)} · ${PLAN_YEAR}`;
}

let toolsDrawerReturnFocusSelector = null;
let toolsDrawerOpenedFromSheet = false;

function openMoreSheet(opener) {
  const sheet = document.getElementById('moreSheet');
  const backdrop = document.getElementById('moreSheetBackdrop');
  if (!sheet || !backdrop) return;
  backdrop.hidden = false;
  document.body.classList.add('more-sheet-open');
  TaskFlowUI.openDrawer('moreSheet', opener);
  const btn = document.querySelector('#mobileNav [data-action="more"]');
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

function closeMoreSheet() {
  const sheet = document.getElementById('moreSheet');
  const backdrop = document.getElementById('moreSheetBackdrop');
  // P0: cleanup idempotent — backdrop + body.more-sheet-open (scroll-lock) phải
  // được khôi phục kể cả khi sheet đã bị ẩn qua lifecycle khác (cùng contract
  // với closeToolsDrawer). closeDrawer() của UI layer cũng idempotent.
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove('more-sheet-open');
  if (sheet) TaskFlowUI.closeDrawer('moreSheet');
  const btn = document.querySelector('#mobileNav [data-action="more"]');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

// P0: khôi phục trạng thái scroll-lock nếu drawer/sheet đã ẩn bất thường.
// Trường hợp thực tế: bấm Back với drawer đang mở → trang khôi phục từ BFCache
// (DOM bị đóng băng, body class không được gỡ) → document bị khóa scroll vĩnh
// viễn. Chạy ở boot + mỗi lần pageshow; idempotent, không có side-effect khi
// drawer/sheet thực sự đang mở.
function reconcileOverlayScrollLocks() {
  const drawer = document.getElementById('toolsDrawer');
  const sheet = document.getElementById('moreSheet');
  const backdrop = document.getElementById('toolsDrawerBackdrop');
  const moreBackdrop = document.getElementById('moreSheetBackdrop');
  if (!drawer || drawer.hidden) {
    document.body.classList.remove('tools-drawer-open');
    if (backdrop) backdrop.hidden = true;
  }
  if (!sheet || sheet.hidden) {
    document.body.classList.remove('more-sheet-open');
    if (moreBackdrop) moreBackdrop.hidden = true;
  }
}

function openToolsDrawer(opener) {
  const drawer = document.getElementById('toolsDrawer');
  const backdrop = document.getElementById('toolsDrawerBackdrop');
  if (!drawer || !backdrop) return;
  toolsDrawerOpenedFromSheet = !!(opener && opener.closest('#moreSheet'));
  toolsDrawerReturnFocusSelector = toolsDrawerOpenedFromSheet
    ? '#moreSheet [data-action="tools-open"]'
    : opener && opener.closest('#desktopSidebar')
      ? '#desktopSidebar [data-action="tools-open"]'
      : '#appTopbar [data-action="tools-open"]';
  backdrop.hidden = false;
  document.body.classList.add('tools-drawer-open');
  document.querySelectorAll('[data-action="tools-open"]').forEach((button) => button.setAttribute('aria-expanded', 'true'));
  TaskFlowUI.openDrawer('toolsDrawer', opener);
}

function closeToolsDrawer() {
  const drawer = document.getElementById('toolsDrawer');
  const backdrop = document.getElementById('toolsDrawerBackdrop');
  // P0: cleanup idempotent. Cleanup an toàn (backdrop, body scroll-lock, aria)
  // phải chạy TRƯỚC mọi early-return — nếu drawer đã bị ẩn qua lifecycle khác
  // (vd: requestLayerClose fallback gọi TaskFlowUI.closeDrawer trực tiếp), giữ
  // body.tools-drawer-open (overflow:hidden) làm document mất scroll cho tới
  // khi reload. closeDrawer() của UI layer cũng idempotent (hidden/aria/stack).
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove('tools-drawer-open');
  document.querySelectorAll('[data-action="tools-open"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  const wasOpen = !!(drawer && !drawer.hidden);
  if (drawer) TaskFlowUI.closeDrawer('toolsDrawer');
  const wasSheetTrigger = toolsDrawerOpenedFromSheet;
  const returnTarget = toolsDrawerReturnFocusSelector
    ? document.querySelector(toolsDrawerReturnFocusSelector)
    : null;
  toolsDrawerReturnFocusSelector = null;
  toolsDrawerOpenedFromSheet = false;
  // Focus restore chỉ khi drawer thực sự đang mở; nếu đã ẩn từ trước thì
  // restoreLayerFocus (trong closeDrawer) tự xử lý nếu còn opener được lưu.
  if (wasOpen) {
    if (returnTarget && returnTarget.getClientRects().length) returnTarget.focus();
    else if (wasSheetTrigger) {
      // Sheet đã đóng trước khi mở drawer → trả focus về nút More trong bottom nav.
      const moreBtn = document.querySelector('#mobileNav [data-action="more"]');
      if (moreBtn) moreBtn.focus();
    }
  }
}

// Upcoming (setUpcomingRange, tasksForDate, upcomingOverdueTasks, upcomingCollect,
// upcomingDayHeader, upcomingTaskMeta, upcomingTaskRowHTML, renderUpcoming, pushTaskToDate)
// được tách sang js/upcoming.js (window.TaskFlowUpcoming, extraction 36 — R25). upcomingRange
// là state riêng của module. pushTaskToDate dùng chung inbox.js + quick-add.js (resolve qua
// global lexical) — module expose + alias giữ. Deps (t, esc, dateLocale, fmtDeadline, fmtDate,
// checkboxHTML, window.TaskFlowUI, emptyStateHTML, inboxTargetForDate, monthStateRaw/
// loadMonthStateOrCreate/saveMonthState, save, trackEvent, state, PLAN_*/NUM_WEEKS) resolve
// qua global lexical tại thời điểm GỌI — pattern mood.js/popups.js.
if (!window.TaskFlowUpcoming) throw new Error('TaskFlowUpcoming missing — js/upcoming.js failed to load');
const { setUpcomingRange, tasksForDate, upcomingOverdueTasks, upcomingCollect, upcomingDayHeader, upcomingTaskMeta, upcomingTaskRowHTML, renderUpcoming, pushTaskToDate, toggleOverdueExpanded } = window.TaskFlowUpcoming;

/* ============================ Quick Add — thêm nhanh ở mọi màn hình (Phase 4) ============================ */
/* ============================ Quick Add — thêm nhanh ở mọi màn hình (Phase 4) ============================ */
// openQuickAdd/closeQuickAdd/submitQuickAdd/quickAddDefaultTarget/quickAddTarget được
// tách sang js/quick-add.js (window.TaskFlowQuickAdd) — P11 extraction 23. Giữ alias
// để call-sites (keydown Enter, dispatcher shell-add-task/quickadd-*, phím tắt q,
// outside-click, boot ?quick=1) không đổi. pushTaskToDate vẫn ở app.js (dùng chung// với Inbox scheduling). Lazy-load (P1.5): module chỉ nạp khi mở Quick Add lần đầu.

function setView(view, week) {
  // Phase 5: đổi view/tuần → đóng drawer chi tiết (ref index có thể lệch theo tuần mới)
  if (taskDetailRef) closeTaskDetail();
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
  const dy = document.getElementById('view-day');
  const td = document.getElementById('view-today');
  const upc = document.getElementById('view-upcoming');
  const ibx = document.getElementById('view-inbox');
  const pj = document.getElementById('view-projects');
  if (td) td.classList.toggle('active', view === 'today');
  if (upc) upc.classList.toggle('active', view === 'upcoming');
  if (ibx) ibx.classList.toggle('active', view === 'inbox');
  ov.classList.toggle('active', view === 'overview');
  wk.classList.toggle('active', view === 'week');
  yr.classList.toggle('active', view === 'year');
  if (cal) cal.classList.toggle('active', view === 'calendar');
  if (dy) dy.classList.toggle('active', view === 'day');
  if (pj) pj.classList.toggle('active', view === 'projects');
  if (view === 'today') {
    if (td) td.setAttribute('aria-labelledby', 'tab-today');
    renderToday();
  } else if (view === 'upcoming') {
    if (upc) upc.setAttribute('aria-labelledby', 'tab-upcoming');
    renderUpcoming();
  } else if (view === 'inbox') {
    if (ibx) ibx.setAttribute('aria-labelledby', 'tab-inbox');
    renderInbox(inbox);
  } else if (view === 'overview') {
    ov.setAttribute('aria-labelledby', 'tab-overview');
    renderOverview();
  } else if (view === 'week') {
    wk.setAttribute('aria-labelledby', 'tab-week-' + state.currentWeek);
    renderWeek();
    scrollWeekToToday();
  } else if (view === 'day') {
    if (dy) dy.setAttribute('aria-labelledby', 'tab-week-' + state.dayWeek);
    renderDay();
  } else if (view === 'calendar') {
    if (cal) cal.setAttribute('aria-labelledby', 'tab-calendar');
    renderCalendar();
  } else if (view === 'projects') {
    if (pj) pj.setAttribute('aria-labelledby', 'tab-projects');
    renderProjectsView();
  } else {
    yr.setAttribute('aria-labelledby', 'tab-year');
    renderYear();
  }
  // P12 (perf): DOM của view inactive là stale thuần — setView luôn re-render view đích
  // mỗi lần chuyển, nên xoá content các section ẩn để giảm memory/parse (trước đây
  // calendar giữ ~6.000 node ẩn chiếm RAM + chậm re-parse). Giữ attributes của section
  // (aria-labelledby, data-testid) — chỉ xoá children.
  const activeSectionId = 'view-' + view;
  [td, upc, ibx, ov, wk, yr, cal, dy, pj].forEach((s) => {
    if (!s || s.id === activeSectionId) return;
    // Overview render vào #ov-content (div con của section) — phải giữ container đó,
    // nếu xoá cả section thì renderOverview không tìm thấy #ov-content.
    if (s.id === 'view-overview') {
      const oc = document.getElementById('ov-content');
      if (oc) oc.innerHTML = '';
    } else {
      s.innerHTML = '';
    }
  });
  window.TaskFlowUI.syncUrl({
    view,
    year: PLAN_YEAR,
    month: PLAN_MONTH,
    week: view === 'week' ? state.currentWeek : (view === 'day' ? state.dayWeek : undefined),
    day: view === 'day' ? state.dayDay : undefined,
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
  // Phase 16 (perf): text đang gõ còn trong debounce — flush trước khi đổi tháng để
  // keystroke cuối không bị mất khi bootState() đọc lại từ localStorage.
  flushPendingSaves();
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
  // Tháng mới → chuẩn bị dữ liệu ô hôm nay (recurrence + carry task lặp bị lỡ) ngay khi mở
  prepareTodayState();
  updateBrand(PLAN_YEAR, PLAN_MONTH);
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
  updateBrand(PLAN_YEAR, PLAN_MONTH);
  buildNav();
  setView('overview', state.currentWeek);
}

/* ============================ Phase 5: Undo/Redo, Phím tắt, Kéo-thả, Sao lưu, Focus Mode ============================ */

// Phase 5: MỘT stack duy nhất (makeUndoStack tự quản lý undo + redo nội bộ)
let undoStack = window.PlanMath ? window.PlanMath.makeUndoStack(50) : null;
let lastSnapshotJson = null;

function snapshotAll() {
  var tb = null;
  try { tb = JSON.parse(JSON.stringify(loadTimeBlocksStore())); } catch (e) { /* TimeBlock snapshot is best-effort */ }
  return {
    state: JSON.parse(JSON.stringify(state)),
    yearState: JSON.parse(JSON.stringify(yearState)),
    mood: typeof moodMap !== 'undefined' ? JSON.parse(JSON.stringify(moodMap)) : null,
    theme: (typeof THEME !== 'undefined' ? THEME : null) || null,
    plan: { y: PLAN_YEAR, m: PLAN_MONTH, cw: state.currentWeek },
    inbox: Array.isArray(inbox) ? JSON.parse(JSON.stringify(inbox)) : [],
    timeblocks: tb,
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
  if (Array.isArray(snap.inbox)) { inbox = JSON.parse(JSON.stringify(snap.inbox)); }
  if (snap.mood && typeof moodMap !== 'undefined') { moodMap = JSON.parse(JSON.stringify(snap.mood)); }
  if (snap.theme) {
    setTheme(snap.theme);
  }
  if (snap.plan) {
    PLAN_YEAR = snap.plan.y;
    PLAN_MONTH = snap.plan.m;
    state.currentWeek = snap.plan.cw;
  }
  // Phase 6T.2: Restore TimeBlocks on Undo
  if (snap.timeblocks && window.TaskFlowTimeBlocks) {
    try { saveTimeBlocksStore(snap.timeblocks); } catch (e) { /* restore best-effort */ }
  }
  invalidateYearCache();
  renderCurrentView();
  // Phase 5: nếu drawer chi tiết đang mở → đồng bộ lại sau undo/redo (hoặc đóng nếu ref lệch)
  if (taskDetailRef) {
    if (getTaskDetailTarget()) renderTaskDetail();
    else closeTaskDetail();
  }
  save();
  saveYear();
  saveMood();
  lastSnapshotJson = null; // bản khôi phục không được "ăn" lần push kế tiếp
  updateUndoButtons();
}
function renderCurrentView() {
  if (state.view === 'today') renderToday();
  else if (state.view === 'upcoming') renderUpcoming();
  else if (state.view === 'inbox') renderInbox(inbox);
  else if (state.view === 'overview') renderOverview();
  else if (state.view === 'week') renderWeek();
  else if (state.view === 'day') renderDay();
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
// Phase 16 (perf): đóng tab/điều hướng đi → flush mọi save đang debounce
window.addEventListener('pagehide', flushPendingSaves);

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
  if (m.hidden) runLazyModule('js/search.min.js', () => window.TaskFlowSearch.openSearchModal());
  else runLazyModule('js/search.min.js', () => window.TaskFlowSearch.closeSearchModal());
}
function focusTodayTaskAdd() {
  const ti = nowInfo(PLAN_START, NUM_DAYS, PLAN_YEAR, PLAN_MONTH);
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


// Focus mode (openFocusMode/closeFocusMode, taskFocusLog/Secs/Today/Sessions,
// focusTimer state machine, getTaskByUid, renderFocusContent/refreshFocusIfOpen,
// fmtSessionDate — extraction 39, A28) được tách sang js/focus.js (window.TaskFlowFocus).
// focusTaskRef/focusMonthState/FOCUS_PRESETS/focusTimer là state RIÊNG của module.
// Dispatcher (focus, focus-close, focus-task, focus-timer-*, focus-show-all, outside-click)
// + render path (task detail, pomo complete, undo applySnapshot) resolve qua destructure
// alias này (global lexical). taskFocusLog/taskFocusSecs còn được focus-stats.js + today.js gọi.
if (!window.TaskFlowFocus) throw new Error('TaskFlowFocus missing — js/focus.js failed to load');
const { openFocusMode, closeFocusMode, focusTimerStart, focusTimerReset, focusTimerSetDur, refreshFocusIfOpen, taskFocusLog, taskFocusSecs } = window.TaskFlowFocus;

/* ============================ Sự kiện ============================ */

document.addEventListener('click', (e) => {
  if (e.target.closest('select')) return;
  // Phase 4: đóng mọi menu task ⋯ khi click ra ngoài (trừ khi đang thao tác trong menu/điểm mở)
  if (!e.target.closest('.task-menu') && !e.target.closest('[data-action="task-menu"]')) {
    document.querySelectorAll('.task-row.menu-open').forEach((r) => {
      r.classList.remove('menu-open', 'menu-up');
      const b = r.querySelector('[data-action="task-menu"]');
      if (b) b.setAttribute('aria-expanded', 'false');
      const m = r.querySelector('.task-menu');
      if (m) m.hidden = true;
    });
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  // Click trong ô contenteditable (vd text task Inbox) là để GÕ, không phải để mở action
  // (text editable nằm trong thẻ cha data-action="task-detail" → phải chặn trước khi dispatch).
  if (e.target.closest('[contenteditable="true"]')) return;
  const act = el.dataset.action;
  // Phase 4: chọn mục trong menu ⋯ → đóng menu (editor inline sẽ chèn vào row, tránh lẫn với dropdown)
  if (el.closest('.task-menu')) {
    const row = el.closest('.task-row');
    if (row) {
      row.classList.remove('menu-open', 'menu-up');
      const b = row.querySelector('[data-action="task-menu"]');
      if (b) b.setAttribute('aria-expanded', 'false');
      const m = row.querySelector('.task-menu');
      if (m) m.hidden = true;
    }
  }

  // Phase 5: bọc mọi mutation bằng undo snapshot (trước khi đổi state)
  // Lưu ý: 'reset' KHÔNG nằm trong set — pushUndo được gọi trong nhánh đã confirm (tránh phantom entry khi user bấm Hủy)
  const UNDOABLE_ACTS = new Set(['goal', 'ygoal', 'habit', 'wgoal', 'task', 'addtask', 'deltask', 'addgoal', 'confirm-addgoal', 'delgoal', 'addhabit', 'delhabit', 'remind-off-item', 'mgoal', 'qgoal', 'copyhabits', 'template-do', 'pullyear', 'template-add', 'demo-data', 'mood-set', 'mood-clear', 'theme', 'repeat-edit', 'task-duplicate', 'subtask-add', 'subtask-toggle', 'subtask-del', 'td-tag-add', 'td-tag-del', 'td-prio']);
  if (UNDOABLE_ACTS.has(act)) pushUndo();

  if (act === 'sidebar-collapse') { toggleSidebarCollapse(); return; }
  else if (act === 'more') { openMoreSheet(el); return; }
  else if (act === 'more-close') { closeMoreSheet(); return; }
  else if (act === 'tools-open') {
    if (el.closest('#moreSheet')) closeMoreSheet();
    openToolsDrawer(el);
    return;
  }
  else if (act === 'tools-close') { closeToolsDrawer(); return; }
  else if (act === 'shell-add-task') { runLazyModule('js/quick-add.min.js', () => window.TaskFlowQuickAdd.openQuickAdd()); return; }
  else if (act === 'undo') { doUndo(); return; }
  else if (act === 'redo') { doRedo(); return; }
  else if (act === 'habits') {
    // Phase 6: mục TRACK "Thói quen" → mở overview rồi scroll tới widget habits
    setView('overview');
    setTimeout(() => {
      const hw = document.querySelector('[data-widget-id="habits"]');
      if (hw) hw.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 120);
    return;
  }
  else if (act === 'focus') { openFocusMode(); return; }
  else if (act === 'focus-close') { closeFocusMode(); return; }
  else if (act === 'backup-restore') { runLazyModule('js/backup.min.js', () => window.TaskFlowBackup.openBackupModal()); return; }
  else if (act === 'backup-close') { runLazyModule('js/backup.min.js', () => window.TaskFlowBackup.closeBackupModal()); return; }
  else if (act === 'backup-use') { runLazyModule('js/backup.min.js', () => window.TaskFlowBackup.doRestoreBackup(+el.dataset.idx)); return; }
  else if (act === 'feedback') {
    trackEvent('feedback_click', { kind: 'form' });
    if (!FB_FORM_URL) { TaskFlowUI.toast(t('fbNoForm'), 'error'); return; }
    window.open(FB_FORM_URL, '_blank', 'noopener');
    return;
  }
  else if (act === 'chat-toggle') {
    const p = document.getElementById('chatPop');
    if (p) {
      const opening = p.hidden;
      p.hidden = !opening;
      const fab = document.getElementById('chatFab');
      if (fab) fab.setAttribute('aria-expanded', String(opening));
      if (opening) {
        // Chat mở từ FAB → trả focus về FAB khi đóng (P15).
        _chatOpenedFromFab = !!(el === fab || (el && el.closest && el.closest('#chatFabWrap')));
        preloadLazyChat();
        const pomoPanel = document.getElementById('pomoPanel');
        if (pomoPanel) pomoPanel.hidden = true;
        // Trợ lý mở từ Công cụ (desktop) → đóng drawer để panel hiển thị rõ.
        // More sheet (mobile) giữ nguyên — E2E-verified flow: toggle chat/pomo trong sheet.
        if (el && el.closest && el.closest('#toolsDrawer')) closeToolsDrawer();
        // Focus vào input khi mở (P15).
        const inp = document.getElementById('chatInput');
        if (inp && typeof inp.focus === 'function') inp.focus();
      } else {
        // Đóng từ chính FAB → trả focus về FAB.
        if (el === fab) {
          if (fab && typeof fab.focus === 'function') fab.focus();
          _chatOpenedFromFab = false;
        }
      }
    }
    return;
  }
  else if (act === 'chat-close') {
    closeChatPanel();
    return;
  }
  else if (act === 'chat-send') {
    runLazyChat(() => window.TaskFlowChat.doChatSend());
    return;
  }
  else if (act === 'chat-clear') {
    runLazyChat(() => window.TaskFlowChat.doChatClear());
    return;
  }
  else if (act === 'chat-suggest') {
    runLazyChat(() => window.TaskFlowChat.doChatSuggest(el.dataset.topic));
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

  if (act === 'nav') {
    if (el.closest('#moreSheet')) closeMoreSheet();
    // Hành vi "Hôm nay" (kế thừa từ nút Hôm nay trong tools drawer cũ):
    // đang xem tháng khác → quay về tháng hiện tại trước khi mở Today.
    if (el.dataset.view === 'today') {
      const now = new Date();
      if (PLAN_MONTH !== now.getMonth() || PLAN_YEAR !== now.getFullYear()) openMonth(now.getMonth());
    }
    setView(el.dataset.view, +el.dataset.week || undefined);
  }
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
  else if (act === 'open-day') openDay(+el.dataset.week, +el.dataset.day);
  else if (act === 'close-day') setView('week', state.dayWeek);
  else if (act === 'day-prev') goDay(-1);
  else if (act === 'day-next') goDay(1);
  else if (act === 'day-jump') {
    const target = document.getElementById(el.dataset.dayTarget);
    if (target) {
      target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      target.focus({ preventScroll: true });
    }
  }
  else if (act === 'goal') {
    const g = state.monthlyGoals.find((x) => x.id === el.dataset.id);
    if (g) { g.done = !g.done; if (g.done) addXP(20); else removeXP(20); afterGoalToggle(g); if (g.done && monthlyStats(state).pct === 100) confettiBurst(); }
  } else if (act === 'ygoal') {
    const g = yearState.goals.find((x) => x.id === el.dataset.id);
    if (g) { g.done = !g.done; if (g.done) addXP(30); else removeXP(30); afterYearGoalToggle(); }
  } else if (act === 'month') {
    openMonth(+el.dataset.month);
  } else if (act === 'upcoming-range') {
    setUpcomingRange(+el.dataset.days);
  } else if (act === 'upcoming-overdue-toggle') {
    toggleOverdueExpanded();
  } else if (act === 'quickadd-close') {
    runLazyModule('js/quick-add.min.js', () => window.TaskFlowQuickAdd.closeQuickAdd());
  } else if (act === 'quickadd-do') {
    runLazyModule('js/quick-add.min.js', () => window.TaskFlowQuickAdd.submitQuickAdd());
  } else if (act === 'habit-focus') {
    // P8: CTA empty state "Tạo thói quen" — từ Today chuyển sang Overview (nơi có ô nhập habit)
    if (state.view !== 'overview') setView('overview');
    const inp = document.querySelector('[data-role="habit-name-input"]');
    if (inp) inp.focus();
    // Fallback: widget habit bị ẩn trong cài đặt → focus main để không rơi vào trạng thái không focus
    else { const main = document.getElementById('appMain'); if (main) main.focus(); }
  } else if (act === 'inbox-add' || act === 'inbox-del' || act === 'inbox-today' || act === 'inbox-tomorrow' || act === 'inbox-date-schedule') {
    // P11 extraction 20: logic inbox-* sang js/inbox.js — fail-fast destructure ở trên đã đảm bảo module tồn tại
    handleInboxAction(act, el, inbox);
  } else if (act === 'pullyear') {
    pullYearGoalsFromMonths();
  } else if (act === 'mgoal') {
    toggleMonthGoal(+el.dataset.month, el.dataset.id);
  } else if (act === 'qgoal') {
    toggleQuarterGoal(+el.dataset.q, el.dataset.key);
  } else if (act === 'habit') {
    const h = state.habits.find((x) => x.id === el.dataset.id);
    if (h) {
      h.days[+el.dataset.day] = !h.days[+el.dataset.day];
      if (h.days[+el.dataset.day]) addXP(15); else removeXP(15);
      afterHabitToggle(); refreshFocusIfOpen();
      if (state.view === 'today') renderToday();
    }
  } else if (act === 'habitsched') {
    openHabitScheduleModal(el.dataset.id);
  } else if (act === 'habitsched-close') {
    TaskFlowUI.closeDialog('habitSchedModal');
  } else if (act === 'habitsched-save') {
    saveHabitSchedule();
  } else if (act === 'habitsched-type') {
    _habitSchedDraft.type = el.value;
    renderHabitSchedForm();
  } else if (act === 'habitsched-weekday') {
    const d = +el.dataset.day;
    const idx = _habitSchedDraft.days.indexOf(d);
    if (idx >= 0) _habitSchedDraft.days.splice(idx, 1); else _habitSchedDraft.days.push(d);
    el.setAttribute('aria-pressed', String(idx < 0));
    el.classList.toggle('on', idx < 0);
  } else if (act === 'wgoal') {
    const w = state.weeks[+el.dataset.week - 1];
    const g = w.goals[+el.dataset.id];
    if (g) {
      g.done = !g.done;
      if (g.done) addXP(10); else removeXP(10);
      afterWGoalToggle(w);
      if (g.done && weekStats(w).pct === 100) confettiBurst();
    }
  } else if (act === 'task') {
    // Checkbox task — hỗ trợ data-y/data-m (từ Upcoming) để toggle task thuộc tháng khác;
    // data-scope="inbox" để toggle task trong Inbox.
    if (el.dataset.scope === 'inbox') {
      const t = inbox[+el.dataset.task];
      if (t) {
        t.done = !t.done;
        if (t.done) addXP(10); else removeXP(10);
        saveInbox(inbox);
        renderInbox(inbox);
        refreshFocusIfOpen();
      }
      return;
    }
    const tY = el.dataset.y !== undefined ? +el.dataset.y : PLAN_YEAR;
    const tM = el.dataset.m !== undefined ? +el.dataset.m : PLAN_MONTH;
    const st = (tY === PLAN_YEAR && tM === PLAN_MONTH) ? state : monthStateRaw(tY, tM);
    if (!st || !st.weeks) return;
    const w = st.weeks[+el.dataset.week - 1];
    if (!w) return;
    const d = w.days && w.days[+el.dataset.day];
    if (!d) return;
    const t = d.tasks && d.tasks[+el.dataset.task];
    if (t) {
      t.done = !t.done;
      if (t.done) addXP(10); else removeXP(10);
      if (tY === PLAN_YEAR && tM === PLAN_MONTH) {
        syncCarriedDone(+el.dataset.week - 1, +el.dataset.day, +el.dataset.task, t);
        save();
      } else {
        saveMonthState(tY, tM, st);
      }
      if (state.view === 'today') renderToday();
      else if (state.view === 'upcoming') renderUpcoming();
      else refreshTaskUI(w, +el.dataset.day);
      refreshFocusIfOpen();
    }
  } else if (act === 'today-addtask') {
    const cell = window.TaskFlowClock.resolveTodayCell({
      planStart: PLAN_START, numDays: NUM_DAYS, year: PLAN_YEAR, month: PLAN_MONTH, weeks: state.weeks,
    });
    if (!cell.inPlanMonth || !cell.day) return;
    const w = state.weeks[cell.weekIndex];
    const d = cell.day;
    d.tasks.push({ uid: newTaskUid(), kind: 'regular', done: false, text: '', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } });
    renderToday();
    save();
    trackEvent('create_task', { scope: 'today' });
    // Nhảy thẳng vào ô viết task mới để gõ luôn (Enter = xong)
    const fresh = document.querySelector(`[data-role="task-text"][data-week="${ti.week}"][data-day="${ti.dayInWeek}"][data-task="${d.tasks.length - 1}"]`);
    if (fresh) fresh.focus();
  } else if (act === 'addtask') {
    const w = state.weeks[+el.dataset.week - 1];
    const d = w.days[+el.dataset.day];
    d.tasks.push({ uid: newTaskUid(), kind: el.dataset.kind, done: false, text: '', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } });
    renderWeek();
    save();
    trackEvent('create_task', { kind: el.dataset.kind });
    // Tiện ích: sau khi tạo, nhảy thẳng vào ô viết task mới để gõ luôn (Enter = xong)
    const fresh = document.querySelector(`[data-role="task-text"][data-week="${w.n}"][data-day="${el.dataset.day}"][data-task="${d.tasks.length - 1}"]`);
    if (fresh) fresh.focus();
  } else if (act === 'deltask') {
    const w = state.weeks[+el.dataset.week - 1];
    const day = w.days[+el.dataset.day];
    if (!day) return;
    const tk = day.tasks[+el.dataset.task];
    if (!tk) return;
    pushUndo(); // snapshot TRƯỚC khi xóa → Undo khôi phục task
    day.tasks.splice(+el.dataset.task, 1);
    if (state.view === 'today') renderToday();
    else renderWeek();
    save();
    TaskFlowUI.toast(t('taskDeletedToast'), 'info', 6000, [
      { label: t('undoBtnShort'), onClick: () => doUndo() },
    ]);
  } else if (act === 'task-menu') {
    // Phase 4: dropdown ⋯ — toggle menu của task row này, đóng các menu khác
    const row = el.closest('.task-row');
    if (!row) return;
    const open = row.classList.toggle('menu-open');
    el.setAttribute('aria-expanded', String(open));
    const menuEl = row.querySelector('.task-menu');
    if (menuEl) menuEl.hidden = !open;
    document.querySelectorAll('.task-row.menu-open').forEach((r) => {
      if (r !== row) {
        r.classList.remove('menu-open');
        const b = r.querySelector('[data-action="task-menu"]');
        if (b) b.setAttribute('aria-expanded', 'false');
        const m = r.querySelector('.task-menu');
        if (m) m.hidden = true;
      }
    });
    if (open && menuEl) {
      // Mở bằng bàn phím (Enter/Space → click detail 0): đưa focus vào menuitem đầu
      // để ArrowUp/Down điều hướng được ngay (APG menu button pattern).
      if (e.detail === 0) {
        const first = menuEl.querySelector('[role="menuitem"]');
        if (first) requestAnimationFrame(() => first.focus());
      }
      // Menu dropdown bị panel (overflow:hidden) cắt khi task gần đáy → lật lên trên
      requestAnimationFrame(() => {
        const pr = row.closest('.week-day-panel');
        if (!pr) return;
        const mr = menuEl.getBoundingClientRect();
        const prr = pr.getBoundingClientRect();
        row.classList.toggle('menu-up', mr.bottom > prr.bottom + 1);
      });
    } else if (!open) {
      row.classList.remove('menu-up');
    }
  } else if (act === 'task-move') {
    const week = +el.dataset.week;
    const day = +el.dataset.day;
    const task = +el.dataset.task;
    openTaskDetail(week, day, task);
    // Focus vào select ngày để chuyển task sang ngày khác nhanh
    requestAnimationFrame(() => {
      const sel = document.querySelector('[data-action="td-date"]');
      if (sel) sel.focus();
    });
  } else if (act === 'task-duplicate') {
    const w = state.weeks[+el.dataset.week - 1];
    const d = w.days[+el.dataset.day];
    const src = d.tasks[+el.dataset.task];
    if (src) {
      // Bản nhân bản là task mới — không kế thừa carriedFrom (badge ↳ dồn) hay trạng thái done
      const copy = { ...src, uid: newTaskUid(), done: false, text: src.text, carriedFrom: undefined, linkedMetricIds: [] };
      d.tasks.push(copy);
      if (state.view === 'today') renderToday();
      else renderWeek();
      save();
      trackEvent('duplicate_task');
      TaskFlowUI.toast(t('taskDuplicateDone'), 'success');
    }
  } else if (act === 'focus-task') {
    // Phase 6: focus vào đúng task này (nếu đang mở drawer thì đóng trước).
    // Truyền cả y/m để focus task thuộc tháng khác (từ Upcoming); scope=inbox cho task trong Inbox.
    closeTaskDetail();
    openFocusMode(el.dataset.scope === 'inbox'
      ? { scope: 'inbox', task: el.dataset.task }
      : {
        week: el.dataset.week, day: el.dataset.day, task: el.dataset.task,
        y: el.dataset.y !== undefined ? el.dataset.y : undefined,
        m: el.dataset.m !== undefined ? el.dataset.m : undefined,
      });
  } else if (act === 'focus-show-all') {
    openFocusMode();
  } else if (act === 'focus-timer-start') {
    focusTimerStart();
  } else if (act === 'focus-timer-reset') {
    focusTimerReset();
  } else if (act === 'focus-timer-set') {
    focusTimerSetDur(+el.dataset.min);
  } else if (act === 'task-detail') {
    if (el.dataset.scope === 'inbox') openInboxTaskDetail(+el.dataset.task);
    else openTaskDetail(+el.dataset.week, +el.dataset.day, +el.dataset.task,
      el.dataset.y !== undefined ? +el.dataset.y : undefined,
      el.dataset.m !== undefined ? +el.dataset.m : undefined);
  } else if (act === 'task-detail-close') {
    closeTaskDetail();
  } else if (act === 'td-time-toggle') {
    const g = getTaskDetailTarget();
    if (!g) return;
    if (!g.tk.remind) g.tk.remind = { enabled: false, time: '20:00' };
    g.tk.remind.enabled = el.checked;
    const timeIn = document.querySelector('#taskDrawer [data-action="td-time"]');
    if (timeIn) timeIn.disabled = !el.checked;
    refreshTaskRowAfterEdit();
  } else if (act === 'td-prio') {
    // P0.2: toggle priority từ drawer — trước đây không có handler, click checkbox
    // chỉ đổi trạng thái hiển thị mà không bao giờ lưu vào state.
    const g = getTaskDetailTarget();
    if (!g) return;
    g.tk.kind = el.checked ? 'priority' : 'regular';
    refreshTaskRowAfterEdit();
    trackEvent('edit_task_priority');
  } else if (act === 'td-tag-add') {
    const g = getTaskDetailTarget();
    const inp = document.querySelector('#taskDrawer [data-role="td-tag-input"]');
    if (!g || !inp) return;
    const v = inp.value.trim();
    if (v) {
      g.tk.tags = g.tk.tags || [];
      if (!g.tk.tags.includes(v)) {
        if (g.tk.tags.length >= 8) { TaskFlowUI.toast(t('tagLimit')); }
        else { g.tk.tags = g.tk.tags.concat(v.split(',').map((s) => s.trim()).filter(Boolean)).slice(0, 8); }
      }
      inp.value = '';
      renderTaskDetail();
      refreshTaskRowAfterEdit();
      const freshTag = document.querySelector('#taskDrawer [data-role="td-tag-input"]');
      if (freshTag) freshTag.focus();
      trackEvent('edit_task_tags');
    }
  } else if (act === 'td-tag-del') {
    const g = getTaskDetailTarget();
    if (!g) return;
    g.tk.tags = (g.tk.tags || []).filter((tg) => tg !== el.dataset.tag);
    renderTaskDetail();
    refreshTaskRowAfterEdit();
  } else if (act === 'td-energy') {
    // V1.2.1 — năng lượng: low/medium/high hoặc '' = bỏ chọn.
    const g = getTaskDetailTarget();
    if (!g) return;
    g.tk.energy = el.dataset.level || null;
    renderTaskDetail();
    refreshTaskRowAfterEdit();
    trackEvent('edit_task_energy');
  } else if (act === 'td-ctx-toggle') {
    // V1.2.1 — bối cảnh: toggle context ID (không lưu label).
    const g = getTaskDetailTarget();
    if (!g) return;
    const id = el.dataset.ctx;
    const ids = Contexts.taskContextIds(g.tk);
    g.tk.contexts = ids.includes(id) ? ids.filter((x) => x !== id) : ids.concat(id);
    renderTaskDetail();
    refreshTaskRowAfterEdit();
    trackEvent('edit_task_context');
  } else if (act === 'ctx-manage') {
    openContextEditModal();
  } else if (act === 'ctx-add') {
    const inp = document.querySelector('#contextEditModal [data-role="ctx-add-input"]');
    const v = inp ? inp.value.trim() : '';
    if (!v) return;
    const store = loadContextsStore();
    const c = Contexts.createContext(store, v);
    if (c) {
      saveContextsStore(store);
      trackEvent('context_add');
      TaskFlowUI.toast(t('ctxSaved'), 'success');
      renderContextEditContent();
      const fresh = document.querySelector('#contextEditModal [data-role="ctx-add-input"]');
      if (fresh) fresh.focus();
    }
  } else if (act === 'ctx-delete') {
    const store = loadContextsStore();
    const c = Contexts.getContext(store, el.dataset.ctx);
    if (!c) return;
    if (confirm(t('ctxDeleteConfirm', { label: c.label }))) {
      Contexts.deleteContext(store, el.dataset.ctx);
      saveContextsStore(store);
      removeContextAcrossStore(el.dataset.ctx);
      trackEvent('context_delete');
      TaskFlowUI.toast(t('ctxDeleted'), 'success');
      renderContextEditContent();
      if (taskDetailRef && getTaskDetailTarget()) renderTaskDetail();
    }
  } else if (act === 'ctx-close') {
    TaskFlowUI.closeDialog('contextEditModal');
  } else if (act === 'planner-open') {
    openPlannerModal();
  } else if (act === 'planner-close') {
    TaskFlowUI.closeDialog('plannerModal');
  } else if (act === 'planner-cancel') {
    TaskFlowUI.closeDialog('plannerModal');
    trackEvent('planner_cancel');
  } else if (act === 'planner-apply') {
    applyPlannerPlan();
  } else if (act === 'ai-run') {
    aiRun();
  } else if (act === 'ai-apply') {
    aiApply();
  } else if (act === 'ai-cancel') {
    // Phase 6T.1: Cancel also aborts in-flight request
    if (_aiAbortCtrl) { try { _aiAbortCtrl.abort(); } catch (e) { /* ignore */ } _aiAbortCtrl = null; }
    _aiRequestGen++;
    delete window._lastAiProposal;
    _aiDraft = null;
    _aiEditActive = false;
    const host = document.querySelector('#plannerAi [data-role="ai-result"]');
    if (host) host.innerHTML = '';
    setPlannerMode('rule');
  } else if (act === 'ai-edit') {
    // Phase 6T.2: Toggle edit mode on/off
    _aiEditActive = !_aiEditActive;
    const editBtns = document.querySelectorAll('[data-action="ai-edit"]');
    editBtns.forEach(b => { b.textContent = _aiEditActive ? t('aiDone') : t('aiEdit'); });
    const editControls = document.querySelectorAll('.ai-edit-controls');
    editControls.forEach(c => { c.hidden = !_aiEditActive; });
    if (_aiEditActive) {
      // Focus first edit field
      const firstInput = document.querySelector('.ai-edit-controls:not([hidden]) .ai-edit-input');
      if (firstInput) firstInput.focus();
    }
  } else if (act === 'ai-retry') {
    // Phase 6T.1: Retry requires explicit user action
    aiRun();
  } else if (act === 'ai-feedback') {
    // Phase 6T: Record helpful/not-helpful feedback
    try {
      const rating = el.dataset.rating;
      if (window.TaskFlowAIFeedback && rating) {
        window.TaskFlowAIFeedback.recordFeedback({ feature: 'plan_day', rating: rating, timestamp: Date.now() });
        const fbBar = el.closest('[data-role="ai-feedback"]');
        if (fbBar) {
          fbBar.innerHTML = '<span class="ai-feedback-thanks">' + esc(t('thanksFeedback')) + '</span>';
        }
      }
    } catch (e) { /* feedback must never break app */ }
  } else if (act === 'ai-kind') {
    const kind = el.value || 'plan_day';
    const targets = el.closest('[data-role="ai-panel"]') && el.closest('[data-role="ai-panel"]').querySelector('[data-role="ai-targets"]');
    if (targets) targets.hidden = !(kind === 'breakdown_project' || kind === 'breakdown_milestone');
  } else if (act === 'cal-mode') {
    // V1.2 Phase 2 — Calendar mode toggle: month grid | schedule timeline.
    const nextMode = el.dataset.mode === 'schedule' ? 'schedule' : 'month';
    const enteringSchedule = nextMode === 'schedule' && calendarMode !== 'schedule';
    calendarMode = nextMode;
    if (enteringSchedule && gcalRefreshPending) {
      // Edge case Month → Schedule: render cache NGAY (không block UI), rồi
      // fetch nền đúng 1 lần nếu đang chờ refresh từ lúc quay lại tab.
      renderCalendarSchedule(true);
      gcalConsumePendingRefresh();
    } else {
      renderCalendar();
    }
  } else if (act === 'tb-day') {
    calendarUnscheduledExpanded = false;
    calendarSelDate = el.dataset.date || localTodayIso();
    renderCalendarSchedule();
  } else if (act === 'tb-prev') {
    calendarUnscheduledExpanded = false;
    const d = TimeBlocksUI.parseISO(calendarSelDate || localTodayIso());
    calendarSelDate = TimeBlocksUI.iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
    renderCalendarSchedule();
  } else if (act === 'tb-next') {
    calendarUnscheduledExpanded = false;
    const d = TimeBlocksUI.parseISO(calendarSelDate || localTodayIso());
    calendarSelDate = TimeBlocksUI.iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
    renderCalendarSchedule();
  } else if (act === 'tb-today') {
    calendarUnscheduledExpanded = false;
    calendarSelDate = localTodayIso();
    renderCalendarSchedule();
  } else if (act === 'tb-uns-toggle') {
    calendarUnscheduledExpanded = el.getAttribute('aria-expanded') !== 'true';
    renderCalendarSchedule();
  } else if (act === 'tb-add') {
    openTimeBlockModal({ date: el.dataset.date || calendarSelDate || localTodayIso() });
  } else if (act === 'tb-quick') {
    // Quick Schedule: mở dialog Thêm khung giờ với task + ngày + duration đề xuất.
    openTimeBlockModal({
      taskUid: el.dataset.uid || '',
      date: el.dataset.date || calendarSelDate || localTodayIso(),
      durationMinutes: el.dataset.dur ? parseInt(el.dataset.dur, 10) : undefined,
    });
  } else if (act === 'td-tb-add') {
    openTimeBlockModal({ taskUid: el.dataset.uid || '' });
  } else if (act === 'tb-edit') {
    openTimeBlockModal({ blockId: el.dataset.id });
  } else if (act === 'tb-save') {
    saveTimeBlockDialog();
  } else if (act === 'tb-close') {
    closeTimeBlockModal();
  } else if (act === 'tb-del') {
    deleteTimeBlockById(el.dataset.id);
  } else if (act === 'tb-status') {
    const blocks = loadTimeBlocksStore();
    const block = window.TaskFlowTimeBlocks.getBlock(blocks, el.dataset.id);
    const next = block && block.status === 'completed' ? 'planned' : 'completed';
    setTimeBlockStatusById(el.dataset.id, next);
  } else if (act === 'tb-focus') {
    focusFromTimeBlock(el.dataset.id);
  } else if (act === 'gcal-connect') {
    if (window.TaskFlowGCal) window.TaskFlowGCal.connect();
  } else if (act === 'gcal-refresh') {
    const todayIso = localTodayIso();
    const monthStart = `${PLAN_YEAR}-${String(PLAN_MONTH + 1).padStart(2, '0')}-01`;
    const nd = new Date(PLAN_YEAR, PLAN_MONTH + 1, 0).getDate();
    const monthEnd = `${PLAN_YEAR}-${String(PLAN_MONTH + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
    if (window.TaskFlowGCalUI && window.TaskFlowGCalUI.getState().connected) {
      window.TaskFlowGCalUI.refreshEvents(monthStart, monthEnd).then(() => renderCalendarSchedule());
    } else {
      scheduleGcalRefresh(calendarSelDate || todayIso, monthStart, monthEnd, true);
    }
  } else if (act === 'gcal-disconnect') {
    disconnectGcal();
  } else if (act === 'gcal-syncdeletes') {
    if (window.TaskFlowGCal && window.TaskFlowGCal.setSyncDeletes) {
      window.TaskFlowGCal.setSyncDeletes(!!el.checked);
      trackEvent('gcal_syncdeletes', { on: !!el.checked });
    }
  } else if (act === 'gcal-export') {
    exportTimeBlockToGcal(el.dataset.id);
  } else if (act === 'subtask-add') {
    const g = getTaskDetailTarget();
    const inp = document.querySelector('#taskDrawer [data-role="td-subtask-input"]');
    if (!g || !inp) return;
    const v = inp.value.trim();
    if (v) {
      g.tk.subtasks = g.tk.subtasks || [];
      g.tk.subtasks.push({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 6), text: v, done: false });
      inp.value = '';
      renderTaskDetail();
      refreshTaskRowAfterEdit();
      const freshSub = document.querySelector('#taskDrawer [data-role="td-subtask-input"]');
      if (freshSub) freshSub.focus();
      trackEvent('add_subtask');
    }
  } else if (act === 'subtask-toggle') {
    const g = getTaskDetailTarget();
    if (!g || !g.tk.subtasks) return;
    const s = g.tk.subtasks[+el.dataset.sub];
    if (!s) return;
    s.done = !s.done;
    renderTaskDetail();
    refreshTaskRowAfterEdit();
  } else if (act === 'subtask-del') {
    const g = getTaskDetailTarget();
    if (!g) return;
    g.tk.subtasks = (g.tk.subtasks || []).filter((_, i) => i !== +el.dataset.sub);
    renderTaskDetail();
    refreshTaskRowAfterEdit();
  } else if (act === 'td-delete') {
    const g = getTaskDetailTarget();
    pushUndo(); // snapshot TRƯỚC khi xóa → Undo khôi phục task từ drawer
    if (taskDetailRef && taskDetailRef.scope === 'inbox') {
      inbox.splice(taskDetailRef.task, 1);
      closeTaskDetail();
      saveInbox(inbox);
      renderInbox(inbox);
    } else {
      if (g && g.d && Array.isArray(g.d.tasks)) g.d.tasks.splice(taskDetailRef.task, 1);
      const delY = taskDetailRef ? taskDetailRef.y : PLAN_YEAR;
      const delM = taskDetailRef ? taskDetailRef.m : PLAN_MONTH;
      const delSt = taskDetailState();
      closeTaskDetail();
      if (state.view === 'today') renderToday();
      else if (state.view === 'upcoming') renderUpcoming();
      else renderWeek();
      if (delY === PLAN_YEAR && delM === PLAN_MONTH) save();
      else if (delSt) saveMonthState(delY, delM, delSt);
    }
    TaskFlowUI.toast(t('taskDeletedToast'), 'info', 6000, [
      { label: t('undoBtnShort'), onClick: () => doUndo() },
    ]);
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
    runLazyModule('js/search.min.js', () => window.TaskFlowSearch.openSearchModal());
  } else if (act === 'search-close') {
    if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
    runLazyModule('js/search.min.js', () => window.TaskFlowSearch.closeSearchModal());
  } else if (act === 'search-go') {
    runLazyModule('js/search.min.js', () => window.TaskFlowSearch.goSearchResult(el));
  } else if (act === 'tagfilter') {
    tagFilter = el.dataset.tag || null;
    if (state.view === 'calendar') { renderCalendar(); }
    else {
      // Partial update: cập nhật filter bar + toggle class filtered-out trên
      // các task row hiện có, tránh renderWeek() toàn bộ (giữ focus/scroll).
      const bar = document.querySelector('.tag-filter-bar');
      if (bar) {
        const tmp = document.createElement('div');
        tmp.innerHTML = weekTagFilterBar();
        bar.replaceWith(tmp.firstElementChild);
      }
      const weeks = state.weeks;
      document.querySelectorAll('.task-row').forEach((row) => {
        const wk = +row.dataset.week, dy = +row.dataset.day, ti = +row.dataset.task;
        const w = Number.isFinite(wk) ? weeks[wk - 1] : null;
        const d = w && Number.isFinite(dy) ? w.days[dy] : null;
        const task = d && Number.isFinite(ti) ? d.tasks[ti] : null;
        const tags = task && Array.isArray(task.tags) ? task.tags : [];
        row.classList.toggle('filtered-out', !!tagFilter && !tags.includes(tagFilter));
      });
    }
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
  } else if (act === 'month-carry-open') {
    openMonthCarry(el);
  } else if (act === 'month-carry-preview') {
    previewMonthCarry();
  } else if (act === 'month-carry-apply') {
    applyMonthCarry();
  } else if (act === 'month-carry-close') {
    closeMonthCarry();
  } else if (act === 'report-history-open-panel') {
    openUnifiedReportHistory();
  } else if (act === 'report-history-filter') {
    reportHistoryFilter = el.dataset.historyFilter || 'daily';
    renderUnifiedReportHistory();
  } else if (act === 'report-history-open') {
    openUnifiedHistoryEntry(el.dataset.historyId || '');
  } else if (act === 'report-history-close') {
    closeUnifiedReportHistory();
  } else if (act === 'week-report') {
    openWeekReportModal();
  } else if (act === 'close-week-report') {
    closeWeekReportModal();
  } else if (act === 'share-week-report') {
    doShareWeekReport();
  } else if (act === 'year-report') {
    runLazyModule('js/year-report.min.js', () => window.TaskFlowYearReport.openYearReportModal());
  } else if (act === 'close-year-report') {
    runLazyModule('js/year-report.min.js', () => window.TaskFlowYearReport.closeYearReportModal());
  } else if (act === 'share-year-report') {
    runLazyModule('js/year-report.min.js', () => window.TaskFlowYearReport.doShareYearReport());
  } else if (act === 'stats') {
    runLazyModule('js/stats-ui.min.js', () => window.TaskFlowStatsUI.openStatsModal());
  } else if (act === 'stats-close') {
    runLazyModule('js/stats-ui.min.js', () => window.TaskFlowStatsUI.closeStatsModal());
  } else if (act === 'stats-range') {
    runLazyModule('js/stats-ui.min.js', () => window.TaskFlowStatsUI.setStatsRange(el.dataset.range));
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
    // Partial update: chỉ toggle class 'on' trên mood buttons của ngày đó,
    // tránh renderWeek() toàn bộ (mất focus/scroll khi đang thao tác view Tuần).
    document.querySelectorAll(`[data-action="mood"][data-day-key="${el.dataset.dayKey}"]`).forEach((b) => {
      b.classList.toggle('on', +b.dataset.mood === +el.dataset.mood);
    });
  } else if (act === 'mood-pick') {
    openMoodPicker(+el.dataset.day);
  } else if (act === 'mood-set') {
    moodMap[moodDateKey(+el.dataset.day, PLAN_YEAR, PLAN_MONTH)] = +el.dataset.mood;
    saveMood();
    trackEvent('mood_set', { level: +el.dataset.mood });
    closeMoodPicker();
    rerenderMoodCard();
  } else if (act === 'mood-clear') {
    delete moodMap[moodDateKey(+el.dataset.day, PLAN_YEAR, PLAN_MONTH)];
    saveMood();
    trackEvent('mood_clear', { day: +el.dataset.day });
    closeMoodPicker();
    rerenderMoodCard();
  } else if (act === 'reflection-mood') {
    window.TaskFlowReflection.setMood(el.dataset.mood);
  } else if (act === 'reflection-save-quick') {
    window.TaskFlowReflection.saveQuickFromCard();
  } else if (act === 'reflection-deep') {
    window.TaskFlowReflection.openDeepReflection();
  } else if (act === 'reflection-deep-save') {
    window.TaskFlowReflection.saveDeepFromModal();
  } else if (act === 'reflection-deep-close') {
    window.TaskFlowReflection.closeDeepReflection();
  } else if (act === 'reflection-history') {
    window.TaskFlowReflection.openHistory();
  } else if (act === 'reflection-history-close') {
    window.TaskFlowReflection.closeHistory();
  } else if (act === 'reflection-history-open') {
    window.TaskFlowReflection.openHistoryEntry(el.dataset.key);
  } else if (act === 'pillar-add') {
    window.TaskFlowPillars.openPillarEdit(null, el);
  } else if (act === 'pillar-edit') {
    window.TaskFlowPillars.openPillarEdit(el.dataset.id, el);
  } else if (act === 'pillar-edit-close') {
    window.TaskFlowPillars.closePillarEdit();
  } else if (act === 'pillar-save') {
    const res = window.TaskFlowPillars.applyPillarEdit(state);
    if (res.ok) {
      save();
      trackEvent('pillar_save');
      rerenderPillars();
      TaskFlowUI.toast(t('pillarSaved'), 'success');
    }
  } else if (act === 'pillar-delete') {
    const p = window.TaskFlowPillars.pillarById(state, el.dataset.id);
    if (p && confirm(t('pillarDeleteConfirm', { name: p.name }))) {
      window.TaskFlowPillars.removePillar(state, p.id);
      window.TaskFlowPillars.closePillarEdit();
      save();
      trackEvent('pillar_delete');
      rerenderPillars();
      TaskFlowUI.toast(t('pillarDeleted'), 'success');
    }
  } else if (act === 'pillar-toggle') {
    const p = window.TaskFlowPillars.togglePillarHidden(state, el.dataset.id);
    if (p) {
      save();
      trackEvent('pillar_toggle');
      rerenderPillars();
      TaskFlowUI.toast(t(p.hidden ? 'pillarHiddenT' : 'pillarShownT'), 'info');
    }
  } else if (act === 'metric-add') {
    window.TaskFlowPillars.openMetricEdit(null, el.dataset.pillarId, el);
  } else if (act === 'metric-edit') {
    window.TaskFlowPillars.openMetricEdit(el.dataset.id, null, el);
  } else if (act === 'metric-edit-close') {
    window.TaskFlowPillars.closeMetricEdit();
  } else if (act === 'metric-save') {
    const res = window.TaskFlowPillars.applyMetricEdit(state);
    if (res.ok) {
      save();
      trackEvent('metric_save');
      rerenderPillars();
      TaskFlowUI.toast(t('metricSaved'), 'success');
    }
  } else if (act === 'metric-delete') {
    const m = window.TaskFlowPillars.metricById(state, el.dataset.id);
    if (m && confirm(t('metricDeleteConfirm', { name: m.title }))) {
      window.TaskFlowPillars.removeMetric(state, m.id);
      window.TaskFlowPillars.closeMetricEdit();
      save();
      trackEvent('metric_delete');
      rerenderPillars();
      TaskFlowUI.toast(t('metricDeleted'), 'success');
    }
  } else if (act === 'metric-day') {
    // P3: toggle ô ngày manual — chỉ re-render row (giữ focus/scroll trong day strip)
    const m = window.TaskFlowPillars.toggleMetricDay(state, el.dataset.id, el.dataset.day);
    save();
    trackEvent('metric_day');
    if (m) updateMetricRow(state, m.id);
  } else if (act === 'pillars-reset') {
    if (confirm(t('pillarsResetConfirm'))) {
      window.TaskFlowPillars.resetPillars(state);
      save();
      trackEvent('pillars_reset');
      rerenderPillars();
      TaskFlowUI.toast(t('pillarsResetDone'), 'success');
    }
  } else if (act === 'project-new') {
    openProjectEditModal(null);
  } else if (act === 'project-create-save') {
    const store = loadProjectsStore();
    const form = document.querySelector('[data-role="project-edit-form"]');
    const name = form ? (form.querySelector('[data-role="project-name"]') || {}).value : '';
    const target = form ? (form.querySelector('[data-role="project-target"]') || {}).value : '';
    const notes = form ? (form.querySelector('[data-role="project-notes"]') || {}).value : '';
    const created = ProjectsStore.createProject(store, { title: name, targetDate: target || null, notes });
    if (!created) { TaskFlowUI.toast(t('projectNameRequired'), 'error'); return; }
    saveProjectsStore(store);
    TaskFlowUI.closeDialog('projectEditModal');
    trackEvent('project_create');
    renderProjectsViewWith(store, 'active', created.id);
    TaskFlowUI.toast(t('projectSaved'), 'success');
  } else if (act === 'project-edit') {
    openProjectEditModal(el.dataset.id);
  } else if (act === 'project-edit-save') {
    const store = loadProjectsStore();
    const form = document.querySelector('[data-role="project-edit-form"]');
    const name = form ? (form.querySelector('[data-role="project-name"]') || {}).value : '';
    const target = form ? (form.querySelector('[data-role="project-target"]') || {}).value : '';
    const notes = form ? (form.querySelector('[data-role="project-notes"]') || {}).value : '';
    const updated = ProjectsStore.updateProject(store, el.dataset.id, { title: name, targetDate: target || null, notes });
    if (!updated) { TaskFlowUI.toast(t('projectNameRequired'), 'error'); return; }
    saveProjectsStore(store);
    TaskFlowUI.closeDialog('projectEditModal');
    trackEvent('project_edit');
    renderProjectsViewWith(store, projectsFilter, updated.id);
    TaskFlowUI.toast(t('projectSaved'), 'success');
  } else if (act === 'project-edit-close') {
    TaskFlowUI.closeDialog('projectEditModal');
  } else if (act === 'project-open') {
    renderProjectsViewWith(loadProjectsStore(), projectsFilter, el.dataset.id);
  } else if (act === 'project-back') {
    renderProjectsViewWith(loadProjectsStore(), projectsFilter, null);
  } else if (act === 'project-filter') {
    projectsFilter = el.dataset.filter || 'active';
    renderProjectsViewWith(loadProjectsStore(), projectsFilter, null);
  } else if (act === 'project-archive') {
    const store = loadProjectsStore();
    const p = ProjectsStore.archiveProject(store, el.dataset.id);
    if (p) { saveProjectsStore(store); trackEvent('project_archive'); renderProjectsViewWith(store, projectsFilter, null); TaskFlowUI.toast(t('projectArchivedT'), 'success'); }
  } else if (act === 'project-restore') {
    const store = loadProjectsStore();
    const p = ProjectsStore.restoreProject(store, el.dataset.id);
    if (p) { saveProjectsStore(store); trackEvent('project_restore'); renderProjectsViewWith(store, projectsFilter, null); TaskFlowUI.toast(t('projectRestoredT'), 'success'); }
  } else if (act === 'project-complete') {
    const store = loadProjectsStore();
    const p = ProjectsStore.completeProject(store, el.dataset.id);
    if (p) { saveProjectsStore(store); trackEvent('project_complete'); renderProjectsViewWith(store, projectsFilter, el.dataset.id); TaskFlowUI.toast(t('projectCompletedT'), 'success'); }
  } else if (act === 'project-open-task') {
    const wk = el.dataset.week;
    const dy = el.dataset.day;
    if (wk !== '' && dy !== '' && wk !== undefined && dy !== undefined) {
      openTaskDetail(+wk, +dy, +el.dataset.task);
    } else {
      TaskFlowUI.toast(t('projectLinkedTaskAria'), 'info');
    }
  } else if (act === 'mile-add') {
    openMilestoneEditModal(el.dataset.id, null);
  } else if (act === 'mile-edit') {
    openMilestoneEditModal(el.dataset.pid, el.dataset.mid);
  } else if (act === 'mile-edit-close') {
    TaskFlowUI.closeDialog('milestoneEditModal');
  } else if (act === 'mile-edit-save') {
    const store = loadProjectsStore();
    const form = document.querySelector('[data-role="milestone-edit-form"]');
    const name = form ? (form.querySelector('[data-role="milestone-name"]') || {}).value : '';
    const target = form ? (form.querySelector('[data-role="milestone-target"]') || {}).value : '';
    const pid = el.dataset.pid;
    if (el.dataset.mid) {
      ProjectsStore.updateMilestone(store, pid, el.dataset.mid, { title: name, targetDate: target || null });
    } else {
      const created = ProjectsStore.createMilestone(store, pid, { title: name, targetDate: target || null });
      if (!created) { TaskFlowUI.toast(t('milestoneNameRequired'), 'error'); return; }
    }
    saveProjectsStore(store);
    TaskFlowUI.closeDialog('milestoneEditModal');
    trackEvent('milestone_save');
    renderProjectsViewWith(store, projectsFilter, pid);
    TaskFlowUI.toast(t('milestoneSaved'), 'success');
  } else if (act === 'mile-toggle') {
    const store = loadProjectsStore();
    const m = ProjectsStore.completeMilestone(store, el.dataset.pid, el.dataset.mid);
    if (m) { saveProjectsStore(store); trackEvent('milestone_toggle'); renderProjectsViewWith(store, projectsFilter, el.dataset.pid); }
  } else if (act === 'mile-del') {
    const store = loadProjectsStore();
    const pj = ProjectsStore.getProject(store, el.dataset.pid);
    const m = pj ? ProjectsStore.getMilestone(store, el.dataset.pid, el.dataset.mid) : null;
    if (m && confirm(t('milestoneDeleteConfirm', { name: m.title }))) {
      // Xoá milestone → task liên kết giữ projectId, clear milestoneId (referential rule).
      unlinkTaskMilestoneAcrossStore(el.dataset.pid, el.dataset.mid);
      ProjectsStore.deleteMilestone(store, el.dataset.pid, el.dataset.mid);
      saveProjectsStore(store);
      save();
      saveInbox(inbox);
      trackEvent('milestone_delete');
      renderProjectsViewWith(loadProjectsStore(), projectsFilter, el.dataset.pid);
      TaskFlowUI.toast(t('milestoneDeleted'), 'success');
    }
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
    DARK = toggleDark(DARK);
  } else if (act === 'lang') {
    setLang(getLang() === 'vi' ? 'en' : 'vi');
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
    exportJSON(LEGACY_KEY);
  } else if (act === 'import-json') {
    togglePop('dataPop');
    const fi = document.getElementById('importFile');
    if (fi) fi.click();
  } else if (act === 'export-csv') {
    togglePop('dataPop');
    exportCSV();
  } else if (act === 'export-ics') {
    togglePop('dataPop');
    exportICS();
  } else if (act === 'adaptive-toggle') {
    // Phase 6T: Toggle adaptive planning on/off
    try {
      if (window.TaskFlowAIAdaptation) {
        const enabled = window.TaskFlowAIAdaptation.isEnabled();
        window.TaskFlowAIAdaptation.setEnabled(!enabled);
        _updateAdaptiveToggleUI();
        TaskFlowUI.toast(t(enabled ? 'adaptiveDisabled' : 'adaptiveEnabled'), 'success');
      }
    } catch (e) { /* adaptive toggle must never break app */ }
  } else if (act === 'adaptive-view') {
    // Phase 6T: Show learned patterns modal
    _showAdaptivePatterns();
  } else if (act === 'adaptive-reset') {
    // Phase 6T: Reset learned data with confirmation
    try {
      if (window.TaskFlowAIAdaptation && confirm(t('resetConfirm'))) {
        window.TaskFlowAIAdaptation.reset();
        _updateAdaptiveToggleUI();
        TaskFlowUI.toast(t('resetSuccess'), 'success');
        trackEvent('adaptive_reset');
      }
    } catch (e) { /* adaptive reset must never break app */ }
  } else if (act === 'adaptive-close') {
    TaskFlowUI.closeDialog('adaptivePatternsModal');
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
      yearState = hasAccount() ? emptyYearState(PLAN_YEAR) : defaultYearState(PLAN_YEAR);
      state = hasAccount() ? emptyState() : defaultState();
      setView(state.view, state.currentWeek);
    }
  }
});

document.addEventListener('change', (e) => {
  const act = e.target.dataset && e.target.dataset.action;
  if (act === 'weekselect') goWeek(+e.target.value);
  else if (act === 'monthselect') openMonth(+e.target.value);
  else if (act === 'td-project' || act === 'td-milestone') onTaskLinkSelectChange(e, act);
  else if (act === 'ctx-name') onContextRename(e);
  // Phase 6T.2: Edit field changes trigger draft revalidation
  else if (act === 'ai-edit-field') {
    const idx = parseInt(e.target.dataset.actionIndex, 10);
    const field = e.target.dataset.editField;
    if (isNaN(idx) || !field || !_aiDraft || !Array.isArray(_aiDraft.actions)) return;
    const Review = (typeof window !== 'undefined' && window.TaskFlowAIReview) || null;
    const AI = window.TaskFlowAI;
    if (!Review || !AI) return;
    const origProposal = window._lastAiProposal && window._lastAiProposal.proposal;
    const origAction = origProposal && origProposal.actions ? origProposal.actions[idx] : _aiDraft.actions[idx];
    if (!origAction) return;
    // Collect all current edit values
    const editedFields = {};
    document.querySelectorAll(`[data-action-index="${idx}"].ai-edit-input`).forEach(inp => {
      editedFields[inp.dataset.editField] = inp.value;
    });
    // Patch the draft action
    _aiDraft.actions[idx] = Review.patchAction(origAction, editedFields);
    // Revalidate
    const draftValidation = Review.validateReviewDraft(
      { editedFields }, origAction, { tasks: [], timeblocks: [] }
    );
    const refs = window._lastAiProposal && window._lastAiProposal.refs;
    const fullValidation = AI.validateProposalLocal(_aiDraft, refs || {});
    // Update status and Apply button state
    const statusEl = document.querySelector(`[data-edit-status="${idx}"]`);
    const applyBtn = document.querySelector('[data-action="ai-apply"]');
    if (!draftValidation.ok || !fullValidation.ok) {
      if (statusEl) statusEl.textContent = t('aiEditBlocked');
      if (applyBtn) applyBtn.disabled = true;
    } else {
      if (statusEl) statusEl.textContent = '';
      if (applyBtn) applyBtn.disabled = false;
      // Rerun conflict check for schedule edits
      try {
        const blocks = loadTimeBlocksStore();
        const warnings = AI.conflictCheck(_aiDraft, blocks, []);
        const warnMap = {};
        warnings.forEach(w => { if (w) warnMap[w.actionIndex] = w; });
        document.querySelectorAll('.ai-action-block').forEach((block, bi) => {
          const existingWarn = block.querySelector('.ai-warn');
          if (warnMap[bi] && !existingWarn) {
            const nameEl = block.querySelector('.ai-plan-task');
            if (nameEl) nameEl.insertAdjacentHTML('beforeend', ` <span class="ai-warn" role="note">${esc(t('aiConflict'))}</span>`);
          } else if (!warnMap[bi] && existingWarn) {
            existingWarn.remove();
          }
        });
      } catch (e) { /* conflict check is advisory */ }
    }
  }
});

// Đổi tên context trong manager — rename inline; label rỗng → revert về tên cũ.
function onContextRename(e) {
  const id = e.target.dataset.ctx;
  const v = e.target.value.trim();
  if (!id) return;
  const store = loadContextsStore();
  if (!v) {
    e.target.value = Contexts.contextLabel(store, id) || '';
    return;
  }
  if (Contexts.renameContext(store, id, v)) {
    saveContextsStore(store);
    trackEvent('context_rename');
  }
}

// Đổi Project/Milestone trong Task Detail — cập nhật task.projectId/milestoneId
// (field optional, đọc thiếu như null) + validate referential + undo + save.
function onTaskLinkSelectChange(e, act) {
  const store = loadProjectsStore();
  const tgt = getTaskDetailTarget();
  if (!tgt) return;
  const tk = tgt.tk;
  if (act === 'td-project') {
    const pid = e.target.value || null;
    const ok = ProjectsStore.validateTaskProjectLink(store, { projectId: pid, milestoneId: null });
    pushUndo();
    if (ok.projectId === null) {
      delete tk.projectId;
      delete tk.milestoneId;
    } else {
      tk.projectId = ok.projectId;
      delete tk.milestoneId;
    }
    saveTaskDetailState();
    // Re-render milestone select (enabled/disabled + options thuộc project mới).
    const mileSel = document.querySelector('[data-role="td-milestone-select"]');
    if (mileSel) {
      mileSel.disabled = !tk.projectId;
      mileSel.innerHTML = ProjectsUI.milestoneOptionsHTML(store, tk.projectId, null);
    }
    trackEvent('task_project_link');
    TaskFlowUI.toast(t('tdLinkSaved'), 'success');
  } else if (act === 'td-milestone') {
    const mid = e.target.value || null;
    const ok = ProjectsStore.validateTaskProjectLink(store, { projectId: tk.projectId || null, milestoneId: mid });
    pushUndo();
    if (ok.milestoneId === null) {
      delete tk.milestoneId;
    } else {
      tk.milestoneId = ok.milestoneId;
    }
    saveTaskDetailState();
    trackEvent('task_milestone_link');
    TaskFlowUI.toast(t('tdLinkSaved'), 'success');
  }
}

// Phase 5: double-click vào task row (ngoài vùng text đang sửa) mở Task Detail Drawer
const taskDetailDblClickListener = (e) => {
  if (e.target.closest('[contenteditable="true"]')) return;
  const row = e.target.closest('.task-row[data-week]');
  if (!row) return;
  openTaskDetail(+row.dataset.week, +row.dataset.day, +row.dataset.task);
};
document.addEventListener('dblclick', taskDetailDblClickListener);

// Phase 16 (perf): search quét 12 tháng localStorage mỗi keystroke — debounce 200ms.
let searchDebounceTimer = null;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'searchInput') {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => runLazyModule('js/search.min.js', () => window.TaskFlowSearch.renderSearchResults(t.value)), 200);
  }
});

// Phase 5: bắt đầu phiên sửa text → snapshot trước để undo về đúng trạng thái trước khi gõ
document.addEventListener('focusin', (e) => {
  if (e.target.closest('[contenteditable="true"]')) pushUndo();
});

// Phase 16 (perf): gõ text không serialize toàn bộ state mỗi keystroke — debounce 350ms.
let saveDebounceTimer = null;
let saveYearDebounceTimer = null;
function saveSoon() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(save, 350);
}
function saveYearSoon() {
  clearTimeout(saveYearDebounceTimer);
  saveYearDebounceTimer = setTimeout(saveYear, 350);
}
let inboxSaveTimer = null;
function saveInboxSoon() {
  clearTimeout(inboxSaveTimer);
  inboxSaveTimer = setTimeout(() => saveInbox(inbox), 350);
}
let tdSaveTimer = null;
function saveTaskDetailStateSoon() {
  clearTimeout(tdSaveTimer);
  tdSaveTimer = setTimeout(saveTaskDetailState, 350);
}
function flushPendingSaves() {
  if (saveDebounceTimer) { clearTimeout(saveDebounceTimer); saveDebounceTimer = null; save(); }
  if (saveYearDebounceTimer) { clearTimeout(saveYearDebounceTimer); saveYearDebounceTimer = null; saveYear(); }
  if (inboxSaveTimer) { clearTimeout(inboxSaveTimer); inboxSaveTimer = null; saveInbox(inbox); }
  if (tdSaveTimer) { clearTimeout(tdSaveTimer); tdSaveTimer = null; saveTaskDetailState(); }
}

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.monthlyReviewField) {
    const updated = updateMonthlyReviewField(state, t.dataset.monthlyReviewField, t.value, new Date().toISOString());
    if (updated) {
      setMonthlyReviewStatus(window.TaskFlowI18N.t('monthlyReviewSaving'));
      saveSoon();
      scheduleMonthlyReviewSaved(() => setMonthlyReviewStatus(window.TaskFlowI18N.t('monthlyReviewSaved')), 450);
    }
  } else if (t.dataset.weekReviewField) {
    const weekIndex = Number(t.dataset.weekIndex);
    const priorityIndex = t.dataset.priorityIndex === undefined ? null : Number(t.dataset.priorityIndex);
    const updated = updateReviewField(
      state,
      weekIndex,
      t.dataset.weekReviewField,
      t.value,
      priorityIndex,
      new Date().toISOString()
    );
    if (updated) {
      setWeeklyReviewSaveStatus(window.TaskFlowI18N.t('weeklyReviewSaving'));
      saveSoon();
      scheduleSavedStatus(() => setWeeklyReviewSaveStatus(window.TaskFlowI18N.t('weeklyReviewSaved')), 450);
    }
  } else if (t.dataset.reflectQ) {
    const [scope, i] = t.dataset.reflectQ.split('-');
    saveRefQuestion(scope, +i, t.innerText);
  } else if (t.dataset.reflect) {
    const [scope, i] = t.dataset.reflect.split('-');
    if (scope.startsWith('yq')) {
      yearState.reflections['q' + scope[2]][+i] = t.innerText;
      saveYearSoon();
    } else if (scope === 'yr') {
      yearState.reflections.year[+i] = t.innerText;
      saveYearSoon();
    } else {
      if (scope === 'ov') state.reflections.overview[+i] = t.innerText;
      else state.reflections.weeks[+scope.replace('w', '') - 1][+i] = t.innerText;
      saveSoon();
    }
  } else if (t.dataset.ynote) {
    yearState.monthNotes[+t.dataset.ynote] = t.innerText;
    saveYearSoon();
  } else if (t.dataset.note) {
    const [wn, di] = t.dataset.note.split('-');
    state.weeks[+wn - 1].days[+di].note = t.innerText;
    saveSoon();
  } else if (t.dataset.role === 'task-text') {
    state.weeks[+t.dataset.week - 1].days[+t.dataset.day].tasks[+t.dataset.task].text = t.innerText;
    saveSoon();
  } else if (t.dataset.role === 'inbox-text') {
    const tk = inbox[+t.dataset.task];
    if (tk) { tk.text = t.innerText; saveInboxSoon(); }
  } else if (t.dataset.role === 'td-text') {
    // Phase 5: text trong Task Detail Drawer — lưu trực tiếp (blur cũng cập nhật row qua bindTaskDetailEvents)
    const g = getTaskDetailTarget();
    if (g) { g.tk.text = t.innerText; saveTaskDetailStateSoon(); }
  } else if (t.dataset.reflectField) {
    // Daily Reflection (P1): autosave debounce cho quick fields + deep modal
    window.TaskFlowReflection.onFieldInput(t);
  } else if (t.dataset.pillarFocus) {
    // Monthly Focus (P2): lưu focus của trụ cột (debounce saveSoon như các ô text khác)
    window.TaskFlowPillars.setFocus(state, t.dataset.pillarFocus, t.value);
    saveSoon();
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
  if (e.key === 'Escape') {
    // Floating Chat: Escape đóng popover (không xoá hội thoại), trả focus về FAB.
    if (closeChatPanel()) return;
    // P0.2D: Escape trong ô text của draft task trống → xoá draft (không undo/toast)
    const edt = document.activeElement;
    if (edt && edt.dataset && edt.dataset.freshBlank === '1' &&
        (edt.dataset.role === 'task-text' || edt.dataset.role === 'inbox-text')) {
      const dt = taskAtText(edt);
      if (dt && window.TaskFlowDataMigrations.isTaskTrulyEmpty(dt.tk)) {
        e.preventDefault();
        removeTrulyEmptyDraft(dt);
        return;
      }
    }
    // Phase 4: Escape đóng menu task ⋯ đang mở + trả focus về nút ⋯ (APG menu button)
    const openRows = document.querySelectorAll('.task-row.menu-open');
    if (openRows.length) {
      const activeRow = Array.from(openRows).find((r) => r.contains(document.activeElement)) || openRows[0];
      openRows.forEach((r) => {
        r.classList.remove('menu-open', 'menu-up');
        const b = r.querySelector('[data-action="task-menu"]');
        if (b) b.setAttribute('aria-expanded', 'false');
        const m = r.querySelector('.task-menu');
        if (m) m.hidden = true;
      });
      const trigger = activeRow.querySelector('[data-action="task-menu"]');
      if (trigger && typeof trigger.focus === 'function') trigger.focus();
      return;
    }
  }
  // Phase 17: điều hướng kết quả tìm kiếm bằng bàn phím (↑/↓ chọn, Enter chạy, Esc đóng)
  const searchModalEl = document.getElementById('searchModal');
  const searchOpen = searchModalEl && !searchModalEl.hidden && searchModalEl.contains(document.activeElement);
  if (searchOpen && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const hitBtns = Array.from(searchModalEl.querySelectorAll('.search-hit'));
    if (hitBtns.length) {
      e.preventDefault();
      let i = hitBtns.indexOf(document.activeElement);
      i = e.key === 'ArrowDown' ? (i + 1) % hitBtns.length : (i - 1 + hitBtns.length) % hitBtns.length;
      hitBtns[i].focus();
      hitBtns[i].scrollIntoView({ block: 'nearest' });
    }
    return;
  }
  if (searchOpen && e.key === 'Enter' && document.activeElement === searchModalEl.querySelector('#searchInput')) {
    const firstHit = searchModalEl.querySelector('.search-hit');
    if (firstHit) { e.preventDefault(); firstHit.click(); return; }
  }
  // Task menu ⋯ mở: ArrowUp/Down di chuyển focus giữa các menuitem (roving tabindex style).
  // Chỉ kích hoạt khi focus đang TRONG menu (hoặc trên nút ⋯ khi mở bằng chuột) — không nuốt
  // phím Arrow khi focus ở task text/ô nhập khác, và không chặn tổ hợp Ctrl/Shift+Arrow.
  const menuRow = document.querySelector('.task-row.menu-open');
  const menuFocused = menuRow && (menuRow.contains(document.activeElement)
    || (document.activeElement && document.activeElement.matches('[data-action="task-menu"]')));
  if (menuFocused && !e.ctrlKey && !e.metaKey && !e.altKey
      && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End')) {
    const items = Array.from(menuRow.querySelectorAll('.task-menu [role="menuitem"]')).filter((it) => !it.hidden);
    if (items.length) {
      e.preventDefault();
      let i = items.indexOf(document.activeElement);
      if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = items.length - 1;
      else i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      if (i < 0) i = 0;
      items[i].focus();
      return;
    }
  }
  if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
  // P2: More sheet đang mở → chặn phím tắt chuyển view/quick-add (sheet đang chiếm màn hình)
  const sheetEl = document.getElementById('moreSheet');
  if (sheetEl && !sheetEl.hidden && !inField) {
    if ((e.key >= '1' && e.key <= '5') || e.key === '/' || k === 'q') return;
  }
  // role="button" + data-action (vd dòng task Upcoming) — Enter/Space kích hoạt được từ bàn phím.
  // KHÔNG chặn khi đang gõ trong contenteditable (Enter/Space phải là ký tự, không phải click).
  const rb = e.target.closest('[data-action][role="button"]');
  if (rb && !e.target.closest('[contenteditable="true"]') && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    rb.click();
    return;
  }
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
    // Phase 4: phím tắt Quick Add (q) — thêm nhanh không cần đổi view
    if (k === 'q') {
      e.preventDefault();
      runLazyModule('js/quick-add.min.js', () => window.TaskFlowQuickAdd.openQuickAdd());
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
  const ms = monthlyStats(state);
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
  runLazyModule('js/digest.min.js', () => window.TaskFlowDigest.updateDigestCache());
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
    if (m) m.style.height = Math.max(dayAggregate(state, d), 4) + '%';
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
    // P0.2C guard: DOM có thể còn row của draft đã splice (render hoãn sau click) — bỏ qua
    const tk = d.tasks[+b.dataset.task];
    if (tk) b.setAttribute('aria-checked', tk.done);
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
    if (cb) {
      const tk = d.tasks[+cb.dataset.task];
      if (tk) cell.classList.toggle('done', tk.done);
    }
  });
}

/* ============================ Task lặp thông minh (carry-over) ============================ */

// Logic thuần (uid cố định, lên kế hoạch carry, đồng bộ done) nằm ở module
// js/plan-carry.js (window.PlanCarry) để unit-test trực tiếp — app.js chỉ ủy quyền
// và áp kết quả vào state + save(). Các wrapper có fallback nội tuyến phòng khi module không tải.
function newTaskUid() {
  return window.PlanCarry ? window.PlanCarry.newTaskUid() : 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function ensureTaskUid(tk) {
  if (window.PlanCarry) return window.PlanCarry.ensureTaskUid(tk);
  if (tk && typeof tk.uid !== 'string') tk.uid = newTaskUid();
  return tk;
}

// Task lặp (repeat) bị lỡ ngày sẽ được tự động "dồn" vào danh sách hôm nay.
// Chạy khi khởi động app, đổi ngày, đổi tháng, đổi tài khoản.
function carryOverRepeatTasks() {
  if (!window.PlanCarry || !window.PlanCarry.planCarry) return false;
  // Safety net: data rất cũ chưa có uid → gán trước để planCarry liên kết bền vững
  // (thường đã có sẵn từ migration loadState — bước này chỉ phòng hờ, idempotent)
  state.weeks.forEach((w) => (w.days || []).forEach((d) => (d.tasks || []).forEach((tk) => ensureTaskUid(tk))));
  // planCarry tự định vị ô hôm nay (todayW/todayD) — dùng ĐÚNG cơ chế đó để push,
  // tránh lệch giữa hai cách tính khác nhau.
  const plan = window.PlanCarry.planCarry(state.weeks, PLAN_START, new Date());
  if (!plan.copies.length) return false;
  const target = state.weeks[plan.todayW] && state.weeks[plan.todayW].days[plan.todayD];
  if (!target) return false;
  plan.copies.forEach((c) => {
    c.source.carried = true;
    target.tasks.push(c.copy);
  });
  save();
  return true;
}
function carriedDateLabel(cf) {
  if (!cf) return '';
  if (cf.date) return cf.date; // bản dồn mới: lưu sẵn ngày nguồn
  try { // bản dồn cũ (trước nâng cấp uid): tra theo chỉ số
    const w = state.weeks[cf.w];
    const d = w && w.days[cf.d];
    if (d && d.date) return d.date + '/' + (d.yy || '');
  } catch (e) { /* ẩn */ }
  return '';
}
// Đồng bộ trạng thái done giữa task gốc (lịch lặp) và bản dồn (carry) sang hôm nay.
// Tra theo uid nên KHÔNG lệch khi task phía trước bị xoá/chèn; có fallback chỉ số cho bản dồn cũ.
function syncCarriedDone(wi, di, ti, t) {
  if (!window.PlanCarry || !window.PlanCarry.syncCarriedDone) return;
  window.PlanCarry.syncCarriedDone(state.weeks, wi, di, ti, t);
}

/* ============================ Đồng bộ thời gian thực ============================ */


// Khi mở view Tuần, tự cuộn xuống ngày hôm nay (nếu nằm trong tuần đang xem)
// để người dùng không phải kéo tay. Chỉ cuộn khi panel chưa nằm trong viewport
// (desktop 3 cột thường đã thấy hôm nay → không jump; sync re-render cũng
// không bị cuộn đi nếu panel vẫn đang hiển thị).
function scrollWeekToToday() {
  const panel = document.querySelector('#view-week .week-day-panel.today');
  if (!panel) return; // hôm nay không thuộc tuần đang xem → giữ nguyên vị trí
  // Trì hoãn để layout ổn định sau renderWeek, rồi mới kiểm tra vị trí thật
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const r = panel.getBoundingClientRect();
      if (r.top >= 0 && r.bottom <= window.innerHeight) return; // đã thấy hôm nay
      panel.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    });
  });
}

let lastDayKey = '';
let lastRealWeek = null;
let viewedMonth = null;

function refreshToday() {
  runLazyModule('js/digest.min.js', () => window.TaskFlowDigest.updateDigestCache());
  const now = new Date();
  if (viewedMonth !== null) {
    if (viewedMonth === now.getMonth() && PLAN_YEAR === now.getFullYear()) {
      viewedMonth = null;
      initPlan(now);
      state = bootState();
      updateBrand(PLAN_YEAR, PLAN_MONTH);
      buildNav();
      setView(state.view, state.currentWeek);
    }
    return;
  }
  const prevKey = monthKey(PLAN_YEAR, PLAN_MONTH);
  initPlan(now);
  const ti = nowInfo(PLAN_START, NUM_DAYS, PLAN_YEAR, PLAN_MONTH);
  const jump = state.view === 'week' && ti.inRange && ti.week !== state.currentWeek && state.currentWeek === lastRealWeek;
  lastRealWeek = ti.inRange ? ti.week : null;
  if (monthKey(PLAN_YEAR, PLAN_MONTH) !== prevKey) {
    state = bootState();
    updateBrand(PLAN_YEAR, PLAN_MONTH);
    buildNav();
    setView(state.view, state.currentWeek);
  } else {
    if (jump) state.currentWeek = ti.week;
    prepareTodayState();
    if (state.view === 'today') renderToday();
    else if (state.view === 'week') renderWeek();
    else if (state.view === 'day') renderDay();
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
  if (!document.hidden) { syncNow(); pomoSync(); gcalVisibilityRefresh(); }
});
window.addEventListener('focus', () => { syncNow(); pomoSync(); gcalVisibilityRefresh(); });

/* ============================ Đồng bộ đám mây ============================ */

// syncStatusText/updateSyncStatus/syncFormValues/syncErrorText được tách sang
// js/syncui.js (window.TaskFlowSyncUI) — giữ signature 100%.
if (!window.TaskFlowSyncUI) throw new Error('TaskFlowSyncUI missing — js/syncui.js failed to load');
const { syncStatusText, updateSyncStatus, syncFormValues, syncErrorText } = window.TaskFlowSyncUI;

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
  const mc = document.getElementById('monthCarryModal');
  if (mc && !mc.hidden && e.target === mc) closeMonthCarry();
  const rh = document.getElementById('reportHistoryModal');
  if (rh && !rh.hidden && e.target === rh) closeUnifiedReportHistory();
  const wr = document.getElementById('weekReportModal');
  if (wr && !wr.hidden && e.target === wr) closeWeekReportModal();
  const yr = document.getElementById('yearReportModal');
  if (yr && !yr.hidden && e.target === yr) runLazyModule('js/year-report.min.js', () => window.TaskFlowYearReport.closeYearReportModal());
  const s = document.getElementById('searchModal');
  if (s && !s.hidden && e.target === s) runLazyModule('js/search.min.js', () => window.TaskFlowSearch.closeSearchModal());
  const qa = document.getElementById('quickAddModal');
  if (qa && !qa.hidden && e.target === qa) runLazyModule('js/quick-add.min.js', () => window.TaskFlowQuickAdd.closeQuickAdd());
  const t = document.getElementById('templateModal');
  if (t && !t.hidden && e.target === t) closeTemplateModal();
  const p = document.getElementById('profileModal');
  if (p && !p.hidden && e.target === p) closeProfileModal();
  const bm = document.getElementById('backupModal');
  if (bm && !bm.hidden && e.target === bm) runLazyModule('js/backup.min.js', () => window.TaskFlowBackup.closeBackupModal());
  const help = document.getElementById('helpModal');
  if (help && !help.hidden && e.target === help) TaskFlowUI.closeDialog('helpModal');
  const widget = document.getElementById('widgetSettingsModal');
  if (widget && !widget.hidden && e.target === widget) closeWidgetSettingsModal();
  const focus = document.getElementById('focusOverlay');
  if (focus && !focus.hidden && e.target === focus) closeFocusMode();
});

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
  const cur = monthKey(PLAN_YEAR, PLAN_MONTH);
  const yk = yearKey();
  const monthHit = keys.indexOf(cur) >= 0;
  const yearHit = keys.indexOf(yk) >= 0;
  if (yearHit) { yearState = bootYearState(); invalidateYearCache(); }
  if (monthHit) { state = bootState(); }
  if (monthHit || yearHit) {
    // Dữ liệu remote vừa nạp có thể chứa task lặp quá hạn → chuẩn bị ô hôm nay trước khi render
    prepareTodayState();
    setView(state.view, state.currentWeek);
    updateNav();
  }
  if (keys.indexOf('planner-xp') >= 0) { loadXP(); renderXP(); }
  // Áp dụng ngôn ngữ/chủ đề sau khi đã nạp lại state (an toàn với save() bên trong setLang)
  if (keys.indexOf('planner-lang') >= 0) {
    const l = localStorage.getItem('planner-lang');
    if (l && l !== getLang()) setLang(l);
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
    if (localStorage.getItem(monthKey(PLAN_YEAR, PLAN_MONTH))) return true;
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

const ti0 = nowInfo(PLAN_START, NUM_DAYS, PLAN_YEAR, PLAN_MONTH);
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
    updateBrand(PLAN_YEAR, PLAN_MONTH);
  }
  if (dl.view) state.view = dl.view;
  if (dl.view === 'week' && dl.week !== null && dl.week <= NUM_WEEKS) state.currentWeek = dl.week;
  const hasCapture = !!(dl.text || dl.title || dl.url);
  if (dl.quick || hasCapture) window.__quickAddOnBoot = true;
  // V1.5 Quick Capture: share target / quick URL → payload vào Inbox (preview trước Save).
  // Nếu URL có sẵn view=.. thì tôn trọng; nếu không thì boot thẳng vào Inbox để Quick Add
  // có target {scope:'inbox'} — capture không rơi vào Today.
  if (hasCapture) {
    window.__quickAddCapture = { text: dl.text || '', title: dl.title || '', url: dl.url || '' };
    if (!dl.view) state.view = 'inbox';
  }
  if (dl.view === 'day' && dl.week !== null && dl.week >= 1 && dl.week <= NUM_WEEKS) {
    state.dayWeek = dl.week;
    if (dl.day !== undefined && dl.day !== null && dl.day >= 0 && dl.day <= 6) state.dayDay = dl.day;
  }
  if (dl.view === 'calendar' && Array.isArray(dl.tags)) calendarTagFilters = dl.tags;
}

/* ---------- V1.6A Google Calendar — consume ?cal=ok / ?cal=error=.. ---------- */
if (window.TaskFlowGCal) {
  const calRes = window.TaskFlowGCal.consumeCalParam();
  if (calRes) {
    if (calRes === 'ok') {
      setTimeout(() => TaskFlowUI.toast(t('gcalConnectedOk'), 'success'), 800);
      trackEvent('gcal_connected');
    } else {
      setTimeout(() => TaskFlowUI.toast(t('gcalConnectFailed'), 'error'), 800);
      trackEvent('gcal_connect_failed');
    }
  }
}

// P0: reconcile scroll-lock state trước khi render view đầu tiên + mỗi lần
// pageshow (BFCache restore giữ nguyên DOM → body class sót lại nếu drawer
// đang mở khi rời trang). Idempotent; không ảnh hưởng khi drawer/sheet mở thật.
reconcileOverlayScrollLocks();
window.addEventListener('pageshow', reconcileOverlayScrollLocks);

setTheme(THEME);
applyDark(DARK);
applyStaticI18N();
_updateAdaptiveToggleUI();
applySidebarCollapse();
updateBrand(PLAN_YEAR, PLAN_MONTH);
renderClock();
buildNav();
updateUndoButtons();
loadMood();
loadReflections();
loadXP();
prepareTodayState();
renderXP();
setView(state.view, state.currentWeek);
setTimeout(() => runLazyModule('js/digest.min.js', () => window.TaskFlowDigest.updateDigestCache()), 2000);
// Manifest shortcut "Thêm công việc" (?quick=1) → mở Quick Add ngay sau khi view đầu render.
// V1.5 Quick Capture: nếu có payload share/quick-url, prefill input đã sanitize (preview trước Save).
if (window.__quickAddOnBoot) {
  const capture = window.__quickAddCapture || null;
  delete window.__quickAddOnBoot;
  delete window.__quickAddCapture;
  setTimeout(() => runLazyModule('js/quick-add.min.js', () => {
    window.TaskFlowQuickAdd.openQuickAdd();
    if (capture && window.TaskFlowQuickCapture) {
      const text = window.TaskFlowQuickCapture.composeTaskText(capture);
      const inp = document.getElementById('quickAddInput');
      if (inp && text) inp.value = text;
      trackEvent('quick_capture_prefill');
    }
  }), 350);
}


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

// FAB kéo-thả + auto-tuck được tách sang js/fab.js (window.TaskFlowFab) —
// giữ signature: initFabDrags() boot call không đổi; t()/toast access qua
// globalThis.TaskFlowI18N / TaskFlowUI trong module.
if (!window.TaskFlowFab) throw new Error('TaskFlowFab missing — js/fab.js failed to load');
const { loadFabPos, saveFabPos, clearFabPos, clampFabPos, initFabDrag, initFabDrags, fabTuckAllowed, nearestTuckEdge, tuckOffset, initFabTuck } = window.TaskFlowFab;
/* ---------- Khởi động phụ trợ (PWA, Analytics, Nhắc việc, Import) ---------- */

initAnalytics();
registerSW();
initFabDrags();
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
