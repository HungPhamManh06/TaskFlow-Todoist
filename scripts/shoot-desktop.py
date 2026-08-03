"""Capture desktop screenshots for design audit."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8090"

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)

    # Landing full page
    pg.goto(f"{BASE}/index.html")
    pg.wait_for_timeout(1200)
    pg.screenshot(path="shot-landing-full.png", full_page=True)
    pg.screenshot(path="shot-landing-top.png")
    pg.evaluate("document.querySelector('#features').scrollIntoView()")
    pg.wait_for_timeout(500)
    pg.screenshot(path="shot-landing-features.png")
    pg.evaluate("document.querySelector('#demo').scrollIntoView()")
    pg.wait_for_timeout(500)
    pg.screenshot(path="shot-landing-demo.png")

    # App overview
    pg.goto(f"{BASE}/app.html")
    pg.wait_for_timeout(1500)
    pg.screenshot(path="shot-app-top.png")
    pg.evaluate("window.scrollTo(0, 0)")
    pg.wait_for_timeout(300)

    # Click through to see overview content
    pg.evaluate("document.querySelectorAll('[data-action=\"journey\"]')[0]?.click()")
    pg.wait_for_timeout(800)
    pg.screenshot(path="shot-app-overview.png", full_page=False)
    pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    pg.wait_for_timeout(400)
    pg.screenshot(path="shot-app-overview-bottom.png")

    # Year view
    pg.evaluate("document.querySelectorAll('.tab')[1]?.click()")
    pg.wait_for_timeout(800)
    pg.screenshot(path="shot-app-year.png", full_page=True)

    b.close()
    print("done")
