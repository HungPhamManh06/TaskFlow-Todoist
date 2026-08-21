/**
 * Phase 6R — Vietnamese Language Fixtures
 *
 * Deterministic mock provider outputs for AI contract evaluation.
 * Each fixture contains a realistic Vietnamese request context and a canned
 * AI response that exercises the contract validation layer.
 *
 * Expected properties describe CONTRACT expectations, not prose.
 */

export const TODAY = '2026-08-21';
export const TOMORROW = '2026-08-22';
export const NEXT_WEEK_START = '2026-08-24';
export const NEXT_WEEK_END = '2026-08-30';

/* ─── Helper task sets for fixtures ─── */
export const sampleTasks = [
  { uid: 't1', text: 'Học C# nâng cao', duration: 60, project: { id: 'proj1', name: 'Database' }, done: false, date: TODAY },
  { uid: 't2', text: 'Làm bài tập cơ sở dữ liệu', duration: 90, project: { id: 'proj1', name: 'Database' }, done: false, date: TODAY },
  { uid: 't3', text: 'Ôn tập lý thuyết tuần 3', duration: 45, project: { id: 'proj2', name: 'Theory' }, done: false, date: TOMORROW },
  { uid: 't4', text: 'Chuẩn bị presentation đồ án', duration: 120, project: { id: 'proj1', name: 'Database' }, done: false, date: null },
  { uid: 't5', text: 'Viết báo cáo thực hành', duration: 60, project: { id: 'proj3', name: 'Lab' }, done: true, date: TODAY },
];

export const sampleProjects = [
  { id: 'proj1', name: 'Database' },
  { id: 'proj2', name: 'Theory' },
  { id: 'proj3', name: 'Lab' },
];

export const sampleOverdue = [
  { uid: 'to1', text: 'Nộp bài tập ARRAY', duration: 30, overdueDays: 2 },
];

/* ─── Fixtures: Vietnamese planning requests with expected contracts ─── */

export const planDayFixtures = [
  {
    id: 'vi-plan-day-basic',
    language: 'vi',
    request: 'Lập lịch học C# cho tôi vào ngày mai',
    context: {
      kind: 'plan_day',
      lang: 'vi',
      today: TODAY,
      tasks: sampleTasks.filter(t => !t.done),
      projects: sampleProjects,
      userText: 'Lập lịch học C# cho tôi vào ngày mai',
    },
    expected: {
      allowedActions: ['schedule_task', 'reschedule_task', 'next_action'],
      forbiddenActions: ['delete_task', 'update_task', 'complete_task', 'create_task'],
      maxActions: 10,
      mustRequireConfirmation: true,
      mustNotMutateDirectly: true,
      summaryMaxLen: 400,
      taskUidsMustExist: true,
      datesMustBeValid: true,
      durationsMustBeRange: [5, 480],
    },
    mockResponse: {
      summary: 'Lên lịch học C# và các việc quan trọng ngày mai',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: TOMORROW, start: '09:00', duration: 60, option: null, text: null },
        { type: 'schedule_task', taskUid: 't2', date: TOMORROW, start: '10:30', duration: 90, option: null, text: null },
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Bắt đầu với bài tập DB trước khi học C#' },
      ],
    },
  },
  {
    id: 'vi-plan-day-morning',
    language: 'vi',
    request: 'Sắp xếp việc quan trọng nhất vào buổi sáng',
    context: {
      kind: 'plan_day',
      lang: 'vi',
      today: TODAY,
      tasks: sampleTasks.filter(t => !t.done),
      projects: sampleProjects,
      userText: 'Sắp xếp việc quan trọng nhất vào buổi sáng',
    },
    expected: {
      allowedActions: ['schedule_task', 'reschedule_task', 'next_action'],
      maxActions: 10,
      mustRequireConfirmation: true,
      mustNotMutateDirectly: true,
    },
    mockResponse: {
      summary: 'Việc quan trọng nhất được xếp buổi sáng',
      actions: [
        { type: 'schedule_task', taskUid: 't2', date: TODAY, start: '08:00', duration: 90, option: null, text: null },
        { type: 'schedule_task', taskUid: 't1', date: TODAY, start: '10:00', duration: 60, option: null, text: null },
      ],
    },
  },
  {
    id: 'vi-plan-day-1hour',
    language: 'vi',
    request: 'Tối nay tôi chỉ có 1 tiếng',
    context: {
      kind: 'plan_day',
      lang: 'vi',
      today: TODAY,
      tasks: sampleTasks.filter(t => !t.done),
      projects: sampleProjects,
      userText: 'Tối nay tôi chỉ có 1 tiếng',
    },
    expected: {
      allowedActions: ['schedule_task', 'reschedule_task', 'next_action'],
      maxActions: 10,
      mustRequireConfirmation: true,
    },
    mockResponse: {
      summary: 'Chỉ xếp 60 phút cho tối nay',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: TODAY, start: '19:00', duration: 60, option: null, text: null },
      ],
    },
  },
  {
    id: 'vi-plan-day-gym',
    language: 'vi',
    request: 'Tôi muốn tập gym sau giờ học',
    context: {
      kind: 'plan_day',
      lang: 'vi',
      today: TODAY,
      tasks: sampleTasks.filter(t => !t.done),
      projects: sampleProjects,
      userText: 'Tôi muốn tập gym sau giờ học',
    },
    expected: {
      allowedActions: ['schedule_task', 'reschedule_task', 'next_action'],
      maxActions: 10,
      mustRequireConfirmation: true,
    },
    mockResponse: {
      summary: 'Kế hoạch học tập và gym',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: TODAY, start: '09:00', duration: 60, option: null, text: null },
        { type: 'schedule_task', taskUid: 't2', date: TODAY, start: '10:30', duration: 90, option: null, text: null },
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Tập gym lúc 16:00 sau khi học xong' },
      ],
    },
  },
];

