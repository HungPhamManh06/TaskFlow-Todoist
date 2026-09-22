#!/usr/bin/env python3
"""Đo app-mobile LCP + Style/Layout trực tiếp từ Lighthouse JSON (không dùng perf-budget.py)."""
import json, subprocess, os, sys

def run():
    import tempfile, pathlib
    tmp = pathlib.Path(tempfile.mkdtemp(prefix='lph_'))
    port = 58000 + (os.getpid() % 1000)        srv = subprocess.Popen(
            [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', 'dist'],
            cwd=str(tmp), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        out = tmp / 'app-mobile.json'
        r = subprocess.run(
            [sys.executable, '-m', 'node_modules.lighthouse.cli', 'www',
             f'http://127.0.0.1:{port}/app?view=today',
             '--output=json', '--output-path', str(out),
             '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage --window-size=390,844 --touch-events=enabled',
             '--quiet', '--form-factor=mobile', '--throttling-method=simulate',
             '--throttling=4g', '--cpu-throttling-rate=4', '--quiet'],
            capture_output=True, text=True, timeout=180)
        if out.exists():
            d = json.loads(out.read_text(encoding='utf-8'))
            audits = d.get('audits', {})
            def g(key):
                a = audits.get(key)
                if not a: return None
                return a.get('displayValue'), a.get('numericValue'), a.get('numericUnit')
            for key in ['largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift',
                        'main-thread-work-breakdown', 'bootup-time', 'network-service-time',
                        'resource-summary-script', 'resource-summary-style', 'resource-summary-font',
                        'resource-summary-image', 'resource-summary-other']:
                rec = g(key)
                if rec is None: continue
                dv, nv, nu = rec
                line = f'{key:40s} | {dv} ({nv} {nu})' if nv is not None else f'{key:40s} | {dv}'
                print(line)
            # Style & Layout ms
            mt = audits.get('main-thread-work-breakdown', {}).get('details', {}).get('items', [])
            style = sum(x.get('numericValue', 0) for x in mt if x.get('label','').lower().startswith('style'))
            layout = sum(x.get('numericValue', 0) for x in mt if x.get('label','').lower().startswith('layout'))
            print(f'{"Style (main-thread) ms":40s} | {style}')
            print(f'{"Layout (main-thread) ms":40s} | {layout}')
            print(f'{"Style + Layout ms":40s} | {style + layout}')
        else:
            print('Lighthouse chua tao JSON:')
            print(r.stderr[-800:])
    finally:
        srv.terminate(); srv.wait(timeout=5)
    return 0

if __name__ == '__main__':
    sys.exit(run())
