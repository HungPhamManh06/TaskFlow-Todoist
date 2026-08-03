# Phase 0 — Chất lượng & vá lỗ hổng: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vá 6 lỗ hổng chất lượng của TaskFlow-Todoist: PWA cache thiếu sync, deep link không hoạt động, ảnh landing 404, code chết + copy cũ, thiếu nút cài đặt app, analytics/feedback chưa kích hoạt.

**Architecture:** Toàn bộ thay đổi nằm ở front-end vanilla JS + sw.js. Deep link được tách thành module nhỏ `js/deeplink.js` (pattern theo `js/api-config.js`: script global + tương thích `module.exports` để test bằng `node --test`). Không sửa backend.

**Tech Stack:** Vanilla JS (ES5-style, không transpile), Service Worker, `node --test` (Node 18+), agent-browser CLI cho screenshot.

**Spec:** `docs/superpowers/specs/2026-08-03-feature-roadmap-design.md` — chỉ triển khai mục 0.1–0.6.

## Global Constraints

- Ngôn ngữ UI: thêm key i18n phải vào cả `vi` (app.js:406–635) và `en` (app.js:636–803); ghi đè không ghi lên là BUG.
- Không thêm framework, không thêm dependency npm vào repo (trừ npx tạm thời khi chụp ảnh).
- Mọi file JS sửa phải qua `node --check <file>`.
- Bump version: sw.js cache `taskflow-v19` → `taskflow-v20`; app.html `js/app.js?v=29` → `?v=30`; `js/sync.js?v=2`, `js/api-config.js?v=1` giữ nguyên; `js/deeplink.js` mới dùng `?v=1`.
- Không commit — user sẽ tự quyết định thời điểm commit (repo đang có thay đổi chưa commit của user).
- Chạy `node test-sync.js` + `node --test tests/phase0.test.mjs` cuối mỗi task có test.

---

## File Structure

| File | Trạng thái | Trách nhiệm |
|---|---|---|
| `js/deeplink.js` | **Tạo mới** | Parse `?view=` và `?m=YYYY-M` từ URL → object `{view, year, month}`. Expose `window.DeepLink` + `module.exports` |
| `tests/phase0.test.mjs` | **Tạo mới** | Unit test `DeepLink.parse` + assertion cấu hình sw.js (node:test, không cần framework) |
| `sw.js` | Sửa (line 6–18) | Thêm `js/sync.js`, `js/api-config.js`, `js/deeplink.js` vào APP_SHELL; bump CACHE → `taskflow-v20` |
| `app.html` | Sửa | Script tag `js/deeplink.js` (trước `js/app.js` line 261); nút `#btnInstall` trong header (trước nút lang line 127); bump `js/app.js?v=30` |
| `js/app.js` | Sửa | Boot xử lý deep link (sau line 3377); xoá block `.landing-video` (2601–2605); sửa 2 chuỗi Supabase (551, 754); handler `beforeinstallprompt` + nhánh `install-app` trong click listener; key i18n mới |
| `app-screenshot.png` | **Tạo lại** | Ảnh chụp app view tổng quan (thay file 404) |
| `README.md` | Sửa | Bỏ "Supabase" (line 237); thêm `js/deeplink.js` vào cấu trúc; mục "Kích hoạt GA4 & Góp ý" |
| `index.html` | Sửa (nếu cần) | Không thay đổi ngoài việc ảnh mới tự đúng (line 224 dùng `app-screenshot.png`) |

---

### Task 1: DeepLink module + test

**Files:**
- Create: `js/deeplink.js`
- Test: `tests/phase0.test.mjs`

**Interfaces:**
- Produces: `window.DeepLink.parse(urlStr)` → `{view: 'overview'|'year'|'week'|null, year: number|null, month: number|null}` (`month` 0-based; chỉ set khi có `m=YYYY-M` hợp lệ, YYYY 2020–2099, M 1–12).

- [ ] **Step 1: Viết test trước**

