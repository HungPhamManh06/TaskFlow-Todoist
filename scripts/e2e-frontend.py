"""Focused browser checks for the TaskFlow refined frontend views.

Cross-browser: --browser chromium|firefox|webkit (default chromium).
The full matrix (--all, 32 scenarios x 5 viewports) targets Chromium;
single scenarios also run on Firefox/WebKit.
"""
import argparse
import http.server
import json
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

    # Playwright đóng kết nối đột ngột khi kết thúc test → Python http.server in
    # BrokenPipeError/ConnectionResetError ra log. Không phải lỗi production; bỏ
    # qua 2 exception này ở handler (vẫn giữ mọi lỗi khác + fail test assertion).
    def handle_error(self, request, client_address):
        import sys
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)

    # Mô phỏng Vercel cleanUrls: /app → /app.html (P6: internal links dùng clean URL).
    # Chú ý: chỉ xét extension của PATH, không phải query string — payload share
    # (?url=https%3A%2F%2Fexample.com%2Fa) chứa dấu chấm trong query, nếu xét cả
    # query thì splitext tìm thấy extension giả → bỏ qua fallback .html → 404.
    def translate_path(self, path):
        translated = super().translate_path(path)
        if os.path.isfile(translated):
            return translated
        clean_path = path.split("?", 1)[0].split("#", 1)[0]
        if not os.path.splitext(clean_path)[1] and not translated.endswith(os.sep):
            candidate = translated + ".html"
            if os.path.isfile(candidate):
                return candidate
        return translated


def assert_no_page_overflow(page, label):
    overflow = page.evaluate(
        "document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    assert overflow <= 1, f"{label} horizontal overflow: {overflow}px"


def make_page(browser, width, height, service_workers="allow"):
    # Motion determinism: emulate prefers-reduced-motion (the app honors it in
    # CSS + JS) so every smooth scroll is instant. Without this, WebKit
    # suppresses or mis-targets clicks that land while a scroll is still in
    # flight (elements move under the cursor → "intercepts pointer events"
    # retries, flaky toggles), and Firefox scrolls more slowly than Chromium so
    # geometry reads can straddle two scroll positions. Reduced-motion removes
    # animation timing from the suite on every engine.
    page = browser.new_page(
        viewport={"width": width, "height": height},
        service_workers=service_workers,
    )
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

    # P0.2C regression: blank-draft lifecycle (ea26fc5) must not swallow the first
    # click on another task's checkbox. Days boot EMPTY (no pre-seeded tasks), so
    # first create a REAL task (type into the draft), then abandon a blank draft
    # and click the existing task's checkbox while the draft still has focus.
    panel = page.locator(".week-day-panel").first
    task_count = panel.locator(".task-row").count()
    panel.locator('[data-action="addtask"]').first.click()
    assert panel.locator(".task-row").count() == task_count + 1
    assert page.evaluate("document.activeElement && document.activeElement.dataset.role") == "task-text"
    # Type a real task so it survives the blank-draft cleanup.
    panel.locator('[data-role="task-text"]').first.fill("E2E week task")

    # Second task: leave it blank + focused — an abandoned draft.
    panel.locator('[data-action="addtask"]').first.click()
    assert panel.locator('[data-role="task-text"]').count() == 2
    assert page.evaluate("document.activeElement && document.activeElement.dataset.role") == "task-text"

    # Click the EXISTING (real) task's checkbox while the blank draft has focus.
    # Regression: a synchronous renderWeek() in focusout destroyed the clicked
    # checkbox before its click event → first click swallowed, day progress frozen.
    day_progress = panel.locator('[data-role="day-progress"]')
    day_before = day_progress.get_attribute("aria-valuenow")
    real_check = panel.locator('[data-action="task"]').first
    real_check.click()
    assert real_check.get_attribute("aria-checked") == "true", "existing task must toggle on the FIRST click"
    assert day_progress.get_attribute("aria-valuenow") != day_before
    assert day_progress.locator('[data-role="day-progress-fill"]').get_attribute("style")

    # Abandoned blank draft must be cleaned up from the DOM and storage.
    panel.locator('[data-role="task-text"]').nth(1).wait_for(state="detached")
    assert panel.locator('[data-role="task-text"]').count() == 1
    page.evaluate("window.flushPendingSaves && window.flushPendingSaves()")
    blank_left = page.evaluate(
        """() => {
            try {
                const keys = Object.keys(localStorage).filter((k) => /^planner-\\d{4}-\\d{1,2}$/.test(k));
                for (const k of keys) {
                    const s = JSON.parse(localStorage.getItem(k));
                    const tks = (s.weeks || []).flatMap((w) => (w.days || []).flatMap((d) => d.tasks || []));
                    if (tks.some((tk) => window.TaskFlowDataMigrations.isTaskTrulyEmpty(tk))) return true;
                }
                return false;
            } catch (e) { return true; }
        }"""
    )
    assert not blank_left, "abandoned blank draft must not persist in localStorage"

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

    # Regression guard (V2 fix): the Tháng/Lịch trình segmented control must
    # keep its exact position when switching modes — Month has 3 header children
    # (heading + toggle + legend), Schedule only 2 (heading + toggle). With a flex
    # space-between header the toggle used to jump to the far right in Schedule;
    # the header is now an explicit 3-column grid so column 2 is mode-independent.
    toggle = page.locator(".cal-mode-toggle")
    month_box = toggle.bounding_box()
    assert month_box, "cal-mode-toggle phải hiển thị ở Month mode"
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').click()
    page.wait_for_timeout(200)
    sched_box = toggle.bounding_box()
    assert sched_box, "cal-mode-toggle phải hiển thị ở Schedule mode"
    assert abs(month_box["x"] - sched_box["x"]) <= 2, \
        f"cal-mode-toggle nhảy vị trí x: month {month_box['x']:.1f} vs schedule {sched_box['x']:.1f}"
    assert abs(month_box["width"] - sched_box["width"]) <= 1, \
        f"cal-mode-toggle đổi width: month {month_box['width']:.1f} vs schedule {sched_box['width']:.1f}"
    # Reverse direction: Schedule -> Month cũng phải đứng yên.
    page.locator('[data-action="cal-mode"][data-mode="month"]').click()
    page.wait_for_timeout(200)
    back_box = toggle.bounding_box()
    assert back_box, "cal-mode-toggle phải hiển thị sau khi quay lại Month"
    assert abs(month_box["x"] - back_box["x"]) <= 2
    assert abs(month_box["width"] - back_box["width"]) <= 1

    # Regression guard (V2 segmented + flicker): the .cal-mode-toggle DOM node and the
    # #view-calendar root must survive Month <-> Schedule switches — the calendar page
    # shell (header + toggle + legend slot) is built once; only .calendar-mode-content
    # swaps. A whole-view wipe (removedNodes >= 3 at root level) fails the test.
    page.evaluate("""() => {
      window.__calToggle = document.querySelector('.cal-mode-toggle');
      window.__calRoot = document.querySelector('#view-calendar');
      const root = document.querySelector('#view-calendar');
      window.__calWipe = false;
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          // whole-view wipe = the ROOT's direct children are removed in bulk
          if (m.type === 'childList' && m.target === root && m.removedNodes.length >= 3) window.__calWipe = true;
        }
      });
      mo.observe(root, { childList: true, subtree: true });
      window.__calMo = mo;
    }""")
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').click()
    page.wait_for_timeout(200)
    assert page.evaluate(
        "window.__calToggle === document.querySelector('.cal-mode-toggle') && "
        "window.__calRoot === document.querySelector('#view-calendar')"), \
        "mode switch phải GIỮ NGUYÊN .cal-mode-toggle + #view-calendar"
    assert not page.evaluate("window.__calWipe"), "đổi mode không được xoá toàn bộ #view-calendar"
    assert page.evaluate("document.activeElement === document.querySelector('[data-mode=\"schedule\"]')"), \
        "focus phải giữ trên nút vừa bấm sau khi đổi mode"
    page.locator('[data-action="cal-mode"][data-mode="month"]').click()
    page.wait_for_timeout(200)
    assert page.evaluate(
        "window.__calToggle === document.querySelector('.cal-mode-toggle')"), \
        "quay lại Month phải giữ nguyên toggle"

    page.screenshot(path=screenshot, full_page=False)
    page.close()


def segmented_geometry_checks(browser, base, width, height, errors, screenshot):
    """V2 segmented control: geometry parity between the reference (Upcoming
    7/14/30), Calendar Tháng/Lịch trình and Projects filters — same capsule
    language (outer radius, item height, active-pill radius). Desktop only;
    mobile asserts the wrap stays on-page with no overflow."""
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"seggeo {width}px: {error}"))
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")

    # Reference: Upcoming 7/14/30 control.
    page.goto(f"{base}/app.html?view=upcoming", wait_until="networkidle")
    page.wait_for_selector('.up-range', state="visible")
    ref = page.evaluate("""() => {
      const c = document.querySelector('.up-range');
      const it = c && c.querySelector('.segmented-item');
      const act = c && c.querySelector('.segmented-item.active');
      if (!c || !it || !act) return null;
      const cs = getComputedStyle(c), is = getComputedStyle(it), as = getComputedStyle(act);
      return {
        outerRadius: parseFloat(cs.borderTopLeftRadius),
        itemHeight: it.getBoundingClientRect().height,
        itemRadius: parseFloat(is.borderTopLeftRadius),
        activeRadius: parseFloat(as.borderTopLeftRadius),
      };
    }""")
    assert ref, "không đo được reference control (.up-range)"
    tol = 2

    def measure(sel, itemSel, actSel):
        return page.evaluate("""([sel, itemSel, actSel]) => {
          const c = document.querySelector(sel);
          const it = c && c.querySelector(itemSel);
          const act = c && c.querySelector(actSel);
          if (!c || !it || !act) return null;
          const cs = getComputedStyle(c), is = getComputedStyle(it), as = getComputedStyle(act);
          return {
            outerRadius: parseFloat(cs.borderTopLeftRadius),
            itemHeight: it.getBoundingClientRect().height,
            itemRadius: parseFloat(is.borderTopLeftRadius),
            activeRadius: parseFloat(as.borderTopLeftRadius),
          };
        }""", [sel, itemSel, actSel])

    if width >= 768:
        # Calendar
        page.goto(f"{base}/app.html?view=calendar", wait_until="networkidle")
        page.wait_for_selector('.cal-mode-toggle', state="visible")
        cal = measure('.cal-mode-toggle', '.segmented-item', '.segmented-item.active')
        assert cal, "không đo được .cal-mode-toggle"
        assert abs(cal["outerRadius"] - ref["outerRadius"]) <= tol, \
            f"calendar outer radius lệch: {cal['outerRadius']} vs {ref['outerRadius']}"
        assert abs(cal["itemHeight"] - ref["itemHeight"]) <= tol, \
            f"calendar item height lệch: {cal['itemHeight']} vs {ref['itemHeight']}"
        assert abs(cal["activeRadius"] - ref["activeRadius"]) <= tol, \
            f"calendar active pill radius lệch: {cal['activeRadius']} vs {ref['activeRadius']}"
        # Projects
        page.goto(f"{base}/app.html?view=projects", wait_until="networkidle")
        page.wait_for_selector('.pj-filters', state="visible")
        pj = measure('.pj-filters', '.segmented-item', '.segmented-item.active')
        assert pj, "không đo được .pj-filters"
        assert abs(pj["outerRadius"] - ref["outerRadius"]) <= tol, \
            f"projects outer radius lệch: {pj['outerRadius']} vs {ref['outerRadius']}"
        assert abs(pj["itemHeight"] - ref["itemHeight"]) <= tol, \
            f"projects item height lệch: {pj['itemHeight']} vs {ref['itemHeight']}"
        assert abs(pj["activeRadius"] - ref["activeRadius"]) <= tol, \
            f"projects active pill radius lệch: {pj['activeRadius']} vs {ref['activeRadius']}"
    else:
        # Mobile: filters wrap without body overflow; labels not clipped.
        page.goto(f"{base}/app.html?view=projects", wait_until="networkidle")
        page.wait_for_selector('.pj-filters', state="visible")
        assert_no_page_overflow(page, f"segmented-projects {width}px")
        labels = page.locator('.pj-filters .segmented-item').all_inner_texts()
        assert any("Đang thực hiện" in s for s in labels), f"label Đang thực hiện bị thiếu: {labels}"

    page.screenshot(path=screenshot, full_page=False)
    page.close()


def install_schedule_source_assets(page):
    """Opt into authored Schedule assets before Task 5 regenerates bundles."""
    page.route(
        "**/css/styles-critical.min.css*",
        lambda route: route.fulfill(
            path=os.path.join(ROOT, "css", "styles.css"), content_type="text/css"
        ),
    )
    page.route(
        "**/css/styles-deferred.min.css*",
        lambda route: route.fulfill(body="", content_type="text/css"),
    )
    for asset in ("i18n", "timeblocks-ui", "app"):
        source = os.path.join(ROOT, "js", f"{asset}.js")
        page.route(
            f"**/js/{asset}.min.js*",
            lambda route, _request, source=source: route.fulfill(
                path=source, content_type="application/javascript"
            ),
        )


