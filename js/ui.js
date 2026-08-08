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

  function buildViewUrl({ view, year, month, week, tags, day }) {
    const q = new URLSearchParams();
    q.set('view', view);
    q.set('m', `${year}-${String(month + 1).padStart(2, '0')}`);
    if ((view === 'week' || view === 'day') && week) q.set('w', String(week));
    if (view === 'day' && day !== undefined && day !== null) q.set('d', String(day));
    if (view === 'calendar' && Array.isArray(tags)) {
      tags.map((tag) => String(tag).trim()).filter(Boolean).forEach((tag) => q.append('tag', tag));
    }
    return `?${q.toString()}`;
  }

  function syncUrl(input) {
    history.replaceState(null, '', buildViewUrl(input));
  }

  function icon(name, className = 'ui-icon') {
    return `<svg class="${className}" aria-hidden="true"><use href="icons/ui-sprite.svg#${name}"></use></svg>`;
  }

  const dialogState = new Map();
  const layerStack = [];
  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  function getLayer(id) {
    return typeof document === 'undefined' ? null : document.getElementById(id);
  }

  function dialogSurface(layer) {
    return layer && (layer.matches('[role="dialog"]') ? layer : layer.querySelector('[role="dialog"]'));
  }

  function focusableElements(layer) {
    const surface = dialogSurface(layer) || layer;
    if (!surface) return [];
    return Array.from(surface.querySelectorAll(focusableSelector)).filter(function (node) {
      return !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.getClientRects().length > 0;
    });
  }

  function rememberLayer(id, opener, type) {
    const previous = dialogState.get(id);
    dialogState.set(id, {
      opener: opener || (typeof document !== 'undefined' ? document.activeElement : null),
      type,
    });
    if (!previous) layerStack.push(id);
  }

  function focusLayer(layer, preferField = true) {
    const surface = dialogSurface(layer) || layer;
    if (!surface) return;
    const preferred = preferField
      ? surface.querySelector('[autofocus], input:not([type="hidden"]), select, textarea, [data-dialog-primary]')
      : null;
    const target = preferred || focusableElements(layer)[0] || surface;
    if (!surface.hasAttribute('tabindex') && target === surface) surface.setAttribute('tabindex', '-1');
    if (target && typeof target.focus === 'function') target.focus();
  }

  function openDialog(id, opener) {
    const layer = getLayer(id);
    if (!layer) return null;
    rememberLayer(id, opener, 'dialog');
    layer.hidden = false;
    layer.dataset.uiLayer = 'open';
    focusLayer(layer);
    return layer;
  }

  function restoreLayerFocus(id) {
    const saved = dialogState.get(id);
    dialogState.delete(id);
    const index = layerStack.lastIndexOf(id);
    if (index >= 0) layerStack.splice(index, 1);
    const opener = saved && saved.opener;
    if (opener && opener.isConnected && opener.getClientRects().length && typeof opener.focus === 'function') opener.focus();
  }

  function closeDialog(id) {
    const layer = getLayer(id);
    if (!layer) return null;
    layer.hidden = true;
    delete layer.dataset.uiLayer;
    restoreLayerFocus(id);
    return layer;
  }

  function openDrawer(id, opener) {
    const layer = getLayer(id);
    if (!layer) return null;
    rememberLayer(id, opener, 'drawer');
    layer.hidden = false;
    layer.dataset.uiLayer = 'open';
    layer.setAttribute('aria-hidden', 'false');
    focusLayer(layer, false);
    return layer;
  }

  function closeDrawer(id) {
    const layer = getLayer(id);
    if (!layer) return null;
    layer.hidden = true;
    delete layer.dataset.uiLayer;
    layer.setAttribute('aria-hidden', 'true');
    restoreLayerFocus(id);
    return layer;
  }

  function requestLayerClose(id) {
    const layer = getLayer(id);
    if (!layer) return;
    const closeButton = layer.querySelector('[data-dialog-dismiss], [data-action$="-close"], [data-action^="close-"]');
    if (closeButton) closeButton.click();
    else if ((dialogState.get(id) || {}).type === 'drawer') closeDrawer(id);
    else closeDialog(id);
  }

  function handleLayerKeydown(event) {
    const id = layerStack[layerStack.length - 1];
    const layer = id && getLayer(id);
    if (!layer || layer.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      requestLayerClose(id);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableElements(layer);
    if (!focusable.length) {
      event.preventDefault();
      focusLayer(layer);
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function toast(message, kind = 'info', duration = 4200) {
    const region = getLayer('toastRegion');
    if (!region) return null;
    const item = document.createElement('div');
    item.className = `toast toast-${['success', 'error', 'info'].includes(kind) ? kind : 'info'}`;
    item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    item.textContent = String(message || '');
    region.appendChild(item);
    requestAnimationFrame(function () { item.classList.add('toast-visible'); });
    window.setTimeout(function () {
      item.classList.remove('toast-visible');
      window.setTimeout(function () { item.remove(); }, 180);
    }, Math.max(1200, duration));
    return item;
  }

  if (typeof document !== 'undefined') document.addEventListener('keydown', handleLayerKeydown);

  return {
    checkboxLabel,
    checkboxA11y,
    buildViewUrl,
    syncUrl,
    icon,
    openDialog,
    closeDialog,
    openDrawer,
    closeDrawer,
    toast,
  };
});
