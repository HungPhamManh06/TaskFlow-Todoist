/* ============================================================
   TaskFlow-Todoist — Google Calendar UI (V1.6A, read-only)
   ------------------------------------------------------------
   window.TaskFlowGCalUI: HTML cho section "Sự kiện Google" trong
   Schedule view + trạng thái kết nối. Fetch/xử lý qua TaskFlowGCal;
   app.js orchestrate (render sau khi fetch xong).
   Không đổi giao diện Today/week; không đụng sync global.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowGCalUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const G = () => (typeof window !== 'undefined' ? window.TaskFlowGCal : null);
  const I18N = () => (typeof window !== 'undefined' ? window.TaskFlowI18N : null);
  const t = (key, vars) => (I18N() && I18N().t ? I18N().t(key, vars) : key);
  const icon = (name) => (window.TaskFlowUI && window.TaskFlowUI.icon ? window.TaskFlowUI.icon(name) : '');
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Trạng thái kết nối lưu trong bộ nhớ (không persist consent).
  const uiState = { connected: false, calendars: [], lastError: null, statusLoaded: false, loading: false };

  function getState() { return uiState; }

  // Fetch trạng thái từ server (gọi 1 lần / khi cần). Trả state.
  async function ensureStatus(force) {
    const g = G();
    if (!g) return uiState;
    if (uiState.loading) return uiState;
    if (uiState.statusLoaded && !force) return uiState;
    uiState.loading = true;
    try {
      const res = await g.fetchStatus();
      if (res.ok && res.data) {
        uiState.connected = !!res.data.connected;
        uiState.calendars = Array.isArray(res.data.calendars) ? res.data.calendars : [];
        uiState.lastError = null;
      } else if (res.status === 0) {
        uiState.lastError = 'network';
      } else {
        uiState.connected = false;
        uiState.calendars = [];
      }
      uiState.statusLoaded = true;
    } finally {
      uiState.loading = false;
    }
    return uiState;
  }

  // Fetch events cho tháng (monthStart..monthEnd, ISO) → cache. Trả {ok, count, errors}.
  async function refreshEvents(monthStart, monthEnd) {
    const g = G();
    if (!g) return { ok: false, count: 0, errors: [] };
    const res = await g.fetchEvents(monthStart + 'T00:00:00Z', monthEnd + 'T23:59:59Z');
    if (res.ok) {
      g.saveCache(res.events, res.fetchedAt);
      return { ok: true, count: res.events.length, errors: res.errors || [] };
    }
    if (res.status === 410) uiState.connected = false;
    return { ok: false, count: 0, errors: res.errors || [] };
  }

  function eventsHTML(dateIso) {
    const g = G();
    const cache = g ? g.loadCache() : { events: [] };
    const evs = g ? g.eventsForDate(cache.events, dateIso) : [];
    if (!evs.length) return `<p class="gcal-empty">${esc(t('gcalNoEvents'))}</p>`;
    const rows = evs
      .slice()
      .sort((a, b) => (a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : a.startMs - b.startMs))
      .map((e) => {
        const time = e.allDay
          ? `<span class="gcal-event-time all-day">${esc(t('gcalAllDay'))}</span>`
          : `<span class="gcal-event-time">${esc(g.toLocalHHMM(e.startMs))}–${esc(g.toLocalHHMM(e.endMs))}</span>`;
        return `<li class="gcal-event${e.allDay ? ' all-day' : ''}">${time}<span class="gcal-event-summary">${esc(e.summary)}</span></li>`;
      })
      .join('');
    return `<ul class="gcal-list">${rows}</ul>`;
  }

  /* ============ V1.6B — Export TimeBlock → Google Calendar ============ */

  // Action slot cho 1 TimeBlock trong timeline (.tb-block-actions). Đã export →
  // badge calendar-check (không phải button — không tạo event lặp); chưa export →
  // nút "Add to Google Calendar". taskText: tiêu đề sự kiện (app.js resolve).
  function exportActionsHTML(block, taskText) {
    const g = G();
    if (!g || !block || !block.id) return '';
    const mapping = g.mappingForBlock(block.id);
    if (mapping) {
      return `<span class="gcal-exported" data-exported="${esc(block.id)}" role="img" aria-label="${esc(t('gcalExported'))}" title="${esc(t('gcalExported'))}">${icon('calendar-check')}</span>`;
    }
    const label = taskText && String(taskText).trim()
      ? t('gcalExportFor', { t: String(taskText).slice(0, 40) })
      : t('gcalExport');
    return `<button type="button" class="tb-act gcal-export" data-action="gcal-export" data-id="${esc(block.id)}" aria-label="${esc(label)}" title="${esc(t('gcalExport'))}">${icon('calendar')}</button>`;
  }

  // HTML toàn section cho Schedule view của 1 ngày.
  function scheduleSectionHTML({ dateIso, monthStart, monthEnd }) {
    const g = G();
    if (!g) return '';
    const cache = g.loadCache();
    const stale = !g.cacheValid(cache, g.TTL_MS);

    let body;
    let actions;
    if (!uiState.connected) {
      body = `<p class="gcal-connect-note">${esc(t('gcalConnectNote'))}</p>`;
      actions = `<button type="button" class="pop-btn" data-action="gcal-connect" aria-label="${esc(t('gcalConnect'))}">${icon('calendar')}<span>${esc(t('gcalConnect'))}</span></button>`;
    } else {
      const synced = cache.fetchedAt
        ? t('gcalSyncedAt', { t: new Date(cache.fetchedAt).toLocaleTimeString(t('locale') || 'vi-VN', { hour: '2-digit', minute: '2-digit' }) })
        : t('gcalNotSynced');
      const calCount = uiState.calendars.length ? t('gcalCalCount', { n: uiState.calendars.length }) : '';
      body = `${eventsHTML(dateIso)}
        <p class="gcal-synced">${esc([synced, calCount].filter(Boolean).join(' · '))}${stale ? ' · ' + esc(t('gcalStale')) : ''}</p>`;
      actions = `<span class="gcal-actions">
        <button type="button" class="pop-btn" data-action="gcal-refresh" aria-label="${esc(t('gcalRefresh'))}" title="${esc(t('gcalRefresh'))}">${icon('redo')}<span>${esc(t('gcalRefresh'))}</span></button>
        <button type="button" class="pop-btn danger" data-action="gcal-disconnect" aria-label="${esc(t('gcalDisconnect'))}" title="${esc(t('gcalDisconnect'))}">${esc(t('gcalDisconnect'))}</button>
      </span>`;
    }

    return `<section class="gcal-section" data-testid="gcal-section" aria-label="${esc(t('gcalTitle'))}">
      <div class="gcal-head">
        <h3 class="gcal-title">${icon('calendar')} ${esc(t('gcalTitle'))}</h3>
        ${uiState.connected ? `<span class="gcal-badge">${esc(t('gcalConnected'))}</span>` : ''}
      </div>
      ${body}
      <div class="gcal-foot">${actions}</div>
    </section>`;
  }

  // Sau khi render: nếu connected + cache stale → refresh rồi gọi onChange để render lại.
  // force=true: luôn refresh (nút làm mới thủ công).
  async function afterRender({ dateIso, monthStart, monthEnd, onChange, force }) {
    const g = G();
    if (!g) return;
    await ensureStatus(false);
    if (!uiState.connected) {
      if (onChange) onChange();
      return;
    }
    const cache = g.loadCache();
    if (force || !g.cacheValid(cache, g.TTL_MS)) {
      await refreshEvents(monthStart, monthEnd);
    }
    if (onChange) onChange();
  }

  return {
    getState, ensureStatus, refreshEvents, scheduleSectionHTML, afterRender,
    eventsHTML, exportActionsHTML,
  };
});
