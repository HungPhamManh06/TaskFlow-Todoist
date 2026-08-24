/* TaskFlow — deterministic dated-document planner.
   ------------------------------------------------
   Some roadmap PDFs already contain an explicit calendar table. For those
   documents, copying the dated rows is safer and more reliable than asking an
   LLM to reconstruct the same schedule. Generic/undated documents continue
   through the AI roadmap pipeline. */
'use strict';

const MAX_DATED_TASKS = 400;
const MAX_TASK_TEXT = 300;
const DEFAULT_DURATION_MINUTES = 90;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function calendarDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 2020 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return y + '-' + pad2(m) + '-' + pad2(d);
}

function parseDocumentDateRange(text) {
  const source = typeof text === 'string' ? text : '';
  const match = source.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!match) return null;
  const start = calendarDate(match[3], match[2], match[1]);
  const end = calendarDate(match[6], match[5], match[4]);
  if (!start || !end || end < start) return null;
  return { start, end, startYear: Number(match[3]), endYear: Number(match[6]) };
}

function resolveDateInRange(day, month, explicitYear, range, previousDate) {
  const years = explicitYear
    ? [Number(explicitYear)]
    : Array.from({ length: range.endYear - range.startYear + 1 }, (_, index) => range.startYear + index);
  for (const year of years) {
    const candidate = calendarDate(year, month, day);
    if (!candidate || candidate < range.start || candidate > range.end) continue;
    if (previousDate && candidate < previousDate) continue;
    return candidate;
  }
  return null;
}

function cleanTaskText(value) {
  return String(value || '')
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, ' ')
    .replace(/\bTrang\s+\d+\b/gi, ' ')
    .replace(/Ngày\s+Nội dung học\s*\/\s*thực hành\s+Done/gi, ' ')
    .replace(/^\s*(?:T[2-7]|CN)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TASK_TEXT);
}

function normalizeTaskIdentity(value) {
  let text = String(value || '');
  try { text = text.normalize('NFKC'); } catch (_) { /* older runtimes */ }
  return text.toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
}

function collectRowDateMatches(segment, tableHeaderIndex) {
  // Prefer dates at the start of a table row. A task description may itself
  // mention another date (for example "chuẩn bị deadline 26/08"); treating the
  // last date in the whole segment as the row date corrupts both date and text.
  const rowDateMatches = Array.from(segment.matchAll(
    /^[ \t]*(?:(?:T[2-7]|CN)[ \t]*(?:\r?\n[ \t]*)?)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/gim,
  )).filter((match) => {
    const afterMatch = segment.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 32);
    return !/^\s*[-–—]\s*\d{1,2}\/\d{1,2}/.test(afterMatch);
  });
  const allDateMatches = Array.from(segment.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g));
  const preferred = rowDateMatches.length ? rowDateMatches : allDateMatches;
  return tableHeaderIndex >= 0
    ? preferred.filter((match) => (match.index || 0) > tableHeaderIndex)
    : preferred;
}

function inferDuration(text) {
  const match = String(text || '').match(/\b(\d{1,3})\s*phút\b/i);
  if (!match) return DEFAULT_DURATION_MINUTES;
  return Math.min(Math.max(Number(match[1]) || DEFAULT_DURATION_MINUTES, 20), 120);
}

function extractTitle(text, fallbackName) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const preferred = lines.find((line) => /(?:kế hoạch|roadmap)/i.test(line) && !/^Trang\s+\d+$/i.test(line));
  return String(preferred || fallbackName || 'Kế hoạch từ tài liệu').replace(/\s+/g, ' ').slice(0, 200);
}

