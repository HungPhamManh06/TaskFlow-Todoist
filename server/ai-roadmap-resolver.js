// TaskFlow — Deterministic Roadmap Query Resolver (Phase 9).
// Answers factual roadmap questions without AI provider calls.
// Supports: week lookup, total weeks, current progress, phase info, next week content.
'use strict';

/**
 * Parse a week range string like "1-4", "5–8", "9", "week 10-12" into {start, end}.
 * Supports hyphens, en dashes, and optional "tuần/week" prefix.
 */
function parseWeekRange(str) {
  if (str == null) return null;
  var s = String(str).trim().toLowerCase();
  // Strip optional prefix like "tuần " or "week "
  s = s.replace(/^(?:tuần|week|tu)\s+/i, '');
  // Match patterns: "5-8", "5–8", "5", "5 ~ 8", "5 to 8"
  var m = /^(\d+)\s*(?:[-–—~]|to)\s*(\d+)$/.exec(s);
  if (m) {
    var a = parseInt(m[1], 10);
    var b = parseInt(m[2], 10);
    if (a > 0 && b >= a && b <= 524) return { start: a, end: b };
    return null;
  }
  // Single integer
  m = /^(\d+)$/.exec(s);
  if (m) {
    var n = parseInt(m[1], 10);
    if (n > 0 && n <= 524) return { start: n, end: n };
    return null;
  }
  return null;
}

/**
 * Find which phase contains a given week number.
 */
function findPhaseForWeek(phases, weekNum) {
  if (!Array.isArray(phases) || !weekNum || weekNum < 1) return null;
  for (var i = 0; i < phases.length; i++) {
    var p = phases[i];
    if (!p || !p.weeks) continue;
    var range = parseWeekRange(p.weeks);
    if (range && weekNum >= range.start && weekNum <= range.end) {
      return p;
    }
  }
  return null;
}

/**
 * Format a phase into a readable answer.
 */
function formatPhaseAnswer(phase, weekNum) {
  if (!phase) return null;
  var parts = [];
  if (phase.name) parts.push('Giai đoạn: ' + phase.name);
  if (phase.weeks) parts.push('Tuần: ' + phase.weeks);
  if (phase.goals && phase.goals.length > 0) parts.push('Mục tiêu:\n- ' + phase.goals.join('\n- '));
  if (phase.topics && phase.topics.length > 0) parts.push('Nội dung:\n- ' + phase.topics.join('\n- '));
  if (phase.deliverables && phase.deliverables.length > 0) parts.push('Kết quả:\n- ' + phase.deliverables.join('\n- '));
  return parts.join('\n');
}

// ── Supported deterministic query patterns ──────────────
var WEEK_LOOKUP_PATTERNS = [
  // "Tuần 20 học gì?" / "Tuần 20 là nội dung gì?"
  /(?:tuần|tuan|week)\s+(\d+)(?:\s+[^.!?]{0,30}(?:học|hoc|làm|lam|nội\s*dung|noi\s*dung|chương\s*trình|chuong\s*trinh|gì|gi|nào|nao|gồm\s*gì|gom\s*gi))?/i,
  // "Week 20?" / "Week 20 learn?"
  /(?:week)\s+(\d+)(?:\s+[^.!?]{0,30}(?:learn|study|content|topic|cover|include|about))?/i,
  // "20 tuần" (less common but valid)
  /(\d+)\s+(?:tuần|tuan|week)/i,
];

var TOTAL_WEEKS_PATTERNS = [
  // "Roadmap có bao nhiêu tuần?" / "Tổng cộng bao nhiêu tuần?"
  /(?:roadmap|kế\s*hoạch|ke\s*hoach|lộ\s*trình|lo\s*trinh|tài\s*liệu|tai\s*lieu)\s+[^.!?]{0,30}(?:bao\s*nhieu|bao\s*nhieu|total|how\s*many)\s+(?:tuần|tuan|week)/i,
  /(?:bao\s*nhieu|how\s*many)\s+(?:tuần|tuan|week)/i,
  /(?:tổng\s*cộng|tong\s*cộng|total)\s+[^.!?]{0,20}(?:tuần|tuan|week)/i,
];

var CURRENT_WEEK_PATTERNS = [
  // "Hiện tôi đang ở tuần nào?" / "Tôi đang ở tuần mấy?"
  /(?:hiện|hien|currently|now).{0,20}(?:tuần|tuan|week)\s*(?:nào|nao|mấy|may|what)/i,
  /(?:đang|dang|currently|at).{0,15}(?:tuần|tuan|week)/i,
  /(?:current|present).{0,15}(?:week)/i,
];

var NEXT_WEEK_CONTENT_PATTERNS = [
  // "Tuần tiếp theo là nội dung gì?" / "Tuần tới học gì?"
  /(?:tuần|tuan|week)\s+(?:tiếp|tiep|tới|toi|sau|next)\s+(?:theo|đó|do|sau).{0,30}(?:nội\s*dung|noi\s*dung|học|hoc|làm|lam|gì|gi)/i,
  /(?:tuần|tuan|week)\s+(?:tiếp|tiep|tới|toi|sau|next)/i,
];

var PHASE_LOOKUP_PATTERNS = [
  // "Giai đoạn 2 gồm những gì?" / "Phase 3 học gì?"
  /(?:giai\s*đoạn|giai\s*doan|phase|stage)\s+(\d+)\s*(?:[.!?]|gồm|gom|bao\s*gom|học|hoc|bao\s*gồm|bao\s*gom|nội\s*dung|noi\s*dung|gì|gi)/i,
  /(?:giai\s*đoạn|giai\s*doan|phase|stage)\s+(\d+)/i,
];

