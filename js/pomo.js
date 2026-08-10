// TaskFlow — Pomodoro timer (tách từ app.js trong P11 refactor, extraction 40 — A18).
// Gồm: renderPomo, pomoSync, pomoStart, pomoReset, pomoSetMode, togglePomoPanel,
// pomoAddSession, pomoWeekSecs. State RIÊNG của module: POMO_WORK/BREAK/LONG_BREAK,
// pomo, pomoEndAt. pomoDuration + pomoComplete chỉ được gọi nội bộ — không export.
// Export chỉ các hàm app.js/module khác còn gọi ngoài (API nhỏ):
//   renderPomo (week render), togglePomoPanel/pomoStart/pomoReset/pomoSetMode
//   (dispatcher), pomoSync (visibilitychange/focus listeners), pomoWeekSecs
//   (renderPomoWidgetStats), pomoAddSession (focus.js gọi qua global lexical)
// Deps resolve qua global lexical tại thời điểm GỌI — pattern mood.js/popups.js:
//   t, trackEvent, state, PLAN_START, loadPomoLog/savePomoLog (TaskFlowStorage),
//   pomoDateKey (TaskFlowKeys), window.TaskFlowUI (toast), renderPomoWidgetStats
//   (còn trong app.js A20), refreshFocusIfOpen (TaskFlowFocus — js/focus.js)
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowPomo = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ============================ Phase 2: Pomodoro ============================ */

  const POMO_WORK = 25 * 60, POMO_BREAK = 5 * 60, POMO_LONG_BREAK = 25 * 60;
  let pomo = { mode: 'work', left: POMO_WORK, running: false, timer: null, sessionCount: 0, todayCount: 0 };
  // Timestamp (ms) khi phiên kết thúc — dùng để tính thời gian còn lại chính xác
  // kể cả khi tab ẩn (setInterval bị browser throttle ở tab nền).
  let pomoEndAt = 0;

  function renderPomo() {
    const mm = String(Math.floor(pomo.left / 60)).padStart(2, '0');
    const ss = String(pomo.left % 60).padStart(2, '0');
    const tEl = document.getElementById('pomoTime');
    if (tEl) tEl.textContent = mm + ':' + ss;
    const mEl = document.getElementById('pomoMode');
    if (mEl) {
      const modeLabel = pomo.mode === 'work' ? t('pomoWork') : (pomo.mode === 'longBreak' ? t('pomoLongBreak') : t('pomoBreak'));
      const minLabel = pomo.mode === 'longBreak' ? 25 : (pomo.mode === 'work' ? 25 : 5);
      mEl.textContent = modeLabel + ' · ' + t('pomoMin', { n: minLabel });
    }
    const bEl = document.getElementById('pomoStart');
    if (bEl) bEl.textContent = pomo.running ? t('pomoPause') : t('pomoStart');
    // Widget tuần view (nếu có)
    const wT = document.getElementById('pomoWidgetTime');
    if (wT) wT.textContent = mm + ':' + ss;
    const wM = document.getElementById('pomoWidgetMode');
    if (wM) {
      const modeLabel = pomo.mode === 'work' ? t('pomoWork') : (pomo.mode === 'longBreak' ? t('pomoLongBreak') : t('pomoBreak'));
      const minLabel = pomo.mode === 'longBreak' ? 25 : (pomo.mode === 'work' ? 25 : 5);
      wM.textContent = modeLabel + ' · ' + t('pomoMin', { n: minLabel });
    }
    const wB = document.getElementById('pomoWidgetStart');
    if (wB) wB.textContent = pomo.running ? t('pomoPause') : t('pomoStart');
  }

  function pomoDuration() {
    return pomo.mode === 'work' ? POMO_WORK : (pomo.mode === 'longBreak' ? POMO_LONG_BREAK : POMO_BREAK);
  }

  // Cập nhật pomo.left từ đồng hồ thật — chạy được cả khi tab ẩn (visibilitychange/focus).
  function pomoSync() {
    if (!pomo.running) return;
    const left = Math.max(0, Math.ceil((pomoEndAt - Date.now()) / 1000));
    if (left <= 0) {
      pomoComplete();
    } else {
      pomo.left = left;
      renderPomo();
    }
  }

  // Hoàn thành phiên: ghi session, tự chuyển mode (work → break, sau 4 lần → long break).
  function pomoComplete() {
    if (!pomo.running) return;
    clearInterval(pomo.timer);
    pomo.timer = null;
    pomo.running = false;
    const finished = pomo.mode;
    trackEvent('pomodoro_complete', { mode: finished });
    if (finished === 'work') {
      pomoAddSession(POMO_WORK);
      // Tăng session count và kiểm tra 4 lần → long break
      const log = loadPomoLog();
      const todayKey = pomoDateKey(new Date());
      const todaySessions = log[todayKey] ? log[todayKey].count : 0;
      if (todaySessions > 0 && todaySessions % 4 === 0) {
        pomo.mode = 'longBreak';
        TaskFlowUI.toast(t('pomoWorkDoneTxt') + ' · ' + t('pomoLongBreak'), 'success');
      } else {
        TaskFlowUI.toast(t('pomoDoneWork'), 'success');
        pomo.mode = 'break';
      }
    } else if (finished === 'longBreak') {
      TaskFlowUI.toast(t('pomoLongBreakDone'), 'success');
      pomo.mode = 'work';
    } else {
      TaskFlowUI.toast(t('pomoDoneBreak'), 'success');
      pomo.mode = 'work';
    }
    pomo.left = pomoDuration();
    pomoEndAt = 0;
    renderPomoWidgetStats();
    renderPomo();
    refreshFocusIfOpen();
  }

  function pomoStart() {
    if (pomo.running) {
      clearInterval(pomo.timer);
      pomo.timer = null;
      pomo.running = false;
      pomoEndAt = 0;
      renderPomo();
      return;
    }
    pomo.running = true;
    trackEvent('pomodoro_start', { mode: pomo.mode });
    pomoEndAt = Date.now() + pomo.left * 1000;
    pomo.timer = setInterval(pomoSync, 1000);
    renderPomo();
  }

  function pomoReset() {
    clearInterval(pomo.timer);
    pomo.timer = null;
    pomo.running = false;
    pomoEndAt = 0;
    pomo.left = pomoDuration();
    renderPomo();
  }

  function pomoSetMode(mode) {
    clearInterval(pomo.timer);
    pomo.timer = null;
    pomo.running = false;
    pomoEndAt = 0;
    pomo.mode = mode === 'break' ? 'break' : mode === 'longBreak' ? 'longBreak' : 'work';
    pomo.left = pomoDuration();
    renderPomo();
    trackEvent('pomodoro_mode', { mode: pomo.mode });
  }

  function togglePomoPanel() {
    const p = document.getElementById('pomoPanel');
    if (!p) return;
    p.hidden = !p.hidden;
    if (!p.hidden) {
      const chat = document.getElementById('chatPop');
      if (chat) chat.hidden = true;
      renderPomo();
    }
  }

  /* ---------- Pomodoro widget trong tuần view (Phase 4) ---------- */

  function pomoAddSession(secs) {
    const log = loadPomoLog();
    const k = pomoDateKey(new Date());
    if (!log[k]) log[k] = { count: 0, secs: 0 };
    log[k].count++;
    log[k].secs += secs;
    savePomoLog(log);
  }
  function pomoWeekSecs() {
    // Cộng 7 ngày của tuần hiện tại (PLAN_START + offset)
    const log = loadPomoLog();
    let secs = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(PLAN_START.getTime() + ((state.currentWeek - 1) * 7 + i) * 86400000);
      const e = log[pomoDateKey(d)];
      if (e) secs += e.secs;
    }
    return secs;
  }

  return {
    renderPomo, pomoSync, pomoStart, pomoReset, pomoSetMode, togglePomoPanel,
    pomoAddSession, pomoWeekSecs,
  };
});
