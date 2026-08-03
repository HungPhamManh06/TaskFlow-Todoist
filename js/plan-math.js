/* js/plan-math.js — Tính toán thuần cho kế hoạch: ngày/elapsed, % habit theo target,
   chuyển tháng qua năm, streak, huy hiệu. Chạy được cả ở browser (window.PlanMath)
   lẫn Node (module.exports) để unit test. */
(function () {
  'use strict';

  function numDaysOf(y, m) {
    return new Date(y, m + 1, 0).getDate();
  }

  // Số ngày "đã trôi qua" của tháng (y,m) tính tới `now`: tháng hiện tại → hôm nay, tháng khác → đủ tháng.
  function elapsedDays(y, m, now) {
    var n = now || new Date();
    var inRange = n.getFullYear() === y && n.getMonth() === m;
    return inRange ? Math.min(n.getDate(), numDaysOf(y, m)) : numDaysOf(y, m);
  }

  // % hoàn thành habit so với mục tiêu: đạt 100% khi làm đủ (elapsed * target/100) ngày.
  function habitPctFrom(days, elapsed, target) {
    var t = target > 0 ? target : 100;
    var total = Math.max(1, Math.round((elapsed * t) / 100));
    var done = 0;
    var upto = Math.min(days.length, elapsed);
    for (var i = 0; i < upto; i++) if (days[i]) done++;
    return Math.min(100, Math.round((done / total) * 100));
  }

  function nextMonth(y, m) {
    return m === 11 ? { y: y + 1, m: 0 } : { y: y, m: m + 1 };
  }

  function prevMonth(y, m) {
    return m === 0 ? { y: y - 1, m: 11 } : { y: y, m: m - 1 };
  }

  // Streak hiện tại: đếm lùi từ cuối mảng.
  function currentStreak(flags) {
    var n = 0;
    for (var i = flags.length - 1; i >= 0 && flags[i]; i--) n++;
    return n;
  }

  // Chuỗi dài nhất trong mảng.
  function bestStreak(flags) {
    var best = 0, run = 0;
    for (var i = 0; i < flags.length; i++) {
      if (flags[i]) { run++; if (run > best) best = run; }
      else run = 0;
    }
    return best;
  }

  // Undo stack (Phase 5): push snapshot, undo/redo với limit, canUndo/canRedo, clear.
  function makeUndoStack(limit) {
    var max = limit > 0 ? limit : 50;
    var undo = [];
    var redo = [];
    return {
      push: function (s) {
        undo.push(s);
        if (undo.length > max) undo.shift();
        redo = [];
      },
      undo: function () {
        var s = undo.pop();
        if (s !== undefined) redo.push(s);
        return s !== undefined ? s : null;
      },
      redo: function () {
        var s = redo.pop();
        if (s !== undefined) undo.push(s);
        return s !== undefined ? s : null;
      },
      canUndo: function () { return undo.length > 0; },
      canRedo: function () { return redo.length > 0; },
      clear: function () { undo = []; redo = []; },
    };
  }

  // Huy hiệu: trả về mảng id badge đạt điều kiện với dữ liệu tháng đang xem.
  function evaluateBadges(d) {
    var out = [];
    var anyStreak = d.streaks && Object.keys(d.streaks).length > 0;
    if (anyStreak) {
      var maxCur = 0, maxBest = 0;
      Object.keys(d.streaks).forEach(function (k) {
        if (d.streaks[k].cur > maxCur) maxCur = d.streaks[k].cur;
        if (d.streaks[k].best > maxBest) maxBest = d.streaks[k].best;
      });
      if (maxCur >= 7) out.push('b7');
      if (maxCur >= 30) out.push('b30');
      if (maxBest >= 14) out.push('best14');
    }
    if (d.goalPct === 100 && d.goalTotal > 0) out.push('goals100');
    var pcts = d.habitPcts || [];
    if (pcts.length > 0 && pcts.every(function (p) { return p >= 100; })) out.push('habit100');
    if (d.activeDays >= 15) out.push('active15');
    return out;
  }

  var api = {
    numDaysOf: numDaysOf,
    elapsedDays: elapsedDays,
    habitPctFrom: habitPctFrom,
    nextMonth: nextMonth,
    prevMonth: prevMonth,
    currentStreak: currentStreak,
    bestStreak: bestStreak,
    evaluateBadges: evaluateBadges,
    makeUndoStack: makeUndoStack,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.PlanMath = api;
})();
