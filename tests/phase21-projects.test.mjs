// TaskFlow — V1.1 Projects & Milestones: unit tests cho js/projects.js (store thuần)
// + wiring (app.html nạp projects.min.js/projects-ui.min.js trước app.min.js, sw.js
// precache, i18n vi/en, sprite icon, dispatcher, setView branch).
// Pattern phase12-pillars.test.mjs — import module trực tiếp (UMD, không cần browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Projects from '../js/projects.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const APP_JS = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const I18N_JS = readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');
const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const SPRITE = readFileSync(path.join(ROOT, 'icons/ui-sprite.svg'), 'utf8');

const {
  PROJECTS_KEY, STORE_VERSION, migrateProjects, loadProjects, saveProjects,
  getProject, getMilestone, createProject, updateProject, archiveProject,
  completeProject, restoreProject, deleteProject, createMilestone, updateMilestone,
  completeMilestone, deleteMilestone, taskProjectId, taskMilestoneId,
  validateTaskProjectLink, unlinkInvalidProjectReferences, projectTasks,
  projectProgress, projectTaskStats, sanitizeSnapshotRefs,
} = Projects;

function emptyStore() {
  return { version: STORE_VERSION, projects: [] };
}

function makeTask(over) {
  return { uid: 'u' + Math.random().toString(36).slice(2, 8), text: 'task', done: false, ...over };
}

/* ---------------- Project CRUD ---------------- */

test('createProject: tạo project với id ổn định, status mặc định active', () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'Backend Internship', targetDate: '2027-03-01', notes: 'x' });
  assert.ok(p);
  assert.ok(/^proj_/.test(p.id));
  assert.equal(store.projects.length, 1);
  assert.equal(p.title, 'Backend Internship');
  assert.equal(p.status, 'active');
  assert.equal(p.targetDate, '2027-03-01');
  assert.equal(p.notes, 'x');
  assert.ok(p.createdAt);
  assert.ok(p.updatedAt);
  assert.deepEqual(p.milestones, []);
});

test('createProject: title trống → null, không thêm', () => {
  const store = emptyStore();
  assert.equal(createProject(store, { title: '   ' }), null);
  assert.equal(store.projects.length, 0);
});

test('updateProject: đổi title/notes/targetDate; giữ id + milestones', () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'A', notes: 'n' });
  const m = createMilestone(store, p.id, { title: 'M1' });
  updateProject(store, p.id, { title: 'B', notes: 'n2', targetDate: '2027-05-01' });
  assert.equal(p.title, 'B');
  assert.equal(p.notes, 'n2');
  assert.equal(p.targetDate, '2027-05-01');
  assert.equal(p.milestones.length, 1);
  assert.equal(p.milestones[0].id, m.id);
  assert.equal(updateProject(store, 'nope', { title: 'X' }), null);
});

test('archive/complete/restore: chuyển status, không xoá', () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'A' });
  archiveProject(store, p.id);
  assert.equal(p.status, 'archived');
  completeProject(store, p.id);
  assert.equal(p.status, 'completed');
  restoreProject(store, p.id);
  assert.equal(p.status, 'active');
  assert.equal(archiveProject(store, 'nope'), null);
});

test('deleteProject: xoá vĩnh viễn đúng id; trả project đã xoá', () => {
  const store = emptyStore();
  const a = createProject(store, { title: 'A' });
  const b = createProject(store, { title: 'B' });
  const gone = deleteProject(store, a.id);
  assert.equal(gone.id, a.id);
  assert.equal(store.projects.length, 1);
  assert.equal(store.projects[0].id, b.id);
  assert.equal(deleteProject(store, 'nope'), null);
});

/* ---------------- Milestone CRUD ---------------- */

test('createMilestone: gắn vào project đúng; id mile_ prefix; updatedAt project đổi', async () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'A' });
  await new Promise((r) => setTimeout(r, 3)); // updatedAt có độ phân giải ms — đảm bảo ms mới
  const before = p.updatedAt;
  const m = createMilestone(store, p.id, { title: 'Build REST API', targetDate: '2027-02-01' });
  assert.ok(m);
  assert.ok(/^mile_/.test(m.id));
  assert.equal(m.title, 'Build REST API');
  assert.equal(m.status, 'active');
  assert.equal(m.targetDate, '2027-02-01');
  assert.equal(p.milestones.length, 1);
  assert.notEqual(p.updatedAt, before);
  // project không tồn tại → null
  assert.equal(createMilestone(store, 'nope', { title: 'X' }), null);
});

