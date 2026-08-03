import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import PlanStats from '../js/plan-stats.js';
import DeepLink from '../js/deeplink.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const APP_HTML = readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const SYNC_JS = readFileSync(path.join(ROOT, 'js/sync.js'), 'utf8');
const AUTH_JS = readFileSync(path.join(ROOT, 'server/auth.js'), 'utf8');
const INDEX_JS = readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
const SRV_PKG = readFileSync(path.join(ROOT, 'server/package.json'), 'utf8');

/* ============================================================
   Task 3.3 — Unit test các hàm thuần (PlanStats)
   ============================================================ */

test('weekGoalPct: trung bình % mục tiêu tuần (tuần rỗng = 0)', () => {
  const s = {
    weeks: [
      { goals: [{ done: true }, { done: false }] },   // 50
      { goals: [{ done: true }, { done: true }] },    // 100
      { goals: [] },                                   // 0
    ],
  };
  // pcts = [50, 100, 0] → trung bình 50
  assert.equal(PlanStats.weekGoalPct(s), 50);
});

test('weekGoalPct: state rỗng / thiếu weeks → 0', () => {
  assert.equal(PlanStats.weekGoalPct(null), 0);
  assert.equal(PlanStats.weekGoalPct({}), 0);
  assert.equal(PlanStats.weekGoalPct({ weeks: [] }), 0);
});

test('yearMonthlyFrom: đọc qua loader 12 tháng', () => {
  const loader = (m) => (m === 2 ? { weeks: [{ goals: [{ done: true }, { done: true }] }], monthlyGoals: [{ id: 'g', text: 'x', kind: 'priority', done: false }] } : null);
  const out = PlanStats.yearMonthlyFrom(loader, 2026);
  assert.equal(out.length, 12);
  assert.equal(out[2].pct, 100);
  assert.equal(out[0].pct, 0);
  assert.equal(out[2].goals.length, 1);
  assert.equal(out[5].goals.length, 0);
});

test('csvRow: escape dấu nháy kép + null', () => {
  assert.equal(PlanStats.csvRow(['a', 'b"c', null, '']), '"a","b""c","",""');
});

test('buildCSVRows: đủ các section + header', () => {
  const months = [];
  months[0] = {
    monthlyGoals: [{ kind: 'priority', text: 'M1', done: true }],
    habits: [{ name: 'H1', days: [true, false] }],
    weeks: [{ n: 1, days: [{ date: '1/1', yy: 26, tasks: [{ kind: 'priority', text: 'T1', done: true, tags: ['a'] }] }] }],
    reflections: { overview: ['r1'], weeks: [['r2']] },
  };
  const ys = { goals: [{ kind: 'regular', text: 'YG', done: false }], reflections: { year: ['yr'] }, monthNotes: ['', 'note2'] };
  const rows = PlanStats.buildCSVRows(months, ys, 'ghi chú');
  const joined = rows.join('\r\n');
  assert.ok(joined.includes('"MonthlyGoals"'));
  assert.ok(joined.includes('"Habits"'));
  assert.ok(joined.includes('"Tasks"'));
  assert.ok(joined.includes('"YearGoals"'));
  assert.ok(joined.includes('"YearReflections"'));
  assert.ok(joined.includes('"YearNotes"'));
  assert.ok(joined.includes('"T1"'));
  assert.ok(joined.includes('"a"')); // tags trong cột CSV
});

test('buildCSVRows: không crash khi state null', () => {
  const rows = PlanStats.buildCSVRows([null, null, null, null, null, null, null, null, null, null, null, null], { goals: [], reflections: {}, monthNotes: [] }, '');
  assert.ok(rows.length > 0);
});

/* ============================================================
   Task 2.1 — Tìm kiếm xuyên tháng
   ============================================================ */

