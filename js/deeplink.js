/* js/deeplink.js — Parse deep link từ manifest shortcuts (?view=, ?m=YYYY-M)
   Chạy được cả ở browser (window.DeepLink) lẫn Node (module.exports) để unit test. */
(function () {
  'use strict';

  function parse(urlStr) {
    if (!urlStr) return { view: null, year: null, month: null };
    var qIdx = urlStr.indexOf('?');
    if (qIdx < 0) return { view: null, year: null, month: null };
    var out = { view: null, year: null, month: null };
    var parts = urlStr.slice(qIdx + 1).split('&');
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].split('=');
      if (pair.length !== 2 || !pair[0] || !pair[1]) continue;
      var k = decodeURIComponent(pair[0]).trim();
      var v = decodeURIComponent(pair[1]).trim();
      if (k === 'view' && (v === 'overview' || v === 'year' || v === 'week' || v === 'calendar')) {
        out.view = v;
      } else if (k === 'm') {
        var m = /^(\d{4})-(\d{1,2})$/.exec(v);
        if (m) {
          var y = parseInt(m[1], 10);
          var mo = parseInt(m[2], 10);
          if (y >= 2020 && y <= 2099 && mo >= 1 && mo <= 12) {
            out.year = y;
            out.month = mo - 1;
          }
        }
      }
    }
    return out;
  }

  var api = { parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.DeepLink = api;
})();
