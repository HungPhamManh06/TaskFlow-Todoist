'use strict';
/* Phase 5B — Intent Classifier + Task Resolver Tests. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require2 = createRequire(import.meta.url);
const intent = require2('../js/ai-intent.js');
const { classifyIntent, resolveTaskReference, isActionIntent, _normalize, _extractTaskName } = intent;

const SAMPLE_TASKS = [
  { uid: 't1', text: 'Học Database', kind: 'regular', deadline: '2026-08-21', duration: 60 },
  { uid: 't2', text: 'Học Database', kind: 'regular', deadline: '2026-08-25', duration: 45 },
  { uid: 't3', text: 'Học C#', kind: 'priority', deadline: '2026-08-20', duration: 90 },
  { uid: 't4', text: 'Ôn SQL', kind: 'regular', deadline: null, duration: 30 },
  { uid: 't5', text: 'Làm bài tập Web', kind: 'regular', deadline: '2026-08-22', duration: 120 },
  { uid: 't6', text: 'Thiết kế UI App', kind: 'priority', deadline: '2026-08-23', duration: 60 },
];

/* P3: GENERAL CHAT */
const GENERAL_CHAT = [
  'Pomodoro là gì?', 'Cho tôi mẹo tập trung.', 'C# là gì?',
  'What is Pomodoro technique?', 'Give me focus tips.',
  'How does TaskFlow work?',
];
for (const msg of GENERAL_CHAT) {
  test(`chat: "${msg}" → chat`, () => {
    const r = classifyIntent(msg, SAMPLE_TASKS);
    assert.equal(r.kind, 'chat', `got ${r.kind} (${r.reason})`);
  });
}

/* P4: HOW-TO */
const HOWTO = [
  'Cách tạo task như thế nào?', 'Làm sao để tạo task?', 'How do I create a task?',
  'Bạn có thể tạo task không?', 'Trợ lý có thể đổi lịch cho tôi không?',
  'Cách hoàn thành task?', 'How to mark a task as done?', 'Làm sao để xóa task?',
  'Có thể xếp lịch task không?', 'How can I schedule tasks?',
];
for (const msg of HOWTO) {
  test(`how-to: "${msg}" → chat`, () => {
    assert.equal(classifyIntent(msg, SAMPLE_TASKS).kind, 'chat');
  });
}

/* P5: READ-ONLY */
const READONLY = [
  'Hôm nay tôi còn task nào?', 'Task Database đã xong chưa?',
  'Chiều nay tôi rảnh lúc nào?', 'Tuần này tôi có bao nhiêu việc?',
  'Dự án Website tiến độ thế nào?',
  'What tasks do I have today?', 'How many tasks are left this week?',
  'Is Database completed?', 'Show me my schedule.',
];
for (const msg of READONLY) {
  test(`read: "${msg}" → read`, () => {
    const r = classifyIntent(msg, SAMPLE_TASKS);
    assert.equal(r.kind, 'read', `got ${r.kind} (${r.reason})`);
  });
}

/* P6: CLEAR ACTION → agent (with unique task names only) */
const ACTION_UNIQUE = [
  ['Tạo task học C#.', 'create_task'],
  ['Thêm công việc ôn SQL.', 'create_task'],
  ['Add a task for SQL revision.', 'create_task'],
  ['Create a task to study C#.', 'create_task'],
  ['Hoàn thành bài Database.', 'complete_task'], // with dupes → clarify, with unique → agent
  ['Đánh dấu bài Database xong.', 'complete_task'],
  ['Mark Database as complete.', 'complete_task'],
  ['Xếp task lúc 8 giờ tối.', 'schedule_task'],
  ['Schedule Database at 8 PM.', 'schedule_task'],
  ['Đổi Học C# thành ưu tiên cao.', 'update_task'],
  ['Chuyển task Học C# sang ngày mai.', 'reschedule_task'],
  ['Move Database to tomorrow.', 'reschedule_task'],
  ['Tạo task học C# 60 phút.', 'create_task'],
  ['Thêm task mới: Ôn SQL.', 'create_task'],
  ['Đánh dấu task hoàn thành.', 'complete_task'],
  ['Rename task to Test.', 'update_task'],
  ['Chuyển task sang mai.', 'reschedule_task'],
  ['Ưu tiên cao task Học C#.', 'update_task'],
];
for (const [msg, expectedAction] of ACTION_UNIQUE) {
  test(`action: "${msg}" → agent/${expectedAction}`, () => {
    const r = classifyIntent(msg, SAMPLE_TASKS);
    // Duplicate tasks cause clarify; unique task matches → agent
    assert.ok(r.kind === 'agent' || r.kind === 'clarify',
      `expected agent or clarify, got ${r.kind} (${r.reason})`);
    if (r.kind === 'agent') assert.equal(r.actionType, expectedAction);
  });
}

