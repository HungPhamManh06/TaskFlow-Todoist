# Phase 7 — Tự động hoá & Trải nghiệm nâng cao Implementation Plan

> **Trạng thái:** ✅ HOÀN THÀNH (2026-08-04) — Task 1–5 đều đã code + test (7.1–7.5 trong tests/phase5.test.mjs, 127/127 unit tests PASS).

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mở rộng trải nghiệm TaskFlow với task lặp lại, kéo-thả task qua ngày, habit heatmap năm, ngày nghỉ habit, và hoàn thiện undo/redo cho toàn bộ state mới.

**Architecture:** 5 task độc lập, mỗi task có thể ship riêng. Mỗi task thêm i18n (vi + en), UNDOABLE_ACTS, trackEvent, data migration, và test textual. Hàm thuần đưa vào `plan-math.js` / `plan-stats.js`; logic UI và app state trong `app.js`.

**Tech Stack:** Vanilla JS, `node:test` (unit + textual), backend không cần sửa (data mới lưu trong JSON hiện tại).

## Global Constraints

- Mỗi feature mới: thêm i18n key cả `vi` + `en` trong I18N object (app.js).
- Nút/UI mới: `data-action`, `trackEvent` (tên `snake_case`).
- Data mới trên task/habit: migration trong `loadState()` kiểu `if (!x.repeat) x.repeat = null`.
- UNDOABLE_ACTS: thêm action mới vào Set.
- Test: `node --test tests/phase5.test.mjs` (textual -- regex trên file đọc sẵn), `node --check js/app.js` syntax.
- Version bump: mỗi xong task bump `app.js?v=N` + `sw.js` cache. Nếu sửa CSS: bump `styles.css?v=N`. Nếu sửa plan-math/plan-stats: bump `?v=` tương ứng.
- **Audit trạng thái hiện tại (working tree, chưa staged):** app.js?v=44, styles.css?v=48, plan-math.js?v=3, plan-stats.js?v=2, sw cache v38.
  - Task 1 (recurring): code DA CO (beginRepeatEdit, applyRecurrence, repeat-edit nut, migration). **Thieu i18n keys** va `'repeat-edit'` action handler.
  - Task 4 (undo/redo mo rong): code DA CO (snapshotAll/applySnapshot co mood/theme/plan, UNDOABLE_ACTS co mood-set/theme/repeat-edit). **Can cai tien**: applySnapshot dung `setTheme()` thay vi gan truc tiep.
  - Task 2, 3, 5: CHUA CODE (khong tim thay moveTaskAcrossDays, habitYearMatrix, skipDays).

---

### Task 1: Task lap lai (recurring) -- FIX i18n keys bi thieu (code da co)

**Audit: Code DA hoan thien** (beginRepeatEdit, applyRecurrence, repeat-edit nut, migration, UNDOABLE_ACTS) nhung **i18n keys CHUA duoc dinh nghia** trong I18N object (chi duoc dung trong code, chua co trong dictionary). Test 7.1 da co trong phase5.test.mjs.

**Can lam:**

- [ ] **Step 1: Them i18n keys vao I18N.vi va I18N.en**

Them vao `js/app.js` trong I18N.vi (cuoi cung) va I18N.en:

```js
// Trong I18N.vi:
    repeatTitle: '🔁 Lặp lại task',
    repeatOff: 'Không lặp',
    repeatDaily: 'Mỗi ngày',
    repeatWeekly: 'Mỗi tuần',
    repeatMonthly: 'Mỗi tháng',
// Trong I18N.en:
    repeatTitle: '🔁 Repeat task',
    repeatOff: 'No repeat',
    repeatDaily: 'Daily',
    repeatWeekly: 'Weekly',
    repeatMonthly: 'Monthly',
```

- [ ] **Step 2: Them handler cho `'repeat-edit'` action**

Trong click handler main (sau dong `act === 'focus-close'`), them nhanh:

```js
  else if (act === 'repeat-edit') { beginRepeatEdit(el); return; }
```

- [ ] **Step 3: Chay test de verify i18n + handler**

```bash
node --test tests/phase5.test.mjs
```

- [ ] **Step 4: Bump version + commit**

```bash
sed -i 's/app.js?v=44/app.js?v=45/g' app.html
sed -i "s/const CACHE = 'taskflow-v38'/const CACHE = 'taskflow-v39'/g" sw.js
node --test tests/phase5.test.mjs
git add -A && git commit -m "Phase 7.1: them i18n repeat keys + handler cho repeat-edit"
```

---