test('updateMilestone: đổi title/status/targetDate; project lạ → null', () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'A' });
  const m = createMilestone(store, p.id, { title: 'M1' });
  updateMilestone(store, p.id, m.id, { title: 'M2', targetDate: '2027-04-01' });
  assert.equal(m.title, 'M2');
  assert.equal(m.targetDate, '2027-04-01');
  assert.equal(updateMilestone(store, p.id, 'nope', { title: 'X' }), null);
});

test('completeMilestone: toggle hoàn thành ↔ mở lại', () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'A' });
  const m = createMilestone(store, p.id, { title: 'M1' });
  completeMilestone(store, p.id, m.id);
  assert.equal(m.status, 'completed');
  completeMilestone(store, p.id, m.id);
  assert.equal(m.status, 'active');
});

test('deleteMilestone: xoá khỏi project; milestone lạ → null', () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'A' });
  const m = createMilestone(store, p.id, { title: 'M1' });
  createMilestone(store, p.id, { title: 'M2' });
  const gone = deleteMilestone(store, p.id, m.id);
  assert.equal(gone.id, m.id);
  assert.equal(p.milestones.length, 1);
  assert.equal(deleteMilestone(store, p.id, 'nope'), null);
});

/* ---------------- Task linkage ---------------- */

test('taskProjectId/taskMilestoneId: đọc optional field, thiếu → null', () => {
  assert.equal(taskProjectId({ uid: 'u1', text: 'x' }), null);
  assert.equal(taskMilestoneId({ uid: 'u1', text: 'x' }), null);
  assert.equal(taskProjectId({ projectId: 'proj_1' }), 'proj_1');
  assert.equal(taskMilestoneId({ milestoneId: 'mile_1' }), 'mile_1');
  assert.equal(taskProjectId({ projectId: '' }), null);
  assert.equal(taskProjectId(null), null);
});

test('validateTaskProjectLink: milestoneId phải thuộc project; projectId null → milestone null', () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'A' });
  const m = createMilestone(store, p.id, { title: 'M1' });
  assert.deepEqual(validateTaskProjectLink(store, { projectId: p.id, milestoneId: m.id }), { projectId: p.id, milestoneId: m.id });
  // milestone thuộc project khác / không tồn tại → clear milestone
  assert.deepEqual(validateTaskProjectLink(store, { projectId: p.id, milestoneId: 'mile_nope' }), { projectId: p.id, milestoneId: null });
  // project không tồn tại → clear cả hai
  assert.deepEqual(validateTaskProjectLink(store, { projectId: 'proj_nope', milestoneId: m.id }), { projectId: null, milestoneId: null });
  // project null + milestone → clear milestone
  assert.deepEqual(validateTaskProjectLink(store, { milestoneId: m.id }), { projectId: null, milestoneId: null });
});

test('unlinkInvalidProjectReferences: sửa ref sai, KHÔNG xoá task', () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'A' });
  const m = createMilestone(store, p.id, { title: 'M1' });
  const tasks = [
    { uid: 't1', text: 'ok', projectId: p.id, milestoneId: m.id },
    { uid: 't2', text: 'bad-mile', projectId: p.id, milestoneId: 'mile_gone' },
    { uid: 't3', text: 'bad-proj', projectId: 'proj_gone', milestoneId: m.id },
    { uid: 't4', text: 'orphan-mile', milestoneId: m.id },
    { uid: 't5', text: 'clean' },
  ];
  const fixed = unlinkInvalidProjectReferences(store, tasks);
  assert.equal(fixed, 3);
  assert.equal(tasks[0].projectId, p.id);
  assert.equal(tasks[0].milestoneId, m.id);
  assert.equal(tasks[1].milestoneId, undefined, 'milestone sai bị clear');
  assert.equal(tasks[1].projectId, p.id, 'project hợp lệ giữ nguyên');
  assert.equal(tasks[2].projectId, undefined, 'project sai bị clear');
  assert.equal(tasks[2].milestoneId, undefined);
  assert.equal(tasks[3].milestoneId, undefined);
  assert.equal(tasks[4].uid, 't5');
  assert.equal(tasks.length, 5, 'không task nào bị xoá');
});

/* ---------------- Progress ---------------- */

