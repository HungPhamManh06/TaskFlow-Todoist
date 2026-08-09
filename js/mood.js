// TaskFlow — Mood tracker (tách từ app.js trong P11 refactor, extraction 24).
// Gồm: loadMood/saveMood (localStorage planner-mood), moodCardHTML (widget heatmap),
// openMoodPicker/closeMoodPicker (popover trên card), rerenderMoodCard (re-render sau
// khi chọn/xoá mood).
// LƯU Ý coupling: MOOD_KEY/MOODS/moodMap vẫn ở app.js (dispatcher mood-*, day-view
// buttons, undo snapshot đọc/ghi trực tiếp). Module này resolve chúng qua global
// lexical tại thời điểm GỌI — pattern inbox.js/chat.js/search.js/quick-add.js.
// Phụ thuộc thêm: t/moodDateKey/dayAggregate/state/PLAN_*/NUM_DAYS/TaskFlowUI/
// window.PlanStats/window.Sync — đều resolve runtime.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowMood = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function loadMood() {
    try {
      const raw = localStorage.getItem(MOOD_KEY);
      moodMap = raw ? JSON.parse(raw) : {};
    } catch (e) { moodMap = {}; }
    if (typeof moodMap !== 'object' || Array.isArray(moodMap) || !moodMap) moodMap = {};
  }

  function saveMood() {
    try { localStorage.setItem(MOOD_KEY, JSON.stringify(moodMap)); } catch (e) { /* ẩn */ }
    if (window.Sync) window.Sync.push(MOOD_KEY);
  }

  function moodCardHTML() {
    const cells = [];
    let logged = 0;
    const today = new Date();
    const todayDay = (today.getFullYear() === PLAN_YEAR && today.getMonth() === PLAN_MONTH) ? today.getDate() : -1;
    for (let d = 1; d <= NUM_DAYS; d++) {
      const m = moodMap[moodDateKey(d, PLAN_YEAR, PLAN_MONTH)];
      if (m !== undefined && MOODS[m]) logged++;
      const set = m !== undefined && MOODS[m];
      cells.push(`<button type="button" class="mood-cell${set ? ' has l' + m : ''}${d === todayDay ? ' today' : ''}" data-action="mood-pick" data-day="${d}" title="${t('moodPickTitle', { d })}" aria-label="${t('moodPickAria', { d })}">${set ? MOODS[m].icon : `<span class="mood-day">${d}</span>`}</button>`);
    }
    const pairs = [];
    for (let d = 0; d < NUM_DAYS; d++) {
      const m = moodMap[moodDateKey(d + 1, PLAN_YEAR, PLAN_MONTH)];
      if (m !== undefined) pairs.push({ mood: m, pct: dayAggregate(state, d) });
    }
    const s = window.PlanStats ? window.PlanStats.moodSummary(pairs) : null;
    let insight = '';
    if (s && s.goodDays + s.badDays >= 2 && s.delta !== null && s.goodAvg !== null && s.badAvg !== null) {
      insight = t('moodInsight', { g: s.goodAvg, d: s.delta });
    } else if (!logged) {
      insight = t('moodInsightNone');
    }
    return `<div class="card mood-card" id="moodCard">
    <div class="mood-card-head">
      <h3 class="card-title">${t('moodTitle')}</h3>
      <span class="mood-hint">${t('moodHint')}</span>
    </div>
    <div class="mood-heat" role="group" aria-label="${t('moodTitle')}">${cells.join('')}</div>
    <div class="mood-picker" id="moodPicker" hidden role="dialog" aria-modal="false" aria-labelledby="moodPickerTitle"></div>
    ${insight ? `<p class="mood-insight">${insight}</p>` : ''}
  </div>`;
  }

  /* Pick mood từ heatmap overview: mở picker popover trên chính card */
  function openMoodPicker(day) {
    const pk = document.getElementById('moodPicker');
    if (!pk) return;
    const cur = moodMap[moodDateKey(day, PLAN_YEAR, PLAN_MONTH)];
    pk.innerHTML = `<div class="mood-picker-title" id="moodPickerTitle">${t('moodPickTitle', { d: day })}</div>
    <div class="mood-picker-opts">
      ${MOODS.map((m, i) => `<button type="button" class="mood-btn${cur === i ? ' on' : ''}" data-action="mood-set" data-day="${day}" data-mood="${i}" title="${t(m.labelKey)}" aria-label="${t(m.labelKey)}">${m.icon}</button>`).join('')}
    </div>
    <button type="button" class="mood-picker-clear" data-action="mood-clear" data-day="${day}">${t('moodClear')}</button>`;
    TaskFlowUI.openDialog('moodPicker');
  }
  function closeMoodPicker() {
    TaskFlowUI.closeDialog('moodPicker');
  }
  function rerenderMoodCard() {
    const card = document.getElementById('moodCard');
    if (!card) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = moodCardHTML();
    card.replaceWith(tmp.firstElementChild);
  }

  return { loadMood, saveMood, moodCardHTML, openMoodPicker, closeMoodPicker, rerenderMoodCard };
});
