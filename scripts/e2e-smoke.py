"""TaskFlow frontend smoke test for the responsive application shell."""
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


def assert_no_overflow(page, label):
    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    assert overflow <= 1, f"{label} horizontal overflow: {overflow}px"


def load_app(page, base):
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    # Phase 3: default view đã đổi sang 'today' — load thẳng overview để giữ
    # smoke test overview-centric (habit toggle, widget settings).
    page.goto(f"{base}/app.html?view=overview", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="overview-view"]', state="visible")


def desktop_checks(browser, base, errors, screenshots):
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda error: errors.append(f"desktop: {error}"))
    load_app(page, base)

    assert page.locator("#desktopSidebar:visible").count() == 1
    assert page.locator("#appTopbar:visible").count() == 1
    # Phase 1-3 + Phase 3: 7 nav view (today/inbox/upcoming/overview/week/year/calendar)
    # desktop sidebar 7 + mobile nav 2 (today/week) + more sheet 5 (inbox/upcoming/overview/year/calendar) = 14
    assert page.locator("[data-nav-view]").count() == 14
    assert page.locator(".landing-hero").count() == 0
    assert page.locator(".app-primary-action").count() == 1
    assert_no_overflow(page, "desktop")

    widget_button = page.locator(".overview-header .widget-settings-btn")
    widget_label = widget_button.locator("span")
    assert page.evaluate("button => getComputedStyle(button).alignItems === 'center'", widget_button.element_handle())
    assert widget_label.bounding_box()["height"] < widget_button.bounding_box()["height"] - 8

    # Thứ tự nav mới: today → inbox → upcoming → overview → week → year → calendar.
    # ArrowRight từ today (nav đầu) phải sang inbox — đồng thời verify default view mới.
    today_tab = page.locator('#desktopSidebar [data-nav-view="today"]')
    today_tab.focus()
    page.keyboard.press("ArrowRight")
    page.wait_for_selector('[data-testid="inbox-view"]', state="visible")
    assert page.evaluate("document.activeElement?.dataset.navView === 'inbox'")
    page.locator('#desktopSidebar [data-nav-view="overview"]').click()
    page.wait_for_selector('[data-testid="overview-view"]', state="visible")

    habit = page.locator('[data-action="habit"]').first
    before = habit.get_attribute("aria-checked")
    habit.click()
    assert habit.get_attribute("aria-checked") != before

    for view in ("calendar", "year", "week"):
        page.locator(f'#desktopSidebar [data-nav-view="{view}"]').click()
        page.wait_for_selector(f'[data-testid="{view}-view"]', state="visible")
        assert page.locator(f'#desktopSidebar [data-nav-view="{view}"][aria-current="page"]').count() == 1
        # Bottom-nav mobile (redesign): chỉ Today/Upcoming là tab chính;
        # week/calendar/year nằm trong More sheet (luôn render để sync active state)
        if view == "week":
            assert page.locator(f'#mobileNav [data-nav-view="upcoming"][aria-current="page"]').count() == 0
        assert page.locator(f'#moreSheet [data-nav-view="{view}"][aria-current="page"]').count() == 1

    goals_card_box = page.locator(".week-goals-card").bounding_box()
    for strip in page.locator(".week-goals-card .v-strip").all():
        strip_box = strip.bounding_box()
        assert strip_box["y"] >= goals_card_box["y"] - 1
        assert strip_box["y"] + strip_box["height"] <= goals_card_box["y"] + goals_card_box["height"] + 1

    page.locator('[data-action="search-toggle"]').first.click()
    page.wait_for_selector('[data-testid="search-modal"]', state="visible")
    page.locator('[data-action="search-close"]').click()

    tools_trigger = page.locator('#appTopbar [data-action="tools-open"]')
    tools_trigger.click()
    page.wait_for_selector('[data-testid="tools-drawer"]', state="visible")
    assert page.locator('[data-testid="tools-drawer"]').get_attribute("role") == "dialog"
    page.keyboard.press("Escape")
    assert page.locator('[data-testid="tools-drawer"]:visible').count() == 0
    assert page.evaluate("document.activeElement === document.querySelector('#appTopbar [data-action=\"tools-open\"]')")

    tools_trigger.click()
    page.locator('#toolsDrawer [data-action="data-toggle"]').click()
    with page.expect_download() as download_info:
        page.locator('#toolsDrawer [data-action="export-csv"]').click()
    assert download_info.value.suggested_filename.endswith(".csv")
    page.locator('#toolsDrawer [data-action="tools-close"]').click()

    task_count = page.locator('[data-role="task-text"]').count()
    # Phase 4: nút Thêm công việc mở Quick Add — KHÔNG chuyển view
    page.locator(".app-primary-action").click()
    page.wait_for_selector('[data-testid="quick-add"]', state="visible")
    page.locator("#quickAddInput").fill("Việc từ Quick Add")
    page.keyboard.press("Enter")
    page.wait_for_selector('[data-testid="quick-add"]', state="hidden")
    assert page.locator('[data-testid="week-view"]:visible').count() == 1
    assert page.locator('[data-role="task-text"]').count() == task_count + 1
    # Escape đóng Quick Add
    page.locator(".app-primary-action").click()
    page.wait_for_selector('[data-testid="quick-add"]', state="visible")
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="quick-add"]', state="hidden")
    page.locator("#appViewTitle").click()
    page.keyboard.press("4")
    page.wait_for_selector('[data-testid="calendar-view"]', state="visible")

    page.locator('[data-action="pomo-toggle"]').click()
    page.wait_for_selector('[data-testid="pomo-panel"]', state="visible")
    assert_no_overflow(page, "desktop after interactions")
    page.screenshot(path=screenshots["desktop"], full_page=True)
    page.close()