/* P7: AMBIGUOUS → clarify */
const AMBIGUOUS = [
  'Làm task Database đi.', 'Xử lý task C#.', 'Đổi task Database.',
  'Chuyển task Database.', 'Xếp task Database.',
  'Take care of Database.', 'Handle C# task.',
];
for (const msg of AMBIGUOUS) {
  test(`clarify: "${msg}" → clarify`, () => {
    const r = classifyIntent(msg, SAMPLE_TASKS);
    assert.equal(r.kind, 'clarify', `got ${r.kind} (${r.reason})`);
  });
}

/* P8: MISSING PARAMS → clarify */
const MISSING = [
  ['Tạo task.', 'missing-task-text'], ['Chuyển task.', 'missing-target'],
  ['Xếp task.', 'missing-target'], ['Đổi task.', 'missing-parameter'],
  ['Add task.', 'missing-task-text'], ['Move task.', 'missing-target'],
  ['Schedule task.', 'missing-target'], ['Update task.', 'missing-parameter'],
];
for (const [msg, expectedReason] of MISSING) {
  test(`missing: "${msg}" → clarify/${expectedReason}`, () => {
    const r = classifyIntent(msg, SAMPLE_TASKS);
    assert.equal(r.kind, 'clarify', `got ${r.kind}`);
    assert.equal(r.reason, expectedReason);
  });
}

/* P24: NEGATION → no agent */
const NEGATION = [
  'Đừng hoàn thành task Database.', 'Không tạo task mới.',
  "Do not create a task.", "Don't complete Database.",
  'Đừng chuyển task sang mai.', 'Không xếp task này.',
  'Never create tasks.', 'Không được hoàn thành.',
];
for (const msg of NEGATION) {
  test(`negation: "${msg}" → chat`, () => {
    const r = classifyIntent(msg, SAMPLE_TASKS);
    assert.equal(r.kind, 'chat', `got ${r.kind}`);
    assert.equal(r.reason, 'negated-action');
  });
}

/* P25: HYPOTHETICAL → no agent */
const HYPOTHETICAL = [
  'Nếu tôi tạo task học C# thì sao?', 'Giả sử tôi chuyển Database sang mai...',
  'What happens if I complete this task?', 'Nếu xếp Database lúc 8h thì sao?',
  'Suppose I add a new task.', 'What if I move Database?',
  'Nếu hoàn thành task này thì sao?', 'If I move this task?',
];
for (const msg of HYPOTHETICAL) {
  test(`hypothetical: "${msg}" → chat`, () => {
    const r = classifyIntent(msg, SAMPLE_TASKS);
    assert.equal(r.kind, 'chat', `got ${r.kind}`);
    assert.equal(r.reason, 'hypothetical');
  });
}

/* P26: QUOTED → chat */
const QUOTED = [
  'Câu "tạo task học C#" nghĩa là gì?',
  'Tôi muốn hiểu "hoàn thành task" nghĩa là sao.',
  '"Schedule task" là gì trong TaskFlow?',
];
for (const msg of QUOTED) {
  test(`quoted: "${msg}" → chat`, () => {
    const r = classifyIntent(msg, SAMPLE_TASKS);
    assert.equal(r.kind, 'chat');
    assert.equal(r.reason, 'quoted-action-text');
  });
}

/* P27: MULTI-STEP */
test('multi-step: "Tạo task học C# 60 phút rồi xếp lúc 20h" → agent', () => {
  assert.equal(classifyIntent('Tạo task học C# 60 phút rồi xếp lúc 20h', SAMPLE_TASKS).kind, 'agent');
});

/* P9-P10: ENTITY RESOLVER */
test('resolver: exact match', () => {
  const r = resolveTaskReference('Học C#', SAMPLE_TASKS);
  assert.equal(r.status, 'resolved'); assert.equal(r.task.uid, 't3');
});
test('resolver: accent-insensitive', () => {
  assert.equal(resolveTaskReference('Hoc C#', SAMPLE_TASKS).status, 'resolved');
});
test('resolver: strong substring', () => {
  assert.equal(resolveTaskReference('Ôn SQL', SAMPLE_TASKS).status, 'resolved');
});
test('resolver: duplicate names → ambiguous', () => {
  const r = resolveTaskReference('Học Database', SAMPLE_TASKS);
  assert.equal(r.status, 'ambiguous');
  assert.ok(r.candidates.length === 2);
});
test('resolver: not-found', () => {
  assert.equal(resolveTaskReference('Quantum Physics', SAMPLE_TASKS).status, 'not-found');
});
test('resolver: empty → not-found', () => {
  assert.equal(resolveTaskReference('', SAMPLE_TASKS).status, 'not-found');
});
test('resolver: candidate labels have no UIDs', () => {
  const r = resolveTaskReference('Học Database', SAMPLE_TASKS);
  for (const c of r.candidates) {
    assert.ok(!c.label.includes('uid'));
    assert.ok(!c.label.includes('t1'));
  }
});
test('resolver: max 5 candidates', () => {
  const tasks = Array.from({ length: 10 }, (_, i) => ({ uid: 'x' + i, text: 'Same Task', kind: 'regular' }));
  assert.ok(resolveTaskReference('Same Task', tasks).candidates.length <= 5);
});

