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

const REFLECT_PROMPTS_MONTH = [
  'Điều gì tôi đã làm tốt và muốn tiếp tục phát huy?',
  'Bài học quan trọng nhất tôi rút ra được là gì?',
  'Tôi biết ơn về việc ...',
  'Ba mục tiêu tôi cần tập trung trong năm tiếp theo là?',
];
const REFLECT_PROMPTS_WEEK = [
  'Điều gì tôi đã làm tốt và muốn tiếp tục phát huy?',
  'Bài học quan trọng nhất tôi rút ra được là gì?',
  'Tôi biết ơn về việc ...',
  'Ba mục tiêu tôi cần tập trung trong tuần tiếp theo là?',
];

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
  const t = document.getElementById('brandTitle');
  if (t) t.textContent = MONTH_NAMES[PLAN_MONTH] + ' Planner';
  const s = document.getElementById('brandSub');
  if (s) s.textContent = 'Kế hoạch tháng ' + (PLAN_MONTH + 1) + ' · ' + PLAN_YEAR;
  document.title = MONTH_NAMES[PLAN_MONTH] + ' Planner 🐥';
}

/* ============================ Kế hoạch năm ============================ */

function yearKey() {
  return 'planner-year-' + new Date().getFullYear();
}

const YEAR_REFLECT_PROMPTS = [
  'Điều gì tôi đã làm tốt và muốn tiếp tục phát huy?',
  'Bài học quan trọng nhất tôi rút ra được là gì?',
  'Tôi biết ơn về việc ...',
  'Ba mục tiêu tôi cần tập trung trong năm tiếp theo là?',
];
const QUARTER_REFLECT_PROMPTS = [
  'Điều gì tôi đã làm tốt và muốn tiếp tục phát huy?',
  'Bài học quan trọng nhất tôi rút ra được là gì?',
  'Tôi biết ơn về việc ...',
  'Ba mục tiêu tôi cần tập trung trong quý tới là?',
];

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
    year: new Date().getFullYear(),
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
    if (!s || !Array.isArray(s.goals) || s.year !== new Date().getFullYear()) return null;
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

let yearState = loadYearState() || defaultYearState();

function saveYear() {
  try { localStorage.setItem(yearKey(), JSON.stringify(yearState)); } catch (e) { /* ẩn */ }
}

function yearGoalStats() {
  const total = yearState.goals.length;
  const done = yearState.goals.filter((g) => g.done).length;
  return { done, inProg: total - done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function monthPctOf(y, m) {
  let raw = null;
  try { raw = localStorage.getItem('planner-' + y + '-' + (m + 1)); } catch (e) { return defaultMonthPct(y, m); }
  if (!raw) return defaultMonthPct(y, m);
  try {
    const s = JSON.parse(raw);
    if (!Array.isArray(s.weeks) || !s.weeks.length) return defaultMonthPct(y, m);
    const pcts = s.weeks.map((w) => {
      const total = w.goals.length;
      const done = w.goals.filter((g) => g.done).length;
      return total ? Math.round((done / total) * 100) : 0;
    });
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  } catch (e) {
    return defaultMonthPct(y, m);
  }
}

function monthGoalsOf(y, m) {
  let raw = null;
  try { raw = localStorage.getItem('planner-' + y + '-' + (m + 1)); } catch (e) { /* ẩn */ }
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (Array.isArray(s.monthlyGoals) && s.monthlyGoals.length) return s.monthlyGoals;
    } catch (e) { /* ẩn */ }
  }
  return GOAL_DEFS.map(([text, kind, done], i) => ({ id: 'g' + i, text, kind, done }));
}

let yearMonthlyCache = null;
function yearMonthlyData() {
  if (!yearMonthlyCache) {
    yearMonthlyCache = Array.from({ length: 12 }, (_, m) => ({
      pct: monthPctOf(PLAN_YEAR, m),
      goals: monthGoalsOf(PLAN_YEAR, m),
    }));
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
      s = defaultState();
    } finally {
      restorePlan(prev);
    }
  }
  return s;
}

function saveMonthState(y, m, s) {
  try { localStorage.setItem('planner-' + y + '-' + (m + 1), JSON.stringify(s)); } catch (e) { /* ẩn */ }
}

