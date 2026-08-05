import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import UI from '../js/ui.js';
import DeepLink from '../js/deeplink.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const SYNC_JS = readFileSync(path.join(ROOT, 'js/sync.js'), 'utf8');
const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

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
  assert.match(SW, /const CACHE = 'taskflow-v46';/);
  assert.match(SW, /['"]\.\/js\/ui\.js['"]/);
});
