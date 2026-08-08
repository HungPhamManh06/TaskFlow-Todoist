import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import UI from '../js/ui.js';
import DeepLink from '../js/deeplink.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const SYNC_JS = readFileSync(path.join(ROOT, 'js/sync.js'), 'utf8');
const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const LANDING = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const LANDING_CSS = readFileSync(path.join(ROOT, 'css/landing.css'), 'utf8');

function readRequiredAsset(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  assert.ok(existsSync(absolutePath), `missing required asset: ${relativePath}`);
  return readFileSync(absolutePath, 'utf8');
}

function parseHex(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function relativeLuminance(hex) {
  const [r, g, b] = parseHex(hex).map((channel) => (
    channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
  ));
  return .2126 * r + .7152 * g + .0722 * b;
}

function contrastRatio(a, b) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + .05) / (darker + .05);
}

function parseTokenBlock(css, marker) {
  const start = css.indexOf(marker);
  assert.ok(start >= 0, `missing token block: ${marker}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return Object.fromEntries(
    [...css.slice(open + 1, close).matchAll(/(--[\w-]+):\s*(#[\da-f]{6})\s*;/gi)]
      .map(([, name, value]) => [name, value])
  );
}

function effectiveThemeTokens(css, theme, dark) {
  const values = parseTokenBlock(css, ':root,');
  if (theme !== 'cream') Object.assign(values, parseTokenBlock(css, `:root[data-theme="${theme}"]`));
  if (dark) {
    Object.assign(values, parseTokenBlock(css, ':root[data-dark="true"] {'));
    if (theme !== 'cream') {
      Object.assign(values, parseTokenBlock(css, `:root[data-dark="true"][data-theme="${theme}"]`));
    }
  }
  return values;
}

test('buildViewUrl keeps month and selected view', () => {
  assert.equal(
    UI.buildViewUrl({ view: 'week', year: 2026, month: 7, week: 2 }),
    '?view=week&m=2026-08&w=2'
  );
});

test('week URL round-trips through build and parse helpers', () => {
  const query = UI.buildViewUrl({ view: 'week', year: 2026, month: 7, week: 6 });
  assert.deepEqual(DeepLink.parse(`https://x.app/app.html${query}`), {
    view: 'week', year: 2026, month: 7, week: 6,
  });
});

test('week parser rejects invalid and month-specific out-of-range values', () => {
  assert.equal(DeepLink.parse('https://x.app/app.html?view=week&m=2026-08&w=0').week, null);
  assert.equal(DeepLink.parse('https://x.app/app.html?view=week&m=2026-08&w=7').week, null);
  assert.equal(DeepLink.parse('https://x.app/app.html?view=week&m=2026-08&w=2.5').week, null);
  assert.equal(DeepLink.parse('https://x.app/app.html?view=week&m=2027-02&w=5').week, null);
});

test('calendar URL preserves repeated encoded tag filters', () => {
  const query = UI.buildViewUrl({
    view: 'calendar', year: 2026, month: 7, tags: ['ưu tiên', 'học tập'],
  });
  assert.equal(query, '?view=calendar&m=2026-08&tag=%C6%B0u+ti%C3%AAn&tag=h%E1%BB%8Dc+t%E1%BA%ADp');
  assert.deepEqual(DeepLink.parse(`https://x.app/app.html${query}`).tags, ['ưu tiên', 'học tập']);
});

test('OAuth URL cleanup removes only the token and preserves navigation state', () => {
  assert.equal(
    DeepLink.withoutParam(
      'https://x.app/app.html?view=week&m=2026-08&w=2&token=abc%2B123&campaign=launch#focus',
      'token'
    ),
    'https://x.app/app.html?view=week&m=2026-08&w=2&campaign=launch#focus'
  );
  assert.match(SYNC_JS, /DeepLink\.withoutParam\(window\.location\.href, 'token'\)/);
});

test('OAuth token is consumed before the first boot-time URL synchronization', () => {
  const boot = APP_JS.slice(APP_JS.indexOf('/* ============================ Khởi động'));
  const consume = boot.indexOf('consumeRedirectToken()');
  const firstView = boot.indexOf('setView(state.view, state.currentWeek)');
  assert.ok(consume >= 0, 'missing redirect-token consumption during boot');
  assert.ok(firstView >= 0, 'missing initial view render during boot');
  assert.ok(consume < firstView, 'OAuth token must be consumed before setView replaces the URL');
});

test('checkboxLabel includes item and context', () => {
  assert.equal(UI.checkboxLabel('habit', 'Đọc sách', '05/08'), 'Đọc sách · 05/08');
});

test('checkbox accessibility helper requires and escapes a non-empty label', () => {
  assert.equal(
    UI.checkboxA11y(true, 'Read "<today>"'),
    'role="checkbox" aria-checked="true" aria-label="Read &quot;&lt;today&gt;&quot;"'
  );
  assert.throws(() => UI.checkboxA11y(false, '   '), /label/i);
});

test('app exposes skip link and main landmark', () => {
  assert.match(APP, /class="skip-link"[^>]*href="#appMain"/);
  assert.match(APP, /<main[^>]*id="appMain"/);
});

