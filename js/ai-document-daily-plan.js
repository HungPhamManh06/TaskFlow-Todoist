// TaskFlow — Document Daily Planner Client Orchestrator
// Handles: PDF → roadmap extraction → daily plan generation → Review
'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowDocumentDailyPlan = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {

  var STORAGE_KEY_PREFIX = 'taskflow-document-roadmaps:';
  var MAX_STORED_ROADMAPS = 10;

  /* ---- Account scope ---- */
  function _getAccountScope() {
    try {
      if (typeof window !== 'undefined' && window.Sync && typeof window.Sync.getUserId === 'function') {
        return window.Sync.getUserId() || 'anon';
      }
    } catch (e) { /* */ }
    return 'anon';
  }

  function _storageKey() {
    return STORAGE_KEY_PREFIX + _getAccountScope();
  }

  /* ---- Storage helpers ---- */
  function loadStore() {
    try {
      var raw = localStorage.getItem(_storageKey());
      if (!raw) return { version: 1, activeRoadmapId: null, roadmaps: [] };
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.roadmaps)) {
        return { version: 1, activeRoadmapId: null, roadmaps: [] };
      }
      return parsed;
    } catch (e) {
      return { version: 1, activeRoadmapId: null, roadmaps: [] };
    }
  }

  function saveStore(store) {
    try {
      // Bound storage
      if (store.roadmaps.length > MAX_STORED_ROADMAPS) {
        store.roadmaps = store.roadmaps.slice(-MAX_STORED_ROADMAPS);
      }
      localStorage.setItem(_storageKey(), JSON.stringify(store));
    } catch (e) { /* storage full — silently degrade */ }
  }

  function saveRoadmap(record) {
    var store = loadStore();
    // Check for duplicate fingerprint
    var existingIdx = store.roadmaps.findIndex(function (r) { return r.fingerprint === record.fingerprint; });
    if (existingIdx >= 0) {
      store.roadmaps[existingIdx] = record;
    } else {
      store.roadmaps.push(record);
    }
    store.activeRoadmapId = record.id;
    saveStore(store);
  }

  function getActiveRoadmap() {
    var store = loadStore();
    if (!store.activeRoadmapId) return null;
    return store.roadmaps.find(function (r) { return r.id === store.activeRoadmapId; }) || null;
  }

  function updateCursor(roadmapId, cursor) {
    var store = loadStore();
    var record = store.roadmaps.find(function (r) { return r.id === roadmapId; });
    if (record) {
      record.cursor = Object.assign(record.cursor || {}, cursor);
      record.updatedAt = Date.now();
      saveStore(store);
    }
  }

  function clearActiveRoadmap() {
    var store = loadStore();
    store.activeRoadmapId = null;
    saveStore(store);
  }

  function clearAll() {
    try { localStorage.removeItem(_storageKey()); } catch (e) { /* */ }
  }

  /* ---- API base ---- */
  function _getApiBase() {
    try {
      if (typeof API_CONFIG !== 'undefined' && API_CONFIG && typeof API_CONFIG.url === 'string') {
        return API_CONFIG.url.replace(/\/+$/, '');
      }
    } catch (e) { /* */ }
    return '';
  }

  function _getToken() {
    try { return localStorage.getItem('planner-token'); } catch (e) { return null; }
  }

  /* ---- Date helpers ---- */
  function _today() {
    // Safe local date (avoids UTC offset issues)
    var d = new Date();
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function _addDays(dateStr, n) {
    var d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  /* ---- Stage A: Extract roadmap from uploaded files ---- */
  async function runInitialDocumentPlan(files, message, opts) {
    opts = opts || {};
    var apiBase = _getApiBase();
    if (!apiBase) return { ok: false, code: 'api-config-missing' };

    // Build multipart form data
    var fd = new FormData();
    files.forEach(function (file) { fd.append('files', file, file.name); });
    fd.append('message', message);

    var token = _getToken();
    var headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;

    // Stage A: Upload PDF + extract roadmap + generate daily plan in one call
    // Server handles: PDF extraction → roadmap extraction → daily plan generation
    var resp = await fetch(apiBase + '/api/ai/document-daily-plan', {
      method: 'POST',
      headers: headers,
      body: fd,
      signal: opts.signal || undefined,
    });

    var json;
    try { json = await resp.json(); } catch (e) { json = null; }

    if (!resp.ok || !json || !json.ok) {
      var errorCode = (json && json.error) ? json.error : 'ai-document-plan-failed';
      return { ok: false, code: errorCode, status: resp.status };
    }

    // Persist roadmap
    if (json.roadmap) {
      var record = {
        id: 'roadmap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        accountScope: _getAccountScope(),
        fingerprint: json.fingerprint || '',
        documentName: json.documentName || 'document',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        roadmap: json.roadmap,
        cursor: {
          nextWeek: 1,
          lastStartDate: json.meta ? json.meta.dateRange[0] : _today(),
          lastDaysCount: json.meta ? json.meta.daysGenerated : 7,
        },
      };
      saveRoadmap(record);
    }

    return {
      ok: true,
      proposal: json.proposal,
      meta: json.meta,
      roadmap: json.roadmap,
    };
  }

  /* ---- Stage B: Generate daily plan from stored roadmap ---- */
  async function runNextWindow(message, opts) {
    opts = opts || {};
    var roadmapRecord = getActiveRoadmap();
    if (!roadmapRecord) {
      return { ok: false, code: 'no-active-roadmap', message: 'Không tìm thấy kế hoạch tài liệu. Vui lòng tải lên PDF trước.' };
    }

    var apiBase = _getApiBase();
    if (!apiBase) return { ok: false, code: 'api-config-missing' };

    // Determine next start date
    var cursor = roadmapRecord.cursor || {};
    var startDate = cursor.lastStartDate || _today();
    var daysCount = cursor.lastDaysCount || 7;

    // Parse user request for day count override
    var dayMatch = message.match(/(\d+)\s*(?:ngày|day)/i);
    if (dayMatch) {
      daysCount = Math.min(Math.max(parseInt(dayMatch[1]) || 7, 1), 14);
    }
    if (/tuần\s+tiếp|next\s+week/i.test(message)) {
      startDate = _addDays(startDate, daysCount);
      daysCount = 7;
    }

    // Clamp: never schedule in the past
    var today = _today();
    if (startDate < today) startDate = today;

    // Get existing tasks for deduplication
    var existingTasks = [];
    try {
      if (typeof TaskFlowAIAgentRuntime !== 'undefined' && TaskFlowAIAgentRuntime.buildContext) {
        var ctx = TaskFlowAIAgentRuntime.buildContext();
        if (ctx && ctx.tasks) {
          existingTasks = ctx.tasks.slice(0, 30).map(function (t) {
            return { text: t.text || '', status: t.status || '' };
          });
        }
      }
    } catch (e) { /* context must not break planning */ }

    var body = {
      roadmap: roadmapRecord.roadmap,
      startDate: startDate,
      daysCount: daysCount,
      existingTasks: existingTasks,
      lang: (typeof TaskFlowI18N !== 'undefined' && TaskFlowI18N.getLang) ? TaskFlowI18N.getLang() : 'vi',
    };

    var token = _getToken();
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var resp = await fetch(apiBase + '/api/ai/daily-plan', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: opts.signal || undefined,
    });

    var json;
    try { json = await resp.json(); } catch (e) { json = null; }

    if (!resp.ok || !json || !json.ok) {
      var errorCode = (json && json.error) ? json.error : 'ai-daily-plan-failed';
      return { ok: false, code: errorCode, status: resp.status };
    }

    // Update cursor
    updateCursor(roadmapRecord.id, {
      nextWeek: (cursor.nextWeek || 1) + 1,
      lastStartDate: startDate,
      lastDaysCount: daysCount,
    });

    return {
      ok: true,
      proposal: json.proposal,
      meta: json.meta,
    };
  }

  /* ---- Send proposal to existing Review ---- */
  function sendProposalToReview(proposal, opts) {
    opts = opts || {};
    if (typeof TaskFlowAIAgentRuntime === 'undefined' || !TaskFlowAIAgentRuntime.handleExternalProposal) {
      return { ok: false, code: 'runtime-not-loaded' };
    }
    return TaskFlowAIAgentRuntime.handleExternalProposal(proposal, {
      source: opts.source || 'document-daily-plan',
      fileName: opts.fileName || '',
    });
  }

  /* ---- Status ---- */
  function getStatus() {
    var record = getActiveRoadmap();
    if (!record) return { hasActivePlan: false };
    return {
      hasActivePlan: true,
      documentName: record.documentName,
      roadmapTitle: record.roadmap ? record.roadmap.title : '',
      totalWeeks: record.roadmap ? record.roadmap.totalWeeks || 0 : 0,
      cursor: record.cursor || {},
    };
  }

  /* ---- Account change cleanup ---- */
  function onAccountChange() {
    // Clear in-memory references when account changes
    clearActiveRoadmap();
  }

  return {
    loadStore: loadStore,
    saveRoadmap: saveRoadmap,
    getActiveRoadmap: getActiveRoadmap,
    updateCursor: updateCursor,
    clearActiveRoadmap: clearActiveRoadmap,
    clearAll: clearAll,
    runInitialDocumentPlan: runInitialDocumentPlan,
    runNextWindow: runNextWindow,
    sendProposalToReview: sendProposalToReview,
    getStatus: getStatus,
    onAccountChange: onAccountChange,
    _getAccountScope: _getAccountScope,
    _today: _today,
    _addDays: _addDays,
  };
});