### Task 2: Keo-tha task qua ngay khac trong cung tuan

**Files:**
- Modify: `js/plan-math.js` (them `moveTaskAcrossDays` thuan)
- Modify: `js/app.js` (mo rong drag-drop handler)
- Test: `tests/phase5.test.mjs` (textual + unit)

**Interfaces:**
- Consumes: `dragState` (week, day, task, kind), zone.dataset (week, day, kind)
- Produces: `PlanMath.moveTaskAcrossDays(tasksFrom, tasksTo, fromIdx, toKind)` -> `{ tasksFrom, tasksTo }`
- Migration: khong can

- [ ] **Step 1: Them `PlanMath.moveTaskAcrossDays` vao `js/plan-math.js`**

```js
// Trong js/plan-math.js, sau ham nextOccurrence
function moveTaskAcrossDays(tasksFrom, tasksTo, fromIdx, toKind) {
  var t = tasksFrom[fromIdx];
  if (!t || (toKind !== 'priority' && toKind !== 'regular')) return { tasksFrom: tasksFrom.slice(), tasksTo: tasksTo.slice() };
  var src = tasksFrom.slice();
  var dst = tasksTo.slice();
  var moved = t.kind === toKind ? t : Object.assign({}, t, { kind: toKind });
  src.splice(fromIdx, 1);
  dst.push(moved);
  return { tasksFrom: src, tasksTo: dst };
}
```

Them vao api: `moveTaskAcrossDays: moveTaskAcrossDays,`

- [ ] **Step 2: Mo rong `dragover` -- cho phep zone khac ngay trong cung tuan**

Trong dragover handler, branch task (xung quanh dong 4886-4891 hien tai), thay:

```js
// HIEN TAI (chi cho phep cung ngay):
    if (zone && zone.dataset.week === dragState.week && zone.dataset.day === dragState.day) {
// SUA THANH (cho phep khac ngay trong cung tuan):
    if (zone && zone.dataset.week === dragState.week) {
```

- [ ] **Step 3: Mo rong `drop` -- xu ly zone khac ngay**

Trong drop handler, task branch (dong 4920-4948), them nhanh moi TRUOC khi xu ly reorderTask:

```js
    // Moi: kiem tra tha vao zone khac ngay
    if (zone && zone.dataset.day !== dragState.day) {
      if (zone.dataset.week !== dragState.week) { dragState = null; return; }
      var toKind = zone.dataset.kind;
      if (toKind !== 'priority' && toKind !== 'regular') { dragState = null; return; }
      var srcDay = state.weeks[+dragState.week - 1].days[+dragState.day];
      var dstDay = state.weeks[+zone.dataset.week - 1].days[+zone.dataset.day];
      if (!srcDay || !dstDay) { dragState = null; return; }
      var result = window.PlanMath.moveTaskAcrossDays(srcDay.tasks, dstDay.tasks, +dragState.task, toKind);
      if (result.tasksFrom === srcDay.tasks && result.tasksTo === dstDay.tasks) { dragState = null; return; }
      pushUndo();
      srcDay.tasks = result.tasksFrom;
      dstDay.tasks = result.tasksTo;
      renderWeek(); save(); trackEvent('move_task_across_days');
      dragState = null; return;
    }
    // Code hien tai tiep tuc: reorderTask trong cung ngay
    let toKind = null;
    ...
```

- [ ] **Step 4: Them unit test cho PlanMath.moveTaskAcrossDays**

```js
// Trong tests/phase5.test.mjs, them:
test('7.2: moveTaskAcrossDays chuyen task sang ngay khac', () => {
  const from = [{ kind: 'priority', text: 'A', done: false }];
  const to = [{ kind: 'regular', text: 'B', done: false }];
  const r = PlanMath.moveTaskAcrossDays(from, to, 0, 'regular');
  assert.equal(r.tasksFrom.length, 0);
  assert.equal(r.tasksTo.length, 2);
  assert.equal(r.tasksTo[1].kind, 'regular');
  assert.equal(from[0].kind, 'priority', 'mang goc khong bi sua');
});
test('7.2b: textual drag-drop qua ngay', () => {
  assert.match(APP_JS, /moveTaskAcrossDays/);
  assert.match(APP_JS, /zone\\.dataset\\.day !== dragState\\.day/);
  assert.match(APP_JS, /move_task_across_days/);
});
```

- [ ] **Step 5: Bump version + chay test**

