import test from 'node:test';
import assert from 'node:assert/strict';
import PlanCarry from '../js/plan-carry.js';

/* ============================================================
   Phase 10 — Unit test logic thuần uid task & carry-over
   (js/plan-carry.js: newTaskUid, ensureTaskUid, findTaskByUid,
   planCarry, syncCarriedDone)
   ============================================================ */

// Lưới tuần mẫu: planStart = thứ 2 (3/8/2026), today = thứ 7 8/8/2026 (tuần 0, ngày 5)
const PLAN_START = new Date(2026, 7, 3); // Thứ 2, 3/8/2026
const TODAY = new Date(2026, 7, 8);      // Thứ 7, 8/8/2026

function buildWeeks(numWeeks) {
  const weeks = [];
  for (let wi = 0; wi < numWeeks; wi++) {
    const days = [];
    for (let di = 0; di < 7; di++) {
      const dt = new Date(PLAN_START.getTime() + (wi * 7 + di) * 86400000);
      days.push({ date: `${dt.getDate()}/${dt.getMonth() + 1}`, yy: dt.getFullYear() % 100, tasks: [] });
    }
    weeks.push({ n: wi + 1, days });
  }
  return weeks;
}

function addTask(day, overrides) {
  const tk = Object.assign({ uid: PlanCarry.newTaskUid(), kind: 'priority', done: false, text: 'T', tags: ['a'], remind: { enabled: false, time: '20:00' } }, overrides);
  day.tasks.push(tk);
  return tk;
}

// Áp kết quả planCarry vào state giống app.js: push bản sao vào hôm nay + đánh dấu gốc
function applyPlan(weeks, plan) {
  const target = weeks[0].days[5]; // hôm nay (8/8) trong lưới mẫu
  plan.copies.forEach((c) => {
    c.source.carried = true;
    target.tasks.push(c.copy);
  });
  return target;
}

/* ---------- uid ---------- */

test('newTaskUid: định dạng ổn định + độc nhất', () => {
  const a = PlanCarry.newTaskUid();
  const b = PlanCarry.newTaskUid();
  assert.match(a, /^t[a-z0-9]+$/i);
  assert.notEqual(a, b);
});

test('ensureTaskUid: gán uid khi thiếu, idempotent khi đã có', () => {
  const tk = { kind: 'priority' };
  PlanCarry.ensureTaskUid(tk);
  assert.equal(typeof tk.uid, 'string');
  const kept = tk.uid;
  PlanCarry.ensureTaskUid(tk);
  assert.equal(tk.uid, kept);
  assert.equal(PlanCarry.ensureTaskUid(null), null);
});

test('findTaskByUid: tìm xuyên weeks, trả null khi không thấy', () => {
  const weeks = buildWeeks(2);
  const needle = addTask(weeks[1].days[2], { text: 'needle' });
  assert.equal(PlanCarry.findTaskByUid(weeks, needle.uid), needle);
  assert.equal(PlanCarry.findTaskByUid(weeks, 't-nothing'), null);
  assert.equal(PlanCarry.findTaskByUid(weeks, null), null);
});

/* ---------- planCarry ---------- */

test('planCarry: dồn task lặp bị lỡ (chưa tick) vào hôm nay — bản sao đúng', () => {
  const weeks = buildWeeks(2);
  const src = addTask(weeks[0].days[4], { text: 'Học bài', repeat: { freq: 'daily', every: 1 } }); // 7/8 — hôm qua
  const plan = PlanCarry.planCarry(weeks, PLAN_START, TODAY);
  assert.equal(plan.copies.length, 1);
  const c = plan.copies[0];
  // Bản sao là task mới, uid riêng, liên kết theo uid nguồn
  assert.notEqual(c.copy.uid, src.uid);
  assert.equal(c.copy.carriedFrom.uid, src.uid);
  assert.equal(c.copy.carriedFrom.date, '7/8/26');
  assert.equal(c.copy.done, false);
  assert.equal(c.copy.repeat, null);
  assert.equal(c.copy.text, 'Học bài');
  // tags deep-copy: sửa bản sao không ảnh hưởng gốc
  c.copy.tags.push('b');
  assert.deepEqual(src.tags, ['a']);
  // planCarry KHÔNG mutate state (chưa push, chưa đánh dấu carried)
  assert.equal(src.carried, undefined);
  assert.equal(weeks[0].days[5].tasks.length, 0);
});

