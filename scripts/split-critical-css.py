"""Split css/styles.css into styles-critical.css (boot critical: measured-used
rules + interaction states + theme/dark selectors + referenced keyframes) and
css/styles-deferred.css (everything else).

Reads docs/lighthouse/used-css.json produced by measure-used-css.py.
Source text is preserved byte-for-byte per statement; comments attach to the
following statement. styles.css itself is NOT modified (tests read it).

CASCADE SAFETY (two layers):
1. cascade_closure() — static, exact-selector: the split document loads
   critical first, deferred second, so a deferred rule sharing a selector with
   a critical rule would win even if it came FIRST in the source (week-view
   base `display:none` overriding the mobile `display:flex`). Deferred
   statements whose selector also appears in a later critical statement move
   into critical.
2. dom_closure() — dynamic, DOM-driven: equal-specificity rules with DIFFERENT
   selectors can still match the same element (`.reflection` vs
   `.week-reflection-card`, `.habit-add-row .mini-btn:not(.add-btn)` vs
   `:root[data-dark=true] .mini-btn`). Only rendering the views and comparing
   computed styles against the original monolithic sheet can see those. Any
   deferred statement that changes a computed style moves into critical.
"""
import json
import re

SRC = 'css/styles.css'
USED = 'docs/lighthouse/used-css.json'
OUT_CRIT = 'css/styles-critical.css'
OUT_DEF = 'css/styles-deferred.css'

text = open(SRC, encoding='utf-8').read()

d = json.load(open(USED, encoding='utf-8'))
used = {re.sub(r'\s+', ' ', s).strip() for s in d['used']}
inter = {re.sub(r'\s+', ' ', s).strip() for s in d['interaction']}
keyframes_needed = set(d['keyframes'])

# Boot-critical selectors that the post-boot usage measurement can never observe:
# elements which ONLY exist BEFORE hydration (static pre-boot DOM). The Today
# skeleton is replaced by renderToday() at boot, so used-css.json never sees it —
# without this, its grid/gap/padding land in the deferred sheet and the bars jump
# apart when the deferred CSS arrives after first paint (CLS on slow connections).
BOOT_CRITICAL = {
    '.today-skeleton',
    '.today-skeleton .skeleton',
    '.today-skeleton .skeleton:first-child',
}

INTERACTION_RE = re.compile(r':(hover|focus|active|focus-visible|focus-within|visited|checked|disabled|placeholder-shown|link|target)(\([^)]*\))?')


def norm(sel):
    return re.sub(r'\s+', ' ', sel).strip()


def sel_matches(sel):
    n = norm(sel)
    if n in used or n in inter:
        return True
    # interaction variant of a used selector
    stripped = INTERACTION_RE.sub('', n)
    if stripped != n and stripped in used:
        return True
    return False


def statement_selectors(body):
    """Return (selectors, keyframe_name) for a statement's header."""
    head = body.split('{', 1)[0]
    if head.lstrip().startswith('@keyframes'):
        m = re.match(r'@keyframes\s+([\w-]+)', head)
        return [], (m.group(1) if m else None)
    # split selector list on commas at paren-depth 0
    parts = []
    depth = 0
    cur = []
    for ch in head:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(''.join(cur))
            cur = []
        else:
            cur.append(ch)
    parts.append(''.join(cur))
    return parts, None


def strip_leading_comments(s):
    while s.startswith('/*'):
        end = s.find('*/')
        if end == -1:
            return ''
        s = s[end + 2:].lstrip()
    return s


def classify(body):
    """Return True if this statement (rule or at-rule) belongs in critical."""
    stripped = strip_leading_comments(body.lstrip())
    if not stripped:
        return False  # standalone comment only
    if stripped.startswith('@media') or stripped.startswith('@supports') or stripped.startswith('@layer') or stripped.startswith('@container'):
        # recurse into inner statements
        inner = body[body.index('{') + 1:body.rindex('}')]
        return any(classify(s) for s in split_statements(inner))
    selectors, kf = statement_selectors(stripped)
    if kf is not None:
        return kf in keyframes_needed
    group = norm(', '.join(selectors))
    if group in used or group in inter:
        return True
    for s in selectors:
        n = norm(s)
        if 'data-theme' in n or 'data-dark' in n:
            return True
        if n in BOOT_CRITICAL:
            return True
        if sel_matches(s):
            return True
    return False