def schedule_unscheduled_checks(
    browser, base, width, height, errors, screenshot, source_assets=False
):
    """V2 Schedule UX: disclosure density + quick schedule.
    1) Seed nine real tasks today; Quick Add creates the tenth
    2) collapsed/expanded disclosure renders 5 → 10 → 5 rows
    3) expand and quick-schedule Test Schedule Task through the real dialog
    4) save leaves nine unscheduled tasks and exactly one persisted block
    5) Month/Schedule switches preserve the Calendar shell and toggle DOM node
    """
    page = make_page(browser, width, height, service_workers="block")
    page.on("pageerror", lambda error: errors.append(f"tbsched {width}px: {error}"))
    page.on("dialog", lambda dialog: dialog.accept())
    # Tasks 1-4 can verify source before release assets are regenerated in Task 5.
    # The default remains production-like so --all exercises the real minified bundles.
    if source_assets:
        install_schedule_source_assets(page)
    page.add_init_script("""(() => {
      localStorage.setItem('planner-onboarded','1');
      // Only seed on the FIRST load of the scenario — reload must keep UI-created data.
      if (localStorage.getItem('tbsched-seeded')) return;
      localStorage.setItem('tbsched-seeded','1');
      localStorage.removeItem('planner-timeblocks');
      const now = new Date();
      const year = now.getFullYear(), month = now.getMonth();
      const key = 'planner-' + year + '-' + (month + 1);
      let state;
      try { state = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { state = null; }
      if (!state) state = { version: 1, weeks: [], pillars: [], habits: [] };
      state.monthKey = key; state.schemaVersion = 2;
      if (!Array.isArray(state.monthlyGoals)) state.monthlyGoals = [];
      if (!Array.isArray(state.habits)) state.habits = [];
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const numWeeks = Math.ceil((offset + daysInMonth) / 7);
      state.weeks = [];
      for (let w = 0; w < numWeeks; w++) {
        const days = [];
        for (let d = 0; d < 7; d++) days.push({ tasks: [] });
        state.weeks.push({ n: w + 1, goals: [], days });
      }
      const planStart = new Date(year, month, 1 - offset);
      const today = new Date(year, month, now.getDate());
      const delta = Math.floor((today - planStart) / 86400000);
      const week = Math.floor(delta / 7), day = delta % 7;
      state.weeks[week].days[day].tasks = Array.from({ length: 9 }, (_, i) => ({
        uid: 'tbsched-seed-' + (i + 1),
        kind: i === 0 ? 'priority' : 'regular',
        done: false,
        text: 'Seed Schedule Task ' + (i + 1),
        duration: 15 + (i * 5),
      }));
      localStorage.setItem(key, JSON.stringify(state));
    })()""")
    page.goto(f"{base}/app.html?view=calendar", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="calendar-view"]', state="visible")

    # 1) Schedule mode, jump to today for a deterministic date
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').scroll_into_view_if_needed()
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').click()
    page.wait_for_selector('[data-testid="schedule-view"]', state="visible")
    page.locator('[data-action="tb-today"]').first.scroll_into_view_if_needed()
    page.locator('[data-action="tb-today"]').first.click()
    page.wait_for_timeout(150)
    today = page.evaluate("""(() => {
      const n = new Date();
      return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
    })()""")
    assert page.locator('[data-testid="tb-unscheduled"] .tb-uns-row').count() == 5, \
        "nine seeded tasks must initially render only five rows"

    # 2) + Thêm công việc (global header button; mobile falls back to the FAB)
    add_task = page.locator('[data-action="shell-add-task"]')
    if add_task.count() and add_task.first.is_visible():
        add_task.first.scroll_into_view_if_needed()
        add_task.first.click()
    else:
        add_task.last.scroll_into_view_if_needed()
        add_task.last.click()
    page.wait_for_selector('[data-testid="quick-add"]:visible', state="visible")
    # Phase 5 regression: Quick Add defaults to the selected Schedule date
    date_val = page.locator('#quickAddDate').input_value()
    assert date_val == today, f"Quick Add phải mặc định ngày schedule ({today}), thấy {date_val}"
    page.locator('#quickAddInput').fill("Test Schedule Task")
    page.locator('#quickAddDur').fill("30")
    page.locator('[data-action="quickadd-do"]').click()
    page.wait_for_selector('[data-testid="quick-add"]:visible', state="detached")

    # 3) The tenth task is initially collapsed; disclosure expands and collapses accessibly.
    page.wait_for_selector('[data-testid="tb-unscheduled"]', state="visible")
    rows = page.locator('[data-testid="tb-unscheduled"] .tb-uns-row')
    assert rows.count() == 5, f"collapsed disclosure must show 5 rows, saw {rows.count()}"
    toggle = page.locator('[data-action="tb-uns-toggle"]')
    assert toggle.get_attribute('aria-expanded') == 'false'
    assert '5' in toggle.inner_text(), "collapsed disclosure must announce five remaining tasks"
    toggle.click()
    assert rows.count() == 10, f"expanded disclosure must show 10 rows, saw {rows.count()}"
    assert toggle.get_attribute('aria-expanded') == 'true'
    assert "Test Schedule Task" in page.locator('[data-testid="tb-unscheduled"]').inner_text(), \
        "expanded section must expose the Quick Added task"
    toggle.click()
    assert rows.count() == 5, f"collapsed disclosure must return to 5 rows, saw {rows.count()}"
    assert toggle.get_attribute('aria-expanded') == 'false'
    assert page.locator('.tb-block').count() == 0, \
        "Add Task KHÔNG được tự tạo TimeBlock"

    # 4) Expand and target the Quick Added task, not whichever row happens to be first.
    toggle.click()
    target_row = page.locator('[data-testid="tb-unscheduled"] .tb-uns-row', has_text="Test Schedule Task")
    assert target_row.count() == 1, "expanded disclosure must contain exactly one Test Schedule Task row"
    target_quick = target_row.locator('[data-action="tb-quick"]')
    target_quick.scroll_into_view_if_needed()
    target_quick.click()
    page.wait_for_selector('[data-testid="timeblock-modal"]:visible', state="visible")
    sel_text = page.locator('[data-role="tb-task"] option:checked').inner_text()
    assert sel_text == "Test Schedule Task", f"dialog phải pre-select task, thấy {sel_text}"
    assert page.locator('[data-role="tb-date"]').input_value() == today, "dialog phải giữ ngày đã chọn"
    # duration prefill: 09:00 default start + 30 min
    assert page.locator('[data-role="tb-end"]').input_value() == "09:30", \
        "dialog phải đề xuất end = start + duration"
    page.locator('[data-role="tb-start"]').fill("19:00")
    page.locator('[data-role="tb-end"]').fill("20:00")
    page.locator('[data-action="tb-save"]').click()
    page.wait_for_selector('[data-testid="timeblock-modal"]:visible', state="detached")
    page.wait_for_timeout(250)

    # 5) The scheduled task leaves the collection; the nine seed tasks remain exactly once.
    assert page.locator('[data-testid="tb-unscheduled"] .tb-uns-row').count() == 9, \
        "saving one of ten tasks must leave nine unscheduled rows while expanded"
    assert "Test Schedule Task" not in page.locator('[data-testid="tb-unscheduled"]').inner_text(), \
        "scheduled task must leave the unscheduled collection"
    assert page.locator('.tb-block').count() == 1, "timeline phải hiển thị đúng 1 block"
    assert "Test Schedule Task" in page.locator('.tb-block').inner_text(), "block phải mang tên task"

    # Selected-day navigation resets disclosure state without changing the collection.
    page.locator('[data-action="tb-next"]').first.click()
    page.locator('[data-action="tb-prev"]').first.click()
    page.wait_for_timeout(150)
    assert page.locator('[data-testid="tb-unscheduled"] .tb-uns-row').count() == 5, \
        "day navigation must reset the disclosure to five visible rows"
    assert page.locator('.tb-block').count() == 1, "day navigation must preserve the saved block"

    # reload → persists (init script must not wipe)
    page.goto(f"{base}/app.html?view=calendar", wait_until="networkidle")
    page.wait_for_selector('[data-testid="calendar-view"]', state="visible")
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').scroll_into_view_if_needed()
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').click()
    page.wait_for_selector('[data-testid="schedule-view"]', state="visible")
    page.locator('[data-action="tb-today"]').first.click()
    page.wait_for_timeout(200)
    reload_rows = page.locator('[data-testid="tb-unscheduled"] .tb-uns-row').count()
    assert reload_rows == 5, \
        f"reload must reset ephemeral disclosure state to five visible rows, saw {reload_rows}"
    assert "Test Schedule Task" not in page.locator('[data-testid="tb-unscheduled"]').inner_text(), \
        "reload: scheduled task must not return to unscheduled"
    assert page.locator('.tb-block').count() == 1, "reload: block phải còn trong timeline"

    # 6) Mode switch Month→Schedule→(back): toggle position stable, no duplicates
    toggle = page.locator(".cal-mode-toggle")
    toggle_handle = toggle.element_handle()
    assert toggle_handle, "cal-mode-toggle must have a stable DOM handle"
    page.locator('[data-action="cal-mode"][data-mode="month"]').click()
    page.wait_for_timeout(200)
    assert page.evaluate('(node) => node === document.querySelector(".cal-mode-toggle")', toggle_handle), \
        "Month switch must preserve cal-mode-toggle DOM identity"
    month_box = toggle.bounding_box()
    assert month_box, "cal-mode-toggle phải hiển thị ở Month mode"
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').click()
    page.wait_for_timeout(200)
    assert page.evaluate('(node) => node === document.querySelector(".cal-mode-toggle")', toggle_handle), \
        "Schedule switch must preserve cal-mode-toggle DOM identity"
    sched_box = toggle.bounding_box()
    assert sched_box, "cal-mode-toggle phải hiển thị ở Schedule mode"
    assert abs(month_box["x"] - sched_box["x"]) <= 2, \
        f"cal-mode-toggle nhảy vị trí: month {month_box['x']:.1f} vs schedule {sched_box['x']:.1f}"
    assert page.locator('.tb-block').count() == 1, "mode switch không được tạo block trùng"
    assert page.locator('[data-testid="tb-unscheduled"] .tb-uns-row').count() == 5, \
        "mode switch must preserve nine-task collection in collapsed presentation"
    n_tasks = page.evaluate("""(() => {
      const n = new Date();
      const key = 'planner-' + n.getFullYear() + '-' + (n.getMonth() + 1);
      const s = JSON.parse(localStorage.getItem(key) || 'null');
      if (!s || !Array.isArray(s.weeks)) return -1;
      const offset = (new Date(n.getFullYear(), n.getMonth(), 1).getDay() + 6) % 7;
      const start = new Date(n.getFullYear(), n.getMonth(), 1 - offset);
      const delta = Math.floor((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - start) / 86400000);
      const w = Math.floor(delta / 7), d = delta % 7;
      const day = s.weeks[w] && s.weeks[w].days[d];
      return day && Array.isArray(day.tasks) ? day.tasks.length : 0;
    })()""")
    assert n_tasks == 10, f"mode switch không được tạo task trùng (thấy {n_tasks})"

    assert_no_page_overflow(page, f"schedule-unscheduled {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def schedule_visual_case_checks(
    browser,
    base,
    errors,
    *,
    case_id,
    case_label,
    theme,
    dark,
    task_count,
    expanded,
    width,
    height,
    screenshot,
    source_assets=False,
):
    """Render and assert one deterministic Schedule visual fixture."""
    page = make_page(browser, width, height, service_workers="block")
    page.on(
        "pageerror",
        lambda error: errors.append(
            f"schedule-matrix {case_id} {width}x{height}: {error}"
        ),
    )
    if source_assets:
        install_schedule_source_assets(page)

    dark_value = "1" if dark else "0"
    seed = f"""(() => {{
      localStorage.setItem('planner-onboarded', '1');
      localStorage.setItem('planner-theme', {json.dumps(theme)});
      localStorage.setItem('planner-dark', {json.dumps(dark_value)});
      localStorage.removeItem('planner-timeblocks');
      const now = new Date();
      const year = now.getFullYear(), month = now.getMonth();
      const key = 'planner-' + year + '-' + (month + 1);
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const numWeeks = Math.ceil((offset + daysInMonth) / 7);
      const weeks = Array.from({{ length: numWeeks }}, (_, w) => ({{
        n: w + 1,
        goals: [],
        days: Array.from({{ length: 7 }}, () => ({{ tasks: [] }})),
      }}));
      const planStart = new Date(year, month, 1 - offset);
      const today = new Date(year, month, now.getDate());
      const delta = Math.floor((today - planStart) / 86400000);
      const week = Math.floor(delta / 7), day = delta % 7;
      weeks[week].days[day].tasks = Array.from({{ length: {task_count} }}, (_, i) => ({{
        uid: 'schedule-matrix-{case_id}-' + (i + 1),
        kind: i === 0 ? 'priority' : 'regular',
        done: false,
        text: 'Visual Schedule Task ' + (i + 1),
        duration: 20 + (i * 5),
        tags: [],
      }}));
      localStorage.setItem(key, JSON.stringify({{
        version: 1,
        schemaVersion: 2,
        monthKey: key,
        weeks,
        pillars: [],
        habits: [],
        monthlyGoals: [],
      }}));
    }})()"""
    page.add_init_script(seed)
    page.goto(f"{base}/app.html?view=calendar", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="calendar-view"]', state="visible")

    root_state = page.evaluate(
        "[document.documentElement.dataset.theme, document.documentElement.dataset.dark]"
    )
    assert root_state == [theme, str(dark).lower()], \
        f"{case_label}: expected {theme}/{dark_value}, saw {root_state}"

    # Month and Schedule must reuse the same segmented control and keep its geometry.
    mode_toggle = page.locator(".cal-mode-toggle")
    mode_handle = mode_toggle.element_handle()
    legend = page.locator(".calendar-page .cal-legend")
    legend_handle = legend.element_handle()
    month_box = mode_toggle.bounding_box()
    assert mode_handle and legend_handle and month_box, \
        f"{case_label}: Calendar header controls must exist before switching modes"
    month_grid = page.evaluate(
        "getComputedStyle(document.querySelector('.calendar-page-header')).gridTemplateColumns"
    )
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').click()
    page.wait_for_selector('[data-testid="schedule-view"]', state="visible")
    page.locator('[data-action="tb-today"]').first.click()
    page.wait_for_timeout(100)

    assert page.evaluate(
        '(node) => node === document.querySelector(".cal-mode-toggle")', mode_handle
    ), f"{case_label}: segmented control DOM identity changed"
    assert page.evaluate(
        '(node) => node === document.querySelector(".calendar-page .cal-legend")',
        legend_handle,
    ), f"{case_label}: legend slot DOM identity changed"
    schedule_box = mode_toggle.bounding_box()
    assert schedule_box, f"{case_label}: segmented control disappeared"
    assert abs(month_box["x"] - schedule_box["x"]) <= 2, \
        f"{case_label}: segmented control shifted horizontally"
    assert abs(month_box["width"] - schedule_box["width"]) <= 2, \
        f"{case_label}: segmented control width changed"
    assert abs(month_box["height"] - schedule_box["height"]) <= 2, \
        f"{case_label}: segmented control height changed"

    schedule_grid = page.evaluate(
        "getComputedStyle(document.querySelector('.calendar-page-header')).gridTemplateColumns"
    )
    assert schedule_grid == month_grid, \
        f"{case_label}: Calendar header grid changed: {month_grid} -> {schedule_grid}"
    if width > 720:
        assert len(schedule_grid.split()) == 3, \
            f"{case_label}: desktop Calendar header must retain three grid tracks"

    # Empty Schedule legend is visually absent while its stable node/slot remains.
    legend_style = legend.evaluate("""el => {
      const s = getComputedStyle(el);
      return {
        visibility: s.visibility,
        pointerEvents: s.pointerEvents,
        background: s.backgroundColor,
        borderWidths: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth],
        childCount: el.childElementCount,
      };
    }""")
    assert legend_style["childCount"] == 0, f"{case_label}: Schedule legend must be empty"
    assert legend_style["visibility"] == "hidden", f"{case_label}: empty legend remains visible"
    assert legend_style["pointerEvents"] == "none", f"{case_label}: empty legend accepts pointer events"
    assert legend_style["background"] in ("rgba(0, 0, 0, 0)", "transparent"), \
        f"{case_label}: empty legend has background {legend_style['background']}"
    assert all(value == "0px" for value in legend_style["borderWidths"]), \
        f"{case_label}: empty legend has a border {legend_style['borderWidths']}"

    timeline = page.locator('[data-testid="tb-timeline"]')
    assert timeline.count() == 1, f"{case_label}: timeline missing"
    assert page.locator('.tb-hour').count() == 24, f"{case_label}: timeline hour grid incomplete"
    rows = page.locator('[data-testid="tb-unscheduled"] .tb-uns-row')
    toggle = page.locator('[data-action="tb-uns-toggle"]')
    if task_count == 0:
        assert page.locator('[data-testid="tb-unscheduled"]').count() == 0, \
            f"{case_label}: empty fixture rendered an Unscheduled panel"
        expected_rows = 0
    else:
        expected_rows = task_count if expanded else min(task_count, 5)
        if task_count > 5:
            assert toggle.count() == 1, f"{case_label}: disclosure control missing"
            assert toggle.get_attribute("aria-expanded") == "false"
            if expanded:
                toggle.click()
                assert toggle.get_attribute("aria-expanded") == "true"
        else:
            assert toggle.count() == 0, f"{case_label}: unnecessary disclosure control rendered"
        assert rows.count() == expected_rows, \
            f"{case_label}: expected {expected_rows} rows, saw {rows.count()}"

        quick = rows.first.locator('[data-action="tb-quick"]')
        assert quick.is_visible() and quick.is_enabled(), \
            f"{case_label}: Quick Schedule is not usable"
        quick.scroll_into_view_if_needed()
        quick.click()
        page.wait_for_selector('[data-testid="timeblock-modal"]:visible', state="visible")
        assert page.locator('[data-role="tb-task"] option:checked').inner_text() == "Visual Schedule Task 1", \
            f"{case_label}: Quick Schedule did not target its row"
        page.locator('[data-action="tb-close"]').last.click()
        page.wait_for_selector('[data-testid="timeblock-modal"]:visible', state="detached")

    # The timeline must follow the preceding Schedule content directly. This
    # relational guard catches accidental spacer/empty-state growth regardless
    # of viewport height; the collapsed cap protects the initial-density goal.
    timeline_box = page.locator('.tb-timeline-wrap').bounding_box()
    assert timeline_box, f"{case_label}: timeline wrapper not rendered"
    prior = page.locator('[data-testid="tb-unscheduled"]') if task_count else page.locator('.tb-toolbar')
    prior_box = prior.bounding_box()
    assert prior_box, f"{case_label}: content immediately before timeline is missing"
    timeline_gap = timeline_box["y"] - (prior_box["y"] + prior_box["height"])
    assert 8 <= timeline_gap <= 18, \
        f"{case_label}: timeline gap must stay compact (8-18px), saw {timeline_gap:.1f}px"
    if not expanded:
        timeline_cap = 1120 if width <= 600 else 850
        assert timeline_box["y"] <= timeline_cap, \
            f"{case_label}: collapsed timeline starts at y={timeline_box['y']:.1f}, cap {timeline_cap}px"

    mobile_text_ratio = None
    if width <= 600 and task_count:
        first_row = rows.first
        row_box = first_row.bounding_box()
        dot_box = first_row.locator('.tb-uns-dot').bounding_box()
        text_box = first_row.locator('.tb-uns-text').bounding_box()
        duration_box = first_row.locator('.tb-uns-dur').bounding_box()
        quick_box = first_row.locator('.tb-uns-btn').bounding_box()
        text_flex = first_row.locator('.tb-uns-text').evaluate("""el => {
          const s = getComputedStyle(el);
          return { grow: Number(s.flexGrow), basis: s.flexBasis, minWidth: s.minWidth };
        }""")
        wrap = first_row.evaluate("el => getComputedStyle(el).flexWrap")
        assert row_box and dot_box and text_box and duration_box and quick_box, \
            f"{case_label}: mobile row parts must be measurable"
        assert wrap == "wrap", f"{case_label}: mobile unscheduled row does not wrap"
        assert text_flex["grow"] >= 1 and text_flex["basis"] in ("0%", "0px") \
            and text_flex["minWidth"] == "0px", \
            f"{case_label}: task name must own flexible available width, saw {text_flex}"
        min_text_width = max(96, row_box["width"] * 0.35)
        assert text_box["width"] >= min_text_width, \
            f"{case_label}: task name width {text_box['width']:.1f}px below {min_text_width:.1f}px"
        mobile_text_ratio = text_box["width"] / row_box["width"]
        dot_right = dot_box["x"] + dot_box["width"]
        text_right = text_box["x"] + text_box["width"]
        assert dot_right <= text_box["x"] + 1, \
            f"{case_label}: priority dot overlaps or follows task text"
        assert text_box["x"] < duration_box["x"] and text_right <= duration_box["x"] + 1, \
            f"{case_label}: task text and duration overlap or render out of order"
        assert duration_box["x"] + duration_box["width"] <= row_box["x"] + row_box["width"] + 1, \
            f"{case_label}: duration overflows its row"
        assert quick_box["width"] >= row_box["width"] - 18, \
            f"{case_label}: mobile Quick Schedule is not full-row usable"
        assert quick_box["height"] >= 44, \
            f"{case_label}: mobile Quick Schedule target is under 44px"

    assert_no_page_overflow(page, f"schedule-matrix {case_id} {width}x{height}")
    page.evaluate("window.scrollTo(0, 0)")
    page.screenshot(path=screenshot, full_page=False)
    page.close()
    return {
        "collapsed": not expanded,
        "timeline_y": timeline_box["y"],
        "timeline_gap": timeline_gap,
        "mobile_text_ratio": mobile_text_ratio,
    }


