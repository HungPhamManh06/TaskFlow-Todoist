"""Focused browser checks for the TaskFlow refined frontend views."""
import argparse
import http.server
import os
import socketserver
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def assert_no_page_overflow(page, label):
    overflow = page.evaluate(
        "document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    assert overflow <= 1, f"{label} horizontal overflow: {overflow}px"


def load_app(page, base):
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.goto(f"{base}/app.html?view=overview", wait_until="networkidle")
    if page.locator("#onboardModal:not([hidden])").count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector("#view-overview.active .overview-page")


def overview_checks(browser, base, width, height, errors, screenshot):
    page = browser.new_page(viewport={"width": width, "height": height})
    page.on("pageerror", lambda error: errors.append(f"{width}px: {error}"))
    load_app(page, base)

    if width == 1440:
        original_config = page.evaluate(
            "localStorage.getItem('planner-widgets-overview')"
        )
        page.evaluate("""
          () => {
            const ids = ['mood', 'date-card', 'weekly-chart', 'scene-card', 'goals', 'habits', 'streak-heatmap', 'badges'];
            localStorage.setItem('planner-widgets-overview', JSON.stringify(
              ids.map((id, order) => ({ id, order, visible: true }))
            ));
          }
        """)
        page.reload(wait_until="networkidle")
        page.wait_for_selector("#view-overview.active .overview-page")
        assert page.locator(".overview-primary-grid > .overview-widget").first.get_attribute("data-widget-id") == "mood"
        page.evaluate("""
          saved => saved === null
            ? localStorage.removeItem('planner-widgets-overview')
            : localStorage.setItem('planner-widgets-overview', saved)
        """, original_config)
        page.reload(wait_until="networkidle")
        page.wait_for_selector("#view-overview.active .overview-page")

    assert page.locator("#view-overview h1").count() == 1
    assert page.locator(".overview-metrics .metric").count() == 4
    assert page.locator(".overview-primary-grid").count() == 1
    assert page.locator('.overview-widget[data-widget-id="goals"]').count() == 1
    assert page.locator('.overview-widget[data-widget-id="habits"]').count() == 1
    assert page.locator(".scene, .chick-row, .chick-orn, .bear-wrap, .peek-chick").count() == 0
    assert_no_page_overflow(page, f"overview {width}px")

    settings = page.locator('.overview-header [data-action="widget-settings"]')
    settings.click()
    page.wait_for_selector("#widgetSettingsModal:not([hidden])")
    page.locator('#widgetSettingsModal [data-action="widget-save"]').click()
    assert page.locator("#widgetSettingsModal[hidden]").count() == 1

    goal_metric = page.locator('[data-role="overview-goals-value"]')
    goal_before = int(goal_metric.inner_text())
    focus_title = page.locator('[data-role="overview-focus-title"]')
    focus_before = focus_title.inner_text()
    page.locator('[data-action="goal"]').first.click()
    assert int(goal_metric.inner_text()) != goal_before
    assert focus_title.inner_text() != focus_before

    today_index = page.evaluate("new Date().getDate() - 1")
    habit_metric = page.locator('[data-role="overview-habits-value"]')
    habit_metric_before = int(habit_metric.inner_text())
    habit = page.locator(f'[data-action="habit"][data-day="{today_index}"]').first
    before = habit.get_attribute("aria-checked")
    habit.click()
    assert habit.get_attribute("aria-checked") != before
    assert int(habit_metric.inner_text()) != habit_metric_before

    if width <= 390:
        main_width = page.locator("#appMain").bounding_box()["width"]
        for widget in page.locator(".overview-widget").all():
            assert widget.bounding_box()["width"] <= main_width + 1
        contained = page.locator(".habit-table-wrap").evaluate(
            "el => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === 'auto'"
        )
        assert contained, "habit table must scroll inside its own region"

    page.screenshot(path=screenshot, full_page=False)
    page.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--view", choices=["overview"], default="overview")
    args = parser.parse_args()

    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    shots = {
        "desktop": os.path.join(tempfile.gettempdir(), "taskflow-overview-desktop.png"),
        "mobile": os.path.join(tempfile.gettempdir(), "taskflow-overview-mobile.png"),
    }
    errors = []

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            if args.view == "overview":
                overview_checks(browser, base, 1440, 900, errors, shots["desktop"])
                overview_checks(browser, base, 390, 844, errors, shots["mobile"])
            browser.close()
    finally:
        httpd.shutdown()

    if errors:
        print("PAGE ERRORS:", errors[:8])
        return 1
    print("E2E OVERVIEW OK")
    print("SCREENSHOTS:", shots["desktop"], shots["mobile"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