function extractDatedDocumentTasks(text) {
  const source = typeof text === 'string' ? text : '';
  const range = parseDocumentDateRange(source);
  if (!range || !/\[\s*\]/.test(source)) return [];

  const tasks = [];
  const seen = new Set();
  let currentWeek = null;
  let previousDate = null;
  let pendingTask = null;
  const segments = source.split(/\[\s*\]/);

  function appendTask(date, taskText, week) {
    if (tasks.length >= MAX_DATED_TASKS) return false;
    if (!date || !taskText || taskText.length < 2) return false;
    const key = date + '|' + normalizeTaskIdentity(taskText);
    if (seen.has(key)) return false;
    seen.add(key);
    previousDate = date;
    tasks.push({
      date,
      text: taskText,
      duration: inferDuration(taskText),
      week: Number.isInteger(week) && week > 0 ? week : null,
    });
    return true;
  }

  for (const segment of segments) {
    const weekMatches = Array.from(segment.matchAll(/\bTuần\s+(\d{1,3})\s*:/gi));
    if (weekMatches.length) currentWeek = Number(weekMatches[weekMatches.length - 1][1]);

    const tableHeaderIndex = segment.lastIndexOf('Done');
    const dateMatches = collectRowDateMatches(segment, tableHeaderIndex);
    if (!dateMatches.length) {
      const pendingSource = tableHeaderIndex >= 0 ? segment.slice(tableHeaderIndex + 4) : segment;
      const pendingText = cleanTaskText(pendingSource);
      if (pendingText && pendingText.length >= 2) {
        pendingTask = pendingTask
          ? { text: cleanTaskText(pendingTask.text + ' ' + pendingText), week: pendingTask.week || currentWeek }
          : { text: pendingText, week: currentWeek };
      }
      continue;
    }

    // Some PDF tables put a row's content at the bottom of one page and its
    // date at the top of the next page. When the next segment contains both
    // that orphan date and the following row's date, recover the pending row.
    let currentDateIndex = 0;
    if (pendingTask) {
      const firstDateMatch = dateMatches[0];
      const pendingDate = resolveDateInRange(firstDateMatch[1], firstDateMatch[2], firstDateMatch[3], range, previousDate);
      appendTask(pendingDate, pendingTask.text, pendingTask.week);
      pendingTask = null;
      currentDateIndex = 1;
    }

    // Use the first remaining row date, never a later date mentioned inside the
    // task description. The first match may already have been consumed above
    // to recover a row split across PDF pages.
    const dateMatch = dateMatches[currentDateIndex];
    if (!dateMatch) continue;
    const date = resolveDateInRange(dateMatch[1], dateMatch[2], dateMatch[3], range, previousDate);
    if (!date) continue;

    const textAfterDate = segment.slice((dateMatch.index || 0) + dateMatch[0].length);
    const taskText = cleanTaskText(textAfterDate);
    appendTask(date, taskText, currentWeek);
    if (previousDate === range.end) break;
    if (tasks.length >= MAX_DATED_TASKS) break;
  }

  return tasks;
}

function buildDatedDocumentRoadmap(text, fallbackName) {
  const datedTasks = extractDatedDocumentTasks(text);
  if (!datedTasks.length) return null;

  const range = parseDocumentDateRange(text);
  const weekMap = new Map();
  for (const task of datedTasks) {
    let week = task.week;
    if (!week && range) {
      const offsetDays = Math.floor((Date.parse(task.date + 'T00:00:00Z') - Date.parse(range.start + 'T00:00:00Z')) / 86400000);
      week = Math.floor(Math.max(offsetDays, 0) / 7) + 1;
    }
    if (!weekMap.has(week)) weekMap.set(week, []);
    weekMap.get(week).push(task.text);
  }

  const weekNumbers = Array.from(weekMap.keys()).filter(Number.isInteger).sort((a, b) => a - b);
  const phases = [];
  for (let index = 0; index < weekNumbers.length; index += 5) {
    const group = weekNumbers.slice(index, index + 5);
    phases.push({
      id: 'p' + (phases.length + 1),
      title: group.length === 1 ? 'Tuần ' + group[0] : 'Tuần ' + group[0] + '-' + group[group.length - 1],
      weeks: group.map((week) => ({
        week,
        title: 'Tuần ' + week,
        goals: weekMap.get(week).slice(0, 10),
        deliverables: [],
        estimatedHours: null,
      })),
    });
  }

  let totalWeeks = weekNumbers.length ? weekNumbers[weekNumbers.length - 1] : 0;
  if (range) {
    const rangeDays = Math.floor((Date.parse(range.end + 'T00:00:00Z') - Date.parse(range.start + 'T00:00:00Z')) / 86400000) + 1;
    totalWeeks = Math.max(totalWeeks, Math.ceil(rangeDays / 7));
  }

  return {
    title: extractTitle(text, fallbackName),
    summary: 'Lịch học có ngày cụ thể được trích nguyên văn từ tài liệu.',
    totalWeeks,
    phases,
    datedTasks,
  };
}

