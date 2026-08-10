// TaskFlow — Modal Thống kê focus × task (tách từ app.js trong P11 refactor, extraction 41).
// Gồm: statsData (tổng hợp điểm tuần/tháng/quý/năm/all), statsCorrelation (Pearson),
// statsScatterSVG (scatter focus × done), renderStatsModal/open/closeStatsModal,
// setStatsRange (đổi phạm vi). Module lazy: KHÔNG nằm trong chuỗi script boot,
// chỉ nạp khi mở modal Thống kê lần đầu (runLazyModule ở dispatcher).
// Phụ thuộc app-level (state/PLAN_YEAR/PLAN_MONTH/monthStateRaw/loadPomoLog/
// pomoDateKey/shortMonth/t/esc/TaskFlowUI) — resolve qua global scope tại thời
// điểm GỌI (pattern inbox/chat/search/quick-add/mood/year-report).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowStatsUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

/* ---------- Phase 9: Thống kê tương quan focus × task ---------- */

// Phạm vi thời gian đang chọn trong modal Thống kê.
let statsRange = 'month';

// Ngày Thứ 2 đầu tuần (wi = 0-based) của tháng (y,m) — lặp lại phép tính của initPlan.
function statsWeekStartOf(y, m, wi) {
  const first = new Date(y, m, 1);
  const dow = (first.getDay() + 6) % 7; // Thứ 2 = 0
  return new Date(first.getTime() - dow * 86400000 + wi * 7 * 86400000);
}

// Danh sách tháng cần quét theo phạm vi đã chọn: [[y, m], ...].
function statsMonthsForRange(range) {
  if (range === 'month') return [[PLAN_YEAR, PLAN_MONTH]];
  if (range === 'quarter') {
    const qs = Math.floor(PLAN_MONTH / 3) * 3;
    const out = [];
    for (let m = qs; m < qs + 3; m++) out.push([PLAN_YEAR, m]);
    return out;
  }
  if (range === 'year') {
    const out = [];
    for (let m = 0; m < 12; m++) out.push([PLAN_YEAR, m]);
    return out;
  }
  // 'all': mọi tháng đã có dữ liệu (localStorage planner-YYYY-M + pomo log).
  const seen = new Set();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const mm = k && String(k).match(/^planner-(\d{4})-(\d{1,2})$/);
    if (mm) seen.add(mm[1] + '-' + (+mm[2] - 1));
  }
  const log = loadPomoLog();
  for (const key in log) {
    const mm = String(key).match(/^(\d{4})-(\d{2})-/);
    if (mm) seen.add(mm[1] + '-' + (+mm[2] - 1));
  }
  const out = [];
  seen.forEach((k) => { const [y, m] = k.split('-').map(Number); out.push([y, m]); });
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return out;
}

function statsWeekLabel(y, m, n) {
  const base = t('weekN', { n });
  return statsRange === 'quarter' ? `${base} · ${shortMonth(m)}` : base;
}

function statsMonthLabel(y, m, range) {
  let label = shortMonth(m);
  if (range === 'all' && y !== PLAN_YEAR) label += '/' + (y % 100);
  return label;
}

