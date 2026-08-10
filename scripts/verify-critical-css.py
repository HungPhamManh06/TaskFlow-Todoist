"""Verify the critical-CSS split end to end, across every app view.

For each combo (viewport x dark x theme) and each view (today, week, month,
year, calendar, habits):
  - baseline page: a copy of app.html with the original synchronous
    styles.min.css link (deferred swap disabled) — represents the pre-change
    rendering.
  - wired page: the real app.html (styles-critical sync + styles-deferred
    deferred via media=print onload swap).
The view is opened the same way in both pages and computed styles of every
element are compared after the deferred sheet applies. This catches cascade
order flips like the week-view regression (deferred base rule overriding a
critical mobile override) that only appear in non-boot views.
"""
import http.server
import os
import re
import socketserver
import threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{httpd.server_address[1]}"

PROPS = [
    'color', 'background-color', 'display', 'visibility', 'opacity',
    'font-size', 'font-weight', 'font-family', 'line-height', 'text-align',
    'position', 'top', 'left', 'right', 'bottom', 'z-index',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-top-color', 'border-radius',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'transform', 'box-shadow', 'flex-direction', 'align-items', 'justify-content',
    'grid-template-columns', 'gap', 'width', 'height', 'overflow', 'cursor',
]

SNAPSHOT = r"""
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

# Every view the app can render, opened through the same globals the UI uses.
# (There is no standalone "month" view: openMonth() renders the overview for
# that month, which is also where the habits widget lives.)
VIEWS = [
    ("today",    "setView('today')",    "#view-today"),
    ("week",     "setView('week', 1)",  "#view-week .week-page"),
    ("month",    "openMonth(0)",        "#view-overview .overview-page"),
    ("year",     "setView('year')",     "#view-year .year-page"),
    ("calendar", "setView('calendar')", "#view-calendar .calendar-page"),
    ("habits",   "setView('overview')", "[data-widget-id='habits']"),
]


def snapshot(pg):
    pg.wait_for_timeout(600)
    return pg.evaluate(SNAPSHOT, PROPS)


def open_view(pg, expr, wait_sel):
    pg.evaluate(expr)
    if wait_sel:
        pg.wait_for_selector(wait_sel, state="attached", timeout=5000)


# baseline HTML: replace the split (styles-critical sync + styles-deferred
# async) with the ORIGINAL monolithic styles.min.css sync link. That is the
# true pre-change cascade in source order — the split's whole risk is that the
# deferred sheet loads LAST and can override critical rules, and only comparing
# against the original sheet can catch that (a deferred-made-sync baseline keeps
# the split's order and silently passes).
app_html = open('app.html', encoding='utf-8').read()
baseline_html = re.sub(
    r'<link rel="stylesheet" href="css/styles-critical\.min\.css\?v=\d+" />\s*<link rel="stylesheet" href="css/styles-deferred\.min\.css\?v=\d+" media="print" onload="this\.media=\'all\'" />\s*<noscript><link rel="stylesheet" href="css/styles-deferred\.min\.css\?v=\d+" /></noscript>',
    '<link rel="stylesheet" href="css/styles.min.css?v=1" />',
    app_html,
)
assert 'styles.min.css?v=1' in baseline_html, "baseline styles.min.css link not inserted"
open('_baseline-app.html', 'w', encoding='utf-8').write(baseline_html)


def run_combo(b, label, viewport, extra_init):
    kw = dict(viewport=viewport)
    if viewport["width"] < 600:
        kw.update(has_touch=True, is_mobile=True)
    init = "localStorage.setItem('planner-onboarded','1');" + extra_init

    pg = b.new_page(**kw)
    pg.emulate_media(reduced_motion="reduce")
    pg.add_init_script(init)
    pg.goto(f"{base}/_baseline-app.html", wait_until="networkidle")
    # FABs tuck toward an edge after a 2.2s idle timeout (fab.js) — settle past it
    # so both pages snapshot the same tucked state instead of racing it.
    pg.wait_for_timeout(2500)
    base_snaps = {}
    for vname, expr, wait_sel in VIEWS:
        open_view(pg, expr, wait_sel)
        base_snaps[vname] = snapshot(pg)
    pg.close()

    pg2 = b.new_page(**kw)
    pg2.emulate_media(reduced_motion="reduce")
    pg2.add_init_script(init)
    pg2.goto(f"{base}/app.html", wait_until="networkidle")
    pg2.wait_for_timeout(2500)
    wired_snaps = {}
    for vname, expr, wait_sel in VIEWS:
        open_view(pg2, expr, wait_sel)
        wired_snaps[vname] = snapshot(pg2)
    pg2.close()

    diffs = []
    for vname in base_snaps:
        a, c = base_snaps[vname], wired_snaps[vname]
        if len(a) != len(c):
            diffs.append((vname, f"<element-count-mismatch base={len(a)} wired={len(c)}>", "", ""))
            continue
        for base_rec, wired_rec in zip(a, c):
            for prop in PROPS:
                if base_rec[prop] != wired_rec[prop]:
                    diffs.append((vname, base_rec['sel'], prop, base_rec[prop], wired_rec[prop]))
    print(f"[{label}] diffs: {len(diffs)}")
    for d in diffs[:20]:
        print(f"    {d}")
    return len(diffs)


with sync_playwright() as p:
    b = p.chromium.launch()
    total = 0
    total += run_combo(b, "desktop light cream", {"width": 1280, "height": 800}, "")
    total += run_combo(b, "desktop dark cream  ", {"width": 1280, "height": 800}, "localStorage.setItem('planner-dark','1');")
    total += run_combo(b, "desktop light mint   ", {"width": 1280, "height": 800}, "localStorage.setItem('planner-theme','mint');")
    total += run_combo(b, "desktop dark mint    ", {"width": 1280, "height": 800}, "localStorage.setItem('planner-dark','1');localStorage.setItem('planner-theme','mint');")
    total += run_combo(b, "mobile light cream   ", {"width": 390, "height": 844}, "")
    total += run_combo(b, "mobile dark mint     ", {"width": 390, "height": 844}, "localStorage.setItem('planner-dark','1');localStorage.setItem('planner-theme','mint');")
    b.close()

os.remove('_baseline-app.html')
print("TOTAL DIFFS:", total)
raise SystemExit(0 if total == 0 else 1)
