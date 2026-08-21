// TaskFlow V1.3 — Smart Daily Planner (rule-based, NO AI).
// Test: deterministic proposal engine + UI render/plan assembly + wiring.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';

const Rules = (await import('../js/planner-rules.js')).default || (await import('../js/planner-rules.js'));
const UI = (await import('../js/planner-ui.js')).default || (await import('../js/planner-ui.js'));

const APP = readFileSync('app.html', 'utf8');
const SW = readFileSync('sw.js', 'utf8');
const APPJS = readFileSync('js/app.js', 'utf8');
const UIJS = readFileSync('js/planner-ui.js', 'utf8');

function baseInput(over = {}) {
  return {
    now: new Date(2026, 7, 14, 9, 0), // 2026-08-14 09:00 local (Thứ 6)
    availableMinutes: 300,
    tasks: [],
    blocks: [],
    projects: { version: 1, projects: [] },
    ...over,
  };
}

const task = (uid, over = {}) => ({
  uid, text: 'Task ' + uid, kind: 'regular', done: false, tags: [], linkedMetricIds: [],
  remind: { enabled: false, time: '20:00' }, duration: 0, energy: null, contexts: [],
  ...over,
});

/* ---------------- Determinism ---------------- */

test('deterministic: cùng input → cùng proposal (JSON giống hệt)', () => {
  const input = baseInput({
    tasks: [
      task('t1', { deadline: '2026-08-10', duration: 60, kind: 'priority' }),
      task('t2', { duration: 90 }),
      task('t3', { done: true }),
    ],
  });
  const a = Rules.buildProposal(input);
  const b = Rules.buildProposal(input);
  assert.deepEqual(a, b);
});

test('deterministic: thứ tự task đầu vào khác nhau không đổi proposal', () => {
  const make = (tasks) => Rules.buildProposal(baseInput({ tasks }));
  const p1 = make([task('t1', { duration: 30 }), task('t2', { duration: 30 }), task('t3', { duration: 30 }), task('t4', { duration: 30 })]);
  const p2 = make([task('t4', { duration: 30 }), task('t2', { duration: 30 }), task('t1', { duration: 30 }), task('t3', { duration: 30 })]);
  assert.deepEqual(p1.order, p2.order);
  assert.deepEqual(p1, p2);
});

/* ---------------- Scoring factors ---------------- */

test('overdue: deadline < hôm nay được +1000 và vào danh sách quá hạn', () => {
  const p = Rules.buildProposal(baseInput({ tasks: [task('t1', { deadline: '2026-08-10' })] }));
  assert.equal(p.overdue.length, 1);
  assert.equal(p.overdue[0].uid, 't1');
  assert.deepEqual(p.overdue[0].options, ['today', 'tomorrow', 'this-week', 'inbox']);
  assert.ok(p.top[0].score >= 1000);
  assert.ok(p.top[0].reasons.includes('overdue'));
});

test('deadline trong 3 ngày: +200; trong 7 ngày: +100; xa hơn: 0', () => {
  const p3 = Rules.buildProposal(baseInput({ tasks: [task('t1', { deadline: '2026-08-17' })] }));
  assert.ok(p3.top[0].reasons.includes('deadline3'));
  const p7 = Rules.buildProposal(baseInput({ tasks: [task('t1', { deadline: '2026-08-21' })] }));
  assert.ok(p7.top[0].reasons.includes('deadline7'));
  const far = Rules.buildProposal(baseInput({ tasks: [task('t1', { deadline: '2026-09-01' })] }));
  assert.ok(!far.top[0].reasons.includes('deadline3') && !far.top[0].reasons.includes('deadline7'));
});

test('priority: kind=priority được +500', () => {
  const p = Rules.buildProposal(baseInput({ tasks: [task('t1', { kind: 'priority' })] }));
  assert.ok(p.top[0].reasons.includes('priority'));
  assert.ok(p.top[0].score >= 500);
});

test('duration: task có duration được +20 và ưu tiên hơn task không duration', () => {
  const p = Rules.buildProposal(baseInput({
    tasks: [task('t1'), task('t2', { duration: 45 })],
  }));
  assert.equal(p.order[0], 't2');
  assert.ok(p.top[0].reasons.includes('duration'));
});

test('energy: task có energy được +15', () => {
  const p = Rules.buildProposal(baseInput({ tasks: [task('t1', { energy: 'high' })] }));
  assert.ok(p.top[0].reasons.includes('energy'));
});

