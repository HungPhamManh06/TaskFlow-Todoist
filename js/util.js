// TaskFlow — pure UI/format utilities (tách từ app.js trong P11 refactor).
// Module này KHÔNG phụ thuộc state/global khác ngoài `t()` (chỉ gọi lúc runtime).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowUtil = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // Escape HTML đặc biệt — dùng cho mọi string chèn vào innerHTML.
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ISO local date 'YYYY-MM-DD' (tránh lệch UTC của toISOString).
  function localISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Định dạng thời gian focus: '6h 20m' / '6h' / '20m'.
  function formatFocusTime(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  }

  // SVG line chart cho báo cáo năm — nhận translator qua tham số (mặc định global t()).
  function lineChartSVG(values, w = 480, h = 110, tr) {
    const trF = tr || (typeof t === 'function' ? t : (k) => k);
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * (w - 20) + 10;
      const y = h - 18 - (Math.max(0, Math.min(100, v)) / 100) * (h - 34);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    const line = pts.join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="${trF('lineAria')}">
    <defs>
      <linearGradient id="lgYearLine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#F39A82" stop-opacity=".5"/>
        <stop offset="100%" stop-color="#F39A82" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${10},${h - 18} ${line} ${w - 10},${h - 18}" fill="url(#lgYearLine)"/>
    <polyline points="${line}" fill="none" stroke="#C88570" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${values.map((v, i) => `<circle cx="${pts[i].split(',')[0]}" cy="${pts[i].split(',')[1]}" r="3" fill="#fff" stroke="#C88570" stroke-width="2"><title>${trF('lineMonthT', { n: i + 1, p: v })}</title></circle>`).join('')}
  </svg>`;
  }

  return { esc, localISODate, formatFocusTime, lineChartSVG };
});
