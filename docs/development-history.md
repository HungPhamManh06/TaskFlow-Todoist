# TaskFlow — Lịch sử phát triển (Development History)

> Ghi chép lịch sử triển khai TaskFlow theo từng giai đoạn (phase).
> Nội dung trong trang này được chuyển từ `README.md` để giữ README tập trung
> vào sản phẩm hiện tại — hữu ích cho người dùng mới, nhà phát triển và nhà
> tuyển dụng mà không cần đọc toàn bộ lịch sử dự án.

---

## Giai đoạn 5 — Growth loop

- 🔥 **Share streak**: nút *Chia sẻ streak 🔥* trên thẻ thói quen tạo ảnh card 1080×1080 (tên + số ngày liên tiếp + heatmap 16 tuần) tải về làm story — mỗi bài share là một kênh marketing miễn phí. Trên điện thoại hỗ trợ **Web Share API** (chia sẻ ảnh thẳng vào app khác).
- 💬 **Feedback FAB**: nút 💬 góc phải dưới mở popup Góp ý — nối **Google Form** qua `FB_FORM_URL` và email qua `FB_EMAIL` (khai báo đầu file `js/app.js`). Mọi phản hồi đều theo dõi bằng event `feedback_click` (GA4).
- 📊 **Iterate theo analytics**: điền `GA4_ID` (đầu `js/analytics.js` — hiện đang placeholder `G-XXXXXXXXXX`) để bắt đầu đo. Các event sẵn sàng: `first_visit`, `return_visit`, `create_goal`, `create_habit`, `create_task`, `share_streak` (kèm số ngày + kênh: native/fallback/download), `feedback_click`, `onboarding_*`, `export_*`, `print`, `reminder_*`.
  - Mẹo iterate: xem GA4 → *Reports → Engagement → Events* — kênh nào (landing → app, share story, bạn bè giới thiệu) đem traffic về, đổ thêm công sức vào kênh đó.

---

## Lộ trình phát triển (đã hoàn thành)

- [x] Tổng quan tháng + habit tracker + reflection
- [x] View tuần (task + ghi chú 7 ngày)
- [x] View **Kế hoạch năm** (goals, biểu đồ quý/tháng, reflection)
- [x] Điều hướng **12 tháng** — mỗi tháng dữ liệu riêng biệt
- [x] **CRUD động** mục tiêu & thói quen (thêm/sửa/xoá, lưu localStorage)
- [x] **Streak & heatmap** kiểu GitHub + streak đa tháng
- [x] **Nút "Hôm nay"** + tự nhảy tuần hiện tại
- [x] **4 chủ đề màu** pastel + toggle ngôn ngữ **VI/EN**
- [x] **Xuất/nhập JSON + CSV** (đồng bộ Google Sheets)
- [x] **Chế độ in / PDF** (A4 ngang, checkbox ☐/☑)
- [x] **PWA** — cài đặt offline, chạy như app thật & nhắc việc hằng ngày
- [x] **Analytics GA4** — lượt truy cập, quay lại, tạo mục tiêu/thói quen
- [x] **Đăng nhập & đồng bộ đa thiết bị (backend riêng)** — username/password + Google OAuth, offline-first
- [x] **Landing page tách riêng** (`index.html`) — SEO tĩnh, OG image 1200×630 cho Facebook/Zalo
- [x] **Onboarding 3 bước** — mục tiêu năm → 2 thói quen → chủ đề màu (lần dùng đầu)
- [x] **Empty states** có hướng dẫn cho từng panel (mục tiêu, thói quen)
- [x] **Share streak 🔥** — ảnh card 1080×1080 (tên + streak + heatmap) tải về / chia sẻ native
- [x] **Feedback FAB** 💬 — Google Form (`FB_FORM_URL`) + email (`FB_EMAIL`) + event GA4

---

## Ghi chú triển khai theo phase

### Phase 2

- 🔍 **Tìm kiếm xuyên tháng** (`Ctrl+K`) — tìm theo tên task, ghi chú, tag hoặc mục tiêu.
- 📋 **Template tháng** — sao chép cấu trúc tháng (mục tiêu, thói quen & cấu trúc tuần) sang tháng khác.
- 🍅 **Pomodoro** — timer 25/5, bộ đếm cà chua, nghỉ dài theo chu kỳ.

