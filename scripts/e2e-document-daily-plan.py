"""E2E: Document Daily Planner — real browser orchestration (Chromium).

Covers the Phase 6.2 architecture contract end-to-end:

  upload PDF -> Stage A /api/ai/document-roadmap (exactly once)
             -> roadmap persisted account-scoped
             -> Stage B /api/ai/daily-plan  (the ONLY proposal source)
             -> Review DOM -> Apply -> tasks exist -> cursor advances
             -> Undo -> tasks reverted (cursor stays advanced)
             -> "lap tuan tiep theo" -> NO re-upload / NO Stage A
             -> second window from persisted roadmap -> Apply -> cursor += window

Usage: python scripts/e2e-document-daily-plan.py [--headed]
"""
import argparse
import datetime
import http.server
import json
import os
import sys
import threading

# Force UTF-8 on stdout/stderr for Unicode-safe error messages on Windows.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

FIXTURE = os.path.join("tests", "fixtures", "document-daily-plan.pdf")

# Dynamic dates relative to today so _targetDayForDate() resolves them
# into the planner grid (not inbox) and no clamping occurs.
TODAY = datetime.date.today()
DATED_ROWS = [
    (TODAY.isoformat(), "Learn GPIO basics 1h", 60),
    ((TODAY + datetime.timedelta(days=1)).isoformat(), "Learn UART communication 45 min", 45),
    ((TODAY + datetime.timedelta(days=2)).isoformat(), "Learn SPI bus 90 min", 90),
    ((TODAY + datetime.timedelta(days=3)).isoformat(), "I2C sensors lab 1h30", 90),
    ((TODAY + datetime.timedelta(days=4)).isoformat(), "Timer and PWM drills 60 min", 60),
    ((TODAY + datetime.timedelta(days=5)).isoformat(), "ADC practice set 2 hours", 120),
    ((TODAY + datetime.timedelta(days=6)).isoformat(), "Weekly review quiz 30 min", 30),
    ((TODAY + datetime.timedelta(days=7)).isoformat(), "Interrupt handling basics 1h", 60),
    ((TODAY + datetime.timedelta(days=8)).isoformat(), "DMA fundamentals 45 min", 45),
    ((TODAY + datetime.timedelta(days=9)).isoformat(), "Mini project sensor logger 2 hours", 120),
]

ROADMAP = {
    "title": "Embedded Systems Roadmap 2026",
    "summary": "Lich hoc co ngay cu the duoc trich nguyen van tu tai lieu.",
    "totalWeeks": 2,
    "phases": [],
    "datedTasks": [{"date": d, "text": t, "duration": m} for d, t, m in DATED_ROWS],
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)

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


def fail(msg):
    print("FAIL:", msg)
    sys.exit(1)


def build_stage_a_payload():
    return {
        "ok": True,
        "roadmap": ROADMAP,
        "fingerprint": "e2efixture00000001",
        "documentName": "document-daily-plan.pdf",
        "files": [{"name": "document-daily-plan.pdf",
                   "size": os.path.getsize(FIXTURE),
                   "type": "application/pdf"}],
        "rejectedFiles": [],
        "meta": {"source": "document-dates",
                 "dateRange": [DATED_ROWS[0][0], DATED_ROWS[-1][0]],
                 "totalDatedTasks": len(DATED_ROWS),
                 "roadmapLatencyMs": 1},
    }


def build_stage_b_payload(body):
    """Generate actions for any requested window, mapping DATED_ROWS text
    cyclically. This ensures actions exist regardless of the exact dates
    requested (which may be clamped by the client to today)."""
    start = body.get("startDate")
    days_raw = body.get("daysCount") or 7
    try:
        days = int(days_raw)
        start_day = datetime.date.fromisoformat(str(start))
    except Exception:
        fail("daily-plan startDate/daysCount malformed: %r %r" % (start, days_raw))
    dates = [(start_day + datetime.timedelta(days=i)).isoformat() for i in range(max(1, min(days, 14)))]
    allowed = set(dates)
    existing = {str(t.get("text", "")).strip().lower()
                for t in body.get("existingTasks", []) if isinstance(t, dict)}
    actions = []
    for i, date in enumerate(sorted(allowed)):
        _, text, minutes = DATED_ROWS[i % len(DATED_ROWS)]
        if text.strip().lower() in existing:
            continue
        actions.append({
            "id": "a" + str(len(actions) + 1),
            "type": "create_task",
            "args": {"taskRef": None, "text": text, "date": date,
                     "start": None, "duration": minutes, "priority": False,
                     "projectId": None, "milestoneId": None, "changes": None},
            "source": {"kind": "document-daily-plan", "evidence": text},
        })
    return {
        "ok": True,
        "proposal": {"summary": "Ke hoach %s den %s - %d viec"
                      % (dates[0], dates[-1], len(actions)),
                     "actions": actions},
        "meta": {"daysGenerated": len(dates), "totalActions": len(actions),
                 "estimatedMinutes": sum(a["args"]["duration"] for a in actions),
                 "dateRange": [dates[0], dates[-1]], "hasPastDate": False},
    }