test('context: task có contexts được +10', () => {
  const p = Rules.buildProposal(baseInput({ tasks: [task('t1', { contexts: ['c1'] })] }));
  assert.ok(p.top[0].reasons.includes('context'));
});

test('project/milestone active: +30/+60', () => {
  const projects = {
    version: 1,
    projects: [{
      id: 'proj_a', title: 'A', status: 'active', milestones: [{ id: 'mile_1', title: 'M1', status: 'active' }],
    }],
  };
  const p = Rules.buildProposal(baseInput({
    tasks: [task('t1', { projectId: 'proj_a', milestoneId: 'mile_1' })],
    projects,
  }));
  assert.ok(p.top[0].reasons.includes('project'));
  assert.ok(p.top[0].reasons.includes('milestone'));
  // milestone của project đã archive → không cộng milestone
  const arch = {
    version: 1,
    projects: [{ id: 'proj_a', title: 'A', status: 'archived', milestones: [{ id: 'mile_1', title: 'M1', status: 'active' }] }],
  };
  const p2 = Rules.buildProposal(baseInput({ tasks: [task('t1', { projectId: 'proj_a', milestoneId: 'mile_1' })], projects: arch }));
  assert.ok(!p2.top[0].reasons.includes('project'));
});

test('scheduled: task đã có TimeBlock hôm nay được +40', () => {
  const p = Rules.buildProposal(baseInput({
    tasks: [task('t1')],
    blocks: [{ taskUid: 't1', date: '2026-08-14', start: '09:00', end: '10:00', status: 'planned' }],
  }));
  assert.ok(p.top[0].reasons.includes('scheduled'));
});

/* ---------------- Top 3 + workload ---------------- */

test('topN mặc định = 3, xếp theo score giảm dần', () => {
  const p = Rules.buildProposal(baseInput({
    tasks: [task('t1', { duration: 10 }), task('t2', { duration: 10 }), task('t3', { duration: 10 }), task('t4', { duration: 10 }), task('t5', { duration: 10 })],
  }));
  assert.equal(p.top.length, 3);
  assert.equal(p.order.length, 5);
  for (let i = 1; i < p.top.length; i++) assert.ok(p.top[i - 1].score >= p.top[i].score);
});

test('overloaded: planned > available → overloaded=true + delta đúng', () => {
  const p = Rules.buildProposal(baseInput({
    availableMinutes: 180,
    tasks: [task('t1', { duration: 120 }), task('t2', { duration: 90 }), task('t3', { duration: 60 })],
  }));
  // top3 = 270 phút > 180 available
  assert.equal(p.overloaded, true);
  assert.equal(p.overloadDeltaMinutes, 90);
});

test('không overload khi planned <= available', () => {
  const p = Rules.buildProposal(baseInput({
    availableMinutes: 300,
    tasks: [task('t1', { duration: 120 }), task('t2', { duration: 90 })],
  }));
  assert.equal(p.overloaded, false);
});

test('empty day: không task → top/order rỗng, không crash', () => {
  const p = Rules.buildProposal(baseInput({ tasks: [] }));
  assert.deepEqual(p.top, []);
  assert.deepEqual(p.order, []);
  assert.equal(p.plannedMinutes, 0);
  assert.equal(p.overloaded, false);
});

test('done tasks bị loại khỏi đề xuất', () => {
  const p = Rules.buildProposal(baseInput({
    tasks: [task('t1', { done: true, deadline: '2026-08-10' }), task('t2')],
  }));
  assert.equal(p.overdue.length, 0);
  assert.deepEqual(p.order, ['t2']);
});

/* ---------------- Free windows + suggestions ---------------- */

test('free windows: khe trống giữa 2 block đúng giờ', () => {
  const w = Rules.computeFreeWindows([
    { start: '09:00', end: '10:00', status: 'planned' },
    { start: '11:00', end: '12:00', status: 'planned' },
  ]);
  assert.deepEqual(w, [{ start: '10:00', end: '11:00', minutes: 60 }]);
});

test('free windows: block cancelled bị bỏ → khe giữa block còn lại', () => {
  const w = Rules.computeFreeWindows([
    { start: '09:00', end: '10:00', status: 'planned' },
    { start: '10:00', end: '11:00', status: 'cancelled' },
    { start: '12:00', end: '13:00', status: 'planned' },
  ]);
  // block 10-11 cancelled bị loại → khe 10:00-12:00 (120p)
  assert.deepEqual(w, [{ start: '10:00', end: '12:00', minutes: 120 }]);
});

test('free windows: chỉ 1 block → null (chưa biết availability)', () => {
  assert.equal(Rules.computeFreeWindows([{ start: '09:00', end: '10:00', status: 'planned' }]), null);
});

