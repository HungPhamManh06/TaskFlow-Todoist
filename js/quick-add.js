// TaskFlow — Quick Add (tách từ app.js trong P11 refactor, extraction 23).
// Gồm: quickAddDefaultTarget (target mặc định theo ngữ cảnh view), quickAddTarget
// (state modal), openQuickAdd/closeQuickAdd (mở/đóng dialog), submitQuickAdd
// (tạo task — inbox hoặc lưới tháng, hỗ trợ undo snapshot).
// Module phụ thuộc state app-level (state/PLAN_YEAR/PLAN_MONTH/PLAN_START/NUM_WEEKS)
// và helper (TaskFlowUI/t/localISODate/trackEvent/newTaskUid/pushUndo/pushTaskToDate/
// renderCurrentView/inbox/saveInbox/inboxTargetForDate) — resolve qua global scope tại
// thời điểm GỌI (pattern inbox.js/chat.js/search.js): browser app.js load sau
// quick-add.js nhưng mọi hàm chỉ chạy sau boot; Node: textual test only.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowQuickAdd = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Target mặc định theo ngữ cảnh view: {scope:'inbox'} hoặc {dt: Date}.
  function quickAddDefaultTarget() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (state.view === 'inbox') return { scope: 'inbox' };
    if (state.view === 'day') {
      // Ngày đang xem trong lưới tháng hiện tại
      const dt = new Date(PLAN_START.getTime() + ((state.dayWeek - 1) * 7 + state.dayDay) * 86400000);
      return { dt };
    }
    if (state.view === 'week') {
      // Ưu tiên hôm nay nếu trong lưới tháng; nếu không thì ngày đầu tuần đang xem
      const inCur = Math.floor((today - PLAN_START) / 86400000);
      return inCur >= 0 && inCur < NUM_WEEKS * 7
        ? { dt: today }
        : { dt: new Date(PLAN_START.getTime() + (state.currentWeek - 1) * 7 * 86400000) };
    }
    if (state.view === 'calendar' && typeof calendarMode !== 'undefined' && calendarMode === 'schedule') {
      // Schedule view: mặc định ngày = ngày đang chọn trong timeline (nếu đã chọn).
      if (typeof calendarSelDate === 'string' && calendarSelDate) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calendarSelDate);
        if (m) return { dt: new Date(+m[1], +m[2] - 1, +m[3]) };
      }
    }
    return { dt: today };
  }

  let quickAddTarget = null;

  function openQuickAdd() {
    const m = document.getElementById('quickAddModal');
    if (!m) return;
    quickAddTarget = quickAddDefaultTarget();
    const inp = document.getElementById('quickAddInput');
    const dateField = document.getElementById('quickAddDateField');
    const dateIn = document.getElementById('quickAddDate');
    const note = document.getElementById('quickAddNote');
    if (inp) inp.value = '';
    if (quickAddTarget.scope === 'inbox') {
      if (dateField) dateField.hidden = true;
      if (note) note.textContent = t('quickAddInbox');
    } else {
      if (dateField) dateField.hidden = false;
      if (dateIn) dateIn.value = localISODate(quickAddTarget.dt);
      // P8: note trung thực với ngữ cảnh — mở từ Day/Week view ngày khác → "ngày đã chọn"
      const isToday = quickAddTarget.dt && localISODate(quickAddTarget.dt) === localISODate(new Date());
      if (note) note.textContent = t(isToday ? 'quickAddToday' : 'quickAddDay');
      // Đổi ngày → cập nhật note cho trung thực với ngày đã chọn
      if (dateIn && !dateIn.dataset.qaWired) {
        dateIn.dataset.qaWired = '1';
        dateIn.addEventListener('change', () => {
          const n = document.getElementById('quickAddNote');
          if (n && quickAddTarget && quickAddTarget.scope !== 'inbox') n.textContent = t('quickAddDay');
        });
      }
    }
    TaskFlowUI.openDialog('quickAddModal');
    if (inp) inp.focus();
    trackEvent('quick_add_open');
  }

  function closeQuickAdd() {
    TaskFlowUI.closeDialog('quickAddModal');
  }

  function submitQuickAdd() {
    const inp = document.getElementById('quickAddInput');
    const text = (inp && inp.value || '').trim();
    if (!text) {
      if (inp) inp.focus();
      TaskFlowUI.toast(t('quickAddEmpty'), 'error');
      return;
    }
    const dateIn = document.getElementById('quickAddDate');
    const timeIn = document.getElementById('quickAddTime');
    const durIn = document.getElementById('quickAddDur');
    const prioIn = document.getElementById('quickAddPrio');
    const timeVal = timeIn && timeIn.value ? timeIn.value : '20:00';
    const tk = {
      uid: newTaskUid(),
      kind: (prioIn && prioIn.checked) ? 'priority' : 'regular',
      done: false,
      text,
      tags: [],
      linkedMetricIds: [],
      remind: { enabled: false, time: timeVal },
    };
    if (durIn && durIn.value !== '') tk.duration = Math.max(0, +durIn.value || 0);
    let ok = false;
    if (quickAddTarget && quickAddTarget.scope === 'inbox') {
      tk.inbox = true;
      inbox.push(tk);
      saveInbox(inbox);
      ok = true;
      trackEvent('create_task', { scope: 'quickadd-inbox' });
    } else {
      let dt = quickAddTarget && quickAddTarget.dt;
      if (dateIn && dateIn.value) {
        const p = dateIn.value.split('-').map(Number);
        dt = new Date(p[0], p[1] - 1, p[2]);
      }
      // Quick Add vào lưới tháng hiện tại → có thể hoàn tác (undo snapshot state)
      if (dt) {
        const tgt = inboxTargetForDate(dt);
        if (tgt && tgt.y === PLAN_YEAR && tgt.m === PLAN_MONTH) pushUndo();
      }
      ok = !!dt && pushTaskToDate(tk, dt);
      if (ok) trackEvent('create_task', { scope: 'quickadd' });
    }
    if (ok) {
      closeQuickAdd();
      renderCurrentView();
      TaskFlowUI.toast(t('quickAddToast'), 'success');
    }
  }

  return { openQuickAdd, closeQuickAdd, submitQuickAdd };
});
