"""Debug the 'Cannot read properties of undefined (reading pct)' error.

Start own HTTP server, capture page errors with stack traces.
Close all modals before switching views.
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

        errors = []

        page.on("pageerror", lambda e: errors.append({
            'msg': str(e),
            'stack': e.stack[:500] if e.stack else 'no stack'
        }))
        page.on("console", lambda msg: (
            errors.append({'msg': f"[console.{msg.type}] {msg.text}", 'stack': ''})
            if msg.type == "error" else None
        ))

        page.goto(f"{base}/app.html")
        page.wait_for_timeout(1500)

        if page.locator("#onboardModal:not([hidden])").count():
            page.locator('[data-action="ob-skip"]').click()
            page.wait_for_timeout(300)

        def close_modal_if_open():
            m = page.locator('#widgetSettingsModal:not([hidden])')
            if m.count() and m.is_visible(timeout=500):
                page.keyboard.press('Escape')
                page.wait_for_timeout(300)

        print("[OK] Page loaded")

        # --- Overview view ---
        page.locator('#tab-overview').click()
        page.wait_for_timeout(1500)
        print("[OK] Overview view")

        # Widget settings in overview
        ws_btn = page.locator('[data-action="widget-settings"]')
        if ws_btn.count():
            ws_btn.first.scroll_into_view_if_needed()
            ws_btn.first.click()
            page.wait_for_timeout(1000)
            modal = page.locator('#widgetSettingsModal')
            if modal.is_visible(timeout=1000):
                print("[OK] Widget modal opened in Overview")
                close_modal_if_open()
        else:
            print("[!!] No widget settings button in Overview")

        # --- Year view ---
        close_modal_if_open()
        page.locator('#tab-year').click()
        page.wait_for_timeout(1500)
        print("[OK] Year view")

        # Widget settings in year view
        ws_btn = page.locator('[data-action="widget-settings"]')
        if ws_btn.count():
            ws_btn.first.scroll_into_view_if_needed()
            page.wait_for_timeout(500)
            ws_btn.first.click()
            page.wait_for_timeout(1000)
            modal = page.locator('#widgetSettingsModal')
            print(f"[OK] Year widget modal open: {modal.is_visible(timeout=1000)}")

        # Summary
        print(f"\n=== FINAL SUMMARY ===")
        if errors:
            print(f"ERRORS: {len(errors)}")
            for e in errors:
                print(f"  {e['msg']}")
                if e['stack']:
                    for line in e['stack'].split('\n')[:5]:
                        print(f"    {line}")
        else:
            print("NO ERRORS FOUND")

        browser.close()
        httpd.shutdown()

        if errors:
            sys.exit(1)
        else:
            sys.exit(0)


if __name__ == '__main__':
    main()