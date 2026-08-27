#!/usr/bin/env python3
"""
Phase 8 E2E — Document-Aware Chat (REAL UI flow)

Uses real browser interactions for ALL chat actions:
- Chat send: fill #chatInput + dispatchEvent('input') + click send button
- No page.invoke('doChatSend') or internal function calls for core user actions
- saveRoadmap() used only for test bootstrap (setting deterministic initial state)

Scenarios:
1. Bootstrap roadmap via saveRoadmap (test setup — acceptable per spec)
2. "Tom tat tai lieu nay" via real UI → documentContext sent → answer appears
3. "Tuan 1 hoc gi?" via real UI → documentContext sent
4. "Lap tuan tiep theo" via real UI → no document-roadmap re-call
5. No active document → fallback message
6. No legacy endpoint called
"""
import http.server
import json
import mimetypes
import os
import socketserver
import sys
import threading
import time
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

CLEAN_URLS = {
    '/app': 'app.html',
    '/privacy': 'privacy.html',
    '/terms': 'terms.html',
    '/data-and-security': 'data-and-security.html',
}

API_CALLS = []


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)

    def _send(self, body, ctype, status=200, extra=None):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/sw.js':
            with open(os.path.join(ROOT, 'sw.js'), 'rb') as f:
                self._send(f.read(), 'application/javascript',
                           extra={'Cache-Control': 'no-cache, no-store'})
            return
        if path == '/':
            path = '/index.html'
        if path in CLEAN_URLS:
            path = '/' + CLEAN_URLS[path]
        fs = os.path.normpath(os.path.join(ROOT, path.lstrip('/')))
        if not os.path.isfile(fs):
            self.send_error(404)
            return
        with open(fs, 'rb') as f:
            body = f.read()
        ctype = ('text/html; charset=utf-8' if fs.endswith('.html')
                 else mimetypes.guess_type(fs)[0] or 'application/octet-stream')
        self._send(body, ctype)

    def do_POST(self):
        self.send_error(404)