test('2.1: modal tìm kiếm + đọc chéo monthStateRaw', () => {
  assert.match(APP_HTML, /id="searchModal"/);
  assert.match(APP_HTML, /data-action="search-toggle"/);
  assert.match(APP_JS, /act === 'search-toggle'/);
  assert.match(APP_JS, /function runSearch/);
  assert.match(APP_JS, /monthStateRaw\(/);
});

test('2.1: nhấn kết quả → mở tháng đúng', () => {
  assert.match(APP_JS, /act === 'search-go'/);
  assert.match(APP_JS, /function goSearchResult/);
});

/* ============================================================
   Task 2.2 — Tag cho task
   ============================================================ */

test('2.2: task có mảng tags + chip màu + lọc nhanh', () => {
  assert.match(APP_JS, /tags: \[\]/);                       // seedTasks + migration
  assert.match(APP_JS, /if \(!Array\.isArray\(tk\.tags\)\) tk\.tags = \[\]/); // migration loadState
  assert.match(APP_JS, /class="tag-chip"/);
  assert.match(APP_JS, /data-action="tagfilter"/);
  assert.match(APP_JS, /function beginTagEdit/);
});

test('2.2: CSV xuất kèm cột Tags (trong plan-stats.js)', () => {
  const STATS_JS = readFileSync(path.join(ROOT, 'js/plan-stats.js'), 'utf8');
  assert.match(STATS_JS, /'Tasks', 'Month', 'Week', 'Day', 'Date', 'Kind', 'Text', 'Done', 'Tags'/);
});

/* ============================================================
   Task 2.3 — View Lịch
   ============================================================ */

test('2.3: tab Lịch + section view-calendar + renderCalendar', () => {
  assert.match(APP_HTML, /id="view-calendar"/);
  assert.match(APP_JS, /data-action="nav"/);
  assert.match(APP_JS, /data-view="calendar"/);
  assert.match(APP_JS, /function renderCalendar/);
  assert.match(APP_JS, /tabCalendar/);
});

test('2.3: deeplink view=calendar hợp lệ', () => {
  assert.equal(DeepLink.parse('https://x.app/app.html?view=calendar').view, 'calendar');
});

/* ============================================================
   Task 2.4 — Template tháng
   ============================================================ */

test('2.4: modal template + copyMonthTemplate bỏ ticks', () => {
  assert.match(APP_HTML, /id="templateModal"/);
  assert.match(APP_HTML, /data-action="template-do"/);
  assert.match(APP_JS, /act === 'template-do'/);
  assert.match(APP_JS, /function copyMonthTemplate/);
  assert.match(APP_JS, /done: false/);
});

/* ============================================================
   Task 2.5 — Dashboard
   ============================================================ */

test('2.5: year view có dashboard (best habit, ngày năng suất, quý)', () => {
  assert.match(APP_JS, /function yearDashboardHTML/);
  assert.match(APP_JS, /function bestHabitAcrossYear/);
  assert.match(APP_JS, /function bestProductiveDay/);
  assert.match(APP_JS, /dashTitle/);
});

/* ============================================================
   Task 2.6 — Pomodoro
   ============================================================ */

test('2.6: overlay pomodoro 25/5 + trackEvent', () => {
  assert.match(APP_HTML, /class="pomo-fab"/);
  assert.match(APP_HTML, /data-action="pomo-toggle"/);
  assert.match(APP_JS, /POMO_WORK = 25 \* 60/);
  assert.match(APP_JS, /POMO_BREAK = 5 \* 60/);
  assert.match(APP_JS, /'pomodoro_complete'/);
});

/* ============================================================
   Task 3.1 — Tài khoản (server + client)
   ============================================================ */

test('3.1: server có change-password + delete-account', () => {
  assert.match(AUTH_JS, /router\.post\('\/change-password'/);
  assert.match(AUTH_JS, /router\.post\('\/delete-account'/);
  assert.match(AUTH_JS, /delete from users where id = \$1/);
});

test('3.1: client sync có changePassword + deleteAccount + getUsername', () => {
  assert.match(SYNC_JS, /changePassword: changePassword/);
  assert.match(SYNC_JS, /deleteAccount: deleteAccount/);
  assert.match(SYNC_JS, /getUsername: function/);
  assert.match(APP_HTML, /id="profileModal"/);
  assert.match(APP_HTML, /data-action="pw-change"/);
  assert.match(APP_HTML, /data-action="acct-delete"/);
  assert.match(APP_JS, /act === 'pw-change'/);
  assert.match(APP_JS, /act === 'acct-delete'/);
});

/* ============================================================
   Task 3.2 — Rate limit
   ============================================================ */

test('3.2: express-rate-limit cho login/signup', () => {
  assert.ok(JSON.parse(SRV_PKG).dependencies['express-rate-limit'], 'thiếu express-rate-limit trong server/package.json');
  assert.match(INDEX_JS, /express-rate-limit/);
  assert.match(INDEX_JS, /rateLimit\(/);
  assert.match(INDEX_JS, /\/api\/auth\/login/);
  assert.match(INDEX_JS, /\/api\/auth\/signup/);
});

/* ============================================================
   Version bumps
   ============================================================ */

test('app.html: plan-stats.js được nạp trước app.js', () => {
  const iPlan = APP_HTML.indexOf('js/plan-stats.js');
  const iApp = APP_HTML.indexOf('js/app.js');
  assert.ok(iPlan >= 0 && iApp > iPlan, 'plan-stats.js phải nạp trước app.js');
});

test('sw.js: APP_SHELL có plan-stats.js + cache >= v26', () => {
  const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(SW.includes('./js/plan-stats.js'));
  const m = /const CACHE = 'taskflow-v(\d+)';/.exec(SW);
  assert.ok(Number(m[1]) >= 26);
});