```js
// tests/phase0.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import DeepLink from '../js/deeplink.js';

test('parse: không tham số', () => {
  assert.deepEqual(DeepLink.parse('https://x.app/app.html'), { view: null, year: null, month: null });
});

test('parse: view hợp lệ', () => {
  assert.equal(DeepLink.parse('https://x.app/app.html?view=year').view, 'year');
  assert.equal(DeepLink.parse('https://x.app/app.html?view=overview').view, 'overview');
  assert.equal(DeepLink.parse('https://x.app/app.html?view=week').view, 'week');
});

test('parse: view không hợp lệ → null', () => {
  assert.equal(DeepLink.parse('https://x.app/app.html?view=calendar').view, null);
});

test('parse: m=YYYY-M hợp lệ', () => {
  const r = DeepLink.parse('https://x.app/app.html?m=2027-3');
  assert.equal(r.year, 2027);
  assert.equal(r.month, 2); // 0-based
});

test('parse: m ngoài phạm vi → null', () => {
  assert.deepEqual(DeepLink.parse('https://x.app/app.html?m=2026-0'), { view: null, year: null, month: null });
  assert.deepEqual(DeepLink.parse('https://x.app/app.html?m=2026-13'), { view: null, year: null, month: null });
  assert.deepEqual(DeepLink.parse('https://x.app/app.html?m=1800-5'), { view: null, year: null, month: null });
});

test('parse: kết hợp view + m', () => {
  const r = DeepLink.parse('https://x.app/app.html?view=year&m=2026-12');
  assert.equal(r.view, 'year');
  assert.equal(r.year, 2026);
  assert.equal(r.month, 11);
});

test('parse: token OAuth bị bỏ qua', () => {
  assert.deepEqual(DeepLink.parse('https://x.app/app.html?token=abc123'), { view: null, year: null, month: null });
});

test('parse: chuỗi rỗng/null', () => {
  assert.deepEqual(DeepLink.parse(''), { view: null, year: null, month: null });
  assert.deepEqual(DeepLink.parse(null), { view: null, year: null, month: null });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `node --test tests/phase0.test.mjs`
Expected: FAIL — `Error: Cannot find module '../js/deeplink.js'`

- [ ] **Step 3: Viết module**

```js
/* js/deeplink.js — Parse deep link từ manifest shortcuts (?view=, ?m=YYYY-M)
   Chạy được cả ở browser (window.DeepLink) lẫn Node (module.exports) để unit test. */
(function () {
  'use strict';
  var EMPTY = { view: null, year: null, month: null };

  function parse(urlStr) {
    if (!urlStr) return { view: null, year: null, month: null };
    var qIdx = urlStr.indexOf('?');
    if (qIdx < 0) return { view: null, year: null, month: null };
    var out = { view: null, year: null, month: null };
    var parts = urlStr.slice(qIdx + 1).split('&');
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].split('=');
      if (pair.length !== 2 || !pair[0] || !pair[1]) continue;
      var k = decodeURIComponent(pair[0]).trim();
      var v = decodeURIComponent(pair[1]).trim();
      if (k === 'view' && (v === 'overview' || v === 'year' || v === 'week')) {
        out.view = v;
      } else if (k === 'm') {
        var m = /^(\d{4})-(\d{1,2})$/.exec(v);
        if (m) {
          var y = parseInt(m[1], 10);
          var mo = parseInt(m[2], 10);
          if (y >= 2020 && y <= 2099 && mo >= 1 && mo <= 12) {
            out.year = y;
            out.month = mo - 1;
          }
        }
      }
    }
    return out;
  }

  var api = { parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.DeepLink = api;
})();
```

- [ ] **Step 4: Chạy test — phải PASS**

Run: `node --test tests/phase0.test.mjs`
Expected: 8 tests PASS (mỗi `test()` là 1 case, tổng 8 khối test)

- [ ] **Step 5: `node --check`** — Run: `node --check js/deeplink.js` — Expected: no output, exit 0

---

### Task 2: SW cache đủ bộ app shell

**Files:**
- Modify: `sw.js:6-18`
- Test: `tests/phase0.test.mjs` (thêm test)

- [ ] **Step 1: Thêm test assertion (viết trước)**

Thêm vào cuối `tests/phase0.test.mjs`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

test('sw.js: cache version bump lên v20', () => {
  assert.match(SW, /const CACHE = 'taskflow-v20';/);
});

test('sw.js: APP_SHELL đủ js bắt buộc', () => {
  for (const f of ['./js/app.js', './js/sync.js', './js/api-config.js', './js/deeplink.js']) {
    assert.ok(SW.includes(f), `thiếu ${f} trong APP_SHELL`);
  }
});

test('app.html: không có tên file SW cũ', () => {
  const HTML = readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  assert.ok(!/js\/app\.js\?v=29/.test(HTML), 'app.html vẫn trỏ js/app.js?v=29');
});
```

