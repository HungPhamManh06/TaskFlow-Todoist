// TaskFlow — P1.2 bước 2: dictionary EN là chunk lazy (chỉ nạp ngôn ngữ đang dùng).
//
// js/i18n.js (VI + core) nằm trong bundle boot; js/i18n-en.js chỉ được nạp khi
// người dùng chọn EN (TaskFlowI18N.ensureLang). Test này chạy core trong một
// sandbox "giống trình duyệt" (node:vm, không có module/require) để kiểm đúng
// hành vi đó — thứ mà require() ở Node không thể hiện được (Node nạp EN đồng bộ
// để giữ hợp đồng I18N.en cho test cũ).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const CORE_SRC = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
const EN_SRC = readFileSync(new URL('../js/i18n-en.js', import.meta.url), 'utf8');
const SW_SRC = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const APP_HTML = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const APP_JS = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const LAZY_V = (SW_SRC.match(/const LAZY_V = '([^']+)'/) || [])[1];

/** Sandbox kiểu trình duyệt: có window/document/localStorage, KHÔNG có module/require. */
function browserSandbox({ lang = 'en', assetMap = null } = {}) {
  const store = { 'planner-lang': lang };
  const injected = [];
  const sandbox = {
    console,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: {
      head: { appendChild: (el) => injected.push(el) },
      documentElement: {},
      createElement: () => ({}),
    },
  };
  sandbox.window = sandbox;
  if (assetMap) sandbox.TaskFlowAssetMap = assetMap;
  const ctx = vm.createContext(sandbox);
  return { ctx, injected, store };
}

test('boot mặc định: VI nằm sẵn trong core, EN KHÔNG được nạp', async () => {
  const { ctx, injected } = browserSandbox({ lang: 'vi' });
  vm.runInContext(CORE_SRC, ctx);
  const api = ctx.TaskFlowI18N;
  assert.equal(api.getLang(), 'vi');
  assert.equal(api.I18N.en, null, 'EN không được có sẵn trong bundle boot');
  assert.equal(api.hasLang('vi'), true);
  assert.equal(api.t('navMonths'), 'Chuyển tháng trong năm');
  await api.ensureLang('vi');
  assert.equal(injected.length, 0, 'không được tải chunk EN cho người dùng VI');
});

test('ensureLang("en"): nạp đúng chunk, tự gắn I18N.en, chỉ nạp 1 lần', async () => {
  const { ctx, injected } = browserSandbox({ lang: 'en' });
  vm.runInContext(CORE_SRC, ctx);
  const api = ctx.TaskFlowI18N;

  assert.equal(api.getLang(), 'en');
  assert.equal(api.hasLang('en'), false, 'chưa có chunk → chưa có EN');
  // t() phải rơi về VI trong lúc chờ, không trả về key thô
  assert.equal(api.t('navMonths'), 'Chuyển tháng trong năm');

  const p1 = api.ensureLang('en');
  const p2 = api.ensureLang('en');
  assert.equal(injected.length, 1, 'chỉ 1 thẻ script cho 1 ngôn ngữ');
  assert.equal(injected[0].src, 'js/i18n-en.min.js?v=' + LAZY_V, 'source/dev: .min + pin khớp LAZY_V của sw.js');
  assert.equal(p1, p2, 'nhiều lời gọi song song dùng chung promise');
  void p2;

  vm.runInContext(EN_SRC, ctx); // "chunk đã về"
  injected[0].onload();
  assert.equal(await p1, true);
  assert.equal(api.hasLang('en'), true);
  assert.equal(api.t('navMonths'), 'Navigate months');
  assert.equal(api.I18N.en.navMonths, 'Navigate months');
});

test('dist: URL chunk lấy từ TaskFlowAssetMap (assets/<hash>.js)', () => {
  const { ctx, injected } = browserSandbox({
    lang: 'en',
    assetMap: { 'js/i18n-en.js': 'i18n-en.4f5f333e.js' },
  });
  vm.runInContext(CORE_SRC, ctx);
  ctx.TaskFlowI18N.ensureLang('en');
  assert.equal(injected[0].src, 'assets/i18n-en.4f5f333e.js', 'hash chính là pin trong dist');
});

