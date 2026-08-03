# Plan: Phase 5 — Trải nghiệm & an toàn dữ liệu (Undo, Kéo-thả, Phím tắt, Sao lưu, Analytics, Focus Mode)

- Ngày: 2026-08-03
- Spec gốc: `docs/superpowers/specs/2026-08-03-feature-roadmap-design.md` (mục 5.1–5.6)
- Phong cách: vanilla JS, không framework; i18n luôn thêm cả `vi` + `en`; TDD — logic thuần đưa vào module `js/plan-math.js` / `js/plan-stats.js` (đã có `window.PlanMath`/`window.PlanStats` + `module.exports`); test bằng `node --test`.

## Bối cảnh code (đã khảo sát)

- **Version hiện tại**: `styles.css?v=43`, `app.js?v=37`, `deeplink.js?v=2`, `plan-stats.js?v=1`, `sync.js?v=3`, `api-config.js?v=1`, SW cache `taskflow-v32`. Mọi file đổi phải bump.
- **Search modal sẵn có**: `searchModal` (app.html:187) + `openSearchModal()`/`closeSearchModal()` (app.js:3648/3658) + `renderSearchResults(q)` (3694), phím Esc đóng (app.js:4755–4770). → Phase 5.3 chỉ cần gắn phím tắt, không viết lại.
- **keydown handler**: `document.addEventListener('keydown')` (app.js:4479) hiện `return` ngay nếu `e.ctrlKey/altKey/shiftKey/metaKey` — vì vậy `Ctrl+Z`/`Ctrl+K` chưa hề được xử lý. Thêm nhánh **trước** guard đó.
- **Mutation points** (nơi cần push undo snapshot): `act === 'task'` (app.js:4206), `'addtask'` (4209), `'deltask'`, `'wgoal'` (4200), `'addgoal'` (4213, scope m/w/y/ym), `delgoal`, habit tick (`data-action="habit"`), `note` blur (4461), `task-text` blur (4464), `reflection` blur (4452), `'reset'` (4412).
- **Export/import sẵn có**: `export-json`/`import-json` (app.js:4361–4368, app.html:122–123) + `collectAllData()` (1514) + `restorePlan(p)` (171). → Sao lưu tự động tái dùng `collectAllData`/`restorePlan`.
- **GA4**: `GA4_ID = 'G-XXXXXXXXXX'` + `GA4_ENABLED` (app.js:1225–1226); `trackEvent()` (1261) đã được gọi khắp nơi. `FB_FORM_URL`/`FB_EMAIL` rỗng (1230–1232). → Phase 5.5 chỉ là **cấu hình + UI menu**, không đổi engine.
- **Widget pomodoro**: `pomo-widget` trong `view-week` (Phase 4.3) + overlay `pomoPanel`. → Focus Mode tái dùng engine + widget, không tạo state mới.

## Task 1 — Undo / Redo (5.1)

- **Module**: thêm `window.PlanMath.makeUndoStack(limit = 50)` → `{ push(snapshot), undo(), redo(), canUndo(), canRedo(), clear() }` (pure, test trong phase5.test.mjs).
- **Snapshot**: `JSON.parse(JSON.stringify(state))` — state gọn (~vài trăm KB), chấp nhận 50 bản trong bộ nhớ; KHÔNG lưu xuống localStorage (tránh phình) — undo chỉ trong phiên.
- **app.js**: biến `let undoStack = PlanMath.makeUndoStack();` + `let redoStack = ...`. Hàm `pushUndo()` gọi `snapshot()` (state hiện tại) → `undoStack.push`, clear redoStack. Gọi `pushUndo()` ở **đầu** mỗi mutation handler liệt kê ở Bối cảnh (trước khi đổi state) — nhưng tránh gọi trùng: bọc trong `withUndo(fn)` helper.
- **UI**: 2 nút ↩️↪️ trong header (cạnh nút reset, `.btn-reset` pattern) `data-action="undo"`/`"redo"`, disabled khi không có. Nút `undo` → `const s = undoStack.undo(); if (s) { state = s; redoStack.push(snapshotNow()); renderAll(); save(); }` (đối xứng cho redo).
- **Keydown** (app.js:4479): trước guard, thêm `if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }`.
- **i18n**: `undoBtn`/`undoAria`, `redoBtn`/`redoAria` (vi + en).
- **Test textual** (phase5.test.mjs): app.js chứa `makeUndoStack`, `data-action="undo"`, `data-action="redo"`, `e.key.toLowerCase() === 'z'`; i18n `undoBtn`/`redoBtn` ở cả vi + en; test unit cho `makeUndoStack` (push/undo/redo/canUndo/limit).

## Task 2 — Kéo-thả sắp xếp (5.2)