export const planWeekFixtures = [
  {
    id: 'vi-plan-week-completion',
    language: 'vi',
    request: 'Tuần sau tôi phải hoàn thành đồ án',
    context: {
      kind: 'plan_week',
      lang: 'vi',
      today: TODAY,
      weekStart: NEXT_WEEK_START,
      weekEnd: NEXT_WEEK_END,
      tasks: sampleTasks.filter(t => !t.done),
      projects: sampleProjects,
      userText: 'Tuần sau tôi phải hoàn thành đồ án',
    },
    expected: {
      allowedActions: ['schedule_task', 'reschedule_task', 'next_action'],
      maxActions: 10,
      mustRequireConfirmation: true,
      datesMustBeWithinWeek: true,
    },
    mockResponse: {
      summary: 'Kế hoạch tuần hoàn thành đồ án',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2026-08-24', start: '09:00', duration: 60, option: null, text: null },
        { type: 'schedule_task', taskUid: 't2', date: '2026-08-25', start: '09:00', duration: 90, option: null, text: null },
        { type: 'schedule_task', taskUid: 't4', date: '2026-08-26', start: '09:00', duration: 120, option: null, text: null },
        { type: 'schedule_task', taskUid: 't3', date: '2026-08-27', start: '09:00', duration: 45, option: null, text: null },
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Tập trung đồ án Database trước' },
      ],
    },
  },
];

