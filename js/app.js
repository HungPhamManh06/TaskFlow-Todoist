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
  document.title = 'TaskFlow-Todoist 🐥';
  buildMonthNav();
}

function buildMonthNav() {
  const sel = document.getElementById('monthSelect');
  if (!sel) return;
  sel.innerHTML = MONTH_NAMES.map((n, m) => `<option value="${m}" ${m === PLAN_MONTH ? 'selected' : ''}>${t('monthOption', { m: monthLabel(m), n: m + 1, y: PLAN_YEAR })}</option>`).join('');
}

/* ============================ Kế hoạch năm ============================ */

function yearKey() {
  return 'planner-year-' + new Date().getFullYear();
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
    const pcts = s.weeks.map((w) => {
      const total = w.goals.length;
      const done = w.goals.filter((g) => g.done).length;
      return total ? Math.round((done / total) * 100) : 0;
    });
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
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

/* ============================ i18n VI/EN ============================ */

const MONTH_NAMES_VI = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

const I18N = {
  vi: {
    navMonths: 'Chuyển tháng trong năm',
    prevMonth: 'Tháng trước',
    nextMonth: 'Tháng sau',
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
    viewYear: 'Kế hoạch năm',
    viewWeek: 'Kế hoạch tuần',
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
    habitPh: 'Tên thói quen mới...',
    habitNameAria: 'Tên thói quen mới',
    addHabitTxt: '＋ Thêm thói quen',
    renameAria: 'Đổi tên',
    delAria: 'Xoá',
    noHabits: 'Chưa có thói quen nào — thêm một thói quen mới nhé 🐥',
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
    motto: '4 điều bạn sẽ không bao giờ hối tiếc:<br>🌱 Sống kín đáo · 📚 Sống kỷ luật · 💼 Chăm lo chuyện của mình · 💛 Yêu thương bản thân',
    chicks12Aria: '12 chú gà con',
    pullBtn: '📥 Lấy dữ liệu từ 12 tháng từ Dashboard',
    yGoalPh: 'Viết mục tiêu...',
    yGoalAria: 'Mục tiêu năm',
    addPriGoalAria: 'Thêm mục tiêu ưu tiên',
    addRegGoalAria: 'Thêm mục tiêu thường',
    progressYear: 'Progress cả năm',
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
    weekRange: 'Hôm nay ({a}) nằm ngoài phạm vi kế hoạch ({b} – {c})',
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
    importError: 'File không hợp lệ — không phải file sao lưu TaskFlow-Todoist.',
    importOk: 'Đã nhập dữ liệu thành công! Trang sẽ tải lại.',
    rm0: 'Điều gì tôi đã làm tốt và muốn tiếp tục phát huy?',
    rm1: 'Bài học quan trọng nhất tôi rút ra được là gì?',
    rm2: 'Tôi biết ơn về việc ...',
    rm3: 'Ba mục tiêu tôi cần tập trung trong năm tiếp theo là?',
    rw3: 'Ba mục tiêu tôi cần tập trung trong tuần tiếp theo là?',
    rq3: 'Ba mục tiêu tôi cần tập trung trong quý tới là?',
    closeBtn: 'Đóng',
    syncTitle: '☁️ Đồng bộ đám mây',
    syncDesc: 'Đăng nhập để đồng bộ dữ liệu giữa các thiết bị. Dữ liệu hiện tại sẽ tự động được nâng cấp lên đám mây.',
    syncLogin: 'Đăng nhập',
    syncSignup: 'Tạo tài khoản',
    syncLogout: 'Đăng xuất',
    syncStatusOff: 'Chưa cấu hình Supabase',
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
    syncLoginErr: 'Đăng nhập thất bại — kiểm tra lại tên người dùng/mật khẩu',
    syncSignupOk: 'Đã tạo tài khoản! Đồng bộ tự động bắt đầu ✓',
    syncSignupErr: 'Tạo tài khoản thất bại — tên người dùng có thể đã tồn tại.',
    syncUserPh: 'Tên người dùng',
    syncPassPh: 'Mật khẩu',
    syncPass2Ph: 'Xác nhận mật khẩu',
    syncNoAccount: 'Chưa có tài khoản? Tạo ngay',
    syncHaveAccount: 'Đã có tài khoản? Đăng nhập',
    syncGoogle: 'Tiếp tục với Google',
    syncOr: 'hoặc bằng tài khoản',
    syncGoogleErr: 'Không mở được Google. Kiểm tra lại cấu hình OAuth trên backend (GOOGLE_CLIENT_ID/SECRET).',
    syncNeedConfig: 'Chưa cấu hình backend — điền URL API trong js/api-config.js',
    syncErrUsernameTaken: 'Tên người dùng đã tồn tại — thử tên khác.',
    syncErrBadCredentials: 'Sai tên người dùng hoặc mật khẩu.',
    syncErrNetwork: 'Không kết nối được máy chủ — kiểm tra lại URL trong js/api-config.js.',
    syncErrServer: 'Máy chủ báo lỗi — thử lại sau.',
    homeTitle: 'Về trang giới thiệu',
    shareTitle: 'Chia sẻ streak 🔥',
    shareNamePrompt: 'Tên hiển thị trên tấm ảnh (bỏ trống = "Tôi")?',
    shareNoStreak: 'Tích thói quen hôm nay để có streak 🔥 rồi mới chia sẻ được nhé!',
    shareDone: 'Đã tải ảnh chia sẻ: taskflow-streak.png',
    shareFail: 'Không tạo được ảnh chia sẻ.',
    shareFooter: 'Kế hoạch năm 2026 · 100% offline',
    fbTitle: 'Góp ý / phản hồi',
    fbForm: '📝 Góp ý qua Google Form',
    fbMail: '📧 Gửi email',
    fbNoForm: 'Chưa có link Google Form — điền FB_FORM_URL trong js/app.js',
    obGoalTitle: 'Mục tiêu số 1 của năm nay là gì?',
    obGoalSub: 'Gợi ý nhanh — chọn một mục tiêu, hoặc tự gõ ở dưới:',
    obGoalPh: 'VD: Tiết kiệm 20 triệu',
    obNext: 'Tiếp tục →',
    obHabitTitle: '2 thói quen muốn xây dựng?',
    obHabitSub: 'Mỗi ngày tích ✓ một ô — app tự tính %, streak 🔥 và heatmap.',
    obHabitPh1: 'Thói quen 1 — VD: Dậy lúc 5H sáng',
    obHabitPh2: 'Thói quen 2 — VD: Đọc sách 30 phút',
    obThemeTitle: 'Chọn chủ đề màu cho kế hoạch',
    obThemeSub: 'Đổi bất cứ lúc nào bằng 4 chấm màu trên thanh trên.',
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
  },
  en: {
    navMonths: 'Navigate months',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
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
    viewYear: 'Year plan',
    viewWeek: 'Week plan',
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
    habitPh: 'New habit name...',
    habitNameAria: 'New habit name',
    addHabitTxt: '＋ Add habit',
    renameAria: 'Rename',
    delAria: 'Delete',
    noHabits: 'No habits yet — add one 🐥',
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
    motto: '4 things you will never regret:<br>🌱 Live quietly · 📚 Live disciplined · 💼 Mind your own business · 💛 Love yourself',
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
    weekRange: 'Today ({a}) is outside the plan range ({b} – {c})',
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
    importError: 'Invalid file — not a TaskFlow-Todoist backup.',
    importOk: 'Data imported successfully! The page will reload.',
    rm0: 'What did I do well that I want to keep doing?',
    rm1: 'What is the most important lesson I learned?',
    rm2: 'I am grateful for ...',
    rm3: 'Three goals I should focus on next year?',
    rw3: 'Three goals I should focus on next week?',
    rq3: 'Three goals I should focus on next quarter?',
    closeBtn: 'Close',
    syncTitle: '☁️ Cloud sync',
    syncDesc: 'Sign in to sync data across devices. Your existing data will be automatically upgraded to the cloud.',
    syncLogin: 'Sign in',
    syncSignup: 'Create account',
    syncLogout: 'Sign out',
    syncStatusOff: 'Supabase not configured',
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
    syncLoginErr: 'Sign in failed — check username/password',
    syncSignupOk: 'Account created! Sync started automatically ✓',
    syncSignupErr: 'Sign up failed — the username may already be taken.',
    syncUserPh: 'Username',
    syncPassPh: 'Password',
    syncPass2Ph: 'Confirm password',
    syncNoAccount: 'No account? Create one',
    syncHaveAccount: 'Have an account? Sign in',
    syncGoogle: 'Continue with Google',
    syncOr: 'or use an account',
    syncGoogleErr: 'Could not open Google. Check OAuth config on the backend (GOOGLE_CLIENT_ID/SECRET).',
    syncNeedConfig: 'Backend not configured — fill in the API URL in js/api-config.js',
    syncErrUsernameTaken: 'Username already taken — try another one.',
    syncErrBadCredentials: 'Wrong username or password.',
    syncErrNetwork: 'Cannot reach the server — check the URL in js/api-config.js.',
    syncErrServer: 'Server error — please try again later.',
    homeTitle: 'Back to the intro page',
    shareTitle: 'Share streak 🔥',
    shareNamePrompt: 'Name shown on the card (empty = "Me")?',
    shareNoStreak: 'Tick a habit today to build a streak 🔥 before sharing!',
    shareDone: 'Saved share image: taskflow-streak.png',
    shareFail: 'Could not create share image.',
    shareFooter: '2026 plan · 100% offline',
    fbTitle: 'Feedback',
    fbForm: '📝 Feedback via Google Form',
    fbMail: '📧 Send email',
    fbNoForm: 'No Google Form link yet — fill FB_FORM_URL in js/app.js',
    obGoalTitle: 'What is your #1 goal this year?',
    obGoalSub: 'Quick picks — choose one, or type your own below:',
    obGoalPh: 'e.g. Save 20 million VND',
    obNext: 'Continue →',
    obHabitTitle: '2 habits you want to build?',
    obHabitSub: 'Tick ✓ one cell every day — app tracks %, streak 🔥 and heatmap.',
    obHabitPh1: 'Habit 1 — e.g. Wake up at 5AM',
    obHabitPh2: 'Habit 2 — e.g. Read 30 minutes',
    obThemeTitle: 'Pick a color theme',
    obThemeSub: 'Change anytime via the 4 color dots up top.',
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
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  const b = document.getElementById('langBtn');
  if (b) b.textContent = LANG === 'vi' ? 'EN' : 'VI';
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

window.addEventListener('appinstalled', () => trackEvent('pwa_install'));

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
    if (!granted) { alert(t('remindDenied')); return; }
    setRemindTime(time);
    registerPeriodicReminder();
    alert(t('remindEnabled', { t: time }));
    trackEvent('reminder_enabled');
  });
}

