// TaskFlow — Projects & Milestones UI (V1.1).
// UI thuần cho Projects: renderProjects (list), renderProjectDetail, dialogs
// (project-edit / milestone-edit), task-detail selectors (td-project / td-milestone),
// compact chip trên task row (Today/Inbox). KHÔNG sở hữu state — nhận store + allTasks
// qua tham số; app.js orchestrate (nav, dispatcher, save, undo). Pattern pillars/reflection.
// Dùng window.TaskFlowI18N.t, window.TaskFlowUI.icon + esc; window.TaskFlowProjects (js/projects.js)
// cho logic store. Module phải an toàn khi require trong test (module.exports) và khi load
// qua script tag (window.TaskFlowProjectsUI).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowProjectsUI = api;
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
  function fmtDate(d) {
    if (!d) return '';
    const p = new Date(d);
    if (isNaN(p.getTime())) return String(d);
    const dd = String(p.getDate()).padStart(2, '0');
    const mm = String(p.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${p.getFullYear()}`;
  }

  // Mọi task (month states + inbox) — dùng cho progress/task-stat. Không throw.
  // Gắn _week/_day/_idx/_month cho task month state để nút "mở task" có toạ độ mở drawer.
  function allTasks() {
    const out = [];
    try {
      for (let y = (new Date().getFullYear()) - 1; y <= (new Date().getFullYear()) + 1; y++) {
        for (let m = 0; m < 12; m++) {
          let s = null;
          try {
            const raw = localStorage.getItem(`planner-${y}-${m}`);
            if (raw) s = JSON.parse(raw);
          } catch (e) { /* ẩn */ }
          if (!s || !Array.isArray(s.weeks)) continue;
          s.weeks.forEach((w) => {
            if (!w || !Array.isArray(w.days)) return;
            w.days.forEach((d, di) => {
              if (d && Array.isArray(d.tasks)) {
                d.tasks.forEach((tk, ti) => {
                  if (!tk || typeof tk !== 'object') return;
                  if (tk._week === undefined) Object.defineProperty(tk, '_week', { value: w.n, enumerable: false, configurable: true });
                  if (tk._day === undefined) Object.defineProperty(tk, '_day', { value: di, enumerable: false, configurable: true });
                  if (tk._idx === undefined) Object.defineProperty(tk, '_idx', { value: ti, enumerable: false, configurable: true });
                  if (tk._month === undefined) Object.defineProperty(tk, '_month', { value: `${y}-${m}`, enumerable: false, configurable: true });
                  out.push(tk);
                });
              }
            });
          });
        }
      }
    } catch (e) { /* ẩn */ }
    try {
      const raw = localStorage.getItem('planner-inbox');
      if (raw) {
        const ibx = JSON.parse(raw);
        if (Array.isArray(ibx)) out.push(...ibx);
      }
    } catch (e) { /* ẩn */ }
    return out;
  }

  // ---------------- Progress bar ----------------

  function progressBarHTML(progress, labelKey) {
    const pct = Math.max(0, Math.min(100, progress.pct || 0));
    const label = labelKey ? t(labelKey) : '';
    return `<div class="pj-progress" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
      <div class="pj-progress-fill" style="width:${pct}%"></div>
    </div><span class="pj-progress-pct">${pct}%</span>`;
  }

  // ---------------- Projects list ----------------

  function projectCardHTML(pj, progress, statusKey) {
    const miles = Array.isArray(pj.milestones) ? pj.milestones : [];
    const doneMiles = miles.filter((m) => m && m.status === 'completed').length;
    const target = pj.targetDate ? `<span class="pj-meta-item">${icon('calendar')} ${esc(t('projectTargetMeta', { d: fmtDate(pj.targetDate) }))}</span>` : '';
    return `<article class="pj-card" data-project-id="${esc(pj.id)}">
      <div class="pj-card-head">
        <div class="pj-card-title-row">
          <span class="pj-card-icon" aria-hidden="true">${icon('briefcase')}</span>
          <h3 class="pj-card-title">${esc(pj.title)}</h3>
          <span class="pj-status-chip pj-status-${esc(pj.status)}">${esc(t(statusKey))}</span>
        </div>
        <div class="pj-card-progress">${progressBarHTML(progress, 'projectProgressLabel')}</div>
      </div>
      <div class="pj-card-meta">
        ${miles.length ? `<span class="pj-meta-item">${icon('flag')} ${esc(t('projectMilestonesCount', { done: doneMiles, total: miles.length }))}</span>` : ''}
        ${target}
      </div>
      <div class="pj-card-actions">
        <button type="button" class="button button-primary pj-open-btn" data-action="project-open" data-id="${esc(pj.id)}" aria-label="${esc(t('projectOpen'))} · ${esc(pj.title)}">
          ${icon('briefcase')} ${esc(t('projectOpen'))}
        </button>
        <button type="button" class="mini-btn" data-action="project-edit" data-id="${esc(pj.id)}" title="${esc(t('projectEditTitle'))}" aria-label="${esc(t('projectEditTitle'))} · ${esc(pj.title)}">${icon('edit')}</button>
        ${pj.status === 'archived'
          ? `<button type="button" class="mini-btn" data-action="project-restore" data-id="${esc(pj.id)}" title="${esc(t('projectRestore'))}" aria-label="${esc(t('projectRestore'))} · ${esc(pj.title)}">${icon('refresh')}</button>`
          : `<button type="button" class="mini-btn" data-action="project-archive" data-id="${esc(pj.id)}" title="${esc(t('projectArchive'))}" aria-label="${esc(t('projectArchive'))} · ${esc(pj.title)}">${icon('archive')}</button>`}
      </div>
    </article>`;
  }

  // List view — render vào #view-projects. `filter`: 'all' | 'active' | 'completed' | 'archived'.
  function renderProjects(store, filter, openId) {
    const root = document.getElementById('view-projects');
    if (!root) return;
    const projects = (store && Array.isArray(store.projects) ? store.projects : []).filter(Boolean);
    const tasks = allTasks();
    const f = filter || 'active';
    const visible = f === 'all' ? projects : projects.filter((p) => p.status === f);
    const head = `<header class="pj-page-head">
      <div>
        <h2 class="pj-page-title">${icon('briefcase')} ${esc(t('projectsPageTitle'))}</h2>
        <p class="pj-page-sub">${esc(t('projectsPageSubtitle'))}</p>
      </div>
      <button type="button" class="button button-primary" data-action="project-new" aria-label="${esc(t('projectAdd'))}">${icon('plus')} ${esc(t('projectAdd'))}</button>
    </header>
    <div class="pj-filters" role="group" aria-label="${esc(t('projectFilterAll'))}">
      ${['all', 'active', 'completed', 'archived'].map((k) => `<button type="button" class="pj-filter ${f === k ? 'active' : ''}" data-action="project-filter" data-filter="${k}" aria-pressed="${f === k}">${esc(t('projectFilter' + (k[0].toUpperCase() + k.slice(1))))}</button>`).join('')}
    </div>`;
    if (!visible.length) {
      root.innerHTML = `${head}<div class="empty-state">${icon('briefcase')}
        <p class="empty-title">${esc(t('projectsEmptyT'))}</p>
        <p class="empty-hint">${esc(t('projectsEmptyH'))}</p>
        <div class="empty-actions"><button type="button" class="empty-btn" data-action="project-new">${icon('plus')} ${esc(t('projectsEmptyCta'))}</button></div>
      </div>`;
      return;
    }
    const statusKey = { active: 'projectStatusActive', completed: 'projectStatusCompleted', archived: 'projectStatusArchived' };
    root.innerHTML = `${head}<div class="pj-list">${visible.map((p) => projectCardHTML(p, window.TaskFlowProjects.projectProgress(p, tasks), statusKey[p.status])).join('')}</div>`;
    if (openId) openProjectDetail(store, openId);
  }

  // ---------------- Project Detail ----------------

  function renderProjectDetail(store, projectId) {
    openProjectDetail(store, projectId);
  }

  function openProjectDetail(store, projectId) {
    const root = document.getElementById('view-projects');
    if (!root) return;
    const pj = window.TaskFlowProjects.getProject(store, projectId);
    if (!pj) { renderProjects(store, 'active', null); return; }
    const tasks = allTasks();
    const progress = window.TaskFlowProjects.projectProgress(pj, tasks);
    const miles = Array.isArray(pj.milestones) ? pj.milestones : [];
    const linked = window.TaskFlowProjects.projectTasks(pj, tasks);
    const statusKey = { active: 'projectStatusActive', completed: 'projectStatusCompleted', archived: 'projectStatusArchived' };
    const head = `<header class="pj-page-head pj-detail-head">
      <button type="button" class="mini-btn pj-back-btn" data-action="project-back" aria-label="${esc(t('projectBack'))}">${icon('chevron-left')} ${esc(t('projectBack'))}</button>
      <h2 class="pj-page-title">${esc(pj.title)}</h2>
      <span class="pj-status-chip pj-status-${esc(pj.status)}">${esc(t(statusKey[pj.status]))}</span>
      <div class="pj-card-actions pj-detail-actions">
        <button type="button" class="mini-btn" data-action="project-edit" data-id="${esc(pj.id)}" aria-label="${esc(t('projectEditTitle'))}">${icon('edit')}</button>
        ${pj.status === 'active' ? `<button type="button" class="mini-btn" data-action="project-complete" data-id="${esc(pj.id)}" aria-label="${esc(t('projectComplete'))}">${icon('check')}</button>` : ''}
        ${pj.status === 'archived'
          ? `<button type="button" class="mini-btn" data-action="project-restore" data-id="${esc(pj.id)}" aria-label="${esc(t('projectRestore'))}">${icon('refresh')}</button>`
          : `<button type="button" class="mini-btn" data-action="project-archive" data-id="${esc(pj.id)}" aria-label="${esc(t('projectArchive'))}">${icon('archive')}</button>`}
      </div>
    </header>
    <div class="pj-progress-row"><span class="pj-progress-label">${esc(t('projectProgressLabel'))}</span>${progressBarHTML(progress, 'projectProgressLabel')}</div>`;
    const meta = [];
    if (pj.targetDate) meta.push(`<div class="pj-meta-block"><span class="pj-meta-label">${esc(t('projectTargetLbl'))}</span><span>${esc(fmtDate(pj.targetDate))}</span></div>`);
    if (pj.notes) meta.push(`<div class="pj-meta-block pj-notes"><span class="pj-meta-label">${esc(t('projectNotesLbl'))}</span><span class="pj-notes-text">${esc(pj.notes)}</span></div>`);
    const mileHTML = `<section class="pj-section" aria-labelledby="pj-miles-title">
      <div class="pj-section-head">
        <h3 id="pj-miles-title">${icon('flag')} ${esc(t('projectMilestonesLbl'))}</h3>
        <button type="button" class="mini-btn add-btn" data-action="mile-add" data-id="${esc(pj.id)}" aria-label="${esc(t('projectMilestoneAdd'))}">${icon('plus')} <span>${esc(t('projectMilestoneAdd'))}</span></button>
      </div>
      <ul class="pj-milestones">
        ${miles.map((m) => `<li class="pj-milestone ${m.status === 'completed' ? 'done' : ''}" data-milestone-id="${esc(m.id)}">
          <label class="pj-mile-toggle">
            ${window.TaskFlowXP && window.TaskFlowXP.checkboxHTML ? window.TaskFlowXP.checkboxHTML('pj', m.status === 'completed', `data-action="mile-toggle" data-pid="${esc(pj.id)}" data-mid="${esc(m.id)}"`, m.status === 'completed' ? t('milestoneReopenAria', { name: m.title }) : t('milestoneCompleteAria', { name: m.title })) : '<input type="checkbox" aria-label="' + (m.status === 'completed' ? t('milestoneReopenAria', { name: m.title }) : t('milestoneCompleteAria', { name: m.title })) + '" checked="' + (m.status === 'completed' ? 'checked' : '') + '" data-action="mile-toggle" data-pid="' + esc(pj.id) + '" data-mid="' + esc(m.id) + '" />'}
          </label>
          <span class="pj-mile-title">${esc(m.title)}</span>
          ${m.targetDate ? `<span class="pj-mile-date">${esc(fmtDate(m.targetDate))}</span>` : ''}
          <span class="item-actions">
            <button type="button" class="mini-btn" data-action="mile-edit" data-pid="${esc(pj.id)}" data-mid="${esc(m.id)}" title="${esc(t('milestoneEditAria', { name: m.title }))}" aria-label="${esc(t('milestoneEditAria', { name: m.title }))}">${icon('edit')}</button>
            <button type="button" class="mini-btn" data-action="mile-del" data-pid="${esc(pj.id)}" data-mid="${esc(m.id)}" title="${esc(t('milestoneDelete'))}" aria-label="${esc(t('milestoneDelete'))}">${icon('trash')}</button>
          </span>
        </li>`).join('') || `<li class="pj-empty-line">${icon('flag')} ${esc(t('projectMilestonesCount', { done: 0, total: 0 }))}</li>`}
      </ul>
    </section>`;
    const taskHTML = `<section class="pj-section" aria-labelledby="pj-tasks-title">
      <div class="pj-section-head"><h3 id="pj-tasks-title">${icon('list-checks')} ${esc(t('projectLinkedTasks'))}</h3></div>
      ${linked.length
        ? `<ul class="pj-linked-tasks">${linked.map((tk) => `<li class="pj-linked-task ${tk.done ? 'done' : ''}">
            <span class="pj-linked-check" aria-hidden="true">${tk.done ? icon('check') : ''}</span>
            <button type="button" class="pj-linked-task-btn" data-action="project-open-task" data-week="${tk._week ?? ''}" data-day="${tk._day ?? ''}" data-task="${tk._idx ?? ''}" data-text="${esc(tk.text)}">${esc(tk.text)}</button>
            ${tk.milestoneId ? `<span class="pj-linked-mile">${icon('flag')} ${esc((() => { const mm = window.TaskFlowProjects.getMilestone(store, pj.id, tk.milestoneId); return mm ? mm.title : ''; })())}</span>` : ''}
          </li>`).join('')}</ul>`
        : `<p class="pj-empty-line">${esc(t('projectLinkedTasksEmpty'))}</p>`}
    </section>`;
    root.innerHTML = `${head}${meta.length ? `<div class="pj-meta-grid">${meta.join('')}</div>` : ''}<div class="pj-detail-body">${mileHTML}${taskHTML}</div>`;
  }

  // ---------------- Dialogs (modal content) ----------------

  // Trả HTML nội dung form cho dialog project (add/edit). Mở modal bởi app.js.
  function projectEditForm(store, projectId) {
    const pj = projectId ? window.TaskFlowProjects.getProject(store, projectId) : null;
    const isEdit = !!pj;
    const v = (k, fallback) => (pj && pj[k] != null ? pj[k] : (fallback ?? ''));
    return `<form class="pj-form" data-role="project-edit-form" data-id="${isEdit ? esc(pj.id) : ''}">
      <div class="form-field">
        <label for="pj-name-input">${esc(t('projectNameLbl'))}</label>
        <input id="pj-name-input" type="text" class="inline-input" data-role="project-name" value="${esc(v('title'))}" placeholder="${esc(t('projectNamePh'))}" maxlength="120" autocomplete="off" />
      </div>
      <div class="form-field">
        <label for="pj-target-input">${esc(t('projectTargetLbl'))}</label>
        <input id="pj-target-input" type="date" class="inline-input" data-role="project-target" value="${esc(v('targetDate') || '')}" />
      </div>
      <div class="form-field">
        <label for="pj-notes-input">${esc(t('projectNotesLbl'))}</label>
        <textarea id="pj-notes-input" class="inline-input pj-notes-input" data-role="project-notes" rows="3" placeholder="${esc(t('projectNotesPh'))}">${esc(v('notes'))}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="button button-primary" data-action="${isEdit ? 'project-edit-save' : 'project-create-save'}" data-id="${isEdit ? esc(pj.id) : ''}">${icon('check')} ${esc(t('projectSave'))}</button>
        <button type="button" class="button" data-action="project-edit-close">${esc(t('closeBtn'))}</button>
      </div>
    </form>`;
  }

  // Milestone form (add/edit trong project).
  function milestoneEditForm(store, projectId, milestoneId) {
    const m = milestoneId ? window.TaskFlowProjects.getMilestone(store, projectId, milestoneId) : null;
    const isEdit = !!m;
    const v = (k, fallback) => (m && m[k] != null ? m[k] : (fallback ?? ''));
    return `<form class="pj-form" data-role="milestone-edit-form" data-pid="${esc(projectId)}" data-mid="${isEdit ? esc(m.id) : ''}">
      <div class="form-field">
        <label for="mile-name-input">${esc(t('milestoneNameLbl'))}</label>
        <input id="mile-name-input" type="text" class="inline-input" data-role="milestone-name" value="${esc(v('title'))}" placeholder="${esc(t('milestoneNamePh'))}" maxlength="120" autocomplete="off" />
      </div>
      <div class="form-field">
        <label for="mile-target-input">${esc(t('milestoneTargetLbl'))}</label>
        <input id="mile-target-input" type="date" class="inline-input" data-role="milestone-target" value="${esc(v('targetDate') || '')}" />
      </div>
      <div class="form-actions">
        <button type="button" class="button button-primary" data-action="mile-edit-save" data-pid="${esc(projectId)}" data-mid="${isEdit ? esc(m.id) : ''}">${icon('check')} ${esc(t('milestoneSave'))}</button>
        <button type="button" class="button" data-action="mile-edit-close">${esc(t('closeBtn'))}</button>
      </div>
    </form>`;
  }

  // ---------------- Task-detail selectors ----------------

  function projectOptionsHTML(store, selected) {
    const projects = (store && Array.isArray(store.projects) ? store.projects : []).filter((p) => p && p.status !== 'archived');
    return `<option value="">${esc(t('tdProjectNone'))}</option>${projects.map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}`;
  }

  function milestoneOptionsHTML(store, projectId, selected) {
    if (!projectId) return `<option value="">${esc(t('tdMilestoneNone'))}</option>`;
    const pj = window.TaskFlowProjects.getProject(store, projectId);
    const miles = (pj && Array.isArray(pj.milestones) ? pj.milestones : []).filter(Boolean);
    return `<option value="">${esc(t('tdMilestoneNone'))}</option>${miles.map((m) => `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}`;
  }

  // HTML cho vùng metadata trong Task Detail drawer (đặt gần tags/deadline).
  function taskLinkSelectsHTML(store, task) {
    const pId = window.TaskFlowProjects.taskProjectId(task) || '';
    const mId = window.TaskFlowProjects.taskMilestoneId(task) || '';
    const disabled = pId ? '' : ' disabled';
    return `<div class="td-field td-project-field" data-role="td-project-field">
      <span class="td-field-label">${icon('briefcase')} ${esc(t('tdProjectLbl'))}</span>
      <select class="td-field-select" data-action="td-project" data-role="td-project-select" aria-label="${esc(t('tdProjectLbl'))}">
        ${projectOptionsHTML(store, pId)}
      </select>
    </div>
    <div class="td-field td-milestone-field" data-role="td-milestone-field">
      <span class="td-field-label">${icon('flag')} ${esc(t('tdMilestoneLbl'))}</span>
      <select class="td-field-select" data-action="td-milestone" data-role="td-milestone-select" aria-label="${esc(t('tdMilestoneLbl'))}"${disabled}>
        ${milestoneOptionsHTML(store, pId, mId)}
      </select>
    </div>`;
  }

  // Chip compact trên task row (Today/Inbox) — chỉ khi task có project.
  function taskProjectChip(store, task) {
    const pId = window.TaskFlowProjects.taskProjectId(task);
    if (!pId) return '';
    const pj = window.TaskFlowProjects.getProject(store, pId);
    if (!pj || pj.status === 'archived') return '';
    return `<span class="task-project-chip" title="${esc(t('taskProjectChip', { name: pj.title }))}">${icon('briefcase')} <span>${esc(pj.title)}</span></span>`;
  }

  return {
    renderProjects,
    renderProjectDetail,
    projectEditForm,
    milestoneEditForm,
    projectOptionsHTML,
    milestoneOptionsHTML,
    taskLinkSelectsHTML,
    taskProjectChip,
    progressBarHTML,
    allTasks,
    fmtDate,
  };
});