- [ ] **Step 2: Chạy test — phải FAIL** — Run: `node --test tests/phase0.test.mjs`
Expected: FAIL ở test "cache version bump" và "APP_SHELL đủ js bắt buộc"

- [ ] **Step 3: Sửa sw.js**

```js
const CACHE = 'taskflow-v20';
const APP_SHELL = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './css/styles.css',
  './css/landing.css',
  './js/app.js',
  './js/sync.js',
  './js/api-config.js',
  './js/deeplink.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];
```

- [ ] **Step 4: Chạy test — phải PASS** — Run: `node --test tests/phase0.test.mjs`
Expected: test "app.html vẫn trỏ v29" vẫn FAIL (chưa sửa app.html — Task 3 lo), các test SW mới PASS

---

### Task 3: Nối deep link vào app + bump version

**Files:**
- Modify: `app.html:259-261` (script tags), `js/app.js` (boot, sau line 3377)
- Modify: `README.md` (cấu trúc dự án, line ~192)

- [ ] **Step 1: Thêm script tag deeplink + bump app.js**

`app.html` — thay khối:

```html
  <script src="js/api-config.js?v=1"></script>
  <script src="js/deeplink.js?v=1"></script>
  <script src="js/sync.js?v=2"></script>
  <script src="js/app.js?v=30"></script>
```

- [ ] **Step 2: Xử lý deep link trong boot**

`js/app.js` — chèn ngay SAU `maybeStartOnboarding();` (line 3377) và TRƯỚC `setTheme(THEME);` (line 3378):

```js
/* ---------- Deep link từ manifest shortcuts (?view=, ?m=YYYY-M) ---------- */
if (window.DeepLink) {
  const dl = window.DeepLink.parse(location.href);
  if (dl.year !== null && dl.month !== null) {
    initPlan(new Date(dl.year, dl.month, 1));
    state = bootState();
    const nowD = new Date();
    viewedMonth = (dl.year === nowD.getFullYear() && dl.month === nowD.getMonth()) ? null : dl.month;
    updateBrand();
    updateNowBtn();
  }
  if (dl.view) state.view = dl.view;
}
```

- [ ] **Step 3: Cập nhật README cấu trúc**

Trong khối cấu trúc (README.md line ~192, sau dòng `│   ├── app.js`), thêm:

```markdown
│   ├── deeplink.js     # Parse ?view= & ?m=YYYY-M (manifest shortcuts) — module nhỏ, có unit test
```

- [ ] **Step 4: Chạy toàn bộ test**

Run: `node --check js/app.js` + `node --test tests/phase0.test.mjs`
Expected: tất cả PASS (kể cả "app.html: không có tên file SW cũ")

- [ ] **Step 5: Verify thủ công (agent-browser)**

Mở `http://localhost:8080/app.html?view=year` (sau `npx serve -l 8080` hoặc `python -m http.server 8080`) → phải mở thẳng view Năm. Mở `?m=2027-3` → phải nhảy sang tháng 3/2027 và hiện nút "Quay lại tháng này".

---

### Task 4: Xoá code chết + sửa copy Supabase

**Files:**
- Modify: `js/app.js:2601-2605` (xoá block `.landing-video`), `js/app.js:551`, `js/app.js:754` (copy)
- Modify: `README.md:237`

- [ ] **Step 1: Xoá block `.landing-video`**

`js/app.js` — xoá 4 dòng sau (giữ nguyên phần còn lại của `setView`):

```js
  const video = ov ? ov.querySelector('.landing-video') : null;
  if (video) {
    if (view === 'overview') { video.play().catch(() => { /* autoplay bị chặn */ }); }
    else video.pause();
  }
```

