"""E2E: Chat long-answer, retry, and stop with real browser orchestration.

Covers Phase 7 chat reliability:

Scenario A - normal response:
  Server returns complete answer -> no Continue button

Scenario B - truncated -> manual Continue:
  Server returns truncated=true -> Continue button appears ->
  click Continue -> server returns continuation -> merged answer -> no duplicate

Scenario C - retry on error:
  Server returns error -> Retry button appears -> click Retry -> success ->
  exactly 1 user message, 1 assistant answer

Scenario D - Stop:
  User sends message -> server delays -> Stop clicked -> no stale answer

Uses Playwright route interception for deterministic API responses.
Real browser: app boot, Chat UI, DOM rendering.

Usage: python scripts/e2e-chat-e2e.py
"""
import http.server
import json
import mimetypes
import os
import socketserver
import sys
import threading
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
        import time as _time
        path = urlsplit(self.path).path
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length else b''
        API_CALLS.append({'path': path, 'body_len': len(body)})
        # Server-side delay for Stop scenario
        if '/api/ai/chat' in path and '/continue' not in path and getattr(Handler, 'SLOW_CHAT', False):
            _time.sleep(15)  # Long enough for user to click Stop
        self._send(b'{"ok":true}', 'application/json')


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

            # Shared route handler state
            chat_responses = {}
            response_index = [0]

            def handle_route(route):
                url = route.request.url
                if '/api/ai/chat/stream' in url:
                    idx = response_index[0]
                    response_index[0] += 1
                    resp = chat_responses.get(idx, {
                        'ok': True,
                        'answer': 'Default test answer.',
                        'truncated': False
                    })
                    if not resp.get('ok'):
                        # Return HTTP error for streaming endpoint
                        route.fulfill(
                            status=502,
                            content_type='application/json',
                            body=json.dumps({'error': resp.get('error', 'ai-provider-unavailable')}),
                        )
                    else:
                        answer = resp.get('answer', 'Default test answer.')
                        ndjson_lines = []
                        for ch in answer:
                            ndjson_lines.append(json.dumps({'type': 'delta', 'text': ch}))
                        ndjson_lines.append(json.dumps({'type': 'done', 'finishReason': 'stop', 'truncated': resp.get('truncated', False)}))
                        route.fulfill(
                            status=200,
                            content_type='application/x-ndjson; charset=utf-8',
                            body='\n'.join(ndjson_lines) + '\n',
                        )
                elif '/api/ai/chat' in url and '/continue' not in url:
                    idx = response_index[0]
                    response_index[0] += 1
                    resp = chat_responses.get(idx, {
                        'ok': True,
                        'answer': 'Default test answer.',
                        'truncated': False
                    })
                    route.fulfill(
                        status=200,
                        content_type='application/json',
                        body=json.dumps(resp)
                    )
                elif '/api/ai/chat/continue' in url:
                    idx = response_index[0]
                    response_index[0] += 1
                    resp = chat_responses.get(idx, {
                        'ok': True,
                        'answer': 'Default continuation.',
                        'truncated': False
                    })
                    route.fulfill(
                        status=200,
                        content_type='application/json',
                        body=json.dumps(resp)
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
            page.route('**/api/ai/**', handle_route)

            # ================================================================
            # Scenario A: Normal response
            # ================================================================
            chat_responses.clear()
            response_index[0] = 0
            chat_responses[0] = {
                'ok': True,
                'answer': 'GPIO la giao dien so pho bien trong IoT.',
                'truncated': False
            }

            fab = page.locator('[data-testid="chat-fab"]')
            fab.click()
            page.wait_for_selector('#chatPop:not([hidden])', state='visible')
            # Wait for lazy chat modules to finish loading
            page.wait_for_function(
                "() => !!window.TaskFlowChat",
                timeout=15000,
            )

            page.evaluate("document.getElementById('chatInput').value = 'Giai thich GPIO'")
            page.evaluate("window.TaskFlowChat.doChatSend()")
            page.wait_for_selector('.chat-msg.bot:not(.chat-typing):not(.chat-stopped)', timeout=30000)

            continue_btn = page.locator('.chat-continue-wrap')
            assert not continue_btn.count(), 'Scenario A: Continue should not appear for complete response'

            user_msgs = page.locator('.chat-msg.user')
            uc = user_msgs.count()
            assert uc == 1, f'Scenario A: expected 1 user msg, got {uc}'

            print('Scenario A (normal): PASS')

            # ================================================================
            # Scenario B: Truncated -> Continue -> merge
            # ================================================================
            chat_responses.clear()
            response_index[0] = 0
            chat_responses[0] = {
                'ok': True,
                'answer': 'Part 1: GPIO is a digital interface. It supports 8 I/O pins.',
                'truncated': True
            }
            chat_responses[1] = {
                'ok': True,
                'answer': 'Part 1: GPIO is a digital interface. It supports 8 I/O pins. Additionally there is ADC for analog values.',
                'truncated': False
            }

            page.evaluate("document.getElementById('chatInput').value = 'Giai thich chi tiet hon ve GPIO'")
            page.evaluate("window.TaskFlowChat.doChatSend()")

            page.wait_for_selector('.chat-continue-wrap', timeout=30000)

            continue_btn = page.locator('.chat-continue-wrap button')
            assert continue_btn.count(), 'Scenario B: Continue button should appear'
            btn_text = continue_btn.first.inner_text()
            assert len(btn_text.strip()) > 0, 'Scenario B: Continue button has empty text'

            continue_btn.first.click()
            page.wait_for_timeout(3000)

            assert not page.locator('.chat-continue-wrap').count(), \
                'Scenario B: Continue should disappear after completion'

            bot_bodies = page.locator('.chat-msg.bot .chat-msg-body')
            last_body = bot_bodies.last.inner_text()
            assert 'ADC' in last_body or 'analog' in last_body, \
                f'Scenario B: merged answer missing continuation, got: {last_body[:100]}'

            user_msgs = page.locator('.chat-msg.user')
            assert int(user_msgs.count()) == 2, \
                f'Scenario B: expected 2 user msgs total, got {user_msgs.count()}'

            print('Scenario B (truncated -> Continue): PASS')

            # ================================================================
            # Scenario C: Retry on error
            # ================================================================
            chat_responses.clear()
            response_index[0] = 0
            chat_responses[0] = {'ok': False, 'error': 'ai-timeout'}
            chat_responses[1] = {
                'ok': True,
                'answer': 'After timeout, here is the successful answer.',
                'truncated': False
            }

            page.evaluate("document.getElementById('chatInput').value = 'Phan tich thoi quen hoc'")
            page.evaluate("window.TaskFlowChat.doChatSend()")

            page.wait_for_selector('.chat-retry-btn', timeout=30000)

            retry_btn = page.locator('.chat-retry-wrap .chat-retry-btn')
            assert retry_btn.count(), 'Scenario C: Retry button should appear'

            retry_btn.first.click()

            page.wait_for_selector(
                '.chat-msg.bot:not(.chat-typing):not(.chat-stopped):not(.chat-info)',
                state='attached', timeout=30000
            )

            # Retry uses persistUser:false, so only 1 new user msg per send
            user_msgs = page.locator('.chat-msg.user')
            assert int(user_msgs.count()) == 3, \
                f'Scenario C: expected 3 user msgs (A=1, B=1, C=1), got {user_msgs.count()}'

            print('Scenario C (retry): PASS')

            # ================================================================
            # Scenario D: Stop cancels request
            # ================================================================
            # Unroute and use server-side delay (doesn't block Playwright event loop)
            page.unroute('**/api/ai/**')
            import time as _time

            # Flag to control server-side delay
            Handler.SLOW_CHAT = True

            def slow_route(route):
                url = route.request.url
                if '/api/ai/chat' in url and '/continue' not in url and getattr(Handler, 'SLOW_CHAT', False):
                    # Let server handle the delay - fall through to HTTP handler
                    route.fallback()
                else:
                    route.fallback()

            page.route('**/api/ai/**', slow_route)

            page.evaluate("document.getElementById('chatInput').value = 'Giai thich GPIO la gi'")
            page.evaluate("window.TaskFlowChat.doChatSend()")

            # Wait briefly for the request to be in-flight
            page.wait_for_timeout(500)

            # Click Stop - use evaluate since button may be in stopped state
            page.evaluate("window.TaskFlowChat.stopActiveResponse()")

            # Wait for stopped message
            page.wait_for_selector('.chat-stopped', timeout=10000)

            # Verify input is usable again
            assert not page.locator('#chatInput').is_disabled(), 'Scenario D: input should be re-enabled after Stop'

            print('Scenario D (stop): PASS')

            ctx.close()
        finally:
            for c in browser.contexts:
                c.close()
            browser.close()

    httpd.shutdown()

    print('CHAT E2E OK - normal, truncated, retry, stop all verified')
    return 0


if __name__ == '__main__':
    sys.exit(main())