/**
 * Deterministic roadmap query resolver.
 * @param {string} text - user message
 * @param {object} roadmap - canonical roadmap object {title, totalWeeks, phases[]}
 * @param {object|null} cursor - {nextWeek, lastAppliedDaysCount} or null
 * @returns {{matched: boolean, answer: string, kind: string}|null}
 */
function resolveRoadmapQuestion(text, roadmap, cursor) {
  if (!text || !roadmap || !roadmap.phases) return null;
  var normalizedText = text.trim();
  var phases = roadmap.phases;
  var totalWeeks = roadmap.totalWeeks || 0;

  // 1. Week lookup: "Tuần 20 học gì?"
  for (var i = 0; i < WEEK_LOOKUP_PATTERNS.length; i++) {
    var m = WEEK_LOOKUP_PATTERNS[i].exec(normalizedText);
    if (m) {
      var weekNum = parseInt(m[1], 10);
      if (weekNum > 0 && weekNum <= 524) {
        if (totalWeeks > 0 && weekNum > totalWeeks) {
          return {
            matched: true,
            answer: 'Roadmap hiện có ' + totalWeeks + ' tuần nên không có tuần ' + weekNum + '.',
            kind: 'week_out_of_range',
          };
        }
        var phase = findPhaseForWeek(phases, weekNum);
        if (phase) {
          var phaseAnswer = formatPhaseAnswer(phase, weekNum);
          return {
            matched: true,
            answer: 'Tuần ' + weekNum + ' thuộc ' + (phase.name || 'giai đoạn này') + ':\n\n' + phaseAnswer,
            kind: 'week_lookup',
          };
        }
        // Week exists in totalWeeks but no phase matched
        return {
          matched: true,
          answer: 'Tuần ' + weekNum + ' nằm trong roadmap nhưng chưa có thông tin chi tiết cho giai đoạn này.',
          kind: 'week_no_detail',
        };
      }
    }
  }

  // 2. Total weeks: "Roadmap có bao nhiêu tuần?"
  for (var j = 0; j < TOTAL_WEEKS_PATTERNS.length; j++) {
    if (TOTAL_WEEKS_PATTERNS[j].test(normalizedText)) {
      if (totalWeeks > 0) {
        return {
          matched: true,
          answer: 'Roadmap "' + (roadmap.title || '') + '" có tổng cộng ' + totalWeeks + ' tuần.',
          kind: 'total_weeks',
        };
      }
    }
  }

  // 3. Current week: "Hiện tôi đang ở tuần nào?"
  for (var k = 0; k < CURRENT_WEEK_PATTERNS.length; k++) {
    if (CURRENT_WEEK_PATTERNS[k].test(normalizedText)) {
      if (cursor && typeof cursor.nextWeek === 'number' && cursor.nextWeek > 0) {
        var currentWeek = cursor.nextWeek;
        return {
          matched: true,
          answer: 'Bạn hiện đang ở tuần ' + currentWeek + ' (tuần tiếp theo được lên lịch).',
          kind: 'current_week',
        };
      }
      if (totalWeeks > 0) {
        return {
          matched: true,
          answer: 'Bạn chưa bắt đầu lên lịch cho roadmap này. Roadmap có ' + totalWeeks + ' tuần.',
          kind: 'current_week_not_started',
        };
      }
    }
  }

  // 4. Next week content: "Tuần tiếp theo học gì?"
  for (var l = 0; l < NEXT_WEEK_CONTENT_PATTERNS.length; l++) {
    if (NEXT_WEEK_CONTENT_PATTERNS[l].test(normalizedText)) {
      if (cursor && typeof cursor.nextWeek === 'number' && cursor.nextWeek > 0) {
        var nextWeek = cursor.nextWeek;
        if (totalWeeks > 0 && nextWeek > totalWeeks) {
          return {
            matched: true,
            answer: 'Bạn đã hoàn thành tất cả ' + totalWeeks + ' tuần trong roadmap.',
            kind: 'next_week_completed',
          };
        }
        var nextPhase = findPhaseForWeek(phases, nextWeek);
        if (nextPhase) {
          return {
            matched: true,
            answer: 'Tuần tiếp theo (tuần ' + nextWeek + '):\n\n' + formatPhaseAnswer(nextPhase, nextWeek),
            kind: 'next_week_content',
          };
        }
      }
    }
  }

  // 5. Phase lookup: "Giai đoạn 2 gồm những gì?"
  for (var n = 0; n < PHASE_LOOKUP_PATTERNS.length; n++) {
    var pm = PHASE_LOOKUP_PATTERNS[n].exec(normalizedText);
    if (pm) {
      var phaseIdx = parseInt(pm[1], 10);
      if (phaseIdx > 0 && phaseIdx <= phases.length) {
        var targetPhase = phases[phaseIdx - 1]; // 1-indexed
        if (targetPhase) {
          return {
            matched: true,
            answer: 'Giai đoạn ' + phaseIdx + ':\n\n' + formatPhaseAnswer(targetPhase, null),
            kind: 'phase_lookup',
          };
        }
      }
      if (phaseIdx > phases.length) {
        return {
          matched: true,
          answer: 'Roadmap chỉ có ' + phases.length + ' giai đoạn. Không có giai đoạn ' + phaseIdx + '.',
          kind: 'phase_out_of_range',
        };
      }
    }
  }

  return null; // no deterministic match → caller should use AI
}

module.exports = {
  parseWeekRange,
  findPhaseForWeek,
  formatPhaseAnswer,
  resolveRoadmapQuestion,
};
