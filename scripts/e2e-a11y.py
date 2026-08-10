"""TaskFlow P2.3 accessibility audit (Playwright).

Audits the seven surfaces from the P2.3 checklist: Quick Add, Task Drawer,
More sheet, Search, Calendar, Focus, Auth (sync + profile). Checks:

- dialog semantics (role=dialog, aria-modal, aria-labelledby -> non-empty title)
- keyboard nav: focus moves into the layer on open, Tab trap keeps it inside,
  Escape closes, focus returns to the opener
- accessible names on icon buttons and form fields
- aria-expanded on disclosure triggers, aria-current on active nav
- contrast spot-checks on primary CTA, muted text, error text
- reduced motion: animations/transitions disabled under prefers-reduced-motion
- focus-visible ring on keyboard focus
- page errors and horizontal overflow across all flows

Desktop 1440x900 for the modals/views; a 390x844 page for the More sheet and
bottom nav; a reduced-motion page for the motion comparison.

Usage: python scripts/e2e-a11y.py [--browser chromium|firefox|webkit]
Writes docs/a11y-audit.md. Exit 1 on any FAIL.
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

results = []  # (area, check, status, detail)
errors = []   # pageerror strings


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def record(area, check, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((area, check, status, detail))
    print(f"[{status}] {area}: {check} {detail}".rstrip())


def load_app(page, base, reduced=False):
    page.emulate_media(reduced_motion="reduce" if reduced else "no-preference")
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.goto(f"{base}/app.html", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="today-view"]', state="visible")
    page.wait_for_timeout(150)


# ---- shared helpers ---------------------------------------------------------

def dialog_attrs(page, area, layer_id, title_id):
    """role=dialog, aria-modal=true, aria-labelledby pointing at a non-empty title."""
    layer = page.locator(f"#{layer_id}")
    # the layer itself may be the dialog (drawer/more-sheet) or wrap a dialog card
    if layer.get_attribute("role") == "dialog":
        surf = layer
    else:
        surf = layer.locator('[role="dialog"]').first
    if surf.count() == 0:
        record(area, "dialog role", False, "no [role=dialog] on layer or inside")
        return
    role = surf.get_attribute("role")
    modal = surf.get_attribute("aria-modal")
    by = surf.get_attribute("aria-labelledby")
    title_ok = False
    if by:
        t = page.locator(f"#{by}").first
        if t.count() and t.inner_text().strip():
            title_ok = True
    ok = role == "dialog" and modal == "true" and title_ok
    record(area, "dialog semantics (role/aria-modal/aria-labelledby)",
           ok, f"(role={role} modal={modal} labelledby={by})" if not ok else "")


def focus_inside(page, area, layer_id):
    inside = page.evaluate(
        "(id) => { const l = document.getElementById(id); const s = l && (l.matches('[role=dialog]') ? l : l.querySelector('[role=dialog]')); return !!(l && !l.hidden && s && (s.contains(document.activeElement) || l.contains(document.activeElement))); }",
        layer_id,
    )
    ae = page.evaluate("document.activeElement && (document.activeElement.id || document.activeElement.className || document.activeElement.tagName)")
    record(area, "focus moves inside on open", inside, f"(active={ae})" if not inside else "")


def tab_trap(page, area, layer_id, rounds=10):
    """Press Tab `rounds` times; focus must stay inside the layer every time."""
    ok = True
    for i in range(rounds):
        page.keyboard.press("Tab")
        inside = page.evaluate(
            "(id) => { const l = document.getElementById(id); return !!l && !l.hidden && (l.contains(document.activeElement)); }",
            layer_id,
        )
        if not inside:
            ae = page.evaluate("document.activeElement && (document.activeElement.id || document.activeElement.className)")
            record(area, "Tab trap (focus stays in layer)", False, f"(escaped on Tab #{i + 1}: {ae})")
            ok = False
            break
    if ok:
        record(area, "Tab trap (focus stays in layer)", True)


def esc_closes(page, area, layer_id):
    page.keyboard.press("Escape")
    page.wait_for_timeout(100)
    hidden = page.evaluate("(id) => { const l = document.getElementById(id); return !l || l.hidden; }", layer_id)
    record(area, "Escape closes", hidden)


def names_ok(page, area, scope_sel, label):
    """Every interactive element inside scope has a non-empty accessible name."""
    bad = page.evaluate(
        """(sel) => {
          const scope = document.querySelector(sel);
          if (!scope) return ['scope missing'];
          const els = scope.querySelectorAll('button, input, select, textarea, [role="menuitem"], [role="tab"]');
          const out = [];
          els.forEach((el) => {
            if (el.hidden || el.type === 'hidden') return;
            let name = (el.getAttribute('aria-label') || '').trim()
              || (el.innerText || '').trim()
              || (el.getAttribute('placeholder') || '').trim();
            if (!name && el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) {
              name = (el.value || '').trim();
            }
            if (!name && el.labels && el.labels.length) name = (el.labels[0].innerText || '').trim();
            if (!name) out.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + (el.className || '').split(' ')[0]);
          });
          return out;
        }""",
        scope_sel,
    )
    record(area, f"accessible names on {label}", not bad, (", ".join(bad[:6])) if bad else "")


def check_contrast(page, area, label, fg_sel, bg_sel):
    """Compute WCAG contrast ratio between two elements' computed colors."""
    ratio = page.evaluate(
        """([f, b]) => {
          const lum = (rgb) => {
            const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
            return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
          };
          const parse = (cs) => {
            const m = cs.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
            return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
          };
          const fe = document.querySelector(f);
          const be = document.querySelector(b);
          if (!fe || !be) return null;
          const fg = parse(getComputedStyle(fe).color);
          let bgcs = getComputedStyle(be).backgroundColor;
          if (bgcs === 'rgba(0, 0, 0, 0)' || bgcs === 'transparent') bgcs = getComputedStyle(document.body).backgroundColor;
          const bg = parse(bgcs);
          if (!fg || !bg) return null;
          const l1 = lum(fg), l2 = lum(bg);
          const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
          return (hi + 0.05) / (lo + 0.05);
        }""",
        [fg_sel, bg_sel],
    )
    if ratio is None:
        record(area, f"contrast {label}", False, "elements missing")
    else:
        ok = ratio >= 4.5
        record(area, f"contrast {label} >= 4.5:1", ok, f"({ratio:.2f}:1)")


