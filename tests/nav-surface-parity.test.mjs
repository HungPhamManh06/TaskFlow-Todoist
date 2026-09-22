/**
 * Bất biến "đồng bộ giữa các bề mặt điều hướng" (2026-09-22).
 *
 * App có 3 bề mặt nav, chia theo breakpoint `max-width: 767px`:
 *   1. Sidebar desktop (`#desktopSidebar`) — dùng cho tablet 768px+ và desktop.
 *   2. Bottom nav mobile (5 slot, FAB "Thêm việc" ở giữa) — chỉ ≤767px.
 *   3. More sheet — chỉ mở được từ bottom nav, nên cũng chỉ có nghĩa ở ≤767px.
 *
 * Rủi ro thật: một view (hoặc shortcut) chỉ tồn tại trên một bề mặt → người dùng ở
 * breakpoint kia mất đường vào, mà không có test nào kêu. Đúng lớp lỗi đã xảy ra với
 * Inbox (đưa vào sheet) và với "Thói quen" (chỉ có ở sidebar desktop). Test này chốt
 * quan hệ bao phủ giữa ba bề mặt, đọc thẳng từ nguồn js/app.js + css/app-shell.css.
 *
 * Đây là test TĨNH có chủ ý: bản render thật do scripts/e2e-mobile-qa.py đo (5 viewport,
 * có cả 768x1024), còn ở đây khoá cấu trúc để sửa một bề mặt mà quên bề mặt kia là đỏ ngay.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// NAV CONFIG — nguồn duy nhất cho bottom nav + More sheet. Test đọc CHÍNH object này
// thay vì lặp lại danh sách literal (chính việc lặp literal là thứ khiến thêm/bớt tab
// phải sửa nhiều nơi).
const Config = require('../js/config.js');
const APP = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../css/app-shell.css', import.meta.url), 'utf8');
const E2E = readFileSync(new URL('../scripts/e2e-mobile-qa.py', import.meta.url), 'utf8');

/** Cắt đoạn nguồn giữa 2 mốc (không tính mốc kết thúc). */
function slice(src, from, to) {
  const a = src.indexOf(from);
  assert.ok(a >= 0, `không tìm thấy mốc bắt đầu: ${from}`);
  const b = src.indexOf(to, a);
  assert.ok(b > a, `không tìm thấy mốc kết thúc: ${to}`);
  return src.slice(a, b);
}

const uniq = (arr) => [...new Set(arr)];