function buildDatedDocumentProposal(roadmap, targetDates, opts) {
  const dates = Array.isArray(targetDates) ? targetDates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)) : [];
  const dateSet = new Set(dates);
  const datedTasks = roadmap && Array.isArray(roadmap.datedTasks) ? roadmap.datedTasks : [];
  if (!datedTasks.length) return null;

  const candidates = datedTasks.filter((task) => task && dateSet.has(task.date) && typeof task.text === 'string' && task.text.trim());
  const existingDated = new Set();
  const existingUndated = new Set();
  const existingTasks = opts && Array.isArray(opts.existingTasks) ? opts.existingTasks.slice(0, 100) : [];
  for (const existing of existingTasks) {
    const text = normalizeTaskIdentity(typeof existing === 'string' ? existing : existing && existing.text);
    if (!text) continue;
    const rawDate = existing && typeof existing === 'object' ? (existing.date || existing.deadline) : '';
    if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      existingDated.add(rawDate + '|' + text);
    } else {
      existingUndated.add(text);
    }
  }

  const matching = candidates.filter((task) => {
    const text = normalizeTaskIdentity(task.text);
    return !existingDated.has(task.date + '|' + text) && !existingUndated.has(text);
  });
  const skippedDuplicates = candidates.length - matching.length;

  let totalMinutes = 0;
  const actions = matching.slice(0, 84).map((task, index) => {
    const duration = Math.min(Math.max(Number(task.duration) || DEFAULT_DURATION_MINUTES, 20), 120);
    totalMinutes += duration;
    return {
      id: 'a' + (index + 1),
      type: 'create_task',
      args: {
        taskRef: null,
        text: task.text.trim().slice(0, MAX_TASK_TEXT),
        date: task.date,
        start: null,
        duration,
        priority: false,
        projectId: null,
        milestoneId: null,
        changes: null,
      },
      source: {
        kind: 'document-daily-plan',
        evidence: task.text.trim().slice(0, 200),
      },
    };
  });

  const matchedDates = Array.from(new Set(candidates.map((task) => task.date))).sort();
  const generatedDates = Array.from(new Set(actions.map((action) => action.args.date))).sort();
  let summary = 'Không có công việc trong khoảng ngày đã chọn.';
  if (actions.length) {
    summary = 'Kế hoạch theo lịch ngày trong tài liệu — ' + actions.length + ' công việc';
    if (skippedDuplicates) summary += ', bỏ qua ' + skippedDuplicates + ' công việc đã tồn tại';
  } else if (skippedDuplicates) {
    summary = 'Không có công việc mới — ' + skippedDuplicates + ' công việc đã tồn tại.';
  }

  return {
    proposal: {
      summary,
      actions,
    },
    totalMinutes,
    matchedDates,
    generatedDates,
    candidateCount: candidates.length,
    skippedDuplicates,
  };
}

module.exports = {
  MAX_DATED_TASKS,
  parseDocumentDateRange,
  extractDatedDocumentTasks,
  buildDatedDocumentRoadmap,
  buildDatedDocumentProposal,
};
