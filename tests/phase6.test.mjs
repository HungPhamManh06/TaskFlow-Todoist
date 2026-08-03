import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import PlanStats from '../js/plan-stats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const APP_HTML = readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const CSS = readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
const SW_JS = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

/* ============================================================
   Phase 6.1 — moodSummary (PlanStats, thuần)
   ============================================================ */

test('6.1: moodSummary tính trung bình habit% ngày vui vs buồn', () => {
  const s = PlanStats.moodSummary([
    { mood: 4, pct: 90 },
    { mood: 3, pct: 80 },
    { mood: 0, pct: 40 },
    { mood: 1, pct: 20 },
    { mood: 2, pct: 60 },
    { mood: null, pct: 70 },
  ]);
  assert.equal(s.goodDays, 2);
  assert.equal(s.badDays, 2);
  assert.equal(s.goodAvg, 85);
  assert.equal(s.badAvg, 30);
  assert.equal(s.delta, 55);
});

test('6.1: moodSummary trả null khi chưa đủ ngày hai phía', () => {
  const s = PlanStats.moodSummary([{ mood: 4, pct: 80 }, { mood: 3, pct: 90 }]);
  assert.equal(s.goodAvg, 85);
  assert.equal(s.badAvg, null);
  assert.equal(s.delta, null);
});

/* ============================================================
   Phase 6.2 — parseCSVRows (PlanStats, thuần)
   ============================================================ */

test('6.2: splitCSVLine xử lý ô có nháy kép + escape ""', () => {
  assert.deepEqual(PlanStats.splitCSVLine('a,"b c","d ""e"""'), ['a', 'b c', 'd "e"']);
});

test('6.2: parseCSVRows round-trip với buildCSVRows', () => {
  const months = [];
  months[2] = {
    monthlyGoals: [{ kind: 'priority', text: 'Mục tiêu "quan trọng"', done: true }],
    habits: [{ name: 'Đọc sách', days: [true, false, true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false] }],
    weeks: [{ n: 1, days: [{ date: 1, tasks: [{ kind: 'regular', text: 'Task 1, nè', done: false, tags: ['x'] }] }] }],
  };
  const yearState = { goals: [{ kind: 'priority', text: 'Goal năm', done: false }], reflections: {}, monthNotes: [] };
  const rows = PlanStats.buildCSVRows(months, yearState, 'note');
  const parsed = PlanStats.parseCSVRows(rows.join('\r\n'));

  assert.equal(parsed.months[3].goals.length, 1);
  assert.equal(parsed.months[3].goals[0].text, 'Mục tiêu "quan trọng"');
  assert.equal(parsed.months[3].goals[0].done, true);
  assert.equal(parsed.months[3].habits.length, 2);
  assert.equal(parsed.months[3].habits[0].name, 'Đọc sách');
  assert.equal(parsed.months[3].habits[0].day, 1);
  assert.equal(parsed.months[3].habits[0].done, true);
  assert.equal(parsed.months[3].habits[1].day, 3);
  assert.equal(parsed.months[3].tasks.length, 1);
  assert.equal(parsed.months[3].tasks[0].text, 'Task 1, nè');
  assert.equal(parsed.year.goals.length, 1);
  assert.equal(parsed.year.goals[0].text, 'Goal năm');
});

test('6.2: parseCSVRows bỏ qua dòng rác', () => {
  const parsed = PlanStats.parseCSVRows('TaskFlow-Todoist Export,"2026-08-03",note\r\n\r\n\nhello,world\r\n');
  assert.deepEqual(parsed.months, {});
  assert.equal(parsed.year.goals.length, 0);
});

/* ============================================================
   Phase 6 — textual tests (app.js / app.html / sw.js)
   ============================================================ */

