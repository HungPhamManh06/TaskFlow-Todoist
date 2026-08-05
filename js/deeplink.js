/* js/deeplink.js — Parse deep link từ manifest shortcuts (?view=, ?m=YYYY-M)
   Chạy được cả ở browser (window.DeepLink) lẫn Node (module.exports) để unit test. */
(function () {
  'use strict';

  function emptyResult() {
    return { view: null, year: null, month: null, week: null };
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
    if (view === 'overview' || view === 'year' || view === 'week' || view === 'calendar') {
      out.view = view;
    }

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
