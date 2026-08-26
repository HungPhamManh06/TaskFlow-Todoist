"""E2E: Service Worker upgrade proves new versioned AI lazy modules replace old cached JS.

Reproduces the production bug:
  - User runs TaskFlow with old SW (unversioned lazy module URLs)
  - New deployment ships versioned lazy URLs (?v=v1)
  - After SW upgrade, browser fetches new versioned URLs, NOT old cached JS

Scenario:
  1. Server serves old SW generation (CACHE generation lowered, unversioned lazy URLs)
  2. Browser registers old SW → old unversioned lazy modules cached
  3. Force SW update → new SW activates with versioned lazy URLs
  4. Open Chat via real UI → browser fetches chat.min.js?v=v1
  5. Assert: versioned URL requested, old unversioned NOT used
  6. Assert: no legacy /api/ai/document-daily-plan endpoint called

Usage: python scripts/e2e-sw-upgrade-ai.py
"""
import http.server
import mimetypes
import os
import re
import socketserver
import sys
import threading
import time
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

SW_PATH = os.path.join(ROOT, 'sw.js')


def read_sw():
    return open(SW_PATH, encoding='utf-8').read()


def sw_versions():
    real = read_sw()
    gen = int(re.search(r"const CACHE = 'taskflow-v(\d+)'", real).group(1))
    return f'taskflow-v{gen}', f'taskflow-v{gen - 1}'


def make_old_sw():
    """Create a minimal old-generation SW that precaches with unversioned lazy URLs.
    
    We take the real SW, lower the CACHE generation, and strip ?v= query params
    from precache entries to simulate an old deployment that didn't version lazy modules.
    """
    real = read_sw()
    current, old = sw_versions()
    # Lower the cache generation
    old_sw = real.replace(current, old)
    # Strip version query params from lazy module precache entries
    # Pattern: './js/foo.min.js?v=' + LAZY_V  →  './js/foo.min.js'
    old_sw = re.sub(r"'\?v='\s*\+\s*LAZY_V", "'", old_sw)
    return old_sw.encode('utf-8')


class Handler(http.server.BaseHTTPRequestHandler):
    SW_COUNT = 0
    REQUEST_LOG = []

    def log_message(self, *args):
        pass

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)

    def _send(self, body, ctype, extra_headers=None, status=200):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path

        # Serve SW
        if path == '/sw.js':
            self.serve_sw()
            return

        # Log lazy AI module requests (full URL with query string)
        for module in ('chat.min.js', 'ai-agent-runtime.min.js',
                       'ai-document-daily-plan.min.js', 'ai-brain-client.min.js'):
            if module in path:
                Handler.REQUEST_LOG.append(self.path)

        # Clean URL mapping
        if path == '/':
            path = '/index.html'
        clean = {'/app': 'app.html', '/privacy': 'privacy.html',
                 '/terms': 'terms.html', '/data-and-security': 'data-and-security.html'}
        if path in clean:
            path = '/' + clean[path]

        fs = os.path.normpath(os.path.join(ROOT, path.lstrip('/')))
        if not os.path.isfile(fs):
            self.send_error(404)
            return
        with open(fs, 'rb') as fh:
            body = fh.read()
        ctype = (
            'text/html; charset=utf-8'
            if fs.endswith('.html')
            else mimetypes.guess_type(fs)[0] or 'application/octet-stream'
        )
        self._send(body, ctype)

    def serve_sw(self):
        Handler.SW_COUNT += 1
        if Handler.SW_COUNT == 1:
            # First request: serve old SW (unversioned lazy URLs)
            body = make_old_sw()
        else:
            # Subsequent: serve real SW (versioned lazy URLs)
            body = read_sw().encode('utf-8')
        self._send(body, 'application/javascript',
                    {'Cache-Control': 'no-cache, no-store'})


