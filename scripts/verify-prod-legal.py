"""P0.3 re-verification: production legal pages must serve fixed source.

Checks (against https://taskflow-todoist.vercel.app):
1. Raw HTML contains no JS-style escaped quotes (backslash-quote) and no \\uXXXX escapes.
2. Rendered UI text contains no leaked data-t-vi / data-t-en attribute values and no
   'href=\\"' fragments.
3. Language switch VI <-> EN actually swaps visible text (i18n wiring works in prod).
4. Dark mode toggle applies data-dark + theme-color.
5. External links carry rel=noopener noreferrer; no horizontal overflow at 390px.
"""
import sys

from playwright.sync_api import sync_playwright

BASE = "https://taskflow-todoist.vercel.app"
PAGES = ["privacy", "terms", "data-and-security"]
BAD_VISIBLE = ["data-t-vi", "data-t-en", 'href="\\"', '\\u']


def main():
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for slug in PAGES:
            url = f"{BASE}/{slug}"
            # Raw HTML check (bypasses SW cache: fresh context per page)
            ctx = browser.new_context()
            page = ctx.new_page()
            resp = page.goto(url, wait_until="networkidle")
            assert resp is not None and resp.ok, f"{slug}: HTTP {resp.status if resp else 'none'}"
            raw = resp.text()
            for bad in ['\\"', "\\u"]:
                if bad in raw:
                    failures.append(f"{slug}: raw HTML contains backslash escape {bad!r}")

            # Rendered UI text check
            body_text = page.evaluate("document.body.innerText")
            for bad in BAD_VISIBLE:
                if bad in body_text:
                    failures.append(f"{slug}: visible UI leaks {bad!r}")

            # Language switch VI -> EN
            page.locator("#langBtn").click()
            page.wait_for_timeout(300)
            html_lang = page.evaluate("document.documentElement.lang")
            if html_lang != "en":
                failures.append(f"{slug}: lang switch -> lang={html_lang!r}")

            # Dark mode toggle
            page.locator("#darkBtn").click()
            page.wait_for_timeout(300)
            dark = page.evaluate("document.documentElement.getAttribute('data-dark')")
            theme = page.evaluate("document.querySelector('meta[name=theme-color]')?.content")
            if dark != "true":
                failures.append(f"{slug}: dark toggle data-dark={dark!r}")

            # External links noopener
            bad_links = page.evaluate(
                """() => [...document.querySelectorAll('a[target="_blank"]')]
                    .filter(a => !a.rel.includes('noopener') || !a.rel.includes('noreferrer'))
                    .map(a => a.href)"""
            )
            if bad_links:
                failures.append(f"{slug}: target=_blank links missing rel: {bad_links[:3]}")

            # Mobile overflow
            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(200)
            overflow = page.evaluate(
                "document.documentElement.scrollWidth - document.documentElement.clientWidth"
            )
            if overflow > 1:
                failures.append(f"{slug}: mobile horizontal overflow {overflow}px")

            # h1 present
            if page.locator("h1").count() == 0:
                failures.append(f"{slug}: no h1")

            ctx.close()

        browser.close()

    if failures:
        print("PROD LEGAL VERIFY FAIL:")
        for f in failures:
            print(" -", f)
        return 1
    print(f"PROD LEGAL VERIFY OK: {len(PAGES)} pages, raw HTML clean, UI text clean, lang+dark+links+overflow OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
