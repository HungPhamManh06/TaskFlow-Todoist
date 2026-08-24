'use strict';
/**
 * Document Daily Planner — Final E2E Evidence
 *
 * Covers ALL remaining gaps:
 * 1. Real PDF → server pipeline with mocked provider
 * 2. Review DOM → Apply → Undo with actual state mutation
 * 3. "tuần tiếp theo" only calls /daily-plan (no PDF re-read)
 * 4. Cursor advance logic (success advances, failure doesn't)
 * 5. Account A/B/A isolation
 * 6. Chat.js orchestration dedup
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import * as vm from 'node:vm';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const planSource = readFileSync(join(ROOT, 'js', 'ai-document-daily-plan.js'), 'utf8');
const chatSource = readFileSync(join(ROOT, 'js', 'chat.js'), 'utf8');
const agentSrc = readFileSync(join(ROOT, 'js', 'ai-agent.js'), 'utf8');
const runtimeSrc = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
const pdfFixture = readFileSync(join(ROOT, 'tests', 'fixtures', 'document-daily-plan-roadmap.pdf'));
const { handleDocumentDailyPlan, validateDailyPlanProposal } = require(join(ROOT, 'server', 'ai.js'));

/* ---- Helpers ---- */
function findByTestId(node, testid) {
  if (!node) return null;
  if (node.getAttribute && node.getAttribute('data-testid') === testid) return node;
  if (node.children) {
    for (const c of node.children) {
      const found = findByTestId(c, testid);
      if (found) return found;
    }
  }
  return null;
}

function localToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function dateRange(start, n) {
  const dates = [];
  const d = new Date(start + 'T00:00:00');
  for (let i = 0; i < n; i++) {
    const dd = new Date(d);
    dd.setDate(dd.getDate() + i);
    dates.push(dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0') + '-' + String(dd.getDate()).padStart(2, '0'));
  }
  return dates;
}

function addDays(start, days) {
  return dateRange(start, days + 1)[days];
}

function futureCursorStart() {
  return addDays(localToday(), 1);
}

/* ===========================================================
   1. SERVER PIPELINE: Real PDF → Mocked Provider → Proposal
   =========================================================== */
describe('E2E FINAL: Server pipeline (real PDF + mocked provider)', () => {

  async function multipartRequest() {
    const form = new FormData();
    form.append('files', new Blob([pdfFixture], { type: 'application/pdf' }), 'roadmap.pdf');
    form.append('message', 'Lập kế hoạch theo từng ngày từ tài liệu này');
    form.append('timeZone', 'Asia/Bangkok');
    const webRequest = new Request('http://taskflow.test/api/ai/document-daily-plan', {
      method: 'POST',
      body: form,
    });
    const req = new PassThrough();
    req.headers = Object.fromEntries(webRequest.headers.entries());
    req.aiRequestId = 'e2e-document-plan';
    req.end(Buffer.from(await webRequest.arrayBuffer()));
    return req;
  }

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

  it('real multipart PDF runs both provider stages and returns 14 review actions', async () => {
    const startDate = '2026-08-24';
    const dates = dateRange(startDate, 7);
    const providerCalls = [];
    const callAiJson = async (request) => {
      providerCalls.push(request);
      if (request.routeName.endsWith('/roadmap')) {
        assert.match(request.messages[1].content, /12-Week Full Stack/, 'real PDF text reaches roadmap stage');
        return {
          ok: true,
          latencyMs: 11,
          parsed: {
            title: '12-Week Full Stack Roadmap', summary: 'Full-stack course', totalWeeks: 12,
            phases: [{ id: 'p1', title: 'Foundations', weeks: [{ week: 1, title: 'HTML and CSS', goals: ['Build a page'], deliverables: ['Landing page'] }] }],
          },
        };
      }
      const days = dates.map((date, dayIndex) => ({
        date,
        tasks: [0, 1].map((taskIndex) => ({
          id: 'provider-' + dayIndex + '-' + taskIndex,
          text: 'Study task ' + (dayIndex * 2 + taskIndex + 1),
          duration: 45,
          roadmapWeek: 1,
          roadmapGoal: 'Build a page',
        })),
      }));
      return { ok: true, latencyMs: 13, parsed: { summary: 'Kế hoạch 7 ngày — 14 việc', days } };
    };

    const req = await multipartRequest();
    const recorder = responseRecorder();
    await handleDocumentDailyPlan(req, recorder.res, {
      apiKey: 'test-key',
      callAiJson,
      now: new Date('2026-08-24T00:30:00+07:00'),
    });

    const { statusCode, body } = recorder.read();
    assert.equal(statusCode, 200, JSON.stringify(body));
    assert.equal(body.ok, true);
    assert.equal(providerCalls.length, 2, 'roadmap and daily-plan provider stages called');
    assert.equal(body.proposal.actions.length, 14, '14 actions returned for Review');
    assert.deepEqual(body.meta.dateRange, [dates[0], dates[6]], 'dates follow user timezone');
    assert.equal(body.files[0].name, 'roadmap.pdf', 'accepted multipart file is returned');
    assert.equal(body.rejectedFiles.length, 0);
    assert.match(body.fingerprint, /^[a-f0-9]{16}$/);
  });

  it('validateDailyPlanProposal rejects proposal with >84 actions', () => {
    const today = localToday();
    const proposal = {
      summary: 'Too many',
      actions: Array.from({ length: 85 }, (_, i) => ({
        id: 'a' + (i + 1), type: 'create_task',
        args: { text: 'Task', date: today, duration: 30, priority: false,
          start: null, projectId: null, milestoneId: null, taskRef: null, changes: null },
      })),
    };
    const result = validateDailyPlanProposal(proposal, { today });
    assert.equal(result.ok, false, '85 actions rejected');
    assert.ok(result.errors.includes('actions-too-many'), 'has actions-too-many error');
  });

  it('validateDailyPlanProposal accepts 14-action pipeline proposal', () => {
    const today = localToday();
    const dates = dateRange(today, 7);
    const proposal = {
      summary: 'Kế hoạch 7 ngày — 14 việc',
      actions: [],
    };
    let idx = 0;
    for (const date of dates) {
      for (let t = 0; t < 2 && idx < 14; t++, idx++) {
        proposal.actions.push({
          id: 'a' + (idx + 1), type: 'create_task',
          args: { text: 'Study task ' + (idx + 1), date, duration: 45, priority: false,
            start: null, projectId: null, milestoneId: null, taskRef: null, changes: null },
        });
      }
    }
    const result = validateDailyPlanProposal(proposal, { today });
    assert.equal(result.ok, true, '14-action proposal valid, errors: ' + JSON.stringify(result.errors));
    assert.equal(proposal.actions.length, 14, 'proposal has 14 actions');
  });
});

/* ===========================================================
   2. REVIEW → APPLY → UNDO: Real state mutation
   =========================================================== */
describe('E2E FINAL: Review → Apply → Undo (14-action daily plan)', () => {

  function buildSandbox() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Build state with days matching proposal dates
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: d + '/' + (month + 1), yy: year % 100, tasks: [] });
    }
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push({ days: days.slice(i, i + 7) });
    }

    const state = { weeks, reflections: { weeks: [], overview: [] } };
    const inbox = [];
    const appended = [];
    let undoSnapshot = null;
    let saveCount = 0;

    const msgs = {
      children: appended,
      appendChild(el) { appended.push(el); el.parentNode = this; return el; },
      removeChild(el) {
        const index = appended.indexOf(el);
        if (index >= 0) appended.splice(index, 1);
        el.parentNode = null;
        return el;
      },
      replaceChild(newEl, oldEl) {
        const index = appended.indexOf(oldEl);
        if (index >= 0) appended[index] = newEl;
        oldEl.parentNode = null;
        newEl.parentNode = this;
        return oldEl;
      },
      scrollTop: 0,
      scrollHeight: 1000,
    };

    const sandbox = {
      console: { log() {}, warn() {}, error() {}, debug() {} },
      location: { search: '' },
      API_CONFIG: { url: 'http://localhost:3000' },
      navigator: { onLine: true },
      localStorage: {
        getItem(k) { return k === 'planner-token' ? 'test-token' : null; },
        setItem() {}, removeItem() {},
      },
      document: {
        getElementById: (id) => {
          if (id === 'chatInput') return { focus() {}, value: '' };
          if (id === 'chatPop') return { hidden: false, appendChild(el) { appended.push(el); } };
          if (id === 'chatMessages') return msgs;
          return null;
        },
        createElement: (tag) => {
          const listeners = {};
          const el = {
            tagName: tag.toUpperCase(), className: '', textContent: '', innerHTML: '',
            children: [], _attrs: {},
            setAttribute(k, v) { this[k] = v; this._attrs[k] = v; },
            getAttribute(k) { return this._attrs[k] || this[k]; },
            appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
            removeChild(c) {
              const idx = this.children.indexOf(c);
              if (idx >= 0) this.children.splice(idx, 1);
              c.parentNode = null;
              return c;
            },
            replaceChild(newC, oldC) {
              const idx = this.children.indexOf(oldC);
              if (idx >= 0) this.children[idx] = newC;
              oldC.parentNode = null;
              newC.parentNode = this;
              return oldC;
            },
            querySelectorAll(selector) {
              const found = [];
              const wantedTag = String(selector || '').toUpperCase();
              const visit = (node) => {
                if (node !== this && node.tagName === wantedTag) found.push(node);
                for (const child of node.children || []) visit(child);
              };
              visit(this);
              return found;
            },
            querySelector(sel) {
              if (!sel) return null;
              const match = sel.match && sel.match(/data-testid="([^"]+)"/);
              if (match) return findByTestId(el, match[1]);
              return null;
            },
            parentNode: null, style: {}, disabled: false, hidden: false,
            addEventListener(type, handler) {
              if (!listeners[type]) listeners[type] = [];
              listeners[type].push(handler);
            },
            removeEventListener(type, handler) {
              if (listeners[type]) listeners[type] = listeners[type].filter((item) => item !== handler);
            },
            dispatchEvent(event) {
              for (const handler of listeners[event.type] || []) handler.call(this, event);
              return true;
            },
            click() { return this.dispatchEvent({ type: 'click', target: this, preventDefault() {}, stopPropagation() {} }); },
            scrollIntoView() {},
            get firstChild() { return this.children[0] || null; },
            get lastChild() { return this.children[this.children.length - 1] || null; },
            get nextSibling() { return null; },
            cloneNode() {
              return { tagName: this.tagName, className: '', textContent: '', children: [],
                setAttribute() {}, getAttribute() { return null; }, appendChild() {},
                querySelectorAll() { return []; }, querySelector() { return null; } };
            },
          };
          return el;
        },
      },
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}), headers: { get() { return null; } } }),
      AbortController: class { constructor() { this.signal = {}; } abort() {} },
      setTimeout: (fn) => { fn(); return 0; },
      clearTimeout() {},
      // TaskFlow state
      state, inbox,
      PLAN_YEAR: year, PLAN_MONTH: month,
      PLAN_START: new Date(year, month, 1),
      NUM_DAYS: daysInMonth,
      pushUndo() {
        undoSnapshot = {
          state: JSON.parse(JSON.stringify(state)),
          inbox: JSON.parse(JSON.stringify(inbox)),
        };
      },
      save() { saveCount++; },
      saveInbox() {},
      renderCurrentView() {},
      renderToday() {},
      newTaskUid() { return 'uid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); },
      Date, JSON, Math, Map, Set, Array, Object, String, Number, Boolean, RegExp,
      Error, TypeError, RangeError, parseInt, parseFloat,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    return {
      sandbox, appended, state, inbox, msgs,
      getUndoSnapshot: () => undoSnapshot,
      getSaveCount: () => saveCount,
      restoreUndo() {
        assert.ok(undoSnapshot, 'undo checkpoint exists');
        state.weeks = JSON.parse(JSON.stringify(undoSnapshot.state.weeks));
        inbox.splice(0, inbox.length, ...JSON.parse(JSON.stringify(undoSnapshot.inbox)));
      },
    };
  }

  function loadModules(sandbox) {
    vm.createContext(sandbox);
    vm.runInContext(agentSrc, sandbox);
    sandbox.TaskFlowAIAgent = sandbox.TaskFlowAIAgent || (sandbox.module && sandbox.module.exports);
    sandbox.module = { exports: {} };
    sandbox.exports = sandbox.module.exports;
    vm.runInContext(runtimeSrc, sandbox);
    return {
      ClientAgent: sandbox.TaskFlowAIAgent,
      Runtime: sandbox.TaskFlowAIAgentRuntime || sandbox.module.exports,
    };
  }

  function buildProposal() {
    const today = localToday();
    const dates = dateRange(today, 7);
    const texts = [
      'Cài GCC và kiểm tra gcc --version', 'Viết Hello World bằng C',
      'Tìm hiểu compile → assembly → link', 'Debug Hello World bằng GDB',
      'Học biến và kiểu dữ liệu C', 'Thực hành phép toán C',
      'Học con trỏ cơ bản', 'Thực hành mảng và chuỗi',
      'Học hàm trong C', 'Viết chương trình tính BMI',
      'Học struct trong C', 'Thực hành file I/O',
      'Học dynamic memory allocation', 'Ôn tập tuần 1 và mini-project',
    ];
    const actions = [];
    let idx = 0;
    for (const date of dates) {
      for (let t = 0; t < 2 && idx < 14; t++, idx++) {
        actions.push({
          id: 'a' + (idx + 1), type: 'create_task',
          args: { taskRef: null, text: texts[idx], date, start: null, duration: 45,
            priority: false, projectId: null, milestoneId: null, changes: null },
        });
      }
    }
    return { summary: 'Kế hoạch 7 ngày — 14 việc', actions };
  }

  it('handleExternalProposal renders card with 14 action rows', async () => {
    const { sandbox, appended } = buildSandbox();
    const { Runtime } = loadModules(sandbox);
    const proposal = buildProposal();

    const result = Runtime.handleExternalProposal(proposal, { source: 'document-daily-plan', fileName: 'roadmap.pdf' });
    assert.equal(result.ok, true, 'handleExternalProposal succeeded');

    const card = appended.find(el => el && el.className && el.className.includes('agent-card'));
    assert.ok(card, 'agent-card rendered');

    for (let i = 1; i <= 14; i++) {
      assert.ok(findByTestId(card, 'review-action-a' + i), 'review-action-a' + i + ' exists');
    }
    assert.ok(findByTestId(card, 'review-confirm'), 'confirm button exists');
  });

  it('NO mutation before confirm', async () => {
    const { sandbox, state, inbox } = buildSandbox();
    const { Runtime } = loadModules(sandbox);
    Runtime.handleExternalProposal(buildProposal(), { source: 'document-daily-plan' });

    for (const week of state.weeks) {
      for (const day of week.days) {
        assert.equal(day.tasks.length, 0, 'day ' + day.date + ' has 0 tasks before confirm');
      }
    }
    assert.equal(inbox.length, 0, 'inbox empty before confirm');
  });

  it('Review state has correct structure and all 14 actions selected', async () => {
    const { sandbox } = buildSandbox();
    const { Runtime } = loadModules(sandbox);
    Runtime.handleExternalProposal(buildProposal(), { source: 'document-daily-plan' });

    const rs = Runtime.getReviewState();
    assert.ok(rs, 'review state exists');
    assert.equal(rs.actions.length, 14, '14 actions in review');
    assert.equal(rs._source, 'document-daily-plan', 'source correct');
    assert.ok(rs._validationPolicy, 'validation policy attached');
    assert.equal(rs._validationPolicy.maxActions, 120, 'fileImport max 120');

    for (const a of rs.actions) {
      assert.equal(a.selected, true, 'action ' + a.id + ' selected');
      assert.ok(a.originalArgs, 'action ' + a.id + ' has originalArgs');
    }
  });

  it('clicking Apply creates 14 tasks and one Undo restores the pre-apply state', async () => {
    const { sandbox, state, inbox, appended, getUndoSnapshot, getSaveCount, restoreUndo } = buildSandbox();
    const { Runtime } = loadModules(sandbox);
    const proposal = buildProposal();

    Runtime.handleExternalProposal(proposal, { source: 'document-daily-plan' });
    const card = appended.find(el => el && el.className && el.className.includes('agent-card'));
    assert.ok(card, 'card exists');
    const confirmBtn = findByTestId(card, 'review-confirm');
    assert.ok(confirmBtn, 'confirm button exists');
    assert.equal(confirmBtn.disabled, false, 'confirm button not disabled');

    confirmBtn.click();
    await new Promise((resolve) => setImmediate(resolve));

    const monthTasks = state.weeks.flatMap((week) => week.days).flatMap((day) => day.tasks);
    assert.equal(monthTasks.length + inbox.length, 14, 'all 14 actions mutated application state');
    assert.equal(getSaveCount(), 1, 'the batch is saved once');
    assert.ok(getUndoSnapshot(), 'one pre-apply undo checkpoint was captured');
    assert.equal(getUndoSnapshot().state.weeks.flatMap((week) => week.days).flatMap((day) => day.tasks).length, 0,
      'undo checkpoint was captured before mutation');

    restoreUndo();
    assert.equal(state.weeks.flatMap((week) => week.days).flatMap((day) => day.tasks).length + inbox.length, 0,
      'undo restores the state from before Apply');
  });
});