/** Tập view chuẩn của app — nguồn duy nhất là mảng `items` trong buildNav(). */
const canonicalViews = uniq(
  [...slice(APP, 'function buildNav()', 'const navAttributes = {').matchAll(/\{ view: '([a-z-]+)'/g)].map((m) => m[1])
);

const moreSheetViews = Config.MORE_SHEET_VIEWS;

const desktopBlock = slice(APP, 'if (desktop) {', 'if (mobile) {');
const desktopViews = uniq([...desktopBlock.matchAll(/byView\.([a-z]+)/g)].map((m) => m[1]));
const desktopActions = uniq([...desktopBlock.matchAll(/actionBtn\('([a-z-]+)'/g)].map((m) => m[1]));

const bottomBlock = slice(APP, 'mobile.innerHTML =', 'const moreSheetNav =');
// Slot 'view' trong config; slot 'add' (FAB) và 'action' (More sheet) không phải view.
const bottomViews = Config.MOBILE_NAV_SLOTS.filter((s) => s.type === 'view').map((s) => s.view);
const addSlots = Config.MOBILE_NAV_SLOTS.filter((s) => s.type === 'add');

const sheetBlock = slice(APP, 'const moreGroups = [', 'moreSheetNav.innerHTML =');
const sheetActions = uniq([...sheetBlock.matchAll(/actionBtn\('([a-z-]+)'/g)].map((m) => m[1]));

test('tập view chuẩn đọc được từ mảng items (8 view, không trùng)', () => {
  assert.ok(canonicalViews.length >= 8, `phải có ít nhất 8 view (thấy ${canonicalViews.length})`);
  assert.equal(new Set(canonicalViews).size, canonicalViews.length, 'view trong mảng items không được trùng');
});

test('sidebar desktop (tablet 768px+ và desktop) phủ TOÀN BỘ view chuẩn', () => {
  const missing = canonicalViews.filter((v) => !desktopViews.includes(v));
  assert.deepEqual(missing, [], `sidebar thiếu view: ${missing.join(', ')}`);
});

test('mobile (bottom nav ∪ More sheet) phủ TOÀN BỘ view chuẩn', () => {
  const covered = new Set([...bottomViews, ...moreSheetViews]);
  const missing = canonicalViews.filter((v) => !covered.has(v));
  assert.deepEqual(missing, [], `mobile thiếu đường vào các view: ${missing.join(', ')}`);
  const orphan = [...covered].filter((v) => !canonicalViews.includes(v));
  assert.deepEqual(orphan, [], `bottom nav/sheet trỏ tới view không tồn tại: ${orphan.join(', ')}`);
});

test('không view nào bị hai lần trên mobile (bottom nav ∩ More sheet = ∅)', () => {
  const dup = bottomViews.filter((v) => moreSheetViews.includes(v));
  assert.deepEqual(dup, [], `view vừa là tab vừa nằm trong sheet: ${dup.join(', ')}`);
  // 5 slot = 3 tab view (Hôm nay / Sắp tới / Dự án) + FAB "Thêm việc" ở giữa + "Thêm" (action).
  assert.equal(bottomViews.length, 3, `bottom nav phải còn đúng 3 tab view (thấy ${bottomViews.join(', ')})`);
  assert.equal(moreSheetViews.length, 5, `More sheet phải giữ 5 view (thấy ${moreSheetViews.join(', ')})`);
  assert.equal(bottomViews.length + moreSheetViews.length, canonicalViews.length,
    'tổng tab + view trong sheet phải bằng đúng số view chuẩn (không thừa không thiếu)');
});

test('shortcut chỉ có ở sidebar desktop phải xuất hiện ở More sheet', () => {
  // "Thói quen" là shortcut nhảy tới widget habits trong Tổng quan (không phải view riêng).
  // Trên điện thoại không có tab Tổng quan, nên nếu thiếu trong sheet thì tính năng chỉ còn
  // đường vòng: mở sheet → Tổng quan → tìm widget.
  const missing = desktopActions.filter((a) => !sheetActions.includes(a));
  assert.deepEqual(missing, [], `shortcut có ở sidebar nhưng thiếu ở More sheet: ${missing.join(', ')}`);
  assert.ok(sheetActions.includes('tools-open'), 'Cài đặt (tools-open) phải vào được từ More sheet');
  assert.ok(sheetActions.includes('habits'), '"Thói quen" phải có trong More sheet (mobile)');
});

test('breakpoint: sheet/bottom nav là mobile-only, sidebar là tablet/desktop-only', () => {
  // Base (mọi width): bottom nav ẩn.
  assert.match(CSS, /\.app-mobile-nav \{\s*display: none;\s*\}/,
    'bottom nav phải ẩn mặc định (nếu không nó sẽ hiện chồng lên layout sidebar)');
  // Trong khối mobile: sidebar ẩn, bottom nav hiện.
  const mobile = slice(CSS, '@media (max-width: 767px) {', 'body.more-sheet-open');
  assert.match(mobile, /\.app-sidebar \{\s*display: none;/,
    'trong layout mobile (≤767px) sidebar phải ẩn');
  assert.match(mobile, /\.app-mobile-nav \{\s*position: fixed;/,
    'trong layout mobile bottom nav phải hiện (fixed đáy viewport)');
  // More sheet không có rule nào bỏ display:none ngoài khối mobile → ≥768px không thể lộ ra.
  const outsideMobile = CSS.replace(/@media \(max-width: 767px\) \{[\s\S]*?\n\}/g, '');
  assert.match(outsideMobile, /\.more-sheet:not\(\[hidden\]\) \{\s*display: flex;\s*\}/,
    'More sheet chỉ hiện khi được mở tường minh (JS), không do media query width');
});

test('không có trigger More sheet nào hiện ở width tablet/desktop (đúng như harness e2e giả định)', () => {
  // Harness e2e (scripts/e2e-mobile-qa.py) chia 768x1024 vào nhánh desktop. Nếu sau này có
  // nút "Thêm" hiện ở ≥768px thì More sheet trở thành bề mặt thứ ba ở tablet → phải cập nhật
  // cả harness lẫn test này.
  const breakpoint = Number((E2E.match(/MOBILE_MAX = (\d+)/) || [])[1]);
  assert.equal(breakpoint, 767, 'MOBILE_MAX của harness phải khớp max-width: 767px trong CSS');
  // Nút "Thêm" đến từ slot 'action' trong config VÀ chỉ được render trong nhánh mobile.
  assert.ok(Config.MOBILE_NAV_SLOTS.some((s) => s.action === 'more' && s.sheet === 'moreSheet'),
    'More sheet phải được khai báo như một slot action trong config');
  assert.ok(!desktopBlock.includes('data-action="more"'),
    'nhánh desktop của buildNav không được tạo nút mở More sheet');
});

test('FAB "Thêm việc": đúng 1 slot add, đặt giữa để thanh đối xứng', () => {
  assert.equal(addSlots.length, 1, 'phải có đúng một slot { type: "add" }');
  assert.equal(Config.MOBILE_NAV_SLOTS.length % 2, 1, 'số slot phải lẻ để có đúng một slot giữa');
  const addIdx = Config.MOBILE_NAV_SLOTS.findIndex((s) => s.type === 'add');
  assert.equal(addIdx, (Config.MOBILE_NAV_SLOTS.length - 1) / 2,
    'FAB phải ở slot giữa — lệch sang một bên là thanh mất đối xứng (yêu cầu 2026-09-22)');
  assert.notEqual(addIdx, 0);
  assert.notEqual(addIdx, Config.MOBILE_NAV_SLOTS.length - 1);
});

test('một nguồn duy nhất: không nơi nào lặp lại danh sách slot / số cột', () => {
  // Thêm/bớt một tab CHỈ được phép sửa js/config.js. Test này chặn việc tái tạo bản sao
  // danh sách ở app.js (ghép chuỗi slot), CSS (repeat(N)), hay harness e2e (literal).
  assert.doesNotMatch(APP, /mobileItem\(byView\.(today|upcoming|projects)\) \+/,
    'app.js phải render từ MOBILE_NAV_SLOTS, không ghép chuỗi slot thủ công');
  assert.match(APP, /mobile\.innerHTML = MOBILE_NAV_SLOTS\.map\(slotHTML\)\.join\(''\)/);
  assert.match(APP, /MOBILE_NAV_SLOTS,\s*MORE_SHEET_VIEWS,/, 'app.js lấy config từ js/config.js');
  assert.doesNotMatch(APP, /^const MORE_SHEET_VIEWS = /m, 'không định nghĩa lại MORE_SHEET_VIEWS trong app.js');
  assert.doesNotMatch(CSS, /\.app-mobile-nav\s*{[^}]*grid-template-columns:\s*repeat\(\d+/s,
    'CSS không được hardcode số cột — số cột suy ra từ số slot');
  assert.match(CSS, /\.app-mobile-nav\s*{[^}]*grid-auto-flow:\s*column/s);
  // Harness e2e phải đọc config từ trang, không lặp danh sách slot.
  assert.match(E2E, /window\.TaskFlowConfig\.MOBILE_NAV_SLOTS/,
    'e2e phải so DOM với config trong trang thay vì danh sách literal');
  assert.doesNotMatch(E2E, /idx"\] == 2/, 'index của FAB không được hardcode trong e2e');
  // Và tất nhiên: config phải thật sự export hai danh sách đó.
  assert.ok(Array.isArray(Config.MOBILE_NAV_SLOTS) && Array.isArray(Config.MORE_SHEET_VIEWS));
});