test('suggestBlocks: đặt task có duration vào khe nhỏ nhất đủ chứa', () => {
  const s = Rules.suggestBlocks(
    [{ uid: 't1', duration: 60 }],
    [{ start: '10:00', end: '11:00', minutes: 60 }, { start: '14:00', end: '16:00', minutes: 120 }],
  );
  assert.deepEqual(s, [{ taskUid: 't1', start: '10:00', end: '11:00' }]);
});

test('suggestBlocks: task không duration → không đặt giờ', () => {
  assert.equal(Rules.suggestBlocks([{ uid: 't1', duration: 0 }], [{ start: '10:00', end: '11:00', minutes: 60 }]), null);
});

test('suggestBlocks: khe quá nhỏ → skip task (không ép)', () => {
  const s = Rules.suggestBlocks([{ uid: 't1', duration: 90 }], [{ start: '10:00', end: '11:00', minutes: 60 }]);
  assert.equal(s, null);
});

test('conflict: block đè lên khe → khe bị thu hẹp, không chồng block', () => {
  // block 09:00-10:00 và 10:30-11:00 → khe 10:00-10:30 (30p)
  const w = Rules.computeFreeWindows([
    { start: '09:00', end: '10:00', status: 'planned' },
    { start: '10:30', end: '11:00', status: 'planned' },
  ]);
  assert.deepEqual(w, [{ start: '10:00', end: '10:30', minutes: 30 }]);
  // task 45p không khớp khe 30p → không gợi ý
  assert.equal(Rules.suggestBlocks([{ uid: 't1', duration: 45 }], w), null);
});

/* ---------------- UI render + plan assembly ---------------- */

test('UI: plannerContentHTML render đủ 5 bước + cảnh báo overload', () => {
  const html = UI.plannerContentHTML({
    overdue: [{ uid: 't1', text: 'A', deadline: '2026-08-10', options: ['today', 'tomorrow', 'this-week', 'inbox'] }],
    top: [{ uid: 't1', text: 'A', duration: 120, score: 1500, reasons: ['overdue'] }, { uid: 't2', text: 'B', duration: 90, score: 100, reasons: ['duration'] }, { uid: 't3', text: 'C', duration: 60, score: 50, reasons: [] }],
    plannedMinutes: 270,
    availableMinutes: 180,
    windows: [{ start: '10:00', end: '11:00', minutes: 60 }],
    suggestions: [{ taskUid: 't1', start: '10:00', end: '11:00' }],
  });
  assert.ok(html.includes('plannerStep1Title'));
  assert.ok(html.includes('plannerStep2Title'));
  assert.ok(html.includes('plannerStep3Title'));
  assert.ok(html.includes('plannerStep4Title'));
  assert.ok(html.includes('plannerStep5Title'));
  assert.ok(html.includes('planner-warning')); // overload warning xuất hiện
  assert.ok(html.includes('data-planner-overdue="0"'));
  assert.ok(html.includes('data-planner-top="0"'));
});

test('UI: readSelections đọc checkbox + select từ DOM', () => {
  // Fake DOM tối thiểu (module thuần — chỉ dùng querySelectorAll + checked/value)
  const mkCb = (i, checked) => ({ checked, dataset: { plannerTop: String(i) } });
  const mkSel = (i, value) => ({ value, dataset: { plannerOverdue: String(i) } });
  const root = {
    querySelectorAll: (sel) => (sel === '[data-planner-top]'
      ? [mkCb(0, true), mkCb(1, false), mkCb(2, true)]
      : [mkSel(0, 'tomorrow'), mkSel(1, 'inbox')]),
  };
  const sel = UI.readSelections(root);
  assert.deepEqual([...sel.includeIdx].sort(), [0, 2]);
  assert.equal(sel.overdueChoices[0], 'tomorrow');
  assert.equal(sel.overdueChoices[1], 'inbox');
});

test('UI: buildApplyPlan chỉ giữ block của task được chọn + reschedule khác today', () => {
  const proposal = {
    top: [{ uid: 't1', text: 'A', duration: 60 }, { uid: 't2', text: 'B', duration: 60 }],
    suggestions: [{ taskUid: 't1', start: '10:00', end: '11:00' }, { taskUid: 't2', start: '11:00', end: '12:00' }],
    overdue: [{ uid: 'o1' }, { uid: 'o2' }],
  };
  const plan = UI.buildApplyPlan(proposal, { includeIdx: new Set([0]), overdueChoices: { 0: 'today', 1: 'inbox' } });
  assert.deepEqual(plan.blocks, [{ taskUid: 't1', start: '10:00', end: '11:00' }]);
  assert.deepEqual(plan.reschedule, [{ idx: 1, option: 'inbox' }]); // 'today' bị bỏ
});

