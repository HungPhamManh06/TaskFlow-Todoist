# TaskFlow Testing Guide

Bổ sung cho `docs/build-and-release.md` (build/release) và `docs/release-checklist.md` (trước khi phát hành).

## 1. Chạy test

| Lệnh | Nội dung | Ghi chú |
|---|---|---|
| `node --test tests/*.test.mjs` | 103 file · ~3.550 unit test | Cổng chặn chính trong CI |
| `node test-sync.js` | 13 test đồng bộ (pg-mem + client engine) | Cần `server/` deps |
| `node test-server-security.js` | JWT fail-fast, CORS, headers, rate limit | Cần `server/` deps |
| `node test-server-*.js` | AI, calendar OAuth/write, … (đều chạy trên pg-mem) | Không cần Postgres thật |
| `python scripts/e2e-*.py` | 30 kịch bản Playwright | Cần `pip install playwright` + browser |
| `python scripts/perf-budget.py --from-dir docs/lighthouse` | Gate hiệu năng (floor/target) | Không cần Chrome ở chế độ này |
| `python scripts/check-release-assets.py` | Pin `?v=` + asset thiếu pin | Cần full git history |
| `python scripts/minify.py --check` | `.min` có còn khớp source | Chậm (npx terser/csso) |

## 2. Quy tắc ngày tháng — BẮT BUỘC

**Không bao giờ hardcode một ngày lịch làm "hôm nay".** Ngày cứng sẽ "phát nổ" đúng vào ngày nó trở thành quá khứ, làm CI đỏ ở một commit không liên quan.

> Sự thật đã xảy ra (2026-09-20): fixture `2026-09-10` trong `tests/ai-brain-runtime-bridge.test.mjs` hết hạn → `runWindow()` bắt đầu clamp `startDate` về hôm nay và filter `overdue` bắt đầu coi fixture là quá hạn → **CI đỏ 2 test** trên `main`, và 12 job E2E bị skip theo (`needs: test`).

Dùng helper `tests/helpers/clock.mjs`:

```js
import { isoDate, todayISO, frozenDate } from './helpers/clock.mjs';

isoDate(0)                      // hôm nay (local)
isoDate(-30)                    // 30 ngày trước
isoDate(1, new Date(2026, 11, 31))  // '2027-01-01' — mốc cố định để test biên
todayISO()                      // 'YYYY-MM-DD' theo local (không dùng toISOString)
```

Khi test một hành vi **phụ thuộc ngày**, hãy bơm clock đóng băng vào sandbox thay vì dựa vào ngày thực:

```js
const sandbox = { Date: frozenDate('2031-07-04'), /* ... */ };
```

`tests/clock-fixtures.test.mjs` chứng minh cách làm này: cùng một hành vi (`get_tasks` today/overdue/upcoming, `runWindow` clamp) được kiểm tra với clock đóng băng ở **2019-01-15, 2026-09-20 và 2031-07-04**. Một fixture ngày cứng không thể vượt qua cả ba mốc đó.

## 3. Pattern sandbox (`vm`)

Test đọc **source** (`readFileSync`) rồi chạy trong `vm.createContext` — không import module trình duyệt. Hai cạm bẫy:

1. **Thiếu global là lỗi ngay.** Sandbox phải có đủ: `window`, `console`, `localStorage`, `Date`, `JSON`, `Math`, `Map`, `Set`, `Array`, `Object`, `String`, `Number`, `RegExp`, `Error`, `parseInt` + các global module cần (`state`, `Sync`, `API_CONFIG`, `TaskFlowI18N`, …). Thiếu `Map`/`Set` thường chỉ lộ ra khi chạy tới nhánh hiếm.
2. **Cross-realm array.** Giá trị tạo trong sandbox mang `Array.prototype` của realm đó → `assert.deepStrictEqual` **fail dù hai mảng giống hệt**. Spread sang mảng cục bộ trước khi so:
   ```js
   const uids = (f) => [...tools.getTool('get_tasks').execute({ filter: f }).tasks.map((t) => t.uid)];
   ```

## 4. Dictionary i18n — đọc **cả hai** file, và chỉ nạp ngôn ngữ đang dùng

Từ P1.2 bước 2, `js/i18n.js` **chỉ** chứa dictionary VI + core; dictionary EN nằm ở `js/i18n-en.js` và là **chunk lazy** (trình duyệt chỉ tải khi `LANG === 'en'`; Node thì `require` ngay nên test cũ không đổi hành vi).

Vì vậy, khi test kiểm "key/chuỗi có ở cả vi + en", phải đọc **cả hai** file — đọc mỗi `js/i18n.js` sẽ ra khẳng định vô nghĩa:

```js
const I18N = readFileSync('js/i18n.js', 'utf8') + readFileSync('js/i18n-en.js', 'utf8');
```

Hoặc chặt hơn — kiểm từng ngôn ngữ trên đúng file của nó:

```js
assert.ok(VI.includes('insightsTitle:'));
assert.ok(EN.includes('insightsTitle:'));
```

Không cần thêm gì cho test dùng runtime dictionary: `require('../js/i18n.js').I18N.en` luôn có sẵn (core require chunk EN đồng bộ trong môi trường Node).

`tests/i18n-lazy-lang.test.mjs` giữ phần hành vi **chỉ trình duyệt mới thấy được** (sandbox `node:vm` không có `module`/`require`): boot mặc định không tải EN, `ensureLang('en')` inject đúng chunk (`assets/i18n-en.<hash>.js` khi có `TaskFlowAssetMap`), chunk tự gắn `I18N.en`, lỗi mạng → `false` + cho phép thử lại, và `t()` rơi về VI thay vì trả key thô. Test này cũng chặn hồi quy: chunk EN **không** được quay lại boot chain (`app.html`), nhưng **phải** có trong precache `sw.js`.

> Bẫy đã gặp: đổi tách file làm 61 assertion kiểu "EN has …" đỏ vì đọc mỗi `js/i18n.js`. Khi thêm dictionary cho ngôn ngữ mới, nhớ luật trên.

## 5. CI chặn gì (`ci.yml`)

`syntax check` → `tool contracts --check` → `minify.py --check` → `npm run build` + `build:check` → unit test → `test-sync.js` → `test-server-security.js`. Sau khi job `test` xanh: `release-assets`, backup/restore, a11y, smoke 3 engine, frontend suite, offline PWA, SW upgrade, chat, chat streaming, document chat, document daily plan, AI trust boundary, task mutations.

`perf-budget.yml` chạy **riêng** (nightly + thủ công) để không kéo dài vòng phản hồi PR — xem `docs/v3.2-three-layer-plan.md` (P3.1).
