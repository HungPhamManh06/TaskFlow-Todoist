/* js/plan-carry.js — Logic thuần cho uid task & task lặp thông minh (carry-over):
   uid cố định, tìm task theo uid, lên kế hoạch dồn task lặp bị lỡ vào hôm nay,
   đồng bộ trạng thái done giữa task gốc và bản dồn.
   Chạy được cả ở browser (window.PlanCarry) lẫn Node (module.exports) để unit test.
   KHÔNG đọc/ghi localStorage, không đụng DOM, không gọi save(). */
(function () {
  'use strict';

  // uid cố định cho task: timestamp base36 + 6 ký tự ngẫu nhiên (đủ độc nhất trong thực tế)
  function newTaskUid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Gán uid nếu task chưa có (idempotent) — MUTATE task; dùng cho data cũ trước nâng cấp
  function ensureTaskUid(tk) {
    if (tk && typeof tk.uid !== 'string') tk.uid = newTaskUid();
    return tk;
  }

  // Tìm task theo uid trong toàn bộ weeks (tháng đang xem)
  function findTaskByUid(weeks, uid) {
    if (!uid) return null;
    for (const w of weeks) {
      for (const d of (w.days || [])) {
        for (const tk of (d.tasks || [])) {
          if (tk.uid === uid) return tk;
        }
      }
    }
    return null;
  }

  // Ngày của ô (wi, di) trên lưới tuần bắt đầu từ planStart (thứ 2 của tuần chứa ngày 1)
  function dayDate(planStart, wi, di) {
    return new Date(planStart.getTime() + (wi * 7 + di) * 86400000);
  }

  // Lên kế hoạch dồn task lặp bị lỡ vào ngày hôm nay.
  // THUẦN: không mutate `weeks` (bản sao carry là object mới); trả về { copies } với mỗi
  // phần tử { source, sourceKey: {w,d,t}, date, copy } để app tự push + đánh dấu carried.
  function planCarry(weeks, planStart, today) {
    const raw = today || new Date();
    const todayNorm = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
    const copies = [];
    let todayW = -1, todayD = -1;
    (weeks || []).forEach((w, wi) => {
      (w.days || []).forEach((d, di) => {
        const dt = dayDate(planStart, wi, di);
        if (dt && dt.getTime() === todayNorm.getTime()) { todayW = wi; todayD = di; }
      });
    });
    if (todayW < 0) return { copies, todayW, todayD };
    const targetTasks = weeks[todayW].days[todayD].tasks;
    (weeks || []).forEach((w, wi) => {
      (w.days || []).forEach((d, di) => {
        const dt = dayDate(planStart, wi, di);
        if (!dt || dt.getTime() >= todayNorm.getTime()) return; // hôm nay & tương lai: không carry
        (d.tasks || []).forEach((tk, ti) => {
          if (!tk || !tk.repeat || !tk.repeat.freq || tk.done || tk.carried) return;
          // Task chưa có uid (data rất cũ) → dùng uid sinh tạm; app sẽ gán bền vững trước khi gọi
          const uid = tk.uid || newTaskUid();
          // exists theo uid (fallback chỉ số cho bản dồn cũ) — tránh trùng khi xoá/chèn task
          const exists = targetTasks.some((x) => x.carriedFrom && (
            (x.carriedFrom.uid && x.carriedFrom.uid === uid) ||
            (!x.carriedFrom.uid && x.carriedFrom.w === wi && x.carriedFrom.d === di && x.carriedFrom.t === ti)
          ));
          if (exists) return;
          const srcDate = (d.date || '') + (d.yy ? '/' + d.yy : '');
          copies.push({
            source: tk,
            sourceKey: { w: wi, d: di, t: ti },
            date: srcDate,
            copy: Object.assign({}, tk, {
              uid: newTaskUid(), // bản sao là task MỚI — uid riêng
              done: false,
              carried: false,
              carriedFrom: { uid: uid, date: srcDate },
              repeat: null,
              _recurred: undefined, // không kế thừa flag tạm của bản gốc (applyRecurrence)
              tags: Array.isArray(tk.tags) ? tk.tags.slice() : [],
              linkedMetricIds: [], // metric thuộc tháng nguồn — task carry mới không kế thừa link
              remind: tk.remind && typeof tk.remind === 'object' ? Object.assign({}, tk.remind) : { enabled: false, time: '20:00' },
            }),
          });
        });
      });
    });
    return { copies, todayW, todayD };
  }

  // Đồng bộ trạng thái done giữa task gốc và bản dồn, tra theo uid (fallback chỉ số cho bản cũ).
  // MUTATE task trong `weeks` (đây là quyết định của ứng dụng) và trả về danh sách task bị đổi.
  function syncCarriedDone(weeks, wi, di, ti, t) {
    const changed = [];
    if (!t) return changed;
    if (t.carriedFrom) {
      // Bản dồn → task gốc
      let src = t.carriedFrom.uid ? findTaskByUid(weeks, t.carriedFrom.uid) : null;
      if (!src && typeof t.carriedFrom.w === 'number') {
        try {
          const w = weeks[t.carriedFrom.w];
          const d = w && w.days[t.carriedFrom.d];
          src = d && d.tasks[t.carriedFrom.t];
        } catch (e) { /* ẩn */ }
      }
      if (src && src.done !== t.done) { src.done = t.done; changed.push(src); }
      return changed;
    }
    // Task gốc → mọi bản dồn trỏ về nó
    if (!t.uid) return changed;
    for (const w2 of weeks) {
      for (const d2 of (w2.days || [])) {
        for (const tk of (d2.tasks || [])) {
          if (!tk.carriedFrom) continue;
          const match = tk.carriedFrom.uid
            ? tk.carriedFrom.uid === t.uid
            : (tk.carriedFrom.w === wi && tk.carriedFrom.d === di && tk.carriedFrom.t === ti);
          if (match && tk.done !== t.done) { tk.done = t.done; changed.push(tk); }
        }
      }
    }
    return changed;
  }

  const api = {
    newTaskUid: newTaskUid,
    ensureTaskUid: ensureTaskUid,
    findTaskByUid: findTaskByUid,
    dayDate: dayDate,
    planCarry: planCarry,
    syncCarriedDone: syncCarriedDone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.PlanCarry = api;
})();