def main():
    argp = argparse.ArgumentParser()
    argp.add_argument("--headed", action="store_true")
    args = argp.parse_args()

    counters = {"document-roadmap": 0, "daily-plan": 0, "combined": 0}
    daily_plan_bodies = []

    def handle_api(route):
        url = route.request.url.split("?")[0]
        if url.endswith("/api/ai/document-roadmap"):
            counters["document-roadmap"] += 1
            buf = route.request.post_data_buffer or b""
            if b"document-daily-plan.pdf" not in buf:
                fail("Stage A upload does not contain the PDF filename")
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps(build_stage_a_payload()))
            return
        if url.endswith("/api/ai/daily-plan"):
            counters["daily-plan"] += 1
            body = route.request.post_data_json or {}
            roadmap = body.get("roadmap") or {}
            if not isinstance(roadmap.get("datedTasks"), list) or not roadmap["datedTasks"]:
                fail("/daily-plan called WITHOUT persisted dated roadmap: %s"
                     % json.dumps(body)[:300])
            daily_plan_bodies.append({
                "startDate": str(body.get("startDate")),
                "daysCount": body.get("daysCount"),
                "roadmapTitle": roadmap.get("title"),
                "datedTaskCount": len(roadmap["datedTasks"]),
            })
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps(build_stage_b_payload(body)))
            return
        if url.endswith("/api/ai/document-daily-plan"):
            counters["combined"] += 1
            route.abort()
            return
        route.abort()

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 8123), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=not args.headed)
            context = browser.new_context(viewport={"width": 1280, "height": 900},
                                          service_workers="block")
            page = context.new_page()

            local_server_url = "http://127.0.0.1:8123"
            modified_api_config = (
                "const API_CONFIG = { url: '%s', google: false };\n" % local_server_url
            )

            def intercept_api_config(route):
                route.fulfill(status=200, content_type="application/javascript",
                              body=modified_api_config)

            page.route("**/api-config*", intercept_api_config)
            page.route("**/api/auth/me", lambda r: r.fulfill(
                status=200, content_type="application/json",
                body=json.dumps({"ok": True, "data": {"id": "e2e-test-user", "username": "e2e"}})))
            page.route("**/api/auth/login", lambda r: r.fulfill(
                status=200, content_type="application/json",
                body=json.dumps({"ok": True, "data": {
                    "token": "e2e-doc-token",
                    "user": {"id": "e2e-test-user", "username": "e2e"}}})))
            page.route("**/api/sync/pull", lambda r: r.fulfill(
                status=200, content_type="application/json",
                body=json.dumps({"ok": True, "data": {}})))
            page.route("**/api/sync/push", lambda r: r.fulfill(
                status=200, content_type="application/json",
                body=json.dumps({"ok": True, "data": {}})))
            page.route("**/api/ai/**", handle_api)

            base = local_server_url
            page.goto(base + "/app.html?view=week", wait_until="networkidle")

            page.evaluate(
                "localStorage.setItem('planner-onboarded','1');"
                "localStorage.setItem('planner-token','e2e-doc-token');"
            )

            if page.locator('[data-testid="onboard-modal"]:visible').count():
                page.locator('[data-action="ob-skip"]').click()

            def storage_contains(fragment):
                return page.evaluate("""(needle) => {
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k.indexOf('taskflow-document-roadmaps') !== -1) continue;
                        if (String(localStorage.getItem(k)).indexOf(needle) !== -1) return true;
                    }
                    return false;
                }""", fragment)

            def cursor_state():
                return page.evaluate(
                    "() => (window.TaskFlowDocumentDailyPlan && TaskFlowDocumentDailyPlan.getStatus()) || {}")

            # ---- open AI chat and attach the fixture PDF ----
            page.locator("#chatFab").click()
            page.wait_for_selector("#chatPop", state="visible")
            page.wait_for_function("window.TaskFlowChat && window.TaskFlowChatHistory")
            page.locator("#chatInput").wait_for(state="visible")
            page.locator("#chatFileInput").set_input_files(os.path.abspath(FIXTURE))
            page.locator("#chatInput").fill("L\u1eadp k\u1ebf ho\u1ea1ch h\u1ecdc t\u1eebng ng\u00e0y t\u1eeb t\u00e0i li\u1ec7u n\u00e0y")
            page.locator('[data-action="chat-send"]').click()

            # ---- initial flow ----
            page.wait_for_selector('[data-testid="agent-card"]', timeout=30000)
            if counters["combined"]:
                fail("retired combined /document-daily-plan was called (%d times)" % counters["combined"])
            if counters["document-roadmap"] != 1:
                fail("expected exactly 1 document-roadmap call, got %d" % counters["document-roadmap"])
            if counters["daily-plan"] != 1:
                fail("expected exactly 1 daily-plan call after upload, got %d" % counters["daily-plan"])
            first = daily_plan_bodies[0]
            if first["daysCount"] != 7:
                fail("initial window wrong: %s" % first)
            if first["datedTaskCount"] != 10 or first["roadmapTitle"] != ROADMAP["title"]:
                fail("initial /daily-plan did not reuse the persisted roadmap: %s" % first)

            rows = page.locator('[data-testid^="review-action-"]')
            if rows.count() != 7:
                fail("expected 7 review action rows, got %d" % rows.count())

            # Check that first action text matches a known task
            row1 = page.locator('[data-testid="review-action-a1"]').inner_text().lower()
            if "gpio" not in row1:
                fail("first review row is not the GPIO task: %r" % row1)

            # ---- Apply: tasks exist in planner grid ----
            page.locator('[data-testid="review-confirm"]').click()
            page.wait_for_timeout(2000)

            # Tasks should be in the planner grid (in-month) or inbox
            if not storage_contains("Learn UART communication"):
                fail("applied tasks missing from planner state after Apply")

            # ---- Undo: tasks reverted ----
            undo_btn = page.locator('[data-action="undo"]').first
            if undo_btn.is_disabled():
                fail("undo button disabled right after Apply")
            undo_btn.click()
            page.wait_for_timeout(2000)
            if storage_contains("Learn UART communication"):
                fail("Undo did not revert the applied tasks")

            # ---- follow-up "l\u1eadp tu\u1ea7n ti\u1ebfp theo": no re-upload ----
            # Re-open chat if it closed
            if not page.locator("#chatPop").is_visible():
                page.locator("#chatFab").click()
                page.wait_for_selector("#chatPop", state="visible")
            page.locator("#chatInput").wait_for(state="visible")

            uploads_before = counters["document-roadmap"]
            plans_before = len(daily_plan_bodies)
            page.locator("#chatInput").fill("l\u1eadp tu\u1ea7n ti\u1ebfp theo")
            page.locator('[data-action="chat-send"]').click()
            page.wait_for_selector('[data-testid="agent-card"]', timeout=30000)

            if counters["document-roadmap"] != uploads_before:
                fail("follow-up re-uploaded the PDF (Stage A called again)")
            if counters["combined"]:
                fail("follow-up hit the retired combined endpoint")
            if len(daily_plan_bodies) != plans_before + 1:
                fail("follow-up did not call /daily-plan exactly once more")
            second = daily_plan_bodies[-1]
            if second["daysCount"] != 7:
                fail("next window wrong daysCount: %s" % second)
            if second["datedTaskCount"] != 10:
                fail("follow-up did not reuse the persisted roadmap")

            # ---- second Review: Apply ----
            page.wait_for_timeout(500)
            rows2 = page.locator('[data-testid^="review-action-"]')
            if rows2.count() != 7:
                fail("second review should contain 7 rows, got %d" % rows2.count())
            page.locator('[data-testid="review-confirm"]').click()
            page.wait_for_timeout(2000)

            cur = cursor_state().get("cursor") or {}
            if cur.get("lastAppliedDaysCount") != 14:
                fail("cursor did not advance by the second window size: %s"
                     % json.dumps(cursor_state()))
            # Second window maps DATED_ROWS cyclically — index 1 = UART
            if not storage_contains("Learn UART communication"):
                fail("second-window tasks missing from planner state after Apply")

            browser.close()
    finally:
        server.shutdown()
    print("E2E OK - document-roadmap x%d, daily-plan x%d, combined x%d"
          % (counters["document-roadmap"], counters["daily-plan"], counters["combined"]))


if __name__ == "__main__":
    main()