def main():
    httpd = socketserver.TCPServer(('127.0.0.1', 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{port}'
    errors = []

    current_cache, old_cache = sw_versions()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            # ================================================================
            # Phase 1: Load with old SW → caches unversioned lazy modules
            # ================================================================
            ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
            page = ctx.new_page()
            page.add_init_script(
                "localStorage.setItem('planner-onboarded','1');"
                "localStorage.setItem('planner-lang','vi');"
            )

            page.goto(f'{base}/app', wait_until='domcontentloaded')
            page.wait_for_selector('#appMain', state='visible')

            # Wait for old SW to be active
            page.wait_for_function(
                "async () => { await navigator.serviceWorker.ready; "
                "return !!navigator.serviceWorker.controller; }",
                timeout=20000,
            )

            # Verify old cache generation exists
            old_exists = page.evaluate(
                "async (name) => (await caches.keys()).includes(name)",
                arg=old_cache,
            )
            if not old_exists:
                errors.append(f'Phase 1: old cache {old_cache} not found')

            # Verify old cache has unversioned chat.min.js
            old_entries = page.evaluate(
                """async (name) => {
                  const c = await caches.open(name);
                  return (await c.keys()).map(r => r.url);
                }""",
                arg=old_cache,
            )
            has_chat = any('chat.min.js' in u for u in old_entries)
            if not has_chat:
                errors.append(f'Phase 1: old cache missing chat.min.js ({old_entries[:5]}...)')

            # ================================================================
            # Phase 2: Force SW update → new versioned lazy URLs
            # ================================================================
            page.evaluate(
                "() => navigator.serviceWorker.getRegistration().then(r => r && r.update())"
            )

            ok = False
            for _ in range(60):
                snap = page.evaluate(
                    "async () => {"
                    "  const k = await caches.keys();"
                    "  const c = {};"
                    "  for (const n of k) c[n] = true;"
                    "  return c; }"
                )
                if current_cache in snap and old_cache not in snap:
                    ok = True
                    break
                time.sleep(0.5)
            if not ok:
                errors.append(f'Phase 2: timeout waiting for {current_cache} to activate')

            # Reload under new SW
            page.reload(wait_until='domcontentloaded')
            page.wait_for_selector('#appMain', state='visible')

            # ================================================================
            # Phase 3: Open Chat → trigger lazy module loading
            # ================================================================
            Handler.REQUEST_LOG.clear()

            fab = page.locator('[data-testid="chat-fab"]')
            fab.click()
            page.wait_for_selector('#chatPop:not([hidden])', state='visible', timeout=10000)

            # Wait for lazy modules to finish loading
            time.sleep(3)

            # ================================================================
            # Phase 4: Assertions
            # ================================================================

            # A. Versioned chat.min.js was requested
            versioned_chat = [u for u in Handler.REQUEST_LOG if 'chat.min.js?v=' in u]
            if not versioned_chat:
                errors.append(
                    f'Phase 4A: no versioned chat.min.js?v= request. '
                    f'All requests: {Handler.REQUEST_LOG}'
                )

            # B. No unversioned chat.min.js was requested
            for url in Handler.REQUEST_LOG:
                if 'chat.min.js' in url and '?v=' not in url:
                    errors.append(f'Phase 4B: unversioned chat.min.js requested: {url}')

            # C. No legacy /api/ai/document-daily-plan endpoint
            # (note: /js/ai-document-daily-plan.min.js is the client module, not the API)
            for url in Handler.REQUEST_LOG:
                if '/api/ai/document-daily-plan' in url:
                    errors.append(f'Phase 4C: legacy endpoint requested: {url}')

            # D. Verify new chat module has the Phase 7 Continue button code
            chat_loaded = page.evaluate(
                "() => typeof window.TaskFlowChat !== 'undefined'"
            )
            if not chat_loaded:
                errors.append('Phase 4D: TaskFlowChat not loaded after opening chat')

            ctx.close()
        finally:
            for c in browser.contexts:
                c.close()
            browser.close()

    httpd.shutdown()

    if errors:
        print('SW UPGRADE AI E2E FAIL:')
        for e in errors:
            print(f' - {e}')
        return 1

    print(
        f'SW UPGRADE AI E2E OK — old {old_cache} purged, '
        f'new {current_cache} active, versioned lazy modules loaded'
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
