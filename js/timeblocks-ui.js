// TaskFlow — Time Blocking UI (V1.2 Phase 2).
// UI thuần cho TimeBlocks: Schedule view (timeline theo ngày), dialog add/edit block,
// danh sách block trong Task Detail, nút Focus từ block. KHÔNG sở hữu state — nhận
// store/state/inbox qua tham số; app.js orchestrate (mode calendar, dispatcher, save).
// Pattern projects-ui.js: dùng window.TaskFlowI18N.t, window.TaskFlowUI.icon/esc,
// window.TaskFlowTimeBlocks cho logic. Module an toàn khi require (test) và qua script tag.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowTimeBlocksUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function t(key, vars) {
    return (window.TaskFlowI18N && window.TaskFlowI18N.t) ? window.TaskFlowI18N.t(key, vars) : (key || '');
  }
  function esc(value) {
    return (window.TaskFlowUI && window.TaskFlowUI.esc) ? window.TaskFlowUI.esc(value) : String(value == null ? '' : value);
  }
  function icon(name) {
    return (window.TaskFlowUI && window.TaskFlowUI.icon) ? window.TaskFlowUI.icon(name) : '';
  }
  function TB() {
    return (window.TaskFlowTimeBlocks) ? window.TaskFlowTimeBlocks : null;
  }

  // ISO local date 'YYYY-MM-DD' (không dùng toISOString — lệch UTC).
  function iso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  // Thứ 2 của tuần chứa ngày (tuần Mon–Sun như lưới tháng).
  function mondayOf(dateObj) {
    const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return d;
  }

  function fmtTimeRange(start, end) {
    return `${start}–${end}`;
  }

  // Thứ tự block theo giờ bắt đầu (ổn định cho mọi render).
  function sortedBlocks(store, date) {
    const tb = TB();
    if (!tb) return [];
    const blocks = tb.blocksForDate(store, date).slice();
    blocks.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    return blocks;
  }

  // Tìm text task theo uid (month state + inbox) — hiển thị trên block.
  // Trả '' nếu task không tồn tại (task đã bị xóa).
  function taskTextFor(uid, state, inbox) {
    if (!uid) return '';
    if (Array.isArray(inbox)) {
      const tk = inbox.find((x) => x && x.uid === uid);
      if (tk) return String(tk.text || '');
    }
    if (state && Array.isArray(state.weeks)) {
      for (const w of state.weeks) {
        if (!w || !Array.isArray(w.days)) continue;
        for (const d of w.days) {
          if (!d || !Array.isArray(d.tasks)) continue;
          const tk = d.tasks.find((x) => x && x.uid === uid);
          if (tk) return String(tk.text || '');
        }
      }
    }
    return '';
  }

  // Ref cho openFocusMode từ uid (scope inbox / month). Trả null nếu task không tồn tại.
  function focusRefForUid(uid, state, inbox) {
    const tb = TB();
    if (!tb || !uid) return null;
    const ref = tb.resolveTaskRef(uid, state, inbox);
    if (!ref) return null;
    if (ref.scope === 'inbox') return { scope: 'inbox', task: ref.index };
    return { week: ref.week, day: ref.day, task: ref.task };
  }

  // Ngày (YYYY-MM-DD) → { week, day } trong month state theo planStart (thứ 2 của tuần 1).
  function weekDayForDate(dateIso, planStart) {
    const d = parseISO(dateIso);
    if (!d || !planStart) return null;
    const start = new Date(planStart.getFullYear(), planStart.getMonth(), planStart.getDate());
    const diff = Math.round((d - start) / 86400000);
    if (diff < 0) return null;
    return { week: Math.floor(diff / 7) + 1, day: diff % 7 };
  }

  // Tasks của 1 ngày (month state) — để chọn task khi tạo block từ Schedule view.
  function tasksForDate(state, planStart, dateIso) {
    const wd = weekDayForDate(dateIso, planStart);
    if (!wd || !state || !Array.isArray(state.weeks)) return [];
    const w = state.weeks[wd.week - 1];
    const d = w && w.days && w.days[wd.day];
    return (d && Array.isArray(d.tasks)) ? d.tasks.filter((x) => x && x.uid) : [];
  }

  /* ---------------- Schedule view ---------------- */

  // Dải 7 ngày trong tuần chứa selected — click chọn ngày.
  function dayStripHTML(selectedIso, todayIso, monthStart, monthEnd) {
    const sel = parseISO(selectedIso) || new Date();
    const mon = mondayOf(sel);
    const shortDays = t('dayNamesShort') || t('dayNames');
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
      const dIso = iso(d);
      const inMonth = dIso >= monthStart && dIso <= monthEnd;
      const isSel = dIso === selectedIso;
      const isToday = dIso === todayIso;
      const wd = (d.getDay() + 6) % 7;
      const label = (Array.isArray(shortDays) ? shortDays[wd] : shortDays) || '';
      cells.push(`<button type="button" class="tb-day${isSel ? ' selected' : ''}${isToday ? ' today' : ''}${inMonth ? '' : ' muted'}"
        data-action="tb-day" data-date="${dIso}" aria-pressed="${isSel ? 'true' : 'false'}"
        aria-label="${esc(label)} ${d.getDate()}/${d.getMonth() + 1}${isToday ? ' · ' + t('tbToday') : ''}">
        <span class="tb-day-wd">${esc(label)}</span><span class="tb-day-n">${d.getDate()}</span>
      </button>`);
    }
    return `<div class="tb-daystrip" role="group" aria-label="${esc(t('schedulePageTitle'))}">${cells.join('')}</div>`;
  }

  // 1 block trong timeline (absolute theo phút). Actions: edit (click row), focus, status, delete.
  function blockRowHTML(block, state, inbox) {
    const tb = TB();
    const text = taskTextFor(block.taskUid, state, inbox);
    const missing = block.taskUid && !text;
    const PXM = 1.2;
    const startMin = tb ? tb.toMinutes(block.start) : 0;
    const endMin = tb ? tb.toMinutes(block.end) : 0;
    const top = (startMin || 0) * PXM;
    const height = Math.max(((endMin || 0) - (startMin || 0)) * PXM, 28);
    const statusLabel = t('tbStatus' + (block.status === 'completed' ? 'Completed' : block.status === 'cancelled' ? 'Cancelled' : 'Planned'));
    const statusCls = 'tb-status-' + (block.status === 'completed' ? 'completed' : block.status === 'cancelled' ? 'cancelled' : 'planned');
    const done = block.status === 'completed';
    return `<div class="tb-block ${statusCls}${missing ? ' missing' : ''}" style="top:${top}px;height:${height}px" data-block-id="${esc(block.id)}" role="group" aria-label="${esc(fmtTimeRange(block.start, block.end))}${text ? ' · ' + esc(text) : ''} · ${esc(statusLabel)}">
      <button type="button" class="tb-block-main" data-action="tb-edit" data-id="${esc(block.id)}" aria-label="${esc(t('tbEditBlock'))}: ${esc(fmtTimeRange(block.start, block.end))}${text ? ' · ' + esc(text) : ''}">
        <span class="tb-block-time">${esc(block.start)}–${esc(block.end)}</span>
        <span class="tb-block-text">${missing ? esc(t('tbTaskMissing')) : esc(text || t('tbNoTask'))}</span>
        <span class="tb-block-status">${esc(statusLabel)}</span>
      </button>
      <span class="tb-block-actions">
        ${block.taskUid ? `<button type="button" class="tb-act" data-action="tb-focus" data-id="${esc(block.id)}" aria-label="${esc(t('tbFocusStart'))}${text ? ': ' + esc(text) : ''}" title="${esc(t('tbFocusStart'))}">${icon('focus')}</button>` : ''}
        <button type="button" class="tb-act" data-action="tb-status" data-id="${esc(block.id)}" aria-label="${done ? esc(t('tbReopen')) : esc(t('tbMarkDone'))}" title="${done ? esc(t('tbReopen')) : esc(t('tbMarkDone'))}">${icon(done ? 'redo' : 'check')}</button>
        <button type="button" class="tb-act danger" data-action="tb-del" data-id="${esc(block.id)}" aria-label="${esc(t('tbDelete'))}" title="${esc(t('tbDelete'))}">${icon('trash')}</button>
      </span>
    </div>`;
  }

  // Timeline dọc 00:00–23:59 + blocks của ngày.
  function timelineHTML(store, date, state, inbox) {
    const blocks = sortedBlocks(store, date);
    const PXM = 1.2;
    const HOURS = 24;
    let grid = '';
    for (let h = 0; h < HOURS; h++) {
      const top = h * 60 * PXM;
      const label = String(h).padStart(2, '0') + ':00';
      grid += `<div class="tb-hour" style="top:${top}px" aria-hidden="true"><span>${label}</span></div>`;
    }
    const body = blocks.length
      ? blocks.map((b) => blockRowHTML(b, state, inbox)).join('')
      : `<div class="tb-empty">${esc(t('tbNoBlocks'))}</div>`;
    const overlaps = detectOverlaps(store, date);
    return `<div class="tb-timeline-wrap">
      ${overlaps ? `<p class="tb-overlap-note" role="status">${icon('bell')}<span>${esc(t('tbOverlapNote'))}</span></p>` : ''}
      <div class="tb-timeline" style="height:${HOURS * 60 * PXM}px" data-testid="tb-timeline">
        ${grid}${body}
      </div>
    </div>`;
  }

  // Phát hiện overlap giữa các block cùng ngày (không tính cancelled). Trả text mô tả / ''.
  function detectOverlaps(store, date) {
    const tb = TB();
    if (!tb || !store || !Array.isArray(store.blocks)) return '';
    const blocks = store.blocks.filter((b) => b && b.date === date && b.status !== 'cancelled');
    const parts = [];
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i], b = blocks[j];
        const as = tb.toMinutes(a.start), ae = tb.toMinutes(a.end);
        const bs = tb.toMinutes(b.start), be = tb.toMinutes(b.end);
        if (as === null || ae === null || bs === null || be === null) continue;
        if (as < be && bs < ae) parts.push(`${a.start}–${a.end} / ${b.start}–${b.end}`);
      }
    }
    return parts.length ? parts.join(', ') : '';
  }

  // Toàn bộ Schedule view cho 1 ngày (được render trong view-calendar khi mode=schedule).
  function scheduleViewHTML({ store, date, state, inbox, planStart, todayIso, monthStart, monthEnd }) {
    const selIso = iso(parseISO(date) || new Date());
    const d = parseISO(selIso);
    const weekday = d.toLocaleDateString(t('locale') || 'vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });
    const prevIso = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
    const nextIso = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
    return `<div class="tb-schedule" data-testid="schedule-view">
      <div class="tb-nav">
        <button type="button" class="tb-nav-btn" data-action="tb-prev" aria-label="${esc(t('tbPrevDay'))}" title="${esc(t('tbPrevDay'))}">${icon('chevron-left')}</button>
        <span class="tb-nav-date">${esc(weekday)}</span>
        <button type="button" class="tb-nav-btn" data-action="tb-next" aria-label="${esc(t('tbNextDay'))}" title="${esc(t('tbNextDay'))}">${icon('chevron-right')}</button>
        <button type="button" class="pop-btn" data-action="tb-today">${esc(t('tbToday'))}</button>
      </div>
      ${dayStripHTML(selIso, todayIso, monthStart, monthEnd)}
      <div class="tb-toolbar">
        <button type="button" class="button button-primary" data-action="tb-add" data-date="${selIso}">${icon('plus')}<span>${esc(t('tbAddBlock'))}</span></button>
        <span class="tb-prevnext">
          <button type="button" class="pop-btn" data-action="tb-prev">${icon('chevron-left')}<span>${esc(t('tbPrevDay'))}</span></button>
          <button type="button" class="pop-btn" data-action="tb-next"><span>${esc(t('tbNextDay'))}</span>${icon('chevron-right')}</button>
        </span>
      </div>
      ${timelineHTML(store, selIso, state, inbox)}
    </div>`;
  }

  /* ---------------- Block dialog (add/edit) ---------------- */

  // Options task cho dialog: "No task" + tasks ngày đó (month) + inbox.
  function taskOptionsHTML(state, inbox, planStart, dateIso, selectedUid) {
    const opts = [`<option value="">${esc(t('tbNoTask'))}</option>`];
    const push = (tk, suffix) => {
      if (!tk || !tk.uid) return;
      const text = String(tk.text || '').trim();
      if (!text) return;
      const sel = tk.uid === selectedUid ? ' selected' : '';
      opts.push(`<option value="${esc(tk.uid)}"${sel}>${esc(text.length > 40 ? text.slice(0, 40) + '…' : text)}${suffix ? ' (' + esc(suffix) + ')' : ''}</option>`);
    };
    tasksForDate(state, planStart, dateIso).forEach((tk) => push(tk, ''));
    (Array.isArray(inbox) ? inbox : []).forEach((tk) => push(tk, t('tabInbox')));
    if (selectedUid && !opts.some((o) => o.indexOf(`value="${esc(selectedUid)}"`) !== -1)) {
      opts.push(`<option value="${esc(selectedUid)}" selected>${esc(t('tbTaskMissing'))}</option>`);
    }
    return opts.join('');
  }

  function blockDialogHTML({ block, date, state, inbox, planStart }) {
    const b = block || {};
    const selIso = b.date || date || '';
    const statusOpts = ['planned', 'completed', 'cancelled'].map((s) =>
      `<option value="${s}" ${b.status === s ? 'selected' : ''}>${esc(t('tbStatus' + (s === 'planned' ? 'Planned' : s === 'completed' ? 'Completed' : 'Cancelled')))}</option>`).join('');
    return `<div class="tb-dialog-form">
      <label class="td-field">
        <span class="td-field-label">${esc(t('tbTask'))}</span>
        <select data-role="tb-task" aria-label="${esc(t('tbTask'))}">${taskOptionsHTML(state, inbox, planStart, selIso, b.taskUid || '')}</select>
      </label>
      <label class="td-field">
        <span class="td-field-label">${esc(t('tbDate'))}</span>
        <input type="date" data-role="tb-date" value="${esc(selIso)}" aria-label="${esc(t('tbDate'))}">
      </label>
      <div class="tb-dialog-times">
        <label class="td-field">
          <span class="td-field-label">${esc(t('tbStart'))}</span>
          <input type="time" data-role="tb-start" value="${esc(b.start || '09:00')}" aria-label="${esc(t('tbStart'))}">
        </label>
        <label class="td-field">
          <span class="td-field-label">${esc(t('tbEnd'))}</span>
          <input type="time" data-role="tb-end" value="${esc(b.end || '10:00')}" aria-label="${esc(t('tbEnd'))}">
        </label>
      </div>
      <label class="td-field">
        <span class="td-field-label">${esc(t('tbStatus'))}</span>
        <select data-role="tb-status" aria-label="${esc(t('tbStatus'))}">${statusOpts}</select>
      </label>
      <p class="tb-dialog-warn" data-role="tb-warn" hidden></p>
    </div>`;
  }

  // Đọc form dialog → { taskUid, date, start, end, status }.
  function readBlockDialog(root) {
    const q = (sel) => root && root.querySelector(sel);
    return {
      taskUid: (q('[data-role="tb-task"]') || {}).value || null,
      date: (q('[data-role="tb-date"]') || {}).value || '',
      start: (q('[data-role="tb-start"]') || {}).value || '',
      end: (q('[data-role="tb-end"]') || {}).value || '',
      status: (q('[data-role="tb-status"]') || {}).value || 'planned',
    };
  }

  /* ---------------- Task Detail: Schedule section ---------------- */

  // Danh sách block của 1 task (Task Detail drawer) — các ngày, sắp theo date+start.
  function taskDetailBlocksHTML(store, taskUid) {
    const tb = TB();
    const blocks = tb ? tb.blocksForTask(store, taskUid).slice() : [];
    blocks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.start < b.start ? -1 : 1));
    const rows = blocks.map((b) => {
      const statusLabel = t('tbStatus' + (b.status === 'completed' ? 'Completed' : b.status === 'cancelled' ? 'Cancelled' : 'Planned'));
      const done = b.status === 'completed';
      const d = parseISO(b.date);
      const dateLabel = d ? `${d.getDate()}/${d.getMonth() + 1}` : b.date;
      return `<div class="td-tb-row ${b.status === 'cancelled' ? 'cancelled' : ''}" data-block-id="${esc(b.id)}">
        <span class="td-tb-time">${esc(fmtTimeRange(b.start, b.end))}</span>
        <span class="td-tb-date">${esc(dateLabel)}</span>
        <span class="td-tb-status">${esc(statusLabel)}</span>
        <span class="td-tb-actions">
          <button type="button" class="tb-act" data-action="tb-focus" data-id="${esc(b.id)}" aria-label="${esc(t('tbFocusStart'))}" title="${esc(t('tbFocusStart'))}">${icon('focus')}</button>
          <button type="button" class="tb-act" data-action="tb-status" data-id="${esc(b.id)}" aria-label="${done ? esc(t('tbReopen')) : esc(t('tbMarkDone'))}" title="${done ? esc(t('tbReopen')) : esc(t('tbMarkDone'))}">${icon(done ? 'redo' : 'check')}</button>
          <button type="button" class="tb-act" data-action="tb-edit" data-id="${esc(b.id)}" aria-label="${esc(t('tbEditBlock'))}" title="${esc(t('tbEditBlock'))}">${icon('edit')}</button>
          <button type="button" class="tb-act danger" data-action="tb-del" data-id="${esc(b.id)}" aria-label="${esc(t('tbDelete'))}" title="${esc(t('tbDelete'))}">${icon('trash')}</button>
        </span>
      </div>`;
    }).join('');
    return `<div class="td-field td-blocks-field">
      <span class="td-field-label">${esc(t('taskDetailSchedule'))}</span>
      <div class="td-tb-list" data-testid="td-blocks">${rows || `<p class="td-empty">${esc(t('tbNoBlocks'))}</p>`}</div>
      <span class="td-add-row"><button type="button" class="td-add-btn" data-action="td-tb-add" data-uid="${esc(taskUid || '')}" aria-label="${esc(t('tbAddBlock'))}">${icon('plus')}</button><span class="tb-add-label">${esc(t('tbAddBlock'))}</span></span>
    </div>`;
  }

  return {
    iso, parseISO, mondayOf, weekDayForDate, tasksForDate, taskTextFor, focusRefForUid,
    dayStripHTML, blockRowHTML, timelineHTML, detectOverlaps, scheduleViewHTML,
    taskOptionsHTML, blockDialogHTML, readBlockDialog, taskDetailBlocksHTML,
    fmtTimeRange, sortedBlocks,
  };
});
