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

// i18n core (I18N dictionary, LANG state, t(), label helpers, applyStaticI18N) được tách
// sang js/i18n.js (window.TaskFlowI18N). Giữ alias để call-sites không đổi.
if (!window.TaskFlowI18N) throw new Error('TaskFlowI18N missing — js/i18n.js failed to load');
const { I18N, t, monthLabel, dayLabel, fmtDeadline, dateLocale, getLang, setLangCore, applyStaticI18N } = window.TaskFlowI18N;
// nowInfo/renderClock tách sang js/clock.js (window.TaskFlowClock) — destructure
// phải TRƯỚC top-level `state = bootState()` (gọi loadState → nowInfo).
if (!window.TaskFlowClock) throw new Error('TaskFlowClock missing — js/clock.js failed to load');
const { nowInfo, renderClock } = window.TaskFlowClock;

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

function prefersReducedMotion(matchMedia = window.matchMedia) {
  return Boolean(matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

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
  const ti = nowInfo(PLAN_START, NUM_DAYS);
  if (!ti.inRange || !window.PlanMath || !window.PlanMath.planRecurrence) return; // hôm nay ngoài kỳ kế hoạch → không có chỗ sinh
  const todayDay = state.weeks[ti.week - 1] && state.weeks[ti.week - 1].days[ti.dayInWeek];
  if (!todayDay) return;
  const plan = window.PlanMath.planRecurrence(state.weeks, ti.dayIdx);
  plan.mark.forEach((t) => { t._recurred = true; });
  plan.copies.forEach((c) => { c.uid = newTaskUid(); todayDay.tasks.push(c); });
}

/* ============================ Xuất / Nhập dữ liệu ============================ */

// export helpers (downloadFile, collectAllData, exportJSON) được tách sang
// js/export.js (window.TaskFlowExport). collectAllData/exportJSON nhận LEGACY_KEY
// tham số — downloadFile giữ signature. exportCSV/legacyCSVRows ở lại app.js.
if (!window.TaskFlowExport) throw new Error('TaskFlowExport missing — js/export.js failed to load');
const { downloadFile, collectAllData, exportJSON } = window.TaskFlowExport;

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

// Xuất lịch .ics (Google Calendar / Apple Calendar / Outlook) — toàn bộ 12 tháng của năm.
// Task có nhắc giờ (remind) → sự kiện có giờ cụ thể; còn lại là sự kiện cả ngày.
function icsEscape(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function icsDayFromDay(d) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(d.date || ''));
  if (!m) return null;
  return new Date(2000 + (d.yy || 0), +m[2] - 1, +m[1]);
}
function exportICS() {
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()) + 'T' + p2(now.getHours()) + p2(now.getMinutes()) + p2(now.getSeconds()) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TaskFlow-Todoist//TaskFlow//VI',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:TaskFlow ' + PLAN_YEAR,
  ];
  const freqMap = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' };
  let uid = 1;
  for (let m = 0; m < 12; m++) {
    const s = loadMonthStateOrCreate(PLAN_YEAR, m);
    s.weeks.forEach((w, wi) => {
      (w.days || []).forEach((d, di) => {
        const dt = icsDayFromDay(d);
        if (!dt) return;
        const date = dt.getFullYear() + p2(dt.getMonth() + 1) + p2(dt.getDate());
        (d.tasks || []).forEach((tk) => {
          if (!tk.text || !tk.text.trim()) return;
          const timed = tk.remind && tk.remind.enabled && tk.remind.time;
          lines.push('BEGIN:VEVENT');
          lines.push('UID:taskflow-' + PLAN_YEAR + '-' + (m + 1) + '-' + (wi + 1) + '-' + (di + 1) + '-' + uid++ + '@taskflow-todoist');
          lines.push('DTSTAMP:' + stamp);
          lines.push('SUMMARY:' + icsEscape(tk.text));
          if (timed) lines.push('DTSTART:' + date + 'T' + String(tk.remind.time).replace(':', '') + '00');
          else lines.push('DTSTART;VALUE=DATE:' + date);
          if (tk.repeat && tk.repeat.freq && freqMap[tk.repeat.freq]) lines.push('RRULE:FREQ=' + freqMap[tk.repeat.freq]);
          // Lưu ý: không ghi STATUS:COMPLETED — RFC 5545 chỉ cho phép trạng thái này trên
          // VTODO/VJOURNAL, không hợp lệ trên VEVENT (Google/Apple có thể bỏ qua hoặc lỗi).
          lines.push('END:VEVENT');
        });
      });
    });
  }
  lines.push('END:VCALENDAR');
  downloadFile('taskflow-calendar-' + PLAN_YEAR + '.ics', lines.join('\r\n') + '\r\n', 'text/calendar;charset=utf-8');
  trackEvent('export_ics');
}