def mobile_checks(browser, base, errors, screenshots):
    page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True)
    page.on("pageerror", lambda error: errors.append(f"mobile: {error}"))
    load_app(page, base)

    assert page.locator("#desktopSidebar:visible").count() == 0
    assert page.locator("#mobileNav:visible").count() == 1
    assert_no_overflow(page, "mobile")

    # Bottom-nav mobile (redesign): Sắp tới là tab chính (tuần nằm trong More sheet)
    page.locator('#mobileNav [data-nav-view="upcoming"]').click()
    page.wait_for_selector('[data-testid="upcoming-view"]', state="visible")
    assert page.locator('#mobileNav [data-nav-view="upcoming"][aria-current="page"]').count() == 1
    # Chỉ ĐÚNG MỘT tab active trong bottom nav
    assert page.locator('#mobileNav [aria-current="page"]').count() == 1

    # More sheet: Tuần nằm trong sheet + điều hướng view bên trong → sheet tự đóng
    more = page.locator('#mobileNav [data-action="more"]')
    more.click()
    page.wait_for_selector('[data-testid="more-sheet"]', state="visible")
    page.locator('#moreSheet [data-nav-view="week"]').click()
    page.wait_for_selector('[data-testid="week-view"]', state="visible")
    assert page.locator('[data-testid="more-sheet"]:visible').count() == 0
    # View trong More sheet → highlight nút Thêm (ĐÚNG MỘT active trong bottom nav)
    assert page.locator('#mobileNav [aria-current="page"]').count() == 1
    assert page.locator('#mobileNav [data-action="more"][aria-current="page"]').count() == 1

    more.click()
    page.wait_for_selector('[data-testid="more-sheet"]', state="visible")
    page.locator('#moreSheet [data-nav-view="calendar"]').click()
    page.wait_for_selector('[data-testid="calendar-view"]', state="visible")
    assert page.locator('[data-testid="more-sheet"]:visible').count() == 0

    # More → Settings → tools drawer (drawer mở thay sheet)
    more.click()
    page.wait_for_selector('[data-testid="more-sheet"]', state="visible")
    page.locator('#moreSheet [data-action="tools-open"]').click()
    page.wait_for_selector('[data-testid="tools-drawer"]', state="visible")
    assert page.locator("#toolsDrawerBackdrop:not([hidden])").count() == 1

    period_before = page.locator("#appPeriod").inner_text()
    page.locator("#drawerNextMonth").click()
    page.wait_for_function(
        "before => document.querySelector('#appPeriod').textContent.trim() !== before",
        arg=period_before,
    )
    drawer_month = page.locator("#drawerMonthSelect")
    current_month = int(drawer_month.input_value())
    selected_month = (current_month + 2) % 12
    drawer_month.select_option(str(selected_month))
    assert drawer_month.input_value() == str(selected_month)
    assert page.locator("#drawerUndo").is_disabled()
    assert page.locator("#drawerRedo").is_disabled()

    page.keyboard.press("Escape")
    assert page.locator('[data-testid="tools-drawer"]:visible').count() == 0
    # Sheet đã đóng trước khi mở drawer → focus quay về nút More trong bottom nav
    assert page.evaluate("document.activeElement === document.querySelector('#mobileNav [data-action=\"more\"]')")

    # Tuần qua More sheet → Quick Add mở từ FAB giữa (action, không active) → task vào tuần
    more.click()
    page.wait_for_selector('[data-testid="more-sheet"]', state="visible")
    page.locator('#moreSheet [data-nav-view="week"]').click()
    page.wait_for_selector('[data-testid="week-view"]', state="visible")
    assert page.locator('[data-testid="more-sheet"]:visible').count() == 0
    task_count = page.locator('[data-role="task-text"]').count()
    page.locator('#mobileNav [data-action="shell-add-task"]').click()
    page.wait_for_selector('[data-testid="quick-add"]', state="visible")
    # FAB là ACTION — không bao giờ active, không làm tăng số tab active (đang xem week → Thêm active)
    assert page.locator('#mobileNav [aria-current="page"]').count() == 1
    assert page.locator('#mobileNav [data-action="more"][aria-current="page"]').count() == 1
    page.locator("#quickAddInput").fill("Việc từ Quick Add mobile")
    page.keyboard.press("Enter")
    page.wait_for_selector('[data-testid="quick-add"]', state="hidden")
    assert page.locator('[data-testid="week-view"]:visible').count() == 1
    assert page.locator('[data-role="task-text"]').count() == task_count + 1

    more.click()
    page.wait_for_selector('[data-testid="more-sheet"]', state="visible")
    page.locator('#moreSheet [data-action="tools-open"]').click()
    page.wait_for_selector('[data-testid="tools-drawer"]', state="visible")
    assert not page.locator("#drawerUndo").is_disabled()
    assert page.locator("#drawerRedo").is_disabled()
    page.locator("#drawerUndo").click()
    assert not page.locator("#drawerRedo").is_disabled()
    page.locator('#toolsDrawer [data-action="tools-close"]').click()
    assert page.locator('[data-testid="tools-drawer"]:visible').count() == 0
    assert_no_overflow(page, "mobile after interactions")
    page.screenshot(path=screenshots["mobile"], full_page=True)
    page.close()


def main():
    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    screenshots = {
        "desktop": os.path.join(tempfile.gettempdir(), "taskflow-task3-desktop.png"),
        "mobile": os.path.join(tempfile.gettempdir(), "taskflow-task3-mobile.png"),
    }
    errors = []

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            desktop_checks(browser, base, errors, screenshots)
            mobile_checks(browser, base, errors, screenshots)
            browser.close()
    finally:
        httpd.shutdown()

    if errors:
        print("PAGE ERRORS:", errors[:8])
        return 1
    print("E2E SMOKE OK: responsive nav, tools drawer, Add Task, keyboard, export, Pomodoro, overflow")
    print("SCREENSHOTS:", screenshots["desktop"], screenshots["mobile"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