test('projectProgress: milestone-based (completed/total)', () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'A' });
  const m1 = createMilestone(store, p.id, { title: 'M1' });
  createMilestone(store, p.id, { title: 'M2' });
  createMilestone(store, p.id, { title: 'M3' });
  assert.equal(projectProgress(p, []).pct, 0);
  completeMilestone(store, p.id, m1.id);
  const pr = projectProgress(p, []);
  assert.equal(pr.done, 1);
  assert.equal(pr.total, 3);
  assert.equal(pr.pct, 33);
});

test('projectProgress: task-based khi không có milestone', () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'A' });
  const tasks = [
    makeTask({ projectId: p.id, done: true }),
    makeTask({ projectId: p.id, done: false }),
    makeTask({ projectId: p.id, done: false }),
    makeTask({}), // task khác project → không tính
  ];
  const pr = projectProgress(p, tasks);
  assert.equal(pr.done, 1);
  assert.equal(pr.total, 3);
  assert.equal(pr.pct, 33);
});

test('projectProgress: project rỗng → 0/0/0%', () => {
  const p = createProject(emptyStore(), { title: 'A' });
  assert.deepEqual(projectProgress(p, []), { done: 0, total: 0, pct: 0 });
});

test('projectTaskStats: đếm task liên kết + done', () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'A' });
  const tasks = [
    makeTask({ projectId: p.id, done: true }),
    makeTask({ projectId: p.id, done: false }),
    makeTask({}),
  ];
  assert.deepEqual(projectTaskStats(p, tasks), { total: 2, done: 1 });
});

test('projectTasks: chỉ lấy task có projectId khớp', () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'A' });
  const p2 = createProject(store, { title: 'B' });
  const tasks = [makeTask({ projectId: p.id }), makeTask({ projectId: p2.id }), makeTask({})];
  assert.equal(projectTasks(p, tasks).length, 1);
});

/* ---------------- Migration ---------------- */

test('migrateProjects: không có key → store rỗng hợp lệ (additive)', () => {
  const { store, changed } = migrateProjects(null);
  assert.equal(store.version, STORE_VERSION);
  assert.deepEqual(store.projects, []);
  assert.equal(changed, true);
});

test('migrateProjects: store hợp lệ giữ nguyên (id, title, milestones)', () => {
  const raw = {
    version: 1,
    projects: [{ id: 'proj_a', title: 'A', status: 'active', milestones: [{ id: 'mile_a', title: 'M1', status: 'active' }] }],
  };
  const { store, changed } = migrateProjects(raw);
  assert.equal(changed, false);
  assert.equal(store.projects.length, 1);
  assert.equal(store.projects[0].id, 'proj_a');
  assert.equal(store.projects[0].milestones[0].title, 'M1');
});

test('migrateProjects: record malformed bị bỏ qua, KHÔNG xoá store', () => {
  const raw = {
    version: 1,
    projects: [
      { id: 'proj_a', title: 'A' },
      null,
      'junk',
      { title: '   ' }, // thiếu title
      { id: 'proj_b', title: 'B', status: 'weird', milestones: [null, { id: 'mile_b', title: 'M', status: 'done' }] },
    ],
  };
  const { store, changed } = migrateProjects(raw);
  assert.equal(changed, true);
  assert.equal(store.projects.length, 2);
  assert.equal(store.projects[0].id, 'proj_a');
  assert.equal(store.projects[1].status, 'active', 'status lạ → fallback active');
  assert.equal(store.projects[1].milestones.length, 1);
  assert.equal(store.projects[1].milestones[0].status, 'active');
});

test('migrateProjects: idempotent — chạy lại trên store chuẩn hoá → 0 thay đổi', () => {
  const raw = { version: 1, projects: [{ id: 'proj_a', title: 'A', milestones: [{ id: 'mile_a', title: 'M' }] }] };
  const first = migrateProjects(raw);
  const second = migrateProjects(first.store);
  assert.equal(second.changed, false);
  assert.deepEqual(second.store, first.store);
});

test('migrateProjects: dữ liệu không phải object → store rỗng, không throw', () => {
  for (const bad of ['string', 42, [], true]) {
    const { store } = migrateProjects(bad);
    assert.deepEqual(store.projects, []);
  }
});

/* ---------------- Import sanitization (snapshot) ---------------- */

