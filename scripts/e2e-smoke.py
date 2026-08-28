"""TaskFlow frontend smoke test for the responsive application shell.

Cross-browser: --browser chromium|firefox|webkit (default chromium).
"""
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

    # Playwright đóng kết nối đột ngột khi kết thúc test → bỏ qua BrokenPipe/ConnectionReset
    def handle_error(self, request, client_address):
        import sys
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


def assert_no_overflow(page, label):
    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    assert overflow <= 1, f"{label} horizontal overflow: {overflow}px"


def load_app(page, base):
    # Motion determinism: emulate prefers-reduced-motion so every smooth scroll
    # is instant (the app already honors it in CSS + JS). Without this, WebKit
    # suppresses clicks that land while a smooth scroll is still in flight
    # (click-vs-drag discrimination) → flaky toggles; Firefox also scrolls more
    # slowly than Chromium, so geometry reads can straddle two scroll positions.
    # Reduced-motion removes animation timing from the suite on every engine.
    page.emulate_media(reduced_motion="reduce")
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
    # Phase 1-3 + Phase 3 + V1.1 Projects: 8 nav view
    # (today/inbox/upcoming/overview/week/year/calendar/projects)
    # desktop sidebar 8 + mobile nav 2 (today/week) + more sheet 6
    # (inbox/upcoming/overview/year/calendar/projects) = 16
    assert page.locator("[data-nav-view]").count() == 16
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

    # Phase 13: desktop sidebar nav groups — calendar/year/week are in moreSheet
    for view in ("calendar", "year", "week"):
        page.locator(f'#desktopSidebar [data-nav-view="{view}"]').click()
        page.wait_for_selector(f'[data-testid="{view}-view"]', state="visible")
        assert page.locator(f'#desktopSidebar [data-nav-view="{view}"][aria-current="page"]').count() == 1
        # Bottom-nav mobile (redesign): week/calendar/year in More sheet
        if view == "week":
            assert page.locator(f'#mobileNav [data-nav-view="upcoming"][aria-current="page"]').count() == 0
        assert page.locator(f'#moreSheet [data-nav-view="{view}"][aria-current="page"]').count() == 1
    # Projects is now a primary sidebar item (Phase 13), not in More sheet
    page.locator('#desktopSidebar [data-nav-view="projects"]').click()
    page.wait_for_selector('[data-testid="projects-view"]', state="visible")
    assert page.locator('#desktopSidebar [data-nav-view="projects"][aria-current="page"]').count() == 1

    # Phép đo week-goals-card bên dưới cần view Week — loop kết thúc ở projects
    # (v1.1) nên quay về week trước khi đo.
    page.locator('#desktopSidebar [data-nav-view="week"]').click()
    page.wait_for_selector('[data-testid="week-view"]', state="visible")

    # Đo card + strip trong MỘT evaluate để chống race với smooth scroll của
    # scrollWeekToToday(): nếu gọi bounding_box() 2 lần riêng, Firefox có thể
    # vẫn đang cuộn mượt (chậm hơn Chromium) giữa 2 lần đo → strip bị đo lệch
    # scroll → trông như nằm ngoài card. So sánh theo tọa độ document (bất
    # biến với scroll) trong cùng một snapshot layout.
    goals_geo = page.evaluate(
        """() => {
          const card = document.querySelector('.week-goals-card');
          if (!card) return null;
          const cr = card.getBoundingClientRect();
          const sy = window.scrollY;
          const top = cr.top + sy, bottom = cr.bottom + sy;
          return [...card.querySelectorAll('.v-strip')].map((s) => {
            const r = s.getBoundingClientRect();
            return { top: r.top + sy, bottom: r.bottom + sy };
          }).map((s) => ({ ...s, inside: s.top >= top - 1 && s.bottom <= bottom + 1 }));
        }"""
    )
    assert goals_geo is not None, "week-goals-card missing"
    assert goals_geo, "no .v-strip in week-goals-card"
    assert all(g["inside"] for g in goals_geo), f"v-strips outside card: {goals_geo}"

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

    # Desktop giữ nút floating Pomodoro (.pomo-fab) — More sheet cũng có entry
    # pomo-toggle nên cần selector cụ thể cho floating button.
    page.locator('.pomo-fab').click()
    page.wait_for_selector('[data-testid="pomo-panel"]', state="visible")
    assert_no_overflow(page, "desktop after interactions")
    page.screenshot(path=screenshots["desktop"], full_page=True)
    page.close()


def mobile_checks(browser, browser_name, base, errors, screenshots):
    # is_mobile is Chromium-only in Playwright; Firefox/WebKit use the viewport
    # alone (the app's mobile layout is driven by CSS media queries, not touch
    # emulation), so the mobile scenario stays meaningful on every engine.
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        is_mobile=(browser_name == "chromium"),
    )
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
    parser = argparse.ArgumentParser(description="TaskFlow E2E smoke (responsive shell)")
    parser.add_argument(
        "--browser",
        choices=["chromium", "firefox", "webkit"],
        default="chromium",
        help="browser engine to run against",
    )
    args = parser.parse_args()

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
            browser = getattr(playwright, args.browser).launch(headless=True)
            try:
                desktop_checks(browser, base, errors, screenshots)
                mobile_checks(browser, args.browser, base, errors, screenshots)
            finally:
                # Firefox session-restore race (Playwright known bug): closing the
                # browser while a context still exists can throw "can't access
                # property _maybeDontRestoreTabs" AFTER tests already passed.
                # Close contexts explicitly first so teardown is clean on every
                # engine — otherwise CI would report a green suite as red.
                for context in browser.contexts:
                    context.close()
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
