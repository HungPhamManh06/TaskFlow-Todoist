// TaskFlow — P9 factual, deterministic report insights (no AI inference).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowReportInsights = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function finitePct(value) {
    return Number.isFinite(+value) ? Math.max(0, Math.min(100, Math.round(+value))) : null;
  }

  function insightMetric(metric) {
    if (!metric || typeof metric !== 'object') return null;
    const pct = finitePct(metric.pct);
    const title = typeof metric.title === 'string' ? metric.title.trim() : '';
    if (pct === null || !title) return null;
    return { id: typeof metric.id === 'string' ? metric.id : '', title, pct };
  }

  function monthlyBalance(model) {
    const pillars = Array.isArray(model && model.pillars) ? model.pillars : [];
    return pillars.flatMap((pillar) => {
      if (!pillar || typeof pillar !== 'object') return [];
      const pct = finitePct(pillar.pct);
      const name = typeof pillar.name === 'string' ? pillar.name.trim() : '';
      if (pct === null || !name) return [];
      return [{
        id: typeof pillar.id === 'string' ? pillar.id : '',
        name,
        icon: typeof pillar.icon === 'string' ? pillar.icon : '',
        pct,
        strongest: insightMetric(pillar.strongest),
        attention: insightMetric(pillar.attention),
      }];
    });
  }

  function metricRecommendations(model) {
    const pillars = Array.isArray(model && model.pillars) ? model.pillars : [];
    return pillars.flatMap((pillar) => {
      if (!pillar || !Array.isArray(pillar.metrics)) return [];
      const pillarName = typeof pillar.name === 'string' ? pillar.name.trim() : '';
      return pillar.metrics.flatMap((metric) => {
        const fact = insightMetric(metric);
        if (!fact || (fact.pct >= 40 && fact.pct <= 80)) return [];
        const maintained = fact.pct > 80;
        return [{
          pillarId: typeof pillar.id === 'string' ? pillar.id : '',
          pillarName,
          metricId: fact.id,
          metricTitle: fact.title,
          pct: fact.pct,
          messageKey: maintained ? 'reportInsightMaintained' : 'reportInsightLessOften',
          tone: maintained ? 'maintained' : 'attention',
        }];
      });
    });
  }

  function datedMood(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const date = typeof entry.date === 'string' ? entry.date.trim() : '';
    const mood = Math.round(+entry.mood);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z')) || mood < 1 || mood > 5) return null;
    return { date, mood };
  }

  function moodTrend(entries) {
    const samples = (Array.isArray(entries) ? entries : []).flatMap((entry) => {
      const normalized = datedMood(entry);
      return normalized ? [normalized] : [];
    }).sort((a, b) => a.date.localeCompare(b.date));
    const distribution = [0, 0, 0, 0, 0];
    samples.forEach((sample) => { distribution[sample.mood - 1] += 1; });
    if (samples.length < 3) return { available: false, sampleCount: samples.length, samples: [], distribution: [0, 0, 0, 0, 0], directionKey: null };
    const edge = Math.max(1, Math.floor(samples.length / 2));
    const average = (items) => items.reduce((sum, item) => sum + item.mood, 0) / items.length;
    const delta = average(samples.slice(-edge)) - average(samples.slice(0, edge));
    const directionKey = delta > 0.25 ? 'reportMoodImproving' : delta < -0.25 ? 'reportMoodDeclining' : 'reportMoodSteady';
    return { available: true, sampleCount: samples.length, samples, distribution, directionKey };
  }

  return { monthlyBalance, metricRecommendations, moodTrend };
});