- **Task trong ngày** (`.task-row`): `draggable="true"` trên mỗi row, `dragstart` lưu `{week, day, index}` vào `dataTransfer`, `dragover` trên row khác → `preventDefault` + class `.drag-over`, `drop` → reorder `w.days[d].tasks` bằng splice, `renderWeek()`, `save()`, `trackEvent('reorder_task')`.
- **Goal trong tháng/tuần/năm** (`.goal-item`): tương tự, đổi thứ tự mảng `state.monthlyGoals` / `w.goals` / `yearState.goals`; `renderOverview()`/`renderWeek()`/`renderYear()`.
- **Habit trong bảng** (`.habit-table tbody tr`): đổi thứ tự `state.habits`; `renderOverview()`.
- **Gắn drag trong hàm render**: vì render lại toàn bộ mỗi lần, dùng event delegation trên container (`dragstart`/`dragover`/`drop` ở document, đọc `data-` attributes). `data-week`, `data-day`, `data-task`, `data-id` đã có sẵn trên các element.
- **CSS**: `.task-row[draggable="true"] { cursor: grab }`, `.drag-over { outline: 2px dashed var(--terracotta); }` (+ dark mode dùng biến sẵn).
- **i18n**: `dragHint` (title tooltip) vi + en.
- **Test textual**: app.js chứa `draggable`, `dragstart`, `dataTransfer.setData`, `'drop'`; CSS chứa `.drag-over`.

## Task 3 — Phím tắt & Command Palette (5.3)

- **Ctrl+K** (mở/đóng search modal): trong keydown (4479) trước guard: `if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggleSearchModal(); return; }`. `toggleSearchModal()` = mở nếu đóng, đóng nếu mở + focus `#searchInput`.
- **Phím số 1–5** (chuyển view, khi không focus trong input/editable): `e.key` trong `'1'..'5'` → `setView(['overview','week','year','calendar','week'][n-1])` (ánh xạ theo thứ tự tab). Chỉ khi `e.target` không phải input/contenteditable.
- **`/` focus ô nhập task** (khi đang ở view tuần và không focus input): tìm `.btn-add` đầu tiên trong `.task-rows` của ngày hôm nay → click. Chỉ khi không focus input.
- **Esc** đã xử lý modal (4755) — giữ nguyên.
- **i18n**: `shortcutHint` (tooltip header) vi + en.
- **Test textual**: app.js chứa `e.key.toLowerCase() === 'k'`, `setView(['overview'`, `'/' focus` handler (hoặc tương đương); i18n `shortcutHint`.

## Task 4 — Sao lưu tự động (5.4)

- **Ring buffer 7 bản**: key `planner-backup-0..6` + `planner-backup-idx`. Hàm `rotateBackup(data)`: tăng idx, ghi vào slot hiện tại. Gọi khi: `save()` sau mutation, `window.Sync` push thành công, mỗi lần `refreshToday()` (mốc ngày mới), và trước `restorePlan` (bảo vệ bản hiện tại).
- **Dung lượng**: mỗi snapshot = `collectAllData()` JSON (~vài trăm KB). 7 bản ~ 2–3 MB localStorage — chấp nhận (app đã là PWA offline-first). Nếu `QuotaExceededError` → xoá slot cũ nhất rồi thử lại (catch rỗng như pattern hiện có).
- **UI khôi phục**: trong settings pop (cạnh export/import, app.html:122–123) thêm nút `data-action="backup-restore"` → modal liệt kê 7 bản (giờ lưu + preview ngày đầu/cuối) → chọn → `restorePlan(bản)` + `confirm`. i18n `backupRestore`, `backupEmpty`, `backupRestoreDone`.
- **Test textual**: app.js chứa `planner-backup`, `rotateBackup`, `data-action="backup-restore"`; i18n `backupRestore` vi+en.

## Task 5 — Kích hoạt Analytics & Feedback (5.5)

- **app.js**: `GA4_ID` (1225) — nếu user cung cấp ID thật thì `GA4_ENABLED` tự bật (đã có cơ chế). Không đổi code engine.
- **UI feedback**: thêm nút `data-action="feedback"` trong menu/settings → mở modal nhỏ: nếu `FB_FORM_URL` có giá trị → iframe/link mở form (`trackEvent('feedback_click', { kind:'form' })` — đã có ở 4390); nếu rỗng → hiện text "chưa cấu hình" (giống `fbNoForm` đã có, app.js:639).
- **README + landing**: thêm mục "Kích hoạt Analytics & Góp ý" (đã có bản gốc từ Phase 0.6 — cập nhật link config) + trên landing index.html mục nhỏ.
- **Test textual**: app.js chứa `data-action="feedback"`; i18n `feedback`/`fbTitle` ở cả vi + en.

## Task 6 — Chế độ Tập trung (5.6)