### Phase 3

- 👤 **Tài khoản & Profile** — đổi mật khẩu, xoá tài khoản (modal Profile trong app).

### Phase 4

- ➕ **Thêm nhanh (Quick Add)** — thêm task nhanh từ mọi màn hình với ngày/giờ/thời lượng/ưu tiên.
- 🔔 **Nhắc việc habit/task** — mỗi thói quen & task có giờ nhắc riêng (nút 🔔 cạnh tên); danh sách nhắc bật/tắt ngay trong popup header.
- 📊 **Báo cáo tuần** — % mục tiêu, số xong/đang làm/tổng, tỉ lệ habit 7 ngày, thói quen nổi bật, ngày năng suất nhất; chia sẻ ảnh 1080×1080.
- 🍅 **Widget Pomodoro trong tuần view** — timer 25/5 ngay trong view Tuần, thống kê session hôm nay/tuần (`planner-pomo-log`).

### Phase 5

- ↩️ **Undo / Redo** — mọi thao tác (tick task/habit/goal, thêm/xoá, sửa text, sắp xếp, cả "Đặt lại"); snapshot tối đa 50 bước trong phiên, phím `Ctrl+Z` / `Ctrl+Shift+Z`.
- 🔀 **Kéo-thả sắp xếp** — task trong ngày, mục tiêu trong tháng/tuần/năm, thói quen trong bảng (lưu ngay, có undo).
- ⌨️ **Phím tắt** — `Ctrl+K` tìm kiếm · `1-5` chuyển view · `/` focus ô thêm task hôm nay · `Esc` đóng modal/chế độ tập trung.
- 🕑 **Sao lưu tự động** — 7 bản sao lưu (`planner-backup-0..6`, vòng xoay) sau mỗi thay đổi; chốt 1 bản trước khi import JSON.
- 🎯 **Chế độ Tập trung** — overlay tối giản chỉ còn task hôm nay + thói quen cần làm.
- 🗂 **Task Detail Drawer** — deadline · giờ · thời lượng · ưu tiên · lặp lại · tags · ghi chú · subtasks · nhắc việc.

### Phase 6

- ✨ **Thói quen mẫu & Demo** — 16 gợi ý thói quen thêm 1 chạm; nút Demo tạo sẵn 3 mục tiêu + 4 thói quen + 2 task.
- 😊 **Mood tracker** — chấm mood mỗi ngày, heatmap cả tháng, insight tự động (ngày vui vs ngày buồn).
- 📅 **Báo cáo năm** — % hoàn thành mục tiêu, tháng đạt mục tiêu nhất, thói quen nổi bật, ngày năng suất nhất; chia sẻ ảnh 1080×1080.
- 📥 **Nhập CSV** — khôi phục từ file xuất; dữ liệu trùng tên **gộp vào, không ghi đè**.
- 🔔 **Weekly digest** — tóm tắt hôm qua (thói quen bỏ lỡ, mục tiêu hôm nay) hiển thị trong nhắc hằng ngày.

### Phase 8–9

- 🔧 **Widget Settings** (Phase 8) — dashboard tuỳ chỉnh widget.
- 📊 **Thống kê tương quan focus × task** (Phase 9) — phân tích quan hệ giữa phiên tập trung và hoàn thành task.

### Sau Phase 9 — ổn định & bảo trì