test('sanitizeSnapshotRefs: task trỏ project/milestone không tồn tại trong import → clear ref, không xoá task', () => {
  const store = emptyStore();
  const p = createProject(store, { title: 'A' });
  const m = createMilestone(store, p.id, { title: 'M1' });
  const snapshot = {
    version: 1,
    keys: {
      [PROJECTS_KEY]: JSON.stringify(store),
      'planner-inbox': JSON.stringify([
        { uid: 'i1', text: 'ok', projectId: p.id, milestoneId: m.id },
        { uid: 'i2', text: 'bad', projectId: 'proj_gone' },
      ]),
      'planner-2026-8': JSON.stringify({
        weeks: [{ days: [{ tasks: [{ uid: 'm1', text: 'ok', projectId: p.id }, { uid: 'm2', text: 'orphan', milestoneId: m.id }] }] }],
      }),
      'planner-habits': '{}',
    },
  };
  const out = sanitizeSnapshotRefs(snapshot);
  const inbox = JSON.parse(out.keys['planner-inbox']);
  assert.equal(inbox[0].projectId, p.id, 'ref hợp lệ giữ nguyên');
  assert.equal(inbox[1].projectId, undefined, 'project sai bị clear');
  const month = JSON.parse(out.keys['planner-2026-8']);
  assert.equal(month.weeks[0].days[0].tasks[0].projectId, p.id);
  assert.equal(month.weeks[0].days[0].tasks[1].milestoneId, undefined);
  // key không liên quan giữ nguyên
  assert.equal(out.keys['planner-habits'], '{}');
});

test('sanitizeSnapshotRefs: không có store projects → mọi ref bị clear, task giữ nguyên', () => {
  const snapshot = {
    version: 1,
    keys: {
      'planner-inbox': JSON.stringify([{ uid: 'i1', text: 'x', projectId: 'proj_a' }]),
    },
  };
  const out = sanitizeSnapshotRefs(snapshot);
  const inbox = JSON.parse(out.keys['planner-inbox']);
  assert.equal(inbox[0].projectId, undefined);
  assert.equal(inbox[0].uid, 'i1');
  assert.equal(inbox.length, 1);
});

test('sanitizeSnapshotRefs: snapshot không hợp lệ → trả nguyên', () => {
  assert.equal(sanitizeSnapshotRefs(null), null);
  assert.equal(sanitizeSnapshotRefs('x'), 'x');
  // không có key planner → clone nguyên vẹn
  assert.deepEqual(sanitizeSnapshotRefs({ keys: {} }), { keys: {} });
});

/* ---------------- Wiring (app.html / sw.js / i18n / sprite) ---------------- */

test('wiring: app.html nạp projects.min.js + projects-ui.min.js trước app.min.js', () => {
  const pi = APP.indexOf('js/projects.min.js');
  const ui = APP.indexOf('js/projects-ui.min.js');
  const ai = APP.indexOf('js/app.min.js');
  assert.ok(pi >= 0, 'projects.min.js phải có trong app.html');
  assert.ok(ui >= 0, 'projects-ui.min.js phải có trong app.html');
  assert.ok(ai > pi && ai > ui, 'các module projects phải nạp trước app.min.js');
});

test('wiring: sw.js precache projects + projects-ui, cache bump v214', () => {
  assert.ok(SW.includes("'./js/projects.min.js'"), 'sw.js phải precache projects.min.js');
  assert.ok(SW.includes("'./js/projects-ui.min.js'"), 'sw.js phải precache projects-ui.min.js');
  assert.match(SW, /const CACHE = 'taskflow-v263'/);
});

test('wiring: app.js guard + nav + dispatcher + setView branch', () => {
  assert.ok(APP_JS.includes('TaskFlowProjects missing'));
  assert.ok(APP_JS.includes('TaskFlowProjectsUI missing'));
  assert.ok(APP_JS.includes("data-nav-view=\\\"projects\\\"") || APP_JS.includes('data-nav-view="projects"'), 'nav phải có view projects');
  assert.ok(APP_JS.includes("view-projects"), 'setView phải có branch view-projects');
  assert.ok(APP_JS.includes("'project-new'"), 'dispatcher phải có project-new');
  assert.ok(APP_JS.includes("'project-create-save'"), 'dispatcher phải có project-create-save');
  assert.ok(APP_JS.includes("'project-open'"), 'dispatcher phải có project-open');
  assert.ok(APP_JS.includes("'mile-add'"), 'dispatcher phải có mile-add');
  assert.ok(APP_JS.includes("'mile-toggle'"), 'dispatcher phải có mile-toggle');
  assert.ok(APP_JS.includes("'td-project'"), 'change listener phải xử lý td-project');
  assert.ok(APP_JS.includes("'td-milestone'"), 'change listener phải xử lý td-milestone');
});

