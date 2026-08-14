// TaskFlow — habit day helpers (tách từ app.js trong P11 refactor, extraction 7).
// Gồm: habitDaysElapsed(y, m, numDays), dayAggregate(state, d), heatLevel(pct) —
// không phụ thuộc global ngoài tham số, dễ unit test.
// V1.4 — Flexible Habit Schedules: normalizeSchedule/scheduleOf/periodProgress/
// consistencyPct/runInfo/scheduleSummary/isDueToday. Thuần, nhận `now` + `daysAt`
// (accessor tháng khác, mặc định chỉ tháng hiện tại) làm tham số để test boundary.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowHabits = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function habitDaysElapsed(y, m, numDays) {
    // Số ngày ĐÃ TRÔI QUA tính đến hôm nay (tháng y/m) — hoặc cả tháng nếu xem tháng khác.
    const now = new Date();
    const inRange = now.getFullYear() === y && now.getMonth() === m;
    return inRange ? Math.min(now.getDate(), numDays) : numDays;
  }

  function dayAggregate(state, d) {
    if (!state.habits.length) return 0;
    let sum = 0;
    state.habits.forEach((h) => { if (h.days[d]) sum++; });
    return Math.round((sum / state.habits.length) * 100);
  }

  function heatLevel(pct) {
    if (pct >= 100) return 5;
    if (pct >= 75) return 4;
    if (pct >= 50) return 3;
    if (pct >= 25) return 2;
    if (pct > 0) return 1;
    return 0;
  }

  /* ================= V1.4 Flexible Habit Schedules ================= */

  const WEEKDAY_SET = [1, 2, 3, 4, 5, 6, 7]; // 1=Mon .. 7=Sun

  function clampPct(x) {
    return Math.max(0, Math.min(100, Math.round(x)));
  }

  // Chuẩn hoá schedule. Trả về object hợp lệ, hoặc null nếu không phục hồi được.
  // Legacy (thiếu schedule) → null → scheduleOf() trả về {type:'daily'}.
  function normalizeSchedule(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    const type = s.type;
    if (type === 'daily') return { type: 'daily' };
    if (type === 'weekdays') {
      if (!Array.isArray(s.days) || !s.days.length) return null;
      const raw = s.days.map((d) => (Number.isInteger(d) ? d : NaN));
      if (raw.some((d) => WEEKDAY_SET.indexOf(d) < 0)) return null; // bất kỳ ngày lỗi → reject
      const days = Array.from(new Set(raw)).sort((a, b) => a - b);
      return { type: 'weekdays', days };
    }
    if (type === 'weekly_count') {
      if (!Number.isInteger(s.count) || s.count < 1 || s.count > 31) return null;
      return { type: 'weekly_count', count: s.count };
    }
    if (type === 'monthly_count') {
      if (!Number.isInteger(s.count) || s.count < 1 || s.count > 93) return null;
      return { type: 'monthly_count', count: s.count };
    }
    return null;
  }

  function scheduleOf(h) {
    const s = normalizeSchedule(h && h.schedule);
    return s || { type: 'daily' };
  }

  // Thứ trong tuần kiểu 1..7 (1=Thứ 2, 7=Chủ nhật) — khớp `days` của weekdays.
  function weekday1(date) {
    return ((date.getDay() + 6) % 7) + 1;
  }

  // Thứ 2 (00:00) của tuần chứa `date` — khoá tuần dương lịch (Mon-Sun).
  function mondayOf(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  function monthDayCount(y, m) {
    return new Date(y, m + 1, 0).getDate();
  }

  // Số ngày đã trôi qua (1..numDays) của tháng y/m tính tới `now`.
  function elapsedOf(now, y, m, numDays) {
    const inRange = now.getFullYear() === y && now.getMonth() === m;
    return inRange ? Math.min(now.getDate(), numDays) : numDays;
  }

  // Danh sách index ngày (0-based) được "đến hạn" trong tháng; null = mọi ngày đều trackable.
  function dueDayIndexes(s, y, m, numDays) {
    if (s.type !== 'weekdays') return null;
    const out = [];
    for (let i = 0; i < numDays; i++) {
      if (s.days.indexOf(weekday1(new Date(y, m, i + 1))) >= 0) out.push(i);
    }
    return out;
  }

  // Habit có "đến hạn" vào ngày cụ thể này không (daily/weekdays). Count không ràng
  // buộc ngày — relevance của count xử lý qua periodProgress (mục tiêu kỳ chưa đạt).
  function isDueToday(s, date) {
    const type = s.type;
    if (type === 'daily') return true;
    if (type === 'weekdays') return s.days.indexOf(weekday1(date)) >= 0;
    return false;
  }

  // Tiến độ mục tiêu KỲ HIỆN TẠI:
  //  - daily/weekdays: required = round(dueElapsed * target/100) — giữ ngữ nghĩa % legacy.
  //  - weekly_count:   required = count, done = số lần tick trong TUẦN dương lịch hiện tại
  //                    (chỉ đếm trong tháng hiện tại — ranh giới tuần qua tháng ghi chú).
  //  - monthly_count:  required = count, done = số lần tick trong tháng.
  function periodProgress(s, days, target, y, m, numDays, now) {
    const tgt = Number.isFinite(target) && target > 0 ? target : 100;
    const el = elapsedOf(now, y, m, numDays);
    const upto = Math.min(Array.isArray(days) ? days.length : 0, el);
    let done = 0;
    for (let i = 0; i < upto; i++) if (days[i]) done++;
    const type = s.type;
    if (type === 'weekdays') {
      const due = dueDayIndexes(s, y, m, numDays);
      let dueElapsed = 0, doneDue = 0;
      for (let i = 0; i < upto; i++) {
        if (due.indexOf(i) < 0) continue;
        dueElapsed++;
        if (days[i]) doneDue++;
      }
      const required = Math.max(1, Math.round((dueElapsed * tgt) / 100));
      return { done: doneDue, required, pct: clampPct((doneDue / required) * 100) };
    }
    if (type === 'weekly_count') {
      const count = Math.max(1, s.count | 0);
      const wk = mondayOf(now);
      let currentDone = 0;
      for (let i = 0; i < upto; i++) {
        if (!days[i]) continue;
        if (mondayOf(new Date(y, m, i + 1)).getTime() === wk.getTime()) currentDone++;
      }
      return { done: currentDone, required: count, pct: clampPct((currentDone / count) * 100) };
    }
    if (type === 'monthly_count') {
      const count = Math.max(1, s.count | 0);
      // Mục tiêu theo THÁNG: đếm toàn bộ tick trong tháng (không cắt theo elapsed).
      const all = Math.min(Array.isArray(days) ? days.length : 0, numDays);
      const doneAll = countTrue(days, all);
      return { done: doneAll, required: count, pct: clampPct((doneAll / count) * 100) };
    }
    // daily (mặc định)
    const required = Math.max(1, Math.round((el * tgt) / 100));
    return { done, required, pct: clampPct((done / required) * 100) };
  }

  function countTrue(days, upto) {
    let n = 0;
    for (let i = 0; i < upto; i++) if (days && days[i]) n++;
    return n;
  }

  // Các kỳ HOÀN THÀNH (trước kỳ hiện tại) + kỳ hiện tại (nếu có) cho count-type.
  // `kind` = 'week' | 'month'. Trả { periods: [bool] (oldest → newest, CHỈ kỳ hoàn
  // thành), current: bool|null (kỳ hiện tại, chưa hoàn thành) }. Week: chỉ đếm tuần
  // dương lịch bắt đầu TỪ tháng này (tuần chắn ranh giới tháng bị bỏ — thiếu dữ liệu
  // tháng trước). Month: các tháng trước qua `daysAt`, current = tháng hiện tại.
  function periodMarks(s, days, y, m, numDays, now, daysAt, kind) {
    const count = Math.max(1, s.count | 0);
    const periods = [];
    if (kind === 'week') {
      const el = elapsedOf(now, y, m, numDays);
      const thisMon = mondayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
      const monthStart = new Date(y, m, 1).getTime();
      const weeks = new Map();
      for (let i = 0; i < el; i++) {
        const wk = mondayOf(new Date(y, m, i + 1));
        const key = wk.getTime();
        if (!weeks.has(key)) weeks.set(key, { monday: wk, done: 0 });
        if (days && days[i]) weeks.get(key).done++;
      }
      const sorted = Array.from(weeks.values()).sort((a, b) => a.monday - b.monday);
      let current = null;
      sorted.forEach((wk) => {
        const startsThisMonth = wk.monday.getTime() >= monthStart;
        const finished = wk.monday.getTime() < thisMon.getTime();
        // Kỳ không có hoạt động (0 tick) không tính là kỳ fail — habit chưa bắt đầu.
        if (startsThisMonth && finished && wk.done > 0) periods.push(wk.done >= count);
        if (wk.monday.getTime() === thisMon.getTime()) current = wk.done >= count;
      });
      return { periods, current };
    }
    // month — các tháng trước (qua daysAt) là kỳ hoàn thành; tháng hiện tại là current.
    let currentDone = countTrue(days, elapsedOf(now, y, m, numDays));
    if (daysAt) {
      for (let back = 11; back >= 1; back--) {
        let yy = y, mm = m - back;
        while (mm < 0) { mm += 12; yy--; }
        const prev = daysAt(yy, mm);
        if (prev && Array.isArray(prev)) {
          const n = countTrue(prev, prev.length);
          if (n > 0) periods.push(n >= count); // tháng không có hoạt động → bỏ qua
        }
      }
    }
    return { periods, current: currentDone >= count };
  }

  // Tính nhất quán (0..100): daily/weekdays = tỷ lệ ngày đến hạn đã làm; count-type =
  // % kỳ HOÀN THÀNH đạt mục tiêu (fallback về tiến độ kỳ hiện tại nếu chưa có kỳ nào
  // hoàn thành — không phạt kỳ đang chạy).
  function consistencyPct(s, days, target, y, m, numDays, now, daysAt) {
    const type = s.type;
    const el = elapsedOf(now, y, m, numDays);
    const upto = Math.min(Array.isArray(days) ? days.length : 0, el);
    if (type === 'weekdays') {
      const due = dueDayIndexes(s, y, m, numDays);
      let dueElapsed = 0, doneDue = 0;
      for (let i = 0; i < upto; i++) {
        if (due.indexOf(i) < 0) continue;
        dueElapsed++;
        if (days && days[i]) doneDue++;
      }
      return dueElapsed ? clampPct((doneDue / dueElapsed) * 100) : 100;
    }
    if (type === 'weekly_count' || type === 'monthly_count') {
      const kind = type === 'weekly_count' ? 'week' : 'month';
      const marks = periodMarks(s, days, y, m, numDays, now, daysAt, kind);
      const total = marks.periods.length;
      if (total > 0) {
        const met = marks.periods.filter(Boolean).length;
        return clampPct((met / total) * 100);
      }
      return periodProgress(s, days, target, y, m, numDays, now).pct;
    }
    // daily
    const done = countTrue(days, upto);
    return el ? clampPct((done / el) * 100) : 100;
  }

  // Timeline ngày (daily/weekdays) trong cửa sổ 12 tháng (hoặc tháng hiện tại nếu
  // không có daysAt). weekdays chỉ đưa NGÀY ĐẾN HẠN vào timeline (ngày không chọn
  // không phá run).
  function dayTimeline(s, days, y, m, numDays, now, daysAt, type) {
    const tl = [];
    const anchor = elapsedOf(now, y, m, numDays);
    const windowMonths = daysAt ? 12 : 1;
    for (let back = windowMonths - 1; back >= 0; back--) {
      let yy = y, mm = m - back;
      while (mm < 0) { mm += 12; yy--; }
      const nd = monthDayCount(yy, mm);
      const arr = back === 0 ? days : daysAt ? daysAt(yy, mm) : null;
      const upto = back === 0 ? anchor : nd;
      for (let i = 0; i < upto; i++) {
        const on = !!(arr && arr[i]);
        if (type === 'weekdays') {
          const due = dueDayIndexes(s, yy, mm, nd);
          if (due.indexOf(i) < 0) continue; // ngày không đến hạn → không vào timeline
        }
        tl.push(on);
      }
    }
    return tl;
  }

  // Current run / best run theo loại schedule:
  //  - daily/weekdays: run ngày (đa tháng nếu có daysAt).
  //  - weekly_count: run tuần (tuần đạt count). monthly_count: run tháng.
  function runInfo(s, days, target, y, m, numDays, now, daysAt) {
    const type = s.type;
    if (type === 'weekdays' || type === 'daily') {
      // Day-based: run đếm ngày due liên tiếp (không due không phá run).
      const tl = dayTimeline(s, days, y, m, numDays, now, daysAt, type);
      let cur = 0;
      for (let i = tl.length - 1; i >= 0 && tl[i]; i--) cur++;
      let best = 0, run = 0;
      for (let i = 0; i < tl.length; i++) {
        run = tl[i] ? run + 1 : 0;
        if (run > best) best = run;
      }
      return { cur, best };
    }
    // Count-type: run tính theo KỲ đạt mục tiêu. Kỳ đang chạy (in-progress) còn "sống"
    // nếu chưa fail — cur = 1 khi kỳ hiện tại còn sống VÀ chuỗi chưa bị đứt bởi kỳ
    // hoàn thành gần nhất fail; best = chuỗi kỳ hoàn thành đạt mục tiêu dài nhất.
    const kind = type === 'weekly_count' ? 'week' : 'month';
    const marks = periodMarks(s, days, y, m, numDays, now, daysAt, kind);
    const periods = marks.periods;
    let best = 0, run = 0;
    for (let i = 0; i < periods.length; i++) {
      run = periods[i] ? run + 1 : 0;
      if (run > best) best = run;
    }
    const hasCurrent = marks.current !== null && marks.current !== undefined;
    const lastCompleted = periods.length ? periods[periods.length - 1] : true;
    const cur = hasCurrent && lastCompleted ? 1 : 0;
    return { cur, best };
  }

  // Tóm tắt schedule để render label: { type, value } — value = mảng days (weekdays)
  // hoặc count (count-type) hoặc null (daily).
  function scheduleSummary(s) {
    const n = normalizeSchedule(s);
    const type = n ? n.type : 'daily';
    if (type === 'weekdays') return { type, value: n.days };
    if (type === 'weekly_count' || type === 'monthly_count') return { type, value: n.count };
    return { type: 'daily', value: null };
  }

  return { habitDaysElapsed, dayAggregate, heatLevel, normalizeSchedule, scheduleOf, weekday1, mondayOf, dueDayIndexes, isDueToday, periodProgress, consistencyPct, runInfo, scheduleSummary };
});