function toggleMonthGoal(m, id) {
  const y = PLAN_YEAR;
  const s = loadMonthStateOrCreate(y, m);
  const g = s.monthlyGoals.find((x) => x.id === id);
  if (!g) return;
  g.done = !g.done;
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
  for (let i = 0; i < 3; i++) {
    const m = q * 3 + i;
    const s = loadMonthStateOrCreate(PLAN_YEAR, m);
    s.monthlyGoals.forEach((g) => { if (g.kind === kind && g.text === text) g.done = next; });
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
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="Biểu đồ tiến độ 12 tháng">
    <defs>
      <linearGradient id="lgYearLine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#F39A82" stop-opacity=".5"/>
        <stop offset="100%" stop-color="#F39A82" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${10},${h - 18} ${line} ${w - 10},${h - 18}" fill="url(#lgYearLine)"/>
    <polyline points="${line}" fill="none" stroke="#C88570" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${values.map((v, i) => `<circle cx="${pts[i].split(',')[0]}" cy="${pts[i].split(',')[1]}" r="3" fill="#fff" stroke="#C88570" stroke-width="2"><title>Tháng ${i + 1}: ${v}%</title></circle>`).join('')}
  </svg>`;
}

/* ============================ Tiện ích ============================ */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function seedHabitDays(targetPct) {
  const n = Math.round((NUM_DAYS * targetPct) / 100);
  return Array.from({ length: NUM_DAYS }, (_, i) => i < n);
}
function seedTasks(pct) {
  const checked = Math.round(pct / 20); // 0..5
  return Array.from({ length: 5 }, (_, i) => ({ kind: i < 2 ? 'priority' : 'regular', done: i < checked }));
}

function defaultState() {
  const ti = nowInfo();
  return {
    view: 'overview',
    currentWeek: ti.inRange ? ti.week : 1,
    goalTab: 'priority',
    monthKey: monthKey(),
    monthlyGoals: GOAL_DEFS.map(([text, kind, done], i) => ({ id: 'g' + i, text, kind, done })),
    habits: HABIT_DEFS.map(([name, target], i) => ({ id: 'h' + i, name, days: seedHabitDays(target) })),
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
    if (!raw && monthKey() === 'planner-2026-1') raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.monthlyGoals) || !Array.isArray(s.habits) || !Array.isArray(s.weeks)) return null;
    if (s.monthKey !== monthKey() || s.weeks.length !== NUM_WEEKS) return null;
    if (!s.reflections || !Array.isArray(s.reflections.weeks) || s.reflections.weeks.length !== NUM_WEEKS) s.reflections = defaultState().reflections;
    if (!s.goalTab) s.goalTab = 'priority';
    if (typeof s.currentWeek !== 'number' || s.currentWeek < 1 || s.currentWeek > NUM_WEEKS) s.currentWeek = 1;
    if (s.view !== 'overview' && s.view !== 'week' && s.view !== 'year') s.view = 'overview';
    return s;
  } catch (e) {
    return null;
  }
}

initPlan(new Date());
let state = loadState() || defaultState();

function save() {
  try { localStorage.setItem(monthKey(), JSON.stringify(state)); } catch (e) { /* ẩn */ }
}

/* ============================ Tính toán ============================ */

function habitPct(h) {
  return Math.round((h.days.filter(Boolean).length / NUM_DAYS) * 100);
}
function dayPct(day) {
  return Math.round((day.tasks.filter((t) => t.done).length / day.tasks.length) * 100);
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
  let sum = 0;
  state.habits.forEach((h) => { if (h.days[d]) sum++; });
  return Math.round((sum / state.habits.length) * 100);
}

function donutSVG(pct, size = 140, stroke = 18, color = '#F39A82') {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${pct}% hoàn thành">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(74,64,58,.12)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
      transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset .6s ease"/>
  </svg>`;
}

function checkboxHTML(mod, checked, attrs = '') {
  const cls = mod ? ` cb-${mod}` : '';
  return `<button type="button" class="checkbox${cls}" role="checkbox" aria-checked="${checked}" ${attrs}></button>`;
}

/* ============================ Trình bày ============================ */

function reflectionHTML(key, prompts) {
  const refs = key === 'ov' ? state.reflections.overview : state.reflections.weeks[state.currentWeek - 1];
  return `<h4 class="ref-title">Reflection</h4>
    ${prompts.map((p, i) => `<div class="ref-item">
      <p class="ref-prompt">${p}</p>
      <div class="ref-line" contenteditable="true" spellcheck="false" data-reflect="${key}-${i}" data-placeholder="Viết ở đây..." aria-label="Viết phản ánh ${i + 1}">${esc(refs[i])}</div>
    </div>`).join('')}`;
}

/* ---------- Tổng quan tháng ---------- */

function renderOverview() {
  const el = document.getElementById('view-overview');
  const ms = monthlyStats();
  el.innerHTML = `
    <div class="ov-top">
      ${dateCardHTML()}
      ${weeklyChartHTML()}
      ${sceneCardHTML()}
    </div>
    ${goalsPanelHTML(ms)}
    ${habitPanelHTML()}
  `;
}

function dateCardHTML() {
  return `<div class="card date-card">
    <div class="chick-orn orn-l" aria-hidden="true">🐥<span class="mini">🎧</span></div>
    <div class="chick-orn orn-r" aria-hidden="true">🐥<span class="mini">🎧</span></div>
    <h2 class="card-title">${MONTH_NAMES[PLAN_MONTH]} Planner</h2>
    <table class="info-table">
      <tr><th>Month</th><td>${PLAN_MONTH + 1}</td></tr>
      <tr><th>Year</th><td>${PLAN_YEAR}</td></tr>
      <tr><th>Current Week</th><td>
        <select class="week-select" data-action="weekselect" aria-label="Chọn tuần hiện tại">
          ${state.weeks.map((w) => `<option value="${w.n}" ${w.n === state.currentWeek ? 'selected' : ''}>Week ${w.n}</option>`).join('')}
        </select>
      </td></tr>
    </table>
  </div>`;
}

function weeklyChartHTML() {
  const levels = [100, 75, 50, 25, 0];
  const curWeek = nowInfo().week;
  return `<div class="card chart-card">
    <h3 class="card-title">Weekly Progress</h3>
    <div class="chart-wrap">
      <div class="chart-grid" aria-hidden="true">
        ${levels.map((l) => `<span class="gl" style="bottom:${l}%">${l}%</span><span class="gl-line" style="bottom:${l}%"></span>`).join('')}
      </div>
      <div class="bars">
        ${state.weeks.map((w) => {
          const st = weekStats(w);
          return `<button type="button" class="bar-col${w.n === curWeek ? ' current' : ''}" data-action="weekbar" data-week="${w.n}" title="Xem Tuần ${w.n}">
            <span class="bar-val">${st.pct}%</span>
            <span class="bar" style="height:${Math.max(st.pct, 4)}%"></span>
            <span class="bar-label">Week ${w.n}</span>
          </button>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

function sceneCardHTML() {
  return `<div class="card scene-card">
    <div class="scene">
      <div class="sky">
        <span class="sun" aria-hidden="true">☀️</span>
        <span class="cloud c1" aria-hidden="true">☁️</span>
        <span class="cloud c2" aria-hidden="true">☁️</span>
      </div>
      <div class="scene-tree" aria-hidden="true">
        <div class="leaf-blob b1"></div>
        <div class="leaf-blob b2"></div>
        <div class="leaf-blob b3"></div>
        <div class="trunk"></div>
        <div class="swing">
          <span class="rope r1"></span>
          <span class="rope r2"></span>
          <span class="seat"></span>
        </div>
      </div>
      <div class="window" aria-hidden="true">
        <div class="win-sky"></div>
        <div class="win-shelf"></div>
        <span class="win-rabbit">🐰</span>
        <div class="win-frame"></div>
      </div>
      <div class="grass">
        <span class="g-critter" aria-hidden="true">🐥</span>
        <span class="g-critter" aria-hidden="true">🦫</span>
        <span class="g-flower" aria-hidden="true">🌸</span>
      </div>
    </div>
    <div class="chick-row" aria-label="10 chú gà con">
      ${Array.from({ length: 10 }, () => `<span class="chick-unit" aria-hidden="true">🐥<span class="chick-phones">🎧</span></span>`).join('')}
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
        <div class="peek-chick" aria-hidden="true">🐥<span class="mini">📷</span></div>
        <div class="big-pct" data-role="big-pct">${pct}%</div>
        <h3 class="card-title">January Goals</h3>
        <table class="stats-table">
          <tr><th>Completed</th><th>In Progress</th><th>Total</th></tr>
          <tr data-role="ov-stats"><td>${ms.done}</td><td>${ms.inProg}</td><td>${ms.total}</td></tr>
        </table>
      </div>
      <div class="goals-donut sub">
        <div class="donut-wrap">
          <div class="donut" data-role="ov-donut">${donutSVG(pct, 140, 18, '#666854')}</div>
          <div class="donut-center"><span data-role="big-pct">${pct}%</span><small>mục tiêu</small></div>
        </div>
      </div>
      <div class="goal-list sub">
        <div class="goal-group-dual">
          <div class="goal-block">
            <div class="v-strip pink"><span>Priority</span></div>
            <ul class="goal-items">
              ${priGoals.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">
                ${checkboxHTML('pink', g.done, `data-action="goal" data-id="${g.id}"`)}
                <span class="g-text" data-role="goal-text" data-id="${g.id}">${esc(g.text)}</span>
              </li>`).join('')}
            </ul>
          </div>
          <div class="goal-block">
            <div class="v-strip blue"><span>Regular</span></div>
            <ul class="goal-items">
              ${regGoals.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">
                ${checkboxHTML('blue', g.done, `data-action="goal" data-id="${g.id}"`)}
                <span class="g-text" data-role="goal-text" data-id="${g.id}">${esc(g.text)}</span>
              </li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
      <div class="reflection sub">${reflectionHTML('ov', REFLECT_PROMPTS_MONTH)}</div>
    </div>
  </div>`;
}

function habitPanelHTML() {
  const dayBars = Array.from({ length: NUM_DAYS }, (_, d) => dayAggregate(d));
  const habitToday = nowInfo().habitCol;
  return `<div class="card habit-panel">
    <div class="habit-title-row">
      <div class="bear-wrap" aria-hidden="true"><span class="bear">🐻</span><span class="apple">🍎</span></div>
      <div>
        <h3 class="card-title">Habit</h3>
      </div>
      <div class="habit-legend">
        <span class="dot on"></span> Hoàn thành
        <span class="dot off"></span> Chưa
      </div>
    </div>
    <div class="habit-layout">
      <div class="habit-table-wrap">
        <table class="habit-table">
          <thead>
            <tr class="mini-bar-tr">
              <th class="sticky name-col" aria-hidden="true"></th>
              <th class="sticky pct-col" aria-hidden="true"></th>
              ${dayBars.map((p, d) => `<th class="mini-th"><span class="mini-bar" data-role="day-mini" data-day="${d}" style="height:${Math.max(p, 4)}%"></span></th>`).join('')}
            </tr>
            <tr class="day-num-tr">
              <th class="sticky name-col">Habit</th>
              <th class="sticky pct-col">%</th>
              ${Array.from({ length: NUM_DAYS }, (_, d) => `<th class="day-num${d === habitToday ? ' today' : ''}">${d + 1}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${state.habits.map((h) => {
              const p = habitPct(h);
              return `<tr>
                <td class="sticky name-col">${esc(h.name)}</td>
                <td class="sticky pct-col"><b data-role="habit-pct" data-id="${h.id}">${p}%</b></td>
                ${h.days.map((v, d) => `<td class="day-cell${d === habitToday ? ' today' : ''}">${checkboxHTML('', v, `data-action="habit" data-id="${h.id}" data-day="${d}"`)}</td>`).join('')}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="habit-chart">
        ${state.habits.map((h) => {
          const p = habitPct(h);
          return `<div class="hbar-row">
            <span class="hbar-label" title="${esc(h.name)}">${esc(h.name)}</span>
            <div class="hbar-track"><div class="hbar" data-role="habit-bar" data-id="${h.id}" style="width:${p}%"></div></div>
            <span class="hbar-val" data-role="habit-bar-val" data-id="${h.id}">${p}%</span>
          </div>`;
        }).join('')}
        <div class="hbar-axis"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
      </div>
    </div>
  </div>`;
}

/* ---------- Kế hoạch năm ---------- */

function renderYear() {
  invalidateYearCache();
  const el = document.getElementById('view-year');
  const gs = yearGoalStats();
  el.innerHTML = `
    <div class="year-top">
      ${yearCardHTML()}
      ${yearChartsHTML()}
    </div>
    ${yearGoalsCardHTML(gs)}
    ${yearOverviewReflectionHTML()}
    ${yearQuartersHTML()}
    ${yearMonthsHTML()}
    ${yearReflectionsHTML()}
  `;
}

function yearCardHTML() {
  const now = new Date();
  return `<div class="card year-card">
    <div class="chick-orn orn-l" aria-hidden="true">🐥<span class="mini">🎧</span></div>
    <div class="chick-orn orn-r" aria-hidden="true">🐥<span class="mini">🎧</span></div>
    <h2 class="card-title">${now.getFullYear()} Planner</h2>
    <table class="info-table">
      <tr><th>Year</th><td>${now.getFullYear()}</td></tr>
      <tr><th>Current Month</th><td>${now.getMonth() + 1}</td></tr>
    </table>
    <p class="year-motto">4 điều bạn sẽ không bao giờ hối tiếc:<br>🌱 Sống kín đáo · 📚 Sống kỷ luật · 💼 Chăm lo chuyện của mình · 💛 Yêu thương bản thân</p>
    <div class="chick-row" aria-label="12 chú gà con">
      ${Array.from({ length: 12 }, () => `<span class="chick-unit" aria-hidden="true">🐥<span class="chick-phones">🎧</span></span>`).join('')}
    </div>
  </div>`;
}

function yearGoalsCardHTML(gs) {
  const y = new Date().getFullYear();
  const pri = yearState.goals.filter((g) => g.kind === 'priority');
  const reg = yearState.goals.filter((g) => g.kind === 'regular');
  return `<div class="card year-goals-card">
    <div class="year-goals-top">
      <div class="goals-info sub">
        <div class="peek-chick" aria-hidden="true">🐥<span class="mini">📷</span></div>
        <div class="big-pct" data-role="year-big-pct">${gs.pct}%</div>
        <h3 class="card-title">${y} Goals</h3>
        <table class="stats-table">
          <tr><th>Completed</th><th>In Progress</th><th>Total</th></tr>
          <tr data-role="year-stats"><td>${gs.done}</td><td>${gs.inProg}</td><td>${gs.total}</td></tr>
        </table>
        <button type="button" class="ydata-btn" data-action="pullyear" title="Gộp mục tiêu từ dữ liệu đã lưu của 12 tháng">📥 Lấy dữ liệu từ 12 tháng từ Dashboard</button>
      </div>
      <div class="goals-donut sub">
        <div class="donut-wrap">
          <div class="donut" data-role="year-donut">${donutSVG(gs.pct, 140, 18, '#666854')}</div>
          <div class="donut-center"><span data-role="year-big-pct">${gs.pct}%</span><small>mục tiêu</small></div>
        </div>
      </div>
      <div class="goal-list sub">
        <div class="goal-group-dual">
          <div class="goal-block">
            <div class="v-strip pink"><span>Priority</span></div>
            <ul class="goal-items">
              ${pri.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">
                ${checkboxHTML('pink', g.done, `data-action="ygoal" data-id="${g.id}"`)}
                <span class="g-text" data-role="y-goal-text" data-id="${g.id}">${esc(g.text)}</span>
              </li>`).join('')}
            </ul>
          </div>
          <div class="goal-block">
            <div class="v-strip blue"><span>Regular</span></div>
            <ul class="goal-items">
              ${reg.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">
                ${checkboxHTML('blue', g.done, `data-action="ygoal" data-id="${g.id}"`)}
                <span class="g-text" data-role="y-goal-text" data-id="${g.id}">${esc(g.text)}</span>
              </li>`).join('')}
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
    <div class="charts-head"><h3 class="card-title">Progress cả năm</h3><span class="bear-big" aria-hidden="true">🐻</span></div>
    <div class="mini-chart-block">
      <div class="mini-chart-title">Quý</div>
      <div class="chart-row chart-row-q">
        ${quarters.map((p, i) => `<div class="bar-col" title="Q${i + 1}: ${p}%"><span class="bar-val">${p}%</span><span class="bar" style="height:${Math.max(p, 4)}%"></span><span class="bar-label">Q${i + 1}</span></div>`).join('')}
      </div>
    </div>
    <div class="mini-chart-block">
      <div class="mini-chart-title">12 tháng</div>
      <div class="chart-row chart-row-m">
        ${monthly.map((md, i) => `<div class="bar-col" title="Tháng ${i + 1}: ${md.pct}%"><span class="bar-val">${md.pct}%</span><span class="bar" style="height:${Math.max(md.pct, 4)}%"></span><span class="bar-label">T${i + 1}</span></div>`).join('')}
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
        <h4 class="ref-title">Reflection</h4>
        ${YEAR_REFLECT_PROMPTS.map((p, i) => `<div class="ref-item">
          <p class="ref-prompt">${p}</p>
          <div class="ref-line" contenteditable="true" spellcheck="false" data-reflect="yr-${i}" data-placeholder="Viết ở đây..." aria-label="Viết phản ánh năm mục ${i + 1}">${esc(refs[i])}</div>
        </div>`).join('')}
      </div>
      <div class="sub year-line-card">
        <h4 class="ref-title">Tiến độ 12 tháng</h4>
        ${lineChartSVG(vals)}
        <div class="line-labels">${Array.from({ length: 12 }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>
      </div>
    </div>
  </div>`;
}

function yearQuartersHTML() {
  const qs = quarterStats();
  return `<div class="year-quarters-card">
    <h3 class="card-title">Tổng quan theo quý</h3>
    <div class="quarters-grid">
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
            <tr><th>Completed</th><th>In Progress</th><th>Total</th></tr>
            <tr><td>${q.done}</td><td>${q.inProg}</td><td>${q.total}</td></tr>
          </table>
          <div class="q-lists">
            <div class="q-block">
              <div class="v-strip pink"><span>Priority</span></div>
              <ul class="goal-items q-items">
                ${pri.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">${checkboxHTML('pink', g.done, `data-action="qgoal" data-q="${i}" data-key="${esc(g.kind + '|' + g.text)}"`)}<span class="g-text">${esc(g.text)}</span></li>`).join('')}
              </ul>
            </div>
            <div class="q-block">
              <div class="v-strip blue"><span>Regular</span></div>
              <ul class="goal-items q-items">
                ${reg.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">${checkboxHTML('blue', g.done, `data-action="qgoal" data-q="${i}" data-key="${esc(g.kind + '|' + g.text)}"`)}<span class="g-text">${esc(g.text)}</span></li>`).join('')}
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
    <h3 class="card-title">12 Tháng · Mục tiêu &amp; ghi chú theo tháng</h3>
    <div class="months-scroll">
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
            <button type="button" class="ym-name" data-action="month" data-month="${m}" title="Mở kế hoạch tháng ${m + 1}">Tháng ${m + 1}${m === realM ? '<small> · nay</small>' : ''}</button>
            <span class="ym-pct" data-role="ym-pct" data-month="${m}">${p}%</span>
          </div>
          <div class="ym-bar-wrap"><div class="ym-bar" style="height:${Math.max(p, 4)}%"></div></div>
          <div class="ym-lists">
            <div class="ym-block">
              <div class="v-strip pink"><span>Priority</span></div>
              <ul class="goal-items ym-items">
                ${pri.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">${checkboxHTML('pink', g.done, `data-action="mgoal" data-month="${m}" data-id="${g.id}"`)}<span class="g-text">${esc(g.text)}</span></li>`).join('')}
              </ul>
            </div>
            <div class="ym-block">
              <div class="v-strip blue"><span>Regular</span></div>
              <ul class="goal-items ym-items">
                ${reg.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">${checkboxHTML('blue', g.done, `data-action="mgoal" data-month="${m}" data-id="${g.id}"`)}<span class="g-text">${esc(g.text)}</span></li>`).join('')}
              </ul>
            </div>
          </div>
          <div class="ym-note">
            <div class="note-banner">Note</div>
            <div class="note-area ym-note-area" contenteditable="true" spellcheck="false" data-ynote="${m}" data-placeholder="..." aria-label="Ghi chú tháng ${m + 1}">${esc(yearState.monthNotes[m]).replace(/\n/g, '<br>')}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function yearReflectionHTML(qn) {
  const refs = yearState.reflections['q' + qn];
  return `<h4 class="ref-title">Reflection Q${qn}</h4>
    ${QUARTER_REFLECT_PROMPTS.map((p, i) => `<div class="ref-item">
      <p class="ref-prompt">${p}</p>
      <div class="ref-line" contenteditable="true" spellcheck="false" data-reflect="yq${qn}-${i}" data-placeholder="Viết ở đây..." aria-label="Viết phản ánh quý ${qn} mục ${i + 1}">${esc(refs[i])}</div>
    </div>`).join('')}`;
}

function yearReflectionsHTML() {
  return `<div class="card year-reflections-card">
    <h3 class="card-title">Reflection quý</h3>
    <div class="year-reflections">
      ${[1, 2, 3, 4].map((q) => `<div class="reflection sub">${yearReflectionHTML(q)}</div>`).join('')}
    </div>
  </div>`;
}

/* ---------- Trang tuần ---------- */

function renderWeek() {
  const el = document.getElementById('view-week');
  const w = state.weeks[state.currentWeek - 1];
  const st = weekStats(w);
  const ti = nowInfo();
  el.innerHTML = `
    <div class="week-banner">
      <h2>🌸 Week Goals & Tasks 🌸</h2>
      ${ti.inRange ? '' : `<p class="week-range-note">Hôm nay (${fmtDate(ti.now)}) nằm ngoài phạm vi kế hoạch (${fmtDate(PLAN_START)} – ${fmtDate(PLAN_END)})</p>`}
    </div>
    <div class="week-head">
      <div class="card week-title-card">
        <div class="w-top-bar">
          <div class="w-bar-fill" data-role="w-bar-fill" style="width:${st.pct}%"></div>
          <span class="w-chick-on-bar" aria-hidden="true">🐥<span class="gun">🔫</span></span>
          <span class="week-pct-text" data-role="w-badge">${st.pct}%</span>
        </div>
        <h2 class="card-title">Week ${w.n}</h2>
        <table class="stats-table">
          <tr><th>Completed</th><th>In Progress</th><th>Total</th></tr>
          <tr data-role="w-stats"><td>${st.done}</td><td>${st.inProg}</td><td>${st.total}</td></tr>
        </table>
        <div class="week-nav">
          <button type="button" class="btn-nav" data-action="prev" ${state.currentWeek === 1 ? 'disabled' : ''}>‹ Tuần trước</button>
          <button type="button" class="btn-nav" data-action="next" ${state.currentWeek === NUM_WEEKS ? 'disabled' : ''}>Tuần sau ›</button>
        </div>
      </div>
      <div class="card donut-card">
        <div class="donut-wrap">
          <div class="donut" data-role="w-donut">${donutSVG(st.pct, 140, 18, '#F39A82')}</div>
          <div class="donut-center"><span data-role="w-badge">${st.pct}%</span></div>
        </div>
      </div>
      <div class="card legend-card">${weeklyGoalsHTML(w)}</div>
      <div class="card reflection sub">${reflectionHTML('w' + w.n, REFLECT_PROMPTS_WEEK)}</div>
    </div>
    <div class="days-grid">
      ${w.days.map((d, di) => dayColumnHTML(w, di, ti.inRange && ti.dayInWeek === di)).join('')}
    </div>`;
}

function weeklyGoalsHTML(w) {
  const pri = w.goals.map((g, gi) => ({ g, gi })).filter((x) => x.g.kind === 'priority');
  const reg = w.goals.map((g, gi) => ({ g, gi })).filter((x) => x.g.kind === 'regular');
  return `<div class="legend-groups">
      <div class="legend-col">
        <div class="v-strip pink"><span>Priority</span></div>
        <div class="legend-goals">
          <span class="section-sub-title">Mục tiêu ưu tiên</span>
          ${pri.length ? pri.map(({ g, gi }) => `<div class="legend-goal">
            ${checkboxHTML('pink', g.done, `data-action="wgoal" data-week="${w.n}" data-id="${gi}"`)}
            <span class="g-text" data-role="w-goal-text" data-week="${w.n}" data-id="${gi}">${esc(g.text)}</span>
          </div>`).join('') : '<div class="legend-goal-empty"></div>'}
        </div>
      </div>
      <div class="legend-col">
        <div class="v-strip blue"><span>Regular</span></div>
        <div class="legend-goals">
          <span class="section-sub-title">Mục tiêu thường</span>
          ${reg.length ? reg.map(({ g, gi }) => `<div class="legend-goal">
            ${checkboxHTML('blue', g.done, `data-action="wgoal" data-week="${w.n}" data-id="${gi}"`)}
            <span class="g-text" data-role="w-goal-text" data-week="${w.n}" data-id="${gi}">${esc(g.text)}</span>
          </div>`).join('') : '<div class="legend-goal-empty"></div>'}
        </div>
      </div>
    </div>`;
}

function dayColumnHTML(w, di, isToday) {
  const d = w.days[di];
  const p = dayPct(d);
  const pri = d.tasks.map((t, ti) => ({ t, ti })).filter((x) => x.t.kind === 'priority');
  const reg = d.tasks.map((t, ti) => ({ t, ti })).filter((x) => x.t.kind === 'regular');
  return `<div class="day-col day-col-${di}${isToday ? ' today' : ''}">
    <div class="day-head">
      <span class="fruit" aria-hidden="true">${DAYS[di].icon}</span>
      <span class="day-name">${DAYS[di].name}</span>
      <span class="day-date">${d.date}/${d.yy}</span>
      ${isToday ? '<span class="today-badge">Hôm nay</span>' : ''}
    </div>
    <div class="day-visual-block">
      ${d.sticky ? `<div class="sticky-note-box"><span>${esc(d.sticky)}</span></div>` : `
        <div class="day-vert-bar-wrap">
          <div class="day-vert-bar" style="height:${Math.max(p, 4)}%"></div>
        </div>
      `}
      <div class="day-pct-label" data-role="day-pct" data-day="${di}">${p}%</div>
    </div>
    <div class="day-tasks">
      <div class="task-group">
        <div class="v-strip pink"><span>Priority</span></div>
        <div class="task-rows">
          <span class="task-sub-head">Task ưu tiên</span>
          ${pri.map(({ t, ti }) => taskRowHTML(w.n, di, ti, 'pink', t)).join('')}
        </div>
      </div>
      <div class="task-group">
        <div class="v-strip blue"><span>Regular</span></div>
        <div class="task-rows">
          <span class="task-sub-head">Task thường</span>
          ${reg.map(({ t, ti }) => taskRowHTML(w.n, di, ti, 'blue', t)).join('')}
        </div>
      </div>
    </div>
    <div class="day-note">
      <div class="note-banner">Note</div>
      <div class="note-area" contenteditable="true" spellcheck="false" data-note="${w.n}-${di}" data-placeholder="..." aria-label="Ghi chú ${DAYS[di].name}">${esc(d.note).replace(/\n/g, '<br>')}</div>
    </div>
  </div>`;
}

function taskRowHTML(wn, di, ti, mod, task) {
  return `<div class="task-row">
    ${checkboxHTML(mod, task.done, `data-action="task" data-week="${wn}" data-day="${di}" data-task="${ti}"`)}
    <span class="dotted-line" aria-hidden="true"></span>
  </div>`;
}

/* ============================ Điều hướng ============================ */

function buildNav() {
  const nav = document.getElementById('navTabs');
  nav.innerHTML = `
    <button type="button" class="tab" role="tab" id="tab-overview" aria-controls="view-overview" data-action="nav" data-view="overview">📅 Tổng quan tháng</button>
    <button type="button" class="tab" role="tab" id="tab-year" aria-controls="view-year" data-action="nav" data-view="year">🗓️ Năm ${new Date().getFullYear()}</button>
    ${state.weeks.map((w) => `<button type="button" class="tab" role="tab" id="tab-week-${w.n}" aria-controls="view-week" data-action="nav" data-view="week" data-week="${w.n}">Tuần ${w.n}</button>`).join('')}
  `;
}
function updateNav() {
  document.querySelectorAll('#navTabs .tab').forEach((b) => {
    const active = b.dataset.view === state.view && (!b.dataset.week || +b.dataset.week === state.currentWeek);
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active);
  });
}
function setView(view, week) {
  state.view = view;
  if (week) state.currentWeek = week;
  updateNav();
  const ov = document.getElementById('view-overview');
  const wk = document.getElementById('view-week');
  const yr = document.getElementById('view-year');
  ov.classList.toggle('active', view === 'overview');
  wk.classList.toggle('active', view === 'week');
  yr.classList.toggle('active', view === 'year');
  if (view === 'overview') {
    ov.setAttribute('aria-labelledby', 'tab-overview');
    renderOverview();
  } else if (view === 'week') {
    wk.setAttribute('aria-labelledby', 'tab-week-' + state.currentWeek);
    renderWeek();
  } else {
    yr.setAttribute('aria-labelledby', 'tab-year');
    renderYear();
  }
  save();
}
function goWeek(v) {
  const n = Math.min(NUM_WEEKS, Math.max(1, v));
  setView('week', n);
}
function openMonth(m) {
  const now = new Date();
  if (m === now.getMonth() && PLAN_YEAR === now.getFullYear()) viewedMonth = null;
  else viewedMonth = m;
  initPlan(new Date(now.getFullYear(), m, 1));
  state = loadState() || defaultState();
  state.view = 'overview';
  updateBrand();
  updateNowBtn();
  buildNav();
  setView('overview', state.currentWeek);
}
function updateNowBtn() {
  const b = document.getElementById('btnNow');
  if (b) b.hidden = viewedMonth === null;
}

/* ============================ Sự kiện ============================ */

document.addEventListener('click', (e) => {
  if (e.target.closest('select')) return;
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const act = el.dataset.action;

  if (act === 'nav') setView(el.dataset.view, +el.dataset.week || undefined);
  else if (act === 'prev') goWeek(state.currentWeek - 1);
  else if (act === 'next') goWeek(state.currentWeek + 1);
  else if (act === 'weekbar') goWeek(+el.dataset.week);
  else if (act === 'goal') {
    const g = state.monthlyGoals.find((x) => x.id === el.dataset.id);
    if (g) { g.done = !g.done; afterGoalToggle(g); }
  } else if (act === 'ygoal') {
    const g = yearState.goals.find((x) => x.id === el.dataset.id);
    if (g) { g.done = !g.done; afterYearGoalToggle(); }
  } else if (act === 'month') {
    openMonth(+el.dataset.month);
  } else if (act === 'gotoday') {
    openMonth(new Date().getMonth());
  } else if (act === 'pullyear') {
    pullYearGoalsFromMonths();
  } else if (act === 'mgoal') {
    toggleMonthGoal(+el.dataset.month, el.dataset.id);
  } else if (act === 'qgoal') {
    toggleQuarterGoal(+el.dataset.q, el.dataset.key);
  } else if (act === 'habit') {
    const h = state.habits.find((x) => x.id === el.dataset.id);
    if (h) { h.days[+el.dataset.day] = !h.days[+el.dataset.day]; afterHabitToggle(); }
  } else if (act === 'wgoal') {
    const w = state.weeks[+el.dataset.week - 1];
    const g = w.goals[+el.dataset.id];
    if (g) { g.done = !g.done; afterWGoalToggle(w); }
  } else if (act === 'task') {
    const w = state.weeks[+el.dataset.week - 1];
    const d = w.days[+el.dataset.day];
    const t = d.tasks[+el.dataset.task];
    if (t) { t.done = !t.done; refreshTaskUI(w, +el.dataset.day); save(); }
  } else if (act === 'reset') {
    if (confirm('Xoá toàn bộ dữ liệu đã lưu và đặt lại mặc định?')) {
      try {
        localStorage.removeItem(monthKey());
        localStorage.removeItem(LEGACY_KEY);
        localStorage.removeItem(yearKey());
      } catch (err) { /* ẩn */ }
      yearState = defaultYearState();
      state = defaultState();
      setView(state.view, state.currentWeek);
    }
  }
});

document.addEventListener('change', (e) => {
  if (e.target.dataset && e.target.dataset.action === 'weekselect') goWeek(+e.target.value);
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.reflect) {
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
  }
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
  const tab = e.target.closest('#navTabs .tab');
  if (!tab || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const tabs = Array.from(document.querySelectorAll('#navTabs .tab'));
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
  saveYear();
}

function afterHabitToggle() {
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
  save();
}

function afterWGoalToggle(w) {
  const st = weekStats(w);
  document.querySelectorAll('[data-role="w-badge"]').forEach((b) => { b.textContent = st.pct + '%'; });
  const fill = document.querySelector('[data-role="w-bar-fill"]');
  if (fill) fill.style.width = st.pct + '%';
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
  const vertBar = document.querySelector(`.day-col-${di} .day-vert-bar`);
  if (vertBar) vertBar.style.height = Math.max(p, 4) + '%';
}

/* ============================ Đồng bộ thời gian thực ============================ */

const fmtDate = (d) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

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
  box.textContent = fmtDate(n) + ' · ' + n.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

let lastDayKey = '';
let lastRealWeek = null;
let viewedMonth = null;

function refreshToday() {
  const now = new Date();
  if (viewedMonth !== null) {
    if (viewedMonth === now.getMonth() && PLAN_YEAR === now.getFullYear()) {
      viewedMonth = null;
      initPlan(now);
      state = loadState() || defaultState();
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
    state = defaultState();
    updateBrand();
    buildNav();
    setView(state.view, state.currentWeek);
  } else {
    if (jump) state.currentWeek = ti.week;
    if (state.view === 'week') renderWeek();
    else if (state.view === 'overview') renderOverview();
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

/* ============================ Khởi động ============================ */

const ti0 = nowInfo();
if (ti0.inRange) state.currentWeek = ti0.week;
lastRealWeek = ti0.inRange ? ti0.week : null;
lastDayKey = ti0.now.toDateString();
updateBrand();
updateNowBtn();
renderClock();
buildNav();
setView(state.view, state.currentWeek);