- ♿ **A11y hardening** (P2.3) — audit harness, khôi phục focus cho task drawer.
- 📱 **Mobile QA suite** — real-device QA + sửa lỗi touch/menu phát hiện được.
- 🔁 **Module extractions từ `app.js`** (#28–#40): focus.js, pomo.js, … — xem [`appjs-responsibility-map.md`](appjs-responsibility-map.md).

---

## Personal Growth & Reflection — P1: Daily Reflection

- ✍️ **Daily Reflection** (P1) — module `js/reflection.js`, lưu `planner-reflections-daily` (key `YYYY-MM-DD`).
- ⚡ **Quick Reflection** — mood 5 mức (radiogroup, reuse `MOODS` + mirror sang `planner-mood` để heatmap nhất quán) + 2 ô ngắn (điều tốt / điều muốn cải thiện) + nút Lưu.
- 🧠 **Deep Reflection** — modal 4 câu hỏi (vui / chưa tốt / tiếp tục phát huy / cải thiện) + ô "điều quan trọng nhất ngày mai", autosave debounce 500ms.
- 📊 **Daily summary strip** (Phase 11) — trước form reflection: tasks `x/y`, habits `x/y`, Focus thời gian, % mục tiêu tháng.
- 📜 **Reflection history** (Phase 21) — nhóm theo tháng, click mở lại entry để xem/sửa.
- 🔌 **Sync/export tự động** — key `planner-*` mới đồng bộ + nằm trong JSON export/backup như mọi key khác, không cần đổi backend (whole-key JSONB).
- 🧪 Kiểm chứng: unit 307/0 (15 test mới `phase11-reflection.test.mjs`), E2E Chromium đầy đủ + scenario `reflection` (3 viewport) + Firefox/WebKit OK, a11y 62/0, mobile QA 262 checks, Lighthouse không hồi quy.

## Personal Growth & Reflection — P2: Monthly Life Pillars + Monthly Focus

- 🗂 **Trụ cột tháng** (P2) — module `js/pillars.js` (window.TaskFlowPillars), dữ liệu `state.pillars = [{ id, name, icon, hidden, focus }]` additive trong month state.
- 🏗 **Template 3 trụ cột mặc định** — Cơ thể / Việc chính / Tương tác (i18n vi/en), migration additive qua `ensurePillars` ở `loadState`/`loadMonthStateOrCreate`/`save()` + `defaultState`/`emptyState`; dữ liệu tháng cũ giữ nguyên, id ổn định `p1/p2/p3` (an toàn cho sync/carry-over).
- ✏️ **CRUD trụ cột** — đổi tên, đổi icon (grid 16 emoji, radiogroup), ẩn/hiện (giữ dữ liệu), thêm trụ cột riêng, xoá (confirm), reset về template mặc định (confirm); modal `pillarEditModal` qua `TaskFlowUI.openDialog`.
- 🎯 **Monthly Focus** — mỗi trụ cột 1 ô focus, autosave debounce `saveSoon()` qua input listener (pattern reflection); hiển thị trong goals widget (Overview tháng) phía trên mục tiêu tháng cũ — legacy `monthlyGoals` giữ nguyên song song theo quyết định P0.
- 🧪 Kiểm chứng: unit 327/0 (20 test mới `phase12-pillars.test.mjs`), E2E Chromium đầy đủ + scenario `pillars` (13 scenario × 5 viewport) + Firefox/WebKit OK, a11y 62/0, CSS verifier 0 diffs, mobile QA 262 checks, Lighthouse không hồi quy (app-mobile 76–77, nhiễu).

## Personal Growth & Reflection — P3: Monthly Metrics

- 📊 **Monthly Metric model** — mở rộng `js/pillars.js`: `state.pillars[].metrics = [{ id, title, type: HABIT|MANUAL|CUSTOM, linkedHabitId, target: { mode: daily|perWeek|perMonth|custom, value }, days: [bool × ngày tháng] }]`.
- 🔗 **Metric ↔ Habit** — `type: HABIT` + `linkedHabitId`: progress đếm ngày habit đã tick trong tháng (skipDays không tính), habit bị xoá → fallback MANUAL (dữ liệu metric không mất).
- 📆 **Target theo day-count thật** — daily → số ngày tháng (28/29/30/31, không hard-code 30); perWeek → ceil(value × ngày/7); perMonth/custom → value.
- ⏱ **MANUAL/CUSTOM** — ô ngày tự đánh dấu (day-strip), toggle qua dispatcher, re-render chỉ dòng (giữ scroll).
- 🧪 Kiểm chứng: unit 349/0 (22 test mới `phase13-metrics.test.mjs`: target modes 28/30/31/leap, HABIT link, habit bị xoá, MANUAL toggle, migration), E2E Chromium đầy đủ + scenario `metrics` + Firefox/WebKit OK, a11y 62/0, CSS verifier 0 diffs, minify 59 file, Lighthouse không hồi quy (app-mobile 76 — đợt đo 70/73 là nhiễu máy, lặp lại 3 run xác nhận).

## Visual Theme Refinement — P1: Token palette (Zen Linen × Amber Hearth × Sage Mist)

- 🎨 **New semantic token palette** (css/tokens.css only, no component CSS yet): 60% Zen Linen warm paper surfaces + 25% Amber Hearth burnt-orange actions + 15% Sage Mist growth/success.
- 🧩 **New tokens:** `--color-on-accent` (dark mode: dark-brown text on amber 6.14:1 — fixes the old 2.77:1 white-on-amber dark button failure at the token layer), `--color-accent-hover`, `--color-positive-soft`, `--shadow-sm`; shadows softened to low-contrast linen system.
- 🎭 **4 themes re-tinted to the same design language** (accent stays TaskFlow orange for brand consistency): cream = Zen Linen, mint = sage, lavender = quiet reflection, peach = amber warm; dark mode = warm browns, never pure black.
- 🔤 Contrast-verified every theme × dark: muted/secondary ≥4.5, control/focus ≥3.0, on-accent ≥3.0 — 0 fails across all 8 combos (hardening tests + fresh computation).
- 📄 tokens.css minified (6.6KB → 4.2KB), app.html tokens.min.css?v=8, sw.js CACHE v187.
- 🧪 Kiểm chứng: unit 349/0 (version asserts updated), a11y 62/0, CSS verifier 6 view × 6 combo 0 diffs, minify --check 59 file OK, E2E overview + dialogs OK, preview visual QA light/dark × cream/mint/lavender/peach all render correct.
- ⏭ **P1 scope note:** legacy kawaii palette in styles.css `:root` (--ink 315×, --card-bg, --accent-btn #C24E28...) still shadows token changes in legacy views — aliasing to semantic tokens is the first step of P2.

## Visual Theme Refinement — P2: Legacy alias + buttons/inputs/cards (Amber Hearth)

- 🔗 **Alias legacy kawaii palette → semantic tokens** (css/styles.css `:root` + dark base + 3 dark variants): `--ink → var(--color-text)`, `--ink-rgb` = rgb của text mới (51,47,42 light / 243,236,227 dark), `--card-bg → var(--color-surface)`, `--bg-main → var(--color-canvas)`, `--accent-deep/--accent-btn/--terracotta → var(--color-accent)`, `--peach-bar → var(--color-accent-soft)`, `--surface*/--panel-* → surface-muted`. Derived rgba vars (bg-grid/ink-soft/card-border) giữ formula → tự theo ink-rgb. Decorative day-header/brick/tag giữ literal (identity). `--ink-solid` giữ literal dark (#4A403A) vì là fill đằng sau glyph trắng.
- 🟠 **Buttons (Amber Hearth):** primary CTA + skip-link + toast-action + tag-chip + cal-focus + habit-add chuyển `#fff/#fffdf9 → var(--color-on-accent)`; hover `#994329/#9c3d24/#b3482a → var(--color-accent-hover)`; dark override block app-shell token-driven. **Dark button giờ là chữ nâu đậm #2A1C12 trên amber #E08763 = 6.14:1** (fix lỗi cũ white-on-amber 2.77:1).
- 📝 **Inputs:** focus = accent border + soft accent ring (color-mix 16%) — Amber Hearth focus, keyboard ring vẫn do rule toàn cục.
- 🔢 Version bumps: components v7, app-shell v18, styles-critical/deferred v6, sw CACHE v188; re-split + re-minify + verify.
- 🧪 Kiểm chứng: unit 349/0, CSS verifier 6 view × 6 combo **0 diffs**, E2E Chromium đầy đủ RELEASE OK, FF + WebKit (reflection/pillars/metrics) OK, a11y 62/0, mobile QA 262/0, minify --check 59 file, preview visual QA light/dark — progress bar hbar giờ là gradient accent #A84F2E, legacy vars resolve đúng (--ink #332f2a, --card-bg #fffdf8).

## Visual Theme Refinement — P3: Sidebar + topbar (Zen Linen shell)

- 🧰 **Topbar de-glass:** bỏ `backdrop-filter: blur(14px)` + nền glass → giấy warm `color-mix(canvas 94%, surface)`, border dưới mảnh hơn `color-mix(border 70%, transparent)` — hết cảm giác "toolbar kỹ thuật". Mobile nav giữ blur(16px) (bottom sheet cần phân lớp nội dung cuộn qua).
- 🎨 **Sidebar:** active nav đã có soft accent bg + orange icon (từ a11y P2.3) — giữ nguyên; hover warm muted surface, inactive neutral không border, collapsed giữ behavior.
- 🟠 **Add button:** `.app-primary-action.button-primary` đã orange (P2); dark mobile FAB giữ `#b3482a` + white + (5.42:1) — có chủ đích (glyph trắng trên nền terracotta đậm).
- 🔢 Version bumps: app-shell v19, sw CACHE v189; re-minify.
- 🧪 Kiểm chứng: unit 349/0, CSS verifier 0 diffs, a11y 62/0, E2E overview + dialogs OK, preview computed-style xác nhận topbar backdrop none + nền warm, active nav accent-soft + accent text, dark FAB đúng.

## Visual Theme Refinement — P4: Today + task surfaces

- 🃏 **Today card = surface cream ấm** (`--color-surface` thay vì `--color-surface-elevated` trắng tinh) + border warm `--color-border` + shadow-panel nhẹ — Zen Linen.
- ✅ **Completed task/habit = sage status** (Sage Mist): `.today-task.done .task-text` và `.today-habit.done .today-habit-name` chuyển `--color-text-muted` → `--color-positive` (light `#55735D`, dark `#89AE91`) + giữ line-through — hoàn thành giờ đọc là "growth" không chỉ "mờ đi".
- 🟠 **Progress:** `.today-progress-fill` giữ accent orange (primary task context = orange per Amber Hearth); sage dành cho completed status.
- 👋 Greeting đã accent nhẹ từ trước (`--color-accent`) — giữ.
- 🔢 Version bumps: styles-critical/deferred v7, sw CACHE v190; re-split + re-minify + verify.
- 🧪 Kiểm chứng: unit 349/0, CSS verifier 0 diffs, a11y 62/0, E2E overview + dialogs OK, mobile QA 262/0, minify --check 59 file, preview: toggle task → done text sage `#55735D` light / `#89AE91` dark + card surface cream.

## Visual P5 — Reflection / Monthly Goals / Habits polish (Zen Linen × Amber Hearth × Sage Mist)

- 📖 **Reflection journal-like**: `.reflect-quick` layout thoáng (flex column, gap), `.reflect-textarea` nền `--color-surface-muted` + border warm `--color-border` + radius-input — không còn cảm giác admin form; mood row radiogroup giữ.
- 🎨 **Pillar semantic colors** (qua `data-pillar-id` — không đổi logic): p1 Cơ thể → sage (`border-inline-start: var(--color-positive)` + metric bar sage), p2 Việc chính → TaskFlow orange (default), p3 Tương tác → muted info blue. Pillar user thêm (p4+) giữ accent. Dùng border + metric bar, không dùng 3 nền mạnh.
- 🌿 **Habits sage heatmap**: thang `hm-l1..l5` chuyển orange → sage (light `#e4ede6 → #55735d`; dark `rgba(137,174,145,.18) → #89ae91`) — cập nhật cả 3 chỗ (light, dark override, `@media print`); `hm-mini-cell.on` + `hm-streak-badge` theo sage/amber. Không bright green.
- 🔢 Version bumps: styles v8, sw CACHE v191; re-split + re-minify + verify.
- 🧪 Kiểm chứng: unit 349/0, CSS verifier 0 diffs, a11y 62/0, E2E Chromium full matrix RELEASE OK, mobile QA 262/0, minify --check 59 file, preview: pillar border p1 sage `#55735D`/dark `#89AE91` · p2 orange · p3 info blue, heatmap ribbon dark = 5 mức sage, reflection journal render, 0 console errors.

## Visual P6 — Landing page polish (Zen Linen × Amber Hearth)

- 🟠 **CTA burnt orange**: `--landing-action-bg` `#a9472d` → **`#a84f2e`** (khớp `--color-accent` light — hết 2 màu orange), hover `#913a25` → **`#913f24`** (`--color-accent-hover`). White text 5.49:1 ✓ (test bắt buộc hex + ≥4.5 giữ nguyên).
- 🖼 **Screenshot frame**: `.product-preview` shadow nặng `0 28px 72px / .18` → **`--shadow-floating`** (linen nhẹ `0 8px 24px / .07 + 0 18px 48px / .12`); dark override giảm `.42 → .35`. Border warm `--color-border` giữ.
- 🃏 **Feature cards**: gap `16 → 20px`, padding `28 → 30px`, thêm `--shadow-sm` nhẹ — "less shadow, more spacing" đúng brief; border warm giữ.
- 🧱 **Footer**: đã neutral (`--color-sidebar` + border-top) — giữ. CTA band cuối `#403934` warm dark giữ (không phải accent).
- 🔢 Version bumps: landing.css v9 → v10, sw CACHE v191 → v192; re-minify landing.min.css.
- 🧪 Kiểm chứng: unit 349/0 (test landing action hex+contrast vẫn pass), E2E overview OK, a11y 62/0, minify --check 59 file, preview: light — canvas linen `#F4F0E8`, CTA `#A84F2E`+white, footer `#FAF7F1`; dark — CTA giữ `#A84F2E`+white 5.49 ✓, preview shadow dark.

## Visual P7 — Dark mode QA toàn diện (4 theme × dark, component-level)

- 🎯 **Audit mới `scripts/audit-dark-contrast.py`**: đo computed styles THẬT (không phải token) cho từng component đã polish ở P2-P6, trên cả 4 theme (cream/mint/lavender/peach) × dark, so WCAG AA (text 4.5:1, non-text 3:1). App: primary btn, reflect-input ×2, today-card title, mood btn on, muted text, done task sage, pillar border p1/p2/p3 + focus input + name, heatmap l1/l5 vs card. Landing: primary, skip, feature-accent, cta-final text + eyebrow, hero lead, footer.
- ✅ **Kết quả: ALL PASS (0 dưới AA)** — nổi bật: primary btn dark amber `#E08763` + nâu `#2A1C12` = **6.14:1** · pillar border sage/orange/blue 5.58–6.10:1 (≥3) · heatmap sage 8.53:1 · done task sage 8.53:1 · landing primary 5.49:1 · cta-final 11.33:1 · eyebrow 5.82:1 · hero lead 7.60:1. Không cần sửa CSS nào ở P7.
- 🔍 **Phương pháp**: seed mood + done task qua click (state fresh không có `.on`/`.done` → đã xử lý bằng cách click thật rồi đo); heatmap so với nền `.habit-heat-card`; pillar/heatmap đo ở view overview (không phải today).
- 📸 Screenshots dark 4 theme (today + overview) → `docs/qa/dark-{theme}-*.png`.
- 🧪 Kiểm chứng: unit 349/0, a11y 62/0, CSS verifier 0 diffs, E2E overview OK, minify --check 59 file, preview theme-switch dark resolve đúng 4 canvas, 0 console errors.

## Visual P8 — Mobile QA toàn diện (360x800 / 390x844 / 412x915)

- 📱 **Mở rộng `scripts/e2e-mobile-qa.py` thêm 14 check reflection/viewport**: quick card renders, 5 mood radios, quickGood/quickImprove present + font-size ≥16px (iOS zoom), mood select highlights (click → `.on`), quick save persists entry (verify localStorage `planner-reflections-daily`), deep modal opens + 4 textareas + fits viewport + closes, history opens + lists saved entry + closes, overflow checks. Bottom nav/More sheet/Quick Add/Task Drawer đã cover sẵn từ trước.
- ✅ **MOBILE QA: 318 checks / 0 FAIL** (tăng từ 262 → 318) trên chromium — 3 viewport 360x800/390x844/412x915 + tablet 768x1024; **0 pageerrors**.
- 🎨 Palette Zen Linen mới không gây regression: không overflow, touch target ≥44px, input ≥16px trên mọi viewport.
- 🌐 **FF/WebKit**: reflection block verify riêng (quick card 5 moods + deep modal 4 textareas + history opens) — **OK cả 2 browser**. Lưu ý: full mobile-qa suite chỉ chạy touch emulation cho chromium (`touch = browser_name == "chromium"`) — FF/WebKit fail ở SEARCH section là quirk pre-existing của harness (element intercept pointer events), không phải do reflection hay palette.
- 🧪 Kiểm chứng: unit 349/0, a11y 62/0 (More Sheet mobile: dialog semantics, focus, tab trap, names), E2E Chromium full matrix RELEASE OK, mobile QA 318/0.

## Visual Theme Refinement — FINAL VERIFICATION (sau P8)

- ✅ Toàn bộ 9 phase (P0 audit → P8 mobile QA) hoàn thành; final battery trên trạng thái sạch:
  - Unit **349/0** · E2E Chromium full matrix **RELEASE OK** · a11y **62/0** · mobile QA **318/0** · minify **59 file** · CSS verifier **0 diffs** · dark contrast audit **ALL PASS** (4 theme × dark, component-level).
- 🚀 **Lighthouse final**: landing-desktop **99** (FCP ~576ms LCP, CLS .067, TBT 0) · landing-mobile **98** · app-desktop **97** · app-mobile **77** (LCP 6249ms, CLS 0, TBT 45ms) — **bằng/trên baseline**, không regression performance từ theme work (theme là CSS variables thuần, không thêm asset/network).
- 🎨 Kết quả Visual Theme Refinement: Zen Linen canvas/surface/shadow, Amber Hearth CTA/active (dark amber + nâu 6.14:1), Sage Mist habits/positive/heatmap, dark 4 theme warm không pure black, contrast component-level AA verified.

## 🚀 Lighthouse BEFORE vs AFTER (final, 2026-08-11 13:44)

Chạy lại `measure-lighthouse.py --runs 3` trên state sạch; so với baseline gốc (commit `36bb1b6`, 2026-08-09).

| Page | Device | Perf | FCP | LCP | TBT | SI | CLS |
|---|---|---|---|---|---|---|---|
| Landing | Desktop | 99→99 | 648→**564** | 648→**564** | 0→0 | 648→**564** | .068→.067 |
| Landing | Mobile | 88→**98** | 3060→**1684** | 3060→**1684** | 0→0 | 3060→**1684** | 0→.067* |
| App | Desktop | 97→97 | 731→**527** | 1227→1303* | 0→0 | 908→**562** | .001→.002 |
| App | Mobile | 68→**77** | 3486→**1808** | 5795→6272* | 172→**29** | 3852→**1808** | 0→0 |

Ghi chú trung thực: app-mobile LCP dao động 5.5–6.3s là nhiễu emulation (mọi baseline post-split đều trong band đó) — FCP/TBT/SI giữ gains, perf score 68→77. Landing-mobile CLS 0 ban đầu là sample may; các run sau đều ~.067. Bảng đầy đủ: `docs/lighthouse/COMPARISON.md` (giữ được qua các lần chạy script vì BASELINE.md bị overwrite mỗi run).

## 🧪 Fix harness quirk: touch emulation trên Firefox/WebKit (mobile QA)

`e2e-mobile-qa.py` trước đây chỉ bật `has_touch` cho chromium (`touch = browser_name == "chromium"`), nên FF/WebKit không khớp media query `pointer: coarse` → row actions giữ `pointer-events:none`, click bị intercept (fail ở SEARCH section).

Fix: `has_touch=True` cho mọi engine (Playwright hỗ trợ đủ 3), chỉ giữ `is_mobile` riêng cho chromium (Chromium-only trong Playwright). Kết quả: **cả 3 browser đều 0 FAIL / 318 checks** (trước: chromium 318/0, FF/WebKit fail ở SEARCH).

## 🎨 Icon system (phase 1): mở rộng sprite +18 symbol

Thêm 18 symbol mới vào `icons/ui-sprite.svg` (Lucide-style geometry, đúng chuẩn hiện tại: 24×24, `stroke-width=1.8`, `fill=none`, `stroke=currentColor`, round caps/joins): sun, heart-pulse, users, target, sprout, clock, flag, notebook-pen, list-checks, check, sparkles, cloud-rain, wrench, sunrise, calendar-check, refresh, circle-stop, play. Sprite: 30 → **46 symbols**.

Pure-additive (không đụng 30 symbol cũ, không đổi consumer nào). Verify: XML parse OK · mọi symbol stroke nhất quán · sprite phục vụ đủ 46 qua HTTP + fetch in-page (lưu ý: `getBBox` trên `<use>` trỏ sprite ngoài là false-negative — dùng fetch-check thay thế). CACHE bump `v192 → v193` (test assert cập nhật) để PWA cài sẵn re-precache sprite. Unit **349/0**, minify 59 file OK. Screenshot: `docs/qa/icons-new.png`.

## 🎨 Icon system (phase 2): Today nav → sun + close buttons → sprite `close`

**Today nav:** `js/app.js` `{ view: 'today', icon: 'calendar' }` → `'sun'` — hết tình trạng 1 icon calendar dùng cho 3 nghĩa (Today nav, Calendar view, task deadline meta). Desktop sidebar + mobile nav + more sheet đều tự theo (cùng items array).

**Close buttons ✕ → sprite `close`:** thay toàn bộ text glyph ✕ (29 chỗ `>✕<` + remind-ui programmatic + tag-clear + widget-toggle ✓/✕ + task-menu menuitem = 33 glyph):
- app.html: 19 nút modal static thêm `data-shell-icon="close"` (hydrate bởi `renderShellIcons()` lúc boot — đúng pattern sẵn có)
- JS templates (app.js delgoal ×6, td-tag-del, td-subtask-del, tag-clear; today.js deltask ×2; inbox.js; remind-ui ×2): `${window.TaskFlowUI.icon('close')}` inline
- widget-toggle ✓/✕ → sprite `check`/`close` (trạng thái hiển thị widget)

**CSS sizing** (styles.css): `.sync-close/.task-drawer-close .ui-icon` 15px · `.btn-del/.td-tag-del/.td-subtask-del` 12px · `.mini-btn` 13px · `.tag-chip` 11px · `.widget-toggle` 16px — icon nhỏ không phình.

### Kiểm chứng
| Check | Kết quả |
|---|---|
| Unit tests | **349/0** (app.min.js v=162 + CACHE v194 assert update) |
| CSS verifier | **0 diffs** |
| E2E Chromium full matrix | **E2E RELEASE OK** |
| a11y | **62/0** |
| mobile QA | **318/0** |
| minify | 59 file OK |
| Preview real-app | today nav `#sun` ✓ · tools-close `#close` ✓ · quickadd-close `#close`, không còn ✕ text ✓ · **49 shell icons hydrated** |

**1 QA note:** lần đo đầu báo tools-close NO-ICON là bug của script check — `[data-action="tools-close"]` match backdrop div trước (DOM order), không phải nút. Dùng `button[data-action=...]` thì đúng.

## 🎨 Pillar icons: emoji → sprite (heart-pulse/target/users + palette 16)

**`js/pillars.js`** — bỏ hoàn toàn emoji trong palette pillar:
- `ICONS` → 16 sprite name: heart-pulse, target, users, home, book, sprout, moon, rocket, bolt, briefcase, palette, brain, sparkles, sunrise, sun, clock (đều đã có trong `icons/ui-sprite.svg`, stroke 1.8)
- `EMOJI_TO_ICON` migration map (16 emoji cũ → sprite tương đương, ví dụ 💪→heart-pulse, 🏃→bolt, 🥗→sprout); `migrateIcon()` giữ nguyên icon custom/lạ — không mất dữ liệu
- `normalizePillar` migrate icon lúc load (idempotent, additive — dữ liệu cloud cũ vẫn đọc được, lần save sau persist tên sprite)
- Render qua `iconHTML()` → `TaskFlowUI.icon(name)` (sprite) với fallback text cho icon custom/môi trường Node

**`css/styles.css`** — `.pillar-icon .ui-icon` + `.pillar-icon-opt .ui-icon` = 20px (khớp `--text-lg` trước đây).

**Tests/E2E:** phase12: 22 test (thêm migrateIcon + normalizePillar migrate, ICONS phải tồn tại trong sprite); E2E pillars: click `bolt`/`book`, assert `use[href*="bolt"]`.

**Verify (browser thật):** seed dữ liệu cũ 💪🎯🤝 → reload → render `#heart-pulse/#target/#users`, localStorage migrate `['heart-pulse','target','users']`, 0 ô emoji còn lại; edit modal 16 ô sprite, selected = heart-pulse. Screenshot `docs/qa/pillars-sprite.png`.

**Gates:** unit 351/0 · E2E RELEASE OK · a11y 62/0 · mobile QA 318/0 · CSS verifier 0 diffs · minify 59 file · CACHE v195 · pillars.min.js v2, styles v10.

Lưu ý: mini-btn action trong pillars block (✏️🙈🗑↺) vẫn là emoji — thuộc phase "task/action icons" riêng, chưa đụng.
