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
const INBOX_JS = readFileSync(path.join(ROOT, 'js/inbox.js'), 'utf8');
const I18N_JS = readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');
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
    text: null, url: null, title: null, // V1.5 share capture fields
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
    (LANDING.match(/class=["'][^"']*hero-primary-cta[^"']*["'][^>]*href=["']app["']/gi) || []).length,
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
  assert.match(LANDING, /css\/tokens\.css\?v=6/);
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
    'prevyear', 'prevmonth', 'monthselect', 'nextmonth', 'nextyear', 'reset',
    'remind-toggle', 'data-toggle', 'undo', 'redo', 'search-toggle', 'template',
    'print', 'sync-toggle', 'theme', 'install-app', 'help-toggle', 'dark', 'lang',
  ].forEach((action) => assert.match(APP, new RegExp(`data-action=["']${action}["']`), `missing shell action: ${action}`));
  // P4: Hôm nay/Inbox/Focus/Báo cáo đã bỏ khỏi tools drawer — vẫn reachable qua sidebar
  assert.match(APP_JS, /byView\.today, byView\.inbox, byView\.upcoming/);
  assert.match(APP_JS, /actionBtn\('focus', 'focus'/);
  assert.match(APP_JS, /actionBtn\('report', 'report'/);
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
  // monthselect nav đã tách sang js/shell.js (P11 extraction 19) — assert chuyển sang module
  assert.match(APP_JS, /querySelectorAll\('\[data-action="undo"\]'\)/);
  assert.match(APP_JS, /querySelectorAll\('\[data-action="redo"\]'\)/);
  assert.doesNotMatch(APP_JS, /const sel = document\.getElementById\('monthSelect'\)/);
  const shellMod = readRequiredAsset('js/shell.js');
  assert.match(shellMod, /querySelectorAll\('\[data-action="monthselect"\]'\)/);
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
  // P3: PLAN = Tổng quan → Tuần → Năm → Lịch; TRACK = Thói quen → Focus → Báo cáo
  assert.match(APP_JS, /byView\.overview, byView\.week, byView\.year, byView\.calendar/);
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
  assert.match(week, /weeklyReviewHTML\(/);
  assert.doesNotMatch(week, /week-banner|w-chick-on-bar/);
});

test('week day renderer emits seven labeled, addressable panels', () => {
  const dayPanel = APP_JS.slice(
    APP_JS.indexOf('function dayColumnHTML'),
    APP_JS.indexOf('function renderDay')
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
  // P1.3 — desktop 4+3: 12-col grid with day-col spans, tablet/mobile/print overrides stay after
  assert.match(styles, /@media \(min-width: 1101px\)\s*\{[^}]*\.week-day-list\s*\{[^}]*grid-template-columns:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /\.week-day-list\s*\.day-col-0,\s*\.week-day-list\s*\.day-col-1,\s*\.week-day-list\s*\.day-col-2,\s*\.week-day-list\s*\.day-col-3\s*\{[^}]*grid-column:\s*span 3/s);
  assert.match(styles, /\.week-day-list\s*\.day-col-4,\s*\.week-day-list\s*\.day-col-5,\s*\.week-day-list\s*\.day-col-6\s*\{[^}]*grid-column:\s*span 4/s);
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
  const source = readRequiredAsset('js/xp.js').match(/function dayPct\(day\)\s*\{[^}]*}/)?.[0];
  assert.ok(source, 'missing dayPct helper in js/xp.js');
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
  // Shell (ensureCalendarShell) owns the page + heading; month render fills the content.
  const calendar = APP_JS.slice(APP_JS.indexOf('function ensureCalendarShell()'), APP_JS.indexOf('Phase 2: Template'));
  assert.match(calendar, /calendar-page/);
  assert.match(calendar, /calendar-page-title/);
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
  assert.match(readRequiredAsset('js/report-ui.js'), /TaskFlowUI\.toast\(t\('shareDone'\)/);
  assert.match(APP_JS, /TaskFlowUI\.toast\(t\('templateDone'/);
  assert.match(readRequiredAsset('js/pomo.js'), /TaskFlowUI\.toast\(t\('pomoDoneWork'/);
  assert.doesNotMatch(APP_JS, /alert\(t\('shareDone'\)/);
});

test('Phase 7: unified empty states with CTA actions and dedup toasts', () => {
  const ui = readRequiredAsset('js/ui.js');
  // emptyStateHTML supports CTA action buttons
  assert.match(APP_JS, /function emptyStateHTML\(icon, titleKey, hintKey, actions\)/);
  assert.match(APP_JS, /class=\"empty-actions\"/);
  assert.match(APP_JS, /class=\"empty-btn\" data-action=\"\$\{esc\(a\.action\)\}\"/);
  // Today / Inbox / Upcoming / Search all route through the shared helper (Today sang js/today.js)
  assert.match(readRequiredAsset('js/today.js'), /emptyStateHTML\('🎯', 'todayEmpty', 'todayEmptySub'/);
  assert.match(INBOX_JS, /emptyStateHTML\('📥', 'inboxEmpty', 'inboxEmptySub'/);
  assert.match(readRequiredAsset('js/upcoming.js'), /emptyStateHTML\('🗓️', 'upcomingEmpty', 'upcomingEmptySub'/);
  // P11 extraction 22: empty states của search nằm trong js/search.js
  const SEARCH_JS = readRequiredAsset('js/search.js');
  assert.match(SEARCH_JS, /emptyStateHTML\('🔍', 'searchEmpty', 'searchEmptySub'\)/);
  assert.match(SEARCH_JS, /emptyStateHTML\('🐥', 'searchNoResults', 'searchNoResultsSub'\)/);
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
  assert.match(INBOX_JS, /act === 'inbox-del'/);
  assert.match(APP_JS, /act === 'td-delete'/);
  // dedup reuses element but can attach missing action button
  assert.match(ui, /!existing\.querySelector\('.toast-action'\)/);
  // i18n keys exist in both languages
  assert.match(I18N_JS, /taskDeletedToast: 'Đã xóa task'/);
  assert.match(I18N_JS, /taskDeletedToast: 'Task deleted'/);
  assert.match(I18N_JS, /emptyPlanWeek: 'Lên kế hoạch tuần'/);
  assert.match(I18N_JS, /emptyPlanWeek: 'Plan the week'/);
  // P1.2 — overdue "Xem thêm N" progressive disclosure: i18n keys + handler + limit
  assert.match(I18N_JS, /upcomingOverdueMore: 'Xem thêm'/);
  assert.match(I18N_JS, /upcomingOverdueMore: 'Show more'/);
  assert.match(I18N_JS, /upcomingOverdueMoreAria: 'Xem thêm \{n\} công việc quá hạn'/);
  assert.match(I18N_JS, /upcomingOverdueShowLess: 'Thu gọn'/);
  assert.match(I18N_JS, /upcomingOverdueShowLess: 'Collapse'/);
  assert.match(readRequiredAsset('js/upcoming.js'), /const OVERDUE_LIMIT = 15;/);
  assert.match(readRequiredAsset('js/upcoming.js'), /data-action="upcoming-overdue-toggle"/);
  assert.match(APP_JS, /act === 'upcoming-overdue-toggle'/);
  assert.match(readRequiredAsset('js/upcoming.js'), /overdue\.slice\(0, OVERDUE_LIMIT\)/);
  assert.match(readRequiredAsset('css/styles.css'), /\.up-overdue-more\s*{/);
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
  // Legal pages link back to landing and app (clean URL)
  assert.match(privacy, /href=\"app\"/);
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

  // P0.1 — legal pages must not contain JS-style escapes inside HTML attributes:
  //   * `\"` (escaped quotes) terminate the attribute early and leak text onto the page
  //   * `\uXXXX` are not HTML escapes and render as literal text via innerHTML
  const dataSec = readRequiredAsset('data-and-security.html');
  for (const page of [privacy, terms, dataSec]) {
    // escaped-quote href (\") and literal \\uXXXX unicode escapes are JS-style backslash
    // sequences that HTML does not interpret — legal pages must contain no backslashes at all
    assert.ok(!page.includes('\\'), 'no backslashes (JS-style escapes) in legal pages');
    // a translated attribute must not wrap an anchor (link has to be a real DOM element)
    assert.doesNotMatch(page, /data-t-(en|vi)="[^"]*<a /, 'translated attribute must not wrap an anchor');
  }
  // Fixed paragraphs use the span + standalone anchor split (link is a real DOM element,
  // attributes hold plain text only), and links stay clickable with both languages present.
  assert.match(privacy, /<span data-t-vi="Nếu bạn có câu hỏi về quyền riêng tư hoặc dữ liệu của mình, hãy mở một issue trên "/);
  assert.match(terms, /<span data-t-vi="Bạn sở hữu dữ liệu bạn nhập vào TaskFlow\./);
  assert.match(terms, /<span data-t-vi="Câu hỏi về các điều khoản này: mở issue trên "/);
  assert.match(terms, /<a href="privacy\.html" data-t-vi="Chính sách bảo mật" data-t-en="Privacy Policy">/);
  assert.match(privacy, /<a href="https:\/\/github\.com\/HungPhamManh06\/Todoist" rel="noopener noreferrer">GitHub<\/a>\./);
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
  assert.match(APP_JS, /toolsDrawerReturnFocusSelector[^]*#moreSheet \[data-action="tools-open"\]/);
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
  const xpMod = readRequiredAsset('js/xp.js');
  assert.match(xpMod, /function checkboxHTML\(mod, checked, attrs = '', label\)/);
  assert.match(xpMod, /TaskFlowUI\.checkboxA11y\(checked, label\)/);

  const callLines = APP_JS
    .split(/\r?\n/)
    .filter((line) => line.includes('checkboxHTML(') && !line.includes('function checkboxHTML'));
  assert.ok(callLines.length > 0, 'expected generated checkbox call sites');
  callLines.forEach((line) => {
    assert.match(line, /TaskFlowUI\.checkboxLabel\(/, `missing accessible label: ${line.trim()}`);
  });
});

test('gamification XP, smart repeat carry-over and .ics export are wired end-to-end', () => {
  // XP & Level — core ở js/xp.js; call-sites (addXP 10/15/20/30) ở app.js
  const xpMod = readRequiredAsset('js/xp.js');
  assert.match(xpMod, /function xpLevelInfo/);
  assert.match(xpMod, /function addXP/);
  assert.match(xpMod, /function renderXP/);
  assert.match(APP_JS, /addXP\(10\)/); // task
  assert.match(APP_JS, /addXP\(15\)/); // habit
  assert.match(APP_JS, /addXP\(20\)/); // mục tiêu tháng
  assert.match(APP_JS, /addXP\(30\)/); // mục tiêu năm
  assert.match(xpMod, /localStorage\.getItem\('planner-xp'\)/);
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
  const icsMod = readRequiredAsset('js/export.js');
  assert.match(icsMod, /function exportICS/);
  assert.match(icsMod, /BEGIN:VCALENDAR/);
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

test('P11: util.js module extracted — helpers live there, app.js keeps aliases', () => {
  const UTIL = readRequiredAsset('js/util.js');
  // app.html loads util.js before app.js
  assert.match(APP, /src="js\/util.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const utilIdx = APP.indexOf('js/util.min.js?v=');
  assert.ok(utilIdx >= 0 && utilIdx < appIdx, 'util.js phải load trước app.js');
  // sw.js precache util.js
  assert.ok(SW.includes("\'./js/util.min.js\'"), 'sw.js phải precache js/util.js');
  // app.js dùng alias destructure thay vì định nghĩa lại
  assert.match(APP_JS, /const \{ esc, localISODate, formatFocusTime, lineChartSVG \} = window\.TaskFlowUtil;/);
  assert.doesNotMatch(APP_JS, /const esc = \(s\) => String/);
  assert.doesNotMatch(APP_JS, /function localISODate\(/);
  // module export đủ 4 helpers
  assert.match(UTIL, /function esc\(s\)/);
  assert.match(UTIL, /function localISODate\(date\)/);
  assert.match(UTIL, /function formatFocusTime\(min\)/);
  assert.match(UTIL, /function lineChartSVG\(values/);
  assert.match(UTIL, /return \{ esc, localISODate, formatFocusTime, lineChartSVG \}/);
});

test('P11: i18n core extracted — helpers live in js/i18n.js, app.js keeps aliases', () => {
  // app.html loads i18n.js before app.js
  assert.match(APP, /src="js\/i18n.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const i18nIdx = APP.indexOf('js/i18n.min.js?v=');
  assert.ok(i18nIdx >= 0 && i18nIdx < appIdx, 'i18n.js phải load trước app.js');
  // sw.js precache i18n.js
  assert.ok(SW.includes("\'./js/i18n.min.js\'"), 'sw.js phải precache js/i18n.js');
  // app.js dùng alias destructure thay vì định nghĩa lại dictionary (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowI18N\) throw new Error\('TaskFlowI18N missing/);
  assert.match(APP_JS, /const \{ I18N, t, monthLabel, dayLabel, fmtDeadline, dateLocale, getLang, setLangCore, applyStaticI18N \} = window\.TaskFlowI18N;/);
  assert.doesNotMatch(APP_JS, /^const I18N = \{/m);
  assert.doesNotMatch(APP_JS, /function applyStaticI18N\(\)/);
  assert.doesNotMatch(APP_JS, /^let LANG = /m);
  // module export đủ API
  const mod = readRequiredAsset('js/i18n.js');
  assert.match(mod, /return \{ I18N, t, monthLabel, dayLabel, fmtDeadline, dateLocale, getLang, setLangCore, applyStaticI18N, MONTH_NAMES \}/);
  // dictionary đủ vi + en (2 bản I18N)
  assert.equal((mod.match(/^  vi: \{/m) || []).length, 1, 'i18n.js phải có dictionary vi');
  assert.equal((mod.match(/^  en: \{/m) || []).length, 1, 'i18n.js phải có dictionary en');
});

test('P12: setView clears stale inactive view DOM after rendering the target', () => {
  const source = APP_JS.slice(APP_JS.indexOf('function setView('), APP_JS.indexOf('function goWeek('));
  // Clear logic phải nằm trong setView, sau nhánh render view đích
  assert.match(source, /const activeSectionId = 'view-' \+ view;/);
  assert.match(source, /if \(s\.id === 'view-overview'\) \{[\s\S]{0,120}document\.getElementById\('ov-content'\)[\s\S]{0,120}oc\.innerHTML = ''/);
  assert.match(source, /else \{[\s\S]{0,60}s\.innerHTML = '';/);
  // Không clear view đang active — giữ section id bằng view hiện tại
  assert.match(source, /if \(!s \|\| s\.id === activeSectionId\) return;/);
  // setView vẫn re-render view đích (renderToday/renderWeek/... nguyên vẹn)
  assert.match(source, /if \(view === 'today'\)[\s\S]{0,80}renderToday\(\)/);
  // Version bumps: app.min.js + sw cache (P1.2 opt#1 min siblings)
  assert.match(APP, /js\/app\.min\.js\?v=206/);
  assert.match(SW, /const CACHE = 'taskflow-v252';/);
});

test('P11: goal stats extracted — weekStats/monthlyStats live in js/stats.js', () => {
  // app.html loads stats.js before app.js
  assert.match(APP, /src="js\/stats.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const stIdx = APP.indexOf('js/stats.min.js?v=');
  assert.ok(stIdx >= 0 && stIdx < appIdx, 'stats.js phải load trước app.js');
  // sw.js precache stats.js
  assert.ok(SW.includes("\'./js/stats.min.js\'"), 'sw.js phải precache js/stats.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowStats\) throw new Error\('TaskFlowStats missing/);
  assert.match(APP_JS, /const \{ weekStats, monthlyStats \} = window\.TaskFlowStats;/);
  assert.doesNotMatch(APP_JS, /^function weekStats\(/m);
  assert.doesNotMatch(APP_JS, /^function monthlyStats\(/m);
  // call-sites giữ nguyên: weekStats(w) giữ signature, monthlyStats nhận state
  assert.match(APP_JS, /weekStats\(selectedWeek\)/);
  assert.match(APP_JS, /monthlyStats\(state\)/);
  assert.doesNotMatch(APP_JS, /monthlyStats\(\)/);
  // module export đủ API
  const mod = readRequiredAsset('js/stats.js');
  assert.match(mod, /return \{ weekStats, monthlyStats \}/);
});

test('P11: date helpers extracted — fmtDate/isDayToday/dayLabelShort live in js/dates.js', () => {
  // app.html loads dates.js before app.js
  assert.match(APP, /src="js\/dates.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const dtIdx = APP.indexOf('js/dates.min.js?v=');
  assert.ok(dtIdx >= 0 && dtIdx < appIdx, 'dates.js phải load trước app.js');
  // sw.js precache dates.js
  assert.ok(SW.includes("\'./js/dates.min.js\'"), 'sw.js phải precache js/dates.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowDates\) throw new Error\('TaskFlowDates missing/);
  assert.match(APP_JS, /const \{ fmtDate, isDayToday, dayLabelShort \} = window\.TaskFlowDates;/);
  assert.doesNotMatch(APP_JS, /^function isDayToday\(/m);
  assert.doesNotMatch(APP_JS, /^function dayLabelShort\(/m);
  assert.doesNotMatch(APP_JS, /^const fmtDate = /m);
  // call-sites giữ nguyên (week day panel + focus chart + calendar)
  assert.match(APP_JS, /dayColumnHTML\(w, di, isDayToday\(d\)\)/);
  assert.match(APP_JS, /dayLabelShort\(di\)/);
  // module export đủ API
  const mod = readRequiredAsset('js/dates.js');
  assert.match(mod, /return \{ fmtDate, isDayToday, dayLabelShort \}/);
  assert.match(mod, /TaskFlowI18N/);
});

test('P11: sync UI helpers extracted — syncStatusText/updateSyncStatus/syncFormValues/syncErrorText live in js/syncui.js', () => {
  // app.html loads syncui.js before app.js
  assert.match(APP, /src="js\/syncui.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const sIdx = APP.indexOf('js/syncui.min.js?v=');
  assert.ok(sIdx >= 0 && sIdx < appIdx, 'syncui.js phải load trước app.js');
  // sw.js precache syncui.js
  assert.ok(SW.includes("\'./js/syncui.min.js\'"), 'sw.js phải precache js/syncui.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowSyncUI\) throw new Error\('TaskFlowSyncUI missing/);
  assert.match(APP_JS, /const \{ syncStatusText, updateSyncStatus, syncFormValues, syncErrorText \} = window\.TaskFlowSyncUI;/);
  assert.doesNotMatch(APP_JS, /^function syncStatusText\(/m);
  assert.doesNotMatch(APP_JS, /^function updateSyncStatus\(/m);
  assert.doesNotMatch(APP_JS, /^function syncFormValues\(/m);
  assert.doesNotMatch(APP_JS, /^function syncErrorText\(/m);
  // call-sites giữ nguyên trong app.js (qua alias)
  assert.match(APP_JS, /syncErrorText\(r && r\.error\)/);
  assert.match(APP_JS, /const \{ user, pass, pass2 \} = syncFormValues\(\)/);
  assert.match(APP_JS, /updateSyncStatus\(\);/);
  // setSyncMode + syncMode state giữ nguyên trong app.js
  assert.match(APP_JS, /^let syncMode = 'login';/m);
  assert.match(APP_JS, /^function setSyncMode\(/m);
  // module export đủ API + accessor pattern
  const mod = readRequiredAsset('js/syncui.js');
  assert.match(mod, /return \{ syncStatusText, updateSyncStatus, syncFormValues, syncErrorText \}/);
  assert.match(mod, /syncStatusConnecting/);
  assert.match(mod, /syncErrUsernameTaken/);
  assert.match(mod, /TaskFlowI18N/);
  assert.match(mod, /window\.Sync/);
});

test('P11: mini plan/report helpers extracted — psStart/shortMonth live in js/planmini.js', () => {
  // app.html loads planmini.js before app.js
  assert.match(APP, /src="js\/planmini.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const pmIdx = APP.indexOf('js/planmini.min.js?v=');
  assert.ok(pmIdx >= 0 && pmIdx < appIdx, 'planmini.js phải load trước app.js');
  // sw.js precache planmini.js
  assert.ok(SW.includes("\'./js/planmini.min.js\'"), 'sw.js phải precache js/planmini.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowPlanMini\) throw new Error\('TaskFlowPlanMini missing/);
  assert.match(APP_JS, /const \{ psStart, shortMonth \} = window\.TaskFlowPlanMini;/);
  assert.doesNotMatch(APP_JS, /^function psStart\(/m);
  assert.doesNotMatch(APP_JS, /^function shortMonth\(/m);
  // call-sites giữ nguyên trong app.js (qua alias); shortMonth(r.topMonth) +
  // focusReportBars(...) thuộc renderYearReportModal đã sang js/year-report.js
  // (P11 extraction 25) — kiểm tra ở module.
  // caller duy nhất là lastWeekReportData — đã sang js/report-ui.js (extraction 35)
  assert.match(readRequiredAsset('js/report-ui.js'), /new Date\(psStart\(srcState, srcY, srcM\)\)/);
  const yrmod_pm = readRequiredAsset('js/year-report.js');
  assert.match(yrmod_pm, /shortMonth\(r\.topMonth\)/);
  assert.match(yrmod_pm, /focusReportBars\(r\.focusByMonth, \(i\) => shortMonth\(i\)\)/);
  // module export đủ API + accessor pattern
  const mod = readRequiredAsset('js/planmini.js');
  assert.match(mod, /return \{ psStart, shortMonth \}/);
  assert.match(mod, /TaskFlowI18N/);
  assert.match(mod, /MONTH_NAMES/);
});

test('P11: now/clock helpers extracted — nowInfo/renderClock live in js/clock.js', () => {
  // app.html loads clock.js before app.js
  assert.match(APP, /src="js\/clock.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const cIdx = APP.indexOf('js/clock.min.js?v=');
  assert.ok(cIdx >= 0 && cIdx < appIdx, 'clock.js phải load trước app.js');
  // sw.js precache clock.js
  assert.ok(SW.includes("\'./js/clock.min.js\'"), 'sw.js phải precache js/clock.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowClock\) throw new Error\('TaskFlowClock missing/);
  assert.match(APP_JS, /const \{ nowInfo, renderClock \} = window\.TaskFlowClock;/);
  assert.doesNotMatch(APP_JS, /^function nowInfo\(/m);
  assert.doesNotMatch(APP_JS, /^function renderClock\(/m);
  // call-sites đổi signature: nowInfo(PLAN_START, NUM_DAYS, PLAN_YEAR, PLAN_MONTH) +
  // renderClock() giữ nguyên (year/month để range theo THÁNG planner, không lệch theo planStart)
  assert.match(APP_JS, /nowInfo\(PLAN_START, NUM_DAYS, PLAN_YEAR, PLAN_MONTH\)/);
  assert.match(APP_JS, /renderClock\(\);/);
  assert.doesNotMatch(APP_JS, /nowInfo\(\)/);
  // REGRESSION GUARD: destructure phải TRƯỚC top-level `state = bootState()` (gọi
  // loadState → nowInfo) — tránh TDZ 'Cannot access nowInfo before initialization'
  assert.ok(APP_JS.indexOf('window.TaskFlowClock') < APP_JS.indexOf('let state = bootState()'),
    'clock destructure phải TRƯỚC top-level bootState() — tránh TDZ nowInfo');
  // module export đủ API + accessor pattern
  const mod = readRequiredAsset('js/clock.js');
  assert.match(mod, /return \{ calendarDayDiff, nowInfo, resolveTodayCell, renderClock \}/);
  assert.match(mod, /TaskFlowDates/);
  assert.match(mod, /TaskFlowI18N/);
});

test('P10: resolveTodayCell là resolver canonical — Today/Week dùng chung', () => {
  // clock.js xuất resolver canonical cho ô hôm nay
  const mod = readRequiredAsset('js/clock.js');
  assert.match(mod, /function resolveTodayCell\(opts\)/);
  assert.match(mod, /inPlanMonth/);
  assert.match(mod, /weekIndex/);
  assert.match(mod, /weekNumber/);
  assert.match(mod, /dayIndex/);
  assert.match(mod, /cell\.day = d/); // tham chiếu trực tiếp, không copy
  // today.js renderToday dùng resolver (không tự suy lại công thức)
  const TODAY_JS = readRequiredAsset('js/today.js');
  assert.match(TODAY_JS, /resolveTodayCell\(/);
  assert.match(TODAY_JS, /cell\.inPlanMonth/);
  assert.doesNotMatch(TODAY_JS, /state\.weeks\[ti\.week - 1\]/);
  // app.js: todayPlannerTasks + today-addtask dùng cùng resolver
  assert.match(APP_JS, /todayPlannerTasks\(\)\s*\{[\s\S]*?resolveTodayCell\(/);
  assert.match(APP_JS, /act === 'today-addtask'[\s\S]*?resolveTodayCell\(/);
});

test('P10: renderWeek là PURE render — không materialize dữ liệu', () => {
  // BUG cũ: renderWeek() mở đầu bằng applyRecurrence() → mở view Tuần làm THAY ĐỔI
  // mảng task hôm nay (sinh bản lặp) → lệch trạng thái tuỳ view mở trước.
  assert.doesNotMatch(APP_JS, /function renderWeek\(\)\s*\{\s*applyRecurrence\(\)/);
  // Recurrence/carry-over chỉ chạy qua prepareTodayState() ở data lifecycle
  assert.match(APP_JS, /function prepareTodayState\(\)/);
  assert.match(APP_JS, /applyRecurrence\(\) > 0/);
  assert.match(APP_JS, /carryOverRepeatTasks\(\)/);
  // Gọi tại data lifecycle: boot, rebootState (đổi tài khoản), refreshToday (đổi ngày),
  // openMonth (đổi tháng), handleSyncChange (sync-load) → >= 5 call-site ngoài định nghĩa
  const prepCalls = (APP_JS.match(/prepareTodayState\(\);/g) || []).length;
  assert.ok(prepCalls >= 5, `prepareTodayState call sites: ${prepCalls}`);
  // renderWeek/renderToday không được gọi prepare (render thuần)
  const rw = APP_JS.slice(APP_JS.indexOf('function renderWeek()'), APP_JS.indexOf('function renderWeek()') + 40);
  assert.doesNotMatch(rw, /prepareTodayState|applyRecurrence/);
});

test('P11: plan shell helpers extracted — monthKey/updateBrand/buildMonthNav live in js/shell.js', () => {
  // app.html loads shell.js before app.js
  assert.match(APP, /src="js\/shell.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const shIdx = APP.indexOf('js/shell.min.js?v=');
  assert.ok(shIdx >= 0 && shIdx < appIdx, 'shell.js phải load trước app.js');
  // sw.js precache shell.js
  assert.ok(SW.includes("\'./js/shell.min.js\'"), 'sw.js phải precache js/shell.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowShell\) throw new Error\('TaskFlowShell missing/);
  assert.match(APP_JS, /const \{ monthKey, updateBrand, buildMonthNav \} = window\.TaskFlowShell;/);
  assert.doesNotMatch(APP_JS, /^function monthKey\(/m);
  assert.doesNotMatch(APP_JS, /^function updateBrand\(/m);
  assert.doesNotMatch(APP_JS, /^function buildMonthNav\(/m);
  // call-sites đổi signature: nhận PLAN_YEAR/PLAN_MONTH tham số
  assert.match(APP_JS, /monthKey\(PLAN_YEAR, PLAN_MONTH\)/);
  assert.match(APP_JS, /updateBrand\(PLAN_YEAR, PLAN_MONTH\)/);
  assert.doesNotMatch(APP_JS, /monthKey\(\)/);
  // REGRESSION GUARD (bài học extraction 18 TDZ): destructure phải TRƯỚC bootState
  assert.ok(APP_JS.indexOf('window.TaskFlowShell') < APP_JS.indexOf('let state = bootState()'),
    'shell destructure phải TRƯỚC top-level bootState() — tránh TDZ monthKey');
  // module export đủ API + accessor pattern
  const mod = readRequiredAsset('js/shell.js');
  assert.match(mod, /return \{ monthKey, updateBrand, buildMonthNav \}/);
  assert.match(mod, /TaskFlowI18N/);
  assert.match(mod, /querySelectorAll\('\[data-action="monthselect"\]'\)/);
});

test('P11: inbox view extracted — loadInbox/saveInbox/renderInbox/schedule flow live in js/inbox.js', () => {
  // app.html loads inbox.js before app.js
  assert.match(APP, /src="js\/inbox.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const ibIdx = APP.indexOf('js/inbox.min.js?v=');
  assert.ok(ibIdx >= 0 && ibIdx < appIdx, 'inbox.js phải load trước app.js');
  // sw.js precache inbox.js
  assert.ok(SW.includes("\'./js/inbox.min.js\'"), 'sw.js phải precache js/inbox.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowInbox\) throw new Error\('TaskFlowInbox missing/);
  assert.match(APP_JS, /const \{ loadInbox, saveInbox, renderInbox, inboxTargetForDate, handleInboxAction \} = window\.TaskFlowInbox;/);
  assert.doesNotMatch(APP_JS, /^function loadInbox\(/m);
  assert.doesNotMatch(APP_JS, /^function saveInbox\(/m);
  assert.doesNotMatch(APP_JS, /^function renderInbox\(/m);
  assert.doesNotMatch(APP_JS, /^function inboxTargetForDate\(/m);
  assert.doesNotMatch(APP_JS, /^function scheduleInboxTask\(/m);
  assert.doesNotMatch(APP_JS, /^function addInboxTask\(/m);
  // call-sites giữ nguyên trong app.js (qua alias) — inbox nạp trước khi render
  assert.match(APP_JS, /let inbox = loadInbox\(\);/);
  assert.match(APP_JS, /renderInbox\(inbox\)/);
  assert.match(APP_JS, /saveInbox\(inbox\)/);
  // caller duy nhất inboxTargetForDate(dt) là pushTaskToDate — đã sang js/upcoming.js (extraction 36)
  assert.match(readRequiredAsset('js/upcoming.js'), /inboxTargetForDate\(dt\)/);
  // REGRESSION GUARD: destructure phải TRƯỚC top-level `let inbox = loadInbox()` (TDZ loadInbox)
  assert.ok(APP_JS.indexOf('window.TaskFlowInbox') < APP_JS.indexOf('let inbox = loadInbox()'),
    'inbox destructure phải TRƯỚC top-level loadInbox() — tránh TDZ loadInbox');
  // module export đủ API + accessor pattern
  const mod = readRequiredAsset('js/inbox.js');
  assert.match(mod, /return \{[\s\S]*loadInbox,[\s\S]*saveInbox,[\s\S]*renderInbox,[\s\S]*inboxTargetForDate,[\s\S]*scheduleInboxTask,[\s\S]*addInboxTask,[\s\S]*handleInboxAction,[\s\S]*\};/);
  assert.match(mod, /window\.Sync/);
  assert.match(mod, /module\.exports/);
  // pushTaskToDate sang js/upcoming.js (extraction 36) — vẫn dùng chung Quick Add + Inbox qua alias
  assert.doesNotMatch(APP_JS, /^function pushTaskToDate\(/m);
  assert.match(readRequiredAsset('js/upcoming.js'), /function pushTaskToDate\(tk, dt\)/);
});

test('P11: chat helpers extracted — CHAT_RESPONSES/doChatSend/doChatSuggest/chatBotReply live in js/chat.js', () => {
  // P1.5 lazy-load: chat.js KHÔNG còn trong chuỗi script boot app.html
  assert.doesNotMatch(APP, /src="js\/chat\.min\.js/, 'chat.js phải lazy-load (không ở boot)');
  // sw.js vẫn precache chat.js (offline vẫn dùng được feature)
  assert.ok(SW.includes("\'./js/chat.min.js\'"), 'sw.js phải precache js/chat.js');
  // app.js không định nghĩa lại + không destructure guard; nạp lazy qua runLazyChat
  // (Phase 3B chain: ai-context → ai-chat-context → chat-provider → chat)
  assert.match(APP_JS, /runLazyChat\(\(\) => window\.TaskFlowChat\.doChatSend\(\)\)/);
  assert.match(APP_JS, /ensureLazyModule\('js\/ai-context\.min\.js'\)/);
  assert.doesNotMatch(APP_JS, /const \{ doChatSend, doChatSuggest \} = window\.TaskFlowChat;/);
  assert.doesNotMatch(APP_JS, /^const CHAT_RESPONSES = \{/m);
  assert.doesNotMatch(APP_JS, /^function doChatSend\(/m);
  assert.doesNotMatch(APP_JS, /^function doChatSuggest\(/m);
  assert.doesNotMatch(APP_JS, /^function chatBotReply\(/m);
  // call-sites qua window access sau khi nạp — dispatcher + Enter key trong chat input
  assert.match(APP_JS, /act === 'chat-send'[\s\S]{0,140}window\.TaskFlowChat\.doChatSend\(\)\)/);
  assert.match(APP_JS, /act === 'chat-suggest'[\s\S]{0,140}window\.TaskFlowChat\.doChatSuggest\(el\.dataset\.topic\)\)/);
  assert.match(APP_JS, /activeElement\.id === 'chatInput'[\s\S]{0,140}window\.TaskFlowChat\.doChatSend\(\)/);
  // module export đủ API + accessor pattern
  const mod = readRequiredAsset('js/chat.js');
  assert.match(mod, /return \{[\s\S]*SUGGESTIONS[\s\S]*doChatSend[\s\S]*doChatSuggest[\s\S]*doChatClear/);
  assert.match(mod, /module\.exports/);
  assert.match(mod, /study-plan/);
});

test('P11: persistent floating Chat FAB — static HTML/CSS, lazy modules never boot-load', () => {
  // 1. FAB exists in the wrap, uses the existing brain icon, ARIA-complete
  const fabBlock = (APP.match(/class="chat-fab" id="chatFab"[\s\S]*?<\/button>/) || [''])[0];
  assert.ok(fabBlock, 'FAB button block must exist');
  assert.match(fabBlock, /data-action="chat-toggle"/);
  assert.match(fabBlock, /data-shell-icon="brain"/);
  assert.match(fabBlock, /aria-label="Mở Trợ lý TaskFlow"/);
  assert.match(fabBlock, /data-i18n-aria="chatFabAria"/);
  assert.match(fabBlock, /title="Trợ lý TaskFlow"/);
  assert.match(fabBlock, /data-i18n-title="chatFabTitle"/);
  assert.match(fabBlock, /aria-controls="chatPop"/);
  assert.match(fabBlock, /aria-expanded="false"/);
  // 2. Exactly one FAB + one panel; FAB sits INSIDE the wrap with the panel
  assert.equal((APP.match(/id="chatFab"/g) || []).length, 1);
  assert.equal((APP.match(/id="chatPop"/g) || []).length, 1);
  assert.match(APP, /id="chatFabWrap"[\s\S]*?id="chatFab"[\s\S]*?id="chatPop"/);
  // 3. Boot path unchanged — no chat module script in app.html (still lazy)
  assert.doesNotMatch(APP, /src="js\/chat\.min\.js/);
  assert.doesNotMatch(APP, /src="js\/chat-provider\.min\.js/);
  assert.doesNotMatch(APP, /src="js\/ai-chat-context\.min\.js/);
  assert.doesNotMatch(APP, /src="js\/ai-context\.min\.js/);
  // 4. FAB CSS in the critical path: 48px circle, semantic info-blue, dark-safe
  const CSS = readRequiredAsset('css/styles-critical.css');
  assert.match(CSS, /\.chat-fab \{\s*width: 48px;\s*height: 48px;\s*border-radius: 50%;/);
  assert.match(CSS, /\.chat-fab \{\s*[\s\S]{0,300}background: var\(--color-info\);/);
  assert.match(CSS, /\.chat-fab:hover/);
  assert.match(CSS, /\.chat-fab:active/);
  assert.match(CSS, /\.chat-fab\[aria-expanded="true"\]/);
  // 5. Panel anchored ABOVE the FAB (bottom: calc(100% + 10px)) — no overlap
  assert.match(CSS, /\.chat-pop \{\s*position: absolute;\s*top: auto;\s*bottom: calc\(100% \+ 10px\);/);
  // 6. Mobile: panel capped with 100dvh (keyboard-safe), FAB above bottom nav
  assert.match(CSS, /@media \(max-width: 767px\) \{\s*[\s\S]{0,200}\.chat-pop \{ max-height: min\(480px, calc\(100dvh - 176px\)\); \}/);
  const SHELL = readRequiredAsset('css/app-shell.css');
  assert.match(SHELL, /body \.fb-fab-wrap \{\s*bottom: calc\(82px \+ env\(safe-area-inset-bottom\)\);/);
  // 7. Hidden while More sheet is open (no overlap with critical modals)
  assert.match(SHELL, /body\.more-sheet-open \.pomo-fab,\s*body\.more-sheet-open \.chat-fab \{\s*visibility: hidden;/);
});

test('P11: chat FAB behavior — toggle aria-expanded, focus return, Escape, click-outside', () => {
  // dispatcher toggles panel + aria-expanded, focuses input on open
  assert.match(APP_JS, /act === 'chat-toggle'[\s\S]{0,120}const opening = p\.hidden/);
  assert.match(APP_JS, /fab\.setAttribute\('aria-expanded', String\(opening\)\)/);
  assert.match(APP_JS, /_chatOpenedFromFab = !!/);
  assert.match(APP_JS, /const inp = document\.getElementById\('chatInput'\);\s*if \(inp && typeof inp\.focus === 'function'\) inp\.focus\(\);/);
  // shared close: aria-expanded=false + focus return to FAB, no history wipe
  assert.match(APP_JS, /function closeChatPanel\(\) \{\s*const p = document\.getElementById\('chatPop'\);/);
  assert.match(APP_JS, /fab\.setAttribute\('aria-expanded', 'false'\)/);
  assert.match(APP_JS, /if \(_chatOpenedFromFab && fab && typeof fab\.focus === 'function'\) fab\.focus\(\);/);
  assert.match(APP_JS, /act === 'chat-close'\) \{\s*closeChatPanel\(\);\s*return;/);
  // click-outside closes, but never while clicking inside the wrap or openers
  assert.match(APP_JS, /t\.closest\('#chatFabWrap'\) \|\| t\.closest\('\[data-action="chat-toggle"\]'\)\)\) return;/);
  // Escape closes chat first (keeps conversation)
  assert.match(APP_JS, /if \(e\.key === 'Escape'\) \{\s*\/\/ Floating Chat: Escape đóng popover[\s\S]{0,80}if \(closeChatPanel\(\)\) return;/);
  // i18n keys for title/aria exist in both locales
  const i18n = readRequiredAsset('js/i18n.js');
  assert.match(i18n, /chatFabTitle: 'Trợ lý TaskFlow'/);
  assert.match(i18n, /chatFabAria: 'Mở Trợ lý TaskFlow'/);
  assert.match(i18n, /chatFabTitle: 'TaskFlow Assistant'/);
  assert.match(i18n, /chatFabAria: 'Open TaskFlow Assistant'/);
});

test('P11: search extracted — openSearchModal/closeSearchModal/runSearch/renderSearchResults/goSearchResult live in js/search.js', () => {
  // P1.5 lazy-load: search.js KHÔNG còn trong chuỗi script boot app.html
  assert.doesNotMatch(APP, /src="js\/search\.min\.js/, 'search.js phải lazy-load (không ở boot)');
  // sw.js vẫn precache search.js (offline vẫn dùng được feature)
  assert.ok(SW.includes("\'./js/search.min.js\'"), 'sw.js phải precache js/search.js');
  // app.js không định nghĩa lại + không destructure guard; nạp lazy qua runLazyModule
  assert.match(APP_JS, /runLazyModule\('js\/search\.min\.js'/);
  assert.doesNotMatch(APP_JS, /const \{ openSearchModal, closeSearchModal, renderSearchResults, goSearchResult \} = window\.TaskFlowSearch;/);
  assert.doesNotMatch(APP_JS, /^function openSearchModal\(/m);
  assert.doesNotMatch(APP_JS, /^function closeSearchModal\(/m);
  assert.doesNotMatch(APP_JS, /^function runSearch\(/m);
  assert.doesNotMatch(APP_JS, /^function renderSearchResults\(/m);
  assert.doesNotMatch(APP_JS, /^function goSearchResult\(/m);
  // call-sites qua window access sau khi nạp: dispatcher + toggle + debounce + backdrop
  assert.match(APP_JS, /act === 'search-toggle'[\s\S]{0,140}window\.TaskFlowSearch\.openSearchModal\(\)\)/);
  assert.match(APP_JS, /act === 'search-close'[\s\S]{0,180}window\.TaskFlowSearch\.closeSearchModal\(\)\)/);
  assert.match(APP_JS, /act === 'search-go'[\s\S]{0,140}window\.TaskFlowSearch\.goSearchResult\(el\)\)/);
  assert.match(APP_JS, /if \(m\.hidden\) runLazyModule\('js\/search\.min\.js', \(\) => window\.TaskFlowSearch\.openSearchModal\(\)\);/);
  assert.match(APP_JS, /setTimeout\(\(\) => runLazyModule\('js\/search\.min\.js', \(\) => window\.TaskFlowSearch\.renderSearchResults\(t\.value\)\), 200\)/);
  assert.match(APP_JS, /e\.target === s\) runLazyModule\('js\/search\.min\.js', \(\) => window\.TaskFlowSearch\.closeSearchModal\(\)\);/);
  // module export đủ API + accessor pattern
  const mod = readRequiredAsset('js/search.js');
  assert.match(mod, /return \{ openSearchModal, closeSearchModal, runSearch, renderSearchResults, goSearchResult \}/);
  assert.match(mod, /module\.exports/);
  assert.match(mod, /emptyStateHTML\('🔍', 'searchEmpty', 'searchEmptySub'\)/);
  assert.match(mod, /emptyStateHTML\('🐥', 'searchNoResults', 'searchNoResultsSub'\)/);
  assert.match(mod, /monthStateRaw\(y, m\)/);
  assert.match(mod, /search-hit/);
});

test('P11: stats-ui extracted — stats modal (A20) lives in js/stats-ui.js, lazy via runLazyModule', () => {
  // P1.5 lazy-load: stats-ui.js KHÔNG còn trong chuỗi script boot app.html
  assert.doesNotMatch(APP, /src="js\/stats-ui\.min\.js/, 'stats-ui.js phải lazy-load (không ở boot)');
  // sw.js vẫn precache stats-ui.js (offline vẫn dùng được feature)
  assert.ok(SW.includes("\'./js/stats-ui.min.js\'"), 'sw.js phải precache js/stats-ui.js');
  // app.js không định nghĩa lại; nạp lazy qua runLazyModule ở dispatcher
  assert.match(APP_JS, /runLazyModule\('js\/stats-ui\.min\.js'/);
  assert.doesNotMatch(APP_JS, /^let statsRange = 'month';/m);
  assert.doesNotMatch(APP_JS, /^function statsData\(/m);
  assert.doesNotMatch(APP_JS, /^function statsCorrelation\(/m);
  assert.doesNotMatch(APP_JS, /^function statsScatterSVG\(/m);
  assert.doesNotMatch(APP_JS, /^function renderStatsModal\(/m);
  assert.doesNotMatch(APP_JS, /^function openStatsModal\(/m);
  assert.doesNotMatch(APP_JS, /^function closeStatsModal\(/m);
  // call-sites qua window access sau khi nạp: dispatcher stats/stats-close/stats-range
  assert.match(APP_JS, /act === 'stats'[\s\S]{0,140}window\.TaskFlowStatsUI\.openStatsModal\(\)\)/);
  assert.match(APP_JS, /act === 'stats-close'[\s\S]{0,140}window\.TaskFlowStatsUI\.closeStatsModal\(\)\)/);
  assert.match(APP_JS, /act === 'stats-range'[\s\S]{0,140}window\.TaskFlowStatsUI\.setStatsRange\(el\.dataset\.range\)\)/);
  // module export đủ API + accessor pattern + vẫn giữ statsRange state riêng
  const mod = readRequiredAsset('js/stats-ui.js');
  assert.match(mod, /return \{ openStatsModal, closeStatsModal, setStatsRange \}/);
  assert.match(mod, /module\.exports/);
  assert.match(mod, /let statsRange = 'month';/);
  assert.match(mod, /statsScatterSVG\(ps\)/);
});

test('P11: backup extracted — backup subsystem (A27) lives in js/backup.js, lazy via ensureLazyModule/runLazyModule', () => {
  // P1.5 lazy-load: backup.js KHÔNG còn trong chuỗi script boot app.html
  assert.doesNotMatch(APP, /src="js\/backup\.min\.js/, 'backup.js phải lazy-load (không ở boot)');
  // sw.js vẫn precache backup.js (offline vẫn dùng được feature)
  assert.ok(SW.includes("\'./js/backup.min.js\'"), 'sw.js phải precache js/backup.js');
  // app.js không định nghĩa lại backup core; nạp lazy qua ensureLazyModule (save) + runLazyModule (dispatcher)
  assert.match(APP_JS, /ensureLazyModule\('js\/backup\.min\.js'\)/);
  assert.match(APP_JS, /runLazyModule\('js\/backup\.min\.js'/);
  assert.doesNotMatch(APP_JS, /^const BACKUP_SLOTS = 7;/m);
  assert.doesNotMatch(APP_JS, /^function rotateBackup\(/m);
  assert.doesNotMatch(APP_JS, /^function maybeAutoBackup\(/m);
  assert.doesNotMatch(APP_JS, /^function listBackups\(/m);
  assert.doesNotMatch(APP_JS, /^function openBackupModal\(/m);
  assert.doesNotMatch(APP_JS, /^function closeBackupModal\(/m);
  assert.doesNotMatch(APP_JS, /^function doRestoreBackup\(/m);
  // save path fail-safe: backupAfterSave không throw, không spam toast
  assert.match(APP_JS, /function backupAfterSave\(\)/);
  assert.match(APP_JS, /backup là best-effort/);
  // call-sites qua window access: dispatcher backup-restore/backup-close/backup-use + backdrop
  assert.match(APP_JS, /act === 'backup-restore'[\s\S]{0,140}window\.TaskFlowBackup\.openBackupModal\(\)\)/);
  assert.match(APP_JS, /act === 'backup-use'[\s\S]{0,140}window\.TaskFlowBackup\.doRestoreBackup\(\+el\.dataset\.idx\)\)/);
  assert.match(APP_JS, /e\.target === bm\) runLazyModule\('js\/backup\.min\.js', \(\) => window\.TaskFlowBackup\.closeBackupModal\(\)\)/);
  // module export đủ API + accessor pattern
  const mod = readRequiredAsset('js/backup.js');
  assert.match(mod, /return \{ rotateBackup, maybeAutoBackup, openBackupModal, closeBackupModal, doRestoreBackup \}/);
  assert.match(mod, /module\.exports/);
  assert.match(mod, /BACKUP_SLOTS = 7/);
});

test('P11: quick-add extracted — openQuickAdd/closeQuickAdd/submitQuickAdd/quickAddDefaultTarget live in js/quick-add.js', () => {
  // P1.5 lazy-load: quick-add.js KHÔNG còn trong chuỗi script boot app.html
  assert.doesNotMatch(APP, /src="js\/quick-add\.min\.js/, 'quick-add.js phải lazy-load (không ở boot)');
  // sw.js vẫn precache quick-add.js (offline vẫn dùng được feature)
  assert.ok(SW.includes("\'./js/quick-add.min.js\'"), 'sw.js phải precache js/quick-add.js');
  // app.js không định nghĩa lại + không destructure guard; nạp lazy qua runLazyModule
  assert.match(APP_JS, /runLazyModule\('js\/quick-add\.min\.js'/);
  assert.doesNotMatch(APP_JS, /const \{ openQuickAdd, closeQuickAdd, submitQuickAdd \} = window\.TaskFlowQuickAdd;/);
  assert.doesNotMatch(APP_JS, /^function openQuickAdd\(/m);
  assert.doesNotMatch(APP_JS, /^function closeQuickAdd\(/m);
  assert.doesNotMatch(APP_JS, /^function submitQuickAdd\(/m);
  assert.doesNotMatch(APP_JS, /^function quickAddDefaultTarget\(/m);
  // call-sites qua window access sau khi nạp: phím tắt + dispatcher + boot ?quick=1
  assert.match(APP_JS, /id === 'quickAddInput'/);
  assert.match(APP_JS, /act === 'quickadd-do'/);
  assert.match(APP_JS, /act === 'quickadd-close'/);
  assert.match(APP_JS, /act === 'shell-add-task'[\s\S]{0,140}window\.TaskFlowQuickAdd\.openQuickAdd\(\)\)/);
  // V1.5: boot ?quick=1 / share capture mở Quick Add + prefill payload đã sanitize
  assert.match(APP_JS, /setTimeout\(\(\) => runLazyModule\('js\/quick-add\.min\.js', \(\) => \{\s*window\.TaskFlowQuickAdd\.openQuickAdd\(\);\s*if \(capture && window\.TaskFlowQuickCapture\)/);
  // module export đủ API + logic giữ nguyên (target context, inbox scope, pushTaskToDate dùng chung)
  const qamod = readRequiredAsset('js/quick-add.js');
  assert.match(qamod, /return \{ openQuickAdd, closeQuickAdd, submitQuickAdd \}/);
  assert.match(qamod, /module\.exports/);
  assert.match(qamod, /state\.view === 'inbox'/);
  assert.match(qamod, /state\.view === 'day'/);
  assert.match(qamod, /state\.view === 'week'/);
  assert.match(qamod, /tk\.inbox = true;/);
  assert.match(qamod, /pushTaskToDate\(tk, dt\)/);
  assert.match(qamod, /newTaskUid\(\)/);
  assert.match(qamod, /TaskFlowUI\.openDialog\('quickAddModal'\)/);
});

test('P11: mood extracted — loadMood/saveMood/moodCardHTML/openMoodPicker/closeMoodPicker/rerenderMoodCard live in js/mood.js', () => {
  // app.html loads mood.js before app.js
  assert.match(APP, /src="js\/mood.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const moIdx = APP.indexOf('js/mood.min.js?v=');
  assert.ok(moIdx >= 0 && moIdx < appIdx, 'mood.js phải load trước app.js');
  // sw.js precache mood.js
  assert.ok(SW.includes("\'./js/mood.min.js\'"), 'sw.js phải precache js/mood.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowMood\) throw new Error\('TaskFlowMood missing/);
  assert.match(APP_JS, /const \{ loadMood, saveMood, moodCardHTML, openMoodPicker, closeMoodPicker, rerenderMoodCard \} = window\.TaskFlowMood;/);
  assert.doesNotMatch(APP_JS, /^function loadMood\(/m);
  assert.doesNotMatch(APP_JS, /^function saveMood\(/m);
  assert.doesNotMatch(APP_JS, /^function moodCardHTML\(/m);
  assert.doesNotMatch(APP_JS, /^function openMoodPicker\(/m);
  // MOOD_KEY/MOODS/moodMap vẫn ở app.js (dispatcher mood-* + day-view + undo snapshot)
  assert.match(APP_JS, /const MOOD_KEY = 'planner-mood'/);
  assert.match(APP_JS, /let moodMap = \{\};/);
  assert.match(APP_JS, /data-action="mood"/);
  assert.match(APP_JS, /snap\.mood/);
  // module export đủ API + logic giữ nguyên
  const momod = readRequiredAsset('js/mood.js');
  assert.match(momod, /return \{ loadMood, saveMood, moodCardHTML, openMoodPicker, closeMoodPicker, rerenderMoodCard \}/);
  assert.match(momod, /module\.exports/);
  assert.match(momod, /MOOD_KEY/);
  assert.match(momod, /moodMap\[moodDateKey\(d, PLAN_YEAR, PLAN_MONTH\)\]/);
  assert.match(momod, /moodSummary\(pairs\)/);
  assert.match(momod, /TaskFlowUI\.openDialog\('moodPicker'\)/);
  assert.match(momod, /dayAggregate\(state, d\)/);
});

test('P11: year-report extracted — yearlyReportData/renderYearReportModal/openYearReportModal/closeYearReportModal/yearReportCardBlob/doShareYearReport live in js/year-report.js', () => {
  // P1.5 lazy-load: year-report.js KHÔNG còn trong chuỗi script boot app.html
  assert.doesNotMatch(APP, /src="js\/year-report\.min\.js/, 'year-report.js phải lazy-load (không ở boot)');
  // sw.js vẫn precache year-report.js (offline vẫn dùng được feature)
  assert.ok(SW.includes("\'./js/year-report.min.js\'"), 'sw.js phải precache js/year-report.js');
  // app.js không định nghĩa lại + không destructure guard; nạp lazy qua runLazyModule
  assert.match(APP_JS, /runLazyModule\('js\/year-report\.min\.js'/);
  assert.doesNotMatch(APP_JS, /const \{ openYearReportModal, closeYearReportModal, doShareYearReport \} = window\.TaskFlowYearReport;/);
  assert.doesNotMatch(APP_JS, /^function yearlyReportData\(/m);
  assert.doesNotMatch(APP_JS, /^function renderYearReportModal\(/m);
  assert.doesNotMatch(APP_JS, /^function openYearReportModal\(/m);
  assert.doesNotMatch(APP_JS, /^function yearReportCardBlob\(/m);
  // call-sites qua window access sau khi nạp: dispatcher + outside-click
  assert.match(APP_JS, /act === 'year-report'[\s\S]{0,140}window\.TaskFlowYearReport\.openYearReportModal\(\)\)/);
  assert.match(APP_JS, /act === 'close-year-report'[\s\S]{0,140}window\.TaskFlowYearReport\.closeYearReportModal\(\)\)/);
  assert.match(APP_JS, /act === 'share-year-report'[\s\S]{0,140}window\.TaskFlowYearReport\.doShareYearReport\(\)\)/);
  // module export đủ API + logic giữ nguyên
  const yrmod = readRequiredAsset('js/year-report.js');
  assert.match(yrmod, /return \{ yearlyReportData, renderYearReportModal, openYearReportModal, closeYearReportModal, yearReportCardBlob, doShareYearReport \}/);
  assert.match(yrmod, /module\.exports/);
  assert.match(yrmod, /yearGoalStats\(\)/);
  assert.match(yrmod, /focusYearByMonth\(\)/);
  assert.match(yrmod, /taskFocusMinLabel\(r\.topTask\.secs\)/);
  assert.match(yrmod, /navigator\.share/);
  assert.match(yrmod, /c\.toBlob/);
});

test('P11: digest extracted — computeDigest/updateDigestCache live in js/digest.js', () => {
  // P1.5 lazy-load: digest.js KHÔNG còn trong chuỗi script boot app.html
  assert.doesNotMatch(APP, /src="js\/digest\.min\.js/, 'digest.js phải lazy-load (không ở boot)');
  // sw.js vẫn precache digest.js (offline vẫn dùng được feature)
  assert.ok(SW.includes("\'./js/digest.min.js\'"), 'sw.js phải precache js/digest.js');
  // app.js không định nghĩa lại + không destructure guard; nạp lazy qua runLazyModule
  assert.match(APP_JS, /runLazyModule\('js\/digest\.min\.js'/);
  assert.doesNotMatch(APP_JS, /const \{ updateDigestCache \} = window\.TaskFlowDigest;/);
  assert.doesNotMatch(APP_JS, /^function computeDigest\(/m);
  assert.doesNotMatch(APP_JS, /^function updateDigestCache\(/m);
  assert.doesNotMatch(APP_JS, /let digestCacheTs = 0;/m);
  // call-sites qua window access sau khi nạp: afterHabitToggle + refreshToday + boot
  assert.match(APP_JS, /function afterHabitToggle\(\)[\s\S]{0,160}window\.TaskFlowDigest\.updateDigestCache\(\)\)/);
  assert.match(APP_JS, /function refreshToday\(\)[\s\S]{0,160}window\.TaskFlowDigest\.updateDigestCache\(\)\)/);
  assert.match(APP_JS, /setTimeout\(\(\) => runLazyModule\('js\/digest\.min\.js', \(\) => window\.TaskFlowDigest\.updateDigestCache\(\)\), 2000\)/);
  // module export đủ API + logic giữ nguyên
  const dgmod = readRequiredAsset('js/digest.js');
  assert.match(dgmod, /return \{ computeDigest, updateDigestCache \}/);
  assert.match(dgmod, /module\.exports/);
  assert.match(dgmod, /digestCacheTs/);
  assert.match(dgmod, /caches\.open\('taskflow-digest'\)/);
  assert.match(dgmod, /digestBody\', \{ names \}\)/);
});

test('P11: remind-ui extracted — scheduleItemReminder/syncReminderTimers/renderRemindList/insertBeforeTaskActions/beginRemindEdit/turnOffRemind live in js/remind-ui.js', () => {
  // app.html loads remind-ui.js before app.js
  assert.match(APP, /src="js\/remind-ui.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const ruIdx = APP.indexOf('js/remind-ui.min.js?v=');
  assert.ok(ruIdx >= 0 && ruIdx < appIdx, 'remind-ui.js phải load trước app.js');
  // sw.js precache remind-ui.js
  assert.ok(SW.includes("\'./js/remind-ui.min.js\'"), 'sw.js phải precache js/remind-ui.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowRemindUI\) throw new Error\('TaskFlowRemindUI missing/);
  assert.match(APP_JS, /const \{ syncReminderTimers, renderRemindList, insertBeforeTaskActions, beginRemindEdit, turnOffRemind \} = window\.TaskFlowRemindUI;/);
  assert.doesNotMatch(APP_JS, /^function scheduleItemReminder\(/m);
  assert.doesNotMatch(APP_JS, /^function syncReminderTimers\(/m);
  assert.doesNotMatch(APP_JS, /^function renderRemindList\(/m);
  assert.doesNotMatch(APP_JS, /^function beginRemindEdit\(/m);
  assert.doesNotMatch(APP_JS, /^function turnOffRemind\(/m);
  assert.doesNotMatch(APP_JS, /let itemRemindTimers = \[\];/m);
  // call-sites giữ nguyên trong app.js: insertBeforeTaskActions dùng chung beginRepeatEdit/beginTagEdit
  assert.match(APP_JS, /insertBeforeTaskActions\(btn, wrap\);/);
  assert.match(APP_JS, /insertBeforeTaskActions\(btn, input\);/);
  assert.match(APP_JS, /setTimeout\(syncReminderTimers, 1000\)/);
  // module export đủ API + logic giữ nguyên
  const rumod = readRequiredAsset('js/remind-ui.js');
  assert.match(rumod, /return \{ scheduleItemReminder, syncReminderTimers, renderRemindList, insertBeforeTaskActions, beginRemindEdit, turnOffRemind \}/);
  assert.match(rumod, /module\.exports/);
  assert.match(rumod, /itemRemindTimers/);
  assert.match(rumod, /new Notification\('TaskFlow/);
  assert.match(rumod, /remindSetDone/);
  assert.match(rumod, /remind-off-item/);
});

test('Mobile bottom-nav redesign: Today/Upcoming/FAB/Habits/More + sheet chứa week/inbox/overview/year/calendar', () => {
  // buildNav mobile: 5 mục đúng thứ tự Hôm nay / Sắp tới / + (FAB action) / Thói quen / Thêm
  assert.match(APP_JS, /mobileItem\(byView\.today\) \+/);
  assert.match(APP_JS, /mobileItem\(byView\.upcoming\) \+/);
  assert.match(APP_JS, /app-mobile-nav-fab" data-action="shell-add-task"/);
  assert.match(APP_JS, /data-action="habits"/);
  assert.match(APP_JS, /data-action="more" aria-controls="moreSheet"/);
  // FAB là ACTION: không data-nav-view → updateNav không bao giờ active (chỉ 1 tab active)
  assert.match(APP_JS, /app-mobile-nav-fab/);
  assert.doesNotMatch(APP_JS, /app-mobile-nav-fab[\s\S]{0,80}data-nav-view/);
  // More sheet: Inbox, Tuần, Tổng quan, Năm, Lịch + Focus, Báo cáo, Cài đặt (Upcoming đã là tab chính)
  assert.match(APP_JS, /MORE_SHEET_VIEWS\.map\(\(v\) => byView\[v\]\)/);
  assert.match(APP_JS, /actionBtn\('focus'/);
  assert.match(APP_JS, /actionBtn\('report'/);
  assert.match(APP_JS, /actionBtn\('tools-open', 'settings'/);
  // Mobile UI polish: More sheet chia 3 nhóm (Điều hướng/Công cụ/Hệ thống) —
  // Trợ lý (chat-toggle) thay cho nút floating 🤖; sheet có group label.
  assert.match(APP_JS, /const moreGroups = \[/);
  assert.match(APP_JS, /actionBtn\('chat-toggle', 'help'/);
  assert.match(APP_JS, /more-sheet-group-label/);
  // Week không còn là tab chính mobile
  assert.doesNotMatch(APP_JS, /mobileItem\(byView\.week\)/);
  // View trong More sheet → highlight nút Thêm (luôn ĐÚNG MỘT active trên mobile)
  assert.match(APP_JS, /const MORE_SHEET_VIEWS = \['inbox', 'week', 'overview', 'year', 'calendar', 'projects'\]/);
  assert.match(APP_JS, /moreBtn\.classList\.toggle\('active', moreActive\)/);
  // CSS: thanh dùng --mobile-nav-height (64px), active chỉ 1 tab accent 10%, hover hover-only
  const shell = readRequiredAsset('css/app-shell.css');
  assert.match(shell, /:root\s*{[^}]*--mobile-nav-height:\s*64px/s);
  assert.match(shell, /\.app-mobile-nav\s*{[^}]*height:\s*calc\(var\(--mobile-nav-height\) \+ env\(safe-area-inset-bottom\)\)/s);
  assert.match(shell, /\.more-sheet-group-label\s*{[^}]*text-transform:\s*uppercase/s);
  assert.match(shell, /body \.pomo-fab-wrap \.pomo-fab\s*{[^}]*display:\s*none/s);
  assert.match(shell, /@media \(hover: hover\)/);
  assert.match(shell, /\.app-mobile-nav-item\.active\s*{[^}]*color-mix\(in srgb, var\(--color-accent\) 10%/s);
  assert.match(shell, /\.app-mobile-nav-fab\s*{[^}]*width:\s*54px[^}]*border-radius:\s*999px/s);
  assert.match(shell, /\.app-mobile-nav-add-label/);
  // drag handle bottom sheet
  assert.match(APP, /more-sheet-grip/);
  assert.match(shell, /\.more-sheet-grip/);
  // Legacy-collision fix: mobileItem KHÔNG dùng class .tab (pill-style cũ trong
  // styles.css: border-radius 999px + border 2px + surface bg) — updateNav active
  // qua [data-nav-view]. Defensive rule scoped #mobileNav (ID) thắng source order.
  assert.doesNotMatch(APP_JS, /app-mobile-nav-item tab/);
  assert.match(APP_JS, /class="app-mobile-nav-item" role="tab"/);
  assert.match(shell, /#mobileNav \.app-mobile-nav-item\s*{[^}]*border-radius:\s*14px/s);
  assert.match(shell, /#mobileNav \.app-mobile-nav-item\s*{[^}]*background:\s*transparent/s);
  assert.match(shell, /#mobileNav \.app-mobile-nav-item\.active\s*{[^}]*color-mix\(in srgb, var\(--color-accent\) 10%/s);
  // Desktop sidebar vẫn giữ .tab (không đổi)
  assert.match(APP_JS, /class="app-nav-item tab"/);
});

test('P1.2 opt#1: minify.py + .min siblings — app.html/sw.js trỏ min, source giữ readable', () => {
  // harness tồn tại + có --check
  const MIN = readRequiredAsset('scripts/minify.py');
  assert.match(MIN, /terser/);
  assert.match(MIN, /csso/);
  assert.match(MIN, /--check/);
  // app.html trỏ toàn bộ js/*.min.js + css/*.min.css (P1.2 opt#1)
  assert.match(APP, /js\/app\.min\.js\?v=206/);
  assert.match(APP, /css\/styles-critical\.min\.css\?v=\d+/);
  assert.ok(!/src="js\/[\w-]+\.js\?v=/.test(APP), 'app.html không còn trỏ js/*.js readable');
  assert.ok(!/href="css\/[\w-]+\.css\?v=/.test(APP), 'app.html không còn trỏ css/*.css readable');
  // P1.2 opt#2: critical subset trên critical path, phần còn lại deferred (media=print swap)
  assert.match(APP, /css\/styles-critical\.min\.css\?v=\d+/);
  assert.match(APP, /css\/styles-deferred\.min\.css\?v=\d+" media="print"/);
  // sw.js precache .min + CACHE bump
  assert.match(SW, /const CACHE = 'taskflow-v252';/);
  assert.ok(SW.includes("'./js/app.min.js'"), 'sw.js phải precache js/app.min.js');
  assert.ok(SW.includes("'./css/styles-deferred.min.css'"), 'sw.js phải precache css/styles-deferred.min.css');
  assert.ok(SW.includes("'./css/styles-critical.min.css'"), 'sw.js phải precache css/styles-critical.min.css');
  // source readable vẫn tồn tại (không xoá) + .min sibling nhỏ hơn
  const src = readRequiredAsset('js/app.js');
  const min = readRequiredAsset('js/app.min.js');
  assert.ok(src.length > min.length, 'app.min.js phải nhỏ hơn app.js');
  assert.ok(src.length > 100000, 'app.js readable vẫn giữ nội dung đầy đủ');
});

test('P11: account core extracted — helpers live in js/account.js, app.js keeps aliases', () => {
  // app.html loads account.js before app.js
  assert.match(APP, /src="js\/account.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const acIdx = APP.indexOf('js/account.min.js?v=');
  assert.ok(acIdx >= 0 && acIdx < appIdx, 'account.js phải load trước app.js');
  // sw.js precache account.js
  assert.ok(SW.includes("\'./js/account.min.js\'"), 'sw.js phải precache js/account.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowAccount\) throw new Error\('TaskFlowAccount missing/);
  assert.match(APP_JS, /const \{ BADGES_KEY, hasAccount, defaultYearState, emptyYearState, loadBadges, saveBadges \} = window\.TaskFlowAccount;/);
  assert.doesNotMatch(APP_JS, /^function hasAccount\(/m);
  assert.doesNotMatch(APP_JS, /^function defaultYearState\(/m);
  assert.doesNotMatch(APP_JS, /^function emptyYearState\(/m);
  assert.doesNotMatch(APP_JS, /^function loadBadges\(/m);
  assert.doesNotMatch(APP_JS, /^const BADGES_KEY = /m);
  assert.doesNotMatch(APP_JS, /^const YEAR_GOAL_DEFS = /m);
  // call-sites giữ nguyên + truyền PLAN_YEAR cho year state
  assert.match(APP_JS, /hasAccount\(\)/);
  assert.match(APP_JS, /emptyYearState\(PLAN_YEAR\)/);
  assert.match(APP_JS, /defaultYearState\(PLAN_YEAR\)/);
  // module export đủ API
  const mod = readRequiredAsset('js/account.js');
  assert.match(mod, /return \{ BADGES_KEY, YEAR_GOAL_DEFS, hasAccount, defaultYearState, emptyYearState, loadBadges, saveBadges \}/);
  assert.match(mod, /planner-token/);
  assert.match(mod, /planner-badges/);
  assert.match(mod, /YEAR_GOAL_DEFS = \[/);
});

test('P11: habit day helpers extracted — habitDaysElapsed/dayAggregate/heatLevel live in js/habits.js', () => {
  // app.html loads habits.js before app.js
  assert.match(APP, /src="js\/habits.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const hbIdx = APP.indexOf('js/habits.min.js?v=');
  assert.ok(hbIdx >= 0 && hbIdx < appIdx, 'habits.js phải load trước app.js');
  // sw.js precache habits.js
  assert.ok(SW.includes("\'./js/habits.min.js\'"), 'sw.js phải precache js/habits.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowHabits\) throw new Error\('TaskFlowHabits missing/);
  assert.match(APP_JS, /const \{ habitDaysElapsed, dayAggregate, heatLevel \} = window\.TaskFlowHabits;/);
  assert.match(APP_JS, /normalizeSchedule\(h\.schedule\)/); // V1.4 habit schedules
  assert.doesNotMatch(APP_JS, /^function habitDaysElapsed\(/m);
  assert.doesNotMatch(APP_JS, /^function dayAggregate\(/m);
  assert.doesNotMatch(APP_JS, /^function heatLevel\(/m);
  // habitDaysElapsed(PLAN_YEAR, PLAN_MONTH, NUM_DAYS) — caller duy nhất habitPct đã sang js/xp.js
  assert.match(readRequiredAsset('js/xp.js'), /habitDaysElapsed\(PLAN_YEAR, PLAN_MONTH, NUM_DAYS\)/);
  assert.match(APP_JS, /dayAggregate\(state, d\)/);
  assert.doesNotMatch(APP_JS, /dayAggregate\(d\)/);
  assert.match(APP_JS, /heatLevel\(pct\)/);
  // module export đủ API
  const mod = readRequiredAsset('js/habits.js');
  assert.match(mod, /return \{ habitDaysElapsed, dayAggregate, heatLevel, normalizeSchedule, scheduleOf, weekday1, mondayOf, dueDayIndexes, isDueToday, periodProgress, consistencyPct, runInfo, scheduleSummary \}/);
  assert.match(mod, /root\.TaskFlowHabits = api/);
});

test('P11: date key generators extracted — pomoDateKey/moodDateKey live in js/keys.js', () => {
  // app.html loads keys.js before app.js
  assert.match(APP, /src="js\/keys.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const kIdx = APP.indexOf('js/keys.min.js?v=');
  assert.ok(kIdx >= 0 && kIdx < appIdx, 'keys.js phải load trước app.js');
  // sw.js precache keys.js
  assert.ok(SW.includes("\'./js/keys.min.js\'"), 'sw.js phải precache js/keys.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowKeys\) throw new Error\('TaskFlowKeys missing/);
  assert.match(APP_JS, /const \{ pomoDateKey, moodDateKey \} = window\.TaskFlowKeys;/);
  assert.doesNotMatch(APP_JS, /^function moodDateKey\(/m);
  assert.doesNotMatch(APP_JS, /^function pomoDateKey\(/m);
  // call-sites giữ nguyên: day-view dùng moodDateKey(d.date, PLAN_YEAR, PLAN_MONTH),
  // pomoDateKey giữ signature. Các call-site (d, ...) và (d + 1, ...) thuộc moodCardHTML
  // đã sang js/mood.js (P11 extraction 24) — kiểm tra ở module.
  assert.match(APP_JS, /moodDateKey\(d\.date, PLAN_YEAR, PLAN_MONTH\)/);
  assert.match(APP_JS, /pomoDateKey\(new Date\(\)\)/);
  assert.doesNotMatch(APP_JS, /moodDateKey\(d\)/);
  const momod2 = readRequiredAsset('js/mood.js');
  assert.match(momod2, /moodDateKey\(d, PLAN_YEAR, PLAN_MONTH\)/);
  assert.match(momod2, /moodDateKey\(d \+ 1, PLAN_YEAR, PLAN_MONTH\)/);
  // module export đủ API
  const mod = readRequiredAsset('js/keys.js');
  assert.match(mod, /return \{ pomoDateKey, moodDateKey \}/);
  assert.match(mod, /padStart\(2, '0'\)/);
});

test('P11: reminder helpers extracted — remind core lives in js/remind.js', () => {
  // app.html loads remind.js before app.js
  assert.match(APP, /src="js\/remind.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const rmIdx = APP.indexOf('js/remind.min.js?v=');
  assert.ok(rmIdx >= 0 && rmIdx < appIdx, 'remind.js phải load trước app.js');
  // sw.js precache remind.js
  assert.ok(SW.includes("\'./js/remind.min.js\'"), 'sw.js phải precache js/remind.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowRemind\) throw new Error\('TaskFlowRemind missing/);
  assert.match(APP_JS, /const \{ getRemindTime, setRemindTime, requestRemindPermission, registerPeriodicReminder \} = window\.TaskFlowRemind;/);
  assert.doesNotMatch(APP_JS, /^function getRemindTime\(/m);
  assert.doesNotMatch(APP_JS, /^function setRemindTime\(/m);
  assert.doesNotMatch(APP_JS, /^function requestRemindPermission\(/m);
  assert.doesNotMatch(APP_JS, /^function registerPeriodicReminder\(/m);
  // call-sites giữ nguyên: getRemindTime()/setRemindTime(v)/registerPeriodicReminder() + top-level boot call
  assert.match(APP_JS, /if \(getRemindTime\(\)\) registerPeriodicReminder\(\);/);
  assert.match(APP_JS, /setRemindTime\(time\)/);
  // module export đủ API
  const mod = readRequiredAsset('js/remind.js');
  assert.match(mod, /return \{ getRemindTime, setRemindTime, requestRemindPermission, registerPeriodicReminder \}/);
  assert.match(mod, /planner-remind/);
  assert.match(mod, /periodic-background-sync/);
});

test('P11: dark mode helpers extracted — theme core lives in js/theme.js', () => {
  // app.html loads theme.js before app.js
  assert.match(APP, /src="js\/theme.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const thIdx = APP.indexOf('js/theme.min.js?v=');
  assert.ok(thIdx >= 0 && thIdx < appIdx, 'theme.js phải load trước app.js');
  // sw.js precache theme.js
  assert.ok(SW.includes("\'./js/theme.min.js\'"), 'sw.js phải precache js/theme.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowTheme\) throw new Error\('TaskFlowTheme missing/);
  assert.match(APP_JS, /const \{ systemPrefersDark, darkIsOn, applyDark, toggleDark \} = window\.TaskFlowTheme;/);
  assert.doesNotMatch(APP_JS, /^function systemPrefersDark\(/m);
  assert.doesNotMatch(APP_JS, /^function darkIsOn\(/m);
  assert.doesNotMatch(APP_JS, /^function applyDark\(/m);
  assert.doesNotMatch(APP_JS, /^function toggleDark\(/m);
  // prefersReducedMotion chuyển sang js/widget.js (extraction 31) — call-sites giữ nguyên
  assert.doesNotMatch(APP_JS, /^function prefersReducedMotion\(/m);
  assert.match(readRequiredAsset('js/widget.js'), /function prefersReducedMotion/);
  // call-sites giữ nguyên: darkIsOn/applyDark/toggleDark nhận DARK tham số
  assert.match(APP_JS, /DARK = toggleDark\(DARK\)/);
  assert.match(APP_JS, /applyDark\(DARK\)/);
  assert.match(APP_JS, /if \(DARK === null\) applyDark\(DARK\)/);
  // module export đủ API
  const mod = readRequiredAsset('js/theme.js');
  assert.match(mod, /return \{ systemPrefersDark, darkIsOn, applyDark, toggleDark \}/);
  assert.match(mod, /planner-dark/);
});

test('P11: widget config + bootstrap glue extracted — R4/R5 live in js/widget.js', () => {
  // app.html loads widget.js before app.js
  assert.match(APP, /src="js\/widget\.min\.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const wIdx = APP.indexOf('js/widget.min.js?v=');
  assert.ok(wIdx >= 0 && wIdx < appIdx, 'widget.js phải load trước app.js');
  // sw.js precache widget.js
  assert.ok(SW.includes("\'./js/widget.min.js\'"), 'sw.js phải precache js/widget.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowWidget\) throw new Error\('TaskFlowWidget missing/);
  assert.match(APP_JS, /const \{ widgetConfigKey, initWidgetConfig, saveWidgetConfig, getVisibleWidgets, setLang, setTheme, prefersReducedMotion, registerSW \} = window\.TaskFlowWidget;/);
  assert.doesNotMatch(APP_JS, /^function widgetConfigKey\(/m);
  assert.doesNotMatch(APP_JS, /^function initWidgetConfig\(/m);
  assert.doesNotMatch(APP_JS, /^function saveWidgetConfig\(/m);
  assert.doesNotMatch(APP_JS, /^function getVisibleWidgets\(/m);
  assert.doesNotMatch(APP_JS, /^function setLang\(/m);
  assert.doesNotMatch(APP_JS, /^function setTheme\(/m);
  assert.doesNotMatch(APP_JS, /^function prefersReducedMotion\(/m);
  assert.doesNotMatch(APP_JS, /^function registerSW\(/m);
  // THEME/THEMES/WIDGET_DEFS_* vẫn ở app.js (deps của module, resolve qua global lexical)
  assert.match(APP_JS, /let THEME = 'cream';/);
  assert.match(APP_JS, /const THEMES = \['cream', 'mint', 'lavender', 'peach'\];/);
  assert.match(APP_JS, /const WIDGET_DEFS_OVERVIEW/);
  assert.match(APP_JS, /const WIDGET_DEFS_YEAR/);
  // module export đủ API
  const mod = readRequiredAsset('js/widget.js');
  assert.match(mod, /return \{ widgetConfigKey, initWidgetConfig, saveWidgetConfig, getVisibleWidgets, setLang, setTheme, prefersReducedMotion, registerSW \}/);
});

test('P11: XP + render helpers extracted — R11 lives in js/xp.js', () => {
  // app.html loads xp.js before app.js
  assert.match(APP, /src="js\/xp\.min\.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const xIdx = APP.indexOf('js/xp.min.js?v=');
  assert.ok(xIdx >= 0 && xIdx < appIdx, 'xp.js phải load trước app.js');
  // sw.js precache xp.js
  assert.ok(SW.includes("\'./js/xp.min.js\'"), 'sw.js phải precache js/xp.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowXP\) throw new Error\('TaskFlowXP missing/);
  assert.match(APP_JS, /const \{ loadXP, saveXP, xpLevelInfo, addXP, removeXP, renderXP, habitPct, dayPct, donutSVG, checkboxHTML \} = window\.TaskFlowXP;/);
  assert.doesNotMatch(APP_JS, /^function loadXP\(/m);
  assert.doesNotMatch(APP_JS, /^function saveXP\(/m);
  assert.doesNotMatch(APP_JS, /^function xpLevelInfo\(/m);
  assert.doesNotMatch(APP_JS, /^function addXP\(/m);
  assert.doesNotMatch(APP_JS, /^function removeXP\(/m);
  assert.doesNotMatch(APP_JS, /^function renderXP\(/m);
  assert.doesNotMatch(APP_JS, /^function habitPct\(/m);
  assert.doesNotMatch(APP_JS, /^function dayPct\(/m);
  assert.doesNotMatch(APP_JS, /^function donutSVG\(/m);
  assert.doesNotMatch(APP_JS, /^function checkboxHTML\(/m);
  // xpTotal là state riêng của module, không còn global trong app.js
  assert.doesNotMatch(APP_JS, /let xpTotal = 0;/);
  // module export đủ API
  const mod = readRequiredAsset('js/xp.js');
  assert.match(mod, /return \{ loadXP, saveXP, xpLevelInfo, addXP, removeXP, renderXP, habitPct, dayPct, donutSVG, checkboxHTML \}/);
});

test('P11: streak/heatmap UI extracted — R14 lives in js/streak-ui.js', () => {
  // app.html loads streak-ui.js before app.js
  assert.match(APP, /src="js\/streak-ui\.min\.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const sIdx = APP.indexOf('js/streak-ui.min.js?v=');
  assert.ok(sIdx >= 0 && sIdx < appIdx, 'streak-ui.js phải load trước app.js');
  // sw.js precache streak-ui.js
  assert.ok(SW.includes("\'./js/streak-ui.min.js\'"), 'sw.js phải precache js/streak-ui.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowStreakUI\) throw new Error\('TaskFlowStreakUI missing/);
  assert.match(APP_JS, /const \{ weekHabitPct, weekCompareHTML, dayAggregateAt, heatHeroHTML, heatRibbonHTML, habitMiniHTML, habitHeatCardHTML, shareTopInfo, canvasCircle, streakCardBlob, doShareStreak \} = window\.TaskFlowStreakUI;/);
  assert.doesNotMatch(APP_JS, /^function weekHabitPct\(/m);
  assert.doesNotMatch(APP_JS, /^function weekCompareHTML\(/m);
  assert.doesNotMatch(APP_JS, /^function dayAggregateAt\(/m);
  assert.doesNotMatch(APP_JS, /^function heatHeroHTML\(/m);
  assert.doesNotMatch(APP_JS, /^function heatRibbonHTML\(/m);
  assert.doesNotMatch(APP_JS, /^function habitMiniHTML\(/m);
  assert.doesNotMatch(APP_JS, /^function habitHeatCardHTML\(/m);
  assert.doesNotMatch(APP_JS, /^function shareTopInfo\(/m);
  assert.doesNotMatch(APP_JS, /^function canvasCircle\(/m);
  assert.doesNotMatch(APP_JS, /^function streakCardBlob\(/m);
  assert.doesNotMatch(APP_JS, /^function doShareStreak\(/m);
  // call-sites giữ nguyên: widget def streak-heatmap, share-streak dispatcher, ribbon refresh
  assert.match(APP_JS, /'streak-heatmap'/);
  assert.match(APP_JS, /act === 'share-streak'/);
  assert.match(APP_JS, /wcEl\.outerHTML = weekCompareHTML\(\)/);
  // module export đủ API
  const mod = readRequiredAsset('js/streak-ui.js');
  assert.match(mod, /return \{ weekHabitPct, weekCompareHTML, dayAggregateAt, heatHeroHTML, heatRibbonHTML, habitMiniHTML, habitHeatCardHTML, shareTopInfo, canvasCircle, streakCardBlob, doShareStreak \}/);
});

test('P11: Today Dashboard extracted — R19 lives in js/today.js', () => {
  // app.html loads today.js before app.js
  assert.match(APP, /src="js\/today\.min\.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const tIdx = APP.indexOf('js/today.min.js?v=');
  assert.ok(tIdx >= 0 && tIdx < appIdx, 'today.js phải load trước app.js');
  // sw.js precache today.js
  assert.ok(SW.includes("\'./js/today.min.js\'"), 'sw.js phải precache js/today.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowToday\) throw new Error\('TaskFlowToday missing/);
  assert.match(APP_JS, /const \{ todayGreeting, todayWeekdayLabel, renderToday, totalFocusMinutesToday, taskRowHTML \} = window\.TaskFlowToday;/);
  assert.doesNotMatch(APP_JS, /^function todayGreeting\(/m);
  assert.doesNotMatch(APP_JS, /^function todayWeekdayLabel\(/m);
  assert.doesNotMatch(APP_JS, /^function renderToday\(/m);
  assert.doesNotMatch(APP_JS, /^function totalFocusMinutesToday\(/m);
  assert.doesNotMatch(APP_JS, /^function taskRowHTML\(/m);
  // call-sites giữ nguyên: setView/setLang/refresh paths + renderWeek dùng taskRowHTML
  assert.match(APP_JS, /if \(state\.view === 'today'\) renderToday\(\);/);
  assert.match(APP_JS, /taskRowHTML\(w\.n, di, ti, 'pink', t, i\)/);
  assert.match(APP_JS, /taskRowHTML\(w\.n, di, ti, 'blue', t, i\)/);
  // module export đủ API
  const mod = readRequiredAsset('js/today.js');
  assert.match(mod, /return \{ todayGreeting, todayWeekdayLabel, renderToday, totalFocusMinutesToday, taskRowHTML \}/);
});

test('P11: month/week report UI extracted — R15 lives in js/report-ui.js', () => {
  // app.html loads report-ui.js before app.js
  assert.match(APP, /src="js\/report-ui\.min\.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const rIdx = APP.indexOf('js/report-ui.min.js?v=');
  assert.ok(rIdx >= 0 && rIdx < appIdx, 'report-ui.js phải load trước app.js');
  // sw.js precache report-ui.js
  assert.ok(SW.includes("\'./js/report-ui.min.js\'"), 'sw.js phải precache js/report-ui.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowReportUI\) throw new Error\('TaskFlowReportUI missing/);
  assert.match(APP_JS, /const \{ monthlyReportData, renderReportModal, openReportModal, closeReportModal, reportCardBlob, doShareReport, weeklyReportData, lastWeekReportData, vsCell, focusReportBars, renderWeekReportModal, openWeekReportModal, closeWeekReportModal, weekReportCardBlob, doShareWeekReport \} = window\.TaskFlowReportUI;/);
  assert.doesNotMatch(APP_JS, /^function monthlyReportData\(/m);
  assert.doesNotMatch(APP_JS, /^function renderReportModal\(/m);
  assert.doesNotMatch(APP_JS, /^function openReportModal\(/m);
  assert.doesNotMatch(APP_JS, /^function closeReportModal\(/m);
  assert.doesNotMatch(APP_JS, /^function reportCardBlob\(/m);
  assert.doesNotMatch(APP_JS, /^function doShareReport\(/m);
  assert.doesNotMatch(APP_JS, /^function weeklyReportData\(/m);
  assert.doesNotMatch(APP_JS, /^function lastWeekReportData\(/m);
  assert.doesNotMatch(APP_JS, /^function vsCell\(/m);
  assert.doesNotMatch(APP_JS, /^function focusReportBars\(/m);
  assert.doesNotMatch(APP_JS, /^function renderWeekReportModal\(/m);
  assert.doesNotMatch(APP_JS, /^function openWeekReportModal\(/m);
  assert.doesNotMatch(APP_JS, /^function closeWeekReportModal\(/m);
  assert.doesNotMatch(APP_JS, /^function weekReportCardBlob\(/m);
  assert.doesNotMatch(APP_JS, /^function doShareWeekReport\(/m);
  // call-sites giữ nguyên: dispatcher open/close/share + outside-click đóng modal
  assert.match(APP_JS, /openReportModal\(\)/);
  assert.match(APP_JS, /closeReportModal\(\)/);
  assert.match(APP_JS, /openWeekReportModal\(\)/);
  assert.match(APP_JS, /closeWeekReportModal\(\)/);
  // year-report.js (lazy, P1.5) gọi focusReportBars qua global lexical
  assert.match(readRequiredAsset('js/year-report.js'), /focusReportBars\(r\.focusByMonth/);
  // module export đủ API
  const mod = readRequiredAsset('js/report-ui.js');
  assert.match(mod, /return \{ monthlyReportData, renderReportModal, openReportModal, closeReportModal, reportCardBlob, doShareReport, weeklyReportData, lastWeekReportData, vsCell, focusReportBars, renderWeekReportModal, openWeekReportModal, closeWeekReportModal, weekReportCardBlob, doShareWeekReport \}/);
});

test('P3: Upcoming header density — summary counts derive from existing task data only', () => {
  const up = readRequiredAsset('js/upcoming.js');
  const I18N = readRequiredAsset('js/i18n.js');
  const STYLES = readRequiredAsset('css/styles.css');
  assert.match(up, /function upcomingSummaryCounts\(\)/);
  assert.match(up, /up-summary-chip/);
  assert.match(up, /upcomingSummaryAria/);
  assert.match(I18N, /upcomingSummaryAria: '/);
  assert.match(STYLES, /\.up-summary\s*\{/);
});

test('P11: Upcoming view extracted — R25 lives in js/upcoming.js', () => {
  // app.html loads upcoming.js before app.js
  assert.match(APP, /src="js\/upcoming\.min\.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const uIdx = APP.indexOf('js/upcoming.min.js?v=');
  assert.ok(uIdx >= 0 && uIdx < appIdx, 'upcoming.js phải load trước app.js');
  // sw.js precache upcoming.js
  assert.ok(SW.includes("\'./js/upcoming.min.js\'"), 'sw.js phải precache js/upcoming.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowUpcoming\) throw new Error\('TaskFlowUpcoming missing/);
  assert.match(APP_JS, /const \{ setUpcomingRange, tasksForDate, upcomingOverdueTasks, upcomingCollect, upcomingDayHeader, upcomingTaskMeta, upcomingTaskRowHTML, renderUpcoming, pushTaskToDate, toggleOverdueExpanded \} = window\.TaskFlowUpcoming;/);
  assert.doesNotMatch(APP_JS, /^function setUpcomingRange\(/m);
  assert.doesNotMatch(APP_JS, /^function tasksForDate\(/m);
  assert.doesNotMatch(APP_JS, /^function upcomingOverdueTasks\(/m);
  assert.doesNotMatch(APP_JS, /^function upcomingCollect\(/m);
  assert.doesNotMatch(APP_JS, /^function upcomingDayHeader\(/m);
  assert.doesNotMatch(APP_JS, /^function upcomingTaskMeta\(/m);
  assert.doesNotMatch(APP_JS, /^function upcomingTaskRowHTML\(/m);
  assert.doesNotMatch(APP_JS, /^function renderUpcoming\(/m);
  assert.doesNotMatch(APP_JS, /^function pushTaskToDate\(/m);
  // call-sites giữ nguyên: setView/refresh renderUpcoming + dispatcher upcoming-range
  assert.match(APP_JS, /view === 'upcoming'/);
  assert.match(APP_JS, /act === 'upcoming-range'/);
  // inbox.js + quick-add.js gọi pushTaskToDate qua global lexical (alias giữ)
  assert.match(readRequiredAsset('js/inbox.js'), /pushTaskToDate\(moved, dt\)/);
  assert.match(readRequiredAsset('js/quick-add.js'), /pushTaskToDate\(tk, dt\)/);
  // module export đủ API
  const mod = readRequiredAsset('js/upcoming.js');
  assert.match(mod, /return \{ setUpcomingRange, tasksForDate, upcomingOverdueTasks, upcomingCollect, upcomingDayHeader, upcomingTaskMeta, upcomingTaskRowHTML, renderUpcoming, pushTaskToDate, toggleOverdueExpanded, OVERDUE_LIMIT \}/);
});

test('P11: focus stats extracted — pomo/focus helpers live in js/focus-stats.js', () => {
  // app.html loads focus-stats.js before app.js
  assert.match(APP, /src="js\/focus-stats\.min\.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const fIdx = APP.indexOf('js/focus-stats.min.js?v=');
  assert.ok(fIdx >= 0 && fIdx < appIdx, 'focus-stats.js phải load trước app.js');
  // sw.js precache focus-stats.js
  assert.ok(SW.includes("'./js/focus-stats.min.js'"), 'sw.js phải precache js/focus-stats.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowFocusStats\) throw new Error\('TaskFlowFocusStats missing/);
  assert.match(APP_JS, /const \{ pomoDaySecs, focusWeekMinutes, focusMonthMinutes, topFocusTasksInWeek, topFocusTasksInMonth, taskFocusMinLabel \} = window\.TaskFlowFocusStats;/);
  assert.doesNotMatch(APP_JS, /^function pomoDaySecs\(/m);
  assert.doesNotMatch(APP_JS, /^function focusWeekMinutes\(/m);
  assert.doesNotMatch(APP_JS, /^function focusMonthMinutes\(\)/m);
  assert.doesNotMatch(APP_JS, /^function topFocusTasksInWeek\(/m);
  assert.doesNotMatch(APP_JS, /^function topFocusTasksInMonth\(/m);
  assert.doesNotMatch(APP_JS, /^function taskFocusMinLabel\(/m);
  assert.doesNotMatch(APP_JS, /^function taskFocusSecsInRange\(/m);
  // call-sites giữ nguyên trong app.js + resolve qua global lexical từ report-ui/year-report
  assert.match(APP_JS, /focusWeekMinutes\(\)/);
  assert.match(APP_JS, /topFocusTasksInWeek\(w, 3\)/);
  assert.match(APP_JS, /taskFocusMinLabel\(x\.secs\)/);
  assert.match(readRequiredAsset('js/report-ui.js'), /focusMonthMinutes\(\)/);
  assert.match(readRequiredAsset('js/report-ui.js'), /focusWeekMinutes\(w\.n\)/);
  assert.match(readRequiredAsset('js/report-ui.js'), /topFocusTasksInMonth\(1\)/);
  assert.match(readRequiredAsset('js/year-report.js'), /taskFocusMinLabel\(r\.topTask\.secs\)/);
  // module export đủ API (taskFocusSecsInRange là helper riêng — không export)
  const mod = readRequiredAsset('js/focus-stats.js');
  assert.match(mod, /return \{ pomoDaySecs, focusWeekMinutes, focusMonthMinutes, topFocusTasksInWeek, topFocusTasksInMonth, taskFocusMinLabel \}/);
});

test('P11: focus mode extracted — overlay + timer state machine live in js/focus.js', () => {
  // app.html loads focus.js before app.js
  assert.match(APP, /src="js\/focus\.min\.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const fIdx = APP.indexOf('js/focus.min.js?v=');
  assert.ok(fIdx >= 0 && fIdx < appIdx, 'focus.js phải load trước app.js');
  // sw.js precache focus.js
  assert.ok(SW.includes("'./js/focus.min.js'"), 'sw.js phải precache js/focus.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowFocus\) throw new Error\('TaskFlowFocus missing/);
  assert.match(APP_JS, /const \{ openFocusMode, closeFocusMode, focusTimerStart, focusTimerReset, focusTimerSetDur, refreshFocusIfOpen, taskFocusLog, taskFocusSecs \} = window\.TaskFlowFocus;/);
  assert.doesNotMatch(APP_JS, /^function openFocusMode\(/m);
  assert.doesNotMatch(APP_JS, /^function closeFocusMode\(/m);
  assert.doesNotMatch(APP_JS, /^function focusTimerStart\(/m);
  assert.doesNotMatch(APP_JS, /^function focusTimerReset\(/m);
  assert.doesNotMatch(APP_JS, /^function focusTimerSetDur\(/m);
  assert.doesNotMatch(APP_JS, /^function focusTimerComplete\(/m);
  assert.doesNotMatch(APP_JS, /^function focusTimerRender\(/m);
  assert.doesNotMatch(APP_JS, /^function refreshFocusIfOpen\(/m);
  assert.doesNotMatch(APP_JS, /^function taskFocusLog\(/m);
  assert.doesNotMatch(APP_JS, /^function taskFocusSecs\(/m);
  assert.doesNotMatch(APP_JS, /^function fmtSessionDate\(/m);
  assert.doesNotMatch(APP_JS, /^function getTaskByUid\(/m);
  // call-sites giữ nguyên: dispatcher focus/focus-close/focus-task/focus-timer-* + outside-click
  assert.match(APP_JS, /act === 'focus'/);
  assert.match(APP_JS, /act === 'focus-close'/);
  assert.match(APP_JS, /act === 'focus-timer-start'/);
  assert.match(APP_JS, /act === 'focus-timer-set'/);
  assert.match(APP_JS, /openFocusMode\(el\.dataset\.scope === 'inbox'/);
  // render path + module chéo resolve qua global lexical
  assert.match(APP_JS, /taskFocusSecs\(tk\)/);
  assert.match(readRequiredAsset('js/today.js'), /taskFocusSecs\(task\)/);
  assert.match(readRequiredAsset('js/focus-stats.js'), /taskFocusLog\(tk\)/);
  // module export đủ API (focusTaskRef/focusTimer là state riêng — không export)
  const mod = readRequiredAsset('js/focus.js');
  assert.match(mod, /return \{\s*openFocusMode, closeFocusMode, focusTimerStart, focusTimerReset, focusTimerSetDur,\s*refreshFocusIfOpen, taskFocusLog, taskFocusSecs,/);
  assert.match(mod, /let focusTimer = \{ running: false, dur: 25 \* 60/);
  assert.match(mod, /function focusTimerComplete\(\)/);
});

test('P11: pomodoro timer extracted — pomo state machine lives in js/pomo.js', () => {
  // app.html loads pomo.js before app.js
  assert.match(APP, /src="js\/pomo\.min\.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const pIdx = APP.indexOf('js/pomo.min.js?v=');
  assert.ok(pIdx >= 0 && pIdx < appIdx, 'pomo.js phải load trước app.js');
  // sw.js precache pomo.js
  assert.ok(SW.includes("'./js/pomo.min.js'"), 'sw.js phải precache js/pomo.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowPomo\) throw new Error\('TaskFlowPomo missing/);
  assert.match(APP_JS, /const \{ renderPomo, pomoSync, pomoStart, pomoReset, pomoSetMode, togglePomoPanel, pomoAddSession, pomoWeekSecs \} = window\.TaskFlowPomo;/);
  assert.doesNotMatch(APP_JS, /^function renderPomo\(/m);
  assert.doesNotMatch(APP_JS, /^function pomoSync\(/m);
  assert.doesNotMatch(APP_JS, /^function pomoStart\(/m);
  assert.doesNotMatch(APP_JS, /^function pomoReset\(/m);
  assert.doesNotMatch(APP_JS, /^function pomoSetMode\(/m);
  assert.doesNotMatch(APP_JS, /^function togglePomoPanel\(/m);
  assert.doesNotMatch(APP_JS, /^function pomoAddSession\(/m);
  assert.doesNotMatch(APP_JS, /^function pomoWeekSecs\(/m);
  assert.doesNotMatch(APP_JS, /^function pomoDuration\(/m);
  assert.doesNotMatch(APP_JS, /^function pomoComplete\(/m);
  // call-sites giữ nguyên: week render, dispatcher pomo-*, visibilitychange/focus
  assert.match(APP_JS, /renderPomo\(\)/);
  assert.match(APP_JS, /act === 'pomo-toggle'/);
  assert.match(APP_JS, /act === 'pomo-start'/);
  assert.match(APP_JS, /pomoSync\(\)/);
  // markup widget tuần view vẫn ở app.js (renderWeek), renderPomoWidgetStats/…TomatoCounter vẫn ở app.js
  assert.match(APP_JS, /pomo-widget/);
  assert.match(APP_JS, /function renderPomoWidgetStats\(/);
  assert.match(APP_JS, /function renderPomoTomatoCounter\(/);
  // focus.js (extraction 39) gọi pomoAddSession qua global lexical
  assert.match(readRequiredAsset('js/focus.js'), /pomoAddSession\(secs\)/);
  // module export đủ API (POMO_* + pomo/pomoEndAt là state riêng — không export)
  const mod = readRequiredAsset('js/pomo.js');
  assert.match(mod, /return \{\s*renderPomo, pomoSync, pomoStart, pomoReset, pomoSetMode, togglePomoPanel,\s*pomoAddSession, pomoWeekSecs,/);
  assert.match(mod, /let pomo = \{ mode: 'work', left: POMO_WORK/);
  assert.match(mod, /function pomoComplete\(\)/);
});

test('P11: analytics helpers extracted — GA4 core lives in js/analytics.js', () => {
  // app.html loads analytics.js before app.js
  assert.match(APP, /src="js\/analytics.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const anIdx = APP.indexOf('js/analytics.min.js?v=');
  assert.ok(anIdx >= 0 && anIdx < appIdx, 'analytics.js phải load trước app.js');
  // sw.js precache analytics.js
  assert.ok(SW.includes("\'./js/analytics.min.js\'"), 'sw.js phải precache js/analytics.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowAnalytics\) throw new Error\('TaskFlowAnalytics missing/);
  assert.match(APP_JS, /const \{ GA4_ID, GA4_ENABLED, initAnalytics, trackEvent \} = window\.TaskFlowAnalytics;/);
  assert.doesNotMatch(APP_JS, /^const GA4_ID = /m);
  assert.doesNotMatch(APP_JS, /^function initAnalytics\(/m);
  assert.doesNotMatch(APP_JS, /^function trackEvent\(/m);
  // call-sites giữ nguyên: trackEvent(...) khắp app.js + boot initAnalytics();
  // trackEvent('share_year_report') thuộc doShareYearReport đã sang js/year-report.js;
  // trackEvent('demo_data') thuộc demoPlan đã sang js/popups.js (extraction 28)
  assert.match(readRequiredAsset('js/popups.js'), /trackEvent\('demo_data'\)/);
  assert.match(APP_JS, /trackEvent\('import_csv'\)/);
  assert.match(APP_JS, /initAnalytics\(\)/);
  assert.match(readRequiredAsset('js/year-report.js'), /trackEvent\('share_year_report'/);
  // module export đủ API + GA4 placeholder tự tắt
  const mod = readRequiredAsset('js/analytics.js');
  assert.match(mod, /return \{ GA4_ID, GA4_ENABLED, initAnalytics, trackEvent \}/);
  assert.match(mod, /GA4_ENABLED = !!\(GA4_ID && !GA4_ID\.startsWith\('G-XXXX'\)\)/);
  assert.match(mod, /googletagmanager\.com\/gtag\/js\?id=/);
});

test('P11: export helpers extracted — downloadFile/collectAllData/exportJSON live in js/export.js', () => {
  // app.html loads export.js before app.js
  assert.match(APP, /src="js\/export.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const exIdx = APP.indexOf('js/export.min.js?v=');
  assert.ok(exIdx >= 0 && exIdx < appIdx, 'export.js phải load trước app.js');
  // sw.js precache export.js
  assert.ok(SW.includes("\'./js/export.min.js\'"), 'sw.js phải precache js/export.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowExport\) throw new Error\('TaskFlowExport missing/);
  assert.match(APP_JS, /const \{ downloadFile, collectAllData, prepareImport, applySnapshotTransactional, exportJSON, exportCSV, exportICS \} = window\.TaskFlowExport;/);
  assert.doesNotMatch(APP_JS, /^function collectAllData\(/m);
  assert.doesNotMatch(APP_JS, /^function downloadFile\(/m);
  assert.doesNotMatch(APP_JS, /^function exportJSON\(/m);
  assert.doesNotMatch(APP_JS, /^function exportCSV\(/m);
  assert.doesNotMatch(APP_JS, /^function exportICS\(/m);
  assert.doesNotMatch(APP_JS, /^function legacyCSVRows\(/m);
  assert.doesNotMatch(APP_JS, /^function csvRow\(/m);
  // call-sites giữ nguyên: collectAllData(LEGACY_KEY)/exportJSON(LEGACY_KEY), downloadFile giữ signature.
  // backup giờ lazy qua js/backup.js — snapshot lấy đồng bộ trước khi ghi đè (fail-safe save path).
  assert.match(APP_JS, /importSnapshot = collectAllData\(LEGACY_KEY\)/);
  assert.match(APP_JS, /window\.TaskFlowBackup\.rotateBackup\(importSnapshot\)/);
  assert.match(APP_JS, /exportJSON\(LEGACY_KEY\)/);
  assert.doesNotMatch(APP_JS, /collectAllData\(\)/);
  assert.doesNotMatch(APP_JS, /exportJSON\(\)/);
  // exportCSV/legacyCSVRows/csvRow/ics* giờ nằm trong js/export.js (R8 extraction 30)
  const mod = readRequiredAsset('js/export.js');
  assert.match(mod, /function exportCSV\(/);
  assert.match(mod, /function legacyCSVRows\(/);
  assert.match(mod, /function csvRow\(/);
  assert.match(mod, /function icsEscape\(/);
  assert.match(mod, /function icsDayFromDay\(/);
  // module export đủ API + trackEvent qua TaskFlowAnalytics
  assert.match(mod, /return \{ downloadFile, collectAllData, prepareImport, applySnapshotTransactional, exportJSON, exportCSV, exportICS \}/);
  assert.match(mod, /TaskFlowAnalytics/);
});

test('P11: habit streak helpers extracted — streak core lives in js/streak.js', () => {
  // app.html loads streak.js before app.js
  assert.match(APP, /src="js\/streak.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const stIdx = APP.indexOf('js/streak.min.js?v=');
  assert.ok(stIdx >= 0 && stIdx < appIdx, 'streak.js phải load trước app.js');
  // sw.js precache streak.js
  assert.ok(SW.includes("\'./js/streak.min.js\'"), 'sw.js phải precache js/streak.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowStreak\) throw new Error\('TaskFlowStreak missing/);
  assert.match(APP_JS, /const \{ habitInMonthState, habitDaysAt, streakAnchorDay, habitTimeline, habitStreakOf, habitStreakCached, clearStreakCache \} = window\.TaskFlowStreak;/);
  assert.doesNotMatch(APP_JS, /^function habitInMonthState\(/m);
  assert.doesNotMatch(APP_JS, /^function habitDaysAt\(/m);
  assert.doesNotMatch(APP_JS, /^function streakAnchorDay\(/m);
  assert.doesNotMatch(APP_JS, /^function habitTimeline\(/m);
  assert.doesNotMatch(APP_JS, /^function habitStreakOf\(/m);
  assert.doesNotMatch(APP_JS, /^function habitStreakCached\(/m);
  assert.doesNotMatch(APP_JS, /^function clearStreakCache\(/m);
  // phase9:1369 vẫn match — alias chứa chuỗi habitStreakCached
  assert.match(APP_JS, /habitStreakCached/);
  // call-sites giữ nguyên: nhận PLAN_YEAR/PLAN_MONTH/NUM_DAYS tham số
  assert.match(APP_JS, /habitStreakCached\(h, PLAN_YEAR, PLAN_MONTH, NUM_DAYS\)/);
  assert.match(APP_JS, /habitStreakCached\(habit, PLAN_YEAR, PLAN_MONTH, NUM_DAYS\)/);
  // callers streakAnchorDay(PLAN_YEAR,...)/habitDaysAt(y, m, h,...) đã sang js/streak-ui.js
  assert.match(readRequiredAsset('js/streak-ui.js'), /streakAnchorDay\(PLAN_YEAR, PLAN_MONTH, NUM_DAYS\)/);
  assert.match(readRequiredAsset('js/streak-ui.js'), /habitDaysAt\(y, m, h, PLAN_YEAR, PLAN_MONTH\)/);
  assert.doesNotMatch(APP_JS, /streakAnchorDay\(\)/);
  // module export đủ API + hmStreakCache nội bộ
  const mod = readRequiredAsset('js/streak.js');
  assert.match(mod, /return \{ habitInMonthState, habitDaysAt, streakAnchorDay, habitTimeline, habitStreakOf, habitStreakCached, clearStreakCache \}/);
  assert.match(mod, /let hmStreakCache = new Map\(\);/);
  assert.match(mod, /TaskFlowStorage/);
});

test('P11: month goal helpers extracted — monthPctOf/monthGoalsOf live in js/goals.js', () => {
  // app.html loads goals.js before app.js
  assert.match(APP, /src="js\/goals.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const gIdx = APP.indexOf('js/goals.min.js?v=');
  assert.ok(gIdx >= 0 && gIdx < appIdx, 'goals.js phải load trước app.js');
  // sw.js precache goals.js
  assert.ok(SW.includes("\'./js/goals.min.js\'"), 'sw.js phải precache js/goals.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowGoals\) throw new Error\('TaskFlowGoals missing/);
  assert.match(APP_JS, /const \{ monthPctOf, monthGoalsOf \} = window\.TaskFlowGoals;/);
  assert.doesNotMatch(APP_JS, /^function monthPctOf\(/m);
  assert.doesNotMatch(APP_JS, /^function monthGoalsOf\(/m);
  // call-sites đổi signature: truyền defaultMonthPct/GOAL_DEFS tham số
  assert.match(APP_JS, /monthPctOf\(PLAN_YEAR, m, defaultMonthPct\)/);
  assert.match(APP_JS, /monthGoalsOf\(PLAN_YEAR, m, GOAL_DEFS\)/);
  assert.match(APP_JS, /monthGoalsOf\(y, m, GOAL_DEFS\)/);
  // defaultMonthPct vẫn sống trong app.js; GOAL_DEFS đã sang js/config.js (extraction 29)
  assert.match(APP_JS, /^function defaultMonthPct\(/m);
  assert.doesNotMatch(APP_JS, /^const GOAL_DEFS = /m);
  assert.match(readRequiredAsset('js/config.js'), /const GOAL_DEFS = \[/);
  // module export đủ API + hasAccount access qua TaskFlowAccount
  const mod = readRequiredAsset('js/goals.js');
  assert.match(mod, /return \{ monthPctOf, monthGoalsOf \}/);
  assert.match(mod, /TaskFlowAccount/);
  assert.match(mod, /localStorage\.getItem\('planner-' \+ y \+ '-' \+ \(m \+ 1\)\)/);
});

test('P11: config constants extracted — seed data lives in js/config.js (extraction 29)', () => {
  // app.html loads config.js before app.js
  assert.match(APP, /src="js\/config.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const cIdx = APP.indexOf('js/config.min.js?v=');
  assert.ok(cIdx >= 0 && cIdx < appIdx, 'config.js phải load trước app.js');
  // sw.js precache config.js
  assert.ok(SW.includes("\'./js/config.min.js\'"), 'sw.js phải precache js/config.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowConfig\) throw new Error\('TaskFlowConfig missing/);
  assert.match(APP_JS, /const \{ HABIT_DEFS, GOAL_DEFS, WEEK_PATTERNS, REFLECT_PROMPTS_MONTH, REFLECT_PROMPTS_WEEK \} = window\.TaskFlowConfig;/);
  assert.doesNotMatch(APP_JS, /^const HABIT_DEFS = /m);
  assert.doesNotMatch(APP_JS, /^const WEEK_PATTERNS = /m);
  assert.doesNotMatch(APP_JS, /^const DAYS = /m);
  // module export đủ API
  const mod = readRequiredAsset('js/config.js');
  assert.match(mod, /const HABIT_DEFS = \[/);
  assert.match(mod, /const WEEK_PATTERNS = \[/);
  assert.match(mod, /return \{ HABIT_DEFS, GOAL_DEFS, WEEK_PATTERNS, REFLECT_PROMPTS_MONTH, REFLECT_PROMPTS_WEEK \}/);
});

test('P11: FAB drag/tuck helpers extracted — FAB core lives in js/fab.js', () => {
  // app.html loads fab.js before app.js
  assert.match(APP, /src="js\/fab.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const fIdx = APP.indexOf('js/fab.min.js?v=');
  assert.ok(fIdx >= 0 && fIdx < appIdx, 'fab.js phải load trước app.js');
  // sw.js precache fab.js
  assert.ok(SW.includes("\'./js/fab.min.js\'"), 'sw.js phải precache js/fab.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowFab\) throw new Error\('TaskFlowFab missing/);
  assert.match(APP_JS, /const \{ loadFabPos, saveFabPos, clearFabPos, clampFabPos, initFabDrag, initFabDrags, fabTuckAllowed, nearestTuckEdge, tuckOffset, initFabTuck \} = window\.TaskFlowFab;/);
  assert.doesNotMatch(APP_JS, /^function loadFabPos\(/m);
  assert.doesNotMatch(APP_JS, /^function saveFabPos\(/m);
  assert.doesNotMatch(APP_JS, /^function clampFabPos\(/m);
  assert.doesNotMatch(APP_JS, /^function initFabDrag\(/m);
  assert.doesNotMatch(APP_JS, /^function initFabDrags\(/m);
  assert.doesNotMatch(APP_JS, /^function fabTuckAllowed\(/m);
  assert.doesNotMatch(APP_JS, /^function nearestTuckEdge\(/m);
  assert.doesNotMatch(APP_JS, /^function tuckOffset\(/m);
  assert.doesNotMatch(APP_JS, /^function initFabTuck\(/m);
  assert.doesNotMatch(APP_JS, /^const FAB_MARGIN = /m);
  assert.doesNotMatch(APP_JS, /^const FAB_POS_KEYS = /m);
  // boot call giữ nguyên (initFabDrags chạy lúc khởi động)
  assert.match(APP_JS, /initFabDrags\(\);/);
  // module export đủ API + state/consts nội bộ + accessor pattern
  const mod = readRequiredAsset('js/fab.js');
  assert.match(mod, /return \{ loadFabPos, saveFabPos, clearFabPos, clampFabPos, initFabDrag, initFabDrags, fabTuckAllowed, nearestTuckEdge, tuckOffset, initFabTuck \}/);
  assert.match(mod, /const FAB_MARGIN = 8;/);
  // P1.2: floating chat FAB đã bỏ (Trợ lý mở từ Công cụ / More sheet) — chỉ còn pomo FAB.
  assert.match(mod, /const FAB_POS_KEYS = \{ pomo: 'planner-fab-pomo' \};/);
  assert.match(mod, /FAB_TUCK_MS = 2200/);
  assert.match(mod, /FAB_TUCK_SLIVER = 14/);
  assert.match(mod, /fabDragJustMoved/);
  assert.match(mod, /TaskFlowI18N/);
  assert.match(mod, /TaskFlowUI/);
});

test('P11: storage core extracted — helpers live in js/storage.js, app.js keeps aliases', () => {
  // app.html loads storage.js before app.js
  assert.match(APP, /src="js\/storage.min.js\?v=\d+"[^>]*>/);
  const appIdx = APP.indexOf('js/app.min.js?v=');
  const stIdx = APP.indexOf('js/storage.min.js?v=');
  assert.ok(stIdx >= 0 && stIdx < appIdx, 'storage.js phải load trước app.js');
  // sw.js precache storage.js
  assert.ok(SW.includes("\'./js/storage.min.js\'"), 'sw.js phải precache js/storage.js');
  // app.js dùng alias destructure thay vì định nghĩa lại (kèm fail-fast)
  assert.match(APP_JS, /if \(!window\.TaskFlowStorage\) throw new Error\('TaskFlowStorage missing/);
  assert.match(APP_JS, /const \{ POMO_LOG_KEY, monthStateRaw, saveMonthState, loadPomoLog, savePomoLog, backupSlotKey \} = window\.TaskFlowStorage;/);
  assert.doesNotMatch(APP_JS, /^function monthStateRaw\(/m);
  assert.doesNotMatch(APP_JS, /^function saveMonthState\(/m);
  assert.doesNotMatch(APP_JS, /^function loadPomoLog\(/m);
  assert.doesNotMatch(APP_JS, /^function backupSlotKey\(/m);
  assert.doesNotMatch(APP_JS, /^const POMO_LOG_KEY = /m);
  // module export đủ API
  const mod = readRequiredAsset('js/storage.js');
  assert.match(mod, /return \{ POMO_LOG_KEY, monthStateRaw, saveMonthState, loadPomoLog, savePomoLog, backupSlotKey \}/);
  assert.match(mod, /POMO_LOG_KEY = 'planner-pomo-log'/);
  // call-sites giữ nguyên trong app.js
  assert.match(APP_JS, /monthStateRaw\(/);
  assert.match(APP_JS, /saveMonthState\(/);
  assert.match(readRequiredAsset('js/backup.js'), /backupSlotKey\(/);
});

test('service worker caches the UI helper (min) with the reviewed cache version', () => {
  assert.match(SW, /const CACHE = 'taskflow-v252';/);
  assert.match(SW, /['"]\.\/js\/ui\.min\.js['"]/);
});

test('design system assets load before legacy styles and expose stable shell roots', () => {
  assert.match(
    APP,
    /css\/tokens\.min\.css[^]*css\/components\.min\.css[^]*css\/app-shell\.min\.css[^]*css\/styles-critical\.min\.css[^]*css\/styles-deferred\.min\.css/
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

test('design system and landing assets are available in the v154 offline shell', () => {
  assert.match(SW, /const CACHE = 'taskflow-v252';/);
  // Union: app dùng css min; landing/legal dùng css readable (index/privacy/terms/data-and-security)
  [
    './css/tokens.css', './css/landing.css', './css/legal.css',
    './css/tokens.min.css', './css/components.min.css', './css/app-shell.min.css',
    './css/styles-critical.min.css', './css/styles-deferred.min.css', './icons/ui-sprite.svg', './js/ui.min.js', './index.html',
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

test('release: sync.min.js cache-bust upgraded to v5 with no stale v4 reference', () => {
  // P1: sync.min.js thay đổi ở b4bf197 nhưng app.html còn ?v=4 → bump ?v=5.
  assert.match(APP, /js\/sync\.min\.js\?v=5/);
  assert.doesNotMatch(APP, /js\/sync\.min\.js\?v=4/, 'không được để lại tham chiếu ?v=4 cũ');
  // SW precache phải chứa sync.min.js để offline phục vụ được
  assert.ok(SW.includes("\'./js/sync.min.js\'"), 'sw.js phải precache js/sync.min.js');
});

test('release: app.min.js version pin is current — asset on disk, no stale version, SW generation matches release', () => {
  // P1.1/P1.3 release-consistency invariant: app.html phải tham chiếu
  // app.min.js có ?v=N; N phải là pin release hiện tại; asset min tồn tại trên
  // disk; không để lại tham chiếu version cũ (N-1); SW cache generation phải
  // thuộc cùng release và precache app.min.js.
  const ver = APP.match(/js\/app\.min\.js\?v=(\d+)/);
  assert.ok(ver, 'app.html phải tham chiếu js/app.min.js có ?v=');
  const current = Number(ver[1]);
  assert.ok(current >= 182, `app.min.js version phải >= 182 (release hiện tại), tìm thấy ${current}`);
  assert.ok(existsSync(path.join(ROOT, 'js/app.min.js')), 'js/app.min.js phải tồn tại trên disk (min sibling up to date)');
  assert.doesNotMatch(
    APP,
    new RegExp(`js/app\\.min\\.js\\?v=${current - 1}(?!\\d)`),
    `không được để lại tham chiếu app.min.js version cũ (v${current - 1})`
  );
  const gen = SW.match(/const CACHE = 'taskflow-v(\d+)'/);
  assert.ok(gen, 'sw.js phải khai báo CACHE generation');
  assert.ok(SW.includes("\'./js/app.min.js\'"), 'sw.js phải precache js/app.min.js');
});

test('release: SW upgrade cache — new app.min.js versioned URL never satisfies the previous release key, old generation purged', async () => {
  // P1.3 upgrade scenario: user có SW cũ + entry app.min.js?v=N-1 trong cache.
  // Deploy release mới: HTML yêu cầu ?v=N → exact-URL match phải miss online,
  // network phục vụ file MỚI ngay lần load đầu, entry release cũ không bao
  // giờ được trả; activate xoá cache generation cũ (taskflow-v{C-1}).
  const ver = APP.match(/js\/app\.min\.js\?v=(\d+)/);
  assert.ok(ver, 'app.html phải tham chiếu app.min.js có version query');
  const current = Number(ver[1]);
  const prev = current - 1;
  const gen = SW.match(/const CACHE = 'taskflow-v(\d+)'/);
  assert.ok(gen, 'sw.js phải khai báo CACHE generation');
  const cacheGen = Number(gen[1]);
  const prevGen = `taskflow-v${cacheGen - 1}`;
  const newKey = `app.min.js?v=${current}`;
  const oldKey = `app.min.js?v=${prev}`;
  const handlers = {};
  const matchCalls = [];
  const deleteCalls = [];
  const staleEntry = { source: 'stale-prev-release' };
  const context = {
    URL,
    location: { origin: 'https://taskflow.test' },
    caches: {
      match(request, options) {
        matchCalls.push({ request, options });
        // Cache cũ vẫn giữ entry v{prev}; request mới v{current} → exact match miss
        if (String(request.url || request).includes(oldKey)) {
          return Promise.resolve(staleEntry);
        }
        return Promise.resolve(undefined);
      },
      open() { return Promise.resolve({ put() {} }); },
      keys() {
        return Promise.resolve([prevGen, `taskflow-v${cacheGen}`, 'taskflow-digest']);
      },
      delete(key) { deleteCalls.push(key); return Promise.resolve(true); },
    },
    fetch() {
      return Promise.resolve({ ok: true, source: 'network-new-release', clone: () => ({}) });
    },
    self: {
      addEventListener(type, handler) { handlers[type] = handler; },
      clients: { claim() {} },
      skipWaiting() {},
      registration: { showNotification() {} },
    },
  };
  vm.runInNewContext(SW, context);

  // Activate: cache generation cũ bị xoá, generation hiện tại + digest giữ lại
  const activateChain = handlers.activate({ waitUntil(p) { return p; } });
  await activateChain;
  assert.deepStrictEqual(
    deleteCalls.sort(),
    [prevGen],
    `activate phải xoá cache generation cũ (${prevGen}), giữ taskflow-v${cacheGen} + digest`
  );

  // Fetch online cho app.min.js?v=N: exact match miss → network phục vụ file MỚI
  let responsePromise;
  handlers.fetch({
    request: { method: 'GET', mode: 'cors', url: `https://taskflow.test/js/${newKey}` },
    respondWith(promise) { responsePromise = promise; },
  });
  const res = await responsePromise;
  assert.ok(res && res.source === 'network-new-release', `lần load đầu sau nâng cấp phải lấy ${newKey} từ network`);
  assert.notEqual(res, staleEntry, 'entry release cũ không bao giờ được trả cho request mới');
  assert.equal(matchCalls.length, 1, 'chỉ 1 lần match exact URL (online không dùng ignoreSearch)');
  assert.equal(matchCalls[0].request.url, `https://taskflow.test/js/${newKey}`);
});

test('release: SW upgrade cache — old v4 entry never satisfies new v5 request, old cache purged on activate', async () => {
  // Upgrade scenario (P1.3): user có SW cũ + entry sync.min.js?v=4 trong cache.
  // Deploy bản mới: HTML yêu cầu ?v=5 → exact-URL match phải miss online,
  // network phục vụ file MỚI ngay lần load đầu (skipWaiting đã claim),
  // entry cũ v4 không bao giờ được trả; activate xoá cache cũ (v210).
  const handlers = {};
  const matchCalls = [];
  const deleteCalls = [];
  const oldV4 = { source: 'stale-v4-entry' };
  const context = {
    URL,
    location: { origin: 'https://taskflow.test' },
    caches: {
      match(request, options) {
        matchCalls.push({ request, options });
        // Cache cũ vẫn giữ entry v4; request mới là v5 → exact match miss
        if (String(request.url || request).includes('sync.min.js?v=4')) {
          return Promise.resolve(oldV4);
        }
        return Promise.resolve(undefined);
      },
      open() { return Promise.resolve({ put() {} }); },
      keys() {
        return Promise.resolve(['taskflow-v220', 'taskflow-v252', 'taskflow-digest']);
      },
      delete(key) {
        deleteCalls.push(key);
        return Promise.resolve(true);
      },
    },
    fetch() {
      return Promise.resolve({ ok: true, source: 'network-new-v5', clone: () => ({}) });
    },
    self: {
      addEventListener(type, handler) { handlers[type] = handler; },
      clients: { claim() {} },
      skipWaiting() {},
      registration: { showNotification() {} },
    },
  };
  vm.runInNewContext(SW, context);

  // Activate: cache cũ (v210) bị xoá, v211 + digest giữ lại
  const activateChain = handlers.activate({ waitUntil(p) { return p; } });
  await activateChain;
  assert.deepStrictEqual(deleteCalls.sort(), ['taskflow-v220'], 'activate phải xoá cache cũ, giữ v231 + digest');

  // Fetch online cho request mới v5: exact match miss → network phục vụ file MỚI
  // ngay trong lần load nâng cấp đầu tiên (không cần reload lần 2)
  let responsePromise;
  handlers.fetch({
    request: { method: 'GET', mode: 'cors', url: 'https://taskflow.test/js/sync.min.js?v=5' },
    respondWith(promise) { responsePromise = promise; },
  });
  const res = await responsePromise;
  assert.ok(res && res.source === 'network-new-v5', 'lần load đầu sau nâng cấp phải lấy sync.min.js?v=5 mới từ network');
  assert.notEqual(res, oldV4, 'entry v4 cũ không bao giờ được trả cho request v5');
  assert.equal(matchCalls.length, 1, 'chỉ 1 lần match exact URL (online không dùng ignoreSearch)');
  assert.equal(matchCalls[0].options?.ignoreSearch, undefined);
  assert.equal(matchCalls[0].request.url, 'https://taskflow.test/js/sync.min.js?v=5');
});

test('release: offline navigation fallback strips Content-Disposition from cached HTML', async () => {
  // PWA offline hardening: Vercel cleanUrls phục vụ /app, /privacy... kèm
  // `Content-Disposition: inline; filename="..."` — khi SW trả response này
  // cho navigation OFFLINE, Chromium từ chối với ERR_FAILED (chỉ root "/"
  // không có filename= nên vẫn chạy). Fallback phải trả bản đã bỏ header đó,
  // giữ nguyên status + Content-Type + các header an toàn khác.
  const handlers = {};
  const poisoned = new Response('<!doctype html><title>App</title><div id="appMain"></div>', {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-disposition': 'inline; filename="app"',
      'x-keep': 'preserved',
    },
  });
  const context = {
    URL,
    Response,
    Headers,
    Blob,
    location: { origin: 'https://taskflow.test' },
    caches: {
      match(request, options) {
        if (options?.ignoreSearch && String(request.url || request).includes('/app')) {
          return Promise.resolve(poisoned);
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
    request: { method: 'GET', mode: 'navigate', url: 'https://taskflow.test/app' },
    respondWith(promise) { responsePromise = promise; },
  });
  const served = await responsePromise;
  assert.ok(served, 'offline navigation phải trả response từ cache');
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-disposition'), null,
    'navigation response offline KHÔNG được mang Content-Disposition');
  assert.match(served.headers.get('content-type'), /^text\/html/, 'Content-Type phải giữ text/html');
  assert.equal(served.headers.get('x-keep'), 'preserved', 'header an toàn khác phải được giữ');
  assert.match(await served.text(), /appMain/, 'body HTML phải nguyên vẹn');
});

test('release: online navigation caches a normalized copy, online response untouched', async () => {
  // Network-first: online vẫn trả NGUYÊN response mạng (kèm header Vercel);
  // chỉ bản sao ghi cache bị chuẩn hoá — offline về sau sạch header.
  const handlers = {};
  const network = new Response('<!doctype html><div id="appMain"></div>', {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-disposition': 'inline; filename="app"',
    },
  });
  let putArg = null;
  const context = {
    URL,
    Response,
    Headers,
    Blob,
    location: { origin: 'https://taskflow.test' },
    caches: {
      match() { return Promise.resolve(undefined); },
      open() { return Promise.resolve({ put(url, res) { putArg = res; } }); },
      keys() { return Promise.resolve([]); },
    },
    fetch() { return Promise.resolve(network); },
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
    request: { method: 'GET', mode: 'navigate', url: 'https://taskflow.test/app' },
    respondWith(promise) { responsePromise = promise; },
  });
  const served = await responsePromise;
  assert.equal(served, network, 'online phải trả response mạng gốc (không clone)');
  assert.equal(served.headers.get('content-disposition'), 'inline; filename="app"',
    'online response mạng không bị mutate');
  // Chuỗi put là async detached (không được await trong handler fetch) —
  // poll tới khi bản cache xuất hiện rồi mới kiểm tra.
  const deadline = Date.now() + 2000;
  while (!putArg && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(putArg, 'navigation response phải được ghi vào cache');
  assert.equal(putArg.headers.get('content-disposition'), null,
    'bản cache phải sạch Content-Disposition');
  assert.match(putArg.headers.get('content-type'), /^text\/html/);
});

test('release: SW install precaches HTML shells without Content-Disposition', async () => {
  // APP_SHELL precache fetch ./app.html, ./privacy.html... — response từ Vercel
  // cũng mang header độc hại. Entry HTML lưu vào cache phải được chuẩn hoá
  // ngay từ install để `caches.match('/app.html')` trả bản sạch (header
  // invariant kiểm tra được trực tiếp), non-HTML assets giữ nguyên.
  const handlers = {};
  const putCalls = [];
  const fetchCalls = [];
  const htmlResponse = () =>
    new Response('<!doctype html><title>Shell</title>', {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-disposition': 'inline; filename="shell.html"',
      },
    });
  const context = {
    URL,
    Response,
    Headers,
    Blob,
    location: { origin: 'https://taskflow.test' },
    caches: {
      open() {
        return Promise.resolve({
          put(url, res) { putCalls.push({ url: String(url), res }); },
        });
      },
      match() { return Promise.resolve(undefined); },
      keys() { return Promise.resolve([]); },
    },
    fetch(url) {
      fetchCalls.push(String(url));
      const u = new URL(String(url), 'https://taskflow.test/sw.js');
      return Promise.resolve(u.pathname.endsWith('.html') || u.pathname === '/' ? htmlResponse() : new Response('js'));
    },
    self: {
      addEventListener(type, handler) { handlers[type] = handler; },
      clients: { claim() {} },
      skipWaiting() {},
      registration: { showNotification() {} },
    },
  };
  vm.runInNewContext(SW, context);

  // Handler install KHÔNG return e.waitUntil(...) — bắt promise qua waitUntil.
  let installChain;
  handlers.install({ waitUntil(p) { installChain = p; } });
  await installChain;
  assert.ok(fetchCalls.length >= 90, `install phải precache toàn bộ APP_SHELL, được ${fetchCalls.length}`);
  const htmlPuts = putCalls.filter(({ url }) => url.endsWith('.html') || url.endsWith('/'));
  assert.ok(htmlPuts.length >= 6, `phải có >= 6 HTML shell entries, được ${htmlPuts.length}`);
  for (const { res } of htmlPuts) {
    assert.equal(res.headers.get('content-disposition'), null,
      'HTML precache entry phải sạch Content-Disposition');
    assert.match(res.headers.get('content-type'), /^text\/html/);
  }
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
  // P1.10 mobile QA: row/list checkbox toggles (task/habit/upcoming/inbox/focus
  // rows) also expand to a ~44px hit area via ::before with the :active scale
  // suppressed on touch — the dense 31-column habit table stays the deliberate
  // exclusion.
  assert.match(touchRules, /\.checkbox::before\s*{[^}]*inset:\s*-13px/);
  assert.doesNotMatch(touchRules, /\.habit-table\b/);
  assert.match(components, /Dense planner grid checkboxes[^]*intentionally excluded/i);
});

test('hardening: reduced-motion helper suppresses confetti and smooth journey scrolling', () => {
  const helperSource = readRequiredAsset('js/widget.js').match(/function prefersReducedMotion\([^)]*\)\s*{[^}]*}/)?.[0];
  assert.ok(helperSource, 'missing prefersReducedMotion helper in js/widget.js');
  const helper = new Function(`${helperSource}; return prefersReducedMotion;`)();
  assert.equal(helper(() => ({ matches: true })), true);
  assert.equal(helper(() => ({ matches: false })), false);
  assert.equal(helper(null), false);
  // P11 extraction 28: confettiBurst chuyển sang js/popups.js (window.TaskFlowPopups);
  // app.js giữ guard + alias để call-sites không đổi. prefersReducedMotion chuyển sang
  // js/widget.js (extraction 31) — helper được trích từ module ở trên.
  assert.match(readRequiredAsset('js/popups.js'), /function confettiBurst\(\)\s*{\s*if \(prefersReducedMotion\(\)\) return;/);
  assert.match(APP_JS, /if \(!window\.TaskFlowPopups\) throw new Error\('TaskFlowPopups missing/);
  assert.match(APP_JS, /scrollIntoView\(\{\s*behavior:\s*prefersReducedMotion\(\) \? 'auto' : 'smooth'/);
});

test('hardening: browser theme metadata follows semantic cream and dark canvases', () => {
  assert.match(APP, /<meta name="theme-color" content="#f4f0e9"/i);
  // applyDark (đã tách sang js/theme.js) vẫn set theme-color đúng cho dark/light
  assert.match(readRequiredAsset('js/theme.js'), /mc\.setAttribute\('content', on \? '#1b1917' : '#f4f0e9'\)/i);
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
  assert.match(I18N_JS, /todayTxt:\s*'Hôm nay'/);
  assert.match(I18N_JS, /dataTitle:\s*'Dữ liệu của bạn'/);
  assert.match(I18N_JS, /remindTitle:\s*'Nhắc việc hằng ngày'/);
  assert.doesNotMatch(I18N_JS, /todayTxt:\s*'[📍]|dataTitle:\s*'[💾]|remindTitle:\s*'[🔔]/u);
});

test('Phase 3: Today Dashboard is the default view with greeting, tasks, habits and focus', () => {
  const html = readRequiredAsset('app.html');
  assert.match(html, /id="view-today"[^>]*role="tabpanel"/);
  // R19 (extraction 34): Today render sang js/today.js (window.TaskFlowToday)
  const todayMod = readRequiredAsset('js/today.js');
  assert.match(todayMod, /function renderToday\(\)/);
  assert.match(todayMod, /function todayGreeting\(\)/);
  assert.match(todayMod, /todayGreetingMorning|todayGreetingAfternoon|todayGreetingEvening/);
  assert.match(todayMod, /todayTasksTitle|todayHabitsTitle|todayFocusTitle/);
  assert.match(todayMod, /today-addtask/);
  assert.match(todayMod, /todayCompleted|todayProgress/);
  assert.match(todayMod, /today-page|today-card|today-progress-fill|today-habit-list/);
  // default state view is today
  assert.match(APP_JS, /view: 'today'/);
  // deeplink accepts today
  const deeplink = readRequiredAsset('js/deeplink.js');
  assert.match(deeplink, /view === 'today'/);
  // mobile nav (P2): 5-item grid with the Today tab; More sheet chứa view còn lại
  const shell = readRequiredAsset('css/app-shell.css');
  assert.match(shell, /\.app-mobile-nav\s*{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(shell, /\.app-mobile-nav-add/);;
});

test('Phase 3: Today view toggles tasks and habits through shared actions', () => {
  assert.match(APP_JS, /if \(state\.view === 'today'\) renderToday\(\);/);
  assert.match(readRequiredAsset('js/today.js'), /data-role=\"task-text\"\s+data-week=/);
  assert.match(APP_JS, /habitStreakCached/);
  assert.match(readRequiredAsset('js/today.js'), /totalFocusMinutesToday/);
});

test('Phase 4: minimal task card with meta line and hover ⋯ menu', () => {
  const styles = readRequiredAsset('css/styles.css');
  // meta line (P1 · giờ · repeat) dưới text — row renderer sang js/today.js (extraction 34)
  assert.match(readRequiredAsset('js/today.js'), /task-meta/);
  assert.match(APP_JS, /taskPriorityLabel/);
  assert.match(readRequiredAsset('js/today.js'), /task-meta-time/);
  assert.match(readRequiredAsset('js/today.js'), /task-meta-repeat/);
  // actions ẩn mặc định, hiện khi hover/focus
  assert.match(styles, /\.task-row-actions[^}]*opacity:\s*0/s);
  assert.match(styles, /\.task-row:hover \.task-row-actions[^}]*opacity:\s*1/s);
  // menu dropdown ⋯ chứa duplicate/delete/move, giữ data-action cũ cho handler
  assert.match(APP_JS, /data-action="task-menu"/);
  assert.match(readRequiredAsset('js/today.js'), /data-action="task-duplicate"/);
  assert.match(readRequiredAsset('js/today.js'), /data-action="task-move"/);
  assert.match(readRequiredAsset('js/today.js'), /data-action="remind-task"/);
  assert.match(readRequiredAsset('js/today.js'), /data-action="repeat-edit"/);
  assert.match(APP_JS, /act === 'task-duplicate'/);
  assert.match(APP_JS, /act === 'task-move'/);
  assert.match(I18N_JS, /taskMove: 'Chuyển ngày'/);
  assert.match(I18N_JS, /taskMove: 'Move date'/);
  // completed task giảm emphasis: card mờ + text gạch nhẹ (giống upcoming/inbox)
  assert.match(styles, /\.task-row\.done\s*{[^}]*opacity:\s*\.62/s);
  assert.match(styles, /\.task-row\.done \.task-text[^}]*line-through/s);
  // touch: nút xoá Today hiện luôn (không phụ thuộc hover)
  assert.match(styles, /@media \(hover: none\), \(pointer: coarse\)[^{]*{[^}]*\}\s*\.today-task \.btn-del\s*{[^}]*opacity:\s*1/s);
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
  assert.match(I18N_JS, /taskDetailTitle:/);
  assert.match(I18N_JS, /taskDetailSubtasks:/);
  assert.match(I18N_JS, /taskDetailNotes:/);
  assert.match(I18N_JS, /taskDetailDelete:/);
});

test('Phase 6: task-specific focus with timer and session log', () => {
  const styles = readRequiredAsset('css/styles.css');
  const html = readRequiredAsset('app.html');
  // focus-task button truyền ref vào openFocusMode (week/day hoặc scope=inbox cho task Inbox) — dispatcher giữ
  assert.match(APP_JS, /openFocusMode\(el\.dataset\.scope === 'inbox'/);
  assert.match(APP_JS, /week: el\.dataset\.week, day: el\.dataset\.day, task: el\.dataset\.task,/);
  // focus mode + timer state machine sang js/focus.js (P11 extraction 39 — A28)
  assert.match(readRequiredAsset('js/focus.js'), /function openFocusMode\(ref\)/);
  assert.match(readRequiredAsset('js/focus.js'), /let focusTaskRef = null/);
  assert.match(readRequiredAsset('js/focus.js'), /function getFocusedTask\(\)/);
  // session log helpers trên task
  assert.match(readRequiredAsset('js/focus.js'), /function taskFocusLog\(tk\)/);
  assert.match(readRequiredAsset('js/focus.js'), /function taskFocusSecs\(tk\)/);
  assert.match(readRequiredAsset('js/focus.js'), /function taskFocusToday\(tk\)/);
  assert.match(readRequiredAsset('js/focus.js'), /function getTaskByUid\(uid\)/);
  assert.match(readRequiredAsset('js/focus.js'), /byUid\.focusLog = byUid\.focusLog \|\| \[\]/);
  // timer: presets + start/pause/reset/set + endAt accuracy
  assert.match(readRequiredAsset('js/focus.js'), /const FOCUS_PRESETS = \[5, 15, 25, 45\]/);
  assert.match(readRequiredAsset('js/focus.js'), /let focusTimer = \{ running: false, dur: 25 \* 60/);
  assert.match(readRequiredAsset('js/focus.js'), /function focusTimerComplete\(\)/);
  assert.match(readRequiredAsset('js/focus.js'), /function focusTimerStart\(\)/);
  assert.match(readRequiredAsset('js/focus.js'), /function focusTimerSetDur\(min\)/);
  assert.match(readRequiredAsset('js/focus.js'), /focusTimer\.endAt = Date\.now\(\) \+ focusTimer\.left \* 1000/);
  // actions mới — dispatcher giữ ở app.js
  assert.match(APP_JS, /act === 'focus-show-all'/);
  assert.match(APP_JS, /act === 'focus-timer-start'/);
  assert.match(APP_JS, /act === 'focus-timer-reset'/);
  assert.match(APP_JS, /act === 'focus-timer-set'/);
  // markup timer/overlay — renderFocusContent trong js/focus.js
  assert.match(readRequiredAsset('js/focus.js'), /data-action="focus-timer-set"/);
  assert.match(readRequiredAsset('js/focus.js'), /data-action="focus-show-all"/);
  // meta badge focus trên row (taskRowHTML sang js/today.js)
  assert.match(readRequiredAsset('js/today.js'), /task-meta-focus/);
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
  assert.match(I18N_JS, /focusShowAll:/);
  assert.match(I18N_JS, /focusLog:/);
  assert.match(I18N_JS, /focusDone:/);
  assert.match(I18N_JS, /focusTimer:/);
});

test('Phase 7: focus time bar chart in week view and focus stats in reports', () => {
  const styles = readRequiredAsset('css/styles.css');
  // helpers stats — sang js/focus-stats.js (P11 extraction 37)
  assert.match(readRequiredAsset('js/focus-stats.js'), /function pomoDaySecs\(date\)/);
  assert.match(readRequiredAsset('js/focus-stats.js'), /function focusWeekMinutes\(week\)/);
  assert.match(readRequiredAsset('js/focus-stats.js'), /function focusMonthMinutes\(\)/);
  assert.match(readRequiredAsset('js/focus-stats.js'), /function topFocusTasksInWeek\(w, n\)/);
  assert.match(readRequiredAsset('js/focus-stats.js'), /function topFocusTasksInMonth\(n\)/);
  assert.match(readRequiredAsset('js/focus-stats.js'), /function taskFocusSecsInRange\(tk, startKey, endKey\)/);
  // card biểu đồ trong week-support-grid (full-width)
  assert.match(APP_JS, /focusChartCardHTML\(w\)/);
  assert.match(APP_JS, /class="card focus-chart-card"/);
  assert.match(APP_JS, /data-role="focus-chart"/);
  assert.match(APP_JS, /fc-bar/);
  assert.match(APP_JS, /dayLabelShort\(di\)/);
  // báo cáo tuần + tháng có focus (weeklyReportData/monthlyReportData sang js/report-ui.js)
  assert.match(readRequiredAsset('js/report-ui.js'), /focusByDay/);
  assert.match(readRequiredAsset('js/stats-ui.js'), /focusTotal/);
  assert.match(readRequiredAsset('js/report-ui.js'), /focusByWeek/);
  assert.match(readRequiredAsset('js/report-ui.js'), /reportFocusWeek/);
  assert.match(readRequiredAsset('js/report-ui.js'), /reportFocusMonth/);
  assert.match(readRequiredAsset('js/report-ui.js'), /reportFocusTop/);
  assert.match(readRequiredAsset('js/report-ui.js'), /function focusReportBars\(values, labelFn\)/);
  assert.match(readRequiredAsset('js/report-ui.js'), /report-focus-head/);
  // CSS
  assert.match(styles, /\.focus-chart-card\s*{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(styles, /\.focus-chart-bars\s*{[^}]*display:\s*flex/s);
  assert.match(styles, /\.fc-bar\s*{[^}]*background:\s*linear-gradient/s);
  assert.match(styles, /\.report-focus-labels\s*{/);
  // i18n keys
  assert.match(I18N_JS, /focusChartTitle:/);
  assert.match(I18N_JS, /focusChartEmpty:/);
  assert.match(I18N_JS, /focusChartTop:/);
  assert.match(I18N_JS, /reportFocusBestDay:/);
});

test('Phase 8: year report focus stats, quarterly summary, and calendar focus pills', () => {
  const styles = readRequiredAsset('css/styles.css');
  // helpers năm
  assert.match(APP_JS, /function focusMonthMinutesFor\(y, m\)/);
  assert.match(APP_JS, /function focusYearByMonth\(\)/);
  assert.match(APP_JS, /function topFocusTasksInYear\(y, n\)/);
  // year report data + render — năm trong js/year-report.js (P11 extraction 25)
  const yrmod_p8 = readRequiredAsset('js/year-report.js');
  assert.match(yrmod_p8, /focusByMonth, focusTotal, focusByQuarter, topTask/);
  assert.match(yrmod_p8, /focusByQuarter\.map/);
  assert.match(yrmod_p8, /report-quarters-grid/);
  assert.match(yrmod_p8, /yearReportQuarter/);
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
  assert.match(I18N_JS, /yearReportFocus:/);
  assert.match(I18N_JS, /quarterShort:/);
  assert.match(I18N_JS, /calFocusBestDay:/);
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
  // helpers + data builder — sang js/stats-ui.js (P11 extraction 41, lazy module)
  const statsui = readRequiredAsset('js/stats-ui.js');
  assert.match(statsui, /let statsRange = 'month';/);
  assert.match(statsui, /function statsMonthsForRange\(range\)/);
  assert.match(statsui, /function statsData\(range\)/);
  assert.match(statsui, /function statsCorrelation\(xs, ys\)/);
  assert.match(statsui, /function statsScatterSVG\(points\)/);
  assert.match(statsui, /function renderStatsModal\(\)/);
  assert.match(statsui, /function openStatsModal\(\)/);
  // granularity: tuần cho tháng/quý, tháng cho năm/toàn bộ
  assert.match(statsui, /granularity = \(range === 'year' \|\| range === 'all'\) \? 'month' : 'week'/);
  assert.match(statsui, /monthStateRaw\(y, m\)/);
  // dispatcher nạp lazy qua runLazyModule
  assert.match(APP_JS, /act === 'stats-range'/);
  assert.match(APP_JS, /window\.TaskFlowStatsUI\.setStatsRange\(el\.dataset\.range\)\)/);
  // CSS
  assert.match(styles, /\.stats-modal-card\s*{[^}]*max-width:\s*560px/s);
  // P2.1 — data-heavy modal width tiers: deep reflection + week/year report 600–680px,
  // pillar/metric editors 480–560px, all responsive min(calc(100vw - margins), target);
  // simple dialogs giữ nguyên 360–420px
  assert.match(styles, /#reflectionModal \.report-modal-card\s*{[^}]*min\(640px,\s*calc\(100vw - 32px\)\)[^}]*max-width:\s*640px/s);
  assert.match(styles, /#weekReportModal \.report-modal-card\s*{[^}]*min\(640px,\s*calc\(100vw - 32px\)\)[^}]*max-width:\s*640px/s);
  assert.match(styles, /#yearReportModal \.report-modal-card\s*{[^}]*min\(680px,\s*calc\(100vw - 32px\)\)[^}]*max-width:\s*680px/s);
  assert.match(styles, /#pillarEditModal \.report-modal-card\s*{[^}]*min\(520px,\s*calc\(100vw - 32px\)\)[^}]*max-width:\s*520px/s);
  assert.match(styles, /#metricEditModal \.report-modal-card\s*{[^}]*min\(520px,\s*calc\(100vw - 32px\)\)[^}]*max-width:\s*520px/s);
  // mobile ≤600px: tất cả về full-width trong safe margin (no horizontal scroll)
  assert.match(styles, /#reflectionModal \.report-modal-card, #weekReportModal \.report-modal-card, #yearReportModal \.report-modal-card, #pillarEditModal \.report-modal-card, #metricEditModal \.report-modal-card \{ width: min\(100% - 24px, 440px\); max-width: 440px; max-height: calc\(100vh - 32px\); \}/s);
  assert.match(styles, /\.stats-range-btn\.active\s*{/);
  assert.match(styles, /\.stats-scatter-svg\s*{/);
  assert.match(styles, /\.stats-row\s*{/);
  assert.match(styles, /\.stats-dot-core\s*{/);
  // i18n keys đủ vi+en
  assert.match(I18N_JS, /statsRangeMonth:/);
  assert.match(I18N_JS, /statsRangeAll:/);
  assert.match(I18N_JS, /statsCorr:/);
  assert.match(I18N_JS, /statsNoData:/);
  assert.match(I18N_JS, /statsUnitWeek:/);
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
  // 4. Range 7/14/30 + localStorage (R25 sang js/upcoming.js — extraction 36)
  const upcomingMod = readRequiredAsset('js/upcoming.js');
  assert.match(upcomingMod, /let upcomingRange = 14;/);
  assert.match(upcomingMod, /UPCOMING_RANGE_KEY = 'planner-upcoming-range'/);
  assert.match(upcomingMod, /r === 7 \|\| r === 14 \|\| r === 30/);
  assert.match(APP_JS, /act === 'upcoming-range'/);
  // 5. Đọc task xuyên tháng: monthStateRaw không tạo state mới; task tháng khác mở drawer được
  assert.match(upcomingMod, /function tasksForDate\(dt\)/);
  assert.match(APP_JS, /monthStateRaw\(y, m\)/);
  assert.match(upcomingMod, /function upcomingCollect\(\)/);
  assert.match(upcomingMod, /function upcomingTaskRowHTML\(r\)/);
  assert.match(upcomingMod, /function renderUpcoming\(\)/);
  assert.match(APP_JS, /taskDetailRef = \{ y: y === undefined \? PLAN_YEAR : y,/);
  assert.match(APP_JS, /openTaskDetail\(\+el\.dataset\.week, \+el\.dataset\.day, \+el\.dataset\.task,/);
  assert.match(APP_JS, /saveMonthState\(tY, tM, st\)/);
  // 6. i18n keys đủ vi+en
  assert.match(I18N_JS, /tabUpcoming: 'Sắp tới'/);
  assert.match(I18N_JS, /tabUpcoming: 'Upcoming'/);
  assert.match(I18N_JS, /upcomingOverdue:/);
  assert.match(I18N_JS, /upcomingRange7:/);
  assert.match(I18N_JS, /upcomingEmpty:/);
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

test('V2 segmented control: shared capsule primitive + stable render shells', () => {
  // 1. Shared geometry in styles.css (source of truth) — .up-range aliased for 7/14/30.
  const styles = readRequiredAsset('css/styles.css');
  assert.match(styles, /\.segmented,\s*\.up-range\s*{/);
  assert.match(styles, /\.segmented-item,\s*\.up-range-btn\s*{/);
  assert.match(styles, /\.segmented-item\.active,\s*\.up-range-btn\.active\s*{/);
  assert.match(styles, /\.segmented--accent\s*\.segmented-item\.active\s*{/);
  // no leftover square-active rules for calendar/projects (was border-radius: 0 + clip)
  assert.doesNotMatch(styles, /\.cal-mode-toggle\s*\.pop-btn\s*{/);
  assert.doesNotMatch(styles, /\.pj-filter\s*{/);
  // 2. Calendar: shell built once, toggle uses the primitive, content region swapped.
  assert.match(APP_JS, /function ensureCalendarShell\(\)/);
  assert.match(APP_JS, /function syncCalendarShell\(page\)/);
  assert.match(APP_JS, /cal-mode-toggle segmented segmented--accent/);
  assert.match(APP_JS, /data-role="cal-content"/);
  assert.match(APP_JS, /data-role="cal-legend"/);
  assert.doesNotMatch(APP_JS, /class="pop-btn\$\{calendarMode/);
  // 3. Projects: shell + content-only updates on filter change.
  const PJ = readFileSync(path.join(ROOT, 'js/projects-ui.js'), 'utf8');
  assert.match(PJ, /function ensureProjectsShell\(root, f\)/);
  assert.match(PJ, /pj-filters segmented segmented--accent/);
  assert.match(PJ, /data-role="pj-content"/);
  assert.doesNotMatch(PJ, /class="pj-filter\b/);
  // 4. Upcoming 7/14/30 migrated onto the primitive (no visual change).
  const UP = readFileSync(path.join(ROOT, 'js/upcoming.js'), 'utf8');
  assert.match(UP, /class="up-range segmented"/);
  assert.match(UP, /up-range-btn segmented-item/);
});

test('Schedule semantic colors: Time Blocking uses defined tokens and hides an empty legend without collapsing layout', () => {
  const styles = readRequiredAsset('css/styles.css');
  const start = styles.indexOf('/* ===== Time Blocking UI');
  const end = styles.indexOf('/* V1.4', start);
  assert.notEqual(start, -1, 'Time Blocking source section must exist');
  assert.notEqual(end, -1, 'Time Blocking source section must have a feature boundary');
  const timeBlocking = styles.slice(start, end);

  for (const legacy of ['--surface', '--surface-soft', '--text', '--text-strong', '--text-faint', '--border-soft', '--border-faint', '--accent', '--sage', '--warn-text', '--warn-soft']) {
    assert.doesNotMatch(timeBlocking, new RegExp(`var\\(${legacy}(?=[,)])`));
  }
  assert.doesNotMatch(timeBlocking, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'Time Blocking must not contain hard-coded color literals');
  assert.equal(timeBlocking.trim(), readRequiredAsset('css/_v12-timeblocks-ui.css').trim(), 'Time Blocking sources must remain exact copies');

  assert.match(timeBlocking, /\.tb-day \.tb-day-wd\s*{[^}]*color:\s*var\(--color-text-secondary\)/s);
  assert.match(timeBlocking, /\.tb-day \.tb-day-n\s*{[^}]*color:\s*var\(--color-text\)/s);
  assert.match(timeBlocking, /\.tb-day\.muted \.tb-day-wd,[^{]*\.tb-day\.muted \.tb-day-n\s*{[^}]*color:\s*var\(--color-text-muted\)/s);
  assert.doesNotMatch(timeBlocking, /\.tb-day(?: \.tb-day-wd|\.muted)\s*{[^}]*opacity:/s);
  assert.doesNotMatch(timeBlocking, /\.tb-block\.tb-status-(?:completed|cancelled)\s*{[^}]*opacity:/s);
  assert.match(timeBlocking, /\.tb-block-status\s*{[^}]*color:\s*var\(--color-text-secondary\)/s);
  assert.match(timeBlocking, /\.tb-block\.tb-status-completed \.tb-block-status\s*{[^}]*color:\s*var\(--color-positive\)/s);
  assert.match(timeBlocking, /\.tb-block\.tb-status-cancelled \.tb-block-(?:time|text),/s);
  assert.doesNotMatch(timeBlocking, /\.tb-block-status\s*{[^}]*opacity:/s);
  assert.doesNotMatch(timeBlocking, /\.td-tb-row\.cancelled\s*{[^}]*opacity:/s);
  assert.match(timeBlocking, /\.td-tb-row\.completed \.td-tb-status\s*{[^}]*color:\s*var\(--color-positive\)/s);
  assert.match(timeBlocking, /\.td-tb-row\.cancelled \.td-tb-(?:time|date),/s);
  assert.match(styles, /\.calendar-page \.cal-legend:empty\s*{/);
  assert.match(styles, /\.calendar-page \.cal-legend:empty\s*{[^}]*visibility:\s*hidden/s);
  assert.doesNotMatch(styles, /\.calendar-page \.cal-legend:empty[^}]*display:\s*none/s);
  assert.match(styles, /\.tb-act\.gcal-export:hover\s*{[^}]*var\(--color-accent-soft\)/s);
  assert.match(styles, /\.gcal-exported\s*{[^}]*color:\s*var\(--color-positive\)/s);
  assert.match(timeBlocking, /\.tb-uns-btn\s*{[^}]*min-height:\s*24px/s);
  assert.match(timeBlocking, /\.tb-uns-toggle\s*{[^}]*min-height:\s*24px/s);
  assert.match(timeBlocking, /\.tb-unscheduled\s*{[^}]*background:\s*var\(--color-surface-muted\)/s);
  assert.match(timeBlocking, /\.tb-uns-btn\s*{[^}]*border-color:\s*var\(--color-control-border\)/s);
  assert.match(timeBlocking, /\.tb-block\.tb-status-completed\s*{[^}]*border-left-color:\s*var\(--color-positive\)/s);
  assert.match(timeBlocking, /\.tb-block\.tb-status-cancelled\s*{[^}]*border-left-color:\s*var\(--color-text-muted\)/s);
});

test('Schedule contrast audit freezes Date before every audited app context', () => {
  const audit = readRequiredAsset('scripts/audit-dark-contrast.py');
  assert.match(audit, /FIXED_LOCAL_ISO\s*=\s*"2026-08-15T10:00:00"/);
  assert.match(audit, /FIXED_DATE_SCRIPT\s*=/);
  assert.match(audit, /new Proxy\(RealDate/);
  assert.match(audit, /prop === 'now'/);
  assert.match(audit, /def freeze_browser_date\(page\):/);
  assert.ok((audit.match(/freeze_browser_date\(page\)/g) || []).length >= 3,
    'helper plus both audited app contexts must freeze Date');
  assert.match(audit, /page\.add_init_script\(FIXED_DATE_SCRIPT \+ seed_script\)/);
});

test('Phase 3: Inbox — nav item, view section, capture flow and schedule keeping uid', () => {
  // 1. Nav: tab Inbox trong buildNav + navAttributes + MAIN group + mobile bỏ inbox
  assert.match(APP_JS, /view: 'inbox', icon: 'inbox'/);
  assert.match(APP_JS, /inbox: 'data-nav-view=\"inbox\" data-view=\"inbox\"'/);
  assert.match(APP_JS, /byView\.today, byView\.inbox, byView\.upcoming/);
  // P2 redesign: bottom nav mobile = Today/Upcoming/+/Habits/More; inbox + week nằm trong
  // More sheet (Upcoming là tab chính — không còn trong sheet)
  assert.match(APP_JS, /MORE_SHEET_VIEWS\.map\(\(v\) => byView\[v\]\)/);
  // 2. View section trong app.html + Inbox reachable qua sidebar (JS) và More sheet mobile (P2/P4)
  assert.match(APP, /id="view-inbox"/);
  assert.match(APP, /data-i18n-aria=\"viewInbox\"/);
  assert.match(APP_JS, /MORE_SHEET_VIEWS\.map\(\(v\) => byView\[v\]\)/);
  // 3. setView dispatch có nhánh inbox + deeplink chấp nhận
  assert.match(APP_JS, /view === 'inbox'/);
  assert.match(APP_JS, /renderInbox\(inbox\)/);
  const DEEPLINK_INBOX = readFileSync(path.join(ROOT, 'js/deeplink.js'), 'utf8');
  assert.match(DEEPLINK_INBOX, /view === 'inbox'/);
  // 4. Bộ nhớ inbox riêng (planner-inbox) — không phụ thuộc tháng; logic tách sang js/inbox.js
  assert.match(INBOX_JS, /INBOX_KEY = 'planner-inbox'/);
  assert.match(INBOX_JS, /function loadInbox\(\)/);
  assert.match(INBOX_JS, /function saveInbox\(inbox\)/);
  // 5. Capture + schedule: add task, schedule giữ uid, move today/tomorrow/date
  assert.match(INBOX_JS, /function addInboxTask\(inbox\)/);
  assert.match(INBOX_JS, /function scheduleInboxTask\(inbox, i, dt\)/);
  assert.match(INBOX_JS, /inbox\.splice\(i, 1\)/);
  assert.match(INBOX_JS, /inbox: true/);
  assert.match(INBOX_JS, /act === 'inbox-today'/);
  assert.match(INBOX_JS, /act === 'inbox-tomorrow'/);
  assert.match(INBOX_JS, /act === 'inbox-date-schedule'/);
  assert.match(INBOX_JS, /act === 'inbox-del'/);
  // app.js ủy quyền sang module (alias destructure + dispatch inbox-*)
  assert.match(APP_JS, /const \{ loadInbox, saveInbox, renderInbox, inboxTargetForDate, handleInboxAction \} = window\.TaskFlowInbox;/);
  assert.match(APP_JS, /handleInboxAction\(act, el, inbox\)/);
  // 6. Drawer scope inbox: mở + sửa + xoá + focus từ Inbox
  assert.match(APP_JS, /function openInboxTaskDetail\(i\)/);
  assert.match(APP_JS, /taskDetailRef\.scope === 'inbox'/);
  assert.match(APP_JS, /data-scope=\"inbox\"/);
  assert.match(APP_JS, /taskDetailRef\.scope === 'inbox'\) \{\s*inbox\.splice/s);
  assert.match(readRequiredAsset('js/focus.js'), /focusTaskRef\.scope === 'inbox'/);
  // 7. i18n keys đủ vi+en
  assert.match(I18N_JS, /tabInbox: 'Inbox'/);
  assert.match(I18N_JS, /inboxEyebrow:/);
  assert.match(I18N_JS, /inboxEmpty:/);
  assert.match(I18N_JS, /inboxScheduleBtn:/);
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
  // 2. Mở/đóng + Enter submit + Escape (dialog layer tự đóng) — P11 extraction 23:
  // openQuickAdd/closeQuickAdd/submitQuickAdd nằm trong js/quick-add.js, app.js giữ
  // call-sites (keydown Enter, dispatcher quickadd-*, phím tắt q, outside-click).
  const QA_JS = readRequiredAsset('js/quick-add.js');
  assert.match(QA_JS, /function openQuickAdd\(\)/);
  assert.match(QA_JS, /function closeQuickAdd\(\)/);
  assert.match(QA_JS, /function submitQuickAdd\(\)/);
  assert.match(APP_JS, /id === 'quickAddInput'/);
  assert.match(APP_JS, /act === 'quickadd-close'/);
  assert.match(APP_JS, /act === 'quickadd-do'/);
  // 3. Target theo ngữ cảnh view: inbox/day/week/today
  assert.match(QA_JS, /function quickAddDefaultTarget\(\)/);
  assert.match(QA_JS, /state\.view === 'inbox'/);
  assert.match(QA_JS, /state\.view === 'day'/);
  assert.match(QA_JS, /state\.view === 'week'/);
  // 4. Nút Thêm công việc (shell-add-task) mở Quick Add — KHÔNG còn chuyển sang Week (lazy qua runLazyModule)
  assert.match(APP_JS, /act === 'shell-add-task'\).*runLazyModule\('js\/quick-add\.min\.js', \(\) => window\.TaskFlowQuickAdd\.openQuickAdd\(\)\)/s);
  assert.match(APP_JS, /if \(k === 'q'\)\s*\{\s*e\.preventDefault\(\);\s*runLazyModule\('js\/quick-add\.min\.js', \(\) => window\.TaskFlowQuickAdd\.openQuickAdd\(\)\)/s);
  // 5. Dùng chung logic đặt task: pushTaskToDate (không duplicate, js/upcoming.js) + inbox scope
  assert.match(readRequiredAsset('js/upcoming.js'), /function pushTaskToDate\(tk, dt\)/);
  assert.match(QA_JS, /tk\.inbox = true;/);
  assert.match(QA_JS, /renderCurrentView\(\);/);
  // 6. i18n keys đủ vi+en
  assert.match(I18N_JS, /quickAddTitle: 'Thêm công việc nhanh'/);
  assert.match(I18N_JS, /quickAddTitle: 'Quick Add'/);
  assert.match(I18N_JS, /quickAddPh:/);
  assert.match(I18N_JS, /quickAddInbox:/);
  // 7. CSS
  const qaStyles = readRequiredAsset('css/styles.css');
  assert.match(qaStyles, /\.quickadd-card\s*{/);
  assert.match(qaStyles, /\.quickadd-fields\s*{/);
  // P8: note theo context date (day/week view ngày khác → "ngày đã chọn") + hidden field thật sự ẩn
  assert.match(QA_JS, /quickAddTarget\.dt && localISODate\(quickAddTarget\.dt\) === localISODate\(new Date\(\)\)/);
  assert.match(qaStyles, /\.pop-field\[hidden\]\s*\{\s*display: none;?\s*}/);
  // P8: CTA "Tạo thói quen" từ empty states + handler focus input
  assert.match(I18N_JS, /emptyAddHabit: 'Tạo thói quen'/);
  assert.match(I18N_JS, /emptyAddHabit: 'Create a habit'/);
  assert.match(APP_JS, /act === 'habit-focus'/);
  assert.ok(APP_JS.includes('[data-role="habit-name-input"]'), 'habit-focus targets habit input');
  // P8: inbox không còn duplicate CTA — nút ＋ Thêm việc chỉ render khi có list
  assert.match(INBOX_JS, /\$\{inbox\.length \? `<button type=\"button\" class=\"btn-add-today\"/);
});

test('Phase 9: PWA manifest shortcuts, screenshots, and notification deep-link', () => {
  const manifest = JSON.parse(readRequiredAsset('manifest.json'));
  assert.equal(manifest.name, 'TaskFlow');
  assert.equal(manifest.short_name, 'TaskFlow');
  // P0.2: description phải phản ánh offline-first + optional cloud sync, KHÔNG còn claim "Offline 100%"
  assert.match(manifest.description, /offline-first/);
  assert.doesNotMatch(manifest.description, /Offline 100%/);
  assert.equal(manifest.start_url, './app');
  assert.equal(manifest.display, 'standalone');
  // 3 shortcuts theo spec: Hôm nay / Thêm công việc / Tuần này (+ giữ Tháng/Năm)
  const urls = manifest.shortcuts.map((s) => s.url);
  assert.ok(urls.includes('./app?view=today'), 'Hôm nay shortcut');
  assert.ok(urls.includes('./app?view=today&quick=1'), 'Thêm việc shortcut opens Quick Add');
  assert.ok(urls.includes('./app?view=week'), 'Tuần này shortcut');
  assert.ok(manifest.shortcuts.every((s) => s.name && s.url), 'all shortcuts have name+url');
  // screenshots present for install UX
  assert.ok(Array.isArray(manifest.screenshots) && manifest.screenshots.length >= 1);
  assert.match(manifest.screenshots[0].src, /\.png$/);
  // icons intact
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  // notificationclick deep-links into app, NOT landing
  assert.match(SW, /notificationclick/);
  assert.match(SW, /APP_URL = '\.\/app\?view=today'/);
  assert.doesNotMatch(SW, /openWindow\(''\)/);
  assert.match(SW, /p === '\/app' \|\| p === '\/app\.html'/);
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
  // P10: reflection widgets dùng h3 (hết skip h2→h4 ở week view); tất cả ref-title h3
  assert.doesNotMatch(APP_JS, /<h[24] class="ref-title">\$\{t\('refTitle'\)\}/);
  assert.match(APP_JS, /<h3 class="ref-title">\$\{t\('refTitle'\)\}<\/h3>/);
  assert.doesNotMatch(APP_JS, /<h4 class="ref-title">/);
  // 3. Layer system đã có: Escape đóng + focus trap + toast aria-live (không hồi quy)
  assert.match(UI_JS, /key === 'Escape'/);
  assert.match(UI_JS, /setAttribute\('role', kindOk === 'error' \? 'alert' : 'status'\)/);
  // P10: task menu ⋯ keyboard — mở bằng bàn phím focus menuitem đầu + Arrow điều hướng + Escape trả focus
  assert.match(APP_JS, /if \(e\.detail === 0\)\s*\{[^}]*first\.focus\(\)/s);
  assert.match(APP_JS, /e\.key === 'ArrowDown' \|\| e\.key === 'ArrowUp' \|\| e\.key === 'Home' \|\| e\.key === 'End'/);
  assert.match(APP_JS, /items\[i\]\.focus\(\)/);
  assert.match(APP_JS, /trigger\.focus\(\)/);
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
  // Nunito self-host — CSP không cần Google Fonts domains (P1.3 removed them)
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(csp, /fonts\.googleapis\.com/);
  assert.doesNotMatch(csp, /fonts\.gstatic\.com/);
  // sync tới backend Render
  assert.match(csp, /connect-src 'self' https:\/\/todoist-m3c7\.onrender\.com/);
  // analytics đang tắt (GA4 placeholder) — không được phép origin analytics
  assert.doesNotMatch(csp, /googletagmanager\.com/);
  assert.doesNotMatch(csp, /google-analytics\.com/);
  assert.doesNotMatch(csp, /doubleclick\.net/);
});

test('Phase 16: perf — debounce search + save-on-type + content-visibility upcoming', () => {
  // 1. Search không chạy runSearch mỗi keystroke — debounce 200ms
  assert.match(APP_JS, /searchDebounceTimer/);
  assert.match(APP_JS, /t\.id === 'searchInput'\).*setTimeout\(\(\) => runLazyModule\('js\/search\.min\.js', \(\) => window\.TaskFlowSearch\.renderSearchResults\(t\.value\)\), 200\)/s);
  // 2. Gõ text không serialize toàn bộ state mỗi phím — saveSoon/saveYearSoon/saveInboxSoon/saveTaskDetailStateSoon
  assert.match(APP_JS, /function saveSoon\(\) \{[\s\S]*?setTimeout\(save, 350\)/);
  assert.match(APP_JS, /function saveYearSoon\(\) \{[\s\S]*?setTimeout\(saveYear, 350\)/);
  assert.match(APP_JS, /function saveInboxSoon\(\) \{[\s\S]*?setTimeout\(\(\) => saveInbox\(inbox\), 350\)/);
  assert.match(APP_JS, /function saveTaskDetailStateSoon\(\) \{[\s\S]*?setTimeout\(saveTaskDetailState, 350\)/);
  // text-editing paths dùng bản debounce (không gọi save() trực tiếp)
  assert.match(APP_JS, /t\.dataset\.role === 'task-text'\).*saveSoon\(\)/s);
  assert.match(APP_JS, /t\.dataset\.role === 'inbox-text'[\s\S]*?saveInboxSoon\(\)/);
  assert.match(APP_JS, /t\.dataset\.role === 'td-text'[\s\S]*?saveTaskDetailStateSoon\(\)/);
  // 3. Flush trước khi đổi tháng + khi rời trang — không mất keystroke cuối
  assert.match(APP_JS, /function flushPendingSaves\(\) \{/);
  assert.match(APP_JS, /function openMonth\(m\) \{[\s\S]*?flushPendingSaves\(\)/);
  assert.match(APP_JS, /addEventListener\('pagehide', flushPendingSaves\)/);
  // 4. Upcoming với dữ liệu lớn — content-visibility bỏ render ngoài viewport
  const STYLES16 = readRequiredAsset('css/styles.css');
  assert.match(STYLES16, /\.up-group \{[\s\S]*?content-visibility: auto;[\s\S]*?contain-intrinsic-size: auto 120px;/);
});

test('Phase 18: reports — week vs last week comparison block', () => {
  // R15 (extraction 35): report UI sang js/report-ui.js (window.TaskFlowReportUI)
  const reportMod = readRequiredAsset('js/report-ui.js');
  // 1. lastWeekReportData xử lý cả tuần 1 của tháng (lấy tuần cuối tháng trước)
  assert.match(reportMod, /function lastWeekReportData\(\) \{/);
  assert.match(reportMod, /function lastWeekReportData\(\)[\s\S]*?window\.PlanMath[\s\S]*?prevMonth[\s\S]*?monthStateRaw/);
  assert.match(reportMod, /function lastWeekReportData\(\)[\s\S]*?dayAggregateAt\(srcY, srcM, gi\)/);
  // focus xuyên tháng theo grid ps.start (không lấy 7 ngày dương lịch cuối — sai cửa sổ)
  assert.match(reportMod, /function lastWeekReportData\(\)[\s\S]*?gridStart \+ gi \* 86400000/);
  // tuần trước trống rỗng → ẩn block
  assert.match(reportMod, /if \(out\.total === 0 && out\.habitAvg === 0 && out\.focus === 0\) return null;/);
  // 2. vsCell + block hiển thị trong week report
  assert.match(reportMod, /function vsCell\(label, curText, diff, unit\)/);
  assert.match(reportMod, /const vsBlock = lw \?/);
  assert.match(reportMod, /report-vs-grid[\s\S]*?vsCell\(t\('reportVsGoal'\)/);
  assert.match(reportMod, /vsCell\(t\('reportVsFocus'\)/);
  // 3. i18n cả 2 ngôn ngữ
  assert.match(I18N_JS, /reportVsTitle: 'So với tuần trước'/);
  assert.match(I18N_JS, /reportVsTitle: 'vs last week'/);
  assert.ok((I18N_JS.match(/reportVsGoal:/g) || []).length >= 2, 'reportVsGoal defined for VI+EN');
  // 4. CSS block + responsive 2 cột mobile
  const STYLES18 = readRequiredAsset('css/styles.css');
  assert.match(STYLES18, /\.report-vs \{[\s\S]*?border-radius: 14px;/);
  assert.match(STYLES18, /\.vs-up \{[\s\S]*?color: #1E7A46;/);
  assert.match(STYLES18, /\.vs-down \{[\s\S]*?color: #B03A2E;/);
  // dark mode override cho chips
  assert.match(STYLES18, /:root\[data-dark="true"\] \.vs-up \{[\s\S]*?color: #7ED9A0;/);
  assert.match(STYLES18, /@media \(max-width: 640px\) \{[\s\S]*?\.report-vs-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
});

test('Phase 19: e2e stability — stable data-testid hooks, no .active in scripts', () => {
  // View sections đều có data-testid ổn định
  for (const [id, tid] of [
    ['view-today', 'today-view'], ['view-upcoming', 'upcoming-view'], ['view-inbox', 'inbox-view'],
    ['view-overview', 'overview-view'], ['view-week', 'week-view'], ['view-year', 'year-view'],
    ['view-calendar', 'calendar-view'], ['view-day', 'day-view'],
  ]) {
    assert.match(APP, new RegExp(`id="${id}"[^>]*data-testid="${tid}"`), `${id} → ${tid}`);
  }
  // Các modal/drawer chính có data-testid
  for (const [id, tid] of [
    ['quickAddModal', 'quick-add'], ['searchModal', 'search-modal'], ['toolsDrawer', 'tools-drawer'],
    ['taskDrawer', 'task-drawer'], ['pomoPanel', 'pomo-panel'], ['focusOverlay', 'focus-overlay'],
    ['syncModal', 'sync-modal'], ['reportModal', 'report-modal'], ['weekReportModal', 'week-report-modal'],
    ['yearReportModal', 'year-report-modal'], ['widgetSettingsModal', 'widget-settings-modal'],
    ['toastRegion', 'toast-region'],
  ]) {
    assert.match(APP, new RegExp(`id="${id}"[^>]*data-testid="${tid}"`), `${id} → ${tid}`);
  }
  // Task row động có data-testid="task-row" (taskRowHTML sang js/today.js)
  assert.match(readRequiredAsset('js/today.js'), /<div class="task-row[^>]*data-testid="task-row"/);
  // E2E scripts không còn phụ thuộc .active làm selector chính
  const SMOKE = readRequiredAsset('scripts/e2e-smoke.py');
  const FRONT = readRequiredAsset('scripts/e2e-frontend.py');
  assert.doesNotMatch(SMOKE, /wait_for_selector\("#view-[a-z]+[^)]*\.active"/);
  assert.doesNotMatch(FRONT, /wait_for_selector\(f?"#view-\{?\w+\}?\.active/);
  assert.match(SMOKE, /data-testid="(quick-add|week-view)"/);
  assert.match(FRONT, /data-testid="(overview-view|focus-overlay)"/);
  // Remind test dùng data-testid thay XPath contains(@class,'task-row')
  assert.doesNotMatch(FRONT, /contains\(@class,'task-row'\)/);
  assert.match(FRONT, /ancestor::div\[@data-testid='task-row'\]/);
});

test('Phase 20: sidebar collapsed — chặn horizontal overflow, tooltip portal + aria-label', () => {
  const SHELL = readRequiredAsset('css/app-shell.css');
  // 1. Scroll container giữ vertical scrolling, chặn scroll ngang
  assert.match(SHELL, /\.app-sidebar\s*{[^}]*overflow-y:\s*auto[^}]*overflow-x:\s*hidden/s);
  // 2. ::after tooltip tắt hẳn khi collapsed — không còn pseudo-element vượt mép phải sidebar
  assert.match(SHELL, /\.app-layout\.sidebar-collapsed\s+\[data-tooltip\]::after\s*{[^}]*display:\s*none/s);
  // 3. Tooltip portal: layer position:fixed ngoài scroll container, không bị cắt bởi overflow
  assert.match(SHELL, /\.app-tooltip-layer\s*{[^}]*position:\s*fixed[^}]*pointer-events:\s*none/s);
  assert.match(SHELL, /\.app-tooltip-layer\.visible\s*{[^}]*opacity:\s*1/s);
  // 4. JS portal: layer + getBoundingClientRect + delegation pointerover/focusin (a11y keyboard)
  assert.match(APP_JS, /function sidebarTooltipLayer\(/);
  assert.match(APP_JS, /function showSidebarTooltip\(/);
  assert.match(APP_JS, /getBoundingClientRect\(\)/);
  assert.match(APP_JS, /addEventListener\('pointerover'/);
  assert.match(APP_JS, /addEventListener\('focusin'/);
  // 5. A11y: nav items có aria-label — tên truy cập không phụ thuộc tooltip CSS khi collapsed
  assert.match(APP_JS, /data-tooltip="\$\{esc\(item\.label\)\}" aria-label="\$\{esc\(item\.label\)\}"/);
  assert.match(APP_JS, /data-tooltip="\$\{esc\(label\)\}" aria-label="\$\{esc\(label\)\}"/);
});

test('Phase 21: inbox e2e data-testid hooks + notification deep-link routing', () => {
  // 1. Inbox dynamic rows có hook ổn định (không phụ thuộc class/role)
  assert.match(INBOX_JS, /data-testid="inbox-task-row"/);
  assert.match(INBOX_JS, /class="inbox-task-row[^"]*" data-testid="inbox-task-row"/);
  // 2. CTA add có hook — cả empty state (qua attrs) lẫn nút dưới danh sách
  assert.match(INBOX_JS, /attrs: 'data-testid="inbox-add"'/);
  assert.match(INBOX_JS, /data-action="inbox-add" data-testid="inbox-add"/);
  // 3. e2e-frontend có inbox_checks + deeplink_checks, dùng data-testid không phải .active
  const FRONT21 = readRequiredAsset('scripts/e2e-frontend.py');
  assert.match(FRONT21, /def inbox_checks\(/);
  assert.match(FRONT21, /def deeplink_checks\(/);
  assert.match(FRONT21, /\[data-testid="inbox-view"\] \.upcoming-page/);
  assert.match(FRONT21, /data-testid="inbox-task-row"/);
  assert.match(FRONT21, /\("inbox", inbox_checks\)/);
  assert.match(FRONT21, /\("deeplink", deeplink_checks\)/);
  assert.match(FRONT21, /\/app\?view=today/);
  // deeplink_checks boots every manifest shortcut: week/overview/year + today/quick
  assert.match(FRONT21, /for view in \("week", "overview", "year"\):/);
  assert.match(FRONT21, /app\?view=\{view\}/);
  assert.match(FRONT21, /\[data-testid="\{view\}-view"\] h1/);
  // 4. SW notification click vẫn deep-link vào app (không về landing)
  const SW21 = readRequiredAsset('sw.js');
  assert.match(SW21, /notificationclick/);
  assert.match(SW21, /APP_URL = '\.\/app\?view=today'/);
  assert.doesNotMatch(SW21, /openWindow\('\/\)/);
  // 5. Deep-link parser chấp nhận inbox + quick=1 (shortcut "Thêm việc")
  assert.match(DEEPLINK_JS, /view === 'inbox'/);
  assert.match(DEEPLINK_JS, /out\.quick = url\.searchParams\.get\('quick'\) === '1'/);
});

test('Phase 22: P0.2 e2e hardening — task-detail flow, extended viewports, real bug fixes', () => {
  const FRONT22 = readRequiredAsset('scripts/e2e-frontend.py');
  // 1. Task-detail scenario exists and is wired into the --all matrix + --view CLI
  assert.match(FRONT22, /def taskdetail_checks\(/);
  assert.match(FRONT22, /\("taskdetail", taskdetail_checks\)/);
  assert.match(FRONT22, /"taskdetail"/); // --view choice
  assert.match(FRONT22, /taskdetail_checks\(browser, base, 1440, 900, errors, shots\["desktop"\]\)/);
  // 2. Viewport matrix covers small mobile 360x800 and desktop large 1920x1080
  assert.match(FRONT22, /\(360, 800\), \(390, 844\), \(768, 1024\), \(1440, 900\), \(1920, 1080\)/);
  // 3. Stable hooks the scenario drives exist (data-action fields in the drawer)
  assert.match(FRONT22, /data-action="td-prio"/);
  assert.match(FRONT22, /data-action="td-duration"/);
  assert.match(FRONT22, /data-action="td-repeat"/);
  assert.match(FRONT22, /data-role="td-subtask-input"/);
  assert.match(FRONT22, /data-role="td-tag-input"/);
  assert.match(FRONT22, /expect_download\(\)/);
  assert.match(FRONT22, /taskflow-todoist-backup-/);
  // 4. P0.2 bug fix 1: td-prio now has a dispatcher handler (priority edit persisted)
  assert.match(APP_JS, /} else if \(act === 'td-prio'\) \{/);
  assert.match(APP_JS, /g\.tk\.kind = el\.checked \? 'priority' : 'regular';/);
  assert.match(APP_JS, /'td-prio'\]/); // in UNDOABLE_ACTS
  // 5. P0.2 bug fix 2: delete-toast Undo button must be clickable (pointer-events auto)
  const COMPONENTS_CSS = readRequiredAsset('css/components.css');
  assert.match(COMPONENTS_CSS, /\.toast \{[\s\S]*?pointer-events: auto;/);
});

test('P0: Tools drawer / More sheet close cleanup is idempotent (no stale body scroll-lock)', () => {
  // 1. The early returns that skipped body-class cleanup are gone from both closers.
  assert.doesNotMatch(APP_JS, /if \(!drawer \|\| drawer\.hidden\) return;/);
  assert.doesNotMatch(APP_JS, /if \(!sheet \|\| sheet\.hidden\) return;/);
  // 2. Body scroll-lock removal must run BEFORE the wasOpen gate in closeToolsDrawer.
  const closer = (APP_JS.match(/function closeToolsDrawer\(\) \{[\s\S]*?\n\}/) || [''])[0];
  assert.ok(closer.length > 100, 'closeToolsDrawer body must be present');
  const cleanupIdx = closer.indexOf("classList.remove('tools-drawer-open')");
  const gateIdx = closer.indexOf('const wasOpen');
  assert.ok(cleanupIdx >= 0 && gateIdx > cleanupIdx,
    'body.tools-drawer-open removal must run before the wasOpen gate');
  assert.match(closer, /if \(drawer\) TaskFlowUI\.closeDrawer\('toolsDrawer'\);/);
  // 3. Defensive reconciliation at boot + on BFCache restore (pageshow).
  assert.match(APP_JS, /function reconcileOverlayScrollLocks\(\)/);
  assert.match(APP_JS, /reconcileOverlayScrollLocks\(\);/);
  assert.match(APP_JS, /addEventListener\('pageshow', reconcileOverlayScrollLocks\)/);
  // 4. More-sheet closer mirrors the idempotent pattern (same body scroll-lock class).
  const sheetCloser = (APP_JS.match(/function closeMoreSheet\(\) \{[\s\S]*?\n\}/) || [''])[0];
  assert.match(sheetCloser, /classList\.remove\('more-sheet-open'\)/);
  assert.match(sheetCloser, /if \(sheet\) TaskFlowUI\.closeDrawer\('moreSheet'\);/);
});

test('gcal pending-refresh state machine: Month defers to Schedule entry, one fetch only', () => {
  // V2 hardening — edge case: quay lại tab lúc đang ở Month → không fetch ngay,
  // đánh dấu pending; Month → Schedule render cache ngay + fetch nền đúng 1 lần.
  assert.match(APP_JS, /let gcalRefreshPending = false;/);
  assert.match(APP_JS, /async function gcalVisibilityRefresh\(\)/);
  assert.match(APP_JS, /function gcalConsumePendingRefresh\(\)/);
  // Month (non-schedule) branch chỉ mark pending — không fetch.
  const vis = (APP_JS.match(/function gcalVisibilityRefresh\(\) \{[\s\S]*?\n\}/) || [''])[0];
  assert.ok(vis.length > 200, 'gcalVisibilityRefresh body must be present');
  // Nhánh else (Month/không schedule) chỉ mark pending — KHÔNG fetch.
  const elseBranch = vis.slice(vis.indexOf('} else {'));
  assert.match(elseBranch, /gcalRefreshPending = true;/);
  assert.doesNotMatch(elseBranch, /gcalFetchMonthEvents/,
    'Month branch phải KHÔNG fetch ngay');
  // Schedule entry: render cache trước (skipGcalRefresh), rồi consume pending.
  assert.match(APP_JS, /renderCalendarSchedule\(true\);/);
  assert.match(APP_JS, /gcalConsumePendingRefresh\(\);/);
  // Cooldown 60s được giữ nguyên.
  assert.match(APP_JS, /GCAL_VISIBLE_COOLDOWN_MS = 60 \* 1000/);
  // Disconnect phải xoá pending.
  const disc = (APP_JS.match(/async function disconnectGcal\(\) \{[\s\S]*?\n\}/) || [''])[0];
  assert.match(disc, /gcalRefreshPending = false;/);
});
