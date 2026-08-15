"""TaskFlow offline PWA end-to-end (Chromium, real Service Worker lifecycle).

Reproduces the Vercel cleanUrls environment locally: clean URLs (/app, /privacy,
/terms, /data-and-security) are served with `Content-Disposition: inline;
filename="..."` on their HTML responses — the delivery-only header that made
Chromium reject SW-served offline navigations with ERR_FAILED (root "/" carries
no filename= so it always worked). Verifies, through a real SW:

1. SW registers, installs, activates and controls the page; APP_SHELL precache
   completes (all 5 HTML shells present in the cache).
2. Every first-party route loads online AND offline (network disabled):
   /, /app, /privacy, /terms, /data-and-security, /app?view=today.
3. Content assertions per route (landing hero, #appMain, legal page headings,
   Today view) — not just HTTP-ish success.
4. Header invariant: cached HTML navigation responses carry NO
   Content-Disposition and keep Content-Type text/html.
5. SW upgrade: the OLD cache generation is purged on activate, the current
   generation and taskflow-digest are retained, and offline still works after
   the upgrade.

The upgrade scenario is deterministic: the first /sw.js request served by the
handler is the OLD byte-different script (previous cache generation); after
registration.update() the handler serves the REAL sw.js, forcing a reinstall
and activate purge.

Usage:
  python scripts/e2e-offline.py
"""
import argparse
import http.server
import mimetypes
import os
import re
import socketserver
import sys
import threading
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

SW_PATH = os.path.join(ROOT, 'sw.js')
CLEAN_URLS = {
    '/app': 'app.html',
    '/privacy': 'privacy.html',
    '/terms': 'terms.html',
    '/data-and-security': 'data-and-security.html',
}


def sw_cache_generations():
    real = open(SW_PATH, encoding='utf-8').read()
    gen = int(re.search(r"const CACHE = 'taskflow-v(\d+)'", real).group(1))
    return f'taskflow-v{gen}', f'taskflow-v{gen - 1}'


class Handler(http.server.BaseHTTPRequestHandler):
    SW_COUNT = 0

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

    def serve_sw(self):
        real = open(SW_PATH, 'rb').read()
        current, old = sw_cache_generations()
        Handler.SW_COUNT += 1
        body = real
        if Handler.SW_COUNT == 1:
            # Deterministic upgrade scenario: first served SW is the OLD
            # generation (byte-different) so registration.update() reinstalls.
            body = real.replace(current.encode(), old.encode())
        self._send(body, 'application/javascript', {'Cache-Control': 'no-cache, no-store'})

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/sw.js':
            self.serve_sw()
            return
        if path == '/':
            path = '/index.html'
        if path in CLEAN_URLS:
            path = '/' + CLEAN_URLS[path]
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
        extra = {}
        if fs.endswith('.html') and path != '/index.html':
            # Vercel cleanUrls: inline; filename="<basename>" — the header that
            # breaks offline navigation when served from the SW cache.
            base = os.path.splitext(os.path.basename(fs))[0]
            extra['Content-Disposition'] = 'inline; filename="%s"' % base
        self._send(body, ctype, extra)


def wait_sw_controlled(page, cache_name):
    page.wait_for_function(
        """async (name) => {
          await navigator.serviceWorker.ready;
          return !!navigator.serviceWorker.controller;
        }""",
        arg=cache_name,
    )
    page.wait_for_function(
        """async (name) => {
          const c = await caches.open(name);
          const urls = (await c.keys()).map((r) => new URL(r.url).pathname);
          return ['/index.html', '/app.html', '/privacy.html', '/terms.html',
                  '/data-and-security.html'].every((u) => urls.includes(u));
        }""",
        arg=cache_name,
        timeout=20000,
    )


