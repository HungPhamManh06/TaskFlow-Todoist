// TaskFlow — pure UI/format utilities (tách từ app.js trong P11 refactor).
// Module này KHÔNG phụ thuộc state/global khác ngoài `t()` (chỉ gọi lúc runtime).
// Thêm storageSet/pruneBackups/storageHealth (P1.3): ghi localStorage có phòng vệ quota.
// TaskFlowUI/TaskFlowI18N chỉ được resolve lúc GỌI (không phụ thuộc thứ tự boot).
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

  /* ---------- Ghi localStorage an toàn (P1.3 — hết dung lượng không được mất dữ liệu âm thầm) ----------
     localStorage chỉ có ~5 MB. Khi đầy, setItem() ném QuotaExceededError; trước đây mọi call-site
     đều bọc try/catch rỗng nên app *im lặng* không lưu — người dùng vẫn gõ tiếp rồi mất trắng
     khi reload. Ở đây: ghi → hết chỗ thì dọn slot sao lưu tự động (bản sao cũ, ít giá trị nhất) rồi
     ghi lại → vẫn không được thì BÁO cho người dùng (throttle 30 s) và trả ok:false. */

  const BACKUP_SLOT_PREFIX = 'planner-backup-';
  const BACKUP_SLOTS = 7; // khớp BACKUP_SLOTS của js/backup.js
  const STORAGE_WARN_INTERVAL_MS = 30000;
  let storageFailures = 0;
  let storageWarnedAt = 0;

  /** Xoá mọi slot sao lưu tự động để lấy chỗ — giữ dữ liệu sống, bỏ bản sao cũ. */
  function pruneBackups() {
    const removed = [];
    try {
      for (let i = 0; i < BACKUP_SLOTS; i++) {
        const k = BACKUP_SLOT_PREFIX + i;
        if (localStorage.getItem(k) !== null) { localStorage.removeItem(k); removed.push(k); }
      }
      // Con trỏ vòng xoay về 0 để slot kế tiếp không ghi đè nhầm chỗ trống vừa xoá
      if (removed.length) localStorage.removeItem('planner-backup-idx');
    } catch (e) { /* ẩn */ }
    return removed;
  }

  function storageMessage(key, fallback) {
    try {
      const i18n = globalThis.TaskFlowI18N;
      if (i18n && i18n.t) { const s = i18n.t(key); if (s && s !== key) return s; }
    } catch (e) { /* ẩn */ }
    return fallback;
  }

  function warnStorageFull(key, err) {
    storageFailures++;
    const now = Date.now();
    if (now - storageWarnedAt < STORAGE_WARN_INTERVAL_MS) return;
    storageWarnedAt = now;
    try { console.error('[storage] không ghi được (hết dung lượng trình duyệt?):', key, err); } catch (e) { /* ẩn */ }
    try {
      const ui = globalThis.TaskFlowUI;
      if (ui && ui.toast) {
        ui.toast(storageMessage('storageFullWarn',
          'Bộ nhớ trình duyệt đã đầy — thay đổi vừa rồi CHƯA được lưu. Hãy xuất JSON (sao lưu) rồi xoá bớt dữ liệu cũ.'),
          'error', 12000);
      }
    } catch (e) { /* ẩn */ }
  }

  /** Ghi localStorage có phòng vệ quota. Trả { ok, pruned, error }. */
  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return { ok: true, pruned: [] };
    } catch (e) {
      const pruned = pruneBackups();
      try {
        localStorage.setItem(key, value);
        if (pruned.length) {
          try { console.info('[storage] đã dọn slot sao lưu để lưu được:', key, pruned.length); } catch (e3) { /* ẩn */ }
        }
        return { ok: true, pruned };
      } catch (e2) {
        warnStorageFull(key, e2);
        return { ok: false, pruned, error: e2 };
      }
    }
  }

  /** Số lần ghi thất bại + lần cảnh báo gần nhất (UI có thể dùng để hiển thị banner). */
  function storageHealth() {
    return { failures: storageFailures, warnedAt: storageWarnedAt };
  }

  return { esc, localISODate, formatFocusTime, lineChartSVG, storageSet, pruneBackups, storageHealth };
});