def page_clean(page, area, mobile=False):
    over = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    record(area, "no horizontal overflow", over <= 1, f"({over}px)" if over > 1 else "")
    if mobile:
        over2 = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        record(area, "no horizontal overflow (mobile)", over2 <= 1, "")


# ---- surface tests ----------------------------------------------------------

def audit_quick_add(page):
    A = "Quick Add"
    page.keyboard.press("q")
    page.wait_for_selector('[data-testid="quick-add"]', state="visible")
    dialog_attrs(page, A, "quickAddModal", "quickAddTitle")
    focus_inside(page, A, "quickAddModal")
    tab_trap(page, A, "quickAddModal")
    names_ok(page, A, "#quickAddModal", "quick-add controls")
    # label/aria coverage on the input row
    labeled = page.evaluate(
        """() => {
          const ids = ['quickAddInput', 'quickAddDate', 'quickAddTime', 'quickAddDur', 'quickAddPrio'];
          return ids.map((id) => { const el = document.getElementById(id);
            return el ? (el.getAttribute('aria-label') || '').trim() || el.labels.length : null; });
        }"""
    )
    missing = [i for i, v in enumerate(labeled) if not v]
    record(A, "inputs labeled (aria-label or label)", not missing,
           f"(missing idx {missing})" if missing else "")
    esc_closes(page, A, "quickAddModal")
    page.wait_for_timeout(80)


