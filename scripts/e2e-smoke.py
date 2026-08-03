"""E2E smoke (Task 3.4): Playwright — load app → toggle habit → switch view → export.

Tự khởi động HTTP server tĩnh (tránh phụ thuộc port bên ngoài), chạy trên Chromium
headless. Thoát 0 = PASS, khác 0 = FAIL. Chạy:  python scripts/e2e-smoke.py
"""
import http.server
import os
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # im lặng
        pass


def start_server(port):
    httpd = socketserver.TCPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    port = 0
    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # 1) Load app — pre-set onboarded để modal onboarding không chặn thao tác
        page.add_init_script("localStorage.setItem('planner-onboarded','1');")
        page.goto(f"{base}/app.html")
        page.wait_for_timeout(1200)
        # Nếu vẫn lọt onboarding (lần đầu), đóng luôn
        if page.locator("#onboardModal:not([hidden])").count():
            page.locator('[data-action="ob-skip"]').click()
            page.wait_for_timeout(300)
        assert page.locator("#navTabs .tab").count() >= 4, "thiếu tabs (overview/calendar/year/weeks)"

        # 2) Toggle một ô habit ✓
        habit = page.locator('[data-action="habit"]').first
        assert habit.count() > 0, "không có checkbox habit"
        before = habit.get_attribute("aria-checked")
        habit.click()
        page.wait_for_timeout(200)
        after = habit.get_attribute("aria-checked")
        assert before != after, f"toggle habit không đổi: {before} -> {after}"

        # 3) Chuyển view: calendar → year → week
        page.locator('[data-action="nav"][data-view="calendar"]').click()
        page.wait_for_timeout(300)
        assert page.locator("#view-calendar.active").count() == 1, "view-calendar không active"
        page.locator('[data-action="nav"][data-view="year"]').click()
        page.wait_for_timeout(300)
        assert page.locator("#view-year.active").count() == 1, "view-year không active"
        page.locator('[data-action="nav"][data-view="week"][data-week="1"]').first.click()
        page.wait_for_timeout(300)
        assert page.locator("#view-week.active").count() == 1, "view-week không active"

        # 4) Tìm kiếm xuyên tháng mở được
        page.locator('[data-action="search-toggle"]').click()
        page.wait_for_timeout(200)
        assert page.locator("#searchModal:not([hidden])").count() == 1, "searchModal không mở"
        page.locator('[data-action="search-close"]').click()
        page.wait_for_timeout(200)

        # 5) Export CSV → bắt sự kiện download
        with page.expect_download() as dl_info:
            page.locator('[data-action="data-toggle"]').click()
            page.locator('[data-action="export-csv"]').click()
        dl = dl_info.value
        assert dl.suggested_filename.endswith(".csv"), f"tên file lạ: {dl.suggested_filename}"

        # 6) Pomodoro panel mở được
        page.locator('[data-action="pomo-toggle"]').click()
        page.wait_for_timeout(200)
        assert page.locator("#pomoPanel:not([hidden])").count() == 1, "pomoPanel không mở"

        browser.close()

    if errors:
        print("PAGE ERRORS:", errors[:5])
        sys.exit(1)
    print("E2E SMOKE OK: habit toggle · calendar/year/week views · search modal · CSV export · pomodoro")
    httpd.shutdown()
    sys.exit(0)


if __name__ == "__main__":
    main()