// Dữ liệu biểu đồ: mỗi điểm = 1 tuần (tháng/quý) hoặc 1 tháng (năm/toàn bộ).
// Chỉ đếm các ngày thuộc đúng tháng (y,m) để không đếm trùng ngày giữa các grid liền kề.
function statsData(range) {
  const granularity = (range === 'year' || range === 'all') ? 'month' : 'week';
  const log = loadPomoLog();
  const points = [];
  statsMonthsForRange(range).forEach(([y, m]) => {
    const s = (y === PLAN_YEAR && m === PLAN_MONTH) ? state : monthStateRaw(y, m);
    if (!s || !Array.isArray(s.weeks)) {
      // Tháng chỉ có dữ liệu focus (pomo log, chưa có planner state):
      // vẫn tạo 1 điểm với done = 0 để không mất phút focus.
      let secs = 0;
      const dim = new Date(y, m + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const e = log[pomoDateKey(new Date(y, m, d))];
        if (e && typeof e.secs === 'number') secs += e.secs;
      }
      if (secs > 0) points.push({ label: statsMonthLabel(y, m, range), focus: Math.round(secs / 60), done: 0 });
      return;
    }
    const acc = [];
    s.weeks.forEach((w, wi) => {
      const ws = statsWeekStartOf(y, m, wi);
      let done = 0, secs = 0;
      (w.days || []).forEach((d, di) => {
        const dt = new Date(ws.getTime() + di * 86400000);
        if (dt.getFullYear() !== y || dt.getMonth() !== m) return; // bỏ ô tràn grid
        (d.tasks || []).forEach((tk) => { if (tk.done) done++; });
        const e = log[pomoDateKey(dt)];
        if (e && typeof e.secs === 'number') secs += e.secs;
      });
      acc.push({ done, focus: Math.round(secs / 60) });
    });
    if (granularity === 'week') {
      acc.forEach((p, wi) => {
        const n = s.weeks[wi] && s.weeks[wi].n ? s.weeks[wi].n : wi + 1;
        points.push({ label: statsWeekLabel(y, m, n), focus: p.focus, done: p.done });
      });
    } else {
      points.push({
        label: statsMonthLabel(y, m, range),
        focus: acc.reduce((a, p) => a + p.focus, 0),
        done: acc.reduce((a, p) => a + p.done, 0),
      });
    }
  });
  const unit = granularity === 'week' ? t('statsUnitWeek') : t('statsUnitMonth');
  return { points, granularity, unit };
}

