// TaskFlow — now/clock helpers (tách từ app.js trong P11 refactor, extraction 18).
// Gồm: nowInfo(planStart, numDays, year, month, now) — ĐỔI SIGNATURE (trước đọc PLAN_START/NUM_DAYS
// global, giờ nhận tham số — pattern habitStreakCached) + resolveTodayCell (resolver canonical
// ô hôm nay dùng chung cho Today/Week) + renderClock() giữ signature
// (DOM #nowText; fmtDate qua globalThis.TaskFlowDates, dateLocale qua TaskFlowI18N).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowClock = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function getDates() {
    return (typeof globalThis !== 'undefined' && globalThis.TaskFlowDates) || null;
  }

  function getI18n() {
    return (typeof globalThis !== 'undefined' && globalThis.TaskFlowI18N) || null;
  }

  // Hiệu số NGÀY LỊCH ĐỊA PHƯƠNG giữa hai ngày — an toàn DST.
  // Không dùng (a - b) / 86400000 trực tiếp: qua đổi giờ (DST) ngày chỉ còn 23/25h
  // khiến phép chia lệch 1 ngày. Chuẩn hoá cả hai về nửa đêm local rồi round.
  function calendarDayDiff(from, to) {
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / 86400000);
  }

  // Vị trí hiện tại trong plan grid: dayIdx 0-based tính từ planStart (thứ 2 tuần chứa ngày 1),
  // week 1-based, dayInWeek, habitCol.
  // RANGE BUG FIXED: trước đây inRange = dayIdx >= 0 && dayIdx < numDays — sai vì planStart
  // thuộc tháng TRƯỚC (vd tháng 8/2026: planStart = 27/7) nên cửa sổ hợp lệ bị lệch thành
  // "27/7 → 26/8" thay vì "1/8 → 31/8": 27–31/8 bị coi là ngoài tháng. Giờ membership được
  // quyết định bằng year/month của tháng planner (year, month — tham số mới).
  function nowInfo(planStart, numDays, year, month, now) {
    const n = now || new Date();
    const dayIdx = calendarDayDiff(planStart, n);
    const explicitMonth = typeof year === 'number' && typeof month === 'number';
    const inRange = explicitMonth
      ? (n.getFullYear() === year && n.getMonth() === month && dayIdx >= 0)
      : (dayIdx >= 0 && dayIdx < numDays); // fallback legacy cho call-site cũ/test
    return {
      now: n,
      dayIdx,
      inRange,
      week: inRange ? Math.floor(dayIdx / 7) + 1 : null,
      dayInWeek: inRange ? dayIdx % 7 : null,
      habitCol: inRange ? dayIdx : -1,
    };
  }

  // RESOLVER CANONICAL: ô hôm nay trong state planner. MỌI consumer hôm nay (Today,
  // Week current-day, today-addtask, planner) phải dùng helper này — không tự suy
  // lại công thức. Trả về:
  //   { inPlanMonth, weekIndex (0-based), weekNumber (1-based), dayIndex, day, date, dayIdx }
  // `day` là THAM CHIẾU trực tiếp tới state.weeks[weekIndex].days[dayIndex] — không copy.
  // weeks không bắt buộc: truyền để lấy `day`; bỏ qua nếu chỉ cần toạ độ.
  function resolveTodayCell(opts) {
    const o = opts || {};
    const n = o.now || new Date();
    const info = nowInfo(o.planStart, o.numDays, o.year, o.month, n);
    const cell = {
      inPlanMonth: info.inRange,
      weekIndex: info.inRange ? info.week - 1 : null,
      weekNumber: info.inRange ? info.week : null,
      dayIndex: info.inRange ? info.dayInWeek : null,
      day: null,
      date: n,
      dayIdx: info.dayIdx,
    };
    if (info.inRange && Array.isArray(o.weeks)) {
      const w = o.weeks[cell.weekIndex];
      const d = w && w.days[cell.dayIndex];
      if (d) cell.day = d;
      else cell.inPlanMonth = false;
    }
    return cell;
  }

  function renderClock() {
    if (typeof document === 'undefined') return;
    const box = document.getElementById('nowText');
    if (!box) return;
    const n = new Date();
    const dates = getDates();
    const i18n = getI18n();
    const fmt = dates && dates.fmtDate ? dates.fmtDate : (d) => d.toLocaleDateString();
    const loc = i18n && i18n.dateLocale ? i18n.dateLocale() : 'en-GB';
    box.textContent = fmt(n) + ' · ' + n.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  return { calendarDayDiff, nowInfo, resolveTodayCell, renderClock };
});
