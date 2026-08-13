/* js/deeplink.js — Parse deep link từ manifest shortcuts (?view=, ?m=YYYY-M)
   Chạy được cả ở browser (window.DeepLink) lẫn Node (module.exports) để unit test. */
(function () {
  'use strict';

  function emptyResult() {
    return { view: null, year: null, month: null, week: null, quick: false };
  }

  function numWeeksOf(year, month) {
    var first = new Date(year, month, 1);
    var mondayOffset = (first.getDay() + 6) % 7;
    var days = new Date(year, month + 1, 0).getDate();
    return Math.ceil((mondayOffset + days) / 7);
  }

  function parse(urlStr) {
    var out = emptyResult();
    if (!urlStr) return out;
    var url;
    try {
      url = new URL(urlStr, 'https://taskflow.local/app.html');
    } catch (e) {
      return out;
    }

    var view = String(url.searchParams.get('view') || '').trim();
    if (view === 'today' || view === 'overview' || view === 'year' || view === 'week' || view === 'calendar' || view === 'day' || view === 'upcoming' || view === 'inbox' || view === 'projects') {
      out.view = view;
    }
    // quick=1 → mở Quick Add ngay sau khi boot (dùng cho manifest shortcut "Thêm công việc")
    out.quick = url.searchParams.get('quick') === '1';

    var m = /^(\d{4})-(\d{1,2})$/.exec(String(url.searchParams.get('m') || '').trim());
    if (m) {
      var y = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10);
      if (y >= 2020 && y <= 2099 && mo >= 1 && mo <= 12) {
        out.year = y;
        out.month = mo - 1;
      }
    }

    var weekRaw = String(url.searchParams.get('w') || '').trim();
    if (out.view === 'week' && /^\d+$/.test(weekRaw)) {
      var week = parseInt(weekRaw, 10);
      var maxWeeks = out.year !== null && out.month !== null ? numWeeksOf(out.year, out.month) : 6;
      if (week >= 1 && week <= maxWeeks) out.week = week;
    }
    if (out.view === 'calendar') {
      var tags = url.searchParams.getAll('tag').map(function (tag) { return String(tag).trim(); }).filter(Boolean);
      tags = tags.filter(function (tag, index) { return tags.indexOf(tag) === index; }).slice(0, 8);
      if (tags.length) out.tags = tags;
    }
    if (out.view === 'day') {
      // Tuần chứa ngày (w, 1..max) + ngày trong tuần (d, 0-6)
      if (/^\d+$/.test(weekRaw)) {
        var dw = parseInt(weekRaw, 10);
        var maxWeeks = out.year !== null && out.month !== null ? numWeeksOf(out.year, out.month) : 6;
        if (dw >= 1 && dw <= maxWeeks) out.week = dw;
      }
      var dayRaw = String(url.searchParams.get('d') || '').trim();
      if (/^[0-6]$/.test(dayRaw)) out.day = parseInt(dayRaw, 10);
    }
    return out;
  }

  function withoutParam(urlStr, paramName) {
    if (!urlStr || !paramName) return urlStr;
    try {
      var url = new URL(urlStr);
      url.searchParams.delete(paramName);
      return url.toString();
    } catch (e) {
      return urlStr;
    }
  }

  var api = { parse: parse, withoutParam: withoutParam };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.DeepLink = api;
})();
