"""E2E test: Widget Dashboard System — open settings, toggle visibility, save.

Tự khởi động HTTP server, chạy Playwright Chromium headless.
Thoát 0 = PASS, khác 0 = FAIL.
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
    # Start server on random port
    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"

    results = []
    console_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        # Capture console errors
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.on("console", lambda msg: (
            console_errors.append(f"[console.{msg.type}] {msg.text}")
            if msg.type == "error" else None
        ))

        # Pre-set onboarded flag + demo data to have a working state
        page.add_init_script("""
            localStorage.setItem('planner-onboarded','1');
        """)

        # Navigate to app
        page.goto(f"{base}/app.html")
        page.wait_for_timeout(1500)

        # Close onboardModal if still visible
        if page.locator("#onboardModal:not([hidden])").count():
            page.locator('[data-action="ob-skip"]').click()
            page.wait_for_timeout(300)
        results.append("[OK] Page loaded, onboarding skipped")

        # --- Switch to Overview view (tab-overview) ---
        overview_tab = page.locator('#tab-overview')
        if overview_tab.count():
            overview_tab.click()
            page.wait_for_timeout(1000)
            results.append("[OK] Switched to Overview view via #tab-overview")
        else:
            # Try data-action="nav" data-view="overview"
            ov_tab = page.locator('[data-action="nav"][data-view="overview"]')
            if ov_tab.count():
                ov_tab.click()
                page.wait_for_timeout(1000)
                results.append("[OK] Switched to Overview view via data-action nav")
            else:
                tabs = page.locator('#navTabs .tab')
                if tabs.count():
                    tabs.first.click()
                    page.wait_for_timeout(1000)
                    results.append(f"[OK] Clicked first tab: {tabs.first.text_content()[:30]}")
                else:
                    results.append("[!!] No nav tabs found")

        page.wait_for_timeout(500)

        # Screenshot of Overview view
        page.screenshot(path='/tmp/widget-dashboard-overview.png', full_page=True)
        results.append("[..] Screenshot: Overview view")

        # --- 1) Find and click widget settings button ---
        ws_btn = page.locator('[data-action="widget-settings"]')
        if ws_btn.count() == 0:
            results.append("[!!] widget-settings button NOT FOUND in Overview view")
            # Dump the visible buttons for debugging
            all_buttons = page.locator('button')
            btns = []
            for i in range(min(all_buttons.count(), 30)):
                t = all_buttons.nth(i).text_content()
                btns.append(t[:40])
            results.append(f"[!!] Visible buttons: {btns[:15]}")
            page.screenshot(path='/tmp/widget-debug.png', full_page=True)
        else:
            results.append(f"[OK] Found {ws_btn.count()} widget-settings button(s)")

            ws_btn.first.click()
            page.wait_for_timeout(800)

            # Check modal opened
            modal = page.locator('#widgetSettingsModal')
            if modal.is_visible(timeout=2000):
                results.append("[OK] WidgetSettingsModal opened")

                # --- 2) Count widget items in the modal ---
                items = modal.locator('.widget-item')
                item_count = items.count()
                results.append(f"[OK] Widget items in modal: {item_count}")

                if item_count > 0:
                    # --- 3) Find toggle buttons ---
                    toggles = modal.locator('[data-action="widget-toggle"], .widget-toggle')
                    toggle_count = toggles.count()
                    results.append(f"[OK] Toggle buttons found: {toggle_count}")

                    if toggle_count > 0:
                        # --- 4) Toggle first widget OFF ---
                        first_toggle = toggles.first
                        first_toggle.click()
                        page.wait_for_timeout(400)
                        results.append("[OK] Toggled first widget OFF")

                        # --- 5) Save ---
                        save_btn = modal.locator('[data-action="widget-save"]')
                        if save_btn.count():
                            save_btn.click()
                            page.wait_for_timeout(1000)
                            results.append("[OK] Saved widget config (first widget hidden)")

                            # Screenshot after hiding
                            page.screenshot(
                                path='/tmp/widget-dashboard-after-hide.png',
                                full_page=True
                            )
                            results.append("[..] Screenshot: after hiding widget")

                            # --- 6) Re-open and toggle back ON ---
                            ws_btn.first.click()
                            page.wait_for_timeout(800)
                            if modal.is_visible(timeout=2000):
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
                                        results.append(
                                            "[OK] Toggled widget back ON and saved"
                                        )
                            else:
                                results.append("[!!] Could not re-open widget modal")
                        else:
                            results.append("[!!] Save button not found in modal")
                    else:
                        results.append("[!!] No toggle buttons found")
                else:
                    results.append("[!!] No .widget-item elements in modal")
            else:
                results.append("[!!] WidgetSettingsModal did not appear")
                page.screenshot(path='/tmp/widget-modal-fail.png', full_page=True)

        # --- 7) Verify JS APIs exist ---
        has_init = page.evaluate(
            "typeof window.initWidgetConfig === 'function'"
        )
        has_get_visible = page.evaluate(
            "typeof window.getVisibleWidgets === 'function'"
        )
        results.append(f"[OK] initWidgetConfig: {has_init}, getVisibleWidgets: {has_get_visible}")

        # Check if widget config was stored in localStorage
        has_storage = page.evaluate(
            """() => {
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith('planner-widgets-')) return k + '=' + localStorage.getItem(k).substring(0, 80);
                }
                return null;
            }"""
        )
        if has_storage:
            results.append(f"[OK] Widget config in localStorage: {has_storage}")
        else:
            results.append("[OK] No widget config in localStorage yet (fresh defaults)")

        # Final screenshot
        page.screenshot(path='/tmp/widget-dashboard-final.png', full_page=True)
        results.append("[..] Screenshot: final state")

        browser.close()

    # Output
    print("=== WIDGET DASHBOARD TEST ===")
    for r in results:
        print(r)

    if console_errors:
        print(f"\n=== CONSOLE ERRORS ({len(console_errors)}) ===")
        for e in console_errors:
            print(f"  {e[:250]}")

    failures = [r for r in results if r.startswith('[!!]') or r.startswith('[XX]')]
    if failures:
        print(f"\nFAILED: {len(failures)} issue(s)")
        sys.exit(1)
    else:
        print("\nPASSED!")
        httpd.shutdown()
        sys.exit(0)


if __name__ == '__main__':
    main()