def schedule_visual_matrix_checks(browser, base, errors, source_assets=False):
    """Six Schedule states across the required responsive viewport matrix."""
    fixtures = (
        ("a", "A cream dark / 0 unscheduled", "cream", True, 0, False),
        ("b", "B cream dark / 3 unscheduled", "cream", True, 3, False),
        ("c", "C cream dark / 10 collapsed", "cream", True, 10, False),
        ("d", "D cream dark / 10 expanded", "cream", True, 10, True),
        ("e", "E cream light / 10 collapsed", "cream", False, 10, False),
        ("f", "F lavender dark / 10 collapsed", "lavender", True, 10, False),
    )
    viewports = (
        (360, 800),
        (390, 844),
        (412, 915),
        (768, 1024),
        (1440, 900),
        (1920, 1080),
    )
    screenshots = []
    layout_metrics = []
    for case_id, case_label, theme, dark, task_count, expanded in fixtures:
        theme_label = f"{theme}-{'dark' if dark else 'light'}"
        state_label = "expanded" if expanded else "collapsed"
        for width, height in viewports:
            screenshot = os.path.join(
                tempfile.gettempdir(),
                f"taskflow-schedule-matrix-{case_id}-{theme_label}-{task_count}-{state_label}-{width}x{height}.png",
            )
            layout_metrics.append(schedule_visual_case_checks(
                browser,
                base,
                errors,
                case_id=case_id,
                case_label=case_label,
                theme=theme,
                dark=dark,
                task_count=task_count,
                expanded=expanded,
                width=width,
                height=height,
                screenshot=screenshot,
                source_assets=source_assets,
            ))
            screenshots.append(screenshot)
    collapsed_tops = [item["timeline_y"] for item in layout_metrics if item["collapsed"]]
    gaps = [item["timeline_gap"] for item in layout_metrics]
    text_ratios = [
        item["mobile_text_ratio"]
        for item in layout_metrics
        if item["mobile_text_ratio"] is not None
    ]
    print(
        "SCHEDULE MATRIX LAYOUT:",
        f"max-collapsed-timeline-y={max(collapsed_tops):.1f}px",
        f"gap-range={min(gaps):.1f}-{max(gaps):.1f}px",
        f"min-mobile-text-share={min(text_ratios) * 100:.1f}%",
    )
    print("SCHEDULE MATRIX SCREENSHOTS:", *screenshots)


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
    page.locator('[data-pillar-icon="bolt"]').click()
    page.locator('[data-action="pillar-save"]').click()
    page.wait_for_selector('[data-testid="pillar-edit-modal"]:visible', state="detached")
    assert page.locator('[data-testid="pillar-card"] .pillar-name', has_text="Sức khỏe").count() == 1, "trụ cột phải được đổi tên"
    assert page.locator('[data-testid="pillar-card"] .pillar-icon use[href*="bolt"]').count() == 1, "icon phải được đổi"

    # Thêm trụ cột mới
    page.locator('[data-action="pillar-add"]').click()
    page.wait_for_selector('[data-testid="pillar-edit-modal"]:visible', state="visible")
    page.locator('[data-role="pillar-name"]').fill("Học tập")
    page.locator('[data-pillar-icon="book"]').click()
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
      // P0.2C: guest boot state no longer pre-seeds tasks (blank-draft lifecycle), so
      // this scenario must seed its own fixtures instead of depending on demo tasks.
      // Same pattern as daily_alignment_checks/metrics_checks.
      // Week view splits tasks into priority/regular groups — kind must be 'regular'
      // (or 'priority') or the row renders in neither group.
      while (tasks.length < 3) {
        const tk = { text: '', kind: 'regular', done: false, tags: [], linkedMetricIds: [] };
        state.weeks[0].days[0].tasks.push(tk);
        tasks.push(tk);
      }
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


def daily_alignment_checks(browser, base, width, height, errors, screenshot):
    """P5: Today derives linked real tasks/habits and groups shared items by pillar."""
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"daily-alignment {width}px: {error}"))
    load_app(page, base)

    seeded = page.evaluate("""() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const key = window.TaskFlowShell.monthKey(year, month);
      const state = JSON.parse(localStorage.getItem(key));
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const start = new Date(year, month, 1 - offset);
      const delta = Math.floor((new Date(year, month, now.getDate()) - start) / 86400000);
      const week = Math.floor(delta / 7) + 1;
      const day = delta % 7;
      const dayIndex = now.getDate() - 1;
      const dayState = state.weeks[week - 1].days[day];

      while (dayState.tasks.length < 2) {
        dayState.tasks.push({ text: '', kind: 'normal', done: false, tags: [], linkedMetricIds: [] });
      }
      dayState.tasks.forEach(task => { task.linkedMetricIds = []; task.done = false; });
      dayState.tasks[0].text = 'P5 shared task';
      dayState.tasks[0].linkedMetricIds = ['p5-task-body', 'p5-focus-work'];
      dayState.tasks[1].text = 'P5 unlinked task';

      if (!Array.isArray(state.habits)) state.habits = [];
      if (!state.habits.length) {
        state.habits.push({ id: 'p5-habit', name: '', days: [], skipDays: [], target: 100 });
      }
      const habit = state.habits[0];
      habit.id = habit.id || 'p5-habit';
      habit.name = 'P5 linked habit';
      if (!Array.isArray(habit.days)) habit.days = [];
      habit.days[dayIndex] = false;
      habit.skipDays = (Array.isArray(habit.skipDays) ? habit.skipDays : []).filter(index => index !== dayIndex);

      state.pillars.forEach(pillar => { pillar.metrics = []; });
      state.pillars[0].hidden = false;
      state.pillars[1].hidden = false;
      state.pillars[0].metrics = [
        { id: 'p5-task-body', title: 'P5 Body task', type: 'TASK', target: { mode: 'perMonth', value: 1 } },
        { id: 'p5-habit-body', title: 'P5 Body habit', type: 'HABIT', linkedHabitId: habit.id, target: { mode: 'daily', value: 1 } },
      ];
      state.pillars[1].metrics = [
        { id: 'p5-focus-work', title: 'P5 Work focus', type: 'FOCUS', target: { mode: 'perMonth', value: 30 } },
      ];
      localStorage.setItem(key, JSON.stringify(state));
      return { week, day, dayIndex, habitId: habit.id };
    }""")

    page.goto(f"{base}/app.html?view=today", wait_until="networkidle")
    card = page.locator('[data-testid="daily-alignment"]')
    assert card.is_visible()
    assert card.locator('[data-testid="alignment-pillar"]').count() == 2
    shared = card.locator('[data-testid="alignment-item"][data-alignment-kind="task"]', has_text='P5 shared task')
    assert shared.count() == 2
    assert card.get_by_text('P5 unlinked task').count() == 0

    shared.first.locator('[role="checkbox"]').click()
    shared = card.locator('[data-testid="alignment-item"][data-alignment-kind="task"]', has_text='P5 shared task')
    assert shared.locator('[role="checkbox"][aria-checked="true"]').count() == 2
    task_selector = (
        f'[data-role="today-task-list"] [data-action="task"]'
        f'[data-week="{seeded["week"]}"][data-day="{seeded["day"]}"][data-task="0"]'
    )
    assert page.locator(task_selector).get_attribute('aria-checked') == 'true'

    habit_item = card.locator('[data-testid="alignment-item"][data-alignment-kind="habit"]', has_text='P5 linked habit')
    habit_item.locator('[role="checkbox"]').click()
    habit_selector = (
        f'[data-role="today-habit-list"] [data-action="habit"]'
        f'[data-id="{seeded["habitId"]}"][data-day="{seeded["dayIndex"]}"]'
    )
    assert page.locator(habit_selector).get_attribute('aria-checked') == 'true'

    page.reload(wait_until="networkidle")
    card = page.locator('[data-testid="daily-alignment"]')
    assert card.locator('[data-alignment-kind="task"] [role="checkbox"][aria-checked="true"]').count() == 2
    assert card.locator('[data-alignment-kind="habit"] [role="checkbox"][aria-checked="true"]').count() == 1
    if width <= 390:
        for item in card.locator('[data-testid="alignment-item"]').all():
            assert item.bounding_box()['height'] >= 44
    assert_no_page_overflow(page, f"daily-alignment {width}px")

    page.evaluate("localStorage.setItem('planner-dark', '1')")
    page.reload(wait_until="networkidle")
    assert page.locator('html').get_attribute('data-dark') == 'true'
    assert_no_page_overflow(page, f"daily-alignment dark {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def weekly_review_checks(browser, base, width, height, errors, screenshot):
    """P6: Week review derives weekly evidence and persists isolated reflection fields."""
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"weekly-review {width}px: {error}"))
    load_app(page, base)

    seeded = page.evaluate("""() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const key = window.TaskFlowShell.monthKey(year, month);
      const state = JSON.parse(localStorage.getItem(key));
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const planStart = new Date(year, month, 1 - offset);
      const weekIndex = Math.min(1, state.weeks.length - 1);
      const week = state.weeks[weekIndex];
      const start = new Date(planStart.getFullYear(), planStart.getMonth(), planStart.getDate() + weekIndex * 7);
      const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const inMonth = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        return { i, date, dayIndex: date.getMonth() === month ? date.getDate() - 1 : -1 };
      }).filter(item => item.dayIndex >= 0);

      week.days.forEach(day => { day.tasks = []; });
      week.days[0].tasks = [
        {
          uid: 'p6-done', text: 'P6 linked done', kind: 'priority', done: true,
          tags: [], linkedMetricIds: ['p6-task', 'p6-focus'],
          focusLog: [{ d: dateKey(inMonth[0].date), secs: 5400 }],
          remind: { enabled: false, time: '20:00' },
        },
        {
          uid: 'p6-open', text: 'P6 linked open', kind: 'regular', done: false,
          tags: [], linkedMetricIds: ['p6-task'], focusLog: [],
          remind: { enabled: false, time: '20:00' },
        },
        {
          uid: 'p6-unrelated', text: 'P6 unrelated done', kind: 'regular', done: true,
          tags: [], linkedMetricIds: ['other'],
          focusLog: [{ d: dateKey(inMonth[0].date), secs: 7200 }],
          remind: { enabled: false, time: '20:00' },
        },
      ];

      const habit = state.habits[0] || { id: 'p6-habit', name: 'P6 habit', days: [], skipDays: [], target: 100 };
      if (!state.habits.length) state.habits.push(habit);
      habit.id = habit.id || 'p6-habit';
      habit.name = 'P6 habit';
      habit.days = Array.isArray(habit.days) ? habit.days : [];
      habit.skipDays = [];
      inMonth.forEach(item => { habit.days[item.dayIndex] = false; });
      inMonth.slice(0, 2).forEach(item => { habit.days[item.dayIndex] = true; });

      state.pillars.forEach(pillar => { pillar.metrics = []; pillar.hidden = false; });
      state.pillars[0].metrics = [{
        id: 'p6-habit-metric', title: 'P6 Habit', type: 'HABIT', linkedHabitId: habit.id,
        target: { mode: 'daily', value: 1 },
      }];
      state.pillars[1].metrics = [
        { id: 'p6-task', title: 'P6 Tasks', type: 'TASK', target: { mode: 'perWeek', value: 2 } },
        { id: 'p6-focus', title: 'P6 Focus', type: 'FOCUS', target: { mode: 'perWeek', value: 120 } },
      ];
      state.weeklyReviews = [];
      state.reflections.weeks[weekIndex] = ['P6 old win', '', 'P6 old gratitude', 'P6 old goals'];
      localStorage.setItem(key, JSON.stringify(state));

      const pomo = {};
      pomo[dateKey(inMonth[0].date)] = { secs: 5400, count: 1 };
      localStorage.setItem('planner-pomo-log', JSON.stringify(pomo));
      return { week: weekIndex + 1, weekCount: state.weeks.length, legacy: 'P6 old gratitude' };
    }""")

    page.goto(f'{base}/app.html?view=week&w={seeded["week"]}', wait_until="networkidle")
    card = page.locator('[data-testid="weekly-review"]')
    assert card.is_visible()
    summary = card.locator('[data-testid="weekly-review-summary"]')
    assert '2/3' in summary.inner_text()
    assert summary.locator('strong').nth(2).inner_text().strip() not in ('', '0', '0m', '0p')
    assert card.locator('[data-testid="weekly-review-pillar"]').count() == 2
    work_bar = card.locator('[data-testid="weekly-review-pillar"]').nth(1).locator('[role="progressbar"]')
    assert work_bar.get_attribute('aria-valuenow') == '63'

    values = {
        'best': 'P6 best answer',
        'blocker': 'P6 blocker answer',
        'learned': 'P6 learned answer',
        'change': 'P6 change answer',
    }
    for field, value in values.items():
        card.locator(f'[data-week-review-field="{field}"]').fill(value)
    for index, value in enumerate(('P6 priority one', 'P6 priority two', 'P6 priority three')):
        card.locator(f'[data-week-review-field="priority"][data-priority-index="{index}"]').fill(value)
    page.wait_for_timeout(600)
    assert card.locator('[data-testid="weekly-review-status"]').inner_text().strip()

    page.reload(wait_until="networkidle")
    card = page.locator('[data-testid="weekly-review"]')
    for field, value in values.items():
        assert card.locator(f'[data-week-review-field="{field}"]').input_value() == value
    for index, value in enumerate(('P6 priority one', 'P6 priority two', 'P6 priority three')):
        assert card.locator(f'[data-week-review-field="priority"][data-priority-index="{index}"]').input_value() == value
    legacy = card.locator('[data-testid="weekly-review-legacy"]')
    legacy.locator('summary').click()
    assert seeded['legacy'] in legacy.inner_text()

    next_week = min(seeded['week'] + 1, seeded['weekCount'])
    if next_week != seeded['week']:
        page.goto(f'{base}/app.html?view=week&w={next_week}', wait_until="networkidle")
        other = page.locator('[data-testid="weekly-review"]')
        assert other.locator('[data-week-review-field="best"]').input_value() == ''
        page.goto(f'{base}/app.html?view=week&w={seeded["week"]}', wait_until="networkidle")

    page.evaluate("localStorage.setItem('planner-dark', '1')")
    page.reload(wait_until="networkidle")
    assert page.locator('html').get_attribute('data-dark') == 'true'
    assert_no_page_overflow(page, f"weekly-review dark {width}px")
    page.screenshot(path=screenshot, full_page=True)
    page.close()