/* ===========================================================
   3. NEXT-WEEK NO-REREAD: fetch instrumentation
   =========================================================== */
describe('E2E FINAL: "tuần tiếp theo" no-reread', () => {

  it('runNextWindow only calls /daily-plan, never /document-daily-plan', async () => {
    const fetchCalls = [];
    const store = {};

    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: {
        getItem(k) { return store[k] || null; },
        setItem(k, v) { store[k] = v; },
        removeItem(k) { delete store[k]; },
      },
      Sync: { getUserId: () => 'test-user' },
      API_CONFIG: { url: 'http://localhost:3000' },
      fetch: async (url, opts) => {
        fetchCalls.push({ url, method: opts && opts.method, bodyType: opts && opts.body ? opts.body.constructor.name : null });
        return { ok: true, status: 200, json: async () => ({ ok: true, proposal: { summary: 'Week 2', actions: [] }, meta: { daysGenerated: 7 } }) };
      },
      TaskFlowAIAgentRuntime: { buildContext: () => ({ tasks: [] }) },
      TaskFlowI18N: { getLang: () => 'vi' },
      Date, JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(planSource, sandbox);
    const api = sandbox.TaskFlowDocumentDailyPlan;

    // Save a roadmap
    api.saveRoadmap({
      id: 'rm-test', accountScope: 'test-user', fingerprint: 'fp1',
      documentName: 'roadmap.pdf', createdAt: Date.now(), updatedAt: Date.now(),
      roadmap: { title: 'Test Roadmap', phases: [{ id: 'p1', title: 'Phase 1', weeks: [{ week: 1, title: 'W1', goals: ['G1'] }] }] },
      baseDate: futureCursorStart(), cursor: { nextWeek: 1, lastAppliedStartDate: futureCursorStart(), lastAppliedDaysCount: 7 },
    });

    // Call runNextWindow
    await api.runNextWindow('lập tuần tiếp theo', {});

    // Assert exactly 1 fetch call to /daily-plan
    assert.equal(fetchCalls.length, 1, 'exactly 1 fetch call');
    assert.ok(fetchCalls[0].url.includes('/api/ai/daily-plan'), 'calls /api/ai/daily-plan');
    assert.ok(!fetchCalls[0].url.includes('/document-daily-plan'), 'does NOT call /document-daily-plan');
    assert.ok(!fetchCalls[0].url.includes('/api/ai/file'), 'does NOT call /api/ai/file');
    assert.ok(!fetchCalls[0].url.includes('/api/ai/file-agent'), 'does NOT call /api/ai/file-agent');
    assert.ok(!fetchCalls[0].url.includes('/roadmap-extract'), 'does NOT call /roadmap-extract');

    // Assert body is JSON (not FormData)
    // body is JSON.stringify'd string, so bodyType is 'String'
    // The key assertion is that it's NOT FormData
    assert.ok(fetchCalls[0].bodyType === 'String' || fetchCalls[0].bodyType === 'Object',
      'body is JSON string/Object, not FormData (got ' + fetchCalls[0].bodyType + ')');
  });

  it('follow-up body contains stored roadmap, not PDF bytes', async () => {
    let capturedBody = null;
    const store = {};

    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: {
        getItem(k) { return store[k] || null; },
        setItem(k, v) { store[k] = v; },
        removeItem(k) { delete store[k]; },
      },
      Sync: { getUserId: () => 'test-user' },
      API_CONFIG: { url: 'http://localhost:3000' },
      fetch: async (url, opts) => {
        if (opts && opts.body) {
          try { capturedBody = JSON.parse(opts.body); } catch (e) { capturedBody = opts.body; }
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, proposal: { summary: 'W2', actions: [] }, meta: { daysGenerated: 7 } }) };
      },
      TaskFlowAIAgentRuntime: { buildContext: () => ({ tasks: [] }) },
      TaskFlowI18N: { getLang: () => 'vi' },
      Date, JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(planSource, sandbox);
    const api = sandbox.TaskFlowDocumentDailyPlan;

    const roadmap = { title: 'Test', phases: [{ id: 'p1', title: 'P1', weeks: [{ week: 1, title: 'W1', goals: ['G1'] }] }] };
    api.saveRoadmap({
      id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1',
      documentName: 'roadmap.pdf', createdAt: Date.now(), updatedAt: Date.now(),
      roadmap, baseDate: futureCursorStart(), cursor: { nextWeek: 1, lastAppliedStartDate: futureCursorStart(), lastAppliedDaysCount: 7 },
    });

    await api.runNextWindow('tuần tiếp theo', {});

    assert.ok(capturedBody, 'captured request body');
    assert.ok(capturedBody.roadmap, 'body has roadmap');
    assert.equal(capturedBody.roadmap.title, 'Test', 'roadmap is the stored one');
    assert.ok(capturedBody.startDate, 'body has startDate');
    assert.equal(typeof capturedBody.daysCount, 'number', 'body has daysCount');
    // No PDF bytes or file data
    assert.ok(!capturedBody.pdf, 'no pdf field');
    assert.ok(!capturedBody.fileBytes, 'no fileBytes field');
    assert.ok(!capturedBody.documentText, 'no documentText field');
  });

  it('no FormData or file upload in follow-up', async () => {
    let capturedOpts = null;
    const store = {};

    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: {
        getItem(k) { return store[k] || null; },
        setItem(k, v) { store[k] = v; },
        removeItem(k) { delete store[k]; },
      },
      Sync: { getUserId: () => 'test-user' },
      API_CONFIG: { url: 'http://localhost:3000' },
      fetch: async (url, opts) => {
        capturedOpts = opts;
        return { ok: true, status: 200, json: async () => ({ ok: true, proposal: { summary: 'W2', actions: [] }, meta: { daysGenerated: 7 } }) };
      },
      TaskFlowAIAgentRuntime: { buildContext: () => ({ tasks: [] }) },
      TaskFlowI18N: { getLang: () => 'vi' },
      Date, JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(planSource, sandbox);
    const api = sandbox.TaskFlowDocumentDailyPlan;

    api.saveRoadmap({
      id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1',
      documentName: 'roadmap.pdf', createdAt: Date.now(), updatedAt: Date.now(),
      roadmap: { title: 'Test', phases: [] },
      baseDate: futureCursorStart(), cursor: { nextWeek: 1, lastAppliedStartDate: futureCursorStart(), lastAppliedDaysCount: 7 },
    });

    await api.runNextWindow('tuần tiếp theo', {});

    assert.ok(capturedOpts, 'captured fetch opts');
    assert.equal(typeof capturedOpts.body, 'string', 'body is string (JSON.stringify), not FormData');
    assert.ok(!capturedOpts.body.includes('FormData'), 'body is not FormData');
    assert.equal(capturedOpts.headers['Content-Type'], 'application/json', 'Content-Type is application/json');
  });
});

