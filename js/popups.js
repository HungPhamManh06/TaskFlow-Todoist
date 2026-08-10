// TaskFlow — Popups / Demo / Templates (tách từ app.js trong P11 refactor, extraction 28).
// Gồm: confettiBurst (canvas celebration), HABIT_TEMPLATES + templatesPopHTML (thư viện
// thói quen mẫu), demoPlan (dữ liệu demo), seedHabitDays/seedTasks (helpers của
// defaultState + demo).
// LƯU Ý coupling: module này KHÔNG sở hữu state app; resolve dependencies qua global
// lexical tại thời điểm GỌI — pattern mood.js/remind-ui.js:
//   prefersReducedMotion, t, esc, getLang, nowInfo, PLAN_START/PLAN_YEAR/PLAN_MONTH/
//   NUM_DAYS, state, newTaskUid, renderCurrentView, save, trackEvent, habitDaysElapsed
// Đều nằm trong global lexical của app.js (script load sau) hoặc window — resolve runtime.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowPopups = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ============================ Confetti ============================ */

  let confettiRun = null;
  function confettiBurst() {
    if (prefersReducedMotion()) return;
    if (confettiRun) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.scale(DPR, DPR);
    const colors = ['#F59890', '#F7D970', '#8EBCDF', '#9ED3A8', '#C3A8E8', '#F2A48E', '#FFF5D6'];
    const parts = [];
    for (let i = 0; i < 150; i++) {
      parts.push({
        x: W * 0.5 + (Math.random() - 0.5) * 260,
        y: H * 0.35 + (Math.random() - 0.5) * 160,
        vx: (Math.random() - 0.5) * 13,
        vy: -(4 + Math.random() * 9),
        g: 0.22 + Math.random() * 0.12,
        size: 5 + Math.random() * 7,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.35,
        shape: Math.random() < 0.5 ? 'rect' : 'circle',
      });
    }
    const start = performance.now();
    const DUR = 2400;
    confettiRun = true;
    function frame(now) {
      const t = Math.min(1, (now - start) / DUR);
      ctx.clearRect(0, 0, W, H);
      parts.forEach((p) => {
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const alpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      });
      if (t < 1) requestAnimationFrame(frame);
      else { canvas.remove(); confettiRun = null; }
    }
    requestAnimationFrame(frame);
  }

  /* ---------- 6A.2 — Thư viện thói quen mẫu ---------- */

  const HABIT_TEMPLATES = [
    { icon: '📚', vi: 'Đọc sách 20 phút', en: 'Read 20 minutes' },
    { icon: '💧', vi: 'Uống nước đủ 2L', en: 'Drink 2L water' },
    { icon: '🏃', vi: 'Vận động 30 phút', en: 'Exercise 30 min' },
    { icon: '🧘', vi: 'Thiền 10 phút', en: 'Meditate 10 min' },
    { icon: '🥗', vi: 'Ăn rau xanh', en: 'Eat veggies' },
    { icon: '😴', vi: 'Ngủ đủ 8 tiếng', en: 'Sleep 8 hours' },
    { icon: '🕊', vi: 'Dậy sớm 6h', en: 'Wake up at 6am' },
    { icon: '✍️', vi: 'Viết nhật ký', en: 'Journal' },
    { icon: '📵', vi: 'Không lướt điện thoại 1h', en: 'No phone for 1 hour' },
    { icon: '💪', vi: 'Hít đất 20 cái', en: '20 push-ups' },
    { icon: '🗣', vi: 'Học tiếng Anh 30 phút', en: 'Study English 30 min' },
    { icon: '🎨', vi: 'Luyện kỹ năng mới', en: 'Practice a skill' },
    { icon: '🌅', vi: 'Đi bộ 10.000 bước', en: 'Walk 10k steps' },
    { icon: '🧹', vi: 'Dọn dẹp 15 phút', en: 'Tidy 15 min' },
    { icon: '💰', vi: 'Tiết kiệm tiền', en: 'Save money' },
    { icon: '🙏', vi: 'Biết ơn 3 điều', en: 'Note 3 gratitudes' },
  ];

  function templatesPopHTML() {
    return `<div class="templates-pop" id="templatesPop" hidden>
    <strong class="templates-title">${t('templatesTitle')}</strong>
    <p class="templates-hint">${t('templatesHint')}</p>
    <div class="templates-list">
      ${HABIT_TEMPLATES.map((h) => `<button type="button" class="template-chip" data-action="template-add" data-name="${esc(h[getLang()])}">${h.icon} ${esc(h[getLang()])}</button>`).join('')}
    </div>
  </div>`;
  }

  /* ---------- 6A.3 — Dữ liệu mẫu ---------- */

  function demoPlan() {
    const now = new Date();
    const ti = nowInfo(PLAN_START, NUM_DAYS);
    const today = now.getDate() - 1;
    const isEn = getLang() === 'en';
    if (!state.monthlyGoals.length) {
      state.monthlyGoals.push(
        { id: 'dg' + Date.now(), text: isEn ? 'Finish the biggest project' : 'Hoàn thành dự án lớn nhất', kind: 'priority', done: false },
        { id: 'dg' + (Date.now() + 1), text: isEn ? 'Work out 4 times/week' : 'Tập thể dục 4 lần/tuần', kind: 'priority', done: false },
        { id: 'dg' + (Date.now() + 2), text: isEn ? 'Read 2 books' : 'Đọc 2 cuốn sách', kind: 'regular', done: false }
      );
    }
    if (!state.habits.length) {
      (isEn
        ? ['💧 Drink 2L of water', '📚 Read for 20 minutes', '🏃 Move for 30 minutes', '😴 Sleep 8 hours']
        : ['💧 Uống nước đủ 2L', '📚 Đọc sách 20 phút', '🏃 Vận động 30 phút', '😴 Ngủ đủ 8 tiếng']).forEach((name, i) => {
        const h = { id: 'dh' + Date.now() + i, name, target: 100, days: Array.from({ length: NUM_DAYS }, () => false), remind: { enabled: false, time: '20:00' } };
        for (let d = 0; d <= today && d < NUM_DAYS; d++) h.days[d] = Math.random() < 0.8;
        state.habits.push(h);
      });
    }
    if (ti.inRange) {
      const w = state.weeks[ti.week - 1];
      const d = w && w.days[ti.dayInWeek];
      if (d && !d.tasks.length) {
        d.tasks.push({ uid: newTaskUid(), kind: 'priority', done: false, text: isEn ? 'Lock in today\u2019s goals' : 'Chốt mục tiêu hôm nay', tags: [], remind: { enabled: false, time: '20:00' } });
        d.tasks.push({ uid: newTaskUid(), kind: 'regular', done: false, text: isEn ? 'Check in habits' : 'Điểm danh thói quen', tags: [], remind: { enabled: false, time: '20:00' } });
      }
    }
    renderCurrentView();
    save();
    trackEvent('demo_data');
  }

  /* ---------- Seed helpers (defaultState + demo) ---------- */

  function seedHabitDays(targetPct) {
    // Chỉ tick những ngày đã trôi qua đến hôm nay — KHÔNG bao giờ tick ngày tương lai.
    // Nhờ đó streak/record/% phản ánh đúng số ô ✓ thực tế, không "tính từ ngày tạo thói quen".
    const elapsed = habitDaysElapsed(PLAN_YEAR, PLAN_MONTH, NUM_DAYS);
    const n = Math.max(0, Math.round((elapsed * targetPct) / 100));
    const start = Math.max(0, elapsed - n);
    return Array.from({ length: NUM_DAYS }, (_, i) => i >= start && i < elapsed);
  }
  function seedTasks(pct) {
    const checked = Math.round(pct / 20); // 0..5
    return Array.from({ length: 5 }, (_, i) => ({ uid: newTaskUid(), kind: i < 2 ? 'priority' : 'regular', done: i < checked, text: '', tags: [] }));
  }

  return { confettiBurst, templatesPopHTML, demoPlan, seedHabitDays, seedTasks };
});