def offline_matrix(browser, base, errors):
    """Main flow: fresh context, real SW — all routes online then offline."""
    sw_cache, _ = sw_cache_generations()
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    page.add_init_script(
        "localStorage.setItem('planner-onboarded','1'); localStorage.setItem('planner-lang','vi');"
    )
    page.on('pageerror', lambda error: errors.append(f'pageerror: {error}'))

    # 1) Online: first load registers the SW, precaches the shell.
    page.goto(f'{base}/app', wait_until='domcontentloaded')
    page.wait_for_selector('#appMain', state='visible')
    wait_sw_controlled(page, sw_cache)

    # 2) Visit every route online once (controlled) so the navigate handler
    #    caches each exact-URL normalized response; also proves online nav OK.
    for route in ['/', '/privacy', '/terms', '/data-and-security', '/app', '/app?view=today']:
        page.goto(f'{base}{route}', wait_until='domcontentloaded')
        page.wait_for_selector('#appMain' if route.startswith('/app') else 'body', state='visible')

    # 3) Header invariant on the cached shell (Phase 10): the precached
    #    app.html entry must be clean of Content-Disposition, keep text/html.
    headers = page.evaluate(
        """async (name) => {
          const c = await caches.open(name);
          const r = await c.match('/app.html');
          return {
            ct: r.headers.get('content-type'),
            cd: r.headers.get('content-disposition'),
          };
        }""",
        arg=sw_cache,
    )
    if headers.get('cd') is not None:
        errors.append(f'cached app.html still carries Content-Disposition: {headers["cd"]}')
    if not (headers.get('ct') or '').startswith('text/html'):
        errors.append(f'cached app.html lost Content-Type: {headers["ct"]}')

    # 4) Offline matrix (network disabled).
    context.set_offline(True)
    checks = [
        ('/', lambda: page.wait_for_selector('.landing-hero', state='visible')),
        ('/app', lambda: page.wait_for_selector('#appMain', state='visible')),
        ('/privacy', lambda: page.wait_for_selector('h1', state='visible').inner_text()),
        ('/terms', lambda: page.wait_for_selector('h1', state='visible').inner_text()),
        ('/data-and-security', lambda: page.wait_for_selector('h1', state='visible').inner_text()),
        ('/app?view=today', lambda: page.wait_for_selector('[data-testid="today-view"]', state='visible')),
    ]
    expected_text = {
        '/privacy': 'thuộc về bạn',
        '/terms': 'Quy tắc',
        '/data-and-security': 'minh bạch',
    }
    for route, check in checks:
        try:
            page.goto(f'{base}{route}', wait_until='domcontentloaded')
            result = check()
            if route in expected_text:
                text = result if isinstance(result, str) else page.locator('h1').first.inner_text()
                if expected_text[route] not in text:
                    errors.append(f'offline {route}: heading text missing "{expected_text[route]}"')
            if route == '/app?view=today':
                # App's own boot normalizes the URL (appends ?m=YYYY-MM) — the
                # deep link path + view param must survive, not be dropped.
                if not page.url.split('?')[0].endswith('/app') or 'view=today' not in page.url:
                    errors.append(f'offline deep link: URL changed to {page.url}')
                page.wait_for_selector('#appMain', state='visible')
        except Exception as exc:  # navigation failure (ERR_FAILED) or missing content
            errors.append(f'offline {route}: {type(exc).__name__}: {exc}')
    context.set_offline(False)
    context.close()

    if not errors:
        print('offline matrix OK: / /app /privacy /terms /data-and-security /app?view=today')
    return bool(errors)


def upgrade_check(browser, base, errors):
    """SW upgrade: old generation purged on activate, digest + current kept,
    offline still works after the upgrade (Phase 9)."""
    sw_cache, old_cache = sw_cache_generations()
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    page.add_init_script(
        "localStorage.setItem('planner-onboarded','1'); localStorage.setItem('planner-lang','vi');"
    )
    page.on('pageerror', lambda error: errors.append(f'upgrade pageerror: {error}'))

    page.goto(f'{base}/app', wait_until='domcontentloaded')
    page.wait_for_selector('#appMain', state='visible')
    # First /sw.js request served the OLD generation script — wait for its cache.
    page.wait_for_function(
        "async (old) => (await caches.keys()).includes(old)", arg=old_cache, timeout=20000
    )
    # Seed taskflow-digest to prove it survives the purge.
    page.evaluate(
        "async () => { const c = await caches.open('taskflow-digest');"
        " await c.put('./digest.json', new Response('{}')); }"
    )
    # Force update: handler now serves the REAL sw.js → reinstall → activate.
    # Wait for the NEW generation to exist AND the OLD one to be purged.
    page.evaluate("() => navigator.serviceWorker.getRegistration().then((r) => r.update())")
    import time as _time
    _ok = False
    for _i in range(60):
        _snap = page.evaluate(
            "async () => {"
            "  const k = await caches.keys();"
            "  const c = {};"
            "  for (const n of k) { c[n] = (await (await caches.open(n)).keys()).length; }"
            "  return c; }"
        )
        if sw_cache in _snap and old_cache not in _snap:
            _ok = True
            break
        _time.sleep(0.5)
    if not _ok:
        errors.append(f'upgrade: timeout waiting for {sw_cache} to activate and purge {old_cache}')
        context.close()
        return
    keys = page.evaluate("() => caches.keys()")
    for expected in (sw_cache, 'taskflow-digest'):
        if expected not in keys:
            errors.append(f'upgrade: cache {expected} missing after activate ({keys})')
    if old_cache in keys:
        errors.append(f'upgrade: old generation {old_cache} NOT purged ({keys})')

    # Offline still works after upgrade (reload under the new controller first).
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#appMain', state='visible')
    context.set_offline(True)
    try:
        page.goto(f'{base}/app?view=today', wait_until='domcontentloaded')
        page.wait_for_selector('#appMain', state='visible')
        page.wait_for_selector('[data-testid="today-view"]', state='visible')
    except Exception as exc:
        errors.append(f'upgrade offline reload: {type(exc).__name__}: {exc}')
    context.set_offline(False)
    context.close()

    if not errors:
        print(f'upgrade OK: {old_cache} purged, {sw_cache} + taskflow-digest retained, offline OK')


def main():
    parser = argparse.ArgumentParser(description='TaskFlow offline PWA E2E (Chromium)')
    parser.parse_args()

    httpd = socketserver.TCPServer(('127.0.0.1', 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{port}'
    errors = []

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                # Upgrade first: it deterministically consumes /sw.js request #1
                # (old generation); the main matrix then gets the real SW.
                upgrade_check(browser, base, errors)
                offline_matrix(browser, base, errors)
            finally:
                for context in browser.contexts:
                    context.close()
                browser.close()
    finally:
        httpd.shutdown()

    if errors:
        print('OFFLINE PWA FAIL:')
        for error in errors[:12]:
            print(' -', error)
        return 1
    print(f'OFFLINE PWA OK — all first-party routes load offline ({sw_cache_generations()[0]})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
