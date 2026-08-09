// TaskFlow — Tìm kiếm xuyên tháng (tách từ app.js trong P11 refactor, extraction 22).
// Gồm: openSearchModal/closeSearchModal (mở/đóng dialog search), runSearch (quét chéo
// 12 tháng + năm + inbox), renderSearchResults (nhóm kết quả theo tháng/năm/inbox),
// goSearchResult (mở view tương ứng — tháng/tuần/năm/inbox).
// Module phụ thuộc state app-level (state/yearState/inbox/monthStateRaw/PLAN_YEAR) và
// helper (TaskFlowUI/emptyStateHTML/t/esc/openMonth/openYear/setView) — resolve qua
// global scope tại thời điểm GỌI (pattern inbox.js/chat.js): browser app.js load sau
// search.js nhưng mọi hàm chỉ chạy sau boot; Node: textual test only.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowSearch = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function openSearchModal() {
    const m = document.getElementById('searchModal');
    if (!m) return;
    const inp = document.getElementById('searchInput');
    if (inp) inp.value = '';
    renderSearchResults('');
    TaskFlowUI.openDialog('searchModal');
  }

  function closeSearchModal() {
    TaskFlowUI.closeDialog('searchModal');
  }

  // Tìm kiếm xuyên tháng: đọc chéo 12 tháng qua monthStateRaw() + yearState.
  // LƯU Ý state-shape: tháng đang xem dùng biến `state` in-memory của app.js — có
  // `weeks` ở TOP-LEVEL (state.weeks), KHÔNG phải state.months[mk].weeks. Nếu sau này
  // đổi shape state, module này phải sync. (Hành vi giữ nguyên từ app.js, không đổi.)
  function runSearch(q) {
    q = (q || '').trim().toLowerCase();
    if (q.length < 2) return [];
    const hits = [];
    const y = PLAN_YEAR;
    const now = new Date();
    // m = -1 đánh dấu kết quả thuộc năm (goSearchResult mở view Năm khi m < 0)
    // needles: danh sách chuỗi cần kiểm tra (mặc định là [text]) — task tìm thêm tags + subtasks.
    const push = (m, type, text, week, day, needles) => {
      const list = (needles && needles.length ? needles : [text]).filter(Boolean);
      const match = list.find((s) => String(s).toLowerCase().includes(q));
      // text rỗng (vd task chỉ khớp qua tag) → hiển thị chuỗi khớp để dòng kết quả không trống.
      if (match) hits.push({ y, m, type, text: String(text || match), week, day });
    };
    // Các chuỗi cần tìm của task: tên + tags + subtasks.
    const taskNeedles = (tk) => [
      tk.text,
      ...(Array.isArray(tk.tags) ? tk.tags : []),
      ...(Array.isArray(tk.subtasks) ? tk.subtasks.map((s) => s && s.text) : []),
    ];
    for (let m = 0; m < 12; m++) {
      const s = (y === now.getFullYear() && m === now.getMonth()) ? state : monthStateRaw(y, m);
      if (!s) continue;
      (s.monthlyGoals || []).forEach((g) => push(m, 'goal', g.text));
      (s.habits || []).forEach((h) => push(m, 'habit', h.name));
      (s.weeks || []).forEach((w) => {
        (w.days || []).forEach((d, di) => {
          (d.tasks || []).forEach((tk) => push(m, 'task', tk.text, w.n, di, taskNeedles(tk)));
          push(m, 'note', d.note, w.n, di);
          push(m, 'note', d.sticky, w.n, di);
        });
      });
      if (s.reflections) {
        (s.reflections.overview || []).forEach((r) => push(m, 'reflect', r));
        (s.reflections.weeks || []).forEach((w) => w.forEach((r) => push(m, 'reflect', r)));
      }
    }
    (yearState.goals || []).forEach((g) => push(-1, 'ygoal', g.text));
    (yearState.monthNotes || []).forEach((n, mi) => push(-1, 'ynote', n, null, mi));
    // Inbox (planner-inbox): tìm tên task + tags — m = -2 để goSearchResult mở view Inbox.
    (Array.isArray(inbox) ? inbox : []).forEach((tk) => {
      if (!tk) return;
      push(-2, 'inbox', tk.text, undefined, undefined, [tk.text, ...(Array.isArray(tk.tags) ? tk.tags : [])]);
    });
    return hits;
  }

  function renderSearchResults(q) {
    const box = document.getElementById('searchResults');
    if (!box) return;
    q = (q || '').trim();
    if (q.length < 2) {
      box.innerHTML = emptyStateHTML('🔍', 'searchEmpty', 'searchEmptySub');
      return;
    }
    const hits = runSearch(q);
    if (!hits.length) {
      box.innerHTML = emptyStateHTML('🐥', 'searchNoResults', 'searchNoResultsSub');
      return;
    }
    const typeIcon = { goal: '🎯', habit: '🐥', task: '✅', note: '📝', reflect: '💭', ygoal: '🎯', ynote: '📝', inbox: '📥' };
    const typeLbl = { goal: 'goal', habit: 'habit', task: 'task', note: 'note', reflect: 'reflect', ygoal: 'goal', ynote: 'note', inbox: 'inbox' };
    // Nhóm theo tháng
    const groups = new Map();
    hits.forEach((h) => {
      const key = h.m >= 0 ? 'm' + h.m : (h.m === -2 ? 'i' : 'y');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(h);
    });
    const order = ['i', 'm0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'y'];
    const months = Array.from(groups.keys()).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    box.innerHTML = months.map((key) => {
      const items = groups.get(key);
      const label = key === 'y' ? t('searchYear', { y: PLAN_YEAR }) : (key === 'i' ? t('searchInbox') : t('searchMonth', { n: (+key.slice(1)) + 1 }));
      return `<div class="search-group">
      <div class="search-group-h">${label} <small>${items.length}</small></div>
      ${items.map((h) => `<button type="button" class="search-hit" data-action="search-go" data-y="${h.y}" data-m="${h.m}" data-week="${h.week ?? ''}" data-day="${h.day ?? ''}">
        <span class="search-hit-icon" aria-hidden="true">${typeIcon[h.type] || '📌'}</span>
        <span class="search-hit-body"><span class="search-hit-type">${t('search' + typeLbl[h.type][0].toUpperCase() + typeLbl[h.type].slice(1))}</span>
        <span class="search-hit-text">${esc(h.text)}</span></span>
      </button>`).join('')}
    </div>`;
    }).join('');
  }

  function goSearchResult(btn) {
    const y = +btn.dataset.y, m = +btn.dataset.m;
    closeSearchModal();
    if (m === -2) { setView('inbox'); return; }
    if (m < 0) { openYear(y - PLAN_YEAR); setView('year'); return; }
    openMonth(m);
    const wk = btn.dataset.week;
    if (wk) setView('week', +wk);
    else setView('overview');
  }

  return { openSearchModal, closeSearchModal, runSearch, renderSearchResults, goSearchResult };
});