test('landing exposes the refined marketing structure with one clear conversion path', () => {
  assert.equal((LANDING.match(/<h1\b/gi) || []).length, 1);
  [
    'landingNav', 'landingHero', 'productPreview', 'trustStrip',
    'featureNarrative', 'landingCtaFinal', 'landingFooter',
  ].forEach((id) => assert.match(LANDING, new RegExp(`id=["']${id}["']`)));
  assert.equal(
    (LANDING.match(/class=["'][^"']*hero-primary-cta[^"']*["'][^>]*href=["']app\.html["']/gi) || []).length,
    1
  );
  assert.doesNotMatch(LANDING, /class=["'][^"']*bricks\b/i);
});

test('landing product evidence is semantic, responsive, and linked by stable anchors', () => {
  assert.match(LANDING, /class=["'][^"']*product-preview[^"']*["']/);
  assert.match(LANDING, /class=["'][^"']*preview-sidebar[^"']*["']/);
  assert.match(LANDING, /class=["'][^"']*preview-metric-grid[^"']*["']/);
  ['features', 'workflow', 'product'].forEach((anchor) => {
    assert.match(LANDING, new RegExp(`id=["']${anchor}["']`));
  });
  assert.match(LANDING_CSS, /:where\(#features,\s*#workflow,\s*#product\)\s*{[^}]*scroll-margin-top:/s);
  assert.match(LANDING_CSS, /@media\s*\(max-width:\s*720px\)/);
  assert.match(LANDING_CSS, /overflow-wrap:\s*anywhere/);
});

test('landing preserves language and theme preferences without decorative emoji UI', () => {
  assert.match(LANDING, /planner-lang/);
  assert.match(LANDING, /planner-dark/);
  assert.match(LANDING, /id=["']langBtn["']/);
  assert.match(LANDING, /id=["']darkBtn["']/);
  assert.match(LANDING, /aria-pressed/);
  assert.doesNotMatch(LANDING, /[🎀🐥🪿🌸🌼📔📤📱🎯✅🌱🔥🏆]/u);
  assert.match(LANDING, /css\/tokens\.css\?v=5/);
  assert.match(LANDING_CSS, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('landing actions keep AA contrast and accessible names follow the selected language', () => {
  const action = LANDING_CSS.match(/--landing-action-bg:\s*(#[\da-f]{6})/i)?.[1];
  assert.ok(action, 'missing dedicated landing action color');
  assert.ok(contrastRatio(action, '#ffffff') >= 4.5, 'landing action must contrast with white text');
  assert.match(LANDING, /data-label-vi=["'][^"']+["']\s+data-label-en=["'][^"']+["']/);
  assert.match(LANDING, /querySelectorAll\('\[data-label-vi\]'\)/);
  assert.match(LANDING, /setAttribute\('aria-label',\s*element\.getAttribute\(labelAttribute\)\)/);
  assert.match(LANDING_CSS, /\.landing-skip\s*{[^}]*background:\s*var\(--landing-action-bg\)/s);
  assert.match(LANDING_CSS, /\.landing-cta-final\s+:where\(a,\s*button\):focus-visible\s*{[^}]*outline-color:\s*#fff/s);
});

test('application shell exposes responsive navigation and working surfaces', () => {
  ['desktopSidebar', 'mobileNav', 'appTopbar', 'toolsDrawer']
    .forEach((id) => assert.match(APP, new RegExp(`id=["']${id}["']`)));
  assert.match(APP, /class="[^"]*app-layout\b/);
  assert.match(APP, /class="[^"]*app-workspace\b/);
  assert.match(APP, /id="desktopSidebar"[^>]*aria-label=/);
  assert.match(APP, /id="mobileNav"[^>]*aria-label=/);
  assert.doesNotMatch(APP, /class="landing-hero"/);
});

test('application shell keeps one primary Add Task action and every header capability reachable', () => {
  assert.equal((APP.match(/class="[^"]*app-primary-action\b/g) || []).length, 1);
  assert.match(APP, /class="[^"]*app-primary-action\b[^>]*data-action="shell-add-task"/);
  [
    'prevyear', 'prevmonth', 'monthselect', 'nextmonth', 'nextyear', 'gotoday', 'reset',
    'remind-toggle', 'data-toggle', 'undo', 'redo', 'focus', 'search-toggle', 'template',
    'print', 'sync-toggle', 'theme', 'install-app', 'help-toggle', 'dark', 'lang', 'report',
  ].forEach((action) => assert.match(APP, new RegExp(`data-action=["']${action}["']`), `missing shell action: ${action}`));
  assert.match(APP, /class="[^"]*landing-link[^>]*href="index\.html"/);
});

test('responsive tools drawer keeps month navigation and history actions reachable', () => {
  const drawer = APP.slice(APP.indexOf('id="toolsDrawer"'), APP.indexOf('id="mobileNav"'));
  [
    ['drawerPrevMonth', 'prevmonth'],
    ['drawerMonthSelect', 'monthselect'],
    ['drawerNextMonth', 'nextmonth'],
    ['drawerUndo', 'undo'],
    ['drawerRedo', 'redo'],
  ].forEach(([id, action]) => {
    assert.match(drawer, new RegExp(`id=["']${id}["'][^>]*data-action=["']${action}["']`));
    assert.equal((APP.match(new RegExp(`id=["']${id}["']`, 'g')) || []).length, 1, `duplicate id: ${id}`);
  });
  assert.match(drawer, /id="drawerPrevMonth"[^>]*data-shell-icon="chevron-left"/);
  assert.match(drawer, /id="drawerNextMonth"[^>]*data-shell-icon="chevron-right"/);
  assert.match(drawer, /id="drawerUndo"[^>]*data-shell-icon="undo"[^>]*disabled/);
  assert.match(drawer, /id="drawerRedo"[^>]*data-shell-icon="redo"[^>]*disabled/);

  const shell = readRequiredAsset('css/app-shell.css');
  assert.match(shell, /\.tools-month-nav[\s\S]{0,500}min-height:\s*44px/);
});

test('month and undo state updates synchronize every responsive shell control', () => {
  assert.match(APP_JS, /querySelectorAll\('\[data-action="monthselect"\]'\)/);
  assert.match(APP_JS, /querySelectorAll\('\[data-action="undo"\]'\)/);
  assert.match(APP_JS, /querySelectorAll\('\[data-action="redo"\]'\)/);
  assert.doesNotMatch(APP_JS, /const sel = document\.getElementById\('monthSelect'\)/);
});

test('navigation renderer synchronizes every desktop and mobile destination', () => {
  assert.match(APP_JS, /querySelectorAll\('\[data-nav-view\]'\)/);
  assert.match(APP_JS, /setAttribute\('aria-current',\s*active\s*\?\s*'page'\s*:\s*'false'\)/);
  assert.match(APP_JS, /setAttribute\('aria-selected',\s*String\(active\)\)/);
  assert.match(APP_JS, /data-nav-view/);
  assert.doesNotMatch(APP_JS, /closest\('#navTabs \.tab'\)/);
});

test('keyboard navigation keeps its tab node when the selected week is unchanged', () => {
  assert.match(
    APP_JS,
    /const weekChanged = state\.currentWeek !== week;[\s\S]{0,120}state\.currentWeek = week;[\s\S]{0,120}if \(weekChanged\) buildNav\(\);/
  );
});

test('overview renderer exposes a refined productivity dashboard contract', () => {
  const overview = APP_JS.slice(
    APP_JS.indexOf('function renderOverview()'),
    APP_JS.indexOf('function dateCardHTML()')
  );
  assert.match(overview, /class="overview-page"/);
  assert.match(overview, /class="overview-header"/);
  assert.match(overview, /<h1[^>]*class="overview-title"/);
  assert.match(overview, /class="overview-metrics"/);
  assert.equal((overview.match(/class="metric metric--/g) || []).length, 4);
  assert.match(overview, /class="overview-primary-grid"/);
  assert.match(overview, /class="overview-widget/);
  assert.match(overview, /data-widget-id=/);
  assert.doesNotMatch(overview, /topIds|sceneCardHTML|chick-row|class="scene/);
});

test('overview keeps the persisted widget order in one ordered grid', () => {
  const overview = APP_JS.slice(
    APP_JS.indexOf('function renderOverview()'),
    APP_JS.indexOf('function dateCardHTML()')
  );
  assert.match(overview, /class="overview-primary-grid"[\s\S]{0,240}widgets\.map\(/);
  assert.doesNotMatch(overview, /primaryWidgets|supportWidgets|deferredWidgets|\.filter\(function \(w\)/);
});

test('overview metrics synchronize after inline goal and habit mutations', () => {
  const overview = APP_JS.slice(
    APP_JS.indexOf('function renderOverview()'),
    APP_JS.indexOf('function dateCardHTML()')
  );
  ['overview-week-value', 'overview-goals-value', 'overview-goals-meta', 'overview-habits-value', 'overview-habits-meta', 'overview-streak-value']
    .forEach((role) => assert.match(overview, new RegExp(`data-role="${role}"`)));
  assert.match(APP_JS, /function syncOverviewMetrics\(\)/);
  const goalToggle = APP_JS.slice(APP_JS.indexOf('function afterGoalToggle'), APP_JS.indexOf('function afterYearGoalToggle'));
  const habitToggle = APP_JS.slice(APP_JS.indexOf('function afterHabitToggle'), APP_JS.indexOf('function afterWGoalToggle'));
  assert.match(goalToggle, /syncOverviewMetrics\(\)/);
  assert.match(habitToggle, /syncOverviewMetrics\(\)/);
});

test('overview next priority synchronizes after an inline goal mutation', () => {
  const focusCard = APP_JS.slice(
    APP_JS.indexOf('function focusCardHTML()'),
    APP_JS.indexOf('function sceneCardHTML()')
  );
  assert.match(focusCard, /data-role="overview-focus-title"/);
  assert.match(APP_JS, /function syncOverviewFocus\(\)/);
  const goalToggle = APP_JS.slice(APP_JS.indexOf('function afterGoalToggle'), APP_JS.indexOf('function afterYearGoalToggle'));
  assert.match(goalToggle, /syncOverviewFocus\(\)/);
});

test('overview widget registry preserves IDs without rendering the decorative scene', () => {
  const registry = APP_JS.slice(
    APP_JS.indexOf('const WIDGET_DEFS_OVERVIEW'),
    APP_JS.indexOf('const WIDGET_DEFS_YEAR')
  );
  ['date-card', 'weekly-chart', 'scene-card', 'goals', 'habits', 'streak-heatmap', 'mood', 'badges']
    .forEach((id) => assert.match(registry, new RegExp(`id: '${id}'`)));
  assert.match(registry, /id: 'scene-card'[\s\S]{0,160}focusCardHTML/);
  assert.doesNotMatch(registry, /sceneCardHTML/);
});

test('overview styles contain wide data surfaces and stack widgets on mobile', () => {
  const styles = readRequiredAsset('css/styles.css');
  assert.match(styles, /\.overview-primary-grid\s*{[^}]*display:\s*grid/s);
  assert.match(styles, /\.overview-widget--deferred\s*{[^}]*content-visibility:\s*auto[^}]*contain-intrinsic-size:/s);
  assert.match(styles, /\.habit-table-wrap\s*{[^}]*overflow-x:\s*auto/s);
  const mobile = styles.slice(styles.indexOf('@media (max-width: 767px)'));
  assert.match(mobile, /\.overview-metrics[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(mobile, /\.overview-primary-grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});

test('overview widget settings control vertically centers its visible label', () => {
  const styles = readRequiredAsset('css/styles.css');
  assert.match(
    styles,
    /\.overview-header \.widget-settings-btn\s*{[^}]*align-items:\s*center[^}]*}/s
  );
});

test('overview habit grid has a named scroll region and table', () => {
  const habits = APP_JS.slice(
    APP_JS.indexOf('function habitPanelHTML()'),
    APP_JS.indexOf('/* ---------- Streak')
  );
  assert.match(habits, /class="habit-table-wrap"[^>]*role="region"[^>]*aria-label=/);
  assert.match(habits, /<table class="habit-table"[^>]*aria-label=/);
});

test('week renderer exposes a refined planning workspace contract', () => {
  const week = APP_JS.slice(
    APP_JS.indexOf('function renderWeek()'),
    APP_JS.indexOf('function weeklyGoalsHTML')
  );
  assert.match(week, /class="week-page"/);
  assert.match(week, /class="week-page-header"/);
  assert.match(week, /<h1[^>]*class="week-page-title"/);
  assert.match(week, /class="week-goals-summary"/);
  assert.match(week, /class="week-support-grid"/);
  assert.match(week, /class="week-day-selector"/);
  assert.match(week, /class="week-day-list"/);
  assert.match(week, /weekHabitsHTML\(w\)/);
  assert.match(week, /data-action="week-report"/);
  assert.match(week, /data-role="pomo-widget"/);
  assert.match(week, /reflectionHTML\(/);
  assert.doesNotMatch(week, /week-banner|w-chick-on-bar/);
});

test('week day renderer emits seven labeled, addressable panels', () => {
  const dayPanel = APP_JS.slice(
    APP_JS.indexOf('function dayColumnHTML'),
    APP_JS.indexOf('function taskRowHTML')
  );
  assert.match(dayPanel, /<section[^>]*class="week-day-panel/);
  assert.match(dayPanel, /id="week-day-\$\{w\.n\}-\$\{di\}"/);
  assert.match(dayPanel, /aria-labelledby="week-day-title-\$\{w\.n\}-\$\{di\}"/);
  assert.match(dayPanel, /<h2[^>]*id="week-day-title-/);
  assert.match(APP_JS, /w\.days\.map\(\(d, di\) => dayColumnHTML\(w, di, isDayToday\(d\)\)\)/);
});

test('mobile week selector scrolls and focuses the chosen day panel', () => {
  assert.match(APP_JS, /data-action="day-jump"[^>]*data-day-target=/);
  assert.match(APP_JS, /act === 'day-jump'[\s\S]{0,300}scrollIntoView\(\{ behavior: prefersReducedMotion\(\) \? 'auto' : 'smooth'/);
  assert.match(APP_JS, /target\.focus\(\{ preventScroll: true \}\)/);
});

test('week workspace uses responsive panels without page-level horizontal scrolling', () => {
  const styles = readRequiredAsset('css/styles.css');
  assert.match(styles, /\.week-day-list\s*{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(styles, /\.week-day-panel\s*{[^}]*min-width:\s*0/s);
  assert.match(styles, /\.week-day-selector\s*{[^}]*display:\s*none/s);
  const mobile = styles.slice(styles.lastIndexOf('@media (max-width: 767px)'));
  assert.match(mobile, /\.week-day-selector\s*{[^}]*display:\s*flex/s);
  assert.match(mobile, /\.week-day-list\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});

test('week goal strips use content height so they stay inside their card', () => {
  const styles = readRequiredAsset('css/styles.css');
  assert.match(
    styles,
    /\.week-goals-card \.legend-groups\s*{[^}]*height:\s*auto[^}]*}/s
  );
});

test('week progress bars stay synchronized after inline task and goal changes', () => {
  assert.match(APP_JS, /data-role="w-progress"/);
  assert.match(APP_JS, /data-role="day-progress"[^>]*data-day="\$\{di\}"/);
  const goalSync = APP_JS.slice(APP_JS.indexOf('function afterWGoalToggle'), APP_JS.indexOf('function refreshTaskUI'));
  assert.match(goalSync, /wProgress\.setAttribute\('aria-valuenow', String\(st\.pct\)\)/);
  const taskSync = APP_JS.slice(APP_JS.indexOf('function refreshTaskUI'), APP_JS.indexOf('Đồng bộ thời gian thực'));
  assert.match(taskSync, /dayProgress\.setAttribute\('aria-valuenow', String\(p\)\)/);
  assert.match(taskSync, /dayProgressFill\.style\.width = p \+ '%'/);
});

test('empty week days report zero progress instead of NaN', () => {
  const source = APP_JS.match(/function dayPct\(day\)\s*\{[^}]*}/)?.[0];
  assert.ok(source, 'missing dayPct helper');
  const dayPct = new Function(`${source}; return dayPct;`)();
  assert.equal(dayPct({ tasks: [] }), 0);
});

test('print layout targets the refined seven-day week grid', () => {
  const styles = readRequiredAsset('css/styles.css');
  const print = styles.slice(styles.lastIndexOf('@media print'));
  assert.match(print, /\.week-day-list[^}]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(print, /\.week-day-panel[^}]*break-inside:\s*avoid/s);
  assert.match(print, /\.week-day-list[^}]*overflow:\s*visible\s*!important/s);
  assert.doesNotMatch(print, /\.week-page-header[^}]*display:\s*none/s);
  assert.match(print, /\.week-page-actions[^}]*display:\s*none\s*!important/s);
  assert.match(print, /\.week-support-grid\s*{[^}]*display:\s*block/s);
  assert.match(print, /\.week-reflection-card\s*{[^}]*display:\s*block/s);
});

test('year renderer exposes the refined annual planning contract', () => {
  const year = APP_JS.slice(APP_JS.indexOf('function renderYear()'), APP_JS.indexOf('function yearCardHTML'));
  assert.match(year, /class="year-page"/);
  assert.match(year, /<h1[^>]*class="year-page-title"/);
  assert.match(year, /class="year-summary"/);
  assert.match(APP_JS, /class="[^"]*\byear-goal-grid\b/);
  assert.match(APP_JS, /class="[^"]*\bquarter-grid\b/);
  assert.match(APP_JS, /class="[^"]*\bmonth-progress-grid\b/);
  assert.doesNotMatch(year, /year-banner|year-top/);
});

test('year summary synchronizes after an inline annual-goal change', () => {
  assert.match(APP_JS, /data-role="year-summary-goals"/);
  assert.match(APP_JS, /data-role="year-summary-goals-pct"/);
  const sync = APP_JS.slice(APP_JS.indexOf('function afterYearGoalToggle'), APP_JS.indexOf('function afterHabitToggle'));
  assert.match(sync, /yearSummaryGoals[^]*textContent = gs\.done \+ '\/' \+ gs\.total/);
  assert.match(sync, /yearSummaryPct[^]*textContent = gs\.pct \+ '%'/);
});

test('calendar renders one heading with desktop grid and mobile agenda from shared entries', () => {
  const calendar = APP_JS.slice(APP_JS.indexOf('function renderCalendar()'), APP_JS.indexOf('Phase 2: Template'));
  assert.match(calendar, /class="calendar-page"/);
  assert.match(calendar, /<h1[^>]*class="calendar-page-title"/);
  assert.match(calendar, /class="calendar-grid-desktop"/);
  assert.match(calendar, /class="calendar-agenda-mobile"/);
  assert.match(calendar, /calendarDayEntries\(\)/);
  assert.match(calendar, /calendarVisibleTasks\(/);
  assert.match(APP_JS, /function calendarVisibleTasks\(entry\)/);
  assert.match(APP_JS, /function calendarDayPct\(day\)/);
  assert.match(APP_JS, /String\(task\.text \|\| ''\)\.trim\(\)/);
});

test('calendar responsive contract keeps grid desktop and agenda mobile', () => {
  const styles = readRequiredAsset('css/styles.css');
  assert.match(styles, /\.calendar-grid-desktop\s*{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(7,/s);
  assert.match(styles, /\.calendar-agenda-mobile\s*{[^}]*display:\s*none/s);
  const mobile = styles.slice(styles.lastIndexOf('@media (max-width: 720px)'));
  assert.match(mobile, /\.calendar-grid-desktop\s*{[^}]*display:\s*none/s);
  assert.match(mobile, /\.calendar-agenda-mobile\s*{[^}]*display:\s*grid/s);
});

test('shared dialog and drawer API manages focus, dismissal, and feedback', () => {
  const ui = readRequiredAsset('js/ui.js');
  assert.match(ui, /function openDialog\(id, opener/);
  assert.match(ui, /function closeDialog\(id\)/);
  assert.match(ui, /function openDrawer\(id, opener/);
  assert.match(ui, /function closeDrawer\(id\)/);
  assert.match(ui, /function toast\(message, kind/);
  assert.match(ui, /event\.key [!=]== 'Tab'/);
  assert.match(ui, /event\.key === 'Escape'/);
  assert.match(ui, /return \{[^}]*openDialog[^}]*closeDialog[^}]*openDrawer[^}]*closeDrawer[^}]*toast/s);
});

test('all application dialogs have named headings and a polite toast region', () => {
  const html = readRequiredAsset('app.html');
  assert.match(html, /id="toastRegion"[^>]*aria-live="polite"/);
  const dialogCards = [...html.matchAll(/<[^>]+role="dialog"[^>]*>/g)].map((match) => match[0]);
  assert.ok(dialogCards.length >= 12, `expected at least 12 dialogs, found ${dialogCards.length}`);
  dialogCards.forEach((tag) => assert.match(tag, /aria-labelledby="[^"]+"/, tag));
  const labelledBy = dialogCards.map((tag) => tag.match(/aria-labelledby="([^"]+)"/)[1]);
  labelledBy.forEach((id) => assert.match(html, new RegExp(`id="${id}"`), `missing heading ${id}`));
  assert.match(html, /id="syncModal"[^>]*hidden[^]*class="sync-modal-card dialog"[^>]*role="dialog"/);
});

test('authentication forms expose inline error containers', () => {
  const html = readRequiredAsset('app.html');
  ['syncUserError', 'syncPassError', 'syncPass2Error', 'pwCurrentError', 'pwNewError'].forEach((id) => {
    assert.match(html, new RegExp(`<p[^>]*class="field-error"[^>]*id="${id}"`));
  });
  assert.match(APP_JS, /function setFieldError\(/);
  assert.match(APP_JS, /function clearFormErrors\(/);
});

test('routine completion feedback uses non-blocking toasts', () => {
  assert.match(APP_JS, /TaskFlowUI\.toast\(t\('shareDone'\)/);
  assert.match(APP_JS, /TaskFlowUI\.toast\(t\('templateDone'/);
  assert.match(APP_JS, /TaskFlowUI\.toast\(t\('pomoDoneWork'/);
  assert.doesNotMatch(APP_JS, /alert\(t\('shareDone'\)/);
});

test('onboarding Escape follows the persisted skip action', () => {
  const html = readRequiredAsset('app.html');
  const ui = readRequiredAsset('js/ui.js');
  assert.match(html, /data-action="ob-skip"[^>]*data-dialog-dismiss/);
  assert.match(ui, /querySelector\('\[data-dialog-dismiss\],[^']*data-action\$="-close"/);
  assert.match(APP_JS, /act === 'ob-skip'[\s\S]{0,120}obFinish\(\)/);
  assert.match(APP_JS, /function obFinish\(\)[\s\S]{0,180}localStorage\.setItem\(ONBOARD_KEY, '1'\)/);
});

test('tools drawer supports dismissal and focus restoration', () => {
  const ui = readRequiredAsset('js/ui.js');
  assert.match(APP_JS, /function openToolsDrawer\(/);
  assert.match(APP_JS, /function closeToolsDrawer\(/);
  assert.match(APP_JS, /TaskFlowUI\.openDrawer\('toolsDrawer', opener\)/);
  assert.match(APP_JS, /TaskFlowUI\.closeDrawer\('toolsDrawer'\)/);
  assert.match(APP_JS, /toolsDrawerReturnFocusSelector[^]*#mobileNav \[data-action="tools-open"\]/);
  assert.match(APP_JS, /returnTarget\.getClientRects\(\)\.length[^]*returnTarget\.focus\(\)/);
  assert.match(ui, /opener\.isConnected[^]*opener\.getClientRects\(\)\.length[^]*opener\.focus\(\)/);
  assert.match(ui, /event\.key === 'Escape'[^]*requestLayerClose\(id\)/);
  assert.match(APP, /id="toolsDrawerBackdrop"[^>]*data-action="tools-close"/);
});

test('mobile floating tools clear the fixed bottom navigation', () => {
  const shell = readRequiredAsset('css/app-shell.css');
  const mobile = shell.slice(shell.indexOf('@media (max-width: 767px)'));
  assert.match(mobile, /body\s+\.pomo-fab-wrap[\s\S]{0,160}bottom:\s*calc\([^)]*safe-area-inset-bottom[^)]*\)/);
  assert.match(mobile, /body\s+\.fb-fab-wrap[\s\S]{0,160}bottom:\s*calc\([^)]*safe-area-inset-bottom[^)]*\)/);
});

test('shell hides the skip link until focus and removes decorative nav emoji', () => {
  const shell = readRequiredAsset('css/app-shell.css');
  assert.match(shell, /\.skip-link\s*{[^}]*position:\s*fixed[^}]*transform:\s*translateY\(-150%\)/s);
  assert.match(shell, /\.skip-link:focus-visible\s*{[^}]*transform:\s*translateY\(0\)/s);
  assert.match(APP_JS, /function shellNavLabel\(/);
  assert.match(APP_JS, /label:\s*shellNavLabel\(t\('tabOverview'\)\)/);
  assert.match(APP_JS, /label:\s*shellNavLabel\(t\('tabCalendar'\)\)/);
});

test('setView synchronizes the selected view and plan period to the URL', () => {
  assert.match(
    APP_JS,
    /TaskFlowUI\.syncUrl\(\{\s*view,\s*year:\s*PLAN_YEAR,\s*month:\s*PLAN_MONTH,\s*week:\s*view === 'week' \? state\.currentWeek : undefined,\s*tags:\s*view === 'calendar' \? calendarTagFilters : undefined,?\s*\}\);/
  );
  assert.match(
    APP_JS,
    /dl\.view === 'week' && dl\.week !== null && dl\.week <= NUM_WEEKS[\s\S]{0,80}state\.currentWeek = dl\.week/
  );
});

test('every generated checkbox receives a meaningful accessible label', () => {
  assert.match(APP_JS, /function checkboxHTML\(mod, checked, attrs = '', label\)/);
  assert.match(APP_JS, /TaskFlowUI\.checkboxA11y\(checked, label\)/);

  const callLines = APP_JS
    .split(/\r?\n/)
    .filter((line) => line.includes('checkboxHTML(') && !line.includes('function checkboxHTML'));
  assert.ok(callLines.length > 0, 'expected generated checkbox call sites');
  callLines.forEach((line) => {
    assert.match(line, /TaskFlowUI\.checkboxLabel\(/, `missing accessible label: ${line.trim()}`);
  });
});

test('service worker caches the UI helper with the reviewed cache version', () => {
  assert.match(SW, /const CACHE = 'taskflow-v67';/);
  assert.match(SW, /['"]\.\/js\/ui\.js['"]/);
});

test('design system assets load before legacy styles and expose stable shell roots', () => {
  assert.match(
    APP,
    /css\/tokens\.css[^]*css\/components\.css[^]*css\/app-shell\.css[^]*css\/styles\.css/
  );

  const shell = readRequiredAsset('css/app-shell.css');
  assert.match(shell, /\.app-layout\s*{[^}]*min-height:\s*100dvh[^}]*}/);
  assert.match(shell, /\.app-workspace\s*{[^}]*min-width:\s*0[^}]*}/);
});

test('design system tokens define every semantic role for light themes and dark mode', () => {
  const tokens = readRequiredAsset('css/tokens.css');
  const roles = [
    'canvas', 'sidebar', 'surface', 'surface-muted', 'text', 'text-muted', 'border',
    'accent', 'accent-soft', 'positive', 'warning', 'danger', 'info',
  ];
  roles.forEach((role) => assert.match(tokens, new RegExp(`--color-${role}:`)));

  ['mint', 'lavender', 'peach'].forEach((theme) => {
    assert.match(tokens, new RegExp(`\\[data-theme=["']${theme}["']\\]`));
  });
  assert.match(tokens, /\[data-dark=["']true["']\][^{]*{[^}]*--color-canvas:[^}]*--color-text:/s);
  assert.match(tokens, /--radius-control:\s*9px/);
  assert.match(tokens, /--radius-panel:\s*14px/);
  assert.match(tokens, /--focus-ring:/);
});

test('design system components include accessibility, motion, and numeric contracts', () => {
  const components = readRequiredAsset('css/components.css');
  ['ui-icon', 'button', 'icon-button', 'field', 'metric', 'dialog', 'drawer', 'toast-region']
    .forEach((className) => assert.match(components, new RegExp(`\\.${className}\\b`)));

  ['button', 'a', 'input', 'select', 'textarea', '\\[contenteditable\\]']
    .forEach((selector) => assert.match(components, new RegExp(`${selector}[^,{]*:focus-visible`)));
  assert.match(components, /font-variant-numeric:\s*tabular-nums/);
  assert.match(components, /overscroll-behavior:\s*contain/);
  assert.match(components, /@media\s*\(prefers-reduced-motion:\s*reduce\)[^]*transition:\s*none\s*!important/);
  const touchRules = components.slice(components.indexOf('@media (max-width: 720px)'));
  assert.match(touchRules, /min-width:\s*44px/);
  assert.match(touchRules, /min-height:\s*44px/);

  const legacy = readRequiredAsset('css/styles.css');
  const chatChip = legacy.match(/\.chat-chip\s*{([^}]*)}/)?.[1] || '';
  assert.doesNotMatch(chatChip, /transition:\s*all\b/);
});

test('design system local sprite provides the complete currentColor icon set', () => {
  const sprite = readRequiredAsset('icons/ui-sprite.svg');
  const symbols = [
    'overview', 'week', 'year', 'calendar', 'focus', 'report', 'search', 'plus', 'more',
    'settings', 'undo', 'redo', 'bell', 'data', 'sync', 'help', 'theme', 'print', 'close',
    'chevron-left', 'chevron-right',
  ];
  symbols.forEach((symbol) => assert.match(sprite, new RegExp(`<symbol[^>]+id=["']${symbol}["']`)));
  assert.match(sprite, /stroke=["']currentColor["']/);
  assert.match(sprite, /stroke-width=["'](?:1\.75|1\.8|2)["']/);
});

test('design system and landing assets are available in the v64 offline shell', () => {
  assert.match(SW, /const CACHE = 'taskflow-v67';/);
  [
    './css/tokens.css', './css/components.css', './css/app-shell.css',
    './css/landing.css', './icons/ui-sprite.svg', './js/ui.js', './index.html',
  ].forEach((asset) => assert.match(SW, new RegExp(`["']${asset.replaceAll('.', '\\.')}["']`)));
});

test('hardening: versioned static requests use query-insensitive offline cache matching', async () => {
  const handlers = {};
  const matchCalls = [];
  const cachedResponse = { source: 'precache' };
  const context = {
    URL,
    location: { origin: 'https://taskflow.test' },
    caches: {
      match(request, options) {
        matchCalls.push({ request, options });
        return Promise.resolve(cachedResponse);
      },
      open() {
        return Promise.resolve({ put() {} });
      },
      keys() { return Promise.resolve([]); },
    },
    fetch() { return Promise.reject(new Error('offline')); },
    self: {
      addEventListener(type, handler) { handlers[type] = handler; },
      clients: { claim() {} },
      skipWaiting() {},
      registration: { showNotification() {} },
    },
  };
  vm.runInNewContext(SW, context);

  let responsePromise;
  handlers.fetch({
    request: { method: 'GET', mode: 'cors', url: 'https://taskflow.test/css/tokens.css?v=5' },
    respondWith(promise) { responsePromise = promise; },
  });

  assert.equal(await responsePromise, cachedResponse);
  assert.equal(matchCalls.length, 1);
  assert.equal(matchCalls[0].options?.ignoreSearch, true);
});

test('release: offline app deep links resolve the cached app shell instead of landing', async () => {
  const handlers = {};
  const matchCalls = [];
  const appShell = { source: 'app-shell' };
  const context = {
    URL,
    location: { origin: 'https://taskflow.test' },
    caches: {
      match(request, options) {
        matchCalls.push({ request, options });
        if (options?.ignoreSearch && String(request.url || request).includes('app.html')) {
          return Promise.resolve(appShell);
        }
        return Promise.resolve(undefined);
      },
      open() { return Promise.resolve({ put() {} }); },
      keys() { return Promise.resolve([]); },
    },
    fetch() { return Promise.reject(new Error('offline')); },
    self: {
      addEventListener(type, handler) { handlers[type] = handler; },
      clients: { claim() {} },
      skipWaiting() {},
      registration: { showNotification() {} },
    },
  };
  vm.runInNewContext(SW, context);

  let responsePromise;
  handlers.fetch({
    request: {
      method: 'GET', mode: 'navigate',
      url: 'https://taskflow.test/app.html?view=overview&m=2026-08',
    },
    respondWith(promise) { responsePromise = promise; },
  });

  assert.equal(await responsePromise, appShell);
  assert.equal(matchCalls[0].options?.ignoreSearch, true);
  assert.match(String(matchCalls[0].request.url || matchCalls[0].request), /app\.html/);
});

test('hardening: muted text meets 4.5 contrast against every theme canvas', () => {
  const tokens = readRequiredAsset('css/tokens.css');
  for (const theme of ['cream', 'mint', 'lavender', 'peach']) {
    for (const dark of [false, true]) {
      const values = effectiveThemeTokens(tokens, theme, dark);
      const ratio = contrastRatio(values['--color-text-muted'], values['--color-canvas']);
      assert.ok(ratio >= 4.5, `${theme} ${dark ? 'dark' : 'light'} muted/canvas contrast is ${ratio.toFixed(3)}`);
    }
  }
});

test('hardening: control borders and focus indicators meet non-text contrast', () => {
  const tokens = readRequiredAsset('css/tokens.css');
  const components = readRequiredAsset('css/components.css');
  const legacy = readRequiredAsset('css/styles.css');
  for (const theme of ['cream', 'mint', 'lavender', 'peach']) {
    for (const dark of [false, true]) {
      const values = effectiveThemeTokens(tokens, theme, dark);
      for (const surface of ['--color-canvas', '--color-surface']) {
        const controlRatio = contrastRatio(values['--color-control-border'], values[surface]);
        const focusRatio = contrastRatio(values['--color-focus'], values[surface]);
        assert.ok(controlRatio >= 3, `${theme} ${dark ? 'dark' : 'light'} control/${surface} is ${controlRatio.toFixed(3)}`);
        assert.ok(focusRatio >= 3, `${theme} ${dark ? 'dark' : 'light'} focus/${surface} is ${focusRatio.toFixed(3)}`);
      }
    }
  }

  assert.match(components, /border:\s*1px solid var\(--color-control-border\)/);
  const finalFocus = legacy.lastIndexOf(':root :is(');
  assert.ok(finalFocus > legacy.lastIndexOf('outline: none'), 'focus rule must follow legacy outline suppression');
  assert.match(legacy.slice(finalFocus), /:focus-visible\s*{[^}]*outline:\s*3px solid var\(--color-focus\)/s);
});

test('hardening: current shell targets are 44px without expanding dense planner grids', () => {
  const components = readRequiredAsset('css/components.css');
  const touchStart = components.indexOf('@media (max-width: 720px)');
  const touchEnd = components.indexOf('@media (prefers-reduced-motion:', touchStart);
  const touchRules = components.slice(touchStart, touchEnd);
  ['btn-month', 'header-btn', 'tab', 'pop-btn', 'btn-icon', 'theme-dot']
    .forEach((className) => assert.match(touchRules, new RegExp(`\\.${className}\\b`)));
  assert.match(touchRules, /min-width:\s*44px/);
  assert.match(touchRules, /min-height:\s*44px/);
  assert.doesNotMatch(touchRules, /\.checkbox\b|\.habit-table\b/);
  assert.match(components, /Dense planner grid checkboxes[^]*intentionally excluded/i);
});

test('hardening: reduced-motion helper suppresses confetti and smooth journey scrolling', () => {
  const helperSource = APP_JS.match(/function prefersReducedMotion\([^)]*\)\s*{[^}]*}/)?.[0];
  assert.ok(helperSource, 'missing prefersReducedMotion helper');
  const helper = new Function(`${helperSource}; return prefersReducedMotion;`)();
  assert.equal(helper(() => ({ matches: true })), true);
  assert.equal(helper(() => ({ matches: false })), false);
  assert.equal(helper(null), false);
  assert.match(APP_JS, /function confettiBurst\(\)\s*{\s*if \(prefersReducedMotion\(\)\) return;/);
  assert.match(APP_JS, /scrollIntoView\(\{\s*behavior:\s*prefersReducedMotion\(\) \? 'auto' : 'smooth'/);
});

test('hardening: browser theme metadata follows semantic cream and dark canvases', () => {
  assert.match(APP, /<meta name="theme-color" content="#f4f0e9"/i);
  assert.match(APP_JS, /mc\.setAttribute\('content', on \? '#1b1917' : '#f4f0e9'\)/i);
});

test('release: inactive views stay hidden and unrelated views are not rendered', () => {
  const styles = readRequiredAsset('css/styles.css');
  assert.match(styles, /\.view\s*{\s*display:\s*none/);
  assert.match(styles, /\.view\.active\s*{\s*display:\s*block/);
  const setViewSource = APP_JS.slice(APP_JS.indexOf('function setView('), APP_JS.indexOf('function goWeek('));
  assert.match(setViewSource, /if \(view === 'overview'\)[^]*renderOverview\(\)[^]*else if \(view === 'week'\)[^]*renderWeek\(\)/);
  assert.match(setViewSource, /else if \(view === 'calendar'\)[^]*renderCalendar\(\)[^]*else[^]*renderYear\(\)/);
});

test('release: deferred overview content and reduced motion avoid unnecessary work', () => {
  const styles = readRequiredAsset('css/styles.css');
  const components = readRequiredAsset('css/components.css');
  assert.match(styles, /\.overview-widget--deferred\s*{[^}]*content-visibility:\s*auto[^}]*contain-intrinsic-size:/s);
  assert.match(components, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(LANDING_CSS, /@media\s*\(prefers-reduced-motion:\s*reduce\)[^]*transition:\s*none\s*!important/);
});

test('release: frontend CSS avoids transition-all and restores suppressed outlines', () => {
  const sources = ['css/components.css', 'css/app-shell.css', 'css/styles.css', 'css/landing.css']
    .map(readRequiredAsset);
  sources.forEach((source) => assert.doesNotMatch(source, /transition:\s*all\b/));
  const styles = sources[2];
  assert.ok(styles.lastIndexOf(':root :is(') > styles.lastIndexOf('outline: none'));
});

test('release: redundant emoji is removed from tool labels backed by local icons', () => {
  assert.match(APP_JS, /todayTxt:\s*'Hôm nay'/);
  assert.match(APP_JS, /dataTitle:\s*'Dữ liệu của bạn'/);
  assert.match(APP_JS, /remindTitle:\s*'Nhắc việc hằng ngày'/);
  assert.doesNotMatch(APP_JS, /todayTxt:\s*'[📍]|dataTitle:\s*'[💾]|remindTitle:\s*'[🔔]/u);
});
