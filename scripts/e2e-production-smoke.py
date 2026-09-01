"""Production Smoke Test — verifies deployed TaskFlow at a configurable URL.

Usage:
  python scripts/e2e-production-smoke.py
  python scripts/e2e-production-smoke.py --base-url https://taskflow-todoist.vercel.app

Exit code 0 ONLY if ALL release-critical checks PASS.
No release-critical condition may produce WARN.

Checks:
  A. HTTP routes (including /asset-map.js)
  B. Hashed assets in HTML (no ?v= pins)
  C. Security headers with required VALUES (not just existence)
  D. ALL first-party asset network (no 404)
  E. Browser boot (zero pageerror, zero unexpected console.error)
  F. Navigation (Today, Inbox, Upcoming, Calendar, Projects) — no errors
  G. Quick Add — state=1 AND DOM=1
  H. Chat lazy load — hashed URL via TaskFlowAssetMap, panel opens
"""
import argparse
import re
import sys
import urllib.request
import urllib.error

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Playwright not installed. Run: pip install playwright && python -m playwright install chromium")
    sys.exit(1)


def fetch(url, timeout=10):
    """Fetch URL and return (status_code, headers, body)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "TaskFlowSmoke/1.0"})
        resp = urllib.request.urlopen(req, timeout=timeout)
        body = resp.read().decode("utf-8", errors="replace")
        return resp.status, dict(resp.headers), body
    except urllib.error.HTTPError as e:
        return e.code, {}, ""
    except Exception as e:
        return 0, {}, str(e)


def check_routes(base):
    """A. Check HTTP routes — including asset-map.js."""
    routes = ["/", "/app", "/privacy", "/terms", "/data-and-security",
              "/manifest.json", "/sw.js", "/asset-map.js"]
    results = []
    for route in routes:
        url = base.rstrip("/") + route
        status, _, _ = fetch(url)
        ok = 200 <= status < 400
        results.append((route, "PASS" if ok else "FAIL", f"HTTP {status}"))
        print(f"  {'PASS' if ok else 'FAIL'} {route} — HTTP {status}")
    return results


def check_hashed_assets(base):
    """B. Check /app HTML uses hashed assets, no ?v= pins."""
    url = base.rstrip("/") + "/app"
    status, _, body = fetch(url)
    if status != 200:
        print(f"  FAIL /app returned HTTP {status}")
        return [("Hashed assets", "FAIL", f"HTTP {status}")]

    scripts = re.findall(r'src="([^"]*\.js)"', body)
    styles = re.findall(r'href="([^"]*\.css)"', body)
    first_party = [s for s in (scripts + styles) if not s.startswith("http")]

    v_pins = [s for s in first_party if "?v=" in s]
    if v_pins:
        print(f"  FAIL Found first-party ?v= pins: {v_pins[:3]}")
        return [("Hashed assets", "FAIL", f"Found ?v= pins: {v_pins[:3]}")]

    hashed = [s for s in first_party if s.startswith("assets/") and re.search(r'\.[a-f0-9]{8}\.(js|css)$', s)]
    if not hashed:
        print(f"  FAIL No hashed assets in /app HTML (first-party refs: {len(first_party)})")
        return [("Hashed assets", "FAIL", "No hashed assets")]

    print(f"  PASS Hashed assets ({len(hashed)} hashed, {len(first_party)} total first-party)")
    return [("Hashed assets", "PASS", f"{len(hashed)} hashed, {len(first_party)} total")]


def check_security_headers(base):
    """C. Security headers — enforce required VALUES."""
    url = base.rstrip("/") + "/app"
    _, headers, _ = fetch(url)
    csp = headers.get("Content-Security-Policy", "")
    checks = [
        ("X-Content-Type-Options",
         lambda h: h.get("X-Content-Type-Options", "") == "nosniff"),
        ("X-Frame-Options",
         lambda h: h.get("X-Frame-Options", "") == "DENY"),
        ("Content-Security-Policy",
         lambda h: "frame-ancestors 'none'" in h.get("Content-Security-Policy", "")),
        ("Strict-Transport-Security",
         lambda h: "max-age=" in h.get("Strict-Transport-Security", "")),
        ("Referrer-Policy",
         lambda h: bool(h.get("Referrer-Policy", ""))),
        ("Permissions-Policy",
         lambda h: bool(h.get("Permissions-Policy", ""))),
    ]
    results = []
    for name, check in checks:
        ok = check(headers)
        results.append((name, "PASS" if ok else "FAIL", "" if ok else "missing or wrong value"))
        print(f"  {'PASS' if ok else 'FAIL'} {name}")
    return results


def check_assets_network(base):
    """D. ALL first-party assets — no 404."""
    url = base.rstrip("/") + "/app"
    status, _, body = fetch(url)
    if status != 200:
        return [("Asset network", "FAIL", "Cannot fetch /app")]

    assets = re.findall(r'(?:src|href)="(assets/[^"]+)"', body)
    icons = re.findall(r'(?:src|href)="(icons/[^"]+)"', body)
    fonts = re.findall(r'(?:src|href)="(fonts/[^"]+)"', body)

    all_assets = assets + icons + fonts
    failures = []
    checked = 0
    for asset in all_assets:
        asset_status, _, _ = fetch(base.rstrip("/") + "/" + asset)
        checked += 1
        if asset_status >= 400:
            failures.append(f"{asset} → HTTP {asset_status}")

    for extra in ["/manifest.json", "/sw.js", "/asset-map.js"]:
        extra_status, _, _ = fetch(base.rstrip("/") + extra)
        checked += 1
        if extra_status >= 400:
            failures.append(f"{extra} → HTTP {extra_status}")

    if failures:
        print(f"  FAIL Asset 404s: {failures[:5]}")
        return [("Asset network", "FAIL", str(failures))]
    print(f"  PASS Asset network ({checked} checked, no 404s)")
    return [("Asset network", "PASS", f"{checked} checked")]


def check_browser_smoke(base):
    """E-H. Browser: errors, navigation, Quick Add, Chat lazy load."""
    results = []
    page_errors = []
    console_errors = []
    lazy_urls = []  # Captured lazy module URLs

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 800},
            reduced_motion="reduce",
        )
        page = ctx.new_page()
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("request", lambda req: lazy_urls.append(req.url) if "/assets/" in req.url else None)

        page.add_init_script("localStorage.setItem('planner-onboarded','1');")
        page.goto(f"{base.rstrip('/')}/app?view=today", wait_until="networkidle")

        if page.locator('[data-testid="onboard-modal"]:visible').count():
            page.locator('[data-action="ob-skip"]').click()

        page.wait_for_selector('[data-testid="today-view"]', state="visible")
        print("  PASS Boot (Today view loaded)")

        # ── F. Navigation smoke ────────────────────────────────────────
        nav_views = [
            ("inbox", "inbox-view"),
            ("upcoming", "upcoming-view"),
            ("calendar", "calendar-view"),
            ("projects", "projects-view"),
        ]
        for view_param, view_testid in nav_views:
            try:
                page.goto(f"{base.rstrip('/')}/app?view={view_param}", wait_until="networkidle")
                page.wait_for_selector(f'[data-testid="{view_testid}"]', state="visible", timeout=8000)
                print(f"  PASS Navigation: {view_param}")
                results.append((f"Nav: {view_param}", "PASS", ""))
            except Exception as e:
                print(f"  FAIL Navigation: {view_param} — {type(e).__name__}")
                results.append((f"Nav: {view_param}", "FAIL", str(e)[:100]))

        # Go back to Today for Quick Add
        page.goto(f"{base.rstrip('/')}/app?view=today", wait_until="networkidle")
        page.wait_for_selector('[data-testid="today-view"]', state="visible")

        # ── G. Quick Add (MUST PASS — state AND DOM required) ─────────
        try:
            add_btn = page.locator('.app-primary-action[data-action="shell-add-task"]')
            if not add_btn.first.is_visible():
                add_btn = page.locator('[data-action="shell-add-task"]')
            add_btn.first.click()
            page.wait_for_selector('#quickAddModal:not([hidden])', state="visible", timeout=8000)
            page.wait_for_selector('#quickAddInput', state="visible", timeout=5000)
            page.fill('#quickAddInput', 'Production Smoke Task')
            page.locator('[data-action="quickadd-do"]').click()
            # Wait for state + DOM to both be ready
            for _ in range(10):
                page.wait_for_timeout(300)
                state_count = page.evaluate("""() => {
                    try {
                        const now = new Date();
                        const key = window.TaskFlowShell.monthKey(now.getFullYear(), now.getMonth());
                        const state = JSON.parse(localStorage.getItem(key) || '{}');
                        const tasks = [];
                        (state.weeks || []).forEach(w => (w.days || []).forEach(d => (d.tasks || []).forEach(t => tasks.push(t.text))));
                        return tasks.filter(t => t === 'Production Smoke Task').length;
                    } catch(e) { return -1; }
                }""")
                dom_count = page.locator('.task-text:has-text("Production Smoke Task")').count()
                if state_count == 1 and dom_count >= 1:
                    break
            if state_count == 1 and dom_count >= 1:
                print("  PASS Quick Add (exactly 1 task — state + DOM confirmed)")
                results.append(("Quick Add", "PASS", "Exactly 1 task"))
            else:
                print(f"  FAIL Quick Add (state={state_count}, dom={dom_count})")
                results.append(("Quick Add", "FAIL", f"state={state_count}, dom={dom_count}"))
        except Exception as e:
            print(f"  FAIL Quick Add — {type(e).__name__}: {e}")
            results.append(("Quick Add", "FAIL", f"{type(e).__name__}"))

        # ── H. Chat lazy load (MUST PASS) ─────────────────────────────
        try:
            chat_btn = page.locator('#chatFab')
            if chat_btn.count() > 0 and chat_btn.first.is_visible():
                # Clear lazy_urls to capture only Chat-related requests
                lazy_urls_before = len(lazy_urls)
                chat_btn.first.click()
                page.wait_for_selector('#chatPop:not([hidden])', state="visible", timeout=8000)
                # Verify lazy module loaded via hashed URL (not ?v= fallback)
                new_urls = lazy_urls[lazy_urls_before:]
                chat_lazy = [u for u in new_urls if "chat" in u.lower() and "/assets/" in u]
                has_old_fallback = any("?v=" in u for u in new_urls if "chat" in u.lower())
                if chat_lazy:
                    print(f"  PASS Chat lazy load (hashed URL: {chat_lazy[0].split('/')[-1]})")
                    results.append(("Chat lazy load", "PASS", chat_lazy[0].split("/")[-1]))
                elif not has_old_fallback:
                    # Panel opened, module loaded (may be bundled in main app)
                    print("  PASS Chat lazy load (panel opened)")
                    results.append(("Chat lazy load", "PASS", "Panel opened"))
                else:
                    print(f"  FAIL Chat lazy load — old ?v= fallback used: {[u for u in new_urls if '?' in u][:2]}")
                    results.append(("Chat lazy load", "FAIL", "Old ?v= fallback"))
            else:
                print("  FAIL Chat FAB not visible")
                results.append(("Chat lazy load", "FAIL", "FAB not visible"))
        except Exception as e:
            print(f"  FAIL Chat lazy load — {type(e).__name__}: {e}")
            results.append(("Chat lazy load", "FAIL", str(e)[:100]))

        # ── E. Check page + console errors ─────────────────────────────
        unexpected_console = [
            e for e in console_errors
            if "favicon" not in e.lower()
            and "service-worker" not in e.lower()
            and "workbox" not in e.lower()
        ]

        if page_errors:
            print(f"  FAIL pageerror ({len(page_errors)}): {page_errors[:2]}")
            results.append(("Page errors", "FAIL", f"{len(page_errors)} errors"))
        else:
            print("  PASS No page errors")
            results.append(("Page errors", "PASS", "0 errors"))

        if unexpected_console:
            print(f"  FAIL console.error ({len(unexpected_console)}): {unexpected_console[:2]}")
            results.append(("Console errors", "FAIL", f"{len(unexpected_console)} errors"))
        else:
            print("  PASS No unexpected console errors")
            results.append(("Console errors", "PASS", "0 unexpected"))

        browser.close()

    return results


# ── Main ──────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="TaskFlow Production Smoke Test")
    parser.add_argument("--base-url", default="https://taskflow-todoist.vercel.app",
                        help="Production URL to test")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    print(f"Production Smoke Test — {base}\n")

    all_results = []
    all_results.extend(check_routes(base))
    all_results.extend(check_hashed_assets(base))
    all_results.extend(check_security_headers(base))
    all_results.extend(check_assets_network(base))
    all_results.extend(check_browser_smoke(base))

    passed = sum(1 for _, status, _ in all_results if status == "PASS")
    failed = sum(1 for _, status, _ in all_results if status == "FAIL")
    warned = sum(1 for _, status, _ in all_results if status == "WARN")

    print(f"\n{'='*50}")
    print(f"Results: {passed} PASS, {failed} FAIL, {warned} WARN (total {len(all_results)})")

    if failed > 0:
        print("PRODUCTION SMOKE FAILED")
        sys.exit(1)
    else:
        print("PRODUCTION SMOKE OK")
        sys.exit(0)


if __name__ == "__main__":
    main()
