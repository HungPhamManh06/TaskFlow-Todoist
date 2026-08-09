// TaskFlow — FAB kéo-thả + auto-tuck (tách từ app.js trong P11 refactor, extraction 15).
// Gồm: loadFabPos/saveFabPos/clearFabPos (localStorage), clampFabPos (giới hạn trong
// viewport, chừa chỗ bottom-nav mobile), initFabDrag (pointer drag), initFabTuck
// (auto-tuck về mép sau ~2.2s rảnh), initFabDrags (boot tất cả FAB). State nội bộ:
// fabDragJustMoved (chặn click phát sinh sau kéo) + consts FAB_MARGIN/FAB_POS_KEYS/
// FAB_TUCK_MS/FAB_TUCK_SLIVER. t() + toast access qua globalThis.TaskFlowI18N /
// globalThis.TaskFlowUI (browser: i18n.js + ui.js load trước; Node: guard optional).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowFab = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const FAB_POS_KEYS = { pomo: 'planner-fab-pomo', chat: 'planner-fab-chat' };
  const FAB_MARGIN = 8; // lề tối thiểu so với mép viewport
  const FAB_TUCK_MS = 2200;
  const FAB_TUCK_SLIVER = 14;

  function getI18n() {
    return (typeof globalThis !== 'undefined' && globalThis.TaskFlowI18N) || null;
  }

  function getUI() {
    return (typeof globalThis !== 'undefined' && globalThis.TaskFlowUI) || null;
  }

  function getWindow() {
    return (typeof globalThis !== 'undefined' && globalThis.window) || null;
  }

  function loadFabPos(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return null; }
  }
  function saveFabPos(key, x, y) {
    try { localStorage.setItem(key, JSON.stringify({ x, y })); } catch (e) { /* ẩn */ }
  }
  function clearFabPos(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ẩn */ }
  }

  // Chặn click sau khi vừa kéo thả (tránh mở panel do click phát sinh)
  let fabDragJustMoved = false;
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      if (fabDragJustMoved) {
        fabDragJustMoved = false;
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
  }

  function clampFabPos(x, y, w, h) {
    const win = getWindow();
    if (!win) return { x, y };
    // Mobile có bottom nav cố định (~82px) → chặn FAB kéo xuống dưới nav
    const bottomPad = win.innerWidth <= 767 ? 82 : FAB_MARGIN;
    return {
      x: Math.min(Math.max(x, FAB_MARGIN), win.innerWidth - w - FAB_MARGIN),
      y: Math.min(Math.max(y, FAB_MARGIN), win.innerHeight - h - bottomPad),
    };
  }

  function initFabDrag(wrap, fab, key) {
    const applyPos = (x, y) => {
      const r = fab.getBoundingClientRect();
      const c = clampFabPos(x, y, r.width, r.height);
      wrap.style.left = c.x + 'px';
      wrap.style.top = c.y + 'px';
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
    };
    const resetPos = () => {
      wrap.style.left = '';
      wrap.style.top = '';
      wrap.style.right = '';
      wrap.style.bottom = '';
    };
    // Áp vị trí đã lưu (nếu có) — dùng khi khởi động / đổi kích thước
    const saved = loadFabPos(key);
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      applyPos(saved.x, saved.y);
    }
    window.addEventListener('resize', () => {
      const s = loadFabPos(key);
      if (s) applyPos(s.x, s.y);
    });
    // Nhấp đúp → về vị trí mặc định (CSS)
    fab.addEventListener('dblclick', (e) => {
      e.preventDefault();
      clearFabPos(key);
      resetPos();
      const i18n = getI18n();
      const ui = getUI();
      const msg = i18n && i18n.t ? i18n.t('fabDragReset') : 'Đặt lại vị trí';
      if (ui && ui.toast) ui.toast(msg, 'success');
    });
    // Kéo thả bằng pointer events (hợp cả chuột + cảm ứng)
    let drag = null;
    fab.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const r = wrap.getBoundingClientRect();
      drag = {
        startX: e.clientX,
        startY: e.clientY,
        origX: r.left,
        origY: r.top,
        moved: false,
      };
      try { fab.setPointerCapture(e.pointerId); }
      catch (_) {
        // pointer không active (edge case): không thể theo dõi cử chỉ —
        // hủy drag để không kẹt class/trạng thái.
        drag = null;
        return;
      }
      fab.classList.add('fab-dragging');
      e.preventDefault();
    });
    fab.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      applyPos(drag.origX + dx, drag.origY + dy);
    });
    const endDrag = (e) => {
      if (!drag) return;
      const wasMoved = drag.moved;
      const r = wrap.getBoundingClientRect();
      drag = null;
      fab.classList.remove('fab-dragging');
      if (wasMoved) {
        saveFabPos(key, r.left, r.top);
        fabDragJustMoved = true; // chặn click phát sinh sau khi kéo
        // An toàn: nếu không có click nào phát sinh (vd pointercancel),
        // tự xoá cờ ở sự kiện kế — tránh nuốt click không liên quan sau đó.
        setTimeout(() => { fabDragJustMoved = false; }, 0);
      }
    };
    fab.addEventListener('pointerup', endDrag);
    fab.addEventListener('pointercancel', endDrag);
  }

  function initFabDrags() {
    const pomoWrap = document.querySelector('.pomo-fab-wrap');
    if (pomoWrap) {
      const fab = pomoWrap.querySelector('.pomo-fab');
      // initFabTuck TRƯỚC initFabDrag: pointerdown untuck phải chạy trước khi drag đọc rect
      initFabTuck(pomoWrap, fab, FAB_POS_KEYS.pomo);
      if (fab) initFabDrag(pomoWrap, fab, FAB_POS_KEYS.pomo);
    }
    const chatWrap = document.getElementById('chatFabWrap');
    if (chatWrap) {
      const fab = chatWrap.querySelector('.fb-fab');
      initFabTuck(chatWrap, fab, FAB_POS_KEYS.chat);
      if (fab) initFabDrag(chatWrap, fab, FAB_POS_KEYS.chat);
    }
  }

  // ---------- Auto-tuck: FAB tự thu về mép màn hình khi rảnh ----------
  // Sau ~2.2s không tương tác (và panel đóng), FAB trượt về mép gần nhất,
  // chỉ chừa 1 tab nhỏ ~14px — không che nội dung (vd ô Lịch). Hover/focus
  // hoặc kéo sẽ kéo FAB trở ra đầy đủ. Vị trí kéo-thả vẫn được tôn trọng.
  function fabTuckAllowed(wrap) {
    // Không thu FAB khi panel/chat đang mở — cần nhìn thấy timer/nội dung
    const panel = wrap.querySelector('.pomo-panel, .chat-pop');
    if (panel && !panel.hidden) return false;
    return true;
  }

  function nearestTuckEdge(wrap) {
    const win = getWindow();
    const r = wrap.getBoundingClientRect();
    const mobile = win.innerWidth <= 767;
    const d = {
      left: r.left,
      right: win.innerWidth - r.right,
      top: r.top,
      // Mobile: tránh tuck xuống mép dưới (bị bottom-nav che mất tab) → chỉ trái/phải/trên
      bottom: mobile ? Infinity : Math.max(0, win.innerHeight - r.bottom - FAB_MARGIN),
    };
    return Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));
  }

  function tuckOffset(wrap, edge) {
    // Tính translate (px) đưa FAB sát mép, chỉ chừa 1 tab ~FAB_TUCK_SLIVER hiển thị:
    //   bottom → trượt xuống, chừa s px ĐỈNH FAB ở mép dưới màn hình
    //   top    → trượt lên, chừa s px ĐÁY FAB ở mép trên
    //   right  → trượt phải, chừa s px TRÁI FAB ở mép phải
    //   left   → trượt trái, chừa s px PHẢI FAB ở mép trái
    const win = getWindow();
    const r = wrap.getBoundingClientRect();
    const s = FAB_TUCK_SLIVER;
    if (edge === 'bottom') return { x: 0, y: (win.innerHeight - s) - r.top };
    if (edge === 'top') return { x: 0, y: (s - r.height) - r.top };
    if (edge === 'right') return { x: (win.innerWidth - s) - r.left, y: 0 };
    return { x: (s - r.width) - r.left, y: 0 }; // left
  }

  function initFabTuck(wrap, fab, key) {
    if (!wrap || !fab) return;
    let timer = null;
    // Chỉ auto-tuck khi FAB đang ở vị trí MẶC ĐỊNH (chưa từng kéo đi nơi khác).
    // User đã kéo để đặt chỗ riêng → tôn trọng vị trí tuỳ chỉnh, không tuck nữa.
    const hasCustomPos = () => !!loadFabPos(key);
    const untuck = (instant) => {
      clearTimeout(timer);
      if (instant) {
        // Bỏ transition ngay để drag đọc đúng vị trí mới (không bị rect giữa chừng)
        wrap.style.transition = 'none';
        wrap.classList.remove('fab-tucked');
        requestAnimationFrame(() => requestAnimationFrame(() => { wrap.style.transition = ''; }));
      } else {
        wrap.classList.remove('fab-tucked');
      }
    };
    const applyTuck = () => {
      if (!fabTuckAllowed(wrap)) return;
      if (hasCustomPos()) { wrap.classList.remove('fab-tucked'); return; }
      // Quan trọng: nếu đang tuck (vd sau resize), phải bỏ transform TRƯỚC khi đo
      // rect — nếu không getBoundingClientRect trả về vị trí đã dịch, offset mới sai.
      const wasTucked = wrap.classList.contains('fab-tucked');
      if (wasTucked) wrap.style.transition = 'none';
      wrap.classList.remove('fab-tucked');
      const edge = nearestTuckEdge(wrap);
      const o = tuckOffset(wrap, edge);
      wrap.style.setProperty('--tuck-x', o.x + 'px');
      wrap.style.setProperty('--tuck-y', o.y + 'px');
      wrap.setAttribute('data-tuck-edge', edge);
      wrap.classList.add('fab-tucked');
      if (wasTucked) requestAnimationFrame(() => requestAnimationFrame(() => { wrap.style.transition = ''; }));
    };
    const schedule = () => {
      clearTimeout(timer);
      if (!fabTuckAllowed(wrap)) { wrap.classList.remove('fab-tucked'); return; }
      timer = setTimeout(applyTuck, FAB_TUCK_MS);
    };
    // pointerdown phải đăng ký TRƯỚC initFabDrag để untuck chạy trước khi drag đọc rect
    fab.addEventListener('pointerdown', () => untuck(true));
    wrap.addEventListener('pointerleave', (e) => {
      if (!fab.classList.contains('fab-dragging')) schedule();
    });
    // Sau khi tuck, nếu user hover trở lại → kéo FAB ra đầy đủ
    wrap.addEventListener('pointerenter', () => untuck(false));
    fab.addEventListener('focus', () => untuck(false));
    fab.addEventListener('blur', () => schedule());
    fab.addEventListener('pointerup', () => schedule());
    // Viewport đổi kích thước khi đang tuck → tính lại offset cho viewport mới,
    // tránh FAB trôi khỏi màn hình (mất hẳn tab 14px).
    window.addEventListener('resize', () => {
      if (wrap.classList.contains('fab-tucked')) applyTuck();
    });
    // Panel đóng qua đường khác (view switch / Escape / ✕) → đăng ký lại tuck.
    // MutationObserver bắt mọi đường đóng panel, không chỉ click.
    const panel = wrap.querySelector('.pomo-panel, .chat-pop');
    if (panel) {
      new MutationObserver(() => {
        if (panel.hidden) schedule();
        else untuck(false);
      }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    }
    // Tuck ban đầu: nếu không ai động tới trong FAB_TUCK_MS thì thu về mép
    // (kể cả lúc vừa mở trang — FAB không nằm chình ình che nội dung).
    // Chỉ áp dụng khi FAB chưa được kéo tuỳ chỉnh.
    schedule();
  }

  return { loadFabPos, saveFabPos, clearFabPos, clampFabPos, initFabDrag, initFabDrags, fabTuckAllowed, nearestTuckEdge, tuckOffset, initFabTuck };
});
