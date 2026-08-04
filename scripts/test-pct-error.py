"""Debug the 'Cannot read properties of undefined (reading pct)' error.
Simplified: just check for errors after loading each view.
"""
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


def main():
    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        page.add_init_script("localStorage.setItem('planner-onboarded','1');")
        page.add_init_script("localStorage.removeItem('planner-widgets-overview');")

        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda msg: (
            errors.append(f"[console.{msg.type}] {msg.text}")
            if msg.type == "error" else None
        ))

        page.goto(f"{base}/app.html")
        page.wait_for_timeout(1500)
        if page.locator("#onboardModal:not([hidden])").count():
            page.locator('[data-action="ob-skip"]').click()
            page.wait_for_timeout(300)
        errors_at_load = len(errors)

        # Overview
        page.locator('#tab-overview').click()
        page.wait_for_timeout(2000)
        errors_at_overview = len(errors) - errors_at_load

        # Year
        page.locator('#tab-year').click()
        page.wait_for_timeout(2000)
        errors_at_year = len(errors) - errors_at_load - errors_at_overview

        # Week 1
        page.locator('#tab-week-1').click()
        page.wait_for_timeout(2000)
        errors_at_week = len(errors) - errors_at_load - errors_at_overview - errors_at_year

        print(f"Errors at load:        {errors_at_load}")
        print(f"Errors after Overview: {errors_at_overview}")
        print(f"Errors after Year:     {errors_at_year}")
        print(f"Errors after Week:     {errors_at_week}")
        print(f"Total errors:          {len(errors)}")

        if errors:
            print("\n=== ALL ERRORS ===")
            for i, e in enumerate(errors):
                print(f"  [{i+1}] {e[:200]}")
                if 'pct' in e.lower():
                    print("       <<< PCT-RELATED >>>")
        else:
            print("\n*** NO ERRORS ***")

        browser.close()
        httpd.shutdown()

        if errors:
            sys.exit(1)
        else:
            sys.exit(0)


if __name__ == '__main__':
    main()