test('6.3: app.js có thư viện thói quen mẫu + nút mở', () => {
  assert.match(APP_JS, /HABIT_TEMPLATES\s*=\s*\[/);
  assert.match(APP_JS, /data-action="templates-toggle"/);
  assert.match(APP_JS, /data-action="template-add"/);
  assert.match(APP_JS, /templatesPopHTML\(\)/);
});

test('6.3: demo data (demoPlan + nút)', () => {
  assert.match(APP_JS, /function demoPlan\(\)/);
  assert.match(APP_HTML, /data-action="demo-data"/);
  assert.match(APP_JS, /trackEvent\('demo_data'\)/);
});

test('6.4: app.js có mood tracker (state + UI + insight)', () => {
  assert.match(APP_JS, /const MOOD_KEY = 'planner-mood'/);
  assert.match(APP_JS, /data-action="mood"/);
  assert.match(APP_JS, /moodCardHTML\(\)/);
  assert.match(APP_JS, /moodSummary\(pairs\)/);
  assert.match(APP_JS, /window\.Sync\.push\(MOOD_KEY\)/);
  assert.match(APP_JS, /keys\.indexOf\('planner-mood'\)/);
});

test('6.5: app.js + app.html có báo cáo năm', () => {
  assert.match(APP_HTML, /id="yearReportModal"/);
  assert.match(APP_HTML, /data-action="close-year-report"/);
  assert.match(APP_HTML, /data-action="share-year-report"/);
  assert.match(APP_JS, /function yearlyReportData\(\)/);
  assert.match(APP_JS, /function yearReportCardBlob\(r\)/);
  assert.match(APP_JS, /trackEvent\('share_year_report'/);
  assert.match(APP_JS, /data-action="year-report"/);
});

test('6.6: weekly digest — app ghi cache, SW đọc', () => {
  assert.match(APP_JS, /function computeDigest\(\)/);
  assert.match(APP_JS, /function updateDigestCache\(\)/);
  assert.match(APP_JS, /caches\.open\('taskflow-digest'\)/);
  assert.match(SW_JS, /digest\.json/);
  assert.match(SW_JS, /'taskflow-digest'/);
});

test('6.7: import CSV — parser + handler + routing', () => {
  assert.match(APP_JS, /function importCSVFile\(file\)/);
  assert.match(APP_HTML, /data-action="import-csv"/);
  assert.ok(APP_JS.includes('.csv$'), 'thiếu routing csv trong importFile change');
  assert.match(APP_HTML, /accept="\.json,application\/json,\.csv,text\/csv"/);
  assert.match(APP_JS, /trackEvent\('import_csv'\)/);
});

test('6.8: i18n Phase 6 có ở cả vi + en', () => {
  ['templatesTitle', 'moodTitle', 'yearReportTitle', 'importCsv', 'importCsvConfirm', 'digestBody', 'digestNone'].forEach((k) => {
    assert.ok(APP_JS.includes(k + ": '"), `thiếu key ${k} (vi/en)`);
    const viCount = (APP_JS.match(new RegExp(k + ": '" , 'g')) || []).length;
    assert.equal(viCount, 2, `key ${k} phải có ở cả vi + en (đếm được ${viCount})`);
  });
});

test('6.9: CSS Phase 6 tồn tại', () => {
  assert.match(CSS, /\.templates-pop/);
  assert.match(CSS, /\.mood-btn/);
  assert.match(CSS, /\.mood-heat/);
  assert.match(CSS, /\.year-banner/);
});

test('6.10: heatmap mood tương tác — cell là button + picker + set/clear', () => {
  assert.match(APP_JS, /data-action="mood-pick"/);
  assert.match(APP_JS, /data-action="mood-set"/);
  assert.match(APP_JS, /data-action="mood-clear"/);
  assert.match(APP_JS, /function openMoodPicker\(/);
  assert.match(APP_JS, /function closeMoodPicker\(\)/);
  assert.match(APP_JS, /function rerenderMoodCard\(\)/);
  assert.match(APP_JS, /id="moodCard"/);
  assert.match(APP_JS, /id="moodPicker"/);
  assert.match(CSS, /\.mood-picker/);
  assert.match(CSS, /\.mood-cell\.today/);
  assert.match(CSS, /\.mood-day/);
});

test('6.11: i18n mood picker keys đủ vi + en', () => {
  ['moodPickAria', 'moodPickTitle', 'moodClear'].forEach((k) => {
    const viCount = (APP_JS.match(new RegExp(k + ": '" , 'g')) || []).length;
    assert.equal(viCount, 2, `key ${k} phải có ở cả vi + en (đếm được ${viCount})`);
  });
});

test('6.12: nút Sao chép sang tháng không bị mini-btn base (opacity:0/width:22px) ẩn', () => {
  assert.match(CSS, /\.habit-add-row \.mini-btn:not\(\.add-btn\)/);
  assert.match(CSS, /width: auto;/);
  assert.match(CSS, /opacity: \.85;/);
  assert.match(APP_JS, /data-action="copyhabits"/);
});

test('6.13: cột habit tách icon khỏi tên (flex column, icon hàng riêng flex-end)', () => {
  assert.match(CSS, /\.habit-name-cell \{ display: flex; flex-direction: column;/);
  assert.match(CSS, /\.habit-name-cell \.item-actions \{ display: flex; justify-content: flex-end;/);
});

test('6.14: Pomodoro gộp cột phải cùng Phản ánh (week-side, không còn 1 mình 1 hàng)', () => {
  assert.match(APP_JS, /week-side/);
  assert.match(APP_JS, /<div class="week-side">/);
  assert.match(CSS, /\.week-side \{ display: flex; flex-direction: column/);
  assert.match(APP_JS, /class="card pomo-widget"/);
  assert.match(APP_JS, /class="card reflection sub"/);
});