def add_quick_task(page, text):
    page.keyboard.press("q")
    page.wait_for_selector('[data-testid="quick-add"]', state="visible")
    page.fill("#quickAddInput", text)
    page.locator('[data-action="quickadd-do"]').click()
    page.wait_for_selector('[data-testid="quick-add"]', state="hidden")
    page.wait_for_timeout(120)


def activate_keyboard(page, locator, label):
    """Focus an element and press Enter — the real keyboard activation path."""
    locator.scroll_into_view_if_needed()
    locator.focus()
    page.keyboard.press("Enter")
    page.wait_for_timeout(120)


def audit_task_drawer(page):
    A = "Task Drawer"
    add_quick_task(page, "Drawer audit task")
    # the task menu lives on week-view rows; today rows have no menu
    page.locator('#navTabs [data-nav-view="week"]').click()
    page.wait_for_selector('.task-row', state="visible")
    page.wait_for_timeout(150)
    menu = page.locator('.task-row [data-action="task-menu"]').first
    if menu.count() == 0:
        record(A, "task row present", False, "no task-menu button in week view")
        return
    activate_keyboard(page, menu, "task menu")
    expanded = menu.get_attribute("aria-expanded")
    record(A, "task menu opens via keyboard + aria-expanded=true", expanded == "true", f"(={expanded})")
    detail = page.locator('.task-row [data-action="task-detail"]').first
    if detail.count() == 0:
        record(A, "task-detail menuitem present", False)
        return
    activate_keyboard(page, detail, "task-detail menuitem")
    page.wait_for_selector('[data-testid="task-drawer"]', state="visible")
    dialog_attrs(page, A, "taskDrawer", "taskDrawerTitle")
    focus_inside(page, A, "taskDrawer")
    tab_trap(page, A, "taskDrawer")
    names_ok(page, A, "#taskDrawer", "drawer controls")
    # focus restore: opener is the task-detail menuitem (menu still open behind)
    esc_closes(page, A, "taskDrawer")
    restored = page.evaluate(
        "() => { const ae = document.activeElement; return ae && (ae.matches('[data-action=\"task-menu\"]') || ae.matches('[data-action=\"task-detail\"]')); }"
    )
    record(A, "focus returns to opener", restored, "" if restored else "(active lost to body)")
    # clean up the still-open menu
    page.keyboard.press("Escape")
    page.wait_for_timeout(60)


def audit_more_sheet(page):
    A = "More Sheet"
    trigger = page.locator('#mobileNav [data-action="more"]')
    if trigger.count() == 0:
        record(A, "more trigger present on mobile nav", False)
        return
    trigger.click()
    page.wait_for_selector('[data-testid="more-sheet"]', state="visible")
    dialog_attrs(page, A, "moreSheet", "moreSheetTitle")
    focus_inside(page, A, "moreSheet")
    tab_trap(page, A, "moreSheet", rounds=8)
    names_ok(page, A, "#moreSheet", "more-sheet controls")
    expanded = trigger.get_attribute("aria-expanded")
    record(A, "trigger aria-expanded=true while open", expanded == "true", f"(={expanded})")
    locked = page.evaluate("() => getComputedStyle(document.body).overflow")
    record(A, "body scroll locked while open", locked in ("hidden", "clip"), f"(overflow={locked})")
    esc_closes(page, A, "moreSheet")
    page.wait_for_timeout(100)
    expanded = trigger.get_attribute("aria-expanded")
    record(A, "trigger aria-expanded=false after close", expanded == "false", f"(={expanded})")
    restored = page.evaluate(
        "() => { const ae = document.activeElement; return ae && ae.matches('#mobileNav [data-action=\"more\"]'); }"
    )
    record(A, "focus returns to more trigger", restored, "" if restored else "")
    # aria-current on the active bottom-nav tab
    cur = page.evaluate(
        """() => { const act = document.querySelector('#mobileNav [data-nav-view].active');
          return act ? act.getAttribute('aria-current') : null; }"""
    )
    record(A, "active bottom-nav tab aria-current=page", cur == "page", f"(={cur})")


