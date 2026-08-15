#!/usr/bin/env python3
"""P7 dark-mode contrast audit — component level, 4 themes x dark.

Measures REAL computed styles (not tokens) for the components polished in
P2-P6 and reports anything below WCAG AA (4.5:1 text, 3:1 non-text).
"""
import argparse
import http.server
import os
import socketserver
import threading
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Keep every audited app context in the same local month. August 15 is a
# Saturday, so navigating to August 1 selects a week containing muted July days.
FIXED_LOCAL_ISO = "2026-08-15T10:00:00"
FIXED_DATE_SCRIPT = """(() => {
  const RealDate = window.Date;
  const fixedEpoch = new RealDate('""" + FIXED_LOCAL_ISO + """').getTime();
  const FixedDate = new Proxy(RealDate, {
    construct(target, args, newTarget) {
      return Reflect.construct(target, args.length ? args : [fixedEpoch], newTarget);
    },
    apply() {
      return new RealDate(fixedEpoch).toString();
    },
    get(target, prop) {
      if (prop === 'now') return () => fixedEpoch;
      return Reflect.get(target, prop, target);
    },
  });
  window.Date = FixedDate;
})();
"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *args):
        pass


def ratio(a, b):
    def lum(rgb):
        def f(c):
            c /= 255
            return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
        r, g, bl = [f(x) for x in rgb]
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def parse_color(s):
    s = s.strip()
    if s.startswith("rgb("):
        s = s[4:-1]
    elif s.startswith("rgba("):
        s = s[5:-1]
    else:
        return None
    parts = [p.strip() for p in s.split(",")]
    try:
        return tuple(int(p) for p in parts[:3])
    except ValueError:
        return None


FAILS = []


def check(theme, label, fg_rgb, bg_rgb, need, note=""):
    if fg_rgb is None or bg_rgb is None:
        FAILS.append((theme, label, "MISSING", "", note))
        return
    r = ratio(fg_rgb, bg_rgb)
    if r < need:
        FAILS.append((theme, label, round(r, 2), need, note))
        return
    print(f"  [PASS] {theme} {label}: {r:.2f}:1{('  ' + note) if note else ''}")


THEMES = ["cream", "mint", "lavender", "peach"]

# (label, fg_js, bg_js, need) — fg_js/bg_js are page-side expressions resolving
# to a single element whose computed color we read; for non-text we still use
# color/bg but compare element bg against the surface behind it.
PAIRS_APP = [
    # (label, fg_selector, bg_selector, prop_fg, prop_bg, need)
    # Buttons
    ("primary btn text/bg", ".app-primary-action.button-primary",
     ".app-primary-action.button-primary", "color", "backgroundColor", 4.5),
    # Inputs
    ("reflect-input text/bg", ".reflect-input[data-reflect-field=quickGood]",
     ".reflect-input[data-reflect-field=quickGood]", "color", "backgroundColor", 4.5),
    ("reflect-input improve text/bg", ".reflect-input[data-reflect-field=quickImprove]",
     ".reflect-input[data-reflect-field=quickImprove]", "color", "backgroundColor", 4.5),
    # Card text
    ("today-card title/surface", ".today-card-title", ".today-reflection-card",
     "color", "backgroundColor", 4.5),
    # Mood row (non-text 3:1)
    ("mood btn on/accent-soft", ".reflect-mood-btn.on", ".reflect-mood-btn.on",
     "color", "backgroundColor", 3.0),
    # Muted text on surface
    ("muted text/surface", ".app-period", ".app-period",
     "color", "backgroundColor", 4.5),
    # Completed task sage text on surface
    ("done task text/surface", ".today-task.done .task-text", ".today-task.done",
     "color", "backgroundColor", 4.5),
]

PAIRS_APP_OVERVIEW = [
    # Pillars — border accent vs card bg (non-text 3:1)
    ("pillar p1 border/surface", ".pillar-card[data-pillar-id=p1]",
     ".pillar-card[data-pillar-id=p1]", "borderInlineStartColor", "backgroundColor", 3.0),
    ("pillar p2 border/surface", ".pillar-card[data-pillar-id=p2]",
     ".pillar-card[data-pillar-id=p2]", "borderInlineStartColor", "backgroundColor", 3.0),
    ("pillar p3 border/surface", ".pillar-card[data-pillar-id=p3]",
     ".pillar-card[data-pillar-id=p3]", "borderInlineStartColor", "backgroundColor", 3.0),
    ("pillar-focus-input text/bg", ".pillar-focus-input",
     ".pillar-focus-input", "color", "backgroundColor", 4.5),
    ("pillar name text/bg", ".pillar-name", ".pillar-card",
     "color", "backgroundColor", 4.5),
    # Heatmap cells vs card bg (non-text 3:1) — l1 weakest
    ("heatmap l1/card", ".hm-rb-cell.hm-l1", ".habit-heat-card",
     "backgroundColor", "backgroundColor", 3.0),
    ("heatmap l5/card", ".hm-rb-cell.hm-l5", ".habit-heat-card",
     "backgroundColor", "backgroundColor", 3.0),
    ("heatmap l1 vs surface-muted", ".hm-rb-cell.hm-l1", ".habit-heat-card",
     "backgroundColor", "backgroundColor", 3.0),
]

PAIRS_LANDING = [
    ("landing primary text/bg", ".button-primary", ".button-primary",
     "color", "backgroundColor", 4.5),
    ("landing skip text/bg", ".landing-skip", ".landing-skip",
     "color", "backgroundColor", 4.5),
    ("feature-accent text/bg", ".feature-card-accent", ".feature-card-accent",
     "color", "backgroundColor", 4.5),
    ("cta-final text/bg", ".landing-cta-final", ".landing-cta-final",
     "color", "backgroundColor", 4.5),
    ("cta-final eyebrow/bg", ".landing-cta-final .eyebrow", ".landing-cta-final",
     "color", "backgroundColor", 4.5),
    ("hero lead/canvas", ".hero-lead", "body",
     "color", "backgroundColor", 4.5),
    ("footer text/sidebar", ".landing-footer p", ".landing-footer",
     "color", "backgroundColor", 4.5),
]

PAIRS_SCHEDULE = [
    ("schedule nav date", ".tb-nav-date", ".tb-schedule", "color", "backgroundColor", 4.5),
    ("schedule nav button", ".tb-nav-btn", ".tb-nav-btn", "color", "backgroundColor", 4.5),
    ("schedule nav button border", ".tb-nav-btn", ".tb-nav-btn", "borderTopColor", "backgroundColor", 3.0),
    ("schedule day weekday", ".tb-day.selected .tb-day-wd", ".tb-day.selected", "color", "backgroundColor", 4.5),
    ("schedule day date", ".tb-day.selected .tb-day-n", ".tb-day.selected", "color", "backgroundColor", 4.5),
    ("schedule muted weekday", ".tb-day.muted .tb-day-wd", ".tb-day.muted", "color", "backgroundColor", 4.5),
    ("schedule muted date", ".tb-day.muted .tb-day-n", ".tb-day.muted", "color", "backgroundColor", 4.5),
    ("schedule selected day border", ".tb-day.selected", ".tb-day.selected", "borderTopColor", "backgroundColor", 3.0),
    ("schedule unscheduled heading", ".tb-uns-heading", ".tb-unscheduled", "color", "backgroundColor", 4.5),
    ("schedule unscheduled count", ".tb-uns-count", ".tb-unscheduled", "color", "backgroundColor", 4.5),
    ("schedule unscheduled row text", ".tb-uns-text", ".tb-uns-row", "color", "backgroundColor", 4.5),
    ("schedule unscheduled duration", ".tb-uns-dur", ".tb-uns-row", "color", "backgroundColor", 4.5),
    ("schedule quick button text", ".tb-uns-btn", ".tb-uns-btn", "color", "backgroundColor", 4.5),
    ("schedule quick button border", ".tb-uns-btn", ".tb-uns-btn", "borderTopColor", "backgroundColor", 3.0),
    ("schedule disclosure text", ".tb-uns-toggle", ".tb-uns-toggle", "color", "backgroundColor", 4.5),
    ("schedule disclosure border", ".tb-uns-toggle", ".tb-uns-toggle", "borderTopColor", "backgroundColor", 3.0),
    ("schedule regular dot", ".tb-uns-dot.regular", ".tb-uns-row", "backgroundColor", "backgroundColor", 3.0),
    ("schedule priority dot", ".tb-uns-dot.priority", ".tb-uns-row", "backgroundColor", "backgroundColor", 3.0),
    ("schedule hour label", ".tb-hour", ".tb-timeline-wrap", "color", "backgroundColor", 4.5),
    ("schedule block time", ".tb-block-time", ".tb-block", "color", "backgroundColor", 4.5),
    ("schedule block text", ".tb-block-text", ".tb-block", "color", "backgroundColor", 4.5),
    ("schedule block accent", ".tb-block", ".tb-block", "borderInlineStartColor", "backgroundColor", 3.0),
    ("schedule planned status", ".tb-status-planned .tb-block-status", ".tb-status-planned", "color", "backgroundColor", 4.5),
    ("schedule completed time", ".tb-status-completed .tb-block-time", ".tb-status-completed", "color", "backgroundColor", 4.5),
    ("schedule completed text", ".tb-status-completed .tb-block-text", ".tb-status-completed", "color", "backgroundColor", 4.5),
    ("schedule completed status", ".tb-status-completed .tb-block-status", ".tb-status-completed", "color", "backgroundColor", 4.5),
    ("schedule completed border", ".tb-status-completed", ".tb-status-completed", "borderInlineStartColor", "backgroundColor", 3.0),
    ("schedule cancelled time", ".tb-status-cancelled .tb-block-time", ".tb-status-cancelled", "color", "backgroundColor", 4.5),
    ("schedule cancelled text", ".tb-status-cancelled .tb-block-text", ".tb-status-cancelled", "color", "backgroundColor", 4.5),
    ("schedule cancelled status", ".tb-status-cancelled .tb-block-status", ".tb-status-cancelled", "color", "backgroundColor", 4.5),
    ("schedule cancelled border", ".tb-status-cancelled", ".tb-status-cancelled", "borderInlineStartColor", "backgroundColor", 3.0),
    ("schedule overlap warning", ".tb-overlap-note", ".tb-overlap-note", "color", "backgroundColor", 4.5),
]

PAIRS_SCHEDULE_DIALOG = [
    ("schedule dialog warning", ".tb-dialog-warn", ".tb-dialog-warn", "color", "backgroundColor", 4.5),
]


def install_source_assets(page):
    """Serve authored assets while release bundles are intentionally stale.

    This is opt-in for RED/GREEN development only. The default audit continues
    to exercise app.html's production/minified asset graph for the release gate.
    """
    def route_source(route):
        request_path = urlparse(route.request.url).path.lstrip("/")
        if request_path == "css/styles-critical.min.css":
            route.fulfill(path=str(Path(ROOT, "css", "styles.css")), content_type="text/css")
            return
        if request_path == "css/styles-deferred.min.css":
            route.fulfill(body="", content_type="text/css")
            return
        source_path = request_path.replace(".min.css", ".css").replace(".min.js", ".js")
        candidate = Path(ROOT, source_path)
        if candidate.is_file():
            content_type = "text/css" if candidate.suffix == ".css" else "text/javascript"
            route.fulfill(path=str(candidate), content_type=content_type)
            return
        route.continue_()

    page.route("**/*.min.css*", route_source)
    page.route("**/*.min.js*", route_source)


def freeze_browser_date(page):
    page.add_init_script(FIXED_DATE_SCRIPT)


def seed_schedule(page):
    seed_script = """(() => {
      const now = new Date();
      const year = now.getFullYear(), month = now.getMonth();
      const key = 'planner-' + year + '-' + (month + 1);
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const numWeeks = Math.ceil((offset + daysInMonth) / 7);
      const weeks = Array.from({ length: numWeeks }, (_, w) => ({
        n: w + 1, goals: [], days: Array.from({ length: 7 }, () => ({ tasks: [] }))
      }));
      const dayState = weeks[0].days[offset];
      dayState.tasks = [
        { uid: 'contrast-priority', kind: 'priority', done: false, text: 'Priority unscheduled task', duration: 45, tags: [] },
        { uid: 'contrast-regular-1', kind: 'regular', done: false, text: 'Regular unscheduled task one', duration: 30, tags: [] },
        { uid: 'contrast-regular-2', kind: 'regular', done: false, text: 'Regular unscheduled task two', duration: 25, tags: [] },
        { uid: 'contrast-regular-3', kind: 'regular', done: false, text: 'Regular unscheduled task three', duration: 20, tags: [] },
        { uid: 'contrast-regular-4', kind: 'regular', done: false, text: 'Regular unscheduled task four', duration: 15, tags: [] },
        { uid: 'contrast-regular-5', kind: 'regular', done: false, text: 'Regular unscheduled task five', duration: 10, tags: [] },
        { uid: 'contrast-planned', kind: 'regular', done: false, text: 'Planned contrast task', duration: 60, tags: [] },
        { uid: 'contrast-completed', kind: 'regular', done: false, text: 'Completed block contrast task', duration: 60, tags: [] },
      ];
      localStorage.setItem(key, JSON.stringify({
        version: 1, schemaVersion: 2, monthKey: key, weeks, pillars: [], habits: [], monthlyGoals: []
      }));
      const iso = year + '-' + String(month + 1).padStart(2, '0') + '-01';
      localStorage.setItem('planner-timeblocks', JSON.stringify({ version: 1, blocks: [
        { id: 'contrast-planned-block', taskUid: 'contrast-planned', date: iso, start: '09:00', end: '10:00', status: 'planned', createdAt: '', updatedAt: '' },
        { id: 'contrast-completed-block', taskUid: 'contrast-completed', date: iso, start: '09:30', end: '10:30', status: 'completed', createdAt: '', updatedAt: '' },
        { id: 'contrast-cancelled-block', taskUid: null, date: iso, start: '11:00', end: '12:00', status: 'cancelled', createdAt: '', updatedAt: '' },
      ] }));
    })()"""
    # One init script guarantees the clock is frozen before seed code reads Date.
    page.add_init_script(FIXED_DATE_SCRIPT + seed_script)


def computed_pair(page, fg_selector, bg_selector, fg_prop, bg_prop):
    return page.evaluate("""([fgSelector, bgSelector, fgProp, bgProp]) => {
      const parse = (value) => {
        const nums = String(value || '').match(/[\\d.]+/g);
        if (!nums || nums.length < 3) return null;
        const srgb = String(value).startsWith('color(srgb ');
        const scale = srgb ? 255 : 1;
        return [Number(nums[0]) * scale, Number(nums[1]) * scale, Number(nums[2]) * scale, nums.length > 3 ? Number(nums[3]) : 1];
      };
      const over = (fg, bg) => {
        const a = fg[3] + bg[3] * (1 - fg[3]);
        if (!a) return [0, 0, 0, 0];
        return [
          (fg[0] * fg[3] + bg[0] * bg[3] * (1 - fg[3])) / a,
          (fg[1] * fg[3] + bg[1] * bg[3] * (1 - fg[3])) / a,
          (fg[2] * fg[3] + bg[2] * bg[3] * (1 - fg[3])) / a,
          a
        ];
      };
      const background = (el) => {
        let result = [0, 0, 0, 0];
        for (let node = el; node; node = node.parentElement) {
          const layer = parse(getComputedStyle(node).backgroundColor);
          if (layer) result = over(result, layer);
          if (result[3] >= .999) break;
        }
        if (result[3] < .999) result = over(result, [255, 255, 255, 1]);
        return result;
      };
      const fgEl = document.querySelector(fgSelector);
      const bgEl = document.querySelector(bgSelector);
      if (!fgEl || !bgEl) return [null, null];
      const bg = bgProp === 'backgroundColor'
        ? background(bgEl)
        : parse(getComputedStyle(bgEl)[bgProp]);
      let fg = parse(getComputedStyle(fgEl)[fgProp]);
      if (!fg || !bg) return [null, null];
      let opacity = 1;
      for (let node = fgEl; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity || 1);
      fg[3] *= opacity;
      const effectiveFg = over(fg, bg);
      return [effectiveFg.slice(0, 3), bg.slice(0, 3)];
    }""", [fg_selector, bg_selector, fg_prop, bg_prop])


def open_schedule_fixture(page):
    page.wait_for_selector('[data-testid="calendar-view"]', state="visible")
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').click()
    page.wait_for_selector('[data-testid="schedule-view"]', state="visible")
    days_back = page.evaluate("new Date().getDate() - 1")
    for _ in range(days_back):
        page.locator('.tb-nav-btn[data-action="tb-prev"]').click()
    page.wait_for_timeout(250)

    fixed_local = page.evaluate("""() => {
      const d = new Date();
      return [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()].join('-');
    }""")
    assert fixed_local == "2026-7-15-10", "Schedule fixture requires the frozen local audit date"
    assert page.locator('.tb-day.selected').count() == 1, "Schedule fixture requires exactly one selected day"
    assert page.locator('.tb-day.muted').count() >= 1, "Schedule fixture requires an out-of-month muted day"
    assert page.locator('[data-testid="tb-timeline"]').count() == 1, "Schedule fixture requires one timeline"
    assert page.locator('.tb-hour').count() == 24, "Schedule fixture requires all 24 hour labels"
    assert page.locator('.tb-block').count() == 3, "Schedule fixture requires exactly planned/completed/cancelled blocks"
    assert page.locator('.tb-status-planned').count() == 1, "Schedule fixture requires one planned block"
    assert page.locator('.tb-status-completed').count() == 1, "Schedule fixture requires one completed block"
    assert page.locator('.tb-status-cancelled').count() == 1, "Schedule fixture requires one cancelled block"
    assert page.locator('.tb-overlap-note').count() == 1, "Schedule fixture requires an overlap warning"
    assert page.locator('.tb-uns-dot.regular').count() >= 3, "Schedule fixture requires at least three visible regular tasks"
    assert page.locator('.tb-uns-dot.priority').count() >= 1, "Schedule fixture requires a visible priority task"
    assert page.locator('.tb-uns-btn').count() >= 4, "Schedule fixture requires Quick Schedule buttons"
    assert page.locator('.tb-uns-toggle').count() == 1, "Schedule fixture requires one disclosure button"


def audit_pairs(page, theme, pairs):
    for label, fg_sel, bg_sel, fg_prop, bg_prop, need in pairs:
        try:
            fg_rgb, bg_rgb = computed_pair(page, fg_sel, bg_sel, fg_prop, bg_prop)
            check(theme, label, fg_rgb, bg_rgb, need)
        except Exception as e:
            check(theme, label, None, None, need, f"eval error {e}")


def reveal_dialog_warning(page):
    page.locator('[data-action="tb-add"]').click()
    page.wait_for_selector('[data-testid="timeblock-modal"]', state="visible")
    warning = page.locator('.tb-dialog-warn')
    warning.evaluate("el => { el.hidden = false; el.textContent = 'Overlapping time block'; }")
    assert warning.is_visible(), "Schedule fixture requires a visible dialog warning"
    page.wait_for_timeout(300)


def audit_app(page, theme):
    """Rendered but unused helper — real audit happens in main()."""
    page.goto(f"{base}/app.html?view=today", wait_until="networkidle")
    page.evaluate("() => { if (window.setView) window.setView('overview'); }")
    page.wait_for_timeout(400)
    page.evaluate("() => { if (window.setView) window.setView('today'); }")
    page.wait_for_timeout(400)


def main():
    global base
    parser = argparse.ArgumentParser(description="Audit TaskFlow dark-mode contrast")
    parser.add_argument(
        "--source-assets", action="store_true",
        help="audit authored CSS/JS before production bundles are regenerated",
    )
    args = parser.parse_args()
    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            # ---- App ----
            for theme in THEMES:
                ctx = browser.new_context(
                    viewport={"width": 390, "height": 844},
                    service_workers="block" if args.source_assets else "allow",
                )
                page = ctx.new_page()
                if args.source_assets:
                    install_source_assets(page)
                freeze_browser_date(page)
                page.add_init_script(
                    "localStorage.setItem('planner-onboarded','1');"
                    f"localStorage.setItem('planner-theme','{theme}');"
                    "localStorage.setItem('planner-dark','1');"
                )
                page.goto(f"{base}/app.html?view=today", wait_until="networkidle")
                page.wait_for_timeout(600)
                # Seed a mood selection + a real done task so the polished states exist
                # (Today has no pre-seeded blank rows since P0.2C — create one via the
                # real add flow, type text, then toggle done).
                try:
                    page.evaluate("() => { const b = document.querySelector('.reflect-mood-btn'); if (b) b.click(); }")
                    page.wait_for_timeout(150)
                    page.locator('[data-action="today-addtask"]').first.click()
                    page.wait_for_timeout(200)
                    editor = page.locator('[data-role="task-text"]').last
                    editor.click()
                    editor.fill("Contrast seed task")
                    page.locator("body").click(position={"x": 700, "y": 500}, force=True)
                    page.wait_for_timeout(250)
                    page.evaluate("() => { const cb = document.querySelector('.today-task [data-action=task]'); if (cb) cb.click(); }")
                    page.wait_for_timeout(150)
                except Exception:
                    pass
                print(f"\n== app · {theme} dark (today) ==")
                for label, fg_sel, bg_sel, fg_prop, bg_prop, need in PAIRS_APP:
                    try:
                        fg_rgb = page.evaluate(
                            "([s, prop]) => { const el = document.querySelector(s); "
                            "return el ? getComputedStyle(el)[prop] : null }", [fg_sel, fg_prop])
                        bg_rgb = page.evaluate(
                            "([s, prop]) => { const el = document.querySelector(s); "
                            "return el ? getComputedStyle(el)[prop] : null }", [bg_sel, bg_prop])
                        check(theme, label, parse_color(fg_rgb), parse_color(bg_rgb), need)
                    except Exception as e:
                        check(theme, label, None, None, need, f"eval error {e}")
                # Overview: pillars + heatmap
                page.evaluate("() => { if (window.setView) window.setView('overview'); }")
                page.wait_for_timeout(600)
                print(f"== app · {theme} dark (overview) ==")
                for label, fg_sel, bg_sel, fg_prop, bg_prop, need in PAIRS_APP_OVERVIEW:
                    try:
                        fg_rgb = page.evaluate(
                            "([s, prop]) => { const el = document.querySelector(s); "
                            "return el ? getComputedStyle(el)[prop] : null }", [fg_sel, fg_prop])
                        bg_rgb = page.evaluate(
                            "([s, prop]) => { const el = document.querySelector(s); "
                            "return el ? getComputedStyle(el)[prop] : null }", [bg_sel, bg_prop])
                        check(theme, label, parse_color(fg_rgb), parse_color(bg_rgb), need)
                    except Exception as e:
                        check(theme, label, None, None, need, f"eval error {e}")

                seed_schedule(page)
                page.goto(f"{base}/app.html?view=calendar", wait_until="networkidle")
                open_schedule_fixture(page)
                print(f"== app · {theme} dark (schedule) ==")
                audit_pairs(page, theme, PAIRS_SCHEDULE)
                ctx.close()

            # ---- Cream light Schedule: warnings and status hierarchy ----
            ctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                service_workers="block" if args.source_assets else "allow",
            )
            page = ctx.new_page()
            if args.source_assets:
                install_source_assets(page)
            freeze_browser_date(page)
            page.add_init_script(
                "localStorage.setItem('planner-onboarded','1');"
                "localStorage.setItem('planner-theme','cream');"
                "localStorage.setItem('planner-dark','0');"
            )
            seed_schedule(page)
            page.goto(f"{base}/app.html?view=calendar", wait_until="networkidle")
            open_schedule_fixture(page)
            print("\n== app · cream light (schedule) ==")
            audit_pairs(page, "cream-light", PAIRS_SCHEDULE)
            reveal_dialog_warning(page)
            audit_pairs(page, "cream-light", PAIRS_SCHEDULE_DIALOG)
            ctx.close()

            # ---- Landing ----
            for theme in THEMES:
                ctx = browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    service_workers="block" if args.source_assets else "allow",
                )
                page = ctx.new_page()
                if args.source_assets:
                    install_source_assets(page)
                page.add_init_script(
                    f"localStorage.setItem('planner-theme','{theme}');"
                    "localStorage.setItem('planner-dark','1');"
                )
                page.goto(f"{base}/index.html?qa=contrast", wait_until="networkidle")
                page.wait_for_timeout(500)
                print(f"\n== landing · {theme} dark ==")
                for label, fg_sel, bg_sel, fg_prop, bg_prop, need in PAIRS_LANDING:
                    try:
                        fg_rgb = page.evaluate(
                            "([s, prop]) => { const el = document.querySelector(s); "
                            "return el ? getComputedStyle(el)[prop] : null }", [fg_sel, fg_prop])
                        bg_rgb = page.evaluate(
                            "([s, prop]) => { const el = document.querySelector(s); "
                            "return el ? getComputedStyle(el)[prop] : null }", [bg_sel, bg_prop])
                        check(theme, label, parse_color(fg_rgb), parse_color(bg_rgb), need)
                    except Exception as e:
                        check(theme, label, None, None, need, f"eval error {e}")
                ctx.close()
            browser.close()
    finally:
        httpd.shutdown()

    print("\n" + "=" * 64)
    if FAILS:
        print(f"FAILURES: {len(FAILS)}")
        for theme, label, got, need, note in FAILS:
            print(f"  [{theme}] {label}: {got} < {need} {note}")
        raise SystemExit(1)
    print("ALL CONTRAST CHECKS PASS (4 themes x dark)")


if __name__ == "__main__":
    main()