def split_statements(region):
    """Split a CSS region into top-level statements (keeps nesting intact)."""
    stmts = []
    depth = 0
    start = 0
    in_comment = False
    i = 0
    n = len(region)
    while i < n:
        ch = region[i]
        if in_comment:
            if region[i:i + 2] == '*/':
                in_comment = False
                i += 2
                continue
            i += 1
            continue
        if region[i:i + 2] == '/*':
            in_comment = True
            i += 2
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                stmts.append(region[start:i + 1])
                start = i + 1
        i += 1
    tail = region[start:].strip()
    if tail:
        stmts.append(region[start:])
    return stmts


def extract_selectors(body):
    """All selectors in a statement at ANY nesting depth (media blocks etc.)."""
    sels = set()
    head_start = 0
    depth = 0
    i = 0
    n = len(body)
    while i < n:
        ch = body[i]
        if ch == '{':
            head = re.sub(r'/\*.*?\*/', '', body[head_start:i], flags=re.S).strip()
            if head and not head.startswith('@'):
                sels |= {norm(p) for p in statement_selectors(head)[0]}
                head_start = i + 1  # body follows; next head after closing }
            else:
                head_start = i + 1  # at-rule; inner heads start here
            depth += 1
        elif ch == '}':
            depth -= 1
            head_start = i + 1  # next head starts after this close
        i += 1
    return sels


def cascade_closure(critical, deferred):
    """Fix cascade-order flips: if ANY deferred rule sharing a selector with a
    critical rule appears EARLIER in the source, the split document would load
    the deferred rule last and change the winner. Move those deferred statements
    into critical (closure: moving one statement can expose new conflicts).
    """
    cpos = 0
    dpos = 0
    crit_pos = []   # (pos, stmt, selectors)
    def_pos = []    # (pos, stmt, selectors)
    for s in critical:
        p = text.index(s, cpos)
        cpos = p + len(s)
        crit_pos.append((p, s, extract_selectors(s)))
    for s in deferred:
        p = text.index(s, dpos)
        dpos = p + len(s)
        def_pos.append((p, s, extract_selectors(s)))

    crit_sels = {}  # selector -> set of positions
    for p, s, sels in crit_pos:
        for s_ in sels:
            crit_sels.setdefault(s_, set()).add(p)

    moved = set()
    while True:
        to_move = set()
        for idx, (p, s, sels) in enumerate(def_pos):
            if idx in moved:
                continue
            for s_ in sels:
                if s_ in crit_sels and any(pc > p for pc in crit_sels[s_]):
                    to_move.add(idx)
                    break
        if not to_move:
            break
        for idx in to_move:
            moved.add(idx)
            p, s, sels = def_pos[idx]
            for s_ in sels:
                crit_sels.setdefault(s_, set()).add(p)

    new_crit = [critical[i] for i in range(len(critical))] + [def_pos[i][1] for i in sorted(moved)]
    new_def = [def_pos[i][1] for i, (p, s, sels) in enumerate(def_pos) if i not in moved]
    # keep source order within each sheet (positions were recorded in order)
    crit_by_pos = {id(s): p for p, s, sels in crit_pos}
    def_by_pos = {id(s): p for p, s, sels in def_pos}
    new_crit.sort(key=lambda s: crit_by_pos.get(id(s), def_by_pos.get(id(s), 0)))
    new_def.sort(key=lambda s: def_by_pos.get(id(s), 0))
    print(f'cascade closure: moved {len(moved)} deferred statement(s) into critical')
    return new_crit, new_def


VIEWS = [
    ("today",    "setView('today')",    "#view-today"),
    ("week",     "setView('week', 1)",  "#view-week .week-page"),
    ("month",    "openMonth(0)",        "#view-overview .overview-page"),
    ("year",     "setView('year')",     "#view-year .year-page"),
    ("calendar", "setView('calendar')", "#view-calendar .calendar-page"),
    ("habits",   "setView('overview')", "[data-widget-id='habits']"),
]

