// TaskFlow — Smart Daily Planner UI (V1.5). Rule-based, NO AI.
// Đóng vai trò render + đọc lựa chọn của user từ dialog; KHÔNG sở hữu state.
// app.js orchestrate: dispatch action, mở/đóng dialog, lưu sau Apply.
// CRITICAL RULE: không sửa data trước khi user bấm Apply. Preview chỉ là bản xem trước.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowPlannerUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DEFAULT_AVAIL_HOURS = 5; // gợi ý khung giờ rảnh (user có thể sửa)

  // esc + t + icon resolve qua global lexical tại thời điểm GỌI (pattern mood.js/popups.js).
  function esc(v) {
    if (typeof window !== 'undefined' && window.TaskFlowUtil && window.TaskFlowUtil.esc) return window.TaskFlowUtil.esc(v);
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function t(key, vars) {
    if (typeof window !== 'undefined' && window.TaskFlowI18N && window.TaskFlowI18N.t) return window.TaskFlowI18N.t(key, vars);
    return key;
  }
  function icon(name) {
    if (typeof window !== 'undefined' && window.TaskFlowUI && window.TaskFlowUI.icon) return window.TaskFlowUI.icon(name);
    return '';
  }

  // Tên key i18n từ reason lowercase của planner-rules (priority → plannerReasonPriority).
  // Unknown reason → null → UI bỏ qua, KHÔNG bao giờ hiện raw key.
  function reasonKey(r) {
    const KNOWN = ['Overdue', 'Priority', 'Deadline3', 'Deadline7', 'Project', 'Milestone', 'Duration', 'Energy', 'Scheduled', 'Context'];
    const s = String(r || '');
    if (!s) return null;
    const cap = s.charAt(0).toUpperCase() + s.slice(1);
    return KNOWN.includes(cap) ? 'plannerReason' + cap : null;
  }

  // Ngày 'YYYY-MM-DD' hôm nay (local).
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Thứ tự ổn định theo (score desc, uid asc) — trùng với planner-rules để preview khớp.
  function stableRank(tasks) {
    const arr = tasks.slice().sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.uid || '').localeCompare(String(b.uid || ''));
    });
    return arr;
  }

  // ---------- Render dialog content (thuần) ----------

  // input: { proposal } — kết quả từ TaskFlowPlannerRules.buildProposal
  function plannerContentHTML(proposal) {
    if (!proposal) return '<p class="planner-empty">—</p>';
    const p = proposal;
    const overdue = Array.isArray(p.overdue) ? p.overdue : [];
    const top = stableRank(Array.isArray(p.top) ? p.top : []);
    const hasWindows = Array.isArray(p.windows) && p.windows.length > 0;
    const blocks = Array.isArray(p.suggestions) ? p.suggestions : [];

    // Step 1 — review overdue
    let overdueHTML = '';
    if (overdue.length) {
      overdueHTML = '<section class="planner-step" data-planner-step="1" aria-labelledby="plannerStep1Title">'
        + '<h3 class="planner-step-title" id="plannerStep1Title"><span class="planner-step-num">1</span>' + esc(t('plannerStep1Title')) + '</h3>'
        + '<ul class="planner-overdue-list">';
      overdue.forEach((o, i) => {
        overdueHTML += '<li class="planner-overdue-item">'
          + '<div class="planner-overdue-text"><span class="planner-overdue-flag">' + esc(t('plannerOverdue')) + '</span>'
          + esc(o.text || '') + '</div>'
          + '<label class="planner-overdue-opt"><span class="visually-hidden">' + esc(t('plannerReschedule')) + '</span>'
          + '<select data-planner-overdue="' + i + '" class="planner-select">'
          + '<option value="today">' + esc(t('plannerOptToday')) + '</option>'
          + '<option value="tomorrow">' + esc(t('plannerOptTomorrow')) + '</option>'
          + '<option value="this-week">' + esc(t('plannerOptThisWeek')) + '</option>'
          + '<option value="inbox">' + esc(t('plannerOptInbox')) + '</option>'
          + '</select></label></li>';
      });
      overdueHTML += '</ul></section>';
    }

    // Step 2 — choose top 3 (checkbox, mặc định tick top 3)
    let topHTML = '';
    if (top.length) {
      topHTML = '<section class="planner-step" data-planner-step="2" aria-labelledby="plannerStep2Title">'
        + '<h3 class="planner-step-title" id="plannerStep2Title"><span class="planner-step-num">2</span>' + esc(t('plannerStep2Title')) + '</h3>'
        + '<ul class="planner-top-list">';
      top.forEach((task, i) => {
        const checked = i < 3 ? ' checked' : '';
        const dur = task.duration > 0 ? fmtDur(task.duration) : esc(t('plannerNoDur'));
        const reasons = Array.isArray(task.reasons) && task.reasons.length
          ? task.reasons.map((r) => {
            const k = reasonKey(r);
            if (!k) return null;
            const v = t(k);
            return v && v !== k ? v : null;
          }).filter(Boolean).join(' · ') : '';
        topHTML += '<li class="planner-top-item">'
          + '<label class="planner-top-check"><input type="checkbox" data-planner-top="' + i + '"' + checked + '>'
          + '<span class="planner-top-rank">' + (i + 1) + '</span></label>'
          + '<div class="planner-top-body"><span class="planner-top-text">' + esc(task.text || '') + '</span>'
          + '<span class="planner-top-meta">' + dur + (reasons ? ' · ' + reasons : '') + '</span></div>'
          + '<span class="planner-top-score">' + esc(t('plannerScore', { n: task.score })) + '</span></li>';
      });
      topHTML += '</ul></section>';
    }

    // Step 3 — estimate workload
    const availMin = p.availableMinutes != null ? p.availableMinutes : DEFAULT_AVAIL_HOURS * 60;
    const planned = p.plannedMinutes || 0;
    const overloaded = availMin > 0 && planned > availMin;
    const workloadHTML = '<section class="planner-step" data-planner-step="3" aria-labelledby="plannerStep3Title">'
      + '<h3 class="planner-step-title" id="plannerStep3Title"><span class="planner-step-num">3</span>' + esc(t('plannerStep3Title')) + '</h3>'
      + '<div class="planner-workload">'
      + '<div class="planner-wl-row"><span>' + esc(t('plannerPlanned')) + '</span><strong data-planner-planned>' + esc(fmtDur(planned)) + '</strong></div>'
      + '<div class="planner-wl-row"><span>' + esc(t('plannerAvailable')) + '</span>'
      + '<label class="planner-avail"><input type="number" min="0" max="24" step="1" value="' + DEFAULT_AVAIL_HOURS + '" data-planner-avail class="planner-input"> <span>' + esc(t('plannerHours')) + '</span></label></div>'
      + (overloaded
        ? '<p class="planner-warning" role="status">' + esc(t('plannerOverload', { over: fmtDur(planned - availMin), avail: fmtDur(availMin) })) + '</p>'
        : '')
      + '</div></section>';

    // Step 4 — suggest schedule
    let scheduleHTML;
    if (blocks.length) {
      scheduleHTML = '<section class="planner-step" data-planner-step="4" aria-labelledby="plannerStep4Title">'
        + '<h3 class="planner-step-title" id="plannerStep4Title"><span class="planner-step-num">4</span>' + esc(t('plannerStep4Title')) + '</h3>'
        + '<ul class="planner-sched-list">';
      blocks.forEach((b, i) => {
        scheduleHTML += '<li class="planner-sched-item"><span class="planner-sched-time">' + esc(b.start) + '–' + esc(b.end) + '</span>'
          + '<span class="planner-sched-task">' + esc(taskTextFor(b.taskUid, top)) + '</span></li>';
      });
      scheduleHTML += '</ul>'
        + '<p class="planner-hint">' + esc(t('plannerBlocksHint')) + '</p></section>';
    } else if (hasWindows) {
      scheduleHTML = '<section class="planner-step" data-planner-step="4" aria-labelledby="plannerStep4Title">'
        + '<h3 class="planner-step-title" id="plannerStep4Title"><span class="planner-step-num">4</span>' + esc(t('plannerStep4Title')) + '</h3>'
        + '<p class="planner-hint">' + esc(t('plannerNoFit')) + '</p></section>';
    } else {
      scheduleHTML = '<section class="planner-step" data-planner-step="4" aria-labelledby="plannerStep4Title">'
        + '<h3 class="planner-step-title" id="plannerStep4Title"><span class="planner-step-num">4</span>' + esc(t('plannerStep4Title')) + '</h3>'
        + '<p class="planner-hint">' + esc(t('plannerOrderOnly')) + '</p></section>';
    }

    // Step 5 — preview (tổng kết những gì Apply sẽ làm)
    const nBlocks = blocks.length;
    const nOverdue = overdue.length;
    let previewHTML = '<section class="planner-step" data-planner-step="5" aria-labelledby="plannerStep5Title">'
      + '<h3 class="planner-step-title" id="plannerStep5Title"><span class="planner-step-num">5</span>' + esc(t('plannerStep5Title')) + '</h3>'
      + '<ul class="planner-preview-list">'
      + '<li>' + esc(t('plannerPreviewBlocks', { n: nBlocks })) + '</li>'
      + '<li>' + esc(t('plannerPreviewOverdue', { n: nOverdue })) + '</li>'
      + '<li>' + esc(t('plannerPreviewOrder', { n: top.length })) + '</li>'
      + '</ul>'
      + '<p class="planner-note">' + esc(t('plannerApplyNote')) + '</p></section>';

    return overdueHTML + topHTML + workloadHTML + scheduleHTML + previewHTML;
  }

  // Tên task từ uid (để hiện trong gợi ý block). P1.1: KHÔNG bao giờ
  // fallback về uid — dùng nhãn dịch an toàn nếu không tìm thấy.
  function taskTextFor(uid, top) {
    if (!uid || !Array.isArray(top)) return '';
    const hit = top.find((x) => x.uid === uid);
    return hit && hit.text ? hit.text : t('plannerTaskFallback');
  }

  // Thời lượng theo ngôn ngữ (P10): dùng PlannerRules.formatMinutes — 1 nguồn duy nhất.
  function fmtDur(min) {
    const R = (typeof window !== 'undefined' && window.TaskFlowPlannerRules) || null;
    const I18N = (typeof window !== 'undefined' && window.TaskFlowI18N) || null;
    const lang = I18N && typeof I18N.getLang === 'function' ? I18N.getLang() : 'vi';
    if (R && typeof R.formatMinutes === 'function') return R.formatMinutes(min, lang);
    const m = Math.max(0, Math.round(min));
    if (m < 60) return m + (lang === 'vi' ? ' phút' : ' min');
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (!r) return lang === 'vi' ? h + ' giờ' : h + ' h';
    return lang === 'vi' ? h + ' giờ ' + r + ' phút' : h + ' h ' + r + ' min';
  }

  // ---------- Đọc lựa chọn của user từ DOM (chỉ đọc, không sửa state) ----------

  // root = dialog container. Trả về { includeIdx:Set, overdueChoices:{} }
  function readSelections(root) {
    const out = { includeIdx: new Set(), overdueChoices: {} };
    if (!root) return out;
    root.querySelectorAll('[data-planner-top]').forEach((cb) => {
      if (cb.checked) out.includeIdx.add(+cb.dataset.plannerTop);
    });
    root.querySelectorAll('[data-planner-overdue]').forEach((sel) => {
      out.overdueChoices[+sel.dataset.plannerOverdue] = sel.value;
    });
    return out;
  }

  // ---------- Tổng hợp cho Apply (thuần; app.js thực thi mutation) ----------

  // proposal + selections → { blocks:[{taskUid,start,end}], reschedule:[{idx,option}] }
  function buildApplyPlan(proposal, selections) {
    const plan = { blocks: [], reschedule: [] };
    if (!proposal) return plan;
    const top = stableRank(Array.isArray(proposal.top) ? proposal.top : []);
    const suggestions = Array.isArray(proposal.suggestions) ? proposal.suggestions : [];
    suggestions.forEach((b) => {
      if (!b || !b.taskUid) return;
      const idx = top.findIndex((x) => x.uid === b.taskUid);
      if (idx < 0 || (selections.includeIdx.size && !selections.includeIdx.has(idx))) return;
      plan.blocks.push({ taskUid: b.taskUid, start: b.start, end: b.end });
    });
    if (Array.isArray(proposal.overdue)) {
      proposal.overdue.forEach((o, i) => {
        const option = selections.overdueChoices[i] || 'today';
        if (option === 'today') return; // mặc định giữ ở hôm nay — không move
        plan.reschedule.push({ idx: i, option });
      });
    }
    return plan;
  }

  return {
    plannerContentHTML,
    readSelections,
    buildApplyPlan,
    todayStr,
    DEFAULT_AVAIL_HOURS,
  };
});