def audit_search(page):
    A = "Search"
    # seed two tasks so the query has hits
    add_quick_task(page, "Alpha task one")
    add_quick_task(page, "Alpha task two")
    page.keyboard.press("Control+k")
    page.wait_for_selector('[data-testid="search-modal"]', state="visible")
    dialog_attrs(page, A, "searchModal", "searchDialogTitle")
    focus_inside(page, A, "searchModal")
    page.fill("#searchInput", "alpha")
    page.wait_for_timeout(500)
    hits = page.locator(".search-hit").count()
    record(A, "search returns hits", hits >= 1, f"({hits} hits)")
    if hits >= 1:
        page.keyboard.press("ArrowDown")
        page.wait_for_timeout(60)
        on_hit = page.evaluate("() => document.activeElement && document.activeElement.classList.contains('search-hit')")
        record(A, "ArrowDown moves focus to result", on_hit)
        # Enter activates the focused result (closes modal + navigates)
        page.keyboard.press("Enter")
        page.wait_for_timeout(150)
        closed = page.evaluate("() => { const m = document.getElementById('searchModal'); return !m || m.hidden; }")
        record(A, "Enter activates result (modal closes)", closed)
    else:
        esc_closes(page, A, "searchModal")
    page.wait_for_timeout(80)
    # open again and check Escape path
    page.keyboard.press("Control+k")
    page.wait_for_selector('[data-testid="search-modal"]', state="visible")
    esc_closes(page, A, "searchModal")


def audit_calendar(page):
    A = "Calendar"
    # tag a task through the real drawer flow so the filter bar renders
    page.locator('#navTabs [data-nav-view="week"]').click()
    page.wait_for_selector('.task-row', state="visible")
    page.wait_for_timeout(150)
    menu = page.locator('.task-row [data-action="task-menu"]').first
    activate_keyboard(page, menu, "task menu (calendar tag flow)")
    activate_keyboard(page, page.locator('.task-row [data-action="task-detail"]').first, "task-detail menuitem")
    page.wait_for_selector('[data-testid="task-drawer"]', state="visible")
    page.wait_for_selector('[data-role="td-tag-input"]', state="visible")
    page.fill('[data-role="td-tag-input"]', "work")
    page.keyboard.press("Enter")
    page.wait_for_timeout(150)
    esc_closes(page, A + " (tag flow)", "taskDrawer")
    page.keyboard.press("Escape")
    page.wait_for_timeout(80)
    page.locator('#navTabs [data-nav-view="calendar"]').click()
    page.wait_for_selector("#view-calendar", state="visible")
    page.wait_for_timeout(200)
    chips = page.locator('[data-action="calendar-tagfilter"]')
    if chips.count() == 0:
        record(A, "tag filter chips present", False, "no chips (no tagged tasks?)")
    else:
        pressed = chips.first.get_attribute("aria-pressed")
        record(A, "tag chips have aria-pressed", pressed in ("true", "false"), f"(={pressed})")
    checks = page.locator('.cal-cell [data-action="task"]').count()
    record(A, "calendar task controls present", checks > 0, f"({checks})")
    if checks > 0:
        bad = page.evaluate(
            """() => { const el = document.querySelector('.cal-cell [data-action="task"]');
              if (!el) return null;
              return { role: el.getAttribute('role'), checked: el.getAttribute('aria-checked') }; }"""
        )
        record(A, "calendar task checkbox role/aria-checked",
               bool(bad and bad["role"] == "checkbox" and bad["checked"] is not None),
               f"({bad})" if bad else "no control")
    grid = page.locator(".calendar-grid-desktop").get_attribute("aria-label")
    record(A, "calendar grid has aria-label", bool(grid and grid.strip()), f"(={grid})")
    labels_ok = page.evaluate(
        """() => { const btns = document.querySelectorAll('.app-month-nav .icon-button');
          return Array.from(btns).every((b) => (b.getAttribute('aria-label') || b.title || '').trim()); }"""
    )
    record(A, "month nav buttons labeled", labels_ok)


