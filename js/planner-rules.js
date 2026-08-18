// TaskFlow — Smart Daily Planner (V1.3). Rule-based, deterministic, NO AI.
// Module thuần: không đọc/ghi localStorage, không gọi Sync, không touch DOM.
// Nhận toàn bộ input qua tham số → trả proposal. Apply (tạo TimeBlock) thuộc về
// planner-ui.js, CHỈ chạy khi người dùng bấm Apply. Preview không đổi data.
//
// Scoring CÔNG KHAI (không giấu sau "AI"):
//   overdue       +1000  deadline < hôm nay và chưa done
//   priority      +500   kind === 'priority'
//   deadline gần  +200 (≤3 ngày) / +100 (≤7 ngày)
//   milestone     +60    task thuộc milestone đang active trong project active
//   project       +30    task thuộc project active
//   duration       +20   có estimatedMinutes (lập được lịch)
//   energy         +15   có energy (biết cường độ)
//   đã có block    +40   task đã có TimeBlock hôm nay (giữ nguyên)
//   context        +10   có context
// Hoà tie: uid lexicographic → cùng input, cùng proposal (deterministic).
//
// Lịch: KHÔNG bịa availability. Free windows = khe TRỐNG giữa các TimeBlock đã có
// trong ngày (đã biết). Không có block → không biết khe → chỉ gợi ý thứ tự.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowPlannerRules = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MIN_SLOT = 15; // khe trống dưới 15 phút không đáng đề xuất

  /* ---------------- Helpers thuần ---------------- */

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  // 'HH:mm' → số phút từ 00:00; null nếu không hợp lệ.
  function toMinutes(t) {
    if (typeof t !== 'string') return null;
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
    if (!m) return null;
    return (+m[1]) * 60 + (+m[2]);
  }

  function fmtMinutes(min) {
    return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60);
  }

  function addMinutes(t, m) {
    const base = toMinutes(t);
    if (base === null || m < 0) return t;
    return fmtMinutes(base + m);
  }

  // 'YYYY-MM-DD' local từ Date (không lệch UTC).
  function dateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Số ngày từ `from` (00:00 local) tới `to` (00:00 local): âm = quá hạn.
  function dayDelta(to, from) {
    const a = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    const b = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    return Math.round((a - b) / 86400000);
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function stableSort(arr, keyFn) {
    return arr
      .map((item, i) => ({ item, i, key: keyFn(item) }))
      .sort((a, b) => {
        if (a.key > b.key) return -1;
        if (a.key < b.key) return 1;
        return a.i - b.i; // giữ thứ tự ban đầu cho bằng điểm
      })
      .map((x) => x.item);
  }

  /* ---------------- Scoring ---------------- */

  // ctx = { todayStr, now, projectMap, milestoneMap, blockUids:Set }
  function scoreTask(task, ctx) {
    let score = 0;
    const reasons = [];
    if (!task || typeof task !== 'object') return { score: 0, reasons };
    const done = !!task.done;
    if (done) return { score: 0, reasons, done: true };

    if (task.deadline) {
      const d = dayDelta(new Date(String(task.deadline).slice(0, 10) + 'T00:00:00'), ctx.now);
      if (d < 0) {
        score += 1000;
        reasons.push('overdue');
      } else if (d <= 3) {
        score += 200;
        reasons.push('deadline3');
      } else if (d <= 7) {
        score += 100;
        reasons.push('deadline7');
      }
    }
    if (task.kind === 'priority') {
      score += 500;
      reasons.push('priority');
    }
    if (task.projectId) {
      const proj = ctx.projectMap && ctx.projectMap[task.projectId];
      if (proj && proj.status === 'active') {
        score += 30;
        reasons.push('project');
        if (task.milestoneId) {
          const mile = ctx.milestoneMap && ctx.milestoneMap[task.milestoneId];
          if (mile && mile.status === 'active') {
            score += 60;
            reasons.push('milestone');
          }
        }
      }
    }
    const dur = task.duration > 0 ? +task.duration : 0;
    if (dur > 0) {
      score += 20;
      reasons.push('duration');
    }
    if (task.energy) {
      score += 15;
      reasons.push('energy');
    }
    if (ctx.blockUids && ctx.blockUids.has(task.uid)) {
      score += 40;
      reasons.push('scheduled');
    }
    if (Array.isArray(task.contexts) && task.contexts.length) {
      score += 10;
      reasons.push('context');
    }
    return { score, reasons, done };
  }

  /* ---------------- Free windows (chỉ từ block đã có) ---------------- */

  // blocks: TimeBlock đã có trong ngày. Trả về [{start,end,minutes}] các khe TRỐNG
  // giữa block liên tiếp (status != cancelled), sắp theo giờ. Không đủ 2 block
  // (không có khe biết trước) → null = chưa biết availability → chỉ gợi ý thứ tự.
  function computeFreeWindows(blocks) {
    if (!Array.isArray(blocks)) return null;
    const active = blocks
      .filter((b) => b && b.status !== 'cancelled')
      .map((b) => ({ start: toMinutes(b.start), end: toMinutes(b.end) }))
      .filter((x) => x.start !== null && x.end !== null)
      .sort((a, b) => a.start - b.start);
    if (active.length < 2) return null;
    const windows = [];
    for (let i = 1; i < active.length; i++) {
      const gap = active[i].start - active[i - 1].end;
      if (gap >= MIN_SLOT) {
        windows.push({
          start: fmtMinutes(active[i - 1].end),
          end: fmtMinutes(active[i].start),
          minutes: gap,
        });
      }
    }
    return windows.length ? windows : null;
  }

  // Đặt task (có duration) vào khe nhỏ nhất đủ chứa, greedy, không tạo block trùng.
  // Trả về [{taskUid,start,end}] hoặc null nếu không khe nào khớp.
  function suggestBlocks(tasks, windows) {
    if (!Array.isArray(windows) || !windows.length) return null;
    const avail = windows.map((w) => ({ start: w.start, end: w.end, minutes: w.minutes }));
    const placed = [];
    for (const tk of tasks) {
      const dur = tk.duration > 0 ? Math.round(+tk.duration) : 0;
      if (dur < MIN_SLOT) continue; // không duration → không đặt giờ, chỉ thứ tự
      let best = -1;
      let bestSize = Infinity;
      for (let i = 0; i < avail.length; i++) {
        if (avail[i].minutes >= dur && avail[i].minutes < bestSize) {
          best = i;
          bestSize = avail[i].minutes;
        }
      }
      if (best === -1) continue;
      const w = avail[best];
      placed.push({ taskUid: tk.uid, start: w.start, end: addMinutes(w.start, dur) });
      w.start = addMinutes(w.start, dur);
      w.minutes -= dur;
    }
    return placed.length ? placed : null;
  }

  /* ---------------- Proposal (thuần) ---------------- */

  // input = {
  //   tasks:        task objects hôm nay (uid, text, done, kind, duration, energy,
  //                contexts, projectId, milestoneId, deadline, …)
  //   blocks:       TimeBlock hôm nay (mảng)
  //   projects:     store planner-projects {projects:[…]} (hoặc null)
  //   availableMinutes: number|null — người dùng khai báo giờ rảnh (chỉ để cảnh báo)
  //   now:          Date (injectable cho test deterministic)
  //   topN:         mặc định 3
  // }
  function buildProposal(input) {
    const now = input && input.now instanceof Date ? input.now : new Date();
    const todayStr = dateStr(now);
    const tasks = Array.isArray(input && input.tasks) ? input.tasks : [];
    const blocks = Array.isArray(input && input.blocks) ? input.blocks : [];
    const projects = (input && input.projects && Array.isArray(input.projects.projects)) ? input.projects.projects : [];

    const projectMap = {};
    const milestoneMap = {};
    projects.forEach((p) => {
      if (!p || !p.id) return;
      projectMap[p.id] = p;
      (p.milestones || []).forEach((m) => {
        if (m && m.id) milestoneMap[m.id] = m;
      });
    });
    const blockUids = new Set(blocks.filter((b) => b && b.taskUid).map((b) => b.taskUid));
    const ctx = { now, todayStr, projectMap, milestoneMap, blockUids };

    const overdue = [];
    const candidates = [];
    tasks.forEach((tk) => {
      const sc = scoreTask(tk, ctx);
      if (sc.done) return;
      if (tk.deadline && dayDelta(new Date(String(tk.deadline).slice(0, 10) + 'T00:00:00'), now) < 0) {
        overdue.push({
          uid: tk.uid,
          text: tk.text,
          deadline: tk.deadline,
          options: ['today', 'tomorrow', 'this-week', 'inbox'],
        });
      }
      candidates.push({
        uid: tk.uid,
        text: tk.text,
        kind: tk.kind,
        duration: tk.duration > 0 ? +tk.duration : 0,
        energy: tk.energy || null,
        contexts: Array.isArray(tk.contexts) ? tk.contexts.slice() : [],
        score: sc.score,
        reasons: sc.reasons,
      });
    });

    // Sắp theo score giảm dần, hoà tie theo uid → deterministic.
    const ranked = stableSort(candidates, (c) => (c.score * 1000000) + (c.uid ? c.uid.charCodeAt(0) : 0));
    // Tiebreak chuẩn hơn: (score, uid) — stableSort đã giữ thứ tự, sắp lại theo uid rõ ràng:
    const byScore = stableSort(candidates, (c) => c.score);
    byScore.sort((a, b) => (b.score - a.score) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));

    const topN = input && input.topN > 0 ? Math.min(+input.topN, byScore.length) : Math.min(3, byScore.length);
    const top = byScore.slice(0, topN);

    const plannedMinutes = top.reduce((s, t) => s + (t.duration || 0), 0);
    const availableMinutes = input && typeof input.availableMinutes === 'number' && input.availableMinutes > 0 ? Math.round(+input.availableMinutes) : null;
    const overloaded = availableMinutes !== null && plannedMinutes > availableMinutes;

    const windows = computeFreeWindows(blocks);
    const suggestions = suggestBlocks(top, windows);
    const scheduleMode = suggestions && suggestions.length ? 'blocks' : 'order';

    return {
      generatedAt: now.toISOString(),
      todayStr,
      availableMinutes,
      plannedMinutes,
      overloaded,
      overloadDeltaMinutes: overloaded ? plannedMinutes - availableMinutes : 0,
      overdue: clone(overdue),
      top: clone(top),
      order: byScore.map((t) => t.uid),
      windows: windows ? clone(windows) : null,
      suggestions: suggestions ? clone(suggestions) : null,
      scheduleMode,
      scoreFactors: {
        overdue: 1000,
        priority: 500,
        deadline3: 200,
        deadline7: 100,
        milestone: 60,
        scheduled: 40,
        project: 30,
        duration: 20,
        energy: 15,
        context: 10,
      },
    };
  }

  // Định dạng phút → '30 phút' / '1 giờ' / '1 giờ 30 phút' (VI) hoặc
  // '30 min' / '1 h' / '1 h 30 min' (EN). Thuần; UI chọn ngôn ngữ.
  function formatMinutes(min, lang) {
    const m = Math.max(0, Math.round(min));
    const vi = lang === 'vi';
    if (m < 60) return m + (vi ? ' phút' : ' min');
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (!r) return vi ? h + ' giờ' : h + ' h';
    return vi ? h + ' giờ ' + r + ' phút' : h + ' h ' + r + ' min';
  }

  return {
    toMinutes,
    fmtMinutes,
    addMinutes,
    dateStr,
    dayDelta,
    computeFreeWindows,
    suggestBlocks,
    scoreTask,
    buildProposal,
    formatMinutes,
    MIN_SLOT,
  };
});
