'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseDocumentDateRange,
  extractDatedDocumentTasks,
  buildDatedDocumentRoadmap,
  buildDatedDocumentProposal,
} = require('../server/ai-dated-document.js');
const { handleDailyPlan, handleDocumentRoadmap } = require('../server/ai.js');

const FORTY_WEEK_TEXT = `
KẾ HOẠCH HỌC 40 TUẦN
Embedded Software + Networking
17/08/2026 - 23/05/2027 | 40 tuần | 280 ngày
Tuần 2: Function, Array, String (24/08 - 30/08/2026)
Ngày Nội dung học / thực hành Done
T2
24/08 Function, parameter, return value. [ ]
T3
25/08 Scope, local/global variable. [ ]
T4
26/08 Array 1 chiều; tìm min/max/sum. [ ]
T5
27/08 Array 2 chiều; matrix cơ bản. [ ]
T6
28/08 String và mảng char. [ ]
T7
29/08 Tự viết strlen, strcpy, strcmp phiên bản đơn giản. [ ]
CN
30/08 Mini-project quản lý danh sách sinh viên bằng array. [ ]
`;

function responseRecorder() {
  let statusCode = 200;
  let body = null;
  return {
    res: {
      status(code) { statusCode = code; return this; },
      json(value) { body = value; return this; },
      setHeader() {},
    },
    read() { return { statusCode, body }; },
  };
}

describe('Dated document parser', () => {
  it('extracts exact dated rows and preserves the 40-week range', () => {
    assert.deepEqual(parseDocumentDateRange(FORTY_WEEK_TEXT), {
      start: '2026-08-17',
      end: '2027-05-23',
      startYear: 2026,
      endYear: 2027,
    });
    const tasks = extractDatedDocumentTasks(FORTY_WEEK_TEXT);
    assert.equal(tasks.length, 7);
    assert.deepEqual(tasks.map((task) => task.date), [
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27',
      '2026-08-28', '2026-08-29', '2026-08-30',
    ]);
    assert.equal(tasks[0].text, 'Function, parameter, return value.');
    assert.equal(tasks[6].text, 'Mini-project quản lý danh sách sinh viên bằng array.');
    assert.ok(tasks.every((task) => task.week === 2));

    const roadmap = buildDatedDocumentRoadmap(FORTY_WEEK_TEXT, 'roadmap.pdf');
    assert.equal(roadmap.totalWeeks, 40);
    assert.equal(roadmap.datedTasks.length, 7);
    const plan = buildDatedDocumentProposal(roadmap, tasks.map((task) => task.date));
    assert.equal(plan.proposal.actions.length, 7);
    assert.equal(plan.proposal.actions[0].args.date, '2026-08-24');
    assert.equal(plan.proposal.actions[0].args.duration, 90);
  });

  it('infers the correct year across New Year', () => {
    const text = `
Roadmap 1 tuần
28/12/2026 - 03/01/2027
Tuần 1: Chuyển năm
28/12 Task cuối năm. [ ]
29/12 Task tiếp theo. [ ]
03/01 Task đầu năm mới. [ ]
`;
    assert.deepEqual(extractDatedDocumentTasks(text).map((task) => task.date), [
      '2026-12-28', '2026-12-29', '2027-01-03',
    ]);
  });

  it('recovers a task whose date is moved to the next PDF page', () => {
    const text = `
Roadmap một tuần
31/08/2026 - 06/09/2026
Tuần 3: Pointer
31/08 Memory address và pointer là gì. [ ]
T3 Pointer arithmetic. [ ]
-- 1 of 2 --
Trang 2
01/09
T4
02/09 Pointer + array. [ ]
`;
    assert.deepEqual(extractDatedDocumentTasks(text).map((task) => ({ date: task.date, text: task.text })), [
      { date: '2026-08-31', text: 'Memory address và pointer là gì.' },
      { date: '2026-09-01', text: 'Pointer arithmetic.' },
      { date: '2026-09-02', text: 'Pointer + array.' },
    ]);
  });

  it('keeps the row date when the task text mentions another date', () => {
    const text = `
Kế hoạch một tuần
24/08/2026 - 30/08/2026
Tuần 1: Deadline
Ngày Nội dung học / thực hành Done
T2
24/08 Chuẩn bị cho deadline 26/08 của module A. [ ]
T3
25/08 Hoàn thiện module B. [ ]
T4
26/08 Kiểm thử module A. [ ]
`;
    assert.deepEqual(extractDatedDocumentTasks(text).map((task) => ({ date: task.date, text: task.text })), [
      { date: '2026-08-24', text: 'Chuẩn bị cho deadline 26/08 của module A.' },
      { date: '2026-08-25', text: 'Hoàn thiện module B.' },
      { date: '2026-08-26', text: 'Kiểm thử module A.' },
    ]);
  });

  it('does not claim an undated roadmap is a dated schedule', () => {
    const text = '12-Week Roadmap\nWeeks 1-2: HTML and CSS\nDeliverable: Build a landing page';
    assert.deepEqual(extractDatedDocumentTasks(text), []);
    assert.equal(buildDatedDocumentRoadmap(text, 'roadmap.pdf'), null);
  });
});