- [ ] **Step 2: Sửa copy**

- Line 551 (vi): `syncStatusOff: 'Chưa cấu hình Supabase',` → `syncStatusOff: 'Chưa kích hoạt đồng bộ đám mây',`
- Line 754 (en): `syncStatusOff: 'Supabase not configured',` → `syncStatusOff: 'Cloud sync not configured',`
- README.md line 237: `- [x] **Đăng nhập & đồng bộ đa thiết bị (Supabase)**` → `- [x] **Đăng nhập & đồng bộ đa thiết bị (backend riêng)**`

- [ ] **Step 3: Thêm test không còn Supabase**

Thêm vào cuối `tests/phase0.test.mjs`:

```js
test('không còn copy Supabase trong app.js', () => {
  const APP = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  assert.ok(!/Supabase/.test(APP), 'app.js vẫn chứa "Supabase"');
});
```

- [ ] **Step 4: Verify**

Run: `node --check js/app.js` + `node --test tests/phase0.test.mjs`
Expected: tất cả PASS

---

### Task 5: Nút "Cài đặt app" (beforeinstallprompt)

**Files:**
- Modify: `app.html` (header, trước nút lang line 127)
- Modify: `js/app.js` (i18n 2 key; listener `beforeinstallprompt` cạnh `appinstalled` line 930; nhánh `install-app` trong click listener; CSS không cần — dùng sẵn `.btn-icon`)

- [ ] **Step 1: Thêm nút vào header**

`app.html` — chèn TRƯỚC `<button type="button" class="lang-btn" ...` (line 127):

```html
      <button type="button" class="btn-icon" id="btnInstall" data-action="install-app" hidden
        title="Cài đặt ứng dụng" data-i18n-title="installTitle" data-i18n-aria="installTitle">📲</button>
```

- [ ] **Step 2: Thêm key i18n**

`js/app.js` — vi (gần các key header, vd sau `homeTitle`):
```js
    installTitle: 'Cài đặt ứng dụng',
```
en (tương ứng):
```js
    installTitle: 'Install app',
```

- [ ] **Step 3: Logic beforeinstallprompt**

`js/app.js` — thay dòng `window.addEventListener('appinstalled', () => trackEvent('pwa_install'));` (line 930) bằng:

```js
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const b = document.getElementById('btnInstall');
  if (b) b.hidden = false;
});

window.addEventListener('appinstalled', () => {
  trackEvent('pwa_install');
  const b = document.getElementById('btnInstall');
  if (b) b.hidden = true;
  deferredPrompt = null;
});
```

- [ ] **Step 4: Nhánh click listener**

Trong listener click chính (`js/app.js:2642`), thêm nhánh (đặt cạnh các nhánh header, vd sau nhánh `print`):

```js
  else if (act === 'install-app') {
    const b = document.getElementById('btnInstall');
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choice) => {
        trackEvent('pwa_prompt', { outcome: choice.outcome });
        if (b) b.hidden = true;
        deferredPrompt = null;
      });
    }
  }
```

- [ ] **Step 5: Verify**

Run: `node --check js/app.js` + `node --test tests/phase0.test.mjs`
Expected: PASS. Thủ công (agent-browser): nút 📲 ẩn khi không khả dụng; chỉ hiện khi có `beforeinstallprompt` (Chrome, PWA criteria).

---

### Task 6: Tạo lại app-screenshot.png

**Files:**
- Create (overwrite): `app-screenshot.png` (1200×900, view tổng quan app)

- [ ] **Step 1: Chạy server local**

Run: `npx serve -l 8080 .` (hoặc `python -m http.server 8080`) trong `C:\Users\hungv\Downloads\todoist`

- [ ] **Step 2: Chụp ảnh bằng agent-browser skill**

Dùng skill `agent-browser` (C:\Users\hungv\.agents\skills\agent-browser\SKILL.md):
1. Mở `http://localhost:8080/app.html`
2. Bỏ qua onboarding (click nút "Bỏ qua phần giới thiệu") để lộ view tổng quan
3. Chờ 1–2 s cho confetti/rendering ổn định
4. Chụp screenshot viewport 1200×900 → lưu đè `app-screenshot.png`