// Bản cũ (dự phòng nếu PlanStats chưa tải được) — giữ nguyên hành vi để không hồi quy.
function legacyCSVRows() {
  const rows = [];
  const push = (row) => rows.push(csvRow(row));

  push(['TaskFlow Export', new Date().toISOString(), t('csvNote')]);

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
      try { rotateBackup(collectAllData(LEGACY_KEY)); } catch (e) { /* ẩn */ }
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
          if (w && d) d.tasks.push({ uid: newTaskUid(), kind: tk.kind, done: tk.done, text: tk.text, tags: [], remind: { enabled: false, time: '20:00' } });
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
  const ti = nowInfo(PLAN_START, NUM_DAYS);
  return {
    view: 'today',
    currentWeek: ti.inRange ? ti.week : 1,
    dayWeek: ti.inRange ? ti.week : 1,
    dayDay: ti.inRange ? ti.dayInWeek : 0,
    goalTab: 'priority',
    monthKey: monthKey(PLAN_YEAR, PLAN_MONTH),
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
    let raw = localStorage.getItem(monthKey(PLAN_YEAR, PLAN_MONTH));
    // Chỉ dùng dữ liệu legacy cho khách vãng lai; tài khoản đã đăng nhập không kế thừa key cũ
    if (!raw && monthKey(PLAN_YEAR, PLAN_MONTH) === 'planner-2026-1' && !hasAccount()) raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.monthlyGoals) || !Array.isArray(s.habits) || !Array.isArray(s.weeks)) return null;
    if (s.monthKey !== monthKey(PLAN_YEAR, PLAN_MONTH) || s.weeks.length !== NUM_WEEKS) return null;
    if (!s.reflections || !Array.isArray(s.reflections.weeks) || s.reflections.weeks.length !== NUM_WEEKS) s.reflections = defaultState().reflections;
    if (!s.goalTab) s.goalTab = 'priority';
    if (typeof s.currentWeek !== 'number' || s.currentWeek < 1 || s.currentWeek > NUM_WEEKS) s.currentWeek = 1;
    // Migration: vị trí Xem ngày (tuần + ngày trong tuần) — mặc định về hôm nay nếu hợp lệ
    const tiMig = nowInfo(PLAN_START, NUM_DAYS);
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
          if (!tk.remind || typeof tk.remind !== 'object') tk.remind = { enabled: false, time: '20:00' };
          if (typeof tk.repeat === 'undefined') tk.repeat = null;
          if (typeof tk.uid !== 'string') { tk.uid = newTaskUid(); tasksDirty = true; }
        });
      });
    });
    // Lưu uid mới sinh ngay (không gọi save() — state global đang trong TDZ lúc load khởi động)
    if (tasksDirty) {
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
  const ti = nowInfo(PLAN_START, NUM_DAYS);
  return {
    view: 'today',
    currentWeek: ti.inRange ? ti.week : 1,
    dayWeek: ti.inRange ? ti.week : 1,
    dayDay: ti.inRange ? ti.dayInWeek : 0,
    goalTab: 'priority',
    monthKey: monthKey(PLAN_YEAR, PLAN_MONTH),
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
              { uid: newTaskUid(), kind: 'priority', done: false, text: '', tags: [], remind: { enabled: false, time: '20:00' } },
              { uid: newTaskUid(), kind: 'priority', done: false, text: '', tags: [], remind: { enabled: false, time: '20:00' } },
              { uid: newTaskUid(), kind: 'regular', done: false, text: '', tags: [], remind: { enabled: false, time: '20:00' } },
              { uid: newTaskUid(), kind: 'regular', done: false, text: '', tags: [], remind: { enabled: false, time: '20:00' } },
              { uid: newTaskUid(), kind: 'regular', done: false, text: '', tags: [], remind: { enabled: false, time: '20:00' } },
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
  carryOverRepeatTasks();
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

function save() {
  try { localStorage.setItem(monthKey(PLAN_YEAR, PLAN_MONTH), JSON.stringify(state)); } catch (e) { /* ẩn */ }
  if (window.Sync) window.Sync.push(monthKey(PLAN_YEAR, PLAN_MONTH));
  maybeAutoBackup();
}

/* ============================ XP & Cấp độ (Gamification) ============================ */
// XP lưu ở key riêng 'planner-xp' (đồng bộ đám mây như mọi key planner-*) nên
// KHÔNG bị reset khi đổi tháng/năm — điểm tích luỹ xuyên suốt.

let xpTotal = 0;

function loadXP() {
  try {
    const r = JSON.parse(localStorage.getItem('planner-xp'));
    xpTotal = r && typeof r.xp === 'number' && r.xp >= 0 ? r.xp : 0;
  } catch (e) { xpTotal = 0; }
}
function saveXP() {
  try { localStorage.setItem('planner-xp', JSON.stringify({ xp: xpTotal, updatedAt: Date.now() })); } catch (e) { /* ẩn */ }
  if (window.Sync) window.Sync.push('planner-xp');
}
// Cấp độ: cần 100 XP lên cấp 2, mỗi cấp sau tăng thêm 50 XP (100 → 150 → 200 → …)
function xpLevelInfo(xp) {
  let level = 1, need = 100, acc = 0;
  while (xp >= acc + need) { acc += need; level++; need += 50; }
  return { level, cur: xp - acc, need, pct: Math.min(100, Math.max(0, Math.round(((xp - acc) / need) * 100))) };
}
function addXP(n) {
  if (!(n > 0)) return;
  const before = xpLevelInfo(xpTotal);
  xpTotal += n;
  saveXP();
  renderXP();
  const after = xpLevelInfo(xpTotal);
  if (after.level > before.level) {
    confettiBurst();
    TaskFlowUI.toast(t('levelUp', { lv: after.level }), 'success');
  }
}
function removeXP(n) {
  if (!(n > 0)) return;
  xpTotal = Math.max(0, xpTotal - n);
  saveXP();
  renderXP();
}
function renderXP() {
  const info = xpLevelInfo(xpTotal);
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const pill = document.getElementById('appXp');
  if (pill) pill.hidden = false;
  const card = document.getElementById('xpCard');
  if (card) card.hidden = false;
  const lv = t('xpLevel', { lv: info.level });
  const bar = info.cur + ' / ' + info.need + ' XP';
  set('appXpLevel', lv);
  set('appXpNum', bar);
  set('xpCardLevel', lv);
  set('xpCardSub', bar);
  const f1 = document.getElementById('appXpFill');
  if (f1) f1.style.width = info.pct + '%';
  const f2 = document.getElementById('xpCardFill');
  if (f2) f2.style.width = info.pct + '%';
}

/* ============================ Tính toán ============================ */

function habitPct(h) {
  const days = Array.isArray(h.days) ? h.days : [];
  return window.PlanMath ? window.PlanMath.habitPctFrom(days, habitDaysElapsed(PLAN_YEAR, PLAN_MONTH, NUM_DAYS), h.target) : 0;
}
function dayPct(day) {
  const tasks = Array.isArray(day.tasks) ? day.tasks : [];
  return tasks.length ? Math.round((tasks.filter((task) => task.done).length / tasks.length) * 100) : 0;
}
// goal stats core (weekStats, monthlyStats) được tách sang js/stats.js
// (window.TaskFlowStats). Giữ alias để call-sites không đổi.
if (!window.TaskFlowStats) throw new Error('TaskFlowStats missing — js/stats.js failed to load');
const { weekStats, monthlyStats } = window.TaskFlowStats;

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
  const curWeek = nowInfo(PLAN_START, NUM_DAYS).week;
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

function weekHabitPct(wk) {
  if (wk < 1) return null;
  const first = new Date(PLAN_YEAR, PLAN_MONTH, 1);
  const dow0 = (first.getDay() + 6) % 7;
  let sum = 0, n = 0;
  for (let d = 0; d < NUM_DAYS; d++) {
    if (Math.floor((dow0 + d) / 7) + 1 === wk) { sum += dayAggregate(state, d); n++; }
  }
  return n ? Math.round(sum / n) : null;
}

function weekCompareHTML() {
  const ti = nowInfo(PLAN_START, NUM_DAYS);
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

// psStart/shortMonth được tách sang js/planmini.js (window.TaskFlowPlanMini) —
// giữ signature 100%; getLang + MONTH_NAMES access qua TaskFlowI18N trong module.
if (!window.TaskFlowPlanMini) throw new Error('TaskFlowPlanMini missing — js/planmini.js failed to load');
const { psStart, shortMonth } = window.TaskFlowPlanMini;

// Hero: thói quen có chuỗi 🔥 dài nhất + thanh tiến tới kỷ lục 🏆
function heatHeroHTML() {
  let top = null;
  state.habits.forEach((h) => {
    const s = habitStreakCached(h, PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
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
  const anchor = streakAnchorDay(PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
  const anchorDate = new Date(PLAN_YEAR, PLAN_MONTH, anchor + 1);
  const start = new Date(anchorDate.getTime() - 89 * 86400000);
  const monday = new Date(start);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const dayNames = getLang() === 'vi' ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
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
  const anchor = streakAnchorDay(PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
  const cells = [];
  for (let back = 13; back >= 0; back--) {
    const dt = new Date(PLAN_YEAR, PLAN_MONTH, anchor + 1 - back);
    const y = dt.getFullYear(), m = dt.getMonth(), d = dt.getDate() - 1;
    const days = habitDaysAt(y, m, h, PLAN_YEAR, PLAN_MONTH);
    cells.push(`<i class="hm-mini-cell${days && days[d] ? ' on' : ''}"></i>`);
  }
  return cells.join('');
}

function habitHeatCardHTML() {
  clearStreakCache();
  const streaks = state.habits.map((h) => {
    const s = habitStreakCached(h, PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
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
    const s = habitStreakCached(h, PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
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
      g.font = "700 36px 'Nunito',sans-serif";
      g.fillText('🐥 TaskFlow', W / 2, 96);

      g.fillStyle = '#8A7A6B';
      g.font = "700 42px 'Nunito',sans-serif";
      g.fillText(name, W / 2, 158);

      g.fillStyle = '#C24E28';
      g.font = "800 260px 'Nunito',sans-serif";
      g.fillText(String(cur), W / 2, 400);

      g.fillStyle = '#4A403A';
      g.font = "700 46px 'Nunito',sans-serif";
      g.fillText(t('hmHeroDays'), W / 2, 468);

      g.font = "700 34px 'Nunito',sans-serif";
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
      g.font = "800 38px 'Nunito',sans-serif";
      g.fillText('🏆 ' + best + ' · ' + t('hmHeroRecLbl'), W / 2, 636);

      // Heatmap: 16 tuần × 7 ngày
      const anchor = streakAnchorDay(PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
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
      g.font = "700 30px 'Nunito',sans-serif";
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
          title: 'TaskFlow 🐥',
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
  const ms = monthlyStats(state);
  const pcts = state.habits.map((h) => habitPct(h));
  const habitAvg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  let top = null, rec = null;
  state.habits.forEach((h) => {
    const s = habitStreakCached(h, PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
    if (!top || s.cur > top.s.cur) top = { h, s };
    if (!rec || s.best > rec.s.best) rec = { h, s };
  });
  let activeDays = 0;
  for (let d = 0; d < NUM_DAYS; d++) if (dayAggregate(state, d) > 0) activeDays++;
  // Phase 7: thống kê focus của tháng (phút/ngày gộp theo tuần + top task)
  const focusTotal = focusMonthMinutes();
  const focusByWeek = state.weeks.map((w) => focusWeekMinutes(w.n).reduce((a, b) => a + b, 0));
  const topTask = topFocusTasksInMonth(1)[0] || null;
  return {
    y: PLAN_YEAR, m: PLAN_MONTH,
    goalPct: ms.pct, goalDone: ms.done, goalTotal: ms.total,
    habitAvg, top, rec, activeDays, numDays: NUM_DAYS,
    weekPcts: state.weeks.map((w) => weekStats(w).pct),
    focusTotal, focusByWeek, topTask,
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
      <div class="report-cell"><b>🎯 ${r.focusTotal}p</b><span>${t('reportFocusMonth')}</span></div>
      <div class="report-cell"><b>⭐ ${r.topTask ? taskFocusMinLabel(r.topTask.secs) : '—'}</b><span>${t('reportFocusTop')}</span></div>
    </div>
    <div class="report-weekbars" aria-hidden="true">${r.weekPcts.map((p) => `<div class="rw-bar" style="height:${Math.max(p, 4)}%"></div>`).join('')}</div>
    <div class="report-focus">
      <div class="report-focus-head"><b>🎯 ${r.focusTotal}p</b><span>${t('reportFocusMonth')}</span>${r.topTask ? `<span class="report-focus-top">${t('reportFocusTop')}: ${esc((r.topTask.tk.text || '…').slice(0, 20))} · ${taskFocusMinLabel(r.topTask.secs)}</span>` : ''}</div>
      ${focusReportBars(r.focusByWeek, (i) => String(i + 1))}
    </div>`;
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
      g.font = "700 36px 'Nunito',sans-serif";
      g.fillText('🐥 TaskFlow', W / 2, 96);
      g.fillStyle = '#8A7A6B';
      g.font = "700 42px 'Nunito',sans-serif";
      g.fillText(t('reportCardTitle', { m: monthLabel(r.m), y: r.y }), W / 2, 158);

      g.fillStyle = '#C24E28';
      g.font = "800 120px 'Nunito',sans-serif";
      g.fillText(r.goalPct + '%', W / 2, 300);
      g.fillStyle = '#4A403A';
      g.font = "700 40px 'Nunito',sans-serif";
      g.fillText(t('reportGoalPct') + ' · ' + r.goalDone + '/' + r.goalTotal, W / 2, 352);

      const rows = [
        [t('reportHabitAvg'), r.habitAvg + '%'],
        [t('reportTopHabit'), r.top ? '🔥 ' + r.top.s.cur + ' · ' + r.top.h.name : '—'],
        [t('reportRecord'), r.rec ? '🏆 ' + r.rec.s.best + ' · ' + r.rec.h.name : '—'],
        [t('reportActive'), r.activeDays + '/' + r.numDays],
      ];
      g.font = "700 34px 'Nunito',sans-serif";
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
      g.font = "700 30px 'Nunito',sans-serif";
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
          title: 'TaskFlow 🐥',
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
    habitByDay.push(gi < NUM_DAYS ? dayAggregate(state, gi) : 0);
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
  // Phase 7: thống kê focus của tuần
  const focusByDay = focusWeekMinutes();
  const focusTotal = focusByDay.reduce((a, b) => a + b, 0);
  const topTask = topFocusTasksInWeek(w, 1)[0] || null;
  let bestFocusDay = 0;
  focusByDay.forEach((m, i) => { if (m > focusByDay[bestFocusDay]) bestFocusDay = i; });
  return { n: w.n, pct: st.pct, done: st.done, inProg: st.inProg, total: st.total, habitByDay, top, topN, bestDay, focusByDay, focusTotal, topTask, bestFocusDay };
}

// Phase 18: dữ liệu tuần TRƯỚC để so sánh (goal %, task, habit avg, focus phút).
// Tuần 1 của tháng → lấy tuần cuối tháng trước qua monthStateRaw + dayAggregateAt.
function lastWeekReportData() {
  const curW = state.currentWeek;
  let pw = null, srcY = PLAN_YEAR, srcM = PLAN_MONTH, srcState = state;
  if (curW > 1) {
    pw = state.weeks[curW - 2];
  } else {
    const pm = window.PlanMath ? window.PlanMath.prevMonth(PLAN_YEAR, PLAN_MONTH) : null;
    if (pm) {
      const ps = monthStateRaw(pm.y, pm.m);
      if (ps && ps.weeks && ps.weeks.length) { pw = ps.weeks[ps.weeks.length - 1]; srcY = pm.y; srcM = pm.m; srcState = ps; }
    }
  }
  if (!pw) return null;
  const st = weekStats(pw);
  const monthDays = new Date(srcY, srcM + 1, 0).getDate();
  let habitSum = 0, habitN = 0;
  for (let di = 0; di < 7; di++) {
    const gi = (pw.n - 1) * 7 + di;
    if (gi < monthDays) {
      habitSum += (srcState === state) ? dayAggregate(state, gi) : dayAggregateAt(srcY, srcM, gi);
      habitN++;
    }
  }
  // Focus: tuần cùng tháng dùng focusWeekMinutes (gốc PLAN_START); tuần cuối tháng trước
  // dùng grid của tháng đó (ps.start) cho đúng cùng cửa sổ 7 ngày với cột habit —
  // không lấy "7 ngày dương lịch cuối" vì tuần grid có thể lệch (vd tuần 5 tháng 12
  // nằm 28/12–3/1, không phải 25/12–31/12).
  let focus = 0;
  if (curW > 1) {
    focus = focusWeekMinutes(pw.n).reduce((a, b) => a + b, 0);
  } else {
    const gridStart = new Date(psStart(srcState, srcY, srcM)).getTime();
    for (let di = 0; di < 7; di++) {
      const gi = (pw.n - 1) * 7 + di;
      if (gi < monthDays) focus += pomoDaySecs(new Date(gridStart + gi * 86400000));
    }
    focus = Math.round(focus / 60);
  }
  const out = { pct: st.pct, done: st.done, total: st.total, habitAvg: habitN ? Math.round(habitSum / habitN) : 0, focus };
  // Tuần trước tồn tại nhưng trống rỗng → không hiển thị block so sánh gây hiểu nhầm
  if (out.total === 0 && out.habitAvg === 0 && out.focus === 0) return null;
  return out;
}



// Ô so sánh tuần này vs tuần trước — delta chip ▲/▼, mỗi chỉ số trả lời 1 câu hỏi.
function vsCell(label, curText, diff, unit) {
  let chip = '';
  if (diff !== null && diff !== undefined) {
    if (diff === 0) chip = `<span class="vs-chip vs-same">—</span>`;
    else chip = `<span class="vs-chip ${diff > 0 ? 'vs-up' : 'vs-down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}${unit}</span>`;
  }
  return `<div class="vs-cell"><span class="vs-label">${label}</span><b class="vs-value">${curText}</b>${chip}</div>`;
}

// Dải cột focus cho báo cáo — có nhãn dưới mỗi cột, hiển thị empty state khi chưa có phiên.
function focusReportBars(values, labelFn) {
  const max = Math.max(...values, 1);
  const has = values.some((v) => v > 0);
  if (!has) return `<p class="report-focus-empty">${t('focusChartEmpty')}</p>`;
  return `<div class="report-focus-bars">
    <div class="report-weekbars" aria-hidden="true">${values.map((v) => `<div class="rw-bar${v > 0 ? '' : ' is-zero'}" style="height:${Math.max(v > 0 ? 10 : 3, Math.round((v / max) * 100))}%"></div>`).join('')}</div>
    <div class="report-focus-labels">${values.map((v, i) => `<span>${labelFn(i)}</span>`).join('')}</div>
  </div>`;
}

function renderWeekReportModal() {
  const el = document.getElementById('weekReportContent');
  if (!el) return;
  const w = state.weeks[state.currentWeek - 1];
  if (!w) return;
  const r = weeklyReportData(w);
  const topName = r.top ? esc(r.top.name) : '—';
  // Phase 18: tuần này vs tuần trước — chỉ hiện khi có dữ liệu tuần trước
  const lw = lastWeekReportData();
  const curHabitAvg = r.habitByDay.length ? Math.round(r.habitByDay.reduce((a, b) => a + b, 0) / r.habitByDay.length) : 0;
  const vsBlock = lw ? `<div class="report-vs" aria-label="${t('reportVsTitle')}">
      <h4 class="report-vs-title">${t('reportVsTitle')}</h4>
      <div class="report-vs-grid">
        ${vsCell(t('reportVsGoal'), r.pct + '%', r.pct - lw.pct, '%')}
        ${vsCell(t('reportVsTasks'), r.done + '/' + r.total, r.done - lw.done, '')}
        ${vsCell(t('reportVsHabit'), curHabitAvg + '%', curHabitAvg - lw.habitAvg, '%')}
        ${vsCell(t('reportVsFocus'), r.focusTotal + 'p', r.focusTotal - lw.focus, 'p')}
      </div>
    </div>` : '';
  el.innerHTML = `
    <div class="report-head">
      <div class="donut-wrap"><div class="donut">${donutSVG(r.pct, 96, 12, '#C24E28')}</div>
        <div class="donut-center"><span>${r.pct}%</span><small>${t('weekReportGoalPct')}</small></div>
      </div>
    </div>
    ${vsBlock}
    <div class="report-grid">
      <div class="report-cell"><b>${r.done}</b><span>${t('weekReportDone')}</span></div>
      <div class="report-cell"><b>${r.inProg}</b><span>${t('weekReportInProg')}</span></div>
      <div class="report-cell"><b>${r.total}</b><span>${t('weekReportTotal')}</span></div>
      <div class="report-cell"><b>🔥 ${r.topN}</b><span>${t('weekReportTopHabit')} · ${topName}</span></div>
      <div class="report-cell"><b>⭐ ${t('weekReportDayT', { d: r.bestDay + 1 })}</b><span>${t('weekReportBestDay')} · ${r.habitByDay[r.bestDay]}%</span></div>
      <div class="report-cell"><b>🎯 ${r.focusTotal}p</b><span>${t('reportFocusWeek')}</span></div>
      <div class="report-cell"><b>⭐ ${esc(dayLabelShort(r.bestFocusDay))}</b><span>${t('reportFocusBestDay')} · ${r.focusByDay[r.bestFocusDay]}p</span></div>
    </div>
    <div class="report-weekbars" aria-hidden="true">${r.habitByDay.map((p) => `<div class="rw-bar" style="height:${Math.max(p, 4)}%"></div>`).join('')}</div>
    <div class="report-focus">
      <div class="report-focus-head"><b>🎯 ${r.focusTotal}p</b><span>${t('reportFocusWeek')}</span>${r.topTask ? `<span class="report-focus-top">${t('reportFocusTop')}: ${esc((r.topTask.tk.text || '…').slice(0, 20))} · ${taskFocusMinLabel(r.topTask.secs)}</span>` : ''}</div>
      ${focusReportBars(r.focusByDay, dayLabelShort)}
    </div>`;
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
      g.font = "700 36px 'Nunito',sans-serif";
      g.fillText('🐥 TaskFlow', W / 2, 96);
      g.fillStyle = '#8A7A6B';
      g.font = "700 42px 'Nunito',sans-serif";
      g.fillText(t('weekReportCardTitle', { n: r.n }), W / 2, 158);
      g.fillStyle = '#C24E28';
      g.font = "800 120px 'Nunito',sans-serif";
      g.fillText(r.pct + '%', W / 2, 300);
      g.fillStyle = '#4A403A';
      g.font = "700 40px 'Nunito',sans-serif";
      g.fillText(t('weekReportGoalPct') + ' · ' + r.done + '/' + r.total, W / 2, 352);
      const rows = [
        [t('weekReportDone'), r.done],
        [t('weekReportInProg'), r.inProg],
        [t('weekReportTopHabit'), r.top ? '🔥 ' + r.topN + ' · ' + r.top.name : '—'],
        [t('weekReportBestDay'), t('weekReportDayT', { d: r.bestDay + 1 }) + ' · ' + r.habitByDay[r.bestDay] + '%'],
      ];
      g.font = "700 34px 'Nunito',sans-serif";
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
      g.font = "700 28px 'Nunito',sans-serif";
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
      g.font = "700 30px 'Nunito',sans-serif";
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
          title: 'TaskFlow 🐥',
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
  return `<div class="tag-filter-bar"><span class="tag-filter-lbl">${t('tagFilter')}</span>${chips.join('')}${tagFilter ? `<button type="button" class="tag-chip tag-clear" data-action="tagfilter" data-tag="">✕ ${t('tagAll')}</button>` : ''}</div>`;
}

function renderWeek() {
  applyRecurrence();
  const el = document.getElementById('view-week');
  const w = state.weeks[state.currentWeek - 1];
  const st = weekStats(w);
  const ti = nowInfo(PLAN_START, NUM_DAYS);
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
        ${focusChartCardHTML(w)}
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

/* ============================ Phase 3: Today Dashboard ============================ */

function todayGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return t('todayGreetingMorning');
  if (h >= 12 && h < 18) return t('todayGreetingAfternoon');
  return t('todayGreetingEvening');
}

function todayWeekdayLabel() {
  return new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
}

function renderToday() {
  const el = document.getElementById('view-today');
  if (!el) return;
  const ti = nowInfo(PLAN_START, NUM_DAYS);
  // Đang xem tháng khác (viewedMonth !== null) → "hôm nay" không thuộc tháng đang xem:
  // ẩn tasks/habits để không hiển thị nhầm ngày tương ứng trong lịch tháng khác.
  const inTodayMonth = viewedMonth === null && ti.inRange;
  const w = inTodayMonth ? state.weeks[ti.week - 1] : null;
  const d = w && w.days[ti.dayInWeek];
  const tasks = d && Array.isArray(d.tasks) ? d.tasks : [];
  const done = tasks.filter((tk) => tk.done).length;
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const habits = Array.isArray(state.habits) ? state.habits : [];
  // Habit.days[] được index theo ngày-trong-tháng (0-based) — nhất quán với overview/week/day view.
  // KHÔNG dùng ti.dayIdx (số ngày từ PLAN_START neo theo thứ của tuần đầu) — sẽ lệch vài ngày.
  const habitIdx = viewedMonth === null && ti.inRange ? new Date().getDate() - 1 : -1;
  const habitsToday = habits.filter((h) => habitIdx >= 0 && !(Array.isArray(h.skipDays) && h.skipDays.includes(habitIdx)));
  const habitsDone = habitsToday.filter((h) => Array.isArray(h.days) && h.days[habitIdx] === true).length;

  const taskRows = tasks.length
    ? tasks.map((tk, i) => {
        const timed = tk.remind && tk.remind.enabled && tk.remind.time;
        return `<div class="today-task ${tk.done ? 'done' : ''}">
        ${checkboxHTML(tk.kind === 'priority' ? 'pink' : 'blue', tk.done, `data-action="task" data-week="${ti.week}" data-day="${ti.dayInWeek}" data-task="${i}"`, window.TaskFlowUI.checkboxLabel('task', tk.text, todayWeekdayLabel()))}
        <span class="task-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="task-text" data-week="${ti.week}" data-day="${ti.dayInWeek}" data-task="${i}" data-placeholder="${t('taskPh')}" aria-label="${t('taskAria', { n: i + 1 })}">${esc(tk.text ?? '')}</span>
        ${tk.kind === 'priority' ? `<span class="badge badge-accent today-prio">${t('todayPriority')}</span>` : ''}
        ${timed ? `<span class="today-task-time">${esc(timed)}</span>` : ''}
        ${tk.done ? '' : `<button type="button" class="btn-del" data-action="deltask" data-week="${ti.week}" data-day="${ti.dayInWeek}" data-task="${i}" aria-label="${t('delTaskAria', { n: i + 1 })}" title="${t('delTaskAria', { n: i + 1 })}">✕</button>`}
      </div>`;
      }).join('')
    : emptyStateHTML('🎯', 'todayEmpty', 'todayEmptySub', [
        { label: t('emptyAddToday'), action: 'shell-add-task' },
        { label: t('emptyGoUpcoming'), action: 'nav', attrs: 'data-view="upcoming"' },
      ]);

  const habitRows = habitsToday.length
    ? habitsToday.map((h) => {
        const on = Array.isArray(h.days) && h.days[habitIdx] === true;
        return `<div class="today-habit${on ? ' done' : ''}">
        ${checkboxHTML('', on, `data-action="habit" data-id="${esc(h.id)}" data-day="${habitIdx}"`, window.TaskFlowUI.checkboxLabel('habit', h.name, todayWeekdayLabel()))}
        <span class="today-habit-name">${esc(h.name)}</span>
        <span class="today-habit-streak" title="${t('overviewMetricStreakMeta')}">🔥<span>${habitStreakCached(h).cur}</span></span>
      </div>`;
      }).join('')
    : `<p class="today-habits-empty">${t('todayHabitsEmpty')} <button type="button" class="empty-btn" data-action="habit-focus" title="${t('emptyAddHabit')}">${t('emptyAddHabit')}</button></p>`;

  const focusMinutes = totalFocusMinutesToday();
  el.innerHTML = `<div class="today-page">
    <header class="today-header">
      <p class="today-greeting">${esc(todayGreeting())}</p>
      <h1 class="today-date">${esc(todayWeekdayLabel())}</h1>
    </header>
    <div class="today-grid">
      <div class="today-main">
        <section class="today-card today-tasks-card" aria-label="${t('todayTasksTitle')}">
          <div class="today-card-head">
            <h2 class="today-card-title">${t('todayTasksTitle')}</h2>
            <span class="today-count" data-role="today-count">${done}/${total}</span>
          </div>
          <div class="today-progress" role="progressbar" aria-label="${t('todayProgress')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
            <span class="today-progress-fill" data-role="today-progress-fill" style="width:${pct}%"></span>
          </div>
          <p class="today-progress-label" data-role="today-progress-label">${t('todayCompleted', { done, total })}</p>
          <div class="today-task-list" data-role="today-task-list">${taskRows}</div>
          <button type="button" class="btn-add-today" data-action="today-addtask" aria-label="${t('todayAddTask')}">＋ ${t('todayAddTask')}</button>
        </section>
      </div>
      <aside class="today-side">
        <section class="today-card" aria-label="${t('todayHabitsTitle')}">
          <div class="today-card-head">
            <h2 class="today-card-title">${t('todayHabitsTitle')}</h2>
            <span class="today-count">${habitsDone}/${habitsToday.length}</span>
          </div>
          <div class="today-habit-list" data-role="today-habit-list">${habitRows}</div>
        </section>
        <section class="today-card today-focus-card" aria-label="${t('todayFocusTitle')}">
          <div class="today-card-head">
            <h2 class="today-card-title">${t('todayFocusTitle')}</h2>
          </div>
          <div class="today-focus-time">${formatFocusTime(focusMinutes)}</div>
          <p class="today-focus-tip">${t('todayFocusTip')}</p>
          <button type="button" class="button button-primary today-focus-btn" data-action="focus">${window.TaskFlowUI.icon('focus')}<span>${t('todayFocusStart')}</span></button>
        </section>
      </aside>
    </div>
  </div>`;
}

function totalFocusMinutesToday() {
  const log = loadPomoLog();
  const k = pomoDateKey(new Date());
  const entry = log[k];
  return entry && typeof entry.secs === 'number' ? Math.round(entry.secs / 60) : 0;
}

function taskRowHTML(wn, di, ti, mod, task, pos) {
  const tags = Array.isArray(task.tags) ? task.tags : [];
  const timed = task.remind && task.remind.enabled && task.remind.time;
  const repeated = task.repeat && task.repeat.freq;
  // Meta line: giờ (remind) · badge P1 · indicator lặp · hạn chót — hiển thị gọn dưới text, chỉ khi có thông tin
  const metaBits = [];
  if (task.kind === 'priority') metaBits.push(`<span class="task-prio badge badge-accent">${t('taskPriorityLabel')}</span>`);
  if (timed) metaBits.push(`<span class="task-meta-time" title="${t('remindTaskAria')}">${window.TaskFlowUI.icon('bell')}<span>${esc(timed)}</span></span>`);
  if (repeated) metaBits.push(`<span class="task-meta-repeat" title="${t('taskMetaRepeat')}">${window.TaskFlowUI.icon('repeat')}</span>`);
  if (task.deadline) metaBits.push(`<span class="task-meta-deadline" title="${esc(fmtDeadline(task.deadline))}">${window.TaskFlowUI.icon('calendar')}<span>${esc(fmtDeadline(task.deadline))}</span></span>`);
  if (taskFocusSecs(task) > 0) metaBits.push(`<span class="task-meta-focus" title="${t('focusLogTotal', { n: Math.round(taskFocusSecs(task) / 60) })}">${window.TaskFlowUI.icon('focus')}<span>${esc(formatFocusTime(Math.round(taskFocusSecs(task) / 60)))}</span></span>`);
  const meta = metaBits.length ? `<span class="task-meta">${metaBits.join('')}</span>` : '';
  return `<div class="task-row${tagFilter && !tags.includes(tagFilter) ? ' filtered-out' : ''}${task.carriedFrom ? ' carried' : ''}${task.done ? ' done' : ''}" data-testid="task-row" draggable="true" data-drag="task" data-week="${wn}" data-day="${di}" data-task="${ti}" data-kind="${task.kind}" data-pos="${pos ?? 0}" title="${t('dragHint')}" aria-label="${t('dragHint')}">
    ${checkboxHTML(mod, task.done, `data-action="task" data-week="${wn}" data-day="${di}" data-task="${ti}"`, window.TaskFlowUI.checkboxLabel('task', task.text, `${t('weekN', { n: wn })}, ${dayLabel(di)}`))}
    ${task.carriedFrom ? `<span class="carried-badge" title="${t('carriedFrom', { date: carriedDateLabel(task.carriedFrom) })}" aria-label="${t('carriedFrom', { date: carriedDateLabel(task.carriedFrom) })}">↳</span>` : ''}
    <span class="task-main">
      <span class="task-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="task-text" data-week="${wn}" data-day="${di}" data-task="${ti}" data-placeholder="${t('taskPh')}" aria-label="${t('taskAria', { n: ti + 1 })}">${esc(task.text ?? '')}</span>
      ${meta}
    </span>
    ${tags.length ? `<span class="task-tags">${tags.map((tg) => `<span class="tag-chip" data-tag="${esc(tg)}">#${esc(tg)}</span>`).join('')}</span>` : ''}
    <span class="task-row-actions">
      <button type="button" class="task-focus-btn" data-action="focus-task" data-week="${wn}" data-day="${di}" data-task="${ti}" title="${t('taskFocusBtn')}" aria-label="${t('taskFocusBtn')}">${window.TaskFlowUI.icon('focus')}</button>
      <button type="button" class="task-menu-open" data-action="task-menu" data-week="${wn}" data-day="${di}" data-task="${ti}" title="${t('taskMenu')}" aria-label="${t('taskMenu')}" aria-haspopup="menu" aria-expanded="false">${window.TaskFlowUI.icon('more')}</button>
      <span class="task-menu" role="menu" hidden>
        <button type="button" role="menuitem" data-action="task-detail" data-week="${wn}" data-day="${di}" data-task="${ti}">${window.TaskFlowUI.icon('data')} <span>${t('taskDetail')}</span></button>
        <button type="button" role="menuitem" data-action="task-move" data-week="${wn}" data-day="${di}" data-task="${ti}">${window.TaskFlowUI.icon('calendar')} <span>${t('taskMove')}</span></button>
        <button type="button" role="menuitem" data-action="remind-task" data-week="${wn}" data-day="${di}" data-task="${ti}">🔔 <span>${t('remindTitle')}</span>${task.remind && task.remind.enabled ? ' <span class="task-menu-on" aria-hidden="true">●</span>' : ''}</button>
        <button type="button" role="menuitem" data-action="tag-edit" data-week="${wn}" data-day="${di}" data-task="${ti}">🏷️ <span>${t('tagAdd')}</span></button>
        <button type="button" role="menuitem" data-action="repeat-edit" data-week="${wn}" data-day="${di}" data-task="${ti}">🔁 <span>${t('repeatTitle')}</span>${repeated ? ' <span class="task-menu-on" aria-hidden="true">●</span>' : ''}</button>
        <button type="button" role="menuitem" data-action="task-duplicate" data-week="${wn}" data-day="${di}" data-task="${ti}">⧉ <span>${t('taskDuplicate')}</span></button>
        <button type="button" role="menuitem" class="danger" data-action="deltask" data-week="${wn}" data-day="${di}" data-task="${ti}">✕ <span>${t('delTaskAria', { n: ti + 1 })}</span></button>
      </span>
    </span>
  </div>`;
}

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
            <label class="td-toggle"><input type="checkbox" data-action="td-time-toggle" ${timed ? 'checked' : ''} aria-label="${t('remindTaskAria')}"><span>🔔</span></label>
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
      <div class="td-field">
        <span class="td-field-label">${t('taskDetailTags')}</span>
        <div class="td-tags">
          ${tags.length ? tags.map((tg) => `<span class="tag-chip td-tag">#${esc(tg)}<button type="button" class="td-tag-del" data-action="td-tag-del" data-tag="${esc(tg)}" aria-label="${t('tagDelAria', { tag: tg })}" title="${t('tagDelAria', { tag: tg })}">✕</button></span>`).join('') : `<span class="td-empty">—</span>`}
        </div>
        <span class="td-add-row"><input type="text" data-role="td-tag-input" placeholder="${t('tagAdd')}" maxlength="40" aria-label="${t('tagAdd')}"><button type="button" class="td-add-btn" data-action="td-tag-add" aria-label="${t('tagAdd')}">＋</button></span>
      </div>
      <div class="td-field">
        <span class="td-field-label">${t('taskDetailNotes')}</span>
        <textarea class="td-note" data-action="td-note" rows="3" placeholder="—" aria-label="${t('taskDetailNotes')}">${esc(tk.notes ?? '')}</textarea>
      </div>
      <div class="td-field">
        <span class="td-field-label">${t('taskDetailSubtasks')}${subs.length ? ` <span class="td-sub-count">${subDone}/${subs.length}</span>` : ''}</span>
        <div class="td-subtasks">
          ${subs.length ? subs.map((s, i) => `<div class="td-subtask ${s.done ? 'done' : ''}">${checkboxHTML('blue', s.done, `data-action="subtask-toggle" data-sub="${i}"`, window.TaskFlowUI.checkboxLabel('subtask', s.text, `${t('taskDetailSubtasks')} ${i + 1}`))}<span class="td-subtask-text">${esc(s.text)}</span><button type="button" class="td-subtask-del" data-action="subtask-del" data-sub="${i}" aria-label="${t('delTaskAria', { n: i + 1 })}" title="${t('delTaskAria', { n: i + 1 })}">✕</button></div>`).join('') : `<p class="td-empty">${t('taskDetailSubtaskPh')}</p>`}
        </div>
        <span class="td-add-row"><input type="text" data-role="td-subtask-input" placeholder="${t('taskDetailSubtaskPh')}" maxlength="120" aria-label="${t('taskDetailAddSubtask')}"><button type="button" class="td-add-btn" data-action="subtask-add" aria-label="${t('taskDetailAddSubtask')}">＋</button></span>
      </div>
      <button type="button" class="td-delete danger" data-action="td-delete" ${inInbox ? `data-scope="inbox"` : `data-week="${taskDetailRef.week}" data-day="${taskDetailRef.day}"`} data-task="${taskDetailRef.task}">${t('taskDetailDelete')}</button>`;
  bindTaskDetailEvents(drawer);
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

function renderCalendar() {
  const el = document.getElementById('view-calendar');
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
  el.innerHTML = `<div class="calendar-page">
    <header class="calendar-page-header">
      <div>
        <p class="calendar-page-eyebrow">${t('calendarWorkspaceEyebrow')}</p>
        <h1 class="calendar-page-title">${t('calendarPageTitle', { m: monthLabel(PLAN_MONTH), y: PLAN_YEAR })}</h1>
        <p class="calendar-page-subtitle">${t('calendarPageSubtitle')}</p>
      </div>
      <div class="cal-legend"><span class="dot on"></span> ${t('legendDone')} <span class="dot off"></span> ${t('legendNotDone')}</div>
    </header>
    ${calFocusSummary}
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
              tasks: (sd.tasks || []).map((tk) => ({ uid: newTaskUid(), kind: tk.kind, done: false, text: tk.text || '', tags: Array.isArray(tk.tags) ? tk.tags.slice() : [] })),
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
// Timestamp (ms) khi phiên kết thúc — dùng để tính thời gian còn lại chính xác
// kể cả khi tab ẩn (setInterval bị browser throttle ở tab nền).
let pomoEndAt = 0;

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

function pomoDuration() {
  return pomo.mode === 'work' ? POMO_WORK : (pomo.mode === 'longBreak' ? POMO_LONG_BREAK : POMO_BREAK);
}

// Cập nhật pomo.left từ đồng hồ thật — chạy được cả khi tab ẩn (visibilitychange/focus).
function pomoSync() {
  if (!pomo.running) return;
  const left = Math.max(0, Math.ceil((pomoEndAt - Date.now()) / 1000));
  if (left <= 0) {
    pomoComplete();
  } else {
    pomo.left = left;
    renderPomo();
  }
}

// Hoàn thành phiên: ghi session, tự chuyển mode (work → break, sau 4 lần → long break).
function pomoComplete() {
  if (!pomo.running) return;
  clearInterval(pomo.timer);
  pomo.timer = null;
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
      pomo.mode = 'longBreak';
      TaskFlowUI.toast(t('pomoWorkDoneTxt') + ' · ' + t('pomoLongBreak'), 'success');
    } else {
      TaskFlowUI.toast(t('pomoDoneWork'), 'success');
      pomo.mode = 'break';
    }
  } else if (finished === 'longBreak') {
    TaskFlowUI.toast(t('pomoLongBreakDone'), 'success');
    pomo.mode = 'work';
  } else {
    TaskFlowUI.toast(t('pomoDoneBreak'), 'success');
    pomo.mode = 'work';
  }
  pomo.left = pomoDuration();
  pomoEndAt = 0;
  renderPomoWidgetStats();
  renderPomo();
  refreshFocusIfOpen();
}

function pomoStart() {
  if (pomo.running) {
    clearInterval(pomo.timer);
    pomo.timer = null;
    pomo.running = false;
    pomoEndAt = 0;
    renderPomo();
    return;
  }
  pomo.running = true;
  trackEvent('pomodoro_start', { mode: pomo.mode });
  pomoEndAt = Date.now() + pomo.left * 1000;
  pomo.timer = setInterval(pomoSync, 1000);
  renderPomo();
}

function pomoReset() {
  clearInterval(pomo.timer);
  pomo.timer = null;
  pomo.running = false;
  pomoEndAt = 0;
  pomo.left = pomoDuration();
  renderPomo();
}

function pomoSetMode(mode) {
  clearInterval(pomo.timer);
  pomo.timer = null;
  pomo.running = false;
  pomoEndAt = 0;
  pomo.mode = mode === 'break' ? 'break' : mode === 'longBreak' ? 'longBreak' : 'work';
  pomo.left = pomoDuration();
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
/* ---------- Phase 7: Thống kê focus (biểu đồ tuần + báo cáo) ---------- */

// Số giây focus của một ngày cụ thể (từ pomo log — hợp nhất pomo + task-focus).
function pomoDaySecs(date) {
  const log = loadPomoLog();
  const e = log[pomoDateKey(date)];
  return e && typeof e.secs === 'number' ? e.secs : 0;
}

// Phút focus 7 ngày của một tuần (Mon → Sun) — mặc định tuần hiện tại, truyền week để tính tuần khác.
function focusWeekMinutes(week) {
  const wn = week ?? state.currentWeek;
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(PLAN_START.getTime() + ((wn - 1) * 7 + i) * 86400000);
    out.push(Math.round(pomoDaySecs(d) / 60));
  }
  return out;
}

// Tổng phút focus của tháng đang xem (chỉ tính các ngày thuộc tháng — bỏ ô tràn grid).
function focusMonthMinutes() {
  let secs = 0;
  for (let i = 0; i < NUM_DAYS; i++) {
    const d = new Date(PLAN_START.getTime() + i * 86400000);
    if (d.getFullYear() === PLAN_YEAR && d.getMonth() === PLAN_MONTH) secs += pomoDaySecs(d);
  }
  return Math.round(secs / 60);
}

// Tổng giây focus của task trong khoảng [startKey, endKey] (date key 'YYYY-MM-DD').
function taskFocusSecsInRange(tk, startKey, endKey) {
  return taskFocusLog(tk).filter((e) => e.d >= startKey && e.d <= endKey).reduce((s, e) => s + (e.secs || 0), 0);
}

// Top N task có thời gian focus nhiều nhất trong tuần (từ task.focusLog của chính tuần đó).
function topFocusTasksInWeek(w, n) {
  const start = new Date(PLAN_START.getTime() + (w.n - 1) * 7 * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  const sk = pomoDateKey(start), ek = pomoDateKey(end);
  const acc = [];
  w.days.forEach((d) => (d.tasks || []).forEach((tk) => {
    const secs = taskFocusSecsInRange(tk, sk, ek);
    if (secs > 0) acc.push({ tk, secs });
  }));
  acc.sort((a, b) => b.secs - a.secs);
  return acc.slice(0, n);
}

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

/* ---------- Phase 9: Thống kê tương quan focus × task ---------- */

// Phạm vi thời gian đang chọn trong modal Thống kê.
let statsRange = 'month';

// Ngày Thứ 2 đầu tuần (wi = 0-based) của tháng (y,m) — lặp lại phép tính của initPlan.
function statsWeekStartOf(y, m, wi) {
  const first = new Date(y, m, 1);
  const dow = (first.getDay() + 6) % 7; // Thứ 2 = 0
  return new Date(first.getTime() - dow * 86400000 + wi * 7 * 86400000);
}

// Danh sách tháng cần quét theo phạm vi đã chọn: [[y, m], ...].
function statsMonthsForRange(range) {
  if (range === 'month') return [[PLAN_YEAR, PLAN_MONTH]];
  if (range === 'quarter') {
    const qs = Math.floor(PLAN_MONTH / 3) * 3;
    const out = [];
    for (let m = qs; m < qs + 3; m++) out.push([PLAN_YEAR, m]);
    return out;
  }
  if (range === 'year') {
    const out = [];
    for (let m = 0; m < 12; m++) out.push([PLAN_YEAR, m]);
    return out;
  }
  // 'all': mọi tháng đã có dữ liệu (localStorage planner-YYYY-M + pomo log).
  const seen = new Set();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const mm = k && String(k).match(/^planner-(\d{4})-(\d{1,2})$/);
    if (mm) seen.add(mm[1] + '-' + (+mm[2] - 1));
  }
  const log = loadPomoLog();
  for (const key in log) {
    const mm = String(key).match(/^(\d{4})-(\d{2})-/);
    if (mm) seen.add(mm[1] + '-' + (+mm[2] - 1));
  }
  const out = [];
  seen.forEach((k) => { const [y, m] = k.split('-').map(Number); out.push([y, m]); });
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return out;
}

function statsWeekLabel(y, m, n) {
  const base = t('weekN', { n });
  return statsRange === 'quarter' ? `${base} · ${shortMonth(m)}` : base;
}

function statsMonthLabel(y, m, range) {
  let label = shortMonth(m);
  if (range === 'all' && y !== PLAN_YEAR) label += '/' + (y % 100);
  return label;
}

// Dữ liệu biểu đồ: mỗi điểm = 1 tuần (tháng/quý) hoặc 1 tháng (năm/toàn bộ).
// Chỉ đếm các ngày thuộc đúng tháng (y,m) để không đếm trùng ngày giữa các grid liền kề.
function statsData(range) {
  const granularity = (range === 'year' || range === 'all') ? 'month' : 'week';
  const log = loadPomoLog();
  const points = [];
  statsMonthsForRange(range).forEach(([y, m]) => {
    const s = (y === PLAN_YEAR && m === PLAN_MONTH) ? state : monthStateRaw(y, m);
    if (!s || !Array.isArray(s.weeks)) {
      // Tháng chỉ có dữ liệu focus (pomo log, chưa có planner state):
      // vẫn tạo 1 điểm với done = 0 để không mất phút focus.
      let secs = 0;
      const dim = new Date(y, m + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const e = log[pomoDateKey(new Date(y, m, d))];
        if (e && typeof e.secs === 'number') secs += e.secs;
      }
      if (secs > 0) points.push({ label: statsMonthLabel(y, m, range), focus: Math.round(secs / 60), done: 0 });
      return;
    }
    const acc = [];
    s.weeks.forEach((w, wi) => {
      const ws = statsWeekStartOf(y, m, wi);
      let done = 0, secs = 0;
      (w.days || []).forEach((d, di) => {
        const dt = new Date(ws.getTime() + di * 86400000);
        if (dt.getFullYear() !== y || dt.getMonth() !== m) return; // bỏ ô tràn grid
        (d.tasks || []).forEach((tk) => { if (tk.done) done++; });
        const e = log[pomoDateKey(dt)];
        if (e && typeof e.secs === 'number') secs += e.secs;
      });
      acc.push({ done, focus: Math.round(secs / 60) });
    });
    if (granularity === 'week') {
      acc.forEach((p, wi) => {
        const n = s.weeks[wi] && s.weeks[wi].n ? s.weeks[wi].n : wi + 1;
        points.push({ label: statsWeekLabel(y, m, n), focus: p.focus, done: p.done });
      });
    } else {
      points.push({
        label: statsMonthLabel(y, m, range),
        focus: acc.reduce((a, p) => a + p.focus, 0),
        done: acc.reduce((a, p) => a + p.done, 0),
      });
    }
  });
  const unit = granularity === 'week' ? t('statsUnitWeek') : t('statsUnitMonth');
  return { points, granularity, unit };
}

// Hệ số tương quan Pearson giữa hai dãy số — null nếu không tính được.
function statsCorrelation(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

// SVG scatter: trục ngang = phút focus, trục dọc = task hoàn thành.
function statsScatterSVG(points) {
  const W = 400, H = 264, L = 54, R = 14, T = 22, B = 44;
  const iw = W - L - R, ih = H - T - B;
  const maxF = Math.max(1, ...points.map((p) => p.focus)) * 1.12;
  const maxD = Math.max(1, ...points.map((p) => p.done)) * 1.12;
  const X = (f) => L + (f / maxF) * iw;
  const Y = (d) => T + ih - (d / maxD) * ih;
  const ticks = 4;
  let grid = '', labels = '';
  for (let i = 0; i <= ticks; i++) {
    const fx = L + (i / ticks) * iw, dy = T + ih - (i / ticks) * ih;
    grid += `<line x1="${fx}" y1="${T}" x2="${fx}" y2="${T + ih}" class="stats-grid"/><line x1="${L}" y1="${dy}" x2="${L + iw}" y2="${dy}" class="stats-grid"/>`;
    labels += `<text x="${fx}" y="${H - 14}" text-anchor="middle" class="stats-axis">${Math.round((maxF * i) / ticks)}</text>`;
    labels += `<text x="${L - 8}" y="${dy + 4}" text-anchor="end" class="stats-axis">${Math.round((maxD * i) / ticks)}</text>`;
  }
  const dots = points.map((p) => {
    const label = t('statsPointAria', { label: p.label, done: p.done, focus: p.focus });
    // Chỉ gắn nhãn cho điểm có dữ liệu — tránh 12 nhãn "T1..T12" chồng nhau tại gốc.
    const hasData = p.focus > 0 || p.done > 0;
    return `<g class="stats-dot"><title>${esc(label)}</title>` +
      `<circle class="stats-dot-hit" cx="${X(p.focus)}" cy="${Y(p.done)}" r="15"/>` +
      `<circle class="stats-dot-core" cx="${X(p.focus)}" cy="${Y(p.done)}" r="6"/>` +
      (hasData ? `<text x="${X(p.focus)}" y="${Y(p.done) - 12}" text-anchor="middle" class="stats-dot-label">${esc(p.label)}</text>` : '') +
      '</g>';
  }).join('');
  const axisTitles =
    `<text x="${L + iw / 2}" y="${H - 2}" text-anchor="middle" class="stats-axis-title">${esc(t('statsFocusAxis'))}</text>` +
    `<text x="16" y="${T + ih / 2}" text-anchor="middle" class="stats-axis-title" transform="rotate(-90 16 ${T + ih / 2})">${esc(t('statsDoneAxis'))}</text>`;
  return `<svg class="stats-scatter-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('statsTitle'))}">` +
    grid + labels + dots + axisTitles + '</svg>';
}

function renderStatsModal() {
  const el = document.getElementById('statsContent');
  if (!el) return;
  const d = statsData(statsRange);
  const ps = d.points;
  const focusTotal = ps.reduce((a, p) => a + p.focus, 0);
  const doneTotal = ps.reduce((a, p) => a + p.done, 0);
  const maxDone = Math.max(1, ...ps.map((p) => p.done));
  const best = ps.reduce((m, p, i) => (p.done > (ps[m] ? ps[m].done : -1) ? i : m), 0);
  const corr = statsCorrelation(ps.map((p) => p.focus), ps.map((p) => p.done));
  const unit = d.unit;
  const rng = [['month', t('statsRangeMonth')], ['quarter', t('statsRangeQuarter')],
    ['year', t('statsRangeYear')], ['all', t('statsRangeAll')]]
    .map(([r, label]) => `<button type="button" class="stats-range-btn${statsRange === r ? ' active' : ''}" data-action="stats-range" data-range="${r}" aria-pressed="${statsRange === r}">${esc(label)}</button>`).join('');
  const summary = ps.length ? `<div class="stats-summary">
      <div class="report-cell"><b>🎯 ${focusTotal}p</b><span>${t('statsTotalFocus')}</span></div>
      <div class="report-cell"><b>✅ ${doneTotal}</b><span>${t('statsTotalDone')}</span></div>
      <div class="report-cell"><b>📈 ${ps.length ? Math.round(focusTotal / ps.length) : 0}p</b><span>${t('statsAvgFocus', { unit })}</span></div>
      <div class="report-cell"><b>🏆 ${esc(ps[best].label)}</b><span>${t('statsBest')} · ${ps[best].done} ${t('statsTotalDone')}</span></div>
      <div class="report-cell"><b>📊 ${corr == null ? '—' : corr.toFixed(2)}</b><span>${t('statsCorr')}</span></div>
    </div>` : '';
  const table = ps.length ? `<div class="stats-table" role="table" aria-label="${esc(t('statsTitle'))}">
      ${ps.map((p) => `<div class="stats-row" role="row">` +
        `<span class="stats-row-label" role="cell">${esc(p.label)}</span>` +
        `<span class="stats-row-focus" role="cell">🎯 ${p.focus}p</span>` +
        `<span class="stats-row-bar" role="cell" aria-hidden="true"><i style="width:${Math.round((p.done / maxDone) * 100)}%"></i></span>` +
        `<span class="stats-row-done" role="cell">✅ ${p.done}</span></div>`).join('')}
    </div>` : '';
  el.innerHTML = `<div class="stats-range" role="group" aria-label="${esc(t('statsTitle'))}">${rng}</div>` +
    `<p class="stats-note">${t('statsCorrNote', { unit })}</p>` +
    (!ps.length ? `<div class="stats-empty">${t('statsNoData')}</div>` :
      `<div class="stats-scatter-wrap">${statsScatterSVG(ps)}</div>` + summary + table);
}

function openStatsModal() {
  const m = document.getElementById('statsModal');
  if (!m) return;
  renderStatsModal();
  TaskFlowUI.openDialog('statsModal');
}

function closeStatsModal() {
  TaskFlowUI.closeDialog('statsModal');
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

// Top N task có focus nhiều nhất trong tháng đang xem.
function topFocusTasksInMonth(n) {
  const mKey = PLAN_YEAR + '-' + String(PLAN_MONTH + 1).padStart(2, '0');
  const sk = mKey + '-01';
  const last = new Date(PLAN_YEAR, PLAN_MONTH + 1, 0).getDate();
  const ek = mKey + '-' + String(last).padStart(2, '0');
  const acc = [];
  state.weeks.forEach((w) => w.days.forEach((d) => (d.tasks || []).forEach((tk) => {
    const secs = taskFocusSecsInRange(tk, sk, ek);
    if (secs > 0) acc.push({ tk, secs });
  })));
  acc.sort((a, b) => b.secs - a.secs);
  return acc.slice(0, n);
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

// Enter key trong chat input gửi tin nhắn
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'chatInput') {
    e.preventDefault();
    runLazyModule('js/chat.min.js', () => window.TaskFlowChat.doChatSend());
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
const MORE_SHEET_VIEWS = ['inbox', 'week', 'overview', 'year', 'calendar'];

function buildNav() {
  const desktop = document.getElementById('navTabs');
  const mobile = document.getElementById('mobileNav');
  const items = [
    { view: 'today', icon: 'calendar', label: shellNavLabel(t('todayTxt')), id: 'tab-today', controls: 'view-today' },
    { view: 'inbox', icon: 'inbox', label: shellNavLabel(t('tabInbox')), id: 'tab-inbox', controls: 'view-inbox' },
    { view: 'upcoming', icon: 'upcoming', label: shellNavLabel(t('tabUpcoming')), id: 'tab-upcoming', controls: 'view-upcoming' },
    { view: 'overview', icon: 'overview', label: shellNavLabel(t('tabOverview')), id: 'tab-overview', controls: 'view-overview' },
    { view: 'week', icon: 'week', label: shellNavLabel(t('weekN', { n: state.currentWeek })), id: 'tab-week-' + state.currentWeek, controls: 'view-week', week: state.currentWeek },
    { view: 'year', icon: 'year', label: shellNavLabel(t('tabYear', { y: PLAN_YEAR })), id: 'tab-year', controls: 'view-year' },
    { view: 'calendar', icon: 'calendar', label: shellNavLabel(t('tabCalendar')), id: 'tab-calendar', controls: 'view-calendar' },
  ];
  const navAttributes = {
    today: 'data-nav-view="today" data-view="today"',
    inbox: 'data-nav-view="inbox" data-view="inbox"',
    upcoming: 'data-nav-view="upcoming" data-view="upcoming"',
    overview: 'data-nav-view="overview" data-view="overview"',
    week: 'data-nav-view="week" data-view="week"',
    year: 'data-nav-view="year" data-view="year"',
    calendar: 'data-nav-view="calendar" data-view="calendar"',
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
        byView.overview, byView.week, byView.year, byView.calendar,
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
  if (!sheet || sheet.hidden) return;
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove('more-sheet-open');
  TaskFlowUI.closeDrawer('moreSheet');
  const btn = document.querySelector('#mobileNav [data-action="more"]');
  if (btn) btn.setAttribute('aria-expanded', 'false');
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
  if (!drawer || drawer.hidden) return;
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove('tools-drawer-open');
  document.querySelectorAll('[data-action="tools-open"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  TaskFlowUI.closeDrawer('toolsDrawer');
  const wasSheetTrigger = toolsDrawerOpenedFromSheet;
  const returnTarget = toolsDrawerReturnFocusSelector
    ? document.querySelector(toolsDrawerReturnFocusSelector)
    : null;
  toolsDrawerReturnFocusSelector = null;
  toolsDrawerOpenedFromSheet = false;
  if (returnTarget && returnTarget.getClientRects().length) returnTarget.focus();
  else if (wasSheetTrigger) {
    // Sheet đã đóng trước khi mở drawer → trả focus về nút More trong bottom nav.
    const moreBtn = document.querySelector('#mobileNav [data-action="more"]');
    if (moreBtn) moreBtn.focus();
  }
}

/* ============================ Upcoming — Công việc sắp tới ============================ */
// Hiển thị task từ hôm nay đến +N ngày (7/14/30), nhóm theo ngày, quá hạn riêng.
// Task thuộc tháng hiện tại đọc từ `state`; tháng khác đọc qua monthStateRaw (không tạo state mới).
let upcomingRange = 14;
const UPCOMING_RANGE_KEY = 'planner-upcoming-range';

try { const r = +localStorage.getItem(UPCOMING_RANGE_KEY); if (r === 7 || r === 14 || r === 30) upcomingRange = r; } catch (e) { /* ẩn */ }

function setUpcomingRange(n) {
  if (n !== 7 && n !== 14 && n !== 30) return;
  upcomingRange = n;
  try { localStorage.setItem(UPCOMING_RANGE_KEY, String(n)); } catch (e) { /* ẩn */ }
  renderUpcoming();
  trackEvent('upcoming_range', { days: n });
}

// Quy ước: task của ngày D nằm trong lưới tháng đang xem (PLAN_START → +NUM_WEEKS*7 ngày)
// nếu D nằm trong lưới đó — khớp cách view Lịch hiển thị (kể cả ngày ngoài tháng).
// Ngược lại đọc từ chính tháng của D (monthStateRaw — không tạo state mới cho tháng tương lai).
function tasksForDate(dt) {
  const inCur = Math.floor((dt - PLAN_START) / 86400000);
  if (inCur >= 0 && inCur < NUM_WEEKS * 7) {
    const w = state.weeks[Math.floor(inCur / 7)];
    const d = w && w.days && w.days[inCur % 7];
    return d ? { y: PLAN_YEAR, m: PLAN_MONTH, week: Math.floor(inCur / 7) + 1, day: inCur % 7, tasks: d.tasks || [] } : null;
  }
  const y = dt.getFullYear(), m = dt.getMonth();
  const first = new Date(y, m, 1);
  const dow = (first.getDay() + 6) % 7; // Thứ 2 = 0
  const start = new Date(first.getTime() - dow * 86400000);
  const dayIdx = Math.floor((dt - start) / 86400000);
  if (dayIdx < 0) return null;
  const st = monthStateRaw(y, m);
  if (!st) return null;
  const w = st.weeks && st.weeks[Math.floor(dayIdx / 7)];
  const d = w && w.days && w.days[dayIdx % 7];
  return d ? { y, m, week: Math.floor(dayIdx / 7) + 1, day: dayIdx % 7, tasks: d.tasks || [] } : null;
}

// Gom task từ PLAN_START (đầu lưới tháng đang xem) đến hôm qua → quá hạn (chưa xong).
function upcomingOverdueTasks() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out = [];
  const start = new Date(PLAN_START.getTime());
  const end = today.getTime() - 86400000; // hôm qua
  for (let t = start.getTime(); t <= end; t += 86400000) {
    const ref = tasksForDate(new Date(t));
    if (!ref) continue;
    (ref.tasks || []).forEach((tk, ti) => {
      if (!tk.done) out.push({ ...ref, task: ti, tk, date: new Date(t) });
    });
  }
  return out;
}

// Gom task từ hôm nay → +upcomingRange ngày. Không trùng task (mỗi ngày quét đúng 1 lần).
function upcomingCollect() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = [];
  for (let i = 0; i < upcomingRange; i++) {
    const dt = new Date(today.getTime() + i * 86400000);
    const ref = tasksForDate(dt);
    const list = ref ? (ref.tasks || []).map((tk, ti) => ({ ...ref, task: ti, tk, date: dt })) : [];
    // Sort: task có giờ theo giờ tăng dần; task không giờ nằm cuối ngày; done xếp dưới cùng.
    list.sort((a, b) => {
      const ad = a.tk.done ? 1 : 0, bd = b.tk.done ? 1 : 0;
      if (ad !== bd) return ad - bd;
      const at = a.tk.remind && a.tk.remind.enabled && a.tk.remind.time ? a.tk.remind.time : '99:99';
      const bt = b.tk.remind && b.tk.remind.enabled && b.tk.remind.time ? b.tk.remind.time : '99:99';
      return at.localeCompare(bt);
    });
    days.push({ date: dt, ref, tasks: list });
  }
  return days;
}

function upcomingDayHeader(dt, i) {
  if (i === 0) return t('upcomingTodayLabel');
  if (i === 1) return t('upcomingTomorrowLabel');
  return dt.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
}

// Meta gọn cho dòng Upcoming: giờ · thời lượng · P1 · deadline · repeat · tags.
function upcomingTaskMeta(tk) {
  const bits = [];
  const timed = tk.remind && tk.remind.enabled && tk.remind.time;
  if (timed) bits.push(timed);
  if (tk.duration) bits.push(t('pomoMinShort', { n: tk.duration }));
  if (tk.kind === 'priority') bits.push(t('taskPriorityLabel'));
  if (tk.deadline) bits.push(fmtDeadline(tk.deadline));
  if (tk.repeat && tk.repeat.freq) bits.push(t('repeatTitle'));
  const tags = Array.isArray(tk.tags) ? tk.tags : [];
  return { bits, tags };
}

function upcomingTaskRowHTML(r) {
  const { tk, date, y, m, week, day, task } = r;
  const data = `data-y="${y}" data-m="${m}" data-week="${week}" data-day="${day}" data-task="${task}"`;
  const { bits, tags } = upcomingTaskMeta(tk);
  const check = checkboxHTML(tk.kind === 'priority' ? 'pink' : 'blue', tk.done, `data-action="task" ${data}`, window.TaskFlowUI.checkboxLabel('task', tk.text, fmtDate(date)));
  const meta = bits.length ? `<span class="up-meta">${bits.map((b) => `<span>${esc(b)}</span>`).join('<span class="up-dot">·</span>')}</span>` : '';
  const tagsHTML = tags.length ? `<span class="task-tags">${tags.map((tg) => `<span class="tag-chip" data-tag="${esc(tg)}">#${esc(tg)}</span>`).join('')}</span>` : '';
  return `<div class="up-task-row${tk.done ? ' done' : ''}${tk.kind === 'priority' ? ' prio' : ''}">
    ${check}
    <span class="up-main" data-action="task-detail" ${data} role="button" tabindex="0"
      aria-label="${t('taskDetail')}: ${esc(tk.text || '')}">
      <span class="up-text">${esc(tk.text ?? '')}</span>
      ${meta}
      ${tagsHTML}
    </span>
    ${tk.done ? '' : `<button type="button" class="up-focus" data-action="focus-task" ${data} title="${t('taskFocusBtn')}" aria-label="${t('taskFocusBtn')}">${window.TaskFlowUI.icon('focus')}</button>`}
  </div>`;
}

function renderUpcoming() {
  const el = document.getElementById('view-upcoming');
  if (!el) return;
  const overdue = upcomingOverdueTasks();
  const days = upcomingCollect();
  const hasAny = overdue.length || days.some((d) => d.tasks.length);
  const rangeBtn = (n) => `<button type="button" class="up-range-btn${upcomingRange === n ? ' active' : ''}" data-action="upcoming-range" data-days="${n}" aria-pressed="${upcomingRange === n}">${t('upcomingRange' + n)}</button>`;
  const overdueHTML = overdue.length ? `<section class="up-group up-overdue" aria-label="${t('upcomingOverdueAria')}">
    <h2 class="up-group-head overdue"><span class="up-overdue-dot" aria-hidden="true"></span>${t('upcomingOverdue')}<span class="up-count">${overdue.length}</span></h2>
    <div class="up-group-body">${overdue.map((r) => upcomingTaskRowHTML(r)).join('')}</div>
  </section>` : '';
  const daysHTML = days.map((d, i) => {
    if (!d.tasks.length) return '';
    return `<section class="up-group" aria-label="${t('upcomingDayAria', { d: upcomingDayHeader(d.date, i) })}">
      <h2 class="up-group-head${i === 0 ? ' today' : ''}">${esc(upcomingDayHeader(d.date, i))}<span class="up-count">${d.tasks.length}</span></h2>
      <div class="up-group-body">${d.tasks.map((r) => upcomingTaskRowHTML(r)).join('')}</div>
    </section>`;
  }).join('');
  const emptyHTML = !hasAny ? emptyStateHTML('🗓️', 'upcomingEmpty', 'upcomingEmptySub', [
    { label: t('emptyPlanWeek'), action: 'nav', attrs: 'data-view="week"' },
  ]) : '';
  el.innerHTML = `<div class="upcoming-page">
    <header class="upcoming-header">
      <div>
        <p class="upcoming-eyebrow">${t('upcomingEyebrow')}</p>
        <h1 class="upcoming-title">${t('upcomingTitle')}</h1>
        <p class="upcoming-subtitle">${t('upcomingSubtitle')}</p>
      </div>
      <div class="up-range" role="group" aria-label="${t('upcomingRangeAria', { n: upcomingRange })}">
        ${rangeBtn(7)}${rangeBtn(14)}${rangeBtn(30)}
      </div>
    </header>
    ${overdueHTML}
    ${daysHTML}
    ${emptyHTML}
  </div>`;
}

/* ============================ Inbox — bắt nhanh ============================ */
// Row Inbox (inboxMeta/inboxTaskRowHTML) + renderInbox + inboxTargetForDate +
// scheduleInboxTask + addInboxTask + handleInboxAction được tách sang js/inbox.js
// (window.TaskFlowInbox) — P11 extraction 20. pushTaskToDate vẫn ở app.js (dùng chung
// với Quick Add), gọi inboxTargetForDate qua alias destructure ở trên.

// Đặt 1 task vào ngày dt (lưới tháng đúng — tháng khác tạo qua loadMonthStateOrCreate).
// Dùng chung cho: lên lịch từ Inbox, Quick Add. Trả về false nếu ngày không hợp lệ.
function pushTaskToDate(tk, dt) {
  const tgt = inboxTargetForDate(dt);
  if (!tgt) return false;
  const st = (tgt.y === PLAN_YEAR && tgt.m === PLAN_MONTH) ? state : loadMonthStateOrCreate(tgt.y, tgt.m);
  const w = st && st.weeks && st.weeks[tgt.week - 1];
  if (!w || !Array.isArray(w.days) || !w.days[tgt.day] || !Array.isArray(w.days[tgt.day].tasks)) return false;
  w.days[tgt.day].tasks.push(tk);
  if (tgt.y === PLAN_YEAR && tgt.m === PLAN_MONTH) save(); else saveMonthState(tgt.y, tgt.m, st);
  return true;
}

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
  if (td) td.classList.toggle('active', view === 'today');
  if (upc) upc.classList.toggle('active', view === 'upcoming');
  if (ibx) ibx.classList.toggle('active', view === 'inbox');
  ov.classList.toggle('active', view === 'overview');
  wk.classList.toggle('active', view === 'week');
  yr.classList.toggle('active', view === 'year');
  if (cal) cal.classList.toggle('active', view === 'calendar');
  if (dy) dy.classList.toggle('active', view === 'day');
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
  } else {
    yr.setAttribute('aria-labelledby', 'tab-year');
    renderYear();
  }
  // P12 (perf): DOM của view inactive là stale thuần — setView luôn re-render view đích
  // mỗi lần chuyển, nên xoá content các section ẩn để giảm memory/parse (trước đây
  // calendar giữ ~6.000 node ẩn chiếm RAM + chậm re-parse). Giữ attributes của section
  // (aria-labelledby, data-testid) — chỉ xoá children.
  const activeSectionId = 'view-' + view;
  [td, upc, ibx, ov, wk, yr, cal, dy].forEach((s) => {
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
  // Tháng mới → carry task lặp bị lỡ vào hôm nay ngay khi mở (nếu hôm nay thuộc tháng này)
  carryOverRepeatTasks();
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
  return {
    state: JSON.parse(JSON.stringify(state)),
    yearState: JSON.parse(JSON.stringify(yearState)),
    mood: typeof moodMap !== 'undefined' ? JSON.parse(JSON.stringify(moodMap)) : null,
    theme: (typeof THEME !== 'undefined' ? THEME : null) || null,
    plan: { y: PLAN_YEAR, m: PLAN_MONTH, cw: state.currentWeek },
    inbox: Array.isArray(inbox) ? JSON.parse(JSON.stringify(inbox)) : [],
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
  const ti = nowInfo(PLAN_START, NUM_DAYS);
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
  try { rotateBackup(collectAllData(LEGACY_KEY)); } catch (e) { /* ẩn */ }
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

/* ---------- Phase 6: Focus theo task + bộ đếm + nhật ký phiên ---------- */

// Ref tới task đang được focus (null = xem toàn bộ task hôm nay).
let focusTaskRef = null;

function openFocusMode(ref) {
  // ref có thể kèm y/m (từ Upcoming cho task tháng khác) hoặc scope=inbox — mặc định tháng hiện tại
  const newRef = ref ? (ref.scope === 'inbox'
    ? { scope: 'inbox', task: +ref.task }
    : {
      y: ref.y === undefined ? PLAN_YEAR : +ref.y,
      m: ref.m === undefined ? PLAN_MONTH : +ref.m,
      week: +ref.week, day: +ref.day, task: +ref.task,
    }) : null;
  focusMonthState = null;
  // Phase 6: chuyển sang task khác / xem tất cả → dừng bộ đếm (phiên thuộc về task đã bắt đầu)
  const switched = !!focusTaskRef && JSON.stringify(newRef) !== JSON.stringify(focusTaskRef);
  if (switched && focusTimer.running) {
    clearInterval(focusTimer.timer);
    focusTimer.timer = null;
    focusTimer.running = false;
    focusTimer.endAt = 0;
    focusTimer.left = focusTimer.dur;
  }
  focusTaskRef = newRef;
  document.body.classList.add('focus-mode');
  renderFocusContent();
  TaskFlowUI.openDialog('focusOverlay');
  trackEvent('focus_open');
}
function closeFocusMode() {
  document.body.classList.remove('focus-mode');
  TaskFlowUI.closeDialog('focusOverlay');
  // Bộ đếm vẫn chạy nền — mở lại focus sẽ thấy tiến trình còn lại
}
// State tháng chứa task đang focus khi ≠ tháng hiện tại (cache để focusLog ghi đúng tháng).
let focusMonthState = null;

function focusState() {
  if (!focusTaskRef) return null;
  if (focusTaskRef.scope === 'inbox') return state;
  if (focusTaskRef.y === PLAN_YEAR && focusTaskRef.m === PLAN_MONTH) return state;
  if (!focusMonthState) focusMonthState = monthStateRaw(focusTaskRef.y, focusTaskRef.m);
  return focusMonthState;
}

function saveFocusState() {
  if (!focusTaskRef) { save(); return; }
  if (focusTaskRef.scope === 'inbox') { saveInbox(inbox); return; }
  if (focusTaskRef.y === PLAN_YEAR && focusTaskRef.m === PLAN_MONTH) { save(); return; }
  if (focusMonthState) saveMonthState(focusTaskRef.y, focusTaskRef.m, focusMonthState);
}

function getFocusedTask() {
  if (!focusTaskRef) return null;
  if (focusTaskRef.scope === 'inbox') {
    const tk = inbox[focusTaskRef.task];
    return tk ? { w: null, d: null, tk, week: -1, day: -1, task: focusTaskRef.task } : null;
  }
  const st = focusState();
  if (!st) return null;
  const w = st.weeks && st.weeks[focusTaskRef.week - 1];
  if (!w) return null;
  const d = w.days && w.days[focusTaskRef.day];
  if (!d) return null;
  const tk = d.tasks && d.tasks[focusTaskRef.task];
  return tk ? { w, d, tk, week: focusTaskRef.week, day: focusTaskRef.day, task: focusTaskRef.task } : null;
}

// ---- Nhật ký phiên: mỗi task có focusLog = [{ d: 'YYYY-MM-DD', secs }] ----
function taskFocusLog(tk) { return Array.isArray(tk.focusLog) ? tk.focusLog : []; }
function taskFocusSecs(tk) { return taskFocusLog(tk).reduce((s, e) => s + (e.secs || 0), 0); }
function taskFocusToday(tk) {
  const k = pomoDateKey(new Date());
  return taskFocusLog(tk).filter((e) => e.d === k).reduce((s, e) => s + (e.secs || 0), 0);
}
function taskFocusSessions(tk) { return taskFocusLog(tk).length; }
function taskFocusMinLabel(secs) { return t('pomoMinShort', { n: Math.round((secs || 0) / 60) }); }

// ---- Bộ đếm focus (countdown theo preset, chính xác cả khi tab ẩn qua endAt) ----
const FOCUS_PRESETS = [5, 15, 25, 45];
let focusTimer = { running: false, dur: 25 * 60, left: 25 * 60, timer: null, endAt: 0, taskUid: null };

function focusTimerRender() {
  const mm = String(Math.floor(focusTimer.left / 60)).padStart(2, '0');
  const ss = String(focusTimer.left % 60).padStart(2, '0');
  const tEl = document.getElementById('focusTimerTime');
  if (tEl) tEl.textContent = mm + ':' + ss;
  const bEl = document.getElementById('focusTimerStart');
  if (bEl) bEl.textContent = focusTimer.running ? t('pomoPause') : t('pomoStart');
  document.querySelectorAll('#focusContent [data-action="focus-timer-set"]').forEach((btn) => {
    btn.classList.toggle('active', +btn.dataset.min * 60 === focusTimer.dur);
  });
}
function focusTimerSync() {
  if (!focusTimer.running) return;
  const left = Math.max(0, Math.ceil((focusTimer.endAt - Date.now()) / 1000));
  if (left <= 0) focusTimerComplete();
  else { focusTimer.left = left; focusTimerRender(); }
}
function focusTimerComplete() {
  clearInterval(focusTimer.timer);
  focusTimer.timer = null;
  focusTimer.running = false;
  const secs = focusTimer.dur;
  focusTimer.endAt = 0;
  // Ghi vào nhật ký của đúng task đã focus khi bắt đầu (theo uid — không lệch theo index).
  // Tìm trong state tháng chứa task (focusTaskRef có thể trỏ task tháng khác khi mở từ Upcoming).
  const byUid = getTaskByUid(focusTimer.taskUid);
  if (byUid) {
    byUid.focusLog = byUid.focusLog || [];
    byUid.focusLog.push({ d: pomoDateKey(new Date()), secs });
    // Giới hạn dung lượng localStorage — chỉ giữ 100 phiên gần nhất (UI chỉ hiện 5)
    if (byUid.focusLog.length > 100) byUid.focusLog = byUid.focusLog.slice(-100);
    saveFocusState();
  }
  // Đồng thời cộng vào thống kê pomo hôm nay (focus minutes + quả cà chua)
  pomoAddSession(secs);
  renderPomoWidgetStats();
  renderPomoTomatoCounter();
  focusTimer.left = focusTimer.dur;
  focusTimerRender();
  TaskFlowUI.toast(t('focusDone'), 'success');
  refreshFocusIfOpen();
  trackEvent('focus_session_complete', { secs });
}
function focusTimerStart() {
  if (focusTimer.running) {
    clearInterval(focusTimer.timer);
    focusTimer.timer = null;
    focusTimer.running = false;
    focusTimer.endAt = 0;
    focusTimerRender();
    return;
  }
  const g = getFocusedTask();
  if (g) focusTimer.taskUid = g.tk.uid;
  focusTimer.running = true;
  focusTimer.endAt = Date.now() + focusTimer.left * 1000;
  focusTimer.timer = setInterval(focusTimerSync, 1000);
  focusTimerRender();
  trackEvent('focus_timer_start', { dur: focusTimer.dur });
}
function focusTimerReset() {
  clearInterval(focusTimer.timer);
  focusTimer.timer = null;
  focusTimer.running = false;
  focusTimer.endAt = 0;
  focusTimer.left = focusTimer.dur;
  focusTimerRender();
}
function focusTimerSetDur(min) {
  clearInterval(focusTimer.timer);
  focusTimer.timer = null;
  focusTimer.running = false;
  focusTimer.endAt = 0;
  focusTimer.dur = Math.max(1, min) * 60;
  focusTimer.left = focusTimer.dur;
  focusTimerRender();
}

// Tìm task theo uid (bền vững khi index đổi do xoá/chèn).
function getTaskByUid(uid) {
  if (!uid) return null;
  // Tìm trong inbox trước (task chưa lên lịch), rồi state tháng hiện tại; nếu focus trỏ
  // task tháng khác thì tìm thêm trong focusMonthState.
  const hitInbox = inbox.find((tk) => tk && tk.uid === uid);
  if (hitInbox) return hitInbox;
  const sts = [state, focusMonthState].filter(Boolean);
  for (const st of sts) {
    if (!st || !Array.isArray(st.weeks)) continue;
    for (const w of st.weeks) {
      if (!w || !Array.isArray(w.days)) continue;
      for (const d of w.days) {
        if (!d || !Array.isArray(d.tasks)) continue;
        const hit = d.tasks.find((tk) => tk && tk.uid === uid);
        if (hit) return hit;
      }
    }
  }
  return null;
}

function renderFocusContent() {
  const box = document.getElementById('focusContent');
  if (!box) return;
  const now = new Date();
  const ti = nowInfo(PLAN_START, NUM_DAYS);
  const today = ti.inRange ? ti.dayInWeek : -1;
  const focused = getFocusedTask();
  if (focused) {
    const { w, tk, week, day, task } = focused;
    const totSecs = taskFocusSecs(tk);
    const todaySecs = taskFocusToday(tk);
    const count = taskFocusSessions(tk);
    const log = taskFocusLog(tk).slice(-5).reverse();
    box.innerHTML = `
      <p class="focus-date">📅 ${fmtDate(now)}</p>
      <div class="focus-taskview">
        <p class="focus-focusing">${t('focusFocusing')}</p>
        <div class="focus-tasktext ${tk.done ? 'done' : ''}">${checkboxHTML(tk.kind === 'priority' ? 'pink' : 'blue', tk.done, focusTaskRef.scope === 'inbox' ? `data-action="task" data-scope="inbox" data-task="${task}"` : `data-action="task" data-week="${week}" data-day="${day}" data-task="${task}" data-y="${focusTaskRef.y}" data-m="${focusTaskRef.m}"`, window.TaskFlowUI.checkboxLabel('task', tk.text, fmtDate(now)))}<span class="focus-tasktext-txt">${esc(tk.text) || '…'}</span></div>
        <div class="focus-timer">
          <div class="focus-timer-presets" role="group" aria-label="${t('focusTimer')}">
            ${FOCUS_PRESETS.map((m) => `<button type="button" class="focus-preset" data-action="focus-timer-set" data-min="${m}" ${m * 60 === focusTimer.dur ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${t('pomoMinShort', { n: m })}</button>`).join('')}
          </div>
          <div class="focus-timer-time" id="focusTimerTime">00:00</div>
          <div class="focus-timer-actions">
            <button type="button" class="pop-btn primary" data-action="focus-timer-start" id="focusTimerStart">${t('pomoStart')}</button>
            <button type="button" class="pop-btn" data-action="focus-timer-reset">${t('focusReset')}</button>
          </div>
        </div>
        <div class="focus-log">
          <h3 class="focus-sec-title">${t('focusLog')}</h3>
          ${count ? `<p class="focus-log-summary">${t('focusLogToday', { n: Math.round(todaySecs / 60), c: taskFocusLog(tk).filter((e) => e.d === pomoDateKey(now)).length })} · ${t('focusLogTotal', { n: Math.round(totSecs / 60) })}</p>` : ''}
          ${log.length ? `<ul class="focus-log-list">${log.map((e) => `<li class="focus-log-item">${esc(fmtSessionDate(e.d))} · ${taskFocusMinLabel(e.secs)}</li>`).join('')}</ul>` : `<p class="focus-empty">${t('focusNoSessions')}</p>`}
        </div>
        <button type="button" class="focus-showall" data-action="focus-show-all">${t('focusShowAll')}</button>
      </div>`;
    focusTimerRender();
    return;
  }
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

// 'YYYY-MM-DD' → nhãn phiên ngắn ('2/8' hay 'Thứ 3').
function fmtSessionDate(d) {
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(d);
  const dt = new Date(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(dt.getTime())) return String(d);
  const now = new Date();
  if (pomoDateKey(now) === d) return t('todayTxt');
  return dt.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'numeric' });
}

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
    runLazyModule('js/chat.min.js', () => window.TaskFlowChat.doChatSend());
    return;
  }
  else if (act === 'chat-suggest') {
    runLazyModule('js/chat.min.js', () => window.TaskFlowChat.doChatSuggest(el.dataset.topic));
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
    const ti = nowInfo(PLAN_START, NUM_DAYS);
    if (!ti.inRange) return;
    const w = state.weeks[ti.week - 1];
    const d = w.days[ti.dayInWeek];
    d.tasks.push({ uid: newTaskUid(), kind: 'regular', done: false, text: '', tags: [], remind: { enabled: false, time: '20:00' } });
    renderToday();
    save();
    trackEvent('create_task', { scope: 'today' });
    // Nhảy thẳng vào ô viết task mới để gõ luôn (Enter = xong)
    const fresh = document.querySelector(`[data-role="task-text"][data-week="${ti.week}"][data-day="${ti.dayInWeek}"][data-task="${d.tasks.length - 1}"]`);
    if (fresh) fresh.focus();
  } else if (act === 'addtask') {
    const w = state.weeks[+el.dataset.week - 1];
    const d = w.days[+el.dataset.day];
    d.tasks.push({ uid: newTaskUid(), kind: el.dataset.kind, done: false, text: '', tags: [], remind: { enabled: false, time: '20:00' } });
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
      const copy = { ...src, uid: newTaskUid(), done: false, text: src.text, carriedFrom: undefined };
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
    openStatsModal();
  } else if (act === 'stats-close') {
    closeStatsModal();
  } else if (act === 'stats-range') {
    if (el.dataset.range && statsRange !== el.dataset.range) {
      statsRange = el.dataset.range;
      renderStatsModal();
      // Sau khi re-render, nút vừa bấm bị thay thế — trả focus về nút active.
      const active = document.querySelector('#statsContent .stats-range-btn.active');
      if (active) active.focus();
    }
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
});

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
  if (t.dataset.reflectQ) {
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
  const ti = nowInfo(PLAN_START, NUM_DAYS);
  const jump = state.view === 'week' && ti.inRange && ti.week !== state.currentWeek && state.currentWeek === lastRealWeek;
  lastRealWeek = ti.inRange ? ti.week : null;
  if (monthKey(PLAN_YEAR, PLAN_MONTH) !== prevKey) {
    state = bootState();
    updateBrand(PLAN_YEAR, PLAN_MONTH);
    buildNav();
    setView(state.view, state.currentWeek);
  } else {
    if (jump) state.currentWeek = ti.week;
    carryOverRepeatTasks();
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
  if (!document.hidden) { syncNow(); pomoSync(); }
});
window.addEventListener('focus', () => { syncNow(); pomoSync(); });

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
  if (bm && !bm.hidden && e.target === bm) closeBackupModal();
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

const ti0 = nowInfo(PLAN_START, NUM_DAYS);
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
  if (dl.quick) window.__quickAddOnBoot = true;
  if (dl.view === 'day' && dl.week !== null && dl.week >= 1 && dl.week <= NUM_WEEKS) {
    state.dayWeek = dl.week;
    if (dl.day !== undefined && dl.day !== null && dl.day >= 0 && dl.day <= 6) state.dayDay = dl.day;
  }
  if (dl.view === 'calendar' && Array.isArray(dl.tags)) calendarTagFilters = dl.tags;
}

setTheme(THEME);
applyDark(DARK);
applyStaticI18N();
applySidebarCollapse();
updateBrand(PLAN_YEAR, PLAN_MONTH);
renderClock();
buildNav();
updateUndoButtons();
loadMood();
loadXP();
carryOverRepeatTasks();
renderXP();
setView(state.view, state.currentWeek);
setTimeout(() => runLazyModule('js/digest.min.js', () => window.TaskFlowDigest.updateDigestCache()), 2000);
// Manifest shortcut "Thêm công việc" (?quick=1) → mở Quick Add ngay sau khi view đầu render
if (window.__quickAddOnBoot) {
  setTimeout(() => runLazyModule('js/quick-add.min.js', () => window.TaskFlowQuickAdd.openQuickAdd()), 350);
  delete window.__quickAddOnBoot;
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