describe('Stage A document-roadmap dated extraction', () => {
  it('returns a roadmap WITHOUT calling the AI provider and without any proposal', async () => {
    const fileBuffer = Buffer.from('dated-roadmap-fixture');
    let providerCalls = 0;
    const recorder = responseRecorder();

    await handleDocumentRoadmap(
      { aiRequestId: 'dated-fallback-test' },
      recorder.res,
      {
        apiKey: '',
        now: new Date('2026-08-24T03:00:00.000Z'),
        parseAiFileMultipart: async () => ({
          files: [{ name: 'roadmap.pdf', size: fileBuffer.length, buffer: fileBuffer }],
          rejectedFiles: [],
          message: 'Lập kế hoạch học từ tài liệu này',
          timeZone: 'Asia/Bangkok',
        }),
        buildAiFileBatchContent: async () => ({
          textDocuments: [{ name: 'roadmap.pdf', text: FORTY_WEEK_TEXT }],
          acceptedFiles: [{ name: 'roadmap.pdf', size: fileBuffer.length }],
          rejectedFiles: [],
        }),
        callAiJson: async () => {
          providerCalls++;
          throw new Error('provider must not be called for an explicit dated schedule');
        },
      },
    );

    const result = recorder.read();
    assert.equal(result.statusCode, 200);
    assert.equal(providerCalls, 0);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.proposal, undefined, 'Stage A must not produce a proposal');
    assert.equal(result.body.roadmap.totalWeeks, 40);
    assert.equal(result.body.roadmap.datedTasks.length, 7);
    assert.equal(result.body.meta.source, 'document-dates');
    assert.ok(Array.isArray(result.body.meta.dateRange) && result.body.meta.dateRange.length === 2);
    assert.equal(result.body.meta.totalDatedTasks, 7);
  });

  it('uses the deterministic path for a valid two-day schedule', async () => {
    const sparseText = `
Kế hoạch cuối tuần
05/09/2026 - 06/09/2026
Tuần 1: Ôn tập
05/09 Ôn lý thuyết. [ ]
06/09 Làm bài thực hành. [ ]
`;
    const fileBuffer = Buffer.from('sparse-dated-roadmap');
    let providerCalls = 0;
    const recorder = responseRecorder();

    await handleDocumentRoadmap(
      { aiRequestId: 'sparse-dated-fallback-test' },
      recorder.res,
      {
        apiKey: '',
        now: new Date('2026-09-05T03:00:00.000Z'),
        parseAiFileMultipart: async () => ({
          files: [{ name: 'weekend.pdf', size: fileBuffer.length, buffer: fileBuffer }],
          rejectedFiles: [],
          message: 'Lập kế hoạch học từ tài liệu này',
          timeZone: 'Asia/Bangkok',
        }),
        buildAiFileBatchContent: async () => ({
          textDocuments: [{ name: 'weekend.pdf', text: sparseText }],
          acceptedFiles: [{ name: 'weekend.pdf', size: fileBuffer.length }],
          rejectedFiles: [],
        }),
        callAiJson: async () => {
          providerCalls++;
          throw new Error('provider must not be called for a sparse dated schedule');
        },
      },
    );

    const result = recorder.read();
    assert.equal(result.statusCode, 200);
    assert.equal(providerCalls, 0);
    assert.equal(result.body.proposal, undefined, 'no proposal in Stage A response');
    assert.equal(result.body.roadmap.datedTasks.length, 2);
    assert.deepEqual(result.body.meta.dateRange, ['2026-09-05', '2026-09-06']);
    assert.equal(result.body.meta.source, 'document-dates');
  });
});

describe('Persisted dated roadmap follow-up', () => {
  it('filters existing tasks before returning Review actions', async () => {
    const roadmap = buildDatedDocumentRoadmap(FORTY_WEEK_TEXT, 'roadmap.pdf');
    const recorder = responseRecorder();
    let providerCalls = 0;

    await handleDailyPlan(
      {
        aiRequestId: 'dated-dedup-test',
        body: {
          roadmap,
          startDate: '2026-08-24',
          daysCount: 2,
          existingTasks: [{
            text: 'Function, parameter, return value.',
            status: 'todo',
          }],
          timeZone: 'Asia/Bangkok',
        },
      },
      recorder.res,
      {
        apiKey: '',
        now: new Date('2026-08-24T03:00:00.000Z'),
        callAiJson: async () => {
          providerCalls++;
          throw new Error('provider must not be called for persisted dated tasks');
        },
      },
    );

    const result = recorder.read();
    assert.equal(result.statusCode, 200);
    assert.equal(providerCalls, 0);
    assert.equal(result.body.proposal.actions.length, 1);
    assert.equal(result.body.proposal.actions[0].args.text, 'Scope, local/global variable.');
    assert.equal(result.body.meta.candidateActions, 2);
    assert.equal(result.body.meta.skippedDuplicates, 1);
  });

  it('does not call AI or invent tasks when the requested window has no dated rows', async () => {
    const roadmap = buildDatedDocumentRoadmap(FORTY_WEEK_TEXT, 'roadmap.pdf');
    const recorder = responseRecorder();
    let providerCalls = 0;

    await handleDailyPlan(
      {
        aiRequestId: 'dated-empty-window-test',
        body: {
          roadmap,
          startDate: '2026-12-01',
          daysCount: 2,
          existingTasks: [],
          timeZone: 'Asia/Bangkok',
        },
      },
      recorder.res,
      {
        apiKey: '',
        now: new Date('2026-08-24T03:00:00.000Z'),
        callAiJson: async () => { providerCalls++; },
      },
    );

    const result = recorder.read();
    assert.equal(result.statusCode, 200);
    assert.equal(providerCalls, 0);
    assert.equal(result.body.proposal.actions.length, 0);
    assert.equal(result.body.meta.source, 'document-dates');
    assert.equal(result.body.meta.candidateActions, 0);
  });
});
