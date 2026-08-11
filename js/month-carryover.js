// TaskFlow — P8 safe, explicit next-month carry-over engine.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowMonthCarryover = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function nextMonth(year, month) {
    const y = Number.isFinite(+year) ? Math.round(+year) : new Date().getFullYear();
    const m = Number.isFinite(+month) ? Math.round(+month) : 0;
    return m >= 11 ? { year: y + 1, month: 0 } : { year: y, month: Math.max(0, m) + 1 };
  }

  function ids(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))];
  }

  function normalizeCarrySelection(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      pillarIds: ids(source.pillarIds),
      focusPillarIds: ids(source.focusPillarIds),
      habitIds: ids(source.habitIds),
      metricIds: ids(source.metricIds),
    };
  }

  function normalizedName(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase() : '';
  }

  function sourceModel(source) {
    const habits = Array.isArray(source && source.habits) ? source.habits.filter((habit) => habit && typeof habit.id === 'string' && normalizedName(habit.name)) : [];
    const pillars = Array.isArray(source && source.pillars) ? source.pillars.filter((pillar) => pillar && typeof pillar.id === 'string' && normalizedName(pillar.name)) : [];
    const metrics = new Map();
    pillars.forEach((pillar) => {
      if (!Array.isArray(pillar.metrics)) return;
      pillar.metrics.forEach((metric) => {
        if (metric && typeof metric.id === 'string' && normalizedName(metric.title)) metrics.set(metric.id, { metric, pillar });
      });
    });
    return {
      habits,
      pillars,
      habitById: new Map(habits.map((habit) => [habit.id, habit])),
      pillarById: new Map(pillars.map((pillar) => [pillar.id, pillar])),
      metrics,
    };
  }

  function destinationModel(destination) {
    const habits = Array.isArray(destination && destination.habits) ? destination.habits.filter(Boolean) : [];
    const pillars = Array.isArray(destination && destination.pillars) ? destination.pillars.filter(Boolean) : [];
    return {
      habits,
      pillars,
      habitByName: new Map(habits.map((habit) => [normalizedName(habit.name), habit]).filter(([name]) => name)),
      pillarByName: new Map(pillars.map((pillar) => [normalizedName(pillar.name), pillar]).filter(([name]) => name)),
    };
  }

  function buildCarryPreview(source, destination, rawSelection) {
    const selection = normalizeCarrySelection(rawSelection);
    const src = sourceModel(source);
    const dest = destinationModel(destination);
    const create = [];
    const skip = [];
    const errors = [];

    selection.metricIds.forEach((metricId) => {
      const found = src.metrics.get(metricId);
      if (!found) return;
      if (!selection.pillarIds.includes(found.pillar.id)) {
        errors.push({ code: 'missing-pillar', metricId, pillarId: found.pillar.id });
        return;
      }
      if (found.metric.type === 'HABIT') {
        const habit = src.habitById.get(found.metric.linkedHabitId);
        const existing = habit ? dest.habitByName.get(normalizedName(habit.name)) : null;
        if (!habit || (!selection.habitIds.includes(habit.id) && !existing)) {
          errors.push({ code: 'missing-habit', metricId, habitId: found.metric.linkedHabitId || '' });
        }
      }
    });

    selection.habitIds.forEach((habitId) => {
      const habit = src.habitById.get(habitId);
      if (!habit) return;
      const existing = dest.habitByName.get(normalizedName(habit.name));
      (existing ? skip : create).push({ kind: 'habit', sourceId: habit.id, title: habit.name.trim(), reason: existing ? 'equivalent' : undefined });
    });

    selection.pillarIds.forEach((pillarId) => {
      const pillar = src.pillarById.get(pillarId);
      if (!pillar) return;
      const existing = dest.pillarByName.get(normalizedName(pillar.name));
      if (existing) {
        skip.push({ kind: 'pillar', sourceId: pillar.id, title: pillar.name.trim(), reason: 'equivalent' });
        return;
      }
      create.push({ kind: 'pillar', sourceId: pillar.id, title: pillar.name.trim() });
      if (selection.focusPillarIds.includes(pillar.id) && typeof pillar.focus === 'string' && pillar.focus.trim()) {
        create.push({ kind: 'focus', sourceId: pillar.id, title: pillar.focus.trim() });
      }
      (Array.isArray(pillar.metrics) ? pillar.metrics : []).forEach((metric) => {
        if (metric && selection.metricIds.includes(metric.id) && normalizedName(metric.title)) {
          create.push({ kind: 'metric', sourceId: metric.id, pillarId: pillar.id, title: metric.title.trim(), type: metric.type });
        }
      });
    });

    return { ok: errors.length === 0, selection, create, skip, errors };
  }

  function makeIdFactory(destination, context) {
    const used = new Set();
    const collect = (items) => (Array.isArray(items) ? items : []).forEach((item) => { if (item && typeof item.id === 'string') used.add(item.id); });
    collect(destination && destination.habits);
    collect(destination && destination.pillars);
    (Array.isArray(destination && destination.pillars) ? destination.pillars : []).forEach((pillar) => collect(pillar && pillar.metrics));
    let serial = 0;
    return (kind, sourceId) => {
      let candidate = '';
      do {
        serial += 1;
        candidate = context && typeof context.id === 'function'
          ? context.id(kind, sourceId, serial)
          : `carry-${kind}-${String(sourceId || 'item').replace(/[^A-Za-z0-9_-]/g, '')}-${serial}`;
      } while (!candidate || used.has(candidate));
      used.add(candidate);
      return candidate;
    };
  }

  function applyCarryover(source, destination, rawSelection, context) {
    const preview = buildCarryPreview(source, destination, rawSelection, context);
    if (!preview.ok) return { ok: false, state: null, preview, errors: preview.errors, idMap: {} };
    const selection = preview.selection;
    const src = sourceModel(source);
    const state = clone(destination && typeof destination === 'object' ? destination : {});
    if (!Array.isArray(state.habits)) state.habits = [];
    if (!Array.isArray(state.pillars)) state.pillars = [];
    const dest = destinationModel(state);
    const newId = makeIdFactory(state, context || {});
    const monthDays = context && Number.isFinite(+context.monthDays) && +context.monthDays > 0 ? Math.round(+context.monthDays) : 30;
    const idMap = {};

    src.habits.forEach((habit) => {
      const existing = dest.habitByName.get(normalizedName(habit.name));
      if (existing) idMap[habit.id] = existing.id;
      if (!selection.habitIds.includes(habit.id) || existing) return;
      const copied = clone(habit);
      copied.id = newId('habit', habit.id);
      copied.name = habit.name.trim();
      copied.days = Array(monthDays).fill(false);
      copied.skipDays = [];
      if (copied.remind && typeof copied.remind === 'object') copied.remind = { ...copied.remind, enabled: false };
      idMap[habit.id] = copied.id;
      state.habits.push(copied);
      dest.habitByName.set(normalizedName(copied.name), copied);
    });

    selection.pillarIds.forEach((pillarId) => {
      const pillar = src.pillarById.get(pillarId);
      if (!pillar || dest.pillarByName.has(normalizedName(pillar.name))) return;
      const copied = clone(pillar);
      copied.id = newId('pillar', pillar.id);
      copied.name = pillar.name.trim();
      copied.focus = selection.focusPillarIds.includes(pillar.id) && typeof pillar.focus === 'string' ? pillar.focus.trim() : '';
      copied.metrics = [];
      (Array.isArray(pillar.metrics) ? pillar.metrics : []).forEach((metric) => {
        if (!metric || !selection.metricIds.includes(metric.id) || !normalizedName(metric.title)) return;
        const metricCopy = clone(metric);
        metricCopy.id = newId('metric', metric.id);
        metricCopy.title = metric.title.trim();
        metricCopy.days = Array(monthDays).fill(false);
        if (metric.type === 'HABIT') metricCopy.linkedHabitId = idMap[metric.linkedHabitId];
        copied.metrics.push(metricCopy);
        idMap[metric.id] = metricCopy.id;
      });
      state.pillars.push(copied);
      idMap[pillar.id] = copied.id;
      dest.pillarByName.set(normalizedName(copied.name), copied);
    });

    return { ok: true, state, preview, errors: [], idMap };
  }

  function carryDialogHTML(source, rawSelection, rawPreview, options) {
    const selection = normalizeCarrySelection(rawSelection);
    const preview = rawPreview && typeof rawPreview === 'object' ? rawPreview : { ok: true, create: [], skip: [], errors: [] };
    const t = options && typeof options.t === 'function' ? options.t : (key) => key;
    const esc = options && typeof options.esc === 'function' ? options.esc : (value) => String(value ?? '');
    const src = sourceModel(source);
    const checked = (list, id) => list.includes(id) ? ' checked' : '';
    const itemLabel = (item) => `${item.kind === 'focus' ? t('monthCarryFocus') : item.kind === 'habit' ? t('monthCarryHabitOne') : item.kind === 'metric' ? t('monthCarryMetricOne') : t('monthCarryPillarOne')}: ${esc(item.title || '')}`;
    const previewList = (items) => items.length ? `<ul>${items.map((item) => `<li>${itemLabel(item)}</li>`).join('')}</ul>` : '';
    const errors = (Array.isArray(preview.errors) ? preview.errors : []).map((error) => `<li>${t(error.code === 'missing-habit' ? 'monthCarryMissingHabit' : 'monthCarryMissingPillar')}</li>`).join('');
    const habits = src.habits.length ? src.habits.map((habit) => `<label class="month-carry-option"><input type="checkbox" data-carry-kind="habit" data-carry-id="${esc(habit.id)}"${checked(selection.habitIds, habit.id)}><span>${esc(habit.name.trim())}</span></label>`).join('') : `<p class="month-carry-empty">${t('monthCarryNoHabits')}</p>`;
    const pillars = src.pillars.length ? src.pillars.map((pillar) => {
      const metrics = (Array.isArray(pillar.metrics) ? pillar.metrics : []).filter((metric) => metric && typeof metric.id === 'string' && normalizedName(metric.title));
      return `<article class="month-carry-pillar">
        <label class="month-carry-option month-carry-pillar-option"><input type="checkbox" data-carry-kind="pillar" data-carry-id="${esc(pillar.id)}"${checked(selection.pillarIds, pillar.id)}><span>${esc(pillar.icon || '')} ${esc(pillar.name.trim())}</span></label>
        <label class="month-carry-option"><input type="checkbox" data-carry-kind="focus" data-carry-id="${esc(pillar.id)}"${checked(selection.focusPillarIds, pillar.id)}><span>${t('monthCarryFocus')}: ${esc(pillar.focus || '—')}</span></label>
        <div class="month-carry-metrics">${metrics.map((metric) => `<label class="month-carry-option"><input type="checkbox" data-carry-kind="metric" data-carry-id="${esc(metric.id)}"${checked(selection.metricIds, metric.id)}><span>${esc(metric.title.trim())} · ${esc(metric.type || '')}</span></label>`).join('') || `<p class="month-carry-empty">${t('monthCarryNoMetrics')}</p>`}</div>
      </article>`;
    }).join('') : `<p class="month-carry-empty">${t('monthCarryNoPillars')}</p>`;
    const hasChanges = Array.isArray(preview.create) && preview.create.length > 0;
    return `<div class="month-carry-body">
      <p class="month-carry-intro">${t('monthCarryIntro')}</p>
      <div class="month-carry-grid">
        <fieldset><legend>${t('monthCarryPillars')}</legend>${pillars}</fieldset>
        <fieldset><legend>${t('monthCarryHabits')}</legend>${habits}</fieldset>
      </div>
      <div class="month-carry-preview" data-testid="month-carry-preview">
        <h3>${t('monthCarryPreview')}</h3>
        ${hasChanges ? `<section><h4>${t('monthCarryWillCreate')}</h4>${previewList(preview.create)}</section>` : `<p class="month-carry-empty">${t('monthCarryNothing')}</p>`}
        ${Array.isArray(preview.skip) && preview.skip.length ? `<section><h4>${t('monthCarryWillSkip')}</h4>${previewList(preview.skip)}</section>` : ''}
        ${errors ? `<ul class="month-carry-errors" role="alert">${errors}</ul>` : ''}
      </div>
      <div class="month-carry-actions">
        <button type="button" class="button" data-action="month-carry-preview">${t('monthCarryPreview')}</button>
        <button type="button" class="button button-primary" data-action="month-carry-apply"${!preview.ok || !hasChanges ? ' disabled' : ''}>${t('monthCarryCreate')}</button>
      </div>
    </div>`;
  }

  return { nextMonth, normalizeCarrySelection, buildCarryPreview, applyCarryover, carryDialogHTML };
});
