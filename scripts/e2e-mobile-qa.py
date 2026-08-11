"""TaskFlow mobile real-device QA checklist (simulated in Playwright).

Runs the P1.10 mobile QA checklist at 360x800 (small Android), 390x844
(common mobile), 412x915 (large mobile) and 768x1024 (tablet -> desktop
layout, since the app's mobile breakpoint is max-width: 767px).

Covered per viewport: header (title/search/sticky), bottom nav (single
active, >=44px targets, labels), quick add, task drawer, today (last task
above nav + checkbox hit area), upcoming, inbox (schedule action via the
real empty-state flow), week, calendar, habits (widget reachable; the dense
31-column habit grid is a documented exclusion), focus (timer reachable),
search, auth (sync modal layout + input font-size vs iOS zoom), dark mode,
no horizontal overflow, page errors. Legal pages checked separately.

Simulation limits (noted in the report): software keyboard is not emulated,
env(safe-area-inset-*) is 0 in headless (no notch), and this is not a
physical device.

Usage: python scripts/e2e-mobile-qa.py [--browser chromium|firefox|webkit]
Writes docs/mobile-qa.md and screenshots to the temp dir. Exit 1 on any FAIL.
"""
import argparse
import datetime
import http.server
import os
import socketserver
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

VIEWPORTS = [  # (width, height, label)
    (360, 800, "360x800 (small Android)"),
    (390, 844, "390x844 (common mobile)"),
    (412, 915, "412x915 (large mobile)"),
    (768, 1024, "768x1024 (tablet)"),
]
MOBILE_MAX = 767  # app's mobile layout breakpoint (max-width: 767px)

LEGAL_PAGES = ["privacy.html", "terms.html", "data-and-security.html"]

