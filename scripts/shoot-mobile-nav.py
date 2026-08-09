"""Capture the real TaskFlow mobile app screenshot (390x844) with the new
bottom navigation visible, for the PWA manifest narrow form_factor entry.

Serves the project root over a local HTTP server (same mechanism as
e2e-smoke.py), seeds the onboarding flag, boots /app.html?view=today and
saves app-screenshot-mobile.png at exactly 390x844 (device_scale_factor=1).
"""
import http.server
import os
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

WIDTH, HEIGHT = 390, 844
OUT = "app-screenshot-mobile.png"


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class Server(socketserver.TCPServer):
    allow_reuse_address = True


def main():
    srv = Server(("127.0.0.1", 0), Handler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": WIDTH, "height": HEIGHT}, device_scale_factor=1
        )
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.add_init_script("localStorage.setItem('planner-onboarded','1');")
        page.goto(f"{base}/app.html?view=today", wait_until="networkidle")
        page.wait_for_selector(".app-mobile-nav", state="visible")
        page.wait_for_timeout(900)  # let today view render + layout settle

        # sanity: exactly one active nav item, no horizontal overflow
        active = page.evaluate(
            "document.querySelectorAll('#mobileNav .app-mobile-nav-item.active').length"
        )
        overflow = page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        assert active == 1, f"expected 1 active nav item, got {active}"
        assert overflow <= 1, f"horizontal overflow: {overflow}px"

        page.screenshot(path=OUT)
        print(f"saved {OUT} ({WIDTH}x{HEIGHT}), active-nav={active}, errors={len(errors)}")
        if errors:
            print("page errors:", errors[:3])
        browser.close()
    srv.shutdown()


if __name__ == "__main__":
    sys.exit(main())
