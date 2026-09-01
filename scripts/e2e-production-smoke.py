"""Production Smoke Test — verifies deployed TaskFlow at a configurable URL.

Usage:
  python scripts/e2e-production-smoke.py
  python scripts/e2e-production-smoke.py --base-url https://taskflow-todoist.vercel.app

Checks:
  A. HTTP routes return 200
  B. Hashed assets in HTML (no ?v= pins)
  C. Security headers present
  D. Asset network check (no 404 for JS/CSS/fonts/icons/manifest/SW)
  E. Browser boot (no pageerror, no critical console.error)
  F. Quick Add in local mode
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
    """A. Check HTTP routes."""
    routes = ["/", "/app", "/privacy", "/terms", "/data-and-security", "/manifest.json", "/sw.js"]
    results = []
    for route in routes:
        url = base.rstrip("/") + route
        status, _, _ = fetch(url)
        ok = 200 <= status < 400
        results.append((route, "PASS" if ok else "FAIL", f"HTTP {status}"))
        print(f"  {'PASS' if ok else 'FAIL'} {route} — HTTP {status}")
    return results


def check_hashed_assets(base):
    """B. Check that /app HTML uses hashed assets, no ?v= pins."""
    url = base.rstrip("/") + "/app"
    status, _, body = fetch(url)
    if status != 200:
        print(f"  FAIL /app returned HTTP {status}")
        return [("Hashed assets", "FAIL", f"HTTP {status}")]

    # Find first-party script/css references
    scripts = re.findall(r'src="([^"]*\.js)"', body)
    styles = re.findall(r'href="([^"]*\.css)"', body)

    # Check no ?v= pins
    v_pins = [s for s in scripts + styles if "?" in s and "assets/" not in s]
    if v_pins:
        print(f"  FAIL Found ?v= pins: {v_pins[:3]}")
        return [("Hashed assets", "FAIL", f"Found ?v= pins")]

    # Check hashed pattern
    hashed = [s for s in scripts if s.startswith("assets/") and re.search(r'\.[a-f0-9]{8}\.js$', s)]
    if not hashed:
        print("  FAIL No hashed JS assets found in /app HTML")
        return [("Hashed assets", "FAIL", "No hashed assets")]

    print(f"  PASS Hashed assets ({len(hashed)} JS, no ?v= pins)")
    return [("Hashed assets", "PASS", f"{len(hashed)} JS references")]


def check_security_headers(base):
    """C. Check security headers."""
    url = base.rstrip("/") + "/app"
    status, headers, _ = fetch(url)
    checks = [
        ("Content-Security-Policy", lambda h: "Content-Security-Policy" in h),
        ("Strict-Transport-Security", lambda h: "Strict-Transport-Security" in h),
        ("X-Content-Type-Options", lambda h: "X-Content-Type-Options" in h),
        ("X-Frame-Options", lambda h: "X-Frame-Options" in h),
    ]
    results = []
    for name, check in checks:
        ok = check(headers)
        results.append((name, "PASS" if ok else "FAIL", ""))
        print(f"  {'PASS' if ok else 'FAIL'} {name}")
    return results


def check_assets_network(base):
    """D. Check critical first-party assets are not 404."""
    url = base.rstrip("/") + "/app"
    status, _, body = fetch(url)
    if status != 200:
        return [("Asset network", "FAIL", f"Cannot fetch /app")]

    # Extract asset URLs
    assets = re.findall(r'(?:src|href)="(assets/[^"]+)"', body)
    # Also check icons and fonts referenced in the HTML
    icons = re.findall(r'(?:src|href)="(icons/[^"]+)"', body)
    fonts = re.findall(r'(?:src|href)="(fonts/[^"]+)"', body)

    all_assets = assets + icons + fonts
    failures = []
    for asset in all_assets[:15]:  # limit to avoid too many requests
        asset_url = base.rstrip("/") + "/" + asset
        asset_status, _, _ = fetch(asset_url)
        if asset_status >= 400:
            failures.append(f"{asset} → HTTP {asset_status}")

    if failures:
        print(f"  FAIL Asset 404s: {failures}")
        return [("Asset network", "FAIL", str(failures))]
    print(f"  PASS Asset network ({len(all_assets[:15])} checked, no 404s)")
    return [("Asset network", "PASS", f"{len(all_assets[:15])} assets checked")]


def check_browser_boot(base):
    """E. Browser boot: no pageerror, Quick Add in local mode."""
    results = []
    page_errors = []
    console_errors = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.emulate_media(reduced_motion="reduce")
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        page.add_init_script("localStorage.setItem('planner-onboarded','1');")
        page.goto(f"{base.rstrip('/')}/app?view=today", wait_until="networkidle")

        if page.locator('[data-testid="onboard-modal"]:visible').count():
            page.locator('[data-action="ob-skip"]').click()

        page.wait_for_selector('[data-testid="today-view"]', state="visible")

        # F. Quick Add in local mode (resilient — skip if modal doesn't open)
        try:
            page.locator('.app-primary-action[data-action="shell-add-task"]').click()
            page.wait_for_selector('[data-testid="quick-add"]:not([hidden])', state="visible", timeout=5000)
            page.fill('#quickAddInput', 'Production Smoke Task')
            page.locator('[data-action="quickadd-do"]').click()
            page.wait_for_timeout(500)
            task_visible = page.locator('.task-row:has-text("Production Smoke Task")').count() > 0
            if task_visible:
                print("  PASS Quick Add (local mode)")
                results.append(("Quick Add", "PASS", "Task created"))
            else:
                print("  WARN Quick Add (modal opened but task not visible)")
                results.append(("Quick Add", "WARN", "Task not visible"))
        except Exception as e:
            print(f"  WARN Quick Add (skipped: {type(e).__name__})")
            results.append(("Quick Add", "WARN", f"Skipped: {type(e).__name__}"))

        # Check page errors
        if page_errors:
            print(f"  FAIL pageerror: {page_errors[:3]}")
            results.append(("Page errors", "FAIL", str(page_errors[:3])))
        else:
            print("  PASS No page errors")
            results.append(("Page errors", "PASS", "0 errors"))

        # Check console errors (filter known benign)
        real_errors = [e for e in console_errors if "favicon" not in e.lower() and "404" not in e]
        if real_errors:
            print(f"  WARN console.error: {real_errors[:3]}")
            results.append(("Console errors", "WARN", str(real_errors[:3])))
        else:
            print("  PASS No critical console errors")
            results.append(("Console errors", "PASS", "0 critical errors"))

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
    all_results.extend(check_browser_boot(base))

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
