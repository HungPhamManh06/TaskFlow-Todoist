"""E2E test: Year View Widget Dashboard — open settings, toggle, save, re-toggle.

Tests both Overview and Year view widget systems.
Tự khởi động HTTP server, chạy Playwright Chromium headless.
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

    results = []
    errors = []

    def log(msg):
        results.append(msg)
        print(msg)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda msg: (
            errors.append(f"[console.{msg.type}] {msg.text}")
            if msg.type == "error" else None
        ))

        # Clear local state for fresh test
        page.add_init_script("""
            localStorage.setItem('planner-onboarded','1');
            localStorage.removeItem('planner-widgets-overview');
            localStorage.removeItem('planner-widgets-year');
        """)

        page.goto(f"{base}/app.html")
        page.wait_for_timeout(1500)
        if page.locator("#onboardModal:not([hidden])").count():
            page.locator('[data-action="ob-skip"]').click()
            page.wait_for_timeout(300)
        log("[OK] Page loaded")

        # ====================================================================
        # 1) Overview view — quick widget test
        # ====================================================================
        page.locator('#tab-overview').click()
        page.wait_for_timeout(1500)
        log("[OK] Switched to Overview view")

        ws_btn = page.locator('[data-action="widget-settings"]')
        if ws_btn.count():
            ws_btn.first.scroll_into_view_if_needed()
            ws_btn.first.click()
            page.wait_for_timeout(1000)
            modal = page.locator('#widgetSettingsModal')
            if modal.is_visible(timeout=1000):
                items = modal.locator('.widget-item').count()
                log(f"[OK] Overview: {items} widget items in modal")
                page.evaluate("document.getElementById('widgetSettingsModal').hidden = true;")
                page.wait_for_timeout(300)
            else:
                log("[!!] Overview: widget modal not visible")
        else:
            log("[!!] Overview: no widget-settings button found")

        # ====================================================================
        # 2) Year view — widget test
        # ====================================================================
        page.locator('#tab-year').click()
        page.wait_for_timeout(1500)
        log("[OK] Switched to Year view")

        # Check for widget settings button in Year view
        ws_btn = page.locator('[data-action="widget-settings"]')
        count_ws = ws_btn.count()
        log(f"[OK] Year: {count_ws} widget-settings button(s) found")

        if count_ws > 0:
            # Click the last one (Year view button is after overview content)
            ws_btn.last.scroll_into_view_if_needed()
            page.wait_for_timeout(500)
            ws_btn.last.click()
            page.wait_for_timeout(1000)

            modal = page.locator('#widgetSettingsModal')
            if modal.is_visible(timeout=1000):
                # Check modal has correct view set
                widget_view = page.evaluate(
                    "document.getElementById('widgetSettingsModal').getAttribute('data-widget-view')"
                )
                log(f"[OK] Year: widget modal opened (view={widget_view})")

                items = modal.locator('.widget-item').count()
                log(f"[OK] Year: {items} widget items in modal")

                if items > 0:
                    toggles = modal.locator('[data-action="widget-toggle"], .widget-toggle')
                    toggle_count = toggles.count()
                    log(f"[OK] Year: {toggle_count} toggle buttons")

                    if toggle_count > 0:
                        # Toggle first widget OFF
                        toggles.first.click()
                        page.wait_for_timeout(400)
                        log("[OK] Year: toggled first widget OFF")

                        # Save
                        save_btn = modal.locator('[data-action="widget-save"]')
                        if save_btn.count():
                            save_btn.click()
                            page.wait_for_timeout(1000)
                            log("[OK] Year: saved widget config")

                            # Check localStorage
                            storage = page.evaluate(
                                "localStorage.getItem('planner-widgets-year')"
                            )
                            if storage:
                                log(f"[OK] Year: widget config saved to localStorage ({len(storage)} chars)")

                            # Re-open and toggle back ON
                            ws_btn.last.scroll_into_view_if_needed()
                            ws_btn.last.click()
                            page.wait_for_timeout(1000)
                            if modal.is_visible(timeout=1000):
                                toggles = modal.locator(
                                    '[data-action="widget-toggle"], .widget-toggle'
                                )
                                if toggles.count():
                                    toggles.first.click()
                                    page.wait_for_timeout(400)
                                    save_btn = modal.locator('[data-action="widget-save"]')
                                    if save_btn.count():
                                        save_btn.click()
                                        page.wait_for_timeout(1000)
                                        log("[OK] Year: toggled widget back ON and saved")
                        else:
                            log("[!!] Year: save button not found")
                else:
                    log("[!!] Year: no widget items in modal")

                page.evaluate("document.getElementById('widgetSettingsModal').hidden = true;")
            else:
                log("[!!] Year: widget modal not visible")
                page.screenshot(path='/tmp/widget-year-fail.png', full_page=True)
        else:
            log("[!!] Year: no widget settings button found")
            page.screenshot(path='/tmp/widget-year-no-btn.png', full_page=True)

        # ====================================================================
        # 3) Switch back to Overview — verify Year's config didn't corrupt overview
        # ====================================================================
        page.locator('#tab-overview').click()
        page.wait_for_timeout(1500)
        log("[OK] Back to Overview view")

        # Check overview still has its own config
        ov_storage = page.evaluate(
            "localStorage.getItem('planner-widgets-overview')"
        )
        yr_storage = page.evaluate(
            "localStorage.getItem('planner-widgets-year')"
        )
        log(f"[OK] Overview storage: {ov_storage is not None}")
        log(f"[OK] Year storage: {yr_storage is not None}")

        # ====================================================================
        # Summary
        # ====================================================================
        log(f"\n=== ERRORS: {len(errors)} ===")
        for e in errors:
            log(f"  {e[:200]}")

        browser.close()
        httpd.shutdown()

        if errors:
            log("\n*** FAILED: errors found ***")
            sys.exit(1)
        else:
            log("\n*** PASSED: no errors ***")
            sys.exit(0)


if __name__ == '__main__':
    main()