// TaskFlow — Streak / Heatmap UI (tách từ app.js trong P11 refactor, extraction 33 — R14).
// Gồm: weekHabitPct, weekCompareHTML, dayAggregateAt, heatHeroHTML, heatRibbonHTML,
// habitMiniHTML, habitHeatCardHTML (widget streak-heatmap), shareTopInfo, canvasCircle,
// streakCardBlob, doShareStreak (card 1080×1080 + chia sẻ). Calc streak/heat đã ở
// js/streak.js + js/habits.js; phần này là renderers + share.
// LƯU Ý coupling: module này KHÔNG sở hữu state app; resolve dependencies qua global
// lexical tại thời điểm GỌI — pattern mood.js/popups.js:
//   t, esc, state, PLAN_YEAR/PLAN_MONTH/NUM_DAYS/PLAN_START, nowInfo, monthStateRaw,
//   streakAnchorDay/habitDaysAt/habitStreakCached/clearStreakCache (TaskFlowStreak),
//   heatLevel/dayAggregate (TaskFlowHabits), habitPct (TaskFlowXP), shortMonth (TaskFlowPlanMini),
//   getLang, TaskFlowUI, trackEvent
// Đều nằm trong global lexical của app.js (script load sau) hoặc window — resolve runtime.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowStreakUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function weekHabitPct(wk) {
    if (wk < 1) return null;
    const first = new Date(PLAN_YEAR, PLAN_MONTH, 1);
    const dow0 = (first.getDay() + 6) % 7;
    let sum = 0, n = 0;
    for (let d = 0; d < NUM_DAYS; d++) {
      if (Math.floor((dow0 + d) / 7) + 1 === wk) { sum += dayAggregate(state, d); n++; }
    }
    return n ? Math.round(sum / n) : null;
  }

  function weekCompareHTML() {
    const ti = nowInfo(PLAN_START, NUM_DAYS);
    const curWeek = ti.inRange ? ti.week : state.currentWeek;
    const thisWk = weekHabitPct(curWeek);
    const lastWk = weekHabitPct(curWeek - 1);
    if (thisWk === null || lastWk === null) {
      return `<div class="hm-wkcompare" data-role="hm-week-compare"><span class="hm-wk-item">${t('hmNoData')}</span></div>`;
    }
    const diff = thisWk - lastWk;
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '＝';
    const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    return `<div class="hm-wkcompare" data-role="hm-week-compare">
    <span class="hm-wk-item">${t('hmThis')} <b>${thisWk}%</b></span>
    <span class="hm-wk-item">${t('hmLast')} <b>${lastWk}%</b></span>
    <span class="hm-delta ${cls}">${arrow} ${Math.abs(diff)}%</span>
  </div>`;
  }

  /* ---- Ribbon đa tháng: % hoàn thành của một ngày bất kỳ (y,m,d) ---- */
  function dayAggregateAt(y, m, d) {
    let hs = null;
    if (y === PLAN_YEAR && m === PLAN_MONTH) hs = state.habits;
    else {
      const s = monthStateRaw(y, m);
      hs = s ? s.habits : null;
    }
    if (!hs || !hs.length) return 0;
    let sum = 0;
    hs.forEach((hh) => { if (Array.isArray(hh.days) && hh.days[d]) sum++; });
    return Math.round((sum / hs.length) * 100);
  }

  // Hero: thói quen có chuỗi 🔥 dài nhất + thanh tiến tới kỷ lục 🏆
  function heatHeroHTML() {
    let top = null;
    state.habits.forEach((h) => {
      const s = habitStreakCached(h, PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
      if (!top || s.cur > top.s.cur) top = { h, s };
    });
    if (!top) return '';
    const { cur, best } = top.s;
    const pct = best ? Math.min(100, Math.round((cur / best) * 100)) : 0;
    const note = cur === 0 ? t('hmHeroStart')
      : best > 0 && cur >= best ? t('hmHeroNew')
      : t('hmHeroRec', { n: best - cur });
    return `<div class="hm-hero">
    <div class="hm-hero-flame" aria-hidden="true">🔥</div>
    <div class="hm-hero-main">
      <div class="hm-hero-top">
        <b class="hm-hero-num" data-role="hm-hero-cur">${cur}</b>
        <span class="hm-hero-unit">${t('hmHeroDays')}</span>
        <span class="hm-hero-name" data-role="hm-hero-name">${esc(top.h.name)}</span>
      </div>
      <div class="hm-hero-track"><div class="hm-hero-fill" data-role="hm-hero-fill" style="width:${pct}%"></div></div>
      <div class="hm-hero-note" data-role="hm-hero-note">${note}</div>
    </div>
    <div class="hm-hero-rec">
      <span class="hm-rec-ico" aria-hidden="true">🏆</span>
      <b data-role="hm-hero-best">${best}</b>
      <span>${t('hmHeroRecLbl')}</span>
    </div>
  </div>`;
  }

  // Dải 90 ngày xuyên 3 tháng, kiểu GitHub (cột = tuần, hàng = thứ), có nhãn tháng.
  function heatRibbonHTML() {
    const now = new Date();
    const inRange = now.getFullYear() === PLAN_YEAR && now.getMonth() === PLAN_MONTH;
    const anchor = streakAnchorDay(PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
    const anchorDate = new Date(PLAN_YEAR, PLAN_MONTH, anchor + 1);
    const start = new Date(anchorDate.getTime() - 89 * 86400000);
    const monday = new Date(start);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const dayNames = getLang() === 'vi' ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    const cols = [];
    const tags = [];
    let prevMonthKey = null;
    for (let w = 0; ; w++) {
      const colStart = new Date(monday.getTime() + w * 7 * 86400000);
      if (colStart > anchorDate) break;
      let col = '';
      let monthKey = null;
      for (let dow = 0; dow < 7; dow++) {
        const dt = new Date(colStart.getTime() + dow * 86400000);
        if (dt < start || dt > anchorDate) { col += '<span class="hm-rb-cell hm-empty"></span>'; continue; }
        const y = dt.getFullYear(), m = dt.getMonth(), d = dt.getDate() - 1;
        if (monthKey === null) monthKey = y + '-' + m;
        const pct = dayAggregateAt(y, m, d);
        const lvl = heatLevel(pct);
        const isToday = inRange && y === now.getFullYear() && m === now.getMonth() && d === now.getDate() - 1;
        col += `<span class="hm-rb-cell hm-l${lvl}${isToday ? ' today' : ''}" data-role="hm-rb-cell" data-y="${y}" data-m="${m}" data-d="${d}" title="${t('hmDayFullT', { m: shortMonth(m), d: d + 1, p: pct })}"></span>`;
      }
      cols.push(`<div class="hm-rb-col">${col}</div>`);
      tags.push(`<span class="hm-rb-tag${monthKey !== null && monthKey !== prevMonthKey ? ' show' : ''}">${monthKey !== null ? shortMonth(+monthKey.split('-')[1]) : ''}</span>`);
      if (monthKey !== null) prevMonthKey = monthKey;
    }
    // Luôn gắn nhãn tháng anchor (tháng đang xem) — nó có thể nằm cuối cột tuần
    // bắt đầu từ tháng trước nên chưa từng được đánh dấu (vd: đầu tháng ở cuối tuần).
    const anchorKey = PLAN_YEAR + '-' + PLAN_MONTH;
    if (prevMonthKey !== anchorKey && tags.length) {
      tags[tags.length - 1] = `<span class="hm-rb-tag show">${shortMonth(PLAN_MONTH)}</span>`;
    }
    return `<div class="hm-rb-scroll">
    <div class="hm-rb">
      <div class="hm-rb-side">
        <span class="hm-rb-tag hm-spacer" aria-hidden="true"></span>
        ${dayNames.map((n) => `<span class="hm-rb-dlabel">${n}</span>`).join('')}
      </div>
      <div class="hm-rb-main">
        <div class="hm-rb-tags">${tags.join('')}</div>
        <div class="hm-rb-cols">${cols.join('')}</div>
      </div>
    </div>
  </div>`;
  }

  // Vệt 14 ngày gần nhất của một thói quen (cho hàng streak).
  function habitMiniHTML(h) {
    const anchor = streakAnchorDay(PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
    const cells = [];
    for (let back = 13; back >= 0; back--) {
      const dt = new Date(PLAN_YEAR, PLAN_MONTH, anchor + 1 - back);
      const y = dt.getFullYear(), m = dt.getMonth(), d = dt.getDate() - 1;
      const days = habitDaysAt(y, m, h, PLAN_YEAR, PLAN_MONTH);
      cells.push(`<i class="hm-mini-cell${days && days[d] ? ' on' : ''}"></i>`);
    }
    return cells.join('');
  }

  function habitHeatCardHTML() {
    clearStreakCache();
    const streaks = state.habits.map((h) => {
      const s = habitStreakCached(h, PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
      return `<div class="hm-streak-row">
      <div class="hm-streak-top">
        <span class="hm-streak-name" title="${esc(h.name)}">${esc(h.name)}</span>
        <span class="hm-streak-pct">${habitPct(h)}%</span>
      </div>
      <div class="hm-streak-bottom">
        <span class="hm-mini" data-role="hm-mini" data-id="${h.id}" title="${t('hmMiniT')}">${habitMiniHTML(h)}</span>
        <span class="hm-streak-badges">
          <span class="hm-streak-badge" title="${t('hmCur')}">🔥<b data-role="hm-streak-cur" data-id="${h.id}">${s.cur}</b></span>
          <span class="hm-streak-badge" title="${t('hmBest')}">🏆<b data-role="hm-streak-best" data-id="${h.id}">${s.best}</b></span>
        </span>
      </div>
    </div>`;
    }).join('') || `<p class="empty-cell">${t('hmNoHabits')}</p>`;

    return `<div class="card habit-heat-card">
    <div class="hm-head">
      <h3 class="card-title">${t('hmTitle')}</h3>
      ${weekCompareHTML()}
      <button type="button" class="pop-btn share-btn" data-action="share-streak">${window.TaskFlowUI ? window.TaskFlowUI.icon('upload') : ''}${t('shareTitle')}</button>
      <button type="button" class="pop-btn share-btn" data-action="report" title="${t('reportTitle')}">${window.TaskFlowUI ? window.TaskFlowUI.icon('report') : ''} ${t('reportTitle')}</button>
    </div>
    ${heatHeroHTML()}
    ${heatRibbonHTML()}
    <div class="hm-legend">
      <span>${t('hmLess')}</span>
      <span class="hm-rb-cell hm-l0"></span><span class="hm-rb-cell hm-l1"></span><span class="hm-rb-cell hm-l2"></span><span class="hm-rb-cell hm-l3"></span><span class="hm-rb-cell hm-l4"></span><span class="hm-rb-cell hm-l5"></span>
      <span>${t('hmMore')}</span>
    </div>
    <div class="hm-streaks">${streaks}</div>
  </div>`;
  }

  /* ---- Chia sẻ streak 🔥: tạo ảnh card 1080×1080 (tên + streak + heatmap) ---- */
  function shareTopInfo() {
    let top = null;
    state.habits.forEach((h) => {
      const s = habitStreakCached(h, PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
      if (!top || s.cur > top.s.cur) top = { h, s };
    });
    return top;
  }

  function canvasCircle(g, x, y, r) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  function streakCardBlob(name, habitName, cur, best) {
    return new Promise((resolve, reject) => {
      try {
        const W = 1080, H = 1080;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d');

        const grad = g.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, '#FFF6EA');
        grad.addColorStop(0.55, '#FDEBD7');
        grad.addColorStop(1, '#F8DCC0');
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);

        g.fillStyle = 'rgba(255,255,255,.5)';
        canvasCircle(g, W - 110, 130, 170);
        canvasCircle(g, 40, H - 150, 230);
        g.fillStyle = 'rgba(194,78,40,.05)';
        canvasCircle(g, W - 190, H - 220, 130);
        g.fillStyle = 'rgba(185,138,31,.08)';
        canvasCircle(g, 200, 150, 90);

        g.textAlign = 'center';

        g.fillStyle = '#4A403A';
        g.font = "700 36px 'Nunito',sans-serif";
        g.fillText('🐥 TaskFlow', W / 2, 96);

        g.fillStyle = '#8A7A6B';
        g.font = "700 42px 'Nunito',sans-serif";
        g.fillText(name, W / 2, 158);

        g.fillStyle = '#C24E28';
        g.font = "800 260px 'Nunito',sans-serif";
        g.fillText(String(cur), W / 2, 400);

        g.fillStyle = '#4A403A';
        g.font = "700 46px 'Nunito',sans-serif";
        g.fillText(t('hmHeroDays'), W / 2, 468);

        g.font = "700 34px 'Nunito',sans-serif";
        const tw = g.measureText('🔥 ' + habitName).width;
        const pw = tw + 48, ph = 62;
        g.fillStyle = 'rgba(255,253,248,.85)';
        g.beginPath();
        if (g.roundRect) g.roundRect(W / 2 - pw / 2, 506, pw, ph, 31);
        else g.rect(W / 2 - pw / 2, 506, pw, ph);
        g.fill();
        g.fillStyle = '#C24E28';
        g.fillText('🔥 ' + habitName, W / 2, 548);

        g.fillStyle = '#B98A1F';
        g.font = "800 38px 'Nunito',sans-serif";
        g.fillText('🏆 ' + best + ' · ' + t('hmHeroRecLbl'), W / 2, 636);

        // Heatmap: 16 tuần × 7 ngày
        const anchor = streakAnchorDay(PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
        const anchorDate = new Date(PLAN_YEAR, PLAN_MONTH, anchor + 1);
        const start = new Date(anchorDate.getTime() - (16 * 7 - 1) * 86400000);
        const monday = new Date(start);
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        const levels = ['#EFE6DA', '#FBE4CE', '#F7C79B', '#EE9E66', '#E0753F', '#C24E28'];
        const cell = 42, gap = 8, colW = cell + gap, rowH = cell + gap;
        const gridW = 16 * colW - gap;
        const x0 = (W - gridW) / 2, y0 = 716;
        const now = new Date();
        const inRange = now.getFullYear() === PLAN_YEAR && now.getMonth() === PLAN_MONTH;
        for (let w = 0; w < 16; w++) {
          const colStart = new Date(monday.getTime() + w * 7 * 86400000);
          for (let dow = 0; dow < 7; dow++) {
            const dt = new Date(colStart.getTime() + dow * 86400000);
            if (dt < start || dt > anchorDate) continue;
            const y = dt.getFullYear(), m = dt.getMonth(), d = dt.getDate() - 1;
            const lvl = heatLevel(dayAggregateAt(y, m, d));
            g.fillStyle = levels[lvl];
            g.beginPath();
            if (g.roundRect) g.roundRect(x0 + w * colW, y0 + dow * rowH, cell, cell, 12);
            else g.rect(x0 + w * colW, y0 + dow * rowH, cell, cell);
            g.fill();
            const isToday = inRange && y === now.getFullYear() && m === now.getMonth() && d === now.getDate() - 1;
            if (isToday) {
              g.strokeStyle = '#C24E28';
              g.lineWidth = 5;
              g.stroke();
            }
          }
        }

        g.fillStyle = '#8A7A6B';
        g.font = "700 30px 'Nunito',sans-serif";
        g.fillText(t('shareFooter'), W / 2, H - 70);

        c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
      } catch (e) { reject(e); }
    });
  }

  async function doShareStreak() {
    const top = shareTopInfo();
    if (!top || top.s.cur === 0) { TaskFlowUI.toast(t('shareNoStreak'), 'error'); return; }
    let name = localStorage.getItem('planner-name');
    if (!name) {
      name = (prompt(t('shareNamePrompt')) || '').trim() || t('meName');
      try { localStorage.setItem('planner-name', name); } catch (e) { /* ẩn */ }
    }
    try {
      const blob = await streakCardBlob(name, top.h.name, top.s.cur, top.s.best);
      const file = new File([blob], 'taskflow-streak.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'TaskFlow 🐥',
            text: '🔥 ' + top.s.cur + ' ' + t('hmHeroDays') + ' · ' + top.h.name,
          });
          trackEvent('share_streak', { days: top.s.cur, via: 'native' });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;
          trackEvent('share_streak', { days: top.s.cur, via: 'fallback' });
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'taskflow-streak.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
      trackEvent('share_streak', { days: top.s.cur, via: 'download' });
      TaskFlowUI.toast(t('shareDone'), 'success');
    } catch (e) {
      TaskFlowUI.toast(t('shareFail'), 'error');
    }
  }

  return { weekHabitPct, weekCompareHTML, dayAggregateAt, heatHeroHTML, heatRibbonHTML, habitMiniHTML, habitHeatCardHTML, shareTopInfo, canvasCircle, streakCardBlob, doShareStreak };
});