COMBO_INITS = [
    ("desktop light", {"width": 1280, "height": 800}, ""),
    ("desktop dark",  {"width": 1280, "height": 800}, "localStorage.setItem('planner-dark','1');"),
    ("mobile light",  {"width": 390, "height": 844}, ""),
    ("mobile dark",   {"width": 390, "height": 844}, "localStorage.setItem('planner-dark','1');"),
]

CLOSURE_PROPS = [
    'color', 'background-color', 'display', 'visibility', 'opacity',
    'font-size', 'font-weight', 'line-height', 'text-align',
    'position', 'top', 'left', 'right', 'bottom', 'z-index',
    'border-top-width', 'border-top-style', 'border-top-color', 'border-radius',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'transform', 'box-shadow', 'flex-direction', 'align-items', 'justify-content',
    'grid-template-columns', 'gap', 'width', 'height', 'overflow', 'cursor',
]

CLOSURE_SNAPSHOT = r"""
(props) => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const rec = { sel: (el.id ? '#' + el.id : el.tagName.toLowerCase()) + '.' + [...el.classList].join('.') };
    for (const p of props) rec[p] = cs.getPropertyValue(p);
    out.push(rec);
  }
  return out;
}
"""

CULPRIT_PROBE = r"""
(args) => {
  const idx = args[0], prop = args[1];
  const el = document.querySelectorAll('body *')[idx];
  if (!el) return [];
  // shorthands that can set the longhand prop (e.g. background -> background-color)
  const SH = {
    'background-color': ['background'],
    'border-top-color': ['border', 'border-top', 'border-color'],
    'border-right-color': ['border', 'border-right', 'border-color'],
    'border-bottom-color': ['border', 'border-bottom', 'border-color'],
    'border-left-color': ['border', 'border-left', 'border-color'],
    'border-top-width': ['border', 'border-top', 'border-width'],
    'border-right-width': ['border', 'border-right', 'border-width'],
    'border-bottom-width': ['border', 'border-bottom', 'border-width'],
    'border-left-width': ['border', 'border-left', 'border-width'],
    'border-top-style': ['border', 'border-top', 'border-style'],
    'border-radius': ['border'],
    'padding-top': ['padding', 'padding-block', 'padding-block-start'],
    'padding-right': ['padding', 'padding-inline', 'padding-inline-end'],
    'padding-bottom': ['padding', 'padding-block', 'padding-block-end'],
    'padding-left': ['padding', 'padding-inline', 'padding-inline-start'],
    'margin-top': ['margin', 'margin-block', 'margin-block-start'],
    'margin-right': ['margin', 'margin-inline', 'margin-inline-end'],
    'margin-bottom': ['margin', 'margin-block', 'margin-block-end'],
    'margin-left': ['margin', 'margin-inline', 'margin-inline-start'],
    'top': ['inset', 'inset-block', 'inset-block-start'],
    'right': ['inset', 'inset-inline', 'inset-inline-end'],
    'bottom': ['inset', 'inset-block', 'inset-block-end'],
    'left': ['inset', 'inset-inline', 'inset-inline-start'],
    'overflow': ['overflow-x', 'overflow-y'],
    'gap': ['row-gap', 'column-gap'],
    'flex-direction': ['flex-flow', 'flex'],
    'grid-template-columns': ['grid-template', 'grid'],
  };
  const cands = [prop].concat(SH[prop] || []);
  const out = [];
  for (const sheet of document.styleSheets) {
    if (!sheet.href || !sheet.href.includes('styles-deferred')) continue;
    const walk = (rules, mediaOk) => {
      for (const r of rules) {
        // NOTE: CSSStyleRule also has a (nested-rules) cssRules in modern
        // engines — only recurse when it actually holds inner rules, otherwise
        // we'd skip the rule's own selector.
        if (r.cssRules && r.cssRules.length) {
          let ok = mediaOk;
          if (r.constructor.name === 'CSSMediaRule') {
            try { ok = ok && matchMedia(r.conditionText).matches; } catch (e) {}
          }
          walk(r.cssRules, ok);
          continue;
        }
        if (!r.selectorText || !mediaOk) continue;
        try { if (!el.matches(r.selectorText)) continue; } catch (e) { continue; }
        for (const c of cands) {
          if (r.style.getPropertyValue(c) !== '') { out.push(r.selectorText); break; }
        }
      }
    };
    try { walk(sheet.cssRules, true); } catch (e) {}
  }
  return out;
}
"""