def monthly_review_checks(browser, base, width, height, errors, screenshot):
    """P7: Monthly Review derives real pillar scores and persists structured reflection."""
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"monthly-review {width}px: {error}"))
    load_app(page, base)

    page.evaluate("""() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const key = window.TaskFlowShell.monthKey(year, month);
      const state = JSON.parse(localStorage.getItem(key));
      const monthDays = new Date(year, month + 1, 0).getDate();
      state.weeks.forEach(week => week.days.forEach(day => { day.tasks = []; }));
      state.weeks[0].days[0].tasks = [{
        uid: 'p7-linked', text: 'P7 linked task', kind: 'priority', done: true,
        tags: [], linkedMetricIds: ['p7-task', 'p7-focus'],
        focusLog: [{ d: `${year}-${String(month + 1).padStart(2, '0')}-01`, secs: 3600 }],
        remind: { enabled: false, time: '20:00' },
      }, {
        uid: 'p7-unlinked', text: 'P7 unlinked task', kind: 'regular', done: true,
        tags: [], linkedMetricIds: [],
        focusLog: [{ d: `${year}-${String(month + 1).padStart(2, '0')}-01`, secs: 7200 }],
        remind: { enabled: false, time: '20:00' },
      }];
      state.habits = [{
        id: 'p7-habit', name: 'P7 Gym', target: 100,
        days: Array.from({ length: monthDays }, (_, i) => i < 8), skipDays: [],
      }];
      state.pillars = [{
        id: 'p7-body', name: 'P7 Body', icon: 'B', hidden: false, focus: '', metrics: [
          { id: 'p7-gym', title: 'P7 Gym', type: 'HABIT', linkedHabitId: 'p7-habit', target: { mode: 'perMonth', value: 10 } },
          { id: 'p7-sleep', title: 'P7 Sleep', type: 'MANUAL', days: Array.from({ length: monthDays }, (_, i) => i < 10), target: { mode: 'perMonth', value: 20 } },
        ],
      }, {
        id: 'p7-work', name: 'P7 Work', icon: 'W', hidden: false, focus: '', metrics: [
          { id: 'p7-task', title: 'P7 Delivery', type: 'TASK', target: { mode: 'perMonth', value: 2 } },
          { id: 'p7-focus', title: 'P7 Focus', type: 'FOCUS', target: { mode: 'perMonth', value: 120 } },
        ],
      }];
      state.monthlyReview = {};
      state.reflections.overview = ['P7 legacy achievement', '', '', ''];
      localStorage.setItem(key, JSON.stringify(state));
    }""")
    page.reload(wait_until="networkidle")
    page.evaluate("window.TaskFlowReportUI.openReportModal()")
    card = page.locator('[data-testid="monthly-review"]')
    assert card.is_visible()
    assert card.locator('[role="progressbar"]').count() == 2
    body_score = card.locator('[role="progressbar"]').nth(0).get_attribute('aria-valuenow')
    assert body_score == '65', f"expected P7 Body 65, got {body_score}; card={card.inner_text()}"
    assert card.locator('[role="progressbar"]').nth(1).get_attribute('aria-valuenow') == '50'
    assert card.locator('.monthly-review-overall').inner_text().strip() == '58%'
    assert 'P7 Gym' in card.inner_text()
    assert 'P7 Sleep' in card.inner_text()

    values = {
        'achievement': 'P7 achievement',
        'learned': 'P7 learned',
        'continue': 'P7 continue',
        'stop': 'P7 stop',
        'start': 'P7 start',
    }
    for field, value in values.items():
        card.locator(f'[data-monthly-review-field="{field}"]').fill(value)
    page.wait_for_timeout(650)
    assert card.locator('[data-testid="monthly-review-status"]').inner_text().strip()

    page.reload(wait_until="networkidle")
    page.evaluate("window.TaskFlowReportUI.openReportModal()")
    card = page.locator('[data-testid="monthly-review"]')
    for field, value in values.items():
        assert card.locator(f'[data-monthly-review-field="{field}"]').input_value() == value
    legacy = card.locator('[data-testid="monthly-review-legacy"]')
    legacy.locator('summary').click()
    assert 'P7 legacy achievement' in legacy.inner_text()

    page.evaluate("localStorage.setItem('planner-dark', '1')")
    page.reload(wait_until="networkidle")
    page.evaluate("window.TaskFlowReportUI.openReportModal()")
    assert page.locator('html').get_attribute('data-dark') == 'true'
    assert_no_page_overflow(page, f"monthly-review dark {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def month_carryover_checks(browser, base, width, height, errors, screenshot):
    """P8: carry only selected structures, preserve destination, remap and reset."""
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"month-carryover {width}px: {error}"))
    load_app(page, base)

    seeded = page.evaluate("""() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const next = window.TaskFlowMonthCarryover.nextMonth(year, month);
      const sourceKey = window.TaskFlowShell.monthKey(year, month);
      const destinationKey = window.TaskFlowShell.monthKey(next.year, next.month);
      const state = JSON.parse(localStorage.getItem(sourceKey));
      const sourceDays = new Date(year, month + 1, 0).getDate();
      const destinationDays = new Date(next.year, next.month + 1, 0).getDate();
      state.habits = [{
        id: 'p8-habit', name: 'P8 Exercise', target: 80,
        days: Array(sourceDays).fill(true), skipDays: [1, 2],
        remind: { enabled: true, time: '07:00' }, future: 'source-habit',
      }];
      state.pillars = [{
        id: 'p8-pillar', name: 'P8 Body', icon: 'B', hidden: false,
        focus: 'P8 Strong month', future: 'source-pillar', metrics: [{
          id: 'p8-metric', title: 'P8 Exercise metric', type: 'HABIT',
          linkedHabitId: 'p8-habit', target: { mode: 'perMonth', value: 12 },
          days: Array(sourceDays).fill(true), future: 'source-metric',
        }],
      }];
      state.weeks.forEach(week => week.days.forEach(day => { day.tasks = []; }));
      state.weeks[0].days[0].tasks = [{
        uid: 'p8-source-task', text: 'P8 source task must not copy', kind: 'priority', done: true,
        tags: [], linkedMetricIds: ['p8-metric'], remind: { enabled: false, time: '20:00' },
      }];
      localStorage.setItem(sourceKey, JSON.stringify(state));

      const destination = structuredClone(state);
      destination.monthKey = destinationKey;
      const firstWeekOffset = (new Date(next.year, next.month, 1).getDay() + 6) % 7;
      const destinationWeekCount = Math.ceil((firstWeekOffset + destinationDays) / 7);
      destination.habits = [{
        id: 'p8-existing-habit', name: 'P8 Existing habit', target: 55,
        days: Array(destinationDays).fill(false), skipDays: [], future: 'destination-habit',
      }];
      destination.pillars = [{
        id: 'p8-existing-pillar', name: 'P8 Existing pillar', icon: 'E', hidden: true,
        focus: 'Keep destination', metrics: [], future: 'destination-pillar',
      }];
      const dayTemplate = structuredClone(state.weeks[0].days[0]);
      destination.weeks = Array.from({ length: destinationWeekCount }, (_, weekIndex) => ({
        n: weekIndex + 1, goals: [],
        days: Array.from({ length: 7 }, () => ({ ...structuredClone(dayTemplate), tasks: [] })),
      }));
      destination.reflections.weeks = Array.from({ length: destinationWeekCount }, () => ['', '', '', '']);
      destination.weeklyReviews = Array.from({ length: destinationWeekCount }, () => ({}));
      destination.weeks[0].days[0].tasks = [{
        uid: 'p8-existing-task', text: 'P8 existing destination task', kind: 'regular', done: false,
        tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' }, future: 'destination-task',
      }];
      localStorage.setItem(destinationKey, JSON.stringify(destination));
      return { destinationKey, destinationDays };
    }""")
    page.reload(wait_until="networkidle")
    page.evaluate("window.TaskFlowReportUI.openReportModal()")
    page.locator('[data-action="month-carry-open"]').click()
    modal = page.locator('[data-testid="month-carry-modal"]')
    assert modal.is_visible()
    assert modal.locator('[data-carry-kind]:checked').count() == 0
    assert modal.locator('[data-action="month-carry-apply"]').is_disabled()

    for kind, item_id in (
        ('pillar', 'p8-pillar'), ('focus', 'p8-pillar'),
        ('habit', 'p8-habit'), ('metric', 'p8-metric'),
    ):
        modal.locator(f'[data-carry-kind="{kind}"][data-carry-id="{item_id}"]').check()
    modal.locator('[data-action="month-carry-preview"]').click()
    preview = modal.locator('[data-testid="month-carry-preview"]')
    assert 'P8 Body' in preview.inner_text()
    assert 'P8 Exercise' in preview.inner_text()
    assert modal.locator('[data-action="month-carry-apply"]').is_enabled()
    assert_no_page_overflow(page, f"month-carryover modal {width}px")
    page.screenshot(path=screenshot, full_page=False)
    modal.locator('[data-action="month-carry-apply"]').click()
    assert modal.is_hidden()

    carried = page.evaluate("""({ key }) => {
      const saved = JSON.parse(localStorage.getItem(key));
      const habit = saved.habits.find(item => item.name === 'P8 Exercise');
      const pillar = saved.pillars.find(item => item.name === 'P8 Body');
      const metric = pillar && pillar.metrics.find(item => item.title === 'P8 Exercise metric');
      return {
        habit, pillar, metric,
        habitNames: saved.habits.map(item => item.name),
        pillarNames: saved.pillars.map(item => item.name),
        existingHabit: saved.habits.find(item => item.id === 'p8-existing-habit'),
        existingPillar: saved.pillars.find(item => item.id === 'p8-existing-pillar'),
        taskTexts: saved.weeks.flatMap(week => week.days.flatMap(day => day.tasks.map(task => task.text))),
      };
    }""", {'key': seeded['destinationKey']})
    assert carried['habit'], f"carried habit missing: {carried}"
    assert carried['pillar'], f"carried pillar missing: {carried}"
    assert carried['metric'], f"carried metric missing: {carried}"
    assert carried['habit']['id'] != 'p8-habit'
    assert carried['habit']['days'] == [False] * seeded['destinationDays']
    assert carried['habit']['skipDays'] == []
    assert carried['habit']['remind']['enabled'] is False
    assert carried['metric']['linkedHabitId'] == carried['habit']['id']
    assert carried['metric']['days'] == [False] * seeded['destinationDays']
    assert carried['pillar']['focus'] == 'P8 Strong month'
    assert carried['existingHabit']['future'] == 'destination-habit'
    assert carried['existingHabit']['target'] == 55
    assert carried['existingPillar']['focus'] == 'Keep destination'
    assert carried['existingPillar']['hidden'] is True
    assert carried['taskTexts'] == ['P8 existing destination task']

    page.reload(wait_until="networkidle")
    assert page.evaluate("key => !!JSON.parse(localStorage.getItem(key)).pillars.find(p => p.name === 'P8 Body')", seeded['destinationKey'])
    page.evaluate("localStorage.setItem('planner-dark', '1')")
    page.reload(wait_until="networkidle")
    assert page.locator('html').get_attribute('data-dark') == 'true'
    assert_no_page_overflow(page, f"month-carryover dark {width}px")
    page.close()