function disableReminder() {
  setRemindTime(null);
  alert(t('remindDisabled'));
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
  const rows = [];
  const push = (row) => rows.push(csvRow(row));

  push(['TaskFlow-Todoist Export', new Date().toISOString(), 'Sheet chia nhỏ theo Section để lọc trong Google Sheets']);

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

  const date = new Date().toISOString().slice(0, 10);
  downloadFile('taskflow-todoist-data-' + date + '.csv', rows.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
  trackEvent('export_csv');
}

function importJSONFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || data.app !== 'taskflow-todoist' || !data.keys || typeof data.keys !== 'object') throw new Error('bad');
      if (!confirm(t('importConfirm'))) return;
      Object.keys(data.keys).forEach((k) => {
        try { localStorage.setItem(k, data.keys[k]); } catch (e) { /* ẩn */ }
      });
      alert(t('importOk'));
      location.reload();
    } catch (e) {
      alert(t('importError'));
    }
  };
  reader.onerror = () => alert(t('importError'));
  reader.readAsText(file);
}

function togglePop(id) {
  const p = document.getElementById(id);
  if (!p) return;
  p.hidden = !p.hidden;
  if (id === 'remindPop' && !p.hidden) {
    const input = document.getElementById('remindTime');
    if (input) input.value = getRemindTime() || '20:00';
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('.header-pop') || e.target.closest('.remind-wrap') || e.target.closest('.data-wrap')) return;
  document.querySelectorAll('.header-pop').forEach((p) => { p.hidden = true; });
});