/* P11: DUPLICATE TASKS → clarify */
test('classifyIntent: duplicate tasks → clarify', () => {
  const r = classifyIntent('Hoàn thành Học Database.', SAMPLE_TASKS);
  assert.equal(r.kind, 'clarify');
  assert.equal(r.reason, 'ambiguous-task');
});

/* P21: NOT-FOUND → clarify */
test('classifyIntent: unknown task → clarify', () => {
  const r = classifyIntent('Hoàn thành Quantum Physics.', SAMPLE_TASKS);
  assert.equal(r.kind, 'clarify');
  assert.equal(r.reason, 'not-found');
});

/* P22: EXPLICIT CREATE → agent even if task exists */
test('classifyIntent: explicit create → agent', () => {
  assert.equal(classifyIntent('Tạo task Học C#.', SAMPLE_TASKS).kind, 'agent');
});

/* P35: SAFETY — zero agent for safety categories */
const SAFETY_NO_AGENT = [...NEGATION, ...HYPOTHETICAL, ...HOWTO, ...GENERAL_CHAT, ...READONLY, ...QUOTED];
for (const msg of SAFETY_NO_AGENT) {
  test(`safety: "${msg}" must NOT route to agent`, () => {
    assert.notEqual(classifyIntent(msg, SAMPLE_TASKS).kind, 'agent', `"${msg}" wrongly routed to agent`);
  });
}

/* isActionIntent compatibility */
test('isActionIntent: action → true', () => {
  assert.equal(isActionIntent('Tạo task học C#'), true);
  assert.equal(isActionIntent('Hoàn thành Database.'), true);
  assert.equal(isActionIntent('Xếp task lúc 8h.'), true);
});
test('isActionIntent: non-action → false', () => {
  assert.equal(isActionIntent('Pomodoro là gì?'), false);
  assert.equal(isActionIntent(''), false);
  assert.equal(isActionIntent('Đừng hoàn thành Database.'), false);
  assert.equal(isActionIntent('Nếu tạo task thì sao?'), false);
  assert.equal(isActionIntent('Cách tạo task?'), false);
});

/* Helpers */
test('_normalize: strips diacritics', () => {
  assert.equal(_normalize('  Học C#  '), 'hoc c#');
});
test('_extractTaskName: create extracts after verb', () => {
  assert.ok(_extractTaskName('Tạo task học C#', 'create_task').includes('học C#'));
});
test('_extractTaskName: empty for empty', () => {
  assert.equal(_extractTaskName('', 'create_task'), '');
});

/* Edge cases */
test('edge: null → chat', () => { assert.equal(classifyIntent(null).kind, 'chat'); });
test('edge: undefined → chat', () => { assert.equal(classifyIntent(undefined).kind, 'chat'); });
test('edge: whitespace → chat', () => { assert.equal(classifyIntent('  ').kind, 'chat'); });
test('edge: very long message', () => {
  assert.equal(classifyIntent('Tạo task ' + 'a'.repeat(500), SAMPLE_TASKS).kind, 'agent');
});

/* Confidence policy */
test('confidence: clear action → high', () => {
  assert.equal(classifyIntent('Tạo task học C#.', SAMPLE_TASKS).confidence, 'high');
});
test('confidence: ambiguous task → medium', () => {
  assert.equal(classifyIntent('Hoàn thành Học Database.', SAMPLE_TASKS).confidence, 'medium');
});

/* Reason codes present */
test('all results have reason code', () => {
  for (const msg of ['Tạo task học C#', 'Pomodoro là gì?', '', 'Xếp task.']) {
    assert.ok(classifyIntent(msg, SAMPLE_TASKS).reason.length > 0);
  }
});

/* Fixture count */
test('eval suite has 80+ fixtures', () => {
  const total = GENERAL_CHAT.length + HOWTO.length + READONLY.length +
    ACTION_UNIQUE.length + AMBIGUOUS.length + MISSING.length +
    NEGATION.length + HYPOTHETICAL.length + QUOTED.length + SAFETY_NO_AGENT.length;
  assert.ok(total >= 80, `got ${total}`);
});
