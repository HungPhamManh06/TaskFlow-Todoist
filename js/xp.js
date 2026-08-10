// TaskFlow — XP & gamification core (tách từ app.js trong P11 refactor, extraction 32 — R11).
// Gồm: xpTotal + loadXP/saveXP/xpLevelInfo/addXP/removeXP/renderXP (XP lưu ở key riêng
// 'planner-xp', đồng bộ đám mây như mọi key planner-*, không reset khi đổi tháng/năm),
// và render helpers thuần: habitPct, dayPct, donutSVG, checkboxHTML.
// xpTotal là state RIÊNG của module (không nằm trong global lexical app.js).
// Deps resolve qua global lexical tại thời điểm GỌI — pattern mood.js/popups.js:
//   t, confettiBurst (popups.js), TaskFlowUI, window.Sync/PlanMath, habitDaysElapsed,
//   PLAN_YEAR/PLAN_MONTH/NUM_DAYS
// Đều nằm trong global lexical của app.js (script load sau) hoặc window — resolve runtime.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowXP = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ============================ XP & Cấp độ (Gamification) ============================ */

  let xpTotal = 0;

  function loadXP() {
    try {
      const r = JSON.parse(localStorage.getItem('planner-xp'));
      xpTotal = r && typeof r.xp === 'number' && r.xp >= 0 ? r.xp : 0;
    } catch (e) { xpTotal = 0; }
  }
  function saveXP() {
    try { localStorage.setItem('planner-xp', JSON.stringify({ xp: xpTotal, updatedAt: Date.now() })); } catch (e) { /* ẩn */ }
    if (window.Sync) window.Sync.push('planner-xp');
  }
  // Cấp độ: cần 100 XP lên cấp 2, mỗi cấp sau tăng thêm 50 XP (100 → 150 → 200 → …)
  function xpLevelInfo(xp) {
    let level = 1, need = 100, acc = 0;
    while (xp >= acc + need) { acc += need; level++; need += 50; }
    return { level, cur: xp - acc, need, pct: Math.min(100, Math.max(0, Math.round(((xp - acc) / need) * 100))) };
  }
  function addXP(n) {
    if (!(n > 0)) return;
    const before = xpLevelInfo(xpTotal);
    xpTotal += n;
    saveXP();
    renderXP();
    const after = xpLevelInfo(xpTotal);
    if (after.level > before.level) {
      confettiBurst();
      TaskFlowUI.toast(t('levelUp', { lv: after.level }), 'success');
    }
  }
  function removeXP(n) {
    if (!(n > 0)) return;
    xpTotal = Math.max(0, xpTotal - n);
    saveXP();
    renderXP();
  }
  function renderXP() {
    const info = xpLevelInfo(xpTotal);
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const pill = document.getElementById('appXp');
    if (pill) pill.hidden = false;
    const card = document.getElementById('xpCard');
    if (card) card.hidden = false;
    const lv = t('xpLevel', { lv: info.level });
    const bar = info.cur + ' / ' + info.need + ' XP';
    set('appXpLevel', lv);
    set('appXpNum', bar);
    set('xpCardLevel', lv);
    set('xpCardSub', bar);
    const f1 = document.getElementById('appXpFill');
    if (f1) f1.style.width = info.pct + '%';
    const f2 = document.getElementById('xpCardFill');
    if (f2) f2.style.width = info.pct + '%';
  }

  /* ============================ Render helpers thuần ============================ */

  function habitPct(h) {
    const days = Array.isArray(h.days) ? h.days : [];
    return window.PlanMath ? window.PlanMath.habitPctFrom(days, habitDaysElapsed(PLAN_YEAR, PLAN_MONTH, NUM_DAYS), h.target) : 0;
  }
  function dayPct(day) {
    const tasks = Array.isArray(day.tasks) ? day.tasks : [];
    return tasks.length ? Math.round((tasks.filter((task) => task.done).length / tasks.length) * 100) : 0;
  }
  function donutSVG(pct, size = 140, stroke = 18, color = '#F39A82') {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const off = c * (1 - pct / 100);
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${t('doneAria', { p: pct })}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(74,64,58,.12)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
      transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset .6s ease"/>
  </svg>`;
  }

  function checkboxHTML(mod, checked, attrs = '', label) {
    const cls = mod ? ` cb-${mod}` : '';
    const a11y = window.TaskFlowUI.checkboxA11y(checked, label);
    return `<button type="button" class="checkbox${cls}" ${a11y} ${attrs}></button>`;
  }

  return { loadXP, saveXP, xpLevelInfo, addXP, removeXP, renderXP, habitPct, dayPct, donutSVG, checkboxHTML };
});
