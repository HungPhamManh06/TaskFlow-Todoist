#!/usr/bin/env python3
"""P7 dark-mode contrast audit — component level, 4 themes x dark.

Measures REAL computed styles (not tokens) for the components polished in
P2-P6 and reports anything below WCAG AA (4.5:1 text, 3:1 non-text).
"""
import http.server
import os
import socketserver
import threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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


def audit_app(page, theme):
    """Rendered but unused helper — real audit happens in main()."""
    page.goto(f"{base}/app.html?view=today", wait_until="networkidle")
    page.evaluate("() => { if (window.setView) window.setView('overview'); }")
    page.wait_for_timeout(400)
    page.evaluate("() => { if (window.setView) window.setView('today'); }")
    page.wait_for_timeout(400)


def main():
    global base
    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            # ---- App ----
            for theme in THEMES:
                ctx = browser.new_context(viewport={"width": 390, "height": 844})
                page = ctx.new_page()
                page.add_init_script(
                    "localStorage.setItem('planner-onboarded','1');"
                    f"localStorage.setItem('planner-theme','{theme}');"
                    "localStorage.setItem('planner-dark','1');"
                )
                page.goto(f"{base}/app.html?view=today", wait_until="networkidle")
                page.wait_for_timeout(600)
                # Seed a mood selection + a done task so the polished states exist
                try:
                    page.evaluate("() => { const b = document.querySelector('.reflect-mood-btn'); if (b) b.click(); }")
                    page.wait_for_timeout(150)
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
                ctx.close()

            # ---- Landing ----
            for theme in THEMES:
                ctx = browser.new_context(viewport={"width": 1280, "height": 800})
                page = ctx.new_page()
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
