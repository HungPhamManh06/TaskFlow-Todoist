"""Release DOM audit for TaskFlow landing and application surfaces."""
import http.server
import os
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def page_audit(page, label, main_selector):
    result = page.evaluate(
        """mainSelector => {
          const visible = element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          };
          const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
          const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
          const controls = [...document.querySelectorAll('button, input, select, textarea')].filter(visible);
          const unnamedControls = controls.filter(control => {
            if (control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) return false;
            if (control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`)) return false;
            if (control.closest('label')) return false;
            return !control.textContent.trim() && !control.getAttribute('title');
          }).map(control => control.id || control.outerHTML.slice(0, 80));
          const emptyPrimary = [...document.querySelectorAll('.button-primary, .app-primary-action')]
            .filter(visible)
            .filter(control => !control.textContent.trim() && !control.getAttribute('aria-label'))
            .map(control => control.id || control.className);
          return {
            h1: [...document.querySelectorAll(`${mainSelector} h1`)].filter(visible).length,
            duplicates: [...new Set(duplicates)],
            unnamedControls,
            emptyPrimary,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        }""",
        main_selector,
    )
    assert result["h1"] == 1, f"{label}: expected one visible h1, got {result['h1']}"
    assert not result["duplicates"], f"{label}: duplicate IDs {result['duplicates']}"
    assert not result["unnamedControls"], f"{label}: unnamed controls {result['unnamedControls'][:8]}"
    assert not result["emptyPrimary"], f"{label}: empty primary controls {result['emptyPrimary']}"
    assert result["overflow"] <= 1, f"{label}: horizontal overflow {result['overflow']}px"
    return result


def assert_skip_focus(page, selector, label):
    skip = page.locator(selector)
    page.evaluate("document.activeElement && document.activeElement.blur()")
    page.keyboard.press("Tab")
    assert skip.evaluate("el => document.activeElement === el"), f"{label}: skip link is not first in keyboard order"
    visible = skip.evaluate(
        "el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > 0 && s.visibility !== 'hidden'; }"
    )
    assert visible, f"{label}: skip link is not visible on focus"


def audit_css():
    files = ["css/components.css", "css/app-shell.css", "css/styles.css", "css/landing.css"]
    sources = {name: open(name, encoding="utf-8-sig").read() for name in files}
    for name, source in sources.items():
        assert "transition: all" not in source, f"{name}: transition: all is forbidden"
    styles = sources["css/styles.css"]
    if "outline: none" in styles:
        final_focus = styles.rfind(":root :is(")
        assert final_focus > styles.rfind("outline: none"), "styles.css: outline suppression lacks a later focus-visible repair"
    assert "content-visibility: auto" in styles, "overview deferred content must use content-visibility"
    landing = sources["css/landing.css"]
    assert "@media (prefers-reduced-motion: reduce)" in landing, "landing reduced-motion rules missing"


def main():
    audit_css()
    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    errors = []

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            for width, height in ((360, 800), (390, 844), (768, 1024), (1024, 768), (1440, 900)):
                landing = browser.new_page(viewport={"width": width, "height": height})
                landing.on("pageerror", lambda error, w=width: errors.append(f"landing {w}px: {error}"))
                landing.goto(f"{base}/index.html", wait_until="networkidle")
                page_audit(landing, f"landing {width}px", "#landingMain")
                assert_skip_focus(landing, ".landing-skip", f"landing {width}px")
                landing.close()

                app = browser.new_page(viewport={"width": width, "height": height})
                app.on("pageerror", lambda error, w=width: errors.append(f"app {w}px: {error}"))
                app.add_init_script("localStorage.setItem('planner-onboarded','1');")
                app.goto(f"{base}/app.html?view=overview", wait_until="networkidle")
                app.wait_for_selector("#view-overview.active .overview-page")
                page_audit(app, f"app {width}px", "#view-overview.active")
                assert_skip_focus(app, ".skip-link", f"app {width}px")
                inactive_visible = app.locator(".view:not(.active):visible").count()
                assert inactive_visible == 0, f"app {width}px: inactive views are visible"
                app.close()
            browser.close()
    finally:
        httpd.shutdown()

    assert not errors, f"page errors: {errors[:8]}"
    print("DOM AUDIT OK: headings, controls, focus, IDs, reflow, motion, and deferred rendering")
    return 0


if __name__ == "__main__":
    sys.exit(main())
