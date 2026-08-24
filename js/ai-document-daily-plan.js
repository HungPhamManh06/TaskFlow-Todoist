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
  /* Pending cursor: cursor is only committed after Review → Apply succeeds.
     If user cancels Review, pending cursor is discarded and next-week still
     uses the original cursor. */
  /* Pending cursor: proposal-scoped so unrelated Review Apply/Cancel
     doesn't accidentally commit or cancel document cursor. */
  var _pendingCursor = null;
  var _pendingCursorProposalId = null;

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

  /* ---- Duration parser ---- */
  /* Parses Vietnamese/English duration strings to minutes.
     Returns null if unparseable. Clamps to TaskFlow limits [20, 120]. */
  function parseDuration(text) {
    if (!text || typeof text !== 'string') return null;
    var s = text.trim().toLowerCase();
    var totalMinutes = 0;

    // Hours: "2 giờ", "2h", "1.5 hours", "1 hour"
    var hoursMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:giờ|hours?|hrs?|h(?!\d))\b/);
    if (hoursMatch) {
      totalMinutes += Math.round(parseFloat(hoursMatch[1]) * 60);
    }

    // Hours compact: "1h30", "1h 30"
    var hCompactMatch = s.match(/(\d+)\s*h\s*(\d{1,2})\b/);
    if (hCompactMatch && !hoursMatch) {
      totalMinutes += parseInt(hCompactMatch[1]) * 60 + parseInt(hCompactMatch[2]);
    }

    // Minutes: "90 phút", "45 min", "30 minutes"
    var minMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:phút|min(?:utes?)?)\b/);
    if (minMatch) {
      totalMinutes += Math.round(parseFloat(minMatch[1]));
    }

    // Plain number fallback: "90" assumed minutes if > 0
    if (totalMinutes === 0) {
      var plainNum = s.match(/^(\d+(?:\.\d+)?)\s*$/);
      if (plainNum) totalMinutes = Math.round(parseFloat(plainNum[1]));
    }

    if (totalMinutes <= 0) return null;

    // Clamp to TaskFlow limits
    if (totalMinutes < 20) totalMinutes = 20;
    if (totalMinutes > 120) totalMinutes = 120;
    return totalMinutes;
  }

  /* ---- Text normalization for dedup ---- */
  function _normalizeText(s) {
    if (!s || typeof s !== 'string') return '';
    return s.toLowerCase()
      .replace(/[àáảãạăắằẳẵặâấầẩẫậ]/g, 'a')
      .replace(/[èéẻẽẹêếềểễệ]/g, 'e')
      .replace(/[ìíỉĩị]/g, 'i')
      .replace(/[òóỏõọôốồổỗộơớờởỡợ]/g, 'o')
      .replace(/[ùúủũụưứừửữự]/g, 'u')
      .replace(/[ỳýỷỹỵ]/g, 'y')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /* Check if a proposed task duplicates an existing one */
  function isDuplicateTask(proposed, existingTasks) {
    if (!proposed || !Array.isArray(existingTasks)) return false;
    var normText = _normalizeText(proposed.text || '');
    if (!normText) return false;
    for (var i = 0; i < existingTasks.length; i++) {
      var ex = existingTasks[i];
      if (!ex) continue;
      var exNorm = _normalizeText(ex.text || '');
      if (!exNorm) continue;
      // Exact normalized match
      if (normText === exNorm) return true;
      // One contains the other (fuzzy)
      if (normText.length >= 8 && exNorm.length >= 8) {
        if (normText.indexOf(exNorm) >= 0 || exNorm.indexOf(normText) >= 0) return true;
      }
    }
    return false;
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

  function _getTimeZone() {
    try {
      var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return zone || 'UTC';
    } catch (e) { return 'UTC'; }
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
    fd.append('timeZone', _getTimeZone());

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
          lastStartDate: json.meta && Array.isArray(json.meta.dateRange) ? json.meta.dateRange[0] : _today(),
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
      fingerprint: json.fingerprint || '',
      documentName: json.documentName || 'document',
      files: Array.isArray(json.files) ? json.files : [],
      rejectedFiles: Array.isArray(json.rejectedFiles) ? json.rejectedFiles : [],
    };
  }

  /* ---- Stage B: Generate daily plan from stored roadmap ---- */
  /* Internal structured API — no string parsing */
  async function runWindow(params, opts) {
    opts = opts || {};
    params = params || {};
    var roadmapRecord = getActiveRoadmap();
    if (!roadmapRecord) {
      return { ok: false, code: 'no-active-roadmap', message: 'Không tìm thấy kế hoạch tài liệu. Vui lòng tải lên PDF trước.' };
    }

    var apiBase = _getApiBase();
    if (!apiBase) return { ok: false, code: 'api-config-missing' };

    // Use structured params — no string parsing
    var cursor = roadmapRecord.cursor || {};
    var startDate = params.startDate || cursor.lastStartDate || _today();
    var daysCount = typeof params.daysCount === 'number' ? Math.min(Math.max(params.daysCount, 1), 14) : (cursor.lastDaysCount || 7);

    // Clamp: never schedule in the past
    var today = _today();
    if (startDate < today) startDate = today;

    return _executeWindow(roadmapRecord, startDate, daysCount, opts);
  }

  /* UI-compatible wrapper — parses natural language */
  async function runNextWindow(message, opts) {
    opts = opts || {};
    var roadmapRecord = getActiveRoadmap();
    if (!roadmapRecord) {
      return { ok: false, code: 'no-active-roadmap', message: 'Không tìm thấy kế hoạch tài liệu. Vui lòng tải lên PDF trước.' };
    }

    var cursor = roadmapRecord.cursor || {};
    var startDate = cursor.lastStartDate || _today();
    var daysCount = cursor.lastDaysCount || 7;

    // Parse user request for day count override
    var dayMatch = (message || '').match(/(\d+)\s*(?:ngày|day)/i);
    if (dayMatch) {
      daysCount = Math.min(Math.max(parseInt(dayMatch[1]) || 7, 1), 14);
    }
    if (/tuần\s+tiếp|next\s+week/i.test(message || '')) {
      startDate = _addDays(startDate, daysCount);
      daysCount = 7;
    }

    // Clamp: never schedule in the past
    var today = _today();
    if (startDate < today) startDate = today;

    return _executeWindow(roadmapRecord, startDate, daysCount, opts);
  }

  /* Shared execution for both APIs */
  async function _executeWindow(roadmapRecord, startDate, daysCount, opts) {
    var apiBase = _getApiBase();
    if (!apiBase) return { ok: false, code: 'api-config-missing' };

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
      timeZone: _getTimeZone(),
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

    // Store pending cursor — will only be committed after Apply succeeds.
    // Generate a proposal-scoped ID so unrelated proposals don't affect cursor.
    var proposalId = 'docplan-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    _pendingCursor = {
      proposalId: proposalId,
      source: 'document-daily-plan',
      roadmapId: roadmapRecord.id,
      fromCursor: { nextWeek: roadmapRecord.cursor && roadmapRecord.cursor.nextWeek, lastStartDate: roadmapRecord.cursor && roadmapRecord.cursor.lastStartDate, lastDaysCount: roadmapRecord.cursor && roadmapRecord.cursor.lastDaysCount },
      toCursor: {
        nextWeek: ((roadmapRecord.cursor && roadmapRecord.cursor.nextWeek) || 1) + 1,
        lastStartDate: startDate,
        lastDaysCount: daysCount,
      },
      createdAt: Date.now(),
    };
    _pendingCursorProposalId = proposalId;

    return {
      ok: true,
      proposal: json.proposal,
      meta: json.meta,
      _pendingCursor: _pendingCursor,
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

  /* ---- Cursor transaction (proposal-scoped) ---- */
  function commitPendingCursor(proposalId) {
    // Only commit if proposalId matches (or no proposalId given for backward compat)
    if (!_pendingCursor) return false;
    if (proposalId && _pendingCursor.proposalId !== proposalId) return false;
    if (_pendingCursor.source !== 'document-daily-plan') return false;
    updateCursor(_pendingCursor.roadmapId, _pendingCursor.toCursor);
    var committed = _pendingCursor;
    _pendingCursor = null;
    _pendingCursorProposalId = null;
    return committed;
  }

  function cancelPendingCursor(proposalId) {
    // Only cancel if proposalId matches
    if (!_pendingCursor) return;
    if (proposalId && _pendingCursor.proposalId !== proposalId) return;
    _pendingCursor = null;
    _pendingCursorProposalId = null;
  }

  function getPendingCursor() {
    return _pendingCursor;
  }

  /* ---- Error mapping ---- */
  var ERROR_MESSAGES = {
    'ai-document-no-text': 'Không thể trích xuất văn bản từ tài liệu này.\nVui lòng tải lại file PDF.',
    'ai-roadmap-empty': 'Không tìm thấy kế hoạch đủ rõ trong tài liệu để chia thành lịch hằng ngày.',
    'ai-daily-plan-empty': 'Không thể tạo kế hoạch cho khoảng ngày này.\nVui lòng thử lại với phạm vi ngắn hơn.',
    'ai-daily-plan-invalid': 'Kế hoạch tạo ra không hợp lệ.\nVui lòng thử lại.',
    'ai-daily-plan-no-roadmap': 'Không tìm thấy bản đồ lộ trình.\nVui lòng tải lên PDF trước.',
    'ai-daily-plan-invalid-date': 'Ngày trong kế hoạch không hợp lệ.\nVui lòng thử lại.',
    'ai-daily-plan-all-past-dates': 'Tất cả ngày trong kế hoạch đều đã qua.\nVui lòng yêu cầu kế hoạch mới.',
    'ai-provider-unavailable': 'Dịch vụ AI tạm thời không khả dụng.\nVui lòng thử lại sau.',
    'ai-not-configured': 'AI chưa được cấu hình.\nVui lòng liên hệ quản trị viên.',
    'ai-timeout': 'Yêu cầu AI quá lâu.\nVui lòng thử lại.',
    'ai-rate-limited': 'Đang gửi quá nhiều yêu cầu.\nVui lòng chờ một chút.',
    'ai-document-plan-failed': 'Không thể tạo kế hoạch tài liệu.\nVui lòng thử lại.',
    'ai-daily-plan-failed': 'Không thể tạo kế hoạch hàng ngày.\nVui lòng thử lại.',
    'ai-document-plan-module-missing': 'Module lập kế hoạch tài liệu chưa được tải.\nVui lòng tải lại trang.',
    'no-active-roadmap': 'Không tìm thấy kế hoạch tài liệu.\nVui lòng tải lên PDF trước.',
    'api-config-missing': 'Cấu hình API bị thiếu.\nVui lòng kiểm tra kết nối.',
    'runtime-not-loaded': 'Module AI Runtime chưa được tải.\nVui lòng tải lại trang.',
  };

  function friendlyError(code) {
    return ERROR_MESSAGES[code] || 'Đã xảy ra lỗi.\nVui lòng thử lại.';
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
    // Clear in-memory references and pending cursor when account changes.
    // Do NOT call clearAll() — each account's storage is already scoped
    // via the storage key, so account A's roadmaps remain intact.
    _pendingCursor = null;
  }

  return {
    loadStore: loadStore,
    saveRoadmap: saveRoadmap,
    getActiveRoadmap: getActiveRoadmap,
    updateCursor: updateCursor,
    clearActiveRoadmap: clearActiveRoadmap,
    clearAll: clearAll,
    runInitialDocumentPlan: runInitialDocumentPlan,
    runWindow: runWindow,
    runNextWindow: runNextWindow,
    sendProposalToReview: sendProposalToReview,
    commitPendingCursor: commitPendingCursor,
    cancelPendingCursor: cancelPendingCursor,
    getPendingCursor: getPendingCursor,
    getStatus: getStatus,
    onAccountChange: onAccountChange,
    friendlyError: friendlyError,
    parseDuration: parseDuration,
    isDuplicateTask: isDuplicateTask,
    _getAccountScope: _getAccountScope,
    _getTimeZone: _getTimeZone,
    _today: _today,
    _addDays: _addDays,
    _normalizeText: _normalizeText,
  };
});
