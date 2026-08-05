(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function checkboxLabel(kind, name, context) {
    return [name || kind, context].filter(Boolean).join(' · ');
  }

  function escapeAttribute(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function checkboxA11y(checked, label) {
    const text = String(label == null ? '' : label).trim();
    if (!text) throw new TypeError('Checkbox label is required');
    return `role="checkbox" aria-checked="${Boolean(checked)}" aria-label="${escapeAttribute(text)}"`;
  }

  function buildViewUrl({ view, year, month, week }) {
    const q = new URLSearchParams();
    q.set('view', view);
    q.set('m', `${year}-${String(month + 1).padStart(2, '0')}`);
    if (view === 'week' && week) q.set('w', String(week));
    return `?${q.toString()}`;
  }

  function syncUrl(input) {
    history.replaceState(null, '', buildViewUrl(input));
  }

  function icon(name, className = 'ui-icon') {
    return `<svg class="${className}" aria-hidden="true"><use href="icons/ui-sprite.svg#${name}"></use></svg>`;
  }

  return { checkboxLabel, checkboxA11y, buildViewUrl, syncUrl, icon };
});
