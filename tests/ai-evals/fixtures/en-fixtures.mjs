/**
 * Phase 6R — English Language Fixtures
 *
 * Equivalent English cases for Vietnamese fixtures.
 * Vietnamese and English must produce equivalent structural behavior
 * when the intent is equivalent. Do NOT require identical wording.
 */

export const TODAY = '2026-08-21';
export const TOMORROW = '2026-08-22';
export const NEXT_WEEK_START = '2026-08-24';
export const NEXT_WEEK_END = '2026-08-30';

export const sampleTasks = [
  { uid: 't1', text: 'Learn advanced C#', duration: 60, project: { id: 'proj1', name: 'Database' }, done: false, date: TODAY },
  { uid: 't2', text: 'Database homework', duration: 90, project: { id: 'proj1', name: 'Database' }, done: false, date: TODAY },
  { uid: 't3', text: 'Review week 3 theory', duration: 45, project: { id: 'proj2', name: 'Theory' }, done: false, date: TOMORROW },
  { uid: 't4', text: 'Prepare project presentation', duration: 120, project: { id: 'proj1', name: 'Database' }, done: false, date: null },
  { uid: 't5', text: 'Write lab report', duration: 60, project: { id: 'proj3', name: 'Lab' }, done: true, date: TODAY },
];

export const sampleProjects = [
  { id: 'proj1', name: 'Database' },
  { id: 'proj2', name: 'Theory' },
  { id: 'proj3', name: 'Lab' },
];

export const sampleOverdue = [
  { uid: 'to1', text: 'Submit ARRAY homework', duration: 30, overdueDays: 2 },
];

export const planDayFixtures = [
  {
    id: 'en-plan-day-basic',
    language: 'en',
    request: 'Plan my day tomorrow.',
    context: {
      kind: 'plan_day',
      lang: 'en',
      today: TODAY,
      tasks: sampleTasks.filter(t => !t.done),
      projects: sampleProjects,
      userText: 'Plan my day tomorrow.',
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
      summary: 'Schedule C# and important tasks for tomorrow',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: TOMORROW, start: '09:00', duration: 60, option: null, text: null },
        { type: 'schedule_task', taskUid: 't2', date: TOMORROW, start: '10:30', duration: 90, option: null, text: null },
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Start with DB homework before C#' },
      ],
    },
  },
  {
    id: 'en-plan-day-morning',
    language: 'en',
    request: 'Schedule the most important work in the morning.',
    context: {
      kind: 'plan_day',
      lang: 'en',
      today: TODAY,
      tasks: sampleTasks.filter(t => !t.done),
      projects: sampleProjects,
      userText: 'Schedule the most important work in the morning.',
    },
    expected: {
      allowedActions: ['schedule_task', 'reschedule_task', 'next_action'],
      maxActions: 10,
      mustRequireConfirmation: true,
    },
    mockResponse: {
      summary: 'Most important work scheduled for morning',
      actions: [
        { type: 'schedule_task', taskUid: 't2', date: TODAY, start: '08:00', duration: 90, option: null, text: null },
        { type: 'schedule_task', taskUid: 't1', date: TODAY, start: '10:00', duration: 60, option: null, text: null },
      ],
    },
  },
  {
    id: 'en-plan-day-1hour',
    language: 'en',
    request: 'I only have one hour tonight.',
    context: {
      kind: 'plan_day',
      lang: 'en',
      today: TODAY,
      tasks: sampleTasks.filter(t => !t.done),
      projects: sampleProjects,
      userText: 'I only have one hour tonight.',
    },
    expected: {
      allowedActions: ['schedule_task', 'reschedule_task', 'next_action'],
      maxActions: 10,
      mustRequireConfirmation: true,
    },
    mockResponse: {
      summary: 'Only 60 minutes scheduled for tonight',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: TODAY, start: '19:00', duration: 60, option: null, text: null },
      ],
    },
  },
  {
    id: 'en-plan-day-afternoon',
    language: 'en',
    request: 'Move this task to tomorrow afternoon.',
    context: {
      kind: 'reschedule',
      lang: 'en',
      today: TODAY,
      tasks: sampleTasks.filter(t => !t.done),
      overdue: sampleOverdue,
      projects: sampleProjects,
      userText: 'Move this task to tomorrow afternoon.',
    },
    expected: {
      allowedActions: ['reschedule_task'],
      maxActions: 10,
      mustRequireConfirmation: true,
    },
    mockResponse: {
      summary: 'Rescheduled to tomorrow afternoon',
      actions: [
        { type: 'reschedule_task', taskUid: 't2', option: 'tomorrow', taskUid: 't2', date: null, start: null, duration: null, text: null },
      ],
    },
  },
];