test('lỗi mạng: promise resolve false, t() vẫn chạy (fallback VI) và cho phép thử lại', async () => {
  const { ctx, injected } = browserSandbox({ lang: 'en' });
  vm.runInContext(CORE_SRC, ctx);
  const api = ctx.TaskFlowI18N;

  const p = api.ensureLang('en');
  injected[0].onerror();
  assert.equal(await p, false);
  assert.equal(api.hasLang('en'), false);
  assert.equal(api.t('todayTxt'), 'Hôm nay', 'UI vẫn đọc được (bản VI), không vỡ vì thiếu chunk');
  assert.equal(api.t('khongCoKeyNay'), 'khongCoKeyNay', 'key lạ trả về chính key của nó');

  api.ensureLang('en');
  assert.equal(injected.length, 2, 'lần sau phải thử nạp lại (không cache lỗi)');
});

test('Node/test: EN nạp đồng bộ nên hợp đồng I18N.en cũ giữ nguyên', () => {
  const api = require('../js/i18n.js');
  assert.equal(api.hasLang('en'), true, 'Node luôn có I18N.en');
  assert.equal(api.I18N.en.navMonths, 'Navigate months');
  assert.equal(api.I18N.vi.navMonths, 'Chuyển tháng trong năm');
});

test('bất biến: version asset lazy khớp ở CẢ 3 nơi (app.js / i18n.js / sw.js)', () => {
  // Lỗi lớp "sửa asset lazy mà quên bump": SW vẫn phục vụ bản cũ từ cache-first, nên
  // bản sửa không tới được người dùng. Ba nơi phải luôn bằng nhau.
  const read = (src, re) => (src.match(re) || [])[1];
  const swV = read(SW_SRC, /const LAZY_V = '([^']+)'/);
  const appV = read(APP_JS, /const LAZY_ASSET_VERSION = '([^']+)'/);
  const i18nV = read(CORE_SRC, /const EN_ASSET_VERSION = '([^']+)'/);
  assert.ok(swV && appV && i18nV, `phải đọc được cả 3 version (sw=${swV}, app=${appV}, i18n=${i18nV})`);
  assert.equal(appV, swV, 'LAZY_ASSET_VERSION (app.js) phải khớp LAZY_V (sw.js)');
  assert.equal(i18nV, swV, 'EN_ASSET_VERSION (i18n.js) phải khớp LAZY_V (sw.js)');
  // Định dạng: các test khác đã chuyển sang pin-agnostic (`?v=\d+` / `taskflow-v\d+`),
  // nên phải chốt định dạng ở đây — kẻo regex kia xanh nhờ chuỗi rác.
  assert.match(swV, /^v\d+$/, `LAZY_V phải có dạng v<N> (đang là "${swV}")`);
  const cacheV = read(SW_SRC, /const CACHE = '([^']+)'/);
  assert.match(cacheV, /^taskflow-v\d+$/, `CACHE phải có dạng taskflow-v<N> (đang là "${cacheV}")`);
});

test('parity: mọi key VI đều có bản EN', () => {
  const api = require('../js/i18n.js');
  const missing = Object.keys(api.I18N.vi).filter((k) => !(k in api.I18N.en));
  assert.deepEqual(missing, [], `key thiếu bản EN: ${missing.slice(0, 10).join(', ')}`);
});

test('không có EN trong boot chain, nhưng có trong precache + boot hook render lại', () => {
  assert.doesNotMatch(APP_HTML, /src="js\/i18n-en\.min\.js/, 'chunk EN phải là lazy, không nằm trong boot chain');
  assert.ok(SW_SRC.includes("'./js/i18n-en.min.js?v=' + LAZY_V"), 'sw.js phải precache chunk EN để offline EN chạy được');
  assert.match(SW_SRC, /const CACHE = 'taskflow-v\d+';/);
  // boot ở EN mà chunk chưa về → nạp rồi render lại (không được kẹt ở bản VI)
  assert.match(APP_JS, /ensureLang\(getLang\(\)\)\.then\(\(\) => \{/);
  assert.match(APP_JS, /if \(window\.TaskFlowI18N\.hasLang\(getLang\(\)\)\) refreshLang\(\);/);
});
