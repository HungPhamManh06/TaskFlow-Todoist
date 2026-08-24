// TaskFlow — Universal Tool Registry (AI Brain Phase 2).
// Defines all tools available to Gemini with structured schemas,
// safety categories, and validation. Gemini selects tools; the
// executor enforces boundaries. No direct mutation allowed.
'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowAITools = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {

  /* ---- Constants ---- */
  var SAFETY_READ = 'read';               // no side effects
  var SAFETY_SAFE_PROPOSAL = 'safe_proposal'; // creates proposal only
  var SAFETY_DESTRUCTIVE = 'destructive_proposal'; // delete/bulk

  var MAX_AGENT_STEPS = 8;
  var AGENT_STEP_TIMEOUT_MS = 30000;
  var AGENT_TOTAL_TIMEOUT_MS = 120000;

  /* ---- i18n / util helpers ---- */
  function _t(key, vars) {
    try {
      if (window.TaskFlowI18N && window.TaskFlowI18N.t) return window.TaskFlowI18N.t(key, vars);
    } catch (e) { /* */ }
    return key;
  }

  function _localTodayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* Derive actual date string from planner week/day grid position */
  function _gridDate(week, day) {
    try {
      if (typeof PLAN_START === 'undefined' || !PLAN_START) return null;
      if (typeof week !== 'number' || typeof day !== 'number') return null;
      // day is 1-indexed within the week, week is 1-indexed
      // PLAN_START is the grid start (may be before month start for alignment)
      var dayIdx = (week - 1) * 7 + (day - 1);
      var dt = new Date(PLAN_START.getTime() + dayIdx * 86400000);
      return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    } catch (e) { return null; }
  }

  /* ---- Tool Registry ---- */
  var _tools = {};

  function register(tool) {
    if (!tool || typeof tool !== 'object') throw new Error('Tool must be an object');
    if (!tool.name || typeof tool.name !== 'string') throw new Error('Tool must have a name');
    if (_tools[tool.name]) throw new Error('Tool already registered: ' + tool.name);
    if (!tool.description || typeof tool.description !== 'string') throw new Error('Tool must have a description');
    if (!tool.category || typeof tool.category !== 'string') throw new Error('Tool must have a category');
    if (!tool.safety || typeof tool.safety !== 'string') throw new Error('Tool must have a safety level');
    if (typeof tool.execute !== 'function') throw new Error('Tool must have an execute function');

    _tools[tool.name] = {
      name: tool.name,
      description: tool.description,
      category: tool.category,
      safety: tool.safety,
      mutating: tool.safety !== SAFETY_READ,
      inputSchema: tool.inputSchema || null,
      requiredContext: tool.requiredContext || [],
      execute: tool.execute,
    };
  }

  function getTool(name) {
    return _tools[name] || null;
  }

  function listTools() {
    return Object.keys(_tools).map(function (k) { return _tools[k]; });
  }

  function listToolNames() {
    return Object.keys(_tools);
  }

  function getToolDefinitions() {
    return listTools().map(function (t) {
      return {
        name: t.name,
        description: t.description,
        category: t.category,
        safety: t.safety,
        inputSchema: t.inputSchema,
      };
    });
  }

  function isKnownTool(name) {
    return !!_tools[name];
  }

  function isReadTool(name) {
    return _tools[name] && _tools[name].safety === SAFETY_READ;
  }

  /* ---- Schema validation ---- */
  function validateArgs(toolName, args) {
    var tool = _tools[toolName];
    if (!tool) return { ok: false, errors: ['unknown-tool: ' + toolName] };
    if (!tool.inputSchema) return { ok: true, errors: [] };
    var errors = [];
    var schema = tool.inputSchema;
    var a = args || {};

    if (schema.required && Array.isArray(schema.required)) {
      schema.required.forEach(function (key) {
        if (a[key] === undefined || a[key] === null) {
          errors.push('missing-required: ' + key);
        }
      });
    }

    if (schema.properties) {
      Object.keys(schema.properties).forEach(function (key) {
        var prop = schema.properties[key];
        var val = a[key];
        if (val === undefined || val === null) return; // check required separately
        if (prop.type === 'string' && typeof val !== 'string') errors.push('invalid-type: ' + key + ' (expected string)');
        if (prop.type === 'number' && typeof val !== 'number') errors.push('invalid-type: ' + key + ' (expected number)');
        if (prop.type === 'boolean' && typeof val !== 'boolean') errors.push('invalid-type: ' + key + ' (expected boolean)');
        if (prop.type === 'array' && !Array.isArray(val)) errors.push('invalid-type: ' + key + ' (expected array)');
        if (prop.minLength && typeof val === 'string' && val.length < prop.minLength) errors.push('too-short: ' + key);
        if (prop.maxLength && typeof val === 'string' && val.length > prop.maxLength) errors.push('too-long: ' + key);
        if (prop.minimum && typeof val === 'number' && val < prop.minimum) errors.push('too-small: ' + key);
        if (prop.maximum && typeof val === 'number' && val > prop.maximum) errors.push('too-large: ' + key);
        if (prop.enum && Array.isArray(prop.enum) && prop.enum.indexOf(val) < 0) {
          errors.push('invalid-enum: ' + key + ' must be one of [' + prop.enum.join(', ') + ']');
        }
        if (prop.format === 'date' && typeof val === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
          errors.push('invalid-date: ' + key);
        }
      });
    }

    // Reject unknown fields
    if (schema.additionalProperties === false) {
      Object.keys(a).forEach(function (key) {
        if (!schema.properties || !schema.properties[key]) {
          errors.push('unknown-field: ' + key);
        }
      });
    }

    return { ok: errors.length === 0, errors: errors };
  }

  /* ---- Built-in READ tools ---- */

  register({
    name: 'get_today',
    description: 'Get today\'s date in YYYY-MM-DD format.',
    category: 'read',
    safety: SAFETY_READ,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    requiredContext: [],
    execute: function () {
      return { today: _localTodayIso() };
    },
  });

  register({
    name: 'get_tasks',
    description: 'Get current TaskFlow tasks with optional filters.',
    category: 'read',
    safety: SAFETY_READ,
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['all', 'active', 'completed', 'today', 'upcoming', 'overdue'] },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    requiredContext: [],
    execute: function (args) {
      var filter = (args && args.filter) || 'all';
      var limit = (args && typeof args.limit === 'number') ? args.limit : 50;
      var allTasks = [];

      try {
        if (typeof state !== 'undefined' && state && Array.isArray(state.weeks)) {
          state.weeks.forEach(function (w) {
            if (!w || !Array.isArray(w.days)) return;
            w.days.forEach(function (d) {
              if (!d || !Array.isArray(d.tasks)) return;
              d.tasks.forEach(function (tk) {
                if (!tk) return;
                allTasks.push({
                  uid: tk.uid,
                  text: tk.text || '',
                  done: !!tk.done,
                  deadline: tk.deadline || null,
                  duration: tk.duration || tk.estimatedMinutes || null,
                  week: w.week,
                  day: d.day,
                });
              });
            });
          });
        }
      } catch (e) { /* */ }

      try {
        if (typeof inbox !== 'undefined' && Array.isArray(inbox)) {
          inbox.forEach(function (tk) {
            if (!tk) return;
            allTasks.push({
              uid: tk.uid,
              text: tk.text || '',
              done: !!tk.done,
              deadline: tk.deadline || null,
              duration: tk.duration || tk.estimatedMinutes || null,
              scope: 'inbox',
            });
          });
        }
      } catch (e) { /* */ }

      var today = _localTodayIso();

      if (filter === 'active') {
        allTasks = allTasks.filter(function (t) { return !t.done; });
      } else if (filter === 'completed') {
        allTasks = allTasks.filter(function (t) { return !!t.done; });
      } else if (filter === 'today') {
        // Tasks with deadline === today, OR scheduledDate === today
        allTasks = allTasks.filter(function (t) {
          if (t.done) return false;
          if (t.deadline === today) return true;
          // Derive actual date from planner grid
          if (!t.deadline && t.day && typeof t.day === 'number' && t.week) {
            var gridDate = _gridDate(t.week, t.day);
            return gridDate === today;
          }
          return false;
        });
      } else if (filter === 'upcoming') {
        allTasks = allTasks.filter(function (t) {
          return !t.done && t.deadline && t.deadline > today;
        });
      } else if (filter === 'overdue') {
        allTasks = allTasks.filter(function (t) {
          return !t.done && t.deadline && t.deadline < today;
        });
      }

      return { tasks: allTasks.slice(0, limit), total: allTasks.length };
    },
  });

  register({
    name: 'get_projects',
    description: 'Get TaskFlow projects and milestones.',
    category: 'read',
    safety: SAFETY_READ,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    requiredContext: [],
    execute: function () {
      var projects = [];
      try {
        if (typeof loadProjectsStore === 'function') {
          var store = loadProjectsStore();
          if (store && Array.isArray(store.projects)) {
            store.projects.forEach(function (p) {
              if (!p || !p.id) return;
              projects.push({
                id: p.id,
                title: p.title || '',
                status: p.status,
                milestones: (Array.isArray(p.milestones) ? p.milestones : []).map(function (m) {
                  return { id: m.id, title: m.title || '' };
                }),
              });
            });
          }
        }
      } catch (e) { /* */ }
      return { projects: projects };
    },
  });

  register({
    name: 'get_active_roadmap',
    description: 'Get the active document daily plan roadmap.',
    category: 'read',
    safety: SAFETY_READ,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    requiredContext: [],
    execute: function () {
      var planner = window.TaskFlowDocumentDailyPlan;
      if (!planner) return { roadmap: null };
      var record = planner.getActiveRoadmap();
      if (!record) return { roadmap: null };
      return {
        roadmap: record.roadmap,
        cursor: record.cursor,
        documentName: record.documentName,
      };
    },
  });

  register({
    name: 'get_plan_progress',
    description: 'Get document plan progress statistics.',
    category: 'read',
    safety: SAFETY_READ,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    requiredContext: [],
    execute: function () {
      var planner = window.TaskFlowDocumentDailyPlan;
      if (!planner) return { hasActivePlan: false };
      return planner.getStatus();
    },
  });

  register({
    name: 'get_free_time',
    description: 'Get free time slots from timeblocks for a date range.',
    category: 'read',
    safety: SAFETY_READ,
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', format: 'date' },
        daysCount: { type: 'number', minimum: 1, maximum: 14 },
      },
      additionalProperties: false,
    },
    requiredContext: [],
    execute: function (args) {
      var startDate = (args && args.startDate) || _localTodayIso();
      var daysCount = (args && typeof args.daysCount === 'number') ? args.daysCount : 7;
      var busy = [];

      try {
        if (window.TaskFlowGCal && window.TaskFlowGCal.loadCache && window.TaskFlowGCal.eventsForDate) {
          var cache = window.TaskFlowGCal.loadCache();
          var events = cache && Array.isArray(cache.events) ? cache.events : [];
          for (var d = 0; d < daysCount; d++) {
            var dt = new Date(startDate + 'T00:00:00');
            dt.setDate(dt.getDate() + d);
            var ds = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
            (window.TaskFlowGCal.eventsForDate(events, ds) || []).forEach(function (e) {
              busy.push({ date: ds, startMs: e.startMs, endMs: e.endMs, title: e.title });
            });
          }
        }
      } catch (e) { /* offline */ }

      var timeblocks = null;
      try {
        if (typeof loadTimeBlocksStore === 'function') timeblocks = loadTimeBlocksStore();
      } catch (e) { /* */ }

      return { busy: busy, timeblocks: timeblocks, startDate: startDate, daysCount: daysCount };
    },
  });

  /* ---- Built-in PLANNING tools ---- */

  register({
    name: 'generate_daily_plan',
    description: 'Generate daily tasks from a roadmap for a given date range. Returns proposal actions.',
    category: 'planning',
    safety: SAFETY_SAFE_PROPOSAL,
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', format: 'date' },
        daysCount: { type: 'number', minimum: 1, maximum: 14 },
      },
      required: ['startDate'],
      additionalProperties: false,
    },
    requiredContext: ['get_active_roadmap'],
    execute: async function (args) {
      var planner = window.TaskFlowDocumentDailyPlan;
      if (!planner) return { ok: false, code: 'runtime-not-loaded' };
      var startDate = (args && args.startDate) || undefined;
      var daysCount = (args && typeof args.daysCount === 'number') ? args.daysCount : 7;
      // Use structured runWindow API — no string parsing
      return await planner.runWindow({ startDate: startDate, daysCount: daysCount }, {});
    },
  });

  register({
    name: 'propose_create_task',
    description: 'Create a proposal to add a new task.',
    category: 'mutation_proposal',
    safety: SAFETY_SAFE_PROPOSAL,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 300 },
        date: { type: 'string', format: 'date' },
        duration: { type: 'number', minimum: 1, maximum: 480 },
        priority: { type: 'boolean' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    requiredContext: [],
    execute: function (args) {
      var text = (args && args.text) ? String(args.text).trim() : '';
      if (!text) return { ok: false, code: 'empty-text' };
      var date = (args && args.date) || _localTodayIso();
      var duration = (args && typeof args.duration === 'number') ? args.duration : 30;
      var today = _localTodayIso();
      if (date < today) date = today;

      var projectId = (args && args.projectId) || null;
      var milestoneId = (args && args.milestoneId) || null;
      return {
        ok: true,
        proposal: {
          summary: 'Tạo task: ' + text,
          actions: [{
            id: 'a1',
            type: 'create_task',
            args: {
              text: text,
              date: date,
              duration: duration,
              priority: !!(args && args.priority),
              projectId: projectId,
              milestoneId: milestoneId,
              taskRef: null,
              start: null,
              changes: null,
              source: { kind: 'ai-brain', tool: 'propose_create_task' },
            },
          }],
        },
      };
    },
  });

  register({
    name: 'propose_complete_task',
    description: 'Create a proposal to mark a task as done.',
    category: 'mutation_proposal',
    safety: SAFETY_SAFE_PROPOSAL,
    inputSchema: {
      type: 'object',
      properties: {
        taskUid: { type: 'string', minLength: 1 },
      },
      required: ['taskUid'],
      additionalProperties: false,
    },
    requiredContext: [],
    execute: function (args) {
      var uid = (args && args.taskUid) || '';
      if (!uid) return { ok: false, code: 'missing-task-uid' };
      return {
        ok: true,
        proposal: {
          summary: 'Đánh dấu hoàn thành task',
          actions: [{
            id: 'a1',
            type: 'complete_task',
            args: { taskRef: { kind: 'existing', uid: uid }, source: { kind: 'ai-brain', tool: 'propose_complete_task' } },
          }],
        },
      };
    },
  });

  register({
    name: 'propose_reschedule_task',
    description: 'Create a proposal to move a task to a different date.',
    category: 'mutation_proposal',
    safety: SAFETY_SAFE_PROPOSAL,
    inputSchema: {
      type: 'object',
      properties: {
        taskUid: { type: 'string', minLength: 1 },
        newDate: { type: 'string', format: 'date' },
      },
      required: ['taskUid', 'newDate'],
      additionalProperties: false,
    },
    requiredContext: [],
    execute: function (args) {
      var uid = (args && args.taskUid) || '';
      var newDate = (args && args.newDate) || _localTodayIso();
      if (!uid) return { ok: false, code: 'missing-task-uid' };
      return {
        ok: true,
        proposal: {
          summary: 'Di chuyển task sang ' + newDate,
          actions: [{
            id: 'a1',
            type: 'update_task',
            args: {
              taskRef: { kind: 'existing', uid: uid },
              text: null, date: null, start: null, duration: null,
              priority: null, projectId: null, milestoneId: null,
              changes: { date: newDate },
              source: { kind: 'ai-brain', tool: 'propose_reschedule_task' },
            },
          }],
        },
      };
    },
  });

  /* propose_delete_task: DISABLED (Option A) — not exposed to Gemini.
     Server contracts don't include it. If needed later, implement
     full delete_task in Agent contract with Review/Apply/Undo first. */
  /* register({
    name: 'propose_delete_task',
    description: 'Create a proposal to delete a task. Destructive — always requires Review.',
    category: 'mutation_proposal',
    safety: SAFETY_DESTRUCTIVE,
    inputSchema: {
      type: 'object',
      properties: {
        taskUid: { type: 'string', minLength: 1 },
      },
      required: ['taskUid'],
      additionalProperties: false,
    },
    requiredContext: [],
    execute: function (args) {
      var uid = (args && args.taskUid) || '';
      if (!uid) return { ok: false, code: 'missing-task-uid' };
      return {
        ok: true,
        proposal: {
          summary: 'Xóa task',
          actions: [{
            id: 'a1',
            type: 'delete_task',
            args: { taskRef: { kind: 'existing', uid: uid }, source: { kind: 'ai-brain', tool: 'propose_delete_task' } },
          }],
        },
      };
    },
  }); */

  /* ---- Public API ---- */
  return {
    register: register,
    getTool: getTool,
    listTools: listTools,
    listToolNames: listToolNames,
    getToolDefinitions: getToolDefinitions,
    isKnownTool: isKnownTool,
    isReadTool: isReadTool,
    validateArgs: validateArgs,
    SAFETY_READ: SAFETY_READ,
    SAFETY_SAFE_PROPOSAL: SAFETY_SAFE_PROPOSAL,
    SAFETY_DESTRUCTIVE: SAFETY_DESTRUCTIVE,
    MAX_AGENT_STEPS: MAX_AGENT_STEPS,
    AGENT_STEP_TIMEOUT_MS: AGENT_STEP_TIMEOUT_MS,
    AGENT_TOTAL_TIMEOUT_MS: AGENT_TOTAL_TIMEOUT_MS,
  };
});
