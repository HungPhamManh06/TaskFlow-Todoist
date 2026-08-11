"""Focused browser checks for the TaskFlow refined frontend views.

Cross-browser: --browser chromium|firefox|webkit (default chromium).
The full matrix (--all, 15 scenarios x 5 viewports) targets Chromium;
single scenarios also run on Firefox/WebKit.
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


def make_page(browser, width, height):
    # Motion determinism: emulate prefers-reduced-motion (the app honors it in
    # CSS + JS) so every smooth scroll is instant. Without this, WebKit
    # suppresses or mis-targets clicks that land while a scroll is still in
    # flight (elements move under the cursor → "intercepts pointer events"
    # retries, flaky toggles), and Firefox scrolls more slowly than Chromium so
    # geometry reads can straddle two scroll positions. Reduced-motion removes
    # animation timing from the suite on every engine.
    page = browser.new_page(viewport={"width": width, "height": height})
    page.emulate_media(reduced_motion="reduce")
    return page


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
    page = make_page(browser, width, height)
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
    # The habit table is horizontally scrollable with two pinned sticky columns
    # (name-col 190px + pct-col 52px). At narrow viewports Playwright's minimal
    # scroll-into-view leaves today's cell UNDER the sticky columns, and the
    # page's sticky topbar / fixed bottom nav can cover it vertically — so the
    # click is intercepted ("subtree intercepts pointer events") on every
    # engine. A real user swipes the cell clear of the pinned columns and taps
    # mid-screen. Pre-position the cell the same way: align its right edge just
    # inside the wrap (clears both sticky columns) and center it vertically in
    # the viewport (clears topbar + bottom nav).
    page.evaluate(
        """(day) => {
          const wrap = document.querySelector('.habit-table-wrap');
          if (!wrap) return;
          const t = document.querySelector(`[data-action="habit"][data-day="${day}"]`);
          if (!t) return;
          const wr = wrap.getBoundingClientRect();
          const tr = t.getBoundingClientRect();
          const dx = tr.left - (wr.right - tr.width - 16);
          wrap.scrollLeft = Math.min(
            Math.max(wrap.scrollLeft + dx, 0),
            wrap.scrollWidth - wrap.clientWidth
          );
          const tr2 = t.getBoundingClientRect();
          window.scrollBy(0, tr2.top - window.innerHeight * 0.35);
        }""",
        today_index,
    )
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
    page = make_page(browser, width, height)
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
    page = make_page(browser, width, height)
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
    page = make_page(browser, width, height)
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
    page = make_page(browser, width, height)
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
    page = make_page(browser, width, height)
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


def taskdetail_checks(browser, base, width, height, errors, screenshot):
    """P0.2: task-detail drawer edit flow (title/date/time/duration/priority/repeat/
    tags/notes/subtasks) + delete/undo + export download flow (JSON/CSV/ICS), on stable
    data-testid / data-action hooks."""
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"taskdetail {width}px: {error}"))
    load_week(page, base)

    # --- create a task in the first day panel ---
    panel = page.locator(".week-day-panel").first
    task_count = panel.locator('[data-testid="task-row"]').count()
    page.locator('.week-day-panel [data-action="addtask"]').first.click()
    row = panel.locator('[data-testid="task-row"]').nth(task_count)
    assert row.count() == 1, "addtask must create one row"
    text = row.locator('[data-role="task-text"]')
    text.fill("E2E detail task")
    assert text.inner_text() == "E2E detail task"

    # --- open the task drawer from the row menu (hover reveals ⋯) ---
    row.hover()
    row.locator('[data-action="task-menu"]').click()
    row.locator('[data-action="task-detail"]').click()
    page.wait_for_selector('[data-testid="task-drawer"]', state="visible")
    drawer = page.locator('[data-testid="task-drawer"]')

    # --- edit title (Enter commits via blur) ---
    title = drawer.locator('[data-role="td-text"]')
    title.fill("E2E edited task")
    title.press("Enter")
    assert title.inner_text() == "E2E edited task"

    # --- time: enable then set (change fires on blur) ---
    time_toggle = drawer.locator('[data-action="td-time-toggle"]')
    time_toggle.check()
    time_in = drawer.locator('[data-action="td-time"]')
    assert not time_in.is_disabled(), "time input must enable after toggle"
    time_in.fill("09:30")
    time_in.press("Tab")

    # --- duration ---
    dur = drawer.locator('[data-action="td-duration"]')
    dur.fill("45")
    dur.press("Tab")

    # --- priority (P0.2: had no dispatcher handler — edit must persist) ---
    prio = drawer.locator('[data-action="td-prio"]')
    # Force a real toggle through the dispatcher — the fix under test. Without the
    # td-prio branch the native checkbox flips but tk.kind never changes, so the
    # row's data-kind (driven by the model, not the DOM) mismatches the checkbox.
    prio.click()
    is_prio_now = prio.is_checked()
    # Week panels sort priority tasks into their own section, so the row can move
    # index after a kind change — locate it by its unique text instead.
    kind_row = panel.locator('[data-testid="task-row"]', has_text="E2E edited task")
    assert kind_row.count() == 1
    assert kind_row.get_attribute("data-kind") == ("priority" if is_prio_now else "regular")

    # --- repeat weekly ---
    drawer.locator('[data-action="td-repeat"]').select_option("weekly")

    # --- notes ---
    note = drawer.locator('[data-action="td-note"]')
    note.fill("E2E notes")
    note.press("Tab")

    # --- subtask (Enter on input triggers subtask-add) ---
    sub = drawer.locator('[data-role="td-subtask-input"]')
    sub.fill("E2E subtask")
    sub.press("Enter")
    assert drawer.locator(".td-subtask").count() == 1

    # --- tag ---
    tag = drawer.locator('[data-role="td-tag-input"]')
    tag.fill("urgent")
    tag.press("Enter")
    assert drawer.locator(".tag-chip.td-tag").count() == 1

    # --- move to another day (td-date change re-renders the drawer) ---
    date_sel = drawer.locator('[data-action="td-date"]')
    current_day = date_sel.input_value()
    target_day = "1" if current_day != "1" else "2"
    date_sel.select_option(target_day)
    assert drawer.locator('[data-role="td-text"]').count() == 1, "drawer must re-render"

    # --- close, then re-open to verify persistence ---
    drawer.locator('[data-action="task-detail-close"]').click()
    page.wait_for_selector('[data-testid="task-drawer"]', state="hidden")
    moved = page.locator(".week-day-panel").nth(int(target_day)).locator(
        '[data-testid="task-row"]', has_text="E2E edited task"
    )
    assert moved.count() == 1, "edited task must persist on the new day"
    moved.hover()
    moved.locator('[data-action="task-menu"]').click()
    moved.locator('[data-action="task-detail"]').click()
    page.wait_for_selector('[data-testid="task-drawer"]', state="visible")
    drawer = page.locator('[data-testid="task-drawer"]')
    assert drawer.locator('[data-role="td-text"]').inner_text() == "E2E edited task"
    assert drawer.locator('[data-action="td-duration"]').input_value() == "45"
    assert drawer.locator('[data-action="td-note"]').input_value() == "E2E notes"
    assert drawer.locator('[data-action="td-repeat"]').input_value() == "weekly"
    assert drawer.locator('[data-action="td-prio"]').is_checked() == is_prio_now
    assert drawer.locator('[data-action="td-time"]').input_value() == "09:30"
    assert not drawer.locator('[data-action="td-time"]').is_disabled()
    assert drawer.locator(".td-subtask").count() == 1
    assert drawer.locator(".tag-chip.td-tag").count() == 1

    # --- delete + undo restore ---
    drawer.locator('[data-action="td-delete"]').click()
    page.wait_for_selector('[data-testid="task-drawer"]', state="hidden")
    assert moved.count() == 0, "deleted task must leave the day panel"
    undo = page.locator('[data-testid="toast-region"] .toast-action', has_text="Hoàn tác")
    assert undo.count() == 1, "delete toast must offer Undo"
    undo.click()
    restored = page.locator(".week-day-panel").nth(int(target_day)).locator(
        '[data-testid="task-row"]', has_text="E2E edited task"
    )
    assert restored.count() == 1, "undo must restore the deleted task"

    # --- export flow: JSON / CSV / ICS downloads ---
    if width <= 767:
        page.locator('#mobileNav [data-action="more"]').click()
        page.wait_for_selector('[data-testid="more-sheet"]', state="visible")
        page.locator('#moreSheet [data-action="tools-open"]').click()
    else:
        page.locator('[data-action="tools-open"]:visible').first.click()
    page.wait_for_selector('[data-testid="tools-drawer"]', state="visible")
    for action, prefix in (
        ("export-json", "taskflow-todoist-backup-"),
        ("export-csv", "taskflow-todoist-data-"),
        ("export-ics", "taskflow-calendar-"),
    ):
        page.locator('[data-action="data-toggle"]').click()
        page.wait_for_selector('#dataPop:not([hidden])', state="visible")
        with page.expect_download() as dl:
            page.locator(f'[data-action="{action}"]').click()
        assert dl.value.suggested_filename.startswith(prefix), f"{action} filename wrong"

    assert_no_page_overflow(page, f"taskdetail {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def dialog_checks(browser, base, width, height, errors, screenshot):
    page = make_page(browser, width, height)
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
        # Mobile UI polish: nút floating Focus/AI đã ẩn — Trợ lý + Pomodoro mở
        # qua More sheet (Công cụ group), hành vi panel giữ nguyên.
        page.locator('#mobileNav [data-action="more"]').click()
        page.wait_for_selector('[data-testid="more-sheet"]', state="visible")
        page.locator('#moreSheet [data-action="chat-toggle"]').click()
        assert page.locator('[data-testid="chat-pop"]:visible').count() == 1
        page.locator('#moreSheet [data-action="pomo-toggle"]').click()
        assert page.locator('[data-testid="chat-pop"]:visible').count() == 0
        assert page.locator('[data-testid="pomo-panel"]:visible').count() == 1
        page.locator('#moreSheet [data-action="chat-toggle"]').click()
        assert page.locator('[data-testid="pomo-panel"]:visible').count() == 0
        page.keyboard.press("Escape")
        page.wait_for_selector('[data-testid="more-sheet"]', state="hidden")

    assert_no_page_overflow(page, f"dialogs {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def landing_checks(browser, base, width, height, errors, screenshot):
    page = make_page(browser, width, height)
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
    page = make_page(browser, width, height)
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


def reflection_checks(browser, base, width, height, errors, screenshot):
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"reflection {width}px: {error}"))
    load_app(page, base)
    page.evaluate("setView('today')")
    page.wait_for_selector('[data-testid="today-view"] .today-page', state="visible")
    page.wait_for_selector('[data-testid="reflection-card"]', state="visible")

    # Summary strip hiển thị 4 ô
    assert page.locator('[data-testid="reflection-card"] .reflect-summary-cell').count() == 4

    # Mood picker: radiogroup + 5 nút
    mood_group = page.locator('[data-testid="reflection-card"] [role="radiogroup"]')
    assert mood_group.count() == 1
    mood_btns = page.locator('[data-testid="reflection-card"] [role="radio"]')
    assert mood_btns.count() == 5

    # Chọn mood → aria-checked + lưu planner-mood
    mood_btns.nth(3).click()
    page.wait_for_timeout(200)
    assert page.locator('[data-testid="reflection-card"] [role="radio"][aria-checked="true"]').count() == 1
    stored = page.evaluate("JSON.parse(localStorage.getItem('planner-mood') || '{}')")
    assert any(v == 3 for v in stored.values()), "mood phải mirror sang planner-mood"

    # Quick fields + save → entry trong planner-reflections-daily
    page.locator('[data-reflect-field="quickGood"]').fill("Viết được unit test")
    page.locator('[data-reflect-field="quickImprove"]').fill("Dậy sớm hơn")
    page.locator('[data-testid="reflection-save-quick"]').click()
    page.wait_for_timeout(300)
    entries = page.evaluate("JSON.parse(localStorage.getItem('planner-reflections-daily') || '{}')")
    today_key = page.evaluate(
        "(() => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })()"
    )
    assert today_key in entries, "entry hôm nay phải tồn tại"
    assert entries[today_key]["quickGood"] == "Viết được unit test"
    assert entries[today_key]["quickImprove"] == "Dậy sớm hơn"

    # Deep modal: mở, gõ, lưu
    page.locator('[data-testid="reflection-deep-open"]').click()
    page.wait_for_selector('[data-testid="reflection-modal"]', state="visible")
    page.locator('#reflectionDeepContent [data-reflect-field="good"]').fill("Hoàn thành P1")
    page.locator('#reflectionDeepContent [data-reflect-field="tomorrow"]').fill("Làm P2")
    page.locator('[data-testid="reflection-deep-save"]').click()
    page.wait_for_selector('[data-testid="reflection-modal"]:visible', state="detached")
    entries = page.evaluate("JSON.parse(localStorage.getItem('planner-reflections-daily') || '{}')")
    assert entries[today_key]["good"] == "Hoàn thành P1"
    assert entries[today_key]["tomorrow"] == "Làm P2"

    # History: entry hiển thị + mở lại deep
    page.locator('[data-testid="reflection-history-btn"]').click()
    page.wait_for_selector('[data-testid="reflection-history-modal"]', state="visible")
    assert page.locator('[data-testid="reflection-history-modal"] .reflect-history-item').count() >= 1
    assert page.locator('[data-testid="reflection-history-modal"] .reflect-history-preview').first.inner_text().strip() != ""
    page.locator('[data-testid="reflection-history-modal"] [data-action="reflection-history-close"]').click()
    page.wait_for_selector('[data-testid="reflection-history-modal"]:visible', state="detached")

    assert_no_page_overflow(page, f"reflection {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def pillars_checks(browser, base, width, height, errors, screenshot):
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"pillars {width}px: {error}"))
    load_app(page, base)

    # Đảm bảo goals widget hiển thị (có pillars block)
    page.evaluate("""
      () => {
        const ids = ['goals', 'mood', 'habits', 'date-card', 'weekly-chart', 'scene-card', 'streak-heatmap', 'badges'];
        localStorage.setItem('planner-widgets-overview', JSON.stringify(
          ids.map((id, order) => ({ id, order, visible: true }))
        ));
      }
    """)
    page.reload(wait_until="networkidle")
    page.wait_for_selector('[data-testid="pillars-block"]', state="visible")

    # Migration additive: state mặc định có 3 trụ cột template (Cơ thể/Việc chính/Tương tác)
    assert page.locator('[data-testid="pillar-card"]').count() == 3, "phải có 3 trụ cột mặc định"
    names = page.locator('[data-testid="pillar-card"] .pillar-name').all_inner_texts()
    assert any("Cơ thể" in n for n in names), f"thiếu trụ cột Cơ thể: {names}"
    assert any("Việc chính" in n for n in names), f"thiếu trụ cột Việc chính: {names}"
    assert any("Tương tác" in n for n in names), f"thiếu trụ cột Tương tác: {names}"
    stored = page.evaluate("JSON.parse(localStorage.getItem('planner-2026-8') || 'null')")
    if stored:
        assert isinstance(stored.get("pillars"), list) and len(stored["pillars"]) >= 3, "month state phải có pillars"

    # Monthly Focus: gõ vào ô focus → autosave vào localStorage
    focus_input = page.locator('[data-pillar-focus]').first
    focus_input.fill("Duy trì năng lượng ổn định")
    page.wait_for_timeout(600)  # saveSoon debounce 350ms
    month_key = page.evaluate("window.TaskFlowShell.monthKey(new Date().getFullYear(), new Date().getMonth())")
    focus_stored = page.evaluate(
        f"(() => {{ const s = JSON.parse(localStorage.getItem('{month_key}') || '{{}}'); return (s.pillars||[]).map(p => p.focus); }})()"
    )
    assert any(f == "Duy trì năng lượng ổn định" for f in focus_stored), f"focus phải được lưu: {focus_stored}"

    # Sửa trụ cột qua modal: đổi tên + icon
    page.locator('[data-testid="pillar-card"] [data-action="pillar-edit"]').first.click()
    page.wait_for_selector('[data-testid="pillar-edit-modal"]:visible', state="visible")
    name_input = page.locator('[data-role="pillar-name"]')
    name_input.fill("Sức khỏe")
    page.locator('[data-pillar-icon="🏃"]').click()
    page.locator('[data-action="pillar-save"]').click()
    page.wait_for_selector('[data-testid="pillar-edit-modal"]:visible', state="detached")
    assert page.locator('[data-testid="pillar-card"] .pillar-name', has_text="Sức khỏe").count() == 1, "trụ cột phải được đổi tên"
    assert page.locator('[data-testid="pillar-card"] .pillar-icon', has_text="🏃").count() == 1, "icon phải được đổi"

    # Thêm trụ cột mới
    page.locator('[data-action="pillar-add"]').click()
    page.wait_for_selector('[data-testid="pillar-edit-modal"]:visible', state="visible")
    page.locator('[data-role="pillar-name"]').fill("Học tập")
    page.locator('[data-pillar-icon="📚"]').click()
    page.locator('[data-action="pillar-save"]').click()
    page.wait_for_selector('[data-testid="pillar-edit-modal"]:visible', state="detached")
    assert page.locator('[data-testid="pillar-card"]').count() == 4, "sau khi thêm phải có 4 trụ cột"

    # Ẩn trụ cột → 3 hiển thị, localStorage hidden=true
    page.locator('[data-testid="pillar-card"] [data-action="pillar-toggle"]').first.click()
    page.wait_for_timeout(200)
    assert page.locator('[data-testid="pillar-card"]').count() == 3, "trụ cột ẩn không render"
    hidden_stored = page.evaluate(
        f"(() => {{ const s = JSON.parse(localStorage.getItem('{month_key}') || '{{}}'); return (s.pillars||[]).filter(p => p.hidden).length; }})()"
    )
    assert hidden_stored == 1, f"phải có đúng 1 trụ cột hidden: {hidden_stored}"

    # Reset template → 3 trụ cột mặc định
    page.once("dialog", lambda dialog: dialog.accept())
    page.locator('[data-action="pillars-reset"]').click()
    page.wait_for_timeout(300)
    assert page.locator('[data-testid="pillar-card"]').count() == 3
    names_after = page.locator('[data-testid="pillar-card"] .pillar-name').all_inner_texts()
    assert any("Cơ thể" in n for n in names_after), "reset phải khôi phục template mặc định"

    assert_no_page_overflow(page, f"pillars {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def metrics_checks(browser, base, width, height, errors, screenshot):
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"metrics {width}px: {error}"))
    load_app(page, base)
    page.evaluate("""
      () => {
        const ids = ['goals', 'mood', 'habits', 'date-card', 'weekly-chart', 'scene-card', 'streak-heatmap', 'badges'];
        localStorage.setItem('planner-widgets-overview', JSON.stringify(
          ids.map((id, order) => ({ id, order, visible: true }))
        ));
      }
    """)
    page.reload(wait_until="networkidle")
    page.wait_for_selector('[data-testid="pillars-block"]', state="visible")
    num_days = page.evaluate("NUM_DAYS")

    # 1) Thêm metric HABIT liên kết habit đầu tiên, target daily
    page.locator('[data-testid="pillar-card"] [data-action="metric-add"]').first.click()
    page.wait_for_selector('[data-testid="metric-edit-modal"]:visible', state="visible")
    page.locator('[data-role="metric-title"]').fill("Ngủ đủ")
    page.locator('[data-metric-type="HABIT"]').click()
    page.locator('[data-role="metric-habit"]').select_option(index=1)
    page.locator('[data-action="metric-save"]').click()
    page.wait_for_selector('[data-testid="metric-edit-modal"]:visible', state="detached")
    row = page.locator('[data-testid="metric-row"]', has_text="Ngủ đủ")
    assert row.count() == 1, "metric HABIT phải render trong pillar card"
    assert row.locator('[role="progressbar"]').count() == 1, "phải có progress bar"
    linked = page.evaluate("""(() => {
      const k = window.TaskFlowShell.monthKey(new Date().getFullYear(), new Date().getMonth());
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      const m = (s.pillars && s.pillars[0] && s.pillars[0].metrics || [])[0];
      return m ? { type: m.type, linked: m.linkedHabitId || null, id: m.id } : null;
    })()""")
    assert linked and linked["type"] == "HABIT" and linked["linked"], "metric phải lưu type HABIT + linkedHabitId"

    # 2) Progress theo habit: chỉ tick ngày 0 → reload → 1/NUM_DAYS
    page.evaluate("""((habId) => {
      const k = window.TaskFlowShell.monthKey(new Date().getFullYear(), new Date().getMonth());
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      const h = s.habits.find(x => x.id === habId);
      if (h) h.days = [true].concat(Array(Math.max(1, h.days.length - 1)).fill(false));
      localStorage.setItem(k, JSON.stringify(s));
    })""", linked["linked"])
    page.reload(wait_until="networkidle")
    page.wait_for_selector('[data-testid="pillars-block"]', state="visible")
    row = page.locator('[data-testid="metric-row"]', has_text="Ngủ đủ")
    assert f"1/{num_days}" in row.locator(".metric-num").inner_text(), \
        f"progress habit phải là 1/{num_days}: {row.locator('.metric-num').inner_text()}"

    # 3) Metric MANUAL: day strip 31 ô, click 2 ô → 2/NUM_DAYS
    page.locator('[data-testid="pillar-card"] [data-action="metric-add"]').first.click()
    page.wait_for_selector('[data-testid="metric-edit-modal"]:visible', state="visible")
    page.locator('[data-role="metric-title"]').fill("Đọc sách")
    page.locator('[data-action="metric-save"]').click()  # MANUAL mặc định, daily
    page.wait_for_selector('[data-testid="metric-edit-modal"]:visible', state="detached")
    mrow = page.locator('[data-testid="metric-row"]', has_text="Đọc sách")
    assert mrow.count() == 1
    cells = mrow.locator(".metric-day-cell")
    assert cells.count() == num_days, f"day strip phải có {num_days} ô, có {cells.count()}"
    cells.nth(0).click()
    cells.nth(5).click()
    page.wait_for_timeout(250)
    assert f"2/{num_days}" in mrow.locator(".metric-num").inner_text(), \
        f"manual progress phải là 2/{num_days}: {mrow.locator('.metric-num').inner_text()}"
    assert mrow.locator('.metric-day-cell[aria-pressed="true"]').count() == 2, "2 ô ngày phải được đánh dấu"

    # 4) Sửa metric (đổi tên) qua modal
    mrow.locator('[data-action="metric-edit"]').click()
    page.wait_for_selector('[data-testid="metric-edit-modal"]:visible', state="visible")
    page.locator('[data-role="metric-title"]').fill("Đọc 20 phút")
    page.locator('[data-action="metric-save"]').click()
    page.wait_for_selector('[data-testid="metric-edit-modal"]:visible', state="detached")
    assert page.locator('[data-testid="metric-row"]', has_text="Đọc 20 phút").count() == 1, "metric phải được đổi tên"

    # 5) Xoá metric
    row2 = page.locator('[data-testid="metric-row"]', has_text="Đọc 20 phút")
    page.once("dialog", lambda dialog: dialog.accept())
    row2.locator('[data-action="metric-delete"]').click()
    page.wait_for_timeout(300)
    assert page.locator('[data-testid="metric-row"]', has_text="Đọc 20 phút").count() == 0, "metric phải bị xoá"

    assert_no_page_overflow(page, f"metrics {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def task_focus_metrics_checks(browser, base, width, height, errors, screenshot):
    """P4: TASK aggregates many linked tasks; FOCUS uses only linked-task logs."""
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"task-focus-metrics {width}px: {error}"))
    load_app(page, base)

    # Create both metric types through the real editor.
    first_pillar = page.locator('[data-testid="pillar-card"]').first
    for title, metric_type, target in (("P4 Tasks", "TASK", "2"), ("P4 Focus", "FOCUS", "30")):
        first_pillar.locator('[data-action="metric-add"]').click()
        page.wait_for_selector('[data-testid="metric-edit-modal"]:visible', state="visible")
        page.locator('[data-role="metric-title"]').fill(title)
        page.locator(f'[data-metric-type="{metric_type}"]').click()
        page.locator('[data-role="metric-target-value"]').fill(target)
        page.locator('[data-action="metric-save"]').click()
        page.wait_for_selector('[data-testid="metric-edit-modal"]:visible', state="detached")

    metric_ids = page.evaluate("""() => {
      const now = new Date();
      const key = window.TaskFlowShell.monthKey(now.getFullYear(), now.getMonth());
      const state = JSON.parse(localStorage.getItem(key));
      const metrics = state.pillars.flatMap(p => p.metrics || []);
      return {
        key,
        task: metrics.find(m => m.title === 'P4 Tasks').id,
        focus: metrics.find(m => m.title === 'P4 Focus').id,
      };
    }""")

    # Give three real scheduled tasks stable labels and a clean P4 baseline.
    page.evaluate("""({ key }) => {
      const state = JSON.parse(localStorage.getItem(key));
      const tasks = state.weeks.flatMap(w => w.days.flatMap(d => d.tasks || []));
      if (tasks.length < 3) throw new Error('P4 E2E requires three scheduled tasks');
      ['P4 linked focus', 'P4 linked task', 'P4 unlinked focus'].forEach((text, index) => {
        tasks[index].text = text;
        tasks[index].done = false;
        tasks[index].linkedMetricIds = [];
        tasks[index].focusLog = [];
      });
      localStorage.setItem(key, JSON.stringify(state));
    }""", metric_ids)

    page.goto(f"{base}/app.html?view=week&w=1", wait_until="networkidle")
    page.wait_for_selector('[data-testid="week-view"] .week-page', state="visible")

    def link_task(task_text, metric_titles):
        row = page.locator('.task-row', has_text=task_text).first
        row.hover()
        row.locator('[data-action="task-menu"]').click()
        row.locator('[data-action="task-detail"]').click()
        page.wait_for_selector('[data-role="td-linked-metrics"]', state="visible")
        group = page.locator('[data-role="td-linked-metrics"]')
        for metric_title in metric_titles:
            group.locator('.td-metric-option', has_text=metric_title).locator('input').check()
        page.locator('[data-testid="task-drawer"] [data-action="task-detail-close"]').click()

    link_task('P4 linked focus', ('P4 Tasks', 'P4 Focus'))
    link_task('P4 linked task', ('P4 Tasks',))

    # Complete one linked task through the real task toggle.
    first_row = page.locator('.task-row', has_text='P4 linked focus').first
    first_row.locator('[data-action="task"]').click()

    page.goto(f"{base}/app.html?view=overview", wait_until="networkidle")
    page.wait_for_selector('[data-testid="pillars-block"]', state="visible")
    task_row = page.locator('[data-testid="metric-row"]', has_text='P4 Tasks')
    assert '1/2' in task_row.locator('.metric-num').inner_text()

    # Inject duration only: the production focus timer already writes this same focusLog shape.
    # The unlinked task deliberately has more time and must not affect the metric.
    page.evaluate("""({ key }) => {
      const state = JSON.parse(localStorage.getItem(key));
      const tasks = state.weeks.flatMap(w => w.days.flatMap(d => d.tasks || []));
      const day = new Date();
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      tasks.find(t => t.text === 'P4 linked focus').focusLog = [{ d: date, secs: 2400 }];
      tasks.find(t => t.text === 'P4 unlinked focus').focusLog = [{ d: date, secs: 7200 }];
      localStorage.setItem(key, JSON.stringify(state));
    }""", metric_ids)
    page.reload(wait_until="networkidle")
    page.wait_for_selector('[data-testid="pillars-block"]', state="visible")
    focus_row = page.locator('[data-testid="metric-row"]', has_text='P4 Focus')
    assert '40/30' in focus_row.locator('.metric-num').inner_text(), focus_row.inner_text()

    # Reload persistence + mobile/dark compatible Task Detail.
    page.goto(f"{base}/app.html?view=week&w=1", wait_until="networkidle")
    linked_row = page.locator('.task-row', has_text='P4 linked focus').first
    linked_row.hover()
    linked_row.locator('[data-action="task-menu"]').click()
    linked_row.locator('[data-action="task-detail"]').click()
    group = page.locator('[data-role="td-linked-metrics"]')
    assert group.locator('[data-action="td-metric-link"]:checked').count() == 2
    if width <= 390:
        for option in group.locator('.td-metric-option').all():
            assert option.bounding_box()['height'] >= 44
    page.evaluate("localStorage.setItem('planner-dark', '1')")
    page.reload(wait_until="networkidle")
    assert page.locator('html').get_attribute('data-dark') == 'true'
    assert_no_page_overflow(page, f"task-focus-metrics {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def dark_overview_checks(browser, base, width, height, errors, screenshot):
    page = make_page(browser, width, height)
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
    landing = make_page(browser, width, height)
    landing.on("pageerror", lambda error: errors.append(f"release landing {width}px: {error}"))
    landing.goto(f"{base}/index.html", wait_until="networkidle")
    assert_no_page_overflow(landing, f"release landing {width}px")
    landing.close()

    for view in ("overview", "week", "year", "calendar"):
        page = make_page(browser, width, height)
        page.on("pageerror", lambda error, v=view: errors.append(f"release {v} {width}px: {error}"))
        page.add_init_script("localStorage.setItem('planner-onboarded','1');")
        page.goto(f"{base}/app.html?view={view}", wait_until="networkidle")
        page.wait_for_selector(f'[data-testid="{view}-view"]', state="visible")
        assert page.locator(f'[data-testid="{view}-view"] h1').count() == 1
        assert_no_page_overflow(page, f"release {view} {width}px")
        page.close()


def main():
    parser = argparse.ArgumentParser(description="TaskFlow E2E frontend suite")
    parser.add_argument("--view", choices=["overview", "week", "year", "calendar", "inbox", "deeplink", "taskdetail", "task-focus-metrics"], default="overview")
    parser.add_argument("--dialogs", action="store_true")
    parser.add_argument("--landing", action="store_true")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--screenshots", action="store_true")
    parser.add_argument(
        "--browser",
        choices=["chromium", "firefox", "webkit"],
        default="chromium",
        help="browser engine to run against (full --all matrix is Chromium-focused)",
    )
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
            browser = getattr(playwright, args.browser).launch(headless=True)
            if args.all:
                release_layout_checks(browser, base, 360, 800, errors)
                release_layout_checks(browser, base, 1024, 768, errors)
                # P0.2: small mobile 360x800 + desktop large 1920x1080 now run full scenarios,
                # not just the layout-only release pass.
                matrix = ((360, 800), (390, 844), (768, 1024), (1440, 900), (1920, 1080))
                scenarios = (
                    ("landing", landing_checks),
                    ("overview", overview_checks),
                    ("week", week_checks),
                    ("year", year_checks),
                    ("calendar", calendar_checks),
                    ("inbox", inbox_checks),
                    ("deeplink", deeplink_checks),
                    ("taskdetail", taskdetail_checks),
                    ("dialogs", dialog_checks),
                    ("focus", focus_checks),
                    ("dark-overview", dark_overview_checks),
                    ("reflection", reflection_checks),
                    ("pillars", pillars_checks),
                    ("metrics", metrics_checks),
                    ("task-focus-metrics", task_focus_metrics_checks),
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
            elif args.view == "taskdetail":
                taskdetail_checks(browser, base, 1440, 900, errors, shots["desktop"])
                taskdetail_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "task-focus-metrics":
                task_focus_metrics_checks(browser, base, 1440, 900, errors, shots["desktop"])
                task_focus_metrics_checks(browser, base, 390, 844, errors, shots["mobile"])

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
    label = "RELEASE" if args.all else "LANDING" if args.landing else "DIALOGS" if args.dialogs else args.view.upper()
    print(f"E2E {label} OK")
    print("SCREENSHOTS:", shots["desktop"], shots["mobile"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