def report_growth_checks(browser, base, width, height, errors, screenshot):
    """P9: truthful balance/guidance/mood and unified reflection filters."""
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"report-growth {width}px: {error}"))
    load_app(page, base)
    page.evaluate("""() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const key = window.TaskFlowShell.monthKey(year, month);
      const state = JSON.parse(localStorage.getItem(key));
      const days = new Date(year, month + 1, 0).getDate();
      state.habits = [];
      state.pillars = [{
        id: 'p9-balance', name: 'P9 Balance', icon: 'P', hidden: false, focus: '', metrics: [
          { id: 'p9-low', title: 'P9 Low', type: 'MANUAL', days: Array.from({ length: days }, (_, i) => i < 3), target: { mode: 'perMonth', value: 10 } },
          { id: 'p9-high', title: 'P9 High', type: 'MANUAL', days: Array.from({ length: days }, (_, i) => i < 9), target: { mode: 'perMonth', value: 10 } },
        ],
      }];
      state.weeklyReviews[0] = { best: 'P9 weekly reflection', blocker: '', learned: '', change: '', priorities: [], updatedAt: `${year}-${String(month + 1).padStart(2, '0')}-07T20:00:00.000Z` };
      state.monthlyReview = { achievement: 'P9 monthly reflection', learned: '', continue: '', stop: '', start: '', updatedAt: `${year}-${String(month + 1).padStart(2, '0')}-10T20:00:00.000Z` };
      localStorage.setItem(key, JSON.stringify(state));
      const pad = value => String(value).padStart(2, '0');
      const dates = [1, 2, 3].map(day => `${year}-${pad(month + 1)}-${pad(day)}`);
      localStorage.setItem('planner-reflections-daily', JSON.stringify({
        [dates[0]]: { mood: 0, good: 'P9 daily one', updatedAt: dates[0] + 'T20:00:00.000Z' },
        [dates[1]]: { mood: 2, good: 'P9 daily two', updatedAt: dates[1] + 'T20:00:00.000Z' },
        [dates[2]]: { mood: 4, good: 'P9 daily three', updatedAt: dates[2] + 'T20:00:00.000Z' },
      }));
      const previous = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
      localStorage.setItem(window.TaskFlowShell.monthKey(previous.year, previous.month), JSON.stringify({
        monthlyReview: { achievement: 'P9 previous monthly', updatedAt: `${previous.year}-${pad(previous.month + 1)}-20T20:00:00.000Z` },
        weeklyReviews: [],
      }));
    }""")
    page.reload(wait_until="networkidle")
    page.evaluate("window.TaskFlowReportUI.openReportModal()")
    report = page.locator('[data-testid="report-modal"]')
    growth = report.locator('[data-testid="report-growth"]')
    assert growth.is_visible()
    assert growth.locator('.report-balance-progress').count() == 1
    assert growth.locator('.report-balance-progress').get_attribute('aria-valuenow') == '60'
    guidance = growth.locator('[data-testid="report-guidance"]').inner_text()
    assert 'P9 Low' in guidance and '30%' in guidance
    assert 'P9 High' in guidance and '90%' in guidance
    assert growth.locator('[data-testid="report-mood-trend"] .report-mood-bar').count() == 5
    assert_no_page_overflow(page, f"report-growth {width}px")

    growth.locator('[data-action="report-history-open-panel"]').click()
    history = page.locator('[data-testid="report-history-modal"]')
    assert history.is_visible()
    assert history.locator('[data-history-filter="daily"]').get_attribute('aria-selected') == 'true'
    assert history.locator('.report-history-item').count() == 3
    history.locator('[data-history-filter="weekly"]').click()
    assert history.locator('.report-history-item').count() == 1
    assert 'P9 weekly reflection' in history.inner_text()
    history.locator('[data-history-filter="monthly"]').click()
    assert history.locator('.report-history-item').count() == 2
    history.locator('[data-history-filter="daily"]').click()
    history.locator('.report-history-item').first.click()
    deep = page.locator('[data-testid="reflection-modal"]')
    assert deep.is_visible()
    assert deep.locator('[data-reflect-field="good"]').input_value() == 'P9 daily three'
    deep.locator('[data-action="reflection-deep-close"]').click()

    page.evaluate("localStorage.setItem('planner-dark', '1')")
    page.reload(wait_until="networkidle")
    page.evaluate("window.TaskFlowReportUI.openReportModal()")
    assert page.locator('html').get_attribute('data-dark') == 'true'
    page.wait_for_timeout(50)
    assert page.locator('[data-testid="report-modal"] .report-modal-card').evaluate("el => el.scrollTop") == 0
    assert_no_page_overflow(page, f"report-growth dark {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def data_lifecycle_checks(browser, base, width, height, errors, screenshot):
    """P10: export v2, import/migrate v1 through the UI, reload and preserve growth links."""
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"data-lifecycle {width}px: {error}"))
    page.on("dialog", lambda dialog: dialog.accept())
    load_app(page, base)

    seeded = page.evaluate("""() => {
      const now = new Date();
      const key = window.TaskFlowShell.monthKey(now.getFullYear(), now.getMonth());
      const state = JSON.parse(localStorage.getItem(key));
      delete state.schemaVersion;
      state.futureP10Field = { kept: true };
      state.weeks[0].days[0].tasks.push({
        uid: 'p10-task-old', text: 'P10 linked legacy task', done: true,
        linkedMetricIds: ['p10-metric-task'], focusLog: [{ minutes: 25 }],
      });
      state.pillars = [{
        id: 'p10-pillar', name: 'P10 Pillar', hidden: false,
        metrics: [{ id: 'p10-metric-task', title: 'P10 Metric', type: 'TASK' }],
      }];
      const snapshot = {
        app: 'taskflow-todoist', version: 1, exportedAt: new Date().toISOString(),
        keys: {
          [key]: JSON.stringify(state),
          'planner-reflections-daily': JSON.stringify({
            '2026-08-11': { mood: 4, good: 'P10 preserved reflection', futureEntry: true },
          }),
          'planner-mood': JSON.stringify({ '2026-08-11': 4 }),
          'january-planner-2026': JSON.stringify({ legacy: 'P10 legacy kept' }),
        },
        futureSnapshotField: { kept: true },
      };
      return { key, raw: JSON.stringify(snapshot) };
    }""")

    # Real UI export must emit the complete v2 snapshot.
    if width <= 767:
        page.locator('#mobileNav [data-action="more"]').click()
        page.wait_for_selector('[data-testid="more-sheet"]', state="visible")
        page.locator('#moreSheet [data-action="tools-open"]').click()
    else:
        page.locator('[data-action="tools-open"]:visible').first.click()
    page.wait_for_selector('[data-testid="tools-drawer"]', state="visible")
    page.locator('[data-action="data-toggle"]').click()
    with page.expect_download() as download_info:
        page.locator('[data-action="export-json"]').click()
    with open(download_info.value.path(), encoding="utf-8") as exported_file:
        exported = json.load(exported_file)
    assert exported['version'] == 2
    assert len(exported['keys']) == len(set(exported['keys']))
    assert seeded['key'] in exported['keys']

    # Import the v1 fixture through the hidden file input; confirmation previews and reloads.
    with page.expect_navigation(wait_until="networkidle"):
        page.locator('#importFile').set_input_files({
            "name": "taskflow-v1-backup.json",
            "mimeType": "application/json",
            "buffer": seeded['raw'].encode('utf-8'),
        })
    restored = page.evaluate("""key => {
      const state = JSON.parse(localStorage.getItem(key));
      const task = state.weeks[0].days[0].tasks.find(item => item.uid === 'p10-task-old');
      const daily = JSON.parse(localStorage.getItem('planner-reflections-daily'));
      const backups = Array.from({ length: 7 }, (_, i) => localStorage.getItem('planner-backup-' + i)).filter(Boolean);
      return { state, task, daily, backups: backups.length };
    }""", seeded['key'])
    assert restored['state']['schemaVersion'] == 2
    assert restored['state']['futureP10Field']['kept'] is True
    assert restored['task']['linkedMetricIds'] == ['p10-metric-task']
    assert restored['task']['focusLog'][0]['minutes'] == 25
    assert restored['daily']['2026-08-11']['good'] == 'P10 preserved reflection'
    assert restored['backups'] >= 1

    page.evaluate("localStorage.setItem('planner-dark', '1')")
    page.reload(wait_until="networkidle")
    assert page.locator('html').get_attribute('data-dark') == 'true'
    assert_no_page_overflow(page, f"data-lifecycle dark {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def projects_checks(browser, base, width, height, errors, screenshot):
    """V1.1: Projects & Milestones flow.
    1) mở Projects → tạo Project  2) thêm 2 Milestone  3) hoàn thành 1 → progress 50%
    4) tạo task trong Week + link Project/Milestone qua Task Detail
    5) reload → linkage persists  6) archive Project → task liên kết GIỮ NGUYÊN."""
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"projects {width}px: {error}"))
    page.on("dialog", lambda dialog: dialog.accept())
    # Mở thẳng view Projects qua deeplink (?view=projects — DeepLink whitelist có projects)
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.goto(f"{base}/app.html?view=projects", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="projects-view"]', state="visible")

    # 1) empty state → tạo project (name + target date). Sau create-save app tự mở
    #    Project Detail (renderProjectsViewWith openId=created.id) → assert detail.
    assert page.locator('.pj-card').count() == 0, "empty state phải không có card"

    # Regression guard (V2 fix): empty-state CTA geometry — plus icon nhỏ
    # (không bị 34px rule của icon trang trí), button đủ cao, icon + text căn
    # giữa dọc theo button.
    cta = page.locator('#view-projects .empty-state .empty-btn')
    assert cta.is_visible(), "empty CTA phải hiển thị khi không có project"
    cta_box = cta.bounding_box()
    assert cta_box is not None and cta_box["height"] >= 40, \
        f"empty CTA height {cta_box and round(cta_box['height'], 1)}px < 40px"
    plus = page.locator('#view-projects .empty-state .empty-btn .ui-icon')
    assert plus.count() == 1
    plus_box = plus.bounding_box()
    assert plus_box is not None and plus_box["width"] <= 18 and plus_box["height"] <= 18, \
        f"CTA plus icon quá to: {plus_box}"
    deco = page.locator('#view-projects .empty-state > .ui-icon')
    assert deco.count() == 1, "icon trang trí (briefcase) phải là con trực tiếp của .empty-state"
    deco_box = deco.bounding_box()
    assert deco_box is not None and deco_box["width"] >= 30, \
        f"icon trang trí bị thu nhỏ: {deco_box}"
    centers = page.evaluate("""() => {
      const btn = document.querySelector('#view-projects .empty-state .empty-btn');
      if (!btn) return null;
      const icon = btn.querySelector('.ui-icon');
      const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.nodeValue || '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
      });
      const text = walker.nextNode();
      if (!text) return null;
      const range = document.createRange();
      range.selectNodeContents(text);
      const b = btn.getBoundingClientRect();
      const i = icon.getBoundingClientRect();
      const t = range.getBoundingClientRect();
      return {
        btnC: (b.top + b.bottom) / 2,
        iconC: (i.top + i.bottom) / 2,
        textC: (t.top + t.bottom) / 2,
      };
    }""")
    assert centers, "không đo được tâm icon/text của CTA"
    assert abs(centers["iconC"] - centers["btnC"]) <= 4, f"CTA plus icon lệch dọc: {centers}"
    assert abs(centers["textC"] - centers["btnC"]) <= 4, f"CTA text lệch dọc: {centers}"

    # Regression guard (V2 segmented + flicker): switching filters must preserve the
    # .pj-filters node + #view-projects root + page head — only .pj-content updates.
    page.evaluate("""() => {
      window.__pjFilterNode = document.querySelector('.pj-filters');
      window.__pjRoot = document.querySelector('#view-projects');
      const root = document.querySelector('#view-projects');
      window.__pjWipe = false;
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          // whole-view wipe = the ROOT's direct children are removed in bulk
          if (m.type === 'childList' && m.target === root && m.removedNodes.length >= 3) window.__pjWipe = true;
        }
      });
      mo.observe(root, { childList: true, subtree: true });
      window.__pjMo = mo;
    }""")
    heading_text = page.locator('.pj-page-title').inner_text()
    page.locator('[data-action="project-filter"][data-filter="active"]').click()
    page.wait_for_timeout(150)
    assert page.evaluate(
        "window.__pjFilterNode === document.querySelector('.pj-filters') && "
        "window.__pjRoot === document.querySelector('#view-projects')"), \
        "đổi filter phải GIỮ NGUYÊN .pj-filters + #view-projects"
    assert not page.evaluate("window.__pjWipe"), "đổi filter không được xoá toàn bộ #view-projects"
    assert page.locator('.pj-filters').count() == 1, "chỉ 1 bộ filter (không nhân đôi)"
    assert page.locator('.pj-page-title').inner_text() == heading_text, "heading phải giữ nguyên"
    assert page.locator('[data-action="project-filter"][data-filter="active"]').get_attribute("aria-pressed") == "true", \
        "filter active phải có aria-pressed=true"
    assert page.locator('[data-action="project-filter"][data-filter="all"]').get_attribute("aria-pressed") == "false", \
        "filter cũ phải hạ aria-pressed=false"
    assert page.evaluate("document.activeElement === document.querySelector('[data-filter=\"active\"]')"), \
        "focus phải giữ trên nút filter vừa bấm"

    # header + empty-state đều có nút project-new → dùng .first
    page.locator('[data-action="project-new"]').first.click()
    page.wait_for_selector('[data-testid="project-edit-modal"]:visible', state="visible")
    page.locator('[data-role="project-name"]').fill("Backend Internship")
    page.locator('[data-role="project-target"]').fill("2027-03-01")
    page.locator('[data-action="project-create-save"]').click()
    page.wait_for_selector('[data-testid="project-edit-modal"]:visible', state="detached")
    page.wait_for_selector('[data-action="mile-add"]', state="visible")
    assert page.locator('.pj-progress').first.get_attribute("aria-valuenow") == "0", \
        "project mới phải có progress 0%"

    # 2) thêm 2 milestone (đang ở Project Detail)
    for name in ("Build REST API", "Deploy API"):
        page.locator('[data-action="mile-add"]').click()
        page.wait_for_selector('[data-testid="milestone-edit-modal"]:visible', state="visible")
        page.locator('[data-role="milestone-name"]').fill(name)
        page.locator('[data-action="mile-edit-save"]').click()
        page.wait_for_selector('[data-testid="milestone-edit-modal"]:visible', state="detached")
    assert page.locator('.pj-milestone').count() == 2, "phải có 2 milestone"

    # 3) hoàn thành 1 milestone → progress 50%
    page.locator('[data-action="mile-toggle"]').first.click()
    page.wait_for_timeout(250)
    assert page.locator('.pj-progress').first.get_attribute("aria-valuenow") == "50", \
        "progress phải là 50% sau khi hoàn thành 1/2 milestone"
    assert page.locator('.pj-progress-pct').first.inner_text() == "50%"

    # 4) tạo task trong Week + link Project/Milestone qua Task Detail drawer.
    #    Trước đó quay về danh sách để xác nhận card + progress hiển thị.
    page.locator('[data-action="project-back"]').click()
    page.wait_for_timeout(250)
    assert page.locator('.pj-card').count() == 1, "phải có 1 project card sau khi back"
    assert page.locator('.pj-card .pj-progress-pct').first.inner_text() == "50%", \
        "card phải hiển thị progress 50%"
    project_id = page.evaluate(
        "JSON.parse(localStorage.getItem('planner-projects')).projects[0].id"
    )
    milestone_id = page.evaluate(
        "JSON.parse(localStorage.getItem('planner-projects')).projects[0].milestones[0].id"
    )
    page.goto(f"{base}/app.html?view=week&w=1", wait_until="networkidle")
    page.wait_for_selector('[data-testid="week-view"]', state="visible")
    panel = page.locator(".week-day-panel").first
    panel.locator('[data-action="addtask"]').first.click()
    row = panel.locator('[data-testid="task-row"]').last
    row.locator('[data-role="task-text"]').fill("JWT auth service")
    row.hover()
    row.locator('[data-action="task-menu"]').click()
    row.locator('[data-action="task-detail"]').click()
    page.wait_for_selector('[data-testid="task-drawer"]', state="visible")
    drawer = page.locator('[data-testid="task-drawer"]')
    drawer.locator('[data-role="td-project-select"]').select_option(project_id)
    # milestone select được enable sau khi chọn project (validate referential)
    page.wait_for_function(
        "() => !document.querySelector('[data-role=\"td-milestone-select\"]').disabled"
    )
    drawer.locator('[data-role="td-milestone-select"]').select_option(milestone_id)
    page.wait_for_timeout(300)  # saveTaskDetailState → save()
    linked = page.evaluate("""() => {
      const find = (key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
          const s = JSON.parse(raw);
          return (s.weeks || []).flatMap(w => (w.days || []).flatMap(d => (d.tasks || [])))
            .find(t => t.text === 'JWT auth service') || null;
        } catch (e) { return null; }
      };
      for (let y = new Date().getFullYear() - 1; y <= new Date().getFullYear() + 1; y++) {
        for (let m = 0; m < 12; m++) {
          const task = find(`planner-${y}-${m}`);
          if (task) return { p: task.projectId, mi: task.milestoneId };
        }
      }
      return null;
    }""")
    assert linked and linked["p"] == project_id, f"task phải giữ projectId: {linked}"
    assert linked and linked["mi"] == milestone_id, f"task phải giữ milestoneId: {linked}"

    # 5) reload → linkage persists (project detail hiển thị linked task)
    page.goto(f"{base}/app.html?view=projects", wait_until="networkidle")
    page.wait_for_selector('[data-action="project-open"]', state="visible")
    page.locator('[data-action="project-open"]').first.click()
    page.wait_for_selector('.pj-linked-task', state="visible")
    assert page.locator('.pj-linked-task').count() == 1, "phải có 1 linked task"
    assert "JWT auth service" in page.locator('.pj-linked-task').first.inner_text()

    # 6) archive Project → task liên kết GIỮ NGUYÊN (không xoá task)
    page.locator('[data-action="project-archive"]').click()
    page.wait_for_timeout(300)
    kept = page.evaluate("""() => {
      const find = (key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
          const s = JSON.parse(raw);
          return (s.weeks || []).flatMap(w => (w.days || []).flatMap(d => (d.tasks || [])))
            .find(t => t.text === 'JWT auth service') || null;
        } catch (e) { return null; }
      };
      for (let y = new Date().getFullYear() - 1; y <= new Date().getFullYear() + 1; y++) {
        for (let m = 0; m < 12; m++) {
          const task = find(`planner-${y}-${m}`);
          if (task) return { p: task.projectId, mi: task.milestoneId };
        }
      }
      return null;
    }""")
    assert kept and kept["p"] == project_id, "archive Project KHÔNG được xoá/clear task liên kết"
    # filter archived → project vẫn hiển thị với status chip
    page.locator('[data-action="project-filter"][data-filter="archived"]').click()
    assert page.locator('.pj-card').count() == 1, "project archived phải hiện ở filter archived"
    assert page.locator('.pj-status-archived').count() == 1

    assert_no_page_overflow(page, f"projects {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def planner_checks(browser, base, width, height, errors, screenshot):
    """V1.3: Smart Daily Planner (rule-based).
    1) seed task hôm nay (1 quá hạn + 1 thường, có duration) + 2 TimeBlock
       → khe trống 10:00-11:00
    2) mở planner → proposal preview hiện đủ 5 bước + task xếp hạng
    3) Cancel → KHÔNG có thay đổi data (planner-timeblocks giữ nguyên)
    4) Apply → tạo TimeBlock cho task được chọn (vào khe trống), modal đóng."""
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"planner {width}px: {error}"))
    page.on("dialog", lambda dialog: dialog.accept())
    # Seed trước boot: today tasks (uid ổn định) + 2 TimeBlock đã có.
    page.add_init_script("""(() => {
      localStorage.setItem('planner-onboarded','1');
      const now = new Date();
      const year = now.getFullYear(), month = now.getMonth();
      const key = 'planner-' + year + '-' + (month + 1);
      let state;
      try { state = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { state = null; }
      if (!state) state = { version: 1, weeks: [], pillars: [], habits: [] };
      state.monthKey = 'planner-' + year + '-' + (month + 1);
      state.schemaVersion = 2;
      if (!Array.isArray(state.monthlyGoals)) state.monthlyGoals = [];
      if (!Array.isArray(state.habits)) state.habits = [];
      while (state.weeks.length < 6) state.weeks.push({ days: [] });
      state.weeks.forEach(w => { while (w.days.length < 7) w.days.push({ tasks: [] }); });
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const start = new Date(year, month, 1 - offset);
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const numWeeks = Math.ceil((offset + daysInMonth) / 7);
      while (state.weeks.length < numWeeks) state.weeks.push({ days: [] });
      state.weeks.length = numWeeks;
      state.weeks.forEach(w => { while (w.days.length < 7) w.days.push({ tasks: [] }); });
      const delta = Math.floor((now - start) / 86400000);
      const week = Math.floor(delta / 7), day = delta % 7;
      const dayState = state.weeks[week].days[day];
      const yst = new Date(year, month, now.getDate() - 1);
      const ystIso = yst.getFullYear() + '-' + String(yst.getMonth() + 1).padStart(2,'0') + '-' + String(yst.getDate()).padStart(2,'0');
      dayState.tasks = [
        { uid: 'pl-t1', kind: 'regular', done: false, text: 'Planner overdue task', duration: 60,
          deadline: ystIso, tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } },
        { uid: 'pl-t2', kind: 'regular', done: false, text: 'Planner normal task', duration: 90,
          tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } },
      ];
      localStorage.setItem(key, JSON.stringify(state));
      // 2 TimeBlock hôm nay → khe trống 10:00-11:00
      const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
      localStorage.setItem('planner-timeblocks', JSON.stringify({ version: 1, blocks: [
        { id: 'pl-b1', taskUid: 'pl-t2', date: today, start: '09:00', end: '10:00', status: 'planned', createdAt: '', updatedAt: '' },
        { id: 'pl-b2', taskUid: 'pl-t1', date: today, start: '11:00', end: '12:00', status: 'planned', createdAt: '', updatedAt: '' },
      ] }));
    })()""")
    page.goto(f"{base}/app.html?view=today", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="today-view"]', state="visible")

    # Nút planner trong Today header
    assert page.locator('.today-planner-btn').count() == 1, "Today phải có nút Lập kế hoạch hôm nay"
    before_blocks = page.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('planner-timeblocks')).blocks)")

    # 1) Mở planner → preview hiện 5 bước + 2 task xếp hạng + select quá hạn
    page.locator('[data-action="planner-open"]').click()
    page.wait_for_selector('[data-testid="planner-modal"]:visible', state="visible")
    assert page.locator('.planner-step').count() == 5, "planner phải có đủ 5 bước"
    assert page.locator('.planner-top-item').count() == 2, "phải có 2 task được xếp hạng"
    assert page.locator('[data-planner-overdue]').count() == 1, "phải có 1 task quá hạn với select dời ngày"
    assert page.locator('.planner-sched-item').count() == 1, "phải có 1 gợi ý block (task 60p vào khe 10:00-11:00)"
    # Sắp xếp: task quá hạn phải đứng đầu
    first_text = page.locator('.planner-top-item').first.locator('.planner-top-text').inner_text()
    assert "overdue" in first_text, f"task quá hạn phải xếp đầu, thấy: {first_text}"

    # 2) Cancel → KHÔNG thay đổi data
    page.locator('[data-action="planner-cancel"]').click()
    page.wait_for_selector('[data-testid="planner-modal"]:visible', state="detached")
    after_cancel = page.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('planner-timeblocks')).blocks)")
    assert after_cancel == before_blocks, "Cancel KHÔNG được tạo/sửa TimeBlock"
    task_count = page.evaluate("JSON.parse(localStorage.getItem('planner-' + new Date().getFullYear() + '-' + (new Date().getMonth()+1))).weeks.flatMap(w => w.days.flatMap(d => d.tasks || [])).length")
    assert task_count == 2, "Cancel KHÔNG được đổi task"

    # 3) Apply → tạo TimeBlock mới (vào khe trống), modal đóng
    page.locator('[data-action="planner-open"]').click()
    page.wait_for_selector('[data-testid="planner-modal"]:visible', state="visible")
    page.locator('[data-action="planner-apply"]').click()
    page.wait_for_selector('[data-testid="planner-modal"]:visible', state="detached")
    after_apply = page.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('planner-timeblocks')).blocks)")
    blocks = page.evaluate("JSON.parse(localStorage.getItem('planner-timeblocks')).blocks")
    assert len(blocks) == 3, f"Apply phải tạo 1 TimeBlock mới (2 → 3), thấy {len(blocks)}"
    assert any(b["taskUid"] == "pl-t1" and b["start"] == "10:00" and b["end"] == "11:00" for b in blocks), \
        "block mới phải là pl-t1 vào khe 10:00-11:00"

    assert_no_page_overflow(page, f"planner {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def timeblock_ui_checks(browser, base, width, height, errors, screenshot):
    """V1.2 Phase 2: Time Blocking UI.
    1) seed task hôm nay (uid ổn định) + 1 TimeBlock
    2) Calendar → Schedule mode: timeline + daystrip hiển thị, block có trong timeline
    3) Task Detail: section Schedule hiển thị block của task
    4) Add block qua dialog (task + giờ) → lưu, block mới tồn tại trong store
    5) Delete block → task vẫn còn (không xóa task)
    6) Focus-from-block: nút hiển thị cho block có task
    """
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"tbui {width}px: {error}"))
    page.on("dialog", lambda dialog: dialog.accept())
    page.add_init_script("""(() => {
      localStorage.setItem('planner-onboarded','1');
      const now = new Date();
      const year = now.getFullYear(), month = now.getMonth();
      const key = 'planner-' + year + '-' + (month + 1);
      let state;
      try { state = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { state = null; }
      if (!state) state = { version: 1, weeks: [], pillars: [], habits: [] };
      state.monthKey = 'planner-' + year + '-' + (month + 1);
      state.schemaVersion = 2;
      if (!Array.isArray(state.monthlyGoals)) state.monthlyGoals = [];
      if (!Array.isArray(state.habits)) state.habits = [];
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const numWeeks = Math.ceil((offset + daysInMonth) / 7);
      state.weeks = [];
      for (let w = 0; w < numWeeks; w++) { const days = []; for (let d = 0; d < 7; d++) days.push({ tasks: [] }); state.weeks.push({ n: w + 1, goals: [], days }); }
      const start = new Date(year, month, 1 - offset);
      const delta = Math.floor((now - start) / 86400000);
      const week = Math.floor(delta / 7), day = delta % 7;
      const dayState = state.weeks[week].days[day];
      dayState.tasks = [
        { uid: 'tbu-t1', kind: 'regular', done: false, text: 'TB UI task', duration: 45,
          tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } },
      ];
      // Cũng đặt task vào tuần 1 ngày 1 (để mở drawer từ week view ?w=1)
      if (week !== 0) {
        state.weeks[0].days[1].tasks = [
          { uid: 'tbu-t1', kind: 'regular', done: false, text: 'TB UI task', duration: 45,
            tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } },
        ];
      }
      localStorage.setItem(key, JSON.stringify(state));
      const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
      // Chỉ seed blocks nếu chưa tồn tại (init script chạy lại mỗi navigation —
      // không được ghi đè block đã tạo qua UI trong cùng kịch bản)
      if (!localStorage.getItem('planner-timeblocks')) {
        localStorage.setItem('planner-timeblocks', JSON.stringify({ version: 1, blocks: [
          { id: 'tbu-b1', taskUid: 'tbu-t1', date: today, start: '09:00', end: '10:00', status: 'planned', createdAt: '', updatedAt: '' },
        ] }));
      }
    })()""")
    page.goto(f"{base}/app.html?view=calendar", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="calendar-view"]', state="visible")

    # 1) Chuyển sang Schedule mode
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').scroll_into_view_if_needed()
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').click()
    page.wait_for_selector('[data-testid="schedule-view"]', state="visible")
    assert page.locator('[data-testid="tb-timeline"]').count() == 1, "Schedule phải có timeline"
    assert page.locator('.tb-daystrip .tb-day').count() == 7, "daystrip phải có 7 ngày"
    assert page.locator('.tb-block').count() == 1, "timeline phải hiển thị 1 block đã seed"

    # 2) Chọn ngày hôm nay trong daystrip (block seed nằm ở hôm nay)
    page.locator('[data-action="tb-today"]').first.scroll_into_view_if_needed()
    page.locator('[data-action="tb-today"]').first.click()
    page.wait_for_timeout(150)
    assert page.locator('.tb-block').count() == 1, "block hôm nay phải còn hiển thị sau khi chọn Today"

    # 3) Thêm block mới qua dialog
    page.locator('[data-action="tb-add"]').first.scroll_into_view_if_needed()
    page.locator('[data-action="tb-add"]').first.click()
    page.wait_for_selector('[data-testid="timeblock-modal"]:visible', state="visible")
    # chọn task tbu-t1 (option trong select)
    page.locator('[data-role="tb-task"]').select_option(label="TB UI task")
    page.locator('[data-role="tb-start"]').fill("15:00")
    page.locator('[data-role="tb-end"]').fill("16:00")
    page.locator('[data-action="tb-save"]').click()
    page.wait_for_selector('[data-testid="timeblock-modal"]:visible', state="detached")
    blocks = page.evaluate("JSON.parse(localStorage.getItem('planner-timeblocks')).blocks")
    assert len(blocks) == 2, f"Add phải tạo block thứ 2 (1 → 2), thấy {len(blocks)}"
    assert any(b["taskUid"] == "tbu-t1" and b["start"] == "15:00" for b in blocks), "block mới phải là tbu-t1 15:00"
    page.wait_for_timeout(150)
    assert page.locator('.tb-block').count() == 2, "timeline phải hiển thị 2 block sau khi thêm"

    # 4) Task Detail → Schedule section hiển thị blocks của task (mở drawer từ Week view w=1)
    page.goto(f"{base}/app.html?view=week&w=1", wait_until="networkidle")
    page.wait_for_selector('[data-testid="week-view"] .week-page', state="visible")
    row = page.locator('[data-testid="task-row"]').first
    row.scroll_into_view_if_needed()
    row.hover()
    row.locator('[data-action="task-menu"]').click()
    row.locator('[data-action="task-detail"]').click()
    page.wait_for_selector('[data-testid="task-drawer"]', state="visible")
    block_count = page.locator(
        '[data-testid="td-blocks"] .td-tb-row'
    ).count()

    assert block_count == 2, (
        f"Task Detail phải liệt kê 2 blocks, thấy {block_count}"
    )
    # nút Focus từ block có trong task detail
    assert page.locator('#taskDrawer [data-action="tb-focus"]').count() == 2, "mỗi block phải có nút Focus"
    page.keyboard.press('Escape')
    page.wait_for_selector('[data-testid="task-drawer"]', state="hidden")
    page.wait_for_timeout(150)

    # 5) Xóa 1 block → task vẫn còn (quay lại Calendar Schedule)
    page.goto(f"{base}/app.html?view=calendar", wait_until="networkidle")
    page.wait_for_selector('[data-testid="calendar-view"]', state="visible")
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').scroll_into_view_if_needed()
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').click()
    page.wait_for_selector('[data-testid="schedule-view"]', state="visible")
    page.wait_for_timeout(150)
    page.locator('[data-action="tb-del"]').first.scroll_into_view_if_needed()
    page.locator('[data-action="tb-del"]').first.click()
    page.wait_for_timeout(150)
    blocks = page.evaluate("JSON.parse(localStorage.getItem('planner-timeblocks')).blocks")
    assert len(blocks) == 1, f"Delete phải xóa đúng 1 block (2 → 1), thấy {len(blocks)}"
    task_uids = page.evaluate("JSON.parse(localStorage.getItem('planner-' + new Date().getFullYear() + '-' + (new Date().getMonth()+1))).weeks.flatMap(w => w.days.flatMap(d => d.tasks || [])).map(t => t.uid)")
    assert 'tbu-t1' in task_uids, "Delete block KHÔNG được xóa task (uid tbu-t1 phải còn tồn tại)"

    assert_no_page_overflow(page, f"tbui {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def habits_schedule_checks(browser, base, width, height, errors, screenshot):
    """V1.4: Flexible Habit Schedules.
    1) seed habit weekly_count 4x/tuần (target 4) chưa tick ngày nào → hiển thị Today như progress optional
    2) nhãn lịch hiển thị ("4 lần / tuần")
    3) tick habit → lưu vào store, habit vẫn hiển thị (pct < 100)
    4) reload → trạng thái tick persist
    """
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"habsched {width}px: {error}"))
    page.add_init_script("""(() => {
      localStorage.setItem('planner-onboarded','1');
      const now = new Date();
      const year = now.getFullYear(), month = now.getMonth();
      const key = 'planner-' + year + '-' + (month + 1);
      let state;
      try { state = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { state = null; }
      if (!state) state = { version: 1, weeks: [], pillars: [], habits: [] };
      state.monthKey = key;
      state.schemaVersion = 2;
      if (!Array.isArray(state.monthlyGoals)) state.monthlyGoals = [];
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const numWeeks = Math.ceil((offset + daysInMonth) / 7);
      state.weeks = [];
      for (let w = 0; w < numWeeks; w++) { const days = []; for (let d = 0; d < 7; d++) days.push({ tasks: [] }); state.weeks.push({ n: w + 1, goals: [], days }); }
      if (!state.habits.some(h => h.id === 'hs-gym')) {
        state.habits.push({
          id: 'hs-gym', name: 'Gym', target: 4,
          schedule: { type: 'weekly_count', count: 4 },
          days: new Array(daysInMonth).fill(false),
        });
      }
      localStorage.setItem(key, JSON.stringify(state));
    })()""")
    page.goto(f"{base}/app.html", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="today-view"]', state="visible")
    page.wait_for_timeout(200)

    # 1) Habit weekly_count hiển thị với nhãn lịch
    habit_row = page.locator('[data-testid="today-view"] .today-habit').first
    assert habit_row.count() == 1, "Habit weekly_count phải xuất hiện trên Today (optional progress)"
    sched_lbl = habit_row.locator('.today-habit-sched').inner_text()
    assert '4' in sched_lbl and 'tuần' in sched_lbl, f"Nhãn lịch phải là '4 lần / tuần', thấy '{sched_lbl}'"

    # 2) Tick habit → persist trong store, vẫn hiển thị (pct 25% < 100)
    today_idx = page.evaluate("new Date().getDate() - 1")
    box = habit_row.locator('[data-action="habit"]')
    box.scroll_into_view_if_needed()
    box.click()
    page.wait_for_timeout(150)
    state_days = page.evaluate(
        "JSON.parse(localStorage.getItem('planner-' + new Date().getFullYear() + '-' + (new Date().getMonth()+1))).habits.find(h => h.id === 'hs-gym').days"
    )
    assert state_days[today_idx] is True, "Tick phải lưu days[ngày hôm nay] = true"
    assert habit_row.count() == 1, "Habit vẫn phải hiển thị khi mục tiêu tuần chưa đạt (pct < 100)"

    # 3) Reload → trạng thái tick persist
    page.reload(wait_until="networkidle")
    page.wait_for_selector('[data-testid="today-view"]', state="visible")
    page.wait_for_timeout(200)
    again = page.evaluate(
        "JSON.parse(localStorage.getItem('planner-' + new Date().getFullYear() + '-' + (new Date().getMonth()+1))).habits.find(h => h.id === 'hs-gym').days"
    )
    assert again[today_idx] is True, "Sau reload, trạng thái tick phải còn"
    row2 = page.locator('[data-testid="today-view"] .today-habit').first
    assert row2.locator('.today-habit-sched').count() == 1, "Nhãn lịch phải còn sau reload"

    assert_no_page_overflow(page, f"habsched {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def quick_capture_checks(browser, base, width, height, errors, screenshot):
    """V1.5: Quick Capture.
    1) ?quick=1&text=.. → Quick Add mở với input đã prefill (preview trước Save)
    2) share target GET (?title=&text=&url=) → ghép text + url, không có javascript: url
    3) payload HTML độc hại → không render HTML, input giữ text thuần (sanitize)
    4) Inbox persist: submit → task xuất hiện trong inbox localStorage
    """
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"qcapture {width}px: {error}"))
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")

    # 1) quick URL: text param prefill
    page.goto(f"{base}/app?quick=1&text=Read%20article%20on%20habits", wait_until="networkidle")
    page.wait_for_selector('[data-testid="quick-add"]', state="visible", timeout=8000)
    val = page.locator('#quickAddInput').input_value()
    assert val == "Read article on habits", f"prefill text param, thấy: {val!r}"

    # 2) share-target style: title+text+url → text + url, javascript: url bị loại
    page.goto(f"{base}/app?title=Share&text=Interesting%20link&url=https%3A%2F%2Fexample.com%2Fa", wait_until="networkidle")
    page.wait_for_selector('[data-testid="quick-add"]', state="visible", timeout=8000)
    val = page.locator('#quickAddInput').input_value()
    assert "Interesting link" in val and "https://example.com/a" in val, f"text+url ghép, thấy: {val!r}"

    # 3) malicious HTML + javascript: url → input giữ text thuần, không inject
    page.goto(f"{base}/app?quick=1&text=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E%20note&url=javascript%3Aalert(1)", wait_until="networkidle")
    page.wait_for_selector('[data-testid="quick-add"]', state="visible", timeout=8000)
    val = page.locator('#quickAddInput').input_value()
    assert "<img" in val and "javascript:" not in val, f"sanitize: img giữ text thuần, javascript: bị loại, thấy: {val!r}"
    assert page.evaluate("document.querySelector('#quickAddModal img') === null"), "không được render <img> từ payload"
    assert not page.evaluate("window.__quickAddXss || false"), "không có script chạy từ payload"
    page.locator('[data-action="quickadd-close"]').first.click()
    page.wait_for_selector('[data-testid="quick-add"]', state="hidden")

    # 4) Inbox persist: submit với text đã prefill → task trong inbox
    page.goto(f"{base}/app?quick=1&text=Capture%20into%20inbox", wait_until="networkidle")
    page.wait_for_selector('[data-testid="quick-add"]', state="visible", timeout=8000)
    page.locator('[data-action="quickadd-do"]').first.click()
    page.wait_for_selector('[data-testid="quick-add"]', state="hidden")
    inbox = page.evaluate("JSON.parse(localStorage.getItem('planner-inbox') || '[]')")
    assert any("Capture into inbox" in (t.get("text") or "") for t in inbox), "task phải vào Inbox"

    assert_no_page_overflow(page, f"qcapture {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()


def gcal_checks(browser, base, width, height, errors, screenshot):
    """V1.6A: Google Calendar read-only in Schedule view.
    1) disconnected (no /api stub) → connect button + note render
    2) stub status=connected + events → Google events render in the gcal section
    3) all-day vs timed distinct; events only on the selected day
    4) busyForDate (planner) exposes timed windows with _gcal flag
    """
    import datetime
    # SW-blocked context: TaskFlow's service worker takes control of the origin
    # after first load, and WebKit then refuses page.route interception for
    # subsequent fetches (incl. cross-origin fall-through). Blocking the SW in
    # this scenario keeps the API stubs deterministic on every engine. The app
    # itself is SW-agnostic here (offline caching is covered by its own smoke).
    ctx = browser.new_context(
        viewport={"width": width, "height": height}, service_workers="block"
    )
    page = ctx.new_page()
    page.emulate_media(reduced_motion="reduce")
    page.on("pageerror", lambda error: errors.append(f"gcal {width}px: {error}"))
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.add_init_script("localStorage.setItem('planner-lang','en');")
    page.add_init_script("localStorage.removeItem('planner-gcal-cache');")

    # 1) Schedule view, stub disconnected → connect button + note
    today = datetime.date.today()
    tomorrow = today + datetime.timedelta(days=1)
    day_iso = today.isoformat()
    tomorrow_iso = tomorrow.isoformat()
    stub_state = {"connected": False}

    def handle_cal(route):
        url = route.request.url
        if url.endswith("/api/calendar/status"):
            if stub_state["connected"]:
                body = ('{"connected":true,"write":false,"calendars":[{"id":"primary","summary":"Main","primary":true}],"fetchedAt":"2026-08-20T00:00:00.000Z"}')
            else:
                body = '{"connected":false,"write":false,"calendars":[],"fetchedAt":null}'
            route.fulfill(status=200, content_type="application/json", body=body)
            return
        if "/api/calendar/events" in url:
            import json
            events = [
                {"_calendarId": "primary", "id": "g1", "summary": "Standup",
                 "start": {"dateTime": f"{day_iso}T09:00:00+07:00"},
                 "end": {"dateTime": f"{day_iso}T10:00:00+07:00"}},
                {"_calendarId": "primary", "id": "g2", "summary": "Holiday",
                 "start": {"date": f"{day_iso}"}, "end": {"date": f"{tomorrow_iso}"}},
                {"_calendarId": "primary", "id": "g3", "summary": "Tomorrow call",
                 "start": {"dateTime": f"{tomorrow_iso}T14:00:00+07:00"},
                 "end": {"dateTime": f"{tomorrow_iso}T15:00:00+07:00"}},
            ]
            route.fulfill(status=200, content_type="application/json", body=json.dumps({
                "events": events, "errors": [], "fetchedAt": "2026-08-20T00:00:00.000Z"
            }))
            return
        route.continue_()

    page.route("**/api/calendar/**", handle_cal)
    page.goto(f"{base}/app.html?view=calendar", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').first.click()
    page.wait_for_selector('[data-testid="gcal-section"]', state="visible", timeout=8000)
    assert page.locator('[data-action="gcal-connect"]').count() >= 1, "disconnected phải có nút Connect"
    assert page.locator('.gcal-connect-note').count() >= 1, "disconnected phải có note"

    # 2) Stub connected + events today: timed 09:00-10:00, all-day, tomorrow event
    stub_state["connected"] = True
    page.reload(wait_until="networkidle")
    # reload reset calendarMode về 'month' — bật lại Schedule view
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').first.click()
    page.wait_for_selector('[data-testid="gcal-section"]', state="visible", timeout=8000)
    page.wait_for_selector('.gcal-event', state="visible", timeout=8000)

    # today: Standup (timed) + Holiday (all-day) — not Tomorrow call
    summaries = page.locator('.gcal-event-summary').all_inner_texts()
    joined = " ".join(summaries)
    assert "Standup" in joined and "Holiday" in joined, f"today phải có Standup + Holiday, thấy: {summaries}"
    assert "Tomorrow call" not in joined, f"event ngày mai không được hiện hôm nay, thấy: {summaries}"
    assert page.locator('.gcal-event.all-day').count() >= 1, "all-day event phải đánh dấu distinct"
    assert page.locator('.gcal-event-time.all-day').count() >= 1, "all-day có nhãn Cả ngày / All day"
    assert page.locator('.gcal-badge').count() >= 1, "connected phải có badge"

    # 3) planner busyForDate: timed windows, _gcal flag, all-day bị loại
    busy = page.evaluate("""
      (d) => window.TaskFlowGCal.busyForDate(window.TaskFlowGCal.loadCache().events, d)
    """, day_iso)
    assert len(busy) == 1, f"busy phải có đúng 1 timed window, thấy: {busy}"
    assert busy[0]["_gcal"] is True, "busy window phải đánh dấu _gcal"

    # 4) no horizontal overflow on mobile
    assert_no_page_overflow(page, f"gcal {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()
    ctx.close()


def gcal_write_checks(browser, base, width, height, errors, screenshot):
    """V1.6B: export TimeBlock → Google Calendar (write scope + mapping + idempotent).
    1) seed 1 TimeBlock hôm nay 09:00-10:00 + stub status connected write:true
    2) Schedule view: block có nút .gcal-export (Add to Google Calendar)
    3) click export → stub tạo event → badge .gcal-exported + mapping trong mirror
    4) duplicate: gọi exportBlock lại → duplicate:true, KHÔNG gọi stub lần 2
    """
    import json
    import datetime
    ctx = browser.new_context(
        viewport={"width": width, "height": height}, service_workers="block"
    )
    page = ctx.new_page()
    page.emulate_media(reduced_motion="reduce")
    page.on("pageerror", lambda error: errors.append(f"gcal-write {width}px: {error}"))
    today = datetime.date.today()
    day_iso = today.isoformat()

    # Seed 2 TimeBlock hôm nay (block-e2e2 dùng cho test syncDeletes) + onboarded
    seed_block = json.dumps({
        "version": 1,
        "blocks": [{
            "id": "block-e2e1", "taskUid": None, "date": day_iso,
            "start": "09:00", "end": "10:00", "status": "planned",
            "createdAt": "2026-08-20T00:00:00.000Z", "updatedAt": "2026-08-20T00:00:00.000Z",
        }, {
            "id": "block-e2e2", "taskUid": None, "date": day_iso,
            "start": "14:00", "end": "15:00", "status": "planned",
            "createdAt": "2026-08-20T00:00:00.000Z", "updatedAt": "2026-08-20T00:00:00.000Z",
        }],
    })
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.add_init_script("localStorage.setItem('planner-lang','en');")
    page.add_init_script(f"localStorage.setItem('planner-timeblocks', {json.dumps(seed_block)});")
    page.add_init_script("localStorage.removeItem('planner-gcal-mappings');")
    page.add_init_script("localStorage.removeItem('planner-gcal-cache');")

    export_calls = []
    unlink_calls = []

    def handle_cal(route):
        url = route.request.url
        if url.endswith("/api/calendar/status"):
            body = ('{"connected":true,"write":true,"calendars":[{"id":"primary","summary":"Main","primary":true}],"fetchedAt":"2026-08-20T00:00:00.000Z"}')
            route.fulfill(status=200, content_type="application/json", body=body)
            return
        if url.endswith("/api/calendar/export"):
            req = json.loads(route.request.post_data or "{}")
            export_calls.append(req)
            route.fulfill(status=200, content_type="application/json", body=json.dumps({
                "ok": True, "duplicate": False, "updated": req.get("update") is True,
                "mapping": {
                    "taskflowBlockId": req.get("blockId"),
                    "googleEventId": "gcal-ev-" + req.get("blockId"),
                    "calendarId": req.get("calendarId", "primary"),
                    "lastSyncedAt": "2026-08-20T10:00:00.000Z",
                },
            }))
            return
        if url.endswith("/api/calendar/unlink"):
            req = json.loads(route.request.post_data or "{}")
            unlink_calls.append(req)
            route.fulfill(status=200, content_type="application/json", body=json.dumps({
                "ok": True, "deletedEvent": req.get("deleteEvent") is True,
            }))
            return
        if "/api/calendar/events" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"events": [], "errors": [], "fetchedAt": "2026-08-20T00:00:00.000Z"}))
            return
        route.continue_()

    page.route("**/api/calendar/**", handle_cal)
    page.goto(f"{base}/app.html?view=calendar", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.locator('[data-action="cal-mode"][data-mode="schedule"]').first.click()
    page.wait_for_selector('[data-testid="schedule-view"]', state="visible", timeout=8000)

    # 2) block row có nút export
    page.wait_for_selector('.tb-block[data-block-id="block-e2e1"]', state="visible", timeout=8000)
    assert page.locator('.tb-block[data-block-id="block-e2e1"] [data-action="gcal-export"]').count() >= 1, \
        "block phải có nút Add to Google Calendar"

    # 3) click export → badge exported + stub gọi đúng 1 lần với blockId đúng
    page.locator('.tb-block[data-block-id="block-e2e1"] [data-action="gcal-export"]').click()
    page.wait_for_selector('.gcal-exported[data-exported="block-e2e1"]', state="visible", timeout=8000)
    assert len(export_calls) == 1, f"export phải gọi stub 1 lần, thấy {len(export_calls)}"
    assert export_calls[0]["blockId"] == "block-e2e1", "body phải mang blockId đúng"
    assert export_calls[0]["startIso"] and export_calls[0]["endIso"], "body phải có ISO instant"
    assert export_calls[0]["endIso"] > export_calls[0]["startIso"], "end sau start"

    # mirror mapping đã lưu localStorage
    mirror = page.evaluate("() => window.TaskFlowGCal.mappingForBlock('block-e2e1')")
    assert mirror and mirror["googleEventId"] == "gcal-ev-block-e2e1", f"mapping mirror sai: {mirror}"

    # 4) duplicate — client guard: gọi lại không thêm call stub
    dup = page.evaluate("""
      () => window.TaskFlowGCal.exportBlock(
        { id: 'block-e2e1', taskUid: null, date: %r, start: '09:00', end: '10:00' },
        { title: 'x' }
      )
    """ % day_iso)
    assert dup.get("duplicate") is True, f"export lặp phải duplicate: {dup}"
    assert len(export_calls) == 1, f"duplicate KHÔNG được gọi stub lần 2, thấy {len(export_calls)}"

    # 5) V1.6C push-only — sửa block đã export → PATCH (export update:true), event id giữ nguyên
    block_row = page.locator('.tb-block[data-block-id="block-e2e1"]')
    block_row.locator('[data-action="tb-edit"]').scroll_into_view_if_needed()
    block_row.locator('[data-action="tb-edit"]').click()
    page.wait_for_selector('[data-testid="timeblock-modal"]:visible', state="visible")
    page.locator('[data-role="tb-start"]').fill("09:30")
    page.locator('[data-action="tb-save"]').click()
    page.wait_for_selector('[data-testid="timeblock-modal"]:visible', state="detached")
    assert len(export_calls) == 2, f"sửa block đã export phải gọi export lần 2, thấy {len(export_calls)}"
    assert export_calls[1].get("update") is True, "body lần 2 phải mang update:true (PATCH)"
    assert export_calls[1]["blockId"] == "block-e2e1", "PATCH đúng block"
    assert export_calls[1]["startIso"] > export_calls[0]["startIso"], "PATCH mang giờ mới (sau 09:00)"
    mirror1 = page.evaluate("() => window.TaskFlowGCal.mappingForBlock('block-e2e1')")
    assert mirror1 and mirror1["googleEventId"] == "gcal-ev-block-e2e1", "update giữ nguyên event id"

    # 6) V1.6C — xóa block: syncDeletes mặc định OFF → unlink deleteEvent:false, event Google GIỮ
    page.locator('.tb-block[data-block-id="block-e2e1"] [data-action="tb-del"]').scroll_into_view_if_needed()
    page.locator('.tb-block[data-block-id="block-e2e1"] [data-action="tb-del"]').click()
    page.wait_for_timeout(250)
    assert len(unlink_calls) == 1, f"xóa block có mapping phải gọi unlink, thấy {len(unlink_calls)}"
    assert unlink_calls[0]["blockId"] == "block-e2e1"
    assert unlink_calls[0].get("deleteEvent") is False, "mặc định KHÔNG xóa event Google (deleteEvent:false)"
    assert page.locator('.tb-block[data-block-id="block-e2e1"]').count() == 0, "block đã xóa khỏi timeline"
    assert page.evaluate("() => window.TaskFlowGCal.mappingForBlock('block-e2e1')") is None, "mapping mirror đã bỏ"

    # 7) V1.6C — bật syncDeletes → export block 2 → xóa → unlink deleteEvent:true (DELETE event)
    page.evaluate("() => window.TaskFlowGCal.setSyncDeletes(true)")
    assert page.evaluate("() => window.TaskFlowGCal.getSyncDeletes()") is True, "cờ phải bật"
    row2 = page.locator('.tb-block[data-block-id="block-e2e2"]')
    row2.locator('[data-action="gcal-export"]').scroll_into_view_if_needed()
    row2.locator('[data-action="gcal-export"]').click()
    page.wait_for_selector('.gcal-exported[data-exported="block-e2e2"]', state="visible", timeout=8000)
    assert len(export_calls) == 3, f"export block 2 phải gọi stub, thấy {len(export_calls)}"
    assert export_calls[2]["blockId"] == "block-e2e2" and export_calls[2].get("update") is not True
    row2 = page.locator('.tb-block[data-block-id="block-e2e2"]')
    row2.locator('[data-action="tb-del"]').scroll_into_view_if_needed()
    row2.locator('[data-action="tb-del"]').click()
    page.wait_for_timeout(250)
    assert len(unlink_calls) == 2, f"xóa block 2 phải gọi unlink lần 2, thấy {len(unlink_calls)}"
    assert unlink_calls[1]["blockId"] == "block-e2e2"
    assert unlink_calls[1].get("deleteEvent") is True, "bật syncDeletes → deleteEvent:true (DELETE event Google)"

    assert_no_page_overflow(page, f"gcal-write {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()
    ctx.close()


def ai_checks(browser, base, width, height, errors, screenshot):
    """V2.0: AI Copilot — proposal → preview → explicit Apply (không tự ghi state).
    1) seed 2 task hôm nay + 2 TimeBlock → mở planner → AI panel + consent chips
       (tasks/projects/schedule checked, reflections/mood unchecked)
    2) ai-run với stub proposal hợp lệ → preview hiện summary + action list
    3) request body gửi lên server không chứa reflections/mood (allowSensitive=false)
    4) ai-cancel → KHÔNG thay đổi data (planner-timeblocks giữ nguyên)
    5) ai-run → ai-apply → tạo đúng 1 TimeBlock mới (10:00-11:00), modal đóng.
    """
    import json
    import datetime
    # SW-blocked: TaskFlow SW khiến WebKit bỏ qua page.route cho fetch sau đó
    # (cross-origin fall-through cũng vậy) — xem gcal_checks. AI fetch là
    # cross-origin (API_CONFIG.url) nên cần route stub deterministic trên mọi engine.
    ctx = browser.new_context(
        viewport={"width": width, "height": height}, service_workers="block"
    )
    page = ctx.new_page()
    page.emulate_media(reduced_motion="reduce")
    page.on("pageerror", lambda error: errors.append(f"ai {width}px: {error}"))
    page.add_init_script("""(() => {
      localStorage.setItem('planner-onboarded','1');
      localStorage.setItem('planner-lang','en');
      const now = new Date();
      const year = now.getFullYear(), month = now.getMonth();
      const key = 'planner-' + year + '-' + (month + 1);
      let state;
      try { state = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { state = null; }
      if (!state) state = { version: 1, weeks: [], pillars: [], habits: [] };
      state.monthKey = key;
      state.schemaVersion = 2;
      if (!Array.isArray(state.monthlyGoals)) state.monthlyGoals = [];
      if (!Array.isArray(state.habits)) state.habits = [];
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const start = new Date(year, month, 1 - offset);
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const numWeeks = Math.ceil((offset + daysInMonth) / 7);
      while (state.weeks.length < numWeeks) state.weeks.push({ days: [] });
      state.weeks.length = numWeeks;
      state.weeks.forEach(w => { while (w.days.length < 7) w.days.push({ tasks: [] }); });
      const delta = Math.floor((now - start) / 86400000);
      const week = Math.floor(delta / 7), day = delta % 7;
      const dayState = state.weeks[week].days[day];
      const yst = new Date(year, month, now.getDate() - 1);
      const ystIso = yst.getFullYear() + '-' + String(yst.getMonth() + 1).padStart(2,'0') + '-' + String(yst.getDate()).padStart(2,'0');
      dayState.tasks = [
        { uid: 'ai-t1', kind: 'regular', done: false, text: 'AI task one', estimatedMinutes: 60,
          deadline: ystIso, tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } },
        { uid: 'ai-t2', kind: 'regular', done: false, text: 'AI task two', estimatedMinutes: 30,
          tags: [], linkedMetricIds: [], remind: { enabled: false, time: '20:00' } },
      ];
      localStorage.setItem(key, JSON.stringify(state));
      const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
      localStorage.setItem('planner-timeblocks', JSON.stringify({ version: 1, blocks: [
        { id: 'ai-b1', taskUid: 'ai-t2', date: today, start: '09:00', end: '10:00', status: 'planned', createdAt: '', updatedAt: '' },
        { id: 'ai-b2', taskUid: 'ai-t1', date: today, start: '11:00', end: '12:00', status: 'planned', createdAt: '', updatedAt: '' },
      ] }));
    })()""")

    ai_bodies = []

    def handle_ai(route):
        url = route.request.url
        if url.endswith("/api/ai/plan"):
            try:
                body = json.loads(route.request.post_data or "{}")
                ai_bodies.append(body)
            except Exception:
                pass
            # Proposal hợp lệ: schedule ai-t1 vào khe trống 10:00-11:00 + 1 gợi ý.
            today = datetime.date.today().isoformat()
            payload = {
                "ok": True,
                "proposal": {
                    "summary": "Plan for today: focus on AI task one.",
                    "actions": [
                        {"type": "schedule_task", "taskUid": "ai-t1",
                         "date": today, "start": "10:00", "duration": 60},
                        {"type": "next_action", "text": "Review inbox"},
                    ],
                },
            }
            route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))
            return
        route.continue_()

    page.route("**/api/ai/plan", handle_ai)
    page.goto(f"{base}/app.html?view=today", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="today-view"]', state="visible")

    # 1) Mở planner → AI panel + consent mặc định
    page.locator('[data-action="planner-open"]').click()
    page.wait_for_selector('[data-testid="planner-modal"]:visible', state="visible")
    page.wait_for_selector('[data-role="ai-panel"]', state="visible")
    assert page.locator('[data-ai-consent]').count() == 5, "phải có 5 consent chips"
    checked = page.locator('[data-ai-consent]:checked').evaluate_all(
        "(els) => els.map((e) => e.getAttribute('data-ai-consent'))"
    )
    assert set(checked) == {"tasks", "projects", "schedule"}, f"mặc định chỉ tasks/projects/schedule, thấy: {checked}"
    assert page.locator('[data-ai-consent="reflections"]:checked').count() == 0, "reflections mặc định TẮT"
    assert page.locator('[data-ai-consent="mood"]:checked').count() == 0, "mood mặc định TẮT"

    # 2) ai-run → preview hiện summary + 2 action
    before_blocks = page.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('planner-timeblocks')).blocks)")
    page.locator('[data-action="ai-run"]').click()
    page.wait_for_selector('[data-role="ai-preview"]', state="visible", timeout=8000)
    summary = page.locator('.ai-summary').inner_text()
    assert "AI task one" in summary, f"summary phải mention task, thấy: {summary}"
    assert page.locator('.ai-actions-list li').count() == 2, "preview phải có 2 action"
    assert page.locator('.ai-warn').count() == 0, "khe 10:00-11:00 trống → không warning chồng giờ"

    # 3) PRIVACY: body gửi lên server không chứa reflections/mood
    assert len(ai_bodies) >= 1, "phải có request tới /api/ai/plan"
    sent_ctx = ai_bodies[-1].get("context", {})
    assert sent_ctx.get("allowSensitive") is False, "allowSensitive phải false (chưa opt-in)"
    assert "reflections" not in sent_ctx, "reflections KHÔNG được gửi khi chưa opt-in"
    assert "mood" not in sent_ctx, "mood KHÔNG được gửi khi chưa opt-in"

    # 4) ai-cancel → KHÔNG thay đổi data
    page.locator('[data-action="ai-cancel"]').click()
    page.wait_for_selector('[data-role="ai-preview"]', state="detached")
    after_cancel = page.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('planner-timeblocks')).blocks)")
    assert after_cancel == before_blocks, "Cancel KHÔNG được tạo TimeBlock"

    # 5) ai-run → ai-apply → tạo TimeBlock mới 10:00-11:00, modal đóng
    page.locator('[data-action="ai-run"]').click()
    page.wait_for_selector('[data-role="ai-preview"]', state="visible", timeout=8000)
    page.locator('[data-action="ai-apply"]').click()
    page.wait_for_selector('[data-testid="planner-modal"]:visible', state="detached")
    blocks = page.evaluate("JSON.parse(localStorage.getItem('planner-timeblocks')).blocks")
    assert len(blocks) == 3, f"Apply phải tạo đúng 1 block (2 → 3), thấy {len(blocks)}"
    assert any(b["taskUid"] == "ai-t1" and b["start"] == "10:00" and b["end"] == "11:00" for b in blocks), \
        "block mới phải là ai-t1 10:00-11:00"

    assert_no_page_overflow(page, f"ai {width}px")
    page.screenshot(path=screenshot, full_page=False)
    page.close()
    ctx.close()


