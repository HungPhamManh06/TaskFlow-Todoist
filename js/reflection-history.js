// TaskFlow — P9 unified Daily / Weekly / Monthly reflection history.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowReflectionHistory = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const TYPES = new Set(['daily', 'weekly', 'monthly']);

  function parseJSON(value) {
    try { return JSON.parse(value); } catch (error) { return null; }
  }

  function validISODate(value) {
    if (typeof value !== 'string') return '';
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match && !Number.isNaN(Date.parse(match[1] + 'T00:00:00Z')) ? match[1] : '';
  }

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function firstText(values) {
    for (const value of values) {
      const normalized = text(value);
      if (normalized) return normalized;
    }
    return '';
  }

  function hasText(values) {
    return values.some((value) => text(value));
  }

  function storageKeys(storage) {
    if (!storage || typeof storage.length !== 'number' || typeof storage.key !== 'function') return [];
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key === 'string') keys.push(key);
    }
    return keys;
  }

  function fallbackDate(year, monthOneBased, day) {
    const max = new Date(year, monthOneBased, 0).getDate();
    return `${year}-${String(monthOneBased).padStart(2, '0')}-${String(Math.max(1, Math.min(max, day))).padStart(2, '0')}`;
  }

  function collectDaily(storage) {
    if (!storage || typeof storage.getItem !== 'function') return [];
    const raw = parseJSON(storage.getItem('planner-reflections-daily'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    return Object.keys(raw).flatMap((date) => {
      const entry = raw[date];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !entry || typeof entry !== 'object') return [];
      const fields = [entry.quickGood, entry.quickImprove, entry.good, entry.bad, entry.cont, entry.improve, entry.tomorrow];
      const moodIndex = Number.isInteger(entry.mood) && entry.mood >= 0 && entry.mood <= 4 ? entry.mood : null;
      if (!hasText(fields) && moodIndex === null) return [];
      return [{
        id: `daily:${date}`, type: 'daily', date,
        updatedAt: validISODate(entry.updatedAt) ? entry.updatedAt : date + 'T00:00:00.000Z',
        excerpt: firstText(fields), mood: moodIndex === null ? null : moodIndex + 1,
        owner: { key: date }, raw: entry,
      }];
    });
  }

  function collectMonth(storage, key) {
    const match = key.match(/^planner-(\d{4})-(\d{1,2})$/);
    if (!match || typeof storage.getItem !== 'function') return [];
    const year = +match[1], month = +match[2];
    if (month < 1 || month > 12) return [];
    const state = parseJSON(storage.getItem(key));
    if (!state || typeof state !== 'object' || Array.isArray(state)) return [];
    const entries = [];
    const weeks = Array.isArray(state.weeklyReviews) ? state.weeklyReviews : [];
    weeks.forEach((review, index) => {
      if (!review || typeof review !== 'object') return;
      const fields = [review.best, review.blocker, review.learned, review.change].concat(Array.isArray(review.priorities) ? review.priorities : []);
      if (!hasText(fields)) return;
      const updatedDate = validISODate(review.updatedAt);
      const date = updatedDate || fallbackDate(year, month, (index + 1) * 7);
      entries.push({
        id: `weekly:${year}-${month}:${index}`, type: 'weekly', date,
        updatedAt: typeof review.updatedAt === 'string' ? review.updatedAt : date + 'T00:00:00.000Z',
        excerpt: firstText(fields), mood: null,
        owner: { year, month: month - 1, weekIndex: index }, raw: review,
      });
    });
    const review = state.monthlyReview;
    if (review && typeof review === 'object') {
      const fields = [review.achievement, review.learned, review.continue, review.stop, review.start];
      if (hasText(fields)) {
        const updatedDate = validISODate(review.updatedAt);
        const date = updatedDate || fallbackDate(year, month, 31);
        entries.push({
          id: `monthly:${year}-${month}`, type: 'monthly', date,
          updatedAt: typeof review.updatedAt === 'string' ? review.updatedAt : date + 'T00:00:00.000Z',
          excerpt: firstText(fields), mood: null,
          owner: { year, month: month - 1 }, raw: review,
        });
      }
    }
    return entries;
  }

  function collectReflectionHistory(storage) {
    const entries = collectDaily(storage);
    storageKeys(storage).filter((key) => /^planner-\d{4}-\d{1,2}$/.test(key)).forEach((key) => {
      entries.push(...collectMonth(storage, key));
    });
    return entries.sort((a, b) => {
      const time = String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date));
      return time || b.id.localeCompare(a.id);
    });
  }

  function filterHistory(entries, type) {
    const source = Array.isArray(entries) ? entries : [];
    return TYPES.has(type) ? source.filter((entry) => entry && entry.type === type) : source.slice();
  }

  function reflectionHistoryHTML(model, options) {
    const source = model && typeof model === 'object' ? model : {};
    const filter = TYPES.has(source.filter) ? source.filter : 'daily';
    const entries = filterHistory(source.entries, filter);
    const t = options && typeof options.t === 'function' ? options.t : (key) => key;
    const esc = options && typeof options.esc === 'function' ? options.esc : (value) => String(value ?? '');
    const tabs = ['daily', 'weekly', 'monthly'].map((type) => `<button type="button" role="tab" data-action="report-history-filter" data-history-filter="${type}" aria-selected="${type === filter}" class="report-history-tab${type === filter ? ' is-active' : ''}">${t(`reportHistory${type[0].toUpperCase()}${type.slice(1)}`)}</button>`).join('');
    const items = entries.length ? `<ul class="report-history-list">${entries.map((entry) => `<li><button type="button" class="report-history-item" data-action="report-history-open" data-history-id="${esc(entry.id)}"><span class="report-history-date">${esc(entry.date)}</span><strong>${esc(entry.excerpt || t('reportHistoryNoText'))}</strong><span>${t('reportHistoryOpen')}</span></button></li>`).join('')}</ul>` : `<p class="report-history-empty">${t('reportHistoryEmpty')}</p>`;
    return `<div class="report-history-body" data-testid="report-history"><div class="report-history-tabs" role="tablist" aria-label="${t('reportHistoryFilters')}">${tabs}</div><div role="tabpanel">${items}</div></div>`;
  }

  return { collectReflectionHistory, filterHistory, reflectionHistoryHTML };
});