test('UI: buildApplyPlan không có suggestion → blocks rỗng', () => {
  const plan = UI.buildApplyPlan({ top: [{ uid: 't1' }], suggestions: null, overdue: [] }, { includeIdx: new Set([0]), overdueChoices: {} });
  assert.deepEqual(plan.blocks, []);
  assert.deepEqual(plan.reschedule, []);
});

/* ---------------- i18n + duration display (P1/P2/P9/P10) ---------------- */

test('formatMinutes: ngôn ngữ-aware (VI/EN), phút/giờ/giờ+phút', () => {
  assert.strictEqual(Rules.formatMinutes(0, 'vi'), '0 phút');
  assert.strictEqual(Rules.formatMinutes(30, 'vi'), '30 phút');
  assert.strictEqual(Rules.formatMinutes(60, 'vi'), '1 giờ');
  assert.strictEqual(Rules.formatMinutes(90, 'vi'), '1 giờ 30 phút');
  assert.strictEqual(Rules.formatMinutes(0, 'en'), '0 min');
  assert.strictEqual(Rules.formatMinutes(30, 'en'), '30 min');
  assert.strictEqual(Rules.formatMinutes(60, 'en'), '1 h');
  assert.strictEqual(Rules.formatMinutes(90, 'en'), '1 h 30 min');
  assert.strictEqual(Rules.formatMinutes(-5, 'vi'), '0 phút');
});

test('UI: plannerContentHTML dùng TaskFlowI18N + reason casing đúng, không raw key', () => {
  const savedWin = globalThis.window;
  globalThis.window = globalThis;
  globalThis.TaskFlowPlannerRules = Rules;
  globalThis.TaskFlowI18N = {
    t: (key, vars) => {
      const dict = {
        plannerStep1Title: 'S1', plannerStep2Title: 'S2', plannerStep3Title: 'S3',
        plannerStep4Title: 'S4', plannerStep5Title: 'S5', plannerOverdue: 'QH',
        plannerReschedule: 'D', plannerOptToday: 'T', plannerOptTomorrow: 'N',
        plannerOptThisWeek: 'W', plannerOptInbox: 'I', plannerNoDur: 'ND',
        plannerReasonPriority: 'uu-tien', plannerReasonDeadline3: 'han-3',
        plannerReasonProject: 'du-an', plannerScore: 'Diem: {n}',
        plannerPlanned: 'DKH', plannerAvailable: 'CS', plannerHours: 'gio',
        plannerPreviewBlocks: 'Tao {n} block', plannerPreviewOverdue: 'Doi {n}',
        plannerPreviewOrder: 'Sap {n}', plannerApplyNote: 'Note', plannerBlocksHint: 'H',
        plannerOrderOnly: 'O', plannerNoFit: 'NF', plannerTaskFallback: 'Công việc',
      };
      let v = dict[key];
      if (v === undefined) return key;
      if (vars) Object.keys(vars).forEach((k) => { v = v.split('{' + k + '}').join(String(vars[k])); });
      return v;
    },
    getLang: () => 'vi',
  };
  try {
    const html = UI.plannerContentHTML({
      availableMinutes: 300, plannedMinutes: 120,
      overdue: [], top: [
        { uid: 'a', text: 'A', duration: 0, score: 500, reasons: ['priority', 'deadline3'] },
        { uid: 'b', text: 'B', duration: 90, score: 0, reasons: ['weird-unknown'] },
      ],
      windows: null, suggestions: null,
    });
    assert.ok(!/>plannerReason/.test(html), 'không raw reason key ở text');
    assert.ok(!/>plannerStep/.test(html), 'không raw step key ở text');
    assert.ok(html.includes('uu-tien'), 'priority → plannerReasonPriority');
    assert.ok(html.includes('han-3'), 'deadline3 → plannerReasonDeadline3');
    assert.ok(html.includes('Diem: 500'), 'score label dịch + giá trị');
    assert.ok(html.includes('Diem: 0'), 'score 0 vẫn hiển thị nhãn dịch');
    assert.ok(html.includes('1 giờ 30 phút'), 'duration theo ngôn ngữ vi (90 phút)');
    assert.ok(html.includes('ND'), 'plannerNoDur dịch');
    assert.ok(!html.includes('weird-unknown'), 'reason lạ bị bỏ qua, không lộ');
    assert.ok(!html.includes('min '), 'không lộ đơn vị min trong bản VI');
  } finally {
    delete globalThis.TaskFlowI18N;
    delete globalThis.TaskFlowPlannerRules;
    globalThis.window = savedWin;
  }
});