export const rescheduleFixtures = [
  {
    id: 'vi-reschedule-tomorrow',
    language: 'vi',
    request: 'Dời bài tập cơ sở dữ liệu sang chiều mai',
    context: {
      kind: 'reschedule',
      lang: 'vi',
      today: TODAY,
      tasks: sampleTasks.filter(t => !t.done),
      overdue: sampleOverdue,
      projects: sampleProjects,
      userText: 'Dời bài tập cơ sở dữ liệu sang chiều mai',
    },
    expected: {
      allowedActions: ['reschedule_task'],
      forbiddenActions: ['delete_task', 'create_task', 'complete_task'],
      maxActions: 10,
      mustRequireConfirmation: true,
      rescheduleOptionsOnly: true,
    },
    mockResponse: {
      summary: 'Dời bài tập DB sang chiều mai',
      actions: [
        { type: 'reschedule_task', taskUid: 't2', option: 'tomorrow', taskUid: 't2', date: null, start: null, duration: null, text: null },
      ],
    },
  },
  {
    id: 'vi-reschedule-all',
    language: 'vi',
    request: 'Dời tất cả việc hôm nay sang ngày mai',
    context: {
      kind: 'reschedule',
      lang: 'vi',
      today: TODAY,
      tasks: sampleTasks.filter(t => !t.done),
      overdue: sampleOverdue,
      projects: sampleProjects,
      userText: 'Dời tất cả việc hôm nay sang ngày mai',
    },
    expected: {
      allowedActions: ['reschedule_task'],
      maxActions: 10,
      mustRequireConfirmation: true,
    },
    mockResponse: {
      summary: 'Dời tất cả việc hôm nay sang ngày mai',
      actions: [
        { type: 'reschedule_task', taskUid: 't1', option: 'tomorrow', taskUid: 't1', date: null, start: null, duration: null, text: null },
        { type: 'reschedule_task', taskUid: 't2', option: 'tomorrow', taskUid: 't2', date: null, start: null, duration: null, text: null },
      ],
    },
  },
];

export const nextActionsFixtures = [
  {
    id: 'vi-next-action-weekend',
    language: 'vi',
    request: 'Cuối tuần này tôi muốn hoàn thành project',
    context: {
      kind: 'next_actions',
      lang: 'vi',
      today: TODAY,
      tasks: sampleTasks.filter(t => !t.done),
      projects: sampleProjects,
      userText: 'Cuối tuần này tôi muốn hoàn thành project',
    },
    expected: {
      allowedActions: ['next_action'],
      forbiddenActions: ['schedule_task', 'reschedule_task', 'create_task', 'complete_task'],
      maxActions: 3,
      nextActionMaxLen: 160,
      mustRequireConfirmation: false,
    },
    mockResponse: {
      summary: 'Gợi ý cho cuối tuần',
      actions: [
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Hoàn thành bài tập DB trước' },
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Ôn lý thuyết tuần 3' },
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Chuẩn bị presentation' },
      ],
    },
  },
];

export const breakdownFixtures = [
  {
    id: 'vi-breakdown-project',
    language: 'vi',
    request: 'Phân rã dự án Database thành các task nhỏ',
    context: {
      kind: 'breakdown_project',
      lang: 'vi',
      today: TODAY,
      tasks: [{ uid: 't4', text: 'Chuẩn bị presentation đồ án', duration: 120, project: { id: 'proj1', name: 'Database' }, done: false }],
      projects: sampleProjects,
      selectedProjectId: 'proj1',
      userText: 'Phân rã dự án Database thành các task nhỏ',
    },
    expected: {
      allowedActions: ['next_action'],
      maxActions: 3,
      mustRequireConfirmation: false,
    },
    mockResponse: {
      summary: 'Phân rã dự án Database',
      actions: [
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Thiết kế ERD và schema' },
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Triển khaistored procedures' },
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Test và optimize query' },
      ],
    },
  },
];

/* ─── Date/time interpretation expected values ─── */
export const dateInterpretations = [
  { vi: 'hôm nay', expectedDate: TODAY },
  { vi: 'tối nay', expectedDate: TODAY },
  { vi: 'mai', expectedDate: TOMORROW },
  { vi: 'sáng mai', expectedDate: TOMORROW },
  { vi: 'chiều mai', expectedDate: TOMORROW },
  { vi: 'tối mai', expectedDate: TOMORROW },
  { vi: 'ngày kia', expectedDate: '2026-08-23' },
  { vi: 'cuối tuần', expectedDayOfWeek: 6 },
  { vi: 'tuần sau', expectedYearWeek: '2026-W35' },
  { vi: 'thứ hai tuần sau', expectedDate: '2026-08-31' },
];

/* ─── All fixture groups ─── */
export const allFixtures = [
  ...planDayFixtures,
  ...planWeekFixtures,
  ...rescheduleFixtures,
  ...nextActionsFixtures,
  ...breakdownFixtures,
];