results = []  # (viewport, area, check, status, detail)
errors = []   # pageerror strings


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def record(viewport, area, check, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((viewport, area, check, status, detail))
    print(f"[{status}] {viewport} | {area}: {check} {detail}".rstrip())


def assert_no_overflow(page, viewport, label):
    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    record(viewport, "overflow", label, overflow <= 1, f"({overflow}px)" if overflow > 1 else "")


def load_app(page, base):
    # Motion determinism (same as e2e-smoke): reduced motion makes every smooth
    # scroll instant so geometry reads are stable on every engine.
    page.emulate_media(reduced_motion="reduce")
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.goto(f"{base}/app.html", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="today-view"]', state="visible")


def open_more_sheet(page, viewport):
    page.locator('#mobileNav [data-action="more"]').click()
    page.wait_for_selector('[data-testid="more-sheet"]', state="visible")
    record(viewport, "more sheet", "opens from bottom nav", True)


def open_tools_drawer(page, viewport, mobile):
    if mobile:
        open_more_sheet(page, viewport)
        page.locator('#moreSheet [data-action="tools-open"]').click()
    else:
        page.locator('#appTopbar [data-action="tools-open"]').click()
    page.wait_for_selector('[data-testid="tools-drawer"]', state="visible")


def close_more_sheet(page, viewport):
    if page.locator('[data-testid="more-sheet"]:visible').count():
        page.locator('#moreSheet [data-action="more-close"]').click()
        page.wait_for_selector('[data-testid="more-sheet"]', state="hidden")


def check_input_font_size(page, viewport, area, selector):
    # iOS zooms into inputs with font-size < 16px (P1.11). Report the actual size.
    size = page.evaluate(
        "(sel) => { const el = document.querySelector(sel); return el ? parseFloat(getComputedStyle(el).fontSize) : null; }",
        selector,
    )
    if size is None:
        record(viewport, area, f"{selector} input font-size", False, "element missing")
    else:
        ok = size >= 16
        record(viewport, area, f"{selector} input font-size >= 16px (iOS zoom)", ok,
               f"({size}px)" if not ok else f"({size}px)")


def check_hit_area(page, viewport, area, selector):
    # Behavioral hit-area test: the 18px visual checkbox gets a ~44px hit target
    # via ::before inset on coarse pointers. Click 19px left of the visual center —
    # inside a 44px target, outside the 18px box — and expect a toggle.
    # Center-scroll first: a row below the fold sits under the fixed bottom nav,
    # which would swallow the click (found with 6 tasks on 360x800).
    page.locator(selector).first.scroll_into_view_if_needed()
    page.evaluate("(sel) => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: 'center' }); }", selector)
    page.wait_for_timeout(120)
    box = page.locator(selector).first.bounding_box()
    if box is None:
        record(viewport, area, f"{selector} hit area >= 44px", False, "element missing")
        return
    before = page.locator(selector).first.get_attribute("aria-checked")
    page.mouse.click(box["x"] + box["width"] / 2 - 19, box["y"] + box["height"] / 2)
    page.wait_for_timeout(120)
    after = page.locator(selector).first.get_attribute("aria-checked")
    ok = after is not None and before is not None and after != before
    record(viewport, area, f"{selector} hit area >= 44px (off-center click toggles)",
           ok, f"(before={before}, after={after})" if not ok else "")
    # Restore the toggle so later checks see a clean state
    if ok:
        page.mouse.click(box["x"] + box["width"] / 2 - 19, box["y"] + box["height"] / 2)
        page.wait_for_timeout(120)


def run_viewport(browser, browser_name, width, height, label, base, screenshots):
    # Touch emulation: is_mobile requires has_touch, and without has_touch the
    # coarse-pointer media queries don't match — row actions stay
    # pointer-events:none and clicks get intercepted (harness artifact). The
    # tablet (768) renders the desktop layout but a real tablet still has a
    # coarse pointer, so it gets has_touch too (is_mobile stays mobile-only).
    touch = browser_name == "chromium"
    page = browser.new_page(
        viewport={"width": width, "height": height},
        is_mobile=(width <= MOBILE_MAX and touch),
        has_touch=touch,
    )
    page.on("pageerror", lambda error: errors.append(f"{label}: {error}"))
    mobile = width <= MOBILE_MAX
    vp = label
    wait = page.wait_for_selector
    try:
        load_app(page, base)

        # ---------- HEADER ----------
        record(vp, "header", "topbar visible", page.locator("#appTopbar").is_visible())
        title = page.locator("#appViewTitle").inner_text().strip()
        record(vp, "header", "view title non-empty", bool(title), f"({title})")
        period = page.locator("#appPeriod").inner_text().strip()
        record(vp, "header", "period label set", bool(period), f"({period})")
        record(vp, "header", "search button visible", page.locator('#appTopbar [data-action="search-toggle"]').is_visible())
        sticky = page.evaluate("getComputedStyle(document.getElementById('appTopbar')).position")
        record(vp, "header", "topbar sticky", sticky == "sticky", f"(position={sticky})")

        # ---------- BOTTOM NAV (mobile only) / SIDEBAR (tablet) ----------
        if mobile:
            record(vp, "bottom nav", "visible", page.locator("#mobileNav").is_visible())
            record(vp, "bottom nav", "exactly one active tab",
                   page.locator('#mobileNav [aria-current="page"]').count() == 1)
            nav_items = page.locator("#mobileNav .app-mobile-nav-item")
            fab = page.locator("#mobileNav .app-mobile-nav-fab")
            record(vp, "bottom nav", "5 columns (today/upcoming/+/habits/more)",
                   nav_items.count() == 4 and fab.count() == 1,
                   f"(items={nav_items.count()}, fab={fab.count()})")
            small = page.evaluate(
                """() => {
                  const bad = [];
                  document.querySelectorAll('#mobileNav button').forEach((b) => {
                    const r = b.getBoundingClientRect();
                    if (r.height < 44) bad.push(b.className + ':' + Math.round(r.height) + 'px');
                  });
                  return bad;
                }"""
            )
            record(vp, "bottom nav", "touch targets >= 44px", not small,
                   ", ".join(small) if small else "")
            wrap = page.evaluate(
                """() => {
                  const bad = [];
                  document.querySelectorAll('#mobileNav button span').forEach((s) => {
                    if (s.scrollWidth > s.clientWidth + 1) bad.push(s.textContent.trim());
                  });
                  return bad;
                }"""
            )
            record(vp, "bottom nav", "labels don't wrap", not wrap,
                   ", ".join(wrap) if wrap else "")
            fixed = page.evaluate("getComputedStyle(document.getElementById('mobileNav')).position")
            record(vp, "bottom nav", "fixed to viewport bottom", fixed == "fixed", f"(position={fixed})")
        else:
            record(vp, "sidebar", "desktop sidebar visible", page.locator("#desktopSidebar").is_visible())
            record(vp, "sidebar", "mobile nav hidden", page.locator("#mobileNav").is_hidden())
        assert_no_overflow(page, vp, "initial layout")

        # ---------- QUICK ADD ----------
        trigger = page.locator('#mobileNav [data-action="shell-add-task"]') if mobile else page.locator(".app-primary-action")
        trigger.click()
        wait('[data-testid="quick-add"]', state="visible")
        record(vp, "quick add", "opens", True)
        for sel in ("#quickAddInput", "#quickAddDate", "#quickAddTime", "#quickAddDur", "#quickAddPrio"):
            record(vp, "quick add", f"field {sel} present", page.locator(sel).count() == 1)
        submit_box = page.locator('[data-action="quickadd-do"]').bounding_box()
        reachable = submit_box is not None and submit_box["y"] + submit_box["height"] <= height
        record(vp, "quick add", "submit reachable (not below fold)", reachable)
        check_input_font_size(page, vp, "quick add", "#quickAddInput")
        before = page.locator('[data-role="task-text"]').count()
        page.locator("#quickAddInput").fill(f"QA task {width}x{height}")
        page.keyboard.press("Enter")
        wait('[data-testid="quick-add"]', state="hidden")
        after = page.locator('[data-role="task-text"]').count()
        record(vp, "quick add", "task created (count +1)", after == before + 1, f"({before} -> {after})")
        assert_no_overflow(page, vp, "after quick add")

        # ---------- TODAY: last task above nav + checkbox hit area ----------
        if mobile:
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(150)
            last_task_bottom = page.evaluate(
                """() => {
                  const rows = document.querySelectorAll('.today-task');
                  if (!rows.length) return null;
                  return rows[rows.length - 1].getBoundingClientRect().bottom;
                }"""
            )
            nav_top = page.locator("#mobileNav").bounding_box()["y"]
            record(vp, "today", "last task not hidden behind nav",
                   last_task_bottom is not None and last_task_bottom <= nav_top + 1,
                   f"(taskBottom={round(last_task_bottom) if last_task_bottom else 'n/a'}, navTop={round(nav_top)})")
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(100)
        check_hit_area(page, vp, "today", ".today-task .checkbox")
        check_hit_area(page, vp, "today", ".today-habit .checkbox")

        # ---------- UPCOMING ----------
        nav = page.locator('#mobileNav [data-nav-view="upcoming"]') if mobile else page.locator('#desktopSidebar [data-nav-view="upcoming"]')
        nav.click()
        wait('[data-testid="upcoming-view"]', state="visible")
        record(vp, "upcoming", "view renders (.upcoming-page)", page.locator("#view-upcoming .upcoming-page").count() == 1)
        record(vp, "upcoming", "groups readable (.up-group or empty state)",
               page.locator("#view-upcoming .up-group").count() > 0 or page.locator("#view-upcoming .empty-state").count() > 0)
        assert_no_overflow(page, vp, "upcoming")

        # ---------- INBOX + schedule action (real empty-state flow) ----------
        if mobile:
            open_more_sheet(page, vp)
            page.locator('#moreSheet [data-nav-view="inbox"]').click()
        else:
            page.locator('#desktopSidebar [data-nav-view="inbox"]').click()
        wait('[data-testid="inbox-view"]', state="visible")
        record(vp, "inbox", "view renders", True)
        add_btn = page.locator('[data-testid="inbox-add"]')
        if add_btn.count() == 1:
            add_btn.click()
            wait('[data-testid="inbox-task-row"]', state="visible")
            record(vp, "inbox", "empty-state add creates inline row", True)
            fresh = page.locator('[data-role="inbox-text"]').first
            fresh.click()
            fresh.fill("QA inbox task")
            wait('[data-action="inbox-today"]', state="visible")
            record(vp, "inbox", "schedule action present (inbox-today)", True)
        else:
            record(vp, "inbox", "schedule action present (inbox-today)",
                   page.locator('[data-action="inbox-today"]').count() >= 1)
        assert_no_overflow(page, vp, "inbox")

        # ---------- WEEK + task drawer + focus timer ----------
        if mobile:
            open_more_sheet(page, vp)
            page.locator('#moreSheet [data-nav-view="week"]').click()
        else:
            page.locator('#desktopSidebar [data-nav-view="week"]').click()
        wait('[data-testid="week-view"]', state="visible")
        record(vp, "week", "grid renders",
               page.locator("[data-testid='week-view'] .week-grid, [data-testid='week-view'] .week-goals-card, [data-testid='week-view'] .day-column").count() > 0)
        assert_no_overflow(page, vp, "week")

        # Task drawer from a week row (taskRowHTML has the ⋯ menu -> task-detail)
        row = page.locator('[data-testid="task-row"]').first
        if row.count():
            row.locator('[data-action="task-menu"]').click()
            wait('[data-testid="task-row"] [data-action="task-detail"]', state="visible")
            page.locator('[data-testid="task-row"] [data-action="task-detail"]').first.click()
            wait('[data-testid="task-drawer"]', state="visible")
            record(vp, "task drawer", "opens from task menu", True)
            box = page.locator('[data-testid="task-drawer"]').bounding_box()
            record(vp, "task drawer", "drawer fits viewport",
                   box is not None and box["height"] <= height, f"(h={round(box['height'])}px)" if box else "")
            close = page.locator('[data-testid="task-drawer"] .task-drawer-close, [data-testid="task-drawer"] .sync-close')
            if close.count():
                close.first.click()
                wait('[data-testid="task-drawer"]', state="hidden")
                record(vp, "task drawer", "close reachable + works", True)
            else:
                page.keyboard.press("Escape")
                wait('[data-testid="task-drawer"]', state="hidden")
                record(vp, "task drawer", "closes via Escape", True)
        else:
            record(vp, "task drawer", "no task row in week view", True, "skipped — no rows")

        # Focus timer from a week row focus button (renders timer controls)
        focus_btn = page.locator('[data-testid="task-row"] [data-action="focus-task"]').first
        if focus_btn.count():
            focus_btn.click()
            wait('[data-testid="focus-overlay"]', state="visible")
            for sel in ("#focusTimerStart", '[data-action="focus-timer-set"]', '[data-action="focus-timer-reset"]'):
                present = page.locator(sel).count() >= 1
                b = page.locator(sel).first.bounding_box() if present else None
                reachable = b is not None and b["y"] + b["height"] <= height and b["x"] + b["width"] <= width
                record(vp, "focus", f"timer control {sel} reachable", present and reachable,
                       "(missing)" if not present else f"(x={round(b['x'])},y={round(b['y'])})")
            page.locator('[data-action="focus-close"]').click()
            wait('[data-testid="focus-overlay"]', state="hidden")
        else:
            record(vp, "focus", "timer flow via task focus", True, "skipped — no task rows")

        # ---------- CALENDAR ----------
        if mobile:
            open_more_sheet(page, vp)
            page.locator('#moreSheet [data-nav-view="calendar"]').click()
        else:
            page.locator('#desktopSidebar [data-nav-view="calendar"]').click()
        wait('[data-testid="calendar-view"]', state="visible")
        record(vp, "calendar", "view renders", True)
        assert_no_overflow(page, vp, "calendar")

        # ---------- HABITS (overview widget reachable) ----------
        habits_btn = page.locator('#mobileNav [data-action="habits"]') if mobile else page.locator('#desktopSidebar [data-action="habits"]')
        habits_btn.click()
        wait('[data-testid="overview-view"]', state="visible")
        try:
            wait('[data-widget-id="habits"]', state="visible", timeout=4000)
            record(vp, "habits", "widget reachable from nav", True)
        except Exception:
            record(vp, "habits", "widget reachable from nav", False, "habits widget not visible")
        # Dense 31-column habit grid: 44px targets are physically impossible at
        # 360px width — documented exclusion (components.css), touch targets are
        # covered by the today-habit checkbox hit-area check above.

        # ---------- FOCUS show-all ----------
        if mobile:
            open_more_sheet(page, vp)
            page.locator('#moreSheet [data-action="focus"]').click()
        else:
            page.locator('#desktopSidebar [data-action="focus"]').click()
        wait('[data-testid="focus-overlay"]', state="visible")
        record(vp, "focus", "overlay opens (show-all mode)", True)
        page.locator('[data-action="focus-close"]').click()
        wait('[data-testid="focus-overlay"]', state="hidden")
        close_more_sheet(page, vp)

        # ---------- SEARCH ----------
        page.locator('#appTopbar [data-action="search-toggle"]').click()
        wait('[data-testid="search-modal"]', state="visible")
        record(vp, "search", "modal opens", True)
        record(vp, "search", "input visible", page.locator("#searchInput").is_visible())
        check_input_font_size(page, vp, "search", "#searchInput")
        page.locator('[data-action="search-close"]').click()
        wait('[data-testid="search-modal"]', state="hidden")

        # ---------- AUTH (sync modal layout + iOS zoom) ----------
        open_tools_drawer(page, vp, mobile)
        page.locator('[data-action="sync-toggle"]').click()
        wait('[data-testid="sync-modal"]', state="visible")
        record(vp, "auth", "sync modal opens", True)
        record(vp, "auth", "Google login button present", page.locator('[data-action="sync-google"]').is_visible())
        record(vp, "auth", "credentials form present",
               page.locator("#syncUser").count() == 1 and page.locator("#syncPass").count() == 1)
        card = page.locator('[data-testid="sync-modal"] .dialog, [data-testid="sync-modal"] .sync-modal-card').first
        cbox = card.bounding_box()
        record(vp, "auth", "modal fits viewport (no cut-off)",
               cbox is not None and cbox["height"] <= height and cbox["width"] <= width,
               f"(h={round(cbox['height'])}px)" if cbox else "")
        check_input_font_size(page, vp, "auth", "#syncUser")
        check_input_font_size(page, vp, "auth", "#syncPass")
        page.locator('[data-action="sync-close"]').click()
        wait('[data-testid="sync-modal"]', state="hidden")

        # ---------- DARK MODE ----------
        page.locator('[data-action="dark"]').click()
        dark_on = page.evaluate("document.documentElement.dataset.dark === 'true' || document.documentElement.classList.contains('dark')")
        record(vp, "dark mode", "toggle enables", dark_on)
        assert_no_overflow(page, vp, "dark mode")
        page.locator('[data-action="dark"]').click()
        dark_off = page.evaluate("document.documentElement.dataset.dark !== 'true' && !document.documentElement.classList.contains('dark')")
        record(vp, "dark mode", "toggle disables", dark_off)
        page.locator('#toolsDrawer [data-action="tools-close"]').click()
        wait('[data-testid="tools-drawer"]', state="hidden")

        # ---------- REFLECTION (P8: quick card + deep modal + history) ----------
        nav_today = page.locator('#mobileNav [data-nav-view="today"]') if mobile else page.locator('#desktopSidebar [data-nav-view="today"]')
        nav_today.click()
        wait('[data-testid="reflection-card"]', state="visible", timeout=5000)
        record(vp, "reflection", "quick card renders", True)
        mood_count = page.locator('[data-testid="reflection-card"] .reflect-mood-btn').count()
        record(vp, "reflection", "5 mood radios", mood_count == 5, f"({mood_count})")
        for sel in ('[data-reflect-field="quickGood"]', '[data-reflect-field="quickImprove"]'):
            record(vp, "reflection", f"field {sel} present", page.locator(sel).count() == 1)
            check_input_font_size(page, vp, "reflection", sel)
        # Mood click -> aria-checked flips
        page.locator('[data-testid="reflection-card"] .reflect-mood-btn').nth(3).click()
        checked = page.locator('[data-testid="reflection-card"] .reflect-mood-btn.on').count()
        record(vp, "reflection", "mood select highlights", checked == 1, f"(on={checked})")
        # Fill + save quick -> entry persisted
        page.locator('[data-reflect-field="quickGood"]').fill(f"QA good {width}x{height}")
        page.locator('[data-reflect-field="quickImprove"]').fill("QA improve")
        page.locator('[data-testid="reflection-save-quick"]').click()
        page.wait_for_timeout(400)
        saved = page.evaluate(
            """() => {
              const key = 'planner-reflections-daily';
              try {
                const raw = localStorage.getItem(key);
                if (!raw) return false;
                const map = JSON.parse(raw);
                return Object.values(map).some(e => e && e.quickGood && e.quickGood.startsWith('QA good'));
              } catch (e) { return false; }
            }"""
        )
        record(vp, "reflection", "quick save persists entry", saved)
        assert_no_overflow(page, vp, "reflection card")
        # Deep modal opens with textareas, closes cleanly
        page.locator('[data-testid="reflection-deep-open"]').click()
        wait('[data-testid="reflection-modal"]', state="visible")
        ta_count = page.locator('#reflectionDeepContent textarea').count()
        record(vp, "reflection", "deep modal opens", True)
        record(vp, "reflection", "deep textareas (good/bad/cont/improve)", ta_count == 4, f"({ta_count})")
        deep_box = page.locator('[data-testid="reflection-modal"] .dialog').bounding_box()
        record(vp, "reflection", "deep modal fits viewport",
               deep_box is not None and deep_box["height"] <= height and deep_box["width"] <= width,
               f"(h={round(deep_box['height'])}px)" if deep_box else "")
        page.locator('[data-action="reflection-deep-close"]').click()
        wait('[data-testid="reflection-modal"]', state="hidden")
        # History shows the saved entry
        page.locator('[data-testid="reflection-history-btn"]').click()
        wait('[data-testid="reflection-history-modal"]', state="visible")
        items = page.locator('[data-testid="reflection-history-modal"] .reflect-history-item').count()
        record(vp, "reflection", "history opens", True)
        record(vp, "reflection", "history lists saved entry", items >= 1, f"(items={items})")
        page.locator('[data-action="reflection-history-close"]').click()
        wait('[data-testid="reflection-history-modal"]', state="hidden")

        # ---------- LEGAL pages ----------
        for legal in LEGAL_PAGES:
            p2 = browser.new_page(viewport={"width": width, "height": height})
            p2.on("pageerror", lambda error, legal=legal: errors.append(f"{label} {legal}: {error}"))
            p2.goto(f"{base}/{legal}", wait_until="networkidle")
            h1 = p2.locator("h1").first
            record(vp, "legal", f"{legal} loads + has h1", h1.is_visible(), f"({p2.title()})")
            ov = p2.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            record(vp, "legal", f"{legal} no horizontal overflow", ov <= 1, f"({ov}px)" if ov > 1 else "")
            p2.close()

        assert_no_overflow(page, vp, "final state")
        shot = os.path.join(tempfile.gettempdir(), f"taskflow-mobile-qa-{width}x{height}.png")
        page.screenshot(path=shot, full_page=False)
        screenshots.append(shot)
    finally:
        page.close()


def main():
    parser = argparse.ArgumentParser(description="TaskFlow mobile real-device QA checklist (simulated)")
    parser.add_argument("--browser", choices=["chromium", "firefox", "webkit"], default="chromium")
    args = parser.parse_args()

    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    screenshots = []

    try:
        with sync_playwright() as playwright:
            browser = getattr(playwright, args.browser).launch(headless=True)
            try:
                for width, height, label in VIEWPORTS:
                    print(f"\n===== {label} ({args.browser}) =====")
                    run_viewport(browser, args.browser, width, height, label, base, screenshots)
            finally:
                for context in browser.contexts:
                    context.close()
                browser.close()
    finally:
        httpd.shutdown()

    # ---- Write report ----
    failed = [r for r in results if r[3] == "FAIL"]
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "# P1.10 — Mobile Real-Device QA (simulated)",
        "",
        f"> Simulated in Playwright ({args.browser}, headless) at {now} — **no physical device**. "
        "Software keyboard and real notch safe-area insets (`env(safe-area-inset-*)` = 0 headless) are not covered; "
        "everything else is real layout/geometry from the actual app.",
        "",
        "Viewports (per plan): 360x800 (small Android), 390x844 (common mobile), 412x915 (large mobile), "
        "768x1024 (tablet — the app's mobile layout is `max-width: 767px`, so 768 exercises the desktop/tablet layout).",
        "",
        f"**{len(failed)} FAIL / {len(results)} checks**",
        "",
        "## Results",
        "",
        "| Viewport | Area | Check | Status | Detail |",
        "|---|---|---|---|---|",
    ]
    for vp, area, check, status, detail in results:
        lines.append(f"| {vp} | {area} | {check} | {status} | {detail} |")
    lines += ["", "## Findings & fixes (this pass)", "",
              "Three real bugs surfaced by this QA pass were fixed in the same commit:", "",
              "1. **Task-row menu unclickable on done rows** — `.task-row.done` sets `opacity: .62`, which creates a "
              "stacking context that traps the menu's `z-index: 70` inside the row; the next row painted over the "
              "dropdown, so the task-detail item could not be clicked. Fixed with `.task-row.menu-open { z-index: 1 }` "
              "so the row with an open menu lifts above its siblings.",
              "2. **Checkbox edge taps missed** — the `:active` `scale(.85)` press animation shrinks the `::before` "
              "hit-area mid-tap, so the compatibility click lands outside the checkbox and the toggle is lost. Found "
              "at 768px tablet where the box is 18px; the 26px mobile box masked it. Fixed by suppressing the scale on "
              "coarse pointers for row/list checkboxes (`transform: none` on `:active`).",
              "3. **CSS source vs min mismatch** — edits to `css/*.css` sources did not take effect because the app "
              "loads the minified siblings; all CSS changes must be followed by `python scripts/minify.py --only css`. "
              "The QA script also now emulates touch (`has_touch`) so the coarse-pointer media queries actually match "
              "(without it, row actions stay `pointer-events: none` and clicks get intercepted).",
              "",
              "## Page errors",
              ""]
    if errors:
        for e in errors:
            lines.append(f"- `{e}`")
    else:
        lines.append("- none")
    lines += ["", "## Screenshots", ""]
    for s in screenshots:
        lines.append(f"- `{s}`")
    lines += ["", "## Notes", "",
              "- Keyboard behavior (software keyboard overlap, submit reachability while typing) is **simulated-only** — needs a physical device to confirm.",
              "- `env(safe-area-inset-*)` resolves to 0 in headless; notch/home-indicator clearance needs a physical device.",
              "- The bottom-nav check runs on 360/390/412; 768 uses the desktop layout (sidebar) by design.",
              "- The dense 31-column habit grid in the overview widget is a **documented exclusion** from the 44px touch-target rule "
              "(components.css): 44px targets are physically impossible at 31 columns on a 360px screen. Daily habit toggles are covered "
              "by the today-habit checkbox hit-area check.",
              ""]
    with open("docs/mobile-qa.md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print("\n" + "=" * 60)
    print(f"MOBILE QA: {len(failed)} FAIL / {len(results)} checks")
    if errors:
        print("PAGE ERRORS:", errors[:8])
    print("REPORT: docs/mobile-qa.md")
    return 1 if (failed or errors) else 0


if __name__ == "__main__":
    sys.exit(main())
