// TaskFlow — Client-side Deterministic Roadmap Query Resolver (Phase 9).
// Answers factual roadmap questions without AI provider calls.
// Matches server-side logic in server/ai-roadmap-resolver.js.
'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowRoadmapResolver = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {

  /**
   * Parse a week range string like "1-4", "5–8", "9", "week 10-12" into {start, end}.
   */
  function parseWeekRange(str) {
    if (str == null) return null;
    var s = String(str).trim().toLowerCase();
    s = s.replace(/^(?:tuần|week|tu)\s+/i, '');
    var m = /^(\d+)\s*(?:[-–—~]|to)\s*(\d+)$/.exec(s);
    if (m) {
      var a = parseInt(m[1], 10);
      var b = parseInt(m[2], 10);
      if (a > 0 && b >= a && b <= 524) return { start: a, end: b };
      return null;
    }
    m = /^(\d+)$/.exec(s);
    if (m) {
      var n = parseInt(m[1], 10);
      if (n > 0 && n <= 524) return { start: n, end: n };
      return null;
    }
    return null;
  }

  function findPhaseForWeek(phases, weekNum) {
    if (!Array.isArray(phases) || !weekNum || weekNum < 1) return null;
    for (var i = 0; i < phases.length; i++) {
      var p = phases[i];
      if (!p || !p.weeks) continue;
      var range = parseWeekRange(p.weeks);
      if (range && weekNum >= range.start && weekNum <= range.end) return p;
    }
    return null;
  }

  function formatPhaseAnswer(phase) {
    if (!phase) return null;
    var parts = [];
    if (phase.name) parts.push('Giai đoạn: ' + phase.name);
    if (phase.weeks) parts.push('Tuần: ' + phase.weeks);
    if (phase.goals && phase.goals.length > 0) parts.push('Mục tiêu:\n- ' + phase.goals.join('\n- '));
    if (phase.topics && phase.topics.length > 0) parts.push('Nội dung:\n- ' + phase.topics.join('\n- '));
    if (phase.deliverables && phase.deliverables.length > 0) parts.push('Kết quả:\n- ' + phase.deliverables.join('\n- '));
    return parts.join('\n');
  }

  var WEEK_PATTERNS = [
    /(?:tuần|tuan|week)\s+(\d+)(?:\s+[^.!?]{0,30}(?:học|hoc|làm|lam|nội\s*dung|noi\s*dung|chương\s*trình|chuong\s*trinh|gì|gi|nào|nao|gồm\s*gì|gom\s*gi))?/i,
    /(?:week)\s+(\d+)(?:\s+[^.!?]{0,30}(?:learn|study|content|topic|cover|include|about))?/i,
    /(\d+)\s+(?:tuần|tuan|week)/i,
  ];

  var TOTAL_WEEKS_PATTERNS = [
    /(?:roadmap|kế\s*hoạch|ke\s*hoach|lộ\s*trình|lo\s*trinh|tài\s*liệu|tai\s*lieu)\s+[^.!?]{0,30}(?:bao\s*nhieu|total|how\s*many)\s+(?:tuần|tuan|week)/i,
    /(?:bao\s*nhieu|how\s*many)\s+(?:tuần|tuan|week)/i,
    /(?:tổng\s*cộng|tong\s*cộng|total)\s+[^.!?]{0,20}(?:tuần|tuan|week)/i,
  ];

  var CURRENT_WEEK_PATTERNS = [
    /(?:hiện|hien|currently|now).{0,20}(?:tuần|tuan|week)\s*(?:nào|nao|mấy|may|what)/i,
    /(?:đang|dang|currently|at).{0,15}(?:tuần|tuan|week)/i,
  ];

  var NEXT_WEEK_PATTERNS = [
    /(?:tuần|tuan|week)\s+(?:tiếp|tiep|tới|toi|sau|next)\s+(?:theo|đó|do|sau).{0,30}(?:nội\s*dung|noi\s*dung|học|hoc|làm|lam|gì|gi)/i,
    /(?:tuần|tuan|week)\s+(?:tiếp|tiep|tới|toi|sau|next)/i,
  ];

  var PHASE_PATTERNS = [
    /(?:giai\s*đoạn|giai\s*doan|phase|stage)\s+(\d+)\s*(?:[.!?]|gồm|gom|bao\s*gom|học|hoc|bao\s*gồm|bao\s*gom|nội\s*dung|noi\s*dung|gì|gi)/i,
    /(?:giai\s*đoạn|giai\s*doan|phase|stage)\s+(\d+)/i,
  ];

  /**
   * Deterministic roadmap query resolver (client-side).
   * @param {string} text - user message
   * @param {object} roadmap - {title, totalWeeks, phases[]}
   * @param {object|null} cursor - {nextWeek, lastAppliedDaysCount}
   * @returns {{matched: boolean, answer: string, kind: string}|null}
   */
  function resolveRoadmapQuestion(text, roadmap, cursor) {
    if (!text || !roadmap || !roadmap.phases) return null;
    var phases = roadmap.phases;
    var totalWeeks = roadmap.totalWeeks || 0;

    for (var i = 0; i < WEEK_PATTERNS.length; i++) {
      var m = WEEK_PATTERNS[i].exec(text);
      if (m) {
        var weekNum = parseInt(m[1], 10);
        if (weekNum > 0 && weekNum <= 524) {
          if (totalWeeks > 0 && weekNum > totalWeeks) {
            return { matched: true, answer: 'Roadmap hiện có ' + totalWeeks + ' tuần nên không có tuần ' + weekNum + '.', kind: 'week_out_of_range' };
          }
          var phase = findPhaseForWeek(phases, weekNum);
          if (phase) {
            return { matched: true, answer: 'Tuần ' + weekNum + ' thuộc ' + (phase.name || 'giai đoạn này') + ':\n\n' + formatPhaseAnswer(phase), kind: 'week_lookup' };
          }
          return { matched: true, answer: 'Tuần ' + weekNum + ' nằm trong roadmap nhưng chưa có thông tin chi tiết.', kind: 'week_no_detail' };
        }
      }
    }

    for (var j = 0; j < TOTAL_WEEKS_PATTERNS.length; j++) {
      if (TOTAL_WEEKS_PATTERNS[j].test(text)) {
        if (totalWeeks > 0) return { matched: true, answer: 'Roadmap "' + (roadmap.title || '') + '" có tổng cộng ' + totalWeeks + ' tuần.', kind: 'total_weeks' };
      }
    }

    for (var k = 0; k < CURRENT_WEEK_PATTERNS.length; k++) {
      if (CURRENT_WEEK_PATTERNS[k].test(text)) {
        if (cursor && typeof cursor.nextWeek === 'number' && cursor.nextWeek > 0) {
          return { matched: true, answer: 'Bạn hiện đang ở tuần ' + cursor.nextWeek + '.', kind: 'current_week' };
        }
        if (totalWeeks > 0) return { matched: true, answer: 'Bạn chưa bắt đầu lên lịch. Roadmap có ' + totalWeeks + ' tuần.', kind: 'current_week_not_started' };
      }
    }

    for (var l = 0; l < NEXT_WEEK_PATTERNS.length; l++) {
      if (NEXT_WEEK_PATTERNS[l].test(text)) {
        if (cursor && typeof cursor.nextWeek === 'number' && cursor.nextWeek > 0) {
          var nw = cursor.nextWeek;
          if (totalWeeks > 0 && nw > totalWeeks) return { matched: true, answer: 'Bạn đã hoàn thành tất cả ' + totalWeeks + ' tuần.', kind: 'next_week_completed' };
          var np = findPhaseForWeek(phases, nw);
          if (np) return { matched: true, answer: 'Tuần tiếp theo (tuần ' + nw + '):\n\n' + formatPhaseAnswer(np), kind: 'next_week_content' };
        }
      }
    }

    for (var n = 0; n < PHASE_PATTERNS.length; n++) {
      var pm = PHASE_PATTERNS[n].exec(text);
      if (pm) {
        var phaseIdx = parseInt(pm[1], 10);
        if (phaseIdx > 0 && phaseIdx <= phases.length) {
          var tp = phases[phaseIdx - 1];
          if (tp) return { matched: true, answer: 'Giai đoạn ' + phaseIdx + ':\n\n' + formatPhaseAnswer(tp), kind: 'phase_lookup' };
        }
        if (phaseIdx > phases.length) return { matched: true, answer: 'Roadmap chỉ có ' + phases.length + ' giai đoạn.', kind: 'phase_out_of_range' };
      }
    }

    return null;
  }

  return {
    parseWeekRange: parseWeekRange,
    findPhaseForWeek: findPhaseForWeek,
    formatPhaseAnswer: formatPhaseAnswer,
    resolveRoadmapQuestion: resolveRoadmapQuestion,
  };
});