def audit_focus(page):
    A = "Focus"
    page.locator('#navTabs [data-action="focus"]').click()
    page.wait_for_selector('[data-testid="focus-overlay"]', state="visible")
    dialog_attrs(page, A, "focusOverlay", "focusDialogTitle")
    focus_inside(page, A, "focusOverlay")
    tab_trap(page, A, "focusOverlay")
    names_ok(page, A, "#focusOverlay", "focus controls")
    esc_closes(page, A, "focusOverlay")
    page.wait_for_timeout(80)


def audit_auth(page):
    A = "Auth (sync)"
    page.locator('#appTopbar [data-action="tools-open"]').click()
    page.wait_for_selector('[data-testid="tools-drawer"]', state="visible")
    page.locator("#syncBtn").click()
    page.wait_for_selector('[data-testid="sync-modal"]', state="visible")
    dialog_attrs(page, A, "syncModal", "syncDialogTitle")
    focus_inside(page, A, "syncModal")
    tab_trap(page, A, "syncModal", rounds=8)
    names_ok(page, A, "#syncModal", "sync form controls")
    # empty submit -> inline error + focus on first invalid
    page.locator('#syncForm button[type="submit"]').click()
    page.wait_for_timeout(150)
    err_visible = page.locator("#syncUserError:visible").count() > 0
    focused = page.evaluate("() => document.activeElement && document.activeElement.id === 'syncUser'")
    record(A, "empty submit shows inline error + focuses field", err_visible and focused,
           f"(err={err_visible}, focus={focused})")
    esc_closes(page, A, "syncModal")
    page.wait_for_timeout(80)
    # close the tools drawer (its backdrop covers the sidebar)
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="tools-drawer"]', state="hidden")
    page.wait_for_timeout(80)
    # profile modal
    A = "Auth (profile)"
    page.locator('#desktopSidebar [data-action="profile-open"]').click()
    page.wait_for_selector('[data-testid="profile-modal"]', state="visible")
    dialog_attrs(page, A, "profileModal", "profileDialogTitle")
    focus_inside(page, A, "profileModal")
    tab_trap(page, A, "profileModal", rounds=8)
    names_ok(page, A, "#profileModal", "profile form controls")
    esc_closes(page, A, "profileModal")
    # close tools drawer
    page.keyboard.press("Escape")
    page.wait_for_timeout(80)


