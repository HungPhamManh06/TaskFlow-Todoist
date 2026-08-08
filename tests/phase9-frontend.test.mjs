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
const DEEPLINK_JS = readFileSync(path.join(ROOT, 'js/deeplink.js'), 'utf8');
const UI_JS = readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');

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
    view: 'week', year: 2026, month: 7, week: 6, quick: false,
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
});test('keyboard navigation keeps its tab node when the selected week is unchanged', () => {
  assert.match(
    APP_JS,
    /const weekChanged = state\.currentWeek !== week;[\s\S]{0,120}state\.currentWeek = week;[\s\S]{0,120}if \(weekChanged\) buildNav\(\);/ 
  );
});

test('sidebar groups navigation into MAIN/PLAN/TRACK with tooltips', () => {
  assert.match(APP_JS, /navGroupMain/);
  assert.match(APP_JS, /navGroupPlan/);
  assert.match(APP_JS, /navGroupTrack/);
  assert.match(APP_JS, /app-nav-group-label/);
  assert.match(APP_JS, /data-tooltip=\"\$\{esc\(item\.label\)\}\"/);
  // mobile nav stays flat (unchanged)
  assert.match(APP_JS, /app-mobile-nav-item/);
  assert.match(APP_JS, /data-action=\"tools-open\"/);
  // secondary keeps tools + profile + landing (focus/report moved to TRACK)
  assert.match(APP, /data-action=\"profile-open\"/);
  assert.doesNotMatch(APP, /data-action=\"focus\"[^>]*\/?>\s*<span>Chế độ tập trung<\/span>[\s\S]{0,80}data-action=\"report\"/);
  // Phase 6: PLAN = Tổng quan → Tuần → Năm; TRACK = Thói quen → Focus → Lịch → Báo cáo
  assert.match(APP_JS, /byView\.overview, byView\.week, byView\.year/);
  assert.match(APP_JS, /actionBtn\('habits', 'habit', shellNavLabel\(t\('habitTitle'\)\)\)/);
  assert.match(APP_JS, /actionBtn\('focus', 'focus'/);
  assert.match(APP_JS, /byView\.calendar,/);
  assert.match(APP_JS, /actionBtn\('report', 'report'/);
  assert.match(APP_JS, /act === 'habits'/);
  assert.match(APP_JS, /scrollIntoView\(\{ behavior: 'smooth'/);
});

test('sidebar collapse persists state and swaps button label', () => {
  assert.match(APP_JS, /planner-sidebar-collapsed/);
  assert.match(APP_JS, /function toggleSidebarCollapse/);
  assert.match(APP_JS, /function applySidebarCollapse/);
  assert.match(APP_JS, /sidebar-collapsed/);
  assert.match(APP, /data-action=\"sidebar-collapse\"/);
  assert.match(APP, /data-shell-icon=\"chevron-left\"/);
  const shell = readRequiredAsset('css/app-shell.css');
  assert.match(shell, /\.app-layout\.sidebar-collapsed\s*{[^}]*grid-template-columns:\s*72px/);
  assert.match(shell, /\.app-nav-group-label/);
  assert.match(shell, /sidebar-collapsed [\s\S]{0,60}\[data-tooltip\]::after/);
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

test('Phase 7: unified empty states with CTA actions and dedup toasts', () => {
  const ui = readRequiredAsset('js/ui.js');
  // emptyStateHTML supports CTA action buttons
  assert.match(APP_JS, /function emptyStateHTML\(icon, titleKey, hintKey, actions\)/);
  assert.match(APP_JS, /class=\"empty-actions\"/);
  assert.match(APP_JS, /class=\"empty-btn\" data-action=\"\$\{esc\(a\.action\)\}\"/);
  // Today / Inbox / Upcoming / Search all route through the shared helper
  assert.match(APP_JS, /emptyStateHTML\('🎯', 'todayEmpty', 'todayEmptySub'/);
  assert.match(APP_JS, /emptyStateHTML\('📥', 'inboxEmpty', 'inboxEmptySub'/);
  assert.match(APP_JS, /emptyStateHTML\('🗓️', 'upcomingEmpty', 'upcomingEmptySub'/);
  assert.match(APP_JS, /emptyStateHTML\('🔍', 'searchEmpty', 'searchEmptySub'\)/);
  assert.match(APP_JS, /emptyStateHTML\('🐥', 'searchNoResults', 'searchNoResultsSub'\)/);
  // toast dedup + action button + max-4 cap
  assert.match(ui, /toast\(message, kind = 'info', duration = 4200, actions\)/);
  assert.match(ui, /dataset\.toastKey === message/);
  assert.match(ui, /while \(region\.children\.length >= 4\) region\.firstChild\.remove\(\)/);
  assert.match(ui, /btn\.className = 'toast-action'/);
  assert.match(ui, /function dismissToast\(item\)/);
  // deltask shows undo toast with snapshot BEFORE splice
  assert.match(APP_JS, /pushUndo\(\); \/\/ snapshot TRƯỚC khi xóa/);
  assert.match(APP_JS, /TaskFlowUI\.toast\(t\('taskDeletedToast'\), 'info', 6000, \[/);
  assert.match(APP_JS, /label: t\('undoBtnShort'\), onClick: \(\) => doUndo\(\)/);
  // undo consistency: inbox in snapshot, inbox-del + td-delete also push undo + toast
  assert.match(APP_JS, /inbox: Array\.isArray\(inbox\) \? JSON\.parse\(JSON\.stringify\(inbox\)\) : \[\]/);
  assert.match(APP_JS, /if \(Array\.isArray\(snap\.inbox\)\) \{ inbox = JSON\.parse\(JSON\.stringify\(snap\.inbox\)\); \}/);
  assert.match(APP_JS, /act === 'inbox-del'/);
  assert.match(APP_JS, /act === 'td-delete'/);
  // dedup reuses element but can attach missing action button
  assert.match(ui, /!existing\.querySelector\('.toast-action'\)/);
  // i18n keys exist in both languages
  assert.match(APP_JS, /taskDeletedToast: 'Đã xóa task'/);
  assert.match(APP_JS, /taskDeletedToast: 'Task deleted'/);
  assert.match(APP_JS, /emptyPlanWeek: 'Lên kế hoạch tuần'/);
  assert.match(APP_JS, /emptyPlanWeek: 'Plan the week'/);
  // CSS: empty-actions + toast-action
  const css = readRequiredAsset('css/styles.css');
  const comp = readRequiredAsset('css/components.css');
  assert.match(css, /\.empty-actions/);
  assert.match(css, /\.empty-btn\s*\{/);
  assert.match(comp, /\.toast\s*\{ display: flex; align-items: center; gap: 10px; \}/);
  assert.match(comp, /\.toast-action\s*\{/);
});

test('Phase 8: privacy and terms pages exist with code-accurate claims', () => {
  const privacy = readRequiredAsset('privacy.html');
  const terms = readRequiredAsset('terms.html');
  const legalCss = readRequiredAsset('css/legal.css');
  // Pages exist with canonical + SEO
  assert.match(privacy, /<title>Chính sách bảo mật — TaskFlow<\/title>/);
  assert.match(privacy, /rel=\"canonical\" href=\"https:\/\/taskflow-todoist\.vercel\.app\/privacy\"/);
  assert.match(terms, /<title>Điều khoản sử dụng — TaskFlow<\/title>/);
  assert.match(terms, /rel=\"canonical\" href=\"https:\/\/taskflow-todoist\.vercel\.app\/terms\"/);
  // Claims must match the actual code (server/auth.js + schema.sql)
  assert.match(privacy, /bcrypt.*10 vòng/s);
  assert.match(privacy, /JWT.*30 ngày/s);
  assert.match(privacy, /10 lần mỗi 15 phút/);
  assert.match(privacy, /on delete cascade/);
  assert.match(privacy, /anonymize_ip/);
  assert.match(privacy, /POST \/api\/sync/);
  assert.match(privacy, /planner_state/);
  // GA4 placeholder -> honestly says disabled
  assert.match(privacy, /đang <strong>tắt<\/strong>/);
  // localStorage offline-first claim
  assert.match(privacy, /localStorage của chính trình duyệt/);
  // export paths match app.js (collectAllData / CSV / ICS)
  assert.match(privacy, /Xuất JSON \(sao lưu\)/);
  assert.match(privacy, /Xuất CSV/);
  assert.match(privacy, /Xuất ICS/);
  // terms basics
  assert.match(terms, /miễn phí/);
  assert.match(terms, /as-is/);
  assert.match(terms, /data loss|mất dữ liệu/);
  // Landing footer links to both pages
  assert.match(LANDING, /href=\"privacy\.html\"/);
  assert.match(LANDING, /href=\"terms\.html\"/);
  // Legal pages link back to landing and app
  assert.match(privacy, /href=\"app\.html\"/);
  assert.match(privacy, /href=\"index\.html\"/);
  assert.match(terms, /href=\"privacy\.html\"/);
  // Legal CSS used by both
  assert.match(privacy, /css\/legal\.css\?v=\d+/);
  assert.match(terms, /css\/legal\.css\?v=\d+/);
  assert.match(legalCss, /\.legal-page/);
  assert.match(legalCss, /\.legal-section h2/);
  assert.match(legalCss, /\.legal-list/);
  // i18n + dark mode pattern present on both
  assert.match(privacy, /data-t-vi/);
  assert.match(privacy, /planner-dark/);
  assert.match(terms, /data-t-en/);
  assert.match(terms, /planner-dark/);
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
    /TaskFlowUI\.syncUrl\(\{\s*view,\s*year:\s*PLAN_YEAR,\s*month:\s*PLAN_MONTH,\s*week:\s*view === 'week' \? state\.currentWeek : \(view === 'day' \? state\.dayWeek : undefined\),?\s*day:\s*view === 'day' \? state\.dayDay : undefined,\s*tags:\s*view === 'calendar' \? calendarTagFilters : undefined,?\s*\}\);/
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

test('gamification XP, smart repeat carry-over and .ics export are wired end-to-end', () => {
  // XP & Level
  assert.match(APP_JS, /function xpLevelInfo/);
  assert.match(APP_JS, /function addXP/);
  assert.match(APP_JS, /function renderXP/);
  assert.match(APP_JS, /addXP\(10\)/); // task
  assert.match(APP_JS, /addXP\(15\)/); // habit
  assert.match(APP_JS, /addXP\(20\)/); // mục tiêu tháng
  assert.match(APP_JS, /addXP\(30\)/); // mục tiêu năm
  assert.match(APP_JS, /localStorage\.getItem\('planner-xp'\)/);
  assert.match(APP, /id="appXp"/);
  assert.match(APP, /id="xpCard"/);
  // Task lặp thông minh (carry-over) — logic thuần trong module plan-carry.js
  const carryMod = readRequiredAsset('js/plan-carry.js');
  assert.match(carryMod, /function carryOverRepeatTasks|planCarry/);
  assert.match(carryMod, /function syncCarriedDone/);
  assert.match(carryMod, /function newTaskUid/);
  assert.match(carryMod, /function ensureTaskUid/);
  assert.match(carryMod, /function findTaskByUid/);
  assert.match(carryMod, /carriedFrom: \{ uid/); // bản dồn mới lưu uid nguồn + ngày
  assert.match(carryMod, /module\.exports/); // chạy được trong Node để unit test
  // app.js ủy quyền sang module (wrapper) + mọi task mới được gán uid lúc tạo
  assert.match(APP_JS, /function carryOverRepeatTasks/);
  assert.match(APP_JS, /function syncCarriedDone/);
  assert.match(APP_JS, /uid: newTaskUid\(\), kind/);
  // Export .ics
  assert.match(APP_JS, /function exportICS/);
  assert.match(APP_JS, /BEGIN:VCALENDAR/);
  assert.match(APP_JS, /act === 'export-ics'/);
  assert.match(APP, /data-action="export-ics"/);
});

test('day view: section + renderDay + open/close/prev/next wired', () => {
  assert.match(APP, /id="view-day"/);
  assert.match(APP, /data-i18n-aria="viewDay"/);
  assert.match(APP_JS, /function renderDay/);
  assert.match(APP_JS, /function openDay/);
  assert.match(APP_JS, /function goDay/);
  assert.match(APP_JS, /function dayHabitsHTML/);
  assert.match(APP_JS, /act === 'open-day'/);
  assert.match(APP_JS, /act === 'close-day'/);
  assert.match(APP_JS, /act === 'day-prev'/);
  assert.match(APP_JS, /act === 'day-next'/);
  assert.match(APP_JS, /data-action="open-day"/); // nút mở từng cột ngày trong tuần
  assert.match(APP_JS, /dayColumnHTML\(w, di, isToday, true\)/); // tái dùng cột ngày trong day view
  assert.match(APP_JS, /dayWeek/); // state day view
  assert.match(APP_JS, /dayDay/);
  // syncUrl hỗ trợ tham số ngày
  const UI_JS = readRequiredAsset('js/ui.js');
  assert.match(UI_JS, /view === 'day' && day !== undefined/);
});

test('service worker caches the UI helper with the reviewed cache version', () => {
  assert.match(SW, /const CACHE = 'taskflow-v115';/);
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
  // Phase 1 radius scale: input 8 / button 10 / card 12 / modal 16
  assert.match(tokens, /--radius-input:\s*8px/);
  assert.match(tokens, /--radius-button:\s*10px/);
  assert.match(tokens, /--radius-card:\s*12px/);
  assert.match(tokens, /--radius-modal:\s*16px/);
  assert.match(tokens, /--radius-control:\s*var\(--radius-button\)/);
  assert.match(tokens, /--radius-panel:\s*var\(--radius-modal\)/);
  assert.match(tokens, /--focus-ring:/);
  assert.match(tokens, /--text-xs:\s*12px/);
  assert.match(tokens, /--text-2xl:\s*32px/);
  assert.match(tokens, /--color-surface-elevated:/);
  assert.match(tokens, /--color-text-secondary:/);
});

test('design system components include accessibility, motion, and numeric contracts', () => {
  const components = readRequiredAsset('css/components.css');
  ['ui-icon', 'button', 'icon-button', 'field', 'metric', 'dialog', 'drawer', 'toast-region']
    .forEach((className) => assert.match(components, new RegExp(`\\.${className}\\b`)));

  // Phase 1 contracts: badge, progress, skeleton, menu, tooltip
  ['badge', 'progress', 'skeleton', 'menu']
    .forEach((className) => assert.match(components, new RegExp(`\\.${className}\\b`)));
  assert.match(components, /\[data-tooltip\]/);

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
    'chevron-left', 'chevron-right', 'expand',
  ];
  symbols.forEach((symbol) => assert.match(sprite, new RegExp(`<symbol[^>]+id=["']${symbol}["']`)));
  assert.match(sprite, /stroke=["']currentColor["']/);
  assert.match(sprite, /stroke-width=["'](?:1\.75|1\.8|2)["']/);
});

test('design system and landing assets are available in the v64 offline shell', () => {
  assert.match(SW, /const CACHE = 'taskflow-v115';/);
  [
    './css/tokens.css', './css/components.css', './css/app-shell.css',
    './css/landing.css', './icons/ui-sprite.svg', './js/ui.js', './index.html',
  ].forEach((asset) => assert.match(SW, new RegExp(`["']${asset.replaceAll('.', '\\.')}["']`)));
});

test('hardening: versioned static requests cache-match exact URL, ignoreSearch only as offline fallback', async () => {
  const handlers = {};
  const matchCalls = [];
  const cachedResponse = { source: 'precache' };
  let offline = false;
  const context = {
    URL,
    location: { origin: 'https://taskflow.test' },
    caches: {
      match(request, options) {
        matchCalls.push({ request, options });
        // Online: cache có entry đúng URL → trả về; offline: miss trừ khi
        // là fallback ignoreSearch (precache không-version) vẫn phục vụ.
        return Promise.resolve(offline && !options?.ignoreSearch ? undefined : cachedResponse);
      },
      open() {
        return Promise.resolve({ put() {} });
      },
      keys() { return Promise.resolve([]); },
    },
    fetch() {
      return offline
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ ok: true, clone: () => ({}) });
    },
    self: {
      addEventListener(type, handler) { handlers[type] = handler; },
      clients: { claim() {} },
      skipWaiting() {},
      registration: { showNotification() {} },
    },
  };
  vm.runInNewContext(SW, context);

  let responsePromise;
  const url = 'https://taskflow.test/css/tokens.css?v=5';
  handlers.fetch({
    request: { method: 'GET', mode: 'cors', url },
    respondWith(promise) { responsePromise = promise; },
  });

  // Online: lần match đầu tiên phải theo đúng URL — KHÔNG ignoreSearch,
  // để `?v=N` mới không bị phục vụ bằng entry cache cũ (bug cũ gây
  // SyntaxError duplicate const khi 2 phiên bản script chạy chồng).
  // Chờ online chain hoàn tất trước khi chuyển offline, nếu không
  // microtask của fetch online sẽ bị nhìn nhầm thành offline.
  assert.equal(await responsePromise, cachedResponse);
  assert.equal(matchCalls.length, 1);
  assert.equal(matchCalls[0].options?.ignoreSearch, undefined);
  assert.equal(matchCalls[0].request.url, url);

  // Offline (fetch thất bại): fallback dùng ignoreSearch để precache
  // không-version vẫn phục vụ được.
  offline = true;
  matchCalls.length = 0;
  let offlinePromise;
  handlers.fetch({
    request: { method: 'GET', mode: 'cors', url },
    respondWith(promise) { offlinePromise = promise; },
  });
  assert.equal(await offlinePromise, cachedResponse);
  assert.equal(matchCalls.length, 2);
  assert.equal(matchCalls[1].options?.ignoreSearch, true);
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

test('hardening: muted and secondary text meet 4.5 contrast against every theme canvas', () => {
  const tokens = readRequiredAsset('css/tokens.css');
  for (const theme of ['cream', 'mint', 'lavender', 'peach']) {
    for (const dark of [false, true]) {
      const values = effectiveThemeTokens(tokens, theme, dark);
      const ratio = contrastRatio(values['--color-text-muted'], values['--color-canvas']);
      assert.ok(ratio >= 4.5, `${theme} ${dark ? 'dark' : 'light'} muted/canvas contrast is ${ratio.toFixed(3)}`);
      const secondaryRatio = contrastRatio(values['--color-text-secondary'], values['--color-canvas']);
      assert.ok(secondaryRatio >= 4.5, `${theme} ${dark ? 'dark' : 'light'} secondary/canvas contrast is ${secondaryRatio.toFixed(3)}`);
      const elevatedRatio = contrastRatio(values['--color-text-secondary'], values['--color-surface-elevated']);
      assert.ok(elevatedRatio >= 4.5, `${theme} ${dark ? 'dark' : 'light'} secondary/elevated contrast is ${elevatedRatio.toFixed(3)}`);
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

test('Phase 3: Today Dashboard is the default view with greeting, tasks, habits and focus', () => {
  const html = readRequiredAsset('app.html');
  assert.match(html, /id="view-today"[^>]*role="tabpanel"/);
  assert.match(APP_JS, /function renderToday\(\)/);
  assert.match(APP_JS, /function todayGreeting\(\)/);
  assert.match(APP_JS, /todayGreetingMorning|todayGreetingAfternoon|todayGreetingEvening/);
  assert.match(APP_JS, /todayTasksTitle|todayHabitsTitle|todayFocusTitle/);
  assert.match(APP_JS, /today-addtask/);
  assert.match(APP_JS, /todayCompleted|todayProgress/);
  assert.match(APP_JS, /today-page|today-card|today-progress-fill|today-habit-list/);
  // default state view is today
  assert.match(APP_JS, /view: 'today'/);
  // deeplink accepts today
  const deeplink = readRequiredAsset('js/deeplink.js');
  assert.match(deeplink, /view === 'today'/);
  // mobile nav keeps a 6-column grid with the Today tab
  const shell = readRequiredAsset('css/app-shell.css');
  assert.match(shell, /grid-template-columns:\s*repeat\(6,/);
});

test('Phase 3: Today view toggles tasks and habits through shared actions', () => {
  assert.match(APP_JS, /if \(state\.view === 'today'\) renderToday\(\);/);
  assert.match(APP_JS, /data-role=\"task-text\"\s+data-week=/);
  assert.match(APP_JS, /habitStreakCached/);
  assert.match(APP_JS, /totalFocusMinutesToday/);
});

test('Phase 4: minimal task card with meta line and hover ⋯ menu', () => {
  const styles = readRequiredAsset('css/styles.css');
  // meta line (P1 · giờ · repeat) dưới text
  assert.match(APP_JS, /task-meta/);
  assert.match(APP_JS, /taskPriorityLabel/);
  assert.match(APP_JS, /task-meta-time/);
  assert.match(APP_JS, /task-meta-repeat/);
  // actions ẩn mặc định, hiện khi hover/focus
  assert.match(styles, /\.task-row-actions[^}]*opacity:\s*0/s);
  assert.match(styles, /\.task-row:hover \.task-row-actions[^}]*opacity:\s*1/s);
  // menu dropdown ⋯ chứa duplicate/delete, giữ data-action cũ cho handler
  assert.match(APP_JS, /data-action="task-menu"/);
  assert.match(APP_JS, /data-action="task-duplicate"/);
  assert.match(APP_JS, /data-action="remind-task"/);
  assert.match(APP_JS, /data-action="repeat-edit"/);
  assert.match(APP_JS, /act === 'task-duplicate'/);
  // editor inline chèn vào row (không vỡ khi nút nằm trong menu)
  assert.match(APP_JS, /insertBeforeTaskActions/);
  // icon repeat trong sprite
  const sprite = readRequiredAsset('icons/ui-sprite.svg');
  assert.match(sprite, /id="repeat"/);
});

test('Phase 5: task detail drawer with fields, subtasks, and handlers', () => {
  const styles = readRequiredAsset('css/styles.css');
  const html = readRequiredAsset('app.html');
  // drawer markup + backdrop trong app.html
  assert.match(html, /id="taskDrawer"/);
  assert.match(html, /id="taskDetailBackdrop"/);
  assert.match(html, /class="drawer task-drawer"/);
  // renderTaskDetail + open/close + state ref
  assert.match(APP_JS, /let taskDetailRef = null/);
  assert.match(APP_JS, /function openTaskDetail\(week, day, task, y, m\)/);
  assert.match(APP_JS, /function closeTaskDetail\(\)/);
  assert.match(APP_JS, /function renderTaskDetail\(\)/);
  assert.match(APP_JS, /function getTaskDetailTarget\(\)/);
  // menu ⋯ có mục mở drawer
  assert.match(APP_JS, /data-action="task-detail"/);
  // các field: time/duration/priority/repeat/notes/tags
  assert.match(APP_JS, /taskDetailDuration/);
  assert.match(APP_JS, /data-action="td-time"/);
  assert.match(APP_JS, /data-action="td-duration"/);
  assert.match(APP_JS, /data-action="td-prio"/);
  assert.match(APP_JS, /data-action="td-repeat"/);
  assert.match(APP_JS, /data-action="td-note"/);
  // subtasks: add/toggle/del
  assert.match(APP_JS, /data-action="subtask-add"/);
  assert.match(APP_JS, /data-action="subtask-toggle"/);
  assert.match(APP_JS, /data-action="subtask-del"/);
  assert.match(APP_JS, /g\.tk\.subtasks\.push\(/);
  // delete trong drawer + dblclick mở drawer
  assert.match(APP_JS, /act === 'td-delete'/);
  assert.match(APP_JS, /act === 'task-detail-close'/);
  assert.match(APP_JS, /addEventListener\('dblclick', taskDetailDblClickListener\)/);
  assert.match(APP_JS, /openTaskDetail\(\+row\.dataset\.week, \+row\.dataset\.day, \+row\.dataset\.task\)/);
  // bind events riêng cho change/input
  assert.match(APP_JS, /function bindTaskDetailEvents\(drawer\)/);
  assert.match(APP_JS, /data-role="td-text"/);
  // CSS drawer: trượt từ phải + body scroll
  assert.match(styles, /\.task-drawer\s*{[^}]*inset:\s*0\s+0\s+0\s+auto/s);
  assert.match(styles, /\.task-drawer-body\s*{[^}]*overflow-y:\s*auto/s);
  // i18n keys đầy đủ cho drawer
  assert.match(APP_JS, /taskDetailTitle:/);
  assert.match(APP_JS, /taskDetailSubtasks:/);
  assert.match(APP_JS, /taskDetailNotes:/);
  assert.match(APP_JS, /taskDetailDelete:/);
});

test('Phase 6: task-specific focus with timer and session log', () => {
  const styles = readRequiredAsset('css/styles.css');
  const html = readRequiredAsset('app.html');
  // focus-task button truyền ref vào openFocusMode (week/day hoặc scope=inbox cho task Inbox)
  assert.match(APP_JS, /openFocusMode\(el\.dataset\.scope === 'inbox'/);
  assert.match(APP_JS, /week: el\.dataset\.week, day: el\.dataset\.day, task: el\.dataset\.task,/);
  assert.match(APP_JS, /function openFocusMode\(ref\)/);
  assert.match(APP_JS, /let focusTaskRef = null/);
  assert.match(APP_JS, /function getFocusedTask\(\)/);
  // session log helpers trên task
  assert.match(APP_JS, /function taskFocusLog\(tk\)/);
  assert.match(APP_JS, /function taskFocusSecs\(tk\)/);
  assert.match(APP_JS, /function taskFocusToday\(tk\)/);
  assert.match(APP_JS, /function getTaskByUid\(uid\)/);
  assert.match(APP_JS, /byUid\.focusLog = byUid\.focusLog \|\| \[\]/);
  // timer: presets + start/pause/reset/set + endAt accuracy
  assert.match(APP_JS, /const FOCUS_PRESETS = \[5, 15, 25, 45\]/);
  assert.match(APP_JS, /let focusTimer = \{ running: false, dur: 25 \* 60/);
  assert.match(APP_JS, /function focusTimerComplete\(\)/);
  assert.match(APP_JS, /function focusTimerStart\(\)/);
  assert.match(APP_JS, /function focusTimerSetDur\(min\)/);
  assert.match(APP_JS, /focusTimer\.endAt = Date\.now\(\) \+ focusTimer\.left \* 1000/);
  // actions mới
  assert.match(APP_JS, /act === 'focus-show-all'/);
  assert.match(APP_JS, /act === 'focus-timer-start'/);
  assert.match(APP_JS, /act === 'focus-timer-reset'/);
  assert.match(APP_JS, /act === 'focus-timer-set'/);
  assert.match(APP_JS, /data-action="focus-timer-set"/);
  assert.match(APP_JS, /data-action="focus-show-all"/);
  // meta badge focus trên row
  assert.match(APP_JS, /task-meta-focus/);
  // drawer có focus row + nút Tập trung
  assert.match(APP_JS, /td-focus-row/);
  assert.match(APP_JS, /data-action="focus-task"[^]*taskFocusBtn/);
  // CSS
  assert.match(styles, /\.focus-taskview\s*{/);
  assert.match(styles, /\.focus-timer-time\s*{[^}]*font-size:\s*52px/s);
  assert.match(styles, /\.focus-log-list\s*{/);
  assert.match(styles, /\.task-meta-focus\s*{/);
  assert.match(styles, /\.td-focus-row\s*{/);
  // i18n keys
  assert.match(APP_JS, /focusShowAll:/);
  assert.match(APP_JS, /focusLog:/);
  assert.match(APP_JS, /focusDone:/);
  assert.match(APP_JS, /focusTimer:/);
});

test('Phase 7: focus time bar chart in week view and focus stats in reports', () => {
  const styles = readRequiredAsset('css/styles.css');
  // helpers stats
  assert.match(APP_JS, /function pomoDaySecs\(date\)/);
  assert.match(APP_JS, /function focusWeekMinutes\(week\)/);
  assert.match(APP_JS, /function focusMonthMinutes\(\)/);
  assert.match(APP_JS, /function topFocusTasksInWeek\(w, n\)/);
  assert.match(APP_JS, /function topFocusTasksInMonth\(n\)/);
  assert.match(APP_JS, /function taskFocusSecsInRange\(tk, startKey, endKey\)/);
  // card biểu đồ trong week-support-grid (full-width)
  assert.match(APP_JS, /focusChartCardHTML\(w\)/);
  assert.match(APP_JS, /class="card focus-chart-card"/);
  assert.match(APP_JS, /data-role="focus-chart"/);
  assert.match(APP_JS, /fc-bar/);
  assert.match(APP_JS, /dayLabelShort\(di\)/);
  // báo cáo tuần + tháng có focus
  assert.match(APP_JS, /focusByDay/);
  assert.match(APP_JS, /focusTotal/);
  assert.match(APP_JS, /focusByWeek/);
  assert.match(APP_JS, /reportFocusWeek/);
  assert.match(APP_JS, /reportFocusMonth/);
  assert.match(APP_JS, /reportFocusTop/);
  assert.match(APP_JS, /function focusReportBars\(values, labelFn\)/);
  assert.match(APP_JS, /report-focus-head/);
  // CSS
  assert.match(styles, /\.focus-chart-card\s*{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(styles, /\.focus-chart-bars\s*{[^}]*display:\s*flex/s);
  assert.match(styles, /\.fc-bar\s*{[^}]*background:\s*linear-gradient/s);
  assert.match(styles, /\.report-focus-labels\s*{/);
  // i18n keys
  assert.match(APP_JS, /focusChartTitle:/);
  assert.match(APP_JS, /focusChartEmpty:/);
  assert.match(APP_JS, /focusChartTop:/);
  assert.match(APP_JS, /reportFocusBestDay:/);
});

test('Phase 8: year report focus stats, quarterly summary, and calendar focus pills', () => {
  const styles = readRequiredAsset('css/styles.css');
  // helpers năm
  assert.match(APP_JS, /function focusMonthMinutesFor\(y, m\)/);
  assert.match(APP_JS, /function focusYearByMonth\(\)/);
  assert.match(APP_JS, /function topFocusTasksInYear\(y, n\)/);
  // year report data + render
  assert.match(APP_JS, /focusByMonth, focusTotal, focusByQuarter, topTask/);
  assert.match(APP_JS, /focusByQuarter\.map/);
  assert.match(APP_JS, /report-quarters-grid/);
  assert.match(APP_JS, /yearReportQuarter/);
  // calendar focus: pill mỗi ngày + header summary
  assert.match(APP_JS, /cal-focus-summary/);
  assert.match(APP_JS, /data-role="cal-focus-summary"/);
  assert.match(APP_JS, /class="cal-focus"/);
  assert.match(APP_JS, /calFocusMonth/);
  assert.match(APP_JS, /calFocusAria/);
  // CSS
  assert.match(styles, /\.cal-focus-summary\s*{/);
  assert.match(styles, /\.cal-focus\s*{[^}]*font-size:\s*9\.5px/s);
  assert.match(styles, /\.report-quarters-grid\s*{/);
  assert.match(styles, /\.report-quarter\s*strong\s*{[^}]*color:\s*#C24E28/s);
  // i18n keys đủ vi+en
  assert.match(APP_JS, /yearReportFocus:/);
  assert.match(APP_JS, /quarterShort:/);
  assert.match(APP_JS, /calFocusBestDay:/);
});

test('Phase 9: focus × task correlation stats modal with range filter', () => {
  const styles = readRequiredAsset('css/styles.css');
  const SPRITE = readRequiredAsset('icons/ui-sprite.svg');
  // nút Thống kê trong tools drawer + modal
  assert.match(APP, /data-action="stats" data-shell-icon="stats"/);
  assert.match(APP, /id="statsModal"/);
  assert.match(APP, /data-action="stats-close"/);
  assert.match(APP, /id="statsContent"/);
  // sprite có icon stats riêng
  assert.match(SPRITE, /<symbol id="stats"/);
  // helpers + data builder
  assert.match(APP_JS, /let statsRange = 'month';/);
  assert.match(APP_JS, /function statsMonthsForRange\(range\)/);
  assert.match(APP_JS, /function statsData\(range\)/);
  assert.match(APP_JS, /function statsCorrelation\(xs, ys\)/);
  assert.match(APP_JS, /function statsScatterSVG\(points\)/);
  assert.match(APP_JS, /function renderStatsModal\(\)/);
  assert.match(APP_JS, /function openStatsModal\(\)/);
  // granularity: tuần cho tháng/quý, tháng cho năm/toàn bộ
  assert.match(APP_JS, /granularity = \(range === 'year' \|\| range === 'all'\) \? 'month' : 'week'/);
  assert.match(APP_JS, /monthStateRaw\(y, m\)/);
  assert.match(APP_JS, /act === 'stats-range'/);
  assert.match(APP_JS, /statsRange = el\.dataset\.range/);
  // CSS
  assert.match(styles, /\.stats-modal-card\s*{[^}]*max-width:\s*560px/s);
  assert.match(styles, /\.stats-range-btn\.active\s*{/);
  assert.match(styles, /\.stats-scatter-svg\s*{/);
  assert.match(styles, /\.stats-row\s*{/);
  assert.match(styles, /\.stats-dot-core\s*{/);
  // i18n keys đủ vi+en
  assert.match(APP_JS, /statsRangeMonth:/);
  assert.match(APP_JS, /statsRangeAll:/);
  assert.match(APP_JS, /statsCorr:/);
  assert.match(APP_JS, /statsNoData:/);
  assert.match(APP_JS, /statsUnitWeek:/);
});

test('Phase 2: Upcoming view — nav item, view section, range filter and cross-month task access', () => {
  // 1. Nav: có tab Upcoming trong buildNav + navAttributes + MAIN group (today, inbox, upcoming)
  assert.match(APP_JS, /view: 'upcoming', icon: 'upcoming'/);
  assert.match(APP_JS, /upcoming: 'data-nav-view=\"upcoming\" data-view=\"upcoming\"'/);
  assert.match(APP_JS, /byView\.today, byView\.inbox, byView\.upcoming/);
  // 2. View section trong app.html + aria-label i18n
  assert.match(APP, /id="view-upcoming"/);
  assert.match(APP, /data-i18n-aria=\"viewUpcoming\"/);
  // 3. setView dispatch có nhánh upcoming
  assert.match(APP_JS, /view === 'upcoming'/);
  assert.match(APP_JS, /renderUpcoming\(\)/);
  // 4. Range 7/14/30 + localStorage
  assert.match(APP_JS, /let upcomingRange = 14;/);
  assert.match(APP_JS, /UPCOMING_RANGE_KEY = 'planner-upcoming-range'/);
  assert.match(APP_JS, /r === 7 \|\| r === 14 \|\| r === 30/);
  assert.match(APP_JS, /act === 'upcoming-range'/);
  // 5. Đọc task xuyên tháng: monthStateRaw không tạo state mới; task tháng khác mở drawer được
  assert.match(APP_JS, /function tasksForDate\(dt\)/);
  assert.match(APP_JS, /monthStateRaw\(y, m\)/);
  assert.match(APP_JS, /function upcomingCollect\(\)/);
  assert.match(APP_JS, /function upcomingTaskRowHTML\(r\)/);
  assert.match(APP_JS, /function renderUpcoming\(\)/);
  assert.match(APP_JS, /taskDetailRef = \{ y: y === undefined \? PLAN_YEAR : y,/);
  assert.match(APP_JS, /openTaskDetail\(\+el\.dataset\.week, \+el\.dataset\.day, \+el\.dataset\.task,/);
  assert.match(APP_JS, /saveMonthState\(tY, tM, st\)/);
  // 6. i18n keys đủ vi+en
  assert.match(APP_JS, /tabUpcoming: 'Sắp tới'/);
  assert.match(APP_JS, /tabUpcoming: 'Upcoming'/);
  assert.match(APP_JS, /upcomingOverdue:/);
  assert.match(APP_JS, /upcomingRange7:/);
  assert.match(APP_JS, /upcomingEmpty:/);
  // 7. deeplink chấp nhận view=upcoming
  const DEEPLINK = readFileSync(path.join(ROOT, 'js/deeplink.js'), 'utf8');
  assert.match(DEEPLINK, /view === 'upcoming'/);
  // 8. sprite có icon upcoming
  assert.match(readRequiredAsset('icons/ui-sprite.svg'), /<symbol id="upcoming"/);
  // 9. CSS
  const upStyles = readRequiredAsset('css/styles.css');
  assert.match(upStyles, /\.upcoming-page\s*{/);
  assert.match(upStyles, /\.up-range-btn\.active\s*{/);
  assert.match(upStyles, /\.up-task-row\s*{/);
  assert.match(upStyles, /\.up-focus\s*{/);
});

test('Phase 3: Inbox — nav item, view section, capture flow and schedule keeping uid', () => {
  // 1. Nav: tab Inbox trong buildNav + navAttributes + MAIN group + mobile bỏ inbox
  assert.match(APP_JS, /view: 'inbox', icon: 'inbox'/);
  assert.match(APP_JS, /inbox: 'data-nav-view=\"inbox\" data-view=\"inbox\"'/);
  assert.match(APP_JS, /byView\.today, byView\.inbox, byView\.upcoming/);
  assert.match(APP_JS, /items\.filter\(\(item\) => item\.view !== 'inbox'\)/);
  // 2. View section trong app.html + nút Inbox trong tools drawer (mobile)
  assert.match(APP, /id="view-inbox"/);
  assert.match(APP, /data-i18n-aria=\"viewInbox\"/);
  assert.match(APP, /data-action=\"inbox-open\"/);
  // 3. setView dispatch có nhánh inbox + deeplink chấp nhận
  assert.match(APP_JS, /view === 'inbox'/);
  assert.match(APP_JS, /renderInbox\(\)/);
  const DEEPLINK_INBOX = readFileSync(path.join(ROOT, 'js/deeplink.js'), 'utf8');
  assert.match(DEEPLINK_INBOX, /view === 'inbox'/);
  // 4. Bộ nhớ inbox riêng (planner-inbox) — không phụ thuộc tháng
  assert.match(APP_JS, /INBOX_KEY = 'planner-inbox'/);
  assert.match(APP_JS, /function loadInbox\(\)/);
  assert.match(APP_JS, /function saveInbox\(\)/);
  // 5. Capture + schedule: add task, schedule giữ uid, move today/tomorrow/date
  assert.match(APP_JS, /function addInboxTask\(\)/);
  assert.match(APP_JS, /function scheduleInboxTask\(i, dt\)/);
  assert.match(APP_JS, /inbox\.splice\(i, 1\)/);
  assert.match(APP_JS, /inbox: true/);
  assert.match(APP_JS, /act === 'inbox-today'/);
  assert.match(APP_JS, /act === 'inbox-tomorrow'/);
  assert.match(APP_JS, /act === 'inbox-date-schedule'/);
  assert.match(APP_JS, /act === 'inbox-del'/);
  // 6. Drawer scope inbox: mở + sửa + xoá + focus từ Inbox
  assert.match(APP_JS, /function openInboxTaskDetail\(i\)/);
  assert.match(APP_JS, /taskDetailRef\.scope === 'inbox'/);
  assert.match(APP_JS, /data-scope=\"inbox\"/);
  assert.match(APP_JS, /taskDetailRef\.scope === 'inbox'\) \{\s*inbox\.splice/s);
  assert.match(APP_JS, /focusTaskRef\.scope === 'inbox'/);
  // 7. i18n keys đủ vi+en
  assert.match(APP_JS, /tabInbox: 'Inbox'/);
  assert.match(APP_JS, /inboxEyebrow:/);
  assert.match(APP_JS, /inboxEmpty:/);
  assert.match(APP_JS, /inboxScheduleBtn:/);
  // 8. sprite có icon inbox
  assert.match(readRequiredAsset('icons/ui-sprite.svg'), /<symbol id="inbox"/);
  // 9. CSS
  const inStyles = readRequiredAsset('css/styles.css');
  assert.match(inStyles, /\.inbox-task-row\s*{/);
  assert.match(inStyles, /\.inbox-sched-today\s*{/);
  assert.match(inStyles, /\.td-inbox-schedule\s*{/);
});

test('Phase 4: Quick Add — overlay, shortcut, context-aware target and shared task creation', () => {
  // 1. Modal trong app.html (input + fields + nút Thêm)
  assert.match(APP, /id="quickAddModal"/);
  assert.match(APP, /id="quickAddInput"/);
  assert.match(APP, /id="quickAddDate"/);
  assert.match(APP, /data-action="quickadd-do"/);
  // 2. Mở/đóng + Enter submit + Escape (dialog layer tự đóng)
  assert.match(APP_JS, /function openQuickAdd\(\)/);
  assert.match(APP_JS, /function closeQuickAdd\(\)/);
  assert.match(APP_JS, /function submitQuickAdd\(\)/);
  assert.match(APP_JS, /id === 'quickAddInput'/);
  assert.match(APP_JS, /act === 'quickadd-close'/);
  // 3. Target theo ngữ cảnh view: inbox/day/week/today
  assert.match(APP_JS, /function quickAddDefaultTarget\(\)/);
  assert.match(APP_JS, /state\.view === 'inbox'/);
  assert.match(APP_JS, /state\.view === 'day'/);
  assert.match(APP_JS, /state\.view === 'week'/);
  // 4. Nút Thêm công việc (shell-add-task) mở Quick Add — KHÔNG còn chuyển sang Week
  assert.match(APP_JS, /act === 'shell-add-task'\).*openQuickAdd\(\)/s);
  assert.match(APP_JS, /if \(k === 'q'\)\s*\{\s*e\.preventDefault\(\);\s*openQuickAdd\(\)/s);
  // 5. Dùng chung logic đặt task: pushTaskToDate (không duplicate) + inbox scope
  assert.match(APP_JS, /function pushTaskToDate\(tk, dt\)/);
  assert.match(APP_JS, /tk\.inbox = true;/);
  assert.match(APP_JS, /renderCurrentView\(\);/);
  // 6. i18n keys đủ vi+en
  assert.match(APP_JS, /quickAddTitle: 'Thêm công việc nhanh'/);
  assert.match(APP_JS, /quickAddTitle: 'Quick Add'/);
  assert.match(APP_JS, /quickAddPh:/);
  assert.match(APP_JS, /quickAddInbox:/);
  // 7. CSS
  const qaStyles = readRequiredAsset('css/styles.css');
  assert.match(qaStyles, /\.quickadd-card\s*{/);
  assert.match(qaStyles, /\.quickadd-fields\s*{/);
});

test('Phase 9: PWA manifest shortcuts, screenshots, and notification deep-link', () => {
  const manifest = JSON.parse(readRequiredAsset('manifest.json'));
  assert.equal(manifest.name, 'TaskFlow — Lập kế hoạch rõ ràng, tiến bộ mỗi ngày');
  assert.equal(manifest.short_name, 'TaskFlow');
  assert.equal(manifest.start_url, './app.html');
  assert.equal(manifest.display, 'standalone');
  // 3 shortcuts theo spec: Hôm nay / Thêm công việc / Tuần này (+ giữ Tháng/Năm)
  const urls = manifest.shortcuts.map((s) => s.url);
  assert.ok(urls.includes('./app.html?view=today'), 'Hôm nay shortcut');
  assert.ok(urls.includes('./app.html?view=today&quick=1'), 'Thêm việc shortcut opens Quick Add');
  assert.ok(urls.includes('./app.html?view=week'), 'Tuần này shortcut');
  assert.ok(manifest.shortcuts.every((s) => s.name && s.url), 'all shortcuts have name+url');
  // screenshots present for install UX
  assert.ok(Array.isArray(manifest.screenshots) && manifest.screenshots.length >= 1);
  assert.match(manifest.screenshots[0].src, /\.png$/);
  // icons intact
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  // notificationclick deep-links into app, NOT landing
  assert.match(SW, /notificationclick/);
  assert.match(SW, /APP_URL = '\.\/app\.html\?view=today'/);
  assert.doesNotMatch(SW, /openWindow\(''\)/);
  assert.match(SW, /c\.url\.indexOf\('\/app\.html'\) !== -1/);
  // quick=1 deeplink → openQuickAdd after boot
  assert.match(DEEPLINK_JS || '', /quick=1/);
  assert.match(APP_JS, /window\.__quickAddOnBoot = true/);
  assert.match(APP_JS, /if \(window\.__quickAddOnBoot\)/);
});

test('Phase 10: a11y — focus-visible cho contenteditable + heading order year view', () => {
  const STYLES = readRequiredAsset('css/styles.css');
  // 1. Contenteditable fields (task text, goals, notes, reflections) có focus indicator:
  //    global :focus-visible rule bao gồm [contenteditable] và textarea
  assert.match(
    STYLES,
    /button:focus-visible[\s\S]*?\[contenteditable\]:focus-visible\s*\{[\s\S]*?outline:\s*2\.5px solid var\(--accent-deep\)/s,
    'global :focus-visible must include [contenteditable] with visible outline'
  );
  assert.match(STYLES, /textarea:focus-visible\s*,?[\s\S]*?\[contenteditable\]:focus-visible/);
  // Không có rule (0,2,0)+ set outline:none trên combo editable (chúng sẽ thắng focus-visible bằng source order)
  assert.doesNotMatch(STYLES, /\.(g-text|task-text)\.editable\s*\{[^}]*outline:\s*none/,
    'no (0,2,0)+ outline:none on editable combos that would beat the focus-visible ring');
  assert.doesNotMatch(STYLES, /\.ref-(line|question)\s*\{[^}]*outline:\s*none[^}]*border-radius:/);
  // 2. Year view: không còn heading order lộn xộn (H3 trước H2) — year-card dùng h3 cùng mức
  const yearCardBody = APP_JS.match(/function yearCardHTML\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(yearCardBody, /<h3 class="week-section-title">/);
  assert.doesNotMatch(yearCardBody, /<h2 class="week-section-title">/);
  // 3. Layer system đã có: Escape đóng + focus trap + toast aria-live (không hồi quy)
  assert.match(UI_JS, /key === 'Escape'/);
  assert.match(UI_JS, /setAttribute\('role', kindOk === 'error' \? 'alert' : 'status'\)/);
});

test('Phase 13: vercel.json security headers + CSP không chặn font/sync', () => {
  const VERCEL = JSON.parse(readRequiredAsset('vercel.json'));
  const headers = Object.fromEntries(
    VERCEL.headers[0].headers.map((h) => [h.key, h.value])
  );
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.match(headers['Permissions-Policy'] || '', /geolocation=\(\)/);
  assert.match(headers['Strict-Transport-Security'] || '', /max-age=31536000/);
  const csp = headers['Content-Security-Policy'];
  assert.ok(csp, 'CSP header must exist');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  // Nunito load từ Google Fonts — CSP phải cho phép, không được chặn font
  assert.match(csp, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
  assert.match(csp, /font-src 'self' data: https:\/\/fonts\.gstatic\.com/);
  // sync tới backend Render
  assert.match(csp, /connect-src 'self' https:\/\/todoist-m3c7\.onrender\.com/);
});
