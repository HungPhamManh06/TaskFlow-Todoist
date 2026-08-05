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

test('navigation renderer synchronizes every desktop and mobile destination', () => {
  assert.match(APP_JS, /querySelectorAll\('\[data-nav-view\]'\)/);
  assert.match(APP_JS, /setAttribute\('aria-current',\s*active\s*\?\s*'page'\s*:\s*'false'\)/);
  assert.match(APP_JS, /setAttribute\('aria-selected',\s*String\(active\)\)/);
  assert.match(APP_JS, /data-nav-view/);
  assert.doesNotMatch(APP_JS, /closest\('#navTabs \.tab'\)/);
});

test('tools drawer supports dismissal and focus restoration', () => {
  assert.match(APP_JS, /function openToolsDrawer\(/);
  assert.match(APP_JS, /function closeToolsDrawer\(/);
  assert.match(APP_JS, /toolsDrawerOpener\.focus\(\)/);
  assert.match(APP_JS, /e\.key === 'Escape'[\s\S]{0,240}closeToolsDrawer\(\)/);
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
    /TaskFlowUI\.syncUrl\(\{\s*view,\s*year:\s*PLAN_YEAR,\s*month:\s*PLAN_MONTH,\s*week:\s*view === 'week' \? state\.currentWeek : undefined,?\s*\}\);/
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
  assert.match(SW, /const CACHE = 'taskflow-v49';/);
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
  assert.match(components, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
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

test('design system assets are available in the v49 offline shell', () => {
  assert.match(SW, /const CACHE = 'taskflow-v49';/);
  [
    './css/tokens.css', './css/components.css', './css/app-shell.css',
    './icons/ui-sprite.svg', './js/ui.js',
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
    request: { method: 'GET', mode: 'cors', url: 'https://taskflow.test/css/tokens.css?v=1' },
    respondWith(promise) { responsePromise = promise; },
  });

  assert.equal(await responsePromise, cachedResponse);
  assert.equal(matchCalls.length, 1);
  assert.equal(matchCalls[0].options?.ignoreSearch, true);
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
