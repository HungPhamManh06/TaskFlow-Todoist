// TaskFlow — Quick Capture (V1.5)
// Xử lý payload từ PWA Web Share Target và quick URL (?quick=1&text=..&url=..).
// TOÀN BỘ input ngoài (share/URL) được coi là KHÔNG TIN CẬY:
//   - sanitizeText: loại control chars, giới hạn độ dài, không bao giờ trả HTML thô
//   - sanitizeUrl: chỉ chấp nhận http/https, chặn javascript:/data:/vbscript:
// Module thuần (không đụng DOM trực tiếp) — chạy được ở browser (window.TaskFlowQuickCapture)
// lẫn Node (module.exports) để unit test.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowQuickCapture = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MAX_TEXT_LEN = 2000; // tránh share payload khổng lồ
  const MAX_URL_LEN = 2000;

  // Control chars trừ \n (LF) và \t (tab) — cho phép text nhiều dòng hợp lý.
  const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

  function sanitizeText(raw) {
    if (raw === null || raw === undefined) return '';
    let s = String(raw);
    s = s.replace(CONTROL_CHARS, '').replace(/\r/g, '');
    // Nén chuỗi trống thành rỗng
    s = s.trim();
    if (s.length > MAX_TEXT_LEN) s = s.slice(0, MAX_TEXT_LEN).trim();
    return s;
  }

  function sanitizeUrl(raw) {
    if (raw === null || raw === undefined) return '';
    let s = String(raw).trim();
    if (!s) return '';
    if (s.length > MAX_URL_LEN) s = s.slice(0, MAX_URL_LEN);
    const lower = s.toLowerCase();
    // Chặn javascript:, data:, vbscript:, file: — chỉ http/https
    if (!/^https?:\/\//i.test(lower)) return '';
    if (/[\u0000-\u001F\u007F]/.test(s)) return '';
    return s;
  }

  // Ghép task text từ share payload { title, text, url }:
  //   - text là nội dung chính; nếu rỗng thì dùng title
  //   - url được nối ở dòng riêng nếu có
  function composeTaskText(params) {
    const p = params && typeof params === 'object' ? params : {};
    const text = sanitizeText(p.text);
    const title = sanitizeText(p.title);
    const url = sanitizeUrl(p.url);
    const main = text || title;
    const parts = [];
    if (main) parts.push(main);
    if (url) parts.push(url);
    return parts.join('\n');
  }

  // Đọc payload capture từ query string (dùng cho share target GET + quick URL).
  // Accept urlStr tùy chọn để test; mặc định đọc location.href.
  function captureFromUrl(urlStr) {
    let u;
    try {
      u = new URL(urlStr || (typeof location !== 'undefined' ? location.href : ''), 'https://taskflow.local/app');
    } catch (e) {
      return null;
    }
    const title = String(u.searchParams.get('title') || '').trim();
    const text = String(u.searchParams.get('text') || '').trim();
    const url = String(u.searchParams.get('url') || '').trim();
    if (!title && !text && !url) return null;
    return { title, text, url };
  }

  return {
    sanitizeText,
    sanitizeUrl,
    composeTaskText,
    captureFromUrl,
    MAX_TEXT_LEN,
  };
});
