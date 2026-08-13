// TaskFlow — Báo cáo tháng/tuần (tách từ app.js trong P11 refactor, extraction 35 — R15).
// Gồm: monthlyReportData, renderReportModal, open/closeReportModal, reportCardBlob,
// doShareReport, weeklyReportData, lastWeekReportData, vsCell, focusReportBars,
// renderWeekReportModal, open/closeWeekReportModal, weekReportCardBlob, doShareWeekReport.
// year-report.js (lazy, P1.5) cũng gọi focusReportBars qua global lexical — module này
// phải expose + app.js phải giữ alias để lazy module resolve được.
// Deps resolve qua global lexical tại thời điểm GỌI — pattern mood.js/popups.js:
//   t, esc, monthLabel, dayLabelShort (TaskFlowDates), donutSVG (TaskFlowXP), weeklyStats/
//   monthlyStats (TaskFlowStats), habitPct (TaskFlowXP), habitStreakCached (TaskFlowStreak),
//   dayAggregate (TaskFlowHabits), dayAggregateAt/canvasCircle (TaskFlowStreakUI),
//   psStart (TaskFlowPlanMini), monthStateRaw (TaskFlowStorage), window.PlanMath,
//   focusMonthMinutes/focusWeekMinutes/topFocusTasksInMonth/topFocusTasksInWeek/
//   taskFocusMinLabel/pomoDaySecs, state, PLAN_YEAR/PLAN_MONTH/NUM_DAYS, TaskFlowUI, trackEvent
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowReportUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ---------- Báo cáo tháng 📊 ---------- */
  function monthlyReportData() {
    const ms = monthlyStats(state);
    const pcts = state.habits.map((h) => habitPct(h));
    const habitAvg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
    let top = null, rec = null;
    state.habits.forEach((h) => {
      const s = habitStreakCached(h, PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
      if (!top || s.cur > top.s.cur) top = { h, s };
      if (!rec || s.best > rec.s.best) rec = { h, s };
    });
    let activeDays = 0;
    for (let d = 0; d < NUM_DAYS; d++) if (dayAggregate(state, d) > 0) activeDays++;
    // Phase 7: thống kê focus của tháng (phút/ngày gộp theo tuần + top task)
    const focusTotal = focusMonthMinutes();
    const focusByWeek = state.weeks.map((w) => focusWeekMinutes(w.n).reduce((a, b) => a + b, 0));
    const topTask = topFocusTasksInMonth(1)[0] || null;
    return {
      y: PLAN_YEAR, m: PLAN_MONTH,
      goalPct: ms.pct, goalDone: ms.done, goalTotal: ms.total,
      habitAvg, top, rec, activeDays, numDays: NUM_DAYS,
      weekPcts: state.weeks.map((w) => weekStats(w).pct),
      focusTotal, focusByWeek, topTask,
    };
  }

  function reportMoodEntries(historyEntries) {
    const daily = (Array.isArray(historyEntries) ? historyEntries : []).filter((entry) => entry && entry.type === 'daily' && Number.isInteger(entry.mood)).map((entry) => ({ date: entry.date, mood: entry.mood }));
    if (daily.length >= 3) return daily;
    const seen = new Set(daily.map((entry) => entry.date));
    const fallback = [];
    if (typeof moodMap === 'object' && moodMap) Object.keys(moodMap).forEach((key) => {
      const match = key.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      const value = moodMap[key];
      if (!match || !Number.isInteger(value) || value < 0 || value > 4) return;
      const date = `${match[1]}-${String(+match[2]).padStart(2, '0')}-${String(+match[3]).padStart(2, '0')}`;
      if (!seen.has(date)) fallback.push({ date, mood: value + 1 });
    });
    return daily.concat(fallback);
  }

  function growthReportHTML(monthlyReviewModel) {
    const { monthlyBalance, metricRecommendations, moodTrend } = window.TaskFlowReportInsights;
    const historyEntries = window.TaskFlowReflectionHistory.collectReflectionHistory(localStorage);
    const balance = monthlyBalance(monthlyReviewModel);
    const guidance = metricRecommendations(monthlyReviewModel);
    const trend = moodTrend(reportMoodEntries(historyEntries));
    const balanceRows = balance.length ? balance.map((pillar) => `<li class="report-balance-row">
      <div class="report-balance-head"><strong>${esc((pillar.icon ? pillar.icon + ' ' : '') + pillar.name)}</strong><span>${pillar.pct}%</span></div>
      <div class="report-balance-progress" role="progressbar" aria-label="${esc(pillar.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pillar.pct}"><span style="width:${pillar.pct}%"></span></div>
      <div class="report-balance-detail"><span>${t('monthlyReviewStrongest')}: ${esc(pillar.strongest && pillar.strongest.title || '—')}</span><span>${t('monthlyReviewAttention')}: ${esc(pillar.attention && pillar.attention.title || '—')}</span></div>
    </li>`).join('') : `<li class="report-growth-empty">${t('reportBalanceEmpty')}</li>`;
    const guidanceHTML = guidance.length ? `<ul>${guidance.map((item) => `<li class="is-${item.tone}"><strong>${esc(item.metricTitle)} · ${item.pct}%</strong><span>${t(item.messageKey, { metric: item.metricTitle, pct: item.pct })}</span></li>`).join('')}</ul>` : `<p class="report-growth-empty">${t('reportGuidanceEmpty')}</p>`;
    const moodHTML = trend.available ? `<div class="report-mood-chart" aria-label="${t('reportMoodDistribution')}">${trend.distribution.map((count, index) => `<div><span class="report-mood-bar" style="height:${Math.max(8, count / trend.sampleCount * 100)}%"></span><strong>${index + 1}</strong><small>${count}</small></div>`).join('')}</div><p>${t(trend.directionKey, { n: trend.sampleCount })}</p>` : `<p class="report-growth-empty">${t('reportMoodEmpty', { n: trend.sampleCount })}</p>`;
    return `<section class="report-growth" data-testid="report-growth">
      <div class="report-growth-section"><h3>${t('reportBalanceTitle')}</h3><ul class="report-balance-list">${balanceRows}</ul></div>
      <div class="report-growth-section" data-testid="report-guidance"><h3>${t('reportGuidanceTitle')}</h3>${guidanceHTML}</div>
      <div class="report-growth-section" data-testid="report-mood-trend"><h3>${t('reportMoodTitle')}</h3>${moodHTML}</div>
      <div class="report-history-launch"><div><h3>${t('reportHistoryTitle')}</h3><p>${t('reportHistoryIntro')}</p></div><button type="button" class="button" data-action="report-history-open-panel">${t('reportHistoryOpenPanel')}</button></div>
    </section>`;
  }

  function renderReportModal() {
    const el = document.getElementById('reportContent');
    if (!el) return;
    const r = monthlyReportData();
    const topName = r.top ? esc(r.top.h.name) : '—';
    const recName = r.rec ? esc(r.rec.h.name) : '—';
    const { buildMonthlyReviewModel, monthlyReviewHTML } = window.TaskFlowMonthlyReview;
    const monthlyReviewModel = buildMonthlyReviewModel(state, {
      year: PLAN_YEAR,
      month: PLAN_MONTH,
      monthDays: NUM_DAYS,
      metricProgress: window.TaskFlowPillars.metricProgress,
      legacyPrompts: REFLECT_PROMPTS_MONTH(),
    });
    el.innerHTML = `
    <div class="report-head">
      <div class="donut-wrap"><div class="donut">${donutSVG(r.goalPct, 96, 12, '#C24E28')}</div>
        <div class="donut-center"><span>${r.goalPct}%</span><small>${t('reportGoalPct')}</small></div>
      </div>
    </div>
    <div class="report-grid">
      <div class="report-cell"><b>${r.habitAvg}%</b><span>${t('reportHabitAvg')}</span></div>
      <div class="report-cell"><b>${r.goalDone}/${r.goalTotal}</b><span>${t('reportGoalsDone')}</span></div>
      <div class="report-cell"><b>🔥 ${r.top ? r.top.s.cur : 0}</b><span>${t('reportTopHabit')} · ${topName}</span></div>
      <div class="report-cell"><b>🏆 ${r.rec ? r.rec.s.best : 0}</b><span>${t('reportRecord')} · ${recName}</span></div>
      <div class="report-cell"><b>${r.activeDays}/${r.numDays}</b><span>${t('reportActive')}</span></div>
      <div class="report-cell"><b>🎯 ${r.focusTotal}p</b><span>${t('reportFocusMonth')}</span></div>
      <div class="report-cell"><b>⭐ ${r.topTask ? taskFocusMinLabel(r.topTask.secs) : '—'}</b><span>${t('reportFocusTop')}</span></div>
    </div>
    <div class="report-weekbars" aria-hidden="true">${r.weekPcts.map((p) => `<div class="rw-bar" style="height:${Math.max(p, 4)}%"></div>`).join('')}</div>
    <div class="report-focus">
      <div class="report-focus-head"><b>🎯 ${r.focusTotal}p</b><span>${t('reportFocusMonth')}</span>${r.topTask ? `<span class="report-focus-top">${t('reportFocusTop')}: ${esc((r.topTask.tk.text || '…').slice(0, 20))} · ${taskFocusMinLabel(r.topTask.secs)}</span>` : ''}</div>
      ${focusReportBars(r.focusByWeek, (i) => String(i + 1))}
    </div>
    ${growthReportHTML(monthlyReviewModel)}
    ${monthlyReviewHTML(monthlyReviewModel, { t, esc })}`;
  }

  function openReportModal() {
    const m = document.getElementById('reportModal');
    if (!m) return;
    renderReportModal();
    TaskFlowUI.openDialog('reportModal');
    const card = m.querySelector('.report-modal-card');
    if (card) {
      card.scrollTop = 0;
      requestAnimationFrame(() => { card.scrollTop = 0; });
    }
  }

  function closeReportModal() {
    TaskFlowUI.closeDialog('reportModal');
  }

  // Tạo ảnh báo cáo 1080×1080 (style streak card) để chia sẻ.
  function reportCardBlob(r) {
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

        g.textAlign = 'center';
        g.fillStyle = '#4A403A';
        g.font = "700 36px 'Nunito',sans-serif";
        g.fillText('🐥 TaskFlow', W / 2, 96);
        g.fillStyle = '#8A7A6B';
        g.font = "700 42px 'Nunito',sans-serif";
        g.fillText(t('reportCardTitle', { m: monthLabel(r.m), y: r.y }), W / 2, 158);

        g.fillStyle = '#C24E28';
        g.font = "800 120px 'Nunito',sans-serif";
        g.fillText(r.goalPct + '%', W / 2, 300);
        g.fillStyle = '#4A403A';
        g.font = "700 40px 'Nunito',sans-serif";
        g.fillText(t('reportGoalPct') + ' · ' + r.goalDone + '/' + r.goalTotal, W / 2, 352);

        const rows = [
          [t('reportHabitAvg'), r.habitAvg + '%'],
          [t('reportTopHabit'), r.top ? '🔥 ' + r.top.s.cur + ' · ' + r.top.h.name : '—'],
          [t('reportRecord'), r.rec ? '🏆 ' + r.rec.s.best + ' · ' + r.rec.h.name : '—'],
          [t('reportActive'), r.activeDays + '/' + r.numDays],
        ];
        g.font = "700 34px 'Nunito',sans-serif";
        rows.forEach((row, i) => {
          const y = 430 + i * 74;
          const pw = g.measureText(row[0] + '  ' + row[1]).width + 56, ph = 58;
          g.fillStyle = 'rgba(255,253,248,.85)';
          g.beginPath();
          if (g.roundRect) g.roundRect(W / 2 - pw / 2, y - ph + 16, pw, ph, 29);
          else g.rect(W / 2 - pw / 2, y - ph + 16, pw, ph);
          g.fill();
          g.fillStyle = '#8A7A6B';
          g.textAlign = 'left';
          g.fillText(row[0], W / 2 - pw / 2 + 28, y + 4);
          g.fillStyle = '#C24E28';
          g.textAlign = 'right';
          g.fillText(row[1], W / 2 + pw / 2 - 28, y + 4);
          g.textAlign = 'center';
        });

        g.fillStyle = '#8A7A6B';
        g.font = "700 30px 'Nunito',sans-serif";
        g.fillText(t('shareFooter', { year: PLAN_YEAR }), W / 2, H - 70);

        c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
      } catch (e) { reject(e); }
    });
  }

  async function doShareReport() {
    const r = monthlyReportData();
    let name = localStorage.getItem('planner-name');
    if (!name) {
      name = (prompt(t('shareNamePrompt')) || '').trim() || t('meName');
      try { localStorage.setItem('planner-name', name); } catch (e) { /* ẩn */ }
    }
    try {
      const blob = await reportCardBlob(r);
      const file = new File([blob], 'taskflow-report.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'TaskFlow 🐥',
            text: '📊 ' + t('reportCardTitle', { m: monthLabel(r.m), y: r.y }) + ' · ' + r.goalPct + '%',
          });
          trackEvent('share_report', { goalPct: r.goalPct, via: 'native' });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;
          trackEvent('share_report', { goalPct: r.goalPct, via: 'fallback' });
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'taskflow-report.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
      trackEvent('share_report', { goalPct: r.goalPct, via: 'download' });
      TaskFlowUI.toast(t('shareDone'), 'success');
    } catch (e) {
      TaskFlowUI.toast(t('shareFail'), 'error');
    }
  }

  /* ---------- Báo cáo tuần (Phase 4) ---------- */

  // Số liệu tuần: % goals + habit theo từng ngày + top habit + ngày năng suất nhất.
  function weeklyReportData(w) {
    const st = weekStats(w);
    const habitByDay = [];
    for (let di = 0; di < 7; di++) {
      const gi = (w.n - 1) * 7 + di; // chỉ số ngày toàn tháng tương ứng
      habitByDay.push(gi < NUM_DAYS ? dayAggregate(state, gi) : 0);
    }
    let top = null, topN = 0;
    state.habits.forEach((h) => {
      let n = 0;
      for (let di = 0; di < 7; di++) {
        const gi = (w.n - 1) * 7 + di;
        if (gi < NUM_DAYS && h.days[gi]) n++;
      }
      if (n > topN) { topN = n; top = h; }
    });
    let bestDay = 0;
    habitByDay.forEach((p, i) => { if (p > habitByDay[bestDay]) bestDay = i; });
    // Phase 7: thống kê focus của tuần
    const focusByDay = focusWeekMinutes();
    const focusTotal = focusByDay.reduce((a, b) => a + b, 0);
    const topTask = topFocusTasksInWeek(w, 1)[0] || null;
    let bestFocusDay = 0;
    focusByDay.forEach((m, i) => { if (m > focusByDay[bestFocusDay]) bestFocusDay = i; });
    return { n: w.n, pct: st.pct, done: st.done, inProg: st.inProg, total: st.total, habitByDay, top, topN, bestDay, focusByDay, focusTotal, topTask, bestFocusDay };
  }

  // Phase 18: dữ liệu tuần TRƯỚC để so sánh (goal %, task, habit avg, focus phút).
  // Tuần 1 của tháng → lấy tuần cuối tháng trước qua monthStateRaw + dayAggregateAt.
  function lastWeekReportData() {
    const curW = state.currentWeek;
    let pw = null, srcY = PLAN_YEAR, srcM = PLAN_MONTH, srcState = state;
    if (curW > 1) {
      pw = state.weeks[curW - 2];
    } else {
      const pm = window.PlanMath ? window.PlanMath.prevMonth(PLAN_YEAR, PLAN_MONTH) : null;
      if (pm) {
        const ps = monthStateRaw(pm.y, pm.m);
        if (ps && ps.weeks && ps.weeks.length) { pw = ps.weeks[ps.weeks.length - 1]; srcY = pm.y; srcM = pm.m; srcState = ps; }
      }
    }
    if (!pw) return null;
    const st = weekStats(pw);
    const monthDays = new Date(srcY, srcM + 1, 0).getDate();
    let habitSum = 0, habitN = 0;
    for (let di = 0; di < 7; di++) {
      const gi = (pw.n - 1) * 7 + di;
      if (gi < monthDays) {
        habitSum += (srcState === state) ? dayAggregate(state, gi) : dayAggregateAt(srcY, srcM, gi);
        habitN++;
      }
    }
    // Focus: tuần cùng tháng dùng focusWeekMinutes (gốc PLAN_START); tuần cuối tháng trước
    // dùng grid của tháng đó (ps.start) cho đúng cùng cửa sổ 7 ngày với cột habit —
    // không lấy "7 ngày dương lịch cuối" vì tuần grid có thể lệch (vd tuần 5 tháng 12
    // nằm 28/12–3/1, không phải 25/12–31/12).
    let focus = 0;
    if (curW > 1) {
      focus = focusWeekMinutes(pw.n).reduce((a, b) => a + b, 0);
    } else {
      const gridStart = new Date(psStart(srcState, srcY, srcM)).getTime();
      for (let di = 0; di < 7; di++) {
        const gi = (pw.n - 1) * 7 + di;
        if (gi < monthDays) focus += pomoDaySecs(new Date(gridStart + gi * 86400000));
      }
      focus = Math.round(focus / 60);
    }
    const out = { pct: st.pct, done: st.done, total: st.total, habitAvg: habitN ? Math.round(habitSum / habitN) : 0, focus };
    // Tuần trước tồn tại nhưng trống rỗng → không hiển thị block so sánh gây hiểu nhầm
    if (out.total === 0 && out.habitAvg === 0 && out.focus === 0) return null;
    return out;
  }

  // Ô so sánh tuần này vs tuần trước — delta chip ▲/▼, mỗi chỉ số trả lời 1 câu hỏi.
  function vsCell(label, curText, diff, unit) {
    let chip = '';
    if (diff !== null && diff !== undefined) {
      if (diff === 0) chip = `<span class="vs-chip vs-same">—</span>`;
      else chip = `<span class="vs-chip ${diff > 0 ? 'vs-up' : 'vs-down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}${unit}</span>`;
    }
    return `<div class="vs-cell"><span class="vs-label">${label}</span><b class="vs-value">${curText}</b>${chip}</div>`;
  }

  // Dải cột focus cho báo cáo — có nhãn dưới mỗi cột, hiển thị empty state khi chưa có phiên.
  function focusReportBars(values, labelFn) {
    const max = Math.max(...values, 1);
    const has = values.some((v) => v > 0);
    if (!has) return `<p class="report-focus-empty">${t('focusChartEmpty')}</p>`;
    return `<div class="report-focus-bars">
    <div class="report-weekbars" aria-hidden="true">${values.map((v) => `<div class="rw-bar${v > 0 ? '' : ' is-zero'}" style="height:${Math.max(v > 0 ? 10 : 3, Math.round((v / max) * 100))}%"></div>`).join('')}</div>
    <div class="report-focus-labels">${values.map((v, i) => `<span>${labelFn(i)}</span>`).join('')}</div>
  </div>`;
  }

  function renderWeekReportModal() {
    const el = document.getElementById('weekReportContent');
    if (!el) return;
    const w = state.weeks[state.currentWeek - 1];
    if (!w) return;
    const r = weeklyReportData(w);
    const topName = r.top ? esc(r.top.name) : '—';
    // Phase 18: tuần này vs tuần trước — chỉ hiện khi có dữ liệu tuần trước
    const lw = lastWeekReportData();
    const curHabitAvg = r.habitByDay.length ? Math.round(r.habitByDay.reduce((a, b) => a + b, 0) / r.habitByDay.length) : 0;
    const vsBlock = lw ? `<div class="report-vs" aria-label="${t('reportVsTitle')}">
      <h4 class="report-vs-title">${t('reportVsTitle')}</h4>
      <div class="report-vs-grid">
        ${vsCell(t('reportVsGoal'), r.pct + '%', r.pct - lw.pct, '%')}
        ${vsCell(t('reportVsTasks'), r.done + '/' + r.total, r.done - lw.done, '')}
        ${vsCell(t('reportVsHabit'), curHabitAvg + '%', curHabitAvg - lw.habitAvg, '%')}
        ${vsCell(t('reportVsFocus'), r.focusTotal + 'p', r.focusTotal - lw.focus, 'p')}
      </div>
    </div>` : '';
    el.innerHTML = `
    <div class="report-head">
      <div class="donut-wrap"><div class="donut">${donutSVG(r.pct, 96, 12, '#C24E28')}</div>
        <div class="donut-center"><span>${r.pct}%</span><small>${t('weekReportGoalPct')}</small></div>
      </div>
    </div>
    ${vsBlock}
    <div class="report-grid">
      <div class="report-cell"><b>${r.done}</b><span>${t('weekReportDone')}</span></div>
      <div class="report-cell"><b>${r.inProg}</b><span>${t('weekReportInProg')}</span></div>
      <div class="report-cell"><b>${r.total}</b><span>${t('weekReportTotal')}</span></div>
      <div class="report-cell"><b>🔥 ${r.topN}</b><span>${t('weekReportTopHabit')} · ${topName}</span></div>
      <div class="report-cell"><b>⭐ ${t('weekReportDayT', { d: r.bestDay + 1 })}</b><span>${t('weekReportBestDay')} · ${r.habitByDay[r.bestDay]}%</span></div>
      <div class="report-cell"><b>🎯 ${r.focusTotal}p</b><span>${t('reportFocusWeek')}</span></div>
      <div class="report-cell"><b>⭐ ${esc(dayLabelShort(r.bestFocusDay))}</b><span>${t('reportFocusBestDay')} · ${r.focusByDay[r.bestFocusDay]}p</span></div>
    </div>
    <div class="report-weekbars" aria-hidden="true">${r.habitByDay.map((p) => `<div class="rw-bar" style="height:${Math.max(p, 4)}%"></div>`).join('')}</div>
    <div class="report-focus">
      <div class="report-focus-head"><b>🎯 ${r.focusTotal}p</b><span>${t('reportFocusWeek')}</span>${r.topTask ? `<span class="report-focus-top">${t('reportFocusTop')}: ${esc((r.topTask.tk.text || '…').slice(0, 20))} · ${taskFocusMinLabel(r.topTask.secs)}</span>` : ''}</div>
      ${focusReportBars(r.focusByDay, dayLabelShort)}
    </div>`;
  }

  function openWeekReportModal() {
    const m = document.getElementById('weekReportModal');
    if (!m) return;
    renderWeekReportModal();
    TaskFlowUI.openDialog('weekReportModal');
  }

  function closeWeekReportModal() {
    TaskFlowUI.closeDialog('weekReportModal');
  }

  // Ảnh báo cáo tuần 1080×1080 — style streak/report card.
  function weekReportCardBlob(r) {
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
        g.textAlign = 'center';
        g.fillStyle = '#4A403A';
        g.font = "700 36px 'Nunito',sans-serif";
        g.fillText('🐥 TaskFlow', W / 2, 96);
        g.fillStyle = '#8A7A6B';
        g.font = "700 42px 'Nunito',sans-serif";
        g.fillText(t('weekReportCardTitle', { n: r.n }), W / 2, 158);
        g.fillStyle = '#C24E28';
        g.font = "800 120px 'Nunito',sans-serif";
        g.fillText(r.pct + '%', W / 2, 300);
        g.fillStyle = '#4A403A';
        g.font = "700 40px 'Nunito',sans-serif";
        g.fillText(t('weekReportGoalPct') + ' · ' + r.done + '/' + r.total, W / 2, 352);
        const rows = [
          [t('weekReportDone'), r.done],
          [t('weekReportInProg'), r.inProg],
          [t('weekReportTopHabit'), r.top ? '🔥 ' + r.topN + ' · ' + r.top.name : '—'],
          [t('weekReportBestDay'), t('weekReportDayT', { d: r.bestDay + 1 }) + ' · ' + r.habitByDay[r.bestDay] + '%'],
        ];
        g.font = "700 34px 'Nunito',sans-serif";
        rows.forEach((row, i) => {
          const y = 430 + i * 74;
          const pw = g.measureText(row[0] + '  ' + row[1]).width + 56, ph = 58;
          g.fillStyle = 'rgba(255,253,248,.85)';
          g.beginPath();
          if (g.roundRect) g.roundRect(W / 2 - pw / 2, y - ph + 16, pw, ph, 29);
          else g.rect(W / 2 - pw / 2, y - ph + 16, pw, ph);
          g.fill();
          g.fillStyle = '#8A7A6B';
          g.textAlign = 'left';
          g.fillText(row[0], W / 2 - pw / 2 + 28, y + 4);
          g.fillStyle = '#C24E28';
          g.textAlign = 'right';
          g.fillText(String(row[1]), W / 2 + pw / 2 - 28, y + 4);
          g.textAlign = 'center';
        });
        // Bar chart 7 ngày
        const bx = W / 2 - 300, bw = 600, bh = 180, by = 800;
        const w = state.weeks[r.n - 1];
        g.fillStyle = '#8A7A6B';
        g.font = "700 28px 'Nunito',sans-serif";
        g.fillText(t('weekReportBestDay') + ' · ' + (w ? w.days.map((d) => d.date).join(' – ') : '1–7'), W / 2, by - 24);
        const maxP = Math.max(1, ...r.habitByDay);
        r.habitByDay.forEach((p, i) => {
          const h = Math.max(6, (p / maxP) * bh);
          g.fillStyle = '#C24E28';
          g.beginPath();
          if (g.roundRect) g.roundRect(bx + (i * bw) / 7 + 8, by - h, bw / 7 - 16, h, 10);
          else g.rect(bx + (i * bw) / 7 + 8, by - h, bw / 7 - 16, h);
          g.fill();
        });
        g.fillStyle = '#8A7A6B';
        g.font = "700 30px 'Nunito',sans-serif";
        g.fillText(t('shareFooter'), W / 2, H - 60);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
      } catch (e) { reject(e); }
    });
  }

  async function doShareWeekReport() {
    const w = state.weeks[state.currentWeek - 1];
    if (!w) return;
    const r = weeklyReportData(w);
    let name = localStorage.getItem('planner-name');
    if (!name) {
      name = (prompt(t('shareNamePrompt')) || '').trim() || t('meName');
      try { localStorage.setItem('planner-name', name); } catch (e) { /* ẩn */ }
    }
    try {
      const blob = await weekReportCardBlob(r);
      const file = new File([blob], 'taskflow-week-report.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'TaskFlow 🐥',
            text: '📊 ' + t('weekReportShareTxt', { n: r.n, p: r.pct }),
          });
          trackEvent('share_week_report', { pct: r.pct, via: 'native' });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;
          trackEvent('share_week_report', { pct: r.pct, via: 'fallback' });
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'taskflow-week-report.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
      trackEvent('share_week_report', { pct: r.pct, via: 'download' });
      TaskFlowUI.toast(t('shareDone'), 'success');
    } catch (e) {
      TaskFlowUI.toast(t('shareFail'), 'error');
    }
  }

  function coreReportApi() {
    return { monthlyReportData, renderReportModal, openReportModal, closeReportModal, reportCardBlob, doShareReport, weeklyReportData, lastWeekReportData, vsCell, focusReportBars, renderWeekReportModal, openWeekReportModal, closeWeekReportModal, weekReportCardBlob, doShareWeekReport };
  }
  return Object.assign(coreReportApi(), { reportMoodEntries, growthReportHTML });
});