test('wiring: sprite có briefcase/flag/archive/check/edit/trash/plus', () => {
  for (const ic of ['briefcase', 'flag', 'archive', 'check', 'edit', 'trash', 'plus', 'calendar', 'refresh']) {
    assert.ok(SPRITE.includes('id="' + ic + '"'), 'sprite thiếu #' + ic);
  }
});

test('wiring: i18n có key projects (vi + en)', () => {
  const keys = ['projectsPageTitle', 'projectAdd', 'projectNameLbl', 'projectSave',
    'projectStatusActive', 'projectStatusArchived', 'projectMilestonesLbl',
    'milestoneEditTitle', 'milestoneNameLbl', 'milestoneSave', 'tdProjectLbl', 'tdMilestoneLbl'];
  keys.forEach((k) => {
    const hits = I18N_JS.match(new RegExp(k + ": '", 'g')) || [];
    assert.ok(hits.length >= 2, `key ${k} phải có ít nhất vi + en (có ${hits.length})`);
  });
});

test('wiring: PROJECTS_KEY = planner-projects (sync generic phủ key)', () => {
  assert.equal(PROJECTS_KEY, 'planner-projects');
  // sync regex phải nhận key này
  const sync = readFileSync(path.join(ROOT, 'js/sync.js'), 'utf8');
  assert.ok(/planner-/.test(sync));
});

/* ---------------- PHASE 23: data round-trip (export → clear → import) ---------------- */

// Mô phỏng round-trip ở mức snapshot: build state → export JSON (serialize) →
// clear → import (sanitizeSnapshotRefs như prepareImport) → verify project /
// milestone / task linkage / UID giữ nguyên, progress không đổi.
test('round-trip: export → import giữ project, milestone, task UID, linkage, progress', () => {
  // --- export side: build store + tasks thật ---
  const store = emptyStore();
  const p = createProject(store, { title: 'Backend Internship', targetDate: '2027-03-01', notes: 'note' });
  const m1 = createMilestone(store, p.id, { title: 'Build REST API' });
  const m2 = createMilestone(store, p.id, { title: 'Deploy API' });
  completeMilestone(store, p.id, m1.id); // 1/2 → 50%
  const task1 = makeTask({ projectId: p.id, milestoneId: m1.id });
  const task2 = makeTask({ projectId: p.id, milestoneId: m2.id });
  const snapshot = {
    app: 'taskflow-todoist', version: 2, exportedAt: new Date().toISOString(),
    keys: {
      [PROJECTS_KEY]: JSON.stringify(store),
      'planner-inbox': JSON.stringify([task1]),
      'planner-2026-8': JSON.stringify({
        schemaVersion: 2, monthlyGoals: [], habits: [],
        weeks: [{ n: 1, goals: [], days: [{ date: '1/8/26', yy: 26, sticky: null, note: '', tasks: [task2] }] }],
      }),
    },
  };

  // --- import side: sanitize refs (như prepareImport) ---
  const imported = sanitizeSnapshotRefs(snapshot);
  const storeIn = migrateProjects(JSON.parse(imported.keys[PROJECTS_KEY])).store;
  assert.equal(storeIn.projects.length, 1, 'project phải tồn tại sau import');
  assert.equal(storeIn.projects[0].id, p.id, 'project id giữ nguyên');
  assert.equal(storeIn.projects[0].milestones.length, 2, 'cả 2 milestone phải tồn tại');
  assert.deepStrictEqual(
    storeIn.projects[0].milestones.map((m) => m.id).sort(),
    [m1.id, m2.id].sort(),
    'milestone ids giữ nguyên'
  );
  // progress không đổi sau round-trip (1/2 = 50%)
  const prog = projectProgress(storeIn.projects[0], [task1, task2]);
  assert.equal(prog.done, 1);
  assert.equal(prog.total, 2);
  assert.equal(prog.pct, 50);

  // --- task linkage + UID giữ nguyên ---
  const inboxIn = JSON.parse(imported.keys['planner-inbox']);
  assert.equal(inboxIn[0].uid, task1.uid, 'task UID phải giữ nguyên');
  assert.equal(inboxIn[0].projectId, p.id, 'task.projectId phải giữ nguyên');
  assert.equal(inboxIn[0].milestoneId, m1.id, 'task.milestoneId phải giữ nguyên');
  const monthIn = JSON.parse(imported.keys['planner-2026-8']);
  assert.equal(monthIn.weeks[0].days[0].tasks[0].uid, task2.uid, 'month task UID giữ nguyên');
  assert.equal(monthIn.weeks[0].days[0].tasks[0].milestoneId, m2.id, 'month task milestone giữ nguyên');
});