```bash
sed -i 's/app.js?v=45/app.js?v=46/g' app.html
sed -i 's/plan-math.js?v=3/plan-math.js?v=4/g' app.html
sed -i "s/const CACHE = 'taskflow-v39'/const CACHE = 'taskflow-v40'/g" sw.js
node --test tests/phase5.test.mjs
git add -A && git commit -m "Phase 7.2: keo-tha task qua ngay khac trong cung tuan"
```

---

### Task 3: Habit heatmap nam

**Files:**
- Modify: `js/plan-stats.js` (thuan: `habitYearMatrix`)
- Modify: `js/app.js` (UI: card heatmap nam trong year view)
- Modify: `css/styles.css` (styles cho heatmap nam)
- Test: `tests/phase5.test.mjs` (textual)

**Interfaces:**
- Consumes: `state.habits`, `PLAN_YEAR`, localStorage
- Produces: `PlanStats.habitYearMatrix(habits, year)` -> `[{ id, name, target, months: [{ month, pct, streak }] }]`
- Migration: khong can

- [ ] **Step 1: `PlanStats.habitYearMatrix` thuan trong `js/plan-stats.js`**

```js
// Trong js/plan-stats.js, sau ham moodSummary
function habitYearMatrix(habits, year) {
  if (!Array.isArray(habits)) return [];
  return habits.map(function (h) {
    var months = [];
    for (var m = 0; m < 12; m++) {
      var raw = null;
      try {
        var k = 'planner-' + year + '-' + (m + 1);
        raw = typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
      } catch (e) { /* an */ }
      var s = raw ? JSON.parse(raw) : null;
      var hh = null;
      if (s && Array.isArray(s.habits)) {
        hh = s.habits.find(function (x) { return x.id === h.id; }) || s.habits.find(function (x) { return x.name === h.name; }) || null;
      }
      var days = hh && Array.isArray(hh.days) ? hh.days : [];
      var done = 0;
      for (var d = 0; d < days.length; d++) { if (days[d]) done++; }
      var pct = days.length > 0 ? Math.round((done / days.length) * 100) : 0;
      var cur = 0;
      for (var i = days.length - 1; i >= 0 && days[i]; i--) cur++;
      months.push({ month: m, pct: pct, streak: cur });
    }
    return { id: h.id, name: h.name, target: h.target || 100, months: months };
  });
}
```

Them vao api: `habitYearMatrix: habitYearMatrix,`

- [ ] **Step 2: UI card trong year view**

Trong `renderYear()`, them dong `${yearHabitHeatmapHTML()}` sau dong `yearReflectionsHTML()`:

```js
function yearHabitHeatmapHTML() {
  var habits = state.habits;
  if (!habits || !habits.length) return '';
  var matrix = window.PlanStats && window.PlanStats.habitYearMatrix ? window.PlanStats.habitYearMatrix(habits, PLAN_YEAR) : [];
  if (!matrix.length) return '';
  var rows = matrix.map(function (h) {
    var cells = '';
    for (var m = 0; m < 12; m++) {
      var pct = h.months[m].pct;
      var cls = 'yhm-cell';
      if (pct >= 100) cls += ' l4';
      else if (pct >= 75) cls += ' l3';
      else if (pct >= 50) cls += ' l2';
      else if (pct > 0) cls += ' l1';
      cells += '<span class="' + cls + '" title="T' + (m + 1) + ' ' + pct + '%"></span>';
    }
    return '<div class="yhm-row"><div class="yhm-name">' + esc(h.name) + '</div><div class="yhm-cells">' + cells + '</div></div>';
  }).join('');
  return '<div class="card year-heat-card"><div class="card-title">🔥 ' + t('hmTitle') + '</div>' + rows + '</div>';
}
```

- [ ] **Step 3: CSS styles trong `css/styles.css`**

```css
/* Phase 7.3 -- Habit heatmap nam */
.year-heat-card { margin-top: 16px; padding: 12px; }
.year-heat-card .yhm-row { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
.year-heat-card .yhm-name { width: 100px; font-size: 11px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
.year-heat-card .yhm-cells { display: flex; gap: 2px; }
.year-heat-card .yhm-cell { width: 12px; height: 12px; border-radius: 2px; background: rgba(var(--ink-rgb), .08); }
.year-heat-card .yhm-cell.l1 { background: rgba(243, 154, 130, .25); }
.year-heat-card .yhm-cell.l2 { background: rgba(243, 154, 130, .50); }
.year-heat-card .yhm-cell.l3 { background: rgba(243, 154, 130, .75); }
.year-heat-card .yhm-cell.l4 { background: var(--terracotta); }
```

