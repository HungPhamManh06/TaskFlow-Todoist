"""Phase C (P12) performance measurement for TaskFlow.

Measures, without modifying the app:
  1. JS boot time (navigationStart -> DOMContentLoaded -> load, plus app ready)
  2. DOM node count + element/class counts per view (today/overview/inbox/week/year/calendar)
  3. localStorage write frequency during representative interactions (wrapped setItem)
  4. Hidden-view render cost: setView() time from each active view to each target view

Usage:
  python scripts/measure-perf.py              # single run (default)
  python scripts/measure-perf.py --runs 3     # N runs + boot-time mean/median/min/max/stddev

Prints a compact report. Exits non-zero only on hard errors (page crashes).
Requires: playwright (same env as scripts/e2e-frontend.py).
"""
import argparse
import http.server
import os
import socketserver
import statistics
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def translate_path(self, path):
        translated = super().translate_path(path)
        if os.path.isfile(translated):
            return translated
        if not os.path.splitext(path)[1] and not translated.endswith(os.sep):
            candidate = translated + ".html"
            if os.path.isfile(candidate):
                return candidate
        return translated


WRAP_LS = """
window.__lsWrites = [];
const __origSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function (k, v) {
  window.__lsWrites.push(k);
  return __origSetItem.call(this, k, v);
};
window.__bootMark = {};
document.addEventListener('DOMContentLoaded', () => { window.__bootMark.dcl = performance.now(); });
window.addEventListener('load', () => { window.__bootMark.load = performance.now(); });
"""


def boot_metrics(page):
    return page.evaluate("""() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      return {
        navStartToDCL: Math.round((window.__bootMark.dcl || 0) - nav.startTime),
        navStartToLoad: Math.round((window.__bootMark.load || 0) - nav.startTime),
        appReady: Math.round(performance.now()),
      };
    }""")


def dom_metrics(page):
    return page.evaluate("""() => {
      const all = document.querySelectorAll('*');
      const counts = {};
      all.forEach(el => {
        const t = el.tagName.toLowerCase();
        counts[t] = (counts[t] || 0) + 1;
      });
      const byClass = {};
      all.forEach(el => { (el.classList || []).forEach(c => { byClass[c] = (byClass[c] || 0) + 1; }); });
      const topClass = Object.entries(byClass).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const active = document.querySelector('.view.active') ? document.querySelector('.view.active').id : null;
      return { total: all.length, topTags: Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6), topClass, active };
    }""")


def render_cost(page, fn_expr):
    return page.evaluate("""expr => {
      const t0 = performance.now();
      window[expr]();
      const t1 = performance.now();
      return Math.round((t1 - t0) * 10) / 10;
    }""", fn_expr)


def measure_view_matrix(page, views):
    """From each active view, measure time to switch to each other view + resulting DOM size."""
    rows = []
    for src in views:
        page.evaluate(f"setView('{src}')")
        for dst in views:
            cost = page.evaluate("""dst => {
              const t0 = performance.now();
              setView(dst);
              return Math.round((performance.now() - t0) * 10) / 10;
            }""", dst)
            d = dom_metrics(page)
            rows.append((src, dst, cost, d["total"]))
    return rows


def interaction_ls_writes(page):
    """Run a representative interaction sequence; report localStorage writes grouped by key."""
    def writes():
        return page.evaluate("window.__lsWrites || []")

    page.evaluate("window.__lsWrites = []")

    # 1. Toggle a task checkbox in Today — clear AFTER setView (like step 3) so
    # setView's own save() is not attributed to the interaction, and wait out the
    # 350ms saveSoon debounce before reading the counter.
    page.evaluate("setView('today')")
    page.evaluate("window.__lsWrites = []")
    clicked = page.evaluate("""() => {
      const cb = document.querySelector('#view-today [data-action="task"]');
      if (cb) { cb.click(); return true; }
      return false;
    }""")
    page.wait_for_timeout(450)
    w1 = writes()
    if not clicked:
        w1 = None

    # 2. Quick-add a task (openQuickAdd is a global fn; submit via data-action button)
    page.evaluate("window.__lsWrites = []")
    page.evaluate("""() => {
      openQuickAdd();
      const input = document.getElementById('quickAddInput');
      if (input) {
        input.value = 'perf measure task';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const submit = document.querySelector('#quickAddModal [data-action="quickadd-do"]');
      if (submit) submit.click();
    }""")
    w2 = writes()

    # 3. Toggle a habit (Overview) — clear AFTER setView so the counter only
    # captures the interaction itself (setView's own save persists view state).
    page.evaluate("setView('overview')")
    page.evaluate("window.__lsWrites = []")
    page.evaluate("""() => {
      const h = document.querySelector('[data-action="habit"]');
      if (h) h.click();
    }""")
    w3 = writes()

    def group(w):
        g = {}
        for k in w:
            g[k] = g.get(k, 0) + 1
        return g

    return {
        "task_toggle": group(w1),
        "quick_add": group(w2),
        "habit_toggle": group(w3),
    }


