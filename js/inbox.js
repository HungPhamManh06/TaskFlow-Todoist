// TaskFlow — Inbox view (tách từ app.js trong P11 refactor, extraction 20).
// Gồm: loadInbox/saveInbox (bộ nhớ 'planner-inbox' + Sync.push), inboxMeta +
// inboxTaskRowHTML + renderInbox (render view Inbox), inboxTargetForDate (ngày →
// vị trí lưới tháng), scheduleInboxTask + addInboxTask (capture + schedule flow),
// handleInboxAction (dispatch action inbox-add/del/today/tomorrow/date-schedule).
// State `inbox` truyền qua tham số (giữ trong app.js — nhiều call-site đọc/ghi trực
// tiếp, KHÔNG duplicate state); helper app-level (t/esc/fmtDeadline/checkboxHTML/
// emptyStateHTML/pushTaskToDate/newTaskUid/trackEvent/pushUndo/doUndo/closeTaskDetail/
// TaskFlowUI + plan globals) resolve qua global scope tại thời điểm GỌI — browser:
// app.js load sau inbox.js nhưng mọi hàm chỉ chạy sau boot (pattern syncui/clock);
// Node: textual test only (không execute, không cần mock).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowInbox = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const INBOX_KEY = 'planner-inbox';

  function loadInbox() {
    try {
      const r = JSON.parse(localStorage.getItem(INBOX_KEY));
      if (Array.isArray(r)) {
        // Vệ sinh: task thiếu uid → gán uid cố định (nền tảng carry-over khi lên lịch)
        r.forEach((tk) => { if (!tk || typeof tk.uid !== 'string') tk.uid = newTaskUid(); if (!Array.isArray(tk.tags)) tk.tags = []; });
        return r;
      }
    } catch (e) { /* ẩn */ }
    return [];
  }

  function saveInbox(inbox) {
    try { localStorage.setItem(INBOX_KEY, JSON.stringify(inbox)); } catch (e) { /* ẩn */ }
    if (typeof window !== 'undefined' && window.Sync) window.Sync.push(INBOX_KEY);
  }

  // Row Inbox: checkbox + text (sửa trực tiếp) + meta + hành động (lên lịch hôm nay / xoá).
  function inboxMeta(tk) {
    const bits = [];
    if (tk.kind === 'priority') bits.push(t('taskPriorityLabel'));
    if (tk.duration) bits.push(t('pomoMinShort', { n: tk.duration }));
    if (tk.deadline) bits.push(fmtDeadline(tk.deadline));
    const tags = Array.isArray(tk.tags) ? tk.tags : [];
    return { bits, tags };
  }

  function inboxTaskRowHTML(tk, i) {
    const data = `data-scope="inbox" data-task="${i}"`;
    const { bits, tags } = inboxMeta(tk);
    const check = checkboxHTML(tk.kind === 'priority' ? 'pink' : 'blue', tk.done, `data-action="task" ${data}`, window.TaskFlowUI.checkboxLabel('task', tk.text, t('tabInbox')));
    const meta = bits.length ? `<span class="up-meta">${bits.map((b) => `<span>${esc(b)}</span>`).join('<span class="up-dot">·</span>')}</span>` : '';
    const tagsHTML = tags.length ? `<span class="task-tags">${tags.map((tg) => `<span class="tag-chip" data-tag="${esc(tg)}">#${esc(tg)}</span>`).join('')}</span>` : '';
    // data-testid="inbox-task-row" — hook ổn định cho e2e (Phase D: inbox flow test)
    return `<div class="inbox-task-row${tk.done ? ' done' : ''}${tk.kind === 'priority' ? ' prio' : ''}" data-testid="inbox-task-row">
    ${check}
    <span class="inbox-main" data-action="task-detail" ${data}
      aria-label="${t('taskDetail')}: ${esc(tk.text || '')}">
      <span class="inbox-text editable" contenteditable="true" spellcheck="false" data-singleline="1"
        data-role="inbox-text" ${data} data-placeholder="${t('taskPh')}"
        aria-label="${t('taskAria', { n: i + 1 })}">${esc(tk.text ?? '')}</span>
      ${meta}
      ${tagsHTML}
    </span>
    <span class="inbox-actions">
      <button type="button" class="inbox-more" data-action="task-detail" ${data}
        title="${t('taskDetail')}" aria-label="${t('taskDetail')}">⋯</button>
      <button type="button" class="inbox-sched-today" data-action="inbox-today" data-task="${i}"
        title="${t('inboxTodayAria')}" aria-label="${t('inboxTodayAria')}">${t('inboxScheduleToday')}</button>
      <button type="button" class="btn-del" data-action="inbox-del" data-task="${i}"
        title="${t('inboxDeleteAria')}" aria-label="${t('inboxDeleteAria')}">${window.TaskFlowUI.icon('trash')}</button>
    </span>
  </div>`;
  }

  function renderInbox(inbox) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('view-inbox');
    if (!el) return;
    const list = inbox.map((tk, i) => inboxTaskRowHTML(tk, i)).join('');
    const empty = inbox.length ? '' : emptyStateHTML('📥', 'inboxEmpty', 'inboxEmptySub', [
      // attrs → data-testid="inbox-add" — hook e2e ổn định cho CTA empty state (Phase D)
      { label: t('emptyAddInbox'), action: 'inbox-add', attrs: 'data-testid="inbox-add"' },
    ]);
    el.innerHTML = `<div class="upcoming-page">
    <header class="upcoming-header">
      <div>
        <p class="upcoming-eyebrow">${t('inboxEyebrow')}</p>
        <h1 class="upcoming-title">${t('inboxTitle')}</h1>
        <p class="upcoming-subtitle">${t('inboxSubtitle')}</p>
      </div>
    </header>
    ${inbox.length ? `<div class="inbox-list" role="list">${list}</div>` : ''}
    ${empty}
    ${inbox.length ? `<button type="button" class="btn-add-today" data-action="inbox-add" data-testid="inbox-add" aria-label="${t('inboxAddTask')}">${window.TaskFlowUI.icon('plus')}<span>${t('inboxAddTask')}</span></button>` : ''}
  </div>`;
  }

  // Ngày dt → (y, m, week, day) trong lưới tháng — khớp cách view Lịch hiển thị (Thứ 2 = 0).
  function inboxTargetForDate(dt) {
    const inCur = Math.floor((dt - PLAN_START) / 86400000);
    if (inCur >= 0 && inCur < NUM_WEEKS * 7) {
      return { y: PLAN_YEAR, m: PLAN_MONTH, week: Math.floor(inCur / 7) + 1, day: inCur % 7 };
    }
    const y = dt.getFullYear(), m = dt.getMonth();
    const first = new Date(y, m, 1);
    const dow = (first.getDay() + 6) % 7; // Thứ 2 = 0
    const start = new Date(first.getTime() - dow * 86400000);
    const dayIdx = Math.floor((dt - start) / 86400000);
    if (dayIdx < 0) return null;
    return { y, m, week: Math.floor(dayIdx / 7) + 1, day: dayIdx % 7 };
  }

  // Chuyển task inbox vào ngày cụ thể — GIỮ uid (carry-over/repeat theo dõi đúng task).
  function scheduleInboxTask(inbox, i, dt) {
    const tk = inbox[i];
    if (!tk) return false;
    const moved = { ...tk, inbox: false, remind: (tk.remind && tk.remind.enabled) ? tk.remind : { enabled: false, time: '20:00' } };
    if (!pushTaskToDate(moved, dt)) return false;
    inbox.splice(i, 1);
    saveInbox(inbox);
    return true;
  }

  function addInboxTask(inbox) {
    inbox.push({ uid: newTaskUid(), kind: 'regular', done: false, text: '', tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' }, inbox: true });
    saveInbox(inbox);
    renderInbox(inbox);
    trackEvent('create_task', { scope: 'inbox' });
    // Focus ô text mới để gõ ngay
    const fresh = document.querySelector('[data-role="inbox-text"][data-task="' + (inbox.length - 1) + '"]');
    if (fresh) fresh.focus();
  }

  // Dispatch action Inbox (gọi từ app.js khi act ∈ inbox-*). Trả về true nếu đã xử lý.
  function handleInboxAction(act, el, inbox) {
    if (act === 'inbox-add') { addInboxTask(inbox); return true; }
    if (act === 'inbox-del') {
      const i = +el.dataset.task;
      if (inbox[i]) {
        pushUndo(); // snapshot TRƯỚC khi xóa (inbox đã nằm trong snapshotAll) → Undo khôi phục
        inbox.splice(i, 1);
        saveInbox(inbox);
        renderInbox(inbox);
        trackEvent('delete_task', { scope: 'inbox' });
        TaskFlowUI.toast(t('taskDeletedToast'), 'info', 6000, [
          { label: t('undoBtnShort'), onClick: () => doUndo() },
        ]);
      }
      return true;
    }
    if (act === 'inbox-today' || act === 'inbox-tomorrow') {
      const i = +el.dataset.task;
      const d = new Date();
      const dt = act === 'inbox-today'
        ? new Date(d.getFullYear(), d.getMonth(), d.getDate())
        : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      const ok = scheduleInboxTask(inbox, i, dt);
      if (ok) {
        closeTaskDetail();
        renderInbox(inbox);
        TaskFlowUI.toast(t('inboxScheduleToast'), 'success');
        trackEvent('schedule_task', { scope: 'inbox', target: act === 'inbox-today' ? 'today' : 'tomorrow' });
      } else TaskFlowUI.toast(t('inboxScheduleError'), 'error');
      return true;
    }
    if (act === 'inbox-date-schedule') {
      const i = +el.dataset.task;
      const inp = document.querySelector('#taskDrawer [data-role="inbox-date"]');
      const v = inp && inp.value;
      if (v) {
        const parts = v.split('-').map(Number);
        const ok = scheduleInboxTask(inbox, i, new Date(parts[0], parts[1] - 1, parts[2]));
        if (ok) {
          closeTaskDetail();
          renderInbox(inbox);
          TaskFlowUI.toast(t('inboxScheduleToast'), 'success');
          trackEvent('schedule_task', { scope: 'inbox', target: 'date' });
        } else TaskFlowUI.toast(t('inboxScheduleError'), 'error');
      }
      return true;
    }
    return false;
  }

  return {
    INBOX_KEY, loadInbox, saveInbox, inboxMeta, inboxTaskRowHTML,
    renderInbox, inboxTargetForDate, scheduleInboxTask, addInboxTask, handleInboxAction,
  };
});