- [ ] **Step 4: Them test textual**

```js
// Trong tests/phase5.test.mjs, them:
test('7.3: habit heatmap nam', () => {
  assert.match(APP_JS, /function yearHabitHeatmapHTML\\(\\)/);
  assert.match(APP_JS, /yhm-cell/);
  assert.match(APP_JS, /habitYearMatrix/);
  assert.match(CSS, /\\.yhm-cell/);
  assert.match(CSS, /\\.year-heat-card/);
});
```

- [ ] **Step 5: Bump version + chay test**

```bash
sed -i 's/app.js?v=46/app.js?v=47/g' app.html
sed -i 's/plan-stats.js?v=2/plan-stats.js?v=3/g' app.html
sed -i 's/styles.css?v=48/styles.css?v=49/g' app.html
sed -i "s/const CACHE = 'taskflow-v40'/const CACHE = 'taskflow-v41'/g" sw.js
node --test tests/phase5.test.mjs
git add -A && git commit -m "Phase 7.3: habit heatmap nam trong year view"
```

---

### Task 4: Hoan thien undo/redo cho mood, theme, repeat -- CAI TIEN (code da co)

**Audit: Code DA hoan thien.** snapshotAll() chup mood/theme/plan. applySnapshot() khoi phuc mood/theme/plan. UNDOABLE_ACTS co mood-set/theme/repeat-edit. saveMood() duoc goi.

**Can lam them:**

- [ ] **Step 1: Doi `document.documentElement.dataset.theme = snap.theme` thanh `setTheme(snap.theme)`**

Trong `applySnapshot()` (dong 4802-4804), sua:

```js
// HIEN TAI:
if (snap.theme) {
  THEME = snap.theme;
  document.documentElement.dataset.theme = snap.theme;
}
// SUA THANH:
if (snap.theme) {
  setTheme(snap.theme);
}
```

- [ ] **Step 2: Them test textual**

```js
// Trong tests/phase5.test.mjs, them:
test('7.4: undo/redo phu mood, theme, repeat', () => {
  assert.match(APP_JS, /snap\\.mood/);
  assert.match(APP_JS, /snap\\.theme/);
  assert.match(APP_JS, /snap\\.plan/);
  assert.match(APP_JS, /saveMood\\(\\)/);
  assert.match(APP_JS, /setTheme\\(snap\\.theme\\)/);
});
```

- [ ] **Step 3: Bump version + chay test**

```bash
node --test tests/phase5.test.mjs
git add -A && git commit -m "Phase 7.4: applySnapshot dung setTheme thay vi gan truc tiep"
```

---

### Task 5: Ngay nghi habit (skip days)

**Files:**
- Modify: `js/plan-math.js` (mo rong `habitPctFrom`, `currentStreak`, `bestStreak` nhan `skipMap` optional)
- Modify: `js/app.js` (UI: context menu chuot phai + migration toggle skip)
- Modify: `css/styles.css` (style `.skipped`)
- Test: `tests/phase1.test.mjs` (unit streak) + `tests/phase5.test.mjs` (textual)

**Interfaces:**
- Consumes: `h.days[]` (boolean[]), `h.skipDays` (optional Array of day indices), `h.target`
- Produces: `PlanMath.habitPctFrom(days, elapsed, target, skipMap)` -- skipMap la Array<boolean> (true = skip day do)
- Migration: `loadState()` gan `if (!Array.isArray(h.skipDays)) h.skipDays = []`

- [ ] **Step 1: Mo rong `PlanMath.habitPctFrom` trong `js/plan-math.js`**

```js
// Sua ham habitPctFrom hien tai:
function habitPctFrom(days, elapsed, target, skipMap) {
  var t = target > 0 ? target : 100;
  var total = Math.max(1, Math.round((elapsed * t) / 100));
  var done = 0;
  var upto = Math.min(days.length, elapsed);
  for (var i = 0; i < upto; i++) {
    // skip day khong tinh vao total
    if (skipMap && skipMap[i]) { total = Math.max(1, total - 1); continue; }
    if (days[i]) done++;
  }
  total = Math.max(1, total);
  return Math.min(100, Math.round((done / total) * 100));
}
```

- [ ] **Step 2: Mo rong `currentStreak` va `bestStreak` trong `js/plan-math.js`**

