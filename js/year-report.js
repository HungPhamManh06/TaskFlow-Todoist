// TaskFlow — Báo cáo tổng kết năm (tách từ app.js trong P11 refactor, extraction 25).
// Gồm: yearlyReportData (tổng hợp % goals, 12 tháng, habit tốt, ngày productive nhất,
// focus năm + quý), renderYearReportModal (fill #yearReportContent), open/closeYearReportModal,
// yearReportCardBlob (render 1080×1080 canvas PNG), doShareYearReport (navigator.share
// hoặc fallback download).
// Phụ thuộc app-level (yearGoalStats/yearMonthlyData/bestHabitAcrossYear/bestProductiveDay/
// focusYearByMonth/topFocusTasksInYear/donutSVG/focusReportBars/taskFocusMinLabel/canvasCircle/
// shortMonth (alias TaskFlowPlanMini)/esc/t/TaskFlowUI/trackEvent/PLAN_YEAR) — resolve qua
// global scope tại thời điểm GỌI (pattern inbox/chat/search/quick-add/mood).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowYearReport = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function yearlyReportData() {
    const gs = yearGoalStats();
    const monthly = yearMonthlyData();
    const bh = bestHabitAcrossYear();
    const pd = bestProductiveDay();
    let topMonth = 0;
    monthly.forEach((x, m) => { if (x.pct > monthly[topMonth].pct) topMonth = m; });
    // Phase 8: focus cả năm + tổng kết quý
    const focusByMonth = focusYearByMonth();
    const focusTotal = focusByMonth.reduce((a, b) => a + b, 0);
    const focusByQuarter = [0, 1, 2, 3].map((q) => focusByMonth.slice(q * 3, q * 3 + 3).reduce((a, b) => a + b, 0));
    const topTask = topFocusTasksInYear(PLAN_YEAR, 1)[0] || null;
    return {
      y: PLAN_YEAR,
      pct: gs.pct,
      done: gs.done,
      inProg: gs.inProg,
      total: gs.total,
      months: monthly.map((x) => x.pct),
      topMonth,
      topHabit: bh,
      prodDay: pd,
      focusByMonth, focusTotal, focusByQuarter, topTask,
    };
  }

  function renderYearReportModal() {
    const el = document.getElementById('yearReportContent');
    if (!el) return;
    const r = yearlyReportData();
    const topName = r.topHabit && r.topHabit.name ? esc(r.topHabit.name) : '—';
    const prod = r.prodDay ? esc(r.prodDay.label) + ' · ' + r.prodDay.n : '—';
    const topTaskHtml = r.topTask ? `${t('yearReportTopTask')}: ${esc((r.topTask.tk.text || '…').slice(0, 20))} · ${taskFocusMinLabel(r.topTask.secs)}` : '';
    el.innerHTML = `
    <div class="report-head">
      <div class="donut-wrap"><div class="donut">${donutSVG(r.pct, 96, 12, '#C24E28')}</div>
        <div class="donut-center"><span>${r.pct}%</span><small>${t('yearReportGoalPct')}</small></div>
      </div>
    </div>
    <div class="report-grid">
      <div class="report-cell"><b>${r.done}</b><span>${t('statsDone')}</span></div>
      <div class="report-cell"><b>${r.inProg}</b><span>${t('statsInProg')}</span></div>
      <div class="report-cell"><b>${r.total}</b><span>${t('statsTotal')}</span></div>
      <div class="report-cell"><b>📅 ${shortMonth(r.topMonth)}</b><span>${t('yearReportTopMonth')} · ${r.months[r.topMonth]}%</span></div>
      <div class="report-cell"><b>🔥 ${topName}</b><span>${t('yearReportBestHabit')}</span></div>
      <div class="report-cell"><b>⚡ ${prod}</b><span>${t('yearReportProdDay')}</span></div>
      <div class="report-cell"><b>🎯 ${r.focusTotal}p</b><span>${t('yearReportFocus')}</span></div>
      <div class="report-cell"><b>⭐ ${r.topTask ? taskFocusMinLabel(r.topTask.secs) : '—'}</b><span>${t('yearReportTopTask')}</span></div>
    </div>
    <div class="report-weekbars" aria-hidden="true">${r.months.map((p) => `<div class="rw-bar" style="height:${Math.max(p, 4)}%"></div>`).join('')}</div>
    <div class="report-focus">
      <div class="report-focus-head"><b>🎯 ${r.focusTotal}p</b><span>${t('yearReportFocus')}</span>${topTaskHtml ? `<span class="report-focus-top">${topTaskHtml}</span>` : ''}</div>
      ${focusReportBars(r.focusByMonth, (i) => shortMonth(i))}
    </div>
    <div class="report-quarters">
      <h3 class="report-quarters-title">${t('yearReportQuarter')}</h3>
      <div class="report-quarters-grid">
        ${r.focusByQuarter.map((m, q) => `<div class="report-quarter${m ? '' : ' is-zero'}">
          <b>${t('quarterShort', { n: q + 1 })}</b>
          <strong>${m}p</strong>
          <small>${r.focusTotal ? Math.round((m / r.focusTotal) * 100) : 0}%</small>
        </div>`).join('')}
      </div>
    </div>`;
  }

  function openYearReportModal() {
    const m = document.getElementById('yearReportModal');
    if (!m) return;
    renderYearReportModal();
    TaskFlowUI.openDialog('yearReportModal');
  }

  function closeYearReportModal() {
    TaskFlowUI.closeDialog('yearReportModal');
  }

  // Ảnh tổng kết năm 1080×1080 — style streak/week report card.
  function yearReportCardBlob(r) {
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
        g.fillText(t('yearReportCardTitle', { y: r.y }), W / 2, 158);
        g.fillStyle = '#C24E28';
        g.font = "800 120px 'Nunito',sans-serif";
        g.fillText(r.pct + '%', W / 2, 300);
        g.fillStyle = '#4A403A';
        g.font = "700 40px 'Nunito',sans-serif";
        g.fillText(t('yearReportGoalPct') + ' · ' + r.done + '/' + r.total, W / 2, 352);
        const rows = [
          [t('yearReportTopMonth'), shortMonth(r.topMonth) + ' · ' + r.months[r.topMonth] + '%'],
          [t('yearReportBestHabit'), r.topHabit && r.topHabit.name ? r.topHabit.name : '—'],
          [t('yearReportProdDay'), r.prodDay ? r.prodDay.label + ' · ' + r.prodDay.n : '—'],
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
        // Bar chart 12 tháng
        const bx = W / 2 - 300, bw = 600, bh = 180, by = 800;
        g.fillStyle = '#8A7A6B';
        g.font = "700 28px 'Nunito',sans-serif";
        g.fillText(t('yearReportTitle') + ' · ' + r.y, W / 2, by - 24);
        const maxP = Math.max(1, ...r.months);
        r.months.forEach((p, i) => {
          const h = Math.max(6, (p / maxP) * bh);
          g.fillStyle = '#C24E28';
          g.beginPath();
          if (g.roundRect) g.roundRect(bx + (i * bw) / 12 + 6, by - h, bw / 12 - 12, h, 8);
          else g.rect(bx + (i * bw) / 12 + 6, by - h, bw / 12 - 12, h);
          g.fill();
        });
        g.fillStyle = '#8A7A6B';
        g.font = "700 30px 'Nunito',sans-serif";
        g.fillText(t('shareFooter', { year: PLAN_YEAR }), W / 2, H - 60);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
      } catch (e) { reject(e); }
    });
  }

  async function doShareYearReport() {
    const r = yearlyReportData();
    let name = localStorage.getItem('planner-name');
    if (!name) {
      name = (prompt(t('shareNamePrompt')) || '').trim() || t('meName');
      try { localStorage.setItem('planner-name', name); } catch (e) { /* ẩn */ }
    }
    try {
      const blob = await yearReportCardBlob(r);
      const file = new File([blob], 'taskflow-year-report.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'TaskFlow 🐥',
            text: '📊 ' + t('yearReportCardTitle', { y: r.y }) + ' · ' + r.pct + '%',
          });
          trackEvent('share_year_report', { pct: r.pct, via: 'native' });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;
          trackEvent('share_year_report', { pct: r.pct, via: 'fallback' });
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'taskflow-year-report.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
      trackEvent('share_year_report', { pct: r.pct, via: 'download' });
      TaskFlowUI.toast(t('shareDone'), 'success');
    } catch (e) {
      TaskFlowUI.toast(t('shareFail'), 'error');
    }
  }

  return { yearlyReportData, renderYearReportModal, openYearReportModal, closeYearReportModal, yearReportCardBlob, doShareYearReport };
});