/* ===========================================================
   4. CURSOR ADVANCE LOGIC
   =========================================================== */
describe('E2E FINAL: Cursor advance logic', () => {
  function makeApi(sandboxOverrides) {
    const store = {};
    const sandbox = {
      window: {}, console: { log() {}, error() {} },
      localStorage: {
        getItem(k) { return store[k] || null; },
        setItem(k, v) { store[k] = v; },
        removeItem(k) { delete store[k]; },
      },
      Sync: { getUserId: () => 'test-user' },
      API_CONFIG: { url: 'http://localhost:3000' },
      fetch: async (url, opts) => {
        if (sandboxOverrides && sandboxOverrides.fetchInterceptor) {
          return sandboxOverrides.fetchInterceptor(url, opts);
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, proposal: { summary: 'W2', actions: [] }, meta: { daysGenerated: 7 } }) };
      },
      TaskFlowAIAgentRuntime: { buildContext: () => ({ tasks: [] }) },
      TaskFlowI18N: { getLang: () => 'vi' },
      Date, JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(planSource, sandbox);
    return sandbox.TaskFlowDocumentDailyPlan;
  }

  it('cursor advances exactly one week after success + Apply', async () => {
    const api = makeApi();
    const startDate = futureCursorStart();
    api.saveRoadmap({
      id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1',
      documentName: 'test.pdf', createdAt: Date.now(), updatedAt: Date.now(),
      roadmap: { title: 'Test', phases: [] },
      baseDate: startDate, cursor: { nextWeek: 1, lastAppliedStartDate: startDate, lastAppliedDaysCount: 7 },
    });

    await api.runNextWindow('tuần tiếp theo', {});
    // Cursor is PENDING — not yet committed to localStorage
    const pending = api.getPendingCursor();
    assert.ok(pending, 'pending cursor set after runNextWindow');
    assert.equal(pending.toCursor.lastAppliedStartDate, addDays(startDate, 7), 'pending cursor target is correct');
    // localStorage cursor unchanged
    const active = api.getActiveRoadmap();
    assert.equal(active.cursor.lastAppliedStartDate, startDate, 'cursor not yet advanced in storage');
    assert.equal(active.cursor.nextWeek, 1, 'nextWeek not yet incremented in storage');

    // Now commit the cursor (simulates successful Apply)
    api.commitPendingCursor(pending.proposalId);
    const afterCommit = api.getActiveRoadmap();
    assert.equal(afterCommit.cursor.lastAppliedStartDate, addDays(startDate, 7), 'cursor advanced by 7 days');
    assert.equal(afterCommit.cursor.nextWeek, 2, 'nextWeek incremented to 2');
  });

  it('second "tuần tiếp theo" advances a second week (after Apply)', async () => {
    const api = makeApi();
    const startDate = futureCursorStart();
    api.saveRoadmap({
      id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1',
      documentName: 'test.pdf', createdAt: Date.now(), updatedAt: Date.now(),
      roadmap: { title: 'Test', phases: [] },
      baseDate: startDate, cursor: { nextWeek: 1, lastAppliedStartDate: startDate, lastAppliedDaysCount: 7 },
    });

    // Week 1: generate + commit
    await api.runNextWindow('tuần tiếp theo', {});
    var p1 = api.getPendingCursor();
    api.commitPendingCursor(p1.proposalId);

    // Week 2: generate + commit
    await api.runNextWindow('tuần tiếp theo', {});
    var p2 = api.getPendingCursor();
    api.commitPendingCursor(p2.proposalId);

    const active = api.getActiveRoadmap();
    assert.equal(active.cursor.lastAppliedStartDate, addDays(startDate, 14), 'cursor advanced by 14 days');
    assert.equal(active.cursor.nextWeek, 3, 'nextWeek is 3');
  });

  it('failed request does NOT advance cursor', async () => {
    const startDate = futureCursorStart();
    const api = makeApi({
      fetchInterceptor: async () => ({ ok: false, status: 500, json: async () => ({ error: 'server-error' }) }),
    });
    api.saveRoadmap({
      id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1',
      documentName: 'test.pdf', createdAt: Date.now(), updatedAt: Date.now(),
      roadmap: { title: 'Test', phases: [] },
      baseDate: startDate, cursor: { nextWeek: 1, lastAppliedStartDate: startDate, lastAppliedDaysCount: 7 },
    });

    await api.runNextWindow('tuần tiếp theo', {});
    const active = api.getActiveRoadmap();
    assert.equal(active.cursor.lastAppliedStartDate, startDate, 'cursor NOT advanced after failure');
    assert.equal(active.cursor.nextWeek, 1, 'nextWeek NOT incremented');
  });

  it('user-requested 14 days is clamped correctly', async () => {
    let capturedBody = null;
    const api = makeApi({
      fetchInterceptor: async (url, opts) => {
        if (opts && opts.body) try { capturedBody = JSON.parse(opts.body); } catch (e) {}
        return { ok: true, status: 200, json: async () => ({ ok: true, proposal: { summary: 'W2', actions: [] }, meta: { daysGenerated: 14 } }) };
      },
    });
    api.saveRoadmap({
      id: 'rm-1', accountScope: 'test-user', fingerprint: 'fp1',
      documentName: 'test.pdf', createdAt: Date.now(), updatedAt: Date.now(),
      roadmap: { title: 'Test', phases: [] },
      baseDate: futureCursorStart(), cursor: { nextWeek: 1, lastAppliedStartDate: futureCursorStart(), lastAppliedDaysCount: 7 },
    });

    await api.runNextWindow('tạo kế hoạch 14 ngày tới', {});
    assert.ok(capturedBody, 'captured body');
    assert.equal(capturedBody.daysCount, 14, 'daysCount is 14');
  });
});