// Hệ số tương quan Pearson giữa hai dãy số — null nếu không tính được.
function statsCorrelation(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

// SVG scatter: trục ngang = phút focus, trục dọc = task hoàn thành.
function statsScatterSVG(points) {
  const W = 400, H = 264, L = 54, R = 14, T = 22, B = 44;
  const iw = W - L - R, ih = H - T - B;
  const maxF = Math.max(1, ...points.map((p) => p.focus)) * 1.12;
  const maxD = Math.max(1, ...points.map((p) => p.done)) * 1.12;
  const X = (f) => L + (f / maxF) * iw;
  const Y = (d) => T + ih - (d / maxD) * ih;
  const ticks = 4;
  let grid = '', labels = '';
  for (let i = 0; i <= ticks; i++) {
    const fx = L + (i / ticks) * iw, dy = T + ih - (i / ticks) * ih;
    grid += `<line x1="${fx}" y1="${T}" x2="${fx}" y2="${T + ih}" class="stats-grid"/><line x1="${L}" y1="${dy}" x2="${L + iw}" y2="${dy}" class="stats-grid"/>`;
    labels += `<text x="${fx}" y="${H - 14}" text-anchor="middle" class="stats-axis">${Math.round((maxF * i) / ticks)}</text>`;
    labels += `<text x="${L - 8}" y="${dy + 4}" text-anchor="end" class="stats-axis">${Math.round((maxD * i) / ticks)}</text>`;
  }
  const dots = points.map((p) => {
    const label = t('statsPointAria', { label: p.label, done: p.done, focus: p.focus });
    // Chỉ gắn nhãn cho điểm có dữ liệu — tránh 12 nhãn "T1..T12" chồng nhau tại gốc.
    const hasData = p.focus > 0 || p.done > 0;
    return `<g class="stats-dot"><title>${esc(label)}</title>` +
      `<circle class="stats-dot-hit" cx="${X(p.focus)}" cy="${Y(p.done)}" r="15"/>` +
      `<circle class="stats-dot-core" cx="${X(p.focus)}" cy="${Y(p.done)}" r="6"/>` +
      (hasData ? `<text x="${X(p.focus)}" y="${Y(p.done) - 12}" text-anchor="middle" class="stats-dot-label">${esc(p.label)}</text>` : '') +
      '</g>';
  }).join('');
  const axisTitles =
    `<text x="${L + iw / 2}" y="${H - 2}" text-anchor="middle" class="stats-axis-title">${esc(t('statsFocusAxis'))}</text>` +
    `<text x="16" y="${T + ih / 2}" text-anchor="middle" class="stats-axis-title" transform="rotate(-90 16 ${T + ih / 2})">${esc(t('statsDoneAxis'))}</text>`;
  return `<svg class="stats-scatter-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('statsTitle'))}">` +
    grid + labels + dots + axisTitles + '</svg>';
}

function renderStatsModal() {
  const el = document.getElementById('statsContent');
  if (!el) return;
  const d = statsData(statsRange);
  const ps = d.points;
  const focusTotal = ps.reduce((a, p) => a + p.focus, 0);
  const doneTotal = ps.reduce((a, p) => a + p.done, 0);
  const maxDone = Math.max(1, ...ps.map((p) => p.done));
  const best = ps.reduce((m, p, i) => (p.done > (ps[m] ? ps[m].done : -1) ? i : m), 0);
  const corr = statsCorrelation(ps.map((p) => p.focus), ps.map((p) => p.done));
  const unit = d.unit;
  const rng = [['month', t('statsRangeMonth')], ['quarter', t('statsRangeQuarter')],
    ['year', t('statsRangeYear')], ['all', t('statsRangeAll')]]
    .map(([r, label]) => `<button type="button" class="stats-range-btn${statsRange === r ? ' active' : ''}" data-action="stats-range" data-range="${r}" aria-pressed="${statsRange === r}">${esc(label)}</button>`).join('');
  const summary = ps.length ? `<div class="stats-summary">
      <div class="report-cell"><b>🎯 ${focusTotal}p</b><span>${t('statsTotalFocus')}</span></div>
      <div class="report-cell"><b>✅ ${doneTotal}</b><span>${t('statsTotalDone')}</span></div>
      <div class="report-cell"><b>📈 ${ps.length ? Math.round(focusTotal / ps.length) : 0}p</b><span>${t('statsAvgFocus', { unit })}</span></div>
      <div class="report-cell"><b>🏆 ${esc(ps[best].label)}</b><span>${t('statsBest')} · ${ps[best].done} ${t('statsTotalDone')}</span></div>
      <div class="report-cell"><b>📊 ${corr == null ? '—' : corr.toFixed(2)}</b><span>${t('statsCorr')}</span></div>
    </div>` : '';
  const table = ps.length ? `<div class="stats-table" role="table" aria-label="${esc(t('statsTitle'))}">
      ${ps.map((p) => `<div class="stats-row" role="row">` +
        `<span class="stats-row-label" role="cell">${esc(p.label)}</span>` +
        `<span class="stats-row-focus" role="cell">🎯 ${p.focus}p</span>` +
        `<span class="stats-row-bar" role="cell" aria-hidden="true"><i style="width:${Math.round((p.done / maxDone) * 100)}%"></i></span>` +
        `<span class="stats-row-done" role="cell">✅ ${p.done}</span></div>`).join('')}
    </div>` : '';
  el.innerHTML = `<div class="stats-range" role="group" aria-label="${esc(t('statsTitle'))}">${rng}</div>` +
    `<p class="stats-note">${t('statsCorrNote', { unit })}</p>` +
    (!ps.length ? `<div class="stats-empty">${t('statsNoData')}</div>` :
      `<div class="stats-scatter-wrap">${statsScatterSVG(ps)}</div>` + summary + table);
}

function openStatsModal() {
  const m = document.getElementById('statsModal');
  if (!m) return;
  renderStatsModal();
  TaskFlowUI.openDialog('statsModal');
}

function closeStatsModal() {
  TaskFlowUI.closeDialog('statsModal');
}

// Chuyển phạm vi thời gian trong modal Thống kê (dispatcher 'stats-range').
function setStatsRange(range) {
  if (!range || statsRange === range) return;
  statsRange = range;
  renderStatsModal();
  // Sau khi re-render, nút vừa bấm bị thay thế — trả focus về nút active.
  const active = document.querySelector('#statsContent .stats-range-btn.active');
  if (active) active.focus();
}

  return { openStatsModal, closeStatsModal, setStatsRange };
});
