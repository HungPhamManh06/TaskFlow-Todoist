// TaskFlow — P7 Monthly Review: additive schema, truthful monthly scores, model helpers.
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowMonthlyReview = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const REVIEW_FIELDS = ['achievement', 'learned', 'continue', 'stop', 'start', 'updatedAt'];
  const SCORABLE_TYPES = new Set(['HABIT', 'MANUAL', 'CUSTOM', 'TASK', 'FOCUS']);

  function emptyMonthlyReview() {
    return { achievement: '', learned: '', continue: '', stop: '', start: '', updatedAt: '' };
  }

  function normalizeMonthlyReview(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = { ...source };
    REVIEW_FIELDS.forEach((field) => { out[field] = typeof source[field] === 'string' ? source[field] : ''; });
    return out;
  }

  function ensureMonthlyReview(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    state.monthlyReview = normalizeMonthlyReview(state.monthlyReview);
    return state.monthlyReview;
  }

  function progressApi(context) {
    if (context && typeof context.metricProgress === 'function') return context.metricProgress;
    const api = root && root.TaskFlowPillars;
    return api && typeof api.metricProgress === 'function' ? api.metricProgress : null;
  }

  function metricIsScorable(state, metric) {
    if (!metric || !SCORABLE_TYPES.has(metric.type) || typeof metric.title !== 'string' || !metric.title.trim()) return false;
    if (metric.type !== 'HABIT') return true;
    return Array.isArray(state && state.habits)
      && state.habits.some((habit) => habit && habit.id === metric.linkedHabitId);
  }

  function insightMetric(metric) {
    if (!metric) return null;
    return { id: metric.id, title: metric.title, pct: metric.pct, done: metric.done, target: metric.target };
  }

  function monthlyPillarScores(state, context) {
    const source = state && typeof state === 'object' ? state : {};
    const calc = progressApi(context);
    const monthDays = context && Number.isFinite(+context.monthDays) && +context.monthDays > 0 ? Math.round(+context.monthDays) : 30;
    if (!calc || !Array.isArray(source.pillars)) return [];
    const scoreContext = {
      year: context && Number.isFinite(+context.year) ? Math.round(+context.year) : null,
      month: context && Number.isFinite(+context.month) ? Math.round(+context.month) : null,
    };
    return source.pillars.flatMap((pillar) => {
      if (!pillar || pillar.hidden === true || !Array.isArray(pillar.metrics)) return [];
      const metrics = pillar.metrics.flatMap((metric) => {
        if (!metricIsScorable(source, metric)) return [];
        const progress = calc(source, metric, monthDays, scoreContext);
        if (!progress || !Number.isFinite(+progress.target) || +progress.target <= 0) return [];
        return [{
          id: typeof metric.id === 'string' ? metric.id : '',
          title: metric.title.trim(),
          type: metric.type,
          pct: Math.max(0, Math.min(100, Math.round(+progress.pct || 0))),
          done: Math.max(0, +progress.done || 0),
          target: Math.max(0, +progress.target || 0),
        }];
      });
      if (!metrics.length) return [];
      let strongest = metrics[0];
      let attention = metrics[0];
      metrics.forEach((metric) => {
        if (metric.pct > strongest.pct) strongest = metric;
        if (metric.pct < attention.pct) attention = metric;
      });
      return [{
        id: typeof pillar.id === 'string' ? pillar.id : '',
        name: typeof pillar.name === 'string' ? pillar.name : '',
        icon: typeof pillar.icon === 'string' ? pillar.icon : '',
        pct: Math.round(metrics.reduce((sum, metric) => sum + metric.pct, 0) / metrics.length),
        strongest: insightMetric(strongest),
        attention: insightMetric(attention),
        metrics,
      }];
    });
  }

  function buildMonthlyReviewModel(state, context) {
    const source = state && typeof state === 'object' ? state : {};
    const review = normalizeMonthlyReview(source.monthlyReview);
    const pillars = monthlyPillarScores(source, context || {});
    const prompts = context && Array.isArray(context.legacyPrompts) ? context.legacyPrompts : [];
    const answers = source.reflections && Array.isArray(source.reflections.overview) ? source.reflections.overview : [];
    const legacy = answers.flatMap((answer, index) => typeof answer === 'string' && answer.trim()
      ? [{ prompt: typeof prompts[index] === 'string' ? prompts[index] : '', answer: answer.trim() }]
      : []);
    return {
      review,
      pillars,
      overall: pillars.length ? Math.round(pillars.reduce((sum, pillar) => sum + pillar.pct, 0) / pillars.length) : null,
      legacy,
    };
  }

  return {
    emptyMonthlyReview,
    normalizeMonthlyReview,
    ensureMonthlyReview,
    monthlyPillarScores,
    buildMonthlyReviewModel,
  };
});
