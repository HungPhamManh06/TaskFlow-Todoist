// TaskFlow — Focus mode (tách từ app.js trong P11 refactor, extraction 39 — A28).
// Gồm: openFocusMode/closeFocusMode, focusState/saveFocusState/getFocusedTask,
// taskFocusLog/Secs/Today/Sessions (nhật ký phiên), FOCUS_PRESETS + focusTimer
// state machine (Render/Sync/Complete/Start/Reset/SetDur), getTaskByUid,
// renderFocusContent/refreshFocusIfOpen, fmtSessionDate.
// State RIÊNG của module: focusTaskRef, focusMonthState, FOCUS_PRESETS, focusTimer.
// Export chỉ các hàm app.js còn gọi ngoài (dispatcher + render path) — API nhỏ:
//   openFocusMode, closeFocusMode, focusTimerStart, focusTimerReset, focusTimerSetDur,
//   refreshFocusIfOpen, taskFocusLog, taskFocusSecs
//   (taskFocusLog/taskFocusSecs còn được focus-stats.js + today.js gọi qua global lexical)
// Deps resolve qua global lexical tại thời điểm GỌI — pattern mood.js/popups.js:
//   t, esc, state, inbox, PLAN_YEAR/PLAN_MONTH/PLAN_START/NUM_DAYS, trackEvent,
//   monthStateRaw/saveMonthState (TaskFlowStorage), saveInbox (TaskFlowInbox),
//   pomoDateKey (TaskFlowKeys), nowInfo (TaskFlowClock), fmtDate (TaskFlowDates),
//   dateLocale (TaskFlowI18N), checkboxHTML (TaskFlowXP), taskFocusMinLabel
//   (TaskFlowFocusStats), pomoAddSession/renderPomoWidgetStats/renderPomoTomatoCounter
//   (còn trong app.js), window.TaskFlowUI (openDialog/closeDialog/toast/checkboxLabel)
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowFocus = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ---------- Focus Mode (Phase 5.6) ---------- */

  /* ---------- Phase 6: Focus theo task + bộ đếm + nhật ký phiên ---------- */

  // Ref tới task đang được focus (null = xem toàn bộ task hôm nay).
  let focusTaskRef = null;

  function openFocusMode(ref) {
    // ref có thể kèm y/m (từ Upcoming cho task tháng khác) hoặc scope=inbox — mặc định tháng hiện tại
    const newRef = ref ? (ref.scope === 'inbox'
      ? { scope: 'inbox', task: +ref.task }
      : {
        y: ref.y === undefined ? PLAN_YEAR : +ref.y,
        m: ref.m === undefined ? PLAN_MONTH : +ref.m,
        week: +ref.week, day: +ref.day, task: +ref.task,
      }) : null;
    focusMonthState = null;
    // Phase 6: chuyển sang task khác / xem tất cả → dừng bộ đếm (phiên thuộc về task đã bắt đầu)
    const switched = !!focusTaskRef && JSON.stringify(newRef) !== JSON.stringify(focusTaskRef);
    if (switched && focusTimer.running) {
      clearInterval(focusTimer.timer);
      focusTimer.timer = null;
      focusTimer.running = false;
      focusTimer.endAt = 0;
      focusTimer.left = focusTimer.dur;
    }
    focusTaskRef = newRef;
    document.body.classList.add('focus-mode');
    renderFocusContent();
    TaskFlowUI.openDialog('focusOverlay');
    trackEvent('focus_open');
  }
  function closeFocusMode() {
    document.body.classList.remove('focus-mode');
    TaskFlowUI.closeDialog('focusOverlay');
    // Bộ đếm vẫn chạy nền — mở lại focus sẽ thấy tiến trình còn lại
  }
  // State tháng chứa task đang focus khi ≠ tháng hiện tại (cache để focusLog ghi đúng tháng).
  let focusMonthState = null;

  function focusState() {
    if (!focusTaskRef) return null;
    if (focusTaskRef.scope === 'inbox') return state;
    if (focusTaskRef.y === PLAN_YEAR && focusTaskRef.m === PLAN_MONTH) return state;
    if (!focusMonthState) focusMonthState = monthStateRaw(focusTaskRef.y, focusTaskRef.m);
    return focusMonthState;
  }

  function saveFocusState() {
    if (!focusTaskRef) { save(); return; }
    if (focusTaskRef.scope === 'inbox') { saveInbox(inbox); return; }
    if (focusTaskRef.y === PLAN_YEAR && focusTaskRef.m === PLAN_MONTH) { save(); return; }
    if (focusMonthState) saveMonthState(focusTaskRef.y, focusTaskRef.m, focusMonthState);
  }

  function getFocusedTask() {
    if (!focusTaskRef) return null;
    if (focusTaskRef.scope === 'inbox') {
      const tk = inbox[focusTaskRef.task];
      return tk ? { w: null, d: null, tk, week: -1, day: -1, task: focusTaskRef.task } : null;
    }
    const st = focusState();
    if (!st) return null;
    const w = st.weeks && st.weeks[focusTaskRef.week - 1];
    if (!w) return null;
    const d = w.days && w.days[focusTaskRef.day];
    if (!d) return null;
    const tk = d.tasks && d.tasks[focusTaskRef.task];
    return tk ? { w, d, tk, week: focusTaskRef.week, day: focusTaskRef.day, task: focusTaskRef.task } : null;
  }

  // ---- Nhật ký phiên: mỗi task có focusLog = [{ d: 'YYYY-MM-DD', secs }] ----
  function taskFocusLog(tk) { return Array.isArray(tk.focusLog) ? tk.focusLog : []; }
  function taskFocusSecs(tk) { return taskFocusLog(tk).reduce((s, e) => s + (e.secs || 0), 0); }
  function taskFocusToday(tk) {
    const k = pomoDateKey(new Date());
    return taskFocusLog(tk).filter((e) => e.d === k).reduce((s, e) => s + (e.secs || 0), 0);
  }
  function taskFocusSessions(tk) { return taskFocusLog(tk).length; }

  // ---- Bộ đếm focus (countdown theo preset, chính xác cả khi tab ẩn qua endAt) ----
  const FOCUS_PRESETS = [5, 15, 25, 45];
  let focusTimer = { running: false, dur: 25 * 60, left: 25 * 60, timer: null, endAt: 0, taskUid: null };

  function focusTimerRender() {
    const mm = String(Math.floor(focusTimer.left / 60)).padStart(2, '0');
    const ss = String(focusTimer.left % 60).padStart(2, '0');
    const tEl = document.getElementById('focusTimerTime');
    if (tEl) tEl.textContent = mm + ':' + ss;
    const bEl = document.getElementById('focusTimerStart');
    if (bEl) bEl.textContent = focusTimer.running ? t('pomoPause') : t('pomoStart');
    document.querySelectorAll('#focusContent [data-action="focus-timer-set"]').forEach((btn) => {
      btn.classList.toggle('active', +btn.dataset.min * 60 === focusTimer.dur);
    });
  }
  function focusTimerSync() {
    if (!focusTimer.running) return;
    const left = Math.max(0, Math.ceil((focusTimer.endAt - Date.now()) / 1000));
    if (left <= 0) focusTimerComplete();
    else { focusTimer.left = left; focusTimerRender(); }
  }
  function focusTimerComplete() {
    clearInterval(focusTimer.timer);
    focusTimer.timer = null;
    focusTimer.running = false;
    const secs = focusTimer.dur;
    focusTimer.endAt = 0;
    // Ghi vào nhật ký của đúng task đã focus khi bắt đầu (theo uid — không lệch theo index).
    // Tìm trong state tháng chứa task (focusTaskRef có thể trỏ task tháng khác khi mở từ Upcoming).
    const byUid = getTaskByUid(focusTimer.taskUid);
    if (byUid) {
      byUid.focusLog = byUid.focusLog || [];
      byUid.focusLog.push({ d: pomoDateKey(new Date()), secs });
      // Giới hạn dung lượng localStorage — chỉ giữ 100 phiên gần nhất (UI chỉ hiện 5)
      if (byUid.focusLog.length > 100) byUid.focusLog = byUid.focusLog.slice(-100);
      saveFocusState();
    }
    // Đồng thời cộng vào thống kê pomo hôm nay (focus minutes + quả cà chua)
    pomoAddSession(secs);
    renderPomoWidgetStats();
    renderPomoTomatoCounter();
    focusTimer.left = focusTimer.dur;
    focusTimerRender();
    TaskFlowUI.toast(t('focusDone'), 'success');
    refreshFocusIfOpen();
    trackEvent('focus_session_complete', { secs });
  }
  function focusTimerStart() {
    if (focusTimer.running) {
      clearInterval(focusTimer.timer);
      focusTimer.timer = null;
      focusTimer.running = false;
      focusTimer.endAt = 0;
      focusTimerRender();
      return;
    }
    const g = getFocusedTask();
    if (g) focusTimer.taskUid = g.tk.uid;
    focusTimer.running = true;
    focusTimer.endAt = Date.now() + focusTimer.left * 1000;
    focusTimer.timer = setInterval(focusTimerSync, 1000);
    focusTimerRender();
    trackEvent('focus_timer_start', { dur: focusTimer.dur });
  }
  function focusTimerReset() {
    clearInterval(focusTimer.timer);
    focusTimer.timer = null;
    focusTimer.running = false;
    focusTimer.endAt = 0;
    focusTimer.left = focusTimer.dur;
    focusTimerRender();
  }
  function focusTimerSetDur(min) {
    clearInterval(focusTimer.timer);
    focusTimer.timer = null;
    focusTimer.running = false;
    focusTimer.endAt = 0;
    focusTimer.dur = Math.max(1, min) * 60;
    focusTimer.left = focusTimer.dur;
    focusTimerRender();
  }

  // Tìm task theo uid (bền vững khi index đổi do xoá/chèn).
  function getTaskByUid(uid) {
    if (!uid) return null;
    // Tìm trong inbox trước (task chưa lên lịch), rồi state tháng hiện tại; nếu focus trỏ
    // task tháng khác thì tìm thêm trong focusMonthState.
    const hitInbox = inbox.find((tk) => tk && tk.uid === uid);
    if (hitInbox) return hitInbox;
    const sts = [state, focusMonthState].filter(Boolean);
    for (const st of sts) {
      if (!st || !Array.isArray(st.weeks)) continue;
      for (const w of st.weeks) {
        if (!w || !Array.isArray(w.days)) continue;
        for (const d of w.days) {
          if (!d || !Array.isArray(d.tasks)) continue;
          const hit = d.tasks.find((tk) => tk && tk.uid === uid);
          if (hit) return hit;
        }
      }
    }
    return null;
  }

  function renderFocusContent() {
    const box = document.getElementById('focusContent');
    if (!box) return;
    const now = new Date();
    const ti = nowInfo(PLAN_START, NUM_DAYS);
    const today = ti.inRange ? ti.dayInWeek : -1;
    const focused = getFocusedTask();
    if (focused) {
      const { w, tk, week, day, task } = focused;
      const totSecs = taskFocusSecs(tk);
      const todaySecs = taskFocusToday(tk);
      const count = taskFocusSessions(tk);
      const log = taskFocusLog(tk).slice(-5).reverse();
      box.innerHTML = `
      <p class="focus-date">📅 ${fmtDate(now)}</p>
      <div class="focus-taskview">
        <p class="focus-focusing">${t('focusFocusing')}</p>
        <div class="focus-tasktext ${tk.done ? 'done' : ''}">${checkboxHTML(tk.kind === 'priority' ? 'pink' : 'blue', tk.done, focusTaskRef.scope === 'inbox' ? `data-action="task" data-scope="inbox" data-task="${task}"` : `data-action="task" data-week="${week}" data-day="${day}" data-task="${task}" data-y="${focusTaskRef.y}" data-m="${focusTaskRef.m}"`, window.TaskFlowUI.checkboxLabel('task', tk.text, fmtDate(now)))}<span class="focus-tasktext-txt">${esc(tk.text) || '…'}</span></div>
        <div class="focus-timer">
          <div class="focus-timer-presets" role="group" aria-label="${t('focusTimer')}">
            ${FOCUS_PRESETS.map((m) => `<button type="button" class="focus-preset" data-action="focus-timer-set" data-min="${m}" ${m * 60 === focusTimer.dur ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${t('pomoMinShort', { n: m })}</button>`).join('')}
          </div>
          <div class="focus-timer-time" id="focusTimerTime">00:00</div>
          <div class="focus-timer-actions">
            <button type="button" class="pop-btn primary" data-action="focus-timer-start" id="focusTimerStart">${t('pomoStart')}</button>
            <button type="button" class="pop-btn" data-action="focus-timer-reset">${t('focusReset')}</button>
          </div>
        </div>
        <div class="focus-log">
          <h3 class="focus-sec-title">${t('focusLog')}</h3>
          ${count ? `<p class="focus-log-summary">${t('focusLogToday', { n: Math.round(todaySecs / 60), c: taskFocusLog(tk).filter((e) => e.d === pomoDateKey(now)).length })} · ${t('focusLogTotal', { n: Math.round(totSecs / 60) })}</p>` : ''}
          ${log.length ? `<ul class="focus-log-list">${log.map((e) => `<li class="focus-log-item">${esc(fmtSessionDate(e.d))} · ${taskFocusMinLabel(e.secs)}</li>`).join('')}</ul>` : `<p class="focus-empty">${t('focusNoSessions')}</p>`}
        </div>
        <button type="button" class="focus-showall" data-action="focus-show-all">${t('focusShowAll')}</button>
      </div>`;
      focusTimerRender();
      return;
    }
    let tasks = [];
    if (ti.inRange) {
      const w = state.weeks[ti.week - 1];
      const d = w && w.days[ti.dayInWeek];
      if (d) tasks = d.tasks || [];
    }
    const habits = state.habits.filter((h) => today >= 0 && !h.days[today]);
    box.innerHTML = `
    <p class="focus-date">📅 ${fmtDate(now)}</p>
    <h3 class="focus-sec-title">${t('focusToday')}</h3>
    <div class="focus-tasks">
      ${tasks.length ? tasks.map((tk, i) => `<div class="focus-task ${tk.done ? 'done' : ''}">${checkboxHTML(tk.kind === 'priority' ? 'pink' : 'blue', tk.done, `data-action="task" data-week="${ti.week}" data-day="${ti.dayInWeek}" data-task="${i}"`, window.TaskFlowUI.checkboxLabel('task', tk.text, fmtDate(now)))}<span class="focus-task-text">${esc(tk.text) || '…'}</span></div>`).join('') : `<p class="focus-empty">${t('focusNoTask')}</p>`}
    </div>
    <h3 class="focus-sec-title">${t('focusHabits')}</h3>
    <div class="focus-habits">
      ${habits.length ? habits.map((h) => `<button type="button" class="focus-habit" data-action="habit" data-id="${h.id}" data-day="${today}">🐥 ${esc(h.name)}</button>`).join('') : `<p class="focus-empty">${t('focusHabitDone')}</p>`}
    </div>`;
  }
  function refreshFocusIfOpen() {
    if (document.body.classList.contains('focus-mode')) renderFocusContent();
  }

  // 'YYYY-MM-DD' → nhãn phiên ngắn ('2/8' hay 'Thứ 3').
  function fmtSessionDate(d) {
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(d);
    const dt = new Date(+m[1], +m[2] - 1, +m[3]);
    if (Number.isNaN(dt.getTime())) return String(d);
    const now = new Date();
    if (pomoDateKey(now) === d) return t('todayTxt');
    return dt.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'numeric' });
  }

  return {
    openFocusMode, closeFocusMode, focusTimerStart, focusTimerReset, focusTimerSetDur,
    refreshFocusIfOpen, taskFocusLog, taskFocusSecs,
  };
});