- [ ] **Step 3: Verify ảnh**

Run: `Get-Item app-screenshot.png | Select-Object Length`
Expected: file > 100 KB, viewable (dùng Read tool để xem ảnh xác nhận hiển thị đúng view tổng quan pastel, không onboarding, không modal)

---

### Task 7: Kích hoạt GA4 & Góp ý

**Files:**
- Modify: `js/app.js:870-877` (nếu user cung cấp ID)
- Modify: `README.md` (mục hướng dẫn mới)

- [ ] **Step 1: Hỏi user lấy thông tin**

Hỏi user: `GA4_ID` (Measurement ID), `FB_FORM_URL` (link Google Form), `FB_EMAIL` (địa chỉ nhận email góp ý). Nếu user không có, bỏ qua bước 2, làm bước 3.

- [ ] **Step 2: Điền giá trị (nếu có)**

`js/app.js:870-877`:
```js
const GA4_ID = '<ID user cung cấp>';   // vd 'G-ABCDE12345'
const FB_FORM_URL = '<URL user cung cấp>';  // vd 'https://forms.gle/...'
const FB_EMAIL = '<email user cung cấp>';
```

- [ ] **Step 3: Ghi hướng dẫn vào README**

Thêm mục (trước "## 📂 Cấu trúc dự án"):

```markdown
## 📈 Kích hoạt Analytics & Góp ý

1. Tạo GA4 property tại [analytics.google.com](https://analytics.google.com) → lấy Measurement ID dạng `G-XXXXXXX`
2. Điền vào `js/app.js` đầu file: `GA4_ID` (analytics), `FB_FORM_URL` (link Google Form góp ý), `FB_EMAIL` (email nhận góp ý)
3. Mỗi hành động quan trọng đã có sẵn event GA4 (`create_goal`, `share_streak`, `pwa_install`, ...) — xem ở Reports → Engagement → Events
```

- [ ] **Step 4: Verify**

Run: `node --check js/app.js` + `node --test tests/phase0.test.mjs` — Expected: PASS
Thủ công: mở app → FAB 💬 → nút "Góp ý qua Google Form" mở đúng link (nếu user cung cấp URL).

---

### Task 8: Verification chốt phase

- [ ] **Step 1: Chạy toàn bộ check**

```bash
node --check js/app.js
node --check js/sync.js
node --check js/deeplink.js
node --check sw.js
node --test tests/phase0.test.mjs
node test-sync.js
```

Expected: tất cả PASS/exit 0 (test-sync.js: 7 tests ok)

- [ ] **Step 2: Smoke test toàn app (agent-browser)**

1. Mở `http://localhost:8080/index.html` → landing hiển thị ảnh `app-screenshot.png` (không 404)
2. Mở `http://localhost:8080/app.html` → bỏ qua onboarding → tick 1 habit → chuyển qua view Năm/Tuần → export JSON thành công
3. Mở `app.html?view=year` → thẳng view Năm

- [ ] **Step 3: Cập nhật trạng thái**

Đánh dấu các mục 0.1–0.6 hoàn thành trong `docs/superpowers/specs/2026-08-03-feature-roadmap-design.md`; chuyển sang Phase 1 (plan riêng).

---

## Self-Review

- **Spec coverage:** 0.1 → Task 2 ✓; 0.2 → Task 1+3 ✓; 0.3 → Task 6 ✓; 0.4 → Task 4 ✓; 0.5 → Task 5 ✓; 0.6 → Task 7 ✓; chốt phase → Task 8 ✓.
- **Placeholder scan:** Không có "TBD/TODO"; giá trị GA4/FB (Task 7) là input từ user — có bước hỏi rõ ràng, không phải placeholder code.
- **Type consistency:** `DeepLink.parse` trả `{view, year, month}` — Task 1 định nghĩa, Task 3 dùng đúng; `viewedMonth` (global đã tồn tại, app.js:3037) dùng đúng ý nghĩa.
- **Phiên bản:** sw `v20` (Task 2) khớp test; app.js `?v=30` (Task 3) khớp test chống v29.