/* ===========================================================
   5. ACCOUNT A/B/A ISOLATION
   =========================================================== */
describe('E2E FINAL: Account A/B/A roadmap isolation', () => {
  it('A saves roadmap, B login → B sees nothing, B saves → A still sees A', async () => {
    const store = {};
    const mockStorage = {
      getItem(k) { return store[k] || null; },
      setItem(k, v) { store[k] = v; },
      removeItem(k) { delete store[k]; },
    };

    // User A
    const sandboxA = {
      window: {}, console: { log() {}, error() {} },
      localStorage: mockStorage, Sync: { getUserId: () => 'user-a' },
      Date, JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandboxA.globalThis = sandboxA;
    sandboxA.window = sandboxA;
    vm.createContext(sandboxA);
    vm.runInContext(planSource, sandboxA);
    const apiA = sandboxA.TaskFlowDocumentDailyPlan;

    // A saves roadmap
    apiA.saveRoadmap({
      id: 'rm-a', accountScope: 'user-a', fingerprint: 'fp-a',
      documentName: 'roadmap-a.pdf', createdAt: 1000, updatedAt: 1000,
      roadmap: { title: 'Roadmap A', phases: [] },
      baseDate: futureCursorStart(), cursor: { nextWeek: 1, lastAppliedStartDate: futureCursorStart(), lastAppliedDaysCount: 7 },
    });

    // User B logs in
    const sandboxB = {
      window: {}, console: { log() {}, error() {} },
      localStorage: mockStorage, Sync: { getUserId: () => 'user-b' },
      Date, JSON, Math, Map, Set, Array, Object, String, Number, RegExp, Error, parseInt,
    };
    sandboxB.globalThis = sandboxB;
    sandboxB.window = sandboxB;
    vm.createContext(sandboxB);
    vm.runInContext(planSource, sandboxB);
    const apiB = sandboxB.TaskFlowDocumentDailyPlan;

    // B should NOT see A's roadmap
    const activeB1 = apiB.getActiveRoadmap();
    assert.equal(activeB1, null, 'B does NOT see A roadmap');

    // B saves own roadmap
    apiB.saveRoadmap({
      id: 'rm-b', accountScope: 'user-b', fingerprint: 'fp-b',
      documentName: 'roadmap-b.pdf', createdAt: 2000, updatedAt: 2000,
      roadmap: { title: 'Roadmap B', phases: [] },
    });

    // A logs back in — A still sees A's roadmap
    const activeA = apiA.getActiveRoadmap();
    assert.ok(activeA, 'A still has active roadmap');
    assert.equal(activeA.id, 'rm-a', 'A roadmap is rm-a');
    assert.equal(activeA.documentName, 'roadmap-a.pdf', 'A document is roadmap-a.pdf');

    // B sees B's roadmap
    const activeB2 = apiB.getActiveRoadmap();
    assert.ok(activeB2, 'B has active roadmap');
    assert.equal(activeB2.id, 'rm-b', 'B roadmap is rm-b');

    // Verify different storage keys
    const keys = Object.keys(store);
    assert.ok(keys.some(k => k.includes('user-a')), 'has user-a storage key');
    assert.ok(keys.some(k => k.includes('user-b')), 'has user-b storage key');
  });
});

/* ===========================================================
   6. CHAT.JS ORCHESTRATION DEDUP
   =========================================================== */
describe('E2E FINAL: Chat.js orchestration dedup', () => {
  it('the document plan chip explicitly selects the daily planner route', () => {
    const chipsStart = chatSource.indexOf('var FILE_CHIPS_DOC');
    const chipsEnd = chatSource.indexOf('var FILE_CHIPS_TEXT', chipsStart);
    const chipsBody = chatSource.slice(chipsStart, chipsEnd);
    assert.ok(chipsBody.includes("key: 'fileChipPlan'"), 'document plan chip exists');
    assert.ok(chipsBody.includes("intentKind: 'document-daily-plan'"), 'chip carries an explicit daily-plan intent');

    const renderStart = chatSource.indexOf('function _renderFileChips');
    const renderEnd = chatSource.indexOf('function _setFileLoading', renderStart);
    const renderBody = chatSource.slice(renderStart, renderEnd);
    assert.ok(renderBody.includes('doChatSend({ fileIntentKind: c.intentKind })'), 'chip forwards its explicit intent');

    const sendStart = chatSource.indexOf('async function _sendWithFile');
    const sendEnd = chatSource.indexOf('/* Override doChatSend', sendStart);
    const sendBody = chatSource.slice(sendStart, sendEnd);
    assert.ok(sendBody.includes('_resolveFileIntent(text, explicitIntentKind)'), 'file send resolves the explicit intent');
    assert.ok(sendBody.includes("fileIntent.kind === 'document-daily-plan'"), 'resolved intent selects the daily planner');
    assert.ok(sendBody.includes('dailyPlanner.runInitialDocumentPlan'), 'daily planner handles the upload');
  });

  it('chat.js delegates to module runInitialDocumentPlan for initial upload', () => {
    const sendStart = chatSource.indexOf('async function _sendWithFile');
    const sendEnd = chatSource.indexOf('/* Override doChatSend', sendStart);
    const sendBody = chatSource.slice(sendStart, sendEnd);
    assert.ok(sendBody.includes('dailyPlanner.runInitialDocumentPlan'), 'chat calls the canonical upload orchestrator');
    assert.ok(!sendBody.includes('TaskFlowDocumentDailyPlan.saveRoadmap'), 'chat does not persist the roadmap itself');
    assert.ok(planSource.includes('function runInitialDocumentPlan'), 'module has runInitialDocumentPlan');
    assert.ok(planSource.includes('saveRoadmap(record)'), 'module calls saveRoadmap internally');
    assert.ok(planSource.includes('/api/ai/document-daily-plan'), 'module calls correct endpoint');
    assert.ok(planSource.includes('new FormData'), 'module builds FormData');
  });

  it('module sendProposalToReview delegates to handleExternalProposal', () => {
    assert.ok(planSource.includes('handleExternalProposal'), 'module calls handleExternalProposal');
  });

  it('chat.js document-daily-plan response delegates to module sendProposalToReview', () => {
    // After the consolidation, chat.js should use the module for the initial flow too
    assert.ok(chatSource.includes('TaskFlowDocumentDailyPlan.sendProposalToReview'),
      'chat.js delegates Review to module');
  });

  it('module persists roadmap exactly once per initial request', () => {
    // runInitialDocumentPlan calls saveRoadmap once
    // Verify there's only one saveRoadmap call path in the module
    const runInitIdx = planSource.indexOf('function runInitialDocumentPlan');
    const runNextIdx = planSource.indexOf('function runNextWindow');
    const initBody = planSource.slice(runInitIdx, runNextIdx);
    const saveCount = (initBody.match(/saveRoadmap\(/g) || []).length;
    assert.equal(saveCount, 1, 'runInitialDocumentPlan calls saveRoadmap exactly once');
  });
});
