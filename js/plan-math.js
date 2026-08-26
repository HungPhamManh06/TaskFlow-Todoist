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
  function habitPctFrom(days, elapsed, target, skipMap) {
    var t = target > 0 ? target : 100;
    var total = Math.max(1, Math.round((elapsed * t) / 100));
    var done = 0;
    var upto = Math.min(days.length, elapsed);
    for (var i = 0; i < upto; i++) {
      if (skipMap && skipMap[i]) continue;
      if (days[i]) done++;
    }
    var effectiveTotal = Math.max(1, total);
    if (skipMap) effectiveTotal = Math.max(1, total - skipMap.slice(0, upto).filter(Boolean).length);
    return Math.min(100, Math.round((done / effectiveTotal) * 100));
  }

  function nextMonth(y, m) {
    return m === 11 ? { y: y + 1, m: 0 } : { y: y, m: m + 1 };
  }

  function prevMonth(y, m) {
    return m === 0 ? { y: y - 1, m: 11 } : { y: y, m: m - 1 };
  }

  // Streak hiện tại: đếm lùi từ cuối mảng.
  function currentStreak(flags, skipMap) {
    var n = 0;
    for (var i = flags.length - 1; i >= 0; i--) {
      if (skipMap && skipMap[i]) continue;
      if (flags[i]) n++;
      else break;
    }
    return n;
  }

  // Chuỗi dài nhất trong mảng.
  function bestStreak(flags, skipMap) {
    var best = 0, run = 0;
    for (var i = 0; i < flags.length; i++) {
      if (skipMap && skipMap[i]) continue;
      if (flags[i]) { run++; if (run > best) best = run; }
      else run = 0;
    }
    return best;
  }

  // Sắp xếp task trong ngày (Phase 5.2 mở rộng): di chuyển task ở vị trí fromIdx trong
  // mảng phẳng tasks sang nhóm toKind ('priority' | 'regular') tại vị trí toPos
  // (0-based trong nhóm đích; toPos >= số task nhóm đích = chèn cuối nhóm).
  // Đổi nhóm thì gán lại kind. THUẦN: không sửa mảng gốc; trả về MẢNG GỐC (cùng
  // tham chiếu) khi kết quả hiển thị không đổi (no-op) — ví dụ thả task cuối nhóm
  // lên đúng vùng nhóm của nó — để caller tránh push undo phantom.
  // Di chuyển task từ mảng tasksFrom (ngày A, vị trí fromIdx) sang mảng tasksTo (ngày B,
  // cuối nhóm toKind). Task đổi kind nếu khác nhóm đích. Thuần: không sửa mảng gốc.
  // Trả về mảng gốc (no-op) khi không có gì thay đổi — để caller tránh push undo phantom.
  function moveTaskAcrossDays(tasksFrom, tasksTo, fromIdx, toKind) {
    var t = tasksFrom[fromIdx];
    if (!t || (toKind !== 'priority' && toKind !== 'regular')) return { tasksFrom: tasksFrom.slice(), tasksTo: tasksTo.slice() };
    var src = tasksFrom.slice();
    var dst = tasksTo.slice();
    var moved = t.kind === toKind ? t : Object.assign({}, t, { kind: toKind });
    src.splice(fromIdx, 1);
    dst.push(moved);
    // No-op: nếu src giống hệt tasksFrom và dst giống hệt tasksTo (vd ko có task nào chuyển đi được)
    if (src.length === tasksFrom.length && src.every(function (x, i) { return x === tasksFrom[i]; })
        && dst.length === tasksTo.length && dst.every(function (x, i) { return x === tasksTo[i]; })) {
      return { tasksFrom: tasksFrom, tasksTo: tasksTo };
    }
    return { tasksFrom: src, tasksTo: dst };
  }

  function reorderTask(tasks, fromIdx, toKind, toPos) {
    var t = tasks[fromIdx];
    if (!t || (toKind !== 'priority' && toKind !== 'regular')) return tasks;
    var fromKind = t.kind;
    var src = tasks.slice();
    src.splice(fromIdx, 1);
    var moved = fromKind === toKind ? t : Object.assign({}, t, { kind: toKind });
    var ins = src.length;
    var seen = 0;
    for (var i = 0; i < src.length; i++) {
      if (src[i].kind === toKind) {
        if (seen === toPos) { ins = i; break; }
        seen++;
      }
    }
    if (fromKind === toKind) {
      // Vị trí mới trong nhóm đích = seen (append: tổng task cùng nhóm; break: toPos).
      var newPos = seen;
      var oldPos = 0;
      for (var j = 0; j < fromIdx; j++) if (tasks[j].kind === fromKind) oldPos++;
      if (oldPos === newPos) return tasks; // hiển thị không đổi → no-op
    }
    src.splice(ins, 0, moved);
    return src;
  }

  // Sinh ngày xuất hiện tiếp theo của task lặp (Phase 7.1). Trả về Date hoặc null nếu
  // repeat không hợp lệ. every >= 1, freq: 'daily' | 'weekly' | 'monthly'.
  function nextOccurrence(date, repeat) {
    if (!repeat || !repeat.freq) return null;
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var freq = repeat.freq;
    var every = repeat.every > 0 ? repeat.every : 1;
    if (freq === 'daily') { d.setDate(d.getDate() + every); return d; }
    if (freq === 'weekly') { d.setDate(d.getDate() + 7 * every); return d; }
    if (freq === 'monthly') { d.setMonth(d.getMonth() + every); return d; }
    return null;
  }

  // Phase 7.1: lập kế hoạch sinh lại task lặp cho hôm nay. todayIdx = chỉ số ngày hôm nay
  // (0-based tính từ PLAN_START, khớp nowInfo().dayIdx). Với mỗi task có repeat ở ngày
  // QUÁ KHỨ, chưa từng sinh (t._recurred), và CHƯA có task cùng (kind+text) từ hôm nay trở
  // đi → tạo bản sao (repeat giữ nguyên để chuỗi lặp tiếp tục; không đánh dấu _recurred trên
  // bản sao). Trả về { copies: [...task mới cần push vào ngày hôm nay], mark: [...task gốc
  // cần đánh dấu _recurred] }. THUẦN: không sửa mảng/task đầu vào.
  function planRecurrence(weeks, todayIdx) {
    var copies = [];
    var mark = [];
    var seen = new Set();
    weeks.forEach(function (w, wi) {
      (w.days || []).forEach(function (d, di) {
        if (wi * 7 + di < todayIdx) return;
        (d.tasks || []).forEach(function (x) { seen.add(x.kind + '\u0000' + x.text); });
      });
    });
    weeks.forEach(function (w, wi) {
      (w.days || []).forEach(function (d, di) {
        if (wi * 7 + di >= todayIdx) return; // chỉ task ngày QUÁ KHỨ sinh bản mới
        (d.tasks || []).forEach(function (t) {
          if (!t.repeat || !t.repeat.freq) return;
          if (t._recurred) return;
          var key = t.kind + '\u0000' + t.text;
          if (seen.has(key)) return; // đã có từ hôm nay trở đi → không sinh trùng
          seen.add(key);
          mark.push(t);
          copies.push({
            kind: t.kind,
            done: false,
            text: t.text,
            tags: (t.tags || []).slice(),
            remind: { enabled: false, time: '20:00' },
            repeat: { freq: t.repeat.freq, every: t.repeat.every || 1 },
          });
        });
      });
    });
    return { copies: copies, mark: mark };
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
      /* undo(currentSnapshot): pop before-state from undo stack,
         push currentSnapshot onto redo stack, return before-state.
         redo(currentSnapshot): pop after-state from redo stack,
         push currentSnapshot onto undo stack, return after-state.
         This ensures redo restores the actual post-action state. */
      undo: function (currentSnapshot) {
        var s = undo.pop();
        if (s === undefined) return null;
        if (currentSnapshot !== undefined) redo.push(currentSnapshot);
        return s;
      },
      redo: function (currentSnapshot) {
        var s = redo.pop();
        if (s === undefined) return null;
        if (currentSnapshot !== undefined) undo.push(currentSnapshot);
        return s;
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
    reorderTask: reorderTask,
    moveTaskAcrossDays: moveTaskAcrossDays,
    nextOccurrence: nextOccurrence,
    planRecurrence: planRecurrence,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.PlanMath = api;
})();