VIEWS = ["today", "overview", "inbox", "week", "year", "calendar"]


def measure_once(browser, base, errors, label):
    """One full measurement pass on a fresh page. Returns boot dict for aggregation."""
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.add_init_script(WRAP_LS)
    page.goto(f"{base}/app.html?view=today", wait_until="load")
    page.wait_for_selector('[data-testid="today-view"]', state="visible")

    boot = boot_metrics(page)
    print(f"\n===== RUN {label} =====")
    print("== BOOT (ms) ==")
    print(f"  nav->DOMContentLoaded : {boot['navStartToDCL']}")
    print(f"  nav->load            : {boot['navStartToLoad']}")
    print(f"  app ready (evaluate) : {boot['appReady']}")

    print("\n== DOM NODE COUNT per view ==")
    for v in VIEWS:
        page.evaluate(f"setView('{v}')")
        d = dom_metrics(page)
        print(f"  {v:9s}: {d['total']:5d} nodes | top: {d['topTags']} | active={d['active']}")

    print("\n== VIEW SWITCH COST (ms) - rows=from, cols=to ==")
    rows = measure_view_matrix(page, VIEWS)
    header = "       " + "".join(f"{v[:4]:>7s}" for v in VIEWS)
    print("  " + header)
    for src in VIEWS:
        line = f"  {src[:6]:<6s}"
        for dst in VIEWS:
            r = next(x for x in rows if x[0] == src and x[1] == dst)
            line += f"{r[2]:>7.1f}"
        print(line)

    print("\n== localStorage WRITES per interaction (key: count) ==")
    ls = interaction_ls_writes(page)
    for name, g in ls.items():
        if g is None:
            print(f"  {name:14s}: (no matching element found - metric skipped)")
        elif not g:
            print(f"  {name:14s}: (no writes captured)")
        else:
            s = ", ".join(f"{k}={c}" for k, c in sorted(g.items()))
            print(f"  {name:14s}: {s}")

    # Render cost of heavy renders in isolation — only functions still exported to
    # window (module-scoped aliases like renderInbox are not reachable here).
    print("\n== RENDER fn cost (ms) ==")
    for fn in ["renderToday", "renderOverview", "renderWeek", "renderYear", "renderCalendar", "renderUpcoming"]:
        ok = page.evaluate("fn => typeof window[fn] === 'function'", fn)
        if not ok:
            print(f"  {fn:16s}: (module-scoped, covered by view switch matrix)")
            continue
        page.evaluate(f"window['{fn}']();")  # warm
        cost = render_cost(page, fn)
        print(f"  {fn:16s}: {cost}")

    page.close()
    return boot


def summarize(label, samples):
    """Print mean/median/min/max/stddev for a boot metric across runs."""
    if len(samples) == 1:
        return
    mean = statistics.mean(samples)
    med = statistics.median(samples)
    lo, hi = min(samples), max(samples)
    sd = statistics.stdev(samples) if len(samples) > 1 else 0.0
    print(f"  {label:22s}: mean {mean:6.1f}  median {med:6.1f}  min {lo:4d}  max {hi:4d}  sd {sd:4.1f}")


def main():
    parser = argparse.ArgumentParser(description="TaskFlow performance measurement (Phase C/P12)")
    parser.add_argument("--runs", type=int, default=1, help="number of full measurement passes (default 1)")
    args = parser.parse_args()
    runs = max(1, args.runs)

    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    errors = []
    boots = []

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            for i in range(runs):
                boots.append(measure_once(browser, base, errors, f"{i + 1}/{runs}"))
            browser.close()
    finally:
        httpd.shutdown()

    if errors:
        print("\nPAGE ERRORS:", errors[:8])
        return 1

    if runs > 1:
        print("\n===== BOOT BASELINE ACROSS RUNS (ms) =====")
        summarize("nav->DOMContentLoaded", [b["navStartToDCL"] for b in boots])
        summarize("nav->load", [b["navStartToLoad"] for b in boots])
        summarize("app ready (evaluate)", [b["appReady"] for b in boots])

    print("\nMEASURE OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
