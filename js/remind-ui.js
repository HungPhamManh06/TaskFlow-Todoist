// TaskFlow — Nhắc việc theo habit/task (tách từ app.js trong P11 refactor, extraction 27).
// Gồm: scheduleItemReminder (lên lịch 1 mốc nhắc + tự lặp ngày sau), syncReminderTimers
// (quét state, reset timer), renderRemindList (fill popup remindPop), insertBeforeTaskActions
// (chèn editor inline đúng vị trí task-row), beginRemindEdit (picker giờ 🔔 inline),
// turnOffRemind (tắt nhắc từ danh sách). itemRemindTimers là state nội bộ module.
// LƯU Ý: insertBeforeTaskActions dùng chung với beginRepeatEdit/beginTagEdit (app.js) —
// nên nằm trong destructure ở app.js. Phụ thuộc app-level (state/t/esc/save/renderOverview/
// renderWeek/trackEvent/TaskFlowUI/Notification) — resolve qua global scope tại thời điểm
// GỌI (pattern inbox/chat/search/quick-add/mood/year-report/digest).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowRemindUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  let itemRemindTimers = [];

  // Lên lịch 1 mốc nhắc cho item (lần kế tiếp trong ngày, hoặc ngày mai nếu đã qua).
  function scheduleItemReminder(it, from) {
    const [hh, mm] = String(it.time || '20:00').split(':').map(Number);
    let target = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hh, mm, 0, 0);
    if (target <= from) target = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, hh, mm, 0, 0);
    const delay = target.getTime() - from.getTime();
    if (delay > 2147483647) return; // setTimeout max ~24.8 ngày — mọi mốc nhắc trong ngày đều < 24h
    const timer = setTimeout(() => {
      try {
        new Notification('TaskFlow 🐥', {
          body: t('remindItemBody', { kind: t(it.kind === 'habit' ? 'remindKindHabit' : 'remindKindTask'), name: it.name }),
          icon: './icons/icon-192.png',
          tag: 'item-reminder',
        });
        trackEvent('reminder_show', { kind: it.kind });
      } catch (e) { /* ẩn */ }
      // Tự lên lịch lại cho ngày hôm sau (app mở lâu không mất nhắc)
      scheduleItemReminder(it, new Date(target.getTime() + 86400000));
    }, delay);
    itemRemindTimers.push(timer);
  }

  // Quét state hiện tại, lên lịch setTimeout cho từng habit/task đã bật nhắc.
  function syncReminderTimers() {
    itemRemindTimers.forEach(clearTimeout);
    itemRemindTimers = [];
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const items = [];
    state.habits.forEach((h) => { if (h.remind && h.remind.enabled) items.push({ kind: 'habit', name: h.name, time: h.remind.time }); });
    state.weeks.forEach((w) => (w.days || []).forEach((d) => (d.tasks || []).forEach((tk) => {
      if (tk.remind && tk.remind.enabled && tk.text) items.push({ kind: 'task', name: tk.text, time: tk.remind.time });
    })));
    const now = new Date();
    items.forEach((it) => scheduleItemReminder(it, now));
  }

  // Điền danh sách nhắc đang bật vào popup remindPop.
  function renderRemindList() {
    const list = document.getElementById('remindList');
    if (!list) return;
    const rows = [];
    state.habits.forEach((h) => {
      if (h.remind && h.remind.enabled) rows.push({ kind: 'habit', id: h.id, name: h.name, time: h.remind.time });
    });
    state.weeks.forEach((w) => (w.days || []).forEach((d) => (d.tasks || []).forEach((tk, ti) => {
      if (tk.remind && tk.remind.enabled && tk.text) rows.push({ kind: 'task', week: w.n, day: d.date, task: ti, name: tk.text, time: tk.remind.time });
    })));
    list.innerHTML = rows.length
      ? rows.map((r) => `
      <div class="remind-item">
        <span class="remind-item-name">${esc(r.kind === 'habit' ? '🔔 ' + r.name : '📋 ' + r.name)}</span>
        <span class="remind-item-time">${esc(r.time)}</span>
        <button type="button" class="mini-btn" data-action="remind-off-item" data-kind="${r.kind}" ${r.kind === 'habit' ? `data-id="${esc(r.id)}"` : `data-week="${r.week}" data-day="${esc(r.day)}" data-task="${r.task}"`} title="${t('remindOffItem')}" aria-label="${t('remindOffItem')}">✕</button>
      </div>`).join('')
      : `<p class="pop-note">${t('remindListEmpty')}</p>`;
  }

  // Inline picker giờ nhắc (pattern beginTagEdit): nhấn 🔔 → input time + nút lưu ngay cạnh nút.
  // Phase 4: nút 🔔/🏷️/🔁 giờ nằm trong dropdown ⋯ (.task-menu) — editor inline phải chèn vào
  // task-row (trước nhóm actions) thay vì cạnh nút (btn.nextSibling không còn là con của row).
  function insertBeforeTaskActions(btn, node) {
    const row = btn.closest('.task-row');
    const anchor = row ? row.querySelector('.task-row-actions') : null;
    if (anchor) row.insertBefore(node, anchor);
    else btn.parentElement.insertBefore(node, btn.nextSibling);
  }

  function beginRemindEdit(btn) {
    const kind = btn.dataset.action === 'remind-habit' ? 'habit' : 'task';
    const host = kind === 'habit' ? btn.closest('.habit-name-cell') : btn.closest('.task-row');
    if (!host) return;
    const existing = host.querySelector('.remind-edit-input');
    if (existing) { existing.remove(); return; }
    const wrap = document.createElement('span');
    wrap.className = 'remind-edit-input';
    const input = document.createElement('input');
    input.type = 'time';
    const cur = kind === 'habit'
      ? state.habits.find((h) => h.id === btn.dataset.id)
      : state.weeks[+btn.dataset.week - 1] && state.weeks[+btn.dataset.week - 1].days[+btn.dataset.day] && state.weeks[+btn.dataset.week - 1].days[+btn.dataset.day].tasks[+btn.dataset.task];
    input.value = (cur && cur.remind && cur.remind.time) || '20:00';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'mini-btn add-btn';
    save.textContent = t('remindSave');
    const off = document.createElement('button');
    off.type = 'button';
    off.className = 'mini-btn';
    off.textContent = '✕';
    wrap.appendChild(input);
    wrap.appendChild(save);
    wrap.appendChild(off);
    // Chèn vào đúng cha trực tiếp của nút (item-actions với habit, task-row với task)
    insertBeforeTaskActions(btn, wrap);
    input.focus();
    const commit = () => {
      const target = kind === 'habit'
        ? state.habits.find((h) => h.id === btn.dataset.id)
        : state.weeks[+btn.dataset.week - 1] && state.weeks[+btn.dataset.week - 1].days[+btn.dataset.day] && state.weeks[+btn.dataset.week - 1].days[+btn.dataset.day].tasks[+btn.dataset.task];
      if (!target) { wrap.remove(); return; }
      target.remind = { enabled: true, time: input.value || '20:00' };
      wrap.remove();
      renderRemindList();
      if (kind === 'habit') renderOverview(); else renderWeek();
      save();
      syncReminderTimers();
      trackEvent('reminder_item_set', { kind });
      TaskFlowUI.toast(t('remindSetDone', { kind: t(kind === 'habit' ? 'remindKindHabit' : 'remindKindTask'), t: target.remind.time }), 'success');
    };
    save.addEventListener('click', commit);
    off.addEventListener('click', () => wrap.remove());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') wrap.remove();
    });
  }

  // Tắt nhắc của 1 habit/task từ danh sách trong remindPop.
  function turnOffRemind(el) {
    const kind = el.dataset.kind;
    const target = kind === 'habit'
      ? state.habits.find((h) => h.id === el.dataset.id)
      : state.weeks[+el.dataset.week - 1] && state.weeks[+el.dataset.week - 1].days.find((d) => String(d.date) === el.dataset.day) && state.weeks[+el.dataset.week - 1].days.find((d) => String(d.date) === el.dataset.day).tasks[+el.dataset.task];
    if (!target) return;
    if (target.remind) target.remind.enabled = false;
    renderRemindList();
    if (kind === 'habit') renderOverview(); else renderWeek();
    save();
    syncReminderTimers();
    trackEvent('reminder_item_off', { kind });
  }

  return { scheduleItemReminder, syncReminderTimers, renderRemindList, insertBeforeTaskActions, beginRemindEdit, turnOffRemind };
});