def dom_closure(critical, deferred, max_rounds=12):
    """DOM-driven cascade closure: render every view (baseline = monolithic
    styles.css vs wired = current split) and move any deferred statement whose
    selector matches a diff element and declares the diff property into
    critical. Catches equal-specificity cross-selector flips the static closure
    cannot see (e.g. `.reflection` vs `.week-reflection-card`). Repeats until
    zero diffs or max_rounds.
    """
    import http.server
    import os
    import socketserver
    import threading

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('dom_closure: playwright not available — skipping (run verify-critical-css.py instead)')
        return critical, deferred

    # baseline html: replace the split links with the monolithic readable sheet
    app_html = open('app.html', encoding='utf-8').read()
    split_re = (
        r'<link rel="stylesheet" href="css/styles-critical\.min\.css\?v=\d+" />\s*'
        r'<link rel="stylesheet" href="css/styles-deferred\.min\.css\?v=\d+" media="print" onload="this\.media=\'all\'" />\s*'
        r'<noscript><link rel="stylesheet" href="css/styles-deferred\.min\.css\?v=\d+" /></noscript>'
    )
    wired_html = re.sub(
        split_re,
        '<link rel="stylesheet" href="css/styles-critical.css" />\n  <link rel="stylesheet" href="css/styles-deferred.css" />',
        app_html,
    )
    baseline_html = re.sub(split_re, '<link rel="stylesheet" href="css/styles.css" />', app_html)
    assert 'styles-deferred.css' in wired_html and 'styles.css"' in baseline_html
    open('_closure-wired.html', 'w', encoding='utf-8').write(wired_html)
    open('_closure-baseline.html', 'w', encoding='utf-8').write(baseline_html)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    httpd = socketserver.TCPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base_url = f'http://127.0.0.1:{httpd.server_address[1]}'

    pos_map = {}
    scan = 0
    for s in split_statements(text):
        p = text.index(s, scan)
        scan = p + len(s)
        pos_map.setdefault(s, p)

    def write_split():
        # re-sort by source position BEFORE writing: moved statements appended at
        # the end would otherwise sit after later-source rules in the same sheet
        # and re-invert the cascade (the exact bug round 2 exposed).
        critical.sort(key=lambda s: pos_map.get(s, 0))
        deferred.sort(key=lambda s: pos_map.get(s, 0))
        open(OUT_CRIT, 'w', encoding='utf-8').write(''.join(critical))
        open(OUT_DEF, 'w', encoding='utf-8').write(''.join(deferred))

    def run_round(browser):
        """Return list of (view, idx, prop, culprit_selectors)."""
        findings = []
        for label, viewport, extra in COMBO_INITS:
            kw = dict(viewport=viewport)
            if viewport['width'] < 600:
                kw.update(has_touch=True, is_mobile=True)
            init = "localStorage.setItem('planner-onboarded','1');" + extra

            pg = browser.new_page(**kw)
            pg.emulate_media(reduced_motion='reduce')
            pg.add_init_script(init)
            pg.goto(f'{base_url}/_closure-baseline.html', wait_until='networkidle')
            pg.wait_for_timeout(2500)
            base_snaps = {}
            for vname, expr, wait_sel in VIEWS:
                pg.evaluate(expr)
                if wait_sel:
                    pg.wait_for_selector(wait_sel, state='attached', timeout=5000)
                pg.wait_for_timeout(600)
                base_snaps[vname] = pg.evaluate(CLOSURE_SNAPSHOT, CLOSURE_PROPS)
            pg.close()

            pg2 = browser.new_page(**kw)
            pg2.emulate_media(reduced_motion='reduce')
            pg2.add_init_script(init)
            pg2.goto(f'{base_url}/_closure-wired.html', wait_until='networkidle')
            pg2.wait_for_timeout(2500)
            for vname, expr, wait_sel in VIEWS:
                pg2.evaluate(expr)
                if wait_sel:
                    pg2.wait_for_selector(wait_sel, state='attached', timeout=5000)
                pg2.wait_for_timeout(600)
                a, c = base_snaps[vname], pg2.evaluate(CLOSURE_SNAPSHOT, CLOSURE_PROPS)
                if len(a) != len(c):
                    print(f'  dom_closure [{label} {vname}]: element count mismatch {len(a)} vs {len(c)} — aborting round')
                    continue
                for i, (ra, rc) in enumerate(zip(a, c)):
                    for prop in CLOSURE_PROPS:
                        if ra[prop] != rc[prop]:
                            sels = pg2.evaluate(CULPRIT_PROBE, [i, prop])
                            findings.append((vname, i, prop, sels))
            pg2.close()
        return findings

    moved_total = 0
    with sync_playwright() as p:
        b = p.chromium.launch()
        for rnd in range(1, max_rounds + 1):
            write_split()
            findings = run_round(b)
            if not findings:
                print(f'dom closure: round {rnd} — 0 diffs, converged')
                break
            culprits = set()
            for vname, idx, prop, sels in findings:
                if not sels:
                    print(f'  dom_closure: diff on {vname}[{idx}].{prop} with no deferred culprit selector')
                    continue
                for sel in sels:
                    n = norm(sel)
                    for i, stmt in enumerate(deferred):
                        if n in extract_selectors(stmt):
                            culprits.add(i)
            if not culprits:
                print(f'dom closure: round {rnd} — {len(findings)} diffs but no deferred statements matched; aborting')
                break
            moved = sorted(culprits)
            moved_stmts = [deferred[i] for i in moved]
            deferred = [s for i, s in enumerate(deferred) if i not in culprits]
            critical.extend(moved_stmts)
            moved_total += len(moved)
            print(f'dom closure: round {rnd} — {len(findings)} diffs, moved {len(moved)} deferred statement(s) into critical')
        b.close()

    # restore source order within each sheet. Key positions by statement TEXT
    # (statements are byte-identical slices of the source, so text keys survive
    # object identity) — the first source occurrence of each is its position.
    pos_map = {}
    scan = 0
    for s in split_statements(text):
        p = text.index(s, scan)
        scan = p + len(s)
        pos_map.setdefault(s, p)
    critical.sort(key=lambda s: pos_map.get(s, 0))
    deferred.sort(key=lambda s: pos_map.get(s, 0))
    write_split()
    print(f'dom closure: total {moved_total} deferred statement(s) moved into critical')
    for tmp in ('_closure-wired.html', '_closure-baseline.html'):
        try:
            os.remove(tmp)
        except OSError:
            pass
    return critical, deferred