- **app.html**: section `#focusOverlay` (cuối body, ẩn mặc định): backdrop mờ + `.focus-card` chứa: ngày hôm nay, danh sách task hôm nay (từ `state.weeks` ngày hiện tại, checkbox tick được), habit cần làm hôm nay (chưa tick), widget pomodoro tái dùng (render giống `.pomo-widget`), nút thoát `data-action="focus-close"`.
- **app.js**: `openFocusMode()`/`closeFocusMode()`: ẩn `.site-header` + `.view.active` (hoặc đặt body class `focus-mode`), hiện `#focusOverlay`, render nội dung; `closeFocusMode` ngược lại. Esc thoát (nối vào handler 4755). Tick task/habit trong overlay gọi mutation bình thường (cùng handler `act === 'task'`/habit) + `refreshFocusContent()`.
- **CSS**: `body.focus-mode .site-header, body.focus-mode .view { display: none }`, `#focusOverlay` full-viewport flex center, nền `var(--bg-main)`; dark mode dùng biến sẵn.
- **Nút mở**: nút 🎯 trong header `data-action="focus"` (cạnh undo/redo).
- **i18n**: `focusTitle`, `focusToday`, `focusHabits`, `focusClose`, `focusOpen` (vi + en).
- **Test textual**: app.js chứa `openFocusMode`, `data-action="focus"`, `focusOverlay`; CSS chứa `.focus-mode`; i18n `focusTitle` vi+en.

## Task 7 — Verification chốt phase

1. `node --check` toàn bộ JS (app.js, plan-math.js, plan-stats.js, deeplink.js, sync.js, api-config.js, sw.js).
2. `node --test tests/*.test.mjs` (phase0 + phase1 + phase2 + phase5 mới) + `node test-sync.js` → tất cả xanh.
3. sw.js: bump `taskflow-v32` → `taskflow-v33`. app.html: bump `app.js?v=37→38`, `styles.css?v=43→44` (nếu đổi).
4. Smoke browser (python http.server + Playwright):
   - Undo: tick 1 task → Ctrl+Z → untick; xoá goal → Ctrl+Z → hiện lại; Ctrl+Shift+Z → redo.
   - Kéo-thả: đổi thứ tự 2 task trong ngày → reload → thứ tự giữ nguyên.
   - Ctrl+K mở/đóng search; phím 1–5 chuyển view.
   - Sao lưu: sau vài mutation, mở modal khôi phục → chọn bản cũ → dữ liệu quay lại bản đó.
   - Focus mode: mở → chỉ còn task hôm nay + habit + pomodoro; tick task; Esc thoát.
   - Hồi quy: deep link, toggle habit, export CSV, reminders, báo cáo tuần vẫn chạy.
5. Cập nhật README (tính năng Phase 5) + đánh dấu 5.1–5.6 DONE trong spec.
6. KHÔNG commit (user tự quyết định).

## Rủi ro / lưu ý

- **Undo snapshot size**: state chứa 12 tháng + habits + năm — nếu phình quá 50 bản gây lag, giảm `limit` xuống 20 hoặc snapshot lazy (chỉ tháng hiện tại). Test benchmark nhanh trong smoke.
- **Kéo-thả trên mobile**: HTML5 DnD không hoạt động tốt cảm ứng — thêm fallback nút ⬆️⬇️ (hoặc chấp nhận giới hạn "desktop-first", ghi rõ). Mobile vẫn dùng được qua nút mũi tên nhỏ.
- **Quota localStorage**: backup ring buffer + SW cache có thể chạm quota trên thiết bị cũ — luôn try/catch + dọn slot cũ.
- **Ctrl+Z conflict**: trong ô contenteditable/input, Ctrl+Z phải để trình duyệt undo text (guard: `if (e.target.closest('input, [contenteditable]')) return;` trước khi xử lý undo state).
- **Giới hạn đã biết (text edit không nằm trong undo stack)**: thay đổi text qua blur handler (task-text, goal-text, note, reflection) được ghi thẳng vào state + save() mà không push snapshot — vì blur không phân biệt "gõ thật" với "chạm vào rồi ra" (push mù sẽ tạo hàng loạt phantom entry). Khi đang focus trong ô text, Ctrl+Z do trình duyệt xử lý (undo nội dung text). Hệ quả chấp nhận: undo của action kế tiếp (ví dụ tick task) sẽ khôi phục cả text lẫn action trong 1 snapshot — hành vi snapshot chuẩn.
- **keydown guard hiện có** (4479) return sớm với mọi phím tổ hợp — chèn nhánh phím tắt **trước** guard đó, không sửa guard.
- **Focus mode + undo**: mutation trong overlay vẫn qua `withUndo` — undo khi đang focus phải đóng overlay rồi render lại view (hoặc render lại cả hai).
- Tiến trình nền user có thể bump version giữa chừng → đọc lại file trước mỗi edit; test textual dùng regex linh hoạt.