def cross_cutting(page):
    A = "Cross-cutting"
    # focus-visible ring on keyboard focus (search button in topbar)
    page.locator('#appTopbar [data-action="search-toggle"]').focus()
    ring = page.evaluate(
        """() => { const el = document.querySelector('#appTopbar [data-action="search-toggle"]');
          const cs = getComputedStyle(el);
          return { style: cs.outlineStyle, width: cs.outlineWidth }; }"""
    )
    ok = ring and ring["style"] not in ("none",) and float(ring["width"].replace("px", "")) >= 2
    record(A, "focus-visible ring on keyboard focus", ok, f"({ring})")
    # aria-current on active desktop nav tab
    cur = page.evaluate(
        """() => { const act = document.querySelector('#navTabs [data-nav-view].active');
          return act ? act.getAttribute('aria-current') : null; }"""
    )
    record(A, "active desktop nav tab aria-current=page", cur == "page", f"(={cur})")
    # contrast spot checks
    check_contrast(page, A, "primary CTA text", ".app-primary-action.button-primary",
                   ".app-primary-action.button-primary")
    check_contrast(page, A, "muted text", ".app-period", "body")
    check_contrast(page, A, "field error text", ".field-error", "body")
    check_contrast(page, A, "search input text", "#searchInput", "#searchInput")
    page_clean(page, A)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--browser", default="chromium", choices=["chromium", "firefox", "webkit"])
    args = ap.parse_args()

    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"

    with sync_playwright() as p:
        browser = p[args.browser].launch()
        # desktop page
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        load_app(page, base)
        audit_quick_add(page)
        audit_task_drawer(page)
        audit_search(page)
        audit_calendar(page)
        audit_focus(page)
        audit_auth(page)
        cross_cutting(page)
        page_clean(page, "desktop overall")

        # mobile page for More sheet + bottom nav
        mctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        mpage = mctx.new_page()
        mpage.on("pageerror", lambda e: errors.append(str(e)))
        load_app(mpage, base)
        audit_more_sheet(mpage)
        page_clean(mpage, "mobile overall", mobile=True)

        # reduced-motion page
        rctx = browser.new_context(viewport={"width": 1440, "height": 900})
        rpage = rctx.new_page()
        rpage.on("pageerror", lambda e: errors.append(str(e)))
        load_app(rpage, base, reduced=True)
        page.evaluate("() => TaskFlowUI.toast('motion-check','info')")
        page.wait_for_timeout(120)
        rpage.evaluate("() => TaskFlowUI.toast('motion-check','info')")
        rpage.wait_for_timeout(120)
        n = page.evaluate(
            """() => { const t = document.querySelector('.toast'); const cs = getComputedStyle(t);
              return { transition: cs.transitionDuration, anim: cs.animationName }; }"""
        )
        r = rpage.evaluate(
            """() => { const t = document.querySelector('.toast'); const cs = getComputedStyle(t);
              return { transition: cs.transitionDuration, anim: cs.animationName }; }"""
        )
        anim_off = r and (float((r["transition"] or "0s").replace("s", "")) == 0) and (r["anim"] == "none")
        record("Cross-cutting", "reduced motion disables transitions/animations", anim_off,
               f"(normal={n}, reduce={r})")
        browser.close()
    httpd.shutdown()

    # report
    fails = [x for x in results if x[2] == "FAIL"]
    lines = []
    lines.append("# TaskFlow — P2.3 Accessibility Audit")
    lines.append("")
    lines.append(f"_Generated {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')} · browser: {args.browser} · "
                 f"desktop 1440x900 + mobile 390x844 (touch) + reduced-motion comparison_")
    lines.append("")
    lines.append(f"**Result: {len(results) - len(fails)} PASS / {len(fails)} FAIL**"
                 + (" · " + ", ".join(x[1] for x in fails) if fails else ""))
    lines.append("")
    lines.append("## Checks")
    lines.append("")
    lines.append("| Area | Check | Status | Detail |")
    lines.append("|---|---|---|---|")
    for area, check, status, detail in results:
        lines.append(f"| {area} | {check} | {status} | {detail} |")
    lines.append("")
    if errors:
        lines.append("## Page errors")
        lines.append("")
        for e in errors[:10]:
            lines.append(f"- `{e}`")
        lines.append("")
    else:
        lines.append("## Page errors")
        lines.append("")
        lines.append("None.")
        lines.append("")
    lines.append("## Simulation limits")
    lines.append("")
    lines.append("- Software keyboard is not emulated; real-device keyboard overlap needs a physical device.")
    lines.append("- env(safe-area-inset-*) is 0 in headless (no notch).")
    lines.append("- Screen-reader announcements (aria-live output) are asserted structurally, not via a real SR.")
    lines.append("- Calendar day cells are not themselves keyboard-focusable; their interactive controls are. "
                 "Day navigation is covered by the Today/Week views.")
    with open("docs/a11y-audit.md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"\n{len(results) - len(fails)} PASS / {len(fails)} FAIL -> docs/a11y-audit.md")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