def main():
    httpd = socketserver.TCPServer(('127.0.0.1', 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{port}'

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
            page = ctx.new_page()
            page.add_init_script(
                "localStorage.setItem('planner-onboarded','1');"
                "localStorage.setItem('planner-lang','vi');"
            )

            # Track API calls and intercept responses
            roadmap_calls = [0]
            daily_plan_calls = [0]
            chat_calls = [0]
            captured_bodies = []

            def handle_route(route):
                url = route.request.url
                path = urlsplit(url).path
                body = route.request.post_data
                try:
                    parsed = json.loads(body) if body else {}
                except Exception:
                    parsed = {}

                API_CALLS.append({'path': path, 'body': parsed, 'url': url})

                if '/api/ai/document-roadmap' in path:
                    roadmap_calls[0] += 1
                    route.fulfill(
                        status=200,
                        content_type='application/json',
                        body=json.dumps({
                            "ok": True,
                            "roadmap": {
                                "title": "Embedded Systems Roadmap",
                                "totalWeeks": 4,
                                "phases": [
                                    {"name": "GPIO & Basics", "weeks": "1-2",
                                     "goals": ["GPIO input/output", "UART communication"],
                                     "deliverables": ["LED blink app", "Serial monitor"],
                                     "topics": ["GPIO", "UART", "SPI", "I2C"]},
                                    {"name": "Networking", "weeks": "3-4",
                                     "goals": ["TCP/IP stack", "MQTT protocol"],
                                     "deliverables": ["HTTP client", "MQTT sensor"],
                                     "topics": ["TCP", "UDP", "MQTT", "CoAP"]},
                                ]
                            },
                            "fingerprint": "fp_test_008",
                            "documentName": "Embedded.pdf",
                            "files": [],
                            "rejectedFiles": [],
                            "meta": {"source": "llm", "dateRange": None, "totalDatedTasks": 0},
                            "latencyMs": 50,
                        })
                    )
                elif '/api/ai/daily-plan' in path:
                    daily_plan_calls[0] += 1
                    route.fulfill(
                        status=200,
                        content_type='application/json',
                        body=json.dumps({
                            "ok": True,
                            "proposal": {
                                "actions": [
                                    {"id": "a1", "type": "create_task",
                                     "text": "Study GPIO basics",
                                     "date": "2026-09-01", "duration": 60,
                                     "priority": False, "start": None,
                                     "projectId": None, "milestoneId": None,
                                     "taskRef": None, "changes": None},
                                ],
                                "summary": "Week 1: GPIO basics"
                            },
                            "meta": {"daysGenerated": 7},
                        })
                    )
                elif '/api/ai/chat' in path and '/continue' not in path:
                    chat_calls[0] += 1
                    doc_ctx = parsed.get('documentContext')
                    captured_bodies.append(parsed)
                    answer = 'Roadmap Embedded Systems gom 4 tuan.'
                    if doc_ctx and doc_ctx.get('roadmap'):
                        rn = doc_ctx.get('documentName', '?')
                        phases = doc_ctx.get('roadmap', {}).get('phases', [])
                        answer = f'Tai lieu {rn} co {len(phases)} phases.'
                    route.fulfill(
                        status=200,
                        content_type='application/json',
                        body=json.dumps({
                            "ok": True,
                            "answer": answer,
                            "truncated": False,
                        })
                    )
                elif '/api/ai/chat/continue' in path:
                    route.fulfill(
                        status=200,
                        content_type='application/json',
                        body=json.dumps({"ok": True, "answer": " continued.", "truncated": False})
                    )
                else:
                    route.fallback()

            # ---- Load app ----
            page.goto(f'{base}/app', wait_until='domcontentloaded')
            page.wait_for_selector('#appMain', state='visible')
            page.wait_for_function(
                "async () => { await navigator.serviceWorker.ready; "
                "return !!navigator.serviceWorker.controller; }",
                timeout=20000,
            )
            page.evaluate("localStorage.setItem('planner-token', 'test-token')")
            # Override API_CONFIG to route all API calls through the local test server
            page.evaluate(
                "const API_CONFIG = { url: '%s', google: false };\n" % base
            )
            page.route('**/api/ai/**', handle_route)

            # Open chat to trigger lazy module loading
            fab = page.locator('[data-testid="chat-fab"]')
            fab.click()
            page.wait_for_selector('#chatPop:not([hidden])', state='visible')

            # Wait for lazy modules to load
            page.wait_for_function(
                "() => !!window.TaskFlowDocumentDailyPlan",
                timeout=15000,
            )
            page.wait_for_function(
                "() => !!window.TaskFlowChat",
                timeout=15000,
            )
            # Phase 9: wait for deterministic roadmap resolver
            page.wait_for_function(
                "() => !!window.TaskFlowRoadmapResolver",
                timeout=15000,
            )

            # Ensure composer is initialized
            page.wait_for_function(
                "() => { try { window.TaskFlowChat._initComposer(); } catch(e) {} "
                "var inp = document.getElementById('chatInput'); "
                "var send = document.querySelector('[data-action=\"chat-send\"]'); "
                "return inp && send; }",
                timeout=5000,
            )

            results = []

            # ═══════════════════════════════════════════════════════
            # Helper: send chat message via REAL UI
            # ═══════════════════════════════════════════════════════
            def send_chat_message(text):
                """Type into #chatInput and press Enter — real UI interaction."""
                inp = page.locator('#chatInput')
                inp.fill(text)
                # Ensure input event fires to enable send button
                page.evaluate(
                    "var el = document.getElementById('chatInput'); "
                    "el.dispatchEvent(new Event('input', {bubbles: true}));"
                )
                page.wait_for_timeout(300)
                # Press Enter to submit — triggers keydown listener in _initComposer
                inp.press('Enter')

            # ═══════════════════════════════════════════════════════
            # Scenario 1: Bootstrap roadmap via saveRoadmap (test setup)
            # ═══════════════════════════════════════════════════════
            page.evaluate("""() => {
                window.TaskFlowDocumentDailyPlan.saveRoadmap({
                    id: 'roadmap-test-001',
                    fingerprint: 'fp_test_008',
                    documentName: 'Embedded.pdf',
                    roadmap: {
                        title: 'Embedded Systems Roadmap',
                        totalWeeks: 4,
                        phases: [
                            {name:'GPIO & Basics', weeks:'1-2', goals:['GPIO'], deliverables:['LED'], topics:['GPIO','UART']},
                            {name:'Networking', weeks:'3-4', goals:['TCP/IP'], deliverables:['HTTP'], topics:['TCP','MQTT']},
                        ]
                    },
                    baseDate: '2026-09-01',
                    cursor: {nextWeek:0, lastAppliedStartDate:null, lastAppliedDaysCount:0}
                });
            }""")

            roadmap = page.evaluate("() => window.TaskFlowDocumentDailyPlan?.getActiveRoadmap()")
            results.append(('1. roadmap bootstrapped', roadmap is not None and roadmap.get('roadmap', {}).get('title') == 'Embedded Systems Roadmap'))

            # ═══════════════════════════════════════════════════════
            # Scenario 2: "Tom tat tai lieu nay" via REAL UI → documentContext
            # ═══════════════════════════════════════════════════════
            API_CALLS.clear()
            captured_bodies.clear()
            chat_calls[0] = 0

            send_chat_message('Tom tat tai lieu nay')

            page.wait_for_selector('.chat-msg.bot:not(.chat-typing):not(.chat-stopped)', timeout=30000)
            time.sleep(0.3)

            # Check documentContext in captured request
            doc_ctx_sent = False
            for b in captured_bodies:
                dc = b.get('documentContext')
                if dc and dc.get('roadmap'):
                    doc_ctx_sent = True
                    break
            results.append(('2. documentContext sent', doc_ctx_sent))

            # Verify no document-roadmap re-call
            rm_calls_after = [c for c in API_CALLS if '/document-roadmap' in c.get('path', '')]
            results.append(('3. no document-roadmap re-call', len(rm_calls_after) == 0))

            # Verify chat was called
            results.append(('4. /api/ai/chat called', chat_calls[0] >= 1))

            # ═══════════════════════════════════════════════════════
            # Scenario 3: "Tuan 1 hoc gi?" via REAL UI → documentContext
            # ═══════════════════════════════════════════════════════
            API_CALLS.clear()
            captured_bodies.clear()
            chat_calls[0] = 0

            send_chat_message('Tuan 1 hoc gi?')
            page.wait_for_selector('.chat-msg.bot:not(.chat-typing):not(.chat-stopped)', timeout=30000)
            time.sleep(0.3)

            # Phase 9: deterministic resolver answers 'Tuan X hoc gi?' locally without AI call
            # Verify a new bot message appeared after the week question
            bot_msgs = page.query_selector_all('.chat-msg.bot:not(.chat-typing)')
            # At minimum: welcome + answer to 'Tom tat' + answer to 'Tuan 1' = 3
            week_answered = len(bot_msgs) >= 3
            results.append(('5. week question answered (deterministic)', week_answered))

            # ═══════════════════════════════════════════════════════
            # Scenario 4: "Lap tuan tiep theo" via REAL UI → Stage B only
            # ═══════════════════════════════════════════════════════
            API_CALLS.clear()
            send_chat_message('Lap tuan tiep theo')
            time.sleep(2)

            rm_calls_next = [c for c in API_CALLS if '/document-roadmap' in c.get('path', '')]
            results.append(('6. next-week: no document-roadmap', len(rm_calls_next) == 0))

            # ═══════════════════════════════════════════════════════
            # Scenario 5: No active document → fallback
            # ═══════════════════════════════════════════════════════
            page.evaluate("() => window.TaskFlowDocumentDailyPlan?.clearActiveRoadmap()")
            no_doc = page.evaluate("() => window.TaskFlowDocumentDailyPlan?.getActiveRoadmap()")
            results.append(('7. active roadmap cleared', no_doc is None))

            API_CALLS.clear()
            captured_bodies.clear()
            send_chat_message('Tom tat tai lieu nay')
            time.sleep(1.5)

            chat_after = [c for c in API_CALLS if '/api/ai/chat' in c.get('path', '')]
            results.append(('8. no-doc: no /api/ai/chat call', len(chat_after) == 0))

            fallback_found = page.evaluate("""() => {
                var msgs = document.querySelectorAll('.chat-msg.bot');
                for (var i = 0; i < msgs.length; i++) {
                    var t = (msgs[i].textContent || '').normalize('NFD');
                    // Strip combining diacritics for flexible matching
                    var stripped = t.replace(/[\u0300-\u036f]/g, '').toLowerCase();
                    if (stripped.indexOf('chua co tai lieu') >= 0 || stripped.indexOf('no active document') >= 0)
                        return true;
                }
                return false;
            }""")
            results.append(('9. no-doc: fallback message shown', fallback_found))

            # ═══════════════════════════════════════════════════════
            # Scenario 6: Verify no legacy endpoint called
            # ═══════════════════════════════════════════════════════
            legacy = [c for c in API_CALLS if 'document-daily-plan' in c.get('path', '')]
            results.append(('10. no legacy /document-daily-plan', len(legacy) == 0))

        finally:
            browser.close()

    # ── report ──
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    for name, ok in results:
        print(f"  {'PASS' if ok else 'FAIL'} - {name}")
    print()
    if passed == total:
        print(f"DOCUMENT CHAT E2E OK - {total}/{total} scenarios passed")
        return 0
    else:
        print(f"DOCUMENT CHAT E2E FAILED - {total - passed}/{total} failed")
        return 1


if __name__ == '__main__':
    sys.exit(main())