test('UI: taskTextFor KHÔNG bao giờ fallback về UID (P1.1)', () => {
  const savedWin = globalThis.window;
  globalThis.window = globalThis;
  globalThis.TaskFlowI18N = {
    t: (key) => ({ plannerTaskFallback: 'Công việc' }[key] || key),
  };
  try {
    const html = UI.plannerContentHTML({
      availableMinutes: 300, plannedMinutes: 60,
      overdue: [], top: [{ uid: 'a', text: 'A', duration: 60, score: 500, reasons: [] }],
      windows: null,
      suggestions: [{ taskUid: 'tmsyccp56u6k5r5', start: '10:00', end: '11:00' }],
    });
    assert.ok(html.includes('Công việc'), 'task không tìm thấy → nhãn dịch an toàn');
    assert.ok(!html.includes('tmsyccp56u6k5r5'), 'UID KHÔNG bao giờ là text hiển thị');
    assert.ok(html.includes('A'), 'task tìm thấy → hiện text thật');
  } finally {
    delete globalThis.TaskFlowI18N;
    globalThis.window = savedWin;
  }
});

test('UI: planner-ui đọc global chuẩn TaskFlowI18N (không TaskFlowI18n)', () => {
  assert.match(APPJS, /window\.TaskFlowI18N/);
  assert.ok(!UIJS.includes('TaskFlowI18n.'), 'không dùng alias sai casing');
});

/* ---------------- Wiring ---------------- */

test('wiring: app.html load planner-rules + planner-ui trước app.js + v176', () => {
  assert.match(APP, /src="js\/planner-rules\.min\.js\?v=\d+"/);
  assert.match(APP, /src="js\/planner-ui\.min\.js\?v=\d+"/);
  assert.match(APP, /js\/app\.min\.js\?v=209/);
  const rulesIdx = APP.indexOf('js/planner-rules.min.js?v=');
  const uiIdx = APP.indexOf('js/planner-ui.min.js?v=');
  const appIdx = APP.indexOf('js/app.min.js?v=');
  assert.ok(rulesIdx >= 0 && uiIdx >= 0 && rulesIdx < appIdx && uiIdx < appIdx, 'planner modules load trước app.js');
});

test('wiring: sw.js precache planner modules + cache bump v215', () => {
  assert.ok(SW.includes("'./js/planner-rules.min.js'"), 'SW precache planner-rules.min.js');
  assert.ok(SW.includes("'./js/planner-ui.min.js'"), 'SW precache planner-ui.min.js');
  assert.match(SW, /const CACHE = 'taskflow-v261'/);
});

test('wiring: app.js dispatcher có planner-open / planner-apply / planner-cancel', () => {
  assert.match(APPJS, /act === 'planner-open'/);
  assert.match(APPJS, /act === 'planner-apply'/);
  assert.match(APPJS, /act === 'planner-cancel'/);
  assert.match(APPJS, /function openPlannerModal\(\)/);
  assert.match(APPJS, /function applyPlannerPlan\(\)/);
  // Không sửa data trước Apply: openPlannerModal không gọi save/create.
  // Cắt đến đầu block AI (aiCollectTasks) — vùng này chỉ là body của
  // openPlannerModal; các hàm AI (aiRun/aiApply) nằm sau đó không thuộc.
  const openEnd = APPJS.indexOf('function aiCollectTasks');
  const openBody = APPJS.slice(APPJS.indexOf('function openPlannerModal'), openEnd > 0 ? openEnd : APPJS.indexOf('function applyPlannerPlan'));
  assert.ok(!openBody.includes('saveTimeBlocksStore('), 'openPlannerModal không được tạo block');
  assert.ok(!openBody.includes('.createTimeBlock('), 'openPlannerModal không được tạo block');
});

test('wiring: today.js render nút planner trong Today header', () => {
  const TODAY = readFileSync('js/today.js', 'utf8');
  assert.match(TODAY, /data-action="planner-open"/);
  assert.match(TODAY, /today-planner-btn/);
});

test('wiring: app.html có plannerModal với data-testid', () => {
  assert.match(APP, /id="plannerModal"/);
  assert.match(APP, /data-testid="planner-modal"/);
  assert.match(APP, /id="plannerContent"/);
});