test('planCarry: bỏ qua task done, task không repeat, task đã carried, ngày tương lai', () => {
  const weeks = buildWeeks(2);
  addTask(weeks[0].days[4], { text: 'done repeat', done: true, repeat: { freq: 'daily' } });          // done → bỏ
  addTask(weeks[0].days[4], { text: 'no repeat' });                                                     // không repeat → bỏ
  addTask(weeks[0].days[4], { text: 'already carried', repeat: { freq: 'daily' }, carried: true });     // đã carried → bỏ
  addTask(weeks[0].days[6], { text: 'future', repeat: { freq: 'daily' } });                             // ngày mai → bỏ
  const plan = PlanCarry.planCarry(weeks, PLAN_START, TODAY);
  assert.equal(plan.copies.length, 0);
});

test('planCarry: dedup — gọi lần 2 sau khi áp dụng không sinh trùng', () => {
  const weeks = buildWeeks(2);
  addTask(weeks[0].days[4], { text: 'Lặp', repeat: { freq: 'weekly' } });
  const p1 = PlanCarry.planCarry(weeks, PLAN_START, TODAY);
  applyPlan(weeks, p1);
  const p2 = PlanCarry.planCarry(weeks, PLAN_START, TODAY);
  assert.equal(p1.copies.length, 1);
  assert.equal(p2.copies.length, 0);
});

test('planCarry: hôm nay ngoài lưới tuần → không dồn', () => {
  const weeks = buildWeeks(1); // chỉ có tuần 3–9/8
  addTask(weeks[0].days[4], { text: 'Lặp', repeat: { freq: 'daily' } });
  const plan = PlanCarry.planCarry(weeks, PLAN_START, new Date(2026, 7, 15)); // 15/8 ngoài lưới
  assert.equal(plan.copies.length, 0);
});

/* ---------- syncCarriedDone ---------- */

test('syncCarriedDone: bản dồn → task gốc (theo uid, bền vững khi lệch chỉ số)', () => {
  const weeks = buildWeeks(2);
  const src = addTask(weeks[0].days[4], { text: 'Lặp', repeat: { freq: 'daily' } });
  const p = PlanCarry.planCarry(weeks, PLAN_START, TODAY);
  applyPlan(weeks, p);
  const copy = weeks[0].days[5].tasks[0];
  const srcIdxBefore = weeks[0].days[4].tasks.indexOf(src); // 0
  // Chèn task MỚI trước task gốc → chỉ số của gốc bị đẩy lùi (lệch đi)
  weeks[0].days[4].tasks.unshift({ uid: PlanCarry.newTaskUid(), kind: 'priority', done: false, text: 'chen', tags: [], remind: { enabled: false, time: '20:00' } });
  const srcIdxAfter = weeks[0].days[4].tasks.indexOf(src); // 1
  copy.done = true; // tick bản dồn
  const changed = PlanCarry.syncCarriedDone(weeks, 0, 5, 0, copy);
  assert.notEqual(srcIdxBefore, srcIdxAfter);
  assert.equal(src.done, true);                                  // gốc (theo uid) được tick
  assert.equal(weeks[0].days[4].tasks[srcIdxBefore].done, false); // task ở vị trí cũ KHÔNG bị đụng
  assert.equal(changed.length, 1);
  assert.equal(changed[0], src);
});

test('syncCarriedDone: task gốc → mọi bản dồn (uid), và không đổi khi trạng thái đã khớp', () => {
  const weeks = buildWeeks(2);
  const src = addTask(weeks[0].days[4], { text: 'Lặp', repeat: { freq: 'daily' } });
  const p = PlanCarry.planCarry(weeks, PLAN_START, TODAY);
  applyPlan(weeks, p);
  const copy1 = weeks[0].days[5].tasks[0];
  // Bản dồn thứ 2 giả lập: cùng carriedFrom.uid (1 nguồn chỉ carry 1 lần qua planCarry)
  const copy2 = Object.assign({}, copy1, { uid: PlanCarry.newTaskUid(), done: false });
  weeks[0].days[5].tasks.push(copy2);
  // Tick task gốc → cả 2 bản dồn đều done
  src.done = true;
  const changed = PlanCarry.syncCarriedDone(weeks, 0, 4, weeks[0].days[4].tasks.indexOf(src), src);
  assert.equal(copy1.done, true);
  assert.equal(copy2.done, true);
  assert.equal(changed.length, 2);
  // Gọi lại khi đã khớp → không có gì đổi
  const changed2 = PlanCarry.syncCarriedDone(weeks, 0, 4, weeks[0].days[4].tasks.indexOf(src), src);
  assert.equal(changed2.length, 0);
});

