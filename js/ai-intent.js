/**
 * TaskFlow — Deterministic Intent Classifier + Task Entity Resolver (Phase 5B).
 * Pure functions — no LLM, no network, no mutation, no state.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.TaskFlowAIIntent = mod;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Negation markers
  var NEGATION_RE = /(?:^|\s)(?:không|đừng|\bko\b|đéo|chớ|chẳng|thôi|bỏ|huỷ|hủy|\bcancel\b|\bdon'?t\b|do\s+not|\bnever\b|\bstop\b)\s*/i;

  // Hypothetical / conditional
  var HYPOTHETICAL_RE = /(?:nếu(?:\s+(?:tôi|ta)\s+)?|giả\s+sử|giả\s+như|\bsuppose\b|\bassume\b|\bwhat\s+(?:if|happens\s+if)\b|\bimagine\b|\bin\s+case\b|\bif\s+(?:I|we)\b|khi(?:\s+nào)?(?:\s+(?:tôi|ta)\s+)?(?:\s+làm|tạo|đổi|chuyển|xếp))|thì\s+sao|thì\s+sao\s*\?/i;

  // How-to / capability
  var HOWTO_RE = /(?:cách|làm\s+sao|\bhow\s+(?:do|does|can|would|to)\b|làm\s+thế\s+nào|ở\s+đâu|where\s+(?:is|can)|có\s+thể\s+(?:tạo|làm|xóa|đổi)|can\s+(?:I|you|we)\s+(?:create|add|make|delete|change|move|schedule)|trợ\s+lý\s+có\s+thể)/i;

  var QUOTED_ACTION_RE = /["'""''"][^"'""'"]*(?:tạo|hoàn thành|đổi|chuyển|xếp|create|complete|move|schedule|update)[^"'""'"]*["'""'"]/i;

  // Action patterns
  var CREATE_RE = /(?:^|\s)(?:tạo|thêm|add|create|new|làm\s+mới|tạo\s+thêm)\s+(?:một\s+|an?\s+)?(?:task|công\s+việc|việc|todo|work|nhiệm\s+vụ)/i;
  var COMPLETE_RE = /(?:^|\s)(?:hoàn\s+thành|hoàn\s+tất|đánh\s+dấu[\s\S]*xong|mark[\s\S]*(?:done|complete)|\bcomplete\b|\bfinish\b|\bxong\b|\bdone\b|ok\s+roi|ok\s+rồi|đã\s+xong|đã\s+hoàn\s+thành)/i;
  var SCHEDULE_RE = /(?:^|\s)(?:xếp|sắp\s+lịch|lên\s+lịch|\bschedule\b|\bbook\b|đặt\s+giờ|đặt\s+lịch)|vào\s+lúc\s*\d{1,2}|vào\s+\d{1,2}\s*h|(?:lúc|khoảng|khoảng\s+lúc)\s*\d{1,2}/i;
  var RESCHEDULE_RE = /(?:chuyển|dời|\breschedule\b|\bmove\b)\s+(?:task|công\s+việc|việc|todo|work)|chuyển\s+sang|dời\s+sang|đổi\s+ngày|đổi\s+lịch|\bmove\b[\s\S]+\bto\b|\breschedule\b[\s\S]+\bto\b/i;
  var UPDATE_RE = /(?:ưu\s+tiên\s+cao|ưu\s+tiên\s+thấp|\bpriority\b|\bđổi\b[\s\S]*(?:thời\s+lượng|duration|tên|rename|deadline|ngày)|set[\s\S]*(?:priority|duration)|đổi\s+thành|\brename\b|thay\s+đổi|\bchange\b|\bupdate\b)/i;

  // Bare detectors (missing params) — handle trailing period
  var CREATE_BARE_RE = /^(?:tạo|thêm|add|create|new)(?:\s+(?:task|công\s+việc|việc|todo|work))?\s*[.!]*\s*$/i;
  var MOVE_BARE_RE = /^(?:chuyển|dời|move)\s+(?:task|công\s+việc|việc)?\s*[.!]*\s*$/i;
  var SCHEDULE_BARE_RE = /^(?:xếp|schedule|đặt\s+lịch)\s+(?:task|công\s+việc|việc)?\s*[.!]*\s*$/i;
  var UPDATE_BARE_RE = /^(?:đổi|change|update)\s+(?:task|công\s+việc|việc)?\s*[.!]*\s*$/i;

  // Read-only patterns
  var READONLY_RE = /(?:còn\s+(?:task|việc|công\s+việc|bao\s+nhiêu)|bao\s+nhiêu\s+(?:task|việc|mấy)|mấy\s+(?:task|việc)|rảnh\s+lúc\s+nào|thế\s+nào|đã\s+xong|tiến\s+độ|tình\s+hình|\bis\s+\w+\s+(?:completed?|done|finished|xong)\??|\bwhat\s+tasks?\b|\bhow\s+many\s+(?:task|work|việc)\b|\bshow\s+me\s+(?:my\s+)?(?:task|schedule|work|việc|lịch)\b|\blist\s+(?:task|work|việc)\b)/i;
  var QUESTION_RE = /\?\s*$/;
  var TASKFLOW_KEYWORDS_RE = /(?:\btask\b|công\s+việc|việc|dự\s+án|\bproject\b|\blịch\b|\bschedule\b|\bdeadline\b|tuần|\bweek\b|\btoday\b|hôm\s+nay|thói\s+quen|\bhabit\b|\bmilestone\b|\bpriority\b|ưu\s+tiên|\bdatabase\b|\brảnh\b)/i;

  // Ambiguous verbs — indicate unclear intent
  var AMBIGUOUS_VERB_RE = /^(?:làm|xử\s+lý|xử\s+ly|take\s+care\s+of|handle)\s/i;
  // "Đổi task X" without specific change type is ambiguous
  var AMBIGUOUS_DOI_RE = /^đổi\s+(?:task|công\s+việc|việc)?\s*\S/i;

  function classifyIntent(message, tasks) {
    var s = String(message || '').trim();
    if (!s) return { kind: 'chat', actionType: null, confidence: 'high', reason: 'empty-message' };

    if (QUOTED_ACTION_RE.test(s)) return { kind: 'chat', actionType: null, confidence: 'high', reason: 'quoted-action-text' };
    if (HYPOTHETICAL_RE.test(s)) return { kind: 'chat', actionType: null, confidence: 'high', reason: 'hypothetical' };
    if (_hasNegation(s) && _detectActionType(s)) return { kind: 'chat', actionType: null, confidence: 'high', reason: 'negated-action' };
    if (HOWTO_RE.test(s)) return { kind: 'chat', actionType: null, confidence: 'high', reason: 'how-to-question' };
    if (AMBIGUOUS_VERB_RE.test(s)) return { kind: 'clarify', actionType: null, confidence: 'medium', reason: 'ambiguous-task' };
    // "Đổi task X" without specific change type → ambiguous
    if (AMBIGUOUS_DOI_RE.test(s) && !/(?:thời\s+lượng|duration|tên|rename|deadline|ngày|thành|priority)/i.test(s)) {
      return { kind: 'clarify', actionType: 'update_task', confidence: 'medium', reason: 'missing-parameter' };
    }

    // Read-only query check BEFORE action detection for questions
    // "Task Database đã xong chưa?" → read, not complete_task
    if (QUESTION_RE.test(s) || READONLY_RE.test(s)) {
      if (READONLY_RE.test(s) || TASKFLOW_KEYWORDS_RE.test(s)) {
        return { kind: 'read', actionType: null, confidence: 'high', reason: 'read-only-query' };
      }
    }

    var actionType = _detectActionType(s);
    if (!actionType) {
      return { kind: 'chat', actionType: null, confidence: 'high', reason: 'general-question' };
    }

    var taskName = _extractTaskName(s, actionType);

    // Missing parameter checks (bare = just verb + optional "task" with no specific target)
    if (actionType === 'create_task' && CREATE_BARE_RE.test(s)) return { kind: 'clarify', actionType: 'create_task', confidence: 'high', reason: 'missing-task-text' };
    if (actionType === 'reschedule_task' && MOVE_BARE_RE.test(s) && !taskName) return { kind: 'clarify', actionType: 'reschedule_task', confidence: 'high', reason: 'missing-target' };
    if (actionType === 'schedule_task' && SCHEDULE_BARE_RE.test(s) && !taskName) return { kind: 'clarify', actionType: 'schedule_task', confidence: 'high', reason: 'missing-target' };
    if (actionType === 'update_task' && UPDATE_BARE_RE.test(s) && !taskName) return { kind: 'clarify', actionType: 'update_task', confidence: 'high', reason: 'missing-parameter' };

    // Entity resolution for non-create actions
    if (tasks && taskName && actionType !== 'create_task') {
      var resolution = resolveTaskReference(taskName, tasks);
      if (resolution.status === 'ambiguous') return { kind: 'clarify', actionType: actionType, confidence: 'medium', reason: 'ambiguous-task', taskHint: taskName, candidates: resolution.candidates };
      if (resolution.status === 'not-found') return { kind: 'clarify', actionType: actionType, confidence: 'medium', reason: 'not-found', taskHint: taskName };
      return { kind: 'agent', actionType: actionType, confidence: 'high', reason: 'explicit-' + actionType.replace('_task', ''), taskHint: taskName, resolvedTask: resolution.task };
    }

    return { kind: 'agent', actionType: actionType, confidence: 'high', reason: 'explicit-' + actionType.replace('_task', ''), taskHint: taskName || undefined };
  }

  function _detectActionType(s) {
    if (CREATE_RE.test(s)) return 'create_task';
    if (COMPLETE_RE.test(s)) return 'complete_task';
    if (RESCHEDULE_RE.test(s)) return 'reschedule_task';
    if (SCHEDULE_RE.test(s)) return 'schedule_task';
    if (UPDATE_RE.test(s)) return 'update_task';
    return null;
  }

  function _hasNegation(msg) { return NEGATION_RE.test(msg); }

  // Generic task words that are NOT specific task references
  var GENERIC_TASK_RE = /^(?:task|công\s+việc|việc|todo|work|nhiệm\s+vụ)$/i;
  // Time/direction words that are NOT task names
  var TIME_DIR_RE = /^(?:lúc|khoảng|vào|sang|đến|to|at|từ|from)\s/i;

  function _extractTaskName(msg, actionType) {
    var s = String(msg || '').trim();
    if (!s) return '';
    if (actionType === 'create_task') {
      var m = s.match(/(?:tạo|thêm|add|create|new|làm\s+mới)\s+(?:task|công\s+việc|việc|todo|work|nhiệm\s+vụ)?\s*(.+)/i);
      if (!m || !m[1]) return '';
      var name = m[1].trim().replace(/[.!]+$/, '').trim();
      // Strip trailing time/direction/number patterns
      name = name.replace(/\s+(?:lúc|khoảng|vào|từ|\d+\s*(?:phút|tiếng|h|hours?|minutes?)).*$/, '').trim();
      return name.length > 0 && name.length <= 200 ? name : '';
    }
    var patterns = [
      /(?:hoàn\s+thành|hoàn\s+tất|xong|complete|finish)\s+(.+)/i,
      /(?:chuyển|dời|move)\s+(?:task|công\s+việc|việc)?\s*(.+?)(?:\s+sang|\s+đến|\s+to|\s*$)/i,
      /(?:xếp|schedule|đặt\s+lịch)\s+(?:task|công\s+việc|việc)?\s*(.+?)(?:\s+vào|\s+lúc|\s+khoảng|\s+at|\s*$)/i,
      /(?:đổi|change|update)\s+(?:task|công\s+việc|việc)?\s*(.+)/i,
      /(?:đánh\s+dấu|mark)\s+(.+?)(?:\s+là|\s+as|\s+xong|\s+done|\s+complete|\s*$)/i,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var pm = s.match(patterns[i]);
      if (pm && pm[1]) {
        var raw = pm[1].trim().replace(/[.!]+$/, '').trim();
        // Strip trailing direction/time patterns
        raw = raw.replace(/\s+(?:sang|đến|to|lúc|khoảng|at|vào|từ|from)\s.*$/, '').trim();
        if (raw.length === 0 || GENERIC_TASK_RE.test(raw) || TIME_DIR_RE.test(raw)) continue;
        if (raw.length <= 200) return raw;
      }
    }
    return '';
  }

  function _normalize(str) {
    return String(str || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  }

  function resolveTaskReference(query, tasks) {
    if (!query || !Array.isArray(tasks) || !tasks.length) return { status: 'not-found' };
    var q = _normalize(query);
    if (!q) return { status: 'not-found' };
    var matches = [];
    for (var i = 0; i < tasks.length; i++) {
      var tk = tasks[i];
      if (!tk || typeof tk !== 'object') continue;
      var text = typeof tk.text === 'string' ? tk.text : '';
      if (!text) continue;
      var norm = _normalize(text);
      if (norm === q) { matches.push({ task: tk, score: 100 }); continue; }
      if (text.toLowerCase().trim() === String(query).toLowerCase().trim()) { matches.push({ task: tk, score: 95 }); continue; }
      if (norm.includes(q) && q.length >= 3) { matches.push({ task: tk, score: 80 + Math.min(q.length / norm.length * 20, 20) }); continue; }
      var qTokens = q.split(/\s+/).filter(function (t) { return t.length >= 2; });
      var tTokens = norm.split(/\s+/).filter(function (t) { return t.length >= 2; });
      if (qTokens.length > 0) {
        // Require at least one token with length >= 4 to avoid common-word false positives
        var overlap = qTokens.filter(function (qt) { return qt.length >= 4 && tTokens.some(function (tt) { return tt.includes(qt) || qt.includes(tt); }); });
        var meaningfulCount = qTokens.filter(function (qt) { return qt.length >= 4; }).length;
        if (meaningfulCount > 0 && overlap.length >= meaningfulCount) {
          matches.push({ task: tk, score: 60 + overlap.length / meaningfulCount * 30 });
        } else if (overlap.length >= Math.ceil(qTokens.length * 0.7) && qTokens.length >= 2) {
          matches.push({ task: tk, score: 50 + overlap.length / qTokens.length * 20 });
        }
      }
    }
    if (matches.length === 0) return { status: 'not-found' };
    matches.sort(function (a, b) { return b.score - a.score; });
    if (matches.length === 1 || (matches[0].score >= 80 && (matches.length < 2 || matches[0].score - matches[1].score >= 20))) {
      return { status: 'resolved', task: matches[0].task };
    }
    if (matches.length > 1 && matches[0].score - matches[1].score < 20) {
      return { status: 'ambiguous', candidates: matches.slice(0, 5).map(function (m) { return { task: m.task, label: _candidateLabel(m.task) }; }) };
    }
    return { status: 'resolved', task: matches[0].task };
  }

  function _candidateLabel(task) {
    if (!task) return '';
    var text = typeof task.text === 'string' ? task.text : '';
    var parts = [text];
    if (task.deadline) parts.push(task.deadline);
    else if (task.date) parts.push(task.date);
    if (task.projectTitle) parts.push(task.projectTitle);
    return parts.filter(Boolean).join(' · ');
  }

  function isActionIntent(message) { return classifyIntent(message).kind === 'agent'; }

  /* ===================================================================
   Phase 6D: File Intent Classifier (deterministic, no LLM)
   Classifies a file-attached message as READ / AGENT / CLARIFY.
   =================================================================== */
  // Action verb patterns for file context
  var FILE_ACTION_RE = /(?:tạo|thêm|add|create|new|lập|trích|xếp|đặt|schedule|import|chèn|insert|đưa\s+vào|gắn|classifyFileIntent|add\s+to|create\s+(?:task|deadline|event|todo)|make\s+(?:task|event|todo)|extract\s+(?:task|deadline|todo)|schedule\s+(?:these|all|every)|plan|lên\s+kế\s+hoạch|xếp\s+lịch|lập\s+lịch|lập\s+kế\s+hoạch)\s*(?:task|công\s+việc|việc|deadline|sự\s+kiện|todo|event|schedule|lịch|kế\s+hoạch|plan|assignment|bài|bài\s+tập)?/i;
  // File-specific context: mention of file/upload
  var FILE_CONTEXT_RE = /(?:file|tài\s+liệu|document|pdf|syllabus|assignment|chương|trang|page|chụp|screenshot|ảnh|image| ảnh|\bpdf\b|\btxt\b|\bmd\b|\bdoc\b|\bimg\b)/i;
  // Negation
  var FILE_NEGATION_RE = /(?:không|đừng|\bko\b|chớ|chẳng|thôi|\bno\b|\bdo\s+not\b|\bdon'?t\b|\bnever\b|\bstop\b|\bskip\b|\bkhông\s+cần\b|\bchỉ\s+(?:tóm\s+tắt|giải\s+thích|đọc|liệt\s+kê|describe|summarize|explain|read|list))\s*(?:tạo|thêm|create|add|schedule|xếp|lập|delete|remove|update|modify)?/i;
  // Hypothetical
  var FILE_HYPOTHETICAL_RE = /(?:nếu(?:\s+(?:tôi|ta)\s+)?|giả\s+sử|giả\s+như|\bsuppose\b|\bassume\b|\bwhat\s+(?:if|happens\s+if)\b|\bimagine\b|thì\s+sao|\bhow\s+(?:would|could|can)\s+you|\bcó\s+thể\s+(?:tạo|làm|xóa))/i;
  // Ambiguous — no clear action or read intent
  var FILE_AMBIGUOUS_RE = /^(?:làm|xử\s+lý|handle|deal\s+with|take\s+care|help|giúp)(?:\s+[^\n]*)?\s*[.!?]*\s*$/i;

  function classifyFileIntent(message, hasFile) {
    var s = String(message || '').trim();
    if (!s) return { kind: 'clarify', confidence: 'medium', reason: 'empty-file-message' };
    if (!hasFile) return { kind: 'read', confidence: 'high', reason: 'no-file-attached' };

    // P8: negation always → READ
    if (FILE_NEGATION_RE.test(s)) return { kind: 'read', confidence: 'high', reason: 'file-negation' };
    // P9: hypothetical always → READ
    if (FILE_HYPOTHETICAL_RE.test(s)) return { kind: 'read', confidence: 'high', reason: 'file-hypothetical' };

    // P10: ambiguous → CLARIFY
    if (FILE_AMBIGUOUS_RE.test(s)) return { kind: 'clarify', confidence: 'medium', reason: 'file-ambiguous' };

    // High-confidence action: explicit action verb + file context or explicit mutation keywords
    var hasActionVerb = FILE_ACTION_RE.test(s);
    var hasFileContext = FILE_CONTEXT_RE.test(s);

    if (hasActionVerb && hasFileContext) {
      return { kind: 'agent', confidence: 'high', reason: 'file-action-with-context' };
    }
    if (hasActionVerb) {
      // Action verb present but no explicit file context — still agent if intent is clear
      return { kind: 'agent', confidence: 'high', reason: 'file-action-verb' };
    }

    // Default: READ (safe default — never infer mutation intent)
    return { kind: 'read', confidence: 'high', reason: 'file-read-default' };
  }

  /* ===================================================================
   Phase 6F: Proposal Refinement Classifier (P7)
   =================================================================== */
  var CONFIRM_KEYWORDS_RE = /(?:áp\s+dụng|tạo\s+làm|làm\s+làm|confirm|execute|apply|ship\s+it|go\s+ahead|yes|ok|\blàm\b|\btạo\b|\bxác\s+nhận\b|\bthực\s+hiện\b)/i;
  var CANCEL_KEYWORDS_RE = /(?:hủy\s+đề\s+xuất|huỷ\s+đề\s+xuất|cancel|discard|bỏ\s+đề\s+xuất)/i;
  var SELECT_RE = /(?:chọn|giữ|lấy|keep|select)\s+(?:tất\s+cả|all|mọi|\*|everything)/i;
  var DESELECT_RE = /(?:bỏ|xóa|xoá|loại\s+bỏ|remove|deselect|drop)\s+(?:tất\s+cả|all|mọi|\*|everything)/i;
  var SELECT_ONLY_RE = /(?:chỉ|only|giữ\s+lại|chỉ\s+giữ|keep\s+only)\s+(.+?)(?:\s*$)/i;
  var BULK_SET_RE = /(?:đổi|thay\s+đổi|set|change|đặt|cho)\s+(?:tất\s+cả|all|mọi|\*|everything|các|những)\s+(?:task|việc|action|thành|\bto\b|\binto\b)\s*(.+)/i;
  var SINGLE_EDIT_RE = /(?:đổi|thay\s+đổi|set|change|đặt)\s+(?:task|việc)?\s*(?:thứ\s+)?(\d+|đầu|cuối|first|last|\d+st|\d+nd|\d+rd|\d+th)\s+(?:thành|\bto\b|\binto\b)\s*(.+)/i;
  var BULK_SELECT_INDEX_RE = /(?:chọn|giữ|lấy|keep|select)\s+(?:\d+\s+(?:task|việc)\s+(?:đầu|cuối|first|last)|(?:\d+)\s+(?:đầu|cuối|first|last))/i;

  function classifyProposalMessage(message) {
    var s = String(message || '').trim();
    if (!s) return { kind: 'normal-chat', confidence: 'high', reason: 'empty-message' };

    // P22: confirm attempt → BLOCK
    if (CONFIRM_KEYWORDS_RE.test(s)) return { kind: 'confirm-attempt', confidence: 'high', reason: 'confirm-keyword' };

    // P24: cancel
    if (CANCEL_KEYWORDS_RE.test(s)) return { kind: 'cancel', confidence: 'high', reason: 'cancel-keyword' };

    // P16: select all
    if (SELECT_RE.test(s)) return { kind: 'refine', operationHint: 'select-all', confidence: 'high', reason: 'select-all' };

    // P16: deselect all
    if (DESELECT_RE.test(s)) return { kind: 'refine', operationHint: 'deselect-all', confidence: 'high', reason: 'deselect-all' };

    // P16: filter-like commands (must be before select-only to avoid false match)
    if (/(?:chỉ\s+giữ|keep\s+only|chỉ\s+lấy).*(?:deadline|ngày\s+hạn|có\s+ngày)/i.test(s))
      return { kind: 'refine', operationHint: 'filter-date', confidence: 'high', reason: 'filter-date' };

    // P11: select only specific indexes
    if (SELECT_ONLY_RE.test(s)) return { kind: 'refine', operationHint: 'select-only', confidence: 'high', reason: 'select-only' };

    // P15: bulk set (all tasks to X duration/priority/date)
    if (BULK_SET_RE.test(s)) return { kind: 'refine', operationHint: 'bulk-set', confidence: 'high', reason: 'bulk-set' };

    // P14: single task edit
    if (SINGLE_EDIT_RE.test(s)) return { kind: 'refine', operationHint: 'single-edit', confidence: 'high', reason: 'single-edit' };

    // P11: single select by index
    if (/(?:chọn|giữ|lấy|keep|select)\s+(?:task|việc)?\s*(?:thứ\s+)?(\d+|đầu|cuối)/i.test(s))
      return { kind: 'refine', operationHint: 'select', confidence: 'high', reason: 'select-index' };

    // P12: single deselect by index
    if (/(?:bỏ|xóa|xoá|loại\s+bỏ|remove|deselect)\s+(?:task|việc)?\s*(?:thứ\s+)?(\d+|đầu|cuối)/i.test(s))
      return { kind: 'refine', operationHint: 'deselect', confidence: 'high', reason: 'deselect-index' };

    // P17: reorder
    if (/(?:đưa|đặt|move|put)\s+(?:task|việc)?\s*(?:thứ\s+)?(\d+|đầu|cuối).*(?:lên|xuống|trước|sau|to\s+(?:top|bottom)|before|after)/i.test(s))
      return { kind: 'refine', operationHint: 'reorder', confidence: 'medium', reason: 'reorder' };

    // P25: questions during review
    if (/\?$/.test(s) && /(?:tại\s+sao|why|ai|task\s+nào|có\s+task|bao\s+nhiêu|thứ\s+mấy)/i.test(s))
      return { kind: 'question', confidence: 'medium', reason: 'review-question' };

    // Phase 6G: expansion — adding new actions
    if (/(?:chia|decompose|break|split)/i.test(s))
      return { kind: 'expand', operationHint: 'decompose', confidence: 'high', reason: 'decompose' };
    if (/(?:thêm|add|tạo\s+thêm|create|new)\s+(?:task|việc)/i.test(s))
      return { kind: 'expand', operationHint: 'add', confidence: 'high', reason: 'add-task' };

    // P28: complex → needs AI
    return { kind: 'refine', operationHint: 'complex', confidence: 'low', reason: 'complex-refinement' };
  }

  /** P26: Classify planning intent */
  function classifyPlanningIntent(message, hasPendingProposal) {
    var s = String(message || '').trim();
    if (!s) return { kind: 'clarify', confidence: 'low', reason: 'empty' };

    // P25: convert-plan → only when pending plan exists
    if (hasPendingProposal && /(?:đưa|chuyển|convert).*(?:đề\s+xuất|proposal)/i.test(s))
      return { kind: 'convert-plan', confidence: 'high', reason: 'convert-plan' };

    // P4: Recovery intent — explicit user recovery request
    if (/(?:bỏ\s+lỡ|missed|không\s+được|chưa\s+làm|xếp\s+lại|xếp\s+phần|replan|recovery|phục\s+hồi|sắp\s+xếp\s+lại)/i.test(s))
      return { kind: 'recover', confidence: 'high', reason: 'recovery-request' };
    if (/(?:bận|busy|không\s+rảnh|đổi\s+lịch|hủy\s+phiên)/i.test(s) &&
        /(?:xếp|lịch|plan|học|session)/i.test(s))
      return { kind: 'recover', confidence: 'high', reason: 'recovery-availability' };
    if (/(?:còn\s+lại|remaining|phần\s+còn|tiếp\s+tục|continue)/i.test(s) &&
        /(?:xếp|lịch|plan|học)/i.test(s))
      return { kind: 'recover', confidence: 'high', reason: 'recovery-remaining' };
    if (/(?:deadline|trễ|late|risk|nguy\s+cơ)/i.test(s) &&
        /(?:xếp|lịch|plan|học|task)/i.test(s))
      return { kind: 'recover', confidence: 'medium', reason: 'recovery-deadline-risk' };

    // P48: what-if recovery
    if (/(?:nếu|what\s*if).*(?:nghỉ|miss|bỏ|skip|rest)/i.test(s))
      return { kind: 'recover-what-if', confidence: 'high', reason: 'what-if-recovery' };
    if (/(?:nếu|what\s*if).*(?:thì\s+sao|what|happen)/i.test(s) &&
        /(?:bận|busy|nghỉ|miss|bỏ|skip)/i.test(s))
      return { kind: 'recover-what-if', confidence: 'high', reason: 'what-if-recovery' };

    // P5: read-only analysis questions
    if (/(?:đang\s+chậm|how\s+far|bao\s+nhiêu|how\s+much|còn\s+lại)/i.test(s) &&
        /(?:task|việc|kế\s*hoạch|plan|chậm|behind|trễ)/i.test(s))
      return { kind: 'question', confidence: 'medium', reason: 'recovery-analysis' };

    // P27: negation → read-only what-if
    if (/(?:đừng|không\s+cần|chỉ\s+cho|don't|just\s+show).*(?:lịch|kế\s*hoạch|plan)/i.test(s))
      return { kind: 'what-if', confidence: 'high', reason: 'negation-plan' };

    // P28: what-if / hypothetical
    if (/(?:nếu|nếu\s+như|what\s*if|suppose|giả\s+sử)/i.test(s) &&
        /(?:xếp|lịch|schedule|plan|học|luyện|ôn|thời\s*gian)/i.test(s))
      return { kind: 'what-if', confidence: 'high', reason: 'what-if' };
    if (/(?:nếu|what\s*if).*(?:thì\s+sao|what|happen)/i.test(s) &&
        /(?:xếp|lịch|plan|học)/i.test(s))
      return { kind: 'what-if', confidence: 'medium', reason: 'hypothetical-plan' };

    // P52: plan refinement (move/reschedule sessions)
    if (/(?:dời|đổi|chuyển|move|swap).*(?:phiên|session|ngày|day|thứ)/i.test(s))
      return { kind: 'refine-plan', confidence: 'high', reason: 'refine-plan' };

    // P26: plan intent
    if (/(?:lên\s+kế\s*hoạch|xếp\s+lịch|lịch\s+học|schedule|plan|up\s+plan|lên\s+lịch|tạo\s+lịch|học\s+kế|lập\s+kế)/i.test(s))
      return { kind: 'plan', confidence: 'high', reason: 'plan-request' };
    if (/(?:kế\s*hoạch|planning|thời\s+gian\s+học|study\s+plan)/i.test(s))
      return { kind: 'plan', confidence: 'medium', reason: 'plan-keyword' };

    return { kind: 'none', confidence: 'low', reason: 'not-planning' };
  }

  /** P28: Classify plan health intent */
  function classifyPlanHealthIntent(message, hasPendingPlan) {
    var s = String(message || '').trim();
    if (!s) return { kind: 'clarify', confidence: 'low', reason: 'empty' };

    // P29: Health check
    if (/(?:kiểm\s+tra|check|checkup|xem|review).*(?:kế\s*hoạch|plan|lịch|schedule)/i.test(s))
      return { kind: 'health-check', confidence: 'high', reason: 'health-check' };
    if (/(?:kế\s*hoạch|plan|lịch|schedule).*(?:ổn\s+không|thế\s+nào|tình\s+hình|sức\s+khỏe|health)/i.test(s))
      return { kind: 'health-check', confidence: 'high', reason: 'health-check' };
    if (/sức\s+khỏe\s+kế\s*hoạch/i.test(s))
      return { kind: 'health-check', confidence: 'high', reason: 'health-check' };

    // P30: Risk question
    if (/(?:task|việc)\s+nào\s+(?:có\s+nguy\s+cơ|trễ|rủi\s+ro|risky)/i.test(s))
      return { kind: 'risk-question', confidence: 'high', reason: 'risk-question' };
    if (/(?:ngày\s+nào|ngày\s+nào)\s+(?:quá\s+tải|overloaded|bận)/i.test(s))
      return { kind: 'risk-question', confidence: 'high', reason: 'overload-question' };
    if (/(?:còn\s+đủ|đủ\s+thời\s+gian|có\s+đủ|còn\s+thời\s+gian)/i.test(s) &&
        /(?:không|ko|không\s+a|không?)\s*\?/i.test(s))
      return { kind: 'risk-question', confidence: 'high', reason: 'capacity-question' };
    if (/(?:nguy\s+cơ\s+trễ|deadline\s+(?:trễ|sắp)|trễ\s+deadline)/i.test(s))
      return { kind: 'risk-question', confidence: 'high', reason: 'deadline-risk' };

    // P31: What-if risk
    if (/(?:nếu|what\s*if).*(?:nghỉ|mất|lose|mất\s+phiên)/i.test(s) &&
        /(?:thì\s+sao|thế\s+nào|sao|what\s*happen|rủi\s+ro|risky)/i.test(s))
      return { kind: 'what-if-risk', confidence: 'high', reason: 'what-if-risk' };
    if (/(?:nếu|what\s*if).*(?:thứ\s+Sáu|friday|tối|evening)/i.test(s) &&
        /(?:bị\s+ảnh\s+hưởng|rủi\s+ro|risky|trễ)/i.test(s))
      return { kind: 'what-if-risk', confidence: 'high', reason: 'what-if-risk' };

    // P32: Mitigation
    if (/(?:cách\s+giảm|giảm\s+nguy\s+cơ|cần\s+chỉnh|phải\s+làm|should\s+I)/i.test(s) &&
        /(?:rủi\s+ro|trễ|risky|deadline)/i.test(s))
      return { kind: 'mitigation', confidence: 'high', reason: 'mitigation-request' };
    if (/(?:giảm\s+nguy\s+cơ|cải\s+thiện|improve|fix).*(?:trễ|rủi\s+ro|risky)/i.test(s))
      return { kind: 'mitigation', confidence: 'medium', reason: 'mitigation-keyword' };

    return { kind: 'none', confidence: 'low', reason: 'not-health-check' };
  }

  return { classifyIntent: classifyIntent, resolveTaskReference: resolveTaskReference, isActionIntent: isActionIntent, classifyFileIntent: classifyFileIntent, classifyProposalMessage: classifyProposalMessage, classifyPlanningIntent: classifyPlanningIntent, classifyPlanHealthIntent: classifyPlanHealthIntent, _normalize: _normalize, _candidateLabel: _candidateLabel, _extractTaskName: _extractTaskName };
});