```js
function currentStreak(flags, skipMap) {
  var n = 0;
  for (var i = flags.length - 1; i >= 0; i--) {
    if (skipMap && skipMap[i]) continue;
    if (flags[i]) n++;
    else break;
  }
  return n;
}

function bestStreak(flags, skipMap) {
  var best = 0, run = 0;
  for (var i = 0; i < flags.length; i++) {
    if (skipMap && skipMap[i]) continue;
    if (flags[i]) { run++; if (run > best) best = run; }
    else run = 0;
  }
  return best;
}
```

- [ ] **Step 3: Migration trong `loadState()` (app.js, habit loop)**

Them vao vong forEach habits trong `loadState()`:

```js
if (!Array.isArray(h.skipDays)) h.skipDays = [];
```

- [ ] **Step 4: UI -- them `data-context` tren day-cell**

Trong habit cell template (trong `taskRowHTML` -- dong 2779), them `data-context` va `skipped` class:

```js
// HIEN TAI:
`<td class="day-cell${d === habitToday ? ' today' : ''}">${checkboxHTML(...)}</td>`
// SUA THANH:
`<td class="day-cell${d === habitToday ? ' today' : ''}${h.skipDays && h.skipDays.includes(d) ? ' skipped' : ''}" data-context="habit-day" data-id="${h.id}" data-day="${d}">${checkboxHTML('', v, 'data-action="habit" data-id="' + h.id + '" data-day="' + d + '"')}</td>`
```

- [ ] **Step 5: Handler contextmenu**

Them event listener (sau cac event listener hien tai, gan cuoi file):

```js
document.addEventListener('contextmenu', (e) => {
  const cell = e.target.closest('[data-context="habit-day"]');
  if (!cell) return;
  e.preventDefault();
  const h = state.habits.find(x => x.id === cell.dataset.id);
  if (!h) return;
  const day = +cell.dataset.day;
  if (!Array.isArray(h.skipDays)) h.skipDays = [];
  const idx = h.skipDays.indexOf(day);
  if (idx >= 0) h.skipDays.splice(idx, 1);
  else h.skipDays.push(day);
  save();
  renderOverview();
  trackEvent('habit_skip_day');
});
```

- [ ] **Step 6: CSS style `.skipped`**

```css
/* Trong css/styles.css */
.day-cell.skipped { background: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(var(--ink-rgb), .08) 4px, rgba(var(--ink-rgb), .08) 8px); }
.day-cell.skipped .checkbox { opacity: .3; pointer-events: none; }
```

- [ ] **Step 7: Unit test (phase1.test.mjs)**

```js
// Them vao tests/phase1.test.mjs:
test('1.6: habitPctFrom voi skipDays', () => {
  const days = [true, false, true, false, true];
  assert.equal(PlanMath.habitPctFrom(days, 5, 100, [false, true, false, false, false]), 75);
});
test('1.7: currentStreak voi skipMap', () => {
  const flags = [true, false, true, true, true];
  assert.equal(PlanMath.currentStreak(flags, [false, true, false, false, false]), 3);
});
test('1.8: bestStreak voi skipMap', () => {
  const flags = [true, false, true, true, true];
  assert.equal(PlanMath.bestStreak(flags, [false, true, false, false, false]), 3);
});
```

- [ ] **Step 8: Textual test**

```js
// Trong tests/phase5.test.mjs, them:
test('7.5: ngay nghi habit (skip days)', () => {
  assert.match(APP_JS, /data-context="habit-day"/);
  assert.match(APP_JS, /habit_skip_day/);
  assert.match(APP_JS, /if \\(!Array\\.isArray\\(h\\.skipDays\\)\\) h\\.skipDays = \\[\\]/);
  assert.match(CSS, /\\.day-cell\\.skipped/);
});
```

- [ ] **Step 9: Bump version + chay test**

```bash
sed -i 's/app.js?v=47/app.js?v=48/g' app.html
sed -i 's/plan-math.js?v=4/plan-math.js?v=5/g' app.html
sed -i 's/styles.css?v=49/styles.css?v=50/g' app.html
sed -i "s/const CACHE = 'taskflow-v41'/const CACHE = 'taskflow-v42'/g" sw.js
node --test tests/phase0.test.mjs tests/phase1.test.mjs tests/phase5.test.mjs
git add -A && git commit -m "Phase 7.5: ngay nghi habit (skip days) -- context menu + streak khong tinh ngay skip"
```

---

## Verification (chay cuoi cung)

```bash
node --check js/app.js
node --check js/plan-math.js
node --check js/plan-stats.js
node --test tests/*.test.mjs
node test-sync.js
```

Cap nhat spec: danh dau Phase 7 ✅ trong `docs/superpowers/specs/2026-08-03-feature-roadmap-design.md`.