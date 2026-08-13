// TaskFlow — Projects & Milestones foundation (V1.1).
// Dữ liệu: store riêng ở key 'planner-projects' — KHÔNG nhồi project vào month state.
// Store = { version: 1, projects: [Project] }.
// Project = { id: 'proj_…', title, goalId: null, status: 'active'|'completed'|'archived',
//   startDate: null, targetDate: null, notes: '', milestones: [Milestone],
//   createdAt, updatedAt }.
// Milestone = { id: 'mile_…', title, status: 'active'|'completed', targetDate: null,
//   createdAt, updatedAt } — nằm TRONG project sở hữu (không nhân đôi projectId).
// Task linkage: task.projectId / task.milestoneId là field OPTIONAL trên task — đọc
// thiếu như null, KHÔNG eager-rewrite task cũ (old tasks vẫn hợp lệ).
//
// Quy tắc referential: projectId == null → milestoneId phải null; milestoneId phải
// thuộc project được chọn. Archive/delete project KHÔNG xoá task (chỉ unlink nếu
// permanent delete). Delete milestone → task.milestoneId = null (giữ projectId).
//
// Progress: có milestone → completed/total milestone; không có milestone nhưng có task
// liên kết → done/total task; cả hai rỗng → 0. Tập trung logic tại projectProgress().
//
// Migration additive + idempotent: thiếu key → store rỗng hợp lệ; record malformed
// được bỏ qua (sanitize) chứ không xoá cả store. Module KHÔNG sở hữu state app —
// nhận `store` qua tham số (pattern pillars.js); save/load đọc localStorage và gọi
// window.Sync.push (pattern storage.js saveMonthState).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowProjects = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PROJECTS_KEY = 'planner-projects';
  const STORE_VERSION = 1;
  const PROJECT_STATUSES = ['active', 'completed', 'archived'];
  const MILESTONE_STATUSES = ['active', 'completed'];

  // Collision-resistant lightweight IDs theo convention uid hiện tại (timestamp + rand).
  function newId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function defaultProject() {
    return {
      id: '',
      title: '',
      goalId: null,
      status: 'active',
      startDate: null,
      targetDate: null,
      notes: '',
      milestones: [],
      createdAt: '',
      updatedAt: '',
    };
  }

  function defaultMilestone() {
    return {
      id: '',
      title: '',
      status: 'active',
      targetDate: null,
      createdAt: '',
      updatedAt: '',
    };
  }

  // Chuẩn hoá 1 milestone — điền default field thiếu; trả null nếu không phải object.
  function normalizeMilestone(m, i) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    const base = defaultMilestone();
    return {
      ...base,
      id: (typeof m.id === 'string' && m.id) ? m.id : (base.id || newId('mile_')),
      title: typeof m.title === 'string' ? m.title : '',
      status: MILESTONE_STATUSES.includes(m.status) ? m.status : 'active',
      targetDate: (typeof m.targetDate === 'string' && m.targetDate) ? m.targetDate : null,
      createdAt: typeof m.createdAt === 'string' ? m.createdAt : '',
      updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : '',
    };
  }

  // Chuẩn hoá 1 project — skip record malformed (không phải object, thiếu title).
  // Trả null → record bị bỏ qua khi migrate (không xoá cả store).
  function normalizeProject(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    if (!title) return null;
    const base = defaultProject();
    const milestones = Array.isArray(p.milestones)
      ? p.milestones.map(normalizeMilestone).filter(Boolean)
      : [];
    return {
      ...base,
      id: (typeof p.id === 'string' && p.id) ? p.id : newId('proj_'),
      title,
      goalId: (typeof p.goalId === 'string' && p.goalId) ? p.goalId : null,
      status: PROJECT_STATUSES.includes(p.status) ? p.status : 'active',
      startDate: (typeof p.startDate === 'string' && p.startDate) ? p.startDate : null,
      targetDate: (typeof p.targetDate === 'string' && p.targetDate) ? p.targetDate : null,
      notes: typeof p.notes === 'string' ? p.notes : '',
      milestones,
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : '',
      updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : '',
    };
  }

  // Migration additive + idempotent. Trả { store, changed }. Dữ liệu cũ không có key →
  // store rỗng hợp lệ. Record malformed bị bỏ qua; store hợp lệ giữ nguyên.
  function migrateProjects(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { store: { version: STORE_VERSION, projects: [] }, changed: true };
    }
    const projects = Array.isArray(raw.projects)
      ? raw.projects.map(normalizeProject).filter(Boolean)
      : [];
    const store = {
      version: STORE_VERSION,
      projects: projects.map((p, i) => ({ ...p, id: p.id || 'proj_' + i })),
    };
    // changed nếu số project hợp lệ khác số record gốc (malformed bị bỏ) — dùng cho
    // test idempotency: chạy lại trên store chuẩn hoá → 0 thay đổi.
    const rawCount = Array.isArray(raw.projects) ? raw.projects.length : 0;
    return { store, changed: projects.length !== rawCount || (raw.version || 0) !== STORE_VERSION };
  }

  // Đọc store từ localStorage (migrate mỗi lần load). Không throw — lỗi → store rỗng.
  function loadProjects() {
    let raw = null;
    try {
      const s = localStorage.getItem(PROJECTS_KEY);
      if (s) raw = JSON.parse(s);
    } catch (e) { /* ẩn */ }
    const { store } = migrateProjects(raw);
    return store;
  }

  // Ghi store + Sync.push theo convention storage.js. Không throw.
  function saveProjects(store) {
    const out = store && typeof store === 'object' ? store : { version: STORE_VERSION, projects: [] };
    try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(out)); } catch (e) { /* ẩn */ }
    if (typeof window !== 'undefined' && window.Sync && window.Sync.push) {
      window.Sync.push(PROJECTS_KEY);
    }
  }

  /* ---------------- Lookup ---------------- */

  function getProject(store, id) {
    if (!store || !Array.isArray(store.projects)) return null;
    return store.projects.find((p) => p && p.id === id) || null;
  }

  function getMilestone(store, projectId, milestoneId) {
    const p = getProject(store, projectId);
    if (!p || !Array.isArray(p.milestones)) return null;
    return p.milestones.find((m) => m && m.id === milestoneId) || null;
  }

  /* ---------------- Project CRUD ---------------- */

  function createProject(store, data) {
    const title = data && typeof data.title === 'string' ? data.title.trim() : '';
    if (!title) return null;
    if (!store || typeof store !== 'object' || !Array.isArray(store.projects)) {
      store.projects = [];
    }
    const now = nowISO();
    const p = {
      ...defaultProject(),
      id: newId('proj_'),
      title,
      goalId: data.goalId || null,
      status: PROJECT_STATUSES.includes(data.status) ? data.status : 'active',
      startDate: (typeof data.startDate === 'string' && data.startDate) ? data.startDate : null,
      targetDate: (typeof data.targetDate === 'string' && data.targetDate) ? data.targetDate : null,
      notes: typeof data.notes === 'string' ? data.notes : '',
      milestones: [],
      createdAt: now,
      updatedAt: now,
    };
    store.projects.push(p);
    return p;
  }

  function updateProject(store, id, data) {
    const p = getProject(store, id);
    if (!p) return null;
    if (typeof data.title === 'string' && data.title.trim()) p.title = data.title.trim();
    if (typeof data.goalId === 'string' && data.goalId) p.goalId = data.goalId;
    else if (data.goalId === null) p.goalId = null;
    if (PROJECT_STATUSES.includes(data.status)) p.status = data.status;
    if (typeof data.startDate === 'string') p.startDate = data.startDate || null;
    if (typeof data.targetDate === 'string') p.targetDate = data.targetDate || null;
    if (typeof data.notes === 'string') p.notes = data.notes;
    p.updatedAt = nowISO();
    return p;
  }

  function archiveProject(store, id) {
    const p = getProject(store, id);
    if (!p) return null;
    p.status = 'archived';
    p.updatedAt = nowISO();
    return p;
  }

  function completeProject(store, id) {
    const p = getProject(store, id);
    if (!p) return null;
    p.status = 'completed';
    p.updatedAt = nowISO();
    return p;
  }

  function restoreProject(store, id) {
    const p = getProject(store, id);
    if (!p) return null;
    p.status = 'active';
    p.updatedAt = nowISO();
    return p;
  }

  // Xoá vĩnh viễn (có xác nhận ở UI). Trả project đã xoá / null. KHÔNG đụng task —
  // caller (app.js) tự unlink task trỏ tới project này sau khi xoá.
  function deleteProject(store, id) {
    const p = getProject(store, id);
    if (!p) return null;
    store.projects = store.projects.filter((x) => !x || x.id !== id);
    return p;
  }

  /* ---------------- Milestone CRUD ---------------- */

  function createMilestone(store, projectId, data) {
    const p = getProject(store, projectId);
    if (!p) return null;
    const title = data && typeof data.title === 'string' ? data.title.trim() : '';
    if (!title) return null;
    if (!Array.isArray(p.milestones)) p.milestones = [];
    const now = nowISO();
    const m = {
      ...defaultMilestone(),
      id: newId('mile_'),
      title,
      status: MILESTONE_STATUSES.includes(data.status) ? data.status : 'active',
      targetDate: (typeof data.targetDate === 'string' && data.targetDate) ? data.targetDate : null,
      createdAt: now,
      updatedAt: now,
    };
    p.milestones.push(m);
    p.updatedAt = now;
    return m;
  }

  function updateMilestone(store, projectId, milestoneId, data) {
    const m = getMilestone(store, projectId, milestoneId);
    if (!m) return null;
    if (typeof data.title === 'string' && data.title.trim()) m.title = data.title.trim();
    if (MILESTONE_STATUSES.includes(data.status)) m.status = data.status;
    if (typeof data.targetDate === 'string') m.targetDate = data.targetDate || null;
    m.updatedAt = nowISO();
    const p = getProject(store, projectId);
    if (p) p.updatedAt = nowISO();
    return m;
  }

  // Toggle hoàn thành / mở lại. Trả milestone / null.
  function completeMilestone(store, projectId, milestoneId) {
    const m = getMilestone(store, projectId, milestoneId);
    if (!m) return null;
    m.status = m.status === 'completed' ? 'active' : 'completed';
    m.updatedAt = nowISO();
    const p = getProject(store, projectId);
    if (p) p.updatedAt = nowISO();
    return m;
  }

  // Xoá milestone — task liên kết KHÔNG bị xoá; caller (app.js) đặt task.milestoneId = null.
  function deleteMilestone(store, projectId, milestoneId) {
    const p = getProject(store, projectId);
    if (!p || !Array.isArray(p.milestones)) return null;
    const m = p.milestones.find((x) => x && x.id === milestoneId) || null;
    if (!m) return null;
    p.milestones = p.milestones.filter((x) => !x || x.id !== milestoneId);
    p.updatedAt = nowISO();
    return m;
  }

  /* ---------------- Task linkage (optional fields, read missing as null) ---------------- */

  function taskProjectId(task) {
    if (!task || typeof task !== 'object') return null;
    return typeof task.projectId === 'string' && task.projectId ? task.projectId : null;
  }

  function taskMilestoneId(task) {
    if (!task || typeof task !== 'object') return null;
    return typeof task.milestoneId === 'string' && task.milestoneId ? task.milestoneId : null;
  }

  // Validate 1 liên kết task: milestoneId phải thuộc project được chọn; projectId null →
  // milestoneId phải null. Trả { projectId, milestoneId } đã sửa cho hợp lệ.
  function validateTaskProjectLink(store, task) {
    let projectId = taskProjectId(task);
    let milestoneId = taskMilestoneId(task);
    if (!projectId) {
      if (milestoneId) milestoneId = null;
      return { projectId: null, milestoneId: null };
    }
    const p = getProject(store, projectId);
    if (!p) {
      return { projectId: null, milestoneId: null };
    }
    if (milestoneId) {
      const m = getMilestone(store, projectId, milestoneId);
      if (!m) milestoneId = null;
    }
    return { projectId, milestoneId };
  }

  // Unlink ref không hợp lệ trên MỘT mảng task (tháng hoặc inbox). Trả số task đã sửa.
  // Không xoá task — chỉ clear projectId/milestoneId sai.
  function unlinkInvalidProjectReferences(store, tasks) {
    if (!Array.isArray(tasks)) return 0;
    let fixed = 0;
    tasks.forEach((tk) => {
      if (!tk || typeof tk !== 'object') return;
      const before = { p: taskProjectId(tk), m: taskMilestoneId(tk) };
      const ok = validateTaskProjectLink(store, tk);
      if (ok.projectId === null) {
        // project sai → xoá cả hai; orphan milestone (milestoneId không project) → xoá milestone
        if (before.p !== null) { delete tk.projectId; delete tk.milestoneId; fixed++; }
        else if (before.m !== null) { delete tk.milestoneId; fixed++; }
      } else if (ok.projectId !== null) {
        if (ok.projectId !== before.p) { tk.projectId = ok.projectId; fixed++; }
        if (ok.milestoneId !== before.m) {
          if (ok.milestoneId === null && tk.milestoneId !== undefined) {
            delete tk.milestoneId;
            fixed++;
          } else if (ok.milestoneId !== null) {
            tk.milestoneId = ok.milestoneId;
            fixed++;
          }
        }
      }
    });
    return fixed;
  }

  /* ---------------- Progress / stats ---------------- */

  // Task liên kết với project (theo projectId).
  function projectTasks(project, allTasks) {
    if (!project || !Array.isArray(allTasks)) return [];
    return allTasks.filter((t) => t && taskProjectId(t) === project.id);
  }

  // Quy tắc tiến độ tập trung: milestone trước, task sau, cả hai rỗng → 0.
  function projectProgress(project, allTasks) {
    if (!project) return { done: 0, total: 0, pct: 0 };
    const miles = Array.isArray(project.milestones) ? project.milestones.filter(Boolean) : [];
    if (miles.length) {
      const done = miles.filter((m) => m.status === 'completed').length;
      return { done, total: miles.length, pct: Math.min(100, Math.round(done / miles.length * 100)) };
    }
    const tasks = projectTasks(project, allTasks);
    if (tasks.length) {
      const done = tasks.filter((t) => t.done === true).length;
      return { done, total: tasks.length, pct: Math.min(100, Math.round(done / tasks.length * 100)) };
    }
    return { done: 0, total: 0, pct: 0 };
  }

  // Thống kê task liên kết (dùng ở Project Detail).
  function projectTaskStats(project, allTasks) {
    const tasks = projectTasks(project, allTasks);
    const done = tasks.filter((t) => t.done === true).length;
    return { total: tasks.length, done };
  }

  /* ---------------- Import sanitization (snapshot-level) ---------------- */

  // Sanitize toàn bộ snapshot import: các task trong month key + inbox trỏ tới
  // project/milestone không tồn tại trong store import → clear ref (KHÔNG xoá task).
  // Trả snapshot mới (không mutate input).
  function sanitizeSnapshotRefs(snapshot) {
    if (!snapshot || !snapshot.keys || typeof snapshot.keys !== 'object') return snapshot;
    const out = clone(snapshot);
    const store = (() => {
      const raw = out.keys[PROJECTS_KEY];
      if (!raw) return { version: STORE_VERSION, projects: [] };
      try { return migrateProjects(JSON.parse(raw)).store; } catch (e) { return { version: STORE_VERSION, projects: [] }; }
    })();
    Object.keys(out.keys).forEach((key) => {
      if (!/^planner-(\d{4})-(\d{1,2})$/.test(key) && key !== 'planner-inbox') return;
      let parsed;
      try { parsed = JSON.parse(out.keys[key]); } catch (e) { return; }
      if (key === 'planner-inbox') {
        if (Array.isArray(parsed)) {
          unlinkInvalidProjectReferences(store, parsed);
          out.keys[key] = JSON.stringify(parsed);
        }
        return;
      }
      if (parsed && Array.isArray(parsed.weeks)) {
        parsed.weeks.forEach((w) => {
          if (!w || !Array.isArray(w.days)) return;
          w.days.forEach((d) => {
            if (d && Array.isArray(d.tasks)) unlinkInvalidProjectReferences(store, d.tasks);
          });
        });
        out.keys[key] = JSON.stringify(parsed);
      }
    });
    return out;
  }

  return {
    PROJECTS_KEY,
    STORE_VERSION,
    PROJECT_STATUSES,
    MILESTONE_STATUSES,
    newId,
    defaultProject,
    defaultMilestone,
    normalizeMilestone,
    normalizeProject,
    migrateProjects,
    loadProjects,
    saveProjects,
    getProject,
    getMilestone,
    createProject,
    updateProject,
    archiveProject,
    completeProject,
    restoreProject,
    deleteProject,
    createMilestone,
    updateMilestone,
    completeMilestone,
    deleteMilestone,
    taskProjectId,
    taskMilestoneId,
    validateTaskProjectLink,
    unlinkInvalidProjectReferences,
    projectTasks,
    projectProgress,
    projectTaskStats,
    sanitizeSnapshotRefs,
  };
});
