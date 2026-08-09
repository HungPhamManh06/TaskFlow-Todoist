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

    # Mô phỏng Vercel cleanUrls: /app → /app.html (P6: internal links dùng clean URL)
    def translate_path(self, path):
        translated = super().translate_path(path)
        if os.path.isfile(translated):
            return translated
        if not os.path.splitext(path)[1] and not translated.endswith(os.sep):
            candidate = translated + ".html"
            if os.path.isfile(candidate):
                return candidate
        return translated


def assert_no_page_overflow(page, label):
    overflow = page.evaluate(
        "document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    assert overflow <= 1, f"{label} horizontal overflow: {overflow}px"


def load_app(page, base):
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.goto(f"{base}/app.html?view=overview", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="overview-view"] .overview-page', state="visible")


def load_week(page, base):
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.goto(f"{base}/app.html?view=week&w=1", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="week-view"] .week-page', state="visible")


def load_planning_view(page, base, view):
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.goto(f"{base}/app.html?view={view}", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector(f'[data-testid="{view}-view"] .{view}-page', state="visible")


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
        page.wait_for_selector('[data-testid="overview-view"] .overview-page', state="visible")
        assert page.locator(".overview-primary-grid > .overview-widget").first.get_attribute("data-widget-id") == "mood"
        page.evaluate("""
          saved => saved === null
            ? localStorage.removeItem('planner-widgets-overview')
            : localStorage.setItem('planner-widgets-overview', saved)
        """, original_config)
        page.reload(wait_until="networkidle")
        page.wait_for_selector('[data-testid="overview-view"] .overview-page', state="visible")

    assert page.locator('[data-testid="overview-view"] h1').count() == 1
    assert page.locator(".overview-metrics .metric").count() == 4
    assert page.locator(".overview-primary-grid").count() == 1
    assert page.locator('.overview-widget[data-widget-id="goals"]').count() == 1
    assert page.locator('.overview-widget[data-widget-id="habits"]').count() == 1
    assert page.locator(".scene, .chick-row, .chick-orn, .bear-wrap, .peek-chick").count() == 0
    assert_no_page_overflow(page, f"overview {width}px")

    settings = page.locator('.overview-header [data-action="widget-settings"]')
    settings.click()
    page.wait_for_selector('[data-testid="widget-settings-modal"]', state="visible")
    page.locator('[data-testid="widget-settings-modal"] [data-action="widget-save"]').click()
    assert page.locator('[data-testid="widget-settings-modal"]:visible').count() == 0

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


def week_checks(browser, base, width, height, errors, screenshot):
    page = browser.new_page(viewport={"width": width, "height": height})
    page.on("pageerror", lambda error: errors.append(f"week {width}px: {error}"))
    load_week(page, base)

    assert page.locator('[data-testid="week-view"] h1').count() == 1
    assert page.locator(".week-day-panel").count() == 7
    assert page.locator(".week-goals-summary").count() == 1
    assert page.locator(".week-support-grid").count() == 1
    assert_no_page_overflow(page, f"week {width}px")

    selector = page.locator(".week-day-selector")
    if width <= 390:
        assert selector.is_visible()
        jump = selector.locator('[data-action="day-jump"]').nth(3)
        target_id = jump.get_attribute("data-day-target")
        jump.click()
        assert page.evaluate("document.activeElement && document.activeElement.id") == target_id
    else:
        assert not selector.is_visible()

    task_count = page.locator(".week-day-panel").first.locator(".task-row").count()
    page.locator('.week-day-panel [data-action="addtask"]').first.click()
    assert page.locator(".week-day-panel").first.locator(".task-row").count() == task_count + 1
    assert page.evaluate("document.activeElement && document.activeElement.dataset.role") == "task-text"

    day_progress = page.locator('.week-day-panel').first.locator('[data-role="day-progress"]')
    day_before = day_progress.get_attribute("aria-valuenow")
    page.locator('.week-day-panel').first.locator('[data-action="task"]').first.click()
    assert day_progress.get_attribute("aria-valuenow") != day_before
    assert day_progress.locator('[data-role="day-progress-fill"]').get_attribute("style")

    week_progress = page.locator('[data-role="w-progress"]')
    week_before = week_progress.get_attribute("aria-valuenow")
    page.locator('[data-action="wgoal"]').first.click()
    assert week_progress.get_attribute("aria-valuenow") != week_before

    mood = page.locator('.week-day-panel [data-action="mood"]').first
    mood.click()
    assert "on" in (mood.get_attribute("class") or "")

    # Phase 4: nút 🔔 nằm trong dropdown ⋯ — mở menu rồi click menuitem.
    # Task actions chỉ hiện khi hover row (pointer-events auto) — hover row
    # trước để desktop Chrome (390px không emul touch) click được.
    page.locator('.week-day-panel [data-drag="task"]').first.hover()
    page.locator('.week-day-panel [data-action="task-menu"]').first.click()
    remind = page.locator('.week-day-panel [data-action="remind-task"]').first
    remind.click()
    # Phase 19: dùng data-testid ổn định thay XPath contains theo class
    assert remind.locator("xpath=ancestor::div[@data-testid='task-row'][1]").locator(".remind-edit-input").count() == 1

    page.locator('[data-action="week-report"]').click()
    assert page.locator('[data-testid="week-report-modal"]:visible').count() == 1
    page.locator('[data-testid="week-report-modal"] [data-action="close-week-report"]').click()

    start = page.locator('#view-week [data-action="pomo-start"]')
    start.click()
    assert page.locator("#pomoWidgetTime").inner_text() != ""
    start.click()
    page.locator('#view-week [data-action="pomo-reset"]').click()
    assert page.locator("#pomoWidgetTime").inner_text() == "25:00"

    page.screenshot(path=screenshot, full_page=False)
    page.close()


def year_checks(browser, base, width, height, errors, screenshot):
    page = browser.new_page(viewport={"width": width, "height": height})
    page.on("pageerror", lambda error: errors.append(f"year {width}px: {error}"))
    load_planning_view(page, base, "year")

    assert page.locator('[data-testid="year-view"] h1').count() == 1
    assert page.locator(".year-summary .year-summary-metric").count() == 4
    assert page.locator(".year-goal-grid").count() == 1
    assert page.locator(".quarter-grid").count() == 1
    assert page.locator(".month-progress-grid").count() == 1
    assert page.locator(".month-progress-grid [data-action='month']").count() == 12
    assert_no_page_overflow(page, f"year {width}px")

    goal_metric = page.locator('[data-role="year-summary-goals"]')
    before = goal_metric.inner_text()
    page.locator('[data-action="ygoal"]').first.click()
    assert goal_metric.inner_text() != before

    page.screenshot(path=screenshot, full_page=False)
    page.close()


def calendar_checks(browser, base, width, height, errors, screenshot):
    page = browser.new_page(viewport={"width": width, "height": height})
    page.on("pageerror", lambda error: errors.append(f"calendar {width}px: {error}"))
    load_planning_view(page, base, "calendar")

    assert page.locator('[data-testid="calendar-view"] h1').count() == 1
    assert page.locator(".calendar-grid-desktop .cal-dow").count() == 7
    assert page.locator(".calendar-grid-desktop .cal-cell").count() >= 28
    assert_no_page_overflow(page, f"calendar {width}px")

    if width <= 390:
        assert page.locator(".calendar-agenda-mobile").is_visible()
        assert not page.locator(".calendar-grid-desktop").is_visible()
    else:
        assert page.locator(".calendar-grid-desktop").is_visible()
        assert not page.locator(".calendar-agenda-mobile").is_visible()

    tag = page.locator('[data-action="calendar-tagfilter"][data-tag]:not([data-tag=""])').first
    if tag.count():
        tag_value = tag.get_attribute("data-tag")
        tag.click()
        assert tag.get_attribute("aria-pressed") == "true"
        assert f"tag={tag_value}" in page.url or "tag=" in page.url

    task = page.locator('.cal-task [data-action="task"]:visible').first
    if task.count():
        before = task.get_attribute("aria-checked")
        task.click()
        assert task.get_attribute("aria-checked") != before

    page.screenshot(path=screenshot, full_page=False)
    page.close()


def load_inbox(page, base):
    """Load the Inbox view via deep-link. Inbox renders .upcoming-page (not .inbox-page),
    so it cannot reuse load_planning_view."""
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.goto(f"{base}/app.html?view=inbox", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="inbox-view"] .upcoming-page', state="visible")


def inbox_checks(browser, base, width, height, errors, screenshot):
    """Phase D: full Inbox flow — capture, type, schedule-to-today — on stable data-testid hooks."""
    page = browser.new_page(viewport={"width": width, "height": height})
    page.on("pageerror", lambda error: errors.append(f"inbox {width}px: {error}"))
    load_inbox(page, base)

    assert page.locator('[data-testid="inbox-view"] h1').count() == 1
    assert_no_page_overflow(page, f"inbox {width}px")

    # Empty state CTA has stable hook (data-testid="inbox-add")
    add = page.locator('[data-testid="inbox-add"]')
    assert add.count() == 1
    add.click()
    row = page.locator('[data-testid="inbox-task-row"]')
    assert row.count() == 1, "inbox-add must create one row"

    # Type a real task into the new row's contenteditable
    text = page.locator('[data-testid="inbox-task-row"] [data-role="inbox-text"]')
    text.fill("E2E inbox task")
    assert text.inner_text() == "E2E inbox task"

    # Schedule to today: row clears, task lands on Today
    page.locator('[data-testid="inbox-task-row"] [data-action="inbox-today"]').click()
    page.wait_for_selector('[data-testid="inbox-task-row"]', state="detached")
    assert row.count() == 0, "scheduled task must leave the inbox"

    page.evaluate("setView('today')")
    page.wait_for_selector('[data-testid="today-view"]', state="visible")
    assert "E2E inbox task" in page.locator('[data-testid="today-view"]').inner_text()

    page.screenshot(path=screenshot, full_page=False)
    page.close()


def deeplink_checks(browser, base, width, height, errors, screenshot):
    """Phase D: browser-level PWA deep-links.
    - notificationclick opens './app?view=today' (SW APP_URL) → Today must boot visible.
    - manifest shortcut 'Thêm công việc' opens './app?view=today&quick=1' → Quick Add opens.
    The self-hosted server maps /app → /app.html (clean URLs), same as Vercel.
    NOTE: this tests the deep-link ROUTING the SW/notification opens, not the SW
    notificationclick handler itself (real notifications are untestable in headless)."""
    page = browser.new_page(viewport={"width": width, "height": height})
    page.on("pageerror", lambda error: errors.append(f"deeplink {width}px: {error}"))

    # 1. Notification deep-link target: today view, no quick-add
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.goto(f"{base}/app?view=today", wait_until="networkidle")
    page.wait_for_selector('[data-testid="today-view"]', state="visible")
    assert page.locator('[data-testid="today-view"]').is_visible()
    assert page.locator('[data-testid="quick-add"]:visible').count() == 0
    assert_no_page_overflow(page, f"deeplink today {width}px")

    # 2. Manifest 'Thêm việc' shortcut: quick=1 must open Quick Add after boot
    page.goto(f"{base}/app?view=today&quick=1", wait_until="networkidle")
    page.wait_for_selector('[data-testid="quick-add"]', state="visible", timeout=8000)
    assert page.locator('[data-testid="quick-add"]:visible').count() == 1
    assert_no_page_overflow(page, f"deeplink quick {width}px")

    # 3. Remaining manifest shortcuts (Tuần này / Tổng quan tháng / Kế hoạch năm):
    #    each boots to its own view, quick-add stays closed.
    for view in ("week", "overview", "year"):
        page.goto(f"{base}/app?view={view}", wait_until="networkidle")
        page.wait_for_selector(f'[data-testid="{view}-view"]', state="visible", timeout=8000)
        assert page.locator(f'[data-testid="{view}-view"]').is_visible()
        assert page.locator(f'[data-testid="{view}-view"] h1').count() == 1, f"{view} h1 missing"
        assert page.locator('[data-testid="quick-add"]:visible').count() == 0, f"{view} must not open quick-add"
        assert_no_page_overflow(page, f"deeplink {view} {width}px")

    page.screenshot(path=screenshot, full_page=False)
    page.close()


def dialog_checks(browser, base, width, height, errors, screenshot):
    page = browser.new_page(viewport={"width": width, "height": height})
    page.on("pageerror", lambda error: errors.append(f"dialogs {width}px: {error}"))
    load_app(page, base)

    opener = page.locator('[data-action="search-toggle"]').first
    opener.focus()
    page.keyboard.press("Control+K")
    page.wait_for_selector('[data-testid="search-modal"]', state="visible")
    assert page.evaluate("document.activeElement && document.activeElement.id") == "searchInput"
    page.keyboard.press("Escape")
    assert page.locator('[data-testid="search-modal"]:visible').count() == 0
    assert opener.evaluate("el => document.activeElement === el")

    if width <= 767:
        # Mobile: More sheet → Settings mở tools drawer
        page.locator('#mobileNav [data-action="more"]').click()
        page.wait_for_selector('[data-testid="more-sheet"]', state="visible")
        tools = page.locator('#moreSheet [data-action="tools-open"]')
    else:
        tools = page.locator('[data-action="tools-open"]:visible').first
    tools.click()
    page.wait_for_selector('[data-testid="tools-drawer"]', state="visible")
    assert page.locator('[data-testid="tools-drawer"] [data-action="tools-close"]').evaluate(
        "el => document.activeElement === el"
    )
    page.keyboard.press("Escape")
    assert page.locator('[data-testid="tools-drawer"]:visible').count() == 0
    if width <= 767:
        # Sheet đóng trước khi mở drawer → focus quay về nút More
        assert page.evaluate(
            "document.activeElement === document.querySelector('#mobileNav [data-action=\"more\"]')"
        )
    else:
        assert tools.evaluate("el => document.activeElement === el")

    page.evaluate("TaskFlowUI.openDialog('syncModal')")
    page.locator("#syncForm button[type='submit']").click()
    assert page.locator("#syncUser").get_attribute("aria-invalid") == "true"
    assert page.locator("#syncUserError:not([hidden])").count() == 1
    assert page.locator("#syncUser").evaluate("el => document.activeElement === el")
    page.keyboard.press("Escape")

    page.evaluate("TaskFlowUI.toast('Saved', 'success', 2000)")
    assert page.locator('[data-testid="toast-region"] .toast-success', has_text="Saved").count() == 1

    if width <= 390:
        page.locator('[data-action="chat-toggle"]').click()
        assert page.locator('[data-testid="chat-pop"]:visible').count() == 1
        page.locator('[data-action="pomo-toggle"]').click()
        assert page.locator('[data-testid="chat-pop"]:visible').count() == 0
        assert page.locator('[data-testid="pomo-panel"]:visible').count() == 1
        page.locator('[data-action="chat-toggle"]').click()
        assert page.locator('[data-testid="pomo-panel"]:visible').count() == 0

    assert_no_page_overflow(page, f"dialogs {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def landing_checks(browser, base, width, height, errors, screenshot):
    page = browser.new_page(viewport={"width": width, "height": height})
    page.on("pageerror", lambda error: errors.append(f"landing {width}px: {error}"))
    page.add_init_script("""
      // Set defaults only on first load so clicks that change the
      // preference survive the reload below (init scripts re-run on
      // every navigation, including reloads).
      if (localStorage.getItem('planner-lang') === null) localStorage.setItem('planner-lang', 'en');
      if (localStorage.getItem('planner-dark') === null) localStorage.setItem('planner-dark', '1');
    """)
    page.goto(f"{base}/index.html", wait_until="networkidle")

    assert page.locator("main h1").count() == 1
    assert page.locator("#productPreview").is_visible()
    assert page.locator("#trustStrip article").count() == 4
    assert page.locator("#features .feature-card").count() == 5
    assert page.locator(".hero-primary-cta").get_attribute("href") == "app"
    assert page.locator("html").get_attribute("lang") == "en"
    assert page.locator("html").get_attribute("data-dark") == "true"
    assert page.locator("#darkBtn").get_attribute("aria-pressed") == "true"
    assert_no_page_overflow(page, f"landing {width}px")
    page.screenshot(path=screenshot, full_page=False)

    page.locator("#langBtn").click()
    page.locator("#darkBtn").click()
    page.reload(wait_until="networkidle")
    assert page.locator("html").get_attribute("lang") == "vi"
    assert page.locator("html").get_attribute("data-dark") == "false"
    assert page.locator("#darkBtn").get_attribute("aria-pressed") == "false"

    page.locator('.hero-actions a[href="#product"]').click()
    assert page.evaluate("location.hash") == "#product"
    # Landing anchors scroll smoothly; wait for the target to settle
    # before asserting the offset instead of racing the animation.
    page.wait_for_function(
        "Math.abs(document.getElementById('product').getBoundingClientRect().top) < 110",
        timeout=8000,
    )
    assert_no_page_overflow(page, f"landing anchor {width}px")

    page.locator(".hero-primary-cta").click()
    page.wait_for_url("**/app")
    assert page.locator("#appMain").count() == 1
    page.close()


def focus_checks(browser, base, width, height, errors, screenshot):
    page = browser.new_page(viewport={"width": width, "height": height})
    page.on("pageerror", lambda error: errors.append(f"focus {width}px: {error}"))
    load_app(page, base)

    trigger = page.locator('[data-action="focus"]:visible').first
    if trigger.count() == 0:
        if width <= 767:
            # P2/P4: More sheet có mục Focus trực tiếp
            page.locator('#mobileNav [data-action="more"]').click()
            page.wait_for_selector('[data-testid="more-sheet"]', state="visible")
            trigger = page.locator('#moreSheet [data-action="focus"]')
        else:
            # P4: sidebar TRACK có nút Focus luôn visible ở desktop
            trigger = page.locator('#desktopSidebar [data-action="focus"]')
    trigger.click()
    page.wait_for_selector('[data-testid="focus-overlay"]', state="visible")
    assert page.locator("body.focus-mode").count() == 1
    assert page.locator('[data-testid="focus-overlay"] [data-action="focus-close"]').count() == 1
    assert_no_page_overflow(page, f"focus {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.locator('[data-testid="focus-overlay"] [data-action="focus-close"]').click()
    assert page.locator('[data-testid="focus-overlay"]:visible').count() == 0
    page.close()


def dark_overview_checks(browser, base, width, height, errors, screenshot):
    page = browser.new_page(viewport={"width": width, "height": height})
    page.on("pageerror", lambda error: errors.append(f"dark overview {width}px: {error}"))
    page.add_init_script("""
      localStorage.setItem('planner-onboarded','1');
      localStorage.setItem('planner-dark','1');
    """)
    page.goto(f"{base}/app.html?view=overview", wait_until="networkidle")
    page.wait_for_selector('[data-testid="overview-view"] .overview-page', state="visible")
    assert page.locator("html").get_attribute("data-dark") == "true"
    assert_no_page_overflow(page, f"dark overview {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def release_layout_checks(browser, base, width, height, errors):
    landing = browser.new_page(viewport={"width": width, "height": height})
    landing.on("pageerror", lambda error: errors.append(f"release landing {width}px: {error}"))
    landing.goto(f"{base}/index.html", wait_until="networkidle")
    assert_no_page_overflow(landing, f"release landing {width}px")
    landing.close()

    for view in ("overview", "week", "year", "calendar"):
        page = browser.new_page(viewport={"width": width, "height": height})
        page.on("pageerror", lambda error, v=view: errors.append(f"release {v} {width}px: {error}"))
        page.add_init_script("localStorage.setItem('planner-onboarded','1');")
        page.goto(f"{base}/app.html?view={view}", wait_until="networkidle")
        page.wait_for_selector(f'[data-testid="{view}-view"]', state="visible")
        assert page.locator(f'[data-testid="{view}-view"] h1').count() == 1
        assert_no_page_overflow(page, f"release {view} {width}px")
        page.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--view", choices=["overview", "week", "year", "calendar", "inbox", "deeplink"], default="overview")
    parser.add_argument("--dialogs", action="store_true")
    parser.add_argument("--landing", action="store_true")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--screenshots", action="store_true")
    args = parser.parse_args()

    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    shot_label = "release" if args.all else "landing" if args.landing else "dialogs" if args.dialogs else args.view
    shots = {
        "desktop": os.path.join(tempfile.gettempdir(), f"taskflow-{shot_label}-desktop.png"),
        "mobile": os.path.join(tempfile.gettempdir(), f"taskflow-{shot_label}-mobile.png"),
    }
    errors = []

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            if args.all:
                release_layout_checks(browser, base, 360, 800, errors)
                release_layout_checks(browser, base, 1024, 768, errors)
                matrix = ((390, 844), (768, 1024), (1440, 900))
                scenarios = (
                    ("landing", landing_checks),
                    ("overview", overview_checks),
                    ("week", week_checks),
                    ("year", year_checks),
                    ("calendar", calendar_checks),
                    ("inbox", inbox_checks),
                    ("deeplink", deeplink_checks),
                    ("dialogs", dialog_checks),
                    ("focus", focus_checks),
                    ("dark-overview", dark_overview_checks),
                )
                for width, height in matrix:
                    for scenario, check in scenarios:
                        screenshot = os.path.join(
                            tempfile.gettempdir(), f"taskflow-{scenario}-{width}.png"
                        )
                        check(browser, base, width, height, errors, screenshot)
            elif args.landing:
                landing_checks(browser, base, 1440, 900, errors, shots["desktop"])
                landing_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.dialogs:
                dialog_checks(browser, base, 1440, 900, errors, shots["desktop"])
                dialog_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "overview":
                overview_checks(browser, base, 1440, 900, errors, shots["desktop"])
                overview_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "week":
                week_checks(browser, base, 1440, 900, errors, shots["desktop"])
                week_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "year":
                year_checks(browser, base, 1440, 900, errors, shots["desktop"])
                year_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "calendar":
                calendar_checks(browser, base, 1440, 900, errors, shots["desktop"])
                calendar_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "inbox":
                inbox_checks(browser, base, 1440, 900, errors, shots["desktop"])
                inbox_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "deeplink":
                deeplink_checks(browser, base, 1440, 900, errors, shots["desktop"])
                deeplink_checks(browser, base, 390, 844, errors, shots["mobile"])
            browser.close()
    finally:
        httpd.shutdown()

    if errors:
        print("PAGE ERRORS:", errors[:8])
        return 1
    label = "RELEASE" if args.all else "LANDING" if args.landing else "DIALOGS" if args.dialogs else args.view.upper()
    print(f"E2E {label} OK")
    print("SCREENSHOTS:", shots["desktop"], shots["mobile"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