/* ============================ Confetti ============================ */

let confettiRun = null;
function confettiBurst() {
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
  return Array.from({ length: 5 }, (_, i) => ({ kind: i < 2 ? 'priority' : 'regular', done: i < checked, text: '' }));
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
    if (s.view !== 'overview' && s.view !== 'week' && s.view !== 'year') s.view = 'overview';
    // Đồng bộ streak với số tích ✓: khi xem tháng hiện tại, tự bỏ tick các ngày tương lai
    // (dữ liệu cũ / seed trước đây từng tick cả tháng) để số streak phản ánh đúng những gì đã tick.
    const now = new Date();
    if (now.getFullYear() === PLAN_YEAR && now.getMonth() === PLAN_MONTH) {
      const today = Math.min(now.getDate(), NUM_DAYS);
      let dirty = false;
      s.habits.forEach((h) => {
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
              { kind: 'priority', done: false, text: '' },
              { kind: 'priority', done: false, text: '' },
              { kind: 'regular', done: false, text: '' },
              { kind: 'regular', done: false, text: '' },
              { kind: 'regular', done: false, text: '' },
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
    year: new Date().getFullYear(),
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

let state = bootState();

function save() {
  try { localStorage.setItem(monthKey(), JSON.stringify(state)); } catch (e) { /* ẩn */ }
  if (window.Sync) window.Sync.push(monthKey());
}

/* ============================ Tính toán ============================ */

function habitPct(h) {
  const days = Array.isArray(h.days) ? h.days : [];
  const total = habitDaysElapsed();
  if (!total) return 0;
  const done = days.slice(0, total).filter(Boolean).length;
  return Math.round((done / total) * 100);
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

function checkboxHTML(mod, checked, attrs = '') {
  const cls = mod ? ` cb-${mod}` : '';
  return `<button type="button" class="checkbox${cls}" role="checkbox" aria-checked="${checked}" ${attrs}></button>`;
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

function renderOverview() {
  const el = document.getElementById('ov-content');
  const ms = monthlyStats();
  el.innerHTML = `
    <div class="ov-top">
      ${dateCardHTML()}
      ${weeklyChartHTML()}
      ${sceneCardHTML()}
    </div>
    ${goalsPanelHTML(ms)}
    ${habitPanelHTML()}
    ${habitHeatCardHTML()}
  `;
}

function dateCardHTML() {
  return `<div class="card date-card">
    <div class="chick-orn orn-l" aria-hidden="true">🐥<span class="mini">🎧</span></div>
    <div class="chick-orn orn-r" aria-hidden="true">🐥<span class="mini">🎧</span></div>
    <table class="info-table">
      <tr><th>Month</th><td>${PLAN_MONTH + 1}</td></tr>
      <tr><th>Year</th><td>${PLAN_YEAR}</td></tr>
      <tr><th>Current Week</th><td>
        <select class="week-select" data-action="weekselect" aria-label="${t('selWeekAria')}">
          ${state.weeks.map((w) => `<option value="${w.n}" ${w.n === state.currentWeek ? 'selected' : ''}>${t('weekN', { n: w.n })}</option>`).join('')}
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
    <div class="chick-row" aria-label="${t('chicks10Aria')}">
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
        <h3 class="card-title">${t('goalsTitle')}</h3>
        <table class="stats-table">
          <tr><th>Completed</th><th>In Progress</th><th>Total</th></tr>
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
        ${goals.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">
          ${checkboxHTML(mod, g.done, `data-action="goal" data-id="${g.id}"`)}
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
      <div class="bear-wrap" aria-hidden="true"><span class="bear">🐻</span><span class="apple">🍎</span></div>
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
              <th class="sticky name-col">${t('habitCol')}</th>
              <th class="sticky pct-col">%</th>
              ${Array.from({ length: NUM_DAYS }, (_, d) => `<th class="day-num${d === habitToday ? ' today' : ''}">${d + 1}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${state.habits.length ? state.habits.map((h) => {
              const p = habitPct(h);
              return `<tr>
                <td class="sticky name-col"><span class="habit-name-cell">
                  <span class="habit-name-text" data-id="${h.id}" title="${esc(h.name)}">${esc(h.name)}</span>
                  <span class="item-actions">
                    <button type="button" class="mini-btn" data-action="edithabit" data-id="${h.id}" title="${t('renameAria')}" aria-label="${t('renameAria')}">✏️</button>
                    <button type="button" class="mini-btn" data-action="delhabit" data-id="${h.id}" title="${t('delAria')}" aria-label="${t('delAria')}">🗑</button>
                  </span>
                </span></td>
                <td class="sticky pct-col"><b data-role="habit-pct" data-id="${h.id}">${p}%</b></td>
                ${h.days.map((v, d) => `<td class="day-cell${d === habitToday ? ' today' : ''}">${checkboxHTML('', v, `data-action="habit" data-id="${h.id}" data-day="${d}"`)}</td>`).join('')}
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
  if (!top || top.s.cur === 0) { alert(t('shareNoStreak')); return; }
  let name = localStorage.getItem('planner-name');
  if (!name) {
    name = (prompt(t('shareNamePrompt')) || '').trim() || 'Tôi';
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
          text: '🔥 ' + top.s.cur + ' ' + t('hmHeroDays') + ' — ' + top.h.name,
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
    alert(t('shareDone'));
  } catch (e) {
    alert(t('shareFail'));
  }
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
  state.habits.push({ id: 'h' + Date.now(), name, days: Array.from({ length: NUM_DAYS }, () => false) });
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
    <table class="info-table">
      <tr><th>Year</th><td>${now.getFullYear()}</td></tr>
      <tr><th>${t('curMonthTh')}</th><td>${now.getMonth() + 1}</td></tr>
    </table>
    <p class="year-motto">${t('motto')}</p>
    <div class="chick-row" aria-label="${t('chicks12Aria')}">
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
            <div class="v-strip pink"><span>Priority</span></div>
            <ul class="goal-items">
              ${pri.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">
                ${checkboxHTML('pink', g.done, `data-action="ygoal" data-id="${g.id}"`)}
                <span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="y-goal-text" data-id="${g.id}" data-placeholder="${t('yGoalPh')}" aria-label="${t('yGoalAria')}">${esc(g.text)}</span>
                <button type="button" class="btn-del" data-action="delgoal" data-scope="y" data-id="${g.id}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">✕</button>
              </li>`).join('')}
              <li class="goal-item add-item"><button type="button" class="btn-add" data-action="addgoal" data-scope="y" data-kind="priority" aria-label="${t('addPriGoalAria')}" title="${t('addPriGoalAria')}">＋</button></li>
            </ul>
          </div>
          <div class="goal-block">
            <div class="v-strip blue"><span>Regular</span></div>
            <ul class="goal-items">
              ${reg.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">
                ${checkboxHTML('blue', g.done, `data-action="ygoal" data-id="${g.id}"`)}
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
    <div class="charts-head"><h3 class="card-title">${t('progressYear')}</h3><span class="bear-big" aria-hidden="true">🐻</span></div>
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
    <h3 class="card-title">${t('mCardT')}</h3>
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
            <button type="button" class="ym-name" data-action="month" data-month="${m}" title="${t('openMonthT', { n: m + 1 })}">${t('monthT', { n: m + 1 })}${m === realM ? `<small>${t('nowTag')}</small>` : ''}</button>
            <span class="ym-pct" data-role="ym-pct" data-month="${m}">${p}%</span>
          </div>
          <div class="ym-bar-wrap"><div class="ym-bar" style="height:${Math.max(p, 4)}%"></div></div>
          <div class="ym-lists">
            <div class="ym-block">
              <div class="v-strip pink"><span>Priority</span></div>
              <ul class="goal-items ym-items">
                ${pri.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">${checkboxHTML('pink', g.done, `data-action="mgoal" data-month="${m}" data-id="${g.id}"`)}<span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="ym-goal-text" data-month="${m}" data-id="${g.id}" data-placeholder="${t('writePh')}" aria-label="${t('mGoalAria', { n: m + 1 })}">${esc(g.text)}</span><button type="button" class="btn-del" data-action="delgoal" data-scope="ym" data-month="${m}" data-id="${g.id}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">✕</button></li>`).join('')}
                <li class="goal-item add-item"><button type="button" class="btn-add" data-action="addgoal" data-scope="ym" data-month="${m}" data-kind="priority" aria-label="${t('addPriGoalAria')}" title="${t('addPriGoalAria')}">＋</button></li>
              </ul>
            </div>
            <div class="ym-block">
              <div class="v-strip blue"><span>Regular</span></div>
              <ul class="goal-items ym-items">
                ${reg.map((g) => `<li class="goal-item ${g.done ? 'done' : ''}">${checkboxHTML('blue', g.done, `data-action="mgoal" data-month="${m}" data-id="${g.id}"`)}<span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="ym-goal-text" data-month="${m}" data-id="${g.id}" data-placeholder="${t('writePh')}" aria-label="${t('mGoalAria', { n: m + 1 })}">${esc(g.text)}</span><button type="button" class="btn-del" data-action="delgoal" data-scope="ym" data-month="${m}" data-id="${g.id}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">✕</button></li>`).join('')}
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

/* ---------- Trang tuần ---------- */

function renderWeek() {
  const el = document.getElementById('view-week');
  const w = state.weeks[state.currentWeek - 1];
  const st = weekStats(w);
  const ti = nowInfo();
  el.innerHTML = `
    <div class="week-banner">
      <h2>🌸 Week Goals &amp; Tasks 🌸</h2>
      ${ti.inRange ? '' : `<p class="week-range-note">${t('weekRange', { a: fmtDate(ti.now), b: fmtDate(PLAN_START), c: fmtDate(PLAN_END) })}</p>`}
    </div>
    <div class="week-head">
      <div class="card week-title-card">
        <div class="w-top-bar">
          <div class="w-bar-fill" data-role="w-bar-fill" style="width:${st.pct}%"></div>
          <span class="w-chick-on-bar" aria-hidden="true">🐥<span class="gun">🔫</span></span>
          <span class="week-pct-text" data-role="w-badge">${st.pct}%</span>
        </div>
        <h2 class="card-title">${t('weekN', { n: w.n })}</h2>
        <table class="stats-table">
          <tr><th>Completed</th><th>In Progress</th><th>Total</th></tr>
          <tr data-role="w-stats"><td>${st.done}</td><td>${st.inProg}</td><td>${st.total}</td></tr>
        </table>
        <div class="week-nav">
          <button type="button" class="btn-nav" data-action="prev" ${state.currentWeek === 1 ? 'disabled' : ''}>${t('prevWeek')}</button>
          <button type="button" class="btn-nav" data-action="next" ${state.currentWeek === NUM_WEEKS ? 'disabled' : ''}>${t('nextWeek')}</button>
        </div>
      </div>
      <div class="card donut-card">
        <div class="donut-wrap">
          <div class="donut" data-role="w-donut">${donutSVG(st.pct, 140, 18, '#F39A82')}</div>
          <div class="donut-center"><span data-role="w-badge">${st.pct}%</span></div>
        </div>
      </div>
      <div class="card legend-card">${weeklyGoalsHTML(w)}</div>
      <div class="card reflection sub">${reflectionHTML('w' + w.n, REFLECT_PROMPTS_WEEK())}</div>
    </div>
    <div class="days-grid">
      ${w.days.map((d, di) => dayColumnHTML(w, di, isDayToday(d))).join('')}
    </div>`;
}

function weeklyGoalsHTML(w) {
  const pri = w.goals.map((g, gi) => ({ g, gi })).filter((x) => x.g.kind === 'priority');
  const reg = w.goals.map((g, gi) => ({ g, gi })).filter((x) => x.g.kind === 'regular');
  return `<div class="legend-groups">
      <div class="legend-col">
        <div class="v-strip pink"><span>Priority</span></div>
        <div class="legend-goals">
          <span class="section-sub-title">${t('priGoalsSub')}</span>
          ${pri.map(({ g, gi }) => `<div class="legend-goal">
            ${checkboxHTML('pink', g.done, `data-action="wgoal" data-week="${w.n}" data-id="${gi}"`)}
            <span class="g-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="w-goal-text" data-week="${w.n}" data-id="${gi}" data-placeholder="${t('yGoalPh')}" aria-label="${t('wGoalAria', { n: gi + 1 })}">${esc(g.text)}</span>
            <button type="button" class="btn-del" data-action="delgoal" data-scope="w" data-week="${w.n}" data-id="${gi}" aria-label="${t('delGoalAria')}" title="${t('delGoalAria')}">✕</button>
          </div>`).join('')}
          <div class="legend-goal"><button type="button" class="btn-add" data-action="addgoal" data-scope="w" data-week="${w.n}" data-kind="priority" aria-label="${t('addPriGoalAria')}" title="${t('addPriGoalAria')}">＋</button></div>
        </div>
      </div>
      <div class="legend-col">
        <div class="v-strip blue"><span>Regular</span></div>
        <div class="legend-goals">
          <span class="section-sub-title">${t('regGoalsSub')}</span>
          ${reg.map(({ g, gi }) => `<div class="legend-goal">
            ${checkboxHTML('blue', g.done, `data-action="wgoal" data-week="${w.n}" data-id="${gi}"`)}
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
  return `<div class="day-col day-col-${di}${isToday ? ' today' : ''}">
    <div class="day-head">
      <span class="fruit" aria-hidden="true">${DAYS[di].icon}</span>
      <span class="day-name">${dayLabel(di)}</span>
      <span class="day-date">${d.date}/${d.yy}</span>
      ${isToday ? `<span class="today-badge">${t('todayBadge')}</span>` : ''}
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
          <span class="task-sub-head">${t('taskPriSub')}</span>
          ${pri.map(({ t, ti }) => taskRowHTML(w.n, di, ti, 'pink', t)).join('')}
          <button type="button" class="btn-add" data-action="addtask" data-week="${w.n}" data-day="${di}" data-kind="priority" aria-label="${t('addPriTaskAria')}" title="${t('addPriTaskAria')}">＋</button>
        </div>
      </div>
      <div class="task-group">
        <div class="v-strip blue"><span>Regular</span></div>
        <div class="task-rows">
          <span class="task-sub-head">${t('taskRegSub')}</span>
          ${reg.map(({ t, ti }) => taskRowHTML(w.n, di, ti, 'blue', t)).join('')}
          <button type="button" class="btn-add" data-action="addtask" data-week="${w.n}" data-day="${di}" data-kind="regular" aria-label="${t('addRegTaskAria')}" title="${t('addRegTaskAria')}">＋</button>
        </div>
      </div>
    </div>
    <div class="day-note">
      <div class="note-banner">${t('noteBanner')}</div>
      <div class="note-area" contenteditable="true" spellcheck="false" data-note="${w.n}-${di}" data-placeholder="..." aria-label="${t('noteAria', { name: dayLabel(di) })}">${esc(d.note).replace(/\n/g, '<br>')}</div>
    </div>
  </div>`;
}

function taskRowHTML(wn, di, ti, mod, task) {
  return `<div class="task-row">
    ${checkboxHTML(mod, task.done, `data-action="task" data-week="${wn}" data-day="${di}" data-task="${ti}"`)}
    <span class="task-text editable" contenteditable="true" spellcheck="false" data-singleline="1" data-role="task-text" data-week="${wn}" data-day="${di}" data-task="${ti}" data-placeholder="${t('taskPh')}" aria-label="${t('taskAria', { n: ti + 1 })}">${esc(task.text ?? '')}</span>
    <span class="dotted-line" aria-hidden="true"></span>
    <button type="button" class="btn-del" data-action="deltask" data-week="${wn}" data-day="${di}" data-task="${ti}" aria-label="${t('delTaskAria', { n: ti + 1 })}" title="${t('delTaskAria', { n: ti + 1 })}">✕</button>
  </div>`;
}

/* ============================ Điều hướng ============================ */

function buildNav() {
  const nav = document.getElementById('navTabs');
  nav.innerHTML = `
    <button type="button" class="tab" role="tab" id="tab-overview" aria-controls="view-overview" data-action="nav" data-view="overview">${t('tabOverview')}</button>
    <button type="button" class="tab" role="tab" id="tab-year" aria-controls="view-year" data-action="nav" data-view="year">${t('tabYear', { y: new Date().getFullYear() })}</button>
    ${state.weeks.map((w) => `<button type="button" class="tab" role="tab" id="tab-week-${w.n}" aria-controls="view-week" data-action="nav" data-view="week" data-week="${w.n}">${t('weekN', { n: w.n })}</button>`).join('')}
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
  const video = ov ? ov.querySelector('.landing-video') : null;
  if (video) {
    if (view === 'overview') { video.play().catch(() => { /* autoplay bị chặn */ }); }
    else video.pause();
  }
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
  if (m < 0 || m > 11) return;
  const now = new Date();
  if (m === now.getMonth() && PLAN_YEAR === now.getFullYear()) viewedMonth = null;
  else viewedMonth = m;
  initPlan(new Date(PLAN_YEAR, m, 1));
  state = bootState();
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

/* ============================ Sự kiện ============================ */

document.addEventListener('click', (e) => {
  if (e.target.closest('select')) return;
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const act = el.dataset.action;

  if (act === 'nav') setView(el.dataset.view, +el.dataset.week || undefined);
  else if (act === 'journey') {
    const target = document.getElementById('ov-content');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (act === 'prevmonth') openMonth(PLAN_MONTH - 1);
  else if (act === 'nextmonth') openMonth(PLAN_MONTH + 1);
  else if (act === 'prev') goWeek(state.currentWeek - 1);
  else if (act === 'next') goWeek(state.currentWeek + 1);
  else if (act === 'weekbar') goWeek(+el.dataset.week);
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
    if (h) { h.days[+el.dataset.day] = !h.days[+el.dataset.day]; afterHabitToggle(); }
  } else if (act === 'wgoal') {
    const w = state.weeks[+el.dataset.week - 1];
    const g = w.goals[+el.dataset.id];
    if (g) { g.done = !g.done; afterWGoalToggle(w); if (g.done && weekStats(w).pct === 100) confettiBurst(); }
  } else if (act === 'task') {
    const w = state.weeks[+el.dataset.week - 1];
    const d = w.days[+el.dataset.day];
    const t = d.tasks[+el.dataset.task];
    if (t) { t.done = !t.done; refreshTaskUI(w, +el.dataset.day); save(); }
  } else if (act === 'addtask') {
    const w = state.weeks[+el.dataset.week - 1];
    w.days[+el.dataset.day].tasks.push({ kind: el.dataset.kind, done: false, text: '' });
    renderWeek();
    save();
    trackEvent('create_task', { kind: el.dataset.kind });
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
  } else if (act === 'addhabit') {
    const ni = document.querySelector('[data-role="habit-name-input"]');
    if (ni && addHabit(ni.value)) {
      const fresh = document.querySelector('[data-role="habit-name-input"]');
      if (fresh) { fresh.value = ''; fresh.focus(); }
    }
  } else if (act === 'delhabit') {
    removeHabit(el.dataset.id);
  } else if (act === 'sync-toggle') {
    toggleSyncModal();
  } else if (act === 'sync-close') {
    closeSyncModal();
  } else if (act === 'sync-toggle-mode') {
    setSyncMode(syncMode === 'signup' ? 'login' : 'signup');
  } else if (act === 'sync-google') {
    doSyncGoogle();
  } else if (act === 'sync-logout') {
    doSyncLogout();
  } else if (act === 'theme') {
    setTheme(el.dataset.theme);
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
  } else if (act === 'print') {
    trackEvent('print');
    window.print();
  } else if (act === 'share-streak') {
    doShareStreak();
  } else if (act === 'fb-toggle') {
    togglePop('fbPop');
  } else if (act === 'fb-form') {
    togglePop('fbPop');
    trackEvent('feedback_click', { kind: 'form' });
    if (!FB_FORM_URL) { alert(t('fbNoForm')); return; }
    window.open(FB_FORM_URL, '_blank', 'noopener');
  } else if (act === 'fb-mail') {
    togglePop('fbPop');
    trackEvent('feedback_click', { kind: 'mail' });
    if (!FB_EMAIL) { alert(t('fbNoForm')); return; }
    location.href = 'mailto:' + FB_EMAIL + '?subject=' + encodeURIComponent('TaskFlow phản hồi');
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
  if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
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
  refreshHeatCard();
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

/* ============================ Đồng bộ đám mây (Supabase) ============================ */

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
    btn.title = t('syncTitle') + ' — ' + syncStatusText(s);
  }
  const lo = document.getElementById('syncLogoutBtn');
  if (lo) lo.hidden = (s !== 'ready' && s !== 'syncing' && s !== 'connecting');
}

function toggleSyncModal() {
  const m = document.getElementById('syncModal');
  if (!m) return;
  m.hidden = !m.hidden;
  if (!m.hidden) {
    setSyncMode('login');
    updateSyncStatus();
  }
}

function closeSyncModal() {
  const m = document.getElementById('syncModal');
  if (m) m.hidden = true;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const m = document.getElementById('syncModal');
    if (m && !m.hidden) m.hidden = true;
  }
});
document.addEventListener('click', (e) => {
  const m = document.getElementById('syncModal');
  if (m && !m.hidden && e.target === m) m.hidden = true;
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
}

const USER_RE = /^[A-Za-z0-9_.-]{3,30}$/;

function syncErrorText(code) {
  switch (code) {
    case 'username-taken': return t('syncErrUsernameTaken');
    case 'bad-credentials': return t('syncErrBadCredentials');
    case 'network': return t('syncErrNetwork');
    case 'no-config': return t('syncNeedConfig');
    default: return t('syncErrServer');
  }
}

async function doSyncSignup() {
  if (!window.Sync) return;
  const { user, pass, pass2 } = syncFormValues();
  if (!user || !pass) { alert(t('syncNeedUser')); return; }
  if (!USER_RE.test(user)) { alert(t('syncUserInvalid')); return; }
  if (pass.length < 6) { alert(t('syncPassShort')); return; }
  if (pass !== pass2) { alert(t('syncPassMismatch')); return; }
  const r = await window.Sync.signup(user, pass);
  updateSyncStatus();
  if (r && r.ok) {
    trackEvent('signup');
    alert(t('syncSignupOk'));
    closeSyncModal();
    // Dữ liệu local đã được làm sạch → reload để app khởi động lại với dữ liệu mới của tài khoản vừa tạo
    location.reload();
  } else {
    alert(syncErrorText(r && r.error));
  }
}

async function doSyncLogin() {
  if (!window.Sync) return;
  const { user, pass } = syncFormValues();
  if (!user || !pass) { alert(t('syncNeedUser')); return; }
  const r = await window.Sync.login(user, pass);
  updateSyncStatus();
  if (r && r.ok) {
    trackEvent('login');
    closeSyncModal();
  } else {
    alert(syncErrorText(r && r.error));
  }
}

async function doSyncGoogle() {
  if (!window.Sync) return;
  const s = window.Sync.getStatus();
  if (s === 'off') { alert(t('syncNeedConfig')); return; }
  const r = await window.Sync.loginWithGoogle();
  if (!(r && r.ok)) alert(t('syncGoogleErr'));
  else closeSyncModal();
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
  m.hidden = false;
}

function obFinish() {
  try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) { /* ẩn */ }
  const m = document.getElementById('onboardModal');
  if (m) m.hidden = true;
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
setTheme(THEME);
applyStaticI18N();
updateBrand();
updateNowBtn();
renderClock();
buildNav();
setView(state.view, state.currentWeek);


/* ---------- Khởi động đồng bộ đám mây (backend Render) ---------- */
if (window.Sync) {
  // Google OAuth: sau callback, backend quay về app.html?token=... — lưu token trước khi init
  window.Sync.consumeRedirectToken();
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

const importFileInput = document.getElementById('importFile');
if (importFileInput) {
  importFileInput.addEventListener('change', () => {
    const f = importFileInput.files && importFileInput.files[0];
    if (f) importJSONFile(f);
    importFileInput.value = '';
  });
}