test('syncCarriedDone: fallback chỉ số cho bản dồn legacy (carriedFrom {w,d,t})', () => {
  const weeks = buildWeeks(2);
  const src = addTask(weeks[0].days[4], { text: 'Lặp', repeat: { freq: 'daily' } });
  const legacyCopy = { uid: 't-legacy', kind: 'priority', done: false, text: 'Lặp', tags: [], remind: { enabled: false, time: '20:00' }, carriedFrom: { w: 0, d: 4, t: weeks[0].days[4].tasks.indexOf(src) } };
  weeks[0].days[5].tasks.push(legacyCopy);
  // Bỏ tick bản legacy → gốc (theo chỉ số) bỏ tick
  legacyCopy.done = true;
  PlanCarry.syncCarriedDone(weeks, 0, 5, weeks[0].days[5].tasks.indexOf(legacyCopy), legacyCopy);
  assert.equal(src.done, true);
});

/* ============================================================
   Carry × Recurrence dedup — seriesId prevents duplicate
   when repeat occurrence already exists in target day
   ============================================================ */

test('planCarry: skip carry when repeat occurrence with same seriesId already exists in target day', () => {
  const weeks = buildWeeks(2);
  // Past day: recurring task (source)
  addTask(weeks[0].days[4], { text: 'Uống nước', repeat: { freq: 'daily', seriesId: 'repeat:water' } });
  // Today: repeat occurrence already created by planRecurrence
  addTask(weeks[0].days[5], { text: 'Uống nước', repeat: { freq: 'daily', seriesId: 'repeat:water' } });
  const plan = PlanCarry.planCarry(weeks, PLAN_START, TODAY);
  assert.equal(plan.copies.length, 0, 'carry should be skipped when repeat occurrence exists');
});

test('planCarry: allow carry when no matching seriesId in target day', () => {
  const weeks = buildWeeks(2);
  // Past day: recurring task (source)
  addTask(weeks[0].days[4], { text: 'Uống nước', repeat: { freq: 'daily', seriesId: 'repeat:water' } });
  // Today: different task (no seriesId conflict)
  addTask(weeks[0].days[5], { text: 'Khác', repeat: { freq: 'daily', seriesId: 'repeat:other' } });
  const plan = PlanCarry.planCarry(weeks, PLAN_START, TODAY);
  assert.equal(plan.copies.length, 1, 'carry should proceed when no seriesId conflict');
  assert.equal(plan.copies[0].copy.text, 'Uống nước');
});

test('planCarry: different seriesIds with same text should NOT be merged', () => {
  const weeks = buildWeeks(2);
  // Past day: two recurring tasks with same text but different seriesId
  addTask(weeks[0].days[4], { text: 'Đọc sách', repeat: { freq: 'daily', seriesId: 'repeat:a' } });
  addTask(weeks[0].days[4], { text: 'Đọc sách', repeat: { freq: 'daily', seriesId: 'repeat:b' } });
  // Today: one of them already exists
  addTask(weeks[0].days[5], { text: 'Đọc sách', repeat: { freq: 'daily', seriesId: 'repeat:a' } });
  const plan = PlanCarry.planCarry(weeks, PLAN_START, TODAY);
  // Only series 'b' should be carried (series 'a' already exists)
  assert.equal(plan.copies.length, 1, 'only non-existing series should be carried');
  assert.ok(plan.copies[0].source.text === 'Đọc sách');
});

test('getSeriesId: returns repeat.seriesId if present', () => {
  const task = { uid: 't1', repeat: { freq: 'daily', seriesId: 'repeat:water' } };
  assert.equal(PlanCarry.getSeriesId(task), 'repeat:water');
});

test('getSeriesId: falls back to repeat:uid', () => {
  const task = { uid: 't2', repeat: { freq: 'daily' } };
  assert.equal(PlanCarry.getSeriesId(task), 'repeat:t2');
});

test('getSeriesId: returns repeat:uid for task with uid but no repeat', () => {
  const task = { uid: 't3' };
  assert.equal(PlanCarry.getSeriesId(task), 'repeat:t3');
});

test('getSeriesId: returns null for null/undefined task', () => {
  assert.equal(PlanCarry.getSeriesId(null), null);
  assert.equal(PlanCarry.getSeriesId(undefined), null);
});

test('ensureSeriesId: sets repeat.seriesId if missing', () => {
  const task = { uid: 't4', repeat: { freq: 'daily' } };
  const sid = PlanCarry.ensureSeriesId(task);
  assert.equal(sid, 'repeat:t4');
  assert.equal(task.repeat.seriesId, 'repeat:t4');
});

test('ensureSeriesId: no-op if seriesId already present', () => {
  const task = { uid: 't5', repeat: { freq: 'daily', seriesId: 'existing' } };
  const sid = PlanCarry.ensureSeriesId(task);
  assert.equal(sid, 'existing');
  assert.equal(task.repeat.seriesId, 'existing');
});

test('ensureSeriesId: returns null for non-recurring task', () => {
  const task = { uid: 't6' };
  assert.equal(PlanCarry.ensureSeriesId(task), null);
});