def insights_checks(browser, base, width, height, errors, screenshot):
    """V1.4.1: Actionable Insights in Reports.
    1) no data → Reports shows the insights empty state
    2) seeded month state (mixed estimated minutes) → rule-based insights render
    3) reopen report → same insights (deterministic, max 5)
    """
    page = make_page(browser, width, height)
    page.on("pageerror", lambda error: errors.append(f"insights {width}px: {error}"))
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.add_init_script("localStorage.setItem('planner-lang','en');")

    # 1) empty data → empty state
    page.goto(f"{base}/app", wait_until="networkidle")
    page.evaluate("window.TaskFlowReportUI.openReportModal()")
    page.wait_for_selector('[data-testid="report-insights"]', state="visible", timeout=8000)
    assert page.locator('.report-insights-empty').count() == 1, "empty data phải hiển thị empty state"
    page.evaluate("window.TaskFlowReportUI.closeReportModal()")

    # 2) seed current-month state (nested weeks[].days[].tasks): 3 long open on
    #    day 0 + 3 short done on day 1 → duration + planned insights fire
    import datetime
    today = datetime.date.today()
    key = f"planner-{today.year}-{today.month}"
    tasks = [
        {"uid": "i1", "text": "Long task A", "done": False, "estimatedMinutes": 120},
        {"uid": "i2", "text": "Long task B", "done": False, "estimatedMinutes": 120},
        {"uid": "i3", "text": "Long task C", "done": False, "estimatedMinutes": 120},
        {"uid": "i4", "text": "Short task D", "done": True, "estimatedMinutes": 30},
        {"uid": "i5", "text": "Short task E", "done": True, "estimatedMinutes": 30},
        {"uid": "i6", "text": "Short task F", "done": True, "estimatedMinutes": 30},
    ]
    page.evaluate(f"""
      () => {{
        const s = JSON.parse(localStorage.getItem('{key}'));
        s.weeks[0].days[0].tasks = {json.dumps(tasks[:3])};
        s.weeks[0].days[1].tasks = {json.dumps(tasks[3:])};
        localStorage.setItem('{key}', JSON.stringify(s));
      }}
    """)
    page.reload(wait_until="networkidle")

    page.evaluate("window.TaskFlowReportUI.openReportModal()")
    page.wait_for_selector('[data-testid="report-insights"]', state="visible", timeout=8000)
    lis = page.locator('.report-insights li')
    n = lis.count()
    assert n >= 1, f"phải có insight từ dữ liệu đã seed, count={n}"
    assert n <= 5, f"tối đa 5 insights, count={n}"
    texts = lis.all_inner_texts()
    assert any("90" in tx for tx in texts), f"phải có insight về task trên 90 phút: {texts}"
    first = texts[:]

    # 3) determinism: close + reopen → same list
    page.evaluate("window.TaskFlowReportUI.closeReportModal()")
    page.evaluate("window.TaskFlowReportUI.openReportModal()")
    page.wait_for_selector('[data-testid="report-insights"]', state="visible", timeout=8000)
    assert page.locator('.report-insights li').all_inner_texts() == first, "reopen phải cho cùng insights"
    page.evaluate("window.TaskFlowReportUI.closeReportModal()")

    assert_no_page_overflow(page, f"insights {width}px")
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
    parser.add_argument("--view", choices=["overview", "week", "year", "calendar", "segmented-geometry", "schedule-unscheduled", "inbox", "deeplink", "taskdetail", "reflection", "task-focus-metrics", "daily-alignment", "weekly-review", "monthly-review", "month-carryover", "report-growth", "data-lifecycle", "projects", "planner", "timeblock-ui", "habits-schedule", "quick-capture", "insights", "gcal", "gcal-write", "ai"], default="overview")
    parser.add_argument("--dialogs", action="store_true")
    parser.add_argument("--landing", action="store_true")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--screenshots", action="store_true")
    parser.add_argument(
        "--source-assets",
        action="store_true",
        help="serve authored Schedule CSS/JS for focused pre-release verification",
    )
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
                    ("segmented-geometry", segmented_geometry_checks),
                    ("schedule-unscheduled", schedule_unscheduled_checks),
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
                    ("daily-alignment", daily_alignment_checks),
                    ("weekly-review", weekly_review_checks),
                    ("monthly-review", monthly_review_checks),
                    ("month-carryover", month_carryover_checks),
                    ("report-growth", report_growth_checks),
                    ("data-lifecycle", data_lifecycle_checks),
                    ("projects", projects_checks),
                    ("planner", planner_checks),
                    ("timeblock-ui", timeblock_ui_checks),
                    ("habits-schedule", habits_schedule_checks),
                    ("quick-capture", quick_capture_checks),
                    ("insights", insights_checks),
                    ("gcal", gcal_checks),
                    ("gcal-write", gcal_write_checks),
                    ("ai", ai_checks),
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
            elif args.view == "segmented-geometry":
                segmented_geometry_checks(browser, base, 1440, 900, errors, shots["desktop"])
                segmented_geometry_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "schedule-unscheduled":
                schedule_unscheduled_checks(
                    browser, base, 1440, 900, errors, shots["desktop"], source_assets=args.source_assets
                )
                schedule_unscheduled_checks(
                    browser, base, 390, 844, errors, shots["mobile"], source_assets=args.source_assets
                )
                schedule_visual_matrix_checks(browser, base, errors, source_assets=args.source_assets)
            elif args.view == "inbox":
                inbox_checks(browser, base, 1440, 900, errors, shots["desktop"])
                inbox_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "deeplink":
                deeplink_checks(browser, base, 1440, 900, errors, shots["desktop"])
                deeplink_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "taskdetail":
                taskdetail_checks(browser, base, 1440, 900, errors, shots["desktop"])
                taskdetail_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "reflection":
                reflection_checks(browser, base, 1440, 900, errors, shots["desktop"])
                reflection_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "task-focus-metrics":
                task_focus_metrics_checks(browser, base, 1440, 900, errors, shots["desktop"])
                task_focus_metrics_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "daily-alignment":
                daily_alignment_checks(browser, base, 1440, 900, errors, shots["desktop"])
                daily_alignment_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "weekly-review":
                weekly_review_checks(browser, base, 1440, 900, errors, shots["desktop"])
                weekly_review_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "monthly-review":
                monthly_review_checks(browser, base, 1440, 900, errors, shots["desktop"])
                monthly_review_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "month-carryover":
                month_carryover_checks(browser, base, 1440, 900, errors, shots["desktop"])
                month_carryover_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "report-growth":
                report_growth_checks(browser, base, 1440, 900, errors, shots["desktop"])
                report_growth_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "data-lifecycle":
                data_lifecycle_checks(browser, base, 1440, 900, errors, shots["desktop"])
                data_lifecycle_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "projects":
                projects_checks(browser, base, 1440, 900, errors, shots["desktop"])
                projects_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "planner":
                planner_checks(browser, base, 1440, 900, errors, shots["desktop"])
                planner_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "timeblock-ui":
                timeblock_ui_checks(browser, base, 1440, 900, errors, shots["desktop"])
                timeblock_ui_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "habits-schedule":
                habits_schedule_checks(browser, base, 1440, 900, errors, shots["desktop"])
                habits_schedule_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "quick-capture":
                quick_capture_checks(browser, base, 1440, 900, errors, shots["desktop"])
                quick_capture_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "insights":
                insights_checks(browser, base, 1440, 900, errors, shots["desktop"])
                insights_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "gcal":
                gcal_checks(browser, base, 1440, 900, errors, shots["desktop"])
                gcal_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "gcal-write":
                gcal_write_checks(browser, base, 1440, 900, errors, shots["desktop"])
                gcal_write_checks(browser, base, 390, 844, errors, shots["mobile"])
            elif args.view == "ai":
                ai_checks(browser, base, 1440, 900, errors, shots["desktop"])
                ai_checks(browser, base, 390, 844, errors, shots["mobile"])

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
    # Stable focused-output markers asserted by phase tests:
    # E2E WEEKLY-REVIEW OK / E2E MONTHLY-REVIEW OK / E2E MONTH-CARRYOVER OK / E2E REPORT-GROWTH OK / E2E DATA-LIFECYCLE OK
    print(f"E2E {label} OK")
    print("SCREENSHOTS:", shots["desktop"], shots["mobile"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