def main():
    stmts = split_statements(text)
    critical = []
    deferred = []
    for s in stmts:
        (critical if classify(s) else deferred).append(s)

    critical, deferred = cascade_closure(critical, deferred)
    critical, deferred = dom_closure(critical, deferred)

    crit_text = (
        '/* ============================================================\n'
        '   styles-critical.css — boot-critical subset of styles.css\n'
        '   Generated: kept rules match the boot DOM (Today + shell + modals)\n'
        '   at desktop AND mobile, plus theme/dark selectors (old variable\n'
        '   system consumed by the app) and referenced keyframes.\n'
        '   SYNC DISCIPLINE: when editing styles.css, re-run\n'
        '   scripts/_measure_used_css.py + scripts/_split_css.py (or keep new\n'
        '   rules in both files), then python scripts/minify.py and bump the\n'
        '   ?v= in app.html + sw.js CACHE.\n'
        '   ============================================================ */\n\n'
    ) + ''.join(critical)
    def_text = (
        '/* ============================================================\n'
        '   styles-deferred.css — non-boot-critical remainder of styles.css\n'
        '   (loaded after first paint; precached in the service worker).\n'
        '   ============================================================ */\n\n'
    ) + ''.join(deferred)

    open(OUT_CRIT, 'w', encoding='utf-8').write(crit_text)
    open(OUT_DEF, 'w', encoding='utf-8').write(def_text)
    print(f'styles.css          : {len(text.encode("utf-8")):>7d} bytes, {len(stmts)} statements')
    print(f'styles-critical.css : {len(crit_text.encode("utf-8")):>7d} bytes, {len(critical)} statements')
    print(f'styles-deferred.css : {len(def_text.encode("utf-8")):>7d} bytes, {len(deferred)} statements')
    print(f'keyframes kept      : {sorted(keyframes_needed)}')


if __name__ == '__main__':
    main()