export const planWeekFixtures = [
  {
    id: 'en-plan-week-completion',
    language: 'en',
    request: 'Plan my next week around these meetings.',
    context: {
      kind: 'plan_week',
      lang: 'en',
      today: TODAY,
      weekStart: NEXT_WEEK_START,
      weekEnd: NEXT_WEEK_END,
      tasks: sampleTasks.filter(t => !t.done),
      projects: sampleProjects,
      userText: 'Plan my next week around these meetings.',
    },
    expected: {
      allowedActions: ['schedule_task', 'reschedule_task', 'next_action'],
      maxActions: 10,
      mustRequireConfirmation: true,
      datesMustBeWithinWeek: true,
    },
    mockResponse: {
      summary: 'Weekly plan focused on project completion',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2026-08-24', start: '09:00', duration: 60, option: null, text: null },
        { type: 'schedule_task', taskUid: 't2', date: '2026-08-25', start: '09:00', duration: 90, option: null, text: null },
        { type: 'schedule_task', taskUid: 't4', date: '2026-08-26', start: '09:00', duration: 120, option: null, text: null },
        { type: 'schedule_task', taskUid: 't3', date: '2026-08-27', start: '09:00', duration: 45, option: null, text: null },
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Focus on Database project first' },
      ],
    },
  },
];

export const nextActionsFixtures = [
  {
    id: 'en-next-action-breakdown',
    language: 'en',
    request: 'Break this project into milestones.',
    context: {
      kind: 'breakdown_project',
      lang: 'en',
      today: TODAY,
      tasks: [{ uid: 't4', text: 'Prepare project presentation', duration: 120, project: { id: 'proj1', name: 'Database' }, done: false }],
      projects: sampleProjects,
      selectedProjectId: 'proj1',
      userText: 'Break this project into milestones.',
    },
    expected: {
      allowedActions: ['next_action'],
      maxActions: 3,
      mustRequireConfirmation: false,
    },
    mockResponse: {
      summary: 'Database project breakdown',
      actions: [
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Design ERD and schema' },
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Implement stored procedures' },
        { type: 'next_action', taskUid: null, date: null, start: null, duration: null, option: null, text: 'Test and optimize queries' },
      ],
    },
  },
];

export const rescheduleFixtures = [
  {
    id: 'en-reschedule-overdue',
    language: 'en',
    request: 'Move all overdue tasks to tomorrow.',
    context: {
      kind: 'reschedule',
      lang: 'en',
      today: TODAY,
      tasks: sampleTasks.filter(t => !t.done),
      overdue: sampleOverdue,
      projects: sampleProjects,
      userText: 'Move all overdue tasks to tomorrow.',
    },
    expected: {
      allowedActions: ['reschedule_task'],
      maxActions: 10,
      mustRequireConfirmation: true,
    },
    mockResponse: {
      summary: 'Moved overdue tasks to tomorrow',
      actions: [
        { type: 'reschedule_task', taskUid: 't2', option: 'tomorrow', date: null, start: null, duration: null, text: null },
      ],
    },
  },
];

export const allFixtures = [
  ...planDayFixtures,
  ...planWeekFixtures,
  ...nextActionsFixtures,
  ...rescheduleFixtures,
];
