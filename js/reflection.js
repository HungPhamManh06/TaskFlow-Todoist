// TaskFlow — Daily Reflection (P1: Quick + Deep + summary + history).
// Lưu trữ: localStorage 'planner-reflections-daily' = { 'YYYY-MM-DD': entry }.
// entry: { mood, quickGood, quickImprove, good, bad, cont, improve, tomorrow,
//          createdAt, updatedAt } — mood là index 0-4 của MOODS (app.js), null nếu chưa chọn.
// LƯU Ý coupling: module KHÔNG sở hữu state app; resolve deps qua global lexical
// tại thời điểm GỌI — pattern mood.js/popups.js:
//   t, esc, MOODS, moodMap, saveMood, moodDateKey, state, viewedMonth, nowInfo,
//   loadPomoLog, monthlyStats, PLAN_START/NUM_DAYS/PLAN_YEAR/PLAN_MONTH,
//   window.TaskFlowToday.totalFocusMinutesToday, TaskFlowUI, trackEvent
// Phần PURE (dailyKey, normalizeEntry, summaryFrom, groupByMonth) không đụng DOM —
// unit-test được trong Node.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowReflection = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const KEY = 'planner-reflections-daily';
  let reflections = null;

  /* ---------------- Pure helpers (unit-testable) ---------------- */

  // YYYY-MM-DD local (không lệch UTC) — key cho entry ngày. Nhất quán pomoDateKey.
  function dailyKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function normalizeEntry(raw) {
    const base = { mood: null, quickGood: '', quickImprove: '', good: '', bad: '', cont: '', improve: '', tomorrow: '', createdAt: null, updatedAt: null };
    if (!raw || typeof raw !== 'object') return base;
    return Object.assign(base, raw);
  }

  // Summary thuần: nhận dữ liệu đã trích từ state + pomo log → các con số hiển thị.
  // habitIdx: index ngày trong tháng (0-based) — -1 khi hôm nay không thuộc tháng đang xem.
  function summaryFrom(tasks, habits, focusMinutes, goalPct, habitIdx) {
    const tasksArr = Array.isArray(tasks) ? tasks : [];
    const habitsArr = Array.isArray(habits) ? habits : [];
    const tasksDone = tasksArr.filter((tk) => tk.done).length;
    const habitsToday = habitIdx >= 0
      ? habitsArr.filter((h) => !(Array.isArray(h.skipDays) && h.skipDays.includes(habitIdx)))
      : [];
    const habitsDone = habitIdx >= 0
      ? habitsToday.filter((h) => Array.isArray(h.days) && h.days[habitIdx] === true).length
      : 0;
    return {
      tasksDone, tasksTotal: tasksArr.length,
      tasksPct: tasksArr.length ? Math.round((tasksDone / tasksArr.length) * 100) : 0,
      habitsDone, habitsTotal: habitsToday.length,
      habitsPct: habitsToday.length ? Math.round((habitsDone / habitsToday.length) * 100) : 0,
      focusMinutes, goalPct: goalPct || 0,
    };
  }

  // Nhóm entry theo tháng 'YYYY-MM' giảm dần; trong tháng giảm dần theo ngày.
  // entries: [{ key, entry }] → [{ month: 'YYYY-MM', items: [{ key, entry }] }]
  function groupByMonth(entries) {
    const months = {};
    entries.forEach(({ key, entry }) => {
      const ym = String(key).slice(0, 7);
      (months[ym] = months[ym] || []).push({ key, entry });
    });
    return Object.keys(months)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((ym) => ({
        month: ym,
        items: months[ym].sort((a, b) => (a.key < b.key ? 1 : -1)),
      }));
  }

  /* ---------------- State ---------------- */

  function loadReflections() {
    try {
      const raw = localStorage.getItem(KEY);
      reflections = raw ? JSON.parse(raw) : {};
    } catch (e) { reflections = {}; }
    if (!reflections || typeof reflections !== 'object' || Array.isArray(reflections)) reflections = {};
  }
  function saveReflections() {
    try { localStorage.setItem(KEY, JSON.stringify(reflections)); } catch (e) { /* ẩn */ }
    if (window.Sync) window.Sync.push(KEY);
  }
  function ensureLoaded() { if (reflections === null) loadReflections(); }
  function getEntry(key) { ensureLoaded(); return normalizeEntry(reflections[key]); }
  function setEntry(key, patch) {
    ensureLoaded();
    const cur = normalizeEntry(reflections[key]);
    const next = Object.assign({}, cur, patch, { updatedAt: new Date().toISOString() });
    if (!next.createdAt) next.createdAt = next.updatedAt;
    reflections[key] = next;
    saveReflections();
    return next;
  }

  /* ---------------- UI: card trong Today ---------------- */

  // Summary strip (Phase 11) — nhận dữ liệu qua global lexical lúc gọi.
  function dailySummaryData() {
    const ti = nowInfo(PLAN_START, NUM_DAYS);
    const inTodayMonth = viewedMonth === null && ti.inRange;
    const w = inTodayMonth ? state.weeks[ti.week - 1] : null;
    const d = w && w.days[ti.dayInWeek];
    const tasks = d && Array.isArray(d.tasks) ? d.tasks : [];
    const habitIdx = inTodayMonth ? new Date().getDate() - 1 : -1;
    const focusMinutes = window.TaskFlowToday && typeof window.TaskFlowToday.totalFocusMinutesToday === 'function'
      ? window.TaskFlowToday.totalFocusMinutesToday()
      : 0;
    const goalPct = typeof monthlyStats === 'function' ? monthlyStats(state).pct : 0;
    return summaryFrom(tasks, state.habits, focusMinutes, goalPct, habitIdx);
  }

  function summaryCell(label, value) {
    return `<div class="reflect-summary-cell"><span class="reflect-summary-value">${esc(value)}</span><span class="reflect-summary-label">${esc(label)}</span></div>`;
  }

  // Quick reflection card — đặt cuối Today (gọi từ js/today.js renderToday).
  function reflectionCardHTML() {
    const key = dailyKey(new Date());
    const entry = getEntry(key);
    const s = dailySummaryData();
    const moodBtns = MOODS.map((m, i) =>
      `<button type="button" role="radio" aria-checked="${entry.mood === i ? 'true' : 'false'}" class="reflect-mood-btn${entry.mood === i ? ' on' : ''}" data-action="reflection-mood" data-mood="${i}" title="${t(m.labelKey)}" aria-label="${t(m.labelKey)}">${m.icon}</button>`).join('');
    const hasDeep = !!(entry.good || entry.bad || entry.cont || entry.improve || entry.tomorrow);
    return `<div class="card today-card today-reflection-card" data-testid="reflection-card">
    <div class="today-card-head">
      <h2 class="today-card-title">${t('reflectTitle')}</h2>
      <button type="button" class="pop-btn" data-action="reflection-history" data-testid="reflection-history-btn">${t('reflectHistory')}</button>
    </div>
    <div class="reflect-summary" role="group" aria-label="${t('reflectSummaryTitle')}">
      <p class="reflect-summary-title">${t('reflectSummaryTitle')}</p>
      <div class="reflect-summary-grid">
        ${summaryCell(t('reflectSummaryTasks'), `${s.tasksDone}/${s.tasksTotal}`)}
        ${summaryCell(t('reflectSummaryHabits'), `${s.habitsDone}/${s.habitsTotal}`)}
        ${summaryCell(t('reflectSummaryFocus'), formatFocusTime(s.focusMinutes))}
        ${summaryCell(t('reflectSummaryGoals'), `${s.goalPct}%`)}
      </div>
    </div>
    <div class="reflect-quick">
      <p class="reflect-mood-q" id="reflectMoodQ">${t('reflectMoodQ')}</p>
      <div class="reflect-mood-group" role="radiogroup" aria-labelledby="reflectMoodQ">${moodBtns}</div>
      <label class="reflect-field">
        <span class="reflect-field-label">${t('reflectGoodToday')}</span>
        <input type="text" class="reflect-input" data-reflect-field="quickGood" value="${esc(entry.quickGood)}" maxlength="200" placeholder="${t('reflectGoodTodayPh')}" aria-label="${t('reflectGoodToday')}">
      </label>
      <label class="reflect-field">
        <span class="reflect-field-label">${t('reflectImproveToday')}</span>
        <input type="text" class="reflect-input" data-reflect-field="quickImprove" value="${esc(entry.quickImprove)}" maxlength="200" placeholder="${t('reflectImproveTodayPh')}" aria-label="${t('reflectImproveToday')}">
      </label>
      <div class="reflect-quick-actions">
        <button type="button" class="button button-primary" data-action="reflection-save-quick" data-testid="reflection-save-quick">${t('reflectSave')}</button>
        <button type="button" class="pop-btn" data-action="reflection-deep" data-testid="reflection-deep-open">${hasDeep ? t('reflectDeepEdit') : t('reflectDeepLink')}</button>
      </div>
    </div>
  </div>`;
  }

  // Re-render riêng card (không render cả Today — giữ focus/scroll).
  function rerenderCard() {
    const el = document.querySelector('[data-testid="reflection-card"]');
    if (!el) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = reflectionCardHTML();
    const fresh = tmp.firstElementChild;
    if (fresh) el.replaceWith(fresh);
  }

  /* ---------------- Quick reflection actions ---------------- */

  // Cập nhật highlight mood trong cả card + deep modal (nếu đang mở) mà không re-render toàn bộ.
  function syncMoodUI() {
    document.querySelectorAll('.reflect-mood-btn').forEach((btn) => {
      const on = +btn.dataset.mood === currentMoodLevel();
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  function currentMoodLevel() {
    const key = deepKey || dailyKey(new Date());
    const e = getEntry(key);
    return e.mood === null || e.mood === undefined ? -1 : e.mood;
  }

  function setMood(level) {
    const key = deepKey || dailyKey(new Date());
    const entry = setEntry(key, { mood: +level });
    // Mirror sang planner-mood (heatmap + mood trend giữ nhất quán) — dùng đúng
    // ngày của entry (kể cả khi sửa entry quá khứ từ lịch sử).
    if (typeof moodMap !== 'undefined' && typeof saveMood === 'function' && typeof moodDateKey === 'function') {
      const parts = String(key).split('-').map(Number);
      if (parts.length === 3 && parts[0] && parts[1] >= 1 && parts[1] <= 12 && parts[2] >= 1 && parts[2] <= 31) {
        moodMap[moodDateKey(parts[2], parts[0], parts[1] - 1)] = +level;
        saveMood();
        if (typeof rerenderMoodCard === 'function') rerenderMoodCard();
      }
    }
    trackEvent('reflection_mood', { level: +level });
    syncMoodUI();
    return entry;
  }

  function saveQuickFromCard() {
    const key = dailyKey(new Date());
    const card = document.querySelector('[data-testid="reflection-card"]');
    if (!card) return;
    const good = card.querySelector('[data-reflect-field="quickGood"]');
    const improve = card.querySelector('[data-reflect-field="quickImprove"]');
    const patch = {};
    if (good) patch.quickGood = good.value || '';
    if (improve) patch.quickImprove = improve.value || '';
    setEntry(key, patch);
    TaskFlowUI.toast(t('reflectSaved'), 'success');
    trackEvent('reflection_save_quick');
    rerenderCard();
  }

  // Autosave debounce cho cả quick fields + deep modal (qua delegated input listener app.js)
  let reflectDebounce = null;
  function onFieldInput(el) {
    // Trong deep modal → key đang mở; ngoài modal (quick card) → hôm nay.
    const key = (el.closest && el.closest('#reflectionModal')) ? (deepKey || dailyKey(new Date())) : dailyKey(new Date());
    const field = el.dataset.reflectField;
    const val = (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') ? el.value : (el.innerText || '');
    clearTimeout(reflectDebounce);
    reflectDebounce = setTimeout(() => {
      setEntry(key, { [field]: val });
      const deepModal = document.getElementById('reflectionModal');
      if (deepModal && !deepModal.hidden) {
        const savedEl = deepModal.querySelector('[data-role="reflect-autosaved"]');
        if (savedEl) savedEl.textContent = t('reflectAutosaved');
      }
    }, 500);
  }

  /* ---------------- Deep reflection modal ---------------- */

  // key tuỳ chọn: mặc định hôm nay; mở từ lịch sử → sửa entry ngày đó.
  let deepKey = null;
  function openDeepReflection(key) {
    deepKey = key || dailyKey(new Date());
    const entry = getEntry(deepKey);
    const content = document.getElementById('reflectionDeepContent');
    if (!content) return;
    content.innerHTML = deepModalHTML(deepKey, entry);
    TaskFlowUI.openDialog('reflectionModal');
  }
  // Mở entry lịch sử để xem/sửa (Phase 21).
  function openHistoryEntry(key) {
    openDeepReflection(key);
  }
  function closeDeepReflection() {
    deepKey = null;
    TaskFlowUI.closeDialog('reflectionModal');
  }

  function deepModalHTML(key, entry) {
    const moodBtns = MOODS.map((m, i) =>
      `<button type="button" role="radio" aria-checked="${entry.mood === i ? 'true' : 'false'}" class="reflect-mood-btn${entry.mood === i ? ' on' : ''}" data-action="reflection-mood" data-mood="${i}" title="${t(m.labelKey)}" aria-label="${t(m.labelKey)}">${m.icon}</button>`).join('');
    const field = (f, label) => `<label class="reflect-field reflect-deep-field">
      <span class="reflect-field-label">${label}</span>
      <textarea class="reflect-textarea" data-reflect-field="${f}" rows="3" aria-label="${label}">${esc(entry[f] || '')}</textarea>
    </label>`;
    return `<p class="reflect-deep-date">${esc(key)}</p>
    <p class="reflect-mood-q" id="reflectDeepMoodQ">${t('reflectMoodQ')}</p>
    <div class="reflect-mood-group" role="radiogroup" aria-labelledby="reflectDeepMoodQ">${moodBtns}</div>
    ${field('good', t('reflectDeepGood'))}
    ${field('bad', t('reflectDeepBad'))}
    ${field('cont', t('reflectDeepCont'))}
    ${field('improve', t('reflectDeepImprove'))}
    <label class="reflect-field reflect-deep-field">
      <span class="reflect-field-label">${t('reflectTomorrow')}</span>
      <input type="text" class="reflect-input" data-reflect-field="tomorrow" value="${esc(entry.tomorrow || '')}" maxlength="300" aria-label="${t('reflectTomorrow')}">
    </label>
    <div class="reflect-quick-actions">
      <span class="reflect-autosaved" data-role="reflect-autosaved" aria-live="polite"></span>
      <button type="button" class="button button-primary" data-action="reflection-deep-save" data-testid="reflection-deep-save">${t('reflectSave')}</button>
    </div>`;
  }

  function saveDeepFromModal() {
    const key = deepKey || dailyKey(new Date());
    const content = document.getElementById('reflectionDeepContent');
    if (!content) return;
    const patch = {};
    content.querySelectorAll('[data-reflect-field]').forEach((el) => {
      patch[el.dataset.reflectField] = (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') ? el.value : (el.innerText || '');
    });
    setEntry(key, patch);
    TaskFlowUI.toast(t('reflectSaved'), 'success');
    trackEvent('reflection_save_deep');
    closeDeepReflection();
    rerenderCard();
  }

  /* ---------------- History modal ---------------- */

  function openHistory() {
    const content = document.getElementById('reflectionHistoryContent');
    if (!content) return;
    content.innerHTML = historyHTML();
    TaskFlowUI.openDialog('reflectionHistoryModal');
  }
  function closeHistory() {
    TaskFlowUI.closeDialog('reflectionHistoryModal');
  }

  function historyHTML() {
    ensureLoaded();
    const all = Object.keys(reflections)
      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
      .map((k) => ({ key: k, entry: normalizeEntry(reflections[k]) }));
    if (!all.length) {
      return `<div class="reflect-history-empty">
        <p class="reflect-history-empty-title">${t('reflectHistoryEmpty')}</p>
        <p class="reflect-history-empty-sub">${t('reflectHistoryEmptySub')}</p>
      </div>`;
    }
    const groups = groupByMonth(all);
    return groups.map((g) => {
      const [y, m] = g.month.split('-').map(Number);
      return `<div class="reflect-history-month">
        <h3 class="reflect-history-month-title">${esc(monthLabel(m - 1))} ${y}</h3>
        <ul class="reflect-history-list">
          ${g.items.map(({ key, entry }) => {
            const [, , d] = key.split('-');
            const moodIcon = (entry.mood !== null && entry.mood !== undefined && MOODS[entry.mood]) ? MOODS[entry.mood].icon : '·';
            const preview = entry.quickGood || entry.good || entry.quickImprove || entry.bad || '';
            return `<li><button type="button" class="reflect-history-item" data-action="reflection-history-open" data-key="${key}" aria-label="${t('reflectHistoryItemAria', { d: key })}">
              <span class="reflect-history-mood" aria-hidden="true">${moodIcon}</span>
              <span class="reflect-history-date">${d}/${m}</span>
              <span class="reflect-history-preview">${esc(String(preview).slice(0, 60)) || '—'}</span>
            </button></li>`;
          }).join('')}
        </ul>
      </div>`;
    }).join('');
  }

  /* ---------------- Return API ---------------- */

  return {
    // pure
    dailyKey, normalizeEntry, summaryFrom, groupByMonth,
    // state
    loadReflections, saveReflections, getEntry, setEntry,
    // UI
    reflectionCardHTML, rerenderCard, dailySummaryData,
    setMood, saveQuickFromCard, onFieldInput,
    openDeepReflection, closeDeepReflection, saveDeepFromModal, openHistoryEntry,
    openHistory, closeHistory, historyHTML,
  };
});
